import { query } from "./postgres.js";
import { sendFcmToTokens } from "./fcm.js";

const TZ = "Asia/Riyadh";

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS km_daily_notifications (
      id BIGSERIAL PRIMARY KEY,
      vehicle_id BIGINT NOT NULL,
      driver_name TEXT,
      driver_phone TEXT,
      driver_user_id BIGINT,
      reminder_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      first_detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_checked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      driver_notified_at TIMESTAMPTZ,
      owner_notified_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      UNIQUE(vehicle_id, reminder_date)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_km_daily_notifications_status_date
    ON km_daily_notifications(status, reminder_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_km_daily_notifications_vehicle_date
    ON km_daily_notifications(vehicle_id, reminder_date)`);
}

function phoneDigits(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

async function getTodayState() {
  const result = await query(`
    SELECT
      (CURRENT_TIMESTAMP AT TIME ZONE '${TZ}')::date AS today,
      EXTRACT(HOUR FROM (CURRENT_TIMESTAMP AT TIME ZONE '${TZ}'))::int AS hour,
      EXTRACT(MINUTE FROM (CURRENT_TIMESTAMP AT TIME ZONE '${TZ}'))::int AS minute
  `);
  return result.rows[0];
}

async function getOwnerTokens() {
  const result = await query(`
    SELECT DISTINCT pt.token
    FROM push_tokens pt
    JOIN users u ON u.id = pt.user_id
    WHERE u.is_active = 1
      AND u.role = 'Owner'
  `);
  return result.rows.map(r => r.token).filter(Boolean);
}

async function getDriverUserId(driverPhone, driverName) {
  const phone = phoneDigits(driverPhone);
  if (!phone) return null;

  const result = await query(`
    SELECT u.id
    FROM users u
    WHERE u.is_active = 1
      AND u.role = 'Driver'
      AND regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') = $1
    ORDER BY u.id
    LIMIT 1
  `, [phone]);

  return result.rows[0]?.id || null;
}

async function getDriverTokens(userId) {
  if (!userId) return [];
  const result = await query(
    `SELECT DISTINCT token FROM push_tokens WHERE user_id = $1 ORDER BY token`,
    [userId]
  );
  return result.rows.map(r => r.token).filter(Boolean);
}

async function sendDriverReminder(record) {
  if (!record.driver_user_id) {
    return { sent: 0, reason: "Driver ERP user not matched by phone." };
  }

  const tokens = await getDriverTokens(record.driver_user_id);
  if (!tokens.length) {
    return { sent: 0, reason: "Driver has no registered push token." };
  }

  const result = await sendFcmToTokens({
    tokens,
    title: "🚨 Daily KM Reading Required",
    body: `Vehicle ${record.vehicle_plate || "assigned to you"} — current odometer: ${Number(record.current_km || 0).toLocaleString()} km — no KM reading entered by 07:00. Please open Fleet ERP and enter today's odometer reading.`,
    data: {
      type: "daily_km_missing",
      icon: "🚨",
      tab: "fleet-maintenance",
      url: "/",
      notification_id: String(record.id)
    }
  });

  return { sent: result.sent || 0, failed: result.failed || 0 };
}

export async function reconcileAndNotify() {
  await ensureTable();
  const state = await getTodayState();
  const today = state.today;

  // The daily deadline is 07:00 Asia/Riyadh. Before 07:00, no vehicle is
  // considered late and no daily KM warning is created or sent.
  if (Number(state.hour || 0) < 7) {
    return { today, open: 0, resolved: 0, records: [], beforeCutoff: true };
  }

  // Reconcile every active vehicle against today's real ERP KM timestamp.
  // Google Sheet values never resolve this record.
  const vehicles = await query(`
    SELECT
      v.id AS vehicle_id,
      CONCAT(v.plate_number, ' ', COALESCE(v.plate_code, '')) AS vehicle_plate,
      COALESCE(NULLIF(TRIM(d.name), ''), NULLIF(TRIM(v.driver), ''), '') AS driver_name,
      COALESCE(NULLIF(TRIM(d.phone), ''), NULLIF(TRIM(v.phone), ''), '') AS driver_phone,
      v.meter_updated_at,
      v.current_km
    FROM vehicles v
    LEFT JOIN drivers d ON d.vehicle_id = v.id
    WHERE COALESCE(LOWER(TRIM(v.status)), '') NOT IN ('inactive', 'sold', 'disposed', 'disabled')
    ORDER BY v.plate_number, v.plate_code
  `);

  const due = [];
  let resolved = 0;

  for (const v of vehicles.rows) {
    const updatedDateResult = v.meter_updated_at
      ? await query(`SELECT (NULLIF(TRIM($1::text), '')::timestamptz AT TIME ZONE '${TZ}')::date AS reading_date`, [v.meter_updated_at])
      : { rows: [{ reading_date: null }] };

    const readingDate = updatedDateResult.rows[0]?.reading_date;
    const missing = readingDate !== today;

    if (!missing) {
      const closed = await query(`
        UPDATE km_daily_notifications
        SET status = 'Resolved', resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP), last_checked_at = CURRENT_TIMESTAMP
        WHERE vehicle_id = $1 AND reminder_date = $2 AND status = 'Open'
        RETURNING id
      `, [v.vehicle_id, today]);
      resolved += closed.rowCount;
      continue;
    }

    const driverUserId = await getDriverUserId(v.driver_phone, v.driver_name);

    const upsert = await query(`
      INSERT INTO km_daily_notifications
        (vehicle_id, driver_name, driver_phone, driver_user_id, reminder_date, status, last_checked_at)
      VALUES ($1, $2, $3, $4, $5, 'Open', CURRENT_TIMESTAMP)
      ON CONFLICT (vehicle_id, reminder_date)
      DO UPDATE SET
        driver_name = EXCLUDED.driver_name,
        driver_phone = EXCLUDED.driver_phone,
        driver_user_id = EXCLUDED.driver_user_id,
        status = CASE
          WHEN km_daily_notifications.status = 'Resolved' THEN 'Open'
          ELSE km_daily_notifications.status
        END,
        last_checked_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [v.vehicle_id, v.driver_name, v.driver_phone, driverUserId, today]);

    due.push({
      ...upsert.rows[0],
      vehicle_plate: v.vehicle_plate,
      current_km: Number(v.current_km || 0)
    });
  }

  // Send one push per missing driver, once per daily record.
  for (const record of due) {
    if (record.driver_notified_at) continue;

    try {
      const sendResult = await sendDriverReminder(record);
      if (sendResult.sent > 0) {
        await query(
          `UPDATE km_daily_notifications
           SET driver_notified_at = CURRENT_TIMESTAMP, last_checked_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [record.id]
        );
      }
    } catch (error) {
      console.error("[KMDailyPush] driver notification failed:", record.vehicle_id, error.message);
    }
  }

  // One consolidated Owner notification for today's missing KM records.
  const openToday = await query(`
    SELECT
      n.id,
      n.vehicle_id,
      n.driver_name,
      n.driver_phone,
      CONCAT(v.plate_number, ' ', COALESCE(v.plate_code, '')) AS vehicle_plate,
      v.current_km,
      n.owner_notified_at
    FROM km_daily_notifications n
    JOIN vehicles v ON v.id = n.vehicle_id
    WHERE n.reminder_date = $1 AND n.status = 'Open'
    ORDER BY v.plate_number, v.plate_code
  `, [today]);

  const ownerNeedsNotice = openToday.rows.some(r => !r.owner_notified_at);
  if (ownerNeedsNotice && openToday.rows.length) {
    try {
      const tokens = await getOwnerTokens();
      if (!tokens.length) {
        console.warn("[KMDailyPush] owner notification skipped: primary Owner has no registered push token.");
      } else {
        const preview = openToday.rows
          .slice(0, 5)
          .map(r => `${r.vehicle_plate} — Driver: ${r.driver_name || "Unassigned"} — Phone: ${r.driver_phone || "No phone"} — Current KM: ${Number(r.current_km || 0).toLocaleString()}`)
          .join("; ");
        const extra = openToday.rows.length > 5 ? ` +${openToday.rows.length - 5} more` : "";
        const sendResult = await sendFcmToTokens({
          tokens,
          title: "🚨 Daily KM Compliance",
          body: `${openToday.rows.length} vehicle(s) have no KM reading by 07:00: ${preview}${extra}`,
          data: {
            type: "daily_km_summary",
            icon: "🚨",
            tab: "fleet-maintenance",
            url: "/"
          }
        });

        console.log("[KMDailyPush] owner delivery:", JSON.stringify({
          vehicles: openToday.rows.length,
          tokens: tokens.length,
          sent: sendResult.sent || 0,
          failed: sendResult.failed || 0
        }));

        if (sendResult.sent > 0) {
          await query(
            `UPDATE km_daily_notifications
             SET owner_notified_at = CURRENT_TIMESTAMP
             WHERE id = ANY($1::bigint[])`,
            [openToday.rows.map(r => r.id)]
          );
        }
      }
    } catch (error) {
      console.error("[KMDailyPush] owner notification failed:", error.message);
    }
  }

  return {
    today,
    open: openToday.rows.length,
    resolved,
    records: openToday.rows
  };
}

export async function getKmDailyNotifications() {
  await ensureTable();
  const state = await getTodayState();
  const today = state.today;

  if (Number(state.hour || 0) < 7) {
    return { today, count: 0, records: [], beforeCutoff: true };
  }

  const result = await query(`
    SELECT
      n.id,
      n.vehicle_id,
      CONCAT(v.plate_number, ' ', COALESCE(v.plate_code, '')) AS vehicle_plate,
      n.driver_name,
      n.driver_phone,
      n.driver_user_id,
      n.reminder_date,
      n.status,
      v.current_km,
      n.first_detected_at,
      n.last_checked_at,
      n.driver_notified_at,
      n.owner_notified_at
    FROM km_daily_notifications n
    JOIN vehicles v ON v.id = n.vehicle_id
    WHERE n.reminder_date = $1
      AND n.status = 'Open'
    ORDER BY v.plate_number, v.plate_code
  `, [today]);

  return {
    today,
    count: result.rows.length,
    records: result.rows
  };
}
 
export async function getDriverDailyKmStatus(userId) {
  const userResult = await query(`
    SELECT id, role, phone, full_name, username
    FROM users
    WHERE id = $1
    LIMIT 1
  `, [userId]);

  const user = userResult.rows[0];
  if (!user || user.role !== 'Driver') {
    return { required: false, reason: 'not_driver' };
  }

  const phone = phoneDigits(user.phone);
  const name = String(user.full_name || user.username || '').trim();

  const vehicleResult = await query(`
    SELECT
      v.id,
      CONCAT(v.plate_number, ' ', COALESCE(v.plate_code, '')) AS plate,
      v.current_km,
      v.meter_updated_at,
      d.name AS driver_name,
      d.phone AS driver_phone
    FROM vehicles v
    JOIN drivers d ON d.vehicle_id = v.id
    WHERE
      (
        ($1 <> '' AND regexp_replace(COALESCE(d.phone, ''), '[^0-9]', '', 'g') = $1)
        OR ($2 <> '' AND LOWER(TRIM(d.name)) = LOWER(TRIM($2)))
      )
      AND COALESCE(LOWER(TRIM(v.status)), '') NOT IN ('inactive', 'sold', 'disposed', 'disabled')
    ORDER BY v.id
    LIMIT 1
  `, [phone, name]);

  const vehicle = vehicleResult.rows[0];
  if (!vehicle) {
    return { required: false, reason: 'vehicle_not_assigned' };
  }

  const todayResult = await query(`
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date AS today
  `);
  const today = todayResult.rows[0].today;

  const readingResult = await query(`
    SELECT id, reading_km, reading_date
    FROM km_records
    WHERE vehicle_id = $1
      AND reading_date::date = $2::date
    ORDER BY id DESC
    LIMIT 1
  `, [vehicle.id, today]);

  const hasTodayReading = readingResult.rows.length > 0;

  return {
    required: !hasTodayReading,
    today,
    vehicle: {
      id: vehicle.id,
      plate: vehicle.plate,
      currentKm: Number(vehicle.current_km || 0),
      meterUpdatedAt: vehicle.meter_updated_at
    },
    reading: readingResult.rows[0] || null
  };
}

export async function startKmDailyNotificationService() {
  try {
    console.log("[KMDailyPush]", JSON.stringify(await reconcileAndNotify()));
  } catch (error) {
    console.error("[KMDailyPush] startup error:", error.message);
  }

  return reconcileAndNotify;
}

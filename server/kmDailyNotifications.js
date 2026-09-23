import { query, transaction } from "./postgres.js";
import { sendFcmToTokens } from "./fcm.js";
import { ensurePeriodicMaintenanceSchema } from "./database-pg.js";

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
      (CURRENT_TIMESTAMP AT TIME ZONE '${TZ}')::date::text AS today,
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

async function ensureDailyKmTicket(record, today) {
  const marker = `DAILY_KM_MISSING|vehicle=${record.vehicle_id}|date=${today}`;

  // A Daily KM ticket is strictly one ticket per vehicle per Riyadh day.
  // Keep an existing ticket regardless of status so a manually/system-closed
  // ticket is never recreated later the same day.
  // The transaction + advisory lock also prevents duplicates when two service
  // runs reach the same vehicle concurrently.
  return transaction(async (client) => {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [marker]
    );

    const existing = await client.query(`
      SELECT id, status
      FROM tickets
      WHERE vehicle_id = $1
        AND category = 'Daily KM'
        AND description LIKE $2
      ORDER BY id DESC
      LIMIT 1
    `, [record.vehicle_id, `%${marker}%`]);

    if (existing.rows[0]) return existing.rows[0];

    const result = await client.query(`
      INSERT INTO tickets
        (vehicle_id, title, location, category, priority, status,
         description, reported_by, opened_at, department)
      VALUES
        ($1, $2, $3, 'Daily KM', 'High', 'Open', $4, $5,
         CURRENT_TIMESTAMP, 'Fleet')
      RETURNING id, status
    `, [
      record.vehicle_id,
      `Daily KM Missing — ${record.vehicle_plate || "Vehicle"}`,
      record.location || "",
      `Hello ${record.driver_name || "Driver"},

No KM reading recorded today for vehicle ${record.vehicle_plate || "Vehicle"}.
Last reading: ${Number(record.current_km || 0).toLocaleString()} km.

Please record before 7:00 AM.

Thank you,
Fleet Management

---
${marker}`,
      record.driver_name || "System"
    ]);

    return result.rows[0];
  });
}

async function closeDailyKmTicket(vehicleId, today, resolutionNotes = "") {
  // Close every still-open Daily KM ticket for this vehicle. Older tickets
  // may not contain the legacy DAILY_KM_MISSING marker, so marker matching
  // must never be required for resolution after a valid today's reading.
  const result = await query(`
    UPDATE tickets
    SET status = 'Closed',
        closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
        closed_by = COALESCE(closed_by, 'System'),
        resolution_notes = CASE
          WHEN COALESCE(resolution_notes, '') = '' THEN $2
          ELSE resolution_notes
        END
    WHERE vehicle_id = $1
      AND category = 'Daily KM'
      AND status <> 'Closed'
    RETURNING id
  `, [vehicleId, resolutionNotes]);

  return result.rowCount || 0;
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

// ============================================================
// MAINTENANCE DUE CHECK
// ============================================================

async function ensureMaintenanceTicket(record, reason) {
  const marker = `MAINTENANCE_DUE|vehicle=${record.vehicle_id}|type=${record.type}|reason=${reason}`;

  const existing = await query(`
    SELECT id, status FROM tickets
    WHERE vehicle_id = $1 AND category = 'Maintenance'
      AND description LIKE $2 AND status IN ('Open', 'Acknowledged')
    ORDER BY id DESC LIMIT 1
  `, [record.vehicle_id, `%${marker}%`]);

  if (existing.rows[0]) return existing.rows[0];

  const reasonText = reason === "OVERDUE" ? "is overdue" : "is due soon";
  const dueInfo = record.next_due_km
    ? `Due at: ${Number(record.next_due_km).toLocaleString()} km\nCurrent: ${Number(record.current_km).toLocaleString()} km`
    : `Due date: ${record.scheduled_date}`;

  const result = await query(`
    INSERT INTO tickets
      (vehicle_id, title, location, category, priority, status,
       description, reported_by, opened_at, department)
    VALUES
      ($1, $2, $3, 'Maintenance', $4, 'Open', $5, 'System',
       CURRENT_TIMESTAMP, 'Fleet')
    RETURNING id, status
  `, [
    record.vehicle_id,
    `Maintenance ${reason === "OVERDUE" ? "Overdue" : "Due Soon"} — ${record.vehicle_plate || "Vehicle"}`,
    record.location || "",
    reason === "OVERDUE" ? "High" : "Medium",
    `${marker}
Hello ${record.driver_name || "Driver"},

Vehicle ${record.vehicle_plate || "Vehicle"} requires ${record.type_label || record.type}.
${dueInfo}

Please visit the workshop.

Thank you,
Fleet Management`
  ]);

  return result.rows[0];
}

export async function checkMaintenanceDue() {
  await ensurePeriodicMaintenanceSchema();

  const today = new Date().toISOString().slice(0, 10);

  const rows = await query(`
    SELECT
      pm.id AS pm_id,
      pm.vehicle_id,
      pm.type,
      pm.scheduled_date,
      pm.next_due_km,
      pm.interval_km,
      pm.interval_days,
      pm.last_service_km,
      pm.last_service_date,
      pm.notification_sent_at,
      v.plate_number,
      v.plate_code,
      v.driver AS driver_name,
      v.phone AS driver_phone,
      v.current_km,
      v.location
    FROM periodic_maintenance pm
    JOIN vehicles v ON v.id = pm.vehicle_id
    WHERE pm.status = 'Pending'
    ORDER BY v.plate_number, v.plate_code
  `);

  const results = { checked: 0, dueSoon: 0, overdue: 0, ticketsCreated: 0 };

  for (const row of rows.rows) {
    results.checked += 1;

    const vehicle_plate = [row.plate_number, row.plate_code].filter(Boolean).join(" ").trim();
    const current_km = Number(row.current_km || 0);
    const next_due_km = row.next_due_km ? Number(row.next_due_km) : null;
    const scheduled_date = row.scheduled_date ? String(row.scheduled_date).slice(0, 10) : null;

    let reason = null;

    // Check by km (for oil_change)
    if (next_due_km && current_km > 0) {
      if (current_km >= next_due_km) {
        reason = "OVERDUE";
      } else if (current_km >= next_due_km - 500) {
        reason = "DUE_SOON";
      }
    }

    // Check by date (for 6_months_general, inspection)
    if (!reason && scheduled_date) {
      const dueDate = new Date(scheduled_date);
      const todayDate = new Date(today);
      const diffDays = Math.floor((dueDate - todayDate) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        reason = "OVERDUE";
      } else if (diffDays <= 7) {
        reason = "DUE_SOON";
      }
    }

    if (!reason) continue;

    if (reason === "OVERDUE") results.overdue += 1;
    else results.dueSoon += 1;

    // Skip if already notified recently (within 24 hours)
    if (row.notification_sent_at) {
      const lastSent = new Date(row.notification_sent_at).getTime();
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      if (lastSent > dayAgo) continue;
    }

    const typeLabels = {
      oil_change: "Oil Change",
      "6_months_general": "General Maintenance",
      inspection: "Periodic Inspection"
    };

    const record = {
      vehicle_id: row.vehicle_id,
      vehicle_plate,
      driver_name: row.driver_name,
      driver_phone: row.driver_phone,
      current_km,
      next_due_km,
      scheduled_date,
      type: row.type,
      type_label: typeLabels[row.type] || row.type,
      location: row.location
    };

    try {
      await ensureMaintenanceTicket(record, reason);
      results.ticketsCreated += 1;

      await query(
        `UPDATE periodic_maintenance
         SET notification_sent_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [row.pm_id]
      );
    } catch (err) {
      console.error(`[MaintenanceCheck] ticket failed for vehicle ${row.vehicle_id}:`, err.message);
    }
  }

  return results;
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
      COALESCE(NULLIF(TRIM(v.driver), ''), '') AS driver_name,
      COALESCE(NULLIF(TRIM(v.phone), ''), '') AS driver_phone,
      v.meter_updated_at,
      v.current_km
    FROM vehicles v
    WHERE COALESCE(LOWER(TRIM(v.status)), '') NOT IN ('inactive', 'sold', 'disposed', 'disabled')
      AND COALESCE(NULLIF(TRIM(v.driver), ''), '') <> ''
      AND LOWER(TRIM(v.driver)) <> 'unassigned'
    ORDER BY v.plate_number, v.plate_code
  `);

  const due = [];
  let resolved = 0;

  // Close any legacy Daily KM records/cards for vehicles that are no longer
  // assigned to a real driver. The records are retained; they are simply
  // marked resolved because Daily KM compliance does not apply to unassigned vehicles.
  const unassigned = await query(`
    SELECT v.id AS vehicle_id
    FROM vehicles v
    WHERE COALESCE(LOWER(TRIM(v.status)), '') NOT IN ('inactive', 'sold', 'disposed', 'disabled')
      AND (
        COALESCE(NULLIF(TRIM(v.driver), ''), '') = ''
        OR LOWER(TRIM(v.driver)) = 'unassigned'
      )
  `);

  for (const row of unassigned.rows) {
    const closed = await query(`
      UPDATE km_daily_notifications
      SET status = 'Resolved',
          resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP),
          last_checked_at = CURRENT_TIMESTAMP
      WHERE vehicle_id = $1 AND reminder_date = $2 AND status = 'Open'
      RETURNING id
    `, [row.vehicle_id, today]);
    resolved += closed.rowCount;

    try {
      await closeDailyKmTicket(
        row.vehicle_id,
        today,
        'Daily KM requirement closed automatically because the vehicle has no assigned driver.'
      );
    } catch (error) {
      console.error("[KMDailyCard] unassigned ticket closure failed:", row.vehicle_id, error.message);
    }
  }

  for (const v of vehicles.rows) {
    // Source of truth for Daily KM compliance is the ERP database reading
    // saved in km_records for this vehicle and Riyadh calendar date.
    // Do NOT use vehicles.meter_updated_at to decide Submitted/Missing.
    const readingResult = await query(
      `SELECT id, reading_km, reading_date
       FROM km_records
       WHERE vehicle_id = $1
         AND reading_date::date = $2::date
       ORDER BY id DESC
       LIMIT 1`,
      [v.vehicle_id, today]
    );

    const hasTodayReading = readingResult.rows.length > 0;
    const missing = !hasTodayReading;

    if (!missing) {
      const closed = await query(`
        UPDATE km_daily_notifications
        SET status = 'Resolved', resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP), last_checked_at = CURRENT_TIMESTAMP
        WHERE vehicle_id = $1 AND reminder_date = $2 AND status = 'Open'
        RETURNING id
      `, [v.vehicle_id, today]);
      resolved += closed.rowCount;

      try {
        await closeDailyKmTicket(
          v.vehicle_id,
          today,
          `Today's KM reading was entered. Current KM: ${Number(v.current_km || 0).toLocaleString()}.`
        );
      } catch (error) {
        console.error("[KMDailyCard] ticket closure failed:", v.vehicle_id, error.message);
      }

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

    const dailyRecord = {
      ...upsert.rows[0],
      vehicle_plate: v.vehicle_plate,
      current_km: Number(v.current_km || 0),
      location: v.location || ""
    };

    try {
      await ensureDailyKmTicket(dailyRecord, today);
    } catch (error) {
      console.error("[KMDailyCard] ticket creation failed:", v.vehicle_id, error.message);
    }

    due.push(dailyRecord);
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
          failed: sendResult.failed || 0,
          cleaned: sendResult.cleaned || 0,
          errors: sendResult.errors || []
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
      AND COALESCE(NULLIF(TRIM(v.driver), ''), '') <> ''
      AND LOWER(TRIM(v.driver)) <> 'unassigned'
    ORDER BY v.plate_number, v.plate_code
  `, [today]);

  return {
    today,
    count: result.rows.length,
    records: result.rows
  };
}
 

export async function getDailyKmReport(requestedDate = null) {
  // ERP-only Daily KM report. Google Sheet is intentionally not consulted.
  const dateResult = await query(`
    SELECT COALESCE(
      NULLIF(TRIM($1), ''),
      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date::text
    )::date::text AS report_date
  `, [requestedDate]);
  const reportDate = dateResult.rows[0].report_date;

  // Fleet population comes from vehicles; compliance comes only from km_records.
  const result = await query(`
    SELECT
      v.id AS vehicle_id,
      CONCAT(v.plate_number, ' ', COALESCE(v.plate_code, '')) AS vehicle_plate,
      COALESCE(NULLIF(TRIM(v.driver), ''), '') AS driver_name,
      COALESCE(NULLIF(TRIM(v.phone), ''), '') AS driver_phone,
      v.current_km,
      v.location,
      kr.id AS reading_id,
      kr.reading_km,
      kr.reading_date,
      CASE WHEN kr.id IS NULL THEN 'Missing' ELSE 'Submitted' END AS status
    FROM vehicles v
    LEFT JOIN LATERAL (
      SELECT id, reading_km, reading_date
      FROM km_records
      WHERE vehicle_id = v.id
        AND reading_date::date = $1::date
      ORDER BY id DESC
      LIMIT 1
    ) kr ON TRUE
    WHERE COALESCE(LOWER(TRIM(v.status)), '') NOT IN
      ('inactive', 'sold', 'disposed', 'disabled')
    ORDER BY
      CASE WHEN kr.id IS NULL THEN 1 ELSE 0 END,
      v.plate_number,
      v.plate_code
  `, [reportDate]);

  const records = result.rows.map(r => ({
    vehicleId: Number(r.vehicle_id),
    vehiclePlate: r.vehicle_plate,
    driverName: r.driver_name,
    driverPhone: r.driver_phone,
    currentKm: Number(r.current_km || 0),
    location: r.location || '',
    readingId: r.reading_id ? Number(r.reading_id) : null,
    readingKm: r.reading_km == null ? null : Number(r.reading_km),
    readingDate: r.reading_date || null,
    status: r.status
  }));

  const submitted = records.filter(r => r.status === 'Submitted');
  const missing = records.filter(r => r.status === 'Missing');

  return {
    success: true,
    source: 'ERP PostgreSQL km_records',
    googleSheetUsed: false,
    date: reportDate,
    fleetCount: records.length,
    submittedCount: submitted.length,
    missingCount: missing.length,
    submissionRate: records.length ? (submitted.length / records.length) * 100 : 0,
    submitted,
    missing,
    records
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
      v.driver AS driver_name,
      v.phone AS driver_phone
    FROM vehicles v
    WHERE
      (
        ($1 <> '' AND regexp_replace(COALESCE(v.phone, ''), '[^0-9]', '', 'g') = $1)
        OR ($2 <> '' AND LOWER(TRIM(v.driver)) = LOWER(TRIM($2)))
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
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date::text AS today
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

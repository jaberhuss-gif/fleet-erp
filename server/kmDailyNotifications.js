import { query, transaction } from "./postgres.js";
import { sendFcmToTokens } from "./fcm.js";
import { sendDailyKmReminderWhatsApp } from "./whatsapp.js";
import { toStoredPhone } from "./phone.js";
import { ensurePeriodicMaintenanceSchema } from "./database-pg.js";
import {
  DAILY_KM_TZ,
  DAILY_KM_CUTOFF_HOUR,
  getRiyadhState,
  getDailyKmStatus,
  closeDailyKmTickets,
  ensureDailyKmTicket,
  closeStaleDailyKmTickets
} from "./dailyKm.js";

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

// Match a driver record to an ERP user by phone regardless of the stored format.
// `0509145107` and `509145107` are the same person, so comparing raw digit strings
// would fail to match a driver whose number was entered without the leading zero.
function phoneMatchKey(value) {
  return toStoredPhone(value).replace(/[^0-9]/g, "");
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

async function getDriverUserId(driverPhone) {
  const phone = phoneMatchKey(driverPhone);
  if (!phone) return null;

  // Compare on the normalised key so a stored `509145107` still matches a user row
  // holding `0509145107`, and vice versa.
  const result = await query(`
    SELECT u.id, u.phone
    FROM users u
    WHERE u.is_active = 1
      AND u.role = 'Driver'
      AND regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') <> ''
  `);

  const match = result.rows.find((r) => phoneMatchKey(r.phone) === phone);
  return match?.id || null;
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
  // FCM and WhatsApp are complementary, not alternatives: a driver with the app installed
  // gets a push, and one without it still gets a WhatsApp message. Either channel being
  // unavailable must not suppress the other.
  const result = { sent: 0, failed: 0, channels: {} };

  if (record.driver_user_id) {
    const tokens = await getDriverTokens(record.driver_user_id);
    if (tokens.length) {
      try {
        const push = await sendFcmToTokens({
          tokens,
          title: "🚨 Daily KM Reading Required",
          body: `Vehicle ${record.vehicle_plate || "assigned to you"} — current odometer: ${Number(record.current_km || 0).toLocaleString()} km — no KM reading entered by 07:00. Please open Fleet ERP and enter today's odometer reading.`,
          data: {
            type: "daily_km_missing",
            icon: "🚨",
            tab: "fleet",
            url: "/",
            notification_id: String(record.id)
          }
        });
        result.sent += push.sent || 0;
        result.failed += push.failed || 0;
        result.channels.push = push;
      } catch (error) {
        result.channels.push = { sent: 0, error: error.message };
      }
    } else {
      result.channels.push = { sent: 0, reason: "Driver has no registered push token." };
    }
  } else {
    result.channels.push = { sent: 0, reason: "Driver ERP user not matched by phone." };
  }

  // WhatsApp is sent automatically on the same schedule as the push; there is no
  // button to press. When the Cloud API is not configured the attempt is recorded
  // as a no-op so the missing driver is still visible in the logs.
  try {
    if (record.driver_phone) {
      const wa = await sendDailyKmReminderWhatsApp({
        driverName: record.driver_name,
        phone: record.driver_phone,
        plate: record.vehicle_plate,
        currentKm: record.current_km
      });
      result.channels.whatsapp = wa;
      if (wa.sent) result.sent += 1;
    } else {
      result.channels.whatsapp = { sent: false, reason: "Driver has no phone number." };
    }
  } catch (error) {
    result.channels.whatsapp = { sent: false, error: error.message };
    console.error("[WhatsApp] daily KM reminder failed:", record.vehicle_plate, error.message);
  }

  return result;
}

// ============================================================
// MAINTENANCE DUE CHECK
// ============================================================

// A maintenance ticket is tied to a specific due event (vehicle + type + due
// threshold). The threshold only changes when the maintenance record is
// serviced/advanced, so the same unresolved event never produces a second
// ticket, and a short cooldown after closing prevents an endless
// create -> close -> recreate loop.
const MAINTENANCE_RECREATE_COOLDOWN_HOURS = 72;

function maintenanceMarker(record, reason) {
  const threshold = record.next_due_km
    ? `km=${Number(record.next_due_km)}`
    : `date=${record.scheduled_date || "unknown"}`;
  return `MAINTENANCE_DUE|vehicle=${record.vehicle_id}|type=${record.type}|${threshold}|reason=${reason}`;
}

async function ensureMaintenanceTicket(record, reason) {
  const marker = maintenanceMarker(record, reason);

  return transaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [marker]);

    const existing = await client.query(`
      SELECT id, status, closed_at
      FROM tickets
      WHERE vehicle_id = $1
        AND category = 'Maintenance'
        AND description LIKE $2
      ORDER BY id DESC
      LIMIT 1
    `, [record.vehicle_id, `%${marker}%`]);

    const previous = existing.rows[0];
    if (previous) {
      if (String(previous.status) !== "Closed") return previous;

      if (!previous.closed_at) return previous;

      const closedAt = new Date(previous.closed_at).getTime();
      const cooldownMs = MAINTENANCE_RECREATE_COOLDOWN_HOURS * 60 * 60 * 1000;
      if (Date.now() - closedAt < cooldownMs) return previous;
    }

    const dueInfo = record.next_due_km
      ? `Due at: ${Number(record.next_due_km).toLocaleString()} km\nCurrent: ${Number(record.current_km).toLocaleString()} km`
      : `Due date: ${record.scheduled_date}`;

    const result = await client.query(`
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
  });
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

    if (next_due_km && current_km > 0) {
      if (current_km >= next_due_km) {
        reason = "OVERDUE";
      } else if (current_km >= next_due_km - 500) {
        reason = "DUE_SOON";
      }
    }

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

    // Skip if already notified recently (within 24 hours).
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
      const ticket = await ensureMaintenanceTicket(record, reason);
      if (ticket) results.ticketsCreated += 1;

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

// ============================================================
// DAILY KM RECONCILIATION
// ============================================================

// Reconcile Daily KM compliance for the current Riyadh day against the single
// authoritative calculation in dailyKm.js. Google Sheet data never resolves or
// creates compliance records.
export async function reconcileAndNotify() {
  await ensureTable();

  const state = await getRiyadhState();
  const today = state.today;

  // The daily deadline is 07:00 Asia/Riyadh. Before 07:00 no vehicle is late
  // and no missing ticket or notification is created.
  if (state.beforeCutoff) {
    return { today, open: 0, resolved: 0, records: [], beforeCutoff: true };
  }

  const compliance = await getDailyKmStatus(today);

  // Retire tickets left over from previous days so they cannot accumulate.
  const staleClosed = await closeStaleDailyKmTickets(today);

  let resolved = 0;

  for (const vehicle of compliance.records) {
    if (!vehicle.vehicleId) continue;

    if (vehicle.status === "Submitted") {
      const closedCount = await closeDailyKmTickets(
        vehicle.vehicleId,
        `${vehicle.vehiclePlate} recorded today's KM reading.`
      );
      if (closedCount > 0) resolved += closedCount;

      await query(`
        UPDATE km_daily_notifications
        SET status = 'Resolved',
            resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP),
            last_checked_at = CURRENT_TIMESTAMP
        WHERE vehicle_id = $1 AND reminder_date = $2 AND status = 'Open'
      `, [vehicle.vehicleId, today]);

      continue;
    }

    if (!vehicle.driverName) continue;

    const driverUserId = await getDriverUserId(vehicle.driverPhone);

    const upsert = await query(`
      INSERT INTO km_daily_notifications
        (vehicle_id, driver_name, driver_phone, driver_user_id, reminder_date, status,
         first_detected_at, last_checked_at)
      VALUES ($1, $2, $3, $4, $5, 'Open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (vehicle_id, reminder_date) DO UPDATE SET
        driver_name = EXCLUDED.driver_name,
        driver_phone = EXCLUDED.driver_phone,
        driver_user_id = EXCLUDED.driver_user_id,
        last_checked_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      vehicle.vehicleId,
      vehicle.driverName,
      vehicle.driverPhone,
      driverUserId,
      today
    ]);

    const dailyRecord = {
      ...upsert.rows[0],
      vehicle_plate: vehicle.vehiclePlate,
      current_km: vehicle.currentKm,
      location: vehicle.location
    };

    try {
      await ensureDailyKmTicket(dailyRecord, today);
    } catch (error) {
      console.error("[KMDailyCard] ticket creation failed:", vehicle.vehicleId, error.message);
    }
  }

  // Notify drivers who are still missing a reading (once per day per record).
  const openToday = await query(`
    SELECT
      n.id,
      n.vehicle_id,
      n.driver_name,
      n.driver_phone,
      n.driver_user_id,
      CONCAT(v.plate_number, ' ', COALESCE(v.plate_code, '')) AS vehicle_plate,
      v.current_km,
      n.owner_notified_at,
      n.driver_notified_at
    FROM km_daily_notifications n
    JOIN vehicles v ON v.id = n.vehicle_id
    WHERE n.reminder_date = $1 AND n.status = 'Open'
    ORDER BY v.plate_number, v.plate_code
  `, [today]);

  for (const record of openToday.rows) {
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
            tab: "fleet",
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
    staleClosed,
    fleetCount: compliance.fleetCount,
    submitted: compliance.submittedCount,
    missing: compliance.missingCount,
    records: openToday.rows
  };
}

// The single API used by the notifications UI and dashboards. Delegates to the
// authoritative calculation so the count always matches the Daily KM report.
export async function getKmDailyNotifications(requestedDate = null) {
  await ensureTable();

  const state = await getRiyadhState();
  const targetDate = requestedDate || state.today;

  // Before the 07:00 cutoff for the current day, nothing is considered missing.
  if (!requestedDate && state.beforeCutoff) {
    return { today: targetDate, count: 0, records: [], beforeCutoff: true };
  }

  const compliance = await getDailyKmStatus(targetDate);
  const missing = compliance.missing.filter(v => v.vehicleId);

  return {
    today: targetDate,
    date: targetDate,
    count: missing.length,
    fleetCount: compliance.fleetCount,
    submittedCount: compliance.submittedCount,
    missingCount: missing.length,
    submissionRate: compliance.submissionRate,
    beforeCutoff: state.beforeCutoff,
    records: missing.map(v => ({
      id: `daily-km-${v.vehicleId}`,
      vehicle_id: v.vehicleId,
      vehicle_plate: v.vehiclePlate,
      driver_name: v.driverName,
      driver_phone: v.driverPhone,
      current_km: v.currentKm,
      location: v.location,
      reminder_date: targetDate,
      status: "Open",
      first_detected_at: null,
      last_checked_at: null,
      driver_notified_at: null,
      owner_notified_at: null
    }))
  };
}

// Backwards-compatible alias: the ERP-only Daily KM report.
export async function getDailyKmReport(requestedDate = null) {
  return getDailyKmStatus(requestedDate);
}

export async function getDriverDailyKmStatus(userId) {
  const userResult = await query(`
    SELECT id, role, phone, full_name, username
    FROM users
    WHERE id = $1::bigint
    LIMIT 1
  `, [userId]);

  const user = userResult.rows[0];
  if (!user || user.role !== 'Driver') {
    return { required: false, reason: 'not_driver' };
  }

  const phone = phoneMatchKey(user.phone);
  const name = String(user.full_name || user.username || '').trim();

  // A vehicle may carry the driver's number in either format, so the comparison has to
  // happen on normalised keys rather than raw digits.
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
        ($1::text <> '' AND REGEXP_REPLACE(COALESCE(v.phone, ''), '[^0-9]', '', 'g') = $1::text)
        OR
        ($2::text <> '' AND LOWER(TRIM(COALESCE(v.driver, ''))) = LOWER(TRIM($2::text)))
      )
      AND COALESCE(LOWER(TRIM(v.status)), '') NOT IN ('inactive', 'sold', 'disposed', 'disabled')
    ORDER BY v.id
    LIMIT 50
  `, [phone, name]);

  const vehicle =
    vehicleResult.rows.find((r) => phoneMatchKey(r.driver_phone) === phone) ||
    vehicleResult.rows.find(
      (r) => name && String(r.driver_name || "").trim().toLowerCase() === name.toLowerCase()
    ) ||
    null;

  // SHARED ACCOUNT: The Driver role uses a single shared login. When no specific
  // vehicle is matched, do NOT auto-pick one. Return required=false so the driver
  // goes to DriverPortal and selects their vehicle manually.
  if (!vehicle) {
    return { required: false, reason: 'shared_account_pick_vehicle_manually' };
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
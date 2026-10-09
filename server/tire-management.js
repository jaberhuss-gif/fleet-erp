import { query, transaction } from "./postgres.js";
import { logAction } from "./database-pg.js";

const POSITIONS = [
  "Front Left",
  "Front Right",
  "Rear Left",
  "Rear Right",
  "Spare",
  "Sixth"
];
const EXPECTED_TIRE_COUNT = POSITIONS.length;
const SPARE_POSITIONS = ["Spare", "Sixth"];

function clean(v) {
  return String(v ?? "").trim();
}

function httpError(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

async function audit(user, action, entityType, entityId, details = {}) {
  try {
    await logAction({
      userId: user?.id ?? null,
      username: user?.username || user?.full_name || "system",
      action,
      entityType,
      entityId,
      details
    });
  } catch (e) {
    console.error("[TireAudit] failed:", e.message);
  }
}

function statusFor(tire) {
  const explicit = clean(tire.condition_status || tire.status).toLowerCase();
  if (["red", "yellow", "green"].includes(explicit)) return explicit;
  const tread = Number(tire.tread_depth_mm);
  if (Number.isFinite(tread)) {
    if (tread <= 2) return "red";
    if (tread <= 4) return "yellow";
  }
  return "green";
}

async function assertDriverCanAccessVehicle(req, vehicleId) {
  // Driver scoping is a server-side security rule. It must never depend on an
  // environment flag that can accidentally be omitted or changed in production.
  if (String(req.user?.role || "").trim().toLowerCase() !== "driver") return;

  // Vehicle Master is authoritative: Driver Master assignment (drivers.vehicle_id) and vehicles.driver_id, with name/phone fallback.
  const userResult = await query(
    `SELECT id, username, full_name, phone
     FROM users
     WHERE id = $1 AND role = 'Driver'
     LIMIT 1`,
    [req.user?.id]
  );
  const user = userResult.rows[0];
  if (!user) throw httpError(403, "Driver account was not found in the ERP users table.");
  const names = [user.full_name, user.username]
    .filter(Boolean)
    .map(v => String(v).trim().toLowerCase())
    .filter(Boolean);
  const phones = [user.phone]
    .filter(Boolean)
    .map(v => String(v).replace(/\D/g, ""))
    .filter(Boolean);

  const r = await query(
    `SELECT v.id
     FROM vehicles v
     LEFT JOIN drivers d ON d.id = v.driver_id
     WHERE v.id = $1
       AND (
         d.vehicle_id = v.id
         OR LOWER(TRIM(COALESCE(d.name, ''))) = ANY($2::text[])
         OR LOWER(TRIM(COALESCE(v.driver, ''))) = ANY($2::text[])
         OR REGEXP_REPLACE(COALESCE(d.phone, ''), '[^0-9]', '', 'g') = ANY($3::text[])
         OR REGEXP_REPLACE(COALESCE(v.phone, ''), '[^0-9]', '', 'g') = ANY($3::text[])
       )
     LIMIT 1`,
    [vehicleId, names, phones]
  );

  if (!r.rows[0]) {
    throw httpError(403, "This vehicle is not assigned to you in Vehicle Master.");
  }
}

async function activeTireAt(tx, vehicleId, position, excludeId = null) {
  const r = await tx.query(
    `SELECT * FROM tire_assets
     WHERE vehicle_id = $1 AND position = $2 AND active = true
     ${excludeId ? "AND id <> $3" : ""}
     LIMIT 1 FOR UPDATE`,
    excludeId ? [vehicleId, position, excludeId] : [vehicleId, position]
  );
  return r.rows[0] || null;
}

async function swapPositions(tx, vehicleId, posA, posB) {
  if (posA === posB) throw httpError(400, "Source and target positions are the same.");

  // Lock both occupied positions in a deterministic order so concurrent swaps
  // cannot read stale positions or deadlock each other.
  const locked = await tx.query(
    `SELECT * FROM tire_assets
     WHERE vehicle_id=$1 AND active=true AND position IN ($2,$3)
     ORDER BY id
     FOR UPDATE`,
    [vehicleId, posA, posB]
  );

  const a = locked.rows.find(r => r.position === posA) || null;
  const b = locked.rows.find(r => r.position === posB) || null;

  if (!a && !b) throw httpError(400, `No active tires at ${posA} or ${posB}.`);

  if (a && !b) {
    await tx.query(
      `UPDATE tire_assets SET position=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
      [posB, a.id]
    );
    return { a, b: null };
  }

  if (b && !a) {
    await tx.query(
      `UPDATE tire_assets SET position=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
      [posA, b.id]
    );
    return { a: null, b };
  }

  await tx.query("SAVEPOINT swap_positions");
  try {
    const temp = `__ROTATE__${a.id}_${b.id}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    await tx.query(
      `UPDATE tire_assets SET position=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
      [temp, a.id]
    );
    await tx.query(
      `UPDATE tire_assets SET position=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
      [posA, b.id]
    );
    await tx.query(
      `UPDATE tire_assets SET position=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
      [posB, a.id]
    );
    await tx.query("RELEASE SAVEPOINT swap_positions");
    return { a, b };
  } catch (err) {
    await tx.query("ROLLBACK TO SAVEPOINT swap_positions");
    throw err;
  }
}

async function deactivateTire(tx, tire, note = "") {
  await tx.query(
    `UPDATE tire_assets
     SET active = false, removed_at = CURRENT_TIMESTAMP,
         condition_status = 'red',
         condition_notes = CASE WHEN $2 = '' THEN condition_notes ELSE $2 END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [tire.id, note]
  );
}

export async function ensureTireSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS tire_assets (
      id BIGSERIAL PRIMARY KEY,
      vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      position TEXT NOT NULL,
      tire_id TEXT NOT NULL UNIQUE,
      manufacturer_serial TEXT,
      brand TEXT,
      model TEXT,
      size TEXT,
      dot TEXT,
      tread_depth_mm NUMERIC(6,2),
      pressure_psi NUMERIC(6,2),
      condition_status TEXT NOT NULL DEFAULT 'green',
      condition_notes TEXT,
      installed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      installed_km BIGINT,
      removed_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tire_assets_vehicle ON tire_assets(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_tire_assets_active ON tire_assets(vehicle_id, active);
    CREATE SEQUENCE IF NOT EXISTS tire_id_seq START 1;
    DROP INDEX IF EXISTS idx_tire_assets_serial_unique;
    CREATE INDEX IF NOT EXISTS idx_tire_assets_serial
      ON tire_assets(manufacturer_serial)
      WHERE manufacturer_serial IS NOT NULL AND manufacturer_serial <> '';

    CREATE TABLE IF NOT EXISTS tire_surveys (
      id BIGSERIAL PRIMARY KEY,
      vehicle_id BIGINT NOT NULL UNIQUE REFERENCES vehicles(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'OPEN',
      photos JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes TEXT,
      submitted_by BIGINT,
      submitted_at TIMESTAMPTZ,
      reopened_by BIGINT,
      reopened_at TIMESTAMPTZ,
      reopen_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tire_events (
      id BIGSERIAL PRIMARY KEY,
      vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      tire_asset_id BIGINT REFERENCES tire_assets(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      position TEXT,
      old_tire_id TEXT,
      new_tire_id TEXT,
      manufacturer_serial TEXT,
      outcome TEXT,
      notes TEXT,
      event_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tire_events_vehicle ON tire_events(vehicle_id, event_date DESC);

    CREATE TABLE IF NOT EXISTS tire_service_requests (
      id BIGSERIAL PRIMARY KEY,
      vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      request_type TEXT NOT NULL,
      position TEXT,
      notes TEXT NOT NULL,
      photo TEXT,
      from_position TEXT,
      to_position TEXT,
      tire_serial TEXT,
      tire_date DATE,
      tire_size TEXT,
      pressure_psi NUMERIC(8,2),
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tire_service_requests_vehicle
      ON tire_service_requests(vehicle_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tire_service_requests_status
      ON tire_service_requests(status, created_at DESC);

    ALTER TABLE tire_surveys ADD COLUMN IF NOT EXISTS reopen_reason TEXT;
    ALTER TABLE tire_surveys ADD COLUMN IF NOT EXISTS approved_by BIGINT;
    ALTER TABLE tire_surveys ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
    ALTER TABLE tire_surveys ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;
    ALTER TABLE tire_assets ADD COLUMN IF NOT EXISTS installed_km BIGINT;
    DO $$
    DECLARE c RECORD;
    BEGIN
      FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'tire_assets'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) ILIKE '%manufacturer_serial%'
      LOOP
        EXECUTE format('ALTER TABLE tire_assets DROP CONSTRAINT IF EXISTS %I', c.conname);
      END LOOP;
      FOR c IN
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'tire_assets'
          AND indexname ILIKE '%manufacturer%serial%'
          AND indexdef ILIKE '%UNIQUE%'
      LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', c.indexname);
      END LOOP;
    END $$;
    ALTER TABLE tire_assets ADD COLUMN IF NOT EXISTS dot TEXT;
    ALTER TABLE tire_events ADD COLUMN IF NOT EXISTS outcome TEXT;
    ALTER TABLE tire_service_requests ADD COLUMN IF NOT EXISTS from_position TEXT;
    ALTER TABLE tire_service_requests ADD COLUMN IF NOT EXISTS to_position TEXT;
    ALTER TABLE tire_service_requests ADD COLUMN IF NOT EXISTS tire_serial TEXT;
    ALTER TABLE tire_service_requests ADD COLUMN IF NOT EXISTS tire_date DATE;
    ALTER TABLE tire_service_requests ADD COLUMN IF NOT EXISTS tire_size TEXT;
    ALTER TABLE tire_service_requests ADD COLUMN IF NOT EXISTS pressure_psi NUMERIC(8,2);
  `);
}

export async function getTireControl() {
  const vehicles = await query(`
    WITH latest_6m AS (
      SELECT DISTINCT ON (vehicle_id)
        vehicle_id, status, completed_date, notes, scheduled_date
      FROM periodic_maintenance
      WHERE type = '6_months_general'
        AND status = 'Completed'
        AND completed_date IS NOT NULL
      ORDER BY vehicle_id, COALESCE(completed_date, scheduled_date) DESC NULLS LAST, id DESC
    ),
    latest_inspection AS (
      SELECT DISTINCT ON (vehicle_id)
        vehicle_id, completed_date, status, notes
      FROM periodic_maintenance
      WHERE type = 'inspection'
        AND status = 'Completed'
        AND completed_date IS NOT NULL
      ORDER BY vehicle_id, completed_date DESC, id DESC
    )
    SELECT
      v.id, v.plate, v.plate_number, v.plate_code, v.driver, v.location,
      COALESCE(today_km.reading_km, 0) AS current_km,
      COALESCE(oil_history.oil_change_km, v.last_oil_km) AS last_oil_km,
      COALESCE(v.oil_change_interval, 5000) AS oil_change_interval,
      COALESCE(oil_history.oil_change_date::text, v.last_oil_change_date::text) AS last_oil_change_date,
      today_km.reading_date AS daily_km_date,
      v.inspection_last_date, v.inspection_due_date,
      s.status AS survey_status, s.submitted_at,
      COALESCE(tri.pending_count, 0) AS open_tire_issues,
      i.completed_date AS inspection_record_date,
      m.status AS maintenance_status,
      m.completed_date AS maintenance_completed_date,
      m.notes AS maintenance_notes,
      m.scheduled_date AS maintenance_scheduled_date,
      COALESCE(json_agg(
        json_build_object(
          'id', t.id, 'tireId', t.tire_id, 'position', t.position,
          'serial', t.manufacturer_serial, 'brand', t.brand, 'model', t.model,
          'size', t.size, 'dot', t.dot, 'treadDepthMm', t.tread_depth_mm,
          'pressurePsi', t.pressure_psi, 'status', t.condition_status,
          'notes', t.condition_notes, 'active', t.active
        ) ORDER BY t.position
      ) FILTER (WHERE t.id IS NOT NULL), '[]'::json) AS tires
    FROM vehicles v
    LEFT JOIN LATERAL (
      SELECT reading_km, reading_date
      FROM km_records
      WHERE vehicle_id = v.id
        AND reading_date::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) today_km ON true
    LEFT JOIN LATERAL (
      SELECT oil_change_km, oil_change_date
      FROM oil_changes
      WHERE vehicle_id = v.id
        AND COALESCE(notes, '') NOT ILIKE '%Google Sheet%'
      ORDER BY oil_change_date DESC NULLS LAST, id DESC
      LIMIT 1
    ) oil_history ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS pending_count
      FROM tire_service_requests
      WHERE vehicle_id = v.id AND status = 'PENDING'
    ) tri ON true
    LEFT JOIN tire_surveys s ON s.vehicle_id = v.id
    LEFT JOIN tire_assets t ON t.vehicle_id = v.id AND t.active = true
    LEFT JOIN latest_6m m ON m.vehicle_id = v.id
    LEFT JOIN latest_inspection i ON i.vehicle_id = v.id
    WHERE LOWER(TRIM(COALESCE(v.plate, ''))) <> 'test 123'
    GROUP BY
      v.id, v.plate, v.plate_number, v.plate_code, v.driver, v.location, v.last_oil_km,
      v.oil_change_interval, v.last_oil_change_date,
      oil_history.oil_change_km, oil_history.oil_change_date,
      today_km.reading_km, today_km.reading_date,
      v.inspection_last_date, v.inspection_due_date,
      s.status, s.submitted_at, tri.pending_count,
      i.completed_date, m.status, m.completed_date, m.notes, m.scheduled_date
    ORDER BY v.plate
  `);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysBetween = (a, b) => Math.floor((b.getTime() - a.getTime()) / 86400000);
  const rank = { red: 0, yellow: 1, green: 2 };

  const cards = vehicles.rows.map(v => {
    const tires = (v.tires || []).map(t => ({ ...t, status: statusFor(t) }));
    const activeCount = tires.length;

    let tireWorst, tireReason;
    if (!v.survey_status) {
      tireWorst = "red";
      tireReason = "Initial tire survey not completed";
    } else if (v.survey_status === "OPEN") {
      tireWorst = "yellow";
      tireReason = "Survey reopened — awaiting resubmission";
    } else if (v.survey_status === "SUBMITTED") {
      tireWorst = "yellow";
      tireReason = "Survey submitted — awaiting management approval";
    } else if (v.survey_status !== "APPROVED" && v.survey_status !== "LOCKED") {
      tireWorst = "red";
      tireReason = "Invalid tire survey status";
    } else if (activeCount < EXPECTED_TIRE_COUNT) {
      tireWorst = "red";
      tireReason = `Only ${activeCount}/${EXPECTED_TIRE_COUNT} tires on vehicle`;
    } else {
      tireWorst = tires.some(t => t.status === "red")
        ? "red"
        : tires.some(t => t.status === "yellow")
          ? "yellow"
          : "green";
      tireReason = tireWorst === "green"
        ? "All tires within limits"
        : tireWorst === "red"
          ? "One or more tires require immediate attention"
          : "One or more tires are approaching limit";
    }

    const hasDailyKm = v.daily_km_date != null && Number(v.current_km || 0) > 0;
    const currentKm = hasDailyKm ? Number(v.current_km) : 0;
    const lastOilKm = Number(v.last_oil_km || 0);
    const oilInterval = Number(v.oil_change_interval || 5000);
    const drivenSinceOil = hasDailyKm && lastOilKm > 0 ? currentKm - lastOilKm : null;
    const oilRemaining = drivenSinceOil != null ? oilInterval - drivenSinceOil : null;
    const oilProgress = drivenSinceOil != null ? (drivenSinceOil / oilInterval) * 100 : 0;
    const oilDueKm = lastOilKm > 0 ? lastOilKm + oilInterval : null;

    let oilStatus = "red";
    let oilReason = "No Daily KM submitted today";
    if (!hasDailyKm) {
      oilStatus = "red";
      oilReason = "No Data";
    } else if (lastOilKm <= 0) {
      oilStatus = "red";
      oilReason = "Last oil change KM is not recorded";
    } else if (drivenSinceOil > oilInterval) {
      oilStatus = "red";
      oilReason = `Overdue by ${(drivenSinceOil - oilInterval).toLocaleString()} km`;
    } else if (drivenSinceOil >= Math.max(0, oilInterval - 500)) {
      oilStatus = "yellow";
      oilReason = `Due Soon — ${Math.max(0, oilRemaining).toLocaleString()} km remaining`;
    } else {
      oilStatus = "green";
      oilReason = `OK — ${Math.max(0, oilRemaining).toLocaleString()} km remaining`;
    }

    const maintenanceDate = v.maintenance_completed_date
      ? new Date(v.maintenance_completed_date)
      : null;
    let maintenanceStatus = "red";
    let maintenanceReason = "No completed 6-month maintenance evidence";
    if (maintenanceDate) {
      const days = daysBetween(maintenanceDate, today);
      if (days > 180) {
        maintenanceStatus = "red";
        maintenanceReason = `6-month maintenance overdue by ${days - 180} days`;
      } else if (days >= 150) {
        maintenanceStatus = "yellow";
        maintenanceReason = `6-month maintenance due in ${180 - days} days`;
      } else {
        maintenanceStatus = "green";
        maintenanceReason = `Last completed ${days} days ago`;
      }
    }

    const inspectionRecordDate = v.inspection_record_date
      ? new Date(v.inspection_record_date)
      : null;
    const vehicleInspectionDate = v.inspection_last_date
      ? new Date(v.inspection_last_date)
      : null;
    const inspectionDate =
      [inspectionRecordDate, vehicleInspectionDate]
        .filter(Boolean)
        .sort((a, b) => b - a)[0] || null;

    let inspectionStatus = "red";
    let inspectionReason = "No actual annual inspection evidence";
    if (inspectionDate) {
      const due = new Date(inspectionDate);
      due.setDate(due.getDate() + 365);
      const daysLeft = daysBetween(today, due);
      if (daysLeft < 0) {
        inspectionStatus = "red";
        inspectionReason = `Annual inspection overdue by ${Math.abs(daysLeft)} days`;
      } else if (daysLeft <= 30) {
        inspectionStatus = "yellow";
        inspectionReason = `Annual inspection due in ${daysLeft} days`;
      } else {
        inspectionStatus = "green";
        inspectionReason = `Inspected ${daysBetween(inspectionDate, today)} days ago`;
      }
    }

    const openIssues = Number(v.open_tire_issues || 0);
    const issuesStatus = openIssues > 0 ? "yellow" : "green";
    const statuses = [tireWorst, oilStatus, maintenanceStatus, inspectionStatus, issuesStatus];
    const overallStatus = statuses.sort((a, b) => rank[a] - rank[b])[0];

    return {
      ...v,
      tires,
      tireStatus: tireWorst,
      tireReason,
      tireCount: activeCount,
      expectedTires: EXPECTED_TIRE_COUNT,
      openTireIssues: openIssues,
      oilStatus,
      oilReason,
      oilDueKm,
      drivenSinceOil,
      oilRemaining,
      oilProgress,
      hasDailyKm,
      maintenanceStatus,
      maintenanceReason,
      inspectionStatus,
      inspectionReason,
      overallStatus,
      red: tires.filter(t => t.status === "red").length,
      yellow: tires.filter(t => t.status === "yellow").length,
      green: tires.filter(t => t.status === "green").length
    };
  });

  cards.sort((a, b) =>
    rank[a.overallStatus] - rank[b.overallStatus] ||
    (a.red - b.red) * -1 ||
    (a.yellow - b.yellow) * -1 ||
    String(a.plate).localeCompare(String(b.plate))
  );
  return cards;
}

export async function getVehicleTrackingHistory(vehicleId) {
  const [workOrders, periodic, oilChanges, tickets, tireEvents, tireServiceRequests] =
    await Promise.all([
      query(`SELECT * FROM work_orders WHERE vehicle_id=$1 ORDER BY reported_date DESC NULLS LAST, id DESC LIMIT 500`, [vehicleId]),
      query(`SELECT * FROM periodic_maintenance WHERE vehicle_id=$1 ORDER BY COALESCE(completed_date, scheduled_date) DESC NULLS LAST, id DESC LIMIT 500`, [vehicleId]),
      query(`SELECT * FROM oil_changes WHERE vehicle_id=$1 ORDER BY oil_change_date DESC NULLS LAST, id DESC LIMIT 500`, [vehicleId]),
      query(`SELECT * FROM tickets WHERE vehicle_id=$1 ORDER BY opened_at DESC NULLS LAST, id DESC LIMIT 500`, [vehicleId]),
      query(`SELECT e.*, t.tire_id FROM tire_events e LEFT JOIN tire_assets t ON t.id=e.tire_asset_id WHERE e.vehicle_id=$1 ORDER BY e.event_date DESC, e.id DESC LIMIT 500`, [vehicleId]),
      query(`SELECT * FROM tire_service_requests WHERE vehicle_id=$1 ORDER BY created_at DESC, id DESC LIMIT 500`, [vehicleId])
    ]);

  return {
    workOrders: workOrders.rows,
    periodicMaintenance: periodic.rows,
    oilChanges: oilChanges.rows,
    tickets: tickets.rows,
    tireEvents: tireEvents.rows,
    tireServiceRequests: tireServiceRequests.rows
  };
}

export async function getVehicleTires(vehicleId) {
  const survey = await query(`SELECT * FROM tire_surveys WHERE vehicle_id=$1 LIMIT 1`, [vehicleId]);
  const tires = await query(`SELECT * FROM tire_assets WHERE vehicle_id=$1 AND active=true ORDER BY id`, [vehicleId]);
  const events = await query(`
    SELECT e.*, t.tire_id
    FROM tire_events e
    LEFT JOIN tire_assets t ON t.id=e.tire_asset_id
    WHERE e.vehicle_id=$1
    ORDER BY e.event_date DESC, e.id DESC
    LIMIT 100
  `, [vehicleId]);

  return {
    survey: survey.rows[0] || null,
    tires: tires.rows.map(t => ({ ...t, condition_status: statusFor(t) })),
    events: events.rows
  };
}

export async function submitInitialSurvey(vehicleId, body, user) {
  const existing = await query(`SELECT status FROM tire_surveys WHERE vehicle_id=$1 LIMIT 1`, [vehicleId]);
  if (["SUBMITTED", "APPROVED", "LOCKED"].includes(existing.rows[0]?.status)) {
    throw httpError(409, "Initial Tire Survey is already submitted/approved and locked. Management must reopen it before a new survey.");
  }

  const tires = Array.isArray(body.tires) ? body.tires : [];
  if (tires.length !== EXPECTED_TIRE_COUNT) {
    throw httpError(400, `Exactly ${EXPECTED_TIRE_COUNT} tire records are required.`);
  }

  const photos = body.photos && typeof body.photos === "object" ? body.photos : {};
  for (const p of POSITIONS) {
    if (!clean(photos[p])) throw httpError(400, "Photo is required for " + p + ".");
  }

  const photosJson = JSON.stringify(photos);
  if (photosJson.length > 8_000_000) {
    throw httpError(413, "Total photos size exceeds 8MB. Please compress the images and retry.");
  }

  const result = await transaction(async tx => {
    await tx.query(
      `UPDATE tire_assets
       SET active=false, removed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
       WHERE vehicle_id=$1 AND active=true`,
      [vehicleId]
    );

    for (const tire of tires) {
      const position = clean(tire.position);
      if (!POSITIONS.includes(position)) {
        throw httpError(400, "Invalid tire position: " + position);
      }

      let tireId = clean(tire.tireId);
      if (!tireId) {
        const seq = await tx.query(`SELECT nextval('tire_id_seq') AS n`);
        tireId = "T-" + String(seq.rows[0].n).padStart(6, "0");
      } else {
        const duplicate = await tx.query(
          `SELECT id FROM tire_assets WHERE tire_id=$1 LIMIT 1 FOR UPDATE`,
          [tireId]
        );
        if (duplicate.rows[0]) {
          throw httpError(409, `Tire ID ${tireId} is already registered. Use a new Tire ID.`);
        }
      }

      const inserted = await tx.query(
        `INSERT INTO tire_assets
         (vehicle_id, position, tire_id, manufacturer_serial, brand, model, size,
          dot, tread_depth_mm, pressure_psi, condition_status, condition_notes, installed_km)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          vehicleId,
          position,
          tireId,
          clean(tire.manufacturerSerial) || null,
          clean(tire.brand) || null,
          clean(tire.model) || null,
          clean(tire.size) || null,
          clean(tire.dot) || null,
          Number.isFinite(Number(tire.treadDepthMm)) ? Number(tire.treadDepthMm) : null,
          Number.isFinite(Number(tire.pressurePsi)) ? Number(tire.pressurePsi) : null,
          statusFor(tire),
          clean(tire.notes) || null,
          Number.isFinite(Number(tire.installedKm)) ? Number(tire.installedKm) : null
        ]
      ).catch(e => {
        if (e.code === "23505") {
          throw httpError(409, "Duplicate manufacturer serial number: " + clean(tire.manufacturerSerial));
        }
        throw e;
      });

      await tx.query(
        `INSERT INTO tire_events
         (vehicle_id,tire_asset_id,event_type,position,new_tire_id,manufacturer_serial,notes,created_by)
         VALUES ($1,$2,'INITIAL_SURVEY',$3,$4,$5,$6,$7)`,
        [
          vehicleId,
          inserted.rows[0].id,
          position,
          tireId,
          clean(tire.manufacturerSerial) || null,
          clean(tire.notes) || null,
          user?.id || null
        ]
      );
    }

    const saved = await tx.query(
      `INSERT INTO tire_surveys
       (vehicle_id,status,photos,notes,submitted_by,submitted_at,locked,updated_at)
       VALUES ($1,'SUBMITTED',$2,$3,$4,CURRENT_TIMESTAMP,TRUE,CURRENT_TIMESTAMP)
       ON CONFLICT(vehicle_id) DO UPDATE SET
         status='SUBMITTED', photos=EXCLUDED.photos, notes=EXCLUDED.notes,
         submitted_by=EXCLUDED.submitted_by, submitted_at=CURRENT_TIMESTAMP,
         locked=TRUE, updated_at=CURRENT_TIMESTAMP
       RETURNING *`,
      [vehicleId, photosJson, clean(body.notes) || null, user?.id || null]
    );

    return saved.rows[0];
  });

  await audit(user, "TIRE_INITIAL_SURVEY_SUBMITTED", "vehicle", vehicleId, { surveyId: result.id });
  return await getVehicleTires(vehicleId);
}

export async function reopenInitialSurvey(vehicleId, user, reason) {
  if (!clean(reason)) throw httpError(400, "Reopen reason is required.");

  const result = await query(
    `UPDATE tire_surveys
     SET status='OPEN', reopened_by=$2, reopened_at=CURRENT_TIMESTAMP,
         reopen_reason=$3, locked=FALSE, updated_at=CURRENT_TIMESTAMP
     WHERE vehicle_id=$1 RETURNING *`,
    [vehicleId, user?.id || null, clean(reason)]
  );

  if (!result.rows[0]) throw httpError(404, "Initial Tire Survey not found.");
  await audit(user, "TIRE_INITIAL_SURVEY_REOPENED", "vehicle", vehicleId, {
    reason: clean(reason)
  });
  return result.rows[0];
}

export async function approveInitialSurvey(vehicleId, user) {
  const result = await query(
    `UPDATE tire_surveys
     SET status='APPROVED', approved_by=$2, approved_at=CURRENT_TIMESTAMP,
         locked=TRUE, updated_at=CURRENT_TIMESTAMP
     WHERE vehicle_id=$1 AND status='SUBMITTED'
     RETURNING *`,
    [vehicleId, user?.id || null]
  );
  if (!result.rows[0]) throw httpError(404, "No submitted tire survey to approve.");
  await audit(user, "TIRE_SURVEY_APPROVED", "vehicle", vehicleId, { surveyId: result.rows[0].id });
  return result.rows[0];
}

export async function updateTireAsset(vehicleId, tireId, body, user) {
  const survey = await query(`SELECT status, locked FROM tire_surveys WHERE vehicle_id=$1 LIMIT 1`, [vehicleId]);
  if (!survey.rows[0] || survey.rows[0].status !== "APPROVED" || survey.rows[0].locked !== true) {
    throw httpError(409, "Tire Survey must be APPROVED and locked before tire data can be edited.");
  }

  const current = await query(
    `SELECT * FROM tire_assets WHERE id=$1 AND vehicle_id=$2 LIMIT 1`,
    [tireId, vehicleId]
  );
  if (!current.rows[0]) throw httpError(404, "Tire not found.");

  const c = current.rows[0];
  const condition = clean(body.condition_status).toLowerCase();

  const values = [
    clean(body.manufacturer_serial) !== ""
      ? (body.manufacturer_serial ?? c.manufacturer_serial)
      : c.manufacturer_serial,
    body.brand ?? c.brand,
    body.model ?? c.model,
    body.size ?? c.size,
    body.tread_depth_mm !== undefined
      ? (Number.isFinite(Number(body.tread_depth_mm)) ? Number(body.tread_depth_mm) : null)
      : c.tread_depth_mm,
    body.pressure_psi !== undefined
      ? (Number.isFinite(Number(body.pressure_psi)) ? Number(body.pressure_psi) : null)
      : c.pressure_psi,
    condition ? condition : c.condition_status,
    body.condition_notes ?? c.condition_notes,
    body.installed_km !== undefined
      ? (Number.isFinite(Number(body.installed_km)) ? Number(body.installed_km) : null)
      : c.installed_km,
    tireId
  ];

  const result = await query(
    `UPDATE tire_assets SET
       manufacturer_serial = $1, brand = $2, model = $3, size = $4,
       tread_depth_mm = $5, pressure_psi = $6,
       condition_status = $7, condition_notes = $8, installed_km = $9,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $10 RETURNING *`,
    values
  ).catch(e => {
    if (e.code === "23505") {
      throw httpError(409, "This manufacturer serial is already registered on another tire.");
    }
    throw e;
  });

  await audit(user, "TIRE_ASSET_UPDATED", "tire_asset", tireId, {
    vehicleId,
    changes: body
  });
  return result.rows[0];
}

export async function updateVehicleTiresAfterApproval(vehicleId, tires, user) {
  const survey = await query(`SELECT status, locked FROM tire_surveys WHERE vehicle_id=$1 LIMIT 1`, [vehicleId]);
  if (!survey.rows[0] || survey.rows[0].status !== "APPROVED" || survey.rows[0].locked !== true) {
    throw httpError(409, "Tire Survey must be APPROVED and locked before tire data can be updated.");
  }
  const list = Array.isArray(tires) ? tires : [];

  const result = await transaction(async tx => {
    const vehicle = await tx.query(
      `SELECT id FROM vehicles WHERE id=$1 LIMIT 1 FOR UPDATE`,
      [vehicleId]
    );
    if (!vehicle.rows[0]) throw httpError(404, "Vehicle not found.");

    const saved = [];
    for (const tire of list) {
      if (!tire?.id) throw httpError(400, "Each tire must include its tire asset ID.");

      const values = [
        tire.manufacturer_serial || null,
        tire.brand || null,
        tire.size || null,
        tire.dot || null,
        tire.condition || tire.condition_status || null,
        Number.isFinite(Number(tire.installed_km)) ? Number(tire.installed_km) : null,
        tire.installed_date || null,
        tire.id,
        vehicleId
      ];

      const updated = await tx.query(
        `UPDATE tire_assets
         SET manufacturer_serial=$1,
             brand=$2,
             size=$3,
             dot=$4,
             condition_status=COALESCE(NULLIF($5,''), condition_status),
             installed_km=$6,
             installed_at=COALESCE($7::timestamptz, installed_at),
             updated_at=CURRENT_TIMESTAMP
         WHERE id=$8 AND vehicle_id=$9
         RETURNING *`,
        values
      );

      if (!updated.rows[0]) {
        throw httpError(404, `Tire ${tire.id} not found for vehicle ${vehicleId}.`);
      }
      saved.push(updated.rows[0]);
    }

    return saved;
  });

  await audit(user, "TIRES_UPDATED", "vehicle", vehicleId, {
    tireCount: result.length,
    tireIds: result.map(t => t.id)
  });

  return result;
}

export async function changeTirePosition(vehicleId, tireId, newPosition, user, notes = "") {
  const survey = await query(`SELECT status, locked FROM tire_surveys WHERE vehicle_id=$1 LIMIT 1`, [vehicleId]);
  if (!survey.rows[0] || survey.rows[0].status !== "APPROVED" || survey.rows[0].locked !== true) {
    throw httpError(409, "Tire Survey must be APPROVED and locked before changing tire position.");
  }
  if (!POSITIONS.includes(newPosition)) throw httpError(400, "Invalid position.");
  const result = await transaction(async tx => {
    const current = await tx.query(`SELECT * FROM tire_assets WHERE id=$1 AND vehicle_id=$2 AND active=true FOR UPDATE`, [tireId, vehicleId]);
    if (!current.rows[0]) throw httpError(404, "Active tire not found.");
    const tire = current.rows[0];
    if (tire.position === newPosition) return { tire, oldPosition: tire.position };
    const occupied = await activeTireAt(tx, vehicleId, newPosition, tireId);
    if (occupied) throw httpError(409, `Position ${newPosition} is already occupied by tire ${occupied.tire_id}.`);
    const updated = await tx.query(`UPDATE tire_assets SET position=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`, [newPosition, tireId]);
    await tx.query(`INSERT INTO tire_events
       (vehicle_id,tire_asset_id,event_type,position,old_tire_id,new_tire_id,notes,created_by)
       VALUES ($1,$2,'POSITION_CHANGE',$3,$4,$5,$6,$7)`,
      [vehicleId, tireId, `${tire.position} → ${newPosition}`, tire.tire_id, tire.tire_id, clean(notes) || null, user?.id || null]);
    return { tire: updated.rows[0], oldPosition: tire.position };
  });
  await audit(user, "TIRE_POSITION_CHANGED", "tire_asset", tireId, { vehicleId, oldPosition: result.oldPosition, newPosition: result.tire.position });
  return result.tire;
}

export async function createTireServiceRequest(vehicleId, body, userId) {
  const allowed = [
    "TIRE_ROTATION",
    "NEW_TIRE_INSTALLATION",
    "DAMAGED_TIRE_REPLACEMENT",
    // Keep legacy values readable for existing historical requests.
    "TIRE_SHOP_VISIT",
    "TIRE_REPLACEMENT_DAMAGE",
    "PUNCTURE_REPAIR",
    "OTHER"
  ];
  const requestType = clean(body.requestType);
  if (!allowed.includes(requestType)) {
    throw httpError(400, "Invalid tire service request type.");
  }

  const notes = clean(body.notes);
  const position = clean(body.position);
  const fromPosition = clean(body.fromPosition);
  const toPosition = clean(body.toPosition);
  const tireSerial = clean(body.tireSerial);
  const tireDate = clean(body.tireDate);
  const tireSize = clean(body.tireSize);
  const pressurePsi = body.pressurePsi === "" || body.pressurePsi == null ? null : Number(body.pressurePsi);
  const photo = clean(body.photo);

  if (requestType === "TIRE_ROTATION") {
    if (!POSITIONS.includes(fromPosition) || !POSITIONS.includes(toPosition)) {
      throw httpError(400, "Tire rotation requires valid From and To positions.");
    }
    if (fromPosition === toPosition) {
      throw httpError(400, "Tire rotation source and target positions must be different.");
    }
  } else if (["NEW_TIRE_INSTALLATION", "DAMAGED_TIRE_REPLACEMENT"].includes(requestType)) {
    if (!POSITIONS.includes(position)) throw httpError(400, "Select a valid tire installation position.");
    if (!tireSerial) throw httpError(400, "Tire serial number is required.");
    if (!tireDate) throw httpError(400, "Tire date is required.");
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(tireDate)) throw httpError(400, "Tire date must be a valid date.");
    if (!tireSize) throw httpError(400, "Tire size is required.");
    if (pressurePsi == null || !Number.isFinite(pressurePsi) || pressurePsi < 0) {
      throw httpError(400, "Valid tire air pressure is required.");
    }
    if (requestType === "DAMAGED_TIRE_REPLACEMENT" && !photo) {
      throw httpError(400, "A photo of the damaged tire is required.");
    }
  } else if (requestType === "PUNCTURE_REPAIR") {
    if (!POSITIONS.includes(position)) throw httpError(400, "Select the punctured tire position.");
    if (!photo) throw httpError(400, "A photo of the punctured tire is required.");
  } else {
    if (!notes) throw httpError(400, "Please describe the tire issue or required service.");
  }

  const result = await query(
    `INSERT INTO tire_service_requests
     (vehicle_id,request_type,position,from_position,to_position,tire_serial,tire_date,tire_size,pressure_psi,notes,photo,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      vehicleId,
      requestType,
      position || null,
      fromPosition || null,
      toPosition || null,
      tireSerial || null,
      tireDate || null,
      tireSize || null,
      pressurePsi,
      notes || null,
      photo || null,
      userId || null
    ]
  );
  return result.rows[0];
}

export async function listTireServiceRequests(filters = {}) {
  const params = [];
  const where = [];
  const vehicle = clean(filters.vehicle);
  const status = clean(filters.status).toUpperCase();

  if (vehicle) {
    params.push("%" + vehicle + "%");
    where.push(
      "(COALESCE(v.plate,'') ILIKE $" + params.length +
      " OR COALESCE(v.plate_number,'') ILIKE $" + params.length +
      " OR COALESCE(v.plate_code,'') ILIKE $" + params.length + ")"
    );
  }

  if (status) {
    params.push(status);
    where.push("UPPER(r.status) = $" + params.length);
  }

  const sql = `SELECT r.*,
    COALESCE(v.plate, CONCAT_WS(' ',v.plate_number,v.plate_code)) AS plate,
    v.driver, u.full_name AS created_by_name
    FROM tire_service_requests r
    LEFT JOIN vehicles v ON v.id=r.vehicle_id
    LEFT JOIN users u ON u.id=r.created_by
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY r.created_at DESC, r.id DESC LIMIT 500`;

  return (await query(sql, params)).rows;
}

export async function updateTireServiceRequestStatus(id, status, user) {
  const allowed = ["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"];
  const next = clean(status).toUpperCase();
  if (!allowed.includes(next)) throw httpError(400, "Invalid tire service request status.");

  const currentResult = await query(
    "SELECT status FROM tire_service_requests WHERE id=$1 LIMIT 1",
    [id]
  );
  const current = clean(currentResult.rows[0]?.status).toUpperCase();
  if (!current) throw httpError(404, "Tire service request not found.");

  const transitions = {
    PENDING: new Set(["APPROVED", "REJECTED", "CANCELLED"]),
    APPROVED: new Set(["IN_PROGRESS", "REJECTED", "CANCELLED"]),
    IN_PROGRESS: new Set(["COMPLETED", "CANCELLED"]),
    COMPLETED: new Set(),
    REJECTED: new Set(),
    CANCELLED: new Set()
  };
  if (!transitions[current]?.has(next)) {
    throw httpError(409, `Invalid tire service request transition: ${current} → ${next}.`);
  }

  const result = await query(
    `UPDATE tire_service_requests
     SET status=$1,updated_at=CURRENT_TIMESTAMP
     WHERE id=$2 RETURNING *`,
    [next, id]
  );

  if (!result.rows[0]) throw httpError(404, "Tire service request not found.");

  await audit(user, "TIRE_SERVICE_REQUEST_" + next, "tire_service_request", id, {});
  return result.rows[0];
}

export async function createTireEvent(vehicleId, body, user) {
  const type = clean(body.eventType).toUpperCase();
  if (!["PUNCTURE", "REPLACEMENT", "SPARE", "ROTATION", "INSPECTION", "OTHER"].includes(type)) {
    throw httpError(400, "Invalid tire event type.");
  }

  const position = clean(body.position) || null;
  const serial = clean(body.manufacturerSerial) || null;
  const outcome = clean(body.outcome).toLowerCase();

  const event = await transaction(async tx => {
    let oldAsset = null;

    if (body.tireAssetId) {
      const r = await tx.query(
        `SELECT * FROM tire_assets
         WHERE id=$1 AND vehicle_id=$2 AND active=true
         FOR UPDATE`,
        [body.tireAssetId, vehicleId]
      );
      oldAsset = r.rows[0] || null;
      if (!oldAsset) throw httpError(400, "Active tire not found for this vehicle.");
    } else if (position && ["REPLACEMENT", "SPARE", "PUNCTURE"].includes(type)) {
      oldAsset = await activeTireAt(tx, vehicleId, position);
    }

    const oldTireId = clean(body.oldTireId) || oldAsset?.tire_id || null;
    let newAsset = null;
    let eventPosition = position;

    if (type === "ROTATION") {
      if (!position) throw httpError(400, "Rotation requires a target position.");
      if (!oldAsset) {
        throw httpError(400, "Rotation requires the active tire (tireAssetId or position).");
      }
      await swapPositions(tx, vehicleId, oldAsset.position, position);
      eventPosition = `${oldAsset.position} → ${position}`;
    }

    if (type === "PUNCTURE") {
      if (outcome === "to_spare" && oldAsset) {
        await swapPositions(tx, vehicleId, oldAsset.position, "Spare");
        eventPosition = `${oldAsset.position} → Spare`;
      } else if (outcome === "replaced_with_spare" && oldAsset) {
        let spare = null;
        let sparePosName = null;

        for (const sp of SPARE_POSITIONS) {
          spare = await activeTireAt(tx, vehicleId, sp);
          if (spare) {
            sparePosName = sp;
            break;
          }
        }

        if (!spare) throw httpError(400, "No spare tire available on this vehicle.");

        await tx.query(
          `UPDATE tire_assets SET position=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
          [oldAsset.position, spare.id]
        );
        await deactivateTire(tx, oldAsset, "Punctured — replaced with spare.");
        newAsset = spare;
        eventPosition = `${sparePosName} → ${oldAsset.position}`;
      }
    }

    if (type === "SPARE") {
      if (!position) throw httpError(400, "Spare event requires a tire position.");

      let spare = null;
      let sparePosName = null;
      for (const sp of SPARE_POSITIONS) {
        spare = await activeTireAt(tx, vehicleId, sp);
        if (spare) {
          sparePosName = sp;
          break;
        }
      }

      if (!spare) throw httpError(400, "No spare tire available on this vehicle.");

      const target = oldAsset || await activeTireAt(tx, vehicleId, position);
      if (target && target.id !== spare.id) {
        await deactivateTire(tx, target, "Replaced with spare tire.");
      }

      if (spare.id !== target?.id) {
        await tx.query(
          `UPDATE tire_assets SET position=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
          [position, spare.id]
        );
      }

      newAsset = spare;
      eventPosition = `${sparePosName} → ${position}`;
    }

    if (type === "REPLACEMENT" || (type === "PUNCTURE" && outcome === "replaced_with_new")) {
      if (!position) throw httpError(400, "Replacement requires a tire position.");

      const currentAtPosition =
        oldAsset && oldAsset.position === position
          ? oldAsset
          : await activeTireAt(tx, vehicleId, position);

      if (currentAtPosition) {
        await deactivateTire(tx, currentAtPosition, clean(body.notes) || "Replaced.");
      }

      if (!serial && !clean(body.newTireId)) {
        throw httpError(400, "Provide the new tire manufacturer serial or tire ID.");
      }

      let newTireId = clean(body.newTireId);
      if (!newTireId) {
        const seq = await tx.query(`SELECT nextval('tire_id_seq') AS n`);
        newTireId = "T-" + String(seq.rows[0].n).padStart(6, "0");
      }

      const insert = await tx.query(
        `INSERT INTO tire_assets
          (vehicle_id,position,tire_id,manufacturer_serial,brand,model,size,
           tread_depth_mm,pressure_psi,condition_status,condition_notes,installed_km)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          vehicleId,
          position,
          newTireId,
          serial,
          clean(body.brand) || null,
          clean(body.model) || null,
          clean(body.size) || null,
          Number.isFinite(Number(body.treadDepthMm)) ? Number(body.treadDepthMm) : null,
          Number.isFinite(Number(body.pressurePsi)) ? Number(body.pressurePsi) : null,
          statusFor(body),
          clean(body.notes) || null,
          Number.isFinite(Number(body.installedKm)) ? Number(body.installedKm) : null
        ]
      ).catch(e => {
        if (e.code === "23505") {
          throw httpError(409, "This manufacturer serial is already registered.");
        }
        throw e;
      });

      newAsset = insert.rows[0];
    }

    const result = await tx.query(
      `INSERT INTO tire_events
        (vehicle_id,tire_asset_id,event_type,position,old_tire_id,new_tire_id,
         manufacturer_serial,outcome,notes,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        vehicleId,
        newAsset?.id || oldAsset?.id || null,
        type,
        eventPosition,
        oldTireId,
        newAsset?.tire_id || clean(body.newTireId) || null,
        serial,
        outcome || null,
        clean(body.notes) || null,
        user?.id || null
      ]
    );

    return { ...result.rows[0], old_tire: oldAsset, new_tire: newAsset };
  });

  await audit(user, "TIRE_EVENT_" + type, "vehicle", vehicleId, {
    eventId: event.id,
    position,
    outcome: outcome || null,
    serial: serial || null
  });

  return event;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[ch]));
}

function tireSurveyReportHtml(records, title, compactAllVehicles = false) {
  const JV_LOGO_URL = "https://pbs.twimg.com/media/G0B19WzaYAIKWy1.png";
  const COMPANY_NAME = "Maaden Ivanhoe Electric Exploration and Development Limited Company";
  const FOOTER_ROLE = "Fleet Manager / General Maintenance Supervisor";
  const FOOTER_NAME = "Hussein Anwar";

  const card = r => {
    const v = r.vehicle || {};
    const survey = r.survey || {};
    const tires = r.tires || [];
    const photos = survey.photos || {};
    const label = v.plate || [v.plate_number, v.plate_code].filter(Boolean).join(" ") || ("Vehicle ID " + v.id);

    const tireHtml = POSITIONS.map(p => {
      const t = tires.find(x => x.position === p) || {};
      return '<div class="tire">' +
        '<b>' + escapeHtml(p) + '</b><br>' +
        'Serial: ' + escapeHtml(t.manufacturer_serial || "-") + '<br>' +
        'Brand: ' + escapeHtml(t.brand || "-") + ' | Model: ' + escapeHtml(t.model || "-") + '<br>' +
        'Size: ' + escapeHtml(t.size || "-") + ' | Tread: ' + escapeHtml(t.tread_depth_mm ?? "-") + ' mm | PSI: ' + escapeHtml(t.pressure_psi ?? "-") + '<br>' +
        'Notes: ' + escapeHtml(t.condition_notes || "-") +
        '</div>';
    }).join("");

    const photoHtml = POSITIONS.map(p => photos[p]
      ? '<div><div class="photo-label">' + escapeHtml(p) + '</div><img src="' + escapeHtml(photos[p]) + '" alt="' + escapeHtml(p) + '"></div>'
      : ""
    ).join("");

    return '<section class="vehicle">' +
      '<header class="report-header">' +
        '<img class="company-logo" src="' + JV_LOGO_URL + '" alt="Maaden and Ivanhoe Electric">' +
        '<div class="company-heading">' +
          '<div class="company-name">' + escapeHtml(COMPANY_NAME) + '</div>' +
          '<div class="report-title">Initial Tire Survey Report</div>' +
        '</div>' +
      '</header>' +
      '<div class="report-body">' +
        '<h2>Vehicle ' + escapeHtml(label) + '</h2>' +
        '<div class="meta">Survey: ' + escapeHtml(survey.status || "SUBMITTED") +
          ' | Submitted: ' + escapeHtml(survey.submitted_at ? new Date(survey.submitted_at).toLocaleString() : "-") + '</div>' +
        '<div class="survey-content"><div class="photos">' + photoHtml + '</div>' +
        '<div class="tire-details">' + tireHtml + '</div></div>' +
        '<div class="notes"><b>Survey Notes:</b> ' + escapeHtml(survey.notes || "-") + '</div>' +
      '</div>' +
      '<footer class="report-footer">' +
        '<div>' + escapeHtml(FOOTER_ROLE) + '</div>' +
        '<div>' + escapeHtml(FOOTER_NAME) + '</div>' +
      '</footer>' +
    '</section>';
  };

  // Fleet-wide report: compact landscape cards, three vehicles per page.
  // Each card is kept intact; the single-vehicle report retains its full-page layout.
  const pages = compactAllVehicles
    ? Array.from({ length: Math.ceil(records.length / 3) }, (_, pageIndex) =>
        '<div class="all-surveys-page">' +
        records.slice(pageIndex * 3, pageIndex * 3 + 3)
          .map(r => '<div class="vehicle-slot">' + card(r) + '</div>')
          .join("") +
        '</div>'
      ).join("")
    : records.map(r => '<div class="page">' + card(r) + '</div>').join("");

  return '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title>' +
  '<style>' +
  '@page{size:A4 portrait;margin:7mm}' +
  '*{box-sizing:border-box}' +
  'html,body{margin:0;padding:0}' +
  'body{font-family:Arial,sans-serif;color:#111}' +
  '.toolbar{margin-bottom:10px}' +
  '@media print{.toolbar{display:none}}' +
  '.page{width:190mm;height:277mm;page-break-after:always;break-after:page;overflow:hidden}' +
  '.page:last-child{page-break-after:auto;break-after:auto}' +
  '.vehicle{width:100%;height:100%;border:1px solid #999;border-radius:5px;padding:6mm;overflow:hidden;display:flex;flex-direction:column}' +
  '.report-header{display:flex;align-items:center;gap:6mm;padding-bottom:4mm;border-bottom:1px solid #aaa;flex:0 0 auto}' +
  '.company-logo{width:30mm;height:18mm;object-fit:contain;object-position:center;display:block;flex:0 0 auto}' +
  '.company-heading{flex:1;min-width:0}' +
  '.company-name{font-size:11px;font-weight:700;line-height:1.25}' +
  '.report-title{font-size:8px;color:#555;margin-top:1mm}' +
  '.report-body{flex:1;min-height:0;overflow:hidden}' +
  '.vehicle h2{font-size:15px;margin:4mm 0 2mm}' +
  '.meta{font-size:8px;color:#444}' +
  '.tires{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:5px}' +
  '.tire{font-size:7px;border:1px solid #ddd;padding:3px;min-height:34px}' +
  '.photos{display:grid;grid-template-columns:repeat(6,1fr);gap:3px;margin-top:5px}' +
  '.photos img{width:100%;height:62px;object-fit:cover;border:1px solid #aaa;display:block}' +
  '.photo-label{font-size:6px;font-weight:bold;margin-bottom:2px}' +
  '.notes{font-size:7px;margin-top:4px}' +
  '.report-footer{flex:0 0 auto;margin-top:4mm;padding-top:2mm;border-top:1px solid #ccc;text-align:right;font-size:6.5px;line-height:1.35;color:#555}' +
  (compactAllVehicles ? '@media print{.bulk-report-heading,.toolbar{display:none!important}}' +
    '.all-surveys-page{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:repeat(3,minmax(0,1fr));gap:2mm;height:283mm;width:196mm;page-break-after:always;break-after:page;overflow:hidden;break-inside:avoid;page-break-inside:avoid}' +
    '.all-surveys-page:last-of-type{page-break-after:auto;break-after:auto}' +
    '.vehicle-slot{height:100%;min-height:0;overflow:hidden;break-inside:avoid;page-break-inside:avoid}' +
    '.all-surveys-page .vehicle{height:100%;padding:2mm 3mm;border-radius:3px;break-inside:avoid;page-break-inside:avoid;display:flex;flex-direction:column}' +
    '.all-surveys-page .report-header{gap:2.5mm;padding-bottom:1mm}' +
    '.all-surveys-page .company-logo{width:20mm;height:10mm}' +
    '.all-surveys-page .company-name{font-size:8px;line-height:1.1}' +
    '.all-surveys-page .report-title{font-size:6px;margin-top:0}' +
    '.all-surveys-page .report-body{display:flex;flex-direction:column;min-height:0;overflow:hidden;flex:1}' +
    '.all-surveys-page .vehicle h2{font-size:10px;margin:.8mm 0}' +
    '.all-surveys-page .meta{font-size:6px;line-height:1.15}' +
    '.all-surveys-page .survey-content{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:2mm;min-height:0;flex:1;margin-top:2mm;align-items:start}' +
    '.all-surveys-page .photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px;margin:0;align-content:start}' +
    '.all-surveys-page .photos img{height:48px;object-fit:cover}' +
    '.all-surveys-page .photo-label{font-size:5px;margin-bottom:1px}' +
    '.all-surveys-page .tire-details{display:grid;grid-template-columns:1fr;gap:2px;min-width:0}' +
    '.all-surveys-page .tire{font-size:5.8px;line-height:1.1;padding:2px;min-height:0;overflow-wrap:anywhere}' +
    '.all-surveys-page .notes{font-size:6px;line-height:1.1;margin-top:1.5px;max-height:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
    '.all-surveys-page .report-footer{margin-top:auto;padding-top:1mm;font-size:5.5px;line-height:1.1}' : '') + 
  '</style></head><body' + (compactAllVehicles ? ' class="all-surveys-report"' : '') + '>' +
  (compactAllVehicles ? '' : '<div class="bulk-report-heading" style="display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:3px solid #1e3a8a;padding:0 0 12px;margin:0 0 16px;page-break-inside:avoid"><img src="https://pbs.twimg.com/media/G0B19WzaYAIKWy1.png" alt="Ivanhoe Electric and Maaden" style="width:175px;max-height:78px;object-fit:contain"><div style="flex:1;text-align:right;font-family:Arial,sans-serif"><div style="font-size:15px;font-weight:700;color:#1e3a8a">Maaden Ivanhoe Electric Exploration and Development Limited Company</div><div style="font-size:10px;color:#475569;margin-top:3px">Exploration Phase — Arabian Shield</div><div style="font-size:12px;font-weight:700;margin-top:7px;color:#111827">Hussein Anwar</div><div style="font-size:10px;color:#475569;margin-top:2px">Fleet Manager / Fleet &amp; Camp Maintenance Supervisor</div></div></div>' +
  (compactAllVehicles ? '' : '<div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>') +
  pages +
  '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),500));</script>' +
  '</body></html>';
}
export async function mountTireRoutes(app) {
  app.get("/api/tire/survey-report/all", async (req, res) => {
    if (req.user?.role === "Driver") return res.status(403).send("Forbidden");
    try {
      const vehicles = await query(`SELECT id, plate, plate_number, plate_code FROM vehicles WHERE LOWER(TRIM(COALESCE(plate,''))) <> 'test 123' AND id IN (SELECT vehicle_id FROM tire_surveys WHERE submitted_at IS NOT NULL) ORDER BY plate, plate_number, id`);
      const records = [];
      const failures = [];
      // Load in small batches so a fleet-wide report does not time out on photo-heavy surveys.
      for (let i = 0; i < vehicles.rows.length; i += 5) {
        const batch = vehicles.rows.slice(i, i + 5);
        const results = await Promise.all(batch.map(async vehicle => {
          try {
            const data = await getVehicleTires(vehicle.id);
            return data.survey?.submitted_at ? { record: { vehicle, ...data } } : { skipped: vehicle.id };
          } catch (err) {
            console.error("[TireSurveyAllPDF] Vehicle", vehicle.id, err.message);
            return { failed: vehicle.id, error: err.message };
          }
        }));
        for (const result of results) {
          if (result.record) records.push(result.record);
          else if (result.failed) failures.push(result);
        }
      }
      if (!records.length) return res.status(404).send("No submitted tire surveys could be loaded");
      res.set("Cache-Control", "no-store");
      res.type("html").send(tireSurveyReportHtml(records, "Initial Tire Survey — All Submitted Vehicles", true));
    } catch (e) {
      console.error("[TireSurveyAllPDF]", e);
      res.status(500).send(e.message || "Unable to create all-vehicle tire survey report");
    }
  });

  app.get("/api/tire/survey-report/:vehicleId", async (req, res) => {
    if (req.user?.role === "Driver") return res.status(403).send("Forbidden");
    try {
      const v = await query(`SELECT id, plate, plate_number, plate_code FROM vehicles WHERE id=$1 LIMIT 1`, [req.params.vehicleId]);
      if (!v.rows[0]) return res.status(404).send("Vehicle not found");
      const data = await getVehicleTires(req.params.vehicleId);
      if (!data.survey) return res.status(404).send("No tire survey found for this vehicle");
      res.type("html").send(tireSurveyReportHtml([{vehicle:v.rows[0], ...data}], "Initial Tire Survey Report"));
    } catch (e) { res.status(500).send(e.message); }
  });




  await ensureTireSchema();

  app.get("/api/tire/driver/vehicles", async (req, res) => {
    try {
      if (String(req.user?.role || "").trim().toLowerCase() !== "driver") {
        return res.status(403).json({ success: false, error: "Driver only" });
      }

      // Vehicle Master is the single source of truth for driver assignment.
      // Resolve the logged-in Driver account to the Driver Master record, then
      // return only vehicles linked through vehicles.driver_id / drivers.vehicle_id.
      const userResult = await query(
        `SELECT id, username, full_name, phone
         FROM users
         WHERE id = $1 AND role = 'Driver'
         LIMIT 1`,
        [req.user?.id]
      );
      const user = userResult.rows[0] || req.user || {};
      const names = [user.full_name, user.username]
        .filter(Boolean)
        .map(v => String(v).trim().toLowerCase())
        .filter(Boolean);
      const phones = [user.phone]
        .filter(Boolean)
        .map(v => String(v).replace(/\D/g, ""))
        .filter(Boolean);

      const r = await query(
        `SELECT DISTINCT
            v.id, v.plate, v.plate_number, v.plate_code, v.driver, v.location
         FROM vehicles v
         LEFT JOIN drivers d ON d.id = v.driver_id
         WHERE LOWER(TRIM(COALESCE(v.plate, ''))) <> 'test 123'
           AND (
             LOWER(TRIM(COALESCE(d.name, ''))) = ANY($1::text[])
             OR LOWER(TRIM(COALESCE(v.driver, ''))) = ANY($1::text[])
             OR REGEXP_REPLACE(COALESCE(d.phone, ''), '[^0-9]', '', 'g') = ANY($2::text[])
             OR REGEXP_REPLACE(COALESCE(v.phone, ''), '[^0-9]', '', 'g') = ANY($2::text[])
             OR d.vehicle_id = v.id
           )
         ORDER BY v.plate_number, v.plate_code, v.id`,
        [names, phones]
      );

      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.json({ success: true, vehicles: r.rows });
    } catch (e) {
      console.error("[TireDriverVehicles]", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get("/api/tire/control", async (req, res) => {
    try {
      if (req.user?.role === "Driver") {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }
      res.json({ success: true, vehicles: await getTireControl() });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get("/api/tire/vehicle/:vehicleId/history", async (req, res) => {
    try {
      await assertDriverCanAccessVehicle(req, req.params.vehicleId);
      res.json({
        success: true,
        ...await getVehicleTrackingHistory(req.params.vehicleId)
      });
    } catch (e) {
      res.status(e.statusCode || 500).json({ success: false, error: e.message });
    }
  });

  app.get("/api/tire/vehicle/:vehicleId", async (req, res) => {
    try {
      await assertDriverCanAccessVehicle(req, req.params.vehicleId);
      res.json({
        success: true,
        ...await getVehicleTires(req.params.vehicleId)
      });
    } catch (e) {
      res.status(e.statusCode || 500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/tire/vehicle/:vehicleId/initial-survey", async (req, res) => {
    try {
      await assertDriverCanAccessVehicle(req, req.params.vehicleId);
      res.json({
        success: true,
        ...await submitInitialSurvey(req.params.vehicleId, req.body, req.user)
      });
    } catch (e) {
      res.status(e.statusCode || 500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/tire/vehicle/:vehicleId/reopen", async (req, res) => {
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ success: false, error: "Owner only" });
    }
    try {
      res.json({
        success: true,
        survey: await reopenInitialSurvey(
          req.params.vehicleId,
          req.user,
          req.body?.reason
        )
      });
    } catch (e) {
      res.status(e.statusCode || 400).json({ success: false, error: e.message });
    }
  });

  app.post("/api/tire/vehicle/:vehicleId/approve-survey", async (req, res) => {
    if (!["Owner", "FleetSupervisor"].includes(req.user?.role)) return res.status(403).json({ success: false, error: "Owner or Fleet Supervisor only" });
    try {
      res.json({ success: true, survey: await approveInitialSurvey(req.params.vehicleId, req.user) });
    } catch (e) {
      res.status(e.statusCode || 400).json({ success: false, error: e.message });
    }
  });

  app.put("/api/tire/vehicle/:vehicleId/tire/:tireId/position", async (req, res) => {
    if (!["Owner", "FleetSupervisor"].includes(req.user?.role)) return res.status(403).json({ success: false, error: "Owner or Fleet Supervisor only" });
    try {
      const tire = await changeTirePosition(req.params.vehicleId, req.params.tireId, clean(req.body?.position), req.user, req.body?.notes);
      res.json({ success: true, tire });
    } catch (e) {
      res.status(e.statusCode || 400).json({ success: false, error: e.message });
    }
  });

  app.put("/api/tire/vehicle/:vehicleId/tires/:tireId", async (req, res) => {
    if (!["Owner", "FleetSupervisor"].includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        error: "Owner or Fleet Supervisor only"
      });
    }
    try {
      res.json({
        success: true,
        tire: await updateTireAsset(
          req.params.vehicleId,
          req.params.tireId,
          req.body,
          req.user
        )
      });
    } catch (e) {
      res.status(e.statusCode || 400).json({ success: false, error: e.message });
    }
  });

  app.put("/api/tire/admin/tires/vehicle/:vehicleId/tires", async (req, res) => {
    if (!["Owner", "FleetSupervisor"].includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        error: "Owner or Fleet Supervisor only"
      });
    }

    try {
      const tires = await updateVehicleTiresAfterApproval(
        req.params.vehicleId,
        req.body?.tires,
        req.user
      );
      res.json({ ok: true, success: true, tires });
    } catch (e) {
      res.status(e.statusCode || 400).json({ success: false, error: e.message });
    }
  });

  app.get("/api/tire/service-requests", async (req, res) => {
    try {
      res.json({
        success: true,
        requests: await listTireServiceRequests({
          vehicle: req.query.vehicle,
          status: req.query.status
        })
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.put("/api/tire/service-requests/:id", async (req, res) => {
    if (!["Owner","FleetSupervisor"].includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: "Owner or Fleet Supervisor only" });
    }
    const allowedStatuses = ["PENDING","APPROVED","IN_PROGRESS","COMPLETED","REJECTED","CANCELLED"];
    const requestedStatus = String(req.body?.status || "").trim().toUpperCase();
    if (!allowedStatuses.includes(requestedStatus)) {
      return res.status(400).json({ success:false, error:"Invalid tire service request status." });
    }
    try {
      res.json({
        success: true,
        request: await updateTireServiceRequestStatus(
          req.params.id,
          req.body.status,
          req.user
        )
      });
    } catch (e) {
      res.status(e.statusCode || 400).json({ success: false, error: e.message });
    }
  });

  app.post("/api/tire/vehicle/:vehicleId/service-request", async (req, res) => {
    try {
      await assertDriverCanAccessVehicle(req, req.params.vehicleId);
      res.json({
        success: true,
        request: await createTireServiceRequest(
          req.params.vehicleId,
          req.body,
          req.user?.id
        )
      });
    } catch (e) {
      res.status(e.statusCode || 400).json({ success: false, error: e.message });
    }
  });

  app.post("/api/tire/vehicle/:vehicleId/event", async (req, res) => {
    try {
      await assertDriverCanAccessVehicle(req, req.params.vehicleId);
      res.json({
        success: true,
        event: await createTireEvent(
          req.params.vehicleId,
          req.body,
          req.user
        )
      });
    } catch (e) {
      res.status(e.statusCode || 400).json({ success: false, error: e.message });
    }
  });
}
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
  if (process.env.TIRE_DRIVER_SCOPING !== "true") return;
  if (req.user?.role !== "Driver") return;
  const r = await query(`SELECT driver FROM vehicles WHERE id = $1 LIMIT 1`, [vehicleId]);
  const assigned = clean(r.rows[0]?.driver).toLowerCase();
  const me = [req.user.full_name, req.user.username]
    .filter(Boolean)
    .map(s => s.trim().toLowerCase());
  if (!assigned || !me.includes(assigned)) {
    throw httpError(403, "This vehicle is not assigned to you.");
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
  const a = await activeTireAt(tx, vehicleId, posA);
  const b = await activeTireAt(tx, vehicleId, posB);
  if (!a && !b) throw httpError(400, `No active tires at ${posA} or ${posB}.`);

  // Use a temporary position to avoid the unique-position collision during rotation.
  if (a && b) {
    const temp = `__ROTATE__${Date.now()}_${a.id}`;
    await tx.query(
      `UPDATE tire_assets SET position = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [temp, a.id]
    );
    await tx.query(
      `UPDATE tire_assets SET position = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [posA, b.id]
    );
    await tx.query(
      `UPDATE tire_assets SET position = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [posB, a.id]
    );
  } else if (a) {
    await tx.query(
      `UPDATE tire_assets SET position = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [posB, a.id]
    );
  } else if (b) {
    await tx.query(
      `UPDATE tire_assets SET position = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [posA, b.id]
    );
  }
  return { a, b };
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tire_assets_serial_unique
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
    ALTER TABLE tire_assets ADD COLUMN IF NOT EXISTS installed_km BIGINT;
    ALTER TABLE tire_events ADD COLUMN IF NOT EXISTS outcome TEXT;
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
      v.id, v.plate, v.driver, v.location,
      COALESCE(today_km.reading_km, 0) AS current_km,
      COALESCE(oil_history.oil_change_km, v.last_oil_km) AS last_oil_km,
      COALESCE(v.oil_change_interval, 5000) AS oil_change_interval,
      COALESCE(oil_history.oil_change_date, v.last_oil_change_date) AS last_oil_change_date,
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
          'size', t.size, 'treadDepthMm', t.tread_depth_mm,
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
      v.id, v.plate, v.driver, v.location, v.last_oil_km,
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
    } else if (drivenSinceOil >= oilInterval * 0.8) {
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
  if (existing.rows[0]?.status === "LOCKED") {
    throw httpError(409, "Initial Tire Survey is already completed and locked. Only management can reopen it.");
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

      const tireId =
        clean(tire.tireId) ||
        ("T-" + vehicleId + "-" + Date.now() + "-" + position.replace(/\s+/g, "-"));

      const inserted = await tx.query(
        `INSERT INTO tire_assets
         (vehicle_id, position, tire_id, manufacturer_serial, brand, model, size,
          tread_depth_mm, pressure_psi, condition_status, condition_notes, installed_km)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          vehicleId,
          position,
          tireId,
          clean(tire.manufacturerSerial) || null,
          clean(tire.brand) || null,
          clean(tire.model) || null,
          clean(tire.size) || null,
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
       (vehicle_id,status,photos,notes,submitted_by,submitted_at,updated_at)
       VALUES ($1,'LOCKED',$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT(vehicle_id) DO UPDATE SET
         status='LOCKED', photos=EXCLUDED.photos, notes=EXCLUDED.notes,
         submitted_by=EXCLUDED.submitted_by, submitted_at=CURRENT_TIMESTAMP,
         updated_at=CURRENT_TIMESTAMP
       RETURNING *`,
      [vehicleId, photosJson, clean(body.notes) || null, user?.id || null]
    );

    return saved.rows[0];
  });

  await audit(user, "TIRE_INITIAL_SURVEY_LOCKED", "vehicle", vehicleId, { surveyId: result.id });
  return await getVehicleTires(vehicleId);
}

export async function reopenInitialSurvey(vehicleId, user, reason) {
  if (!clean(reason)) throw httpError(400, "Reopen reason is required.");

  const result = await query(
    `UPDATE tire_surveys
     SET status='OPEN', reopened_by=$2, reopened_at=CURRENT_TIMESTAMP,
         reopen_reason=$3, updated_at=CURRENT_TIMESTAMP
     WHERE vehicle_id=$1 RETURNING *`,
    [vehicleId, user?.id || null, clean(reason)]
  );

  if (!result.rows[0]) throw httpError(404, "Initial Tire Survey not found.");
  await audit(user, "TIRE_INITIAL_SURVEY_REOPENED", "vehicle", vehicleId, {
    reason: clean(reason)
  });
  return result.rows[0];
}

export async function updateTireAsset(vehicleId, tireId, body, user) {
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

export async function createTireServiceRequest(vehicleId, body, userId) {
  const allowed = ["TIRE_SHOP_VISIT", "TIRE_REPLACEMENT_DAMAGE", "PUNCTURE_REPAIR", "OTHER"];
  const requestType = clean(body.requestType);
  if (!allowed.includes(requestType)) {
    throw httpError(400, "Invalid tire service request type.");
  }

  const notes = clean(body.notes);
  if (!notes) throw httpError(400, "Please describe the tire issue or required service.");

  const result = await query(
    `INSERT INTO tire_service_requests
     (vehicle_id,request_type,position,notes,photo,created_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      vehicleId,
      requestType,
      clean(body.position) || null,
      notes,
      clean(body.photo) || null,
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

        // Put spare in the failed tire's position, then retire the failed tire.
        // The spare position is intentionally left available.
        await tx.query(
          `UPDATE tire_assets SET position=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
          [oldAsset.position, spare.id]
        );
        await deactivateTire(tx, oldAsset, "Punctured — replaced with spare.");
        newAsset = spare;
        eventPosition = `${sparePosName} → ${oldAsset.position}`;
      }
      // same_position / repaired: event only.
      // replaced_with_new: continue through replacement below.
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

      const newTireId = clean(body.newTireId) || ("T-" + vehicleId + "-" + Date.now());

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

export async function mountTireRoutes(app) {
  await ensureTireSchema();

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
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ success: false, error: "Owner only" });
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

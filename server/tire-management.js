import { query, transaction } from "./postgres.js";

const POSITIONS = [
  "Front Left",
  "Front Right",
  "Rear Left",
  "Rear Right",
  "Spare",
  "Sixth"
];

function clean(v) {
  return String(v ?? "").trim();
}

function statusFor(tire) {
  const explicit = clean(tire.condition_status || tire.status).toLowerCase();
  if (["red","yellow","green"].includes(explicit)) return explicit;
  const tread = Number(tire.tread_depth_mm);
  if (Number.isFinite(tread)) {
    if (tread <= 2) return "red";
    if (tread <= 4) return "yellow";
  }
  return "green";
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
      notes TEXT,
      event_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tire_events_vehicle ON tire_events(vehicle_id, event_date DESC);
  `);
}

export async function getTireControl() {
  await query(`
    ALTER TABLE periodic_maintenance
      ADD COLUMN IF NOT EXISTS last_service_km INTEGER,
      ADD COLUMN IF NOT EXISTS last_service_date DATE,
      ADD COLUMN IF NOT EXISTS next_due_km INTEGER,
      ADD COLUMN IF NOT EXISTS interval_km INTEGER DEFAULT 5000,
      ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 180
  `);

  const vehicles = await query(`
    SELECT v.id,
      COALESCE(NULLIF(v.plate, ''), CONCAT_WS(' ', v.plate_number, v.plate_code)) AS plate,
      v.plate_number, v.plate_code, v.driver, v.location,
      v.current_km, v.last_oil_km, v.last_oil_change_date, COALESCE(v.oil_change_interval, 5000) AS oil_change_interval,
      v.inspection_last_date, v.inspection_due_date,
      s.status AS survey_status, s.submitted_at,
      COALESCE(json_agg(
        json_build_object(
          'id', t.id, 'tireId', t.tire_id, 'position', t.position,
          'serial', t.manufacturer_serial, 'brand', t.brand, 'model', t.model,
          'size', t.size, 'treadDepthMm', t.tread_depth_mm,
          'pressurePsi', t.pressure_psi, 'status', t.condition_status,
          'notes', t.condition_notes, 'active', t.active
        ) ORDER BY t.position
      ) FILTER (WHERE t.id IS NOT NULL), '[]'::json) AS tires,
      pm.maintenance_due_date,
      pm.maintenance_last_date
    FROM vehicles v
    LEFT JOIN tire_surveys s ON s.vehicle_id=v.id
    LEFT JOIN tire_assets t ON t.vehicle_id=v.id AND t.active=true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(pm.next_due_km::text, pm.scheduled_date::text) AS maintenance_due_date,
        COALESCE(pm.last_service_date::text, pm.completed_date::text, pm.scheduled_date::text) AS maintenance_last_date
      FROM periodic_maintenance pm
      WHERE pm.vehicle_id=v.id
        AND LOWER(COALESCE(pm.type,'')) NOT IN ('oil_change','oil change','oil')
      ORDER BY CASE WHEN pm.status='Pending' THEN 0 ELSE 1 END,
        COALESCE(pm.scheduled_date, pm.last_service_date) DESC NULLS LAST, pm.id DESC
      LIMIT 1
    ) pm ON TRUE
    GROUP BY v.id, v.plate, v.plate_number, v.plate_code, v.driver, v.location,
      v.current_km, v.last_oil_km, v.last_oil_change_date, v.oil_change_interval,
      v.inspection_last_date, v.inspection_due_date, s.status, s.submitted_at,
      pm.maintenance_due_date, pm.maintenance_last_date
    ORDER BY plate
  `);
  const today = new Date();
  const dateStatus = (value, warnDays=30) => {
    if (!value) return "red";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "red";
    const days = Math.ceil((d.getTime() - today.getTime()) / 86400000);
    if (days < 0) return "red";
    if (days <= warnDays) return "yellow";
    return "green";
  };

  return vehicles.rows.map(v => {
    const tires = (v.tires || []).map(t => ({...t, status: statusFor(t)}));
    const tireStatus = tires.length < 6 ? "red" : tires.some(t => t.status === "red") ? "red" : tires.some(t => t.status === "yellow") ? "yellow" : "green";
    const currentKm = Number(v.current_km || 0);
    const lastOilKm = Number(v.last_oil_km || 0);
    const oilInterval = Number(v.oil_change_interval || 5000);
    const kmSinceOil = currentKm - lastOilKm;
    const oilStatus = (!lastOilKm || !currentKm) ? "red" : kmSinceOil >= oilInterval ? "red" : kmSinceOil >= oilInterval - 500 ? "yellow" : "green";
    const maintenanceStatus = dateStatus(v.maintenance_due_date, 30);
    const inspectionStatus = dateStatus(v.inspection_due_date, 30);
    const overall = [tireStatus, oilStatus, maintenanceStatus, inspectionStatus].includes("red") ? "red" : [tireStatus, oilStatus, maintenanceStatus, inspectionStatus].includes("yellow") ? "yellow" : "green";
    return {
      ...v, tires, tireStatus, oilStatus, oilKmRemaining: Math.max(0, oilInterval - kmSinceOil),
      maintenanceStatus, inspectionStatus, overallStatus: overall,
      red: tires.filter(t => t.status === "red").length,
      yellow: tires.filter(t => t.status === "yellow").length,
      green: tires.filter(t => t.status === "green").length
    };
  });
}

export async function getVehicleTires(vehicleId) {
  const survey = await query(`SELECT * FROM tire_surveys WHERE vehicle_id=$1 LIMIT 1`, [vehicleId]);
  const tires = await query(`
    SELECT * FROM tire_assets WHERE vehicle_id=$1 AND active=true ORDER BY id
  `, [vehicleId]);
  const events = await query(`
    SELECT e.*, t.tire_id
    FROM tire_events e LEFT JOIN tire_assets t ON t.id=e.tire_asset_id
    WHERE e.vehicle_id=$1 ORDER BY e.event_date DESC, e.id DESC LIMIT 100
  `, [vehicleId]);
  return {
    survey: survey.rows[0] || null,
    tires: tires.rows.map(t => ({...t, condition_status: statusFor(t)})),
    events: events.rows
  };
}

export async function submitInitialSurvey(vehicleId, body, userId) {
  const existing = await query(`SELECT * FROM tire_surveys WHERE vehicle_id=$1 LIMIT 1`, [vehicleId]);
  if (existing.rows[0]?.status === "LOCKED") {
    const e = new Error("Initial Tire Survey is already completed and locked. Only management can reopen it.");
    e.statusCode = 409;
    throw e;
  }

  const tires = Array.isArray(body.tires) ? body.tires : [];
  if (tires.length !== 6) {
    const e = new Error("Exactly 6 tire records are required.");
    e.statusCode = 400;
    throw e;
  }

  const photos = body.photos && typeof body.photos === "object" ? body.photos : {};
  for (const p of POSITIONS) {
    if (!clean(photos[p])) {
      const e = new Error("Photo is required for " + p + ".");
      e.statusCode = 400;
      throw e;
    }
  }

  return await transaction(async (tx) => {
    await tx.query(`UPDATE tire_assets SET active=false, removed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE vehicle_id=$1 AND active=true`, [vehicleId]);

    for (const tire of tires) {
      const position = clean(tire.position);
      if (!POSITIONS.includes(position)) throw new Error("Invalid tire position: " + position);
      const tireId = clean(tire.tireId) || ("T-" + vehicleId + "-" + Date.now() + "-" + position.replace(/\\s+/g, "-"));
      const result = await tx.query(`
        INSERT INTO tire_assets
        (vehicle_id, position, tire_id, manufacturer_serial, brand, model, size,
         tread_depth_mm, pressure_psi, condition_status, condition_notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING id
      `, [
        vehicleId, position, tireId, clean(tire.manufacturerSerial) || null,
        clean(tire.brand) || null, clean(tire.model) || null, clean(tire.size) || null,
        Number.isFinite(Number(tire.treadDepthMm)) ? Number(tire.treadDepthMm) : null,
        Number.isFinite(Number(tire.pressurePsi)) ? Number(tire.pressurePsi) : null,
        statusFor(tire), clean(tire.notes) || null
      ]);
      await tx.query(`
        INSERT INTO tire_events
        (vehicle_id,tire_asset_id,event_type,position,new_tire_id,manufacturer_serial,notes,created_by)
        VALUES ($1,$2,'INITIAL_SURVEY',$3,$4,$5,$6,$7)
      `, [vehicleId, result.rows[0].id, position, tireId, clean(tire.manufacturerSerial) || null, clean(tire.notes) || null, userId || null]);
    }

    const saved = await tx.query(`
      INSERT INTO tire_surveys (vehicle_id,status,photos,notes,submitted_by,submitted_at,updated_at)
      VALUES ($1,'LOCKED',$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(vehicle_id) DO UPDATE SET
        status='LOCKED', photos=EXCLUDED.photos, notes=EXCLUDED.notes,
        submitted_by=EXCLUDED.submitted_by, submitted_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
      RETURNING *
    `, [vehicleId, JSON.stringify(photos), clean(body.notes) || null, userId || null]);

    return saved.rows[0];
  }).then(async () => getVehicleTires(vehicleId));
}

export async function reopenInitialSurvey(vehicleId, userId) {
  const result = await query(`
    UPDATE tire_surveys
    SET status='OPEN', reopened_by=$2, reopened_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE vehicle_id=$1 RETURNING *
  `, [vehicleId, userId || null]);
  if (!result.rows[0]) throw new Error("Initial Tire Survey not found.");
  return result.rows[0];
}

export async function createTireEvent(vehicleId, body, userId) {
  const type = clean(body.eventType);
  if (!["PUNCTURE","REPLACEMENT","SPARE","ROTATION","INSPECTION","OTHER"].includes(type)) {
    throw new Error("Invalid tire event type.");
  }

  const position = clean(body.position) || null;
  const serial = clean(body.manufacturerSerial) || null;

  return transaction(async (tx) => {
    let oldAsset = null;
    if (body.tireAssetId) {
      const oldResult = await tx.query(
        `SELECT * FROM tire_assets WHERE id=$1 AND vehicle_id=$2 AND active=true FOR UPDATE`,
        [body.tireAssetId, vehicleId]
      );
      oldAsset = oldResult.rows[0] || null;
      if (!oldAsset) throw new Error("Active tire not found for this vehicle.");
    }

    const oldTireId = clean(body.oldTireId) || oldAsset?.tire_id || null;
    let newAsset = null;

    if (type === "ROTATION") {
      if (!oldAsset || !position) throw new Error("Rotation requires the active tire and new position.");
      const duplicate = await tx.query(
        `SELECT id FROM tire_assets WHERE vehicle_id=$1 AND position=$2 AND active=true AND id<>$3 LIMIT 1`,
        [vehicleId, position, oldAsset.id]
      );
      if (duplicate.rows[0]) throw new Error("Another active tire already occupies this position.");
      await tx.query(
        `UPDATE tire_assets SET position=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
        [position, oldAsset.id]
      );
    }

    if (type === "REPLACEMENT" || type === "SPARE") {
      if (!position) throw new Error("Replacement/spare event requires a tire position.");

      if (oldAsset) {
        await tx.query(
          `UPDATE tire_assets SET active=false, removed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [oldAsset.id]
        );
      }

      const newTireId = clean(body.newTireId) || (serial ? "T-" + vehicleId + "-" + Date.now() : "");
      if (newTireId) {
        const insert = await tx.query(`
          INSERT INTO tire_assets
            (vehicle_id,position,tire_id,manufacturer_serial,brand,model,size,
             tread_depth_mm,pressure_psi,condition_status,condition_notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          RETURNING *
        `, [
          vehicleId, position, newTireId, serial,
          clean(body.brand) || null, clean(body.model) || null, clean(body.size) || null,
          Number.isFinite(Number(body.treadDepthMm)) ? Number(body.treadDepthMm) : null,
          Number.isFinite(Number(body.pressurePsi)) ? Number(body.pressurePsi) : null,
          statusFor(body), clean(body.notes) || null
        ]);
        newAsset = insert.rows[0];
      }
    }

    const result = await tx.query(`
      INSERT INTO tire_events
        (vehicle_id,tire_asset_id,event_type,position,old_tire_id,new_tire_id,manufacturer_serial,notes,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      vehicleId, newAsset?.id || oldAsset?.id || null, type, position,
      oldTireId, newAsset?.tire_id || clean(body.newTireId) || null,
      serial, clean(body.notes) || null, userId || null
    ]);

    return { ...result.rows[0], old_tire: oldAsset, new_tire: newAsset };
  });
}

export async function mountTireRoutes(app) {
  await ensureTireSchema();

  app.get("/api/tire/control", async (req,res) => {
    try { res.json({success:true, vehicles: await getTireControl()}); }
    catch(e){ res.status(500).json({success:false,error:e.message}); }
  });

  app.get("/api/tire/vehicle/:vehicleId", async (req,res) => {
    try { res.json({success:true,...await getVehicleTires(req.params.vehicleId)}); }
    catch(e){ res.status(500).json({success:false,error:e.message}); }
  });

  app.post("/api/tire/vehicle/:vehicleId/initial-survey", async (req,res) => {
    try { res.json({success:true,...await submitInitialSurvey(req.params.vehicleId,req.body,req.user?.id)}); }
    catch(e){ res.status(e.statusCode || 500).json({success:false,error:e.message}); }
  });

  app.post("/api/tire/vehicle/:vehicleId/reopen", async (req,res) => {
    if (req.user?.role !== "Owner") return res.status(403).json({success:false,error:"Owner only"});
    try { res.json({success:true,survey:await reopenInitialSurvey(req.params.vehicleId,req.user?.id)}); }
    catch(e){ res.status(400).json({success:false,error:e.message}); }
  });

  app.post("/api/tire/vehicle/:vehicleId/event", async (req,res) => {
    try { res.json({success:true,event:await createTireEvent(req.params.vehicleId,req.body,req.user?.id)}); }
    catch(e){ res.status(400).json({success:false,error:e.message}); }
  });
}

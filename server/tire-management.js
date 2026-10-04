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

    CREATE TABLE IF NOT EXISTS tire_service_requests (
      id BIGSERIAL PRIMARY KEY, vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      request_type TEXT NOT NULL, position TEXT, notes TEXT NOT NULL, photo TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING', created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tire_service_requests_vehicle ON tire_service_requests(vehicle_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tire_service_requests_status ON tire_service_requests(status, created_at DESC);
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
      WHERE type = 'inspection' AND status = 'Completed' AND completed_date IS NOT NULL
      ORDER BY vehicle_id, completed_date DESC, id DESC
    )
    SELECT v.id, v.plate, v.driver, v.location,
      v.current_km, oc.oil_change_km AS last_oil_km, COALESCE(v.oil_change_interval,5000) AS oil_change_interval,
      oc.oil_change_date AS last_oil_change_date, v.inspection_last_date, v.inspection_due_date,
      s.status AS survey_status, s.submitted_at,
      i.completed_date AS inspection_record_date,
      m.status AS maintenance_status, m.completed_date AS maintenance_completed_date,
      m.notes AS maintenance_notes, m.scheduled_date AS maintenance_scheduled_date,
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
      SELECT oil_change_km, oil_change_date
      FROM oil_changes
      WHERE vehicle_id=v.id
        AND COALESCE(notes,'') NOT ILIKE '%Google Sheet%'
      ORDER BY oil_change_date DESC NULLS LAST, id DESC
      LIMIT 1
    ) oc ON true
    LEFT JOIN tire_surveys s ON s.vehicle_id=v.id
    LEFT JOIN tire_assets t ON t.vehicle_id=v.id AND t.active=true
    LEFT JOIN latest_6m m ON m.vehicle_id=v.id
    LEFT JOIN latest_inspection i ON i.vehicle_id=v.id
    GROUP BY v.id, v.plate, v.driver, v.location, v.current_km, v.last_oil_km,
      v.oil_change_interval, oc.oil_change_km, oc.oil_change_date, v.inspection_last_date, v.inspection_due_date,
      s.status, s.submitted_at, i.completed_date, m.status, m.completed_date, m.notes, m.scheduled_date
    WHERE LOWER(TRIM(COALESCE(v.plate,''))) <> 'test 123'
    ORDER BY v.plate
  `);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysBetween = (a,b) => Math.floor((b.getTime()-a.getTime()) / 86400000);

  return vehicles.rows.map(v => {
    const tires = (v.tires || []).map(t => ({...t, status: statusFor(t)}));
    const tireWorst = tires.length === 0 ? "red" :
      (tires.some(t => t.status === "red") ? "red" : tires.some(t => t.status === "yellow") ? "yellow" : "green");
    const tireReason = tires.length === 0 ? "Initial tire survey not completed" :
      (tires.some(t => t.status === "red") ? "One or more tires require immediate attention" :
       tires.some(t => t.status === "yellow") ? "One or more tires are approaching limit" : "All recorded tires are within limits");

    const currentKm = Number(v.current_km || 0);
    const lastOilKm = Number(v.last_oil_km || 0);
    const oilInterval = Number(v.oil_change_interval || 5000);
    const oilDueKm = lastOilKm > 0 ? lastOilKm + oilInterval : null;
    let oilStatus = "red", oilReason = "Last oil change KM is not recorded";
    if (oilDueKm !== null && currentKm >= oilDueKm) {
      oilStatus = "red"; oilReason = `Oil overdue by ${(currentKm-oilDueKm).toLocaleString()} km`;
    } else if (oilDueKm !== null && currentKm >= oilDueKm - 500) {
      oilStatus = "yellow"; oilReason = `Oil due in ${(oilDueKm-currentKm).toLocaleString()} km`;
    } else if (oilDueKm !== null) {
      oilStatus = "green"; oilReason = `Oil due at ${oilDueKm.toLocaleString()} km`;
    }

    const maintenanceDate = v.maintenance_completed_date ? new Date(v.maintenance_completed_date) : null;
    let maintenanceStatus = "red", maintenanceReason = "No completed 6-month maintenance evidence";
    if (maintenanceDate) {
      const days = daysBetween(maintenanceDate, today);
      if (days > 180) {
        maintenanceStatus = "red"; maintenanceReason = `6-month maintenance overdue by ${days-180} days`;
      } else if (days >= 150) {
        maintenanceStatus = "yellow"; maintenanceReason = `6-month maintenance due in ${180-days} days`;
      } else {
        maintenanceStatus = "green"; maintenanceReason = `Last completed ${days} days ago`;
      }


    const inspectionRecordDate = v.inspection_record_date ? new Date(v.inspection_record_date) : null;
    const vehicleInspectionDate = v.inspection_last_date ? new Date(v.inspection_last_date) : null;
    const inspectionDate = [inspectionRecordDate, vehicleInspectionDate].filter(Boolean).sort((a,b)=>b-a)[0] || null;
    let inspectionStatus = "red", inspectionReason = "No actual annual inspection evidence";
    if (inspectionDate) {
      const due = new Date(inspectionDate); due.setDate(due.getDate()+365);
      const daysLeft = daysBetween(today, due);
      if (daysLeft < 0) {
        inspectionStatus = "red"; inspectionReason = `Annual inspection overdue by ${Math.abs(daysLeft)} days`;
      } else if (daysLeft <= 30) {
        inspectionStatus = "yellow"; inspectionReason = `Annual inspection due in ${daysLeft} days`;
      } else {
        inspectionStatus = "green"; inspectionReason = `Inspected ${daysBetween(inspectionDate,today)} days ago`;
      }
    }

    const rank = {red:0,yellow:1,green:2};
    const statuses = [tireWorst, oilStatus, maintenanceStatus, inspectionStatus];
    const overallStatus = statuses.sort((a,b)=>(rank[a]??2)-(rank[b]??2))[0];

    return {
      ...v,
      tires,
      tireStatus:tireWorst, tireReason,
      oilStatus, oilReason, oilDueKm,
      maintenanceStatus, maintenanceReason,
      inspectionStatus, inspectionReason,
      overallStatus,
      red: tires.filter(t => t.status === "red").length,
      yellow: tires.filter(t => t.status === "yellow").length,
      green: tires.filter(t => t.status === "green").length
    };
  });
}


export async function getVehicleTrackingHistory(vehicleId) {
  const [workOrders, periodic, oilChanges, tickets, tireEvents] = await Promise.all([
    query(`SELECT * FROM work_orders WHERE vehicle_id=$1 ORDER BY reported_date DESC NULLS LAST, id DESC LIMIT 500`, [vehicleId]),
    query(`SELECT * FROM periodic_maintenance WHERE vehicle_id=$1 ORDER BY COALESCE(completed_date, scheduled_date) DESC NULLS LAST, id DESC LIMIT 500`, [vehicleId]),
    query(`SELECT * FROM oil_changes WHERE vehicle_id=$1 ORDER BY oil_change_date DESC NULLS LAST, id DESC LIMIT 500`, [vehicleId]),
    query(`SELECT * FROM tickets WHERE vehicle_id=$1 ORDER BY opened_at DESC NULLS LAST, id DESC LIMIT 500`, [vehicleId]),
    query(`SELECT e.*, t.tire_id FROM tire_events e LEFT JOIN tire_assets t ON t.id=e.tire_asset_id WHERE e.vehicle_id=$1 ORDER BY e.event_date DESC, e.id DESC LIMIT 500`, [vehicleId])
  ]);
  return {
    workOrders: workOrders.rows,
    periodicMaintenance: periodic.rows,
    oilChanges: oilChanges.rows,
    tickets: tickets.rows,
    tireEvents: tireEvents.rows
  };
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

export async function createTireServiceRequest(vehicleId, body, userId) {
  const allowed = ["TIRE_SHOP_VISIT", "TIRE_REPLACEMENT_DAMAGE", "PUNCTURE_REPAIR", "OTHER"];
  const requestType = clean(body.requestType);
  if (!allowed.includes(requestType)) { const e=new Error("Invalid tire service request type."); e.statusCode=400; throw e; }
  const notes=clean(body.notes);
  if(!notes){ const e=new Error("Please describe the tire issue or required service."); e.statusCode=400; throw e; }
  const result=await query(`INSERT INTO tire_service_requests (vehicle_id,request_type,position,notes,photo,created_by)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [vehicleId,requestType,clean(body.position)||null,notes,clean(body.photo)||null,userId||null]);
  return result.rows[0];
}

export async function listTireServiceRequests(filters={}) {
  const params=[]; const where=[]; const vehicle=clean(filters.vehicle); const status=clean(filters.status).toUpperCase();
  if(vehicle){ params.push("%"+vehicle+"%"); where.push("(COALESCE(v.plate,'') ILIKE $1 OR COALESCE(v.plate_number,'') ILIKE $1 OR COALESCE(v.plate_code,'') ILIKE $1)"); }
  if(status){ params.push(status); where.push("UPPER(r.status) = $"+params.length); }
  const sql=`SELECT r.*, COALESCE(v.plate, CONCAT_WS(' ',v.plate_number,v.plate_code)) AS plate, v.driver, u.name AS created_by_name
    FROM tire_service_requests r
    LEFT JOIN vehicles v ON v.id=r.vehicle_id
    LEFT JOIN users u ON u.id=r.created_by
    ${where.length?"WHERE "+where.join(" AND "):""}
    ORDER BY r.created_at DESC, r.id DESC LIMIT 500`;
  return (await query(sql,params)).rows;
}

export async function updateTireServiceRequestStatus(id,status) {
  const allowed=["PENDING","APPROVED","IN_PROGRESS","COMPLETED","REJECTED","CANCELLED"];
  const next=clean(status).toUpperCase();
  if(!allowed.includes(next)) throw new Error("Invalid tire service request status.");
  const result=await query(`UPDATE tire_service_requests SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,[next,id]);
  if(!result.rows[0]){const e=new Error("Tire service request not found.");e.statusCode=404;throw e;}
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

  app.get("/api/tire/vehicle/:vehicleId/history", async (req,res) => {
    try { res.json({success:true,...await getVehicleTrackingHistory(req.params.vehicleId)}); }
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

  app.get("/api/tire/service-requests", async (req,res) => {
    try { res.json({success:true,requests:await listTireServiceRequests({vehicle:req.query.vehicle,status:req.query.status})}); }
    catch(e){ res.status(500).json({success:false,error:e.message}); }
  });

  app.put("/api/tire/service-requests/:id", async (req,res) => {
    if(req.user?.role!=="Owner") return res.status(403).json({success:false,error:"Owner only"});
    try { res.json({success:true,request:await updateTireServiceRequestStatus(req.params.id,req.body.status)}); }
    catch(e){ res.status(e.statusCode||400).json({success:false,error:e.message}); }
  });

  app.post("/api/tire/vehicle/:vehicleId/service-request", async (req,res) => {
    try { res.json({success:true,request:await createTireServiceRequest(req.params.vehicleId,req.body,req.user?.id)}); }
    catch(e){ res.status(e.statusCode||400).json({success:false,error:e.message}); }
  });

  app.post("/api/tire/vehicle/:vehicleId/event", async (req,res) => {
    try { res.json({success:true,event:await createTireEvent(req.params.vehicleId,req.body,req.user?.id)}); }
    catch(e){ res.status(400).json({success:false,error:e.message}); }
  });
}

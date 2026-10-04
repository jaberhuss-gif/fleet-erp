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
        AND (status = 'Completed' OR COALESCE(TRIM(notes), '') <> '')
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
      v.current_km, v.last_oil_km, COALESCE(v.oil_change_interval,5000) AS oil_change_interval,
      v.last_oil_change_date, v.inspection_last_date, v.inspection_due_date,
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
    LEFT JOIN tire_surveys s ON s.vehicle_id=v.id
    LEFT JOIN tire_assets t ON t.vehicle_id=v.id AND t.active=true
    LEFT JOIN latest_6m m ON m.vehicle_id=v.id
    LEFT JOIN latest_inspection i ON i.vehicle_id=v.id
    GROUP BY v.id, v.plate, v.driver, v.location, v.current_km, v.last_oil_km,
      v.oil_change_interval, v.last_oil_change_date, v.inspection_last_date, v.inspection_due_date,
      s.status, s.submitted_at, i.completed_date, m.status, m.completed_date, m.notes, m.scheduled_date
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
    } else if (String(v.maintenance_notes || "").trim()) {
      const d = v.maintenance_scheduled_date ? new Date(v.maintenance_scheduled_date) : null;
      if (d) {
        const days = daysBetween(d, today);
        maintenanceStatus = days > 180 ? "red" : days >= 150 ? "yellow" : "green";
        maintenanceReason = days > 180 ? `6-month maintenance overdue by ${days-180} days` : "Maintenance record contains inspection notes";
      } else {
        maintenanceStatus = "green"; maintenanceReason = "Maintenance inspection notes recorded";
      }
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

import { query } from "./postgres.js";
import {
  FIXED_FLEET_VEHICLES,
  normalizePlateKey,
  resolveRiyadhDate,
  DAILY_KM_TZ
} from "./dailyKm.js";

function plateLabel([number, code]) {
  return `${number} ${code}`.trim();
}

export async function getDailySubmissionReport(targetDate = null) {
  const reportDate = await resolveRiyadhDate(targetDate || null);

  const fleetResult = await query(`
    SELECT v.id, v.plate_number, v.plate_code, v.driver, v.phone, v.location, v.current_km,
           COALESCE(oh.oil_change_km, v.last_oil_km) AS last_oil_km,
           COALESCE(oh.oil_change_date::text, v.last_oil_change_date::text) AS last_oil_change_date
    FROM vehicles v
    LEFT JOIN LATERAL (
      SELECT oil_change_km, oil_change_date
      FROM oil_changes
      WHERE vehicle_id = v.id
        AND COALESCE(notes,'') NOT ILIKE '%Google Sheet%'
      ORDER BY oil_change_date DESC NULLS LAST, id DESC
      LIMIT 1
    ) oh ON true
  `);

  const byPlate = new Map();
  for (const row of fleetResult.rows) {
    const key = normalizePlateKey(`${row.plate_number || ""} ${row.plate_code || ""}`);
    if (key && !byPlate.has(key)) byPlate.set(key, row);
  }

  const readingsResult = await query(`
    SELECT DISTINCT ON (vehicle_id)
      vehicle_id, reading_km, reading_date, created_at, notes, is_oil_change, id
    FROM km_records
    WHERE reading_date::date = $1::date
    ORDER BY vehicle_id, created_at DESC NULLS LAST, id DESC
  `, [reportDate]);

  const erpByVehicle = new Map();
  for (const row of readingsResult.rows) {
    erpByVehicle.set(Number(row.vehicle_id), row);
  }

  const records = FIXED_FLEET_VEHICLES.map((plate) => {
    const label = plateLabel(plate);
    const vehicle = byPlate.get(normalizePlateKey(label)) || null;
    const erp = vehicle ? erpByVehicle.get(Number(vehicle.id)) || null : null;
    const km = erp ? Number(erp.reading_km) : null;
    const submitted = Boolean(erp);

    return {
      vehicleId: vehicle ? Number(vehicle.id) : null,
      vehicle: label,
      driver: vehicle?.driver || "",
      phone: vehicle?.phone || "",
      location: vehicle?.location || "",
      currentKm: Number(vehicle?.current_km || 0),
      erpKm: km,
      googleSheetKm: null,
      erpDate: erp?.reading_date ? String(erp.reading_date).slice(0, 10) : null,
      googleSheetDate: null,
      km,
      mismatch: false,
      variance: 0,
      source: submitted ? "ERP" : "Not Submitted",
      submittedToday: submitted,
      status: submitted ? "Submitted" : "Not Submitted",
      erpTimestamp: erp?.created_at ? new Date(erp.created_at).toISOString() : null,
      googleSheetTimestamp: null,
      erpIsOilChange: Boolean(erp?.is_oil_change),
      timestamp: erp?.created_at ? new Date(erp.created_at).toISOString() : null
    };
  });

  const submitted = records.filter((r) => r.submittedToday);
  const missing = records.filter((r) => !r.submittedToday);

  return {
    success: true,
    reportDate,
    timezone: DAILY_KM_TZ,
    generatedAt: new Date().toISOString(),
    fixedVehicleCount: records.length,
    submittedCount: submitted.length,
    missingCount: missing.length,
    submissionPercent: records.length ? (submitted.length / records.length) * 100 : 0,
    submitted,
    missing,
    records
  };
}

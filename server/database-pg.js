import { query } from "./postgres.js";

function numberValue(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stringValue(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function formatVehicle(row) {
  if (!row) return null;
  const currentKM = numberValue(row.current_km, 0);
  const lastOilKM = numberValue(row.last_oil_km, 0);
  const interval = numberValue(row.oil_change_interval, 5000);
  const kmSinceOil = currentKM - lastOilKM;
  const remaining = interval - kmSinceOil;

  let oilStatus = "Safe";
  if (kmSinceOil >= interval) {
    oilStatus = "Urgent Overdue";
  } else if (kmSinceOil >= interval - 500) {
    oilStatus = "Warning";
  }

  return {
    id: row.id,
    plate: `${row.plate_number || ""} ${row.plate_code || ""}`.trim(),
    plate_number: row.plate_number,
    plate_code: row.plate_code,
    make: row.make,
    model: row.model,
    year: row.year,
    status: row.status,
    location: row.location || "",
    driver_name: row.driver || "",
    driver_phone: row.phone || "",
    currentKM,
    lastOilKM,
    oilChangeInterval: interval,
    lastOilChangeDate: row.last_oil_change_date || "",
    kmSinceLastOil: kmSinceOil,
    remainingKM: remaining,
    oilStatus,
    meter_updated_at: row.meter_updated_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function getVehicleById(id) {
  const result = await query(`SELECT * FROM vehicles WHERE id = $1 LIMIT 1`, [id]);
  return formatVehicle(result.rows[0]);
}

export async function getVehicleByPlate(plate) {
  const parts = stringValue(plate).split(/\s+/).filter(Boolean);
  const plateNumber = parts[0] || "";
  const plateCode = parts.slice(1).join(" ").toUpperCase();
  const result = await query(
    `SELECT * FROM vehicles WHERE plate_number = $1 AND plate_code = $2 LIMIT 1`,
    [plateNumber, plateCode]
  );
  return formatVehicle(result.rows[0]);
}

export async function listVehicles() {
  const result = await query(`SELECT * FROM vehicles ORDER BY plate_number, plate_code`);
  return result.rows.map(formatVehicle);
}

export async function createVehicle(vehicleData = {}) {
  const parts = stringValue(vehicleData.plate).split(/\s+/).filter(Boolean);
  const plateNumber = parts[0] || "";
  const plateCode = parts.slice(1).join(" ").toUpperCase();
  if (!plateNumber) throw new Error("Vehicle plate is required");

  const result = await query(
    `INSERT INTO vehicles (plate_number, plate_code, make, model, year, status, location, driver, phone, current_km, last_oil_km, oil_change_interval, last_oil_change_date, meter_updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      plateNumber,
      plateCode,
      vehicleData.make || "Toyota",
      vehicleData.model || "Hilux",
      numberValue(vehicleData.year, 2022),
      vehicleData.status || vehicleData.state || "جيد",
      vehicleData.location || "",
      vehicleData.driverName || vehicleData.driver || "",
      vehicleData.driverPhone || vehicleData.phone || "",
      numberValue(vehicleData.currentKM ?? vehicleData.km, 0),
      numberValue(vehicleData.lastOilKM ?? vehicleData.serviceKm, 0),
      numberValue(vehicleData.oilChangeInterval, 5000),
      vehicleData.lastOilChangeDate || "",
      new Date().toISOString()
    ]
  );
  return formatVehicle(result.rows[0]);
}

export async function updateVehicle(plate, data = {}) {
  const vehicle = await getVehicleByPlate(plate);
  if (!vehicle) return { changes: 0 };

  const currentKM = data.currentKM !== undefined || data.km !== undefined ? numberValue(data.currentKM ?? data.km, vehicle.currentKM) : vehicle.currentKM;
  const lastOilKM = data.lastOilKM !== undefined || data.serviceKm !== undefined ? numberValue(data.lastOilKM ?? data.serviceKm, vehicle.lastOilKM) : vehicle.lastOilKM;
  const parts = stringValue(plate).split(/\s+/).filter(Boolean);
  const plateNumber = parts[0] || "";
  const plateCode = parts.slice(1).join(" ").toUpperCase();

  const result = await query(
    `UPDATE vehicles SET current_km = $1, last_oil_km = $2, status = $3, location = $4, driver = $5, phone = $6, oil_change_interval = $7, last_oil_change_date = $8, updated_at = CURRENT_TIMESTAMP WHERE plate_number = $9 AND plate_code = $10`,
    [
      currentKM,
      lastOilKM,
      data.status ?? data.state ?? vehicle.status,
      data.location ?? vehicle.location,
      data.driverName ?? data.driver ?? vehicle.driver_name,
      data.driverPhone ?? data.phone ?? vehicle.driver_phone,
      numberValue(data.oilChangeInterval, data.oilChangeInterval),
      data.lastOilChangeDate ?? vehicle.lastOilChangeDate,
      plateNumber,
      plateCode
    ]
  );
  return { changes: result.rowCount };
}

export async function deleteVehicle(id) {
  const result = await query(`DELETE FROM vehicles WHERE id = $1`, [id]);
  return { changes: result.rowCount };
}

export async function deleteAllVehicles() {
  const result = await query(`DELETE FROM vehicles`);
  return { changes: result.rowCount };
}

export default {
  listVehicles,
  getVehicleById,
  getVehicleByPlate,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  deleteAllVehicles
};

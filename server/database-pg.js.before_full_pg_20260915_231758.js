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

  const plate = `${row.plate_number || ""} ${row.plate_code || ""}`.trim();
  const driver = row.driver || "";
  const phone = row.phone || "";

  return {
    id: row.id,

    plate,
    plate_number: row.plate_number || "",
    plate_code: row.plate_code || "",

    make: row.make || "",
    model: row.model || "",
    year: row.year || "",
    status: oilStatus,
    location: row.location || "",

    driver,
    driver_name: driver,
    driver_phone: phone,
    phone,

    currentKm: currentKM,
    currentKM,

    lastOilKm: lastOilKM,
    lastOilKM,

    sinceOil: kmSinceOil,
    kmSinceLastOil: kmSinceOil,

    remaining,
    remainingKM: remaining,

    oilChangeInterval: interval,
    last_oil_change_date: row.last_oil_change_date || "",
    lastOilChangeDate: row.last_oil_change_date || "",

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


export async function addReading(vehicleId, data = {}) {
  const vehicleResult = await query(
    `SELECT * FROM vehicles WHERE id = $1 LIMIT 1`,
    [vehicleId]
  );

  const v = vehicleResult.rows[0];

  if (!v) throw new Error("Vehicle not found");

  const km = numberValue(data.readingKm, 0);

  if (km <= 0) throw new Error("Reading must be positive");
  if (km < numberValue(v.current_km, 0)) {
    throw new Error("Reading must be >= current");
  }

  const readingDate =
    stringValue(data.readingDate) ||
    new Date().toISOString().slice(0, 10);

  const plate = `${v.plate_number || ""} ${v.plate_code || ""}`.trim();

  await query(
    `INSERT INTO km_records
      (vehicle_id, plate, reading_km, reading_date, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      vehicleId,
      plate,
      km,
      readingDate,
      stringValue(data.notes)
    ]
  );

  await query(
    `UPDATE vehicles
     SET current_km = $1,
         meter_updated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [km, vehicleId]
  );

  return getVehicleById(vehicleId);
}

export async function listReadings(vehicleId) {
  const result = await query(
    `SELECT *
     FROM km_records
     WHERE vehicle_id = $1
     ORDER BY reading_date DESC, id DESC
     LIMIT 50`,
    [vehicleId]
  );

  return result.rows;
}

export async function changeOil(vehicleId, data = {}) {
  const vehicleResult = await query(
    `SELECT * FROM vehicles WHERE id = $1 LIMIT 1`,
    [vehicleId]
  );

  const v = vehicleResult.rows[0];

  if (!v) throw new Error("Vehicle not found");

  const currentKM = numberValue(v.current_km, 0);

  if (!currentKM) {
    throw new Error("No current reading");
  }

  const oilDate =
    stringValue(data.oilChangeDate) ||
    new Date().toISOString().slice(0, 10);

  const changedBy =
    stringValue(data.changedBy) || "Driver";

  const notes = stringValue(data.notes);

  const plate = `${v.plate_number || ""} ${v.plate_code || ""}`.trim();

  await query(
    `INSERT INTO oil_changes
      (vehicle_id, oil_change_km, oil_change_date, changed_by, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      vehicleId,
      currentKM,
      oilDate,
      changedBy,
      notes
    ]
  );

  await query(
    `UPDATE vehicles
     SET last_oil_km = $1,
         last_oil_change_date = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [
      currentKM,
      oilDate,
      vehicleId
    ]
  );

  await query(
    `INSERT INTO km_records
      (vehicle_id, plate, reading_km, reading_date, is_oil_change, notes)
     VALUES ($1, $2, $3, $4, 1, $5)`,
    [
      vehicleId,
      plate,
      currentKM,
      oilDate,
      "Oil change"
    ]
  );

  return getVehicleById(vehicleId);
}

export async function listOilChanges(vehicleId) {
  const result = await query(
    `SELECT *
     FROM oil_changes
     WHERE vehicle_id = $1
     ORDER BY oil_change_date DESC, id DESC
     LIMIT 20`,
    [vehicleId]
  );

  return result.rows;
}
// ============================================================
// TICKETS - POSTGRESQL
// ============================================================

export async function createTicket(data = {}) {
  const result = await query(
    `INSERT INTO tickets
      (vehicle_id, title, location, category, priority, status,
       description, reported_by, opened_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      data.vehicleId || null,
      stringValue(data.title),
      stringValue(data.location),
      stringValue(data.category),
      stringValue(data.priority) || "Medium",
      stringValue(data.status) || "Open",
      stringValue(data.description),
      stringValue(data.reportedBy || data.reporter)
    ]
  );

  return result.rows[0];
}

export async function listTickets(filters = {}) {
  let sql = `SELECT * FROM tickets WHERE 1=1`;
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }

  if (filters.vehicleId) {
    params.push(filters.vehicleId);
    sql += ` AND vehicle_id = $${params.length}`;
  }

  if (filters.reportedBy) {
    params.push(filters.reportedBy);
    sql += ` AND reported_by = $${params.length}`;
  }

  sql += ` ORDER BY opened_at DESC, id DESC`;

  const result = await query(sql, params);
  return result.rows;
}

export async function closeTicket(id) {
  const result = await query(
    `UPDATE tickets
     SET status = 'Closed',
         closed_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id]
  );

  return { changes: result.rowCount };
}

export async function deleteAllTickets() {
  const result = await query(`DELETE FROM tickets`);
  return { changes: result.rowCount };
}

export async function acknowledgeTicket(id, data = {}) {
  const acknowledgedBy =
    stringValue(
      data.acknowledgedBy ||
      data.username ||
      data.user
    ) || "System";

  const result = await query(
    `UPDATE tickets
     SET acknowledged_at = CURRENT_TIMESTAMP,
         acknowledged_by = $1
     WHERE id = $2`,
    [acknowledgedBy, id]
  );

  return { changes: result.rowCount };
}

export async function closeTicketWithNotes(id, data = {}) {
  const closedBy =
    stringValue(
      data.closedBy ||
      data.username ||
      data.user
    ) || "System";

  const resolutionNotes =
    stringValue(
      data.resolutionNotes ||
      data.notes
    );

  const result = await query(
    `UPDATE tickets
     SET status = 'Closed',
         closed_at = CURRENT_TIMESTAMP,
         closed_by = $1,
         resolution_notes = $2
     WHERE id = $3`,
    [closedBy, resolutionNotes, id]
  );

  return { changes: result.rowCount };
}

export async function listTicketsByReporter(reporter) {
  const result = await query(
    `SELECT *
     FROM tickets
     WHERE reported_by = $1
     ORDER BY opened_at DESC, id DESC`,
    [reporter]
  );

  return result.rows;
}

export async function getReporterStats(reporter) {
  const result = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'Open')::int AS open,
       COUNT(*) FILTER (WHERE status = 'Closed')::int AS closed,
       COUNT(*) FILTER (WHERE status = 'Acknowledged')::int AS acknowledged
     FROM tickets
     WHERE reported_by = $1`,
    [reporter]
  );

  return result.rows[0];
}


// ============================================================
// DEFAULT EXPORT
// ============================================================

export default {
  listVehicles,
  getVehicleById,
  getVehicleByPlate,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  deleteAllVehicles,

  addReading,
  listReadings,
  changeOil,
  listOilChanges,

  createTicket,
  listTickets,
  closeTicket,
  deleteAllTickets,
  acknowledgeTicket,
  closeTicketWithNotes,
  listTicketsByReporter,
  getReporterStats
};
// ============================================================
// SITES / CAMPS - POSTGRESQL
// ============================================================

export async function listSites() {
  const result = await query(`
    SELECT *
    FROM sites
    ORDER BY id ASC
  `);

  return result.rows;
}

export async function getSite(id) {
  const result = await query(
    `SELECT * FROM sites WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function createSite(data = {}) {
  const code = data.code || null;
  const name = data.name || data.siteName || "";
  const region = data.region || null;
  const campusManager = data.campus_manager || data.campusManager || null;
  const phone = data.phone || null;
  const notes = data.notes || null;
  const status = data.status || "Active";

  if (!name.trim()) {
    throw new Error("Site name is required");
  }

  const result = await query(
    `INSERT INTO sites
      (code, name, region, campus_manager, phone, notes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      code,
      name.trim(),
      region,
      campusManager,
      phone,
      notes,
      status
    ]
  );

  return result.rows[0];
}

export async function updateSite(id, data = {}) {
  const result = await query(
    `UPDATE sites
     SET
       code = COALESCE($1, code),
       name = COALESCE($2, name),
       region = COALESCE($3, region),
       campus_manager = COALESCE($4, campus_manager),
       phone = COALESCE($5, phone),
       notes = COALESCE($6, notes),
       status = COALESCE($7, status)
     WHERE id = $8
     RETURNING *`,
    [
      data.code ?? null,
      data.name ?? data.siteName ?? null,
      data.region ?? null,
      data.campus_manager ?? data.campusManager ?? null,
      data.phone ?? null,
      data.notes ?? null,
      data.status ?? null,
      id
    ]
  );

  if (!result.rows[0]) {
    throw new Error("Site not found");
  }

  return result.rows[0];
}

export async function deleteSite(id) {
  const result = await query(
    `DELETE FROM sites
     WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    throw new Error("Site not found");
  }

  return { changes: result.rowCount };
}
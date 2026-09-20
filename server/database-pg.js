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

  // Automatically close the Daily KM card for this vehicle/date as soon
  // as the driver successfully saves today's reading.
  try {
    const todayResult = await query(
      `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date AS today`
    );
    const today = todayResult.rows[0]?.today;
    const marker = `DAILY_KM_MISSING|vehicle=${vehicleId}|date=${today}`;

    await query(
      `UPDATE tickets
       SET status = 'Closed',
           closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
           closed_by = COALESCE(closed_by, 'System'),
           resolution_notes = CASE
             WHEN COALESCE(resolution_notes, '') = '' THEN $3
             ELSE resolution_notes
           END
       WHERE vehicle_id = $1
         AND category = 'Daily KM'
         AND description LIKE $2
         AND status <> 'Closed'`,
      [
        vehicleId,
        `%${marker}%`,
        `Today's KM reading was entered successfully: ${km.toLocaleString()} km.`
      ]
    );
  } catch (cardError) {
    // The KM reading itself is already saved. Do not fail the driver's
    // submission just because the tracking card could not be closed.
    console.error("[KMDailyCard] immediate close failed:", cardError.message);
  }

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

export async function ensurePeriodicMaintenanceSchema() {
  await query(`
    ALTER TABLE periodic_maintenance
      ADD COLUMN IF NOT EXISTS last_service_km INTEGER,
      ADD COLUMN IF NOT EXISTS last_service_date DATE,
      ADD COLUMN IF NOT EXISTS next_due_km INTEGER,
      ADD COLUMN IF NOT EXISTS interval_km INTEGER DEFAULT 5000,
      ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 180,
      ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ
  `);
}

export async function updatePeriodicAfterOilChange(vehicleId, currentKm, oilDate) {
  // Ensure the schema is up to date
  await ensurePeriodicMaintenanceSchema();

  const current = await query(
    `SELECT id FROM periodic_maintenance
     WHERE vehicle_id = $1 AND type = 'oil_change' AND status = 'Pending'
     ORDER BY id DESC LIMIT 1`,
    [vehicleId]
  );

  const nextDueKm = Number(currentKm) + 5000;

  if (current.rows[0]) {
    await query(
      `UPDATE periodic_maintenance
       SET last_service_km = $1,
           last_service_date = $2,
           next_due_km = $3,
           interval_km = 5000,
           scheduled_date = $2::date + INTERVAL '180 days',
           completed_date = $2,
           status = 'Pending',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [currentKm, oilDate, nextDueKm, current.rows[0].id]
    );
  } else {
    await query(
      `INSERT INTO periodic_maintenance
        (vehicle_id, type, scheduled_date, status,
         last_service_km, last_service_date, next_due_km,
         interval_km, interval_days)
       VALUES ($1, 'oil_change', $2::date + INTERVAL '180 days', 'Pending',
               $3, $2, $4, 5000, 180)`,
      [vehicleId, oilDate, currentKm, nextDueKm]
    );
  }
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

  // Update the periodic maintenance entry for oil_change
  try {
    await updatePeriodicAfterOilChange(vehicleId, currentKM, oilDate);
  } catch (err) {
    console.error("Failed to update periodic_maintenance after oil change:", err.message);
  }

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
  const ownerResult = await query(
    `SELECT id, full_name, username
     FROM users
     WHERE role = 'Owner' AND is_active = 1
     ORDER BY id ASC
     LIMIT 1`
  );
  const owner = ownerResult.rows[0] || null;
  const department = stringValue(data.department) || (data.vehicleId ? "Fleet" : "Support");

  const result = await query(
    `INSERT INTO tickets
      (vehicle_id, title, location, category, priority, status,
       description, reported_by, opened_at, department,
       assigned_to_user_id, assigned_to_name, assigned_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,$9,$10,$11,
             CASE WHEN $10 IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END)
     RETURNING *`,
    [
      data.vehicleId || null,
      stringValue(data.title),
      stringValue(data.location),
      stringValue(data.category),
      stringValue(data.priority) || "Medium",
      stringValue(data.status) || "Open",
      stringValue(data.description),
      stringValue(data.reportedBy || data.reporter),
      department,
      owner?.id ?? null,
      owner ? stringValue(owner.full_name || owner.username) : null
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
    sql += ` AND reported_by = ${params.length}`;
  }

  if (filters.department) {
    params.push(filters.department);
    sql += ` AND department = ${params.length}`;
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

/* ============================================================
   FULL POSTGRESQL ERP FUNCTIONS
   Added by full SQLite -> PostgreSQL migration
   ============================================================ */

function pgNum(v, fallback = 0) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pgStr(v, fallback = "") {
  if (v === undefined || v === null) return fallback;
  return String(v).trim();
}

function pgMonthYear(date = new Date()) {
  const d = new Date(date);
  const month =
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0");

  return {
    month,
    year: String(d.getFullYear())
  };
}

function pgGenNo(prefix) {
  return prefix + "-" + String(Date.now()).slice(-6);
}

function formatPGVehicle(v) {
  const currentKm = Number(v.current_km || 0);
  const lastOilKm = Number(v.last_oil_km || 0);
  const interval = Number(v.oil_change_interval || 5000);
  const sinceOil = Math.max(0, currentKm - lastOilKm);

  let calculatedStatus = v.status || "Safe";

  if (lastOilKm === 0 && currentKm > 0) {
    calculatedStatus = "Urgent Overdue";
  } else if (sinceOil >= interval) {
    calculatedStatus = "Urgent Overdue";
  } else if (sinceOil >= interval * 0.9) {
    calculatedStatus = "Warning";
  } else {
    calculatedStatus = "Safe";
  }

  return {
    id: v.id,
    plate: `${v.plate_number || ""} ${v.plate_code || ""}`.trim(),
    plateNumber: v.plate_number || "",
    plateCode: v.plate_code || "",
    make: v.make || "",
    model: v.model || "",
    year: v.year,
    location: v.location || "",
    driver: v.driver || "",
    phone: v.phone || "",
    currentKm,
    lastOilKm,
    sinceOil,
    remaining: Math.max(0, interval - sinceOil),
    interval,
    status: calculatedStatus,
    lastOilChangeDate: v.last_oil_change_date || null,
    meterUpdatedAt: v.meter_updated_at || null,
    createdAt: v.created_at,
    updatedAt: v.updated_at
  };
}

/* ============================================================
   VEHICLES
   ============================================================ */

export async function getAlerts() {
  const vehiclesResult = await query(`
    SELECT *
    FROM vehicles
    ORDER BY id ASC
  `);

  const vehicles = vehiclesResult.rows.map(formatPGVehicle);

  const urgent = vehicles.filter(v => v.status === "Urgent Overdue");
  const warning = vehicles.filter(v => v.status === "Warning");

  return {
    total: vehicles.length,
    urgent: urgent.length,
    warning: warning.length,
    safe: vehicles.filter(v => v.status === "Safe").length,
    urgentVehicles: urgent,
    warningVehicles: warning,
    vehicles
  };
}

export async function importVehicles(vehicles = []) {
  if (!Array.isArray(vehicles)) {
    throw new Error("Vehicles must be an array");
  }

  let imported = 0;

  await transaction(async client => {
    for (const data of vehicles) {
      const plate = pgStr(data.plate || data.plateNumber);
      const parts = plate.split(/\s+/);

      const plateNumber =
        pgStr(data.plateNumber) ||
        parts[0] ||
        "";

      const plateCode =
        pgStr(data.plateCode) ||
        parts.slice(1).join(" ") ||
        "";

      if (!plateNumber) continue;

      await client.query(`
        INSERT INTO vehicles
        (
          plate_number,
          plate_code,
          make,
          model,
          year,
          location,
          driver,
          phone,
          current_km,
          last_oil_km,
          oil_change_interval,
          last_oil_change_date,
          status,
          meter_updated_at
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO NOTHING
      `, [
        plateNumber,
        plateCode,
        pgStr(data.make, "Toyota"),
        pgStr(data.model, "Hilux"),
        pgNum(data.year, 2022),
        pgStr(data.location),
        pgStr(data.driver),
        pgStr(data.phone),
        pgNum(data.currentKm ?? data.current_km),
        pgNum(data.lastOilKm ?? data.last_oil_km),
        pgNum(data.interval ?? data.oil_change_interval, 5000),
        data.lastOilChangeDate ?? data.last_oil_change_date ?? null,
        pgStr(data.status, "Safe"),
        data.meterUpdatedAt ?? data.meter_updated_at ?? null
      ]);

      imported++;
    }
  });

  return { imported };
}

/* ============================================================
   WORK ORDERS
   ============================================================ */

export async function listWorkOrders(filters = {}) {
  let sql = `
    SELECT *
    FROM work_orders
    WHERE 1=1
  `;

  const params = [];

  if (filters.month) {
    params.push(filters.month);
    sql += ` AND month = $${params.length}`;
  }

  if (filters.year) {
    params.push(String(filters.year));
    sql += ` AND year = $${params.length}`;
  }

  if (filters.site) {
    params.push(filters.site);
    sql += ` AND site = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ` ORDER BY reported_date DESC, id DESC`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getWorkOrder(id) {
  const result = await query(
    `SELECT * FROM work_orders WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function createWorkOrder(data = {}) {
  const { month, year } = pgMonthYear(
    data.reportedDate || new Date()
  );

  const result = await query(`
    INSERT INTO work_orders
    (
      wo_no,
      site,
      area,
      category,
      priority,
      description,
      assigned_to,
      is_contractor,
      contractor_name,
      status,
      reported_date,
      completed_date,
      final_cost,
      contractor_cost,
      labor_cost,
      parts_cost,
      closing_notes,
      parts_used,
      month,
      year
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    RETURNING *
  `, [
    pgStr(data.woNo) || pgGenNo("WO"),
    pgStr(data.site),
    pgStr(data.area),
    pgStr(data.category, "General"),
    pgStr(data.priority, "Medium"),
    pgStr(data.description),
    pgStr(data.assignedTo ?? data.assigned_to),
    data.isContractor ? 1 : 0,
    pgStr(data.contractorName ?? data.contractor_name),
    pgStr(data.status, "Open"),
    data.reportedDate ?? data.reported_date ?? new Date(),
    data.completedDate ?? data.completed_date ?? null,
    pgNum(data.finalCost ?? data.final_cost),
    pgNum(data.contractorCost ?? data.contractor_cost),
    pgNum(data.laborCost ?? data.labor_cost),
    pgNum(data.partsCost ?? data.parts_cost),
    pgStr(data.closingNotes ?? data.closing_notes),
    pgStr(data.partsUsed ?? data.parts_used),
    month,
    year
  ]);

  return result.rows[0];
}

export async function updateWorkOrder(id, data = {}) {
  const current = await getWorkOrder(id);

  if (!current) {
    throw new Error("Work order not found");
  }

  const result = await query(`
    UPDATE work_orders
    SET
      wo_no = $1,
      site = $2,
      area = $3,
      category = $4,
      priority = $5,
      description = $6,
      assigned_to = $7,
      is_contractor = $8,
      contractor_name = $9,
      status = $10,
      reported_date = $11,
      completed_date = $12,
      final_cost = $13,
      contractor_cost = $14,
      labor_cost = $15,
      parts_cost = $16,
      closing_notes = $17,
      parts_used = $18,
      month = $19,
      year = $20,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $21
    RETURNING *
  `, [
    data.woNo ?? current.wo_no,
    data.site ?? current.site,
    data.area ?? current.area,
    data.category ?? current.category,
    data.priority ?? current.priority,
    data.description ?? current.description,
    data.assignedTo ?? data.assigned_to ?? current.assigned_to,
    data.isContractor === undefined
      ? current.is_contractor
      : (data.isContractor ? 1 : 0),
    data.contractorName ?? data.contractor_name ?? current.contractor_name,
    data.status ?? current.status,
    data.reportedDate ?? data.reported_date ?? current.reported_date,
    data.completedDate ?? data.completed_date ?? current.completed_date,
    data.finalCost ?? data.final_cost ?? current.final_cost,
    data.contractorCost ?? data.contractor_cost ?? current.contractor_cost,
    data.laborCost ?? data.labor_cost ?? current.labor_cost,
    data.partsCost ?? data.parts_cost ?? current.parts_cost,
    data.closingNotes ?? data.closing_notes ?? current.closing_notes,
    data.partsUsed ?? data.parts_used ?? current.parts_used,
    data.month ?? current.month,
    data.year ?? current.year,
    id
  ]);

  return result.rows[0];
}

export async function closeWorkOrder(id, data = {}) {
  const result = await query(`
    UPDATE work_orders
    SET
      status = 'Closed',
      completed_date = CURRENT_DATE,
      final_cost = $1,
      contractor_cost = $2,
      labor_cost = $3,
      parts_cost = $4,
      closing_notes = $5,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $6
    RETURNING *
  `, [
    pgNum(data.finalCost ?? data.final_cost),
    pgNum(data.contractorCost ?? data.contractor_cost),
    pgNum(data.laborCost ?? data.labor_cost),
    pgNum(data.partsCost ?? data.parts_cost),
    pgStr(data.closingNotes ?? data.closing_notes),
    id
  ]);

  if (!result.rows[0]) {
    throw new Error("Work order not found");
  }

  return result.rows[0];
}

export async function deleteWorkOrder(id) {
  const result = await query(
    `DELETE FROM work_orders WHERE id = $1`,
    [id]
  );

  if (!result.rowCount) {
    throw new Error("Work order not found");
  }

  return { changes: result.rowCount };
}

/* ============================================================
   PROJECTS
   ============================================================ */

export async function listProjects(filters = {}) {
  let sql = `SELECT * FROM projects WHERE 1=1`;
  const params = [];

  if (filters.month) {
    params.push(filters.month);
    sql += ` AND month = $${params.length}`;
  }

  if (filters.year) {
    params.push(String(filters.year));
    sql += ` AND year = $${params.length}`;
  }

  if (filters.site) {
    params.push(filters.site);
    sql += ` AND site = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC, id DESC`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getProject(id) {
  const result = await query(
    `SELECT * FROM projects WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function createProject(data = {}) {
  const { month, year } = pgMonthYear(
    data.startDate || data.start_date || new Date()
  );

  const result = await query(`
    INSERT INTO projects
    (
      project_no,
      name,
      description,
      site,
      project_type,
      status,
      budget,
      spent,
      start_date,
      end_date,
      manager,
      contractor,
      month,
      year,
      notes
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *
  `, [
    pgStr(data.projectNo ?? data.project_no) || pgGenNo("PRJ"),
    pgStr(data.name, "New Project"),
    pgStr(data.description),
    pgStr(data.site),
    pgStr(data.projectType ?? data.project_type, "Development"),
    pgStr(data.status, "Active"),
    pgNum(data.budget),
    pgNum(data.spent),
    data.startDate ?? data.start_date ?? new Date(),
    data.endDate ?? data.end_date ?? null,
    pgStr(data.manager),
    pgStr(data.contractor),
    month,
    year,
    pgStr(data.notes)
  ]);

  return result.rows[0];
}

export async function updateProject(id, data = {}) {
  const current = await getProject(id);

  if (!current) {
    throw new Error("Project not found");
  }

  const result = await query(`
    UPDATE projects
    SET
      project_no = $1,
      name = $2,
      description = $3,
      site = $4,
      project_type = $5,
      status = $6,
      budget = $7,
      spent = $8,
      start_date = $9,
      end_date = $10,
      manager = $11,
      contractor = $12,
      month = $13,
      year = $14,
      notes = $15,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $16
    RETURNING *
  `, [
    data.projectNo ?? data.project_no ?? current.project_no,
    data.name ?? current.name,
    data.description ?? current.description,
    data.site ?? current.site,
    data.projectType ?? data.project_type ?? current.project_type,
    data.status ?? current.status,
    data.budget ?? current.budget,
    data.spent ?? current.spent,
    data.startDate ?? data.start_date ?? current.start_date,
    data.endDate ?? data.end_date ?? current.end_date,
    data.manager ?? current.manager,
    data.contractor ?? current.contractor,
    data.month ?? current.month,
    data.year ?? current.year,
    data.notes ?? current.notes,
    id
  ]);

  return result.rows[0];
}

export async function deleteProject(id) {
  const result = await query(
    `DELETE FROM projects WHERE id = $1`,
    [id]
  );

  if (!result.rowCount) {
    throw new Error("Project not found");
  }

  return { changes: result.rowCount };
}

/* ============================================================
   PROJECT PURCHASE REQUESTS — OWNER APPROVAL WORKFLOW
   ============================================================ */

export async function ensurePurchaseRequestsTable() {
  await query(`CREATE TABLE IF NOT EXISTS purchase_requests (
    id BIGSERIAL PRIMARY KEY,
    request_no TEXT NOT NULL UNIQUE,
    requested_by_user_id BIGINT,
    requested_by TEXT,
    department TEXT NOT NULL DEFAULT 'Projects',
    site TEXT,
    project_id BIGINT,
    project_no TEXT,
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    estimated_unit_cost NUMERIC NOT NULL DEFAULT 0,
    estimated_total NUMERIC NOT NULL DEFAULT 0,
    supplier TEXT,
    purpose TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    approved_by_user_id BIGINT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    approval_notes TEXT,
    rejected_by_user_id BIGINT,
    rejected_by TEXT,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    purchase_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS request_id BIGINT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS approved_by_user_id BIGINT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS approved_by TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS requested_by_user_id BIGINT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS requested_by TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS site TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS project_id BIGINT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS project_no TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS approval_notes TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS recorded_by_user_id BIGINT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS recorded_by TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ`);
  await query(`CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_purchase_requests_project_id ON purchase_requests(project_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_purchases_request_id ON purchases(request_id)`);
}



export async function listPurchaseRequests() {
  const result = await query(`
    SELECT *
    FROM purchase_requests
    ORDER BY created_at DESC, id DESC
  `);
  return result.rows;
}

export async function getPurchaseRequest(id) {
  const result = await query(
    `SELECT * FROM purchase_requests WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function createPurchaseRequest(data = {}) {
  const quantity = pgNum(data.quantity, 1);
  const estimatedUnitCost = pgNum(data.estimatedUnitCost ?? data.estimated_unit_cost);
  const estimatedTotal =
    data.estimatedTotal !== undefined || data.estimated_total !== undefined
      ? pgNum(data.estimatedTotal ?? data.estimated_total)
      : quantity * estimatedUnitCost;

  const result = await query(`
    INSERT INTO purchase_requests
    (
      request_no,
      requested_by_user_id,
      requested_by,
      department,
      site,
      project_id,
      project_no,
      item_name,
      quantity,
      estimated_unit_cost,
      estimated_total,
      supplier,
      purpose,
      notes,
      status
    )
    VALUES
    ($1,$2,$3,'Projects',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Pending')
    RETURNING *
  `, [
    pgStr(data.requestNo ?? data.request_no) || pgGenNo("REQ"),
    data.requestedByUserId ?? data.requested_by_user_id ?? null,
    pgStr(data.requestedBy ?? data.requested_by),
    pgStr(data.site),
    data.projectId ?? data.project_id ?? null,
    pgStr(data.projectNo ?? data.project_no),
    pgStr(data.itemName ?? data.item_name),
    quantity,
    estimatedUnitCost,
    estimatedTotal,
    pgStr(data.supplier),
    pgStr(data.purpose),
    pgStr(data.notes)
  ]);

  return result.rows[0];
}

export async function approvePurchaseRequest(id, user = {}, approvalNotes = "") {
  const current = await getPurchaseRequest(id);
  if (!current) throw new Error("Purchase request not found");
  if (current.status !== "Pending") throw new Error("Only Pending requests can be approved");

  const result = await query(`
    UPDATE purchase_requests
    SET status = 'Approved',
        approved_by_user_id = $1,
        approved_by = $2,
        approved_at = CURRENT_TIMESTAMP,
        approval_notes = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *
  `, [
    user.id ?? null,
    pgStr(user.fullName ?? user.full_name ?? user.username),
    pgStr(approvalNotes),
    id
  ]);

  return result.rows[0];
}

export async function rejectPurchaseRequest(id, user = {}, reason = "") {
  const current = await getPurchaseRequest(id);
  if (!current) throw new Error("Purchase request not found");
  if (current.status !== "Pending") throw new Error("Only Pending requests can be rejected");

  const result = await query(`
    UPDATE purchase_requests
    SET status = 'Rejected',
        rejected_by_user_id = $1,
        rejected_by = $2,
        rejected_at = CURRENT_TIMESTAMP,
        rejection_reason = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *
  `, [
    user.id ?? null,
    pgStr(user.fullName ?? user.full_name ?? user.username),
    pgStr(reason),
    id
  ]);

  return result.rows[0];
}

export async function recordPurchaseFromRequest(id, data = {}, user = {}) {
  const request = await getPurchaseRequest(id);
  if (!request) throw new Error("Purchase request not found");
  if (request.status !== "Approved") throw new Error("Purchase can only be recorded after Owner approval");
  if (request.purchase_id) throw new Error("This request already has a recorded purchase");

  const purchase = await createPurchase({
    purchaseNo: data.purchaseNo ?? data.purchase_no,
    type: "Project",
    referenceNo: request.project_no || request.request_no,
    itemName: request.item_name,
    quantity: data.quantity ?? request.quantity,
    unitCost: data.unitCost ?? data.unit_cost ?? request.estimated_unit_cost,
    supplier: data.supplier ?? request.supplier,
    purchasedBy: data.purchasedBy ?? data.purchased_by ?? "Company",
    purchaseDate: data.purchaseDate ?? data.purchase_date ?? new Date(),
    notes: data.notes ?? request.notes,
    requestId: request.id,
    approvedByUserId: request.approved_by_user_id,
    approvedBy: request.approved_by,
    approvedAt: request.approved_at,
    requestedByUserId: request.requested_by_user_id,
    requestedBy: request.requested_by,
    site: request.site,
    projectId: request.project_id,
    projectNo: request.project_no,
    approvalNotes: request.approval_notes,
    recordedByUserId: user.id ?? null,
    recordedBy: user.fullName ?? user.full_name ?? user.username ?? '',
    recordedAt: new Date()
  });

  const updated = await query(`
    UPDATE purchase_requests
    SET status = 'Purchased',
        purchase_id = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
  `, [purchase.id, id]);

  return { request: updated.rows[0], purchase };
}

/* ============================================================
   PURCHASES
   ============================================================ */

export async function listPurchases(filters = {}) {
  let sql = `SELECT * FROM purchases WHERE 1=1`;
  const params = [];

  if (filters.month) {
    params.push(filters.month);
    sql += ` AND month = $${params.length}`;
  }

  if (filters.year) {
    params.push(String(filters.year));
    sql += ` AND year = $${params.length}`;
  }

  if (filters.referenceNo || filters.reference_no) {
    params.push(filters.referenceNo ?? filters.reference_no);
    sql += ` AND reference_no = $${params.length}`;
  }

  sql += ` ORDER BY purchase_date DESC, id DESC`;

  const result = await query(sql, params);
  return result.rows;
}

export async function createPurchase(data = {}) {
  const purchaseDate =
    data.purchaseDate ??
    data.purchase_date ??
    new Date();

  const { month, year } = pgMonthYear(purchaseDate);

  const quantity = pgNum(data.quantity, 1);
  const unitCost = pgNum(data.unitCost ?? data.unit_cost);
  const totalCost =
    data.totalCost !== undefined || data.total_cost !== undefined
      ? pgNum(data.totalCost ?? data.total_cost)
      : quantity * unitCost;

  const result = await query(`
    INSERT INTO purchases
    (
      purchase_no,
      type,
      reference_no,
      item_name,
      quantity,
      unit_cost,
      total_cost,
      supplier,
      purchased_by,
      purchase_date,
      month,
      year,
      notes,
      request_id,
      approved_by_user_id,
      approved_by,
      approved_at,
      requested_by_user_id,
      requested_by,
      site,
      project_id,
      project_no,
      approval_notes,
      recorded_by_user_id,
      recorded_by,
      recorded_at
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    RETURNING *
  `, [
    pgStr(data.purchaseNo ?? data.purchase_no) || pgGenNo("PUR"),
    pgStr(data.type, "Work Order"),
    pgStr(data.referenceNo ?? data.reference_no),
    pgStr(data.itemName ?? data.item_name),
    quantity,
    unitCost,
    totalCost,
    pgStr(data.supplier),
    pgStr(data.purchasedBy ?? data.purchased_by, "Company"),
    purchaseDate,
    month,
    year,
    pgStr(data.notes),
    data.requestId ?? data.request_id ?? null,
    data.approvedByUserId ?? data.approved_by_user_id ?? null,
    pgStr(data.approvedBy ?? data.approved_by),
    data.approvedAt ?? data.approved_at ?? null,
    data.requestedByUserId ?? data.requested_by_user_id ?? null,
    pgStr(data.requestedBy ?? data.requested_by),
    pgStr(data.site),
    data.projectId ?? data.project_id ?? null,
    pgStr(data.projectNo ?? data.project_no),
    pgStr(data.approvalNotes ?? data.approval_notes),
    data.recordedByUserId ?? data.recorded_by_user_id ?? null,
    pgStr(data.recordedBy ?? data.recorded_by),
    data.recordedAt ?? data.recorded_at ?? null
  ]);

  return result.rows[0];
}

export async function deletePurchase(id) {
  const result = await query(
    `DELETE FROM purchases WHERE id = $1`,
    [id]
  );

  if (!result.rowCount) {
    throw new Error("Purchase not found");
  }

  return { changes: result.rowCount };
}

/* ============================================================
   DRIVERS
   ============================================================ */

export async function listDrivers() {
  const result = await query(`
    SELECT
      d.*,
      CASE
        WHEN v.id IS NOT NULL
        THEN CONCAT(v.plate_number, ' ', v.plate_code)
        ELSE NULL
      END AS vehicle_plate
    FROM drivers d
    LEFT JOIN vehicles v
      ON v.id = d.vehicle_id
    ORDER BY d.name ASC
  `);

  return result.rows.map(d => ({
    ...d,
    licenseNo: d.license_no,
    licenseExpiry: d.license_expiry,
    vehicleId: d.vehicle_id,
    vehiclePlate: d.vehicle_plate
  }));
}

export async function getDriver(id) {
  const result = await query(`
    SELECT
      d.*,
      CASE
        WHEN v.id IS NOT NULL
        THEN CONCAT(v.plate_number, ' ', v.plate_code)
        ELSE NULL
      END AS vehicle_plate
    FROM drivers d
    LEFT JOIN vehicles v
      ON v.id = d.vehicle_id
    WHERE d.id = $1
  `, [id]);

  if (!result.rows[0]) return null;

  const d = result.rows[0];

  return {
    ...d,
    licenseNo: d.license_no,
    licenseExpiry: d.license_expiry,
    vehicleId: d.vehicle_id,
    vehiclePlate: d.vehicle_plate
  };
}

export async function createDriver(data = {}) {
  const result = await query(`
    INSERT INTO drivers
    (
      name,
      phone,
      license_no,
      license_expiry,
      nationality,
      vehicle_id,
      status,
      notes
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `, [
    pgStr(data.name),
    pgStr(data.phone),
    pgStr(data.licenseNo ?? data.license_no),
    data.licenseExpiry ?? data.license_expiry ?? null,
    pgStr(data.nationality),
    data.vehicleId ?? data.vehicle_id ?? null,
    pgStr(data.status, "Active"),
    pgStr(data.notes)
  ]);

  return result.rows[0];
}

export async function updateDriver(id, data = {}) {
  const current = await getDriver(id);

  if (!current) {
    throw new Error("Driver not found");
  }

  const result = await query(`
    UPDATE drivers
    SET
      name = $1,
      phone = $2,
      license_no = $3,
      license_expiry = $4,
      nationality = $5,
      vehicle_id = $6,
      status = $7,
      notes = $8,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $9
    RETURNING *
  `, [
    data.name ?? current.name,
    data.phone ?? current.phone,
    data.licenseNo ?? data.license_no ?? current.license_no,
    data.licenseExpiry ?? data.license_expiry ?? current.license_expiry,
    data.nationality ?? current.nationality,
    data.vehicleId ?? data.vehicle_id ?? current.vehicle_id,
    data.status ?? current.status,
    data.notes ?? current.notes,
    id
  ]);

  return result.rows[0];
}

export async function deleteDriver(id) {
  const result = await query(
    `DELETE FROM drivers WHERE id = $1`,
    [id]
  );

  if (!result.rowCount) {
    throw new Error("Driver not found");
  }

  return { changes: result.rowCount };
}

/* ============================================================
   WAREHOUSE TABLES
   ============================================================ */

export async function ensureWarehouseTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS warehouse_locations (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      site TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS warehouse_stock (
      id SERIAL PRIMARY KEY,
      item_code TEXT NOT NULL,
      location_code TEXT NOT NULL,
      quantity DOUBLE PRECISION DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(item_code, location_code)
    )
  `);

  const locations = [
    ["MAIN", "Main Warehouse", "Main"],
    ["UQL", "Uqlat Al Soqour", "Uqlat Al Soqour"],
    ["HAD", "Al Hadar", "Al Hadar"],
    ["SAB", "Al Sabiyah", "Al Sabiyah"],
    ["QUW", "Al Quwayiyah", "Al Quwayiyah"],
    ["MAH", "Mahd ad Dhahab", "Mahd ad Dhahab"],
    ["WB", "Wadi Beddah", "Wadi Beddah"],
    ["HUL", "Al Hulifa", "Al Hulifa"]
  ];

  for (const [code, name, site] of locations) {
    await query(`
      INSERT INTO warehouse_locations
        (code, name, site)
      VALUES ($1,$2,$3)
      ON CONFLICT (code) DO NOTHING
    `, [code, name, site]);
  }

  return true;
}

/* ============================================================
   INVENTORY
   ============================================================ */

export async function listInventory() {
  const result = await query(`
    SELECT *
    FROM inventory
    ORDER BY name ASC, id ASC
  `);

  return result.rows;
}

export async function getInventoryItem(id) {
  const result = await query(`
    SELECT *
    FROM inventory
    WHERE id::text = $1
       OR code = $1
    LIMIT 1
  `, [String(id)]);

  return result.rows[0] || null;
}

export async function createInventoryItem(data = {}) {
  const result = await query(`
    INSERT INTO inventory
    (
      code,
      name,
      category,
      unit,
      quantity,
      min_stock,
      unit_cost,
      location,
      supplier,
      status,
      notes
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `, [
    pgStr(data.code),
    pgStr(data.name),
    pgStr(data.category, "General"),
    pgStr(data.unit, "PCS"),
    pgNum(data.quantity),
    pgNum(data.minStock ?? data.min_stock, 5),
    pgNum(data.unitCost ?? data.unit_cost),
    pgStr(data.location, "Main Warehouse"),
    pgStr(data.supplier),
    pgStr(data.status, "ACTIVE"),
    pgStr(data.notes)
  ]);

  return result.rows[0];
}

export async function updateInventoryItem(id, data = {}) {
  const current = await getInventoryItem(id);

  if (!current) {
    throw new Error("Inventory item not found");
  }

  const result = await query(`
    UPDATE inventory
    SET
      code = $1,
      name = $2,
      category = $3,
      unit = $4,
      quantity = $5,
      min_stock = $6,
      unit_cost = $7,
      location = $8,
      supplier = $9,
      status = $10,
      notes = $11,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $12
    RETURNING *
  `, [
    data.code ?? current.code,
    data.name ?? current.name,
    data.category ?? current.category,
    data.unit ?? current.unit,
    data.quantity ?? current.quantity,
    data.minStock ?? data.min_stock ?? current.min_stock,
    data.unitCost ?? data.unit_cost ?? current.unit_cost,
    data.location ?? current.location,
    data.supplier ?? current.supplier,
    data.status ?? current.status,
    data.notes ?? current.notes,
    current.id
  ]);

  return result.rows[0];
}

export async function deleteInventoryItem(id) {
  const current = await getInventoryItem(id);

  if (!current) {
    throw new Error("Inventory item not found");
  }

  const result = await query(
    `DELETE FROM inventory WHERE id = $1`,
    [current.id]
  );

  return { changes: result.rowCount };
}

export async function stockIn(data = {}) {
  await ensureWarehouseTables();

  const item = await getInventoryItem(
    data.itemCode ?? data.item_code ?? data.id
  );

  if (!item) {
    throw new Error("Inventory item not found");
  }

  const qty = pgNum(data.quantity);

  if (qty <= 0) {
    throw new Error("Quantity must be greater than zero");
  }

  const toLocation =
    pgStr(data.toLocation ?? data.to_location) ||
    item.location ||
    "Main Warehouse";

  return await transaction(async client => {
    await client.query(`
      UPDATE inventory
      SET
        quantity = quantity + $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [qty, item.id]);

    await client.query(`
      INSERT INTO stock_transactions
      (
        type,
        item_code,
        item_name,
        quantity,
        from_location,
        to_location,
        reference_no,
        notes
      )
      VALUES
      ('IN',$1,$2,$3,NULL,$4,$5,$6)
    `, [
      item.code,
      item.name,
      qty,
      toLocation,
      pgStr(data.referenceNo ?? data.reference_no),
      pgStr(data.notes)
    ]);

    const result = await client.query(`
      SELECT *
      FROM inventory
      WHERE id = $1
    `, [item.id]);

    return result.rows[0];
  });
}

export async function stockOut(data = {}) {
  await ensureWarehouseTables();

  const item = await getInventoryItem(
    data.itemCode ?? data.item_code ?? data.id
  );

  if (!item) {
    throw new Error("Inventory item not found");
  }

  const qty = pgNum(data.quantity);

  if (qty <= 0) {
    throw new Error("Quantity must be greater than zero");
  }

  if (Number(item.quantity) < qty) {
    throw new Error("Insufficient stock");
  }

  const fromLocation =
    pgStr(data.fromLocation ?? data.from_location) ||
    item.location ||
    "Main Warehouse";

  return await transaction(async client => {
    await client.query(`
      UPDATE inventory
      SET
        quantity = quantity - $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [qty, item.id]);

    await client.query(`
      INSERT INTO stock_transactions
      (
        type,
        item_code,
        item_name,
        quantity,
        from_location,
        to_location,
        reference_no,
        notes
      )
      VALUES
      ('OUT',$1,$2,$3,$4,NULL,$5,$6)
    `, [
      item.code,
      item.name,
      qty,
      fromLocation,
      pgStr(data.referenceNo ?? data.reference_no),
      pgStr(data.notes)
    ]);

    const result = await client.query(`
      SELECT *
      FROM inventory
      WHERE id = $1
    `, [item.id]);

    return result.rows[0];
  });
}

export async function transferStock(data = {}) {
  await ensureWarehouseTables();

  const item = await getInventoryItem(
    data.itemCode ?? data.item_code ?? data.id
  );

  if (!item) {
    throw new Error("Inventory item not found");
  }

  const qty = pgNum(data.quantity);

  if (qty <= 0) {
    throw new Error("Quantity must be greater than zero");
  }

  if (Number(item.quantity) < qty) {
    throw new Error("Insufficient stock");
  }

  const fromLocation =
    pgStr(data.fromLocation ?? data.from_location) ||
    item.location ||
    "Main Warehouse";

  const toLocation =
    pgStr(data.toLocation ?? data.to_location);

  if (!toLocation) {
    throw new Error("Destination location is required");
  }

  if (fromLocation === toLocation) {
    throw new Error("Source and destination cannot be the same");
  }

  return await transaction(async client => {
    await client.query(`
      UPDATE inventory
      SET
        quantity = quantity - $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [qty, item.id]);

    await client.query(`
      INSERT INTO stock_transactions
      (
        type,
        item_code,
        item_name,
        quantity,
        from_location,
        to_location,
        reference_no,
        notes
      )
      VALUES
      ('TRANSFER',$1,$2,$3,$4,$5,$6,$7)
    `, [
      item.code,
      item.name,
      qty,
      fromLocation,
      toLocation,
      pgStr(data.referenceNo ?? data.reference_no),
      pgStr(data.notes)
    ]);

    return {
      success: true,
      itemCode: item.code,
      itemName: item.name,
      quantity: qty,
      fromLocation,
      toLocation
    };
  });
}

export async function listStockTransactions() {
  const result = await query(`
    SELECT *
    FROM stock_transactions
    ORDER BY trans_date DESC, id DESC
  `);

  return result.rows;
}

export async function getLowStockItems() {
  const result = await query(`
    SELECT *
    FROM inventory
    WHERE status = 'ACTIVE'
      AND quantity <= min_stock
    ORDER BY quantity ASC, name ASC
  `);

  return result.rows;
}

/* ============================================================
   PERIODIC MAINTENANCE
   ============================================================ */

export async function listPeriodicMaintenance(filters = {}) {
  let sql = `
    SELECT
      pm.*,
      CONCAT(v.plate_number, ' ', v.plate_code) AS vehicle_plate,
      v.driver AS driver_name
    FROM periodic_maintenance pm
    LEFT JOIN vehicles v
      ON v.id = pm.vehicle_id
    WHERE 1=1
  `;

  const params = [];

  if (filters.vehicleId || filters.vehicle_id) {
    params.push(filters.vehicleId ?? filters.vehicle_id);
    sql += ` AND pm.vehicle_id = $${params.length}`;
  }

  if (filters.type) {
    params.push(filters.type);
    sql += ` AND pm.type = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    sql += ` AND pm.status = $${params.length}`;
  }

  sql += ` ORDER BY pm.scheduled_date ASC, pm.id ASC`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getPeriodicMaintenance(id) {
  const result = await query(`
    SELECT
      pm.*,
      CONCAT(v.plate_number, ' ', v.plate_code) AS vehicle_plate,
      v.driver AS driver_name
    FROM periodic_maintenance pm
    LEFT JOIN vehicles v
      ON v.id = pm.vehicle_id
    WHERE pm.id = $1
  `, [id]);

  return result.rows[0] || null;
}

export async function createPeriodicMaintenance(data = {}) {
  const vehicleId = data.vehicleId ?? data.vehicle_id;
  const type = pgStr(data.type);
  const scheduledDate =
    data.scheduledDate ??
    data.scheduled_date;

  if (!vehicleId) {
    throw new Error("Vehicle is required");
  }

  if (!type) {
    throw new Error("Maintenance type is required");
  }

  if (!scheduledDate) {
    throw new Error("Scheduled date is required");
  }

  const result = await query(`
    INSERT INTO periodic_maintenance
    (
      vehicle_id,
      type,
      scheduled_date,
      completed_date,
      status,
      technician,
      cost,
      notes
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `, [
    vehicleId,
    type,
    scheduledDate,
    data.completedDate ?? data.completed_date ?? null,
    pgStr(data.status, "Pending"),
    pgStr(data.technician),
    pgNum(data.cost),
    pgStr(data.notes)
  ]);

  return result.rows[0];
}

export async function updatePeriodicMaintenance(id, data = {}) {
  const current = await getPeriodicMaintenance(id);

  if (!current) {
    throw new Error("Periodic maintenance not found");
  }

  const result = await query(`
    UPDATE periodic_maintenance
    SET
      vehicle_id = $1,
      type = $2,
      scheduled_date = $3,
      completed_date = $4,
      status = $5,
      technician = $6,
      cost = $7,
      notes = $8
    WHERE id = $9
    RETURNING *
  `, [
    data.vehicleId ?? data.vehicle_id ?? current.vehicle_id,
    data.type ?? current.type,
    data.scheduledDate ?? data.scheduled_date ?? current.scheduled_date,
    data.completedDate ?? data.completed_date ?? current.completed_date,
    data.status ?? current.status,
    data.technician ?? current.technician,
    data.cost ?? current.cost,
    data.notes ?? current.notes,
    id
  ]);

  return result.rows[0];
}

export async function completePeriodicMaintenance(id, data = {}) {
  const result = await query(`
    UPDATE periodic_maintenance
    SET
      status = 'Completed',
      completed_date = CURRENT_DATE,
      technician = $1,
      cost = $2,
      notes = $3
    WHERE id = $4
    RETURNING *
  `, [
    pgStr(data.technician),
    pgNum(data.cost),
    pgStr(data.notes),
    id
  ]);

  if (!result.rows[0]) {
    throw new Error("Periodic maintenance not found");
  }

  return result.rows[0];
}

export async function deletePeriodicMaintenance(id) {
  const result = await query(
    `DELETE FROM periodic_maintenance WHERE id = $1`,
    [id]
  );

  if (!result.rowCount) {
    throw new Error("Periodic maintenance not found");
  }

  return { changes: result.rowCount };
}

export async function getPeriodicAlerts() {
  const result = await query(`
    SELECT
      pm.*,
      CONCAT(v.plate_number, ' ', v.plate_code) AS vehicle_plate,
      v.driver AS driver_name
    FROM periodic_maintenance pm
    LEFT JOIN vehicles v
      ON v.id = pm.vehicle_id
    WHERE pm.status = 'Pending'
      AND pm.scheduled_date <= CURRENT_DATE + INTERVAL '7 days'
    ORDER BY pm.scheduled_date ASC
  `);

  const rows = result.rows;

  return {
    overdue: rows.filter(
      r => new Date(r.scheduled_date) < new Date()
    ),
    dueSoon: rows.filter(
      r => new Date(r.scheduled_date) >= new Date()
    )
  };
}

export async function generateScheduledMaintenance(monthsAhead = 6) {
  const result = await query(`
    SELECT id
    FROM vehicles
    ORDER BY id
  `);

  let created = 0;

  const target = new Date();
  target.setMonth(target.getMonth() + Number(monthsAhead || 6));

  for (const vehicle of result.rows) {
    for (const type of ["6_months_general", "inspection"]) {
      const exists = await query(`
        SELECT id
        FROM periodic_maintenance
        WHERE vehicle_id = $1
          AND type = $2
          AND status = 'Pending'
        LIMIT 1
      `, [vehicle.id, type]);

      if (!exists.rows.length) {
        await query(`
          INSERT INTO periodic_maintenance
          (
            vehicle_id,
            type,
            scheduled_date,
            status
          )
          VALUES ($1,$2,$3,'Pending')
        `, [
          vehicle.id,
          type,
          target.toISOString().slice(0,10)
        ]);

        created++;
      }
    }
  }

  return { created };
}

/* ============================================================
   AUDIT LOG
   ============================================================ */

export async function logAction(data = {}) {
  try {
    const result = await query(`
      INSERT INTO audit_log
      (
        user_id,
        username,
        action,
        entity_type,
        entity_id,
        details,
        ip_address
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [
      data.userId ?? data.user_id ?? null,
      pgStr(data.username),
      pgStr(data.action, "UNKNOWN"),
      pgStr(data.entityType ?? data.entity_type),
      data.entityId ?? data.entity_id ?? null,
      typeof data.details === "string"
        ? data.details
        : JSON.stringify(data.details ?? {}),
      pgStr(data.ipAddress ?? data.ip_address)
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("Audit log error:", error.message);
    return null;
  }
}

export async function listAuditLog(filters = {}) {
  let sql = `
    SELECT *
    FROM audit_log
    WHERE 1=1
  `;

  const params = [];

  if (filters.username) {
    params.push(filters.username);
    sql += ` AND username = $${params.length}`;
  }

  if (filters.action) {
    params.push(filters.action);
    sql += ` AND action = $${params.length}`;
  }

  if (filters.entityType || filters.entity_type) {
    params.push(filters.entityType ?? filters.entity_type);
    sql += ` AND entity_type = $${params.length}`;
  }

  if (filters.fromDate || filters.from_date) {
    params.push(filters.fromDate ?? filters.from_date);
    sql += ` AND created_at >= $${params.length}`;
  }

  if (filters.toDate || filters.to_date) {
    params.push(filters.toDate ?? filters.to_date);
    sql += ` AND created_at <= $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC, id DESC LIMIT 500`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getAuditStats() {
  const totalResult = await query(`
    SELECT COUNT(*)::int AS total
    FROM audit_log
  `);

  const todayResult = await query(`
    SELECT COUNT(*)::int AS today
    FROM audit_log
    WHERE created_at >= CURRENT_DATE
  `);

  const usersResult = await query(`
    SELECT
      username,
      COUNT(*)::int AS count
    FROM audit_log
    GROUP BY username
    ORDER BY count DESC
    LIMIT 10
  `);

  const actionsResult = await query(`
    SELECT
      action,
      COUNT(*)::int AS count
    FROM audit_log
    GROUP BY action
    ORDER BY count DESC
    LIMIT 10
  `);

  return {
    total: totalResult.rows[0].total,
    today: todayResult.rows[0].today,
    byUser: usersResult.rows,
    byAction: actionsResult.rows
  };
}

export async function clearAuditLog(olderThanDays = 90) {
  const result = await query(`
    DELETE FROM audit_log
    WHERE created_at < CURRENT_TIMESTAMP
      - ($1::text || ' days')::interval
  `, [Number(olderThanDays)]);

  return {
    changes: result.rowCount
  };
}

/* ============================================================
   BUILDING DASHBOARD
   ============================================================ */

export async function getBuildingDashboard(filters = {}) {
  const workOrders = await listWorkOrders(filters);
  const projects = await listProjects(filters);
  const purchases = await listPurchases(filters);

  const woTotal = workOrders.length;

  const woOpen = workOrders.filter(
    w => String(w.status).toLowerCase() !== "closed"
  ).length;

  const woClosed = workOrders.filter(
    w => String(w.status).toLowerCase() === "closed"
  ).length;

  const woContractor = workOrders.filter(
    w => {
      const cn = String(w.contractor_name || "").trim();
      return cn !== "" && cn.toLowerCase() !== "company" && cn.toLowerCase() !== "internal";
    }
  ).length;

  const woInternal = woTotal - woContractor;

  const sum = (arr, field) =>
    arr.reduce(
      (total, row) => total + Number(row[field] || 0),
      0
    );

  return {
    workOrders: {
      total: woTotal,
      open: woOpen,
      closed: woClosed,
      contractor: woContractor,
      internal: woInternal,
      totalCost: sum(workOrders, "final_cost"),
      contractorCost: sum(workOrders, "contractor_cost"),
      laborCost: sum(workOrders, "labor_cost"),
      partsCost: sum(workOrders, "parts_cost")
    },
    projects: {
      total: projects.length,
      budget: sum(projects, "budget"),
      spent: sum(projects, "spent"),
      list: projects
    },
    purchases: {
      total: purchases.length,
      totalCost: sum(purchases, "total_cost")
    }
  };
}

/* ============================================================
   VEHICLE DASHBOARD
   ============================================================ */

export async function getDashboard() {
  const vehiclesResult = await query(`
    SELECT *
    FROM vehicles
    ORDER BY id ASC
  `);

  const vehicles = vehiclesResult.rows.map(formatPGVehicle);

  const tickets = await listTickets();

  return {
    vehicles: {
      total: vehicles.length,
      urgent: vehicles.filter(v => v.status === "Urgent Overdue").length,
      warning: vehicles.filter(v => v.status === "Warning").length,
      safe: vehicles.filter(v => v.status === "Safe").length,
      list: vehicles
    },
    tickets: {
      total: tickets.length,
      open: tickets.filter(
        t => String(t.status).toLowerCase() !== "closed"
      ).length,
      closed: tickets.filter(
        t => String(t.status).toLowerCase() === "closed"
      ).length
    },
    alerts: await getAlerts()
  };
}

/* ============================================================
   MONTHLY REPORT
   ============================================================ */

export async function getMonthlyReport(filters = {}) {
  const workOrders = await listWorkOrders(filters);
  const projects = await listProjects(filters);
  const purchases = await listPurchases(filters);

  const months = {};

  function getBucket(month) {
    const key = month || "Unknown";

    if (!months[key]) {
      months[key] = {
        month: key,
        woCount: 0,
        woCost: 0,
        woContractor: 0,
        woInternal: 0,
        projCount: 0,
        projSpent: 0,
        purCount: 0,
        purCost: 0,
        purCompany: 0,
        purContractor: 0,
        total: 0
      };
    }

    return months[key];
  }

  for (const w of workOrders) {
    const b = getBucket(w.month);

    b.woCount++;
    b.woCost += Number(w.final_cost || 0);

    const cn = String(w.contractor_name || "").trim();
    if (cn !== "" && cn.toLowerCase() !== "company" && cn.toLowerCase() !== "internal") {
      b.woContractor++;
    } else {
      b.woInternal++;
    }
  }

  for (const p of projects) {
    const b = getBucket(p.month);

    b.projCount++;
    b.projSpent += Number(p.spent || 0);
  }

  for (const p of purchases) {
    const b = getBucket(p.month);

    b.purCount++;
    b.purCost += Number(p.total_cost || 0);

    if (
      String(p.purchased_by || "").toLowerCase()
        .includes("contract")
    ) {
      b.purContractor += Number(p.total_cost || 0);
    } else {
      b.purCompany += Number(p.total_cost || 0);
    }
  }

  const rows = Object.values(months)
    .sort((a,b) => String(a.month).localeCompare(String(b.month)));

  for (const row of rows) {
    row.total =
      row.woCost +
      row.projSpent +
      row.purCost;
  }

  const grandTotal =
    rows.reduce((s,r) => s + r.total, 0);

  const totalWO =
    rows.reduce((s,r) => s + r.woCost, 0);

  const totalProjects =
    rows.reduce((s,r) => s + r.projSpent, 0);

  const totalPurchases =
    rows.reduce((s,r) => s + r.purCost, 0);

  const totalContractor =
    rows.reduce(
      (s,r) => s + r.purContractor,
      0
    ) +
    rows.reduce(
      (s,r) => s + r.woContractor,
      0
    );

  const totalInternal =
    rows.reduce(
      (s,r) => s + r.purCompany,
      0
    ) +
    rows.reduce(
      (s,r) => s + r.woInternal,
      0
    );

  const total = totalContractor + totalInternal;

  return {
    rows,
    summary: {
      grandTotal,
      totalWO,
      totalProjects,
      totalPurchases,
      totalContractor,
      totalInternal,
      internalPercent:
        total ? (totalInternal / total) * 100 : 0,
      contractorPercent:
        total ? (totalContractor / total) * 100 : 0
    }
  };
}

/* ============================================================
   FINANCIAL REPORT
   ============================================================ */

/* ============================================================
   FINANCIAL REPORT â€” Corrected Version 2
   ============================================================
   
   ØªØµØ­ÙŠØ­ Ø£Ø³Ù…Ø§Ø¡ Ø§Ù„Ø­Ù‚ÙˆÙ„:
   - work_orders.contractor_name (Ù„ÙŠØ³ contractor)
   - work_orders.final_cost (ØªÙƒÙ„ÙØ© Ø§Ù„Ù…Ù‚Ø§ÙˆÙ„)
   - work_orders.is_contractor (boolean)
   - projects.contractor (ØµØ­ÙŠØ­)
   - projects.spent (ØµØ­ÙŠØ­)
   - purchases.type / total_cost (ØµØ­ÙŠØ­)
   
   Ø§Ù„Ù…Ù†Ø·Ù‚:
   - Baseline = Ù…ØªÙˆØ³Ø· Ø¢Ø®Ø± 6 Ø´Ù‡ÙˆØ± (ØªÙƒÙ„ÙØ© Ø§Ù„Ù…Ù‚Ø§ÙˆÙ„ÙŠÙ† â€” Ø¨Ø¯ÙˆÙ† Ø±Ø§ØªØ¨)
   - Actual = Ø§Ù„ØªÙƒÙ„ÙØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ© Ø´Ø§Ù…Ù„Ø© Ø±Ø§ØªØ¨ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†
   - Savings = Baseline - Actual
   
   Ø§Ù„ØµÙŠØ§Ù†Ø©: maintActual = contractorWO + partsWO + salaryMaint
   Ø§Ù„ØªØ·ÙˆÙŠØ±: devActual = contractorDev + salaryDev (Ù„Ø§ partsDev)
   Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ: totalCost = maintActual + devActual + otherPurchases
   ============================================================ */

export async function getFinancialReport() {
  const MAINT_BASELINE = 20577;
  const DEV_BASELINE = 132551;
  const SALARY_MAINT = 2200;
  const SALARY_DEV = 2200;

  const workOrders = await listWorkOrders();
  const projects = await listProjects();
  const purchases = await listPurchases();

  // Build lookup sets per month for same-month matching
  function normalizeWO(wo) {
    return String(wo || '').replace(/[-\s]/g, '').toUpperCase();
  }
  function normalizeProj(proj) {
    return String(proj || '').replace(/[-\s]/g, '').toUpperCase();
  }

  const woByMonth = {};
  for (const w of workOrders) {
    const m = w.month || 'Unknown';
    if (!woByMonth[m]) woByMonth[m] = new Set();
    woByMonth[m].add(normalizeWO(w.wo_no));
  }

  const projByMonth = {};
  for (const p of projects) {
    const startDateRaw = p.start_date ?? p.startDate ?? "";
    if (String(startDateRaw).trim() === "") continue;

    const startDate = new Date(startDateRaw);
    const m = !Number.isNaN(startDate.getTime())
      ? startDate.toISOString().slice(0, 7)
      : (p.month || 'Unknown');

    if (!projByMonth[m]) projByMonth[m] = new Set();
    projByMonth[m].add(normalizeProj(p.project_no));
  }

  const months = {};

  function bucket(month) {
    const key = month || "Unknown";
    if (!months[key]) {
      months[key] = {
        month: key,

        // ===== Maintenance =====
        employeeWOCount: 0,
        contractorWOCount: 0,
        contractorWO: 0,
        partsWO: 0,
        salaryMaint: SALARY_MAINT,
        maintActual: 0,
        maintSavings: 0,
        maintPct: 0,

        // ===== Development =====
        internalProjectCount: 0,
        contractorProjectCount: 0,
        contractorDev: 0,
        partsDev: 0,
        salaryDev: SALARY_DEV,
        devActual: 0,
        devSavings: 0,
        devPct: 0,

        // ===== Other Purchases =====
        otherPurchases: 0,

        // ===== Total =====
        totalCost: 0,
        totalSavings: 0,
        totalSavingsPct: 0,

        // ===== Contractor Breakdown =====
        contractorBreakdown: {}
      };
    }
    return months[key];
  }

  // ==========================
  // Work Orders
  // ==========================
  for (const w of workOrders) {
    const b = bucket(w.month);
    const cost = Number(w.final_cost || w.contractor_cost || 0);
    // Use contractor_name ONLY — is_contractor is unreliable (always 0 for most rows)
    const contractorName = String(w.contractor_name || "").trim();

    // Contractor = has a name AND name is not "Company" or "Internal"
    if (
      contractorName !== "" &&
      contractorName.toLowerCase() !== "company" &&
      contractorName.toLowerCase() !== "internal"
    ) {
      b.contractorWOCount++;
      b.contractorWO += cost;

      const name = contractorName;
      if (!b.contractorBreakdown[name]) {
        b.contractorBreakdown[name] = {
          woCount: 0, woCost: 0, projectCount: 0, projectCost: 0
        };
      }
      b.contractorBreakdown[name].woCount++;
      b.contractorBreakdown[name].woCost += cost;
    } else {
      // Employee (blank or "Company")
      b.employeeWOCount++;
    }
  }

  // ==========================
  // Projects
  // ==========================
  for (const p of projects) {
    const startDateRaw = p.start_date ?? p.startDate ?? "";
    if (String(startDateRaw).trim() === "") continue;

    const startDate = new Date(startDateRaw);
    const derivedMonth = !Number.isNaN(startDate.getTime())
      ? startDate.toISOString().slice(0, 7)
      : (p.month || "Unknown");

    const b = bucket(derivedMonth);
    const spent = Number(p.spent || 0);
    const contractorName = String(p.contractor || "").trim();

    if (
      contractorName !== "" &&
      contractorName.toLowerCase() !== "company" &&
      contractorName.toLowerCase() !== "internal"
    ) {
      b.contractorProjectCount++;
      b.contractorDev += spent;

      if (!b.contractorBreakdown[contractorName]) {
        b.contractorBreakdown[contractorName] = {
          woCount: 0, woCost: 0, projectCount: 0, projectCost: 0
        };
      }
      b.contractorBreakdown[contractorName].projectCount++;
      b.contractorBreakdown[contractorName].projectCost += spent;
    } else {
      b.internalProjectCount++;
    }
  }

  // ==========================
  // Purchases
  // ==========================
  for (const p of purchases) {
    const b = bucket(p.month);
    const amount = Number(p.total_cost || 0);
    const type = String(p.type || "").toLowerCase();
    const purchasedBy = String(p.purchased_by || "").trim().toLowerCase();
    const refNorm = normalizeWO(p.reference_no || '');
    const refNormProj = normalizeProj(p.reference_no || '');
    const pMonth = p.month || 'Unknown';

    // === Work Order / Maintenance purchases ===
    if (
      type.includes("work") ||
      type.includes("order") ||
      type.includes("maintenance")
    ) {
      // Same-month rule: only count if the WO exists in THIS month
      const wosThisMonth = woByMonth[pMonth] || new Set();
      if (wosThisMonth.has(refNorm)) {
        // Only Contractor purchases go to partsWO
        if (purchasedBy === 'contractor') {
          b.partsWO += amount;
        }
        // Company purchases for same-month WOs are not added
        // (they are internal/employee cost, already counted in employeeWOCount)
      }
      // Cross-month purchases are excluded
    }
    // === Development Project purchases ===
    else if (
      type.includes("dev") ||
      type.includes("project") ||
      type.includes("development")
    ) {
      // Same-month rule: only count if the Project exists in THIS month
      const projsThisMonth = projByMonth[pMonth] || new Set();
      if (projsThisMonth.has(refNormProj)) {
        b.partsDev += amount;
      }
    }
    // === Other purchases ===
    else {
      b.otherPurchases += amount;
    }
  }

  // ==========================
  // Calculate totals per month
  // ==========================
  for (const b of Object.values(months)) {
    b.maintActual = b.contractorWO + b.partsWO + b.salaryMaint;
    b.devActual = b.contractorDev + b.partsDev + b.salaryDev;

    b.maintSavings = MAINT_BASELINE - b.maintActual;
    b.devSavings = DEV_BASELINE - b.devActual;

    b.totalCost = b.maintActual + b.devActual + b.otherPurchases;
    b.totalSavings = b.maintSavings + b.devSavings;

    b.maintPct = MAINT_BASELINE ? (b.maintSavings / MAINT_BASELINE) * 100 : 0;
    b.devPct = DEV_BASELINE ? (b.devSavings / DEV_BASELINE) * 100 : 0;

    const baseline = MAINT_BASELINE + DEV_BASELINE;
    b.totalSavingsPct = baseline ? (b.totalSavings / baseline) * 100 : 0;
  }

  // ==========================
  // Sort and aggregate
  // ==========================
  const rows = Object.values(months)
    .filter(r => /^\d{4}-\d{2}$/.test(String(r.month)))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));

  const sum = field =>
    rows.reduce((s, r) => s + Number(r[field] || 0), 0);

  const maintenanceTotalBaseline = MAINT_BASELINE * rows.length;
  const developmentTotalBaseline = DEV_BASELINE * rows.length;
  const totalSavings = sum("totalSavings");
  const totalBaseline = maintenanceTotalBaseline + developmentTotalBaseline;

  // Merge contractor breakdown across all months
  const mergedBreakdown = {};
  for (const r of rows) {
    for (const [name, info] of Object.entries(r.contractorBreakdown || {})) {
      if (!mergedBreakdown[name]) {
        mergedBreakdown[name] = {
          woCount: 0, woCost: 0, projectCount: 0, projectCost: 0
        };
      }
      mergedBreakdown[name].woCount += info.woCount || 0;
      mergedBreakdown[name].woCost += info.woCost || 0;
      mergedBreakdown[name].projectCount += info.projectCount || 0;
      mergedBreakdown[name].projectCost += info.projectCost || 0;
    }
  }

  return {
    rows,

    grand: {
      monthCount: rows.length,

      // Dashboard aliases
      totalBaseline,
      totalActual: sum("maintActual") + sum("devActual"),
      months: rows,

      // Baseline
      baseline: totalBaseline,
      maintenanceBaseline: MAINT_BASELINE,
      developmentBaseline: DEV_BASELINE,
      maintenanceTotalBaseline,
      developmentTotalBaseline,

      // Actual costs
      contractorWO: sum("contractorWO"),
      partsWO: sum("partsWO"),
      salaryMaint: sum("salaryMaint"),
      maintActual: sum("maintActual"),

      contractorDev: sum("contractorDev"),
      partsDev: sum("partsDev"),
      salaryDev: sum("salaryDev"),
      devActual: sum("devActual"),

      otherPurchases: sum("otherPurchases"),
      totalCost: sum("totalCost"),

      // Savings
      maintSavings: sum("maintSavings"),
      devSavings: sum("devSavings"),
      totalSavings,

      maintTotalSavingsPct:
        maintenanceTotalBaseline
          ? (sum("maintSavings") / maintenanceTotalBaseline) * 100
          : 0,
      devTotalSavingsPct:
        developmentTotalBaseline
          ? (sum("devSavings") / developmentTotalBaseline) * 100
          : 0,
      totalSavingsPct:
        totalBaseline
          ? (totalSavings / totalBaseline) * 100
          : 0,

      // Counts
      employeeWOCount: sum("employeeWOCount"),
      contractorWOCount: sum("contractorWOCount"),
      totalWOCount: sum("employeeWOCount") + sum("contractorWOCount"),

      internalProjectCount: sum("internalProjectCount"),
      contractorProjectCount: sum("contractorProjectCount"),
      totalProjectCount:
        sum("internalProjectCount") + sum("contractorProjectCount"),

      // Contractor breakdown
      contractorBreakdown: mergedBreakdown
    }
  };
}


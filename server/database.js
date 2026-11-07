import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "fleet.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_number TEXT NOT NULL,
    plate_code TEXT NOT NULL,
    make TEXT DEFAULT 'Toyota',
    model TEXT DEFAULT 'Hilux',
    year INTEGER DEFAULT 2022,
    location TEXT DEFAULT '',
    driver TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    current_km INTEGER DEFAULT 0,
    last_oil_km INTEGER DEFAULT 0,
    oil_change_interval INTEGER DEFAULT 5000,
    last_oil_change_date TEXT,
    status TEXT DEFAULT 'Safe',
    meter_updated_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_plate ON vehicles(plate_number, plate_code);

  CREATE TABLE IF NOT EXISTS km_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    plate TEXT,
    reading_km INTEGER NOT NULL,
    reading_date DATE DEFAULT CURRENT_DATE,
    is_oil_change INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS oil_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    oil_change_km INTEGER NOT NULL,
    oil_change_date DATE DEFAULT CURRENT_DATE,
    changed_by TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER,
    title TEXT,
    location TEXT,
    category TEXT,
    priority TEXT DEFAULT 'Medium',
    status TEXT DEFAULT 'Open',
    description TEXT,
    reported_by TEXT,
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
  );

  -- ===== BUILDING MAINTENANCE =====
  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    name TEXT NOT NULL,
    region TEXT DEFAULT '',
    campus_manager TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    notes TEXT,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    license_no TEXT,
    license_expiry DATE,
    nationality TEXT,
    vehicle_id INTEGER,
    status TEXT DEFAULT 'Active',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    unit TEXT DEFAULT 'PCS',
    quantity REAL DEFAULT 0,
    min_stock REAL DEFAULT 5,
    unit_cost REAL DEFAULT 0,
    location TEXT DEFAULT 'Main Warehouse',
    supplier TEXT,
    status TEXT DEFAULT 'ACTIVE',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stock_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    item_code TEXT NOT NULL,
    item_name TEXT,
    quantity REAL DEFAULT 0,
    from_location TEXT,
    to_location TEXT,
    reference_no TEXT,
    notes TEXT,
    trans_date DATE DEFAULT CURRENT_DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS periodic_maintenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    scheduled_date DATE NOT NULL,
    completed_date DATE,
    status TEXT DEFAULT 'Pending',
    technician TEXT,
    cost REAL DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS work_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wo_no TEXT UNIQUE,
    site TEXT NOT NULL,
    area TEXT DEFAULT '',
    category TEXT NOT NULL,
    priority TEXT DEFAULT 'Medium',
    description TEXT,
    assigned_to TEXT,
    is_contractor INTEGER DEFAULT 0,
    contractor_name TEXT,
    status TEXT DEFAULT 'Open',
    reported_date DATE DEFAULT CURRENT_DATE,
    completed_date DATE,
    final_cost REAL DEFAULT 0,
    contractor_cost REAL DEFAULT 0,
    labor_cost REAL DEFAULT 0,
    parts_cost REAL DEFAULT 0,
    closing_notes TEXT,
    parts_used TEXT,
    month TEXT,
    year TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_no TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    site TEXT NOT NULL,
    project_type TEXT DEFAULT 'Development',
    status TEXT DEFAULT 'Active',
    budget REAL DEFAULT 0,
    spent REAL DEFAULT 0,
    start_date DATE,
    end_date DATE,
    manager TEXT,
    contractor TEXT,
    month TEXT,
    year TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_no TEXT UNIQUE,
    type TEXT NOT NULL,
    reference_no TEXT,
    item_name TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit_cost REAL DEFAULT 0,
    total_cost REAL DEFAULT 0,
    supplier TEXT,
    purchased_by TEXT DEFAULT 'Company',
    purchase_date DATE DEFAULT CURRENT_DATE,
    month TEXT,
    year TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log("Database ready:", dbPath);

function num(v, fb = 0) {
  if (v === undefined || v === null || v === "") return fb;
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function str(v, fb = "") {
  if (v === undefined || v === null) return fb;
  return String(v).trim();
}

function nowISO() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function getMonthYear(date = new Date()) {
  const month = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  return { month, year: String(date.getFullYear()) };
}

function genNo(prefix) {
  return prefix + "-" + String(Date.now()).slice(-6);
}

// ===== VEHICLES =====
function formatVehicle(v) {
  const currentKm = num(v.current_km);
  const lastOilKm = num(v.last_oil_km);
  const sinceOil = currentKm - lastOilKm;
  const interval = num(v.oil_change_interval, 5000);
  const remaining = interval - sinceOil;

  let status = "Safe";
  if (lastOilKm === 0 && currentKm > 0) status = "Urgent Overdue";
  else if (sinceOil >= interval) status = "Urgent Overdue";
  else if (sinceOil >= interval * 0.9) status = "Warning";

  return {
    id: v.id,
    plate: (v.plate_number + " " + v.plate_code).trim(),
    plateNumber: v.plate_number,
    plateCode: v.plate_code,
    make: v.make, model: v.model, year: v.year,
    location: v.location || "",
    driver: v.driver || "Unassigned",
    phone: v.phone || "",
    currentKm, lastOilKm, sinceOil, remaining, interval, status,
    lastOilChangeDate: v.last_oil_change_date,
    meterUpdatedAt: v.meter_updated_at
  };
}

export function listVehicles() {
  return db.prepare("SELECT * FROM vehicles ORDER BY plate_number").all().map(formatVehicle);
}

export function getVehicleById(id) {
  const v = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id);
  return v ? formatVehicle(v) : null;
}

export function createVehicle(data = {}) {
  const parts = str(data.plate).split(/\s+/).filter(Boolean);
  const plateNumber = parts[0] || "";
  const plateCode = parts.slice(1).join(" ").toUpperCase();
  const info = db.prepare(`
    INSERT INTO vehicles (plate_number, plate_code, make, model, year, location, driver, phone,
       current_km, last_oil_km, oil_change_interval, status, meter_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Safe', ?)
  `).run(plateNumber, plateCode, data.make || "Toyota", data.model || "Hilux",
    num(data.year, 2022), str(data.location), str(data.driver), str(data.phone),
    num(data.currentKm), num(data.lastOilKm), num(data.oilChangeInterval, 5000), nowISO());
  return getVehicleById(info.lastInsertRowid);
}

export function updateVehicle(id, data = {}) {
  const v = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id);
  if (!v) throw new Error("Vehicle not found");
  let plateNumber = v.plate_number, plateCode = v.plate_code;
  if (data.plate) {
    const parts = str(data.plate).split(/\s+/).filter(Boolean);
    plateNumber = parts[0] || plateNumber;
    plateCode = parts.slice(1).join(" ").toUpperCase() || plateCode;
  }
  db.prepare(`
    UPDATE vehicles SET plate_number = ?, plate_code = ?, make = ?, model = ?, year = ?,
      location = ?, driver = ?, phone = ?, current_km = ?, last_oil_km = ?,
      oil_change_interval = ?, last_oil_change_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(plateNumber, plateCode,
    data.make || v.make, data.model || v.model, num(data.year, v.year),
    data.location !== undefined ? str(data.location) : v.location,
    data.driver !== undefined ? str(data.driver) : v.driver,
    data.phone !== undefined ? str(data.phone) : v.phone,
    num(data.currentKm, v.current_km), num(data.lastOilKm, v.last_oil_km),
    num(data.oilChangeInterval, v.oil_change_interval),
    data.lastOilChangeDate !== undefined ? str(data.lastOilChangeDate) : v.last_oil_change_date,
    id);
  return getVehicleById(id);
}

export function deleteVehicle(id) {
  return db.prepare("DELETE FROM vehicles WHERE id = ?").run(id).changes > 0;
}

export function deleteAllVehicles() {
  return db.prepare("DELETE FROM vehicles").run().changes;
}

export function importVehicles(vehicles) {
  const results = { added: 0, failed: 0, errors: [] };
  for (const v of vehicles) {
    try {
      const parts = str(v.plate).split(/\s+/).filter(Boolean);
      const exists = db.prepare("SELECT id FROM vehicles WHERE plate_number = ? AND plate_code = ?")
        .get(parts[0], parts.slice(1).join(" ").toUpperCase());
      if (exists) { results.failed++; results.errors.push("Duplicate: " + v.plate); continue; }
      createVehicle(v);
      results.added++;
    } catch (e) { results.failed++; results.errors.push(v.plate + ": " + e.message); }
  }
  return results;
}

export function addReading(vehicleId, data = {}) {
  const v = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId);
  if (!v) throw new Error("Vehicle not found");
  const km = num(data.readingKm);
  if (km <= 0) throw new Error("Reading must be positive");
  if (km < v.current_km) throw new Error("Reading must be >= current");
  const readingDate = str(data.readingDate) || new Date().toISOString().slice(0, 10);
  db.prepare("INSERT INTO km_records (vehicle_id, plate, reading_km, reading_date, notes) VALUES (?, ?, ?, ?, ?)")
    .run(vehicleId, v.plate_number + " " + v.plate_code, km, readingDate, str(data.notes));
  db.prepare("UPDATE vehicles SET current_km = ?, meter_updated_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(km, nowISO(), vehicleId);
  return getVehicleById(vehicleId);
}

export function listReadings(vehicleId) {
  return db.prepare("SELECT * FROM km_records WHERE vehicle_id = ? ORDER BY reading_date DESC, id DESC LIMIT 50").all(vehicleId);
}

export function changeOil(vehicleId, data = {}) {
  const v = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId);
  if (!v) throw new Error("Vehicle not found");
  if (!v.current_km || v.current_km === 0) throw new Error("No current reading");
  const oilDate = str(data.oilChangeDate) || new Date().toISOString().slice(0, 10);
  db.prepare("INSERT INTO oil_changes (vehicle_id, oil_change_km, oil_change_date, changed_by, notes) VALUES (?, ?, ?, ?, ?)")
    .run(vehicleId, v.current_km, oilDate, str(data.changedBy, "Driver"), str(data.notes));
  db.prepare("UPDATE vehicles SET last_oil_km = ?, last_oil_change_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(v.current_km, oilDate, vehicleId);
  db.prepare("INSERT INTO km_records (vehicle_id, plate, reading_km, reading_date, is_oil_change, notes) VALUES (?, ?, ?, ?, 1, 'Oil change')")
    .run(vehicleId, v.plate_number + " " + v.plate_code, v.current_km, oilDate);
  return getVehicleById(vehicleId);
}

export function listOilChanges(vehicleId) {
  return db.prepare("SELECT * FROM oil_changes WHERE vehicle_id = ? ORDER BY oil_change_date DESC, id DESC LIMIT 20").all(vehicleId);
}

export function getAlerts() {
  const all = listVehicles();
  const urgent = all.filter(v => v.status === "Urgent Overdue").sort((a, b) => b.sinceOil - a.sinceOil);
  const warning = all.filter(v => v.status === "Warning").sort((a, b) => b.sinceOil - a.sinceOil);
  return {
    summary: { total: all.length, urgent: urgent.length, warning: warning.length, safe: all.length - urgent.length - warning.length },
    urgent, warning
  };
}

export function createTicket(data = {}) {
  const vehicleId = data.vehicleId || null;
  const v = vehicleId ? db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId) : null;
  const title = str(data.title) || (v ? "[" + str(data.category, "Issue") + "] " + v.plate_number + " " + v.plate_code : "General Issue");
  const openedAt = str(data.openedAt) || nowISO();
  const info = db.prepare(`
    INSERT INTO tickets (vehicle_id, title, location, category, priority, status, description, reported_by, opened_at)
    VALUES (?, ?, ?, ?, ?, 'Open', ?, ?, ?)
  `).run(vehicleId, title, str(data.location) || (v ? v.location : ""),
    str(data.category, "Other"), str(data.priority, "Medium"),
    str(data.description), str(data.reportedBy, "Driver"), openedAt);
  return db.prepare("SELECT * FROM tickets WHERE id = ?").get(info.lastInsertRowid);
}

export function listTickets() {
  return db.prepare(`
    SELECT t.*, CASE WHEN v.id IS NOT NULL THEN v.plate_number || ' ' || v.plate_code ELSE NULL END AS plate
    FROM tickets t LEFT JOIN vehicles v ON t.vehicle_id = v.id
    ORDER BY t.opened_at DESC
  `).all();
}

export function closeTicket(id, data = {}) {
  db.prepare("UPDATE tickets SET status = 'Closed', closed_at = CURRENT_TIMESTAMP, description = COALESCE(?, description) WHERE id = ?")
    .run(str(data.notes) || null, id);
  return db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
}

export function deleteAllTickets() {
  return db.prepare("DELETE FROM tickets").run().changes;
}

// ===== SITES =====
export function listSites() {
  return db.prepare("SELECT * FROM sites ORDER BY name").all();
}

export function getSite(id) {
  return db.prepare("SELECT * FROM sites WHERE id = ?").get(id);
}

export function createSite(data = {}) {
  const info = db.prepare(`
    INSERT INTO sites (code, name, region, campus_manager, phone, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(str(data.code), str(data.name), str(data.region),
    str(data.campusManager), str(data.phone), str(data.notes), str(data.status, "Active"));
  return getSite(info.lastInsertRowid);
}

export function updateSite(id, data = {}) {
  const s = getSite(id);
  if (!s) throw new Error("Site not found");
  db.prepare(`
    UPDATE sites SET code = ?, name = ?, region = ?, campus_manager = ?, phone = ?, notes = ?, status = ?
    WHERE id = ?
  `).run(str(data.code, s.code), str(data.name, s.name), str(data.region, s.region),
    str(data.campusManager, s.campus_manager), str(data.phone, s.phone),
    str(data.notes, s.notes), str(data.status, s.status), id);
  return getSite(id);
}

export function deleteSite(id) {
  return db.prepare("DELETE FROM sites WHERE id = ?").run(id).changes > 0;
}

// ===== WORK ORDERS =====
export function listWorkOrders(filters = {}) {
  let q = "SELECT * FROM work_orders";
  const params = []; const cond = [];
  if (filters.month) { cond.push("month = ?"); params.push(filters.month); }
  if (filters.year) { cond.push("year = ?"); params.push(filters.year); }
  if (filters.site) { cond.push("site = ?"); params.push(filters.site); }
  if (filters.status) { cond.push("status = ?"); params.push(filters.status); }
  if (cond.length) q += " WHERE " + cond.join(" AND ");
  q += " ORDER BY reported_date DESC, id DESC";
  return db.prepare(q).all(...params);
}

export function getWorkOrder(id) {
  return db.prepare("SELECT * FROM work_orders WHERE id = ?").get(id);
}

export function createWorkOrder(data = {}) {
  const now = new Date();
  const { month, year } = getMonthYear(now);
  const woNo = str(data.woNo) || genNo("WO");
  const info = db.prepare(`
    INSERT INTO work_orders (wo_no, site, area, category, priority, description,
      assigned_to, is_contractor, contractor_name, status, reported_date,
      parts_used, month, year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(woNo, str(data.site), str(data.area), str(data.category, "General"),
    str(data.priority, "Medium"), str(data.description),
    str(data.assignedTo), data.isContractor ? 1 : 0, str(data.contractorName),
    str(data.status, "Open"), str(data.reportedDate) || now.toISOString().slice(0, 10),
    str(data.partsUsed), month, year);
  return getWorkOrder(info.lastInsertRowid);
}

export function updateWorkOrder(id, data = {}) {
  const w = getWorkOrder(id);
  if (!w) throw new Error("Work order not found");
  db.prepare(`
    UPDATE work_orders SET
      site = ?, area = ?, category = ?, priority = ?, description = ?,
      assigned_to = ?, is_contractor = ?, contractor_name = ?, status = ?,
      completed_date = ?, final_cost = ?, contractor_cost = ?, labor_cost = ?,
      parts_cost = ?, closing_notes = ?, parts_used = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    str(data.site, w.site), str(data.area, w.area), str(data.category, w.category),
    str(data.priority, w.priority), str(data.description, w.description),
    str(data.assignedTo, w.assigned_to),
    data.isContractor !== undefined ? (data.isContractor ? 1 : 0) : w.is_contractor,
    str(data.contractorName, w.contractor_name),
    str(data.status, w.status),
    str(data.completedDate) || w.completed_date,
    num(data.finalCost, w.final_cost), num(data.contractorCost, w.contractor_cost),
    num(data.laborCost, w.labor_cost), num(data.partsCost, w.parts_cost),
    str(data.closingNotes, w.closing_notes), str(data.partsUsed, w.parts_used), id);
  return getWorkOrder(id);
}

export function closeWorkOrder(id, data = {}) {
  const w = getWorkOrder(id);
  if (!w) throw new Error("Work order not found");
  db.prepare(`
    UPDATE work_orders SET status = 'Closed', completed_date = CURRENT_DATE,
      final_cost = ?, contractor_cost = ?, labor_cost = ?, parts_cost = ?,
      closing_notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(num(data.finalCost), num(data.contractorCost), num(data.laborCost),
    num(data.partsCost), str(data.closingNotes), id);
  return getWorkOrder(id);
}

export function deleteWorkOrder(id) {
  return db.prepare("DELETE FROM work_orders WHERE id = ?").run(id).changes > 0;
}

// ===== PROJECTS =====
export function listProjects(filters = {}) {
  let q = "SELECT * FROM projects";
  const params = []; const cond = [];
  if (filters.month) { cond.push("month = ?"); params.push(filters.month); }
  if (filters.year) { cond.push("year = ?"); params.push(filters.year); }
  if (filters.site) { cond.push("site = ?"); params.push(filters.site); }
  if (cond.length) q += " WHERE " + cond.join(" AND ");
  q += " ORDER BY created_at DESC";
  return db.prepare(q).all(...params);
}

export function getProject(id) {
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
}

export function createProject(data = {}) {
  const now = new Date();
  const { month, year } = getMonthYear(now);
  const projectNo = str(data.projectNo) || genNo("PRJ");
  const info = db.prepare(`
    INSERT INTO projects (project_no, name, description, site, project_type, status,
      budget, spent, start_date, end_date, manager, contractor, month, year, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(projectNo, str(data.name, "New Project"), str(data.description),
    str(data.site), str(data.projectType, "Development"), str(data.status, "Active"),
    num(data.budget), num(data.spent),
    str(data.startDate) || now.toISOString().slice(0, 10),
    str(data.endDate), str(data.manager), str(data.contractor),
    month, year, str(data.notes));
  return getProject(info.lastInsertRowid);
}

export function updateProject(id, data = {}) {
  const p = getProject(id);
  if (!p) throw new Error("Project not found");
  db.prepare(`
    UPDATE projects SET name = ?, description = ?, site = ?, project_type = ?,
      status = ?, budget = ?, spent = ?, start_date = ?, end_date = ?,
      manager = ?, contractor = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(str(data.name, p.name), str(data.description, p.description),
    str(data.site, p.site), str(data.projectType, p.project_type),
    str(data.status, p.status), num(data.budget, p.budget), num(data.spent, p.spent),
    str(data.startDate) || p.start_date, str(data.endDate) || p.end_date,
    str(data.manager, p.manager), str(data.contractor, p.contractor),
    str(data.notes, p.notes), id);
  return getProject(id);
}

export function deleteProject(id) {
  return db.prepare("DELETE FROM projects WHERE id = ?").run(id).changes > 0;
}

// ===== PURCHASES =====
export function listPurchases(filters = {}) {
  let q = "SELECT * FROM purchases";
  const params = []; const cond = [];
  if (filters.month) { cond.push("month = ?"); params.push(filters.month); }
  if (filters.year) { cond.push("year = ?"); params.push(filters.year); }
  if (filters.referenceNo) { cond.push("reference_no = ?"); params.push(filters.referenceNo); }
  if (cond.length) q += " WHERE " + cond.join(" AND ");
  q += " ORDER BY purchase_date DESC, id DESC";
  return db.prepare(q).all(...params);
}

export function createPurchase(data = {}) {
  const now = new Date();
  const { month, year } = getMonthYear(now);
  const purchaseNo = str(data.purchaseNo) || genNo("PUR");
  const qty = num(data.quantity, 1);
  const unitCost = num(data.unitCost);
  const totalCost = data.totalCost !== undefined ? num(data.totalCost) : qty * unitCost;
  const info = db.prepare(`
    INSERT INTO purchases (purchase_no, type, reference_no, item_name, quantity,
      unit_cost, total_cost, supplier, purchased_by, purchase_date, month, year, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(purchaseNo, str(data.type, "Work Order"), str(data.referenceNo),
    str(data.itemName), qty, unitCost, totalCost, str(data.supplier),
    str(data.purchasedBy, "Company"),
    str(data.purchaseDate) || now.toISOString().slice(0, 10),
    month, year, str(data.notes));
  return db.prepare("SELECT * FROM purchases WHERE id = ?").get(info.lastInsertRowid);
}

export function deletePurchase(id) {
  return db.prepare("DELETE FROM purchases WHERE id = ?").run(id).changes > 0;
}

// ===== BUILDING DASHBOARD =====
export function getBuildingDashboard(filters = {}) {
  const wos = listWorkOrders(filters);
  const projects = listProjects(filters);
  const purchases = listPurchases(filters);

  const openWO = wos.filter(w => w.status === "Open").length;
  const closedWO = wos.filter(w => w.status === "Closed").length;
  const contractorWO = wos.filter(w => w.is_contractor === 1).length;
  const internalWO = wos.length - contractorWO;

  const woTotalCost = wos.reduce((s, w) => s + num(w.final_cost), 0);
  const woContractorCost = wos.reduce((s, w) => s + num(w.contractor_cost), 0);
  const woLaborCost = wos.reduce((s, w) => s + num(w.labor_cost), 0);
  const woPartsCost = wos.reduce((s, w) => s + num(w.parts_cost), 0);

  const projTotalBudget = projects.reduce((s, p) => s + num(p.budget), 0);
  const projTotalSpent = projects.reduce((s, p) => s + num(p.spent), 0);

  const purchasesTotal = purchases.reduce((s, p) => s + num(p.total_cost), 0);

  return {
    workOrders: {
      total: wos.length, open: openWO, closed: closedWO,
      contractor: contractorWO, internal: internalWO,
      totalCost: woTotalCost, contractorCost: woContractorCost,
      laborCost: woLaborCost, partsCost: woPartsCost
    },
    projects: {
      total: projects.length, budget: projTotalBudget, spent: projTotalSpent,
      list: projects
    },
    purchases: { total: purchases.length, totalCost: purchasesTotal }
  };
}

// ===== VEHICLE DASHBOARD =====
export function getDashboard() {
  const alerts = getAlerts();
  const tickets = listTickets();
  const vehicles = listVehicles();

  const openTickets = tickets.filter(t => t.status === "Open").length;
  const closedTickets = tickets.filter(t => t.status === "Closed").length;

  return {
    vehicles: { total: vehicles.length, urgent: alerts.summary.urgent, warning: alerts.summary.warning, safe: alerts.summary.safe, list: vehicles },
    tickets: { total: tickets.length, open: openTickets, closed: closedTickets },
    alerts
  };
}


// ===== MONTHLY REPORT =====
export function getMonthlyReport(filters = {}) {
  const { year, site } = filters;

  // Work Orders
  let woQuery = "SELECT month, year, site, is_contractor, final_cost, contractor_cost, labor_cost, parts_cost FROM work_orders";
  const woParams = []; const woCond = [];
  if (year) { woCond.push("year = ?"); woParams.push(String(year)); }
  if (site) { woCond.push("site = ?"); woParams.push(site); }
  if (woCond.length) woQuery += " WHERE " + woCond.join(" AND ");
  const wos = db.prepare(woQuery).all(...woParams);

  // Projects
  let projQuery = "SELECT month, year, site, budget, spent, contractor FROM projects";
  const projParams = []; const projCond = [];
  if (year) { projCond.push("year = ?"); projParams.push(String(year)); }
  if (site) { projCond.push("site = ?"); projParams.push(site); }
  if (projCond.length) projQuery += " WHERE " + projCond.join(" AND ");
  const projects = db.prepare(projQuery).all(...projParams);

  // Purchases
  let purQuery = "SELECT month, year, purchased_by, total_cost, type, reference_no FROM purchases";
  const purParams = []; const purCond = [];
  if (year) { purCond.push("year = ?"); purParams.push(String(year)); }
  if (purCond.length) purQuery += " WHERE " + purCond.join(" AND ");
  const purchases = db.prepare(purQuery).all(...purParams);

  // Aggregate by month
  const months = {};
  const ensureMonth = (m) => {
    if (!m) return null;
    if (!months[m]) {
      months[m] = {
        month: m,
        woCount: 0, woCost: 0, woContractor: 0, woInternal: 0,
        projCount: 0, projSpent: 0,
        purCount: 0, purCost: 0, purCompany: 0, purContractor: 0,
        total: 0
      };
    }
    return months[m];
  };

  wos.forEach(w => {
    const row = ensureMonth(w.month);
    if (!row) return;
    row.woCount++;
    row.woCost += Number(w.final_cost || 0);
    if (w.is_contractor === 1) row.woContractor += Number(w.final_cost || 0);
    else row.woInternal += Number(w.final_cost || 0);
  });

  projects.forEach(p => {
    const row = ensureMonth(p.month);
    if (!row) return;
    row.projCount++;
    row.projSpent += Number(p.spent || 0);
  });

  purchases.forEach(p => {
    const row = ensureMonth(p.month);
    if (!row) return;
    row.purCount++;
    const cost = Number(p.total_cost || 0);
    row.purCost += cost;
    if (p.purchased_by === "Contractor") row.purContractor += cost;
    else row.purCompany += cost;
  });

  // Compute totals
  Object.values(months).forEach(m => {
    m.total = m.woCost + m.projSpent + m.purCost;
  });

  const monthlyList = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));

  // Grand totals
  const grandTotal = monthlyList.reduce((s, m) => s + m.total, 0);
  const totalWO = monthlyList.reduce((s, m) => s + m.woCost, 0);
  const totalProj = monthlyList.reduce((s, m) => s + m.projSpent, 0);
  const totalPur = monthlyList.reduce((s, m) => s + m.purCost, 0);
  const totalContractor = monthlyList.reduce((s, m) => s + m.woContractor + m.purContractor, 0);
  const totalInternal = grandTotal - totalContractor;

  return {
    months: monthlyList,
    summary: {
      grandTotal,
      totalWO,
      totalProjects: totalProj,
      totalPurchases: totalPur,
      totalContractor,
      totalInternal,
      internalPercent: grandTotal > 0 ? Math.round((totalInternal / grandTotal) * 100) : 0,
      contractorPercent: grandTotal > 0 ? Math.round((totalContractor / grandTotal) * 100) : 0
    }
  };
}

// ===== DRIVERS =====
export function listDrivers() {
  return db.prepare(`
    SELECT d.*, 
      CASE WHEN v.id IS NOT NULL THEN v.plate_number || ' ' || v.plate_code ELSE NULL END AS vehicle_plate
    FROM drivers d
    LEFT JOIN vehicles v ON d.vehicle_id = v.id
    ORDER BY d.name
  `).all();
}

export function getDriver(id) {
  return db.prepare("SELECT * FROM drivers WHERE id = ?").get(id);
}

export function createDriver(data = {}) {
  const info = db.prepare(`
    INSERT INTO drivers (name, phone, license_no, license_expiry, nationality, vehicle_id, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    str(data.name),
    str(data.phone),
    str(data.licenseNo),
    str(data.licenseExpiry),
    str(data.nationality),
    data.vehicleId || null,
    str(data.status, "Active"),
    str(data.notes)
  );
  return getDriver(info.lastInsertRowid);
}

export function updateDriver(id, data = {}) {
  const d = getDriver(id);
  if (!d) throw new Error("Driver not found");
  db.prepare(`
    UPDATE drivers SET name = ?, phone = ?, license_no = ?, license_expiry = ?,
      nationality = ?, vehicle_id = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    str(data.name, d.name),
    str(data.phone, d.phone),
    str(data.licenseNo, d.license_no),
    str(data.licenseExpiry, d.license_expiry),
    str(data.nationality, d.nationality),
    data.vehicleId !== undefined ? (data.vehicleId || null) : d.vehicle_id,
    str(data.status, d.status),
    str(data.notes, d.notes),
    id
  );
  return getDriver(id);
}

export function deleteDriver(id) {
  return db.prepare("DELETE FROM drivers WHERE id = ?").run(id).changes > 0;
}

// ===== WAREHOUSE =====
export function listInventory() {
  return db.prepare("SELECT * FROM inventory ORDER BY name").all();
}

export function getInventoryItem(id) {
  return db.prepare("SELECT * FROM inventory WHERE id = ? OR code = ?").get(id, id);
}

export function createInventoryItem(data = {}) {
  const info = db.prepare(`
    INSERT INTO inventory (code, name, category, unit, quantity, min_stock, unit_cost, location, supplier, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    str(data.code), str(data.name), str(data.category, "General"),
    str(data.unit, "PCS"), num(data.quantity), num(data.minStock, 5),
    num(data.unitCost), str(data.location, "Main Warehouse"),
    str(data.supplier), str(data.status, "ACTIVE"), str(data.notes)
  );
  return db.prepare("SELECT * FROM inventory WHERE id = ?").get(info.lastInsertRowid);
}

export function updateInventoryItem(id, data = {}) {
  const item = db.prepare("SELECT * FROM inventory WHERE id = ?").get(id);
  if (!item) throw new Error("Item not found");
  db.prepare(`
    UPDATE inventory SET code = ?, name = ?, category = ?, unit = ?, quantity = ?,
      min_stock = ?, unit_cost = ?, location = ?, supplier = ?, status = ?, notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    str(data.code, item.code), str(data.name, item.name),
    str(data.category, item.category), str(data.unit, item.unit),
    num(data.quantity, item.quantity), num(data.minStock, item.min_stock),
    num(data.unitCost, item.unit_cost), str(data.location, item.location),
    str(data.supplier, item.supplier), str(data.status, item.status),
    str(data.notes, item.notes), id
  );
  return db.prepare("SELECT * FROM inventory WHERE id = ?").get(id);
}

export function deleteInventoryItem(id) {
  return db.prepare("DELETE FROM inventory WHERE id = ?").run(id).changes > 0;
}

export function stockIn(data = {}) {
  const item = db.prepare("SELECT * FROM inventory WHERE code = ? OR id = ?").get(data.itemCode, data.itemCode);
  if (!item) throw new Error("Item not found");
  const qty = num(data.quantity);
  if (qty <= 0) throw new Error("Quantity must be positive");
  db.prepare("UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(qty, item.id);
  const info = db.prepare(`
    INSERT INTO stock_transactions (type, item_code, item_name, quantity, to_location, reference_no, notes, trans_date)
    VALUES ('IN', ?, ?, ?, ?, ?, ?, ?)
  `).run(item.code, item.name, qty, str(data.location, item.location), str(data.referenceNo), str(data.notes), str(data.date) || new Date().toISOString().slice(0, 10));
  return db.prepare("SELECT * FROM stock_transactions WHERE id = ?").get(info.lastInsertRowid);
}

export function stockOut(data = {}) {
  const item = db.prepare("SELECT * FROM inventory WHERE code = ? OR id = ?").get(data.itemCode, data.itemCode);
  if (!item) throw new Error("Item not found");
  const qty = num(data.quantity);
  if (qty <= 0) throw new Error("Quantity must be positive");
  if (item.quantity < qty) throw new Error("Insufficient stock. Available: " + item.quantity);
  db.prepare("UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(qty, item.id);
  const info = db.prepare(`
    INSERT INTO stock_transactions (type, item_code, item_name, quantity, from_location, reference_no, notes, trans_date)
    VALUES ('OUT', ?, ?, ?, ?, ?, ?, ?)
  `).run(item.code, item.name, qty, str(data.location, item.location), str(data.referenceNo), str(data.notes), str(data.date) || new Date().toISOString().slice(0, 10));
  return db.prepare("SELECT * FROM stock_transactions WHERE id = ?").get(info.lastInsertRowid);
}

export function transferStock(data = {}) {
  const item = db.prepare("SELECT * FROM inventory WHERE code = ? OR id = ?").get(data.itemCode, data.itemCode);
  if (!item) throw new Error("Item not found");
  const qty = num(data.quantity);
  if (qty <= 0) throw new Error("Quantity must be positive");
  if (item.quantity < qty) throw new Error("Insufficient stock. Available: " + item.quantity);
  const fromLoc = str(data.fromLocation, item.location);
  const toLoc = str(data.toLocation);
  if (!toLoc) throw new Error("Destination location required");
  if (fromLoc === toLoc) throw new Error("From and To must be different");
  db.prepare("UPDATE inventory SET location = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(toLoc, item.id);
  const info = db.prepare(`
    INSERT INTO stock_transactions (type, item_code, item_name, quantity, from_location, to_location, reference_no, notes, trans_date)
    VALUES ('TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(item.code, item.name, qty, fromLoc, toLoc, str(data.referenceNo), str(data.notes), str(data.date) || new Date().toISOString().slice(0, 10));
  return db.prepare("SELECT * FROM stock_transactions WHERE id = ?").get(info.lastInsertRowid);
}

export function listStockTransactions() {
  return db.prepare("SELECT * FROM stock_transactions ORDER BY trans_date DESC, id DESC").all();
}

export function getLowStockItems() {
  return db.prepare("SELECT * FROM inventory WHERE quantity <= min_stock AND status = 'ACTIVE' ORDER BY quantity").all();
}

// ===== PERIODIC MAINTENANCE =====
export function listPeriodicMaintenance(filters = {}) {
  let q = `
    SELECT pm.*,
      CASE WHEN v.id IS NOT NULL THEN v.plate_number || ' ' || v.plate_code ELSE NULL END AS vehicle_plate,
      v.driver AS driver_name
    FROM periodic_maintenance pm
    LEFT JOIN vehicles v ON pm.vehicle_id = v.id
  `;
  const params = []; const cond = [];
  if (filters.vehicleId) { cond.push("pm.vehicle_id = ?"); params.push(filters.vehicleId); }
  if (filters.type) { cond.push("pm.type = ?"); params.push(filters.type); }
  if (filters.status) { cond.push("pm.status = ?"); params.push(filters.status); }
  if (cond.length) q += " WHERE " + cond.join(" AND ");
  q += " ORDER BY pm.scheduled_date ASC";
  return db.prepare(q).all(...params);
}

export function getPeriodicMaintenance(id) {
  return db.prepare("SELECT * FROM periodic_maintenance WHERE id = ?").get(id);
}

export function createPeriodicMaintenance(data = {}) {
  if (!data.vehicleId) throw new Error("Vehicle required");
  if (!data.type) throw new Error("Type required");
  if (!data.scheduledDate) throw new Error("Scheduled date required");
  const info = db.prepare(`
    INSERT INTO periodic_maintenance (vehicle_id, type, scheduled_date, status, technician, cost, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.vehicleId, str(data.type), str(data.scheduledDate),
    str(data.status, "Pending"), str(data.technician),
    num(data.cost), str(data.notes)
  );
  return getPeriodicMaintenance(info.lastInsertRowid);
}

export function updatePeriodicMaintenance(id, data = {}) {
  const p = getPeriodicMaintenance(id);
  if (!p) throw new Error("Record not found");
  db.prepare(`
    UPDATE periodic_maintenance SET
      type = ?, scheduled_date = ?, completed_date = ?, status = ?,
      technician = ?, cost = ?, notes = ?
    WHERE id = ?
  `).run(
    str(data.type, p.type),
    str(data.scheduledDate, p.scheduled_date),
    str(data.completedDate) || p.completed_date,
    str(data.status, p.status),
    str(data.technician, p.technician),
    num(data.cost, p.cost),
    str(data.notes, p.notes),
    id
  );
  return getPeriodicMaintenance(id);
}

export function completePeriodicMaintenance(id, data = {}) {
  const p = getPeriodicMaintenance(id);
  if (!p) throw new Error("Record not found");
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`
    UPDATE periodic_maintenance SET
      status = 'Completed', completed_date = ?,
      technician = ?, cost = ?, notes = ?
    WHERE id = ?
  `).run(
    str(data.completedDate) || today,
    str(data.technician) || p.technician,
    num(data.cost, p.cost),
    str(data.notes) || p.notes,
    id
  );
  return getPeriodicMaintenance(id);
}

export function deletePeriodicMaintenance(id) {
  return db.prepare("DELETE FROM periodic_maintenance WHERE id = ?").run(id).changes > 0;
}

export function getPeriodicAlerts() {
  const all = listPeriodicMaintenance();
  const today = new Date().toISOString().slice(0, 10);
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7 = in7Days.toISOString().slice(0, 10);

  const overdue = all.filter(p => p.status === 'Pending' && p.scheduled_date < today);
  const dueSoon = all.filter(p => p.status === 'Pending' && p.scheduled_date >= today && p.scheduled_date <= in7);

  return { overdue, dueSoon };
}

export function generateScheduledMaintenance(monthsAhead = 6) {
  // Auto-generate next due dates for all vehicles
  const vehicles = listVehicles();
  const created = [];
  const targetDate = new Date();
  targetDate.setMonth(targetDate.getMonth() + monthsAhead);
  const target = targetDate.toISOString().slice(0, 10);

  const existing = db.prepare("SELECT vehicle_id, type FROM periodic_maintenance WHERE status = 'Pending'").all();
  const existingSet = new Set(existing.map(e => e.vehicle_id + '-' + e.type));

  for (const v of vehicles) {
    for (const type of ['6_months_general', 'inspection']) {
      const key = v.id + '-' + type;
      if (existingSet.has(key)) continue;
      try {
        const r = createPeriodicMaintenance({ vehicleId: v.id, type, scheduledDate: target });
        created.push(r);
      } catch { /* skip */ }
    }
  }
  return created;
}

// ===== AUDIT LOG =====
export function logAction(data = {}) {
  try {
    const info = db.prepare(`
      INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.userId || null,
      str(data.username, "system"),
      str(data.action),
      str(data.entityType),
      str(data.entityId),
      str(data.details),
      str(data.ipAddress)
    );
    return db.prepare("SELECT * FROM audit_log WHERE id = ?").get(info.lastInsertRowid);
  } catch (e) {
    console.error("Audit log error:", e.message);
    return null;
  }
}

export function listAuditLog(filters = {}) {
  let q = "SELECT * FROM audit_log";
  const params = []; const cond = [];
  if (filters.username) { cond.push("username = ?"); params.push(filters.username); }
  if (filters.action) { cond.push("action = ?"); params.push(filters.action); }
  if (filters.entityType) { cond.push("entity_type = ?"); params.push(filters.entityType); }
  if (filters.fromDate) { cond.push("date(created_at) >= ?"); params.push(filters.fromDate); }
  if (filters.toDate) { cond.push("date(created_at) <= ?"); params.push(filters.toDate); }
  if (cond.length) q += " WHERE " + cond.join(" AND ");
  q += " ORDER BY created_at DESC, id DESC LIMIT 500";
  return db.prepare(q).all(...params);
}

export function getAuditStats() {
  const total = db.prepare("SELECT COUNT(*) as c FROM audit_log").get().c;
  const today = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE date(created_at) = date('now')").get().c;
  const byUser = db.prepare("SELECT username, COUNT(*) as count FROM audit_log GROUP BY username ORDER BY count DESC LIMIT 10").all();
  const byAction = db.prepare("SELECT action, COUNT(*) as count FROM audit_log GROUP BY action ORDER BY count DESC LIMIT 10").all();
  return { total, today, byUser, byAction };
}

export function clearAuditLog(olderThanDays = 90) {
  const info = db.prepare("DELETE FROM audit_log WHERE date(created_at) < date('now', '-' || ? || ' days')").run(olderThanDays);
  return info.changes;
}

// ===== TICKET FEEDBACK =====
export function acknowledgeTicket(id, data = {}) {
  const t = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
  if (!t) throw new Error("Ticket not found");
  db.prepare(`
    UPDATE tickets SET
      acknowledged_at = CURRENT_TIMESTAMP,
      acknowledged_by = ?,
      status = CASE WHEN status = 'Open' THEN 'Acknowledged' ELSE status END
    WHERE id = ?
  `).run(str(data.acknowledgedBy, "Owner"), id);
  return db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
}

export function closeTicketWithNotes(id, data = {}) {
  db.prepare(`
    UPDATE tickets SET
      status = 'Closed',
      closed_at = CURRENT_TIMESTAMP,
      closed_by = ?,
      resolution_notes = COALESCE(?, resolution_notes)
    WHERE id = ?
  `).run(str(data.closedBy, "Owner"), str(data.resolutionNotes) || null, id);
  return db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
}

export function listTicketsByReporter(reporterName) {
  return db.prepare(`
    SELECT t.*,
      CASE WHEN v.id IS NOT NULL THEN v.plate_number || ' ' || v.plate_code ELSE NULL END AS plate
    FROM tickets t
    LEFT JOIN vehicles v ON t.vehicle_id = v.id
    WHERE t.reported_by = ?
    ORDER BY t.opened_at DESC
    LIMIT 100
  `).all(reporterName);
}

export function getReporterStats(reporterName) {
  const all = listTicketsByReporter(reporterName);
  const open = all.filter(t => t.status === 'Open').length;
  const acknowledged = all.filter(t => t.status === 'Acknowledged').length;
  const closed = all.filter(t => t.status === 'Closed').length;
  const recent = all.slice(0, 5);
  return { total: all.length, open, acknowledged, closed, recent };
}

// ===== FINANCIAL REPORT (Baseline vs Actual) =====
export function getFinancialReport() {
  const MAINT_BASELINE = 20577;
  const DEV_BASELINE = 132551;
  const SALARY_PER_DEPT = 2200;

  // Work Orders (Contractor cost)
  const woByMonth = db.prepare(`
    SELECT month, 
      SUM(COALESCE(contractor_cost, 0)) as wo_cost,
      SUM(COALESCE(final_cost, 0)) as wo_total_cost
    FROM work_orders
    WHERE month IS NOT NULL AND month != ''
    GROUP BY month
  `).all();

  // Projects (Development cost)
  const devByMonth = db.prepare(`
    SELECT month, SUM(COALESCE(spent, 0)) as dev_cost
    FROM projects
    WHERE month IS NOT NULL AND month != ''
    GROUP BY month
  `).all();

  // Purchases - classify by type
  const purByMonth = db.prepare(`
    SELECT month, type, SUM(COALESCE(total_cost, 0)) as cost
    FROM purchases
    WHERE month IS NOT NULL AND month != ''
    GROUP BY month, type
  `).all();

  // Build month map
  const months = {};
  const ensure = (m) => {
    if (!m) return null;
    if (!months[m]) {
      months[m] = {
        month: m,
        contractorWO: 0,
        contractorDev: 0,
        partsWO: 0,
        partsDev: 0,
        otherPurchases: 0
      };
    }
    return months[m];
  };

  woByMonth.forEach(r => {
    const row = ensure(r.month);
    if (row) row.contractorWO += Number(r.wo_cost || 0);
  });

  devByMonth.forEach(r => {
    const row = ensure(r.month);
    if (row) row.contractorDev += Number(r.dev_cost || 0);
  });

  purByMonth.forEach(r => {
    const row = ensure(r.month);
    if (!row) return;
    const cost = Number(r.cost || 0);
    const t = String(r.type || '').toLowerCase();
    if (t.includes('dev') || t.includes('project')) {
      row.partsDev += cost;
    } else if (t.includes('work') || t.includes('order') || t.includes('maintenance')) {
      row.partsWO += cost;
    } else {
      row.otherPurchases += cost;
    }
  });

  // Compute derived values
  const result = Object.values(months).map(row => {
    const salary = SALARY_PER_DEPT;
    const totalLabor = row.contractorWO + row.contractorDev;
    const totalParts = row.partsWO + row.partsDev;
    const totalCost = totalLabor + totalParts;

    // Maintenance
    const maintActual = row.contractorWO + row.partsWO + salary;
    const maintSavings = MAINT_BASELINE - maintActual;
    const maintPct = MAINT_BASELINE > 0 ? (maintSavings / MAINT_BASELINE) * 100 : 0;

    // Development
    const devActual = row.contractorDev + row.partsDev + salary;
    const devSavings = DEV_BASELINE - devActual;
    const devPct = DEV_BASELINE > 0 ? (devSavings / DEV_BASELINE) * 100 : 0;

    // Total
    const totalBaseline = MAINT_BASELINE + DEV_BASELINE;
    const totalActual = maintActual + devActual;
    const totalSavings = maintSavings + devSavings;
    const totalSavingsPct = totalBaseline > 0 ? (totalSavings / totalBaseline) * 100 : 0;

    return {
      month: row.month,
      contractorWO: row.contractorWO,
      contractorDev: row.contractorDev,
      partsWO: row.partsWO,
      partsDev: row.partsDev,
      otherPurchases: row.otherPurchases,
      salary: salary,
      totalLabor,
      totalParts,
      totalCost,
      maintActual,
      maintSavings,
      maintPct,
      devActual,
      devSavings,
      devPct,
      totalSavings,
      totalSavingsPct
    };
  })
  .filter(r => r.contractorWO > 0 || r.contractorDev > 0 || r.partsWO > 0 || r.partsDev > 0)
  .sort((a, b) => a.month.localeCompare(b.month));

  // Grand totals
  const monthCount = result.length;
  const grand = {
    monthCount: monthCount,
    baseline: (MAINT_BASELINE + DEV_BASELINE) * monthCount,
    maintenanceBaseline: MAINT_BASELINE,
    developmentBaseline: DEV_BASELINE,
    contractorWO: result.reduce((s, r) => s + r.contractorWO, 0),
    contractorDev: result.reduce((s, r) => s + r.contractorDev, 0),
    partsWO: result.reduce((s, r) => s + r.partsWO, 0),
    partsDev: result.reduce((s, r) => s + r.partsDev, 0),
    salary: result.reduce((s, r) => s + r.salary, 0),
    totalCost: result.reduce((s, r) => s + r.totalCost, 0),
    maintActual: result.reduce((s, r) => s + r.maintActual, 0),
    maintSavings: result.reduce((s, r) => s + r.maintSavings, 0),
    devActual: result.reduce((s, r) => s + r.devActual, 0),
    devSavings: result.reduce((s, r) => s + r.devSavings, 0),
    totalSavings: result.reduce((s, r) => s + r.totalSavings, 0)
  };
  grand.totalSavingsPct = grand.baseline > 0 ? (grand.totalSavings / grand.baseline) * 100 : 0;
  grand.maintenanceTotalBaseline = MAINT_BASELINE * monthCount;
  grand.developmentTotalBaseline = DEV_BASELINE * monthCount;
  grand.maintTotalSavingsPct = grand.maintenanceTotalBaseline > 0 ? (grand.maintSavings / grand.maintenanceTotalBaseline) * 100 : 0;
  grand.devTotalSavingsPct = grand.developmentTotalBaseline > 0 ? (grand.devSavings / grand.developmentTotalBaseline) * 100 : 0;

  return { months: result, grand };
}
export default db;










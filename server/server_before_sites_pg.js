import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { login, verifyToken, listUsers, createUser, deleteUser } from "./auth.js";
import cors from "cors";
import { requirePermission } from "./rbac.js";
import {
  listVehicles, getVehicleById, createVehicle, updateVehicle,
  deleteVehicle, deleteAllVehicles, importVehicles,
  addReading, listReadings, changeOil, listOilChanges,
  getAlerts,
  getDashboard,
  listSites, getSite, createSite, updateSite, deleteSite,
  listWorkOrders, getWorkOrder, createWorkOrder, updateWorkOrder, closeWorkOrder, deleteWorkOrder,
  listProjects, getProject, createProject, updateProject, deleteProject,
  listPurchases, createPurchase, deletePurchase,
  getBuildingDashboard,
  getMonthlyReport,
  listDrivers, getDriver, createDriver, updateDriver, deleteDriver,
  listInventory, getInventoryItem, createInventoryItem, updateInventoryItem, deleteInventoryItem,
  stockIn, stockOut, transferStock, listStockTransactions, getLowStockItems,
  listPeriodicMaintenance, getPeriodicMaintenance, createPeriodicMaintenance, updatePeriodicMaintenance,
  completePeriodicMaintenance, deletePeriodicMaintenance, getPeriodicAlerts, generateScheduledMaintenance,
  logAction, listAuditLog, getAuditStats, clearAuditLog, getFinancialReport
} from "./database.js";

import {
  listVehicles as listVehiclesPG,
  getVehicleById as getVehicleByIdPG,
  getVehicleByPlate as getVehicleByPlatePG,
  createVehicle as createVehiclePG,
  updateVehicle as updateVehiclePG,
  deleteVehicle as deleteVehiclePG,
  deleteAllVehicles as deleteAllVehiclesPG,

  addReading as addReadingPG,
  listReadings as listReadingsPG,
  changeOil as changeOilPG,
  listOilChanges as listOilChangesPG,

  createTicket as createTicketPG,
  listTickets as listTicketsPG,
  closeTicket as closeTicketPG,
  deleteAllTickets as deleteAllTicketsPG,
  acknowledgeTicket as acknowledgeTicketPG,
  closeTicketWithNotes as closeTicketWithNotesPG,
  listTicketsByReporter as listTicketsByReporterPG,
  getReporterStats as getReporterStatsPG
} from './database-pg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ============================================================
// GLOBAL API AUTHENTICATION
// ============================================================
app.use("/api", (req, res, next) => {
  if (req.path === "/health") return next();
  if (req.path === "/auth/login") return next();
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role === "GM" && ["POST","PUT","PATCH","DELETE"].includes(req.method)) {
      return res.status(403).json({ success: false, error: "Forbidden", message: "GM role is read-only." });
    }
    requirePermission(req, res, next);
  });
});

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// ===== VEHICLES (PostgreSQL Connected) =====
app.get("/api/vehicles", async (req, res) => {
  try {
    const vehicles = await listVehiclesPG();
    res.json({ success: true, vehicles });
  } catch (e) {
    console.error("Error fetching vehicles:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/vehicles/list", (req, res) => {
  try { res.json({ success: true, vehicles: listVehicles().map(v => ({ id: v.id, plate: v.plate, driver: v.driver })) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/vehicles/:id", (req, res) => {
  try { const v = getVehicleById(req.params.id); if (!v) return res.status(404).json({ success: false }); res.json({ success: true, vehicle: v }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/vehicles/:id/details", (req, res) => {
  try { const v = getVehicleById(req.params.id); if (!v) return res.status(404).json({ success: false }); res.json({ success: true, vehicle: v, readings: listReadings(req.params.id), oilChanges: listOilChanges(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/vehicles", (req, res) => {
  try { res.json({ success: true, vehicle: createVehicle(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/vehicles/:id", (req, res) => {
  try { res.json({ success: true, vehicle: updateVehicle(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/vehicles/:id", (req, res) => {
  try { res.json({ success: deleteVehicle(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete("/api/vehicles", (req, res) => {
  try { res.json({ success: true, message: "Deleted " + deleteAllVehicles() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/vehicles/import", (req, res) => {
  try { res.json({ success: true, ...importVehicles(req.body.vehicles) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/vehicles/:id/reading", (req, res) => {
  try { res.json({ success: true, vehicle: addReading(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.get("/api/vehicles/:id/readings", (req, res) => {
  try { res.json({ success: true, readings: listReadings(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/vehicles/:id/oil-change", (req, res) => {
  try { res.json({ success: true, vehicle: changeOil(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.get("/api/vehicles/:id/oil-changes", (req, res) => {
  try { res.json({ success: true, oilChanges: listOilChanges(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== ALERTS =====
app.get("/api/alerts", (req, res) => {
  try { res.json({ success: true, ...getAlerts() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== TICKETS - POSTGRESQL =====

app.get("/api/tickets", async (req, res) => {
  try {
    const tickets = await listTicketsPG(req.query);
    res.json({ success: true, tickets });
  } catch (e) {
    console.error("Error fetching tickets:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/tickets", async (req, res) => {
  try {
    const ticket = await createTicketPG(req.body);
    res.json({ success: true, ticket });
  } catch (e) {
    console.error("Error creating ticket:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put("/api/tickets/:id/close", async (req, res) => {
  try {
    const ticket = await closeTicketPG(req.params.id, req.body);
    res.json({ success: true, ticket });
  } catch (e) {
    console.error("Error closing ticket:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete("/api/tickets", async (req, res) => {
  try {
    const result = await deleteAllTicketsPG();
    res.json({
      success: true,
      message: "Deleted " + result.changes
    });
  } catch (e) {
    console.error("Error deleting tickets:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put("/api/tickets/:id/acknowledge", async (req, res) => {
  try {
    const ticket = await acknowledgeTicketPG(req.params.id, req.body);
    res.json({ success: true, ticket });
  } catch (e) {
    console.error("Error acknowledging ticket:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put("/api/tickets/:id/close-with-notes", async (req, res) => {
  try {
    const ticket = await closeTicketWithNotesPG(req.params.id, req.body);
    res.json({ success: true, ticket });
  } catch (e) {
    console.error("Error closing ticket with notes:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/tickets/by-reporter/:name", async (req, res) => {
  try {
    const tickets = await listTicketsByReporterPG(req.params.name);
    res.json({ success: true, tickets });
  } catch (e) {
    console.error("Error fetching reporter tickets:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/tickets/stats/:name", async (req, res) => {
  try {
    const stats = await getReporterStatsPG(req.params.name);
    res.json({ success: true, ...stats });
  } catch (e) {
    console.error("Error fetching reporter stats:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});
// ===== ISSUES =====
app.get("/api/issues/types", (req, res) => {
  res.json({ success: true, types: [
    { value: "Tires", label: "Tires" }, { value: "Engine", label: "Engine" },
    { value: "A/C", label: "A/C" }, { value: "Lights", label: "Lights" },
    { value: "Brakes", label: "Brakes" }, { value: "Battery", label: "Battery" },
    { value: "Door", label: "Door" }, { value: "Wipers", label: "Wipers" },
    { value: "Oil Engine", label: "Oil Engine" }, { value: "Other", label: "Other" }
  ]});
});
app.post("/api/issues/report", async (req, res) => {
  try {
    const { vehicleId, issueType, category, description, reportedBy, priority, openedAt } = req.body;
    const finalCategory = issueType || category || "Other";
    const ticket = await createTicketPG({ vehicleId, category: finalCategory, description, reportedBy: reportedBy || "Driver", priority: priority || "Medium", openedAt });
    res.json({ success: true, message: "Ticket created", ticket });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== VEHICLE DASHBOARD =====
app.get("/api/dashboard", (req, res) => {
  try { res.json({ success: true, ...getDashboard() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== SITES =====
app.get("/api/sites", (req, res) => {
  try { res.json({ success: true, sites: listSites() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post("/api/sites", (req, res) => {
  try { res.json({ success: true, site: createSite(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/sites/:id", (req, res) => {
  try { res.json({ success: true, site: updateSite(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.delete("/api/sites/:id", (req, res) => {
  try { res.json({ success: deleteSite(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== WORK ORDERS =====
app.get("/api/work-orders", (req, res) => {
  try {
    const filters = { month: req.query.month, year: req.query.year, site: req.query.site, status: req.query.status };
    res.json({ success: true, orders: listWorkOrders(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get("/api/work-orders/:id", (req, res) => {
  try { const w = getWorkOrder(req.params.id); if (!w) return res.status(404).json({ success: false }); res.json({ success: true, order: w }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post("/api/work-orders", (req, res) => {
  try { res.json({ success: true, order: createWorkOrder(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/work-orders/:id", (req, res) => {
  try { res.json({ success: true, order: updateWorkOrder(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/work-orders/:id/close", (req, res) => {
  try { res.json({ success: true, order: closeWorkOrder(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.delete("/api/work-orders/:id", (req, res) => {
  try { res.json({ success: deleteWorkOrder(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== PROJECTS =====
app.get("/api/projects", (req, res) => {
  try {
    const filters = { month: req.query.month, year: req.query.year, site: req.query.site };
    res.json({ success: true, projects: listProjects(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get("/api/projects/:id", (req, res) => {
  try { const p = getProject(req.params.id); if (!p) return res.status(404).json({ success: false }); res.json({ success: true, project: p }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post("/api/projects", (req, res) => {
  try { res.json({ success: true, project: createProject(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/projects/:id", (req, res) => {
  try { res.json({ success: true, project: updateProject(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.delete("/api/projects/:id", (req, res) => {
  try { res.json({ success: deleteProject(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== PURCHASES =====
app.get("/api/purchases", (req, res) => {
  try {
    const filters = { month: req.query.month, year: req.query.year, referenceNo: req.query.referenceNo };
    res.json({ success: true, purchases: listPurchases(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post("/api/purchases", (req, res) => {
  try { res.json({ success: true, purchase: createPurchase(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.delete("/api/purchases/:id", (req, res) => {
  try { res.json({ success: deletePurchase(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== BUILDING DASHBOARD =====
app.get("/api/building/dashboard", (req, res) => {
  try {
    const filters = { month: req.query.month, year: req.query.year };
    res.json({ success: true, ...getBuildingDashboard(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== VOICE =====
app.post("/api/voice/transcript", async (req, res) => {
  try {
    const { transcript, vehicleId } = req.body;
    if (!transcript) return res.status(400).json({ success: false, error: "Empty" });
    const txt = transcript.toLowerCase();
    let category = "Other";
    const kw = {
      Tires: ["tire", "tyre", "wheel"],
      Engine: ["engine", "motor"],
      "A/C": ["ac", "air", "cooling"],
      Lights: ["light", "lamp"],
      Brakes: ["brake"],
      Battery: ["battery"],
      Door: ["door"],
      Wipers: ["wiper"],
      "Oil Engine": ["oil"]
    };
    for (const [cat, words] of Object.entries(kw)) {
      if (words.some(w => txt.includes(w))) { category = cat; break; }
    }
    const ticket = await createTicketPG({ vehicleId, category, description: transcript, reportedBy: "Voice", priority: "High" });
    res.json({ success: true, ticket, detectedCategory: category });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== MONTHLY REPORT =====
app.get("/api/reports/monthly", (req, res) => {
  try {
    const filters = { year: req.query.year, site: req.query.site };
    res.json({ success: true, ...getMonthlyReport(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== AUTH =====
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }
    const result = await login(username, password);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(401).json({ success: false, error: e.message });
  }
});

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ success: false, error: "Unauthorized" });
  req.user = decoded;
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: "Forbidden", message: "You do not have permission to perform this action." });
    }
    next();
  };
}

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.get("/api/users", requireRole("Owner"), (req, res) => {
  try { res.json({ success: true, users: listUsers() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/users", requireRole("Owner"), (req, res) => {
  try { res.json({ success: true, user: createUser(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/users/:id", requireRole("Owner"), (req, res) => {
  try { res.json({ success: deleteUser(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== DRIVERS =====
app.get("/api/drivers", (req, res) => {
  try { res.json({ success: true, drivers: listDrivers() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/drivers/:id", (req, res) => {
  try {
    const d = getDriver(req.params.id);
    if (!d) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, driver: d });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/drivers", (req, res) => {
  try { res.json({ success: true, driver: createDriver(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/drivers/:id", (req, res) => {
  try { res.json({ success: true, driver: updateDriver(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/drivers/:id", (req, res) => {
  try { res.json({ success: deleteDriver(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== WAREHOUSE =====
app.get("/api/inventory", (req, res) => {
  try { res.json({ success: true, items: listInventory() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/inventory/low-stock", (req, res) => {
  try { res.json({ success: true, items: getLowStockItems() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/inventory/:id", (req, res) => {
  try {
    const i = getInventoryItem(req.params.id);
    if (!i) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, item: i });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/inventory", (req, res) => {
  try { res.json({ success: true, item: createInventoryItem(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/inventory/:id", (req, res) => {
  try { res.json({ success: true, item: updateInventoryItem(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/inventory/:id", (req, res) => {
  try { res.json({ success: deleteInventoryItem(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/inventory/stock-in", (req, res) => {
  try { res.json({ success: true, transaction: stockIn(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.post("/api/inventory/stock-out", (req, res) => {
  try { res.json({ success: true, transaction: stockOut(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.post("/api/inventory/transfer", (req, res) => {
  try { res.json({ success: true, transaction: transferStock(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.get("/api/stock-transactions", (req, res) => {
  try { res.json({ success: true, transactions: listStockTransactions() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== PERIODIC MAINTENANCE =====
app.get("/api/periodic-maintenance", (req, res) => {
  try {
    const filters = { vehicleId: req.query.vehicleId, type: req.query.type, status: req.query.status };
    res.json({ success: true, records: listPeriodicMaintenance(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/periodic-maintenance/alerts", (req, res) => {
  try { res.json({ success: true, ...getPeriodicAlerts() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/periodic-maintenance/:id", (req, res) => {
  try {
    const r = getPeriodicMaintenance(req.params.id);
    if (!r) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, record: r });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/periodic-maintenance", (req, res) => {
  try { res.json({ success: true, record: createPeriodicMaintenance(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/periodic-maintenance/:id", (req, res) => {
  try { res.json({ success: true, record: updatePeriodicMaintenance(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/periodic-maintenance/:id/complete", (req, res) => {
  try { res.json({ success: true, record: completePeriodicMaintenance(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/periodic-maintenance/:id", (req, res) => {
  try { res.json({ success: deletePeriodicMaintenance(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/periodic-maintenance/generate", (req, res) => {
  try {
    const months = Number(req.body.monthsAhead) || 6;
    const created = generateScheduledMaintenance(months);
    res.json({ success: true, created: created.length, records: created });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== AUDIT LOG =====
app.get("/api/audit-log", (req, res) => {
  try {
    const filters = { username: req.query.username, action: req.query.action, entityType: req.query.entityType, fromDate: req.query.fromDate, toDate: req.query.toDate };
    res.json({ success: true, logs: listAuditLog(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/audit-log/stats", (req, res) => {
  try { res.json({ success: true, ...getAuditStats() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/audit-log", (req, res) => {
  try { res.json({ success: true, log: logAction(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/audit-log/clear", (req, res) => {
  try {
    const days = Number(req.query.days) || 90;
    res.json({ success: true, deleted: clearAuditLog(days) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== BACKUP =====
app.get("/api/backup/list", (req, res) => {
  try {
    const backupDir = path.join(__dirname, "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith(".db"))
      .map(f => {
        const stats = fs.statSync(path.join(backupDir, f));
        return { name: f, size: stats.size, date: stats.mtime };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, backups: files });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/backup/create", async (req, res) => {
  try {
    const backupDir = path.join(__dirname, "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backupName = "fleet_backup_" + timestamp + ".db";
    const backupPath = path.join(backupDir, backupName);
    const dbPath = path.join(__dirname, "fleet.db");
    
    const { default: Database } = await import("better-sqlite3");
    const src = new Database(dbPath);
    src.pragma("wal_checkpoint(TRUNCATE)");
    src.close();
    
    fs.copyFileSync(dbPath, backupPath);
    res.json({ success: true, backup: backupName, size: fs.statSync(backupPath).size });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete("/api/backup/:name", (req, res) => {
  try {
    const backupDir = path.join(__dirname, "backups");
    const name = req.params.name;
    if (!name.startsWith("fleet_backup_") || !name.endsWith(".db")) {
      return res.status(400).json({ success: false, error: "Invalid backup name" });
    }
    const filePath = path.join(backupDir, name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: "Not found" });
    fs.unlinkSync(filePath);
    if (fs.existsSync(filePath + "-wal")) fs.unlinkSync(filePath + "-wal");
    if (fs.existsSync(filePath + "-shm")) fs.unlinkSync(filePath + "-shm");
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/backup/download/:name", (req, res) => {
  try {
    const backupDir = path.join(__dirname, "backups");
    const name = req.params.name;
    if (!name.startsWith("fleet_backup_") || !name.endsWith(".db")) {
      return res.status(400).json({ success: false, error: "Invalid" });
    }
    const filePath = path.join(backupDir, name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: "Not found" });
    res.download(filePath, name);
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== LIVE ISSUES =====
app.get("/api/live-issues", (req, res) => {
  try {
    const tickets = listTickets().filter(t => t.status === 'Open');
    const now = new Date();
    const classified = tickets.map(t => {
      const opened = new Date(t.opened_at);
      const minutesOpen = Math.floor((now - opened) / 60000);
      const hoursOpen = Math.floor(minutesOpen / 60);
      
      let slaStatus = 'green';
      let slaText = '';
      if (t.priority === 'Critical') {
        if (hoursOpen >= 4) { slaStatus = 'red'; slaText = 'SLA Breach'; }
        else if (hoursOpen >= 1) { slaStatus = 'yellow'; slaText = 'Approaching SLA'; }
      } else if (t.priority === 'High') {
        if (hoursOpen >= 8) { slaStatus = 'red'; slaText = 'SLA Breach'; }
        else if (hoursOpen >= 4) { slaStatus = 'yellow'; slaText = 'Approaching SLA'; }
      } else {
        if (hoursOpen >= 48) { slaStatus = 'red'; slaText = 'SLA Breach'; }
        else if (hoursOpen >= 24) { slaStatus = 'yellow'; slaText = 'Approaching SLA'; }
      }
      
      let timeText = '';
      if (minutesOpen < 60) timeText = minutesOpen + ' min ago';
      else if (hoursOpen < 24) timeText = hoursOpen + 'h ago';
      else timeText = Math.floor(hoursOpen / 24) + 'd ago';
      
      let diagnosedIssue = null;
      if (t.description && t.description.includes('--- Auto-Detected Issue ---')) {
        const parts = t.description.split('--- Auto-Detected Issue ---');
        const match = parts[1]?.match(/Type: (.+)/);
        if (match) diagnosedIssue = match[1].trim();
      }
      
      return { ...t, minutesOpen, hoursOpen, slaStatus, slaText, timeText, diagnosedIssue };
    });
    
    const priorityOrder = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
    classified.sort((a, b) => {
      const po = (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
      if (po !== 0) return po;
      return b.minutesOpen - a.minutesOpen;
    });
    
    const critical = classified.filter(t => t.priority === 'Critical').length;
    const high = classified.filter(t => t.priority === 'High').length;
    const slaBreach = classified.filter(t => t.slaStatus === 'red').length;
    
    res.json({ success: true, summary: { total: classified.length, critical, high, slaBreach }, issues: classified.slice(0, 20) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== TICKET FEEDBACK =====
app.put("/api/tickets/:id/acknowledge", (req, res) => {
  try { res.json({ success: true, ticket: acknowledgeTicket(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/tickets/:id/close-with-notes", (req, res) => {
  try { res.json({ success: true, ticket: closeTicketWithNotes(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.get("/api/tickets/by-reporter/:name", (req, res) => {
  try { res.json({ success: true, tickets: listTicketsByReporter(req.params.name) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/tickets/stats/:name", (req, res) => {
  try { res.json({ success: true, ...getReporterStats(req.params.name) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== FINANCIAL REPORT =====
app.get("/api/reports/financial", (req, res) => {
  try { res.json({ success: true, ...getFinancialReport() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, '../client/dist/index.html')); });

app.listen(PORT, () => {
  console.log("");
  console.log("======================================");
  console.log("FLEET ERP SERVER");
  console.log("======================================");
  console.log("http://localhost:" + PORT);
  console.log("Vehicle APIs: /api/vehicles, /api/tickets, /api/dashboard");
  console.log("Building APIs: /api/sites, /api/work-orders, /api/projects, /api/purchases");
  console.log("======================================");
});











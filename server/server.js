import express from "express";
import cors from "cors";
import { verifyToken, login, listUsers, createUser, deleteUser } from "./auth.js";
import { requirePermission } from "./rbac.js";
import { getKmDailyNotifications, reconcileAndNotify } from "./kmDailyNotifications.js";
import { syncGoogleSheetVehicles } from "./googleSheetSync.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";


import * as db from "./database-pg.js";
import { query as pgQuery } from "./postgres.js";

const { listVehicles:listVehiclesPG, getVehicleById:getVehicleByIdPG, createVehicle:createVehiclePG, updateVehicle:updateVehiclePG, deleteVehicle:deleteVehiclePG, deleteAllVehicles:deleteAllVehiclesPG, addReading:addReadingPG, listReadings:listReadingsPG, changeOil:changeOilPG, listOilChanges:listOilChangesPG, createTicket:createTicketPG, listTickets:listTicketsPG, closeTicket:closeTicketPG, deleteAllTickets:deleteAllTicketsPG, acknowledgeTicket:acknowledgeTicketPG, closeTicketWithNotes:closeTicketWithNotesPG, listTicketsByReporter:listTicketsByReporterPG, getReporterStats:getReporterStatsPG, listSites:listSitesPG, getSite:getSitePG, createSite:createSitePG, updateSite:updateSitePG, deleteSite:deleteSitePG, getAlerts:getAlertsPG, importVehicles:importVehiclesPG, listWorkOrders:listWorkOrdersPG, getWorkOrder:getWorkOrderPG, createWorkOrder:createWorkOrderPG, updateWorkOrder:updateWorkOrderPG, closeWorkOrder:closeWorkOrderPG, deleteWorkOrder:deleteWorkOrderPG, listProjects:listProjectsPG, getProject:getProjectPG, createProject:createProjectPG, updateProject:updateProjectPG, deleteProject:deleteProjectPG, listPurchases:listPurchasesPG, createPurchase:createPurchasePG, deletePurchase:deletePurchasePG, listDrivers:listDriversPG, getDriver:getDriverPG, createDriver:createDriverPG, updateDriver:updateDriverPG, deleteDriver:deleteDriverPG, listInventory:listInventoryPG, getInventoryItem:getInventoryItemPG, createInventoryItem:createInventoryItemPG, updateInventoryItem:updateInventoryItemPG, deleteInventoryItem:deleteInventoryItemPG, stockIn:stockInPG, stockOut:stockOutPG, transferStock:transferStockPG, listStockTransactions:listStockTransactionsPG, getLowStockItems:getLowStockItemsPG, listPeriodicMaintenance:listPeriodicMaintenancePG, getPeriodicMaintenance:getPeriodicMaintenancePG, createPeriodicMaintenance:createPeriodicMaintenancePG, updatePeriodicMaintenance:updatePeriodicMaintenancePG, completePeriodicMaintenance:completePeriodicMaintenancePG, deletePeriodicMaintenance:deletePeriodicMaintenancePG, getPeriodicAlerts:getPeriodicAlertsPG, generateScheduledMaintenance:generateScheduledMaintenancePG, logAction:logActionPG, listAuditLog:listAuditLogPG, getAuditStats:getAuditStatsPG, clearAuditLog:clearAuditLogPG, getBuildingDashboard:getBuildingDashboardPG, getDashboard:getDashboardPG, getMonthlyReport:getMonthlyReportPG, getFinancialReport:getFinancialReportPG }=db;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ============================================================
// GLOBAL API AUTHENTICATION
// ============================================================
app.use("/api", async (req, res, next) => {
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

app.get("/api/health", async (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

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

app.get("/api/vehicles/list", async (req, res) => {
  try {
    const vehicles = await listVehiclesPG();
    res.json({
      success: true,
      vehicles: vehicles.map(v => ({
        id: v.id,
        plate: v.plate,
        driver: v.driver
      }))
    });
  } catch (e) {
    console.error("Error fetching vehicle list:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/vehicles/:id", async (req, res) => {
  try { const v = await getVehicleByIdPG(req.params.id); if (!v) return res.status(404).json({ success: false }); res.json({ success: true, vehicle: v }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/vehicles/:id/details", async (req, res) => {
  try { const v = await getVehicleByIdPG(req.params.id); if (!v) return res.status(404).json({ success: false }); res.json({ success: true, vehicle: v, readings: await listReadingsPG(req.params.id), oilChanges: await listOilChangesPG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/vehicles", async (req, res) => {
  try { res.json({ success: true, vehicle: createVehiclePG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/vehicles/:id", async (req, res) => {
  try { res.json({ success: true, vehicle: await updateVehiclePG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/vehicles/:id", async (req, res) => {
  try { res.json({ success: await deleteVehiclePG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete("/api/vehicles", async (req, res) => {
  try { res.json({ success: true, message: "Deleted " + await deleteAllVehiclesPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/vehicles/import", async (req, res) => {
  try { res.json({ success: true, ...await importVehiclesPG(req.body.vehicles) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/vehicles/:id/reading", async (req, res) => {
  try { res.json({ success: true, vehicle: await addReadingPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.get("/api/vehicles/:id/readings", async (req, res) => {
  try { res.json({ success: true, readings: await listReadingsPG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/vehicles/:id/oil-change", async (req, res) => {
  try { res.json({ success: true, vehicle: await changeOilPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.get("/api/vehicles/:id/oil-changes", async (req, res) => {
  try { res.json({ success: true, oilChanges: await listOilChangesPG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== ALERTS =====
app.get("/api/alerts", async (req, res) => {
  try { res.json({ success: true, ...await getAlertsPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== TICKETS - POSTGRESQL =====

app.get("/api/tickets", async (req, res) => {
  try {
    const tickets = await listTicketsPG(req.query);

    if (req.user?.role === "FleetViewer") {
      const vehicleTickets = tickets
        .filter(t => t.vehicle_id !== null && t.vehicle_id !== undefined)
        .map(t => ({
          id: t.id,
          opened_at: t.opened_at,
          plate: t.plate || "",
          category: t.category || "",
          priority: t.priority || "",
          status: t.status || "",
          description: t.description || ""
        }));

      return res.json({ success: true, tickets: vehicleTickets });
    }

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
app.get("/api/issues/types", async (req, res) => {
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
app.get("/api/dashboard", async (req, res) => {
  try { res.json({ success: true, ...await getDashboardPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== SITES =====

app.get("/api/sites", async (req, res) => {
  try {
    const sites = await listSitesPG();
    res.json({
      success: true,
      sites
    });
  } catch (error) {
    console.error("GET /api/sites:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/sites/:id", async (req, res) => {
  try {
    const site = await getSitePG(req.params.id);

    if (!site) {
      return res.status(404).json({
        success: false,
        error: "Site not found"
      });
    }

    res.json({
      success: true,
      site
    });
  } catch (error) {
    console.error("GET /api/sites/:id:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/sites", async (req, res) => {
  try {
    const site = await createSitePG(req.body);

    res.status(201).json({
      success: true,
      site
    });
  } catch (error) {
    console.error("POST /api/sites:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put("/api/sites/:id", async (req, res) => {
  try {
    const site = await updateSitePG(req.params.id, req.body);

    res.json({
      success: true,
      site
    });
  } catch (error) {
    console.error("PUT /api/sites/:id:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete("/api/sites/:id", async (req, res) => {
  try {
    const result = await deleteSitePG(req.params.id);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("DELETE /api/sites/:id:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== WORK ORDERS =====
app.get("/api/work-orders", async (req, res) => {
  try {
    const filters = { month: req.query.month, year: req.query.year, site: req.query.site, status: req.query.status };
    res.json({ success: true, orders: await listWorkOrdersPG(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get("/api/work-orders/:id", async (req, res) => {
  try { const w = await getWorkOrderPG(req.params.id); if (!w) return res.status(404).json({ success: false }); res.json({ success: true, order: w }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post("/api/work-orders", async (req, res) => {
  try { res.json({ success: true, order: await createWorkOrderPG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/work-orders/:id", async (req, res) => {
  try { res.json({ success: true, order: await updateWorkOrderPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/work-orders/:id/close", async (req, res) => {
  try { res.json({ success: true, order: await closeWorkOrderPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.delete("/api/work-orders/:id", async (req, res) => {
  try { res.json({ success: await deleteWorkOrderPG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== PROJECTS =====
app.get("/api/projects", async (req, res) => {
  try {
    const filters = { month: req.query.month, year: req.query.year, site: req.query.site };
    res.json({ success: true, projects: await listProjectsPG(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get("/api/projects/:id", async (req, res) => {
  try { const p = await getProjectPG(req.params.id); if (!p) return res.status(404).json({ success: false }); res.json({ success: true, project: p }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post("/api/projects", async (req, res) => {
  try { res.json({ success: true, project: await createProjectPG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/projects/:id", async (req, res) => {
  try { res.json({ success: true, project: await updateProjectPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.delete("/api/projects/:id", async (req, res) => {
  try { res.json({ success: await deleteProjectPG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== PURCHASES =====
app.get("/api/purchases", async (req, res) => {
  try {
    const filters = { month: req.query.month, year: req.query.year, referenceNo: req.query.referenceNo };
    res.json({ success: true, purchases: await listPurchasesPG(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post("/api/purchases", async (req, res) => {
  try { res.json({ success: true, purchase: await createPurchasePG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.delete("/api/purchases/:id", async (req, res) => {
  try { res.json({ success: await deletePurchasePG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== BUILDING DASHBOARD =====
app.get("/api/building/dashboard", async (req, res) => {
  try {
    const filters = { month: req.query.month, year: req.query.year };
    res.json({ success: true, ...await getBuildingDashboardPG(filters) });
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
app.get("/api/reports/monthly", async (req, res) => {
  try {
    const filters = { year: req.query.year, site: req.query.site };
    res.json({ success: true, ...await getMonthlyReportPG(filters) });
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
  return async (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: "Forbidden", message: "You do not have permission to perform this action." });
    }
    next();
  };
}

app.get("/api/auth/me", requireAuth, async (req, res) => {
  res.json({ success: true, user: req.user });
});

app.get("/api/users", requireRole("Owner"), async (req, res) => {
  try { res.json({ success: true, users: await listUsers() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/users", requireRole("Owner"), async (req, res) => {
  try { res.json({ success: true, user: createUser(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/users/:id", requireRole("Owner"), async (req, res) => {
  try { res.json({ success: deleteUser(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== DRIVERS =====
app.get("/api/drivers", async (req, res) => {
  try { res.json({ success: true, drivers: await listDriversPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/drivers/:id", async (req, res) => {
  try {
    const d = await getDriverPG(req.params.id);
    if (!d) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, driver: d });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/drivers", async (req, res) => {
  try { res.json({ success: true, driver: await createDriverPG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/drivers/:id", async (req, res) => {
  try { res.json({ success: true, driver: await updateDriverPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/drivers/:id", async (req, res) => {
  try { res.json({ success: await deleteDriverPG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== WAREHOUSE =====
app.get("/api/inventory", async (req, res) => {
  try { res.json({ success: true, items: await listInventoryPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/inventory/low-stock", async (req, res) => {
  try { res.json({ success: true, items: await getLowStockItemsPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/inventory/:id", async (req, res) => {
  try {
    const i = await getInventoryItemPG(req.params.id);
    if (!i) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, item: i });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/inventory", async (req, res) => {
  try { res.json({ success: true, item: await createInventoryItemPG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/inventory/:id", async (req, res) => {
  try { res.json({ success: true, item: await updateInventoryItemPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/inventory/:id", async (req, res) => {
  try { res.json({ success: await deleteInventoryItemPG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/inventory/stock-in", async (req, res) => {
  try { res.json({ success: true, transaction: await stockInPG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.post("/api/inventory/stock-out", async (req, res) => {
  try { res.json({ success: true, transaction: await stockOutPG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.post("/api/inventory/transfer", async (req, res) => {
  try { res.json({ success: true, transaction: await transferStockPG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.get("/api/stock-transactions", async (req, res) => {
  try { res.json({ success: true, transactions: await listStockTransactionsPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== PERIODIC MAINTENANCE =====
app.get("/api/periodic-maintenance", async (req, res) => {
  try {
    const filters = { vehicleId: req.query.vehicleId, type: req.query.type, status: req.query.status };
    res.json({ success: true, records: await listPeriodicMaintenancePG(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/periodic-maintenance/alerts", async (req, res) => {
  try { res.json({ success: true, ...await getPeriodicAlertsPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/periodic-maintenance/:id", async (req, res) => {
  try {
    const r = await getPeriodicMaintenancePG(req.params.id);
    if (!r) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, record: r });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/periodic-maintenance", async (req, res) => {
  try { res.json({ success: true, record: await createPeriodicMaintenancePG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/periodic-maintenance/:id", async (req, res) => {
  try { res.json({ success: true, record: await updatePeriodicMaintenancePG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/periodic-maintenance/:id/complete", async (req, res) => {
  try { res.json({ success: true, record: await completePeriodicMaintenancePG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/periodic-maintenance/:id", async (req, res) => {
  try { res.json({ success: await deletePeriodicMaintenancePG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/periodic-maintenance/generate", async (req, res) => {
  try {
    const months = Number(req.body.monthsAhead) || 6;
    const created = await generateScheduledMaintenancePG(months);
    res.json({ success: true, created: created.length, records: created });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== AUDIT LOG =====
app.get("/api/audit-log", async (req, res) => {
  try {
    const filters = { username: req.query.username, action: req.query.action, entityType: req.query.entityType, fromDate: req.query.fromDate, toDate: req.query.toDate };
    res.json({ success: true, logs: await listAuditLogPG(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/audit-log/stats", async (req, res) => {
  try { res.json({ success: true, ...await getAuditStatsPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/audit-log", async (req, res) => {
  try { res.json({ success: true, log: await logActionPG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/audit-log/clear", async (req, res) => {
  try {
    const days = Number(req.query.days) || 90;
    res.json({ success: true, deleted: await clearAuditLogPG(days) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== BACKUP =====
app.get("/api/backup/list", async (req, res) => {
  try {
    const backupDir = path.join(__dirname, "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith(".json"))
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

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backupName = "fleet_backup_" + timestamp + ".json";
    const backupPath = path.join(backupDir, backupName);

    const tables = [
      "audit_log",
      "drivers",
      "inventory",
      "km_records",
      "oil_changes",
      "periodic_maintenance",
      "permissions",
      "projects",
      "purchases",
      "role_permissions",
      "roles",
      "sites",
      "stock_transactions",
      "tickets",
      "user_permissions",
      "users",
      "vehicles",
      "warehouse_locations",
      "warehouse_stock",
      "work_orders"
    ];

    const backup = {
      format: "Fleet ERP PostgreSQL Data Backup",
      version: 1,
      created_at: new Date().toISOString(),
      tables: {}
    };

    for (const table of tables) {
      const result = await pgQuery(`SELECT * FROM "${table}"`);
      backup.tables[table] = result.rows;
    }

    fs.writeFileSync(
      backupPath,
      JSON.stringify(backup, null, 2),
      "utf8"
    );

    res.json({
      success: true,
      backup: backupName,
      size: fs.statSync(backupPath).size
    });
  } catch (e) {
    console.error("Backup creation error:", e);
    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});
app.delete("/api/backup/:name", async (req, res) => {
  try {
    const backupDir = path.join(__dirname, "backups");
    const name = req.params.name;
    if (!name.startsWith("fleet_backup_") || !name.endsWith(".json")) {
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

app.get("/api/backup/download/:name", async (req, res) => {
  try {
    const backupDir = path.join(__dirname, "backups");
    const name = req.params.name;
    if (!name.startsWith("fleet_backup_") || !name.endsWith(".json")) {
      return res.status(400).json({ success: false, error: "Invalid" });
    }
    const filePath = path.join(backupDir, name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: "Not found" });
    res.download(filePath, name);
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== GOOGLE SHEET SYNC =====
app.post("/api/google-sheet-sync", requireRole("Owner"), async (req, res) => {
  try {
    const result = await syncGoogleSheetVehicles();
    res.json({ success: true, ...result });
  } catch (e) {
    console.error("Google Sheet sync error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== DAILY KM NOTIFICATIONS =====
app.get("/api/km-daily-notifications", async (req, res) => {
  try {
    await reconcileAndNotify();
    const result = await getKmDailyNotifications();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== LIVE ISSUES =====
app.get("/api/live-issues", async (req, res) => {
  try {
    const tickets = (await listTicketsPG()).filter(t => t.status === 'Open');
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
app.put("/api/tickets/:id/acknowledge", async (req, res) => {
  try { res.json({ success: true, ticket: acknowledgeTicket(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/tickets/:id/close-with-notes", async (req, res) => {
  try { res.json({ success: true, ticket: closeTicketWithNotes(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.get("/api/tickets/by-reporter/:name", async (req, res) => {
  try { res.json({ success: true, tickets: listTicketsByReporter(req.params.name) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/tickets/stats/:name", async (req, res) => {
  try { res.json({ success: true, ...getReporterStats(req.params.name) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== FINANCIAL REPORT =====
app.get("/api/reports/financial", async (req, res) => {
  try { res.json({ success: true, ...await getFinancialReportPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', async (req, res) => { res.sendFile(path.join(__dirname, '../client/dist/index.html')); });

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





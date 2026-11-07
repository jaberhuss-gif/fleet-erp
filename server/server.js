import express from "express";
import intakePdfRouter from './intake-pdf.js';
import intakeEmailRouter from './intake-email.js';
import cors from "cors";
import { login, listUsers, createUser, updateUser, deleteUser, requireAuth } from "./auth.js";
import { requirePermission, ACCESS_MODULES, getUserAccess, saveUserAccess, ensureUserAccessTable } from "./rbac.js";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";


import * as db from "./database-pg.js";
import { query as pgQuery } from "./postgres.js";
import { mountV2 } from "./v2/index.js";
import { getKmDailyNotifications, getDailyKmReport, getDriverDailyKmStatus } from "./kmDailyNotifications.js";
import { updateLastOilChangePG } from "./vehicles-pg.js";
import { mountPdfWorkOrderImport } from "./pdfWorkOrderImport.js";
import { vehicleReportHtml } from "./vehicle-report.js";
import { mountPdfProjectImport } from "./pdfProjectImport.js";
import { mountTireRoutes } from "./tire-management.js";
import { toWaMeNumber, toWaMeInternational } from "./phone.js";
import { syncBuildingFromVelaOnce } from "./vela-project-sync.mjs";
import { mountBuildingMaintenanceRequestRoutes } from "./building-maintenance-requests.js";
import { mountInvoiceRoutes } from "./invoice-routes.js";
import { handoverReportHtml } from "./handover-report.js";
import { ensureInvoiceSchema } from "./invoice-schema.js";

const ANNUAL_INSPECTION_EMAIL_FROM = 'Hussein.Anwar@iemaadex.com';
const ANNUAL_INSPECTION_CC_EMAILS = 'Mohamed.Hassan@iemaadex.com, Mohammed.Al-Marhabi@iemaadex.com';
const ANNUAL_INSPECTION_SITE_CONTACTS = {
  'Uqlat Al Soqour': 'Samer.Abdulmalik@iemaadex.com, Bader.Almasrahi@iemaadex.com',
  'Wadi Beddah': 'Meshal.Alghamdi@iemaadex.com',
  'Al Hadar': 'Amr.Mohamed@iemaadex.com, Mostafa.Magdy@iemaadex.com',
  'Al Quwayiyah': 'Amr.Mohamed@iemaadex.com, Mostafa.Magdy@iemaadex.com',
  'Al Sabiyah': 'shezad.khan@iemaadex.com',
  'Al Hulayfa': 'nouman.khan@iemaadex.com'
};

function canonicalInspectionSite(location) {
  const key = String(location || '').trim().toLowerCase().replace(/\\s+/g, ' ');
  const aliases = {
    'uqlat al soqour': 'Uqlat Al Soqour',
    'uqlat saqour': 'Uqlat Al Soqour',
    'uglat asugour': 'Uqlat Al Soqour',
    'wadi beddah': 'Wadi Beddah',
    'wadi bidah': 'Wadi Beddah',
    'wadi bida': 'Wadi Beddah',
    'al sabiyah': 'Al Sabiyah',
    'sabeyah': 'Al Sabiyah',
    'sabayia': 'Al Sabiyah',
    'sabayah': 'Al Sabiyah',
    'al hulayfa': 'Al Hulayfa',
    'al quwayiyah': 'Al Quwayiyah',
    'al hadar': 'Al Hadar',
    'mahd': 'Mahd ad Dhahab',
    'mahd ad dhahab': 'Mahd ad Dhahab'
  };
  return aliases[key] || String(location || '').trim();
}

async function ensureAnnualInspectionReminderSchema() {
  // Vehicle Master owns these reminder settings. Keep this idempotent so every
  // deployment can start safely whether the columns already exist or not.
  await pgQuery(`
    ALTER TABLE vehicles
      ADD COLUMN IF NOT EXISTS inspection_reminder_days INTEGER NOT NULL DEFAULT 30,
      ADD COLUMN IF NOT EXISTS inspection_manager_email TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS inspection_cc_emails TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS inspection_last_email_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS inspection_last_email_key TEXT
  `);
}

function annualInspectionRecipients(location) {
  const canonical = canonicalInspectionSite(location);
  const match = Object.entries(ANNUAL_INSPECTION_SITE_CONTACTS).find(([site]) => site.toLowerCase() === canonical.toLowerCase());
  return {
    managerEmail: match ? match[1] : '',
    ccEmails: ANNUAL_INSPECTION_CC_EMAILS
  };
}


function isValidEmailAddress(value) {
  const email = String(value || '').trim();
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

function splitEmails(value) {
  return String(value || '')
    .split(/[;,\\n]+/)
    .map(e => e.trim())
    .filter(Boolean);
}

function validEmails(value) {
  return splitEmails(value).filter(isValidEmailAddress);
}

async function sendAnnualInspectionReminderEmail(row) {
  const expiry = String(row.inspection_expiry_date || '').slice(0, 10);
  if (!expiry) return { sent: false, reason: 'Inspection expiry date is missing.' };

  const today = new Date().toISOString().slice(0, 10);
  const days = Math.ceil(
    (new Date(expiry + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000
  );
  const site = canonicalInspectionSite(row.location) || 'Unknown Site';
  const defaults = annualInspectionRecipients(site);

  // Vehicle-level email fields can contain stale/invalid values. Never pass
  // malformed addresses to the provider; fall back to the site defaults.
  const configuredTo = validEmails(row.inspection_manager_email);
  const defaultTo = validEmails(defaults.managerEmail);
  const to = configuredTo.length ? configuredTo : defaultTo;

  const configuredCc = validEmails(row.inspection_cc_emails);
  const defaultCc = validEmails(defaults.ccEmails);
  const cc = (configuredCc.length ? configuredCc : defaultCc)
    .filter(email => !to.includes(email));

  if (!to.length) {
    return { sent: false, reason: 'No valid site manager email configured for ' + site + '.' };
  }

  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(
    process.env.INSPECTION_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    ANNUAL_INSPECTION_EMAIL_FROM
  ).trim();

  if (!apiKey || !from) {
    return { sent: false, reason: 'Email provider is not configured (RESEND_API_KEY / EMAIL_FROM).' };
  }

  const plate = [row.plate_number, row.plate_code].filter(Boolean).join(' ').trim();
  const subject = days < 0
    ? 'URGENT: Annual Vehicle Inspection Overdue — ' + plate
    : 'Annual Vehicle Inspection Reminder — ' + plate;

  const text = [
    'Hello ' + (row.driver || 'Team') + ',',
    '',
    'Vehicle ' + plate + ' — Annual Periodic Inspection — ' +
      (days < 0 ? 'OVERDUE by ' + Math.abs(days) + ' day(s)' : 'Due Within ' + days + ' Day(s)') +
      ' inspection is still pending.',
    'Please arrange the inspection.',
    '',
    'Please also inform your Supervisor and the Camp/Campus team accordingly.',
    '',
    'Site: ' + site,
    'Inspection Expiry: ' + expiry,
    'Fleet Management'
  ].join('\\n');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to,
      cc,
      subject,
      text
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Email provider returned HTTP ' + response.status);
  }

  return { sent: true, id: data?.id || null, to, cc };
}

async function processAnnualInspectionReminders() {
  const result = await pgQuery(`
    SELECT id, plate_number, plate_code, driver, location,
           inspection_expiry_date, inspection_reminder_days,
           inspection_manager_email, inspection_cc_emails,
           inspection_last_email_sent_at, inspection_last_email_key
    FROM vehicles
    WHERE inspection_expiry_date IS NOT NULL
      AND COALESCE(LOWER(TRIM(status)), '') NOT IN ('inactive','sold','disposed','disabled')
  `);
  let sent = 0, skipped = 0, failed = 0;
  for (const row of result.rows) {
    const expiry = String(row.inspection_expiry_date).slice(0,10);
    const today = new Date().toISOString().slice(0,10);
    const days = Math.ceil((new Date(expiry + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
    const reminderDays = Number(row.inspection_reminder_days || 30);
    if (days > reminderDays) { skipped++; continue; }

    // One reminder per expiry date. If the expiry date is changed, a new reminder is allowed.
    const key = expiry + ':' + reminderDays;
    if (String(row.inspection_last_email_key || '') === key) { skipped++; continue; }

    try {
      // Resend allows 10 requests/second. Keep this scheduler safely below
      // that limit even when many vehicles become due at the same time.
      await new Promise(resolve => setTimeout(resolve, 150));
      const delivery = await sendAnnualInspectionReminderEmail(row);
      if (delivery.sent) {
        await pgQuery(`UPDATE vehicles SET inspection_last_email_sent_at=CURRENT_TIMESTAMP, inspection_last_email_key=$1 WHERE id=$2`, [key, row.id]);
        sent++;
      } else {
        skipped++;
      }
    } catch (e) {
      failed++;
      console.error('[InspectionEmail] vehicle', row.id, e.message);
    }
  }
  return { sent, skipped, failed, checked: result.rows.length };
}



const { listVehicles:listVehiclesPG, getVehicleById:getVehicleByIdPG, getVehicleByPlate:getVehicleByPlatePG, createVehicle:createVehiclePG, updateVehicle:updateVehiclePG, deleteVehicle:deleteVehiclePG, deleteAllVehicles:deleteAllVehiclesPG, addReading:addReadingPG, listReadings:listReadingsPG, changeOil:changeOilPG, listOilChanges:listOilChangesPG, createTicket:createTicketPG, listTickets:listTicketsPG, closeTicket:closeTicketPG, deleteAllTickets:deleteAllTicketsPG, acknowledgeTicket:acknowledgeTicketPG, startTicketWork:startTicketWorkPG, closeTicketWithNotes:closeTicketWithNotesPG, listTicketsByReporter:listTicketsByReporterPG, getReporterStats:getReporterStatsPG, listSites:listSitesPG, getSite:getSitePG, createSite:createSitePG, updateSite:updateSitePG, deleteSite:deleteSitePG, getAlerts:getAlertsPG, importVehicles:importVehiclesPG, listWorkOrders:listWorkOrdersPG, getWorkOrder:getWorkOrderPG, createWorkOrder:createWorkOrderPG, updateWorkOrder:updateWorkOrderPG, closeWorkOrder:closeWorkOrderPG, deleteWorkOrder:deleteWorkOrderPG, listProjects:listProjectsPG, getProject:getProjectPG, createProject:createProjectPG, updateProject:updateProjectPG, closeProject:closeProjectPG, deleteProject:deleteProjectPG, listProjectItems:listProjectItemsPG, createProjectItem:createProjectItemPG, updateProjectItem:updateProjectItemPG, closeProjectItem:closeProjectItemPG, reopenProjectItem:reopenProjectItemPG, listWorkOrderItems:listWorkOrderItemsPG, createWorkOrderItem:createWorkOrderItemPG, listPurchases:listPurchasesPG, createPurchase:createPurchasePG, updatePurchase:updatePurchasePG, closePurchase:closePurchasePG, deletePurchase:deletePurchasePG, listPurchaseRequests:listPurchaseRequestsPG, createPurchaseRequest:createPurchaseRequestPG, approvePurchaseRequest:approvePurchaseRequestPG, rejectPurchaseRequest:rejectPurchaseRequestPG, recordPurchaseFromRequest:recordPurchaseFromRequestPG, listDrivers:listDriversPG, getDriver:getDriverPG, createDriver:createDriverPG, updateDriver:updateDriverPG, deleteDriver:deleteDriverPG, listInventory:listInventoryPG, getInventoryItem:getInventoryItemPG, createInventoryItem:createInventoryItemPG, updateInventoryItem:updateInventoryItemPG, deleteInventoryItem:deleteInventoryItemPG, stockIn:stockInPG, stockOut:stockOutPG, transferStock:transferStockPG, listStockTransactions:listStockTransactionsPG, getLowStockItems:getLowStockItemsPG, listPeriodicMaintenance:listPeriodicMaintenancePG, getPeriodicMaintenance:getPeriodicMaintenancePG, createPeriodicMaintenance:createPeriodicMaintenancePG, updatePeriodicMaintenance:updatePeriodicMaintenancePG, completePeriodicMaintenance:completePeriodicMaintenancePG, deletePeriodicMaintenance:deletePeriodicMaintenancePG, getPeriodicAlerts:getPeriodicAlertsPG, generateScheduledMaintenance:generateScheduledMaintenancePG, ensureVehicleRepairSchema, createVehicleRepairOrder:createVehicleRepairOrderPG, listVehicleRepairOrders:listVehicleRepairOrdersPG, completeVehicleRepairOrder:completeVehicleRepairOrderPG, closeVehicleRepairOrder:closeVehicleRepairOrderPG, logAction:logActionPG, listAuditLog:listAuditLogPG, getAuditStats:getAuditStatsPG, clearAuditLog:clearAuditLogPG, getBuildingDashboard:getBuildingDashboardPG, getCurrentMonthDashboardFinancial:getCurrentMonthDashboardFinancialPG, getDashboard:getDashboardPG, getMonthlyReport:getMonthlyReportPG, getGeneralMaintenanceReport:getGeneralMaintenanceReportPG, getFinancialReport:getFinancialReportPG }=db;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(intakePdfRouter);
app.use(intakeEmailRouter);
mountPdfWorkOrderImport(app);
mountPdfProjectImport(app);
async function syncBuildingProjectAmountsOnce() {
  if (String(process.env.SYNC_BUILDING_PROJECT_AMOUNTS || '').toLowerCase() !== 'true') return;
  try {
    const file = path.join(__dirname, 'data', 'building', 'projects.json');
    const projects = JSON.parse(fs.readFileSync(file, 'utf8'));
    let updated = 0, missing = 0;
    for (const p of projects) {
      const amount = Number(p.total_cost ?? p.spent ?? 0) || 0;
      const contractorCost = Number(p.contractor_cost ?? amount) || 0;
      const r = await pgQuery(
        `UPDATE projects
         SET spent = $1::numeric,
             contractor_cost = $2::numeric,
             contractor = $3::text
         WHERE project_no = $4::text`,
        [amount, contractorCost, String(p.contractor || ''), String(p.project_no || '')]
      );
      if (r.rowCount) updated++; else missing++;
    }
    console.log(`[BuildingProjects] synced amounts: ${updated} updated, ${missing} not found`);
  } catch (e) {
    console.error('[BuildingProjects] amount sync failed:', e.message);
  }
}

const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ============================================================
// GLOBAL API AUTHENTICATION
// ============================================================
app.use("/api", async (req, res, next) => {
  const publicApiPaths = new Set([
    "/api/health",
    "/api/v2/health",
    "/api/auth/login",
    "/api/migration/vehicles"
  ]);
  const requestPath = req.originalUrl.split("?")[0];
  // Tokenized Building Maintenance workflow pages are intentionally public.
  // The token in the URL is the authorization for the specific action.
  if (requestPath.startsWith("/api/maintenance-requests/public/") && (!requestPath.endsWith("/confirm") || req.method === "GET" || (req.method === "POST" && /^\/api\/maintenance-requests\/public\/[^/]+\/confirm$/.test(requestPath)))) return next();
  if (publicApiPaths.has(requestPath)) return next();
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role === "GM" && ["POST","PUT","PATCH","DELETE"].includes(req.method)) {
      return res.status(403).json({ success: false, error: "Forbidden", message: "GM role is read-only." });
    }
    requirePermission(req, res, next);
  });
});

app.get("/api/health", async (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// Building maintenance request routes must be mounted after JSON parsing and API authentication.
mountBuildingMaintenanceRequestRoutes(app);
mountInvoiceRoutes(app);

// ===== TEMPORARY VEHICLE MIGRATION FEED (OLD ERP -> VELA) =====
// Protected by a Render environment secret. This is intentionally limited to
// vehicle master data plus yesterday/today KM readings during the migration.
app.get("/api/migration/vehicles", async (req, res) => {
  try {
    const expected = String(process.env.MIGRATION_SYNC_TOKEN || "").trim();
    const provided = String(req.get("x-migration-token") || "").trim();

    if (!expected || !provided || provided !== expected) {
      return res.status(401).json({ success: false, error: "Unauthorized migration feed" });
    }

    const dates = await pgQuery(`
      SELECT
        ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date - INTERVAL '1 day')::date::text AS yesterday,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date::text AS today
    `);

    const yesterday = dates.rows[0].yesterday;
    const today = dates.rows[0].today;

    const vehicles = await pgQuery(`
      SELECT
        id, plate_number, plate_code, make, model, year, location, driver, phone,
        current_km, last_oil_km, oil_change_interval, last_oil_change_date,
        inspection_last_date, inspection_due_date,
        status, meter_updated_at, updated_at
      FROM vehicles
      ORDER BY id
    `);

    const readings = await pgQuery(`
      SELECT id, vehicle_id, plate, reading_km, reading_date, is_oil_change, notes, created_at
      FROM km_records
      WHERE reading_date BETWEEN $1::date AND $2::date
      ORDER BY reading_date, id
    `, [yesterday, today]);

    res.json({
      success: true,
      source: "fleet-erp",
      from_date: yesterday,
      to_date: today,
      vehicles: vehicles.rows,
      readings: readings.rows
    });
  } catch (e) {
    console.error("[MigrationFeed]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});


// ===== TIRE MANAGEMENT =====
await mountTireRoutes(app);

// ===== VEHICLES (PostgreSQL Connected) =====
app.get("/api/vehicles", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const vehicles = await db.listVehicles();
    res.json({ success: true, vehicles });
  } catch (e) {
    console.error("Error fetching vehicles:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/vehicles/list", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const vehicles = await db.listVehicles();
    res.json({
      success: true,
      vehicles: vehicles.map(v => ({
        id: v.id,
        plate: v.plate || v.plate_number || '',
        plate_number: v.plate_number || '',
        plate_code: v.plate_code || '',
        driver: v.driver || '',
        driverId: v.driverId ?? null,
        driver_id: v.driverId ?? null,
        phone: v.phone || '',
        location: v.location || '',
        inspection_expiry_date: v.inspection_expiry_date || null,
        inspectionExpiryDate: v.inspection_expiry_date || null
      }))
    });
  } catch (e) {
    console.error("Error fetching vehicle list:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});
app.get("/api/vehicles/:id/details", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const v = await getVehicleByIdPG(req.params.id);
    if (!v) return res.status(404).json({ success: false });
    const vid = req.params.id;
    const safe = (p) => p.catch(e => { console.warn("[details]", e.message); return []; });
    const [readings, oilChanges, handovers, stockTransactions, inspections] = await Promise.all([
      safe(listReadingsPG(vid)),
      safe(listOilChangesPG(vid)),
      safe(db.listHandoversByVehicle ? db.listHandoversByVehicle(vid) : []),
      safe(db.listStockTransactionsByVehicle ? db.listStockTransactionsByVehicle(vid) : []),
      safe(db.listPeriodicMaintenance ? db.listPeriodicMaintenance({ vehicleId: vid }) : [])
    ]);
    let tires = [], tireSurvey = null, tireEvents = [];
    try {
      const { getVehicleTires } = await import("./tire-management.js");
      const tiresData = await getVehicleTires(vid).catch(() => ({}));
      tires = tiresData.tires || [];
      tireSurvey = tiresData.survey || null;
      tireEvents = tiresData.events || [];
    } catch (e) { console.warn("[details] tires:", e.message); }
    res.json({
      success: true,
      vehicle: v,
      readings,
      oilChanges,
      handovers,
      stockTransactions,
      inspections: inspections || [],
      tires: tires || [],
      tireSurvey,
      tireEvents
    });
  } catch (e) {
    console.error("[details]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/vehicles/:id/report", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const vid = req.params.id;
    const v = await getVehicleByIdPG(vid);
    if (!v) return res.status(404).send("Vehicle not found");
    const safe = (p) => p.catch(e => { console.warn("[report]", e.message); return []; });
    const [readings, oilChanges, handovers, stockTransactions, inspections] = await Promise.all([
      safe(listReadingsPG(vid)),
      safe(listOilChangesPG(vid)),
      safe(db.listHandoversByVehicle ? db.listHandoversByVehicle(vid) : []),
      safe(db.listStockTransactionsByVehicle ? db.listStockTransactionsByVehicle(vid) : []),
      safe(db.listPeriodicMaintenance ? db.listPeriodicMaintenance({ vehicleId: vid }) : [])
    ]);
    let tires = [];
    try {
      const { getVehicleTires } = await import("./tire-management.js");
      const tiresData = await getVehicleTires(vid).catch(() => ({}));
      tires = tiresData.tires || [];
    } catch (e) { console.warn("[report] tires:", e.message); }
    const html = vehicleReportHtml(v, { readings, oilChanges, handovers, stockTransactions, inspections, tires });
    res.type("html").send(html);
  } catch (e) {
    console.error("[VehicleReport]", e);
    res.status(500).send(e.message || "Unable to generate report");
  }
});

app.post("/api/vehicles", async (req, res) => {
  try { res.json({ success: true, vehicle: await db.createVehicle(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/vehicles/:id", async (req, res) => {
  try { res.json({ success: true, vehicle: await db.updateVehicle(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/vehicles/:id/last-oil-change", async (req, res) => {
  try {
    const vehicle = await updateLastOilChangePG(req.params.id, req.body);
    res.json({ success: true, vehicle });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
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



// ============================================================
// DRIVER HANDOVERS (التسليم والاستلام)
// ============================================================

// Get comprehensive vehicle data for handover form
app.get("/api/vehicle-handover-data/:vehicleId", async (req, res) => {
  try {
    const vid = Number(req.params.vehicleId);
    if (!Number.isFinite(vid)) return res.status(400).json({ success: false, error: "Invalid vehicle ID." });

    // 1. Vehicle basic info + oil data + inspection dates from vehicles table
    const vRes = await pgQuery(`
      SELECT id, plate_number, plate_code, make, model, year, driver, phone, location,
             current_km, last_oil_km, oil_change_interval, last_oil_change_date, status,
             inspection_last_date, inspection_due_date, inspection_expiry_date
      FROM vehicles WHERE id = $1 LIMIT 1
    `, [vid]);
    const vehicle = vRes.rows[0];
    if (!vehicle) return res.status(404).json({ success: false, error: "Vehicle not found." });

    const plate = [vehicle.plate_number, vehicle.plate_code].filter(Boolean).join(' ').trim();
    const currentKm = Number(vehicle.current_km || 0);
    const lastOilKm = Number(vehicle.last_oil_km || 0);
    const interval = Number(vehicle.oil_change_interval || 5000);
    const kmSinceOil = currentKm - lastOilKm;
    const remainingKm = interval - kmSinceOil;
    const oilStatus = remainingKm <= 0 ? 'OVERDUE' : remainingKm <= 500 ? 'DUE SOON' : 'OK';

    // 2. Tire serials (6 positions)
    const tireRes = await pgQuery(`
      SELECT position, manufacturer_serial, brand, condition_status
      FROM tire_assets WHERE vehicle_id = $1 ORDER BY position
    `, [vid]);
    const tirePositions = ['Front Left', 'Front Right', 'Rear Left', 'Rear Right', 'Spare', 'Sixth'];
    const tires = tirePositions.map(pos => {
      const t = tireRes.rows.find(r => r.position === pos);
      return { position: pos, serial: t?.manufacturer_serial || '—', brand: t?.brand || '—', condition: t?.condition_status || '—' };
    });

    // 3. Last 3 maintenance items (from tickets, even if closed)
    const maintRes = await pgQuery(`
      SELECT id, title, category, description, status, opened_at, closed_at, priority
      FROM tickets WHERE vehicle_id = $1
      ORDER BY COALESCE(closed_at, opened_at) DESC
      LIMIT 3
    `, [vid]);
    const maintenanceHistory = maintRes.rows.map(t => ({
      id: t.id,
      title: t.title || t.category || '—',
      description: String(t.description || '').slice(0, 100),
      status: t.status,
      date: String(t.closed_at || t.opened_at || '').slice(0, 10),
      priority: t.priority || '—'
    }));

    // 4. Annual inspection date
    const annualRes = await pgQuery(`
      SELECT completed_date::text AS completed_date, status::text AS status, notes,
             whatsapp_confirmed_at::text AS whatsapp_confirmed_at
      FROM periodic_maintenance
      WHERE vehicle_id = $1 AND type = 'inspection' AND status = 'Completed'
      ORDER BY completed_date DESC LIMIT 1
    `, [vid]);
    const annual = annualRes.rows[0];
    let annualNextDue = '—';
    let annualCompletedDate = '—';
    // Try periodic_maintenance first, then fall back to vehicles table
    if (annual?.completed_date) {
      const parsed = new Date(annual.completed_date);
      if (!Number.isNaN(parsed.getTime())) {
        annualCompletedDate = parsed.toISOString().slice(0, 10);
        const d = new Date(annualCompletedDate + 'T00:00:00Z');
        d.setUTCFullYear(d.getUTCFullYear() + 1);
        annualNextDue = d.toISOString().slice(0, 10);
      }
    } else if (vehicle.inspection_last_date) {
      // Fallback: use vehicles.inspection_last_date
      const parsed = new Date(vehicle.inspection_last_date);
      if (!Number.isNaN(parsed.getTime())) {
        annualCompletedDate = parsed.toISOString().slice(0, 10);
        const d = new Date(annualCompletedDate + 'T00:00:00Z');
        d.setUTCFullYear(d.getUTCFullYear() + 1);
        annualNextDue = d.toISOString().slice(0, 10);
      }
    } else if (vehicle.inspection_expiry_date) {
      // Fallback: use vehicles.inspection_expiry_date (calculate last = expiry - 1 year)
      const parsedExpiry = new Date(vehicle.inspection_expiry_date);
      if (!Number.isNaN(parsedExpiry.getTime())) {
        annualNextDue = parsedExpiry.toISOString().slice(0, 10);
        const d = new Date(parsedExpiry);
        d.setUTCFullYear(d.getUTCFullYear() - 1);
        annualCompletedDate = d.toISOString().slice(0, 10);
      }
    }

    // 5. 6-month inspection date
    const sixMonthRes = await pgQuery(`
      SELECT completed_date::text AS completed_date, status::text AS status, notes,
             whatsapp_confirmed_at::text AS whatsapp_confirmed_at
      FROM periodic_maintenance
      WHERE vehicle_id = $1 AND type = '6_months_general' AND status = 'Completed'
      ORDER BY completed_date DESC LIMIT 1
    `, [vid]);
    const sixMonth = sixMonthRes.rows[0];
    let sixMonthNextDue = '—';
    let sixMonthCompletedDate = '—';
    if (sixMonth?.completed_date) {
      const parsed = new Date(sixMonth.completed_date);
      if (!Number.isNaN(parsed.getTime())) {
        sixMonthCompletedDate = parsed.toISOString().slice(0, 10);
        const d = new Date(sixMonthCompletedDate + 'T00:00:00Z');
        d.setUTCMonth(d.getUTCMonth() + 6);
        sixMonthNextDue = d.toISOString().slice(0, 10);
      }
    } else {
      // Fallback: check tickets for 6-Month Maintenance with WhatsApp confirmation
      const sixMonthTicketRes = await pgQuery(`
        SELECT closed_at::text AS closed_at, opened_at::text AS opened_at,
               status, whatsapp_confirmed_at::text AS whatsapp_confirmed_at
        FROM tickets
        WHERE vehicle_id = $1
          AND (category ILIKE '%6-Month%' OR title ILIKE '%6-Month%' OR category ILIKE '%6 Month%')
          AND status IN ('Completed', 'Closed')
        ORDER BY COALESCE(closed_at, opened_at) DESC
        LIMIT 1
      `, [vid]);
      const sixMonthTicket = sixMonthTicketRes.rows[0];
      if (sixMonthTicket) {
        const dateStr = sixMonthTicket.closed_at || sixMonthTicket.opened_at;
        if (dateStr) {
          const parsed = new Date(dateStr);
          if (!Number.isNaN(parsed.getTime())) {
            sixMonthCompletedDate = parsed.toISOString().slice(0, 10);
            const d = new Date(sixMonthCompletedDate + 'T00:00:00Z');
            d.setUTCMonth(d.getUTCMonth() + 6);
            sixMonthNextDue = d.toISOString().slice(0, 10);
          }
        }
      }
    }

    // 6. Checklist items (hardcoded)
    const checklist = [
      { id: 1, name: 'Reflective Triangle', name_ar: 'مثلث عاكسة' },
      { id: 2, name: 'Fire Extinguisher 3kg', name_ar: 'طفاية حريق 3 كيلو' },
      { id: 3, name: 'Air Blower', name_ar: 'منفاخ الهواء' },
      { id: 4, name: 'Tire Wrench', name_ar: 'مفتاح براغي الإطارات' },
      { id: 5, name: 'Jack', name_ar: 'جك رافع السيارة' },
      { id: 6, name: 'Wheel Chock', name_ar: 'وييل شوك' },
      { id: 7, name: 'Sand Ladders', name_ar: 'Sand Ladders' },
      { id: 8, name: 'Daily Checking of Vehicle Wheel Nuts', name_ar: 'Daily Checking of Vehicle Wheel Nuts' }
    ];

    res.json({
      success: true,
      vehicle: {
        id: vehicle.id,
        plate,
        plate_number: vehicle.plate_number,
        plate_code: vehicle.plate_code,
        make: vehicle.make || '',
        model: vehicle.model || '',
        year: vehicle.year || '',
        driver: vehicle.driver || '—',
        phone: vehicle.phone || '',
        location: vehicle.location || '—',
        status: vehicle.status || 'Active'
      },
      oil: {
        current_km: currentKm,
        last_oil_km: lastOilKm,
        interval,
        km_since_oil: kmSinceOil,
        remaining_km: remainingKm,
        last_oil_change_date: vehicle.last_oil_change_date || '—',
        status: oilStatus
      },
      tires,
      maintenance_history: maintenanceHistory,
      annual_inspection: {
        last_completed: annualCompletedDate,
        next_due: annualNextDue,
        status: annual ? 'Completed' : 'Not Inspected',
        whatsapp_confirmed: annual?.whatsapp_confirmed_at ? String(annual.whatsapp_confirmed_at).slice(0, 10) : null
      },
      six_month_inspection: {
        last_completed: sixMonthCompletedDate,
        next_due: sixMonthNextDue,
        status: sixMonth ? 'Completed' : 'Not Inspected',
        whatsapp_confirmed: sixMonth?.whatsapp_confirmed_at ? String(sixMonth.whatsapp_confirmed_at).slice(0, 10) : null
      },
      checklist
    });
  } catch (e) {
    console.error("[VehicleHandoverData]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/vehicles/:id/handover", async (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    if (!Number.isFinite(vehicleId)) {
      return res.status(400).json({ success: false, error: "Invalid vehicle ID" });
    }

    const body = req.body || {};
    const handover = await db.createDriverHandover({
      vehicleId,
      previousDriverId: body.previousDriverId || null,
      previousDriverName: body.previousDriverName || "",
      previousDriverPhone: body.previousDriverPhone || "",
      newDriverId: body.newDriverId || null,
      newDriverName: body.newDriverName || "",
      newDriverPhone: body.newDriverPhone || "",
      handoverDate: body.handoverDate || null,
      notes: body.notes || ""
    });

    res.json({ success: true, handover });
  } catch (e) {
    console.error("[HandoverCreate]", e);
    res.status(400).json({ success: false, error: e.message });
  }
});

app.get("/api/driver-handovers", async (req, res) => {
  try {
    const filters = {
      vehicleId: req.query.vehicleId ? Number(req.query.vehicleId) : null,
      newDriverId: req.query.newDriverId ? Number(req.query.newDriverId) : null
    };
    const handovers = await db.listDriverHandovers(filters);
    res.json({ success: true, handovers });
  } catch (e) {
    console.error("[HandoverList]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/driver-handovers/:id", async (req, res) => {
  try {
    const handover = await db.getDriverHandover(req.params.id);
    if (!handover) {
      return res.status(404).json({ success: false, error: "Handover not found" });
    }
    res.json({ success: true, handover });
  } catch (e) {
    console.error("[HandoverGet]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});


app.put("/api/driver-handovers/:id", async (req, res) => {
  try {
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ success: false, error: "Owner only." });
    }
    const updated = await db.updateDriverHandover(req.params.id, req.body || {});
    res.json({ success: true, handover: updated });
  } catch (e) {
    console.error("[Handover:update]", e);
    res.status(400).json({ success: false, error: e.message });
  }
});

app.delete("/api/driver-handovers/:id", async (req, res) => {
  try {
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ success: false, error: "Only the Owner can delete driver handovers." });
    }
    const result = await db.deleteDriverHandover(req.params.id);
    if (!result || result.changes === 0) {
      return res.status(404).json({ success: false, error: "Handover not found" });
    }
    res.json({ success: true, ...result });
  } catch (e) {
    console.error("[HandoverDelete]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/driver-handovers/:id/pdf", async (req, res) => {
  try {
    const handover = await db.getDriverHandover(req.params.id);
    if (!handover) {
      return res.status(404).send("Handover not found");
    }
    res.set("Cache-Control", "no-store");
    res.type("html").send(handoverReportHtml(handover));
  } catch (e) {
    console.error("[HandoverPDF]", e);
    res.status(500).send(e.message || "Unable to generate PDF");
  }
});



app.post("/api/driver-handovers/:id/whatsapp-sent", async (req, res) => {
  try {
    const handover = await db.markHandoverWhatsAppSent(req.params.id);
    if (!handover) {
      return res.status(404).json({ success: false, error: "Handover not found" });
    }
    res.json({ success: true, handover });
  } catch (e) {
    console.error("[HandoverWhatsApp]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== ALERTS =====
app.get("/api/alerts", async (req, res) => {
  try { res.json({ success: true, ...await getAlertsPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== DAILY KM NOTIFICATIONS =====
app.get("/api/km-daily-report", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json(await getDailyKmReport(req.query.date || null));
  } catch (e) {
    console.error("[DailyKMReport]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/km-daily-notifications", async (req, res) => {
  try {
    res.json({ success: true, ...await getKmDailyNotifications() });
  } catch (e) {
    console.error("Error fetching daily KM notifications:", e);
    res.status(500).json({ success: false, error: e.message });
  }
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

app.put("/api/tickets/:id/acknowledge", async (req, res) => {
  try {
    if (!["Owner","FleetSupervisor"].includes(req.user?.role)) {
      return res.status(403).json({ success:false, error:"Only Owner or Fleet Supervisor can acknowledge tickets." });
    }
    const ticket = await acknowledgeTicketPG(req.params.id, {
      ...req.body,
      acknowledgedBy: req.user?.full_name || req.user?.username || "Fleet Management"
    });
    res.json({ success:true, ticket });
  } catch (e) {
    console.error("Error acknowledging ticket:", e);
    res.status(400).json({ success:false, error:e.message });
  }
});

app.put("/api/tickets/:id/start", async (req, res) => {
  try {
    if (!["Owner","FleetSupervisor"].includes(req.user?.role)) {
      return res.status(403).json({ success:false, error:"Only Owner or Fleet Supervisor can start ticket work." });
    }
    const ticket = await startTicketWorkPG(req.params.id, {
      ...req.body,
      startedBy: req.user?.full_name || req.user?.username || "Fleet Management"
    });
    res.json({ success:true, ticket });
  } catch (e) {
    console.error("Error starting ticket:", e);
    res.status(400).json({ success:false, error:e.message });
  }
});

app.put("/api/tickets/:id/close", async (req, res) => {
  try {
    if (!["Owner","FleetSupervisor"].includes(req.user?.role)) {
      return res.status(403).json({ success:false, error:"Only Owner or Fleet Supervisor can close tickets." });
    }
    const ticket = await closeTicketWithNotesPG(req.params.id, {
      ...req.body,
      closedBy: req.user?.full_name || req.user?.username || "Fleet Management"
    });
    res.json({ success:true, ticket });
  } catch (e) {
    console.error("Error closing ticket:", e);
    res.status(400).json({ success:false, error:e.message });
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

app.put("/api/tickets/:id/close-with-notes", async (req, res) => {
  try {
    if (!["Owner","FleetSupervisor"].includes(req.user?.role)) {
      return res.status(403).json({ success:false, error:"Only Owner or Fleet Supervisor can close tickets." });
    }
    const ticket = await closeTicketWithNotesPG(req.params.id, {
      ...req.body,
      closedBy: req.user?.full_name || req.user?.username || "Fleet Management"
    });
    res.json({ success: true, ticket });
  } catch (e) {
    console.error("Error closing ticket with notes:", e);
    res.status(400).json({ success:false, error:e.message });
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
// ===== 6-MONTH MAINTENANCE REPAIR WHATSAPP =====
app.get("/api/periodic-maintenance/repair-statuses", async (req, res) => {
  try {
    const result = await pgQuery(`
      SELECT
        pm.id AS pm_id,
        pm.status AS pm_status,
        pm.whatsapp_confirmed_at AS pm_confirmed_at,
        pm.whatsapp_confirmation_source AS pm_source,
        t.status AS ticket_status,
        t.whatsapp_confirmed_at AS ticket_confirmed_at,
          t.whatsapp_confirmation_source AS ticket_source,
          annual.whatsapp_confirmed_at AS annual_confirmed_at
      FROM periodic_maintenance pm
      LEFT JOIN tickets t
        ON t.category = '6-Month Maintenance'
       AND COALESCE(t.resolution_notes, '') LIKE '[PM_REPAIR:' || pm.id || ']%'
        LEFT JOIN periodic_maintenance annual
          ON annual.vehicle_id = pm.vehicle_id
         AND annual.type = 'inspection'
         AND annual.status = 'Completed'
      WHERE pm.type = '6_months_general'
        AND pm.status IN ('Completed', 'Pending Driver Confirmation', 'Pending', 'Open')
      ORDER BY pm.id DESC
    `);
    const statuses = {};
    for (const row of result.rows) {
      const key = String(row.pm_id);
      if (statuses[key]) continue;
      const status = row.ticket_status || row.pm_status || 'Open';
        const confirmedAt = row.ticket_confirmed_at || row.pm_confirmed_at || row.annual_confirmed_at || null;
      const source = row.ticket_source || row.pm_source || null;
      statuses[key] = {
        status,
        whatsapp_confirmed_at: confirmedAt,
        whatsapp_confirmation_source: source
      };
    }
    res.json({ success: true, statuses });
  } catch (e) {
    console.error("[SixMonthRepairStatuses]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/periodic-maintenance/:id/repair-whatsapp-info", async (req, res) => {
  try {
    const pmId = Number(req.params.id);
    if (!Number.isFinite(pmId)) return res.status(400).json({ success:false, error:"Invalid maintenance record." });

    const pmResult = await pgQuery(`
      SELECT pm.id, pm.vehicle_id, pm.type, pm.notes, pm.scheduled_date, pm.completed_date,
             v.plate_number, v.plate_code, v.driver, v.phone, v.location
      FROM periodic_maintenance pm
      LEFT JOIN vehicles v ON v.id = pm.vehicle_id
      WHERE pm.id = $1 AND pm.type = '6_months_general'
      LIMIT 1
    `, [pmId]);
    const pm = pmResult.rows[0];
    if (!pm) return res.status(404).json({ success:false, error:"6-month maintenance record not found." });
    if (!String(pm.notes || '').trim()) return res.status(400).json({ success:false, error:"No 6-month repair notes are available." });
    if (!String(pm.phone || '').trim()) return res.status(400).json({ success:false, error:"Driver phone number is not available." });

    const existing = await pgQuery(`
      SELECT id, status
      FROM tickets
      WHERE category = '6-Month Maintenance'
        AND vehicle_id = $1
        AND COALESCE(resolution_notes, '') LIKE $2
      ORDER BY id DESC
      LIMIT 1
    `, [pm.vehicle_id, '[PM_REPAIR:' + pmId + ']%']);

    let ticket = existing.rows[0];
    if (!ticket) {
      ticket = (await pgQuery(`
        INSERT INTO tickets
          (vehicle_id, title, location, category, priority, status, description, reported_by, opened_at, department)
        VALUES ($1,$2,$3,'6-Month Maintenance','Medium','Open',$4,'Fleet Management',CURRENT_TIMESTAMP,'Fleet')
        RETURNING id, status
      `, [
        pm.vehicle_id,
        '6-Month Maintenance Repair',
        pm.location || '',
        String(pm.notes).trim()
      ])).rows[0];

      await pgQuery(
        `UPDATE tickets SET resolution_notes=$1 WHERE id=$2`,
        ['[PM_REPAIR:' + pmId + '] 6-month maintenance repair request', ticket.id]
      );
    }

    const token = randomUUID();
    await pgQuery(`
      UPDATE tickets
      SET whatsapp_confirmation_token=$1,
          whatsapp_confirmed_at=NULL,
          whatsapp_confirmation_source='Fleet Management - WhatsApp Pending',
          status='Pending Driver Confirmation'
      WHERE id=$2
    `, [token, ticket.id]);

    const plate = [pm.plate_number, pm.plate_code].filter(Boolean).join(" ").trim();
    res.json({
      success:true,
      ticketId:ticket.id,
      driverName:pm.driver || "",
      driverPhone:pm.phone || "",
      waMeNumber:toWaMeInternational(pm.phone),
      vehiclePlate:plate,
      issueType:"6-Month Maintenance",
      description:String(pm.notes).trim(),
      confirmationUrl:MAINTENANCE_CONFIRM_BASE_URL()+"/maintenance-confirm/"+token
    });
  } catch(e) {
    console.error("[SixMonthRepairWhatsAppInfo]", e);
    res.status(500).json({success:false,error:e.message});
  }
});

// ===== MAINTENANCE ISSUE WHATSAPP CONFIRMATION =====
const MAINTENANCE_CONFIRM_BASE_URL = () =>
  String(process.env.PUBLIC_APP_URL || "https://fleet-erp-kn0c.onrender.com").replace(/\/$/, "");

app.get("/api/tickets/:id/maintenance-whatsapp-info", async (req, res) => {
  try {
    const result = await pgQuery(`SELECT t.id,t.status,t.category,t.description,v.plate_number,v.plate_code,v.driver,v.phone FROM tickets t LEFT JOIN vehicles v ON v.id=t.vehicle_id WHERE t.id=$1 AND t.vehicle_id IS NOT NULL LIMIT 1`, [req.params.id]);
    const row=result.rows[0];
    if(!row) return res.status(404).json({success:false,error:"Maintenance ticket not found."});
    if(["Daily KM","Daily Vehicle Submission"].includes(String(row.category||""))) return res.status(400).json({success:false,error:"Daily KM tickets cannot use maintenance confirmation."});
    if(!String(row.phone||"").trim()) return res.status(400).json({success:false,error:"Driver phone number is not available."});
    const token=randomUUID();
    await pgQuery(`UPDATE tickets SET whatsapp_confirmation_token=$1,whatsapp_confirmed_at=NULL,whatsapp_confirmation_source='Fleet Management - WhatsApp Pending',status='Pending Driver Confirmation' WHERE id=$2`,[token,row.id]);
    res.json({success:true,driverName:row.driver||"",driverPhone:row.phone||"",waMeNumber:toWaMeInternational(row.phone),vehiclePlate:[row.plate_number,row.plate_code].filter(Boolean).join(" ").trim(),issueType:row.category||"Maintenance Issue",description:row.description||"",confirmationUrl:MAINTENANCE_CONFIRM_BASE_URL()+"/maintenance-confirm/"+token});
  } catch(e){console.error("[MaintenanceWhatsAppInfo]",e);res.status(500).json({success:false,error:e.message});}
});

app.get("/maintenance-confirm/:token", async (req,res)=>{
  try{
    const token=String(req.params.token||"").trim();
    const result=await pgQuery(`SELECT t.id,t.status,t.category,t.description,t.whatsapp_confirmed_at,v.plate_number,v.plate_code FROM tickets t LEFT JOIN vehicles v ON v.id=t.vehicle_id WHERE t.whatsapp_confirmation_token=$1 LIMIT 1`,[token]);
    const row=result.rows[0]; res.set("Cache-Control","no-store,no-cache,must-revalidate,proxy-revalidate");
    if(!row)return res.status(404).send("<h2>Maintenance confirmation link is invalid or expired.</h2>");
    if(row.status==="Completed"||row.whatsapp_confirmed_at)return res.send("<h2>Maintenance Already Confirmed</h2><p>This maintenance issue has already been confirmed.</p>");
    const plate=[row.plate_number,row.plate_code].filter(Boolean).join(" ").trim();
    const esc=s=>String(s??"").replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maintenance Confirmation</title></head><body style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto;padding:20px"><h2>Vehicle Maintenance Confirmation</h2><p><b>Vehicle:</b> ${esc(plate)}</p><p><b>Issue:</b> ${esc(row.category||"Maintenance Issue")}</p><p>${esc(row.description||"")}</p><hr/><p>Has this maintenance issue been repaired?</p><p>هل تم إصلاح هذه المشكلة في المركبة؟</p><form method="POST" action="/maintenance-confirm/${encodeURIComponent(token)}?decision=yes"><button style="padding:14px 28px;background:#16a34a;color:white;border:0;border-radius:8px;font-size:18px">YES — Repaired</button></form><br/><form method="POST" action="/maintenance-confirm/${encodeURIComponent(token)}?decision=no"><button style="padding:14px 28px;background:#dc2626;color:white;border:0;border-radius:8px;font-size:18px">NO — Not Repaired</button></form></body></html>`);
  }catch(e){res.status(500).send("Maintenance confirmation error.");}
});
app.post("/maintenance-confirm/:token", async(req,res)=>{
  try{
    const token=String(req.params.token||"").trim(),decision=String(req.query.decision||req.body?.decision||"").toLowerCase();
    const result=await pgQuery(`SELECT id,status FROM tickets WHERE whatsapp_confirmation_token=$1 LIMIT 1`,[token]); const row=result.rows[0];
    if(!row)return res.status(404).send("<h2>Maintenance confirmation link is invalid or expired.</h2>");
    if(row.status==="Completed")return res.send("<h2>Maintenance Already Confirmed</h2><p>This maintenance issue has already been confirmed.</p>");
    if(decision==="yes"){await pgQuery(`UPDATE tickets SET status='Completed',closed_at=CURRENT_TIMESTAMP,closed_by='Driver - WhatsApp',resolution_notes=COALESCE(NULLIF(resolution_notes,''),'Driver confirmed repaired via WhatsApp'),whatsapp_confirmed_at=CURRENT_TIMESTAMP,whatsapp_confirmation_source='Fleet Management - WhatsApp YES',whatsapp_confirmation_token=NULL WHERE id=$1 AND whatsapp_confirmation_token=$2`,[row.id,token]);return res.send("<h2>✓ Maintenance Confirmed</h2><p>The repair has been confirmed and recorded in Fleet ERP.</p><p>Date: "+new Date().toISOString().slice(0,10)+"</p>");}
    if(decision==="no"){await pgQuery(`UPDATE tickets SET status='Open',whatsapp_confirmation_source='Fleet Management - WhatsApp NO',whatsapp_confirmation_token=NULL WHERE id=$1 AND whatsapp_confirmation_token=$2`,[row.id,token]);return res.send("<h2>Maintenance Still Pending</h2><p>The ticket remains open. Fleet Management has been notified.</p>");}
    res.status(400).send("<h2>Please choose YES or NO.</h2>");
  }catch(e){console.error("[MaintenanceConfirm]",e);res.status(500).send("Maintenance confirmation error.");}
});

app.post("/api/issues/report", async (req, res) => {
  try {
    const { vehicleId, issueType, category, description, priority, openedAt } = req.body;
    const finalCategory = issueType || category || "Other";
    const reporter = req.user?.username || req.user?.full_name || "Driver";
    const ticket = await createTicketPG({
      vehicleId,
      category: finalCategory,
      description,
      reportedBy: reporter,
      priority: priority || "Medium",
      openedAt
    });
    res.json({ success: true, message: "Ticket created", ticket });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== DRIVER SELF-REPAIR / FLEET VERIFICATION =====
app.get("/api/vehicle-repairs", async (req, res) => {
  try {
    const filters = {};
    if (req.query.vehicleId) filters.vehicleId = req.query.vehicleId;
    if (req.query.status) filters.status = req.query.status;
    if (req.user?.role === "Driver") filters.reportedBy = req.user?.username || req.user?.full_name;
    res.json({ success: true, repairs: await listVehicleRepairOrdersPG(filters) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/vehicle-repairs", async (req, res) => {
  try {
    if (!req.body.vehicleId || !req.body.issueDescription) return res.status(400).json({ success:false, error:"Vehicle and issue description are required." });
    const repair = await createVehicleRepairOrderPG({ ...req.body, reportedBy: req.user?.username || req.user?.full_name || "Driver" });
    res.status(201).json({ success: true, repair });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put("/api/vehicle-repairs/:id/complete", async (req, res) => {
  try {
    const repair = await completeVehicleRepairOrderPG(req.params.id, { ...req.body, repairedBy: req.user?.username || req.user?.full_name || "Driver" });
    res.json({ success: true, repair });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/vehicle-repairs/:id/close", async (req, res) => {
  try {
    const role = String(req.user?.role || "");
    if (!['Owner','FleetSupervisor'].includes(role)) return res.status(403).json({ success:false, error:"Only Fleet Manager/Supervisor can confirm and close a repair." });
    const repair = await closeVehicleRepairOrderPG(req.params.id, { ...req.body, verifiedBy: req.user?.full_name || req.user?.username || "Fleet Manager" });
    res.json({ success: true, repair });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
// ===== VEHICLE DASHBOARD =====
app.get("/api/dashboard", async (req, res) => {
  try { res.json({ success: true, ...await getDashboardPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== DAILY VEHICLE SUBMISSION REPORT (Google Sheet) =====

app.get("/api/google-sheet-submission-report", async (req, res) => {
  try {
    const { getDailySubmissionReport } = await import("./dailySubmissionReport.js");
    const report = await getDailySubmissionReport(req.query.date || null);
    res.json(report);
  } catch (error) {
    console.error("[DailyVehicleSubmission]", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
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


// ===== SUPPORT MANAGER (SITE READ-ONLY) =====
app.get("/api/support-manager/tickets", async (req, res) => {
  try {
    const site = String(req.user?.site || "").trim();
    if (!site) return res.json({ success: true, tickets: [] });
    const tickets = await listTicketsPG({});
    const siteKey = site.toLowerCase();
    const filtered = tickets.filter(t =>
      String(t.location || "").trim().toLowerCase() === siteKey ||
      String(t.site || "").trim().toLowerCase() === siteKey
    );
    res.json({ success: true, tickets: filtered });
  } catch (e) {
    console.error("Error fetching Support Manager tickets:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/support-manager/warehouse", async (req, res) => {
  try {
    const site = String(req.user?.site || "").trim();
    if (!site) return res.json({ success: true, items: [] });
    const siteKey = site.toLowerCase();
    const items = (await listInventoryPG()).filter(item =>
      String(item.location || "").trim().toLowerCase().includes(siteKey)
    ).map(item => ({ ...item, location_code: item.location || "" }));
    res.json({ success: true, items });
  } catch (e) {
    console.error("Error fetching Support Manager warehouse:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== MAINTENANCE REQUEST =====
app.post("/api/maintenance-requests", async (req, res) => {
  try {
    const { site, category, description, priority } = req.body || {};
    if (!String(description || "").trim()) return res.status(400).json({ success: false, error: "Maintenance description is required" });
    const ticket = await createTicketPG({
      vehicleId: null,
      title: `Building Maintenance Request — ${category || "General Maintenance"}`,
      location: String(site || req.user?.site || "").trim(),
      category: category || "General Maintenance",
      description: String(description).trim(),
      reportedBy: req.user?.full_name || req.user?.username || "User",
      priority: priority || "Medium",
      department: "Building"
    });
    res.status(201).json({ success: true, ticket });
  } catch (e) {
    console.error("Error creating maintenance request:", e);
    res.status(400).json({ success: false, error: e.message });
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
app.put("/api/work-orders/:id/close", requireRole("Owner"), async (req, res) => {
  try { res.json({ success: true, order: await closeWorkOrderPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.delete("/api/work-orders/:id", requireRole("Owner"), async (req, res) => {
  try { res.json({ success: await deleteWorkOrderPG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get("/api/work-orders/:id/items", async (req, res) => {
  try { res.json({ success: true, items: await listWorkOrderItemsPG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post("/api/work-orders/:id/items", async (req, res) => {
  try { res.status(201).json({ success: true, item: await createWorkOrderItemPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
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
app.put("/api/projects/:id/close", requireRole("Owner"), async (req, res) => {
  try { res.json({ success: true, project: await closeProjectPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.delete("/api/projects/:id", requireRole("Owner"), async (req, res) => {
  try { res.json({ success: await deleteProjectPG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get("/api/projects/:id/items", async (req, res) => {
  try { res.json({ success: true, items: await listProjectItemsPG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post("/api/projects/:id/items", async (req, res) => {
  try { res.status(201).json({ success: true, item: await createProjectItemPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/project-items/:id", async (req, res) => {
  try { res.json({ success: true, item: await updateProjectItemPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/project-items/:id/close", async (req, res) => {
  try { res.json({ success: true, item: await closeProjectItemPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/project-items/:id/reopen", async (req, res) => {
  try { res.json({ success: true, item: await reopenProjectItemPG(req.params.id) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
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
app.put("/api/purchases/:id", async (req, res) => {
  try { res.json({ success: true, purchase: await updatePurchasePG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/purchases/:id/close", async (req, res) => {
  try { res.json({ success: true, purchase: await closePurchasePG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
app.delete("/api/purchases/:id", async (req, res) => {
  try { res.json({ success: await deletePurchasePG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});


// ===== PROJECT PURCHASE REQUESTS =====
app.get("/api/purchase-requests", async (req, res) => {
  try { res.json({ success: true, requests: await listPurchaseRequestsPG() }); }
  catch (e) { console.error("Error fetching purchase requests:", e); res.status(500).json({ success: false, error: e.message }); }
});
app.post("/api/purchase-requests", async (req, res) => {
  try {
    const request = await createPurchaseRequestPG({ ...req.body, requestedByUserId: req.user?.id, requestedBy: req.user?.full_name || req.user?.username || "User" });
    res.status(201).json({ success: true, request });
  } catch (e) { console.error("Error creating purchase request:", e); res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/purchase-requests/:id/approve", async (req, res) => {
  try {
    if (req.user?.role !== "Owner" || String(req.user?.username || "").toLowerCase() !== "owner") return res.status(403).json({ success: false, error: "Owner approval is required" });
    const request = await approvePurchaseRequestPG(req.params.id, req.user, req.body?.approvalNotes || "");
    res.json({ success: true, request });
  } catch (e) { console.error("Error approving purchase request:", e); res.status(400).json({ success: false, error: e.message }); }
});
app.put("/api/purchase-requests/:id/reject", async (req, res) => {
  try {
    if (req.user?.role !== "Owner" || String(req.user?.username || "").toLowerCase() !== "owner") return res.status(403).json({ success: false, error: "Owner rejection is required" });
    const request = await rejectPurchaseRequestPG(req.params.id, req.user, req.body?.reason || "");
    res.json({ success: true, request });
  } catch (e) { console.error("Error rejecting purchase request:", e); res.status(400).json({ success: false, error: e.message }); }
});
app.post("/api/purchase-requests/:id/purchase", async (req, res) => {
  try {
    const result = await recordPurchaseFromRequestPG(req.params.id, req.body || {}, req.user);
    res.status(201).json({ success: true, ...result });
  } catch (e) { console.error("Error recording purchase request:", e); res.status(400).json({ success: false, error: e.message }); }
});


// ===== CURRENT MONTH DASHBOARD FINANCIALS =====
app.get("/api/dashboard/current-month-financials", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json({ success: true, ...await getCurrentMonthDashboardFinancialPG() });
  } catch (e) {
    console.error("[DashboardFinancials]", e);
    res.status(500).json({ success: false, error: e.message });
  }
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

// ===== GENERAL MAINTENANCE MONTHLY REPORT =====
app.get("/api/reports/general-maintenance", async (req, res) => {
  try {
    const filters = { year: req.query.year, site: req.query.site };
    res.json({ success: true, ...await getGeneralMaintenanceReportPG(filters) });
  } catch (e) {
    console.error("[GeneralMaintenanceReport]", e);
    res.status(500).json({ success: false, error: e.message });
  }
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

function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: "Forbidden", message: "You do not have permission to perform this action." });
    }
    next();
  };
}

// ===== MANUAL MORNING SYNC =====
// Automatic schedulers are disabled by default. Owner can run the three
// operational syncs together from the ERP when the morning sync is required.
app.post("/api/operations/morning-sync", requireRole("Owner"), async (req, res) => {
  const startedAt = new Date().toISOString();
  try {
    const { reconcileAndNotify, checkMaintenanceDue } = await import("./kmDailyNotifications.js");
    const { closeStaleDailyKmTickets } = await import("./dailyKm.js");

    const dailyKm = await reconcileAndNotify();
    const staleDailyKm = await closeStaleDailyKmTickets(
      dailyKm.today,
      ["Daily Vehicle Submission"]
    );
    const maintenance = await checkMaintenanceDue();

    res.json({
      success: true,
      startedAt,
      completedAt: new Date().toISOString(),
      results: { dailyKm, staleDailyKm, maintenance }
    });
  } catch (error) {
    console.error("[ManualMorningSync]", error);
    res.status(500).json({
      success: false,
      error: error.message,
      startedAt
    });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  res.json({ success: true, user: req.user });
});

app.get("/api/users", requireRole("Owner"), async (req, res) => {
  try { res.json({ success: true, users: await listUsers() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/users", requireRole("Owner"), async (req, res) => {
  try { res.json({ success: true, user: await createUser(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/users/:id", requireRole("Owner"), async (req, res) => {
  try {
    const user = await updateUser(req.params.id, req.body);
    res.json({ success: true, user });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.get("/api/users/:id/access", async (req, res) => {
  try {
    const targetId = String(req.params.id);
    if (req.user?.role !== "Owner" && String(req.user?.id) !== targetId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const target = await pgQuery(
      'SELECT id, role FROM users WHERE id = $1 LIMIT 1',
      [req.params.id]
    );
    if (!target.rows[0]) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const access = await getUserAccess(target.rows[0].id, target.rows[0].role);
    res.json({ success: true, modules: ACCESS_MODULES, access });
  } catch (e) {
    console.error("GET /api/users/:id/access:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put("/api/users/:id/access", requireRole("Owner"), async (req, res) => {
  try {
    const target = await pgQuery(
      'SELECT id, role FROM users WHERE id = $1 LIMIT 1',
      [req.params.id]
    );
    if (!target.rows[0]) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const access = await saveUserAccess(target.rows[0].id, req.body?.access || {});
    res.json({ success: true, access });
  } catch (e) {
    console.error("PUT /api/users/:id/access:", e);
    res.status(400).json({ success: false, error: e.message });
  }
});

app.delete("/api/users/:id", requireRole("Owner"), async (req, res) => {
  try { res.json({ success: await deleteUser(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== DRIVER DAILY KM STATUS =====
app.get("/api/driver/km-status", async (req, res) => {
  try {
    const status = await getDriverDailyKmStatus(req.user.id);
    res.json({ success: true, status });
  } catch (e) {
    console.error("[DriverKMStatus]", e);
    res.status(500).json({ success: false, error: e.message });
  }
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
const assertInventoryManager = async (req, res, id) => {
  const allowed = await db.canManageInventoryItem(req.user, id);
  if (!allowed) { res.status(403).json({ success: false, error: "You can view this stock, but you are not allowed to modify it." }); return false; }
  return true;
};

app.get("/api/inventory", async (req, res) => {
  try { res.json({ success: true, items: await listInventoryPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/inventory/report/by-site", async (req, res) => {
  try {
    const filters = { from: req.query.from, to: req.query.to, site: req.query.site };
    res.json({ success: true, ...(await db.getInventoryReportBySite(filters)) });
  } catch (e) {
    console.error("[Inventory:report-by-site]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});
app.get("/api/inventory/report/full", async (req, res) => {
  try {
    const filters = {
      from: req.query.from,
      to: req.query.to,
      site: req.query.site,
      vehicleId: req.query.vehicleId
    };
    res.json({ success: true, ...(await db.getInventoryReportFull(filters)) });
  } catch (e) {
    console.error("[Inventory:report-full]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/inventory/rebuild-stock", async (req, res) => {
  try {
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ success: false, error: "Owner only." });
    }
    const result = await db.rebuildWarehouseStock();
    res.json({ success: true, ...result });
  } catch (e) {
    console.error("[Inventory:rebuild]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/inventory/fix-locations", async (req, res) => {
  try {
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ success: false, error: "Owner only." });
    }
    const result = await db.fixStockLocations();
    res.json({ success: true, ...result });
  } catch (e) {
    console.error("[Inventory:fix-locations]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/inventory/set-stock", async (req, res) => {
  try {
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ success: false, error: "Owner only." });
    }
    const itemCode = String(req.body?.itemCode || "").trim();
    const quantities = req.body?.quantities || {};
    if (!itemCode) return res.status(400).json({ success: false, error: "itemCode is required" });
    const result = await db.setWarehouseStockManually(itemCode, quantities);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error("[Inventory:set-stock]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/inventory/warehouse-stock", async (req, res) => {
  try {
    const { query } = await import("./postgres.js");
    const r = await query("SELECT * FROM warehouse_stock ORDER BY item_code, location_code");
    res.json({ success: true, stock: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/inventory/sync-from-warehouse", async (req, res) => {
  try {
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ success: false, error: "Owner only." });
    }
    const result = await db.syncInventoryFromWarehouseStock();
    res.json({ success: true, ...result });
  } catch (e) {
    console.error("[Inventory:sync]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/inventory/by-site", async (req, res) => {
  try {
    const site = String(req.query.site || "").trim() || null;
    const result = await db.getInventoryBySite(site);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error("[Inventory:by-site]", e);
    res.status(500).json({ success: false, error: e.message });
  }
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
  try { res.json({ success: true, item: await createInventoryItemPG({ ...req.body, createdByUserId: req.user?.id ?? null }) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/inventory/:id", async (req, res) => {
  try { if (!(await assertInventoryManager(req,res,req.params.id))) return; res.json({ success: true, item: await updateInventoryItemPG(req.params.id, req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.delete("/api/inventory/:id", async (req, res) => {
  try {
    if (req.user?.role !== "Owner") {
      return res.status(403).json({
        success: false,
        error: "Only the Owner can permanently delete warehouse items."
      });
    }
    res.json({ success: true, ...(await deleteInventoryItemPG(req.params.id)) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/inventory/stock-in", async (req, res) => {
  try { if (!(await assertInventoryManager(req,res,req.body?.itemCode ?? req.body?.item_code ?? req.body?.id))) return; res.json({ success: true, transaction: await stockInPG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.post("/api/inventory/stock-out", async (req, res) => {
  try { if (!(await assertInventoryManager(req,res,req.body?.itemCode ?? req.body?.item_code ?? req.body?.id))) return; res.json({ success: true, transaction: await stockOutPG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.post("/api/inventory/transfer", async (req, res) => {
  try { if (!(await assertInventoryManager(req,res,req.body?.itemCode ?? req.body?.item_code ?? req.body?.id))) return; res.json({ success: true, transaction: await transferStockPG(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.put("/api/stock-transactions/:id", async (req, res) => {
  try {
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ success: false, error: "Owner only." });
    }
    const updated = await db.updateStockTransaction(req.params.id, req.body || {});
    res.json({ success: true, transaction: updated });
  } catch (e) {
    console.error("[StockTransaction:update]", e);
    res.status(400).json({ success: false, error: e.message });
  }
});

app.delete("/api/stock-transactions/:id", async (req, res) => {
  try {
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ success: false, error: "Only the Owner can delete stock transactions." });
    }
    res.json({ success: true, ...(await db.deleteStockTransaction(req.params.id)) });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.get("/api/stock-transactions", async (req, res) => {
  try { res.json({ success: true, transactions: await listStockTransactionsPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});


app.get("/api/vehicles/:id/inspection-reminder", async (req, res) => {
  try {
    const r = await pgQuery(`
      SELECT id, plate_number, plate_code, driver, location,
             inspection_expiry_date::text AS inspection_expiry_date, inspection_reminder_days,
             inspection_manager_email, inspection_cc_emails,
             inspection_last_email_sent_at, inspection_last_email_key
      FROM vehicles WHERE id=$1
    `, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({success:false,error:"Vehicle not found"});
    const row = r.rows[0];
    const defaults = annualInspectionRecipients(row.location);
    res.json({success:true, reminder:{
      ...row,
      inspection_manager_email: row.inspection_manager_email || defaults.managerEmail,
      inspection_cc_emails: row.inspection_cc_emails || defaults.ccEmails
    }});
  } catch(e) { res.status(500).json({success:false,error:e.message}); }
});

app.put("/api/vehicles/:id/inspection-reminder", async (req, res) => {
  try {
    const expiry = String(req.body.inspectionExpiryDate || '').trim() || null;
    const days = Math.max(1, Math.min(180, Number(req.body.reminderDays || 30)));
    const manager = String(req.body.managerEmail || '').trim();
    const cc = String(req.body.ccEmails || '').trim();
    const r = await pgQuery(`
      UPDATE vehicles
      SET inspection_expiry_date=$1,
          inspection_reminder_days=$2,
          inspection_manager_email=$3,
          inspection_cc_emails=$4,
          inspection_last_email_key=NULL
      WHERE id=$5
      RETURNING id, plate_number, plate_code, driver, location,
                inspection_expiry_date, inspection_reminder_days,
                inspection_manager_email, inspection_cc_emails,
                inspection_last_email_sent_at, inspection_last_email_key
    `, [expiry, days, manager || null, cc || null, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({success:false,error:"Vehicle not found"});
    res.json({success:true, reminder:r.rows[0]});
  } catch(e) { res.status(400).json({success:false,error:e.message}); }
});

app.post("/api/vehicles/:id/inspection-reminder/test", async (req, res) => {
  try {
    const r=await pgQuery(`
      SELECT id, plate_number, plate_code, driver, location,
             inspection_expiry_date, inspection_reminder_days,
             inspection_manager_email, inspection_cc_emails
      FROM vehicles WHERE id=$1
    `, [req.params.id]);
    if(!r.rows[0]) return res.status(404).json({success:false,error:"Vehicle not found"});
    const result=await sendAnnualInspectionReminderEmail(r.rows[0]);
    if(!result.sent) return res.status(400).json({success:false,error:result.reason});
    res.json({success:true,...result});
  } catch(e) { res.status(500).json({success:false,error:e.message}); }
});

// Normalize PostgreSQL DATE values. node-postgres may return a DATE as a JS Date,
// so String(date).slice(0,10) can become "Fri Dec 18" and break the reminder math.
const inspectionExpiryKey = (value) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  const iso = raw.match(/(\\d{4}-\\d{2}-\\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

app.get("/api/inspection-reminders/status", async (req,res) => {
  try { res.json({success:true, ...(await processAnnualInspectionReminders()), configured:!!process.env.RESEND_API_KEY && !!(process.env.INSPECTION_EMAIL_FROM || process.env.EMAIL_FROM)}); }
  catch(e) { res.status(500).json({success:false,error:e.message}); }
});
app.get("/api/inspection-reminders/due", async (req, res) => {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const r = await pgQuery(`
      SELECT id, plate_number, plate_code, driver, location, inspection_expiry_date::text AS inspection_expiry_date
      FROM vehicles
      WHERE inspection_expiry_date IS NOT NULL
        AND COALESCE(LOWER(TRIM(status)), '') NOT IN ('inactive','sold','disposed','disabled')
      ORDER BY inspection_expiry_date ASC, plate_number ASC
    `);
    const vehicles = r.rows.map(row => {
      const expiry = String(row.inspection_expiry_date).slice(0, 10);
      const days = Math.ceil((new Date(expiry + 'T00:00:00Z') - new Date(todayKey + 'T00:00:00Z')) / 86400000);
      return {
        id: row.id,
        plate: [row.plate_number, row.plate_code].filter(Boolean).join(' ').trim(),
        driver: row.driver || 'Unassigned',
        location: canonicalInspectionSite(row.location) || '-',
        expiry,
        days,
        emailEligible: days <= 31,
        managerEmail: annualInspectionRecipients(row.location).managerEmail,
        ccEmails: annualInspectionRecipients(row.location).ccEmails
          .split(',').map(e => e.trim()).filter(Boolean)
      };
    });
    vehicles.sort((a, b) => a.days - b.days || a.plate.localeCompare(b.plate));
    res.json({ success: true, today: todayKey, windowDays: 31, vehicles });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== INSPECTION TRACKER (expiring + expired) =====
// Returns vehicles grouped by inspection status: expired, expiring within 60 days, valid
app.get("/api/vehicles/inspection/tracker", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = new Date(todayKey + 'T00:00:00Z');
    const sixtyDaysLater = new Date(today.getTime() + 60 * 86400000);

    const r = await pgQuery(`
      SELECT id, plate_number, plate_code, driver, phone, location,
             current_km, make, model, year,
             inspection_last_date, inspection_due_date, inspection_expiry_date,
             status
      FROM vehicles
      WHERE COALESCE(LOWER(TRIM(status)), '') NOT IN ('inactive','sold','disposed','disabled')
        AND inspection_expiry_date IS NOT NULL
        AND TRIM(inspection_expiry_date) != ''
      ORDER BY inspection_expiry_date ASC, plate_number ASC
    `);

    const expired = [];
    const expiring = [];
    const valid = [];

    for (const row of r.rows) {
      const expiryStr = String(row.inspection_expiry_date).slice(0, 10);
      const expiryDate = new Date(expiryStr + 'T00:00:00Z');
      const daysRemaining = Math.ceil((expiryDate - today) / 86400000);

      const vehicle = {
        id: row.id,
        plate_number: row.plate_number,
        plate_code: row.plate_code,
        plate: [row.plate_number, row.plate_code].filter(Boolean).join(' ').trim(),
        driver: row.driver || 'Unassigned',
        phone: row.phone || '',
        location: canonicalInspectionSite(row.location) || '-',
        current_km: row.current_km || 0,
        make: row.make || '',
        model: row.model || '',
        year: row.year || null,
        inspection_last_date: row.inspection_last_date || null,
        inspection_expiry_date: expiryStr,
        days_remaining: daysRemaining,
        status: daysRemaining < 0 ? 'expired' : daysRemaining <= 60 ? 'expiring' : 'valid'
      };

      if (daysRemaining < 0) {
        expired.push(vehicle);
      } else if (daysRemaining <= 60) {
        expiring.push(vehicle);
      } else {
        valid.push(vehicle);
      }
    }

    res.json({
      success: true,
      today: todayKey,
      summary: {
        total: expired.length + expiring.length + valid.length,
        expired: expired.length,
        expiring: expiring.length,
        valid: valid.length
      },
      expired,
      expiring,
      valid
    });
  } catch (e) {
    console.error("[InspectionTracker]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== ANNUAL INSPECTION — WhatsApp REMINDERS for vehicles due within 30 days =====
app.post("/api/annual-inspection/remind", async (req, res) => {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = new Date(todayKey + 'T00:00:00Z');

    const r = await pgQuery(`
      SELECT id, plate_number, plate_code, driver, phone, location,
             inspection_expiry_date, inspection_last_date,
             current_km, make, model
      FROM vehicles
      WHERE COALESCE(LOWER(TRIM(status)), '') NOT IN ('inactive','sold','disposed','disabled')
        AND inspection_expiry_date IS NOT NULL
        AND TRIM(inspection_expiry_date) != ''
      ORDER BY inspection_expiry_date ASC
    `);

    const reminders = [];
    for (const row of r.rows) {
      const expiryStr = String(row.inspection_expiry_date).slice(0, 10);
      const expiryDate = new Date(expiryStr + 'T00:00:00Z');
      const daysRemaining = Math.ceil((expiryDate - today) / 86400000);

      if (daysRemaining <= 30) {
        const plate = [row.plate_number, row.plate_code].filter(Boolean).join(' ').trim();
        let phone = String(row.phone || '').replace(/[^0-9]/g, '');
        if (phone.startsWith('00')) phone = phone.slice(2);
        if (phone.length === 10 && phone.startsWith('05')) phone = '966' + phone.slice(1);
        if (phone.length === 9 && phone.startsWith('5')) phone = '966' + phone;

        const message = [
          'Hello ' + (row.driver || 'Driver') + ',',
          '',
          'Vehicle ' + plate + ' — Annual Inspection Reminder',
          'تذكير: الفحص الدوري السنوي للمركبة ' + plate,
          '',
          'Inspection expires on: ' + expiryStr,
          'تاريخ انتهاء الفحص: ' + expiryStr,
          'Days remaining: ' + daysRemaining,
          'الأيام المتبقية: ' + daysRemaining,
          '',
          daysRemaining < 0
            ? 'Your inspection has EXPIRED. Please schedule immediately.'
            : 'Please schedule your annual inspection before the expiry date.',
          '',
          'Fleet Management'
        ].join('\n');

        reminders.push({
          vehicleId: row.id,
          plate,
          driver: row.driver || 'Unassigned',
          phone,
          location: canonicalInspectionSite(row.location) || '-',
          inspection_expiry_date: expiryStr,
          days_remaining: daysRemaining,
          status: daysRemaining < 0 ? 'expired' : 'due',
          whatsappUrl: phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message) : null
        });
      }
    }

    res.json({
      success: true,
      today: todayKey,
      total: reminders.length,
      expired: reminders.filter(r => r.days_remaining < 0).length,
      due: reminders.filter(r => r.days_remaining >= 0).length,
      reminders
    });
  } catch (e) {
    console.error("[AnnualInspectionRemind]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== ANNUAL INSPECTION — comprehensive status (JOIN vehicles + tickets) =====
app.post("/api/annual-inspection/status", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = new Date(todayKey + 'T00:00:00Z');

    // Get ALL annual inspection records with vehicle info (JOIN)
    const pmRes = await pgQuery(`
      SELECT pm.id, pm.vehicle_id, pm.status, pm.completed_date::text AS completed_date,
             pm.scheduled_date::text AS scheduled_date, pm.notes,
             v.plate_number, v.plate_code, v.driver, v.phone, v.location,
             v.current_km, v.make, v.model, v.status AS vehicle_status,
             v.inspection_last_date, v.inspection_expiry_date
      FROM periodic_maintenance pm
      LEFT JOIN vehicles v ON v.id = pm.vehicle_id
      WHERE pm.type = 'inspection'
      ORDER BY pm.completed_date DESC NULLS LAST
    `);

    // Get WhatsApp confirmations from ALL tickets for each vehicle
    const waRes = await pgQuery(`
      SELECT t.vehicle_id, MAX(t.whatsapp_confirmed_at::text) AS whatsapp_confirmed_at
      FROM tickets t
      WHERE t.whatsapp_confirmed_at IS NOT NULL
      GROUP BY t.vehicle_id
    `);
    const waMap = new Map();
    for (const row of waRes.rows) {
      const parsed = new Date(row.whatsapp_confirmed_at);
      if (!Number.isNaN(parsed.getTime())) waMap.set(String(row.vehicle_id), parsed.toISOString().slice(0, 10));
    }

    // Group by vehicle — keep latest completed
    const latestByVehicle = new Map();
    for (const row of pmRes.rows) {
      if (!row.vehicle_id) continue;
      const vid = String(row.vehicle_id);
      if (!latestByVehicle.has(vid)) {
        latestByVehicle.set(vid, row);
      } else {
        const existing = latestByVehicle.get(vid);
        const existingDate = existing.completed_date || existing.scheduled_date || '';
        const rowDate = row.completed_date || row.scheduled_date || '';
        if (rowDate > existingDate) latestByVehicle.set(vid, row);
      }
    }

    // Also get vehicles with NO pm record but have inspection data in vehicles table
    const allVehiclesRes = await pgQuery(`
      SELECT id, plate_number, plate_code, driver, phone, location,
             inspection_last_date, inspection_expiry_date
      FROM vehicles
      WHERE COALESCE(LOWER(TRIM(status)), '') NOT IN ('inactive','sold','disposed','disabled')
      ORDER BY plate_number ASC
    `);

    // Add vehicles not in latestByVehicle but have inspection data
    for (const v of allVehiclesRes.rows) {
      const vid = String(v.id);
      if (latestByVehicle.has(vid)) continue;
      if (v.inspection_last_date || v.inspection_expiry_date) {
        latestByVehicle.set(vid, {
          id: null, vehicle_id: v.id, status: 'Completed',
          completed_date: v.inspection_last_date || null,
          scheduled_date: null, notes: '',
          plate_number: v.plate_number, plate_code: v.plate_code,
          driver: v.driver, phone: v.phone, location: v.location,
          vehicle_status: 'Active',
          inspection_last_date: v.inspection_last_date,
          inspection_expiry_date: v.inspection_expiry_date
        });
      }
    }

    const completed = [];
    const approaching = [];
    const due = [];

    for (const [vid, rec] of latestByVehicle) {
      if (!rec.vehicle_status || ['inactive','sold','disposed','disabled'].includes(rec.vehicle_status.toLowerCase().trim())) continue;

      const plate = [rec.plate_number, rec.plate_code].filter(Boolean).join(' ').trim();

      // Get completion date — try pm first, then vehicles table
      let completedDate = null;
      if (rec.completed_date) {
        const parsed = new Date(rec.completed_date);
        if (!Number.isNaN(parsed.getTime())) completedDate = parsed.toISOString().slice(0, 10);
      }
      if (!completedDate && rec.inspection_last_date) {
        const parsed = new Date(rec.inspection_last_date);
        if (!Number.isNaN(parsed.getTime())) completedDate = parsed.toISOString().slice(0, 10);
      }
      if (!completedDate && rec.inspection_expiry_date) {
        // Calculate from expiry (expiry - 1 year = completion)
        const parsed = new Date(rec.inspection_expiry_date);
        if (!Number.isNaN(parsed.getTime())) {
          const d = new Date(parsed);
          d.setUTCFullYear(d.getUTCFullYear() - 1);
          completedDate = d.toISOString().slice(0, 10);
        }
      }

      if (completedDate) {
        const d = new Date(completedDate + 'T00:00:00Z');
        d.setUTCFullYear(d.getUTCFullYear() + 1);
        const nextDue = d.toISOString().slice(0, 10);
        const daysRemaining = Math.ceil((d - today) / 86400000);
        const waConfirmed = waMap.get(vid) || null;

        const entry = {
          recordId: rec.id, vehicleId: vid, plate,
          driver: rec.driver || 'Unassigned', phone: rec.phone || '',
          location: canonicalInspectionSite(rec.location) || '-',
          completed_date: completedDate, next_due_date: nextDue,
          days_remaining: daysRemaining, whatsapp_confirmed_at: waConfirmed,
          notes: rec.notes || ''
        };

        if (daysRemaining <= 30) {
          entry.status = daysRemaining < 0 ? 'expired' : 'due';
          let phone = String(rec.phone || '').replace(/[^0-9]/g, '');
          if (phone.startsWith('00')) phone = phone.slice(2);
          if (phone.length === 10 && phone.startsWith('05')) phone = '966' + phone.slice(1);
          if (phone.length === 9 && phone.startsWith('5')) phone = '966' + phone;
          entry.whatsappUrl = phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(
            'Hello ' + (rec.driver || 'Driver') + ',\n\nVehicle ' + plate + ' — Annual Inspection Reminder\nتذكير: الفحص الدوري السنوي للمركبة ' + plate + '\n\nExpires: ' + nextDue + '\nDays: ' + daysRemaining + '\n\nFleet Management'
          ) : null;
          due.push(entry);
        } else if (daysRemaining <= 60) {
          entry.status = 'approaching';
          approaching.push(entry);
        } else {
          entry.status = 'valid';
          completed.push(entry);
        }
      }
    }

    res.json({
      success: true, today: todayKey,
      summary: {
        completed: completed.length,
        approaching: approaching.length,
        due: due.filter(d => d.status === 'due').length,
        expired: due.filter(d => d.status === 'expired').length,
        total: completed.length + approaching.length + due.length
      },
      completed, approaching, due
    });
  } catch (e) {
    console.error("[AnnualInspectionStatus]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== 6-MONTH INSPECTION — status + WhatsApp reminders =====
app.post("/api/six-month-inspection/status", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = new Date(todayKey + 'T00:00:00Z');

    // Get all 6-month maintenance records
    const pmRes = await pgQuery(`
      SELECT pm.id, pm.vehicle_id, pm.type, pm.status,
             pm.completed_date::text AS completed_date,
             pm.scheduled_date::text AS scheduled_date,
             pm.notes,
             pm.whatsapp_confirmed_at::text AS whatsapp_confirmed_at,
             v.plate_number, v.plate_code, v.driver, v.phone, v.location,
             v.current_km, v.make, v.model, v.status AS vehicle_status
      FROM periodic_maintenance pm
      LEFT JOIN vehicles v ON v.id = pm.vehicle_id
      WHERE pm.type = '6_months_general'
      ORDER BY pm.completed_date DESC NULLS LAST
    `);

    // Get all active vehicles (to find vehicles with NO 6-month record)
    const vehiclesRes = await pgQuery(`
      SELECT id, plate_number, plate_code, driver, phone, location, current_km
      FROM vehicles
      WHERE COALESCE(LOWER(TRIM(status)), '') NOT IN ('inactive','sold','disposed','disabled')
      ORDER BY plate_number ASC
    `);

    // Group 6-month records by vehicle_id — keep latest completed
    const latestByVehicle = new Map();
    for (const row of pmRes.rows) {
      const vid = String(row.vehicle_id);
      if (!latestByVehicle.has(vid)) {
        latestByVehicle.set(vid, row);
      } else {
        const existing = latestByVehicle.get(vid);
        const existingDate = String(existing.completed_date || existing.scheduled_date || '').slice(0, 10);
        const rowDate = String(row.completed_date || row.scheduled_date || '').slice(0, 10);
        if (rowDate > existingDate) {
          latestByVehicle.set(vid, row);
        }
      }
    }

    const completed = [];
    const approaching = [];
    const due = [];

    // Get WhatsApp confirmations from ALL tickets (not just 6-Month)
    const whatsappRes = await pgQuery(`
      SELECT t.vehicle_id, MAX(t.whatsapp_confirmed_at::text) AS whatsapp_confirmed_at
      FROM tickets t
      WHERE t.whatsapp_confirmed_at IS NOT NULL
      GROUP BY t.vehicle_id
    `);
    const whatsappMap = new Map();
    for (const row of whatsappRes.rows) {
      whatsappMap.set(String(row.vehicle_id), String(row.whatsapp_confirmed_at).slice(0, 10));
    }

    // Process vehicles with completed 6-month records
    for (const [vid, rec] of latestByVehicle) {
      if (!rec.vehicle_status || ['inactive','sold','disposed','disabled'].includes(rec.vehicle_status.toLowerCase().trim())) continue;

      const plate = [rec.plate_number, rec.plate_code].filter(Boolean).join(' ').trim();
      // Parse completed_date safely — handles Date objects, strings, null
      let completedDate = null;
      if (rec.completed_date) {
        const parsed = new Date(rec.completed_date);
        if (!Number.isNaN(parsed.getTime())) completedDate = parsed.toISOString().slice(0, 10);
      }

      if (completedDate && rec.status === 'Completed') {
        // Calculate next due = completed + 6 months
        const d = new Date(completedDate + 'T00:00:00Z');
        if (Number.isNaN(d.getTime())) continue;
        d.setUTCMonth(d.getUTCMonth() + 6);
        const nextDue = d.toISOString().slice(0, 10);
        const daysRemaining = Math.ceil((d - today) / 86400000);

        const entry = {
          recordId: rec.id,
          vehicleId: vid,
          plate,
          driver: rec.driver || 'Unassigned',
          phone: rec.phone || '',
          location: canonicalInspectionSite(rec.location) || '-',
          completed_date: completedDate,
          next_due_date: nextDue,
          days_remaining: daysRemaining,
          whatsapp_confirmed_at: whatsappMap.get(vid) || (rec.whatsapp_confirmed_at ? String(rec.whatsapp_confirmed_at).slice(0, 10) : null),
          notes: rec.notes || ''
        };

        if (daysRemaining <= 30) {
          // Due within 30 days or expired
          let phone = String(rec.phone || '').replace(/[^0-9]/g, '');
          if (phone.startsWith('00')) phone = phone.slice(2);
          if (phone.length === 10 && phone.startsWith('05')) phone = '966' + phone.slice(1);
          if (phone.length === 9 && phone.startsWith('5')) phone = '966' + phone;
          entry.status = daysRemaining < 0 ? 'expired' : 'due';
          entry.whatsappUrl = phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(
            'Hello ' + (rec.driver || 'Driver') + ',\n\n' +
            'Vehicle ' + plate + ' — 6-Month Maintenance Due\n' +
            'تذكير: صيانة الـ 6 أشهر للمركبة ' + plate + '\n\n' +
            'Last completed: ' + completedDate + '\n' +
            'Next due: ' + nextDue + '\n' +
            'Days remaining: ' + daysRemaining + '\n\n' +
            'Please schedule your 6-month maintenance.\n\n' +
            'Fleet Management'
          ) : null;
          due.push(entry);
        } else if (daysRemaining <= 60) {
          entry.status = 'approaching';
          approaching.push(entry);
        } else {
          entry.status = 'valid';
          completed.push(entry);
        }
      }
    }

    // Process vehicles with NO 6-month record
    // Check if they have ANNUAL inspection — if so, annual covers 6-month too
    for (const v of vehiclesRes.rows) {
      if (latestByVehicle.has(String(v.id))) continue; // has a 6-month record already
      const plate = [v.plate_number, v.plate_code].filter(Boolean).join(' ').trim();
      let phone = String(v.phone || '').replace(/[^0-9]/g, '');
      if (phone.startsWith('00')) phone = phone.slice(2);
      if (phone.length === 10 && phone.startsWith('05')) phone = '966' + phone.slice(1);
      if (phone.length === 9 && phone.startsWith('5')) phone = '966' + phone;

      // Check if this vehicle has a completed ANNUAL inspection (pm + vehicles table)
      const annualCheck = await pgQuery(`
        SELECT pm.completed_date::text AS pm_completed,
               v.inspection_last_date AS v_last,
               v.inspection_expiry_date AS v_expiry
        FROM vehicles v
        LEFT JOIN LATERAL (
          SELECT completed_date::text FROM periodic_maintenance
          WHERE vehicle_id = v.id AND type = 'inspection' AND status = 'Completed'
            AND completed_date IS NOT NULL
          ORDER BY completed_date DESC LIMIT 1
        ) pm ON true
        WHERE v.id = $1 LIMIT 1
      `, [v.id]);

      let annualDate = null;
      if (annualCheck.rows[0]?.pm_completed) {
        const parsed = new Date(annualCheck.rows[0].pm_completed);
        if (!Number.isNaN(parsed.getTime())) annualDate = parsed.toISOString().slice(0, 10);
      }
      if (!annualDate && annualCheck.rows[0]?.v_last) {
        const parsed = new Date(annualCheck.rows[0].v_last);
        if (!Number.isNaN(parsed.getTime())) annualDate = parsed.toISOString().slice(0, 10);
      }
      if (!annualDate && annualCheck.rows[0]?.v_expiry) {
        const parsed = new Date(annualCheck.rows[0].v_expiry);
        if (!Number.isNaN(parsed.getTime())) {
          const d = new Date(parsed);
          d.setUTCFullYear(d.getUTCFullYear() - 1);
          annualDate = d.toISOString().slice(0, 10);
        }
      }

      if (annualDate) {
        // Annual inspection covers 6-month — treat as completed
        const d = new Date(annualDate + 'T00:00:00Z');
        d.setUTCMonth(d.getUTCMonth() + 6);
        const nextDue = d.toISOString().slice(0, 10);
        const daysRemaining = Math.ceil((d - today) / 86400000);
        const waConfirmed = whatsappMap.get(String(v.id)) || null;

        const entry = {
          recordId: null,
          vehicleId: v.id,
          plate,
          driver: v.driver || 'Unassigned',
          phone,
          location: canonicalInspectionSite(v.location) || '-',
          completed_date: annualDate + ' (Annual)',
          next_due_date: nextDue,
          days_remaining: daysRemaining,
          whatsapp_confirmed_at: waConfirmed,
          notes: 'Covered by annual inspection',
          status: daysRemaining < 0 ? 'expired' : daysRemaining <= 30 ? 'due' : daysRemaining <= 60 ? 'approaching' : 'valid'
        };

        if (entry.status === 'valid') {
          completed.push(entry);
        } else if (entry.status === 'approaching') {
          approaching.push(entry);
        } else {
          entry.whatsappUrl = phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(
            'Hello ' + (v.driver || 'Driver') + ',\n\n' +
            'Vehicle ' + plate + ' — 6-Month Maintenance Due\n' +
            'تذكير: صيانة الـ 6 أشهر للمركبة ' + plate + '\n\n' +
            'Last completed (annual): ' + annualDate + '\n' +
            'Next due: ' + nextDue + '\n' +
            'Days remaining: ' + daysRemaining + '\n\n' +
            'Please schedule your 6-month maintenance.\n\n' +
            'Fleet Management'
          ) : null;
          due.push(entry);
        }
      } else {
        // No annual inspection either → genuinely not inspected
        due.push({
          recordId: null,
          vehicleId: v.id,
          plate,
          driver: v.driver || 'Unassigned',
          phone,
          location: canonicalInspectionSite(v.location) || '-',
          completed_date: null,
          next_due_date: '—',
          days_remaining: -999,
          whatsapp_confirmed_at: null,
          status: 'not_inspected',
          whatsappUrl: phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(
          'Hello ' + (v.driver || 'Driver') + ',\n\n' +
          'Vehicle ' + plate + ' — 6-Month Maintenance Required\n' +
          'مطلوب: صيانة الـ 6 أشهر للمركبة ' + plate + '\n\n' +
          'No 6-month maintenance record found.\n' +
          'Please schedule your 6-month maintenance.\n\n' +
          'Fleet Management'
        ) : null
      });
      }
    }

    res.json({
      success: true,
      today: todayKey,
      summary: {
        completed: completed.length,
        approaching: approaching.length,
        due: due.filter(d => d.status === 'due').length,
        expired: due.filter(d => d.status === 'expired').length,
        not_inspected: due.filter(d => d.status === 'not_inspected').length,
        total: completed.length + approaching.length + due.length
      },
      completed, approaching, due
    });
  } catch (e) {
    console.error("[SixMonthInspection]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/inspection-reminders/send", requireRole("Owner"), async (req, res) => {
  try {
    const mode = String(req.body?.mode || 'all').toLowerCase();
    const requestedSites = Array.isArray(req.body?.sites) ? req.body.sites.map(v => String(v || '').trim()).filter(Boolean) : [];
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);

    const r = await pgQuery(`
      SELECT id, plate_number, plate_code, driver, location,
             inspection_expiry_date, inspection_reminder_days,
             inspection_manager_email, inspection_cc_emails,
             inspection_last_email_sent_at, inspection_last_email_key
      FROM vehicles
      WHERE inspection_expiry_date IS NOT NULL
        AND COALESCE(LOWER(TRIM(status)), '') NOT IN ('inactive','sold','disposed','disabled')
    `);
    const canonicalSites = Object.keys(ANNUAL_INSPECTION_SITE_CONTACTS);
    const selectedSites = mode === 'sites'
      ? canonicalSites.filter(site => requestedSites.some(s => s.toLowerCase() === site.toLowerCase()))
      : canonicalSites;

    const due = r.rows.filter(row => {
      const expiry = String(row.inspection_expiry_date).slice(0, 10);
      const days = Math.ceil((new Date(expiry + 'T00:00:00Z') - new Date(todayKey + 'T00:00:00Z')) / 86400000);
      const site = canonicalInspectionSite(row.location);
      // Manual email queue is strictly the next 31 days (including expired).
      return days <= 31 && selectedSites.some(s => s.toLowerCase() === site.toLowerCase());
    });

    const bySite = {};
    for (const row of due) {
      const site = canonicalInspectionSite(row.location) || 'Unknown Site';
      if (!bySite[site]) bySite[site] = [];
      bySite[site].push(row);
    }

    const results = [];
    for (const [site, rows] of Object.entries(bySite)) {
      const first = rows[0];
      const defaults = annualInspectionRecipients(site);
      const to = splitEmails(first.inspection_manager_email || defaults.managerEmail);
      const cc = splitEmails(first.inspection_cc_emails || defaults.ccEmails).filter(e => !to.includes(e));
      if (!to.length) {
        results.push({ site, vehicles: rows.length, sent: false, reason: 'No site manager email configured.' });
        continue;
      }

      const items = rows.map(row => {
        const expiry = String(row.inspection_expiry_date).slice(0, 10);
        const days = Math.ceil((new Date(expiry + 'T00:00:00Z') - new Date(todayKey + 'T00:00:00Z')) / 86400000);
        const plate = [row.plate_number, row.plate_code].filter(Boolean).join(' ').trim();
        return { row, expiry, days, plate };
      });
      const hasExpired = items.some(x => x.days < 0);
      const subject = hasExpired
        ? 'URGENT: Annual Vehicle Inspections Due — ' + site
        : 'Annual Vehicle Inspections Due Soon — ' + site;
      const textBody = [
        'Dear Site Manager,',
        '',
        'Please arrange the annual periodic inspection for the following vehicles:',
        '',
        ...items.map((x, idx) => (idx + 1) + '. Vehicle: ' + x.plate + ' | Driver: ' + (x.row.driver || 'Unassigned') + ' | Expiry: ' + x.expiry + ' | Days remaining: ' + x.days),
        '',
        'Please arrange the inspection appointments before the current inspections expire.',
        '',
        'Site: ' + site,
        'Fleet Management'
      ].join('\n');

      const apiKey = String(process.env.RESEND_API_KEY || '').trim();
      const from = String(process.env.INSPECTION_EMAIL_FROM || process.env.EMAIL_FROM || ANNUAL_INSPECTION_EMAIL_FROM).trim();
      if (!apiKey || !from) {
        results.push({ site, vehicles: rows.length, sent: false, reason: 'Email provider is not configured.' });
        continue;
      }
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to, cc, subject, text: textBody })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || data?.error || 'Email provider returned HTTP ' + response.status);
        for (const x of items) {
          const key = x.expiry + ':' + Number(x.row.inspection_reminder_days || 30);
          await pgQuery(`UPDATE vehicles SET inspection_last_email_sent_at=CURRENT_TIMESTAMP, inspection_last_email_key=$1 WHERE id=$2`, [key, x.row.id]);
        }
        results.push({ site, vehicles: rows.length, sent: true, id: data?.id || null });
      } catch (e) {
        results.push({ site, vehicles: rows.length, sent: false, reason: e.message });
      }
    }

    res.json({ success: true, mode, selectedSites, dueVehicles: due.length, results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
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

app.post("/api/periodic-maintenance/auto-close-annual-covered", async (req, res) => {
  try {
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ success: false, error: "Owner only." });
    }
    const result = await db.autoCloseSixMonthCoveredByAnnual();
    res.json({ success: true, ...result });
  } catch (e) {
    console.error("[AutoCloseAnnual]", e);
    res.status(500).json({ success: false, error: e.message });
  }
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

app.put("/api/periodic-maintenance/:id/reopen", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: "Invalid maintenance record." });

    const result = await pgQuery(
      `SELECT id, vehicle_id, type, status
       FROM periodic_maintenance
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ success: false, error: "Periodic maintenance not found." });
    if (String(row.type || "").toLowerCase() !== "inspection") {
      return res.status(400).json({ success: false, error: "Only annual inspection records can be reopened here." });
    }

    // Return this inspection to the same Pending / Not Inspected queue.
    // Clear the old completion evidence so it cannot remain a completed ticket.
    await pgQuery(
      `UPDATE periodic_maintenance
       SET status = 'Pending',
           completed_date = NULL,
           whatsapp_confirmed_at = NULL,
           whatsapp_confirmation_source = 'Fleet Management - Reopened'
       WHERE id = $1`,
      [id]
    );

    // Rebuild the vehicle's latest inspection dates from the newest OTHER
    // completed annual inspection. The reopened/incorrect completion must
    // never remain as the vehicle's latest inspection date.
    const latest = await pgQuery(
      `SELECT completed_date
       FROM periodic_maintenance
       WHERE vehicle_id = $1
         AND type = 'inspection'
         AND status = 'Completed'
         AND completed_date IS NOT NULL
         AND id <> $2
       ORDER BY completed_date DESC, id DESC
       LIMIT 1`,
      [row.vehicle_id, id]
    );
    const latestDate = latest.rows[0]?.completed_date || null;

    await pgQuery(
      `UPDATE vehicles
       SET inspection_last_date = $1::date,
           inspection_due_date = CASE
             WHEN $1::date IS NULL THEN NULL
             ELSE ($1::date + INTERVAL '365 days')::date
           END
       WHERE id = $2`,
      [latestDate, row.vehicle_id]
    );

    res.json({
      success: true,
      message: "Annual inspection reopened and returned to the Not Inspected queue.",
      vehicleId: row.vehicle_id,
      recordId: id,
      latestCompletedDate: latestDate
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post("/api/periodic-maintenance/whatsapp-confirmation", async (req, res) => {
  try {
    const vehicleId = Number(req.body?.vehicleId);
    const type = String(req.body?.type || "inspection").trim();
    if (!vehicleId || type !== "inspection") {
      return res.status(400).json({ success: false, error: "Invalid inspection confirmation request." });
    }

    let result = await pgQuery(
      `SELECT id, vehicle_id, type, status, plate_number, plate_code, driver
       FROM periodic_maintenance pm
       LEFT JOIN vehicles v ON v.id = pm.vehicle_id
       WHERE pm.vehicle_id = $1 AND pm.type = 'inspection'
       ORDER BY CASE WHEN pm.status = 'Pending' THEN 0 ELSE 1 END, pm.id DESC
       LIMIT 1`,
      [vehicleId]
    );
    let record = result.rows[0];

    if (!record) {
      result = await pgQuery(
        `INSERT INTO periodic_maintenance
          (vehicle_id, type, scheduled_date, status, technician, notes)
         VALUES ($1, 'inspection', CURRENT_DATE, 'Pending', '', '')
         RETURNING id, vehicle_id, type, status`,
        [vehicleId]
      );
      record = result.rows[0];
    }

    if (String(record.status).toLowerCase() === "completed") {
      return res.json({ success: true, alreadyCompleted: true });
    }

    const token = randomUUID();
    const updated = await pgQuery(
      `UPDATE periodic_maintenance
       SET whatsapp_confirmation_token = $1,
           whatsapp_confirmed_at = NULL,
           whatsapp_confirmation_source = NULL
       WHERE id = $2
       RETURNING id`,
      [token, record.id]
    );

    const baseUrl = String(process.env.PUBLIC_APP_URL || "https://fleet-erp-kn0c.onrender.com").replace(/\/$/, "");
    res.json({
      success: true,
      confirmationUrl: baseUrl + "/inspection-confirm/" + token,
      recordId: updated.rows[0]?.id
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/inspection-confirm/:token", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    const token = String(req.params.token || "").trim();
    const result = await pgQuery(
      `SELECT pm.id, pm.status, pm.completed_date, v.plate_number, v.plate_code, v.driver, pm.type
       FROM periodic_maintenance pm
       LEFT JOIN vehicles v ON v.id = pm.vehicle_id
       WHERE pm.whatsapp_confirmation_token = $1
       LIMIT 1`,
      [token]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).send("<h2>Inspection confirmation link is invalid or expired.</h2>");
    const vehicle = [row.plate_number, row.plate_code].filter(Boolean).join(" ");
    const safeVehicle = String(vehicle || "").replace(/[<>&]/g, "");
    const safeDriver = String(row.driver || "Driver").replace(/[<>&]/g, "");
    if (String(row.status).toLowerCase() === "completed") {
      return res.send("<!doctype html><html><body style='font-family:Arial;padding:30px;text-align:center'><h2>Inspection Already Completed</h2><p>Vehicle <strong>" + safeVehicle + "</strong> is already recorded as completed.</p><p>Completed date: " + (row.completed_date || "-") + "</p></body></html>");
    }
    res.send("<!doctype html><html><head><meta name='robots' content='noindex,nofollow'><meta http-equiv='Cache-Control' content='no-store'><meta http-equiv='Pragma' content='no-cache'></head><body style='font-family:Arial;max-width:620px;margin:50px auto;padding:24px;text-align:center'>" +
      "<h2>Annual Vehicle Inspection</h2>" +
      "<p>Vehicle <strong>" + safeVehicle + "</strong></p>" +
      "<p>Hello " + safeDriver + ",</p>" +
      "<p>Have you completed the annual inspection?</p>" +
      "<div style='display:flex;gap:12px;justify-content:center;flex-wrap:wrap'>" +
      "<form method='POST' action='/inspection-confirm/" + token + "?decision=yes'><button type='submit' style='padding:14px 28px;background:#16a34a;color:white;border:0;border-radius:8px;font-size:16px;cursor:pointer'>YES — Inspection Completed</button></form>" +
      "<form method='POST' action='/inspection-confirm/" + token + "?decision=no'><button type='submit' style='padding:14px 28px;background:#dc2626;color:white;border:0;border-radius:8px;font-size:16px;cursor:pointer'>NO — Not Completed</button></form>" +
      "</div>" +
      "<script>(function(){window.addEventListener('pageshow',function(e){if(e.persisted){fetch(window.location.href,{cache:'no-store',credentials:'same-origin'}).then(function(r){if(r.status===404)window.location.replace('/inspection-confirm-invalid');});}});})();</script>" +
      "</body></html>");
  } catch (e) {
    res.status(500).send("<h2>Unable to load inspection confirmation.</h2>");
  }
});

app.get("/inspection-confirm-invalid", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.status(410).send("<!doctype html><html><body style='font-family:Arial;max-width:620px;margin:50px auto;padding:24px;text-align:center'><h2>Inspection Link Expired</h2><p>This WhatsApp inspection confirmation link has already been used.</p><p>Please use the latest WhatsApp message from Fleet Management.</p></body></html>");
});

app.post("/inspection-confirm/:token", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    const token = String(req.params.token || "").trim();
    const decision = String(req.query?.decision || "yes").trim().toLowerCase();
    const result = await pgQuery(
      `SELECT id, status, completed_date FROM periodic_maintenance
       WHERE whatsapp_confirmation_token = $1
       LIMIT 1`,
      [token]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).send("<h2>Inspection confirmation link is invalid or expired.</h2>");

    if (String(row.status).toLowerCase() === "completed") {
      return res.send("<!doctype html><html><body style='font-family:Arial;max-width:620px;margin:50px auto;padding:24px;text-align:center'><h2>Inspection Already Completed</h2><p>This inspection is already closed in Fleet ERP.</p></body></html>");
    }

    if (decision === "no") {
      await pgQuery(
        `UPDATE periodic_maintenance
         SET whatsapp_confirmation_token = NULL,
             whatsapp_confirmed_at = NULL,
             whatsapp_confirmation_source = 'WhatsApp - NO'
         WHERE id = $1
           AND whatsapp_confirmation_token = $2`,
        [row.id, token]
      );
      return res.send("<!doctype html><html><body style='font-family:Arial;max-width:620px;margin:50px auto;padding:24px;text-align:center'>" +
        "<h2 style='color:#dc2626'>NO — Inspection Not Completed</h2>" +
        "<p>The inspection remains <strong>Pending</strong> and has not been closed.</p>" +
        "<p>Fleet Management can send the WhatsApp reminder again when the vehicle is due.</p>" +
        "</body></html>");
    }

    await completePeriodicMaintenancePG(row.id, {
      technician: "WhatsApp Confirmation",
      cost: 0,
      notes: "Annual inspection confirmed by driver via WhatsApp confirmation link.",
    });
    await pgQuery(
      `UPDATE periodic_maintenance
       SET whatsapp_confirmation_token = NULL,
           whatsapp_confirmed_at = NOW(),
           whatsapp_confirmation_source = 'WhatsApp - YES'
       WHERE id = $1
         AND whatsapp_confirmation_token = $2`,
      [row.id, token]
    );

    res.send("<!doctype html><html><body style='font-family:Arial;max-width:620px;margin:50px auto;padding:24px;text-align:center'><h2 style='color:#16a34a'>✓ Inspection Completed</h2><p>The inspection has been recorded in Fleet ERP.</p><p>Date: " + new Date().toISOString().slice(0,10) + "</p></body></html>");
  } catch (e) {
    res.status(500).send("<h2>Unable to process the inspection confirmation.</h2><p>" + String(e.message || "").replace(/[<>&]/g, "") + "</p>");
  }
});

app.delete("/api/periodic-maintenance/:id", async (req, res) => {
  try { res.json({ success: await deletePeriodicMaintenancePG(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/api/periodic-maintenance/generate", async (req, res) => {
  try {
    const months = Number(req.body.monthsAhead) || 6;
    const result = await generateScheduledMaintenancePG(months);
    const createdCount = typeof result === "number" ? result : Number(result?.created || 0);
    const records = Array.isArray(result?.records) ? result.records : [];
    res.json({ success: true, created: createdCount, monthsAhead: result?.monthsAhead || months, records });
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

app.delete("/api/audit-log/clear", requireRole("Owner"), async (req, res) => {
  try {
    const days = Number(req.query.days) || 90;
    res.json({ success: true, deleted: await clearAuditLogPG(days) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== BACKUP =====
app.get("/api/backup/list", requireRole("Owner"), async (req, res) => {
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

app.post("/api/backup/create", requireRole("Owner"), async (req, res) => {
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
app.delete("/api/backup/:name", requireRole("Owner"), async (req, res) => {
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

app.get("/api/backup/download/:name", requireRole("Owner"), async (req, res) => {
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

// ===== WHATSAPP FOR DAILY KM TICKETS =====
app.get("/api/tickets/:id/whatsapp-info", async (req, res) => {
  try {
    const ticketResult = await pgQuery(
      "SELECT id, vehicle_id FROM tickets WHERE id = $1",
      [req.params.id]
    );
    if (!ticketResult.rows[0]) {
      return res.status(404).json({ success: false, error: "Ticket not found" });
    }

    const vehicleResult = await pgQuery(
      "SELECT id, plate_number, plate_code, driver, phone, current_km FROM vehicles WHERE id = $1",
      [ticketResult.rows[0].vehicle_id]
    );
    if (!vehicleResult.rows[0]) {
      return res.status(404).json({ success: false, error: "Vehicle not found" });
    }

    const v = vehicleResult.rows[0];
    const plate = [v.plate_number, v.plate_code].filter(Boolean).join(" ").trim();
    const phone = toWaMeNumber(v.phone);

    res.json({
      success: true,
      ticketId: ticketResult.rows[0].id,
      driverName: v.driver || "",
      driverPhone: phone,
      vehiclePlate: plate,
      currentKm: Number(v.current_km || 0)
    });
  } catch (e) {
    console.error("Error fetching WhatsApp info:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/vehicles/:id/whatsapp-info", async (req, res) => {
  try {
    const vehicleResult = await pgQuery(
      "SELECT v.id, v.plate_number, v.plate_code, COALESCE(d.name, v.driver, '') AS driver, COALESCE(d.phone, v.phone, '') AS phone, v.current_km FROM vehicles v LEFT JOIN drivers d ON (d.id = v.driver_id OR d.vehicle_id = v.id) WHERE v.id = $1",
      [req.params.id]
    );
    if (!vehicleResult.rows[0]) {
      return res.status(404).json({ success: false, error: "Vehicle not found" });
    }
    const v = vehicleResult.rows[0];
    const plate = [v.plate_number, v.plate_code].filter(Boolean).join(" ").trim();
    let confirmationUrl = "";
    const annual = await pgQuery(
      `SELECT id, status FROM periodic_maintenance
       WHERE vehicle_id = $1 AND type = 'inspection'
       ORDER BY CASE WHEN status = 'Pending' THEN 0 ELSE 1 END, id DESC
       LIMIT 1`,
      [v.id]
    );
    let annualRecord = annual.rows[0];
    if (!annualRecord) {
      const created = await pgQuery(
        `INSERT INTO periodic_maintenance
          (vehicle_id, type, scheduled_date, status, technician, notes)
         VALUES ($1, 'inspection', CURRENT_DATE, 'Pending', '', '')
         RETURNING id, status`,
        [v.id]
      );
      annualRecord = created.rows[0];
    }
    if (annualRecord && String(annualRecord.status).toLowerCase() !== "completed") {
      const token = randomUUID();
      await pgQuery(
        `UPDATE periodic_maintenance
         SET whatsapp_confirmation_token = $1,
             whatsapp_confirmed_at = NULL,
             whatsapp_confirmation_source = NULL
         WHERE id = $2`,
        [token, annualRecord.id]
      );
      const baseUrl = String(process.env.PUBLIC_APP_URL || "https://fleet-erp-kn0c.onrender.com").replace(/\/$/, "");
      confirmationUrl = baseUrl + "/inspection-confirm/" + token;
    }
    res.json({
      success: true,
      vehicleId: v.id,
      driverName: v.driver || "",
      driverPhone: toWaMeInternational(v.phone),
      vehiclePlate: plate,
      currentKm: Number(v.current_km || 0),
      confirmationUrl
    });
  } catch (e) {
    console.error("Error fetching vehicle WhatsApp info:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put("/api/tickets/:id/log-whatsapp", requireRole("Owner"), async (req, res) => {
  try {
    const userName = req.user?.full_name || req.user?.username || "Owner";
    const note = "[" + new Date().toISOString() + "] WhatsApp sent by " + userName;
    await pgQuery(
      "UPDATE tickets SET resolution_notes = CASE WHEN COALESCE(resolution_notes, '') = '' THEN $1 ELSE resolution_notes || E'\n' || $1 END WHERE id = $2",
      [note, req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error("Error logging WhatsApp:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== FINANCIAL REPORT =====
app.get("/api/reports/financial", async (req, res) => {
  try { res.json({ success: true, ...await getFinancialReportPG() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===== ERP V2 =====
if (process.env.ERP_V2_ENABLED === "true") {
  try {
    await mountV2(app);
  } catch (e) {
    console.error("[ERP V2] startup failed:", e.message);
  }
}

// ===== ONE-TIME TEST VEHICLE 123 RESET =====
// Enabled only when RESET_TEST_123=true in Render. It resets the dedicated
// test vehicle and all rows that reference it, while preserving the vehicle
// master row itself so the same test plate can be recreated cleanly.
async function resetTestVehicle123Once() {
  if (String(process.env.RESET_TEST_123 || '').toLowerCase() !== 'true') return;
  const result = await pgQuery(
    "SELECT id FROM vehicles WHERE LOWER(TRIM(CONCAT(COALESCE(plate_number,''), ' ', COALESCE(plate_code,'')))) = $1 LIMIT 1",
    ['test 123']
  );
  const vehicle = result.rows[0];
  if (!vehicle) {
    console.log('[Test123Reset] vehicle test 123 not found; nothing to reset.');
    return;
  }
  const vehicleId = vehicle.id;
  const tablesResult = await pgQuery(`
    SELECT DISTINCT tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'vehicles' AND ccu.column_name = 'id'
      AND kcu.column_name = 'vehicle_id' AND tc.table_schema = 'public'
  `);
  for (const row of tablesResult.rows) {
    if (row.table_name === 'vehicles') continue;
    const table = String(row.table_name).replace(/"/g, '""');
    await pgQuery(`DELETE FROM "${table}" WHERE vehicle_id = $1`, [vehicleId]);
  }
  await pgQuery(
    "UPDATE vehicles SET inspection_last_date = NULL, inspection_due_date = NULL WHERE id = $1",
    [vehicleId]
  );
  console.log('[Test123Reset] child records cleared and inspection fields reset for test 123.');
}

try { await resetTestVehicle123Once(); } catch (e) {
  console.error('[Test123Reset] reset failed:', e.message);
}

// ===== ONE-TIME TEST VEHICLE 123 INSPECTION SEED =====
async function seedTestVehicle123InspectionOnce() {
  if (String(process.env.CREATE_TEST_123_INSPECTION || '').toLowerCase() !== 'true') return;
  const vehicleResult = await pgQuery(
    "SELECT id FROM vehicles WHERE LOWER(TRIM(CONCAT(COALESCE(plate_number,''), ' ', COALESCE(plate_code,'')))) = $1 LIMIT 1",
    ['test 123']
  );
  const vehicle = vehicleResult.rows[0];
  if (!vehicle) return;
  const existing = await pgQuery(
    "SELECT id FROM periodic_maintenance WHERE vehicle_id = $1 AND type = 'inspection' LIMIT 1",
    [vehicle.id]
  );
  if (existing.rows[0]) {
    console.log('[Test123Seed] annual inspection already exists:', existing.rows[0].id);
    return;
  }
  const created = await pgQuery(
    `INSERT INTO periodic_maintenance
      (vehicle_id, type, scheduled_date, status, technician, notes)
     VALUES ($1, 'inspection', CURRENT_DATE, 'Pending', '', 'Test vehicle 123 - WhatsApp annual inspection workflow test')
     RETURNING id`,
    [vehicle.id]
  );
  console.log('[Test123Seed] annual inspection created:', created.rows[0]?.id);
}
try { await seedTestVehicle123InspectionOnce(); } catch (e) {
  console.error('[Test123Seed] seed failed:', e.message);
}

// stored driver name/phone snapshot. This prevents editing one driver or vehicle
// from changing the assignment of unrelated vehicles.
try {
  await db.repairVehicleDriverAssignmentsFromSnapshots();
} catch (e) {
  console.error("[DriverRepair] vehicle-specific assignment reconciliation failed:", e.message);
}

// Narrow startup safety reconciliation for the known 4481 JUA assignment.
try {
  await db.repairKnownVehicleAssignments();
} catch (e) {
  console.error("[DriverRepair] startup reconciliation failed:", e.message);
}

try { await ensureVehicleRepairSchema(); } catch (e) { console.error("[Schema] vehicle repair schema check failed:", e.message); }
try { await db.ensurePeriodicMaintenanceSchema(); } catch (e) { console.error("[Schema] periodic maintenance schema check failed:", e.message); }
try { await ensureAnnualInspectionReminderSchema(); } catch (e) { console.error("[Schema] inspection reminder schema check failed:", e.message); }
setInterval(() => processAnnualInspectionReminders().catch(e => console.error("[InspectionEmail] scheduler failed:", e.message)), 60 * 60 * 1000);


// Additive, idempotent ticket-schema guard. Only missing columns are added;
// existing tickets and historical data are never modified or removed.
try {
  await db.ensureTicketSchema();
} catch (e) {
  console.error("[Schema] ticket schema check failed:", e.message);
}

// Same guard for the Building Maintenance tables. Without this, a partially
// migrated work_orders/projects/purchases/sites table makes the building
// dashboard, monthly and financial reports return HTTP 500.
try {
  await db.ensureBuildingSchema();
} catch (e) {
  console.error("[Schema] building schema check failed:", e.message);
}

// Ensure soft-delete support for users. Without this, login checks
// deleted_at which may not exist yet on a fresh or older database.
try {
  await ensureUserAccessTable();
  await ensureInvoiceSchema();
} catch (e) {
  console.error("[Schema] user access table check failed:", e.message);
}

app.post("/api/operations/vela-sync", requireRole("Owner"), async (req, res) => {
  try {
    await syncBuildingFromVelaOnce();
    res.json({ success: true, message: "Vela building sync completed." });
  } catch (e) {
    console.error("[VelaBuildingSync] manual sync failed:", e.message);
    res.status(500).json({ success: false, error: e.message });
  }
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












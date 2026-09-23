import { query } from "./postgres.js";
import { sendFcmToTokens } from "./fcm.js";

const METHOD_ACTIONS = { GET: "view", POST: "edit", PUT: "edit", PATCH: "edit", DELETE: "delete" };

export const ACCESS_MODULES = [
  { id: "gm", label: "GM Dashboard" },
  { id: "support", label: "Support & Service" },
  { id: "building", label: "Building / Maintenance" },
  { id: "projects", label: "Projects" },
  { id: "warehouse", label: "Warehouse" },
  { id: "purchase_requests", label: "Project Purchase Requests" },
  { id: "fleet", label: "Fleet" },
  { id: "fleet_tickets", label: "Vehicle Tickets" },
  { id: "troubleshooter", label: "Troubleshooter" },
  { id: "tickets", label: "Tickets" },
  { id: "mytickets", label: "My Tickets" },
  { id: "reports", label: "Reports" },
  { id: "advanced_reports", label: "Advanced Reports" },
  { id: "drivers", label: "Drivers Management" },
  { id: "users", label: "Users Management" },
  { id: "audit", label: "Audit Log" },
  { id: "backup", label: "Backup" }
];

const ROLE_ACCESS_PRESETS = {
  Owner: "all",
  GM: { gm: ["view"], support: ["view"], building: ["view"], projects: ["view"], warehouse: ["view"], purchase_requests: ["view"], fleet: ["view"], tickets: ["view"], troubleshooter: ["view"], reports: ["view"], advanced_reports: ["view"] },
  Accountant: { reports: ["view"], advanced_reports: ["view"], tickets: ["view"], purchase_requests: ["view"], building: ["view"], projects: ["view"] },
  CampusManager: {
    support: ["view", "work"], building: ["view", "work"], projects: ["view", "work"],
    warehouse: ["view", "work"], purchase_requests: ["view", "work"], troubleshooter: ["view"]
  },
  Driver: { fleet: ["view", "work"], mytickets: ["view"], troubleshooter: ["view"] },
  SupportManager: { warehouse: ["view"], fleet_tickets: ["view"] },
  SSM: { building: ["view"], tickets: ["view"], warehouse: ["view"], fleet_tickets: ["view"] },
  FleetSupervisor: {
    gm: ["view"], fleet: ["view", "work"], fleet_tickets: ["view", "work"],
    building: ["view"], troubleshooter: ["view"]
  },
  FleetViewer: { fleet_tickets: ["view"] }
};

function getModuleFromPath(pathname) {
  const normalized = String(pathname || "").split("?")[0];
  const fullPath = normalized.startsWith("/api/")
    ? normalized
    : normalized.startsWith("api/")
      ? "/" + normalized
      : "/api" + (normalized.startsWith("/") ? normalized : "/" + normalized);

  const parts = fullPath.replace(/^\/+/, "").split("/");
  if (parts[0] !== "api") return null;

  // Users may read their own access matrix through the protected route;
  // the route handler itself enforces Owner-or-self access.
  if (/^\/api\/users\/[^/]+\/access\/?$/.test(fullPath)) return null;

  const route = parts[1] || "";

  // Vehicle master data and periodic vehicle maintenance are Owner-only.
  // Drivers retain the Fleet module for KM entry and issue reporting, but
  // must not receive the Vehicles or Vehicle Maintenance pages/data through
  // these management endpoints.

  // V2 uses /api/v2/<resource>. Keep the same RBAC matrix as the
  // legacy API instead of allowing an authenticated user to bypass
  // module permissions simply because the route is versioned.
  if (route === "v2") {
    const v2Route = parts[2] || "";
    const v2Modules = {
      "fleet-dashboard": "fleet",
      "vehicle-alerts": "fleet",
      vehicles: "fleet",
      drivers: "drivers",
      sites: "support",
      maintenance: "building",
      projects: "projects",
      warehouse: "warehouse",
      "purchase-requests": "purchase_requests",
      tickets: "tickets",
      financial: "reports",
      "daily-submission": "fleet",
      "daily-km": "fleet",
      "daily-exceptions": "fleet",
      "migration": "backup",
      "migration-preview": "backup"
    };
    return v2Modules[v2Route] || null;
  }

  const modules = {
    vehicles: "fleet",
    drivers: "drivers",
    tickets: "tickets",
    issues: "fleet",
    sites: "support",
    "work-orders": "building",
    "maintenance-requests": "support",
    projects: "projects",
    purchases: "purchase_requests",
    "purchase-requests": "purchase_requests",
    building: "building",
    inventory: "warehouse",
    "stock-transactions": "warehouse",
    "periodic-maintenance": "fleet",
    "audit-log": "audit",
    backup: "backup",
    users: "users",
    dashboard: "gm",
    reports: "reports",
    "advanced-reports": "advanced_reports",
    "live-issues": "tickets",
    voice: "fleet"
  };
  if (fullPath.includes("/tickets/by-reporter/") || fullPath.includes("/tickets/stats/")) return "mytickets";
  if (fullPath.startsWith("/api/support-manager/")) return "support";
  return modules[route] || null;
}

function getSpecialAction(pathname, method) {
  if (pathname.includes("/import")) return "import";
  if (pathname.includes("/oil-change")) return "oil_change";
  if (pathname.includes("/acknowledge")) return "acknowledge";
  if (pathname.includes("/close")) return "close";
  if (pathname.includes("/close-with-notes")) return "close";
  if (pathname.includes("/stock-in")) return "stock_in";
  if (pathname.includes("/stock-out")) return "stock_out";
  if (pathname.includes("/transfer")) return "transfer";
  if (pathname.includes("/complete")) return "complete";
  if (pathname.includes("/generate")) return "generate";
  if (pathname.includes("/create")) return "create";
  if (pathname.includes("/approve")) return "approve";
  if (pathname.includes("/reject")) return "reject";
  if (pathname.includes("/purchase")) return "purchase";
  if (pathname.includes("/download")) return "download";
  if (pathname.includes("/clear")) return "clear";
  return METHOD_ACTIONS[method] || null;
}

export function getPermissionForRequest(req) {
  const pathname = String(req.originalUrl || req.path || "").split("?")[0];
  let module = getModuleFromPath(pathname);
  if (!module) return null;

  // Ticket reads are split by scope:
  //   fleetType=maintenance|km  -> fleet_tickets (Vehicle Tickets)
  //   fleetType=general         -> tickets (General Tickets)
  //   bare list read            -> aggregated; allow EITHER module
  //   other /api/tickets/:id/*  -> fleet_tickets (vehicle-ticket actions)
  // The unscoped list read backs the Fleet Overview dashboard, which fleet
  // roles reach with only the fleet_tickets module. Naming a single module
  // there locked FleetSupervisor/FleetViewer out of the whole Fleet tab, so an
  // explicit fleetType keeps the strict split while the unscoped list read
  // accepts whichever module the caller holds. Per-ticket subpaths keep their
  // original fleet_tickets scoping.
  let altModules = [];
  const isBareTicketList = pathname === "/api/tickets" || pathname === "/api/tickets/";
  if (pathname.startsWith("/api/tickets") && req.method !== "POST") {
    const queryString = String(req.originalUrl || "").split("?")[1] || "";
    const fleetType = new URLSearchParams(queryString).get("fleetType");
    if (fleetType === "km" || fleetType === "maintenance") {
      module = "fleet_tickets";
    } else if (fleetType === "general") {
      module = "tickets";
    } else if (isBareTicketList) {
      module = "tickets";
      altModules = ["fleet_tickets"];
    } else {
      module = "fleet_tickets";
    }
  }

  const action = getSpecialAction(pathname, req.method);
  if (!action) return null;
  return { module, action, altModules };
}

function presetForRole(role) {
  return ROLE_ACCESS_PRESETS[role] || {};
}

export async function getUserAccess(userId, role) {
  if (role === "Owner") {
    return ACCESS_MODULES.reduce((acc, m) => {
      acc[m.id] = { can_view: true, can_work: true };
      return acc;
    }, {});
  }

  const result = await query(
    `SELECT module, can_view, can_work FROM user_access WHERE user_id = $1`,
    [userId]
  );

  const access = {};
  const preset = presetForRole(role);

  for (const m of ACCESS_MODULES) {
    const explicit = result.rows.find(r => r.module === m.id);

    // Support/Service Managers are restricted to Warehouse + Vehicle Tickets only.
    if (
      (role === "SupportManager" || role === "SSM") &&
      !["warehouse", "fleet_tickets"].includes(m.id)
    ) {
      access[m.id] = { can_view: false, can_work: false };
      continue;
    }

    if (explicit) {
      access[m.id] = { can_view: Boolean(explicit.can_view), can_work: Boolean(explicit.can_work) };
      continue;
    }
    const defaults = preset[m.id] || [];
    access[m.id] = {
      can_view: defaults.includes("view") || defaults.includes("work"),
      can_work: defaults.includes("work")
    };
  }
  return access;
}

export async function saveUserAccess(userId, access = {}) {
  const targetResult = await query(
    `SELECT role FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const targetRole = targetResult.rows[0]?.role || null;

  for (const module of ACCESS_MODULES.map(m => m.id)) {
    const value = access[module] || {};

    // Hard security rule for Support Manager: Fleet and Purchase Requests
    // are never granted, even if old/stale access rows contain access.
    const restrictedServiceRole =
      targetRole === "SupportManager" &&
      !["warehouse", "fleet_tickets"].includes(module);
    const restrictedCampusRole =
      targetRole === "CampusManager" &&
      !["support", "building", "projects", "warehouse", "purchase_requests", "troubleshooter"].includes(module);
    const blockedForSupportManager = restrictedServiceRole || restrictedCampusRole;
    const canWork = blockedForSupportManager ? false : Boolean(value.can_work);
    const canView = blockedForSupportManager ? false : (Boolean(value.can_view) || canWork);
    await query(
      `INSERT INTO user_access (user_id, module, can_view, can_work)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, module)
       DO UPDATE SET can_view = EXCLUDED.can_view, can_work = EXCLUDED.can_work`,
      [userId, module, canView, canWork]
    );
  }
  return getUserAccess(userId, null);
}

export async function ensureUserAccessTable() {
  await query(`CREATE TABLE IF NOT EXISTS user_access (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module TEXT NOT NULL,
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_work BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(user_id, module)
  )`);
}

export async function hasModuleAccess(user, module, mode = "view") {
  if (!user) return false;
  if (user.role === "Owner") return true;

  // Vehicle master data and periodic vehicle-maintenance management are
  // Owner-only. Driver Fleet access remains limited to KM/issue workflows.
  if (
    (module === "fleet" && user.__ownerOnlyVehicleSection === true)
  ) return false;

  // Support/Service Managers: Warehouse + read-only Vehicle Tickets only.
  if (["SupportManager", "SSM"].includes(user.role) &&
      !["warehouse", "fleet_tickets"].includes(module)) return false;

  // Campus Manager: support/building/projects/warehouse/purchase requests + troubleshooter view.
  if (user.role === "CampusManager" &&
      !["support", "building", "projects", "warehouse", "purchase_requests", "troubleshooter"].includes(module)) return false;

  // Once the Owner has saved an access matrix for a user, that matrix is
  // authoritative. A false value must never fall back to legacy role/user
  // permissions, otherwise manually revoked access can be restored silently.
  const result = await query(
    `SELECT can_view, can_work
     FROM user_access
     WHERE user_id = $1 AND module = $2
     LIMIT 1`,
    [user.id, module]
  );

  const configured = await query(
    `SELECT 1 FROM user_access WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );

  if (configured.rows.length > 0) {
    if (result.rows.length === 0) return false;
    return mode === "work"
      ? Boolean(result.rows[0].can_work)
      : Boolean(result.rows[0].can_view);
  }

  const access = await getUserAccess(user.id, user.role);
  return mode === "work"
    ? Boolean(access[module]?.can_work)
    : Boolean(access[module]?.can_view);
}

async function handlePushRoute(req, res) {
  const pushPath = String(req.originalUrl || req.path || "").split("?")[0].replace(/^\/api/, "");
  if (pushPath === "/push/register" && req.method === "POST") {
    const token = String(req.body?.token || "").trim();
    const platform = String(req.body?.platform || "web").trim() || "web";
    const userAgent = String(req.body?.userAgent || "").slice(0, 2000);
    if (!token) return res.status(400).json({ success: false, error: "FCM token is required" });

    await query(`CREATE TABLE IF NOT EXISTS push_tokens (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'web', user_agent TEXT,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id)`);
    const result = await query(`
      INSERT INTO push_tokens (user_id, token, platform, user_agent, last_seen_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (token) DO UPDATE SET user_id=EXCLUDED.user_id, platform=EXCLUDED.platform,
      user_agent=EXCLUDED.user_agent, last_seen_at=CURRENT_TIMESTAMP
      RETURNING id, user_id, platform, last_seen_at
    `, [req.user.id, token, platform, userAgent]);
    return res.json({ success: true, registered: true, tokenId: result.rows[0]?.id || null });
  }

  if (pushPath === "/push/test" && req.method === "POST") {
    if (req.user?.role !== "Owner") return res.status(403).json({ success: false, error: "Owner only" });
    try {
      const result = await query(`SELECT token FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC`, [req.user.id]);
      const sendResult = await sendFcmToTokens({
        tokens: result.rows.map(row => row.token),
        title: "Fleet ERP Test", body: "Push notifications are working correctly.",
        data: { type: "test", icon: "🔔", url: "/" }
      });
      return res.json({ success: true, ...sendResult });
    } catch (error) {
      console.error("FCM test push error:", error);
      return res.status(500).json({ success: false, error: "FCM test failed", message: error?.message || "Unknown FCM error" });
    }
  }
  return null;
}

export async function requirePermission(req, res, next) {
  try {
    const pushHandled = await handlePushRoute(req, res);
    if (pushHandled !== null) return pushHandled;

    const permission = getPermissionForRequest(req);
    if (!permission) return next();

    const mode = req.method === "GET" ? "view" : "work";

    // These management endpoints are Owner-only. The Driver still uses
    // /api/vehicles/list and the normal Fleet workflow for KM entry.
    const pathname = String(req.originalUrl || req.path || "").split("?")[0];
    const ownerOnlyVehicleRoute =
      // Vehicle master-data changes are Owner-only.
      (pathname === "/api/vehicles" && ["POST", "DELETE"].includes(req.method)) ||
      (/^\/api\/vehicles\/[^/]+$/.test(pathname) && ["PUT", "DELETE"].includes(req.method)) ||
      pathname === "/api/vehicles/import" ||
      (pathname === "/api/v2/vehicles" && ["POST", "DELETE"].includes(req.method)) ||
      (/^\/api\/v2\/vehicles\/[^/]+\/360\/?$/.test(pathname) && !["Owner", "GM", "FleetSupervisor"].includes(req.user?.role)) ||
      (pathname === "/api/periodic-maintenance" && ["POST", "DELETE"].includes(req.method)) ||
      (/^\/api\/periodic-maintenance\/[^/]+$/.test(pathname) && ["PUT", "DELETE"].includes(req.method));

    if (ownerOnlyVehicleRoute && req.user?.role !== "Owner") {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Vehicle management is Owner-only."
      });
    }

    // Drivers retain their Fleet workflow (KM, assigned-vehicle details, and issue reporting).
    // Smart Report creates a ticket through POST /api/tickets, but Drivers must not receive
    // general Tickets-management access just to submit a vehicle issue.
    const isDriverSmartReport =
      req.user?.role === "Driver" &&
      permission.module === "tickets" &&
      req.method === "POST" &&
      pathname === "/api/tickets";

    if (req.user?.role === "Driver" && permission.module === "fleet") return next();

    if (isDriverSmartReport) {
      const body = req.body || {};
      const hasRequiredReportFields =
        Number.isFinite(Number(body.vehicleId)) &&
        String(body.description || "").trim().length > 0 &&
        String(body.reportedBy || "").trim().toLowerCase() === "driver";
      if (hasRequiredReportFields) return next();
    }

    let accessAllowed = await hasModuleAccess(req.user, permission.module, mode);

    // The unscoped ticket read is an aggregated dashboard feed; it succeeds if
    // the caller holds either the general or the vehicle ticket module.
    if (!accessAllowed && permission.altModules?.length) {
      for (const alt of permission.altModules) {
        if (await hasModuleAccess(req.user, alt, mode)) { accessAllowed = true; break; }
      }
    }

    if (accessAllowed) return next();

    return res.status(403).json({
      success: false,
      error: "Forbidden",
      message: "Access denied: " + mode + " permission required for " + permission.module + ".",
      required: { module: permission.module, action: mode }
    });
  } catch (error) {
    console.error("RBAC permission error:", error);
    return res.status(500).json({ success: false, error: "Permission check failed", message: error.message });
  }
}

export default {
  ACCESS_MODULES, getPermissionForRequest, getUserAccess, saveUserAccess,
  ensureUserAccessTable, hasModuleAccess, requirePermission
};

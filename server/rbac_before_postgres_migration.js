import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, "fleet.db"));

const METHOD_ACTIONS = {
  GET: "view",
  POST: "add",
  PUT: "edit",
  PATCH: "edit",
  DELETE: "delete"
};

function getModuleFromPath(pathname) {
  const parts = pathname.replace(/^\/+/, "").split("/");

  if (parts[0] !== "api") return null;

  const route = parts[1] || "";

  const modules = {
    vehicles: "vehicles",
    drivers: "drivers",
    tickets: "tickets",
    issues: "tickets",
    sites: "building",
    "work-orders": "building",
    projects: "projects",
    purchases: "purchases",
    building: "building",
    inventory: "warehouse",
    "stock-transactions": "warehouse",
    "periodic-maintenance": "periodic",
    "audit-log": "audit",
    backup: "backup",
    users: "users",
    dashboard: "gm",
    reports: "reports",
    "live-issues": "tickets"
  };

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
  if (pathname.includes("/download")) return "download";
  if (pathname.includes("/clear")) return "clear";

  return METHOD_ACTIONS[method] || null;
}

export function getPermissionForRequest(req) {
  const module = getModuleFromPath(req.path);
  if (!module) return null;

  const action = getSpecialAction(req.path, req.method);

  if (!action) return null;

  return { module, action };
}

export function hasPermission(user, module, action) {
  if (!user) return false;

  // Owner always has full access.
  if (user.role === "Owner") return true;

  const permission = db.prepare(`
    SELECT 1
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = ?
      AND p.module = ?
      AND p.action = ?
      AND up.allowed = 1
    LIMIT 1
  `).get(user.id, module, action);

  if (permission) return true;

  const rolePermission = db.prepare(`
    SELECT 1
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.name = ?
      AND p.module = ?
      AND p.action = ?
      AND rp.allowed = 1
    LIMIT 1
  `).get(user.role, module, action);

  return !!rolePermission;
}

export function requirePermission(req, res, next) {
  const permission = getPermissionForRequest(req);

  // Routes without a defined permission mapping are allowed
  // to continue under the existing authentication rules.
  if (!permission) return next();

  if (hasPermission(req.user, permission.module, permission.action)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: "Forbidden",
    message: `You do not have permission to ${permission.action} ${permission.module}.`,
    required: permission
  });
}

export default {
  getPermissionForRequest,
  hasPermission,
  requirePermission
};

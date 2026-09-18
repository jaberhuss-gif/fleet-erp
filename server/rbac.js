import { query } from "./postgres.js";
import { sendFcmToTokens } from "./fcm.js";

const METHOD_ACTIONS = { GET: "view", POST: "add", PUT: "edit", PATCH: "edit", DELETE: "delete" };

function getModuleFromPath(pathname) {
  const parts = pathname.replace(/^\/+/, "").split("/");
  if (parts[0] !== "api") return null;
  const route = parts[1] || "";
  const modules = {
    vehicles: "vehicles", drivers: "drivers", tickets: "tickets", issues: "tickets", sites: "building",
    "work-orders": "building", projects: "projects", purchases: "purchases", building: "building",
    inventory: "warehouse", "stock-transactions": "warehouse", "periodic-maintenance": "periodic",
    "audit-log": "audit", backup: "backup", users: "users", dashboard: "gm", reports: "reports", "live-issues": "tickets"
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

export async function hasPermission(user, module, action) {
  if (!user) return false;
  if (user.role === "Owner") return true;
  const userPermission = await query(`
    SELECT 1 FROM user_permissions up JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = $1 AND p.module = $2 AND p.action = $3 AND up.allowed = TRUE LIMIT 1
  `, [user.id, module, action]);
  if (userPermission.rows.length > 0) return true;
  const rolePermission = await query(`
    SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
    WHERE r.name = $1 AND p.module = $2 AND p.action = $3 AND rp.allowed = TRUE LIMIT 1
  `, [user.role, module, action]);
  return rolePermission.rows.length > 0;
}

async function handlePushRoute(req, res) {
  if (req.path === "/push/register" && req.method === "POST") {
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

  if (req.path === "/push/test" && req.method === "POST") {
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
      return res.status(500).json({
        success: false,
        error: "FCM test failed",
        message: error?.message || "Unknown FCM error"
      });
    }
  }
  return null;
}

export async function requirePermission(req, res, next) {
  try {
    const pushHandled = await handlePushRoute(req, res);
    if (pushHandled !== null) return pushHandled;
  if (req.user?.role === "FleetViewer" && req.method === "GET" && req.path === "/tickets") return next();
    const permission = getPermissionForRequest(req);
    if (!permission) return next();
    const allowed = await hasPermission(req.user, permission.module, permission.action);
    if (allowed) return next();
    return res.status(403).json({ success: false, error: "Forbidden", message: `You do not have permission to ${permission.action} ${permission.module}.`, required: permission });
  } catch (error) {
    console.error("RBAC permission error:", error);
    return res.status(500).json({ success: false, error: "Permission check failed", message: error.message });
  }
}

export default { getPermissionForRequest, hasPermission, requirePermission };

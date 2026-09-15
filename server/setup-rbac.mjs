import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, "fleet.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  is_system INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT DEFAULT '',
  UNIQUE(module, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  allowed INTEGER DEFAULT 0,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  allowed INTEGER DEFAULT 1,
  PRIMARY KEY (user_id, permission_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);
`);

const roles = [
  ["Owner", "Full system access"],
  ["GM", "Read-only access"],
  ["Accountant", "Financial and reporting access"],
  ["CampusManager", "Building and camp operations"],
  ["Driver", "Assigned vehicle and tickets"],
  ["FleetSupervisor", "Fleet operations"]
];

const roleStmt = db.prepare(`
  INSERT OR IGNORE INTO roles (name, description)
  VALUES (?, ?)
`);

for (const role of roles) {
  roleStmt.run(...role);
}

const modules = {
  gm: ["view"],
  vehicles: ["view", "add", "edit", "delete", "import", "oil_change"],
  drivers: ["view", "add", "edit", "delete"],
  periodic: ["view", "add", "edit", "delete", "complete", "generate"],
  tickets: ["view", "add", "edit", "delete", "acknowledge", "close"],
  troubleshooter: ["view"],
  mytickets: ["view", "add", "edit"],
  "advanced-reports": ["view", "export"],
  charts: ["view", "export"],
  reports: ["view", "export"],
  building: ["view", "add", "edit", "delete"],
  warehouse: ["view", "add", "edit", "delete", "stock_in", "stock_out", "transfer"],
  maintenance: ["view", "add", "edit", "delete"],
  users: ["view", "add", "edit", "delete", "permissions"],
  audit: ["view", "export", "clear"],
  backup: ["view", "create", "download", "delete"]
};

const permissionStmt = db.prepare(`
  INSERT OR IGNORE INTO permissions (module, action, description)
  VALUES (?, ?, ?)
`);

for (const [module, actions] of Object.entries(modules)) {
  for (const action of actions) {
    permissionStmt.run(
      module,
      action,
      `${action} permission for ${module}`
    );
  }
}

const ownerRole = db.prepare(
  `SELECT id FROM roles WHERE name = 'Owner'`
).get();

const gmRole = db.prepare(
  `SELECT id FROM roles WHERE name = 'GM'`
).get();

const allPermissions = db.prepare(
  `SELECT id FROM permissions`
).all();

const assignRole = db.prepare(`
  INSERT OR IGNORE INTO role_permissions
  (role_id, permission_id, allowed)
  VALUES (?, ?, ?)
`);

for (const p of allPermissions) {
  assignRole.run(ownerRole.id, p.id, 1);
}

const viewPermissions = db.prepare(`
  SELECT id
  FROM permissions
  WHERE action = 'view'
`);

for (const p of viewPermissions.all()) {
  assignRole.run(gmRole.id, p.id, 1);
}

console.log("RBAC tables created successfully.");
console.log("Roles:", db.prepare("SELECT COUNT(*) AS count FROM roles").get().count);
console.log("Permissions:", db.prepare("SELECT COUNT(*) AS count FROM permissions").get().count);
console.log("Role permissions:", db.prepare("SELECT COUNT(*) AS count FROM role_permissions").get().count);
console.log("User permissions:", db.prepare("SELECT COUNT(*) AS count FROM user_permissions").get().count);

db.close();

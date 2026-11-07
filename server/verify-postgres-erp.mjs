import { query } from "./postgres.js";

const checks = [
  ["vehicles", "SELECT COUNT(*) AS count FROM vehicles"],
  ["drivers", "SELECT COUNT(*) AS count FROM drivers"],
  ["tickets", "SELECT COUNT(*) AS count FROM tickets"],
  ["sites", "SELECT COUNT(*) AS count FROM sites"],
  ["work_orders", "SELECT COUNT(*) AS count FROM work_orders"],
  ["projects", "SELECT COUNT(*) AS count FROM projects"],
  ["purchases", "SELECT COUNT(*) AS count FROM purchases"],
  ["periodic_maintenance", "SELECT COUNT(*) AS count FROM periodic_maintenance"],
  ["users", "SELECT COUNT(*) AS count FROM users"],
  ["roles", "SELECT COUNT(*) AS count FROM roles"],
  ["permissions", "SELECT COUNT(*) AS count FROM permissions"],
  ["role_permissions", "SELECT COUNT(*) AS count FROM role_permissions"],
  ["inventory", "SELECT COUNT(*) AS count FROM inventory"],
  ["stock_transactions", "SELECT COUNT(*) AS count FROM stock_transactions"],
  ["audit_log", "SELECT COUNT(*) AS count FROM audit_log"]
];

console.log("\n===== POSTGRES ERP DATA CHECK =====");

for (const [name, sql] of checks) {
  const result = await query(sql);
  console.log(`${name}: ${result.rows[0].count}`);
}

console.log("\n===== SAMPLE OWNER =====");

const owner = await query(`
  SELECT id, username, full_name, role, is_active
  FROM users
  WHERE username = 'owner'
`);

console.table(owner.rows);

console.log("\n===== SAMPLE GM =====");

const gm = await query(`
  SELECT id, username, full_name, role, is_active
  FROM users
  WHERE username = 'gm'
`);

console.table(gm.rows);

console.log("\n===== SAMPLE VEHICLE =====");

const vehicle = await query(`
  SELECT
    id,
    plate_number,
    plate_code,
    make,
    model,
    location,
    driver,
    current_km,
    last_oil_km,
    status
  FROM vehicles
  ORDER BY id
  LIMIT 1
`);

console.table(vehicle.rows);

console.log("\nPostgreSQL ERP check completed successfully.");
process.exit(0);

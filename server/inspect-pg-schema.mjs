import { query } from "./postgres.js";

const tables = [
  "vehicles",
  "km_records",
  "oil_changes",
  "tickets",
  "sites",
  "drivers",
  "inventory",
  "stock_transactions",
  "periodic_maintenance",
  "audit_log",
  "work_orders",
  "projects",
  "purchases",
  "users",
  "roles",
  "permissions",
  "role_permissions",
  "user_permissions"
];

for (const table of tables) {
  const r = await query(`
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);

  console.log(`\n=== ${table} ===`);

  for (const c of r.rows) {
    console.log(
      `${c.column_name} | ${c.data_type} | nullable=${c.is_nullable} | default=${c.column_default ?? ""}`
    );
  }
}

process.exit(0);

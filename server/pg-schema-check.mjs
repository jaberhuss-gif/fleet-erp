import { query } from "./postgres.js";

const tables = [
  "vehicles",
  "drivers",
  "sites",
  "work_orders",
  "tickets",
  "projects",
  "purchases",
  "inventory",
  "stock_transactions",
  "periodic_maintenance",
  "km_records",
  "oil_changes",
  "audit_log"
];

for (const table of tables) {
  const r = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);

  console.log(`\n=== ${table} ===`);
  console.log(r.rows.map(x => `${x.column_name} (${x.data_type})`).join("\n"));
}

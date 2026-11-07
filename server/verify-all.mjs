import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});
await client.connect();

const tables = [
  "vehicles", "roles", "permissions", "role_permissions", "users", "sites",
  "drivers", "tickets", "work_orders", "projects", "purchases",
  "periodic_maintenance", "km_records", "oil_changes", "stock_transactions", "audit_log"
];

for (const t of tables) {
  const r = await client.query("SELECT COUNT(*) as c FROM " + t);
  console.log(t + ": " + r.rows[0].c + " rows");
}

await client.end();

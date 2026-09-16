import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ||
    "postgresql://neondb_owner:npg_dynmHfhw3O1V@ep-rapid-bread-b1qjr8sh-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require"
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

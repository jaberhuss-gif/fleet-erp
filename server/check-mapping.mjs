import Database from "better-sqlite3";
import pg from "pg";

const sqlite = new Database("fleet.db", { readonly: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const sqliteVehicles = sqlite.prepare("SELECT id, plate_number, plate_code FROM vehicles ORDER BY id LIMIT 5").all();
console.log("--- SQLite (source) ---");
console.log(sqliteVehicles);

const pgResult = await client.query("SELECT id, plate_number, plate_code FROM vehicles ORDER BY id LIMIT 5");
console.log("--- Postgres (Neon) ---");
console.log(pgResult.rows);

console.log("--- Postgres columns for key tables ---");
const tablesToCheck = ["tickets","sites","work_orders","projects","purchases","users","drivers","periodic_maintenance","audit_log","km_records","oil_changes","stock_transactions","roles","permissions","role_permissions"];
for (const t of tablesToCheck) {
  const q = "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position";
  const r = await client.query(q, [t]);
  console.log(t + ":", r.rows.length ? r.rows.map(c => c.column_name).join(", ") : "(TABLE NOT FOUND)");
}

await client.end();
sqlite.close();

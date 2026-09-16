import Database from "better-sqlite3";
import pg from "pg";

const sqlite = new Database("fleet.db", { readonly: true });
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ||
    "postgresql://neondb_owner:npg_dynmHfhw3O1V@ep-rapid-bread-b1qjr8sh-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require"
});
await client.connect();

const rows = sqlite.prepare("SELECT * FROM projects").all();

function cleanDate(v) {
  if (v === "" || v === undefined) return null;
  return v;
}

let inserted = 0, skipped = 0;
for (const p of rows) {
  const values = [
    p.id, p.project_no, p.name, p.description, p.site, p.project_type,
    p.status, p.budget, p.spent, cleanDate(p.start_date), cleanDate(p.end_date),
    p.manager, p.contractor, p.month, p.year, p.notes
  ];
  try {
    const res = await client.query(
      "INSERT INTO projects (id, project_no, name, description, site, project_type, status, budget, spent, start_date, end_date, manager, contractor, month, year, notes) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (id) DO NOTHING",
      values
    );
    if (res.rowCount > 0) inserted++; else skipped++;
  } catch (e) {
    console.log("ERROR on project " + p.id + ": " + e.message);
    skipped++;
  }
}
console.log("projects: " + inserted + " inserted, " + skipped + " skipped (out of " + rows.length + ")");

await client.query(
  "SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(id) FROM projects), 1))",
  ["projects", "id"]
);

await client.end();
sqlite.close();
console.log("Done.");

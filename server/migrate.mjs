import Database from "better-sqlite3";
import pg from "pg";

const sqlite = new Database("fleet.db", { readonly: true });
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});
await client.connect();

const TABLES = [
  "roles",
  "permissions",
  "role_permissions",
  "users",
  "sites",
  "drivers",
  "tickets",
  "work_orders",
  "projects",
  "purchases",
  "periodic_maintenance",
  "km_records",
  "oil_changes",
  "stock_transactions",
  "audit_log"
];

async function getPgColumns(table) {
  const r = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
    [table]
  );
  return r.rows;
}

function getSqliteColumns(table) {
  const rows = sqlite.prepare("PRAGMA table_info(" + table + ")").all();
  return rows.map(r => r.name);
}

async function migrateTable(table) {
  const pgCols = await getPgColumns(table);
  if (pgCols.length === 0) {
    console.log(table + ": SKIPPED (not found in Postgres)");
    return;
  }
  const sqliteCols = new Set(getSqliteColumns(table));
  const common = pgCols.filter(c => sqliteCols.has(c.column_name));
  if (common.length === 0) {
    console.log(table + ": SKIPPED (no matching columns)");
    return;
  }
  const colNames = common.map(c => c.column_name);
  const selectSql = "SELECT " + colNames.join(", ") + " FROM " + table;
  const rows = sqlite.prepare(selectSql).all();

  if (rows.length === 0) {
    console.log(table + ": 0 rows to migrate");
    return;
  }

  const hasId = colNames.includes("id");
  const placeholders = colNames.map((_, i) => "$" + (i + 1)).join(", ");
  const conflictClause = hasId
    ? "ON CONFLICT (id) DO NOTHING"
    : "ON CONFLICT DO NOTHING";
  const insertSql =
    "INSERT INTO " + table + " (" + colNames.join(", ") + ") VALUES (" +
    placeholders + ") " + conflictClause;

  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const values = common.map(c => {
      let v = row[c.column_name];
      if (c.data_type === "boolean" && (v === 0 || v === 1)) {
        v = v === 1;
      }
      if (v === undefined) v = null;
      return v;
    });
    try {
      const res = await client.query(insertSql, values);
      if (res.rowCount > 0) inserted++; else skipped++;
    } catch (e) {
      console.log("  ERROR on " + table + " row: " + JSON.stringify(row).slice(0, 150));
      console.log("  -> " + e.message);
      skipped++;
    }
  }
  console.log(table + ": " + inserted + " inserted, " + skipped + " skipped (out of " + rows.length + ")");

  if (hasId) {
    try {
      await client.query(
        "SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM " + table + "), 1))",
        [table]
      );
    } catch (e) {
      console.log("  (sequence reset skipped for " + table + ": " + e.message + ")");
    }
  }
}

for (const t of TABLES) {
  await migrateTable(t);
}

await client.end();
sqlite.close();
console.log("\nDone.");

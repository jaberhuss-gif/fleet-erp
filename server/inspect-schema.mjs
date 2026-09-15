import Database from "better-sqlite3";

const db = new Database("fleet.db", { readonly: true });

const tables = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all();

for (const { name } of tables) {
  console.log(`\n===== ${name} =====`);
  const columns = db.prepare(`PRAGMA table_info("${name}")`).all();

  for (const c of columns) {
    console.log(`${c.name} | ${c.type} | PK=${c.pk} | NOTNULL=${c.notnull} | DEFAULT=${c.dflt_value ?? ""}`);
  }
}

db.close();

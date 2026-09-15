import Database from 'better-sqlite3';

const db = new Database('./fleet.db');

console.log('\n=== DATABASE TABLES ===\n');

const tables = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all();

for (const table of tables) {
  const count = db.prepare(`SELECT COUNT(*) AS count FROM "${table.name}"`).get();
  console.log(`${table.name}: ${count.count}`);
}

console.log('\n=== END ===\n');

db.close();
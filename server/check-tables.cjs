const Database = require("better-sqlite3");

const db = new Database("C:\\Fleet-ERP\\server\\fleet.db");

const tables = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type = 'table'
  ORDER BY name
`).all();

console.log(tables);

db.close();

const Database = require("better-sqlite3");

const db = new Database("C:\\Fleet-ERP\\server\\fleet.db");

const columns = db.prepare("PRAGMA table_info(users)").all();

console.log(columns);

db.close();

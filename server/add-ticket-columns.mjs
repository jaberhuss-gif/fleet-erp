import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, "fleet.db"));

// Add new columns to tickets table if not exists
const cols = db.prepare("PRAGMA table_info(tickets)").all().map(c => c.name);
console.log("Existing columns:", cols.join(", "));

if (!cols.includes("acknowledged_at")) {
  db.exec("ALTER TABLE tickets ADD COLUMN acknowledged_at DATETIME");
  console.log("✅ Added: acknowledged_at");
}
if (!cols.includes("acknowledged_by")) {
  db.exec("ALTER TABLE tickets ADD COLUMN acknowledged_by TEXT");
  console.log("✅ Added: acknowledged_by");
}
if (!cols.includes("closed_by")) {
  db.exec("ALTER TABLE tickets ADD COLUMN closed_by TEXT");
  console.log("✅ Added: closed_by");
}
if (!cols.includes("resolution_notes")) {
  db.exec("ALTER TABLE tickets ADD COLUMN resolution_notes TEXT");
  console.log("✅ Added: resolution_notes");
}

console.log("");
console.log("Final columns:");
console.log(db.prepare("PRAGMA table_info(tickets)").all().map(c => c.name).join(", "));

db.close();

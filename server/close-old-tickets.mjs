import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, "fleet.db"));

// Count open tickets before
const before = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'Open'").get().c;
console.log("Open tickets before: " + before);

// Close all open tickets with note
const result = db.prepare(`
  UPDATE tickets 
  SET status = 'Closed', 
      closed_at = CURRENT_TIMESTAMP,
      description = description || ' [Closed by Owner - Historical cleanup]'
  WHERE status = 'Open'
`).run();

console.log("Tickets closed: " + result.changes);

// Verify
const after = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'Open'").get().c;
const closed = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'Closed'").get().c;
console.log("");
console.log("===== Final Status =====");
console.log("Open tickets:   " + after);
console.log("Closed tickets: " + closed);
console.log("=========================");

db.close();

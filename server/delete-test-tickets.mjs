import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, 'fleet.db'));

// Show open tickets first
const open = db.prepare("SELECT id, category, description, reported_by FROM tickets WHERE status IN ('Open', 'Acknowledged') ORDER BY id DESC").all();
console.log('Open/Acknowledged tickets before delete:');
console.log(open);
console.log('');

// Delete ALL open/acknowledged tickets (تذاكر تجريبية)
const result = db.prepare("DELETE FROM tickets WHERE status IN ('Open', 'Acknowledged')").run();
console.log('Deleted tickets: ' + result.changes);

// Verify
const remaining = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status IN ('Open', 'Acknowledged')").get().c;
console.log('Remaining open tickets: ' + remaining);

db.close();

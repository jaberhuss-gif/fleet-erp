import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "fleet.db");
const db = new Database(dbPath);

console.log("Fixing month fields...");

// Fix work_orders: month = substring(reported_date, 1, 7)
const woResult = db.prepare(`
  UPDATE work_orders 
  SET month = substr(reported_date, 1, 7)
  WHERE reported_date IS NOT NULL AND reported_date != '' AND length(reported_date) >= 7
`).run();
console.log("Work Orders fixed:", woResult.changes);

// Fix projects: month from start_date
const projResult = db.prepare(`
  UPDATE projects 
  SET month = substr(start_date, 1, 7)
  WHERE start_date IS NOT NULL AND start_date != '' AND length(start_date) >= 7
`).run();
console.log("Projects fixed:", projResult.changes);

// Fix purchases: month from purchase_date
const purResult = db.prepare(`
  UPDATE purchases 
  SET month = substr(purchase_date, 1, 7)
  WHERE purchase_date IS NOT NULL AND purchase_date != '' AND length(purchase_date) >= 7
`).run();
console.log("Purchases fixed:", purResult.changes);

// Verify
console.log("\n===== Summary by month =====");
const woByMonth = db.prepare("SELECT month, COUNT(*) as cnt, SUM(final_cost) as cost FROM work_orders GROUP BY month ORDER BY month").all();
console.log("\nWork Orders:");
woByMonth.forEach(r => console.log("  " + r.month + ": " + r.cnt + " items, " + (r.cost || 0) + " SAR"));

const projByMonth = db.prepare("SELECT month, COUNT(*) as cnt, SUM(spent) as cost FROM projects GROUP BY month ORDER BY month").all();
console.log("\nProjects:");
projByMonth.forEach(r => console.log("  " + r.month + ": " + r.cnt + " items, " + (r.cost || 0) + " SAR"));

const purByMonth = db.prepare("SELECT month, COUNT(*) as cnt, SUM(total_cost) as cost FROM purchases GROUP BY month ORDER BY month").all();
console.log("\nPurchases:");
purByMonth.forEach(r => console.log("  " + r.month + ": " + r.cnt + " items, " + (r.cost || 0) + " SAR"));

db.close();

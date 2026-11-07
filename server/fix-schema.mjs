import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "fleet.db");

const db = new Database(dbPath);

console.log("Dropping old tables...");
db.exec("DROP TABLE IF EXISTS work_orders");
db.exec("DROP TABLE IF EXISTS projects");
db.exec("DROP TABLE IF EXISTS purchases");
db.exec("DROP TABLE IF EXISTS sites");

console.log("Done. Restart the server to recreate tables.");
db.close();

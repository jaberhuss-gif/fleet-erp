import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const SHEET_URL = process.env.GOOGLE_SHEET_CSV_URL || "https://docs.google.com/spreadsheets/d/e/2PACX-1vT873ccxLpmdm3uv0lj_ZcC2rQgkbcateX777GvC2d878ORoES0rNaMA6N4QztCntqzYrUBwYQFYIhA/pub?output=csv";
const INTERVAL_MS = Number(process.env.GOOGLE_SHEET_SYNC_INTERVAL_MS || 5 * 60 * 1000);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, connectionTimeoutMillis: 5000 }) : null;

const aliases = {
  plate: ["plate", "plate number", "plate_number", "vehicle", "vehicle number", "vehicle no", "car plate", "carplate"],
  code: ["plate code", "plate_code", "code"],
  driver: ["driver", "driver name", "driver_name", "assigned driver"],
  phone: ["phone", "mobile", "mobile number", "driver phone", "driver mobile", "phone number"],
  km: ["km", "kilometer", "kilometres", "kilometers", "current km", "current_km", "odometer", "odometer km"],
  active: ["active", "status", "vehicle status"]
};

function normalize(value) { return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function findIndex(headers, names) { const wanted = new Set(names.map(normalize)); return headers.findIndex(h => wanted.has(normalize(h))); }
function parseCsv(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && quoted && n === '"') { cell += '"'; i++; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (c === ',' && !quoted) { row.push(cell); cell = ""; continue; }
    if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && n === '\n') i++; row.push(cell); cell = ""; if (row.some(v => String(v).trim() !== "")) rows.push(row); row = []; continue; }
    cell += c;
  }
  row.push(cell); if (row.some(v => String(v).trim() !== "")) rows.push(row); return rows;
}
function cleanKm(value) { const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n >= 0 ? n : null; }
function isInactive(value) { return ["inactive", "disabled", "sold", "disposed", "not active", "no"].includes(normalize(value)); }

export async function syncGoogleSheetVehicles() {
  if (!pool) throw new Error("DATABASE_URL is not configured");
  const response = await fetch(SHEET_URL, { headers: { "User-Agent": "Fleet-ERP-GoogleSheetSync/1.0" } });
  if (!response.ok) throw new Error(`Google Sheet HTTP ${response.status}`);
  const rows = parseCsv(await response.text());
  if (rows.length < 2) throw new Error("Google Sheet contains no vehicle rows");
  const headers = rows[0];
  const indexes = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, findIndex(headers, names)]));
  if (indexes.plate < 0) throw new Error(`Vehicle/plate column not found. Headers: ${headers.join(", ")}`);

  let matched = 0, updated = 0;
  for (const values of rows.slice(1)) {
    const plate = String(values[indexes.plate] ?? "").trim(); if (!plate) continue;
    const code = indexes.code >= 0 ? String(values[indexes.code] ?? "").trim() : "";
    const driver = indexes.driver >= 0 ? String(values[indexes.driver] ?? "").trim() : "";
    const phone = indexes.phone >= 0 ? String(values[indexes.phone] ?? "").trim() : "";
    const km = indexes.km >= 0 ? cleanKm(values[indexes.km]) : null;
    const active = indexes.active >= 0 ? !isInactive(values[indexes.active]) : true;
    const result = await pool.query(`SELECT id FROM vehicles WHERE LOWER(TRIM(COALESCE(plate_number, ''))) = LOWER(TRIM($1)) OR ($2 <> '' AND LOWER(TRIM(COALESCE(plate_code, ''))) = LOWER(TRIM($2)) AND LOWER(TRIM(COALESCE(plate_number, ''))) = LOWER(TRIM($1))) LIMIT 1`, [plate, code]);
    if (!result.rows[0]) continue;
    matched++; const id = result.rows[0].id;
    const sets = ["updated_at = CURRENT_TIMESTAMP"]; const params = [];
    const add = (sql, value) => { params.push(value); sets.push(sql.replace("?", `$${params.length}`)); };
    if (driver) add("driver = ?", driver); if (phone) add("phone = ?", phone); if (km !== null) add("current_km = ?", km); if (active) add("status = ?", "Active");
    if (sets.length > 1) { await pool.query(`UPDATE vehicles SET ${sets.join(", ")} WHERE id = $${params.length + 1}`, [...params, id]); updated++; }
  }
  return { matched, updated, rows: rows.length - 1, syncedAt: new Date().toISOString() };
}

async function ensureReminderTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS km_daily_reminders (id BIGSERIAL PRIMARY KEY, vehicle_id BIGINT NOT NULL, reminder_date DATE NOT NULL, phone TEXT, channel TEXT NOT NULL DEFAULT 'sms', status TEXT NOT NULL DEFAULT 'sent', provider_response TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(vehicle_id, reminder_date, channel))`);
}

function buildKmReminder(vehicle) {
  const plate = `${vehicle.plate_number || ""} ${vehicle.plate_code || ""}`.trim();
  return `Fleet ERP – Daily KM Reminder\n\nVehicle: ${plate}\nDriver: ${vehicle.driver || "Driver"}\n\nYou have NOT entered today's odometer/KM reading. Please enter the current KM immediately.\n\nIf the daily KM reading is not recorded, responsibility for any engine damage or related issue may be assigned to the responsible driver according to company policy and investigation findings.\n\nPlease record the KM now.\n\n--- اردو ---\n\nآپ نے آج گاڑی کا اوڈومیٹر/KM ریڈنگ درج نہیں کیا۔ براہِ کرم موجودہ KM فوراً درج کریں۔\n\nاگر روزانہ KM ریڈنگ درج نہ کی گئی تو انجن کے کسی نقصان یا متعلقہ خرابی کی صورت میں کمپنی کی پالیسی اور تحقیقات کے مطابق ذمہ داری ڈرائیور پر عائد کی جا سکتی ہے۔\n\nبراہِ کرم ابھی KM درج کریں۔`;
}

async function sendSms(phone, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { sent: false, provider: "not-configured", response: "Twilio credentials are not configured" };
  const body = new URLSearchParams({ To: phone, From: from, Body: message });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const text = await response.text(); if (!response.ok) throw new Error(`Twilio HTTP ${response.status}: ${text.slice(0, 500)}`);
  return { sent: true, provider: "twilio", response: text.slice(0, 2000) };
}

async function runDailyKmReminders() {
  if (!pool) throw new Error("DATABASE_URL is not configured");
  await ensureReminderTable();
  const result = await pool.query(`SELECT id, plate_number, plate_code, driver, phone FROM vehicles WHERE COALESCE(LOWER(TRIM(status)), '') NOT IN ('inactive', 'sold', 'disposed', 'disabled') AND COALESCE(TRIM(phone), '') <> '' AND (meter_updated_at IS NULL OR (meter_updated_at AT TIME ZONE 'Asia/Riyadh')::date <> (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date) ORDER BY plate_number, plate_code`);
  let due = 0, sent = 0, skipped = 0;
  for (const vehicle of result.rows) {
    due++;
    const already = await pool.query(`SELECT id FROM km_daily_reminders WHERE vehicle_id = $1 AND reminder_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date AND channel = 'sms' LIMIT 1`, [vehicle.id]);
    if (already.rows[0]) { skipped++; continue; }
    try {
      const delivery = await sendSms(vehicle.phone, buildKmReminder(vehicle));
      await pool.query(`INSERT INTO km_daily_reminders (vehicle_id, reminder_date, phone, channel, status, provider_response) VALUES ($1, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date, $2, 'sms', $3, $4) ON CONFLICT (vehicle_id, reminder_date, channel) DO NOTHING`, [vehicle.id, vehicle.phone, delivery.sent ? "sent" : "not-configured", JSON.stringify(delivery)]);
      if (delivery.sent) sent++; else skipped++;
      console.log("[KMDailyReminder]", vehicle.plate_number, delivery.provider, delivery.sent ? "sent" : "not configured");
    } catch (error) { console.error("[KMDailyReminder]", vehicle.plate_number, error.message); }
  }
  return { due, sent, skipped, checkedAt: new Date().toISOString() };
}

async function run() {
  try { console.log("[GoogleSheetSync]", JSON.stringify(await syncGoogleSheetVehicles())); } catch (error) { console.error("[GoogleSheetSync]", error.message); }
  try { console.log("[KMDailyReminder]", JSON.stringify(await runDailyKmReminders())); } catch (error) { console.error("[KMDailyReminder]", error.message); }
}
run();
setInterval(run, INTERVAL_MS).unref();

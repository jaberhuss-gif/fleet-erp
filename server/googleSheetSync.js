import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { sendWhatsAppTemplate } from "./whatsapp.js";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const SHEET_URL = process.env.GOOGLE_SHEET_CSV_URL || "https://docs.google.com/spreadsheets/d/e/2PACX-1vT873ccxLpmdm3uv0lj_ZcC2rQgkbcateX777GvC2d878ORoES0rNaMA6N4QztCntqzYrUBwYQFYIhA/pub?output=csv";
const INTERVAL_MS = Math.max(Number(process.env.GOOGLE_SHEET_SYNC_INTERVAL_MS || 5 * 60 * 1000), 60 * 1000);
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 5000
    })
  : null;

const aliases = {
  plate: ["plate", "plate number", "plate_number", "vehicle", "vehicle number", "vehicle no", "vehicle no.", "car plate", "carplate", "registration", "registration number"],
  code: ["plate code", "plate_code", "code"],
  driver: ["driver", "driver name", "driver_name", "assigned driver"],
  phone: ["phone", "mobile", "mobile number", "driver phone", "driver mobile", "phone number"],
  km: [
    "km", "kilometer", "kilometre", "kilometres", "kilometers",
    "current km", "current_km", "current kilometer", "current kilometre",
    "current odometer", "current odometer km", "odometer", "odometer km",
    "odometer reading", "latest km", "latest odometer", "mileage", "current mileage"
  ],
  active: ["active", "status", "vehicle status"]
};

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findIndex(headers, names) {
  const wanted = new Set(names.map(normalize));
  return headers.findIndex((h) => wanted.has(normalize(h)));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1];

    if (c === '"' && quoted && n === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (c === '"') {
      quoted = !quoted;
      continue;
    }

    if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && n === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((v) => String(v).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    cell += c;
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((v) => String(v).trim() !== "")) rows.push(row);
  }

  return rows;
}

function cleanKm(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isInactive(value) {
  return ["inactive", "disabled", "sold", "disposed", "not active", "no"].includes(normalize(value));
}

export async function syncGoogleSheetVehicles() {
  if (!pool) throw new Error("DATABASE_URL is not configured");

  const response = await fetch(SHEET_URL, {
    headers: { "User-Agent": "Fleet-ERP-GoogleSheetSync/1.0" }
  });

  if (!response.ok) throw new Error(`Google Sheet HTTP ${response.status}`);

  const rows = parseCsv(await response.text());
  if (rows.length < 2) throw new Error("Google Sheet contains no vehicle rows");

  const headers = rows[0];
  const indexes = Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [key, findIndex(headers, names)])
  );

  if (indexes.plate < 0) {
    throw new Error(`Vehicle/plate column not found. Headers: ${headers.join(", ")}`);
  }

  let matched = 0;
  let updated = 0;
  let unmatched = 0;

  for (const values of rows.slice(1)) {
    const plate = String(values[indexes.plate] ?? "").trim();
    if (!plate) continue;

    const code = indexes.code >= 0 ? String(values[indexes.code] ?? "").trim() : "";
    const driver = indexes.driver >= 0 ? String(values[indexes.driver] ?? "").trim() : "";
    const phone = indexes.phone >= 0 ? String(values[indexes.phone] ?? "").trim() : "";
    const km = indexes.km >= 0 ? cleanKm(values[indexes.km]) : null;
    const active = indexes.active >= 0 ? !isInactive(values[indexes.active]) : null;

    const result = await pool.query(
      `SELECT id, current_km
       FROM vehicles
       WHERE LOWER(TRIM(COALESCE(plate_number, ''))) = LOWER(TRIM($1))
          OR (
            $2 <> ''
            AND LOWER(TRIM(COALESCE(plate_code, ''))) = LOWER(TRIM($2))
            AND LOWER(TRIM(COALESCE(plate_number, ''))) = LOWER(TRIM($1))
          )
       LIMIT 1`,
      [plate, code]
    );

    if (!result.rows[0]) {
      unmatched += 1;
      continue;
    }

    matched += 1;
    const id = result.rows[0].id;
    const sets = ["updated_at = CURRENT_TIMESTAMP"];
    const params = [];

    const add = (sql, value) => {
      params.push(value);
      sets.push(sql.replace("?", `$${params.length}`));
    };

    if (driver) add("driver = ?", driver);
    if (phone) add("phone = ?", phone);

    // Google Sheet KM is treated as a current/reference value only.
    // It MUST NOT update meter_updated_at because the daily KM reminder
    // must disappear only after a real KM entry is recorded in ERP.
    if (km !== null) {
      const existingKm = Number(result.rows[0].current_km || 0);
      add("current_km = ?", Math.max(km, existingKm));
    }

    if (active !== null) add("status = ?", active ? "Active" : "Inactive");

    await pool.query(
      `UPDATE vehicles SET ${sets.join(", ")} WHERE id = $${params.length + 1}`,
      [...params, id]
    );
    updated += 1;
  }

  return {
    matched,
    updated,
    unmatched,
    rows: rows.length - 1,
    syncedAt: new Date().toISOString()
  };
}

async function ensureReminderTable() {
  if (!pool) throw new Error("DATABASE_URL is not configured");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS km_daily_reminders (
      id BIGSERIAL PRIMARY KEY,
      vehicle_id BIGINT NOT NULL,
      reminder_date DATE NOT NULL,
      phone TEXT,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      status TEXT NOT NULL DEFAULT 'sent',
      provider_response TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(vehicle_id, reminder_date, channel)
    )
  `);
}

function buildKmReminder(vehicle) {
  const plate = `${vehicle.plate_number || ""} ${vehicle.plate_code || ""}`.trim();
  return { plate, driver: vehicle.driver || "Driver" };
}

async function sendMessage(phone, vehicle) {
  const { plate, driver } = buildKmReminder(vehicle);

  return sendWhatsAppTemplate({
    phone,
    bodyParameters: [plate, driver]
  });
}

async function runDailyKmReminders() {
  try {
    const { reconcileAndNotify } = await import("./kmDailyNotifications.js");
    return await reconcileAndNotify();
  } catch (error) {
    console.error("[KMDailyPush]", error.message);
    return { open: 0, resolved: 0, records: [] };
  }
}

async function run() {
  try {
    console.log("[GoogleSheetSync]", JSON.stringify(await syncGoogleSheetVehicles()));
  } catch (error) {
    console.error("[GoogleSheetSync]", error.message);
  }

  try {
    console.log("[KMDailyReminder]", JSON.stringify(await runDailyKmReminders()));
  } catch (error) {
    console.error("[KMDailyReminder]", error.message);
  }
}

let syncTimer = null;

export function startGoogleSheetVehicleSync() {
  if (syncTimer) return;

  run();
  syncTimer = setInterval(run, INTERVAL_MS);

  console.log(
    `Google Sheet vehicle sync and daily KM reminder enabled (${Math.round(INTERVAL_MS / 60000)} min interval)`
  );
}

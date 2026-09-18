import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { sendWhatsAppTemplate } from "./whatsapp.js";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const SHEET_URL =
  process.env.GOOGLE_SHEET_CSV_URL ||
  "https://docs.google.com/spreadsheets/d/12_WSi8KrHZ9-dtZzrlHmTCI-Jiwg7zDieJ5NU3-lVxY/gviz/tq?tqx=out:csv&gid=146635377";
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
    "current km", "current_km", "CurrentKM", "currentkm", "current kilometer", "current kilometre",
    "current odometer", "current odometer km", "odometer", "odometer km",
    "odometer reading", "latest km", "latest odometer", "mileage", "current mileage"
  ],
  active: ["active", "status", "vehicle status"],
  date: ["date", "datetime", "timestamp", "record date", "date time", "created at"]
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
  const exact = headers.findIndex((h) => wanted.has(normalize(h)));
  if (exact >= 0) return exact;

  // Google Sheets headers can include units, punctuation, or extra words,
  // e.g. "Current Odometer Reading (KM)".
  const normalizedHeaders = headers.map(normalize);
  for (const name of names) {
    const n = normalize(name);
    if (!n) continue;
    const fuzzy = normalizedHeaders.findIndex((h) => h.includes(n) || n.includes(h));
    if (fuzzy >= 0) return fuzzy;
  }
  return -1;
}

function findKmIndex(headers) {
  // Handle the exact sheet header "CurrentKM" as well as spacing,
  // underscores, punctuation, or hidden formatting around it.
  const normalizedHeaders = headers.map(normalize);
  const compactHeaders = headers.map((h) =>
    String(h ?? "")
      .replace(/[\s_().-]/g, "")
      .toLowerCase()
  );

  const exactCurrentKm = compactHeaders.findIndex((h) =>
    h === "currentkm" || h === "currentodometer" || h === "currentmileage"
  );
  if (exactCurrentKm >= 0) return exactCurrentKm;

  const preferredPatterns = [
    /current.*(km|kilometer|kilometre|odometer|mileage)/,
    /(km|kilometer|kilometre|odometer|mileage).*current/,
    /latest.*(km|kilometer|kilometre|odometer|mileage)/,
    /(odometer|mileage).*(reading|value)/,
    /(reading|value).*(odometer|mileage)/
  ];

  for (const pattern of preferredPatterns) {
    const index = normalizedHeaders.findIndex((h) => pattern.test(h));
    if (index >= 0) return index;
  }

  const generic = normalizedHeaders.findIndex((h) =>
    /(km|kilometer|kilometre|odometer|mileage)/.test(h) &&
    !/(last|previous|since|remaining|interval|change|service)/.test(h)
  );

  return generic;
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

function parseSheetDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Google Sheets CSV is returning dates in M/D/YYYY format.
  // Example: 4/29/2026 or 9/18/2026 05:25:11
  const m = raw.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})(?:\\s+(\\d{1,2}):([0-5]\\d)(?::([0-5]\\d))?)?$/);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4] || 0);
    const minute = Number(m[5] || 0);
    const secondValue = Number(m[6] || 0);

    let month = first;
    let day = second;

    // Support unambiguous D/M/Y rows as well.
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    // Sheet timestamps are treated as Saudi local time (UTC+3).
    return new Date(Date.UTC(
      year,
      month - 1,
      day,
      hour - 3,
      minute,
      secondValue
    ));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  indexes.km = findKmIndex(headers);

  // Known daily-KM sheet layout fallback: CurrentKM is immediately after Location.
  // Use it only when the header-based detector cannot find a KM column.
  if (indexes.km < 0 && headers.length >= 5) {
    const compactHeaders = headers.map((h) =>
      String(h ?? "")
        .replace(/[\s_().-]/g, "")
        .toLowerCase()
    );
    const hasDailyKmShape =
      compactHeaders.includes("lastoilkm") ||
      compactHeaders.includes("timestamp") ||
      compactHeaders.includes("datetime");
    if (hasDailyKmShape) indexes.km = 4;
  }

  if (indexes.plate < 0) {
    throw new Error(`Vehicle/plate column not found. Headers: ${headers.join(", ")}`);
  }

  // Records contains historical entries. Sync only the newest record for each vehicle.
  const latestRows = new Map();
  for (const values of rows.slice(1)) {
    const plate = String(values[indexes.plate] ?? "").trim();
    if (!plate) continue;
    const dateRaw = indexes.date >= 0 ? String(values[indexes.date] ?? "").trim() : "";
    const date = parseSheetDate(dateRaw);
    const previous = latestRows.get(plate);
    if (
      !previous ||
      (date && !previous.date) ||
      (date && previous.date && date.getTime() >= previous.date.getTime())
    ) {
      latestRows.set(plate, { values, date, dateRaw });
    }
  }

  let matched = 0;
  let updated = 0;
  let unmatched = 0;
  let kmFound = 0;
  let kmUpdated = 0;
  const samples = [];

  for (const { values, date, dateRaw } of latestRows.values()) {
    const plate = String(values[indexes.plate] ?? "").trim();
    if (!plate) continue;

    const code = indexes.code >= 0 ? String(values[indexes.code] ?? "").trim() : "";
    const driver = indexes.driver >= 0 ? String(values[indexes.driver] ?? "").trim() : "";
    const phone = indexes.phone >= 0 ? String(values[indexes.phone] ?? "").trim() : "";
    const kmRaw = indexes.km >= 0 ? String(values[indexes.km] ?? "").trim() : "";
    const km = indexes.km >= 0 ? cleanKm(values[indexes.km]) : null;
    if (km !== null) kmFound += 1;
    const active = indexes.active >= 0 ? !isInactive(values[indexes.active]) : null;

    // The sheet may provide a combined plate such as "2290 EUA",
    // while ERP stores it as plate_number="2290" and plate_code="EUA".
    // Try both the exact combined value and the split number/code form.
    const plateParts = plate.split(/\s+/).filter(Boolean);
    const combinedPlate = plateParts.join(" ").trim();
    const splitPlateNumber = plateParts[0] || "";
    const splitPlateCode = plateParts.slice(1).join(" ").trim();

    const result = await pool.query(
      `SELECT id, current_km, plate_number, plate_code
       FROM vehicles
       WHERE LOWER(TRIM(COALESCE(plate_number, ''))) = LOWER(TRIM($1))
          OR LOWER(TRIM(CONCAT_WS(' ', NULLIF(TRIM(plate_number), ''), NULLIF(TRIM(plate_code), '')))) = LOWER(TRIM($1))
          OR (
            $2 <> ''
            AND LOWER(TRIM(COALESCE(plate_code, ''))) = LOWER(TRIM($2))
            AND LOWER(TRIM(COALESCE(plate_number, ''))) = LOWER(TRIM($1))
          )
          OR (
            $3 <> ''
            AND LOWER(TRIM(COALESCE(plate_number, ''))) = LOWER(TRIM($3))
            AND LOWER(TRIM(COALESCE(plate_code, ''))) = LOWER(TRIM($4))
          )
       LIMIT 1`,
      [combinedPlate, code, splitPlateNumber, splitPlateCode]
    );

    if (!result.rows[0]) {
      unmatched += 1;
      continue;
    }

    matched += 1;
    if (samples.length < 10) {
      samples.push({
        plate,
        kmRaw,
        kmParsed: km,
        dateRaw,
        sheetDate: date ? date.toISOString() : null,
        existingKm: Number(result.rows[0].current_km || 0),
        matchedDbPlate: `${result.rows[0].plate_number || ""} ${result.rows[0].plate_code || ""}`.trim()
      });
    }
    const id = result.rows[0].id;
    const sets = ["updated_at = CURRENT_TIMESTAMP"];
    const params = [];

    const add = (sql, value) => {
      params.push(value);
      sets.push(sql.replace("?", `$${params.length}`));
    };

    if (driver) add("driver = ?", driver);
    if (phone) add("phone = ?", phone);

    // The latest Records row is the authoritative daily KM reading.
    if (km !== null) {
      const existingKm = Number(result.rows[0].current_km || 0);
      const nextKm = Math.max(km, existingKm);
      add("current_km = ?", nextKm);
      if (nextKm !== existingKm) kmUpdated += 1;
    }
    if (date) add("meter_updated_at = ?", date.toISOString());

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
    kmFound,
    kmUpdated,
    unmatched,
    rows: rows.length - 1,
    syncedAt: new Date().toISOString(),
    columns: {
      plate: indexes.plate >= 0 ? headers[indexes.plate] : null,
      driver: indexes.driver >= 0 ? headers[indexes.driver] : null,
      phone: indexes.phone >= 0 ? headers[indexes.phone] : null,
      km: indexes.km >= 0 ? headers[indexes.km] : null,
      date: indexes.date >= 0 ? headers[indexes.date] : null
    },
    samples
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

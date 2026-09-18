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
const MIN_RECORD_DATE = Date.UTC(2026, 4, 1, -3, 0, 0); // 2026-05-01 00:00 Asia/Riyadh
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

  const parts = raw.split(" ").filter(Boolean);
  const datePart = parts[0] || "";
  const timePart = parts[1] || "00:00:00";
  const datePieces = datePart.split("/").map(Number);

  if (datePieces.length !== 3 || datePieces.some((n) => !Number.isFinite(n))) {
    return null;
  }

  const first = datePieces[0];
  const second = datePieces[1];
  const year = datePieces[2];
  const timePieces = timePart.split(":").map(Number);
  const hour = Number.isFinite(timePieces[0]) ? timePieces[0] : 0;
  const minute = Number.isFinite(timePieces[1]) ? timePieces[1] : 0;
  const secondValue = Number.isFinite(timePieces[2]) ? timePieces[2] : 0;

  if (year < 2000) return null;

  const now = new Date();
  const candidates = [];

  // D/M/YYYY candidate
  if (first >= 1 && first <= 31 && second >= 1 && second <= 12) {
    candidates.push(new Date(Date.UTC(
      year, second - 1, first, hour - 3, minute, secondValue
    )));
  }

  // M/D/YYYY candidate
  if (first >= 1 && first <= 12 && second >= 1 && second <= 31) {
    candidates.push(new Date(Date.UTC(
      year, first - 1, second, hour - 3, minute, secondValue
    )));
  }

  const valid = candidates.filter((d) =>
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === year
  );

  if (!valid.length) return null;

  // The Records sheet should not contain future timestamps.
  // Prefer the latest candidate that is not in the future.
  const nowMs = now.getTime();
  const notFuture = valid.filter((d) => d.getTime() <= nowMs + 24 * 60 * 60 * 1000);

  if (notFuture.length) {
    return notFuture.sort((a, b) => b.getTime() - a.getTime())[0];
  }

  // Fallback: return the earliest valid interpretation.
  return valid.sort((a, b) => a.getTime() - b.getTime())[0];
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

    // Ignore all Records before May 1, 2026. April and earlier are not part of the source period.
    if (!date || date.getTime() < MIN_RECORD_DATE) continue;

    const previous = latestRows.get(plate);
    if (
      !previous ||
      (date && !previous.date) ||
      (date && previous.date && date.getTime() >= previous.date.getTime())
    ) {
      latestRows.set(plate, { values, date, dateRaw });
    }
  }

  const knownVehicleSample = [...latestRows.entries()]
    .find(([plate]) => plate.toLowerCase() === "2290 eua");

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

      // A vehicle counts as having today's KM only when the KM value itself
      // is present. The Sheet date alone must never resolve daily KM compliance.
      if (date) add("meter_updated_at = ?", date.toISOString());
    } else if (date) {
      // The latest Sheet row can exist for today while CurrentKM is blank.
      // Treat that as "no KM entered today" and clear the compliance timestamp.
      add("meter_updated_at = ?", null);
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
    kmFound,
    kmUpdated,
    unmatched,
    rows: rows.length - 1,
    syncedAt: new Date().toISOString(),
    sourcePeriodStart: "2026-05-01",
    columns: {
      plate: indexes.plate >= 0 ? headers[indexes.plate] : null,
      driver: indexes.driver >= 0 ? headers[indexes.driver] : null,
      phone: indexes.phone >= 0 ? headers[indexes.phone] : null,
      km: indexes.km >= 0 ? headers[indexes.km] : null,
      date: indexes.date >= 0 ? headers[indexes.date] : null
    },
    samples,
    knownVehicleSample: knownVehicleSample
      ? {
          plate: knownVehicleSample[0],
          dateRaw: knownVehicleSample[1].dateRaw,
          sheetDate: knownVehicleSample[1].date ? knownVehicleSample[1].date.toISOString() : null,
          kmRaw: knownVehicleSample[1].values[indexes.km] ?? null
        }
      : null
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

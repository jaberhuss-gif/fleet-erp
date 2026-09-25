import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { v2Query, v2Enabled } from "./v2/db.js";
import { FIXED_FLEET_VEHICLES } from "./dailyKm.js";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const SHEET_URL =
  process.env.GOOGLE_SHEET_CSV_URL ||
  "https://docs.google.com/spreadsheets/d/12_WSi8KrHZ9-dtZzrlHmTCI-Jiwg7zDieJ5NU3-lVxY/gviz/tq?tqx=out:csv&gid=146635377";
const INTERVAL_MS = Math.max(Number(process.env.GOOGLE_SHEET_SYNC_INTERVAL_MS || 5 * 60 * 1000), 60 * 1000);
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const MIN_RECORD_DATE = Date.UTC(2026, 4, 1, -3, 0, 0);
const SHEET_IMPORT_MARKER = "Google Sheet import";
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 5000
    })
  : null;

let syncInProgress = false;

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
  lastOilKm: ["last oil km", "last_oil_km", "last oil change km", "oil change km", "last service km", "last oil mileage"],
  lastOilDate: ["last oil change date", "last_oil_change_date", "oil change date", "last service date"],
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

  // Safety rule: never guess the KM column. A wrong column can become an
  // odometer reading and affect maintenance/oil-change decisions. Only an
  // explicitly named current/latest odometer field is accepted.
  return -1;
}

export function parseCsv(text) {
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

async function syncV2Km(plateNumber, plateCode, km, readingDate, meterUpdatedAt = null) {
  if (!v2Enabled() || km == null) return;
  const vehicle = (await v2Query(
    "SELECT id, current_km, meter_updated_at FROM fleet_erp_v2.vehicles WHERE plate_number=$1 AND plate_code=$2 LIMIT 1",
    [String(plateNumber || "").trim(), String(plateCode || "").trim().toUpperCase()]
  )).rows[0];
  if (!vehicle) return;

  const existingDay = vehicle.meter_updated_at
    ? String(vehicle.meter_updated_at).slice(0, 10)
    : null;
  const incomingDay = readingDate ? String(readingDate).slice(0, 10) : null;
  const incomingIsNewer =
    existingDay == null || (incomingDay != null && incomingDay > existingDay);

  await v2Query(
    "INSERT INTO fleet_erp_v2.km_readings(vehicle_id,reading_km,reading_date,notes) VALUES($1,$2,$3::date,$4) ON CONFLICT(vehicle_id,reading_date) DO UPDATE SET reading_km=EXCLUDED.reading_km,notes=EXCLUDED.notes",
    [vehicle.id, km, readingDate, "Google Sheet migration"]
  );

  // Mirror the v1 rule: only a strictly newer dated reading may move the odometer.
  if (incomingIsNewer) {
    await v2Query(
      "UPDATE fleet_erp_v2.vehicles SET current_km=$1::numeric, meter_updated_at=COALESCE($2::timestamptz,meter_updated_at), updated_at=CURRENT_TIMESTAMP WHERE id=$3::integer",
      [km, meterUpdatedAt, vehicle.id]
    );
  }
  // Google Sheet is an odometer/evidence source only.
  // It must never write Last Oil Change KM or Last Oil Change Date.
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

  const day = datePieces[0];
  const month = datePieces[1];
  const year = datePieces[2];
  const timePieces = timePart.split(":").map(Number);
  const hour = Number.isFinite(timePieces[0]) ? timePieces[0] : 0;
  const minute = Number.isFinite(timePieces[1]) ? timePieces[1] : 0;
  const secondValue = Number.isFinite(timePieces[2]) ? timePieces[2] : 0;

  if (year < 2000) return null;

  if (!(day >= 1 && day <= 31)) return null;
  if (!(month >= 1 && month <= 12)) return null;

  const parsed = new Date(Date.UTC(
    year,
    month - 1,
    day,
    hour - 3,
    minute,
    secondValue
  ));

  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getUTCFullYear() !== year) return null;

  return parsed;
}

async function syncKmRecordsToDb(rows, indexes) {
  if (indexes.plate < 0 || indexes.km < 0 || indexes.date < 0) {
    return { scanned: 0, inserted: 0, updated: 0, skipped: 0, unmatched: 0 };
  }

  const kmRecords = new Map();

  for (const values of rows.slice(1)) {
    const plate = String(values[indexes.plate] || '').trim();
    const kmRaw = String(values[indexes.km] || '').trim();
    const dateRaw = String(values[indexes.date] || '').trim();
    if (!plate || !kmRaw || !dateRaw) continue;

    const km = cleanKm(kmRaw);
    if (km === null || km <= 0) continue;

    const date = parseSheetDate(dateRaw);
    if (!date || date.getTime() < MIN_RECORD_DATE) continue;

    const plateParts = plate.split(/\s+/).filter(Boolean);
    const combinedPlate = plateParts.join(' ').trim();
    const splitPlateNumber = plateParts[0] || '';
    const splitPlateCode = plateParts.slice(1).join(' ').trim();

    const key = combinedPlate + '|' + date.toISOString().slice(0, 10);
    const existing = kmRecords.get(key);
    if (!existing || km > existing.km) {
      kmRecords.set(key, {
        plate: plate,
        km: km,
        dateKey: date.toISOString().slice(0, 10),
        combinedPlate: combinedPlate,
        splitPlateNumber: splitPlateNumber,
        splitPlateCode: splitPlateCode
      });
    }
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const record of kmRecords.values()) {
    const vehicle = await pool.query(
      "SELECT id FROM vehicles WHERE LOWER(TRIM(COALESCE(plate_number, ''))) = LOWER(TRIM($1)) OR LOWER(TRIM(CONCAT_WS(' ', NULLIF(TRIM(plate_number), ''), NULLIF(TRIM(plate_code), '')))) = LOWER(TRIM($1)) OR ($2 <> '' AND LOWER(TRIM(COALESCE(plate_number, ''))) = LOWER(TRIM($2)) AND LOWER(TRIM(COALESCE(plate_code, ''))) = LOWER(TRIM($3))) LIMIT 1",
      [record.combinedPlate, record.splitPlateNumber, record.splitPlateCode]
    );

    if (!vehicle.rows[0]) {
      unmatched += 1;
      continue;
    }

    const vehicleId = vehicle.rows[0].id;
    const readingDate = record.dateKey;

    const existingRecord = await pool.query(
      "SELECT id, reading_km, notes FROM km_records WHERE vehicle_id = $1 AND reading_date = $2 ORDER BY reading_km DESC, id DESC LIMIT 1",
      [vehicleId, readingDate]
    );

    if (existingRecord.rows[0]) {
      const existing = existingRecord.rows[0];
      const existingKm = Number(existing.reading_km);
      const existingNotes = String(existing.notes || "");

      // PostgreSQL ERP entries are authoritative. A Google Sheet row may only
      // update a row that was itself imported from the Sheet, and only when the
      // Sheet value is higher. ERP-entered readings are never overwritten.
      const wasImported = existingNotes.includes(SHEET_IMPORT_MARKER);

      if (!wasImported) {
        skipped += 1;
      } else if (record.km > existingKm) {
        await pool.query(
          "UPDATE km_records SET reading_km = $1, notes = $2 WHERE id = $3",
          [record.km, SHEET_IMPORT_MARKER, existing.id]
        );
        updated += 1;
      } else {
        skipped += 1;
      }
    } else {
      await pool.query(
        "INSERT INTO km_records (vehicle_id, plate, reading_km, reading_date, is_oil_change, notes, created_at) VALUES ($1, $2, $3, $4, 0, $5, CURRENT_TIMESTAMP)",
        [vehicleId, record.plate, record.km, readingDate, SHEET_IMPORT_MARKER]
      );
      inserted += 1;
    }

    try {
      await syncV2Km(record.splitPlateNumber, record.splitPlateCode, record.km, readingDate);
    } catch (error) {
      console.error("[GoogleSheetSync] V2 KM sync failed:", error.message);
    }

    // Google Sheet data is external/imported and is intentionally NOT allowed
    // to resolve Daily KM compliance. Ticket closing is handled exclusively by
    // the PostgreSQL-driven Daily KM reconciler.
  }

  return { scanned: kmRecords.size, inserted, updated, skipped, unmatched };
}

export async function getMonthlySavingsSheet() {
  const url =
    process.env.GOOGLE_MONTHLY_SAVINGS_CSV_URL ||
    "https://docs.google.com/spreadsheets/d/12_WSi8KrHZ9-dtZzrlHmTCI-Jiwg7zDieJ5NU3-lVxY/gviz/tq?tqx=out:csv&sheet=MonthlySavings";

  const response = await fetch(url, {
    headers: { "User-Agent": "Fleet-ERP-MonthlySavings/1.0" }
  });

  if (!response.ok) {
    throw new Error(`MonthlySavings Google Sheet HTTP ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) {
    return { source: "Google Sheet / MonthlySavings", headers: [], rows: [] };
  }

  return {
    source: "Google Sheet / MonthlySavings",
    headers: rows[0],
    rows: rows.slice(1)
  };
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

  // Do not fall back to a positional column such as column 5.
  // Column positions are unsafe: a future Sheet change could make oil KM,
  // previous KM, or another numeric field look like the odometer.
  if (indexes.km < 0) {
    throw new Error(
      `Current KM/odometer column not found. Refusing to import KM. Headers: ${headers.join(", ")}`
    );
  }

  if (indexes.plate < 0) {
    throw new Error(`Vehicle/plate column not found. Headers: ${headers.join(", ")}`);
  }

  // Live vehicle sync uses only the current Riyadh calendar day.
  // Historical sheet rows remain available but must never overwrite today's live state.
  const todayRiyadh = () => {
    const d = new Date(Date.now() + RIYADH_OFFSET_MS);
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  };
  const wantedDate = todayRiyadh();
  const latestRows = new Map();
  for (const values of rows.slice(1)) {
    const plate = String(values[indexes.plate] ?? "").trim();
    if (!plate) continue;
    const dateRaw = indexes.date >= 0 ? String(values[indexes.date] ?? "").trim() : "";
    const date = parseSheetDate(dateRaw);
    if (!date) continue;
    const localDate = new Date(date.getTime() + RIYADH_OFFSET_MS);
    const sheetDate = localDate.getUTCFullYear() + "-" + String(localDate.getUTCMonth() + 1).padStart(2, "0") + "-" + String(localDate.getUTCDate()).padStart(2, "0");
    if (sheetDate !== wantedDate) continue;
    const previous = latestRows.get(plate);
    if (!previous || date.getTime() >= previous.date.getTime()) {
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
    const lastOilKm = indexes.lastOilKm >= 0 ? cleanKm(values[indexes.lastOilKm]) : null;
    if (km !== null) kmFound += 1;
    const active = indexes.active >= 0 ? !isInactive(values[indexes.active]) : null;

    const plateParts = plate.split(/\s+/).filter(Boolean);
    const combinedPlate = plateParts.join(" ").trim();
    const splitPlateNumber = plateParts[0] || "";
    const splitPlateCode = plateParts.slice(1).join(" ").trim();

    const result = await pool.query(
      `SELECT id, current_km, last_oil_km, last_oil_change_date, meter_updated_at, plate_number, plate_code
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

    // Google Sheet is a temporary KM/evidence source during migration.
    // It must NEVER overwrite the ERP master assignment (driver/phone/status).
    // Vehicle assignment is maintained in PostgreSQL by Fleet Management.

    if (km !== null) {
      const existingKm = Number(result.rows[0].current_km || 0);
      const existingMeterAt = result.rows[0].meter_updated_at
        ? String(result.rows[0].meter_updated_at).slice(0, 10)
        : null;
      const sheetDay = date ? date.toISOString().slice(0, 10) : null;

      // Latest dated reading wins. The sheet row is authoritative only when it is
      // strictly newer than the odometer the ERP already holds. An older sheet row, or
      // one for a day the ERP has already covered, must never move the stored value —
      // that is what let a stale high figure become permanent. The ERP keeps the same-day
      // tie because a driver's own correction is the record of authority; the sheet is
      // evidence only.
      const sheetIsNewer =
        existingMeterAt == null || (sheetDay != null && sheetDay > existingMeterAt);
      const nextKm = sheetIsNewer ? km : existingKm;

      if (nextKm !== existingKm) {
        add("current_km = ?", nextKm);
        kmUpdated += 1;
        if (date) add("meter_updated_at = ?", date.toISOString());
      } else if (sheetDay == null && date) {
        add("meter_updated_at = ?", date.toISOString());
      }
    }

    // Last Oil Change KM is accepted only from the explicitly named Sheet
    // column. It can never move backwards. When Current KM == Last Oil KM on
    // the same dated row, the row is treated as an explicit same-day oil
    // change and is also written to oil_changes so the startup repair cannot
    // erase it later. Driver/phone remain ERP-controlled.
    const existingOilKm = Number(result.rows[0].last_oil_km || 0);
    const oilChangedToday =
      lastOilKm !== null &&
      km !== null &&
      lastOilKm === km &&
      lastOilKm > 0 &&
      date;

    if (oilChangedToday || (lastOilKm !== null && lastOilKm > existingOilKm)) {
      add("last_oil_km = ?", lastOilKm);
      if (oilChangedToday) {
        add("last_oil_change_date = ?", date.toISOString().slice(0, 10));
      }
    }

    await pool.query(
      `UPDATE vehicles SET ${sets.join(", ")} WHERE id = ${params.length + 1}`,
      [...params, id]
    );

    if (oilChangedToday) {
      try {
        await pool.query(
          `INSERT INTO oil_changes
             (vehicle_id, oil_change_km, oil_change_date, changed_by, notes)
           SELECT $1, $2, $3, 'Google Sheet', 'Google Sheet explicit same-day oil change'
           WHERE NOT EXISTS (
             SELECT 1 FROM oil_changes
             WHERE vehicle_id = $1 AND oil_change_km = $2
               AND oil_change_date::date = $3::date
           )`,
          [id, lastOilKm, date.toISOString().slice(0, 10)]
        );
      } catch (error) {
        console.error("[GoogleSheetSync] oil history sync failed:", error.message);
      }
    }

    if (km !== null) {
      try {
        await syncV2Km(
          splitPlateNumber,
          splitPlateCode,
          km,
          date ? date.toISOString().slice(0, 10) : wantedDate,
          date ? date.toISOString() : null
        );
      } catch (error) {
        console.error("[GoogleSheetSync] V2 current KM sync failed:", error.message);
      }
    }
    updated += 1;
  }

  let kmRecordsResult = { scanned: 0, inserted: 0, updated: 0, skipped: 0, unmatched: 0 };
  try {
    kmRecordsResult = await syncKmRecordsToDb(rows, indexes);
  } catch (error) {
    console.error("[GoogleSheetSync] km_records sync failed:", error.message);
  }

  return {
    matched,
    updated,
    kmFound,
    kmUpdated,
    unmatched,
    kmRecords: kmRecordsResult,
    rows: rows.length - 1,
    syncedAt: new Date().toISOString(),
    sourcePeriodStart: wantedDate,
    sourcePeriodEnd: wantedDate,
    currentDayOnly: true,
    columns: {
      plate: indexes.plate >= 0 ? headers[indexes.plate] : null,
      driver: indexes.driver >= 0 ? headers[indexes.driver] : null,
      phone: indexes.phone >= 0 ? headers[indexes.phone] : null,
      km: indexes.km >= 0 ? headers[indexes.km] : null,
      date: indexes.date >= 0 ? headers[indexes.date] : null,
      lastOilKm: indexes.lastOilKm >= 0 ? headers[indexes.lastOilKm] : null,
      lastOilDate: indexes.lastOilDate >= 0 ? headers[indexes.lastOilDate] : null
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


// Single shared definition of the 36-vehicle operational fleet.
const FIXED_DAILY_SUBMISSION_VEHICLES = FIXED_FLEET_VEHICLES;

// Legacy "Daily Vehicle Submission" ticket creation/closing was removed. Daily
// KM tickets (category = "Daily KM") are the single compliance ticket type,
// owned by dailyKm.js; the sheet-sync scheduler retires any legacy rows.

export async function getDailyVehicleSubmissionReport(targetDate = null) {
  if (!pool) throw new Error("DATABASE_URL is not configured");

  const { getDailyKmStatus } = await import("./dailyKm.js");

  // Legacy report shape, but the compliance decision is delegated to the single
  // authoritative Daily KM calculation so every report agrees. This report no
  // longer creates or closes tickets: Daily KM tickets are owned exclusively by
  // the PostgreSQL-driven reconciler.
  const compliance = await getDailyKmStatus(targetDate ? String(targetDate).slice(0, 10) : null);

  const records = compliance.records.map((r) => ({
    vehicleId: r.vehicleId,
    vehicle: r.vehiclePlate,
    driver: r.driverName,
    phone: r.driverPhone,
    location: r.location,
    submittedToday: r.status === "Submitted",
    submissionTimestamp: r.readingDate ? new Date(r.readingDate).toISOString() : null,
    sheetPlate: null,
    evidenceDateTime: r.readingDate ? new Date(r.readingDate).toISOString() : null,
    sheetDriver: "",
    sheetPhone: "",
    databaseVehicleFound: r.vehicleFound,
    status: r.status === "Submitted" ? "Submitted" : "Not Submitted",
    ticketStatus: null,
    ticketId: null
  }));

  return {
    success: true,
    reportDate: compliance.date,
    generatedAt: new Date().toISOString(),
    source: "ERP PostgreSQL km_records",
    temporarySource: null,
    googleSheetUsed: false,
    fixedVehicleCount: records.length,
    expectedVehicleCount: FIXED_DAILY_SUBMISSION_VEHICLES.length,
    vehicleCountMatchesExpected: records.length === FIXED_DAILY_SUBMISSION_VEHICLES.length,
    submittedCount: compliance.submittedCount,
    missingCount: compliance.missingCount,
    submissionPercent: compliance.submissionRate,
    missingVehicles: records.filter(r => !r.submittedToday),
    records
  };
}

async function runDailyKmReminders() {
  const { reconcileAndNotify } = await import("./kmDailyNotifications.js");
  return await reconcileAndNotify();
}

// Google Sheet synchronization only. Daily KM reconciliation and maintenance
// checks are scheduled independently by scheduler.js so a Sheet outage cannot
// stop compliance work. Exported so the scheduler can own the cadence.
export async function runGoogleSheetSyncOnce() {
  if (syncInProgress) {
    console.log("[GoogleSheetSync] Previous sync is still running; skipping overlapping run.");
    return { skipped: true };
  }

  syncInProgress = true;
  try {
    const summary = await syncGoogleSheetVehicles();
    console.log("[GoogleSheetSync]", JSON.stringify(summary));
    return summary;
  } finally {
    syncInProgress = false;
  }
}

// Kept for backwards compatibility: performs a full legacy pass in one go.
export async function legacyRunOnce() {
  const result = { sheetSync: null, dailyVehicleSubmission: null, kmDaily: null, maintenance: null };

  try {
    result.sheetSync = await runGoogleSheetSyncOnce();
  } catch (error) {
    console.error("[GoogleSheetSync]", error.message);
  }

  try {
    result.dailyVehicleSubmission = await getDailyVehicleSubmissionReport();
    console.log("[DailyVehicleSubmission]", JSON.stringify(result.dailyVehicleSubmission));
  } catch (error) {
    console.error("[DailyVehicleSubmission]", error.message);
  }

  try {
    result.kmDaily = await runDailyKmReminders();
    console.log("[KMDailyReminder]", JSON.stringify(result.kmDaily));
  } catch (error) {
    console.error("[KMDailyReminder]", error.message);
  }

  try {
    const { checkMaintenanceDue } = await import("./kmDailyNotifications.js");
    result.maintenance = await checkMaintenanceDue();
    console.log("[MaintenanceCheck]", JSON.stringify(result.maintenance));
  } catch (error) {
    console.error("[MaintenanceCheck]", error.message);
  }

  return result;
}

export { runDailyKmReminders };


import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

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
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 5000
    })
  : null;

let runInProgress = false;
let syncTimer = null;
let kmSevenAmTimer = null;

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
      "SELECT id, reading_km FROM km_records WHERE vehicle_id = $1 AND reading_date = $2 LIMIT 1",
      [vehicleId, readingDate]
    );

    if (existingRecord.rows[0]) {
      if (Number(existingRecord.rows[0].reading_km) !== record.km) {
        await pool.query(
          "UPDATE km_records SET reading_km = $1 WHERE id = $2",
          [record.km, existingRecord.rows[0].id]
        );
        updated += 1;
      } else {
        skipped += 1;
      }
    } else {
      await pool.query(
        "INSERT INTO km_records (vehicle_id, plate, reading_km, reading_date, is_oil_change, notes, created_at) VALUES ($1, $2, $3, $4, 0, '', CURRENT_TIMESTAMP)",
        [vehicleId, record.plate, record.km, readingDate]
      );
      inserted += 1;
    }
  }

  return { scanned: kmRecords.size, inserted: inserted, updated: updated, skipped: skipped, unmatched: unmatched };
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

  const latestRows = new Map();
  for (const values of rows.slice(1)) {
    const plate = String(values[indexes.plate] ?? "").trim();
    if (!plate) continue;

    const dateRaw = indexes.date >= 0 ? String(values[indexes.date] ?? "").trim() : "";
    const date = parseSheetDate(dateRaw);

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

    const plateParts = plate.split(/\s+/).filter(Boolean);
    const combinedPlate = plateParts.join(" ").trim();
    const splitPlateNumber = plateParts[0] || "";
    const splitPlateCode = plateParts.slice(1).join(" ").trim();

    const result = await pool.query(
      `SELECT id, current_km, meter_updated_at, plate_number, plate_code
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

    if (km !== null) {
      const existingKm = Number(result.rows[0].current_km || 0);
      const nextKm = Math.max(km, existingKm);
      add("current_km = ?", nextKm);
      if (nextKm !== existingKm) kmUpdated += 1;

      if (date) {
        add("meter_updated_at = ?", date.toISOString());
      }
    }

    if (active !== null) add("status = ?", active ? "Active" : "Inactive");

    await pool.query(
      `UPDATE vehicles SET ${sets.join(", ")} WHERE id = $${params.length + 1}`,
      [...params, id]
    );
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


const FIXED_DAILY_SUBMISSION_VEHICLES = [
  ["1357", "JER"], ["1369", "JER"], ["1543", "BUA"], ["1560", "EHR"],
  ["1706", "BUA"], ["1709", "BUA"], ["1712", "BUA"], ["1713", "BUA"],
  ["1715", "BUA"], ["1716", "BUA"], ["1722", "BUA"], ["1737", "BUA"],
  ["1738", "BUA"], ["2110", "EUA"], ["2158", "EUA"], ["2287", "EUA"],
  ["2290", "EUA"], ["2295", "EUA"], ["2344", "EUA"], ["2349", "EUA"],
  ["2687", "EUA"], ["3296", "DER"], ["4430", "JUA"], ["4431", "JUA"],
  ["4435", "JUA"], ["4463", "JUA"], ["4479", "JUA"], ["4481", "JUA"],
  ["4532", "LUA"], ["4533", "LUA"], ["4534", "LUA"], ["4538", "LUA"],
  ["4541", "LUA"], ["4980", "JUA"], ["5456", "TKA"], ["6183", "ZUA"]
];

const DAILY_SUBMISSION_TICKET_CATEGORY = "Daily Vehicle Submission";
const DAILY_SUBMISSION_TICKET_MARKER = "DAILY_VEHICLE_SUBMISSION_MISSING";

function normalizePlateKey(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

async function ensureDailyVehicleSubmissionTicket(record, reportDate) {
  const title = `Daily Vehicle Submission Missing — ${record.vehicle} — ${reportDate}`;
  const description = `Daily submission missing for ${record.vehicle} on ${reportDate}.`;
  const legacyDescription = `Daily submission missing for ${record.vehicle} on ${reportDate}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`DAILY_VEHICLE_SUBMISSION|${record.vehicle}|${reportDate}`]
    );

    const existing = await client.query(`
      SELECT id, status, title, description, opened_at, vehicle_id
      FROM tickets
      WHERE category = $1
        AND status IN ('Open', 'Acknowledged')
        AND (
          (
            vehicle_id = $2
            AND (
              title = $3
              OR title = 'Daily Vehicle Submission'
              OR description = $4
              OR description = $5
              OR description LIKE $6
            )
          )
          OR (
            vehicle_id IS NULL
            AND (
              title = $3
              OR title = 'Daily Vehicle Submission'
              OR description = $4
              OR description = $5
              OR description LIKE $6
            )
          )
        )
      ORDER BY id ASC
    `, [
      DAILY_SUBMISSION_TICKET_CATEGORY,
      record.vehicleId,
      title,
      legacyDescription,
      `${legacyDescription}.`,
      `%DAILY_VEHICLE_SUBMISSION_MISSING%date=${reportDate}%`
    ]);

    const matching = existing.rows.filter((ticket) => {
      const text = `${ticket.title || ""} ${ticket.description || ""}`;
      return (
        text.includes(record.vehicle) &&
        text.includes(reportDate) &&
        (
          text.includes("Daily Vehicle Submission") ||
          text.includes("Daily submission missing for") ||
          text.includes("DAILY_VEHICLE_SUBMISSION_MISSING")
        )
      );
    });

    if (matching.length > 0) {
      const primary = matching[0];

      await client.query(`
        UPDATE tickets
        SET title = $1,
            description = $2
        WHERE id = $3
      `, [title, description, primary.id]);

      for (const duplicate of matching.slice(1)) {
        await client.query(`
          UPDATE tickets
          SET status = 'Closed',
              closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
              closed_by = COALESCE(closed_by, 'System'),
              resolution_notes = CASE
                WHEN COALESCE(resolution_notes, '') = '' THEN
                  'Duplicate Daily Vehicle Submission ticket consolidated automatically.'
                ELSE resolution_notes
              END
          WHERE id = $1
            AND status <> 'Closed'
        `, [duplicate.id]);
      }

      await client.query("COMMIT");
      return { id: primary.id, status: "Open" };
    }

    const result = await client.query(`
      INSERT INTO tickets
        (vehicle_id, title, location, category, priority, status,
         description, reported_by, opened_at, department)
      VALUES
        ($1, $2, $3, $4, 'High', 'Open', $5, 'System',
         CURRENT_TIMESTAMP, 'Fleet')
      RETURNING id, status
    `, [
      record.vehicleId,
      title,
      record.location || "",
      DAILY_SUBMISSION_TICKET_CATEGORY,
      description
    ]);

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function closeDailyVehicleSubmissionTicket(record, reportDate, evidenceDateTime) {
  const title = `Daily Vehicle Submission Missing — ${record.vehicle} — ${reportDate}`;
  const legacyDescription = `Daily submission missing for ${record.vehicle} on ${reportDate}`;

  await pool.query(`
    UPDATE tickets
    SET status = 'Closed',
        closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
        closed_by = COALESCE(closed_by, 'System'),
        resolution_notes = CASE
          WHEN COALESCE(resolution_notes, '') = '' THEN $1
          ELSE resolution_notes
        END,
        title = $2,
        description = $3
    WHERE category = $4
      AND status IN ('Open', 'Acknowledged')
      AND (
        (
          vehicle_id = $5
          AND (
            title = $6
            OR title = 'Daily Vehicle Submission'
            OR description = $7
            OR description = $8
            OR description LIKE $9
          )
        )
        OR (
          vehicle_id IS NULL
          AND (
            title = $6
            OR title = 'Daily Vehicle Submission'
            OR description = $7
            OR description = $8
            OR description LIKE $9
          )
        )
      )
  `, [
    `Google Sheet submission detected for ${record.vehicle} on ${reportDate}. Evidence timestamp: ${evidenceDateTime || "record timestamp available"}.`,
    title,
    `Daily submission received for ${record.vehicle} on ${reportDate}.`,
    DAILY_SUBMISSION_TICKET_CATEGORY,
    record.vehicleId,
    title,
    legacyDescription,
    `${legacyDescription}.`,
    `%DAILY_VEHICLE_SUBMISSION_MISSING%date=${reportDate}%`
  ]);
}

export async function getDailyVehicleSubmissionReport(targetDate = null) {
  if (!pool) throw new Error("DATABASE_URL is not configured");

  const plateKeys = FIXED_DAILY_SUBMISSION_VEHICLES.map(([number, code]) =>
    normalizePlateKey(`${number} ${code}`)
  );

  const vehicleResult = await pool.query(`
    SELECT
      v.id,
      v.plate_number,
      v.plate_code,
      v.driver,
      v.phone,
      v.location,
      v.status
    FROM vehicles v
    ORDER BY v.plate_number, v.plate_code
  `);

  const dbByPlate = new Map();
  for (const v of vehicleResult.rows) {
    const key = normalizePlateKey(`${v.plate_number || ""} ${v.plate_code || ""}`);
    if (!dbByPlate.has(key)) dbByPlate.set(key, v);
  }

  const response = await fetch(SHEET_URL, {
    headers: { "User-Agent": "Fleet-ERP-DailyVehicleSubmission/1.0" }
  });
  if (!response.ok) throw new Error(`Google Sheet HTTP ${response.status}`);

  const rows = parseCsv(await response.text());
  if (rows.length < 1) throw new Error("Google Sheet contains no rows");

  const headers = rows[0];
  const plateIndex = findIndex(headers, aliases.plate);
  const dateIndex = findIndex(headers, aliases.date);
  const driverIndex = findIndex(headers, aliases.driver);
  const phoneIndex = findIndex(headers, aliases.phone);

  if (plateIndex < 0) {
    throw new Error(`Vehicle/plate column not found. Headers: ${headers.join(", ")}`);
  }
  if (dateIndex < 0) {
    throw new Error(`Date/time column not found. Headers: ${headers.join(", ")}`);
  }

  const todayRiyadh = () => {
    const d = new Date(Date.now() + RIYADH_OFFSET_MS);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };

  const wantedDate = String(targetDate || todayRiyadh()).slice(0, 10);
  const sheetByPlate = new Map();

  const fixedByKey = new Map();
  const fixedByNumber = new Map();

  for (const [number, code] of FIXED_DAILY_SUBMISSION_VEHICLES) {
    const fixedKey = normalizePlateKey(`${number} ${code}`);
    fixedByKey.set(fixedKey, fixedKey);
    fixedByNumber.set(normalizePlateKey(number), fixedKey);
  }

  function resolveSheetVehicleKey(value) {
    const rawKey = normalizePlateKey(value);
    if (!rawKey) return null;

    if (fixedByKey.has(rawKey)) return fixedByKey.get(rawKey);

    const numberMatch = rawKey.match(/^\d+/);
    if (numberMatch) {
      const byNumber = fixedByNumber.get(numberMatch[0]);
      if (byNumber) return byNumber;
    }

    return null;
  }

  for (const values of rows.slice(1)) {
    const plate = String(values[plateIndex] ?? "").trim();
    const rawDate = String(values[dateIndex] ?? "").trim();
    if (!plate || !rawDate) continue;

    const parsed = parseSheetDate(rawDate);
    if (!parsed) continue;

    const localDate = new Date(parsed.getTime() + RIYADH_OFFSET_MS);
    const sheetDate =
      `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth() + 1).padStart(2, "0")}-${String(localDate.getUTCDate()).padStart(2, "0")}`;

    if (sheetDate !== wantedDate) continue;

    const key = resolveSheetVehicleKey(plate);
    if (!key) continue;

    const existing = sheetByPlate.get(key);
    if (!existing || parsed.getTime() > existing.timestampMs) {
      sheetByPlate.set(key, {
        sheetPlate: plate,
        rawDate,
        timestampMs: parsed.getTime(),
        timestamp: parsed.toISOString(),
        sheetDriver: driverIndex >= 0 ? String(values[driverIndex] ?? "").trim() : "",
        sheetPhone: phoneIndex >= 0 ? String(values[phoneIndex] ?? "").trim() : ""
      });
    }
  }

  const records = [];
  for (const [number, code] of FIXED_DAILY_SUBMISSION_VEHICLES) {
    const vehicle = `${number} ${code}`;
    const key = normalizePlateKey(vehicle);
    const v = dbByPlate.get(key);
    const submitted = sheetByPlate.get(key) || null;

    const record = {
      vehicleId: v?.id || null,
      vehicle,
      driver: v?.driver || "",
      phone: v?.phone || "",
      location: v?.location || "",
      submittedToday: !!submitted,
      submissionTimestamp: submitted?.timestamp || null,
      sheetPlate: submitted?.sheetPlate || null,
      evidenceDateTime: submitted?.rawDate || null,
      sheetDriver: submitted?.sheetDriver || "",
      sheetPhone: submitted?.sheetPhone || "",
      databaseVehicleFound: !!v,
      status: submitted ? "Submitted" : "Not Submitted",
      ticketStatus: null,
      ticketId: null
    };

    if (!submitted && v?.id) {
      const ticket = await ensureDailyVehicleSubmissionTicket(record, wantedDate);
      record.ticketId = ticket?.id || null;
      record.ticketStatus = ticket?.status || "Open";
    } else if (submitted && v?.id) {
      await closeDailyVehicleSubmissionTicket(record, wantedDate, submitted.rawDate);
      record.ticketStatus = "Closed";
    }

    records.push(record);
  }

  const submitted = records.filter(r => r.submittedToday).length;
  const missing = records.length - submitted;

  return {
    success: true,
    reportDate: wantedDate,
    generatedAt: new Date().toISOString(),
    source: "Google Sheet",
    fixedVehicleCount: records.length,
    expectedVehicleCount: FIXED_DAILY_SUBMISSION_VEHICLES.length,
    vehicleCountMatchesExpected: records.length === FIXED_DAILY_SUBMISSION_VEHICLES.length,
    submittedCount: submitted,
    missingCount: missing,
    submissionPercent: records.length ? (submitted / records.length) * 100 : 0,
    missingVehicles: records.filter(r => !r.submittedToday),
    records
  };
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
  if (runInProgress) {
    console.log("[GoogleSheetSync] Previous reconciliation is still running; skipping overlapping run.");
    return;
  }

  runInProgress = true;
  try {
    await runOnce();
  } finally {
    runInProgress = false;
  }
}

async function runOnce() {
  try {
    console.log("[GoogleSheetSync]", JSON.stringify(await syncGoogleSheetVehicles()));
  } catch (error) {
    console.error("[GoogleSheetSync]", error.message);
  }

  try {
    console.log("[DailyVehicleSubmission]", JSON.stringify(await getDailyVehicleSubmissionReport()));
  } catch (error) {
    console.error("[DailyVehicleSubmission]", error.message);
  }

  try {
    console.log("[KMDailyReminder]", JSON.stringify(await runDailyKmReminders()));
  } catch (error) {
    console.error("[KMDailyReminder]", error.message);
  }

  try {
    const { checkMaintenanceDue } = await import("./kmDailyNotifications.js");
    console.log("[MaintenanceCheck]", JSON.stringify(await checkMaintenanceDue()));
  } catch (error) {
    console.error("[MaintenanceCheck]", error.message);
  }
}

function millisUntilNextSevenAm() {
  const now = Date.now();
  const riyadhNow = new Date(now + RIYADH_OFFSET_MS);

  const targetUtcLike = Date.UTC(
    riyadhNow.getUTCFullYear(),
    riyadhNow.getUTCMonth(),
    riyadhNow.getUTCDate(),
    7, 0, 0, 0
  );

  let delay = targetUtcLike - riyadhNow.getTime();
  if (delay <= 0) {
    const tomorrow = new Date(targetUtcLike);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    delay = tomorrow.getTime() - riyadhNow.getTime();
  }

  return Math.max(1000, delay);
}

export function startGoogleSheetVehicleSync() {
  if (syncTimer || kmSevenAmTimer) return;

  run();

  const scheduleSevenAmCheck = () => {
    kmSevenAmTimer = setTimeout(async () => {
      await run();
      scheduleSevenAmCheck();
    }, millisUntilNextSevenAm());
  };
  scheduleSevenAmCheck();

  syncTimer = setInterval(run, INTERVAL_MS);

  console.log(
    `Google Sheet vehicle sync and daily KM reminder enabled (${Math.round(INTERVAL_MS / 60000)} min interval; daily cutoff 07:00)`
  );
}

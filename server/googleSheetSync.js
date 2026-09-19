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
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
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

    // The latest Records row is the authoritative daily KM reading.
    if (km !== null) {
      const existingKm = Number(result.rows[0].current_km || 0);
      const nextKm = Math.max(km, existingKm);
      add("current_km = ?", nextKm);
      if (nextKm !== existingKm) kmUpdated += 1;

      // A vehicle counts as having today's KM only when the KM value itself
      // is present. The Sheet date alone must never resolve daily KM compliance.
      const existingMeterUpdatedAt = result.rows[0].meter_updated_at
        ? new Date(result.rows[0].meter_updated_at)
        : null;

      // Keep a newer ERP reading authoritative. The temporary Google Sheet
      // source may fill a missing reading, but must never overwrite a newer
      // ERP timestamp during the transition period.
      if (
        date &&
        (!existingMeterUpdatedAt ||
          Number.isNaN(existingMeterUpdatedAt.getTime()) ||
          date.getTime() > existingMeterUpdatedAt.getTime())
      ) {
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
  const marker = `${DAILY_SUBMISSION_TICKET_MARKER}|vehicle=${record.vehicleId}|date=${reportDate}`;
  const title = `Daily Vehicle Submission Missing — ${record.vehicle} — ${reportDate}`;
  const description = `Daily submission missing for ${record.vehicle} on ${reportDate}.`;

  const existing = await pool.query(`
    SELECT id, status
    FROM tickets
    WHERE vehicle_id = $1
      AND category = $2
      AND title = $3
      AND status IN ('Open', 'Acknowledged')
    ORDER BY id DESC
    LIMIT 1
  `, [record.vehicleId, DAILY_SUBMISSION_TICKET_CATEGORY, title]);

  if (existing.rows[0]) return existing.rows[0];

  // Convert legacy long-description tickets to the new short format.
  const legacy = await pool.query(`
    SELECT id
    FROM tickets
    WHERE vehicle_id = $1
      AND category = $2
      AND description LIKE $3
      AND status IN ('Open', 'Acknowledged')
    ORDER BY id DESC
    LIMIT 1
  `, [record.vehicleId, DAILY_SUBMISSION_TICKET_CATEGORY, `%${marker}%`]);

  if (legacy.rows[0]) {
    await pool.query(`
      UPDATE tickets
      SET title = $1,
          description = $2
      WHERE id = $3
    `, [title, description, legacy.rows[0].id]);

    return { id: legacy.rows[0].id, status: "Open" };
  }

  const result = await pool.query(`
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

  return result.rows[0];
}
async function closeDailyVehicleSubmissionTicket(record, reportDate, evidenceDateTime) {
  const marker = `${DAILY_SUBMISSION_TICKET_MARKER}|vehicle=${record.vehicleId}|date=${reportDate}`;

  await pool.query(`
    UPDATE tickets
    SET status = 'Closed',
        closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
        closed_by = COALESCE(closed_by, 'System'),
        resolution_notes = CASE
          WHEN COALESCE(resolution_notes, '') = '' THEN $3
          ELSE resolution_notes
        END
    WHERE vehicle_id = $1
      AND category = $2
      AND description LIKE $4
      AND status <> 'Closed'
  `, [
    record.vehicleId,
    DAILY_SUBMISSION_TICKET_CATEGORY,
    `Google Sheet submission detected for ${record.vehicle} on ${reportDate}. Evidence timestamp: ${evidenceDateTime || "record timestamp available"}.`,
    `%${marker}%`
  ]);
}

export async function getDailyVehicleSubmissionReport(targetDate = null) {
  if (!pool) throw new Error("DATABASE_URL is not configured");

  // Compliance is based ONLY on this fixed operational list of 36 vehicles.
  // Driver name/phone are reference information only; a driver may use more than one vehicle.
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

  // Keep the latest timestamp for each fixed vehicle on the requested date.
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

    const key = normalizePlateKey(plate);
    if (!plateKeys.includes(key)) continue;

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

    // A fixed vehicle missing from the DB is still monitored and reported,
    // but no ticket can be created without a valid vehicle_id.
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

  // Reconcile the fixed 36-vehicle daily submission compliance on every
  // background sync so missing tickets are created automatically and
  // submitted vehicles close their ticket automatically.
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
}

let syncTimer = null;
let kmSevenAmTimer = null;

function millisUntilNextSevenAm() {
  // Asia/Riyadh is UTC+03:00 year-round. Calculate the next 07:00 in that
  // fixed-offset local time so the reminder is not affected by Render's host TZ.
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

  // Sync immediately, but reconcileAndNotify itself enforces the 07:00 cutoff.
  run();

  // Guarantee the first daily compliance run happens exactly at 07:00 local time,
  // regardless of when the backend process started.
  const scheduleSevenAmCheck = () => {
    kmSevenAmTimer = setTimeout(async () => {
      await run();
      scheduleSevenAmCheck();
    }, millisUntilNextSevenAm());
  };
  scheduleSevenAmCheck();

  // Continue the normal 5-minute sync loop for Google Sheet updates.
  syncTimer = setInterval(run, INTERVAL_MS);

  console.log(
    `Google Sheet vehicle sync and daily KM reminder enabled (${Math.round(INTERVAL_MS / 60000)} min interval; daily cutoff 07:00)`
  );
}

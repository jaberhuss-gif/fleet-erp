import { query } from "./postgres.js";
import { parseCsv } from "./googleSheetSync.js";
import { toDayKey, resolveLatestKm, KM_STATUS } from "./kmSource.js";
import {
  FIXED_FLEET_VEHICLES,
  normalizePlateKey,
  resolveRiyadhDate,
  DAILY_KM_TZ
} from "./dailyKm.js";

const SHEET_URL =
  process.env.GOOGLE_SHEET_CSV_URL ||
  "https://docs.google.com/spreadsheets/d/12_WSi8KrHZ9-dtZzrlHmTCI-Jiwg7zDieJ5NU3-lVxY/gviz/tq?tqx=out:csv&gid=146635377";

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findIndex(headers, aliases) {
  const wanted = new Set(aliases.map(normalizeHeader));
  const exact = headers.findIndex((h) => wanted.has(normalizeHeader(h)));
  if (exact >= 0) return exact;
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const a = normalizeHeader(alias);
    const found = normalized.findIndex((h) => h.includes(a) || a.includes(h));
    if (found >= 0) return found;
  }
  return -1;
}

function cleanKm(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseSheetDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  const dateParts = String(parts[0] || "").split("/").map(Number);
  const timeParts = String(parts[1] || "00:00:00").split(":").map(Number);
  if (dateParts.length !== 3 || dateParts.some((n) => !Number.isFinite(n))) return null;
  const [day, month, year] = dateParts;
  const hour = Number.isFinite(timeParts[0]) ? timeParts[0] : 0;
  const minute = Number.isFinite(timeParts[1]) ? timeParts[1] : 0;
  const second = Number.isFinite(timeParts[2]) ? timeParts[2] : 0;
  if (year < 2000 || day < 1 || day > 31 || month < 1 || month > 12) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function localDateKey(date) {
  const local = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return [
    local.getUTCFullYear(),
    String(local.getUTCMonth() + 1).padStart(2, "0"),
    String(local.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function plateLabel([number, code]) {
  return `${number} ${code}`.trim();
}

export async function getDailySubmissionReport(targetDate = null) {
  const reportDate = await resolveRiyadhDate(targetDate || null);

  const fleetResult = await query(`
    SELECT id, plate_number, plate_code, driver, phone, location, current_km
    FROM vehicles
  `);

  const byPlate = new Map();
  for (const row of fleetResult.rows) {
    const key = normalizePlateKey(`${row.plate_number || ""} ${row.plate_code || ""}`);
    if (key && !byPlate.has(key)) byPlate.set(key, row);
  }

  const readingsResult = await query(`
    SELECT DISTINCT ON (vehicle_id)
      vehicle_id, reading_km, reading_date, created_at, notes, is_oil_change, id
    FROM km_records
    WHERE reading_date::date = $1::date
    ORDER BY vehicle_id, reading_km DESC, id DESC
  `, [reportDate]);

  const erpByVehicle = new Map();
  for (const row of readingsResult.rows) {
    erpByVehicle.set(Number(row.vehicle_id), row);
  }

  const response = await fetch(SHEET_URL, {
    headers: { "User-Agent": "Fleet-ERP-DailySubmissionReport/1.0" }
  });
  if (!response.ok) {
    throw new Error(`Google Sheet HTTP ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) throw new Error("Google Sheet contains no rows");

  const headers = rows[0];
  const plateIndex = findIndex(headers, [
    "plate", "plate number", "plate_number", "vehicle", "vehicle number",
    "vehicle no", "vehicle no.", "car plate", "registration", "registration number"
  ]);
  const codeIndex = findIndex(headers, ["plate code", "plate_code", "code"]);
  const driverIndex = findIndex(headers, ["driver", "driver name", "driver_name", "assigned driver"]);
  const phoneIndex = findIndex(headers, ["phone", "mobile", "mobile number", "driver phone", "driver mobile", "phone number"]);
  const kmIndex = findIndex(headers, [
    "km", "kilometer", "kilometre", "current km", "current_km", "current odometer",
    "odometer", "odometer reading", "latest km", "mileage", "current mileage"
  ]);
  const dateIndex = findIndex(headers, ["date", "datetime", "timestamp", "record date", "date time", "created at"]);

  if (plateIndex < 0 || kmIndex < 0 || dateIndex < 0) {
    throw new Error(`Google Sheet Daily KM columns not found. Headers: ${headers.join(", ")}`);
  }

  const sheetByPlate = new Map();
  for (const values of rows.slice(1)) {
    const rawPlate = String(values[plateIndex] || "").trim();
    if (!rawPlate) continue;

    const code = codeIndex >= 0 ? String(values[codeIndex] || "").trim() : "";
    const combinedPlate = [rawPlate, code].filter(Boolean).join(" ").trim();
    const parsedDate = parseSheetDate(values[dateIndex]);
    if (!parsedDate || localDateKey(parsedDate) !== reportDate) continue;

    const km = cleanKm(values[kmIndex]);
    if (km === null || km <= 0) continue;

    const key = normalizePlateKey(combinedPlate);
    const previous = sheetByPlate.get(key);
    if (!previous || parsedDate.getTime() >= previous.date.getTime()) {
      sheetByPlate.set(key, {
        plate: combinedPlate,
        driver: driverIndex >= 0 ? String(values[driverIndex] || "").trim() : "",
        phone: phoneIndex >= 0 ? String(values[phoneIndex] || "").trim() : "",
        km,
        date: parsedDate
      });
    }
  }

  const records = FIXED_FLEET_VEHICLES.map((plate) => {
    const label = plateLabel(plate);
    const vehicle = byPlate.get(normalizePlateKey(label)) || null;
    const erp = vehicle ? erpByVehicle.get(Number(vehicle.id)) || null : null;
    const sheet = sheetByPlate.get(normalizePlateKey(label)) || null;
    const submitted = Boolean(erp || sheet);

    // The two sources are reported side by side instead of one silently shadowing the
    // other. `km` is the latest dated value; a same-day disagreement is flagged rather
    // than hidden. `mismatch` is what the review screen needs to surface.
    const erpKm = erp ? Number(erp.reading_km) : null;
    const sheetKm = sheet ? Number(sheet.km) : null;
    const erpDate = erp?.reading_date ? String(erp.reading_date).slice(0, 10) : null;
    const sheetDate = sheet?.date ? toDayKey(sheet.date) : null;

    let source = "Not Submitted";
    if (erp && sheet) source = "ERP + Google Sheet";
    else if (erp) source = "ERP";
    else if (sheet) source = "Google Sheet";

    // Reuse the same reconciliation the write path uses, so the number shown here can
    // never disagree with the number that was actually persisted.
    const resolution = resolveLatestKm({
      erp: erp ? { km: erpKm, date: erpDate } : null,
      sheet: sheet ? { km: sheetKm, date: sheetDate } : null
    });
    const disagreement = resolution.status === KM_STATUS.MISMATCH;

    return {
      vehicleId: vehicle ? Number(vehicle.id) : null,
      vehicle: label,
      driver: vehicle?.driver || sheet?.driver || "",
      phone: vehicle?.phone || sheet?.phone || "",
      location: vehicle?.location || "",
      currentKm: Number(vehicle?.current_km || 0),
      erpKm,
      googleSheetKm: sheetKm,
      erpDate,
      googleSheetDate: sheetDate,
      // When both sides share a date the reconciliation declines to choose, so fall back
      // to a display value rather than showing nothing.
      km: resolution.authoritative ?? sheetKm ?? erpKm,
      mismatch: disagreement,
      variance: disagreement ? resolution.variance : 0,
      source,
      submittedToday: submitted,
      status: submitted ? "Submitted" : "Not Submitted",
      erpTimestamp: erp?.created_at ? new Date(erp.created_at).toISOString() : null,
      googleSheetTimestamp: sheet?.date ? sheet.date.toISOString() : null,
      erpIsOilChange: Boolean(erp?.is_oil_change),
      timestamp: sheet?.date
        ? sheet.date.toISOString()
        : (erp?.created_at ? new Date(erp.created_at).toISOString() : null)
    };
  });

  const submitted = records.filter((r) => r.submittedToday);
  const missing = records.filter((r) => !r.submittedToday);

  return {
    success: true,
    reportDate,
    timezone: DAILY_KM_TZ,
    generatedAt: new Date().toISOString(),
    fixedVehicleCount: records.length,
    submittedCount: submitted.length,
    missingCount: missing.length,
    submissionPercent: records.length ? (submitted.length / records.length) * 100 : 0,
    submitted,
    missing,
    records
  };
}

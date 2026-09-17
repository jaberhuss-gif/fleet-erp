import { query } from "./postgres.js";

const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT873ccxLpmdm3uv0lj_ZcC2rQgkbcateX777GvC2d878ORoES0rNaMA6N4QztCntqzYrUBwYQFYIhA/pub?output=csv";
const SHEET_URL = process.env.GOOGLE_SHEET_CSV_URL || DEFAULT_SHEET_URL;
const SYNC_INTERVAL_MS = Math.max(Number(process.env.GOOGLE_SHEET_SYNC_INTERVAL_MS || 300000), 60000);

function normalize(value = "") {
  return String(value)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some(v => String(v).trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some(v => String(v).trim() !== "")) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map(normalize);
  return rows.slice(1).map(values => {
    const item = {};
    headers.forEach((header, index) => { if (header) item[header] = String(values[index] ?? "").trim(); });
    return item;
  });
}

function pick(row, aliases) {
  for (const alias of aliases) {
    const value = row[normalize(alias)];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function plateKey(value = "") {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function numeric(value) {
  const cleaned = String(value || "").replace(/,/g, "").replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractVehicle(row) {
  const plate = pick(row, [
    "plate", "plate number", "plate_number", "vehicle number", "vehicle no", "vehicle no.",
    "vehicle number/plate", "registration", "registration number", "رقم السيارة", "رقم المركبة", "اللوحة", "رقم اللوحه"
  ]);
  const driver = pick(row, ["driver", "driver name", "driver_name", "السائق", "اسم السائق"]);
  const phone = pick(row, ["phone", "driver phone", "driver_phone", "mobile", "mobile number", "telephone", "الجوال", "رقم الجوال", "رقم الهاتف"]);
  const kmRaw = pick(row, ["current km", "current_km", "km", "odometer", "odometer reading", "kilometer", "kilometre", "العداد", "عداد الكيلو", "الكيلومترات"]);
  return { plate, driver, phone, currentKm: numeric(kmRaw) };
}

export async function syncVehiclesFromGoogleSheet() {
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(SHEET_URL, { headers: { "User-Agent": "Fleet-ERP-Google-Sheet-Sync/1.0" } });
    if (!response.ok) throw new Error(`Google Sheet HTTP ${response.status}`);
    const csv = await response.text();
    const rows = parseCsv(csv);
    if (!rows.length) return { success: true, updated: 0, skipped: 0, unmatched: 0, rows: 0, startedAt };

    const dbResult = await query(`SELECT id, plate_number, plate_code, driver, phone, current_km FROM vehicles ORDER BY id`);
    const byPlate = new Map();
    for (const v of dbResult.rows) {
      const full = `${v.plate_number || ""} ${v.plate_code || ""}`.trim();
      byPlate.set(plateKey(full), v);
      byPlate.set(plateKey(v.plate_number || ""), v);
    }

    let updated = 0;
    let skipped = 0;
    let unmatched = 0;
    const unmatchedPlates = [];

    for (const row of rows) {
      const item = extractVehicle(row);
      if (!item.plate) { skipped += 1; continue; }
      const vehicle = byPlate.get(plateKey(item.plate));
      if (!vehicle) {
        unmatched += 1;
        if (unmatchedPlates.length < 20) unmatchedPlates.push(item.plate);
        continue;
      }

      const driver = item.driver || vehicle.driver || "";
      const phone = item.phone || vehicle.phone || "";
      const km = item.currentKm !== null ? Math.max(item.currentKm, Number(vehicle.current_km || 0)) : Number(vehicle.current_km || 0);

      await query(
        `UPDATE vehicles
         SET driver = $1,
             phone = $2,
             current_km = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [driver, phone, km, vehicle.id]
      );
      updated += 1;
    }

    return { success: true, updated, skipped, unmatched, unmatchedPlates, rows: rows.length, syncedAt: new Date().toISOString() };
  } catch (error) {
    console.error("Google Sheet vehicle sync failed:", error.message);
    return { success: false, error: error.message, updated: 0, skipped: 0, unmatched: 0, startedAt };
  }
}

let syncTimer = null;
export function startGoogleSheetVehicleSync() {
  if (syncTimer) return;
  syncVehiclesFromGoogleSheet();
  syncTimer = setInterval(() => { syncVehiclesFromGoogleSheet(); }, SYNC_INTERVAL_MS);
  console.log(`Google Sheet vehicle sync enabled (${Math.round(SYNC_INTERVAL_MS / 60000)} min interval)`);
}

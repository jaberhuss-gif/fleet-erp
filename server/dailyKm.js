// Authoritative Daily KM compliance service.
//
// PostgreSQL `km_records` is the single source of truth for Daily KM
// compliance. Google Sheet data is never consulted here.
//
// Daily KM uses the operational vehicles currently stored in Vehicle Master.
// The vehicle (plate/id) is the matching key, never the driver. This keeps
// Daily KM synchronized with the centralized Vehicle Master instead of a
// hard-coded fleet list.

import { query, transaction } from "./postgres.js";

export const DAILY_KM_TZ = "Asia/Riyadh";
export const DAILY_KM_CUTOFF_HOUR = 7;

// Fixed operational fleet (36 vehicles) used for Daily KM compliance.
export const FIXED_FLEET_VEHICLES = [
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

// Kept for legacy imports; authoritative Daily KM count is calculated from
// Vehicle Master at request time.
export const FLEET_VEHICLE_COUNT = FIXED_FLEET_VEHICLES.length;

export function normalizePlateKey(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function plateLabel([number, code]) {
  return `${number} ${code}`.trim();
}

function fleetPlateKey([number, code]) {
  return normalizePlateKey(`${number} ${code}`);
}

// Resolve the Riyadh calendar date. Never trust the server-local/UTC date.
export async function getRiyadhToday() {
  const result = await query(
    `SELECT (CURRENT_TIMESTAMP AT TIME ZONE $1)::date::text AS today`,
    [DAILY_KM_TZ]
  );
  return result.rows[0].today;
}

export async function getRiyadhState() {
  const result = await query(`
    SELECT
      (CURRENT_TIMESTAMP AT TIME ZONE $1)::date::text AS today,
      EXTRACT(HOUR FROM (CURRENT_TIMESTAMP AT TIME ZONE $1))::int AS hour,
      EXTRACT(MINUTE FROM (CURRENT_TIMESTAMP AT TIME ZONE $1))::int AS minute
  `, [DAILY_KM_TZ]);
  const state = result.rows[0];
  return {
    today: state.today,
    hour: Number(state.hour || 0),
    minute: Number(state.minute || 0),
    beforeCutoff: Number(state.hour || 0) < DAILY_KM_CUTOFF_HOUR
  };
}

// Normalize a requested date to a YYYY-MM-DD string, defaulting to Riyadh today.
export async function resolveRiyadhDate(requestedDate = null) {
  const result = await query(`
    SELECT COALESCE(
      NULLIF(TRIM($1), ''),
      (CURRENT_TIMESTAMP AT TIME ZONE $2)::date::text
    )::date::text AS report_date
  `, [requestedDate, DAILY_KM_TZ]);
  return result.rows[0].report_date;
}

// Load the operational vehicles directly from the centralized Vehicle Master.
// Test/placeholder vehicle "test 123" and explicitly inactive vehicles are excluded.
async function loadFleetVehicles() {
  const result = await query(`
    SELECT id, plate_number, plate_code, driver, phone, current_km, location,
           COALESCE(LOWER(TRIM(status)), '') AS status
    FROM vehicles
    WHERE COALESCE(LOWER(TRIM(status)), '') <> 'inactive'
      AND normalize_plate IS NOT NULL
  `).catch(async () => query(`
    SELECT id, plate_number, plate_code, driver, phone, current_km, location,
           COALESCE(LOWER(TRIM(status)), '') AS status
    FROM vehicles
    WHERE COALESCE(LOWER(TRIM(status)), '') <> 'inactive'
  `));

  const vehicles = [];
  for (const row of result.rows) {
    const key = normalizePlateKey(`${row.plate_number || ""} ${row.plate_code || ""}`);
    if (!key || key === normalizePlateKey("test 123")) continue;
    vehicles.push(row);
  }
  return vehicles.sort((a, b) =>
    String(a.plate_number || "").localeCompare(String(b.plate_number || ""), undefined, { numeric: true })
  );
}

// The one authoritative Daily KM calculation.
// Returns one record per operational Vehicle Master vehicle with a Submitted/Missing status.
export async function getDailyKmStatus(requestedDate = null) {
  const reportDate = await resolveRiyadhDate(requestedDate);
  const fleetVehicles = await loadFleetVehicles();

  const readingResult = await query(`
    SELECT DISTINCT ON (vehicle_id) vehicle_id, reading_km, reading_date, id
    FROM km_records
    WHERE reading_date::date = $1::date
    ORDER BY vehicle_id, reading_km DESC, id DESC
  `, [reportDate]);

  const readingByVehicleId = new Map();
  for (const row of readingResult.rows) {
    readingByVehicleId.set(Number(row.vehicle_id), row);
  }

  const records = fleetVehicles.map((v) => {
    const label = `${v.plate_number || ""} ${v.plate_code || ""}`.trim();
    const reading = readingByVehicleId.get(Number(v.id)) || null;
    return {
      vehicleId: v ? Number(v.id) : null,
      vehicle: label,
      vehiclePlate: label,
      vehicleFound: true,
      driverName: v?.driver || "",
      driverPhone: v?.phone || "",
      currentKm: Number(v?.current_km || 0),
      location: v?.location || "",
      readingId: reading ? Number(reading.id) : null,
      readingKm: reading ? Number(reading.reading_km) : null,
      readingDate: reading?.reading_date || null,
      status: reading ? "Submitted" : "Missing",
      submittedToday: !!reading
    };
  });

  const submitted = records.filter((r) => r.status === "Submitted");
  const missing = records.filter((r) => r.status === "Missing");

  return {
    date: reportDate,
    timezone: DAILY_KM_TZ,
    source: "ERP PostgreSQL km_records",
    googleSheetUsed: false,
    fleetCount: records.length,
    submittedCount: submitted.length,
    missingCount: missing.length,
    submissionRate: records.length ? (submitted.length / records.length) * 100 : 0,
    submitted,
    missing,
    records
  };
}

// Close every still-open Daily KM ticket for a vehicle. Consolidated from the
// previously duplicated implementations (addReading, Google Sheet sync, and
// the notification reconciler).
export async function closeDailyKmTickets(vehicleId, resolutionNotes = "") {
  if (!vehicleId) return 0;
  const result = await query(`
    UPDATE tickets
    SET status = 'Closed',
        closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
        closed_by = COALESCE(closed_by, 'System'),
        resolution_notes = CASE
          WHEN COALESCE(resolution_notes, '') = '' THEN $2
          ELSE resolution_notes
        END
    WHERE vehicle_id = $1
      AND category = 'Daily KM'
      AND status <> 'Closed'
    RETURNING id
  `, [vehicleId, resolutionNotes]);
  return result.rowCount || 0;
}

// Create at most one Daily KM ticket per vehicle per Riyadh day.
//
// Matching is deterministic and does not depend solely on the legacy marker in
// the description, so duplicates already in production are never recreated and
// are consolidated instead of being deleted.
export async function ensureDailyKmTicket(record, reportDate = null) {
  const vehicleId = record?.vehicleId ?? record?.vehicle_id ?? null;
  if (!vehicleId) return null;

  const date = reportDate || await getRiyadhToday();
  const marker = `DAILY_KM_MISSING|vehicle=${vehicleId}|date=${date}`;
  const plate = record.vehiclePlate || record.vehicle || "Vehicle";

  return transaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`DAILY_KM|${vehicleId}|${date}`]);

    // Re-check the authoritative reading inside the lock. The caller's
    // Missing/Submitted snapshot may be stale (a driver can submit between the
    // reconcile pass and this call), and reopening a ticket for a vehicle that
    // has just submitted would be wrong.
    const reading = await client.query(`
      SELECT 1 FROM km_records
      WHERE vehicle_id = $1 AND reading_date::date = $2::date
      LIMIT 1
    `, [vehicleId, date]);

    if (reading.rows.length > 0) {
      await client.query(`
        UPDATE tickets
        SET status = 'Closed',
            closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
            closed_by = COALESCE(closed_by, 'System')
        WHERE vehicle_id = $1 AND category = 'Daily KM' AND status <> 'Closed'
      `, [vehicleId]);
      return null;
    }

    const existing = await client.query(`
      SELECT id, status
      FROM tickets
      WHERE vehicle_id = $1
        AND category = 'Daily KM'
        AND (
          description LIKE $2
          OR (opened_at AT TIME ZONE $3)::date = $4::date
        )
      ORDER BY id ASC
    `, [vehicleId, `%${marker}%`, DAILY_KM_TZ, date]);

    if (existing.rows.length > 0) {
      const primary = existing.rows[0];
      const open = existing.rows.filter((r) => String(r.status) !== "Closed");
      const keep = open.length > 0 ? open[0] : primary;

      // Deterministic duplicate handling: keep one ticket open and close the
      // extras. Rows are preserved, never deleted.
      for (const duplicate of existing.rows) {
        if (Number(duplicate.id) === Number(keep.id)) continue;
        if (String(duplicate.status) === "Closed") continue;
        await client.query(`
          UPDATE tickets
          SET status = 'Closed',
              closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
              closed_by = COALESCE(closed_by, 'System'),
              resolution_notes = CASE
                WHEN COALESCE(resolution_notes, '') = '' THEN
                  'Duplicate Daily KM ticket consolidated automatically.'
                ELSE resolution_notes
              END
          WHERE id = $1
            AND status <> 'Closed'
        `, [duplicate.id]);
      }

      // A ticket from today that is already closed must not suppress the
      // missing-vehicle alert. Reopen it instead of inserting a duplicate row.
      if (String(keep.status) === "Closed") {
        await client.query(`
          UPDATE tickets
          SET status = 'Open',
              closed_at = NULL,
              resolution_notes = CASE
                WHEN COALESCE(resolution_notes, '') = '' THEN
                  'Reopened: still no KM reading for the current day.'
                ELSE resolution_notes
              END
          WHERE id = $1
        `, [keep.id]);
        return { id: keep.id, status: "Open" };
      }

      return keep;
    }

    const description = `Hello ${record.driverName || record.driver_name || "Driver"},

No KM reading recorded today for vehicle ${plate}.
Last reading: ${Number(record.currentKm || record.current_km || 0).toLocaleString()} km.

Please record before 7:00 AM.

Thank you,
Fleet Management

---
${marker}`;

    const result = await client.query(`
      INSERT INTO tickets
        (vehicle_id, title, location, category, priority, status,
         description, reported_by, opened_at, department)
      VALUES
        ($1, $2, $3, 'Daily KM', 'High', 'Open', $4, $5,
         CURRENT_TIMESTAMP, 'Fleet')
      RETURNING id, status
    `, [
      vehicleId,
      `Daily KM Missing — ${plate}`,
      record.location || "",
      description,
      record.driverName || record.driver_name || "System"
    ]);

    return result.rows[0];
  });
}

// Close stale Daily KM tickets from previous Riyadh days so they cannot
// accumulate forever. Legacy "Daily Vehicle Submission" tickets created by the
// retired Google Sheet flow are retired by the same sweep. Only the status is
// changed; rows and history are kept.
export async function closeStaleDailyKmTickets(reportDate = null, extraCategories = []) {
  const date = reportDate || await getRiyadhToday();
  const categories = ["Daily KM", "Daily Vehicle Submission", ...extraCategories];
  const result = await query(`
    UPDATE tickets
    SET status = 'Closed',
        closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
        closed_by = COALESCE(closed_by, 'System'),
        resolution_notes = CASE
          WHEN COALESCE(resolution_notes, '') = '' THEN
            'Daily KM ticket auto-closed after day rollover.'
          ELSE resolution_notes
        END
    WHERE category = ANY($3::text[])
      AND status <> 'Closed'
      AND (opened_at AT TIME ZONE $1)::date < $2::date
    RETURNING id
  `, [DAILY_KM_TZ, date, categories]);
  return result.rowCount || 0;
}

export default {
  DAILY_KM_TZ,
  DAILY_KM_CUTOFF_HOUR,
  FIXED_FLEET_VEHICLES,
  FLEET_VEHICLE_COUNT,
  normalizePlateKey,
  getRiyadhToday,
  getRiyadhState,
  resolveRiyadhDate,
  getDailyKmStatus,
  closeDailyKmTickets,
  ensureDailyKmTicket,
  closeStaleDailyKmTickets
};

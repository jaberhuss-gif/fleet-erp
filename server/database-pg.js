import { query, transaction } from "./postgres.js";
import { v2Query, v2Enabled } from "./v2/db.js";

function numberValue(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stringValue(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

async function syncV2DriverAssignment({ legacyDriverId = null, legacyVehicleId = null, plateNumber = "", plateCode = "", driverName = "", phone = "", status = "Active", clear = false } = {}) {
  if (!v2Enabled()) return;
  try {
    let vehicle;
    if (legacyVehicleId != null) {
      vehicle = (await v2Query("SELECT id, driver_id FROM fleet_erp_v2.vehicles WHERE legacy_vehicle_id = $1 LIMIT 1", [legacyVehicleId])).rows[0];
    }
    if (!vehicle && plateNumber) {
      vehicle = (await v2Query("SELECT id, driver_id FROM fleet_erp_v2.vehicles WHERE plate_number = $1 AND plate_code = $2 LIMIT 1", [String(plateNumber).trim(), String(plateCode || "").trim().toUpperCase()])).rows[0];
    }
    if (!vehicle) return;
    if (clear || !String(driverName || "").trim()) {
      await v2Query("UPDATE fleet_erp_v2.vehicles SET driver_id = NULL, legacy_driver_name = '', legacy_driver_phone = '', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [vehicle.id]);
      return;
    }
    const name = String(driverName).trim();
    const mobile = String(phone || "").trim();
    let driver = null;
    if (legacyDriverId != null) {
      driver = (await v2Query("SELECT id FROM fleet_erp_v2.drivers WHERE employee_no = $1 LIMIT 1", ["LEGACY-" + legacyDriverId])).rows[0];
    }
    if (!driver) {
      driver = (await v2Query("SELECT id FROM fleet_erp_v2.drivers WHERE lower(full_name)=lower($1) AND COALESCE(phone,'')=$2 ORDER BY id LIMIT 1", [name, mobile])).rows[0];
    }
    if (!driver) {
      driver = (await v2Query("INSERT INTO fleet_erp_v2.drivers(employee_no,full_name,phone,status) VALUES($1,$2,$3,$4) RETURNING id", [legacyDriverId != null ? "LEGACY-" + legacyDriverId : null, name, mobile, status || "Active"])).rows[0];
    } else {
      await v2Query("UPDATE fleet_erp_v2.drivers SET full_name=$1, phone=$2, status=$3 WHERE id=$4", [name, mobile, status || "Active", driver.id]);
    }
    await v2Query("UPDATE fleet_erp_v2.vehicles SET driver_id=$1, legacy_driver_name=$2, legacy_driver_phone=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4", [driver.id, name, mobile, vehicle.id]);
  } catch (err) {
    console.error("[V2 Driver Sync] failed:", err.message);
    throw new Error("Driver assignment was saved locally but V2 synchronization failed: " + err.message);
  }
}

async function syncV2KmReading({ plateNumber = "", plateCode = "", km, readingDate, notes = "" } = {}) {
  if (!v2Enabled() || km == null) return;
  try {
    const vehicle = (await v2Query(
      "SELECT id, meter_updated_at FROM fleet_erp_v2.vehicles WHERE plate_number=$1 AND plate_code=$2 LIMIT 1",
      [String(plateNumber || "").trim(), String(plateCode || "").trim().toUpperCase()]
    )).rows[0];
    if (!vehicle) return;
    await v2Query(
      "INSERT INTO fleet_erp_v2.km_readings(vehicle_id,reading_km,reading_date,notes) VALUES($1,$2,$3,$4) ON CONFLICT(vehicle_id,reading_date) DO UPDATE SET reading_km=EXCLUDED.reading_km,notes=EXCLUDED.notes",
      [vehicle.id, km, readingDate, notes || "ERP KM"]
    );
    // `km` is already the newest reading for this vehicle (see addReading), so assigning it
    // is safe; GREATEST would instead keep a stale bad high value forever.
    const existingDay = vehicle.meter_updated_at ? String(vehicle.meter_updated_at).slice(0, 10) : null;
    const incomingDay = readingDate ? String(readingDate).slice(0, 10) : null;
    if (existingDay == null || (incomingDay != null && incomingDay >= existingDay)) {
      await v2Query(
        "UPDATE fleet_erp_v2.vehicles SET current_km=$1, meter_updated_at=COALESCE($3::timestamptz,meter_updated_at), updated_at=CURRENT_TIMESTAMP WHERE id=$2",
        [km, vehicle.id, readingDate ? new Date(String(readingDate)).toISOString() : null]
      );
    }
  } catch (err) {
    console.error("[V2 KM Sync] failed:", err.message);
    throw new Error("KM was saved locally but V2 synchronization failed: " + err.message);
  }
}

function formatVehicle(row) {
  if (!row) return null;

  const currentKM = numberValue(row.current_km, 0);
  const lastOilKM = numberValue(row.last_oil_km, 0);
  const interval = numberValue(row.oil_change_interval, 5000);

  const kmSinceOil = currentKM - lastOilKM;
  const remaining = interval - kmSinceOil;

  let oilStatus = "Safe";

  if (kmSinceOil >= interval) {
    oilStatus = "Urgent Overdue";
  } else if (kmSinceOil >= interval - 500) {
    oilStatus = "Warning";
  }

  const plate = `${row.plate_number || ""} ${row.plate_code || ""}`.trim();
  const driver = row.driver || "";
  const phone = row.phone || "";

  return {
    id: row.id,

    plate,
    plate_number: row.plate_number || "",
    plate_code: row.plate_code || "",

    make: row.make || "",
    model: row.model || "",
    year: row.year || "",
    status: oilStatus,
    location: row.location || "",

    driver,
    driver_name: driver,
    driver_phone: phone,
    phone,
    driverId: row.driver_id ?? null,

    currentKm: currentKM,
    currentKM,

    lastOilKm: lastOilKM,
    lastOilKM,

    sinceOil: kmSinceOil,
    kmSinceLastOil: kmSinceOil,

    remaining,
    remainingKM: remaining,

    oilChangeInterval: interval,
    last_oil_change_date: row.last_oil_change_date || "",
    lastOilChangeDate: row.last_oil_change_date || "",
    inspection_expiry_date: row.inspection_expiry_date || "",
    inspectionExpiryDate: row.inspection_expiry_date || "",

    oilStatus,

    meter_updated_at: row.meter_updated_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function getVehicleById(id) {
  const result = await query(`
    SELECT v.*,
           d.name AS relational_driver_name, d.phone AS relational_driver_phone,
           d.id AS relational_driver_id,
           oh.oil_change_km AS canonical_last_oil_km,
           oh.oil_change_date AS canonical_last_oil_change_date
    FROM vehicles v
    LEFT JOIN drivers d ON d.id = v.driver_id
    LEFT JOIN LATERAL (
      SELECT oil_change_km, oil_change_date
      FROM oil_changes
      WHERE vehicle_id = v.id
        AND COALESCE(notes,'') NOT ILIKE '%Google Sheet%'
      ORDER BY oil_change_date DESC NULLS LAST, id DESC
      LIMIT 1
    ) oh ON true
    WHERE v.id = $1 LIMIT 1
  `, [id]);
  return formatVehicle({
    ...result.rows[0],
    last_oil_km: result.rows[0]?.canonical_last_oil_km ?? result.rows[0]?.last_oil_km,
    last_oil_change_date: result.rows[0]?.canonical_last_oil_change_date ?? result.rows[0]?.last_oil_change_date,
    driver: result.rows[0]?.driver ?? "",
    phone: result.rows[0]?.phone ?? ""
  });
}

export async function getVehicleByPlate(plate) {
  const parts = stringValue(plate).split(/\s+/).filter(Boolean);
  const plateNumber = parts[0] || "";
  const plateCode = parts.slice(1).join(" ").toUpperCase();
  const result = await query(`
    SELECT v.*, d.name AS relational_driver_name, d.phone AS relational_driver_phone,
           d.id AS relational_driver_id
    FROM vehicles v
    LEFT JOIN drivers d ON d.id = v.driver_id
    WHERE v.plate_number = $1 AND v.plate_code = $2
    ORDER BY
      CASE
        WHEN COALESCE(v.current_km, 0) > 0
          OR COALESCE(v.last_oil_km, 0) > 0
          OR v.driver_id IS NOT NULL
          OR NULLIF(TRIM(COALESCE(v.driver, '')), '') IS NOT NULL
          OR NULLIF(TRIM(COALESCE(v.location, '')), '') IS NOT NULL
        THEN 1 ELSE 0
      END DESC,
      COALESCE(v.current_km, 0) DESC,
      COALESCE(v.updated_at, v.created_at) DESC NULLS LAST,
      v.id DESC
    LIMIT 1
  `, [plateNumber, plateCode]);
  const row = result.rows[0];
  if (!row) return null;
  return formatVehicle({
    ...row,
    driver: row.driver ?? "",
    phone: row.phone ?? ""
  });
}

export async function listVehicles() {
  // A vehicle plate is the business key. Older imports created duplicate rows
  // for the same plate, including empty "0 KM" rows. Always expose the
  // canonical row: prefer a row with real vehicle data, then the highest KM,
  // then the most recently updated row. This prevents the UI from editing or
  // displaying a stale duplicate record.
  const result = await query(`
    WITH ranked AS (
      SELECT
        v.*,
        ROW_NUMBER() OVER (
          PARTITION BY UPPER(TRIM(COALESCE(v.plate_number, ''))),
                       UPPER(TRIM(COALESCE(v.plate_code, '')))
          ORDER BY
            CASE WHEN v.inspection_expiry_date IS NOT NULL THEN 2 ELSE 0 END DESC,
            CASE
              WHEN COALESCE(v.current_km, 0) > 0
                OR COALESCE(v.last_oil_km, 0) > 0
                OR v.driver_id IS NOT NULL
                OR NULLIF(TRIM(COALESCE(v.driver, '')), '') IS NOT NULL
                OR NULLIF(TRIM(COALESCE(v.location, '')), '') IS NOT NULL
              THEN 1 ELSE 0
            END DESC,
            COALESCE(v.current_km, 0) DESC,
            COALESCE(v.updated_at, v.created_at) DESC NULLS LAST,
            v.id DESC
        ) AS rn
      FROM vehicles v
    )
    SELECT r.*, d.name AS relational_driver_name, d.phone AS relational_driver_phone,
           d.id AS relational_driver_id,
           oh.oil_change_km AS canonical_last_oil_km,
           oh.oil_change_date AS canonical_last_oil_change_date
    FROM ranked r
    LEFT JOIN drivers d ON d.id = r.driver_id
    LEFT JOIN LATERAL (
      SELECT oil_change_km, oil_change_date
      FROM oil_changes
      WHERE vehicle_id = r.id
        AND COALESCE(notes,'') NOT ILIKE '%Google Sheet%'
      ORDER BY oil_change_date DESC NULLS LAST, id DESC
      LIMIT 1
    ) oh ON true
    WHERE r.rn = 1
    ORDER BY r.plate_number, r.plate_code
  `);
  return result.rows.map(row => formatVehicle({
    ...row,
    last_oil_km: row.canonical_last_oil_km ?? row.last_oil_km,
    last_oil_change_date: row.canonical_last_oil_change_date ?? row.last_oil_change_date,
    driver: row.driver ?? "",
    phone: row.phone ?? ""
  }));
}

export async function createVehicle(vehicleData = {}) {
  const parts = stringValue(vehicleData.plate).split(/\s+/).filter(Boolean);
  const plateNumber = parts[0] || "";
  const plateCode = parts.slice(1).join(" ").toUpperCase();
  if (!plateNumber) throw new Error("Vehicle plate is required");

  const duplicate = await query(
    `SELECT id
     FROM vehicles
     WHERE UPPER(TRIM(COALESCE(plate_number, ''))) = UPPER(TRIM($1))
       AND UPPER(TRIM(COALESCE(plate_code, ''))) = UPPER(TRIM($2))
     LIMIT 1`,
    [plateNumber, plateCode]
  );
  if (duplicate.rows[0]) throw new Error("A vehicle with this plate already exists");

  const driverId = vehicleData.driverId ?? vehicleData.driver_id ?? null;
  if (driverId) {
    const driverCheck = await query(`SELECT id FROM drivers WHERE id = $1 LIMIT 1`, [driverId]);
    if (!driverCheck.rows[0]) throw new Error("Driver not found");
  }

  const result = await query(`
    INSERT INTO vehicles
      (plate_number, plate_code, make, model, year, status, location, driver_id,
       driver, phone, current_km, last_oil_km, oil_change_interval, last_oil_change_date, inspection_expiry_date, meter_updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING *
  `, [
    plateNumber, plateCode,
    vehicleData.make || "Toyota",
    vehicleData.model || "Hilux",
    numberValue(vehicleData.year, 2022),
    vehicleData.status || vehicleData.state || "جيد",
    vehicleData.location || "",
    driverId,
    "",
    "",
    numberValue(
      vehicleData.currentKm ?? vehicleData.currentKM ?? vehicleData.current_km ?? vehicleData.km,
      0
    ),
    numberValue(
      vehicleData.lastOilKm ?? vehicleData.lastOilKM ?? vehicleData.last_oil_km ?? vehicleData.serviceKm,
      0
    ),
    numberValue(vehicleData.oilChangeInterval, 5000),
    (vehicleData.lastOilChangeDate === "" || vehicleData.lastOilChangeDate == null) ? null : vehicleData.lastOilChangeDate,
    (vehicleData.inspectionExpiryDate === "" || vehicleData.inspectionExpiryDate == null) ? null : vehicleData.inspectionExpiryDate,
    new Date().toISOString()
  ]);

  if (driverId) {
    const d = (await query(`SELECT name, phone FROM drivers WHERE id = $1`, [driverId])).rows[0];
    await query(`UPDATE vehicles SET driver = $1, phone = $2 WHERE id = $3`, [d.name || "", d.phone || "", result.rows[0].id]);
    await query(
      `UPDATE drivers
       SET vehicle_id = COALESCE(vehicle_id, $1), updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [result.rows[0].id, driverId]
    );
  }

  return getVehicleById(result.rows[0].id);
}

export async function updateVehicle(id, data = {}) {
  const vehicleResult = await query(`SELECT * FROM vehicles WHERE id = $1 LIMIT 1`, [id]);
  const vehicleRow = vehicleResult.rows[0];
  if (!vehicleRow) return { changes: 0 };

  // Vehicle Master accepts the full vehicle identity plus operational fields.
  // Missing fields are preserved; only explicitly supplied fields are changed.
  const hasPlate =
    data.plate !== undefined ||
    data.plateNumber !== undefined ||
    data.plate_number !== undefined ||
    data.plateCode !== undefined ||
    data.plate_code !== undefined;

  let plateNumber = vehicleRow.plate_number || "";
  let plateCode = vehicleRow.plate_code || "";
  if (data.plate !== undefined) {
    const parts = stringValue(data.plate).trim().split(/\s+/).filter(Boolean);
    if (!parts[0]) throw new Error("Vehicle plate is required");
    plateNumber = parts[0];
    plateCode = parts.slice(1).join(" ").toUpperCase();
  } else {
    if (data.plateNumber !== undefined || data.plate_number !== undefined) {
      plateNumber = stringValue(data.plateNumber ?? data.plate_number).trim();
    }
    if (data.plateCode !== undefined || data.plate_code !== undefined) {
      plateCode = stringValue(data.plateCode ?? data.plate_code).trim().toUpperCase();
    }
    if (!plateNumber) throw new Error("Vehicle plate is required");
  }

  if (hasPlate) {
    const duplicate = await query(
      `SELECT id
       FROM vehicles
       WHERE UPPER(TRIM(COALESCE(plate_number, ''))) = UPPER(TRIM($1))
         AND UPPER(TRIM(COALESCE(plate_code, ''))) = UPPER(TRIM($2))
         AND id <> $3
       LIMIT 1`,
      [plateNumber, plateCode, id]
    );
    if (duplicate.rows[0]) throw new Error("Another vehicle already uses this plate");
  }

  const hasCurrentKM =
    data.currentKm !== undefined ||
    data.currentKM !== undefined ||
    data.current_km !== undefined ||
    data.km !== undefined;
  const currentRaw = data.currentKm ?? data.currentKM ?? data.current_km ?? data.km;
  if (hasCurrentKM && (!Number.isFinite(Number(currentRaw)) || Number(currentRaw) < 0)) {
    throw new Error("Current KM must be a valid non-negative number");
  }
  const currentKM = hasCurrentKM ? Number(currentRaw) : numberValue(vehicleRow.current_km, 0);

  const hasLastOilKM =
    data.lastOilKm !== undefined ||
    data.lastOilKM !== undefined ||
    data.last_oil_km !== undefined ||
    data.serviceKm !== undefined;
  const lastOilRaw = data.lastOilKm ?? data.lastOilKM ?? data.last_oil_km ?? data.serviceKm;
  if (hasLastOilKM && (!Number.isFinite(Number(lastOilRaw)) || Number(lastOilRaw) < 0)) {
    throw new Error("Last Oil Change KM must be a valid non-negative number");
  }
  const lastOilKM = hasLastOilKM ? Number(lastOilRaw) : numberValue(vehicleRow.last_oil_km, 0);

  const oilInterval = data.oilChangeInterval !== undefined && data.oilChangeInterval !== null && data.oilChangeInterval !== ""
    ? numberValue(data.oilChangeInterval, 5000)
    : numberValue(vehicleRow.oil_change_interval, 5000);

  const requestedOilDate = data.lastOilChangeDate ?? data.last_oil_change_date;
  const inspectionExpiryDate = data.inspectionExpiryDate ?? data.inspection_expiry_date ?? vehicleRow.inspection_expiry_date ?? null;
  const oilChangeDate = requestedOilDate === "" || requestedOilDate == null
    ? (vehicleRow.last_oil_change_date || null)
    : requestedOilDate;

  let driverId = data.driverId ?? data.driver_id;
  if (driverId === undefined && (data.driverName !== undefined || data.driver !== undefined)) {
    const requestedName = pgStr(data.driverName ?? data.driver);
    const requestedPhone = pgStr(data.driverPhone ?? data.phone);
    if (!requestedName) {
      driverId = null;
    } else {
      const driverLookup = await query(`
        SELECT id FROM drivers
        WHERE lower(name)=lower($1)
          AND ($2 = '' OR COALESCE(phone,'') = $2)
        ORDER BY id LIMIT 1
      `, [requestedName, requestedPhone]);
      if (!driverLookup.rows[0]) throw new Error("Driver not found");
      driverId = driverLookup.rows[0].id;
    }
  }
  if (driverId === undefined) driverId = vehicleRow.driver_id ?? null;

  if (driverId) {
    const driverCheck = await query(`SELECT id, name, phone, vehicle_id FROM drivers WHERE id = $1 LIMIT 1`, [driverId]);
    if (!driverCheck.rows[0]) throw new Error("Driver not found");
  }

  const make = data.make !== undefined ? pgStr(data.make) : (vehicleRow.make || "");
  const model = data.model !== undefined ? pgStr(data.model) : (vehicleRow.model || "");
  const year = data.year !== undefined && data.year !== null && data.year !== ""
    ? numberValue(data.year, vehicleRow.year || 2022)
    : numberValue(vehicleRow.year, 2022);
  const nextStatus = data.status ?? data.state ?? vehicleRow.status;
  const nextLocation = data.location ?? vehicleRow.location ?? "";
  const meterUpdatedAt = hasCurrentKM ? new Date().toISOString() : (vehicleRow.meter_updated_at || null);

  const result = await query(`
    UPDATE vehicles
    SET plate_number = $1,
        plate_code = $2,
        make = $3,
        model = $4,
        year = $5,
        current_km = $6,
        last_oil_km = $7,
        status = $8,
        location = $9,
        driver_id = $10,
        oil_change_interval = $11,
        last_oil_change_date = $12,
        inspection_expiry_date = $13,
        meter_updated_at = $14,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $15
  `, [
    plateNumber, plateCode, make, model, year,
    currentKM, lastOilKM, nextStatus, nextLocation, driverId,
    oilInterval, oilChangeDate, inspectionExpiryDate, meterUpdatedAt, id
  ]);

  if (result.rowCount && hasLastOilKM) {
    // Vehicle Master is authoritative for Last Oil Change edits. Keep the
    // trusted oil history in sync so compliance screens cannot revert it.
    const latestOil = await query(`
      SELECT id
      FROM oil_changes
      WHERE vehicle_id = $1
        AND COALESCE(notes, '') NOT ILIKE '%Google Sheet%'
      ORDER BY oil_change_date DESC NULLS LAST, id DESC
      LIMIT 1
    `, [id]);

    if (latestOil.rows[0]) {
      await query(`
        UPDATE oil_changes
        SET oil_change_km = $1,
            oil_change_date = $2,
            changed_by = 'ERP',
            notes = 'ERP Last Oil Change correction'
        WHERE id = $3
      `, [
        lastOilKM,
        data.lastOilChangeDate ?? data.last_oil_change_date ?? vehicleRow.last_oil_change_date ?? null,
        latestOil.rows[0].id
      ]);
    } else {
      await query(`
        INSERT INTO oil_changes
          (vehicle_id, oil_change_km, oil_change_date, changed_by, notes)
        VALUES ($1, $2, $3, 'ERP', 'ERP Last Oil Change correction')
      `, [id, lastOilKM, oilChangeDate]);
    }
  }

  if (result.rowCount) {
    const oldDriverId = vehicleRow.driver_id ? Number(vehicleRow.driver_id) : null;
    const newDriverId = driverId ? Number(driverId) : null;

    if (oldDriverId && oldDriverId !== newDriverId) {
      await query(
        `UPDATE drivers
         SET vehicle_id = COALESCE(
           (SELECT id FROM vehicles WHERE driver_id = $1 AND id <> $2 ORDER BY id LIMIT 1),
           NULL
         ),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND vehicle_id = $2`,
        [oldDriverId, id]
      );
    }

    const d = newDriverId
      ? (await query(`SELECT name, phone FROM drivers WHERE id = $1 LIMIT 1`, [newDriverId])).rows[0]
      : null;

    await query(
      `UPDATE vehicles
       SET driver = $1, phone = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [d?.name || "", d?.phone || "", id]
    );

    if (newDriverId) {
      await query(
        `UPDATE drivers
         SET vehicle_id = COALESCE(vehicle_id, $1), updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [id, newDriverId]
      );
    }

    await syncV2DriverAssignment({
      legacyVehicleId: id,
      plateNumber,
      plateCode,
      driverName: d?.name || "",
      phone: d?.phone || "",
      clear: !newDriverId
    });
  }

  return { changes: result.rowCount };
}

/**
 * One-time safety reconciliation for the known 4481 JUA assignment.
 * This is intentionally narrow: it only changes the relational driver assignment
 * when 4481 JUA is still assigned to the old Kamran record and there is exactly
 * one active/inactive driver whose normalized name is Abdul Wahid.
 * It never touches KM, oil-change fields, KM history, or driver master records.
 */
export async function repairVehicleDriverAssignmentsFromSnapshots() {
  // Vehicle Master is the authoritative assignment record. Re-link each vehicle
  // to the driver matching the vehicle's own stored name + phone, so editing one
  // driver/vehicle never changes another vehicle's assignment.
  const vehicles = await query(`
    SELECT id, driver, phone, driver_id
    FROM vehicles
    WHERE NULLIF(TRIM(COALESCE(driver, '')), '') IS NOT NULL
  `);
  let checked = 0, repaired = 0;
  for (const v of vehicles.rows) {
    checked += 1;
    const name = String(v.driver || '').trim();
    const phone = String(v.phone || '').replace(/\\D/g, '');
    if (!name) continue;
    const matches = await query(`
      SELECT id
      FROM drivers
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
        AND (
          $2 = ''
          OR REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') = $2
        )
      ORDER BY id
      LIMIT 2
    `, [name, phone]);
    if (matches.rows.length !== 1) continue;
    const driverId = Number(matches.rows[0].id);
    if (Number(v.driver_id || 0) === driverId) continue;
    await query(`
      UPDATE vehicles
      SET driver_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [driverId, v.id]);
    repaired += 1;
  }
  if (repaired) console.log('[DriverRepair] restored vehicle-specific driver assignments:', { checked, repaired });
  return { checked, repaired };
}

export async function repairKnownVehicleAssignments() {
  const vehicleResult = await query(`
    SELECT v.id, v.plate_number, v.plate_code, v.driver_id,
           d.name AS driver_name, d.phone AS driver_phone
    FROM vehicles v
    LEFT JOIN drivers d ON d.id = v.driver_id
    WHERE UPPER(TRIM(v.plate_number)) = '4481'
      AND UPPER(TRIM(v.plate_code)) = 'JUA'
    LIMIT 1
  `);
  const vehicle = vehicleResult.rows[0];
  if (!vehicle) {
    console.log("[DriverRepair] 4481 JUA not found; no change.");
    return { changed: false, reason: "vehicle_not_found" };
  }

  const currentName = String(vehicle.driver_name || "").trim().toLowerCase();
  if (!currentName.includes("kamran")) {
    return { changed: false, reason: "not_assigned_to_kamran", currentDriver: vehicle.driver_name || "" };
  }

  const driverResult = await query(`
    SELECT id, name, phone
    FROM drivers
    WHERE lower(regexp_replace(trim(name), '[^a-z0-9]+', '', 'g'))
          = 'abdulwahid'
    ORDER BY id
  `);
  if (driverResult.rows.length !== 1) {
    console.warn("[DriverRepair] Abdul Wahid match is not unique; no change.", {
      matches: driverResult.rows.length
    });
    return { changed: false, reason: "abdul_wahid_not_unique", matches: driverResult.rows.length };
  }

  const target = driverResult.rows[0];
  await transaction(async (client) => {
    await client.query(
      `UPDATE vehicles
       SET driver_id = $1, driver = $2, phone = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [target.id, target.name || "", target.phone || "", vehicle.id]
    );
  });

  await syncV2DriverAssignment({
    legacyVehicleId: vehicle.id,
    plateNumber: vehicle.plate_number,
    plateCode: vehicle.plate_code,
    driverName: target.name || "",
    phone: target.phone || ""
  });

  console.log("[DriverRepair] 4481 JUA reassigned from old Kamran record to Abdul Wahid.", {
    vehicleId: vehicle.id,
    oldDriverId: vehicle.driver_id,
    newDriverId: target.id
  });

  return {
    changed: true,
    vehicleId: vehicle.id,
    oldDriverId: vehicle.driver_id,
    newDriverId: target.id,
    driverName: target.name || "",
    phone: target.phone || ""
  };
}


/**
 * Restore Last Oil Change KM/Date from the authoritative oil_changes history.
 * Google Sheet migration rows are excluded because the Sheet is not an oil-change
 * source of truth. Vehicles with no trusted oil history are left untouched.
 * This does not delete or rewrite any history.
 */
export async function repairLastOilChangeFromHistory() {
  const result = await query(`
    SELECT v.id, v.plate_number, v.plate_code, v.last_oil_km, v.last_oil_change_date,
           oc.oil_change_km AS trusted_oil_km,
           oc.oil_change_date AS trusted_oil_date
    FROM vehicles v
    LEFT JOIN LATERAL (
      SELECT oil_change_km, oil_change_date
      FROM oil_changes
      WHERE vehicle_id = v.id
        AND COALESCE(notes, '') NOT ILIKE '%Google Sheet Migration%'
      ORDER BY oil_change_date DESC NULLS LAST, id DESC
      LIMIT 1
    ) oc ON TRUE
    WHERE oc.oil_change_km IS NOT NULL
  `);
  let checked = 0;
  let repaired = 0;
  for (const row of result.rows) {
    checked += 1;
    const currentKm = Number(row.last_oil_km || 0);
    const trustedKm = Number(row.trusted_oil_km || 0);
    const currentDate = row.last_oil_change_date ? String(row.last_oil_change_date).slice(0, 10) : "";
    const trustedDate = row.trusted_oil_date ? String(row.trusted_oil_date).slice(0, 10) : "";
    if (currentKm === trustedKm && currentDate === trustedDate) continue;

    await query(`
      UPDATE vehicles
      SET last_oil_km = $1,
          last_oil_change_date = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [trustedKm, trustedDate || null, row.id]);
    repaired += 1;
    console.log("[OilRepair] restored Last Oil Change for", `${row.plate_number} ${row.plate_code}`, {
      fromKm: currentKm,
      toKm: trustedKm,
      fromDate: currentDate || null,
      toDate: trustedDate || null
    });
  }
  return { checked, repaired };
}

export async function deleteVehicle(id) {
  const result = await query(`DELETE FROM vehicles WHERE id = $1`, [id]);
  return { changes: result.rowCount };
}

export async function deleteAllVehicles() {
  const result = await query(`DELETE FROM vehicles`);
  return { changes: result.rowCount };
}


export async function addReading(vehicleId, data = {}) {
  const vehicleResult = await query(
    `SELECT * FROM vehicles WHERE id = $1 LIMIT 1`,
    [vehicleId]
  );

  const v = vehicleResult.rows[0];

  if (!v) throw new Error("Vehicle not found");

  const km = numberValue(data.readingKm, 0);

  if (km <= 0) throw new Error("Reading must be positive");

  // Default to the Riyadh calendar date. The server/container TZ may be UTC, so
  // never use the server-local date to decide "today's" reading.
  const todayResult = await query(
    `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date::text AS today`
  );
  const riyadhToday = todayResult.rows[0]?.today;

  const readingDate =
    stringValue(data.readingDate) ||
    riyadhToday;

  // An odometer is monotonic in time, so a reading is bounded by its neighbours rather
  // than by vehicles.current_km. Using the stored odometer as the floor is what locked in
  // bad values permanently: once current_km jumped ahead, the correct reading could never
  // be entered again. The lower bound is the newest reading strictly before this date and
  // the upper bound is the earliest reading strictly after it.
  const bounds = await query(
    `SELECT
       (SELECT reading_km FROM km_records
         WHERE vehicle_id = $1 AND reading_date < $2::date
         ORDER BY reading_date DESC, id DESC LIMIT 1) AS prior_km,
       (SELECT reading_km FROM km_records
         WHERE vehicle_id = $1 AND reading_date > $2::date
         ORDER BY reading_date ASC, id ASC LIMIT 1) AS next_km`,
    [vehicleId, String(readingDate).slice(0, 10)]
  );
  const priorKm = bounds.rows[0]?.prior_km == null ? null : numberValue(bounds.rows[0].prior_km, 0);
  const nextKm = bounds.rows[0]?.next_km == null ? null : numberValue(bounds.rows[0].next_km, 0);

  if (priorKm !== null && km < priorKm) {
    throw new Error("Reading must be >= " + priorKm.toLocaleString() + " (previous dated reading)");
  }
  if (nextKm !== null && km > nextKm) {
    throw new Error("Reading must be <= " + nextKm.toLocaleString() + " (later dated reading)");
  }

  const plate = `${v.plate_number || ""} ${v.plate_code || ""}`.trim();

  await query(
    `INSERT INTO km_records
      (vehicle_id, plate, reading_km, reading_date, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      vehicleId,
      plate,
      km,
      readingDate,
      stringValue(data.notes)
    ]
  );

  // Derive the odometer from the newest reading by date rather than assigning the value
  // just entered. A driver catching up on an earlier day legitimately submits a lower
  // number, and that backfill must not roll the vehicle's odometer backwards.
  const latestRow = await query(
    `SELECT reading_km, reading_date FROM km_records
     WHERE vehicle_id = $1
     ORDER BY reading_date DESC, id DESC LIMIT 1`,
    [vehicleId]
  );
  const isTodayReading =
    String(readingDate).slice(0, 10) === String(riyadhToday).slice(0, 10);

  // A driver's reading for today is authoritative for the vehicle's Current KM.
  // Do not let an accidental future-dated record prevent today's reading from
  // updating the live odometer. Backdated readings still derive Current KM from
  // the newest valid dated reading so they cannot roll the odometer backwards.
  const odometerKm = isTodayReading
    ? km
    : (latestRow.rows[0]
        ? numberValue(latestRow.rows[0].reading_km, km)
        : km);

  await query(
    `UPDATE vehicles
     SET current_km = $1,
         meter_updated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [odometerKm, vehicleId]
  );

  await syncV2KmReading({
    plateNumber: v.plate_number,
    plateCode: v.plate_code,
    km: odometerKm,
    readingDate: latestRow.rows[0]?.reading_date || readingDate,
    notes: stringValue(data.notes)
  });

  // Automatically close all open Daily KM tickets for this vehicle when today's
  // reading is successfully saved. Uses the single shared helper instead of a
  // fourth copy of the same UPDATE.
  try {
    if (String(readingDate).slice(0, 10) === String(riyadhToday).slice(0, 10)) {
      const { closeDailyKmTickets } = await import("./dailyKm.js");
      await closeDailyKmTickets(
        vehicleId,
        `Today's KM reading was entered successfully: ${km.toLocaleString()} km.`
      );
    }
  } catch (cardError) {
    // The KM reading itself is already saved. Do not fail the driver's
    // submission just because the tracking card could not be closed.
    console.error("[KMDailyCard] immediate close failed:", cardError.message);
  }

  return getVehicleById(vehicleId);
}

export async function listReadings(vehicleId) {
  const result = await query(
    `SELECT *
     FROM km_records
     WHERE vehicle_id = $1
     ORDER BY reading_date DESC, id DESC
     LIMIT 50`,
    [vehicleId]
  );

  return result.rows;
}

export async function ensurePeriodicMaintenanceSchema() {
  await query(`
    ALTER TABLE periodic_maintenance
      ADD COLUMN IF NOT EXISTS last_service_km INTEGER,
      ADD COLUMN IF NOT EXISTS last_service_date DATE,
      ADD COLUMN IF NOT EXISTS next_due_km INTEGER,
      ADD COLUMN IF NOT EXISTS interval_km INTEGER DEFAULT 5000,
      ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 180,
      ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS whatsapp_confirmation_token TEXT,
      ADD COLUMN IF NOT EXISTS whatsapp_confirmed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS whatsapp_confirmation_source TEXT
  `);
}

// Idempotent, additive ticket-schema guard.
//
// The ticket INSERTs reference department and the assignment columns. This adds
// only the columns that are genuinely missing, using IF NOT EXISTS, and never
// drops, renames, recreates, or rewrites the tickets table, so existing tickets
// and all historical data are preserved.
export async function ensureVehicleRepairSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS vehicle_repair_orders (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      reported_by TEXT,
      issue_description TEXT NOT NULL DEFAULT '',
      repair_details TEXT NOT NULL DEFAULT '',
      parts_used TEXT DEFAULT '',
      repair_km INTEGER,
      repair_date DATE,
      repair_cost NUMERIC DEFAULT 0,
      repaired_by TEXT,
      repaired_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'Open',
      verified_by TEXT,
      verified_at TIMESTAMPTZ,
      verification_notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_repair_orders_vehicle ON vehicle_repair_orders(vehicle_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_repair_orders_status ON vehicle_repair_orders(status)`);
}

export async function createVehicleRepairOrder(data = {}) {
  const result = await query(
    `INSERT INTO vehicle_repair_orders
      (vehicle_id, reported_by, issue_description, status)
     VALUES ($1,$2,$3,'Open')
     RETURNING *`,
    [data.vehicleId, stringValue(data.reportedBy || data.repairedBy), stringValue(data.issueDescription || data.description)]
  );
  return result.rows[0];
}

export async function listVehicleRepairOrders(filters = {}) {
  const params = [];
  let sql = `
    SELECT r.*, v.plate_number, v.plate_code, v.driver AS vehicle_driver, v.location AS vehicle_location
    FROM vehicle_repair_orders r
    JOIN vehicles v ON v.id = r.vehicle_id
    WHERE 1=1`;
  if (filters.vehicleId) { params.push(filters.vehicleId); sql += ` AND r.vehicle_id = $${params.length}`; }
  if (filters.reportedBy) { params.push(filters.reportedBy); sql += ` AND r.reported_by = $${params.length}`; }
  if (filters.status) { params.push(filters.status); sql += ` AND r.status = $${params.length}`; }
  sql += ` ORDER BY r.created_at DESC, r.id DESC`;
  const result = await query(sql, params);
  return result.rows.map(r => ({
    ...r,
    vehicleId: r.vehicle_id,
    plate: [r.plate_number, r.plate_code].filter(Boolean).join(' ').trim(),
    location: r.vehicle_location || ''
  }));
}

export async function completeVehicleRepairOrder(id, data = {}) {
  const result = await query(
    `UPDATE vehicle_repair_orders
     SET repair_details=$1, parts_used=$2, repair_km=$3, repair_date=COALESCE($4::date,CURRENT_DATE),
         repair_cost=COALESCE($5,0), repaired_by=$6, repaired_at=CURRENT_TIMESTAMP,
         status='Pending Verification', updated_at=CURRENT_TIMESTAMP
     WHERE id=$7 AND status <> 'Completed'
     RETURNING *`,
    [stringValue(data.repairDetails), stringValue(data.partsUsed), numberValue(data.repairKm, null), data.repairDate || null, numberValue(data.repairCost, 0), stringValue(data.repairedBy || data.reportedBy), id]
  );
  if (!result.rows[0]) throw new Error('Repair order not found or already completed.');
  return result.rows[0];
}

export async function closeVehicleRepairOrder(id, data = {}) {
  const result = await query(
    `UPDATE vehicle_repair_orders
     SET status='Completed', verified_by=$1, verified_at=CURRENT_TIMESTAMP,
         verification_notes=$2, updated_at=CURRENT_TIMESTAMP
     WHERE id=$3 AND status='Pending Verification'
     RETURNING *`,
    [stringValue(data.verifiedBy) || 'Fleet Manager', stringValue(data.verificationNotes || data.notes), id]
  );
  if (!result.rows[0]) throw new Error('Repair order must be in Pending Verification before Fleet Manager can close it.');
  return result.rows[0];
}
export async function ensureTicketSchema() {
  await query(`
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS department TEXT,
      ADD COLUMN IF NOT EXISTS assigned_to_user_id BIGINT,
      ADD COLUMN IF NOT EXISTS assigned_to_name TEXT,
      ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS whatsapp_confirmation_token TEXT,
      ADD COLUMN IF NOT EXISTS whatsapp_confirmed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS whatsapp_confirmation_source TEXT
  `);

  await query(`
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS acknowledged_by TEXT,
      ADD COLUMN IF NOT EXISTS closed_by TEXT,
      ADD COLUMN IF NOT EXISTS resolution_notes TEXT
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_tickets_vehicle_id ON tickets(vehicle_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)`);
}

// Additive, idempotent guard for the Building Maintenance tables.
//
// These four tables can exist as incomplete shells (for example an `id`-only
// table left behind by a partial migration). Every building query selects real
// columns, so an incomplete table turns every building/report endpoint into a
// 500 (e.g. `column "reported_date" does not exist`). This only adds missing
// columns and indexes; it never drops, renames or rewrites anything, so
// existing rows are preserved.
export async function ensureBuildingSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS work_orders (
      id SERIAL PRIMARY KEY,
      wo_no TEXT UNIQUE,
      site TEXT,
      area TEXT,
      category TEXT,
      priority TEXT DEFAULT 'Medium',
      description TEXT,
      assigned_to TEXT,
      is_contractor INTEGER DEFAULT 0,
      contractor_name TEXT,
      performed_by TEXT,
      status TEXT DEFAULT 'Open',
      reported_date DATE,
      completed_date DATE,
      final_cost NUMERIC DEFAULT 0,
      contractor_cost NUMERIC DEFAULT 0,
      labor_cost NUMERIC DEFAULT 0,
      parts_cost NUMERIC DEFAULT 0,
      closing_notes TEXT,
      parts_used TEXT,
      month TEXT,
      year TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      project_no TEXT UNIQUE,
      name TEXT,
      description TEXT,
      site TEXT,
      project_type TEXT DEFAULT 'Development',
      status TEXT DEFAULT 'Active',
      budget NUMERIC DEFAULT 0,
      spent NUMERIC DEFAULT 0,
      start_date DATE,
      end_date DATE,
      manager TEXT,
      contractor TEXT,
      month TEXT,
      year TEXT,
      notes TEXT,
      final_cost NUMERIC DEFAULT 0,
      is_contractor INTEGER DEFAULT 0,
      contractor_name TEXT,
      performed_by TEXT,
      completed_date DATE,
      closing_notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS project_items (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      sr_no TEXT,
      item TEXT,
      unit TEXT,
      quantity NUMERIC DEFAULT 0,
      price NUMERIC DEFAULT 0,
      cost NUMERIC DEFAULT 0,
      section TEXT DEFAULT '',
      status TEXT DEFAULT 'Not Started',
      actual_amount NUMERIC DEFAULT 0,
      notes TEXT DEFAULT '',
      closed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS work_order_items (
      id SERIAL PRIMARY KEY,
      work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      sr_no TEXT,
      item TEXT,
      unit TEXT,
      quantity NUMERIC DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      purchase_no TEXT UNIQUE,
      type TEXT,
      reference_no TEXT,
      item_name TEXT,
      quantity NUMERIC DEFAULT 1,
      unit_cost NUMERIC DEFAULT 0,
      total_cost NUMERIC DEFAULT 0,
      supplier TEXT,
      purchased_by TEXT DEFAULT 'Company',
      purchase_date DATE,
      month TEXT,
      year TEXT,
      notes TEXT,
      status TEXT DEFAULT 'Open',
      final_cost NUMERIC DEFAULT 0,
      is_contractor INTEGER DEFAULT 0,
      contractor_name TEXT,
      performed_by TEXT,
      completed_date DATE,
      closing_notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sites (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT,
      region TEXT DEFAULT '',
      campus_manager TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      notes TEXT,
      status TEXT DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Fill in any column still missing on a pre-existing (possibly stub) table.
  const additions = {
    work_orders: [
      ["wo_no", "TEXT"], ["site", "TEXT"], ["area", "TEXT"], ["category", "TEXT"],
      ["priority", "TEXT DEFAULT 'Medium'"], ["description", "TEXT"],
      ["assigned_to", "TEXT"], ["is_contractor", "INTEGER DEFAULT 0"],
      ["contractor_name", "TEXT"], ["performed_by", "TEXT"],
      ["status", "TEXT DEFAULT 'Open'"], ["reported_date", "DATE"],
      ["completed_date", "DATE"], ["final_cost", "NUMERIC DEFAULT 0"],
      ["contractor_cost", "NUMERIC DEFAULT 0"], ["labor_cost", "NUMERIC DEFAULT 0"],
      ["parts_cost", "NUMERIC DEFAULT 0"], ["closing_notes", "TEXT"],
      ["parts_used", "TEXT"], ["month", "TEXT"], ["year", "TEXT"],
      ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"]
    ],
    projects: [
      ["project_no", "TEXT"], ["name", "TEXT"], ["description", "TEXT"],
      ["site", "TEXT"], ["project_type", "TEXT DEFAULT 'Development'"],
      ["status", "TEXT DEFAULT 'Active'"], ["budget", "NUMERIC DEFAULT 0"],
      ["spent", "NUMERIC DEFAULT 0"], ["start_date", "DATE"], ["end_date", "DATE"],
      ["manager", "TEXT"], ["contractor", "TEXT"], ["month", "TEXT"], ["year", "TEXT"],
      ["notes", "TEXT"], ["final_cost", "NUMERIC DEFAULT 0"], ["is_contractor", "INTEGER DEFAULT 0"],
      ["contractor_name", "TEXT"], ["performed_by", "TEXT"], ["completed_date", "DATE"],
      ["closing_notes", "TEXT"], ["final_cost", "NUMERIC DEFAULT 0"],
      ["is_contractor", "INTEGER DEFAULT 0"], ["contractor_name", "TEXT"],
      ["performed_by", "TEXT"], ["completed_date", "DATE"], ["closing_notes", "TEXT"],
      ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"]
    ],
    purchases: [
      ["purchase_no", "TEXT"], ["type", "TEXT"], ["reference_no", "TEXT"],
      ["item_name", "TEXT"], ["quantity", "NUMERIC DEFAULT 1"],
      ["unit_cost", "NUMERIC DEFAULT 0"], ["total_cost", "NUMERIC DEFAULT 0"],
      ["supplier", "TEXT"], ["purchased_by", "TEXT DEFAULT 'Company'"],
      ["purchase_date", "DATE"], ["month", "TEXT"], ["year", "TEXT"], ["notes", "TEXT"],
      ["status", "TEXT DEFAULT 'Open'"], ["final_cost", "NUMERIC DEFAULT 0"],
      ["is_contractor", "INTEGER DEFAULT 0"], ["contractor_name", "TEXT"],
      ["performed_by", "TEXT"], ["completed_date", "DATE"], ["closing_notes", "TEXT"],
      ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"]
    ],
    project_items: [
      ["price", "NUMERIC DEFAULT 0"], ["cost", "NUMERIC DEFAULT 0"], ["section", "TEXT DEFAULT ''"],
      ["status", "TEXT DEFAULT 'Not Started'"], ["actual_amount", "NUMERIC DEFAULT 0"], ["notes", "TEXT DEFAULT ''"],
      ["closed_at", "TIMESTAMP"], ["updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"]
    ],
    sites: [      ["code", "TEXT"], ["name", "TEXT"], ["region", "TEXT DEFAULT ''"],
      ["campus_manager", "TEXT DEFAULT ''"], ["phone", "TEXT DEFAULT ''"],
      ["notes", "TEXT"], ["status", "TEXT DEFAULT 'Active'"],
      ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"]
    ]
  };

  for (const [table, columns] of Object.entries(additions)) {
    const list = columns.map(([name, type]) => `ADD COLUMN IF NOT EXISTS ${name} ${type}`).join(",\n      ");
    await query(`ALTER TABLE ${table}\n      ${list}`);
  }

  await query(`CREATE INDEX IF NOT EXISTS idx_work_orders_reported_date ON work_orders(reported_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_work_orders_contractor ON work_orders(contractor_name)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON purchases(purchase_date)`);
}

export async function updatePeriodicAfterOilChange(vehicleId, currentKm, oilDate) {
  // Ensure the schema is up to date
  await ensurePeriodicMaintenanceSchema();

  const current = await query(
    `SELECT id FROM periodic_maintenance
     WHERE vehicle_id = $1 AND type = 'oil_change' AND status = 'Pending'
     ORDER BY id DESC LIMIT 1`,
    [vehicleId]
  );

  const nextDueKm = Number(currentKm) + 5000;

  if (current.rows[0]) {
    await query(
      `UPDATE periodic_maintenance
       SET last_service_km = $1,
           last_service_date = $2,
           next_due_km = $3,
           interval_km = 5000,
           scheduled_date = $2::date + INTERVAL '180 days',
           completed_date = $2,
           status = 'Pending',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [currentKm, oilDate, nextDueKm, current.rows[0].id]
    );
  } else {
    await query(
      `INSERT INTO periodic_maintenance
        (vehicle_id, type, scheduled_date, status,
         last_service_km, last_service_date, next_due_km,
         interval_km, interval_days)
       VALUES ($1, 'oil_change', $2::date + INTERVAL '180 days', 'Pending',
               $3, $2, $4, 5000, 180)`,
      [vehicleId, oilDate, currentKm, nextDueKm]
    );
  }
}

export async function changeOil(vehicleId, data = {}) {
  const vehicleResult = await query(
    `SELECT * FROM vehicles WHERE id = $1 LIMIT 1`,
    [vehicleId]
  );

  const v = vehicleResult.rows[0];

  if (!v) throw new Error("Vehicle not found");

  const currentKM = numberValue(v.current_km, 0);

  if (!currentKM) {
    throw new Error("No current reading");
  }

  const oilDate =
    stringValue(data.oilChangeDate) ||
    new Date().toISOString().slice(0, 10);

  const changedBy =
    stringValue(data.changedBy) || "Driver";

  const notes = stringValue(data.notes);

  const plate = `${v.plate_number || ""} ${v.plate_code || ""}`.trim();

  await query(
    `INSERT INTO oil_changes
      (vehicle_id, oil_change_km, oil_change_date, changed_by, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      vehicleId,
      currentKM,
      oilDate,
      changedBy,
      notes
    ]
  );

  await query(
    `UPDATE vehicles
     SET last_oil_km = $1,
         last_oil_change_date = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [
      currentKM,
      oilDate,
      vehicleId
    ]
  );

  // Update the periodic maintenance entry for oil_change
  try {
    await updatePeriodicAfterOilChange(vehicleId, currentKM, oilDate);
  } catch (err) {
    console.error("Failed to update periodic_maintenance after oil change:", err.message);
  }

  await query(
    `INSERT INTO km_records
      (vehicle_id, plate, reading_km, reading_date, is_oil_change, notes)
     VALUES ($1, $2, $3, $4, 1, $5)`,
    [
      vehicleId,
      plate,
      currentKM,
      oilDate,
      "Oil change"
    ]
  );

  return getVehicleById(vehicleId);
}

export async function listOilChanges(vehicleId) {
  const result = await query(
    `SELECT *
     FROM oil_changes
     WHERE vehicle_id = $1
     ORDER BY oil_change_date DESC, id DESC
     LIMIT 20`,
    [vehicleId]
  );

  return result.rows;
}
// ============================================================
// TICKETS - POSTGRESQL
// ============================================================

export async function createTicket(data = {}) {
  const ownerResult = await query(
    `SELECT id, full_name, username
     FROM users
     WHERE role = 'Owner' AND is_active = 1
     ORDER BY id ASC
     LIMIT 1`
  );
  const owner = ownerResult.rows[0] || null;
  const department = stringValue(data.department) || (data.vehicleId ? "Fleet" : "Support");

  const result = await query(
    `INSERT INTO tickets
      (vehicle_id, title, location, category, priority, status,
       description, reported_by, opened_at, department,
       assigned_to_user_id, assigned_to_name, assigned_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,$9,$10,$11,
             CASE WHEN $10::bigint IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END)
     RETURNING *`,
    [
      data.vehicleId || null,
      stringValue(data.title),
      stringValue(data.location),
      stringValue(data.category),
      stringValue(data.priority) || "Medium",
      stringValue(data.status) || "Open",
      stringValue(data.description),
      stringValue(data.reportedBy || data.reporter),
      department,
      owner?.id ?? null,
      owner ? stringValue(owner.full_name || owner.username) : null
    ]
  );

  return result.rows[0];
}

export async function listTickets(filters = {}) {
  // Vehicle-linked tickets are enriched with vehicle information so the UI can
  // show plate/driver/site without extra round-trips. Aliases keep the existing
  // ticket fields intact for current API consumers.
  let sql = `
    SELECT
      t.*,
      v.id AS v_id,
      v.plate_number AS v_plate_number,
      v.plate_code AS v_plate_code,
      CONCAT(v.plate_number, ' ', COALESCE(v.plate_code, '')) AS vehicle_plate,
      v.driver AS vehicle_driver,
      v.phone AS vehicle_phone,
      v.location AS vehicle_location
    FROM tickets t
    LEFT JOIN vehicles v ON v.id = t.vehicle_id
    WHERE 1=1`;
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    sql += ` AND t.status = $${params.length}`;
  }

  if (filters.vehicleId) {
    params.push(filters.vehicleId);
    sql += ` AND t.vehicle_id = $${params.length}`;
  }

  if (filters.reportedBy) {
    params.push(filters.reportedBy);
    sql += ` AND t.reported_by = $${params.length}`;
  }

  if (filters.department) {
    params.push(filters.department);
    sql += ` AND t.department = $${params.length}`;
  }

  // Fleet ticket separation:
  // fleetType=maintenance: all vehicle maintenance/issues except KM.
  // fleetType=km: Daily KM tickets only.
  // fleetType=general: non-vehicle tickets only.
  if (filters.fleetType === "maintenance") {
    sql += ` AND t.vehicle_id IS NOT NULL AND COALESCE(t.category, '') <> 'Daily KM' AND COALESCE(t.category, '') <> 'Daily Vehicle Submission'`;
  } else if (filters.fleetType === "km") {
    sql += ` AND t.vehicle_id IS NOT NULL AND t.category = 'Daily KM'`;
  } else if (filters.fleetType === "general") {
    sql += ` AND t.vehicle_id IS NULL AND COALESCE(t.category, '') <> 'Daily KM' AND COALESCE(t.category, '') <> 'Daily Vehicle Submission' AND COALESCE(t.category, '') <> 'Maintenance'`;
  } else if (filters.excludeDailyKm === "true" || filters.excludeDailyKm === true) {
    sql += ` AND COALESCE(t.category, '') <> 'Daily KM'`;
  }

  if (filters.category) {
    params.push(filters.category);
    sql += ` AND t.category = $${params.length}`;
  }

  sql += ` ORDER BY t.opened_at DESC, t.id DESC`;

  const result = await query(sql, params);

  return result.rows.map((row) => {
    const {
      v_id, v_plate_number, v_plate_code, vehicle_plate, vehicle_driver,
      vehicle_phone, vehicle_location, ...ticket
    } = row;

    return {
      ...ticket,
      vehicleId: ticket.vehicle_id ?? null,
      category: ticket.category || "",
      plate: vehicle_plate ? String(vehicle_plate).trim() : null,
      driver: vehicle_driver || null,
      driverPhone: vehicle_phone || null,
      site: vehicle_location || null,
      vehicle: v_id
        ? {
            id: Number(v_id),
            plateNumber: v_plate_number || "",
            plateCode: v_plate_code || "",
            plate: String(vehicle_plate || "").trim(),
            driver: vehicle_driver || "",
            phone: vehicle_phone || "",
            location: vehicle_location || ""
          }
        : null
    };
  });
}
export async function closeTicket(id) {
  const result = await query(
    `UPDATE tickets
     SET status = 'Closed',
         closed_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id]
  );

  return { changes: result.rowCount };
}

export async function deleteAllTickets() {
  const result = await query(`DELETE FROM tickets`);
  return { changes: result.rowCount };
}

export async function acknowledgeTicket(id, data = {}) {
  const acknowledgedBy =
    stringValue(data.acknowledgedBy || data.username || data.user) || "System";

  const result = await query(
    `UPDATE tickets
     SET status = 'Acknowledged',
         acknowledged_at = CURRENT_TIMESTAMP,
         acknowledged_by = $1
     WHERE id = $2
       AND status = 'Open'
     RETURNING *`,
    [acknowledgedBy, id]
  );

  if (!result.rows[0]) {
    const current = await query(`SELECT status FROM tickets WHERE id = $1`, [id]);
    if (!current.rows[0]) throw new Error("Ticket not found");
    throw new Error(`Ticket must be Open before it can be acknowledged. Current status: ${current.rows[0].status}`);
  }
  return result.rows[0];
}

export async function startTicketWork(id, data = {}) {
  const startedBy =
    stringValue(data.startedBy || data.username || data.user) || "System";

  const result = await query(
    `UPDATE tickets
     SET status = 'IN_PROGRESS',
         assigned_to_name = COALESCE(NULLIF($1,''), assigned_to_name),
         assigned_at = COALESCE(assigned_at, CURRENT_TIMESTAMP)
     WHERE id = $2
       AND status = 'Acknowledged'
     RETURNING *`,
    [startedBy, id]
  );

  if (!result.rows[0]) {
    const current = await query(`SELECT status FROM tickets WHERE id = $1`, [id]);
    if (!current.rows[0]) throw new Error("Ticket not found");
    throw new Error(`Ticket must be Acknowledged before work can start. Current status: ${current.rows[0].status}`);
  }
  return result.rows[0];
}

export async function closeTicketWithNotes(id, data = {}) {
  const closedBy =
    stringValue(data.closedBy || data.username || data.user) || "System";

  const resolutionNotes =
    stringValue(data.resolutionNotes || data.notes);

  const result = await query(
    `UPDATE tickets
     SET status = 'Closed',
         closed_at = CURRENT_TIMESTAMP,
         closed_by = $1,
         resolution_notes = $2
     WHERE id = $3
       AND status = 'IN_PROGRESS'
     RETURNING *`,
    [closedBy, resolutionNotes, id]
  );

  if (!result.rows[0]) {
    const current = await query(`SELECT status FROM tickets WHERE id = $1`, [id]);
    if (!current.rows[0]) throw new Error("Ticket not found");
    throw new Error(`Ticket must be In Progress before it can be closed. Current status: ${current.rows[0].status}`);
  }
  return result.rows[0];
}

export async function listTicketsByReporter(reporter) {
  const result = await query(
    `SELECT *
     FROM tickets
     WHERE reported_by = $1
     ORDER BY opened_at DESC, id DESC`,
    [reporter]
  );

  return result.rows;
}

export async function getReporterStats(reporter) {
  const result = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'Open')::int AS open,
       COUNT(*) FILTER (WHERE status = 'Closed')::int AS closed,
       COUNT(*) FILTER (WHERE status = 'Acknowledged')::int AS acknowledged
     FROM tickets
     WHERE reported_by = $1`,
    [reporter]
  );

  return result.rows[0];
}


// ============================================================
// DEFAULT EXPORT
// ============================================================

export default {
  listVehicles,
  getVehicleById,
  getVehicleByPlate,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  deleteAllVehicles,

  addReading,
  listReadings,
  changeOil,
  listOilChanges,

  createTicket,
  listTickets,
  closeTicket,
  deleteAllTickets,
  acknowledgeTicket,
  startTicketWork,
  closeTicketWithNotes,
  listTicketsByReporter,
  getReporterStats
};
// ============================================================
// SITES / CAMPS - POSTGRESQL
// ============================================================

export async function listSites() {
  // Single canonical Site Master. Legacy duplicate spellings are mapped to one
  // display name, while the seven approved sites are guaranteed to exist.
  const canonicalSites = [
    ["UQL", "Uqlat Al Soqour", "Qassim"],
    ["HAD", "Al Hadar", "WD"],
    ["HUL", "Al Hulayfa", "Madina"],
    ["SAB", "Al Sabiyah", "Madina"],
    ["WB", "Wadi Beddah", "Al Baha"],
    ["QUW", "Al Quwayiyah", "Al Quwayiyah"],
    ["MAH", "Mahd ad Dhahab", "Mahd"]
  ];

  for (const [code, name, region] of canonicalSites) {
    await query(
      `INSERT INTO sites (code, name, region, status)
       SELECT $1, $2, $3, 'Active'
       WHERE NOT EXISTS (
         SELECT 1 FROM sites
         WHERE lower(trim(name)) = lower(trim($2))
            OR upper(trim(coalesce(code, ''))) = upper(trim($1))
       )`,
      [code, name, region]
    );
  }

  const result = await query(`
    SELECT *
    FROM sites
    WHERE lower(trim(name)) IN (
      'uqlat al soqour',
      'uqlat saqour',
      'al hadar',
      'al hulifa',
      'al hulyfa',
      'al sabiyah',
      'sabeyah',
      'sabayia',
      'wadi beddah',
      'wadi bidah',
      'wadi bida',
      'al quwayiyah',
      'mah',
      'mahd',
      'mahd ad dhahab'
    )
    ORDER BY id ASC
  `);

  // Collapse legacy spellings to the approved display names and remove
  // duplicates without deleting historical database records.
  const canonicalName = (value) => {
    const key = String(value || '').trim().toLowerCase();
    if (['uqlat al soqour', 'uqlat saqour'].includes(key)) return 'Uqlat Al Soqour';
    if (['al hadar'].includes(key)) return 'Al Hadar';
    if (['al hulifa', 'al hulyfa'].includes(key)) return 'Al Hulayfa';
    if (['al sabiyah', 'sabeyah', 'sabayia'].includes(key)) return 'Al Sabiyah';
    if (['wadi beddah', 'wadi bidah', 'wadi bida'].includes(key)) return 'Wadi Beddah';
    if (['al quwayiyah'].includes(key)) return 'Al Quwayiyah';
    if (['mah', 'mahd', 'mahd ad dhahab'].includes(key)) return 'Mahd ad Dhahab';
    return String(value || '').trim();
  };

  const seen = new Set();
  return result.rows
    .map(row => ({ ...row, name: canonicalName(row.name) }))
    .filter(row => {
      const key = row.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function getSite(id) {
  const result = await query(
    `SELECT * FROM sites WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function createSite(data = {}) {
  const code = data.code || null;
  const name = data.name || data.siteName || "";
  const region = data.region || null;
  const campusManager = data.campus_manager || data.campusManager || null;
  const phone = data.phone || null;
  const notes = data.notes || null;
  const status = data.status || "Active";

  if (!name.trim()) {
    throw new Error("Site name is required");
  }

  const result = await query(
    `INSERT INTO sites
      (code, name, region, campus_manager, phone, notes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      code,
      name.trim(),
      region,
      campusManager,
      phone,
      notes,
      status
    ]
  );

  return result.rows[0];
}

export async function updateSite(id, data = {}) {
  const result = await query(
    `UPDATE sites
     SET
       code = COALESCE($1, code),
       name = COALESCE($2, name),
       region = COALESCE($3, region),
       campus_manager = COALESCE($4, campus_manager),
       phone = COALESCE($5, phone),
       notes = COALESCE($6, notes),
       status = COALESCE($7, status)
     WHERE id = $8
     RETURNING *`,
    [
      data.code ?? null,
      data.name ?? data.siteName ?? null,
      data.region ?? null,
      data.campus_manager ?? data.campusManager ?? null,
      data.phone ?? null,
      data.notes ?? null,
      data.status ?? null,
      id
    ]
  );

  if (!result.rows[0]) {
    throw new Error("Site not found");
  }

  return result.rows[0];
}

export async function deleteSite(id) {
  const result = await query(
    `DELETE FROM sites
     WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    throw new Error("Site not found");
  }

  return { changes: result.rowCount };
}

/* ============================================================
   FULL POSTGRESQL ERP FUNCTIONS
   Added by full SQLite -> PostgreSQL migration
   ============================================================ */

function pgNum(v, fallback = 0) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pgStr(v, fallback = "") {
  if (v === undefined || v === null) return fallback;
  return String(v).trim();
}

function pgMonthYear(date = new Date()) {
  const d = new Date(date);
  const month =
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0");

  return {
    month,
    year: String(d.getFullYear())
  };
}

// Normalize a date-ish value to a `YYYY-MM` key.
//
// `pg` returns DATE columns as JS Date objects, so the old
// `String(reported_date).slice(0, 7)` pattern produced "Thu Jul" and every
// report bucket silently fell through to zero. Handle Date, ISO strings and
// `YYYY-MM-DD` text uniformly.
function pgMonthKey(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Normalize an optional date input to a `YYYY-MM-DD` string, or null.
//
// A blank/absent start date must stay null. The previous behaviour defaulted to
// `new Date()`, so an import that carried an empty Start Date silently stamped
// the project with the import day and created a phantom reporting month.
function pgDateOrNull(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (raw === "") return null;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function pgGenNo(prefix) {
  return prefix + "-" + String(Date.now()).slice(-6);
}

function formatPGVehicle(v) {
  const currentKm = Number(v.current_km || 0);
  const lastOilKm = Number(v.last_oil_km || 0);
  const interval = Number(v.oil_change_interval || 5000);
  const sinceOil = Math.max(0, currentKm - lastOilKm);

  let calculatedStatus = v.status || "Safe";

  if (lastOilKm === 0 && currentKm > 0) {
    calculatedStatus = "Urgent Overdue";
  } else if (sinceOil >= interval) {
    calculatedStatus = "Urgent Overdue";
  } else if (sinceOil >= interval * 0.9) {
    calculatedStatus = "Warning";
  } else {
    calculatedStatus = "Safe";
  }

  return {
    id: v.id,
    plate: `${v.plate_number || ""} ${v.plate_code || ""}`.trim(),
    plateNumber: v.plate_number || "",
    plateCode: v.plate_code || "",
    make: v.make || "",
    model: v.model || "",
    year: v.year,
    location: v.location || "",
    driver: v.driver || "",
    phone: v.phone || "",
    currentKm,
    lastOilKm,
    sinceOil,
    remaining: Math.max(0, interval - sinceOil),
    interval,
    status: calculatedStatus,
    lastOilChangeDate: v.last_oil_change_date || null,
    meterUpdatedAt: v.meter_updated_at || null,
    createdAt: v.created_at,
    updatedAt: v.updated_at
  };
}

/* ============================================================
   VEHICLES
   ============================================================ */

export async function getAlerts() {
  const vehiclesResult = await query(`
    SELECT *
    FROM vehicles
    ORDER BY id ASC
  `);

  const vehicles = vehiclesResult.rows.map(formatPGVehicle);

  const urgent = vehicles.filter(v => v.status === "Urgent Overdue");
  const warning = vehicles.filter(v => v.status === "Warning");
  const safe = vehicles.filter(v => v.status === "Safe");

  // Contract: urgent/warning/safe are vehicle ARRAYS (the shape every
  // dashboard and the notifications UI consume). Numeric counts are exposed
  // separately so callers never have to guess between a number and an array.
  return {
    total: vehicles.length,
    urgent,
    warning,
    safe,
    urgentVehicles: urgent,
    warningVehicles: warning,
    urgentCount: urgent.length,
    warningCount: warning.length,
    safeCount: safe.length,
    summary: {
      total: vehicles.length,
      urgent: urgent.length,
      warning: warning.length,
      safe: safe.length
    },
    vehicles
  };
}

export async function importVehicles(vehicles = []) {
  if (!Array.isArray(vehicles)) {
    throw new Error("Vehicles must be an array");
  }

  let imported = 0;

  await transaction(async client => {
    for (const data of vehicles) {
      const plate = pgStr(data.plate || data.plateNumber);
      const parts = plate.split(/\s+/);

      const plateNumber =
        pgStr(data.plateNumber) ||
        parts[0] ||
        "";

      const plateCode =
        pgStr(data.plateCode) ||
        parts.slice(1).join(" ") ||
        "";

      if (!plateNumber) continue;

      await client.query(`
        INSERT INTO vehicles
        (
          plate_number,
          plate_code,
          make,
          model,
          year,
          location,
          driver,
          phone,
          current_km,
          last_oil_km,
          oil_change_interval,
          last_oil_change_date,
          status,
          meter_updated_at
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO NOTHING
      `, [
        plateNumber,
        plateCode,
        pgStr(data.make, "Toyota"),
        pgStr(data.model, "Hilux"),
        pgNum(data.year, 2022),
        pgStr(data.location),
        pgStr(data.driver),
        pgStr(data.phone),
        pgNum(data.currentKm ?? data.current_km),
        pgNum(data.lastOilKm ?? data.last_oil_km),
        pgNum(data.interval ?? data.oil_change_interval, 5000),
        data.lastOilChangeDate ?? data.last_oil_change_date ?? null,
        pgStr(data.status, "Safe"),
        data.meterUpdatedAt ?? data.meter_updated_at ?? null
      ]);

      imported++;
    }
  });

  return { imported };
}

/* ============================================================
   WORK ORDERS
   ============================================================ */

export async function listWorkOrders(filters = {}) {
  let sql = `
    SELECT *
    FROM work_orders
    WHERE 1=1
  `;

  const params = [];

  if (filters.month) {
    params.push(filters.month);
    sql += ` AND month = $${params.length}`;
  }

  if (filters.year) {
    params.push(String(filters.year));
    sql += ` AND year = $${params.length}`;
  }

  if (filters.site) {
    params.push(filters.site);
    sql += ` AND site = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ` ORDER BY reported_date DESC, id DESC`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getWorkOrder(id) {
  const result = await query(
    `SELECT * FROM work_orders WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function ensureGeneralMaintenanceSchema() {
  await query(`
    ALTER TABLE work_orders
      ADD COLUMN IF NOT EXISTS performed_by TEXT
  `);
}

export async function createWorkOrder(data = {}) {
  await ensureGeneralMaintenanceSchema();
  const reportedDate = data.reportedDate || data.reported_date || new Date();
  const { month, year } = pgMonthYear(reportedDate);
  const isContractor = !!data.isContractor || !!data.is_contractor;
  const contractorName = pgStr(data.contractorName ?? data.contractor_name);
  const assignedTo = pgStr(data.assignedTo ?? data.assigned_to);
  const performedBy = pgStr(data.performedBy ?? data.performed_by) || (isContractor ? contractorName : assignedTo);
  if (isContractor && !contractorName) throw new Error("Contractor name is required");
  if (!isContractor && !performedBy) throw new Error("Employee / executor name is required");

  const result = await query(`
    INSERT INTO work_orders
    (
      wo_no,
      site,
      area,
      category,
      priority,
      description,
      assigned_to,
      is_contractor,
      contractor_name,
      performed_by,
      status,
      reported_date,
      completed_date,
      final_cost,
      contractor_cost,
      labor_cost,
      parts_cost,
      closing_notes,
      parts_used,
      month,
      year
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    RETURNING *
  `, [
    pgStr(data.woNo) || pgGenNo("WO"),
    pgStr(data.site),
    pgStr(data.area),
    pgStr(data.category, "General"),
    pgStr(data.priority, "Medium"),
    pgStr(data.description),
    pgStr(data.assignedTo ?? data.assigned_to),
    data.isContractor ? 1 : 0,
    contractorName,
    performedBy,
    pgStr(data.status, "Open"),
    data.reportedDate ?? data.reported_date ?? new Date(),
    data.completedDate ?? data.completed_date ?? null,
    pgNum(data.finalCost ?? data.final_cost),
    pgNum(data.contractorCost ?? data.contractor_cost),
    pgNum(data.laborCost ?? data.labor_cost),
    pgNum(data.partsCost ?? data.parts_cost),
    pgStr(data.closingNotes ?? data.closing_notes),
    pgStr(data.partsUsed ?? data.parts_used),
    month,
    year
  ]);

  return result.rows[0];
}

export async function updateWorkOrder(id, data = {}) {
  await ensureGeneralMaintenanceSchema();
  const current = await getWorkOrder(id);

  if (!current) {
    throw new Error("Work order not found");
  }

  const result = await query(`
    UPDATE work_orders
    SET
      wo_no = $1,
      site = $2,
      area = $3,
      category = $4,
      priority = $5,
      description = $6,
      assigned_to = $7,
      is_contractor = $8,
      contractor_name = $9,
      performed_by = $10,
      status = $11,
      reported_date = $12,
      completed_date = $13,
      final_cost = $14,
      contractor_cost = $15,
      labor_cost = $16,
      parts_cost = $17,
      closing_notes = $18,
      parts_used = $19,
      month = $20,
      year = $21,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $22
    RETURNING *
  `, [
    data.woNo ?? current.wo_no,
    data.site ?? current.site,
    data.area ?? current.area,
    data.category ?? current.category,
    data.priority ?? current.priority,
    data.description ?? current.description,
    data.assignedTo ?? data.assigned_to ?? current.assigned_to,
    data.isContractor === undefined
      ? current.is_contractor
      : (data.isContractor ? 1 : 0),
    data.contractorName ?? data.contractor_name ?? current.contractor_name,
    data.performedBy ?? data.performed_by ?? current.performed_by ?? (data.isContractor || data.is_contractor ? (data.contractorName ?? data.contractor_name ?? current.contractor_name) : (data.assignedTo ?? data.assigned_to ?? current.assigned_to)),
    data.status ?? current.status,
    data.reportedDate ?? data.reported_date ?? current.reported_date,
    data.completedDate ?? data.completed_date ?? current.completed_date,
    data.finalCost ?? data.final_cost ?? current.final_cost,
    data.contractorCost ?? data.contractor_cost ?? current.contractor_cost,
    data.laborCost ?? data.labor_cost ?? current.labor_cost,
    data.partsCost ?? data.parts_cost ?? current.parts_cost,
    data.closingNotes ?? data.closing_notes ?? current.closing_notes,
    data.partsUsed ?? data.parts_used ?? current.parts_used,
    (() => { const d = data.reportedDate ?? data.reported_date ?? current.reported_date; return pgMonthYear(d).month; })(),
    (() => { const d = data.reportedDate ?? data.reported_date ?? current.reported_date; return pgMonthYear(d).year; })(),
    id
  ]);

  return result.rows[0];
}

export async function closeWorkOrder(id, data = {}) {
  await ensureGeneralMaintenanceSchema();
  const result = await query(`
    UPDATE work_orders
    SET
      status = 'Closed',
      completed_date = CURRENT_DATE,
      final_cost = $1,
      contractor_cost = $2,
      labor_cost = $3,
      parts_cost = $4,
      is_contractor = $5,
      contractor_name = $6,
      performed_by = $7,
      closing_notes = $8,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $9
    RETURNING *
  `, [
    pgNum(data.finalCost ?? data.final_cost),
    pgNum(data.contractorCost ?? data.contractor_cost),
    pgNum(data.laborCost ?? data.labor_cost),
    pgNum(data.partsCost ?? data.parts_cost),
    data.isContractor ? 1 : 0,
    pgStr(data.contractorName ?? data.contractor_name),
    pgStr(data.performedBy ?? data.performed_by),
    pgStr(data.closingNotes ?? data.closing_notes),
    id
  ]);

  if (!result.rows[0]) {
    throw new Error("Work order not found");
  }

  return result.rows[0];
}

export async function deleteWorkOrder(id) {
  const result = await query(
    `DELETE FROM work_orders WHERE id = $1`,
    [id]
  );

  if (!result.rowCount) {
    throw new Error("Work order not found");
  }

  return { changes: result.rowCount };
}

/* ============================================================
   PROJECTS
   ============================================================ */

export async function listProjects(filters = {}) {
  let sql = `
    SELECT p.*,
      COALESCE(pi.total_items, 0) AS total_items,
      COALESCE(pi.completed_items, 0) AS completed_items,
      CASE
        WHEN COALESCE(pi.total_items, 0) > 0
        THEN ROUND((COALESCE(pi.completed_items, 0)::numeric / pi.total_items::numeric) * 100, 0)
        ELSE 0
      END AS progress_percent
    FROM projects p
    LEFT JOIN (
      SELECT project_id,
        COUNT(*) AS total_items,
        COUNT(*) FILTER (WHERE status = 'Completed') AS completed_items
      FROM project_items
      GROUP BY project_id
    ) pi ON pi.project_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.month) {
    params.push(filters.month);
    sql += ` AND month = $${params.length}`;
  }

  if (filters.year) {
    params.push(String(filters.year));
    sql += ` AND year = $${params.length}`;
  }

  if (filters.site) {
    params.push(filters.site);
    sql += ` AND site = $${params.length}`;
  }

  sql += ` ORDER BY p.created_at DESC, p.id DESC`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getProject(id) {
  const result = await query(
    `SELECT * FROM projects WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function createProject(data = {}) {
  // A project without a start date stays without one. Do NOT default to today:
  // that fabricated a phantom reporting month for every imported row whose
  // Start Date was blank. month/year cache fields simply stay null too.
  const startDate = pgDateOrNull(data.startDate ?? data.start_date);
  const monthKey = pgMonthKey(startDate);
  const month = monthKey;
  const year = monthKey ? monthKey.slice(0, 4) : null;

  const result = await query(`
    INSERT INTO projects
    (
      project_no,
      name,
      description,
      site,
      project_type,
      status,
      budget,
      spent,
      start_date,
      end_date,
      manager,
      contractor,
      month,
      year,
      notes
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *
  `, [
    pgStr(data.projectNo ?? data.project_no) || pgGenNo("PRJ"),
    pgStr(data.name, "New Project"),
    pgStr(data.description),
    pgStr(data.site),
    pgStr(data.projectType ?? data.project_type, "Development"),
    pgStr(data.status, "Active"),
    pgNum(data.budget),
    pgNum(data.spent),
    startDate,
    pgDateOrNull(data.endDate ?? data.end_date),
    pgStr(data.manager),
    pgStr(data.contractor),
    month,
    year,
    pgStr(data.notes)
  ]);

  return result.rows[0];
}

export async function listProjectItems(projectId) {
  const result = await query(`SELECT * FROM project_items WHERE project_id = $1 ORDER BY id`, [projectId]);
  return result.rows;
}

export async function createProjectItem(projectId, data = {}) {
  const result = await query(`INSERT INTO project_items (project_id, sr_no, item, unit, quantity, price, cost, section, status, actual_amount, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [projectId, stringValue(data.srNo ?? data.sr_no), stringValue(data.item), stringValue(data.unit), numberValue(data.quantity),
      numberValue(data.price), numberValue(data.cost), stringValue(data.section), stringValue(data.status, 'Not Started'), numberValue(data.actualAmount ?? data.actual_amount), stringValue(data.notes)]);
  return result.rows[0];
}

export async function updateProjectItem(id, data = {}) {
  const current = await query(`SELECT * FROM project_items WHERE id=$1`, [id]);
  if (!current.rows[0]) throw new Error('Project item not found');
  const result = await query(`UPDATE project_items SET status=$1, actual_amount=$2, notes=$3, updated_at=CURRENT_TIMESTAMP,
    closed_at=CASE WHEN $1 IN ('Completed','Closed') THEN COALESCE(closed_at,CURRENT_TIMESTAMP) ELSE NULL END
    WHERE id=$4 RETURNING *`,
    [stringValue(data.status, current.rows[0].status || 'Not Started'), numberValue(data.actualAmount ?? data.actual_amount ?? current.rows[0].actual_amount),
      stringValue(data.notes ?? current.rows[0].notes), id]);
  return result.rows[0];
}

export async function closeProjectItem(id, data = {}) {
  return updateProjectItem(id, { status:'Completed', actualAmount:data.actualAmount ?? data.actual_amount, notes:data.notes });
}

export async function reopenProjectItem(id) {
  const result = await query(`UPDATE project_items
    SET status='Completed', actual_amount=0, notes='', closed_at=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE id=$1
    RETURNING *`, [id]);
  if (!result.rows[0]) throw new Error('Project item not found');
  return result.rows[0];
}

export async function listWorkOrderItems(workOrderId) {
  const result = await query(`SELECT * FROM work_order_items WHERE work_order_id = $1 ORDER BY id`, [workOrderId]);
  return result.rows;
}

export async function createWorkOrderItem(workOrderId, data = {}) {
  const result = await query(`INSERT INTO work_order_items (work_order_id, sr_no, item, unit, quantity) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [workOrderId, stringValue(data.srNo ?? data.sr_no), stringValue(data.item), stringValue(data.unit), numberValue(data.quantity)]);
  return result.rows[0];
}

export async function updateProject(id, data = {}) {
  const current = await getProject(id);

  if (!current) {
    throw new Error("Project not found");
  }

  const startDateProvided =
    data.startDate !== undefined || data.start_date !== undefined;
  const startDate = startDateProvided
    ? pgDateOrNull(data.startDate ?? data.start_date)
    : current.start_date;

  // Keep the cached month/year in step with the effective start date. Clearing
  // the start date clears the cache too, so no stale month survives.
  const effectiveStart = startDate ? pgDateOrNull(startDate) : null;
  const monthKey = pgMonthKey(effectiveStart);
  const month =
    data.month ?? (startDateProvided ? monthKey : current.month);
  const year =
    data.year ?? (startDateProvided ? (monthKey ? monthKey.slice(0, 4) : null) : current.year);

  const result = await query(`
    UPDATE projects
    SET
      project_no = $1,
      name = $2,
      description = $3,
      site = $4,
      project_type = $5,
      status = $6,
      budget = $7,
      spent = $8,
      start_date = $9,
      end_date = $10,
      manager = $11,
      contractor = $12,
      month = $13,
      year = $14,
      notes = $15,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $16
    RETURNING *
  `, [
    data.projectNo ?? data.project_no ?? current.project_no,
    data.name ?? current.name,
    data.description ?? current.description,
    data.site ?? current.site,
    data.projectType ?? data.project_type ?? current.project_type,
    data.status ?? current.status,
    data.budget ?? current.budget,
    data.spent ?? current.spent,
    effectiveStart,
    data.endDate !== undefined || data.end_date !== undefined
      ? pgDateOrNull(data.endDate ?? data.end_date)
      : current.end_date,
    data.manager ?? current.manager,
    data.contractor ?? current.contractor,
    month,
    year,
    data.notes ?? current.notes,
    id
  ]);

  return result.rows[0];
}

export async function closeProject(id, data = {}) {
  const current = await getProject(id);
  if (!current) throw new Error("Project not found");
  const isContractor = data.isContractor ? 1 : 0;
  const contractorName = pgStr(data.contractorName ?? data.contractor_name);
  const performedBy = pgStr(data.performedBy ?? data.performed_by) || (isContractor ? contractorName : '');
  if (isContractor && !contractorName) throw new Error("Contractor name is required");
  if (!isContractor && !performedBy) throw new Error("Employee / executor name is required");
  const finalCost = pgNum(data.finalCost ?? data.final_cost);
  const result = await query(`
    UPDATE projects SET status='Completed', spent=$1, final_cost=$1,
      is_contractor=$2, contractor_name=$3, performed_by=$4,
      completed_date=CURRENT_DATE, closing_notes=$5, updated_at=CURRENT_TIMESTAMP
    WHERE id=$6 RETURNING *
  `, [finalCost,isContractor,contractorName,performedBy,pgStr(data.closingNotes ?? data.closing_notes),id]);
  return result.rows[0];
}

export async function deleteProject(id) {
  const result = await query(
    `DELETE FROM projects WHERE id = $1`,
    [id]
  );

  if (!result.rowCount) {
    throw new Error("Project not found");
  }

  return { changes: result.rowCount };
}

/* ============================================================
   PROJECT PURCHASE REQUESTS — OWNER APPROVAL WORKFLOW
   ============================================================ */

export async function ensurePurchaseRequestsTable() {
  await query(`CREATE TABLE IF NOT EXISTS purchase_requests (
    id BIGSERIAL PRIMARY KEY,
    request_no TEXT NOT NULL UNIQUE,
    requested_by_user_id BIGINT,
    requested_by TEXT,
    department TEXT NOT NULL DEFAULT 'Projects',
    site TEXT,
    project_id BIGINT,
    project_no TEXT,
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    estimated_unit_cost NUMERIC NOT NULL DEFAULT 0,
    estimated_total NUMERIC NOT NULL DEFAULT 0,
    supplier TEXT,
    purpose TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    approved_by_user_id BIGINT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    approval_notes TEXT,
    rejected_by_user_id BIGINT,
    rejected_by TEXT,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    purchase_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS request_id BIGINT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS approved_by_user_id BIGINT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS approved_by TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS requested_by_user_id BIGINT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS requested_by TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS site TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS project_id BIGINT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS project_no TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS approval_notes TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS recorded_by_user_id BIGINT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS recorded_by TEXT`);
  await query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ`);
  await query(`CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_purchase_requests_project_id ON purchase_requests(project_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_purchases_request_id ON purchases(request_id)`);
}



export async function listPurchaseRequests() {
  await ensurePurchaseRequestsTable();
  const result = await query(`
    SELECT *
    FROM purchase_requests
    ORDER BY created_at DESC, id DESC
  `);
  return result.rows;
}

export async function getPurchaseRequest(id) {
  const result = await query(
    `SELECT * FROM purchase_requests WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function createPurchaseRequest(data = {}) {
  await ensurePurchaseRequestsTable();
  const quantity = pgNum(data.quantity, 1);
  const estimatedUnitCost = pgNum(data.estimatedUnitCost ?? data.estimated_unit_cost);
  const estimatedTotal =
    data.estimatedTotal !== undefined || data.estimated_total !== undefined
      ? pgNum(data.estimatedTotal ?? data.estimated_total)
      : quantity * estimatedUnitCost;

  const result = await query(`
    INSERT INTO purchase_requests
    (
      request_no,
      requested_by_user_id,
      requested_by,
      department,
      site,
      project_id,
      project_no,
      item_name,
      quantity,
      estimated_unit_cost,
      estimated_total,
      supplier,
      purpose,
      notes,
      status
    )
    VALUES
    ($1,$2,$3,'Projects',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Pending')
    RETURNING *
  `, [
    pgStr(data.requestNo ?? data.request_no) || pgGenNo("REQ"),
    data.requestedByUserId ?? data.requested_by_user_id ?? null,
    pgStr(data.requestedBy ?? data.requested_by),
    pgStr(data.site),
    data.projectId ?? data.project_id ?? null,
    pgStr(data.projectNo ?? data.project_no),
    pgStr(data.itemName ?? data.item_name),
    quantity,
    estimatedUnitCost,
    estimatedTotal,
    pgStr(data.supplier),
    pgStr(data.purpose),
    pgStr(data.notes)
  ]);

  return result.rows[0];
}

export async function approvePurchaseRequest(id, user = {}, approvalNotes = "") {
  await ensurePurchaseRequestsTable();
  const current = await getPurchaseRequest(id);
  if (!current) throw new Error("Purchase request not found");
  if (current.status !== "Pending") throw new Error("Only Pending requests can be approved");

  const result = await query(`
    UPDATE purchase_requests
    SET status = 'Approved',
        approved_by_user_id = $1,
        approved_by = $2,
        approved_at = CURRENT_TIMESTAMP,
        approval_notes = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *
  `, [
    user.id ?? null,
    pgStr(user.fullName ?? user.full_name ?? user.username),
    pgStr(approvalNotes),
    id
  ]);

  return result.rows[0];
}

export async function rejectPurchaseRequest(id, user = {}, reason = "") {
  await ensurePurchaseRequestsTable();
  const current = await getPurchaseRequest(id);
  if (!current) throw new Error("Purchase request not found");
  if (current.status !== "Pending") throw new Error("Only Pending requests can be rejected");

  const result = await query(`
    UPDATE purchase_requests
    SET status = 'Rejected',
        rejected_by_user_id = $1,
        rejected_by = $2,
        rejected_at = CURRENT_TIMESTAMP,
        rejection_reason = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *
  `, [
    user.id ?? null,
    pgStr(user.fullName ?? user.full_name ?? user.username),
    pgStr(reason),
    id
  ]);

  return result.rows[0];
}

export async function recordPurchaseFromRequest(id, data = {}, user = {}) {
  await ensurePurchaseRequestsTable();
  const request = await getPurchaseRequest(id);
  if (!request) throw new Error("Purchase request not found");
  if (request.status !== "Approved") throw new Error("Purchase can only be recorded after Owner approval");
  if (request.purchase_id) throw new Error("This request already has a recorded purchase");

  const purchase = await createPurchase({
    purchaseNo: data.purchaseNo ?? data.purchase_no,
    type: "Project",
    referenceNo: request.project_no || request.request_no,
    itemName: request.item_name,
    quantity: data.quantity ?? request.quantity,
    unitCost: data.unitCost ?? data.unit_cost ?? request.estimated_unit_cost,
    supplier: data.supplier ?? request.supplier,
    purchasedBy: data.purchasedBy ?? data.purchased_by ?? "Company",
    purchaseDate: data.purchaseDate ?? data.purchase_date ?? new Date(),
    notes: data.notes ?? request.notes,
    requestId: request.id,
    approvedByUserId: request.approved_by_user_id,
    approvedBy: request.approved_by,
    approvedAt: request.approved_at,
    requestedByUserId: request.requested_by_user_id,
    requestedBy: request.requested_by,
    site: request.site,
    projectId: request.project_id,
    projectNo: request.project_no,
    approvalNotes: request.approval_notes,
    recordedByUserId: user.id ?? null,
    recordedBy: user.fullName ?? user.full_name ?? user.username ?? '',
    recordedAt: new Date()
  });

  const updated = await query(`
    UPDATE purchase_requests
    SET status = 'Purchased',
        purchase_id = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
  `, [purchase.id, id]);

  return { request: updated.rows[0], purchase };
}

/* ============================================================
   PURCHASES
   ============================================================ */

export async function listPurchases(filters = {}) {
  let sql = `SELECT * FROM purchases WHERE 1=1`;
  const params = [];

  if (filters.month) {
    params.push(filters.month);
    sql += ` AND month = $${params.length}`;
  }

  if (filters.year) {
    params.push(String(filters.year));
    sql += ` AND year = $${params.length}`;
  }

  if (filters.referenceNo || filters.reference_no) {
    params.push(filters.referenceNo ?? filters.reference_no);
    sql += ` AND reference_no = $${params.length}`;
  }

  sql += ` ORDER BY purchase_date DESC, id DESC`;

  const result = await query(sql, params);
  return result.rows;
}

export async function createPurchase(data = {}) {
  const purchaseDate =
    data.purchaseDate ??
    data.purchase_date ??
    new Date();

  const { month, year } = pgMonthYear(purchaseDate);

  const quantity = pgNum(data.quantity, 1);
  const unitCost = pgNum(data.unitCost ?? data.unit_cost);
  const totalCost =
    data.totalCost !== undefined || data.total_cost !== undefined
      ? pgNum(data.totalCost ?? data.total_cost)
      : quantity * unitCost;

  const result = await query(`
    INSERT INTO purchases
    (
      purchase_no,
      type,
      reference_no,
      item_name,
      quantity,
      unit_cost,
      total_cost,
      supplier,
      purchased_by,
      purchase_date,
      month,
      year,
      notes,
      request_id,
      approved_by_user_id,
      approved_by,
      approved_at,
      requested_by_user_id,
      requested_by,
      site,
      project_id,
      project_no,
      approval_notes,
      recorded_by_user_id,
      recorded_by,
      recorded_at
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    RETURNING *
  `, [
    pgStr(data.purchaseNo ?? data.purchase_no) || pgGenNo("PUR"),
    pgStr(data.type, "Work Order"),
    pgStr(data.referenceNo ?? data.reference_no),
    pgStr(data.itemName ?? data.item_name),
    quantity,
    unitCost,
    totalCost,
    pgStr(data.supplier),
    pgStr(data.purchasedBy ?? data.purchased_by, "Company"),
    purchaseDate,
    month,
    year,
    pgStr(data.notes),
    data.requestId ?? data.request_id ?? null,
    data.approvedByUserId ?? data.approved_by_user_id ?? null,
    pgStr(data.approvedBy ?? data.approved_by),
    data.approvedAt ?? data.approved_at ?? null,
    data.requestedByUserId ?? data.requested_by_user_id ?? null,
    pgStr(data.requestedBy ?? data.requested_by),
    pgStr(data.site),
    data.projectId ?? data.project_id ?? null,
    pgStr(data.projectNo ?? data.project_no),
    pgStr(data.approvalNotes ?? data.approval_notes),
    data.recordedByUserId ?? data.recorded_by_user_id ?? null,
    pgStr(data.recordedBy ?? data.recorded_by),
    data.recordedAt ?? data.recorded_at ?? null
  ]);

  return result.rows[0];
}

export async function updatePurchase(id, data = {}) {
  const current = (await query(`SELECT * FROM purchases WHERE id=$1`, [id])).rows[0];
  if (!current) throw new Error("Purchase not found");
  const quantity = data.quantity ?? current.quantity;
  const unitCost = data.unitCost ?? data.unit_cost ?? current.unit_cost;
  const totalCost = data.totalCost ?? data.total_cost ?? (Number(quantity) * Number(unitCost));
  const result = await query(`
    UPDATE purchases SET type=$1, reference_no=$2, item_name=$3, quantity=$4, unit_cost=$5,
      total_cost=$6, supplier=$7, purchased_by=$8, purchase_date=$9, notes=$10,
      status=$11, final_cost=$12, is_contractor=$13, contractor_name=$14,
      performed_by=$15, completed_date=$16, closing_notes=$17
    WHERE id=$18 RETURNING *
  `,[
    data.type ?? current.type, data.referenceNo ?? data.reference_no ?? current.reference_no,
    data.itemName ?? data.item_name ?? current.item_name, quantity, unitCost, totalCost,
    data.supplier ?? current.supplier, data.purchasedBy ?? data.purchased_by ?? current.purchased_by,
    data.purchaseDate ?? data.purchase_date ?? current.purchase_date, data.notes ?? current.notes,
    data.status ?? current.status ?? 'Open', data.finalCost ?? data.final_cost ?? current.final_cost,
    data.isContractor === undefined ? current.is_contractor : (data.isContractor ? 1 : 0),
    data.contractorName ?? data.contractor_name ?? current.contractor_name,
    data.performedBy ?? data.performed_by ?? current.performed_by,
    data.completedDate ?? data.completed_date ?? current.completed_date,
    data.closingNotes ?? data.closing_notes ?? current.closing_notes, id
  ]);
  return result.rows[0];
}

export async function closePurchase(id, data = {}) {
  const current = (await query(`SELECT * FROM purchases WHERE id=$1`, [id])).rows[0];
  if (!current) throw new Error("Purchase not found");
  const isContractor = data.isContractor ? 1 : 0;
  const contractorName = pgStr(data.contractorName ?? data.contractor_name);
  const performedBy = pgStr(data.performedBy ?? data.performed_by) || (isContractor ? contractorName : '');
  if (isContractor && !contractorName) throw new Error("Contractor name is required");
  if (!isContractor && !performedBy) throw new Error("Employee / executor name is required");
  const finalCost = pgNum(data.finalCost ?? data.final_cost);
  const result = await query(`
    UPDATE purchases SET status='Closed', final_cost=$1, total_cost=$1,
      is_contractor=$2, contractor_name=$3, performed_by=$4,
      completed_date=CURRENT_DATE, closing_notes=$5
    WHERE id=$6 RETURNING *`,
    [finalCost,isContractor,contractorName,performedBy,pgStr(data.closingNotes ?? data.closing_notes),id]);
  return result.rows[0];
}

export async function deletePurchase(id) {
  const result = await query(
    `DELETE FROM purchases WHERE id = $1`,
    [id]
  );

  if (!result.rowCount) {
    throw new Error("Purchase not found");
  }

  return { changes: result.rowCount };
}

/* ============================================================
   DRIVERS
   ============================================================ */

export async function listDrivers() {
  const result = await query(`
    SELECT d.*,
           v.id AS assigned_vehicle_id,
           CASE WHEN v.id IS NOT NULL THEN CONCAT(v.plate_number, ' ', v.plate_code) ELSE NULL END AS vehicle_plate
    FROM drivers d
    LEFT JOIN vehicles v ON v.driver_id = d.id
    ORDER BY d.name ASC
  `);
  return result.rows.map(d => ({
    ...d,
    licenseNo: d.license_no,
    licenseExpiry: d.license_expiry,
    vehicleId: d.assigned_vehicle_id ?? null,
    vehiclePlate: d.vehicle_plate
  }));
}

export async function getDriver(id) {
  const result = await query(`
    SELECT d.*,
           v.id AS assigned_vehicle_id,
           CASE WHEN v.id IS NOT NULL THEN CONCAT(v.plate_number, ' ', v.plate_code) ELSE NULL END AS vehicle_plate
    FROM drivers d
    LEFT JOIN vehicles v ON v.driver_id = d.id
    WHERE d.id = $1
  `, [id]);
  if (!result.rows[0]) return null;
  const d = result.rows[0];
  return {
    ...d,
    licenseNo: d.license_no,
    licenseExpiry: d.license_expiry,
    vehicleId: d.assigned_vehicle_id ?? null,
    vehiclePlate: d.vehicle_plate
  };
}

export async function createDriver(data = {}) {
  const vehicleId = data.vehicleId ?? data.vehicle_id ?? null;
  if (vehicleId) {
    const vehicle = (await query(`SELECT id, driver_id FROM vehicles WHERE id = $1 LIMIT 1`, [vehicleId])).rows[0];
    if (!vehicle) throw new Error("Vehicle not found");
    if (vehicle.driver_id) throw new Error("Vehicle is already assigned to another driver");
  }

  const result = await query(`
    INSERT INTO drivers
      (name, phone, license_no, license_expiry, nationality, vehicle_id, status, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `, [
    pgStr(data.name), pgStr(data.phone), pgStr(data.licenseNo ?? data.license_no),
    data.licenseExpiry ?? data.license_expiry ?? null, pgStr(data.nationality),
    vehicleId, pgStr(data.status, "Active"), pgStr(data.notes)
  ]);

  if (vehicleId) {
    await query(`
      UPDATE vehicles SET driver_id = $1, driver = $2, phone = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [result.rows[0].id, pgStr(data.name), pgStr(data.phone), vehicleId]);
  }
  return getDriver(result.rows[0].id);
}

export async function updateDriver(id, data = {}) {
  const current = await getDriver(id);
  if (!current) throw new Error("Driver not found");

  const oldVehicleId = current.vehicleId || null;
  const vehicleProvided = data.vehicleId !== undefined || data.vehicle_id !== undefined;
  const newVehicleId = vehicleProvided ? (data.vehicleId ?? data.vehicle_id ?? null) : oldVehicleId;

  if (newVehicleId) {
    const vehicle = (await query(`SELECT id, driver_id FROM vehicles WHERE id = $1 LIMIT 1`, [newVehicleId])).rows[0];
    if (!vehicle) throw new Error("Vehicle not found");
    if (vehicle.driver_id && Number(vehicle.driver_id) !== Number(id)) {
      throw new Error("Vehicle is already assigned to another driver");
    }
  }

  const name = pgStr(data.name ?? current.name);
  const phone = pgStr(data.phone ?? current.phone);

  const result = await query(`
    UPDATE drivers
    SET name=$1, phone=$2, license_no=$3, license_expiry=$4, nationality=$5,
        vehicle_id=$6, status=$7, notes=$8, updated_at=CURRENT_TIMESTAMP
    WHERE id=$9
    RETURNING *
  `, [
    name, phone,
    data.licenseNo ?? data.license_no ?? current.license_no,
    data.licenseExpiry ?? data.license_expiry ?? current.license_expiry,
    data.nationality ?? current.nationality,
    newVehicleId,
    data.status ?? current.status,
    data.notes ?? current.notes,
    id
  ]);

  if (oldVehicleId && oldVehicleId !== newVehicleId) {
    await query(`
      UPDATE vehicles SET driver_id=NULL, driver='', phone='', updated_at=CURRENT_TIMESTAMP WHERE id=$1
    `, [oldVehicleId]);
  }
  if (newVehicleId) {
    await query(`
      UPDATE vehicles SET driver_id=$1, driver=$2, phone=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4
    `, [id, name, phone, newVehicleId]);
  }

  return getDriver(id);
}

export async function deleteDriver(id) {
  const current = await getDriver(id);
  if (!current) throw new Error("Driver not found");

  const result = await query(`
    UPDATE drivers SET status='Inactive', vehicle_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1
  `, [id]);

  if (current.vehicleId) {
    await query(`
      UPDATE vehicles SET driver_id=NULL, driver='', phone='', updated_at=CURRENT_TIMESTAMP WHERE id=$1
    `, [current.vehicleId]);
  }
  return { changes: result.rowCount, deactivated: true };
}

/* ============================================================
   WAREHOUSE TABLES
   ============================================================ */

export async function ensureWarehouseTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS warehouse_locations (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      site TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS warehouse_stock (
      id SERIAL PRIMARY KEY,
      item_code TEXT NOT NULL,
      location_code TEXT NOT NULL,
      quantity DOUBLE PRECISION DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(item_code, location_code)
    )
  `);

  await query(`
    ALTER TABLE inventory ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_inventory_created_by_user_id ON inventory(created_by_user_id)`);

  const locations = [
    ["MAIN", "Main Warehouse", "Main"],
    ["UQL", "Uqlat Al Soqour", "Uqlat Al Soqour"],
    ["HAD", "Al Hadar", "Al Hadar"],
    ["SAB", "Al Sabiyah", "Al Sabiyah"],
    ["QUW", "Al Quwayiyah", "Al Quwayiyah"],
    ["MAH", "Mahd ad Dhahab", "Mahd ad Dhahab"],
    ["WB", "Wadi Beddah", "Wadi Beddah"],
    ["HUL", "Al Hulifa", "Al Hulifa"]
  ];

  for (const [code, name, site] of locations) {
    await query(`
      INSERT INTO warehouse_locations
        (code, name, site)
      VALUES ($1,$2,$3)
      ON CONFLICT (code) DO NOTHING
    `, [code, name, site]);
  }

  return true;
}

/* ============================================================
   INVENTORY
   ============================================================ */

export async function listInventory() {
  await ensureWarehouseTables();
  const result = await query(`
    SELECT *
    FROM inventory
    ORDER BY name ASC, id ASC
  `);

  return result.rows;
}

export async function getInventoryItem(id) {
  await ensureWarehouseTables();
  const result = await query(`
    SELECT *
    FROM inventory
    WHERE id::text = $1
       OR code = $1
    LIMIT 1
  `, [String(id)]);

  return result.rows[0] || null;
}

export async function createInventoryItem(data = {}) {
  const qty = pgNum(data.quantity);
  const location = pgStr(data.location, "Main Warehouse");

  return await transaction(async client => {
    const result = await client.query(`
      INSERT INTO inventory
      (
        code, name, category, unit, quantity, min_stock, unit_cost,
        location, supplier, status, notes, created_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      pgStr(data.code),
      pgStr(data.name),
      pgStr(data.category, "General"),
      pgStr(data.unit, "PCS"),
      qty,
      pgNum(data.minStock ?? data.min_stock, 5),
      pgNum(data.unitCost ?? data.unit_cost),
      location,
      pgStr(data.supplier),
      pgStr(data.status, "ACTIVE"),
      pgStr(data.notes),
      data.createdByUserId ?? data.created_by_user_id ?? null
    ]);

    const item = result.rows[0];

    if (qty > 0) {
      await client.query(`
        INSERT INTO stock_transactions
        (type, item_code, item_name, quantity, from_location, to_location, reference_no, notes)
        VALUES ('IN',$1,$2,$3,NULL,$4,$5,$6)
      `, [
        item.code,
        item.name,
        qty,
        location,
        pgStr(data.referenceNo ?? data.reference_no),
        pgStr(data.notes) || "Opening stock"
      ]);
    }

    return item;
  });
}

export async function updateInventoryItem(id, data = {}) {
  await ensureWarehouseTables();
  const current = await getInventoryItem(id);

  if (!current) {
    throw new Error("Inventory item not found");
  }

  const result = await query(`
    UPDATE inventory
    SET
      code = $1,
      name = $2,
      category = $3,
      unit = $4,
      quantity = $5,
      min_stock = $6,
      unit_cost = $7,
      location = $8,
      supplier = $9,
      status = $10,
      notes = $11,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $12
    RETURNING *
  `, [
    data.code ?? current.code,
    data.name ?? current.name,
    data.category ?? current.category,
    data.unit ?? current.unit,
    data.quantity ?? current.quantity,
    data.minStock ?? data.min_stock ?? current.min_stock,
    data.unitCost ?? data.unit_cost ?? current.unit_cost,
    data.location ?? current.location,
    data.supplier ?? current.supplier,
    data.status ?? current.status,
    data.notes ?? current.notes,
    current.id
  ]);

  return result.rows[0];
}

export async function deleteInventoryItem(id) {
  await ensureWarehouseTables();
  const current = await getInventoryItem(id);

  if (!current) {
    throw new Error("Inventory item not found");
  }

  return transaction(async (client) => {
    // Stock transactions use item code/name rather than inventory.id.
    // Remove only this item's history together with the item itself.
    const txResult = await client.query(
      `DELETE FROM stock_transactions
       WHERE item_code = $1 AND item_name = $2`,
      [current.code, current.name]
    );

    const result = await client.query(
      `DELETE FROM inventory WHERE id = $1`,
      [current.id]
    );

    return {
      changes: result.rowCount,
      transactionsDeleted: txResult.rowCount
    };
  });
}

export async function canManageInventoryItem(user, id) {
  if (!user) return false;
  if (user.role === "Owner") return true;
  if (!["CampusManager", "SupportManager", "SSM"].includes(user.role)) return false;
  await ensureWarehouseTables();
  const item = await getInventoryItem(id);
  return Boolean(item && item.created_by_user_id != null && Number(item.created_by_user_id) === Number(user.id));
}

export async function stockIn(data = {}) {
  await ensureWarehouseTables();

  const item = await getInventoryItem(
    data.itemCode ?? data.item_code ?? data.id
  );

  if (!item) {
    throw new Error("Inventory item not found");
  }

  const qty = pgNum(data.quantity);

  if (qty <= 0) {
    throw new Error("Quantity must be greater than zero");
  }

  const toLocation =
    pgStr(data.toLocation ?? data.to_location) ||
    item.location ||
    "Main Warehouse";

  return await transaction(async client => {
    await client.query(`
      UPDATE inventory
      SET
        quantity = quantity + $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [qty, item.id]);

    await client.query(`
      INSERT INTO stock_transactions
      (
        type,
        item_code,
        item_name,
        quantity,
        from_location,
        to_location,
        reference_no,
        notes
      )
      VALUES
      ('IN',$1,$2,$3,NULL,$4,$5,$6)
    `, [
      item.code,
      item.name,
      qty,
      toLocation,
      pgStr(data.referenceNo ?? data.reference_no),
      pgStr(data.notes)
    ]);

    const result = await client.query(`
      SELECT *
      FROM inventory
      WHERE id = $1
    `, [item.id]);

    return result.rows[0];
  });
}

export async function stockOut(data = {}) {
  await ensureWarehouseTables();

  const item = await getInventoryItem(
    data.itemCode ?? data.item_code ?? data.id
  );

  if (!item) {
    throw new Error("Inventory item not found");
  }

  const qty = pgNum(data.quantity);

  if (qty <= 0) {
    throw new Error("Quantity must be greater than zero");
  }

  if (Number(item.quantity) < qty) {
    throw new Error("Insufficient stock");
  }

  const fromLocation =
    pgStr(data.fromLocation ?? data.from_location) ||
    item.location ||
    "Main Warehouse";

  return await transaction(async client => {
    await client.query(`
      UPDATE inventory
      SET
        quantity = quantity - $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [qty, item.id]);

    await client.query(`
      INSERT INTO stock_transactions
      (
        type,
        item_code,
        item_name,
        quantity,
        from_location,
        to_location,
        reference_no,
        notes
      )
      VALUES
      ('OUT',$1,$2,$3,$4,NULL,$5,$6)
    `, [
      item.code,
      item.name,
      qty,
      fromLocation,
      pgStr(data.referenceNo ?? data.reference_no),
      pgStr(data.notes)
    ]);

    const result = await client.query(`
      SELECT *
      FROM inventory
      WHERE id = $1
    `, [item.id]);

    return result.rows[0];
  });
}

export async function transferStock(data = {}) {
  await ensureWarehouseTables();

  const item = await getInventoryItem(
    data.itemCode ?? data.item_code ?? data.id
  );

  if (!item) {
    throw new Error("Inventory item not found");
  }

  const qty = pgNum(data.quantity);

  if (qty <= 0) {
    throw new Error("Quantity must be greater than zero");
  }

  if (Number(item.quantity) < qty) {
    throw new Error("Insufficient stock");
  }

  const fromLocation =
    pgStr(data.fromLocation ?? data.from_location) ||
    item.location ||
    "Main Warehouse";

  const toLocation =
    pgStr(data.toLocation ?? data.to_location);

  if (!toLocation) {
    throw new Error("Destination location is required");
  }

  if (fromLocation === toLocation) {
    throw new Error("Source and destination cannot be the same");
  }

  return await transaction(async client => {
    await client.query(`
      UPDATE inventory
      SET
        quantity = quantity - $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [qty, item.id]);

    await client.query(`
      INSERT INTO stock_transactions
      (
        type,
        item_code,
        item_name,
        quantity,
        from_location,
        to_location,
        reference_no,
        notes
      )
      VALUES
      ('TRANSFER',$1,$2,$3,$4,$5,$6,$7)
    `, [
      item.code,
      item.name,
      qty,
      fromLocation,
      toLocation,
      pgStr(data.referenceNo ?? data.reference_no),
      pgStr(data.notes)
    ]);

    return {
      success: true,
      itemCode: item.code,
      itemName: item.name,
      quantity: qty,
      fromLocation,
      toLocation
    };
  });
}

export async function deleteStockTransaction(id) {
  return transaction(async (client) => {
    const tx = await client.query(
      `SELECT id, type, item_code, item_name, quantity
       FROM stock_transactions
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (!tx.rows[0]) throw new Error("Stock transaction not found");

    const row = tx.rows[0];
    const item = await client.query(
      `SELECT id, quantity
       FROM inventory
       WHERE code = $1 AND name = $2
       FOR UPDATE`,
      [row.item_code, row.item_name]
    );

    if (!item.rows[0]) throw new Error("Inventory item linked to this transaction was not found");

    const qty = Number(row.quantity) || 0;
    const delta = row.type === "IN" ? -qty : qty;

    const updated = await client.query(
      `UPDATE inventory
       SET quantity = quantity + $1,
           status = CASE WHEN quantity + $1 > 0 THEN 'ACTIVE' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [delta, item.rows[0].id]
    );

    await client.query(`DELETE FROM stock_transactions WHERE id = $1`, [id]);

    return {
      deletedTransaction: row,
      item: updated.rows[0]
    };
  });
}

export async function listStockTransactions() {
  const result = await query(`
    SELECT *
    FROM stock_transactions
    ORDER BY trans_date DESC, id DESC
  `);

  return result.rows;
}

export async function getLowStockItems() {
  await ensureWarehouseTables();
  const result = await query(`
    SELECT *
    FROM inventory
    WHERE status = 'ACTIVE'
      AND quantity <= min_stock
    ORDER BY quantity ASC, name ASC
  `);

  return result.rows;
}

/* ============================================================
   PERIODIC MAINTENANCE
   ============================================================ */

export async function listPeriodicMaintenance(filters = {}) {
  let sql = `
    SELECT
      pm.*,
      CONCAT(v.plate_number, ' ', v.plate_code) AS vehicle_plate,
      v.location AS vehicle_location,
      v.driver AS driver_name
    FROM periodic_maintenance pm
    LEFT JOIN vehicles v
      ON v.id = pm.vehicle_id
    WHERE 1=1
  `;

  const params = [];

  if (filters.vehicleId || filters.vehicle_id) {
    params.push(filters.vehicleId ?? filters.vehicle_id);
    sql += ` AND pm.vehicle_id = $${params.length}`;
  }

  if (filters.type) {
    params.push(filters.type);
    sql += ` AND pm.type = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    sql += ` AND pm.status = $${params.length}`;
  }

  sql += ` ORDER BY pm.scheduled_date ASC, pm.id ASC`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getPeriodicMaintenance(id) {
  const result = await query(`
    SELECT
      pm.*,
      CONCAT(v.plate_number, ' ', v.plate_code) AS vehicle_plate,
      v.driver AS driver_name
    FROM periodic_maintenance pm
    LEFT JOIN vehicles v
      ON v.id = pm.vehicle_id
    WHERE pm.id = $1
  `, [id]);

  return result.rows[0] || null;
}

export async function createPeriodicMaintenance(data = {}) {
  const vehicleId = data.vehicleId ?? data.vehicle_id;
  const type = pgStr(data.type);
  const scheduledDate =
    data.scheduledDate ??
    data.scheduled_date;

  if (!vehicleId) {
    throw new Error("Vehicle is required");
  }

  if (!type) {
    throw new Error("Maintenance type is required");
  }

  if (!scheduledDate) {
    throw new Error("Scheduled date is required");
  }

  const result = await query(`
    INSERT INTO periodic_maintenance
    (
      vehicle_id,
      type,
      scheduled_date,
      completed_date,
      status,
      technician,
      cost,
      notes
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `, [
    vehicleId,
    type,
    scheduledDate,
    data.completedDate ?? data.completed_date ?? null,
    pgStr(data.status, "Pending"),
    pgStr(data.technician),
    pgNum(data.cost),
    pgStr(data.notes)
  ]);

  return result.rows[0];
}

export async function updatePeriodicMaintenance(id, data = {}) {
  const current = await getPeriodicMaintenance(id);

  if (!current) {
    throw new Error("Periodic maintenance not found");
  }

  const result = await query(`
    UPDATE periodic_maintenance
    SET
      vehicle_id = $1,
      type = $2,
      scheduled_date = $3,
      completed_date = $4,
      status = $5,
      technician = $6,
      cost = $7,
      notes = $8
    WHERE id = $9
    RETURNING *
  `, [
    data.vehicleId ?? data.vehicle_id ?? current.vehicle_id,
    data.type ?? current.type,
    data.scheduledDate ?? data.scheduled_date ?? current.scheduled_date,
    data.completedDate ?? data.completed_date ?? current.completed_date,
    data.status ?? current.status,
    data.technician ?? current.technician,
    data.cost ?? current.cost,
    data.notes ?? current.notes,
    id
  ]);

  return result.rows[0];
}

export async function completePeriodicMaintenance(id, data = {}) {
  const result = await query(`
    UPDATE periodic_maintenance
    SET
      status = 'Completed',
      completed_date = CURRENT_DATE,
      technician = $1,
      cost = $2,
      notes = $3
    WHERE id = $4
    RETURNING *
  `, [
    pgStr(data.technician),
    pgNum(data.cost),
    pgStr(data.notes),
    id
  ]);

  if (!result.rows[0]) {
    throw new Error("Periodic maintenance not found");
  }

  // Keep vehicle compliance fields synchronized when an annual inspection is
  // actually completed. Scheduled/pending inspection rows must never mark a
  // vehicle as inspected.
  if (String(result.rows[0].type || '').toLowerCase().trim() === 'inspection') {
    const completedDate = result.rows[0].completed_date || result.rows[0].last_service_date || new Date().toISOString().slice(0, 10);
    await query(`
      UPDATE vehicles
      SET inspection_last_date = $1::date,
          inspection_due_date = ($1::date + INTERVAL '365 days')::date
      WHERE id = $2
    `, [completedDate, result.rows[0].vehicle_id]);
  }

  return result.rows[0];
}

export async function deletePeriodicMaintenance(id) {
  const result = await query(
    `DELETE FROM periodic_maintenance WHERE id = $1`,
    [id]
  );

  if (!result.rowCount) {
    throw new Error("Periodic maintenance not found");
  }

  return { changes: result.rowCount };
}

export async function getPeriodicAlerts() {
  // Two independent triggers:
  //  - date: scheduled_date <= today + 7 days
  //  - km:   next_due_km is reached (overdue) or within 500 km (due soon)
  // The same vehicle can trigger both; we dedupe by pm.id.
  const result = await query(`
    SELECT
      pm.*,
      CONCAT(v.plate_number, ' ', v.plate_code) AS vehicle_plate,
      v.driver AS driver_name,
      v.current_km AS current_km
    FROM periodic_maintenance pm
    LEFT JOIN vehicles v
      ON v.id = pm.vehicle_id
    WHERE pm.status = 'Pending'
      AND (
        (pm.scheduled_date IS NOT NULL AND pm.scheduled_date <= CURRENT_DATE + INTERVAL '7 days')
        OR
        (pm.next_due_km IS NOT NULL AND v.current_km IS NOT NULL AND v.current_km >= pm.next_due_km - 500)
      )
    ORDER BY pm.scheduled_date ASC, pm.id ASC
  `);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdue = [];
  const dueSoon = [];

  for (const r of result.rows) {
    const currentKm = Number(r.current_km || 0);
    const nextDueKm = r.next_due_km != null ? Number(r.next_due_km) : null;

    let isOverdue = false;
    let isDueSoon = false;

    // KM-based
    if (nextDueKm != null && currentKm > 0) {
      if (currentKm >= nextDueKm) isOverdue = true;
      else if (currentKm >= nextDueKm - 500) isDueSoon = true;
    }

    // Date-based
    if (r.scheduled_date) {
      const sd = new Date(r.scheduled_date);
      sd.setHours(0, 0, 0, 0);
      const diffDays = Math.round((sd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) isOverdue = true;
      else if (diffDays <= 7) isDueSoon = true;
    }

    const enriched = {
      ...r,
      current_km: currentKm,
      next_due_km: nextDueKm,
      overdue_km: nextDueKm != null ? currentKm - nextDueKm : null
    };

    if (isOverdue) overdue.push(enriched);
    else if (isDueSoon) dueSoon.push(enriched);
  }

  const countByType = (list) => {
    const out = { total: list.length, oil_change: 0, "6_months_general": 0, inspection: 0, other: 0 };
    for (const r of list) {
      const t = r.type;
      if (t === "oil_change") out.oil_change += 1;
      else if (t === "6_months_general") out["6_months_general"] += 1;
      else if (t === "inspection") out.inspection += 1;
      else out.other += 1;
    }
    return out;
  };

  return {
    overdue,
    dueSoon,
    counts: {
      overdue: countByType(overdue),
      dueSoon: countByType(dueSoon)
    }
  };
}

export async function generateScheduledMaintenance(monthsAhead = 6) {
  const INTERVALS = {
    oil_change: { km: 5000, days: null },
    "6_months_general": { km: null, days: 180 },
    inspection: { km: null, days: 365 }
  };

  const horizonMonths = Math.max(1, Math.min(Number(monthsAhead) || 6, 60));
  const horizonDate = new Date();
  horizonDate.setDate(horizonDate.getDate() + horizonMonths * 30);
  const horizonKey = horizonDate.toISOString().slice(0, 10);

  const result = await query(`
    SELECT id, current_km, last_oil_km
    FROM vehicles
    ORDER BY id
  `);

  let created = 0;

  for (const vehicle of result.rows) {
    for (const [type, interval] of Object.entries(INTERVALS)) {
      const exists = await query(
        `SELECT id FROM periodic_maintenance
         WHERE vehicle_id = $1 AND type = $2 AND status = 'Pending'
         LIMIT 1`,
        [vehicle.id, type]
      );

      if (exists.rows.length) continue;

      let scheduledDate;
      let nextDueKm = null;

      if (type === "oil_change") {
        const lastKm = Number(vehicle.last_oil_km || 0) || Number(vehicle.current_km || 0);
        nextDueKm = lastKm + interval.km;
        scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + 60);
      } else {
        scheduledDate = new Date();
        // Respect the requested horizon: never schedule beyond monthsAhead.
        scheduledDate.setDate(
          scheduledDate.getDate() + Math.min(interval.days, horizonMonths * 30)
        );
      }

      const scheduledKey = scheduledDate.toISOString().slice(0, 10);
      if (scheduledKey > horizonKey) continue;

      await query(
        `INSERT INTO periodic_maintenance
          (vehicle_id, type, scheduled_date, status, next_due_km, interval_km, interval_days)
         VALUES ($1, $2, $3, 'Pending', $4, $5, $6)`,
        [
          vehicle.id,
          type,
          scheduledKey,
          nextDueKm,
          interval.km,
          interval.days
        ]
      );

      created += 1;
    }
  }

  return { created, monthsAhead: horizonMonths };
}

/* ============================================================
   AUDIT LOG
   ============================================================ */

export async function logAction(data = {}) {
  try {
    const result = await query(`
      INSERT INTO audit_log
      (
        user_id,
        username,
        action,
        entity_type,
        entity_id,
        details,
        ip_address
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [
      data.userId ?? data.user_id ?? null,
      pgStr(data.username),
      pgStr(data.action, "UNKNOWN"),
      pgStr(data.entityType ?? data.entity_type),
      data.entityId ?? data.entity_id ?? null,
      typeof data.details === "string"
        ? data.details
        : JSON.stringify(data.details ?? {}),
      pgStr(data.ipAddress ?? data.ip_address)
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("Audit log error:", error.message);
    return null;
  }
}

export async function listAuditLog(filters = {}) {
  let sql = `
    SELECT *
    FROM audit_log
    WHERE 1=1
  `;

  const params = [];

  if (filters.username) {
    params.push(filters.username);
    sql += ` AND username = $${params.length}`;
  }

  if (filters.action) {
    params.push(filters.action);
    sql += ` AND action = $${params.length}`;
  }

  if (filters.entityType || filters.entity_type) {
    params.push(filters.entityType ?? filters.entity_type);
    sql += ` AND entity_type = $${params.length}`;
  }

  if (filters.fromDate || filters.from_date) {
    params.push(filters.fromDate ?? filters.from_date);
    sql += ` AND created_at >= $${params.length}`;
  }

  if (filters.toDate || filters.to_date) {
    params.push(filters.toDate ?? filters.to_date);
    sql += ` AND created_at <= $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC, id DESC LIMIT 500`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getAuditStats() {
  const totalResult = await query(`
    SELECT COUNT(*)::int AS total
    FROM audit_log
  `);

  const todayResult = await query(`
    SELECT COUNT(*)::int AS today
    FROM audit_log
    WHERE created_at >= CURRENT_DATE
  `);

  const usersResult = await query(`
    SELECT
      username,
      COUNT(*)::int AS count
    FROM audit_log
    GROUP BY username
    ORDER BY count DESC
    LIMIT 10
  `);

  const actionsResult = await query(`
    SELECT
      action,
      COUNT(*)::int AS count
    FROM audit_log
    GROUP BY action
    ORDER BY count DESC
    LIMIT 10
  `);

  return {
    total: totalResult.rows[0].total,
    today: todayResult.rows[0].today,
    byUser: usersResult.rows,
    byAction: actionsResult.rows
  };
}

export async function clearAuditLog(olderThanDays = 90) {
  const result = await query(`
    DELETE FROM audit_log
    WHERE created_at < CURRENT_TIMESTAMP
      - ($1::text || ' days')::interval
  `, [Number(olderThanDays)]);

  return {
    changes: result.rowCount
  };
}

/* ============================================================
   BUILDING DASHBOARD
   ============================================================ */

export async function getBuildingDashboard(filters = {}) {
  const workOrders = await listWorkOrders(filters);
  const projects = await listProjects(filters);
  const purchases = await listPurchases(filters);

  const woTotal = workOrders.length;

  const woOpen = workOrders.filter(
    w => String(w.status).toLowerCase() !== "closed"
  ).length;

  const woClosed = workOrders.filter(
    w => String(w.status).toLowerCase() === "closed"
  ).length;

  const woContractor = workOrders.filter(
    w => {
      const cn = String(w.contractor_name || "").trim();
      return cn !== "" && cn.toLowerCase() !== "company" && cn.toLowerCase() !== "internal";
    }
  ).length;

  const woInternal = woTotal - woContractor;

  const sum = (arr, field) =>
    arr.reduce(
      (total, row) => total + Number(row[field] || 0),
      0
    );

  // Imported project Excel rows store Price/Cost at project_items level.
  // Keep manually entered project budgets/spent untouched, but when the project
  // budget is zero use the imported item costs as the project's displayed cost.
  const projectIds = projects.map(p => p.id).filter(Boolean);
  let itemCostByProject = new Map();
  if (projectIds.length) {
    const itemCosts = await query(
      `SELECT project_id, COALESCE(SUM(COALESCE(cost,0)),0) AS item_cost
       FROM project_items
       WHERE project_id = ANY($1::bigint[])
       GROUP BY project_id`,
      [projectIds]
    );
    itemCostByProject = new Map(
      itemCosts.rows.map(r => [Number(r.project_id), Number(r.item_cost || 0)])
    );
  }

  const projectBudget = projects.reduce((total, p) => {
    const storedBudget = Number(p.budget || 0);
    const importedItemCost = Number(itemCostByProject.get(Number(p.id)) || 0);
    return total + (storedBudget !== 0 ? storedBudget : importedItemCost);
  }, 0);

  return {
    workOrders: {
      total: woTotal,
      open: woOpen,
      closed: woClosed,
      contractor: woContractor,
      internal: woInternal,
      totalCost: sum(workOrders, "final_cost"),
      contractorCost: sum(workOrders, "contractor_cost"),
      laborCost: sum(workOrders, "labor_cost"),
      partsCost: sum(workOrders, "parts_cost")
    },
    projects: {
      total: projects.length,
      budget: projectBudget,
      spent: sum(projects, "spent"),
      list: projects
    },
    purchases: {
      total: purchases.length,
      totalCost: sum(purchases, "total_cost")
    }
  };
}


/* ============================================================
   CURRENT MONTH DASHBOARD FINANCIALS
   Mirrors the Apps Script dashboard calculation semantics.
   ============================================================ */
export async function getCurrentMonthDashboardFinancial() {
  const wo = await query(`
    SELECT
      COUNT(*)::int AS total_wo,
      COALESCE(SUM(COALESCE(final_cost,0)),0) AS maintenance_cost,
      COALESCE(SUM(CASE WHEN (is_contractor = 1 OR (COALESCE(contractor_name,'') <> '' AND LOWER(contractor_name) NOT IN ('company','internal'))) AND COALESCE(contractor_cost,0) > 0 THEN contractor_cost ELSE 0 END),0) AS contractor_wo
    FROM work_orders
    WHERE reported_date >= date_trunc('month', CURRENT_DATE)
      AND reported_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
  `);

  const projects = await query(`
    SELECT
      COUNT(*)::int AS total_projects,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(budget,0) <> 0 THEN budget
          ELSE COALESCE((
            SELECT SUM(COALESCE(pi.cost,0))
            FROM project_items pi
            WHERE pi.project_id = projects.id
          ),0)
        END
      ),0) AS development_cost,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(NULLIF(TRIM(contractor),''),'') <> ''
          THEN COALESCE(spent,0)
          ELSE 0
        END
      ),0) AS contractor_dev
    FROM projects
    WHERE COALESCE(end_date, start_date) >= date_trunc('month', CURRENT_DATE)::date
      AND COALESCE(end_date, start_date) < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
  `);

  const purchases = await query(`
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(total_cost,0) > 0 THEN total_cost ELSE 0 END),0) AS parts_cost,
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(purchased_by,'company')) = 'contractor' AND COALESCE(total_cost,0) > 0 THEN total_cost ELSE 0 END),0) AS contractor_parts
    FROM purchases
    WHERE purchase_date >= date_trunc('month', CURRENT_DATE)::date
      AND purchase_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
  `);

  const w = wo.rows[0] || {};
  const p = projects.rows[0] || {};
  const pur = purchases.rows[0] || {};
  const maintenanceCost = Number(w.maintenance_cost || 0);
  const developmentCost = Number(p.development_cost || 0);
  const partsCost = Number(pur.parts_cost || 0);
  const contractorWO = Number(w.contractor_wo || 0);
  const contractorDev = Number(p.contractor_dev || 0);
  const contractorParts = Number(pur.contractor_parts || 0);
  const totalCompanyCost = maintenanceCost + developmentCost + partsCost;
  const totalContractorCost = contractorWO + contractorDev + contractorParts;

  return {
    currentMonth: new Date().toISOString().slice(0,7),
    totalWO: Number(w.total_wo || 0),
    totalProjects: Number(p.total_projects || 0),
    totalDevProjects: Number(p.total_projects || 0),
    maintenanceCost,
    developmentCost,
    partsCost,
    contractorWO,
    contractorDev,
    contractorCost: contractorWO + contractorDev,
    contractorParts,
    totalContractorCost,
    totalCompanyCost
  };
}

/* ============================================================
   VEHICLE DASHBOARD
   ============================================================ */

export async function getDashboard() {
  const vehiclesResult = await query(`
    SELECT *
    FROM vehicles
    ORDER BY id ASC
  `);

  const vehicles = vehiclesResult.rows.map(formatPGVehicle);

  const tickets = await listTickets();

  return {
    vehicles: {
      total: vehicles.length,
      urgent: vehicles.filter(v => v.status === "Urgent Overdue").length,
      warning: vehicles.filter(v => v.status === "Warning").length,
      safe: vehicles.filter(v => v.status === "Safe").length,
      list: vehicles
    },
    tickets: {
      total: tickets.length,
      open: tickets.filter(
        t => String(t.status).toLowerCase() !== "closed"
      ).length,
      closed: tickets.filter(
        t => String(t.status).toLowerCase() === "closed"
      ).length
    },
    alerts: await getAlerts()
  };
}

/* ============================================================
   MONTHLY REPORT
   ============================================================ */


/* ============================================================
   GENERAL MAINTENANCE MONTHLY REPORT
   - Work orders only; projects are intentionally excluded.
   - Month is derived from reported_date using Riyadh calendar date.
   - Internal/Company = blank, Company, or Internal contractor name.
   ============================================================ */
export async function getGeneralMaintenanceReport(filters = {}) {
  const year = Number(filters.year) || new Date().getFullYear();
  const site = pgStr(filters.site, "");

  const params = [year];
  let where = `
    reported_date >= make_date($1, 1, 1)
    AND reported_date < make_date($1 + 1, 1, 1)
  `;

  if (site) {
    params.push(site);
    where += ` AND site = $${params.length}`;
  }

  const result = await query(`
    SELECT
      id, wo_no, site, area, category, priority, description,
      assigned_to, is_contractor, contractor_name, status,
      reported_date, completed_date,
      parts_used,
      COALESCE(final_cost, 0) AS final_cost,
      COALESCE(contractor_cost, 0) AS contractor_cost,
      COALESCE(labor_cost, 0) AS labor_cost,
      COALESCE(parts_cost, 0) AS parts_cost,
      month, year
    FROM work_orders
    WHERE ${where}
    ORDER BY reported_date ASC, id ASC
  `, params);

  const orders = result.rows;
  const isExternal = (name) => {
    const n = pgStr(name, "").toLowerCase();
    return n !== "" && n !== "company" && n !== "internal";
  };

  const months = Array.from({ length: 6 }, (_, i) => {
    const monthNumber = i + 7;
    const key = `${year}-${String(monthNumber).padStart(2, "0")}`;
    return {
      month: key,
      totalWO: 0,
      contractorWO: 0,
      employeeWO: 0,
      contractorAmount: 0,
      employeeAmount: 0,
      partsAmount: 0,
      totalAmount: 0,
      contractors: [],
      employees: []
    };
  });

  const map = new Map(months.map(m => [m.month, m]));
  const people = new Map();

  for (const o of orders) {
    const month = pgMonthKey(o.reported_date);
    const m = map.get(month);
    if (!m) continue;

    const external = Number(o.is_contractor) === 1 || o.is_contractor === true || isExternal(o.contractor_name);
    const finalCost = pgNum(o.final_cost);
    const contractorCost = pgNum(o.contractor_cost);
    const laborCost = pgNum(o.labor_cost);
    const partsCost = pgNum(o.parts_cost);
    const person = external
      ? pgStr(o.contractor_name, "Unknown Contractor")
      : pgStr(o.assigned_to, "Company / Internal");

    m.totalWO += 1;
    m.totalAmount += finalCost;
    m.partsAmount += partsCost;

    if (external) {
      m.contractorWO += 1;
      m.contractorAmount += contractorCost || finalCost;
    } else {
      m.employeeWO += 1;
      m.employeeAmount += laborCost;
    }

    const key = `${month}|${external ? "contractor" : "employee"}|${person}`;
    if (!people.has(key)) {
      people.set(key, {
        month,
        type: external ? "Contractor" : "Employee",
        name: person,
        woCount: 0,
        amount: 0
      });
    }
    const p = people.get(key);
    p.woCount += 1;
    p.amount += external ? (contractorCost || finalCost) : laborCost;
  }

  for (const p of people.values()) {
    const m = map.get(p.month);
    (p.type === "Contractor" ? m.contractors : m.employees).push(p);
  }

  const activeMonths = months.filter(m => m.totalWO > 0);
  const totals = months.reduce((a, m) => ({
    totalWO: a.totalWO + m.totalWO,
    contractorWO: a.contractorWO + m.contractorWO,
    employeeWO: a.employeeWO + m.employeeWO,
    contractorAmount: a.contractorAmount + m.contractorAmount,
    employeeAmount: a.employeeAmount + m.employeeAmount,
    partsAmount: a.partsAmount + m.partsAmount,
    totalAmount: a.totalAmount + m.totalAmount
  }), {
    totalWO: 0, contractorWO: 0, employeeWO: 0,
    contractorAmount: 0, employeeAmount: 0,
    partsAmount: 0, totalAmount: 0
  });

  return {
    year,
    source: "ERP PostgreSQL — work_orders",
    projectsExcluded: true,
    site: site || null,
    months,
    activeMonths,
    totals,
    orders
  };
}

export async function getMonthlyReport(filters = {}) {
  const year = Number(filters.year) || new Date().getFullYear();
  const site = pgStr(filters.site, "");

  const start = `${year}-07-01`;
  const next = `${year + 1}-01-01`;
  const params = [start, next];
  const siteClause = site ? ` AND site = $${params.push(site)}` : "";

  // Use the real transaction dates, not cached month/year text fields.
  // This prevents old/stale September values from appearing in a new month.
  const wo = await query(`
    SELECT reported_date, site, final_cost, contractor_name
    FROM work_orders
    WHERE reported_date >= $1 AND reported_date < $2${siteClause}
  `, params);

  const projectParams = [start, next];
  const projectSiteClause = site ? ` AND site = $${projectParams.push(site)}` : "";
  const projects = await query(`
    SELECT start_date, site, spent, contractor
    FROM projects
    WHERE start_date >= $1 AND start_date < $2${projectSiteClause}
  `, projectParams);

  const purchaseParams = [start, next];
  const purchases = await query(`
    SELECT purchase_date, total_cost, purchased_by
    FROM purchases
    WHERE purchase_date >= $1 AND purchase_date < $2
  `, purchaseParams);

  const months = {};
  for (let i = 7; i <= 12; i++) {
    const key = `${year}-${String(i).padStart(2, "0")}`;
    months[key] = {
      month: key, woCount: 0, woCost: 0, woContractor: 0, woInternal: 0,
      woContractorCount: 0, woInternalCount: 0,
      projCount: 0, projSpent: 0, purCount: 0, purCost: 0,
      purCompany: 0, purContractor: 0, total: 0
    };
  }

  const monthKey = value => pgMonthKey(value);
  const isExternal = value => {
    const n = String(value || "").trim().toLowerCase();
    return n !== "" && n !== "company" && n !== "internal";
  };

  for (const w of wo.rows) {
    const b = months[monthKey(w.reported_date)];
    if (!b) continue;
    const cost = Number(w.final_cost || 0);
    b.woCount++;
    b.woCost += cost;
    if (isExternal(w.contractor_name)) {
      b.woContractor += cost;
      b.woContractorCount++;
    } else {
      b.woInternal += cost;
      b.woInternalCount++;
    }
  }

  for (const p of projects.rows) {
    const b = months[monthKey(p.start_date)];
    if (!b) continue;
    b.projCount++;
    b.projSpent += Number(p.spent || 0);
  }

  for (const p of purchases.rows) {
    const b = months[monthKey(p.purchase_date)];
    if (!b) continue;
    const cost = Number(p.total_cost || 0);
    b.purCount++;
    b.purCost += cost;
    if (isExternal(p.purchased_by)) b.purContractor += cost;
    else b.purCompany += cost;
  }

  const rows = Object.values(months);
  for (const row of rows) {
    row.total = row.woCost + row.projSpent + row.purCost;
  }

  const summary = {
    grandTotal: rows.reduce((s,r) => s + r.total, 0),
    totalWO: rows.reduce((s,r) => s + r.woCost, 0),
    totalProjects: rows.reduce((s,r) => s + r.projSpent, 0),
    totalPurchases: rows.reduce((s,r) => s + r.purCost, 0),
    totalContractor: rows.reduce((s,r) => s + r.woContractor + r.purContractor, 0),
    totalInternal: rows.reduce((s,r) => s + r.woInternal + r.purCompany, 0)
  };
  const total = summary.totalContractor + summary.totalInternal;
  summary.internalPercent = total ? (summary.totalInternal / total) * 100 : 0;
  summary.contractorPercent = total ? (summary.totalContractor / total) * 100 : 0;

  return { year, site: site || null, rows, months: rows, summary };
}

/* ============================================================
   FINANCIAL REPORT
   ============================================================ */

/* ============================================================
   FINANCIAL REPORT â€” Corrected Version 2
   ============================================================
   
   ØªØµØ­ÙŠØ­ Ø£Ø³Ù…Ø§Ø¡ Ø§Ù„Ø­Ù‚ÙˆÙ„:
   - work_orders.contractor_name (Ù„ÙŠØ³ contractor)
   - work_orders.final_cost (ØªÙƒÙ„ÙØ© Ø§Ù„Ù…Ù‚Ø§ÙˆÙ„)
   - work_orders.is_contractor (boolean)
   - projects.contractor (ØµØ­ÙŠØ­)
   - projects.spent (ØµØ­ÙŠØ­)
   - purchases.type / total_cost (ØµØ­ÙŠØ­)
   
   Ø§Ù„Ù…Ù†Ø·Ù‚:
   - Baseline = Ù…ØªÙˆØ³Ø· Ø¢Ø®Ø± 6 Ø´Ù‡ÙˆØ± (ØªÙƒÙ„ÙØ© Ø§Ù„Ù…Ù‚Ø§ÙˆÙ„ÙŠÙ† â€” Ø¨Ø¯ÙˆÙ† Ø±Ø§ØªØ¨)
   - Actual = Ø§Ù„ØªÙƒÙ„ÙØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ© Ø´Ø§Ù…Ù„Ø© Ø±Ø§ØªØ¨ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†
   - Savings = Baseline - Actual
   
   Ø§Ù„ØµÙŠØ§Ù†Ø©: maintActual = contractorWO + partsWO + salaryMaint
   Ø§Ù„ØªØ·ÙˆÙŠØ±: devActual = contractorDev + salaryDev (Ù„Ø§ partsDev)
   Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ: totalCost = maintActual + devActual + otherPurchases
   ============================================================ */

export async function getFinancialReport() {
  const MAINT_BASELINE = 20577;
  const DEV_BASELINE = 132551;
  const SALARY_MAINT = 2200;
  const SALARY_DEV = 2200;

  const workOrders = await listWorkOrders();
  const projects = await listProjects();
  const purchases = await listPurchases();

  const months = {};
  const normalizeRef = (v) => String(v ?? "").replace(/[-\s]/g, "").toUpperCase();

  function bucket(month) {
    const key = month || "Unknown";
    if (!months[key]) {
      months[key] = {
        month: key, employeeWOCount: 0, contractorWOCount: 0,
        contractorWO: 0, partsWO: 0, salaryMaint: SALARY_MAINT,
        maintActual: 0, maintSavings: 0, maintPct: 0,
        internalProjectCount: 0, contractorProjectCount: 0,
        contractorDev: 0, partsDev: 0, salaryDev: SALARY_DEV,
        devActual: 0, devSavings: 0, devPct: 0,
        otherPurchases: 0, totalCost: 0, totalSavings: 0,
        totalSavingsPct: 0, contractorBreakdown: {}
      };
    }
    return months[key];
  }

  // Contractor = reliable flag OR a real contractor name.
  // Employee WO cost is covered by the fixed salary and is not added again.
  const contractorWOsByMonth = {};
  for (const w of workOrders) {
    const month = pgMonthKey(w.reported_date) || w.month || "Unknown";
    const b = bucket(month);
    const contractorName = String(w.contractor_name ?? w.contractor ?? "").trim();
    const isContractor =
      Number(w.is_contractor ?? w.isContractor ?? 0) === 1 ||
      (contractorName !== "" &&
       !["company", "internal"].includes(contractorName.toLowerCase()));

    const woKey = normalizeRef(w.wo_no);
    if (isContractor) {
      const cost = Number(w.contractor_cost ?? 0) > 0
        ? Number(w.contractor_cost)
        : Number(w.final_cost ?? 0);
      b.contractorWOCount++;
      b.contractorWO += cost;
      if (!contractorWOsByMonth[month]) contractorWOsByMonth[month] = new Set();
      if (woKey) contractorWOsByMonth[month].add(woKey);

      const name = contractorName || "Contractor";
      if (!b.contractorBreakdown[name]) {
        b.contractorBreakdown[name] = { woCount: 0, woCost: 0, projectCount: 0, projectCost: 0 };
      }
      b.contractorBreakdown[name].woCount++;
      b.contractorBreakdown[name].woCost += cost;
    } else {
      b.employeeWOCount++;
    }
  }

  // Development project.spent is the development actual. PRJ purchases are
  // deliberately not added again because that would double-count project spend.
  for (const p of projects) {
    const startDateRaw = p.start_date ?? p.startDate ?? "";
    const month = String(startDateRaw).trim()
      ? (pgMonthKey(startDateRaw) || p.month || "Unknown")
      : (p.month || "Unknown");
    const b = bucket(month);
    const spent = Number(p.spent ?? p.total_cost ?? 0);
    const contractorName = String(p.contractor ?? p.contractor_name ?? "").trim();
    const isContractor =
      contractorName !== "" &&
      !["company", "internal"].includes(contractorName.toLowerCase());

    if (isContractor) {
      b.contractorProjectCount++;
      b.contractorDev += spent;
      const name = contractorName || "Contractor";
      if (!b.contractorBreakdown[name]) {
        b.contractorBreakdown[name] = { woCount: 0, woCost: 0, projectCount: 0, projectCost: 0 };
      }
      b.contractorBreakdown[name].projectCount++;
      b.contractorBreakdown[name].projectCost += spent;
    } else {
      b.internalProjectCount++;
    }
  }

  // Maintenance parts only count when the purchase is by Contractor, tied to
  // a WO, and that WO exists in the SAME month. Cross-month/unlinked purchases
  // are kept as other purchases so they remain visible without inflating WO cost.
  for (const p of purchases) {
    const month = pgMonthKey(p.purchase_date) || p.month || "Unknown";
    const amount = Number(p.total_cost ?? 0);
    if (!amount) continue;

    const purchasedBy = String(p.purchased_by ?? "").trim().toLowerCase();
    const type = String(p.type ?? "").trim().toLowerCase();
    const ref = normalizeRef(p.reference_no ?? p.reference_id);
    const isContractor = purchasedBy === "contractor";
    const isWO = ref.startsWith("WO") || type.includes("work") ||
      type.includes("order") || type.includes("maintenance");
    const linkedWO = ref && contractorWOsByMonth[month]?.has(ref);

    if (isContractor && isWO && linkedWO) {
      bucket(month).partsWO += amount;
    } else {
      bucket(month).otherPurchases += amount;
    }
  }

  const totalBaseline = MAINT_BASELINE + DEV_BASELINE;
  for (const b of Object.values(months)) {
    b.maintActual = b.contractorWO + b.partsWO + b.salaryMaint;
    b.devActual = b.contractorDev + b.salaryDev;
    b.maintSavings = MAINT_BASELINE - b.maintActual;
    b.devSavings = DEV_BASELINE - b.devActual;
    b.totalCost = b.maintActual + b.devActual + b.otherPurchases;
    b.totalSavings = totalBaseline - b.totalCost;
    b.maintPct = MAINT_BASELINE ? (b.maintSavings / MAINT_BASELINE) * 100 : 0;
    b.devPct = DEV_BASELINE ? (b.devSavings / DEV_BASELINE) * 100 : 0;
    b.totalSavingsPct = totalBaseline ? (b.totalSavings / totalBaseline) * 100 : 0;
  }

  const rows = Object.values(months)
    .filter(r => /^\d{4}-\d{2}$/.test(String(r.month)))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));

  const hasActivity = (r) =>
    Number(r.contractorWO || 0) +
    Number(r.partsWO || 0) +
    Number(r.contractorDev || 0) +
    Number(r.otherPurchases || 0) > 0;

  const activeData = rows.filter(hasActivity);
  for (const r of rows) r.active = hasActivity(r);

  const sum = (field) => activeData.reduce((s, r) => s + Number(r[field] || 0), 0);
  const monthCount = activeData.length;
  const maintenanceTotalBaseline = MAINT_BASELINE * monthCount;
  const developmentTotalBaseline = DEV_BASELINE * monthCount;
  const reportBaseline = maintenanceTotalBaseline + developmentTotalBaseline;

  const mergedBreakdown = {};
  for (const r of activeData) {
    for (const [name, info] of Object.entries(r.contractorBreakdown || {})) {
      if (!mergedBreakdown[name]) {
        mergedBreakdown[name] = { woCount: 0, woCost: 0, projectCount: 0, projectCost: 0 };
      }
      mergedBreakdown[name].woCount += Number(info.woCount || 0);
      mergedBreakdown[name].woCost += Number(info.woCost || 0);
      mergedBreakdown[name].projectCount += Number(info.projectCount || 0);
      mergedBreakdown[name].projectCost += Number(info.projectCost || 0);
    }
  }

  const maintSavings = sum("maintSavings");
  const devSavings = sum("devSavings");
  const totalSavings = sum("totalSavings");

  return {
    rows,
    grand: {
      monthCount,
      baseline: reportBaseline,
      maintenanceBaseline: MAINT_BASELINE,
      developmentBaseline: DEV_BASELINE,
      maintenanceTotalBaseline,
      developmentTotalBaseline,
      contractorWO: sum("contractorWO"),
      partsWO: sum("partsWO"),
      salaryMaint: sum("salaryMaint"),
      maintActual: sum("maintActual"),
      contractorDev: sum("contractorDev"),
      partsDev: 0,
      salaryDev: sum("salaryDev"),
      devActual: sum("devActual"),
      otherPurchases: sum("otherPurchases"),
      totalCost: sum("totalCost"),
      maintSavings,
      devSavings,
      totalSavings,
      maintTotalSavingsPct: maintenanceTotalBaseline ? (maintSavings / maintenanceTotalBaseline) * 100 : 0,
      devTotalSavingsPct: developmentTotalBaseline ? (devSavings / developmentTotalBaseline) * 100 : 0,
      totalSavingsPct: reportBaseline ? (totalSavings / reportBaseline) * 100 : 0,
      employeeWOCount: sum("employeeWOCount"),
      contractorWOCount: sum("contractorWOCount"),
      totalWOCount: sum("employeeWOCount") + sum("contractorWOCount"),
      internalProjectCount: sum("internalProjectCount"),
      contractorProjectCount: sum("contractorProjectCount"),
      totalProjectCount: sum("internalProjectCount") + sum("contractorProjectCount"),
      contractorBreakdown: mergedBreakdown
    }
  };
}


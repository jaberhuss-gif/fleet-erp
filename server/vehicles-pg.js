import { query, transaction } from "./postgres.js";

export async function listVehiclesPG() {
  const result = await query(`
    SELECT
      id,
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
      meter_updated_at,
      created_at,
      updated_at
    FROM vehicles
    ORDER BY id
  `);

  return result.rows;
}

export async function getVehicleByIdPG(id) {
  const result = await query(`
    SELECT
      id,
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
      meter_updated_at,
      created_at,
      updated_at
    FROM vehicles
    WHERE id = $1
  `, [id]);

  return result.rows[0] || null;
}

export async function createVehiclePG(data) {
  const result = await query(`
    INSERT INTO vehicles (
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
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
    )
    RETURNING *
  `, [
    data.plateNumber ?? data.plate_number ?? "",
    data.plateCode ?? data.plate_code ?? "",
    data.make ?? "Toyota",
    data.model ?? "Hilux",
    data.year ?? 2022,
    data.location ?? "",
    data.driver ?? "",
    data.phone ?? "",
    data.currentKm ?? data.current_km ?? 0,
    data.lastOilKm ?? data.last_oil_km ?? 0,
    data.oilChangeInterval ?? data.oil_change_interval ?? 5000,
    data.lastOilChangeDate ?? data.last_oil_change_date ?? null,
    data.status ?? "Safe",
    data.meterUpdatedAt ?? data.meter_updated_at ?? null
  ]);

  return result.rows[0];
}

export async function updateVehiclePG(id, data) {
  // Last Oil Change is ERP-controlled through the dedicated
  // /vehicles/:id/last-oil-change endpoint (or the official oil-change flow).
  // Generic vehicle updates must never overwrite it.
  const result = await query(`
    UPDATE vehicles
    SET
      plate_number = COALESCE($2, plate_number),
      plate_code = COALESCE($3, plate_code),
      make = COALESCE($4, make),
      model = COALESCE($5, model),
      year = COALESCE($6, year),
      location = COALESCE($7, location),
      driver = COALESCE($8, driver),
      phone = COALESCE($9, phone),
      current_km = COALESCE($10, current_km),
      oil_change_interval = COALESCE($11, oil_change_interval),
      status = COALESCE($12, status),
      meter_updated_at = COALESCE($13, meter_updated_at),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `, [
    id,
    data.plateNumber ?? data.plate_number ?? null,
    data.plateCode ?? data.plate_code ?? null,
    data.make ?? null,
    data.model ?? null,
    data.year ?? null,
    data.location ?? null,
    data.driver ?? null,
    data.phone ?? null,
    data.currentKm ?? data.current_km ?? null,
    data.oilChangeInterval ?? data.oil_change_interval ?? null,
    data.status ?? null,
    data.meterUpdatedAt ?? data.meter_updated_at ?? null
  ]);

  return result.rows[0] || null;
}

export async function updateLastOilChangePG(id, data = {}) {
  const oilKm = Number(data.lastOilKm ?? data.last_oil_km);
  if (!Number.isFinite(oilKm) || oilKm < 0) {
    throw new Error("Last Oil Change KM must be a valid non-negative number");
  }

  const oilDateRaw = data.lastOilChangeDate ?? data.last_oil_change_date ?? null;
  const oilDate = oilDateRaw ? String(oilDateRaw).slice(0, 10) : null;
  if (oilDate && !/^\d{4}-\d{2}-\d{2}$/.test(oilDate)) {
    throw new Error("Last Oil Change Date must be YYYY-MM-DD");
  }

  return transaction(async (client) => {
    const vehicle = await client.query(
      "SELECT id FROM vehicles WHERE id = $1 FOR UPDATE",
      [id]
    );
    if (!vehicle.rows[0]) throw new Error("Vehicle not found");

    const updated = await client.query(
      `UPDATE vehicles
       SET last_oil_km = $1,
           last_oil_change_date = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [oilKm, oilDate, id]
    );

    const history = await client.query(
      `SELECT id
       FROM oil_changes
       WHERE vehicle_id = $1
         AND COALESCE(notes, '') NOT ILIKE '%Google Sheet%'
       ORDER BY oil_change_date DESC NULLS LAST, id DESC
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    const note = "ERP Last Oil Change correction";
    if (history.rows[0]) {
      await client.query(
        `UPDATE oil_changes
         SET oil_change_km = $1, oil_change_date = $2,
             changed_by = 'ERP', notes = $3
         WHERE id = $4`,
        [oilKm, oilDate, note, history.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO oil_changes
           (vehicle_id, oil_change_km, oil_change_date, changed_by, notes)
         VALUES ($1, $2, $3, 'ERP', $4)`,
        [id, oilKm, oilDate, note]
      );
    }

    return updated.rows[0];
  });
}

export async function deleteVehiclePG(id) {
  const result = await query(
    "DELETE FROM vehicles WHERE id = $1 RETURNING id",
    [id]
  );

  return result.rowCount > 0;
}

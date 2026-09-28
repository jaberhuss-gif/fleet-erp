import { query } from "./postgres.js";

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
      last_oil_km = COALESCE($11, last_oil_km),
      oil_change_interval = COALESCE($12, oil_change_interval),
      last_oil_change_date = CASE WHEN $13::date IS NULL AND $13 IS NOT NULL THEN last_oil_change_date ELSE COALESCE($13, last_oil_change_date) END,
      status = COALESCE($14, status),
      meter_updated_at = COALESCE($15, meter_updated_at),
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
    data.lastOilKm ?? data.last_oil_km ?? null,
    data.oilChangeInterval ?? data.oil_change_interval ?? null,
    data.lastOilChangeDate ?? data.last_oil_change_date ?? null,
    data.status ?? null,
    data.meterUpdatedAt ?? data.meter_updated_at ?? null
  ]);

  return result.rows[0] || null;
}

export async function deleteVehiclePG(id) {
  const result = await query(
    "DELETE FROM vehicles WHERE id = $1 RETURNING id",
    [id]
  );

  return result.rowCount > 0;
}

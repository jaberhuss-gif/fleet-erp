import { query, transaction } from "./postgres.js";

export { query, transaction };

export function isPostgresDatabase() {
  return true;
}
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
    ORDER BY plate_number, plate_code
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

import { query } from "./postgres.js";

/**
 * Non-destructive runtime migrations for the PostgreSQL database.
 * Existing vehicle/building data is preserved; only missing columns/tables are added.
 */
export async function ensureSchema() {
  if (!process.env.DATABASE_URL) return;

  await query(`
    ALTER TABLE vehicles
      ADD COLUMN IF NOT EXISTS plate TEXT,
      ADD COLUMN IF NOT EXISTS plate_number TEXT,
      ADD COLUMN IF NOT EXISTS plate_code TEXT,
      ADD COLUMN IF NOT EXISTS make TEXT,
      ADD COLUMN IF NOT EXISTS model TEXT,
      ADD COLUMN IF NOT EXISTS year INT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Safe',
      ADD COLUMN IF NOT EXISTS location TEXT,
      ADD COLUMN IF NOT EXISTS driver TEXT,
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS driver_name TEXT,
      ADD COLUMN IF NOT EXISTS driver_phone TEXT,
      ADD COLUMN IF NOT EXISTS current_km INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_oil_km INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS oil_change_interval INT DEFAULT 5000,
      ADD COLUMN IF NOT EXISTS last_oil_change_date TEXT,
      ADD COLUMN IF NOT EXISTS meter_updated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  // Preserve existing legacy driver data while making the new API columns usable.
  await query(`
    UPDATE vehicles
    SET driver = COALESCE(NULLIF(driver, ''), driver_name),
        phone = COALESCE(NULLIF(phone, ''), driver_phone)
    WHERE (driver IS NULL OR driver = '')
       OR (phone IS NULL OR phone = '')
  `);

  // Keep legacy plate field synchronized where it is still populated.
  await query(`
    UPDATE vehicles
    SET plate_number = COALESCE(NULLIF(plate_number, ''), split_part(COALESCE(plate, ''), ' ', 1)),
        plate_code = COALESCE(NULLIF(plate_code, ''), NULLIF(trim(substr(COALESCE(plate, ''), length(split_part(COALESCE(plate, ''), ' ', 1)) + 1)), ''))
    WHERE (plate_number IS NULL OR plate_number = '')
      AND plate IS NOT NULL
      AND trim(plate) <> ''
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS km_daily_reminders (
      id BIGSERIAL PRIMARY KEY,
      vehicle_id BIGINT NOT NULL,
      reminder_date DATE NOT NULL,
      phone TEXT,
      channel TEXT NOT NULL DEFAULT 'sms',
      status TEXT NOT NULL DEFAULT 'sent',
      provider_response TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(vehicle_id, reminder_date, channel)
    )
  `);
}

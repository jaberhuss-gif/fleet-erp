-- Fleet ERP V2 vehicle completeness migration
SET search_path TO fleet_erp_v2, public;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS legacy_vehicle_id BIGINT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS legacy_location TEXT NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS legacy_driver_name TEXT NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS legacy_driver_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_oil_change_date DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS meter_updated_at TIMESTAMPTZ;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS inspection_last_date DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS inspection_due_date DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS registration_expiry DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_expiry DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS notes TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_v2_vehicles_legacy_id ON vehicles(legacy_vehicle_id) WHERE legacy_vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_v2_vehicles_site ON vehicles(site_id);
CREATE INDEX IF NOT EXISTS idx_v2_vehicles_driver ON vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_v2_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_v2_vehicles_inspection_due ON vehicles(inspection_due_date);
CREATE INDEX IF NOT EXISTS idx_v2_vehicles_oil_due ON vehicles(current_km,last_oil_km);

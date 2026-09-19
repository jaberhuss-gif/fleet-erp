CREATE TABLE IF NOT EXISTS vehicle_maintenance_schedules (
 id BIGSERIAL PRIMARY KEY, vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
 maintenance_type TEXT NOT NULL, interval_km INT, interval_days INT, last_service_km NUMERIC(12,1),
 last_service_date DATE, next_due_km NUMERIC(12,1), next_due_date DATE, status TEXT NOT NULL DEFAULT 'Active',
 notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vehicle_documents (
 id BIGSERIAL PRIMARY KEY, vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
 document_type TEXT NOT NULL, document_number TEXT, issue_date DATE, expiry_date DATE, file_url TEXT, notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vehicle_tires (
 id BIGSERIAL PRIMARY KEY, vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
 position TEXT NOT NULL, brand TEXT, size TEXT, serial_number TEXT, installed_km NUMERIC(12,1),
 status TEXT NOT NULL DEFAULT 'Active', condition TEXT, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

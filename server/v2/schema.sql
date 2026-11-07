-- Fleet ERP V2 schema
CREATE SCHEMA IF NOT EXISTS fleet_erp_v2;
SET search_path TO fleet_erp_v2, public;

CREATE TABLE IF NOT EXISTS sites (
 id BIGSERIAL PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL UNIQUE, region TEXT,
 campus_manager TEXT, phone TEXT, status TEXT NOT NULL DEFAULT 'Active',
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
 id BIGSERIAL PRIMARY KEY, legacy_user_id BIGINT UNIQUE,
 username TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('Owner','GM','Accountant','CampusManager','Driver','SupportManager','SSM','FleetSupervisor','FleetViewer')),
 site_id BIGINT REFERENCES sites(id), is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
 id SMALLSERIAL PRIMARY KEY,
 name TEXT NOT NULL UNIQUE CHECK(name IN ('Owner','GM','Accountant','CampusManager','Driver','SupportManager','SSM','FleetSupervisor','FleetViewer')),
 description TEXT,
 is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS permissions (
 id SMALLSERIAL PRIMARY KEY,
 module TEXT NOT NULL,
 action TEXT NOT NULL,
 UNIQUE(module, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
 role_id SMALLINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
 permission_id SMALLINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
 allowed BOOLEAN NOT NULL DEFAULT TRUE,
 PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_permissions (
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 permission_id SMALLINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
 allowed BOOLEAN NOT NULL,
 PRIMARY KEY(user_id, permission_id)
);
CREATE TABLE IF NOT EXISTS drivers (
 id BIGSERIAL PRIMARY KEY, employee_no TEXT UNIQUE, full_name TEXT NOT NULL, phone TEXT,
 status TEXT NOT NULL DEFAULT 'Active', site_id BIGINT REFERENCES sites(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vehicles (
 id BIGSERIAL PRIMARY KEY, legacy_vehicle_id BIGINT UNIQUE,
 plate_number TEXT NOT NULL, plate_code TEXT NOT NULL DEFAULT '',
 make TEXT, model TEXT, year INT, site_id BIGINT REFERENCES sites(id), driver_id BIGINT REFERENCES drivers(id),
 legacy_location TEXT NOT NULL DEFAULT '', legacy_driver_name TEXT NOT NULL DEFAULT '', legacy_driver_phone TEXT NOT NULL DEFAULT '',
 current_km NUMERIC(12,1) NOT NULL DEFAULT 0, last_oil_km NUMERIC(12,1) NOT NULL DEFAULT 0,
 oil_interval_km INT NOT NULL DEFAULT 5000, last_oil_change_date DATE,
 meter_updated_at TIMESTAMPTZ, inspection_last_date DATE, inspection_due_date DATE,
 registration_expiry DATE, insurance_expiry DATE,
 status TEXT NOT NULL DEFAULT 'Active', notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(plate_number, plate_code)
);
CREATE TABLE IF NOT EXISTS km_readings (
 id BIGSERIAL PRIMARY KEY, vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
 reading_km NUMERIC(12,1) NOT NULL CHECK(reading_km >= 0), reading_date DATE NOT NULL,
 entered_by BIGINT REFERENCES users(id), notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(vehicle_id, reading_date)
);
CREATE TABLE IF NOT EXISTS daily_km_compliance (
 id BIGSERIAL PRIMARY KEY, vehicle_id BIGINT NOT NULL REFERENCES vehicles(id), compliance_date DATE NOT NULL,
 reading_id BIGINT REFERENCES km_readings(id),
 status TEXT NOT NULL CHECK(status IN ('Submitted','Missing','Exempt')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(vehicle_id, compliance_date)
);
CREATE TABLE IF NOT EXISTS daily_vehicle_submission (
 id BIGSERIAL PRIMARY KEY, vehicle_id BIGINT NOT NULL REFERENCES vehicles(id), submission_date DATE NOT NULL,
 source TEXT NOT NULL DEFAULT 'Google Sheet', sheet_plate TEXT, sheet_driver TEXT, sheet_phone TEXT,
 submitted_at TIMESTAMPTZ, status TEXT NOT NULL CHECK(status IN ('Submitted','Missing')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(vehicle_id, submission_date)
);
CREATE TABLE IF NOT EXISTS maintenance_work_orders (
 id BIGSERIAL PRIMARY KEY, wo_no TEXT NOT NULL UNIQUE, vehicle_id BIGINT REFERENCES vehicles(id), site_id BIGINT REFERENCES sites(id),
 category TEXT, priority TEXT, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Open',
 reported_date DATE NOT NULL, completion_date DATE, contractor_name TEXT,
 contractor_cost NUMERIC(14,2) NOT NULL DEFAULT 0, internal_labor_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
 closing_notes TEXT, created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS maintenance_parts (
 id BIGSERIAL PRIMARY KEY, work_order_id BIGINT NOT NULL REFERENCES maintenance_work_orders(id) ON DELETE CASCADE,
 part_name TEXT NOT NULL, quantity NUMERIC(14,3) NOT NULL DEFAULT 1, unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
 total_price NUMERIC(14,2) GENERATED ALWAYS AS(quantity * unit_price) STORED
);
CREATE TABLE IF NOT EXISTS maintenance_purchases (
 id BIGSERIAL PRIMARY KEY, legacy_purchase_ref TEXT UNIQUE, work_order_id BIGINT REFERENCES maintenance_work_orders(id) ON DELETE SET NULL,
 item_name TEXT NOT NULL, quantity NUMERIC(14,3) NOT NULL DEFAULT 1, unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
 total_cost NUMERIC(14,2) GENERATED ALWAYS AS(quantity * unit_cost) STORED,
 supplier_type TEXT NOT NULL DEFAULT 'Company', supplier_name TEXT, purchase_date DATE
);
CREATE TABLE IF NOT EXISTS projects (
 id BIGSERIAL PRIMARY KEY, project_no TEXT NOT NULL UNIQUE, site_id BIGINT REFERENCES sites(id),
 description TEXT NOT NULL, start_date DATE, end_date DATE, status TEXT NOT NULL DEFAULT 'Planned',
 contractor TEXT, contractor_cost NUMERIC(14,2) NOT NULL DEFAULT 0, internal_labor_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS project_tasks (
 id BIGSERIAL PRIMARY KEY, project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 task_name TEXT NOT NULL, cost NUMERIC(14,2) NOT NULL DEFAULT 0, contractor TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS project_parts (
 id BIGSERIAL PRIMARY KEY, project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 part_name TEXT NOT NULL, quantity NUMERIC(14,3) NOT NULL DEFAULT 1, unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
 total_price NUMERIC(14,2) GENERATED ALWAYS AS(quantity * unit_price) STORED
);
ALTER TABLE maintenance_purchases ADD COLUMN IF NOT EXISTS legacy_purchase_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_purchases_legacy_purchase_ref_uq ON maintenance_purchases(legacy_purchase_ref) WHERE legacy_purchase_ref IS NOT NULL;
ALTER TABLE project_purchases ADD COLUMN IF NOT EXISTS legacy_purchase_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS project_purchases_legacy_purchase_ref_uq ON project_purchases(legacy_purchase_ref) WHERE legacy_purchase_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_purchases (
 id BIGSERIAL PRIMARY KEY, legacy_purchase_ref TEXT UNIQUE, project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
 item_name TEXT NOT NULL, quantity NUMERIC(14,3) NOT NULL DEFAULT 1, unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
 total_cost NUMERIC(14,2) GENERATED ALWAYS AS(quantity * unit_cost) STORED,
 supplier_type TEXT NOT NULL DEFAULT 'Contractor', supplier_name TEXT, purchase_date DATE
);
CREATE TABLE IF NOT EXISTS warehouse_locations (
 id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS warehouse_items (
 id BIGSERIAL PRIMARY KEY, item_code TEXT UNIQUE, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'pcs',
 min_stock NUMERIC(14,3) NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS warehouse_stock (
 id BIGSERIAL PRIMARY KEY, location_id BIGINT NOT NULL REFERENCES warehouse_locations(id),
 item_id BIGINT NOT NULL REFERENCES warehouse_items(id), quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
 UNIQUE(location_id,item_id)
);
CREATE TABLE IF NOT EXISTS warehouse_transactions (
 id BIGSERIAL PRIMARY KEY, item_id BIGINT NOT NULL REFERENCES warehouse_items(id),
 location_id BIGINT NOT NULL REFERENCES warehouse_locations(id), transaction_type TEXT NOT NULL,
 quantity NUMERIC(14,3) NOT NULL, reference_type TEXT, reference_id BIGINT, notes TEXT,
 created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS purchase_requests (
 id BIGSERIAL PRIMARY KEY, request_no TEXT NOT NULL UNIQUE, requested_by BIGINT REFERENCES users(id),
 site_id BIGINT REFERENCES sites(id), department TEXT, status TEXT NOT NULL DEFAULT 'Pending',
 notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, approved_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS tickets (
 id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, category TEXT, priority TEXT NOT NULL DEFAULT 'Medium',
 status TEXT NOT NULL DEFAULT 'Open', vehicle_id BIGINT REFERENCES vehicles(id), site_id BIGINT REFERENCES sites(id),
 reported_by BIGINT REFERENCES users(id), assigned_to BIGINT REFERENCES users(id), description TEXT,
 opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at TIMESTAMPTZ, resolution_notes TEXT
);
CREATE TABLE IF NOT EXISTS baseline_monthly (
 id BIGSERIAL PRIMARY KEY, month_start DATE NOT NULL UNIQUE,
 maintenance_baseline NUMERIC(14,2) NOT NULL DEFAULT 0, development_baseline NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS financial_settings (
 id SMALLINT PRIMARY KEY CHECK(id=1), maintenance_salary_monthly NUMERIC(14,2) NOT NULL DEFAULT 2200,
 development_salary_monthly NUMERIC(14,2) NOT NULL DEFAULT 2200, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO financial_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS vehicle_alerts (
 id BIGSERIAL PRIMARY KEY, vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
 alert_type TEXT NOT NULL, severity TEXT NOT NULL CHECK (severity IN ('Critical','High','Medium','Low')),
 title TEXT NOT NULL, message TEXT NOT NULL, alert_date DATE NOT NULL DEFAULT CURRENT_DATE,
 responsible_role TEXT, status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Acknowledged','Closed')),
 due_date DATE, closed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(vehicle_id,alert_type,alert_date)
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id), action TEXT NOT NULL,
 entity_type TEXT, entity_id TEXT, details TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
\nINSERT INTO roles(name,description) VALUES
('Owner','Full system administration and access'),
('GM','Read-only management visibility'),
('Accountant','Financial and purchase visibility'),
('CampusManager','Operations and site work'),
('Driver','Fleet driver workflow'),
('SupportManager','Support and service visibility/workflow'),
('SSM','Safety/service management visibility'),
('FleetSupervisor','Fleet operations and supervision'),
('FleetViewer','Fleet ticket/read-only access')
ON CONFLICT(name) DO NOTHING;

INSERT INTO permissions(module,action) VALUES
('gm','view'),('support','view'),('support','work'),
('building','view'),('building','work'),
('projects','view'),('projects','work'),
('warehouse','view'),('warehouse','work'),
('purchase_requests','view'),('purchase_requests','work'),
('fleet','view'),('fleet','work'),
('fleet_tickets','view'),('tickets','view'),('tickets','work'),
('mytickets','view'),('troubleshooter','view'),
('reports','view'),('advanced_reports','view'),
('drivers','view'),('drivers','work'),('users','view'),('users','work'),
('audit','view'),('backup','view'),('backup','work')
ON CONFLICT(module,action) DO NOTHING;

-- Default role matrix mirrors the current ERP RBAC behavior.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='Owner'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON
 (r.name='GM' AND ((p.module IN ('gm','support','building','projects','warehouse','purchase_requests','fleet','tickets','troubleshooter','reports','advanced_reports') AND p.action='view')))
 OR (r.name='Accountant' AND ((p.module IN ('reports','advanced_reports','tickets','purchase_requests','building','projects') AND p.action='view')))
 OR (r.name='CampusManager' AND ((p.module IN ('support','building','projects','warehouse','purchase_requests') AND p.action IN ('view','work')) OR (p.module='troubleshooter' AND p.action='view')))
 OR (r.name='Driver' AND ((p.module='fleet' AND p.action IN ('view','work')) OR (p.module='mytickets' AND p.action='view') OR (p.module='troubleshooter' AND p.action='view')))
 OR (r.name='SupportManager' AND ((p.module IN ('support','building','tickets','troubleshooter') AND p.action='view')))
 OR (r.name='SSM' AND ((p.module IN ('building','tickets','fleet_tickets','warehouse') AND p.action='view')))
 OR (r.name='FleetSupervisor' AND ((p.module IN ('gm','building','troubleshooter') AND p.action='view') OR (p.module IN ('fleet','tickets') AND p.action IN ('view','work'))))
 OR (r.name='FleetViewer' AND p.module='fleet_tickets' AND p.action='view')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_v2_wo_reported ON maintenance_work_orders(reported_date);
CREATE INDEX IF NOT EXISTS idx_v2_project_start ON projects(start_date);
CREATE INDEX IF NOT EXISTS idx_v2_submission_date ON daily_vehicle_submission(submission_date);
CREATE INDEX IF NOT EXISTS idx_v2_km_date ON daily_km_compliance(compliance_date);

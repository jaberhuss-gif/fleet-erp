-- V2 RBAC/auth hardening migration
-- Safe for the current empty V2 database. Does not touch Legacy PostgreSQL.
SET search_path TO fleet_erp_v2, public;

ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_user_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_v2_users_legacy_user_id ON users(legacy_user_id);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('Owner','GM','Accountant','CampusManager','Driver','SupportManager','SSM','FleetSupervisor','FleetViewer'));

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

INSERT INTO roles(name,description) VALUES
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
('building','view'),('building','work'),('projects','view'),('projects','work'),
('warehouse','view'),('warehouse','work'),
('purchase_requests','view'),('purchase_requests','work'),
('fleet','view'),('fleet','work'),('fleet_tickets','view'),
('tickets','view'),('tickets','work'),('mytickets','view'),
('troubleshooter','view'),('reports','view'),('advanced_reports','view'),
('drivers','view'),('drivers','work'),('users','view'),('users','work'),
('audit','view'),('backup','view'),('backup','work')
ON CONFLICT(module,action) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='Owner'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON
 (r.name='GM' AND p.action='view' AND p.module IN ('gm','support','building','projects','warehouse','purchase_requests','fleet','tickets','troubleshooter','reports','advanced_reports'))
 OR (r.name='Accountant' AND p.action='view' AND p.module IN ('reports','advanced_reports','tickets','purchase_requests','building','projects'))
 OR (r.name='CampusManager' AND ((p.module IN ('support','building','projects','warehouse','purchase_requests') AND p.action IN ('view','work')) OR (p.module='troubleshooter' AND p.action='view')))
 OR (r.name='Driver' AND ((p.module='fleet' AND p.action IN ('view','work')) OR (p.module='mytickets' AND p.action='view') OR (p.module='troubleshooter' AND p.action='view')))
 OR (r.name='SupportManager' AND p.action='view' AND p.module IN ('support','building','tickets','troubleshooter'))
 OR (r.name='SSM' AND p.action='view' AND p.module IN ('building','tickets','fleet_tickets','warehouse'))
 OR (r.name='FleetSupervisor' AND ((p.module IN ('gm','building','troubleshooter') AND p.action='view') OR (p.module IN ('fleet','tickets') AND p.action IN ('view','work'))))
 OR (r.name='FleetViewer' AND p.module='fleet_tickets' AND p.action='view')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_v2_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_v2_user_permissions_permission ON user_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_v2_users_site ON users(site_id);

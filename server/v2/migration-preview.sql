-- READ-ONLY migration preview queries.
-- This file intentionally contains SELECT statements only.
-- It does not connect to or modify the legacy database.
SET search_path TO fleet_erp_v2, public;

-- Destination readiness
SELECT current_database() AS database_name, current_schema() AS schema_name;
SELECT table_name
FROM information_schema.tables
WHERE table_schema='fleet_erp_v2'
ORDER BY table_name;

-- Destination currently empty check
SELECT 'sites' table_name, COUNT(*) row_count FROM fleet_erp_v2.sites
UNION ALL SELECT 'vehicles',COUNT(*) FROM fleet_erp_v2.vehicles
UNION ALL SELECT 'drivers',COUNT(*) FROM fleet_erp_v2.drivers
UNION ALL SELECT 'maintenance_work_orders',COUNT(*) FROM fleet_erp_v2.maintenance_work_orders
UNION ALL SELECT 'projects',COUNT(*) FROM fleet_erp_v2.projects
UNION ALL SELECT 'warehouse_items',COUNT(*) FROM fleet_erp_v2.warehouse_items
UNION ALL SELECT 'tickets',COUNT(*) FROM fleet_erp_v2.tickets;

-- Expected FMMS source mapping is documented in FMMS-MAPPING.md.
-- Source workbook rows cannot be previewed from PostgreSQL until an explicit
-- read-only workbook extraction/staging step is performed.

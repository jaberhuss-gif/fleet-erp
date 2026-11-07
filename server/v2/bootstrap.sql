-- Run ONLY against the dedicated V2 PostgreSQL database.
-- This creates the V2 schema. It does not read, update or delete the legacy DB.
\i server/v2/schema.sql

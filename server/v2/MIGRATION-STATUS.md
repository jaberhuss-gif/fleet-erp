# ERP V2 Migration Status

- [x] V2 schema designed
- [x] V2 DB connection isolated behind V2_DATABASE_URL
- [x] V2 API feature flag isolated behind ERP_V2_ENABLED
- [x] FMMS mapping documented
- [x] Read-only migration preview queries prepared
- [ ] Create dedicated PostgreSQL database
- [ ] Set V2_DATABASE_URL on hosting
- [ ] Run schema bootstrap on V2 database
- [ ] Extract FMMS workbook to a read-only staging representation
- [ ] Generate KEEP / REPAIR / LEGACY / DO_NOT_MIGRATE report
- [ ] Review migration preview
- [ ] Execute first migration
- [ ] Reconcile counts and financial totals
- [ ] Switch UI/workflows to V2

No migration INSERT/UPDATE/DELETE has been performed by this V2 work.

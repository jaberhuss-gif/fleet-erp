# Fleet ERP — Google Apps Script rebuild

This branch is an isolated rebuild workspace. It does not change the existing production branch, Render service, or either Neon database.

## Objective

Rebuild the Fleet ERP workflows as a Google Apps Script Web App. The application must be usable with an empty database first; real data from the Neon Backup will be imported only after the source becomes accessible and the import is reconciled.

## Core modules to port

- Authentication and role-based access (Owner/Admin/GM/Fleet Supervisor/Driver and other existing roles as confirmed from the source app).
- Fleet and vehicle master records.
- Daily odometer/KM submissions and full reading history.
- Oil-change history, configurable intervals, and due/overdue alerts.
- Vehicle details and maintenance history.
- Vehicle tickets and maintenance requests.
- Periodic and annual inspections/maintenance.
- Tire requests and tire survey workflows.
- Driver handovers.
- Notifications, audit log, reports, and GM dashboard.
- Existing workflows and labels should be reconciled against the current Fleet ERP source before implementation.

## Data architecture

- Apps Script Web App for UI and server-side logic.
- Google Sheets as the initial relational-style data store, with a repository/data-access layer so storage can be replaced without rewriting business logic if concurrency tests show Sheets is insufficient.
- Google Drive for uploaded images and documents; store file IDs and metadata in the database.
- Use LockService and batch reads/writes for concurrent users.
- Do not rely on client-side role checks; enforce permissions in server-side functions.
- Avoid storing passwords in plain text. Use a supported secure authentication design and do not treat a hidden UI as authorization.

## Migration — intentionally deferred

No production or Backup data is imported at this stage. When the Neon Backup becomes readable, export the source tables and files, map them, produce a reconciliation report, then run an idempotent import. Preserve IDs or source keys where practical, timestamps, KM history, oil-change history, maintenance history, ticket relationships, and attachment references. Never overwrite the current operational database.

## Acceptance checks

- KM reading history is retained and newest reading is selected correctly.
- Oil-change alerts use the correct latest confirmed oil-change record and current KM.
- Duplicate submissions/imports are prevented.
- Role permissions are enforced server-side.
- Concurrent updates are tested with realistic multi-user load (target about 50 users).
- Export/backup and restore procedures are tested before production use.

## Safety

This is a development branch only. Do not connect it to production Neon, do not deploy it as the live Fleet ERP, and do not import guessed or incomplete data.

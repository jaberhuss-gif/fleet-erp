# Fleet ERP — Google Apps Script rebuild

This is an isolated rebuild branch. The existing Render deployment, production branch, and both Neon databases are not changed by this work.

## Current implementation

- `Code.gs`: Apps Script web entry point, spreadsheet schema setup, session handling, Owner/vehicle login, vehicle access-code verification, KM submission, ticket creation, oil-change recording, vehicle creation/update, and audit logging.
- `Index.html`, `Styles.html`, `Client.html`: single-link web interface using the current Fleet ERP visual language (navy/blue header, sidebar navigation, cards, tables, status badges, company JV branding).
- `appsscript.json`: V8 web app manifest; initial scope is limited to the bound spreadsheet.

## Access model

- One shared web-app URL.
- One Owner/Admin login for fleet administration.
- Vehicle-based driver access: one access code per vehicle, not a separate system account for every driver. The driver enters their name when opening the vehicle portal so actions are attributed to the person using the vehicle.
- The server checks the session and vehicle assignment before accepting KM or ticket submissions. GM/view-only roles cannot submit operational records.
- Do not use one shared Owner credential for all drivers.

## Initial data store

The first version uses a bound Google Spreadsheet with these tabs:
`Vehicles`, `KM_Records`, `Oil_Changes`, `Tickets`, `Maintenance`, `Tire_Requests`, `Inspections`, `Users`, `Audit_Log`, and `Settings`.

Uploaded files will be added through a Drive-backed file service in a later stage. The current shell does not yet implement all legacy modules.

## Setup (when ready to connect a Google account)

1. Create a new, empty Google Spreadsheet dedicated to the rebuild.
2. Open Extensions → Apps Script from that spreadsheet and add the files from this folder (`Code.gs`, `Index.html`, `Styles.html`, `Client.html`); copy the manifest into the Apps Script project's `appsscript.json` after enabling display of the manifest file.
3. Run `setupFleetERP()` once and authorize the spreadsheet scope.
4. Run `initializeOwnerAccount(username, password, fullName)` once from the Apps Script editor. Use a unique password of at least 10 characters; do not put it in this repository or a Sheet.
5. Add vehicles from the Vehicle Master screen and set a separate vehicle access code for each one.
6. Deploy as a Web App, executing as the deploying account. Choose the access audience deliberately; anyone with the link can reach the login screen, but cannot access data without valid credentials.

Do not deploy or connect this to the existing production spreadsheet or production database.

## Work still required before production

- Complete parity with the current React Fleet ERP modules and workflows.
- Edit vehicle/access-code flow and vehicle-specific driver action screens.
- Maintenance lifecycle, tires, annual/six-month inspections, handovers, notifications, exports, GM dashboard and reporting.
- File uploads to Drive, backup/restore, and stronger session lifecycle controls.
- Full permission matrix and security review.
- Concurrency/quotas testing with realistic usage before deciding whether Sheets is adequate.
- Functional tests in a separate test spreadsheet and deployment.

## Migration — intentionally deferred

No real fleet records are included or imported. Once the Neon Backup becomes accessible, export its real tables and file references, map them, reconcile counts and relationships, and import once using a repeatable/idempotent process. Preserve source IDs, dates, KM history, oil changes, maintenance, tickets, and attachment references. Do not substitute demo records for the backup.

## Safety

Development branch only. No changes to `main`, Render production, production Neon, or Neon Backup were made by this implementation.

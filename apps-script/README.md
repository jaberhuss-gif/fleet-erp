# Fleet ERP — Google Apps Script rebuild

This is an isolated rebuild branch. The existing Render deployment, production branch, and both Neon databases are not changed by this work.

## Current implementation

- `Code.gs`: Apps Script web entry point, spreadsheet schema setup, shared Owner/Driver login, assigned-vehicle validation, daily KM submission, maintenance issue reporting, oil-change recording, tire service requests, six-tire survey locking/reopening, Drive photo storage, vehicle administration, and audit logging.
- `Index.html`, `Styles.html`, `Client.html`: single-link web interface using the current Fleet ERP visual language (navy/blue header, sidebar navigation, cards, tables, status badges, company JV branding).
- `appsscript.json`: V8 web app manifest; initial scope is limited to the bound spreadsheet.

## Access model

- One shared web-app URL.
- One Owner/Admin account for fleet administration.
- One shared Driver Portal account for all drivers; this avoids creating approximately 50 separate login accounts.
- After signing in, each driver selects their name. The portal lists only active vehicles whose `assigned_driver` value matches that selected name. A driver can therefore see and use multiple assigned vehicles (for example, three vehicles).
- Driver assignments are sourced from the `Vehicles.assigned_driver` column. Keep the spelling of each driver's name consistent across every vehicle assigned to that person.
- The server checks the selected driver's assigned vehicle list before accepting KM, oil-change, maintenance-ticket, or tire-request actions.
- Each action is recorded under the selected driver name and vehicle. Because the portal login is shared, selecting a name is not proof of personal identity; this is a practical low-assurance workflow, not a substitute for individual authentication where legally or operationally required.
- Existing vehicle-PIN login support remains in the backend for compatibility, but the shared Driver Portal is the intended driver workflow.

### Create the single shared Driver Portal login

After `setupFleetERP()` and the Owner account are ready:

1. If the shared Driver account has not already been created, select and run `setupSharedDriverPortal()` exactly once.
2. Enter one shared Driver Portal username and a strong password of at least 10 characters in the prompts.
3. Share those credentials only with authorized drivers.
4. Drivers sign in through the same username/password form as the Owner, then select their own name.

Do not create one Driver user per person. Do not share the Owner account with drivers.

## Initial data store

The first version uses a bound Google Spreadsheet with these tabs:
`Vehicles`, `KM_Records`, `Oil_Changes`, `Tickets`, `Maintenance`, `Tire_Requests`, `Tire_Surveys`, `Tire_Survey_Tires`, `Inspections`, `Users`, `Audit_Log`, and `Settings`.

Six-tire survey photos are compressed in the browser and stored in a dedicated Google Drive folder named `Fleet ERP Tire Survey Photos`. The survey locks the vehicle after submission; Owner can reopen it. The current build is the driver-operational phase, not yet full module parity with Render.

## Setup (when ready to connect a Google account)

1. Create a new, empty Google Spreadsheet dedicated to the rebuild.
2. Open Extensions → Apps Script from that spreadsheet and add the files from this folder (`Code.gs`, `Index.html`, `Styles.html`, `Client.html`); copy the manifest into the Apps Script project's `appsscript.json` after enabling display of the manifest file.
3. Run `setupFleetERP()` once and authorize the spreadsheet scope.
4. Run `initializeOwnerAccount(username, password, fullName)` only if the Owner account has not already been created. Use a unique password of at least 10 characters; do not put it in this repository or a Sheet.
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

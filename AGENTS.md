# Fleet ERP — agent notes

## Database safety

- `DATABASE_URL` and `V2_DATABASE_URL` point at the live production Neon instance. Never read or write them, and never run a script against them.
- Data-loading scripts must take their target from a dedicated variable (`ERP_DATABASE_URL`) and refuse hosts that look like production. `server/import-building-data.mjs` is the reference implementation: it rejects missing targets, `neon.tech`, `prod`, and RDS hosts, and supports `--dry-run`.
- There is no local Postgres in the dev container by default. To exercise a DB script, start a throwaway container:
  `docker run -d --name erp-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=erp_test -p 55432:5432 postgres:16-alpine`
  then `ERP_DATABASE_URL=postgres://postgres:test@localhost:55432/erp_test node server/<script>.mjs`

## Layout

- `server/server.js` — legacy API (the live one), serves the built client from `client/dist`.
- `server/database-pg.js` — all legacy Postgres access and the financial reports.
- `server/rbac.js` — the only authorization source. `ACCESS_MODULES` lists every module; `ROLE_ACCESS_PRESETS` gives per-role defaults; `getModuleFromPath` maps an API path to a module.
- `client/src/App.jsx` — top-level tab router. A tab needs an entry in `TAB_MODULES`, `TAB_LABELS`, the `allowedTabs` list, and a render branch.
- `client/dist` is git-ignored; run `npx vite build` in `client/` after changing the frontend.

## Operations

The Operations tab is a separate page (`client/src/pages/OperationsHub.jsx`), deliberately not merged with Fleet. It covers building maintenance, projects, warehouse, and purchase requests, and is gated by exactly four modules: `building`, `projects`, `warehouse`, `purchase_requests`.

`GET /api/sites` is shared reference data: work orders, projects, purchases, and purchase requests all need it for their site pickers. It accepts any of the four Operations modules as an alternative to `support`, so a role holding only one of them can still render its pages. Creating or changing a site still requires `support`.

Verify the mapping after touching routes or modules:
`node server/check-operations-rbac.mjs` (expects PASS with zero failures).

## Financial baselines

Monthly savings are `baseline - actual`, with `MAINT_BASELINE = 20577` and `DEV_BASELINE = 132551` in `server/database-pg.js`. Only months with real activity count toward the baseline.

Two rules drive the actual costs and are easy to get wrong:

- A purchase counts toward maintenance parts only when `purchased_by` is `Contractor`, and only when its work order shares the purchase month. Cross-month purchases are excluded.
- A work order is contractor work when `is_contractor = 1` or `contractor_name` is not Company/Internal. The report reads `contractor_cost || final_cost` for contractor work and `labor_cost` for employee work.

## Building data

`server/data/building/*.json` is the cleaned building-maintenance dataset, reconciled against the source sheet. Expected figures: July 2026 contractor WO 2170 / parts WO 1417, August 2026 contractor WO 4638 / parts WO 6601. Load it with `server/import-building-data.mjs`; it is idempotent and upserts on `wo_no`, `project_no`, and `purchase_no`.

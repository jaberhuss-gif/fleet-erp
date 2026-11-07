// Imports the cleaned building-maintenance dataset into the ERP database.
//
// The JSON under server/data/building was extracted from the building sheet and
// reconciled against it (see extraction-notes.json). It is the same dataset the
// building demo was built and verified on, so the numbers here match the sheet:
//   July 2026  contractor WO 2170  contractor WO parts 1891
//   Aug  2026  contractor WO 4638  contractor WO parts 6601
//   July 2026  contractor Development 2525  contractor Development parts 3281
//   Aug  2026  contractor Development 58406  contractor Development parts 0
//
// Safety: this refuses to run against a production database. It only ever talks
// to the database named by ERP_DATABASE_URL (a dedicated target), never
// DATABASE_URL / V2_DATABASE_URL, so the live Neon instance cannot be reached
// even by accident.
//
// Usage:
//   ERP_DATABASE_URL=postgres://... node server/import-building-data.mjs --dry-run
//   ERP_DATABASE_URL=postgres://... node server/import-building-data.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data", "building");
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));

const DRY_RUN = process.argv.includes("--dry-run");
const TARGET = process.env.ERP_DATABASE_URL;

// A production host in the target string means the operator pointed this at the
// wrong database. Refuse rather than trust that they meant it.
const FORBIDDEN = [/neon\.tech/i, /neon\.build/i, /prod/i, /\.rds\.amazonaws\.com/i];
if (!TARGET) {
  console.error("ERP_DATABASE_URL is not set. Refusing to run.");
  console.error("Set it to a dedicated import target, e.g. a local Postgres:");
  console.error("  ERP_DATABASE_URL=postgres://localhost:5432/erp_test node server/import-building-data.mjs");
  process.exit(1);
}
const hit = FORBIDDEN.find((re) => re.test(TARGET));
if (hit) {
  console.error(`Refusing to run: ERP_DATABASE_URL looks like production (matched ${hit}).`);
  process.exit(1);
}

const sites = read("sites.json");
const workOrders = read("work-orders.json");
const projects = read("projects.json");
const purchases = read("purchases.json");
const parts = read("parts.json");

const monthKey = (iso) => (iso ? String(iso).slice(0, 7) : null);
const yearKey = (iso) => (iso ? String(iso).slice(0, 4) : null);
const n = (v) => (v === undefined || v === null || v === "" ? 0 : Number(v));

// The sheet names an executor on every work order. Anything that is not
// Company/Internal is external contractor work; this is the same rule the
// reports use, and it is what the demo was verified against.
const COMPANY = new Set(["company", "internal", ""]);
const isContractorRow = (wo) => {
  if (wo.is_contractor !== undefined) return Boolean(wo.is_contractor);
  return !COMPANY.has(String(wo.contractor_name ?? "").trim().toLowerCase());
};

if (DRY_RUN) {
  console.log("DRY RUN — nothing will be written.\n");
  console.log(`  sites     ${sites.length}`);
  console.log(`  work_orders ${workOrders.length}`);
  console.log(`  projects  ${projects.length}`);
  console.log(`  purchases ${purchases.length}`);
  console.log(`  parts     ${parts.length}`);
  const byMonth = {};
  for (const wo of workOrders) {
    const m = monthKey(wo.reported_date) || "unknown";
    byMonth[m] = (byMonth[m] || 0) + 1;
  }
  console.log("\n  work orders by reported month:", JSON.stringify(byMonth));
  process.exit(0);
}

// Managed Postgres (Neon and friends) needs TLS; a local server usually does
// not. Only enable it for non-local hosts so a local test database works.
const isLocal = /(^|@|\/\/)(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(TARGET);
const pool = new pg.Pool({
  connectionString: TARGET,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});
const q = (text, params = []) => pool.query(text, params);

await q(`CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY, code TEXT UNIQUE, name TEXT, region TEXT DEFAULT '',
  campus_manager TEXT DEFAULT '', phone TEXT DEFAULT '', notes TEXT,
  status TEXT DEFAULT 'Active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

await q(`CREATE TABLE IF NOT EXISTS work_orders (
  id SERIAL PRIMARY KEY, wo_no TEXT UNIQUE, site TEXT, area TEXT, category TEXT,
  priority TEXT DEFAULT 'Medium', description TEXT, assigned_to TEXT,
  is_contractor INTEGER DEFAULT 0, contractor_name TEXT, performed_by TEXT,
  status TEXT DEFAULT 'Open', reported_date DATE, completed_date DATE,
  final_cost NUMERIC DEFAULT 0, contractor_cost NUMERIC DEFAULT 0,
  labor_cost NUMERIC DEFAULT 0, parts_cost NUMERIC DEFAULT 0,
  closing_notes TEXT, parts_used TEXT, month TEXT, year TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

await q(`CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY, project_no TEXT UNIQUE, name TEXT, description TEXT,
  site TEXT, project_type TEXT, status TEXT, budget NUMERIC DEFAULT 0,
  spent NUMERIC DEFAULT 0, start_date DATE, end_date DATE, manager TEXT,
  contractor TEXT, month TEXT, year TEXT, notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

await q(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_cost NUMERIC DEFAULT 0`);
await q(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS internal_labor_cost NUMERIC DEFAULT 0`);

await q(`CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY, purchase_no TEXT UNIQUE, type TEXT, reference_no TEXT,
  item_name TEXT, quantity NUMERIC DEFAULT 1, unit_cost NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0, supplier TEXT, purchased_by TEXT DEFAULT 'Company',
  purchase_date DATE, month TEXT, year TEXT, notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

const counts = {};

for (const s of sites) {
  await q(
    `INSERT INTO sites (code, name, region, status)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, region = EXCLUDED.region`,
    [s.site_id, s.name, s.region || "", s.status || "Active"]
  );
}
counts.sites = sites.length;

// Work orders carry the sheet's own numbers. The report reads contractor_cost
// for contractor jobs and labor_cost for employee jobs, so keep both columns
// meaningful instead of collapsing everything into final_cost.
for (const wo of workOrders) {
  const contractor = isContractorRow(wo);
  await q(
    `INSERT INTO work_orders (wo_no, site, area, category, priority, description,
       assigned_to, is_contractor, contractor_name, performed_by, status,
       reported_date, completed_date, final_cost, contractor_cost, labor_cost,
       parts_cost, closing_notes, parts_used, month, year)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     ON CONFLICT (wo_no) DO UPDATE SET
       site = EXCLUDED.site, status = EXCLUDED.status,
       reported_date = EXCLUDED.reported_date, completed_date = EXCLUDED.completed_date,
       final_cost = EXCLUDED.final_cost, contractor_cost = EXCLUDED.contractor_cost,
       labor_cost = EXCLUDED.labor_cost, closing_notes = EXCLUDED.closing_notes`,
    [
      wo.wo_no, wo.site, wo.area || "", wo.category || "", wo.priority || "Medium",
      wo.description || "", wo.assigned_to || "", contractor ? 1 : 0,
      contractor ? (wo.contractor_name || wo.assigned_to || "") : "", wo.assigned_to || "",
      wo.status || "Open", wo.reported_date || null, wo.completed_date || null,
      n(wo.final_cost), contractor ? n(wo.final_cost) : 0, contractor ? 0 : n(wo.final_cost),
      0, wo.closing_notes || "", wo.parts_used || "",
      monthKey(wo.reported_date), yearKey(wo.reported_date)
    ]
  );
}
counts.work_orders = workOrders.length;

for (const p of projects) {
  await q(
    `INSERT INTO projects (project_no, description, site, status, spent,
       contractor, contractor_cost, internal_labor_cost, start_date, end_date, month, year)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (project_no) DO UPDATE SET
       description = EXCLUDED.description, status = EXCLUDED.status,
       spent = EXCLUDED.spent, contractor = EXCLUDED.contractor,
       contractor_cost = EXCLUDED.contractor_cost, internal_labor_cost = EXCLUDED.internal_labor_cost`,
    [
      p.project_no, p.description || "", p.site || "", p.status || "",
      n(p.total_cost), p.contractor || "", n(p.contractor_cost),
      p.start_date || null,
      p.end_date || null, monthKey(p.start_date), yearKey(p.start_date)
    ]
  );
}
counts.projects = projects.length;

// purchased_by drives the partsWO rule: only contractor purchases count toward
// maintenance parts, and only when the purchase and its work order share a month.
for (const p of purchases) {
  await q(
    `INSERT INTO purchases (purchase_no, type, reference_no, item_name, quantity,
       unit_cost, total_cost, supplier, purchased_by, purchase_date, month, year, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (purchase_no) DO UPDATE SET
       type = EXCLUDED.type, reference_no = EXCLUDED.reference_no,
       total_cost = EXCLUDED.total_cost, purchased_by = EXCLUDED.purchased_by,
       purchase_date = EXCLUDED.purchase_date`,
    [
      p.ref, p.type || "", p.wo_no || p.project_no || "", p.item_name || "",
      n(p.quantity) || 1, n(p.unit_cost), n(p.total_cost), p.supplier || "",
      p.supplier_type || "Company", p.purchase_date || null,
      monthKey(p.purchase_date), yearKey(p.purchase_date), p.notes || ""
    ]
  );
}
counts.purchases = purchases.length;

console.log("Imported building data:");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(12)} ${v}`);

const verify = await q(`
  SELECT to_char(reported_date,'YYYY-MM') AS m,
         COUNT(*) FILTER (WHERE is_contractor = 1) AS contractor_wo
  FROM work_orders WHERE reported_date >= '2026-07-01'
  GROUP BY 1 ORDER BY 1`);
console.log("\nVerification (work orders by month):");
for (const r of verify.rows) console.log(`  ${r.m}  contractor WO ${r.contractor_wo}`);

await pool.end();

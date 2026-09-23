// Seeds the ERP *test* database from the legacy SQLite snapshot shipped in the
// repo (server/fleet_backup_before_cloud.db). This reconstructs the building
// maintenance data the PostgreSQL migration left behind, so the report queries
// can be reconciled against the FMMS reference CSVs.
//
// Test databases only. Never point ERP_DATABASE_URL at production.
import Database from "better-sqlite3";
import pg from "pg";

const sqlite = new Database(process.env.LEGACY_SQLITE || "fleet_backup_before_cloud.db", { readonly: true });
const pool = new pg.Pool({ connectionString: process.env.ERP_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = (t, p = []) => pool.query(t, p);

const val = (v) => (v === undefined ? null : v);

await q(`CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY, code TEXT UNIQUE, name TEXT, region TEXT DEFAULT '',
  campus_manager TEXT DEFAULT '', phone TEXT DEFAULT '', notes TEXT,
  status TEXT DEFAULT 'Active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

for (const r of sqlite.prepare("SELECT * FROM sites").all()) {
  await q(`INSERT INTO sites (id, code, name, region, campus_manager, phone, notes, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
    [r.id, val(r.code), val(r.name), val(r.region), val(r.campus_manager), val(r.phone), val(r.notes), val(r.status)]);
}

for (const r of sqlite.prepare("SELECT * FROM work_orders").all()) {
  await q(`INSERT INTO work_orders (id, wo_no, site, area, category, priority, description,
             assigned_to, is_contractor, contractor_name, status, reported_date, completed_date,
             final_cost, contractor_cost, labor_cost, parts_cost, closing_notes, parts_used, month, year)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
           ON CONFLICT (id) DO NOTHING`,
    [r.id, val(r.wo_no), val(r.site), val(r.area), val(r.category), val(r.priority), val(r.description),
     val(r.assigned_to), val(r.is_contractor), val(r.contractor_name), val(r.status), val(r.reported_date) || null,
     val(r.completed_date) || null, val(r.final_cost), val(r.contractor_cost), val(r.labor_cost),
     val(r.parts_cost), val(r.closing_notes), val(r.parts_used), val(r.month), val(r.year)]);
}

for (const r of sqlite.prepare("SELECT * FROM projects").all()) {
  await q(`INSERT INTO projects (id, project_no, name, description, site, project_type, status,
             budget, spent, start_date, end_date, manager, contractor, month, year, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (id) DO NOTHING`,
    [r.id, val(r.project_no), val(r.name), val(r.description), val(r.site), val(r.project_type),
     val(r.status), val(r.budget), val(r.spent), val(r.start_date) || null, val(r.end_date) || null,
     val(r.manager), val(r.contractor), val(r.month), val(r.year), val(r.notes)]);
}

for (const r of sqlite.prepare("SELECT * FROM purchases").all()) {
  await q(`INSERT INTO purchases (id, purchase_no, type, reference_no, item_name, quantity,
             unit_cost, total_cost, supplier, purchased_by, purchase_date, month, year, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
    [r.id, val(r.purchase_no), val(r.type), val(r.reference_no), val(r.item_name), val(r.quantity),
     val(r.unit_cost), val(r.total_cost), val(r.supplier), val(r.purchased_by),
     val(r.purchase_date) || null, val(r.month), val(r.year), val(r.notes)]);
}

const summary = {};
for (const t of ["work_orders", "projects", "purchases", "sites"]) {
  summary[t] = (await q(`SELECT COUNT(*)::int c FROM ${t}`)).rows[0].c;
}
console.log("seeded:", JSON.stringify(summary));
await pool.end();
// Read-only reconciliation between the FMMS reference CSVs (in the separate
// recon database) and the ERP PostgreSQL database. Produces comparison output
// only; it never writes to the ERP database.
import { query as refQuery } from "./postgres.js";
import pg from "pg";

const erpPool = new pg.Pool({
  connectionString: process.env.ERP_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
const erp = (t, p = []) => erpPool.query(t, p);
const ref = (t, p = []) => refQuery(t, p);

const gate = (name) => `[${name}]`;
const n = (v) => Number(v || 0);

async function counts() {
  const out = {};
  for (const [label, table] of [
    ["work_orders", "work_orders"], ["projects", "projects"],
    ["purchases", "purchases"], ["sites", "sites"]
  ]) {
    const a = (await erp(`SELECT COUNT(*)::int c FROM ${table}`)).rows[0].c;
    out[label] = a;
  }
  const refMap = { work_orders: "ref_work_orders", projects: "ref_projects", purchases: "ref_purchases", sites: "ref_sites" };
  for (const k of Object.keys(refMap)) {
    out["ref_" + k] = (await ref(`SELECT COUNT(*)::int c FROM ${refMap[k]}`)).rows[0].c;
  }
  return out;
}

async function monthly() {
  const erpRows = (await erp(`
    SELECT COALESCE(to_char(reported_date,'YYYY-MM'),'NONE') AS m,
           COUNT(*)::int AS cnt,
           COALESCE(SUM(final_cost),0)::numeric AS cost,
           COUNT(*) FILTER (WHERE contractor_name IS NOT NULL AND TRIM(contractor_name) NOT IN ('','Company','internal','Internal'))::int AS contractor,
           COUNT(*) FILTER (WHERE COALESCE(contractor_name,'') IN ('','Company','internal','Internal'))::int AS internal
    FROM work_orders GROUP BY 1 ORDER BY 1`)).rows;
  const refRows = (await ref(`
    SELECT COALESCE(to_char(reported_date,'YYYY-MM'),'NONE') AS m,
           COUNT(*)::int AS cnt,
           COALESCE(SUM(final_cost),0)::numeric AS cost,
           COUNT(*) FILTER (WHERE COALESCE(assigned_to,'') ILIKE '%contractor%')::int AS contractor
    FROM ref_work_orders GROUP BY 1 ORDER BY 1`)).rows;
  return { erpRows, refRows };
}

async function performers() {
  const erpRows = (await erp(`
    SELECT COALESCE(NULLIF(TRIM(assigned_to),''),'(unassigned)') AS who,
           COALESCE(NULLIF(TRIM(contractor_name),''),'(internal)') AS contractor,
           COUNT(*)::int AS cnt, COALESCE(SUM(final_cost),0)::numeric AS cost
    FROM work_orders GROUP BY 1,2 ORDER BY cnt DESC`)).rows;
  const refRows = (await ref(`
    SELECT COALESCE(NULLIF(TRIM(assigned_to),''),'(unassigned)') AS who,
           COUNT(*)::int AS cnt, COALESCE(SUM(final_cost),0)::numeric AS cost
    FROM ref_work_orders GROUP BY 1 ORDER BY cnt DESC`)).rows;
  return { erpRows, refRows };
}

async function sites() {
  const erpRows = (await erp(`SELECT site, COUNT(*)::int c FROM work_orders GROUP BY 1 ORDER BY 1`)).rows;
  const refRows = (await ref(`SELECT site, COUNT(*)::int c FROM ref_work_orders GROUP BY 1 ORDER BY 1`)).rows;
  const refSites = (await ref(`SELECT name, region, status FROM ref_sites ORDER BY name`)).rows;
  const erpSites = (await erp(`SELECT name, region, status FROM sites ORDER BY name`)).rows;
  return { erpRows, refRows, refSites, erpSites };
}

async function categories() {
  const erpRows = (await erp(`SELECT category, COUNT(*)::int c FROM work_orders GROUP BY 1 ORDER BY 1`)).rows;
  const refRows = (await ref(`SELECT category, COUNT(*)::int c FROM ref_work_orders GROUP BY 1 ORDER BY 1`)).rows;
  return { erpRows, refRows };
}

async function september() {
  const erpRows = (await erp(`
    SELECT COUNT(*)::int cnt, COALESCE(SUM(final_cost),0)::numeric cost
    FROM work_orders
    WHERE reported_date >= DATE '2026-09-01' AND reported_date < DATE '2026-10-01'
      AND COALESCE(category,'') <> 'Project'`)).rows[0];
  const refRows = (await ref(`
    SELECT COUNT(*)::int cnt, COALESCE(SUM(final_cost),0)::numeric cost
    FROM ref_work_orders
    WHERE reported_date >= DATE '2026-09-01' AND reported_date < DATE '2026-10-01'`)).rows[0];
  return { erpRows, refRows };
}

async function duplicates() {
  const refDup = (await ref(`
    SELECT wo_no, COUNT(*)::int c FROM ref_work_orders
    GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY c DESC`)).rows;
  const erpDup = (await erp(`
    SELECT wo_no, COUNT(*)::int c FROM work_orders
    GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY c DESC`)).rows;
  return { refDup, erpDup };
}

async function projectsVsWos() {
  const refProj = (await ref(`SELECT COUNT(*)::int c, COALESCE(SUM(contractor_cost),0)::numeric s FROM ref_projects`)).rows[0];
  const erpProj = (await erp(`SELECT COUNT(*)::int c, COALESCE(SUM(spent),0)::numeric s FROM projects`)).rows[0];
  return { refProj, erpProj };
}

const result = {
  counts: await counts(),
  monthly: await monthly(),
  performers: await performers(),
  sites: await sites(),
  categories: await categories(),
  september: await september(),
  duplicates: await duplicates(),
  projects: await projectsVsWos()
};

console.log(JSON.stringify(result, null, 1));
await erpPool.end();
process.exit(0);
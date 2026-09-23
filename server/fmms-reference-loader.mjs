// Loads the FMMS reference CSV export into a SEPARATE reconciliation database.
// This never touches the ERP database and never overwrites ERP rows.
import fs from "fs";
import path from "path";
import { query } from "./postgres.js";

const DIR = process.env.FMMS_DIR || "/workspace/fmms_x";

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function sheetDate(value) {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0 && asNumber < 90000) {
    // Excel serial date, same epoch convention used by the workbook.
    const ms = Math.round((asNumber - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function num(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function load(name) {
  const rows = parseCsv(fs.readFileSync(path.join(DIR, name), "utf8"));
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])))
    .filter((r) => Object.values(r).some((v) => v !== ""));
}

function monthOf(date) {
  return date ? date.slice(0, 7) : null;
}

export async function loadReference() {
  await query(`CREATE TABLE IF NOT EXISTS ref_work_orders (
    id SERIAL PRIMARY KEY, wo_no TEXT, site TEXT, area TEXT, category TEXT, priority TEXT,
    description TEXT, assigned_to TEXT, status TEXT, reported_date DATE, completion_date DATE,
    final_cost NUMERIC, parts_used TEXT, closing_notes TEXT)`);
  await query(`CREATE TABLE IF NOT EXISTS ref_projects (
    id SERIAL PRIMARY KEY, project_no TEXT, location TEXT, description TEXT, start_date DATE,
    end_date DATE, status TEXT, total_cost NUMERIC, contractor_cost NUMERIC, contractor TEXT)`);
  await query(`CREATE TABLE IF NOT EXISTS ref_purchases (
    id SERIAL PRIMARY KEY, purchase_no TEXT, type TEXT, reference_no TEXT, item_name TEXT,
    quantity NUMERIC, unit_cost NUMERIC, total_cost NUMERIC, supplier TEXT,
    supplier_kind TEXT, purchase_date DATE, notes TEXT)`);
  await query(`CREATE TABLE IF NOT EXISTS ref_parts (
    id SERIAL PRIMARY KEY, part_no TEXT, wo_no TEXT, part_name TEXT,
    quantity NUMERIC, unit_price NUMERIC, total_price NUMERIC)`);
  await query(`CREATE TABLE IF NOT EXISTS ref_sites (
    id SERIAL PRIMARY KEY, site_no TEXT, name TEXT, region TEXT, status TEXT)`);
  await query(`CREATE TABLE IF NOT EXISTS ref_site_tasks (
    id SERIAL PRIMARY KEY, task_no TEXT, site_name TEXT, description TEXT, start_date DATE,
    close_date DATE, amount NUMERIC, status TEXT, assigned_to TEXT)`);
  await query(`CREATE TABLE IF NOT EXISTS ref_monthly_savings (
    id SERIAL PRIMARY KEY, month TEXT, year TEXT, contractor_wo NUMERIC, contractor_dev NUMERIC,
    parts_wo NUMERIC, parts_dev NUMERIC, total_labor NUMERIC, total_parts NUMERIC,
    total_cost NUMERIC, maintenance_savings NUMERIC, development_savings NUMERIC)`);
  await query(`CREATE TABLE IF NOT EXISTS ref_dev_tasks (
    id SERIAL PRIMARY KEY, task_no TEXT, project_no TEXT, task_name TEXT, cost NUMERIC,
    contractor TEXT, status TEXT)`);

  await query(`TRUNCATE ref_work_orders, ref_projects, ref_purchases, ref_parts, ref_sites,
    ref_site_tasks, ref_monthly_savings, ref_dev_tasks RESTART IDENTITY`);

  const data = load("Data.csv");
  for (const r of data) {
    if (!r["WO No"]) continue;
    await query(
      `INSERT INTO ref_work_orders (wo_no, site, area, category, priority, description,
        assigned_to, status, reported_date, completion_date, final_cost, parts_used, closing_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [r["WO No"], r["Site"], r["Area"], r["Category"], r["Priority"], r["Description"],
       r["Assigned To"], r["Status"], sheetDate(r["Reported Date"]), sheetDate(r["Completion Date"]),
       num(r["Final Cost"]), r["Parts Used"], r["Closing Notes"]]
    );
  }

  for (const r of load("ProjectManagement.csv")) {
    if (!r["ID"]) continue;
    await query(
      `INSERT INTO ref_projects (project_no, location, description, start_date, end_date,
        status, total_cost, contractor_cost, contractor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [r["ID"], r["Location"], r["Description"], sheetDate(r["Start Date"]), sheetDate(r["End Date"]),
       r["Status"], num(r["Total Cost"]), num(r["Contractor Cost"]), r["Contractor"]]
    );
  }

  for (const r of load("Purchases.csv")) {
    if (!r["ID"]) continue;
    await query(
      `INSERT INTO ref_purchases (purchase_no, type, reference_no, item_name, quantity,
        unit_cost, total_cost, supplier, supplier_kind, purchase_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [r["ID"], r["Type"], r["Reference ID"], r["Item Name"], num(r["Quantity"]),
       num(r["Unit Cost"]), num(r["Total Cost"]), r["Supplier"], r["Purchase Date"] ? r["Supplier"] : "",
       sheetDate(r["Purchase Date"]), r["Notes"]]
    );
  }

  for (const r of load("Parts.csv")) {
    if (!r["ID"]) continue;
    await query(
      `INSERT INTO ref_parts (part_no, wo_no, part_name, quantity, unit_price, total_price)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [r["ID"], r["WO No"], r["Part Name"], num(r["Quantity"]), num(r["Unit Price"]), num(r["Total Price"])]
    );
  }

  for (const r of load("Sites.csv")) {
    if (!r["SiteID"]) continue;
    await query(
      `INSERT INTO ref_sites (site_no, name, region, status) VALUES ($1,$2,$3,$4)`,
      [r["SiteID"], r["SiteName"], r["Region"], r["Status"]]
    );
  }

  for (const r of load("SiteTasks.csv")) {
    if (!r["ID"]) continue;
    await query(
      `INSERT INTO ref_site_tasks (task_no, site_name, description, start_date, close_date,
        amount, status, assigned_to) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r["ID"], r["Site Name"], r["Task Description"], sheetDate(r["Start Date"]),
       sheetDate(r["Close Date"]), num(r["Amount"]), r["Status"], r["Assigned To"]]
    );
  }

  for (const r of load("MonthlySavings.csv")) {
    if (!r["Month"]) continue;
    await query(
      `INSERT INTO ref_monthly_savings (month, year, contractor_wo, contractor_dev, parts_wo,
        parts_dev, total_labor, total_parts, total_cost, maintenance_savings, development_savings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [r["Month"], r["Year"], num(r["Contractor WO"]), num(r["Contractor Dev"]), num(r["Parts WO"]),
       num(r["Parts Dev"]), num(r["Total Labor"]), num(r["Total Parts"]), num(r["Total Cost"]),
       num(r["Maintenance Savings"]), num(r["Development Savings"])]
    );
  }

  for (const r of load("DevTasks.csv")) {
    if (!r["ID"]) continue;
    await query(
      `INSERT INTO ref_dev_tasks (task_no, project_no, task_name, cost, contractor, status)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [r["ID"], r["Project ID"], r["Task Name"], num(r["Cost"]), r["Contractor"], r["Status"]]
    );
  }

  const counts = {};
  for (const t of ["ref_work_orders", "ref_projects", "ref_purchases", "ref_parts",
                   "ref_sites", "ref_site_tasks", "ref_monthly_savings", "ref_dev_tasks"]) {
    counts[t] = Number((await query(`SELECT COUNT(*)::int c FROM ${t}`)).rows[0].c);
  }
  return counts;
}

export { monthOf, sheetDate, num };
// One-time correction for projects that were imported with a blank Start Date.
//
// The import stored those rows with start_date = the import day (2026-09-13)
// and month = '2026-09', which fabricated a phantom September reporting bucket.
// The real source (FMMS CSV) has an empty Start Date for those projects, so the
// correct value is NULL.
//
// Safe by design:
//   * identifies rows ONLY by the explicit project_no list below,
//   * only clears a start_date that still equals the known import artefact,
//   * does NOT delete rows and does NOT touch any other column,
//   * dry-run by default; pass --apply to write.
//
// Usage (test first, always):
//   ERP_DATABASE_URL=postgresql://... node fix-blank-project-dates.mjs
//   ERP_DATABASE_URL=postgresql://... node fix-blank-project-dates.mjs --apply
import pg from "pg";

const ARTEFACT_DATE = process.env.BLANK_START_ARTEFACT || "2026-09-13";
const PROJECT_NOS = (process.env.BLANK_START_PROJECTS ||
  "PRJ002,PRJ003,PRJ004,PRJ-0005")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const apply = process.argv.includes("--apply");

const connectionString = process.env.ERP_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set ERP_DATABASE_URL (preferred) or DATABASE_URL.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

const before = await pool.query(
  `SELECT id, project_no, start_date, month, year
     FROM projects
    WHERE project_no = ANY($1)
    ORDER BY project_no`,
  [PROJECT_NOS]
);

console.log(`Candidate rows (start_date = ${ARTEFACT_DATE}):`);
for (const r of before.rows) {
  console.log(
    `  ${r.project_no}  id=${r.id}  start_date=${r.start_date === null ? "NULL" : new Date(r.start_date).toISOString().slice(0, 10)}  month=${r.month}`
  );
}

if (!apply) {
  console.log("\nDry run. Nothing written. Re-run with --apply to correct these rows.");
  await pool.end();
  process.exit(0);
}

const result = await pool.query(
  `UPDATE projects
      SET start_date = NULL,
          month = NULL,
          year = NULL,
          updated_at = CURRENT_TIMESTAMP
    WHERE project_no = ANY($1)
      AND (start_date = $2::date OR (start_date IS NULL AND month = $3))
    RETURNING id, project_no`,
  [PROJECT_NOS, ARTEFACT_DATE, ARTEFACT_DATE.slice(0, 7)]
);

console.log(`\nCorrected ${result.rowCount} row(s):`);
for (const r of result.rows) console.log(`  ${r.project_no} (id=${r.id})`);

await pool.end();

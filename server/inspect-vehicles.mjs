import { query, closePostgres } from "./postgres.js";

try {
  const r = await query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
    ORDER BY ordinal_position
  `);

  console.table(r.rows);
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  await closePostgres();
}

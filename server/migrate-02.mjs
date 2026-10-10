// migrate-02.mjs
// Backfill driver_id + driver_name في km_records
// Zero Data Loss — UPDATE فقط للصفوف NULL

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('🔍 Before backfill:');
  const before = await pool.query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(driver_id) AS filled,
      COUNT(*) - COUNT(driver_id) AS empty
    FROM km_records
  `);
  console.log('  Total:', before.rows[0].total);
  console.log('  Filled:', before.rows[0].filled);
  console.log('  Empty:', before.rows[0].empty);

  console.log('\n🔧 Running backfill...');
  const result = await pool.query(`
    UPDATE km_records km
    SET 
      driver_id = v.driver_id,
      driver_name = v.driver
    FROM vehicles v
    WHERE km.vehicle_id = v.id
      AND km.driver_id IS NULL
      AND v.driver_id IS NOT NULL
      AND km.reading_km IS NOT NULL
  `);
  console.log('  ✅ Rows updated:', result.rowCount);

  console.log('\n🔍 After backfill:');
  const after = await pool.query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(driver_id) AS filled,
      COUNT(*) - COUNT(driver_id) AS empty
    FROM km_records
  `);
  console.log('  Total:', after.rows[0].total);
  console.log('  Filled:', after.rows[0].filled);
  console.log('  Empty:', after.rows[0].empty);

  if (before.rows[0].total !== after.rows[0].total) {
    console.log('\n🔴 ERROR: Total row count changed!');
    process.exit(1);
  }

  console.log('\n🎉 Migration 02 completed successfully');
  await pool.end();
}

main().catch(e => {
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
});
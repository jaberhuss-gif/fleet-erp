// migrate-14.mjs
// Backfill driver_id + driver_name في tire_surveys
// من vehicles — للسجلات الفارغة فقط

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('=== Migration 14: Backfill tire_surveys ===\n');

  console.log('1. Before:');
  const before = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(driver_id) AS filled,
      COUNT(*) - COUNT(driver_id) AS empty
    FROM tire_surveys
  `);
  console.log('   Total:', before.rows[0].total);
  console.log('   Filled:', before.rows[0].filled);
  console.log('   Empty:', before.rows[0].empty);

  console.log('\n2. Running backfill...');
  const result = await pool.query(`
    UPDATE tire_surveys ts
    SET
      driver_id = v.driver_id,
      driver_name = v.driver
    FROM vehicles v
    WHERE ts.vehicle_id = v.id
      AND ts.driver_id IS NULL
      AND v.driver_id IS NOT NULL
  `);
  console.log('   ✅ Rows updated:', result.rowCount);

  console.log('\n3. After:');
  const after = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(driver_id) AS filled,
      COUNT(*) - COUNT(driver_id) AS empty
    FROM tire_surveys
  `);
  console.log('   Total:', after.rows[0].total);
  console.log('   Filled:', after.rows[0].filled);
  console.log('   Empty:', after.rows[0].empty);

  if (before.rows[0].total !== after.rows[0].total) {
    console.log('\n🔴 ERROR: Total row count changed!');
    process.exit(1);
  }

  console.log('\n🎉 Migration 14 completed successfully');
  await pool.end();
}

main().catch(e => {
  console.error('❌ Migration failed:', e.message || e);
  console.error('Stack:', e.stack);
  process.exit(1);
});
// migrate-13.mjs
// إضافة driver_id + driver_name إلى tire_surveys
// Zero Data Loss — ADD COLUMN فقط

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('=== Migration 13: tire_surveys.driver_id ===\n');

  console.log('1. Before:');
  const before = await pool.query('SELECT COUNT(*) AS cnt FROM tire_surveys');
  console.log('   tire_surveys rows:', before.rows[0].cnt);

  console.log('\n2. Running ALTER TABLE...');
  await pool.query(`
    ALTER TABLE tire_surveys
      ADD COLUMN IF NOT EXISTS driver_id BIGINT,
      ADD COLUMN IF NOT EXISTS driver_name TEXT
  `);
  console.log('   ✅ ALTER TABLE: success');

  console.log('\n3. After:');
  const after = await pool.query('SELECT COUNT(*) AS cnt FROM tire_surveys');
  console.log('   tire_surveys rows:', after.rows[0].cnt);

  console.log('\n4. New columns:');
  const cols = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name='tire_surveys'
      AND column_name IN ('driver_id','driver_name')
    ORDER BY column_name
  `);
  cols.rows.forEach(c => console.log('   -', c.column_name, c.data_type));

  if (before.rows[0].cnt !== after.rows[0].cnt) {
    console.log('\n🔴 ERROR: Row count changed!');
    process.exit(1);
  }

  console.log('\n🎉 Migration 13 completed successfully');
  await pool.end();
}

main().catch(e => {
    console.error('❌ Migration failed:', e.message || e);
  console.error('Stack:', e.stack);
  console.error('Code:', e.code);
  console.error('Detail:', e.detail);
  process.exit(1);
});
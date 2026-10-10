

// migrate-01.mjs
// إضافة driver_id + driver_name إلى km_records
// Zero Data Loss — فقط ADD COLUMN

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('🔍 Before migration:');
  const before = await pool.query('SELECT COUNT(*) FROM km_records');
  console.log('  km_records rows:', before.rows[0].count);

  console.log('\n🔧 Running ALTER TABLE...');
  await pool.query(`
    ALTER TABLE km_records 
      ADD COLUMN IF NOT EXISTS driver_id BIGINT,
      ADD COLUMN IF NOT EXISTS driver_name TEXT
  `);
  console.log('  ✅ ALTER TABLE: success');

  console.log('\n🔍 After migration:');
  const after = await pool.query('SELECT COUNT(*) FROM km_records');
  console.log('  km_records rows:', after.rows[0].count);

  console.log('\n🔍 New columns:');
  const cols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name='km_records' 
      AND column_name IN ('driver_id','driver_name')
    ORDER BY column_name
  `);
  cols.rows.forEach(x => console.log('  -', x.column_name, x.data_type));

  if (before.rows[0].count !== after.rows[0].count) {
    console.log('\n🔴 ERROR: Row count changed!');
    process.exit(1);
  }

  console.log('\n🎉 Migration 01 completed successfully');
  await pool.end();
}

main().catch(e => {
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
});
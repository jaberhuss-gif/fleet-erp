// migrate-16-driver-handovers.mjs
// جدول driver_handovers لتوثيق تغيير السائقين
// Zero Data Loss — CREATE TABLE IF NOT EXISTS فقط

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('=== Migration 16: driver_handovers ===\n');

  console.log('1. Creating table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS driver_handovers (
      id BIGSERIAL PRIMARY KEY,
      vehicle_id BIGINT NOT NULL,
      vehicle_plate TEXT,

      previous_driver_id BIGINT,
      previous_driver_name TEXT,
      previous_driver_phone TEXT,

      new_driver_id BIGINT,
      new_driver_name TEXT,
      new_driver_phone TEXT,

      handover_date DATE NOT NULL DEFAULT CURRENT_DATE,

      km_at_handover INTEGER,
      last_oil_km INTEGER,
      last_oil_date DATE,

      open_issues JSONB DEFAULT '[]'::jsonb,
      notes TEXT,

      pdf_url TEXT,
      whatsapp_sent_at TIMESTAMPTZ,
      email_sent_at TIMESTAMPTZ,

      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✅ Table created');

  console.log('\n2. Creating indexes...');
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_driver_handovers_vehicle ON driver_handovers(vehicle_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_driver_handovers_date ON driver_handovers(handover_date DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_driver_handovers_new_driver ON driver_handovers(new_driver_id)`);
  console.log('   ✅ Indexes created');

  console.log('\n3. Verifying...');
  const cols = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'driver_handovers'
    ORDER BY ordinal_position
  `);
  cols.rows.forEach(c => console.log('   -', c.column_name, '|', c.data_type));

  console.log('\n🎉 Migration 16 completed');
  await pool.end();
}

main().catch(e => {
  console.error('❌', e.message || e);
  console.error('Stack:', e.stack);
  process.exit(1);
});
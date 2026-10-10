// fix-inspection-expiry-v2.mjs
// يُحدّث inspection_expiry_date = inspection_last_date + 365
// فقط للسيارات التي فُحصت (inspection_last_date موجود)
// ولم يُحدَّث expiry صحيح

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('=== Fix inspection_expiry_date v2 ===\n');

  console.log('1. Before:');
  const before = await pool.query(`
    SELECT
      plate_number, plate_code,
      inspection_last_date::text AS last,
      inspection_due_date::text AS due,
      inspection_expiry_date::text AS expiry
    FROM vehicles
    WHERE inspection_last_date IS NOT NULL
    ORDER BY plate_number
  `);
  before.rows.forEach(v => {
    console.log(
      `${v.plate_number} ${v.plate_code}`.padEnd(12),
      '| last:', (v.last || 'null').padEnd(12),
      '| due:', (v.due || 'null').padEnd(12),
      '| expiry:', (v.expiry || 'null')
    );
  });

  console.log('\n2. Running UPDATE (expiry = last + 365)...');
  const result = await pool.query(`
    UPDATE vehicles
    SET inspection_expiry_date = inspection_last_date + INTERVAL '365 days'
    WHERE inspection_last_date IS NOT NULL
      AND (
        inspection_expiry_date IS NULL
        OR inspection_expiry_date <> inspection_last_date + INTERVAL '365 days'
      )
  `);
  console.log('   ✅ Rows updated:', result.rowCount);

  console.log('\n3. After:');
  const after = await pool.query(`
    SELECT
      plate_number, plate_code,
      inspection_last_date::text AS last,
      inspection_due_date::text AS due,
      inspection_expiry_date::text AS expiry
    FROM vehicles
    WHERE inspection_last_date IS NOT NULL
    ORDER BY plate_number
  `);
  after.rows.forEach(v => {
    console.log(
      `${v.plate_number} ${v.plate_code}`.padEnd(12),
      '| last:', (v.last || 'null').padEnd(12),
      '| due:', (v.due || 'null').padEnd(12),
      '| expiry:', (v.expiry || 'null')
    );
  });

  console.log('\n🎉 Done');
  await pool.end();
}

main().catch(e => {
  console.error('❌', e.message || e);
  console.error('Stack:', e.stack);
  process.exit(1);
});
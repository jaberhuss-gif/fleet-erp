import { query } from './postgres.js';

try {
  const tables = await query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  console.log('\n=== POSTGRES DATA COUNTS ===\n');

  for (const row of tables.rows) {
    const table = row.table_name;

    try {
      const result = await query(
        `SELECT COUNT(*) AS count FROM "${table}"`
      );

      console.log(`${table}: ${result.rows[0].count}`);
    } catch (error) {
      console.log(`${table}: ERROR - ${error.message}`);
    }
  }

  console.log('\n=== END ===\n');
} catch (error) {
  console.error('\nPOSTGRES ERROR:');
  console.error(error.message);
} finally {
  process.exit(0);
}
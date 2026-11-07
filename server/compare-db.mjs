import Database from 'better-sqlite3';
import { query } from './postgres.js';

const sqlite = new Database('./fleet.db');

function normalize(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

async function getPrimaryKey(table, databaseType) {
  if (databaseType === 'sqlite') {
    const rows = sqlite.prepare(`PRAGMA table_info("${table}")`).all();
    const pk = rows.find(r => r.pk === 1);
    return pk ? pk.name : null;
  }

  const result = await query(`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = $1
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
    LIMIT 1
  `, [table]);

  return result.rows[0]?.column_name || null;
}

async function compareTable(table) {
  const sqlitePK = await getPrimaryKey(table, 'sqlite');
  const pgPK = await getPrimaryKey(table, 'postgres');

  console.log(`\n=== ${table} ===`);

  const sqliteRows = sqlite
    .prepare(`SELECT * FROM "${table}"`)
    .all();

  const pgResult = await query(`SELECT * FROM "${table}"`);
  const pgRows = pgResult.rows;

  console.log(`SQLite: ${sqliteRows.length}`);
  console.log(`PostgreSQL: ${pgRows.length}`);

  if (sqliteRows.length !== pgRows.length) {
    console.log('COUNT DIFFERENCE');
    return;
  }

  if (!sqlitePK || !pgPK) {
    console.log('No common primary key detected - count only');
    return;
  }

  console.log(`Primary Key: SQLite=${sqlitePK}, PostgreSQL=${pgPK}`);

  const sqliteMap = new Map(
    sqliteRows.map(row => [normalize(row[sqlitePK]), row])
  );

  const pgMap = new Map(
    pgRows.map(row => [normalize(row[pgPK]), row])
  );

  let differences = 0;

  for (const [key, sqliteRow] of sqliteMap) {
    const pgRow = pgMap.get(key);

    if (!pgRow) {
      differences++;
      if (differences <= 10) {
        console.log(`Missing in PostgreSQL: ${sqlitePK}=${key}`);
      }
      continue;
    }

    const keys = new Set([
      ...Object.keys(sqliteRow),
      ...Object.keys(pgRow)
    ]);

    for (const column of keys) {
      const a = normalize(sqliteRow[column]);
      const b = normalize(pgRow[column]);

      if (a !== b) {
        differences++;

        if (differences <= 10) {
          console.log(
            `Difference ${sqlitePK}=${key}, column "${column}":`,
            'SQLite =', a,
            '| PostgreSQL =', b
          );
        }
      }
    }
  }

  for (const [key] of pgMap) {
    if (!sqliteMap.has(key)) {
      differences++;

      if (differences <= 10) {
        console.log(`Extra in PostgreSQL: ${pgPK}=${key}`);
      }
    }
  }

  if (differences === 0) {
    console.log('MATCH: data is identical');
  } else {
    console.log(`DIFFERENCES FOUND: ${differences}`);
  }
}

try {
  const tables = [
    'vehicles',
    'drivers',
    'sites',
    'work_orders',
    'tickets',
    'periodic_maintenance',
    'projects',
    'purchases',
    'users',
    'roles',
    'permissions',
    'role_permissions',
    'oil_changes',
    'km_records',
    'inventory',
    'stock_transactions'
  ];

  for (const table of tables) {
    await compareTable(table);
  }

  console.log('\n=== COMPARISON COMPLETE ===');
} catch (error) {
  console.error('\nERROR:');
  console.error(error);
} finally {
  sqlite.close();
}
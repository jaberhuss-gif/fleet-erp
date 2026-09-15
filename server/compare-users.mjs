import Database from 'better-sqlite3';
import { query } from './postgres.js';

const sqlite = new Database('./fleet.db');

function show(label, rows) {
  console.log(`\n=== ${label} ===`);
  console.table(rows);
}

try {
  const sqliteUsers = sqlite.prepare(`
    SELECT
      id,
      username,
      full_name,
      role,
      is_active
    FROM users
    ORDER BY username
  `).all();

  const pgResult = await query(`
    SELECT
      id,
      username,
      full_name,
      role,
      is_active
    FROM users
    ORDER BY username
  `);

  const pgUsers = pgResult.rows;

  show('SQLITE USERS', sqliteUsers);
  show('POSTGRES USERS', pgUsers);

  console.log('\n=== USER COMPARISON BY USERNAME ===\n');

  const sqliteMap = new Map(
    sqliteUsers.map(u => [u.username, u])
  );

  const pgMap = new Map(
    pgUsers.map(u => [u.username, u])
  );

  const usernames = new Set([
    ...sqliteMap.keys(),
    ...pgMap.keys()
  ]);

  for (const username of usernames) {
    const s = sqliteMap.get(username);
    const p = pgMap.get(username);

    console.log(`USER: ${username}`);

    if (!s) {
      console.log('  ❌ Missing in SQLite');
      continue;
    }

    if (!p) {
      console.log('  ❌ Missing in PostgreSQL');
      continue;
    }

    console.log(`  SQLite ID:      ${s.id}`);
    console.log(`  PostgreSQL ID:  ${p.id}`);
    console.log(`  Full Name:      ${s.full_name} | ${p.full_name}`);
    console.log(`  Role:           ${s.role} | ${p.role}`);
    console.log(`  Active:         ${s.is_active} | ${p.is_active}`);

    if (
      s.full_name === p.full_name &&
      s.role === p.role &&
      Number(s.is_active) === Number(p.is_active)
    ) {
      console.log('  ✅ User profile matches');
    } else {
      console.log('  ⚠️ User profile differs');
    }

    console.log('');
  }

  console.log('\n=== PASSWORD HASH CHECK ===\n');

  const sqlitePasswords = sqlite.prepare(`
    SELECT username, password
    FROM users
    ORDER BY username
  `).all();

  const pgPasswords = (
    await query(`
      SELECT username, password
      FROM users
      ORDER BY username
    `)
  ).rows;

  const pgPasswordMap = new Map(
    pgPasswords.map(u => [u.username, u.password])
  );

  for (const user of sqlitePasswords) {
    const pgPassword = pgPasswordMap.get(user.username);

    if (!pgPassword) {
      console.log(`${user.username}: ❌ Missing in PostgreSQL`);
      continue;
    }

    console.log(
      `${user.username}:`,
      user.password === pgPassword
        ? '✅ Same password hash'
        : '⚠️ Different password hash'
    );
  }

  console.log('\n=== COMPLETE ===');

} catch (error) {
  console.error('\nERROR:');
  console.error(error);
} finally {
  sqlite.close();
}
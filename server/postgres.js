import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
}

export function isPostgresEnabled() {
  return !!pool;
}

export async function query(text, params = []) {
  if (!pool) {
    throw new Error("PostgreSQL is not configured. DATABASE_URL is missing.");
  }

  return pool.query(text, params);
}

export async function transaction(callback) {
  if (!pool) {
    throw new Error("PostgreSQL is not configured. DATABASE_URL is missing.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostgres() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env")
});

let pool = null;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
  } catch (e) {
    console.error("Failed to create PostgreSQL pool:", e.message);
  }
} else {
  console.warn("DATABASE_URL is not set. PostgreSQL will not be available.");
  console.warn("Add it in the hosting environment variables.");
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

// Start the operational schedulers (Daily KM, Periodic Maintenance) and the
// optional Google Sheet import from the same backend process. Daily KM and
// maintenance run independently of the Sheet sync so a Sheet outage cannot stop
// compliance work. Twilio delivery remains disabled unless TWILIO_ENABLED=true
// is explicitly set.
if (process.env.SCHEDULERS_DISABLED !== "true") {
  setTimeout(async () => {
    try {
      const { startSchedulers } = await import("./scheduler.js");
      startSchedulers();
    } catch (error) {
      console.error("Failed to start schedulers:", error.message);
    }
  }, 1000);
}

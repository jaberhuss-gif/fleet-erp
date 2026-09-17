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

// Start the legacy Google Sheet vehicle sync and daily KM reminder service
// from the same backend process. This keeps the hosting Start Command simple:
// `node server/server.js`.
// Twilio delivery remains disabled unless TWILIO_ENABLED=true is explicitly set.
if (process.env.GOOGLE_SHEET_SYNC_DISABLED !== "true") {
  setTimeout(async () => {
    try {
      const { startGoogleSheetVehicleSync } = await import("./googleSheetSync.js");
      startGoogleSheetVehicleSync();
    } catch (error) {
      console.error("Failed to start Google Sheet vehicle sync:", error.message);
    }
  }, 1000);
}

import "dotenv/config";
import pg from "pg";
const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    plate TEXT,
    plate_number TEXT,
    plate_code TEXT,
    make TEXT,
    model TEXT,
    year INT,
    status TEXT DEFAULT 'Safe',
    location TEXT,
    driver_name TEXT,
    driver_phone TEXT,
    current_km INT DEFAULT 0,
    last_oil_km INT DEFAULT 0,
    oil_change_interval INT DEFAULT 5000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS work_orders (
    id SERIAL PRIMARY KEY,
    type TEXT,
    target_id TEXT,
    description TEXT,
    priority TEXT,
    status TEXT DEFAULT 'Open',
    assigned_to TEXT,
    cost NUMERIC DEFAULT 0,
    paid NUMERIC DEFAULT 0,
    campus TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log("? ?? ????? ??????? ?? ????? ?????? Neon ?????!");
await client.end();

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

for (const table of ["vehicles", "work_orders"]) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count FROM "${table}"`
  );

  console.log(`${table}: ${result.rows[0].count}`);
}

await client.end();

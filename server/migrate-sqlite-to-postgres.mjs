import Database from "better-sqlite3";
import pg from "pg";
import "dotenv/config";

const { Client } = pg;

const sqlite = new Database("fleet.db", { readonly: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const tables = [
  "roles",
  "permissions",
  "users",
  "role_permissions",
  "user_permissions",
  "vehicles",
  "drivers",
  "km_records",
  "oil_changes",
  "periodic_maintenance",
  "tickets",
  "sites",
  "work_orders",
  "projects",
  "purchases",
  "inventory",
  "stock_transactions",
  "audit_log"
];

const typeMap = {
  INTEGER: "INTEGER",
  REAL: "DOUBLE PRECISION",
  TEXT: "TEXT",
  DATE: "DATE",
  DATETIME: "TIMESTAMP"
};

function quoteIdent(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

function normalizeType(sqliteType) {
  const type = String(sqliteType || "").toUpperCase().trim();
  return typeMap[type] || "TEXT";
}

function getTableInfo(table) {
  return sqlite.prepare(
    `PRAGMA table_info(${quoteIdent(table)})`
  ).all();
}

function getRows(table) {
  return sqlite.prepare(
    `SELECT * FROM ${quoteIdent(table)}`
  ).all();
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return null;

  const v = String(value).trim();

  if (v.toUpperCase() === "CURRENT_TIMESTAMP") {
    return "CURRENT_TIMESTAMP";
  }

  if (v.toUpperCase() === "CURRENT_DATE") {
    return "CURRENT_DATE";
  }

  if (/^-?\d+(\.\d+)?$/.test(v)) {
    return v;
  }

  if (
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith('"') && v.endsWith('"'))
  ) {
    return v.replace(/^"|"$/g, "'");
  }

  return v;
}

async function createTable(table) {
  const columns = getTableInfo(table);

  if (!columns.length) {
    throw new Error(`SQLite table not found: ${table}`);
  }

  const primaryKeyColumns = columns
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk);

  const singleIntegerPrimaryKey =
    primaryKeyColumns.length === 1 &&
    String(primaryKeyColumns[0].type || "").toUpperCase() === "INTEGER";

  const definitions = columns.map((column) => {
    const isSingleIntegerPrimaryKey =
      singleIntegerPrimaryKey &&
      column.name === primaryKeyColumns[0].name;

    let definition;

    if (isSingleIntegerPrimaryKey) {
      definition = `${quoteIdent(column.name)} SERIAL`;
    } else {
      definition =
        `${quoteIdent(column.name)} ${normalizeType(column.type)}`;
    }

    if (column.notnull === 1 && !isSingleIntegerPrimaryKey) {
      definition += " NOT NULL";
    }

    if (!isSingleIntegerPrimaryKey && column.dflt_value !== null) {
      const defaultValue = normalizeDefault(column.dflt_value);

      if (defaultValue) {
        definition += ` DEFAULT ${defaultValue}`;
      }
    }

    return definition;
  });

  if (primaryKeyColumns.length > 0) {
    const pk = primaryKeyColumns
      .map((c) => quoteIdent(c.name))
      .join(", ");

    definitions.push(`PRIMARY KEY (${pk})`);
  }

  await client.query(
    `CREATE TABLE ${quoteIdent(table)} (${definitions.join(", ")})`
  );
}

async function dropTargetTables() {
  console.log("\nDropping existing target tables...");

  for (const table of [...tables].reverse()) {
    await client.query(
      `DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`
    );

    console.log(`Dropped: ${table}`);
  }
}

async function insertRows(table) {
  const columns = getTableInfo(table);
  const rows = getRows(table);

  if (rows.length === 0) {
    console.log(`${table}: 0 rows`);
    return 0;
  }

  const columnNames = columns.map((c) => c.name);

  const quotedColumns = columnNames
    .map(quoteIdent)
    .join(", ");

  const placeholders = columnNames
    .map((_, index) => `$${index + 1}`)
    .join(", ");

  const sql = `
    INSERT INTO ${quoteIdent(table)}
    (${quotedColumns})
    VALUES (${placeholders})
  `;

  for (const row of rows) {
    const values = columnNames.map((column) => {
      const columnInfo = columns.find((c) => c.name === column);
      const value = row[column];

      if (
        value === "" &&
        ["DATE", "DATETIME"].includes(
          String(columnInfo?.type || "").toUpperCase()
        )
      ) {
        return null;
      }

      return value;
    });

    await client.query(sql, values);
  }

  console.log(`${table}: ${rows.length} rows`);
  return rows.length;
}

async function resetSequence(table) {
  const columns = getTableInfo(table);

  const primaryKey = columns.find(
    (column) =>
      column.pk === 1 &&
      String(column.type || "").toUpperCase() === "INTEGER"
  );

  if (!primaryKey) return;

  const column = quoteIdent(primaryKey.name);

  const result = await client.query(
    `SELECT MAX(${column}) AS max_id FROM ${quoteIdent(table)}`
  );

  const maxId = result.rows[0].max_id;

  if (maxId === null || maxId === undefined) return;

  try {
    await client.query(
      `SELECT setval(
        pg_get_serial_sequence($1, $2),
        $3,
        true
      )`,
      [table, primaryKey.name, Number(maxId)]
    );
  } catch {
    // Table has no PostgreSQL sequence.
  }
}

async function verifyCounts() {
  console.log("\n======================================");
  console.log("VERIFYING RECORD COUNTS");
  console.log("======================================");

  let failed = false;

  for (const table of tables) {
    const sqliteCount = sqlite
      .prepare(
        `SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`
      )
      .get().count;

    const postgresResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM ${quoteIdent(table)}`
    );

    const postgresCount = postgresResult.rows[0].count;

    const ok =
      Number(sqliteCount) === Number(postgresCount);

    console.log(
      `${ok ? "OK " : "BAD"} ${table}: SQLite=${sqliteCount} PostgreSQL=${postgresCount}`
    );

    if (!ok) {
      failed = true;
    }
  }

  if (failed) {
    throw new Error("Record count verification failed.");
  }

  console.log("\nALL RECORD COUNTS MATCH.");
}

async function main() {
  console.log("======================================");
  console.log("FLEET ERP SQLITE -> POSTGRES");
  console.log("SAFE FULL DATA MIGRATION");
  console.log("======================================");

  await client.connect();

  console.log("PostgreSQL connection OK.");

  try {
    await client.query("BEGIN");

    await dropTargetTables();

    console.log("\nCreating PostgreSQL tables...");

    for (const table of tables) {
      await createTable(table);
      console.log(`Table ready: ${table}`);
    }

    console.log("\nCopying SQLite data...");

    for (const table of tables) {
      await insertRows(table);
    }

    console.log("\nResetting ID sequences...");

    for (const table of tables) {
      await resetSequence(table);
    }

    await verifyCounts();

    await client.query("COMMIT");

    console.log("\n======================================");
    console.log("MIGRATION COMPLETED SUCCESSFULLY");
    console.log("======================================");
    console.log("SQLite database was NOT modified.");
    console.log("All record counts match.");
  } catch (error) {
    console.error("\nMIGRATION FAILED.");
    console.error(error);

    try {
      await client.query("ROLLBACK");
      console.log("ROLLBACK completed. Neon was not changed.");
    } catch (rollbackError) {
      console.error("ROLLBACK ERROR:", rollbackError);
    }

    process.exitCode = 1;
  } finally {
    sqlite.close();
    await client.end();
  }
}

main();

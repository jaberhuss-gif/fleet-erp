import { query } from "./server/postgres.js";

const r = await query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`);

let last = "";

for (const x of r.rows) {
  if (x.table_name !== last) {
    console.log("");
    console.log("### " + x.table_name);
    last = x.table_name;
  }

  console.log(x.column_name + " | " + x.data_type);
}

process.exit(0);

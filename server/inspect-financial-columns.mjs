import { query } from "./postgres.js";

for (const t of ["work_orders", "projects", "purchases"]) {
  const r = await query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
    [t]
  );

  console.log("\n===== " + t + " =====");
  console.table(r.rows);
}

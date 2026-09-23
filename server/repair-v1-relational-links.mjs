import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const APPLY = process.argv.includes("--apply");
await client.connect();

async function exists(table, column = null) {
  const q = column
    ? "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2"
    : "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1";
  return (await client.query(q, column ? [table, column] : [table])).rowCount > 0;
}
async function constraintExists(name) {
  return (await client.query(
    "SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.conname=$1",
    [name]
  )).rowCount > 0;
}
async function orphanCount(table, column, targetTable) {
  const q = 'SELECT COUNT(*)::int AS c FROM public."' + table + '" child LEFT JOIN public."' +
    targetTable + '" parent ON parent.id=child."' + column + '" WHERE child."' + column + '" IS NOT NULL AND parent.id IS NULL';
  return Number((await client.query(q)).rows[0].c);
}

console.log("V1/Neon relational-link repair");
console.log(APPLY ? "APPLY mode" : "DRY-RUN mode");

if (!(await exists("vehicles")) || !(await exists("drivers"))) throw new Error("vehicles/drivers table missing");

if (!(await exists("vehicles", "driver_id"))) {
  console.log("Missing vehicles.driver_id");
  if (APPLY) {
    await client.query("ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS driver_id BIGINT");
    console.log("Added vehicles.driver_id");
  }
}

if (await exists("drivers", "vehicle_id") && await exists("vehicles", "driver_id")) {
  const dup = await client.query(
    "SELECT vehicle_id, COUNT(*)::int AS driver_count FROM public.drivers WHERE vehicle_id IS NOT NULL GROUP BY vehicle_id HAVING COUNT(*)>1 ORDER BY vehicle_id"
  );
  if (dup.rowCount) {
    console.log("Vehicles with multiple legacy driver assignments:");
    console.table(dup.rows);
  }

  const before = await client.query("SELECT COUNT(*)::int AS c FROM public.vehicles WHERE driver_id IS NOT NULL");
  if (APPLY) {
    await client.query(
      "UPDATE public.vehicles v SET driver_id=d.id, updated_at=CURRENT_TIMESTAMP FROM public.drivers d WHERE d.vehicle_id=v.id AND v.driver_id IS NULL"
    );
  }
  const after = await client.query("SELECT COUNT(*)::int AS c FROM public.vehicles WHERE driver_id IS NOT NULL");
  console.log("vehicles linked: before=" + before.rows[0].c + ", after=" + after.rows[0].c);
}

if (await exists("vehicles", "driver_id") && !(await constraintExists("fk_vehicles_driver_id"))) {
  const orphans = await orphanCount("vehicles", "driver_id", "drivers");
  if (APPLY && orphans === 0) {
    await client.query(
      "ALTER TABLE public.vehicles ADD CONSTRAINT fk_vehicles_driver_id FOREIGN KEY(driver_id) REFERENCES public.drivers(id) ON UPDATE CASCADE ON DELETE SET NULL"
    );
    console.log("Added FK vehicles.driver_id -> drivers.id");
  } else {
    console.log("vehicles.driver_id FK: " + (orphans ? orphans + " orphan references" : "ready to add"));
  }
}

const links = [
  ["vehicles","sites","site_id","fk_vehicles_site_id"],
  ["km_records","vehicles","vehicle_id","fk_km_records_vehicle_id"],
  ["tickets","vehicles","vehicle_id","fk_tickets_vehicle_id"],
  ["work_orders","vehicles","vehicle_id","fk_work_orders_vehicle_id"],
  ["periodic_maintenance","vehicles","vehicle_id","fk_periodic_maintenance_vehicle_id"]
];

const report = [];
for (const [child,parent,column,constraint] of links) {
  if (!(await exists(child)) || !(await exists(parent)) || !(await exists(child,column))) continue;
  const orphans = await orphanCount(child,column,parent);
  const present = await constraintExists(constraint);
  report.push({ child, column, parent, orphans, fk: present });
  if (APPLY && !present && orphans === 0) {
    const sql = 'ALTER TABLE public."' + child + '" ADD CONSTRAINT "' + constraint +
      '" FOREIGN KEY("' + column + '") REFERENCES public."' + parent + '"(id) ON UPDATE CASCADE ON DELETE SET NULL';
    await client.query(sql);
    console.log("Added FK " + child + "." + column + " -> " + parent + ".id");
  }
}
console.table(report);
if (!APPLY) console.log("No database changes were made. Use --apply after reviewing the audit.");
await client.end();

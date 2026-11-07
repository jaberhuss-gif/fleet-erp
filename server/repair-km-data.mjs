// One-off repair for the three data faults found during the KM investigation.
//
//   1. Driver phones stored without the leading zero (breaks wa.me and WhatsApp).
//   2. The 2349 EUA odometer poisoned at 3,058,876 km — an impossible value that the
//      old Math.max logic could never correct.
//   3. Mehtab's two driver records (ids 20 and 35, same phone) presenting one person
//      as two.
//
// Dry-run by default: it prints what it would do and writes nothing. Pass --apply to
// commit the changes. Nothing here touches the Google Sheet; the sheet is evidence only.
//
//   node repair-km-data.mjs            # inspect
//   node repair-km-data.mjs --apply    # commit

import "dotenv/config";
import pg from "pg";
import { normalizeSaudiPhone } from "./phone.js";

const APPLY = process.argv.includes("--apply");
const IMPOSSIBLE_KM = 1000000; // no vehicle in this fleet legitimately exceeds 1,000,000 km

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const log = (...a) => console.log(...a);
const plan = [];
const record = (action, table, id, detail, sql, params) =>
  plan.push({ action, table, id, detail, sql, params });

async function inspectPhones(client) {
  const { rows } = await client.query(`
    SELECT id, name, phone FROM drivers WHERE COALESCE(phone, '') <> '' ORDER BY id
  `);

  let changed = 0;
  for (const d of rows) {
    const fixed = normalizeSaudiPhone(d.phone);
    if (fixed && fixed !== d.phone) {
      changed += 1;
      log(`  phone  driver #${d.id} ${d.name}: "${d.phone}" -> "${fixed}"`);
      record("normalize-phone", "drivers", d.id, `${d.name}: ${d.phone} -> ${fixed}`,
        `UPDATE drivers SET phone = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [fixed, d.id]);
      // vehicles caches the driver phone for display and for the driver portal match.
      record("normalize-phone", "vehicles", d.id, `${d.name} cached phone`,
        `UPDATE vehicles SET phone = $1, updated_at = CURRENT_TIMESTAMP WHERE driver_id = $2`,
        [fixed, d.id]);
    }
  }
  log(`  drivers needing a phone fix: ${changed}`);

  // users.phone drives the driver portal login match, so it must agree too.
  const users = await client.query(`
    SELECT id, username, phone FROM users WHERE COALESCE(phone, '') <> '' AND role = 'Driver'
  `);
  for (const u of users.rows) {
    const fixed = normalizeSaudiPhone(u.phone);
    if (fixed && fixed !== u.phone) {
      log(`  phone  user #${u.id} ${u.username}: "${u.phone}" -> "${fixed}"`);
      record("normalize-phone", "users", u.id, `${u.username}: ${u.phone} -> ${fixed}`,
        `UPDATE users SET phone = $1 WHERE id = $2`, [fixed, u.id]);
    }
  }
}

async function inspectOdometer(client) {
  const { rows } = await client.query(`
    SELECT id, plate_number, plate_code, current_km FROM vehicles
    WHERE current_km > $1 ORDER BY plate_number
  `, [IMPOSSIBLE_KM]);

  if (!rows.length) {
    log("  no impossible odometer values found");
    return;
  }

  for (const v of rows) {
    const plate = `${v.plate_number} ${v.plate_code}`.trim();
    log(`  odometer  ${plate} (#${v.id}): ${Number(v.current_km).toLocaleString()} km is impossible`);

    record("purge-impossible-history", "km_records", v.id,
      `${plate}: delete reading_km > ${IMPOSSIBLE_KM}`,
      `DELETE FROM km_records WHERE vehicle_id = $1 AND reading_km > $2`,
      [v.id, IMPOSSIBLE_KM]);

    // Rebuild the odometer from the newest remaining dated reading.
    const latest = await client.query(`
      SELECT reading_km, reading_date FROM km_records
      WHERE vehicle_id = $1 AND reading_km <= $2
      ORDER BY reading_date DESC, id DESC LIMIT 1
    `, [v.id, IMPOSSIBLE_KM]);

    if (latest.rows[0]) {
      const truth = Number(latest.rows[0].reading_km);
      log(`    -> corrected to ${truth.toLocaleString()} km (newest real reading ${latest.rows[0].reading_date})`);
      record("correct-odometer", "vehicles", v.id,
        `${plate}: ${Number(v.current_km).toLocaleString()} -> ${truth.toLocaleString()}`,
        `UPDATE vehicles SET current_km = $1, meter_updated_at = $2::timestamptz,
           updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [truth, latest.rows[0].reading_date, v.id]);
    } else {
      log("    -> no valid history remains; odometer must be entered manually");
    }
  }
}

async function inspectDuplicates(client) {
  // One person may legitimately hold several vehicles. Because `drivers.vehicle_id` is a
  // single-valued column, the schema can only express "one person, two vehicles" as two
  // driver rows. Mehtab (ids 20 and 35) is exactly that, so the rows must NOT be deleted:
  // removing #35 would orphan vehicle 5456 TKA.
  //
  // The honest fix is to make the two rows read as the same human — one phone, one name —
  // so reports and WhatsApp stop treating him as two people. A true single-row merge would
  // require moving to a many-to-many driver/vehicle table, which is a schema change and is
  // deliberately left for the user to approve.
  const { rows } = await client.query(`
    SELECT id, name, phone, vehicle_id, status
    FROM drivers WHERE COALESCE(phone, '') <> '' ORDER BY phone, id
  `);

  const byPhone = new Map();
  for (const d of rows) {
    const key = normalizeSaudiPhone(d.phone) || d.phone;
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key).push(d);
  }

  const canonicalNames = JSON.parse(process.env.UNIFY_DRIVER_NAMES || "{}");

  for (const [phone, group] of byPhone) {
    if (group.length < 2) continue;
    const names = [...new Set(group.map((g) => g.name))];
    log(`  multi-vehicle  ${phone}: ${group.length} records — ${names.join(" / ")}`);

    if (names.length === 1) {
      log("    -> same name on every row; already reads as one person");
      continue;
    }

    const canonical = canonicalNames[phone];
    if (!canonical) {
      log("    -> names differ; no canonical name configured, left untouched");
      log(`       set UNIFY_DRIVER_NAMES='{"${phone}":"Mehtab"}' to standardise them`);
      continue;
    }

    log(`    -> standardising name to "${canonical}" (both vehicle links preserved)`);
    for (const d of group) {
      if (d.name !== canonical) {
        record("unify-driver-name", "drivers", d.id, `"${d.name}" -> "${canonical}"`,
          `UPDATE drivers SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [canonical, d.id]);
      }
      // The cached copy on the vehicle is what the fleet screens and the driver portal
      // read, so it has to carry the canonical spelling even when the driver row above
      // was already correct.
      record("unify-driver-name", "vehicles", d.id, `cached driver name for vehicle #${d.vehicle_id}`,
        `UPDATE vehicles SET driver = $1, updated_at = CURRENT_TIMESTAMP WHERE driver_id = $2`,
        [canonical, d.id]);
    }
  }
}

async function main() {
  const client = await pool.connect();
  try {
    log(`\n=== KM data repair (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

    log("[1] Driver phone normalisation");
    await inspectPhones(client);

    log("\n[2] Impossible odometer values");
    await inspectOdometer(client);

    log("\n[3] Duplicate driver records");
    await inspectDuplicates(client);

    log(`\n=== ${plan.length} change(s) planned ===`);

    if (!APPLY) {
      log("\nDry run complete. Nothing was written. Re-run with --apply to commit.");
      return;
    }

    await client.query("BEGIN");
    try {
      for (const step of plan) {
        await client.query(step.sql, step.params);
        log(`  applied ${step.action} ${step.table}#${step.id} — ${step.detail}`);
      }
      await client.query("COMMIT");
      log(`\nCommitted ${plan.length} change(s).`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("repair failed:", error.message);
  process.exit(1);
});

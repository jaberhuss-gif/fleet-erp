import { query } from "../postgres.js";
import { v2Query, v2Transaction } from "./db.js";

const MARKER = "legacy-main-to-v2-complete-v2";

function s(v) { return v == null ? "" : String(v).trim(); }
function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function date(v) { return v == null || v === "" ? null : v; }

async function tableExists(name) {
  const r = await query("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS ok", [name]);
  return !!r.rows[0]?.ok;
}

async function cols(name) {
  const r = await query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [name]);
  return new Set(r.rows.map(x => x.column_name));
}

async function rows(name) {
  if (!(await tableExists(name))) return [];
  return (await query(`SELECT * FROM "${name}"`)).rows;
}

export async function migrateLegacyToV2() {
  await v2Query(`CREATE TABLE IF NOT EXISTS fleet_erp_v2.migration_runs (
    id BIGSERIAL PRIMARY KEY, marker TEXT UNIQUE NOT NULL, completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details JSONB
  )`);

  const already = await v2Query("SELECT 1 FROM fleet_erp_v2.migration_runs WHERE marker=$1 LIMIT 1", [MARKER]);
  if (already.rowCount) return { skipped: true, marker: MARKER };

  // Prevent two Render instances from migrating simultaneously.
  await v2Query("SELECT pg_advisory_xact_lock(hashtext($1))", [MARKER]);
  try {
    const check = await v2Query("SELECT 1 FROM fleet_erp_v2.migration_runs WHERE marker=$1 LIMIT 1", [MARKER]);
    if (check.rowCount) return { skipped: true, marker: MARKER };

    const counts = {};

    // Users/auth fields: preserve the existing password hash when the legacy DB has one.
    await v2Query("ALTER TABLE fleet_erp_v2.users ADD COLUMN IF NOT EXISTS password_hash TEXT");
    if (await tableExists("users")) {
      const rs = await rows("users");
      for (const r of rs) {
        const username = s(r.username || r.user_name || r.email || `legacy-${r.id}`);
        if (!username) continue;
        const role = ["Owner","GM","Accountant","CampusManager","Driver","SupportManager","SSM","FleetSupervisor","FleetViewer"].includes(s(r.role)) ? s(r.role) : "Driver";
        await v2Query(`INSERT INTO fleet_erp_v2.users
          (legacy_user_id,username,full_name,role,is_active,password_hash)
          VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(username) DO UPDATE SET
            full_name=EXCLUDED.full_name, role=EXCLUDED.role, is_active=EXCLUDED.is_active,
            password_hash=COALESCE(EXCLUDED.password_hash,fleet_erp_v2.users.password_hash)`,
          [r.id ?? null, username, s(r.full_name || r.name || username), role, r.is_active !== false, r.password_hash || r.password || null]);
      }
      counts.users = rs.length;
    }

    // Sites.
    if (await tableExists("sites")) {
      for (const r of await rows("sites")) {
        const code = s(r.code || r.site_code || `LEGACY-${r.id}`);
        const name = s(r.name || r.site || code);
        if (!name) continue;
        await v2Query(`INSERT INTO fleet_erp_v2.sites(code,name,region,campus_manager,phone,status)
          VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(name) DO UPDATE SET code=COALESCE(EXCLUDED.code,fleet_erp_v2.sites.code),
          region=EXCLUDED.region,campus_manager=EXCLUDED.campus_manager,phone=EXCLUDED.phone,status=EXCLUDED.status`,
          [code, name, s(r.region), s(r.campus_manager), s(r.phone), s(r.status) || "Active"]);
      }
      counts.sites = (await rows("sites")).length;
    }

    // Drivers.
    if (await tableExists("drivers")) {
      for (const r of await rows("drivers")) {
        const name = s(r.full_name || r.name || r.driver_name);
        if (!name) continue;
        const emp = s(r.employee_no || r.employee_id || `LEGACY-${r.id}`);
        await v2Query(`INSERT INTO fleet_erp_v2.drivers(employee_no,full_name,phone,status)
          VALUES($1,$2,$3,$4)
          ON CONFLICT(employee_no) DO UPDATE SET full_name=EXCLUDED.full_name,phone=EXCLUDED.phone,status=EXCLUDED.status`,
          [emp, name, s(r.phone || r.mobile), s(r.status) || "Active"]);
      }
      counts.drivers = (await rows("drivers")).length;
    }

    // Vehicles.
    if (await tableExists("vehicles")) {
      for (const r of await rows("vehicles")) {
        const plate = s(r.plate_number || r.plate || r.registration_no);
        if (!plate) continue;
        const code = s(r.plate_code || r.code).toUpperCase();
        let driverId = null;
        const dn = s(r.driver || r.driver_name);
        const dp = s(r.phone || r.driver_phone);
        if (dn) {
          const d = await v2Query("SELECT id FROM fleet_erp_v2.drivers WHERE lower(full_name)=lower($1) AND COALESCE(phone,'')=$2 ORDER BY id LIMIT 1", [dn, dp]);
          driverId = d.rows[0]?.id || null;
        }
        await v2Query(`INSERT INTO fleet_erp_v2.vehicles
          (legacy_vehicle_id,plate_number,plate_code,make,model,year,legacy_location,legacy_driver_name,legacy_driver_phone,
           current_km,last_oil_km,oil_interval_km,last_oil_change_date,meter_updated_at,status,notes,driver_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          ON CONFLICT(legacy_vehicle_id) DO UPDATE SET
            plate_number=EXCLUDED.plate_number,plate_code=EXCLUDED.plate_code,make=EXCLUDED.make,model=EXCLUDED.model,
            year=EXCLUDED.year,legacy_location=EXCLUDED.legacy_location,legacy_driver_name=EXCLUDED.legacy_driver_name,
            legacy_driver_phone=EXCLUDED.legacy_driver_phone,current_km=GREATEST(fleet_erp_v2.vehicles.current_km,EXCLUDED.current_km),
            last_oil_km=EXCLUDED.last_oil_km,oil_interval_km=EXCLUDED.oil_interval_km,last_oil_change_date=EXCLUDED.last_oil_change_date,
            meter_updated_at=EXCLUDED.meter_updated_at,status=EXCLUDED.status,notes=EXCLUDED.notes,driver_id=EXCLUDED.driver_id,
            updated_at=CURRENT_TIMESTAMP`,
          [r.id ?? null, plate, code, s(r.make), s(r.model), r.year ? n(r.year) : null, s(r.location), dn, dp,
           n(r.current_km ?? r.currentKM), n(r.last_oil_km ?? r.lastOilKm), n(r.oil_change_interval ?? r.oilInterval,5000),
           date(r.last_oil_change_date), r.meter_updated_at || null, s(r.status) || "Active", s(r.notes), driverId]);
      }
      counts.vehicles = (await rows("vehicles")).length;
    }

    // KM history. This also brings today's readings into V2 immediately.
    if (await tableExists("km_records")) {
      for (const r of await rows("km_records")) {
        const plate = s(r.plate);
        const v = await v2Query("SELECT id FROM fleet_erp_v2.vehicles WHERE legacy_vehicle_id=$1 OR (plate_number=$2 AND plate_code=$3) LIMIT 1",
          [r.vehicle_id ?? null, plate.split(/\\s+/)[0] || "", plate.split(/\\s+/).slice(1).join(" ").toUpperCase()]);
        const vehicleId = v.rows[0]?.id;
        if (!vehicleId || !r.reading_date) continue;
        await v2Query(`INSERT INTO fleet_erp_v2.km_readings(vehicle_id,reading_km,reading_date,notes)
          VALUES($1,$2,$3,$4)
          ON CONFLICT(vehicle_id,reading_date) DO UPDATE SET
            reading_km=GREATEST(fleet_erp_v2.km_readings.reading_km,EXCLUDED.reading_km),notes=EXCLUDED.notes`,
          [vehicleId, n(r.reading_km), r.reading_date, s(r.notes)]);
      }
      counts.km_records = (await rows("km_records")).length;
    }

    // Building/fleet work orders.
    if (await tableExists("work_orders")) {
      for (const r of await rows("work_orders")) {
        const contractor = s(r.contractor_name);
        const site = await v2Query("SELECT id FROM fleet_erp_v2.sites WHERE lower(name)=lower($1) OR code=$1 LIMIT 1", [s(r.site)]);
        const siteId = site.rows[0]?.id || null;
        const vehicleId = r.vehicle_id ? (await v2Query("SELECT id FROM fleet_erp_v2.vehicles WHERE legacy_vehicle_id=$1 LIMIT 1",[r.vehicle_id])).rows[0]?.id || null : null;
        await v2Query(`INSERT INTO fleet_erp_v2.maintenance_work_orders
          (wo_no,vehicle_id,site_id,category,priority,description,status,reported_date,completion_date,contractor_name,
           contractor_cost,internal_labor_cost,closing_notes,created_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT(wo_no) DO UPDATE SET vehicle_id=EXCLUDED.vehicle_id,site_id=EXCLUDED.site_id,category=EXCLUDED.category,
          priority=EXCLUDED.priority,description=EXCLUDED.description,status=EXCLUDED.status,reported_date=EXCLUDED.reported_date,
          completion_date=EXCLUDED.completion_date,contractor_name=EXCLUDED.contractor_name,contractor_cost=EXCLUDED.contractor_cost,
          internal_labor_cost=EXCLUDED.internal_labor_cost,closing_notes=EXCLUDED.closing_notes`,
          [s(r.wo_no || `WO-${r.id}`),vehicleId,siteId,s(r.category),s(r.priority)||"Medium",s(r.description),
           s(r.status)||"Open",date(r.reported_date),date(r.completed_date),contractor,n(r.contractor_cost ?? r.final_cost),
           n(r.labor_cost),s(r.closing_notes),r.created_at || new Date()]);
      }
      counts.work_orders = (await rows("work_orders")).length;
    }

    // Development/projects.
    if (await tableExists("projects")) {
      for (const r of await rows("projects")) {
        const site = await v2Query("SELECT id FROM fleet_erp_v2.sites WHERE lower(name)=lower($1) OR code=$1 LIMIT 1",[s(r.site)]);
        const siteId = site.rows[0]?.id || null;
        const contractor = s(r.contractor);
        const spent = n(r.spent);
        await v2Query(`INSERT INTO fleet_erp_v2.projects(project_no,site_id,description,start_date,end_date,status,contractor,contractor_cost,internal_labor_cost)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT(project_no) DO UPDATE SET site_id=EXCLUDED.site_id,description=EXCLUDED.description,start_date=EXCLUDED.start_date,
          end_date=EXCLUDED.end_date,status=EXCLUDED.status,contractor=EXCLUDED.contractor,contractor_cost=EXCLUDED.contractor_cost,
          internal_labor_cost=EXCLUDED.internal_labor_cost`,
          [s(r.project_no || `PRJ-${r.id}`),siteId,s(r.description || r.name),date(r.start_date),date(r.end_date),s(r.status)||"Planned",
           contractor,contractor && contractor.toLowerCase()!=="internal" && contractor.toLowerCase()!=="company" ? spent : 0,
           contractor && contractor.toLowerCase()!=="internal" && contractor.toLowerCase()!=="company" ? 0 : spent]);
      }
      counts.projects = (await rows("projects")).length;
    }

    // Purchases.
    if (await tableExists("purchases")) {
      for (const r of await rows("purchases")) {
        const ref = s(r.reference_no);
        await v2Query(`INSERT INTO fleet_erp_v2.maintenance_purchases
          (legacy_purchase_ref,item_name,quantity,unit_cost,supplier_type,supplier_name,purchase_date)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(legacy_purchase_ref) DO UPDATE SET item_name=EXCLUDED.item_name,quantity=EXCLUDED.quantity,unit_cost=EXCLUDED.unit_cost,supplier_type=EXCLUDED.supplier_type,supplier_name=EXCLUDED.supplier_name,purchase_date=EXCLUDED.purchase_date`,
          [s(r.purchase_no||r.reference_no||`LEGACY-PURCHASE-${r.id}`),s(r.item_name),n(r.quantity,1),n(r.unit_cost),s(r.purchased_by)||"Company",s(r.supplier),date(r.purchase_date)]);
      }
      counts.purchases = (await rows("purchases")).length;
    }

    // Tickets.
    if (await tableExists("tickets")) {
      for (const r of await rows("tickets")) {
        const v = r.vehicle_id ? (await v2Query("SELECT id FROM fleet_erp_v2.vehicles WHERE legacy_vehicle_id=$1 LIMIT 1",[r.vehicle_id])).rows[0]?.id || null : null;
        await v2Query(`INSERT INTO fleet_erp_v2.tickets(legacy_ticket_ref,title,category,priority,status,vehicle_id,description,opened_at,closed_at,resolution_notes)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(legacy_ticket_ref) DO UPDATE SET title=EXCLUDED.title,category=EXCLUDED.category,priority=EXCLUDED.priority,status=EXCLUDED.status,vehicle_id=EXCLUDED.vehicle_id,description=EXCLUDED.description,opened_at=EXCLUDED.opened_at,closed_at=EXCLUDED.closed_at,resolution_notes=EXCLUDED.resolution_notes`,
          [s(r.ticket_no||r.ticket_number||`LEGACY-TICKET-${r.id}`),s(r.title || r.subject || r.description).slice(0,500),s(r.category),s(r.priority)||"Medium",s(r.status)||"Open",v,
           s(r.description),r.opened_at || r.created_at || new Date(),r.closed_at || null,s(r.resolution_notes)]);
      }
      counts.tickets = (await rows("tickets")).length;
    }

    await v2Transaction(async client => {
      await client.query("INSERT INTO fleet_erp_v2.migration_runs(marker,details) VALUES($1,$2)", [MARKER, JSON.stringify(counts)]);
    });
    return { skipped: false, marker: MARKER, counts };
  } finally {
    await v2Query("SELECT pg_advisory_unlock(hashtext($1))", [MARKER]).catch(() => {});
  }
}

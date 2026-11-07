import { query as pgQuery } from './postgres.js';

const VELA_BASE = 'https://fleet-erp-vela.onrender.com';

async function getJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(VELA_BASE + path, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Vela HTTP ${response.status} for ${path}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`Invalid Vela response for ${path}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v) {
  return v == null ? null : String(v).trim() || null;
}
function date(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function syncBuildingFromVelaOnce() {
  if (String(process.env.SYNC_BUILDING_FROM_VELA || '').toLowerCase() !== 'true') return;

  await pgQuery(`
    CREATE TABLE IF NOT EXISTS building_vela_sync_runs (
      id SERIAL PRIMARY KEY,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      work_orders_count INTEGER DEFAULT 0,
      projects_count INTEGER DEFAULT 0,
      purchases_count INTEGER DEFAULT 0
    )
  `);

  const already = await pgQuery('SELECT id FROM building_vela_sync_runs ORDER BY id DESC LIMIT 1');
  if (already.rows.length) {
    console.log('[VelaBuildingSync] already completed; skipping');
    return;
  }

  console.log('[VelaBuildingSync] downloading authoritative Vela building data...');
  const [sites, workOrders, projects, purchases] = await Promise.all([
    getJson('/api/buildings/sites'),
    getJson('/api/buildings/work-orders'),
    getJson('/api/buildings/dev-projects'),
    getJson('/api/buildings/purchases')
  ]);

  await pgQuery('BEGIN');
  try {
    // Replace the Building Maintenance dataset only. Fleet vehicles/KM/oil/tires/tickets are untouched.
    await pgQuery('DELETE FROM project_items');
    await pgQuery('DELETE FROM work_order_items');
    await pgQuery('DELETE FROM work_orders');
    await pgQuery('DELETE FROM projects');
    await pgQuery('DELETE FROM purchases');

    const siteMap = new Map();
    for (const s of sites) {
      const name = str(s.name);
      if (!name) continue;
      siteMap.set(String(s.id), name);
    }

    for (const wo of workOrders) {
      const woNo = str(wo.wo_no) || `WO-${wo.id}`;
      const finalCost = num(wo.final_cost ?? wo.total_cost);
      const contractorCost = num(wo.contractor_cost);
      const laborCost = num(wo.labor_cost);
      const partsCost = num(wo.parts_cost);
      const isContractor = num(wo.is_contractor) || (wo.contractor_name ? 1 : 0);
      await pgQuery(`
        INSERT INTO work_orders
          (wo_no, site, area, category, priority, description, assigned_to,
           is_contractor, contractor_name, performed_by, status, reported_date,
           completed_date, final_cost, contractor_cost, labor_cost, parts_cost,
           closing_notes, parts_used, month, year, created_at, updated_at)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13::date,
           $14::numeric,$15::numeric,$16::numeric,$17::numeric,$18,$19,$20,$21,
           COALESCE($12::date,CURRENT_DATE),CURRENT_TIMESTAMP)
      `, [
        woNo, str(wo.site) || siteMap.get(String(wo.site_id)) || null, str(wo.area),
        str(wo.category), str(wo.priority) || 'Normal', str(wo.description),
        str(wo.assigned_to), isContractor, str(wo.contractor_name || wo.contractor),
        str(wo.performed_by || wo.work_by), str(wo.status) || 'Open',
        date(wo.reported_date || wo.created_at), date(wo.completed_date || wo.closed_at),
        finalCost, contractorCost, laborCost, partsCost, str(wo.closing_notes),
        str(wo.parts_used), str(wo.month), str(wo.year)
      ]);
    }

    for (const p of projects) {
      const id = String(p.id ?? '').trim();
      if (!id) continue;
      const projectNo = str(p.project_no) || `PRJ-${id.padStart(4, '0')}`;
      const total = num(p.total_cost ?? p.final_cost ?? p.spent);
      const status = str(p.status) || 'Active';
      const completed = status.toLowerCase() === 'completed' ? date(p.completed_date || p.updated_at || p.end_date) : null;
      const contractor = str(p.contractor || p.contractor_name);
      const workBy = str(p.work_by || p.performed_by);
      const isContractor = num(p.is_contractor) || (workBy && workBy.toLowerCase() === 'contractor' ? 1 : contractor ? 1 : 0);
      await pgQuery(`
        INSERT INTO projects
          (project_no,name,description,site,project_type,status,budget,spent,start_date,end_date,
           manager,contractor,month,year,notes,final_cost,is_contractor,contractor_name,
           performed_by,completed_date,closing_notes,created_at,updated_at)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7::numeric,$8::numeric,$9::date,$10::date,$11,$12,$13,$14,$15,
           $16::numeric,$17,$18,$19,$20::date,$21,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `, [
        projectNo, str(p.name) || projectNo, str(p.description), siteMap.get(String(p.site_id)) || str(p.site) || 'Unassigned',
        str(p.project_type) || 'Development', status, num(p.budget), total,
        date(p.start_date || p.created_at), date(p.end_date), str(p.manager),
        contractor, str(p.month), str(p.year), str(p.notes), total, isContractor,
        str(p.contractor_name || contractor), workBy, completed, str(p.closing_notes)
      ]);
    }

    for (const p of purchases) {
      const purchaseNo = str(p.purchase_id || p.purchase_no) || `PUR-${p.id}`;
      const total = num(p.total_cost ?? p.final_cost ?? num(p.quantity) * num(p.unit_cost));
      const status = str(p.status) || 'Closed';
      const isContractor = num(p.is_contractor) || (str(p.source)?.toLowerCase() === 'contractor' ? 1 : 0);
      await pgQuery(`
        INSERT INTO purchases
          (purchase_no,type,reference_no,item_name,quantity,unit_cost,total_cost,supplier,purchased_by,
           purchase_date,month,year,notes,status,final_cost,is_contractor,contractor_name,
           performed_by,completed_date,closing_notes,created_at)
        VALUES
          ($1,$2,$3,$4,$5::numeric,$6::numeric,$7::numeric,$8,$9,$10::date,$11,$12,$13,$14,
           $15::numeric,$16,$17,$18,$19::date,$20,CURRENT_TIMESTAMP)
      `, [
        purchaseNo, str(p.type), str(p.reference_id || p.reference_no), str(p.item_name || p.item),
        num(p.quantity || 1), num(p.unit_cost), total, str(p.supplier),
        str(p.purchased_by || p.source || 'Company'), date(p.purchase_date || p.created_at),
        str(p.month), str(p.year), str(p.notes), status, total, isContractor,
        str(p.contractor_name), str(p.performed_by || p.purchased_by), date(p.completed_date || p.purchase_date),
        str(p.closing_notes)
      ]);
    }

    await pgQuery(
      'INSERT INTO building_vela_sync_runs (work_orders_count, projects_count, purchases_count) VALUES ($1,$2,$3)',
      [workOrders.length, projects.length, purchases.length]
    );

    await pgQuery('COMMIT');
    console.log(`[VelaBuildingSync] replaced Building Maintenance with Vela: WO=${workOrders.length}, Projects=${projects.length}, Purchases=${purchases.length}`);
  } catch (e) {
    await pgQuery('ROLLBACK');
    throw e;
  }
}

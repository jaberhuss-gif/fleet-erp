import { query as pgQuery } from './postgres.js';

(async () => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch('https://fleet-erp-vela.onrender.com/api/buildings/dev-projects', {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Vela HTTP ${response.status}`);
    const projects = await response.json();
    if (!Array.isArray(projects)) throw new Error('Invalid Vela projects response');

    let updated = 0;
    for (const p of projects) {
      const amount = Number(p.total_cost ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const id = String(p.id ?? '').trim();
      if (!id) continue;
      const candidates = [
        `PRJ-${id.padStart(4, '0')}`,
        `PRJ${id.padStart(3, '0')}`,
        `PRJ${id.padStart(4, '0')}`
      ];
      const result = await pgQuery(
        `UPDATE projects
         SET spent = $1::numeric,
             final_cost = $1::numeric,
             contractor = COALESCE(NULLIF($2::text, ''), contractor),
             updated_at = CURRENT_TIMESTAMP
         WHERE project_no = ANY($3::text[])`,
        [amount, String(p.contractor || ''), candidates]
      );
      updated += result.rowCount || 0;
    }
    console.log(`[VelaProjectSync] updated ${updated} project amount(s) from Vela`);
  } catch (e) {
    console.error('[VelaProjectSync] failed:', e.message);
  }
})();

import { query } from './postgres.js';

async function ensureSchema() {
  await query(`CREATE TABLE IF NOT EXISTS integration_settings (
    integration_key TEXT PRIMARY KEY,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await query(`CREATE TABLE IF NOT EXISTS integration_audit_log (
    id BIGSERIAL PRIMARY KEY,
    integration_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'recorded',
    username TEXT,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_integration_audit_created ON integration_audit_log (integration_key, created_at DESC)');
}

function ownerOnly(req, res) {
  if (req.user?.role !== 'Owner') {
    res.status(403).json({ success: false, message: 'Owner access required.' });
    return false;
  }
  return true;
}

export function mountIntegrationRoutes(app) {
  app.get('/api/integrations/power-automate', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    try {
      await ensureSchema();
      const [setting, log] = await Promise.all([
        query(`SELECT config, updated_at FROM integration_settings WHERE integration_key = 'power_automate' LIMIT 1`),
        query(`SELECT id, event_type, status, username, details, created_at FROM integration_audit_log WHERE integration_key = 'power_automate' ORDER BY created_at DESC LIMIT 100`)
      ]);
      res.json({ success: true, config: setting.rows[0]?.config || { enabled: false, webhookUrl: '', mode: 'manual', notes: '' }, updatedAt: setting.rows[0]?.updated_at || null, logs: log.rows });
    } catch (e) {
      console.error('[PowerAutomate] load failed:', e.message);
      res.status(500).json({ success: false, message: 'Could not load integration settings.' });
    }
  });

  app.put('/api/integrations/power-automate', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    try {
      await ensureSchema();
      const body = req.body || {};
      const mode = ['manual', 'hybrid', 'automated'].includes(body.mode) ? body.mode : 'manual';
      const webhookUrl = String(body.webhookUrl || '').trim();
      if (webhookUrl && !/^https:\/\//i.test(webhookUrl)) {
        return res.status(400).json({ success: false, message: 'Endpoint must use HTTPS.' });
      }
      const config = {
        enabled: Boolean(body.enabled),
        webhookUrl,
        mode,
        notes: String(body.notes || '').slice(0, 4000)
      };
      await query(`INSERT INTO integration_settings (integration_key, config, updated_by, updated_at)
        VALUES ('power_automate', $1::jsonb, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (integration_key) DO UPDATE SET config = EXCLUDED.config, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(config), req.user?.id || null]);
      await query(`INSERT INTO integration_audit_log (integration_key, event_type, status, username, details)
        VALUES ('power_automate', 'settings_saved', 'saved', $1, $2)`,
      [String(req.user?.username || req.user?.fullName || 'Owner'), 'Settings saved; mode=' + mode + '; enabled=' + config.enabled]);
      res.json({ success: true, config });
    } catch (e) {
      console.error('[PowerAutomate] save failed:', e.message);
      res.status(500).json({ success: false, message: 'Could not save integration settings.' });
    }
  });

  app.post('/api/integrations/power-automate/log', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    try {
      await ensureSchema();
      const eventType = String(req.body?.eventType || 'manual_action').slice(0, 120);
      const status = String(req.body?.status || 'recorded').slice(0, 40);
      const details = String(req.body?.details || '').slice(0, 4000);
      await query(`INSERT INTO integration_audit_log (integration_key, event_type, status, username, details)
        VALUES ('power_automate', $1, $2, $3, $4)`,
      [eventType, status, String(req.user?.username || req.user?.fullName || 'Owner'), details]);
      res.json({ success: true, recorded: true });
    } catch (e) {
      console.error('[PowerAutomate] audit write failed:', e.message);
      res.status(500).json({ success: false, message: 'Could not record integration action.' });
    }
  });
}

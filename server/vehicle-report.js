// vehicle-report.js
// تقرير PDF شامل للسيارة (HTML جاهز للطباعة)

const LOGO_URL = "https://pbs.twimg.com/media/G0B19WzaYAIKWy1.png";
const COMPANY_NAME = "Maaden Ivanhoe Electric Exploration and Development Limited Company";
const FOOTER_ROLE = "Fleet Manager / General Maintenance Supervisor";
const FOOTER_NAME = "Hussein Anwar";

function esc(value) {
  return String(value ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(value) {
  if (!value) return '—';
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '—';
}

function fmtNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
}

export function vehicleReportHtml(vehicle, details = {}) {
  const v = vehicle || {};
  const readings = details.readings || [];
  const oilChanges = details.oilChanges || [];
  const handovers = details.handovers || [];
  const stockTransactions = details.stockTransactions || [];
  const inspections = details.inspections || [];
  const tires = details.tires || [];

  const currentKm = Number(v.currentKm ?? v.currentKM ?? 0);
  const lastOilKm = Number(v.lastOilKm ?? v.lastOilKM ?? 0);
  const interval = Number(v.oilChangeInterval ?? 5000);
  const sinceOil = Math.max(0, currentKm - lastOilKm);
  const remaining = Math.max(0, interval - sinceOil);

  // ── Stock Transactions rows
  const stockRows = stockTransactions.length
    ? stockTransactions.map(t => `
        <tr>
          <td>${esc(fmtDate(t.trans_date))}</td>
          <td>${esc(t.type || '-')}</td>
          <td>${esc(t.item_code || '-')}</td>
          <td>${esc(fmtNum(t.quantity))}</td>
          <td>${esc(t.from_location || '-')}</td>
          <td>${esc(t.vehicle_plate || '-')}</td>
          <td>${esc(t.driver_name || '-')}</td>
          <td>${esc(t.reference_no || '-')}</td>
          <td>${esc(t.notes || '-')}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="9" style="text-align:center;color:#15803d;padding:10px">No stock transactions recorded</td></tr>`;

  // ── Handovers rows
  const handoverRows = handovers.length
    ? handovers.map(h => `
        <tr>
          <td>${esc(fmtDate(h.handover_date))}</td>
          <td>${esc(h.new_driver_name || '-')}</td>
          <td>${esc(h.new_driver_phone || '-')}</td>
          <td>${esc(fmtNum(h.km_at_handover))}</td>
          <td>${esc(h.previous_driver_name || '-')}</td>
          <td>${esc(h.notes || '-')}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="6" style="text-align:center;color:#15803d;padding:10px">No driver handovers recorded</td></tr>`;

  // ── Tires rows
  const tireRows = tires.length
    ? tires.map(t => `
        <tr>
          <td>${esc(t.position || '-')}</td>
          <td>${esc(t.brand || '-')}</td>
          <td>${esc(t.size || '-')}</td>
          <td>${esc(t.serial_number || '-')}</td>
          <td>${esc(fmtNum(t.installed_km))}</td>
          <td>${esc(t.condition || '-')}</td>
          <td>${esc(t.status || '-')}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="7" style="text-align:center;color:#15803d;padding:10px">No tire records recorded</td></tr>`;

  // ── Inspections rows
  const inspectionRows = inspections.length
    ? inspections.map(i => `
        <tr>
          <td>${esc(fmtDate(i.scheduled_date))}</td>
          <td>${esc(i.type || '-')}</td>
          <td>${esc(i.status || '-')}</td>
          <td>${esc(i.technician || '-')}</td>
          <td>${esc(i.notes ? String(i.notes).slice(0, 80) : '-')}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="5" style="text-align:center;color:#15803d;padding:10px">No periodic maintenance recorded</td></tr>`;

  // ── Oil Changes rows
  const oilRows = oilChanges.length
    ? oilChanges.slice(0, 5).map(o => `
        <tr>
          <td>${esc(fmtDate(o.oil_change_date))}</td>
          <td>${esc(fmtNum(o.oil_change_km))}</td>
          <td>${esc(o.changed_by || '-')}</td>
          <td>${esc(o.driver_name || '-')}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#15803d;padding:10px">No oil changes recorded</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Vehicle Report — ${esc(v.plate || '')}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #172033; margin: 0; padding: 20px; font-size: 10pt; }
    .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 18px; }
    .header img { width: 90px; height: 50px; object-fit: contain; }
    .header-text { flex: 1; }
    .company-name { font-size: 11pt; font-weight: 700; line-height: 1.2; }
    .company-sub { font-size: 9pt; color: #475569; margin-top: 2px; }
    .manager-name { font-size: 10pt; font-weight: 700; margin-top: 5px; }
    .manager-role { font-size: 8.5pt; color: #475569; }
    h1 { font-size: 18pt; margin: 0 0 4mm; color: #1e3a8a; }
    h2 { font-size: 12pt; margin: 6mm 0 2mm; color: #1e3a8a; border-bottom: 1px solid #cbd5e1; padding-bottom: 2mm; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 4mm; }
    .meta.three { grid-template-columns: repeat(3, 1fr); }
    .meta.four { grid-template-columns: repeat(4, 1fr); }
    .field { border: 1px solid #cbd5e1; padding: 8px; border-radius: 5px; }
    .field-label { font-size: 8pt; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
    .field-value { font-size: 11pt; margin-top: 3px; font-weight: 600; }
    .field-value.warn { color: #dc2626; }
    .field-value.ok { color: #15803d; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-top: 3mm; }
    th, td { border: 1px solid #94a3b8; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #e9eef5; font-weight: 700; }
    .footer { margin-top: 10mm; padding-top: 4mm; border-top: 1px solid #cbd5e1; text-align: right; font-size: 8pt; color: #64748b; }
    @media print { body { margin: 0; padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${LOGO_URL}" alt="Maaden Ivanhoe Electric">
    <div class="header-text">
      <div class="company-name">${esc(COMPANY_NAME)}</div>
      <div class="company-sub">Exploration Phase — Arabian Shield</div>
      <div class="manager-name">${esc(FOOTER_NAME)}</div>
      <div class="manager-role">${esc(FOOTER_ROLE)}</div>
    </div>
  </div>

  <h1>Vehicle Report — ${esc(v.plate || '')}</h1>

  <h2>Vehicle Information</h2>
  <div class="meta four">
    <div class="field"><div class="field-label">Plate</div><div class="field-value">${esc(v.plate || '-')}</div></div>
    <div class="field"><div class="field-label">Make / Model</div><div class="field-value">${esc(v.make || '')} ${esc(v.model || '')}</div></div>
    <div class="field"><div class="field-label">Year</div><div class="field-value">${esc(v.year || '-')}</div></div>
    <div class="field"><div class="field-label">Location</div><div class="field-value">${esc(v.location || '-')}</div></div>
  </div>

  <h2>Driver Information</h2>
  <div class="meta">
    <div class="field"><div class="field-label">Driver Name</div><div class="field-value">${esc(v.driver_name || v.driver || '-')}</div></div>
    <div class="field"><div class="field-label">Phone</div><div class="field-value">${esc(v.driver_phone || v.phone || '-')}</div></div>
  </div>

  <h2>Odometer</h2>
  <div class="meta">
    <div class="field"><div class="field-label">Current ODO</div><div class="field-value">${fmtNum(currentKm)} km</div></div>
    <div class="field"><div class="field-label">Last Update</div><div class="field-value">${esc(fmtDate(v.meter_updated_at))}</div></div>
  </div>

  <h2>Oil Service</h2>
  <div class="meta four">
    <div class="field"><div class="field-label">Last Oil KM</div><div class="field-value">${fmtNum(lastOilKm)}</div></div>
    <div class="field"><div class="field-label">Since Oil</div><div class="field-value">${fmtNum(sinceOil)}</div></div>
    <div class="field"><div class="field-label">Interval</div><div class="field-value">${fmtNum(interval)}</div></div>
    <div class="field"><div class="field-label">Remaining</div><div class="field-value ${remaining < 500 ? 'warn' : 'ok'}">${fmtNum(remaining)}</div></div>
  </div>
  <div class="meta">
    <div class="field"><div class="field-label">Last Oil Change Date</div><div class="field-value">${esc(fmtDate(v.last_oil_change_date))}</div></div>
    <div class="field"><div class="field-label">Inspection Expiry</div><div class="field-value">${esc(fmtDate(v.inspection_expiry_date))}</div></div>
  </div>

  <h2>Oil Change History (last 5)</h2>
  <table>
    <thead><tr><th>Date</th><th>KM</th><th>Changed By</th><th>Driver</th></tr></thead>
    <tbody>${oilRows}</tbody>
  </table>

  <h2>Periodic Maintenance / Inspection</h2>
  <table>
    <thead><tr><th>Scheduled</th><th>Type</th><th>Status</th><th>Technician</th><th>Notes</th></tr></thead>
    <tbody>${inspectionRows}</tbody>
  </table>

  <h2>Tires</h2>
  <table>
    <thead><tr><th>Position</th><th>Brand</th><th>Size</th><th>Serial</th><th>Installed KM</th><th>Condition</th><th>Status</th></tr></thead>
    <tbody>${tireRows}</tbody>
  </table>

  <h2>Stock Transactions (Parts Issued)</h2>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th>Item</th><th>Qty</th><th>From</th><th>Vehicle</th><th>Driver</th><th>Ref</th><th>Notes</th></tr></thead>
    <tbody>${stockRows}</tbody>
  </table>

  <h2>Driver Handovers</h2>
  <table>
    <thead><tr><th>Date</th><th>New Driver</th><th>Phone</th><th>KM</th><th>Previous Driver</th><th>Notes</th></tr></thead>
    <tbody>${handoverRows}</tbody>
  </table>

  <div class="footer">
    Generated by Fleet ERP · ${new Date().toLocaleString()}
  </div>

  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 500));</script>
</body>
</html>`;
}

export default { vehicleReportHtml };
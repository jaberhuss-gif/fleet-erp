// handover-report.js
// تقرير PDF لتسليم واستلام السيارة
// يعيد HTML جاهز للطباعة

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

export function handoverReportHtml(handover) {
  const h = handover || {};
  const openIssues = Array.isArray(h.open_issues) ? h.open_issues : [];

  const issueRows = openIssues.length
    ? openIssues.map((t, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(t.category || '-')}</td>
          <td>${esc(t.title || '-')}</td>
          <td>${esc(t.priority || '-')}</td>
          <td>${esc(t.status || '-')}</td>
          <td>${esc(fmtDate(t.opened_at))}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="6" style="text-align:center;color:#15803d;padding:12px">No open issues at handover time</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Vehicle Handover — ${esc(h.vehicle_plate)}</title>
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
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 6mm; }
    .field { border: 1px solid #cbd5e1; padding: 8px; border-radius: 5px; }
    .field-label { font-size: 8pt; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
    .field-value { font-size: 11pt; margin-top: 3px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 3mm; }
    th, td { border: 1px solid #94a3b8; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #e9eef5; font-weight: 700; }
    .signature { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 15mm; }
    .sig-box { border-top: 2px solid #475569; padding-top: 5mm; text-align: center; font-size: 9pt; color: #475569; }
    .sig-line { border-bottom: 1px solid #94a3b8; height: 15mm; }
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

  <h1>Vehicle Handover Report</h1>

  <div class="meta">
    <div class="field">
      <div class="field-label">Vehicle</div>
      <div class="field-value">${esc(h.vehicle_plate || '-')}</div>
    </div>
    <div class="field">
      <div class="field-label">Handover Date</div>
      <div class="field-value">${esc(fmtDate(h.handover_date))}</div>
    </div>
    <div class="field">
      <div class="field-label">Current KM</div>
      <div class="field-value">${esc(fmtNum(h.km_at_handover))} km</div>
    </div>
    <div class="field">
      <div class="field-label">Last Oil Change KM</div>
      <div class="field-value">${esc(fmtNum(h.last_oil_km))} km</div>
    </div>
    <div class="field">
      <div class="field-label">Last Oil Change Date</div>
      <div class="field-value">${esc(fmtDate(h.last_oil_date))}</div>
    </div>
    <div class="field">
      <div class="field-label">Report ID</div>
      <div class="field-value">#${esc(h.id)}</div>
    </div>
  </div>

  <h2>Driver Information</h2>
  <div class="meta">
    <div class="field">
      <div class="field-label">Previous Driver</div>
      <div class="field-value">${esc(h.previous_driver_name || '—')}</div>
      <div class="company-sub">${esc(h.previous_driver_phone || '')}</div>
    </div>
    <div class="field">
      <div class="field-label">New Driver</div>
      <div class="field-value">${esc(h.new_driver_name || '—')}</div>
      <div class="company-sub">${esc(h.new_driver_phone || '')}</div>
    </div>
  </div>

  <h2>Open Issues at Handover</h2>
  <table>
    <thead>
      <tr>
        <th style="width:5%">#</th>
        <th style="width:15%">Category</th>
        <th style="width:35%">Title</th>
        <th style="width:10%">Priority</th>
        <th style="width:15%">Status</th>
        <th style="width:20%">Opened</th>
      </tr>
    </thead>
    <tbody>
      ${issueRows}
    </tbody>
  </table>

  ${h.notes ? `<h2>Notes</h2><div class="field"><div class="field-value">${esc(h.notes)}</div></div>` : ''}

  <div class="signature">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>Previous Driver Signature</div>
      <div style="margin-top:2mm">${esc(h.previous_driver_name || '')}</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>New Driver Signature</div>
      <div style="margin-top:2mm">${esc(h.new_driver_name || '')}</div>
    </div>
  </div>

  <div class="footer">
    Generated by Fleet ERP · ${esc(new Date().toLocaleString())}
  </div>

  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 500));</script>
</body>
</html>`;
}

export default { handoverReportHtml };

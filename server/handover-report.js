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

// Remove only exact duplicate rows that have no distinct description/reason.
const uniqueIssues = openIssues.filter((issue, index, all) => {
  const title = String(issue?.title || '').trim().toLowerCase();
  const category = String(issue?.category || '').trim().toLowerCase();
  const description = String(issue?.description || '').trim().toLowerCase();
  const key = [category, title, description].join('|');
  return all.findIndex(candidate =>
    [String(candidate?.category || '').trim().toLowerCase(),
     String(candidate?.title || '').trim().toLowerCase(),
     String(candidate?.description || '').trim().toLowerCase()].join('|') === key
  ) === index;
});

const issueRows = uniqueIssues.length
  ? uniqueIssues.map((t, i) => {
      const rawStatus = String(t.current_status || t.status || 'Open').trim();
      const normalizedStatus = rawStatus.toLowerCase().replace(/[ _-]+/g, '');
      const isCompleted = ['completed', 'closed', 'resolved', 'done'].includes(normalizedStatus);
      const isInProgress = ['inprogress', 'acknowledged'].includes(normalizedStatus);
      const label = isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Open';
      const statusColor = isCompleted ? '#15803d' : isInProgress ? '#b45309' : '#b91c1c';
      const statusBg = isCompleted ? '#dcfce7' : isInProgress ? '#fef3c7' : '#fee2e2';
      const statusDisplay = '<span style="display:inline-block;white-space:nowrap;padding:4px 8px;border-radius:999px;background:' + statusBg + ';color:' + statusColor + ';font-size:8pt;font-weight:700"> ' + (isCompleted ? '✓ ' : '') + label + '</span>';
      return `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(t.category || '-')}</td>
        <td><strong>${esc(t.title || '-')}</strong></td>
        <td>${esc(t.description || '-')}</td>
        <td>${esc(t.priority || '-')}</td>
        <td>${statusDisplay}</td>
        <td>${esc(fmtDate(t.opened_at))}</td>
      </tr>
    `;
    }).join('')
    : `<tr><td colspan="7" style="text-align:center;color:#15803d;padding:12px">No open issues at handover time</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Vehicle Handover — ${esc(h.vehicle_plate)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #172033; margin: 0; padding: 18px; font-size: 9.5pt; }
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
    table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 8.5pt; margin-top: 3mm; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 7px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #e9eef5; color: #1e3a8a; font-weight: 700; }\n    tbody tr:nth-child(even) { background: #f8fafc; }\n    .field { break-inside: avoid; }
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
        <th style="width:4%">#</th>
        <th style="width:12%">Category</th>
        <th style="width:20%">Issue / Required Action</th>
        <th style="width:32%">Description / Reason</th>
        <th style="width:8%">Priority</th>
        <th style="width:12%">Status</th>
        <th style="width:12%">Opened</th>
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

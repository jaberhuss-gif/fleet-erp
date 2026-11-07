import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

export default function AnnualInspection({ canWork = false }) {
  const [completed, setCompleted] = useState([]);
  const [approaching, setApproaching] = useState([]);
  const [reminders, setReminders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sentList, setSentList] = useState([]);
  const [, setCalendarDayTick] = useState(0);

  // Keep the displayed countdown current while the page remains open.
  useEffect(() => {
    const timer = setInterval(() => setCalendarDayTick(value => value + 1), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/annual-inspection/status');
      const data = res.data;
      const completedRecords = data.completed || [];
      completedRecords.sort((a, b) => String(b.completed_date || '').localeCompare(String(a.completed_date || '')));
      setCompleted(completedRecords);
      setApproaching(data.approaching || []);
      setReminders({ reminders: data.due || [], total: data.due?.length || 0, expired: data.summary?.expired || 0, due: data.summary?.due || 0, exempt: data.exempt || [] });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getNextDueDate = (rec) => {
    const officialExpiry = String(rec?.inspection_expiry_date || rec?.next_due_date || '').slice(0, 10);
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(officialExpiry)) return officialExpiry;
    const completed = String(rec?.completed_date || '').slice(0, 10);
    if (!completed) return '—';
    const d = new Date(completed + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return '—';
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString().slice(0, 10);
  };

  // Calculate remaining days from the expiry date on the client so the
  // countdown advances with the calendar even without a page reload.
  const getDaysRemaining = (expiryDate) => {
    const dateText = String(expiryDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
    const [year, month, day] = dateText.split('-').map(Number);
    const expiryUtc = Date.UTC(year, month - 1, day);
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.ceil((expiryUtc - todayUtc) / 86400000);
  };

  // Prefer the actual WhatsApp timestamp. If the historic record has no
  // WhatsApp timestamp, show the official annual inspection date stored in
  // the database as the confirmation/reference date without inventing a WA event.
  const getConfirmationDate = (rec) => {
    const whatsappDate = String(rec?.whatsapp_confirmed_at || '').slice(0, 10);
    if (whatsappDate) return { date: whatsappDate, source: 'whatsapp' };
    const recordedDate = String(rec?.completed_date || '').slice(0, 10);
    return recordedDate ? { date: recordedDate, source: 'inspection-record' } : null;
  };

  const openAnnualConfirmation = async (vehicleId, recordId = null) => {
    const endpoint = recordId
      ? '/periodic-maintenance/' + recordId + '/repair-whatsapp-info'
      : '/annual-inspection/vehicle/' + vehicleId + '/confirmation-info';
    const info = (await api.get(endpoint)).data || {};
    const phone = String(info.driverPhone || '').replace(/[^0-9]/g, '');
    const url = String(info.confirmationUrl || '').trim();
    if (!phone || !url) throw new Error('No driver phone or confirmation link available.');
    const plate = info.vehiclePlate || '';
    const message = [
      'Hello ' + (info.driverName || 'Driver') + ',',
      '',
      'Annual vehicle inspection reminder — ' + plate,
      'تذكير بالفحص الدوري السنوي للمركبة ' + plate,
      '',
      'Please complete the annual inspection. If it has already been completed, confirm using the link below. Select NO if it is not completed.',
      'يرجى إجراء الفحص السنوي. إذا تم الفحص بالفعل، يرجى التأكيد عبر الرابط أدناه. اختر NO إذا لم يتم الفحص.',
      '',
      'Confirmation link / رابط التأكيد:',
      url,
      '',
      'Fleet Management'
    ].join('\n');
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(message), '_blank');
  };

  const sendWhatsApp = async (record) => {
    try {
      await openAnnualConfirmation(record.vehicleId, record.recordId ?? record.id ?? null);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const sendReminder = async (reminder) => {
    try {
      await openAnnualConfirmation(reminder.vehicleId, reminder.recordId ?? null);
      setSentList(prev => [...prev, reminder.vehicleId]);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const sendAllReminders = async () => {
    if (!reminders?.reminders?.length) return;
    if (!confirm('Prepare tracked WhatsApp confirmations for ' + reminders.reminders.length + ' drivers?')) return;
    setSending(true);
    for (const r of reminders.reminders) {
      try {
        await openAnnualConfirmation(r.vehicleId, r.recordId ?? null);
        setSentList(prev => [...prev, r.vehicleId]);
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error('Annual inspection reminder failed:', r.vehicleId, e);
      }
    }
    setSending(false);
  };

  const printPDF = () => {
    const w = window.open('', '_blank', 'width=1200,height=800');
    if (!w) { alert('Please allow pop-ups to print.'); return; }
    const esc = s => String(s ?? '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const today = new Date().toLocaleDateString();
    const dueRowsData = reminders?.reminders || [];
    const exemptRowsData = reminders?.exempt || [];
    const dueWithin60 = new Set([...approaching, ...dueRowsData]
      .filter(r => { const d = getDaysRemaining(r.inspection_expiry_date); return d !== null && d >= 0 && d <= 60; })
      .map(r => r.vehicleId || r.vehicle_id || r.plate)).size;
    const dueWithin30 = dueRowsData.filter(r => {
      const d = getDaysRemaining(r.inspection_expiry_date);
      return d !== null && d >= 0 && d <= 30;
    }).length;
    const notInspected = dueRowsData.filter(r => r.status === 'not_inspected').length;
    const brandHtml = '<div class="brand"><img src="https://pbs.twimg.com/media/G0B19WzaYAIKWy1.png" alt="Maaden Ivanhoe Electric JV logo"><div class="brand-copy"><div class="company">Maaden Ivanhoe Electric Exploration and Development Limited Company</div><div class="phase">Exploration Phase — Arabian Shield</div><div class="person">Hussein Anwar</div><div class="role">Fleet Manager / Fleet &amp; Camp Maintenance Supervisor</div></div></div>';

    const completedRows = completed.map(r => {
      const plate = r.plate || [r.plate_number, r.plate_code].filter(Boolean).join(' ');
      const confirmation = getConfirmationDate(r);
      return `<tr><td>${esc(plate)}</td><td>${esc(r.driver_name || r.driver || '-')}</td><td>${esc(r.location || '-')}</td><td>${esc(String(r.completed_date || '').slice(0, 10) || '-')}</td><td>${esc(getNextDueDate(r))}</td><td>${esc(confirmation?.date || '—')}</td><td>${esc(confirmation?.source === 'whatsapp' ? 'WhatsApp' : confirmation ? 'Database record' : 'Not confirmed')}</td></tr>`;
    }).join('');

    const approachingRows = approaching.map(r => {
      const days = getDaysRemaining(r.inspection_expiry_date);
      const confirmation = getConfirmationDate(r);
      return `<tr><td>${esc(r.plate)}</td><td>${esc(r.driver)}</td><td>${esc(r.location)}</td><td>${esc(r.inspection_expiry_date || r.next_due_date)}</td><td>${days === null ? '—' : days + ' days'}</td><td>${esc(confirmation?.date || 'Not confirmed')}</td><td>${esc(confirmation?.source === 'whatsapp' ? 'WhatsApp' : confirmation ? 'Database record' : 'Not confirmed')}</td></tr>`;
    }).join('');

    const dueRows = dueRowsData.map(r => {
      const days = getDaysRemaining(r.inspection_expiry_date);
      const status = days === null ? (r.status || '—') : days < 0 ? 'EXPIRED' : 'DUE';
      const daysLabel = days === null ? '—' : days < 0 ? Math.abs(days) + ' days overdue' : days + ' days';
      return `<tr><td>${esc(r.plate)}</td><td>${esc(r.driver)}</td><td>${esc(r.location)}</td><td>${esc(r.inspection_expiry_date || 'Not recorded')}</td><td>${esc(daysLabel)}</td><td>${esc(status)}</td><td>${esc(r.status || '-')}</td></tr>`;
    }).join('');

    const exemptRows = exemptRowsData.map(r =>
      `<tr><td>${esc(r.plate)}</td><td>${esc(r.driver)}</td><td>${esc(r.location)}</td><td>${esc(r.exemption || 'Government decision (2024) — Exempt')}</td></tr>`
    ).join('');

    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Annual Inspection Full Report</title>
    <style>
      @page{size:A4 landscape;margin:10mm}
      body{font-family:Arial,sans-serif;font-size:9pt;color:#172033}
      .brand{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1e3a8a;padding:0 0 10px;margin:0 0 14px;page-break-inside:avoid}
      .brand img{width:175px;height:78px;object-fit:contain}
      .brand-copy{flex:1;text-align:right}.company{font-size:15px;font-weight:700;color:#1e3a8a}.phase{font-size:10px;color:#475569;margin-top:3px}.person{font-size:12px;font-weight:700;color:#111827;margin-top:7px}.role{font-size:10px;color:#475569;margin-top:2px}
      h1{font-size:20pt;margin:0 0 5px}h2{font-size:13pt;margin:18px 0 8px;border-bottom:2px solid #1e3a8a;padding-bottom:4px}
      .meta{color:#475569;margin:0 0 12px}.cards{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin:12px 0 18px}
      .card{border:1px solid #cbd5e1;border-radius:6px;padding:9px;text-align:center;background:#f8fafc}
      .label{font-size:8pt;color:#475569;font-weight:bold}.value{font-size:19pt;font-weight:bold;margin-top:4px}
      table{width:100%;border-collapse:collapse;margin-bottom:12px}th{background:#e9eef5;padding:6px;text-align:left}
      td{border:1px solid #cbd5e1;padding:5px}tr:nth-child(even){background:#f8fafc}
      .empty{padding:10px;text-align:center;color:#64748b;border:1px solid #cbd5e1}
      .note{font-size:8pt;color:#64748b;margin-top:-4px;margin-bottom:8px}
    </style></head><body>
    ${brandHtml}
    <h1>Annual Vehicle Inspection — Full Report</h1>
    <div class="meta">Generated: ${esc(today)} · Fleet inspection overview and full vehicle details</div>
    <div class="cards">
      <div class="card"><div class="label">Inspected</div><div class="value">${completed.length}</div></div>
      <div class="card"><div class="label">Approaching 31–60d</div><div class="value">${approaching.length}</div></div>
      <div class="card"><div class="label">Due 0–30d</div><div class="value">${dueWithin30}</div></div>
      <div class="card"><div class="label">Due within 60d</div><div class="value">${dueWithin60}</div></div>
      <div class="card"><div class="label">Expired / Due list</div><div class="value">${dueRowsData.length}</div></div>
      <div class="card"><div class="label">Not Inspected</div><div class="value">${notInspected}</div></div>
    </div>
    <div class="cards" style="grid-template-columns:repeat(3,1fr)">
      <div class="card"><div class="label">Expired (summary)</div><div class="value">${reminders?.expired || 0}</div></div>
      <div class="card"><div class="label">Exempt from Annual</div><div class="value">${exemptRowsData.length}</div></div>
      <div class="card"><div class="label">Completed Annual</div><div class="value">${completed.length}</div></div>
    </div>

    <h2>✓ Completed Annual Inspections (${completed.length})</h2>
    <table><thead><tr><th>Vehicle</th><th>Driver</th><th>Location</th><th>Completed Date</th><th>Next Due Date</th><th>Confirmation Date</th><th>Confirmation Source</th></tr></thead>
    <tbody>${completedRows || '<tr><td colspan="7" class="empty">No completed inspections.</td></tr>'}</tbody></table>

    <h2>⏳ Approaching Annual Inspections — 31–60 Days (${approaching.length})</h2>
    <table><thead><tr><th>Vehicle</th><th>Driver</th><th>Location</th><th>Expiry Date</th><th>Days Left</th><th>Confirmation Date</th><th>Confirmation Source</th></tr></thead>
    <tbody>${approachingRows || '<tr><td colspan="7" class="empty">No approaching inspections.</td></tr>'}</tbody></table>

    <h2>⚠️ Due / Expired / Not Inspected (${dueRowsData.length})</h2>
    <table><thead><tr><th>Vehicle</th><th>Driver</th><th>Location</th><th>Expiry Date</th><th>Days Left</th><th>Calculated Status</th><th>Record Status</th></tr></thead>
    <tbody>${dueRows || '<tr><td colspan="7" class="empty">No vehicles due or expired.</td></tr>'}</tbody></table>

    <h2>Exempt from Annual Inspection (${exemptRowsData.length})</h2>
    <p class="note">These vehicles are exempt from annual inspection only; this does not exempt them from six-month maintenance.</p>
    <table><thead><tr><th>Vehicle</th><th>Driver</th><th>Location</th><th>Exemption Details</th></tr></thead>
    <tbody>${exemptRows || '<tr><td colspan="4" class="empty">No exempt vehicles recorded.</td></tr>'}</tbody></table>
    </body></html>`);
    w.document.close();
    // Wait for the company logo and all report images before opening print preview.
    // A fixed 350ms delay was printing before the remote JV logo finished loading.
    const printAfterImagesLoad = () => {
      const images = Array.from(w.document.images || []);
      Promise.all(images.map(img => {
        if (img.complete) {
          return typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve();
        }
        return new Promise(resolve => {
          const finish = () => resolve();
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', finish, { once: true });
          setTimeout(finish, 8000);
        });
      })).then(() => {
        w.focus();
        w.print();
      });
    };
    if (w.document.readyState === 'complete') printAfterImagesLoad();
    else w.addEventListener('load', printAfterImagesLoad, { once: true });
  };

  if (loading) return <div className="loading">Loading annual inspection data...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const dueReminders = reminders?.reminders || [];
  const expiredCount = reminders?.expired || 0;
  const dueCount = reminders?.due || 0;
  const exempt = Array.isArray(reminders?.exempt) ? reminders.exempt : [];
  const notInspectedCount = dueReminders.filter(r => r.status === 'not_inspected').length;
  // Count each vehicle once when its annual expiry is between today and 60 days ahead.
  const dueWithin60Count = new Set(
    [...approaching, ...dueReminders]
      .filter(r => {
        const days = getDaysRemaining(r.inspection_expiry_date);
        return days !== null && days >= 0 && days <= 60;
      })
      .map(r => r.vehicleId || r.vehicle_id || r.plate)
  ).size;

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>📅 Annual Inspection</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
Annual inspection status — completed vehicles and vehicles due for inspection.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={load} style={{ padding: '8px 16px' }}>↻ Refresh</button>
          {canWork && <button className="btn btn-primary" onClick={printPDF} style={{ padding: '8px 16px' }}>🖨️ PDF Report</button>}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <div style={{ background: '#f0fdf4', borderLeft: '4px solid #16a34a', borderRadius: '8px', padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#166534', textTransform: 'uppercase' }}>Inspected</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a' }}>{completed.length}</div>
        </div>
        <div style={{ background: '#eff6ff', borderLeft: '4px solid #3b82f6', borderRadius: '8px', padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#1d4ed8', textTransform: 'uppercase' }}>Approaching ≤60d</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#2563eb' }}>{approaching.length}</div>
        </div>
        <div style={{ background: '#fef2f2', borderLeft: '4px solid #dc2626', borderRadius: '8px', padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#991b1b', textTransform: 'uppercase' }}>Expired</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#dc2626' }}>{expiredCount}</div>
        </div>
        <div style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b', borderRadius: '8px', padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', textTransform: 'uppercase' }}>Due ≤60d</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>{dueWithin60Count}</div>
        </div>
        <div style={{ background: '#f8fafc', borderLeft: '4px solid #64748b', borderRadius: '8px', padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Not Inspected</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#475569' }}>{notInspectedCount}</div>
        </div>
        <div style={{ background: '#f5f3ff', borderLeft: '4px solid #7c3aed', borderRadius: '8px', padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#6d28d9', textTransform: 'uppercase' }}>Exempt</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#7c3aed' }}>{exempt.length}</div>
        </div>
      </div>

      {/* Section 1: Completed Inspections */}
      <div className="panel" style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '18px', color: '#0f172a' }}>✓ Completed Annual Inspections ({completed.length})</h2>
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '13px' }}>
          Vehicles that passed annual inspection. WhatsApp confirmation updates the next due date automatically.
        </p>
        {completed.length === 0 ? (
          <div className="alert alert-info">No completed annual inspections.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Vehicle</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Driver</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Location</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Completed</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Next Due</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>WhatsApp</th>
                  {canWork && <th style={{ padding: '8px 10px', textAlign: 'center' }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {completed.map((r, i) => {
                  const plate = r.plate || [r.plate_number, r.plate_code].filter(Boolean).join(' ');
                  const next = getNextDueDate(r);
                  const confirmation = getConfirmationDate(r);
                  const confirmed = confirmation?.date || null;
                  return (
                    <tr key={r.id || i} style={{ background: i % 2 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 700 }}>{plate}</td>
                      <td style={{ padding: '7px 10px' }}>{r.driver_name || r.driver || '-'}</td>
                      <td style={{ padding: '7px 10px', color: '#64748b' }}>{r.location || '-'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{String(r.completed_date || '').slice(0, 10) || '-'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: '#16a34a' }}>{next}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        {confirmed ? (
                          <span
                            title={confirmation?.source === 'whatsapp' ? 'Confirmed through WhatsApp' : 'Annual inspection date from the vehicle database; no separate WhatsApp timestamp is stored'}
                            style={{ background: '#bbf7d0', color: '#166534', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}
                          >
                            ✓ Confirmed · {confirmed}
                          </span>
                        ) : (
                          <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '10px', fontSize: '10px' }}>
                            Not Confirmed
                          </span>
                        )}
                      </td>
                      {canWork && (
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          {!confirmed && (
                            <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => sendWhatsApp(r)}>
                              📱 Send
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '18px', color: '#6d28d9' }}>Exempt from Annual Inspection ({exempt.length})</h2>
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '13px' }}>Vehicles exempt under the 2024 government decision. These vehicles are excluded from due and overdue counts.</p>
        {exempt.length === 0 ? <div className="alert alert-info">No exempt vehicles recorded.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr style={{ background: '#f5f3ff' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Vehicle</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Driver</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Location</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Exemption</th>
              </tr></thead>
              <tbody>{exempt.map((r,i) => (
                <tr key={r.vehicleId || i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 ? '#fff' : '#faf5ff' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 700 }}>{r.plate}</td>
                  <td style={{ padding: '7px 10px' }}>{r.driver}</td>
                  <td style={{ padding: '7px 10px' }}>{r.location}</td>
                  <td style={{ padding: '7px 10px', color: '#6d28d9', fontWeight: 700 }}>Government decision (2024) — Exempt</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Approaching Inspections */}
      <div className="panel" style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: '#1d4ed8' }}>⏳ Approaching Annual Inspections ({approaching.length})</h2>
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '13px' }}>Inspections expiring within 31–60 days.</p>
        {approaching.length === 0 ? <div className="alert alert-info">No approaching inspections.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr style={{ background: '#eff6ff' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Vehicle</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Driver</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Location</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Expiry</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Days Left</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>WhatsApp / Confirmation</th>
                {canWork && <th style={{ padding: '8px 10px', textAlign: 'center' }}>Action</th>}
              </tr></thead>
              <tbody>{approaching.map((r,i) => (
                <tr key={r.vehicleId || i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 700 }}>{r.plate}</td>
                  <td style={{ padding: '7px 10px' }}>{r.driver}</td>
                  <td style={{ padding: '7px 10px' }}>{r.location}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center' }}>{r.next_due_date}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: '#2563eb', fontWeight: 700 }}>
                    {(() => {
                      const days = getDaysRemaining(r.inspection_expiry_date);
                      return days === null ? '—' : days < 0 ? `${Math.abs(days)}d ago` : `${days}d`;
                    })()}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                    {(() => {
                      const confirmation = getConfirmationDate(r);
                      return confirmation ? (
                        <span
                          title={confirmation.source === 'whatsapp' ? 'Confirmed through WhatsApp' : 'Annual inspection date from the vehicle database; no separate WhatsApp timestamp is stored'}
                          style={{ background: '#bbf7d0', color: '#166534', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}
                        >
                          ✓ Confirmed · {confirmation.date}
                        </span>
                      ) : <span style={{ color: '#64748b' }}>Not Confirmed</span>;
                    })()}
                  </td>
                  {canWork && <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                    <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => sendReminder(r)}>📱 Send</button>
                  </td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Due / Not Inspected */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>⚠️ Due / Expired ({dueReminders.length})</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
              Vehicles needing inspection within 30 days or already expired. Send WhatsApp reminders.
            </p>
          </div>
          {canWork && dueReminders.length > 0 && (
            <button className="btn btn-primary" onClick={sendAllReminders} disabled={sending} style={{ padding: '8px 16px' }}>
              {sending ? 'Sending...' : '📱 Send All Reminders'}
            </button>
          )}
        </div>
        {dueReminders.length === 0 ? (
          <div className="alert alert-success">✓ No vehicles due for inspection within 30 days.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Vehicle</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Driver</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Location</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Expiry Date</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Days Left</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Status</th>
                  {canWork && <th style={{ padding: '8px 10px', textAlign: 'center' }}>Remind</th>}
                </tr>
              </thead>
              <tbody>
                {dueReminders.map((r, i) => {
                  const isExpired = r.days_remaining < 0;
                  const rowBg = isExpired ? '#fef2f2' : i % 2 ? '#fff' : '#fffbeb';
                  const daysColor = isExpired ? '#dc2626' : '#d97706';
                  return (
                    <tr key={r.vehicleId || i} style={{ background: rowBg, borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 700 }}>{r.plate}</td>
                      <td style={{ padding: '7px 10px' }}>{r.driver}</td>
                      <td style={{ padding: '7px 10px', color: '#64748b' }}>{r.location}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{r.inspection_expiry_date}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: daysColor }}>
                        {(() => {
                          const days = getDaysRemaining(r.inspection_expiry_date);
                          return days === null ? '—' : days < 0 ? `${Math.abs(days)}d ago` : `${days}d`;
                        })()}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        <span style={{
                          background: isExpired ? '#fecaca' : '#fde68a',
                          color: isExpired ? '#991b1b' : '#92400e',
                          padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600
                        }}>
                          {isExpired ? 'EXPIRED' : 'DUE'}
                        </span>
                      </td>
                      {canWork && (
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <button
                            className="btn btn-success"
                            style={{ padding: '4px 10px', fontSize: '11px', opacity: sentList.includes(r.vehicleId) ? 0.5 : 1 }}
                            disabled={!r.whatsappUrl || sentList.includes(r.vehicleId)}
                            onClick={() => sendReminder(r)}
                          >
                            {sentList.includes(r.vehicleId) ? '✓ Sent' : '📱 Remind'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

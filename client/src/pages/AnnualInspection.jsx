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
    const completed = String(rec?.completed_date || '').slice(0, 10);
    if (!completed) return '—';
    const d = new Date(completed + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return '—';
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString().slice(0, 10);
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

    const completedRows = completed.map(r => {
      const plate = r.plate || [r.plate_number, r.plate_code].filter(Boolean).join(' ');
      const next = getNextDueDate(r);
      const confirmation = getConfirmationDate(r);
      const confirmed = confirmation ? confirmation.date : '—';
      return `<tr><td>${esc(plate)}</td><td>${esc(r.driver_name || r.driver || '-')}</td><td>${esc(r.location || '-')}</td><td>${esc(String(r.completed_date || '').slice(0, 10))}</td><td>${esc(next)}</td><td>${esc(confirmed)}</td></tr>`;
    }).join('');

    const dueRows = (reminders?.reminders || []).map(r => {
      const status = r.days_remaining < 0 ? 'EXPIRED' : r.days_remaining <= 30 ? 'DUE' : 'OK';
      const color = r.days_remaining < 0 ? '#dc2626' : '#d97706';
      return `<tr><td>${esc(r.plate)}</td><td>${esc(r.driver)}</td><td>${esc(r.location)}</td><td>${esc(r.inspection_expiry_date)}</td><td style="color:${color};font-weight:bold">${r.days_remaining < 0 ? Math.abs(r.days_remaining) + 'd ago' : r.days_remaining + 'd'}</td><td style="color:${color};font-weight:bold">${status}</td></tr>`;
    }).join('');

    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Annual Inspection Report</title>
    <style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;font-size:9pt;color:#172033}
    h1{font-size:18pt;margin:0 0 4px}h2{font-size:13pt;margin:18px 0 8px;border-bottom:2px solid #1e3a8a;padding-bottom:4px}
    .meta{color:#475569;margin:0 0 14px}table{width:100%;border-collapse:collapse}th{background:#e9eef5;padding:6px;text-align:left}
    td{border:1px solid #cbd5e1;padding:5px}tr:nth-child(even){background:#f8fafc}.exp{color:#dc2626;font-weight:bold}
    .due{color:#d97706;font-weight:bold}</style></head><body>
    <h1>Annual Vehicle Inspection Report</h1>
    <div class="meta">Generated: ${today} · Total Inspected: ${completed.length} · Due/Expired: ${reminders?.total || 0}</div>
    <h2>✓ Completed Annual Inspections (${completed.length})</h2>
    <table><thead><tr><th>Vehicle</th><th>Driver</th><th>Location</th><th>Completed Date</th><th>Next Due Date</th><th>WhatsApp Confirmed</th></tr></thead>
    <tbody>${completedRows || '<tr><td colspan="6">No completed inspections.</td></tr>'}</tbody></table>
    <h2>⚠️ Due / Expired (${reminders?.total || 0})</h2>
    <table><thead><tr><th>Vehicle</th><th>Driver</th><th>Location</th><th>Expiry Date</th><th>Days Remaining</th><th>Status</th></tr></thead>
    <tbody>${dueRows || '<tr><td colspan="6">No vehicles due.</td></tr>'}</tbody></table>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  };

  if (loading) return <div className="loading">Loading annual inspection data...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const dueReminders = reminders?.reminders || [];
  const expiredCount = reminders?.expired || 0;
  const dueCount = reminders?.due || 0;
  const exempt = Array.isArray(reminders?.exempt) ? reminders.exempt : [];
  const notInspectedCount = dueReminders.filter(r => r.status === 'not_inspected').length;

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
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', textTransform: 'uppercase' }}>Due ≤30d</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>{dueCount}</div>
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
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: '#2563eb', fontWeight: 700 }}>{r.days_remaining}d</td>
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
                        {r.days_remaining < 0 ? `${Math.abs(r.days_remaining)}d ago` : `${r.days_remaining}d`}
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

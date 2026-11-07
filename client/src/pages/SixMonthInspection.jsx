import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

export default function SixMonthInspection({ canWork = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sentList, setSentList] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/six-month-inspection/status');
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sendWhatsAppConfirm = async (record) => {
    try {
      const info = (await api.get('/periodic-maintenance/' + record.recordId + '/repair-whatsapp-info')).data || {};
      const phone = String(info.driverPhone || '').replace(/[^0-9]/g, '');
      const url = String(info.confirmationUrl || '').trim();
      if (!phone || !url) { alert('No driver phone or confirmation link available.'); return; }
      const message = [
        'Hello ' + (info.driverName || 'Driver') + ',',
        '',
        'Vehicle ' + info.vehiclePlate + ' — 6-Month Maintenance Completed?',
        'هل تم إجراء صيانة الـ 6 أشهر للمركبة ' + info.vehiclePlate + '؟',
        '',
        'If the 6-month maintenance is done, please confirm by opening the link below.',
        'إذا تمت الصيانة، يرجى تأكيد ذلك عبر فتح الرابط أدناه.',
        '',
        'Confirmation link / رابط التأكيد:',
        url,
        '',
        'Fleet Management'
      ].join('\n');
      window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(message), '_blank');
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const sendReminder = (item) => {
    if (!item.whatsappUrl) { alert('No WhatsApp number for ' + item.plate); return; }
    window.open(item.whatsappUrl, '_blank');
    setSentList(prev => [...prev, item.vehicleId]);
  };

  const sendAllReminders = async () => {
    const dueList = data?.due || [];
    if (!dueList.length) return;
    if (!confirm('Send WhatsApp reminders to ' + dueList.length + ' drivers?')) return;
    setSending(true);
    for (const r of dueList) {
      if (r.whatsappUrl) {
        window.open(r.whatsappUrl, '_blank');
        setSentList(prev => [...prev, r.vehicleId]);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    setSending(false);
  };

  const printPDF = () => {
    const w = window.open('', '_blank', 'width=1200,height=800');
    if (!w) { alert('Please allow pop-ups to print.'); return; }
    const esc = s => String(s ?? '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const today = new Date().toLocaleDateString();
    const completed = data?.completed || [];
    const due = data?.due || [];

    const completedRows = completed.map(r => `<tr><td>${esc(r.plate)}</td><td>${esc(r.driver)}</td><td>${esc(r.location)}</td><td>${esc(r.completed_date)}</td><td>${esc(r.next_due_date)}</td><td>${r.whatsapp_confirmed_at ? esc(r.whatsapp_confirmed_at) : '—'}</td></tr>`).join('');
    const dueRows = due.map(r => {
      const status = r.status === 'expired' ? 'EXPIRED' : r.status === 'due' ? 'DUE' : 'NOT INSPECTED';
      const color = r.status === 'expired' || r.status === 'not_inspected' ? '#dc2626' : '#d97706';
      const days = r.days_remaining === -999 ? 'N/A' : r.days_remaining < 0 ? Math.abs(r.days_remaining) + 'd ago' : r.days_remaining + 'd';
      return `<tr><td>${esc(r.plate)}</td><td>${esc(r.driver)}</td><td>${esc(r.location)}</td><td>${esc(r.completed_date || '—')}</td><td>${esc(r.next_due_date)}</td><td style="color:${color};font-weight:bold">${days}</td><td style="color:${color};font-weight:bold">${status}</td></tr>`;
    }).join('');

    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>6-Month Maintenance Report</title>
    <style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;font-size:9pt;color:#172033}
    h1{font-size:18pt;margin:0 0 4px}h2{font-size:13pt;margin:18px 0 8px;border-bottom:2px solid #1e3a8a;padding-bottom:4px}
    .meta{color:#475569;margin:0 0 14px}table{width:100%;border-collapse:collapse}th{background:#e9eef5;padding:6px;text-align:left}
    td{border:1px solid #cbd5e1;padding:5px}tr:nth-child(even){background:#f8fafc}</style></head><body>
    <h1>6-Month Maintenance Report</h1>
    <div class="meta">Generated: ${today} · Completed: ${completed.length} · Due/Expired: ${due.length}</div>
    <h2>✓ Completed 6-Month Maintenance (${completed.length})</h2>
    <table><thead><tr><th>Vehicle</th><th>Driver</th><th>Location</th><th>Completed Date</th><th>Next Due</th><th>WhatsApp Confirmed</th></tr></thead>
    <tbody>${completedRows || '<tr><td colspan="6">No completed records.</td></tr>'}</tbody></table>
    <h2>⚠️ Due / Expired / Not Inspected (${due.length})</h2>
    <table><thead><tr><th>Vehicle</th><th>Driver</th><th>Location</th><th>Last Completed</th><th>Next Due</th><th>Days</th><th>Status</th></tr></thead>
    <tbody>${dueRows || '<tr><td colspan="7">No vehicles due.</td></tr>'}</tbody></table>
    </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 350);
  };

  if (loading) return <div className="loading">Loading 6-month inspection data...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const { summary, completed, due } = data;

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>🔍 6-Month Maintenance</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
            Six-month maintenance status — completed vehicles and vehicles due for maintenance.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={load} style={{ padding: '8px 16px' }}>↻ Refresh</button>
          {canWork && <button className="btn btn-primary" onClick={printPDF} style={{ padding: '8px 16px' }}>🖨️ PDF Report</button>}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ background: '#f0fdf4', borderLeft: '4px solid #16a34a', borderRadius: '8px', padding: '14px 20px', flex: 1, minWidth: '140px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#166534', textTransform: 'uppercase' }}>Completed</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a' }}>{summary.completed}</div>
        </div>
        <div style={{ background: '#fef2f2', borderLeft: '4px solid #dc2626', borderRadius: '8px', padding: '14px 20px', flex: 1, minWidth: '140px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#991b1b', textTransform: 'uppercase' }}>Expired</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#dc2626' }}>{summary.expired + summary.not_inspected}</div>
        </div>
        <div style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b', borderRadius: '8px', padding: '14px 20px', flex: 1, minWidth: '140px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', textTransform: 'uppercase' }}>Due ≤30d</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>{summary.due}</div>
        </div>
        <div style={{ background: '#f8fafc', borderLeft: '4px solid #64748b', borderRadius: '8px', padding: '14px 20px', flex: 1, minWidth: '140px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Total</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a' }}>{summary.total}</div>
        </div>
      </div>

      {/* Section 1: Completed */}
      <div className="panel" style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '18px', color: '#0f172a' }}>✓ Completed 6-Month Maintenance ({completed.length})</h2>
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '13px' }}>
          Vehicles that completed 6-month maintenance. Next due date = completed + 6 months. WhatsApp confirmation auto-updates the record.
        </p>
        {completed.length === 0 ? (
          <div className="alert alert-info">No completed 6-month maintenance records.</div>
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
                {completed.map((r, i) => (
                  <tr key={r.vehicleId || i} style={{ background: i % 2 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 700 }}>{r.plate}</td>
                    <td style={{ padding: '7px 10px' }}>{r.driver}</td>
                    <td style={{ padding: '7px 10px', color: '#64748b' }}>{r.location}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{r.completed_date}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: '#16a34a' }}>{r.next_due_date}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                      {r.whatsapp_confirmed_at ? (
                        <span style={{ background: '#bbf7d0', color: '#166534', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>✓ {r.whatsapp_confirmed_at}</span>
                      ) : (
                        <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '10px', fontSize: '10px' }}>Not Confirmed</span>
                      )}
                    </td>
                    {canWork && (
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        {!r.whatsapp_confirmed_at && r.recordId && (
                          <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => sendWhatsAppConfirm(r)}>📱 Send</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Due / Expired / Not Inspected */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>⚠️ Due / Expired / Not Inspected ({due.length})</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
              Vehicles needing 6-month maintenance within 30 days, expired, or never inspected. Send WhatsApp reminders.
            </p>
          </div>
          {canWork && due.length > 0 && (
            <button className="btn btn-primary" onClick={sendAllReminders} disabled={sending} style={{ padding: '8px 16px' }}>
              {sending ? 'Sending...' : '📱 Send All Reminders'}
            </button>
          )}
        </div>
        {due.length === 0 ? (
          <div className="alert alert-success">✓ No vehicles due for 6-month maintenance.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Vehicle</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Driver</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Location</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Last Completed</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Next Due</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Days Left</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Status</th>
                  {canWork && <th style={{ padding: '8px 10px', textAlign: 'center' }}>Remind</th>}
                </tr>
              </thead>
              <tbody>
                {due.map((r, i) => {
                  const isExpired = r.status === 'expired' || r.status === 'not_inspected';
                  const rowBg = isExpired ? '#fef2f2' : i % 2 ? '#fff' : '#fffbeb';
                  const daysColor = isExpired ? '#dc2626' : '#d97706';
                  const statusBadge = r.status === 'expired' ? { bg: '#fecaca', color: '#991b1b', text: 'EXPIRED' }
                    : r.status === 'due' ? { bg: '#fde68a', color: '#92400e', text: 'DUE' }
                    : { bg: '#fecaca', color: '#991b1b', text: 'NOT INSPECTED' };
                  return (
                    <tr key={r.vehicleId || i} style={{ background: rowBg, borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 700 }}>{r.plate}</td>
                      <td style={{ padding: '7px 10px' }}>{r.driver}</td>
                      <td style={{ padding: '7px 10px', color: '#64748b' }}>{r.location}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{r.completed_date || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{r.next_due_date}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: daysColor }}>
                        {r.days_remaining === -999 ? 'N/A' : r.days_remaining < 0 ? `${Math.abs(r.days_remaining)}d ago` : `${r.days_remaining}d`}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        <span style={{ background: statusBadge.bg, color: statusBadge.color, padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>{statusBadge.text}</span>
                      </td>
                      {canWork && (
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: '11px', opacity: sentList.includes(r.vehicleId) ? 0.5 : 1 }} disabled={!r.whatsappUrl || sentList.includes(r.vehicleId)} onClick={() => sendReminder(r)}>
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

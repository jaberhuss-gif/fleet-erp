import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { getMaintenanceTickets, getMaintenanceWhatsAppInfo } from '../api/client';

const ISSUE_TYPES = ['Tires','Engine','A/C','Lights','Brakes','Battery','Door','Wipers','Oil Engine','Other'];

export default function MaintenanceRequests() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [issueFilter, setIssueFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const loadTickets = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getMaintenanceTickets();
      setTickets((res.tickets || []).filter(t =>
        ISSUE_TYPES.includes(String(t.category || '').trim())
      ));
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTickets(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter(t => {
      const plate = String(t.plate || '').toLowerCase();
      const driver = String(t.driver || '').toLowerCase();
      const site = String(t.site || '').toLowerCase();
      const category = String(t.category || '').trim();
      const status = String(t.status || '');
      const opened = t.opened_at ? String(t.opened_at).slice(0, 10) : '';
      return (!q || plate.includes(q) || driver.includes(q) || site.includes(q))
        && (!issueFilter || category === issueFilter)
        && (!statusFilter || status === statusFilter)
        && (!dateFilter || opened === dateFilter);
    });
  }, [tickets, search, issueFilter, statusFilter, dateFilter]);

  const rows = filtered.map(t => ({
    'Vehicle': t.plate || '',
    'Location': t.site || '',
    'Driver': t.driver || '',
    'Issue Type': t.category || '',
    'Description': t.description || '',
    'Priority': t.priority || 'Medium',
    'Status': t.status || '',
    'Opened Date': t.opened_at ? String(t.opened_at).slice(0, 10) : ''
  }));

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 18 }, { wch: 20 }, { wch: 22 }, { wch: 16 },
      { wch: 45 }, { wch: 12 }, { wch: 24 }, { wch: 14 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Maintenance Requests');
    XLSX.writeFile(wb, 'Maintenance_Requests_Report.xlsx');
  };

  const exportPdf = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const body = rows.map(r => '<tr>' +
      ['Vehicle','Location','Driver','Issue Type','Description','Priority','Status','Opened Date']
        .map(k => '<td>' + esc(r[k]) + '</td>').join('') + '</tr>').join('');
    win.document.write('<!doctype html><html><head><title>Maintenance Requests Report</title><style>' +
      'body{font-family:Arial,sans-serif;margin:28px;color:#111827}h1{margin:0 0 6px;font-size:22px}p{margin:4px 0 18px;color:#475569;font-size:12px}' +
      'table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top}th{background:#e2e8f0;font-weight:700}tr{page-break-inside:avoid}' +
      '@media print{button{display:none}}' +
      '</style></head><body><h1>Fleet Management — Maintenance Requests Report</h1>' +
      '<p>Report Date: ' + new Date().toLocaleDateString() + ' &nbsp; | &nbsp; Total Requests: ' + rows.length + '</p>' +
      '<table><thead><tr>' +
      ['Vehicle','Location','Driver','Issue Type','Description','Priority','Status','Opened Date'].map(k => '<th>'+k+'</th>').join('') +
      '</tr></thead><tbody>' + body + '</tbody></table>' +
      '<script>window.onload=function(){window.print();}</script></body></html>');
    win.document.close();
  };

  const sendWhatsApp = async ticket => {
    try {
      const info = await getMaintenanceWhatsAppInfo(ticket.id);
      const phone = String(info.waMeNumber || info.driverPhone || '').replace(/\D/g, '');
      const url = String(info.confirmationUrl || '').trim();
      if (!phone || !url) throw new Error('Driver phone or confirmation link is not available.');
      const message = [
        'Hello ' + (info.driverName || 'Driver') + ',',
        '',
        'Vehicle ' + info.vehiclePlate + ' — Maintenance Request: ' + info.issueType,
        'Issue Type / نوع الطلب: ' + info.issueType,
        'Description / تفاصيل الطلب: ' + (info.description || 'No additional description'),
        '',
        'Has this maintenance issue been repaired?',
        'هل تم إصلاح طلب الصيانة هذا؟',
        '',
        'Please open the link below and select YES if the repair is complete.',
        'يرجى فتح الرابط أدناه واختيار YES إذا تم الإصلاح.',
        'If the repair is NOT complete, select NO. The ticket will remain open.',
        'إذا لم يتم الإصلاح، اختر NO وسيبقى الطلب مفتوحاً.',
        '',
        'Maintenance confirmation link / رابط تأكيد الإصلاح:',
        url,
        '',
        'Fleet Management'
      ].join('\n');
      window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(message), '_blank');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const statuses = [...new Set(tickets.map(t => String(t.status || '')).filter(Boolean))];

  return <div style={{width:'100%',maxWidth:'none'}}>
    <div className="panel" style={{marginBottom:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
        <div>
          <h1 style={{margin:0}}>🛠️ Maintenance Requests</h1>
          <p style={{margin:'6px 0 0',color:'#64748b'}}>Driver maintenance requests — full-width report, WhatsApp confirmation and exports.</p>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn" onClick={loadTickets}>↻ Refresh</button>
          <button className="btn btn-success" onClick={exportExcel} disabled={!rows.length}>📊 Export Excel</button>
          <button className="btn" onClick={exportPdf} disabled={!rows.length}>📄 Export PDF</button>
        </div>
      </div>
    </div>

    {error && <div className="alert alert-error">{error}</div>}

    <div className="panel" style={{marginBottom:16}}>
      <div style={{display:'grid',gridTemplateColumns:'minmax(220px,2fr) repeat(3,minmax(150px,1fr))',gap:10}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vehicle, driver or location" />
        <select value={issueFilter} onChange={e=>setIssueFilter(e.target.value)}>
          <option value="">All Issue Types</option>{ISSUE_TYPES.map(x=><option key={x}>{x}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>{statuses.map(x=><option key={x}>{x}</option>)}
        </select>
        <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} />
      </div>
      <div style={{marginTop:10,color:'#64748b',fontSize:13}}>Showing <strong>{filtered.length}</strong> of <strong>{tickets.length}</strong> maintenance requests.</div>
    </div>

    <div className="panel" style={{padding:0,overflow:'hidden'}}>
      {loading ? <div className="alert alert-info" style={{margin:16}}>Loading maintenance requests...</div> :
       !filtered.length ? <div className="alert alert-info" style={{margin:16}}>No maintenance requests found.</div> :
       <div style={{width:'100%',overflowX:'auto'}}>
        <table className="data-table" style={{width:'100%',minWidth:1100}}>
          <thead><tr>
            <th>Vehicle</th><th>Location</th><th>Driver</th><th>Issue Type</th><th>Description</th><th>Priority</th><th>Status</th><th>Opened</th><th>Actions</th>
          </tr></thead>
          <tbody>{filtered.map(t=><tr key={t.id}>
            <td><strong>{t.plate || '—'}</strong></td>
            <td>{t.site || '—'}</td>
            <td>{t.driver || '—'}</td>
            <td><strong>{t.category || '—'}</strong></td>
            <td style={{minWidth:260}}>{t.description || '—'}</td>
            <td>{t.priority || 'Medium'}</td>
            <td>{t.status || '—'}</td>
            <td>{t.opened_at ? String(t.opened_at).slice(0,10) : '—'}</td>
            <td>{t.status !== 'Completed' ? <button type="button" className="btn" style={{whiteSpace:'nowrap'}} onClick={()=>sendWhatsApp(t)}>📱 WhatsApp</button> : <span>✓ Confirmed</span>}</td>
          </tr>)}</tbody>
        </table>
       </div>}
    </div>
  </div>;
}

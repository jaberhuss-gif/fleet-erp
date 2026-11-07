import { useState, useEffect } from 'react';
import api from '../api/client';

export default function EmailUpload() {
  const [file, setFile] = useState(null);
  const [items, setItems] = useState([]);
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sites, setSites] = useState([]);
  const [defaultSite, setDefaultSite] = useState('');
  const [defaultType, setDefaultType] = useState('work_order');
  const [defaultMonth, setDefaultMonth] = useState(new Date().getMonth() + 1);
  const [defaultYear, setDefaultYear] = useState(new Date().getFullYear());
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  useEffect(() => {
    api.get('/sites').then(r => setSites(Array.isArray(r.data) ? r.data : (r.data.rows || []))).catch(() => setSites([]));
  }, []);

  const handleParse = async () => {
    if (!file) return alert('Select an email file first');
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('email', file);
      const res = await api.post('/intake/email/parse', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = res.data;
      if (data.success) {
        setEmail(data.email);
        setItems(data.issues.map(item => ({ ...item, site: defaultSite, type: defaultType, month: defaultMonth, year: defaultYear })));
      } else { alert('Failed: ' + (data.error || '')); }
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
    setLoading(false);
  };

  const applyDefaults = () => {
    setItems(items.map(item => ({ ...item, site: defaultSite, type: defaultType, month: defaultMonth, year: defaultYear })));
  };

  const updateItem = (i, field, value) => {
    const newItems = [...items]; newItems[i][field] = value; setItems(newItems);
  };

  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!items.length) return alert('No issues');
    setSaving(true);
    try {
      const res = await api.post('/intake/email/save', { email, issues: items, createdBy: 'admin' });
      const data = res.data;
      if (data.success) {
        alert('Success! Work Orders: ' + data.created.workOrders);
        setItems([]); setEmail(null); setFile(null);
      } else { alert('Failed: ' + (data.error || '')); }
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
    setSaving(false);
  };

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <h1>Email Maintenance Upload</h1>
      <div style={{ background: '#f5f5f5', padding: 20, borderRadius: 8, marginBottom: 20 }}>
        <p style={{ color: '#666', marginBottom: 10 }}>Upload saved email file (.eml, .msg, .txt)</p>
        <input type="file" accept=".eml,.msg,.txt" onChange={e => setFile(e.target.files[0])} style={{ marginBottom: 10 }} />
        <button onClick={handleParse} disabled={!file || loading} style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {loading ? 'Parsing...' : 'Parse Email'}
        </button>
      </div>
      {email && (
        <div style={{ background: '#eff6ff', padding: 15, borderRadius: 8, marginBottom: 20, borderLeft: '4px solid #3b82f6' }}>
          <div><b>From:</b> {email.fromName} ({email.from})</div>
          <div><b>Subject:</b> {email.subject}</div>
          <div><b>Date:</b> {new Date(email.receivedDate).toLocaleString()}</div>
        </div>
      )}
      {items.length > 0 && (
        <div style={{ background: '#fef3c7', padding: 15, borderRadius: 8, marginBottom: 20 }}>
          <h3>Defaults</h3>
          <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>Site: <select value={defaultSite} onChange={e => setDefaultSite(e.target.value)}><option value="">-- select --</option>{sites.map(s => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}</select></label>
            <label>Type: <select value={defaultType} onChange={e => setDefaultType(e.target.value)}><option value="work_order">Work Order</option><option value="project">Project</option></select></label>
            <label>Month: <select value={defaultMonth} onChange={e => setDefaultMonth(Number(e.target.value))}>{months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}</select></label>
            <label>Year: <select value={defaultYear} onChange={e => setDefaultYear(Number(e.target.value))}>{[2025,2026,2027,2028].map(y => <option key={y} value={y}>{y}</option>)}</select></label>
            <button onClick={applyDefaults} style={{ padding: '6px 15px', background: '#10b981', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Apply to All</button>
          </div>
        </div>
      )}
      {items.length > 0 && (
        <>
          <div style={{ marginBottom: 10, fontWeight: 'bold' }}>Issues ({items.length})</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
            <thead><tr style={{ background: '#1e293b', color: 'white' }}>
              <th style={{ padding: 10 }}>#</th><th style={{ padding: 10 }}>Issue</th><th style={{ padding: 10 }}>Priority</th><th style={{ padding: 10 }}>Price</th><th style={{ padding: 10 }}>Site</th><th style={{ padding: 10 }}>Type</th><th style={{ padding: 10 }}>Month</th><th style={{ padding: 10 }}>X</th>
            </tr></thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td style={{ padding: 8, textAlign: 'center' }}>{item.no}</td>
                  <td style={{ padding: 8 }}><input value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} style={{ width: '100%', padding: 6 }} /></td>
                  <td style={{ padding: 8 }}><select value={item.priority} onChange={e => updateItem(i, 'priority', e.target.value)}><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Urgent">Urgent</option></select></td>
                  <td style={{ padding: 8 }}><input type="number" value={item.price} onChange={e => updateItem(i, 'price', Number(e.target.value))} placeholder="price" style={{ width: 100, padding: 6, border: '2px solid #f59e0b', background: '#fffbeb' }} /></td>
                  <td style={{ padding: 8 }}><select value={item.site} onChange={e => updateItem(i, 'site', e.target.value)}><option value="">--</option>{sites.map(s => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}</select></td>
                  <td style={{ padding: 8 }}><select value={item.type} onChange={e => updateItem(i, 'type', e.target.value)}><option value="work_order">Work Order</option><option value="project">Project</option></select></td>
                  <td style={{ padding: 8 }}><select value={item.month} onChange={e => updateItem(i, 'month', Number(e.target.value))}>{months.map((m, idx) => <option key={idx+1} value={idx+1}>{m}</option>)}</select></td>
                  <td style={{ padding: 8, textAlign: 'center' }}><button onClick={() => removeItem(i)} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}>X</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleSave} disabled={saving} style={{ marginTop: 20, padding: '14px 40px', background: saving ? '#94a3b8' : '#10b981', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving...' : 'Save All'}
          </button>
        </>
      )}
    </div>
  );
}

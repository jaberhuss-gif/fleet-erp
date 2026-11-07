import { useEffect, useState } from 'react';
import api from '../api/client';

export default function DriverHandovers() {
  const [handovers, setHandovers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/driver-handovers');
      setHandovers(res.data?.handovers || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = handovers.filter(h => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(h.vehicle_plate || '').toLowerCase().includes(q) ||
      String(h.previous_driver_name || '').toLowerCase().includes(q) ||
      String(h.new_driver_name || '').toLowerCase().includes(q)
    );
  });

  const openPdf = async (id) => {
    try {
      setMessage("");
      setError("");
      const res = await api.get("/driver-handovers/" + id + "/pdf", { responseType: "text" });
      const html = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const sendWhatsApp = async (h) => {
    try {
      setMessage('');
      setError('');
      // استخدام endpoint pdf (أو WhatsApp)
      const res = await api.get('/driver-handovers/' + h.id + '/pdf');
      setMessage('Opened handover PDF for ' + h.vehicle_plate);
      // فتح PDF
      openPdf(h.id);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const removeHandover = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التسليم؟')) return;
    try {
      await api.delete('/driver-handovers/' + id);
      setMessage('تم الحذف');
      load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const fmtDate = (d) => d ? String(d).slice(0, 10) : '-';
  const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');

  return (
    <div className="page">
      <div className="panel" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: '0 0 6px' }}>📋 Driver Handovers</h1>
        <div style={{ color: '#64748b' }}>
          Vehicle handover records between drivers.
        </div>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search vehicle / driver..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', minWidth: 260 }}
          />
          <button className="btn btn-primary" onClick={load}>↻ Refresh</button>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Vehicle</th>
                <th>Previous Driver</th>
                <th>New Driver</th>
                <th>KM at Handover</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(h => (
                <tr key={h.id}>
                  <td>{fmtDate(h.handover_date)}</td>
                  <td><strong>{h.vehicle_plate || '-'}</strong></td>
                  <td>{h.previous_driver_name || '-'}<br /><small>{h.previous_driver_phone || ''}</small></td>
                  <td>{h.new_driver_name || '-'}<br /><small>{h.new_driver_phone || ''}</small></td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(h.km_at_handover)}</td>
                  <td style={{ maxWidth: 260, whiteSpace: 'pre-wrap' }}>{h.notes || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn" style={{ padding: '6px 10px' }} onClick={() => openPdf(h.id)}>📄 PDF</button>
                      <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => removeHandover(h.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>No handovers recorded.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

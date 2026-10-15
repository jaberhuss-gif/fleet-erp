@'
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

  // PDF - يستخدم responseType blob
  const openPdf = async (id) => {
    try {
      setMessage('');
      setError('');
      const res = await api.get('/driver-handovers/' + id + '/pdf', {
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  // WhatsApp - يفتح wa.me + يسجّل في Backend
  const sendWhatsApp = async (h) => {
    try {
      setMessage('');
      setError('');

      const phone = String(h.new_driver_phone || '').replace(/[^0-9]/g, '');
      if (!phone) {
        setError('No phone number for new driver');
        return;
      }

      const text = encodeURIComponent(
        'Vehicle Handover Report\n' +
        'Vehicle: ' + (h.vehicle_plate || '-') + '\n' +
        'Date: ' + String(h.handover_date || '').slice(0, 10) + '\n' +
        'Previous Driver: ' + (h.previous_driver_name || '-') + '\n' +
        'New Driver: ' + (h.new_driver_name || '-') + '\n' +
        'KM: ' + (h.km_at_handover || 0) + '\n' +
        'Notes: ' + (h.notes || '-')
      );

      window.open('https://wa.me/' + phone + '?text=' + text, '_blank');

      await api.post('/driver-handovers/' + h.id + '/whatsapp-sent');

      setMessage('WhatsApp opened for ' + (h.new_driver_name || 'driver'));
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const removeHandover = async (id) => {
    if (!window.confirm('Delete this handover? This cannot be undone.')) return;
    try {
      await api.delete('/driver-handovers/' + id);
      setMessage('Deleted successfully');
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
        <h1 style={{ margin: '0 0 6px' }}>&#128203; Driver Handovers</h1>
        <div style={{ color: '#64748b' }}>
          Vehicle handover records between drivers.
        </div>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Search vehicle / driver..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', minWidth: 300, fontSize: 14 }}
          />
          <button
            className="btn btn-primary"
            onClick={load}
            style={{ padding: '10px 20px' }}
          >
            &#8635; Refresh
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ color: '#64748b', fontSize: 13 }}>
            Total: <strong>{filtered.length}</strong>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', minWidth: 1100 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '12px 10px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left' }}>Vehicle</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left' }}>Previous Driver</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left' }}>New Driver</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>KM</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left' }}>Notes</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px' }}>{fmtDate(h.handover_date)}</td>
                    <td style={{ padding: '10px' }}>
                      <strong style={{ color: '#1e293b' }}>{h.vehicle_plate || '-'}</strong>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ fontWeight: 500 }}>{h.previous_driver_name || '-'}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{h.previous_driver_phone || ''}</div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ fontWeight: 500 }}>{h.new_driver_name || '-'}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{h.new_driver_phone || ''}</div>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {fmtNum(h.km_at_handover)}
                    </td>
                    <td style={{ padding: '10px', maxWidth: 260, fontSize: 13 }}>
                      {h.notes ? String(h.notes).slice(0, 100) + (h.notes.length > 100 ? '...' : '') : '-'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          className="btn"
                          style={{ padding: '6px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                          onClick={() => openPdf(h.id)}
                          title="Print PDF Report"
                        >
                          &#128196; PDF
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '6px 12px', background: '#25D366', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                          onClick={() => sendWhatsApp(h)}
                          title="Send via WhatsApp"
                        >
                          &#128241; WhatsApp
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '6px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                          onClick={() => removeHandover(h.id)}
                          title="Delete"
                        >
                          &#128465;
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                      <div style={{ fontSize: 48, marginBottom: 10 }}>&#128203;</div>
                      <div>No handovers recorded.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
'@ | Out-File -FilePath .\DriverHandovers.jsx -Encoding utf8 -Force

Write-Host "✅ DriverHandovers.jsx updated" -ForegroundColor Green
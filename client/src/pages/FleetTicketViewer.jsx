import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { printContent } from '../api/print';

export default function FleetTicketViewer({ user }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState('maintenance');
  const [status, setStatus] = useState('all');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [maintenanceRes, kmRes] = await Promise.all([
        api.get('/tickets?fleetType=maintenance'),
        api.get('/tickets?fleetType=km')
      ]);
      const maintenance = Array.isArray(maintenanceRes.data?.tickets) ? maintenanceRes.data.tickets : [];
      const km = Array.isArray(kmRes.data?.tickets) ? kmRes.data.tickets : [];
      setTickets([...maintenance, ...km]);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load vehicle tickets.');
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsApp = async (id) => {
    if (user?.role !== 'Owner') return;
    try {
      // Always read the current vehicle assignment/phone from PostgreSQL
      // immediately before opening WhatsApp. Never use a stale ticket snapshot.
      const res = await api.get('/tickets/' + id + '/whatsapp-info');
      const info = res.data || {};
      if (!info.driverPhone) {
        alert('No phone number found for the current driver assigned to this vehicle.');
        return;
      }

      const ticket = tickets.find(t => t.id === id);
      const isKm = String(ticket?.category || '').toLowerCase() === 'daily km';
      const msg = !isKm
        ? 'Hello ' + (info.driverName || 'Driver') + ',\\n\\n' +
          'Vehicle ' + (info.vehiclePlate || '') + ' requires maintenance.\\n' +
          'Current: ' + Number(info.currentKm || 0).toLocaleString() + ' km\\n\\n' +
          'Please visit the workshop.\\n\\n' +
          'Thank you,\\nFleet Management'
        : 'Hello ' + (info.driverName || 'Driver') + ',\\n\\n' +
          'No KM reading recorded today for vehicle ' + (info.vehiclePlate || '') + '.\\n' +
          'Last reading: ' + Number(info.currentKm || 0).toLocaleString() + ' km.\\n\\n' +
          'Please record before 7:00 AM.\\n\\n' +
          'Thank you,\\nFleet Management';

      const url = 'https://wa.me/' + info.driverPhone + '?text=' + encodeURIComponent(msg);
      window.open(url, '_blank');
      await api.put('/tickets/' + id + '/log-whatsapp', {});
    } catch (e) {
      alert('WhatsApp failed: ' + (e.response?.data?.error || e.message));
    }
  };

  useEffect(() => { load(); }, []);

  const vehicleTickets = useMemo(() => {
    const maintenance = tickets.filter(t => String(t.category || '').toLowerCase() !== 'daily km' && String(t.category || '').toLowerCase() !== 'daily vehicle submission');
    const km = tickets.filter(t => String(t.category || '').toLowerCase() === 'daily km');
    return { maintenance, km };
  }, [tickets]);

  const scoped = type === 'km' ? vehicleTickets.km : vehicleTickets.maintenance;
  const counts = useMemo(() => ({
    total: scoped.length,
    open: scoped.filter(t => t.status === 'Open').length,
    closed: scoped.filter(t => t.status === 'Closed').length
  }), [scoped]);

  const filtered = useMemo(() => {
    if (status === 'open') return scoped.filter(t => t.status === 'Open');
    if (status === 'closed') return scoped.filter(t => t.status === 'Closed');
    return scoped;
  }, [scoped, status]);

  const statusStyle = (value) => value === 'Closed'
    ? { background: '#dcfce7', color: '#166534' }
    : { background: '#fee2e2', color: '#b91c1c' };

  if (loading) return <div className="loading">Loading vehicle tickets...</div>;

  return (
    <div>
      <div className="panel" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0 }}>🚗 Vehicle Tickets</h1>
            <p style={{ margin: '6px 0 0', color: '#64748b' }}>
              Vehicle maintenance/issues and Daily KM compliance are completely separated.
            </p>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-secondary" onClick={() => printContent(type === 'km' ? 'Daily KM Tickets' : 'Vehicle Maintenance Tickets', 'Fleet ticket report')}>🖨️ Print</button>
            <button className="btn btn-primary" onClick={load}>🔄 Refresh</button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap' }}>
        <button className={type === 'maintenance' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => {setType('maintenance');setStatus('all');}}>🔧 Maintenance ({vehicleTickets.maintenance.length})</button>
        {![ 'SupportManager', 'SSM' ].includes(user?.role) && <button className={type === 'km' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => {setType('km');setStatus('all');}}>📏 Daily KM ({vehicleTickets.km.length})</button>}
      </div>

      <div className="cards-grid" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3>{type === 'km' ? 'Daily KM Tickets' : 'Vehicle Maintenance Tickets'}</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{counts.total}</div>
          <div className="sub">Vehicle tickets</div>
        </div>
        <div className="card danger">
          <h3>Open</h3>
          <div className="big-number" style={{ color: '#dc2626' }}>{counts.open}</div>
          <div className="sub">Pending / in progress</div>
        </div>
        <div className="card success">
          <h3>Closed</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{counts.closed}</div>
          <div className="sub">Completed</div>
        </div>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button className={status === 'all' ? 'btn btn-primary' : 'btn btn-warning'} onClick={() => setStatus('all')}>
            All ({counts.total})
          </button>
          <button className={status === 'open' ? 'btn btn-primary' : 'btn btn-warning'} onClick={() => setStatus('open')}>
            Open ({counts.open})
          </button>
          <button className={status === 'closed' ? 'btn btn-primary' : 'btn btn-warning'} onClick={() => setStatus('closed')}>
            Closed ({counts.closed})
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="alert alert-info">No vehicle tickets match this filter.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Date</th>
                <th>Vehicle</th>
                <th>Issue</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Description</th>
                {user?.role === 'Owner' && <th>WhatsApp</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 'bold' }}>#{t.id}</td>
                  <td>{String(t.opened_at || '').slice(0, 10)}</td>
                  <td style={{ fontWeight: 'bold' }}>{t.plate || '-'}</td>
                  <td>{t.category || '-'}</td>
                  <td>{t.priority || '-'}</td>
                  <td>
                    <span style={{ ...statusStyle(t.status), display: 'inline-block', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                      {t.status || '-'}
                    </span>
                  </td>
                  <td>{t.description || '-'}</td>
                  {user?.role === 'Owner' && (
                    <td>
                      <button
                        className="btn btn-success"
                        style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}
                        onClick={() => handleWhatsApp(t.id)}
                      >
                        📱 WhatsApp
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

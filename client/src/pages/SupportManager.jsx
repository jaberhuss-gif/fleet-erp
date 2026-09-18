import { useEffect, useState } from 'react';
import api from '../api/client';

export default function SupportManager() {
  const [tickets, setTickets] = useState([]);
  const [warehouse, setWarehouse] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [t, w] = await Promise.all([
        api.get('/support-manager/tickets'),
        api.get('/support-manager/warehouse')
      ]);
      setTickets(t.data.tickets || []);
      setWarehouse(w.data.items || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load site information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visibleTickets = filter === 'open'
    ? tickets.filter(t => t.status === 'Open')
    : filter === 'closed'
      ? tickets.filter(t => t.status === 'Closed')
      : tickets;

  const open = tickets.filter(t => t.status === 'Open').length;
  const closed = tickets.filter(t => t.status === 'Closed').length;

  if (loading) return <div className="loading">Loading site view...</div>;

  return (
    <div>
      <div className="panel" style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0 }}>👀 Support Manager</h1>
        <p style={{ margin: '6px 0 0', color: '#64748b' }}>
          Read-only view — {user?.site || 'Assigned Site'}
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="cards-grid" style={{ marginBottom: 18 }}>
        <div className="card danger">
          <h3>Open Tickets</h3>
          <div className="big-number" style={{ color: '#dc2626' }}>{open}</div>
          <div className="sub">Pending</div>
        </div>
        <div className="card success">
          <h3>Closed Tickets</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{closed}</div>
          <div className="sub">Completed</div>
        </div>
        <div className="card">
          <h3>Warehouse Items</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{warehouse.length}</div>
          <div className="sub">Read-only stock view</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>🎫 Site Tickets</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button className={filter === 'all' ? 'btn btn-primary' : 'btn btn-warning'} onClick={() => setFilter('all')}>All ({tickets.length})</button>
          <button className={filter === 'open' ? 'btn btn-primary' : 'btn btn-warning'} onClick={() => setFilter('open')}>Open ({open})</button>
          <button className={filter === 'closed' ? 'btn btn-primary' : 'btn btn-warning'} onClick={() => setFilter('closed')}>Closed ({closed})</button>
        </div>

        {visibleTickets.length === 0 ? (
          <div className="alert alert-info">No tickets for this site.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Ticket</th><th>Date</th><th>Vehicle</th><th>Category</th><th>Priority</th><th>Status</th><th>Description</th></tr>
            </thead>
            <tbody>
              {visibleTickets.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 700 }}>#{t.id}</td>
                  <td>{String(t.opened_at || '').slice(0, 10)}</td>
                  <td>{t.plate || '-'}</td>
                  <td>{t.category || '-'}</td>
                  <td>{t.priority || '-'}</td>
                  <td>
                    <span className={t.status === 'Closed' ? 'status-badge status-safe' : 'status-badge status-warning'}>
                      {t.status}
                    </span>
                  </td>
                  <td>{t.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>📦 Site Warehouse</h2>
        {warehouse.length === 0 ? (
          <div className="alert alert-info">No stock records for this site.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Item</th><th>Location</th><th>Quantity</th><th>Min Stock</th><th>Unit</th></tr>
            </thead>
            <tbody>
              {warehouse.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 700 }}>{item.name || item.item_code || '-'}</td>
                  <td>{item.location_code || '-'}</td>
                  <td>{Number(item.quantity || 0).toLocaleString()}</td>
                  <td>{Number(item.min_stock || 0).toLocaleString()}</td>
                  <td>{item.unit || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

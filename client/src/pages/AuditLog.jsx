import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [l, s] = await Promise.all([
        api.get('/audit-log'),
        api.get('/audit-log/stats')
      ]);
      setLogs(l.data.logs || []);
      setStats(s.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleClear = async () => {
    if (!confirm('Delete logs older than 90 days?')) return;
    try {
      const res = await api.delete('/audit-log/clear?days=90');
      setMessage('Deleted ' + res.data.deleted + ' old logs');
      load();
    } catch (e) { setError(e.message); }
  };

  const filtered = logs.filter(l => {
    const matchSearch = search === '' ||
      (l.username || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.action || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.details || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.entity_type || '').toLowerCase().includes(search.toLowerCase());
    const matchAction = filterAction === 'all' || l.action === filterAction;
    const matchUser = filterUser === 'all' || l.username === filterUser;
    const matchFrom = !fromDate || String(l.created_at).slice(0, 10) >= fromDate;
    const matchTo = !toDate || String(l.created_at).slice(0, 10) <= toDate;
    return matchSearch && matchAction && matchUser && matchFrom && matchTo;
  });

  const actions = [...new Set(logs.map(l => l.action).filter(Boolean))].sort();
  const users = [...new Set(logs.map(l => l.username).filter(Boolean))].sort();

  const getActionColor = (action) => {
    const a = (action || '').toLowerCase();
    if (a.includes('create') || a.includes('add')) return { bg: '#dcfce7', color: '#16a34a' };
    if (a.includes('delete')) return { bg: '#fee2e2', color: '#dc2626' };
    if (a.includes('update') || a.includes('edit')) return { bg: '#fef3c7', color: '#b45309' };
    if (a.includes('login')) return { bg: '#dbeafe', color: '#1e40af' };
    if (a.includes('complete')) return { bg: '#dcfce7', color: '#16a34a' };
    return { bg: '#f1f5f9', color: '#64748b' };
  };

  return (
    <div>
      {/* Gradient Header */}
      <div style={{ background: 'linear-gradient(135deg, #475569 0%, #1e293b 100%)', padding: '28px 24px', borderRadius: '12px', marginBottom: '20px', color: 'white' }}>
        <h2 style={{ margin: 0, fontSize: '24px' }}>📋 Audit Log</h2>
        <p style={{ margin: '6px 0 0', opacity: 0.85, fontSize: '14px' }}>Track all system activities</p>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Stats */}
      {stats && (
        <>
          <div className="cards-grid" style={{ marginBottom: '20px' }}>
            <div className="card">
              <h3>Total Logs</h3>
              <div className="big-number" style={{ color: '#1e3a8a' }}>{stats.total}</div>
              <div className="sub">All time</div>
            </div>
            <div className="card success">
              <h3>Today</h3>
              <div className="big-number" style={{ color: '#16a34a' }}>{stats.today}</div>
              <div className="sub">Activities today</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            <div className="panel">
              <h2>Top Users</h2>
              {stats.byUser && stats.byUser.length > 0 ? (
                <table>
                  <thead><tr><th>User</th><th>Actions</th></tr></thead>
                  <tbody>
                    {stats.byUser.map((u, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 'bold' }}>{u.username}</td>
                        <td>{u.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="alert alert-info">No data</div>}
            </div>
            <div className="panel">
              <h2>Top Actions</h2>
              {stats.byAction && stats.byAction.length > 0 ? (
                <table>
                  <thead><tr><th>Action</th><th>Count</th></tr></thead>
                  <tbody>
                    {stats.byAction.map((a, i) => (
                      <tr key={i}>
                        <td>{a.action}</td>
                        <td>{a.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="alert alert-info">No data</div>}
            </div>
          </div>
        </>
      )}

      {/* Logs */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ margin: 0 }}>Audit Log ({logs.length})</h2>
          <div className="btn-row" style={{ margin: 0 }}>
            <button className="btn btn-success" style={{ marginRight: '8px' }} onClick={() => exportToCSV(filtered, 'audit-log', [{key:"created_at",label:"Date"},{key:"username",label:"User"},{key:"action",label:"Action"},{key:"entity_type",label:"Entity"},{key:"entity_id",label:"ID"},{key:"details",label:"Details"}])}>Export CSV</button>
            <button className="btn btn-danger" onClick={handleClear}>Clear Old (90d)</button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="User / Action / Details" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>User</label>
            <select value={filterUser} onChange={e => setFilterUser(e.target.value)}>
              <option value="all">All Users</option>
              {users.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Action</label>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
              <option value="all">All Actions</option>
              {actions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-warning" onClick={() => { setSearch(''); setFilterUser('all'); setFilterAction('all'); setFromDate(''); setToDate(''); }} style={{ width: '100%' }}>Clear</button>
          </div>
        </div>

        <div style={{ marginBottom: '12px', color: '#64748b', fontSize: '14px' }}>
          Showing <strong>{filtered.length}</strong> of {logs.length} entries
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="alert alert-info">No audit entries yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date & Time</th><th>User</th><th>Action</th>
                <th>Entity</th><th>ID</th><th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const c = getActionColor(l.action);
                return (
                  <tr key={l.id}>
                    <td style={{ fontSize: '13px', color: '#64748b' }}>{l.created_at}</td>
                    <td style={{ fontWeight: 'bold' }}>{l.username || '-'}</td>
                    <td>
                      <span className="status-badge" style={{ background: c.bg, color: c.color }}>
                        {l.action}
                      </span>
                    </td>
                    <td>{l.entity_type || '-'}</td>
                    <td>{l.entity_id || '-'}</td>
                    <td style={{ fontSize: '13px' }}>{l.details || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

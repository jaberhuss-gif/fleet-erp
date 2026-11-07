import { useState, useEffect } from 'react';
import api from '../api/client';

export default function MyTickets() {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    setUser(u);
    if (u) load(u);
  }, []);

  const load = async (u) => {
    try {
      setLoading(true);
      // Use username as reporter name (or fullName)
      const reporterName = u.fullName || u.username;
      const [t, s] = await Promise.all([
        api.get('/tickets/by-reporter/' + encodeURIComponent(reporterName)),
        api.get('/tickets/stats/' + encodeURIComponent(reporterName))
      ]);
      setTickets(t.data.tickets || []);
      setStats(s.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const filtered = tickets.filter(t => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'open') return t.status === 'Open';
    if (filterStatus === 'acknowledged') return t.status === 'Acknowledged';
    if (filterStatus === 'closed') return t.status === 'Closed';
    return true;
  });

  const getStatusStyle = (s) => {
    if (s === 'Open') return { bg: '#fee2e2', color: '#dc2626', icon: '📤', label: 'Submitted - Pending Review' };
    if (s === 'Acknowledged') return { bg: '#fef3c7', color: '#b45309', icon: '👁️', label: 'Acknowledged - Under Review' };
    if (s === 'Closed') return { bg: '#dcfce7', color: '#16a34a', icon: '✅', label: 'Resolved' };
    return { bg: '#f1f5f9', color: '#64748b', icon: '⚪', label: s };
  };

  if (loading) return <div className="loading">Loading your tickets...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      {/* Header */}
      <div className="panel" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)', color: 'white', border: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '26px' }}>📋 My Tickets</h1>
            <p style={{ marginTop: '6px', opacity: 0.9, fontSize: '14px' }}>
              Track your submitted issues and their status
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', opacity: 0.85 }}>Logged in as</div>
            <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{user?.fullName || user?.username}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="cards-grid" style={{ marginBottom: '20px' }}>
          <div className="card danger">
            <h3>📤 Pending</h3>
            <div className="big-number" style={{ color: '#dc2626' }}>{stats.open}</div>
            <div className="sub">Waiting for review</div>
          </div>
          <div className="card warning">
            <h3>👁️ Acknowledged</h3>
            <div className="big-number" style={{ color: '#f59e0b' }}>{stats.acknowledged}</div>
            <div className="sub">Being handled</div>
          </div>
          <div className="card success">
            <h3>✅ Closed</h3>
            <div className="big-number" style={{ color: '#16a34a' }}>{stats.closed}</div>
            <div className="sub">Resolved</div>
          </div>
          <div className="card">
            <h3>📊 Total</h3>
            <div className="big-number" style={{ color: '#1e3a8a' }}>{stats.total}</div>
            <div className="sub">All tickets</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="panel">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button className={filterStatus === 'all' ? 'btn btn-primary' : 'btn btn-warning'} onClick={() => setFilterStatus('all')}>
            All ({tickets.length})
          </button>
          <button className={filterStatus === 'open' ? 'btn btn-primary' : 'btn btn-warning'} onClick={() => setFilterStatus('open')}>
            📤 Pending ({tickets.filter(t => t.status === 'Open').length})
          </button>
          <button className={filterStatus === 'acknowledged' ? 'btn btn-primary' : 'btn btn-warning'} onClick={() => setFilterStatus('acknowledged')}>
            👁️ Acknowledged ({tickets.filter(t => t.status === 'Acknowledged').length})
          </button>
          <button className={filterStatus === 'closed' ? 'btn btn-primary' : 'btn btn-warning'} onClick={() => setFilterStatus('closed')}>
            ✅ Closed ({tickets.filter(t => t.status === 'Closed').length})
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="alert alert-info">
            {filterStatus === 'all' 
              ? 'No tickets yet. Use "Smart Report Issue" to submit your first report.'
              : 'No tickets match this filter.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {filtered.map(t => {
              const s = getStatusStyle(t.status);
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  style={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderLeft: '5px solid ' + s.color,
                    borderRadius: '10px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ flex: 1, minWidth: '250px' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="status-badge" style={{ background: s.bg, color: s.color, fontSize: '12px', fontWeight: 'bold' }}>
                          {s.icon} {t.status}
                        </span>
                        <span style={{ fontWeight: 'bold', color: '#64748b', fontSize: '13px' }}>#{t.id}</span>
                        <span style={{ color: '#64748b', fontSize: '12px' }}>• {t.category}</span>
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                          • {String(t.opened_at || '').slice(0, 10)}
                        </span>
                      </div>
                      <div style={{ marginTop: '8px', fontWeight: 'bold', fontSize: '15px' }}>
                        🚗 {t.plate || 'Unknown vehicle'}
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '13px', color: '#475569' }}>
                        {String(t.description || '').split('---')[0].slice(0, 150)}
                        {String(t.description || '').length > 150 ? '...' : ''}
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                        {s.label}
                      </div>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '24px' }}>›</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedTicket && (
        <div
          onClick={() => setSelectedTicket(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '12px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            {(() => {
              const s = getStatusStyle(selectedTicket.status);
              return (
                <>
                  {/* Header */}
                  <div style={{ background: s.bg, padding: '20px 24px', borderBottom: '1px solid #e2e8f0', borderRadius: '12px 12px 0 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: s.color, textTransform: 'uppercase' }}>
                          {s.icon} {selectedTicket.status}
                        </div>
                        <h2 style={{ margin: '6px 0 0 0', color: s.color }}>Ticket #{selectedTicket.id}</h2>
                      </div>
                      <button
                        onClick={() => setSelectedTicket(null)}
                        style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: s.color, padding: 0, width: '32px' }}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '24px' }}>
                    {/* Timeline */}
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ marginTop: 0 }}>📅 Status Timeline</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>✓</div>
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Reported</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedTicket.opened_at}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: selectedTicket.acknowledged_at ? '#fef3c7' : '#f1f5f9', color: selectedTicket.acknowledged_at ? '#b45309' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>👁️</div>
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: '14px', color: selectedTicket.acknowledged_at ? '#1e293b' : '#94a3b8' }}>Acknowledged</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                              {selectedTicket.acknowledged_at
                                ? selectedTicket.acknowledged_at + (selectedTicket.acknowledged_by ? ' — by ' + selectedTicket.acknowledged_by : '')
                                : 'Pending review'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: selectedTicket.closed_at ? '#dcfce7' : '#f1f5f9', color: selectedTicket.closed_at ? '#16a34a' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>✅</div>
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: '14px', color: selectedTicket.closed_at ? '#1e293b' : '#94a3b8' }}>Resolved</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                              {selectedTicket.closed_at
                                ? selectedTicket.closed_at + (selectedTicket.closed_by ? ' — by ' + selectedTicket.closed_by : '')
                                : 'Waiting for resolution'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div style={{ marginBottom: '20px' }}>
                      <h3>🚗 Vehicle</h3>
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                        <strong>{selectedTicket.plate || 'Unknown'}</strong>
                        {selectedTicket.location && <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>📍 {selectedTicket.location}</div>}
                      </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <h3>📝 Your Report</h3>
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                        {String(selectedTicket.description || '').split('--- Auto-Detected Issue ---')[0].trim()}
                      </div>
                    </div>

                    {selectedTicket.description && selectedTicket.description.includes('Auto-Detected Issue') && (
                      <div style={{ marginBottom: '20px' }}>
                        <h3>🧠 Auto-Diagnosis</h3>
                        <div style={{ background: '#faf5ff', padding: '12px', borderRadius: '8px', fontSize: '13px', color: '#6b21a8' }}>
                          {selectedTicket.description.split('--- Auto-Detected Issue ---')[1]}
                        </div>
                      </div>
                    )}

                    {selectedTicket.resolution_notes && (
                      <div style={{ marginBottom: '20px' }}>
                        <h3>✅ Resolution Notes</h3>
                        <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', fontSize: '14px', borderLeft: '4px solid #16a34a' }}>
                          {selectedTicket.resolution_notes}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderRadius: '0 0 12px 12px', textAlign: 'center' }}>
                    <button className="btn btn-primary" onClick={() => setSelectedTicket(null)}>Close</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

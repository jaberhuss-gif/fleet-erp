import { useEffect, useState } from 'react';
import api from '../api/client';

export default function InspectionTracker() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all | expired | expiring | valid

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/vehicles/inspection/tracker');
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="loading">Loading inspection tracker...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const { summary, expired, expiring, valid } = data;

  const getVehicles = () => {
    if (filter === 'expired') return expired;
    if (filter === 'expiring') return expiring;
    if (filter === 'valid') return valid;
    return [...expired, ...expiring, ...valid];
  };

  const vehicles = getVehicles();

  const cardStyle = (bg, border) => ({
    background: bg, borderLeft: `4px solid ${border}`,
    borderRadius: '8px', padding: '16px 20px', flex: 1,
    minWidth: '180px', textAlign: 'center'
  });

  const statStyle = (count, color) => ({
    fontSize: '32px', fontWeight: 700, color: count > 0 ? color : '#94a3b8'
  });

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>🔍 Vehicle Inspection Tracker</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
            Annual inspection status for all active vehicles · Updated: {data.today}
          </p>
        </div>
        <button className="btn" onClick={load} style={{ padding: '8px 16px' }}>↻ Refresh</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={cardStyle('#fef2f2', '#dc2626')}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#991b1b', textTransform: 'uppercase' }}>Expired</div>
          <div style={statStyle(summary.expired, '#dc2626')}>{summary.expired}</div>
          <div style={{ fontSize: '11px', color: '#7f1d1d' }}>Needs immediate action</div>
        </div>
        <div style={cardStyle('#fffbeb', '#f59e0b')}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', textTransform: 'uppercase' }}>Expiring ≤60d</div>
          <div style={statStyle(summary.expiring, '#f59e0b')}>{summary.expiring}</div>
          <div style={{ fontSize: '11px', color: '#78350f' }}>Schedule inspection soon</div>
        </div>
        <div style={cardStyle('#f0fdf4', '#16a34a')}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#166534', textTransform: 'uppercase' }}>Valid</div>
          <div style={statStyle(summary.valid, '#16a34a')}>{summary.valid}</div>
          <div style={{ fontSize: '11px', color: '#14532d' }}>Inspection current</div>
        </div>
        <div style={cardStyle('#f8fafc', '#64748b')}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Total</div>
          <div style={statStyle(summary.total, '#0f172a')}>{summary.total}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Active vehicles</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[
          { key: 'all', label: `All (${summary.total})` },
          { key: 'expired', label: `🔴 Expired (${summary.expired})` },
          { key: 'expiring', label: `🟡 Expiring (${summary.expiring})` },
          { key: 'valid', label: `🟢 Valid (${summary.valid})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
              border: filter === tab.key ? '2px solid #0f172a' : '1px solid #cbd5e1',
              background: filter === tab.key ? '#0f172a' : '#fff',
              color: filter === tab.key ? '#fff' : '#334155',
              fontWeight: 600, fontSize: '13px'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Vehicle table */}
      {vehicles.length === 0 ? (
        <div className="alert alert-info">No vehicles in this category.</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#0f172a' }}>Plate</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#0f172a' }}>Driver</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#0f172a' }}>Phone</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#0f172a' }}>Location</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>KM</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#0f172a' }}>Expiry Date</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#0f172a' }}>Days Left</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#0f172a' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v, i) => {
                const isExpired = v.days_remaining < 0;
                const isExpiring = v.days_remaining >= 0 && v.days_remaining <= 60;
                const rowBg = isExpired ? '#fef2f2' : isExpiring ? '#fffbeb' : i % 2 ? '#fff' : '#f8fafc';
                const daysColor = isExpired ? '#dc2626' : isExpiring ? '#d97706' : '#16a34a';
                const statusBadge = isExpired
                  ? { bg: '#fecaca', color: '#991b1b', text: 'EXPIRED' }
                  : isExpiring
                  ? { bg: '#fde68a', color: '#92400e', text: 'EXPIRING' }
                  : { bg: '#bbf7d0', color: '#166534', text: 'VALID' };

                return (
                  <tr key={v.id} style={{ background: rowBg, borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{v.plate}</td>
                    <td style={{ padding: '8px 12px', color: '#334155' }}>{v.driver}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: '12px' }}>{v.phone || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{v.location}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b', fontFamily: 'monospace' }}>{Number(v.current_km).toLocaleString()}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: '#334155', fontFamily: 'monospace' }}>{v.inspection_expiry_date}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: daysColor }}>
                      {v.days_remaining < 0 ? `${Math.abs(v.days_remaining)}d ago` : `${v.days_remaining}d`}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{
                        background: statusBadge.bg, color: statusBadge.color,
                        padding: '3px 10px', borderRadius: '12px',
                        fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px'
                      }}>
                        {statusBadge.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

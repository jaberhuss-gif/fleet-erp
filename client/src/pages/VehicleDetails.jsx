import { useState, useEffect } from 'react';
import api from '../api/client';

export default function VehicleDetails({ vehicleId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, [vehicleId]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/vehicles/' + vehicleId + '/details');
      setData(res.data);
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">No data</div>;

  const v = data.vehicle;
  const readings = data.readings || [];
  const oilChanges = data.oilChanges || [];

  const statusClass = v.status === 'Urgent Overdue' ? 'status-urgent' : v.status === 'Warning' ? 'status-warning' : 'status-safe';
  const statusText = v.status === 'Urgent Overdue' ? 'Overdue' : v.status;

  // Build chart data
  const chartReadings = readings.slice(0, 30).reverse();
  const minKm = chartReadings.length ? Math.min(...chartReadings.map(r => r.reading_km)) : 0;
  const maxKm = chartReadings.length ? Math.max(...chartReadings.map(r => r.reading_km)) : 1;
  const range = maxKm - minKm || 1;

  return (
    <div>
      <button className="btn btn-warning" onClick={onBack} style={{ marginBottom: '16px' }}>← Back to Vehicles</button>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ margin: 0 }}>{v.plate}</h2>
          <span className={'status-badge ' + statusClass} style={{ fontSize: '14px', padding: '6px 14px' }}>{statusText}</span>
        </div>

        <div className="cards-grid" style={{ marginTop: '20px' }}>
          <div className="card">
            <h3>Driver</h3>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{v.driver}</div>
            <div className="sub">{v.phone || '-'}</div>
          </div>
          <div className="card">
            <h3>Location</h3>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{v.location || '-'}</div>
          </div>
          <div className="card success">
            <h3>Current Odometer</h3>
            <div className="big-number" style={{ color: '#1e3a8a' }}>{v.currentKm.toLocaleString()}</div>
            <div className="sub">km</div>
          </div>
          <div className="card">
            <h3>Last Oil Change</h3>
            <div className="big-number" style={{ color: '#16a34a' }}>{v.lastOilKm.toLocaleString()}</div>
            <div className="sub">km</div>
          </div>
          <div className={v.sinceOil >= 5000 ? 'card danger' : v.sinceOil >= 4500 ? 'card warning' : 'card'}>
            <h3>KM Since Oil</h3>
            <div className="big-number" style={{ color: v.sinceOil >= 5000 ? '#dc2626' : v.sinceOil >= 4500 ? '#f59e0b' : '#16a34a' }}>
              {v.sinceOil.toLocaleString()}
            </div>
            <div className="sub">km</div>
          </div>
          <div className="card">
            <h3>Remaining</h3>
            <div className="big-number" style={{ color: v.remaining <= 0 ? '#dc2626' : '#1e3a8a' }}>
              {v.remaining.toLocaleString()}
            </div>
            <div className="sub">km to next oil change</div>
          </div>
        </div>
      </div>

      {chartReadings.length > 1 && (
        <div className="panel">
          <h2>Odometer Trend</h2>
          <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '150px' }}>
              {chartReadings.map((r, i) => {
                const height = ((r.reading_km - minKm) / range) * 100;
                return (
                  <div
                    key={i}
                    title={r.reading_date + ': ' + Number(r.reading_km).toLocaleString() + ' km'}
                    style={{
                      flex: 1,
                      height: Math.max(height, 5) + '%',
                      background: r.is_oil_change ? '#16a34a' : '#1e3a8a',
                      borderRadius: '4px 4px 0 0',
                      cursor: 'pointer'
                    }}
                  ></div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
              <span>{chartReadings[0]?.reading_date}</span>
              <span>{chartReadings[chartReadings.length - 1]?.reading_date}</span>
            </div>
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
              <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#1e3a8a', borderRadius: '2px', marginRight: '6px' }}></span> Reading
              <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#16a34a', borderRadius: '2px', margin: '0 6px 0 16px' }}></span> Oil Change
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Readings History ({readings.length})</h2>
        {readings.length === 0 ? (
          <div className="alert alert-info">No readings yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Reading (km)</th><th>Type</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {readings.map(r => (
                <tr key={r.id}>
                  <td>{String(r.reading_date || r.created_at || '').slice(0, 10)}</td>
                  <td style={{ fontWeight: 'bold' }}>{Number(r.reading_km).toLocaleString()}</td>
                  <td>
                    {r.is_oil_change ? (
                      <span className="status-badge status-safe">Oil Change</span>
                    ) : (
                      <span className="status-badge" style={{ background: '#dbeafe', color: '#1e40af' }}>Reading</span>
                    )}
                  </td>
                  <td>{r.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Oil Changes ({oilChanges.length})</h2>
        {oilChanges.length === 0 ? (
          <div className="alert alert-info">No oil changes recorded.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>KM</th><th>Changed By</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {oilChanges.map(o => (
                <tr key={o.id}>
                  <td>{String(o.oil_change_date || o.created_at || '').slice(0, 10)}</td>
                  <td style={{ fontWeight: 'bold' }}>{Number(o.oil_change_km).toLocaleString()}</td>
                  <td>{o.changed_by || '-'}</td>
                  <td>{o.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

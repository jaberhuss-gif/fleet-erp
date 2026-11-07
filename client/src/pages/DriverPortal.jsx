import { useState, useEffect } from 'react';
import { getVehiclesList, getVehicleDetails, addReading, changeOil } from '../api/client';

export default function DriverPortal({ canWork = false }) {
  const [vehicles, setVehicles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [details, setDetails] = useState(null);
  const [reading, setReading] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadVehicles();
    const refresh = () => {
      loadVehicles();
      if (selectedId) loadDetails(selectedId);
    };
    const onStorage = (event) => {
      if (event.key === 'fleet-vehicles-updated-at') refresh();
    };
    window.addEventListener('fleet-vehicles-updated', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('fleet-vehicles-updated', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) loadDetails(selectedId);
    else setDetails(null);
  }, [selectedId]);

  const loadVehicles = async () => {
    try {
      const res = await getVehiclesList();
      setVehicles(res.vehicles || []);
    } catch (e) {
      setError('Failed to load vehicles: ' + (e.response?.data?.error || e.message));
    }
  };

  const loadDetails = async (id) => {
    try {
      setLoading(true);
      setError('');
      const res = await getVehicleDetails(id);
      // Vehicle details are read directly from PostgreSQL, so the displayed
      // driver is always the current assignment for this vehicle.
      setDetails(res);
    } catch (e) {
      console.error('Details error:', e);
      setError('Failed to load vehicle details: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReading = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      const res = await addReading(selectedId, { readingKm: Number(reading) });
      setMessage('Reading saved: ' + res.vehicle.currentKm.toLocaleString() + ' km');
      setReading('');
      loadDetails(selectedId);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const handleOilChange = async () => {
    setMessage(''); setError('');
    if (!confirm('Confirm oil change for this vehicle?')) return;
    try {
      const res = await changeOil(selectedId, { changedBy: 'Driver' });
      setMessage('Oil change recorded at ' + res.vehicle.lastOilKm.toLocaleString() + ' km');
      loadDetails(selectedId);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const v = details?.vehicle;
  const statusClass = v ? (v.status === 'Urgent Overdue' ? 'status-urgent' : v.status === 'Warning' ? 'status-warning' : 'status-safe') : '';
  const statusText = v ? (v.status === 'Urgent Overdue' ? 'Overdue' : v.status) : '';

  return (
    <div className="form-container">
      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Driver Portal</h2>
        </div>
        <div className="form-group">
          <label>Select Vehicle</label>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            <option value="">-- Choose your vehicle --</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.plate} - {v.driver}</option>
            ))}
          </select>
        </div>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        {v && (
          <>
            <div className="vehicle-info">
              <div className="vehicle-info-row"><span>Plate</span><span>{v.plate}</span></div>
              <div className="vehicle-info-row"><span>Driver</span><span>{v.driver}</span></div>
              <div className="vehicle-info-row"><span>Location</span><span>{v.location || '-'}</span></div>
              <div className="vehicle-info-row"><span>Current Odometer</span><span>{v.currentKm.toLocaleString()} km</span></div>
              <div className="vehicle-info-row"><span>Last Oil Change</span><span>{v.lastOilKm.toLocaleString()} km</span></div>
              <div className="vehicle-info-row"><span>KM Since Oil Change</span><span style={{ color: v.sinceOil >= Number(v.oilChangeInterval || 5000) ? '#dc2626' : v.sinceOil >= Math.max(0, Number(v.oilChangeInterval || 5000) - 500) ? '#f59e0b' : '#16a34a' }}>{v.sinceOil.toLocaleString()} km</span></div>
              <div className="vehicle-info-row"><span>Remaining to Next Oil Change</span><span style={{ color: v.remaining <= 0 ? '#dc2626' : '#1e293b' }}>{v.remaining.toLocaleString()} km</span></div>
              <div className="vehicle-info-row"><span>Status</span><span><span className={'status-badge ' + statusClass}>{statusText}</span></span></div>
            </div>

            {v.status === 'Urgent Overdue' && <div className="alert alert-error">This vehicle needs an oil change immediately!</div>}
            {v.status === 'Warning' && <div className="alert alert-warning">Oil change approaching. {v.remaining.toLocaleString()} km remaining.</div>}

            {canWork && <form onSubmit={handleSubmitReading}>
              <div className="form-group">
                <label>Today's Odometer Reading (km)</label>
                <input type="number" value={reading} onChange={e => setReading(e.target.value)} placeholder={'Must be >= ' + v.currentKm} min={v.currentKm} required />
              </div>
              <div className="btn-row">
                <button type="submit" className="btn btn-success" disabled={loading}>Save Reading</button>
                <button type="button" className="btn btn-warning" onClick={handleOilChange}>Oil Changed</button>
              </div>
            </form>}
            {!canWork && (
              <div className="alert alert-info">
                Fleet is view-only for this user. KM entry and oil-change actions are disabled.
              </div>
            )}
          </>
        )}

        {!v && selectedId === '' && <div className="alert alert-info">Please select your vehicle from the list above.</div>}
        {loading && <div className="loading">Loading...</div>}

        {details && details.readings && details.readings.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h3>Recent Readings</h3>
            <table>
              <thead>
                <tr><th>Date</th><th>Reading (km)</th><th>Oil</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {details.readings.map(r => (
                  <tr key={r.id}>
                    <td>{r.reading_date}</td>
                    <td style={{ fontWeight: 'bold' }}>{Number(r.reading_km).toLocaleString()}</td>
                    <td>{r.is_oil_change ? 'OK' : '-'}</td>
                    <td>{r.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

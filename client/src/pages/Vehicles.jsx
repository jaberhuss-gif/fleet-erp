import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';
import { printContent } from '../api/print';
import ExcelImportButton from '../components/ExcelImportButton';

export default function Vehicles({ onViewVehicle, canWork = false }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [quickEdit, setQuickEdit] = useState(null);
  const [quickKm, setQuickKm] = useState('');
  const [quickOilKm, setQuickOilKm] = useState('');
  const [form, setForm] = useState({
    plate: '', make: 'Toyota', model: 'Hilux', year: 2022,
    location: '', driver: '', phone: '', currentKm: 0, lastOilKm: 0, oilChangeInterval: 5000
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/vehicles');
      setVehicles(res.data.vehicles || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ plate: '', make: 'Toyota', model: 'Hilux', year: 2022, location: '', driver: '', phone: '', currentKm: 0, lastOilKm: 0, oilChangeInterval: 5000 });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      if (editing) {
        await api.put('/vehicles/' + editing.id, form);
        setMessage('Vehicle updated');
        // Notify any KM/Fleet screen in this SPA and other open tabs to refresh the current vehicle assignment.
        window.dispatchEvent(new CustomEvent('fleet-vehicles-updated'));
        localStorage.setItem('fleet-vehicles-updated-at', String(Date.now()));
      } else {
        await api.post('/vehicles', form);
        setMessage('Vehicle added');
      }
      resetForm();
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleEdit = (v) => {
    setForm({
      plate: v.plate, make: v.make, model: v.model, year: v.year,
      location: v.location, driver: v.driver, phone: v.phone,
      currentKm: v.currentKm, lastOilKm: v.lastOilKm, oilChangeInterval: v.interval
    });
    setEditing(v);
    setShowForm(true);
  };

  const handleQuickEdit = (v) => {
    setQuickEdit(v);
    setQuickKm(v.currentKm);
    setQuickOilKm(v.lastOilKm);
  };

  const handleQuickSave = async () => {
    setMessage(''); setError('');
    try {
      await api.put('/vehicles/' + quickEdit.id, {
        currentKm: Number(quickKm),
        lastOilKm: Number(quickOilKm)
      });
      setMessage('Reading updated for ' + quickEdit.plate);
      setQuickEdit(null);
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this vehicle?')) return;
    try {
      await api.delete('/vehicles/' + id);
      setMessage('Vehicle deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const handleDeleteAll = async () => {
    if (!confirm('DELETE ALL VEHICLES? This cannot be undone!')) return;
    if (!confirm('Are you absolutely sure?')) return;
    try {
      await api.delete('/vehicles');
      setMessage('All vehicles deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const handleFileImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) { setError('CSV must have a header + data'); return; }
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx]; });
      rows.push({
        plate: row.plate || row.Plate || '',
        make: row.make || row.Make || 'Toyota',
        model: row.model || row.Model || 'Hilux',
        year: Number(row.year || row.Year || 2022),
        location: row.location || row.Location || '',
        driver: row.driver || row.Driver || '',
        phone: row.phone || row.Phone || '',
        currentKm: Number(row.currentKm || row.CurrentKM || row.km || 0),
        lastOilKm: Number(row.lastOilKm || row.LastOilKM || 0),
        oilChangeInterval: Number(row.oilChangeInterval || 5000)
      });
    }
    try {
      const res = await api.post('/vehicles/import', { vehicles: rows });
      setMessage('Imported: ' + res.data.added + ' | Failed: ' + res.data.failed);
      if (res.data.errors?.length) setError(res.data.errors.slice(0, 3).join(' | '));
      load();
    } catch (e) { setError(e.message); }
    e.target.value = '';
  };



  // Filter + Search
  const filtered = vehicles.filter(v => {
    const matchSearch = search === '' ||
      v.plate.toLowerCase().includes(search.toLowerCase()) ||
      (v.driver || '').toLowerCase().includes(search.toLowerCase()) ||
      (v.phone || '').includes(search);
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'overdue' && v.status === 'Urgent Overdue') ||
      (filterStatus === 'warning' && v.status === 'Warning') ||
      (filterStatus === 'safe' && v.status === 'Safe');
    const matchLocation = filterLocation === 'all' || v.location === filterLocation;
    return matchSearch && matchStatus && matchLocation;
  });

  const locations = [...new Set(vehicles.map(v => v.location).filter(Boolean))].sort();

  return (
    <div>
      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #0f766e, #06b6d4)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Vehicles</h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          
          <div className="btn-row" style={{ margin: 0 }}>
            {canWork && <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
              {showForm ? 'Cancel' : '+ Add Vehicle'}
            </button>}
            {canWork && <ExcelImportButton kind="vehicles" onImported={load} label="Import Excel" />}
            <button className="btn btn-warning" onClick={() => exportToCSV(vehicles, "vehicles", [{key:"plate",label:"Plate"},{key:"driver",label:"Driver"},{key:"phone",label:"Phone"},{key:"location",label:"Location"},{key:"currentKm",label:"Current KM"},{key:"lastOilKm",label:"Last Oil KM"},{key:"sinceOil",label:"Since Oil"},{key:"status",label:"Status"}])}>Export CSV</button>
            {canWork && <button className="btn btn-danger" onClick={handleDeleteAll}>Delete All</button>}
          </div>
        </div>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        {/* Search + Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search (Plate / Driver / Phone)</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. 1709 or Umer" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="overdue">Overdue</option>
              <option value="warning">Warning</option>
              <option value="safe">Safe</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Location</label>
            <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
              <option value="all">All Locations</option>
              {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-warning" onClick={() => { setSearch(''); setFilterStatus('all'); setFilterLocation('all'); }} style={{ width: '100%' }}>Clear Filters</button>
          </div>
        </div>

        <div style={{ marginBottom: '12px', color: '#64748b', fontSize: '14px' }}>
          Showing <strong>{filtered.length}</strong> of {vehicles.length} vehicles
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
            <h3>{editing ? 'Edit Vehicle' : 'New Vehicle'}</h3>
            <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div className="form-group"><label>Plate *</label><input value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} placeholder="4980 JUA" required /></div>
              <div className="form-group"><label>Make</label><input value={form.make} onChange={e => setForm({ ...form, make: e.target.value })} /></div>
              <div className="form-group"><label>Model</label><input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></div>
              <div className="form-group"><label>Year</label><input type="number" value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })} /></div>
              <div className="form-group"><label>Driver</label><input value={form.driver} onChange={e => setForm({ ...form, driver: e.target.value })} /></div>
              <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="form-group"><label>Location</label><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
              <div className="form-group"><label>Current KM</label><input type="number" value={form.currentKm} onChange={e => setForm({ ...form, currentKm: Number(e.target.value) })} /></div>
              <div className="form-group"><label>Last Oil KM</label><input type="number" value={form.lastOilKm} onChange={e => setForm({ ...form, lastOilKm: Number(e.target.value) })} /></div>
              <div className="form-group"><label>Oil Interval</label><input type="number" value={form.oilChangeInterval} onChange={e => setForm({ ...form, oilChangeInterval: Number(e.target.value) })} /></div>
            </div>
            <div className="btn-row">
              <button type="submit" className="btn btn-success">{editing ? 'Update' : 'Save'}</button>
              <button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        )}

        {quickEdit && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', padding: '24px', borderRadius: '10px', maxWidth: '450px', width: '90%' }}>
              <h3 style={{ marginTop: 0 }}>Quick Edit: {quickEdit.plate}</h3>
              <div className="form-group"><label>Current Odometer (km)</label><input type="number" value={quickKm} onChange={e => setQuickKm(e.target.value)} /></div>
              <div className="form-group"><label>Last Oil Change (km)</label><input type="number" value={quickOilKm} onChange={e => setQuickOilKm(e.target.value)} /></div>
              <div className="btn-row">
                {canWork && <button className="btn btn-success" onClick={handleQuickSave}>Save</button>}
                <button className="btn btn-warning" onClick={() => setQuickEdit(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="alert alert-info">No vehicles match your filters.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Plate</th><th>Driver</th><th>Location</th>
                <th>Current KM</th><th>Last Oil</th><th>Since Oil</th>
                <th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 'bold' }}>
                    <button
                      onClick={() => onViewVehicle && onViewVehicle(v.id)}
                      style={{ background: 'none', border: 'none', color: '#1e3a8a', cursor: 'pointer', textDecoration: 'underline', fontWeight: 'bold', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}
                    >
                      {v.plate}
                    </button>
                  </td>
                  <td>{v.driver}</td>
                  <td>{v.location || '-'}</td>
                  <td>{v.currentKm.toLocaleString()}</td>
                  <td>{v.lastOilKm.toLocaleString()}</td>
                  <td style={{ fontWeight: 'bold', color: v.sinceOil >= 5000 ? '#dc2626' : v.sinceOil >= 4500 ? '#f59e0b' : '#16a34a' }}>
                    {v.sinceOil.toLocaleString()}
                  </td>
                  <td>
                    <span className={'status-badge ' + (v.status === 'Urgent Overdue' ? 'status-urgent' : v.status === 'Warning' ? 'status-warning' : 'status-safe')}>
                      {v.status === 'Urgent Overdue' ? 'Overdue' : v.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '12px', marginRight: '4px' }} onClick={() => onViewVehicle && onViewVehicle(v.id)}>View</button>
                    {canWork && <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleQuickEdit(v)}>Reading</button>}
                    {canWork && <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleDelete(v.id)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}



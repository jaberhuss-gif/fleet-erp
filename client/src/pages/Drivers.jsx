import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';
import { printContent } from '../api/print';

export default function Drivers({ initialAction = null }) {
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(initialAction === 'add');
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({
    name: '', phone: '', licenseNo: '', licenseExpiry: '',
    nationality: '', vehicleId: '', status: 'Active', notes: ''
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [d, v] = await Promise.all([api.get('/drivers'), api.get('/vehicles')]);
      setDrivers(d.data.drivers || []);
      setVehicles(v.data.vehicles || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ name: '', phone: '', licenseNo: '', licenseExpiry: '', nationality: '', vehicleId: '', status: 'Active', notes: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      const payload = { ...form, vehicleId: form.vehicleId ? Number(form.vehicleId) : null };
      if (editing) {
        await api.put('/drivers/' + editing.id, payload);
        setMessage('Driver updated');
      } else {
        await api.post('/drivers', payload);
        setMessage('Driver created');
      }
      resetForm();
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleEdit = (d) => {
    setForm({
      name: d.name || '', phone: d.phone || '', licenseNo: d.license_no || '',
      licenseExpiry: d.license_expiry || '', nationality: d.nationality || '',
      vehicleId: d.vehicle_id || '', status: d.status || 'Active', notes: d.notes || ''
    });
    setEditing(d);
    setShowForm(true);
  };

  const handleDelete = async (id, name) => {
    if (!confirm('Delete driver "' + name + '"?')) return;
    try {
      await api.delete('/drivers/' + id);
      setMessage('Driver deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const filtered = drivers.filter(d => {
    const matchSearch = search === '' ||
      (d.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.phone || '').includes(search) ||
      (d.license_no || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.vehicle_plate || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || d.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const activeCount = drivers.filter(d => d.status === 'Active').length;
  const withVehicleCount = drivers.filter(d => d.vehicle_id).length;

  const isLicenseExpiring = (dateStr) => {
    if (!dateStr) return false;
    const exp = new Date(dateStr);
    const now = new Date();
    const diff = (exp - now) / (1000 * 60 * 60 * 24);
    return diff < 30;
  };

  return (
    <div className="panel">
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Drivers Management</h2>
        <p style={{ margin: '6px 0 0', opacity: 0.85, fontSize: '13px' }}>
          View driver information. Driver records are managed from the ERP data source.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
        <button className="print-btn no-print" style={{ marginRight: '8px' }} onClick={() => printContent('Drivers Report', drivers.length + ' drivers')}>🖨️ Print</button>
        <button className="btn btn-success" style={{ marginRight: '8px' }} onClick={() => exportToCSV(filtered, 'drivers', [
          {key:'name',label:'Name'},
          {key:'phone',label:'Phone'},
          {key:'license_no',label:'License'},
          {key:'license_expiry',label:'License Expiry'},
          {key:'nationality',label:'Nationality'},
          {key:'vehicle_plate',label:'Vehicle'},
          {key:'status',label:'Status'}
        ])}>Export CSV</button>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? 'Cancel' : '+ Add Driver'}
        </button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="cards-grid" style={{ marginBottom: '20px' }}>
        <div className="card success">
          <h3>Active Drivers</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{activeCount}</div>
          <div className="sub">Currently working</div>
        </div>
        <div className="card">
          <h3>With Vehicle</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{withVehicleCount}</div>
          <div className="sub">Assigned to vehicles</div>
        </div>
        <div className="card">
          <h3>Without Vehicle</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{drivers.length - withVehicleCount}</div>
          <div className="sub">Unassigned</div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3>{editing ? 'Edit Driver' : 'New Driver'}</h3>
          <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="form-group">
              <label>Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Ahmed Ali" />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="05xxxxxxxx" />
            </div>
            <div className="form-group">
              <label>License No.</label>
              <input value={form.licenseNo} onChange={e => setForm({ ...form, licenseNo: e.target.value })} />
            </div>
            <div className="form-group">
              <label>License Expiry</label>
              <input type="date" value={form.licenseExpiry} onChange={e => setForm({ ...form, licenseExpiry: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Nationality</label>
              <input value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} placeholder="e.g. Pakistani" />
            </div>
            <div className="form-group">
              <label>Vehicle</label>
              <select value={form.vehicleId} onChange={e => setForm({ ...form, vehicleId: e.target.value })}>
                <option value="">-- Not assigned --</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.plate} - {v.make} {v.model}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}></textarea>
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn-success">{editing ? 'Update' : 'Save'}</button>
            <button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Search</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name / Phone / License / Plate" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="Active">Active</option>
            <option value="On Leave">On Leave</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn btn-warning" onClick={() => { setSearch(''); setFilterStatus('all'); }} style={{ width: '100%' }}>Clear</button>
        </div>
      </div>

      <div style={{ marginBottom: '12px', color: '#64748b', fontSize: '14px' }}>
        Showing <strong>{filtered.length}</strong> of {drivers.length} drivers
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="alert alert-info">No drivers found.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th><th>Name</th><th>Phone</th><th>License No.</th><th>License Expiry</th>
              <th>Nationality</th><th>Vehicle</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id}>
                <td>{d.id}</td>
                <td style={{ fontWeight: 'bold' }}>{d.name}</td>
                <td>{d.phone || '-'}</td>
                <td>{d.license_no || '-'}</td>
                <td style={{ color: isLicenseExpiring(d.license_expiry) ? '#dc2626' : '#1e293b', fontWeight: isLicenseExpiring(d.license_expiry) ? 'bold' : 'normal' }}>
                  {d.license_expiry || '-'}
                  {isLicenseExpiring(d.license_expiry) && ' ⚠️'}
                </td>
                <td>{d.nationality || '-'}</td>
                <td style={{ fontWeight: 'bold', color: '#1e3a8a' }}>{d.vehicle_plate || '-'}</td>
                <td>
                  <span className={
                    'status-badge ' +
                    (d.status === 'Active' ? 'status-safe' :
                     d.status === 'On Leave' ? 'status-warning' : 'status-urgent')
                  }>
                    {d.status}
                  </span>
                </td>
                <td>
                  <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleEdit(d)}>Edit</button>
                  <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleDelete(d.id, d.name)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

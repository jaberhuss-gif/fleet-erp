import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';

const TYPE_LABELS = {
  '6_months_general': '🔧 6-Month General Maintenance',
  'inspection': '🔍 Periodic Inspection'
};

export default function PeriodicMaintenance({ canWork = false }) {
  const [subTab, setSubTab] = useState('all');
  const [records, setRecords] = useState([]);
  const [alerts, setAlerts] = useState({ overdue: [], dueSoon: [] });
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [filterVehicle, setFilterVehicle] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    vehicleId: '', type: '6_months_general', scheduledDate: '',
    status: 'Pending', technician: '', cost: 0, notes: ''
  });

  const [completeForm, setCompleteForm] = useState({
    completedDate: '', technician: '', cost: 0, notes: ''
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [r, a, v] = await Promise.all([
        api.get('/periodic-maintenance'),
        api.get('/periodic-maintenance/alerts'),
        api.get('/vehicles/list')
      ]);
      setRecords(r.data.records || []);
      setAlerts({ overdue: a.data.overdue || [], dueSoon: a.data.dueSoon || [] });
      setVehicles(v.data.vehicles || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ vehicleId: '', type: '6_months_general', scheduledDate: '', status: 'Pending', technician: '', cost: 0, notes: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      const payload = { ...form, vehicleId: Number(form.vehicleId), cost: Number(form.cost) };
      if (editing) {
        await api.put('/periodic-maintenance/' + editing.id, payload);
        setMessage('Record updated');
      } else {
        await api.post('/periodic-maintenance', payload);
        setMessage('Schedule created');
      }
      resetForm();
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleEdit = (r) => {
    setForm({
      vehicleId: r.vehicle_id, type: r.type, scheduledDate: r.scheduled_date || '',
      status: r.status, technician: r.technician || '', cost: r.cost || 0, notes: r.notes || ''
    });
    setEditing(r);
    setShowForm(true);
  };

  const handleComplete = (r) => {
    setCompleting(r);
    setCompleteForm({
      completedDate: new Date().toISOString().slice(0, 10),
      technician: r.technician || '',
      cost: r.cost || 0,
      notes: r.notes || ''
    });
  };

  const handleCompleteSubmit = async () => {
    setMessage(''); setError('');
    try {
      await api.put('/periodic-maintenance/' + completing.id + '/complete', completeForm);
      setMessage('Marked as completed');
      setCompleting(null);
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this record?')) return;
    try {
      await api.delete('/periodic-maintenance/' + id);
      setMessage('Record deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const handleGenerate = async () => {
    if (!confirm('Auto-generate schedules for ALL vehicles? (6 months ahead)')) return;
    setMessage(''); setError('');
    try {
      const res = await api.post('/periodic-maintenance/generate', { monthsAhead: 6 });
      setMessage('Generated ' + res.data.created + ' new schedules');
      load();
    } catch (e) { setError(e.message); }
  };

  const today = new Date().toISOString().slice(0, 10);

  const filtered = records.filter(r => {
    const matchVehicle = filterVehicle === 'all' || String(r.vehicle_id) === filterVehicle;
    const matchType = filterType === 'all' || r.type === filterType;
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    const matchSearch = search === '' ||
      (r.vehicle_plate || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.driver_name || '').toLowerCase().includes(search.toLowerCase());
    return matchVehicle && matchType && matchStatus && matchSearch;
  });

  const subTabData = {
    all: filtered,
    pending: filtered.filter(r => r.status === 'Pending'),
    completed: filtered.filter(r => r.status === 'Completed'),
    overdue: filtered.filter(r => r.status === 'Pending' && r.scheduled_date < today)
  };

  const currentList = subTabData[subTab] || filtered;

  const getStatusBadge = (r) => {
    if (r.status === 'Completed') return <span className="status-badge status-safe">Completed</span>;
    if (r.scheduled_date < today) return <span className="status-badge status-urgent">Overdue</span>;
    return <span className="status-badge status-warning">Pending</span>;
  };

  return (
    <div>
      <div className="sub-nav">
        <button className={subTab === 'all' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('all')}>All ({records.length})</button>
        <button className={subTab === 'pending' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('pending')}>Pending ({subTabData.pending.length})</button>
        <button className={subTab === 'overdue' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('overdue')}>Overdue ({subTabData.overdue.length})</button>
        <button className={subTab === 'completed' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('completed')}>Completed ({subTabData.completed.length})</button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Alerts Summary */}
      {(alerts.overdue.length > 0 || alerts.dueSoon.length > 0) && (
        <div className="cards-grid" style={{ marginBottom: '20px' }}>
          <div className="card danger">
            <h3>🔴 Overdue</h3>
            <div className="big-number" style={{ color: '#dc2626' }}>{alerts.overdue.length}</div>
            <div className="sub">Past due date</div>
          </div>
          <div className="card warning">
            <h3>🟡 Due Soon (7 days)</h3>
            <div className="big-number" style={{ color: '#f59e0b' }}>{alerts.dueSoon.length}</div>
            <div className="sub">Approaching deadline</div>
          </div>
        </div>
      )}

      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #115e59, #2dd4bf)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Periodic Maintenance & Inspection</h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          
          <div className="btn-row" style={{ margin: 0 }}>
            {canWork && <button className="btn btn-warning" style={{ marginRight: '8px' }} onClick={handleGenerate}>⚡ Auto-Generate All</button>}
            <button
              className="btn btn-success"
              style={{ marginRight: '8px' }}
              onClick={() =>
                exportToCSV(currentList, 'periodic-maintenance', [
                  { key: 'vehicle_plate', label: 'Vehicle' },
                  { key: 'type', label: 'Type' },
                  { key: 'scheduled_date', label: 'Scheduled' },
                  { key: 'completed_date', label: 'Completed' },
                  { key: 'status', label: 'Status' },
                  { key: 'technician', label: 'Technician' },
                  { key: 'cost', label: 'Cost' }
                ])
              }
            >
              Export CSV
            </button>
            {canWork && <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
              {showForm ? 'Cancel' : '+ Schedule New'}
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
            <h3>{editing ? 'Edit Schedule' : 'New Schedule'}</h3>
            <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div className="form-group">
                <label>Vehicle *</label>
                <select value={form.vehicleId} onChange={e => setForm({ ...form, vehicleId: e.target.value })} required>
                  <option value="">-- Select Vehicle --</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} - {v.driver}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Type *</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="6_months_general">6-Month General Maintenance</option>
                  <option value="inspection">Periodic Inspection</option>
                </select>
              </div>
              <div className="form-group">
                <label>Scheduled Date *</label>
                <input type="date" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
              <div className="form-group"><label>Technician</label><input value={form.technician} onChange={e => setForm({ ...form, technician: e.target.value })} /></div>
              <div className="form-group"><label>Cost (SAR)</label><input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: Number(e.target.value) })} /></div>
            </div>
            <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}></textarea></div>
            <div className="btn-row">
              <button type="submit" className="btn btn-success">{editing ? 'Update' : 'Save'}</button>
              <button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        )}

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Vehicle / Driver" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Vehicle</label>
            <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}>
              <option value="all">All Vehicles</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Type</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              <option value="6_months_general">6-Month General</option>
              <option value="inspection">Inspection</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-warning" onClick={() => { setSearch(''); setFilterVehicle('all'); setFilterType('all'); setFilterStatus('all'); }} style={{ width: '100%' }}>Clear</button>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : currentList.length === 0 ? (
          <div className="alert alert-info">No records. Click "Auto-Generate All" to schedule for all vehicles.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vehicle</th><th>Driver</th><th>Type</th><th>Scheduled</th>
                <th>Completed</th><th>Status</th><th>Technician</th><th>Cost</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentList.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 'bold' }}>{r.vehicle_plate || '-'}</td>
                  <td>{r.driver_name || '-'}</td>
                  <td>{TYPE_LABELS[r.type] || r.type}</td>
                  <td>{r.scheduled_date}</td>
                  <td>{r.completed_date || '-'}</td>
                  <td>{getStatusBadge(r)}</td>
                  <td>{r.technician || '-'}</td>
                  <td>{Number(r.cost || 0).toLocaleString()}</td>
                  <td>
                    {r.status === 'Pending' && canWork && (
                      <button className="btn btn-success" style={{ padding: '5px 10px', fontSize: '11px', marginRight: '4px' }} onClick={() => handleComplete(r)}>Complete</button>
                    )}
                    {canWork && <button className="btn btn-primary" style={{ padding: '5px 10px', fontSize: '11px', marginRight: '4px' }} onClick={() => handleEdit(r)}>Edit</button>}
                    {canWork && <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: '11px' }} onClick={() => handleDelete(r.id)}>Del</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Complete Modal */}
      {completing && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '10px', maxWidth: '480px', width: '90%' }}>
            <h3 style={{ marginTop: 0 }}>Complete Maintenance</h3>
            <p style={{ color: '#64748b', fontSize: '14px' }}>
              {completing.vehicle_plate} — {TYPE_LABELS[completing.type] || completing.type}
            </p>
            <div className="form-group"><label>Completion Date</label><input type="date" value={completeForm.completedDate} onChange={e => setCompleteForm({ ...completeForm, completedDate: e.target.value })} /></div>
            <div className="form-group"><label>Technician</label><input value={completeForm.technician} onChange={e => setCompleteForm({ ...completeForm, technician: e.target.value })} placeholder="Who performed this?" /></div>
            <div className="form-group"><label>Total Cost (SAR)</label><input type="number" value={completeForm.cost} onChange={e => setCompleteForm({ ...completeForm, cost: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Notes</label><textarea value={completeForm.notes} onChange={e => setCompleteForm({ ...completeForm, notes: e.target.value })} rows={3} placeholder="What was done?"></textarea></div>
            <div className="btn-row">
              {canWork && <button className="btn btn-success" onClick={handleCompleteSubmit}>Mark Completed</button>}
              <button className="btn btn-warning" onClick={() => setCompleting(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

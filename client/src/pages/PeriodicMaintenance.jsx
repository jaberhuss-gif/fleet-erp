import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToExcel } from '../api/export';

const TYPE_LABELS = {
  '6_months_general': '6-Month General Maintenance',
  'inspection': 'Periodic Inspection'
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

  // A record is considered filled/processed when any actual work data exists.
  // The generated vehicle/type/scheduled-date fields alone do not count.
  const hasActionData = (r) =>
    r.status === 'Completed' ||
    Boolean(String(r.completed_date || '').trim()) ||
    Boolean(String(r.technician || '').trim()) ||
    Number(r.cost || 0) > 0 ||
    Boolean(String(r.notes || '').trim());

  const filledRecords = filtered.filter(hasActionData);
  const untouchedRecords = filtered.filter((r) => !hasActionData(r));

  const exportColumns = [
    { key: 'vehicle_plate', label: 'Vehicle' },
    { key: 'vehicle_location', label: 'Location' },
    { key: 'driver_name', label: 'Driver' },
    { key: 'type', label: 'Type' },
    { key: 'scheduled_date', label: 'Scheduled' },
    { key: 'completed_date', label: 'Completed' },
    { key: 'status', label: 'Status' },
    { key: 'technician', label: 'Technician' },
    { key: 'cost', label: 'Cost (SAR)' },
    { key: 'notes', label: 'Notes' }
  ];

  const exportReport = async (data, filename, sheetName) => {
    await exportToExcel(data, filename, exportColumns, sheetName);
  };

  const printPdfReport = () => {
    // Use a dedicated print window so global app/table CSS cannot force
    // one maintenance record onto a separate PDF page.
    const esc = (value) => String(value ?? '-')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const rows = currentList.map((r) => {
      const status = r.status === 'Completed'
        ? 'Completed'
        : (r.scheduled_date < today ? 'Overdue' : 'Pending');
      return `<tr>
        <td>${esc(r.vehicle_plate)}</td>
        <td>${esc(r.vehicle_location)}</td>
        <td>${esc(r.driver_name)}</td>
        <td>${esc(TYPE_LABELS[r.type] || r.type)}</td>
        <td>${esc(r.scheduled_date)}</td>
        <td>${esc(r.completed_date)}</td>
        <td>${esc(status)}</td>
        <td>${esc(r.technician)}</td>
        <td>${esc(r.notes)}</td>
      </tr>`;
    }).join('');

    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      setError('Please allow pop-ups for the PDF print report.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Vehicle Maintenance</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; }
  .title { font-size: 18pt; font-weight: 700; color: #1e3a8a; margin: 0 0 3mm; }
  .meta { font-size: 8pt; color: #555; margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: 2px solid #1e3a8a; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #9aa4b2; padding: 4px 5px; text-align: left; vertical-align: top; line-height: 1.2; overflow-wrap: anywhere; }
  th { background: #e9eef5; font-weight: 700; }
  th:nth-child(1), td:nth-child(1) { width: 10%; }
  th:nth-child(2), td:nth-child(2) { width: 13%; }
  th:nth-child(3), td:nth-child(3) { width: 17%; }
  th:nth-child(4), td:nth-child(4) { width: 11%; }
  th:nth-child(5), td:nth-child(5) { width: 10%; }
  th:nth-child(6), td:nth-child(6) { width: 10%; }
  th:nth-child(7), td:nth-child(7) { width: 9%; }
  th:nth-child(8), td:nth-child(8) { width: 10%; }
  th:nth-child(9), td:nth-child(9) { width: 10%; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="title">Vehicle Maintenance</div>
  <div class="meta">Generated: ${esc(new Date().toLocaleString())} · Records: ${currentList.length}</div>
  <table>
    <thead><tr>
      <th>Vehicle</th><th>Location</th><th>Driver</th><th>Type</th><th>Scheduled</th>
      <th>Completed</th><th>Status</th><th>Technician</th><th>Notes</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  // For 6-month maintenance, a note is the evidence that the vehicle was inspected.
  // Notes may describe findings; they still mean the inspection was performed.
  const isSixMonthInspected = (r) => r.type === '6_months_general' && (
    r.status === 'Completed' || Boolean(String(r.notes || '').trim())
  );

  const getStatusBadge = (r) => {
    if (isSixMonthInspected(r)) return <span className="status-badge status-safe">GREEN — Inspected</span>;
    if (r.type === '6_months_general') return <span className="status-badge status-urgent">RED — Not Inspected</span>;
    if (r.status === 'Completed') return <span className="status-badge status-safe">Completed</span>;
    if (r.scheduled_date < today) return <span className="status-badge status-urgent">Overdue</span>;
    return <span className="status-badge status-warning">Pending</span>;
  };

  return (
    <div className="periodic-maintenance-print-root">
      <div className="sub-nav print-hide">
        <button className={subTab === 'all' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('all')}>All ({records.length})</button>
        <button className={subTab === 'pending' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('pending')}>Pending ({subTabData.pending.length})</button>
        <button className={subTab === 'overdue' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('overdue')}>Overdue ({subTabData.overdue.length})</button>
        <button className={subTab === 'completed' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('completed')}>Completed ({subTabData.completed.length})</button>
      </div>

      {/* ===== Stats Cards ===== */}
      <div className="print-hide" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#fff', padding: '16px 20px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(220,38,38,0.3)' }}>
          <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '6px' }}>Overdue</div>
          <div style={{ fontSize: '32px', fontWeight: '700', lineHeight: 1 }}>{alerts.counts?.overdue?.total ?? alerts.overdue.length}</div>
          <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '8px' }}>
            Oil: {alerts.counts?.overdue?.oil_change ?? 0} | Inspection: {alerts.counts?.overdue?.inspection ?? 0} | General: {alerts.counts?.overdue?.['6_months_general'] ?? 0}
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#fff', padding: '16px 20px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
          <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '6px' }}>Due Soon</div>
          <div style={{ fontSize: '32px', fontWeight: '700', lineHeight: 1 }}>{alerts.counts?.dueSoon?.total ?? alerts.dueSoon.length}</div>
          <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '8px' }}>
            Oil: {alerts.counts?.dueSoon?.oil_change ?? 0} | Inspection: {alerts.counts?.dueSoon?.inspection ?? 0} | General: {alerts.counts?.dueSoon?.['6_months_general'] ?? 0}
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: '#fff', padding: '16px 20px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(22,163,74,0.3)' }}>
          <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '6px' }}>Safe</div>
          <div style={{ fontSize: '32px', fontWeight: '700', lineHeight: 1 }}>{Math.max(0, records.length - alerts.overdue.length - alerts.dueSoon.length)}</div>
          <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '8px' }}>Out of {records.length} total records</div>
        </div>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        <div className="print-header">
          <h1>Vehicle Maintenance</h1>
          <div className="print-meta">
            Generated: {new Date().toLocaleString()} · Records: {currentList.length}
          </div>
        </div>
        <h2 className="print-hide">Periodic Maintenance & Inspection</h2>
        <div className="print-hide" style={{marginBottom:'12px',padding:'10px 14px',borderRadius:'8px',background:'#f8fafc',border:'1px solid #e2e8f0'}}><strong>6-Month Control:</strong> <span style={{color:'#15803d'}}>GREEN = inspected (notes or completed)</span> · <span style={{color:'#b91c1c'}}>RED = not inspected (no notes)</span></div>

        <div className="btn-row no-print">
          {canWork && <button className="btn btn-warning" onClick={handleGenerate}>Auto-Generate All</button>}
          <button className="btn btn-success" onClick={() => exportReport(filledRecords, 'Periodic_Maintenance_Filled', 'Filled Records')}>
            📊 Export Filled Records ({filledRecords.length})
          </button>
          <button className="btn btn-warning" onClick={() => exportReport(untouchedRecords, 'Periodic_Maintenance_Untouched', 'No Action Records')}>
            📋 Export No Action Records ({untouchedRecords.length})
          </button>
          <button type="button" className="btn btn-primary pdf-export-btn" onClick={printPdfReport} title="Open the A4 PDF print dialog">
            🖨️ Export PDF
          </button>
          {canWork && <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Schedule New'}
          </button>}
        </div>

        {showForm && (
          <form className="no-print" onSubmit={handleSubmit}>
            <h3>{editing ? 'Edit Schedule' : 'New Schedule'}</h3>
            <div className="cards-grid">
              <div className="form-group">
                <label>Vehicle *</label>
                <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} required>
                  <option value="">-- Select Vehicle --</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} - {v.driver}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Type *</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="6_months_general">6-Month General Maintenance</option>
                  <option value="inspection">Periodic Inspection</option>
                </select>
              </div>
              <div className="form-group">
                <label>Scheduled Date *</label>
                <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
              <div className="form-group">
                <label>Technician</label>
                <input value={form.technician} onChange={(e) => setForm({ ...form, technician: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Cost (SAR)</label>
                <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="btn-row">
              <button type="submit" className="btn btn-success">{editing ? 'Update' : 'Save'}</button>
              <button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        )}

        <div className="filters no-print">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Vehicle / Driver" />
          <select value={filterVehicle} onChange={(e) => setFilterVehicle(e.target.value)}>
            <option value="all">All Vehicles</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="6_months_general">6-Month General</option>
            <option value="inspection">Inspection</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Completed">Completed</option>
          </select>
          <button className="btn btn-warning" onClick={() => { setSearch(''); setFilterVehicle('all'); setFilterType('all'); setFilterStatus('all'); }}>Clear</button>
        </div>

        {loading ? <div className="loading">Loading...</div> : (
          <table className="periodic-maintenance-screen-table">
            <thead>
              <tr><th>Vehicle</th><th>Location</th><th>Driver</th><th>Type</th><th>Scheduled</th><th>Completed</th><th>Status</th><th>Technician</th><th>Cost</th><th>Notes</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {currentList.map((r) => (
                <tr key={r.id}>
                  <td>{r.vehicle_plate || '-'}</td>
                  <td>{r.vehicle_location || '-'}</td>
                  <td>{r.driver_name || '-'}</td>
                  <td>{TYPE_LABELS[r.type] || r.type}</td>
                  <td>{r.scheduled_date}</td>
                  <td>{r.completed_date || '-'}</td>
                  <td>{getStatusBadge(r)}</td>
                  <td>{r.technician || '-'}</td>
                  <td>{Number(r.cost || 0).toLocaleString()}</td>
                  <td style={{ whiteSpace: 'pre-wrap', minWidth: '220px' }}>{r.notes || '-'}</td>
                  <td>
                    {canWork && r.status === 'Pending' && <button className="btn btn-success" onClick={() => handleComplete(r)}>Complete</button>}
                    {canWork && <button className="btn btn-primary" onClick={() => handleEdit(r)}>Edit</button>}
                    {canWork && <button className="btn btn-danger" onClick={() => handleDelete(r.id)}>Del</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="periodic-maintenance-print-table-wrap">
          <table className="periodic-maintenance-print-table">
            <thead>
              <tr>
                <th>Vehicle</th><th>Location</th><th>Driver</th><th>Type</th><th>Scheduled</th>
                <th>Completed</th><th>Status</th><th>Technician</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {currentList.map((r) => (
                <tr key={r.id}>
                  <td>{r.vehicle_plate || '-'}</td>
                  <td>{r.vehicle_location || '-'}</td>
                  <td>{r.driver_name || '-'}</td>
                  <td>{TYPE_LABELS[r.type] || r.type}</td>
                  <td>{r.scheduled_date || '-'}</td>
                  <td>{r.completed_date || '-'}</td>
                  <td>{r.status === 'Completed' ? 'Completed' : (r.scheduled_date < today ? 'Overdue' : 'Pending')}</td>
                  <td>{r.technician || '-'}</td>
                  <td>{r.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {completing && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Complete Maintenance</h3>
            <p>{completing.vehicle_plate} — {TYPE_LABELS[completing.type] || completing.type}</p>
            <label>Completion Date</label>
            <input type="date" value={completeForm.completedDate} onChange={(e) => setCompleteForm({ ...completeForm, completedDate: e.target.value })} />
            <label>Technician</label>
            <input value={completeForm.technician} onChange={(e) => setCompleteForm({ ...completeForm, technician: e.target.value })} />
            <label>Total Cost (SAR)</label>
            <input type="number" value={completeForm.cost} onChange={(e) => setCompleteForm({ ...completeForm, cost: Number(e.target.value) })} />
            <label>Notes</label>
            <textarea value={completeForm.notes} onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })} rows={3} />
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

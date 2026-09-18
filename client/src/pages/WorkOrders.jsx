import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';

export default function WorkOrders({ user, access = {} }) {
  const canWork = user?.role === 'Owner' || !!access?.building?.can_work;
  const [orders, setOrders] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [closing, setClosing] = useState(null);
  const [filterSite, setFilterSite] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    site: '', area: '', category: 'General', priority: 'Medium',
    description: '', assignedTo: '', isContractor: false, contractorName: '',
    reportedDate: '', partsUsed: ''
  });
  const [closeForm, setCloseForm] = useState({
    finalCost: 0, contractorCost: 0, laborCost: 0, partsCost: 0, closingNotes: ''
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [o, s] = await Promise.all([api.get('/work-orders'), api.get('/sites')]);
      setOrders(o.data.orders || []);
      setSites(s.data.sites || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ site: '', area: '', category: 'General', priority: 'Medium',
      description: '', assignedTo: '', isContractor: false, contractorName: '',
      reportedDate: '', partsUsed: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      if (editing) {
        await api.put('/work-orders/' + editing.id, form);
        setMessage('Work order updated');
      } else {
        await api.post('/work-orders', form);
        setMessage('Work order created');
      }
      resetForm();
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleEdit = (o) => {
    setForm({
      site: o.site, area: o.area || '', category: o.category, priority: o.priority,
      description: o.description || '', assignedTo: o.assigned_to || '',
      isContractor: !!(o.contractor_name && o.contractor_name !== 'Company' && o.contractor_name !== 'Internal'), contractorName: o.contractor_name || '',
      reportedDate: o.reported_date || '', partsUsed: o.parts_used || ''
    });
    setEditing(o);
    setShowForm(true);
  };

  const handleClose = (o) => {
    setClosing(o);
    setCloseForm({
      finalCost: o.final_cost || 0,
      contractorCost: o.contractor_cost || 0,
      laborCost: o.labor_cost || 0,
      partsCost: o.parts_cost || 0,
      closingNotes: o.closing_notes || ''
    });
  };

  const handleCloseSubmit = async () => {
    try {
      await api.put('/work-orders/' + closing.id + '/close', closeForm);
      setMessage('Work order closed');
      setClosing(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this work order?')) return;
    try {
      await api.delete('/work-orders/' + id);
      setMessage('Work order deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const filtered = orders.filter(o => {
    const matchSearch = search === '' ||
      (o.wo_no || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.site || '').toLowerCase().includes(search.toLowerCase());
    const matchSite = filterSite === 'all' || o.site === filterSite;
    const matchStatus = filterStatus === 'all' || o.status === filterStatus;
    return matchSearch && matchSite && matchStatus;
  });

  const totalCost = filtered.reduce((s, o) => s + Number(o.final_cost || 0), 0);
  const totalContractorCost = filtered.reduce((s, o) => s + Number(o.contractor_cost || 0), 0);
  const totalLaborCost = filtered.reduce((s, o) => s + Number(o.labor_cost || 0), 0);
  const totalPartsCost = filtered.reduce((s, o) => s + Number(o.parts_cost || 0), 0);

  return (
    <div className="panel">
      <div style={{ background: 'linear-gradient(135deg, #b45309, #f59e0b)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Work Orders</h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        
        <button className="btn btn-success" style={{ marginRight: "8px" }} onClick={() => exportToCSV(filtered, "work-orders", [{key:"wo_no",label:"WO #"},{key:"site",label:"Site"},{key:"category",label:"Category"},{key:"description",label:"Description"},{key:"assigned_to",label:"Assigned To"},{key:"status",label:"Status"},{key:"reported_date",label:"Reported"},{key:"completed_date",label:"Completed"},{key:"final_cost",label:"Cost"}])}>Export CSV</button>{canWork && <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? 'Cancel' : '+ New Work Order'}
        </button>}
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Cost Summary */}
      <div className="cards-grid" style={{ marginBottom: '16px' }}>
        <div className="card success">
          <h3>Total Cost</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{totalCost.toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card">
          <h3>Contractor Cost</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{totalContractorCost.toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card warning">
          <h3>Labor Cost</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{totalLaborCost.toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card danger">
          <h3>Parts Cost</h3>
          <div className="big-number" style={{ color: '#dc2626' }}>{totalPartsCost.toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
      </div>

      {showForm && canWork && (
        <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3>{editing ? 'Edit Work Order' : 'New Work Order'}</h3>
          <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="form-group">
              <label>Site *</label>
              <select value={form.site} onChange={e => setForm({ ...form, site: e.target.value })} required>
                <option value="">-- Select Site --</option>
                {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Area</label><input value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} placeholder="e.g. GYM, Kitchen" /></div>
            <div className="form-group"><label>Category *</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="General">General</option>
                <option value="Carpentry">Carpentry</option>
                <option value="Plumbing">Plumbing</option>
                <option value="Electrical">Electrical</option>
                <option value="HVAC">HVAC</option>
                <option value="Mechanical">Mechanical</option>
                <option value="Painting">Painting</option>
                <option value="Civil">Civil</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group"><label>Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
            <div className="form-group">
              <label>Assigned To</label>
              <input
                value={form.assignedTo}
                onChange={e => setForm({ ...form, assignedTo: e.target.value })}
                disabled={user?.role !== 'Owner'}
                placeholder={user?.role === 'Owner' ? 'Only Owner can issue assignment' : 'Owner-only assignment'}
              />
              {user?.role !== 'Owner' && (
                <div style={{fontSize:11,color:'#64748b',marginTop:4}}>Assignment orders can only be issued or changed by Owner.</div>
              )}
            </div>
            <div className="form-group"><label>Reported Date</label><input type="date" value={form.reportedDate} onChange={e => setForm({ ...form, reportedDate: e.target.value })} /></div>
            <div className="form-group">
              <label>Executor Type</label>
              <select value={form.isContractor ? '1' : '0'} onChange={e => setForm({ ...form, isContractor: e.target.value === '1' })}>
                <option value="0">Internal (Company Employees)</option>
                <option value="1">Contractor</option>
              </select>
            </div>
            {form.isContractor && (
              <div className="form-group"><label>Contractor Name</label><input value={form.contractorName} onChange={e => setForm({ ...form, contractorName: e.target.value })} /></div>
            )}
          </div>
          <div className="form-group"><label>Description *</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} required></textarea></div>
          <div className="form-group"><label>Parts Used</label><input value={form.partsUsed} onChange={e => setForm({ ...form, partsUsed: e.target.value })} /></div>
          <div className="btn-row">
            <button type="submit" className="btn btn-success">{editing ? 'Update' : 'Save'}</button>
            <button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {/* Closing Modal */}
      {closing && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '10px', maxWidth: '500px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Close Work Order: {closing.wo_no}</h3>
            <p style={{ color: '#64748b', fontSize: '14px' }}>{closing.description}</p>

            <div className="form-group"><label>Final Cost (SAR)</label><input type="number" value={closeForm.finalCost} onChange={e => setCloseForm({ ...closeForm, finalCost: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Contractor Cost (SAR)</label><input type="number" value={closeForm.contractorCost} onChange={e => setCloseForm({ ...closeForm, contractorCost: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Labor Cost (SAR)</label><input type="number" value={closeForm.laborCost} onChange={e => setCloseForm({ ...closeForm, laborCost: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Parts Cost (SAR)</label><input type="number" value={closeForm.partsCost} onChange={e => setCloseForm({ ...closeForm, partsCost: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Closing Notes</label><textarea value={closeForm.closingNotes} onChange={e => setCloseForm({ ...closeForm, closingNotes: e.target.value })} rows={2}></textarea></div>

            <div className="btn-row">
              {canWork && <button className="btn btn-success" onClick={handleCloseSubmit}>Close Work Order</button>}
              <button className="btn btn-warning" onClick={() => setClosing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Search</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="WO# or description" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Site</label>
          <select value={filterSite} onChange={e => setFilterSite(e.target.value)}>
            <option value="all">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn btn-warning" onClick={() => { setSearch(''); setFilterSite('all'); setFilterStatus('all'); }} style={{ width: '100%' }}>Clear</button>
        </div>
      </div>

      <div style={{ marginBottom: '12px', color: '#64748b', fontSize: '14px' }}>
        Showing <strong>{filtered.length}</strong> of {orders.length} work orders
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="alert alert-info">No work orders match your filters.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>WO #</th><th>Site</th><th>Category</th><th>Description</th>
              <th>Executor</th><th>Priority</th><th>Status</th><th>Cost</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id}>
                <td style={{ fontWeight: 'bold' }}>{o.wo_no}</td>
                <td>{o.site}</td>
                <td>{o.category}</td>
                <td>{o.description}</td>
                <td>
                  <span className="status-badge" style={{ background: (o.contractor_name && o.contractor_name !== 'Company' && o.contractor_name !== 'Internal') ? '#fef3c7' : '#dbeafe', color: (o.contractor_name && o.contractor_name !== 'Company' && o.contractor_name !== 'Internal') ? '#b45309' : '#1e40af' }}>
                    {(o.contractor_name && o.contractor_name !== 'Company' && o.contractor_name !== 'Internal') ? 'Contractor' : 'Employee'}
                  </span>
                  {o.contractor_name && o.contractor_name !== 'Company' && o.contractor_name !== 'Internal' && <div style={{ fontSize: '11px', color: '#64748b' }}>{o.contractor_name}</div>}
                </td>
                <td>
                  <span className={
                    'status-badge ' +
                    (o.priority === 'Urgent' ? 'status-urgent' :
                     o.priority === 'High' ? 'status-warning' : 'status-safe')
                  }>
                    {o.priority}
                  </span>
                </td>
                <td>
                  <span className={o.status === 'Open' ? 'status-warning' : 'status-safe'} style={{ display: 'inline-block', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                    {o.status}
                  </span>
                </td>
                <td style={{ fontWeight: 'bold' }}>{Number(o.final_cost || 0).toLocaleString()}</td>
                <td>
                  {o.status === 'Open' && canWork && (
                    <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleClose(o)}>Close</button>
                  )}
                  {canWork && <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleEdit(o)}>Edit</button>}
                  {canWork && <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleDelete(o.id)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}


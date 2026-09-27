import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';
import ExcelImportButton from '../components/ExcelImportButton';

export default function Projects({ user, access = {} }) {
  const canWork = user?.role === 'Owner' || !!access?.projects?.can_work;
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterSite, setFilterSite] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({
    name: '', description: '', site: '', projectType: 'Development', status: 'Active',
    budget: 0, spent: 0, startDate: '', endDate: '', manager: '', contractor: '', notes: ''
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [p, s] = await Promise.all([api.get('/projects'), api.get('/sites')]);
      setProjects(p.data.projects || []);
      setSites(s.data.sites || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ name: '', description: '', site: '', projectType: 'Development', status: 'Active',
      budget: 0, spent: 0, startDate: '', endDate: '', manager: '', contractor: '', notes: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      if (editing) {
        await api.put('/projects/' + editing.id, form);
        setMessage('Project updated');
      } else {
        await api.post('/projects', form);
        setMessage('Project created');
      }
      resetForm();
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleEdit = (p) => {
    setForm({
      name: p.name || '', description: p.description || '', site: p.site || '',
      projectType: p.project_type || 'Development', status: p.status || 'Active',
      budget: p.budget || 0, spent: p.spent || 0,
      startDate: p.start_date || '', endDate: p.end_date || '',
      manager: p.manager || '', contractor: p.contractor || '', notes: p.notes || ''
    });
    setEditing(p);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this project?')) return;
    try {
      await api.delete('/projects/' + id);
      setMessage('Project deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const filtered = projects.filter(p => {
    const matchSite = filterSite === 'all' || p.site === filterSite;
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchSite && matchStatus;
  });

  const totalBudget = filtered.reduce((s, p) => s + Number(p.budget || 0), 0);
  const totalSpent = filtered.reduce((s, p) => s + Number(p.spent || 0), 0);
  const remaining = totalBudget - totalSpent;

  return (
    <div className="panel">
      <div style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Projects</h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        
        <button className="btn btn-success" style={{ marginRight: "8px" }} onClick={() => exportToCSV(filtered, "projects", [{key:"project_no",label:"Project #"},{key:"name",label:"Name"},{key:"site",label:"Site"},{key:"project_type",label:"Type"},{key:"manager",label:"Manager"},{key:"budget",label:"Budget"},{key:"spent",label:"Spent"},{key:"status",label:"Status"}])}>Export CSV</button>{canWork && <><button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? 'Cancel' : '+ New Project'}
        </button><ExcelImportButton endpoint="/projects" kind="projects" onImported={load} label="Import Excel" /></>}
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Summary */}
      <div className="cards-grid" style={{ marginBottom: '16px' }}>
        <div className="card">
          <h3>Total Budget</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{totalBudget.toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card warning">
          <h3>Total Spent</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{totalSpent.toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className={remaining >= 0 ? 'card success' : 'card danger'}>
          <h3>Remaining</h3>
          <div className="big-number" style={{ color: remaining >= 0 ? '#16a34a' : '#dc2626' }}>
            {remaining.toLocaleString()}
          </div>
          <div className="sub">SAR</div>
        </div>
      </div>

      {showForm && canWork && (
        <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3>{editing ? 'Edit Project' : 'New Project'}</h3>
          <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="form-group"><label>Project Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="form-group">
              <label>Site *</label>
              <select value={form.site} onChange={e => setForm({ ...form, site: e.target.value })} required>
                <option value="">-- Select Site --</option>
                {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Type</label>
              <select value={form.projectType} onChange={e => setForm({ ...form, projectType: e.target.value })}>
                <option value="Development">Development</option>
                <option value="Renovation">Renovation</option>
                <option value="Expansion">Expansion</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group"><label>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div className="form-group"><label>Budget (SAR)</label><input type="number" value={form.budget} onChange={e => setForm({ ...form, budget: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Spent (SAR)</label><input type="number" value={form.spent} onChange={e => setForm({ ...form, spent: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Start Date</label><input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
            <div className="form-group"><label>End Date</label><input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
            <div className="form-group"><label>Manager</label><input value={form.manager} onChange={e => setForm({ ...form, manager: e.target.value })} /></div>
            <div className="form-group"><label>Contractor</label><input value={form.contractor} onChange={e => setForm({ ...form, contractor: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Description</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}></textarea></div>
          <div className="btn-row">
            <button type="submit" className="btn btn-success">{editing ? 'Update' : 'Save'}</button>
            <button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
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
            <option value="Active">Active</option>
            <option value="On Hold">On Hold</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="alert alert-info">No projects yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Project #</th><th>Name</th><th>Site</th><th>Type</th><th>Manager</th>
              <th>Budget</th><th>Spent</th><th>Progress</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const pct = p.budget > 0 ? Math.min((p.spent / p.budget) * 100, 100) : 0;
              return (
                <tr key={p.id}>
                  <td style={{ fontWeight: 'bold' }}>{p.project_no}</td>
                  <td style={{ fontWeight: 'bold' }}>{p.name}</td>
                  <td>{p.site}</td>
                  <td>{p.project_type}</td>
                  <td>{p.manager || '-'}</td>
                  <td>{Number(p.budget || 0).toLocaleString()}</td>
                  <td>{Number(p.spent || 0).toLocaleString()}</td>
                  <td style={{ minWidth: '120px' }}>
                    <div style={{ background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ background: pct > 90 ? '#dc2626' : pct > 70 ? '#f59e0b' : '#16a34a', width: pct + '%', height: '100%' }}></div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{pct.toFixed(0)}%</div>
                  </td>
                  <td>
                    <span className={
                      'status-badge ' +
                      (p.status === 'Active' ? 'status-warning' :
                       p.status === 'Completed' ? 'status-safe' :
                       p.status === 'Cancelled' ? 'status-urgent' : 'status-warning')
                    }>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    {canWork && <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleEdit(p)}>Edit</button>}
                    {canWork && <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleDelete(p.id)}>Delete</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}


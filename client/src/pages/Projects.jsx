import { useState, useEffect } from 'react';
import React from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';
import * as XLSX from 'xlsx';
import ExcelImportButton from '../components/ExcelImportButton';

export default function Projects({ user, access = {}, entryOnly = false }) {
  const canWork = user?.role === 'Owner' || !!access?.projects?.can_work;
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(entryOnly);
  const [editing, setEditing] = useState(null);
  const [filterSite, setFilterSite] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [openProjectId, setOpenProjectId] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', site: '', projectType: 'Development', status: 'Not Started',
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
    setForm({ name: '', description: '', site: '', projectType: 'Development', status: 'Not Started',
      budget: 0, spent: 0, startDate: '', endDate: '', manager: '', contractor: '', notes: '' });
    setEditing(null);
    setShowForm(entryOnly);
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

  const loadItems = async (projectId) => {
    try {
      setItemsLoading(true);
      const r = await api.get('/projects/' + projectId + '/items');
      setItems(r.data.items || []);
      setOpenProjectId(projectId);
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setItemsLoading(false); }
  };

  const updateItemStatus = async (item, status) => {
    try {
      const r = await api.put('/project-items/' + item.id, { status, actualAmount:item.actual_amount || 0, notes:item.notes || '' });
      setItems(prev => prev.map(x => x.id === item.id ? r.data.item : x));
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const closeItem = async (item) => {
    const amount = window.prompt('Actual amount (SAR):', String(item.actual_amount || 0));
    if (amount === null) return;
    const notes = window.prompt('Closing notes:', item.notes || '') ?? '';
    try {
      const r = await api.put('/project-items/' + item.id + '/close', { actualAmount:Number(amount) || 0, notes });
      setItems(prev => prev.map(x => x.id === item.id ? r.data.item : x));
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const reopenItem = async (item) => {
    if (!window.confirm('Reopen this item so it can be edited and closed again?')) return;
    try {
      const r = await api.put('/project-items/' + item.id + '/reopen');
      setItems(prev => prev.map(x => x.id === item.id ? r.data.item : x));
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const exportItemsExcel = (project) => {
    const rows = items.map(x => ({
      Sr: x.sr_no, Section:x.section, Item:x.item, Unit:x.unit, Quantity:x.quantity,
      Price:x.price, Cost:x.cost, Status:x.status, 'Actual Amount':x.actual_amount, Notes:x.notes
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Project Items');
    XLSX.writeFile(wb, (project.name || 'Project') + '-Items.xlsx');
  };

  const exportItemsPDF = (project) => {
    const win = window.open('', '_blank');
    if (!win) return;
    const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    win.document.write('<html><head><title>' + esc(project.name) + '</title><style>body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#eee}.meta{margin-bottom:16px}.system-name{font-size:18px;font-weight:700;margin-bottom:3px}.system-sub{font-size:11px;color:#666;margin-bottom:14px}</style></head><body><div class="system-name">Fleet &amp; Camp Maintenance ERP</div><div class="system-sub">System Generated Report</div>');
    win.document.write('<h2>' + esc(project.name) + '</h2><div class="meta">Site: ' + esc(project.site) + '</div><table><thead><tr><th>Sr.</th><th>Section</th><th>Item</th><th>Unit</th><th>Qty</th><th>Price</th><th>Cost</th><th>Status</th><th>Actual Amount</th><th>Notes</th></tr></thead><tbody>');
    items.forEach(x => win.document.write('<tr><td>'+esc(x.sr_no)+'</td><td>'+esc(x.section)+'</td><td>'+esc(x.item)+'</td><td>'+esc(x.unit)+'</td><td>'+esc(x.quantity)+'</td><td>'+esc(x.price)+'</td><td>'+esc(x.cost)+'</td><td>'+esc(x.status)+'</td><td>'+esc(x.actual_amount)+'</td><td>'+esc(x.notes)+'</td></tr>'));
    win.document.write('</tbody></table><script>window.onload=function(){window.print();}</script></body></html>');
    win.document.close();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this project?')) return;
    try {
      await api.delete('/projects/' + id);
      setMessage('Project deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const currentMonth = (() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  })();

  const monthlyProjects = projects.filter(p => String(p.start_date || '').slice(0, 7) === currentMonth);

  const filtered = projects.filter(p => {
    const matchSite = filterSite === 'all' || p.site === filterSite;
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchSite && matchStatus;
  });

  const totalBudget = filtered.reduce((s, p) => s + Number(p.budget || 0), 0);
  const totalSpent = filtered.reduce((s, p) => s + Number(p.spent || 0), 0);
  const remaining = totalBudget - totalSpent;

  return (
    <div className={entryOnly ? "panel building-entry-only" : "panel"}>
      <style>{`
        .building-entry-only > *:not(.building-entry-form):not(.building-monthly-table) { display: none !important; }
        .building-entry-only > .building-entry-form,
        .building-entry-only > .building-monthly-table { display: block !important; }
      `}</style>
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
        <form className="building-entry-form" onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
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
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
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

      {entryOnly && (
        <div className="building-monthly-table" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '10px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Projects — Current Month ({currentMonth})</h3>
            <span style={{ color: '#64748b', fontSize: '13px' }}>{monthlyProjects.length} record(s)</span>
          </div>
          {loading ? <div className="loading">Loading...</div> : monthlyProjects.length === 0 ? (
            <div className="alert alert-info">No projects recorded for {currentMonth}.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>
                  <th>Project #</th><th>Start Date</th><th>Name</th><th>Site</th><th>Type</th>
                  <th>Manager</th><th>Contractor</th><th>Budget (SAR)</th><th>Spent (SAR)</th><th>Status</th>
                </tr></thead>
                <tbody>{monthlyProjects.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 'bold' }}>{p.project_no}</td><td>{p.start_date || '-'}</td>
                    <td>{p.name || '-'}</td><td>{p.site || '-'}</td><td>{p.project_type || '-'}</td>
                    <td>{p.manager || '-'}</td><td>{p.contractor || '-'}</td>
                    <td>{Number(p.budget || 0).toLocaleString()}</td><td>{Number(p.spent || 0).toLocaleString()}</td>
                    <td>{p.status || '-'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
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
              const pct = Number(p.progress_percent ?? 0);
              return (
                <React.Fragment key={p.id}>
                  <tr>
                    <td style={{ fontWeight: 'bold' }}>{p.project_no}</td>
                    <td style={{ fontWeight: 'bold' }}>{p.name}</td>
                    <td>{p.site}</td><td>{p.project_type}</td><td>{p.manager || '-'}</td>
                    <td>{Number(p.budget || 0).toLocaleString()}</td><td>{Number(p.spent || 0).toLocaleString()}</td>
                    <td style={{ minWidth: '120px' }}>
                      <div style={{ background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ background: pct > 90 ? '#dc2626' : pct > 70 ? '#f59e0b' : '#16a34a', width: pct + '%', height: '100%' }}></div>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{pct.toFixed(0)}%</div>
                    </td>
                    <td><span className={'status-badge ' + (p.status === 'Completed' ? 'status-safe' : p.status === 'Cancelled' ? 'status-urgent' : 'status-warning')}>{p.status}</span></td>
                    <td>
                      <button className="btn btn-primary" style={{padding:'6px 10px',fontSize:'12px',marginRight:'4px'}} onClick={() => openProjectId === p.id ? setOpenProjectId(null) : loadItems(p.id)}>{openProjectId === p.id ? 'Hide Items' : 'Items'}</button>
                      {canWork && <button className="btn btn-primary" style={{padding:'6px 10px',fontSize:'12px',marginRight:'4px'}} onClick={() => handleEdit(p)}>Edit</button>}
                      {canWork && <button className="btn btn-danger" style={{padding:'6px 10px',fontSize:'12px'}} onClick={() => handleDelete(p.id)}>Delete</button>}
                    </td>
                  </tr>
                  {openProjectId === p.id && (
                    <tr><td colSpan="10">
                      <div style={{padding:12,background:'#f8fafc'}}>
                        <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
                          <strong style={{marginRight:'auto'}}>Project Items — {p.name}</strong>
                          <button className="btn btn-success" onClick={() => exportItemsExcel(p)}>Export Excel</button>
                          <button className="btn btn-primary" onClick={() => exportItemsPDF(p)}>Export PDF</button>
                        </div>
                        {itemsLoading ? <div>Loading items...</div> : items.length === 0 ? <div>No imported items.</div> : (
                          <table><thead><tr><th>Sr.</th><th>Section</th><th>Item</th><th>Unit</th><th>Qty</th><th>Price</th><th>Cost</th><th>Status</th><th>Actual Amount</th><th>Notes</th><th>Action</th></tr></thead>
                          <tbody>{items.map(item => <tr key={item.id}>
                            <td>{item.sr_no}</td><td>{item.section || '-'}</td><td>{item.item}</td><td>{item.unit}</td><td>{item.quantity}</td><td>{item.price}</td><td>{item.cost}</td>
                            <td><select value={item.status || 'Not Started'} onChange={e => updateItemStatus(item,e.target.value)}>
                              <option>Not Started</option><option>In Progress</option><option>Completed</option><option>On Hold</option>
                            </select></td>
                            <td>{item.actual_amount || 0}</td><td>{item.notes || '-'}</td>
                            <td style={{whiteSpace:'nowrap'}}>
  {item.status === 'Completed' && Number(item.actual_amount || 0) > 0 && String(item.notes || '').trim() ? (
    <button className="btn btn-warning" style={{padding:'5px 8px'}} onClick={() => reopenItem(item)}>Reopen</button>
  ) : (
    <button className="btn btn-success" style={{padding:'5px 8px'}} onClick={() => closeItem(item)}>Close</button>
  )}
</td>
                          </tr>)}</tbody></table>
                        )}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}


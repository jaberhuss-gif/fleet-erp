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
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
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

  const previewPdf = async (file) => {
    if (!file) return;
    setPdfFile(file); setPdfPreview(null); setError(''); setMessage('');
    try {
      setPdfBusy(true);
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/building-maintenance/import-pdf/preview', fd, { timeout: 120000 });
      const d = r.data;
      setPdfPreview({
        ...d,
        projectName: d.projectName || file.name.replace(/\\.pdf$/i, ''),
        site: d.site || '',
        date: d.date || ''
      });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setPdfBusy(false); }
  };

  const importPdf = async () => {
    if (!pdfFile || !pdfPreview?.items?.length) return;
    if (!pdfPreview.site) return setError('Select the Site before importing this PDF.');
    try {
      setPdfBusy(true); setError(''); setMessage('');
      const fd = new FormData();
      fd.append('file', pdfFile);
      await api.post('/building-maintenance/import-pdf', fd, {
        timeout: 120000,
        headers: {
          'X-PDF-Site': pdfPreview.site,
          'X-PDF-Project-Name': pdfPreview.projectName || pdfFile.name,
          'X-PDF-Date': pdfPreview.date || ''
        }
      });
      setMessage('PDF imported: Project + Work Order created OPEN. Final item amounts were left at 0 for you to close.');
      setPdfFile(null); setPdfPreview(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setPdfBusy(false); }
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

  const totalCost = filtered.reduce((s, p) => s + Number(p.total_cost ?? p.spent ?? 0), 0);
  const contractorCost = filtered.reduce((s, p) => s + Number(p.contractor_cost ?? (p.contractor ? (p.total_cost ?? p.spent ?? 0) : 0)), 0);

  return (
    <div className={entryOnly ? "panel building-entry-only" : "panel"}>
      <style>{`
         .building-entry-only > *:not(.building-entry-form):not(.building-monthly-table):not(.building-pdf-import-toolbar) { display: none !important; }
        .building-entry-only > .building-entry-form,
         .building-entry-only > .building-monthly-table, .building-entry-only > .building-pdf-import-toolbar { display: block !important; }
      `}</style>
      <div style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Projects</h2>
        </div>
        <div className="building-pdf-import-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px', padding:'10px 0' }}>
        
        <button className="btn btn-success" style={{ marginRight: "8px" }} onClick={() => exportToCSV(filtered, "projects", [{key:"project_no",label:"Project #"},{key:"name",label:"Name"},{key:"site",label:"Site"},{key:"project_type",label:"Type"},{key:"manager",label:"Manager"},{key:"budget",label:"Budget"},{key:"spent",label:"Spent"},{key:"status",label:"Status"}])}>Export CSV</button>{canWork && <><button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? 'Cancel' : '+ New Project'}
        </button><ExcelImportButton endpoint="/projects" kind="projects" onImported={load} label="Import Excel" /><label className="btn btn-warning" style={{cursor:"pointer",margin:0}}>{pdfBusy ? "Reading PDF..." : "Import PDF → Project + WO"}<input type="file" accept=".pdf,application/pdf" style={{display:"none"}} disabled={pdfBusy} onChange={e => previewPdf(e.target.files?.[0])} /></label></>}
      </div>

      {message && <div className="alert alert-success">{message}</div>}

      {pdfPreview && canWork && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'#fff',borderRadius:12,padding:20,maxWidth:1100,width:'100%',maxHeight:'90vh',overflow:'auto'}}>
            <h3 style={{marginTop:0}}>PDF Import — Project + Work Order</h3>
            <div className="cards-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))'}}>
              <div className="form-group"><label>Project Name</label><input value={pdfPreview.projectName || ''} onChange={e=>setPdfPreview({...pdfPreview,projectName:e.target.value})}/></div>
              <div className="form-group"><label>Site *</label><select value={pdfPreview.site || ''} onChange={e=>setPdfPreview({...pdfPreview,site:e.target.value})} required><option value="">-- Select Site --</option>{sites.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
              <div className="form-group"><label>Date (optional)</label><input type="date" value={pdfPreview.date || ''} onChange={e=>setPdfPreview({...pdfPreview,date:e.target.value})}/></div>
            </div>
            <div style={{margin:'10px 0',fontWeight:700}}>{pdfPreview.items.length} line items detected. PDF cost is NOT imported as final cost.</div>
            <div style={{overflowX:'auto'}}>
              <table><thead><tr><th>Sr.</th><th>Item</th><th>Unit</th><th>Qty</th><th>Unit Price (reference)</th><th>Final Cost</th><th>Status</th></tr></thead>
              <tbody>{pdfPreview.items.map(x=><tr key={x.sr_no}><td>{x.sr_no}</td><td>{x.item}</td><td>{x.unit}</td><td>{x.quantity}</td><td>{x.price}</td><td>0</td><td>Not Started</td></tr>)}</tbody></table>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
              <button className="btn btn-warning" onClick={()=>{setPdfPreview(null);setPdfFile(null);}}>Cancel</button>
              <button className="btn btn-success" disabled={pdfBusy || !pdfPreview.site} onClick={importPdf}>{pdfBusy ? 'Importing...' : 'Import Project + Work Order'}</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {/* Summary */}
      <div className="cards-grid" style={{ marginBottom: '16px' }}>
        <div className="card">
          <h3>Total Projects</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{filtered.length.toLocaleString()}</div>
          <div className="sub">records</div>
        </div>
        <div className="card warning">
          <h3>Total Cost</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{totalCost.toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card success">
          <h3>Contractor Cost</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{contractorCost.toLocaleString()}</div>
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
            <option value="In Progress">In Progress</option>
            <option value="On Hold">On Hold</option>
            <option value="Closed">Closed</option>
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
              <th>Project #</th><th>Location</th><th>Description</th><th>Start Date</th><th>End Date</th>
              <th>Status</th><th>Total Cost</th><th>Contractor Cost</th><th>Contractor</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const pct = Number(p.progress_percent ?? 0);
              return (
                <React.Fragment key={p.id}>
                  <tr>
                    <td style={{ fontWeight: 'bold' }}>{p.project_no}</td>
                    <td>{p.site || '-'}</td>
                    <td style={{ minWidth: '260px' }}>{p.description || '-'}</td>
                    <td>{p.start_date || '-'}</td>
                    <td>{p.end_date || '-'}</td>
                    <td><span className={'status-badge ' + (p.status === 'Closed' || p.status === 'Completed' ? 'status-safe' : p.status === 'Cancelled' ? 'status-urgent' : 'status-warning')}>{p.status || '-'}</span></td>
                    <td>{Number(p.total_cost ?? p.spent ?? 0).toLocaleString()}</td>
                    <td>{Number(p.contractor_cost ?? (p.contractor ? (p.total_cost ?? p.spent ?? 0) : 0)).toLocaleString()}</td>
                    <td>{p.contractor || '-'}</td>
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


import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const monthKey = (value) => {
  if (!value) return '';
  const s = String(value);
  return s.length >= 7 ? s.slice(0, 7) : '';
};

const currentMonth = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

const monthLabel = (m) => {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const inputStyle = { width:'100%', padding:'9px', border:'1px solid #cbd5e1', borderRadius:6, boxSizing:'border-box' };
const fieldStyle = { display:'flex', flexDirection:'column', gap:5 };

export default function BuildingMaintenance({ user, access = {} }) {
  const [section, setSection] = useState(null);
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState({ workOrders: [], projects: [], purchases: [] });
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [wo, setWo] = useState({ site:'', area:'', category:'General', priority:'Medium', description:'', assignedTo:'', isContractor:false, contractorName:'', performedBy:'', reportedDate:'', partsUsed:'' });
  const [project, setProject] = useState({ name:'', description:'', site:'', projectType:'Development', status:'Not Started', budget:0, spent:0, startDate:'', endDate:'', manager:'', contractor:'', notes:'' });
  const [purchase, setPurchase] = useState({ type:'Work Order', referenceNo:'', itemName:'', quantity:1, unitCost:0, supplier:'', purchasedBy:'Company', purchaseDate:'', notes:'' });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [w, p, r, s] = await Promise.all([api.get('/work-orders'), api.get('/projects'), api.get('/purchases'), api.get('/sites')]);
      setData({ workOrders:w.data.orders || [], projects:p.data.projects || [], purchases:r.data.purchases || [] });
      setSites(s.data.sites || []);
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const months = useMemo(() => {
    const set = new Set([currentMonth()]);
    data.workOrders.forEach(x => { const m=monthKey(x.reported_date || x.created_at); if(m) set.add(m); });
    data.projects.forEach(x => { const m=monthKey(x.start_date || x.created_at); if(m) set.add(m); });
    data.purchases.forEach(x => { const m=monthKey(x.purchase_date || x.created_at || x.month); if(m) set.add(m); });
    return [...set].sort().reverse();
  }, [data]);

  const rows = useMemo(() => {
    if (section === 'work-orders') return data.workOrders.filter(x => monthKey(x.reported_date || x.created_at) === month);
    if (section === 'projects') return data.projects.filter(x => monthKey(x.start_date || x.created_at) === month);
    if (section === 'purchases') return data.purchases.filter(x => monthKey(x.purchase_date || x.created_at || x.month) === month);
    return [];
  }, [data, section, month]);

  const title = section === 'work-orders' ? 'Work Orders' : section === 'projects' ? 'Projects' : 'Purchases';

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      if (section === 'work-orders') {
        const payload = { ...wo, reportedDate: wo.reportedDate || new Date().toISOString().slice(0,10) };
        await api.post('/work-orders', payload);
        setWo({ site:'', area:'', category:'General', priority:'Medium', description:'', assignedTo:'', isContractor:false, contractorName:'', performedBy:'', reportedDate:'', partsUsed:'' });
        setMessage('Work order created successfully.');
      } else if (section === 'projects') {
        const payload = { ...project, startDate: project.startDate || new Date().toISOString().slice(0,10) };
        await api.post('/projects', payload);
        setProject({ name:'', description:'', site:'', projectType:'Development', status:'Not Started', budget:0, spent:0, startDate:'', endDate:'', manager:'', contractor:'', notes:'' });
        setMessage('Project created successfully.');
      } else {
        const payload = { ...purchase, purchaseDate: purchase.purchaseDate || new Date().toISOString().slice(0,10) };
        await api.post('/purchases', payload);
        setPurchase({ type:'Work Order', referenceNo:'', itemName:'', quantity:1, unitCost:0, supplier:'', purchasedBy:'Company', purchaseDate:'', notes:'' });
        setMessage('Purchase recorded successfully.');
      }
      setShowForm(false);
      await load();
      setMonth(currentMonth());
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const setW = (k,v) => setWo(x=>({...x,[k]:v}));
  const setP = (k,v) => setProject(x=>({...x,[k]:v}));
  const setBuy = (k,v) => setPurchase(x=>({...x,[k]:v}));

  return (
    <div className="panel">
      <h2 style={{marginBottom:6}}>Building Maintenance</h2>
      {!section ? (
        <>
          <div style={{color:'#64748b',marginBottom:20}}>Monthly building maintenance workspace</div>
          <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
            <button className="btn btn-primary" onClick={()=>setSection('work-orders')}>Work Orders</button>
            <button className="btn btn-primary" onClick={()=>setSection('projects')}>Projects</button>
            <button className="btn btn-primary" onClick={()=>setSection('purchases')}>Purchases</button>
          </div>
        </>
      ) : (
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:16}}>
            <button className="btn btn-warning" onClick={()=>{setSection(null);setShowForm(false);}}>Back</button>
            <h3 style={{margin:0}}>{title} — {monthLabel(month)}</h3>
            <div style={{display:'flex',gap:8}}>
              <select value={month} onChange={e=>setMonth(e.target.value)} style={{padding:'8px 10px',borderRadius:6}}>
                {months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <button className="btn btn-primary" onClick={()=>{setMessage('');setError('');setShowForm(x=>!x);}}>
                {showForm ? 'Close Entry' : '+ New Entry'}
              </button>
            </div>
          </div>

          {message && <div className="alert alert-success">{message}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          {showForm && (
            <form onSubmit={save} style={{border:'1px solid #dbe3ec',borderRadius:10,padding:18,marginBottom:20}}>
              <h3 style={{marginTop:0}}>New {title}</h3>
              {section === 'work-orders' && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:14}}>
                  <label style={fieldStyle}>Site<select required value={wo.site} onChange={e=>setW('site',e.target.value)} style={inputStyle}><option value="">Select site</option>{sites.map(s=><option key={s.id||s.name} value={s.name}>{s.name}</option>)}</select></label>
                  <label style={fieldStyle}>Area<input value={wo.area} onChange={e=>setW('area',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Category<select value={wo.category} onChange={e=>setW('category',e.target.value)} style={inputStyle}><option>General</option><option>Plumbing</option><option>Electrical</option><option>HVAC</option><option>Carpentry</option><option>Civil</option><option>Other</option></select></label>
                  <label style={fieldStyle}>Priority<select value={wo.priority} onChange={e=>setW('priority',e.target.value)} style={inputStyle}><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></label>
                  <label style={fieldStyle}>Reported Date<input type="date" value={wo.reportedDate} onChange={e=>setW('reportedDate',e.target.value)} style={inputStyle}/></label>
                  <label style={{...fieldStyle,gridColumn:'1/-1'}}>Description<textarea required value={wo.description} onChange={e=>setW('description',e.target.value)} style={{...inputStyle,minHeight:80}}/></label>
                  <label style={fieldStyle}>Assigned To<input value={wo.assignedTo} onChange={e=>setW('assignedTo',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Performed By<input value={wo.performedBy} onChange={e=>setW('performedBy',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Parts Used<input value={wo.partsUsed} onChange={e=>setW('partsUsed',e.target.value)} style={inputStyle}/></label>
                </div>
              )}
              {section === 'projects' && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:14}}>
                  <label style={fieldStyle}>Project Name<input required value={project.name} onChange={e=>setP('name',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Site<select value={project.site} onChange={e=>setP('site',e.target.value)} style={inputStyle}><option value="">Select site</option>{sites.map(s=><option key={s.id||s.name} value={s.name}>{s.name}</option>)}</select></label>
                  <label style={fieldStyle}>Type<select value={project.projectType} onChange={e=>setP('projectType',e.target.value)} style={inputStyle}><option>Development</option><option>Construction</option><option>Improvement</option><option>Other</option></select></label>
                  <label style={fieldStyle}>Status<select value={project.status} onChange={e=>setP('status',e.target.value)} style={inputStyle}><option>Not Started</option><option>Active</option><option>On Hold</option><option>Completed</option></select></label>
                  <label style={fieldStyle}>Budget<input type="number" value={project.budget} onChange={e=>setP('budget',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Start Date<input type="date" value={project.startDate} onChange={e=>setP('startDate',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>End Date<input type="date" value={project.endDate} onChange={e=>setP('endDate',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Manager<input value={project.manager} onChange={e=>setP('manager',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Contractor<input value={project.contractor} onChange={e=>setP('contractor',e.target.value)} style={inputStyle}/></label>
                  <label style={{...fieldStyle,gridColumn:'1/-1'}}>Description<textarea value={project.description} onChange={e=>setP('description',e.target.value)} style={{...inputStyle,minHeight:70}}/></label>
                </div>
              )}
              {section === 'purchases' && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:14}}>
                  <label style={fieldStyle}>Type<select value={purchase.type} onChange={e=>setBuy('type',e.target.value)} style={inputStyle}><option>Work Order</option><option>Project</option><option>General</option></select></label>
                  <label style={fieldStyle}>Reference No.<input value={purchase.referenceNo} onChange={e=>setBuy('referenceNo',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Item Name<input required value={purchase.itemName} onChange={e=>setBuy('itemName',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Quantity<input type="number" min="1" value={purchase.quantity} onChange={e=>setBuy('quantity',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Unit Cost<input type="number" min="0" value={purchase.unitCost} onChange={e=>setBuy('unitCost',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Supplier<input value={purchase.supplier} onChange={e=>setBuy('supplier',e.target.value)} style={inputStyle}/></label>
                  <label style={fieldStyle}>Purchased By<select value={purchase.purchasedBy} onChange={e=>setBuy('purchasedBy',e.target.value)} style={inputStyle}><option>Company</option><option>Contractor</option></select></label>
                  <label style={fieldStyle}>Purchase Date<input type="date" value={purchase.purchaseDate} onChange={e=>setBuy('purchaseDate',e.target.value)} style={inputStyle}/></label>
                  <label style={{...fieldStyle,gridColumn:'1/-1'}}>Notes<textarea value={purchase.notes} onChange={e=>setBuy('notes',e.target.value)} style={{...inputStyle,minHeight:70}}/></label>
                </div>
              )}
              <button className="btn btn-success" type="submit" disabled={saving} style={{marginTop:16}}>{saving ? 'Saving...' : 'Save'}</button>
            </form>
          )}

          <div style={{overflowX:'auto'}}>
            <table className="data-table" style={{width:'100%'}}>
              <thead><tr>
                {section==='work-orders' && <><th>WO #</th><th>Date</th><th>Site</th><th>Category</th><th>Description</th><th>Status</th><th>Total Cost</th></>}
                {section==='projects' && <><th>Project #</th><th>Location</th><th>Description</th><th>Start Date</th><th>End Date</th><th>Status</th><th>Total Cost</th><th>Contractor Cost</th><th>Contractor</th></>}
                {section==='purchases' && <><th>Purchase #</th><th>Date</th><th>Type</th><th>Reference ID</th><th>Item</th><th>Qty</th><th>Unit Cost</th><th>Total Cost</th><th>Supplier</th><th>Supplier Type</th><th>Notes</th></>}
              </tr></thead>
              <tbody>
                {loading && <tr><td colSpan={8} style={{textAlign:'center',padding:24}}>Loading...</td></tr>}
                {!loading && rows.length===0 && <tr><td colSpan={8} style={{textAlign:'center',padding:24}}>No records for {monthLabel(month)}</td></tr>}
                {!loading && section==='work-orders' && rows.map(x=><tr key={x.id}><td>{x.wo_no||x.wo_number||x.work_order_no||x.id}</td><td>{x.reported_date||''}</td><td>{x.site||''}</td><td>{x.category||''}</td><td>{x.description||''}</td><td>{x.status||''}</td><td>{Number(x.final_cost||x.total_cost||0).toLocaleString()}</td></tr>)}
                {!loading && section==='projects' && rows.map(x=><tr key={x.id}><td>{x.project_no||''}</td><td>{x.site||''}</td><td>{x.description||''}</td><td>{x.start_date||''}</td><td>{x.end_date||''}</td><td>{x.status||''}</td><td>{Number(x.total_cost ?? x.spent ?? 0).toLocaleString()}</td><td>{Number(x.contractor_cost ?? (x.contractor ? (x.total_cost ?? x.spent ?? 0) : 0)).toLocaleString()}</td><td>{x.contractor||''}</td></tr>)}
                {!loading && section==='purchases' && rows.map(x=><tr key={x.id}><td>{x.purchase_no||x.id}</td><td>{x.purchase_date||''}</td><td>{x.type||''}</td><td>{x.reference_no||''}</td><td>{x.item_name||''}</td><td>{x.quantity||0}</td><td>{Number(x.unit_cost||0).toLocaleString()}</td><td>{Number(x.total_cost||0).toLocaleString()}</td><td>{x.supplier||''}</td><td>{x.purchased_by||''}</td><td>{x.notes||''}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:12,color:'#64748b',fontSize:13}}>{rows.length} record(s) in {monthLabel(month)}.</div>
        </>
      )}
    </div>
  );
}


// New ERP-native Building Maintenance workspace note:
// Data source: Vela PostgreSQL through /api/* only.
// This page intentionally has no dependency on Google Apps Script, Neon, or the legacy FMS.

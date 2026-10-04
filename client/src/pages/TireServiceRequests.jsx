import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const REQUEST_TYPES = [
  ['TIRE_SHOP_VISIT', 'Tire Shop Visit'],
  ['TIRE_REPLACEMENT_DAMAGE', 'Tire Replacement — Damage'],
  ['PUNCTURE_REPAIR', 'Puncture / Repair'],
  ['OTHER', 'Other Tire Service']
];
const POSITIONS = ['Front Left','Front Right','Rear Left','Rear Right','Spare','Sixth'];
const STATUSES = ['PENDING','APPROVED','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED'];

export default function TireServiceRequests({ driverMode=false }) {
  const [vehicles,setVehicles]=useState([]);
  const [vehicleId,setVehicleId]=useState('');
  const [form,setForm]=useState({requestType:'TIRE_SHOP_VISIT',position:'',notes:'',photo:''});
  const [rows,setRows]=useState([]);
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('');
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const loadVehicles=async()=>{try{const r=await api.get('/vehicles/list');setVehicles(r.data.vehicles||[]);}catch(e){setError(e.response?.data?.error||e.message);}};
  const loadRequests=async()=>{try{
    const p=new URLSearchParams();
    if(search.trim())p.set('vehicle',search.trim());
    if(statusFilter)p.set('status',statusFilter);
    const r=await api.get('/tire/service-requests'+(p.toString()?'?'+p.toString():''));
    setRows(r.data.requests||[]);
  }catch(e){setError(e.response?.data?.error||e.message);}};

  useEffect(()=>{loadVehicles();if(!driverMode)loadRequests();},[]);
  useEffect(()=>{if(!driverMode){const t=setTimeout(loadRequests,250);return()=>clearTimeout(t);}},[search,statusFilter]);

  const selectedVehicle=vehicles.find(v=>String(v.id)===String(vehicleId));
  const choosePhoto=async(file)=>{
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>setForm(f=>({...f,photo:reader.result}));
    reader.onerror=()=>setError('Could not read the tire photo.');
    reader.readAsDataURL(file);
  };
  const submit=async()=>{
    setMessage('');setError('');
    if(!vehicleId)return setError('Select a vehicle first.');
    if(!form.notes.trim())return setError('Please describe the tire issue or required service.');
    setLoading(true);
    try{
      await api.post('/tire/vehicle/'+vehicleId+'/service-request',form);
      setForm({requestType:'TIRE_SHOP_VISIT',position:'',notes:'',photo:''});
      setMessage('Tire Service Request submitted successfully.');
      if(!driverMode)await loadRequests();
    }catch(e){setError(e.response?.data?.error||e.message);}
    finally{setLoading(false);}
  };
  const updateStatus=async(id,status)=>{try{await api.put('/tire/service-requests/'+id,{status});await loadRequests();}catch(e){setError(e.response?.data?.error||e.message);}};

  if(driverMode)return <div className="hub-page">
    <div className="panel"><h1 style={{margin:0}}>🛞 Tire Service Request</h1><p style={{color:'#64748b'}}>Request a tire shop visit, puncture repair, or tire replacement due to damage.</p></div>
    {message&&<div className="alert alert-success">{message}</div>}{error&&<div className="alert alert-error">{error}</div>}
    <div className="panel">
      <label>Vehicle</label>
      <select value={vehicleId} onChange={e=>setVehicleId(e.target.value)} style={{maxWidth:500}}>
        <option value="">-- Select vehicle --</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}
      </select>
      {selectedVehicle&&<div style={{marginTop:8,color:'#64748b',fontSize:13}}>Vehicle: <strong>{selectedVehicle.plate}</strong>{selectedVehicle.driver?' — '+selectedVehicle.driver:''}</div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:8,marginTop:12}}>
        <select value={form.requestType} onChange={e=>setForm({...form,requestType:e.target.value})}>{REQUEST_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        <select value={form.position} onChange={e=>setForm({...form,position:e.target.value})}><option value="">Tire Position</option>{POSITIONS.map(p=><option key={p}>{p}</option>)}</select>
      </div>
      <textarea placeholder="Describe the tire problem / required service" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={{marginTop:8,minHeight:100}}/>
      <label style={{display:'block',marginTop:8,fontWeight:600}}>📷 Damage / Tire Photo (optional)</label>
      <input type="file" accept="image/*" capture="environment" onChange={e=>choosePhoto(e.target.files?.[0])}/>
      {form.photo&&<img src={form.photo} alt="Tire service request" style={{width:'100%',maxWidth:420,height:180,objectFit:'cover',borderRadius:8,marginTop:8}}/>}
      <button className="btn btn-primary" disabled={loading} onClick={submit} style={{marginTop:10}}>{loading?'Submitting...':'Submit Tire Service Request'}</button>
    </div>
  </div>;

  const filteredRows=useMemo(()=>rows.filter(r=>!search.trim()||String(r.plate||'').toLowerCase().includes(search.trim().toLowerCase())),[rows,search]);
  return <div className="hub-page">
    <div className="panel">
      <h1 style={{margin:0}}>🛞 Tire Service Requests</h1><p style={{color:'#64748b'}}>Track driver tire-service requests by vehicle number and status.</p>
      {error&&<div className="alert alert-error">{error}</div>}
      <div style={{display:'grid',gridTemplateColumns:'minmax(260px,1fr) 220px auto',gap:8,alignItems:'end',marginTop:12}}>
        <div><label>Search by Vehicle Number</label><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="e.g. 2344 or 2344 EUA"/></div>
        <div><label>Status</label><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All Statuses</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
        <button className="btn btn-secondary" onClick={loadRequests}>Refresh</button>
      </div>
    </div>
    <div className="panel" style={{marginTop:12}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:10}}><h2 style={{margin:0}}>Request Log</h2><strong>Total: {filteredRows.length}</strong></div>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Date</th><th>Vehicle</th><th>Request</th><th>Position</th><th>Driver / User</th><th>Notes</th><th>Status</th></tr></thead>
      <tbody>{filteredRows.length===0?<tr><td colSpan="7" style={{textAlign:'center',padding:24,color:'#64748b'}}>No tire service requests found.</td></tr>:filteredRows.map(r=><tr key={r.id}>
        <td>{r.created_at?new Date(r.created_at).toLocaleString():'-'}</td><td><strong>{r.plate||r.vehicle_id}</strong></td>
        <td>{REQUEST_TYPES.find(x=>x[0]===r.request_type)?.[1]||r.request_type}</td><td>{r.position||'-'}</td><td>{r.created_by_name||r.driver||r.created_by||'-'}</td>
        <td style={{minWidth:240}}>{r.notes||'-'}{r.photo&&<div><a href={r.photo} target="_blank" rel="noreferrer">View Photo</a></div>}</td>
        <td><select value={r.status||'PENDING'} onChange={e=>updateStatus(r.id,e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></td>
      </tr>)}</tbody></table></div>
    </div>
  </div>;
}

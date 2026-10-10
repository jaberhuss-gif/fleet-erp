import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const REQUEST_TYPES = [
  ['TIRE_ROTATION', 'Tire Rotation'],
  ['NEW_TIRE_INSTALLATION', 'New Tire Installation'],
  ['DAMAGED_TIRE_REPLACEMENT', 'Damaged Tire Replacement'],
  ['PUNCTURE_REPAIR', 'Puncture Repair']
];
const POSITIONS = ['Front Left','Front Right','Rear Left','Rear Right','Spare','Sixth'];
const STATUSES = ['PENDING','APPROVED','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED'];

export default function TireServiceRequests({ driverMode=false }) {
  const [vehicles,setVehicles]=useState([]);
  const [vehiclesLoading,setVehiclesLoading]=useState(true);
  const [vehiclesLoadError,setVehiclesLoadError]=useState('');
  const [vehicleId,setVehicleId]=useState('');
  const [form,setForm]=useState({
    requestType:'TIRE_ROTATION',
    position:'',
    fromPosition:'',
    toPosition:'',
    tireSerial:'',
    tireDate:'',
    tireSize:'',
    pressurePsi:'',
    notes:'',
    photo:''
  });
  const [rows,setRows]=useState([]);
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('');
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const loadVehicles=async()=>{setVehiclesLoading(true);setVehiclesLoadError('');try{const endpoint=driverMode?'/tire/driver/vehicles':'/vehicles/list';const r=await api.get(endpoint);setVehicles(r.data.vehicles||[]);}catch(e){const detail=e.response?.data?.error||e.message||'Could not load vehicles.';setVehiclesLoadError(detail);setError(detail);}finally{setVehiclesLoading(false);}};
  const loadRequests=async()=>{try{
    const p=new URLSearchParams();
    if(search.trim())p.set('vehicle',search.trim());
    if(statusFilter)p.set('status',statusFilter);
    const r=await api.get('/tire/service-requests'+(p.toString()?'?'+p.toString():''));
    setRows(r.data.requests||[]);
  }catch(e){setError(e.response?.data?.error||e.message);}};

  useEffect(()=>{loadVehicles();if(!driverMode)loadRequests();},[]);
  useEffect(()=>{if(driverMode&&vehicles.length===1)setVehicleId(String(vehicles[0].id));},[driverMode,vehicles]);
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
    if(form.requestType==='TIRE_ROTATION'){
      if(!form.fromPosition||!form.toPosition)return setError('Select both the current and new tire positions.');
      if(form.fromPosition===form.toPosition)return setError('The rotation source and target positions must be different.');
    }else{
      if(!form.position)return setError('Select the tire installation position.');
      if(!form.tireSerial.trim())return setError('Enter the tire serial number.');
      if(!form.tireDate)return setError('Enter the tire date.');
      if(!form.tireSize.trim())return setError('Enter the tire size.');
      if(form.pressurePsi===''||Number(form.pressurePsi)<0)return setError('Enter the tire air pressure.');
      if(['DAMAGED_TIRE_REPLACEMENT','PUNCTURE_REPAIR'].includes(form.requestType)&&!form.photo)return setError('A photo of the tire is required.');
      if(form.requestType==='PUNCTURE_REPAIR'&&!form.position)return setError('Select the punctured tire position.');
    }
    setLoading(true);
    try{
      await api.post('/tire/vehicle/'+vehicleId+'/service-request',form);
      setForm({
        requestType:'TIRE_ROTATION',
        position:'',
        fromPosition:'',
        toPosition:'',
        tireSerial:'',
        tireDate:'',
        tireSize:'',
        pressurePsi:'',
        notes:'',
        photo:''
      });
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
      <select value={vehicleId} onChange={e=>setVehicleId(e.target.value)} style={{maxWidth:500}} disabled={vehiclesLoading||vehicles.length===0}>
        <option value="">{vehiclesLoading?'Loading vehicle numbers...':'-- Select vehicle --'}</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate || [v.plate_number,v.plate_code].filter(Boolean).join(' ') || ('Vehicle ID '+v.id)}</option>)}
      </select>
      {vehiclesLoading&&<div style={{marginTop:8,color:'#64748b'}}>Loading vehicle numbers… / جارٍ تحميل أرقام السيارات…</div>}
      {!vehiclesLoading&&!vehiclesLoadError&&vehicles.length===0&&<div className="alert alert-warning" style={{marginTop:8}}>No vehicles were returned for this Driver account. / لم يتم العثور على سيارات لهذا الحساب.</div>}
      {selectedVehicle&&<div style={{marginTop:8,padding:12,border:'1px solid #e2e8f0',borderRadius:8,background:'#f8fafc',fontSize:13}}>
        <strong>Assigned Vehicle / السيارة المعيّنة:</strong> {selectedVehicle.plate || [selectedVehicle.plate_number,selectedVehicle.plate_code].filter(Boolean).join(' ') || ('Vehicle ID '+selectedVehicle.id)}
        {selectedVehicle.driver?' — Driver: '+selectedVehicle.driver:''}
        {selectedVehicle.location?' — Site: '+selectedVehicle.location:''}
      </div>}
      <div style={{marginTop:12}}>
        <label>Request Type</label>
        <select value={form.requestType} onChange={e=>setForm({...form,requestType:e.target.value})}>
          {REQUEST_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {form.requestType==='TIRE_ROTATION'&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:8,marginTop:12}}>
        <div><label>From Position</label><select value={form.fromPosition} onChange={e=>setForm({...form,fromPosition:e.target.value})}><option value="">-- Select current position --</option>{POSITIONS.map(p=><option key={p}>{p}</option>)}</select></div>
        <div><label>To Position</label><select value={form.toPosition} onChange={e=>setForm({...form,toPosition:e.target.value})}><option value="">-- Select new position --</option>{POSITIONS.map(p=><option key={p}>{p}</option>)}</select></div>
      </div>}

      {['NEW_TIRE_INSTALLATION','DAMAGED_TIRE_REPLACEMENT'].includes(form.requestType)&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:8,marginTop:12}}>
        <div><label>Installation Position</label><select value={form.position} onChange={e=>setForm({...form,position:e.target.value})}><option value="">-- Select position --</option>{POSITIONS.map(p=><option key={p}>{p}</option>)}</select></div>
        <div><label>Tire Serial Number</label><input value={form.tireSerial} onChange={e=>setForm({...form,tireSerial:e.target.value})} placeholder="Serial number"/></div>
        <div><label>Tire Date</label><input type="date" value={form.tireDate} onChange={e=>setForm({...form,tireDate:e.target.value})}/></div>
        <div><label>Tire Size</label><input value={form.tireSize} onChange={e=>setForm({...form,tireSize:e.target.value})} placeholder="e.g. 265/65R17"/></div>
        <div><label>Air Pressure (PSI)</label><input type="number" min="0" step="0.1" value={form.pressurePsi} onChange={e=>setForm({...form,pressurePsi:e.target.value})} placeholder="PSI"/></div>
      </div>}

      {['DAMAGED_TIRE_REPLACEMENT','PUNCTURE_REPAIR'].includes(form.requestType)&&<>
        {form.requestType==='PUNCTURE_REPAIR'&&<div style={{marginTop:12}}><label>Repair Position</label><select value={form.position} onChange={e=>setForm({...form,position:e.target.value})}><option value="">-- Select punctured tire position --</option>{POSITIONS.map(p=><option key={p}>{p}</option>)}</select></div>}
        <label style={{display:'block',marginTop:12,fontWeight:600}}>📷 Tire Photo (required)</label>
        <input type="file" accept="image/*" capture="environment" onChange={e=>choosePhoto(e.target.files?.[0])}/>
        {form.photo&&<img src={form.photo} alt="Damaged tire" style={{width:'100%',maxWidth:420,height:180,objectFit:'cover',borderRadius:8,marginTop:8}}/>}
      </>}

      {form.requestType!=='TIRE_ROTATION'&&<textarea placeholder="Notes (optional)" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={{marginTop:12,minHeight:100}}/>}
      <button className="btn btn-primary" disabled={loading} onClick={submit} style={{marginTop:10}}>{loading?'Submitting...':'Submit Tire Service Request'}</button>
    </div>
  </div>;

  const filteredRows=useMemo(()=>rows.filter(r=>!search.trim()||String(r.plate||'').toLowerCase().includes(search.trim().toLowerCase())),[rows,search]);
  return <div className="hub-page">
    <div className="panel">
      <h1 style={{margin:0}}>🛞 Tire Service Requests</h1><p style={{color:'#64748b'}}>Track driver tire-service requests by vehicle number and status.</p>
      {error&&<div className="alert alert-error">{error}</div>}
      <div style={{display:'grid',gridTemplateColumns:'minmax(260px,1fr) 220px auto',gap:8,alignItems:'end',marginTop:12}}>
        <div><label>Vehicle</label><select value={search} onChange={e=>setSearch(e.target.value)}><option value="">All Vehicles</option>{vehicles.map(v=><option key={v.id} value={v.plate}>{v.plate}</option>)}</select></div>
        <div><label>Status</label><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All Statuses</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
        <button className="btn btn-secondary" onClick={loadRequests}>Refresh</button>
      </div>
    </div>
    <div className="panel" style={{marginTop:12}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:10}}><h2 style={{margin:0}}>Request Log</h2><strong>Total: {filteredRows.length}</strong></div>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Date</th><th>Vehicle</th><th>Request</th><th>Position</th><th>Serial</th><th>Tire Date</th><th>Size</th><th>PSI</th><th>Driver / User</th><th>Notes</th><th>Status</th></tr></thead>
      <tbody>{filteredRows.length===0?<tr><td colSpan="11" style={{textAlign:'center',padding:24,color:'#64748b'}}>No tire service requests found.</td></tr>:filteredRows.map(r=><tr key={r.id}>
        <td>{r.created_at?new Date(r.created_at).toLocaleString():'-'}</td><td><strong>{r.plate||r.vehicle_id}</strong></td>
        <td>{REQUEST_TYPES.find(x=>x[0]===r.request_type)?.[1]||r.request_type}</td>
        <td>{r.request_type==='TIRE_ROTATION'?(r.from_position&&r.to_position?r.from_position+' → '+r.to_position:(r.position||'-')):(r.position||'-')}</td>
        <td>{r.tire_serial||'-'}</td><td>{r.tire_date||'-'}</td><td>{r.tire_size||'-'}</td><td>{r.pressure_psi??'-'}</td>
        <td>{r.created_by_name||r.driver||r.created_by||'-'}</td>
        <td style={{minWidth:240}}>{r.notes||'-'}{r.photo&&<div><a href={r.photo} target="_blank" rel="noreferrer">View Photo</a></div>}</td>
        <td><select value={r.status||'PENDING'} onChange={e=>updateStatus(r.id,e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></td>
      </tr>)}</tbody></table></div>
    </div>
  </div>;
}

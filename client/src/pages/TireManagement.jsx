import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const POSITIONS = ['Front Left','Front Right','Rear Left','Rear Right','Spare','Sixth'];
const EVENT_TYPES = ['PUNCTURE','REPLACEMENT','SPARE','ROTATION','INSPECTION','OTHER'];

const emptyTire = (position) => ({
  position, manufacturerSerial:'', brand:'', model:'', size:'',
  treadDepthMm:'', pressurePsi:'', notes:'', photo:''
});

function readPhoto(file) {
  return new Promise((resolve,reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',0.72));
      };
      img.onerror = reject;
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

function statusFor(t) {
  const s = String(t?.condition_status || t?.status || '').toLowerCase();
  if (['red','yellow','green'].includes(s)) return s;
  const tread = Number(t?.tread_depth_mm ?? t?.treadDepthMm);
  if (Number.isFinite(tread)) return tread <= 2 ? 'red' : tread <= 4 ? 'yellow' : 'green';
  return 'green';
}

function Badge({status}) {
  const s = statusFor({status});
  return <span style={{
    display:'inline-block',padding:'4px 9px',borderRadius:999,fontWeight:700,fontSize:12,
    background:s==='red'?'#fee2e2':s==='yellow'?'#fef3c7':'#dcfce7',
    color:s==='red'?'#b91c1c':s==='yellow'?'#a16207':'#166534'
  }}>{s.toUpperCase()}</span>;
}

export default function TireManagement({ user, driverMode=false }) {
  const [vehicles,setVehicles] = useState([]);
  const [vehicleId,setVehicleId] = useState('');
  const [data,setData] = useState(null);
  const [tires,setTires] = useState(POSITIONS.map(emptyTire));
  const [photos,setPhotos] = useState({});
  const [notes,setNotes] = useState('');
  const [event,setEvent] = useState({eventType:'PUNCTURE',tireAssetId:'',position:'',oldTireId:'',newTireId:'',manufacturerSerial:'',notes:''});
  const [serviceRequest,setServiceRequest] = useState({requestType:'TIRE_SHOP_VISIT',position:'',notes:'',photo:''});
  const [loading,setLoading] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');

  const loadVehicles = async () => {
    const r = await api.get('/tire/control');
    setVehicles(r.data.vehicles || []);
  };
  const load = async (id=vehicleId) => {
    if (!id) return;
    const r = await api.get('/tire/vehicle/'+id);
    setData(r.data);
  };
  useEffect(()=>{ loadVehicles().catch(e=>setError(e.response?.data?.error||e.message)); },[]);
  useEffect(()=>{ if(vehicleId) load().catch(e=>setError(e.response?.data?.error||e.message)); },[vehicleId]);

  const locked = data?.survey?.status === 'LOCKED';
  const vehicle = vehicles.find(v=>String(v.id)===String(vehicleId));

  const choosePhoto = async (position,file) => {
    if (!file) return;
    const value = await readPhoto(file);
    setPhotos(p=>({...p,[position]:value}));
    setTires(ts=>ts.map(t=>t.position===position?{...t,photo:value}:t));
  };

  const updateTire = (position,key,value) => setTires(ts=>ts.map(t=>t.position===position?{...t,[key]:value}:t));

  const submitSurvey = async () => {
    setMessage(''); setError('');
    if (!vehicleId) return setError('Select a vehicle first.');
    if (Object.keys(photos).length !== 6) return setError('All 6 tire photos are required.');
    setLoading(true);
    try {
      const payloadTires=tires.map(t=>({...t,
        treadDepthMm:t.treadDepthMm===''?null:Number(t.treadDepthMm),
        pressurePsi:t.pressurePsi===''?null:Number(t.pressurePsi)
      }));
      const r=await api.post('/tire/vehicle/'+vehicleId+'/initial-survey',{tires:payloadTires,photos,notes});
      setData(r.data);
      setMessage('Initial Tire Survey completed and locked successfully.');
    } catch(e) { setError(e.response?.data?.error||e.message); }
    finally { setLoading(false); }
  };

  const reopen = async () => {
    if(!confirm('Reopen Initial Tire Survey? This is an Owner-only management action.')) return;
    try {
      await api.post('/tire/vehicle/'+vehicleId+'/reopen');
      await load();
      setMessage('Survey reopened for controlled correction.');
    } catch(e){setError(e.response?.data?.error||e.message);}
  };

  const submitServiceRequest = async () => {
    try {
      if (!vehicleId) return setError('Select a vehicle first.');
      if (!serviceRequest.notes.trim()) return setError('Please describe the tire issue or required service.');
      await api.post('/tire/vehicle/'+vehicleId+'/service-request', serviceRequest);
      setServiceRequest({requestType:'TIRE_SHOP_VISIT',position:'',notes:'',photo:''});
      await load();
      setMessage('Tire service request submitted. Management will review it before any tire replacement.');
    } catch(e) {
      setError(e.response?.data?.error||e.message);
    }
  };

  const saveEvent = async () => {
    try {
      await api.post('/tire/vehicle/'+vehicleId+'/event',event);
      setEvent({eventType:'PUNCTURE',tireAssetId:'',position:'',oldTireId:'',newTireId:'',manufacturerSerial:'',notes:''});
      await load();
      setMessage('Tire event recorded.');
    } catch(e){setError(e.response?.data?.error||e.message);}
  };

  return <div className="hub-page">
    <div className="panel" style={{marginBottom:16}}>
      <h1 style={{margin:0}}>🛞 {driverMode ? 'Vehicle Tire Inspection' : 'Tire Management'}</h1>
      <p style={{margin:'6px 0 0',color:'#64748b'}}>
        {driverMode ? 'Complete the initial 6-tire inspection with photos. Once submitted, this vehicle is locked.' :
        'Initial survey, tire identity, serial tracking, events and vehicle tire control.'}
      </p>
    </div>

    <div className="panel" style={{marginBottom:16}}>
      <label>Vehicle</label>
      <select value={vehicleId} onChange={e=>setVehicleId(e.target.value)} style={{maxWidth:500}}>
        <option value="">-- Select vehicle --</option>
        {vehicles.map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}
      </select>
      {vehicle && data?.survey && <div style={{marginTop:10}}>
        <strong>Initial Survey:</strong> <Badge status={data.survey.status==='LOCKED'?'green':'yellow'} />
        {data.survey.submitted_at && <span style={{marginLeft:8,color:'#64748b'}}>Submitted {new Date(data.survey.submitted_at).toLocaleString()}</span>}
      </div>}
    </div>

    {message && <div className="alert alert-success">{message}</div>}
    {error && <div className="alert alert-error">{error}</div>}

    <div className="panel" style={{marginTop:16}}>
      <h2>📋 Initial Tire Survey Records</h2>
      <p style={{color:'#64748b'}}>Every submitted tire survey is stored by vehicle, with its six inspection photos retained in the survey record.</p>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr><th style={{textAlign:'left',padding:8}}>Vehicle</th><th style={{textAlign:'left',padding:8}}>Survey Status</th><th style={{textAlign:'left',padding:8}}>Submitted</th><th style={{textAlign:'left',padding:8}}>Photos</th><th style={{textAlign:'left',padding:8}}>Action</th></tr></thead>
          <tbody>
            {vehicles.filter(v=>v.survey_status||v.submitted_at).map(v=><tr key={v.id}>
              <td style={{padding:8,fontWeight:700}}>{v.plate}</td>
              <td style={{padding:8}}><Badge status={v.survey_status==='SUBMITTED'?'green':(v.survey_status||'yellow')}/></td>
              <td style={{padding:8}}>{v.submitted_at ? new Date(v.submitted_at).toLocaleString() : '-'}</td>
              <td style={{padding:8}}>6 photos stored</td>
              <td style={{padding:8}}><button type="button" className="btn btn-primary" onClick={()=>setVehicleId(String(v.id))}>Open Survey</button></td>
            </tr>)}
            {!vehicles.some(v=>v.survey_status||v.submitted_at) && <tr><td colSpan="5" style={{padding:12,color:'#64748b'}}>No submitted tire surveys found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    {vehicleId && !locked && <div className="panel">
      <h2>Initial Tire Survey — 6 Tires</h2>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(330px,1fr))',gap:16}}>
        {tires.map(t=><div key={t.position} style={{border:'1px solid #e2e8f0',borderRadius:12,padding:14}}>
          <h3 style={{marginTop:0}}>{t.position}</h3>
          <input placeholder="Manufacturer Serial" value={t.manufacturerSerial} onChange={e=>updateTire(t.position,'manufacturerSerial',e.target.value)} />
          <input placeholder="Brand" value={t.brand} onChange={e=>updateTire(t.position,'brand',e.target.value)} />
          <input placeholder="Model" value={t.model} onChange={e=>updateTire(t.position,'model',e.target.value)} />
          <input placeholder="Size" value={t.size} onChange={e=>updateTire(t.position,'size',e.target.value)} />
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <input type="number" step="0.1" placeholder="Tread mm" value={t.treadDepthMm} onChange={e=>updateTire(t.position,'treadDepthMm',e.target.value)} />
            <input type="number" step="0.1" placeholder="Pressure PSI" value={t.pressurePsi} onChange={e=>updateTire(t.position,'pressurePsi',e.target.value)} />
          </div>
          <input placeholder="Condition / notes" value={t.notes} onChange={e=>updateTire(t.position,'notes',e.target.value)} />
          <label style={{display:'block',marginTop:8,fontWeight:600}}>📷 Tire photo</label>
          <input type="file" accept="image/*" capture="environment" onChange={e=>choosePhoto(t.position,e.target.files?.[0])} />
          {photos[t.position] && <img src={photos[t.position]} alt={t.position} style={{width:'100%',height:150,objectFit:'cover',borderRadius:8,marginTop:8}} />}
        </div>)}
      </div>
      <textarea placeholder="Survey notes" value={notes} onChange={e=>setNotes(e.target.value)} style={{marginTop:16,minHeight:80}} />
      <button className="btn btn-success" disabled={loading} onClick={submitSurvey} style={{marginTop:12}}>
        {loading?'Saving...':'Submit 6-Tire Survey & Lock'}
      </button>
    </div>}

    {vehicleId && locked && driverMode && <div className="panel">
      <div className="alert alert-warning" style={{margin:0}}>
        🔒 <strong>System Locked</strong><br/>
        Initial Tire Survey for this vehicle has already been completed. No further tire inspection entry is available for the driver.
      </div>
    </div>}

    {vehicleId && locked && !driverMode && <div className="panel">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div>
          <h2 style={{margin:0}}>🔒 Initial Tire Survey Locked</h2>
          <p style={{color:'#64748b'}}>The initial survey cannot be edited after submission.</p>
        </div>
        {user?.role==='Owner' && <button className="btn btn-warning" onClick={reopen}>Reopen Survey</button>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:12,marginTop:14}}>
        {(data?.tires||[]).map(t=><div key={t.id} style={{border:'1px solid #e2e8f0',borderRadius:10,padding:12}}>
          <strong>{t.position}</strong> <Badge status={t.condition_status}/>
          <div style={{fontSize:13,marginTop:8}}>Tire ID: <strong>{t.tire_id}</strong></div>
          <div style={{fontSize:13}}>Serial: {t.manufacturer_serial||'-'}</div>
          <div style={{fontSize:13}}>Tread: {t.tread_depth_mm ?? '-'} mm</div>
          <div style={{fontSize:13}}>Pressure: {t.pressure_psi ?? '-'} PSI</div>
        </div>)}
      </div>
    </div>}

    {vehicleId && locked && driverMode && <div className="panel" style={{marginTop:16}}>
      <h2>🛠️ Tire Service Request</h2>
      <p style={{color:'#64748b',marginTop:4}}>
        Use this request if the vehicle is going to the tire shop, a tire has a puncture, or a tire must be replaced because of damage.
        This does not change the tire record automatically; management reviews the request first.
      </p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:8}}>
        <select value={serviceRequest.requestType} onChange={e=>setServiceRequest({...serviceRequest,requestType:e.target.value})}>
          <option value="TIRE_SHOP_VISIT">Tire Shop Visit</option>
          <option value="TIRE_REPLACEMENT_DAMAGE">Tire Replacement — Damage</option>
          <option value="PUNCTURE_REPAIR">Puncture / Repair</option>
          <option value="OTHER">Other Tire Service</option>
        </select>
        <select value={serviceRequest.position} onChange={e=>setServiceRequest({...serviceRequest,position:e.target.value})}>
          <option value="">Tire Position</option>
          {POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <textarea
        placeholder="Describe the tire problem / required service"
        value={serviceRequest.notes}
        onChange={e=>setServiceRequest({...serviceRequest,notes:e.target.value})}
        style={{marginTop:8,minHeight:90}}
      />
      <label style={{display:'block',marginTop:8,fontWeight:600}}>📷 Damage / Tire Photo (optional)</label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={async e=>{
          const file=e.target.files?.[0];
          if(!file) return;
          try {
            const photo=await readPhoto(file);
            setServiceRequest({...serviceRequest,photo});
          } catch(err) {
            setError('Could not read the tire photo.');
          }
        }}
      />
      {serviceRequest.photo && <img src={serviceRequest.photo} alt="Tire service request" style={{width:'100%',maxWidth:420,height:180,objectFit:'cover',borderRadius:8,marginTop:8}} />}
      <button className="btn btn-primary" onClick={submitServiceRequest} style={{marginTop:10}}>Submit Tire Service Request</button>
    </div>}

    {vehicleId && !driverMode && (data?.serviceRequests||[]).length > 0 && <div className="panel" style={{marginTop:16}}>
      <h2>🛠️ Tire Service Requests</h2>
      <table>
        <thead><tr><th>Date</th><th>Request</th><th>Position</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>
          {(data?.serviceRequests||[]).map(r=><tr key={r.id}>
            <td>{new Date(r.created_at).toLocaleString()}</td>
            <td>{r.request_type}</td>
            <td>{r.position||'-'}</td>
            <td>{r.status}</td>
            <td>{r.notes||'-'}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {vehicleId && locked && !driverMode && <div className="panel" style={{marginTop:16}}>
      <h2>🔧 Tire Event</h2>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8}}>
        <select value={event.eventType} onChange={e=>setEvent({...event,eventType:e.target.value})}>{EVENT_TYPES.map(x=><option key={x}>{x}</option>)}</select>
        <select value={event.tireAssetId} onChange={e=>setEvent({...event,tireAssetId:e.target.value})}>
          <option value="">Tire</option>{(data?.tires||[]).map(t=><option key={t.id} value={t.id}>{t.position} — {t.tire_id}</option>)}
        </select>
        <input placeholder="Position" value={event.position} onChange={e=>setEvent({...event,position:e.target.value})}/>
        <input placeholder="Old Tire ID" value={event.oldTireId} onChange={e=>setEvent({...event,oldTireId:e.target.value})}/>
        <input placeholder="New Tire ID" value={event.newTireId} onChange={e=>setEvent({...event,newTireId:e.target.value})}/>
        <input placeholder="Manufacturer Serial" value={event.manufacturerSerial} onChange={e=>setEvent({...event,manufacturerSerial:e.target.value})}/>
      </div>
      <textarea placeholder="Event notes" value={event.notes} onChange={e=>setEvent({...event,notes:e.target.value})} style={{marginTop:8}}/>
      <button className="btn btn-primary" onClick={saveEvent} style={{marginTop:8}}>Save Tire Event</button>
      <h3 style={{marginTop:20}}>History</h3>
      <table><thead><tr><th>Date</th><th>Event</th><th>Position</th><th>Old</th><th>New</th><th>Notes</th></tr></thead>
      <tbody>{(data?.events||[]).map(e=><tr key={e.id}><td>{new Date(e.event_date).toLocaleString()}</td><td>{e.event_type}</td><td>{e.position||'-'}</td><td>{e.old_tire_id||'-'}</td><td>{e.new_tire_id||'-'}</td><td>{e.notes||'-'}</td></tr>)}</tbody></table>
    </div>}
  </div>;
}

export function TireControlCenter() {
  const [rows,setRows]=useState([]);
  const [error,setError]=useState('');
  const load=async()=>{try{const r=await api.get('/tire/control');setRows((r.data.vehicles||[]).filter(v => !/^test\b/i.test(String(v.plate || v.plate_number || '').trim())));}catch(e){setError(e.response?.data?.error||e.message);}};
  useEffect(()=>{load();},[]);
  const sortedRows=useMemo(() => [...rows].sort((a,b) => {
    const rank = {red:0, yellow:1, green:2};
    return (rank[a.overallStatus || 'green'] ?? 2) - (rank[b.overallStatus || 'green'] ?? 2)
      || String(a.plate || '').localeCompare(String(b.plate || ''));
  }), [rows]);
  const totals=useMemo(()=>rows.reduce((a,r)=>({
    red:a.red+(String(r.overallStatus||'').toLowerCase()==='red'?1:0),
    yellow:a.yellow+(String(r.overallStatus||'').toLowerCase()==='yellow'?1:0),
    green:a.green+(String(r.overallStatus||'').toLowerCase()==='green'?1:0)
  }),{red:0,yellow:0,green:0}),[rows]);
  const worst=(r)=>r.overallStatus||'green';
  const Compliance=({label,status,reason})=><div style={{padding:'10px',borderRadius:9,background:status==='red'?'#fee2e2':status==='yellow'?'#fef3c7':'#dcfce7'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
      <span style={{fontWeight:700}}>{label}</span><Badge status={status}/>
    </div>
    <div style={{fontSize:12,marginTop:5,color:'#475569'}}>{reason||'No details'}</div>
  </div>;
  return <div className="hub-page">
    <div className="panel">
      <h1 style={{margin:0}}>🛞 Vehicle Compliance Control Center</h1>
      <p style={{color:'#64748b',marginBottom:12}}>One card per vehicle: Tires + Oil + 6-Month Maintenance + Annual Inspection.</p>
      {error&&<div className="alert alert-error">{error}</div>}
      <div style={{display:'flex',gap:12,flexWrap:'wrap',fontWeight:700}}>
        <span><Badge status="red"/> {totals.red}</span><span><Badge status="yellow"/> {totals.yellow}</span><span><Badge status="green"/> {totals.green}</span><span style={{padding:'4px 9px',borderRadius:999,background:'#f1f5f9'}}>TOTAL {rows.length}</span>
      </div>
    </div>
    {sortedRows.map(r=><div className="panel" key={r.id} style={{marginTop:12,borderLeft:'7px solid '+(worst(r)==='red'?'#dc2626':worst(r)==='yellow'?'#eab308':'#16a34a')}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
        <div><h2 style={{margin:0,fontSize:24}}>{r.plate}</h2><div style={{color:'#64748b',fontSize:12}}>Vehicle ID: {r.id}</div></div>
        <Badge status={worst(r)}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:9,marginTop:14}}>
        <Compliance label="🛞 Tires" status={r.tireStatus} reason={r.tireReason}/>
        <Compliance
          label="🛢️ Oil"
          status={r.oilStatus}
          reason={
            r.oilReason === 'No Data'
              ? 'No Daily KM submitted today'
              : `${r.oilReason} • Current KM: ${Number(r.current_km || 0).toLocaleString()} • Last Oil KM: ${Number(r.last_oil_km || 0).toLocaleString()} • Driven: ${r.drivenSinceOil == null ? '-' : Number(r.drivenSinceOil).toLocaleString()} km • Remaining: ${r.oilRemaining == null ? '-' : Number(r.oilRemaining).toLocaleString()} km • Progress: ${Number(r.oilProgress || 0).toFixed(0)}%`
          }
        />
        <Compliance label="🔧 6-Month Maintenance" status={r.maintenanceStatus} reason={r.maintenanceReason}/>
        <Compliance label="📋 Annual Inspection" status={r.inspectionStatus} reason={r.inspectionReason}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginTop:12}}>
        {(r.tires||[]).map(t=><div key={t.id} style={{border:'1px solid #e2e8f0',padding:9,borderRadius:8}}><strong>{t.position}</strong><div style={{fontSize:12}}>{t.tireId}</div><div style={{fontSize:12}}>{t.serial||'No serial'}</div><div style={{marginTop:4}}><Badge status={t.status}/></div></div>)}
      </div>
    </div>)}
  </div>;
}

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
    r.onload = () => resolve(r.result);
    r.onerror = reject;
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
  const [loading,setLoading] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');

  const loadVehicles = async () => {
    const r = await api.get('/vehicles/list');
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
        {vehicles.map(v=><option key={v.id} value={v.id}>{v.plate}{v.driver?' - '+v.driver:''}</option>)}
      </select>
      {vehicle && data?.survey && <div style={{marginTop:10}}>
        <strong>Initial Survey:</strong> <Badge status={data.survey.status==='LOCKED'?'green':'yellow'} />
        {data.survey.submitted_at && <span style={{marginLeft:8,color:'#64748b'}}>Submitted {new Date(data.survey.submitted_at).toLocaleString()}</span>}
      </div>}
    </div>

    {message && <div className="alert alert-success">{message}</div>}
    {error && <div className="alert alert-error">{error}</div>}

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
    </div>

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
  const load=async()=>{try{const r=await api.get('/tire/control');setRows(r.data.vehicles||[]);}catch(e){setError(e.response?.data?.error||e.message);}};
  useEffect(()=>{load();},[]);
  const totals=useMemo(()=>rows.reduce((a,r)=>({red:a.red+r.red,yellow:a.yellow+r.yellow,green:a.green+r.green}),{red:0,yellow:0,green:0}),[rows]);
  return <div className="hub-page">
    <div className="panel"><h1 style={{margin:0}}>🛞 Tire Control Center</h1><p style={{color:'#64748b'}}>Red → Yellow → Green priority.</p>
      {error&&<div className="alert alert-error">{error}</div>}
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <Badge status="red"/> {totals.red}
        <Badge status="yellow"/> {totals.yellow}
        <Badge status="green"/> {totals.green}
      </div>
    </div>
    {rows.sort((a,b)=>b.red-a.red||b.yellow-a.yellow).map(r=><div className="panel" key={r.id} style={{marginTop:12}}>
      <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div><h2 style={{margin:0}}>{r.plate}</h2><div style={{color:'#64748b'}}>{r.driver||'-'} · {r.location||'-'}</div></div>
        <div style={{display:'flex',gap:8}}><Badge status="red"/> {r.red} <Badge status="yellow"/> {r.yellow} <Badge status="green"/> {r.green}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginTop:12}}>
        {(r.tires||[]).map(t=><div key={t.id} style={{border:'1px solid #e2e8f0',padding:10,borderRadius:8}}><strong>{t.position}</strong><div>{t.tireId}</div><div>{t.serial||'No serial'}</div><Badge status={t.status}/></div>)}
      </div>
    </div>)}
  </div>;
}

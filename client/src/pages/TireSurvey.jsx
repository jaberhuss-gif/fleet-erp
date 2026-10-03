import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const POSITIONS = ['FL','FR','RL','RR','S1','S2'];
const LABELS = {FL:'Front Left',FR:'Front Right',RL:'Rear Left',RR:'Rear Right',S1:'Spare 1',S2:'Spare 2'};

async function compressImage(file){
  if(!file) return null;
  const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=URL.createObjectURL(file);});
  const max=900, scale=Math.min(1,max/Math.max(img.width,img.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale);
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  URL.revokeObjectURL(img.src);
  return canvas.toDataURL('image/jpeg',0.68);
}

export default function TireSurvey({ user }){
  const [plate,setPlate]=useState('');
  const [vehicle,setVehicle]=useState(null);
  const [state,setState]=useState(null);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [photos,setPhotos]=useState({});
  const [km,setKm]=useState('');
  const [location,setLocation]=useState('');
  const [event,setEvent]=useState({eventType:'Puncture / Tire Repair',position:'',outcome:'',sparePosition:'',serial_number:'',brand:'',size:'',tire_type:'',dot_code:'',notes:''});
  const [eventPhotos,setEventPhotos]=useState([]);

  const loadVehicle=async()=>{
    setError('');setMessage('');setLoading(true);
    try{
      const r=await api.get('/tire-control/vehicle-by-plate',{params:{plate}});
      setVehicle(r.data.vehicle); setState(r.data.state); setKm(r.data.vehicle?.current_km||''); setLocation(r.data.vehicle?.location||'');
    }catch(e){setVehicle(null);setState(null);setError(e.response?.data?.error||'Vehicle not found');}
    finally{setLoading(false);}
  };

  const setPhoto=async(pos,file)=>{
    try{setPhotos(p=>({...p,[pos]:{loading:true}})); const data=await compressImage(file); setPhotos(p=>({...p,[pos]:data}));}
    catch(e){setError('Could not read image.');setPhotos(p=>{const n={...p};delete n[pos];return n;});}
  };

  const submitInitial=async(e)=>{
    e.preventDefault();setError('');setMessage('');
    if(POSITIONS.some(p=>!photos[p]||photos[p].loading)) return setError('Please capture all 6 tire photos.');
    try{
      setLoading(true);
      await api.post('/tire-surveys/initial',{vehicleId:vehicle.id,km:Number(km)||null,location,photos:POSITIONS.map(p=>({position:p,data:photos[p]})),notes:'Initial 6-tire census'});
      const r=await api.get('/tire-control/vehicle/'+vehicle.id);setState(r.data.state);setMessage('Initial tire survey submitted and locked. Fleet Manager can now register the tire details.');
    }catch(e){setError(e.response?.data?.error||e.message);}
    finally{setLoading(false);}
  };

  const submitEvent=async(e)=>{
    e.preventDefault();setError('');setMessage('');
    if(!event.position||!event.outcome) return setError('Select the tire position and what happened.');
    if((event.outcome==='replaced_with_new'||event.outcome==='replaced_with_another')&&!event.serial_number.trim()) return setError('Enter the new tire manufacturer serial number.');
    if(event.outcome==='replaced_with_spare'&&!event.sparePosition) return setError('Select which spare was used.');
    try{
      setLoading(true);
      await api.post('/tire-surveys/event',{vehicleId:vehicle.id,km:Number(km)||null,location,eventType:event.eventType,position:event.position,outcome:event.outcome,notes:event.notes,photos:eventPhotos,newTire:{serial_number:event.serial_number,brand:event.brand,size:event.size,tire_type:event.tire_type,dot_code:event.dot_code,sparePosition:event.sparePosition}});
      const r=await api.get('/tire-control/vehicle/'+vehicle.id);setState(r.data.state);setMessage('Tire event recorded successfully.');setEvent({eventType:'Puncture / Tire Repair',position:'',outcome:'',sparePosition:'',serial_number:'',brand:'',size:'',tire_type:'',dot_code:'',notes:''});setEventPhotos([]);
    }catch(e){setError(e.response?.data?.error||e.message);}
    finally{setLoading(false);}
  };

  const chooseEventPhotos=async(files)=>{const a=[];for(const f of Array.from(files).slice(0,3)) a.push(await compressImage(f));setEventPhotos(a);};

  const initialLocked=!!state?.initial?.done;
  const eventOutcomes=useMemo(()=>event.eventType==='Puncture / Tire Repair'
    ? [['repaired_same_position','Repaired and returned to same position'],['replaced_with_spare','Replaced with spare'],['replaced_with_new','Replaced with new tire']]
    : event.eventType==='Tire Replacement'
      ? [['replaced_with_new','Replaced with new tire'],['replaced_with_spare','Replaced with spare'],['replaced_with_another','Replaced with another registered/new tire']]
      : [['replaced_with_new','Installed another tire'],['replaced_with_spare','Swapped with spare']], [event.eventType]);

  return <div className="panel">
    <h2>🛞 Tire Survey</h2>
    <p style={{color:'#64748b'}}>Initial survey is one-time and locks after submission. After that, report only tire events.</p>
    <div className="form-group"><label>Vehicle Plate / Number</label><div style={{display:'flex',gap:8}}><input value={plate} onChange={e=>setPlate(e.target.value)} placeholder="e.g. 1738" onKeyDown={e=>e.key==='Enter'&&loadVehicle()}/><button className="btn btn-primary" onClick={loadVehicle} disabled={loading}>Load Vehicle</button></div></div>

    {error&&<div className="alert alert-error">{error}</div>}{message&&<div className="alert alert-success">{message}</div>}
    {vehicle&&state&&<div>
      <div className="vehicle-info" style={{marginBottom:16}}>
        <div className="vehicle-info-row"><span>Vehicle</span><strong>{state.vehicle.plate_number} {state.vehicle.plate_code||''}</strong></div>
        <div className="vehicle-info-row"><span>Location</span><span>{state.vehicle.location||'-'}</span></div>
        <div className="vehicle-info-row"><span>Current KM</span><span>{Number(state.vehicle.current_km||0).toLocaleString()}</span></div>
        <div className="vehicle-info-row"><span>Initial Survey</span><span className={initialLocked?'status-badge status-safe':'status-badge status-warning'}>{initialLocked?'🔒 LOCKED':'REQUIRED'}</span></div>
      </div>

      {!initialLocked ? <form onSubmit={submitInitial}>
        <h3>Initial 6-Tire Census</h3><p style={{color:'#64748b'}}>Take one clear photo of each tire. The Fleet Manager will enter the tire details afterward.</p>
        <div className="cards-grid">{POSITIONS.map(p=><div key={p} className="card">
          <h3>{p} — {LABELS[p]}</h3>
          <input type="file" accept="image/*" capture="environment" onChange={e=>setPhoto(p,e.target.files?.[0])} required/>
          {photos[p]&&<img src={photos[p].data||photos[p]} alt={p} style={{width:'100%',marginTop:8,borderRadius:8,maxHeight:180,objectFit:'cover'}}/>}
        </div>)}</div>
        <div className="cards-grid" style={{marginTop:12}}><div className="form-group"><label>Current KM</label><input type="number" value={km} onChange={e=>setKm(e.target.value)}/></div><div className="form-group"><label>Location</label><input value={location} onChange={e=>setLocation(e.target.value)}/></div></div>
        <button className="btn btn-success" disabled={loading}>Submit Initial Survey & Lock</button>
      </form> : <div>
        <div className="alert alert-info">🔒 Initial Tire Survey is locked. If a tire is repaired, replaced, rotated or moved, use the event survey below.</div>
        <h3>Report Tire Event</h3>
        <form onSubmit={submitEvent}>
          <div className="cards-grid">
            <div className="form-group"><label>Event</label><select value={event.eventType} onChange={e=>setEvent({...event,eventType:e.target.value})}><option>Puncture / Tire Repair</option><option>Tire Replacement</option><option>Tire Rotation</option><option>Tire Damage</option></select></div>
            <div className="form-group"><label>Which Tire?</label><select value={event.position} onChange={e=>setEvent({...event,position:e.target.value})}><option value="">-- Select --</option>{POSITIONS.map(p=><option key={p} value={p}>{p} — {LABELS[p]}</option>)}</select></div>
            <div className="form-group"><label>What happened?</label><select value={event.outcome} onChange={e=>setEvent({...event,outcome:e.target.value})}><option value="">-- Select --</option>{eventOutcomes.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          {event.outcome==='replaced_with_spare'&&<div className="form-group"><label>Which Spare?</label><select value={event.sparePosition} onChange={e=>setEvent({...event,sparePosition:e.target.value})}><option value="">-- Select --</option><option value="S1">Spare 1</option><option value="S2">Spare 2</option></select></div>}
          {(event.outcome==='replaced_with_new'||event.outcome==='replaced_with_another')&&<div className="cards-grid">
            <div className="form-group"><label>New Tire Manufacturer Serial *</label><input value={event.serial_number} onChange={e=>setEvent({...event,serial_number:e.target.value})}/></div>
            <div className="form-group"><label>Brand</label><input value={event.brand} onChange={e=>setEvent({...event,brand:e.target.value})}/></div>
            <div className="form-group"><label>Size</label><input value={event.size} onChange={e=>setEvent({...event,size:e.target.value})}/></div>
            <div className="form-group"><label>DOT</label><input value={event.dot_code} onChange={e=>setEvent({...event,dot_code:e.target.value})}/></div>
          </div>}
          <div className="form-group"><label>Photos (up to 3)</label><input type="file" accept="image/*" multiple capture="environment" onChange={e=>chooseEventPhotos(e.target.files)}/></div>
          <div className="form-group"><label>Notes</label><textarea value={event.notes} onChange={e=>setEvent({...event,notes:e.target.value})} rows={2}/></div>
          <button className="btn btn-success" disabled={loading}>Submit Tire Event</button>
        </form>
        {state.events?.length>0&&<div style={{marginTop:20}}><h3>Recent Tire Events</h3><table><thead><tr><th>Date</th><th>Position</th><th>Event</th><th>Outcome</th></tr></thead><tbody>{state.events.map(x=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString()}</td><td>{x.position}</td><td>{x.event_type}</td><td>{x.outcome}</td></tr>)}</tbody></table></div>}
      </div>}
    </div>}
  </div>;
}

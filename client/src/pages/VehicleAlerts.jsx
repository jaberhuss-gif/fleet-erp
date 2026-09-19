import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

export default function VehicleAlerts({ onOpenVehicle }) {
  const [alerts,setAlerts]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState('All');
  const [message,setMessage]=useState('');

  const load=async(refresh=false)=>{
    try{
      setLoading(true);
      const res=await api[refresh?'post':'get'](refresh?'/v2/vehicle-alerts/refresh':'/v2/vehicle-alerts');
      setAlerts(res.data.alerts||[]);
      if(refresh) setMessage('Vehicle alerts refreshed');
    }catch(e){setMessage(e.response?.data?.error||e.message);}
    finally{setLoading(false);}
  };
  useEffect(()=>{load(false)},[]);

  const filtered=useMemo(()=>filter==='All'?alerts:alerts.filter(a=>a.severity===filter),[alerts,filter]);
  const counts=useMemo(()=>({
    Critical:alerts.filter(a=>a.severity==='Critical').length,
    High:alerts.filter(a=>a.severity==='High').length,
    Medium:alerts.filter(a=>a.severity==='Medium').length
  }),[alerts]);

  const close=async(id)=>{
    try{await api.post('/v2/vehicle-alerts/'+id+'/close');setAlerts(v=>v.filter(a=>a.id!==id));}
    catch(e){setMessage(e.response?.data?.error||e.message);}
  };

  const icon={Critical:'🚨',High:'⚠️',Medium:'🔔',Low:'ℹ️'};
  return <div className="alerts-page">
    <div className="panel" style={{background:'linear-gradient(135deg,rgba(220,38,38,.08),rgba(8,145,178,.08)),var(--bg-secondary)'}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
        <div><div style={{fontSize:12,fontWeight:800,letterSpacing:'.12em',color:'#0f766e'}}>FLEET CONTROL CENTER</div>
          <h1 style={{margin:'6px 0 4px'}}>Vehicle Alerts</h1>
          <div style={{color:'var(--text-secondary)'}}>One place for oil, inspection, documents and vehicle availability alerts.</div>
        </div>
        <button className="btn btn-primary" onClick={()=>load(true)}>↻ Refresh Alerts</button>
      </div>
    </div>
    {message&&<div className="alert alert-info">{message}</div>}
    <div className="cards-grid">
      {[
        ['Critical',counts.Critical,'🚨','card danger'],
        ['High',counts.High,'⚠️','card warning'],
        ['Medium',counts.Medium,'🔔','card']
      ].map(([name,n,ic,cls])=><button key={name} className={cls} onClick={()=>setFilter(name)} style={{textAlign:'left',cursor:'pointer',borderTop:filter===name?'3px solid #0f766e':undefined}}>
        <h3>{ic} {name}</h3><div className="big-number">{n}</div><div className="sub">Open alerts</div>
      </button>)}
    </div>
    <div className="panel">
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
        {['All','Critical','High','Medium'].map(x=><button key={x} className={filter===x?'sub-btn active':'sub-btn'} onClick={()=>setFilter(x)}>{x}</button>)}
      </div>
      {loading?<div className="loading">Loading alerts...</div>:filtered.length===0?<div className="alert alert-success">✓ No open alerts in this category.</div>:
      <div style={{display:'grid',gap:10}}>
        {filtered.map(a=><div key={a.id} style={{display:'grid',gridTemplateColumns:'auto 1fr auto',gap:14,alignItems:'center',padding:16,border:'1px solid var(--border-color)',borderRadius:14,background:'var(--bg-secondary)'}}>
          <div style={{fontSize:28}}>{icon[a.severity]||'🔔'}</div>
          <div>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><strong>{a.title}</strong><span className={'status-badge '+(a.severity==='Critical'?'status-urgent':a.severity==='High'?'status-warning':'status-safe')}>{a.severity}</span></div>
            <div style={{marginTop:5,fontWeight:700}}>{a.plate_number} {a.plate_code||''}</div>
            <div style={{marginTop:3,color:'var(--text-secondary)',fontSize:13}}>{a.message}</div>
            <div style={{marginTop:5,color:'var(--text-muted)',fontSize:11}}>{a.site_name||'No site'} · {a.alert_type}</div>
          </div>
          <div style={{display:'flex',gap:7,flexDirection:'column'}}>
            {onOpenVehicle&&<button className="btn btn-primary" onClick={()=>onOpenVehicle(a.vehicle_id)}>Vehicle</button>}
            <button className="btn" onClick={()=>close(a.id)}>Close</button>
          </div>
        </div>)}
      </div>}
    </div>
  </div>;
}

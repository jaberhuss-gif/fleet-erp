import { useEffect,useState } from 'react';
import api from '../api/client';
export default function FleetOverview({onViewVehicle}){
 const [d,setD]=useState(null),[err,setErr]=useState('');
 const load=async()=>{try{setErr('');setD((await api.get('/v2/fleet-dashboard')).data)}catch(e){setErr(e.response?.data?.error||e.message)}};
 useEffect(()=>{load()},[]);
 if(err)return <div className="alert alert-error">{err}</div>;
 if(!d)return <div className="loading">Loading Fleet Command...</div>;
 const v=d.vehicles||{},a=d.alerts||{},km=d.kmCompliance||{},sub=d.dailySubmission||{};
 return <div>
  <div className="panel" style={{background:'linear-gradient(135deg,rgba(15,118,110,.12),rgba(8,145,178,.10)),var(--bg-secondary)'}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
    <div><div style={{fontSize:12,fontWeight:800,letterSpacing:'.12em',color:'#0f766e'}}>FLEET COMMAND</div><h2 style={{margin:'5px 0'}}>Daily Operational Overview</h2><div style={{color:'var(--text-secondary)'}}>Live V2 fleet control · {d.date}</div></div>
    <button className="btn btn-primary" onClick={load}>↻ Refresh</button>
   </div>
  </div>
  <div className="cards-grid">
   <Metric icon="🚙" title="Fleet" value={v.total||0} sub={(v.active||0)+' active · '+(v.unavailable||0)+' unavailable'}/>
   <Metric icon="📏" title="KM Today" value={km.submitted||0} sub="submitted readings"/>
   <Metric icon="📋" title="Daily Submission" value={sub.submitted||0} sub="Google Sheet submissions"/>
   <Metric icon="🔔" title="Open Alerts" value={a.total||0} sub={(a.critical||0)+' critical · '+(a.high||0)+' high'} danger={a.critical>0}/>
   <Metric icon="🔧" title="Open Maintenance" value={d.openMaintenance||0} sub="work orders"/>
   <Metric icon="🎫" title="Open Tickets" value={d.openTickets||0} sub="vehicle tickets"/>
  </div>
  <div className="cards-grid">
   <div className="panel"><h2>Today's Controls</h2><Info label="KM compliance" value={(km.submitted||0)+' / '+(v.active||0)}/><Info label="Daily vehicle submission" value={(sub.submitted||0)+' / '+(v.active||0)}/><Info label="Alert load" value={(a.total||0)+' open'}/></div>
   <div className="panel"><h2>Operational Priorities</h2>{a.critical?<div className="alert alert-error">🚨 Critical vehicle alerts require attention.</div>:<div className="alert alert-success">✓ No critical vehicle alerts.</div>}{a.high?<div className="alert alert-warning">⚠️ {a.high} high-priority fleet alerts are open.</div>:null}</div>
  </div>
 </div>;
}
function Metric({icon,title,value,sub,danger}){return <div className={danger?'card danger':'card'}><h3>{icon} {title}</h3><div className="big-number">{Number(value||0).toLocaleString()}</div><div className="sub">{sub}</div></div>}
function Info({label,value}){return <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid var(--border-color)'}}><span style={{color:'var(--text-secondary)'}}>{label}</span><strong>{value}</strong></div>}

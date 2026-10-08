import { useState, useEffect } from 'react';
import DriverPortal from './DriverPortal';
import Drivers from './Drivers';
import Vehicles from './Vehicles';
import VehicleMaintenance from './VehicleMaintenance';
import PeriodicMaintenance from './PeriodicMaintenance';
import ReportIssue from './ReportIssue';
import TireManagement, { TireControlCenter } from './TireManagement';
import TireServiceRequests from './TireServiceRequests';
import DailyKmSubmitted from './DailyKmSubmitted';
import DailyKmMissing from './DailyKmMissing';
import MaintenanceReport from './MaintenanceReport';
import MaintenanceRequests from './MaintenanceRequests';
import FleetHistory from './FleetHistory';
import VehicleTicket from './VehicleTicket';

export default function FleetHub({ user, access, initialOwnerGroup='maintenance-requests', onViewVehicle }) {
  const fleetView=user?.role==='Owner'||!!access?.fleet?.can_view;
  const fleetWork=user?.role==='Owner'||!!access?.fleet?.can_work;
  const isDriver=user?.role==='Driver';
  const [section,setSection]=useState(isDriver?'daily-km':initialOwnerGroup);
  const [showMaster,setShowMaster]=useState(false);

  useEffect(()=>{ if(user?.role==='Owner') setSection(initialOwnerGroup); },[initialOwnerGroup,user?.role]);

  if(!fleetView)return <div className="alert alert-error">Access denied: Fleet access is not assigned to this user.</div>;

  // DRIVER PORTAL: intentionally unchanged in scope and behavior.
  if(user?.role!=='Owner'){
    const driverActions=[
      {id:'daily-km',label:'📏 Add Daily KM'},
      {id:'issue',label:'🛠️ Maintenance Issue Report'},
      {id:'tire-service',label:'🛞 Tire Service Request'},
      {id:'tire',label:'🛞 Tire Survey'}
    ];
    const safeSection=driverActions.some(x=>x.id===section)?section:'daily-km';
    return <div className="hub-page">
      <div className="panel" style={{marginBottom:16}}><h1 style={{margin:0}}>🚗 Fleet</h1><p style={{margin:'6px 0 0',color:'#64748b'}}>Fleet vehicle and maintenance actions.</p></div>
      <div className="sub-nav" style={{marginBottom:18}}>{driverActions.map(item=><button key={item.id} className={safeSection===item.id?'sub-btn active':'sub-btn'} onClick={()=>setSection(item.id)}>{item.label}</button>)}</div>
      {safeSection==='daily-km'&&<DriverPortal canWork={fleetWork}/>}
      {safeSection==='issue'&&<ReportIssue canWork={fleetWork} user={user}/>}
      {safeSection==='tire-service'&&<TireServiceRequests driverMode={true}/>}
      {safeSection==='tire'&&<TireManagement user={user} driverMode={true}/>}
    </div>;
  }

  if(showMaster) return <div className="hub-page">
    <div className="panel" style={{marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div><h1 style={{margin:0}}>🚙 Vehicle Master</h1><p style={{margin:'6px 0 0',color:'#64748b'}}>Vehicle identity, driver assignment and master data.</p></div>
      <button className="btn btn-secondary" onClick={()=>setShowMaster(false)}>← Back to Vehicle Control</button>
    </div>
    <Vehicles canWork={fleetWork} onViewVehicle={onViewVehicle}/>
  </div>;

  const sections=[
    {id:'maintenance-requests',icon:'🔧',label:'Vehicle Maintenance',title:'Vehicle Maintenance Requests',description:'Open vehicle maintenance requests, assignment and work-order status.'},
    {id:'km',icon:'📏',label:'Daily KM',title:'Daily KM Control',description:'Who entered today’s odometer reading and who is still missing.'},
    {id:'tires',icon:'🛞',label:'Tires',title:'Tire Control',description:'Tire survey, six inspection photos, tire condition and service requests.'},
    {id:'annual',icon:'📅',label:'Annual Inspection',title:'Annual Inspection',description:'Annual vehicle inspection status, due vehicles and overdue inspections.'},
    {id:'six-month',icon:'🔍',label:'6-Month Inspection',title:'6-Month Maintenance',description:'Six-month maintenance status, completed work and overdue vehicles.'},
    {id:'oil',icon:'🛢️',label:'Engine Oil',title:'Engine Oil Control',description:'Current KM, last oil-change KM, KM since oil change and due status.'}
  ];
  const current=sections.find(x=>x.id===section)||sections[0];

  return <div className="hub-page">
    <div className="panel" style={{marginBottom:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div><h1 style={{margin:0}}>🚗 Vehicle Control Center</h1><p style={{margin:'6px 0 0',color:'#64748b'}}>Your six daily vehicle controls — all in one place.</p></div>
        <button className="btn btn-secondary" onClick={()=>setShowMaster(true)}>⚙️ Vehicle Master</button>
      </div>
    </div>
    <div className="cards-grid" style={{marginBottom:18}}>
      {sections.map(item=><button key={item.id} onClick={()=>setSection(item.id)} className={section===item.id?'card active':'card'} style={{textAlign:'left',cursor:'pointer',border:'2px solid '+(section===item.id?'#2563eb':'transparent')}}><h3 style={{fontSize:17}}>{item.icon} {item.label}</h3><div style={{color:'var(--text-secondary)',fontSize:13}}>{item.description}</div></button>)}
    </div>
    <div className="panel" style={{marginBottom:16}}><h2 style={{margin:0}}>{current.title}</h2><p style={{margin:'6px 0 0',color:'#64748b',fontSize:13}}>{current.description}</p></div>

    {section==='maintenance-requests'&&<MaintenanceRequests/>}
    {section==='km'&&<DailyKmControl onMissing={()=>setSection('km-missing')}/>}
    {section==='km-missing'&&<DailyKmMissingControl user={user} onSubmitted={()=>setSection('km')}/>}
    {section==='tires'&&<TireManagement user={user} driverMode={false}/>}
    {section==='annual'&&<PeriodicMaintenance canWork={fleetWork} fixedType="inspection"/>}
    {section==='six-month'&&<PeriodicMaintenance canWork={fleetWork} fixedType="6_months_general"/>}
    {section==='oil'&&<OilControl onViewVehicle={onViewVehicle}/>}
  </div>;
}

function DailyKmControl({onMissing}){
  return <div><div className="sub-nav" style={{marginBottom:14}}><button className="sub-btn active">📋 Submitted</button><button className="sub-btn" onClick={onMissing}>⚠️ Missing Today</button></div><DailyKmSubmitted/></div>;
}
function DailyKmMissingControl({user,onSubmitted}){
  return <div><div className="sub-nav" style={{marginBottom:14}}><button className="sub-btn" onClick={onSubmitted}>📋 Submitted</button><button className="sub-btn active">⚠️ Missing Today</button></div><DailyKmMissing user={user}/></div>;
}
function OilControl({onViewVehicle}){
  const [vehicles,setVehicles]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[filter,setFilter]=useState('all'),[search,setSearch]=useState('');
  const load=async()=>{try{setLoading(true);const api=(await import('../api/client')).default;const r=await api.get('/vehicles');setVehicles((r.data?.vehicles||[]).filter(v=>String(v.plate||'').trim().toLowerCase()!=='test 123'));}catch(e){setError(e.response?.data?.error||e.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  const status=v=>{const n=Number(v.sinceOil||0);return n>=5000?'overdue':n>=4500?'soon':'ok'};
  const rows=vehicles.filter(v=>(filter==='all'||status(v)===filter)&&(!search.trim()||String(v.plate||'').toLowerCase().includes(search.trim().toLowerCase())||String(v.driver||'').toLowerCase().includes(search.trim().toLowerCase())));
  const count=x=>vehicles.filter(v=>status(v)===x).length;
  return <div><div className="cards-grid" style={{marginBottom:16}}><div className="card danger"><h3>🔴 Oil Overdue</h3><div className="big-number">{count('overdue')}</div></div><div className="card"><h3>🟡 Oil Due Soon</h3><div className="big-number">{count('soon')}</div></div><div className="card"><h3>🟢 Oil OK</h3><div className="big-number">{count('ok')}</div></div></div><div className="panel"><div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vehicle / driver" style={{minWidth:260}}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All</option><option value="overdue">Overdue</option><option value="soon">Due Soon</option><option value="ok">OK</option></select><button className="btn btn-secondary" onClick={load}>↻ Refresh</button></div>{error&&<div className="alert alert-error">{error}</div>}{loading?<div className="loading">Loading oil status...</div>:<div style={{overflowX:'auto'}}><table><thead><tr><th>Vehicle</th><th>Driver</th><th>Site</th><th>Current KM</th><th>Last Oil KM</th><th>KM Since Oil</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map(v=>{const n=Number(v.sinceOil||0),cls=n>=5000?'status-urgent':n>=4500?'status-warning':'status-safe',label=n>=5000?'Overdue':n>=4500?'Due Soon':'OK';return <tr key={v.id}><td><strong>{v.plate}</strong></td><td>{v.driver||'-'}</td><td>{v.location||'-'}</td><td>{Number(v.currentKm||0).toLocaleString()}</td><td>{Number(v.lastOilKm||0).toLocaleString()}</td><td><strong>{n.toLocaleString()}</strong></td><td><span className={'status-badge '+cls}>{label}</span></td><td>{onViewVehicle&&<button className="btn btn-primary" onClick={()=>onViewVehicle(v.id)}>View</button>}</td></tr>})}</tbody></table>{!rows.length&&<div className="alert alert-info">No vehicles match this filter.</div>}</div>}</div></div>;
}

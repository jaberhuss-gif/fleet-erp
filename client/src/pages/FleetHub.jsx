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
    {id:'maintenance-report',icon:'🛠️',label:'Maintenance Report',title:'Maintenance Report',description:'Maintenance issues and Tire Service Requests.'},
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
    {section==='maintenance-report'&&<MaintenanceReport canWork={fleetWork}/>}
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
function normalizeWhatsAppNumber(phone){
  const raw=String(phone||'').trim();
  if(!raw)return '';
  const digits=raw.replace(/\D/g,'');
  if(!digits)return '';
  if(digits.startsWith('00'))return digits.slice(2);
  if(digits.startsWith('0'))return '966'+digits.slice(1);
  if(digits.startsWith('966'))return digits;
  return digits;
}

function OilControl({onViewVehicle}){
  const [vehicles,setVehicles]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[filter,setFilter]=useState('all'),[search,setSearch]=useState('');
  const load=async()=>{try{setLoading(true);const api=(await import('../api/client')).default;const r=await api.get('/vehicles');setVehicles((r.data?.vehicles||[]).filter(v=>String(v.plate||'').trim().toLowerCase()!=='test 123'));}catch(e){setError(e.response?.data?.error||e.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  const status=v=>{const n=Number(v.sinceOil||0),interval=Number(v.oilChangeInterval||5000);return n>=interval?'overdue':n>=Math.max(0,interval-500)?'soon':'ok'};
  const rows=vehicles.filter(v=>(filter==='all'||status(v)===filter)&&(!search.trim()||String(v.plate||'').toLowerCase().includes(search.trim().toLowerCase())||String(v.driver||'').toLowerCase().includes(search.trim().toLowerCase())));
  const count=x=>vehicles.filter(v=>status(v)===x).length;
  const printOilReport=()=>{
    const w=window.open('','_blank','width=1200,height=800');
    if(!w){setError('Please allow pop-ups to print the Engine Oil Control PDF.');return;}
    const esc=value=>String(value??'-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const statusLabel=v=>{const n=Number(v.sinceOil||0),interval=Number(v.oilChangeInterval||5000);return n>=interval?'OVERDUE':n>=Math.max(0,interval-500)?'DUE SOON':'OK';};
    const reportRows=rows.map(v=>'<tr><td>'+esc(v.plate)+'</td><td>'+esc(v.driver||'-')+'</td><td>'+esc(v.location||'-')+'</td><td>'+Number(v.currentKm||0).toLocaleString()+'</td><td>'+Number(v.lastOilKm||0).toLocaleString()+'</td><td>'+Number(v.sinceOil||0).toLocaleString()+'</td><td class="'+statusLabel(v).toLowerCase().replace(' ','-')+'">'+statusLabel(v)+'</td></tr>').join('');
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Engine Oil Control Report</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:9pt}.brand{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1e3a8a;padding-bottom:12px;margin-bottom:16px}.brand img{max-width:145px;max-height:65px;object-fit:contain}.company{font-size:13pt;font-weight:bold}.sub{margin-top:4px;color:#475569}.name{font-weight:bold;margin-top:7px}.role{font-size:9pt;color:#475569;margin-top:3px}h1{font-size:18pt;margin:0 0 6px}.meta{color:#475569;margin:8px 0 14px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:1px solid #94a3b8;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e9eef5}.overdue{color:#b91c1c;font-weight:bold}.due-soon{color:#b45309;font-weight:bold}.ok{color:#15803d;font-weight:bold}.footer{margin-top:18px;border-top:1px solid #cbd5e1;padding-top:8px;font-size:8pt;color:#64748b}</style></head><body><div class="brand"><img src="https://pbs.twimg.com/media/G0B19WzaYAIKWy1.png" alt="Maaden Ivanhoe Electric JV logo"><div><div class="company">Maaden Ivanhoe Electric Exploration and Development Limited Company</div><div class="sub">Exploration Phase — Arabian Shield</div><div class="name">Hussein Anwar</div><div class="role">Fleet Manager / Fleet &amp; Camp Maintenance Supervisor</div></div></div><h1>Engine Oil Control Report</h1><div class="meta">Generated: '+esc(new Date().toLocaleString())+' · Vehicles: '+rows.length+' · Filter: '+esc(filter==='all'?'All statuses':filter)+' · Search: '+esc(search.trim()||'None')+'</div><table><thead><tr><th>Vehicle</th><th>Driver</th><th>Site</th><th>Current KM</th><th>Last Oil-Change KM</th><th>KM Since Oil Change</th><th>Due Status</th></tr></thead><tbody>'+reportRows+'</tbody></table><div class="footer">Fleet Management — Engine Oil Compliance Report</div></body></html>');
    w.document.close();w.focus();setTimeout(()=>{w.print();},350);
  };
  return <div><div className="cards-grid" style={{marginBottom:16}}><div className="card danger"><h3>🔴 Oil Overdue</h3><div className="big-number">{count('overdue')}</div></div><div className="card"><h3>🟡 Oil Due Soon</h3><div className="big-number">{count('soon')}</div></div><div className="card"><h3>🟢 Oil OK</h3><div className="big-number">{count('ok')}</div></div></div><div className="panel"><div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vehicle / driver" style={{minWidth:260}}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All</option><option value="overdue">Overdue</option><option value="soon">Due Soon</option><option value="ok">OK</option></select><button className="btn btn-secondary" onClick={load}>↻ Refresh</button><button className="btn btn-primary" onClick={printOilReport}>🖨️ PDF</button></div>{error&&<div className="alert alert-error">{error}</div>}{loading?<div className="loading">Loading oil status...</div>:<div style={{overflowX:'auto'}}><table><thead><tr><th>Vehicle</th><th>Driver</th><th>Site</th><th>Current KM</th><th>Last Oil KM</th><th>KM Since Oil</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map(v=>{const n=Number(v.sinceOil||0),interval=Number(v.oilChangeInterval||5000),cls=n>=interval?'status-urgent':n>=Math.max(0,interval-500)?'status-warning':'status-safe',label=n>=interval?'Overdue':n>=Math.max(0,interval-500)?'Due Soon':'OK';return <tr key={v.id}><td><strong>{v.plate}</strong></td><td>{v.driver||'-'}</td><td>{v.location||'-'}</td><td>{Number(v.currentKm||0).toLocaleString()}</td><td>{Number(v.lastOilKm||0).toLocaleString()}</td><td><strong>{n.toLocaleString()}</strong></td><td><span className={'status-badge '+cls}>{label}</span></td><td style={{display:'flex',gap:6,flexWrap:'wrap'}}>{onViewVehicle&&<button className="btn btn-primary" onClick={()=>onViewVehicle(v.id)}>View</button>}<a className="btn btn-success" href={normalizeWhatsAppNumber(v.phone||v.driver_phone)?'https://wa.me/'+normalizeWhatsAppNumber(v.phone||v.driver_phone)+'?text='+encodeURIComponent('🚨 Engine Oil Change Required\nVehicle: '+(v.plate||'-')+'\nDriver: '+(v.driver||'-')+'\nCurrent KM: '+Number(v.currentKm||0).toLocaleString()+'\nLast Oil Change: '+Number(v.lastOilKm||0).toLocaleString()+' KM\nKM Since Oil Change: '+n.toLocaleString()+' KM\n\nPlease change the engine oil as soon as possible and confirm after completion.'):'#'} target="_blank" rel="noopener noreferrer" onClick={e=>{if(!normalizeWhatsAppNumber(v.phone||v.driver_phone))e.preventDefault()}} title={normalizeWhatsAppNumber(v.phone||v.driver_phone)?'Open WhatsApp message':'No WhatsApp number in Vehicle Master'} aria-disabled={!normalizeWhatsAppNumber(v.phone||v.driver_phone)}>📱 WhatsApp</a></td></tr>})}</tbody></table>{!rows.length&&<div className="alert alert-info">No vehicles match this filter.</div>}</div>}</div></div>;
}

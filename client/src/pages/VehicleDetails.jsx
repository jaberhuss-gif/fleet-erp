import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const tabs=['Overview','KM','Maintenance','Oil','Inspection','Documents','Alerts','History'];

export default function VehicleDetails({vehicleId,onBack}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[tab,setTab]=useState('Overview');
 useEffect(()=>{(async()=>{try{setLoading(true);const r=await api.get('/v2/vehicles/'+vehicleId+'/360');setData(r.data)}catch(e){setError(e.response?.data?.error||e.message)}finally{setLoading(false)}})()},[vehicleId]);
 if(loading)return <div className="loading">Loading Vehicle 360...</div>;
 if(error)return <div className="alert alert-error">{error}</div>;
 if(!data)return <div className="loading">Vehicle not found.</div>;
 const v=data.vehicle,alerts=data.alerts||[],readings=data.readings||[],maintenance=data.maintenance||[],tickets=data.tickets||[],submissions=data.submissions||[],compliance=data.compliance||[];
 const sinceOil=Math.max(0,Number(v.current_km||0)-Number(v.last_oil_km||0)),interval=Number(v.oil_interval_km||5000),remaining=Math.max(0,interval-sinceOil);
 const openAlerts=alerts.filter(a=>a.status!=='Closed'),critical=openAlerts.filter(a=>a.severity==='Critical').length,high=openAlerts.filter(a=>a.severity==='High').length;
 const health=critical?'Critical':high?'Attention':v.status==='Active'?'Operational':'Unavailable';
 const healthClass=health==='Critical'?'status-urgent':health==='Attention'?'status-warning':'status-safe';
 const fmt=n=>Number(n||0).toLocaleString();
 return <div className="vehicle360">
  <button className="btn" onClick={onBack} style={{marginBottom:16}}>← Back to Fleet</button>
  <div className="panel" style={{overflow:'hidden'}}>
   <div style={{padding:'24px',background:'linear-gradient(135deg,#0f766e,#0891b2)',color:'#fff'}}>
    <div style={{fontSize:12,opacity:.8,fontWeight:800,letterSpacing:'.12em'}}>VEHICLE 360</div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'end',gap:16,flexWrap:'wrap'}}>
     <div><h1 style={{margin:'6px 0'}}>{v.plate_number} {v.plate_code||''}</h1><div style={{opacity:.9}}>{v.make||'Vehicle'} {v.model||''} · {v.site_name||v.legacy_location||'No site'}</div></div>
     <span className={'status-badge '+healthClass} style={{background:'rgba(255,255,255,.92)'}}>{health}</span>
    </div>
   </div>
   <div className="cards-grid" style={{padding:16}}>
    <div className="card"><h3>👤 Driver</h3><div className="big-number" style={{fontSize:20}}>{v.driver_name||v.legacy_driver_name||'Unassigned'}</div><div className="sub">{v.driver_phone||v.legacy_driver_phone||'-'}</div></div>
    <div className="card"><h3>📍 Location</h3><div className="big-number" style={{fontSize:20}}>{v.site_name||v.legacy_location||'-'}</div></div>
    <div className="card"><h3>📏 Current KM</h3><div className="big-number">{fmt(v.current_km)}</div><div className="sub">km</div></div>
    <div className={sinceOil>=interval?'card danger':sinceOil>=interval-500?'card warning':'card'}><h3>🛢️ Oil</h3><div className="big-number">{fmt(remaining)}</div><div className="sub">{sinceOil>=interval?'OVERDUE':'km remaining'}</div></div>
    <div className={openAlerts.length?'card warning':'card success'}><h3>🔔 Alerts</h3><div className="big-number">{openAlerts.length}</div><div className="sub">{critical} critical · {high} high</div></div>
    <div className="card"><h3>🔧 Maintenance</h3><div className="big-number">{maintenance.length}</div><div className="sub">{maintenance.filter(x=>x.status!=='Closed').length} open</div></div>
   </div>
  </div>
  <div className="sub-nav" style={{margin:'16px 0'}}>{tabs.map(t=><button key={t} className={tab===t?'sub-btn active':'sub-btn'} onClick={()=>setTab(t)}>{t}</button>)}</div>
  {tab==='Overview'&&<div className="cards-grid">
    <div className="panel"><h2>Vehicle Information</h2><Info label="Plate" value={v.plate_number+' '+(v.plate_code||'')}/><Info label="Make / Model" value={(v.make||'-')+' '+(v.model||'')}/><Info label="Year" value={v.year||'-'}/><Info label="Status" value={v.status}/><Info label="Notes" value={v.notes||'-'}/></div>
    <div className="panel"><h2>Compliance</h2><Info label="Inspection Due" value={v.inspection_due_date||'Not recorded'}/><Info label="Registration" value={v.registration_expiry||'Not recorded'}/><Info label="Insurance" value={v.insurance_expiry||'Not recorded'}/><Info label="Last KM Update" value={v.meter_updated_at?String(v.meter_updated_at).slice(0,10):'Not recorded'}/></div>
   </div>}
  {tab==='KM'&&<DataTable rows={readings} columns={['reading_date','reading_km','notes']} headers={['Date','KM','Notes']} empty="No V2 KM readings yet."/>}
  {tab==='Maintenance'&&<DataTable rows={maintenance} columns={['wo_no','reported_date','category','status','contractor_cost','parts_cost']} headers={['WO','Date','Category','Status','Contractor','Parts']} empty="No maintenance work orders for this vehicle."/>}
  {tab==='Oil'&&<div className="panel"><h2>Oil Service</h2><div className="cards-grid"><div className="card"><h3>Last Oil KM</h3><div className="big-number">{fmt(v.last_oil_km)}</div></div><div className="card"><h3>KM Since Oil</h3><div className="big-number">{fmt(sinceOil)}</div></div><div className="card"><h3>Interval</h3><div className="big-number">{fmt(interval)}</div></div><div className="card"><h3>Remaining</h3><div className="big-number">{fmt(remaining)}</div></div></div><Info label="Last Oil Change Date" value={v.last_oil_change_date||'Not recorded'}/></div>}
  {tab==='Inspection'&&<div className="panel"><h2>Government & Document Dates</h2><Info label="Last Inspection" value={v.inspection_last_date||'Not recorded'}/><Info label="Inspection Due" value={v.inspection_due_date||'Not recorded'}/><Info label="Registration Expiry" value={v.registration_expiry||'Not recorded'}/><Info label="Insurance Expiry" value={v.insurance_expiry||'Not recorded'}/></div>}
  {tab==='Documents'&&<div className="panel"><h2>Documents</h2><div className="alert alert-info">Document storage is prepared in V2 workflow. No Legacy documents are copied automatically.</div></div>}
  {tab==='Alerts'&&<AlertList rows={alerts}/>}
  {tab==='History'&&<div className="cards-grid"><DataTable rows={submissions} columns={['submission_date','status','sheet_driver']} headers={['Date','Daily Submission','Driver']} empty="No daily submissions yet."/><DataTable rows={compliance} columns={['compliance_date','status']} headers={['Date','KM Compliance']} empty="No KM compliance records yet."/><DataTable rows={tickets} columns={['opened_at','title','priority','status']} headers={['Opened','Ticket','Priority','Status']} empty="No vehicle tickets yet."/></div>}
 </div>;
}
function Info({label,value}){return <div style={{display:'flex',justifyContent:'space-between',gap:16,padding:'11px 0',borderBottom:'1px solid var(--border-color)'}}><span style={{color:'var(--text-secondary)'}}>{label}</span><strong>{String(value)}</strong></div>}
function DataTable({rows,columns,headers,empty}){return <div className="panel" style={{overflowX:'auto'}}>{!rows.length?<div className="alert alert-info">{empty}</div>:<table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||i}>{columns.map(c=><td key={c}>{c==='contractor_cost'||c==='parts_cost'||c==='reading_km'?Number(r[c]||0).toLocaleString():String(r[c]??'-')}</td>)}</tr>)}</tbody></table>}</div>}
function AlertList({rows}){return <div className="panel"><h2>Active & Historical Alerts</h2>{!rows.length?<div className="alert alert-success">✓ No alerts recorded.</div>:rows.map(a=><div key={a.id} style={{padding:14,borderBottom:'1px solid var(--border-color)'}}><strong>{a.severity==='Critical'?'🚨':a.severity==='High'?'⚠️':'🔔'} {a.title}</strong><div style={{fontSize:13,color:'var(--text-secondary)',marginTop:4}}>{a.message}</div><div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{a.status} · {String(a.alert_date).slice(0,10)}</div></div>)}</div>}

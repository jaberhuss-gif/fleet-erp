import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const fmtDate=v=>v?String(v).slice(0,10):'-';
const fmtKm=v=>v==null||v===''?'-':Number(v).toLocaleString();

export default function FleetHistory() {
  const [vehicles,setVehicles]=useState([]);
  const [vehicleId,setVehicleId]=useState('');
  const [tab,setTab]=useState('maintenance');
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{(async()=>{try{const r=await api.get('/vehicles');setVehicles((r.data?.vehicles||[]).filter(v=>String(v.plate||'').trim().toLowerCase()!=='test 123'));}catch(e){setError(e.response?.data?.error||e.message)}})()},[]);
  useEffect(()=>{if(!vehicleId){setData(null);return;} (async()=>{setLoading(true);setError('');try{const [detail,history]=await Promise.all([api.get('/vehicles/'+vehicleId+'/details'),api.get('/tire/vehicle/'+vehicleId+'/history')]);setData({...detail.data,history:history.data||{}});}catch(e){setError(e.response?.data?.error||e.message)}finally{setLoading(false)}})()},[vehicleId]);

  const vehicle=data?.vehicle;
  const maintenance=useMemo(()=>[
    ...(data?.history?.workOrders||[]).map(x=>({date:x.reported_date||x.created_at,type:'Work Order',ref:x.wo_no||x.id,description:x.description||x.category||'-',status:x.status,cost:x.final_cost??x.contractor_cost??x.labor_cost??0})),
    ...(data?.history?.periodicMaintenance||[]).map(x=>({date:x.completed_date||x.scheduled_date||x.created_at,type:x.type==='inspection'?'Annual Inspection':'6-Month Maintenance',ref:x.id,description:x.notes||x.description||'-',status:x.status,cost:x.final_cost??x.cost??0})),
    ...(data?.history?.tickets||[]).map(x=>({date:x.opened_at||x.created_at,type:'Vehicle Ticket',ref:x.id,description:x.title||x.description||x.category||'Maintenance request',status:x.status,cost:0})),
    ...(data?.history?.tireEvents||[]).map(x=>({date:x.event_date||x.created_at,type:'Tire Event',ref:x.id,description:(x.event_type||'Tire Service')+(x.position?' — '+x.position:'')+(x.manufacturer_serial?' — '+x.manufacturer_serial:'')+(x.notes?' — '+x.notes:''),status:'Recorded',cost:0})),
    ...(data?.history?.tireServiceRequests||[]).map(x=>({date:x.created_at,type:'Tire Service Request',ref:x.id,description:(x.request_type||'Tire Service')+(x.position?' — '+x.position:'')+(x.notes?' — '+x.notes:''),status:x.status,cost:0}))
  ].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))),[data]);
  const oil=useMemo(()=>(data?.oilChanges||[]).map(x=>({date:x.oil_change_date||x.created_at,km:x.oil_change_km,notes:x.notes||'-',changedBy:x.changed_by||x.user_name||'ERP'})),[data]);
  const km=useMemo(()=>(data?.readings||[]).map(x=>({date:x.reading_date||x.date||x.created_at,reading:x.current_km??x.km??x.odometer??x.reading,previous:x.previous_km??x.previous_reading,driver:x.driver||x.driver_name||'-',source:x.source||'-'})).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))),[data]);

  return <div className="hub-page">
    <div className="panel" style={{marginBottom:16}}>
      <h1 style={{margin:0}}>📚 History</h1>
      <p style={{margin:'6px 0 0',color:'#64748b'}}>Complete vehicle history: maintenance requests, completed work, tire events, oil changes and KM tracking.</p>
      <select value={vehicleId} onChange={e=>setVehicleId(e.target.value)} style={{marginTop:12,minWidth:320}}>
        <option value="">Select Vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate}{v.driver?' — '+v.driver:''}</option>)}
      </select>
    </div>
    <div className="sub-nav" style={{marginBottom:18}}>
      <button className={tab==='maintenance'?'sub-btn active':'sub-btn'} onClick={()=>setTab('maintenance')}>1- Maintenance History</button>
      <button className={tab==='oil'?'sub-btn active':'sub-btn'} onClick={()=>setTab('oil')}>2- Oil Change History</button>
      <button className={tab==='km'?'sub-btn active':'sub-btn'} onClick={()=>setTab('km')}>3- KM Tracking History</button>
    </div>
    {error&&<div className="alert alert-error">{error}</div>}
    {!vehicleId?<div className="alert alert-info">Select a vehicle to view its history.</div>:loading?<div className="loading">Loading history...</div>:<>
      {tab==='maintenance'&&<div className="panel" style={{overflowX:'auto'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><h2>{vehicle?.plate||''} — Maintenance History</h2><button className="btn btn-secondary" onClick={()=>window.print()}>🖨️ Print</button></div><table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th>Status</th><th>Cost</th></tr></thead><tbody>{maintenance.length?maintenance.map((r,i)=><tr key={i}><td>{fmtDate(r.date)}</td><td>{r.type}</td><td>{r.ref}</td><td>{r.description}</td><td>{r.status||'-'}</td><td>{fmtKm(r.cost)}</td></tr>):<tr><td colSpan="6">No maintenance history found.</td></tr>}</tbody></table></div>}
      {tab==='oil'&&<div className="panel" style={{overflowX:'auto'}}><h2>{vehicle?.plate||''} — Oil Change History</h2><table><thead><tr><th>Date</th><th>Oil Change KM</th><th>Changed By</th><th>Notes</th></tr></thead><tbody>{oil.length?oil.map((r,i)=><tr key={i}><td>{fmtDate(r.date)}</td><td>{fmtKm(r.km)}</td><td>{r.changedBy}</td><td>{r.notes}</td></tr>):<tr><td colSpan="4">No oil change history found.</td></tr>}</tbody></table></div>}
      {tab==='km'&&<div className="panel" style={{overflowX:'auto'}}><h2>{vehicle?.plate||''} — KM Tracking History</h2><table><thead><tr><th>Date</th><th>KM Reading</th><th>Previous KM</th><th>Driver</th><th>Source</th></tr></thead><tbody>{km.length?km.map((r,i)=><tr key={i}><td>{fmtDate(r.date)}</td><td>{fmtKm(r.reading)}</td><td>{fmtKm(r.previous)}</td><td>{r.driver}</td><td>{r.source}</td></tr>):<tr><td colSpan="5">No KM history found.</td></tr>}</tbody></table></div>}
    </>}
  </div>;
}
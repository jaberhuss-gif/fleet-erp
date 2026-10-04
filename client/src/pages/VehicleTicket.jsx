import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const clean=v=>String(v??'').trim();
const inspected=r=>{
  if(!r)return false;
  if(r.type==='6_months_general') return r.status==='Completed'||!!clean(r.completed_date)||!!clean(r.notes);
  if(r.type==='inspection') return r.status==='Completed'||!!clean(r.completed_date);
  return false;
};
const latest=(rows,type)=>{
  const typed=rows.filter(r=>r.type===type);
  const evidenced=typed.filter(inspected);
  return (evidenced.length?evidenced:typed).sort((a,b)=>String(b.completed_date||b.scheduled_date||b.created_at||'').localeCompare(String(a.completed_date||a.scheduled_date||a.created_at||'')))[0]||null;
};
const msgOpen=(vehicle,description)=>'Hello '+(vehicle?.driver||'Driver')+',\n\nVehicle '+(vehicle?.plate||'')+' maintenance request has been received.\nRequest: '+description+'\n\nFleet Management';
const msgClosed=(vehicle,description)=>'Hello '+(vehicle?.driver||'Driver')+',\n\nVehicle '+(vehicle?.plate||'')+' has been serviced based on the request: '+description+'\n\nThe request has been completed and closed.\n\nFleet Management';

export default function VehicleTicket({ user, canWork=false }) {
  const [tickets,setTickets]=useState([]),[tireRequests,setTireRequests]=useState([]),[vehicles,setVehicles]=useState([]),[periodic,setPeriodic]=useState([]);
  const [search,setSearch]=useState(''),[status,setStatus]=useState('Open'),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const canClose=user?.role==='Owner'||canWork;

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const [t,tr,v,p]=await Promise.all([
        api.get('/tickets?fleetType=maintenance'),
        api.get('/tire/service-requests'),
        api.get('/vehicles'),
        api.get('/periodic-maintenance')
      ]);
      setTickets(t.data?.tickets||[]);setTireRequests(tr.data?.requests||[]);setVehicles(v.data?.vehicles||[]);setPeriodic(p.data?.records||[]);
    }catch(e){setError(e.response?.data?.error||e.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);

  const vehicleMap=useMemo(()=>Object.fromEntries(vehicles.map(v=>[String(v.id),v])),[vehicles]);
  const annualMissing=useMemo(()=>vehicles.filter(v=>String(v.plate||'').trim().toLowerCase()!=='test 123').map(v=>{
    const r=latest(periodic.filter(x=>String(x.vehicle_id)===String(v.id)),'inspection');
    return {kind:'annual',id:'annual-'+v.id,vehicle:v,description:'Annual vehicle inspection',record:r,status:r&&inspected(r)?'Closed':'Open',date:r?.completed_date||r?.scheduled_date||''};
  }).filter(x=>x.status==='Open'),[vehicles,periodic]);

  const inspectionTickets=useMemo(()=>vehicles.flatMap(v=>{
    const vr=periodic.filter(x=>String(x.vehicle_id)===String(v.id));
    const six=latest(vr,'6_months_general');
    const annual=latest(vr,'inspection');
    const missing=[];
    if(!(six&&inspected(six))) missing.push({component:'6-Month Maintenance',record:six});
    if(!(annual&&inspected(annual))) missing.push({component:'Annual Inspection',record:annual});
    return missing.map((m,i)=>({kind:'inspection',id:'inspection-'+v.id+'-'+i,vehicle:v,description:m.component+' required',status:'Open',date:m.record?.scheduled_date||'',record:m.record,component:m.component}));
  }),[vehicles,periodic]);

  const rows=useMemo(()=>{
    const general=tickets.map(t=>({kind:'maintenance',id:t.id,vehicle:vehicleMap[String(t.vehicle_id)]||{plate:t.plate,driver:t.driver},description:t.description||t.title||t.category||'Maintenance request',status:t.status,date:t.opened_at,raw:t}));
    const tires=tireRequests.map(r=>({kind:'tire',id:r.id,vehicle:vehicleMap[String(r.vehicle_id)]||{plate:r.plate,driver:r.driver},description:(r.notes||'Tire service request')+(r.position?' — '+r.position:''),status:r.status,date:r.created_at,raw:r}));
    return [...general,...tires,...inspectionTickets,...annualMissing].filter(r=>!search||String(r.vehicle?.plate||'').toLowerCase().includes(search.toLowerCase())||String(r.description).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  },[tickets,tireRequests,vehicleMap,inspectionTickets,annualMissing,search]);

  const close=async(row)=>{
    if(!canClose)return;
    if(!confirm('Close this request after confirming the work is completed?'))return;
    try{
      if(row.kind==='maintenance') await api.put('/tickets/'+row.id+'/close',{});
      if(row.kind==='tire') await api.put('/tire/service-requests/'+row.id,{status:'COMPLETED'});
      if(row.kind==='inspection'){
        let rec=row.record;
        const type=row.component==='6-Month Maintenance'?'6_months_general':'inspection';
        if(!rec){
          await api.post('/periodic-maintenance',{vehicleId:Number(row.vehicle.id),type,scheduledDate:new Date().toISOString().slice(0,10),status:'Completed',completedDate:new Date().toISOString().slice(0,10),technician:user?.fullName||user?.username||'Fleet Management',notes:row.component+' completed and ticket closed.'});
        }else{
          await api.put('/periodic-maintenance/'+rec.id,{...rec,type,status:'Completed',completedDate:new Date().toISOString().slice(0,10),notes:rec.notes||row.component+' completed and ticket closed.'});
        }
      }
      await load();
    }catch(e){alert(e.response?.data?.error||e.message)}
  };

  const whatsapp=async(row)=>{
    try{
      let phone=row.vehicle?.phone, driver=row.vehicle?.driver||'Driver', plate=row.vehicle?.plate||'';
      let message;
      if(row.kind==='maintenance'){
        try{
          const info=(await api.get('/tickets/'+row.id+'/whatsapp-info')).data||{};
          phone=info.driverPhone||phone;driver=info.driverName||driver;plate=info.vehiclePlate||plate;
        }catch(_){}
        message=['Closed','COMPLETED'].includes(String(row.status||''))?msgClosed({driver,plate},row.description):msgOpen({driver,plate},row.description);
      }else if(row.kind==='tire'){
        message=['Closed','COMPLETED'].includes(String(row.status||''))?msgClosed({driver,plate},row.description):msgOpen({driver,plate},row.description);
      }else if(row.kind==='inspection'){
        message=msgOpen({driver,plate},row.description);
      }
      if(!phone){alert('No driver phone number found for this vehicle.');return}
      window.open('https://wa.me/'+String(phone).replace(/\D/g,'')+'?text='+encodeURIComponent(message),'_blank');
    }catch(e){alert(e.response?.data?.error||e.message)}
  };


  return <div className="hub-page">
    <div className="panel" style={{marginBottom:16}}>
      <h1 style={{margin:0}}>🎫 Vehicle Ticket</h1>
      <p style={{margin:'6px 0 0',color:'#64748b'}}>All driver maintenance requests, annual inspection tickets and tire replacement/service tickets — open and completed.</p>
      <div className="sub-nav" style={{marginTop:12,marginBottom:8}}>
        <button className="sub-btn active">1- Maintenance Issues</button>
        <button className="sub-btn">2- Inspection Tickets</button>
        <button className="sub-btn">3- Daily KM Missing</button>
        <button className="sub-btn">4- Oil Change</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 180px auto',gap:8,marginTop:12}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vehicle or request"/>
        <select value={status} onChange={e=>setStatus(e.target.value)}><option value="Open">Open</option><option value="All">All</option></select>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
    </div>
    {error&&<div className="alert alert-error">{error}</div>}
    {loading?<div className="loading">Loading vehicle tickets...</div>:<div className="panel" style={{overflowX:'auto'}}>
      <table><thead><tr><th>Type</th><th>Vehicle</th><th>Driver</th><th>Request</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{rows.filter(r=>status==='All'||['Open','PENDING','APPROVED','IN_PROGRESS'].includes(String(r.status||''))).length?rows.filter(r=>status==='All'||['Open','PENDING','APPROVED','IN_PROGRESS'].includes(String(r.status||''))).map(r=><tr key={r.kind+'-'+r.id}>
        <td>{r.kind==='maintenance'?'Maintenance Request':r.kind==='annual'?'Annual Inspection':'Tire Service'}</td>
        <td><strong>{r.vehicle?.plate||'-'}</strong></td><td>{r.vehicle?.driver||'-'}</td><td style={{minWidth:280}}>{r.description}</td><td>{String(r.date||'').slice(0,10)||'-'}</td><td>{r.status}</td>
        <td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {canClose&&<button className="btn btn-success" style={{padding:'6px 10px'}} onClick={()=>close(r)}>Close</button>}
          <button className="btn" style={{padding:'6px 10px',background:'#25D366',color:'#fff'}} onClick={()=>whatsapp(r)}>📱 WhatsApp</button>
        </div></td>
      </tr>):<tr><td colSpan="7" style={{textAlign:'center',padding:24}}>No vehicle tickets found.</td></tr>}</tbody></table>
    </div>}
  </div>;
}
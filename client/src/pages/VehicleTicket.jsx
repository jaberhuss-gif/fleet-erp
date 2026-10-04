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
  const [tickets,setTickets]=useState([]),[tireRequests,setTireRequests]=useState([]),[vehicles,setVehicles]=useState([]),[periodic,setPeriodic]=useState([]),[dailyReport,setDailyReport]=useState(null);
  const [search,setSearch]=useState(''),[status,setStatus]=useState('Open'),[activeTab,setActiveTab]=useState('maintenance'),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const canClose=user?.role==='Owner'||canWork;

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const [t,tr,v,p,d]=await Promise.all([
        api.get('/tickets?fleetType=maintenance'),
        api.get('/tire/service-requests'),
        api.get('/vehicles'),
        api.get('/periodic-maintenance'),
        api.get('/google-sheet-submission-report')
      ]);
      setTickets(t.data?.tickets||[]);setTireRequests(tr.data?.requests||[]);setVehicles(v.data?.vehicles||[]);setPeriodic(p.data?.records||[]);setDailyReport(d.data||null);
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

  const ticketRows=useMemo(()=>{
    const general=tickets.map(t=>({kind:'maintenance',id:t.id,vehicle:vehicleMap[String(t.vehicle_id)]||{plate:t.plate,driver:t.driver},description:t.description||t.title||t.category||'Maintenance request',status:t.status,date:t.opened_at,raw:t}));
    const tires=tireRequests.map(r=>({kind:'tire',id:r.id,vehicle:vehicleMap[String(r.vehicle_id)]||{plate:r.plate,driver:r.driver},description:(r.notes||'Tire service request')+(r.position?' — '+r.position:''),status:r.status,date:r.created_at,raw:r}));
    return [...general,...tires,...inspectionTickets].filter(r=>!search||String(r.vehicle?.plate||'').toLowerCase().includes(search.toLowerCase())||String(r.description).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  },[tickets,tireRequests,vehicleMap,inspectionTickets,search]);

  const kmMissingRows=useMemo(()=>((dailyReport?.missing)||[]).map(r=>({kind:'km',id:'km-'+r.vehicleId,vehicle:{plate:r.vehicle,driver:r.driver,phone:r.phone},description:'Daily KM missing — no reading submitted today',status:'Open',date:dailyReport?.reportDate||'',raw:r})),[dailyReport]);

  const oilRows=useMemo(()=>vehicles.map(v=>{
    const daily=(dailyReport?.records||[]).find(r=>String(r.vehicleId)===String(v.id));
    const changed=Boolean(daily?.erpIsOilChange);
    const hasKm=daily?.km != null;
    const current=hasKm ? Number(daily.km) : null;
    const last=v.last_oil_km != null ? Number(v.last_oil_km) : null;
    return {kind:'oil',id:'oil-'+v.id,vehicle:v,description:!hasKm?'KM missing today':changed?'Oil change recorded today':'Oil change not recorded today',status:!hasKm?'KM Missing':changed?'Changed':'Not Changed',date:dailyReport?.reportDate||'',current,last,raw:daily};
  }),[vehicles,dailyReport]);

  const rows=activeTab==='inspection'?inspectionTickets:activeTab==='km'?kmMissingRows:activeTab==='oil'?oilRows:ticketRows;

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
      }else if(row.kind==='km'){
        message='Hello '+driver+',\n\nNo KM reading has been recorded today for vehicle '+plate+'. Please enter today\'s current KM.\n\nFleet Management';
      }else if(row.kind==='oil'){
        message='Hello '+driver+',\n\nVehicle '+plate+' — '+row.description+'. Current KM: '+(row.current!=null?Number(row.current).toLocaleString()+' km.':'')+(row.last!=null?' Last Oil KM: '+Number(row.last).toLocaleString()+' km.':'')+'\n\nFleet Management';
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
        <button className={activeTab==='maintenance'?'sub-btn active':'sub-btn'} onClick={()=>setActiveTab('maintenance')}>1- Maintenance Issues ({ticketRows.length})</button>
        <button className={activeTab==='inspection'?'sub-btn active':'sub-btn'} onClick={()=>setActiveTab('inspection')}>2- Inspection Tickets ({inspectionTickets.length})</button>
        <button className={activeTab==='km'?'sub-btn active':'sub-btn'} onClick={()=>setActiveTab('km')}>3- Daily KM Missing ({kmMissingRows.length})</button>
        <button className={activeTab==='oil'?'sub-btn active':'sub-btn'} onClick={()=>setActiveTab('oil')}>4- Oil Change ({oilRows.length})</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 180px auto',gap:8,marginTop:12}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vehicle or request"/>
        <select value={status} onChange={e=>setStatus(e.target.value)}><option value="Open">Open</option><option value="All">All</option></select>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
    </div>
    {error&&<div className="alert alert-error">{error}</div>}
    {loading?<div className="loading">Loading vehicle tickets...</div>:<div className="panel" style={{overflowX:'auto'}}>
      <table><thead><tr><th>Type</th><th>Vehicle</th><th>Driver</th><th>Request / Oil Status</th><th>Current KM</th><th>Last Oil KM</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{rows.filter(r=>activeTab==='oil'||status==='All'||['Open','PENDING','APPROVED','IN_PROGRESS'].includes(String(r.status||''))).length?rows.filter(r=>activeTab==='oil'||status==='All'||['Open','PENDING','APPROVED','IN_PROGRESS'].includes(String(r.status||''))).map(r=><tr key={r.kind+'-'+r.id}>
        <td>{r.kind==='maintenance'?'Maintenance Request':r.kind==='inspection'?'Inspection':r.kind==='tire'?'Tire Service':r.kind==='km'?'Daily KM':'Oil Change'}</td>
        <td><strong>{r.vehicle?.plate||'-'}</strong></td><td>{r.vehicle?.driver||'-'}</td><td style={{minWidth:280}}>{r.description}</td><td>{r.current!=null?Number(r.current).toLocaleString():'-'}</td><td>{r.last!=null?Number(r.last).toLocaleString():'-'}</td><td>{String(r.date||'').slice(0,10)||'-'}</td><td>{r.status}</td>
        <td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {canClose&&['maintenance','tire','inspection'].includes(r.kind)&&<button className="btn btn-success" style={{padding:'6px 10px'}} onClick={()=>close(r)}>Close</button>}
          <button className="btn" style={{padding:'6px 10px',background:'#25D366',color:'#fff'}} onClick={()=>whatsapp(r)}>📱 WhatsApp</button>
        </div></td>
      </tr>):<tr><td colSpan="9" style={{textAlign:'center',padding:24}}>No vehicle tickets found.</td></tr>}</tbody></table>
    </div>}
  </div>;
}
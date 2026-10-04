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
        api.get('/tickets?fleetType=general'),
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

  const rows=useMemo(()=>{
    const general=tickets.map(t=>({kind:'maintenance',id:t.id,vehicle:vehicleMap[String(t.vehicle_id)]||{plate:t.plate,driver:t.driver},description:t.description||t.title||t.category||'Maintenance request',status:t.status,date:t.opened_at,raw:t}));
    const tires=tireRequests.filter(r=>['PENDING','APPROVED','IN_PROGRESS'].includes(String(r.status||'PENDING').toUpperCase())).map(r=>({kind:'tire',id:r.id,vehicle:vehicleMap[String(r.vehicle_id)]||{plate:r.plate,driver:r.driver},description:(r.notes||'Tire service request')+(r.position?' — '+r.position:''),status:r.status,date:r.created_at,raw:r}));
    return [...general,...annualMissing].filter(r=>!search||String(r.vehicle?.plate||'').toLowerCase().includes(search.toLowerCase())||String(r.description).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  },[tickets,tireRequests,vehicleMap,annualMissing,search]);

  const close=async(row)=>{
    if(!canClose)return;
    if(!confirm('Close this request after confirming the work is completed?'))return;
    try{
      if(row.kind==='maintenance') await api.put('/tickets/'+row.id+'/close',{});
      if(row.kind==='tire') await api.put('/tire/service-requests/'+row.id,{status:'COMPLETED'});
      if(row.kind==='annual'){
        let rec=row.record;
        if(!rec){
          const created=await api.post('/periodic-maintenance',{vehicleId:Number(row.vehicle.id),type:'inspection',scheduledDate:new Date().toISOString().slice(0,10),status:'Completed',completedDate:new Date().toISOString().slice(0,10),technician:user?.fullName||user?.username||'Fleet Management',notes:'Annual inspection completed and ticket closed.'});
          rec=created.data?.record;
        }else{
          await api.put('/periodic-maintenance/'+rec.id,{...rec,status:'Completed',completedDate:new Date().toISOString().slice(0,10),notes:rec.notes||'Annual inspection completed and ticket closed.'});
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
        message=msgOpen({driver,plate},row.description);
      }else if(row.kind==='tire'){
        message=msgOpen({driver,plate},row.description);
      }else{
        message='Hello '+driver+',\n\nVehicle '+plate+' annual inspection is due. Please arrange the annual inspection.\n\nFleet Management';
      }
      if(!phone){alert('No driver phone number found for this vehicle.');return}
      window.open('https://wa.me/'+String(phone).replace(/\D/g,'')+'?text='+encodeURIComponent(message),'_blank');
    }catch(e){alert(e.response?.data?.error||e.message)}
  };
  const whatsappClosed=async(row)=>{
    let phone=row.vehicle?.phone,driver=row.vehicle?.driver||'Driver',plate=row.vehicle?.plate||'';
    if(row.kind==='maintenance'){try{const info=(await api.get('/tickets/'+row.id+'/whatsapp-info')).data||{};phone=info.driverPhone||phone;driver=info.driverName||driver;plate=info.vehiclePlate||plate}catch(_){}}
    const description=row.description;
    const message=msgClosed({driver,plate},description);
    if(!phone){alert('No driver phone number found for this vehicle.');return}
    window.open('https://wa.me/'+String(phone).replace(/\D/g,'')+'?text='+encodeURIComponent(message),'_blank');
  };

  return <div className="hub-page">
    <div className="panel" style={{marginBottom:16}}>
      <h1 style={{margin:0}}>🎫 Vehicle Ticket</h1>
      <p style={{margin:'6px 0 0',color:'#64748b'}}>Open driver maintenance requests, missing annual inspections and tire replacement/service tickets.</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 180px auto',gap:8,marginTop:12}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vehicle or request"/>
        <select value={status} onChange={e=>setStatus(e.target.value)}><option value="Open">Open</option><option value="All">All</option></select>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
    </div>
    {error&&<div className="alert alert-error">{error}</div>}
    {loading?<div className="loading">Loading vehicle tickets...</div>:<div className="panel" style={{overflowX:'auto'}}>
      <table><thead><tr><th>Type</th><th>Vehicle</th><th>Driver</th><th>Request</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{rows.filter(r=>status==='All'||r.status==='Open'||r.status==='PENDING'||r.status==='APPROVED'||r.status==='IN_PROGRESS').length?rows.filter(r=>status==='All'||r.status==='Open'||r.status==='PENDING'||r.status==='APPROVED'||r.status==='IN_PROGRESS').map(r=><tr key={r.kind+'-'+r.id}>
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
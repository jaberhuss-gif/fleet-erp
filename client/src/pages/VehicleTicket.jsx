import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const normalStatus=s=>String(s||'').trim().toUpperCase();
const openStatuses=['OPEN','ACKNOWLEDGED','IN_PROGRESS','PENDING','APPROVED','SUBMITTED'];
const closedStatuses=['CLOSED','COMPLETED','CANCELLED'];

const msgOpen=(vehicle,description)=>
  'Hello '+(vehicle?.driver||'Driver')+',\n\nVehicle '+(vehicle?.plate||'')+
  ' maintenance request has been received.\nRequest: '+description+
  '\n\nFleet Management';
const msgClosed=(vehicle,description)=>
  'Hello '+(vehicle?.driver||'Driver')+',\n\nVehicle '+(vehicle?.plate||'')+
  ' has been serviced based on the request: '+description+
  '\n\nThe request has been completed and closed.\n\nFleet Management';

export default function VehicleTicket({ user, canWork=false }) {
  const [tickets,setTickets]=useState([]);
  const [tireRequests,setTireRequests]=useState([]);
  const [vehicles,setVehicles]=useState([]);
  const [dailyReport,setDailyReport]=useState(null);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('Open');
  const [activeTab,setActiveTab]=useState('maintenance');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const canManage=user?.role==='Owner'||user?.role==='FleetSupervisor'||canWork;

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const [t,tr,v,p,d]=await Promise.all([
        api.get('/tickets?fleetType=maintenance'),
        api.get('/tire/service-requests'),
        api.get('/vehicles'),
        api.get('/google-sheet-submission-report')
      ]);
      setTickets(t.data?.tickets||[]);
      setTireRequests(tr.data?.requests||[]);
      setVehicles(v.data?.vehicles||[]);
      setDailyReport(d.data||null);
    }catch(e){
      setError(e.response?.data?.error||e.message);
    }finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);

  const vehicleMap=useMemo(()=>Object.fromEntries(vehicles.map(v=>[String(v.id),v])),[vehicles]);

  const ticketRows=useMemo(()=>{
    const general=tickets.map(t=>({
      kind:'maintenance',
      id:t.id,
      vehicle:vehicleMap[String(t.vehicle_id)]||{plate:t.plate,driver:t.driver,phone:t.driverPhone},
      description:t.description||t.title||t.category||'Maintenance request',
      status:t.status||'Open',
      date:t.opened_at,
      raw:t
    }));
    const tires=tireRequests.map(r=>({
      kind:'tire',
      id:r.id,
      vehicle:vehicleMap[String(r.vehicle_id)]||{plate:r.plate,driver:r.driver,phone:r.driverPhone},
      description:(r.notes||r.request_type||'Tire service request')+(r.position?' — '+r.position:''),
      status:r.status||'OPEN',
      date:r.created_at,
      raw:r
    }));
    return [...general,...tires]
      .filter(r=>!search ||
        String(r.vehicle?.plate||'').toLowerCase().includes(search.toLowerCase()) ||
        String(r.description).toLowerCase().includes(search.toLowerCase()) ||
        String(r.vehicle?.driver||'').toLowerCase().includes(search.toLowerCase()))
      .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  },[tickets,tireRequests,vehicleMap,search]);

  const kmMissingRows=useMemo(()=>((dailyReport?.missing)||[]).map(r=>({
    kind:'km',
    id:'km-'+r.vehicleId,
    vehicle:{plate:r.vehicle,driver:r.driver,phone:r.phone},
    description:'Daily KM missing — no reading submitted today',
    status:'Open',
    date:dailyReport?.reportDate||'',
    raw:r
  })),[dailyReport]);

  const oilRows=useMemo(()=>vehicles
    .filter(v=>String(v.plate||'').trim().toLowerCase()!=='test 123')
    .map(v=>{
      const current=Number(v.currentKm??v.current_km??0);
      const last=Number(v.lastOilKm??v.last_oil_km??0);
      const interval=Number(v.oilChangeInterval??v.oil_change_interval??5000)||5000;
      const driven=current-last;
      let compliance='No Data';
      if(current>0 && last>0){
        compliance=driven>=interval?'OVERDUE':driven>=interval-500?'DUE SOON':'OK';
      }
      return {
        kind:'oil',id:'oil-'+v.id,vehicle:v,
        description:compliance==='OVERDUE'?'Oil change overdue':
          compliance==='DUE SOON'?'Oil change due soon':
          compliance==='OK'?'Oil change within interval':'No oil baseline',
        status:compliance,date:v.lastOilChangeDate||v.last_oil_change_date||'',
        current,last,driven,interval,raw:v
      };
    }),[vehicles]);

  const rows=activeTab==='km'?kmMissingRows:
    activeTab==='oil'?oilRows:ticketRows;

  const visibleRows=useMemo(()=>rows.filter(r=>{
    // Oil Compliance is a monitoring table, not an open-ticket queue.
    // Always show every real vehicle so management can see the latest oil
    // baseline, current KM, driven KM, date and current compliance status.
    if(activeTab==='oil') return true;
    if(status==='All') return true;
    const s=normalStatus(r.status);
    return openStatuses.includes(s);
  }),[rows,status,activeTab]);

  const acknowledge=async row=>{
    if(!canManage||row.kind!=='maintenance')return;
    try{
      await api.put('/tickets/'+row.id+'/acknowledge',{});
      await load();
    }catch(e){alert(e.response?.data?.error||e.message)}
  };

  const startWork=async row=>{
    if(!canManage||!['maintenance'].includes(row.kind))return;
    try{
      await api.put('/tickets/'+row.id+'/start',{});
      await load();
    }catch(e){alert(e.response?.data?.error||e.message)}
  };

  const close=async row=>{
    if(!canManage)return;
    if(!confirm('Confirm that the work is completed and close this request?'))return;
    try{
      if(row.kind==='maintenance'){
        const notes=prompt('Closing notes (optional):','Work completed and verified.');
        if(notes===null)return;
        await api.put('/tickets/'+row.id+'/close-with-notes',{resolutionNotes:notes});
      }
      if(row.kind==='tire'){
        const current=normalStatus(row.status);
        if(current==='OPEN'||current==='SUBMITTED'||current==='APPROVED'){
          await api.put('/tire/service-requests/'+row.id,{status:'IN_PROGRESS'});
        }
        await api.put('/tire/service-requests/'+row.id,{status:'COMPLETED'});
      }
      await load();
    }catch(e){alert(e.response?.data?.error||e.message)}
  };

  const whatsapp=async(row)=>{
    try{
      let phone=row.vehicle?.phone||row.vehicle?.driver_phone;
      let driver=row.vehicle?.driver||'Driver';
      let plate=row.vehicle?.plate||'';
      if(row.vehicle?.id){
        try{
          const info=(await api.get('/vehicles/'+row.vehicle.id+'/whatsapp-info')).data||{};
          phone=info.driverPhone||phone;
          driver=info.driverName||driver;
          plate=info.vehiclePlate||plate;
        }catch(_){}
      }
      let message;
      if(row.kind==='maintenance'){
        try{
          const info=(await api.get('/tickets/'+row.id+'/whatsapp-info')).data||{};
          phone=info.driverPhone||phone;driver=info.driverName||driver;plate=info.vehiclePlate||plate;
        }catch(_){}
        message=closedStatuses.includes(normalStatus(row.status))
          ?msgClosed({driver,plate},row.description):msgOpen({driver,plate},row.description);
      }else if(row.kind==='tire'){
        message=closedStatuses.includes(normalStatus(row.status))
          ?msgClosed({driver,plate},row.description):msgOpen({driver,plate},row.description);
      }else if(row.kind==='km'){
        message='Hello '+driver+',\n\nNo KM reading has been recorded today for vehicle '+plate+'. Please enter today\'s current KM.\n\nFleet Management';
      }else if(row.kind==='oil'){
        message='Hello '+driver+',\n\nVehicle '+plate+' — '+row.description+'. Current KM: '+(row.current?Number(row.current).toLocaleString()+' km.':'')+(row.last?' Last Oil KM: '+Number(row.last).toLocaleString()+' km.':'')+'\n\nFleet Management';
      }
      if(!phone){alert('No driver phone number found for this vehicle.');return}
      const waPhone=String(phone||'').replace(/\D/g,'');
      if(waPhone.length===9 && waPhone.startsWith('5')) phone='966'+waPhone;
      else if(waPhone.length===10 && waPhone.startsWith('05')) phone='966'+waPhone.slice(1);
      else phone=waPhone;
      if(!phone){alert('No valid Saudi driver WhatsApp number found for this vehicle.');return}
      window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(message),'_blank');
    }catch(e){alert(e.response?.data?.error||e.message)}
  };

  const actionButtons=row=>{
    if(!canManage)return null;
    const s=normalStatus(row.status);
    if(row.kind==='maintenance'){
      if(s==='OPEN')return <button className="btn" style={{padding:'6px 10px'}} onClick={()=>acknowledge(row)}>Acknowledge</button>;
      if(s==='ACKNOWLEDGED'||s==='PENDING'||s==='APPROVED')return <button className="btn" style={{padding:'6px 10px'}} onClick={()=>startWork(row)}>Start Work</button>;
      if(s==='IN_PROGRESS')return <button className="btn btn-success" style={{padding:'6px 10px'}} onClick={()=>close(row)}>Complete & Close</button>;
    }
    if(row.kind==='tire'){
      if(['OPEN','SUBMITTED','APPROVED'].includes(s))return <button className="btn" style={{padding:'6px 10px'}} onClick={()=>close(row)}>Start & Complete</button>;
      if(s==='IN_PROGRESS')return <button className="btn btn-success" style={{padding:'6px 10px'}} onClick={()=>close(row)}>Complete</button>;
    }
    return null;
  };

  return <div className="hub-page">
    <div className="panel" style={{marginBottom:16}}>
      <h1 style={{margin:0}}>🎫 Vehicle Ticket</h1>
      <p style={{margin:'6px 0 0',color:'#64748b'}}>
        Controlled workflow: Open → Acknowledged → In Progress → Completed/Closed.
        Maintenance, tire, Daily KM and oil compliance are shown from ERP data.
      </p>
      <div className="sub-nav" style={{marginTop:12,marginBottom:8}}>
        <button className={activeTab==='maintenance'?'sub-btn active':'sub-btn'} onClick={()=>setActiveTab('maintenance')}>1- Maintenance Issues ({ticketRows.length})</button>
        <button className={activeTab==='km'?'sub-btn active':'sub-btn'} onClick={()=>setActiveTab('km')}>3- Daily KM Missing ({kmMissingRows.length})</button>
        <button className={activeTab==='oil'?'sub-btn active':'sub-btn'} onClick={()=>setActiveTab('oil')}>4- Oil Compliance ({oilRows.length})</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 180px auto',gap:8,marginTop:12}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vehicle, driver or request"/>
        <select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="Open">Open / Active</option>
          <option value="All">All Records</option>
        </select>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
    </div>
    {error&&<div className="alert alert-error">{error}</div>}
    {loading?<div className="loading">Loading vehicle tickets...</div>:<div className="panel" style={{overflowX:'auto'}}>
      <table>
        <thead><tr>
          <th>Type</th><th>Vehicle</th><th>Driver</th><th>Request / Status</th>
          <th>Current KM</th><th>Last Oil KM</th><th>Date</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>
          {visibleRows.length?visibleRows.map(r=><tr key={r.kind+'-'+r.id}>
            <td>{r.kind==='maintenance'?'Maintenance Request':r.kind==='tire'?'Tire Service':r.kind==='km'?'Daily KM':'Oil Compliance'}</td>
            <td><strong>{r.vehicle?.plate||'-'}</strong></td>
            <td>{r.vehicle?.driver||'-'}</td>
            <td style={{minWidth:280}}>{r.description}</td>
            <td>{r.current!=null?Number(r.current).toLocaleString():'-'}</td>
            <td>{r.last!=null?Number(r.last).toLocaleString():'-'}</td>
            <td>{String(r.date||'').slice(0,10)||'-'}</td>
            <td><strong>{r.status}</strong></td>
            <td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {actionButtons(r)}
              <button className="btn" style={{padding:'6px 10px',background:'#25D366',color:'#fff'}} onClick={()=>whatsapp(r)}>📱 WhatsApp</button>
            </div></td>
          </tr>):<tr><td colSpan="9" style={{textAlign:'center',padding:24}}>No vehicle tickets found.</td></tr>}
        </tbody>
      </table>
    </div>}
  </div>;
}

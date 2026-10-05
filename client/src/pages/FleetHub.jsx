import { useState, useEffect } from 'react';
import DriverPortal from './DriverPortal';
import Drivers from './Drivers';
import Vehicles from './Vehicles';
import VehicleMaintenance from './VehicleMaintenance';
import ReportIssue from './ReportIssue';
import TireManagement, { TireControlCenter } from './TireManagement';
import TireServiceRequests from './TireServiceRequests';
import DailyKmSubmitted from './DailyKmSubmitted';
import DailyKmMissing from './DailyKmMissing';
import MaintenanceReport from './MaintenanceReport';
import FleetHistory from './FleetHistory';
import VehicleTicket from './VehicleTicket';

const FLEET_ACTIONS = [
  { id:'daily-km', label:'📏 Add Daily KM', title:'Daily KM / Odometer Reading', description:'Enter today’s vehicle odometer reading and review recent readings.' },
  { id:'add-vehicle', label:'🚙 Vehicle Master', title:'Vehicle Master', description:'Single place to add and edit vehicle identity, driver assignment and vehicle master data.' },
  { id:'add-driver', label:'👨‍🔧 Add Driver', title:'Add Driver', description:'Add and maintain driver records and vehicle assignments.' },
  { id:'maintenance', label:'🔧 Vehicle Maintenance', title:'Vehicle Maintenance', description:'Periodic maintenance, inspections and repair verification.' },
  { id:'issue', label:'🛠️ Maintenance Issue Report', title:'Report a Vehicle Problem', description:'Report a vehicle problem and create a maintenance ticket.' },
  { id:'tire-service', label:'🛞 Tire Service Request', title:'Tire Service Request', description:'Submit a tire shop, puncture repair or tire replacement request.' },
  { id:'tire', label:'🛞 Tire Survey', title:'Vehicle Tire Survey', description:'Initial 6-tire survey, serial numbers, photos and lock control.' },
  { id:'tire-control', label:'🎫 Tire Control', title:'Tire Control Center', description:'Fleet-wide tire status and serial tracking.' }
];

export default function FleetHub({ user, access, initialOwnerGroup='add' }) {
  const fleetView=user?.role==='Owner'||!!access?.fleet?.can_view;
  const fleetWork=user?.role==='Owner'||!!access?.fleet?.can_work;
  const isDriver=user?.role==='Driver';

  const [section,setSection]=useState('add-vehicle');
  const [ownerGroup,setOwnerGroup]=useState(initialOwnerGroup);

  useEffect(()=>{
    if(user?.role==='Owner'){
      setOwnerGroup(initialOwnerGroup);
      const first={
        add:'add-vehicle',
        maintenance:'maintenance',
        'maintenance-report':'maintenance-issue',
        history:'history',
        'vehicle-ticket':'vehicle-ticket',
        km:'daily-km-submitted'
      }[initialOwnerGroup]||'add-vehicle';
      setSection(first);
    }
  },[initialOwnerGroup,user?.role]);

  if(!fleetView)return <div className="alert alert-error">Access denied: Fleet access is not assigned to this user.</div>;

  const visibleActions=FLEET_ACTIONS.filter(item=>{
    if(isDriver)return ['daily-km','issue','tire-service','tire'].includes(item.id);
    if(item.id==='add-driver'||item.id==='tire-control')return user?.role==='Owner';
    return true;
  });
  const safeSection=visibleActions.some(x=>x.id===section)?section:(visibleActions[0]?.id||'daily-km');

  if(user?.role!=='Owner'){
    return <div className="hub-page">
      <div className="panel" style={{marginBottom:16}}><h1 style={{margin:0}}>🚗 Fleet</h1><p style={{margin:'6px 0 0',color:'#64748b'}}>Fleet vehicle and maintenance actions.</p></div>
      <div className="sub-nav" style={{marginBottom:18}}>{visibleActions.map(item=><button key={item.id} className={safeSection===item.id?'sub-btn active':'sub-btn'} onClick={()=>setSection(item.id)}>{item.label}</button>)}</div>
      {safeSection==='daily-km'&&<DriverPortal canWork={fleetWork}/>}
      {safeSection==='issue'&&<ReportIssue canWork={fleetWork} user={user}/>}
      {safeSection==='tire-service'&&<TireServiceRequests driverMode={isDriver}/>}
      {safeSection==='tire'&&<TireManagement user={user} driverMode={isDriver}/>}
    </div>;
  }

  const ownerGroups={
    add:['add-vehicle','add-driver'],
    maintenance:['maintenance'],
    'maintenance-report':['maintenance-report'],
    history:['history'],
    'vehicle-ticket':['vehicle-ticket'],
    km:['daily-km-submitted','daily-km-missing'],
    'inspection-email':['inspection-email']
  };
  const ownerItems={
    'add-vehicle':{label:'🚙 Vehicle Master',title:'Vehicle Master',description:'Single place to add and edit vehicle identity, driver assignment and vehicle master data.'},
    'add-driver':{label:'👨‍🔧 Add Driver',title:'Add Driver',description:'Add and maintain driver records and vehicle assignments.'},
    maintenance:{label:'🔧 Periodic Maintenance',title:'Periodic Maintenance',description:'Existing periodic maintenance records, schedules, edit and delete.'},
    'maintenance-report':{label:'🛠️ Maintenance Report',title:'Maintenance Report',description:'Maintenance issue reports and tire service requests.'},
    history:{label:'📚 History',title:'History',description:'Maintenance history, oil change history and KM tracking history.'},
    'vehicle-ticket':{label:'🎫 Vehicle Ticket',title:'Vehicle Ticket',description:'Driver maintenance requests, annual inspection tickets and tire service tickets.'},
    'daily-km-submitted':{label:'📋 Daily KM — Submitted',title:'Daily KM — Submitted',description:'View vehicles that submitted a daily KM reading today.'},
    'daily-km-missing':{label:'⚠️ Daily KM — Missing',title:'Daily KM — Missing',description:'View vehicles that have not submitted a daily KM reading today.'},
    'inspection-email':{label:'📧 Annual Inspection Email',title:'Annual Inspection Email Control',description:'Select all sites or specific sites and send annual inspection reminders for vehicles due within 30 days.'}
  };
  const ids=ownerGroups[ownerGroup]||ownerGroups.add;
  const currentSection=ids.includes(section)?section:ids[0];

  return <div className="hub-page">
    <div className="panel" style={{marginBottom:16}}>
      <h1 style={{margin:0}}>🚗 Fleet</h1>
      <p style={{margin:'6px 0 0',color:'#64748b'}}>Fleet master data, maintenance, history, tickets and KM tracking.</p>
    </div>
    <div className="sub-nav" style={{marginBottom:18}}>
      {ids.map(id=><button key={id} className={currentSection===id?'sub-btn active':'sub-btn'} onClick={()=>setSection(id)}>{ownerItems[id].label}</button>)}
    </div>
    <div className="panel" style={{marginBottom:16}}>
      <h2 style={{margin:0}}>{ownerItems[currentSection].title}</h2>
      <p style={{margin:'6px 0 0',color:'#64748b',fontSize:13}}>{ownerItems[currentSection].description}</p>
    </div>

    {currentSection==='add-vehicle'&&<Vehicles canWork={fleetWork}/>} 
    {currentSection==='add-driver'&&<Drivers initialAction="add"/>}
    {currentSection==='maintenance'&&<VehicleMaintenance canWork={fleetWork}/>}

    {currentSection==='maintenance-report'&&<MaintenanceReport canWork={fleetWork}/>}
    {currentSection==='history'&&<FleetHistory/>}
    {currentSection==='vehicle-ticket'&&<VehicleTicket user={user} canWork={fleetWork}/>}
    {currentSection==='daily-km-submitted'&&<DailyKmSubmitted/>}
    {currentSection==='daily-km-missing'&&<DailyKmMissing user={user}/>}\n    {currentSection==='inspection-email'&&<VehicleMaintenance canWork={fleetWork} inspectionEmailOnly/>}
  </div>;
}

import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { printContent } from '../api/print';

const money = value => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const number = value => Number(value || 0).toLocaleString('en-US');
const dateText = value => value ? String(value).slice(0, 10) : '—';
const clean = value => value === null || value === undefined || value === '' ? '—' : value;
const isOpen = status => !['closed', 'completed', 'resolved', 'cancelled'].includes(String(status || '').toLowerCase());
const norm = value => String(value || '').trim().toLowerCase();

function ReportHeading({ title, subtitle, onPrint }) {
  return (
    <div className="report-heading" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12, marginBottom:18 }}>
      <div>
        <h2 style={{ margin:'0 0 5px', color:'#173b70' }}>{title}</h2>
        <div style={{ color:'#64748b', fontSize:13 }}>{subtitle}</div>
      </div>
      <button className="print-btn no-print" onClick={onPrint}>🖨️ Print / Save as PDF</button>
    </div>
  );
}

function Metric({ label, value, note, tone }) {
  return <div className={`card ${tone || ''}`}><h3>{label}</h3><div className="big-number" style={{fontSize:26}}>{value}</div>{note && <div className="sub">{note}</div>}</div>;
}

export default function AdvancedReports() {
  const [subTab, setSubTab] = useState('vehicle');
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [sites, setSites] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [periodic, setPeriodic] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [v, d, s, t] = await Promise.all([
        api.get('/vehicles'), api.get('/drivers'), api.get('/sites'), api.get('/tickets')
      ]);
      setVehicles(v.data.vehicles || []);
      setDrivers(d.data.drivers || []);
      setSites(s.data.sites || []);
      setTickets(t.data.tickets || []);
      try {
        const p = await api.get('/periodic-maintenance');
        setPeriodic(p.data.records || []);
      } catch { setPeriodic([]); }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Unable to load fleet report data.');
    } finally { setLoading(false); }
  };

  const print = (title, subtitle) => printContent(title, subtitle || 'Fleet Management');
  if (loading) return <div className="loading">Loading fleet reports...</div>;

  return (
    <div>
      <div className="panel" style={{background:'linear-gradient(135deg,#173b70,#2563a6)',color:'#fff',padding:'22px 24px',marginBottom:16}}>
        <h2 style={{margin:0,color:'#fff'}}>📊 Fleet Management Reports</h2>
        <p style={{margin:'7px 0 0',opacity:.9}}>Operational reports for vehicles, drivers, sites and management review.</p>
        <div style={{marginTop:8,fontSize:12,opacity:.85}}>Prepared by Hussein Anwar · Fleet Manager</div>
      </div>
      <div className="sub-nav no-print" style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
        {[
          ['vehicle','🚗 Vehicle Report'],['driver','👤 Driver Report'],
          ['site','🏢 Site Report'],['summary','📊 Executive Summary']
        ].map(([key,label]) => <button key={key} className={subTab===key?'sub-btn active':'sub-btn'} onClick={()=>setSubTab(key)}>{label}</button>)}
        <button className="sub-btn no-print" onClick={load}>↻ Refresh Data</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {subTab==='vehicle' && <VehicleReport vehicles={vehicles} tickets={tickets} periodic={periodic} onPrint={print}/>}
      {subTab==='driver' && <DriverReport drivers={drivers} vehicles={vehicles} tickets={tickets} onPrint={print}/>}
      {subTab==='site' && <SiteReport sites={sites} vehicles={vehicles} tickets={tickets} onPrint={print}/>}
      {subTab==='summary' && <ExecutiveSummary vehicles={vehicles} drivers={drivers} sites={sites} tickets={tickets} periodic={periodic} onPrint={print}/>}
    </div>
  );
}

function VehicleReport({ vehicles, tickets, periodic, onPrint }) {
  const [selected, setSelected] = useState('');
  const [month, setMonth] = useState('all');
  const vehicle = vehicles.find(v => String(v.id)===selected);
  const vehicleTickets = tickets.filter(t => {
    if (!vehicle) return false;
    const same = String(t.vehicle_id ?? '')===String(vehicle.id) || norm(t.plate || t.vehicle_plate)===norm(vehicle.plate);
    return same && (month==='all' || String(t.opened_at || t.created_at || '').startsWith(month));
  }).sort((a,b)=>String(b.opened_at||b.created_at||'').localeCompare(String(a.opened_at||a.created_at||'')));
  const services = periodic.filter(r => vehicle && (String(r.vehicle_id ?? '')===String(vehicle.id) || norm(r.vehicle_plate)===norm(vehicle.plate)));
  const serviceCost = services.reduce((sum,r)=>sum+Number(r.cost||0),0);
  const ticketCost = vehicleTickets.reduce((sum,t)=>sum+Number(t.final_cost ?? t.cost ?? 0),0);
  const months = [...new Set(tickets.map(t=>String(t.opened_at||t.created_at||'').slice(0,7)).filter(x=>/^\d{4}-\d{2}$/.test(x)))].sort().reverse();
  const km = Number(vehicle?.currentKm ?? vehicle?.currentKM ?? 0);
  const oilKm = Number(vehicle?.lastOilKm ?? vehicle?.lastOilKM ?? 0);
  const interval = Number(vehicle?.oilChangeInterval || 5000);
  const sinceOil = Math.max(0,km-oilKm);
  const remaining = Math.max(0,interval-sinceOil);

  return <div className="panel">
    <ReportHeading title="🚗 Vehicle Report" subtitle="Vehicle profile, odometer, oil service, maintenance history and recorded costs." onPrint={()=>onPrint('Vehicle Report',vehicle?.plate || 'All Vehicles')}/>
    <div className="no-print form-group" style={{maxWidth:520}}>
      <label>Select Vehicle</label>
      <select value={selected} onChange={e=>setSelected(e.target.value)}>
        <option value="">All Vehicles — fleet register</option>
        {vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {v.make||''} {v.model||''}</option>)}
      </select>
      {selected && <><label style={{marginTop:10}}>Ticket Month</label><select value={month} onChange={e=>setMonth(e.target.value)}><option value="all">All available months</option>{months.map(m=><option key={m} value={m}>{m}</option>)}</select></>}
    </div>
    {!vehicle ? <>
      <div className="cards-grid">
        <Metric label="Registered Vehicles" value={vehicles.length}/>
        <Metric label="Urgent Overdue" value={vehicles.filter(v=>norm(v.status).includes('urgent')).length} tone="danger"/>
        <Metric label="Warning" value={vehicles.filter(v=>norm(v.status).includes('warning')).length} tone="warning"/>
        <Metric label="Maintenance Tickets" value={tickets.length}/>
      </div>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Vehicle</th><th>Make / Model</th><th>Year</th><th>Assigned Driver</th><th>Site</th><th>Current KM</th><th>KM Since Oil</th><th>Oil Due In</th><th>Status</th></tr></thead>
      <tbody>{vehicles.map(v=>{const current=Number(v.currentKm??v.currentKM??0);const last=Number(v.lastOilKm??v.lastOilKM??0);const due=Math.max(0,Number(v.oilChangeInterval||5000)-(current-last));return <tr key={v.id}><td><b>{clean(v.plate)}</b></td><td>{[v.make,v.model].filter(Boolean).join(' ')||'—'}</td><td>{clean(v.year)}</td><td>{clean(v.driver_name||v.driver)}</td><td>{clean(v.location)}</td><td>{number(current)}</td><td>{number(Math.max(0,current-last))}</td><td>{number(due)} km</td><td>{clean(v.status)}</td></tr>})}</tbody></table></div>
    </> : <>
      <div className="cards-grid">
        <Metric label="Vehicle" value={clean(vehicle.plate)}/>
        <Metric label="Assigned Driver" value={clean(vehicle.driver_name||vehicle.driver)}/>
        <Metric label="Current Odometer" value={number(km)} note="Kilometres"/>
        <Metric label="KM Since Oil Change" value={number(sinceOil)} note={`Service interval: ${number(interval)} km`}/>
        <Metric label="Oil Service Remaining" value={number(remaining)} note="Kilometres" tone={remaining<=500?'danger':'success'}/>
        <Metric label="Maintenance Tickets" value={vehicleTickets.length}/>
      </div>
      <h3>Vehicle Information</h3>
      <table><tbody>
        <tr><th>Plate</th><td>{clean(vehicle.plate)}</td><th>Make / Model</th><td>{[vehicle.make,vehicle.model].filter(Boolean).join(' ')||'—'}</td></tr>
        <tr><th>Year</th><td>{clean(vehicle.year)}</td><th>Site / Location</th><td>{clean(vehicle.location)}</td></tr>
        <tr><th>Driver</th><td>{clean(vehicle.driver_name||vehicle.driver)}</td><th>Phone</th><td>{clean(vehicle.driver_phone||vehicle.phone)}</td></tr>
        <tr><th>Last Oil KM</th><td>{number(oilKm)}</td><th>Vehicle Status</th><td>{clean(vehicle.status)}</td></tr>
        <tr><th>Inspection Expiry</th><td>{dateText(vehicle.inspectionExpiryDate||vehicle.inspection_expiry_date)}</td><th>Last Oil Date</th><td>{dateText(vehicle.lastOilChangeDate||vehicle.last_oil_change_date)}</td></tr>
      </tbody></table>
      <h3 style={{marginTop:22}}>Maintenance Cost Summary (SAR)</h3>
      <div className="cards-grid"><Metric label="Ticket Costs" value={money(ticketCost)}/><Metric label="Scheduled Service Costs" value={money(serviceCost)}/></div>
      <h3>Maintenance / Ticket History ({vehicleTickets.length})</h3>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Priority</th><th>Status</th><th>Recorded Cost (SAR)</th></tr></thead><tbody>
        {vehicleTickets.length?vehicleTickets.map(t=><tr key={t.id}><td>{dateText(t.opened_at||t.created_at)}</td><td>{clean(t.category)}</td><td>{clean(t.description)}</td><td>{clean(t.priority)}</td><td>{clean(t.status)}</td><td>{money(t.final_cost??t.cost)}</td></tr>):<tr><td colSpan="6">No matching tickets in the selected period.</td></tr>}
      </tbody></table></div>
      <h3 style={{marginTop:22}}>Scheduled Maintenance ({services.length})</h3>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Technician</th><th>Cost (SAR)</th></tr></thead><tbody>
        {services.length?services.map(r=><tr key={r.id}><td>{dateText(r.completed_date||r.scheduled_date||r.created_at)}</td><td>{clean(r.type)}</td><td>{clean(r.status)}</td><td>{clean(r.technician)}</td><td>{money(r.cost)}</td></tr>):<tr><td colSpan="5">No scheduled maintenance records found.</td></tr>}
      </tbody></table></div>
    </>}
  </div>;
}

function DriverReport({ drivers, vehicles, tickets, onPrint }) {
  const [selected,setSelected]=useState('');
  const driver=drivers.find(d=>String(d.id)===selected);
  const assigned=driver?vehicles.filter(v=>String(v.driverId??v.driver_id??'')===String(driver.id)||norm(v.driver_name||v.driver)===norm(driver.name)): [];
  const driverTickets=driver?tickets.filter(t=>String(t.driver_id??'')===String(driver.id)||norm(t.driver_name||t.reported_by)===norm(driver.name)): [];
  const open=driverTickets.filter(t=>isOpen(t.status)).length;
  return <div className="panel">
    <ReportHeading title="👤 Driver Report" subtitle="Driver register, assigned vehicles, reported maintenance issues and compliance-related records." onPrint={()=>onPrint('Driver Report',driver?.name||'All Drivers')}/>
    <div className="no-print form-group" style={{maxWidth:520}}><label>Select Driver</label><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">All Drivers</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
    {!driver?<><div className="cards-grid"><Metric label="Registered Drivers" value={drivers.length}/><Metric label="Drivers with Assigned Vehicles" value={new Set(vehicles.map(v=>norm(v.driver_name||v.driver)).filter(Boolean)).size}/><Metric label="Maintenance Tickets" value={tickets.length}/></div>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Driver</th><th>Phone</th><th>License</th><th>Nationality</th><th>Assigned Vehicle</th><th>Site</th><th>Status</th></tr></thead><tbody>{drivers.map(d=>{const vs=vehicles.filter(v=>String(v.driverId??v.driver_id??'')===String(d.id)||norm(v.driver_name||v.driver)===norm(d.name));return <tr key={d.id}><td><b>{d.name}</b></td><td>{clean(d.phone)}</td><td>{clean(d.license_no)}</td><td>{clean(d.nationality)}</td><td>{vs.map(v=>v.plate).filter(Boolean).join(', ')||clean(d.vehicle_plate)}</td><td>{vs.map(v=>v.location).filter(Boolean).join(', ')||'—'}</td><td>{clean(d.status)}</td></tr>})}</tbody></table></div>
    </>:<>
      <div className="cards-grid"><Metric label="Driver" value={driver.name}/><Metric label="Phone" value={clean(driver.phone)}/><Metric label="License" value={clean(driver.license_no)}/><Metric label="Assigned Vehicles" value={assigned.length}/><Metric label="Reported Tickets" value={driverTickets.length}/><Metric label="Open Tickets" value={open} tone={open?'warning':'success'}/></div>
      <h3>Driver Profile</h3><table><tbody><tr><th>Name</th><td>{driver.name}</td><th>Phone</th><td>{clean(driver.phone)}</td></tr><tr><th>License</th><td>{clean(driver.license_no)}</td><th>Nationality</th><td>{clean(driver.nationality)}</td></tr><tr><th>Status</th><td>{clean(driver.status)}</td><th>Driver ID</th><td>{driver.id}</td></tr></tbody></table>
      <h3 style={{marginTop:20}}>Assigned Vehicles ({assigned.length})</h3><table><thead><tr><th>Plate</th><th>Make / Model</th><th>Site</th><th>Current KM</th><th>Status</th></tr></thead><tbody>{assigned.length?assigned.map(v=><tr key={v.id}><td><b>{v.plate}</b></td><td>{[v.make,v.model].filter(Boolean).join(' ')}</td><td>{clean(v.location)}</td><td>{number(v.currentKm??v.currentKM)}</td><td>{clean(v.status)}</td></tr>):<tr><td colSpan="5">No vehicle assignment matched this driver in the current register.</td></tr>}</tbody></table>
      <h3 style={{marginTop:20}}>Reported Maintenance / Ticket History ({driverTickets.length})</h3><table><thead><tr><th>Date</th><th>Vehicle</th><th>Category</th><th>Description</th><th>Status</th><th>Priority</th></tr></thead><tbody>{driverTickets.length?driverTickets.map(t=><tr key={t.id}><td>{dateText(t.opened_at||t.created_at)}</td><td>{clean(t.plate||t.vehicle_plate)}</td><td>{clean(t.category)}</td><td>{clean(t.description)}</td><td>{clean(t.status)}</td><td>{clean(t.priority)}</td></tr>):<tr><td colSpan="6">No tickets linked to this driver name or ID.</td></tr>}</tbody></table>
    </>}
  </div>;
}

function SiteReport({ sites, vehicles, tickets, onPrint }) {
  const [selected,setSelected]=useState('');
  const site=sites.find(s=>String(s.name)===selected);
  const siteVehicles=vehicles.filter(v=>norm(v.location)===norm(selected));
  const siteTickets=tickets.filter(t=>norm(t.location||t.site)===norm(selected)||siteVehicles.some(v=>String(t.vehicle_id??'')===String(v.id)||norm(t.plate||t.vehicle_plate)===norm(v.plate)));
  const totalOpen=siteTickets.filter(t=>isOpen(t.status)).length;
  return <div className="panel">
    <ReportHeading title="🏢 Site Report" subtitle="Fleet distribution, vehicle status and maintenance workload by operating site." onPrint={()=>onPrint('Site Report',selected||'All Sites')}/>
    <div className="no-print form-group" style={{maxWidth:520}}><label>Select Site</label><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">All Sites</option>{sites.map(s=><option key={s.id} value={s.name}>{s.name}{s.region?' · '+s.region:''}</option>)}</select></div>
    {!site?<><div className="cards-grid"><Metric label="Operating Sites" value={sites.length}/><Metric label="Fleet Vehicles" value={vehicles.length}/><Metric label="Maintenance Tickets" value={tickets.length}/><Metric label="Open Tickets" value={tickets.filter(t=>isOpen(t.status)).length} tone="warning"/></div>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Site</th><th>Region</th><th>Vehicles</th><th>Urgent</th><th>Warning</th><th>Tickets</th><th>Open Tickets</th></tr></thead><tbody>{sites.map(s=>{const vs=vehicles.filter(v=>norm(v.location)===norm(s.name));const ts=tickets.filter(t=>norm(t.location||t.site)===norm(s.name)||vs.some(v=>String(t.vehicle_id??'')===String(v.id)||norm(t.plate||t.vehicle_plate)===norm(v.plate)));return <tr key={s.id}><td><b>{s.name}</b></td><td>{clean(s.region)}</td><td>{vs.length}</td><td>{vs.filter(v=>norm(v.status).includes('urgent')).length}</td><td>{vs.filter(v=>norm(v.status).includes('warning')).length}</td><td>{ts.length}</td><td>{ts.filter(t=>isOpen(t.status)).length}</td></tr>})}</tbody></table></div>
    </>:<>
      <div className="cards-grid"><Metric label="Site" value={site.name}/><Metric label="Vehicles" value={siteVehicles.length}/><Metric label="Maintenance Tickets" value={siteTickets.length}/><Metric label="Open Tickets" value={totalOpen} tone={totalOpen?'warning':'success'}/><Metric label="Urgent Vehicles" value={siteVehicles.filter(v=>norm(v.status).includes('urgent')).length} tone="danger"/></div>
      <h3>Vehicles at {site.name}</h3><table><thead><tr><th>Plate</th><th>Make / Model</th><th>Driver</th><th>Current KM</th><th>Status</th></tr></thead><tbody>{siteVehicles.length?siteVehicles.map(v=><tr key={v.id}><td><b>{v.plate}</b></td><td>{[v.make,v.model].filter(Boolean).join(' ')}</td><td>{clean(v.driver_name||v.driver)}</td><td>{number(v.currentKm??v.currentKM)}</td><td>{clean(v.status)}</td></tr>):<tr><td colSpan="5">No vehicles assigned to this site.</td></tr>}</tbody></table>
      <h3 style={{marginTop:20}}>Maintenance Tickets ({siteTickets.length})</h3><table><thead><tr><th>Date</th><th>Vehicle</th><th>Category</th><th>Description</th><th>Priority</th><th>Status</th><th>Cost (SAR)</th></tr></thead><tbody>{siteTickets.length?siteTickets.map(t=><tr key={t.id}><td>{dateText(t.opened_at||t.created_at)}</td><td>{clean(t.plate||t.vehicle_plate)}</td><td>{clean(t.category)}</td><td>{clean(t.description)}</td><td>{clean(t.priority)}</td><td>{clean(t.status)}</td><td>{money(t.final_cost??t.cost)}</td></tr>):<tr><td colSpan="7">No maintenance tickets linked to this site.</td></tr>}</tbody></table>
    </>}
  </div>;
}

function ExecutiveSummary({ vehicles, drivers, sites, tickets, periodic, onPrint }) {
  const urgent=vehicles.filter(v=>norm(v.status).includes('urgent')).length;
  const warning=vehicles.filter(v=>norm(v.status).includes('warning')).length;
  const safe=vehicles.filter(v=>norm(v.status).includes('safe')).length;
  const open=tickets.filter(t=>isOpen(t.status)).length;
  const closed=tickets.length-open;
  const ticketCost=tickets.reduce((sum,t)=>sum+Number(t.final_cost??t.cost??0),0);
  const scheduledCost=periodic.reduce((sum,r)=>sum+Number(r.cost||0),0);
  const categories=Object.entries(tickets.reduce((acc,t)=>{const key=t.category||'Unclassified';acc[key]=(acc[key]||0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]);
  const bySite=sites.map(s=>({name:s.name,count:vehicles.filter(v=>norm(v.location)===norm(s.name)).length,tickets:tickets.filter(t=>norm(t.location||t.site)===norm(s.name)).length})).sort((a,b)=>b.count-a.count);
  return <div className="panel">
    <ReportHeading title="📊 Executive Fleet Summary" subtitle="Management snapshot of fleet availability, maintenance workload and recorded maintenance costs." onPrint={()=>onPrint('Executive Fleet Summary','Fleet Management Overview')}/>
    <div className="cards-grid">
      <Metric label="Fleet Vehicles" value={vehicles.length}/>
      <Metric label="Safe / Normal" value={safe} tone="success"/>
      <Metric label="Warning" value={warning} tone="warning"/>
      <Metric label="Urgent Overdue" value={urgent} tone="danger"/>
      <Metric label="Drivers" value={drivers.length}/>
      <Metric label="Operating Sites" value={sites.length}/>
    </div>
    <h3>Maintenance Performance</h3>
    <div className="cards-grid">
      <Metric label="Total Tickets" value={tickets.length}/>
      <Metric label="Open / Pending" value={open} tone="warning"/>
      <Metric label="Closed / Resolved" value={closed} tone="success"/>
      <Metric label="Ticket Recorded Costs" value={money(ticketCost)} note="SAR · from ticket cost fields"/>
      <Metric label="Scheduled Service Costs" value={money(scheduledCost)} note="SAR · periodic maintenance records"/>
      <Metric label="Scheduled Services" value={periodic.length}/>
    </div>
    <p style={{fontSize:12,color:'#64748b'}}>Ticket costs and scheduled-service costs are displayed separately to make their source clear and avoid presenting an unverified combined total.</p>
    <h3 style={{marginTop:22}}>Maintenance Issues by Category</h3>
    <table><thead><tr><th>Category</th><th>Ticket Count</th><th>Share</th></tr></thead><tbody>{categories.length?categories.map(([name,count])=><tr key={name}><td>{name}</td><td>{count}</td><td>{tickets.length?(count/tickets.length*100).toFixed(1)+'%':'—'}</td></tr>):<tr><td colSpan="3">No ticket data available.</td></tr>}</tbody></table>
    <h3 style={{marginTop:22}}>Fleet Distribution by Site</h3>
    <table><thead><tr><th>Site</th><th>Vehicles</th><th>Tickets recorded at site</th></tr></thead><tbody>{bySite.map(s=><tr key={s.name}><td>{s.name}</td><td>{s.count}</td><td>{s.tickets}</td></tr>)}</tbody></table>
    <div style={{marginTop:18,padding:14,background:'#f8fafc',borderRadius:8,border:'1px solid #dbe3ee'}}>
      <b>Management attention</b>
      <ul style={{marginBottom:0}}>{urgent>0&&<li>Review {urgent} vehicle(s) marked urgent overdue and confirm corrective action.</li>}{warning>0&&<li>Monitor {warning} vehicle(s) currently marked warning.</li>}{open>0&&<li>Follow up {open} open or pending maintenance ticket(s) through closure.</li>}{!urgent&&!warning&&!open&&<li>No urgent vehicle status or open maintenance tickets are currently recorded.</li>}</ul>
    </div>
  </div>;
}

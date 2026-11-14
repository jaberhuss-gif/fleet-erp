import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const COMPANY = 'Maaden Ivanhoe Electric Exploration and Development Limited Company';
const PHASE = 'Exploration Phase — Arabian Shield';
const money = v => 'SAR ' + Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const number = v => Number(v || 0).toLocaleString('en-US');
const pick = (data, ...keys) => {
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data)) return data;
  return null;
};
const dateValue = v => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const inPeriod = (value, start, end) => {
  const d = dateValue(value);
  return !!d && d >= start && d < end;
};
const sum = (rows, key) => rows.reduce((n, r) => n + Number(r?.[key] || 0), 0);
const normalize = v => String(v || '').trim().toLowerCase();
const Card = ({ label, value, note, tone = 'navy' }) => (
  <div className="card" style={{ borderTop: '3px solid ' + ({ navy:'#23395d', green:'#16835d', amber:'#c27a16', red:'#b42318', grey:'#98a2b3' }[tone] || '#23395d') }}>
    <div style={{fontSize:12,color:'#667085',fontWeight:700}}>{label}</div>
    <div style={{fontSize:28,fontWeight:800,color:'#172b4d',margin:'8px 0 3px'}}>{value ?? '—'}</div>
    {note && <div style={{fontSize:11,color:'#667085'}}>{note}</div>}
  </div>
);
const Section = ({ title, subtitle, children }) => (
  <section className="panel" style={{marginTop:18,padding:18}}>
    <div style={{marginBottom:13}}>
      <h2 style={{margin:'0 0 4px',fontSize:18,color:'#172b4d'}}>{title}</h2>
      {subtitle && <div style={{fontSize:12,color:'#667085'}}>{subtitle}</div>}
    </div>
    {children}
  </section>
);
const Table = ({ headers, rows, empty = 'No records returned by the ERP.' }) => (
  <div style={{overflowX:'auto'}}>
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
      <thead><tr style={{background:'#f1f5f9'}}>{headers.map(h=><th key={h} style={{padding:'10px 9px',textAlign:'left',whiteSpace:'nowrap',color:'#475467'}}>{h}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map((row,i)=><tr key={i} style={{borderBottom:'1px solid #eaecf0'}}>{row.map((cell,j)=><td key={j} style={{padding:'10px 9px',color:'#344054'}}>{cell ?? '—'}</td>)}</tr>) : <tr><td colSpan={headers.length} style={{padding:14,color:'#98a2b3'}}>{empty}</td></tr>}</tbody>
    </table>
  </div>
);

export default function GMDashboardExecutive() {
  const [data,setData] = useState(null);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [errors,setErrors] = useState([]);
  const [updatedAt,setUpdatedAt] = useState(null);

  const refresh = useCallback(async (silent=false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    const endpoints = [
      ['dashboard','/dashboard'], ['tickets','/tickets'], ['workOrders','/work-orders'],
      ['projects','/projects'], ['purchases','/purchases'], ['handovers','/driver-handovers'],
      ['periodic','/periodic-maintenance'], ['inventory','/inventory'],
      ['drivers','/drivers'], ['tires','/tire/service-requests']
    ];
    const settled = await Promise.allSettled(endpoints.map(([,url]) => api.get(url, { timeout:20000 })));
    const next = {};
    const failed = [];
    settled.forEach((result,index) => {
      const key = endpoints[index][0];
      if (result.status === 'fulfilled') next[key] = result.value.data || {};
      else { next[key] = null; failed.push(key + ': ' + (result.reason?.response?.data?.error || result.reason?.message || 'unavailable')); }
    });
    setData(next);
    setErrors(failed);
    setUpdatedAt(new Date());
    setLoading(false);
    setRefreshing(false);
  },[]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => refresh(true),60000);
    return () => clearInterval(timer);
  },[refresh]);

  const m = useMemo(() => {
    if (!data) return null;
    const dashboard = data.dashboard || {};
    const raw = {
      vehicles: pick(dashboard.vehicles,'list'),
      tickets: pick(data.tickets,'tickets'),
      workOrders: pick(data.workOrders,'workOrders','orders'),
      projects: pick(data.projects,'projects'),
      purchases: pick(data.purchases,'purchases'),
      handovers: pick(data.handovers,'handovers'),
      periodic: pick(data.periodic,'records','maintenance'),
      inventory: pick(data.inventory,'items','inventory'),
      drivers: pick(data.drivers,'drivers'),
      tireRequests: pick(data.tires,'requests','serviceRequests')
    };
    const available = Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,Array.isArray(value)]));
    const vehicles = raw.vehicles || [];
    const tickets = raw.tickets || [];
    const workOrders = raw.workOrders || [];
    const projects = raw.projects || [];
    const purchases = raw.purchases || [];
    const handovers = raw.handovers || [];
    const periodic = raw.periodic || [];
    const inventory = raw.inventory || [];
    const drivers = raw.drivers || [];
    const tireRequests = raw.tireRequests || [];
    const now = new Date();
    const year = now.getFullYear();
    const periodStart = new Date(year,6,1);
    const periodEnd = new Date(year+1,0,1);
    const statusCount = (rows,statuses) => rows.filter(r => statuses.includes(normalize(r.status))).length;
    const safe = statusCount(vehicles,['safe']);
    const warning = statusCount(vehicles,['warning']);
    const urgent = statusCount(vehicles,['urgent overdue','urgent','overdue']);
    const invalid = statusCount(vehicles,['invalid reading']);
    const open = statusCount(tickets,['open']);
    const pendingConfirmation = statusCount(tickets,['pending driver confirmation']);
    const completed = statusCount(tickets,['completed']);
    const closed = statusCount(tickets,['closed']);
    const periodWO = workOrders.filter(r => inPeriod(r.reported_date || r.reportedDate || r.created_at,periodStart,periodEnd));
    const periodProjects = projects.filter(r => inPeriod(r.start_date || r.startDate,periodStart,periodEnd));
    const periodPurchases = purchases.filter(r => inPeriod(r.purchase_date || r.purchaseDate,periodStart,periodEnd));
    const pmCompleted = statusCount(periodic,['completed']);
    const pmPending = periodic.length - pmCompleted;
    const handoverLatest = [...handovers].sort((a,b)=>(dateValue(b.handover_date || b.handoverDate)?.getTime()||0)-(dateValue(a.handover_date || a.handoverDate)?.getTime()||0)).slice(0,6);
    const siteMap = {};
    vehicles.forEach(v => { const site=String(v.location || 'Not recorded').trim() || 'Not recorded'; siteMap[site]=(siteMap[site]||0)+1; });
    const stockTotal = inventory.reduce((n,item)=>n+Number(item.quantity ?? item.on_hand ?? item.stock_quantity ?? 0),0);
    const tirePending = tireRequests.filter(r=>['pending','in_progress'].includes(normalize(r.status))).length;
    const totalWorkOrderCost = sum(periodWO,'final_cost');
    const totalProjectSpend = sum(periodProjects,'spent');
    const totalPurchaseCost = sum(periodPurchases,'total_cost');
    return { vehicles,tickets,workOrders,projects,purchases,handovers,periodic,inventory,drivers,tireRequests,
      safe,warning,urgent,invalid,open,pendingConfirmation,completed,closed,year,
      periodWO,periodProjects,periodPurchases,totalWorkOrderCost,totalProjectSpend,totalPurchaseCost,
      pmCompleted,pmPending,handoverLatest,siteMap,stockTotal,tirePending,available };
  },[data]);

  if (loading && !data) return <div className="loading">Loading live Fleet ERP data…</div>;

  const statusBadge = (value) => {
    const s=String(value||'—');
    const color = ['open','pending','pending driver confirmation','urgent overdue','rejected'].includes(normalize(s)) ? '#b42318' :
      ['completed','closed','safe','approved'].includes(normalize(s)) ? '#16835d' : '#b54708';
    return <span style={{fontWeight:700,color}}>{s}</span>;
  };

  return <div className="gm-dashboard" style={{padding:24,maxWidth:1440,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap',marginBottom:20}}>
      <div>
        <div style={{color:'#a18b4f',fontWeight:800,fontSize:12,letterSpacing:1.5}}>MAADEN  |  IVANHOE ELECTRIC</div>
        <h1 style={{margin:'7px 0 4px',color:'#172b4d'}}>GM Executive Dashboard</h1>
        <p style={{margin:0,color:'#667085'}}>{COMPANY} · {PHASE}</p>
      </div>
      <button className="btn btn-secondary" onClick={()=>refresh()} disabled={loading || refreshing}>{loading || refreshing ? 'Refreshing…' : '↻ Refresh Live Data'}</button>
    </div>
    <div className="alert alert-info" style={{marginBottom:14}}>
      <strong>Live database view.</strong> Automatic refresh every 60 seconds. Last refreshed: {updatedAt?.toLocaleString() || '—'}.
    </div>
    {errors.length>0 && <div className="alert alert-warning" style={{marginBottom:16}}>
      <strong>Some modules could not be loaded.</strong><ul style={{margin:'6px 0 0',paddingLeft:20}}>{errors.map(e=><li key={e}>{e}</li>)}</ul>
      <div style={{fontSize:11,marginTop:5}}>Unavailable modules are not displayed as zero. Their figures are incomplete until the source responds.</div>
    </div>}
    {m && <>
      <Section title="Fleet at a Glance" subtitle="Vehicle readiness is calculated by the Fleet ERP vehicle dashboard using current odometer and oil-service rules.">
        <div className="cards-grid">
          <Card label="Fleet Vehicles" value={m.available.vehicles ? number(m.vehicles.length) : 'Data Incomplete'} note="Vehicle master records"/>
          <Card label="Safe" value={number(m.safe)} tone="green" note="Oil and mileage rule: within interval"/>
          <Card label="Warning" value={number(m.warning)} tone="amber" note="Approaching service threshold"/>
          <Card label="Urgent / Overdue" value={number(m.urgent)} tone="red" note="Service overdue or missing oil KM"/>
          <Card label="Invalid KM" value={number(m.invalid)} tone="grey" note="Odometer chronology requires review"/>
        </div>
      </Section>
      <Section title="Support & Maintenance" subtitle="Ticket status counts are mutually exclusive. Completed and awaiting-driver-confirmation are not counted as Open.">
        <div className="cards-grid">
          <Card label="Open Tickets" value={m.available.tickets ? number(m.open) : 'Data Incomplete'} tone="red"/>
          <Card label="Pending Driver Confirmation" value={m.available.tickets ? number(m.pendingConfirmation) : 'Data Incomplete'} tone="amber"/>
          <Card label="Completed Tickets" value={m.available.tickets ? number(m.completed) : 'Data Incomplete'} tone="green"/>
          <Card label="Closed Tickets" value={m.available.tickets ? number(m.closed) : 'Data Incomplete'} tone="green"/>
          <Card label="Total Tickets" value={m.available.tickets ? number(m.tickets.length) : 'Data Incomplete'}/>
        </div>
        <div style={{marginTop:14}}><Table headers={['Ticket Status','Records']} rows={[
          ['Open',number(m.open)],['Pending Driver Confirmation',number(m.pendingConfirmation)],
          ['Completed',number(m.completed)],['Closed',number(m.closed)]
        ]}/></div>
      </Section>
      <Section title="Maintenance Delivery & Spending" subtitle={'Actual records dated July–December ' + m.year + '. Amounts use recorded ERP transaction fields; no baseline assumptions are included.'}>
        <div className="cards-grid">
          <Card label="Work Orders" value={m.available.workOrders ? number(m.periodWO.length) : 'Data Incomplete'} note={m.available.workOrders ? money(m.totalWorkOrderCost) : 'Source unavailable'} />
          <Card label="Projects" value={m.available.projects ? number(m.periodProjects.length) : 'Data Incomplete'} note={m.available.projects ? money(m.totalProjectSpend) : 'Source unavailable'}/>
          <Card label="Purchases" value={m.available.purchases ? number(m.periodPurchases.length) : 'Data Incomplete'} note={m.available.purchases ? money(m.totalPurchaseCost) : 'Source unavailable'}/>
          <Card label="Combined Recorded Spend" value={m.available.workOrders && m.available.projects && m.available.purchases ? money(m.totalWorkOrderCost+m.totalProjectSpend+m.totalPurchaseCost) : 'Data Incomplete'} note="Not a reconciled total cost of ownership"/>
        </div>
        <div style={{marginTop:14}}><Table headers={['Category','Transactions','Recorded Amount']} rows={[
          ['Work Orders',number(m.periodWO.length),money(m.totalWorkOrderCost)],
          ['Projects',number(m.periodProjects.length),money(m.totalProjectSpend)],
          ['Purchases',number(m.periodPurchases.length),money(m.totalPurchaseCost)]
        ]}/></div>
      </Section>
      <Section title="Preventive Maintenance" subtitle="Counts are taken from periodic_maintenance records returned by the ERP.">
        <div className="cards-grid">
          <Card label="Periodic Records" value={m.available.periodic ? number(m.periodic.length) : 'Data Incomplete'}/>
          <Card label="Completed" value={m.available.periodic ? number(m.pmCompleted) : 'Data Incomplete'} tone="green"/>
          <Card label="Pending / Other Status" value={m.available.periodic ? number(m.pmPending) : 'Data Incomplete'} tone="amber"/>
        </div>
        <div style={{marginTop:14}}><Table headers={['Maintenance Type','Records']} rows={Object.entries(m.periodic.reduce((acc,r)=>{const k=String(r.type||'Not specified').replaceAll('_',' ');acc[k]=(acc[k]||0)+1;return acc;},{})).map(([k,v])=>[k,number(v)])}/></div>
      </Section>
      <Section title="Driver Handovers" subtitle="Latest handover records from the driver handover register.">
        <div className="cards-grid"><Card label="Total Handovers" value={m.available.handovers ? number(m.handovers.length) : 'Data Incomplete'}/><Card label="Driver Master Records" value={m.available.drivers ? number(m.drivers.length) : 'Data Incomplete'}/></div>
        <div style={{marginTop:14}}><Table headers={['Date','Vehicle','Previous Driver','New Driver','Notes']} rows={m.handoverLatest.map(h=>[
          h.handover_date || h.handoverDate || '—',
          h.plate || h.vehicle_plate || h.vehiclePlate || h.vehicle_id || '—',
          h.previous_driver_name || h.previousDriverName || '—',
          h.new_driver_name || h.newDriverName || '—',
          h.notes || '—'
        ])}/></div>
      </Section>
      <Section title="Tire Services" subtitle="Live tire service requests. This is the request register, not a claim that every tire asset has been physically inspected.">
        <div className="cards-grid">
          <Card label="Tire Service Requests" value={m.available.tireRequests ? number(m.tireRequests.length) : 'Data Incomplete'}/>
          <Card label="Pending / In Progress" value={m.available.tireRequests ? number(m.tirePending) : 'Data Incomplete'} tone="amber"/>
          <Card label="Completed" value={m.available.tireRequests ? number(statusCountSafe(m.tireRequests,['completed'])) : 'Data Incomplete'} tone="green"/>
          <Card label="Rejected" value={m.available.tireRequests ? number(statusCountSafe(m.tireRequests,['rejected'])) : 'Data Incomplete'} tone="red"/>
        </div>
        <div style={{marginTop:14}}><Table headers={['Request','Vehicle','Type','Status','Date']} rows={m.tireRequests.slice(0,8).map(r=>[
          r.id || '—',r.plate || r.vehicle_plate || r.vehicle_id || '—',r.request_type || r.requestType || r.type || '—',statusBadge(r.status),r.created_at || r.createdAt || '—'
        ])}/></div>
      </Section>
      <Section title="Warehouse & Inventory" subtitle="Inventory quantities are shown only when the API exposes a recognized on-hand quantity field.">
        <div className="cards-grid">
          <Card label="Inventory Items" value={m.available.inventory ? number(m.inventory.length) : 'Data Incomplete'}/>
          <Card label="Total On-hand Quantity" value={!m.available.inventory || !m.inventory.some(x=>x.quantity!=null || x.on_hand!=null || x.stock_quantity!=null) ? 'Data Incomplete' : number(m.stockTotal)} note="Sum of available item quantities"/>
        </div>
        <div style={{marginTop:14}}><Table headers={['Item','SKU / Part','Unit','On Hand','Minimum']} rows={m.inventory.slice(0,10).map(x=>[
          x.name || x.item_name || x.description || '—',x.sku || x.part_number || x.code || '—',
          x.unit || x.uom || '—',x.quantity ?? x.on_hand ?? x.stock_quantity ?? 'Not supplied',x.minimum_stock ?? x.min_stock ?? x.reorder_level ?? '—'
        ])}/></div>
      </Section>
      <Section title="Fleet Distribution by Location" subtitle="Based on the location field in the live vehicle master.">
        <Table headers={['Location','Vehicles']} rows={Object.entries(m.siteMap).sort((a,b)=>b[1]-a[1]).map(([site,count])=>[site,number(count)])}/>
      </Section>
      <div style={{fontSize:11,color:'#98a2b3',marginTop:18}}>
        Data integrity note: all counts above are calculated from live API records. No manual KPI targets, estimated values, or financial baselines are inserted. Financial totals are recorded amounts only and may exclude costs not entered in the ERP.
      </div>
    </>}
  </div>;
}

function statusCountSafe(rows,statuses) {
  return rows.filter(r=>statuses.includes(String(r.status||'').trim().toLowerCase())).length;
}

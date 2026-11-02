import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const C = { navy: '10243A', blue: '1D4E89', teal: '0F9D91', gold: 'D7A84B', ink: '243447', muted: '64748B', pale: 'F3F6FA', white: 'FFFFFF', red: 'C84B4B' };
const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const money = n => fmt(n) + ' SAR';
const arr = (d, k) => Array.isArray(d?.[k]) ? d[k] : [];
const dateOf = r => r?.opened_at || r?.created_at || r?.completed_date || r?.date || r?.reported_date || null;
const startFor = p => { const d = new Date(); if (p === 'month') return new Date(d.getFullYear(), d.getMonth(), 1); if (p === 'quarter') return new Date(d.getFullYear(), d.getMonth() - 2, 1); if (p === 'half') return new Date(d.getFullYear(), d.getMonth() - 5, 1); if (p === 'year') return new Date(d.getFullYear(), 0, 1); return null; };
const periodName = p => ({ month: 'Current Month', quarter: 'Last 3 Months', half: 'Last 6 Months', year: 'Year to Date', all: 'All Available History' })[p];
const within = (r, start) => !start || !dateOf(r) || new Date(dateOf(r)) >= start;
const dateText = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

async function getList(path, key) {
  try { const r = await api.get(path, { timeout: 30000 }); return arr(r.data, key); }
  catch (e) { console.warn('Executive report source unavailable:', path, e?.response?.status || e.message); return []; }
}
function text(slide, value, x, y, w, h, opts = {}) {
  slide.addText(String(value ?? ''), { x, y, w, h, fontFace: 'Aptos', fontSize: 11, color: C.ink, margin: 0, valign: 'mid', fit: 'shrink', ...opts });
}
function base(pptx, title, subtitle) {
  const s = pptx.addSlide();
  s.background = { color: C.white };
  s.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.14, line: { color: C.teal, transparency: 100 }, fill: { color: C.teal } });
  text(s, title, 0.62, 0.4, 12, 0.42, { fontSize: 23, bold: true, color: C.navy });
  text(s, subtitle, 0.64, 0.88, 12, 0.24, { fontSize: 9, color: C.muted });
  s.addShape('line', { x: 0.62, y: 7.12, w: 12.05, h: 0, line: { color: 'DCE4EC', width: 0.8 } });
  text(s, 'MAADEN × IVANHOE ELECTRIC  |  FLEET ERP', 0.64, 7.18, 8.6, 0.16, { fontSize: 7, bold: true, color: C.muted, charSpacing: 1 });
  text(s, String(pptx._slides.length).padStart(2, '0'), 12.1, 7.16, 0.5, 0.18, { fontSize: 8, bold: true, color: C.teal, align: 'right' });
  return s;
}
function kpi(s, x, y, w, label, value, accent = C.blue) {
  s.addShape(pptxShape(s, 'roundRect'), { x, y, w, h: 1.05, rectRadius: 0.07, line: { color: 'E1E8EF', width: 0.7 }, fill: { color: C.pale } });
  s.addShape(pptxShape(s, 'rect'), { x, y, w: 0.07, h: 1.05, line: { color: accent, transparency: 100 }, fill: { color: accent } });
  text(s, label.toUpperCase(), x + 0.2, y + 0.12, w - 0.34, 0.18, { fontSize: 7.5, bold: true, color: C.muted, charSpacing: 0.5 });
  text(s, value, x + 0.2, y + 0.37, w - 0.34, 0.38, { fontSize: 20, bold: true, color: C.navy });
}
function pptxShape(slide, name) { return name; }
function bars(s, title, rows, x, y, w, maxRows = 7) {
  text(s, title, x, y, w, 0.25, { fontSize: 12, bold: true, color: C.navy });
  const data = rows.slice(0, maxRows), max = Math.max(1, ...data.map(r => Number(r.value) || 0));
  const rh = Math.min(0.52, 3.05 / Math.max(1, data.length));
  data.forEach((r, i) => {
    const yy = y + 0.38 + i * rh;
    text(s, r.label, x, yy, w * 0.29, 0.18, { fontSize: 8 });
    s.addShape('roundRect', { x: x + w * 0.31, y: yy + 0.025, w: w * 0.5, h: 0.13, rectRadius: 0.04, line: { color: 'E8EEF4', transparency: 100 }, fill: { color: 'E8EEF4' } });
    s.addShape('roundRect', { x: x + w * 0.31, y: yy + 0.025, w: Math.max(0.025, w * 0.5 * (Number(r.value || 0) / max)), h: 0.13, rectRadius: 0.04, line: { color: r.color || C.teal, transparency: 100 }, fill: { color: r.color || C.teal } });
    text(s, fmt(r.value), x + w * 0.84, yy, w * 0.16, 0.18, { fontSize: 8, bold: true, align: 'right', color: C.navy });
  });
}
function bullets(s, rows, x, y, w, step = 0.48) {
  rows.slice(0, 8).forEach((r, i) => {
    const yy = y + i * step;
    s.addShape('ellipse', { x, y: yy + 0.07, w: 0.085, h: 0.085, line: { color: C.teal, transparency: 100 }, fill: { color: C.teal } });
    text(s, r, x + 0.2, yy, w - 0.2, step - 0.02, { fontSize: 9, valign: 'top' });
  });
}

export default function GMDashboardExecutive() {
  const [period, setPeriod] = useState('quarter');
  const [data, setData] = useState({ vehicles: [], drivers: [], sites: [], tickets: [], periodic: [], inventory: [], transactions: [], lowStock: [] });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(null);
  const [sections, setSections] = useState({ fleet: true, maintenance: true, tickets: true, sites: true, warehouse: true });

  const load = async () => {
    setLoading(true); setError('');
    const [vehicles, drivers, sites, tickets, periodic, inventory, transactions, lowStock] = await Promise.all([
      getList('/vehicles', 'vehicles'), getList('/drivers', 'drivers'), getList('/sites', 'sites'),
      getList('/tickets', 'tickets'), getList('/periodic-maintenance?status=Completed', 'records'),
      getList('/inventory/by-site', 'items'), getList('/stock-transactions', 'transactions'),
      getList('/inventory/low-stock', 'items')
    ]);
    setData({ vehicles, drivers, sites, tickets, periodic, inventory, transactions, lowStock });
    setLoadedAt(new Date()); setLoading(false);
    if (![vehicles, drivers, sites, tickets, periodic, inventory, transactions, lowStock].some(a => a.length)) setError('No ERP records could be loaded. Check your permissions and refresh.');
  };
  useEffect(() => { load(); }, []);

  const start = useMemo(() => startFor(period), [period]);
  const tickets = data.tickets.filter(r => within(r, start));
  const periodic = data.periodic.filter(r => within(r, start));
  const open = tickets.filter(r => !['closed', 'completed', 'resolved'].includes(String(r.status || '').toLowerCase()));
  const closed = tickets.length - open.length;
  const maintTickets = tickets.filter(r => String(r.category || '').toLowerCase().includes('maintenance'));
  const urgent = data.vehicles.filter(v => /urgent|overdue/i.test(String(v.status || '')));
  const warning = data.vehicles.filter(v => /warning/i.test(String(v.status || '')));
  const safe = data.vehicles.filter(v => /safe|good|active/i.test(String(v.status || '')));
  const stockValue = data.inventory.reduce((n, r) => n + Number(r.quantity || 0) * Number(r.unit_cost || 0), 0);
  const stockUnits = data.inventory.reduce((n, r) => n + Number(r.quantity || 0), 0);
  const maintCost = [...maintTickets, ...periodic].reduce((n, r) => n + Number(r.final_cost ?? r.cost ?? 0), 0);
  const bySite = data.sites.map(site => ({ label: site.name || 'Unnamed', value: data.vehicles.filter(v => String(v.location || '').toLowerCase() === String(site.name || '').toLowerCase()).length })).filter(r => r.value).sort((a,b) => b.value-a.value);
  const byCategory = Object.entries(tickets.reduce((o,r) => { const k = r.category || 'Unclassified'; o[k] = (o[k] || 0) + 1; return o; }, {})).map(([label,value]) => ({label,value})).sort((a,b)=>b.value-a.value);
  const statusRows = [{label:'Urgent / overdue',value:urgent.length,color:C.red},{label:'Warning',value:warning.length,color:C.gold},{label:'Safe / active',value:safe.length,color:C.teal}];
  const toggle = key => setSections(prev => ({ ...prev, [key]: !prev[key] }));

  const generate = async () => {
    setGenerating(true); setError('');
    try {
      const pptxModule = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/+esm');
      const PptxGenJS = pptxModule.default;
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'Maaden Ivanhoe Electric JV'; pptx.company = 'Maaden Ivanhoe Electric JV';
      pptx.subject = 'Executive Fleet ERP Performance Review'; pptx.title = 'Executive Fleet & Operations Performance Review';
      pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };

      // Cover slide
      {
        const s = pptx.addSlide(); s.background = { color: C.navy };
        s.addShape('rect', { x: 0, y: 0, w: 0.2, h: 7.5, line: { color: C.teal, transparency: 100 }, fill: { color: C.teal } });
        s.addShape('rect', { x: 9.3, y: 0, w: 4.03, h: 7.5, line: { color: '183A58', transparency: 100 }, fill: { color: '183A58' } });
        text(s, 'MAADEN  ×  IVANHOE ELECTRIC', 0.9, 0.85, 8.5, 0.35, { fontSize: 13, bold: true, color: 'B8D9E5', charSpacing: 2 });
        text(s, 'EXECUTIVE\nPERFORMANCE REVIEW', 0.9, 2, 8.5, 1.55, { fontSize: 32, bold: true, color: C.white });
        text(s, 'Fleet, Maintenance, Operations & Warehouse', 0.92, 3.82, 8, 0.38, { fontSize: 16, color: 'D7E5EF' });
        s.addShape('line', { x: 0.92, y: 4.55, w: 5.6, h: 0, line: { color: C.gold, width: 2 } });
        text(s, periodName(period), 0.92, 4.85, 5.5, 0.3, { fontSize: 13, bold: true, color: C.white });
        text(s, 'Prepared from live Fleet ERP records', 0.92, 5.27, 7, 0.25, { fontSize: 10, color: 'B8C9D7' });
        text(s, 'Management Review  |  ' + dateText(new Date()), 0.92, 6.78, 7.5, 0.22, { fontSize: 9, color: 'B8C9D7' });
        text(s, 'CONFIDENTIAL', 10.1, 6.8, 2.2, 0.2, { fontSize: 8, bold: true, color: C.gold, align: 'right', charSpacing: 1.5 });
      }

      // Executive overview
      {
        const s = base(pptx, 'Executive Snapshot', 'A consolidated view of the operational indicators currently available in Fleet ERP.');
        kpi(s,.65,1.45,2.85,'Registered vehicles',fmt(data.vehicles.length),C.blue);
        kpi(s,3.72,1.45,2.85,'Drivers',fmt(data.drivers.length),C.teal);
        kpi(s,6.79,1.45,2.85,'Tickets in period',fmt(tickets.length),C.gold);
        kpi(s,9.86,1.45,2.8,'Open tickets',fmt(open.length),C.red);
        kpi(s,.65,2.78,2.85,'Maintenance records',fmt(maintTickets.length+periodic.length),C.teal);
        kpi(s,3.72,2.78,2.85,'Maintenance cost',money(maintCost),C.blue);
        kpi(s,6.79,2.78,2.85,'Inventory value',money(stockValue),C.gold);
        kpi(s,9.86,2.78,2.8,'Low-stock items',fmt(data.lowStock.length),C.red);
        text(s,'Management read-out',.68,4.25,5,.3,{fontSize:14,bold:true,color:C.navy});
        bullets(s,[
          data.vehicles.length+' vehicles and '+data.drivers.length+' drivers are registered in the ERP.',
          open.length+' tickets remain open or unresolved in the selected reporting window.',
          (maintTickets.length+periodic.length)+' fleet maintenance records are included.',
          'Inventory valuation uses current quantity multiplied by recorded unit cost.'
        ],.72,4.68,11.5,.43);
      }

      if (sections.fleet) {
        const s = base(pptx,'Fleet Status & Readiness','Vehicle status is summarized from the current status field stored in the ERP.');
        kpi(s,.68,1.42,2.8,'Total fleet',fmt(data.vehicles.length),C.blue);
        kpi(s,3.65,1.42,2.8,'Urgent / overdue',fmt(urgent.length),C.red);
        kpi(s,6.62,1.42,2.8,'Warning',fmt(warning.length),C.gold);
        kpi(s,9.59,1.42,2.8,'Safe / active',fmt(safe.length),C.teal);
        bars(s,'Vehicle status distribution',statusRows,.8,3,5.6);
        bars(s,'Vehicles by site — leading locations',bySite,6.8,3,5.6);
      }
      if (sections.maintenance) {
        const s = base(pptx,'Fleet Maintenance Performance',periodName(period)+' | Maintenance-category tickets and completed scheduled maintenance.');
        kpi(s,.68,1.42,2.8,'Maintenance tickets',fmt(maintTickets.length),C.blue);
        kpi(s,3.65,1.42,2.8,'Scheduled records',fmt(periodic.length),C.teal);
        kpi(s,6.62,1.42,2.8,'Recorded cost',money(maintCost),C.gold);
        kpi(s,9.59,1.42,2.8,'Average / record',money((maintTickets.length+periodic.length)?maintCost/(maintTickets.length+periodic.length):0),C.blue);
        const types = Object.entries([...maintTickets,...periodic].reduce((o,r)=>{const k=r.type||r.category||'Other';o[k]=(o[k]||0)+1;return o;},{})).map(([label,value])=>({label:String(label).replace(/_/g,' '),value})).sort((a,b)=>b.value-a.value);
        bars(s,'Maintenance records by type',types,.8,3,5.7);
        text(s,'Reporting notes',6.9,3,4,.3,{fontSize:12,bold:true,color:C.navy});
        bullets(s,['Ticket costs use final_cost or cost when available.','Scheduled records are loaded with Completed status.','Missing cost values are treated as zero and are not proof that work was free.'],6.92,3.42,5.3,.68);
      }
      if (sections.tickets) {
        const s = base(pptx,'Issue & Ticket Management',periodName(period)+' | Ticket volume, status and leading issue categories.');
        kpi(s,.68,1.42,2.8,'Total tickets',fmt(tickets.length),C.blue);
        kpi(s,3.65,1.42,2.8,'Open / unresolved',fmt(open.length),C.red);
        kpi(s,6.62,1.42,2.8,'Closed / resolved',fmt(closed),C.teal);
        kpi(s,9.59,1.42,2.8,'Closure rate',(tickets.length?Math.round(closed/tickets.length*100):0)+'%',C.gold);
        bars(s,'Tickets by category',byCategory,.8,3,5.7);
        const byStatus=Object.entries(tickets.reduce((o,r)=>{const k=r.status||'Unspecified';o[k]=(o[k]||0)+1;return o;},{})).map(([label,value])=>({label,value}));
        bars(s,'Ticket status breakdown',byStatus,6.8,3,5.7);
      }
      if (sections.sites) {
        const s = base(pptx,'Site Coverage & Distribution','Registered site list and fleet allocation based on each vehicle current location.');
        kpi(s,.68,1.42,2.8,'Registered sites',fmt(data.sites.length),C.blue);
        kpi(s,3.65,1.42,2.8,'Vehicles matched to sites',fmt(bySite.reduce((n,r)=>n+r.value,0)),C.teal);
        kpi(s,6.62,1.42,2.8,'Sites with fleet',fmt(bySite.length),C.gold);
        kpi(s,9.59,1.42,2.8,'Unmatched vehicles',fmt(Math.max(0,data.vehicles.length-bySite.reduce((n,r)=>n+r.value,0))),C.red);
        bars(s,'Vehicle allocation by site',bySite,.8,3,7);
        text(s,'Registered sites',8.25,3,3.7,.25,{fontSize:12,bold:true,color:C.navy});
        bullets(s,data.sites.map(r=>r.name||'Unnamed site'),8.25,3.38,4.1,.38);
      }
      if (sections.warehouse) {
        const s = base(pptx,'Warehouse & Inventory Position','Current stock balances, recorded valuation and inventory control alerts.');
        const inQty=data.transactions.filter(r=>String(r.type).toUpperCase()==='IN').reduce((n,r)=>n+Number(r.quantity||0),0);
        const outQty=data.transactions.filter(r=>String(r.type).toUpperCase()==='OUT').reduce((n,r)=>n+Number(r.quantity||0),0);
        kpi(s,.68,1.42,2.8,'Inventory lines',fmt(data.inventory.length),C.blue);
        kpi(s,3.65,1.42,2.8,'Units on hand',fmt(stockUnits),C.teal);
        kpi(s,6.62,1.42,2.8,'Estimated stock value',money(stockValue),C.gold);
        kpi(s,9.59,1.42,2.8,'Low-stock lines',fmt(data.lowStock.length),C.red);
        kpi(s,2.2,3.05,3.7,'Recorded IN quantity',fmt(inQty),C.teal);
        kpi(s,7.3,3.05,3.7,'Recorded OUT quantity',fmt(outQty),C.red);
        text(s,'Valuation note',.82,4.65,2,.25,{fontSize:12,bold:true,color:C.navy});
        text(s,'Estimated stock value = current quantity × unit cost. Transaction totals reflect the records returned by ERP and may cover a different date range from the selected reporting period.',.82,5.02,11.5,.72,{fontSize:10,color:C.muted,valign:'top'});
      }

      // Watchlist and scope notes
      {
        const s=base(pptx,'Management Attention & Next Actions','Priority items identified from the available ERP records.');
        text(s,'Operational watchlist',.78,1.45,5.4,.3,{fontSize:14,bold:true,color:C.navy});
        bullets(s,[
          urgent.length?urgent.length+' vehicles are marked urgent or overdue and require management follow-up.':'No vehicles are marked urgent or overdue in the loaded records.',
          open.length?open.length+' tickets remain open or unresolved in the selected reporting period.':'No open tickets were found in the selected reporting period.',
          data.lowStock.length?data.lowStock.length+' inventory items are at or below the low-stock threshold.':'No low-stock items were returned by the inventory service.'
        ],.82,1.9,11.4,.62);
        text(s,'Recommended management actions',.78,4.05,5.4,.3,{fontSize:14,bold:true,color:C.navy});
        bullets(s,['Review overdue vehicles and agree recovery dates with responsible supervisors.','Prioritize open tickets by operational impact, safety exposure and age.','Confirm replenishment plans for critical low-stock items.','Improve cost and completion data capture for consistent monthly reporting.'],.82,4.48,11.4,.48);
      }
      {
        const s=base(pptx,'Reporting Scope & Data Notes','Transparent scope: this presentation only includes data available in the full Fleet ERP.');
        text(s,'Included in this version',.82,1.48,5.3,.3,{fontSize:14,bold:true,color:C.teal});
        bullets(s,['Fleet vehicle master and driver records.','Vehicle tickets and completed periodic maintenance records.','Registered sites and fleet allocation.','Warehouse inventory, stock transactions and low-stock alerts.'],.86,1.9,5.5,.55);
        text(s,'Not yet connected',6.9,1.48,5.3,.3,{fontSize:14,bold:true,color:C.gold});
        bullets(s,['Building Maintenance is excluded until its separate module is migrated into the full Fleet ERP.','No building work orders, contractor costs, employee costs or invoices are estimated or fabricated.','After migration, approved Building Maintenance data can be added as a dedicated presentation section.'],6.94,1.9,5.45,.68);
        text(s,'Data refreshed: '+(loadedAt?loadedAt.toLocaleString():'at export')+'  |  Reporting window: '+periodName(period),.86,5.9,11.5,.25,{fontSize:9,color:C.muted});
        text(s,'Generated from ERP records available to the signed-in user at the time of export.',.86,6.28,11.5,.25,{fontSize:9,italic:true,color:C.muted});
      }

      await pptx.writeFile({ fileName: 'Executive_Fleet_ERP_Report_'+new Date().toISOString().slice(0,10)+'.pptx' });
    } catch (e) {
      console.error('PowerPoint generation failed',e);
      setError('PowerPoint generation failed: '+(e?.message||'Please try again.'));
    } finally { setGenerating(false); }
  };

  const selectedCount=Object.values(sections).filter(Boolean).length;
  const sectionOptions=[['fleet','🚗','Fleet status & readiness'],['maintenance','🔧','Fleet maintenance'],['tickets','🎫','Issues & tickets'],['sites','📍','Site coverage'],['warehouse','📦','Warehouse & inventory']];

  return <div style={{padding:22,maxWidth:1280,margin:'0 auto'}}>
    <div style={{background:'linear-gradient(120deg,#10243A 0%,#1D4E89 70%,#0F9D91 100%)',color:'#fff',borderRadius:16,padding:'28px 30px',marginBottom:20,boxShadow:'0 12px 30px rgba(16,36,58,.16)'}}>
      <div style={{fontSize:11,letterSpacing:2,opacity:.82,fontWeight:700}}>MAADEN × IVANHOE ELECTRIC JV</div>
      <h1 style={{margin:'10px 0 7px',fontSize:28}}>Executive Presentation Center</h1>
      <p style={{margin:0,maxWidth:760,color:'#DCEAF3',fontSize:14,lineHeight:1.6}}>Turn live Fleet ERP records into a polished, editable PowerPoint presentation for senior management.</p>
      <div style={{display:'flex',gap:9,flexWrap:'wrap',marginTop:18}}>{['16:9 executive layout','Editable charts & content','Live ERP data'].map(v=><span key={v} style={{background:'rgba(255,255,255,.13)',padding:'7px 11px',borderRadius:20,fontSize:11}}>{v}</span>)}</div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.3fr) minmax(300px,.7fr)',gap:18,alignItems:'start'}}>
      <section style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:22}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div><h2 style={{margin:0,color:'#10243A',fontSize:18}}>Presentation setup</h2><p style={{margin:'5px 0 0',color:'#64748B',fontSize:12}}>Choose the reporting window and sections to include.</p></div>
          <button onClick={load} disabled={loading||generating} style={{border:'1px solid #CBD5E1',background:'#fff',color:'#334155',borderRadius:8,padding:'9px 12px',fontWeight:600,cursor:'pointer'}}>↻ Refresh ERP data</button>
        </div>
        <label style={{display:'block',marginTop:22,marginBottom:7,fontSize:12,color:'#475569',fontWeight:700}}>REPORTING PERIOD</label>
        <select value={period} onChange={e=>setPeriod(e.target.value)} style={{width:'100%',maxWidth:360,padding:'11px 12px',border:'1px solid #CBD5E1',borderRadius:8,background:'#fff',color:'#1E293B',fontSize:14}}>
          <option value="month">Current Month</option><option value="quarter">Last 3 Months</option><option value="half">Last 6 Months</option><option value="year">Year to Date</option><option value="all">All Available History</option>
        </select>
        <div style={{marginTop:22,display:'flex',justifyContent:'space-between',alignItems:'center'}}><label style={{fontSize:12,color:'#475569',fontWeight:700}}>PRESENTATION SECTIONS</label><span style={{color:'#64748B',fontSize:11}}>{selectedCount} selected</span></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10,marginTop:10}}>
          {sectionOptions.map(([key,icon,label])=><label key={key} style={{display:'flex',alignItems:'center',gap:10,padding:12,border:'1px solid '+(sections[key]?'#99D5CE':'#E2E8F0'),background:sections[key]?'#F0FDFA':'#fff',borderRadius:9,cursor:'pointer',color:'#243447',fontSize:12,fontWeight:600}}><input type="checkbox" checked={sections[key]} onChange={()=>toggle(key)} style={{accentColor:'#0F9D91',width:16,height:16}}/><span style={{fontSize:17}}>{icon}</span>{label}</label>)}
        </div>
        {error&&<div style={{marginTop:16,padding:12,background:'#FEF2F2',color:'#991B1B',borderRadius:8,fontSize:12}}>{error}</div>}
        <button onClick={generate} disabled={loading||generating||selectedCount===0} style={{marginTop:22,width:'100%',border:0,borderRadius:10,padding:'15px 18px',background:loading||generating||selectedCount===0?'#94A3B8':'linear-gradient(90deg,#10243A,#1D4E89)',color:'#fff',fontSize:15,fontWeight:800,cursor:loading||generating?'wait':'pointer',boxShadow:'0 8px 18px rgba(29,78,137,.2)'}}>{generating?'Preparing your PowerPoint…':'⬇  Generate Executive PowerPoint'}</button>
        <p style={{margin:'9px 0 0',color:'#64748B',textAlign:'center',fontSize:11}}>Downloads an editable .pptx file. No paid AI service required.</p>
      </section>
      <aside style={{display:'grid',gap:14}}>
        <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:18}}>
          <h3 style={{margin:'0 0 12px',color:'#10243A',fontSize:15}}>ERP data connection</h3>
          { [['Vehicles',data.vehicles.length],['Drivers',data.drivers.length],['Sites',data.sites.length],['Tickets',data.tickets.length],['Scheduled maintenance',data.periodic.length],['Inventory lines',data.inventory.length],['Stock transactions',data.transactions.length],['Low-stock alerts',data.lowStock.length]].map(([label,count])=><div key={label} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'7px 0',borderBottom:'1px solid #F1F5F9',fontSize:12}}><span style={{color:'#475569'}}>{label}</span><strong style={{color:'#10243A',fontVariantNumeric:'tabular-nums'}}>{loading?'…':count}</strong></div>)}
          <div style={{marginTop:12,fontSize:10,color:'#64748B'}}>{loading?'Connecting to ERP…':loadedAt?'Last refreshed: '+loadedAt.toLocaleTimeString():'Not refreshed yet'}</div>
        </div>
        <div style={{background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:14,padding:17}}>
          <h3 style={{margin:'0 0 7px',color:'#92400E',fontSize:14}}>Building Maintenance — later phase</h3>
          <p style={{margin:0,color:'#78350F',fontSize:12,lineHeight:1.55}}>This module is not connected to the full ERP yet, so it is deliberately excluded. Once migrated, we can add work orders, contractors, employees, invoices and costs without mixing in unverified data.</p>
        </div>
        <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:14,padding:17}}>
          <h3 style={{margin:'0 0 7px',color:'#10243A',fontSize:14}}>Designed for management</h3>
          <p style={{margin:0,color:'#64748B',fontSize:12,lineHeight:1.55}}>Clean 16:9 slides, executive KPIs, editable visual charts, operational watchlist and clear reporting notes.</p>
        </div>
      </aside>
    </div>
    {loading&&<div style={{marginTop:16,color:'#64748B',fontSize:12}}>Loading available ERP records…</div>}
  </div>;
}

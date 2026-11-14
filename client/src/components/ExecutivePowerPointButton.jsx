import React, { useState } from 'react';

const fmt = v => Number(v || 0).toLocaleString('en-US');
const sar = v => 'SAR ' + Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function ExecutivePowerPointButton({ metrics }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generate = async () => {
    if (busy || !metrics) return;
    setBusy(true); setError('');
    try {
      const imported = await import(/* @vite-ignore */ 'https://esm.sh/pptxgenjs@3.12.0');
      const PptxGenJS = imported.default || imported.PptxGenJS;
      if (!PptxGenJS) throw new Error('PowerPoint engine unavailable');
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      pptx.author = 'Fleet Management';
      pptx.company = 'Maaden Ivanhoe Electric JV';
      pptx.subject = 'Live Fleet ERP Executive Dashboard';
      pptx.title = 'Fleet Management Executive Dashboard';
      pptx.lang = 'en-US';
      const C = { navy:'142B4A', navy2:'203E63', gold:'B69A58', ink:'25364B', muted:'64748B', bg:'F3F6FA', white:'FFFFFF', green:'16835D', amber:'C27A16', red:'B42318', line:'DCE3EC', pale:'E9EFF6' };
      const W=13.333, H=7.5, date=new Date().toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});
      const shape = pptx.ShapeType;
      const txt=(s,x,y,w,h,o={})=>({x,y,w,h,fontFace:'Aptos',fontSize:11,color:C.ink,margin:0,breakLine:false,fit:'shrink',...o});
      const header=(slide,kicker,title,sub,n)=>{
        slide.background={color:C.bg};
        slide.addShape(shape.rect,{x:0,y:0,w:W,h:.13,line:{color:C.gold,transparency:100},fill:{color:C.gold}});
        slide.addText('MA’ADEN  |  IVANHOE ELECTRIC JV',txt('' ,0.55,.32,8,.22,{fontSize:9,bold:true,color:C.gold,charSpacing:1.3}));
        slide.addText(title,txt('',.55,.72,12,.48,{fontFace:'Aptos Display',fontSize:25,bold:true,color:C.navy}));
        slide.addText(sub,txt('',.58,1.28,12,.28,{fontSize:10,color:C.muted}));
        slide.addShape(shape.line,{x:.55,y:6.98,w:12.2,h:0,line:{color:C.line,width:1}});
        slide.addText('FLEET ERP  •  EXECUTIVE REVIEW  •  '+date,txt('',.58,7.08,10,.15,{fontSize:7,color:C.muted}));
        slide.addText(String(n).padStart(2,'0')+' / 08',txt('',11.85,7.08,.85,.15,{fontSize:7,color:C.muted,align:'right'}));
      };
      const card=(slide,x,y,w,label,value,note,color=C.navy)=>{
        slide.addShape(shape.roundRect,{x,y,w,h:1.18,rectRadius:.08,line:{color:C.line,width:.7},fill:{color:C.white}});
        slide.addShape(shape.rect,{x,y,w:.055,h:1.18,line:{color,transparency:100},fill:{color}});
        slide.addText(label.toUpperCase(),txt('',x+.18,y+.16,w-.34,.18,{fontSize:8,bold:true,color:C.muted,charSpacing:.5}));
        slide.addText(String(value),txt('',x+.18,y+.42,w-.34,.42,{fontFace:'Aptos Display',fontSize:23,bold:true,color,fit:'shrink'}));
        slide.addText(note||'',txt('',x+.18,y+.91,w-.34,.15,{fontSize:8,color:C.muted}));
      };
      const panel=(slide,x,y,w,h,title)=>{
        slide.addShape(shape.roundRect,{x,y,w,h,rectRadius:.06,line:{color:C.line,width:.7},fill:{color:C.white}});
        slide.addText(title,txt('',x+.18,y+.15,w-.36,.22,{fontSize:10,bold:true,color:C.navy}));
      };
      const line=(slide,x,y,w,label,value,color=C.navy)=>{
        slide.addText(label,txt('',x,y,w*.57,.2,{fontSize:9,color:C.muted}));
        slide.addText(String(value),txt('',x+w*.58,y,w*.42,.2,{fontSize:9,bold:true,color,align:'right'}));
        slide.addShape(shape.line,{x,y:y+.29,w,h:0,line:{color:C.line,width:.5}});
      };
      const m=metrics, v=m.available?.vehicles?m.vehicles.length:null, drivers=m.available?.drivers?m.drivers.length:null;
      const open=m.supportOpen ?? m.open ?? 0, completed=m.completed ?? 0, closed=m.closed ?? 0;
      const totalTickets=Number(open)+Number(completed)+Number(closed);
      const vehicles=m.available?.vehicles?m.vehicles:[];
      const sites=m.siteMap?Object.entries(m.siteMap):[];
      const s1=pptx.addSlide(); header(s1,'','FLEET MANAGEMENT','Executive performance dashboard • Live production ERP data',1);
      s1.addText('CONTROLLED FLEET.\nMEASURED PERFORMANCE.',txt('',.65,1.85,6.2,1.35,{fontFace:'Aptos Display',fontSize:29,bold:true,color:C.navy,breakLine:false}));
      s1.addText('A management-level view of fleet readiness, maintenance control, driver accountability and operational risk.',txt('',.68,3.42,5.5,.65,{fontSize:13,color:C.muted,breakLine:false}));
      card(s1,.68,5.05,2.75,'Fleet vehicles',v===null?'Data incomplete':fmt(v),'Live vehicle master');
      card(s1,3.58,5.05,2.75,'Driver records',drivers===null?'Data incomplete':fmt(drivers),'Driver master');
      card(s1,6.48,5.05,2.75,'Open issue tickets',fmt(open),'Actionable support tickets',open?C.amber:C.green);
      card(s1,9.38,5.05,3.0,'PM completed',m.available?.periodic?fmt(m.pmCompleted):'Data incomplete','Preventive maintenance',C.green);
      s1.addText('REPORT GENERATED FROM LIVE FLEET ERP',txt('',7.15,2.25,5.1,.3,{fontSize:10,bold:true,color:C.gold,align:'right',charSpacing:1}));
      s1.addText('Maaden Ivanhoe Electric JV  |  Exploration Phase — Arabian Shield',txt('',7.15,2.68,5.1,.28,{fontSize:10,color:C.muted,align:'right'}));

      const s2=pptx.addSlide(); header(s2,'','Fleet Overview & Readiness','Fleet master, driver coverage and operational status',2);
      card(s2,.6,1.85,2.9,'Total fleet',v===null?'Data incomplete':fmt(v),'Registered vehicles');
      card(s2,3.65,1.85,2.9,'Drivers',drivers===null?'Data incomplete':fmt(drivers),'Driver master');
      card(s2,6.7,1.85,2.9,'Vehicles with KM',m.available?.vehicles?fmt(vehicles.filter(x=>Number(x.current_km||x.odometer||0)>0).length):'Data incomplete','Recorded odometer');
      card(s2,9.75,1.85,2.9,'Vehicle status: urgent',m.available?.vehicles?fmt(vehicles.filter(x=>['urgent','urgent overdue','overdue'].includes(String(x.status||'').toLowerCase())).length):'Data incomplete','Based on ERP vehicle status',C.amber);
      panel(s2,.6,3.35,6.0,3.25,'SITE DISTRIBUTION');
      if(sites.length) sites.slice(0,9).forEach(([site,count],i)=>line(s2,.85,3.85+i*.29,5.45,site,fmt(count)));
      else s2.addText('Site-level distribution is not available in this data response.',txt('',.9,4.1,5.2,.4,{color:C.muted}));
      panel(s2,6.85,3.35,5.88,3.25,'MANAGEMENT READING');
      ['Vehicle master is the source for fleet population.','Missing or unrecorded readings must not be interpreted as zero usage.','Vehicle availability requires operational status and current assignment evidence.'].forEach((t,i)=>s2.addText('0'+(i+1)+'   '+t,txt('',7.15,3.95+i*.72,5.2,.45,{fontSize:11,color:C.ink,breakLine:false})));

      const s3=pptx.addSlide(); header(s3,'','Maintenance Control','Actionable issue tickets separated from automated reminders and dedicated registers',3);
      card(s3,.6,1.85,2.9,'Open issue tickets',fmt(open),'Actionable maintenance / support',open?C.amber:C.green);
      card(s3,3.65,1.85,2.9,'Pending confirmation',fmt(m.pendingConfirmation||0),'Awaiting driver confirmation',C.amber);
      card(s3,6.7,1.85,2.9,'Completed tickets',fmt(completed),'ERP recorded');
      card(s3,9.75,1.85,2.9,'Closed tickets',fmt(closed),'ERP recorded');
      panel(s3,.6,3.35,12.05,3.1,'PREVENTIVE MAINTENANCE SCHEDULE');
      line(s3,.95,3.95,5.5,'Completed PM',fmt(m.pmCompleted||0),C.green);
      line(s3,.95,4.48,5.5,'Future scheduled',fmt(m.pmFutureScheduled||0));
      line(s3,.95,5.01,5.5,'Past-due schedule records',fmt(m.pmPastDue||0),m.pmPastDue?C.amber:C.green);
      line(s3,6.9,3.95,5.3,'Pending without date',fmt(m.pmUnscheduled||0),C.amber);
      line(s3,6.9,4.48,5.3,'Total PM records',m.available?.periodic?fmt(m.periodic?.length||0):'Data incomplete');
      s3.addText('Automated reminders, Daily KM prompts and tire requests are reported in their dedicated sections and excluded from actionable issue-ticket KPIs.',txt('',6.9,5.15,5.2,.65,{fontSize:9,color:C.muted,breakLine:false}));

      const s4=pptx.addSlide(); header(s4,'','Compliance, Oil & Driver Accountability','Inspection records, oil service and handover evidence',4);
      card(s4,.6,1.85,2.9,'6-month inspections',m.available?.vehicles?fmt(m.inspectionSixMonthCompleted||'—'):'Data incomplete','Completed records');
      card(s4,3.65,1.85,2.9,'Periodic inspections',m.available?.vehicles?fmt(m.inspectionPeriodicCompleted||'—'):'Data incomplete','Completed records');
      card(s4,6.7,1.85,2.9,'Oil change records',m.oilCount===undefined?'See oil register':fmt(m.oilCount),'Recorded oil services');
      card(s4,9.75,1.85,2.9,'Driver handovers',m.available?.handovers?fmt(m.handovers.length):'Data incomplete','Recorded handover events');
      panel(s4,.6,3.35,5.85,3.1,'CONTROL REQUIREMENTS');
      ['Inspection completion must be evidenced in the ERP.','Oil service interval: 5,000 km.','Driver handover must identify outgoing and incoming drivers.'].forEach((t,i)=>s4.addText('•  '+t,txt('',.9,3.95+i*.65,5.1,.42,{fontSize:10,breakLine:false})));
      panel(s4,6.7,3.35,5.95,3.1,'DATA QUALITY SIGNALS');
      line(s4,7.0,3.95,5.3,'Handover records',m.available?.handovers?fmt(m.handovers.length):'Data incomplete');
      line(s4,7.0,4.48,5.3,'Vehicles without KM',m.available?.vehicles?fmt(vehicles.filter(x=>!Number(x.current_km||x.odometer||0)).length):'Data incomplete',C.amber);
      s4.addText('Where source data is unavailable, the presentation labels the measure as Data Incomplete rather than estimating a result.',txt('',7,5.2,5.2,.55,{fontSize:9,color:C.muted}));

      const s5=pptx.addSlide(); header(s5,'','Tire Services & Warehouse Control','Dedicated tire requests and available stock balances',5);
      card(s5,.6,1.85,2.9,'Tire requests',m.available?.tireRequests?fmt(m.tireRequests.length):'Data incomplete','Request register');
      card(s5,3.65,1.85,2.9,'Pending / in progress',m.available?.tireRequests?fmt(m.tirePending||0):'Data incomplete','Awaiting action',C.amber);
      card(s5,6.7,1.85,2.9,'Completed requests',m.available?.tireRequests?fmt(m.tireRequests.filter(x=>String(x.status||'').toLowerCase()==='completed').length):'Data incomplete','ERP recorded',C.green);
      card(s5,9.75,1.85,2.9,'Available stock',m.available?.stockSites?fmt(m.stockTotal):'Data incomplete','Units across stock sites');
      panel(s5,.6,3.35,12.05,3.1,'WAREHOUSE BALANCE BY SITE');
      const stock=m.stockSites||[];
      if(stock.length) stock.slice(0,8).forEach((r,i)=>line(s5,.95,3.88+i*.29,11.3,r.site||'Unknown',fmt(r.available)));
      else s5.addText('Warehouse balance by site is not available.',txt('',.95,4.1,10,.3,{color:C.muted}));

      const s6=pptx.addSlide(); header(s6,'','Executive Risk & Management Priorities','Priorities derived from incomplete controls and live ERP indicators',6);
      panel(s6,.6,1.85,5.9,4.8,'MANAGEMENT ATTENTION');
      const risks=[
        [open?'Review and assign open issue tickets':'No actionable open issue tickets currently recorded',open?C.amber:C.green],
        [(m.pmPastDue||0)+' past-due PM schedule record(s) require validation',m.pmPastDue?C.amber:C.green],
        ['Complete missing odometer / KM records',C.amber],
        ['Ensure every handover includes both drivers and confirmation evidence',C.amber],
        ['Record tire lifecycle movements and unit costs',C.amber]
      ];
      risks.forEach((r,i)=>{s6.addShape(shape.ellipse,{x:.92,y:2.45+i*.72,w:.13,h:.13,line:{color:r[1],transparency:100},fill:{color:r[1]}});s6.addText(r[0],txt('',1.2,2.39+i*.72,4.9,.42,{fontSize:10,breakLine:false}));});
      panel(s6,6.8,1.85,5.85,4.8,'NEXT 30-DAY ACTION PLAN');
      ['Validate overdue schedules and ownership.','Close data gaps in vehicle KM and handovers.','Reconcile tire receipts, issues and balances.','Capture cost evidence before closing work.','Review operational KPIs monthly with site owners.'].forEach((t,i)=>{s6.addText('0'+(i+1),txt('',7.1,2.42+i*.72,.38,.22,{fontSize:10,bold:true,color:C.gold}));s6.addText(t,txt('',7.65,2.39+i*.72,4.5,.42,{fontSize:10,breakLine:false}));});

      const s7=pptx.addSlide(); header(s7,'','Operational Performance Summary','A concise scorecard for executive review',7);
      const rows=[
        ['Actionable open issue tickets',fmt(open),'0','Live / on refresh',open===0?'On track':'Action required'],
        ['Completed issue tickets',fmt(completed),'Not configured','Monthly','Data recorded'],
        ['PM completed',fmt(m.pmCompleted||0),'Not configured','Monthly','Data recorded'],
        ['Past-due PM schedules',fmt(m.pmPastDue||0),'0','Weekly',m.pmPastDue?'Action required':'On track'],
        ['Tire requests pending',m.available?.tireRequests?fmt(m.tirePending||0):'Data Incomplete','Not configured','Weekly','Data Incomplete'],
        ['Fleet vehicle records',v===null?'Data Incomplete':fmt(v),'39*','Monthly',v===null?'Data Incomplete':'See master']
      ];
      s7.addTable([['MANAGEMENT KPI','ACTUAL','TARGET','FREQUENCY','STATUS'],...rows],{x:.65,y:2.0,w:12.0,h:3.65,border:{type:'solid',color:C.line,pt:.6},fill:C.white,color:C.ink,fontFace:'Aptos',fontSize:10,margin:.12,rowH:.5,autoFit:false,columns:[{w:3.55},{w:1.65},{w:1.65},{w:2.0},{w:3.15}]});
      s7.addText('* Fleet target shown as 39 based on the current master reference. KPI targets not configured in ERP are explicitly marked Not configured; no performance target is invented.',txt('',.75,5.95,11.6,.55,{fontSize:9,color:C.muted,breakLine:false}));
      s7.addText('CONTROLLED FLEET.  MEASURED PERFORMANCE.',txt('',.75,6.45,11.5,.3,{fontSize:16,bold:true,color:C.navy,align:'center'}));

      const file='Fleet_Management_Executive_Dashboard_'+new Date().toISOString().slice(0,10)+'.pptx';
      await pptx.writeFile({fileName:file});
    } catch(e) {
      console.error('Executive dashboard export failed',e);
      setError('PowerPoint generation failed: '+(e?.message||'Please retry.'));
    } finally { setBusy(false); }
  };
  return <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
    <button className="btn" onClick={generate} disabled={busy||!metrics} style={{background:'linear-gradient(135deg,#172b4d,#315b82)',color:'#fff',border:'1px solid #b69a58',fontWeight:800,padding:'10px 16px',boxShadow:'0 5px 16px rgba(23,43,77,.18)'}}>
      {busy?'Building Executive Dashboard…':'⬇ Generate Executive PowerPoint'}
    </button>
    {error&&<span style={{color:'#b42318',fontSize:12}}>{error}</span>}
  </div>;
}

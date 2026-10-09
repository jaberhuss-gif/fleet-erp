import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const initial = { site:'', category:'General Maintenance', priority:'Medium', description:'' };
const field = { display:'flex', flexDirection:'column', gap:5, minWidth:0 };
const control = { width:'100%', boxSizing:'border-box', padding:'10px', border:'1px solid #cbd5e1', borderRadius:7, background:'#fff' };
const btn = { padding:'9px 13px', border:0, borderRadius:7, cursor:'pointer', fontWeight:700 };
const statusColor = s => s==='Closed' || s==='Operationally Completed' ? '#dcfce7' : s==='Reopened' ? '#fee2e2' : '#fef3c7';

export default function BuildingMaintenanceWorkflow({ user }) {
  const [form,setForm] = useState(initial);
  const [sites,setSites] = useState([]);
  const [requests,setRequests] = useState([]);
  const [employees,setEmployees] = useState([]);
  const [contractors,setContractors] = useState([]);
  const [assign,setAssign] = useState({});
  const [finance,setFinance] = useState({});
  const [audit,setAudit] = useState({});
  const [query,setQuery] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const canWork = user?.role === 'Owner' || user?.role === 'Manager' || user?.role === 'Admin' || !!user?.access?.building?.can_work;

  const load = async () => {
    setError('');
    try {
      const [s,r,e] = await Promise.all([
        api.get('/sites'), api.get('/maintenance-requests'), api.get('/maintenance-requests/executors')
      ]);
      setSites(s.data.sites || []);
      setRequests(r.data.requests || []);
      setEmployees(e.data.employees || []);
      setContractors(e.data.contractors || []);
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const visible = useMemo(() => {
    const q=query.trim().toLowerCase();
    return requests.filter(r => !q || [r.request_no,r.site,r.category,r.requester_name,r.executor_name,r.status,r.description].some(v=>String(v||'').toLowerCase().includes(q)));
  },[requests,query]);
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const r=await api.post('/maintenance-requests',form);
      setMessage('Created / تم إنشاء الطلب: '+(r.data.request?.request_no || 'Maintenance Request')+'. Email notification: '+(r.data.email?.sent?'sent / تم الإرسال':'not sent / لم يُرسل — '+(r.data.email?.reason||'check configuration')));
      setForm(initial); await load();
    } catch(e) { setError(e.response?.data?.error||e.message); }
    finally { setBusy(false); }
  };
  const chooseType = (id,type) => setAssign(p=>({...p,[id]:{type,name:'',email:''}}));
  const chooseExecutor = (id,name) => {
    const a=assign[id]||{}, list=a.type==='Contractor'?contractors:employees;
    const x=list.find(v=>(v.name||v.full_name)===name);
    setAssign(p=>({...p,[id]:{...a,name,email:x?.email||''}}));
  };
  const assignRequest = async id => {
    const a=assign[id]||{};
    if(!a.type||!a.name) { setError('Select an executor / اختر المنفذ أولاً.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const r=await api.post('/maintenance-requests/'+id+'/assign',{executorType:a.type,executorName:a.name,executorEmail:a.email});
      const sent=!!r.data.email?.sent;
      setMessage((r.data.request?.request_no||'Request')+' assigned / تم التعيين. '+(sent?'Email sent / تم إرسال البريد.':'Email NOT sent / البريد لم يُرسل: '+(r.data.email?.reason||'unknown error')));
      await load();
    } catch(e) { setError(e.response?.data?.error||e.message); }
    finally { setBusy(false); }
  };
  const resend = async id => {
    setBusy(true); setError(''); setMessage('');
    try { const r=await api.post('/maintenance-requests/'+id+'/resend-email'); setMessage(r.data.email?.sent?'Email sent / تم إرسال البريد.':'Email not sent / لم يُرسل: '+(r.data.email?.reason||'unknown error')); await load(); }
    catch(e) { setError(e.response?.data?.error||e.message); }
    finally { setBusy(false); }
  };
  const close = async r => {
    const f=finance[r.id]||{};
    if(String(f.amount??'').trim()==='' || !Number.isFinite(Number(f.amount)) || Number(f.amount)<0) { setError('Enter final cost, including 0 SAR / أدخل التكلفة النهائية، حتى لو صفر.'); return; }
    setBusy(true); setError(''); setMessage('');
    try { await api.post('/maintenance-requests/'+r.id+'/financial-close',{action:'close',amount:Number(f.amount),notes:f.notes||''}); setMessage('Closed / تم إغلاق '+r.request_no); await load(); }
    catch(e) { setError(e.response?.data?.error||e.message); }
    finally { setBusy(false); }
  };
  const showAudit = async id => {
    try { const r=await api.get('/maintenance-requests/'+id+'/audit'); setAudit(p=>({...p,[id]:r.data.events||[]})); }
    catch(e) { setError(e.response?.data?.error||e.message); }
  };
  const panel={background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:16,boxShadow:'0 1px 3px #0f172a0a'};
  if(loading) return <div className="panel">Loading Maintenance Intake & Dispatch… / جارٍ تحميل طلبات الصيانة…</div>;
  return <div style={{display:'grid',gap:14}}>
    <div style={{...panel,background:'linear-gradient(120deg,#0f766e,#12304a)',color:'#fff'}}>
      <div style={{fontSize:12,letterSpacing:1,opacity:.85}}>BUILDING MAINTENANCE • INTAKE & DISPATCH</div>
      <h2 style={{margin:'5px 0 8px'}}>📨 Maintenance Intake & Dispatch</h2>
      <div>Receive → Assign → Acknowledge → Repair → Requester confirmation → Final closure</div>
      <div dir="rtl" style={{marginTop:5}}>استقبال الطلب ← تعيين المنفذ ← تأكيد الاستلام ← الإصلاح ← تأكيد مقدم الطلب ← الإغلاق النهائي</div>
    </div>
    {message&&<div role="status" style={{...panel,background:'#ecfdf5',color:'#166534'}}>{message}</div>}
    {error&&<div role="alert" style={{...panel,background:'#fef2f2',color:'#991b1b'}}>{error}</div>}
    <form onSubmit={submit} style={panel}>
      <h3 style={{marginTop:0}}>📝 New maintenance request / طلب صيانة جديد</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
        <label style={field}>City / المدينة
          <input style={control} value={form.city||''} onChange={e=>setForm(p=>({...p,city:e.target.value}))} placeholder="Enter city / أدخل المدينة"/>
        </label>
        <label style={field}>Camp / Site / الكامب أو الموقع
          <select style={control} required value={form.site} onChange={e=>setForm(p=>({...p,site:e.target.value}))}><option value="">Select site / اختر الموقع</option>{sites.map(s=><option key={s.id||s.name} value={s.name}>{s.name}</option>)}</select>
        </label>
        <label style={field}>Work type / نوع العمل
          <select style={control} value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}><option>General Maintenance</option><option>Electrical</option><option>Plumbing & Water</option><option>A/C & HVAC</option><option>Doors, Locks & Windows</option><option>Civil & Building</option><option>Furniture & Facilities</option><option>Vehicle Maintenance</option><option>Other</option></select>
        </label>
        <label style={field}>Priority / الأولوية
          <select style={control} value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select>
        </label>
      </div>
      <label style={{...field,marginTop:12}}>Issue description / وصف المشكلة
        <textarea style={{...control,minHeight:100,resize:'vertical'}} required value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="Describe the issue clearly / اشرح المشكلة بوضوح"/>
      </label>
      <div style={{marginTop:12,fontSize:13,color:'#64748b'}}>Requester is recorded from the signed-in ERP account. / يتم تسجيل مقدم الطلب من حساب النظام الحالي.</div>
      <button disabled={busy} className="btn btn-primary" style={{...btn,marginTop:12,background:'#0f766e',color:'#fff'}}>{busy?'Please wait…':'Create request / إنشاء الطلب'}</button>
    </form>
    <section style={panel}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div><h3 style={{margin:'0 0 4px'}}>📋 Maintenance Register / سجل طلبات الصيانة</h3><div style={{fontSize:13,color:'#64748b'}}>Search tickets, assign executor, check history and follow closure.</div></div>
        <button type="button" style={btn} onClick={load}>↻ Refresh / تحديث</button>
      </div>
      <input style={{...control,marginTop:12,maxWidth:460}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search ticket, site, requester, executor… / بحث"/>
      <div style={{display:'grid',gap:12,marginTop:14}}>
        {!visible.length&&<div style={{padding:18,background:'#f8fafc',borderRadius:8}}>No requests found / لا توجد طلبات.</div>}
        {visible.map(r=>{
          const a=assign[r.id]||{}, list=a.type==='Contractor'?contractors:employees;
          const assignable=['New','Reopened'].includes(r.status);
          const awaitingFinal=r.requester_confirmation==='yes'&&['Operationally Completed','Open'].includes(r.status);
          return <article key={r.id} style={{border:'1px solid #cbd5e1',borderRadius:10,padding:14}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div><strong style={{fontSize:16}}>{r.request_no}</strong><div style={{marginTop:5}}><b>{r.site||'Site pending'}</b> · {r.category} · {r.priority}</div><div style={{marginTop:8,whiteSpace:'pre-wrap'}}>{r.description}</div><div style={{fontSize:12,color:'#64748b',marginTop:7}}>Requester / مقدم الطلب: {r.requester_name||'-'} {r.requester_email?'· '+r.requester_email:''}</div></div>
              <div style={{alignSelf:'flex-start',background:statusColor(r.status),borderRadius:20,padding:'6px 10px',fontWeight:700,fontSize:12}}>{r.status}</div>
            </div>
            {assignable&&canWork&&<div style={{display:'grid',gridTemplateColumns:'minmax(150px,190px) minmax(200px,1fr) auto',gap:8,alignItems:'end',marginTop:12}}>
              <label style={field}>Executor type / نوع المنفذ<select style={control} value={a.type||''} onChange={e=>chooseType(r.id,e.target.value)}><option value="">Select / اختر</option><option>Our Employee</option><option>Contractor</option></select></label>
              <label style={field}>Executor / اسم المنفذ<select style={control} value={a.name||''} disabled={!a.type} onChange={e=>chooseExecutor(r.id,e.target.value)}><option value="">Select executor / اختر المنفذ</option>{list.map(x=><option key={x.id||x.email} value={x.name||x.full_name}>{x.name||x.full_name}{x.email?' — '+x.email:''}</option>)}</select></label>
              <button disabled={busy} style={{...btn,background:'#0f766e',color:'#fff'}} onClick={()=>assignRequest(r.id)}>Assign & email / تعيين وإرسال</button>
            </div>}
            {r.work_order_id&&<div style={{marginTop:12,padding:10,background:'#f8fafc',borderRadius:8}}>
              <b>Workflow / مراحل الطلب</b>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:6,marginTop:8}}>
                {[['1. Report / الطلب',true],['2. Assigned / التعيين',!!r.work_order_id],['3. Acknowledged / الاستلام',!!r.acknowledged_at],['4. Completed / الإصلاح',!!r.completed_at],['5. Requester confirmed / تأكيد الكامب',!!r.requester_confirmed_at]].map(([t,ok])=><div key={t} style={{padding:8,borderRadius:7,textAlign:'center',fontSize:12,background:ok?'#dcfce7':'#f1f5f9',color:ok?'#166534':'#475569'}}>{ok?'✓':'○'} {t}</div>)}
              </div>
              <div style={{fontSize:13,marginTop:8}}>Executor / المنفذ: <b>{r.executor_name||'-'}</b> · Work Order: #{r.work_order_id}</div>
              {r.status==='Assigned'&&!r.acknowledged_at&&<button style={{...btn,marginTop:8}} onClick={()=>resend(r.id)}>Resend assignment email / إعادة إرسال البريد</button>}
            </div>}
            {awaitingFinal&&canWork&&<div style={{marginTop:12,padding:12,background:'#ecfdf5',borderRadius:8}}>
              <b>Final cost & closure / التكلفة والإغلاق</b>
              <div style={{display:'grid',gridTemplateColumns:'minmax(140px,200px) minmax(180px,1fr) auto',gap:8,alignItems:'end',marginTop:8}}>
                <label style={field}>Final cost (SAR) / التكلفة النهائية<input style={control} type="number" min="0" step="0.01" value={finance[r.id]?.amount??''} onChange={e=>setFinance(p=>({...p,[r.id]:{...(p[r.id]||{}),amount:e.target.value}}))} placeholder="0.00"/></label>
                <label style={field}>Notes / ملاحظات<input style={control} value={finance[r.id]?.notes||''} onChange={e=>setFinance(p=>({...p,[r.id]:{...(p[r.id]||{}),notes:e.target.value}}))}/></label>
                <button style={{...btn,background:'#15803d',color:'#fff'}} disabled={busy} onClick={()=>close(r)}>Close ticket / إغلاق التذكرة</button>
              </div>
            </div>}
            {r.status==='Closed'&&<div style={{marginTop:10,color:'#166534',fontWeight:700}}>CLOSED / مغلقة · Final cost / التكلفة: SAR {Number(r.final_amount||0).toFixed(2)}</div>}
            <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
              <button style={btn} onClick={()=>showAudit(r.id)}>View audit trail / سجل الإجراءات</button>
              {r.executor_email&&<button style={btn} onClick={()=>GenUI.openUrl('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent([r.requester_email,r.executor_email].filter(Boolean).join(','))+'&su='+encodeURIComponent('Maintenance '+r.request_no))}>Prepare email / تجهيز البريد</button>}
              {r.requester_email&&<button style={btn} onClick={()=>GenUI.openUrl('https://wa.me/?text='+encodeURIComponent('Maintenance '+r.request_no+': repair completion needs confirmation. / طلب الصيانة '+r.request_no+': يرجى تأكيد اكتمال الإصلاح.'))}>Prepare WhatsApp / تجهيز واتساب</button>}
            </div>
            {audit[r.id]&&<div style={{marginTop:10,padding:10,background:'#f8fafc',borderRadius:8}}><b>Audit trail / سجل الإجراءات</b>{!audit[r.id].length?<div>No events / لا توجد أحداث مسجلة.</div>:audit[r.id].map(ev=><div key={ev.id} style={{padding:'7px 0',borderBottom:'1px solid #e2e8f0',fontSize:13}}><b>{ev.action}</b> · {ev.actor_name||ev.actor_type} · {new Date(ev.created_at).toLocaleString()}</div>)}</div>}
          </article>;
        })}
      </div>
    </section>
    <div style={{fontSize:12,color:'#64748b'}}>Email and WhatsApp buttons prepare a message only unless the corresponding provider is configured. Automated WhatsApp delivery is not claimed here. / أزرار البريد والواتساب تجهّز الرسالة فقط ما لم يتم إعداد مزوّد الإرسال؛ لا ندّعي أن الواتساب الآلي مفعّل.</div>
  </div>;
}

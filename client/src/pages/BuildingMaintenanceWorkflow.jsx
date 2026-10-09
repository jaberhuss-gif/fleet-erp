import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const initial = { city:'', site:'', category:'General Maintenance', priority:'Medium', description:'' };
const blankContact = { contact_role:'Campus Manager', full_name:'', city:'', site:'', work_type:'', email:'', phone:'', whatsapp:'', notes:'', active:true };
const field = { display:'flex', flexDirection:'column', gap:5, minWidth:0 };
const control = { width:'100%', boxSizing:'border-box', padding:'10px', border:'1px solid #cbd5e1', borderRadius:7, background:'#fff' };
const btn = { padding:'9px 13px', border:0, borderRadius:7, cursor:'pointer', fontWeight:700 };
function parseMaintenanceEmail(raw) {
  let text = String(raw || '').replace(/=\r?\n/g, '').replace(/=3D/gi, '=').replace(/=20/gi, ' ');
  const plainPart = text.match(/Content-Type:\s*text\/plain[^\n]*[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--[-_A-Za-z0-9]+|$)/i);
  if (plainPart) text = plainPart[1];
  text = text.replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/^(From|To|Cc|Bcc|Subject|Date|Sent|Received|MIME-Version|Content-Type|Content-Transfer-Encoding):.*$/gim,' ')
    .replace(/^[=\-_]{5,}.*$/gm,' ').replace(/\r/g,'');
  const parts = text.split(/\n|(?=\b\d+\s*[-.)])|(?<=[.!?؟])\s+/).map(x=>x.replace(/^\s*\d+\s*[-.)]\s*/, '').replace(/^[-*•\s]+/,'').trim()).filter(x=>x.length>8);
  const rules = [
    {category:'Plumbing & Water',priority:'High',re:/\b(water leak|leaking|leakage|pipe burst|drain|tap|faucet|toilet|water supply)\b|تسرب|تسريب|ماسورة|أنبوب|مياه|ماء|صرف صحي/i},
    {category:'A/C & HVAC',priority:'High',re:/\b(a\/?c|air.?condition|hvac|cooling|not cool|refrigerat|thermostat)\b|تكييف|مكيف|تبريد/i},
    {category:'Electrical',priority:'High',re:/\b(electrical|electricity|power outage|wiring|socket|outlet|breaker|light not|lamp|short circuit)\b|كهرباء|تماس|قاطع|إنارة|مصباح/i},
    {category:'Doors, Locks & Windows',priority:'Medium',re:/\b(door|lock|key|window|hinge)\b|باب|قفل|نافذة|شباك/i},
    {category:'Civil & Building',priority:'Medium',re:/\b(ceiling|wall|roof|floor|crack|paint|tiles|plaster)\b|سقف|جدار|حائط|أرضية|تشققات|دهان|بلاط/i},
    {category:'Furniture & Facilities',priority:'Low',re:/\b(furniture|chair|desk|bed|cabinet|curtain)\b|أثاث|كرسي|مكتب|سرير|خزانة|ستارة/i}
  ];
  const candidates = parts.length ? parts : [text.trim()];
  const found = [];
  for (const part of candidates) {
    const rule = rules.find(x=>x.re.test(part));
    if (rule && !found.some(x=>x.description.toLowerCase()===part.toLowerCase())) found.push({description:part,category:rule.category,priority:rule.priority});
  }
  if (!found.length && text.trim()) found.push({description:text.trim().slice(0,4000),category:'General Maintenance',priority:'Medium'});
  return {text:text.trim(),issues:found};
}
const statusColor = s => s==='Closed' || s==='Operationally Completed' ? '#dcfce7' : s==='Reopened' ? '#fee2e2' : '#fef3c7';

export default function BuildingMaintenanceWorkflow({ user }) {
  const [form,setForm] = useState(initial);
  const [sites,setSites] = useState([]);
  const [requests,setRequests] = useState([]);
  const [employees,setEmployees] = useState([]);
  const [contractors,setContractors] = useState([]);
  const [contacts,setContacts] = useState([]);
  const [contactForm,setContactForm] = useState(blankContact);
  const [editingContact,setEditingContact] = useState(null);
  const [emailFileName,setEmailFileName] = useState('');
  const [emailIssues,setEmailIssues] = useState([]);
  const [emailText,setEmailText] = useState('');
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
      const [s,r,e,c] = await Promise.all([
        api.get('/sites'), api.get('/maintenance-requests'), api.get('/maintenance-requests/executors'), api.get('/maintenance-requests/config/contacts')
      ]);
      setSites(s.data.sites || []);
      setRequests(r.data.requests || []);
      const savedContacts = c.data.contacts || [];
      const configuredEmployees = savedContacts.filter(x => x.active !== false && /Our Employee|Technician/i.test(x.contact_role)).map(x => ({id:'directory-'+x.id, full_name:x.full_name, name:x.full_name, email:x.email || '', whatsapp:x.whatsapp || '', city:x.city || '', site:x.site || '', work_type:x.work_type || ''}));
      const configuredContractors = savedContacts.filter(x => x.active !== false && /Contractor|Vendor/i.test(x.contact_role)).map(x => ({id:'directory-'+x.id, full_name:x.full_name, name:x.full_name, email:x.email || '', whatsapp:x.whatsapp || '', city:x.city || '', site:x.site || '', work_type:x.work_type || ''}));
      setEmployees([...(e.data.employees || []), ...configuredEmployees]);
      setContractors([...(e.data.contractors || []), ...configuredContractors]);
      setContacts(savedContacts);
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const visible = useMemo(() => {
    const q=query.trim().toLowerCase();
    return requests.filter(r => !q || [r.request_no,r.site,r.category,r.requester_name,r.executor_name,r.status,r.description].some(v=>String(v||'').toLowerCase().includes(q)));
  },[requests,query]);
  const readEmailFile = async e => {
    const file=e.target.files?.[0]; if(!file) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const raw=await file.text();
      const parsed=parseMaintenanceEmail(raw);
      setEmailFileName(file.name); setEmailText(parsed.text); setEmailIssues(parsed.issues);
      if(!parsed.issues.length) setError('No maintenance issue was detected. Please check the email file.');
      else setMessage('Email read. Review the detected issues below before creating tickets. / تمت قراءة البريد؛ راجع الأعطال المكتشفة قبل إنشاء التذاكر.');
    } catch(err) { setError('Could not read this email file. Please use .eml, .txt or .html. / تعذرت قراءة الملف.'); }
    finally { setBusy(false); e.target.value=''; }
  };
  const createDetectedTickets = async () => {
    if(!emailIssues.length) return;
    if(!form.site) { setError('Select the site / اختر الموقع أولاً.'); return; }
    setBusy(true); setError(''); setMessage('');
    const created=[];
    try {
      for(const issue of emailIssues) {
        const res=await api.post('/maintenance-requests',{city:form.city,site:form.site,category:issue.category,priority:issue.priority,description:issue.description+'\n\nSource email: '+emailFileName});
        created.push(res.data.request?.request_no||'');
      }
      setMessage('Created '+created.length+' tickets: '+created.filter(Boolean).join(', ')+'. / تم إنشاء '+created.length+' تذاكر من البريد.');
      setEmailIssues([]); setEmailText(''); setEmailFileName(''); await load();
    } catch(err) {
      setError('Some tickets may have been created: '+created.filter(Boolean).join(', ')+'. '+(err.response?.data?.error||err.message));
      await load();
    } finally { setBusy(false); }
  };
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const r=await api.post('/maintenance-requests',form);
      setMessage('Created / تم إنشاء الطلب: '+(r.data.request?.request_no || 'Maintenance Request')+'. Email notification: '+(r.data.email?.sent?'sent / تم الإرسال':'not sent / لم يُرسل — '+(r.data.email?.reason||'check configuration')));
      setForm(initial); await load();
    } catch(e) { setError(e.response?.data?.error||e.message); }
    finally { setBusy(false); }
  };
  const saveContact = async e => {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await api.post('/maintenance-requests/config/contacts',{...contactForm,...(editingContact?{id:editingContact}:{})});
      setMessage('Contact saved / تم حفظ جهة الاتصال.');
      setContactForm(blankContact); setEditingContact(null); await load();
    } catch(e) { setError(e.response?.data?.error||e.message); }
    finally { setBusy(false); }
  };
  const editContact = c => {
    setContactForm({contact_role:c.contact_role||'Campus Manager',full_name:c.full_name||'',city:c.city||'',site:c.site||'',work_type:c.work_type||'',email:c.email||'',phone:c.phone||'',whatsapp:c.whatsapp||'',notes:c.notes||'',active:c.active!==false});
    setEditingContact(c.id);
    window.scrollTo({top:0,behavior:'smooth'});
  };
  const deleteContact = async id => {
    if(!window.confirm('Delete this contact? / هل تريد حذف جهة الاتصال؟')) return;
    setBusy(true); setError(''); setMessage('');
    try { await api.delete('/maintenance-requests/config/contacts/'+id); setMessage('Contact deleted / تم حذف جهة الاتصال.'); await load(); }
    catch(e) { setError(e.response?.data?.error||e.message); }
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
    <section style={panel}>
      <h3 style={{marginTop:0}}>⚙️ First-time setup — Contact & Responsibility Directory / الإعداد لأول مرة — دليل الأشخاص والمسؤوليات</h3>
      <p style={{marginTop:0,color:'#64748b',fontSize:13}}>Enter your actual team, managers and vendors once. These records are saved in the ERP database and can be updated later. / أدخل أسماء فريق العمل والمديرين والمقاولين مرة واحدة؛ تُحفظ البيانات في قاعدة النظام ويمكن تعديلها لاحقاً.</p>
      <form onSubmit={saveContact} style={{display:'grid',gap:10}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10}}>
          <label style={field}>Responsibility / المسؤولية
            <select style={control} required value={contactForm.contact_role} onChange={e=>setContactForm(p=>({...p,contact_role:e.target.value}))}>
              <option>Campus Manager</option><option>Services & Support Manager</option><option>Maintenance Manager</option><option>Requester / Campus Contact</option><option>Our Employee / Technician</option><option>Contractor / Vendor</option><option>Approver</option><option>Other</option>
            </select>
          </label>
          <label style={field}>Full name / الاسم الكامل<input required style={control} value={contactForm.full_name} onChange={e=>setContactForm(p=>({...p,full_name:e.target.value}))} placeholder="Name / الاسم"/></label>
          <label style={field}>City / المدينة<input style={control} value={contactForm.city} onChange={e=>setContactForm(p=>({...p,city:e.target.value}))}/></label>
          <label style={field}>Camp / Site / الموقع<input style={control} value={contactForm.site} onChange={e=>setContactForm(p=>({...p,site:e.target.value}))} placeholder="Site or All sites / الموقع أو جميع المواقع"/></label>
          <label style={field}>Work type / تخصص العمل<input style={control} value={contactForm.work_type} onChange={e=>setContactForm(p=>({...p,work_type:e.target.value}))} placeholder="Electrical, AC, plumbing…"/></label>
          <label style={field}>Email / البريد الإلكتروني<input type="email" style={control} value={contactForm.email} onChange={e=>setContactForm(p=>({...p,email:e.target.value}))}/></label>
          <label style={field}>Phone / رقم الهاتف<input style={control} value={contactForm.phone} onChange={e=>setContactForm(p=>({...p,phone:e.target.value}))}/></label>
          <label style={field}>WhatsApp / رقم الواتساب<input style={control} value={contactForm.whatsapp} onChange={e=>setContactForm(p=>({...p,whatsapp:e.target.value}))} placeholder="Country code, e.g. 9665…"/></label>
        </div>
        <label style={field}>Notes / ملاحظات<input style={control} value={contactForm.notes} onChange={e=>setContactForm(p=>({...p,notes:e.target.value}))} placeholder="Responsibilities, coverage, working hours…"/></label>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button disabled={busy} style={{...btn,background:'#0f766e',color:'#fff'}}>{editingContact?'Save changes / حفظ التعديلات':'Add contact / إضافة جهة اتصال'}</button>
          {editingContact&&<button type="button" style={btn} onClick={()=>{setEditingContact(null);setContactForm(blankContact);}}>Cancel / إلغاء</button>}
        </div>
      </form>
      <div style={{display:'grid',gap:8,marginTop:14}}>
        {!contacts.length&&<div style={{padding:12,background:'#f8fafc',borderRadius:8}}>No contacts configured yet. Add the campus manager, services & support manager, maintenance manager, employees and contractors above. / لم تتم إضافة جهات اتصال بعد.</div>}
        {contacts.map(c=><div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',border:'1px solid #e2e8f0',borderRadius:8,padding:10}}>
          <div><b>{c.full_name}</b> · {c.contact_role}{c.active===false?' · Inactive / غير نشط':''}<div style={{fontSize:12,color:'#64748b',marginTop:4}}>{[c.city,c.site,c.work_type,c.email,c.phone,c.whatsapp].filter(Boolean).join(' · ')}</div>{c.notes&&<div style={{fontSize:12,marginTop:4}}>{c.notes}</div>}</div>
          <div style={{display:'flex',gap:6}}><button type="button" style={btn} onClick={()=>editContact(c)}>Edit / تعديل</button><button type="button" style={{...btn,background:'#fee2e2',color:'#991b1b'}} disabled={busy} onClick={()=>deleteContact(c.id)}>Delete / حذف</button></div>
        </div>)}
      </div>
    </section>
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
      <h3 style={{marginTop:0}}>📩 Upload maintenance email / رفع بريد الصيانة</h3>
      <p style={{marginTop:0,fontSize:13,color:'#64748b'}}>Upload an Outlook email saved as .eml, or a .txt/.html email file. The page detects likely faults and proposes a separate ticket for each one. Review the results before creating tickets. / ارفع البريد بصيغة EML أو TXT أو HTML؛ يحاول النظام تحديد كل عطل وإنشاء تذكرة مستقلة له بعد مراجعتك.</p>
      <input type="file" accept=".eml,.txt,.html,.htm,text/plain,text/html,message/rfc822" onChange={readEmailFile} disabled={busy} style={{maxWidth:'100%'}}/>
      {emailFileName&&<div style={{marginTop:8,fontSize:13}}>Selected file / الملف: <b>{emailFileName}</b></div>}
      {emailIssues.length>0&&<>
        <div style={{marginTop:12,padding:10,background:'#f8fafc',borderRadius:8,fontSize:13}}>First choose the City and Site in the request form below. These values will apply to all tickets created from this email. / اختر المدينة والموقع في نموذج الطلب أدناه قبل إنشاء التذاكر.</div>
        <h4>Detected issues / الأعطال المكتشفة ({emailIssues.length})</h4>
        <div style={{display:'grid',gap:10}}>
          {emailIssues.map((issue,i)=><div key={i} style={{border:'1px solid #cbd5e1',borderRadius:8,padding:10,display:'grid',gap:8}}>
            <b>Issue {i+1} / العطل {i+1}</b>
            <label style={field}>Description / وصف العطل<textarea style={{...control,minHeight:65}} value={issue.description} onChange={e=>setEmailIssues(p=>p.map((x,j)=>j===i?{...x,description:e.target.value}:x))}/></label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:8}}>
              <label style={field}>Category / التصنيف<select style={control} value={issue.category} onChange={e=>setEmailIssues(p=>p.map((x,j)=>j===i?{...x,category:e.target.value}:x))}>{['General Maintenance','Electrical','Plumbing & Water','A/C & HVAC','Doors, Locks & Windows','Civil & Building','Furniture & Facilities','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
              <label style={field}>Priority / الأولوية<select style={control} value={issue.priority} onChange={e=>setEmailIssues(p=>p.map((x,j)=>j===i?{...x,priority:e.target.value}:x))}>{['Low','Medium','High','Critical'].map(x=><option key={x}>{x}</option>)}</select></label>
              <div style={{display:'flex',alignItems:'end'}}><button type="button" style={{...btn,background:'#fee2e2',color:'#991b1b'}} onClick={()=>setEmailIssues(p=>p.filter((_,j)=>j!==i))}>Remove issue / حذف العطل</button></div>
            </div>
          </div>)}
        </div>
        <button type="button" disabled={busy||!emailIssues.length} onClick={createDetectedTickets} style={{...btn,background:'#0f766e',color:'#fff',marginTop:12}}>Create {emailIssues.length} tickets / إنشاء التذاكر</button>
      </>}
      {emailText&&<details style={{marginTop:12}}><summary>View extracted email text / عرض نص البريد المستخرج</summary><pre style={{whiteSpace:'pre-wrap',fontSize:12,maxHeight:260,overflow:'auto'}}>{emailText}</pre></details>}
    </section>
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
              <div><strong style={{fontSize:16}}>{r.request_no}</strong><div style={{marginTop:5}}><b>{[r.city,r.site].filter(Boolean).join(' · ')||'Site pending'}</b> · {r.category} · {r.priority}</div><div style={{marginTop:8,whiteSpace:'pre-wrap'}}>{r.description}</div><div style={{fontSize:12,color:'#64748b',marginTop:7}}>Requester / مقدم الطلب: {r.requester_name||'-'} {r.requester_email?'· '+r.requester_email:''}</div></div>
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
              {r.executor_email&&<button style={btn} onClick={()=>window.open('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent([r.requester_email,r.executor_email].filter(Boolean).join(','))+'&su='+encodeURIComponent('Maintenance '+r.request_no),'_blank','noopener,noreferrer')}>Prepare email / تجهيز البريد</button>}
              {r.requester_email&&<button style={btn} onClick={()=>window.open('https://wa.me/?text='+encodeURIComponent('Maintenance '+r.request_no+': repair completion needs confirmation. / طلب الصيانة '+r.request_no+': يرجى تأكيد اكتمال الإصلاح.'),'_blank','noopener,noreferrer')}>Prepare WhatsApp / تجهيز واتساب</button>}
            </div>
            {audit[r.id]&&<div style={{marginTop:10,padding:10,background:'#f8fafc',borderRadius:8}}><b>Audit trail / سجل الإجراءات</b>{!audit[r.id].length?<div>No events / لا توجد أحداث مسجلة.</div>:audit[r.id].map(ev=><div key={ev.id} style={{padding:'7px 0',borderBottom:'1px solid #e2e8f0',fontSize:13}}><b>{ev.action}</b> · {ev.actor_name||ev.actor_type} · {new Date(ev.created_at).toLocaleString()}</div>)}</div>}
          </article>;
        })}
      </div>
    </section>
    <div style={{fontSize:12,color:'#64748b'}}>Email and WhatsApp buttons prepare a message only unless the corresponding provider is configured. Automated WhatsApp delivery is not claimed here. / أزرار البريد والواتساب تجهّز الرسالة فقط ما لم يتم إعداد مزوّد الإرسال؛ لا ندّعي أن الواتساب الآلي مفعّل.</div>
  </div>;
}

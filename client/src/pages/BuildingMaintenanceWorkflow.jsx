import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const initial = { city:'', site:'', category:'General Maintenance', priority:'Medium', description:'' };
const blankContact = { contact_role:'Campus Manager', full_name:'', city:'', site:'', work_type:'', email:'', phone:'', whatsapp:'', notes:'', active:true };
const field = { display:'flex', flexDirection:'column', gap:5, minWidth:0 };
const control = { width:'100%', boxSizing:'border-box', padding:'10px', border:'1px solid #cbd5e1', borderRadius:7, background:'#fff' };
const btn = { padding:'9px 13px', border:0, borderRadius:7, cursor:'pointer', fontWeight:700 };
function parseMaintenanceEmail(raw) {
  const original = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const decodeBytes = bytes => new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  const decodeBase64 = value => {
    try {
      const compact = String(value || '').replace(/\s/g, '');
      if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return value;
      const binary = atob(compact);
      return decodeBytes(Array.from(binary, ch => ch.charCodeAt(0)));
    } catch { return value; }
  };
  const decodeQP = value => {
    const input = String(value || '').replace(/=\n/g, '');
    const bytes = [];
    for (let i = 0; i < input.length; i++) {
      if (input[i] === '=' && /^[0-9a-f]{2}$/i.test(input.slice(i + 1, i + 3))) {
        bytes.push(parseInt(input.slice(i + 1, i + 3), 16)); i += 2;
      } else {
        const code = input.charCodeAt(i);
        if (code <= 255) bytes.push(code);
        else bytes.push(...new TextEncoder().encode(input[i]));
      }
    }
    return decodeBytes(bytes);
  };
  const splitHeaders = entity => {
    const at = entity.search(/\n\n/);
    if (at < 0) return { headers: '', body: entity };
    return { headers: entity.slice(0, at), body: entity.slice(at + 2) };
  };
  const headerValue = (headers, name) => {
    const unfolded = String(headers || '').replace(/\n[ \t]+/g, ' ');
    const line = unfolded.split('\n').find(item => item.toLowerCase().startsWith(name.toLowerCase() + ':'));
    return line ? line.slice(name.length + 1).trim() : '';
  };
  const parseEntity = entity => {
    const { headers, body } = splitHeaders(String(entity || ''));
    const contentType = headerValue(headers, 'Content-Type') || 'text/plain';
    const transfer = headerValue(headers, 'Content-Transfer-Encoding').toLowerCase();
    const boundaryMatch = contentType.match(/boundary\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i);
    if (/multipart\//i.test(contentType) && boundaryMatch) {
      const boundary = boundaryMatch[1] || boundaryMatch[2] || boundaryMatch[3];
      const pieces = body.split('--' + boundary);
      const results = [];
      for (const piece of pieces) {
        const trimmed = piece.replace(/^\n+|\n+$/g, '');
        if (!trimmed || trimmed === '--' || trimmed.startsWith('--')) continue;
        const parsed = parseEntity(trimmed);
        if (parsed.plain.trim() || parsed.html.trim()) results.push(parsed);
      }
      return {
        plain: results.map(x => x.plain).filter(Boolean).join('\n\n'),
        html: results.map(x => x.html).filter(Boolean).join('\n\n')
      };
    }
    let decoded = body.replace(/\n+$/, '');
    if (transfer === 'base64') decoded = decodeBase64(decoded);
    else if (transfer === 'quoted-printable') decoded = decodeQP(decoded);
    if (/text\/html/i.test(contentType)) return { plain: '', html: decoded };
    if (/text\/plain/i.test(contentType) || !/application\/|image\/|video\//i.test(contentType)) return { plain: decoded, html: '' };
    return { plain: '', html: '' };
  };
  const htmlToText = html => String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  let source = original;
  const looksLikeEml = /(?:^|\n)(?:MIME-Version|Content-Type|From|Subject):/im.test(original);
  if (looksLikeEml) {
    const parsed = parseEntity(original);
    source = parsed.plain.trim() ? parsed.plain : htmlToText(parsed.html);
  } else if (/<(?:html|body|div|p|br)\b/i.test(original)) {
    source = htmlToText(original);
  }
  let text = String(source || '')
    .replace(/=3D/gi, '=').replace(/=20/gi, ' ')
    .replace(/^[ \t]*(From|To|Cc|Bcc|Subject|Date|Sent|Received|MIME-Version|Content-Type|Content-Transfer-Encoding):.*$/gim, ' ')
    .replace(/^[ \t]*--[-_A-Za-z0-9]+(?:--)?[ \t]*$/gm, ' ')
    .replace(/^[=_-]{5,}.*$/gm, ' ')
    .replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  text = text.split(/\n\s*(?:From:\s.+\nSent:|On .{3,160}wrote:|_{5,}|This message contains confidential information|This email and any attachments|Regards,|Best regards,|Kind regards,|Thanks,|Thank you,)\s*/i)[0];
  text = text.replace(/^\s*>.*$/gm, '').replace(/^\s*(?:Mobile|Phone|Email|Web|www\.).*$/gim, '').replace(/\n{3,}/g, '\n\n').trim();
  const rules = [
    {category:'A/C & HVAC',priority:'Medium',re:/\b(a\/c|air.?condition(?:er|ing)?|hvac|cooling|not cool|refrigerat|thermostat|freon|compressor|fan)\b|تكييف|مكيف|تبريد|فريون|كمبروسر/i},
    {category:'Plumbing & Water',priority:'High',re:/\b(water leak|leaking|leakage|pipe burst|drain|tap|faucet|toilet|water supply)\b|تسرب|تسريب|ماسورة|أنبوب|مياه|ماء|صرف صحي|restroom|bathroom/i},
    {category:'Electrical',priority:'High',re:/\b(electrical|electricity|power outage|wiring|socket|outlet|breaker|lights?\b.{0,60}\b(?:not working|not working properly|out)|lamp|short circuit)\b|تلف|كهرباء|تماس|قاطع|إنارة|مصباح/i},
    {category:'Doors, Locks & Windows',priority:'Medium',re:/\b(door|lock|key|window|hinge)\b|باب|قفل|نافذة|شباك/i},
    {category:'Civil & Building',priority:'Medium',re:/\b(ceiling|wall|roof|floor(?:ing)?|crack(?:ed)?|paint|tiles|plaster)\b|سقف|جدار|حائط|أرضية|تشققات|دهان|بلاط/i},
    {category:'Furniture & Facilities',priority:'Low',re:/\b(furniture|chair|desk|bed|cabinet|curtain)\b|أثاث|كرسي|مكتب|سرير|خزانة|ستارة/i}
  ];
  const body = text.split(/\n\s*(?:From:\s.+|Sent:\s.+|To:\s.+|Subject:\s.+|Mobile:|Email:|Ma.?aden Ivanhoe|This message contains confidential information)/i)[0].trim();
  const meaningful = body.split(/\n|(?<=[.!?؟])\s+/).map(x => x.trim()).filter(x => x.length > 8);
  const found = [];
  for (const part of meaningful) {
    if (/^--[_A-Za-z0-9-]+--?$/.test(part) || /^[A-Za-z0-9+/]{50,}={0,2}$/.test(part)) continue;
    const rule = rules.find(x => x.re.test(part));
    if (rule && !found.some(x => x.description.toLowerCase() === part.toLowerCase())) found.push({description:part.slice(0,1200),category:rule.category,priority:rule.priority});
  }
  const looksLikeGarbage = !body || /--_[A-Za-z0-9_-]{12,}/.test(body) || /Content-(?:Type|Transfer-Encoding):/i.test(body) || /^[A-Za-z0-9+/=\s]{80,}$/.test(body);
  // Urgency/action-only phrases are not separate maintenance faults.
  const urgencyOnly = /^(?:please\s+)?(?:please\s+)?(?:repair|fix|resolve|attend\s+to|do\s+the\s+needful|urgent(?:ly)?\s+(?:repair|fix)|needs?\s+to\s+be\s+(?:repaired|fixed)|must\s+be\s+(?:repaired|fixed)|ضروري(?:\s+جداً)?|يرجى\s+(?:الإصلاح|التصليح)|لازم\s+(?:يتصلح|ينصلح|إصلاحه)|يحتاج\s+إلى\s+(?:إصلاح|تصليح)|بأسرع\s+وقت)(?:[.!؟\s]*)$/i;
  const actual = (looksLikeGarbage ? [] : found).filter(x => !urgencyOnly.test(String(x.description || '').trim()));
  const unique = actual.filter((x, i) => actual.findIndex(y => y.description.toLowerCase() === x.description.toLowerCase()) === i);
  const priorityRank = {Low:1, Medium:2, High:3, Critical:4};
  const categories = [...new Set(unique.map(x => x.category || 'General Maintenance'))];
  const priority = unique.reduce((best, issue) => (priorityRank[issue.priority] || 2) > (priorityRank[best] || 2) ? issue.priority : best, 'Low');
  // Keep individual detected faults separate in the review UI. They are combined
  // into ONE maintenance ticket only when the user confirms creation.
  const issues = unique.map(x => ({...x, site:''}));
  return {text:body.slice(0,12000),issues};
}
const siteCity = (sites, siteName) => { const s=sites.find(x=>String(x.name)===String(siteName)); return s ? String(s.city||s.city_name||s.location_city||'') : ''; };
const statusColor = s => s==='Closed' || s==='Operationally Completed' ? '#dcfce7' : s==='Reopened' ? '#fee2e2' : '#fef3c7';

export default function BuildingMaintenanceWorkflow({ user }) {
  const [form,setForm] = useState(initial);
  const [sites,setSites] = useState([]);
  const [requests,setRequests] = useState([]);
  const [employees,setEmployees] = useState([]);
  const [contractors,setContractors] = useState([]);
  const [contacts,setContacts] = useState([]);
  const [subPage,setSubPage] = useState('workflow');
  const [contactForm,setContactForm] = useState(blankContact);
  const [editingContact,setEditingContact] = useState(null);
  const [emailFileName,setEmailFileName] = useState('');
  const [emailIssues,setEmailIssues] = useState([]);
  const [emailText,setEmailText] = useState('');
  const [assign,setAssign] = useState({});
  const [finance,setFinance] = useState({});
  const [audit,setAudit] = useState({});
  const [query,setQuery] = useState('');
  const [editingRequest,setEditingRequest] = useState(null);
  const [mailDraft,setMailDraft] = useState(null);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const roleKey = String(user?.role || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  const canWork = ['owner', 'system owner', 'manager', 'admin'].includes(roleKey) || !!user?.access?.building?.can_work;

  const load = async () => {
    setError('');
    try {
      const [s,r,e,c] = await Promise.all([
        api.get('/sites'), api.get('/maintenance-requests'), api.get('/maintenance-requests/executors'), api.get('/maintenance-requests/config/contacts')
      ]);
      setSites(s.data.sites || []);
      setRequests(r.data.requests || []);
      const savedContacts = c.data.contacts || [];
      // Directory contacts are the source of truth. Any active contact with a valid email
      // can be selected as an internal executor unless explicitly classified as Contractor/Vendor.
      const hasEmail = x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x.email || '').trim());
      const toExecutor = x => ({id:'directory-'+x.id, full_name:x.full_name, name:x.full_name, email:String(x.email).trim(), whatsapp:x.whatsapp || x.phone || '', phone:x.phone || '', city:x.city || '', site:x.site || '', work_type:x.work_type || ''});
      const configuredEmployees = savedContacts.filter(x => x.active !== false && !/Contractor|Vendor/i.test(x.contact_role || '') && hasEmail(x)).map(toExecutor);
      const configuredContractors = savedContacts.filter(x => x.active !== false && /Contractor|Vendor/i.test(x.contact_role || '') && hasEmail(x)).map(toExecutor);
      setEmployees(configuredEmployees);
      setContractors(configuredContractors);
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
    const extension=String(file.name||'').split('.').pop().toLowerCase();
    if(extension==='msg') {
      setEmailFileName(''); setEmailText(''); setEmailIssues([]);
      setError('Outlook .msg files are binary and cannot be read safely by this importer. In Outlook, open the email and use Save As → .eml, or copy only the email body into a .txt file. Upload photos/videos separately; do not upload the .msg file here. / ملفات Outlook بصيغة MSG ثنائية ولا يمكن قراءتها بأمان هنا. افتح الرسالة في Outlook واختر حفظ باسم بصيغة EML، أو انسخ نص الرسالة فقط إلى ملف TXT. ارفع الصور والفيديوهات بشكل منفصل، ولا ترفع ملف MSG هنا.');
      e.target.value=''; return;
    }
    if(!['eml','txt','html','htm'].includes(extension)) {
      setError('Unsupported file type. Please use .eml, .txt or .html. / نوع الملف غير مدعوم. استخدم EML أو TXT أو HTML.');
      e.target.value=''; return;
    }
    setError(''); setMessage(''); setBusy(true);
    try {
      const raw=await file.text();
      const controlChars=(raw.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g)||[]).length;
      if(raw.length && controlChars/raw.length > 0.01) {
        setEmailFileName(''); setEmailText(''); setEmailIssues([]);
        setError('This file contains binary or unreadable data. No tickets were created. Save the email body as .eml or plain .txt and try again. / يحتوي الملف على بيانات ثنائية أو غير مقروءة. لم يتم إنشاء أي تذاكر. احفظ نص الرسالة بصيغة EML أو TXT عادي ثم أعد المحاولة.');
        return;
      }
      const parsed=parseMaintenanceEmail(raw);
      setEmailFileName(file.name); setEmailText(parsed.text); setEmailIssues(parsed.issues.map(issue=>({...issue,site:''})));
      if(!parsed.issues.length) setError('No reliable maintenance issue was detected. No tickets were created. Please check that the file contains the email body only. / لم يتم اكتشاف عطل صيانة واضح وموثوق. لم يتم إنشاء أي تذاكر. تأكد أن الملف يحتوي على نص الرسالة فقط.');
      else setMessage('Email read. Review the detected issues below before creating tickets. / تمت قراءة البريد؛ راجع الأعطال المكتشفة أدناه قبل إنشاء التذاكر.');
    } catch(err) { setError('Could not read this email file. Please use .eml, .txt or .html. / تعذرت قراءة الملف. استخدم EML أو TXT أو HTML.'); }
    finally { setBusy(false); e.target.value=''; }
  };
  const createDetectedTickets = async () => {
    if(!emailIssues.length) return;
    if(emailIssues.some(issue=>!issue.site)) { setError('Select a site for every detected issue / اختر الموقع لكل عطل مكتشف.'); return; }
    // One source email always creates one ticket. The reviewed issue list is combined into its description.
    const selectedSites = [...new Set(emailIssues.map(issue => String(issue.site || '').trim()).filter(Boolean))];
    if (selectedSites.length > 1) { setError('One email must use one site. Select the same site for the combined ticket. / يجب أن يكون للبريد الواحد موقع واحد؛ اختر الموقع نفسه للتذكرة الموحّدة.'); return; }
    const grouped = {[selectedSites[0] || String(emailIssues[0]?.site || '').trim()]: emailIssues};
    const priorityRank = {Low:1, Medium:2, High:3, Critical:4};
    const groups = Object.entries(grouped);
    setBusy(true); setError(''); setMessage('');
    const created=[];
    try {
      for(const [site, issues] of groups) {
        const categories = [...new Set(issues.map(x => x.category || 'General Maintenance'))];
        const priority = issues.reduce((best, issue) => (priorityRank[issue.priority] || 2) > (priorityRank[best] || 2) ? issue.priority : best, 'Low');
        const category = categories.length === 1 ? categories[0] : 'General Maintenance';
        const details = issues.map((issue, index) => (index + 1) + '. [' + (issue.category || 'General Maintenance') + ' | ' + (issue.priority || 'Medium') + '] ' + String(issue.description || '').trim()).join('\n');
        const description = 'Multiple maintenance issues reported in one email (' + issues.length + ' issues):\n\n' + details + '\n\nSource email: ' + (emailFileName || 'pasted email text');
        const res = await api.post('/maintenance-requests', {city:siteCity(sites,site),site,category,priority,description});
        created.push(res.data.request?.request_no || '');
      }
      setMessage('Created ' + created.length + ' ticket(s) for ' + groups.length + ' site(s), covering ' + emailIssues.length + ' issue(s): ' + created.filter(Boolean).join(', ') + '. / تم إنشاء ' + created.length + ' تذكرة للمواقع المحددة، تشمل ' + emailIssues.length + ' أعطال: ' + created.filter(Boolean).join(', ') + '.');
      setEmailIssues([]); setEmailText(''); setEmailFileName(''); await load();
    } catch(err) {
      setError('Some tickets may have been created: ' + created.filter(Boolean).join(', ') + '. ' + (err.response?.data?.error || err.message));
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
    setAssign(p=>({...p,[id]:{...a,name,email:x?.email||'',whatsapp:x?.whatsapp||x?.phone||''}}));
  };
  // Open a prefilled email in the device's configured email app.
  // The user reviews the message and presses Send in that email app.
  const openOutlookDraft = (to,subject,body) => {
    const recipient = String(to || '').trim();
    if (!recipient) {
      setError('Recipient email is missing / البريد الإلكتروني للمستلم غير مسجل.');
      return false;
    }
    const mailto = 'mailto:' + encodeURIComponent(recipient)
      + '?subject=' + encodeURIComponent(String(subject || ''))
      + '&body=' + encodeURIComponent(String(body || ''));
    setMailDraft(null);
    window.location.href = mailto;
    return true;
  };
  const copyMailDraft = async () => {
    if(!mailDraft) return;
    const text='To: '+mailDraft.to+'\nSubject: '+mailDraft.subject+'\n\n'+mailDraft.body;
    try { await navigator.clipboard.writeText(text); setMessage('Email draft copied. Paste it into the company email system to send. / تم نسخ مسودة البريد؛ الصقها في بريد الشركة لإرسالها.'); }
    catch(e) { setError('Clipboard access was blocked. Select and copy the email fields manually. / تعذر النسخ تلقائيًا؛ انسخ حقول البريد يدويًا.'); }
  };
  const openWhatsAppDraft = (phone,body) => {
    const digits=String(phone||'').replace(/[^0-9]/g,'');
    if(!digits) { setError('WhatsApp number is missing for this contact / رقم واتساب جهة الاتصال غير مسجل.'); return; }
    window.open('https://wa.me/'+digits+'?text='+encodeURIComponent(body||''),'_blank','noopener,noreferrer');
  };
  const campusForSite = site => contacts
    .filter(x=>x.active!==false && /Campus Manager/i.test(x.contact_role||'') && (String(x.site||'').toLowerCase()===String(site||'').toLowerCase() || String(x.site||'').toLowerCase()==='all sites'))
    .sort((a,b)=>(String(a.site||'').toLowerCase()===String(site||'').toLowerCase()?0:1)-(String(b.site||'').toLowerCase()===String(site||'').toLowerCase()?0:1))[0];
  const saveRequestEdit = async id => {
    const draft=editingRequest;
    if(!draft?.site || !String(draft.description||'').trim()) { setError('Select site and enter description / اختر الموقع واكتب وصف المشكلة.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      await api.put('/maintenance-requests/'+id,{site:draft.site,city:siteCity(sites,draft.site),category:draft.category,priority:draft.priority,description:draft.description});
      setEditingRequest(null); setMessage('Request updated / تم تعديل الطلب.'); await load();
    } catch(e) { setError(e.response?.data?.error||e.message); }
    finally { setBusy(false); }
  };
  const archiveRequest = async request => {
    const number = request?.request_no || 'this ticket';
    if (!window.confirm('Remove '+number+' from the maintenance register? This is allowed only for a new, unassigned ticket. The audit history is retained.\\n\\nهل تريد شطب '+number+' من سجل الصيانة؟ هذا متاح للطلب الجديد غير المعيّن فقط، وسيبقى سجل الإجراءات محفوظاً.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api.post('/maintenance-requests/'+request.id+'/archive');
      setMessage('Ticket '+number+' removed from the register. Audit history retained. / تم شطب التذكرة من السجل مع الاحتفاظ بسجل الإجراءات.');
      await load();
    } catch(e) { setError(e.response?.data?.error||e.message); }
    finally { setBusy(false); }
  };
  const assignRequest = async id => {
    const a=assign[id]||{};
    if(!a.type||!a.name) { setError('Select an executor / اختر المنفذ أولاً.'); return; }
    if(!a.email) { setError('Executor email is required / البريد الإلكتروني للمنفذ مطلوب.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const r=await api.post('/maintenance-requests/'+id+'/assign',{executorType:a.type,executorName:a.name,executorEmail:a.email,executorWhatsapp:a.whatsapp||''});
      const ticket=r.data.request||{};
      const base=window.location.origin;
      const link1=base+'/api/maintenance-requests/public/'+ticket.acknowledgement_token+'/acknowledge';
      const link2=base+'/api/maintenance-requests/public/'+ticket.completion_token+'/work-completed';
      const subject='BUILDING MAINTENANCE / صيانة المباني — '+(ticket.request_no||'');
      const sourceTicket = requests.find(x => String(x.id) === String(id)) || {};
      const descriptionText = String(ticket.description || ticket.problem_description || ticket.details || ticket.request_description || ticket.issue_description || sourceTicket.description || sourceTicket.problem_description || sourceTicket.details || sourceTicket.request_description || sourceTicket.issue_description || '').replace(/\\n/g, '\n');
      const issueLines = descriptionText.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^(Multiple maintenance issues reported|Source email:)/i.test(line)).map(line => line.replace(/^(?:(?:\d+)[.)]\s*)+/, '').replace(/^\[[^\]]+\]\s*/, '').replace(/^[*•-]\s*/, '').trim()).filter(line => line && !/^(?:\*{3,}|[-_=]{3,})$/.test(line)).slice(0,4);
      const body=[
        'Maintenance request assigned / تم تعيين طلب صيانة',
        '',
        'Request number / رقم الطلب: '+(ticket.request_no||'-'),
        '',
        ...[0,1,2,3].map(i => (i+1)+'. '+(issueLines[i] || (i === 0 ? 'Fault details are recorded in the maintenance request. / تفاصيل الأعطال مسجلة في طلب الصيانة.' : ''))),
        '',
        'Please check WhatsApp for the task link. After finishing the repair, open the WhatsApp link and press YES / DONE.',
        '',
        'يرجى مراجعة رسالة الواتساب التي تحتوي على رابط المهمة. بعد الانتهاء من التصليح، افتح الرابط واضغط نعم / تم.',
        '',
        'The campus manager will then receive a confirmation link. Once the campus confirms the repair, the request will return to the maintenance manager for final closure',
        '',
        'بعدها سيصل لمسؤول الكامب رابط لتأكيد الإصلاح.',
        '',
        'وبعد تأكيد الكامب، يعود الطلب لمدير الصيانة للإغلاق النهائي.'
      ].join('\n');
      openOutlookDraft(a.email,subject,body);
      setMessage((ticket.request_no||'Request')+' assigned. A prefilled email was opened in your email app; press Send there. / تم التعيين وفتحت رسالة جاهزة في تطبيق البريد؛ اضغط إرسال هناك.');
      await load();
    } catch(e) { setError(e.response?.data?.error||e.message); }
    finally { setBusy(false); }
  };
  const resend = id => {
    // Preparing a draft is a client-side action; it must not call the server's resend endpoint.
    // This avoids 502 errors and does not claim that an email was sent.
    const ticket = requests.find(x => String(x.id) === String(id));
    if (!ticket) { setError('Ticket not found in the current register. Refresh and try again. / لم يتم العثور على التذكرة؛ حدّث السجل وحاول مجددًا.'); return; }
    const to = String(ticket.executor_email || '').trim();
    if (!to) { setError('Executor email is missing for this ticket. Edit the contact details first. / بريد المنفذ غير مسجل لهذه التذكرة؛ حدّث بيانات الاتصال أولاً.'); return; }
    const base = window.location.origin;
    const link1 = base + '/api/maintenance-requests/public/' + (ticket.acknowledgement_token || '') + '/acknowledge';
    const link2 = base + '/api/maintenance-requests/public/' + (ticket.completion_token || '') + '/work-completed';
    const subject = 'BUILDING MAINTENANCE / صيانة المباني — ' + (ticket.request_no || '');
    const descriptionText = String(ticket.description || ticket.problem_description || ticket.details || ticket.request_description || ticket.issue_description || '').replace(/\\n/g, '\n');
    const issueLines = descriptionText.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^(Multiple maintenance issues reported|Source email:)/i.test(line)).map(line => line.replace(/^(?:(?:\d+)[.)]\s*)+/, '').replace(/^\[[^\]]+\]\s*/, '').replace(/^[*•-]\s*/, '').trim()).filter(line => line && !/^(?:\*{3,}|[-_=]{3,})$/.test(line)).slice(0,4);
    const body = [
      'Maintenance request assigned / تم تعيين طلب صيانة',
      '',
      'Request number / رقم الطلب: ' + (ticket.request_no || '-'),
      '',
      ...[0,1,2,3].map(i => (i+1)+'. '+(issueLines[i] || (i === 0 ? 'Fault details are recorded in the maintenance request. / تفاصيل الأعطال مسجلة في طلب الصيانة.' : ''))),
      '',
      'Please check WhatsApp for the task link. After finishing the repair, open the WhatsApp link and press YES / DONE.',
      '',
      'يرجى مراجعة رسالة الواتساب التي تحتوي على رابط المهمة. بعد الانتهاء من التصليح، افتح الرابط واضغط نعم / تم.',
      '',
      'The campus manager will then receive a confirmation link. Once the campus confirms the repair, the request will return to the maintenance manager for final closure',
      '',
      'بعدها سيصل لمسؤول الكامب رابط لتأكيد الإصلاح.',
      '',
      'وبعد تأكيد الكامب، يعود الطلب لمدير الصيانة للإغلاق النهائي.'
    ].join('\n');
    openOutlookDraft(to, subject, body);
    setMessage((ticket.request_no || 'Request') + ' email draft opened inside the ERP. Copy it into the company email system to send. / تم فتح مسودة البريد داخل النظام؛ انسخها إلى بريد الشركة لإرسالها.');
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
    try { const r=await api.get('/maintenance-requests/'+id+'/audit'); setAudit(p=>({...p,[id]:r.data.events||[]})); return r.data.events||[]; }
    catch(e) { setError(e.response?.data?.error||e.message); return []; }
  };
  const printRegisterPdf = async () => {
    const win=window.open('','_blank');
    if(!win) { setError('Allow pop-ups to print the PDF report / اسمح بالنوافذ المنبثقة لطباعة تقرير PDF.'); return; }
    setBusy(true); setError('');
    try {
      const esc = value => String(value ?? '-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const reports=[];
      for(const ticket of visible) {
        const response=await api.get('/maintenance-requests/'+ticket.id+'/audit');
        reports.push({ticket,events:response.data.events||[]});
      }
      const pages=reports.map(({ticket,events})=>{
        const rows=events.map(ev=>'<tr><td>'+esc(new Date(ev.created_at).toLocaleString())+'</td><td>'+esc(ev.action)+'</td><td>'+esc(ev.actor_name||ev.actor_type)+'</td><td>'+esc(typeof ev.details==='string'?ev.details:JSON.stringify(ev.details||{}))+'</td></tr>').join('');
        const fields=[['Status / الحالة',ticket.status],['City / المدينة',ticket.city],['Category / التصنيف',ticket.category],['Priority / الأولوية',ticket.priority],['Requester / مقدم الطلب',ticket.requester_name],['Executor / المنفذ',ticket.executor_name],['Final cost (SAR) / التكلفة',ticket.final_amount==null?'Not recorded / غير مسجلة':Number(ticket.final_amount).toFixed(2)],['Created / تاريخ الإنشاء',ticket.created_at?new Date(ticket.created_at).toLocaleString():'-'],['Closed / تاريخ الإغلاق',ticket.closed_at?new Date(ticket.closed_at).toLocaleString():'Not closed / غير مغلقة']];
        return '<section class="ticket"><h1>Building Maintenance — Complete Ticket Record / سجل تذكرة الصيانة الكامل</h1><h2>'+esc(ticket.request_no)+' — '+esc(ticket.site)+'</h2><div class="meta">'+fields.map(([k,v])=>'<div class="field"><b>'+esc(k)+'</b><div>'+esc(v)+'</div></div>').join('')+'</div><h3>Description / وصف العطل</h3><div class="field">'+esc(ticket.description)+'</div><h3>Closure notes / ملاحظات الإغلاق</h3><div class="field">'+esc(ticket.closing_notes||'-')+'</div><h3>Audit trail / سجل الإجراءات ('+events.length+')</h3><table><thead><tr><th>Date / التاريخ</th><th>Action / الإجراء</th><th>Actor / المنفذ</th><th>Details / التفاصيل</th></tr></thead><tbody>'+rows+'</tbody></table></section>';
      }).join('');
      win.document.open();
      win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Building Maintenance Register</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:24px}.ticket{page-break-after:always;break-after:page}h1{font-size:20px}h2{font-size:16px}h3{font-size:14px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px}.field{border:1px solid #cbd5e1;padding:7px;white-space:pre-wrap;overflow-wrap:anywhere}.field b{font-size:10px;color:#475569}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e2e8f0}@media print{body{margin:10mm}.ticket:last-child{page-break-after:auto;break-after:auto}}</style></head><body><p>Tickets included / عدد التذاكر: '+reports.length+'</p>'+pages+'<script>window.onload=()=>window.print()</script></body></html>');
      win.document.close();
    } catch(e) { win.close(); setError(e.response?.data?.error||e.message); }
    finally { setBusy(false); }
  };
  const printTicketPdf = async ticket => {
    const win=window.open('','_blank');
    if(!win) { setError('Allow pop-ups to print the PDF report / اسمح بالنوافذ المنبثقة لطباعة تقرير PDF.'); return; }
    const events = await showAudit(ticket.id);
    const esc = value => String(value ?? '-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const eventRows = events.map(ev => '<tr><td>'+esc(new Date(ev.created_at).toLocaleString())+'</td><td>'+esc(ev.action)+'</td><td>'+esc(ev.actor_name||ev.actor_type)+'</td><td>'+esc(typeof ev.details==='string'?ev.details:JSON.stringify(ev.details||{}))+'</td></tr>').join('');
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(ticket.request_no)+' maintenance report</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:28px}h1{font-size:22px}h2{font-size:16px;margin-top:24px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#e2e8f0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}.field{border:1px solid #cbd5e1;padding:8px;border-radius:5px}.label{font-size:10px;color:#475569;text-transform:uppercase}.value{font-size:13px;margin-top:4px;white-space:pre-wrap;overflow-wrap:anywhere}@media print{button{display:none}body{margin:12mm}}</style></head><body><h1>Building Maintenance — Complete Ticket Record / سجل تذكرة الصيانة الكامل</h1><h2>'+esc(ticket.request_no)+'</h2><div class="meta">'+[['Status / الحالة',ticket.status],['Site / الموقع',ticket.site],['City / المدينة',ticket.city],['Category / التصنيف',ticket.category],['Priority / الأولوية',ticket.priority],['Requester / مقدم الطلب',ticket.requester_name],['Executor / المنفذ',ticket.executor_name],['Final cost (SAR) / التكلفة',ticket.final_amount==null?'Not recorded / غير مسجلة':Number(ticket.final_amount).toFixed(2)],['Created / تاريخ الإنشاء',ticket.created_at?new Date(ticket.created_at).toLocaleString():'-'],['Closed / تاريخ الإغلاق',ticket.closed_at?new Date(ticket.closed_at).toLocaleString():'Not closed / غير مغلقة']].map(([k,v])=>'<div class="field"><div class="label">'+esc(k)+'</div><div class="value">'+esc(v)+'</div></div>').join('')+'</div><h2>Description / وصف العطل</h2><div class="field value">'+esc(ticket.description)+'</div><h2>Closure notes / ملاحظات الإغلاق</h2><div class="field value">'+esc(ticket.closing_notes||'-')+'</div><h2>Audit trail / سجل الإجراءات ('+events.length+')</h2><table><thead><tr><th>Date / التاريخ</th><th>Action / الإجراء</th><th>Actor / المنفذ</th><th>Details / التفاصيل</th></tr></thead><tbody>'+eventRows+'</tbody></table><p style="margin-top:22px;font-size:10px;color:#64748b">Generated from Fleet ERP / تم إنشاء التقرير من نظام إدارة الأسطول والصيانة</p><script>window.onload=()=>window.print()</script></body></html>';
    win.document.open(); win.document.write(html); win.document.close();
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
    <nav aria-label="Building maintenance pages" style={{...panel,display:'flex',gap:8,flexWrap:'wrap',padding:10}}>
      <button type="button" onClick={()=>setSubPage('workflow')} style={{...btn,background:subPage==='workflow'?'#0f766e':'#f1f5f9',color:subPage==='workflow'?'#fff':'#0f172a'}}>📨 Maintenance Intake & Dispatch / استقبال وتوزيع الصيانة</button>
      <button type="button" onClick={()=>setSubPage('directory')} style={{...btn,background:subPage==='directory'?'#0f766e':'#f1f5f9',color:subPage==='directory'?'#fff':'#0f172a'}}>⚙️ Contact & Responsibility Directory / دليل الأشخاص والمسؤوليات</button>
    </nav>
    {message&&<div role="status" style={{...panel,background:'#ecfdf5',color:'#166534'}}>{message}</div>}
    {error&&<div role="alert" style={{...panel,background:'#fef2f2',color:'#991b1b'}}>{error}</div>}
    {subPage==='directory'&&<section style={panel}>
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
          <label style={field}>Camp / Site / الموقع<select style={control} value={contactForm.site} onChange={e=>{const site=e.target.value;setContactForm(p=>({...p,site,city:siteCity(sites,site)||p.city}));}}><option value="">Select site / اختر الموقع</option><option value="All sites">All sites / جميع المواقع</option>{sites.map(s=><option key={s.id||s.name} value={s.name}>{s.name}</option>)}</select></label>
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
    </section>}
    {subPage==='workflow'&&<>

    <form onSubmit={submit} style={panel}>
      <h3 style={{marginTop:0}}>📝 New maintenance request / طلب صيانة جديد</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
        <label style={field}>Camp / Site / الكامب أو الموقع
          <select style={control} required value={form.site} onChange={e=>{const site=e.target.value;setForm(p=>({...p,site,city:siteCity(sites,site)}));}}><option value="">Select site / اختر الموقع</option>{sites.map(s=><option key={s.id||s.name} value={s.name}>{s.name}</option>)}</select>
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
      <h3 style={{marginTop:0}}>📨 Paste or upload maintenance email / لصق أو رفع بريد الصيانة</h3>
      <p style={{marginTop:0,fontSize:13,color:'#64748b'}}>Paste the email text directly below, then choose Read & Detect. You can still upload an .eml, .txt or .html file if preferred. / الصق نص البريد مباشرة أدناه ثم اضغط قراءة واكتشاف. ويمكنك الاستمرار برفع ملف EML أو TXT أو HTML إذا رغبت.</p>
      <label style={field}>Email text / نص البريد الإلكتروني
        <textarea style={{...control,minHeight:170,resize:'vertical',fontFamily:'inherit'}} value={emailText} onChange={e=>{setEmailText(e.target.value);setEmailIssues([]);setEmailFileName('');setError('');setMessage('');}} placeholder="Paste the complete email text here, including the reported issue and site if available…\nالصق نص البريد كاملًا هنا، بما في ذلك وصف العطل والموقع إن وُجد…"/>
      </label>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
        <button type="button" disabled={busy||!emailText.trim()} onClick={()=>{
          setBusy(true);setError('');setMessage('');
          try {
            const parsed=parseMaintenanceEmail(emailText);
            setEmailText(parsed.text);
            setEmailFileName('pasted email text');
            setEmailIssues(parsed.issues.map(issue=>({...issue,site:''})));
            if(!parsed.issues.length) setError('No reliable maintenance issue was detected. No tickets were created. Please paste the email body with the problem description. / لم يتم اكتشاف عطل صيانة واضح. لم تُنشأ أي تذاكر. الصق نص البريد الذي يحتوي على وصف المشكلة.');
            else setMessage('Email text read. Review the detected issues below before creating tickets. / تمت قراءة نص البريد؛ راجع الأعطال المكتشفة أدناه قبل إنشاء التذاكر.');
          } catch(err) { setError('Could not read the pasted email text. / تعذرت قراءة نص البريد الملصق.'); }
          finally { setBusy(false); }
        }} style={{...btn,background:'#0f766e',color:'#fff'}}>Read & detect issues / قراءة واكتشاف الأعطال</button>
      </div>
      <div style={{borderTop:'1px solid #e2e8f0',margin:'16px 0'}}/>
      <h4 style={{margin:'0 0 8px'}}>Or upload an email file / أو ارفع ملف البريد</h4>
      <p style={{marginTop:0,fontSize:13,color:'#64748b'}}>Upload an Outlook email saved as .eml, or a .txt/.html email file. Review detected faults; the system creates one combined ticket per email, with all faults listed inside it. / راجع الأعطال؛ ينشئ النظام تذكرة واحدة لكل بريد وتُدرج جميع أعطاله داخلها.</p>
      <input type="file" accept=".eml,.txt,.html,.htm,text/plain,text/html,message/rfc822" onChange={readEmailFile} disabled={busy} style={{maxWidth:'100%'}}/>
      {(emailFileName || emailText || emailIssues.length > 0) && <button type="button" disabled={busy} onClick={() => { setEmailFileName(''); setEmailText(''); setEmailIssues([]); setError(''); setMessage('Detected issues cleared. No tickets were created by clearing this preview. / تم مسح الأعطال المكتشفة من المعاينة. مسح المعاينة لا ينشئ ولا يحذف تذاكر.'); }} style={{...btn, marginTop:10, background:'#fee2e2', color:'#991b1b'}}>Clear all detected issues / مسح جميع الأعطال المكتشفة</button>}
      {emailFileName&&<div style={{marginTop:8,fontSize:13}}>Selected file / الملف: <b>{emailFileName}</b></div>}
      {emailIssues.length>0&&<>
        <div style={{marginTop:12,padding:10,background:'#f8fafc',borderRadius:8,fontSize:13}}>One email creates one ticket. All detected faults are listed inside it; choose one site for the whole ticket. / البريد الواحد ينشئ تذكرة واحدة، وتُجمع الأعطال داخلها؛ اختر موقعًا واحدًا للتذكرة.</div>
        <h4>Detected issues / الأعطال المكتشفة ({emailIssues.length})</h4>
        <div style={{display:'grid',gap:10}}>
          {emailIssues.map((issue,i)=><div key={i} style={{border:'1px solid #cbd5e1',borderRadius:8,padding:10,display:'grid',gap:8}}>
            <b>Issue {i+1} / العطل {i+1}</b>
            <label style={field}>Description / وصف العطل<textarea style={{...control,minHeight:65}} value={issue.description} onChange={e=>setEmailIssues(p=>p.map((x,j)=>j===i?{...x,description:e.target.value}:x))}/></label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:8}}>
              <label style={field}>Site / الموقع<select required style={control} value={issue.site||''} onChange={e=>setEmailIssues(p=>p.map((x,j)=>j===i?{...x,site:e.target.value}:x))}><option value="">Select site / اختر الموقع</option>{sites.map(s=><option key={s.id||s.name} value={s.name}>{s.name}</option>)}</select></label>
              <label style={field}>Category / التصنيف<select style={control} value={issue.category} onChange={e=>setEmailIssues(p=>p.map((x,j)=>j===i?{...x,category:e.target.value}:x))}>{['General Maintenance','Electrical','Plumbing & Water','A/C & HVAC','Doors, Locks & Windows','Civil & Building','Furniture & Facilities','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
              <label style={field}>Priority / الأولوية<select style={control} value={issue.priority} onChange={e=>setEmailIssues(p=>p.map((x,j)=>j===i?{...x,priority:e.target.value}:x))}>{['Low','Medium','High','Critical'].map(x=><option key={x}>{x}</option>)}</select></label>
              <div style={{display:'flex',alignItems:'end'}}><button type="button" style={{...btn,background:'#fee2e2',color:'#991b1b'}} onClick={()=>setEmailIssues(p=>p.filter((_,j)=>j!==i))}>Remove issue / حذف العطل</button></div>
            </div>
          </div>)}
        </div>
        <button type="button" disabled={busy||!emailIssues.length} onClick={createDetectedTickets} style={{...btn,background:'#0f766e',color:'#fff',marginTop:12}}>Create one combined ticket / إنشاء تذكرة موحّدة</button>
      </>}
      {emailText&&<details style={{marginTop:12}}><summary>View extracted email text / عرض نص البريد المستخرج</summary><pre style={{whiteSpace:'pre-wrap',fontSize:12,maxHeight:260,overflow:'auto'}}>{emailText}</pre></details>}
    </section>
    <section style={panel}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div><h3 style={{margin:'0 0 4px'}}>📋 Maintenance Register / سجل طلبات الصيانة</h3><div style={{fontSize:13,color:'#64748b'}}>Search tickets, assign executor, check history and follow closure.</div></div>
        <button type="button" style={btn} onClick={load}>↻ Refresh / تحديث</button>
      </div>
      <input style={{...control,marginTop:12,maxWidth:460}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search ticket, site, requester, executor… / بحث"/>
      {canWork&&<button type="button" disabled={busy||!visible.length} style={{...btn,marginTop:8,background:'#1d4ed8',color:'#fff'}} onClick={printRegisterPdf}>Full Register PDF / PDF السجل الكامل</button>}
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
            {editingRequest?.id===r.id&&<div style={{display:'grid',gap:10,marginTop:12,padding:12,background:'#fffbeb',borderRadius:8}}>
              <b>Edit maintenance request / تعديل طلب الصيانة</b>
              <label style={field}>Site / الموقع<select style={control} value={editingRequest.site||''} onChange={e=>setEditingRequest(p=>({...p,site:e.target.value}))}><option value="">Select site / اختر الموقع</option>{sites.map(s=><option key={s.id||s.name} value={s.name}>{s.name}</option>)}</select></label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:8}}>
                <label style={field}>Category / التصنيف<select style={control} value={editingRequest.category||'General Maintenance'} onChange={e=>setEditingRequest(p=>({...p,category:e.target.value}))}>{['General Maintenance','Electrical','Plumbing & Water','A/C & HVAC','Doors, Locks & Windows','Civil & Building','Furniture & Facilities','Vehicle Maintenance','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
                <label style={field}>Priority / الأولوية<select style={control} value={editingRequest.priority||'Medium'} onChange={e=>setEditingRequest(p=>({...p,priority:e.target.value}))}>{['Low','Medium','High','Critical'].map(x=><option key={x}>{x}</option>)}</select></label>
              </div>
              <label style={field}>Description / وصف المشكلة<textarea style={{...control,minHeight:75}} value={editingRequest.description||''} onChange={e=>setEditingRequest(p=>({...p,description:e.target.value}))}/></label>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" disabled={busy} style={{...btn,background:'#0f766e',color:'#fff'}} onClick={()=>saveRequestEdit(r.id)}>Save changes / حفظ التعديلات</button><button type="button" style={btn} onClick={()=>setEditingRequest(null)}>Cancel / إلغاء</button></div>
            </div>}
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
              {r.status==='Assigned'&&!r.acknowledged_at&&<button style={{...btn,marginTop:8}} onClick={()=>resend(r.id)}>Prepare assignment email / تجهيز بريد التعيين</button>}
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
            {r.work_order_id && r.executor_whatsapp && !r.completed_at && <div style={{marginTop:10}}><button type="button" style={{...btn,background:'#dcfce7',color:'#166534'}} onClick={()=>openWhatsAppDraft(r.executor_whatsapp,'Maintenance request / طلب صيانة: '+r.request_no+'\nSite / الموقع: '+(r.site||'-')+'\n\nPlease open the link below and press “Work Completed” only after the repair is finished.\nيرجى فتح الرابط أدناه والضغط على «تم إنجاز العمل» بعد انتهاء الصيانة فقط.\n\nWork completed link / رابط إتمام العمل: '+window.location.origin+'/api/maintenance-requests/public/'+r.completion_token+'/work-completed')}>Prepare contractor completion message / تجهيز رسالة إتمام العمل للمقاول</button><span style={{fontSize:12,color:'#64748b',marginInlineStart:8}}>Manual draft — you press Send / رسالة جاهزة يدويًا — أنت تضغط إرسال</span></div>}
            {r.status==='Awaiting Confirmation' && !r.requester_confirmation && (()=>{const campus=campusForSite(r.site);const phone=campus?.whatsapp||campus?.phone||'';const link=window.location.origin+'/api/maintenance-requests/public/'+r.confirmation_token+'/confirm';const body='Maintenance request / طلب الصيانة: '+r.request_no+'\nSite / الموقع: '+(r.site||'-')+'\n\nThe executor marked the repair as completed. Please confirm: choose YES if fixed, or NO if the problem remains.\nأفاد المنفذ بانتهاء الإصلاح. يرجى التأكيد: اختر نعم إذا تم الإصلاح، أو لا إذا ما زالت المشكلة قائمة.\n\nConfirm / رابط التأكيد: '+link;return <div style={{marginTop:10,padding:10,background:'#eff6ff',borderRadius:8}}><b>Campus confirmation / تأكيد الكامب</b><div style={{fontSize:13,margin:'5px 0 9px'}}>Campus contact / مسؤول الموقع: {campus?.full_name||'Not configured / غير محدد'}</div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" style={btn} disabled={!phone} onClick={()=>openWhatsAppDraft(phone,body)}>Prepare campus WhatsApp / تجهيز واتساب للكامب</button><button type="button" style={btn} disabled={!campus?.email} onClick={()=>openOutlookDraft(campus.email,'Maintenance '+r.request_no+' — Campus confirmation / تأكيد الكامب',body)}>Prepare campus email / تجهيز بريد الكامب</button></div><div style={{fontSize:12,color:'#64748b',marginTop:6}}>Messages are drafts until you press Send / الرسائل مسودات حتى تضغط إرسال.</div></div>})()}
            <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
              {r.status==='New'&&!r.work_order_id&&!r.closed_at&&canWork&&<button type="button" disabled={busy} style={{...btn,background:'#fee2e2',color:'#991b1b'}} onClick={()=>archiveRequest(r)}>Delete ticket / شطب التذكرة</button>}
              <button type="button" style={btn} onClick={()=>printTicketPdf(r)}>Ticket PDF / PDF التذكرة</button>
              <button style={btn} onClick={()=>showAudit(r.id)}>View audit trail / سجل الإجراءات</button>
              {canWork&&<button type="button" style={btn} onClick={()=>setEditingRequest({id:r.id,site:r.site||'',category:r.category||'General Maintenance',priority:r.priority||'Medium',description:r.description||''})}>Edit ticket / تعديل التذكرة</button>}
              <button style={btn} onClick={()=>window.open('https://wa.me/?text='+encodeURIComponent('Maintenance '+r.request_no+' | Site: '+(r.site||'-')+' | '+r.category+' | Priority: '+r.priority+'\\n'+r.description+'\\nPlease review this maintenance request. / يرجى مراجعة طلب الصيانة.'),'_blank','noopener,noreferrer')}>Prepare WhatsApp / تجهيز واتساب</button>
              <button style={btn} onClick={()=>openOutlookDraft([r.requester_email,r.executor_email].filter(Boolean).join(','),'Maintenance '+r.request_no+' / صيانة '+r.request_no,'Maintenance request: '+r.request_no+'\nطلب الصيانة: '+r.request_no+'\nSite: '+(r.site||'-')+'\nالموقع: '+(r.site||'-')+'\nCategory: '+(r.category||'-')+'\nالتصنيف: '+(r.category||'-')+'\n\n'+(r.description||'')+'\n\nPlease review and update the request status.\nيرجى مراجعة طلب الصيانة وتحديث الحالة.')}>Prepare company email / تجهيز بريد الشركة</button>
            </div>
            {audit[r.id]&&<div style={{marginTop:10,padding:10,background:'#f8fafc',borderRadius:8}}><b>Audit trail / سجل الإجراءات</b>{!audit[r.id].length?<div>No events / لا توجد أحداث مسجلة.</div>:audit[r.id].map(ev=><div key={ev.id} style={{padding:'7px 0',borderBottom:'1px solid #e2e8f0',fontSize:13}}><b>{ev.action}</b> · {ev.actor_name||ev.actor_type} · {new Date(ev.created_at).toLocaleString()}</div>)}</div>}
          </article>;
        })}
      </div>
    </section>
    {mailDraft&&<div role="dialog" aria-modal="true" aria-label="Email draft / مسودة البريد" style={{position:'fixed',inset:0,zIndex:10000,background:'rgba(15,23,42,.58)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <section style={{background:'#fff',color:'#0f172a',borderRadius:12,padding:20,width:'min(760px,100%)',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:14}}><h3 style={{margin:0}}>Company email draft / مسودة بريد الشركة</h3><button type="button" style={btn} onClick={()=>setMailDraft(null)}>Close / إغلاق</button></div>
        <p style={{fontSize:13,color:'#475569',marginTop:0}}>This draft stays inside the ERP. It is not sent automatically; copy it into your approved company email to send. / تبقى المسودة داخل النظام ولا تُرسل تلقائيًا؛ انسخها إلى بريد الشركة المعتمد لإرسالها.</p>
        <label style={field}>To / إلى<input style={control} type="email" value={mailDraft.to} onChange={e=>setMailDraft(p=>({...p,to:e.target.value}))}/></label>
        <label style={{...field,marginTop:10}}>Subject / الموضوع<input style={control} value={mailDraft.subject} onChange={e=>setMailDraft(p=>({...p,subject:e.target.value}))}/></label>
        <label style={{...field,marginTop:10}}>Message / نص الرسالة<textarea style={{...control,minHeight:260,resize:'vertical',whiteSpace:'pre-wrap'}} value={mailDraft.body} onChange={e=>setMailDraft(p=>({...p,body:e.target.value}))}/></label>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><button type="button" style={{...btn,background:'#0f766e',color:'#fff'}} onClick={copyMailDraft}>Copy email draft / نسخ مسودة البريد</button><button type="button" style={btn} onClick={()=>setMailDraft(null)}>Done / تم</button></div>
      </section>
    </div>}
    </>}
    <div style={{fontSize:12,color:'#64748b'}}>Email and WhatsApp buttons prepare a message only unless the corresponding provider is configured. Automated WhatsApp delivery is not claimed here. / أزرار البريد والواتساب تجهّز الرسالة فقط ما لم يتم إعداد مزوّد الإرسال؛ لا ندّعي أن الواتساب الآلي مفعّل.</div>
  </div>;
}
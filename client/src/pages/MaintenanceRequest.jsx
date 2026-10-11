import { useEffect, useState } from 'react';
import api, { reopenMaintenanceRequest, archiveMaintenanceRequest, getCampusWhatsAppInfo, parseMaintenanceEmail } from '../api/client';

const initialForm={site:'',category:'',priority:'Medium',description:''};
export default function MaintenanceRequest({user,access={}}){
  const [form,setForm]=useState(initialForm),[sites,setSites]=useState([]),[requests,setRequests]=useState([]),[employees,setEmployees]=useState([]),[contractors,setContractors]=useState([]),[assign,setAssign]=useState({}), [message,setMessage]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[finance,setFinance]=useState({});
  const [newItems,setNewItems]=useState([{description:''}]);
  const [itemsByRequest,setItemsByRequest]=useState({});
  const [busyItem,setBusyItem]=useState(null);
  const [auditByRequest,setAuditByRequest]=useState({});
  const [showAuditFor,setShowAuditFor]=useState(null);
  const [emailText,setEmailText]=useState('');
  const [parsedEmail,setParsedEmail]=useState(null);
  const [parsing,setParsing]=useState(false);
  const canWork=user?.role==='Owner'||!!access?.support?.can_work||!!access?.building?.can_work;
  const load=async()=>{if(!canWork)return;try{const [r,e]=await Promise.all([api.get('/maintenance-requests'),api.get('/maintenance-requests/executors')]);setRequests(r.data.requests||[]);setEmployees(e.data.employees||[]);setContractors(e.data.contractors||[])}catch(e){setError(e.response?.data?.error||e.message)}};
  useEffect(()=>{Promise.all([api.get('/sites').then(r=>setSites(r.data.sites||[])),load()]).catch(e=>setError(e.response?.data?.error||e.message)).finally(()=>setLoading(false))},[]);
  const submit=async e=>{e.preventDefault();setMessage('');setError('');if(!form.description.trim())return setError('Please describe the problem.');try{const r=await api.post('/maintenance-requests',form);const newId=r.data.request?.id;const reqNo=r.data.request?.request_no||'Request';const cleanItems=newItems.map(x=>String(x.description||'').trim()).filter(Boolean);if(newId&&cleanItems.length){try{await api.post('/maintenance-requests/'+newId+'/items/bulk',{descriptions:cleanItems})}catch(e){console.error('bulk items failed',e)}}setMessage('OK '+reqNo+' submitted with '+cleanItems.length+' item(s).');setForm(initialForm);setNewItems([{description:''}]);await load()}catch(e){setError(e.response?.data?.error||e.message)}};
  const handleCloseItem=async(itemId,amount,notes)=>{try{setBusyItem(itemId);await api.put('/maintenance-request-items/'+itemId+'/close',{actual_amount:amount,notes:notes||''});await load()}catch(e){setError(e.response?.data?.error||e.message)}finally{setBusyItem(null)}};
  const handleReopenItem=async(itemId)=>{try{setBusyItem(itemId);await api.put('/maintenance-request-items/'+itemId+'/reopen',{});await load()}catch(e){setError(e.response?.data?.error||e.message)}finally{setBusyItem(null)}};
  const handleDeleteItem=async(itemId)=>{if(!confirm('Delete this item?'))return;try{setBusyItem(itemId);await api.delete('/maintenance-request-items/'+itemId);await load()}catch(e){setError(e.response?.data?.error||e.message)}finally{setBusyItem(null)}};
  const setType=(id,type)=>setAssign({...assign,[id]:{type,name:'',email:''}});
  const setExecutor=(id,name)=>{const a=assign[id]||{},list=a.type==='Contractor'?contractors:employees,x=list.find(v=>(v.name||v.full_name)===name);setAssign({...assign,[id]:{...a,name,email:x?.email||''}})};
  const doAssign=async id=>{const a=assign[id]||{};if(!a.type||!a.name)return setError('Select who will execute the work.');try{const r=await api.post('/maintenance-requests/'+id+'/assign',{executorType:a.type,executorName:a.name,executorEmail:a.email});setMessage(r.data.email?.sent ? '📧 '+r.data.request.request_no+' assigned to '+a.name+'. Email sent successfully. WO created.' : '⚠️ '+r.data.request.request_no+' assigned to '+a.name+'. WO created, but email failed: '+(r.data.email?.reason||'Unknown email error'));await load()}catch(e){setError(e.response?.data?.error||e.message)}};
  const resendAssignment=async id=>{setMessage('');setError('');try{const r=await api.post('/maintenance-requests/'+id+'/resend-email');setMessage('📧 '+r.data.request.request_no+' assignment email sent automatically. No new WO was created.');await load()}catch(e){setError(e.response?.data?.error||e.message)}};
  const financialAction=async(r,action)=>{
    const f=finance[r.id]||{}, rawAmount=String(f.amount??'').trim(), amount=rawAmount===''?null:Number(rawAmount); setMessage('');setError('');
    if(action==='close'&&amount!==null&&(!Number.isFinite(amount)||amount<0))return setError('Enter a valid non-negative Amount or leave it blank.');
    try{await api.post('/maintenance-requests/'+r.id+'/financial-close',{action,amount,notes:f.notes||''});setMessage(action==='close'?(amount===null?'✅ '+r.request_no+' is CLOSED without Amount.':'✅ '+r.request_no+' is CLOSED with Amount '+amount+'.'):'🔓 '+r.request_no+' is OPEN for further action.');await load()}catch(e){setError(e.response?.data?.error||e.message)}
  };
  const copyEmailHtml = async (requestId, stage) => {
    try {
      const r = await api.get("/maintenance-requests/" + requestId + "/email-html?stage=" + stage);
      if (!r.data.success) return setError(r.data.error || "Failed");
      const html = r.data.html || "";
      const subject = r.data.subject || "";
      const recipients = r.data.recipients || "";
      // Copy HTML to clipboard (rich text)
      try {
        const blob = new Blob([html], { type: "text/html" });
        const textBlob = new Blob([html], { type: "text/plain" });
        await navigator.clipboard.write([new ClipboardItem({ "text/html": blob, "text/plain": textBlob })]);
      } catch {
        // Fallback: copy as text
        await navigator.clipboard.writeText(html);
      }
      setMessage("✅ Email copied (" + stage + "). Opening Outlook...");
      // Open Outlook with subject
      const mailto = "mailto:" + encodeURIComponent(recipients) + "?subject=" + encodeURIComponent(subject);
      window.location.href = mailto;
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const openOutlookOnly = (recipients, subject) => {
    const mailto = "mailto:" + encodeURIComponent(recipients || "") + "?subject=" + encodeURIComponent(subject || "");
    window.location.href = mailto;
  };

  const loadAudit = async (requestId) => {
    try {
      const r = await api.get("/maintenance-requests/" + requestId + "/audit");
      setAuditByRequest(prev => ({ ...prev, [requestId]: r.data.events || [] }));
      setShowAuditFor(requestId);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const toggleAudit = (requestId) => {
    if (showAuditFor === requestId) {
      setShowAuditFor(null);
      return;
    }
    if (auditByRequest[requestId]) {
      setShowAuditFor(requestId);
    } else {
      loadAudit(requestId);
    }
  };

  const loadAudit = async (requestId) => {
    try {
      const r = await api.get("/maintenance-requests/" + requestId + "/audit");
      setAuditByRequest(prev => ({ ...prev, [requestId]: r.data.events || [] }));
      setShowAuditFor(requestId);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const toggleAudit = (requestId) => {
    if (showAuditFor === requestId) {
      setShowAuditFor(null);
      return;
    }
    if (auditByRequest[requestId]) {
      setShowAuditFor(requestId);
    } else {
      loadAudit(requestId);
    }
  };

  const handleArchiveRequest = async (requestId) => {
    if (!confirm("Archive this request? It will be hidden from the register (audit history is retained).")) return;
    try {
      await archiveMaintenanceRequest(requestId);
      setMessage("Request archived.");
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const handleReopenRequest = async (requestId) => {
    const notes = prompt("Reopen notes (optional):") || "";
    try {
      await reopenMaintenanceRequest(requestId, notes);
      setMessage("Request reopened.");
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const handleCampusWhatsApp = async (requestId) => {
    try {
      const info = await getCampusWhatsAppInfo(requestId);
      if (!info.success) return setError(info.error || "Failed to load WhatsApp info");
      if (!info.campus_phone) {
        // No phone: copy message + link to clipboard
        try {
          await navigator.clipboard.writeText(info.message || "");
          setMessage("No campus phone set. Message copied to clipboard.");
        } catch {
          setError("No campus phone set, and clipboard failed.");
        }
        return;
      }
      window.open(info.whatsapp_url, "_blank");
      setMessage("WhatsApp opened for " + info.campus_name + " (" + info.campus_phone + "). Review and send.");
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const handlePrintTicket = async (requestId) => {
    try {
      const r = await api.get("/maintenance-requests/" + requestId + "/pdf-ticket", { responseType: "text" });
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(r.data);
        w.document.close();
      } else {
        setError("Popup blocked. Please allow popups.");
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const handleParseEmail = async () => {
    if (!emailText.trim()) return setError("Paste an email first.");
    setParsing(true);
    setError("");
    try {
      const r = await parseMaintenanceEmail(emailText);
      if (!r.success) return setError(r.error || "Parse failed");
      setParsedEmail(r);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setParsing(false);
    }
  };

  const handleUseParsedEmail = () => {
    if (!parsedEmail) return;
    setForm({
      ...form,
      category: parsedEmail.category || form.category,
      priority: parsedEmail.priority || form.priority,
      description: emailText.trim() || form.description
    });
    setNewItems(parsedEmail.items.map(it => ({ description: it.description })));
    setParsedEmail(null);
    setMessage("Parsed. Review items and click Submit.");
  };

  if(loading)return <div className="loading">Loading Support & Service...</div>;
  return <div className="form-container" style={{maxWidth:1200}}>
    <div className="panel" style={{background:'linear-gradient(135deg,#0f766e,#0f172a)',color:'#fff',border:'none'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20,flexWrap:'wrap'}}>
        <div><div style={{fontSize:12,letterSpacing:1,opacity:.8}}>SUPPORT & SERVICE • BUILDING MAINTENANCE</div><h1 style={{margin:'6px 0'}}>🛠️ Request Maintenance / Building</h1><p style={{margin:0,opacity:.9}}>Report the problem. Fleet / Building Maintenance controls assignment, execution and final cost.</p></div><div style={{fontSize:48}}>🛠️</div>
      </div>
      <div className="cards-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',marginTop:18}}>
        {['Employee → Report','Fleet → Assign','Executor → Complete','Requester → YES / NO','Fleet → Final Amount'].map((x,i)=><div key={x} style={{background:'#ffffff',color:'#000000',padding:12,borderRadius:9}}><b>STEP {i+1}</b><div style={{fontSize:12,opacity:.85}}>{x}</div></div>)}
      </div>
    </div>
    {message&&<div className="alert alert-success">{message}</div>}{error&&<div className="alert alert-error">{error}</div>}
    <div className="panel" style={{marginBottom:16,border:"1px solid #0f766e",background:"#f0fdfa"}}>
      <h2 style={{marginTop:0,color:"#0f766e"}}>📧 Paste Campus Email (Auto-Extract Items)</h2>
      <p style={{color:"#64748b",fontSize:13}}>Paste the full email from the campus. The system will detect items, category, and priority.</p>
      <div className="form-group">
        <textarea
          value={emailText}
          onChange={e=>setEmailText(e.target.value)}
          placeholder="Paste the email body here..."
          rows={6}
          style={{width:"100%",fontFamily:"monospace",fontSize:13}}
        />
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button type="button" className="btn btn-primary" onClick={handleParseEmail} disabled={parsing||!emailText.trim()}>
          {parsing?"Analyzing...":"🔍 Analyze Email"}
        </button>
        {emailText && <button type="button" className="btn" onClick={()=>{setEmailText("");setParsedEmail(null)}}>Clear</button>}
      </div>

      {parsedEmail && (
        <div style={{marginTop:14,padding:12,background:"#fff",borderRadius:8,border:"1px solid #cbd5e1"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <strong>Detected: {parsedEmail.detected_count} item(s)</strong>
            <div style={{display:"flex",gap:8}}>
              <span style={{padding:"2px 10px",borderRadius:10,background:"#dbeafe",color:"#1e40af",fontSize:12,fontWeight:600}}>{parsedEmail.category}</span>
              <span style={{padding:"2px 10px",borderRadius:10,background:"#fef3c7",color:"#b45309",fontSize:12,fontWeight:600}}>{parsedEmail.priority}</span>
            </div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginTop:8}}>
            <thead><tr style={{background:"#f1f5f9"}}><th style={{padding:6,textAlign:"left",width:40}}>#</th><th style={{padding:6,textAlign:"left"}}>Detected Item</th></tr></thead>
            <tbody>
              {parsedEmail.items.map((it,i)=>(
                <tr key={i} style={{borderTop:"1px solid #e2e8f0"}}>
                  <td style={{padding:6}}>{i+1}</td>
                  <td style={{padding:6}}>{it.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-success" style={{marginTop:10}} onClick={handleUseParsedEmail}>
            ✅ Use These Items (Fill Form Below)
          </button>
        </div>
      )}
    </div>

    <form className="panel" onSubmit={submit}>
      <h2 style={{marginTop:0}}>📝 Report a Building / Facility Problem</h2><p style={{color:'#64748b'}}>Only report the problem here. Contractor and cost are controlled by Fleet / Building Maintenance.</p>
      <div className="cards-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))'}}>
        <div className="form-group"><label>Site *</label><select value={form.site} onChange={e=>setForm({...form,site:e.target.value})} required><option value="">-- Select site --</option>{sites.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
        <div className="form-group"><label>Category *</label><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} required><option value="">-- Select category --</option><option>Electrical</option><option>A/C & HVAC</option><option>Plumbing & Water</option><option>Doors, Locks & Windows</option><option>Civil & Building</option><option>Furniture & Facilities</option><option>Appliances & Equipment</option><option>Other</option></select></div><div className="form-group"><label>Priority</label><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div>
      </div>
      <div className="form-group"><label>What is the problem? *</label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Example: A/C in the accommodation room is not cooling." rows={5} required/></div>
      <div className="form-group" style={{marginTop:12}}>
        <label style={{fontWeight:700}}>Items / Faults</label>
        <p style={{fontSize:12,color:"#64748b",margin:"4px 0 8px"}}>Add one line per fault. Each item can be closed individually later.</p>
        <div style={{display:"grid",gap:6}}>
          {newItems.map((it,idx)=>(
            <div key={idx} style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{width:24,textAlign:"right",color:"#64748b",fontSize:12}}>{idx+1}.</span>
              <input
                value={it.description}
                onChange={e=>{const v=[...newItems];v[idx]={...v[idx],description:e.target.value};setNewItems(v)}}
                placeholder="e.g. AC in Room 12 not cooling"
                style={{flex:1}}
              />
              <button type="button" className="btn" style={{padding:"4px 10px",fontSize:12}} onClick={()=>{if(newItems.length<=1)return;setNewItems(newItems.filter((_,j)=>j!==idx))}}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn" style={{marginTop:8,padding:"6px 12px",fontSize:12}} onClick={()=>setNewItems([...newItems,{description:""}])}>+ Add Item</button>
      </div>
      <button className="btn btn-primary">📨 Submit Maintenance Request</button><button type="button" className="btn btn-warning" style={{marginLeft:8}} onClick={()=>setForm(initialForm)}>Clear</button>
    </form>
    {canWork&&<div className="panel">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><h2 style={{margin:0}}>📥 Maintenance Request Inbox</h2><p style={{margin:'6px 0',color:'#64748b'}}>Choose Our Employee or the contractor you want.</p></div>
        <button className="btn" onClick={load}>↻ Refresh</button>
      </div>
      {!requests.length ? <div className="alert alert-info" style={{marginTop:14}}>No maintenance requests.</div> :
        <div style={{display:'grid',gap:12,marginTop:14}}>
          {requests.map(r => {
            const a=assign[r.id]||{};
            const open=r.status==='New'||r.status==='Reopened';
            const list=a.type==='Contractor'?contractors:employees;
            return (
              <div key={r.id} className="panel" style={{margin:0,border:'1px solid #e2e8f0',boxShadow:'none'}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                  <div>
                    <b>{r.request_no}</b> <span className="badge">{r.status}</span>
                    <div><b>{r.site}</b> • {r.priority}</div>
                    <div style={{marginTop:6}}>{r.description}</div>
                    <small style={{color:'#64748b'}}>Requested by: {r.requester_name||'-'} {r.requester_email?' • '+r.requester_email:''}</small>
                  </div>
                  {r.work_order_id&&<div><b>WO #{r.work_order_id}</b><div>{r.executor_name||'-'}</div></div>}
                </div>
                {open&&<div style={{display:'grid',gridTemplateColumns:'180px 1fr auto',gap:8,marginTop:12,alignItems:'end'}}>
                  <div className="form-group" style={{margin:0}}><label>Performed By</label><select value={a.type||''} onChange={e=>setType(r.id,e.target.value)}><option value="">Select...</option><option>Our Employee</option><option>Contractor</option></select></div>
                  <div className="form-group" style={{margin:0}}><label>{a.type==='Contractor'?'Contractor':'Employee'}</label><select value={a.name||''} disabled={!a.type} onChange={e=>setExecutor(r.id,e.target.value)}><option value="">Select...</option>{list.map(x=><option key={x.email||x.id} value={x.name||x.full_name}>{x.name||x.full_name}{x.email?' — '+x.email:''}</option>)}</select></div>
                  <button className="btn btn-primary" onClick={()=>doAssign(r.id)}>🛠️ Assign & Create WO</button>
                  <button type="button" className="btn" style={{marginLeft:6}} onClick={()=>copyEmailHtml(r.id,"assignment")} title="Copy HTML + Open Outlook">📋 Copy Assignment Email</button>
                </div>}
                {r.status==='Assigned'&&!r.acknowledged_at&&<div style={{marginTop:12,display:'flex',justifyContent:'flex-end'}}>
                  <button type="button" className="btn btn-primary" onClick={()=>resendAssignment(r.id)}>📧 Resend Assignment Email</button>
                  {user?.role==='Owner'&&r.status==='New'&&<button type="button" className="btn btn-danger" style={{marginLeft:6}} onClick={()=>handleArchiveRequest(r.id)}>Archive</button>}
                  <button type="button" className="btn" style={{marginLeft:6}} onClick={()=>copyEmailHtml(r.id,"completion")} title="Copy Completion Email">📋 Copy Completion Email</button>
                </div>}
                {itemsByRequest[r.id] && itemsByRequest[r.id].length > 0 && (
                  <div style={{marginTop:14,padding:12,borderRadius:10,background:"#fff7ed",border:"1px solid #fdba74"}}>
                    <div style={{fontWeight:700,marginBottom:8}}>📝 Items ({itemsByRequest[r.id].length})</div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead>
                        <tr style={{background:"#ffedd5"}}>
                          <th style={{padding:6,textAlign:"left",width:40}}>#</th>
                          <th style={{padding:6,textAlign:"left"}}>Description</th>
                          <th style={{padding:6,width:100}}>Status</th>
                          <th style={{padding:6,width:100}}>Amount</th>
                          <th style={{padding:6,width:220}}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsByRequest[r.id].map(it => (
                          <tr key={it.id} style={{borderTop:"1px solid #fed7aa"}}>
                            <td style={{padding:6}}>{it.line_no}</td>
                            <td style={{padding:6}}>{it.description}</td>
                            <td style={{padding:6}}>
                              <span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600,background:it.status==="Completed"?"#dcfce7":"#fee2e2",color:it.status==="Completed"?"#166534":"#991b1b"}}>{it.status}</span>
                            </td>
                            <td style={{padding:6}}>{it.actual_amount||0}</td>
                            <td style={{padding:6,whiteSpace:"nowrap"}}>
                              {it.status==="Completed" ? (
                                <button type="button" className="btn" style={{padding:"4px 8px",fontSize:11}} disabled={busyItem===it.id} onClick={()=>handleReopenItem(it.id)}>Reopen</button>
                              ) : (
                                <>
                                  <input type="number" step="0.01" min="0" placeholder="Amount" id={"amt-"+it.id} style={{width:80,marginRight:4}} />
                                  <button type="button" className="btn btn-success" style={{padding:"4px 8px",fontSize:11,marginRight:4}} disabled={busyItem===it.id} onClick={()=>{const amt=Number(document.getElementById("amt-"+it.id).value)||0;handleCloseItem(it.id,amt,"")}}>Close</button>
                                  <button type="button" className="btn btn-danger" style={{padding:"4px 8px",fontSize:11}} disabled={busyItem===it.id} onClick={()=>handleDeleteItem(it.id)}>×</button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                                <div style={{marginTop:12}}>
                  <button type="button" className="btn" style={{padding:"6px 12px",fontSize:12}} onClick={()=>toggleAudit(r.id)}>
                    {showAuditFor===r.id ? "Hide Audit Trail" : "Show Audit Trail"}
                  </button>
                </div>
                {showAuditFor===r.id&&auditByRequest[r.id]&&(
                  <div style={{marginTop:8,padding:12,borderRadius:10,background:"#f1f5f9",border:"1px solid #cbd5e1",maxHeight:400,overflowY:"auto"}}>
                    <div style={{fontWeight:700,marginBottom:8}}>Audit Trail ({auditByRequest[r.id].length} event(s))</div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead>
                        <tr style={{background:"#e2e8f0"}}>
                          <th style={{padding:6,textAlign:"left",width:160}}>Date</th>
                          <th style={{padding:6,textAlign:"left",width:140}}>Action</th>
                          <th style={{padding:6,textAlign:"left",width:120}}>Actor</th>
                          <th style={{padding:6,textAlign:"left"}}>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditByRequest[r.id].map((ev, i) => (
                          <tr key={ev.id || i} style={{borderTop:"1px solid #e2e8f0"}}>
                            <td style={{padding:6,whiteSpace:"nowrap"}}>{String(ev.created_at || "").slice(0,19).replace("T"," ")}</td>
                            <td style={{padding:6,fontWeight:600,color:"#1e3a8a"}}>{ev.action}</td>
                            <td style={{padding:6}}>{ev.actor_name || ev.actor_type || "-"}</td>
                            <td style={{padding:6,color:"#475569"}}>{ev.details ? JSON.stringify(ev.details) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
{r.work_order_id&&<div style={{marginTop:14,padding:12,borderRadius:10,background:'#f8fafc',border:'1px solid #e2e8f0'}}>
                  <div style={{fontWeight:700,marginBottom:8}}>🔄 Maintenance Workflow</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(120px,1fr))',gap:6}}>
                    {[{t:'1. Report',ok:true},{t:'2. Assigned',ok:!!r.work_order_id},{t:'3. Work Completed',ok:!!r.completed_at},{t:'4. Campus Confirmed',ok:!!r.requester_confirmed_at}].map(s=><div key={s.t} style={{padding:'8px 6px',textAlign:'center',borderRadius:8,background:s.ok?'#dcfce7':'#fee2e2',color:s.ok?'#166534':'#991b1b',fontSize:12,fontWeight:700}}>{s.ok?'✓':'○'} {s.t}</div>)}
                  </div>
                  <div style={{marginTop:10,fontSize:13,color:'#475569'}}>
                    {r.status==='Assigned'&&!r.completed_at&&'📧 Waiting for executor to report Work Completed.'}
                    
                    {r.completed_at&&!r.requester_confirmed_at&&'📧 Work completed. Waiting for requester / Campus YES or NO confirmation by email.'}
                    {r.requester_confirmation==='yes'&&'✅ Campus confirmed YES. Ready for final financial control.'}
                    {r.requester_confirmation==='no'&&'❌ Campus reported NOT FIXED. Request is reopened for rework.'}
                  </div>
                </div>}
                {r.completed_at&&!r.requester_confirmed_at&&<div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button type="button" className="btn btn-primary" onClick={()=>copyEmailHtml(r.id,"confirmation")}>📋 Copy Campus Confirmation Email</button>
                  <button type="button" className="btn btn-success" style={{marginLeft:6}} onClick={()=>handleCampusWhatsApp(r.id)}>📱 Send to Campus via WhatsApp</button>
                  <button type="button" className="btn" style={{marginLeft:6}} onClick={()=>handlePrintTicket(r.id)}>🖨️ Print Ticket</button>
                </div>}
                {r.requester_confirmation==='yes'&&['Operationally Completed','Open'].includes(r.status)&&<div style={{marginTop:12,padding:12,borderRadius:10,background:'#ecfdf5',border:'1px solid #86efac'}}>
                  <div style={{fontWeight:700,marginBottom:8}}>💰 Final Financial Control</div>
                  <div style={{fontSize:13,color:'#166534',marginBottom:10}}>Campus confirmed <b>YES</b>. Enter the final amount, then choose Close or Open.</div>
                  <div style={{display:'grid',gridTemplateColumns:'180px 1fr auto auto',gap:8,alignItems:'end'}}>
                    <div className="form-group" style={{margin:0}}><label>Amount (SAR)</label><input type="number" min="0" step="0.01" value={finance[r.id]?.amount??''} onChange={e=>setFinance({...finance,[r.id]:{...(finance[r.id]||{}),amount:e.target.value}})} placeholder="0.00"/></div>
                    <div className="form-group" style={{margin:0}}><label>Closing Notes</label><input value={finance[r.id]?.notes??''} onChange={e=>setFinance({...finance,[r.id]:{...(finance[r.id]||{}),notes:e.target.value}})} placeholder="Optional notes"/></div>
                    <button type="button" className="btn btn-primary" onClick={()=>financialAction(r,'close')}>🔒 Close</button>
                    <button type="button" className="btn btn-warning" onClick={()=>financialAction(r,'open')}>🔓 Open</button>
                  </div>
                </div>}
                {r.status==='Closed'&&user?.role==='Owner'&&<div style={{marginTop:8}}><button type="button" className="btn btn-warning" onClick={()=>handleReopenRequest(r.id)}>Reopen Request</button></div>}
                {r.status==='Closed'&&<div style={{marginTop:12,padding:10,borderRadius:8,background:'#dcfce7',color:'#166534'}}><b>🔒 CLOSED</b> • Final Amount: SAR {Number(r.final_amount||0).toFixed(2)} • Closed by: {r.closed_by||'Fleet / Building Maintenance'}</div>}
              </div>
            );
          })}
        </div>}
    </div>}
  </div>
}

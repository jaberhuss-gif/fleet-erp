import { useEffect, useState } from 'react';
import api from '../api/client';

const initialForm={site:'',category:'',priority:'Medium',description:''};
export default function MaintenanceRequest({user,access={}}){
  const [form,setForm]=useState(initialForm),[sites,setSites]=useState([]),[requests,setRequests]=useState([]),[employees,setEmployees]=useState([]),[contractors,setContractors]=useState([]),[assign,setAssign]=useState({}),[message,setMessage]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[emailSending,setEmailSending]=useState({}),[finance,setFinance]=useState({});
  const canWork=user?.role==='Owner'||!!access?.support?.can_work||!!access?.building?.can_work;
  const load=async()=>{if(!canWork)return;try{const [r,e]=await Promise.all([api.get('/maintenance-requests'),api.get('/maintenance-requests/executors')]);setRequests(r.data.requests||[]);setEmployees(e.data.employees||[]);setContractors(e.data.contractors||[])}catch(e){setError(e.response?.data?.error||e.message)}};
  useEffect(()=>{Promise.all([api.get('/sites').then(r=>setSites(r.data.sites||[])),load()]).catch(e=>setError(e.response?.data?.error||e.message)).finally(()=>setLoading(false))},[]);
  const submit=async e=>{e.preventDefault();setMessage('');setError('');if(!form.description.trim())return setError('Please describe the problem.');try{const r=await api.post('/maintenance-requests',form);setMessage('✅ '+(r.data.request?.request_no||'Request')+' submitted. Fleet / Building Maintenance has been notified.');setForm(initialForm);await load()}catch(e){setError(e.response?.data?.error||e.message)}};
  const setType=(id,type)=>setAssign({...assign,[id]:{type,name:'',email:''}});
  const setExecutor=(id,name)=>{const a=assign[id]||{},list=a.type==='Contractor'?contractors:employees,x=list.find(v=>(v.name||v.full_name)===name);setAssign({...assign,[id]:{...a,name,email:x?.email||''}})};
  const doAssign=async id=>{const a=assign[id]||{};if(!a.type||!a.name)return setError('Select who will execute the work.');try{const r=await api.post('/maintenance-requests/'+id+'/assign',{executorType:a.type,executorName:a.name,executorEmail:a.email});setMessage(r.data.email?.sent ? '📧 '+r.data.request.request_no+' assigned to '+a.name+'. Email sent successfully. WO created.' : '⚠️ '+r.data.request.request_no+' assigned to '+a.name+'. WO created, but email failed: '+(r.data.email?.reason||'Unknown email error'));await load()}catch(e){setError(e.response?.data?.error||e.message)}};
  const sendWorkflowEmail=async r=>{
    setMessage('');setError('');
    if(!r.executor_email)return setError('Executor email is not available.');
    setEmailSending(prev=>({...prev,[r.id]:true}));
    try{
      const response=await api.post('/maintenance-requests/'+r.id+'/resend-email');
      if(response.data?.success && response.data?.email?.sent){
        const target=response.data?.email?.to||r.executor_email;
        setMessage('✅ Secure HTML email sent successfully to '+(Array.isArray(target)?target.join(', '):target)+'. The email contains clickable ACKNOWLEDGE RECEIPT and WORK COMPLETED buttons.');
        await load();
      }else{
        setError('❌ Email was not sent: '+(response.data?.email?.reason||response.data?.error||'Unknown email error'));
      }
    }catch(e){
      const data=e.response?.data||{};
      setError('❌ Email was not sent: '+(data.error||data.email?.reason||e.message));
    }finally{
      setEmailSending(prev=>({...prev,[r.id]:false}));
    }
  };
  const financialAction=async(r,action)=>{
    const f=finance[r.id]||{}, amount=Number(f.amount); setMessage('');setError('');
    if(action==='close'&&(!Number.isFinite(amount)||amount<0))return setError('Enter a valid Amount before closing.');
    try{await api.post('/maintenance-requests/'+r.id+'/financial-close',{action,amount:Number.isFinite(amount)&&amount>=0?amount:null,notes:f.notes||''});setMessage(action==='close'?'✅ '+r.request_no+' is CLOSED with Amount '+amount+'.':'🔓 '+r.request_no+' is OPEN for further action.');await load()}catch(e){setError(e.response?.data?.error||e.message)}
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
    <form className="panel" onSubmit={submit}>
      <h2 style={{marginTop:0}}>📝 Report a Building / Facility Problem</h2><p style={{color:'#64748b'}}>Only report the problem here. Contractor and cost are controlled by Fleet / Building Maintenance.</p>
      <div className="cards-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))'}}>
        <div className="form-group"><label>Site *</label><select value={form.site} onChange={e=>setForm({...form,site:e.target.value})} required><option value="">-- Select site --</option>{sites.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
        <div className="form-group"><label>Category *</label><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} required><option value="">-- Select category --</option><option>Electrical</option><option>A/C & HVAC</option><option>Plumbing & Water</option><option>Doors, Locks & Windows</option><option>Civil & Building</option><option>Furniture & Facilities</option><option>Appliances & Equipment</option><option>Other</option></select></div><div className="form-group"><label>Priority</label><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div>
      </div>
      <div className="form-group"><label>What is the problem? *</label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Example: A/C in the accommodation room is not cooling." rows={5} required/></div>
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
                </div>}
                {r.work_order_id&&<div style={{marginTop:14,padding:12,borderRadius:10,background:'#f8fafc',border:'1px solid #e2e8f0'}}>
                  <div style={{fontWeight:700,marginBottom:8}}>🔄 Maintenance Workflow</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(120px,1fr))',gap:6}}>
                    {[{t:'1. Report',ok:true},{t:'2. Assigned',ok:!!r.work_order_id},{t:'3. Acknowledged',ok:!!r.acknowledged_at},{t:'4. Work Completed',ok:!!r.completed_at},{t:'5. Requester Confirmed',ok:!!r.requester_confirmed_at}].map(s=><div key={s.t} style={{padding:'8px 6px',textAlign:'center',borderRadius:8,background:s.ok?'#dcfce7':'#fee2e2',color:s.ok?'#166534':'#991b1b',fontSize:12,fontWeight:700}}>{s.ok?'✓':'○'} {s.t}</div>)}
                  </div>
                  {r.executor_email&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10,alignItems:'center'}}>
                    <button type="button" className="btn btn-primary" disabled={!!emailSending[r.id]} onClick={()=>sendWorkflowEmail(r)}>{emailSending[r.id]?'⏳ Sending...':'📨 Send Secure Email / إرسال الإيميل مباشرة'}</button>
                    {!r.acknowledged_at&&r.acknowledgement_token&&<a className="btn btn-primary" style={{textDecoration:'none',background:'#2563eb'}} href={`/api/maintenance-requests/public/${r.acknowledgement_token}/acknowledge`} target="_blank" rel="noreferrer">📩 Acknowledge Receipt</a>}
                    {r.acknowledged_at&&!r.completed_at&&r.completion_token&&<a className="btn btn-primary" style={{textDecoration:'none',background:'#2563eb'}} href={`/api/maintenance-requests/public/${r.completion_token}/work-completed`} target="_blank" rel="noreferrer">🔵 Work Completed</a>}
                  </div>}
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
                {r.status==='Closed'&&<div style={{marginTop:12,padding:10,borderRadius:8,background:'#dcfce7',color:'#166534'}}><b>🔒 CLOSED</b> • Final Amount: SAR {Number(r.final_amount||0).toFixed(2)} • Closed by: {r.closed_by||'Fleet / Building Maintenance'}</div>}
              </div>
            );
          })}
        </div>}
    </div>}
  </div>
}
import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const EMPTY_FORM = {
  site: '',
  projectId: '',
  itemName: '',
  quantity: 1,
  estimatedUnitCost: 0,
  supplier: '',
  purpose: '',
  notes: ''
};

const EMPTY_PURCHASE = {
  quantity: 1,
  unitCost: 0,
  supplier: '',
  purchasedBy: 'Company',
  purchaseDate: '',
  notes: ''
};

export default function PurchaseRequests({ access = {}, user }) {
  const canWork = user?.role === 'Owner' || !!access?.purchase_requests?.can_work;
  const canApprove = user?.role === 'Owner';

  const [requests, setRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [approvalTarget, setApprovalTarget] = useState(null);
  const [purchaseTarget, setPurchaseTarget] = useState(null);
  const [purchaseForm, setPurchaseForm] = useState(EMPTY_PURCHASE);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [r, p, s] = await Promise.all([
        api.get('/purchase-requests'),
        api.get('/projects'),
        api.get('/sites')
      ]);
      setRequests(r.data.requests || []);
      setProjects(p.data.projects || []);
      setSites(s.data.sites || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const projectOptions = useMemo(() => projects.filter(p => p.status !== 'Cancelled'), [projects]);

  const reset = () => {
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const selectProject = (projectId) => {
    const p = projects.find(x => String(x.id) === String(projectId));
    setForm(prev => ({
      ...prev,
      projectId,
      site: p?.site || prev.site
    }));
  };

  const submitRequest = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (!canWork) {
      setError('You have View access only. Purchase requests require Work permission.');
      return;
    }
    try {
      const p = projects.find(x => String(x.id) === String(form.projectId));
      await api.post('/purchase-requests', {
        ...form,
        projectId: form.projectId ? Number(form.projectId) : null,
        projectNo: p?.project_no || '',
        quantity: Number(form.quantity || 1),
        estimatedUnitCost: Number(form.estimatedUnitCost || 0)
      });
      setMessage('✅ Purchase Request submitted to Owner for approval.');
      reset();
      load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const approve = async () => {
    if (!approvalTarget) return;
    try {
      await api.put('/purchase-requests/' + approvalTarget.id + '/approve', { approvalNotes });
      setMessage('✅ Request ' + approvalTarget.request_no + ' approved.');
      setApprovalTarget(null);
      setApprovalNotes('');
      load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const reject = async () => {
    if (!approvalTarget) return;
    try {
      await api.put('/purchase-requests/' + approvalTarget.id + '/reject', { reason: rejectionReason });
      setMessage('Request ' + approvalTarget.request_no + ' rejected.');
      setApprovalTarget(null);
      setRejectionReason('');
      load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const recordPurchase = async () => {
    if (!purchaseTarget) return;
    try {
      await api.post('/purchase-requests/' + purchaseTarget.id + '/purchase', {
        ...purchaseForm,
        quantity: Number(purchaseForm.quantity || purchaseTarget.quantity || 1),
        unitCost: Number(purchaseForm.unitCost || purchaseTarget.estimated_unit_cost || 0)
      });
      setMessage('✅ Purchase recorded against approved request ' + purchaseTarget.request_no + '.');
      setPurchaseTarget(null);
      setPurchaseForm(EMPTY_PURCHASE);
      load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const pending = requests.filter(r => r.status === 'Pending').length;
  const approved = requests.filter(r => r.status === 'Approved').length;
  const purchased = requests.filter(r => r.status === 'Purchased').length;

  return (
    <div>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="cards-grid" style={{ marginBottom: 18 }}>
        <div className="card warning"><h3>Pending Approval</h3><div className="big-number">{pending}</div><div className="sub">Waiting for Owner</div></div>
        <div className="card"><h3>Approved</h3><div className="big-number">{approved}</div><div className="sub">Ready to purchase</div></div>
        <div className="card success"><h3>Purchased</h3><div className="big-number">{purchased}</div><div className="sub">Recorded with approval</div></div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:10, flexWrap:'wrap' }}>
        <div style={{ color:'#64748b', fontSize:13 }}>
          Project parts must follow Request → Owner Approval → Purchase.
        </div>
        {canWork && (
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : '+ New Purchase Request'}
          </button>
        )}
      </div>

      {showForm && canWork && (
        <form className="panel" onSubmit={submitRequest} style={{ marginBottom:18 }}>
          <h3 style={{ marginTop:0 }}>New Project Purchase Request</h3>
          <div className="cards-grid" style={{ gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))' }}>
            <div className="form-group">
              <label>Project *</label>
              <select value={form.projectId} onChange={e => selectProject(e.target.value)} required>
                <option value="">-- Select Project --</option>
                {projectOptions.map(p => <option key={p.id} value={p.id}>{p.project_no} — {p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Site *</label>
              <select value={form.site} onChange={e => setForm({...form,site:e.target.value})} required>
                <option value="">-- Select Site --</option>
                {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Part / Item *</label><input value={form.itemName} onChange={e => setForm({...form,itemName:e.target.value})} required /></div>
            <div className="form-group"><label>Quantity *</label><input type="number" min="1" value={form.quantity} onChange={e => setForm({...form,quantity:e.target.value})} required /></div>
            <div className="form-group"><label>Estimated Unit Cost (SAR)</label><input type="number" min="0" value={form.estimatedUnitCost} onChange={e => setForm({...form,estimatedUnitCost:e.target.value})} /></div>
            <div className="form-group"><label>Preferred Supplier</label><input value={form.supplier} onChange={e => setForm({...form,supplier:e.target.value})} /></div>
          </div>
          <div className="form-group"><label>Purpose *</label><textarea rows={2} value={form.purpose} onChange={e => setForm({...form,purpose:e.target.value})} required /></div>
          <div className="form-group"><label>Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} /></div>
          <div className="btn-row">
            <button className="btn btn-success" type="submit">Submit Request to Owner</button>
            <button className="btn btn-warning" type="button" onClick={reset}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? <div className="loading">Loading purchase requests...</div> : (
        requests.length === 0 ? <div className="alert alert-info">No purchase requests.</div> : (
          <div className="panel">
            <div style={{overflowX:'auto'}}>
              <table>
                <thead>
                  <tr>
                    <th>Request</th><th>Date</th><th>Project</th><th>Site</th><th>Item</th><th>Qty</th>
                    <th>Est. Total</th><th>Requested By</th><th>Status</th><th>Approval</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id}>
                      <td style={{fontWeight:700}}>{r.request_no}</td>
                      <td>{String(r.created_at || '').slice(0,10)}</td>
                      <td>{r.project_no || '-'}</td>
                      <td>{r.site || '-'}</td>
                      <td>{r.item_name || '-'}</td>
                      <td>{r.quantity}</td>
                      <td>{Number(r.estimated_total || 0).toLocaleString()} SAR</td>
                      <td>{r.requested_by || '-'}</td>
                      <td><span className="status-badge" style={{
                        background: r.status === 'Pending' ? '#fef3c7' : r.status === 'Approved' ? '#dbeafe' : r.status === 'Purchased' ? '#dcfce7' : '#fee2e2',
                        color: r.status === 'Pending' ? '#92400e' : r.status === 'Approved' ? '#1e40af' : r.status === 'Purchased' ? '#166534' : '#991b1b'
                      }}>{r.status}</span></td>
                      <td>
                        {r.approved_by ? <div><strong>{r.approved_by}</strong><div style={{fontSize:11,color:'#64748b'}}>{String(r.approved_at || '').slice(0,19).replace('T',' ')}</div></div> : r.rejected_by ? <div><strong>{r.rejected_by}</strong><div style={{fontSize:11,color:'#64748b'}}>{r.rejection_reason || ''}</div></div> : '-'}
                      </td>
                      <td>
                        {canApprove && r.status === 'Pending' && (
                          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                            <button className="btn btn-success" style={{padding:'6px 10px',fontSize:12}} onClick={() => setApprovalTarget(r)}>Approve</button>
                            <button className="btn btn-danger" style={{padding:'6px 10px',fontSize:12}} onClick={() => setApprovalTarget(r)}>Reject</button>
                          </div>
                        )}
                        {(r.status === 'Approved' && (canWork || canApprove)) && (
                          <button className="btn btn-primary" style={{padding:'6px 10px',fontSize:12}} onClick={() => {
                            setPurchaseTarget(r);
                            setPurchaseForm({
                              quantity: r.quantity || 1,
                              unitCost: r.estimated_unit_cost || 0,
                              supplier: r.supplier || '',
                              purchasedBy: 'Company',
                              purchaseDate: new Date().toISOString().slice(0,10),
                              notes: r.notes || ''
                            });
                          }}>Record Purchase</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {approvalTarget && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1100}}>
          <div style={{background:'#fff',padding:24,borderRadius:10,width:'92%',maxWidth:500}}>
            <h3 style={{marginTop:0}}>Owner Action — {approvalTarget.request_no}</h3>
            <p><strong>Project:</strong> {approvalTarget.project_no || '-'}<br/><strong>Item:</strong> {approvalTarget.item_name}<br/><strong>Qty:</strong> {approvalTarget.quantity}<br/><strong>Estimated:</strong> {Number(approvalTarget.estimated_total || 0).toLocaleString()} SAR</p>
            <div className="form-group"><label>Approval Notes</label><textarea rows={3} value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)} /></div>
            <div className="form-group"><label>Rejection Reason</label><textarea rows={3} value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} /></div>
            <div className="btn-row">
              <button className="btn btn-success" onClick={approve}>Approve</button>
              <button className="btn btn-danger" onClick={reject}>Reject</button>
              <button className="btn btn-warning" onClick={() => {setApprovalTarget(null);setApprovalNotes('');setRejectionReason('');}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {purchaseTarget && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1100}}>
          <div style={{background:'#fff',padding:24,borderRadius:10,width:'92%',maxWidth:500}}>
            <h3 style={{marginTop:0}}>Record Purchase — {purchaseTarget.request_no}</h3>
            <p style={{color:'#64748b'}}>Owner approval: {purchaseTarget.approved_by || '-'} on {String(purchaseTarget.approved_at || '').slice(0,10)}</p>
            <div className="cards-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))'}}>
              <div className="form-group"><label>Quantity</label><input type="number" min="1" value={purchaseForm.quantity} onChange={e => setPurchaseForm({...purchaseForm,quantity:e.target.value})} /></div>
              <div className="form-group"><label>Actual Unit Cost (SAR)</label><input type="number" min="0" value={purchaseForm.unitCost} onChange={e => setPurchaseForm({...purchaseForm,unitCost:e.target.value})} /></div>
              <div className="form-group"><label>Supplier</label><input value={purchaseForm.supplier} onChange={e => setPurchaseForm({...purchaseForm,supplier:e.target.value})} /></div>
              <div className="form-group"><label>Purchase Date</label><input type="date" value={purchaseForm.purchaseDate} onChange={e => setPurchaseForm({...purchaseForm,purchaseDate:e.target.value})} /></div>
              <div className="form-group"><label>Paid By</label>
                <select value={purchaseForm.purchasedBy} onChange={e => setPurchaseForm({...purchaseForm,purchasedBy:e.target.value})}>
                  <option value="Company">Company</option>
                  <option value="Contractor">Contractor</option>
                </select>
              </div>
            </div>
            <div className="form-group"><label>Purchase Notes</label><textarea rows={3} value={purchaseForm.notes} onChange={e => setPurchaseForm({...purchaseForm,notes:e.target.value})} /></div>
            <div className="btn-row">
              <button className="btn btn-success" onClick={recordPurchase}>Record Approved Purchase</button>
              <button className="btn btn-warning" onClick={() => {setPurchaseTarget(null);setPurchaseForm(EMPTY_PURCHASE);}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

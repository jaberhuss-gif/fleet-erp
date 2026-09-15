import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';

export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterPurchasedBy, setFilterPurchasedBy] = useState('all');
  const [form, setForm] = useState({
    type: 'Work Order', referenceNo: '', itemName: '', quantity: 1, unitCost: 0,
    supplier: '', purchasedBy: 'Company', purchaseDate: '', notes: ''
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [p, s] = await Promise.all([api.get('/purchases'), api.get('/sites')]);
      setPurchases(p.data.purchases || []);
      setSites(s.data.sites || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ type: 'Work Order', referenceNo: '', itemName: '', quantity: 1, unitCost: 0,
      supplier: '', purchasedBy: 'Company', purchaseDate: '', notes: '' });
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      await api.post('/purchases', form);
      setMessage('Purchase recorded');
      resetForm();
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this purchase?')) return;
    try {
      await api.delete('/purchases/' + id);
      setMessage('Purchase deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const months = [...new Set(purchases.map(p => p.month).filter(Boolean))].sort().reverse();
  const types = [...new Set(purchases.map(p => p.type).filter(Boolean))].sort();

  const filtered = purchases.filter(p => {
    const matchMonth = filterMonth === 'all' || p.month === filterMonth;
    const matchType = filterType === 'all' || p.type === filterType;
    const matchBy = filterPurchasedBy === 'all' || p.purchased_by === filterPurchasedBy;
    return matchMonth && matchType && matchBy;
  });

  const totalCost = filtered.reduce((s, p) => s + Number(p.total_cost || 0), 0);
  const companyCost = filtered.filter(p => p.purchased_by === 'Company').reduce((s, p) => s + Number(p.total_cost || 0), 0);
  const contractorCost = filtered.filter(p => p.purchased_by === 'Contractor').reduce((s, p) => s + Number(p.total_cost || 0), 0);

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0 }}>Purchases ({purchases.length})</h2>
        <button className="btn btn-success" style={{ marginRight: "8px" }} onClick={() => exportToCSV(filtered, "purchases", [{key:"purchase_no",label:"PUR #"},{key:"purchase_date",label:"Date"},{key:"type",label:"Type"},{key:"reference_no",label:"Reference"},{key:"item_name",label:"Item"},{key:"quantity",label:"Qty"},{key:"unit_cost",label:"Unit Cost"},{key:"total_cost",label:"Total"},{key:"supplier",label:"Supplier"},{key:"purchased_by",label:"Paid By"}])}>Export CSV</button><button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? 'Cancel' : '+ New Purchase'}
        </button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Summary */}
      <div className="cards-grid" style={{ marginBottom: '16px' }}>
        <div className="card success">
          <h3>Total Purchases</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{totalCost.toLocaleString()}</div>
          <div className="sub">SAR ({filtered.length} items)</div>
        </div>
        <div className="card">
          <h3>Company Paid</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{companyCost.toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card warning">
          <h3>Contractor Paid</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{contractorCost.toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3>New Purchase</h3>
          <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="form-group"><label>Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="Work Order">Work Order</option>
                <option value="Project">Project</option>
                <option value="General">General</option>
                <option value="Inventory">Inventory</option>
              </select>
            </div>
            <div className="form-group"><label>Reference #</label><input value={form.referenceNo} onChange={e => setForm({ ...form, referenceNo: e.target.value })} placeholder="WO # or Project #" /></div>
            <div className="form-group"><label>Item Name *</label><input value={form.itemName} onChange={e => setForm({ ...form, itemName: e.target.value })} required /></div>
            <div className="form-group"><label>Quantity</label><input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Unit Cost (SAR)</label><input type="number" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: Number(e.target.value) })} /></div>
            <div className="form-group"><label>Supplier</label><input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
            <div className="form-group"><label>Purchased By</label>
              <select value={form.purchasedBy} onChange={e => setForm({ ...form, purchasedBy: e.target.value })}>
                <option value="Company">Company</option>
                <option value="Contractor">Contractor</option>
              </select>
            </div>
            <div className="form-group"><label>Purchase Date</label><input type="date" value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}></textarea></div>
          <div className="btn-row">
            <button type="submit" className="btn btn-success">Save Purchase</button>
            <button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Month</label>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="all">All Months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Type</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Purchased By</label>
          <select value={filterPurchasedBy} onChange={e => setFilterPurchasedBy(e.target.value)}>
            <option value="all">All</option>
            <option value="Company">Company</option>
            <option value="Contractor">Contractor</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn btn-warning" onClick={() => { setFilterMonth('all'); setFilterType('all'); setFilterPurchasedBy('all'); }} style={{ width: '100%' }}>Clear</button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="alert alert-info">No purchases yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>PUR #</th><th>Date</th><th>Type</th><th>Reference</th>
              <th>Item</th><th>Qty</th><th>Unit Cost</th><th>Total</th>
              <th>Supplier</th><th>Paid By</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 'bold' }}>{p.purchase_no}</td>
                <td>{p.purchase_date}</td>
                <td>{p.type}</td>
                <td>{p.reference_no || '-'}</td>
                <td>{p.item_name}</td>
                <td>{p.quantity}</td>
                <td>{Number(p.unit_cost || 0).toLocaleString()}</td>
                <td style={{ fontWeight: 'bold' }}>{Number(p.total_cost || 0).toLocaleString()}</td>
                <td>{p.supplier || '-'}</td>
                <td>
                  <span className="status-badge" style={{ background: p.purchased_by === 'Contractor' ? '#fef3c7' : '#dbeafe', color: p.purchased_by === 'Contractor' ? '#b45309' : '#1e40af' }}>
                    {p.purchased_by}
                  </span>
                </td>
                <td>
                  <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleDelete(p.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}


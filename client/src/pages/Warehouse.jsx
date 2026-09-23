import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';
import { printContent } from '../api/print';

export default function Warehouse({ user, access = {} }) {
  const canWork = user?.role === 'Owner' || !!access?.warehouse?.can_work;
  const [subTab, setSubTab] = useState('inventory');
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [actionModal, setActionModal] = useState(null); // 'in' | 'out' | 'transfer'
  const [selectedItem, setSelectedItem] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const [form, setForm] = useState({
    code: '', name: '', category: 'General', unit: 'PCS',
    quantity: 0, minStock: 5, unitCost: 0, location: 'Main Warehouse', supplier: '', notes: ''
  });

  const [actionForm, setActionForm] = useState({
    quantity: 0, location: 'Main Warehouse', toLocation: '', referenceNo: '', notes: '', date: ''
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [i, t, l] = await Promise.all([
        api.get('/inventory'),
        api.get('/stock-transactions'),
        api.get('/inventory/low-stock')
      ]);
      setItems(i.data.items || []);
      setTransactions(t.data.transactions || []);
      setLowStock(l.data.items || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ code: '', name: '', category: 'General', unit: 'PCS', quantity: 0, minStock: 5, unitCost: 0, location: 'Main Warehouse', supplier: '', notes: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      if (editing) {
        await api.put('/inventory/' + editing.id, form);
        setMessage('Item updated');
      } else {
        await api.post('/inventory', form);
        setMessage('Item created');
      }
      resetForm();
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleEdit = (i) => {
    setForm({
      code: i.code, name: i.name, category: i.category, unit: i.unit,
      quantity: i.quantity, minStock: i.min_stock, unitCost: i.unit_cost,
      location: i.location, supplier: i.supplier || '', notes: i.notes || ''
    });
    setEditing(i);
    setShowForm(true);
  };

  const handleDelete = async (id, name) => {
    if (!confirm('Delete item "' + name + '"?')) return;
    try {
      await api.delete('/inventory/' + id);
      setMessage('Item deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const openAction = (type, item) => {
    setActionModal(type);
    setSelectedItem(item);
    setActionForm({
      quantity: 0, location: item.location || 'Main Warehouse',
      toLocation: '', referenceNo: '', notes: '',
      date: new Date().toISOString().slice(0, 10)
    });
  };

  const handleActionSubmit = async () => {
    setMessage(''); setError('');
    try {
      const payload = {
        itemCode: selectedItem.code,
        quantity: Number(actionForm.quantity),
        location: actionForm.location,
        toLocation: actionForm.toLocation,
        fromLocation: selectedItem.location,
        referenceNo: actionForm.referenceNo,
        notes: actionForm.notes,
        date: actionForm.date
      };
      if (actionModal === 'in') await api.post('/inventory/stock-in', payload);
      else if (actionModal === 'out') await api.post('/inventory/stock-out', payload);
      else if (actionModal === 'transfer') await api.post('/inventory/transfer', payload);
      setMessage('Transaction completed');
      setActionModal(null);
      setSelectedItem(null);
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const filtered = items.filter(i => {
    const matchSearch = search === '' ||
      (i.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (i.code || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || i.category === filterCategory;
    return matchSearch && matchCat;
  });

  const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
  const totalValue = items.reduce((s, i) => s + (i.quantity * i.unit_cost), 0);

  const getStockBadge = (item) => {
    if (item.quantity <= 0) return <span className="status-badge status-urgent">Out of Stock</span>;
    if (item.quantity <= item.min_stock) return <span className="status-badge status-warning">Low Stock</span>;
    return <span className="status-badge status-safe">In Stock</span>;
  };

  return (
    <div>
      <div className="sub-nav">
        <button className={subTab === 'inventory' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('inventory')}>Inventory</button>
        <button className={subTab === 'transactions' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('transactions')}>Transactions</button>
        <button className={subTab === 'low-stock' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('low-stock')}>Low Stock ({lowStock.length})</button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {subTab === 'inventory' && (
        <div className="panel">
          <div style={{ background: 'linear-gradient(135deg, #1e40af, #60a5fa)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Inventory</h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            
            <button className="btn btn-secondary" style={{ marginRight: "8px" }} onClick={() => printContent("Warehouse Inventory", search ? "Search: " + search : "All warehouse inventory")}>🖨️ Print</button><button className="btn btn-success" style={{ marginRight: "8px" }} onClick={() => {
                const byCode = {};
                transactions.forEach(t => {
                  const code = t.item_code || '';
                  if (!byCode[code]) byCode[code] = { inQty: 0, outQty: 0, transferQty: 0 };
                  const q = Number(t.quantity) || 0;
                  if (t.type === 'IN') byCode[code].inQty += q;
                  else if (t.type === 'OUT') byCode[code].outQty += q;
                  else if (t.type === 'TRANSFER') byCode[code].transferQty += q;
                });
                const report = filtered.map(i => ({
                  code: i.code,
                  name: i.name,
                  category: i.category,
                  quantity: i.quantity,
                  unit: i.unit,
                  min_stock: i.min_stock,
                  unit_cost: i.unit_cost,
                  location: i.location,
                  supplier: i.supplier || '',
                  IN: byCode[i.code]?.inQty || 0,
                  OUT: byCode[i.code]?.outQty || 0,
                  TRANSFER: byCode[i.code]?.transferQty || 0,
                  balance: i.quantity
                }));
                exportToCSV(report, "inventory", [
                  {key:"code",label:"Code"},
                  {key:"name",label:"Name"},
                  {key:"category",label:"Category"},
                  {key:"quantity",label:"Current Balance"},
                  {key:"unit",label:"Unit"},
                  {key:"min_stock",label:"Min Stock"},
                  {key:"unit_cost",label:"Unit Cost (SAR)"},
                  {key:"location",label:"Location"},
                  {key:"supplier",label:"Supplier"},
                  {key:"IN",label:"IN"},
                  {key:"OUT",label:"OUT"},
                  {key:"TRANSFER",label:"TRANSFER"},
                  {key:"balance",label:"Balance"}
                ]);
              }}>Export CSV</button>{canWork && <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
              {showForm ? 'Cancel' : '+ Add Item'}
            </button>}
          </div>

          <div className="cards-grid" style={{ marginBottom: '20px' }}>
            <div className="card success">
              <h3>Total Items</h3>
              <div className="big-number" style={{ color: '#16a34a' }}>{items.length}</div>
              <div className="sub">Active SKUs</div>
            </div>
            <div className="card danger">
              <h3>Low Stock</h3>
              <div className="big-number" style={{ color: '#dc2626' }}>{lowStock.length}</div>
              <div className="sub">Need reorder</div>
            </div>
            <div className="card">
              <h3>Total Value</h3>
              <div className="big-number" style={{ color: '#1e3a8a' }}>{Number(totalValue).toLocaleString()}</div>
              <div className="sub">SAR</div>
            </div>
          </div>

          {showForm && canWork && (
            <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3>{editing ? 'Edit Item' : 'New Item'}</h3>
              <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="form-group"><label>Code *</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required placeholder="e.g. OIL-5W30" /></div>
                <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Engine Oil 5W30" /></div>
                <div className="form-group"><label>Category</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    <option value="General">General</option>
                    <option value="Oil">Oil</option>
                    <option value="Filters">Filters</option>
                    <option value="Tires">Tires</option>
                    <option value="Spare Parts">Spare Parts</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Plumbing">Plumbing</option>
                    <option value="Tools">Tools</option>
                    <option value="Safety">Safety</option>
                  </select>
                </div>
                <div className="form-group"><label>Unit</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                    <option value="PCS">PCS</option>
                    <option value="LTR">LTR</option>
                    <option value="KG">KG</option>
                    <option value="M">M</option>
                    <option value="BOX">BOX</option>
                    <option value="SET">SET</option>
                  </select>
                </div>
                <div className="form-group"><label>Quantity</label><input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
                <div className="form-group"><label>Min Stock</label><input type="number" value={form.minStock} onChange={e => setForm({ ...form, minStock: Number(e.target.value) })} /></div>
                <div className="form-group"><label>Unit Cost (SAR)</label><input type="number" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: Number(e.target.value) })} /></div>
                <div className="form-group"><label>Location</label><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
                <div className="form-group"><label>Supplier</label><input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
              </div>
              <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}></textarea></div>
              <div className="btn-row">
                <button type="submit" className="btn btn-success">{editing ? 'Update' : 'Save'}</button>
                <button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button>
              </div>
            </form>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Search</label>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or Code" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Category</label>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="all">All</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-warning" onClick={() => { setSearch(''); setFilterCategory('all'); }} style={{ width: '100%' }}>Clear</button>
            </div>
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="alert alert-info">No items found. Add your first item.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Category</th><th>Qty</th><th>Unit</th>
                  <th>Min</th><th>Unit Cost</th><th>Location</th><th>Status</th><th>IN</th><th>OUT</th><th>TRANSFER</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 'bold' }}>{i.code}</td>
                    <td>{i.name}</td>
                    <td>{i.category}</td>
                    <td style={{ fontWeight: 'bold', color: i.quantity <= i.min_stock ? '#dc2626' : '#16a34a' }}>
                      {i.quantity}
                    </td>
                    <td>{i.unit}</td>
                    <td>{i.min_stock}</td>
                    <td>{Number(i.unit_cost).toLocaleString()}</td>
                    <td>{i.location}</td>
                    <td>{getStockBadge(i)}</td>
                    <td>{canWork && <button className="btn btn-success" style={{ padding: '5px 8px', fontSize: '11px' }} onClick={() => openAction('in', i)}>IN</button>}</td>
                    <td>{canWork && <button className="btn btn-warning" style={{ padding: '5px 8px', fontSize: '11px' }} onClick={() => openAction('out', i)}>OUT</button>}</td>
                    <td>{canWork && <button className="btn" style={{ padding: '5px 8px', fontSize: '11px', background: '#8b5cf6', color: 'white' }} onClick={() => openAction('transfer', i)}>TRANSFER</button>}</td>
                    <td>
                      {canWork && <>
                        
                        <button className="btn btn-primary" style={{ padding: '5px 8px', fontSize: '11px', marginRight: '3px' }} onClick={() => handleEdit(i)}>Edit</button>
                        <button className="btn btn-danger" style={{ padding: '5px 8px', fontSize: '11px' }} onClick={() => handleDelete(i.id, i.name)}>Del</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {subTab === 'transactions' && (
        <div className="panel">
          <div style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)', padding: '14px 20px', borderRadius: '10px 10px 0 0', color: '#fff' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Stock Transactions</h2>
          </div>
          {transactions.length === 0 ? (
            <div className="alert alert-info">No transactions yet.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Date</th><th>Type</th><th>Item</th><th>Qty</th><th>From</th><th>To</th><th>Ref</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id}>
                    <td>{t.trans_date}</td>
                    <td>
                      <span className="status-badge" style={{
                        background: t.type === 'IN' ? '#dcfce7' : t.type === 'OUT' ? '#fee2e2' : '#fef3c7',
                        color: t.type === 'IN' ? '#16a34a' : t.type === 'OUT' ? '#dc2626' : '#b45309'
                      }}>
                        {t.type}
                      </span>
                    </td>
                    <td>{t.item_name} ({t.item_code})</td>
                    <td style={{ fontWeight: 'bold' }}>{t.quantity}</td>
                    <td>{t.from_location || '-'}</td>
                    <td>{t.to_location || '-'}</td>
                    <td>{t.reference_no || '-'}</td>
                    <td>{t.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {subTab === 'low-stock' && (
        <div className="panel">
          <div style={{ background: 'linear-gradient(135deg, #b91c1c, #ef4444)', padding: '14px 20px', borderRadius: '10px 10px 0 0', color: '#fff' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Low Stock Alerts</h2>
          </div>
          {lowStock.length === 0 ? (
            <div className="alert alert-success">All items are in stock</div>
          ) : (
            <table>
              <thead>
                <tr><th>Code</th><th>Name</th><th>Current</th><th>Min</th><th>Location</th><th>Action</th></tr>
              </thead>
              <tbody>
                {lowStock.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 'bold' }}>{i.code}</td>
                    <td>{i.name}</td>
                    <td style={{ color: '#dc2626', fontWeight: 'bold' }}>{i.quantity}</td>
                    <td>{i.min_stock}</td>
                    <td>{i.location}</td>
                    <td>{canWork && <button className="btn btn-success" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={() => openAction('in', i)}>Restock</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {actionModal && selectedItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '10px', maxWidth: '500px', width: '90%' }}>
            <h3 style={{ marginTop: 0 }}>
              {actionModal === 'in' ? 'Stock In' : actionModal === 'out' ? 'Stock Out' : 'Transfer'}
            </h3>
            <p style={{ color: '#64748b', fontSize: '14px' }}>{selectedItem.name} ({selectedItem.code}) — Current: {selectedItem.quantity} {selectedItem.unit}</p>

            <div className="form-group"><label>Quantity *</label><input type="number" value={actionForm.quantity} onChange={e => setActionForm({ ...actionForm, quantity: Number(e.target.value) })} /></div>

            {actionModal !== 'transfer' && (
              <div className="form-group">
                <label>Location</label>
                <input value={actionForm.location} onChange={e => setActionForm({ ...actionForm, location: e.target.value })} />
              </div>
            )}

            {actionModal === 'transfer' && (
              <div className="form-group">
                <label>To Location *</label>
                <input value={actionForm.toLocation} onChange={e => setActionForm({ ...actionForm, toLocation: e.target.value })} placeholder="Destination" />
              </div>
            )}

            <div className="form-group"><label>Reference No.</label><input value={actionForm.referenceNo} onChange={e => setActionForm({ ...actionForm, referenceNo: e.target.value })} placeholder="WO#, PO#, etc." /></div>
            <div className="form-group"><label>Date</label><input type="date" value={actionForm.date} onChange={e => setActionForm({ ...actionForm, date: e.target.value })} /></div>
            <div className="form-group"><label>Notes</label><textarea value={actionForm.notes} onChange={e => setActionForm({ ...actionForm, notes: e.target.value })} rows={2}></textarea></div>

            <div className="btn-row">
              {canWork && <button className="btn btn-success" onClick={handleActionSubmit}>Confirm</button>}
              <button className="btn btn-warning" onClick={() => { setActionModal(null); setSelectedItem(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


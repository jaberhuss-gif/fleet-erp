import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const monthKey = (value) => {
  if (!value) return '';
  const s = String(value);
  return s.length >= 7 ? s.slice(0, 7) : '';
};

const currentMonth = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

const monthLabel = (m) => {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export default function BuildingMaintenance({ user, access = {} }) {
  const [section, setSection] = useState(null);
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState({ workOrders: [], projects: [], purchases: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canWork = user?.role === 'Owner' || !!access?.building?.can_work || !!access?.projects?.can_work;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const [w, p, r] = await Promise.all([
          api.get('/work-orders'),
          api.get('/projects'),
          api.get('/purchases')
        ]);
        if (!alive) return;
        setData({
          workOrders: w.data.orders || [],
          projects: p.data.projects || [],
          purchases: r.data.purchases || []
        });
      } catch (e) {
        if (alive) setError(e.response?.data?.error || e.message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, []);

  const months = useMemo(() => {
    const set = new Set([currentMonth()]);
    data.workOrders.forEach(x => { const m = monthKey(x.reported_date || x.created_at); if (m) set.add(m); });
    data.projects.forEach(x => { const m = monthKey(x.start_date || x.created_at); if (m) set.add(m); });
    data.purchases.forEach(x => { const m = monthKey(x.purchase_date || x.created_at || x.month); if (m) set.add(m); });
    return [...set].sort().reverse();
  }, [data]);

  const rows = useMemo(() => {
    if (section === 'work-orders') return data.workOrders.filter(x => monthKey(x.reported_date || x.created_at) === month);
    if (section === 'projects') return data.projects.filter(x => monthKey(x.start_date || x.created_at) === month);
    if (section === 'purchases') return data.purchases.filter(x => monthKey(x.purchase_date || x.created_at || x.month) === month);
    return [];
  }, [data, section, month]);

  const title = section === 'work-orders' ? 'Work Orders' : section === 'projects' ? 'Projects' : 'Purchases';

  return (
    <div className="panel">
      <h2 style={{ marginBottom: 6 }}>Building Maintenance</h2>
      {!section ? (
        <>
          <div style={{ color: '#64748b', marginBottom: 20 }}>Monthly building maintenance workspace</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setSection('work-orders')}>Work Orders</button>
            <button className="btn btn-primary" onClick={() => setSection('projects')}>Projects</button>
            <button className="btn btn-primary" onClick={() => setSection('purchases')}>Purchases</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:16 }}>
            <button className="btn btn-warning" onClick={() => setSection(null)}>Back</button>
            <h3 style={{ margin:0 }}>{title} — {monthLabel(month)}</h3>
            <select value={month} onChange={e => setMonth(e.target.value)} style={{ padding:'8px 10px', borderRadius:6 }}>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {loading ? <div className="loading">Loading...</div> : (
            <div style={{ overflowX:'auto' }}>
              <table className="data-table" style={{ width:'100%' }}>
                <thead>
                  <tr>
                    {section === 'work-orders' && <>
                      <th>WO #</th><th>Date</th><th>Site</th><th>Category</th><th>Description</th><th>Status</th><th>Total Cost</th>
                    </>}
                    {section === 'projects' && <>
                      <th>Project</th><th>Start Date</th><th>Site</th><th>Type</th><th>Status</th><th>Budget</th><th>Spent</th>
                    </>}
                    {section === 'purchases' && <>
                      <th>Purchase #</th><th>Date</th><th>Type</th><th>Reference</th><th>Item</th><th>Qty</th><th>Total Cost</th><th>Supplier</th>
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={8} style={{ textAlign:'center', padding:24 }}>No records for {monthLabel(month)}</td></tr>}
                  {section === 'work-orders' && rows.map(x => (
                    <tr key={x.id}><td>{x.wo_number || x.work_order_no || x.id}</td><td>{x.reported_date || ''}</td><td>{x.site || ''}</td><td>{x.category || ''}</td><td>{x.description || ''}</td><td>{x.status || ''}</td><td>{Number(x.final_cost || x.total_cost || 0).toLocaleString()}</td></tr>
                  ))}
                  {section === 'projects' && rows.map(x => (
                    <tr key={x.id}><td>{x.name || ''}</td><td>{x.start_date || ''}</td><td>{x.site || ''}</td><td>{x.project_type || ''}</td><td>{x.status || ''}</td><td>{Number(x.budget || 0).toLocaleString()}</td><td>{Number(x.spent || 0).toLocaleString()}</td></tr>
                  ))}
                  {section === 'purchases' && rows.map(x => (
                    <tr key={x.id}><td>{x.purchase_no || x.id}</td><td>{x.purchase_date || ''}</td><td>{x.type || ''}</td><td>{x.reference_no || ''}</td><td>{x.item_name || ''}</td><td>{x.quantity || 0}</td><td>{Number(x.total_cost || 0).toLocaleString()}</td><td>{x.supplier || ''}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop:12, color:'#64748b', fontSize:13 }}>
            {rows.length} record(s) in {monthLabel(month)}. Previous months remain available from the month selector.
          </div>
        </>
      )}
    </div>
  );
}

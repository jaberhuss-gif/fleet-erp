import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../api/client';
import { printContent } from '../api/print';

export default function Reports() {
  const [data, setData] = useState(null);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterYear, setFilterYear] = useState('2026');
  const [filterSite, setFilterSite] = useState('all');
  const [subTab, setSubTab] = useState('financial');

  useEffect(() => { loadSites(); }, []);
  useEffect(() => { load(); }, [filterYear, filterSite]);

  const loadSites = async () => {
    try {
      const res = await api.get('/sites');
      setSites(res.data.sites || []);
    } catch (e) { /* ignore */ }
  };

  const load = async () => {
    try {
      setLoading(true);
      const params = [];
      if (filterYear !== 'all') params.push('year=' + filterYear);
      if (filterSite !== 'all') params.push('site=' + encodeURIComponent(filterSite));
      const url = '/reports/monthly' + (params.length ? '?' + params.join('&') : '');
      const res = await api.get(url);
      setData(res.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading">Loading report...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">No data</div>;

  const s = data.summary || {};
  const months = data.months || [];

  const chartData = months.map(m => ({
    month: m.month,
    WorkOrders: Number(m.woCost.toFixed(2)),
    Projects: Number(m.projSpent.toFixed(2)),
    Purchases: Number(m.purCost.toFixed(2)),
    Total: Number(m.total.toFixed(2))
  }));

  return (
    <div>
      {/* ===== TABS ===== */}
      <div className="sub-nav" style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <button className={subTab === 'financial' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('financial')}>📊 Financial Reports</button>
        <button className={subTab === 'fleet' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('fleet')}>🔧 Fleet Maintenance</button>
      </div>

      {subTab === 'fleet' ? (
        <FleetMaintenanceReport />
      ) : (
      <>
      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #6d28d9, #c084fc)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Monthly Report</h2>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: '12px' }}><button className="print-btn no-print" onClick={() => printContent("Monthly Financial Report", filterYear !== "all" ? "Year: " + filterYear : "")}>🖨️ Print Report</button></div>
        <p style={{ color: '#64748b', fontSize: '14px' }}>Combined maintenance costs breakdown by month.</p>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Year</label>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              <option value="all">All Years</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Site</label>
            <select value={filterSite} onChange={e => setFilterSite(e.target.value)}>
              <option value="all">All Sites</option>
              {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="cards-grid" style={{ marginBottom: '20px' }}>
        <div className="card success">
          <h3>Grand Total</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{Number(s.grandTotal || 0).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card">
          <h3>Work Orders</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{Number(s.totalWO || 0).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card">
          <h3>Projects</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{Number(s.totalProjects || 0).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card warning">
          <h3>Purchases</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{Number(s.totalPurchases || 0).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
      </div>

      <div className="cards-grid" style={{ marginBottom: '20px' }}>
        <div className="card success">
          <h3>Internal Cost</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{Number(s.totalInternal || 0).toLocaleString()}</div>
          <div className="sub">{s.internalPercent || 0}% of total</div>
        </div>
        <div className="card warning">
          <h3>Contractor Cost</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{Number(s.totalContractor || 0).toLocaleString()}</div>
          <div className="sub">{s.contractorPercent || 0}% of total</div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #5b21b6, #8b5cf6)', padding: '14px 20px', borderRadius: '10px 10px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Monthly Breakdown (SAR)</h2>
        </div>
        {chartData.length === 0 ? (
          <div className="alert alert-info">No data for selected filters.</div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="WorkOrders" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Projects" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Purchases" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Line Chart */}
      {chartData.length > 1 && (
        <div className="panel">
          <div style={{ background: 'linear-gradient(135deg, #4c1d95, #7c3aed)', padding: '14px 20px', borderRadius: '10px 10px 0 0', color: '#fff' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Total Trend (SAR)</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Total" stroke="#dc2626" strokeWidth={3} dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #4c1d95, #6d28d9)', padding: '14px 20px', borderRadius: '10px 10px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Detailed Breakdown</h2>
        </div>
        {months.length === 0 ? (
          <div className="alert alert-info">No data.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>WO Count</th>
                <th>WO Cost</th>
                <th>Projects</th>
                <th>Purchases</th>
                <th>Contractor</th>
                <th>Internal</th>
                <th style={{ background: '#dbeafe' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => (
                <tr key={m.month}>
                  <td style={{ fontWeight: 'bold' }}>{m.month}</td>
                  <td>{m.woCount}</td>
                  <td>{Number(m.woCost).toLocaleString()}</td>
                  <td>{Number(m.projSpent).toLocaleString()}</td>
                  <td>{Number(m.purCost).toLocaleString()}</td>
                  <td style={{ color: '#f59e0b' }}>{Number(m.woContractor + m.purContractor).toLocaleString()}</td>
                  <td style={{ color: '#16a34a' }}>{Number(m.woInternal + m.purCompany).toLocaleString()}</td>
                  <td style={{ fontWeight: 'bold', background: '#eff6ff' }}>{Number(m.total).toLocaleString()}</td>
                </tr>
              ))}
              <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                <td>TOTAL</td>
                <td>{months.reduce((s, m) => s + m.woCount, 0)}</td>
                <td>{Number(s.totalWO || 0).toLocaleString()}</td>
                <td>{Number(s.totalProjects || 0).toLocaleString()}</td>
                <td>{Number(s.totalPurchases || 0).toLocaleString()}</td>
                <td style={{ color: '#f59e0b' }}>{Number(s.totalContractor || 0).toLocaleString()}</td>
                <td style={{ color: '#16a34a' }}>{Number(s.totalInternal || 0).toLocaleString()}</td>
                <td style={{ background: '#dbeafe', color: '#1e3a8a' }}>{Number(s.grandTotal || 0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
      </>
      )}
    </div>
  );
}

function FleetMaintenanceReport() {
  const [period, setPeriod] = useState('month');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/periodic-maintenance?status=Completed');
      setRecords(res.data.records || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const start3Months = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const start6Months = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const startYear = new Date(now.getFullYear(), 0, 1);

  const filteredByPeriod = records.filter(r => {
    if (!r.completed_date) return false;
    const d = new Date(r.completed_date);
    if (period === 'month') return d >= startOfMonth;
    if (period === '3months') return d >= start3Months;
    if (period === '6months') return d >= start6Months;
    if (period === 'year') return d >= startYear;
    return true;
  });

  const filtered = filterType === 'all'
    ? filteredByPeriod
    : filteredByPeriod.filter(r => r.type === filterType);

  const totalCost = filtered.reduce((sum, r) => sum + Number(r.cost || 0), 0);
  const avgCost = filtered.length > 0 ? totalCost / filtered.length : 0;

  const byType = {
    oil_change: filtered.filter(r => r.type === 'oil_change').length,
    inspection: filtered.filter(r => r.type === 'inspection').length,
    '6_months_general': filtered.filter(r => r.type === '6_months_general').length
  };

  const monthKey = (d) => {
    const dt = new Date(d);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
  };

  const monthlyMap = {};
  filtered.forEach(r => {
    if (!r.completed_date) return;
    const k = monthKey(r.completed_date);
    if (!monthlyMap[k]) monthlyMap[k] = { month: k, count: 0, cost: 0 };
    monthlyMap[k].count += 1;
    monthlyMap[k].cost += Number(r.cost || 0);
  });
  const monthlyData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

  const typeLabels = {
    oil_change: '🛢️ Oil Change',
    inspection: '🔍 Inspection',
    '6_months_general': '🔧 General'
  };

  if (loading) return <div className="loading">Loading fleet reports...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>🔧 Fleet Maintenance Report</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Period</label>
            <select value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="month">This Month</option>
              <option value="3months">Last 3 Months</option>
              <option value="6months">Last 6 Months</option>
              <option value="year">This Year</option>
              <option value="all">All Time</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Type</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              <option value="oil_change">Oil Change</option>
              <option value="inspection">Inspection</option>
              <option value="6_months_general">General</option>
            </select>
          </div>
        </div>
      </div>

      <div className="cards-grid" style={{ marginBottom: '20px' }}>
        <div className="card success">
          <h3>Total Completed</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{filtered.length}</div>
          <div className="sub">Services</div>
        </div>
        <div className="card">
          <h3>Total Cost</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{Number(totalCost).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card warning">
          <h3>Average Cost</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{Number(avgCost).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
      </div>

      <div className="cards-grid" style={{ marginBottom: '20px' }}>
        <div className="card">
          <h3>🛢️ Oil Change</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{byType.oil_change}</div>
          <div className="sub">services</div>
        </div>
        <div className="card">
          <h3>🔍 Inspection</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{byType.inspection}</div>
          <div className="sub">services</div>
        </div>
        <div className="card">
          <h3>🔧 General</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{byType['6_months_general']}</div>
          <div className="sub">services</div>
        </div>
      </div>

      {monthlyData.length > 0 && (
        <div className="panel" style={{ marginBottom: '20px' }}>
          <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', padding: '14px 20px', borderRadius: '10px 10px 0 0', color: '#fff' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Monthly Breakdown</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" name="Services" fill="#1e3a8a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', padding: '14px 20px', borderRadius: '10px 10px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Completed Services ({filtered.length})</h2>
        </div>
        <div style={{ overflowX: 'auto', marginTop: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Vehicle</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Driver</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Technician</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Cost (SAR)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(r => (
                <tr key={r.id}>
                  <td style={{ padding: '10px 12px' }}>{r.completed_date ? String(r.completed_date).slice(0, 10) : '-'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{r.vehicle_plate || r.vehicle_id}</td>
                  <td style={{ padding: '10px 12px' }}>{r.driver_name || '-'}</td>
                  <td style={{ padding: '10px 12px' }}>{typeLabels[r.type] || r.type}</td>
                  <td style={{ padding: '10px 12px' }}>{r.technician || '-'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{Number(r.cost || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <div style={{ padding: '10px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
              Showing first 100 of {filtered.length}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


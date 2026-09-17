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
    </div>
  );
}


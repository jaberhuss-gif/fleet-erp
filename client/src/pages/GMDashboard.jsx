import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { getDashboard, getAlerts, getTickets } from '../api/client';
import LiveIssues from './LiveIssues';
import FinancialReport from './FinancialReport';
import { printContent } from '../api/print';
import api from '../api/client';

export default function GMDashboard() {
  const [subTab, setSubTab] = useState('overview');
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [building, setBuilding] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [d, a, t, b, r] = await Promise.all([
        getDashboard(),
        getAlerts(),
        getTickets(),
        api.get('/building/dashboard').then(x => x.data),
        api.get('/reports/monthly').then(x => x.data)
      ]);
      setData(d);
      setAlerts(a);
      setTickets(t.tickets || []);
      setBuilding(b);
      setReport(r);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">No data</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
        <div className="sub-nav" style={{ marginBottom: 0, flex: 1 }}>
        <button className={subTab === 'overview' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('overview')}>Overview</button>
        <button className={subTab === 'vehicles' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('vehicles')}>Vehicles</button>
        <button className={subTab === 'building' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('building')}>Building</button>
        <button className={subTab === 'financial' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('financial')}>Financial</button>
        <button className={subTab === 'charts' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('charts')}>Charts</button>
      </div>
        <button className="print-btn no-print" onClick={() => printContent("Dashboard Report")}>🖨️ Print</button>
      </div>

      {subTab === 'overview' && <OverviewTab data={data} tickets={tickets} />}
      {subTab === 'vehicles' && <VehiclesTab data={data} alerts={alerts} />}
      {subTab === 'building' && <BuildingTab building={building} />}
      {subTab === 'financial' && <FinancialReport />}
      {subTab === 'charts' && <ChartsTab data={data} tickets={tickets} />}
    </div>
  );
}

function OverviewTab({ data, tickets }) {
  return (
    <div>
      <LiveIssues />
      <OverviewContent data={data} tickets={tickets} />
    </div>
  );
}

function OverviewContent({ data, tickets }) {
  const statusData = [
    { name: 'Safe', value: data.vehicles.safe },
    { name: 'Warning', value: data.vehicles.warning },
    { name: 'Overdue', value: data.vehicles.urgent }
  ];
  const statusColors = ['#16a34a', '#f59e0b', '#dc2626'];
  const catCounts = {};
  tickets.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
  const catData = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));

  return (
    <div>
      <div className="cards-grid">
        <div className="card"><h3>Total Vehicles</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{data.vehicles.total}</div><div className="sub">In the fleet</div></div>
        <div className="card danger"><h3>Oil Overdue</h3><div className="big-number" style={{ color: '#dc2626' }}>{data.vehicles.urgent}</div><div className="sub">Need action</div></div>
        <div className="card warning"><h3>Warning</h3><div className="big-number" style={{ color: '#f59e0b' }}>{data.vehicles.warning}</div><div className="sub">Approaching 5000 km</div></div>
        <div className="card success"><h3>Safe</h3><div className="big-number" style={{ color: '#16a34a' }}>{data.vehicles.safe}</div><div className="sub">Good condition</div></div>
      </div>
      <div className="cards-grid">
        <div className="card"><h3>Open Tickets</h3><div className="big-number" style={{ color: '#f59e0b' }}>{data.tickets.open}</div><div className="sub">Active</div></div>
        <div className="card"><h3>Closed Tickets</h3><div className="big-number" style={{ color: '#16a34a' }}>{data.tickets.closed}</div><div className="sub">Resolved</div></div>
        <div className="card"><h3>Total Tickets</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{data.tickets.total}</div><div className="sub">All time</div></div>
        <div className="card danger"><h3>Tire Issues</h3><div className="big-number" style={{ color: '#dc2626' }}>{tickets.filter(t => t.category === 'Tires').length}</div><div className="sub">Tire related</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        <div className="panel">
          <h2>Fleet Status</h2>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={50} paddingAngle={2}>
                {statusData.map((e, i) => <Cell key={i} fill={statusColors[i]} />)}
              </Pie>
              <Tooltip />
              <Legend layout="vertical" verticalAlign="middle" align="right" />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h2>Top Categories</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={catData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={90} style={{ fontSize: '12px' }} />
              <Tooltip />
              <Bar dataKey="value" fill="#1e3a8a" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function VehiclesTab({ data, alerts }) {
  const allV = data.vehicles.list;
  return (
    <div>
      <div className="cards-grid">
        <div className="card danger"><h3>Urgent Overdue</h3><div className="big-number" style={{ color: '#dc2626' }}>{data.vehicles.urgent}</div><div className="sub">Immediate oil change</div></div>
        <div className="card warning"><h3>Warning</h3><div className="big-number" style={{ color: '#f59e0b' }}>{data.vehicles.warning}</div><div className="sub">Approaching limit</div></div>
        <div className="card success"><h3>Safe</h3><div className="big-number" style={{ color: '#16a34a' }}>{data.vehicles.safe}</div><div className="sub">Good condition</div></div>
        <div className="card"><h3>Total</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{data.vehicles.total}</div><div className="sub">All vehicles</div></div>
      </div>

      {alerts && alerts.urgent && alerts.urgent.length > 0 && (
        <div className="panel">
          <h2 style={{ color: '#dc2626' }}>Urgent - Oil Change Required ({alerts.urgent.length})</h2>
          <table>
            <thead><tr><th>Plate</th><th>Driver</th><th>Location</th><th>Current KM</th><th>Last Oil</th><th>Since Oil</th></tr></thead>
            <tbody>
              {alerts.urgent.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 'bold' }}>{v.plate}</td>
                  <td>{v.driver}</td>
                  <td>{v.location || '-'}</td>
                  <td>{v.currentKm.toLocaleString()}</td>
                  <td>{v.lastOilKm.toLocaleString()}</td>
                  <td style={{ color: '#dc2626', fontWeight: 'bold' }}>{v.sinceOil.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {alerts && alerts.warning && alerts.warning.length > 0 && (
        <div className="panel">
          <h2 style={{ color: '#f59e0b' }}>Warning - Approaching Oil Change ({alerts.warning.length})</h2>
          <table>
            <thead><tr><th>Plate</th><th>Driver</th><th>Location</th><th>Current KM</th><th>Since Oil</th><th>Remaining</th></tr></thead>
            <tbody>
              {alerts.warning.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 'bold' }}>{v.plate}</td>
                  <td>{v.driver}</td>
                  <td>{v.location || '-'}</td>
                  <td>{v.currentKm.toLocaleString()}</td>
                  <td style={{ color: '#f59e0b', fontWeight: 'bold' }}>{v.sinceOil.toLocaleString()}</td>
                  <td>{v.remaining.toLocaleString()} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <h2>All Vehicles ({allV.length})</h2>
        <table>
          <thead><tr><th>Plate</th><th>Make/Model</th><th>Driver</th><th>Location</th><th>Current KM</th><th>Since Oil</th><th>Status</th></tr></thead>
          <tbody>
            {allV.map(v => (
              <tr key={v.id}>
                <td style={{ fontWeight: 'bold' }}>{v.plate}</td>
                <td>{v.make} {v.model} ({v.year})</td>
                <td>{v.driver}</td>
                <td>{v.location || '-'}</td>
                <td>{v.currentKm.toLocaleString()}</td>
                <td>{v.sinceOil.toLocaleString()}</td>
                <td>
                  <span className={'status-badge ' + (v.status === 'Urgent Overdue' ? 'status-urgent' : v.status === 'Warning' ? 'status-warning' : 'status-safe')}>
                    {v.status === 'Urgent Overdue' ? 'Overdue' : v.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BuildingTab({ building }) {
  if (!building) return <div className="loading">Loading building data...</div>;
  const wo = building.workOrders || {};
  const proj = building.projects || {};
  const pur = building.purchases || {};

  return (
    <div>
      <div className="cards-grid">
        <div className="card"><h3>Total Work Orders</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{wo.total || 0}</div><div className="sub">All time</div></div>
        <div className="card warning"><h3>Open</h3><div className="big-number" style={{ color: '#f59e0b' }}>{wo.open || 0}</div><div className="sub">In progress</div></div>
        <div className="card success"><h3>Closed</h3><div className="big-number" style={{ color: '#16a34a' }}>{wo.closed || 0}</div><div className="sub">Completed</div></div>
        <div className="card"><h3>Contractor</h3><div className="big-number" style={{ color: '#8b5cf6' }}>{wo.contractor || 0}</div><div className="sub">External</div></div>
      </div>
      <div className="cards-grid">
        <div className="card success"><h3>Total WO Cost</h3><div className="big-number" style={{ color: '#16a34a' }}>{Number(wo.totalCost || 0).toLocaleString()}</div><div className="sub">SAR</div></div>
        <div className="card warning"><h3>Contractor Cost</h3><div className="big-number" style={{ color: '#f59e0b' }}>{Number(wo.contractorCost || 0).toLocaleString()}</div><div className="sub">SAR</div></div>
        <div className="card"><h3>Projects</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{proj.total || 0}</div><div className="sub">Total projects</div></div>
        <div className="card"><h3>Purchases</h3><div className="big-number" style={{ color: '#8b5cf6' }}>{Number(pur.totalCost || 0).toLocaleString()}</div><div className="sub">SAR</div></div>
      </div>
      <div className="cards-grid">
        <div className="card"><h3>Total Project Budget</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{Number(proj.budget || 0).toLocaleString()}</div><div className="sub">SAR</div></div>
        <div className="card warning"><h3>Total Spent</h3><div className="big-number" style={{ color: '#f59e0b' }}>{Number(proj.spent || 0).toLocaleString()}</div><div className="sub">SAR</div></div>
        <div className="card success"><h3>Remaining</h3><div className="big-number" style={{ color: '#16a34a' }}>{Number((proj.budget || 0) - (proj.spent || 0)).toLocaleString()}</div><div className="sub">SAR</div></div>
      </div>


    </div>
  );
}

function FinancialTab({ report }) {
  if (!report) return <div className="loading">Loading financial data...</div>;
  const s = report.summary || {};
  const months = report.months || [];

  const totalCompanyPurchases = months.reduce((sum, m) => sum + m.purCompany, 0);
  const totalContractorPurchases = months.reduce((sum, m) => sum + m.purContractor, 0);

  return (
    <div>
      {/* MAINTENANCE */}
      <div className="panel" style={{ borderTop: '5px solid #1e3a8a' }}>
        <h2 style={{ color: '#1e3a8a', margin: 0 }}>General Maintenance (Work Orders)</h2>
        <p style={{ color: '#64748b', fontSize: '13px', marginTop: '6px' }}>Repair and maintenance — separate from development projects.</p>

        <div className="cards-grid" style={{ marginTop: '16px' }}>
          <div className="card" style={{ borderLeft: '5px solid #1e3a8a' }}>
            <h3>Total Maintenance</h3>
            <div className="big-number" style={{ color: '#1e3a8a', fontSize: '32px' }}>{Number(s.totalWO || 0).toLocaleString()}</div>
            <div className="sub">SAR — All work orders</div>
          </div>
          <div className="card success" style={{ borderLeft: '5px solid #16a34a' }}>
            <h3>Internal (Company)</h3>
            <div className="big-number" style={{ color: '#16a34a' }}>
              {Number(months.reduce((sum, m) => sum + m.woInternal, 0)).toLocaleString()}
            </div>
            <div className="sub">SAR — By company employees</div>
          </div>
          <div className="card warning" style={{ borderLeft: '5px solid #f59e0b' }}>
            <h3>Contractor</h3>
            <div className="big-number" style={{ color: '#f59e0b' }}>
              {Number(months.reduce((sum, m) => sum + m.woContractor, 0)).toLocaleString()}
            </div>
            <div className="sub">SAR — By external contractors</div>
          </div>
        </div>

        <h3 style={{ marginTop: '20px', color: '#475569' }}>Monthly Breakdown</h3>
        <table>
          <thead>
            <tr style={{ background: '#eff6ff' }}>
              <th>Month</th>
              <th>WO Count</th>
              <th style={{ color: '#16a34a' }}>Internal</th>
              <th style={{ color: '#f59e0b' }}>Contractor</th>
              <th style={{ color: '#1e3a8a' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {months.filter(m => m.woCount > 0).map(m => (
              <tr key={m.month}>
                <td style={{ fontWeight: 'bold' }}>{m.month}</td>
                <td>{m.woCount}</td>
                <td style={{ color: '#16a34a' }}>{Number(m.woInternal || 0).toLocaleString()}</td>
                <td style={{ color: '#f59e0b' }}>{Number(m.woContractor || 0).toLocaleString()}</td>
                <td style={{ fontWeight: 'bold', color: '#1e3a8a' }}>{Number(m.woCost).toLocaleString()}</td>
              </tr>
            ))}
            <tr style={{ background: '#dbeafe', fontWeight: 'bold' }}>
              <td>TOTAL</td>
              <td>{months.reduce((sum, m) => sum + m.woCount, 0)}</td>
              <td style={{ color: '#16a34a' }}>{Number(months.reduce((sum, m) => sum + m.woInternal, 0)).toLocaleString()}</td>
              <td style={{ color: '#f59e0b' }}>{Number(months.reduce((sum, m) => sum + m.woContractor, 0)).toLocaleString()}</td>
              <td style={{ color: '#1e3a8a', fontSize: '16px' }}>{Number(s.totalWO || 0).toLocaleString()} SAR</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* DEVELOPMENT */}
      <div className="panel" style={{ borderTop: '5px solid #16a34a' }}>
        <h2 style={{ color: '#16a34a', margin: 0 }}>Development Projects (Capital)</h2>
        <p style={{ color: '#64748b', fontSize: '13px', marginTop: '6px' }}>Development, expansion, and renovation — separate budget.</p>

        <div className="cards-grid" style={{ marginTop: '16px' }}>
          <div className="card" style={{ borderLeft: '5px solid #16a34a' }}>
            <h3>Total Development</h3>
            <div className="big-number" style={{ color: '#16a34a', fontSize: '32px' }}>{Number(s.totalProjects || 0).toLocaleString()}</div>
            <div className="sub">SAR — All projects</div>
          </div>
        </div>

        <h3 style={{ marginTop: '20px', color: '#475569' }}>Monthly Breakdown</h3>
        <table>
          <thead>
            <tr style={{ background: '#f0fdf4' }}>
              <th>Month</th>
              <th>Projects Count</th>
              <th style={{ color: '#16a34a' }}>Development Cost (SAR)</th>
            </tr>
          </thead>
          <tbody>
            {months.filter(m => m.projCount > 0).map(m => (
              <tr key={m.month}>
                <td style={{ fontWeight: 'bold' }}>{m.month}</td>
                <td>{m.projCount}</td>
                <td style={{ fontWeight: 'bold', color: '#16a34a' }}>{Number(m.projSpent).toLocaleString()}</td>
              </tr>
            ))}
            <tr style={{ background: '#dcfce7', fontWeight: 'bold' }}>
              <td>TOTAL</td>
              <td>{months.reduce((sum, m) => sum + m.projCount, 0)}</td>
              <td style={{ color: '#16a34a', fontSize: '16px' }}>{Number(s.totalProjects || 0).toLocaleString()} SAR</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* PURCHASES */}
      <div className="panel" style={{ borderTop: '5px solid #f59e0b' }}>
        <h2 style={{ color: '#f59e0b', margin: 0 }}>Purchases</h2>
        <p style={{ color: '#64748b', fontSize: '13px', marginTop: '6px' }}>Materials and items purchased.</p>

        <div className="cards-grid" style={{ marginTop: '16px' }}>
          <div className="card" style={{ borderLeft: '5px solid #f59e0b' }}>
            <h3>Total Purchases</h3>
            <div className="big-number" style={{ color: '#f59e0b', fontSize: '32px' }}>{Number(s.totalPurchases || 0).toLocaleString()}</div>
            <div className="sub">SAR</div>
          </div>
          <div className="card success" style={{ borderLeft: '5px solid #16a34a' }}>
            <h3>Company Paid</h3>
            <div className="big-number" style={{ color: '#16a34a' }}>{Number(totalCompanyPurchases).toLocaleString()}</div>
            <div className="sub">SAR</div>
          </div>
          <div className="card danger" style={{ borderLeft: '5px solid #dc2626' }}>
            <h3>Contractor Paid</h3>
            <div className="big-number" style={{ color: '#dc2626' }}>{Number(totalContractorPurchases).toLocaleString()}</div>
            <div className="sub">SAR</div>
          </div>
        </div>

        <h3 style={{ marginTop: '20px', color: '#475569' }}>Monthly Breakdown</h3>
        <table>
          <thead>
            <tr style={{ background: '#fffbeb' }}>
              <th>Month</th>
              <th>Items</th>
              <th style={{ color: '#16a34a' }}>Company</th>
              <th style={{ color: '#dc2626' }}>Contractor</th>
              <th style={{ color: '#f59e0b' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {months.filter(m => m.purCount > 0).map(m => (
              <tr key={m.month}>
                <td style={{ fontWeight: 'bold' }}>{m.month}</td>
                <td>{m.purCount}</td>
                <td style={{ color: '#16a34a' }}>{Number(m.purCompany).toLocaleString()}</td>
                <td style={{ color: '#dc2626' }}>{Number(m.purContractor).toLocaleString()}</td>
                <td style={{ fontWeight: 'bold', color: '#f59e0b' }}>{Number(m.purCost).toLocaleString()}</td>
              </tr>
            ))}
            <tr style={{ background: '#fef3c7', fontWeight: 'bold' }}>
              <td>TOTAL</td>
              <td>{months.reduce((sum, m) => sum + m.purCount, 0)}</td>
              <td style={{ color: '#16a34a' }}>{Number(totalCompanyPurchases).toLocaleString()}</td>
              <td style={{ color: '#dc2626' }}>{Number(totalContractorPurchases).toLocaleString()}</td>
              <td style={{ color: '#f59e0b', fontSize: '16px' }}>{Number(s.totalPurchases || 0).toLocaleString()} SAR</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const CHART_COLORS = ['#1e3a8a', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];

function ChartsTab({ data, tickets }) {
  if (!data) return <div className="loading">Loading charts...</div>;

  const vehicles = data.vehicles?.list || [];

  // Category data — top 8 + Others
  const catCounts = {};
  tickets.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const top8 = sortedCats.slice(0, 8).map(([name, value]) => ({ name, value }));
  const restCount = sortedCats.slice(8).reduce((s, [, v]) => s + v, 0);
  const categoryData = restCount > 0 ? [...top8, { name: 'Others', value: restCount }] : top8;

  // Monthly data
  const monthCounts = {};
  tickets.forEach(t => {
    const m = String(t.opened_at || '').slice(0, 7);
    if (m) monthCounts[m] = (monthCounts[m] || 0) + 1;
  });
  const monthlyData = Object.entries(monthCounts)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Vehicle status data
  const statusData = [
    { name: 'Safe', value: data.vehicles.safe },
    { name: 'Warning', value: data.vehicles.warning },
    { name: 'Overdue', value: data.vehicles.urgent }
  ];
  const statusColors = ['#16a34a', '#f59e0b', '#dc2626'];

  // Location data
  const locationCounts = {};
  vehicles.forEach(v => {
    if (v.location) locationCounts[v.location] = (locationCounts[v.location] || 0) + 1;
  });
  const locationData = Object.entries(locationCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Top 10 vehicles with most tickets
  const vehicleTicketCounts = {};
  tickets.forEach(t => {
    if (t.plate) vehicleTicketCounts[t.plate] = (vehicleTicketCounts[t.plate] || 0) + 1;
  });
  const topVehicles = Object.entries(vehicleTicketCounts)
    .map(([plate, count]) => ({ plate, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <div>
      <div className="panel">
        <h2>📊 Fleet Analytics Charts</h2>
        <p style={{ color: '#64748b', fontSize: '14px' }}>Visual overview of fleet data and maintenance tickets.</p>
      </div>

      {/* Row 1: Category Pie + Fleet Status Pie */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="panel">
          <h2>Tickets by Category</h2>
          {categoryData.length === 0 ? (
            <div className="alert alert-info">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={50} paddingAngle={2}>
                  {categoryData.map((entry, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '13px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <h2>Fleet Status</h2>
          {vehicles.length === 0 ? (
            <div className="alert alert-info">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={50} paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {statusData.map((entry, i) => <Cell key={i} fill={statusColors[i]} />)}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '13px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row 2: Monthly Trend */}
      <div className="panel">
        <h2>Monthly Tickets Trend</h2>
        {monthlyData.length === 0 ? (
          <div className="alert alert-info">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#1e3a8a" radius={[6, 6, 0, 0]}>
                {monthlyData.map((entry, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Row 3: Top Vehicles + Location */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="panel">
          <h2>Top 10 Vehicles (Most Tickets)</h2>
          {topVehicles.length === 0 ? (
            <div className="alert alert-info">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={topVehicles} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="plate" type="category" width={95} style={{ fontSize: '12px' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#dc2626" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <h2>Vehicles by Location</h2>
          {locationData.length === 0 ? (
            <div className="alert alert-info">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={locationData} margin={{ top: 10, right: 30, left: 0, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" height={100} interval={0} style={{ fontSize: '12px' }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}




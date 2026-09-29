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
  const [selectedMonth, setSelectedMonth] = useState('');
  const [rangeMonths, setRangeMonths] = useState('12');
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

  const allMonths = data.months || [];
  const monthOptions = allMonths.map(m => m.month);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const activeMonth = selectedMonth || (monthOptions.includes(currentMonth) ? currentMonth : monthOptions[monthOptions.length - 1]);
  const rangeCount = Number(rangeMonths) || 12;
  const activeIndex = Math.max(0, monthOptions.indexOf(activeMonth));
  const months = allMonths.slice(Math.max(0, activeIndex - rangeCount + 1), activeIndex + 1);
  const s = {
    grandTotal: months.reduce((x,m)=>x+Number(m.total||0),0),
    totalWO: months.reduce((x,m)=>x+Number(m.woCost||0),0),
    totalProjects: months.reduce((x,m)=>x+Number(m.projSpent||0),0),
    totalPurchases: months.reduce((x,m)=>x+Number(m.purCost||0),0),
    totalContractor: months.reduce((x,m)=>x+Number(m.woContractor||0)+Number(m.purContractor||0),0),
    totalInternal: months.reduce((x,m)=>x+Number(m.woInternal||0)+Number(m.purCompany||0),0)
  };
  const sTotal = s.totalContractor + s.totalInternal;
  s.internalPercent = sTotal ? (s.totalInternal/sTotal)*100 : 0;
  s.contractorPercent = sTotal ? (s.totalContractor/sTotal)*100 : 0;

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
        <button className={subTab === 'building' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('building')}>🏢 Building Maintenance</button>
      </div>

      {subTab === 'fleet' ? (
        <FleetMaintenanceReport />
      ) : subTab === 'building' ? (
        <BuildingMaintenanceReport />
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
              <option value="all">Current Year</option>
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
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Report Range</label>
            <select value={rangeMonths} onChange={e => setRangeMonths(e.target.value)}>
              <option value="1">Selected Month</option>
              <option value="3">Last 3 Months</option>
              <option value="6">Last 6 Months</option>
              <option value="12">Last 12 Months</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Month</label>
            <select value={activeMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Monthly Details</h2>
        </div>
        {months.length === 0 ? (
          <div className="alert alert-info">No data.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>WO Count</th>
                <th>Internal WO</th>
                <th>Contractor WO</th>
                <th>WO Cost</th>
                <th>Project Count</th>
                <th>Project Cost</th>
                <th>Purchase Count</th>
                <th>Purchase Cost</th>
                <th>Contractor Cost</th>
                <th>Internal Cost</th>
                <th style={{ background: '#dbeafe' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => (
                <tr key={m.month}>
                  <td style={{ fontWeight: 'bold' }}>{m.month}</td>
                  <td>{m.woCount}</td>
                  <td>{m.woInternalCount || 0}</td>
                  <td>{m.woContractorCount || 0}</td>
                  <td>{Number(m.woCost).toLocaleString()}</td>
                  <td>{m.projCount || 0}</td>
                  <td>{Number(m.projSpent).toLocaleString()}</td>
                  <td>{m.purCount || 0}</td>
                  <td>{Number(m.purCost).toLocaleString()}</td>
                  <td style={{ color: '#f59e0b' }}>{Number(m.woContractor + m.purContractor).toLocaleString()}</td>
                  <td style={{ color: '#16a34a' }}>{Number(m.woInternal + m.purCompany).toLocaleString()}</td>
                  <td style={{ fontWeight: 'bold', background: '#eff6ff' }}>{Number(m.total).toLocaleString()}</td>
                </tr>
              ))}
              <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                <td>TOTAL</td>
                <td>{months.reduce((x, m) => x + Number(m.woCount || 0), 0)}</td>
                <td>{months.reduce((x, m) => x + Number(m.woInternalCount || 0), 0)}</td>
                <td>{months.reduce((x, m) => x + Number(m.woContractorCount || 0), 0)}</td>
                <td>{Number(s.totalWO || 0).toLocaleString()}</td>
                <td>{months.reduce((x, m) => x + Number(m.projCount || 0), 0)}</td>
                <td>{Number(s.totalProjects || 0).toLocaleString()}</td>
                <td>{months.reduce((x, m) => x + Number(m.purCount || 0), 0)}</td>
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

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      // Fleet maintenance is ticket-driven: vehicle Maintenance tickets are
      // the source of truth for issues such as today's A/C repair. Periodic
      // service records are merged only for completed scheduled services.
      const [ticketRes, periodicRes] = await Promise.all([
        api.get('/tickets'),
        api.get('/periodic-maintenance?status=Completed')
      ]);
      const tickets = (ticketRes.data?.tickets || [])
        .filter(t => String(t.category || '').toLowerCase() === 'maintenance')
        .map(t => ({
          id: 'ticket-' + t.id,
          date: t.opened_at || t.created_at,
          vehicle_plate: t.plate || t.vehicle_plate || t.vehicle_id,
          driver_name: t.driver_name || t.reported_by || '-',
          type: 'ticket',
          technician: t.performed_by || t.assigned_to || '-',
          cost: Number(t.final_cost || t.cost || 0),
          source: 'Vehicle Ticket',
          description: t.description || ''
        }));

      const periodic = (periodicRes.data?.records || []).map(r => ({
        id: 'periodic-' + r.id,
        date: r.completed_date || r.created_at,
        vehicle_plate: r.vehicle_plate || r.vehicle_id,
        driver_name: r.driver_name || '-',
        type: r.type || 'scheduled',
        technician: r.technician || '-',
        cost: Number(r.cost || 0),
        source: 'Scheduled Maintenance',
        description: ''
      }));

      setRecords([...tickets, ...periodic].filter(r => r.date));
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load fleet maintenance report');
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const starts = {
    month: new Date(now.getFullYear(), now.getMonth(), 1),
    '3months': new Date(now.getFullYear(), now.getMonth() - 2, 1),
    '6months': new Date(now.getFullYear(), now.getMonth() - 5, 1),
    year: new Date(now.getFullYear(), 0, 1),
    all: new Date(2000, 0, 1)
  };

  const filtered = records
    .filter(r => new Date(r.date) >= starts[period])
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalCost = filtered.reduce((sum, r) => sum + Number(r.cost || 0), 0);
  const avgCost = filtered.length ? totalCost / filtered.length : 0;
  const byType = {
    tickets: filtered.filter(r => r.type === 'ticket').length,
    oil_change: filtered.filter(r => r.type === 'oil_change').length,
    inspection: filtered.filter(r => r.type === 'inspection').length,
    general: filtered.filter(r => r.type === '6_months_general' || r.type === 'scheduled').length
  };

  const monthKey = d => {
    const dt = new Date(d);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
  };
  const monthlyMap = {};
  filtered.forEach(r => {
    const k = monthKey(r.date);
    if (!monthlyMap[k]) monthlyMap[k] = { month: k, count: 0, cost: 0 };
    monthlyMap[k].count += 1;
    monthlyMap[k].cost += Number(r.cost || 0);
  });
  const monthlyData = Object.values(monthlyMap).sort((a,b) => a.month.localeCompare(b.month));

  if (loading) return <div className="loading">Loading fleet reports...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>🔧 Fleet Maintenance Report</h2>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10, marginTop:16, background:'#f8fafc', padding:12, borderRadius:8 }}>
          <div className="form-group" style={{marginBottom:0}}>
            <label>Period</label>
            <select value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="month">This Month</option>
              <option value="3months">Last 3 Months</option>
              <option value="6months">Last 6 Months</option>
              <option value="year">This Year</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      <div className="cards-grid" style={{marginBottom:20}}>
        <div className="card success"><h3>Maintenance Records</h3><div className="big-number" style={{color:'#16a34a'}}>{filtered.length}</div><div className="sub">Tickets + scheduled services</div></div>
        <div className="card"><h3>Total Cost</h3><div className="big-number" style={{color:'#1e3a8a'}}>{totalCost.toLocaleString()}</div><div className="sub">SAR</div></div>
        <div className="card warning"><h3>Average Cost</h3><div className="big-number" style={{color:'#f59e0b'}}>{avgCost.toLocaleString()}</div><div className="sub">SAR</div></div>
        <div className="card"><h3>Vehicle Tickets</h3><div className="big-number" style={{color:'#1e3a8a'}}>{byType.tickets}</div><div className="sub">Maintenance issues</div></div>
      </div>

      {monthlyData.length > 0 && (
        <div className="panel" style={{marginBottom:20}}>
          <h2 style={{marginTop:0}}>Monthly Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend /><Bar dataKey="count" name="Maintenance Records" fill="#1e3a8a" /></BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="panel">
        <h2 style={{marginTop:0}}>Maintenance Records ({filtered.length})</h2>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:'#f1f5f9'}}>
              <th>Date</th><th>Vehicle</th><th>Driver</th><th>Type</th><th>Source</th><th>Technician</th><th>Cost (SAR)</th><th>Description</th>
            </tr></thead>
            <tbody>
              {filtered.slice(0,200).map(r => (
                <tr key={r.id}>
                  <td>{String(r.date).slice(0,10)}</td>
                  <td style={{fontWeight:700}}>{r.vehicle_plate || '-'}</td>
                  <td>{r.driver_name || '-'}</td>
                  <td>{r.type === 'ticket' ? '🛠️ Vehicle Issue' : r.type}</td>
                  <td>{r.source}</td>
                  <td>{r.technician || '-'}</td>
                  <td style={{textAlign:'right'}}>{Number(r.cost || 0).toLocaleString()}</td>
                  <td>{r.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <div className="alert alert-info" style={{marginTop:12}}>No vehicle maintenance records for the selected period.</div>}
        </div>
      </div>
    </div>
  );
}

function BuildingMaintenanceReport() {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [site, setSite] = useState('all');
  const [report, setReport] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(String(now.getFullYear()) + '-' + String(now.getMonth() + 1).padStart(2, '0'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, [year, site]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const qs = new URLSearchParams({ year });
      if (site !== 'all') qs.set('site', site);
      const res = await api.get('/reports/general-maintenance?' + qs.toString());
      setReport(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load maintenance report');
    } finally {
      setLoading(false);
    }
  };

  const money = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const monthLabel = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  };

  const months = report?.months || [];
  const selected = months.find(m => m.month === selectedMonth) || months[0] || {
    month: selectedMonth, totalWO: 0, contractorWO: 0, employeeWO: 0,
    contractorAmount: 0, employeeAmount: 0, partsAmount: 0, totalAmount: 0,
    contractors: [], employees: []
  };
  const sites = [...new Set((report?.orders || []).map(o => o.site).filter(Boolean))].sort();

  const detail = [...(selected.contractors || []), ...(selected.employees || [])]
    .sort((a, b) => b.amount - a.amount);

  if (loading) return <div className="loading">Loading general maintenance report...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #059669, #10b981)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>🏢 General Maintenance — Monthly Control</h2>
          <div style={{ marginTop: 6, fontSize: 13, opacity: .95 }}>
            ERP database only · Ordinary maintenance only · Projects excluded · Each month is calculated independently
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Year</label>
            <select value={year} onChange={e => setYear(e.target.value)}>
              {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y =>
                <option key={y} value={y}>{y}</option>
              )}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Site</label>
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">All Sites</option>
              {sites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="cards-grid" style={{ marginBottom: '20px' }}>
        <div className="card success">
          <h3>Total Work Orders</h3>
          <div className="big-number">{report?.totals?.totalWO || 0}</div>
          <div className="sub">General maintenance only</div>
        </div>
        <div className="card">
          <h3>Contractor WOs</h3>
          <div className="big-number">{report?.totals?.contractorWO || 0}</div>
          <div className="sub">{money(report?.totals?.contractorAmount)} SAR</div>
        </div>
        <div className="card">
          <h3>Employee WOs</h3>
          <div className="big-number">{report?.totals?.employeeWO || 0}</div>
          <div className="sub">{money(report?.totals?.employeeAmount)} SAR labor</div>
        </div>
        <div className="card">
          <h3>Total Cost</h3>
          <div className="big-number">{money(report?.totals?.totalAmount)}</div>
          <div className="sub">SAR</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '20px' }}>
        <div style={{ background: '#f1f5f9', padding: '12px 16px', borderRadius: '8px 8px 0 0', fontWeight: 700 }}>
          Monthly Maintenance Summary
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Month</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total WO</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Contractor WO</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Employee WO</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Contractor Amount</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Employee/Labor</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Parts</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => (
                <tr key={m.month}
                    onClick={() => setSelectedMonth(m.month)}
                    style={{ cursor: 'pointer', background: m.month === selected.month ? '#ecfdf5' : '#fff' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{monthLabel(m.month)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{m.totalWO}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{m.contractorWO}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{m.employeeWO}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{money(m.contractorAmount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{money(m.employeeAmount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{money(m.partsAmount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{money(m.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>
          September remains zero when there are no September work orders; no old-month data is carried into it.
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '20px' }}>
          <div style={{ background: '#f1f5f9', padding: '12px 16px', borderRadius: '8px 8px 0 0', fontWeight: 700 }}>
            Google Sheet — MonthlySavings (Temporary Source)
          </div>
          <div style={{ padding: '8px 12px', color: '#64748b', fontSize: 12 }}>
            This temporary view reads the MonthlySavings tab directly from Google Sheets. Selected month: {selected.month}.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {sheetHeaders.map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '10px 12px', whiteSpace: 'nowrap' }}>{h || ('Column ' + (i + 1))}</th>)}
              </tr></thead>
              <tbody>
                {(selectedSheetRows.length ? selectedSheetRows : sheetRows).map((row, ri) => (
                  <tr key={ri}>
                    {sheetHeaders.map((_, i) => <td key={i} style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{row[i] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: '20px' }}>
        <div style={{ background: '#f1f5f9', padding: '12px 16px', borderRadius: '8px 8px 0 0', fontWeight: 700 }}>
          {monthLabel(selected.month)} — Who Worked / Contractor Detail
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Contractor / Employee</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>WO Count</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Amount (SAR)</th>
              </tr>
            </thead>
            <tbody>
              {detail.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: 18, textAlign: 'center', color: '#64748b' }}>No general maintenance work orders in this month.</td></tr>
              ) : detail.map((p, i) => (
                <tr key={p.type + '|' + p.name + '|' + i}>
                  <td style={{ padding: '10px 12px' }}>{p.type}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{p.woCount}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div style={{ background: '#f1f5f9', padding: '12px 16px', borderRadius: '8px 8px 0 0', fontWeight: 700 }}>
          {monthLabel(selected.month)} — Work Orders
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>WO No</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Site</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Category</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Who Worked</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Type</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {(report?.orders || []).filter(o => String(o.reported_date).slice(0, 7) === selected.month).map(o => {
                const external = !!(o.contractor_name && !['company', 'internal'].includes(String(o.contractor_name).trim().toLowerCase()));
                return (
                  <tr key={o.id}>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{o.wo_no || '#' + o.id}</td>
                    <td style={{ padding: '10px 12px' }}>{String(o.reported_date || '').slice(0, 10) || '-'}</td>
                    <td style={{ padding: '10px 12px' }}>{o.site || '-'}</td>
                    <td style={{ padding: '10px 12px' }}>{o.category || '-'}</td>
                    <td style={{ padding: '10px 12px' }}>{external ? o.contractor_name : (o.assigned_to || 'Company / Internal')}</td>
                    <td style={{ padding: '10px 12px' }}>{external ? 'Contractor' : 'Employee'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{money(o.final_cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


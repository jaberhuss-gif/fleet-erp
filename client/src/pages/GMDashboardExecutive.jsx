import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useCallback, useEffect, useState } from 'react';
import { getAlerts, getDashboard, getTickets } from '../api/client';
import api from '../api/client';
import { printContent } from '../api/print';

const money = value => `${Number(value || 0).toLocaleString()} SAR`;
const pct = (value, total) => total > 0 ? Math.round((value / total) * 100) : 0;

function KPI({ label, value, note, tone = 'blue' }) {
  return (
    <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 14, padding: 18, minHeight: 108, boxShadow: '0 2px 8px rgba(15,23,42,.05)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: tone === 'red' ? '#dc2626' : tone === 'green' ? '#059669' : tone === 'amber' ? '#d97706' : '#1d4ed8', marginTop: 8 }}>{value}</div>
      {note && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{note}</div>}
    </div>
  );
}


function BuildingGMDetail({ view, selectedMonths, records, monthLabel }) {
  const monthSet = new Set(selectedMonths);
  const key = value => String(value || '').slice(0, 7);
  const filtered = view === 'work-orders'
    ? records.workOrders.filter(r => monthSet.has(key(r.reported_date || r.created_at)))
    : view === 'projects'
      ? records.projects.filter(r => monthSet.has(key(r.start_date || r.startDate || r.created_at)))
      : records.purchases.filter(r => monthSet.has(key(r.purchase_date || r.purchaseDate || r.created_at || r.month)));

  const title = view === 'work-orders' ? 'Building Maintenance – Work Orders' : view === 'projects' ? 'Building Projects' : 'Building Purchases';

  return (
    <div style={{ marginBottom: 20, background: 'var(--card-bg,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 5 }}>
            {selectedMonths.length ? selectedMonths.map(monthLabel).join(' • ') : 'No month selected'} • {filtered.length} record(s)
          </div>
        </div>
      </div>
      {!selectedMonths.length ? (
        <div className="alert alert-info">Select at least one month to view the records.</div>
      ) : !filtered.length ? (
        <div className="alert alert-info">No records found for the selected months.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>
              {view === 'work-orders' ? (
                <>
                  <th style={{textAlign:'left',padding:9}}>WO #</th><th style={{textAlign:'left',padding:9}}>Date</th><th style={{textAlign:'left',padding:9}}>Site</th><th style={{textAlign:'left',padding:9}}>Category</th><th style={{textAlign:'left',padding:9}}>Description</th><th style={{textAlign:'left',padding:9}}>Status</th><th style={{textAlign:'right',padding:9}}>Cost</th>
                </>
              ) : view === 'projects' ? (
                <>
                  <th style={{textAlign:'left',padding:9}}>Project</th><th style={{textAlign:'left',padding:9}}>Start Date</th><th style={{textAlign:'left',padding:9}}>Site</th><th style={{textAlign:'left',padding:9}}>Type</th><th style={{textAlign:'left',padding:9}}>Status</th><th style={{textAlign:'right',padding:9}}>Budget</th><th style={{textAlign:'right',padding:9}}>Spent</th>
                </>
              ) : (
                <>
                  <th style={{textAlign:'left',padding:9}}>Purchase #</th><th style={{textAlign:'left',padding:9}}>Date</th><th style={{textAlign:'left',padding:9}}>Type</th><th style={{textAlign:'left',padding:9}}>Reference</th><th style={{textAlign:'left',padding:9}}>Item</th><th style={{textAlign:'right',padding:9}}>Qty</th><th style={{textAlign:'right',padding:9}}>Total Cost</th><th style={{textAlign:'left',padding:9}}>Supplier</th>
                </>
              )}
            </tr></thead>
            <tbody>
              {filtered.map((r, i) => view === 'work-orders' ? (
                <tr key={r.id || i}><td style={{padding:9}}>{r.id || r.wo_number || '—'}</td><td style={{padding:9}}>{key(r.reported_date || r.created_at)}</td><td style={{padding:9}}>{r.site || '—'}</td><td style={{padding:9}}>{r.category || '—'}</td><td style={{padding:9}}>{r.description || '—'}</td><td style={{padding:9}}>{r.status || '—'}</td><td style={{padding:9,textAlign:'right'}}>{money(r.total_cost ?? r.totalCost ?? r.cost)}</td></tr>
              ) : view === 'projects' ? (
                <tr key={r.id || i}><td style={{padding:9}}>{r.name || r.project_name || '—'}</td><td style={{padding:9}}>{key(r.start_date || r.startDate || r.created_at)}</td><td style={{padding:9}}>{r.site || '—'}</td><td style={{padding:9}}>{r.project_type || r.projectType || r.type || '—'}</td><td style={{padding:9}}>{r.status || '—'}</td><td style={{padding:9,textAlign:'right'}}>{money(r.budget)}</td><td style={{padding:9,textAlign:'right'}}>{money(r.spent)}</td></tr>
              ) : (
                <tr key={r.id || i}><td style={{padding:9}}>{r.id || r.purchase_number || '—'}</td><td style={{padding:9}}>{key(r.purchase_date || r.purchaseDate || r.created_at || r.month)}</td><td style={{padding:9}}>{r.type || '—'}</td><td style={{padding:9}}>{r.reference_no || r.referenceNo || r.reference || '—'}</td><td style={{padding:9}}>{r.item_name || r.itemName || r.item || '—'}</td><td style={{padding:9,textAlign:'right'}}>{r.quantity ?? r.qty ?? 0}</td><td style={{padding:9,textAlign:'right'}}>{money(r.total_cost ?? r.totalCost ?? (Number(r.quantity || r.qty || 0) * Number(r.unit_cost || r.unitCost || 0)))}</td><td style={{padding:9}}>{r.supplier || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MonthlyBuildingCards({ rows }) {
  const months = rows.filter(row => row.month === '2026-07' || row.month === '2026-08');

  if (!months.length) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Building Maintenance & Projects — July & August 2026</h2>
        <div style={{ color: '#64748b', fontSize: 12, marginTop: 5 }}>
          Same Apps Script calculation logic: Maintenance = Contractor WO + Contractor Parts + Maintenance Salary; Projects = Contractor Development + Development Parts + Development Salary; Savings = Baseline − Actual.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
        {months.map(row => {
          const maintenanceBaseline = 20577;
          const developmentBaseline = 132551;
          const totalBaseline = maintenanceBaseline + developmentBaseline;
          const maintActual = Number(row.maintActual || 0);
          const devActual = Number(row.devActual || 0);
          const maintSavings = Number(row.maintSavings ?? (maintenanceBaseline - maintActual));
          const devSavings = Number(row.devSavings ?? (developmentBaseline - devActual));
          const totalActual = maintActual + devActual + Number(row.otherPurchases || 0);
          const totalSavings = Number(row.totalSavings ?? (maintSavings + devSavings));
          const totalSavingsPct = Number(row.totalSavingsPct ?? ((totalSavings / totalBaseline) * 100));
          const monthLabel = row.month === '2026-07' ? 'July 2026' : 'August 2026';

          return (
            <div key={row.month} style={{ background: 'var(--card-bg,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0 }}>{monthLabel}</h3>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{totalSavingsPct.toFixed(1)}% savings</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                <KPI label="Maintenance Actual" value={money(maintActual)} note={`${row.employeeWOCount || 0} internal WO • ${row.contractorWOCount || 0} contractor WO`} />
                <KPI label="Maintenance Savings" value={money(maintSavings)} note={`${Number(row.maintPct || (maintenanceBaseline ? maintSavings / maintenanceBaseline * 100 : 0)).toFixed(1)}% vs baseline`} tone="green" />
                <KPI label="Projects Actual" value={money(devActual)} note={`${Number(row.internalProjectCount || 0) + Number(row.contractorProjectCount || 0)} projects`} />
                <KPI label="Projects Savings" value={money(devSavings)} note={`${Number(row.devPct || (developmentBaseline ? devSavings / developmentBaseline * 100 : 0)).toFixed(1)}% vs baseline`} tone="green" />
                <KPI label="Total Actual" value={money(totalActual)} note={Number(row.otherPurchases || 0) ? `Other purchases ${money(row.otherPurchases)}` : 'Maintenance + Projects'} tone="amber" />
                <KPI label="Total Savings" value={money(totalSavings)} note={`Baseline ${money(totalBaseline)}`} tone="green" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GMDashboardExecutive() {
  const [section, setSection] = useState('overview');
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [building, setBuilding] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [monthFinancial, setMonthFinancial] = useState(null);
  const [buildingView, setBuildingView] = useState(null);
  const [buildingRecords, setBuildingRecords] = useState({ workOrders: [], projects: [], purchases: [] });
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const [dashboard, vehicleAlerts, ticketData, buildingData, financialData, monthFinancialData, workOrdersData, projectsData, purchasesData] = await Promise.all([
        getDashboard(),
        getAlerts(),
        getTickets(),
        api.get('/building/dashboard').then(r => r.data),
        api.get('/reports/financial').then(r => r.data),
        api.get('/dashboard/current-month-financials').then(r => r.data),
        api.get('/work-orders').then(r => r.data),
        api.get('/projects').then(r => r.data),
        api.get('/purchases').then(r => r.data),
      ]);
      setData(dashboard);
      setAlerts(vehicleAlerts);
      setTickets(ticketData?.tickets || []);
      setBuilding(buildingData);
      setFinancial(financialData);
      setMonthFinancial(monthFinancialData);
      setBuildingRecords({
        workOrders: workOrdersData?.orders || [],
        projects: projectsData?.projects || [],
        purchases: purchasesData?.purchases || [],
      });
      setUpdated(new Date());
    } catch (e) {
      setError(e?.message || 'Unable to load executive dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const timer = setInterval(load, 60000); return () => clearInterval(timer); }, [load]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading Executive Dashboard...</div>;
  if (error) return <div className="alert alert-error" style={{ margin: 24 }}>{error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center' }}>No dashboard data available.</div>;

  const vehicles = data.vehicles || {};
  const ticketSummary = data.tickets || {};
  const grand = financial?.grand || {};
  const reportMonths = financial?.months || financial?.rows || [];
  const availableMonths = Array.from(new Set([
    ...reportMonths.map(r => r.month).filter(Boolean),
    ...buildingRecords.workOrders.map(r => String(r.reported_date || r.created_at || '').slice(0, 7)).filter(Boolean),
    ...buildingRecords.projects.map(r => String(r.start_date || r.startDate || r.created_at || '').slice(0, 7)).filter(Boolean),
    ...buildingRecords.purchases.map(r => String(r.purchase_date || r.purchaseDate || r.created_at || r.month || '').slice(0, 7)).filter(Boolean),
    new Date().toISOString().slice(0, 7),
  ])).sort().reverse();
  const mtd = monthFinancial || {};
  const selected = selectedMonths.length ? selectedMonths : availableMonths.slice(0, 1);
  const toggleMonth = month => setSelectedMonths(prev => prev.includes(month) ? prev.filter(x => x !== month) : [...prev, month].sort());
  const selectLatestMonths = count => setSelectedMonths(availableMonths.slice(0, count));
  const monthLabel = month => {
    const [y, m] = String(month).split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const openTickets = Number(ticketSummary.open || 0);
  const totalTickets = Number(ticketSummary.total || 0);
  const fleetTotal = Number(vehicles.total || 0);
  const fleetHealth = pct(Number(vehicles.safe || 0), fleetTotal);
  const openVehicleAlerts = Number(vehicles.urgent || 0) + Number(vehicles.warning || 0);

  const sectionTitles = { overview: 'Executive Overview', fleet: 'Fleet Status', financial: 'Financial Summary' };

  return (
    <div className="gm-dashboard" style={{ padding: 20, maxWidth: 1500, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Executive Command Center</h1>
          <div style={{ color: '#64748b', marginTop: 5 }}>GM management view • Fleet, operations and financial performance</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{updated ? `Updated ${updated.toLocaleTimeString()}` : ''}</span>
          <button className="btn btn-secondary" onClick={load}>↻ Refresh</button>
          <button className="print-btn" onClick={() => printContent(sectionTitles[section], 'Executive Management Report')}>🖨️ Print Current Section</button>
        </div>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
        {[
          ['overview', '📊 Overview'],
          ['fleet', '🚗 Fleet Status'],
          ['financial', '💰 Financial Summary']
        ].map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)} className={section === id ? 'btn btn-primary' : 'btn btn-secondary'}>{label}</button>
        ))}
      </div>

      {section === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginBottom: 20 }}>
            <KPI label="Fleet Health" value={`${fleetHealth}%`} note={`${vehicles.safe || 0} of ${fleetTotal} vehicles safe`} tone="green" />
            <KPI label="Open Tickets" value={openTickets} note={`${pct(openTickets, totalTickets)}% of all tickets`} tone={openTickets ? 'amber' : 'green'} />
            <KPI label="Vehicle Alerts" value={openVehicleAlerts} note={`${vehicles.urgent || 0} urgent • ${vehicles.warning || 0} warning`} tone={openVehicleAlerts ? 'red' : 'green'} />
            <KPI label="Total Savings" value={money(grand.totalSavings)} note={`${Number(grand.totalSavingsPct || 0).toFixed(1)}% reported savings`} tone="green" />
            <KPI label="Actual Cost" value={money(grand.totalActual)} note={`Baseline ${money(grand.totalBaseline)}`} />
          </div>

          <MonthlyBuildingCards rows={reportMonths} />

          <div style={{ marginBottom: 20, background: 'var(--card-bg,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 14, padding: 18 }}>
            <h2 style={{ margin: '0 0 6px' }}>Building Maintenance & Projects</h2>
            <div style={{ color: '#64748b', fontSize: 12, marginBottom: 14 }}>
              Choose what the GM wants to review, then select one or more months. You can select 1, 3, 6 or all 12 months, or manually choose any months.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {[
                ['work-orders', '🔧 Building Maintenance – Work Orders'],
                ['projects', '🏗️ Building Projects'],
                ['purchases', '🛒 Building Purchases'],
              ].map(([id, label]) => (
                <button key={id} className={buildingView === id ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setBuildingView(id)}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ marginRight: 4 }}>Period:</strong>
                {[1, 3, 6, 12].map(n => (
                  <button key={n} className="btn btn-secondary" onClick={() => selectLatestMonths(n)} disabled={!availableMonths.length}>
                    {n === 12 ? 'Full Year' : n === 1 ? '1 Month' : `${n} Months`}
                  </button>
                ))}
                <button className="btn btn-secondary" onClick={() => setSelectedMonths(availableMonths)}>Select All</button>
                <button className="btn btn-secondary" onClick={() => setSelectedMonths([])}>Clear</button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {availableMonths.map(month => (
                  <label key={month} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', background: selected.includes(month) ? '#eff6ff' : 'transparent' }}>
                    <input type="checkbox" checked={selected.includes(month)} onChange={() => toggleMonth(month)} />
                    {monthLabel(month)}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {buildingView && (
            <BuildingGMDetail
              view={buildingView}
              selectedMonths={selected}
              records={buildingRecords}
              monthLabel={monthLabel}
            />
          )}

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Current Month — Actual Spend</h2>
              <span style={{ color: '#64748b', fontSize: 12 }}>{mtd.currentMonth || ''} • Same calculation logic as the Apps Script dashboard</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
              <KPI label="Maintenance Cost" value={money(mtd.maintenanceCost)} note={`${mtd.totalWO || 0} current-month work orders`} />
              <KPI label="Development Cost" value={money(mtd.developmentCost)} note={`${mtd.totalDevProjects || 0} current-month projects`} />
              <KPI label="Contractor Cost" value={money(mtd.contractorCost)} note="Contractor WO + development" tone="amber" />
              <KPI label="Parts Cost" value={money(mtd.partsCost)} note={`Contractor parts ${money(mtd.contractorParts)}`} />
              <KPI label="Total Company Cost" value={money(mtd.totalCompanyCost)} note="Maintenance + Development + Parts" tone="green" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
            <div style={{ background: 'var(--card-bg,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 14, padding: 20 }}>
              <h2 style={{ marginTop: 0 }}>Operational Snapshot</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Maintenance W.O. Cost</span><strong>{money(building?.workOrders?.totalCost)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Project Budget</span><strong>{money(building?.projects?.budget)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Project Spent</span><strong>{money(building?.projects?.spent)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Closed Tickets</span><strong>{ticketSummary.closed || 0}</strong></div>
              </div>
            </div>
            <div style={{ background: 'var(--card-bg,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 14, padding: 20 }}>
              <h2 style={{ marginTop: 0 }}>Management Attention</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>🚗 <strong>{vehicles.urgent || 0}</strong> vehicles require immediate maintenance attention.</div>
                <div>🛠️ <strong>{openTickets}</strong> site/maintenance tickets remain open.</div>
                <div>💰 Reported savings: <strong>{money(grand.totalSavings)}</strong>.</div>
                <div>🧠 Troubleshooter is available from the main navigation for all authorized users.</div>
              </div>
            </div>
          </div>
        </>
      )}

      {section === 'fleet' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginBottom: 20 }}>
            <KPI label="Total Vehicles" value={fleetTotal} note="Current fleet" />
            <KPI label="Safe" value={vehicles.safe || 0} note={`${fleetHealth}% of fleet`} tone="green" />
            <KPI label="Oil Overdue" value={vehicles.urgent || 0} note="Immediate action" tone="red" />
            <KPI label="Warning" value={vehicles.warning || 0} note="Approaching service threshold" tone="amber" />
          </div>
          <div style={{ background: 'var(--card-bg,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 14, padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>Fleet Management Summary</h2>
            <p style={{ color: '#64748b' }}>Vehicle details, KM records, maintenance history, inspections and driver issue reporting are managed from the Fleet / Vehicles module. GM access remains read-only.</p>
            {alerts && <div style={{ marginTop: 16 }}><strong>Current vehicle alert data is available.</strong> Use Fleet / Vehicles for the detailed list.</div>}
          </div>
        </>
      )}

      {section === 'financial' && (
        <div style={{ background: 'var(--card-bg,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            <KPI label="Total Baseline" value={money(grand.totalBaseline)} />
            <KPI label="Total Actual" value={money(grand.totalActual)} tone="green" />
            <KPI label="Total Savings" value={money(grand.totalSavings)} tone="green" />
            <KPI label="Savings Rate" value={`${Number(grand.totalSavingsPct || 0).toFixed(1)}%`} tone="green" />
          </div>
          <div style={{ marginTop: 20, background: 'var(--card-bg,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 14, padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>📈 Baseline vs Actual by Month</h2>
            {reportMonths.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={reportMonths.map(m => ({
                  month: m.month,
                  Baseline: 20577 + 132551,
                  Actual: Number(m.maintActual || 0) + Number(m.devActual || 0)
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Baseline" fill="#64748b" radius={[4,4,0,0]} />
                  <Bar dataKey="Actual" fill="#ef4444" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="alert alert-info">No monthly financial data available.</div>
            )}
          </div>
          <div style={{ marginTop: 14, padding: 14, background: '#f8fafc', borderRadius: 10, color: '#475569' }}>
            Detailed Financial Report remains available through the Reports module. This GM view shows executive figures plus the monthly cost chart.
          </div>
        </div>
      )}
    </div>
  );
}

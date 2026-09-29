import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useCallback, useEffect, useState } from 'react';
import { getAlerts, getDashboard, getTickets } from '../api/client';
import api from '../api/client';
import { printContent } from '../api/print';

const money = value => `${Number(value || 0).toLocaleString()} SAR`;
const pct = (value, total) => total > 0 ? Math.round((value / total) * 100) : 0;

function KPI({ label, value, note, tone = 'blue' }) {
  return (
    <div style={{ background: 'var(--card-bg,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 14, padding: 16, minHeight: 100 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, marginTop: 7, color: tone === 'green' ? '#059669' : tone === 'amber' ? '#d97706' : tone === 'red' ? '#dc2626' : '#1d4ed8' }}>{value}</div>
      {note && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{note}</div>}
    </div>
  );
}

function SelectedPeriodResult({ rows, selectedMonths, monthLabel, activeCard, setActiveCard }) {
  if (!selectedMonths.length) return null;
  const chosen = rows.filter(r => selectedMonths.includes(r.month));
  const n = selectedMonths.length;
  const sum = field => chosen.reduce((s, r) => s + Number(r[field] || 0), 0);
  const maintBaseline = sum('maintenanceBaseline') || 20577 * n;
  const devBaseline = sum('developmentBaseline') || 132551 * n;
  const contractorWO = sum('contractorWO');
  const partsWO = sum('partsWO');
  const salaryMaint = sum('salaryMaint') || 2200 * n;
  const contractorDev = sum('contractorDev');
  const partsDev = sum('partsDev');
  const salaryDev = sum('salaryDev') || 2200 * n;
  const contractorPartsWO = sum('partsWO');
  const contractorPartsDev = sum('partsDev');
  const contractorLabor = contractorWO + contractorDev;
  const contractorParts = contractorPartsWO + contractorPartsDev;
  const contractorTotal = contractorLabor + contractorParts;
  const maintActual = contractorWO + partsWO + salaryMaint;
  const devActual = contractorDev + partsDev + salaryDev;
  const purchases = sum('otherPurchases');
  const totalActual = maintActual + devActual + purchases;
  const maintSavings = maintBaseline - maintActual;
  const devSavings = devBaseline - devActual;
  const totalSavings = maintSavings + devSavings;
  const totalWO = sum('employeeWOCount') + sum('contractorWOCount');
  const contractorWOCount = sum('contractorWOCount');
  const employeeWOCount = sum('employeeWOCount');
  const totalProjects = sum('internalProjectCount') + sum('contractorProjectCount');
  const contractorProjects = sum('contractorProjectCount');
  const internalProjects = sum('internalProjectCount');
  const totalBaseline = maintBaseline + devBaseline;
  const label = selectedMonths.map(monthLabel).join(' • ');

  const details = {
    'work-orders': {
      title: '🔧 Work Orders',
      items: [
        ['Total Work Orders', totalWO],
        ['Closed', sum('closedWOCount')],
        ['Open', sum('openWOCount')],
        ['Contractor Work Orders', contractorWOCount],
        ['Internal / Staff Work Orders', employeeWOCount],
        ['Contractor WO Labor', money(contractorWO)],
      ]
    },
    'contractor-cost': {
      title: '💰 Total Contractor Cost',
      items: [
        ['Total Contractor Cost', money(contractorTotal)],
        ['WO Labor', money(contractorWO)],
        ['Development Labor', money(contractorDev)],
        ['WO Parts', money(contractorPartsWO)],
        ['Development Parts', money(contractorPartsDev)],
        ['Total Labor', money(contractorLabor)],
        ['Total Parts', money(contractorParts)],
      ]
    },
    'labor': {
      title: '👷 Total Labor (Contractor)',
      items: [
        ['Total Labor', money(contractorLabor)],
        ['Work Orders Labor', money(contractorWO)],
        ['Development Labor', money(contractorDev)],
      ]
    },
    'parts': {
      title: '📦 Total Parts (Contractor)',
      items: [
        ['Total Parts', money(contractorParts)],
        ['Work Orders Parts', money(contractorPartsWO)],
        ['Development Parts', money(contractorPartsDev)],
      ]
    },
    'maintenance': {
      title: '🔧 Maintenance',
      items: [
        ['Baseline', money(maintBaseline)],
        ['Contractor WO', money(contractorWO)],
        ['Contractor Parts', money(partsWO)],
        ['Salary', money(salaryMaint)],
        ['Actual', money(maintActual)],
        ['Savings', money(maintSavings)],
        ['Savings %', `${maintBaseline ? (maintSavings / maintBaseline * 100).toFixed(1) : '0.0'}%`],
      ]
    },
    'development': {
      title: '🏗️ Development',
      items: [
        ['Projects', totalProjects],
        ['Internal Projects', internalProjects],
        ['Contractor Projects', contractorProjects],
        ['Baseline', money(devBaseline)],
        ['Contractor Labor', money(contractorDev)],
        ['Contractor Parts', money(partsDev)],
        ['Salary', money(salaryDev)],
        ['Actual', money(devActual)],
        ['Savings', money(devSavings)],
        ['Savings %', `${devBaseline ? (devSavings / devBaseline * 100).toFixed(1) : '0.0'}%`],
      ]
    },
    'purchases': {
      title: '🏢 Company Purchases',
      items: [['Total Purchases', money(purchases)]]
    },
    'savings': {
      title: '🏆 Total Savings',
      items: [
        ['Maintenance Savings', money(maintSavings)],
        ['Development Savings', money(devSavings)],
        ['Total Savings', money(totalSavings)],
      ]
    },
  };

  const Card = ({ id, label, value, note, tone }) => (
    <button type="button" onClick={() => setActiveCard(activeCard === id ? null : id)}
      style={{ textAlign:'left', background:'var(--card-bg,#fff)', border:'1px solid var(--border-color,#e2e8f0)', borderRadius:14, padding:16, minHeight:108, cursor:'pointer', boxShadow: activeCard === id ? '0 0 0 2px #2563eb' : 'none' }}>
      <div style={{fontSize:12,fontWeight:700,textTransform:'uppercase',color:'#64748b'}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,marginTop:7,color: tone === 'green' ? '#059669' : tone === 'amber' ? '#d97706' : '#1d4ed8'}}>{value}</div>
      <div style={{fontSize:12,color:'#64748b',marginTop:4}}>{note}</div>
      <div style={{fontSize:11,color:'#2563eb',marginTop:8}}>Click for details →</div>
    </button>
  );

  return (
    <div style={{marginBottom:20,background:'var(--card-bg,#fff)',border:'1px solid var(--border-color,#e2e8f0)',borderRadius:14,padding:18}}>
      <h2 style={{margin:'0 0 4px'}}>Selected Period Results</h2>
      <div style={{color:'#64748b',fontSize:12,marginBottom:14}}>{label}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10}}>
        <Card id="work-orders" label="🔧 Work Orders" value={totalWO} note={`${employeeWOCount} internal • ${contractorWOCount} contractor`} />
        <Card id="contractor-cost" label="💰 Total Contractor Cost" value={money(contractorTotal)} note="Labor + Parts" tone="amber" />
        <Card id="labor" label="👷 Total Labor" value={money(contractorLabor)} note={`WO ${money(contractorWO)} • Development ${money(contractorDev)}`} />
        <Card id="parts" label="📦 Total Parts" value={money(contractorParts)} note={`WO ${money(contractorPartsWO)} • Development ${money(contractorPartsDev)}`} />
        <Card id="maintenance" label="🔧 Maintenance" value={money(maintActual)} note={`Baseline ${money(maintBaseline)} • Savings ${money(maintSavings)}`} />
        <Card id="development" label="🏗️ Development" value={money(devActual)} note={`Baseline ${money(devBaseline)} • Savings ${money(devSavings)}`} />
        <Card id="purchases" label="🏢 Company Purchases" value={money(purchases)} note="Company purchases in selected period" tone="amber" />
        <Card id="savings" label="🏆 Total Savings" value={money(totalSavings)} note={`${totalBaseline ? (totalSavings / totalBaseline * 100).toFixed(1) : '0.0'}% vs baseline`} tone="green" />
      </div>
      <div style={{marginTop:16,borderTop:'1px solid #e2e8f0',paddingTop:16,overflowX:'auto'}}>
        <h3 style={{margin:'0 0 10px'}}>Monthly Financial Breakdown</h3>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>
            {['Month','WO Cost','Dev Cost','Company Purchases','Contractor Parts','Contractor Total','Total Actual'].map(h => <th key={h} style={{textAlign:'left',padding:'9px 8px',borderBottom:'1px solid #cbd5e1',whiteSpace:'nowrap'}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {chosen.map(r => {
              const wo = Number(r.contractorWO || 0);
              const dev = Number(r.contractorDev || 0);
              const company = Number(r.otherPurchases || 0);
              const parts = Number(r.partsWO || 0) + Number(r.partsDev || 0);
              const contractor = wo + dev + parts;
              const actual = Number(r.maintActual || 0) + Number(r.devActual || 0) + company;
              return <tr key={r.month}>
                <td style={{padding:'8px',borderBottom:'1px solid #e2e8f0'}}>{monthLabel(r.month)}</td>
                <td style={{padding:'8px',borderBottom:'1px solid #e2e8f0'}}>{money(wo)}</td>
                <td style={{padding:'8px',borderBottom:'1px solid #e2e8f0'}}>{money(dev)}</td>
                <td style={{padding:'8px',borderBottom:'1px solid #e2e8f0'}}>{money(company)}</td>
                <td style={{padding:'8px',borderBottom:'1px solid #e2e8f0'}}>{money(parts)}</td>
                <td style={{padding:'8px',borderBottom:'1px solid #e2e8f0',fontWeight:700}}>{money(contractor)}</td>
                <td style={{padding:'8px',borderBottom:'1px solid #e2e8f0',fontWeight:700}}>{money(actual)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {activeCard && details[activeCard] && (
        <div style={{marginTop:16,padding:16,borderTop:'1px solid #e2e8f0'}}>
          <h3 style={{margin:'0 0 10px'}}>{details[activeCard].title} — {label}</h3>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:8}}>
            {details[activeCard].items.map(([k,v]) => (
              <div key={k} style={{padding:12,border:'1px solid #e2e8f0',borderRadius:10}}>
                <div style={{fontSize:12,color:'#64748b'}}>{k}</div>
                <div style={{fontSize:20,fontWeight:800,marginTop:4}}>{v}</div>
              </div>
            ))}
          </div>
          {activeCard === 'work-orders' && (
            <div style={{marginTop:12,color:'#64748b',fontSize:12}}>The selected period controls every figure above. Monthly source rows remain the reconciliation source for the detailed report.</div>
          )}
        </div>
      )}
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
  const [activeCard, setActiveCard] = useState(null);
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
  const selected = selectedMonths;
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

      {section === 'overview' && (
        <>
          <div style={{ marginBottom: 20, background: 'var(--card-bg,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 14, padding: 18 }}>
            <h2 style={{ margin: '0 0 6px' }}>Building Maintenance & Projects</h2>
            <div style={{ color: '#64748b', fontSize: 12, marginBottom: 14 }}>
              Choose what the GM wants to review, then select one or more months. You can select 1, 3, 6 or all 12 months, or manually choose any months.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {[
                ['work-orders', '🔧 Work Orders'],
                ['projects', '🏗️ Projects'],
                ['purchases', '🛒 Purchases'],
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

          <SelectedPeriodResult rows={reportMonths} selectedMonths={selectedMonths} monthLabel={monthLabel} activeCard={activeCard} setActiveCard={setActiveCard} />

          {buildingView && (
            <BuildingGMDetail
              view={buildingView}
              selectedMonths={selected}
              records={buildingRecords}
              monthLabel={monthLabel}
            />
          )}


        </>
      )}

      {section === 'fleet' && (
        <>
          <div>
            <h2 style={{ marginTop: 0 }}>Fleet Management Summary</h2>
            <p style={{ color: '#64748b' }}>Vehicle details, KM records, maintenance history, inspections and driver issue reporting are managed from the Fleet / Vehicles module. GM access remains read-only.</p>
            {alerts && <div style={{ marginTop: 16 }}><strong>Current vehicle alert data is available.</strong> Use Fleet / Vehicles for the detailed list.</div>}
          </div>
        </>
      )}

      {section === 'financial' && (
        <div>
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
          
        </div>
      )}
    </div>
  );
}

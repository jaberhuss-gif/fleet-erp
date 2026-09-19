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

export default function GMDashboardExecutive() {
  const [section, setSection] = useState('overview');
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [building, setBuilding] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [submissionReport, setSubmissionReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const [dashboard, vehicleAlerts, ticketData, buildingData, financialData, submissionData] = await Promise.all([
        getDashboard(),
        getAlerts(),
        getTickets(),
        api.get('/building/dashboard').then(r => r.data),
        api.get('/reports/financial').then(r => r.data),
        api.get('/google-sheet-submission-report').then(r => r.data).catch(() => null)
      ]);
      setData(dashboard);
      setAlerts(vehicleAlerts);
      setTickets(ticketData?.tickets || []);
      setBuilding(buildingData);
      setFinancial(financialData);
      setSubmissionReport(submissionData);
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

          <div style={{ background: 'var(--card-bg,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0 }}>📋 Daily Vehicle Submission</h2>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                  Google Sheet evidence • {submissionReport?.reportDate || 'Today'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 18 }}>{submissionReport?.submittedCount || 0} / {submissionReport?.fixedVehicleCount || 36}</strong>
                <span style={{ color: submissionReport?.missingCount ? '#dc2626' : '#059669', fontWeight: 700 }}>
                  {submissionReport?.missingCount ? `${submissionReport.missingCount} not submitted` : 'All submitted'}
                </span>
              </div>
            </div>

            {submissionReport?.missingCount > 0 && (
              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>Driver Reference</th>
                      <th>Phone</th>
                      <th>Last Evidence Today</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(submissionReport.missingVehicles || []).map(v => (
                      <tr key={v.vehicleId}>
                        <td style={{ fontWeight: 700 }}>{v.vehicle}</td>
                        <td>{v.driver || '-'}</td>
                        <td>{v.phone || '-'}</td>
                        <td>-</td>
                        <td style={{ color: '#dc2626', fontWeight: 700 }}>Not Submitted</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!submissionReport && (
              <div style={{ marginTop: 12, color: '#64748b', fontSize: 13 }}>
                Google Sheet report is temporarily unavailable.
              </div>
            )}

            {submissionReport && submissionReport.fixedVehicleCount !== 36 && (
              <div style={{ marginTop: 12, color: '#b45309', fontWeight: 700, fontSize: 13 }}>
                Warning: operational vehicle list currently contains {submissionReport.fixedVehicleCount} active vehicles; expected fixed list is 36.
              </div>
            )}
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

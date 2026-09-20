import { useState, useEffect, useCallback } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, LineChart, Line
} from 'recharts';
import { getDashboard, getAlerts, getTickets } from '../api/client';
import LiveIssues from './LiveIssues';
import FinancialReport from './FinancialReport';
import { printContent } from '../api/print';
import api from '../api/client';

/* ─── Constants ─── */
const MAINT_BASELINE = 20577;
const DEV_BASELINE = 132551;
const SALARY_MAINT = 2200;
const SALARY_DEV = 2200;
const CHART_COLORS = ['#1e3a8a','#dc2626','#16a34a','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'];
const REFRESH_INTERVAL = 60000;

/* ─── SVG Icons ─── */
const Icon = {
  vehicle: <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>,
  alert: <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>,
  warning: <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>,
  safe: <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>,
  ticket: <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M22 10V6c0-1.11-.9-2-2-2H4c-1.11 0-1.99.89-1.99 2v4c1.11 0 1.99.89 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.89-2-2s.9-2 2-2zm-2-1.46c-1.19.69-2 1.99-2 3.46s.81 2.77 2 3.46V18H4v-2.54c1.19-.69 2-1.99 2-3.46s-.81-2.77-2-3.46V6h16v2.54z"/></svg>,
  money: <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.56 0-2.84-2.43-3.81-4.7-4.39z"/></svg>,
  building: <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M15 11V5l-3-3-3 3v2H3v14h18V11h-6zm-8 8H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm6 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm6 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg>,
  savings: <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M19.5 7c.83 0 1.5-.67 1.5-1.5S20.33 4 19.5 4 18 4.67 18 5.5 18.67 7 19.5 7zm-.5 4c0-.55-.45-1-1-1h-2.71l-3.42-3.42c-.38-.38-.89-.58-1.41-.58H8.5c-.55 0-1 .45-1 1s.45 1 1 1h1.59l2 2H8.5c-.55 0-1 .45-1 1s.45 1 1 1h6c.55 0 1-.45 1-1zm-3.5 8c2.76 0 5-2.24 5-5h-1.5c0 1.93-1.57 3.5-3.5 3.5S9.5 16.43 9.5 14.5 11.07 11 13 11V9.5c-2.76 0-5 2.24-5 5s2.24 5 5 5z"/></svg>,
  chart: <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>,
  trendUp: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>,
  trendDown: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M16 18l2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.3 6.29L22 12v6z"/></svg>,
  wrench: <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1 .1-1.4z"/></svg>,
  project: <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>,
};

/* ─── Helpers ─── */
const fmt = n => Number(n || 0).toLocaleString();
const fmtSAR = n => `${Number(n || 0).toLocaleString()} SAR`;
const pct = (v, t) => t > 0 ? Math.round((v / t) * 100) : 0;

/* ─── Tooltip Styles ─── */
const tooltipStyle = {
  contentStyle: { background: 'rgba(30,41,59,0.95)', border: 'none', borderRadius: '8px', color: '#f1f5f9', fontSize: '13px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' },
  itemStyle: { color: '#e2e8f0' },
  labelStyle: { color: '#f1f5f9', fontWeight: 700 }
};

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export default function GMDashboard() {
  const [subTab, setSubTab] = useState('overview');
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [building, setBuilding] = useState(null);
  const [report, setReport] = useState(null);
  const [kmDaily, setKmDaily] = useState({ records: [], count: 0 });
  const [maintAlerts, setMaintAlerts] = useState({ overdue: [], dueSoon: [], counts: { overdue: { total: 0 }, dueSoon: { total: 0 } } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setRefreshing(true);
      const [d, a, t, b, r, k, ma] = await Promise.all([
        getDashboard(),
        getAlerts(),
        getTickets(),
        api.get('/building/dashboard').then(x => x.data),
        api.get('/reports/financial').then(x => x.data),
        api.get('/km-daily-notifications').then(x => x.data).catch(() => ({ records: [], count: 0 })),
        api.get('/periodic-maintenance/alerts').then(x => x.data).catch(() => ({ overdue: [], dueSoon: [], counts: { overdue: { total: 0 }, dueSoon: { total: 0 } } }))
      ]);
      setData(d);
      setAlerts(a);
      setTickets(t.tickets || []);
      setBuilding(b);
      setReport(r);
      setKmDaily(k);
      setMaintAlerts(ma);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* Auto-refresh */
  useEffect(() => {
    const timer = setInterval(() => { loadAll(); }, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [loadAll]);

  if (loading) return <div className="gm-loading"><div className="gm-spinner"></div><span>Loading Command Center...</span></div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="gm-loading">No data available</div>;

  const grand = report?.grand || {};
  const reportMonths = report?.months || [];

  return (
    <div className="gm-dashboard">
      {/* ═══ EXECUTIVE HEADER ═══ */}
      <div className="gm-header">
        <div className="gm-header-brand">
          <div className="gm-logo">◆</div>
          <div>
            <h1>Executive Command Center</h1>
            <p className="gm-header-sub">Fleet & Facility Management — Real-time Overview</p>
          </div>
        </div>
        <div className="gm-header-right">
          <div className="gm-last-updated">
            <span className={`gm-live-dot ${refreshing ? 'gm-live-dot-active' : ''}`}></span>
            <span>{lastUpdated.toLocaleTimeString()}</span>
            <button className="gm-refresh-btn" onClick={loadAll} disabled={refreshing}>
              {Icon.refresh}
            </button>
          </div>
          <div className="gm-header-date">{lastUpdated.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</div>
        </div>
      </div>

      {/* ═══ NAVIGATION ═══ */}
      <div className="gm-nav-bar">
        <div className="gm-tabs">
          {[
            { id:'overview', label:'Overview', icon:'📊' },
            { id:'vehicles', label:'Fleet', icon:'🚗' },
            { id:'building', label:'Building', icon:'🏗️' },
            { id:'financial', label:'Financial', icon:'💰' },
            { id:'charts', label:'Analytics', icon:'📈' },
          ].map(tab => (
            <button
              key={tab.id}
              className={`gm-tab ${subTab === tab.id ? 'gm-tab-active' : ''}`}
              onClick={() => setSubTab(tab.id)}
            >
              <span className="gm-tab-icon">{tab.icon}</span>
              <span className="gm-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
        <button className="print-btn no-print" onClick={() => printContent("Dashboard Report")}>🖨️ Print</button>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="gm-content">
        {subTab === 'overview' && <OverviewTab data={data} tickets={tickets} report={report} building={building} grand={grand} reportMonths={reportMonths} kmDaily={kmDaily} maintAlerts={maintAlerts} />}
        {subTab === 'vehicles' && <VehiclesTab data={data} alerts={alerts} />}
        {subTab === 'building' && <BuildingTab building={building} />}
        {subTab === 'financial' && <FinancialReport />}
        {subTab === 'charts' && <ChartsTab data={data} tickets={tickets} report={report} reportMonths={reportMonths} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   OVERVIEW TAB
   ═══════════════════════════════════════════ */
function OverviewTab({ data, tickets, report, building, grand, reportMonths, kmDaily, maintAlerts }) {
  const total = data.vehicles.total || 1;
  const healthScore = Math.round((data.vehicles.safe / total) * 100);
  const maintSavingsPct = grand.maintTotalSavingsPct || 0;
  const devSavingsPct = grand.devTotalSavingsPct || 0;
  const totalSavingsPct = grand.totalSavingsPct || 0;
  const totalSavingsAmt = grand.totalSavings || 0;

  /* Savings trend data */
  const savingsTrend = reportMonths.map(m => ({
    month: m.month,
    Maintenance: m.maintSavings > 0 ? m.maintSavings : 0,
    Development: m.devSavings > 0 ? m.devSavings : 0,
    Total: m.totalSavings > 0 ? m.totalSavings : 0,
  }));

  /* Cost breakdown: Baseline vs Actual */
  const costBreakdown = reportMonths.length > 0 ? [
    { name: 'Maintenance Baseline', value: MAINT_BASELINE * reportMonths.length, color: '#1e3a8a' },
    { name: 'Maintenance Actual', value: grand.maintActual || 0, color: '#3b82f6' },
    { name: 'Development Baseline', value: DEV_BASELINE * reportMonths.length, color: '#065f46' },
    { name: 'Development Actual', value: grand.devActual || 0, color: '#10b981' },
  ] : [];

  return (
    <div className="gm-overview">
      <LiveIssues />

      <div className="gm-panel gm-panel-gradient" style={{ marginBottom: '18px' }}>
        <div className="gm-panel-header">
          <h2>🚨 Daily KM Compliance</h2>
          <span className="gm-panel-badge">
            {kmDaily?.count || 0} open today
          </span>
        </div>
        {(kmDaily?.records || []).length === 0 ? (
          <div className="gm-no-data" style={{ padding: '24px' }}>
            ✅ All active vehicles have today's KM reading recorded.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Vehicle</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Driver</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Phone</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Detected</th>
                </tr>
              </thead>
              <tbody>
                {(kmDaily?.records || []).map(record => (
                  <tr key={record.id}>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{record.vehicle_plate || record.vehicle_id}</td>
                    <td style={{ padding: '10px 12px' }}>{record.driver_name || 'Unassigned'}</td>
                    <td style={{ padding: '10px 12px' }}>{record.driver_phone || '-'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className="status-badge status-urgent">OPEN</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{record.first_detected_at ? new Date(record.first_detected_at).toLocaleTimeString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==== MAINTENANCE DUE ==== */}
      <div className="gm-panel gm-panel-gradient" style={{ marginBottom: '18px' }}>
        <div className="gm-panel-header">
          <h2>🔧 Maintenance Due</h2>
          <span className="gm-panel-badge">
            {(maintAlerts?.counts?.overdue?.total || 0) + (maintAlerts?.counts?.dueSoon?.total || 0)} need attention
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
          <div style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#fff', padding: '14px 18px', borderRadius: '10px' }}>
            <div style={{ fontSize: '12px', opacity: 0.9 }}>🔴 Overdue</div>
            <div style={{ fontSize: '28px', fontWeight: '700', margin: '4px 0' }}>{maintAlerts?.counts?.overdue?.total || 0}</div>
            <div style={{ fontSize: '11px', opacity: 0.85 }}>
              Oil: {maintAlerts?.counts?.overdue?.oil_change || 0} · Insp: {maintAlerts?.counts?.overdue?.inspection || 0} · Gen: {maintAlerts?.counts?.overdue?.['6_months_general'] || 0}
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#fff', padding: '14px 18px', borderRadius: '10px' }}>
            <div style={{ fontSize: '12px', opacity: 0.9 }}>🟡 Due Soon</div>
            <div style={{ fontSize: '28px', fontWeight: '700', margin: '4px 0' }}>{maintAlerts?.counts?.dueSoon?.total || 0}</div>
            <div style={{ fontSize: '11px', opacity: 0.85 }}>
              Oil: {maintAlerts?.counts?.dueSoon?.oil_change || 0} · Insp: {maintAlerts?.counts?.dueSoon?.inspection || 0} · Gen: {maintAlerts?.counts?.dueSoon?.['6_months_general'] || 0}
            </div>
          </div>
        </div>

        {(maintAlerts?.overdue || []).length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Vehicle</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Driver</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Type</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Current KM</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Due KM</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {(maintAlerts?.overdue || []).slice(0, 10).map((r, idx) => (
                  <tr key={r.id || idx}>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{r.vehicle_plate || r.vehicle_id}</td>
                    <td style={{ padding: '10px 12px' }}>{r.driver_name || 'Unassigned'}</td>
                    <td style={{ padding: '10px 12px' }}>{r.type === 'oil_change' ? '🛢️ Oil' : r.type === 'inspection' ? '🔍 Inspection' : r.type === '6_months_general' ? '🔧 General' : r.type}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(r.current_km || 0)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{r.next_due_km ? fmt(r.next_due_km) : '-'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>
                      {r.overdue_km != null && r.overdue_km > 0 ? '-' + fmt(r.overdue_km) + ' km' : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="gm-no-data" style={{ padding: '20px' }}>
            ✅ No overdue maintenance right now.
          </div>
        )}
      </div>

      {/* ═══ EXECUTIVE KPI BANNER ═══ */}
      <div className="gm-kpi-banner">
        {/* Health Score */}
        <div className="gm-kpi-card gm-kpi-health" style={{ '--score': healthScore }}>
          <div className="gm-kpi-icon">{Icon.safe}</div>
          <div className="gm-kpi-content">
            <div className="gm-kpi-label">Fleet Health</div>
            <div className="gm-kpi-value">{healthScore}<span className="gm-kpi-unit">%</span></div>
            <div className="gm-kpi-gauge">
              <div className="gm-kpi-gauge-fill" style={{ width: `${healthScore}%` }}></div>
            </div>
          </div>
        </div>

        {/* Total Savings */}
        <div className="gm-kpi-card gm-kpi-savings">
          <div className="gm-kpi-icon">{Icon.savings}</div>
          <div className="gm-kpi-content">
            <div className="gm-kpi-label">Total Savings</div>
            <div className="gm-kpi-value">{fmt(totalSavingsAmt)}<span className="gm-kpi-unit"> SAR</span></div>
            <div className="gm-kpi-badge gm-badge-success">{totalSavingsPct.toFixed(1)}% saved</div>
          </div>
        </div>

        {/* Maintenance Savings */}
        <div className="gm-kpi-card gm-kpi-maint">
          <div className="gm-kpi-icon">{Icon.wrench}</div>
          <div className="gm-kpi-content">
            <div className="gm-kpi-label">Maint. Savings</div>
            <div className="gm-kpi-value">{fmt(grand.maintSavings || 0)}<span className="gm-kpi-unit"> SAR</span></div>
            <div className="gm-kpi-badge gm-badge-blue">{maintSavingsPct.toFixed(1)}%</div>
          </div>
        </div>

        {/* Development Savings */}
        <div className="gm-kpi-card gm-kpi-dev">
          <div className="gm-kpi-icon">{Icon.project}</div>
          <div className="gm-kpi-content">
            <div className="gm-kpi-label">Dev. Savings</div>
            <div className="gm-kpi-value">{fmt(grand.devSavings || 0)}<span className="gm-kpi-unit"> SAR</span></div>
            <div className="gm-kpi-badge gm-badge-green">{devSavingsPct.toFixed(1)}%</div>
          </div>
        </div>

        {/* Open Tickets */}
        <div className="gm-kpi-card gm-kpi-tickets">
          <div className="gm-kpi-icon">{Icon.ticket}</div>
          <div className="gm-kpi-content">
            <div className="gm-kpi-label">Open Tickets</div>
            <div className="gm-kpi-value">{data.tickets.open}</div>
            <div className="gm-kpi-badge gm-badge-amber">{pct(data.tickets.open, data.tickets.total)}% of total</div>
          </div>
        </div>
      </div>

      {/* ═══ FLEET KPI CARDS ═══ */}
      <div className="gm-cards-row">
        <GMCARD icon={Icon.vehicle} label="Total Vehicles" value={data.vehicles.total} sub="In the fleet" gradient="blue" />
        <GMCARD icon={Icon.alert} label="Oil Overdue" value={data.vehicles.urgent} sub="Immediate action needed" gradient="red" trend={data.vehicles.urgent > 0 ? 'bad' : 'good'} />
        <GMCARD icon={Icon.warning} label="Warning" value={data.vehicles.warning} sub="Approaching 5000 km" gradient="amber" trend={data.vehicles.warning > data.vehicles.urgent ? 'neutral' : 'good'} />
        <GMCARD icon={Icon.safe} label="Safe" value={data.vehicles.safe} sub="Good condition" gradient="green" trend="good" />
        <GMCARD icon={Icon.ticket} label="Closed Tickets" value={data.tickets.closed} sub="Resolved" gradient="green" trend="good" />
        <GMCARD icon={Icon.money} label="W.O. Cost" value={fmtSAR(building?.workOrders?.totalCost || 0)} sub="Total work orders" gradient="purple" />
        <GMCARD icon={Icon.building} label="Project Budget" value={fmtSAR(building?.projects?.budget || 0)} sub="Total budget" gradient="blue" />
        <GMCARD icon={Icon.chart} label="Project Spent" value={fmtSAR(building?.projects?.spent || 0)} sub="Total spent" gradient="amber" />
      </div>

      {/* ═══ CHARTS ROW ═══ */}
      <div className="gm-charts-row">
        {/* Savings Trend */}
        <div className="gm-panel gm-panel-gradient">
          <div className="gm-panel-header">
            <h2>💰 Monthly Savings Trend</h2>
            <span className="gm-panel-badge">Baseline vs Actual</span>
          </div>
          {savingsTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={savingsTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradMaint" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="gradDev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip {...tooltipStyle} formatter={(v) => `${Number(v).toLocaleString()} SAR`} />
                <Legend wrapperStyle={{ fontSize: '13px' }} />
                <Area type="monotone" dataKey="Maintenance" stroke="#3b82f6" fill="url(#gradMaint)" strokeWidth={2} />
                <Area type="monotone" dataKey="Development" stroke="#10b981" fill="url(#gradDev)" strokeWidth={2} />
                <Area type="monotone" dataKey="Total" stroke="#8b5cf6" fill="url(#gradTotal)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="gm-no-data">No savings data available</div>
          )}
        </div>

        {/* Top Categories */}
        <div className="gm-panel gm-panel-gradient">
          <div className="gm-panel-header">
            <h2>🏷️ Top Ticket Categories</h2>
          </div>
          {(() => {
            const catCounts = {};
            tickets.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
            const catData = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
            return catData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={catData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {catData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="gm-no-data">No ticket data</div>;
          })()}
        </div>
      </div>

      {/* ═══ COST BREAKDOWN ═══ */}
      {costBreakdown.length > 0 && (
        <div className="gm-charts-row">
          <div className="gm-panel gm-panel-gradient">
            <div className="gm-panel-header">
              <h2>📊 Baseline vs Actual Cost</h2>
              <span className="gm-panel-badge">{reportMonths.length} month(s)</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={costBreakdown} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip {...tooltipStyle} formatter={(v) => `${Number(v).toLocaleString()} SAR`} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {costBreakdown.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Fleet Status Donut */}
          <div className="gm-panel gm-panel-gradient">
            <div className="gm-panel-header">
              <h2>🚗 Fleet Status Distribution</h2>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Safe', value: data.vehicles.safe },
                    { name: 'Warning', value: data.vehicles.warning },
                    { name: 'Overdue', value: data.vehicles.urgent }
                  ]}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={55}
                  paddingAngle={3} label={({ name, value }) => `${name}: ${value}`}
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '13px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Reusable Gradient KPI Card ─── */
function GMCARD({ icon, label, value, sub, gradient, trend }) {
  return (
    <div className={`gm-card gm-card-${gradient}`}>
      <div className="gm-card-icon">{icon}</div>
      <div className="gm-card-body">
        <div className="gm-card-label">{label}</div>
        <div className="gm-card-value">{value}</div>
        <div className="gm-card-sub">{sub}</div>
      </div>
      {trend && (
        <div className={`gm-card-trend gm-trend-${trend}`}>
          {trend === 'good' ? Icon.trendUp : trend === 'bad' ? Icon.trendDown : null}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   VEHICLES TAB
   ═══════════════════════════════════════════ */
function VehiclesTab({ data, alerts }) {
  const allV = data.vehicles.list;
  return (
    <div className="gm-vehicles">
      <div className="gm-cards-row">
        <GMCARD icon={Icon.alert} label="Urgent Overdue" value={data.vehicles.urgent} sub="Immediate oil change" gradient="red" trend={data.vehicles.urgent > 0 ? 'bad' : 'good'} />
        <GMCARD icon={Icon.warning} label="Warning" value={data.vehicles.warning} sub="Approaching limit" gradient="amber" />
        <GMCARD icon={Icon.safe} label="Safe" value={data.vehicles.safe} sub="Good condition" gradient="green" trend="good" />
        <GMCARD icon={Icon.vehicle} label="Total" value={data.vehicles.total} sub="All vehicles" gradient="blue" />
      </div>

      {alerts?.urgent?.length > 0 && (
        <div className="gm-panel gm-panel-danger">
          <div className="gm-panel-header">
            <h2>🔴 Urgent — Oil Change Required ({alerts.urgent.length})</h2>
          </div>
          <div className="gm-table-wrap">
            <table>
              <thead><tr><th>Plate</th><th>Driver</th><th>Location</th><th>Current KM</th><th>Last Oil</th><th>Since Oil</th></tr></thead>
              <tbody>
                {alerts.urgent.map(v => (
                  <tr key={v.id} className="gm-row-danger">
                    <td style={{ fontWeight: 700 }}>{v.plate}</td>
                    <td>{v.driver}</td>
                    <td>{v.location || '-'}</td>
                    <td>{v.currentKm.toLocaleString()}</td>
                    <td>{v.lastOilKm.toLocaleString()}</td>
                    <td className="gm-text-danger gm-text-bold">{v.sinceOil.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {alerts?.warning?.length > 0 && (
        <div className="gm-panel gm-panel-warning">
          <div className="gm-panel-header">
            <h2>🟡 Warning — Approaching Oil Change ({alerts.warning.length})</h2>
          </div>
          <div className="gm-table-wrap">
            <table>
              <thead><tr><th>Plate</th><th>Driver</th><th>Location</th><th>Current KM</th><th>Since Oil</th><th>Remaining</th></tr></thead>
              <tbody>
                {alerts.warning.map(v => (
                  <tr key={v.id} className="gm-row-warning">
                    <td style={{ fontWeight: 700 }}>{v.plate}</td>
                    <td>{v.driver}</td>
                    <td>{v.location || '-'}</td>
                    <td>{v.currentKm.toLocaleString()}</td>
                    <td className="gm-text-warning gm-text-bold">{v.sinceOil.toLocaleString()}</td>
                    <td>{v.remaining.toLocaleString()} km</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="gm-panel gm-panel-gradient">
        <div className="gm-panel-header">
          <h2>🚗 All Vehicles ({allV.length})</h2>
        </div>
        <div className="gm-table-wrap">
          <table>
            <thead><tr><th>Plate</th><th>Make/Model</th><th>Driver</th><th>Location</th><th>Current KM</th><th>Since Oil</th><th>Status</th></tr></thead>
            <tbody>
              {allV.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 700 }}>{v.plate}</td>
                  <td>{v.make} {v.model} ({v.year})</td>
                  <td>{v.driver}</td>
                  <td>{v.location || '-'}</td>
                  <td>{v.currentKm.toLocaleString()}</td>
                  <td>{v.sinceOil.toLocaleString()}</td>
                  <td>
                    <span className={`gm-status gm-status-${v.status === 'Urgent Overdue' ? 'danger' : v.status === 'Warning' ? 'warning' : 'safe'}`}>
                      {v.status === 'Urgent Overdue' ? 'Overdue' : v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   BUILDING TAB (Enhanced)
   ═══════════════════════════════════════════ */
function BuildingTab({ building }) {
  if (!building) return <div className="gm-loading">Loading building data...</div>;
  const wo = building.workOrders || {};
  const proj = building.projects || {};
  const pur = building.purchases || {};

  /* WO Status data */
  const woStatusData = [
    { name: 'Open', value: wo.open || 0, color: '#f59e0b' },
    { name: 'Closed', value: wo.closed || 0, color: '#10b981' },
  ];

  /* WO Source data */
  const woSourceData = [
    { name: 'Contractor', value: wo.contractor || 0 },
    { name: 'Internal', value: wo.internal || 0 },
  ];

  /* Cost Breakdown data */
  const costData = [
    { name: 'Contractor WO', value: Number(wo.contractorCost || 0) },
    { name: 'Labor', value: Number(wo.laborCost || 0) },
    { name: 'Parts', value: Number(wo.partsCost || 0) },
  ].filter(d => d.value > 0);

  /* Project progress */
  const projectProgress = [
    { name: 'Budget', value: Number(proj.budget || 0) },
    { name: 'Spent', value: Number(proj.spent || 0) },
    { name: 'Remaining', value: Number((proj.budget || 0) - (proj.spent || 0)) },
  ];

  return (
    <div className="gm-building">
      {/* Summary Cards */}
      <div className="gm-cards-row">
        <GMCARD icon={Icon.wrench} label="Total Work Orders" value={wo.total || 0} sub="All time" gradient="blue" />
        <GMCARD icon={Icon.alert} label="Open WO" value={wo.open || 0} sub="In progress" gradient="amber" trend={wo.open > wo.closed ? 'bad' : 'good'} />
        <GMCARD icon={Icon.safe} label="Closed WO" value={wo.closed || 0} sub="Completed" gradient="green" trend="good" />
        <GMCARD icon={Icon.building} label="Contractor WO" value={wo.contractor || 0} sub="External" gradient="purple" />
      </div>

      <div className="gm-cards-row">
        <GMCARD icon={Icon.money} label="Total WO Cost" value={fmtSAR(wo.totalCost || 0)} sub="All work orders" gradient="blue" />
        <GMCARD icon={Icon.money} label="Contractor Cost" value={fmtSAR(wo.contractorCost || 0)} sub="External" gradient="amber" />
        <GMCARD icon={Icon.project} label="Projects" value={proj.total || 0} sub="Total projects" gradient="green" />
        <GMCARD icon={Icon.chart} label="Purchases" value={fmtSAR(pur.totalCost || 0)} sub="SAR" gradient="purple" />
      </div>

      <div className="gm-cards-row">
        <GMCARD icon={Icon.project} label="Project Budget" value={fmtSAR(proj.budget || 0)} sub="Total budget" gradient="blue" />
        <GMCARD icon={Icon.chart} label="Total Spent" value={fmtSAR(proj.spent || 0)} sub="SAR" gradient="amber" trend={(proj.spent || 0) > (proj.budget || 0) ? 'bad' : 'good'} />
        <GMCARD icon={Icon.savings} label="Remaining" value={fmtSAR((proj.budget || 0) - (proj.spent || 0))} sub="SAR" gradient="green" trend="good" />
      </div>

      {/* ═══ CHARTS ═══ */}
      <div className="gm-charts-row">
        {/* WO Status Pie */}
        <div className="gm-panel gm-panel-gradient">
          <div className="gm-panel-header">
            <h2>📋 Work Order Status</h2>
          </div>
          {(wo.open || wo.closed) ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={woStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={3}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {woStatusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '13px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="gm-no-data">No data</div>}
        </div>

        {/* Contractor vs Internal Pie */}
        <div className="gm-panel gm-panel-gradient">
          <div className="gm-panel-header">
            <h2>👷 Contractor vs Internal</h2>
          </div>
          {(wo.contractor || wo.internal) ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={woSourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={3}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  <Cell fill="#8b5cf6" />
                  <Cell fill="#06b6d4" />
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '13px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="gm-no-data">No data</div>}
        </div>
      </div>

      {/* Cost Breakdown & Project Progress */}
      <div className="gm-charts-row">
        <div className="gm-panel gm-panel-gradient">
          <div className="gm-panel-header">
            <h2>💰 WO Cost Breakdown</h2>
          </div>
          {costData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={costData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip {...tooltipStyle} formatter={(v) => `${Number(v).toLocaleString()} SAR`} />
                <Bar dataKey="value" radius={[6,6,0,0]}>
                  {costData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="gm-no-data">No cost data</div>}
        </div>

        <div className="gm-panel gm-panel-gradient">
          <div className="gm-panel-header">
            <h2>📐 Project Budget Progress</h2>
          </div>
          {Number(proj.budget || 0) > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={projectProgress} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fill: '#94a3b8', fontSize: 13 }} />
                <Tooltip {...tooltipStyle} formatter={(v) => `${Number(v).toLocaleString()} SAR`} />
                <Bar dataKey="value" radius={[0,6,6,0]}>
                  <Cell fill="#1e3a8a" />
                  <Cell fill="#f59e0b" />
                  <Cell fill="#10b981" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="gm-no-data">No project budget data</div>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CHARTS TAB (Enhanced with Financial)
   ═══════════════════════════════════════════ */
function ChartsTab({ data, tickets, report, reportMonths }) {
  if (!data) return <div className="gm-loading">Loading charts...</div>;
  const vehicles = data.vehicles?.list || [];

  /* Category data */
  const catCounts = {};
  tickets.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const top8 = sortedCats.slice(0, 8).map(([name, value]) => ({ name, value }));
  const restCount = sortedCats.slice(8).reduce((s, [, v]) => s + v, 0);
  const categoryData = restCount > 0 ? [...top8, { name: 'Others', value: restCount }] : top8;

  /* Monthly tickets */
  const monthCounts = {};
  tickets.forEach(t => {
    const m = String(t.opened_at || '').slice(0, 7);
    if (m) monthCounts[m] = (monthCounts[m] || 0) + 1;
  });
  const monthlyData = Object.entries(monthCounts).map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month));

  /* Location data */
  const locationCounts = {};
  vehicles.forEach(v => { if (v.location) locationCounts[v.location] = (locationCounts[v.location] || 0) + 1; });
  const locationData = Object.entries(locationCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  /* Top vehicles */
  const vehicleTicketCounts = {};
  tickets.forEach(t => { if (t.plate) vehicleTicketCounts[t.plate] = (vehicleTicketCounts[t.plate] || 0) + 1; });
  const topVehicles = Object.entries(vehicleTicketCounts).map(([plate, count]) => ({ plate, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  /* Financial monthly data for charts */
  const financialMonthly = reportMonths.map(m => ({
    month: m.month,
    Baseline: (MAINT_BASELINE + DEV_BASELINE),
    Actual: m.maintActual + m.devActual,
    Savings: m.totalSavings > 0 ? m.totalSavings : 0,
  }));

  return (
    <div className="gm-charts">
      <div className="gm-panel gm-panel-gradient">
        <div className="gm-panel-header">
          <h2>📊 Fleet & Financial Analytics</h2>
          <span className="gm-panel-badge">Complete Overview</span>
        </div>
      </div>

      {/* Row 1: Category Pie + Fleet Status Pie */}
      <div className="gm-charts-row">
        <div className="gm-panel gm-panel-gradient">
          <div className="gm-panel-header">
            <h2>🎟️ Tickets by Category</h2>
          </div>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={380}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={50} paddingAngle={2}>
                  {categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '13px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="gm-no-data">No data</div>}
        </div>

        <div className="gm-panel gm-panel-gradient">
          <div className="gm-panel-header">
            <h2>🚗 Fleet Status</h2>
          </div>
          {vehicles.length > 0 ? (
            <ResponsiveContainer width="100%" height={380}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Safe', value: data.vehicles.safe },
                    { name: 'Warning', value: data.vehicles.warning },
                    { name: 'Overdue', value: data.vehicles.urgent }
                  ]}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={50} paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '13px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="gm-no-data">No data</div>}
        </div>
      </div>

      {/* Row 2: Monthly Tickets + Financial Monthly */}
      <div className="gm-charts-row">
        <div className="gm-panel gm-panel-gradient">
          <div className="gm-panel-header">
            <h2>📅 Monthly Tickets Trend</h2>
          </div>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" radius={[6,6,0,0]}>
                  {monthlyData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="gm-no-data">No data</div>}
        </div>

        {financialMonthly.length > 0 && (
          <div className="gm-panel gm-panel-gradient">
            <div className="gm-panel-header">
              <h2>💰 Monthly Cost: Baseline vs Actual</h2>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={financialMonthly} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip {...tooltipStyle} formatter={(v) => `${Number(v).toLocaleString()} SAR`} />
                <Legend wrapperStyle={{ fontSize: '13px' }} />
                <Line type="monotone" dataKey="Baseline" stroke="#64748b" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Actual" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 5, fill: '#ef4444' }} activeDot={{ r: 7 }} />
                <Line type="monotone" dataKey="Savings" stroke="#10b981" strokeWidth={2.5} dot={{ r: 5, fill: '#10b981' }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Row 3: Top Vehicles + Location */}
      <div className="gm-charts-row">
        <div className="gm-panel gm-panel-gradient">
          <div className="gm-panel-header">
            <h2>🚨 Top 10 Vehicles (Most Tickets)</h2>
          </div>
          {topVehicles.length > 0 ? (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={topVehicles} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis dataKey="plate" type="category" width={95} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" fill="#ef4444" radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="gm-no-data">No data</div>}
        </div>

        <div className="gm-panel gm-panel-gradient">
          <div className="gm-panel-header">
            <h2>📍 Vehicles by Location</h2>
          </div>
          {locationData.length > 0 ? (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={locationData} margin={{ top: 10, right: 30, left: 0, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" height={100} interval={0} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="value" fill="#10b981" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="gm-no-data">No data</div>}
        </div>
      </div>
    </div>
  );
}

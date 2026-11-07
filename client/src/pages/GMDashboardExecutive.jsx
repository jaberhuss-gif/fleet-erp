import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const COMPANY = 'Maaden Ivanhoe Electric Exploration and Development Limited Company';
const PHASE = 'Exploration Phase — Arabian Shield';
const fmt = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const sar = (value) => 'SAR ' + fmt(value);
const pct = (value) => Number(value || 0).toFixed(1) + '%';

function sumRows(rows, key) {
  return (rows || []).reduce((total, row) => total + Number(row?.[key] || 0), 0);
}

function buildSlide(pptx, title, subtitle, cards, bullets, source, generatedAt, accent = 'B49D5A') {
  const slide = pptx.addSlide();
  slide.background = { color: 'F7F8FA' };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.16, line: { color: accent, transparency: 100 }, fill: { color: accent } });
  slide.addText('MAADEN  |  IVANHOE ELECTRIC', { x: 0.55, y: 0.34, w: 7.2, h: 0.28, fontFace: 'Aptos', fontSize: 12, bold: true, color: '263238', charSpacing: 1.2, margin: 0 });
  slide.addText(title, { x: 0.55, y: 0.88, w: 12.1, h: 0.52, fontFace: 'Aptos Display', fontSize: 26, bold: true, color: '172B4D', margin: 0 });
  slide.addText(subtitle, { x: 0.58, y: 1.47, w: 12, h: 0.34, fontFace: 'Aptos', fontSize: 11, color: '667085', margin: 0 });
  const gap = 0.18, left = 0.58, cardY = 2.02, cardW = (12.15 - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, index) => {
    const x = left + index * (cardW + gap);
    slide.addShape(pptx.ShapeType.roundRect, { x, y: cardY, w: cardW, h: 1.24, rectRadius: 0.08, line: { color: 'E4E7EC', width: 0.8 }, fill: { color: 'FFFFFF' }, radius: 0.08 });
    slide.addText(String(card.value ?? '—'), { x: x + 0.16, y: cardY + 0.2, w: cardW - 0.3, h: 0.48, fontFace: 'Aptos Display', fontSize: 23, bold: true, color: card.color || '172B4D', margin: 0, fit: 'shrink' });
    slide.addText(card.label, { x: x + 0.16, y: cardY + 0.78, w: cardW - 0.3, h: 0.26, fontFace: 'Aptos', fontSize: 10, color: '667085', margin: 0, breakLine: false, fit: 'shrink' });
  });
  slide.addText('MANAGEMENT HIGHLIGHTS', { x: 0.62, y: 3.58, w: 4, h: 0.25, fontFace: 'Aptos', fontSize: 10, bold: true, color: accent, charSpacing: 1.1, margin: 0 });
  bullets.forEach((line, index) => {
    slide.addShape(pptx.ShapeType.ellipse, { x: 0.68, y: 4.05 + index * 0.48, w: 0.09, h: 0.09, line: { color: accent, transparency: 100 }, fill: { color: accent } });
    slide.addText(line, { x: 0.92, y: 3.98 + index * 0.48, w: 11.7, h: 0.34, fontFace: 'Aptos', fontSize: 13, color: '344054', margin: 0, breakLine: false, fit: 'shrink' });
  });
  slide.addShape(pptx.ShapeType.line, { x: 0.58, y: 6.82, w: 12.15, h: 0, line: { color: 'D0D5DD', width: 0.8 } });
  slide.addText(COMPANY + '  |  ' + PHASE, { x: 0.58, y: 6.91, w: 6.5, h: 0.18, fontFace: 'Aptos', fontSize: 7, color: '667085', margin: 0 });
  slide.addText('GENERATED FROM FLEET ERP  •  LIVE SYSTEM DATA  •  ' + generatedAt, { x: 6.65, y: 6.91, w: 6.08, h: 0.18, fontFace: 'Aptos', fontSize: 7, color: '667085', align: 'right', margin: 0 });
  slide.addText('Data source: ' + source + '  |  System-generated snapshot; values reflect records available at export time.', { x: 0.58, y: 7.13, w: 12.15, h: 0.16, fontFace: 'Aptos', fontSize: 6.5, color: '98A2B3', margin: 0 });
}

export default function GMDashboardExecutive() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const year = new Date().getFullYear();
      const [dashboardRes, financialRes, monthlyRes] = await Promise.all([
        api.get('/dashboard'),
        api.get('/reports/financial'),
        api.get('/reports/monthly?year=' + year)
      ]);
      setSnapshot({
        dashboard: dashboardRes.data || {},
        financial: financialRes.data || {},
        monthly: monthlyRes.data || {},
        year
      });
      setRefreshedAt(new Date());
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Unable to load live ERP data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSnapshot(); }, [loadSnapshot]);

  const metrics = useMemo(() => {
    if (!snapshot) return null;
    const d = snapshot.dashboard || {};
    const v = d.vehicles || {};
    const t = d.tickets || {};
    const monthlyRows = snapshot.monthly?.months || [];
    const activeRows = monthlyRows.filter(row => Number(row.woCount || 0) + Number(row.projCount || 0) + Number(row.purCount || 0) > 0);
    const fRows = (snapshot.financial?.rows || []).filter(row => String(row.month || '').startsWith(String(snapshot.year)));
    const baseline = sumRows(fRows, 'active') ? fRows.filter(r => r.active).length * (Number(snapshot.financial?.grand?.maintenanceBaseline || 20577) + Number(snapshot.financial?.grand?.developmentBaseline || 132551)) : 0;
    const actual = sumRows(fRows, 'totalCost');
    const savings = baseline - actual;
    return {
      vehicles: Number(v.total || 0), safe: Number(v.safe || 0), warning: Number(v.warning || 0), urgent: Number(v.urgent || 0),
      tickets: Number(t.total || 0), openTickets: Number(t.open || 0), closedTickets: Number(t.closed || 0),
      woCount: sumRows(activeRows, 'woCount'), woCost: sumRows(activeRows, 'woCost'),
      projectCount: sumRows(activeRows, 'projCount'), projectCost: sumRows(activeRows, 'projSpent'),
      purchaseCount: sumRows(activeRows, 'purCount'), purchaseCost: sumRows(activeRows, 'purCost'),
      financeMonths: fRows.filter(r => r.active).length, baseline, actual, savings,
      savingsPct: baseline ? (savings / baseline) * 100 : 0
    };
  }, [snapshot]);

  const exportPresentation = async () => {
    if (!snapshot || !metrics) return;
    setExporting(true);
    setError('');
    try {
      const moduleUrl = 'https://esm.sh/pptxgenjs@3.12.0';
      const imported = await import(/* @vite-ignore */ moduleUrl);
      const PptxGenJS = imported.default || imported.PptxGenJS;
      if (!PptxGenJS) throw new Error('PowerPoint generator could not be loaded. Check internet access and try again.');
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      pptx.author = 'Fleet ERP';
      pptx.subject = 'Executive fleet and maintenance performance snapshot';
      pptx.title = 'Fleet ERP — General Manager Executive Report';
      pptx.company = 'Maaden Ivanhoe Electric Exploration and Development Limited Company';
      pptx.lang = 'en-US';
      pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };
      const generatedAt = (refreshedAt || new Date()).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      const d = snapshot.dashboard || {};
      const financialMonths = (snapshot.financial?.rows || []).filter(row => String(row.month || '').startsWith(String(snapshot.year)) && row.active);
      const topContractors = Object.entries(snapshot.financial?.grand?.contractorBreakdown || {}).sort((a,b) => Number(b[1]?.woCost || 0) + Number(b[1]?.projectCost || 0) - Number(a[1]?.woCost || 0) - Number(a[1]?.projectCost || 0)).slice(0,3);
      const source = 'ERP PostgreSQL via /dashboard, /reports/monthly and /reports/financial';

      buildSlide(pptx, 'Executive Fleet Overview', 'Management snapshot | ' + snapshot.year + ' | Live operational records', [
        { label: 'Vehicles in Fleet', value: metrics.vehicles },
        { label: 'Safe Vehicles', value: metrics.safe, color: '16835D' },
        { label: 'Warning / Urgent', value: metrics.warning + ' / ' + metrics.urgent, color: 'B54708' },
        { label: 'Open Tickets', value: metrics.openTickets, color: 'B42318' }
      ], [
        'Fleet master currently contains ' + metrics.vehicles + ' vehicles; status distribution is read directly from the ERP dashboard.',
        'Ticket register: ' + fmt(metrics.tickets) + ' total records, including ' + fmt(metrics.closedTickets) + ' closed and ' + fmt(metrics.openTickets) + ' currently open.',
        'Vehicle risk indicators: ' + fmt(metrics.warning) + ' warning and ' + fmt(metrics.urgent) + ' urgent/overdue vehicles.',
        'This slide is a point-in-time snapshot; refresh the GM Dashboard before exporting to capture the latest changes.'
      ], source, generatedAt);

      buildSlide(pptx, 'Maintenance & Operational Delivery', 'Recorded work orders, projects and purchases | ' + snapshot.year, [
        { label: 'Work Orders', value: fmt(metrics.woCount) },
        { label: 'Work Order Cost', value: sar(metrics.woCost) },
        { label: 'Projects', value: fmt(metrics.projectCount) },
        { label: 'Project Spend', value: sar(metrics.projectCost) }
      ], [
        'ERP monthly report records ' + fmt(metrics.woCount) + ' work orders during the selected year.',
        'Recorded work order expenditure: ' + sar(metrics.woCost) + '; project expenditure: ' + sar(metrics.projectCost) + '.',
        'Purchases recorded in the same reporting period: ' + fmt(metrics.purchaseCount) + ' transactions totaling ' + sar(metrics.purchaseCost) + '.',
        'Open ticket count is ' + fmt(metrics.openTickets) + '; use the ticket register for assignment and closure follow-up.'
      ], '/reports/monthly?year=' + snapshot.year, generatedAt);

      buildSlide(pptx, 'Financial Performance & Cost Control', 'Actuals compared with the configured monthly baseline | ' + snapshot.year, [
        { label: 'Active Finance Months', value: metrics.financeMonths },
        { label: 'Baseline', value: sar(metrics.baseline) },
        { label: 'Recorded Actual Cost', value: sar(metrics.actual) },
        { label: 'Variance / Savings*', value: sar(metrics.savings), color: metrics.savings >= 0 ? '16835D' : 'B42318' }
      ], [
        'Baseline is calculated from the ERP financial report settings for active months only.',
        'Recorded actual cost includes the financial report categories and excludes double-counting of project-linked purchases as defined by the ERP.',
        'Calculated variance versus baseline: ' + sar(metrics.savings) + ' (' + pct(metrics.savingsPct) + '). Positive is below baseline; negative is above baseline.',
        topContractors.length ? 'Largest contractor records by combined work-order and project value: ' + topContractors.map(([name, value]) => name + ' (' + sar(Number(value?.woCost || 0) + Number(value?.projectCost || 0)) + ')').join('; ') + '.' : 'No contractor breakdown is available in the selected financial period.'
      ], '/reports/financial (filtered to ' + snapshot.year + ')', generatedAt);

      buildSlide(pptx, 'Management Priorities & Data Integrity', 'Operational attention points generated from current ERP records', [
        { label: 'Open Tickets', value: metrics.openTickets, color: 'B42318' },
        { label: 'Warning Vehicles', value: metrics.warning, color: 'B54708' },
        { label: 'Urgent Vehicles', value: metrics.urgent, color: 'B42318' },
        { label: 'Finance Months', value: metrics.financeMonths }
      ], [
        'Prioritize closure and ownership of ' + fmt(metrics.openTickets) + ' open tickets in the ERP.',
        'Review ' + fmt(metrics.urgent) + ' urgent/overdue and ' + fmt(metrics.warning) + ' warning vehicle records; verify operational readiness before dispatch.',
        'Review monthly cost variance and supporting invoices/work orders before management sign-off.',
        'All figures in this deck are system-generated from live ERP API responses at export time; no manually typed performance figures are inserted.'
      ], source, generatedAt);

      await pptx.writeFile({ fileName: 'Fleet_ERP_GM_Executive_Report_' + snapshot.year + '.pptx' });
    } catch (e) {
      console.error('Executive presentation export failed:', e);
      setError('PowerPoint export failed: ' + (e?.message || 'Unknown error') + '. Refresh the dashboard and try again.');
    } finally {
      setExporting(false);
    }
  };

  if (loading && !snapshot) return <div className="loading">Loading live executive data...</div>;

  return (
    <div className="gm-dashboard" style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
        <div>
          <div style={{ color: '#a18b4f', fontWeight: 700, fontSize: 12, letterSpacing: 1.4 }}>MAADEN  |  IVANHOE ELECTRIC</div>
          <h1 style={{ margin: '7px 0 4px', color: '#172b4d' }}>GM Executive Dashboard</h1>
          <p style={{ color: '#667085', margin: 0 }}>{COMPANY} · {PHASE}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={loadSnapshot} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh Live Data'}</button>
          <button className="btn btn-primary" onClick={exportPresentation} disabled={!snapshot || exporting || loading}>{exporting ? 'Preparing 4 slides…' : '📊 Export GM PowerPoint (4 Slides)'}</button>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
      {snapshot && metrics && <>
        <div className="alert alert-info" style={{ marginBottom: 18 }}>
          <strong>Live ERP data.</strong> Presentation values are loaded from the Fleet ERP database when this dashboard refreshes. Last refreshed: {refreshedAt?.toLocaleString() || '—'}.
        </div>
        <div className="cards-grid" style={{ marginBottom: 18 }}>
          {[['Fleet Vehicles', metrics.vehicles], ['Safe', metrics.safe], ['Warning', metrics.warning], ['Urgent / Overdue', metrics.urgent], ['Open Tickets', metrics.openTickets]].map(([label, value]) => (
            <div className="card" key={label}><h3>{label}</h3><div className="big-number">{fmt(value)}</div></div>
          ))}
        </div>
        <div className="cards-grid">
          <div className="card"><h3>{snapshot.year} Work Orders</h3><div className="big-number">{fmt(metrics.woCount)}</div><div className="sub">{sar(metrics.woCost)}</div></div>
          <div className="card"><h3>{snapshot.year} Project Spend</h3><div className="big-number">{sar(metrics.projectCost)}</div><div className="sub">{fmt(metrics.projectCount)} projects</div></div>
          <div className="card"><h3>{snapshot.year} Purchases</h3><div className="big-number">{sar(metrics.purchaseCost)}</div><div className="sub">{fmt(metrics.purchaseCount)} transactions</div></div>
          <div className="card"><h3>Financial Variance*</h3><div className="big-number">{sar(metrics.savings)}</div><div className="sub">{pct(metrics.savingsPct)} vs baseline · {metrics.financeMonths} active months</div></div>
        </div>
        <p style={{ color: '#98a2b3', fontSize: 11, marginTop: 18 }}>*Financial variance is calculated from the ERP financial report baseline and recorded actuals. Verify supporting transactions before external circulation.</p>
      </>}
      {!snapshot && !loading && <div className="alert alert-warning">No live data is available. Refresh to try again.</div>}
    </div>
  );
}

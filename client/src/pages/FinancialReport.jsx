import { useState, useEffect } from 'react';
import api from '../api/client';
import { printContent } from '../api/print';

export default function FinancialReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closeModal, setCloseModal] = useState(null);
  const [closeForm, setCloseForm] = useState({ finalAmount:'', performedBy:'Employee', performedName:'', closingNotes:'' });
  const [savingClose, setSavingClose] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/reports/financial');
      setData(res.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const openClose = (kind, row, edit=false) => {
    setCloseModal({ kind, row, edit });
    setCloseForm({
      finalAmount: row.finalAmount ?? row.amount ?? row.totalCost ?? '',
      performedBy: row.performedBy === 'Contractor' ? 'Contractor' : 'Employee',
      performedName: row.performedName || '',
      closingNotes: row.closingNotes || ''
    });
  };

  const submitClose = async () => {
    if (!closeModal) return;
    const { kind, row } = closeModal;
    const amount = Number(closeForm.finalAmount);
    if (!Number.isFinite(amount) || amount < 0) return setError('Final Amount must be a valid non-negative number.');
    if (!['Employee','Contractor'].includes(closeForm.performedBy)) return setError('Please select Employee or Contractor.');
    if (closeForm.performedBy === 'Contractor' && !closeForm.performedName.trim()) return setError('Contractor name is required.');

    const endpoints = {
      workOrder: `/work-orders/${row.id}/close`,
      project: `/projects/${row.id}/close`,
      purchase: `/purchases/${row.id}/close`
    };
    try {
      setSavingClose(true);
      setError('');
      await api.put(endpoints[kind], {
        finalAmount: amount,
        performedBy: closeForm.performedBy,
        performedName: closeForm.performedName.trim(),
        closingNotes: closeForm.closingNotes.trim()
      });
      setCloseModal(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Unable to save.');
    } finally {
      setSavingClose(false);
    }
  };

  if (loading) return <div className="loading">Loading financial report...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">No data</div>;

  const months = Array.isArray(data.months) ? data.months : (Array.isArray(data.rows) ? data.rows : []);
  const MAINT_BASELINE = 20577;
  const DEV_BASELINE = 132551;
  const SALARY_MAINT = 2200;
  const SALARY_DEV = 2200;

  // Prefer the server's active-month count: months with zero real spend must
  // not multiply the fixed monthly baseline. Fall back to a local computation
  // for older responses that do not include `active`.
  const hasActivity = m =>
    Number(m.contractorWO || 0) + Number(m.partsWO || 0) +
    Number(m.contractorDev || 0) + Number(m.partsDev || 0) +
    Number(m.otherPurchases || 0) > 0;
  const monthCount = Number.isFinite(Number(data.grand?.monthCount))
    ? Number(data.grand.monthCount)
    : months.filter(hasActivity).length;
  const isActiveMonth = m =>
    typeof m.active === 'boolean' ? m.active : hasActivity(m);

  const monthlyData = months.map(m => ({
    ...m,
    contractorWO: Number(m.contractorWO || 0),
    partsWO: Number(m.partsWO || 0),
    salaryMaint: Number(m.salaryMaint ?? 0),
    contractorDev: Number(m.contractorDev || 0),
    partsDev: Number(m.partsDev || 0),
    salaryDev: Number(m.salaryDev ?? 0),
    employeeWOCount: Number(m.employeeWOCount || 0),
    contractorWOCount: Number(m.contractorWOCount || 0),
    internalProjectCount: Number(m.internalProjectCount || 0),
    contractorProjectCount: Number(m.contractorProjectCount || 0),
    maintActual: Number(m.maintActual ?? (Number(m.contractorWO || 0) + Number(m.partsWO || 0) + Number(m.salaryMaint || 0))),
    devActual: Number(m.devActual ?? (Number(m.contractorDev || 0) + Number(m.salaryDev || 0))),
    maintSavings: Number(m.maintSavings ?? (MAINT_BASELINE - Number(m.maintActual || 0))),
    devSavings: Number(m.devSavings ?? (DEV_BASELINE - Number(m.devActual || 0))),
    maintPct: Number(m.maintPct ?? 0),
    devPct: Number(m.devPct ?? 0),
    totalSavingsPct: Number(m.totalSavingsPct ?? (((MAINT_BASELINE + DEV_BASELINE) - Number(m.totalCost || 0)) / (MAINT_BASELINE + DEV_BASELINE)) * 100)
  }));

  const maintBaselineTotal = MAINT_BASELINE * monthCount;
  const devBaselineTotal = DEV_BASELINE * monthCount;
  const totalBaseline = maintBaselineTotal + devBaselineTotal;

  // Totals cover only active months so they line up with the baseline above.
  const activeData = monthlyData.filter(isActiveMonth);
  const activeSum = (fn) => activeData.reduce((s, m) => s + fn(m), 0);

  const contractorWOTotal = activeSum(m => m.contractorWO);
  const partsWOTotal = activeSum(m => m.partsWO);
  const salaryMaintTotal = activeSum(m => m.salaryMaint);
  const maintActualTotal = activeSum(m => Number(m.maintActual || 0));

  const contractorDevTotal = activeSum(m => m.contractorDev);
  const partsDevTotal = activeSum(m => m.partsDev);
  const salaryDevTotal = activeSum(m => m.salaryDev);
  const devActualTotal = activeSum(m => Number(m.devActual || 0));

  const totalActual = maintActualTotal + devActualTotal;
  const maintSavingsTotal = maintBaselineTotal - maintActualTotal;
  const devSavingsTotal = devBaselineTotal - devActualTotal;
  const totalSavings = maintSavingsTotal + devSavingsTotal;
  const maintSavingsPct = maintBaselineTotal ? (maintSavingsTotal / maintBaselineTotal) * 100 : 0;
  const devSavingsPct = devBaselineTotal ? (devSavingsTotal / devBaselineTotal) * 100 : 0;
  const totalSavingsPct = totalBaseline ? (totalSavings / totalBaseline) * 100 : 0;

  const employeeWOTotal = activeSum(m => m.employeeWOCount);
  const contractorWOCountTotal = activeSum(m => m.contractorWOCount);
  const internalProjectTotal = activeSum(m => m.internalProjectCount);
  const contractorProjectCountTotal = activeSum(m => m.contractorProjectCount);

  const otherPurchasesTotal = activeSum(m => Number(m.otherPurchases || 0));

  const getPctStyle = (pct) => {
    if (pct >= 70) return { bg: '#dcfce7', color: '#16a34a', icon: '🟢' };
    if (pct >= 40) return { bg: '#fef3c7', color: '#b45309', icon: '🟡' };
    if (pct >= 0) return { bg: '#fee2e2', color: '#dc2626', icon: '🔴' };
    return { bg: '#991b1b', color: 'white', icon: '⚠️' };
  };

  const fmt = (n) => Number(n).toLocaleString();

  // Format month key to display name
  const fmtMonth = (m) => {
    if (!m || m === 'Unknown') return 'Unknown';
    const match = m.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const [, y, mo] = match;
      const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return names[parseInt(mo)] + ' ' + y;
    }
    return m;
  };

  return (
    <div>
      {/* Gradient Header */}
      <div style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', padding: '28px 24px', borderRadius: '12px', marginBottom: '20px', color: 'white' }}>
        <h2 style={{ margin: 0, fontSize: '24px' }}>💰 Financial Report</h2>
        <p style={{ margin: '6px 0 0', opacity: 0.85, fontSize: '14px' }}>Baseline vs Actual — Maintenance & Development</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button className="print-btn no-print" onClick={() => printContent('Financial Report', 'Baseline vs Actual')}>
          🖨️ Print Report
        </button>
      </div>

      {/* Formula Explanation */}
      <div style={{ marginBottom: '20px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>
        <strong>📐 Formula:</strong><br />
        <strong>Maintenance:</strong> Contractor WO + Parts WO, Savings and % follow the MonthlySavings / Google Sheet reference<br />
        <strong>Development:</strong> Contractor Dev + Parts Dev, Savings and % follow the MonthlySavings / Google Sheet reference<br />
        <strong>Parts WO:</strong> Contractor purchases linked to same-month WOs only | <strong>Parts Dev:</strong> Purchases linked to same-month Dev Projects<br />
        <strong>Note:</strong> Salary included in Actual, NOT in Baseline. Cross-month purchases excluded.
      </div>

      {/* GRAND SUMMARY CARDS */}
      <div className="cards-grid" style={{ marginBottom: '24px' }}>
        <div className="card" style={{ borderLeft: '5px solid #1e3a8a' }}>
          <h3>Total Baseline</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{fmt(totalBaseline)}</div>
          <div className="sub">SAR — All months</div>
        </div>
        <div className="card warning" style={{ borderLeft: '5px solid #f59e0b' }}>
          <h3>Total Actual</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{fmt(totalActual)}</div>
          <div className="sub">SAR — All costs inc. salaries</div>
        </div>
        <div className="card success" style={{ borderLeft: '5px solid #16a34a' }}>
          <h3>Total Savings</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{fmt(totalSavings)}</div>
          <div className="sub">{totalSavingsPct.toFixed(1)}% saved</div>
        </div>
      </div>

      {/* MAINTENANCE SECTION */}
      <div className="panel" style={{ borderTop: '5px solid #1e3a8a', marginBottom: '20px' }}>
        <h2 style={{ color: '#1e3a8a', marginTop: 0 }}>🔧 General Maintenance</h2>
        <div className="cards-grid" style={{ marginBottom: '16px' }}>
          <div className="card"><h3>Baseline</h3><div className="big-number" style={{ color: '#1e3a8a', fontSize: '22px' }}>20,577</div><div className="sub">SAR / month</div></div>
          <div className="card success"><h3>Total Savings</h3><div className="big-number" style={{ color: '#16a34a', fontSize: '22px' }}>{fmt(maintSavingsTotal)}</div><div className="sub">SAR</div></div>
          <div className="card"><h3>Baseline × Months</h3><div className="big-number" style={{ color: '#64748b', fontSize: '22px' }}>{fmt(maintBaselineTotal)}</div><div className="sub">{monthCount} months</div></div>
          <div className="card" style={{ borderLeft: '5px solid #f97316' }}>
            <h3>WO Count</h3>
            <div className="big-number" style={{ color: '#f97316', fontSize: '22px' }}>{employeeWOTotal + contractorWOCountTotal}</div>
            <div className="sub" style={{ fontSize: '11px' }}>👤 Employee: {employeeWOTotal} &nbsp;|&nbsp; 🏗️ Contractor: {contractorWOCountTotal}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr style={{ background: '#eff6ff' }}>
              <th>Month</th>
              <th>Baseline</th>
              <th>Employee WO</th>
              <th>Contractor WO</th>
              <th>Parts WO</th>
              <th>Salary</th>
              <th style={{ color: '#dc2626' }}>Actual</th>
              <th style={{ color: '#16a34a' }}>Savings</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map(m => {
              const s = getPctStyle(m.maintPct);
              return (
                <tr key={'m-' + m.month}>
                  <td style={{ fontWeight: 'bold' }}>{fmtMonth(m.month)}</td>
                  <td>20,577</td>
                  <td>👤 {m.employeeWOCount}</td>
                  <td>🏗️ {m.contractorWOCount} ({fmt(m.contractorWO)})</td>
                  <td>{fmt(m.partsWO)}</td>
                  <td>{fmt(m.salaryMaint)}</td>
                  <td style={{ fontWeight: 'bold', color: '#dc2626' }}>{fmt(m.maintActual)}</td>
                  <td style={{ fontWeight: 'bold', color: '#16a34a' }}>{fmt(m.maintSavings)}</td>
                  <td>
                    <span className="status-badge" style={{ background: s.bg, color: s.color, fontWeight: 'bold' }}>
                      {s.icon} {m.maintPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: '#dbeafe', fontWeight: 'bold' }}>
              <td>TOTAL</td>
              <td>{fmt(maintBaselineTotal)}</td>
              <td>👤 {employeeWOTotal}</td>
              <td>🏗️ {contractorWOCountTotal} ({fmt(contractorWOTotal)})</td>
              <td>{fmt(partsWOTotal)}</td>
              <td>{fmt(salaryMaintTotal)}</td>
              <td style={{ color: '#dc2626' }}>{fmt(maintActualTotal)}</td>
              <td style={{ color: '#16a34a' }}>{fmt(maintSavingsTotal)}</td>
              <td>
                <span className="status-badge status-safe" style={{ fontWeight: 'bold' }}>
                  {maintSavingsPct.toFixed(1)}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Contractor Breakdown */}
        {data.grand && data.grand.contractorBreakdown && Object.keys(data.grand.contractorBreakdown).length > 0 && (
          <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#475569' }}>🏗️ Contractor Breakdown (All Months)</h4>
            <table style={{ fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#e2e8f0' }}>
                  <th>Contractor Name</th>
                  <th>WO Count</th>
                  <th>WO Cost (SAR)</th>
                  <th>Project Count</th>
                  <th>Project Cost (SAR)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.grand.contractorBreakdown).map(([name, info]) => (
                  <tr key={name}>
                    <td style={{ fontWeight: 'bold' }}>{name}</td>
                    <td>{info.woCount}</td>
                    <td>{fmt(info.woCost)}</td>
                    <td>{info.projectCount}</td>
                    <td>{fmt(info.projectCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DEVELOPMENT SECTION */}
      <div className="panel" style={{ borderTop: '5px solid #16a34a', marginBottom: '20px' }}>
        <h2 style={{ color: '#16a34a', marginTop: 0 }}>📁 Development Projects</h2>
        <div className="cards-grid" style={{ marginBottom: '16px' }}>
          <div className="card"><h3>Baseline</h3><div className="big-number" style={{ color: '#16a34a', fontSize: '22px' }}>132,551</div><div className="sub">SAR / month</div></div>
          <div className="card success"><h3>Total Savings</h3><div className="big-number" style={{ color: '#16a34a', fontSize: '22px' }}>{fmt(devSavingsTotal)}</div><div className="sub">SAR</div></div>
          <div className="card"><h3>Baseline × Months</h3><div className="big-number" style={{ color: '#64748b', fontSize: '22px' }}>{fmt(devBaselineTotal)}</div><div className="sub">{monthCount} months</div></div>
          <div className="card" style={{ borderLeft: '5px solid #f97316' }}>
            <h3>Project Count</h3>
            <div className="big-number" style={{ color: '#f97316', fontSize: '22px' }}>{internalProjectTotal + contractorProjectCountTotal}</div>
            <div className="sub" style={{ fontSize: '11px' }}>👤 Internal: {internalProjectTotal} &nbsp;|&nbsp; 🏗️ Contractor: {contractorProjectCountTotal}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr style={{ background: '#f0fdf4' }}>
              <th>Month</th>
              <th>Baseline</th>
              <th>Internal</th>
              <th>Contractor</th>
              <th>Parts Dev</th>
              <th>Salary</th>
              <th style={{ color: '#dc2626' }}>Actual</th>
              <th style={{ color: '#16a34a' }}>Savings</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map(m => {
              const s = getPctStyle(m.devPct);
              return (
                <tr key={'d-' + m.month}>
                  <td style={{ fontWeight: 'bold' }}>{fmtMonth(m.month)}</td>
                  <td>132,551</td>
                  <td>👤 {m.internalProjectCount}</td>
                  <td>🏗️ {m.contractorProjectCount} ({fmt(m.contractorDev)})</td>
                  <td>{fmt(m.partsDev)}</td>
                  <td>{fmt(m.salaryDev)}</td>
                  <td style={{ fontWeight: 'bold', color: '#dc2626' }}>{fmt(m.devActual)}</td>
                  <td style={{ fontWeight: 'bold', color: '#16a34a' }}>{fmt(m.devSavings)}</td>
                  <td>
                    <span className="status-badge" style={{ background: s.bg, color: s.color, fontWeight: 'bold' }}>
                      {s.icon} {m.devPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: '#dcfce7', fontWeight: 'bold' }}>
              <td>TOTAL</td>
              <td>{fmt(devBaselineTotal)}</td>
              <td>👤 {internalProjectTotal}</td>
              <td>🏗️ {contractorProjectCountTotal} ({fmt(contractorDevTotal)})</td>
              <td>{fmt(partsDevTotal)}</td>
              <td>{fmt(salaryDevTotal)}</td>
              <td style={{ color: '#dc2626' }}>{fmt(devActualTotal)}</td>
              <td style={{ color: '#16a34a' }}>{fmt(devSavingsTotal)}</td>
              <td>
                <span className="status-badge status-safe" style={{ fontWeight: 'bold' }}>
                  {devSavingsPct.toFixed(1)}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* OTHER PURCHASES SECTION */}
      {otherPurchasesTotal > 0 && (
        <div className="panel" style={{ borderTop: '5px solid #64748b', marginBottom: '20px' }}>
          <h2 style={{ color: '#64748b', marginTop: 0 }}>🛒 Other Purchases</h2>
          <table>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th>Month</th>
                <th>Other Purchases (SAR)</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map(m => (
                <tr key={'o-' + m.month}>
                  <td style={{ fontWeight: 'bold' }}>{fmtMonth(m.month)}</td>
                  <td>{fmt(Number(m.otherPurchases || 0))}</td>
                </tr>
              ))}
              <tr style={{ background: '#e2e8f0', fontWeight: 'bold' }}>
                <td>TOTAL</td>
                <td>{fmt(otherPurchasesTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* FINANCIAL DETAIL WORKFLOW */}
      <div className="panel" style={{ borderTop:'5px solid #0f766e', marginBottom:'20px' }}>
        <h2 style={{ color:'#0f766e', marginTop:0 }}>📋 Financial Detail — Work Orders</h2>
        <div style={{ overflowX:'auto' }}>
          <table>
            <thead><tr style={{ background:'#ecfeff' }}>
              <th>WO No.</th><th>Site</th><th>Description</th><th>Status</th><th>Final Amount (SAR)</th>
              <th>Performed By</th><th>Contractor / Employee</th><th>Closed At</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {(data.details?.workOrders || []).map(w => (
                <tr key={'fw-'+w.id}>
                  <td style={{fontWeight:'bold'}}>{w.woNo || w.id}</td>
                  <td>{w.site || '-'}</td><td>{w.description || w.category || '-'}</td>
                  <td><span className="status-badge" style={{background:String(w.status).toLowerCase()==='closed'?'#dcfce7':'#fef3c7',color:String(w.status).toLowerCase()==='closed'?'#166534':'#92400e'}}>{w.status}</span></td>
                  <td style={{fontWeight:'bold'}}>{fmt(w.finalAmount || w.amount || 0)}</td>
                  <td>{w.performedBy || '-'}</td><td>{w.performedName || '-'}</td>
                  <td>{w.closedAt ? String(w.closedAt).slice(0,16).replace('T',' ') : '-'}</td>
                  <td style={{whiteSpace:'nowrap'}}>
                    <button className="btn btn-primary" onClick={()=>openClose('workOrder',w,!String(w.status).toLowerCase().includes('closed'))}>
                      {String(w.status).toLowerCase()==='closed' ? '✏️ Edit' : '🔒 Close'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ borderTop:'5px solid #2563eb', marginBottom:'20px' }}>
        <h2 style={{ color:'#2563eb', marginTop:0 }}>📁 Financial Detail — Projects</h2>
        <div style={{ overflowX:'auto' }}>
          <table>
            <thead><tr style={{ background:'#eff6ff' }}>
              <th>Project</th><th>Name</th><th>Site</th><th>Type</th><th>Status</th><th>Final Amount (SAR)</th>
              <th>Performed By</th><th>Contractor / Employee</th><th>Closed At</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {(data.details?.projects || []).map(p => (
                <tr key={'fp-'+p.id}>
                  <td style={{fontWeight:'bold'}}>{p.projectNo || p.id}</td><td>{p.name || '-'}</td><td>{p.site || '-'}</td><td>{p.projectType || '-'}</td>
                  <td><span className="status-badge" style={{background:String(p.status).toLowerCase()==='closed'?'#dcfce7':'#fef3c7',color:String(p.status).toLowerCase()==='closed'?'#166534':'#92400e'}}>{p.status}</span></td>
                  <td style={{fontWeight:'bold'}}>{fmt(p.finalAmount || p.amount || p.spent || 0)}</td>
                  <td>{p.performedBy || '-'}</td><td>{p.performedName || p.contractor || '-'}</td>
                  <td>{p.closedAt ? String(p.closedAt).slice(0,16).replace('T',' ') : '-'}</td>
                  <td><button className="btn btn-primary" onClick={()=>openClose('project',p,String(p.status).toLowerCase()!=='closed')}>{String(p.status).toLowerCase()==='closed'?'✏️ Edit':'🔒 Close'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ borderTop:'5px solid #ea580c', marginBottom:'20px' }}>
        <h2 style={{ color:'#ea580c', marginTop:0 }}>🛒 Financial Detail — Purchases</h2>
        <div style={{ overflowX:'auto' }}>
          <table>
            <thead><tr style={{ background:'#fff7ed' }}>
              <th>Purchase No.</th><th>Date</th><th>Item</th><th>Reference</th><th>Supplier</th><th>Purchased By</th>
              <th>Original Total</th><th>Final Amount</th><th>Status</th><th>Closed By</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {(data.details?.purchases || []).map(p => (
                <tr key={'fpur-'+p.id}>
                  <td style={{fontWeight:'bold'}}>{p.purchaseNo || p.id}</td><td>{p.purchaseDate || '-'}</td><td>{p.itemName || '-'}</td>
                  <td>{p.referenceNo || p.projectNo || '-'}</td><td>{p.supplier || '-'}</td><td>{p.purchasedBy || '-'}</td>
                  <td>{fmt(p.totalCost || 0)}</td><td style={{fontWeight:'bold'}}>{fmt(p.finalAmount || p.amount || p.totalCost || 0)}</td>
                  <td><span className="status-badge" style={{background:p.status==='Closed'?'#dcfce7':'#fef3c7',color:p.status==='Closed'?'#166534':'#92400e'}}>{p.status}</span></td>
                  <td>{p.performedName || p.performedBy || '-'}</td>
                  <td><button className="btn btn-primary" onClick={()=>openClose('purchase',p,p.status==='Closed')}>{p.status==='Closed'?'✏️ Edit':'🔒 Close'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GRAND TOTAL */}
      <div className="panel" style={{ borderTop: '5px solid #8b5cf6', background: 'linear-gradient(135deg, #faf5ff 0%, #ffffff 100%)' }}>
        <h2 style={{ color: '#8b5cf6', marginTop: 0 }}>💰 Grand Total — Everything Combined</h2>

        <table>
          <thead>
            <tr style={{ background: '#faf5ff' }}>
              <th>Month</th>
              <th>Baseline (Maint + Dev)</th>
              <th>Actual (All Costs)</th>
              <th style={{ color: '#16a34a' }}>Savings</th>
              <th>Savings %</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map(m => {
              const totalBaselineMonth = MAINT_BASELINE + DEV_BASELINE;
              const totalActualMonth = m.maintActual + m.devActual;
              const totalSavingsMonth = m.maintSavings + m.devSavings;
              const s = getPctStyle(m.totalSavingsPct);
              return (
                <tr key={'g-' + m.month}>
                  <td style={{ fontWeight: 'bold' }}>{fmtMonth(m.month)}</td>
                  <td>{fmt(totalBaselineMonth)}</td>
                  <td>{fmt(totalActualMonth)}</td>
                  <td style={{ fontWeight: 'bold', color: '#16a34a' }}>{fmt(totalSavingsMonth)}</td>
                  <td>
                    <span className="status-badge" style={{ background: s.bg, color: s.color, fontWeight: 'bold' }}>
                      {s.icon} {m.totalSavingsPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: '#8b5cf6', color: 'white', fontWeight: 'bold', fontSize: '15px' }}>
              <td>TOTAL ({monthCount} months)</td>
              <td>{fmt(totalBaseline)}</td>
              <td>{fmt(totalActual)}</td>
              <td>{fmt(totalSavings)}</td>
              <td>{totalSavingsPct.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: '16px', padding: '16px', background: 'white', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '6px' }}>Total Savings across {monthCount} months</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#8b5cf6' }}>{fmt(totalSavings)} SAR</div>
          <div style={{ fontSize: '14px', color: '#16a34a', marginTop: '4px', fontWeight: 'bold' }}>Average {totalSavingsPct.toFixed(1)}% saved vs baseline</div>
        </div>
      </div>
      {closeModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:'20px'}}>
          <div style={{background:'white',borderRadius:'12px',padding:'22px',width:'min(520px,100%)',boxShadow:'0 20px 50px rgba(0,0,0,.25)'}}>
            <h3 style={{marginTop:0}}>{closeModal.edit ? '✏️ Edit Financial Closure' : '🔒 Close Financial Item'}</h3>
            <p style={{fontSize:'13px',color:'#64748b'}}>Enter the final amount, then confirm who performed the work/purchase.</p>
            <label style={{display:'block',marginTop:'12px',fontWeight:600}}>Final Amount (SAR)</label>
            <input type="number" min="0" step="0.01" value={closeForm.finalAmount} onChange={e=>setCloseForm({...closeForm,finalAmount:e.target.value})} style={{width:'100%',padding:'10px',marginTop:'5px'}} />
            <label style={{display:'block',marginTop:'12px',fontWeight:600}}>Performed By</label>
            <select value={closeForm.performedBy} onChange={e=>setCloseForm({...closeForm,performedBy:e.target.value,performedName:e.target.value==='Employee'?'':closeForm.performedName})} style={{width:'100%',padding:'10px',marginTop:'5px'}}>
              <option value="Employee">Our Employee</option>
              <option value="Contractor">Contractor</option>
            </select>
            {closeForm.performedBy==='Contractor' && (
              <>
                <label style={{display:'block',marginTop:'12px',fontWeight:600}}>Contractor Name</label>
                <input value={closeForm.performedName} onChange={e=>setCloseForm({...closeForm,performedName:e.target.value})} placeholder="Contractor name" style={{width:'100%',padding:'10px',marginTop:'5px'}} />
              </>
            )}
            {closeForm.performedBy==='Employee' && (
              <>
                <label style={{display:'block',marginTop:'12px',fontWeight:600}}>Employee Name (optional)</label>
                <input value={closeForm.performedName} onChange={e=>setCloseForm({...closeForm,performedName:e.target.value})} placeholder="Employee name" style={{width:'100%',padding:'10px',marginTop:'5px'}} />
              </>
            )}
            <label style={{display:'block',marginTop:'12px',fontWeight:600}}>Closing Notes</label>
            <textarea value={closeForm.closingNotes} onChange={e=>setCloseForm({...closeForm,closingNotes:e.target.value})} style={{width:'100%',minHeight:'70px',padding:'10px',marginTop:'5px'}} />
            <div style={{display:'flex',justifyContent:'flex-end',gap:'8px',marginTop:'18px'}}>
              <button className="btn" onClick={()=>setCloseModal(null)} disabled={savingClose}>Cancel</button>
              <button className="btn btn-primary" onClick={submitClose} disabled={savingClose}>{savingClose?'Saving...':(closeModal.edit?'Save Changes':'Confirm Close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

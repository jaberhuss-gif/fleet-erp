import { useState, useEffect } from 'react';
import api from '../api/client';
import { printContent } from '../api/print';

export default function FinancialReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/reports/financial');
      setData(res.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading">Loading financial report...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">No data</div>;

  const months = Array.isArray(data.months) ? data.months : (Array.isArray(data.rows) ? data.rows : []);
  const MAINT_BASELINE = 20577;
  const DEV_BASELINE = 132551;
  const SALARY_MAINT = 2200;
  const SALARY_DEV = 2200;
  const monthCount = months.length;

  const monthlyData = months.map(m => ({
    ...m,
    contractorWO: Number(m.contractorWO || 0),
    partsWO: Number(m.partsWO || 0),
    salaryMaint: Number(m.salaryMaint || SALARY_MAINT),
    contractorDev: Number(m.contractorDev || 0),
    partsDev: Number(m.partsDev || 0),
    salaryDev: Number(m.salaryDev || SALARY_DEV),
    employeeWOCount: Number(m.employeeWOCount || 0),
    contractorWOCount: Number(m.contractorWOCount || 0),
    internalProjectCount: Number(m.internalProjectCount || 0),
    contractorProjectCount: Number(m.contractorProjectCount || 0),
    maintActual: Number(m.contractorWO || 0) + Number(m.partsWO || 0) + Number(m.salaryMaint || SALARY_MAINT),
    devActual: Number(m.contractorDev || 0) + Number(m.partsDev || 0) + Number(m.salaryDev || SALARY_DEV),
    maintSavings: MAINT_BASELINE - (Number(m.contractorWO || 0) + Number(m.partsWO || 0) + Number(m.salaryMaint || SALARY_MAINT)),
    devSavings: DEV_BASELINE - (Number(m.contractorDev || 0) + Number(m.partsDev || 0) + Number(m.salaryDev || SALARY_DEV)),
    maintPct: ((MAINT_BASELINE - (Number(m.contractorWO || 0) + Number(m.partsWO || 0) + Number(m.salaryMaint || SALARY_MAINT))) / MAINT_BASELINE) * 100,
    devPct: ((DEV_BASELINE - (Number(m.contractorDev || 0) + Number(m.partsDev || 0) + Number(m.salaryDev || SALARY_DEV))) / DEV_BASELINE) * 100,
    totalSavingsPct: (((MAINT_BASELINE + DEV_BASELINE) - (Number(m.contractorWO || 0) + Number(m.partsWO || 0) + Number(m.salaryMaint || SALARY_MAINT)) - (Number(m.contractorDev || 0) + Number(m.partsDev || 0) + Number(m.salaryDev || SALARY_DEV))) / (MAINT_BASELINE + DEV_BASELINE)) * 100
  }));

  const maintBaselineTotal = MAINT_BASELINE * monthCount;
  const devBaselineTotal = DEV_BASELINE * monthCount;
  const totalBaseline = maintBaselineTotal + devBaselineTotal;

  const contractorWOTotal = monthlyData.reduce((s, m) => s + m.contractorWO, 0);
  const partsWOTotal = monthlyData.reduce((s, m) => s + m.partsWO, 0);
  const salaryMaintTotal = SALARY_MAINT * monthCount;
  const maintActualTotal = contractorWOTotal + partsWOTotal + salaryMaintTotal;

  const contractorDevTotal = monthlyData.reduce((s, m) => s + m.contractorDev, 0);
  const partsDevTotal = monthlyData.reduce((s, m) => s + m.partsDev, 0);
  const salaryDevTotal = SALARY_DEV * monthCount;
  const devActualTotal = contractorDevTotal + partsDevTotal + salaryDevTotal;

  const totalActual = maintActualTotal + devActualTotal;
  const maintSavingsTotal = maintBaselineTotal - maintActualTotal;
  const devSavingsTotal = devBaselineTotal - devActualTotal;
  const totalSavings = maintSavingsTotal + devSavingsTotal;
  const maintSavingsPct = maintBaselineTotal ? (maintSavingsTotal / maintBaselineTotal) * 100 : 0;
  const devSavingsPct = devBaselineTotal ? (devSavingsTotal / devBaselineTotal) * 100 : 0;
  const totalSavingsPct = totalBaseline ? (totalSavings / totalBaseline) * 100 : 0;

  const employeeWOTotal = monthlyData.reduce((s, m) => s + m.employeeWOCount, 0);
  const contractorWOCountTotal = monthlyData.reduce((s, m) => s + m.contractorWOCount, 0);
  const internalProjectTotal = monthlyData.reduce((s, m) => s + m.internalProjectCount, 0);
  const contractorProjectCountTotal = monthlyData.reduce((s, m) => s + m.contractorProjectCount, 0);

  const otherPurchasesTotal = monthlyData.reduce((s, m) => s + Number(m.otherPurchases || 0), 0);

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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ margin: 0 }}>💰 Financial Report</h2>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
            Baseline vs Actual — Maintenance & Development
          </p>
        </div>
        <button className="print-btn no-print" onClick={() => printContent('Financial Report', 'Baseline vs Actual')}>
          🖨️ Print Report
        </button>
      </div>

      {/* Formula Explanation */}
      <div style={{ marginBottom: '20px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>
        <strong>📐 Formula:</strong><br />
        <strong>Maintenance:</strong> Actual = Contractor WO + Parts WO + Salary (2,200) | Savings = Baseline (20,577) − Actual<br />
        <strong>Development:</strong> Actual = Contractor Dev + Parts Dev + Salary (2,200) | Savings = Baseline (132,551) − Actual<br />
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
    </div>
  );
}

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

  const months = data.months || [];
  const g = data.grand || {};

  const getPctStyle = (pct) => {
    if (pct >= 70) return { bg: '#dcfce7', color: '#16a34a', icon: '🟢' };
    if (pct >= 40) return { bg: '#fef3c7', color: '#b45309', icon: '🟡' };
    if (pct >= 0) return { bg: '#fee2e2', color: '#dc2626', icon: '🔴' };
    return { bg: '#991b1b', color: 'white', icon: '⚠️' };
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

      {/* GRAND SUMMARY CARDS */}
      <div className="cards-grid" style={{ marginBottom: '24px' }}>
        <div className="card" style={{ borderLeft: '5px solid #1e3a8a' }}>
          <h3>Total Baseline</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{Number(g.baseline || 0).toLocaleString()}</div>
          <div className="sub">SAR — All months</div>
        </div>
        <div className="card warning" style={{ borderLeft: '5px solid #f59e0b' }}>
          <h3>Total Actual</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>
            {Number((g.maintActual || 0) + (g.devActual || 0)).toLocaleString()}
          </div>
          <div className="sub">SAR — All costs</div>
        </div>
        <div className="card success" style={{ borderLeft: '5px solid #16a34a' }}>
          <h3>Total Savings</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{Number(g.totalSavings || 0).toLocaleString()}</div>
          <div className="sub">{g.totalSavingsPct?.toFixed(1)}% saved</div>
        </div>
      </div>

      {/* MAINTENANCE SECTION */}
      <div className="panel" style={{ borderTop: '5px solid #1e3a8a', marginBottom: '20px' }}>
        <h2 style={{ color: '#1e3a8a', marginTop: 0 }}>🔧 General Maintenance</h2>
        <div className="cards-grid" style={{ marginBottom: '16px' }}>
          <div className="card"><h3>Baseline</h3><div className="big-number" style={{ color: '#1e3a8a', fontSize: '22px' }}>20,577</div><div className="sub">SAR / month</div></div>
          <div className="card success"><h3>Total Savings</h3><div className="big-number" style={{ color: '#16a34a', fontSize: '22px' }}>{Number(g.maintSavings || 0).toLocaleString()}</div><div className="sub">SAR</div></div>
          <div className="card"><h3>Baseline × Months</h3><div className="big-number" style={{ color: '#64748b', fontSize: '22px' }}>{Number((g.maintenanceBaseline || 0) * months.length).toLocaleString()}</div><div className="sub">{months.length} months</div></div>
        </div>

        <table>
          <thead>
            <tr style={{ background: '#eff6ff' }}>
              <th>Month</th>
              <th>Baseline</th>
              <th>WO</th>
              <th>Parts</th>
              <th>Salary</th>
              <th style={{ color: '#dc2626' }}>Actual</th>
              <th style={{ color: '#16a34a' }}>Savings</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => {
              const s = getPctStyle(m.maintPct);
              return (
                <tr key={'m-' + m.month}>
                  <td style={{ fontWeight: 'bold' }}>{m.month}</td>
                  <td>20,577</td>
                  <td>{Number(m.contractorWO).toLocaleString()}</td>
                  <td>{Number(m.partsWO).toLocaleString()}</td>
                  <td>{Number(m.salary).toLocaleString()}</td>
                  <td style={{ fontWeight: 'bold', color: '#dc2626' }}>{Number(m.maintActual).toLocaleString()}</td>
                  <td style={{ fontWeight: 'bold', color: '#16a34a' }}>{Number(m.maintSavings).toLocaleString()}</td>
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
              <td>{Number((g.maintenanceBaseline || 0) * months.length).toLocaleString()}</td>
              <td>{Number(g.contractorWO || 0).toLocaleString()}</td>
              <td>{Number(g.partsWO || 0).toLocaleString()}</td>
              <td>{Number(g.salary || 0).toLocaleString()}</td>
              <td style={{ color: '#dc2626' }}>{Number(g.maintActual || 0).toLocaleString()}</td>
              <td style={{ color: '#16a34a' }}>{Number(g.maintSavings || 0).toLocaleString()}</td>
              <td>
                <span className="status-badge status-safe" style={{ fontWeight: 'bold' }}>
                  {(g.maintTotalSavingsPct || 0).toFixed(1)}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* DEVELOPMENT SECTION */}
      <div className="panel" style={{ borderTop: '5px solid #16a34a', marginBottom: '20px' }}>
        <h2 style={{ color: '#16a34a', marginTop: 0 }}>📁 Development Projects</h2>
        <div className="cards-grid" style={{ marginBottom: '16px' }}>
          <div className="card"><h3>Baseline</h3><div className="big-number" style={{ color: '#16a34a', fontSize: '22px' }}>132,551</div><div className="sub">SAR / month</div></div>
          <div className="card success"><h3>Total Savings</h3><div className="big-number" style={{ color: '#16a34a', fontSize: '22px' }}>{Number(g.devSavings || 0).toLocaleString()}</div><div className="sub">SAR</div></div>
          <div className="card"><h3>Baseline × Months</h3><div className="big-number" style={{ color: '#64748b', fontSize: '22px' }}>{Number((g.developmentBaseline || 0) * months.length).toLocaleString()}</div><div className="sub">{months.length} months</div></div>
        </div>

        <table>
          <thead>
            <tr style={{ background: '#f0fdf4' }}>
              <th>Month</th>
              <th>Baseline</th>
              <th>Dev</th>
              <th>Parts</th>
              <th>Salary</th>
              <th style={{ color: '#dc2626' }}>Actual</th>
              <th style={{ color: '#16a34a' }}>Savings</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => {
              const s = getPctStyle(m.devPct);
              return (
                <tr key={'d-' + m.month}>
                  <td style={{ fontWeight: 'bold' }}>{m.month}</td>
                  <td>132,551</td>
                  <td>{Number(m.contractorDev).toLocaleString()}</td>
                  <td>{Number(m.partsDev).toLocaleString()}</td>
                  <td>{Number(m.salary).toLocaleString()}</td>
                  <td style={{ fontWeight: 'bold', color: '#dc2626' }}>{Number(m.devActual).toLocaleString()}</td>
                  <td style={{ fontWeight: 'bold', color: '#16a34a' }}>{Number(m.devSavings).toLocaleString()}</td>
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
              <td>{Number((g.developmentBaseline || 0) * months.length).toLocaleString()}</td>
              <td>{Number(g.contractorDev || 0).toLocaleString()}</td>
              <td>{Number(g.partsDev || 0).toLocaleString()}</td>
              <td>{Number(g.salary || 0).toLocaleString()}</td>
              <td style={{ color: '#dc2626' }}>{Number(g.devActual || 0).toLocaleString()}</td>
              <td style={{ color: '#16a34a' }}>{Number(g.devSavings || 0).toLocaleString()}</td>
              <td>
                <span className="status-badge status-safe" style={{ fontWeight: 'bold' }}>
                  {(g.devTotalSavingsPct || 0).toFixed(1)}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
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
            {months.map(m => {
              const totalBaselineMonth = 20577 + 132551;
              const totalActualMonth = m.maintActual + m.devActual;
              const totalSavingsMonth = m.maintSavings + m.devSavings;
              const s = getPctStyle(m.totalSavingsPct);
              return (
                <tr key={'g-' + m.month}>
                  <td style={{ fontWeight: 'bold' }}>{m.month}</td>
                  <td>{totalBaselineMonth.toLocaleString()}</td>
                  <td>{totalActualMonth.toLocaleString()}</td>
                  <td style={{ fontWeight: 'bold', color: '#16a34a' }}>{totalSavingsMonth.toLocaleString()}</td>
                  <td>
                    <span className="status-badge" style={{ background: s.bg, color: s.color, fontWeight: 'bold' }}>
                      {s.icon} {m.totalSavingsPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: '#8b5cf6', color: 'white', fontWeight: 'bold', fontSize: '15px' }}>
              <td>TOTAL ({months.length} months)</td>
              <td>{Number((g.maintenanceBaseline + g.developmentBaseline) * months.length || g.baseline || 0).toLocaleString()}</td>
              <td>{Number((g.maintActual || 0) + (g.devActual || 0)).toLocaleString()}</td>
              <td>{Number(g.totalSavings || 0).toLocaleString()}</td>
              <td>{g.totalSavingsPct?.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: '16px', padding: '16px', background: 'white', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '6px' }}>Total Savings across {months.length} months</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#8b5cf6' }}>{Number(g.totalSavings || 0).toLocaleString()} SAR</div>
          <div style={{ fontSize: '14px', color: '#16a34a', marginTop: '4px', fontWeight: 'bold' }}>Average {g.totalSavingsPct?.toFixed(1)}% saved vs baseline</div>
        </div>
      </div>
    </div>
  );
}


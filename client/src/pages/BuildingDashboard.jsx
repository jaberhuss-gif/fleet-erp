import { useState, useEffect } from 'react';
import api from '../api/client';

export default function BuildingDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/building/dashboard');
      setData(res.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">No data</div>;

  const wo = data.workOrders || {};
  const proj = data.projects || {};
  const pur = data.purchases || {};

  return (
    <div>
      <div className="panel">
        <h2>Building Maintenance Dashboard</h2>
        <p style={{ color: '#64748b', fontSize: '14px' }}>Overview of building work orders, projects, and purchases.</p>
      </div>

      {/* Work Orders Summary */}
      <h3 style={{ marginBottom: '12px', color: '#1e3a8a' }}>Work Orders</h3>
      <div className="cards-grid" style={{ marginBottom: '24px' }}>
        <div className="card">
          <h3>Total Work Orders</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{wo.total || 0}</div>
          <div className="sub">All time</div>
        </div>
        <div className="card warning">
          <h3>Open</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{wo.open || 0}</div>
          <div className="sub">In progress</div>
        </div>
        <div className="card success">
          <h3>Closed</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{wo.closed || 0}</div>
          <div className="sub">Completed</div>
        </div>
        <div className="card">
          <h3>Internal</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{wo.internal || 0}</div>
          <div className="sub">Company employees</div>
        </div>
        <div className="card warning">
          <h3>Contractor</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{wo.contractor || 0}</div>
          <div className="sub">External contractors</div>
        </div>
      </div>

      {/* Costs */}
      <h3 style={{ marginBottom: '12px', color: '#1e3a8a' }}>Costs Breakdown (SAR)</h3>
      <div className="cards-grid" style={{ marginBottom: '24px' }}>
        <div className="card success">
          <h3>Total Cost</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{Number(wo.totalCost || 0).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card">
          <h3>Contractor Cost</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{Number(wo.contractorCost || 0).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card warning">
          <h3>Labor Cost</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{Number(wo.laborCost || 0).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card danger">
          <h3>Parts Cost</h3>
          <div className="big-number" style={{ color: '#dc2626' }}>{Number(wo.partsCost || 0).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
      </div>

      {/* Projects */}
      <h3 style={{ marginBottom: '12px', color: '#1e3a8a' }}>Projects</h3>
      <div className="cards-grid" style={{ marginBottom: '24px' }}>
        <div className="card">
          <h3>Total Projects</h3>
          <div className="big-number">{proj.total || 0}</div>
          <div className="sub">All time</div>
        </div>
        <div className="card">
          <h3>Total Budget</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{Number(proj.budget || 0).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className="card warning">
          <h3>Total Spent</h3>
          <div className="big-number" style={{ color: '#f59e0b' }}>{Number(proj.spent || 0).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
        <div className={(proj.budget - proj.spent) >= 0 ? 'card success' : 'card danger'}>
          <h3>Remaining</h3>
          <div className="big-number" style={{ color: (proj.budget - proj.spent) >= 0 ? '#16a34a' : '#dc2626' }}>
            {Number((proj.budget || 0) - (proj.spent || 0)).toLocaleString()}
          </div>
          <div className="sub">SAR</div>
        </div>
      </div>

      {/* Purchases */}
      <h3 style={{ marginBottom: '12px', color: '#1e3a8a' }}>Purchases</h3>
      <div className="cards-grid" style={{ marginBottom: '24px' }}>
        <div className="card">
          <h3>Total Purchase Records</h3>
          <div className="big-number">{pur.total || 0}</div>
          <div className="sub">items</div>
        </div>
        <div className="card success">
          <h3>Total Purchase Cost</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{Number(pur.totalCost || 0).toLocaleString()}</div>
          <div className="sub">SAR</div>
        </div>
      </div>


    </div>
  );
}

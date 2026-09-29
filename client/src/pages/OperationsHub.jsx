import { useState } from 'react';
import BuildingMaintenance from './BuildingMaintenance';

export default function OperationsHub({ access = {}, user }) {
  const can = (module, mode = 'view') =>
    user?.role === 'Owner' ||
    !!access?.[module]?.[mode === 'work' ? 'can_work' : 'can_view'];

  const tabs = [
    { id: 'maintenance', module: 'building', label: '🔧 Building / Maintenance', title: 'Building Maintenance & Work Orders' }
  ].filter(t => can(t.module));

  const [tab, setTab] = useState(() => tabs[0]?.id || 'maintenance');
  const visibleTab = tabs.find(t => t.id === tab) || tabs[0];

  if (!visibleTab) {
    return <div className="alert alert-error">No Operations department has been assigned to your account.</div>;
  }

  return (
    <div className="hub-page">
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0 }}>Operations</h1>
            <p style={{ margin: '6px 0 0', color: '#64748b' }}>
              Building maintenance and work orders.
            </p>
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            Access is controlled per department with View / Work.
          </div>
        </div>
      </div>

      <div className="sub-nav" style={{ marginBottom: 18 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={tab === t.id ? 'sub-btn active' : 'sub-btn'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{visibleTab.title}</h2>
      </div>

      {tab === 'maintenance' && <BuildingMaintenance user={user} access={access} />}
    </div>
  );
}

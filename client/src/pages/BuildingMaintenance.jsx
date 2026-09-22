import { useState } from 'react';
import BuildingDashboard from './BuildingDashboard';
import WorkOrders from './WorkOrders';
import Projects from './Projects';
import Purchases from './Purchases';

export default function BuildingMaintenance({ user, access = {} }) {
  const canView = (module) => user?.role === 'Owner' || !!access?.[module]?.can_view;

  const tabs = [
    { id: 'dashboard', module: 'building', label: 'Dashboard' },
    { id: 'work-orders', module: 'building', label: 'Work Orders' },
    { id: 'projects', module: 'projects', label: 'Projects' },
    { id: 'purchases', module: 'purchase_requests', label: 'Purchases' }
  ].filter(t => canView(t.module));

  const [sub, setSub] = useState(() => tabs[0]?.id || 'dashboard');
  const current = tabs.find(t => t.id === sub) || tabs[0];

  if (!current) {
    return <div className="alert alert-error">No Building / Maintenance section has been assigned.</div>;
  }

  return (
    <div>
      <div className="sub-nav">
        {tabs.map(t => (
          <button
            key={t.id}
            className={sub === t.id ? 'sub-btn active' : 'sub-btn'}
            onClick={() => setSub(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'dashboard' && <BuildingDashboard />}
      {sub === 'work-orders' && <WorkOrders user={user} access={access} />}
      {sub === 'projects' && <Projects user={user} access={access} />}
      {sub === 'purchases' && <Purchases user={user} access={access} />}
    </div>
  );
}

import { useState } from 'react';
import BuildingDashboard from './BuildingDashboard';
import Sites from './Sites';
import WorkOrders from './WorkOrders';
import Projects from './Projects';
import Purchases from './Purchases';

export default function BuildingMaintenance({ user, access = {} }) {
  const [sub, setSub] = useState('dashboard');

  return (
    <div>
      <div className="sub-nav">
        <button className={sub === 'dashboard' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSub('dashboard')}>Dashboard</button>
        <button className={sub === 'sites' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSub('sites')}>Sites</button>
        <button className={sub === 'work-orders' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSub('work-orders')}>Work Orders</button>
        <button className={sub === 'projects' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSub('projects')}>Projects</button>
        <button className={sub === 'purchases' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSub('purchases')}>Purchases</button>
      </div>

      {sub === 'dashboard' && <BuildingDashboard />}
      {sub === 'sites' && <Sites />}
      {sub === 'work-orders' && <WorkOrders user={user} access={access} />}
      {sub === 'projects' && <Projects />}
      {sub === 'purchases' && <Purchases />}
    </div>
  );
}

import { useState } from 'react';
import WorkOrders from './WorkOrders';
import Projects from './Projects';
import Purchases from './Purchases';

export default function BuildingMaintenance({ user, access = {} }) {
  const [sub, setSub] = useState(null);

  if (sub === 'work-orders') {
    return (
      <div>
        <button className="btn btn-warning" onClick={() => setSub(null)}>Back</button>
        <WorkOrders user={user} access={access} entryOnly />
      </div>
    );
  }

  if (sub === 'projects') {
    return (
      <div>
        <button className="btn btn-warning" onClick={() => setSub(null)}>Back</button>
        <Projects user={user} access={access} entryOnly />
      </div>
    );
  }

  if (sub === 'purchases') {
    return (
      <div>
        <button className="btn btn-warning" onClick={() => setSub(null)}>Back</button>
        <Purchases user={user} access={access} entryOnly />
      </div>
    );
  }

  return (
    <div className="panel">
      <style>{`
        .building-entry-only > *:not(.building-entry-form) { display: none !important; }
        .building-entry-only > .building-entry-form { display: block !important; }
      `}</style>
      <h2>Building Maintenance</h2>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '20px' }}>
        <button className="btn btn-primary" onClick={() => setSub('work-orders')}>Work Orders</button>
        <button className="btn btn-primary" onClick={() => setSub('projects')}>Projects</button>
        <button className="btn btn-primary" onClick={() => setSub('purchases')}>Purchases</button>
      </div>
    </div>
  );
}

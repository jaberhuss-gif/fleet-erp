import { useState } from 'react';
import WorkOrders from './WorkOrders';
import Projects from './Projects';
import Purchases from './Purchases';

export default function BuildingMaintenance({ user, access = {} }) {
  const canView = (module) => user?.role === 'Owner' || !!access?.[module]?.can_view;
  const [sub, setSub] = useState(null);

  const options = [
    { id: 'work-orders', module: 'building', label: 'Work Orders' },
    { id: 'projects', module: 'projects', label: 'Projects' },
    { id: 'purchases', module: 'purchase_requests', label: 'Purchases' }
  ].filter(x => canView(x.module));

  if (sub === 'work-orders') {
    return <WorkOrders user={user} access={access} entryOnly onBack={() => setSub(null)} />;
  }
  if (sub === 'projects') {
    return <Projects user={user} access={access} entryOnly onBack={() => setSub(null)} />;
  }
  if (sub === 'purchases') {
    return <Purchases user={user} access={access} entryOnly onBack={() => setSub(null)} />;
  }

  return (
    <div className="panel">
      <div style={{ background: 'linear-gradient(135deg, #0f766e, #14b8a6)', padding: '18px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Building Maintenance</h2>
      </div>
      <div className="cards-grid" style={{ padding: '24px', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))' }}>
        {options.map(x => (
          <button
            key={x.id}
            type="button"
            className="btn btn-primary"
            style={{ minHeight: '90px', fontSize: '20px', fontWeight: '700' }}
            onClick={() => setSub(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}

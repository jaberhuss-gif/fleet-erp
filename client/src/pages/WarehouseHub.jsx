import { useState } from 'react';
import Warehouse from './Warehouse';
import PurchaseRequests from './PurchaseRequests';

export default function WarehouseHub({ access = {}, user }) {
  const can = (module) =>
    user?.role === 'Owner' || !!access?.[module]?.can_view;

  const tabs = [
    { id: 'warehouse', module: 'warehouse', label: '📦 Warehouse', title: 'Warehouse & Stock' },
    { id: 'purchase-requests', module: 'purchase_requests', label: '🧾 Purchase Requests', title: 'Warehouse Purchase Requests' }
  ].filter(t => can(t.module));

  const [tab, setTab] = useState(() => tabs[0]?.id || 'warehouse');
  const current = tabs.find(t => t.id === tab) || tabs[0];

  if (!current) {
    return <div className="alert alert-error">No Warehouse section has been assigned to your account.</div>;
  }

  return (
    <div className="hub-page">
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0 }}>📦 Warehouse</h1>
            <p style={{ margin: '6px 0 0', color: '#64748b' }}>
              Warehouse and warehouse purchase requests.
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
        <h2 style={{ margin: 0 }}>{current.title}</h2>
      </div>

      {tab === 'warehouse' && <Warehouse user={user} access={access} />}
      {tab === 'purchase-requests' && <PurchaseRequests access={access} user={user} />}
    </div>
  );
}

import { useState } from 'react';
import Warehouse from './Warehouse';

export default function SupportServiceHub({ user, access = {} }) {
  const can = (module, mode = 'view') =>
    user?.role === 'Owner' ||
    !!access?.[module]?.[mode === 'work' ? 'can_work' : 'can_view'];

  const tabs = [
    { id: 'warehouse', label: '📦 Warehouse', title: 'Warehouse & Stock', show: can('warehouse') }
  ].filter(t => t.show);

  const [tab, setTab] = useState(() => tabs[0]?.id || 'warehouse');
  const current = tabs.find(t => t.id === tab) || tabs[0];

  if (!current) {
    return <div className="alert alert-error">No Support & Service section has been assigned to your account.</div>;
  }

  return (
    <div className="hub-page">
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap' }}>
          <div>
            <h1 style={{ margin:0 }}>🛠️ Support & Service</h1>
            <p style={{ margin:'6px 0 0', color:'#64748b' }}>
              Warehouse services and stock.
            </p>
          </div>
        </div>
      </div>

      <div className="sub-nav" style={{ marginBottom:18 }}>
        {tabs.map(t => (
          <button key={t.id} className={tab === t.id ? 'sub-btn active' : 'sub-btn'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginBottom:16 }}>
        <h2 style={{ margin:0 }}>{current.title}</h2>
      </div>

      {tab === 'warehouse' && <Warehouse user={user} access={access} />}
    </div>
  );
}

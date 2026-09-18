import { useState } from 'react';
import Warehouse from './Warehouse';
import Sites from './Sites';
import MaintenanceRequest from './MaintenanceRequest';

export default function SupportServiceHub({ user, access = {} }) {
  const can = (module, mode = 'view') =>
    user?.role === 'Owner' ||
    !!access?.[module]?.[mode === 'work' ? 'can_work' : 'can_view'];

  const tabs = [
    { id: 'request', label: '📝 Request Maintenance / Building', title: 'Request Maintenance / Building', show: can('support') || can('building') },
    { id: 'warehouse', label: '📦 Warehouse', title: 'Warehouse & Stock', show: can('warehouse') },
    { id: 'site', label: '📍 Site', title: 'All Sites & Locations', show: can('support') }
  ].filter(t => t.show);

  const [tab, setTab] = useState(() => tabs[0]?.id || 'site');
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
              Site-wide service view. Site is not a permission restriction.
            </p>
          </div>
          {can('building','work') && (
            <button className="btn btn-primary" onClick={() => setTab('request')}>+ Request Maintenance</button>
          )}
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

      {tab === 'request' && <MaintenanceRequest user={user} access={access} />}
      {tab === 'warehouse' && <Warehouse />}
      {tab === 'site' && <Sites />}
    </div>
  );
}

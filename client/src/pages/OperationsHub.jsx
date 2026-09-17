import { useState } from 'react';
import BuildingMaintenance from './BuildingMaintenance';
import Projects from './Projects';
import Warehouse from './Warehouse';

const TABS = [
  { id: 'maintenance', label: '🔧 Maintenance', title: 'Maintenance & Work Orders' },
  { id: 'projects', label: '🏗️ Projects', title: 'Projects & Development' },
  { id: 'warehouse', label: '📦 Warehouse', title: 'Warehouse & Stock' }
];

export default function OperationsHub() {
  const [tab, setTab] = useState('maintenance');
  const current = TABS.find(t => t.id === tab) || TABS[0];

  return (
    <div className="hub-page">
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0 }}>Operations</h1>
            <p style={{ margin: '6px 0 0', color: '#64748b' }}>
              Maintenance → Projects → Warehouse in one operational workspace
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'troubleshooter' }))}>
            🧠 Troubleshooter
          </button>
        </div>
      </div>

      <div className="sub-nav" style={{ marginBottom: 18 }}>
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'sub-btn active' : 'sub-btn'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{current.title}</h2>
      </div>

      {tab === 'maintenance' && <BuildingMaintenance />}
      {tab === 'projects' && <Projects />}
      {tab === 'warehouse' && <Warehouse />}
    </div>
  );
}

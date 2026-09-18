import { useState } from 'react';
import Warehouse from './Warehouse';
import Sites from './Sites';
import MaintenanceRequest from './MaintenanceRequest';
import DriverPortal from './DriverPortal';
import VehicleMaintenance from './VehicleMaintenance';
import Projects from './Projects';

const TABS = [
  { id: 'warehouse', label: '📦 Warehouse', title: 'Warehouse & Stock' },
  { id: 'sites', label: '📍 Sites', title: 'Sites & Locations' },
  { id: 'request', label: '📝 Request Maintenance', title: 'Maintenance Request' },
  { id: 'km', label: '📏 Driver KM Entry', title: 'Driver KM Entry' },
  { id: 'vehicle-maintenance', label: '🚗 Vehicle Maintenance', title: 'Vehicle Maintenance' },
  { id: 'projects', label: '🏗️ Projects', title: 'Projects & Development' }
];

export default function SupportServiceHub({ user }) {
  const [tab, setTab] = useState('warehouse');
  const current = TABS.find(t => t.id === tab) || TABS[0];

  return (
    <div className="hub-page">
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0 }}>🛠️ Support & Service</h1>
            <p style={{ margin: '6px 0 0', color: '#64748b' }}>
              Warehouse, sites, maintenance requests, driver KM and vehicle service in one workspace
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setTab('request')}
          >
            + Request Maintenance
          </button>
        </div>
      </div>

      <div className="sub-nav" style={{ marginBottom: 18 }}>
        {TABS.map(t => (
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

      {tab === 'warehouse' && <Warehouse />}
      {tab === 'sites' && <Sites />}
      {tab === 'request' && <MaintenanceRequest user={user} />}
      {tab === 'km' && <DriverPortal />}
      {tab === 'vehicle-maintenance' && <VehicleMaintenance />}
      {tab === 'projects' && <Projects />}
    </div>
  );
}

import { useState } from 'react';
import Vehicles from './Vehicles';
import VehicleMaintenance from './VehicleMaintenance';
import PeriodicMaintenance from './PeriodicMaintenance';

const TABS = [
  { id: 'vehicles', label: '🚗 Vehicles', title: 'Vehicles & Fleet' },
  { id: 'maintenance', label: '🔧 Vehicle Maintenance', title: 'Vehicle Maintenance & KM' },
  { id: 'periodic', label: '📅 Periodic Maintenance', title: 'Periodic Maintenance & Inspection' }
];

export default function FleetHub({ onViewVehicle }) {
  const [tab, setTab] = useState('vehicles');
  const current = TABS.find(t => t.id === tab) || TABS[0];

  return (
    <div className="hub-page">
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0 }}>Fleet</h1>
            <p style={{ margin: '6px 0 0', color: '#64748b' }}>
              Vehicles → Vehicle Maintenance → KM → Periodic Maintenance & Inspection
            </p>
          </div>
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

      {tab === 'vehicles' && <Vehicles onViewVehicle={onViewVehicle} />}
      {tab === 'maintenance' && <VehicleMaintenance />}
      {tab === 'periodic' && <PeriodicMaintenance />}
    </div>
  );
}

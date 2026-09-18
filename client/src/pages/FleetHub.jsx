import { useState } from 'react';
import Vehicles from './Vehicles';
import VehicleMaintenance from './VehicleMaintenance';

const TABS = [
  { id: 'vehicles', label: '🚗 Vehicles', title: 'Vehicles & Fleet' },
  { id: 'maintenance', label: '🔧 Vehicle Maintenance & Smart Service', title: 'Vehicle Maintenance & Smart Service' }
];

export default function FleetHub({ onViewVehicle }) {
  const [tab, setTab] = useState('vehicles');
  const current = TABS.find(t => t.id === tab) || TABS[0];

  return (
    <div className="hub-page">
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0 }}>🚗 Fleet</h1>
            <p style={{ margin: '6px 0 0', color: '#64748b' }}>
              Vehicles → Vehicle Maintenance & Smart Service
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
    </div>
  );
}

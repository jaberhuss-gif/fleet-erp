import { useState } from 'react';
import DriverPortal from './DriverPortal';
import Vehicles from './Vehicles';
import VehicleMaintenance from './VehicleMaintenance';
import ReportIssue from './ReportIssue';
import SmartReportIssue from './SmartReportIssue';
import FleetOverview from './FleetOverview';

const FLEET_SECTIONS = [
  {
    id: 'vehicles',
    label: '🚙 Vehicles',
    title: 'Vehicles',
    description: 'Fleet vehicles, current KM, driver assignment and vehicle details.'
  },
  {
    id: 'maintenance',
    label: '🔧 Vehicle Maintenance',
    title: 'Vehicle Maintenance',
    description: 'Periodic maintenance, inspections and vehicle service workflow.'
  },
  {
    id: 'km',
    label: '📏 KM Entry',
    title: 'KM Entry',
    description: 'Enter today\'s vehicle odometer reading and review the vehicle status.'
  },
  {
    id: 'issue',
    label: '🔧 Maintenance Issue Report',
    title: 'Maintenance Issue Report',
    description: 'Report a vehicle maintenance problem and create a maintenance ticket.'
  }
];

const SMART_LABEL = '🧠 Smart Report Issue';

export default function FleetHub({ user, access, onViewVehicle }) {
  const fleetView = user?.role === 'Owner' || !!access?.fleet?.can_view;
  const fleetWork = user?.role === 'Owner' || !!access?.fleet?.can_work;

  const [section, setSection] = useState('overview');
  const [smartOpen, setSmartOpen] = useState(false);

  if (!fleetView) {
    return (
      <div className="alert alert-error">
        Access denied: Fleet access is not assigned to this user.
      </div>
    );
  }

  const current = FLEET_SECTIONS.find(s => s.id === section) || FLEET_SECTIONS[0];

  const changeSection = (next) => {
    setSection(next);
    setSmartOpen(false);
  };

  return (
    <div className="hub-page">
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0 }}>🚗 Fleet</h1>
            <p style={{ margin: '6px 0 0', color: '#64748b' }}>
              KM Entry and Maintenance Issue Reporting with Smart Report Issue support
            </p>
          </div>
        </div>
      </div>

      <div className="sub-nav" style={{ marginBottom: 18 }}>
        {FLEET_SECTIONS.map(item => (
          <button
            key={item.id}
            className={section === item.id ? 'sub-btn active' : 'sub-btn'}
            onClick={() => changeSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>{current.title}</h2>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px' }}>{current.description}</p>
          </div>
          <button
            className={smartOpen ? 'sub-btn active' : 'sub-btn'}
            onClick={() => setSmartOpen(v => !v)}
          >
            {SMART_LABEL}
          </button>
        </div>
      </div>

      {smartOpen ? (
        <SmartReportIssue canWork={fleetWork} />
      ) : (
        <>
          {section === 'overview' && <FleetOverview onViewVehicle={onViewVehicle} />}
          {section === 'vehicles' && <Vehicles onViewVehicle={onViewVehicle} canWork={fleetWork} />}
          {section === 'maintenance' && <VehicleMaintenance canWork={fleetWork} />}
          {section === 'km' && <DriverPortal canWork={fleetWork} />}
          {section === 'issue' && <ReportIssue canWork={fleetWork} />}
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import DriverPortal from './DriverPortal';
import Drivers from './Drivers';
import Vehicles from './Vehicles';
import VehicleMaintenance from './VehicleMaintenance';
import ReportIssue from './ReportIssue';
import SmartReportIssue from './SmartReportIssue';
import FleetTicketViewer from './FleetTicketViewer';

const FLEET_ACTIONS = [
  {
    id: 'add-vehicle',
    label: '🚙 Add Vehicle',
    title: 'Add Vehicle',
    description: 'Add a new vehicle and maintain vehicle master data.'
  },
  {
    id: 'add-driver',
    label: '👨‍🔧 Add Driver',
    title: 'Add Driver',
    description: 'Add and maintain driver records and vehicle assignments.'
  },
  {
    id: 'readings',
    label: '📏 Edit KM & Previous Readings',
    title: 'Edit KM & Previous Readings',
    description: 'Review and edit current odometer and previous vehicle readings.'
  },
  {
    id: 'maintenance',
    label: '🔧 Vehicle Maintenance',
    title: 'Vehicle Maintenance',
    description: 'Periodic maintenance, inspections and repair verification.'
  },
  {
    id: 'issue',
    label: '🛠️ Maintenance Issue Report',
    title: 'Maintenance Issue Report',
    description: 'Report a vehicle maintenance problem and create a maintenance ticket.'
  },
  {
    id: 'smart-issue',
    label: '🧠 Smart Report Issue',
    title: 'Smart Report Issue',
    description: 'Use the smart maintenance issue reporting workflow.'
  }
];

export default function FleetHub({ user, access }) {
  const fleetView = user?.role === 'Owner' || !!access?.fleet?.can_view;
  const fleetWork = user?.role === 'Owner' || !!access?.fleet?.can_work;

  const [section, setSection] = useState('add-vehicle');

  if (!fleetView) {
    return (
      <div className="alert alert-error">
        Access denied: Fleet access is not assigned to this user.
      </div>
    );
  }

  const visibleActions = FLEET_ACTIONS.filter(item => {
    // Driver records are still controlled by the existing Owner-only
    // Drivers module. This keeps the Fleet shortcut from changing RBAC.
    if (item.id === 'add-driver') return user?.role === 'Owner';
    return true;
  });

  const safeSection = visibleActions.some(s => s.id === section)
    ? section
    : (visibleActions[0]?.id || 'readings');

  const current = visibleActions.find(s => s.id === safeSection) || visibleActions[0];

  const changeSection = (next) => {
    if (!visibleActions.some(s => s.id === next)) return;
    setSection(next);
  };

  return (
    <div className="hub-page">
      <div className="panel" style={{ marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>🚗 Fleet</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b' }}>
            Fleet vehicle and driver data entry, editing and maintenance actions.
          </p>
        </div>
      </div>

      <div className="sub-nav" style={{ marginBottom: 18 }}>
        {visibleActions.map(item => (
          <button
            key={item.id}
            className={safeSection === item.id ? 'sub-btn active' : 'sub-btn'}
            onClick={() => changeSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>{current.title}</h2>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px' }}>
            {current.description}
          </p>
        </div>
      </div>

      {safeSection === 'add-vehicle' && user?.role === 'Owner' && (
        <Vehicles key="fleet-add-vehicle" canWork={fleetWork} initialAction="add" />
      )}

      {safeSection === 'add-driver' && user?.role === 'Owner' && (
        <Drivers key="fleet-add-driver" initialAction="add" />
      )}

      {safeSection === 'readings' && (
        <Vehicles key="fleet-readings" canWork={fleetWork} initialAction="readings" />
      )}

      {safeSection === 'maintenance' && (
        <VehicleMaintenance canWork={fleetWork} />
      )}

      {safeSection === 'issue' && (
        <ReportIssue canWork={fleetWork} />
      )}

      {safeSection === 'smart-issue' && (
        <SmartReportIssue canWork={fleetWork} />
      )}
    </div>
  );
}

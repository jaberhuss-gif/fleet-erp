import { useState } from 'react';
import DriverPortal from './DriverPortal';
import Vehicles from './Vehicles';
import VehicleMaintenance from './VehicleMaintenance';
import ReportIssue from './ReportIssue';
import SmartReportIssue from './SmartReportIssue';
import TireManagement, { TireControlCenter } from './TireManagement';
import FleetOverview from './FleetOverview';
import FleetTicketViewer from './FleetTicketViewer';

const FLEET_SECTIONS = [
  {
    id: 'overview',
    label: '📊 Overview',
    title: 'Fleet Overview',
    description: 'Fleet alerts, KM compliance, open maintenance and vehicle tickets.'
  },
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
  },
  {
    id: 'tickets',
    label: '🎫 Fleet Tickets',
    title: 'Fleet Tickets',
    description: 'Separate vehicle Maintenance and Daily KM tickets.'
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

  const visibleSections = FLEET_SECTIONS.filter(s => {
    if (s.id === 'vehicles' || s.id === 'maintenance') return user?.role === 'Owner';
    if (s.id === 'tickets') return user?.role === 'Owner' || !!access?.fleet_tickets?.can_view;
    return true;
  });

  const safeSection = visibleSections.some(s => s.id === section)
    ? section
    : (visibleSections[0]?.id || 'km');

  const current = visibleSections.find(s => s.id === safeSection) || visibleSections[0];

  const changeSection = (next) => {
    if (!visibleSections.some(s => s.id === next)) return;
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
        {visibleSections.map(item => (
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
          {safeSection === 'overview' && <FleetOverview onViewVehicle={onViewVehicle} />}
          {safeSection === 'vehicles' && user?.role === 'Owner' && <Vehicles onViewVehicle={onViewVehicle} canWork={fleetWork} />}
          {safeSection === 'maintenance' && user?.role === 'Owner' && <VehicleMaintenance canWork={fleetWork} />}
          {safeSection === 'km' && <DriverPortal canWork={fleetWork} />}
          {safeSection === 'issue' && <ReportIssue canWork={fleetWork} />}
          {safeSection === 'tickets' && <FleetTicketViewer user={user} />}
        </>
      )}
    </div>
  );
}

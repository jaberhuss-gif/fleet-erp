import { useState } from 'react';
import PeriodicMaintenance from './PeriodicMaintenance';
import SmartReportIssue from './SmartReportIssue';

export default function VehicleMaintenance() {
  const [sub, setSub] = useState('maintenance');

  return (
    <div>
      {/* Gradient Header */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #0891b2 100%)', padding: '28px 24px', borderRadius: '12px', marginBottom: '20px', color: 'white' }}>
        <h2 style={{ margin: 0, fontSize: '24px' }}>🔧 Vehicle Maintenance Portal</h2>
        <p style={{ margin: '6px 0 0', opacity: 0.85, fontSize: '14px' }}>KM entry & smart issue reporting for drivers</p>
      </div>

      <div className="sub-nav">
        <button className={sub === 'km' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSub('km')}>
          📅 Maintenance
        </button>
        <button className={sub === 'report' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSub('report')}>
          🧠 Smart Report Issue
        </button>
      </div>

      {sub === 'maintenance' && <PeriodicMaintenance />}
      {sub === 'report' && <SmartReportIssue />}
    </div>
  );
}

import { useState } from 'react';
import DriverPortal from './DriverPortal';
import SmartReportIssue from './SmartReportIssue';

export default function VehicleMaintenance() {
  const [sub, setSub] = useState('km');

  return (
    <div>
      <div className="sub-nav">
        <button className={sub === 'km' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSub('km')}>
          📊 KM Entry
        </button>
        <button className={sub === 'report' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSub('report')}>
          🧠 Smart Report Issue
        </button>
      </div>

      {sub === 'km' && <DriverPortal />}
      {sub === 'report' && <SmartReportIssue />}
    </div>
  );
}

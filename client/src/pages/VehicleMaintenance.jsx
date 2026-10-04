import { useState } from 'react';
import PeriodicMaintenance from './PeriodicMaintenance';
import SmartReportIssue from './SmartReportIssue';
import VehicleRepairOrders from './VehicleRepairOrders';

export default function VehicleMaintenance({ canWork = false }) {
  const [sub, setSub] = useState('maintenance');

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #0891b2 100%)', padding: '28px 24px', borderRadius: '12px', marginBottom: '20px', color: 'white' }}>
        <h2 style={{ margin: 0, fontSize: '24px' }}>🔧 Periodic Maintenance (82)</h2>
        <p style={{ margin: '6px 0 0', opacity: 0.85, fontSize: '14px' }}>
          6-Month General Maintenance and Annual Periodic Inspection
        </p>
      </div>

      <div className="sub-nav">
        <button
          className={sub === 'maintenance' ? 'sub-btn active' : 'sub-btn'}
          onClick={() => setSub('maintenance')}
        >
          🔧 Periodic Maintenance (82)
        </button>
        <button
          className={sub === 'report' ? 'sub-btn active' : 'sub-btn'}
          onClick={() => setSub('report')}
        >
          🧠 Smart Report Issue
        </button>
        <button
          className={sub === 'repairs' ? 'sub-btn active' : 'sub-btn'}
          onClick={() => setSub('repairs')}
        >
          🛠️ Repair Verification
        </button>
      </div>

      {sub === 'maintenance' && <PeriodicMaintenance canWork={canWork} />}
      {sub === 'report' && <SmartReportIssue canWork={canWork} />}\n      {sub === 'repairs' && <VehicleRepairOrders canWork={canWork} />}
    </div>
  );
}

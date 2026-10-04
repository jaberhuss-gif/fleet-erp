import PeriodicMaintenance from './PeriodicMaintenance';

export default function VehicleMaintenance({ canWork = false }) {
  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #0891b2 100%)', padding: '28px 24px', borderRadius: '12px', marginBottom: '20px', color: 'white' }}>
        <h2 style={{ margin: 0, fontSize: '24px' }}>🔧 Periodic Maintenance (82)</h2>
        <p style={{ margin: '6px 0 0', opacity: 0.85, fontSize: '14px' }}>
          6-Month General Maintenance and Annual Periodic Inspection
        </p>
      </div>

      <PeriodicMaintenance canWork={canWork} />
    </div>
  );
}

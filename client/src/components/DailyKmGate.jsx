import { useEffect, useState } from 'react';
import api from '../api/client';

export default function DailyKmGate({ user }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    if (user?.role !== 'Driver') return;
    try {
      setLoading(true);
      const res = await api.get('/driver/km-status');
      setStatus(res.data?.status || null);
    } catch (e) {
      console.error('Daily KM gate check failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    check();
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    const timer = setInterval(check, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [user?.id, user?.role]);

  if (user?.role !== 'Driver' || loading || !status?.required) return null;

  const vehicle = status.vehicle;
  const goToFleet = () => {
    setStatus(null);
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'fleet' }));
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.68)',
      zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        width: 'min(520px, 100%)', background: '#fff', borderRadius: '16px',
        boxShadow: '0 25px 70px rgba(0,0,0,0.35)', overflow: 'hidden'
      }}>
        <div style={{ background: '#b91c1c', color: '#fff', padding: '22px 24px' }}>
          <div style={{ fontSize: '28px', marginBottom: '6px' }}>🚨</div>
          <h2 style={{ margin: 0, fontSize: '21px' }}>Daily KM Reading Required</h2>
        </div>

        <div style={{ padding: '24px' }}>
          <p style={{ marginTop: 0, fontSize: '15px', lineHeight: 1.6, color: '#334155' }}>
            You have not entered today's kilometer reading for your assigned vehicle.
            Please enter the current odometer reading before starting vehicle work.
          </p>

          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: '10px', padding: '14px 16px', marginBottom: '20px'
          }}>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>
              Vehicle: {vehicle?.plate || 'Assigned vehicle'}
            </div>
            <div style={{ marginTop: 6, color: '#475569' }}>
              Last recorded KM: {Number(vehicle?.currentKm || 0).toLocaleString()} km
            </div>
          </div>

          <button
            onClick={goToFleet}
            style={{
              width: '100%', background: '#b91c1c', color: '#fff', border: 0,
              borderRadius: '8px', padding: '13px 16px', cursor: 'pointer',
              fontWeight: 700, fontSize: '15px'
            }}
          >
            Enter Today's KM Now
          </button>

          <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: '#64748b' }}>
            This reminder will disappear automatically after the reading is saved.
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import api from '../api/client';
import { enablePushNotifications, subscribeToForegroundMessages } from '../firebase';

export default function Notifications() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(localStorage.getItem('fcm_push_enabled') === 'true');
  const [pushMessage, setPushMessage] = useState('');

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToForegroundMessages((payload) => {
      const title = payload?.notification?.title || payload?.data?.title || 'Fleet ERP';
      const message = payload?.notification?.body || payload?.data?.body || 'You have a new notification.';
      const id = 'push-' + Date.now();

      setNotifications(prev => [{
        id,
        type: payload?.data?.type || 'info',
        icon: payload?.data?.icon || '🔔',
        title,
        message,
        tab: payload?.data?.tab || null
      }, ...prev]);

      if (Notification.permission === 'granted') {
        try { new Notification(title, { body: message, icon: '/favicon.ico' }); } catch { /* browser handles foreground UI */ }
      }
    });

    return () => unsubscribe();
  }, []);

  const enablePush = async () => {
    try {
      setPushMessage('Enabling...');
      const result = await enablePushNotifications();
      if (result.success) {
        setPushEnabled(true);
        setPushMessage('Push notifications enabled.');
      } else {
        setPushMessage(result.message || 'Could not enable push notifications.');
      }
    } catch (e) {
      setPushMessage(e?.message || 'Could not enable push notifications.');
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const [alerts, lowStock, workOrders, periodic, vehicles] = await Promise.all([
        api.get('/alerts').then(r => r.data),
        api.get('/inventory/low-stock').then(r => r.data).catch(() => ({ items: [] })),
        api.get('/work-orders?status=Open').then(r => r.data).catch(() => ({ orders: [] })),
        api.get('/periodic-maintenance/alerts').then(r => r.data).catch(() => ({ overdue: [], dueSoon: [] })),
        api.get('/vehicles').then(r => r.data).catch(() => ({ vehicles: [] }))
      ]);

      const notifs = [];
      const vehicleRows = Array.isArray(vehicles?.vehicles) ? vehicles.vehicles : Array.isArray(vehicles) ? vehicles : [];
      const todayKey = new Date().toLocaleDateString('en-CA');

      vehicleRows
        .filter(v => String(v.status || '').toLowerCase() !== 'inactive')
        .filter(v => {
          if (!v.meter_updated_at) return true;
          const updatedKey = new Date(v.meter_updated_at).toLocaleDateString('en-CA');
          return updatedKey !== todayKey;
        })
        .forEach(v => {
          const plate = v.plate || `${v.plate_number || ''} ${v.plate_code || ''}`.trim() || `Vehicle #${v.id}`;
          const driver = v.driver_name || v.driver || 'Unassigned';
          const phone = v.driver_phone || v.phone || 'No phone recorded';
          notifs.push({ id: 'km-missing-' + v.id, type: 'danger', icon: '🚨', title: 'Daily KM Reading Missing', message: `${plate} — Driver: ${driver} — Phone: ${phone} — No odometer reading entered today`, tab: 'fleet-maintenance' });
        });

      if (alerts?.urgent) alerts.urgent.slice(0, 10).forEach(v => notifs.push({ id: 'oil-' + v.id, type: 'danger', icon: '🔴', title: 'Oil Change Overdue', message: v.plate + ' — ' + v.sinceOil.toLocaleString() + ' km since oil change', tab: 'fleet-maintenance' }));
      if (alerts?.warning) alerts.warning.slice(0, 5).forEach(v => notifs.push({ id: 'warn-' + v.id, type: 'warning', icon: '🟡', title: 'Oil Change Approaching', message: v.plate + ' — ' + v.remaining.toLocaleString() + ' km remaining', tab: 'fleet-maintenance' }));
      if (lowStock?.items) lowStock.items.slice(0, 10).forEach(i => notifs.push({ id: 'stock-' + i.id, type: 'warning', icon: '📦', title: 'Low Stock: ' + i.name, message: 'Only ' + i.quantity + ' ' + i.unit + ' left (min: ' + i.min_stock + ')', tab: 'warehouse' }));
      if (workOrders?.orders) workOrders.orders.slice(0, 5).forEach(w => notifs.push({ id: 'wo-' + w.id, type: 'info', icon: '🔧', title: 'Open Work Order: ' + w.wo_no, message: w.site + ' — ' + (w.description || ''), tab: 'building' }));
      if (periodic?.overdue) periodic.overdue.slice(0, 8).forEach(p => notifs.push({ id: 'periodic-overdue-' + p.id, type: 'danger', icon: '📅', title: 'Periodic Maintenance Overdue', message: (p.vehicle_plate || '') + ' — ' + (p.type === 'inspection' ? 'Inspection' : '6-Month Maintenance') + ' was due ' + p.scheduled_date, tab: 'periodic' }));
      if (periodic?.dueSoon) periodic.dueSoon.slice(0, 5).forEach(p => notifs.push({ id: 'periodic-soon-' + p.id, type: 'warning', icon: '📅', title: 'Periodic Maintenance Due Soon', message: (p.vehicle_plate || '') + ' — ' + (p.type === 'inspection' ? 'Inspection' : '6-Month Maintenance') + ' due ' + p.scheduled_date, tab: 'periodic' }));

      setNotifications(prev => {
        const pushOnly = prev.filter(n => String(n.id).startsWith('push-'));
        return [...pushOnly, ...notifs];
      });
    } catch (e) {
      // Silent fail, preserving existing notification behavior.
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (notif) => {
    setOpen(false);
    if (notif.tab) window.dispatchEvent(new CustomEvent('navigate', { detail: notif.tab }));
  };

  const urgentCount = notifications.filter(n => n.type === 'danger').length;
  const totalCount = notifications.length;
  const colorMap = {
    danger: { bg: '#fee2e2', color: '#dc2626', border: '#dc2626' },
    warning: { bg: '#fef3c7', color: '#b45309', border: '#f59e0b' },
    info: { bg: '#dbeafe', color: '#1e40af', border: '#1e3a8a' }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '18px', position: 'relative', display: 'flex', alignItems: 'center', gap: '6px' }}>
        🔔
        {totalCount > 0 && <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: urgentCount > 0 ? '#dc2626' : '#f59e0b', color: 'white', fontSize: '10px', fontWeight: 'bold', borderRadius: '10px', padding: '2px 6px', minWidth: '18px', textAlign: 'center' }}>{totalCount}</span>}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} />
          <div style={{ position: 'fixed', top: '70px', right: '20px', background: 'white', borderRadius: '10px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', width: '380px', maxHeight: '70vh', overflowY: 'auto', zIndex: 9999, color: '#1e293b', border: '1px solid #e2e8f0' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>Notifications</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{totalCount} active</div>
              </div>
              <button onClick={load} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#1e3a8a', fontSize: '12px', fontWeight: '600' }}>{loading ? 'Loading...' : '🔄 Refresh'}</button>
            </div>

            {!pushEnabled && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <button onClick={enablePush} style={{ width: '100%', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', padding: '9px 12px', cursor: 'pointer', fontWeight: '600' }}>
                  🔔 Enable Push Notifications
                </button>
                {pushMessage && <div style={{ marginTop: '7px', fontSize: '11px', color: '#64748b' }}>{pushMessage}</div>}
              </div>
            )}

            
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <button onClick={async () => {
                  try {
                    setPushMessage('Sending test notification...');
                    const response = await api.post('/push/test');
                    setPushMessage(response?.data?.success ? 'Test notification sent.' : 'Could not send test notification.');
                  } catch (e) {
                    setPushMessage(e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Could not send test notification.');
                  }
                }} style={{ width: '100%', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', padding: '9px 12px', cursor: 'pointer', fontWeight: '600' }}>
                  🧪 Send Test Push Notification
                </button>
                {pushMessage && <div style={{ marginTop: '7px', fontSize: '11px', color: '#64748b' }}>{pushMessage}</div>}
              </div>

            {notifications.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}><div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div><div style={{ fontSize: '13px' }}>No notifications</div><div style={{ fontSize: '11px', marginTop: '4px' }}>Everything is up to date</div></div>
            ) : notifications.map((n, idx) => {
              const c = colorMap[n.type] || colorMap.info;
              return <div key={n.id + '-' + idx} onClick={() => handleClick(n)} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: n.tab ? 'pointer' : 'default', borderLeft: '3px solid ' + c.border, background: 'white', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                <div style={{ display: 'flex', gap: '10px' }}><div style={{ fontSize: '20px' }}>{n.icon}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 'bold', fontSize: '13px', color: c.color }}>{n.title}</div><div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{n.message}</div></div></div>
              </div>;
            })}
          </div>
        </>
      )}
    </div>
  );
}

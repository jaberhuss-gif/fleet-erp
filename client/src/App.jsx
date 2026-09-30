import { useState, useEffect, useMemo } from 'react';
import GMDashboard from './pages/GMDashboardExecutive';
import FleetHub from './pages/FleetHub';
import VehicleDetails from './pages/VehicleDetails';
import Tickets from './pages/Tickets';
import Reports from './pages/Reports';
import SupportServiceHub from './pages/SupportServiceHub';
import Login from './pages/Login';
import Users from './pages/Users';
import Drivers from './pages/Drivers';
import Notifications from './pages/Notifications';
import AuditLog from './pages/AuditLog';
import Backup from './pages/Backup';
import Troubleshooter from './pages/Troubleshooter';
import FleetTicketViewer from './pages/FleetTicketViewer';
import AdvancedReports from './pages/AdvancedReports';
import OperationsHub from './pages/OperationsHub';
import BuildingMaintenancePage from './pages/BuildingMaintenance';
import WarehouseHub from './pages/WarehouseHub';
import api from './api/client';
import DailyKmGate from './components/DailyKmGate';
import DailyKmSubmitted from './pages/DailyKmSubmitted';
import DailyKmMissing from './pages/DailyKmMissing';

const OWNER_ONLY_TABS = new Set(['drivers', 'users', 'audit', 'backup']);

const TAB_MODULES = {
  gm: ['gm'],
  'support-service': ['support', 'building', 'projects', 'warehouse', 'purchase_requests'],
  operations: ['building'],
  warehouse: ['warehouse', 'purchase_requests'],
  'building-maintenance': ['building'],
  fleet: ['fleet'],
  troubleshooter: ['troubleshooter'],
  'fleet-tickets': ['fleet_tickets'],
  tickets: ['tickets'],
  reports: ['reports'],
  'advanced-reports': ['advanced_reports'],
  'daily-submitted': ['fleet'],
  'daily-missing': ['fleet']
};

const TAB_LABELS = {
  gm: 'GM Dashboard',
  fleet: '🚗 Fleet',
  troubleshooter: '🧠 Troubleshooter',
  reports: 'Reports',
  'fleet-tickets': '🚗 Vehicle Tickets',
  'advanced-reports': '📊 Advanced Reports',
  'daily-submitted': '📋 Daily KM — Submitted',
  'daily-missing': '⚠️ Daily KM — Missing',
  'support-service': '🛠️ Support & Service',
  operations: '🏢 Operations',
  warehouse: '📦 Warehouse',
  'building-maintenance': '📊 Building Maintenance Monthly Report',
  drivers: '👨‍🔧 Driver',
  users: 'Users',
  audit: 'Audit Log',
  backup: 'Backup'
};

const writeLog = (user, action, entityType, entityId, details) => {
  api.post('/audit-log', {
    userId: user?.id,
    username: user?.username || 'unknown',
    action,
    entityType: entityType || '',
    entityId: String(entityId || ''),
    details: details || ''
  }).catch(() => {});
};

export default function App() {
  const [user, setUser] = useState(null);
  const [access, setAccess] = useState(null);
  const [tab, setTab] = useState('gm');
  const [viewingVehicleId, setViewingVehicleId] = useState(null);
  const [ready, setReady] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const loadAccess = async (u) => {
    if (!u?.id) return;
    try {
      setAccessLoading(true);
      const res = await api.get('/users/' + u.id + '/access');
      setAccess(res.data.access || {});
    } catch (e) {
      console.error('Failed to load access matrix:', e);
      setAccess(null);
    } finally {
      setAccessLoading(false);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (stored && token) {
      try {
        const u = JSON.parse(stored);
        setUser(u);
        loadAccess(u);
      } catch {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!user || !access) return;
    const handler = (e) => {
      const target = e.detail;
      if (canViewTab(target)) setTab(target);
    };
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, [user, access]);

  const canViewModule = (module) => {
    if (user?.role === 'Owner') return true;
    return !!access?.[module]?.can_view;
  };

  const canViewTab = (target) => {
    if (OWNER_ONLY_TABS.has(target)) return user?.role === 'Owner';
    if (user?.role === 'Owner') return true;
    const modules = TAB_MODULES[target] || [];
    return modules.some(canViewModule);
  };

  const allowedTabs = useMemo(() => {
    const allTabs = ['gm', 'support-service', 'operations', 'warehouse', 'building-maintenance', 'fleet', 'daily-submitted', 'daily-missing', 'troubleshooter', 'fleet-tickets', 'tickets', 'reports', 'advanced-reports'];
    const isDriver = user?.role === 'Driver';
    const tabs = isDriver
      ? allTabs.filter(t => !['daily-submitted', 'daily-missing'].includes(t))
      : allTabs;
    const visible = tabs.filter(canViewTab);
    if (user?.role === 'Owner') {
      return [...visible, 'drivers', 'users', 'audit', 'backup'];
    }
    return visible;
  }, [user, access]);

  useEffect(() => {
    if (!user || !access || !allowedTabs.length) return;
    if (!canViewTab(tab) && !OWNER_ONLY_TABS.has(tab)) {
      setTab(allowedTabs[0]);
      setViewingVehicleId(null);
    }
  }, [user, access, allowedTabs, tab]);

  const handleLogin = async (u) => {
    setUser(u);
    setTab('gm');
    setAccess(null);
    await loadAccess(u);
    writeLog(u, 'LOGIN', 'User', u.id, 'Signed in as ' + u.role);
  };

  const handleLogout = () => {
    writeLog(user, 'LOGOUT', 'User', user?.id, 'Signed out');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setAccess(null);
    setTab('gm');
    setViewingVehicleId(null);
  };

  const handleViewVehicle = (id) => {
    setViewingVehicleId(id);
    setTab('vehicle-details');
    writeLog(user, 'VIEW', 'Vehicle', id, 'Viewed vehicle details');
  };

  const handleBackToVehicles = () => {
    setViewingVehicleId(null);
    setTab('fleet');
  };

  const handleTabChange = (t) => {
    if (!canViewTab(t) && !OWNER_ONLY_TABS.has(t)) return;
    setTab(t);
    if (t !== 'vehicle-details') setViewingVehicleId(null);
    writeLog(user, 'NAVIGATE', 'Page', t, 'Opened ' + (TAB_LABELS[t] || t));
  };

  if (!ready) return <div className="loading">Loading...</div>;
  if (!user) return <Login onLogin={handleLogin} />;
  if (accessLoading && !access) return <div className="loading">Loading permissions...</div>;

  return (
    <div className="app">
      <header className="header">
        <h1>Fleet ERP</h1>
        <div className="header-user-tools">
          <button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {user?.role === 'Owner' && (
            <button
              onClick={async () => {
                if (!window.confirm('Run the morning sync now? This will sync Google Sheet, Daily KM, and Maintenance.')) return;
                try {
                  const res = await api.post('/operations/morning-sync');
                  alert('Morning sync completed successfully.');
                  console.log('[Morning Sync]', res.data);
                } catch (e) {
                  alert(e.response?.data?.error || e.message || 'Morning sync failed.');
                }
              }}
              style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              title="Run Google Sheet, Daily KM, and Maintenance sync"
            >
              🔄 Morning Sync
            </button>
          )}
          <Notifications />
          <div style={{ textAlign: 'right', fontSize: '13px' }}>
            <div style={{ fontWeight: 'bold' }}>{user.fullName || user.username}</div>
            <div style={{ opacity: 0.7, fontSize: '11px' }}>{user.role}</div>
          </div>
          <button onClick={handleLogout} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            Logout
          </button>
        </div>
      </header>

      <DailyKmGate user={user} />

      <div className="erp-shell">
        <aside className="erp-sidebar">
          <div className="erp-sidebar-title">Navigation</div>

          <div className="erp-nav-group">
            <div className="erp-nav-heading">Fleet</div>
            {['fleet','daily-submitted','daily-missing','fleet-tickets'].filter(t => allowedTabs.includes(t)).map(t => (
              <button key={t} className={(tab === t || (t === 'fleet' && tab === 'vehicle-details')) ? 'erp-nav-btn active' : 'erp-nav-btn'} onClick={() => handleTabChange(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {['operations','building-maintenance'].some(t => allowedTabs.includes(t)) && (
            <div className="erp-nav-group">
              {['operations','building-maintenance'].filter(t => allowedTabs.includes(t)).map(t => (
                <button key={t} className={tab === t ? 'erp-nav-btn active' : 'erp-nav-btn'} onClick={() => handleTabChange(t)}>
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          )}

          {['support-service','tickets','troubleshooter'].some(t => allowedTabs.includes(t)) && (
            <div className="erp-nav-group">
              <div className="erp-nav-heading">Support & Service</div>
              {['support-service','tickets','troubleshooter'].filter(t => allowedTabs.includes(t)).map(t => (
                <button key={t} className={tab === t ? 'erp-nav-btn active' : 'erp-nav-btn'} onClick={() => handleTabChange(t)}>
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          )}

          {['reports','advanced-reports'].some(t => allowedTabs.includes(t)) && (
            <div className="erp-nav-group">
              <div className="erp-nav-heading">Reports</div>
              {['reports','advanced-reports'].filter(t => allowedTabs.includes(t)).map(t => (
                <button key={t} className={tab === t ? 'erp-nav-btn active' : 'erp-nav-btn'} onClick={() => handleTabChange(t)}>
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          )}

          {user.role === 'Owner' && (
            <div className="erp-nav-group">
              <div className="erp-nav-heading">Administration</div>
              {['drivers','users','audit','backup'].map(t => (
                <button key={t} className={tab === t ? 'erp-nav-btn active' : 'erp-nav-btn'} onClick={() => handleTabChange(t)}>
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          )}

          {allowedTabs.includes('gm') && (
            <div className="erp-nav-group">
              <div className="erp-nav-heading">Management</div>
              <button className={tab === 'gm' ? 'erp-nav-btn active' : 'erp-nav-btn'} onClick={() => handleTabChange('gm')}>
                {TAB_LABELS.gm}
              </button>
            </div>
          )}
        </aside>

        <main className="main">
          {tab === 'gm' && <GMDashboard />}
          {tab === 'support-service' && <SupportServiceHub user={user} access={access || {}} />}
          {tab === 'operations' && <OperationsHub user={user} access={access || {}} />}
          {tab === 'warehouse' && <WarehouseHub user={user} access={access || {}} />}
          {tab === 'building-maintenance' && canViewModule('building') && <BuildingMaintenancePage user={user} access={access || {}} />}
          {tab === 'fleet' && canViewModule('fleet') && (
            <FleetHub user={user} access={access || {}} onViewVehicle={handleViewVehicle} />
          )}
          {tab === 'vehicle-details' && viewingVehicleId && <VehicleDetails vehicleId={viewingVehicleId} onBack={handleBackToVehicles} />}
          {tab === 'troubleshooter' && <Troubleshooter />}
          {tab === 'fleet-tickets' && <FleetTicketViewer user={user} />}
          {tab === 'tickets' && canViewModule('tickets') && <Tickets user={user} access={access || {}} />}
          {tab === 'advanced-reports' && <AdvancedReports />}
          {tab === 'daily-submitted' && <DailyKmSubmitted />}
          {tab === 'daily-missing' && <DailyKmMissing user={user} />}
          {tab === 'reports' && <Reports />}
          {tab === 'drivers' && user.role === 'Owner' && <Drivers />}
          {tab === 'users' && user.role === 'Owner' && <Users />}
          {tab === 'audit' && user.role === 'Owner' && <AuditLog />}
          {tab === 'backup' && user.role === 'Owner' && <Backup />}
        </main>
      </div>
    </div>
  );
}

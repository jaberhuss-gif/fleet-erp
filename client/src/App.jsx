import { useState, useEffect } from 'react';
import GMDashboard from './pages/GMDashboard';
import VehicleMaintenance from './pages/VehicleMaintenance';
import Vehicles from './pages/Vehicles';
import VehicleDetails from './pages/VehicleDetails';
import Tickets from './pages/Tickets';
import Charts from './pages/Charts';
import Reports from './pages/Reports';
import BuildingMaintenance from './pages/BuildingMaintenance';
import Login from './pages/Login';
import Users from './pages/Users';
import Drivers from './pages/Drivers';
import Warehouse from './pages/Warehouse';
import Notifications from './pages/Notifications';
import PeriodicMaintenance from './pages/PeriodicMaintenance';
import AuditLog from './pages/AuditLog';
import Backup from './pages/Backup';
import Troubleshooter from './pages/Troubleshooter';
import MyTickets from './pages/MyTickets';
import AdvancedReports from './pages/AdvancedReports';
import api from './api/client';

const ROLE_TABS = {
  Owner: ['gm', 'vehicles', 'drivers', 'periodic', 'tickets', 'troubleshooter', 'charts', 'reports', 'building', 'warehouse', 'maintenance', 'users', 'audit', 'backup', 'mytickets', 'advanced-reports'],
  GM: ['gm'],
  Accountant: ['reports', 'advanced-reports'],
  CampusManager: ['building', 'warehouse', 'troubleshooter'],
  Driver: ['maintenance', 'troubleshooter', 'mytickets'],
  FleetSupervisor: ['gm', 'vehicles', 'drivers', 'periodic', 'tickets', 'troubleshooter', 'mytickets', 'charts', 'maintenance']
};

const TAB_LABELS = {
  gm: 'GM Dashboard',
  vehicles: 'Vehicles',
  drivers: 'Drivers',
  periodic: 'Periodic Maintenance',
  tickets: 'Tickets',
  troubleshooter: '🧠 Troubleshooter',
  mytickets: '📋 My Tickets',
  'advanced-reports': '📊 Advanced Reports',
  mytickets: '📋 My Tickets',
  'advanced-reports': '📊 Advanced Reports',
  mytickets: '📋 My Tickets',
  'advanced-reports': '📊 Advanced Reports',
  charts: 'Charts',
  reports: 'Reports',
  building: 'Building Maintenance',
  warehouse: 'Warehouse',
  maintenance: 'Vehicle Maintenance',
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
  const [tab, setTab] = useState('gm');
  const [viewingVehicleId, setViewingVehicleId] = useState(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  useEffect(() => {
    const stored = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (stored && token) {
      try {
        const u = JSON.parse(stored);
        setUser(u);
        const allowed = ROLE_TABS[u.role] || ['gm'];
        setTab(allowed[0]);
      } catch { /* ignore */ }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const target = e.detail;
      if (target && ROLE_TABS[user?.role]?.includes(target)) {
        setTab(target);
      }
    };
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, [user]);

  const handleLogin = (u) => {
    setUser(u);
    const allowed = ROLE_TABS[u.role] || ['gm'];
    setTab(allowed[0]);
    writeLog(u, 'LOGIN', 'User', u.id, 'Signed in as ' + u.role);
  };

  const handleLogout = () => {
    writeLog(user, 'LOGOUT', 'User', user?.id, 'Signed out');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
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
    setTab('vehicles');
  };

  const handleTabChange = (t) => {
    setTab(t);
    if (t === 'vehicles') setViewingVehicleId(null);
    writeLog(user, 'NAVIGATE', 'Page', t, 'Opened ' + (TAB_LABELS[t] || t));
  };

  if (!ready) return <div className="loading">Loading...</div>;
  if (!user) return <Login onLogin={handleLogin} />;

  const allowedTabs = ROLE_TABS[user.role] || ['gm'];

  return (
    <div className="app">
      <header className="header">
        <h1>Fleet ERP</h1>
        <nav className="nav">
          {allowedTabs.map(t => (
            <button
              key={t}
              className={(tab === t || (t === 'vehicles' && tab === 'vehicle-details')) ? 'nav-btn active' : 'nav-btn'}
              onClick={() => handleTabChange(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'white' }}>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
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
      <main className="main">
        {tab === 'gm' && <GMDashboard />}
        {tab === 'vehicles' && <Vehicles onViewVehicle={handleViewVehicle} />}
        {tab === 'drivers' && <Drivers />}
        {tab === 'periodic' && <PeriodicMaintenance />}
        {tab === 'vehicle-details' && viewingVehicleId && (
          <VehicleDetails vehicleId={viewingVehicleId} onBack={handleBackToVehicles} />
        )}
        {tab === 'tickets' && <Tickets />}
        {tab === 'troubleshooter' && <Troubleshooter />}
        {tab === 'mytickets' && <MyTickets />}
        {tab === 'advanced-reports' && <AdvancedReports />}
        {tab === 'charts' && <Charts />}
        {tab === 'reports' && <Reports />}
        {tab === 'building' && <BuildingMaintenance />}
        {tab === 'warehouse' && <Warehouse />}
        {tab === 'maintenance' && <VehicleMaintenance />}
        {tab === 'users' && <Users />}
        {tab === 'audit' && <AuditLog />}
        {tab === 'backup' && <Backup />}
      </main>
    </div>
  );
}








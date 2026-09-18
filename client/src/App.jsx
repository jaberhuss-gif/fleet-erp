import { useState, useEffect } from 'react';
import GMDashboard from './pages/GMDashboardExecutive';
import FleetHub from './pages/FleetHub';
import VehicleDetails from './pages/VehicleDetails';
import Tickets from './pages/Tickets';
import Reports from './pages/Reports';
import OperationsHub from './pages/OperationsHub';
import SupportServiceHub from './pages/SupportServiceHub';
import Login from './pages/Login';
import Users from './pages/Users';
import Drivers from './pages/Drivers';
import Notifications from './pages/Notifications';
import AuditLog from './pages/AuditLog';
import Backup from './pages/Backup';
import Troubleshooter from './pages/Troubleshooter';
import MyTickets from './pages/MyTickets';
import FleetTicketViewer from './pages/FleetTicketViewer';
import SupportManager from './pages/SupportManager';
import AdvancedReports from './pages/AdvancedReports';
import api from './api/client';

const OWNER_ONLY_TABS = new Set(['drivers', 'users', 'audit', 'backup']);
const ROLE_TABS = {
  Owner: ['gm', 'support-service', 'operations', 'fleet', 'troubleshooter', 'tickets', 'reports', 'advanced-reports', 'drivers', 'users', 'audit', 'backup'],
  GM: ['gm', 'support-service', 'troubleshooter'],
  Accountant: ['reports', 'advanced-reports'],
  CampusManager: ['support-service', 'operations', 'troubleshooter'],
  Driver: ['fleet', 'troubleshooter', 'mytickets'],
  SupportManager: ['support-manager'],
  FleetSupervisor: ['gm', 'support-service', 'fleet', 'troubleshooter', 'tickets'],
  FleetViewer: ['fleet-tickets']
};
const TAB_LABELS = {
  gm: 'GM Dashboard', fleet: '🚗 Fleet', operations: '🛠️ Operations',
  troubleshooter: '🧠 Troubleshooter', tickets: 'Tickets', reports: 'Reports',
  mytickets: '📋 My Tickets', 'fleet-tickets': '🚗 Vehicle Tickets', 'advanced-reports': '📊 Advanced Reports',
  'support-service': '🛠️ Support & Service', 'support-manager': '👀 Support Manager',
  drivers: '👨‍🔧 Driver', users: 'Users', audit: 'Audit Log', backup: 'Backup'
};
const writeLog = (user, action, entityType, entityId, details) => {
  api.post('/audit-log', { userId: user?.id, username: user?.username || 'unknown', action, entityType: entityType || '', entityId: String(entityId || ''), details: details || '' }).catch(() => {});
};

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('gm');
  const [viewingVehicleId, setViewingVehicleId] = useState(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => {
    const stored = localStorage.getItem('user'); const token = localStorage.getItem('token');
    if (stored && token) { try { const u = JSON.parse(stored); setUser(u); setTab((ROLE_TABS[u.role] || ['gm'])[0]); } catch { /* ignore */ } }
    setReady(true);
  }, []);
  useEffect(() => {
    const handler = (e) => { const target = e.detail; if (target && ROLE_TABS[user?.role]?.includes(target)) setTab(target); };
    window.addEventListener('navigate', handler); return () => window.removeEventListener('navigate', handler);
  }, [user]);
  const handleLogin = (u) => { setUser(u); setTab((ROLE_TABS[u.role] || ['gm'])[0]); writeLog(u, 'LOGIN', 'User', u.id, 'Signed in as ' + u.role); };
  const handleLogout = () => { writeLog(user, 'LOGOUT', 'User', user?.id, 'Signed out'); localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); setTab('gm'); setViewingVehicleId(null); };
  const handleViewVehicle = (id) => { setViewingVehicleId(id); setTab('vehicle-details'); writeLog(user, 'VIEW', 'Vehicle', id, 'Viewed vehicle details'); };
  const handleBackToVehicles = () => { setViewingVehicleId(null); setTab('fleet'); };
  const handleTabChange = (t) => { setTab(t); if (t !== 'vehicle-details') setViewingVehicleId(null); writeLog(user, 'NAVIGATE', 'Page', t, 'Opened ' + (TAB_LABELS[t] || t)); };
  if (!ready) return <div className="loading">Loading...</div>;
  if (!user) return <Login onLogin={handleLogin} />;
  const allowedTabs = ROLE_TABS[user.role] || ['gm'];
  const operationalTabs = allowedTabs.filter(t => !OWNER_ONLY_TABS.has(t));
  const ownerTabs = allowedTabs.filter(t => OWNER_ONLY_TABS.has(t));
  return (
    <div className="app">
      <header className="header">
        <h1>Fleet ERP</h1>
        <nav className="nav">
          {operationalTabs.map(t => <button key={t} className={(tab === t || (t === 'fleet' && tab === 'vehicle-details')) ? 'nav-btn active' : 'nav-btn'} onClick={() => handleTabChange(t)}>{TAB_LABELS[t]}</button>)}
          {user.role === 'Owner' && ownerTabs.length > 0 && <span className="owner-only-nav"><span style={{ opacity: 0.55, margin: '0 4px' }}>|</span>{ownerTabs.map(t => <button key={t} className={tab === t ? 'nav-btn active owner-only' : 'nav-btn owner-only'} onClick={() => handleTabChange(t)}>{TAB_LABELS[t]}</button>)}</span>}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'white' }}>
          <button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}>{theme === 'light' ? '🌙' : '☀️'}</button>
          {!['FleetViewer', 'SupportManager'].includes(user.role) && <Notifications />}
          <div style={{ textAlign: 'right', fontSize: '13px' }}><div style={{ fontWeight: 'bold' }}>{user.fullName || user.username}</div><div style={{ opacity: 0.7, fontSize: '11px' }}>{user.role}</div></div>
          <button onClick={handleLogout} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Logout</button>
        </div>
      </header>
      <main className="main">
        {tab === 'gm' && <GMDashboard />}
        {tab === 'support-service' && <SupportServiceHub user={user} />}
        {tab === 'fleet' && <FleetHub onViewVehicle={handleViewVehicle} />}
        {tab === 'vehicle-details' && viewingVehicleId && <VehicleDetails vehicleId={viewingVehicleId} onBack={handleBackToVehicles} />}
        {tab === 'troubleshooter' && <Troubleshooter />}
        {tab === 'operations' && <OperationsHub />}
        {tab === 'tickets' && <Tickets />}
        {tab === 'mytickets' && <MyTickets />}
        {tab === 'fleet-tickets' && user.role === 'FleetViewer' && <FleetTicketViewer />}
        {tab === 'support-manager' && user.role === 'SupportManager' && <SupportManager />}
        {tab === 'advanced-reports' && <AdvancedReports />}
        {tab === 'reports' && <Reports />}
        {tab === 'drivers' && user.role === 'Owner' && <Drivers />}
        {tab === 'users' && user.role === 'Owner' && <Users />}
        {tab === 'audit' && user.role === 'Owner' && <AuditLog />}
        {tab === 'backup' && user.role === 'Owner' && <Backup />}
      </main>
    </div>
  );
}

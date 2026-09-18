import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';

const EMPTY_FORM = {
  username: '', password: '', fullName: '', role: 'Driver',
  email: '', phone: '', site: '', department: 'General'
};

const GROUPS = {
  'Core / Service': ['gm', 'support', 'tickets', 'mytickets', 'troubleshooter', 'reports', 'advanced_reports'],
  'Operations Departments': ['building', 'projects', 'warehouse', 'purchase_requests', 'fleet', 'fleet_tickets'],
  'Owner Administration': ['drivers', 'users', 'audit', 'backup']
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [access, setAccess] = useState({});
  const [accessLoading, setAccessLoading] = useState(false);
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
    api.get('/sites').then(r => setSites(r.data.sites || [])).catch(() => {});
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/users');
      setUsers(res.data.users || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAccess = async (user) => {
    try {
      setAccessLoading(true);
      const res = await api.get('/users/' + user.id + '/access');
      setModules(res.data.modules || []);
      setAccess(res.data.access || {});
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setAccessLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
    setEditing(null);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
    setAccess({});
  };

  const openEdit = async (u) => {
    setEditing(u);
    setForm({
      username: u.username || '',
      password: '',
      fullName: u.full_name || '',
      role: u.role || 'Driver',
      email: u.email || '',
      phone: u.phone || '',
      site: u.site || '',
      department: u.department || 'General'
    });
    setShowForm(true);
    await loadAccess(u);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      let saved;
      if (editing) {
        const payload = { ...form };
        delete payload.username;
        if (!payload.password) delete payload.password;
        const res = await api.put('/users/' + editing.id, payload);
        saved = res.data.user;
        if (Object.keys(access).length > 0) {
          await api.put('/users/' + editing.id + '/access', { access });
        }
        setMessage('User updated: ' + saved.username);
        await loadAccess(saved);
      } else {
        const res = await api.post('/users', form);
        saved = res.data.user;
        setMessage('User created: ' + saved.username + '. Set View/Work permissions with Edit.');
      }
      await load();
      if (!editing) {
        setForm({ ...EMPTY_FORM });
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const handleDelete = async (id, username) => {
    if (!confirm('Delete user "' + username + '"?')) return;
    try {
      await api.delete('/users/' + id);
      setMessage('User deleted');
      if (String(editing?.id) === String(id)) resetForm();
      load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const toggleAccess = (module, key) => {
    setAccess(prev => {
      const current = prev[module] || { can_view: false, can_work: false };
      if (key === 'can_view') {
        return {
          ...prev,
          [module]: {
            can_view: !current.can_view,
            can_work: current.can_view ? false : current.can_work
          }
        };
      }
      return {
        ...prev,
        [module]: {
          can_view: true,
          can_work: !current.can_work
        }
      };
    });
  };

  const accessMap = useMemo(() => {
    const map = {};
    modules.forEach(m => { map[m.id] = m; });
    return map;
  }, [modules]);

  const getRoleBadge = (role) => {
    const colors = {
      Owner: ['#faf5ff', '#8b5cf6'],
      GM: ['#eff6ff', '#1e3a8a'],
      Accountant: ['#f0fdf4', '#16a34a'],
      CampusManager: ['#fef3c7', '#b45309'],
      Driver: ['#fef2f2', '#dc2626'],
      FleetSupervisor: ['#f0f9ff', '#0891b2'],
      FleetViewer: ['#ecfeff', '#0e7490'],
      SupportManager: ['#f0fdf4', '#15803d']
    };
    const [bg, color] = colors[role] || ['#f1f5f9', '#64748b'];
    return <span className="status-badge" style={{ background: bg, color }}>{role}</span>;
  };

  const exportRows = users.map(u => ({
    id: u.id, username: u.username, full_name: u.full_name, role: u.role,
    department: u.department, site: u.site, email: u.email, phone: u.phone,
    is_active: u.is_active
  }));

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #7c3aed 100%)', padding: '28px 24px', borderRadius: '12px', marginBottom: '20px', color: 'white' }}>
        <h2 style={{ margin: 0, fontSize: '24px' }}>👥 Users Management</h2>
        <p style={{ margin: '6px 0 0', opacity: 0.9, fontSize: '14px' }}>
          Roles are templates. The actual access is controlled below for each user.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <button
          className="btn btn-success"
          onClick={() => exportToCSV(exportRows, 'users', [
            {key:'id',label:'ID'},{key:'username',label:'Username'},{key:'full_name',label:'Full Name'},
            {key:'role',label:'Role'},{key:'department',label:'Department'},{key:'site',label:'Site'},
            {key:'email',label:'Email'},{key:'phone',label:'Phone'},{key:'is_active',label:'Active'}
          ])}
        >Export CSV</button>
        <button className="btn btn-primary" onClick={() => showForm ? resetForm() : openAdd()}>
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
          <form onSubmit={handleSubmit}>
            <h3 style={{ marginTop: 0 }}>{editing ? 'Edit User & Permissions' : 'New User'}</h3>
            <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))' }}>
              <div className="form-group">
                <label>Username *</label>
                <input value={form.username} disabled={!!editing} onChange={e => setForm({...form, username:e.target.value})} required />
              </div>
              <div className="form-group">
                <label>{editing ? 'New Password (optional)' : 'Password *'}</label>
                <input type="password" value={form.password} onChange={e => setForm({...form, password:e.target.value})} required={!editing} placeholder={editing ? 'Leave blank to keep current' : 'min 6 chars'} />
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input value={form.fullName} onChange={e => setForm({...form, fullName:e.target.value})} />
              </div>
              <div className="form-group">
                <label>Role / Template *</label>
                <select value={form.role} onChange={e => setForm({...form, role:e.target.value})}>
                  <option value="Owner">👑 Owner</option>
                  <option value="GM">👔 GM</option>
                  <option value="Accountant">💰 Accountant</option>
                  <option value="CampusManager">🏢 Campus Manager</option>
                  <option value="Driver">🚗 Driver</option>
                  <option value="FleetSupervisor">🔧 Fleet Supervisor</option>
                  <option value="FleetViewer">👀 Fleet Viewer</option>
                  <option value="SupportManager">👀 Support Manager</option>
                </select>
              </div>
              <div className="form-group">
                <label>Department (optional)</label>
                <select value={form.department} onChange={e => setForm({...form, department:e.target.value})}>
                  <option value="General">General</option>
                  <option value="Support">Support & Service</option>
                  <option value="Building">Building / Maintenance</option>
                  <option value="Projects">Projects</option>
                  <option value="Warehouse">Warehouse</option>
                  <option value="Fleet">Fleet</option>
                </select>
              </div>
              <div className="form-group">
                <label>Site Access Scope</label>
                <select value={form.site} onChange={e => setForm({...form, site:e.target.value})}>
                  <option value="ALL">All Sites</option>
                  <option value="">-- No site reference --</option>
                  {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} />
              </div>
            </div>

            {editing && form.role !== 'Owner' && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap: 12, flexWrap:'wrap' }}>
                  <div>
                    <h3 style={{ margin:'0 0 4px' }}>🔐 Access Matrix</h3>
                    <div style={{ color:'#64748b', fontSize:13 }}>
                      View = can open/read. Work = can add/edit/perform actions. Building access is for all sites.
                    </div>
                  </div>
                  <div style={{ color:'#475569', fontSize:12 }}>Site is not used as a permission boundary.</div>
                </div>

                {accessLoading ? (
                  <div className="loading" style={{ marginTop: 12 }}>Loading permissions...</div>
                ) : (
                  <div style={{ display:'grid', gap:14, marginTop:14 }}>
                    {Object.entries(GROUPS).map(([group, ids]) => (
                      <div key={group} className="panel" style={{ margin:0, padding:12 }}>
                        <h4 style={{ margin:'0 0 10px' }}>{group}</h4>
                        <div style={{ overflowX:'auto' }}>
                          <table>
                            <thead>
                              <tr><th>Section</th><th style={{width:100}}>View</th><th style={{width:100}}>Work</th></tr>
                            </thead>
                            <tbody>
                              {ids.map(id => {
                                const mod = accessMap[id] || { id, label:id };
                                const a = access[id] || { can_view:false, can_work:false };
                                return (
                                  <tr key={id}>
                                    <td style={{fontWeight:600}}>{mod.label}</td>
                                    <td>
                                      <label style={{display:'inline-flex',alignItems:'center',gap:6}}>
                                        <input type="checkbox" checked={!!a.can_view} onChange={() => toggleAccess(id,'can_view')} />
                                        View
                                      </label>
                                    </td>
                                    <td>
                                      <label style={{display:'inline-flex',alignItems:'center',gap:6}}>
                                        <input type="checkbox" checked={!!a.can_work} onChange={() => toggleAccess(id,'can_work')} />
                                        Work
                                      </label>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {editing?.role === 'Owner' && (
              <div className="alert alert-info" style={{ marginTop: 16 }}>
                Owner always has full system access.
              </div>
            )}

            <div className="btn-row" style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn-success">{editing ? 'Save User & Permissions' : 'Create User'}</button>
              <button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="alert alert-info">No users yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Username</th><th>Full Name</th><th>Role</th>
              <th>Department</th><th>Site</th><th>Email</th><th>Phone</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>#{u.id}</td>
                <td style={{fontWeight:'bold'}}>{u.username}</td>
                <td>{u.full_name || '-'}</td>
                <td>{getRoleBadge(u.role)}</td>
                <td>{u.department || 'General'}</td>
                <td>{u.site === "ALL" || !u.site ? "All Sites" : u.site}</td>
                <td>{u.email || '-'}</td>
                <td>{u.phone || '-'}</td>
                <td>
                  <span className={u.is_active ? 'status-badge status-safe' : 'status-badge status-urgent'}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  {u.username !== 'owner' && (
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      <button className="btn btn-primary" style={{padding:'6px 10px',fontSize:12}} onClick={() => openEdit(u)}>Edit</button>
                      <button className="btn btn-danger" style={{padding:'6px 10px',fontSize:12}} onClick={() => handleDelete(u.id,u.username)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

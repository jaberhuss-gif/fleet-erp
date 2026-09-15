import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    username: '', password: '', fullName: '', role: 'Driver', email: '', phone: ''
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users');
      setUsers(res.data.users || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ username: '', password: '', fullName: '', role: 'Driver', email: '', phone: '' });
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      await api.post('/users', form);
      setMessage('User created: ' + form.username);
      resetForm();
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleDelete = async (id, username) => {
    if (!confirm('Delete user "' + username + '"?')) return;
    try {
      await api.delete('/users/' + id);
      setMessage('User deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const getRoleBadge = (role) => {
    const colors = {
      Owner: { bg: '#faf5ff', color: '#8b5cf6' },
      GM: { bg: '#eff6ff', color: '#1e3a8a' },
      Accountant: { bg: '#f0fdf4', color: '#16a34a' },
      CampusManager: { bg: '#fef3c7', color: '#b45309' },
      Driver: { bg: '#fef2f2', color: '#dc2626' },
      FleetSupervisor: { bg: '#f0f9ff', color: '#0891b2' }
    };
    const c = colors[role] || { bg: '#f1f5f9', color: '#64748b' };
    return <span className="status-badge" style={{ background: c.bg, color: c.color }}>{role}</span>;
  };

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0 }}>Users Management ({users.length})</h2>
        <button className="btn btn-success" style={{ marginRight: "8px" }} onClick={() => exportToCSV(users, "users", [{key:"id",label:"ID"},{key:"username",label:"Username"},{key:"full_name",label:"Full Name"},{key:"role",label:"Role"},{key:"email",label:"Email"},{key:"phone",label:"Phone"},{key:"is_active",label:"Active"}])}>Export CSV</button><button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3>New User</h3>
          <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="form-group">
              <label>Username *</label>
              <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required placeholder="e.g. ahmed" />
            </div>
            <div className="form-group">
              <label>Password *</label>
              <input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required placeholder="min 6 chars" />
            </div>
            <div className="form-group">
              <label>Full Name</label>
              <input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="e.g. Ahmed Ali" />
            </div>
            <div className="form-group">
              <label>Role *</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="Owner">👑 Owner (Full Access)</option>
                <option value="GM">👔 GM (Dashboard only)</option>
                <option value="Accountant">💰 Accountant (Reports)</option>
                <option value="CampusManager">🏢 Campus Manager (Building)</option>
                <option value="Driver">🚗 Driver (Vehicle Maintenance)</option>
                <option value="FleetSupervisor">🔧 Fleet Supervisor</option>
              </select>
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn-success">Create User</button>
            <button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button>
          </div>
        </form>
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
              <th>Email</th><th>Phone</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>#{u.id}</td>
                <td style={{ fontWeight: 'bold' }}>{u.username}</td>
                <td>{u.full_name || '-'}</td>
                <td>{getRoleBadge(u.role)}</td>
                <td>{u.email || '-'}</td>
                <td>{u.phone || '-'}</td>
                <td>
                  <span className={u.is_active ? 'status-badge status-safe' : 'status-badge status-urgent'}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  {u.username !== 'owner' && (
                    <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleDelete(u.id, u.username)}>Delete</button>
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


import { useState, useEffect } from 'react';
import api from '../api/client';

export default function Sites() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    code: '', name: '', region: '', campusManager: '', phone: '', notes: '', status: 'Active'
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/sites');
      setSites(res.data.sites || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ code: '', name: '', region: '', campusManager: '', phone: '', notes: '', status: 'Active' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      if (editing) {
        await api.put('/sites/' + editing.id, form);
        setMessage('Site updated');
      } else {
        await api.post('/sites', form);
        setMessage('Site added');
      }
      resetForm();
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const handleEdit = (s) => {
    setForm({
      code: s.code || '', name: s.name || '', region: s.region || '',
      campusManager: s.campus_manager || '', phone: s.phone || '',
      notes: s.notes || '', status: s.status || 'Active'
    });
    setEditing(s);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this site?')) return;
    try {
      await api.delete('/sites/' + id);
      setMessage('Site deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="panel">
      <div style={{ background: 'linear-gradient(135deg, #92400e, #d97706)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Sites</h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? 'Cancel' : '+ Add Site'}
        </button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3>{editing ? 'Edit Site' : 'New Site'}</h3>
          <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="form-group"><label>Code</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="UQL" /></div>
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Uqlat Al-Suqour" required /></div>
            <div className="form-group"><label>Region</label><input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} placeholder="Qassim" /></div>
            <div className="form-group"><label>Campus Manager</label><input value={form.campusManager} onChange={e => setForm({ ...form, campusManager: e.target.value })} /></div>
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-group"><label>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}></textarea></div>
          <div className="btn-row">
            <button type="submit" className="btn btn-success">{editing ? 'Update' : 'Save'}</button>
            <button type="button" className="btn btn-warning" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loading">Loading...</div>
      ) : sites.length === 0 ? (
        <div className="alert alert-info">No sites yet. Add your first site.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Region</th><th>Manager</th><th>Phone</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sites.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 'bold' }}>{s.code || '-'}</td>
                <td style={{ fontWeight: 'bold' }}>{s.name}</td>
                <td>{s.region || '-'}</td>
                <td>{s.campus_manager || '-'}</td>
                <td>{s.phone || '-'}</td>
                <td><span className={s.status === 'Active' ? 'status-badge status-safe' : 'status-badge status-warning'}>{s.status}</span></td>
                <td>
                  <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleEdit(s)}>Edit</button>
                  <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleDelete(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

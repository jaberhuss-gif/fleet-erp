import { useEffect, useState } from 'react';
import api from '../api/client';

const initialForm = {
  site: '',
  category: 'General Maintenance',
  priority: 'Medium',
  description: ''
};

export default function MaintenanceRequest({ user }) {
  const [form, setForm] = useState(initialForm);
  const [sites, setSites] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const readOnly = user?.role === 'GM';

  useEffect(() => {
    api.get('/sites')
      .then(s => setSites(s.data.sites || []))
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (readOnly) {
      setError('GM access is read-only.');
      return;
    }

    if (!form.description.trim()) {
      setError('Please describe the maintenance requirement.');
      return;
    }

    try {
      const reportedBy = user?.fullName || user?.username || 'User';
      const sitePrefix = form.site ? '[Site: ' + form.site + ']\n' : '';

      const res = await api.post('/tickets', {
        vehicleId: null,
        category: form.category,
        description: sitePrefix + form.description.trim(),
        reportedBy,
        priority: form.priority
      });

      setMessage('✅ Maintenance request #' + (res.data.ticket?.id || '') + ' submitted successfully.');
      setForm(initialForm);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  if (loading) return <div className="loading">Loading request form...</div>;

  return (
    <div className="form-container" style={{ maxWidth: 900 }}>
      <div className="panel" style={{ background: 'linear-gradient(135deg, #0f766e, #0f172a)', color: '#fff', border: 'none' }}>
        <h1 style={{ margin: 0 }}>📝 Request Maintenance / Building</h1>
        <p style={{ margin: '8px 0 0', opacity: .9 }}>
          Submit a maintenance requirement for a site, building or general facility issue.
        </p>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {readOnly && <div className="alert alert-info">GM view is read-only. Maintenance requests cannot be submitted from this role.</div>}

      <form className="panel" onSubmit={submit}>
        <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <div className="form-group">
            <label>Site</label>
            <select value={form.site} onChange={e => setForm({ ...form, site: e.target.value })} disabled={readOnly}>
              <option value="">-- Select site --</option>
              {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Request Type</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} disabled={readOnly}>
              <option>General Maintenance</option>
              <option>Electrical</option>
              <option>Plumbing</option>
              <option>HVAC / A/C</option>
              <option>Building</option>
              <option>Other</option>
            </select>
          </div>

          <div className="form-group">
            <label>Priority</label>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} disabled={readOnly}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Maintenance Requirement *</label>
          <textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Describe the building/facility maintenance requirement, problem, location or needed action..."
            rows={6}
            required
            disabled={readOnly}
          />
        </div>

        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={readOnly}>
            Submit Maintenance Request
          </button>
          <button type="button" className="btn btn-warning" onClick={() => { setForm(initialForm); setMessage(''); setError(''); }} disabled={readOnly}>
            Clear
          </button>
        </div>
      </form>
    </div>
  );
}

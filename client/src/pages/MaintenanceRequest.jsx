import { useEffect, useState } from 'react';
import api from '../api/client';

const initialForm = {
  site: '',
  category: 'General Maintenance',
  priority: 'Medium',
  description: ''
};

export default function MaintenanceRequest({ user, access = {} }) {
  const [form, setForm] = useState(initialForm);
  const [sites, setSites] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const canWork = user?.role === 'Owner' || !!access?.support?.can_work;
  const readOnly = !canWork;

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

    if (!canWork) {
      setError('View only. Support & Service Work permission is required to submit a maintenance request.');
      return;
    }

    if (!form.description.trim()) {
      setError('Please describe the maintenance requirement.');
      return;
    }

    try {
      const res = await api.post('/maintenance-requests', {
        site: form.site,
        category: form.category,
        description: form.description.trim(),
        priority: form.priority
      });

      setMessage('✅ Maintenance request #' + (res.data.ticket?.id || '') + ' submitted to Owner.');
      setForm(initialForm);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  if (loading) return <div className="loading">Loading request form...</div>;

  return (
    <div className="form-container" style={{ maxWidth: 900 }}>
      <div className="panel" style={{ background:'linear-gradient(135deg,#0f766e,#0f172a)',color:'#fff',border:'none' }}>
        <h1 style={{ margin:0 }}>📝 Request Maintenance / Building</h1>
        <p style={{ margin:'8px 0 0',opacity:.9 }}>
          Submit a building/facility maintenance requirement for any site.
        </p>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {readOnly && (
        <div className="alert alert-info">
          View only. You can see the form, but submitting a Building request requires Work permission.
        </div>
      )}

      <form className="panel" onSubmit={submit}>
        <div className="cards-grid" style={{ gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))' }}>
          <div className="form-group">
            <label>Site</label>
            <select value={form.site} onChange={e => setForm({...form,site:e.target.value})} disabled={readOnly}>
              <option value="">-- Select site --</option>
              {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Request Type</label>
            <select value={form.category} onChange={e => setForm({...form,category:e.target.value})} disabled={readOnly}>
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
            <select value={form.priority} onChange={e => setForm({...form,priority:e.target.value})} disabled={readOnly}>
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
            onChange={e => setForm({...form,description:e.target.value})}
            placeholder="Describe the building/facility requirement, problem location or needed action..."
            rows={6}
            required
            disabled={readOnly}
          />
        </div>

        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={readOnly}>
            Submit Maintenance Request
          </button>
          <button
            type="button"
            className="btn btn-warning"
            onClick={() => { setForm(initialForm); setMessage(''); setError(''); }}
            disabled={readOnly}
          >
            Clear
          </button>
        </div>
      </form>
    </div>
  );
}

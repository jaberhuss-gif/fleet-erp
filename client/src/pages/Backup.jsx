import { useState, useEffect } from 'react';
import api from '../api/client';

export default function Backup() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/backup/list');
      setBackups(res.data.backups || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    setMessage(''); setError('');
    setCreating(true);
    try {
      const res = await api.post('/backup/create', {});
      setMessage('Backup created: ' + res.data.backup + ' (' + formatSize(res.data.size) + ')');
      load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setCreating(false); }
  };

  const handleDelete = async (name) => {
    if (!confirm('Delete backup "' + name + '"?')) return;
    try {
      await api.delete('/backup/' + encodeURIComponent(name));
      setMessage('Backup deleted');
      load();
    } catch (e) { setError(e.message); }
  };

  const handleDownload = (name) => {
    window.open('/api/backup/download/' + encodeURIComponent(name), '_blank');
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (date) => {
    const d = new Date(date);
    return d.toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const totalSize = backups.reduce((s, b) => s + b.size, 0);

  return (
    <div>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="cards-grid" style={{ marginBottom: '20px' }}>
        <div className="card success">
          <h3>Total Backups</h3>
          <div className="big-number" style={{ color: '#16a34a' }}>{backups.length}</div>
          <div className="sub">Available restore points</div>
        </div>
        <div className="card">
          <h3>Total Size</h3>
          <div className="big-number" style={{ color: '#1e3a8a' }}>{formatSize(totalSize)}</div>
          <div className="sub">On disk</div>
        </div>
        <div className="card warning">
          <h3>Latest Backup</h3>
          <div className="big-number" style={{ color: '#f59e0b', fontSize: '16px', paddingTop: '10px' }}>
            {backups.length > 0 ? formatDate(backups[0].date) : 'None'}
          </div>
          <div className="sub">{backups.length > 0 ? formatSize(backups[0].size) : 'Create your first backup'}</div>
        </div>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ margin: 0 }}>Database Backups</h2>
            <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
              Create manual backups or download existing ones. Backups are stored in server/backups/.
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating} style={{ fontSize: '15px', padding: '12px 24px' }}>
            {creating ? 'Creating...' : '💾 Create Backup Now'}
          </button>
        </div>

        <div className="alert alert-info" style={{ marginBottom: '16px' }}>
          <strong>💡 Tip:</strong> Create a backup before major changes. Download important backups to an external drive.
        </div>

        {loading ? (
          <div className="loading">Loading backups...</div>
        ) : backups.length === 0 ? (
          <div className="alert alert-info">No backups yet. Click "Create Backup Now" to start.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th><th>Backup Name</th><th>Date</th><th>Size</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b, i) => (
                <tr key={b.name}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 'bold', fontSize: '13px' }}>{b.name}</td>
                  <td>{formatDate(b.date)}</td>
                  <td style={{ fontWeight: 'bold', color: '#1e3a8a' }}>{formatSize(b.size)}</td>
                  <td>
                    <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px', marginRight: '4px' }} onClick={() => handleDownload(b.name)}>⬇ Download</button>
                    <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleDelete(b.name)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>🛡️ Backup Recommendations</h2>
        <ul style={{ lineHeight: '1.8', color: '#475569', fontSize: '14px' }}>
          <li><strong>Daily:</strong> Create automatic backup at end of each day.</li>
          <li><strong>Weekly:</strong> Download one backup to an external drive.</li>
          <li><strong>Before updates:</strong> Always create a backup before major changes.</li>
          <li><strong>Retention:</strong> Keep at least 30 days of backups.</li>
          <li><strong>Off-site:</strong> Store one copy on cloud (Google Drive, OneDrive).</li>
        </ul>
      </div>
    </div>
  );
}

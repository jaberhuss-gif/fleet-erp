import { useEffect, useState } from 'react';
import api from '../api/client';

export default function VehicleRepairOrders({ canWork = false }) {
  const [repairs, setRepairs] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setError('');
      const res = await api.get('/vehicle-repairs');
      setRepairs(res.data.repairs || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  useEffect(() => { if (canWork) load(); }, [canWork]);

  const closeRepair = async (id) => {
    const notes = window.prompt('Verification notes (optional):', '') ?? '';
    setBusy(true);
    try {
      await api.put('/vehicle-repairs/' + id + '/close', { verificationNotes: notes });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!canWork) return <div className="panel">Fleet work permission is not assigned to this user.</div>;

  return (
    <div className="panel">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div>
          <h3 style={{margin:'0 0 4px'}}>🛠️ Self-Repair / Verification</h3>
          <div style={{fontSize:13,color:'#64748b'}}>
            Driver repair → Pending Verification → Fleet Manager Confirm & Close
          </div>
        </div>
        <button className="btn btn-warning" type="button" onClick={load} disabled={busy}>Refresh</button>
      </div>

      {error && <div className="alert alert-error" style={{marginTop:12}}>{error}</div>}

      <div style={{overflowX:'auto',marginTop:14}}>
        <table>
          <thead><tr>
            <th>Vehicle</th><th>Site</th><th>Problem</th><th>Repair</th><th>KM</th>
            <th>Repair Date</th><th>Parts</th><th>Cost</th><th>Status</th><th>Action</th>
          </tr></thead>
          <tbody>
            {repairs.map(r => (
              <tr key={r.id}>
                <td>{r.plate || '-'}</td>
                <td>{r.location || '-'}</td>
                <td style={{minWidth:220}}>{r.issue_description || '-'}</td>
                <td style={{minWidth:220}}>{r.repair_details || '-'}</td>
                <td>{r.repair_km ?? '-'}</td>
                <td>{r.repair_date ? String(r.repair_date).slice(0,10) : '-'}</td>
                <td>{r.parts_used || '-'}</td>
                <td>{Number(r.repair_cost || 0).toLocaleString()} SAR</td>
                <td>
                  <span className="status-badge">{r.status}</span>
                </td>
                <td>
                  {r.status === 'Pending Verification' ? (
                    <button className="btn btn-success" type="button" onClick={() => closeRepair(r.id)} disabled={busy}>
                      Confirm & Close
                    </button>
                  ) : '-'}
                </td>
              </tr>
            ))}
            {!repairs.length && <tr><td colSpan="10" style={{textAlign:'center',padding:24,color:'#64748b'}}>No repair records.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

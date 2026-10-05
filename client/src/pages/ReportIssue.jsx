import { useState, useEffect, useRef } from 'react';
import { getVehiclesList, getIssueTypes, reportIssue } from '../api/client';

export default function ReportIssue({ canWork = false, user = null }) {
  const [vehicles, setVehicles] = useState([]);
  const [types, setTypes] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [issueType, setIssueType] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [v, t] = await Promise.all([getVehiclesList(), getIssueTypes()]);
      setVehicles(v.vehicles || []);
      setTypes(t.types || []);
    } catch (e) { setError('Failed to load data'); }
  };

  const startVoice = () => {
    setMessage(''); setError('');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError('Voice not supported. Use Chrome or Edge.'); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setDescription(prev => (prev ? prev + ' ' : '') + text);
    };
    rec.onerror = (e) => { setError('Voice error: ' + e.error); setListening(false); };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
  };

  const stopVoice = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setListening(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    if (!vehicleId) { setError('Please select a vehicle'); return; }
    if (!issueType) { setError('Please select an issue type'); return; }
    if (!description.trim()) { setError('Please describe the issue'); return; }
    try {
      const res = await reportIssue({ vehicleId: Number(vehicleId), issueType, description, priority });
      setMessage('Issue reported. Ticket #' + res.ticket.id + ' created.');
      setVehicleId(''); setIssueType(''); setDescription(''); setPriority('Medium');
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  if (!canWork) {
    return (
      <div className="form-container">
        <div className="panel">
          <div className="alert alert-info">
            Fleet is view-only for this user. Maintenance issue reporting is disabled.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="form-container">
      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #be123c, #fb7185)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Report an Issue</h2>
        </div>
        <p style={{ color: '#64748b', marginBottom: '16px', fontSize: '14px' }}>
          Select your vehicle, choose the issue type, and describe the problem. Use the voice button to speak.
        </p>
        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Vehicle *</label>
            <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} required>
              <option value="">-- Select vehicle --</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} - {v.driver}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Issue Type *</label>
            <select value={issueType} onChange={e => setIssueType(e.target.value)} required>
              <option value="">-- Select issue type --</option>
              {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
          <div className="form-group">
            <label>Description *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue, or click the mic button below to speak." rows={4} required />
          </div>
          <div className="btn-row">
            <button type="button" className={listening ? 'btn btn-danger' : 'btn btn-primary'} onClick={listening ? stopVoice : startVoice}>
              {listening ? 'Stop Recording' : 'Speak Description'}
            </button>
            <button type="submit" className="btn btn-success">Submit Report</button>
          </div>
        </form>
      </div>
    </div>
  );
}

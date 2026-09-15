import { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { classifyIssue, getLocalized } from '../data/knowledge';

const LANGUAGES = [
  { code: 'en-US', label: 'English', flag: '🇬🇧' },
  { code: 'ur-PK', label: 'اردو', flag: '🇵🇰' },
  { code: 'ar-SA', label: 'العربية', flag: '🇸🇦' }
];

export default function SmartReportIssue() {
  const [lang, setLang] = useState(localStorage.getItem('voiceLang') || 'en-US');
  const [vehicleId, setVehicleId] = useState('');
  const [description, setDescription] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [listening, setListening] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [ticketCreated, setTicketCreated] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    loadVehicles();
  }, []);

  useEffect(() => {
    localStorage.setItem('voiceLang', lang);
  }, [lang]);

  // Auto-classify as user types
  useEffect(() => {
    if (description.length < 3) {
      setDiagnosis(null);
      return;
    }
    const timer = setTimeout(() => {
      const result = classifyIssue(description);
      setDiagnosis(result);
      if (result && result.urgency === 'Critical') setPriority('Critical');
      else if (result && result.urgency === 'High') setPriority('High');
    }, 500);
    return () => clearTimeout(timer);
  }, [description]);

  const loadVehicles = async () => {
    try {
      const res = await api.get('/vehicles/list');
      setVehicles(res.data.vehicles || []);
    } catch (e) { /* ignore */ }
  };

  const startVoice = () => {
    setMessage(''); setError('');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError('Voice not supported. Use Chrome or Edge.');
      return;
    }
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onstart = () => setListening(true);
    rec.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setDescription(transcript);
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') setError('Voice error: ' + e.error);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
  };

  const stopVoice = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setListening(false);
  };

  const handleFixed = () => {
    setMessage('🎉 Excellent! Issue resolved without needing a ticket. Great job!');
    setDescription('');
    setDiagnosis(null);
    setVehicleId('');
    setTimeout(() => setMessage(''), 5000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    if (!vehicleId) { setError('Please select a vehicle'); return; }
    if (!description.trim()) { setError('Please describe the issue'); return; }

    try {
      const category = diagnosis ? diagnosis.subCategory : 'Other';
      const fullDescription = diagnosis
        ? description + '\n\n--- Auto-Detected Issue ---\nType: ' + diagnosis.title + '\nUrgency: ' + diagnosis.urgency + '\nLikely Causes: ' + diagnosis.causes.slice(0, 3).join('; ')
        : description;

      const res = await api.post('/tickets', {
        vehicleId: Number(vehicleId),
        category,
        description: fullDescription,
        reportedBy: 'Driver',
        priority: priority
      });

      setTicketCreated({
        id: res.data.ticket?.id,
        category,
        issue: diagnosis?.title,
        urgency: diagnosis?.urgency
      });
      setMessage('✅ Ticket #' + (res.data.ticket?.id || '') + ' created successfully');
      setDescription('');
      setDiagnosis(null);
      setVehicleId('');
      setPriority('Medium');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const localized = diagnosis ? getLocalized(diagnosis, lang.split('-')[0]) : null;
  const getUrgencyStyle = (u) => {
    if (u === 'Critical') return { bg: '#fee2e2', color: '#dc2626', border: '#dc2626', icon: '🚨' };
    if (u === 'High') return { bg: '#fef3c7', color: '#b45309', border: '#f59e0b', icon: '⚠️' };
    if (u === 'Medium') return { bg: '#fef9c3', color: '#854d0e', border: '#eab308', icon: '🟡' };
    return { bg: '#dcfce7', color: '#16a34a', border: '#16a34a', icon: '🟢' };
  };

  return (
    <div className="form-container" style={{ maxWidth: '900px' }}>
      <div className="panel" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)', color: 'white', border: 'none', padding: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '28px' }}>🧠 Smart Report Issue</h1>
        <p style={{ marginTop: '8px', opacity: 0.9, fontSize: '14px' }}>
          Describe or speak the problem — the system will diagnose it and suggest solutions instantly.
        </p>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        {/* Language Selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontWeight: '600', fontSize: '14px', display: 'block', marginBottom: '8px' }}>🎤 Voice Language:</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '25px',
                  border: lang === l.code ? '2px solid #1e3a8a' : '1px solid #cbd5e1',
                  background: lang === l.code ? '#eff6ff' : 'white',
                  color: lang === l.code ? '#1e3a8a' : '#64748b',
                  cursor: 'pointer',
                  fontWeight: lang === l.code ? 'bold' : 'normal',
                  fontSize: '14px'
                }}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Vehicle *</label>
            <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} required>
              <option value="">-- Select vehicle --</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plate} - {v.driver}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Describe the Issue *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Example: There is a brake noise when I press the pedal..."
              rows={4}
              required
              style={{ fontSize: '15px' }}
            />
          </div>

          {/* Voice Button */}
          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={listening ? stopVoice : startVoice}
              style={{
                padding: '16px 40px',
                fontSize: '18px',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '50px',
                cursor: 'pointer',
                color: 'white',
                background: listening ? '#dc2626' : '#1e3a8a',
                boxShadow: listening ? '0 0 0 0 rgba(220,38,38,0.7)' : '0 4px 12px rgba(30,58,138,0.3)',
                animation: listening ? 'pulse 1.5s infinite' : 'none',
                transition: 'all 0.3s'
              }}
            >
              {listening ? '⏹️ Stop Recording' : '🎤 Speak Now'}
            </button>
            {listening && <div style={{ marginTop: '8px', color: '#dc2626', fontSize: '13px' }}>🔴 Listening...</div>}
          </div>

          {/* DIAGNOSIS PANEL */}
          {diagnosis && localized && (
            <div style={{ marginBottom: '20px', animation: 'slideIn 0.3s ease-out' }}>
              <div style={{
                background: getUrgencyStyle(diagnosis.urgency).bg,
                border: '2px solid ' + getUrgencyStyle(diagnosis.urgency).border,
                borderRadius: '12px',
                padding: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      🧠 Auto-Detected Issue
                    </div>
                    <h2 style={{ margin: '6px 0 0 0', color: getUrgencyStyle(diagnosis.urgency).color }}>
                      {getUrgencyStyle(diagnosis.urgency).icon} {localized.title}
                    </h2>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                      {diagnosis.category} • {diagnosis.subCategory} • Confidence: {diagnosis.confidence}%
                    </div>
                  </div>
                  <span className="status-badge" style={{
                    background: getUrgencyStyle(diagnosis.urgency).color,
                    color: 'white',
                    fontSize: '13px',
                    padding: '6px 14px'
                  }}>
                    {diagnosis.urgency}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {/* Causes */}
                  <div style={{ background: 'white', borderRadius: '8px', padding: '16px', borderLeft: '4px solid #dc2626' }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#dc2626', fontSize: '14px' }}>
                      🔴 Possible Causes ({localized.causes.length})
                    </h4>
                    <ol style={{ paddingLeft: '20px', margin: 0, lineHeight: '1.7', fontSize: '13px' }}>
                      {localized.causes.slice(0, 6).map((c, i) => (
                        <li key={i} style={{ marginBottom: '4px' }}>{c}</li>
                      ))}
                    </ol>
                  </div>

                  {/* Solutions */}
                  <div style={{ background: 'white', borderRadius: '8px', padding: '16px', borderLeft: '4px solid #16a34a' }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#16a34a', fontSize: '14px' }}>
                      ✅ Recommended Solutions ({localized.solutions.length})
                    </h4>
                    <ol style={{ paddingLeft: '20px', margin: 0, lineHeight: '1.7', fontSize: '13px' }}>
                      {localized.solutions.slice(0, 6).map((s, i) => (
                        <li key={i} style={{ marginBottom: '4px' }}>{s}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleFixed}
                    className="btn btn-success"
                    style={{ flex: 1, padding: '12px', fontSize: '15px', minWidth: '200px' }}
                  >
                    ✅ I Fixed It — No Ticket Needed
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      const textarea = document.querySelector('textarea');
                      if (textarea) textarea.focus();
                    }}
                    className="btn btn-warning"
                    style={{ flex: 1, padding: '12px', fontSize: '15px', minWidth: '200px' }}
                  >
                    ❌ Still Broken — Create Ticket
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Priority (only if no diagnosis or user wants to change) */}
          {!diagnosis && (
            <div className="form-group">
              <label>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          )}

          {/* Ticket Created Confirmation */}
          {ticketCreated && (
            <div className="alert alert-success" style={{ marginBottom: '16px' }}>
              <strong>✅ Ticket #{ticketCreated.id} Created</strong>
              <div style={{ marginTop: '8px', fontSize: '13px' }}>
                Category: {ticketCreated.category}
                {ticketCreated.issue && <><br />Issue: {ticketCreated.issue}</>}
                {ticketCreated.urgency && <><br />Urgency: {ticketCreated.urgency}</>}
              </div>
            </div>
          )}

          <div className="btn-row">
            <button type="submit" className="btn btn-primary" style={{ padding: '12px 30px', fontSize: '15px' }}>
              📝 Submit Report {diagnosis ? '(with Diagnosis)' : ''}
            </button>
            <button
              type="button"
              className="btn btn-warning"
              onClick={() => {
                setDescription('');
                setDiagnosis(null);
                setVehicleId('');
                setTicketCreated(null);
              }}
            >
              Clear
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.7); }
          50% { box-shadow: 0 0 0 20px rgba(220,38,38,0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

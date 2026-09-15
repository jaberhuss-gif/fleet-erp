import { useState, useEffect, useRef } from 'react';
import api from '../api/client';

export default function LiveIssues({ onIssueClick }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const prevIdsRef = useRef(new Set());
  const audioCtxRef = useRef(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      setUser(u);
    } catch { /* ignore */ }
  }, []);

  // Only Owner can acknowledge/close
  const canManage = user && user.role === 'Owner';

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const load = async () => {
    try {
      const res = await api.get('/live-issues');
      const newData = res.data;

      // Detect new issues
      const currentIds = new Set((newData.issues || []).map(i => i.id));
      const hasNew = [...currentIds].some(id => !prevIdsRef.current.has(id));

      if (hasNew && prevIdsRef.current.size > 0) {
        // Find the newest critical
        const newIssues = (newData.issues || []).filter(i => !prevIdsRef.current.has(i.id));
        const hasCritical = newIssues.some(i => i.priority === 'Critical');
        playSound(hasCritical ? 'critical' : 'normal');
        showBrowserNotification(newIssues);
      }

      prevIdsRef.current = currentIds;
      setData(newData);
      setLoading(false);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const playSound = (type) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      
      if (type === 'critical') {
        // Siren-like: two beeps, higher
        [0, 0.3, 0.6].forEach((delay, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = idx % 2 === 0 ? 880 : 660;
          osc.type = 'sawtooth';
          gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.25);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.25);
        });
      } else {
        // Normal ping: single soft beep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) { /* silent */ }
  };

  const showBrowserNotification = (issues) => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    if (Notification.permission === 'granted' && issues.length > 0) {
      const top = issues[0];
      const title = top.priority === 'Critical' ? '🚨 CRITICAL ISSUE' : '🔔 New Issue';
      const body = (top.plate || 'Vehicle') + ' - ' + (top.category || 'Issue') + '\n' + (top.description || '').slice(0, 100);
      new Notification(title, { body, icon: '/favicon.ico', tag: 'fleet-issue-' + top.id });
    }
  };

  const handleAcknowledge = async (issue) => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      await api.put('/tickets/' + issue.id + '/acknowledge', {
        acknowledgedBy: u.fullName || u.username || 'Owner'
      });
      await api.post('/audit-log', {
        username: u.username || 'system',
        action: 'ACKNOWLEDGE_ISSUE',
        entityType: 'Ticket',
        entityId: String(issue.id),
        details: 'Acknowledged: ' + issue.category
      });
      load();
      alert('✅ Issue #' + issue.id + ' acknowledged. Driver will see the update.');
    } catch (e) { alert('Failed: ' + e.message); }
  };

  const handleClose = async (issue) => {
    const notes = prompt('Enter resolution notes (what was done?):', 'Fixed and tested');
    if (notes === null) return;
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      await api.put('/tickets/' + issue.id + '/close-with-notes', {
        closedBy: u.fullName || u.username || 'Owner',
        resolutionNotes: notes || 'Resolved'
      });
      await api.post('/audit-log', {
        username: u.username || 'system',
        action: 'CLOSE_ISSUE',
        entityType: 'Ticket',
        entityId: String(issue.id),
        details: 'Closed: ' + (notes || '')
      });
      load();
    } catch (e) { alert('Failed: ' + e.message); }
  };

  const getPriorityStyle = (p) => {
    if (p === 'Critical') return { bg: '#fee2e2', color: '#dc2626', border: '#dc2626', icon: '🚨', pulse: true };
    if (p === 'High') return { bg: '#fef3c7', color: '#b45309', border: '#f59e0b', icon: '⚠️', pulse: false };
    if (p === 'Medium') return { bg: '#fef9c3', color: '#854d0e', border: '#eab308', icon: '🟡', pulse: false };
    return { bg: '#dbeafe', color: '#1e40af', border: '#1e3a8a', icon: '🔵', pulse: false };
  };

  const getSLAStyle = (s) => {
    if (s === 'red') return { bg: '#dc2626', color: 'white', text: 'SLA Breach' };
    if (s === 'yellow') return { bg: '#f59e0b', color: 'white', text: 'Approaching' };
    return { bg: '#16a34a', color: 'white', text: 'On Time' };
  };

  if (loading) return <div className="loading">Loading live issues...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const { summary, issues } = data;

  // Don't show widget if no issues
  if (summary.total === 0) {
    return (
      <div className="panel" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '2px solid #16a34a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, color: '#16a34a' }}>✅ All Clear</h2>
            <p style={{ color: '#16a34a', marginTop: '4px', fontSize: '14px' }}>
              No open issues at the moment.
            </p>
          </div>
          <div style={{ fontSize: '48px' }}>🎉</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      {/* Header Stats */}
      <div style={{
        background: summary.critical > 0 ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' : 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
        color: 'white',
        padding: '20px 24px',
        borderRadius: '12px',
        marginBottom: '16px',
        animation: summary.critical > 0 ? 'pulseRed 2s infinite' : 'none'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '32px' }}>{summary.critical > 0 ? '🚨' : '⚠️'}</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '22px' }}>Live Issues</h2>
                <p style={{ margin: '4px 0 0 0', opacity: 0.9, fontSize: '13px' }}>
                  Real-time monitoring • Auto-refresh every 30s
                </p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{summary.total}</div>
              <div style={{ fontSize: '11px', opacity: 0.85, textTransform: 'uppercase' }}>Open</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#fecaca' }}>{summary.critical}</div>
              <div style={{ fontSize: '11px', opacity: 0.85, textTransform: 'uppercase' }}>Critical</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#fde68a' }}>{summary.high}</div>
              <div style={{ fontSize: '11px', opacity: 0.85, textTransform: 'uppercase' }}>High</div>
            </div>
            {summary.slaBreach > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#fca5a5' }}>{summary.slaBreach}</div>
                <div style={{ fontSize: '11px', opacity: 0.85, textTransform: 'uppercase' }}>SLA Breach</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Issues List */}
      <div className="panel" style={{ marginBottom: 0 }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px' }}>🔴 Active Issues ({issues.length})</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {issues.slice(0, 8).map(issue => {
            const p = getPriorityStyle(issue.priority);
            const sla = getSLAStyle(issue.slaStatus);
            return (
              <div
                key={issue.id}
                style={{
                  background: 'white',
                  border: '2px solid ' + p.border,
                  borderLeft: '6px solid ' + p.border,
                  borderRadius: '10px',
                  padding: '14px 16px',
                  animation: p.pulse ? 'pulseBorder 1.5s infinite' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: '250px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="status-badge" style={{ background: p.bg, color: p.color, fontWeight: 'bold' }}>
                        {p.icon} {issue.priority}
                      </span>
                      <span className="status-badge" style={{ background: sla.bg, color: sla.color, fontSize: '11px' }}>
                        {sla.text}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '12px' }}>⏱️ {issue.timeText}</span>
                    </div>

                    <div style={{ marginTop: '8px', fontWeight: 'bold', fontSize: '15px', color: '#1e293b' }}>
                      #{issue.id} — {issue.plate || 'Unknown'} — {issue.category}
                    </div>

                    {issue.diagnosedIssue && (
                      <div style={{ marginTop: '4px', fontSize: '13px', color: '#8b5cf6', fontWeight: '600' }}>
                        🧠 Detected: {issue.diagnosedIssue}
                      </div>
                    )}

                    <div style={{ marginTop: '6px', fontSize: '13px', color: '#475569', lineHeight: '1.4' }}>
                      {String(issue.description || '').split('---')[0].slice(0, 200)}
                      {String(issue.description || '').length > 200 ? '...' : ''}
                    </div>

                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                      👤 Reported by: <strong>{issue.reported_by || 'Unknown'}</strong>
                      {issue.location && <> • 📍 {issue.location}</>}
                    </div>
                  </div>

                  {canManage ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '130px' }}>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '8px 12px', fontSize: '12px' }}
                        onClick={() => handleAcknowledge(issue)}
                      >
                        ✓ Acknowledge
                      </button>
                      <button
                        className="btn btn-success"
                        style={{ padding: '8px 12px', fontSize: '12px' }}
                        onClick={() => handleClose(issue)}
                      >
                        ✓ Close Issue
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      minWidth: '130px',
                      padding: '10px 12px',
                      background: '#f1f5f9',
                      borderRadius: '8px',
                      textAlign: 'center',
                      fontSize: '12px',
                      color: '#64748b',
                      fontWeight: '600'
                    }}>
                      👁️ View Only
                      <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.7 }}>
                        Owner manages
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {issues.length > 8 && (
          <div style={{ marginTop: '12px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            Showing 8 of {issues.length} issues. See <strong>Tickets</strong> for full list.
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulseRed {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.7); }
          50% { box-shadow: 0 0 0 12px rgba(220,38,38,0); }
        }
        @keyframes pulseBorder {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(220,38,38,0); }
        }
      `}</style>
    </div>
  );
}



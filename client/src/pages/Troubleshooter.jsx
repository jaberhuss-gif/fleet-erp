import { useState } from 'react';
import { KNOWLEDGE_BASE, searchKnowledge } from '../data/knowledge';

export default function Troubleshooter() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    const res = searchKnowledge(query);
    setResults(res);
    setSearched(true);
    setSelectedEntry(null);
  };

  const handleQuickSearch = (term) => {
    setQuery(term);
    const res = searchKnowledge(term);
    setResults(res);
    setSearched(true);
    setSelectedEntry(null);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    setSelectedEntry(null);
  };

  const filteredBase = KNOWLEDGE_BASE.filter(e => category === 'All' || e.category === category);

  const quickTags = {
    Vehicle: [
      { label: '🔥 Engine Overheat', q: 'engine temperature' },
      { label: '❄️ A/C Not Cooling', q: 'ac not cooling' },
      { label: '🛞 Flat Tire', q: 'tire puncture' },
      { label: '🛑 Brake Noise', q: 'brake noise' },
      { label: '🔋 Dead Battery', q: 'battery dead' },
      { label: '🛢️ Oil Leak', q: 'oil leak' },
      { label: '🚗 Wont Start', q: 'wont start' },
      { label: '⚙️ Check Engine', q: 'check engine' }
    ],
    Building: [
      { label: '💧 Water Leak', q: 'water leak' },
      { label: '❄️ A/C Not Cooling', q: 'ac not cooling' },
      { label: '⚡ Breaker Trip', q: 'breaker trip' },
      { label: '🚪 Door Issue', q: 'door not closing' },
      { label: '🚽 Toilet Flush', q: 'toilet flush' },
      { label: '🚿 Shower Leak', q: 'shower leak' },
      { label: '🔌 Light Not Working', q: 'light not working' },
      { label: '💦 Water Pump', q: 'water pump' }
    ]
  };

  const getUrgencyColor = (urgency) => {
    if (urgency === 'Critical') return { bg: '#fee2e2', color: '#dc2626' };
    if (urgency === 'High') return { bg: '#fef3c7', color: '#b45309' };
    if (urgency === 'Medium') return { bg: '#fef9c3', color: '#854d0e' };
    return { bg: '#dcfce7', color: '#16a34a' };
  };

  return (
    <div>
      {/* Header */}
      <div className="panel" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)', color: 'white', border: 'none' }}>
        <div style={{ textAlign: 'center', padding: '20px 10px' }}>
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: '800' }}>🧠 Smart Troubleshooter</h1>
          <p style={{ marginTop: '10px', opacity: 0.9, fontSize: '15px' }}>
            Describe the problem — get instant causes and solutions
          </p>

          <form onSubmit={handleSearch} style={{ maxWidth: '700px', margin: '24px auto 0', position: 'relative' }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type or speak your problem... (e.g. engine temperature high)"
              style={{
                width: '100%',
                padding: '18px 120px 18px 24px',
                borderRadius: '12px',
                border: 'none',
                fontSize: '16px',
                boxSizing: 'border-box',
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
              }}
              autoFocus
            />
            <button
              type="submit"
              className="btn btn-success"
              style={{ position: 'absolute', right: '8px', top: '8px', bottom: '8px', padding: '0 24px', fontSize: '15px' }}
            >
              🔍 Search
            </button>
          </form>

          {searched && (
            <button onClick={clearSearch} style={{ marginTop: '12px', background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px' }}>
              ✕ Clear Search
            </button>
          )}
        </div>
      </div>

      {/* Category Filter */}
      <div className="panel">
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {['All', 'Vehicle', 'Building'].map(c => (
            <button
              key={c}
              onClick={() => { setCategory(c); setSearched(false); setResults([]); setQuery(''); }}
              className={category === c ? 'btn btn-primary' : 'btn btn-warning'}
              style={{ padding: '10px 24px', fontSize: '15px', minWidth: '120px' }}
            >
              {c === 'All' ? '🌐 All' : c === 'Vehicle' ? '🚗 Vehicles' : '🏢 Buildings'}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Tags */}
      {!searched && (
        <>
          {(category === 'All' || category === 'Vehicle') && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>🚗 Common Vehicle Issues</h2>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {quickTags.Vehicle.map((tag, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickSearch(tag.q)}
                    style={{ padding: '10px 18px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', borderRadius: '20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(category === 'All' || category === 'Building') && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>🏢 Common Building Issues</h2>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {quickTags.Building.map((tag, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickSearch(tag.q)}
                    style={{ padding: '10px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: '20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="panel">
            <h2>📚 All Topics ({filteredBase.length})</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {filteredBase.map(entry => {
                const c = getUrgencyColor(entry.urgency);
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    style={{
                      padding: '14px',
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderLeft: '4px solid ' + c.color,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e293b' }}>{entry.title}</div>
                      <span className="status-badge" style={{ background: c.bg, color: c.color, fontSize: '10px', whiteSpace: 'nowrap' }}>
                        {entry.urgency}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>{entry.titleAr}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
                      {entry.category} • {entry.causes.length} causes
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Search Results */}
      {searched && !selectedEntry && (
        <div className="panel">
          <h2>🔍 Results ({results.length})</h2>
          {results.length === 0 ? (
            <div className="alert alert-info">
              No results for "<strong>{query}</strong>".
              <br /><br />
              Try other keywords like: "overheat", "oil leak", "water leak", "breaker", "AC".
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '14px' }}>
              {results.map(entry => {
                const c = getUrgencyColor(entry.urgency);
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    style={{
                      padding: '18px',
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderLeft: '5px solid ' + c.color,
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '17px', color: '#1e293b' }}>{entry.title}</div>
                        <div style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>{entry.titleAr}</div>
                      </div>
                      <span className="status-badge" style={{ background: c.bg, color: c.color }}>
                        {entry.urgency}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
                      <span>🔴 {entry.causes.length} causes</span>
                      <span>✅ {entry.solutions.length} solutions</span>
                      <span>📂 {entry.category}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Detail View */}
      {selectedEntry && (
        <div className="panel">
          <button className="btn btn-warning" onClick={() => setSelectedEntry(null)} style={{ marginBottom: '20px' }}>
            ← Back to {searched ? 'Results' : 'All Topics'}
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ margin: 0, color: '#1e3a8a' }}>{selectedEntry.title}</h1>
              <h2 style={{ margin: '8px 0 0 0', color: '#64748b', fontWeight: 'normal', fontSize: '20px' }}>{selectedEntry.titleAr}</h2>
            </div>
            {(() => {
              const c = getUrgencyColor(selectedEntry.urgency);
              return <span className="status-badge" style={{ background: c.bg, color: c.color, fontSize: '14px', padding: '8px 16px' }}>{selectedEntry.urgency}</span>;
            })()}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px', marginTop: '24px' }}>
            {/* Causes */}
            <div style={{ background: '#fef2f2', borderRadius: '10px', padding: '20px', borderLeft: '5px solid #dc2626' }}>
              <h3 style={{ marginTop: 0, color: '#dc2626' }}>🔴 Possible Causes ({selectedEntry.causes.length})</h3>
              <ol style={{ paddingLeft: '24px', lineHeight: '1.9', color: '#1e293b', margin: 0 }}>
                {selectedEntry.causes.map((c, i) => (
                  <li key={i} style={{ marginBottom: '6px' }}>{c}</li>
                ))}
              </ol>
            </div>

            {/* Solutions */}
            <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '20px', borderLeft: '5px solid #16a34a' }}>
              <h3 style={{ marginTop: 0, color: '#16a34a' }}>✅ Recommended Solutions ({selectedEntry.solutions.length})</h3>
              <ol style={{ paddingLeft: '24px', lineHeight: '1.9', color: '#1e293b', margin: 0 }}>
                {selectedEntry.solutions.map((s, i) => (
                  <li key={i} style={{ marginBottom: '6px' }}>{s}</li>
                ))}
              </ol>
            </div>
          </div>

          <div className="alert alert-warning" style={{ marginTop: '20px' }}>
            <strong>⚠️ Important:</strong> This is general guidance. For serious issues, always consult a certified technician.
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('navigate', { detail: 'tickets' }));
              }}
            >
              📝 Report This Issue
            </button>
            <button
              className="btn btn-warning"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('navigate', { detail: 'maintenance' }));
              }}
            >
              🔧 Create Work Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

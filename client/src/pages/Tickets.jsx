import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';
import { printContent } from '../api/print';

export default function Tickets({ user, access = {} }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [dailyKmOpenCount, setDailyKmOpenCount] = useState(0);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [ticketsRes, kmRes] = await Promise.all([
        api.get('/tickets'),
        api.get('/km-daily-notifications')
      ]);
      setTickets(ticketsRes.data.tickets || []);
      setDailyKmOpenCount(Number(kmRes.data?.count || 0));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const canWork = user?.role === 'Owner' || !!access?.tickets?.can_work;

  const handleClose = async (id) => {
    if (!canWork) return;
    if (!confirm('Close this ticket?')) return;
    try {
      await api.put('/tickets/' + id + '/close', {});
      load();
    } catch (e) { alert('Failed: ' + e.message); }
  };

  const categories = [...new Set(tickets.map(t => t.category).filter(Boolean))].sort();
  const months = [...new Set(tickets.map(t => String(t.opened_at || '').slice(0, 7)).filter(Boolean))].sort().reverse();

  const filtered = tickets.filter(t => {
    const matchSearch = search === '' ||
      String(t.plate || '').toLowerCase().includes(search.toLowerCase()) ||
      String(t.description || '').toLowerCase().includes(search.toLowerCase()) ||
      String(t.id).includes(search);
    const matchCat = filterCategory === 'all' || t.category === filterCategory;
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchMonth = filterMonth === 'all' || String(t.opened_at || '').startsWith(filterMonth);
    return matchSearch && matchCat && matchStatus && matchMonth;
  });

  // Stats per category
  const catCounts = {};
  tickets.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });

  // Daily KM is a live operational count: show only OPEN cards for today.
  // Do not let historical/closed Daily KM tickets inflate this card.
  if (Object.prototype.hasOwnProperty.call(catCounts, 'Daily KM')) {
    catCounts['Daily KM'] = dailyKmOpenCount;
  }

  const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const formatDescription = (value) => String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .trim();

  // Stats per month
  const monthCounts = {};
  tickets.forEach(t => {
    const m = String(t.opened_at || '').slice(0, 7);
    if (m) monthCounts[m] = (monthCounts[m] || 0) + 1;
  });
  const recentMonths = Object.entries(monthCounts).sort().slice(-6).reverse();

  return (
    <div>
      {/* Category Cards */}
      <div className="cards-grid" style={{ marginBottom: '20px' }}>
        {topCats.map(([cat, count]) => (
          <div className="card" key={cat}>
            <h3>{cat}</h3>
            <div className="big-number" style={{ color: '#1e3a8a' }}>{count}</div>
            <div className="sub">tickets</div>
          </div>
        ))}
      </div>

      {/* Monthly Breakdown */}
      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #b91c1c, #ef4444)', padding: '14px 20px', borderRadius: '10px 10px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Monthly Breakdown (Last 6 Months)</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Tickets</th>
              <th>Bar</th>
            </tr>
          </thead>
          <tbody>
            {recentMonths.map(([month, count]) => {
              const max = Math.max(...recentMonths.map(([, c]) => c), 1);
              const width = (count / max) * 100;
              return (
                <tr key={month}>
                  <td style={{ fontWeight: 'bold' }}>{month}</td>
                  <td>{count}</td>
                  <td>
                    <div style={{ background: '#e2e8f0', height: '18px', borderRadius: '9px', overflow: 'hidden' }}>
                      <div style={{ background: '#1e3a8a', width: width + '%', height: '100%' }}></div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* All Tickets */}
      <div className="panel">
        <div style={{ background: 'linear-gradient(135deg, #dc2626, #f87171)', padding: '16px 24px', borderRadius: '12px 12px 0 0', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>All Tickets</h2>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: '12px' }}><button className="print-btn no-print" style={{ marginRight: "8px" }} onClick={() => printContent("Tickets Report", filtered.length + " tickets")}>🖨️ Print</button><button className="btn btn-success" onClick={() => exportToCSV(filtered, "tickets", [{key:"id",label:"ID"},{key:"opened_at",label:"Date"},{key:"plate",label:"Vehicle"},{key:"category",label:"Category"},{key:"description",label:"Description"},{key:"priority",label:"Priority"},{key:"status",label:"Status"}])}>Export CSV</button></div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search (Plate / ID / Description)</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. 4463 or 442" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Category</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="Open">Open</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Month</label>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
              <option value="all">All Months</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-warning" onClick={() => { setSearch(''); setFilterCategory('all'); setFilterStatus('all'); setFilterMonth('all'); }} style={{ width: '100%' }}>Clear</button>
          </div>
        </div>

        <div style={{ marginBottom: '12px', color: '#64748b', fontSize: '14px' }}>
          Showing <strong>{filtered.length}</strong> of {tickets.length} tickets
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="alert alert-info">No tickets match your filters.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Vehicle</th>
                <th>Category</th>
                <th>Description</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 'bold' }}>#{t.id}</td>
                  <td>{String(t.opened_at || '').slice(0, 10)}</td>
                  <td style={{ fontWeight: 'bold' }}>{t.plate || '-'}</td>
                  <td>{t.category}</td>
                  <td style={{ whiteSpace: 'pre-line', minWidth: '280px', maxWidth: '520px' }}>{formatDescription(t.description)}</td>
                  <td>
                    <span className={
                      'status-badge ' +
                      (t.priority === 'Critical' ? 'status-urgent' :
                       t.priority === 'High' ? 'status-warning' :
                       t.priority === 'Medium' ? 'status-warning' : 'status-safe')
                    }>
                      {t.priority}
                    </span>
                  </td>
                  <td>
                    <span className={t.status === 'Open' ? 'status-warning' : 'status-safe'} style={{ display: 'inline-block', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                      {t.status}
                    </span>
                  </td>
                  <td>
                    {t.status === 'Open' && canWork && (
                      <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleClose(t.id)}>Close</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filtered.length > 200 && (
          <div style={{ marginTop: '12px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            Showing first 200 of {filtered.length}. Use filters to narrow down.
          </div>
        )}
      </div>
    </div>
  );
}



import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  Legend, ResponsiveContainer, CartesianGrid
} from 'recharts';
import api from '../api/client';

const COLORS = ['#1e3a8a', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];

export default function Charts() {
  const [tickets, setTickets] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [t, v] = await Promise.all([
        api.get('/tickets'),
        api.get('/vehicles')
      ]);
      setTickets(t.data.tickets || []);
      setVehicles(v.data.vehicles || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading">Loading charts...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  // Category data - top 8 + Others
  const catCounts = {};
  tickets.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const top8 = sortedCats.slice(0, 8).map(([name, value]) => ({ name, value }));
  const restCount = sortedCats.slice(8).reduce((s, [, v]) => s + v, 0);
  const categoryData = restCount > 0 ? [...top8, { name: 'Others', value: restCount }] : top8;

  // Monthly data
  const monthCounts = {};
  tickets.forEach(t => {
    const m = String(t.opened_at || '').slice(0, 7);
    if (m) monthCounts[m] = (monthCounts[m] || 0) + 1;
  });
  const monthlyData = Object.entries(monthCounts)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Vehicle status data
  const statusCounts = { Safe: 0, Warning: 0, 'Urgent Overdue': 0 };
  vehicles.forEach(v => {
    if (statusCounts[v.status] !== undefined) statusCounts[v.status]++;
  });
  const statusData = [
    { name: 'Safe', value: statusCounts.Safe },
    { name: 'Warning', value: statusCounts.Warning },
    { name: 'Overdue', value: statusCounts['Urgent Overdue'] }
  ];
  const statusColors = ['#16a34a', '#f59e0b', '#dc2626'];

  // Location data
  const locationCounts = {};
  vehicles.forEach(v => {
    if (v.location) locationCounts[v.location] = (locationCounts[v.location] || 0) + 1;
  });
  const locationData = Object.entries(locationCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Top 10 vehicles with most tickets
  const vehicleTicketCounts = {};
  tickets.forEach(t => {
    if (t.plate) vehicleTicketCounts[t.plate] = (vehicleTicketCounts[t.plate] || 0) + 1;
  });
  const topVehicles = Object.entries(vehicleTicketCounts)
    .map(([plate, count]) => ({ plate, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <div>
      <div className="panel">
        <h2>📊 Dashboard Charts</h2>
        <p style={{ color: '#64748b', fontSize: '14px' }}>Visual overview of fleet data and maintenance tickets.</p>
      </div>

      {/* Row 1: Category + Vehicle Status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="panel">
          <h2>Tickets by Category</h2>
          {categoryData.length === 0 ? (
            <div className="alert alert-info">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={50}
                  paddingAngle={2}
                >
                  {categoryData.map((entry, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  layout="vertical"
                  verticalAlign="middle"
                  align="right"
                  wrapperStyle={{ fontSize: '13px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <h2>Fleet Status</h2>
          {vehicles.length === 0 ? (
            <div className="alert alert-info">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={50}
                  paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={statusColors[i]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  layout="vertical"
                  verticalAlign="middle"
                  align="right"
                  wrapperStyle={{ fontSize: '13px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row 2: Monthly trend */}
      <div className="panel">
        <h2>Monthly Tickets Trend</h2>
        {monthlyData.length === 0 ? (
          <div className="alert alert-info">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#1e3a8a" radius={[6, 6, 0, 0]}>
                {monthlyData.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Row 3: Top vehicles + Locations */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="panel">
          <h2>Top 10 Vehicles (Most Tickets)</h2>
          {topVehicles.length === 0 ? (
            <div className="alert alert-info">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={topVehicles} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="plate" type="category" width={95} style={{ fontSize: '12px' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#dc2626" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <h2>Vehicles by Location</h2>
          {locationData.length === 0 ? (
            <div className="alert alert-info">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={locationData} margin={{ top: 10, right: 30, left: 0, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" height={100} interval={0} style={{ fontSize: '12px' }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

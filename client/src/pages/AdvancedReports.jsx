import { useState, useEffect } from 'react';
import api from '../api/client';
import { exportToCSV } from '../api/export';
import { printContent } from '../api/print';

export default function AdvancedReports() {
  const [subTab, setSubTab] = useState('vehicle');
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [sites, setSites] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [filterMonth, setFilterMonth] = useState('all');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [v, d, s, t, w] = await Promise.all([
        api.get('/vehicles'),
        api.get('/drivers'),
        api.get('/sites'),
        api.get('/tickets'),
        api.get('/work-orders')
      ]);
      setVehicles(v.data.vehicles || []);
      setDrivers(d.data.drivers || []);
      setSites(s.data.sites || []);
      setTickets(t.data.tickets || []);
      setWorkOrders(w.data.orders || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading">Loading reports...</div>;

  return (
    <div>
      <div className="sub-nav no-print">
        <button className={subTab === 'vehicle' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('vehicle')}>🚗 Vehicle Report</button>
        <button className={subTab === 'driver' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('driver')}>👤 Driver Report</button>
        <button className={subTab === 'site' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('site')}>🏢 Site Report</button>
        <button className={subTab === 'summary' ? 'sub-btn active' : 'sub-btn'} onClick={() => setSubTab('summary')}>📊 Executive Summary</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {subTab === 'vehicle' && <VehicleReport vehicles={vehicles} tickets={tickets} />}
      {subTab === 'driver' && <DriverReport drivers={drivers} vehicles={vehicles} />}
      {subTab === 'site' && <SiteReport sites={sites} workOrders={workOrders} />}
      {subTab === 'summary' && <ExecutiveSummary
        vehicles={vehicles} tickets={tickets} drivers={drivers}
        workOrders={workOrders} sites={sites}
      />}
    </div>
  );
}

// ===== VEHICLE REPORT =====
function VehicleReport({ vehicles, tickets }) {
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [monthFilter, setMonthFilter] = useState('all');

  const vehicleTickets = tickets.filter(t => {
    if (!selectedVehicle) return false;
    const v = vehicles.find(x => String(x.id) === selectedVehicle);
    if (!v) return false;
    const matchPlate = t.plate === v.plate;
    const matchMonth = monthFilter === 'all' || String(t.opened_at || '').startsWith(monthFilter);
    return matchPlate && matchMonth;
  });

  const selectedV = vehicles.find(v => String(v.id) === selectedVehicle);

  const months = [...new Set(tickets.map(t => String(t.opened_at || '').slice(0, 7)).filter(Boolean))].sort().reverse();

  const totalCost = vehicleTickets.reduce((s, t) => s + 0, 0);

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>🚗 Vehicle History Report</h2>
        {selectedVehicle && <button className="print-btn no-print" onClick={() => printContent('Vehicle History Report', selectedV?.plate)}>🖨️ Print Report</button>}
      </div>

      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '20px', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Select Vehicle</label>
          <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)}>
            <option value="">-- Choose vehicle --</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} - {v.driver}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Month Filter</label>
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
            <option value="all">All Months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {!selectedVehicle ? (
        <div className="alert alert-info">Select a vehicle to see its complete history.</div>
      ) : (
        <>
          {selectedV && (
            <div className="cards-grid" style={{ marginBottom: '20px' }}>
              <div className="card"><h3>Plate</h3><div className="big-number" style={{ fontSize: '22px' }}>{selectedV.plate}</div></div>
              <div className="card"><h3>Driver</h3><div className="big-number" style={{ fontSize: '20px' }}>{selectedV.driver}</div><div className="sub">{selectedV.phone}</div></div>
              <div className="card"><h3>Location</h3><div className="big-number" style={{ fontSize: '20px' }}>{selectedV.location || '-'}</div></div>
              <div className="card"><h3>Current KM</h3><div className="big-number">{selectedV.currentKm.toLocaleString()}</div></div>
              <div className="card"><h3>Last Oil</h3><div className="big-number">{selectedV.lastOilKm.toLocaleString()}</div></div>
              <div className={selectedV.status === 'Urgent Overdue' ? 'card danger' : 'card success'}>
                <h3>Status</h3><div className="big-number" style={{ fontSize: '20px' }}>{selectedV.status}</div>
              </div>
            </div>
          )}

          <h3>Ticket History ({vehicleTickets.length})</h3>
          {vehicleTickets.length === 0 ? (
            <div className="alert alert-info">No tickets for this vehicle in selected period.</div>
          ) : (
            <table>
              <thead>
                <tr><th>#</th><th>Date</th><th>Category</th><th>Description</th><th>Priority</th><th>Status</th></tr>
              </thead>
              <tbody>
                {vehicleTickets.map(t => (
                  <tr key={t.id}>
                    <td>#{t.id}</td>
                    <td>{String(t.opened_at || '').slice(0, 10)}</td>
                    <td>{t.category}</td>
                    <td>{String(t.description || '').split('---')[0].slice(0, 80)}</td>
                    <td>{t.priority}</td>
                    <td>{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

// ===== DRIVER REPORT =====
function DriverReport({ drivers, vehicles }) {
  const [selectedDriver, setSelectedDriver] = useState('');
  const selectedD = drivers.find(d => String(d.id) === selectedDriver);
  const assignedVehicle = selectedD ? vehicles.find(v => v.id === selectedD.vehicle_id) : null;

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>👤 Driver Report</h2>
        {selectedDriver && <button className="print-btn no-print" onClick={() => printContent('Driver Report', selectedD?.name)}>🖨️ Print</button>}
      </div>

      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '20px', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Select Driver</label>
          <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}>
            <option value="">-- Choose driver --</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name} - {d.phone}</option>)}
          </select>
        </div>
      </div>

      {!selectedDriver ? (
        <>
          <h3>All Drivers ({drivers.length})</h3>
          <table>
            <thead>
              <tr><th>Name</th><th>Phone</th><th>License</th><th>Vehicle</th><th>Status</th></tr>
            </thead>
            <tbody>
              {drivers.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 'bold' }}>{d.name}</td>
                  <td>{d.phone || '-'}</td>
                  <td>{d.license_no || '-'}</td>
                  <td>{d.vehicle_plate || '-'}</td>
                  <td>{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          {selectedD && (
            <div className="cards-grid" style={{ marginBottom: '20px' }}>
              <div className="card"><h3>Name</h3><div className="big-number" style={{ fontSize: '20px' }}>{selectedD.name}</div></div>
              <div className="card"><h3>Phone</h3><div className="big-number" style={{ fontSize: '18px' }}>{selectedD.phone || '-'}</div></div>
              <div className="card"><h3>License</h3><div className="big-number" style={{ fontSize: '18px' }}>{selectedD.license_no || '-'}</div></div>
              <div className="card"><h3>Nationality</h3><div className="big-number" style={{ fontSize: '18px' }}>{selectedD.nationality || '-'}</div></div>
              <div className="card"><h3>Status</h3><div className="big-number" style={{ fontSize: '18px' }}>{selectedD.status}</div></div>
            </div>
          )}
          {assignedVehicle && (
            <>
              <h3>Assigned Vehicle</h3>
              <table>
                <thead><tr><th>Plate</th><th>Make/Model</th><th>Location</th><th>Current KM</th><th>Since Oil</th><th>Status</th></tr></thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 'bold' }}>{assignedVehicle.plate}</td>
                    <td>{assignedVehicle.make} {assignedVehicle.model} ({assignedVehicle.year})</td>
                    <td>{assignedVehicle.location}</td>
                    <td>{assignedVehicle.currentKm.toLocaleString()}</td>
                    <td>{assignedVehicle.sinceOil.toLocaleString()}</td>
                    <td>{assignedVehicle.status}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ===== SITE REPORT =====
function SiteReport({ sites, workOrders }) {
  const [selectedSite, setSelectedSite] = useState('');

  const siteWOs = workOrders.filter(w => w.site === selectedSite);

  const totalCost = siteWOs.reduce((s, w) => s + Number(w.final_cost || 0), 0);
  const contractorCost = siteWOs.reduce((s, w) => s + Number(w.contractor_cost || 0), 0);
  const internalCost = totalCost - contractorCost;

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>🏢 Site Report</h2>
        {selectedSite && <button className="print-btn no-print" onClick={() => printContent('Site Report', selectedSite)}>🖨️ Print</button>}
      </div>

      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '20px', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Select Site</label>
          <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
            <option value="">-- Choose site --</option>
            {sites.map(s => <option key={s.id} value={s.name}>{s.name} ({s.region})</option>)}
          </select>
        </div>
      </div>

      {!selectedSite ? (
        <>
          <h3>All Sites Summary ({sites.length})</h3>
          <table>
            <thead>
              <tr><th>Site</th><th>Region</th><th>Total WO</th><th>Open</th><th>Closed</th><th>Total Cost</th></tr>
            </thead>
            <tbody>
              {sites.map(s => {
                const wos = workOrders.filter(w => w.site === s.name);
                const cost = wos.reduce((sum, w) => sum + Number(w.final_cost || 0), 0);
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 'bold' }}>{s.name}</td>
                    <td>{s.region || '-'}</td>
                    <td>{wos.length}</td>
                    <td>{wos.filter(w => w.status === 'Open').length}</td>
                    <td>{wos.filter(w => w.status === 'Closed').length}</td>
                    <td style={{ fontWeight: 'bold', color: '#16a34a' }}>{cost.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <div className="cards-grid" style={{ marginBottom: '20px' }}>
            <div className="card"><h3>Total Work Orders</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{siteWOs.length}</div></div>
            <div className="card"><h3>Open</h3><div className="big-number" style={{ color: '#f59e0b' }}>{siteWOs.filter(w => w.status === 'Open').length}</div></div>
            <div className="card success"><h3>Closed</h3><div className="big-number" style={{ color: '#16a34a' }}>{siteWOs.filter(w => w.status === 'Closed').length}</div></div>
            <div className="card"><h3>Total Cost</h3><div className="big-number" style={{ color: '#16a34a' }}>{totalCost.toLocaleString()}</div><div className="sub">SAR</div></div>
            <div className="card warning"><h3>Contractor</h3><div className="big-number" style={{ color: '#f59e0b' }}>{contractorCost.toLocaleString()}</div><div className="sub">SAR</div></div>
            <div className="card success"><h3>Internal</h3><div className="big-number" style={{ color: '#16a34a' }}>{internalCost.toLocaleString()}</div><div className="sub">SAR</div></div>
          </div>

          <h3>Work Orders ({siteWOs.length})</h3>
          <table>
            <thead>
              <tr><th>WO #</th><th>Category</th><th>Description</th><th>Assigned</th><th>Status</th><th>Cost</th></tr>
            </thead>
            <tbody>
              {siteWOs.map(w => (
                <tr key={w.id}>
                  <td style={{ fontWeight: 'bold' }}>{w.wo_no}</td>
                  <td>{w.category}</td>
                  <td>{w.description}</td>
                  <td>{w.assigned_to}</td>
                  <td>{w.status}</td>
                  <td style={{ fontWeight: 'bold' }}>{Number(w.final_cost || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ===== EXECUTIVE SUMMARY =====
function ExecutiveSummary({ vehicles, tickets, drivers, workOrders, sites }) {
  const totalVehicleTickets = tickets.length;
  const openTickets = tickets.filter(t => t.status === 'Open').length;
  const closedTickets = tickets.filter(t => t.status === 'Closed').length;

  const totalWO = workOrders.length;
  const totalWOCost = workOrders.reduce((s, w) => s + Number(w.final_cost || 0), 0);
  const contractorCost = workOrders.reduce((s, w) => s + Number(w.contractor_cost || 0), 0);

  const urgentVehicles = vehicles.filter(v => v.status === 'Urgent Overdue').length;
  const warningVehicles = vehicles.filter(v => v.status === 'Warning').length;
  const safeVehicles = vehicles.filter(v => v.status === 'Safe').length;

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>📊 Executive Summary</h2>
        <button className="print-btn no-print" onClick={() => printContent('Executive Summary Report', 'Fleet & Building Overview')}>🖨️ Print Summary</button>
      </div>

      <h3 style={{ color: '#1e3a8a' }}>🚗 Fleet Overview</h3>
      <div className="cards-grid" style={{ marginBottom: '20px' }}>
        <div className="card"><h3>Total Vehicles</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{vehicles.length}</div></div>
        <div className="card danger"><h3>Urgent</h3><div className="big-number" style={{ color: '#dc2626' }}>{urgentVehicles}</div></div>
        <div className="card warning"><h3>Warning</h3><div className="big-number" style={{ color: '#f59e0b' }}>{warningVehicles}</div></div>
        <div className="card success"><h3>Safe</h3><div className="big-number" style={{ color: '#16a34a' }}>{safeVehicles}</div></div>
        <div className="card"><h3>Total Drivers</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{drivers.length}</div></div>
      </div>

      <h3 style={{ color: '#1e3a8a' }}>🎫 Tickets Overview</h3>
      <div className="cards-grid" style={{ marginBottom: '20px' }}>
        <div className="card"><h3>Total Tickets</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{totalVehicleTickets}</div></div>
        <div className="card danger"><h3>Open</h3><div className="big-number" style={{ color: '#dc2626' }}>{openTickets}</div></div>
        <div className="card success"><h3>Closed</h3><div className="big-number" style={{ color: '#16a34a' }}>{closedTickets}</div></div>
      </div>

      <h3 style={{ color: '#1e3a8a' }}>🏢 Building Overview</h3>
      <div className="cards-grid" style={{ marginBottom: '20px' }}>
        <div className="card"><h3>Total Sites</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{sites.length}</div></div>
        <div className="card"><h3>Work Orders</h3><div className="big-number" style={{ color: '#1e3a8a' }}>{totalWO}</div></div>
        <div className="card success"><h3>Total WO Cost</h3><div className="big-number" style={{ color: '#16a34a' }}>{totalWOCost.toLocaleString()}</div><div className="sub">SAR</div></div>
        <div className="card warning"><h3>Contractor Cost</h3><div className="big-number" style={{ color: '#f59e0b' }}>{contractorCost.toLocaleString()}</div><div className="sub">SAR</div></div>
        <div className="card success"><h3>Internal Cost</h3><div className="big-number" style={{ color: '#16a34a' }}>{(totalWOCost - contractorCost).toLocaleString()}</div><div className="sub">SAR</div></div>
      </div>
    </div>
  );
}


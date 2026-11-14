import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

export default function DriverHandovers() {
  const [handovers, setHandovers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [handoverData, setHandoverData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checklist, setChecklist] = useState({});
  const [drivers, setDrivers] = useState([]);
  const [newDriver, setNewDriver] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const [hRes, vRes, dRes] = await Promise.all([
        api.get('/driver-handovers'),
        api.get('/vehicles/list'),
        api.get('/drivers')
      ]);
      setHandovers(hRes.data?.handovers || []);
      setDrivers(dRes.data?.drivers || []);
      setVehicles((vRes.data?.vehicles || vRes.data || []).filter(v => {
        const plate = v.plate || ((v.plate_number || '') + ' ' + (v.plate_code || '')).trim();
        return plate.toLowerCase() !== 'test 123';
      }));
    } catch (e) {
      setError(e.response?.status === 401 ? 'انتهت جلسة الدخول أو رمز الدخول غير صالح. سجّل الخروج ثم ادخل مرة أخرى.' : (e.response?.data?.error || e.message));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadHandoverData = async (vehicleId) => {
    if (!vehicleId) { setHandoverData(null); return; }
    setLoading(true); setError('');
    try {
      const res = await api.get('/vehicle-handover-data/' + vehicleId);
      setHandoverData(res.data);
      setChecklist({});
      setNewDriver('');
      setHandoverNotes('');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const printHandover = () => {
    if (!handoverData) return;
    const d = handoverData;
    const esc = s => String(s ?? '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const today = new Date().toLocaleDateString();

    const oilColor = d.oil.status === 'OVERDUE' ? '#dc2626' : d.oil.status === 'DUE SOON' ? '#d97706' : '#16a34a';

    const tireRows = d.tires.map(t => `<tr><td>${esc(t.position)}</td><td>${esc(t.serial)}</td><td>${esc(t.brand)}</td><td>${esc(t.condition)}</td></tr>`).join('');
    const maintRows = d.maintenance_history.map(m => `<tr><td>${esc(m.date)}</td><td>${esc(m.title)}</td><td>${esc(m.status)}</td></tr>`).join('');
    const checklistRows = d.checklist.map(c => `<tr><td>${c.id}</td><td>${esc(c.name)} / ${esc(c.name_ar)}</td><td style="text-align:center;font-size:14pt">${checklist[c.id] ? '✓' : '☐'}</td></tr>`).join('');

    const w = window.open('', '_blank', 'width=1000,height=900');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Vehicle Handover — ${esc(d.vehicle.plate)}</title>
    <style>@page{size:A4;margin:6mm}body{font-family:Arial,sans-serif;font-size:8pt;color:#172033;margin:0}
    h1{font-size:13pt;margin:0}h2{font-size:9pt;margin:6px 0 3px;border-bottom:1.5px solid #1e3a8a;padding-bottom:2px}
    .header{display:flex;justify-content:space-between;align-items:center;border-bottom:2.5px solid #1e3a8a;padding-bottom:6px;margin-bottom:6px}
    .info{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:2px 12px;margin-bottom:4px}
    .info div{padding:1px 0}.label{color:#64748b;font-size:7pt}.value{font-weight:bold;font-size:8pt}
    table{width:100%;border-collapse:collapse;margin-bottom:4px}th{background:#e9eef5;padding:3px 5px;text-align:left;font-size:7.5pt}
    td{border:1px solid #cbd5e1;padding:2px 5px;font-size:8pt}.oil-status{font-weight:bold;color:${oilColor}}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .sign{margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:20px}
    .sign-box{border:1px solid #94a3b8;padding:8px;min-height:35px}.sign-label{font-size:7pt;color:#64748b;margin-bottom:2px}
    .checklist td:nth-child(3){width:30px;text-align:center;font-size:10pt}
    .compact-section{margin-bottom:3px}</style></head><body>
    <div class="header"><div><h1>Vehicle Handover Form</h1><div style="color:#64748b;font-size:8pt">نموذج تسليم واستلام المركبة</div></div>
    <div style="text-align:right"><div style="font-weight:bold;font-size:12pt">${esc(d.vehicle.plate)}</div><div style="color:#64748b;font-size:7pt">${today}</div></div></div>
    <div class="info">
      <div><span class="label">Vehicle:</span> <span class="value">${esc(d.vehicle.make)} ${esc(d.vehicle.model)} ${esc(d.vehicle.year || '')}</span></div>
      <div><span class="label">Location:</span> <span class="value">${esc(d.vehicle.location)}</span></div>
      <div><span class="label">Previous Driver:</span> <span class="value">${esc(d.vehicle.driver)}</span></div><div><span class="label">New Driver:</span> <span class="value">${esc(selectedNewDriver?.name || "Not selected")}</span></div>
      <div><span class="label">Phone:</span> <span class="value">${esc(d.vehicle.phone || '-')}</span></div>
    </div>
    <h2>🛢️ Engine Oil Status</h2>
    <div class="info">
      <div><span class="label">Current KM:</span> <span class="value">${d.oil.current_km.toLocaleString()}</span></div>
      <div><span class="label">Last Oil KM:</span> <span class="value">${d.oil.last_oil_km.toLocaleString()}</span></div>
      <div><span class="label">Since Oil:</span> <span class="value">${d.oil.km_since_oil.toLocaleString()}</span></div>
      <div><span class="label">Remaining:</span> <span class="value">${d.oil.remaining_km.toLocaleString()} km</span></div>
      <div><span class="label">Interval:</span> <span class="value">${d.oil.interval.toLocaleString()} km</span></div>
      <div><span class="label">Status:</span> <span class="oil-status">${d.oil.status}</span></div>
    </div>
    <div class="two-col">
      <div>
        <h2>🛞 Tire Serial Numbers</h2>
        <table><thead><tr><th>Position</th><th>Serial</th><th>Brand</th></tr></thead><tbody>${tireRows.replace(/<tr>/g, '<tr>').replace(/<td style="padding:6px 10px">/g, '<td>')}</tbody></table>
      </div>
      <div>
        <h2>🔧 Last Maintenance</h2>
        <table><thead><tr><th>Date</th><th>Item</th><th>Status</th></tr></thead><tbody>${maintRows || '<tr><td colspan="3">No records.</td></tr>'}</tbody></table>
      </div>
    </div>
    <h2>📅 Inspection Status</h2>
    <div class="info">
      <div><span class="label">Annual:</span> <span class="value">${esc(d.annual_inspection.last_completed)}</span> → <span class="label">Next:</span> <span class="value">${esc(d.annual_inspection.next_due)}</span></div>
      <div><span class="label">6-Month:</span> <span class="value">${esc(d.six_month_inspection.last_completed)}</span> → <span class="label">Next:</span> <span class="value">${esc(d.six_month_inspection.next_due)}</span></div>
    </div>
    <h2>📋 Handover Checklist — Items Received</h2>
    <table class="checklist"><thead><tr><th style="width:20px">#</th><th>Item</th><th style="width:30px">✓</th></tr></thead><tbody>${checklistRows}</tbody></table>
    <div class="sign">
      <div class="sign-box"><div class="sign-label">Handed over by (Old Driver):</div><div style="margin-top:15px;border-top:1px solid #94a3b8;padding-top:3px;font-size:7pt">Signature / التوقيع</div></div>
      <div class="sign-box"><div class="sign-label">Received by (New Driver):</div><div style="margin-top:15px;border-top:1px solid #94a3b8;padding-top:3px;font-size:7pt">Signature / التوقيع</div></div>
    </div>
    </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 350);
  };

  const selectedNewDriver = drivers.find(d => String(d.id) === String(newDriver));
  const saveHandover = async () => {
    if (!handoverData || !selectedVehicle) return;
    if (!selectedNewDriver) { setError('Please select the new driver.'); return; }
    if (String(handoverData.vehicle.driver_id || '') === String(selectedNewDriver.id)) { setError('The selected driver is already assigned to this vehicle.'); return; }
    if (!window.confirm('Confirm handover from ' + (handoverData.vehicle.driver || 'Unassigned') + ' to ' + selectedNewDriver.name + '?')) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await api.post('/vehicles/' + selectedVehicle + '/handover', { newDriverId: selectedNewDriver.id, notes: handoverNotes, checklist });
      setMessage('Handover saved. Vehicle driver updated to ' + selectedNewDriver.name + '.');
      await load();
      await loadHandoverData(selectedVehicle);
    } catch (e) {
      setError(e.response?.status === 401 ? 'انتهت جلسة الدخول. سجّل الخروج ثم ادخل مرة أخرى.' : (e.response?.data?.error || e.message));
    } finally { setSaving(false); }
  };

  const fmt = n => Number(n || 0).toLocaleString();

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>📋 Driver Handovers</h1>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
          Professional vehicle handover form with oil status, tires, maintenance history, inspections, and checklist.
        </p>
      </div>

      {/* Vehicle selector */}
      <div className="panel" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600, fontSize: '14px' }}>Select Vehicle:</label>
          <select value={selectedVehicle} onChange={e => { setSelectedVehicle(e.target.value); loadHandoverData(e.target.value); }} style={{ minWidth: '300px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}>
            <option value="">— Choose a vehicle —</option>
            {vehicles.map(v => {
              const plate = v.plate || ((v.plate_number || '') + ' ' + (v.plate_code || '')).trim();
              return <option key={v.id} value={v.id}>{plate} — {v.driver || 'Unassigned'}</option>;
            })}
          </select>
          {handoverData && (
            <button className="btn btn-primary" onClick={printHandover} disabled={!selectedNewDriver} style={{ padding: '8px 20px', fontSize: '14px' }}>🖨️ Print Handover Form</button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {loading && <div className="loading">Loading vehicle data...</div>}

      {handoverData && !loading && (
        <div>
          {/* Vehicle Info */}
          <div className="panel" style={{ marginBottom: '16px', padding: '16px' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '18px', color: '#0f172a' }}>🚗 Vehicle Information</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 24px', fontSize: '13px' }}>
              <div><span style={{ color: '#64748b' }}>Plate:</span> <strong>{handoverData.vehicle.plate}</strong></div>
              <div><span style={{ color: '#64748b' }}>Make/Model:</span> <strong>{handoverData.vehicle.make} {handoverData.vehicle.model} {handoverData.vehicle.year}</strong></div>
              <div><span style={{ color: '#64748b' }}>Location:</span> <strong>{handoverData.vehicle.location}</strong></div>
              <div><span style={{ color: '#64748b' }}>Current Driver:</span> <strong>{handoverData.vehicle.driver}</strong></div>
              <div><span style={{ color: '#64748b' }}>Phone:</span> <strong>{handoverData.vehicle.phone || '—'}</strong></div>
              <div><span style={{ color: '#64748b' }}>Status:</span> <strong>{handoverData.vehicle.status}</strong></div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: '16px', padding: '16px' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '18px', color: '#0f172a' }}>👥 Driver Change / تبديل السائق</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'end' }}>
              <div><label>Previous Driver / السائق المُسلِّم</label><input readOnly value={handoverData.vehicle.driver || 'Unassigned'} style={{ width: '100%', padding: 10, background: '#f8fafc' }} /></div>
              <div><label>New Driver / السائق المستلِم</label><select value={newDriver} onChange={e => setNewDriver(e.target.value)} style={{ width: '100%', padding: 10 }}><option value="">— Select new driver —</option>{drivers.filter(d => String(d.id) !== String(handoverData.vehicle.driver_id || '')).map(d => <option key={d.id} value={d.id}>{d.name} {d.phone ? '— ' + d.phone : ''}</option>)}</select></div>
            </div>
            <div style={{ marginTop: 12 }}><label>Handover Notes</label><textarea value={handoverNotes} onChange={e => setHandoverNotes(e.target.value)} rows={2} style={{ width: '100%', padding: 10 }} /></div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={saveHandover} disabled={saving || !selectedNewDriver}>{saving ? 'Saving...' : '✓ Save Handover & Change Driver'}</button>
              <button className="btn btn-secondary" onClick={printHandover} disabled={!selectedNewDriver}>🖨️ Print Both-Driver Handover Form</button>
            </div>
          </div>

          {/* Oil Status */}
          <div className="panel" style={{ marginBottom: '16px', padding: '16px' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '18px', color: '#0f172a' }}>🛢️ Engine Oil Status</h2>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ background: '#f8fafc', padding: '10px 16px', borderRadius: '6px', minWidth: '140px' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Current KM</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{fmt(handoverData.oil.current_km)}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '10px 16px', borderRadius: '6px', minWidth: '140px' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Last Oil KM</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{fmt(handoverData.oil.last_oil_km)}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '10px 16px', borderRadius: '6px', minWidth: '140px' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>KM Since Oil</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{fmt(handoverData.oil.km_since_oil)}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '10px 16px', borderRadius: '6px', minWidth: '140px' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Remaining</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: handoverData.oil.remaining_km <= 0 ? '#dc2626' : handoverData.oil.remaining_km <= 500 ? '#d97706' : '#16a34a' }}>{fmt(handoverData.oil.remaining_km)} km</div>
              </div>
              <div style={{ background: handoverData.oil.status === 'OVERDUE' ? '#fef2f2' : handoverData.oil.status === 'DUE SOON' ? '#fffbeb' : '#f0fdf4', padding: '10px 16px', borderRadius: '6px', minWidth: '120px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Status</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: handoverData.oil.status === 'OVERDUE' ? '#dc2626' : handoverData.oil.status === 'DUE SOON' ? '#d97706' : '#16a34a' }}>{handoverData.oil.status}</div>
              </div>
            </div>
          </div>

          {/* Tires */}
          <div className="panel" style={{ marginBottom: '16px', padding: '16px' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '18px', color: '#0f172a' }}>🛞 Tire Serial Numbers</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Position</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Serial Number</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Brand</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Condition</th>
                </tr></thead>
                <tbody>
                  {handoverData.tires.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>{t.position}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{t.serial}</td>
                      <td style={{ padding: '6px 10px' }}>{t.brand}</td>
                      <td style={{ padding: '6px 10px' }}>{t.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Maintenance History */}
          <div className="panel" style={{ marginBottom: '16px', padding: '16px' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '18px', color: '#0f172a' }}>🔧 Last Maintenance Items</h2>
            {handoverData.maintenance_history.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '13px' }}>No maintenance records found.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead><tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Item</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Status</th>
                  </tr></thead>
                  <tbody>
                    {handoverData.maintenance_history.map((m, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{m.date}</td>
                        <td style={{ padding: '6px 10px' }}>{m.title}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ background: m.status === 'Completed' ? '#bbf7d0' : '#fde68a', color: m.status === 'Completed' ? '#166534' : '#92400e', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>{m.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Inspection Dates */}
          <div className="panel" style={{ marginBottom: '16px', padding: '16px' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '18px', color: '#0f172a' }}>📅 Inspection Status</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>📅 Annual Inspection</div>
                <div style={{ fontSize: '14px' }}>Last: <strong>{handoverData.annual_inspection.last_completed}</strong></div>
                <div style={{ fontSize: '14px' }}>Next Due: <strong style={{ color: '#16a34a' }}>{handoverData.annual_inspection.next_due}</strong></div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{handoverData.annual_inspection.whatsapp_confirmed ? `WhatsApp ✓ ${handoverData.annual_inspection.whatsapp_confirmed}` : ''}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>🔍 6-Month Inspection</div>
                <div style={{ fontSize: '14px' }}>Last: <strong>{handoverData.six_month_inspection.last_completed}</strong></div>
                <div style={{ fontSize: '14px' }}>Next Due: <strong style={{ color: '#16a34a' }}>{handoverData.six_month_inspection.next_due}</strong></div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{handoverData.six_month_inspection.whatsapp_confirmed ? `WhatsApp ✓ ${handoverData.six_month_inspection.whatsapp_confirmed}` : ''}</div>
              </div>
            </div>
          </div>

          {/* Checklist */}
          <div className="panel" style={{ marginBottom: '16px', padding: '16px' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '18px', color: '#0f172a' }}>📋 Handover Checklist</h2>
            <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '13px' }}>
              The new driver confirms receipt of the following items from the previous driver:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {handoverData.checklist.map(item => (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: checklist[item.id] ? '#f0fdf4' : '#f8fafc', borderRadius: '6px', cursor: 'pointer', border: '1px solid #e2e8f0' }}>
                  <input type="checkbox" checked={!!checklist[item.id]} onChange={e => setChecklist(prev => ({ ...prev, [item.id]: e.target.checked }))} style={{ width: '18px', height: '18px' }} />
                  <span style={{ fontSize: '14px' }}><strong>{item.id}.</strong> {item.name} <span style={{ color: '#64748b' }}> / {item.name_ar}</span></span>
                </label>
              ))}
            </div>
            <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div style={{ border: '1px solid #cbd5e1', padding: '12px', borderRadius: '6px', minHeight: '80px' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Handed over by (Old Driver):</div>
                <div style={{ marginTop: '30px', borderTop: '1px solid #94a3b8', paddingTop: '4px', fontSize: '10px', color: '#64748b' }}>Signature / التوقيع</div>
              </div>
              <div style={{ border: '1px solid #cbd5e1', padding: '12px', borderRadius: '6px', minHeight: '80px' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Received by (New Driver):</div>
                <div style={{ marginTop: '30px', borderTop: '1px solid #94a3b8', paddingTop: '4px', fontSize: '10px', color: '#64748b' }}>Signature / التوقيع</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent handovers */}
      {!handoverData && (
        <div className="panel" style={{ padding: '16px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '18px', color: '#0f172a' }}>Recent Handovers</h2>
          {handovers.length === 0 ? (
            <div className="alert alert-info">No handover records yet. Select a vehicle above to create one.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Vehicle</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>From Driver</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>To Driver</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Status</th>
                </tr></thead>
                <tbody>
                  {handovers.map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 700 }}>{h.vehicle_plate || '—'}</td>
                      <td style={{ padding: '7px 10px' }}>{h.from_driver || '—'}</td>
                      <td style={{ padding: '7px 10px' }}>{h.to_driver || '—'}</td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace' }}>{String(h.handover_date || h.created_at || '').slice(0, 10)}</td>
                      <td style={{ padding: '7px 10px' }}>{h.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

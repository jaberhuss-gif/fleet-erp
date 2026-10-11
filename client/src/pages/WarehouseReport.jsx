import { useEffect, useState } from "react";
import api, { getInventoryReportFull } from "../api/client";

export default function WarehouseReport({ user }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [sites, setSites] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [filters, setFilters] = useState({ from: "", to: "", site: "", vehicleId: "" });

  useEffect(() => {
    (async () => {
      try {
        const [s, v] = await Promise.all([
          api.get("/sites").catch(() => ({ data: { sites: [] } })),
          api.get("/vehicles/list").catch(() => ({ data: { vehicles: [] } }))
        ]);
        setSites(s.data?.sites || []);
        setVehicles(v.data?.vehicles || []);
      } catch (e) { console.error(e); }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await getInventoryReportFull(filters);
      setData(r);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const exportPdf = () => {
    if (!data) return;
    const win = window.open("", "_blank");
    if (!win) { setError("Popup blocked. Allow popups."); return; }
    const esc = (v) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const s = data.summary || {};

    const movementsRows = (data.movements || []).map(m => "<tr><td>" + esc(String(m.created_at || "").slice(0, 10)) + "</td><td>" + esc(m.type) + "</td><td>" + esc(m.item_code) + " — " + esc(m.item_name) + "</td><td style='text-align:right'>" + m.quantity + "</td><td>" + esc(m.from_location || "") + "</td><td>" + esc(m.to_location || "") + "</td><td>" + esc(m.site || "") + "</td><td>" + esc(m.vehicle_plate || "") + "</td><td>" + esc(m.driver_name || "") + "</td><td>" + esc(m.reference_no || "") + "</td></tr>").join("");

    const handoverRows = (data.handovers || []).map(h => "<tr><td>" + esc(String(h.handover_date || "").slice(0, 10)) + "</td><td>" + esc(h.plate_number || "") + " " + esc(h.plate_code || "") + "</td><td>" + esc(h.previous_driver_name || "") + "</td><td>" + esc(h.new_driver_name || "") + "</td><td>" + esc(h.notes || "") + "</td></tr>").join("");

    const siteRows = (data.by_site || []).map(x => "<tr><td>" + esc(x.site) + "</td><td style='text-align:right'>" + x.in_count + " / " + x.in_qty + "</td><td style='text-align:right'>" + x.out_count + " / " + x.out_qty + "</td><td style='text-align:right'>" + x.transfer_count + " / " + x.transfer_qty + "</td></tr>").join("");

    const vehRows = (data.by_vehicle || []).map(x => "<tr><td>" + esc(x.vehicle_plate) + "</td><td>" + esc(x.driver_name || "") + "</td><td style='text-align:right'>" + x.out_count + "</td><td style='text-align:right'>" + x.out_qty + "</td><td>" + esc(String(x.last_movement || "").slice(0, 19).replace("T", " ")) + "</td></tr>").join("");

    const html = "<!doctype html><html><head><meta charset='utf-8'><title>Warehouse Report</title><style>body{font-family:Arial;padding:20px;color:#111827}h1{color:#0f766e;margin:0 0 4px}.sub{font-size:12px;color:#475569;margin-bottom:14px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}.card{border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:#f8fafc}.card b{font-size:18px}table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px}th,td{border:1px solid #cbd5e1;padding:5px 6px;text-align:left}th{background:#e2e8f0;text-transform:uppercase;font-size:10px}h2{font-size:14px;color:#0f766e;margin:20px 0 8px}@media print{.no-print{display:none}}</style></head><body>" +
      "<div style='display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #0f766e;padding-bottom:10px;margin-bottom:14px'><img src='https://pbs.twimg.com/media/G0B19WzaYAIKWy1.png' style='width:175px;max-height:78px;object-fit:contain' /><div style='text-align:right'><div style='font-size:15px;font-weight:700;color:#0f766e'>Maaden Ivanhoe Electric Exploration and Development Limited Company</div><div style='font-size:10px;color:#475569'>Exploration Phase — Arabian Shield</div><div style='font-size:12px;font-weight:700;margin-top:6px'>Hussein Anwar</div><div style='font-size:10px;color:#475569'>Fleet Manager / Fleet &amp; Camp Maintenance Supervisor</div></div></div>" +
      "<h1>Warehouse Report</h1><div class='sub'>Generated: " + new Date().toLocaleString("en-GB") + (filters.from ? " • From: " + filters.from : "") + (filters.to ? " • To: " + filters.to : "") + (filters.site ? " • Site: " + filters.site : "") + "</div>" +
      "<div class='grid'><div class='card'><div>Total IN</div><b>" + (s.in_count || 0) + " (" + (s.in_qty || 0) + ")</b></div><div class='card'><div>Total OUT</div><b>" + (s.out_count || 0) + " (" + (s.out_qty || 0) + ")</b></div><div class='card'><div>Transfers</div><b>" + (s.transfer_count || 0) + " (" + (s.transfer_qty || 0) + ")</b></div></div>" +
      "<h2>By Site</h2><table><thead><tr><th>Site</th><th>IN (count/qty)</th><th>OUT (count/qty)</th><th>Transfer (count/qty)</th></tr></thead><tbody>" + siteRows + "</tbody></table>" +
      "<h2>By Vehicle (Out)</h2><table><thead><tr><th>Vehicle</th><th>Driver</th><th>OUT Count</th><th>OUT Qty</th><th>Last Movement</th></tr></thead><tbody>" + vehRows + "</tbody></table>" +
      "<h2>Driver Handovers</h2><table><thead><tr><th>Date</th><th>Vehicle</th><th>From</th><th>To</th><th>Notes</th></tr></thead><tbody>" + (handoverRows || "<tr><td colspan='5' style='text-align:center;color:#999'>None</td></tr>") + "</tbody></table>" +
      "<h2>Detailed Movements (last 500)</h2><table><thead><tr><th>Date</th><th>Type</th><th>Item</th><th>Qty</th><th>From</th><th>To</th><th>Site</th><th>Vehicle</th><th>Driver</th><th>Ref</th></tr></thead><tbody>" + movementsRows + "</tbody></table>" +
      "<div class='no-print' style='text-align:center;margin-top:20px'><button onclick='window.print()' style='padding:12px 24px;font-size:16px;cursor:pointer'>Print / Save PDF</button></div>" +
      "<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});</script>" +
      "</body></html>";

    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Warehouse Report</h1>
        <button className="btn btn-success" onClick={exportPdf} disabled={!data}>Print / Export PDF</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginBottom: 16 }}>
        <div className="form-group"><label>From</label><input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></div>
        <div className="form-group"><label>To</label><input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></div>
        <div className="form-group"><label>Site</label>
          <select value={filters.site} onChange={e => setFilters({ ...filters, site: e.target.value })}>
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Vehicle</label>
          <select value={filters.vehicleId} onChange={e => setFilters({ ...filters, vehicleId: e.target.value })}>
            <option value="">All Vehicles</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate || ((v.plate_number || "") + " " + (v.plate_code || "")).trim()}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <button className="btn btn-primary" onClick={load} disabled={loading}>{loading ? "Loading..." : "Apply"}</button>
          <button className="btn" onClick={() => setFilters({ from: "", to: "", site: "", vehicleId: "" })}>Reset</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {data && (
        <>
          <div className="cards-grid" style={{ marginBottom: 16 }}>
            <div className="card success"><h3>IN</h3><div className="big-number">{data.summary?.in_count || 0}</div><div className="sub">{data.summary?.in_qty || 0} units</div></div>
            <div className="card danger"><h3>OUT</h3><div className="big-number">{data.summary?.out_count || 0}</div><div className="sub">{data.summary?.out_qty || 0} units</div></div>
            <div className="card warning"><h3>Transfers</h3><div className="big-number">{data.summary?.transfer_count || 0}</div><div className="sub">{data.summary?.transfer_qty || 0} units</div></div>
          </div>

          <h3>By Site</h3>
          <table className="data-table" style={{ width: "100%" }}>
            <thead><tr><th>Site</th><th>IN Count</th><th>IN Qty</th><th>OUT Count</th><th>OUT Qty</th><th>Transfers</th></tr></thead>
            <tbody>
              {data.by_site?.map((x, i) => (
                <tr key={i}><td>{x.site}</td><td>{x.in_count}</td><td>{x.in_qty}</td><td>{x.out_count}</td><td>{x.out_qty}</td><td>{x.transfer_count} / {x.transfer_qty}</td></tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 20 }}>By Vehicle</h3>
          <table className="data-table" style={{ width: "100%" }}>
            <thead><tr><th>Vehicle</th><th>Driver</th><th>OUT Count</th><th>OUT Qty</th><th>Last Movement</th></tr></thead>
            <tbody>
              {data.by_vehicle?.map((x, i) => (
                <tr key={i}><td>{x.vehicle_plate}</td><td>{x.driver_name || "-"}</td><td>{x.out_count}</td><td>{x.out_qty}</td><td>{String(x.last_movement || "").slice(0, 19).replace("T", " ")}</td></tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 20 }}>Driver Handovers</h3>
          <table className="data-table" style={{ width: "100%" }}>
            <thead><tr><th>Date</th><th>Vehicle</th><th>From</th><th>To</th><th>Notes</th></tr></thead>
            <tbody>
              {(data.handovers || []).length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: "center", color: "#999" }}>No handovers in period</td></tr>
              ) : (
                data.handovers.map((h, i) => (
                  <tr key={i}><td>{String(h.handover_date || "").slice(0, 10)}</td><td>{h.plate_number} {h.plate_code}</td><td>{h.previous_driver_name || "-"}</td><td>{h.new_driver_name || "-"}</td><td>{h.notes || "-"}</td></tr>
                ))
              )}
            </tbody>
          </table>

          <h3 style={{ marginTop: 20 }}>Detailed Movements (last 500)</h3>
          <div style={{ maxHeight: 500, overflowY: "auto" }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead><tr><th>Date</th><th>Type</th><th>Item</th><th>Qty</th><th>From</th><th>To</th><th>Site</th><th>Vehicle</th><th>Driver</th><th>Ref</th></tr></thead>
              <tbody>
                {data.movements?.map((m, i) => (
                  <tr key={i}><td>{String(m.created_at || "").slice(0, 10)}</td><td>{m.type}</td><td>{m.item_code} — {m.item_name}</td><td>{m.quantity}</td><td>{m.from_location || "-"}</td><td>{m.to_location || "-"}</td><td>{m.site || "-"}</td><td>{m.vehicle_plate || "-"}</td><td>{m.driver_name || "-"}</td><td>{m.reference_no || "-"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

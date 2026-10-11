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

    // Validate data
    console.log("[PDF Export] by_site:", data.by_site?.length, "by_vehicle:", data.by_vehicle?.length, "movements:", data.movements?.length);

    const win = window.open("", "_blank");
    if (!win) { setError("Popup blocked. Allow popups."); return; }

    const esc = (v) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const fmtDate = (d) => d ? String(d).slice(0, 10) : "-";
    const fmtDateTime = (d) => d ? String(d).slice(0, 19).replace("T", " ") : "-";
    const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");

    const s = data.summary || {};

    // === Rows ===

    // By Site
    const siteRows = (data.by_site || []).map(x => {
      const available = Number(x.available || 0);
      const color = available > 0 ? "#16a34a" : "#dc2626";
      return "<tr>"
        + "<td>" + esc(x.site) + "</td>"
        + "<td style='text-align:center'>" + fmtNum(x.received_count) + "</td>"
        + "<td style='text-align:right'>" + fmtNum(x.received_qty) + "</td>"
        + "<td style='text-align:center'>" + fmtNum(x.issued_count) + "</td>"
        + "<td style='text-align:right'>" + fmtNum(x.issued_qty) + "</td>"
        + "<td style='text-align:right'>" + fmtNum(x.transferred_out_qty) + "</td>"
        + "<td style='text-align:right'>" + fmtNum(x.transferred_in_qty) + "</td>"
        + "<td style='text-align:right;font-weight:700;color:" + color + "'>" + fmtNum(available) + "</td>"
        + "</tr>";
    }).join("");

    // By Vehicle
    const vehRows = (data.by_vehicle || []).map(x =>
      "<tr>"
      + "<td>" + esc(x.vehicle_plate) + "</td>"
      + "<td>" + esc(x.driver_name || "-") + "</td>"
      + "<td style='text-align:center'>" + fmtNum(x.out_count) + "</td>"
      + "<td style='text-align:right'>" + fmtNum(x.out_qty) + "</td>"
      + "<td>" + fmtDateTime(x.last_movement) + "</td>"
      + "</tr>"
    ).join("");

    // Handovers
    const handoverRows = (data.handovers || []).map(h =>
      "<tr>"
      + "<td>" + fmtDate(h.handover_date) + "</td>"
      + "<td>" + esc(h.plate_number || "") + " " + esc(h.plate_code || "") + "</td>"
      + "<td>" + esc(h.previous_driver_name || "-") + "</td>"
      + "<td>" + esc(h.new_driver_name || "-") + "</td>"
      + "<td>" + esc(h.notes || "-") + "</td>"
      + "</tr>"
    ).join("");

    // Movements
    const movementsRows = (data.movements || []).map(m => {
      const typeColor = m.type === "IN" ? "#16a34a" : m.type === "OUT" ? "#dc2626" : "#b45309";
      return "<tr>"
        + "<td>" + fmtDate(m.created_at) + "</td>"
        + "<td style='color:" + typeColor + ";font-weight:700'>" + esc(m.type) + "</td>"
        + "<td>" + esc(m.item_code || "") + "<br><small>" + esc(m.item_name || "") + "</small></td>"
        + "<td style='text-align:right'>" + fmtNum(m.quantity) + "</td>"
        + "<td>" + esc(m.from_location || "-") + "</td>"
        + "<td>" + esc(m.to_location || "-") + "</td>"
        + "<td>" + esc(m.site || "-") + "</td>"
        + "<td>" + esc(m.vehicle_plate || "-") + "</td>"
        + "<td>" + esc(m.driver_name || "-") + "</td>"
        + "<td>" + esc(m.reference_no || "-") + "</td>"
        + "<td>" + esc(m.notes || "-") + "</td>"
        + "</tr>";
    }).join("");

    // Filters
    const filterInfo = [];
    if (filters.from) filterInfo.push("From: " + filters.from);
    if (filters.to) filterInfo.push("To: " + filters.to);
    if (filters.site) filterInfo.push("Site: " + filters.site);
    if (filters.vehicleId) filterInfo.push("Vehicle: " + filters.vehicleId);

    const html = "<!doctype html><html><head><meta charset='utf-8'><title>Warehouse Report</title>"
    + "<style>"
    + "@page{size:A4;margin:15mm 10mm}*{box-sizing:border-box}"
    + "body{font-family:'Segoe UI',Arial,sans-serif;padding:0;margin:0;color:#111827;font-size:11px}"
    + "h1{font-size:20px;margin:0 0 4px;color:#0f766e}"
    + "h2{font-size:14px;color:#0f766e;margin:18px 0 8px;border-bottom:2px solid #0f766e;padding-bottom:4px}"
    + ".header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:3px solid #0f766e;padding-bottom:12px;margin-bottom:16px}"
    + ".header img{width:175px;max-height:78px;object-fit:contain}"
    + ".header .company{text-align:right}"
    + ".header .company-name{font-size:14px;font-weight:700;color:#0f766e}"
    + ".header .project-name{font-size:10px;color:#475569;margin-top:2px}"
    + ".header .owner{font-size:12px;font-weight:700;margin-top:6px}"
    + ".header .role{font-size:10px;color:#475569}"
    + ".meta{font-size:10px;color:#475569;margin-bottom:14px}"
    + ".cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}"
    + ".card{border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;background:#f8fafc}"
    + ".card .label{font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px}"
    + ".card .value{font-size:20px;font-weight:700;color:#0f766e}"
    + ".card .sub{font-size:10px;color:#94a3b8;margin-top:2px}"
    + "table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:14px;page-break-inside:auto}"
    + "thead{background:#e2e8f0}"
    + "th,td{border:1px solid #cbd5e1;padding:5px 6px;text-align:left;vertical-align:top}"
    + "th{text-transform:uppercase;font-size:9px;font-weight:700;color:#0f766e}"
    + "tbody tr:nth-child(even){background:#f8fafc}"
    + "tr{page-break-inside:avoid}"
    + ".footer{margin-top:24px;padding-top:10px;border-top:2px solid #cbd5e1;text-align:center;font-size:9px;color:#64748b}"
    + ".no-print{text-align:center;margin-top:20px}"
    + ".no-print button{padding:12px 24px;font-size:14px;cursor:pointer;background:#0f766e;color:#fff;border:0;border-radius:8px}"
    + "@media print{.no-print{display:none}body{padding:0}h1{font-size:16px}h2{font-size:12px}}"
    + "</style></head><body>"

    + "<div class='header'>"
    + "<img src='https://pbs.twimg.com/media/G0B19WzaYAIKWy1.png' alt='Maaden Ivanhoe Electric' />"
    + "<div class='company'>"
    + "<div class='company-name'>Maaden Ivanhoe Electric Exploration and Development Limited Company</div>"
    + "<div class='project-name'>Exploration Phase — Arabian Shield</div>"
    + "<div class='owner'>Hussein Anwar</div>"
    + "<div class='role'>Fleet Manager / Fleet &amp; Camp Maintenance Supervisor</div>"
    + "</div></div>"

    + "<h1>Warehouse Report</h1>"
    + "<div class='meta'><strong>Generated:</strong> " + new Date().toLocaleString("en-GB") + (filterInfo.length ? " &nbsp;|&nbsp; " + filterInfo.map(esc).join(" &nbsp;|&nbsp; ") : "") + "</div>"

    + "<div class='cards'>"
    + "<div class='card'><div class='label'>Total IN</div><div class='value'>" + fmtNum(s.in_count || 0) + "</div><div class='sub'>" + fmtNum(s.in_qty || 0) + " units</div></div>"
    + "<div class='card'><div class='label'>Total OUT</div><div class='value'>" + fmtNum(s.out_count || 0) + "</div><div class='sub'>" + fmtNum(s.out_qty || 0) + " units</div></div>"
    + "<div class='card'><div class='label'>Transfers</div><div class='value'>" + fmtNum(s.transfer_count || 0) + "</div><div class='sub'>" + fmtNum(s.transfer_qty || 0) + " units</div></div>"
    + "</div>"

    + "<h2>By Site</h2>"
    + "<table><thead><tr>"
    + "<th>Site</th><th>Received Count</th><th>Received Qty</th><th>Issued Count</th><th>Issued Qty</th><th>Transferred Out</th><th>Transferred In</th><th>Available Balance</th>"
    + "</tr></thead><tbody>" + (siteRows || "<tr><td colspan='8' style='text-align:center;color:#999'>No data</td></tr>") + "</tbody></table>"

    + "<h2>By Vehicle (Issued)</h2>"
    + "<table><thead><tr>"
    + "<th>Vehicle</th><th>Driver</th><th>Issued Count</th><th>Issued Qty</th><th>Last Movement</th>"
    + "</tr></thead><tbody>" + (vehRows || "<tr><td colspan='5' style='text-align:center;color:#999'>No data</td></tr>") + "</tbody></table>"

    + "<h2>Driver Handovers</h2>"
    + "<table><thead><tr>"
    + "<th>Date</th><th>Vehicle</th><th>From</th><th>To</th><th>Notes</th>"
    + "</tr></thead><tbody>" + (handoverRows || "<tr><td colspan='5' style='text-align:center;color:#999'>No handovers in period</td></tr>") + "</tbody></table>"

    + "<h2>Detailed Movements</h2>"
    + "<table><thead><tr>"
    + "<th>Date</th><th>Type</th><th>Item</th><th>Qty</th><th>From</th><th>To</th><th>Site</th><th>Vehicle</th><th>Driver</th><th>Ref</th><th>Notes</th>"
    + "</tr></thead><tbody>" + (movementsRows || "<tr><td colspan='11' style='text-align:center;color:#999'>No movements</td></tr>") + "</tbody></table>"

    + "<div class='footer'>This report was auto-generated by Fleet &amp; Camp Maintenance ERP • Page 1</div>"

    + "<div class='no-print'><button onclick='window.print()'>Print / Save PDF</button></div>"

    + "<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});</script>"

    + "</body></html>";

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
            <thead>
              <tr>
                <th>Site</th>
                <th>Received Count</th>
                <th>Received Qty</th>
                <th>Issued Count</th>
                <th>Issued Qty</th>
                <th>Transferred Out</th>
                <th>Transferred In</th>
                <th>Available Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.by_site?.map((x, i) => (
                <tr key={i}>
                  <td>{x.site}</td>
                  <td>{x.received_count || 0}</td>
                  <td>{x.received_qty || 0}</td>
                  <td>{x.issued_count || 0}</td>
                  <td>{x.issued_qty || 0}</td>
                  <td>{x.transferred_out_count || 0} / {x.transferred_out_qty || 0}</td>
                  <td>{x.transferred_in_count || 0} / {x.transferred_in_qty || 0}</td>
                  <td style={{ fontWeight: "bold", color: (x.available || 0) > 0 ? "#16a34a" : "#dc2626" }}>{x.available || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 20 }}>By Vehicle (Issued)</h3>
          <table className="data-table" style={{ width: "100%" }}>
            <thead><tr><th>Vehicle</th><th>Driver</th><th>Issued Count</th><th>Issued Qty</th><th>Last Movement</th></tr></thead>
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

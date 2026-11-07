import { useEffect, useState } from "react";
import api from "../api/client";

export default function DailyKmMissing({ user }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/google-sheet-submission-report");
      setReport(res.data || null);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to load today's missing records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openWhatsApp = async (row) => {
    if (user?.role !== "Owner") return;
    try {
      const info = (await api.get("/vehicles/" + row.vehicleId + "/whatsapp-info")).data || {};
      let phone = String(info.waMeNumber || info.driverPhone || row.phone || "").replace(/[^0-9]/g, "");
      if (phone.startsWith("00")) phone = phone.slice(2);
      if (phone.length === 10 && phone.startsWith("05")) phone = "966" + phone.slice(1);
      if (phone.length === 9 && phone.startsWith("5")) phone = "966" + phone;
      if (!phone) {
      alert("No phone number found for the current driver assigned to this vehicle.");
      return;
    }

    const message =
      "Hello " + (row.driver || "Driver") + ",\n\n" +
      "No KM reading recorded today for vehicle " + row.vehicle + ".\n" +
      "Last recorded KM: " + Number(row.currentKm || 0).toLocaleString() + " km.\n\n" +
      "Please record today's KM.\n\n" +
      "Thank you,\nFleet Management";

      window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(message), "_blank");
    } catch (e) {
      alert(e.response?.data?.error || e.message || "Unable to open WhatsApp for the current driver.");
    }
  };

  if (loading) return <div className="loading">Loading today's missing records...</div>;

  const rows = report?.missing || [];

  return (
    <div>
      <div className="panel" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>⚠️ Daily KM — Missing</h1>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              Vehicles appear here only if they have not submitted today in either Google Sheet or ERP.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={load}>🔄 Refresh</button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="cards-grid" style={{ marginBottom: 18 }}>
        <div className="card danger">
          <h3>Not Submitted Today</h3>
          <div className="big-number">{rows.length}</div>
          <div className="sub">vehicles missing from both sources</div>
        </div>
      </div>

      <div className="panel">
        {rows.length === 0 ? (
          <div className="alert alert-success">✓ All vehicles have a submission today.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Driver</th>
                <th>Location</th>
                <th>Last KM</th>
                {user?.role === "Owner" && <th>WhatsApp</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vehicleId || r.vehicle}>
                  <td style={{ fontWeight: 700 }}>{r.vehicle}</td>
                  <td>{r.driver || "-"}</td>
                  <td>{r.location || "-"}</td>
                  <td>{Number(r.currentKm || 0).toLocaleString()}</td>
                  {user?.role === "Owner" && (
                    <td>
                      <button className="btn btn-success" style={{ padding: "6px 10px" }} onClick={() => openWhatsApp(r)}>
                        📱 WhatsApp
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

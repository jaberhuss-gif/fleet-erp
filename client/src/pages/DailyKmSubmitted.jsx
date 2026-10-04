import { useEffect, useState } from "react";
import api from "../api/client";

export default function DailyKmSubmitted() {
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
      setError(e.response?.data?.error || e.message || "Failed to load today's submitted records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="loading">Loading today's submitted records...</div>;

  const rows = report?.submitted || [];

  return (
    <div>
      <div className="panel" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>📋 Daily KM — Submitted</h1>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              Vehicles that submitted today from Google Sheet or ERP appear here.
            </p>
          </div>
          <button className="btn btn-primary" onClick={load}>🔄 Refresh</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="cards-grid" style={{ marginBottom: 18 }}>
        <div className="card success">
          <h3>Submitted Today</h3>
          <div className="big-number">{report?.submittedCount || 0}</div>
          <div className="sub">vehicles entered today</div>
        </div>
        <div className="card">
          <h3>Submission Rate</h3>
          <div className="big-number">{Number(report?.submissionPercent || 0).toFixed(1)}%</div>
          <div className="sub">of the fixed fleet</div>
        </div>
      </div>

      <div className="panel">
        {rows.length === 0 ? (
          <div className="alert alert-info">No vehicles have been entered today.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Driver</th>
                <th>Location</th>
                <th>KM</th>
                <th>Source</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vehicleId || r.vehicle}>
                  <td style={{ fontWeight: 700 }}>{r.vehicle}</td>
                  <td>{r.driver || "-"}</td>
                  <td>{r.location || "-"}</td>
                  <td>{r.km == null ? "-" : Number(r.km).toLocaleString()}</td>
                  <td>{r.source}</td>
                  <td>{r.timestamp ? new Date(r.timestamp).toLocaleString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

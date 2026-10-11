import { useEffect, useState } from "react";
import api, {
  getInvoices,
  getInvoice,
  uploadInvoicePreview,
  importInvoice,
  autoMatchInvoice,
  matchInvoiceItem,
  confirmInvoiceItemAmount,
  verifyInvoiceTotal,
  finalizeInvoice,
  importOcrInvoice,
  getSites,
  updateInvoiceSite,
  createManualInvoice
} from "../api/client";
import { extractTextFromPdfViaOcr } from "../utils/ocr";

const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Invoices({ user }) {
  const [view, setView] = useState("list");
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [preview, setPreview] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState("");
  const [sites, setSites] = useState([]);
  const [manualForm, setManualForm] = useState({
    invoice_no: "", invoice_date: "", contractor_name: "", site: "",
    subtotal: 0, vat: 0, vat_percent: 15, total: 0, notes: ""
  });
  const [manualItems, setManualItems] = useState([
    { description: "", quantity: 1, unit_price: 0, total_with_vat: 0 }
  ]);
  const [editSite, setEditSite] = useState("");
  const [savingSite, setSavingSite] = useState(false);

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [verify, setVerify] = useState(null);

  const loadList = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await getInvoices();
      setInvoices(r.invoices || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === "list") loadList();
  }, [view]);

  useEffect(() => {
    (async () => {
      try {
        const r = await getSites();
        setSites(r.sites || []);
      } catch (e) {
        console.error("Failed to load sites:", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedInvoice) setEditSite(selectedInvoice.site || "");
  }, [selectedInvoice]);

  const handleFile = async (file, type) => {
    if (!file) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const r = await uploadInvoicePreview(file, type);
      setPreview(r);
      setPreviewFile(file);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleOcrImport = async (file) => {
    if (!file) return;
    setError("");
    setMessage("");
    setOcrBusy(true);
    setOcrProgress("Starting OCR...");
    try {
      const text = await extractTextFromPdfViaOcr(file, (stage, page, total, progress) => {
        if (stage === "rendering") setOcrProgress(`Rendering page ${page}/${total}...`);
        else if (stage === "ocr") setOcrProgress(`OCR page ${page}/${total}...`);
        else if (stage === "ocr-progress") setOcrProgress(`OCR page ${page}/${total} - ${Math.round(progress * 100)}%`);
      });
      setOcrProgress("Sending to server...");
      const payload = {
        filename: file.name,
        text,
        invoice_no: "",
        invoice_date: "",
        source_type: "OCR"
      };
      const r = await importOcrInvoice(payload);
      setMessage("OCR imported: " + (r.invoice?.invoice_no || "OK") + " (" + r.count + " items)");
      setOcrProgress("");
      setView("list");
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setOcrProgress("");
    } finally {
      setOcrBusy(false);
    }
  };

  const handleImport = async () => {
    if (!previewFile) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await importInvoice(previewFile, previewFile.name.endsWith(".pdf") ? "pdf" : "excel", preview.header?.site || "");
      setMessage("Imported: " + (r.invoice?.invoice_no || "OK") + " (" + r.count + " items)");
      setPreview(null);
      setPreviewFile(null);
      setView("list");
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const openInvoice = async (id) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await getInvoice(id);
      setSelectedInvoice(r.invoice);
      setInvoiceItems(r.items || []);
      setView("detail");
      setVerify(null);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAmount = async (itemId, amount) => {
    try {
      await confirmInvoiceItemAmount(itemId, Number(amount) || 0);
      setInvoiceItems(prev => prev.map(it => it.id === itemId ? { ...it, confirmed_amount: Number(amount) || 0 } : it));
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const handleVerify = async () => {
    if (!selectedInvoice) return;
    try {
      const r = await verifyInvoiceTotal(selectedInvoice.id);
      setVerify(r);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const handleFinalize = async () => {
    if (!selectedInvoice) return;
    if (!confirm("Finalize this invoice? Cannot be undone.")) return;
    try {
      const r = await finalizeInvoice(selectedInvoice.id);
      setMessage(r.message || "Finalized");
      await openInvoice(selectedInvoice.id);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const handleSaveSite = async () => {
    if (!selectedInvoice) return;
    setSavingSite(true);
    setError("");
    try {
      const r = await updateInvoiceSite(selectedInvoice.id, editSite);
      setSelectedInvoice(r.invoice);
      setMessage("Site updated");
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSavingSite(false);
    }
  };

  const handleManualSave = async () => {
    setError("");
    setMessage("");
    if (!manualItems.length) return setError("Add at least one item.");
    const cleanItems = manualItems.filter(it => String(it.description || "").trim());
    if (!cleanItems.length) return setError("Every item must have a description.");
    try {
      setBusy(true);
      const r = await createManualInvoice({
        ...manualForm,
        items: cleanItems
      });
      setMessage("Manual invoice saved: " + (r.invoice?.invoice_no || "OK") + " (" + r.count + " items)");
      setView("list");
      setManualForm({ invoice_no: "", invoice_date: "", contractor_name: "", site: "", subtotal: 0, vat: 0, vat_percent: 15, total: 0, notes: "" });
      setManualItems([{ description: "", quantity: 1, unit_price: 0, total_with_vat: 0 }]);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAutoMatch = async () => {
    if (!selectedInvoice) return;
    setBusy(true);
    try {
      const r = await autoMatchInvoice(selectedInvoice.id);
      setMessage("Auto-match done. Review suggestions below.");
      // Re-fetch
      await openInvoice(selectedInvoice.id);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Invoices</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setView("list")} disabled={view === "list"}>List</button>
          <button className="btn btn-primary" onClick={() => { setView("upload"); setPreview(null); setPreviewFile(null); }} disabled={view === "upload"}>+ Upload</button>
          <button className="btn btn-warning" onClick={() => setView("manual")} disabled={view === "manual"}>+ Manual Entry</button>
        </div>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {view === "list" && (
        <>
          {loading ? <div>Loading...</div> : invoices.length === 0 ? (
            <div className="alert alert-info">No invoices yet. Click "+ Upload" to import one.</div>
          ) : (
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Invoice No</th>
                  <th>Date</th>
                  <th>Contractor</th>
                  <th>Site</th>
                  <th>Total</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>{inv.id}</td>
                    <td><strong>{inv.invoice_no || "-"}</strong></td>
                    <td>{inv.invoice_date || "-"}</td>
                    <td>{inv.contractor_name || "-"}</td>
                    <td>{inv.site || "-"}</td>
                    <td>{fmt(inv.total)}</td>
                    <td>{inv.item_count || 0}</td>
                    <td>{inv.status || "-"}</td>
                    <td><button className="btn" onClick={() => openInvoice(inv.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {view === "upload" && (
        <div>
          <div className="form-group">
            <label>Select PDF or Excel file</label>
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              disabled={busy}
              onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                const isPdf = /.pdf$/i.test(f.name);
                handleFile(f, isPdf ? "pdf" : "excel");
                e.target.value = "";
              }}
            />
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Or use OCR (for scanned / Arabic PDFs)</label>
            <input
              type="file"
              accept=".pdf"
              disabled={ocrBusy}
              onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                handleOcrImport(f);
                e.target.value = "";
              }}
            />
            {ocrProgress && <div style={{ marginTop: 8, color: "#2563eb" }}>{ocrProgress}</div>}
          </div>

          {busy && <div>Processing...</div>}

          {preview && (
            <div style={{ marginTop: 16 }}>
              <h3>Preview: {preview.filename}</h3>
              <div className="cards-grid" style={{ marginBottom: 12 }}>
                <div className="card"><div>Invoice No</div><b>{preview.header?.invoice_no || "-"}</b></div>
                <div className="card"><div>Date</div><b>{preview.header?.invoice_date || "-"}</b></div>
                <div className="card"><div>Site</div><b>{preview.header?.site || "-"}</b></div>
                <div className="card"><div>Subtotal</div><b>{fmt(preview.header?.subtotal)}</b></div>
                <div className="card"><div>VAT</div><b>{fmt(preview.header?.vat)}</b></div>
                <div className="card"><div>Total</div><b>{fmt(preview.header?.total)}</b></div>
                <div className="card"><div>Items</div><b>{preview.count}</b></div>
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Site (required)</label>
                <select
                  value={preview.header?.site || ""}
                  onChange={e => setPreview({ ...preview, header: { ...preview.header, site: e.target.value } })}
                >
                  <option value="">-- Select Site --</option>
                  {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>

              {preview.warnings?.length > 0 && (
                <div className="alert alert-error">
                  <b>Warnings:</b>
                  <ul>{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}

              <h4>Items Preview</h4>
              <div style={{ maxHeight: 400, overflow: "auto" }}>
                <table className="data-table" style={{ width: "100%" }}>
                  <thead>
                    <tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
                  </thead>
                  <tbody>
                    {preview.items?.slice(0, 100).map((it, i) => (
                      <tr key={i}>
                        <td>{it.line_no}</td>
                        <td>{it.description}</td>
                        <td>{it.quantity}</td>
                        <td>{fmt(it.unit_price)}</td>
                        <td>{fmt(it.total_with_vat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button className="btn btn-success" disabled={busy || !preview.valid} onClick={handleImport}>Import</button>
                <button className="btn" onClick={() => { setPreview(null); setPreviewFile(null); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "manual" && (
        <div>
          <h3>Manual Invoice Entry</h3>

          <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 12 }}>
            <div className="form-group">
              <label>Invoice No</label>
              <input value={manualForm.invoice_no} onChange={e => setManualForm({ ...manualForm, invoice_no: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={manualForm.invoice_date} onChange={e => setManualForm({ ...manualForm, invoice_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Contractor</label>
              <input value={manualForm.contractor_name} onChange={e => setManualForm({ ...manualForm, contractor_name: e.target.value })} placeholder="e.g. Raghad Al Afaq" />
            </div>
            <div className="form-group">
              <label>Site</label>
              <select value={manualForm.site} onChange={e => setManualForm({ ...manualForm, site: e.target.value })}>
                <option value="">-- Select Site --</option>
                {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Subtotal (SAR)</label>
              <input type="number" step="0.01" value={manualForm.subtotal} onChange={e => setManualForm({ ...manualForm, subtotal: Number(e.target.value) })} />
            </div>
            <div className="form-group">
              <label>VAT 15% (SAR)</label>
              <input type="number" step="0.01" value={manualForm.vat} onChange={e => setManualForm({ ...manualForm, vat: Number(e.target.value) })} />
            </div>
            <div className="form-group">
              <label>Total (SAR)</label>
              <input type="number" step="0.01" value={manualForm.total} onChange={e => setManualForm({ ...manualForm, total: Number(e.target.value) })} />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input value={manualForm.notes} onChange={e => setManualForm({ ...manualForm, notes: e.target.value })} />
            </div>
          </div>

          <h4>Items</h4>
          <table className="data-table" style={{ width: "100%", marginBottom: 12 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {manualItems.map((it, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><input value={it.description} onChange={e => {
                    const v = [...manualItems]; v[i] = { ...v[i], description: e.target.value }; setManualItems(v);
                  }} style={{ width: "100%" }} /></td>
                  <td><input type="number" step="0.01" value={it.quantity} onChange={e => {
                    const v = [...manualItems]; v[i] = { ...v[i], quantity: Number(e.target.value) }; setManualItems(v);
                  }} style={{ width: 80 }} /></td>
                  <td><input type="number" step="0.01" value={it.unit_price} onChange={e => {
                    const v = [...manualItems]; v[i] = { ...v[i], unit_price: Number(e.target.value) }; setManualItems(v);
                  }} style={{ width: 100 }} /></td>
                  <td><input type="number" step="0.01" value={it.total_with_vat} onChange={e => {
                    const v = [...manualItems]; v[i] = { ...v[i], total_with_vat: Number(e.target.value) }; setManualItems(v);
                  }} style={{ width: 100 }} /></td>
                  <td>
                    <button className="btn btn-danger" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => {
                      if (manualItems.length <= 1) return;
                      setManualItems(manualItems.filter((_, j) => j !== i));
                    }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => setManualItems([...manualItems, { description: "", quantity: 1, unit_price: 0, total_with_vat: 0 }])}>+ Add Item</button>
            <button className="btn btn-success" onClick={handleManualSave} disabled={busy}>{busy ? "Saving..." : "Save Invoice"}</button>
            <button className="btn btn-warning" onClick={() => setView("list")}>Cancel</button>
          </div>
        </div>
      )}

      {view === "detail" && selectedInvoice && (
        <div>
          <button className="btn" onClick={() => setView("list")} style={{ marginBottom: 12 }}>← Back to list</button>

          <div className="cards-grid" style={{ marginBottom: 16 }}>
            <div className="card"><div>Invoice No</div><b>{selectedInvoice.invoice_no}</b></div>
            <div className="card"><div>Date</div><b>{selectedInvoice.invoice_date || "-"}</b></div>
            <div className="card"><div>Contractor</div><b>{selectedInvoice.contractor_name || "-"}</b></div>
            <div className="card"><div>Site</div><b>{selectedInvoice.site || "-"}</b></div>
            <div className="card"><div>Total</div><b>{fmt(selectedInvoice.total)}</b></div>
            <div className="card"><div>Status</div><b>{selectedInvoice.status}</b></div>
          </div>

          <div className="form-group" style={{ marginBottom: 12, maxWidth: 400 }}>
            <label>Site</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={editSite}
                onChange={e => setEditSite(e.target.value)}
                disabled={savingSite}
                style={{ flex: 1 }}
              >
                <option value="">-- Select Site --</option>
                {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <button
                className="btn btn-success"
                disabled={savingSite || editSite === (selectedInvoice.site || "")}
                onClick={handleSaveSite}
              >
                {savingSite ? "Saving..." : "Save Site"}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
            <button className="btn" onClick={handleAutoMatch} disabled={busy}>Auto-Match</button>
            <button className="btn btn-primary" onClick={handleVerify}>Verify Total</button>
            <button className="btn btn-success" onClick={handleFinalize} disabled={selectedInvoice.status === "Finalized"}>Finalize</button>
          </div>

          {verify && (
            <div className={verify.matched ? "alert alert-success" : "alert alert-error"}>
              <b>Verification:</b> Invoice Total = {fmt(verify.invoice_total)} | Entered = {fmt(verify.entered_total)} | Difference = {fmt(verify.difference)} | Status = {verify.status}
            </div>
          )}

          <h3>Items ({invoiceItems.length})</h3>
          <div style={{ maxHeight: 600, overflow: "auto" }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Total</th>
                  <th>Match</th>
                  <th>Confirmed Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoiceItems.map(it => (
                  <tr key={it.id}>
                    <td>{it.line_no}</td>
                    <td>{it.description}</td>
                    <td>{it.quantity}</td>
                    <td>{fmt(it.unit_price)}</td>
                    <td>{fmt(it.total_with_vat)}</td>
                    <td>
                      {it.matched_request_id ? (
                        <span style={{ color: "green" }}>✓ {it.matched_request_no || "Matched"}</span>
                      ) : (
                        <span style={{ color: "#999" }}>Unmatched</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={it.confirmed_amount || 0}
                        onBlur={e => handleConfirmAmount(it.id, e.target.value)}
                        style={{ width: 100 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

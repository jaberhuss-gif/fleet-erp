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
  importOcrInvoice
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
      const r = await importInvoice(previewFile, previewFile.name.endsWith(".pdf") ? "pdf" : "excel");
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

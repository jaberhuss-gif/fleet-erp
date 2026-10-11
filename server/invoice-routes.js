import express from "express";
import Busboy from "busboy";
import pdfParse from "pdf-parse";
import ExcelJS from "exceljs";
import { query, transaction } from "./postgres.js";

/* ============================================================
   INVOICE ROUTES (Phase 3)
   - PDF import (JD-Invoice format + generic fallback)
   - Excel import
   - Matching with maintenance requests
   - Confirmation + Verification
   ============================================================ */

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const dateValue = (v) => {
  const s = clean(v);
  const m = s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  const dmy = s.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  return "";
};
const slug = (v) =>
  clean(v).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();

/* ============================================================
   PDF PARSING — JD-Invoice format
   Row layout (after pdf-parse extraction):
     #  description  location  quantity  unit_price  discount  net  total_with_vat
   Example: "1 AC Feron 1 auto 250.00 0.00 250.00 287.50"
   ============================================================ */
function extractInvoiceHeader(text) {
  const flat = clean(text);

  // Invoice number: "رقم الفاتورة: 12610003473" or "Invoice No. 26-200-000029"
  const invoiceNo =
    clean(text.match(/رقم\s*الفاتورة\s*[:#-]?\s*([A-Z0-9\-]+)/i)?.[1]) ||
    clean(text.match(/Invoice\s*No\.?\s*[:#-]?\s*([A-Z0-9\-]+)/i)?.[1]) ||
    "";

  // Invoice date: "تاريخ الفاتورة: 18:31 - 2026-10-04" or "Date 30/09/2026"
  const dateRaw =
    text.match(/تاريخ\s*الفاتورة\s*[:#-]?\s*[\d:]+\s*[-–]?\s*([\d\-\/]+)/)?.[1] ||
    text.match(/\bDate\s*[:#-]?\s*([\d\-\/]+)/i)?.[1] ||
    "";
  const invoiceDate = dateValue(dateRaw);

  // VAT number of customer (optional)
  const vatNo = clean(flat.match(/(?:الرقم\s*الضريبي|VAT)\s*[:#-]?\s*(\d{10,})/)?.[1]) || "";

  // Subtotal / VAT / Total
  const subtotal = num(flat.match(/(?:المجموع|الإجمالي\s*الفرعي|Subtotal)\s*[:#-]?\s*([\d,]+\.\d{2})/i)?.[1]);
  const vat = num(flat.match(/(?:إجمالي\s*الضريبة|VAT|ضريبة\s*القيمة\s*المضافة)\s*[:#-]?\s*([\d,]+\.\d{2})/i)?.[1]);
  const total = num(flat.match(/(?:الإجمالي\s*النهائي|Total)\s*[:#-]?\s*([\d,]+\.\d{2})/i)?.[1]);

  // Project / site
  const project = clean(flat.match(/project\s*[:#-]?\s*([A-Za-z0-9 \-]+?)(?=\s*الملاحظات|\s*Notes|$)/i)?.[1]) || "";

  // Contractor name from header (first line usually)
  const contractorName = clean(flat.match(/(JODOUD AL-KHALEEJ|Raghad Alafq|Jodoud Al Khaleej)/i)?.[1]) || "";

  return {
    invoice_no: invoiceNo,
    invoice_date: invoiceDate,
    contractor_name: contractorName,
    site: project,
    subtotal,
    vat,
    vat_percent: subtotal ? Math.round((vat / subtotal) * 100 * 100) / 100 : 15,
    total,
    vat_no: vatNo
  };
}

function extractInvoiceItems(text) {
  // Clean RTL/LTR artifacts + normalize spaces
  const source = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\r/g, "");

  const items = [];
  const lines = source.split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  // Strategy 1: line-by-line (best for JD-Invoice where each row is one line)
  // Row pattern: # description location qty unit_price discount net total
  // # = 1-4 digits, description = letters + spaces + dots, location = "auto"|"1"|"2",
  // qty = 1-4 digits, then 4 decimals, at end.
  const rowRe = /^(\d{1,4})\s+(.+?)\s+(auto|\d+)\s+(\d{1,4})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/i;

  for (const line of lines) {
    const m = line.match(rowRe);
    if (!m) continue;

    const no = Number(m[1]);
    const description = clean(m[2]);
    const location = clean(m[3]);
    const quantity = num(m[4]);
    const unit_price = num(m[5]);
    const discount_percent = num(m[6]);
    const net_amount = num(m[7]);
    const total_with_vat = num(m[8]);

    if (!description) continue;
    if (!Number.isFinite(no)) continue;

    items.push({
      line_no: no,
      description,
      unit: "",
      location,
      quantity,
      unit_price,
      discount_percent,
      net_amount,
      total_with_vat
    });
  }

  // Strategy 2: flattened fallback (if lines are not per-row)
  if (items.length < 3) {
    const flat = source.replace(/\s+/g, " ").trim();
    const re = /(?:^|\s)(\d{1,4})\s+([A-Za-z][A-Za-z0-9 &().,\/'-]{2,120}?)\s+(auto|\d+)\s+(\d{1,4})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})(?=\s+\d{1,4}\s+[A-Za-z]|\s*$)/g;
    let m;
    while ((m = re.exec(flat))) {
      const description = clean(m[2]);
      if (!description) continue;
      items.push({
        line_no: Number(m[1]),
        description,
        unit: "",
        location: clean(m[3]),
        quantity: num(m[4]),
        unit_price: num(m[5]),
        discount_percent: num(m[6]),
        net_amount: num(m[7]),
        total_with_vat: num(m[8])
      });
    }
  }

  return items;
}

async function parsePdfBuffer(buffer) {
  const parsed = await pdfParse(buffer);
  const text = parsed.text || "";
  const header = extractInvoiceHeader(text);
  const items = extractInvoiceItems(text);
  return {
    header,
    items,
    pages: parsed.numpages || 0,
    textLength: text.length
  };
}

/* ============================================================
   EXCEL PARSING — generic (header row detection)
   ============================================================ */
function detectHeaderRow(matrix) {
  const ALIASES = {
    line_no: ["#", "no", "sr", "s/n", "serial", "م", "ت"],
    description: ["description", "item", "product", "details", "الوصف", "الصنف", "البيان"],
    quantity: ["qty", "quantity", "الكمية", "كمية"],
    unit_price: ["unit price", "price", "rate", "سعر", "السعر"],
    discount_percent: ["discount", "disc%", "خصم"],
    net_amount: ["net", "subtotal", "صافي", "الصافي"],
    total_with_vat: ["total", "amount", "اجمالي", "الإجمالي"]
  };
  const key = (v) => clean(v).toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "");
  const matchAny = (v, list) => list.some(a => key(v) === key(a) || key(v).includes(key(a)));

  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(matrix.length, 50); i++) {
    const row = matrix[i] || [];
    let score = 0;
    for (const cell of row) {
      for (const aliases of Object.values(ALIASES)) {
        if (matchAny(cell, aliases)) { score++; break; }
      }
    }
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 2 ? { index: best, aliases: ALIASES } : null;
}

function parseExcelMatrix(matrix) {
  const det = detectHeaderRow(matrix);
  if (!det) return { items: [], header: null };

  const rawHeaders = (matrix[det.index] || []).map(clean);
  const key = (v) => clean(v).toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "");
  const matchAny = (v, list) => list.some(a => key(v) === key(a) || key(v).includes(key(a)));

  // Map column index -> field
  const colMap = {};
  for (let c = 0; c < rawHeaders.length; c++) {
    const h = rawHeaders[c];
    for (const [field, aliases] of Object.entries(det.aliases)) {
      if (colMap[field] !== undefined) continue;
      if (matchAny(h, aliases)) { colMap[field] = c; break; }
    }
  }

  const items = [];
  for (let r = det.index + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const description = clean(row[colMap.description]);
    if (!description) continue;
    if (/^(subtotal|total|vat|discount|المجموع|الإجمالي)/i.test(description)) continue;

    items.push({
      line_no: num(row[colMap.line_no]) || (items.length + 1),
      description,
      unit: "",
      location: "",
      quantity: num(row[colMap.quantity]) || 1,
      unit_price: num(row[colMap.unit_price]),
      discount_percent: num(row[colMap.discount_percent]),
      net_amount: num(row[colMap.net_amount]),
      total_with_vat: num(row[colMap.total_with_vat])
    });
  }

  const header = {
    invoice_no: "",
    invoice_date: "",
    contractor_name: "",
    site: "",
    subtotal: items.reduce((s, x) => s + (x.net_amount || 0), 0),
    vat: items.reduce((s, x) => s + Math.max(0, (x.total_with_vat || 0) - (x.net_amount || 0)), 0),
    vat_percent: 15,
    total: items.reduce((s, x) => s + (x.total_with_vat || 0), 0)
  };

  return { items, header };
}

async function parseExcelBuffer(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const matrix = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      let v = cell.value;
      if (v && typeof v === "object" && v.text) v = v.text;
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      values.push(v ?? "");
    });
    matrix.push(values);
  });
  return parseExcelMatrix(matrix);
}

/* ============================================================
   FILE READING HELPERS (Busboy)
   ============================================================ */
function readUpload(req, options = {}) {
  const maxSize = options.maxSize || 25 * 1024 * 1024;
  const allowedExt = options.allowedExt || /\.(pdf|xlsx|xls|csv)$/i;
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: maxSize } });
    const chunks = [];
    let filename = "", mime = "", seen = false;
    bb.on("file", (_field, file, info) => {
      seen = true;
      filename = info.filename || "upload";
      mime = info.mimeType || "";
      file.on("data", (c) => chunks.push(c));
      file.on("limit", () => reject(new Error("File is larger than " + (maxSize / 1024 / 1024) + " MB")));
    });
    bb.on("error", reject);
    bb.on("finish", () => {
      if (!seen) return reject(new Error("Please select a file"));
      if (!allowedExt.test(filename)) return reject(new Error("Unsupported file type: " + filename));
      resolve({ buffer: Buffer.concat(chunks), filename, mime });
    });
    req.pipe(bb);
  });
}

/* ============================================================
   PUBLIC API
   ============================================================ */
export function mountInvoiceRoutes(app) {
  const router = express.Router();

  /* --- PDF preview --- */
  router.post("/import-pdf/preview", async (req, res) => {
    try {
      const { buffer, filename } = await readUpload(req, { allowedExt: /\.pdf$/i });
      const parsed = await parsePdfBuffer(buffer);
      const warnings = [];
      if (!parsed.header.invoice_no) warnings.push("Invoice number not detected");
      if (!parsed.header.invoice_date) warnings.push("Invoice date not detected");
      if (!parsed.items.length) warnings.push("No line items detected");
      const hasPrices = parsed.items.some(x => x.unit_price > 0);
      if (!hasPrices && parsed.items.length) warnings.push("No unit prices detected — manual entry required");

      res.json({
        success: true,
        filename,
        pages: parsed.pages,
        textLength: parsed.textLength,
        header: parsed.header,
        items: parsed.items,
        count: parsed.items.length,
        warnings,
        valid: parsed.items.length > 0 && !!parsed.header.total
      });
    } catch (e) {
      console.error("[InvoiceRoutes:pdf-preview]", e);
      res.status(400).json({ success: false, error: e.message });
    }
  });

  /* --- Excel preview --- */
  router.post("/import-excel/preview", async (req, res) => {
    try {
      const { buffer, filename } = await readUpload(req, { allowedExt: /\.(xlsx|xls|csv)$/i });
      const parsed = await parseExcelBuffer(buffer);
      const warnings = [];
      if (!parsed.items.length) warnings.push("No line items detected");
      const hasPrices = parsed.items.some(x => x.unit_price > 0);
      if (!hasPrices && parsed.items.length) warnings.push("No unit prices detected — manual entry required");

      res.json({
        success: true,
        filename,
        header: parsed.header,
        items: parsed.items,
        count: parsed.items.length,
        warnings,
        valid: parsed.items.length > 0
      });
    } catch (e) {
      console.error("[InvoiceRoutes:excel-preview]", e);
      res.status(400).json({ success: false, error: e.message });
    }
  });

  app.use("/api/invoices", router);
}

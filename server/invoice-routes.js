import express from "express";
import Busboy from "busboy";
import pdfParse from "pdf-parse";
import ExcelJS from "exceljs";
import { query, transaction } from "./postgres.js";

/* ============================================================
   INVOICE ROUTES (Phase 3) - Jodoud Al Khaleej format
   ============================================================ */

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const dateValue = (v) => {
  const s = clean(v);
  const iso = s.match(/(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
  if (iso) return iso[1] + "-" + String(iso[2]).padStart(2, "0") + "-" + String(iso[3]).padStart(2, "0");
  const dmy = s.match(/(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})/);
  if (dmy) return dmy[3] + "-" + String(dmy[2]).padStart(2, "0") + "-" + String(dmy[1]).padStart(2, "0");
  return "";
};

/* ============================================================
   TRANSLATION (Arabic -> English) via MyMemory API
   ============================================================ */
const translationCache = new Map();
const ARABIC_RE = /[\u0600-\u06FF]/;

async function translateToEnglish(text) {
  const original = clean(text);
  if (!original) return original;
  if (!ARABIC_RE.test(original)) return original;
  if (translationCache.has(original)) return translationCache.get(original);

  try {
    const url = "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(original.slice(0, 500)) +
      "&langpair=ar|en";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      translationCache.set(original, original);
      return original;
    }
    const data = await res.json();
    const translated = clean(data?.responseData?.translatedText || "");
    const result = translated && translated !== original ? translated : original;
    translationCache.set(original, result);
    return result;
  } catch (e) {
    console.error("[Translate] failed:", e.message);
    translationCache.set(original, original);
    return original;
  }
}

async function translateItemDescriptions(items) {
  const out = [];
  for (const it of items) {
    const translated = await translateToEnglish(it.description);
    out.push({ ...it, description: translated });
  }
  return out;
}

/* ============================================================
   HEADER EXTRACTION (Jodoud format)
   Numbers appear BEFORE their Arabic label in the extracted text.
   ============================================================ */
export function detectInvoiceType(text) {
  if (/JODOUD AL-KHALEEJ/i.test(text)) return "JODOUD";
  if (/Invoice No\.\s*\d+-\d+-\d+/i.test(text)) return "GENERIC_AR";
  return "UNKNOWN";
}

/* ============================================================
   JODOUD header extraction
   ============================================================ */
function extractJodoudHeader(text) {
  const flat = clean(text);

  const invoiceNo = clean(
    text.match(/\u0631\u0642\u0645\s*\u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629\s*[:#-]?\s*([A-Z0-9\-]+)/i)?.[1] ||
    text.match(/Invoice\s*No\.?\s*[:#-]?\s*([A-Z0-9\-]+)/i)?.[1] ||
    ""
  );

  const dateMatch = text.match(/\u062a\u0627\u0631\u064a\u062e\s*\u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629\s*[:#-]?\s*[\d:]+\s*[-]?\s*([\d\-\/]+)/) ||
                     text.match(/(\d{4}-\d{2}-\d{2})/);
  const invoiceDate = dateValue(dateMatch?.[1] || "");

  const contractorName = clean(flat.match(/(JODOUD AL-KHALEEJ|Jodoud Al Khaleej)/i)?.[1]) || "";

  const siteMatch = flat.match(/project\s*[:#\-\s]+([A-Za-z0-9 \-]+)/i);
  const site = clean(siteMatch?.[1]) || "";

  const subtotalMatch =
    flat.match(/([\d,]+\.\d{2})\s*\u0627\u0644\u0645\u062c\u0645\u0648\u0639(?:\s|$|\u0635|\u0627)/) ||
    flat.match(/([\d,]+\.\d{2})\s*\u0627\u0644\u0645\u062c\u0645\u0648\u0639/) ||
    flat.match(/\u0627\u0644\u0645\u062c\u0645\u0648\u0639\s*([\d,]+\.\d{2})/);
  const subtotal = num(subtotalMatch?.[1]);

  const vatMatch =
    flat.match(/\u0636\u0631\u064a\u0628\u0629\s*\u0627\u0644\u0642\u064a\u0645\u0629\s*\u0627\u0644\u0645\u0636\u0627\u0641\u0629[^\d]*?(\d{2,3}\.\d{2})/) ||
    flat.match(/(?:VAT|\u0636\u0631\u064a\u0628\u0629)[^\d]*?SAR[^\d]*?([\d,]+\.\d{2})/i);
  const vat = num(vatMatch?.[1]);

  const totalMatch =
    flat.match(/([\d,]+\.\d{2})\s*\u0627\u0644[\u0625\u0627]\u062c\u0645\u0627\u0644\u064a\s*\u0627\u0644\u0646[\u0647\u06be]\u0627\u0626\u064a/) ||
    flat.match(/\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a\s*\u0627\u0644\u0646\u0647\u0627\u0626\u064a[^\d]*?([\d,]+\.\d{2})/);
  const total = num(totalMatch?.[1]);

  return {
    invoice_no: invoiceNo,
    invoice_date: invoiceDate,
    contractor_name: contractorName || "JODOUD AL-KHALEEJ",
    site,
    subtotal,
    vat,
    vat_percent: subtotal ? Math.round((vat / subtotal) * 100 * 100) / 100 : 15,
    total
  };
}

/* ============================================================
   GENERIC_AR header extraction
   For invoices like "26-200-000029":
     Invoice No. 26-200-000029  Date 30/09/2026
     Subtotal: SAR 2,165.00
     VAT 15%: SAR 324.75
     Total: SAR 2,489.75
   ============================================================ */
function extractGenericArHeader(text) {
  const flat = clean(text);

  const invoiceNoMatch = text.match(/Invoice\s*No\.?\s*([\d\-]+)/i);
  const invoiceNo = clean(invoiceNoMatch?.[1]) || "";

  const dateMatch = text.match(/Date\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
  const invoiceDate = dateValue(dateMatch?.[1] || "");

  const subcontractorMatch = flat.match(/\u0634\u0631\u0643\u0629\s+([\u0600-\u06FF\s]+?)\s+\u0627\u0644\u0631\u0642\u0645/);
  const siteMatch = flat.match(/(?:Bill to|العمل)\s+([\u0600-\u06FF\s]+?)\s+\u0627\u0644\u0631\u0642\u0645/);
  const customerMatch = flat.match(/(\u0634\u0631\u0643\u0629\s+\u0645\u0639\u0627\u062f\u0646[\u0600-\u06FF\s]*)/);

  // Subtotal: SAR 2,165.00
  const subtotalMatch = flat.match(/Subtotal[:\s]*\s*SAR\s*([\d,]+\.\d{2})/i);
  const subtotal = num(subtotalMatch?.[1]);

  // VAT: SAR 324.75  (with 15% nearby)
  const vatMatch = flat.match(/(?:VAT|\u0636\u0631\u064a\u0628\u0629)[^\d]*?SAR\s*([\d,]+\.\d{2})/i);
  const vat = num(vatMatch?.[1]);

  // Total: SAR 2,489.75
  const totalMatch = flat.match(/(?:Total|\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a)[^\d]*?SAR\s*([\d,]+\.\d{2})/i);
  const total = num(totalMatch?.[1]);

  const site = clean(siteMatch?.[1]) || clean(customerMatch?.[1]) || "";

  return {
    invoice_no: invoiceNo,
    invoice_date: invoiceDate,
    contractor_name: "Ivanhoe Supplier",
    site,
    subtotal,
    vat,
    vat_percent: subtotal ? Math.round((vat / subtotal) * 100 * 100) / 100 : 15,
    total
  };
}

/* ============================================================
   Dispatcher: Header
   ============================================================ */
export function extractInvoiceHeader(text) {
  const type = detectInvoiceType(text);
  if (type === "JODOUD") return extractJodoudHeader(text);
  if (type === "GENERIC_AR") return extractGenericArHeader(text);
  return extractJodoudHeader(text);
}

/* ============================================================
   JODOUD items extraction
   Row: {total}{net}{discount}{price}{qty}[auto]{description}{item_no}{#}
   ============================================================ */
function extractJodoudItems(text) {
  const source = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\r/g, "");

  const itemsStart = source.search(/\d+\.\d{2}\d+\.\d{2}\d+\.\d{2}\d+\.\d{2}\d+/);
  const totalsMarker = source.search(/([\d,]+\.\d{2})\s*\u0627\u0644\u0645\u062c\u0645\u0648\u0639/);
  const itemsRegion = itemsStart >= 0
    ? source.slice(itemsStart, totalsMarker > 0 ? totalsMarker : undefined)
    : source;

  const flat = itemsRegion.replace(/[\n\r]+/g, " ").replace(/\s{2,}/g, " ");

  const rowRe = /(\d+\.\d{2})(\d+\.\d{2})(\d+\.\d{2})(\d+\.\d{2})(\d+)(auto)?([A-Za-z][A-Za-z0-9 &().,'\/\-]*?)(\d{1,4})(\d{1,3})(?= \d+\.\d{2}|$)/g;

  const items = [];
  let m;
  while ((m = rowRe.exec(flat))) {
    const total = num(m[1]);
    const net = num(m[2]);
    const discount = num(m[3]);
    const price = num(m[4]);
    const qty = num(m[5]);
    const description = clean(m[7]).replace(/^auto\s+/i, "");
    const itemNo = num(m[8]);
    const lineNo = num(m[9]);

    if (!description || qty <= 0) continue;
    if (price <= 0 && total <= 0) continue;
    if (description.length > 200) continue;
    if (!/[A-Za-z]/.test(description)) continue;

    items.push({
      line_no: lineNo,
      item_no: itemNo,
      description,
      unit: "",
      location: "",
      quantity: qty,
      unit_price: price,
      discount_percent: discount,
      net_amount: net,
      total_with_vat: total
    });
  }

  return items;
}

/* ============================================================
   GENERIC_AR items extraction
   For "26-200-000029" style: Arabic descriptions + qty only.
   Row pattern (from PDF table):
     {#}{description}{qty}
   Example: "1لمبة جبس مقاس 204"
            "2لمبة خارجي دائر3"
   ============================================================ */
function extractGenericArItems(text) {
  const source = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\r/g, "");

  // Isolate items region: between "العمل" and "الإجمالي الفرعي"
  const itemsStart = source.search(/\u0627\u0644\u0639\u0645\u0644/);
  const itemsEnd = source.search(/\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a\s*\u0627\u0644\u0641\u0631\u0639\u064a/);
  const region = itemsStart >= 0
    ? source.slice(itemsStart, itemsEnd > 0 ? itemsEnd : undefined)
    : source;

  // Flatten
  const flat = region.replace(/[\n\r]+/g, "").replace(/\s{2,}/g, " ").trim();

  // Each row: {#}{description}{qty}
  // # = 1-3 digits at start, description = Arabic + digits + spaces, qty = 1-3 digits at end.
  const rowRe = /(\d{1,3})([\u0600-\u06FF][\u0600-\u06FF\s\d\u060C.,()\-]*?)(\d{1,3})(?=\d{1,3}[\u0600-\u06FF]|$)/g;

  const items = [];
  let m;
  let idx = 0;
  while ((m = rowRe.exec(flat))) {
    idx++;
    const lineNo = num(m[1]);
    const description = clean(m[2]);
    const qty = num(m[3]);

    if (!description || qty <= 0) continue;
    if (description.length > 200) continue;

    items.push({
      line_no: lineNo || idx,
      item_no: idx,
      description,
      unit: "",
      location: "",
      quantity: qty,
      unit_price: 0,
      discount_percent: 0,
      net_amount: 0,
      total_with_vat: 0
    });
  }

  return items;
}

/* ============================================================
   Dispatcher: Items
   ============================================================ */
export function extractInvoiceItems(text) {
  const type = detectInvoiceType(text);
  if (type === "JODOUD") return extractJodoudItems(text);
  if (type === "GENERIC_AR") return extractGenericArItems(text);
  return extractJodoudItems(text);
}

/* ============================================================
   OCR TEXT PARSER (Frontend Tesseract output)
   ============================================================ */
export function parseOcrText(text) {
  const source = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/===PAGE_BREAK===/g, "\n");

  const flat = clean(source);

  // --- Header ---
  const invoiceNoMatch =
    source.match(/Invoice\s*No\.?\s*[:#-]?\s*([\d\-]+)/i) ||
    source.match(/\u0631\u0642\u0645\s*\u0627\u0644\u0645\u0633\u062a\u0646\u062f\s*[:#-]?\s*([\d\-]+)/) ||
    source.match(/(\d{2}-\d{3}-\d{6})/);
  const invoice_no = clean(invoiceNoMatch?.[1]) || "";

  const dateMatch =
    source.match(/Date\s*[:#-]?\s*(\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4})/i) ||
    source.match(/\u0627\u0644\u062a\u0627\u0631\u064a\u062e\s*[:#-]?\s*(\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4})/);
  const invoice_date = dateValue(dateMatch?.[1] || "");

  // VAT: "ضريبة القيمة المضافة 9615 324.75 SAR" or "VAT 15% SAR 324.75"
  const vatMatch =
    flat.match(/(?:VAT|\u0636\u0631\u064a\u0628\u0629\s*\u0627\u0644\u0642\u064a\u0645\u0629\s*\u0627\u0644\u0645\u0636\u0627\u0641\u0629)[^\d]*?([\d,]+\.\d{2})/i) ||
    flat.match(/\u0636\u0631\u064a\u0628\u0629[^\d]*?([\d,]+\.\d{2})/);
  const vat = num(vatMatch?.[1]);

  // Subtotal: "الإجمالي الفرعي" — typically comes BEFORE VAT
  const subtotalMatch =
    flat.match(/\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a\s*\u0627\u0644\u0641\u0631\u0639\u064a[^\d]*?([\d,]+\.\d{2})/) ||
    flat.match(/(?:Subtotal|Total\s*without)[^\d]*?([\d,]+\.\d{2})/i);
  const subtotal = num(subtotalMatch?.[1]);

  // Total: "الإجمالي" but may be corrupted. Try subtotal + vat if missing
  const totalMatch =
    flat.match(/\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a\s+(?:SAR\s+)?([\d,]+\.\d{2})/i) ||
    flat.match(/(?:Total|Grand)[^\d]*?SAR[^\d]*?([\d,]+\.\d{2})/i);
  let total = num(totalMatch?.[1]);
  if (!total && subtotal && vat) total = Math.round((subtotal + vat) * 100) / 100;

  // Try to detect subtotal as (total - vat) if subtotal is 0
  let computedSubtotal = subtotal;
  if (!computedSubtotal && total && vat) computedSubtotal = Math.round((total - vat) * 100) / 100;

  const header = {
    invoice_no,
    invoice_date,
    contractor_name: "Raghad Al Afaq",
    site: "",
    subtotal: computedSubtotal,
    vat,
    vat_percent: 15,
    total
  };

  // --- Items ---
  // Tesseract output has RTL issues. We look for rows matching:
  //   [#] [desc] [qty] [unit_price?] [tax%] [discount] [total]
  // With flexibility: unit_price may be 0 or missing, tax may appear as %15 or 15%, discount as %0.00.
  const lines = source.split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const items = [];
  let idx = 0;

  const skipPatterns = [
    /^JODOUD/i, /^Branch/i, /^Mobile/i, /^VAT Number/i, /^CR\/License/i,
    /^\u0627\u0644\u0631\u0642\u0645\s*\u0627\u0644\u0648\u0637\u0646\u064a/,
    /^\u0634\u0627\u0631\u0639/, /^\u0645\u0624\u0633\u0633\u0629/, /^\u0641\u0627\u062a\u0648\u0631\u0629/,
    /^ECI/i, /^Tax No/i, /^Bill to/i, /^\u0634\u0631\u0643\u0629/, /^\u0627\u0644\u0639\u0645\u064a\u0644/,
    /^Invoice No/i, /^Date/i, /^Due date/i, /^Payment status/i,
    /^\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a/i, /^Eotol/i, /^Total/i, /^Subtotal/i,
    /^VAT/i, /^\u0627\u0644\u0636\u0631\u064a\u0628\u0629/i,
    /^#/, /^\u0627\u0644\u0635\u0646\u0641/, /^\u0627\u0644\u0643\u0645\u064a\u0629/, /^\u0633\u0639\u0631/,
    /^\u0627\u0644\u062e\u0635\u0645/, /^\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a/,
    /^RCS/i, /^Rtt/i, /^SAR/i, /^\u0627\u0644\u0635\u0641\u062d\u0629/, /^Created with/i, /^Aronium/i,
    /^Page/i, /^CE Fal/i, /^A oa/i, /^aH\]/i, /^I aml/i
  ];

  const isNoise = (line) => {
    if (!line) return true;
    if (skipPatterns.some(p => p.test(line))) return true;
    return false;
  };

  // Flexible pattern for items:
  // [#] [desc] [qty] [unit_price OR 0] [%tax] [%discount] [total]
  // Tax and discount may appear BEFORE their values.
  const rowRe = /^(\d{1,3})\s+(.+?)\s+(\d{1,3})\s+([\d,]+\.\d{2}|0)\s+%(\d{1,3})\s+%([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;

  for (const line of lines) {
    if (isNoise(line)) continue;
    const m = line.match(rowRe);
    if (!m) continue;
    const lineNo = Number(m[1]);
    const description = clean(m[2]);
    const qty = Number(m[3]);
    const unit_price = num(m[4]);
    const tax_pct = Number(m[5]);
    const discount = num(m[6]);
    const total_with_vat = num(m[7]);

    if (!description || qty <= 0) continue;
    if (description.length > 200) continue;

    items.push({
      line_no: lineNo,
      item_no: idx + 1,
      description,
      unit: "",
      location: "",
      quantity: qty,
      unit_price: unit_price || 0,
      discount_percent: discount,
      net_amount: total_with_vat,
      total_with_vat,
      tax_percent: tax_pct
    });
    idx++;
  }

  // Fallback: pattern without tax/discount prefixes
  if (items.length < 3) {
    const rowRe2 = /^(\d{1,3})\s+(.+?)\s+(\d{1,3})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;
    for (const line of lines) {
      if (isNoise(line)) continue;
      const m = line.match(rowRe2);
      if (!m) continue;
      const lineNo = Number(m[1]);
      const description = clean(m[2]);
      const qty = Number(m[3]);
      const unit_price = num(m[4]);
      const total_with_vat = num(m[5]);
      if (!description || qty <= 0) continue;
      items.push({
        line_no: lineNo,
        item_no: idx + 1,
        description,
        unit: "",
        location: "",
        quantity: qty,
        unit_price,
        discount_percent: 0,
        net_amount: total_with_vat,
        total_with_vat,
        tax_percent: 15
      });
      idx++;
    }
  }

  return { header, items };
}

async function parsePdfBuffer(buffer, options = {}) {
  const parsed = await pdfParse(buffer);
  const text = parsed.text || "";
  const header = extractInvoiceHeader(text);
  let items = extractInvoiceItems(text);
  if (options.translate !== false) {
    items = await translateItemDescriptions(items);
  }
  return {
    header,
    items,
    pages: parsed.numpages || 0,
    textLength: text.length
  };
}

/* ============================================================
   EXCEL PARSING
   ============================================================ */
function detectHeaderRow(matrix) {
  const ALIASES = {
    line_no: ["#", "no", "sr", "s/n", "serial"],
    item_no: ["item no", "item_no", "item#", "code"],
    description: ["description", "item", "product", "details", "\u0627\u0644\u0628\u0646\u062f", "\u0627\u0644\u0648\u0635\u0641"],
    quantity: ["qty", "quantity", "\u0627\u0644\u0643\u0645\u064a\u0629"],
    unit_price: ["unit price", "price", "rate", "\u0627\u0644\u0633\u0639\u0631"],
    discount_percent: ["discount", "disc%", "\u062e\u0635\u0645"],
    net_amount: ["net", "subtotal", "\u0627\u0644\u0635\u0627\u0641\u064a"],
    total_with_vat: ["total", "amount", "\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a"]
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

  const colMap = {};
  for (let c = 0; c < rawHeaders.length; c++) {
    for (const [field, aliases] of Object.entries(det.aliases)) {
      if (colMap[field] !== undefined) continue;
      if (matchAny(rawHeaders[c], aliases)) { colMap[field] = c; break; }
    }
  }

  const items = [];
  for (let r = det.index + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const description = clean(row[colMap.description]);
    if (!description) continue;
    if (/^(subtotal|total|vat|discount)/i.test(description)) continue;
    items.push({
      line_no: num(row[colMap.line_no]) || (items.length + 1),
      item_no: num(row[colMap.item_no]) || (items.length + 1),
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

async function parseExcelBuffer(buffer, options = {}) {
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
  const parsed = parseExcelMatrix(matrix);
  if (options.translate !== false && parsed.items.length) {
    parsed.items = await translateItemDescriptions(parsed.items);
  }
  return parsed;
}

/* ============================================================
   FILE READER
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

  router.post("/import-pdf/preview", async (req, res) => {
    try {
      const { buffer, filename } = await readUpload(req, { allowedExt: /\.pdf$/i });
      const parsed = await parsePdfBuffer(buffer);
      const warnings = [];
      if (!parsed.header.invoice_no) warnings.push("Invoice number not detected");
      if (!parsed.header.invoice_date) warnings.push("Invoice date not detected");
      if (!parsed.items.length) warnings.push("No line items detected");
      if (!parsed.header.total) warnings.push("Invoice total not detected");

      res.json({
        success: true,
        filename,
        pages: parsed.pages,
        textLength: parsed.textLength,
        header: parsed.header,
        items: parsed.items,
        count: parsed.items.length,
        warnings,
        valid: parsed.items.length > 0
      });
    } catch (e) {
      console.error("[InvoiceRoutes:pdf-preview]", e);
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post("/import-excel/preview", async (req, res) => {
    try {
      const { buffer, filename } = await readUpload(req, { allowedExt: /\.(xlsx|xls|csv)$/i });
      const parsed = await parseExcelBuffer(buffer);
      const warnings = [];
      if (!parsed.items.length) warnings.push("No line items detected");

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

  router.post("/import-pdf", async (req, res) => {
    try {
      const { buffer, filename } = await readUpload(req, { allowedExt: /\.pdf$/i });
      const parsed = await parsePdfBuffer(buffer);
      if (!parsed.items.length) return res.status(400).json({ success: false, error: "No line items detected." });

      const h = parsed.header;
      const headerSite = String(req.headers["x-invoice-site"] || "").trim();
      if (headerSite) h.site = headerSite;
      const importedBy = req.user?.full_name || req.user?.username || "system";

      const result = await transaction(async (client) => {
        const invRes = await client.query(
          "INSERT INTO invoices (invoice_no, invoice_date, contractor_name, site, subtotal, vat, vat_percent, total, source_file, source_type, imported_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Imported') RETURNING *",
          [h.invoice_no || null, h.invoice_date || null, h.contractor_name || null, h.site || null, h.subtotal || 0, h.vat || 0, h.vat_percent || 15, h.total || 0, filename, "PDF", importedBy]
        );
        const invoice = invRes.rows[0];
        const items = [];
        for (const it of parsed.items) {
          const r = await client.query(
            "INSERT INTO invoice_items (invoice_id, line_no, description, unit, quantity, unit_price, discount_percent, net_amount, total_with_vat, confirmed_amount, match_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'Unmatched') RETURNING *",
            [invoice.id, it.line_no || null, it.description || "", it.unit || "", it.quantity || 1, it.unit_price || 0, it.discount_percent || 0, it.net_amount || 0, it.net_amount || 0]
          );
          items.push(r.rows[0]);
        }
        return { invoice, items };
      });

      res.status(201).json({ success: true, message: "Invoice imported.", invoice: result.invoice, items: result.items, count: result.items.length });
    } catch (e) {
      console.error("[InvoiceRoutes:import-pdf]", e);
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post("/import-excel", async (req, res) => {
    try {
      const { buffer, filename } = await readUpload(req, { allowedExt: /\.(xlsx|xls|csv)$/i });
      const parsed = await parseExcelBuffer(buffer);
      if (!parsed.items.length) return res.status(400).json({ success: false, error: "No line items detected." });

      const h = parsed.header || {};
      const importedBy = req.user?.full_name || req.user?.username || "system";

      const result = await transaction(async (client) => {
        const invRes = await client.query(
          "INSERT INTO invoices (invoice_no, invoice_date, contractor_name, site, subtotal, vat, vat_percent, total, source_file, source_type, imported_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Excel',$10,'Imported') RETURNING *",
          [h.invoice_no || null, h.invoice_date || null, h.contractor_name || null, h.site || null, h.subtotal || 0, h.vat || 0, h.vat_percent || 15, h.total || 0, filename, importedBy]
        );
        const invoice = invRes.rows[0];
        const items = [];
        for (const it of parsed.items) {
          const r = await client.query(
            "INSERT INTO invoice_items (invoice_id, line_no, description, unit, quantity, unit_price, discount_percent, net_amount, total_with_vat, confirmed_amount, match_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'Unmatched') RETURNING *",
            [invoice.id, it.line_no || null, it.description || "", it.unit || "", it.quantity || 1, it.unit_price || 0, it.discount_percent || 0, it.net_amount || 0, it.net_amount || 0]
          );
          items.push(r.rows[0]);
        }
        return { invoice, items };
      });

      res.status(201).json({ success: true, message: "Invoice imported from Excel.", invoice: result.invoice, items: result.items, count: result.items.length });
    } catch (e) {
      console.error("[InvoiceRoutes:import-excel]", e);
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.get("/", async (req, res) => {
    try {
      const r = await query("SELECT i.*, (SELECT COUNT(*)::int FROM invoice_items WHERE invoice_id = i.id) AS item_count, (SELECT COUNT(*)::int FROM invoice_items WHERE invoice_id = i.id AND match_status = 'Matched') AS matched_count, (SELECT COUNT(*)::int FROM invoice_items WHERE invoice_id = i.id AND match_status = 'Unmatched') AS unmatched_count FROM invoices i WHERE i.archived_at IS NULL ORDER BY i.imported_at DESC, i.id DESC LIMIT 500");
      res.json({ success: true, invoices: r.rows });
    } catch (e) {
      console.error("[InvoiceRoutes:list]", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: "Invalid ID" });
      const inv = await query("SELECT * FROM invoices WHERE id = $1", [id]);
      if (!inv.rows[0]) return res.status(404).json({ success: false, error: "Invoice not found" });
      const items = await query("SELECT ii.*, mr.request_no AS matched_request_no, mr.site AS matched_request_site, mri.description AS matched_item_description FROM invoice_items ii LEFT JOIN maintenance_requests mr ON mr.id = ii.matched_request_id LEFT JOIN maintenance_request_items mri ON mri.id = ii.matched_request_item_id WHERE ii.invoice_id = $1 ORDER BY ii.line_no ASC, ii.id ASC", [id]);
      res.json({ success: true, invoice: inv.rows[0], items: items.rows });
    } catch (e) {
      console.error("[InvoiceRoutes:get]", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /* --- Auto-match: suggest matches by text similarity --- */
  router.post("/:id/auto-match", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: "Invalid ID" });

      const inv = await query("SELECT * FROM invoices WHERE id = $1", [id]);
      if (!inv.rows[0]) return res.status(404).json({ success: false, error: "Invoice not found" });

      const items = (await query("SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY line_no ASC, id ASC", [id])).rows;

      const openCards = (await query(`
        SELECT mr.id AS request_id, mr.request_no, mr.site, mr.status,
               mri.id AS item_id, mri.description AS item_description, mri.line_no
        FROM maintenance_requests mr
        JOIN maintenance_request_items mri ON mri.request_id = mr.id
        WHERE mr.status NOT IN ('Closed', 'Operationally Completed')
      `)).rows;

      const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      const suggest = (a, b) => {
        const A = norm(a), B = norm(b);
        if (!A || !B) return 0;
        if (A === B) return 1;
        if (A.includes(B) || B.includes(A)) return 0.85;
        const tokensA = new Set(A.match(/.{3,}/g) || []);
        const tokensB = new Set(B.match(/.{3,}/g) || []);
        let common = 0;
        for (const t of tokensA) if (tokensB.has(t)) common++;
        const max = Math.max(tokensA.size, tokensB.size) || 1;
        return common / max;
      };

      const results = items.map(it => {
        const scored = openCards.map(c => ({
          request_id: c.request_id,
          request_no: c.request_no,
          request_site: c.site,
          item_id: c.item_id,
          item_description: c.item_description,
          score: suggest(it.description, c.item_description)
        })).sort((a, b) => b.score - a.score);
        return {
          invoice_item_id: it.id,
          description: it.description,
          current_match_status: it.match_status,
          current_request_id: it.matched_request_id,
          suggestions: scored.slice(0, 3)
        };
      });

      res.json({ success: true, invoice_id: id, items: results });
    } catch (e) {
      console.error("[InvoiceRoutes:auto-match]", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /* --- Match invoice item to a card item --- */
  router.post("/:id/match", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: "Invalid ID" });

      const { invoice_item_id, request_id, request_item_id } = req.body || {};
      if (!invoice_item_id) return res.status(400).json({ success: false, error: "invoice_item_id required" });

      const itemRes = await query("SELECT * FROM invoice_items WHERE id = $1 AND invoice_id = $2", [invoice_item_id, id]);
      if (!itemRes.rows[0]) return res.status(404).json({ success: false, error: "Invoice item not found" });

      if (!request_id || !request_item_id) {
        await query(
          "UPDATE invoice_items SET matched_request_id=NULL, matched_request_item_id=NULL, match_status='Unmatched', updated_at=CURRENT_TIMESTAMP WHERE id=$1",
          [invoice_item_id]
        );
        return res.json({ success: true, message: "Unmatched" });
      }

      const cardRes = await query("SELECT * FROM maintenance_requests WHERE id = $1", [request_id]);
      if (!cardRes.rows[0]) return res.status(404).json({ success: false, error: "Maintenance request not found" });

      const cardItemRes = await query("SELECT * FROM maintenance_request_items WHERE id = $1 AND request_id = $2", [request_item_id, request_id]);
      if (!cardItemRes.rows[0]) return res.status(404).json({ success: false, error: "Card item not found" });

      await query(
        "UPDATE invoice_items SET matched_request_id=$1, matched_request_item_id=$2, match_status='Matched', updated_at=CURRENT_TIMESTAMP WHERE id=$3",
        [request_id, request_item_id, invoice_item_id]
      );

      // Auto-close card item
      await query(
        "UPDATE maintenance_request_items SET status='Completed', closed_at=CURRENT_TIMESTAMP, invoice_item_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2",
        [invoice_item_id, request_item_id]
      );

      res.json({ success: true, message: "Matched" });
    } catch (e) {
      console.error("[InvoiceRoutes:match]", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /* --- Confirm amount for invoice item --- */
  router.put("/items/:itemId/confirm-amount", async (req, res) => {
    try {
      const itemId = Number(req.params.itemId);
      if (!Number.isFinite(itemId)) return res.status(400).json({ success: false, error: "Invalid ID" });

      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ success: false, error: "amount must be a non-negative number" });
      }

      const result = await query(
        "UPDATE invoice_items SET confirmed_amount=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *",
        [amount, itemId]
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, error: "Invoice item not found" });

      res.json({ success: true, item: result.rows[0] });
    } catch (e) {
      console.error("[InvoiceRoutes:confirm-amount]", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /* --- Verify total: sum of confirmed amounts vs invoice total --- */
  router.get("/:id/verify-total", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: "Invalid ID" });

      const inv = await query("SELECT * FROM invoices WHERE id = $1", [id]);
      if (!inv.rows[0]) return res.status(404).json({ success: false, error: "Invoice not found" });

      const sum = await query(
        "SELECT COALESCE(SUM(confirmed_amount),0) AS total FROM invoice_items WHERE invoice_id = $1",
        [id]
      );
      const enteredTotal = Number(sum.rows[0].total || 0);
      const invoiceTotal = Number(inv.rows[0].total || 0);
      const diff = Math.round((enteredTotal - invoiceTotal) * 100) / 100;

      res.json({
        success: true,
        invoice_id: id,
        invoice_total: invoiceTotal,
        entered_total: enteredTotal,
        difference: diff,
        matched: diff === 0,
        status: diff === 0 ? "matched" : (diff < 0 ? "less" : "more")
      });
    } catch (e) {
      console.error("[InvoiceRoutes:verify-total]", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /* --- Finalize invoice: verify + close --- */
  router.post("/:id/finalize", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: "Invalid ID" });

      const inv = await query("SELECT * FROM invoices WHERE id = $1", [id]);
      if (!inv.rows[0]) return res.status(404).json({ success: false, error: "Invoice not found" });

      const sum = await query(
        "SELECT COALESCE(SUM(confirmed_amount),0) AS total FROM invoice_items WHERE invoice_id = $1",
        [id]
      );
      const enteredTotal = Number(sum.rows[0].total || 0);
      const invoiceTotal = Number(inv.rows[0].total || 0);
      const diff = Math.round((enteredTotal - invoiceTotal) * 100) / 100;

      if (diff !== 0) {
        return res.status(400).json({
          success: false,
          error: "Total mismatch. Confirmed total does not equal invoice total.",
          difference: diff,
          entered_total: enteredTotal,
          invoice_total: invoiceTotal
        });
      }

      await query("UPDATE invoices SET status='Finalized', updated_at=CURRENT_TIMESTAMP WHERE id=$1", [id]);
      res.json({ success: true, message: "Invoice finalized.", invoice_id: id });
    } catch (e) {
      console.error("[InvoiceRoutes:finalize]", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /* --- Import via OCR text (from frontend Tesseract) --- */
  router.post("/import-ocr", async (req, res) => {
    try {
      const { text, filename, invoice_no, invoice_date, source_type } = req.body || {};
      if (!text || typeof text !== "string") {
        return res.status(400).json({ success: false, error: "text is required (OCR output)" });
      }

      const parsed = parseOcrText(text);
      if (!parsed.items.length) {
        return res.status(400).json({ success: false, error: "No line items detected in OCR text." });
      }

      const h = parsed.header;
      const headerSite = String(req.headers["x-invoice-site"] || "").trim();
      if (headerSite) h.site = headerSite;
      if (invoice_no) h.invoice_no = invoice_no;
      if (invoice_date) h.invoice_date = invoice_date;

      const importedBy = req.user?.full_name || req.user?.username || "system";
      const sourceFile = filename || "ocr-upload.pdf";
      const srcType = source_type || "OCR";

      const result = await transaction(async (client) => {
        const invRes = await client.query(
          "INSERT INTO invoices (invoice_no, invoice_date, contractor_name, site, subtotal, vat, vat_percent, total, source_file, source_type, imported_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Imported') RETURNING *",
          [h.invoice_no || null, h.invoice_date || null, h.contractor_name || null, h.site || null, h.subtotal || 0, h.vat || 0, h.vat_percent || 15, h.total || 0, sourceFile, srcType, importedBy]
        );
        const invoice = invRes.rows[0];
        const items = [];
        for (const it of parsed.items) {
          const r = await client.query(
            "INSERT INTO invoice_items (invoice_id, line_no, description, unit, quantity, unit_price, discount_percent, net_amount, total_with_vat, confirmed_amount, match_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'Unmatched') RETURNING *",
            [invoice.id, it.line_no || null, it.description || "", it.unit || "", it.quantity || 1, it.unit_price || 0, it.discount_percent || 0, it.net_amount || 0, it.net_amount || 0]
          );
          items.push(r.rows[0]);
        }
        return { invoice, items };
      });

      res.status(201).json({
        success: true,
        message: "Invoice imported from OCR.",
        invoice: result.invoice,
        items: result.items,
        count: result.items.length,
        header: h
      });
    } catch (e) {
      console.error("[InvoiceRoutes:import-ocr]", e);
      res.status(400).json({ success: false, error: e.message });
    }
  });
  /* --- Update invoice (site, notes) --- */
  router.put("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: "Invalid ID" });

      const inv = await query("SELECT * FROM invoices WHERE id = $1", [id]);
      if (!inv.rows[0]) return res.status(404).json({ success: false, error: "Invoice not found" });

      const body = req.body || {};
      const site = body.site !== undefined ? String(body.site || "").trim() : inv.rows[0].site;
      const notes = body.notes !== undefined ? String(body.notes || "").trim() : inv.rows[0].notes;

      const result = await query(
        "UPDATE invoices SET site=$1, notes=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *",
        [site || null, notes || null, id]
      );

      res.json({ success: true, invoice: result.rows[0] });
    } catch (e) {
      console.error("[InvoiceRoutes:update]", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });
  /* --- Manual invoice entry --- */
  router.post("/manual", async (req, res) => {
    try {
      const body = req.body || {};
      const {
        invoice_no = "",
        invoice_date = "",
        contractor_name = "",
        site = "",
        subtotal = 0,
        vat = 0,
        vat_percent = 15,
        total = 0,
        notes = "",
        items = []
      } = body;

      if (!Array.isArray(items) || !items.length) {
        return res.status(400).json({ success: false, error: "At least one item is required." });
      }

      const importedBy = req.user?.full_name || req.user?.username || "system";
      const headerSite = String(req.headers["x-invoice-site"] || site || "").trim();

      const result = await transaction(async (client) => {
        const invRes = await client.query(
          "INSERT INTO invoices (invoice_no, invoice_date, contractor_name, site, subtotal, vat, vat_percent, total, source_file, source_type, imported_by, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Imported',$12) RETURNING *",
          [invoice_no || null, invoice_date || null, contractor_name || null, headerSite || null, Number(subtotal) || 0, Number(vat) || 0, Number(vat_percent) || 15, Number(total) || 0, null, "Manual", importedBy, notes || null]
        );
        const invoice = invRes.rows[0];

        const savedItems = [];
        let lineNo = 0;
        for (const it of items) {
          lineNo++;
          const qty = Number(it.quantity) || 1;
          const price = Number(it.unit_price) || 0;
          const totalWithVat = Number(it.total_with_vat) || (qty * price);
          const r = await client.query(
            "INSERT INTO invoice_items (invoice_id, line_no, description, unit, quantity, unit_price, discount_percent, net_amount, total_with_vat, confirmed_amount, match_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'Unmatched') RETURNING *",
            [invoice.id, lineNo, String(it.description || "").trim(), "", qty, price, 0, totalWithVat, totalWithVat]
          );
          savedItems.push(r.rows[0]);
        }

        return { invoice, items: savedItems };
      });

      res.status(201).json({
        success: true,
        message: "Invoice created manually.",
        invoice: result.invoice,
        items: result.items,
        count: result.items.length
      });
    } catch (e) {
      console.error("[InvoiceRoutes:manual]", e);
      res.status(400).json({ success: false, error: e.message });
    }
  });
  /* --- PDF (HTML) for invoice --- */
  router.get("/:id/pdf", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).send("Invalid ID");

      const inv = await query("SELECT * FROM invoices WHERE id = $1", [id]);
      if (!inv.rows[0]) return res.status(404).send("Invoice not found");

      const items = await query(
        "SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY line_no ASC, id ASC",
        [id]
      );

      const invoice = inv.rows[0];
      const invoiceItems = items.rows;

      const esc = (v) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      const fmtMoney = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const totalConfirmed = invoiceItems.reduce((s, it) => s + Number(it.confirmed_amount || 0), 0);

      const rowsHtml = invoiceItems.map(it => `
        <tr>
          <td style="text-align:center">${esc(it.line_no || "")}</td>
          <td>${esc(it.description || "")}</td>
          <td style="text-align:center">${esc(it.quantity || "")}</td>
          <td style="text-align:right">${fmtMoney(it.unit_price)}</td>
          <td style="text-align:right">${fmtMoney(it.net_amount)}</td>
          <td style="text-align:right">${fmtMoney(it.total_with_vat)}</td>
          <td style="text-align:right">${fmtMoney(it.confirmed_amount)}</td>
          <td style="text-align:center">${esc(it.match_status || "Unmatched")}</td>
        </tr>
      `).join("");

      const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${esc(invoice.invoice_no || invoice.id)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
  .company-brand { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 3px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 16px; }
  .company-brand img { width: 175px; max-height: 78px; object-fit: contain; }
  .company-brand-copy { flex: 1; text-align: right; }
  .company-brand-copy .company-name { font-size: 15px; font-weight: 700; color: #1e3a8a; }
  .company-brand-copy .project-name { font-size: 10px; color: #475569; margin-top: 3px; }
  .company-brand-copy .report-owner { font-size: 12px; font-weight: 700; margin-top: 7px; color: #111827; }
  .company-brand-copy .report-role { font-size: 10px; color: #475569; margin-top: 2px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .subtitle { font-size: 12px; color: #475569; margin-bottom: 18px; }
  .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
  .info-grid .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
  .info-grid .card .label { font-size: 10px; color: #64748b; text-transform: uppercase; }
  .info-grid .card .value { font-size: 14px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
  th { background: #e2e8f0; text-align: left; font-size: 11px; text-transform: uppercase; }
  tr { page-break-inside: avoid; }
  .totals { margin-top: 16px; width: 100%; display: flex; justify-content: flex-end; }
  .totals table { width: 320px; }
  .totals td { text-align: right; }
  .totals .label { font-weight: 700; color: #1e3a8a; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 2px solid #cbd5e1; text-align: center; font-size: 11px; color: #64748b; }
  @media print { .no-print { display: none; } body { padding: 0; } }
</style>
</head>
<body>

<div class="company-brand">
  <img src="https://pbs.twimg.com/media/G0B19WzaYAIKWy1.png" alt="Ivanhoe Electric and Maaden" />
  <div class="company-brand-copy">
    <div class="company-name">Maaden Ivanhoe Electric Exploration and Development Limited Company</div>
    <div class="project-name">Exploration Phase — Arabian Shield</div>
    <div class="report-owner">Hussein Anwar</div>
    <div class="report-role">Fleet Manager / Fleet &amp; Camp Maintenance Supervisor</div>
  </div>
</div>

<h1>Invoice ${esc(invoice.invoice_no || ("#" + invoice.id))}</h1>
<div class="subtitle">System Generated Invoice Document — Fleet &amp; Camp Maintenance ERP</div>

<div class="info-grid">
  <div class="card"><div class="label">Invoice No</div><div class="value">${esc(invoice.invoice_no || "-")}</div></div>
  <div class="card"><div class="label">Date</div><div class="value">${esc(invoice.invoice_date || "-")}</div></div>
  <div class="card"><div class="label">Contractor</div><div class="value">${esc(invoice.contractor_name || "-")}</div></div>
  <div class="card"><div class="label">Site</div><div class="value">${esc(invoice.site || "-")}</div></div>
  <div class="card"><div class="label">Subtotal</div><div class="value">${fmtMoney(invoice.subtotal)}</div></div>
  <div class="card"><div class="label">VAT (${esc(invoice.vat_percent || 15)}%)</div><div class="value">${fmtMoney(invoice.vat)}</div></div>
  <div class="card"><div class="label">Total</div><div class="value">${fmtMoney(invoice.total)}</div></div>
  <div class="card"><div class="label">Status</div><div class="value">${esc(invoice.status || "-")}</div></div>
  <div class="card"><div class="label">Confirmed Total</div><div class="value">${fmtMoney(totalConfirmed)}</div></div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:32px">#</th>
      <th>Description</th>
      <th style="width:50px">Qty</th>
      <th style="width:80px">Unit Price</th>
      <th style="width:80px">Net</th>
      <th style="width:90px">Total (VAT)</th>
      <th style="width:90px">Confirmed</th>
      <th style="width:90px">Match</th>
    </tr>
  </thead>
  <tbody>${rowsHtml || '<tr><td colspan="8" style="text-align:center;color:#999">No items</td></tr>'}</tbody>
</table>

<div class="totals">
  <table>
    <tr><td class="label">Subtotal:</td><td>${fmtMoney(invoice.subtotal)}</td></tr>
    <tr><td class="label">VAT:</td><td>${fmtMoney(invoice.vat)}</td></tr>
    <tr><td class="label">Total:</td><td><strong>${fmtMoney(invoice.total)}</strong></td></tr>
    <tr><td class="label">Confirmed Total:</td><td>${fmtMoney(totalConfirmed)}</td></tr>
  </table>
</div>

<div class="footer">
  This invoice was auto-generated by Fleet &amp; Camp Maintenance ERP • Printed on ${new Date().toLocaleString("en-GB")}
</div>

<div class="no-print" style="margin-top:24px;text-align:center">
  <button onclick="window.print()" style="padding:12px 24px;font-size:16px;cursor:pointer">Print / Save as PDF</button>
</div>

<script>
  // Auto-open print dialog when loaded
  window.addEventListener("load", () => {
    setTimeout(() => window.print(), 300);
  });
</script>

</body>
</html>`;

      res.set("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (e) {
      console.error("[InvoiceRoutes:pdf]", e);
      res.status(500).send("Failed to generate invoice PDF: " + e.message);
    }
  });
  /* --- Update site for an invoice item --- */
  router.put("/items/:itemId/site", async (req, res) => {
    try {
      const itemId = Number(req.params.itemId);
      if (!Number.isFinite(itemId)) return res.status(400).json({ success: false, error: "Invalid ID" });

      const site = String(req.body?.site || "").trim();

      const r = await query(
        "UPDATE invoice_items SET site=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *",
        [site || null, itemId]
      );
      if (!r.rows[0]) return res.status(404).json({ success: false, error: "Item not found" });

      res.json({ success: true, item: r.rows[0] });
    } catch (e) {
      console.error("[InvoiceRoutes:item-site]", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });
  app.use("/api/invoices", router);
}
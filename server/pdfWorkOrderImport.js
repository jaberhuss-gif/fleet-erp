import Busboy from "busboy";
import pdfParse from "pdf-parse";
import { query } from "./postgres.js";

const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
const match = (line, patterns) => {
  for (const p of patterns) {
    const m = line.match(p);
    if (m?.[1]) return clean(m[1]);
  }
  return "";
};

const dateValue = (v) => {
  const value = clean(v);
  const numeric = value.match(/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/);
  if (numeric) {
    const p = numeric[1].replace(/\//g, "-").split("-");
    return p[0].length === 4
      ? `${p[0]}-${String(p[1]).padStart(2, "0")}-${String(p[2]).padStart(2, "0")}`
      : `${p[2]}-${String(p[1]).padStart(2, "0")}-${String(p[0]).padStart(2, "0")}`;
  }
  const named = value.match(/\b(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})\b/);
  if (!named) {
    const monthYear = value.match(/\b([A-Za-z]{3,9})[-\s](\d{4})\b/);
    if (!monthYear) return "";
    const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const month = months[monthYear[1].slice(0,3).toLowerCase()];
    if (!month) return "";
    return `${monthYear[2]}-${String(month).padStart(2, "0")}-01`;
  }
  const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const month = months[named[2].slice(0,3).toLowerCase()];
  if (!month) return "";
  let year = Number(named[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(month).padStart(2, "0")}-${String(named[1]).padStart(2, "0")}`;
};

const slug = (v) =>
  clean(v)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();

function extractLineItems(text) {
  const normalized = clean(text)
    .replace(/Total\s*Price/gi, "Total Price")
    .replace(/installationL\.s/gi, "installation L.s");

  const unit = "(?:Pcs|Pc|L\\.s|L\\.m|m2|m3|m|Kg|Set|Nos?)";
  const number = "(\\d+(?:\\.\\d+)?)";
  const itemRe = new RegExp(
    `(?:^|\\s)(\\d+)\\s+(.+?)\\s+${unit}\\s+${number}\\s+${number}\\s+${number}(?=\\s+\\d+\\s+|\\s+Requested\\b|\\s+Site\\s*:|\\s+Subject\\s*:|$)`,
    "gi"
  );

  const items = [];
  let m;
  while ((m = itemRe.exec(normalized))) {
    const full = m[0].trim();
    const unitMatch = full.match(new RegExp(`\\b${unit}\\b`, "i"));
    const parts = full.match(new RegExp(`^\\d+\\s+(.+?)\\s+(${unit})\\s+(${number})\\s+(${number})\\s+(${number})$`, "i"));
    if (!parts) continue;
    items.push({
      no: Number(m[1]),
      description: clean(parts[1]),
      unit: parts[2],
      quantity: Number(parts[3]),
      unit_price: Number(parts[4]),
      total: Number(parts[5]),
      index: m.index,
    });
  }

  return items;
}

function normalizeSiteName(value, knownSites = []) {
  const raw = clean(value);
  if (!raw) return { site: "", area: "" };
  const norm = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const sites = [...knownSites].filter(Boolean).map((name) => ({
    name: clean(name),
    norm: clean(name).toLowerCase().replace(/[^a-z0-9]+/g, "")
  })).sort((a,b) => b.norm.length - a.norm.length);

  const exact = sites.find((s) => s.norm === norm);
  if (exact) return { site: exact.name, area: "" };

  const prefix = sites.find((s) => norm.startsWith(s.norm) && norm.length > s.norm.length);
  if (prefix) {
    const remainder = raw.slice(raw.toLowerCase().indexOf(prefix.name.toLowerCase()) + prefix.name.length).replace(/^[-,:\s]+/, "");
    return { site: prefix.name, area: clean(remainder) };
  }

  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  const fuzzy = sites.find((s) => {
    const a = s.norm, b = compact;
    if (a.length < 5 || b.length < 5) return false;
    const distance = levenshtein(a, b);
    return distance <= Math.max(1, Math.floor(Math.min(a.length,b.length) * 0.12));
  });
  return fuzzy ? { site: fuzzy.name, area: "" } : { site: raw, area: "" };
}

function levenshtein(a, b) {
  const prev = Array.from({length:b.length + 1}, (_,i) => i);
  for (let i=1;i<=a.length;i++) {
    const cur = [i];
    for (let j=1;j<=b.length;j++) {
      cur[j] = Math.min(
        cur[j-1] + 1,
        prev[j] + 1,
        prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1)
      );
    }
    for (let j=0;j<cur.length;j++) prev[j]=cur[j];
  }
  return prev[b.length];
}

function parseRows(text, filename = "upload.pdf", knownSites = []) {
  const source = String(text || "").replace(/\r/g, "");
  const flat = clean(source);
  const rows = [];
  let current = null;

  const start = (wo) => {
    if (current) rows.push(current);
    current = {
      wo_no: wo,
      site: "",
      area: "",
      category: "General",
      priority: "Medium",
      description: "",
      assigned_to: "",
      is_contractor: 0,
      contractor_name: "",
      performed_by: "",
      reported_date: "",
      parts_used: "",
    };
  };

  for (const raw of source.split("\n")) {
    const line = clean(raw);
    if (!line) continue;

    const wo = line.match(/(?:work\s*order|wo\s*(?:no|#|number)?)[\s:#-]*([A-Z0-9][A-Z0-9._/-]{2,})/i);
    if (wo) start(wo[1]);

    if (!current) continue;
    const site = match(line, [/(?:site|location|camp|project\s*site)\s*[:#-]\s*(.+)$/i]);
    if (site) current.site = site;
    const area = match(line, [/area\s*[:#-]\s*(.+)$/i]);
    if (area) current.area = area;
    const cat = match(line, [/(?:category|discipline|trade)\s*[:#-]\s*(.+)$/i]);
    if (cat) current.category = cat;
    const pri = match(line, [/priority\s*[:#-]\s*(.+)$/i]);
    if (pri) current.priority = pri;
    const desc = match(line, [/(?:description|problem|issue|work\s*description)\s*[:#-]\s*(.+)$/i]);
    if (desc) current.description = desc;
    const ass = match(line, [/(?:assigned\s*to|assignee)\s*[:#-]\s*(.+)$/i]);
    if (ass) current.assigned_to = ass;
    const perf = match(line, [/(?:performed\s*by|completed\s*by|executor|technician)\s*[:#-]\s*(.+)$/i]);
    if (perf) current.performed_by = perf;
    const con = match(line, [/(?:contractor|vendor)\s*[:#-]\s*(.+)$/i]);
    if (con) {
      current.contractor_name = con;
      current.is_contractor = 1;
    }
    const dt = match(line, [/(?:reported\s*date|opened|created\s*date|date)\s*[:#-]\s*(.+)$/i]);
    if (dt) current.reported_date = dateValue(dt);
    const parts = match(line, [/(?:parts\s*used|parts|materials)\s*[:#-]\s*(.+)$/i]);
    if (parts) current.parts_used = parts;
  }

  if (current) rows.push(current);

  // Camp-maintenance PDFs are often cost-summary tables rather than standard WO forms.
  // pdf-parse can flatten the table, so Site/Subject text may appear between item rows.
  // We must split the document into site sections and NEVER import the flattened text
  // as one fake WO.
  if (!rows.length) {
    const requestedBy = match(flat, [/requested\s*by\s*\s*:?\s*(.+?)(?=\s+site\s*:|\s+subject\s*:|$)/i]);
    const subject = match(flat, [/subject\s*:\s*(.+?)(?=\s+\d+\s+.+?\s+(?:Pcs|Pc|L\.s|L\.m|m2|m3|m|Kg|Set|Nos?)\s+\d)/i]);
    // Contractor monthly summaries do not set the Work Order date automatically.
    // The user enters the actual request date when creating/confirming the WO.
    const reportDate = "";
    const items = extractLineItems(flat);

    const candidateNames = [
      ...knownSites,
      "Alhalifah Alsabiyah",
      "Alhaddar Diran",
      "Al-Quwayiyiah Wadi Bida"
    ].filter(Boolean);

    // IMPORTANT: pdf-parse preserves page boundaries as form-feed characters in
    // the extracted text. A monthly contractor PDF can contain one complete
    // site/work-order table per page. Parse each page independently first so
    // page 3 is never swallowed into page 2 just because both pages were
    // flattened into one string.
    const pages = source.split(/\\f/).map((p) => clean(p)).filter(Boolean);
    const pageSections = [];

    const siteRegexFor = (pageText) => {
      for (const name of candidateNames) {
        const re = new RegExp(slug(name).replace(/-/g, "[\\s-]*"), "i");
        const m = pageText.match(re);
        if (m) return { rawSite: name, index: m.index ?? 0 };
      }
      const explicit = pageText.match(/(?:site|location|camp|project\\s*site)\\s*[:#-]\\s*([^\\n]+?)(?=\\s+subject\\s*:|\\s+requested\\s+by|\\s+\\d+\\s+.+?\\s+(?:Pcs|Pc|L\\.s|L\\.m|m2|m3|m|Kg|Set|Nos?)\\s+\\d|$)/i);
      return explicit ? { rawSite: clean(explicit[1]), index: explicit.index ?? 0 } : { rawSite: "", index: -1 };
    };

    for (const pageText of pages) {
      const pageItems = extractLineItems(pageText);
      if (!pageItems.length) continue;

      const siteInfo = siteRegexFor(pageText);
      pageSections.push({
        rawSite: siteInfo.rawSite,
        text: pageText,
        items: pageItems,
      });
    }

    // Fallback for PDFs where pdf-parse does not preserve form-feed page breaks.
    if (!pageSections.length && items.length) {
      const markers = [];
      for (const name of candidateNames) {
        const re = new RegExp(slug(name).replace(/-/g, "[\\s-]*"), "ig");
        let m;
        while ((m = re.exec(flat))) markers.push({ raw: m[0], index: m.index, name });
      }
      markers.sort((a,b) => a.index - b.index);

      const uniqueMarkers = [];
      for (const marker of markers) {
        if (!uniqueMarkers.some((x) => Math.abs(x.index - marker.index) < Math.max(marker.raw.length, x.raw.length))) {
          uniqueMarkers.push(marker);
        }
      }

      for (let i=0; i<uniqueMarkers.length; i++) {
        const marker = uniqueMarkers[i];
        const end = uniqueMarkers[i+1]?.index ?? flat.length;
        const sectionText = flat.slice(marker.index, end);
        const sectionItems = items.filter((item) => item.index >= marker.index && item.index < end);
        if (sectionItems.length) {
          pageSections.push({ rawSite: marker.name, text: sectionText, items: sectionItems });
        }
      }
    }

    let sections = pageSections;
    if (!sections.length && items.length) {
      const subjectSite = subject?.match(/\\b(?:requirement|requi?rment)\\b\\s+(.+?)(?:\\s*$)/i)?.[1] || "";
      const fallbackSite = subjectSite || match(flat, [/site\\s*:\\s*(.+?)(?=\\s+subject\\s*:|\\s+\\d+\\s+|$)/i]);
      sections = [{ rawSite: fallbackSite || "", text: flat, items }];
    }

    for (let i=0; i<sections.length; i++) {
      const section = sections[i];
      const mapped = normalizeSiteName(section.rawSite, knownSites);
      const site = mapped.site;
      const area = mapped.area || "";
      const sectionItems = section.items || [];
      const itemText = sectionItems.map((x) =>
        `${x.no}. ${x.description} | Unit: ${x.unit} | Qty: ${x.quantity} | Unit Price: ${x.unit_price} | Total: ${x.total}`
      ).join("\n");
      const grandTotal = sectionItems.reduce((sum, x) => sum + x.total, 0);
      const datePart = "UNDATED";
      const woBase = `PDF-${datePart}-${slug(site || section.rawSite || filename).slice(0, 40)}-${i+1}`;

      rows.push({
        wo_no: woBase,
        site,
        area,
        category: "Camp Maintenance",
        priority: "Medium",
        description: clean(subject) || "Camp requirement imported from PDF",
        assigned_to: requestedBy || "",
        is_contractor: 0,
        contractor_name: "",
        performed_by: "",
        reported_date: reportDate,
        final_cost: grandTotal,
        parts_cost: 0,
        parts_used: itemText
          ? `Line items:\n${itemText}\nGrand Total: ${grandTotal}`
          : ""
      });
    }
  }

  return rows
    .filter((r) => r.wo_no)
    .map((r) => ({
      ...r,
      site: r.site || "Unknown",
      description: r.description || "Imported from PDF",
      performed_by: r.performed_by || r.contractor_name || r.assigned_to || "",
    }));
}

async function readPdf(req) {
  return await new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: 25 * 1024 * 1024 },
    });
    const chunks = [];
    let filename = "";
    let mime = "";
    let seen = false;
    bb.on("file", (_field, file, info) => {
      seen = true;
      filename = info.filename || "upload.pdf";
      mime = info.mimeType || "";
      file.on("data", (c) => chunks.push(c));
      file.on("limit", () => reject(new Error("PDF is larger than 25 MB")));
    });
    bb.on("error", reject);
    bb.on("finish", () =>
      seen
        ? resolve({ buffer: Buffer.concat(chunks), filename, mime })
        : reject(new Error("Please select a PDF file"))
    );
    req.pipe(bb);
  });
}

async function extract(req) {
  const { buffer, filename, mime } = await readPdf(req);
  if (!/\.pdf$/i.test(filename) && mime !== "application/pdf") {
    throw new Error("Only PDF files are supported");
  }
  const parsed = await pdfParse(buffer);
  let knownSites = [];
  try {
    const siteResult = await query("SELECT name FROM sites WHERE name IS NOT NULL ORDER BY LENGTH(name) DESC");
    knownSites = (siteResult.rows || []).map((r) => r.name).filter(Boolean);
  } catch (e) {
    console.warn("[PDFWorkOrderImport:sites]", e.message);
  }
  const rows = parseRows(parsed.text, filename, knownSites);
  const warnings = [];
  if (!rows.length) warnings.push("No structured line items were detected.");
  rows.forEach((r) => {
    if (!r.site || r.site === "Unknown" || /^all site$/i.test(r.site)) warnings.push(`Site could not be mapped for ${r.wo_no}`);
    if (/^PDF-UNDATED-/i.test(r.wo_no)) warnings.push(`Missing date for ${r.wo_no}`);
    if (!r.description || /Imported from PDF/i.test(r.description)) warnings.push(`Description needs review for ${r.wo_no}`);
  });
  return {
    filename,
    pages: parsed.numpages || 0,
    text: parsed.text || "",
    rows,
    warnings,
    valid: rows.length > 0 && warnings.length === 0,
  };
}

export function mountPdfWorkOrderImport(app) {
  app.post("/api/work-orders/import-pdf/preview", async (req, res) => {
    try {
      const r = await extract(req);
      res.json({
        success: true,
        filename: r.filename,
        pages: r.pages,
        count: r.rows.length,
        rows: r.rows,
        extractedTextLength: r.text.length,
        warnings: r.warnings,
        valid: r.valid,
      });
    } catch (e) {
      console.error("[PDFWorkOrderImport:preview]", e);
      res.status(400).json({ success: false, error: e.message });
    }
  });

  app.post("/api/work-orders/import-pdf", async (req, res) => {
    try {
      const r = await extract(req);
      if (!r.rows.length) {
        return res.status(400).json({
          success: false,
          error: "No structured Work Orders could be detected in this PDF.",
        });
      }
      if (!r.valid) {
        return res.status(400).json({
          success: false,
          error: "PDF preview is not valid for import. Review the detected Site/Date/Description fields first.",
          warnings: r.warnings,
          rows: r.rows,
        });
      }

      let imported = 0;
      let skipped = 0;
      for (const row of r.rows) {
        const existing = await query(
          "SELECT id FROM work_orders WHERE wo_no = $1",
          [row.wo_no]
        );
        if (existing.rows[0]) {
          skipped++;
          continue;
        }

        await query(
          `INSERT INTO work_orders
             (wo_no,site,area,category,priority,description,assigned_to,is_contractor,
              contractor_name,performed_by,reported_date,parts_used,final_cost,parts_cost,status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Closed')`,
          [
            row.wo_no,
            row.site,
            row.area,
            row.category,
            row.priority,
            row.description,
            row.assigned_to,
            row.is_contractor,
            row.contractor_name,
            row.performed_by,
            row.reported_date || null,
            row.parts_used,
            Number(row.final_cost || 0),
            Number(row.parts_cost || 0),
          ]
        );
        imported++;
      }

      res.json({
        success: true,
        filename: r.filename,
        detected: r.rows.length,
        imported,
        skipped,
      });
    } catch (e) {
      console.error("[PDFWorkOrderImport:import]", e);
      res.status(400).json({ success: false, error: e.message });
    }
  });
}

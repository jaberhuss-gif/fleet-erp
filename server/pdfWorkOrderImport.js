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
  const m = clean(v).match(/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/);
  if (!m) return "";
  const p = m[1].replace(/\//g, "-").split("-");
  return p[0].length === 4
    ? `${p[0]}-${String(p[1]).padStart(2, "0")}-${String(p[2]).padStart(2, "0")}`
    : `${p[2]}-${String(p[1]).padStart(2, "0")}-${String(p[0]).padStart(2, "0")}`;
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
    });
  }

  return items;
}

function parseRows(text, filename = "upload.pdf") {
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

  // Some camp-maintenance PDFs are not work-order forms. They are a
  // "Requested by / Site / Date / Subject" summary followed by a cost table.
  // Treat the whole document as one work order instead of requiring a WO number.
  if (!rows.length) {
    const requestedBy = match(flat, [/requested\s*by\s*:\s*(.+?)(?=\s+site\s*:|\s+subject\s*:|$)/i]);
    const siteHeader = match(flat, [/site\s*:\s*(.+?)(?=\s+\d{1,2}[-\/]\w+[-\/]?\d{2,4}|\s+subject\s*:|$)/i]);
    const subject = match(flat, [/subject\s*:\s*(.+)$/i]);
    const reportDate = dateValue(flat);
    const items = extractLineItems(flat);

    if (items.length || subject || siteHeader) {
      const subjectSite = subject.match(/\b(?:requirement|requi?rment)\b\s+(.+?)(?:\s*$)/i)?.[1] || "";
      const site = subjectSite ? clean(subjectSite) : (siteHeader || "All Site");
      const woBase = `PDF-${reportDate.replace(/-/g, "") || "UNDATED"}-${slug(site || filename).slice(0, 40)}`;
      const itemText = items.map((x) =>
        `${x.no}. ${x.description} | Unit: ${x.unit} | Qty: ${x.quantity} | Unit Price: ${x.unit_price} | Total: ${x.total}`
      ).join("\n");
      const grandTotal = items.reduce((sum, x) => sum + x.total, 0);

      rows.push({
        wo_no: woBase,
        site,
        area: "",
        category: "Camp Maintenance",
        priority: "Medium",
        description: subject || "Camp requirement imported from PDF",
        assigned_to: requestedBy || "",
        is_contractor: 0,
        contractor_name: "",
        performed_by: "",
        reported_date: reportDate,
        parts_used: itemText
          ? `Line items:\n${itemText}\nGrand Total: ${grandTotal}`
          : "",
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
  return {
    filename,
    pages: parsed.numpages || 0,
    text: parsed.text || "",
    rows: parseRows(parsed.text, filename),
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
          error: "No Work Orders could be detected in this PDF.",
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

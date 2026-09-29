import Busboy from "busboy";
import pdfParse from "pdf-parse";
import { query } from "./postgres.js";

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return normalizeSpace(m[1]);
  }
  return "";
}

function parseDate(value) {
  const v = normalizeSpace(value);
  const m = v.match(/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/);
  if (!m) return "";
  const parts = m[1].replace(/\//g, "-").split("-");
  if (parts[0].length === 4) return `${parts[0]}-${String(parts[1]).padStart(2,"0")}-${String(parts[2]).padStart(2,"0")}`;
  return `${parts[2]}-${String(parts[1]).padStart(2,"0")}-${String(parts[0]).padStart(2,"0")}`;
}

function parseWorkOrders(text) {
  const clean = String(text || "").replace(/\r/g, "");
  const lines = clean.split("\n").map(normalizeSpace).filter(Boolean);
  const rows = [];
  let current = null;

  const start = (woNo) => {
    if (current) rows.push(current);
    current = {
      wo_no: woNo,
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
      parts_used: ""
    };
  };

  for (const line of lines) {
    const wo = line.match(/(?:work\s*order|wo\s*(?:no|#|number)?)[\s:#-]*([A-Z0-9][A-Z0-9._/-]{2,})/i);
    if (wo) start(wo[1]);

    if (!current) continue;

    const site = firstMatch(line, [
      /(?:site|location|camp|project\s*site)\s*[:#-]\s*(.+)$/i
    ]);
    if (site) current.site = site;

    const area = firstMatch(line, [/area\s*[:#-]\s*(.+)$/i]);
    if (area) current.area = area;

    const category = firstMatch(line, [/(?:category|discipline|trade)\s*[:#-]\s*(.+)$/i]);
    if (category) current.category = category;

    const priority = firstMatch(line, [/priority\s*[:#-]\s*(.+)$/i]);
    if (priority) current.priority = priority;

    const description = firstMatch(line, [
      /(?:description|problem|issue|work\s*description)\s*[:#-]\s*(.+)$/i
    ]);
    if (description) current.description = description;

    const assigned = firstMatch(line, [
      /(?:assigned\s*to|assignee|technician)\s*[:#-]\s*(.+)$/i
    ]);
    if (assigned) current.assigned_to = assigned;

    const performed = firstMatch(line, [
      /(?:performed\s*by|completed\s*by|executor|technician)\s*[:#-]\s*(.+)$/i
    ]);
    if (performed) current.performed_by = performed;

    const contractor = firstMatch(line, [
      /(?:contractor|vendor)\s*[:#-]\s*(.+)$/i
    ]);
    if (contractor) {
      current.contractor_name = contractor;
      current.is_contractor = 1;
    }

    const reported = firstMatch(line, [
      /(?:reported\s*date|opened|created\s*date|date)\s*[:#-]\s*(.+)$/i
    ]);
    if (reported) current.reported_date = parseDate(reported);

    const parts = firstMatch(line, [
      /(?:parts\s*used|parts|materials)\s*[:#-]\s*(.+)$/i
    ]);
    if (parts) current.parts_used = parts;

    // Some reports print the site as a standalone numeric code such as 405.
    if (!current.site && /^\d{3,5}$/.test(line)) current.site = line;
  }

  if (current) rows.push(current);

  return rows.filter(r => r.wo_no).map(r => ({
    ...r,
    site: r.site || "Unknown",
    description: r.description || "Imported from PDF",
    performed_by: r.performed_by || r.contractor_name || r.assigned_to || ""
  }));
}

async function readMultipartPdf(req) {
  return await new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
    const chunks = [];
    let filename = "";
    let mime = "";
    let seenFile = false;
    busboy.on("file", (_field, file, info) => {
      seenFile = true;
      filename = info.filename || "upload.pdf";
      mime = info.mimeType || "";
      file.on("data", chunk => chunks.push(chunk));
      file.on("limit", () => reject(new Error("PDF is larger than 25 MB")));
    });
    busboy.on("error", reject);
    busboy.on("finish", () => {
      if (!seenFile) return reject(new Error("Please select a PDF file"));
      resolve({ buffer: Buffer.concat(chunks), filename, mime });
    });
    req.pipe(busboy);
  });
}

async function extractPdf(req) {
  const { buffer, filename, mime } = await readMultipartPdf(req);
  if (!/\.pdf$/i.test(filename) && mime !== "application/pdf") {
    throw new Error("Only PDF files are supported");
  }
  const parsed = await pdfParse(buffer);
  const text = parsed.text || "";
  const rows = parseWorkOrders(text);
  return { filename, pages: parsed.numpages || 0, text, rows };
}

export function mountPdfWorkOrderImport(app) {
  app.post("/api/work-orders/import-pdf/preview", async (req, res) => {
    try {
      const result = await extractPdf(req);
      res.json({
        success: true,
        filename: result.filename,
        pages: result.pages,
        count: result.rows.length,
        rows: result.rows,
        extractedTextLength: result.text.length
      });
    } catch (e) {
      console.error("[PDFWorkOrderImport:preview]", e);
      res.status(400).json({ success: false, error: e.message });
    }
  });

  app.post("/api/work-orders/import-pdf", async (req, res) => {
    try {
      const result = await extractPdf(req);
      if (!result.rows.length) {
        return res.status(400).json({
          success: false,
          error: "No Work Orders could be detected in this PDF. Upload the report and we can map its exact layout."
        });
      }

      let imported = 0;
      let skipped = 0;
      for (const row of result.rows) {
        const existing = await query("SELECT id FROM work_orders WHERE wo_no = $1", [row.wo_no]);
        if (existing.rows[0]) {
          skipped += 1;
          continue;
        }
        await query(
          `INSERT INTO work_orders
           (wo_no, site, area, category, priority, description, assigned_to,
            is_contractor, contractor_name, performed_by, reported_date, parts_used, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Closed')`,
          [
            row.wo_no, row.site, row.area, row.category, row.priority,
            row.description, row.assigned_to, row.is_contractor,
            row.contractor_name, row.performed_by,
            row.reported_date || null, row.parts_used
          ]
        );
        imported += 1;
      }

      res.json({
        success: true,
        filename: result.filename,
        detected: result.rows.length,
        imported,
        skipped
      });
    } catch (e) {
      console.error("[PDFWorkOrderImport:import]", e);
      res.status(400).json({ success: false, error: e.message });
    }
  });
}

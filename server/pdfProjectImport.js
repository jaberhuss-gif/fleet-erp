import Busboy from "busboy";
import pdfParse from "pdf-parse";
import { query, transaction } from "./postgres.js";

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function parseItems(text) {
  const source = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "");
  const items = [];

  // Format A — Jadoud Al-Khaleej:
  // total incl. VAT, net after discount, discount %, unit price, quantity,
  // location, item name, item number, row number.
  const flat = source.replace(/\s+/g, " ").trim();
  const formatA = /([0-9][0-9,]*\.[0-9]{2})\s+([0-9][0-9,]*\.[0-9]{2})\s+([0-9][0-9,]*\.[0-9]{2})\s+([0-9][0-9,]*\.[0-9]{2})\s+(\d+)\s+([A-Za-z][A-Za-z0-9_-]*)\s+(.+?)\s+(\d+)\s+(\d+)(?=\s+[0-9][0-9,]*\.[0-9]{2}\s+[0-9][0-9,]*\.[0-9]{2}\s+[0-9][0-9,]*\.[0-9]{2}\s+[0-9][0-9,]*\.[0-9]{2}\s+\d+\s+[A-Za-z]|$)/g;
  let m;
  while ((m = formatA.exec(flat))) {
    items.push({
      total_with_vat: num(m[1]), net_amount: num(m[2]),
      discount_percent: num(m[3]), tax_percent: 15,
      price: num(m[4]), quantity: num(m[5]), location: clean(m[6]),
      item: clean(m[7]), item_no: clean(m[8]), sr_no: Number(m[9]), unit: ""
    });
  }
  if (items.length) return items;

  // Format B — Raghad Al-Ofuq:
  // total, discount %, tax %, unit price, quantity, Arabic/English item name, row number.
  // Keep the extracted values as-is for review; do not guess/correct reversed RTL digits.
  const lines = source.split(/\r?\n/).map(clean).filter(Boolean);
  const formatB = /^([0-9][0-9,]*\.[0-9]{2})\s+([0-9]+(?:\.[0-9]+)?)\s*%\s+([0-9]+(?:\.[0-9]+)?)\s*%\s+([0-9][0-9,]*\.[0-9]{2})\s+(\d+)\s+(.+?)\s+(\d{1,4})\s*$/;
  for (const line of lines) {
    const row = line.match(formatB);
    if (!row) continue;
    items.push({
      total_with_vat: num(row[1]),
      net_amount: 0,
      discount_percent: num(row[2]),
      tax_percent: num(row[3]),
      price: num(row[4]),
      quantity: num(row[5]),
      location: "",
      item: clean(row[6]),
      item_no: clean(row[7]),
      sr_no: items.length + 1,
      unit: ""
    });
  }
  if (items.length) return items;

  // Format C — JODOUD project quotation (Sr. / Item / Unit / Quantities / Price / Cost).
  // Keep wrapped descriptions together; only accept rows whose unit and three numeric
  // columns are recognizable. Quotation amounts are estimates, not actual closing cost.
  const quoteLines = source.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const rowEnd = /\s+(L\.m|m2|Pcs|L\.s|day)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s*$/i;
  const ignored = /^(?:quotation|date\s*:|offer\s+sr|project\s*:|subject\s*:|company\s+info|vat\s+#|cr\s+no|construction\s+item|electrical\s+item|mechanical\s+item|sr\.|item\b|unit\b|quantities\b|price\b|cost\b|jodoud|trading\s+co|total\s+without|vat\s+value|total\s+with|payments\s+conditions)/i;
  let current = null;
  const quoteItems = [];
  const flushQuote = () => {
    if (!current) return;
    const tail = current.text.match(rowEnd);
    if (tail) {
      const desc = clean(current.text.slice(0, tail.index));
      if (desc && !ignored.test(desc)) {
        quoteItems.push({
          sr_no: current.sr,
          item_no: "",
          item: desc,
          unit: tail[1],
          quantity: num(tail[2]),
          price: num(tail[3]),
          cost: num(tail[4]),
          net_amount: num(tail[4]),
          total_with_vat: 0,
          discount_percent: 0,
          tax_percent: 0,
          location: ""
        });
      }
    }
    current = null;
  };
  for (const line of quoteLines) {
    if (ignored.test(line)) continue;
    const beginsRow = line.match(/^(\d{1,3})\s+(.+)$/);
    if (beginsRow && rowEnd.test(line)) {
      flushQuote();
      current = { sr: Number(beginsRow[1]), text: beginsRow[2] };
      flushQuote();
      continue;
    }
    if (beginsRow && !current) {
      current = { sr: Number(beginsRow[1]), text: beginsRow[2] };
      continue;
    }
    if (beginsRow && current && rowEnd.test(current.text)) {
      flushQuote();
      current = { sr: Number(beginsRow[1]), text: beginsRow[2] };
      continue;
    }
    if (current) current.text += " " + line;
  }
  flushQuote();
  if (quoteItems.length >= 3) return quoteItems;

  return items;
}

function extractField(text, label) {
  const re = new RegExp(label + "\\s*[:#-]\\s*(.+?)(?=\\s+(?:Site|Location|Requested By|Date|Work Order|Subject)\\s*[:#-]|$)", "i");
  return clean(text.match(re)?.[1] || "");
}

async function readPdf(req) {
  return await new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
    const chunks = [];
    let filename = "upload.pdf";
    let seen = false;
    bb.on("file", (_field, file, info) => {
      seen = true;
      filename = info.filename || filename;
      file.on("data", c => chunks.push(c));
      file.on("limit", () => reject(new Error("PDF is larger than 25 MB")));
    });
    bb.on("error", reject);
    bb.on("finish", () => seen
      ? resolve({ buffer: Buffer.concat(chunks), filename })
      : reject(new Error("Please select a PDF file")));
    req.pipe(bb);
  });
}

async function parsePdf(req) {
  const { buffer, filename } = await readPdf(req);
  if (!/\.pdf$/i.test(filename)) throw new Error("Only PDF files are supported");
  const parsed = await pdfParse(buffer);
  const text = parsed.text || "";
  const items = parseItems(text);
  const subject = extractField(text, "Subject") || extractField(text, "Project") || filename.replace(/\.pdf$/i, "");
  const site = extractField(text, "(?:Site|Location|Camp|Project Site)");
  const date = extractField(text, "(?:Date|Requested Date|Work Order Date)");
  const requestedBy = extractField(text, "Requested By");
  return {
    filename,
    pages: parsed.numpages || 0,
    subject,
    site,
    date,
    requestedBy,
    items
  };
}

export function mountPdfProjectImport(app) {
  app.post("/api/building-maintenance/import-pdf/preview", async (req, res) => {
    try {
      const r = await parsePdf(req);
      if (!r.items.length) return res.status(400).json({ success:false, error:"No line items were detected in the PDF." });
      res.json({
        success:true,
        filename:r.filename,
        pages:r.pages,
        projectName:r.subject,
        site:r.site,
        date:r.date,
        requestedBy:r.requestedBy,
        items:r.items.map(x => ({...x, cost:0, actual_amount:0, status:"Not Started"}))
      });
    } catch (e) {
      console.error("[PDFProjectImport:preview]", e);
      res.status(400).json({ success:false, error:e.message });
    }
  });

  app.post("/api/building-maintenance/import-pdf", async (req, res) => {
    try {
      const r = await parsePdf(req);
      if (!r.items.length) return res.status(400).json({success:false,error:"No line items were detected in the PDF."});

      const site = clean(req.headers["x-pdf-site"]) || r.site || "Unassigned";
      const projectName = clean(req.headers["x-pdf-project-name"]) || r.subject || r.filename;
      const requestedDate = clean(req.headers["x-pdf-date"]) || r.date || "";
      const selectedMonth = clean(req.headers["x-pdf-month"]);
      const safeMonth = /^\d{4}-\d{2}$/.test(selectedMonth) ? selectedMonth : "";
      const isoDateMatch = requestedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      // The selected report month takes precedence so the imported file is grouped into the month chosen by the user.
      const safeDate = safeMonth ? safeMonth + "-01" : (isoDateMatch ? requestedDate : null);
      const description = "Imported from PDF: " + r.filename;

      const result = await transaction(async client => {
        await client.query(`
          ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
          ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0;
          ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS item_no TEXT DEFAULT '';
          ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
          ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0;
          ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS tax_percent NUMERIC DEFAULT 0;
          ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS net_amount NUMERIC DEFAULT 0;
          ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS total_with_vat NUMERIC DEFAULT 0;
          ALTER TABLE project_items ADD COLUMN IF NOT EXISTS item_no TEXT DEFAULT '';
          ALTER TABLE project_items ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
          ALTER TABLE project_items ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0;
          ALTER TABLE project_items ADD COLUMN IF NOT EXISTS tax_percent NUMERIC DEFAULT 0;
          ALTER TABLE project_items ADD COLUMN IF NOT EXISTS net_amount NUMERIC DEFAULT 0;
          ALTER TABLE project_items ADD COLUMN IF NOT EXISTS total_with_vat NUMERIC DEFAULT 0;
          ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS project_id INTEGER;
        `);

        const projectResult = await client.query(`
          INSERT INTO projects
            (project_no,name,description,site,project_type,status,budget,spent,start_date,end_date,
             manager,contractor,month,year,notes,final_cost,is_contractor,contractor_name,performed_by,
             completed_date,closing_notes,created_at,updated_at)
          VALUES
            ('PRJ-PDF-' || LPAD(nextval('projects_id_seq')::text,6,'0'),
             $1,$2,$3,'Development','Not Started',0,0,$4::date,NULL,
             '','','',
             CASE WHEN $4::date IS NULL THEN NULL ELSE to_char($4::date,'MM')::integer END,
             CASE WHEN $4::date IS NULL THEN NULL ELSE to_char($4::date,'YYYY')::integer END,
             '',0,0,'','',NULL,'',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          RETURNING *
        `, [projectName, description, site, safeDate, description]);
        const project = projectResult.rows[0];

        const woResult = await client.query(`
          INSERT INTO work_orders
            (wo_no,site,area,category,priority,description,assigned_to,is_contractor,contractor_name,
             performed_by,status,reported_date,completed_date,final_cost,contractor_cost,labor_cost,
             parts_cost,closing_notes,parts_used,month,year,project_id)
          VALUES
            ('WO-PDF-' || LPAD(nextval('work_orders_id_seq')::text,6,'0'),
             $1,'','Project','Medium',$2,$3,0,'','',$4,$5::date,NULL,0,0,0,0,'',$6,
             CASE WHEN $5::date IS NULL THEN NULL ELSE to_char($5::date,'YYYY-MM') END,
             CASE WHEN $5::date IS NULL THEN NULL ELSE to_char($5::date,'YYYY') END,
             $7)
          RETURNING *
        `, [site, description, r.requestedBy || "", "Open", safeDate, description, project.id]);
        const workOrder = woResult.rows[0];

        const projectItems = [];
        const workOrderItems = [];
        for (const x of r.items) {
          const pi = await client.query(`
            INSERT INTO project_items
              (project_id,sr_no,item,unit,quantity,price,cost,section,status,actual_amount,notes,item_no,location,discount_percent,tax_percent,net_amount,total_with_vat)
            VALUES ($1,$2,$3,$4,$5,$6,0,'PDF','Not Started',0,'',$7,$8,$9,$10,$11,$12)
            RETURNING *
          `, [project.id, String(x.sr_no), x.item, x.unit, x.quantity, x.price, x.item_no || "", x.location || "", x.discount_percent || 0, x.tax_percent || 0, x.net_amount || 0, x.total_with_vat || 0]);
          projectItems.push(pi.rows[0]);

          const wi = await client.query(`
            INSERT INTO work_order_items
              (work_order_id,sr_no,item,unit,quantity,price,cost,item_no,location,discount_percent,tax_percent,net_amount,total_with_vat)
            VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10,$11,$12)
            RETURNING *
          `, [workOrder.id, String(x.sr_no), x.item, x.unit, x.quantity, x.price, x.item_no || "", x.location || "", x.discount_percent || 0, x.tax_percent || 0, x.net_amount || 0, x.total_with_vat || 0]);
          workOrderItems.push(wi.rows[0]);
        }

        return { project, workOrder, projectItems, workOrderItems };
      });

      res.status(201).json({
        success:true,
        message:"PDF imported. Project and Work Order were created OPEN; no final costs were added.",
        project:result.project,
        workOrder:result.workOrder,
        projectItems:result.projectItems,
        workOrderItems:result.workOrderItems,
        imported:r.items.length
      });
    } catch (e) {
      console.error("[PDFProjectImport:import]", e);
      res.status(400).json({success:false,error:e.message});
    }
  });
}

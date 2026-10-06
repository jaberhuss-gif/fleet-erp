import Busboy from "busboy";
import pdfParse from "pdf-parse";
import { query, transaction } from "./postgres.js";

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const UNIT = "(?:L\\.m|L\\.s|m2|m3|Pcs|Pc|Kg|Set|Nos?|m)";
const ITEM_RE = new RegExp(
  "(?:^|\\s)(\\d+)\\s+(.+?)\\s+" + UNIT +
  "\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)(?=\\s+\\d+\\s+|$)",
  "gi"
);

function parseItems(text) {
  const flat = clean(text).replace(/\\u00a0/g, " ");
  const items = [];
  let m;
  while ((m = ITEM_RE.exec(flat))) {
    const full = m[0].trim();
    const parts = full.match(new RegExp(
      "^\\d+\\s+(.+?)\\s+(" + UNIT + ")\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)$",
      "i"
    ));
    if (!parts) continue;
    items.push({
      sr_no: Number(m[1]),
      item: clean(parts[1]),
      unit: clean(parts[2]),
      quantity: num(parts[3]),
      price: num(parts[4]),
      pdf_cost: num(parts[5])
    });
  }
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
  if (!/\\.pdf$/i.test(filename)) throw new Error("Only PDF files are supported");
  const parsed = await pdfParse(buffer);
  const text = parsed.text || "";
  const items = parseItems(text);
  const subject = extractField(text, "Subject") || extractField(text, "Project") || filename.replace(/\\.pdf$/i, "");
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
      const safeDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(requestedDate) ? requestedDate : null;
      const description = "Imported from PDF: " + r.filename;

      const result = await transaction(async client => {
        await client.query(`
          ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
          ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0;
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
              (project_id,sr_no,item,unit,quantity,price,cost,section,status,actual_amount,notes)
            VALUES ($1,$2,$3,$4,$5,$6,0,'PDF','Not Started',0,'')
            RETURNING *
          `, [project.id, String(x.sr_no), x.item, x.unit, x.quantity, x.price]);
          projectItems.push(pi.rows[0]);

          const wi = await client.query(`
            INSERT INTO work_order_items
              (work_order_id,sr_no,item,unit,quantity,price,cost)
            VALUES ($1,$2,$3,$4,$5,$6,0)
            RETURNING *
          `, [workOrder.id, String(x.sr_no), x.item, x.unit, x.quantity, x.price]);
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

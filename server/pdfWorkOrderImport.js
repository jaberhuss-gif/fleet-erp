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
  return p[0].length === 4 ? `${p[0]}-${String(p[1]).padStart(2,"0")}-${String(p[2]).padStart(2,"0")}` : `${p[2]}-${String(p[1]).padStart(2,"0")}-${String(p[0]).padStart(2,"0")}`;
};
function parseRows(text) {
  const rows=[]; let current=null;
  const start=(wo)=>{ if(current) rows.push(current); current={wo_no:wo,site:"",area:"",category:"General",priority:"Medium",description:"",assigned_to:"",is_contractor:0,contractor_name:"",performed_by:"",reported_date:"",parts_used:""}; };
  for (const raw of String(text||"").replace(/\r/g,"").split("\n")) {
    const line=clean(raw); if(!line) continue;
    const wo=line.match(/(?:work\s*order|wo\s*(?:no|#|number)?)[\s:#-]*([A-Z0-9][A-Z0-9._/-]{2,})/i); if(wo) start(wo[1]);
    if(!current) continue;
    const site=match(line,[/(?:site|location|camp|project\s*site)\s*[:#-]\s*(.+)$/i]); if(site) current.site=site;
    const area=match(line,[/area\s*[:#-]\s*(.+)$/i]); if(area) current.area=area;
    const cat=match(line,[/(?:category|discipline|trade)\s*[:#-]\s*(.+)$/i]); if(cat) current.category=cat;
    const pri=match(line,[/priority\s*[:#-]\s*(.+)$/i]); if(pri) current.priority=pri;
    const desc=match(line,[/(?:description|problem|issue|work\s*description)\s*[:#-]\s*(.+)$/i]); if(desc) current.description=desc;
    const ass=match(line,[/(?:assigned\s*to|assignee)\s*[:#-]\s*(.+)$/i]); if(ass) current.assigned_to=ass;
    const perf=match(line,[/(?:performed\s*by|completed\s*by|executor|technician)\s*[:#-]\s*(.+)$/i]); if(perf) current.performed_by=perf;
    const con=match(line,[/(?:contractor|vendor)\s*[:#-]\s*(.+)$/i]); if(con){current.contractor_name=con;current.is_contractor=1;}
    const dt=match(line,[/(?:reported\s*date|opened|created\s*date|date)\s*[:#-]\s*(.+)$/i]); if(dt) current.reported_date=dateValue(dt);
    const parts=match(line,[/(?:parts\s*used|parts|materials)\s*[:#-]\s*(.+)$/i]); if(parts) current.parts_used=parts;
  }
  if(current) rows.push(current);
  return rows.filter(r=>r.wo_no).map(r=>({...r,site:r.site||"Unknown",description:r.description||"Imported from PDF",performed_by:r.performed_by||r.contractor_name||r.assigned_to||""}));
}
async function readPdf(req){
  return await new Promise((resolve,reject)=>{
    const bb=Busboy({headers:req.headers,limits:{files:1,fileSize:25*1024*1024}});
    const chunks=[]; let filename=""; let mime=""; let seen=false;
    bb.on("file",(_field,file,info)=>{seen=true;filename=info.filename||"upload.pdf";mime=info.mimeType||"";file.on("data",c=>chunks.push(c));file.on("limit",()=>reject(new Error("PDF is larger than 25 MB")));});
    bb.on("error",reject); bb.on("finish",()=>seen?resolve({buffer:Buffer.concat(chunks),filename,mime}):reject(new Error("Please select a PDF file"))); req.pipe(bb);
  });
}
async function extract(req){
  const {buffer,filename,mime}=await readPdf(req);
  if(!/\.pdf$/i.test(filename)&&mime!=="application/pdf") throw new Error("Only PDF files are supported");
  const parsed=await pdfParse(buffer);
  return {filename,pages:parsed.numpages||0,text:parsed.text||"",rows:parseRows(parsed.text)};
}
export function mountPdfWorkOrderImport(app){
  app.post("/api/work-orders/import-pdf/preview",async(req,res)=>{try{const r=await extract(req);res.json({success:true,filename:r.filename,pages:r.pages,count:r.rows.length,rows:r.rows,extractedTextLength:r.text.length});}catch(e){console.error("[PDFWorkOrderImport:preview]",e);res.status(400).json({success:false,error:e.message});}});
  app.post("/api/work-orders/import-pdf",async(req,res)=>{try{const r=await extract(req);if(!r.rows.length)return res.status(400).json({success:false,error:"No Work Orders could be detected in this PDF."});let imported=0,skipped=0;for(const row of r.rows){const existing=await query("SELECT id FROM work_orders WHERE wo_no = $1",[row.wo_no]);if(existing.rows[0]){skipped++;continue;}await query(`INSERT INTO work_orders (wo_no,site,area,category,priority,description,assigned_to,is_contractor,contractor_name,performed_by,reported_date,parts_used,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Closed')`,[row.wo_no,row.site,row.area,row.category,row.priority,row.description,row.assigned_to,row.is_contractor,row.contractor_name,row.performed_by,row.reported_date||null,row.parts_used]);imported++;}res.json({success:true,filename:r.filename,detected:r.rows.length,imported,skipped});}catch(e){console.error("[PDFWorkOrderImport:import]",e);res.status(400).json({success:false,error:e.message});}});
}
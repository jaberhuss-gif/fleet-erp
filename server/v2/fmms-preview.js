import {URL} from "node:url";

const DEFAULT_PUBLISHED_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3pam9B597HAuZDp7bmcrz4I1QZS-kOAuJgePprNFiLNJUvSvXVR9Vyjh-K02eyJIV2Lv7S6BEs69S/pub?output=csv";
const SHEETS = ["Data","Parts","Purchases","ProjectManagement","DevTasks","MonthlySavings"];

function csvRows(text){
  const rows=[]; let row=[]; let cell=""; let quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"' && text[i+1]==='"'){cell+='"';i++;}
      else if(c==='"') quoted=false;
      else cell+=c;
    }else if(c==='"') quoted=true;
    else if(c===','){row.push(cell);cell="";}
    else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell="";}
    else cell+=c;
  }
  if(cell.length||row.length){row.push(cell);rows.push(row);}
  return rows.map(r=>r.map(v=>v.endsWith('\r')?v.slice(0,-1):v));
}

function toObjects(rows){
  if(!rows.length) return [];
  const headers=rows[0].map((h,i)=>String(h||("Column"+(i+1))).trim()||("Column"+(i+1)));
  return rows.slice(1).filter(r=>r.some(v=>String(v??"").trim()!=="")).map(r=>{
    const o={}; headers.forEach((h,i)=>o[h]=String(r[i]??"").trim()); return o;
  });
}

function sheetUrl(base,sheet){
  const u=new URL(base);
  u.searchParams.set("output","csv");
  u.searchParams.set("sheet",sheet);
  return u.toString();
}

async function fetchSheet(base,sheet){
  try{
    const r=await fetch(sheetUrl(base,sheet),{redirect:"follow"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const text=await r.text();
    if(!text.trim() || /^<!doctype html/i.test(text)) throw new Error("Google returned HTML instead of CSV");
    return toObjects(csvRows(text));
  }catch(e){
    throw new Error('FMMS sheet "'+sheet+'" could not be read: '+e.message);
  }
}

function classifyData(rows){
  const seen=new Set(), out={KEEP:0,REPAIR:0,LEGACY:0,DO_NOT_MIGRATE:0};
  for(const r of rows){
    const wo=(r["WO No"]||r["WO Number"]||"").trim();
    if(!wo){out.DO_NOT_MIGRATE++;continue;}
    const key=wo.toUpperCase();
    if(seen.has(key)) out.DO_NOT_MIGRATE++; else {seen.add(key);out.KEEP++;}
  }
  return out;
}

export async function buildFmmsMigrationPreview(){
  const base=process.env.FMMS_GOOGLE_SHEET_URL||DEFAULT_PUBLISHED_URL;
  const sheets={}, errors={};
  for(const name of SHEETS){
    try{ sheets[name]=await fetchSheet(base,name); }
    catch(e){ sheets[name]=[]; errors[name]=e.message; }
  }
  const data=sheets.Data||[], parts=sheets.Parts||[], purchases=sheets.Purchases||[], projects=sheets.ProjectManagement||[], devTasks=sheets.DevTasks||[], monthly=sheets.MonthlySavings||[];
  const startedProjects=projects.filter(r=>String(r["Start Date"]||"").trim()!=="");
  const contractorWOs=data.filter(r=>String(r["Contractor"]||r["External Contractor"]||"").trim()!=="");
  const internalWOs=data.filter(r=>String(r["Contractor"]||r["External Contractor"]||"").trim()==="" && String(r["WO No"]||"").trim()!=="");
  return {
    mode:"READ_ONLY_PREVIEW",
    source:base,
    generatedAt:new Date().toISOString(),
    writesPerformed:false,
    legacyDatabaseTouched:false,
    sheets:Object.fromEntries(SHEETS.map(s=>[s,{rows:(sheets[s]||[]).length,error:errors[s]||null}])),
    classification:{data:classifyData(data)},
    financialReference:{
      maintenanceWorkOrders:data.filter(r=>String(r["WO No"]||"").trim()!=="").length,
      contractorMaintenanceWorkOrders:contractorWOs.length,
      internalMaintenanceWorkOrders:internalWOs.length,
      projectsWithStartDate:startedProjects.length,
      projectTasks:devTasks.length,
      parts:parts.length,
      purchases:purchases.length,
      monthlySavingsRows:monthly.length
    },
    reviewRequired:[
      "Confirm exact Google Sheet column names and all sheet row counts against the original workbook.",
      "Confirm baseline_monthly values before any migration.",
      "Confirm ProjectManagement date parsing where source cells contain non-date text.",
      "No INSERT/UPDATE/DELETE has been performed by this preview."
    ]
  };
}

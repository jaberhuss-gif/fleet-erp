import express from "express";
import {ensureV2Schema,v2Enabled} from "./db.js";
import {getFinancialReportV2} from "./financial.js";
import {upsertDailySubmission,upsertDailyKm,createMaintenanceWorkOrder,addMaintenancePart,createProject,addProjectPart,listDailyExceptions} from "./workflow.js";
export async function mountV2(app){
 if(!v2Enabled()){console.log("[ERP V2] disabled: V2_DATABASE_URL is not configured");return false;}
 await ensureV2Schema();
 const r=express.Router();
 r.get("/health",async(_q,res)=>res.json({success:true,version:"v2"}));
 r.get("/financial",async(req,res)=>{try{res.json({success:true,...await getFinancialReportV2({from:req.query.from||null,to:req.query.to||null})});}catch(e){res.status(500).json({success:false,error:e.message});}});
 r.post("/daily-submission",async(req,res)=>{try{res.json({success:true,row:await upsertDailySubmission(req.body)});}catch(e){res.status(400).json({success:false,error:e.message});}});
 r.post("/daily-km",async(req,res)=>{try{res.json({success:true,row:await upsertDailyKm(req.body)});}catch(e){res.status(400).json({success:false,error:e.message});}});
 r.post("/maintenance/work-orders",async(req,res)=>{try{res.json({success:true,row:await createMaintenanceWorkOrder(req.body)});}catch(e){res.status(400).json({success:false,error:e.message});}});
 r.post("/maintenance/parts",async(req,res)=>{try{res.json({success:true,row:await addMaintenancePart(req.body)});}catch(e){res.status(400).json({success:false,error:e.message});}});
 r.post("/projects",async(req,res)=>{try{res.json({success:true,row:await createProject(req.body)});}catch(e){res.status(400).json({success:false,error:e.message});}});
 r.post("/projects/parts",async(req,res)=>{try{res.json({success:true,row:await addProjectPart(req.body)});}catch(e){res.status(400).json({success:false,error:e.message});}});
 r.get("/daily-exceptions/:date",async(req,res)=>{try{res.json({success:true,...await listDailyExceptions(req.params.date)});}catch(e){res.status(500).json({success:false,error:e.message});}});
 app.use("/api/v2",r);
 console.log("[ERP V2] mounted at /api/v2");
 return true;
}
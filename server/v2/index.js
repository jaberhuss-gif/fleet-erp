import express from "express";
import {ensureV2Schema,v2Enabled} from "./db.js";
import {getFinancialReportV2} from "./financial.js";
import {upsertDailySubmission,upsertDailyKm,createMaintenanceWorkOrder,addMaintenancePart,createProject,addProjectPart,listDailyExceptions} from "./workflow.js";
import {listVehicles,createVehicle,listDrivers,createDriver,listSites,createSite,listProjects,listMaintenance,listWarehouse,seedWarehouseLocations,listPurchaseRequests,createPurchaseRequest,listTickets,createTicket} from "./services.js";
import {buildFmmsMigrationPreview} from "./fmms-preview.js";
export async function mountV2(app){
 if(!v2Enabled()){console.log("[ERP V2] disabled: V2_DATABASE_URL is not configured");return false;}
 await ensureV2Schema();
 const r=express.Router();
 r.get("/health",async(_q,res)=>res.json({success:true,version:"v2"}));
 r.get("/vehicles",async(_q,res)=>{try{res.json({success:true,vehicles:await listVehicles()});}catch(e){res.status(500).json({success:false,error:e.message});}});
 r.post("/vehicles",async(req,res)=>{try{res.json({success:true,vehicle:await createVehicle(req.body)});}catch(e){res.status(400).json({success:false,error:e.message});}});
 r.get("/drivers",async(_q,res)=>{try{res.json({success:true,drivers:await listDrivers()});}catch(e){res.status(500).json({success:false,error:e.message});}});
 r.post("/drivers",async(req,res)=>{try{res.json({success:true,driver:await createDriver(req.body)});}catch(e){res.status(400).json({success:false,error:e.message});}});
 r.get("/sites",async(_q,res)=>{try{res.json({success:true,sites:await listSites()});}catch(e){res.status(500).json({success:false,error:e.message});}});
 r.post("/sites",async(req,res)=>{try{res.json({success:true,site:await createSite(req.body)});}catch(e){res.status(400).json({success:false,error:e.message});}});
 r.get("/maintenance",async(_q,res)=>{try{res.json({success:true,workOrders:await listMaintenance()});}catch(e){res.status(500).json({success:false,error:e.message});}});
 r.get("/projects",async(_q,res)=>{try{res.json({success:true,projects:await listProjects()});}catch(e){res.status(500).json({success:false,error:e.message});}});
 r.get("/warehouse",async(_q,res)=>{try{res.json({success:true,stock:await listWarehouse()});}catch(e){res.status(500).json({success:false,error:e.message});}});
 r.post("/warehouse/seed-locations",async(_q,res)=>{try{res.json({success:true,stock:await seedWarehouseLocations()});}catch(e){res.status(500).json({success:false,error:e.message});}});
 r.get("/purchase-requests",async(_q,res)=>{try{res.json({success:true,requests:await listPurchaseRequests()});}catch(e){res.status(500).json({success:false,error:e.message});}});
 r.post("/purchase-requests",async(req,res)=>{try{res.json({success:true,request:await createPurchaseRequest(req.body)});}catch(e){res.status(400).json({success:false,error:e.message});}});
 r.get("/tickets",async(_q,res)=>{try{res.json({success:true,tickets:await listTickets()});}catch(e){res.status(500).json({success:false,error:e.message});}});
 r.post("/tickets",async(req,res)=>{try{res.json({success:true,ticket:await createTicket(req.body)});}catch(e){res.status(400).json({success:false,error:e.message});}});
 r.get("/migration-preview",async(_q,res)=>{try{res.json(await buildFmmsMigrationPreview());}catch(e){res.status(502).json({success:false,error:e.message});}});
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
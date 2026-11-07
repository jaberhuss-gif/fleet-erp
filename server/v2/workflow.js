import { v2Query,v2Transaction } from "./db.js";
const s=v=>v==null?"":String(v).trim();
export async function upsertDailySubmission(x){
 const r=await v2Query("INSERT INTO fleet_erp_v2.daily_vehicle_submission(vehicle_id,submission_date,source,sheet_plate,sheet_driver,sheet_phone,submitted_at,status) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7='Submitted' THEN CURRENT_TIMESTAMP ELSE NULL END,$7) ON CONFLICT(vehicle_id,submission_date) DO UPDATE SET source=EXCLUDED.source,sheet_plate=EXCLUDED.sheet_plate,sheet_driver=EXCLUDED.sheet_driver,sheet_phone=EXCLUDED.sheet_phone,submitted_at=EXCLUDED.submitted_at,status=EXCLUDED.status RETURNING *",[x.vehicleId,x.date,x.source||"Google Sheet",s(x.sheetPlate),s(x.sheetDriver),s(x.sheetPhone),x.status]);
 return r.rows[0];
}
export async function upsertDailyKm(x){
 return v2Transaction(async c=>{
  const old=await c.query("SELECT current_km FROM fleet_erp_v2.vehicles WHERE id=$1 FOR UPDATE",[x.vehicleId]);
  if(!old.rows[0]) throw new Error("Vehicle not found");
  if(Number(x.readingKm)<0 || !Number.isFinite(Number(x.readingKm))){
   await c.query("INSERT INTO fleet_erp_v2.vehicle_alerts(vehicle_id,alert_type,severity,title,message,responsible_role) VALUES($1,'KM_INVALID','Critical','Invalid KM reading',$2,'FleetSupervisor') ON CONFLICT(vehicle_id,alert_type,alert_date) DO UPDATE SET message=EXCLUDED.message,status='Open',updated_at=CURRENT_TIMESTAMP",[x.vehicleId,"Invalid KM value submitted: "+String(x.readingKm)]);
   throw new Error("Invalid KM reading");
  }
  if(Number(x.readingKm)<Number(old.rows[0].current_km)){
   await c.query("INSERT INTO fleet_erp_v2.vehicle_alerts(vehicle_id,alert_type,severity,title,message,responsible_role) VALUES($1,'KM_DECREASING','Critical','KM reading decreased',$2,'FleetSupervisor') ON CONFLICT(vehicle_id,alert_type,alert_date) DO UPDATE SET message=EXCLUDED.message,status='Open',updated_at=CURRENT_TIMESTAMP",[x.vehicleId,"Submitted KM "+String(x.readingKm)+" is lower than current KM "+String(old.rows[0].current_km)]);
   throw new Error("KM reading cannot be lower than current KM");
  }
  const kr=await c.query("INSERT INTO fleet_erp_v2.km_readings(vehicle_id,reading_km,reading_date,entered_by,notes) VALUES($1,$2,$3,$4,$5) ON CONFLICT(vehicle_id,reading_date) DO UPDATE SET reading_km=EXCLUDED.reading_km,entered_by=EXCLUDED.entered_by,notes=EXCLUDED.notes RETURNING *",[x.vehicleId,x.readingKm,x.date,x.userId||null,s(x.notes)]);
  await c.query("UPDATE fleet_erp_v2.vehicles SET current_km=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2",[x.readingKm,x.vehicleId]);
  await c.query("INSERT INTO fleet_erp_v2.daily_km_compliance(vehicle_id,compliance_date,reading_id,status) VALUES($1,$2,$3,'Submitted') ON CONFLICT(vehicle_id,compliance_date) DO UPDATE SET reading_id=EXCLUDED.reading_id,status='Submitted'",[x.vehicleId,x.date,kr.rows[0].id]);
  return kr.rows[0];
 });
}
export async function createMaintenanceWorkOrder(x){
 const r=await v2Query("INSERT INTO fleet_erp_v2.maintenance_work_orders(wo_no,vehicle_id,site_id,category,priority,description,status,reported_date,completion_date,contractor_name,contractor_cost,internal_labor_cost,closing_notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *",[s(x.woNo)||"WO-"+Date.now(),x.vehicleId||null,x.siteId||null,s(x.category),s(x.priority)||"Medium",s(x.description),s(x.status)||"Open",x.reportedDate||new Date().toISOString().slice(0,10),x.completionDate||null,s(x.contractorName),Number(x.contractorCost||0),Number(x.internalLaborCost||0),s(x.closingNotes),x.createdBy||null]);
 return r.rows[0];
}
export async function addMaintenancePart(x){return (await v2Query("INSERT INTO fleet_erp_v2.maintenance_parts(work_order_id,part_name,quantity,unit_price) VALUES($1,$2,$3,$4) RETURNING *",[x.workOrderId,s(x.partName),x.quantity||1,x.unitPrice||0])).rows[0];}
export async function createProject(x){
 const r=await v2Query("INSERT INTO fleet_erp_v2.projects(project_no,site_id,description,start_date,end_date,status,contractor,contractor_cost,internal_labor_cost) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[s(x.projectNo)||"PRJ-"+Date.now(),x.siteId||null,s(x.description),x.startDate||null,x.endDate||null,s(x.status)||"Planned",s(x.contractor),Number(x.contractorCost||0),Number(x.internalLaborCost||0)]);
 return r.rows[0];
}
export async function addProjectPart(x){return (await v2Query("INSERT INTO fleet_erp_v2.project_parts(project_id,part_name,quantity,unit_price) VALUES($1,$2,$3,$4) RETURNING *",[x.projectId,s(x.partName),x.quantity||1,x.unitPrice||0])).rows[0];}
export async function listDailyExceptions(date){
 const a=await v2Query("SELECT v.id,v.plate_number,v.plate_code FROM fleet_erp_v2.vehicles v WHERE v.status='Active' AND NOT EXISTS(SELECT 1 FROM fleet_erp_v2.daily_vehicle_submission d WHERE d.vehicle_id=v.id AND d.submission_date=$1 AND d.status='Submitted') ORDER BY v.plate_number",[date]);
 const b=await v2Query("SELECT v.id,v.plate_number,v.plate_code FROM fleet_erp_v2.vehicles v WHERE v.status='Active' AND NOT EXISTS(SELECT 1 FROM fleet_erp_v2.daily_km_compliance k WHERE k.vehicle_id=v.id AND k.compliance_date=$1 AND k.status='Submitted') ORDER BY v.plate_number",[date]);
 return {date,missingVehicleSubmission:a.rows,missingKm:b.rows};
}
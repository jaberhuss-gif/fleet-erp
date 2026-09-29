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
 const generated=(await v2Query("SELECT 'WO-'||LPAD((COALESCE(MAX(NULLIF(regexp_replace(wo_no,'[^0-9]','','g'),'')::int,0))+1)::text,4,'0') wo_no FROM fleet_erp_v2.maintenance_work_orders")).rows[0]?.wo_no || "WO-0001";
 const r=await v2Query("INSERT INTO fleet_erp_v2.maintenance_work_orders(wo_no,vehicle_id,site_id,category,priority,description,status,reported_date,completion_date,contractor_name,contractor_cost,internal_labor_cost,closing_notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *",[s(x.woNo)||generated,x.vehicleId||null,x.siteId||null,s(x.category),s(x.priority)||"Medium",s(x.description),s(x.status)||"Open",x.reportedDate||new Date().toISOString().slice(0,10),x.completionDate||null,s(x.contractorName),Number(x.contractorCost||0),Number(x.internalLaborCost||0),s(x.closingNotes),x.createdBy||null]);
 return r.rows[0];
}
export async function addMaintenancePart(x){return (await v2Query("INSERT INTO fleet_erp_v2.maintenance_parts(work_order_id,part_name,quantity,unit_price) VALUES($1,$2,$3,$4) RETURNING *",[x.workOrderId,s(x.partName),x.quantity||1,x.unitPrice||0])).rows[0];}
export async function createProject(x){
 const generated=(await v2Query("SELECT 'PRJ-'||LPAD((COALESCE(MAX(NULLIF(regexp_replace(project_no,'[^0-9]','','g'),'')::int,0))+1)::text,4,'0') project_no FROM fleet_erp_v2.projects")).rows[0]?.project_no || "PRJ-0001";
 const r=await v2Query("INSERT INTO fleet_erp_v2.projects(project_no,site_id,description,start_date,end_date,status,contractor,contractor_cost,internal_labor_cost,name,budget) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",[s(x.projectNo)||generated,x.siteId||null,s(x.description),x.startDate||null,x.endDate||null,s(x.status)||"Planned",s(x.contractor),Number(x.contractorCost||0),Number(x.internalLaborCost||0),s(x.name)||s(x.description),Number(x.budget||0)]);
 return r.rows[0];
}
export async function addProjectPart(x){return (await v2Query("INSERT INTO fleet_erp_v2.project_parts(project_id,part_name,quantity,unit_price) VALUES($1,$2,$3,$4) RETURNING *",[x.projectId,s(x.partName),x.quantity||1,x.unitPrice||0])).rows[0];}
export async function listDailyExceptions(date){
 const a=await v2Query("SELECT v.id,v.plate_number,v.plate_code FROM fleet_erp_v2.vehicles v WHERE v.status='Active' AND NOT EXISTS(SELECT 1 FROM fleet_erp_v2.daily_vehicle_submission d WHERE d.vehicle_id=v.id AND d.submission_date=$1 AND d.status='Submitted') ORDER BY v.plate_number",[date]);
 const b=await v2Query("SELECT v.id,v.plate_number,v.plate_code FROM fleet_erp_v2.vehicles v WHERE v.status='Active' AND NOT EXISTS(SELECT 1 FROM fleet_erp_v2.daily_km_compliance k WHERE k.vehicle_id=v.id AND k.compliance_date=$1 AND k.status='Submitted') ORDER BY v.plate_number",[date]);
 return {date,missingVehicleSubmission:a.rows,missingKm:b.rows};
}

export async function updateMaintenanceWorkOrder(id,x){
  const r=await v2Query("UPDATE fleet_erp_v2.maintenance_work_orders SET site_id=COALESCE($2,site_id),category=COALESCE($3,category),priority=COALESCE($4,priority),description=COALESCE($5,description),reported_date=COALESCE($6,reported_date),contractor_name=COALESCE($7,contractor_name),contractor_cost=COALESCE($8,contractor_cost),internal_labor_cost=COALESCE($9,internal_labor_cost),closing_notes=COALESCE($10,closing_notes) WHERE id=$1 AND status <> 'Closed' RETURNING *",[id,x.siteId??null,s(x.category),s(x.priority),s(x.description),x.reportedDate||null,s(x.contractorName),Number(x.contractorCost||0),Number(x.internalLaborCost||0),s(x.closingNotes)]);
  return r.rows[0]||null;
}
export async function closeMaintenanceWorkOrder(id,x){
  return v2Transaction(async c=>{
    const current=(await c.query("SELECT * FROM fleet_erp_v2.maintenance_work_orders WHERE id=$1 FOR UPDATE",[id])).rows[0];
    if(!current) return null;
    if(current.status==='Closed') return current;
    const contractor=Number(x.contractorCost||0),labor=Number(x.internalLaborCost||0);
    const parts=Number((await c.query("SELECT COALESCE(SUM(total_price),0) total FROM fleet_erp_v2.maintenance_parts WHERE work_order_id=$1",[id])).rows[0].total||0);
    const purchases=Number((await c.query("SELECT COALESCE(SUM(total_cost),0) total FROM fleet_erp_v2.maintenance_purchases WHERE work_order_id=$1 AND supplier_type='Contractor'",[id])).rows[0].total||0);
    const total=Number(x.finalTotal ?? (contractor+labor+parts+purchases));
    return (await c.query("UPDATE fleet_erp_v2.maintenance_work_orders SET status='Closed',completion_date=COALESCE($2,CURRENT_DATE),contractor_cost=$3,internal_labor_cost=$4,final_total=$5,closing_notes=$6,closed_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",[id,x.completionDate||null,contractor,labor,total,s(x.closingNotes)])).rows[0];
  });
}
export async function deleteMaintenanceWorkOrder(id){
  const r=await v2Query("DELETE FROM fleet_erp_v2.maintenance_work_orders WHERE id=$1 AND status <> 'Closed' RETURNING id",[id]); return !!r.rows[0];
}

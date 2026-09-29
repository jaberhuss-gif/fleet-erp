import { v2Query } from "./db.js";

export async function listVehicles(){return (await v2Query("SELECT v.*,d.full_name driver_name,d.phone driver_phone,s.name site_name FROM fleet_erp_v2.vehicles v LEFT JOIN fleet_erp_v2.drivers d ON d.id=v.driver_id LEFT JOIN fleet_erp_v2.sites s ON s.id=v.site_id ORDER BY v.plate_number,v.plate_code")).rows;}
export async function getVehicle(id){return (await v2Query("SELECT v.*,d.full_name driver_name,d.phone driver_phone,s.name site_name FROM fleet_erp_v2.vehicles v LEFT JOIN fleet_erp_v2.drivers d ON d.id=v.driver_id LEFT JOIN fleet_erp_v2.sites s ON s.id=v.site_id WHERE v.id=$1",[id])).rows[0]||null;}
export async function createVehicle(x){return (await v2Query("INSERT INTO fleet_erp_v2.vehicles(plate_number,plate_code,make,model,year,site_id,driver_id,legacy_location,legacy_driver_name,legacy_driver_phone,current_km,last_oil_km,oil_interval_km,last_oil_change_date,inspection_last_date,inspection_due_date,registration_expiry,insurance_expiry,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *",[x.plateNumber||"",x.plateCode||"",x.make||null,x.model||null,x.year||null,x.siteId||null,x.driverId||null,x.legacyLocation||"",x.legacyDriverName||"",x.legacyDriverPhone||"",x.currentKm??0,x.lastOilKm??0,x.oilIntervalKm??5000,x.lastOilChangeDate||null,x.inspectionLastDate||null,x.inspectionDueDate||null,x.registrationExpiry||null,x.insuranceExpiry||null,x.status||"Active",x.notes||null])).rows[0];}
export async function updateVehicle(id,x){return (await v2Query("UPDATE fleet_erp_v2.vehicles SET plate_number=COALESCE($2,plate_number),plate_code=COALESCE($3,plate_code),make=COALESCE($4,make),model=COALESCE($5,model),year=COALESCE($6,year),site_id=COALESCE($7,site_id),driver_id=COALESCE($8,driver_id),legacy_location=COALESCE($9,legacy_location),legacy_driver_name=COALESCE($10,legacy_driver_name),legacy_driver_phone=COALESCE($11,legacy_driver_phone),current_km=COALESCE($12,current_km),last_oil_km=COALESCE($13,last_oil_km),oil_interval_km=COALESCE($14,oil_interval_km),last_oil_change_date=COALESCE($15,last_oil_change_date),inspection_last_date=COALESCE($16,inspection_last_date),inspection_due_date=COALESCE($17,inspection_due_date),registration_expiry=COALESCE($18,registration_expiry),insurance_expiry=COALESCE($19,insurance_expiry),status=COALESCE($20,status),notes=COALESCE($21,notes),updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",[id,x.plateNumber??null,x.plateCode??null,x.make??null,x.model??null,x.year??null,x.siteId??null,x.driverId??null,x.legacyLocation??null,x.legacyDriverName??null,x.legacyDriverPhone??null,x.currentKm??null,x.lastOilKm??null,x.oilIntervalKm??null,x.lastOilChangeDate??null,x.inspectionLastDate??null,x.inspectionDueDate??null,x.registrationExpiry??null,x.insuranceExpiry??null,x.status??null,x.notes??null])).rows[0]||null;}
export async function recordOilChange(id,x){return (await v2Query("UPDATE fleet_erp_v2.vehicles SET last_oil_km=$2,last_oil_change_date=$3,oil_interval_km=COALESCE($4,oil_interval_km),updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",[id,x.km,x.date||new Date().toISOString().slice(0,10),x.intervalKm??null])).rows[0]||null;}
export async function listDrivers(){return (await v2Query("SELECT d.*,s.name site_name FROM fleet_erp_v2.drivers d LEFT JOIN fleet_erp_v2.sites s ON s.id=d.site_id ORDER BY d.full_name")).rows;}
export async function createDriver(x){return (await v2Query("INSERT INTO fleet_erp_v2.drivers(employee_no,full_name,phone,status,site_id) VALUES($1,$2,$3,$4,$5) RETURNING *",[x.employeeNo||null,x.fullName,x.phone||"",x.status||"Active",x.siteId||null])).rows[0];}
export async function listSites(){return (await v2Query("SELECT * FROM fleet_erp_v2.sites ORDER BY name")).rows;}
export async function createSite(x){return (await v2Query("INSERT INTO fleet_erp_v2.sites(code,name,region,campus_manager,phone,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[x.code||null,x.name,x.region||"",x.campusManager||"",x.phone||"",x.status||"Active"])).rows[0];}

export async function listProjects(){return (await v2Query("SELECT p.*,s.name site_name FROM fleet_erp_v2.projects p LEFT JOIN fleet_erp_v2.sites s ON s.id=p.site_id ORDER BY p.start_date DESC NULLS LAST,p.id DESC")).rows;}
export async function listMaintenance(){return (await v2Query("SELECT w.*,v.plate_number,v.plate_code,s.name site_name,COALESCE((SELECT SUM(mp.total_price) FROM fleet_erp_v2.maintenance_parts mp WHERE mp.work_order_id=w.id),0) parts_cost,COALESCE(w.final_total,w.contractor_cost+w.internal_labor_cost+COALESCE((SELECT SUM(mp.total_price) FROM fleet_erp_v2.maintenance_parts mp WHERE mp.work_order_id=w.id),0)) final_cost FROM fleet_erp_v2.maintenance_work_orders w LEFT JOIN fleet_erp_v2.vehicles v ON v.id=w.vehicle_id LEFT JOIN fleet_erp_v2.sites s ON s.id=w.site_id ORDER BY w.reported_date DESC,w.id DESC")).rows;}

export async function listWarehouse(){return (await v2Query("SELECT ws.*,wl.code location_code,wl.name location_name,wi.item_code,wi.name item_name,wi.unit,wi.min_stock FROM fleet_erp_v2.warehouse_stock ws JOIN fleet_erp_v2.warehouse_locations wl ON wl.id=ws.location_id JOIN fleet_erp_v2.warehouse_items wi ON wi.id=ws.item_id ORDER BY wi.name,wl.code")).rows;}
export async function seedWarehouseLocations(){const rows=[["MAIN","Main Warehouse"],["UQL","Uqlat Al-Suqour"],["HAD","Al-Haddar"],["SAB","Al Sabiyah"],["QUW","Al Quwayiyah"],["MAH","Mahd ad Dhahab"],["WB","Wadi Bida"],["HUL","Al-Halifa"]];for(const x of rows)await v2Query("INSERT INTO fleet_erp_v2.warehouse_locations(code,name) VALUES($1,$2) ON CONFLICT(code) DO NOTHING",x);return listWarehouse();}

export async function listPurchaseRequests(){return (await v2Query("SELECT pr.*,s.name site_name,u.full_name requester_name FROM fleet_erp_v2.purchase_requests pr LEFT JOIN fleet_erp_v2.sites s ON s.id=pr.site_id LEFT JOIN fleet_erp_v2.users u ON u.id=pr.requested_by ORDER BY pr.created_at DESC")).rows;}
export async function createPurchaseRequest(x){return (await v2Query("INSERT INTO fleet_erp_v2.purchase_requests(request_no,requested_by,site_id,department,status,notes) VALUES($1,$2,$3,$4,'Pending',$5) RETURNING *",[x.requestNo||"PR-"+Date.now(),x.requestedBy||null,x.siteId||null,x.department||"",x.notes||""])).rows[0];}

export async function listTickets(){return (await v2Query("SELECT t.*,v.plate_number,v.plate_code,s.name site_name,u.full_name reporter_name FROM fleet_erp_v2.tickets t LEFT JOIN fleet_erp_v2.vehicles v ON v.id=t.vehicle_id LEFT JOIN fleet_erp_v2.sites s ON s.id=t.site_id LEFT JOIN fleet_erp_v2.users u ON u.id=t.reported_by ORDER BY t.opened_at DESC")).rows;}
export async function createTicket(x){return (await v2Query("INSERT INTO fleet_erp_v2.tickets(title,category,priority,status,vehicle_id,site_id,reported_by,assigned_to,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[x.title,x.category||"",x.priority||"Medium",x.status||"Open",x.vehicleId||null,x.siteId||null,x.reportedBy||null,x.assignedTo||null,x.description||""])).rows[0];}

export async function listVehicleAlerts(){return (await v2Query(`SELECT a.*,v.plate_number,v.plate_code,v.status vehicle_status,s.name site_name FROM fleet_erp_v2.vehicle_alerts a JOIN fleet_erp_v2.vehicles v ON v.id=a.vehicle_id LEFT JOIN fleet_erp_v2.sites s ON s.id=v.site_id WHERE a.status <> 'Closed' ORDER BY CASE a.severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,a.due_date NULLS LAST,a.created_at DESC`)).rows;}

export async function refreshVehicleAlerts(){
 const vehicles=(await v2Query(`SELECT v.id,v.plate_number,v.plate_code,v.current_km,v.last_oil_km,v.oil_interval_km,v.inspection_due_date,v.registration_expiry,v.insurance_expiry,v.status FROM fleet_erp_v2.vehicles v`)).rows;
 for(const v of vehicles){
   const today=new Date().toISOString().slice(0,10);
   const plate=[v.plate_number,v.plate_code].filter(Boolean).join(' ');
   const kmToday=(await v2Query("SELECT 1 FROM fleet_erp_v2.daily_km_compliance WHERE vehicle_id=$1 AND compliance_date=$2 AND status='Submitted' LIMIT 1",[v.id,today])).rows.length>0;
   const subToday=(await v2Query("SELECT 1 FROM fleet_erp_v2.daily_vehicle_submission WHERE vehicle_id=$1 AND submission_date=$2 AND status='Submitted' LIMIT 1",[v.id,today])).rows.length>0;
   if(v.status==='Active' && !kmToday){
     await v2Query(`INSERT INTO fleet_erp_v2.vehicle_alerts(vehicle_id,alert_type,severity,title,message,responsible_role,due_date) VALUES($1,'KM_MISSING','High','KM reading missing today',$2,'FleetSupervisor',CURRENT_DATE) ON CONFLICT(vehicle_id,alert_type,alert_date) DO UPDATE SET message=EXCLUDED.message,status=CASE WHEN fleet_erp_v2.vehicle_alerts.status='Closed' THEN 'Open' ELSE fleet_erp_v2.vehicle_alerts.status END,updated_at=CURRENT_TIMESTAMP`,[v.id,plate+' has no submitted KM reading for today.']);
   }
   if(v.status==='Active' && !subToday){
     await v2Query(`INSERT INTO fleet_erp_v2.vehicle_alerts(vehicle_id,alert_type,severity,title,message,responsible_role,due_date) VALUES($1,'DAILY_SUBMISSION_MISSING','High','Daily vehicle submission missing',$2,'FleetSupervisor',CURRENT_DATE) ON CONFLICT(vehicle_id,alert_type,alert_date) DO UPDATE SET message=EXCLUDED.message,status=CASE WHEN fleet_erp_v2.vehicle_alerts.status='Closed' THEN 'Open' ELSE fleet_erp_v2.vehicle_alerts.status END,updated_at=CURRENT_TIMESTAMP`,[v.id,plate+' has no Google Sheet daily submission for today.']);
   }
   const sinceOil=Number(v.current_km||0)-Number(v.last_oil_km||0);
   if(sinceOil >= Number(v.oil_interval_km||5000)){
     await v2Query(`INSERT INTO fleet_erp_v2.vehicle_alerts(vehicle_id,alert_type,severity,title,message,responsible_role,due_date) VALUES($1,'OIL_OVERDUE','Critical','Oil service overdue',$2,'FleetSupervisor',CURRENT_DATE) ON CONFLICT(vehicle_id,alert_type,alert_date) DO UPDATE SET message=EXCLUDED.message,severity=EXCLUDED.severity,status=CASE WHEN fleet_erp_v2.vehicle_alerts.status='Closed' THEN 'Open' ELSE fleet_erp_v2.vehicle_alerts.status END,updated_at=CURRENT_TIMESTAMP`,[v.id,plate+' has '+Math.max(0,sinceOil).toLocaleString()+' km since the last oil change.']);
   } else if(sinceOil >= Math.max(0,Number(v.oil_interval_km||5000)-500)){
     await v2Query(`INSERT INTO fleet_erp_v2.vehicle_alerts(vehicle_id,alert_type,severity,title,message,responsible_role,due_date) VALUES($1,'OIL_DUE_SOON','High','Oil service due soon',$2,'FleetSupervisor',CURRENT_DATE) ON CONFLICT(vehicle_id,alert_type,alert_date) DO UPDATE SET message=EXCLUDED.message,severity=EXCLUDED.severity,status=CASE WHEN fleet_erp_v2.vehicle_alerts.status='Closed' THEN 'Open' ELSE fleet_erp_v2.vehicle_alerts.status END,updated_at=CURRENT_TIMESTAMP`,[v.id,plate+' is approaching the '+Number(v.oil_interval_km||5000).toLocaleString()+' km oil interval.']);
   }
   for(const [field,type,severity,title,role] of [['inspection_due_date','INSPECTION','High','Government inspection due','FleetSupervisor'],['registration_expiry','REGISTRATION','High','Registration expiry approaching','FleetSupervisor'],['insurance_expiry','INSURANCE','High','Insurance expiry approaching','FleetSupervisor']]){
     const d=v[field]; if(!d) continue;
     const days=Math.ceil((new Date(d+'T00:00:00Z')-new Date(new Date().toISOString().slice(0,10)+'T00:00:00Z'))/86400000);
     if(days<=30){
       const sev=days<0?'Critical':severity;
       const title2=days<0?title.replace('approaching','expired'):title;
       await v2Query(`INSERT INTO fleet_erp_v2.vehicle_alerts(vehicle_id,alert_type,severity,title,message,responsible_role,due_date) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(vehicle_id,alert_type,alert_date) DO UPDATE SET message=EXCLUDED.message,severity=EXCLUDED.severity,title=EXCLUDED.title,status=CASE WHEN fleet_erp_v2.vehicle_alerts.status='Closed' THEN 'Open' ELSE fleet_erp_v2.vehicle_alerts.status END,updated_at=CURRENT_TIMESTAMP`,[v.id,type,sev,title2,plate+' date is '+String(d).slice(0,10)+' ('+(days<0?'expired '+Math.abs(days)+' days ago':days+' days remaining')+').',role,d]);
     }
   }
   if(v.status && ['Maintenance','Out of Service','Unavailable'].includes(v.status)){
     await v2Query(`INSERT INTO fleet_erp_v2.vehicle_alerts(vehicle_id,alert_type,severity,title,message,responsible_role) VALUES($1,'VEHICLE_STATUS','High','Vehicle unavailable',$2,'FleetSupervisor') ON CONFLICT(vehicle_id,alert_type,alert_date) DO UPDATE SET message=EXCLUDED.message,status=CASE WHEN fleet_erp_v2.vehicle_alerts.status='Closed' THEN 'Open' ELSE fleet_erp_v2.vehicle_alerts.status END,updated_at=CURRENT_TIMESTAMP`,[v.id,plate+' is currently marked as '+v.status+'.']);
   }
 }
 return listVehicleAlerts();
}

export async function closeVehicleAlert(id){return (await v2Query(`UPDATE fleet_erp_v2.vehicle_alerts SET status='Closed',closed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,[id])).rows[0]||null;}

export async function getVehicle360(id){
 const vehicle=await getVehicle(id); if(!vehicle)return null;
 const [readings,alerts,submissions,compliance,maintenance,tickets,schedules,documents,tires]=await Promise.all([
  v2Query("SELECT * FROM fleet_erp_v2.km_readings WHERE vehicle_id=$1 ORDER BY reading_date DESC,id DESC LIMIT 60",[id]),
  v2Query("SELECT * FROM fleet_erp_v2.vehicle_alerts WHERE vehicle_id=$1 ORDER BY CASE severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,created_at DESC",[id]),
  v2Query("SELECT * FROM fleet_erp_v2.daily_vehicle_submission WHERE vehicle_id=$1 ORDER BY submission_date DESC LIMIT 30",[id]),
  v2Query("SELECT * FROM fleet_erp_v2.daily_km_compliance WHERE vehicle_id=$1 ORDER BY compliance_date DESC LIMIT 30",[id]),
  v2Query("SELECT w.*,COALESCE((SELECT SUM(mp.total_price) FROM fleet_erp_v2.maintenance_parts mp WHERE mp.work_order_id=w.id),0) parts_cost FROM fleet_erp_v2.maintenance_work_orders w WHERE w.vehicle_id=$1 ORDER BY w.reported_date DESC,w.id DESC LIMIT 50",[id]),
  v2Query("SELECT * FROM fleet_erp_v2.tickets WHERE vehicle_id=$1 ORDER BY opened_at DESC LIMIT 50",[id]),
  v2Query("SELECT * FROM fleet_erp_v2.vehicle_maintenance_schedules WHERE vehicle_id=$1 ORDER BY next_due_date NULLS LAST,next_due_km NULLS LAST",[id]),
  v2Query("SELECT * FROM fleet_erp_v2.vehicle_documents WHERE vehicle_id=$1 ORDER BY expiry_date NULLS LAST",[id]),
  v2Query("SELECT * FROM fleet_erp_v2.vehicle_tires WHERE vehicle_id=$1 ORDER BY position",[id])
 ]);
 return {vehicle,readings:readings.rows,alerts:alerts.rows,submissions:submissions.rows,compliance:compliance.rows,maintenance:maintenance.rows,tickets:tickets.rows,schedules:schedules.rows,documents:documents.rows,tires:tires.rows};
}

export async function getFleetDashboard(date){
 const d=date||new Date().toISOString().slice(0,10);
 const [tot,km,sub,alerts,maint,tickets]=await Promise.all([
  v2Query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='Active')::int active,COUNT(*) FILTER(WHERE status <> 'Active')::int unavailable FROM fleet_erp_v2.vehicles"),
  v2Query("SELECT COUNT(*)::int submitted FROM fleet_erp_v2.daily_km_compliance WHERE compliance_date=$1 AND status='Submitted'",[d]),
  v2Query("SELECT COUNT(*)::int submitted FROM fleet_erp_v2.daily_vehicle_submission WHERE submission_date=$1 AND status='Submitted'",[d]),
  v2Query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE severity='Critical')::int critical,COUNT(*) FILTER(WHERE severity='High')::int high FROM fleet_erp_v2.vehicle_alerts WHERE status <> 'Closed'"),
  v2Query("SELECT COUNT(*)::int total FROM fleet_erp_v2.maintenance_work_orders WHERE status <> 'Closed'"),
  v2Query("SELECT COUNT(*)::int total FROM fleet_erp_v2.tickets WHERE status <> 'Closed'")
 ]);
 return {date:d,vehicles:tot.rows[0],kmCompliance:km.rows[0],dailySubmission:sub.rows[0],alerts:alerts.rows[0],openMaintenance:maint.rows[0].total,openTickets:tickets.rows[0].total};
}

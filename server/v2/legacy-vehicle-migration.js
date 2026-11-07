import { query as legacyQuery } from "../postgres.js";
import { v2Query, v2Transaction } from "./db.js";

const s=v=>v==null?"":String(v).trim();
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};
const date=v=>{const x=s(v); return /^\d{4}-\d{2}-\d{2}$/.test(x)?x:null;};

export async function previewLegacyVehicleMigration(){
 const result=await legacyQuery("SELECT id,plate_number,plate_code,make,model,year,status,location,driver,phone,current_km,last_oil_km,oil_change_interval,last_oil_change_date,meter_updated_at,created_at,updated_at FROM vehicles ORDER BY id");
 const existing=(await v2Query("SELECT legacy_vehicle_id,plate_number,plate_code FROM fleet_erp_v2.vehicles ORDER BY legacy_vehicle_id")).rows;
 const seen=new Set(existing.filter(x=>x.legacy_vehicle_id!=null).map(x=>String(x.legacy_vehicle_id)));
 const normalizedPlate=v=>[s(v.plate_number),s(v.plate_code).toUpperCase()].filter(Boolean).join(" ").replace(/\\s+/g," ").trim();
 const plateCounts=new Map();
 for(const v of result.rows){const k=normalizedPlate(v).toUpperCase();plateCounts.set(k,(plateCounts.get(k)||0)+1);}
 const rows=result.rows.map(v=>({legacyId:v.id,plate:normalizedPlate(v),location:s(v.location),driver:s(v.driver),currentKm:n(v.current_km),alreadyMigrated:seen.has(String(v.id)),duplicatePlate:(plateCounts.get(normalizedPlate(v).toUpperCase())||0)>1}));
 return {sourceCount:rows.length,alreadyMigrated:rows.filter(x=>x.alreadyMigrated).length,pending:rows.filter(x=>!x.alreadyMigrated).length,duplicatePlates:rows.filter(x=>x.duplicatePlate).length,rows};
}

export async function migrateLegacyVehicles(){
 const source=await legacyQuery("SELECT id,plate_number,plate_code,make,model,year,status,location,driver,phone,current_km,last_oil_km,oil_change_interval,last_oil_change_date,meter_updated_at,created_at,updated_at FROM vehicles ORDER BY id");
 return v2Transaction(async c=>{
   let inserted=0,updated=0,drivers=0,sites=0;
   for(const v of source.rows){
     const legacyId=v.id, plateNumber=s(v.plate_number), plateCode=s(v.plate_code).toUpperCase();
     if(!plateNumber) continue;
     const siteName=s(v.location);
     let siteId=null;
     if(siteName){
       const sr=await c.query("SELECT id FROM fleet_erp_v2.sites WHERE lower(name)=lower($1) LIMIT 1",[siteName]);
       if(sr.rows[0]) siteId=sr.rows[0].id;
       else { const ins=await c.query("INSERT INTO fleet_erp_v2.sites(name,status) VALUES($1,'Active') RETURNING id",[siteName]); siteId=ins.rows[0].id; sites++; }
     }
     const driverName=s(v.driver); let driverId=null;
     if(driverName){
       const dr=await c.query("SELECT id FROM fleet_erp_v2.drivers WHERE lower(full_name)=lower($1) LIMIT 1",[driverName]);
       if(dr.rows[0]) driverId=dr.rows[0].id;
       else { const ins=await c.query("INSERT INTO fleet_erp_v2.drivers(full_name,phone,status,site_id) VALUES($1,$2,'Active',$3) RETURNING id",[driverName,s(v.phone),siteId]); driverId=ins.rows[0].id; drivers++; }
     }
     const existing=await c.query("SELECT id FROM fleet_erp_v2.vehicles WHERE legacy_vehicle_id=$1 OR (plate_number=$2 AND plate_code=$3) LIMIT 1",[legacyId,plateNumber,plateCode]);
     const params=[legacyId,plateNumber,plateCode,s(v.make)||null,s(v.model)||null,v.year||null,siteId,driverId,siteName,s(v.driver),s(v.phone),n(v.current_km),n(v.last_oil_km),n(v.oil_change_interval)||5000,date(v.last_oil_change_date),v.meter_updated_at||null,null,date(v.updated_at)||null];
     if(existing.rows[0]){
       await c.query("UPDATE fleet_erp_v2.vehicles SET legacy_vehicle_id=$1,plate_number=$2,plate_code=$3,make=$4,model=$5,year=$6,site_id=$7,driver_id=$8,legacy_location=$9,legacy_driver_name=$10,legacy_driver_phone=$11,current_km=$12,last_oil_km=$13,oil_interval_km=$14,last_oil_change_date=$15,meter_updated_at=COALESCE($16,meter_updated_at),updated_at=CURRENT_TIMESTAMP WHERE id=$17",[...params.slice(0,16),existing.rows[0].id]);
       updated++;
     }else{
       await c.query("INSERT INTO fleet_erp_v2.vehicles(legacy_vehicle_id,plate_number,plate_code,make,model,year,site_id,driver_id,legacy_location,legacy_driver_name,legacy_driver_phone,current_km,last_oil_km,oil_interval_km,last_oil_change_date,meter_updated_at,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'Active',COALESCE($17,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)",[...params.slice(0,16),v.created_at||null]);
       inserted++;
     }
   }
   return {sourceCount:source.rows.length,inserted,updated,driversCreated:drivers,sitesCreated:sites};
 });
}

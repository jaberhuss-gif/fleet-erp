import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let pool = null;
export function v2Enabled(){ return !!process.env.V2_DATABASE_URL; }
export function getV2Pool(){
  if(pool) return pool;
  if(!process.env.V2_DATABASE_URL) throw new Error("V2_DATABASE_URL is not configured");
  pool=new Pool({connectionString:process.env.V2_DATABASE_URL,ssl:{rejectUnauthorized:false},max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:5000});
  return pool;
}
export async function v2Query(sql,params=[]){ return getV2Pool().query(sql,params); }
export async function v2Transaction(fn){
  const client=await getV2Pool().connect();
  try{await client.query("BEGIN");const r=await fn(client);await client.query("COMMIT");return r;}
  catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}finally{client.release();}
}
export async function ensureV2Schema(){
  // Schema changes are managed by explicit migrations, not on every server startup.
  // This function only verifies that the V2 schema is reachable.
  await v2Query("SELECT 1 FROM fleet_erp_v2.financial_settings WHERE id = 1");
  return true;
}
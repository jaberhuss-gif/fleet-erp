import pg from "pg";
const { Pool } = pg;
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
  await v2Query("SELECT 1 FROM fleet_erp_v2.financial_settings WHERE id = 1");
  // Legacy-to-V2 migration is opt-in. V2 startup must never silently copy
  // production data or rerun a migration just because the service restarted.
  // Set V2_AUTO_MIGRATE=true only for an explicit migration run.
  if (process.env.V2_AUTO_MIGRATE === "true") {
    const { migrateLegacyToV2 } = await import("./migrateLegacyToV2.mjs");
    const result = await migrateLegacyToV2();
    if (!result.skipped) console.log("[V2 Migration] completed", result.counts);
  }
  return true;
}
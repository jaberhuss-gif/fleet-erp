import { v2Query } from "./db.js";

export async function getFinancialReportV2({from=null,to=null}={}){
  const settings=(await v2Query("SELECT maintenance_salary_monthly,development_salary_monthly FROM fleet_erp_v2.financial_settings WHERE id=1")).rows[0];
  const params=[];const where=[];
  if(from){params.push(from);where.push("month_start >= $"+params.length);}
  if(to){params.push(to);where.push("month_start <= $"+params.length);}
  const baseline=(await v2Query("SELECT month_start,maintenance_baseline,development_baseline FROM fleet_erp_v2.baseline_monthly "+(where.length?"WHERE "+where.join(" AND "):"")+" ORDER BY month_start",params)).rows;
  const rows=[];
  for(const b of baseline){
    const d=new Date(String(b.month_start)+"T00:00:00Z");const y=d.getUTCFullYear(),m=d.getUTCMonth()+1;
    const start=y+"-"+String(m).padStart(2,"0")+"-01";
    const next=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
    const maintenance=(await v2Query(
      "SELECT COALESCE(SUM(contractor_cost),0) contractor_wo,COALESCE(SUM(internal_labor_cost),0) internal_wo,"+
      "(SELECT COALESCE(SUM(mp.total_cost),0) FROM fleet_erp_v2.maintenance_purchases mp JOIN fleet_erp_v2.maintenance_work_orders mw ON mw.id=mp.work_order_id WHERE mw.reported_date >= $1 AND mw.reported_date < $2 AND lower(mp.supplier_type)='contractor') parts_wo "+
      "FROM fleet_erp_v2.maintenance_work_orders WHERE reported_date >= $1 AND reported_date < $2",[start,next])).rows[0];
    const development=(await v2Query(
      "SELECT COALESCE(SUM(contractor_cost),0) contractor_dev,COALESCE(SUM(internal_labor_cost),0) internal_dev,"+
      "(SELECT COALESCE(SUM(pp.total_cost),0) FROM fleet_erp_v2.project_purchases pp JOIN fleet_erp_v2.projects p ON p.id=pp.project_id WHERE p.start_date >= $1 AND p.start_date < $2 AND lower(pp.supplier_type)='contractor') parts_dev "+
      "FROM fleet_erp_v2.projects WHERE start_date IS NOT NULL AND start_date >= $1 AND start_date < $2",[start,next])).rows[0];
    const salary=Number(settings.maintenance_salary_monthly)+Number(settings.development_salary_monthly);
    const contractorWO=Number(maintenance.contractor_wo),contractorDev=Number(development.contractor_dev);
    const partsWO=Number(maintenance.parts_wo),partsDev=Number(development.parts_dev);
    const actual=contractorWO+contractorDev+partsWO+partsDev+salary;
    const totalBaseline=Number(b.maintenance_baseline)+Number(b.development_baseline);
    const savings=totalBaseline-actual;
    rows.push({month:start.slice(0,7),year:y,contractorWO,contractorDev,partsWO,partsDev,totalLabor:contractorWO+contractorDev+salary,totalParts:partsWO+partsDev,salary,actual,maintenanceBaseline:Number(b.maintenance_baseline),developmentBaseline:Number(b.development_baseline),totalBaseline,savings,savingsPercent:totalBaseline?savings/totalBaseline*100:0});
  }
  const totals=rows.reduce((a,r)=>({baseline:a.baseline+r.totalBaseline,actual:a.actual+r.actual,savings:a.savings+r.savings}),{baseline:0,actual:0,savings:0});
  return {rules:{maintenanceSalaryMonthly:Number(settings.maintenance_salary_monthly),developmentSalaryMonthly:Number(settings.development_salary_monthly),actual:"Contractor WO/Dev + Parts WO/Dev + salary",savings:"Baseline - Actual",savingsPercent:"Total Savings / Total Baseline * 100"},months:rows,totals:{...totals,savingsPercent:totals.baseline?totals.savings/totals.baseline*100:0,months:rows.length}};
}
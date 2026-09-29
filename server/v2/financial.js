import { v2Query } from "./db.js";

export async function getFinancialReportV2({from=null,to=null}={}){
  const settings=(await v2Query("SELECT maintenance_salary_monthly,development_salary_monthly FROM fleet_erp_v2.financial_settings WHERE id=1")).rows[0] || {maintenance_salary_monthly:2200,development_salary_monthly:2200};
  const params=[];const where=[];
  if(from){params.push(from);where.push("month_start >= $"+params.length);}
  if(to){params.push(to);where.push("month_start <= $"+params.length);}
  const baseline=(await v2Query("SELECT month_start,maintenance_baseline,development_baseline FROM fleet_erp_v2.baseline_monthly "+(where.length?"WHERE "+where.join(" AND "):"")+" ORDER BY month_start",params)).rows;
  const rows=[];
  for(const b of baseline){
    const d=new Date(String(b.month_start)+"T00:00:00Z"),y=d.getUTCFullYear(),m=d.getUTCMonth()+1;
    const start=y+"-"+String(m).padStart(2,"0")+"-01",next=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
    const maintenance=(await v2Query(
      "SELECT COALESCE(SUM(w.contractor_cost),0) contractor_wo,COALESCE(SUM(w.internal_labor_cost),0) internal_wo,"+
      
      "(SELECT COALESCE(SUM(mp.total_cost),0) FROM fleet_erp_v2.maintenance_purchases mp JOIN fleet_erp_v2.maintenance_work_orders mw ON mw.id=mp.work_order_id WHERE mp.supplier_type='Contractor' AND mw.reported_date >= $1 AND mw.reported_date < $2 AND mp.purchase_date >= date_trunc('month',mw.reported_date) AND mp.purchase_date < date_trunc('month',mw.reported_date)+interval '1 month') parts_purchases "+
      "FROM fleet_erp_v2.maintenance_work_orders w WHERE w.reported_date >= $1 AND w.reported_date < $2",[start,next])).rows[0];
    const development=(await v2Query(
      "SELECT COALESCE(SUM(p.contractor_cost),0) contractor_dev,COALESCE(SUM(p.internal_labor_cost),0) internal_dev,"+
      
      "(SELECT COALESCE(SUM(pp.total_cost),0) FROM fleet_erp_v2.project_purchases pp JOIN fleet_erp_v2.projects px ON px.id=pp.project_id WHERE pp.supplier_type='Contractor' AND COALESCE(px.end_date,px.start_date) >= $1 AND COALESCE(px.end_date,px.start_date) < $2) parts_purchases "+
      "FROM fleet_erp_v2.projects p WHERE COALESCE(p.end_date,p.start_date) IS NOT NULL AND COALESCE(p.end_date,p.start_date) >= $1 AND COALESCE(p.end_date,p.start_date) < $2",[start,next])).rows[0];
    const salary=Number(settings.maintenance_salary_monthly)+Number(settings.development_salary_monthly);
    const contractorWO=Number(maintenance.contractor_wo),contractorDev=Number(development.contractor_dev);
    const partsWO=Number(maintenance.parts_purchases);
    const partsDev=Number(development.parts_purchases);
    const actual=contractorWO+contractorDev+partsWO+partsDev+salary;
    const totalBaseline=Number(b.maintenance_baseline)+Number(b.development_baseline),savings=totalBaseline-actual;
    rows.push({month:start.slice(0,7),year:y,contractorWO,contractorDev,partsWO,partsDev,internalWO:Number(maintenance.internal_wo),internalDev:Number(development.internal_dev),maintenanceSalary:Number(settings.maintenance_salary_monthly),developmentSalary:Number(settings.development_salary_monthly),salary,actual,maintenanceBaseline:Number(b.maintenance_baseline),developmentBaseline:Number(b.development_baseline),totalBaseline,savings,savingsPercent:totalBaseline?savings/totalBaseline*100:0});
  }
  const totals=rows.reduce((a,r)=>({baseline:a.baseline+r.totalBaseline,actual:a.actual+r.actual,savings:a.savings+r.savings}),{baseline:0,actual:0,savings:0});
  return {rules:{maintenanceSalaryMonthly:Number(settings.maintenance_salary_monthly),developmentSalaryMonthly:Number(settings.development_salary_monthly),actual:"Contractor WO + Contractor Development + Contractor Parts/Purchases + salary",savings:"Baseline - Actual",savingsPercent:"Total Savings / Total Baseline * 100",projectMonth:"End Date when present, otherwise Start Date",maintenancePurchaseRule:"Contractor purchases linked to a WO count only when purchase month matches WO month"},months:rows,totals:{...totals,savingsPercent:totals.baseline?totals.savings/totals.baseline*100:0,months:rows.length}};
}

// Job profitability on verified HandyOS-only tenant PostgreSQL transaction.
// No billing assumptions: owner-entered contract EX GST; customer-reimbursable
// purchases are separate pass-through receivables, never company revenue/cost.
// Attendance wages count earned, NOT payments made (no double counting).
import {randomUUID} from "node:crypto";
import {HttpError,ensureUuid,sanitizeText} from "./domain.mjs";
const KINDS=new Set(["material","labour","subcontractor","equipment","other"]);
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function aud(value,allowZero=true){
 if(typeof value!=="number"||!Number.isFinite(value)||value<0||(!allowZero&&value===0)||
   value>100000000||Math.abs(Math.round(value*100)-value*100)>0.000001)
  throw new HttpError(400,"Invalid AUD amount");
 return value.toFixed(2);
}
function moneyToCents(value){
 const num=Number(value);
 if(!Number.isFinite(num)||num<0||num>100000000||Math.abs(Math.round(num*100)-num*100)>0.0001)
  throw new HttpError(503,"Invalid financial record");
 return Math.round(num*100);
}
function money(cents){return (cents/100).toFixed(2)}
function exact(data,fields){
 if(!data||typeof data!=="object"||Array.isArray(data)||
  Object.keys(data).some(x=>!fields.includes(x)))throw new HttpError(400,"Invalid financial input");
 return data;
}
function day(s){
 if(typeof s!=="string"||!DAY.test(s)||Number.isNaN(Date.parse(s+"T00:00:00Z"))||
  new Date(s+"T00:00:00Z").toISOString().slice(0,10)!==s)
  throw new HttpError(400,"Invalid expense date");
 return s;
}
async function existingJob(db,tenant,id){
 const r=await db.query("select id,name from jobs where tenant_id=$1 and id=$2",[tenant,id]);
 if(r.rowCount!==1)throw new HttpError(404,"Job not found");
 return r.rows[0];
}
export async function readJobFinancials({db,tenant,jobId}){
 const job=await existingJob(db,tenant,jobId);
 const setting=await db.query("select contract_ex_gst,reserve_percent from job_financial_settings where tenant_id=$1 and job_id=$2",[tenant,jobId]);
 const contract=moneyToCents(setting.rows[0]?.contract_ex_gst??"0");
 const reservePercent=Number(setting.rows[0]?.reserve_percent??15);
 if(!Number.isFinite(reservePercent)||reservePercent<0||reservePercent>100)throw new HttpError(503,"Invalid reserve");
 const expense=await db.query("select id,kind,description,amount_ex_gst,gst_amount,incurred_on from cost_entries where tenant_id=$1 and job_id=$2 order by incurred_on desc,id limit 1001",[tenant,jobId]);
 const attendance=await db.query(`select a.id,a.finished_at,
  case when a.finished_at is null then null
   when a.rate_unit='day' then round(a.rate_snapshot*a.paid_day_portion,2)
   else round(a.rate_snapshot*greatest(0,(extract(epoch from (a.finished_at-a.started_at))/60-a.break_minutes))/60,2)
  end as wage
  from attendance_entries a
  where a.tenant_id=$1 and a.job_id=$2`,[tenant,jobId]);
 const adjustments=await db.query("select id,amount from weekly_wage_adjustments where tenant_id=$1 and job_id=$2",[tenant,jobId]);
 const reimbursements=await db.query("select customer_status,amount_gross from material_reimbursements where tenant_id=$1 and job_id=$2",[tenant,jobId]);
 if(expense.rows.length>1000||attendance.rows.length>10000||adjustments.rows.length>10000||reimbursements.rows.length>10000)
  throw new HttpError(503,"Financial dataset too large");
 const category=Object.fromEntries([...KINDS].map(k=>[k,0]));
 for(const x of expense.rows){
  if(!KINDS.has(x.kind))throw new HttpError(503,"Invalid cost kind");
  category[x.kind]+=moneyToCents(x.amount_ex_gst);
 }
 let unpaidAttendance=0,wages=0;
 for(const item of attendance.rows){
  if(item.finished_at===null)unpaidAttendance++;
  else wages+=moneyToCents(item.wage);
 }
 let extras=0;for(const a of adjustments.rows)extras+=moneyToCents(a.amount);
 const general=Object.values(category).reduce((a,b)=>a+b,0);
 const totalCosts=general+wages+extras;
 const reserve=Math.round(contract*reservePercent/100);
 const profit=contract-totalCosts-reserve;
 let pendingReimbursement=0,reimbursed=0;
 for(const r of reimbursements.rows){
  const amt=moneyToCents(r.amount_gross);
  if(r.customer_status==="reimbursed")reimbursed+=amt;
  else pendingReimbursement+=amt;
 }
 return {
  job:{id:jobId,name:job.name},
  settings:{contractExGst:money(contract),reservePercent},
  costs:{materials:money(category.material),labourManual:money(category.labour),
   subcontractors:money(category.subcontractor),equipment:money(category.equipment),
   other:money(category.other),attendanceWages:money(wages),weeklyBonuses:money(extras),
   totalExGst:money(totalCosts),openAttendance:unpaidAttendance},
  totals:{contractExGst:money(contract),reserveAllocation:money(reserve),
   estimatedProfitExGst:money(profit)},
  passThrough:{customerReceiptsPendingGross:money(pendingReimbursement),
   customerReceiptsReimbursedGross:money(reimbursed),
   includedInProfit:false},
  expenseEntries:expense.rows,
  warnings:unpaidAttendance?["Open attendance has no final wage amount yet; profit is provisional."]:[]
 };
}
export async function dispatchJobFinancials({method,path,ctx,db,readBody}){
 if(!/^\/v1\/jobs\/[^/]+\/financials(?:\/|$)/.test(path))return null;
 if(!["owner","manager"].includes(ctx?.role))throw new HttpError(403,"Job financials restricted to management");
 const tenant=ensureUuid(ctx.tenant_id);
 const m=/^\/v1\/jobs\/([^/]+)\/financials(?:\/(settings|expenses))?$/.exec(path);
 if(!m)throw new HttpError(404,"Financial route not found");
 const id=ensureUuid(m[1]),action=m[2];
 if(method==="GET"&&!action)return {financials:await readJobFinancials({db,tenant,jobId:id})};
 if(method!=="POST"||!["settings","expenses"].includes(action))
  throw new HttpError(404,"Financial route not found");
 const data=exact(await readBody(),action==="settings"?
  ["contractExGst","reservePercent"]:["kind","description","amountExGst","gstAmount","incurredOn"]);
 await existingJob(db,tenant,id);
 if(action==="settings"){
  const contract=aud(data.contractExGst);
  const pct=data.reservePercent;
  if(typeof pct!=="number"||!Number.isFinite(pct)||pct<0||pct>100||
   Math.abs(Math.round(pct*100)-pct*100)>0.000001)
   throw new HttpError(400,"Invalid reserve percentage");
  await db.query(`insert into job_financial_settings(tenant_id,job_id,contract_ex_gst,reserve_percent)
    values($1,$2,$3,$4) on conflict(tenant_id,job_id) do update set
    contract_ex_gst=excluded.contract_ex_gst,reserve_percent=excluded.reserve_percent,updated_at=now()`,[tenant,id,contract,pct.toFixed(2)]);
  await db.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'updated','job_financial_settings',$3)",[tenant,ctx.actorSub,id]);
 }else{
  if(!KINDS.has(data.kind))throw new HttpError(400,"Invalid expense type");
  const description=sanitizeText(data.description,200);
  const ex=aud(data.amountExGst,false),gst=aud(data.gstAmount??0);
  const incurred=day(data.incurredOn),costId=randomUUID();
  await db.query("insert into cost_entries(id,tenant_id,job_id,kind,description,amount_ex_gst,gst_amount,incurred_on) values($1,$2,$3,$4,$5,$6,$7,$8)",[costId,tenant,id,data.kind,description,ex,gst,incurred]);
  await db.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'created','job_cost',$3)",[tenant,ctx.actorSub,costId]);
 }
 return {financials:await readJobFinancials({db,tenant,jobId:id})};
}

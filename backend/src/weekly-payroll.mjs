// Weekly payroll: cents-accurate server-side reconciliation for HandyOS only.
// Uses snapshot wage rates and completed attendance only. No assumed payment week.
import {randomUUID} from "node:crypto";
import {HttpError,ensureUuid} from "./domain.mjs";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function week(v){
 if(typeof v!=="string"||!DATE.test(v))throw new HttpError(400,"Invalid payroll week");
 const date=new Date(v+"T00:00:00Z");
 if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==v||date.getUTCDay()!==1)
  throw new HttpError(400,"Payroll week must start Monday");
 return v;
}
function amount(v){
 if(typeof v!=="number"||!Number.isFinite(v)||v<=0||v>1000000||
  Math.abs(Math.round(v*100)-v*100)>0.000001)
  throw new HttpError(400,"Invalid AUD amount");
 return v.toFixed(2);
}
function exactBody(data,fields){
 if(!data||Array.isArray(data)||typeof data!=="object"||
  Object.keys(data).some(key=>!fields.includes(key)))throw new HttpError(400,"Invalid payroll request");
 return data;
}
function cents(value){
 const v=Number(value);
 if(!Number.isFinite(v)||v<0||v>100000000||Math.abs(v*100-Math.round(v*100))>0.00001)
  throw new HttpError(503,"Invalid payroll total");
 return Math.round(v*100);
}
function money(v){return (v/100).toFixed(2)}
async function scope(db,tenant,staffId,weekBegin){
 const profile=await db.query("select id,display_name from staff_profiles where tenant_id=$1 and id=$2",[tenant,staffId]);
 if(profile.rowCount!==1)throw new HttpError(404,"Employee not found");
 const closed=await db.query("select id,earned_total,extras_total,paid_total,closed_at from weekly_payroll_closures where tenant_id=$1 and staff_id=$2 and week_begin=$3",[tenant,staffId,weekBegin]);
 return {profile:profile.rows[0],closure:closed.rows[0]||null};
}
export async function readPayrollWeek(db,tenant,staffId,weekBegin){
 const {profile,closure}=await scope(db,tenant,staffId,weekBegin);
 // Entry-level results avoid multiplying wages by joining multiple adjustments/payments.
 // Hourly pay: actual completed minutes minus unpaid break, rounded per entry to cents.
 // Daily pay: 1.00 or 0.50 portion of the saved rate.
 const attendance=await db.query(`select a.id,a.job_id,a.work_date,a.started_at,a.finished_at,
  a.break_minutes,a.paid_day_portion,a.rate_unit,a.rate_snapshot,j.name as job_name,
  case when a.finished_at is null then null
   when a.rate_unit='day' then round(a.rate_snapshot*a.paid_day_portion,2)
   else round(a.rate_snapshot*greatest(0,(extract(epoch from (a.finished_at-a.started_at))/60-a.break_minutes))/60,2)
  end as wage
  from attendance_entries a join jobs j on j.tenant_id=a.tenant_id and j.id=a.job_id
  where a.tenant_id=$1 and a.staff_id=$2 and a.work_date >= $3::date
    and a.work_date < $3::date+7 order by a.work_date,a.id`,[tenant,staffId,weekBegin]);
 const adjustments=await db.query("select id,job_id,kind,amount,notes from weekly_wage_adjustments where tenant_id=$1 and staff_id=$2 and week_begin=$3 order by created_at,id",[tenant,staffId,weekBegin]);
 const payments=await db.query("select id,job_id,paid_on,amount,reference from staff_wage_payments where tenant_id=$1 and staff_id=$2 and week_begin=$3 order by paid_on,id",[tenant,staffId,weekBegin]);
 const entries=attendance.rows.map(a=>({...a,wage:a.wage===null?null:money(cents(a.wage))}));
 const earned=entries.reduce((sum,a)=>sum+(a.wage===null?0:cents(a.wage)),0);
 const extras=adjustments.rows.reduce((sum,x)=>sum+cents(x.amount),0);
 const paid=payments.rows.reduce((sum,x)=>sum+cents(x.amount),0);
 const openCount=entries.filter(a=>!a.finished_at).length;
 return {staff:{id:staffId,name:profile.display_name},weekBegin,
  attendance:entries,adjustments:adjustments.rows,payments:payments.rows,
  totals:{earned:money(earned),extras:money(extras),due:money(earned+extras),
   paid:money(paid),remaining:money(earned+extras-paid),openEntries:openCount},
  closed:closure?{id:closure.id,closedAt:closure.closed_at}:null,
  // Negative balance is overpayment, never silently treated as zero.
  canClose:!closure&&openCount===0&&entries.length+adjustments.rows.length>0&&earned+extras===paid};
}
async function isClosed(db,tenant,staffId,weekBegin){
 const r=await db.query("select id from weekly_payroll_closures where tenant_id=$1 and staff_id=$2 and week_begin=$3",[tenant,staffId,weekBegin]);
 if(r.rowCount)throw new HttpError(409,"Payroll week already closed");
}
export async function dispatchWeeklyPayroll({method,path,query,ctx,db,readBody}){
 if(!/^\/v1\/payroll(?:\/|$)/.test(path))return null;
 if(!["owner","manager"].includes(ctx?.role))throw new HttpError(403,"Payroll restricted to management");
 const tenant=ensureUuid(ctx.tenant_id);
 const m=/^\/v1\/payroll\/([0-9a-f-]{36})\/weeks\/([0-9]{4}-[0-9]{2}-[0-9]{2})(?:\/(bonus|payment|close))?$/.exec(path);
 if(!m)throw new HttpError(404,"Payroll endpoint not found");
 const staffId=ensureUuid(m[1]),weekBegin=week(m[2]),action=m[3];
 if(method==="GET"&&!action)return {payroll:await readPayrollWeek(db,tenant,staffId,weekBegin)};
 if(method!=="POST"||!action)throw new HttpError(404,"Payroll endpoint not found");
 const data=exactBody(await readBody(),action==="bonus"?["jobId","kind","amount","notes"]:
  action==="payment"?["jobId","amount","paidOn","reference"]:[]);
 // Serialize payroll writes for this employee and week. All mutations commit
 // under existing API transaction, preventing race with closure in payroll paths.
 await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[tenant+":"+staffId+":"+weekBegin]);
 await isClosed(db,tenant,staffId,weekBegin);
 if(action==="close"){
  const report=await readPayrollWeek(db,tenant,staffId,weekBegin);
  if(!report.canClose)throw new HttpError(409,"Cannot close incomplete or unpaid payroll week");
  const closureId=randomUUID();
  const inserted=await db.query("insert into weekly_payroll_closures(id,tenant_id,staff_id,week_begin,earned_total,extras_total,paid_total,closed_by) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(tenant_id,staff_id,week_begin) do nothing returning id",
   [closureId,tenant,staffId,weekBegin,report.totals.earned,report.totals.extras,report.totals.paid,ctx.actorSub]);
  if(inserted.rowCount!==1)throw new HttpError(409,"Payroll week already closed");
  await db.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'closed','weekly_payroll',$3)",[tenant,ctx.actorSub,closureId]);
  return {payroll:await readPayrollWeek(db,tenant,staffId,weekBegin)};
 }
 const jobId=ensureUuid(data.jobId);
 const ownedJob=await db.query("select id from jobs where tenant_id=$1 and id=$2",[tenant,jobId]);
 if(ownedJob.rowCount!==1)throw new HttpError(404,"Job not found");
 const value=amount(data.amount);
 const id=randomUUID();
 if(action==="bonus"){
  if(!["bonus","allowance"].includes(data.kind)|| (data.notes!==undefined&&(typeof data.notes!=="string"||data.notes.length>500)))
   throw new HttpError(400,"Invalid bonus details");
  await db.query("insert into weekly_wage_adjustments(id,tenant_id,job_id,staff_id,week_begin,kind,amount,notes) values($1,$2,$3,$4,$5,$6,$7,$8)",[id,tenant,jobId,staffId,weekBegin,data.kind,value,data.notes||""]);
 }else{
  if(typeof data.paidOn!=="string"||!DATE.test(data.paidOn)||Number.isNaN(Date.parse(data.paidOn+"T00:00:00Z"))||
   new Date(data.paidOn+"T00:00:00Z").toISOString().slice(0,10)!==data.paidOn||
   (data.reference!==undefined&&(typeof data.reference!=="string"||data.reference.length>160)))
   throw new HttpError(400,"Invalid payment date");
  await db.query("insert into staff_wage_payments(id,tenant_id,job_id,staff_id,paid_on,amount,week_begin,reference) values($1,$2,$3,$4,$5,$6,$7,$8)",[id,tenant,jobId,staffId,data.paidOn,value,weekBegin,data.reference||""]);
 }
 await db.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'created',$3,$4)",[tenant,ctx.actorSub,action==="bonus"?"weekly_wage_adjustment":"staff_wage_payment",id]);
 return {payroll:await readPayrollWeek(db,tenant,staffId,weekBegin)};
}

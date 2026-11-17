// HandyOS daily owner crew operations. Same Cognito / PostgreSQL RLS boundary as Jobs.
// No browser-supplied rate on check-in; immutable wage snapshot from staff profile.
// All mutations happen inside the API's existing actor+tenant scoped transaction.
import {randomUUID} from "node:crypto";
import {HttpError,ensureUuid,sanitizeText} from "./domain.mjs";
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function isoDay(v){
 if(typeof v!=="string"||!DAY.test(v)||Number.isNaN(Date.parse(v+"T00:00:00Z"))||
  new Date(v+"T00:00:00Z").toISOString().slice(0,10)!==v)
  throw new HttpError(400,"Invalid work date");
 return v;
}
async function openPayrollWeek(db,tenant,staff,date){
 const day=new Date(date+"T00:00:00Z"),dayOfWeek=day.getUTCDay();
 day.setUTCDate(day.getUTCDate()-((dayOfWeek+6)%7));
 const monday=day.toISOString().slice(0,10);
 // Serialize crew mutations with payroll close/adjustments in same DB tx.
 await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[tenant+":"+staff+":"+monday]);
 const closure=await db.query("select id from weekly_payroll_closures where tenant_id=$1 and staff_id=$2 and week_begin=$3",[tenant,staff,monday]);
 if(closure.rowCount)throw new HttpError(409,"Payroll week already closed");
}
function owner(ctx){
 if(!["owner","manager"].includes(ctx?.role))throw new HttpError(403,"Crew payroll is restricted to management");
}
function payload(data,fields){
 if(!data||typeof data!=="object"||Array.isArray(data)||
  Object.keys(data).some(k=>!fields.includes(k)))throw new HttpError(400,"Invalid crew request");
 return data;
}
export async function dispatchDailyCrew({method,path,query,ctx,db,readBody,now=()=>new Date()}){
 if(!/^\/v1\/(staff|attendance)(?:\/|$)/.test(path))return null;
 owner(ctx);
 const tenant=ensureUuid(ctx.tenant_id);
 if(method==="GET"&&path==="/v1/staff"){
  const result=await db.query("select id,display_name,role_label,wage_unit,default_rate,active from staff_profiles where tenant_id=$1 order by active desc,display_name,id limit 200",[tenant]);
  return {staff:result.rows};
 }
 if(method==="POST"&&path==="/v1/staff"){
  const d=payload(await readBody(),["displayName","roleLabel","wageUnit","defaultRate"]);
  const name=sanitizeText(d.displayName,160);
  const roleLabel=d.roleLabel===undefined?"":typeof d.roleLabel==="string"&&d.roleLabel.length<=100?d.roleLabel.trim():null;
  if(roleLabel===null||!["day","hour"].includes(d.wageUnit)||
   typeof d.defaultRate!=="number"||!Number.isFinite(d.defaultRate)||
   d.defaultRate<0||d.defaultRate>100000||Math.abs(Math.round(d.defaultRate*100)-d.defaultRate*100)>0.000001)
   throw new HttpError(400,"Invalid staff payment settings");
  const id=randomUUID();
  await db.query("insert into staff_profiles(id,tenant_id,display_name,role_label,wage_unit,default_rate) values($1,$2,$3,$4,$5,$6)",[id,tenant,name,roleLabel,d.wageUnit,d.defaultRate]);
  await db.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'created','staff',$3)",[tenant,ctx.actorSub,id]);
  return {staff:{id,display_name:name,role_label:roleLabel,wage_unit:d.wageUnit,default_rate:d.defaultRate,active:true}};
 }
 if(method==="GET"&&path==="/v1/attendance"){
  const date=isoDay(query.get("date"));
  const result=await db.query("select a.id,a.job_id,a.staff_id,a.work_date,a.started_at,a.finished_at,a.break_minutes,a.paid_day_portion,a.rate_unit,a.rate_snapshot,s.display_name,j.name as job_name from attendance_entries a join staff_profiles s on s.id=a.staff_id and s.tenant_id=a.tenant_id join jobs j on j.id=a.job_id and j.tenant_id=a.tenant_id where a.tenant_id=$1 and a.work_date=$2 order by a.started_at,a.id limit 200",[tenant,date]);
  return {attendance:result.rows};
 }
 if(method==="POST"&&path==="/v1/attendance/check-in"){
  const d=payload(await readBody(),["jobId","staffId","workDate"]);
  const job=ensureUuid(d.jobId),staff=ensureUuid(d.staffId),date=isoDay(d.workDate);
  await openPayrollWeek(db,tenant,staff,date);
  const person=await db.query("select id,wage_unit,default_rate from staff_profiles where tenant_id=$1 and id=$2 and active=true",[tenant,staff]);
  if(person.rowCount!==1)throw new HttpError(404,"Active employee not found");
  const j=await db.query("select id from jobs where tenant_id=$1 and id=$2 and stage not in ('closed','handover')",[tenant,job]);
  if(j.rowCount!==1)throw new HttpError(404,"Active job not found");
  const existing=await db.query("select id,finished_at from attendance_entries where tenant_id=$1 and staff_id=$2 and work_date=$3",[tenant,staff,date]);
  if(existing.rowCount)throw new HttpError(409,"Employee already has attendance for this date");
  const started=now();
  if(!(started instanceof Date)||Number.isNaN(started.getTime()))throw new HttpError(503,"Clock unavailable");
  const row=person.rows[0],id=randomUUID();
  const result=await db.query("insert into attendance_entries(id,tenant_id,job_id,staff_id,work_date,started_at,rate_unit,rate_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(tenant_id,staff_id,work_date) do nothing returning id,job_id,staff_id,work_date,started_at,finished_at,rate_unit,rate_snapshot",
   [id,tenant,job,staff,date,started.toISOString(),row.wage_unit,row.default_rate]);
  await db.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'checked_in','attendance',$3)",[tenant,ctx.actorSub,id]);
  if(result.rowCount!==1)throw new HttpError(409,"Employee already has attendance for this date");
  return {entry:result.rows[0]};
 }
 const m=/^\/v1\/attendance\/([0-9a-f-]{36})\/check-out$/i.exec(path);
 if(method==="POST"&&m){
  const id=ensureUuid(m[1]);
  payload(await readBody(),[]);
  const current=await db.query("select staff_id,work_date from attendance_entries where tenant_id=$1 and id=$2 and finished_at is null",[tenant,id]);
  if(current.rowCount!==1)throw new HttpError(409,"No open attendance entry to check out");
  const workDate=current.rows[0].work_date instanceof Date?
   current.rows[0].work_date.toISOString().slice(0,10):String(current.rows[0].work_date).slice(0,10);
  await openPayrollWeek(db,tenant,ensureUuid(current.rows[0].staff_id),workDate);
  const finished=now();
  if(!(finished instanceof Date)||Number.isNaN(finished.getTime()))throw new HttpError(503,"Clock unavailable");
  const result=await db.query("update attendance_entries set finished_at=$1,updated_at=now() where tenant_id=$2 and id=$3 and finished_at is null and started_at<$1 returning id,job_id,staff_id,work_date,started_at,finished_at,rate_unit,rate_snapshot",
   [finished.toISOString(),tenant,id]);
  if(result.rowCount!==1)throw new HttpError(409,"No open attendance entry to check out");
  await db.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'checked_out','attendance',$3)",[tenant,ctx.actorSub,id]);
  return {entry:result.rows[0]};
 }
 throw new HttpError(404,"Crew route not found");
}

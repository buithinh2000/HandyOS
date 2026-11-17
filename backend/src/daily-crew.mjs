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
// Historical shifts must carry actual timestamps; never replace missed clock-ins with "now".
function melbourneDay(date){
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Australia/Melbourne",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
 const value=key=>parts.find(part=>part.type===key)?.value;
 return `${value("year")}-${value("month")}-${value("day")}`;
}
function recordedTime(value,workDate){
 if(typeof value!=="string"||!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
  throw new HttpError(400,"Enter a timestamp with timezone");
 const date=new Date(value);
 if(Number.isNaN(date.getTime())||melbourneDay(date)!==workDate)
  throw new HttpError(400,"Shift time must match the selected Melbourne work date");
 return date;
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
 if(method==="GET"&&path==="/v1/attendance/month"){
  const month=query?.get("month");
  if(typeof month!=="string"||!/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(month))
   throw new HttpError(400,"Invalid attendance month");
  // Only dates actually recorded: an empty day is UNKNOWN, not an absence.
  const start=month+"-01";
  const year=Number(month.slice(0,4)),number=Number(month.slice(5,7));
  const next=number===12?(year+1)+"-01-01":year+"-"+String(number+1).padStart(2,"0")+"-01";
  const result=await db.query(`select to_char(work_date,'YYYY-MM-DD') as work_date,
   count(*)::integer as recorded_count,
   count(*) filter (where finished_at is null)::integer as open_count
   from attendance_entries
   where tenant_id=$1 and work_date >= $2::date and work_date < $3::date
   group by work_date order by work_date`,[tenant,start,next]);
  if(!Array.isArray(result.rows)||result.rows.length>31)throw new HttpError(503,"Invalid month summary");
  const days=result.rows.map(r=>{
   const day=isoDay(r.work_date),recorded=Number(r.recorded_count),open=Number(r.open_count);
   if(!day.startsWith(month)||!Number.isSafeInteger(recorded)||recorded<1||
      !Number.isSafeInteger(open)||open<0||open>recorded)
    throw new HttpError(503,"Invalid month summary");
   return {date:day,recordedCount:recorded,openCount:open};
  });
  return {month,days};
 }
 if(method==="GET"&&path==="/v1/attendance"){
  const date=isoDay(query.get("date"));
  const result=await db.query("select a.id,a.job_id,a.staff_id,a.work_date,a.started_at,a.finished_at,a.break_minutes,a.paid_day_portion,a.rate_unit,a.rate_snapshot,s.display_name,j.name as job_name from attendance_entries a join staff_profiles s on s.id=a.staff_id and s.tenant_id=a.tenant_id join jobs j on j.id=a.job_id and j.tenant_id=a.tenant_id where a.tenant_id=$1 and a.work_date=$2 order by a.started_at,a.id limit 200",[tenant,date]);
  return {attendance:result.rows};
 }
 if(method==="POST"&&path==="/v1/attendance/backfill"){
  const d=payload(await readBody(),["jobId","staffId","workDate","startedAt","finishedAt","breakMinutes","paidDayPortion","notes"]);
  const job=ensureUuid(d.jobId),staff=ensureUuid(d.staffId),date=isoDay(d.workDate);
  const today=melbourneDay(now());
  if(date>=today)throw new HttpError(400,"Use normal check-in for today; backfill is for past dates only");
  const start=recordedTime(d.startedAt,date),finish=recordedTime(d.finishedAt,date);
  const duration=(finish.getTime()-start.getTime())/60000;
  if(duration<=0||duration>24*60)throw new HttpError(400,"Invalid historical shift duration");
  const breakMinutes=d.breakMinutes??0,portion=d.paidDayPortion??1;
  if(!Number.isInteger(breakMinutes)||breakMinutes<0||breakMinutes>600||breakMinutes>=duration||
    (portion!==0.5&&portion!==1))throw new HttpError(400,"Invalid break or paid day portion");
  const notes=d.notes===undefined?"":typeof d.notes==="string"&&d.notes.length<=500?d.notes.trim():null;
  if(notes===null)throw new HttpError(400,"Invalid shift notes");
  await openPayrollWeek(db,tenant,staff,date);
  const person=await db.query("select id,wage_unit,default_rate from staff_profiles where tenant_id=$1 and id=$2 and active=true",[tenant,staff]);
  if(person.rowCount!==1)throw new HttpError(404,"Active employee not found");
  const j=await db.query("select id from jobs where tenant_id=$1 and id=$2",[tenant,job]);
  if(j.rowCount!==1)throw new HttpError(404,"Job not found");
  const existing=await db.query("select id from attendance_entries where tenant_id=$1 and staff_id=$2 and work_date=$3",[tenant,staff,date]);
  if(existing.rowCount)throw new HttpError(409,"Employee already has attendance for this date");
  const id=randomUUID(),personRow=person.rows[0];
  const result=await db.query(`insert into attendance_entries(id,tenant_id,job_id,staff_id,work_date,started_at,finished_at,break_minutes,paid_day_portion,rate_unit,rate_snapshot,notes)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    on conflict(tenant_id,staff_id,work_date) do nothing returning id,job_id,staff_id,work_date,started_at,finished_at,break_minutes,paid_day_portion,rate_unit,rate_snapshot`,
   [id,tenant,job,staff,date,start.toISOString(),finish.toISOString(),breakMinutes,portion,personRow.wage_unit,personRow.default_rate,notes]);
  if(result.rowCount!==1)throw new HttpError(409,"Employee already has attendance for this date");
  await db.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'backfilled','attendance',$3)",[tenant,ctx.actorSub,id]);
  return {entry:result.rows[0]};
 }
 if(method==="POST"&&path==="/v1/attendance/check-in"){
  const d=payload(await readBody(),["jobId","staffId","workDate"]);
  const job=ensureUuid(d.jobId),staff=ensureUuid(d.staffId),date=isoDay(d.workDate);
  if(date!==melbourneDay(now()))throw new HttpError(400,"Use backfill for previous dates; current check-in requires today");
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
  if(workDate!==melbourneDay(now()))throw new HttpError(409,"Historical open shift needs an audited correction; do not check out with current time");
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

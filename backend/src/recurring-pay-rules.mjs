// Future-effective recurring payroll rules; no cron, no materialized repeats.
// Values are computed on reads and closure, and count once per qualifying period.
import {randomUUID} from "node:crypto";
import {HttpError,ensureUuid} from "./domain.mjs";
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function isoDate(s){
 if(typeof s!=="string"||!DAY.test(s))throw new HttpError(400,"Invalid recurring rule date");
 const d=new Date(s+"T00:00:00Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new HttpError(400,"Invalid recurring rule date");
 return s;
}
function monday(s){const d=new Date(isoDate(s)+"T00:00:00Z");if(d.getUTCDay()!==1)throw new HttpError(400,"Recurring effective date must be Monday");return s}
function futureMonday(now){
 const p=new Intl.DateTimeFormat("en-US",{timeZone:"Australia/Melbourne",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const get=k=>p.find(x=>x.type===k).value;
 const date=new Date(get("year")+"-"+get("month")+"-"+get("day")+"T00:00:00Z");
 date.setUTCDate(date.getUTCDate()+((8-date.getUTCDay())%7||7));
 return date.toISOString().slice(0,10);
}
function exact(data,keys){
 if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).some(k=>!keys.includes(k)))
  throw new HttpError(400,"Invalid recurring rule request");
 return data;
}
function dollars(value){
 if(typeof value!=="number"||!Number.isFinite(value)||value<=0||value>1000000||
  Math.abs(Math.round(value*100)-value*100)>0.000001)throw new HttpError(400,"Invalid recurring amount");
 return value.toFixed(2);
}
function cents(value){
 const n=Number(value);
 if(!Number.isFinite(n)||n<=0||n>1000000||Math.abs(n*100-Math.round(n*100))>0.00001)
  throw new HttpError(503,"Invalid recurring amount stored");
 return Math.round(n*100);
}
function dateText(value){
 if(typeof value==="string")return value.slice(0,10);
 if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);
 throw new HttpError(503,"Invalid attendance date stored");
}
function plusDays(iso,days){
 const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
}
export async function readRecurringPayLines(db,tenant,staffId,weekBegin,entries){
 const result=await db.query(`select id,job_id,kind,label,cadence,amount,
 to_char(starts_on,'YYYY-MM-DD') as starts_on,
 to_char(ends_on,'YYYY-MM-DD') as ends_on
 from staff_recurring_pay_rules where tenant_id=$1 and staff_id=$2
 and starts_on<=$3::date and (ends_on is null or ends_on>$3::date)
 order by created_at,id`,[tenant,staffId,weekBegin]);
 const next=plusDays(weekBegin,7);
 // Monthly credit belongs only to payroll week containing the 1st of the month,
 // so it cannot be added again in another week of the same calendar month.
 const firstInWeek=Array.from({length:7},(_,i)=>plusDays(weekBegin,i)).find(s=>s.endsWith("-01"));
 const lines=[];
 for(const r of result.rows){
  if(!["bonus","allowance"].includes(r.kind)||!["day","week","month"].includes(r.cadence))
   throw new HttpError(503,"Unexpected recurring payroll rule");
  const unit=cents(r.amount);
  let quantity=0;
  if(r.cadence==="week")quantity=100;
  else if(r.cadence==="month")quantity=firstInWeek?100:0;
  else {
   // One worker/day uniqueness enforced by attendance schema; only completed
   // shifts for this rule's job can earn its daily allowance.
   quantity=entries.filter(e=>e.finished_at&&e.job_id===r.job_id&&
     dateText(e.work_date)>=weekBegin&&dateText(e.work_date)<next)
    .reduce((sum,e)=>sum+(Number(e.paid_day_portion)===0.5?50:100),0);
  }
  if(!quantity)continue;
  const total=Math.round(unit*quantity/100);
  lines.push({ruleId:r.id,jobId:r.job_id,kind:r.kind,label:r.label,
   cadence:r.cadence,amount:(total/100).toFixed(2),
   units:quantity/100,period:r.cadence==="month"?firstInWeek:weekBegin});
 }
 return lines;
}
export async function dispatchRecurringPayRules({method,path,ctx,db,readBody,now=()=>new Date()}){
 const match=/^\/v1\/payroll\/([0-9a-f-]{36})\/rules(?:\/([0-9a-f-]{36})\/stop)?$/i.exec(path);
 if(!match)return null;
 if(!["owner","manager"].includes(ctx?.role))throw new HttpError(403,"Payroll restricted to management");
 const tenant=ensureUuid(ctx.tenant_id),staff=ensureUuid(match[1]);
 const profile=await db.query("select id from staff_profiles where tenant_id=$1 and id=$2",[tenant,staff]);
 if(profile.rowCount!==1)throw new HttpError(404,"Employee not found");
 const cutoff=futureMonday(now());
 if(method==="GET"&&!match[2]){
  const result=await db.query(`select id,job_id,kind,label,cadence,amount,
   to_char(starts_on,'YYYY-MM-DD') as starts_on,
   to_char(ends_on,'YYYY-MM-DD') as ends_on
   from staff_recurring_pay_rules where tenant_id=$1 and staff_id=$2
   order by created_at,id limit 100`,[tenant,staff]);
  return {rules:result.rows,nextEligibleMonday:cutoff};
 }
 if(method!=="POST")throw new HttpError(404,"Recurring rule route not found");
 const lock=tenant+":"+staff+":recurring-rules";
 await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[lock]);
 if(match[2]){
  exact(await readBody(),[]);
  const id=ensureUuid(match[2]);
  const changed=await db.query(`update staff_recurring_pay_rules
    set ends_on=greatest(starts_on,$4::date) where tenant_id=$1 and staff_id=$2 and id=$3
    and (ends_on is null or ends_on>greatest(starts_on,$4::date))
    returning id,to_char(ends_on,'YYYY-MM-DD') as stops_on`,[tenant,staff,id,cutoff]);
  if(changed.rowCount!==1)throw new HttpError(409,"Rule cannot be stopped at next payroll week");
  await db.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'stopped','recurring_pay_rule',$3)",[tenant,ctx.actorSub,id]);
  return {id,stopsOn:changed.rows[0].stops_on};
 }
 const data=exact(await readBody(),["jobId","kind","label","cadence","amount","startsOn"]);
 const job=ensureUuid(data.jobId),start=monday(data.startsOn);
 if(start<cutoff)throw new HttpError(400,"Recurring rule must start from a future Monday");
 if(!["bonus","allowance"].includes(data.kind)||!["day","week","month"].includes(data.cadence)||
  typeof data.label!=="string"||!data.label.trim()||data.label.trim().length>120)
  throw new HttpError(400,"Invalid recurring rule");
 const value=dollars(data.amount);
 const jobRow=await db.query("select id from jobs where tenant_id=$1 and id=$2",[tenant,job]);
 if(jobRow.rowCount!==1)throw new HttpError(404,"Job not found");
 const id=randomUUID();
 await db.query(`insert into staff_recurring_pay_rules
  (id,tenant_id,staff_id,job_id,kind,label,cadence,amount,starts_on,created_by)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [id,tenant,staff,job,data.kind,data.label.trim(),data.cadence,value,start,ctx.actorSub]);
 await db.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'created','recurring_pay_rule',$3)",[tenant,ctx.actorSub,id]);
 return {rule:{id,job_id:job,kind:data.kind,label:data.label.trim(),cadence:data.cadence,amount:value,starts_on:start,ends_on:null}};
}

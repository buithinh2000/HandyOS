// Owner-only, source-only client material reimbursement state transitions.
// Requires caller transaction with verified membership, tenant RLS and rollback on failure.
import {randomUUID} from "node:crypto";
import {HttpError,ensureUuid} from "./domain.mjs";
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function validDay(value){
 if(typeof value!=="string"||!DAY.test(value))throw new HttpError(400,"Invalid bill event date");
 const parsed=new Date(value+"T00:00:00Z");
 if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)
  throw new HttpError(400,"Invalid bill event date");
 const today=new Intl.DateTimeFormat("en-US",{timeZone:"Australia/Melbourne",
  year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const pick=k=>today.find(x=>x.type===k)?.value;
 const current=pick("year")+"-"+pick("month")+"-"+pick("day");
 if(value>current)throw new HttpError(400,"Cannot confirm a bill event in the future");
 return value;
}
function amountCents(value){
 if(typeof value!=="number"||!Number.isFinite(value)||value<=0||value>999999999||
    Math.abs(Math.round(value*100)-value*100)>0.000001)throw new HttpError(400,"Invalid payment amount");
 return Math.round(value*100);
}
function cents(value){
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>999999999||Math.abs(Math.round(n*100)-n*100)>0.000001)
  throw new HttpError(503,"Invalid stored bill amount");
 return Math.round(n*100);
}
function reason(value){
 if(typeof value!=="string"||value.trim().length<3||value.length>250)throw new HttpError(400,"Confirmation reference is required");
 return value.trim();
}
function fields(value,allowed){
 if(!value||typeof value!=="object"||Array.isArray(value)||
    Object.keys(value).some(k=>!allowed.includes(k)))throw new HttpError(400,"Invalid bill action");
 return value;
}
const money=c=>(c/100).toFixed(2);
export async function dispatchBillsOperation({method,path,ctx,db,readBody}={}){
 const m=/^\/v1\/bills\/([0-9a-f-]{36})\/(mark-sent|payment)$/i.exec(path||"");
 if(!m)return null;
 if(method!=="POST")throw new HttpError(404,"Bills action unavailable");
 if(!["owner","manager"].includes(ctx?.role))throw new HttpError(403,"Bills restricted to management");
 const tenant=ensureUuid(ctx.tenant_id),billId=ensureUuid(m[1]),action=m[2];
 const d=fields(await readBody(),action==="mark-sent"?
  ["requestId","date","channel","reference"]:["requestId","date","amount","reference"]);
 const requestId=ensureUuid(d.requestId),day=validDay(d.date),ref=reason(d.reference);
 const channel=action==="mark-sent"?d.channel:null;
 if(action==="mark-sent"&&!["email","message","in_person","other"].includes(channel))
  throw new HttpError(400,"Specify how the bill was actually sent");
 const paid=action==="payment"?amountCents(d.amount):null;
 const result=await db.query(`select id,customer_status,amount_gross
  from material_reimbursements where tenant_id=$1 and id=$2 for update`,[tenant,billId]);
 if(result.rowCount!==1)throw new HttpError(404,"Bill not found");
 const row=result.rows[0],gross=cents(row.amount_gross);
 const sum=await db.query(`select coalesce(sum(amount_received),0) as received
  from material_reimbursement_events where tenant_id=$1 and bill_id=$2 and event_kind='payment_received'`,[tenant,billId]);
 const received=cents(sum.rows[0].received);
 if(received>gross)throw new HttpError(503,"Inconsistent bill ledger");
 const before=await db.query(`select bill_id,event_kind,happened_on,channel,reference,amount_received
  from material_reimbursement_events where tenant_id=$1 and request_id=$2`,[tenant,requestId]);
 if(before.rowCount){
  const e=before.rows[0];
  const kind=action==="mark-sent"?"manually_sent":"payment_received";
  const same=e.bill_id===billId&&e.event_kind===kind&&
   String(e.happened_on instanceof Date?e.happened_on.toISOString().slice(0,10):e.happened_on)===day&&
   e.reference===ref&&(kind==="manually_sent"?e.channel===channel:cents(e.amount_received)===paid);
  if(!same)throw new HttpError(409,"Request ID already used for a different bill action");
  return {id:billId,status:row.customer_status,amountGross:money(gross),
   amountReceived:money(received),remaining:money(gross-received),duplicate:true};
 }
 let nextStatus=row.customer_status;
 if(action==="mark-sent"){
  if(row.customer_status!=="draft")throw new HttpError(409,"Bill is not awaiting sending");
  const event=await db.query(`insert into material_reimbursement_events
   (tenant_id,bill_id,request_id,event_kind,happened_on,channel,reference,actor_sub)
   values($1,$2,$3,'manually_sent',$4,$5,$6,$7) returning id`,
   [tenant,billId,requestId,day,channel,ref,ctx.actorSub]);
  if(event.rowCount!==1)throw new HttpError(503,"Bill event not saved");
  const changed=await db.query(`update material_reimbursements set customer_status='sent',
    sent_on=$3,updated_at=now() where tenant_id=$1 and id=$2 and customer_status='draft' returning id`,
   [tenant,billId,day]);
  if(changed.rowCount!==1)throw new HttpError(409,"Bill state changed");
  nextStatus="sent";
 }else{
  if(row.customer_status!=="sent")throw new HttpError(409,"Bill must be marked sent before recording repayment");
  if(received+paid>gross)throw new HttpError(409,"Payment exceeds outstanding bill balance");
  const event=await db.query(`insert into material_reimbursement_events
   (tenant_id,bill_id,request_id,event_kind,happened_on,reference,amount_received,actor_sub)
   values($1,$2,$3,'payment_received',$4,$5,$6,$7) returning id`,
   [tenant,billId,requestId,day,ref,money(paid),ctx.actorSub]);
  if(event.rowCount!==1)throw new HttpError(503,"Repayment event not saved");
  if(received+paid===gross){
   const changed=await db.query(`update material_reimbursements set customer_status='reimbursed',
      reimbursed_on=$3,updated_at=now()
      where tenant_id=$1 and id=$2 and customer_status='sent' returning id`,[tenant,billId,day]);
   if(changed.rowCount!==1)throw new HttpError(409,"Bill state changed");
   nextStatus="reimbursed";
  }
 }
 await db.query(`insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id)
  values($1,$2,$3,'material_reimbursement',$4)`,
  [tenant,ctx.actorSub,action==="mark-sent"?"manually_marked_sent":"repayment_recorded",billId]);
 const newReceived=received+(paid??0);
 return {id:billId,status:nextStatus,amountGross:money(gross),
  amountReceived:money(newReceived),remaining:money(gross-newReceived),duplicate:false};
}

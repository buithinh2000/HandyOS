// HandyOS contract cash receipts: separate from customer material reimbursements.
// Authenticated route is invoked inside the tenant-scoped database transaction.
// This is a cash ledger, NOT a final profit calculation or legacy payments migration.
import {HttpError,ensureUuid} from "./domain.mjs";
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const TYPES=new Set(["inc_gst","ex_gst","no_gst"]);
function cents(value){
 if(typeof value!=="number"||!Number.isFinite(value)||value<=0||value>100000000||
  Math.abs(Math.round(value*100)-value*100)>0.000001)
  throw new HttpError(400,"Invalid positive AUD amount");
 return Math.round(value*100);
}
function money(c){return (c/100).toFixed(2)}
function storedCents(value){
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>100000001||
  Math.abs(n*100-Math.round(n*100))>0.00001)
  throw new HttpError(503,"Invalid recorded receipt amount");
 return Math.round(n*100);
}
function receiptDate(value){
 if(typeof value!=="string"||!DAY.test(value))throw new HttpError(400,"Invalid receipt date");
 const d=new Date(value+"T00:00:00Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)
  throw new HttpError(400,"Invalid receipt date");
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Australia/Melbourne",
  year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const get=k=>parts.find(p=>p.type===k)?.value;
 if(value>get("year")+"-"+get("month")+"-"+get("day"))
  throw new HttpError(400,"Cannot record future cash receipt");
 return value;
}
function normalized(body){
 const fields=["requestId","receivedOn","basis","amount","reference"];
 if(!body||typeof body!=="object"||Array.isArray(body)||
   Object.keys(body).some(k=>!fields.includes(k))||fields.some(k=>!(k in body)))
  throw new HttpError(400,"Invalid contract receipt input");
 const requestId=ensureUuid(body.requestId),receivedOn=receiptDate(body.receivedOn);
 const basis=body.basis;if(!TYPES.has(basis))throw new HttpError(400,"Invalid GST basis");
 const amount=cents(body.amount);
 if(typeof body.reference!=="string"||body.reference.trim().length<3||
  body.reference.length>250)throw new HttpError(400,"Payment reference required");
 const gross=basis==="ex_gst"?Math.floor((amount*11+5)/10):amount;
 const gst=basis==="no_gst"?0:basis==="ex_gst"?gross-amount:Math.floor((amount+5)/11);
 return {requestId,receivedOn,basis,amount,reference:body.reference.trim(),gross,gst};
}
async function jobLock(db,tenant,jobId){
 const r=await db.query("select id from jobs where tenant_id=$1 and id=$2 for update",[tenant,jobId]);
 if(r.rowCount!==1)throw new HttpError(404,"Job not found");
}
async function listReceipts(db,tenant,jobId){
 const rows=await db.query(`select id,request_id,received_on,input_basis,entered_amount,
    received_inc_gst,gst_component,reference,created_at
  from job_contract_receipts where tenant_id=$1 and job_id=$2
  order by received_on desc,created_at desc,id desc limit 501`,[tenant,jobId]);
 if(rows.rows.length>500)throw new HttpError(409,"Too many receipt entries; reconciliation required");
 const receipts=rows.rows.map(row=>({
  id:row.id,receivedOn:String(row.received_on instanceof Date?row.received_on.toISOString().slice(0,10):row.received_on),
  basis:row.input_basis,enteredAmount:money(storedCents(row.entered_amount)),
  receivedIncGst:money(storedCents(row.received_inc_gst)),
  gstComponent:money(storedCents(row.gst_component)),reference:row.reference
 }));
 let total=0;for(const row of receipts)total+=storedCents(row.receivedIncGst);
 // Existing legacy progress-claim payments are NOT silently included or discarded.
 const legacy=await db.query(`select count(p.id)::integer as legacy_count from payments p
  join progress_claims c on c.id=p.claim_id and c.tenant_id=p.tenant_id
  where p.tenant_id=$1 and c.job_id=$2`,[tenant,jobId]);
 const count=Number(legacy.rows[0]?.legacy_count);
 if(!Number.isSafeInteger(count)||count<0)throw new HttpError(503,"Invalid legacy payment count");
 return {jobId,receipts,receivedIncGst:money(total),legacyPaymentsPresent:count>0,
  profitReady:false,reconciled:false,
  note:count>0?"Existing progress-claim payments need explicit reconciliation; do not double count.":
   "Cash ledger saved; contract and approved variations still require reconciliation before final profit."};
}
export async function dispatchContractReceipts({method,path,ctx,db,readBody}={}){
 const m=/^\/v1\/jobs\/([0-9a-f-]{36})\/financials\/contract-receipts$/i.exec(path||"");
 if(!m)return null;
 if(!["owner","manager"].includes(ctx?.role))throw new HttpError(403,"Contract payments restricted to management");
 const tenant=ensureUuid(ctx.tenant_id),jobId=ensureUuid(m[1]);
 if(method!=="GET"&&method!=="POST")throw new HttpError(404,"Contract receipt action unavailable");
 await jobLock(db,tenant,jobId);
 if(method==="GET")return {contractReceipts:await listReceipts(db,tenant,jobId)};
 // Do not allow manual re-entry where legacy claim payments already exist.
 // A future explicit migration/reconciliation must identify legacy payment IDs.
 const legacy=await db.query(`select count(p.id)::integer as legacy_count from payments p
  join progress_claims c on c.id=p.claim_id and c.tenant_id=p.tenant_id
  where p.tenant_id=$1 and c.job_id=$2`,[tenant,jobId]);
 if(Number(legacy.rows[0]?.legacy_count)>0)
  throw new HttpError(409,"Legacy claim payments exist. Reconcile existing receipts before recording new ones");
 const d=normalized(await readBody());
 const old=await db.query(`select id,job_id,received_on,input_basis,entered_amount,
   received_inc_gst,gst_component,reference
   from job_contract_receipts where tenant_id=$1 and request_id=$2`,[tenant,d.requestId]);
 if(old.rowCount){
  const row=old.rows[0];
  const oldDate=String(row.received_on instanceof Date?row.received_on.toISOString().slice(0,10):row.received_on);
  if(row.job_id!==jobId||oldDate!==d.receivedOn||row.input_basis!==d.basis||
    storedCents(row.entered_amount)!==d.amount||storedCents(row.received_inc_gst)!==d.gross||
    storedCents(row.gst_component)!==d.gst||row.reference!==d.reference)
   throw new HttpError(409,"Payment request ID was already used for different details");
  return {contractReceipts:await listReceipts(db,tenant,jobId),duplicate:true};
 }
 const inserted=await db.query(`insert into job_contract_receipts
   (tenant_id,job_id,request_id,received_on,input_basis,entered_amount,
    received_inc_gst,gst_component,reference,actor_sub)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
   returning id`,[tenant,jobId,d.requestId,d.receivedOn,d.basis,money(d.amount),
    money(d.gross),money(d.gst),d.reference,ctx.actorSub]);
 if(inserted.rowCount!==1)throw new HttpError(503,"Contract receipt not recorded");
 await db.query(`insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id)
  values($1,$2,'recorded','job_contract_receipt',$3)`,[tenant,ctx.actorSub,inserted.rows[0].id]);
 return {contractReceipts:await listReceipts(db,tenant,jobId),duplicate:false};
}

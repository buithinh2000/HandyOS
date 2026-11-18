// Financial reconciliation evidence/readiness, NOT a source of truth for final profit.
// Never infer zero payment, quote approval, or GST basis from missing records.
import {HttpError,ensureUuid} from "./domain.mjs";
function moneyToCents(value){
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>1e9||Math.abs(n*100-Math.round(n*100))>0.00001)
  throw new HttpError(503,"Invalid stored financial amount");
 return Math.round(n*100);
}
function money(c){return(c/100).toFixed(2)}
export async function readJobReconciliation({db,tenant,jobId}){
 ensureUuid(tenant);ensureUuid(jobId);
 const job=await db.query("select id from jobs where tenant_id=$1 and id=$2",[tenant,jobId]);
 if(job.rowCount!==1)throw new HttpError(404,"Job not found");
 const forecast=await db.query(`select contract_inc_gst,approved_variation_inc_gst,
   owner_confirmed_at from job_forecast_inputs
   where tenant_id=$1 and job_id=$2`,[tenant,jobId]);
 const legacy=await db.query(`select count(p.id)::integer as cnt from payments p
   join progress_claims c on c.id=p.claim_id and c.tenant_id=p.tenant_id
   where p.tenant_id=$1 and c.job_id=$2`,[tenant,jobId]);
 const receipts=await db.query(`select count(*)::integer as cnt,
    coalesce(sum(received_inc_gst),0) as received
   from job_contract_receipts where tenant_id=$1 and job_id=$2`,[tenant,jobId]);
 const open=await db.query(`select count(*)::integer as cnt from attendance_entries
    where tenant_id=$1 and job_id=$2 and finished_at is null`,[tenant,jobId]);
 const num=(value)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new HttpError(503,"Invalid financial record count");return n};
 const legacyCount=num(legacy.rows[0]?.cnt);
 const receiptCount=num(receipts.rows[0]?.cnt);
 const openCount=num(open.rows[0]?.cnt);
 const received=moneyToCents(receipts.rows[0]?.received);
 const saved=forecast.rows[0],confirmed=!!saved?.owner_confirmed_at;
 let adjusted=null,overReceived=false;
 if(confirmed){
  const contract=moneyToCents(saved.contract_inc_gst);
  const variation=Number(saved.approved_variation_inc_gst);
  if(!Number.isFinite(variation)||Math.abs(variation)>1e9||Math.abs(variation*100-Math.round(variation*100))>0.00001)
   throw new HttpError(503,"Invalid approved variation");
  adjusted=contract+Math.round(variation*100);
  if(adjusted<=0)throw new HttpError(503,"Invalid adjusted contract");
  overReceived=received>adjusted;
 }
 const checks=[
  {key:"forecast_inputs",status:confirmed?"recorded":"missing",
   label:confirmed?"Owner forecast inputs recorded":"Signed contract, variations and forecast costs need Owner confirmation"},
  {key:"legacy_payments",status:legacyCount?"blocked":"clear",
   label:legacyCount?legacyCount+" old progress-claim payments require review":"No legacy progress-claim payments found"},
  {key:"contract_receipts",status:receiptCount?"recorded":"unverified",
   label:receiptCount?receiptCount+" new contract cash receipts recorded; completeness unverified":
    "No new contract cash receipts; confirm whether zero payments is correct"},
  {key:"cash_limit",status:overReceived?"blocked":"unverified",
   label:overReceived?"Recorded contract cash exceeds confirmed adjusted contract":"Recorded cash requires bank/claim reconciliation"},
  {key:"attendance",status:openCount?"blocked":"clear",
   label:openCount?openCount+" open shifts are not included in cost":"No unfinished attendance shifts"},
  {key:"variation_evidence",status:"unverified",
   label:"Approved variation evidence has not been independently reconciled"},
  {key:"cost_completeness",status:"unverified",
   label:"Expense completeness, wage overlap and remaining-cost estimates require review"}
 ];
 return {jobId,profitReady:false,reconciled:false,
  adjustedContractInc:adjusted===null?null:money(adjusted),
  newContractReceiptsInc:money(received),legacyPaymentCount:legacyCount,
  recordedReceiptCount:receiptCount,openAttendanceCount:openCount,
  checks,note:"Review only. No final profit is approved or activated by this report."};
}
export async function dispatchJobReconciliation({method,path,ctx,db}={}){
 const match=/^\/v1\/jobs\/([0-9a-f-]{36})\/financials\/reconciliation$/i.exec(path||"");
 if(!match)return null;
 if(method!=="GET")throw new HttpError(404,"Reconciliation is read only");
 if(!["owner","manager"].includes(ctx?.role))throw new HttpError(403,"Job reconciliation restricted to management");
 return {reconciliation:await readJobReconciliation({db,tenant:ensureUuid(ctx.tenant_id),jobId:ensureUuid(match[1])})};
}

// Source-only read model for Owner material reimbursements, not job costs/profit.
// Authenticated server.mjs supplies tenant and role from verified Cognito membership.
import {HttpError,ensureUuid} from "./domain.mjs";
const STATES=new Set(["draft","sent","reimbursed"]);
export async function listBillsQueue({db,ctx}={}){
 if(!["owner","manager"].includes(ctx?.role))throw new HttpError(403,"Bills restricted to management");
 const tenant=ensureUuid(ctx.tenant_id);
 const result=await db.query(`select m.id,m.job_id,j.name as job_name,
  to_char(m.bought_on,'YYYY-MM-DD') as bought_on,
  m.store_reference,m.amount_gross,m.gst_basis,m.customer_status,
  to_char(m.sent_on,'YYYY-MM-DD') as sent_on,
  to_char(m.reimbursed_on,'YYYY-MM-DD') as reimbursed_on,
  m.created_at
  from material_reimbursements m
  join jobs j on j.tenant_id=m.tenant_id and j.id=m.job_id
  where m.tenant_id=$1
  order by m.bought_on desc,m.created_at desc,m.id desc limit 200`,[tenant]);
 if(!Array.isArray(result.rows)||result.rows.length>200)throw new HttpError(503,"Bills queue unavailable");
 const bills=result.rows.map(row=>{
  if(!STATES.has(row.customer_status))throw new HttpError(503,"Invalid bill state");
  return {id:row.id,jobId:row.job_id,jobName:row.job_name,
   boughtOn:row.bought_on,storeReference:row.store_reference,
   amountGross:String(row.amount_gross),gstBasis:row.gst_basis,
   status:row.customer_status,sentOn:row.sent_on,reimbursedOn:row.reimbursed_on};
 });
 return {bills,limit:200,hasMore:result.rows.length===200,
  note:"Bills purchased on behalf of clients. Not job revenue, contract payments, or job expenses."};
}

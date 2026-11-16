// HandyOS isolated PostgreSQL receipt repository (SOURCE-ONLY; NOT WIRED TO LIVE HTTP/AWS).
// auth MUST be constructed only after the API independently verifies a Cognito access token.
// Every operation rechecks active membership and job within a transaction under FORCE RLS.
// Caller NEVER supplies a database role, storage key, or tenant privileges as authority.
import {randomUUID} from "node:crypto";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(x){if(typeof x!=="string"||!UUID.test(x))throw Error("Invalid identifier");return x.toLowerCase()}
function authCheck(auth){
 if(auth?.verifiedByApi!==true||typeof auth.actorSub!=="string"||auth.actorSub.length<8||auth.actorSub.length>255)
  throw Error("Verified access token required");
 return {actorSub:auth.actorSub,tenantId:uuid(auth.tenantId)};
}
const mapPending=r=>r?{
 id:r.id,tenantId:r.tenant_id,jobId:r.job_id,objectId:r.object_id,
 objectKey:r.object_key,contentType:r.content_type,contentLength:r.content_length,
 boughtOn:r.bought_on,storeReference:r.store_reference,amountGross:r.amount_gross,
 gstBasis:r.gst_basis,notes:r.notes
}:null;
async function transact(pool,auth,jobId,work){
 const {actorSub,tenantId}=authCheck(auth),job=uuid(jobId);
 const client=await pool.connect();
 try{
  await client.query("begin");
  await client.query("select set_config('app.actor_sub',$1,true)",[actorSub]);
  const member=await client.query("select role from memberships where tenant_id=$1 and cognito_sub=$2 and status='active' and role in ('owner','manager')",[tenantId,actorSub]);
  if(member.rowCount!==1)throw Error("Owner/manager membership required");
  const role=member.rows[0].role;
  await client.query("select set_config('app.tenant_id',$1,true)",[tenantId]);
  await client.query("select set_config('app.actor_role',$1,true)",[role]);
  const exists=await client.query("select id from jobs where tenant_id=$1 and id=$2",[tenantId,job]);
  if(exists.rowCount!==1)throw Error("Job not found");
  const ctx=Object.freeze({tenantId,jobId:job,actorSub,role,
   authorizedByServer:true,tenantVerified:true,jobVerified:true});
  const value=await work(client,ctx);
  await client.query("commit");
  return value;
 }catch(error){await client.query("rollback");throw error}
 finally{client.release()}
}
/** Each DB operation accepts only a verified API identity and rechecks membership. */
export function createPostgresReceiptRepository({pool}){
 if(typeof pool?.connect!=="function")throw Error("PostgreSQL pool required");
 const scope=(ctx,work)=>transact(pool,{verifiedByApi:true,actorSub:ctx.actorSub,tenantId:ctx.tenantId},ctx.jobId,work);
 return Object.freeze({
  async authorizeOwnerJob(auth,jobId){
   return transact(pool,auth,jobId,async(_db,ctx)=>ctx);
  },
  async reserveUpload(ctx,row){
   return scope(ctx,async(db,verified)=>{
    if(row.tenantId!==verified.tenantId||row.jobId!==verified.jobId)throw Error("Receipt scope mismatch");
    await db.query(`insert into receipt_upload_intents
      (id,tenant_id,job_id,object_id,object_key,content_type,content_length,bought_on,store_reference,amount_gross,gst_basis,notes)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
     [uuid(row.id),verified.tenantId,verified.jobId,uuid(row.objectId),row.objectKey,
      row.contentType,row.contentLength,row.boughtOn,row.storeReference,row.amountGross,row.gstBasis,row.notes]);
    return {id:row.id};
   });
  },
  async findPending(ctx,receiptId){
   return scope(ctx,async(db,verified)=>{
    const result=await db.query("select * from receipt_upload_intents where tenant_id=$1 and job_id=$2 and id=$3 and status='pending'",
     [verified.tenantId,verified.jobId,uuid(receiptId)]);
    return mapPending(result.rows[0]);
   });
  },
  async commitVerified(ctx,intent,verifiedObject){
   return scope(ctx,async(db,verified)=>{
    if(!verifiedObject?.verified||verifiedObject.objectKey!==intent.objectKey||
       verifiedObject.contentType!==intent.contentType||verifiedObject.byteLength!==intent.contentLength)
      throw Error("Verified S3 object does not match upload intent");
    // Lock the current intent and re-read immutable fields to prevent concurrent
    // confirmation, stale metadata and accidental duplicate reimbursement records.
    const query=await db.query("select * from receipt_upload_intents where tenant_id=$1 and job_id=$2 and id=$3 for update",
     [verified.tenantId,verified.jobId,uuid(intent.id)]);
    const row=query.rows[0];
    if(!row||row.status!=="pending"||row.object_key!==intent.objectKey||
       row.content_type!==intent.contentType||row.content_length!==intent.contentLength||
       row.object_id!==intent.objectId)
      throw Error("Receipt already committed or pending metadata changed");
    const result=await db.query(`insert into material_reimbursements
      (id,tenant_id,job_id,bought_on,store_reference,amount_gross,gst_basis,customer_status,receipt_object_key,receipt_content_type,notes)
      values($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10)
      on conflict(id) do nothing returning id,job_id`,
     [row.id,verified.tenantId,verified.jobId,row.bought_on,row.store_reference,row.amount_gross,
      row.gst_basis,row.object_key,row.content_type,row.notes]);
    if(result.rowCount!==1)throw Error("Reimbursement already exists");
    const changed=await db.query("update receipt_upload_intents set status='committed',committed_at=now() where tenant_id=$1 and job_id=$2 and id=$3 and status='pending' returning id",
     [verified.tenantId,verified.jobId,row.id]);
    if(changed.rowCount!==1)throw Error("Cannot finalize receipt intent");
    await db.query("insert into audit_events(id,tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,$3,'created','material_reimbursement',$4)",
     [randomUUID(),verified.tenantId,verified.actorSub,row.id]);
    return {id:row.id,jobId:row.job_id};
   });
  },
  async findReady(ctx,receiptId){
   return scope(ctx,async(db,verified)=>{
    const result=await db.query("select id,job_id,receipt_object_key,receipt_content_type from material_reimbursements where tenant_id=$1 and job_id=$2 and id=$3",
     [verified.tenantId,verified.jobId,uuid(receiptId)]);
    const row=result.rows[0];
    return row?{id:row.id,jobId:row.job_id,objectKey:row.receipt_object_key,contentType:row.receipt_content_type}:null;
   });
  }
 });
}

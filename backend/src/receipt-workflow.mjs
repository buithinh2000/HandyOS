// HandyOS receipt workflow (SOURCE-ONLY, NOT CONNECTED TO LIVE AWS).
// The repository must derive auth from verified Cognito + RLS, never browser-supplied roles.
// S3 signer/HEAD and database repository are injected for isolated synthetic testing.
import {randomUUID} from "node:crypto";
import {prepareReceiptUpload,authorizeReceiptDownload,verifyReceiptObject} from "./receipt-media-contract.mjs";

const ISO=/^\d{4}-\d{2}-\d{2}$/;
const BTH=/^https:\/\//;
const BASIS=new Set(["inc","ex","no_gst"]);
function invalid(message){throw new Error(message)}
function requiredDate(value){
 if(typeof value!=="string"||!ISO.test(value)||new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)invalid("Invalid purchase date");
 return value;
}
function text(value,max,required=false){
 if(typeof value!=="string"||(required&&!value.trim())||value.length>max)invalid("Invalid receipt text");
 return value.trim();
}
function money(value){
 if(typeof value!=="number"||!Number.isFinite(value)||value<=0||value>=10000000000||Math.abs(Math.round(value*100)-value*100)>0.000001)invalid("Invalid receipt amount");
 return value;
}
function signedUrl(value){
 if(typeof value!=="string"||!BTH.test(value))invalid("Signer returned invalid secure URL");
 const u=new URL(value);
 if(u.protocol!=="https:"||u.username||u.password||u.hash)invalid("Signer returned invalid secure URL");
 return value;
}
function contextCheck(ctx,jobId){
 if(!ctx||ctx.jobId!==jobId||ctx.authorizedByServer!==true||ctx.tenantVerified!==true||ctx.jobVerified!==true||
 !["owner","manager"].includes(ctx.role))invalid("Owner/manager job access denied");
 return ctx;
}
/**
 * Persistence methods must be transactional and tenant/RLS filtered:
 *  authorizeOwnerJob(auth,jobId) -> trusted context (or deny)
 *  reserveUpload(ctx,row), findPending(ctx,receiptId), commitVerified(ctx,intent,verified)
 *  findReady(ctx,receiptId)
 * Media signer methods: signPut(expected), head(expected), signGet(authorized).
 */
export function createReceiptWorkflow({repository,media,newId=randomUUID}){
 const methods=["authorizeOwnerJob","reserveUpload","findPending","commitVerified","findReady"];
 for(const m of methods)if(typeof repository?.[m]!=="function")invalid("Missing repository method "+m);
 for(const m of ["signPut","uploadHeaders","head","signGet"])if(typeof media?.[m]!=="function")invalid("Missing storage method "+m);
 async function authorized(auth,jobId){
  if(typeof jobId!=="string")invalid("Invalid job ID");
  return contextCheck(await repository.authorizeOwnerJob(auth,jobId),jobId);
 }
 return Object.freeze({
  async beginUpload({auth,jobId,details}){
   const ctx=await authorized(auth,jobId);
   if(!details||!BASIS.has(details.gstBasis))invalid("Invalid GST basis");
   const boughtOn=requiredDate(details.boughtOn),storeReference=text(details.storeReference,160,true);
   const notes=text(details.notes??"",500),amountGross=money(details.amountGross);
   const receiptId=newId(),objectId=newId();
   const expected=prepareReceiptUpload({context:ctx,receiptId,objectId,
    contentType:details.contentType,contentLength:details.contentLength});
   // If signing later fails, the pending row is safe, unbillable and eligible for cleanup.
   await repository.reserveUpload(ctx,{id:receiptId,objectId,jobId,tenantId:ctx.tenantId,
    boughtOn,storeReference,notes,amountGross,gstBasis:details.gstBasis,
    objectKey:expected.objectKey,contentType:expected.contentType,contentLength:expected.contentLength});
   const uploadHeaders=media.uploadHeaders(expected);
   if(!uploadHeaders||typeof uploadHeaders!=="object"||
      uploadHeaders["content-type"]!==expected.contentType||
      uploadHeaders["content-length"]!==String(expected.contentLength)||
      uploadHeaders["if-none-match"]!=="*"||
      uploadHeaders["x-amz-server-side-encryption"]!=="aws:kms"||
      typeof uploadHeaders["x-amz-server-side-encryption-aws-kms-key-id"]!=="string")
    invalid("Unsafe receipt upload headers");
   const uploadUrl=signedUrl(await media.signPut(expected));
   return {receiptId,uploadUrl,uploadHeaders,
    contentType:expected.contentType,expiresInSeconds:expected.expiresInSeconds,
    requiredMethod:"PUT",requiredEncryption:expected.requiredEncryption};
  },
  async confirmUpload({auth,jobId,receiptId}){
   const ctx=await authorized(auth,jobId);
   const intent=await repository.findPending(ctx,receiptId);
   if(!intent||intent.tenantId!==ctx.tenantId||intent.jobId!==jobId||intent.id!==receiptId)
    invalid("Pending receipt not found");
   const expected=prepareReceiptUpload({context:ctx,receiptId,objectId:intent.objectId,
    contentType:intent.contentType,contentLength:intent.contentLength});
   if(intent.objectKey!==expected.objectKey)invalid("Pending key mismatch");
   const head=await media.head(expected);
   const verified=verifyReceiptObject({expected,head});
   // The repository must atomically insert the material reimbursement + remove/mark
   // the pending upload exactly once. No financial row exists before verification.
   const ready=await repository.commitVerified(ctx,intent,verified);
   if(!ready||ready.id!==receiptId||ready.jobId!==jobId)invalid("Receipt commit not confirmed");
   return {id:receiptId,jobId,status:"draft",mediaReady:true};
  },
  async viewReceipt({auth,jobId,receiptId}){
   const ctx=await authorized(auth,jobId);
   const row=await repository.findReady(ctx,receiptId);
   if(!row||row.id!==receiptId||row.jobId!==jobId)invalid("Receipt not found");
   const access=authorizeReceiptDownload({context:ctx,receiptId,
    objectKey:row.objectKey,contentType:row.contentType});
   const viewUrl=signedUrl(await media.signGet(access));
   return {id:receiptId,viewUrl,expiresInSeconds:access.expiresInSeconds};
  }
 });
}

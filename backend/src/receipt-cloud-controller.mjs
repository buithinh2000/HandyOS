// HandyOS iPhone cloud-bill controller. Prepared for authenticated production UI.
// DO NOT mount in owner-v1 localStorage demo: there is no verified Cognito session.
// No automatic migration or localStorage writes; only the dedicated HandyOS API.
import {uploadReceiptFromIphone} from "./receipt-iphone-upload.mjs";
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
const BASIS=new Set(["inc","ex","no_gst"]);
function fail(message){throw Error(message)}
function exactId(value){if(typeof value!=="string"||!ID.test(value))fail("Choose a valid HandyOS job");return value}
function amount(n){if(typeof n!=="number"||!Number.isFinite(n)||n<=0||n>=1e10||
 Math.abs(n*100-Math.round(n*100))>1e-6)fail("Enter a valid bill amount in AUD");return n}
function form(details,file){
 if(!details||typeof details!=="object"||!file)fail("Complete the bill form and choose a photo");
 if(!MIME.has(file.type)||!Number.isSafeInteger(file.size)||file.size<1||
 file.size>(file.type==="application/pdf"?15:12)*1024*1024)
  fail("Choose a JPEG, PNG, WebP or PDF within the size limit");
 if(typeof details.boughtOn!=="string"||!/^(\d{4})-(\d{2})-(\d{2})$/.test(details.boughtOn)||
  Number.isNaN(Date.parse(details.boughtOn))||new Date(details.boughtOn+"T00:00:00Z").toISOString().slice(0,10)!==details.boughtOn)
  fail("Enter a valid purchase date");
 if(typeof details.storeReference!=="string"||details.storeReference.trim().length<1||
  details.storeReference.trim().length>160)fail("Enter a store or bill reference");
 if(!BASIS.has(details.gstBasis))fail("Choose the correct GST basis");
 if(typeof (details.notes??"")!=="string"||(details.notes??"").length>500)fail("Notes are too long");
 return {boughtOn:details.boughtOn,storeReference:details.storeReference.trim(),
  amountGross:amount(details.amountGross),gstBasis:details.gstBasis,notes:details.notes??"",
  contentType:file.type,contentLength:file.size};
}
/**
 * createCloudBillController exposes a 3-phase state machine:
 * idle -> preparing -> uploading -> confirming -> saved.
 * Errors leave an explicit retry-needed state, never a fabricated saved bill.
 * authApi.request is a server-verified Cognito fetch wrapper targeting HandyOS only.
 */
export function createCloudBillController({authApi,put,notify=()=>{}}={}){
 if(typeof authApi?.request!=="function"||typeof put!=="function"||typeof notify!=="function")fail("Secure HandyOS cloud session required");
 let busy=false,status="idle",lastError="";
 const report=(next,message="")=>{status=next;lastError=message;notify({status,message})};
 return Object.freeze({
  get status(){return status},
  get error(){return lastError},
  async save({jobId,file,details}){
   if(busy)fail("Receipt upload already in progress");
   const id=exactId(jobId),data=form(details,file);
   busy=true;
   try{
    report("preparing");
    const begin=await authApi.request({method:"POST",path:`/v1/jobs/${id}/receipts/uploads`,json:data});
    report("uploading");
    // Sends exact S3 headers, confirms only after PUT success; no client-side
    // financial row or customer-delivery status is ever created here.
    const receipt=await uploadReceiptFromIphone({
     file,beginResponse:begin,put,
     confirmReceipt:receiptId=>{
      report("confirming");
      return authApi.request({method:"POST",path:`/v1/jobs/${id}/receipts/${exactId(receiptId)}/confirm`});
     }
    });
    report("saved");
    return receipt;
   }catch(_err){
    report("retry-needed","Bill not saved to cloud. Check your connection and retry after reviewing the receipt list.");
    throw Error("Cloud receipt was not confirmed; do not assume it was saved");
   }finally{busy=false}
  }
 });
}

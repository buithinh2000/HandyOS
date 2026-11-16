// HandyOS iPhone browser receipt PUT helper (SOURCE-ONLY, NOT ACTIVATED).
// No localStorage, no URL logging, no implicit retry or reimbursement state change.
// API begin response is trusted only after an authenticated Owner/Manager request.
const REQUIRED=["content-type","content-length","if-none-match",
 "x-amz-server-side-encryption","x-amz-server-side-encryption-aws-kms-key-id"];
function invalid(){throw Error("Secure receipt upload unavailable")}
function validate(begin,file){
 if(!begin||!file||typeof file.size!=="number"||!Number.isSafeInteger(file.size)||file.size<=0||
  typeof file.type!=="string"||begin.requiredMethod!=="PUT"||
  begin.requiredEncryption!=="aws:kms"||!Number.isInteger(begin.expiresInSeconds)||
  begin.expiresInSeconds<1||begin.expiresInSeconds>180)invalid();
 let url;try{url=new URL(begin.uploadUrl)}catch{invalid()}
 if(url.protocol!=="https:"||url.username||url.password||url.hash||
  !/^handyos-[a-z0-9.-]+\.s3\.ap-[a-z]+-\d\.amazonaws\.com$/.test(url.hostname)||
  !url.searchParams.has("X-Amz-Signature"))invalid();
 const headers=begin.uploadHeaders;
 if(!headers||typeof headers!=="object"||Array.isArray(headers)||
  Object.keys(headers).length!==REQUIRED.length||Object.keys(headers).some(k=>!REQUIRED.includes(k)))invalid();
 if(headers["content-type"]!==file.type||headers["content-type"]!==begin.contentType||
  headers["content-length"]!==String(file.size)||
  headers["if-none-match"]!=="*"||headers["x-amz-server-side-encryption"]!=="aws:kms"||
  !/^arn:aws:kms:ap-[a-z]+-\d:\d{12}:key\/[a-f0-9-]{36}$/i.test(headers["x-amz-server-side-encryption-aws-kms-key-id"]))invalid();
 if(typeof begin.receiptId!=="string"||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(begin.receiptId))invalid();
 return headers;
}
export async function uploadReceiptFromIphone({file,beginResponse,put,confirmReceipt}={}){
 // Only caller-controlled injectors: browser fetch and authenticated API confirm.
 // Confirm is never called if S3 returned an error, redirected, or network failed.
 if(typeof put!=="function"||typeof confirmReceipt!=="function")invalid();
 const signedHeaders=validate(beginResponse,file);
 // Content-Length is a forbidden browser-controlled request header.
 // Browser derives it from the Blob/File body; never set it in fetch().
 const {"content-length":_browserComputedLength,...headers}=signedHeaders;
 let response;
 try{
  response=await put(beginResponse.uploadUrl,{method:"PUT",headers,body:file,
   credentials:"omit",redirect:"error",cache:"no-store",mode:"cors"});
 }catch{invalid()}
 if(!response||(response.status!==200&&response.status!==204)||response.ok!==true)invalid();
 try{
  const done=await confirmReceipt(beginResponse.receiptId);
  if(!done||done.id!==beginResponse.receiptId||done.mediaReady!==true||done.status!=="draft")
   invalid();
  return Object.freeze({receiptId:done.id,status:"draft",mediaReady:true});
 }catch{invalid()}
}

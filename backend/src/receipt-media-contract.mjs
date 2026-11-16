// HandyOS private receipt-media contract (SOURCE ONLY, NO AWS CALLS).
// Server must authenticate Cognito and verify PostgreSQL tenant/job membership
// before calling this module; never accept tenant ID, object key or role from a client body.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES=Object.freeze({
 "image/jpeg":{ext:"jpg",maxBytes:12*1024*1024},
 "image/png":{ext:"png",maxBytes:12*1024*1024},
 "image/webp":{ext:"webp",maxBytes:12*1024*1024},
 "application/pdf":{ext:"pdf",maxBytes:15*1024*1024}
});
const MAX_URL_SECONDS=180;
function invalid(reason){throw new TypeError(reason)}
function uuid(s,name){if(typeof s!=="string"||!UUID.test(s))invalid("Invalid "+name);return s.toLowerCase()}
function mediaType(s){if(typeof s!=="string"||!Object.hasOwn(TYPES,s))invalid("Unsupported receipt content type");return s}
function bytes(s,type){if(!Number.isSafeInteger(s)||s<1||s>TYPES[type].maxBytes)invalid("Receipt size out of bounds");return s}
function actor(context){
 // Server-only context, established by authenticated API and RLS.
 if(!context||context.authorizedByServer!==true||!["owner","manager"].includes(context.role)||
 !context.tenantVerified||!context.jobVerified)invalid("Verified owner/manager job authorization required");
 return {tenantId:uuid(context.tenantId,"tenant"),jobId:uuid(context.jobId,"job")};
}
/** Validate metadata before generating any short-lived signed upload. */
export function prepareReceiptUpload({context,receiptId,objectId,contentType,contentLength}){
 const {tenantId,jobId}=actor(context),mime=mediaType(contentType);
 const receipt=uuid(receiptId,"receipt"),object=uuid(objectId,"object");
 const length=bytes(contentLength,mime);
 const objectKey="tenants/"+tenantId+"/jobs/"+jobId+"/receipts/"+receipt+"/"+object+"."+TYPES[mime].ext;
 return Object.freeze({objectKey,contentType:mime,contentLength:length,expiresInSeconds:MAX_URL_SECONDS,
  privateOnly:true,requiredEncryption:"aws:kms",requiredMethod:"PUT"});
}
/** Exact key/job match checked again before allowing reads. */
export function authorizeReceiptDownload({context,receiptId,objectKey,contentType}){
 const {tenantId,jobId}=actor(context);
 const receipt=uuid(receiptId,"receipt"),mime=mediaType(contentType);
 if(typeof objectKey!=="string"||objectKey.length>512||
 !new RegExp("^tenants/"+tenantId+"/jobs/"+jobId+"/receipts/"+receipt+"/[0-9a-f-]{36}\\."+TYPES[mime].ext+"$","i").test(objectKey)||
 !UUID.test(objectKey.split("/").at(-1).slice(0,-(TYPES[mime].ext.length+1))))
  invalid("Receipt media key does not belong to authorized tenant, job and receipt");
 return Object.freeze({objectKey,expiresInSeconds:MAX_URL_SECONDS,privateOnly:true,requiredMethod:"GET"});
}
/** Only a server-side HEAD of the exact expected object confirms receipt upload. */
export function verifyReceiptObject({expected,head}){
 if(!expected||!head||head.key!==expected.objectKey||
  head.contentType!==expected.contentType||
  head.contentLength!==expected.contentLength||
  head.encryption!=="aws:kms"||
  (typeof head.kmsKeyArn!=="string"||!head.kmsKeyArn.startsWith("arn:aws:kms:")))
  invalid("Receipt object failed private-storage verification");
 return Object.freeze({objectKey:expected.objectKey,contentType:expected.contentType,
  byteLength:expected.contentLength,verified:true});
}

// HandyOS Owner cloud API (source-only, NOT deployed).
// Designed exclusively for API Gateway HTTP API v2 with a validated JWT authorizer.
// The browser must never possess AWS credentials or S3 access.
import {parseOwnerBackup} from "../owner-ledger-io.mjs";

const MAX_BYTES=2*1024*1024; // much smaller than S3 limit; deliberately bounded
const JSON_TYPE="application/json; charset=utf-8";
const response=(statusCode,payload,origin="",extra={})=>({
 statusCode,
 headers:{"content-type":JSON_TYPE,"cache-control":"no-store","x-content-type-options":"nosniff",
  "vary":"Origin",...(origin?{"access-control-allow-origin":origin}:{}),...extra},
 body:JSON.stringify(payload)
});
const isFailureCode=e=>["PreconditionFailed","ConditionalRequestConflict","412","409"].includes(String(e?.name||e?.Code||e?.$metadata?.httpStatusCode));
const normalizeHeader=(headers,name)=>{
 const pair=Object.entries(headers||{}).find(([key])=>key.toLowerCase()===name);
 return pair?.[1];
};
const validETag=s=>typeof s==="string"&&/^"[A-Za-z0-9-]{16,128}"$/.test(s);

// S3 implementation is injected: read(sub) => {data: serialized JSON string, etag}, or null;
// write(sub, data, {ifMatch?|ifNoneMatch?}) => {etag}.
export function createOwnerLedgerApi({storage,ownerSub,origin,apiId,issuer,clock=()=>Date.now()}){
 if(!storage||typeof storage.read!=="function"||typeof storage.write!=="function")throw new Error("Storage adapter required.");
 for(const [name,value] of Object.entries({ownerSub,origin,apiId,issuer}))
  if(typeof value!=="string"||!value.trim())throw new Error(name+" environment variable required.");
 if(!/^https:\/\//.test(origin))throw new Error("Only HTTPS owner origin is permitted.");
 return async function handler(event){
  const eventOrigin=normalizeHeader(event?.headers,"origin");
  const cors=eventOrigin===origin?origin:"";
  const method=event?.requestContext?.http?.method;
  if(eventOrigin&&eventOrigin!==origin)return response(403,{error:"Origin not allowed"});
  // API Gateway authorizer must be configured on BOTH GET and PUT.
  // API ID + issuer + sub checks are defense in depth, not a replacement for JWT verification.
  if(event?.version!=="2.0"||event?.requestContext?.apiId!==apiId)
   return response(403,{error:"Request gateway not authorized"},cors);
  const claims=event?.requestContext?.authorizer?.jwt?.claims;
  if(!claims||claims.sub!==ownerSub||claims.iss!==issuer)return response(403,{error:"Owner authentication required"},cors);
  if(method!=="GET"&&method!=="PUT")return response(405,{error:"Method not allowed"},cors,{allow:"GET, PUT"});
  if(method==="GET"){
   try{
    const record=await storage.read(ownerSub);
    if(!record)return response(200,{state:null,revision:null},cors);
    const data=parseOwnerBackup(record.data);
    if(!validETag(record.etag))throw new Error("Unexpected storage revision");
    return response(200,{state:data,revision:record.etag},cors);
   }catch{return response(503,{error:"Unable to read securely stored ledger"},cors)}
  }
  if(event.isBase64Encoded)return response(400,{error:"Base64 bodies are not supported"},cors);
  if(typeof event.body!=="string"||Buffer.byteLength(event.body,"utf8")>MAX_BYTES)
   return response(413,{error:"Ledger size invalid or exceeds 2 MiB"},cors);
  const ifMatch=normalizeHeader(event.headers,"if-match");
  const ifNoneMatch=normalizeHeader(event.headers,"if-none-match");
  if(Boolean(ifMatch)===Boolean(ifNoneMatch))
   return response(428,{error:"Supply If-Match with revision, or If-None-Match: * on first save"},cors);
  if(ifMatch&&!validETag(ifMatch)||ifNoneMatch&&ifNoneMatch!=="*")
   return response(400,{error:"Invalid revision precondition"},cors);
  let normalized;
  try{normalized=parseOwnerBackup(event.body)}catch(e){return response(400,{error:"Invalid ledger: "+e.message},cors)}
  // Defense in depth: ensure authorized Owner state is the only record this API can write.
  const serialized=JSON.stringify(normalized);
  if(Buffer.byteLength(serialized,"utf8")>MAX_BYTES)return response(413,{error:"Ledger exceeds 2 MiB"},cors);
  try{
   const stored=await storage.write(ownerSub,serialized,ifMatch?{ifMatch}:{ifNoneMatch:"*"});
   if(!validETag(stored?.etag))throw new Error("Missing write revision");
   return response(200,{saved:true,revision:stored.etag,savedAt:new Date(clock()).toISOString()},cors);
  }catch(e){
   if(isFailureCode(e))return response(409,{error:"Another version exists. Reload or back up your changes before retrying."},cors);
   return response(503,{error:"Secure save failed; local data was not synced"},cors);
  }
 };
}

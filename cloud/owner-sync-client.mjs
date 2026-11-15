// HandyOS Owner V1 secure sync client (SOURCE ONLY; NOT attached to public demo).
// Tokens are supplied by an independently configured PKCE login and held in memory only.
// Never put access tokens or private financial records in URL parameters.
import {parseOwnerBackup} from "../owner-ledger-io.mjs";

const VALID_ETAG=/^"[A-Za-z0-9-]{16,128}"$/;
const MAX_SIZE=2*1024*1024;
export class OwnerSyncError extends Error {
 constructor(code,message){super(message);this.name="OwnerSyncError";this.code=code}
}
function reject(code,message){throw new OwnerSyncError(code,message)}
function enforceEndpoint(endpoint){
 if(typeof endpoint!=="string")reject("configuration","Owner API endpoint missing");
 let url;
 try{url=new URL(endpoint)}catch{reject("configuration","Owner API URL invalid")}
 if(url.protocol!=="https:"||url.username||url.password||url.hash||url.search||url.pathname!=="/owner-ledger")
  reject("configuration","Owner API requires HTTPS and /owner-ledger without URL credentials, query or fragments");
 return url.toString();
}
function enforceToken(value){
 if(typeof value!=="string"||!value.trim()||value.length>20000)
  reject("authentication","Owner login session required");
 return value.trim();
}
async function parseResponse(response){
 let body;
 try{body=await response.json()}catch{reject("protocol","Server response is not valid JSON")}
 if(!body||typeof body!=="object"||Array.isArray(body))reject("protocol","Server response has an invalid shape");
 return body;
}
function ensureRevision(value){
 if(!VALID_ETAG.test(String(value||"")))reject("protocol","Invalid or missing server revision");
 return value;
}

export function createOwnerSyncClient({endpoint,accessToken,fetchImpl=globalThis.fetch}){
 const url=enforceEndpoint(endpoint);
 if(typeof fetchImpl!=="function")reject("configuration","Secure fetch implementation required");
 if(typeof accessToken!=="function")reject("configuration","Owner login session provider required");
 // No persisted token, revision, or remote state inside this module.
 const request=async(method,body=null,versionHeader=null)=>{
  const token=enforceToken(await accessToken());
  const headers={authorization:"Bearer "+token,accept:"application/json"};
  if(body!==null){headers["content-type"]="application/json";headers[versionHeader.name]=versionHeader.value}
  let response;
  try{response=await fetchImpl(url,{method,headers,mode:"cors",cache:"no-store",credentials:"omit",redirect:"error",...(body===null?{}:{body})})}
  catch{reject("network","Cannot reach secure Owner API; local data was not synced")}
  if(response.status===401||response.status===403)reject("authentication","Owner session expired or access denied; local data was not synced");
  if(response.status===409)reject("conflict","Cloud ledger changed in another session; export your local backup and compare before saving again");
  if(!response.ok)reject("server","Secure Owner API did not confirm the operation; local data was not synced");
  return parseResponse(response);
 };
 return Object.freeze({
  async load(){
   const body=await request("GET");
   if(body.state===null){
    if(body.revision!==null)reject("protocol","Empty cloud ledger must have no revision");
    return {state:null,revision:null};
   }
   const revision=ensureRevision(body.revision);
   let parsed;
   try{parsed=parseOwnerBackup(JSON.stringify(body.state))}catch{reject("protocol","Cloud ledger failed validation")}
   return {state:parsed,revision};
  },
  async save(state,{revision,confirmed=false}={}){
   // The application must get explicit human confirmation before uploading a
   // browser-local backup to the cloud; never silently migrate legacy records.
   if(confirmed!==true)reject("confirmation","Owner confirmation required before cloud save");
   let payload;
   try{payload=JSON.stringify(parseOwnerBackup(JSON.stringify(state)))}catch{reject("validation","Refusing to upload an invalid ledger")}
   if(new TextEncoder().encode(payload).length>MAX_SIZE)reject("validation","Ledger exceeds 2 MiB cloud limit");
   let versionHeader;
   if(revision===null)versionHeader={name:"if-none-match",value:"*"};
   else versionHeader={name:"if-match",value:ensureRevision(revision)};
   const body=await request("PUT",payload,versionHeader);
   if(body.saved!==true)reject("protocol","Cloud did not confirm successful save");
   return {revision:ensureRevision(body.revision),savedAt:typeof body.savedAt==="string"?body.savedAt:null};
  }
 });
}

// Explicit local-data reconciliation: never merge financial records by names
// or silently replace one dataset with another.
export function reconcileOwnerLedger(local,remote){
 const localState=parseOwnerBackup(JSON.stringify(local));
 if(remote===null)return {kind:"cloud-empty",local:localState,remote:null,requiresConfirmation:true};
 const remoteState=parseOwnerBackup(JSON.stringify(remote));
 if(JSON.stringify(localState)===JSON.stringify(remoteState))
  return {kind:"identical",local:localState,remote:remoteState,requiresConfirmation:false};
 return {kind:"different",local:localState,remote:remoteState,requiresConfirmation:true};
}

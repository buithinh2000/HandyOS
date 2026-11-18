// HandyOS-only Cognito API transport for FUTURE authenticated cloud UI.
// No token storage, no login implementation, no AWS calls on initialization.
// Session provider must be supplied by a vetted dedicated HandyOS Cognito client.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST=/^(?:api-)?(?:staging\.)?handyos\.[a-z0-9.-]+$/i;
const JOB_ROUTE=new RegExp("^/v1/jobs/("+UUID.source.slice(1,-1)+")/receipts/(uploads|("+UUID.source.slice(1,-1)+")/(confirm|media))$","i");
function unavailable(){throw Error("HandyOS authenticated API unavailable")}
export function validateHandyOsApiOrigin({apiOrigin,uiOrigin}={}){
 let api,ui;
 try{api=new URL(apiOrigin);ui=new URL(uiOrigin)}catch{unavailable()}
 if(api.protocol!=="https:"||ui.protocol!=="https:"||
  api.username||api.password||api.port||api.search||api.hash||api.pathname!=="/"||
  ui.username||ui.password||ui.port||ui.search||ui.hash||ui.pathname!=="/"||
  !HOST.test(api.hostname)||!HOST.test(ui.hostname)||
  !api.hostname.endsWith(".buitai.com")||!ui.hostname.endsWith(".buitai.com")||
  api.hostname===ui.hostname||api.hostname!=="api-"+ui.hostname)unavailable();
 return Object.freeze({apiOrigin:api.origin,uiOrigin:ui.origin});
}
function routeAllowed(method,path){
 if(new RegExp("^/v1/jobs/"+UUID.source.slice(1,-1)+"/financials/contract-receipts$","i").test(path))
  return method==="GET"||method==="POST";
 if(new RegExp("^/v1/jobs/"+UUID.source.slice(1,-1)+"/financials/forecast-inputs$","i").test(path))
  return method==="GET"||method==="POST";
 if(new RegExp("^/v1/jobs/"+UUID.source.slice(1,-1)+"/financials(?:/(?:settings|expenses))?$","i").test(path)){
  return method==="GET"&&path.endsWith("/financials")||
   method==="POST"&&/(?:\/settings|\/expenses)$/.test(path);
 }
 if(method==="POST"&&path==="/v1/jobs")return true;
 if(new RegExp("^/v1/jobs/"+UUID.source.slice(1,-1)+"/tasks$","i").test(path))
  return method==="GET"||method==="POST";
 if(new RegExp("^/v1/payroll/"+UUID.source.slice(1,-1)+"/weeks/\\d{4}-\\d{2}-\\d{2}(?:/(?:bonus|payment|close))?$","i").test(path)){
  return method==="GET"&&!/(?:\/bonus|\/payment|\/close)$/.test(path) ||
   method==="POST"&&/(?:\/bonus|\/payment|\/close)$/.test(path);
 }

 if(method==="GET"&&(path==="/v1/staff"||/^\/v1\/attendance\?date=\d{4}-\d{2}-\d{2}$/.test(path)||/^\/v1\/attendance\/month\?month=\d{4}-(?:0[1-9]|1[0-2])$/.test(path)))return true;
 if(method==="POST"&&(path==="/v1/staff"||path==="/v1/attendance/check-in"||path==="/v1/attendance/backfill"))return true;
 if(method==="POST"&&new RegExp("^/v1/attendance/"+UUID.source.slice(1,-1)+"/(?:check-out|correct)$","i").test(path))return true;
 if(method==="GET"&&(path==="/v1/me"||path==="/v1/jobs"||path==="/v1/bills"))return true;
 if(method==="POST"&&new RegExp("^/v1/bills/"+UUID.source.slice(1,-1)+"/(?:mark-sent|payment)$","i").test(path))return true;
 const m=JOB_ROUTE.exec(path);
 if(!m)return false;
 return method==="POST"&&(m[2]==="uploads"||m[4]==="confirm")||
  method==="GET"&&m[4]==="media";
}
export function createHandyOsApiTransport({apiOrigin,uiOrigin,locationOrigin,session,fetcher}={}){
 const fixed=validateHandyOsApiOrigin({apiOrigin,uiOrigin});
 if((typeof location!=="undefined"&&location.origin!==fixed.uiOrigin)||
  locationOrigin!==fixed.uiOrigin||typeof session?.accessToken!=="function"||
  typeof session?.tenantId!=="function"||typeof fetcher!=="function")unavailable();
 return Object.freeze({
  async listCompanies(){
   // Only bearer token, no tenant guess from browser storage or URL.
   let token;
   try{token=await session.accessToken()}catch{unavailable()}
   if(typeof token!=="string"||token.length<20||token.length>20000||/\s/.test(token))unavailable();
   let res;
   try{res=await fetcher(fixed.apiOrigin+"/v1/companies",{
    method:"GET",headers:{authorization:"Bearer "+token},mode:"cors",
    credentials:"omit",redirect:"error",cache:"no-store"
   })}catch{unavailable()}
   if(!res||res.ok!==true||res.status!==200)unavailable();
   let value;try{value=await res.json()}catch{unavailable()}
   if(!Array.isArray(value?.companies)||value.companies.length>100)unavailable();
   const seen=new Set(),valid=[];
   for(const m of value.companies){
    if(!m||!UUID.test(m.tenant_id)||!["owner","manager"].includes(m.role)||
     seen.has(m.tenant_id))unavailable();
    seen.add(m.tenant_id);
    valid.push(Object.freeze({tenant_id:m.tenant_id,role:m.role}));
   }
   return Object.freeze(valid);
  },
  async request({method="GET",path,json}={}){
   if(typeof path!=="string"||!routeAllowed(method,path)||path.includes("%")||path.includes("//"))unavailable();
   if(method==="GET"&&json!==undefined)unavailable();
   if(method==="POST"&&json!==undefined&&(json===null||typeof json!=="object"||Array.isArray(json)))unavailable();
   let token,tenant;
   try{token=await session.accessToken();tenant=await session.tenantId()}catch{unavailable()}
   if(typeof token!=="string"||token.length<20||token.length>20000||/\s/.test(token)||
    typeof tenant!=="string"||!UUID.test(tenant))unavailable();
   const headers={authorization:"Bearer "+token,"x-handyos-tenant":tenant};
   if(json!==undefined)headers["content-type"]="application/json";
   let response;
   try{response=await fetcher(fixed.apiOrigin+path,{method,headers,
    body:json===undefined?undefined:JSON.stringify(json),
    mode:"cors",credentials:"omit",redirect:"error",cache:"no-store"})}catch{unavailable()}
   if(!response||response.ok!==true||!Number.isInteger(response.status)||
    response.status<200||response.status>299)unavailable();
   let value;
   try{value=await response.json()}catch{unavailable()}
   if(!value||typeof value!=="object"||Array.isArray(value))unavailable();
   return value;
  }
 });
}

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
 if(method==="GET"&&(path==="/v1/me"||path==="/v1/jobs"))return true;
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

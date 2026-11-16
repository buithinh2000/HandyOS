// HandyOS-only authenticated transport for a FUTURE Cognito-enabled cloud UI.
// No login, AWS SDK, token persistence, or production activation in this module.
// Caller supplies a short-lived verified-session token provider and pinned API origin.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH=/^\/v1\/(?:me|jobs|jobs\/[0-9a-f-]{36}\/receipts\/(?:uploads|[0-9a-f-]{36}\/(?:confirm|media)))$/i;
function fail(){throw Error("HandyOS authenticated API unavailable")}
export function validateHandyOsApiOrigin({apiOrigin,uiOrigin}={}){
 let api,ui;
 try{api=new URL(apiOrigin);ui=new URL(uiOrigin)}catch{fail()}
 // No arbitrary URLs, credentials, fragments, path-prefix routing or query tokens.
 if(api.protocol!=="https:"||ui.protocol!=="https:"||
  api.username||api.password||api.search||api.hash||api.pathname!=="/"||
  ui.username||ui.password||ui.search||ui.hash||ui.pathname!=="/"||
  !/^api-staging\.handyos\.[a-z0-9.-]+$/i.test(api.hostname)||
  !/^staging\.handyos\.[a-z0-9.-]+$/i.test(ui.hostname)||
  !api.hostname.endsWith(".buitai.com")||!ui.hostname.endsWith(".buitai.com")||
  api.hostname.slice("api-staging.".length)!==ui.hostname.slice("staging.".length)||
  api.port||ui.port)fail();
 return Object.freeze({apiOrigin:api.origin,uiOrigin:ui.origin});
}
export function createHandyOsApiTransport({apiOrigin,uiOrigin,session,fetcher,locationOrigin}={}){
 const fixed=validateHandyOsApiOrigin({apiOrigin,uiOrigin});
 if(locationOrigin!==fixed.uiOrigin||typeof session?.accessToken!=="function"||
  typeof fetcher!=="function")fail();
 return Object.freeze({
  async request({method="GET",path,json}={}){
   if(!["GET","POST"].includes(method)||typeof path!=="string"||!PATH.test(path))fail();
   // UUIDs should be canonical, not merely made from random hex/dashes.
   const parts=path.split("/");
   for(const part of parts)if(part.length===36&&!UUID.test(part))fail();
   if(method==="GET"&&json!==undefined)fail();
   if(method==="POST"&&json!==undefined&&(json===null||typeof json!=="object"||Array.isArray(json)))fail();
   const token=await session.accessToken();
   if(typeof token!=="string"||token.length<20||token.length>20000||/\s/.test(token))fail();
   // Session supplies membership-scoped tenant from validated application state.
   // The server independently checks this header against active Cognito membership.
   const tenant=await session.tenantId();
   if(typeof tenant!=="string"||!UUID.test(tenant))fail();
   const headers={"authorization":"Bearer "+token,"x-handyos-tenant":tenant};
   if(json!==undefined)headers["content-type"]="application/json";
   let response;
   try{
    response=await fetcher(fixed.apiOrigin+path,{
     method,headers,body:json===undefined?undefined:JSON.stringify(json),
     mode:"cors",credentials:"omit",redirect:"error",cache:"no-store"
    });
   }catch{fail()}
   if(!response||response.ok!==true||!Number.isInteger(response.status)||
      response.status<200||response.status>299)fail();
   let value;
   try{value=await response.json()}catch{fail()}
   if(!value||typeof value!=="object"||Array.isArray(value))fail();
   return value;
  }
 });
}

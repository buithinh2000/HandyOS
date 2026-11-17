// Fixed, non-secret read-only HandyOS UI assets in the same Docker image.
// No arbitrary file-serving path, no demo localStorage pages or .env files.
// Real HTTPS frontend/API routing, Cognito and database require isolated staging.
import {readFileSync} from "node:fs";
import {validateHandyOsCognitoConfig} from "./handyos-cognito-pkce.mjs";
import {validateHandyOsApiOrigin} from "./handyos-cloud-api-transport.mjs";
const ASSETS=Object.freeze({
 "/":{file:"../../web/index.html",type:"text/html; charset=utf-8"},
 "/auth/callback":{file:"../../web/index.html",type:"text/html; charset=utf-8"},
 "/assets/boot.mjs":{file:"../../web/boot.mjs",type:"text/javascript; charset=utf-8"},
 ...Object.fromEntries([
 "handyos-login-shell","handyos-workspace-shell","handyos-today-view","handyos-jobs-view","handyos-financials-view","handyos-payroll-view","handyos-cognito-pkce","handyos-cloud-api-transport",
 "handyos-cloud-bills-app","receipt-cloud-controller","receipt-cloud-view",
 "receipt-iphone-upload"
 ].map(x=>["/assets/"+x+".mjs",{file:"./"+x+".mjs",type:"text/javascript; charset=utf-8"}]))
});
export function publicHandyOsConfig(env={}){
 const apiOrigin=env.HANDYOS_API_ORIGIN,uiOrigin=env.HANDYOS_UI_ORIGIN;
 const issuerOrigin=env.HANDYOS_COGNITO_DOMAIN,clientId=env.HANDYOS_COGNITO_CLIENT_ID;
 const api=validateHandyOsApiOrigin({apiOrigin,uiOrigin});
 const auth=validateHandyOsCognitoConfig({issuerOrigin,uiOrigin,clientId});
 // The app client id is intentionally PUBLIC; access-token, DB and secret
 // environment variables are never serialized.
 return Object.freeze({uiOrigin:api.uiOrigin,apiOrigin:api.apiOrigin,
  issuerOrigin:auth.issuerOrigin,clientId:auth.clientId});
}
function publicHeaders(type,csp){
 const headers={"content-type":type,"cache-control":"no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer",
  "x-frame-options":"DENY","cross-origin-resource-policy":"same-origin"};
 if(csp)headers["content-security-policy"]=csp;
 return headers;
}
export function frontendRoute(path,method,env={}){
 if(method!=="GET"&&method!=="HEAD")return null;
 if(path==="/config.json"){
  let config;
  try{config=publicHandyOsConfig(env)}catch{
   return {status:503,headers:publicHeaders("application/json; charset=utf-8"),
    body:Buffer.from('{"error":"HandyOS cloud not configured"}')};
  }
  return {status:200,headers:publicHeaders("application/json; charset=utf-8"),
   body:Buffer.from(JSON.stringify(config))};
 }
 const asset=Object.hasOwn(ASSETS,path)?ASSETS[path]:null;
 if(!asset)return null;
 let csp;
 if(path==="/"||path==="/auth/callback"){
  // Staging blocks inline JavaScript, embeddings and form submission to other hosts.
  // Inline CSS is necessary for current mobile components.
  csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "+
   "img-src 'self' blob: data:; connect-src 'self' https://api-staging.handyos.buitai.com "+
   "https://handyos-staging.auth.ap-southeast-1.amazoncognito.com "+
   "https://*.s3.ap-southeast-1.amazonaws.com; form-action 'none'; base-uri 'none'; "+
   "frame-ancestors 'none'; object-src 'none'";
 }
 return {status:200,headers:publicHeaders(asset.type,csp),
  body:readFileSync(new URL(asset.file,import.meta.url))};
}
export function sendHandyOsFrontend(req,res,env=process.env){
 let path;
 try{path=new URL(req.url,"http://local.invalid").pathname}catch{return false}
 const route=frontendRoute(path,req.method,env);
 if(!route)return false;
 res.writeHead(route.status,route.headers);
 res.end(req.method==="HEAD"?undefined:route.body);
 return true;
}

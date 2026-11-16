// Dedicated HandyOS Cognito OAuth2 Authorization Code + PKCE staging adapter.
// SOURCE-ONLY: does not create Cognito resources or auto-mount the legacy demo.
// Access tokens stay in JS memory ONLY; PKCE verifier/state live in short-lived
// sessionStorage across the OAuth redirect, never localStorage or URL fragments.
// Authorization is enforced by HandyOS API JWT verifier and active DB membership.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PENDING_KEY="handyos:oauth:pkce:pending:v1";
function fail(){throw Error("HandyOS sign-in unavailable")}
function origin(input){let u;try{u=new URL(input)}catch{fail()}if(u.protocol!=="https:"||u.port||u.username||u.password||u.hash||u.search||u.pathname!=="/")fail();return u}
function base64Url(bytes){
 let binary="";for(const b of bytes)binary+=String.fromCharCode(b);
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function secureRandom(cryptoApi,length){const bytes=new Uint8Array(length);cryptoApi.getRandomValues(bytes);return base64Url(bytes)}
export function validateHandyOsCognitoConfig({issuerOrigin,uiOrigin,clientId,redirectPath="/auth/callback"}={}){
 const issuer=origin(issuerOrigin),ui=origin(uiOrigin);
 // Dedicated app-specific Cognito domain; never a BuiTai Core / shared login.
 if(!/^handyos-[a-z0-9-]+\.auth\.ap-[a-z]+-\d\.amazoncognito\.com$/.test(issuer.hostname)||
  ui.hostname!=="staging.handyos.buitai.com"||
  typeof clientId!=="string"||!/^[a-zA-Z0-9]{12,128}$/.test(clientId)||
  redirectPath!=="/auth/callback")fail();
 return Object.freeze({issuerOrigin:issuer.origin,uiOrigin:ui.origin,clientId,
  redirectUri:ui.origin+redirectPath});
}
/**
 * Not a JWT verifier. API's CognitoJwtVerifier validates issuer/audience/exp.
 * A fresh /v1/me and selected active PostgreSQL membership is required by
 * mountAuthenticatedCloudBills before rendering bills.
 */
export function createHandyOsPkceSession({config,cryptoApi,fetcher,storage,clock=()=>Date.now()}={}){
 const fixed=validateHandyOsCognitoConfig(config);
 if(!cryptoApi||typeof cryptoApi.getRandomValues!=="function"||
  typeof cryptoApi.subtle?.digest!=="function"||typeof fetcher!=="function"||
  typeof storage?.getItem!=="function"||typeof storage?.setItem!=="function"||
  typeof storage?.removeItem!=="function")fail();
 let access=null,expiresAt=0,tenantId=null;
 const clear=()=>{access=null;expiresAt=0;tenantId=null;storage.removeItem(PENDING_KEY)};
 const requireTenant=()=>{if(!tenantId||!UUID.test(tenantId))fail();return tenantId};
 const seconds=n=>Number.isInteger(n)&&n>0&&n<=3600?n:0;
 return Object.freeze({
  async begin(){
   clear();
   const verifier=secureRandom(cryptoApi,64),state=secureRandom(cryptoApi,32);
   const hashed=new Uint8Array(await cryptoApi.subtle.digest("SHA-256",new TextEncoder().encode(verifier)));
   const challenge=base64Url(hashed);
   const createdAt=clock();
   if(!Number.isFinite(createdAt))fail();
   storage.setItem(PENDING_KEY,JSON.stringify({verifier,state,createdAt}));
   const uri=new URL(fixed.issuerOrigin+"/oauth2/authorize");
   uri.searchParams.set("response_type","code");
   uri.searchParams.set("client_id",fixed.clientId);
   uri.searchParams.set("redirect_uri",fixed.redirectUri);
   uri.searchParams.set("scope","openid email");
   uri.searchParams.set("code_challenge_method","S256");
   uri.searchParams.set("code_challenge",challenge);
   uri.searchParams.set("state",state);
   return uri.toString();
  },
  async complete(callbackUrl){
   let u;try{u=new URL(callbackUrl)}catch{fail()}
   const expected=new URL(fixed.redirectUri);
   if(u.origin!==expected.origin||u.pathname!==expected.pathname||u.hash||
      u.searchParams.has("error")||u.searchParams.has("access_token")||
      [...u.searchParams.keys()].some(k=>!["code","state"].includes(k))||
      u.searchParams.getAll("code").length!==1||u.searchParams.getAll("state").length!==1)fail();
   const code=u.searchParams.get("code"),state=u.searchParams.get("state");
   const raw=storage.getItem(PENDING_KEY);
   // Remove pending verifier immediately: one attempt only, including failure.
   storage.removeItem(PENDING_KEY);
   if(!raw||!code||code.length>4096||!state)fail();
   let pending;try{pending=JSON.parse(raw)}catch{fail()}
   const now=clock();
   if(!pending||pending.state!==state||typeof pending.verifier!=="string"||
      !/^[A-Za-z0-9_-]{43,128}$/.test(pending.verifier)||
      !Number.isFinite(now)||now<pending.createdAt||now-pending.createdAt>300000)fail();
   let res;
   try{res=await fetcher(fixed.issuerOrigin+"/oauth2/token",{
    method:"POST",mode:"cors",credentials:"omit",redirect:"error",cache:"no-store",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"authorization_code",client_id:fixed.clientId,
     redirect_uri:fixed.redirectUri,code,code_verifier:pending.verifier}).toString()
   })}catch{fail()}
   if(!res||!res.ok||res.status!==200)fail();
   let token;try{token=await res.json()}catch{fail()}
   if(token?.token_type!=="Bearer"||typeof token.access_token!=="string"||
      token.access_token.length<20||token.access_token.length>20000||
      /\s/.test(token.access_token)||!seconds(token.expires_in))fail();
   // Refresh tokens are intentionally discarded. Re-login is required after
   // access token expiry; never store a refresh token in browser storage.
   access=token.access_token;expiresAt=now+token.expires_in*1000;
   return Object.freeze({authenticated:true,expiresAt});
  },
  chooseTenant(id){if(typeof id!=="string"||!UUID.test(id))fail();tenantId=id},
  async accessToken(){
   if(!access||clock()+30000>=expiresAt){clear();fail()}
   return access;
  },
  async tenantId(){return requireTenant()},
  logout:clear
 });
}

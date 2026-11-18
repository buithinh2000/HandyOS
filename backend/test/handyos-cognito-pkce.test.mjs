import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {createHandyOsPkceSession,validateHandyOsCognitoConfig} from "../src/handyos-cognito-pkce.mjs";
const uiOrigin="https://staging.handyos.buitai.com";
const issuerOrigin="https://handyos-staging.auth.ap-southeast-1.amazoncognito.com";
const clientId="handyosclient12345";
const config={uiOrigin,issuerOrigin,clientId};
const tenant="11111111-1111-4111-8111-111111111111";
const access="syntheticAccessTokenWithLengthMoreThanTwenty";
const values=new Map();
const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
let now=1731800000000;
function make(fetcher=async()=>({ok:true,status:200,json:async()=>({
 token_type:"Bearer",access_token:access,expires_in:300,refresh_token:"never-store"
})})){
 return createHandyOsPkceSession({config,cryptoApi:webcrypto,storage,fetcher,clock:()=>now});
}
async function login(s){
 const uri=new URL(await s.begin());
 return {uri,callback:uiOrigin+"/auth/callback?code=syntheticCode&state="+uri.searchParams.get("state")};
}
test("reject foreign Cognito pools, UI origins, HTTP or wrong callback",()=>{
 assert.equal(validateHandyOsCognitoConfig(config).redirectUri,uiOrigin+"/auth/callback");
 for(const change of [{uiOrigin:"https://buitai.com"},{issuerOrigin:"https://buitai-core.auth.ap-southeast-1.amazoncognito.com"},
  {issuerOrigin:"https://handyos-staging.auth.ap-southeast-2.amazoncognito.com.evil.net"},
  {issuerOrigin:"http://handyos-staging.auth.ap-southeast-1.amazoncognito.com"},
  {redirectPath:"/other"},{clientId:"weak"}])
  assert.throws(()=>validateHandyOsCognitoConfig({...config,...change}),/unavailable/);
});
test("same PKCE gate permits exact production hostname but not copied core domain",()=>{
 const production={uiOrigin:"https://handyos.buitai.com",
  issuerOrigin:"https://handyos-production.auth.ap-southeast-1.amazoncognito.com",
  clientId:"handyosprodclient12345"};
 const verified=validateHandyOsCognitoConfig(production);
 assert.equal(verified.redirectUri,"https://handyos.buitai.com/auth/callback");
 for(const badUi of ["https://admin.handyos.buitai.com",
  "https://handyos.buitai.com.evil.net","https://handyos.buitai.com:8443"]){
  assert.throws(()=>validateHandyOsCognitoConfig({...production,uiOrigin:badUi}),/unavailable/);
 }
});
test("PKCE S256 authenticates state-bound code exactly once and access token stays in memory",async()=>{
 values.clear();const calls=[];const s=make(async(url,req)=>{
  calls.push({url,req});return {ok:true,status:200,json:async()=>({
   token_type:"Bearer",access_token:access,expires_in:300,refresh_token:"never-store"
  })};
 });
 const {uri,callback}=await login(s);
 assert.equal(uri.origin,issuerOrigin);assert.equal(uri.pathname,"/oauth2/authorize");
 assert.equal(uri.searchParams.get("response_type"),"code");
 assert.equal(uri.searchParams.get("code_challenge_method"),"S256");
 assert.ok(uri.searchParams.get("code_challenge").length>=43);
 assert.equal(uri.searchParams.get("redirect_uri"),uiOrigin+"/auth/callback");
 assert.equal(values.size,1);
 assert.equal((await s.complete(callback)).authenticated,true);
 assert.equal(values.size,0,"PKCE verifier removed after code exchange");
 assert.equal(calls.length,1);assert.equal(calls[0].url,issuerOrigin+"/oauth2/token");
 const body=new URLSearchParams(calls[0].req.body);
 assert.equal(body.get("grant_type"),"authorization_code");
 assert.ok(body.get("code_verifier").length>=43);
 assert.equal(calls[0].req.credentials,"omit");
 assert.equal(await s.accessToken(),access);
 s.chooseTenant(tenant);assert.equal(await s.tenantId(),tenant);
 await assert.rejects(s.complete(callback),/unavailable/,"replay should fail");
 assert.equal(values.size,0);
 now+=271000;
 await assert.rejects(s.accessToken(),/unavailable/,"expires with 30s safety window");
 now-=271000;
 assert.equal(values.size,0);
});
test("reject callback state mismatch and expiry without calling token endpoint",async()=>{
 values.clear();let calls=0;const s=make(async()=>{calls++;throw Error("should never be called")});
 const {callback}=await login(s);
 await assert.rejects(s.complete(callback.replace("state=","state=wrong")),/unavailable/);
 assert.equal(calls,0);
 assert.equal(values.size,0);
 await login(s);now+=300001;
 const stale=values.get("handyos:oauth:pkce:pending:v1");
 const pending=JSON.parse(stale);
 await assert.rejects(s.complete(uiOrigin+"/auth/callback?code=x&state="+pending.state),/unavailable/);
 assert.equal(calls,0);now-=300001;
});
test("discard tokens on failing token exchange, reject OAuth error and callback injection",async()=>{
 values.clear();
 const s=make(async()=>({ok:false,status:400,json:async()=>({error:"invalid_grant"})}));
 const {callback}=await login(s);
 await assert.rejects(s.complete(callback),/unavailable/);
 await assert.rejects(s.accessToken(),/unavailable/);
 const next=await login(s);
 await assert.rejects(s.complete(next.callback+"&access_token=spoofed"),/unavailable/);
 await assert.rejects(s.complete(uiOrigin+"/auth/callback?error=access_denied"),/unavailable/);
 s.logout();assert.equal(values.size,0);
});
test("unexpected token types or excessive lifetime are blocked",async()=>{
 for(const token of [{token_type:"mac",access_token:access,expires_in:300},
  {token_type:"Bearer",access_token:access,expires_in:999999},
  {token_type:"Bearer",access_token:"short",expires_in:300}]){
  values.clear();
  const s=make(async()=>({ok:true,status:200,json:async()=>token}));
  const {callback}=await login(s);
  await assert.rejects(s.complete(callback),/unavailable/);
  await assert.rejects(s.accessToken(),/unavailable/);
 }
});

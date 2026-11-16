// Browser OAuth redirect and company picker tests, entirely synthetic.
// HTTPS staging origin mocked; never contacts AWS/Cognito or persists real tokens.
import {chromium} from "playwright";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const ui="https://staging.handyos.buitai.com",api="https://api-staging.handyos.buitai.com";
const issuer="https://handyos-staging.auth.ap-southeast-1.amazoncognito.com";
const tenant="11111111-1111-4111-8111-111111111111";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const receipt="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ids=["handyos-login-shell","handyos-cognito-pkce","handyos-cloud-api-transport",
 "handyos-cloud-bills-app","receipt-cloud-view","receipt-cloud-controller","receipt-iphone-upload"];
const modules=Object.fromEntries(ids.map(x=>["/"+x+".mjs",readFileSync("backend/src/"+x+".mjs","utf8")]));
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div></body></html>';
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:860},serviceWorkers:"block"});
  const failures=[];page.on("pageerror",e=>failures.push(e.message));
  await page.route("**/*",async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==ui)return route.abort();
   if(url.pathname==="/"||url.pathname==="/auth/callback")return route.fulfill({contentType:"text/html",body:html});
   if(modules[url.pathname])return route.fulfill({contentType:"text/javascript",body:modules[url.pathname]});
   return route.abort();
  });
  await page.goto(ui+"/");
  const setup=async()=>{
   await page.evaluate(async({ui,api,issuer,tenant,job,receipt})=>{
    const {mountHandyOsLoginShell}=await import("/handyos-login-shell.mjs");
    window.requests=[];
    const fetcher=async(url,opts)=>{
     window.requests.push({url,method:opts.method,headers:opts.headers});
     let data;
     if(url===issuer+"/oauth2/token")data={token_type:"Bearer",access_token:"synthetic-access-token-long-enough",expires_in:3600};
     else if(url===api+"/v1/companies")data={companies:[{tenant_id:tenant,role:"owner"}]};
     else if(url===api+"/v1/me")data={tenant_id:tenant,role:"owner"};
     else if(url===api+"/v1/jobs")data={jobs:[{id:job,name:"Renovation sample"}]};
     else if(url.endsWith("/uploads"))data={receiptId:receipt,uploadUrl:"https://handyos-receipts-staging-916004827349.s3.ap-southeast-1.amazonaws.com/r?X-Amz-Signature=test",
      uploadHeaders:{"content-type":"image/jpeg","content-length":"1024","if-none-match":"*",
       "x-amz-server-side-encryption":"aws:kms","x-amz-server-side-encryption-aws-kms-key-id":"arn:aws:kms:ap-southeast-1:916004827349:key/11111111-1111-4111-8111-111111111111"},
      requiredMethod:"PUT",requiredEncryption:"aws:kms",contentType:"image/jpeg",expiresInSeconds:180};
     else if(url.endsWith("/confirm"))data={id:receipt,status:"draft",mediaReady:true};
     else throw Error("unexpected backend path");
     return{ok:true,status:200,json:async()=>data};
    };
    window.shell=await mountHandyOsLoginShell({
     root:document.querySelector("#app"),config:{uiOrigin:ui,issuerOrigin:issuer,clientId:"handyosclient12345"},
     apiOrigin:api,sessionStorage,cryptoApi:crypto,fetcher,put:async()=>({ok:true,status:200}),
     locationUrl:location.href,
     historyReplace:url=>history.replaceState(null,"",url),
     navigate:url=>{window.redirectTarget=url}
    });
   },{ui,api,issuer,tenant,job,receipt});
  };
  await setup();
  assert.equal(await page.locator("[data-bills]").isVisible(),false);
  await page.locator("[data-login]").click();
  const authorize=await page.evaluate(()=>window.redirectTarget);
  assert.equal(new URL(authorize).origin,issuer);
  const state=new URL(authorize).searchParams.get("state");
  assert.ok(state&&state.length>30);
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  assert.equal(await page.evaluate(()=>sessionStorage.length),1,"Only short-lived PKCE state in sessionStorage");
  await page.goto(ui+"/auth/callback?code=syntheticCode&state="+encodeURIComponent(state));
  await setup();
  assert.equal(page.url(),ui+"/","Callback code must be removed from navigation history");
  assert.equal(await page.locator("[data-bills]").isVisible(),true);
  assert.equal(await page.locator('select[name="jobId"] option').count(),2);
  assert.equal(await page.evaluate(()=>sessionStorage.length),0);
  const calls=await page.evaluate(()=>window.requests.map(x=>x.url));
  assert.deepEqual(calls.slice(0,4),[issuer+"/oauth2/token",api+"/v1/companies",api+"/v1/me",api+"/v1/jobs"]);
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  await page.locator("[data-logout]").click();
  assert.equal(await page.locator("[data-bills]").isVisible(),false);
  assert.equal(await page.locator("[data-login]").isVisible(),true);
  assert.equal(await page.evaluate(()=>sessionStorage.length),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(failures,[]);
  await page.close();
 }
}finally{await browser?.close()}

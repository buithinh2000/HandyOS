// Full cloud Bills composition browser test: all APIs mocked, zero AWS,
// no persisted tokens or real customer records. HTTPS staging origin simulated
// with Playwright route fulfillment; no outbound network to that hostname.
import {chromium} from "playwright";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const ui="https://staging.handyos.buitai.com";
const api="https://api-staging.handyos.buitai.com";
const tenant="11111111-1111-4111-8111-111111111111";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const receipt="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const paths=["handyos-cloud-bills-app","handyos-cloud-api-transport","receipt-cloud-view","receipt-cloud-controller","receipt-iphone-upload"];
const modules=Object.fromEntries(paths.map(x=>["/"+x+".mjs",readFileSync("backend/src/"+x+".mjs","utf8")]));
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:840},serviceWorkers:"block"});
  const failures=[];page.on("pageerror",e=>failures.push(e.message));
  await page.route("**/*",async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==ui)return route.abort();
   if(url.pathname==="/")return route.fulfill({status:200,contentType:"text/html",body:'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="app"></main></html>'});
   if(modules[url.pathname])return route.fulfill({status:200,contentType:"text/javascript",body:modules[url.pathname]});
   return route.abort();
  });
  await page.goto(ui+"/");
  await page.evaluate(async({ui,api,tenant,job,receipt})=>{
   const {mountAuthenticatedCloudBills}=await import("/handyos-cloud-bills-app.mjs");
   const headers={"content-type":"image/jpeg","content-length":"1024","if-none-match":"*",
    "x-amz-server-side-encryption":"aws:kms",
    "x-amz-server-side-encryption-aws-kms-key-id":"arn:aws:kms:ap-southeast-1:916004827349:key/11111111-1111-4111-8111-111111111111"};
   const begin={receiptId:receipt,uploadUrl:"https://handyos-receipts-staging-916004827349.s3.ap-southeast-1.amazonaws.com/photo?X-Amz-Signature=offline",
    requiredMethod:"PUT",requiredEncryption:"aws:kms",contentType:"image/jpeg",expiresInSeconds:180,uploadHeaders:headers};
   window.calls=[];window.billRecords=[];
   const fetcher=async(url,options)=>{
    window.calls.push({kind:"api",url,method:options.method,auth:options.headers.authorization,tenant:options.headers["x-handyos-tenant"]});
    let answer;
    if(url===api+"/v1/me")answer={tenant_id:tenant,role:"owner"};
    else if(url===api+"/v1/jobs")answer={jobs:[{id:job,name:"Bathroom & kitchen"}]};
    else if(url===api+"/v1/bills")answer={bills:window.billRecords,limit:200,hasMore:false};
    else if(url.endsWith("/uploads"))answer=begin;
    else if(url.endsWith("/confirm")){
     window.billRecords.push({id:receipt,jobId:job,jobName:"Bathroom & kitchen",
      boughtOn:"2026-11-16",storeReference:"Reece",amountGross:"250.75",gstBasis:"inc",
      status:"draft",sentOn:null,reimbursedOn:null});
     answer={id:receipt,status:"draft",mediaReady:true};
    }
    else throw Error("Unexpected route");
    return {ok:true,status:200,json:async()=>answer};
   };
   window.instance=await mountAuthenticatedCloudBills({
    root:document.querySelector("#app"),apiOrigin:api,uiOrigin:ui,locationOrigin:location.origin,
    session:{accessToken:async()=>"synthetic-token-not-real-cognito",tenantId:async()=>tenant},
    fetcher,
    put:async(_url,opts)=>{window.calls.push({kind:"s3",method:opts.method,headers:opts.headers});return{ok:true,status:200}}
   });
  },{ui,api,tenant,job,receipt});
  assert.equal(await page.locator('select[name="jobId"] option').count(),2);
  await page.locator('[name="jobId"]').selectOption(job);
  await page.locator('[name="boughtOn"]').fill("2026-11-16");
  await page.locator('[name="storeSelect"]').selectOption("Reece");
  await page.locator('[name="amountGross"]').fill("250.75");
  await page.locator('[name="file"]').setInputFiles({name:"receipt.jpg",mimeType:"image/jpeg",buffer:Buffer.alloc(1024,1)});
  await page.locator('button[type="submit"]').click();
  await page.locator('form [role="status"]').getByText("Bill saved securely. Not sent to customer.").waitFor();
  await page.locator('[data-bill-id="'+receipt+'"]').waitFor();
  assert.match(await page.locator('[data-bill-id="'+receipt+'"]').innerText(),/Not sent/);
  await page.locator('[data-bill-filter-status]').selectOption("reimbursed");
  assert.equal(await page.locator('[data-bill-id="'+receipt+'"]').count(),0);
  await page.locator('[data-bill-filter-status]').selectOption("draft");
  assert.equal(await page.locator('[data-bill-id="'+receipt+'"]').count(),1);
  const calls=await page.evaluate(()=>window.calls);
  assert.deepEqual(calls.map(x=>x.kind),["api","api","api","api","s3","api","api"]);
  assert.equal(calls[0].url,api+"/v1/me");
  assert.equal(calls[1].url,api+"/v1/jobs");
  assert.equal(calls[2].url,api+"/v1/bills");
  assert.equal(calls[3].url,api+`/v1/jobs/${job}/receipts/uploads`);
  assert.equal(calls[5].url,api+`/v1/jobs/${job}/receipts/${receipt}/confirm`);
  assert.equal(calls[6].url,api+"/v1/bills");
  assert.equal(calls[4].headers["content-length"],undefined);
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(failures,[]);
  await page.close();
 }
}finally{await browser?.close()}

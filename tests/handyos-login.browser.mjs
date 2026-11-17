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
const staff="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const attendance="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ids=["handyos-login-shell","handyos-cognito-pkce","handyos-cloud-api-transport",
 "handyos-cloud-bills-app","handyos-today-view","handyos-jobs-view","handyos-payroll-view","receipt-cloud-view","receipt-cloud-controller","receipt-iphone-upload"];
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
   await page.evaluate(async({ui,api,issuer,tenant,job,receipt,staff,attendance})=>{
    const {mountHandyOsLoginShell}=await import("/handyos-login-shell.mjs");
    window.requests=[];window.crewEntries=[];window.payrollClosed=false;window.jobs=[{id:job,name:"Renovation sample",stage:"survey"}];window.tasks=[];
    const fetcher=async(url,opts)=>{
     window.requests.push({url,method:opts.method,headers:opts.headers});
     let data;
     if(url===issuer+"/oauth2/token")data={token_type:"Bearer",access_token:"synthetic-access-token-long-enough",expires_in:3600};
     else if(url===api+"/v1/companies")data={companies:[{tenant_id:tenant,role:"owner"}]};
     else if(url===api+"/v1/me")data={tenant_id:tenant,role:"owner"};
     else if(url===api+"/v1/jobs"&&opts.method==="GET")data={jobs:window.jobs};
     else if(url===api+"/v1/jobs"&&opts.method==="POST"){
      const body=JSON.parse(opts.body);
      const created={id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",name:body.name,code:body.code,stage:"survey"};
      window.jobs.unshift(created);data={job:created,categories:0,tasks_created:0};
     }
     else if(url===api+"/v1/jobs/"+job+"/tasks"&&opts.method==="GET")data={tasks:window.tasks};
     else if(url===api+"/v1/jobs/"+job+"/tasks"&&opts.method==="POST"){
      const body=JSON.parse(opts.body);
      const task={id:"ffffffff-ffff-4fff-8fff-ffffffffffff",title:body.title,status:"todo"};
      window.tasks.push(task);data={task};
     }
     else if(url===api+"/v1/staff"&&opts.method==="GET")data={staff:[{id:staff,display_name:"Sam",active:true,wage_unit:"day",default_rate:"250.00"}]};
     else if(url.startsWith(api+"/v1/attendance?date=")&&opts.method==="GET")data={attendance:window.crewEntries};
     else if(url===api+"/v1/attendance/check-in"&&opts.method==="POST"){
      const body=JSON.parse(opts.body);
      window.crewEntries.push({id:attendance,staff_id:staff,job_id:job,display_name:"Sam",job_name:"Renovation sample",
       work_date:body.workDate,finished_at:null,rate_snapshot:"250.00"});
      data={entry:window.crewEntries[0]};
     }
     else if(url===api+"/v1/attendance/"+attendance+"/check-out"&&opts.method==="POST"){
      window.crewEntries[0].finished_at="2026-11-17T07:00:00.000Z";
      data={entry:window.crewEntries[0]};
     }
     else if(url.startsWith(api+"/v1/payroll/"+staff+"/weeks/")){
      if(opts.method==="POST"&&url.endsWith("/close"))window.payrollClosed=true;
      data={payroll:{staff:{id:staff,name:"Sam"},weekBegin:"2026-11-16",
       totals:{earned:"1250.00",extras:"100.00",due:"1350.00",paid:"1350.00",remaining:"0.00",openEntries:0},
       attendance:[],adjustments:[],payments:[],closed:window.payrollClosed?{id:receipt,closedAt:"2026-11-17"}:null,
       canClose:!window.payrollClosed}};
     }
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
   },{ui,api,issuer,tenant,job,receipt,staff,attendance});
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
  assert.equal(await page.locator('[data-bills-root] select[name="jobId"] option').count(),2);
  assert.equal(await page.locator("[data-today-root] h2").innerText(),"Today · Crew check-in");
  const loadedJobs=await page.locator("[data-jobs-root] [data-job-list] button").count();
  if(loadedJobs!==1)console.log("JOBS_DIAGNOSTIC",JSON.stringify(await page.locator("[data-jobs-root]").innerText()),JSON.stringify(await page.evaluate(()=>({jobs:window.jobs,requests:window.requests.map(x=>x.url),root:document.querySelector("[data-jobs-root]")?.innerHTML.slice(0,1100)}))));
  assert.equal(loadedJobs,1);
  await page.locator("[data-jobs-root] [data-job-list] button").first().click();
  await page.getByText("Job details loaded.").waitFor();
  await page.locator("[data-jobs-root] [data-create-task] input").fill("Install plasterboard");
  await page.locator("[data-jobs-root] [data-create-task] button").click();
  await page.getByText("Task saved on server.").waitFor();
  assert.equal(await page.evaluate(()=>window.tasks.length),1);
  await page.locator("[data-jobs-root] [data-back]").click();
  await page.locator("[data-jobs-root] [data-new-job]").click();
  await page.locator("[data-jobs-root] [data-create-job] input[name=name]").fill("Kitchen extension");
  await page.locator("[data-jobs-root] [data-create-job] input[name=code]").fill("JOB-24");
  await page.locator("[data-jobs-root] [data-create-job] button").click();
  await page.getByText("Job saved on server.").waitFor();
  assert.equal(await page.evaluate(()=>window.jobs.length),2);
  await page.locator("[data-today-root] [data-job]").selectOption(job);
  await page.locator("[data-today-root] [data-staff]").selectOption(staff);
  await page.locator("[data-today-root] [data-check-in] button").click();
  await page.getByText("Check-in saved on server.").waitFor();
  await page.locator("[data-today-root] [data-checkout]").click();
  await page.getByText("Check-out saved on server.").waitFor();
  assert.equal(await page.evaluate(()=>window.crewEntries[0].finished_at!==null),true);
  await page.locator("[data-payroll-root] .payroll-list button").first().click();
  await page.getByText("Payroll loaded from server.").waitFor();
  assert.match(await page.locator("[data-payroll-root] [data-totals]").innerText(),/1,350\.00/);
  await page.locator("[data-payroll-root] [data-close]").click();
  await page.getByText("Payroll week closed and saved.").waitFor();
  assert.equal(await page.evaluate(()=>window.payrollClosed),true);
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

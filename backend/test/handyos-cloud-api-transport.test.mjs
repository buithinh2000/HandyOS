import test from "node:test";
import assert from "node:assert/strict";
import {validateHandyOsApiOrigin,createHandyOsApiTransport} from "../src/handyos-cloud-api-transport.mjs";
const apiOrigin="https://api-staging.handyos.buitai.com",uiOrigin="https://staging.handyos.buitai.com";
const tenant="11111111-1111-4111-8111-111111111111";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",receipt="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const token="synthetic-only-verified-access-token";
const session={accessToken:async()=>token,tenantId:async()=>tenant};
const response={ok:true,status:200,json:async()=>({jobs:[{id:job,name:"Synthetic bathroom"}]})};
function setup(overrides={}){
 const calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});return response};
 const transport=createHandyOsApiTransport({apiOrigin,uiOrigin,locationOrigin:uiOrigin,session,fetcher,...overrides});
 return {calls,transport};
}
test("fail closed against non-HandyOS API hosts, mismatched UI origin, and HTTP",()=>{
 assert.equal(validateHandyOsApiOrigin({apiOrigin,uiOrigin}).apiOrigin,apiOrigin);
 for(const api of ["https://api.buitai.com","https://api-staging.handyoz.buitai.com",
 "https://api-staging.handyos.buitai.com.evil.com","http://api-staging.handyos.buitai.com",
 "https://api-staging.handyos.buitai.com:444","https://api-staging.handyos.buitai.com/path"]){
  assert.throws(()=>validateHandyOsApiOrigin({apiOrigin:api,uiOrigin}),/unavailable/);
 }
 assert.throws(()=>setup({locationOrigin:"https://owner-v1.buitai.com"}),/unavailable/);
});
test("server-sourced GET jobs and POST upload include only scoped bearer token and tenant",async()=>{
 const {transport,calls}=setup();
 await transport.request({path:"/v1/jobs"});
 await transport.request({path:"/v1/bills"});
 await transport.request({path:"/v1/bills/capabilities"});
 await transport.request({method:"POST",path:"/v1/bills/"+receipt+"/mark-sent",json:{reference:"Sent by text"}});
 await transport.request({method:"POST",path:"/v1/bills/"+receipt+"/payment",json:{amount:10}});
 await transport.request({method:"POST",path:`/v1/jobs/${job}/receipts/uploads`,json:{boughtOn:"2026-11-16"}});
 await transport.request({method:"POST",path:`/v1/jobs/${job}/receipts/${receipt}/confirm`});
 assert.equal(calls.length,7);
 assert.equal(calls[0].url,apiOrigin+"/v1/jobs");
 assert.equal(calls[1].url,apiOrigin+"/v1/bills");
 assert.equal(calls[5].options.headers["x-handyos-tenant"],tenant);
 assert.equal(calls[5].options.headers.authorization,"Bearer "+token);
 assert.equal(calls[5].options.credentials,"omit");
 assert.equal(calls[5].options.redirect,"error");
 assert.equal(calls[5].options.cache,"no-store");
 assert.equal(calls[5].options.body,'{"boughtOn":"2026-11-16"}');
});
test("allow only validated day-scoped attendance and staff API methods",async()=>{
 const {transport,calls}=setup();
 await transport.request({path:"/v1/staff"});
 await transport.request({method:"POST",path:"/v1/staff",json:{displayName:"Sam",wageUnit:"day",defaultRate:250}});
 await transport.request({path:"/v1/attendance?date=2026-11-17"});
 await transport.request({path:"/v1/attendance/month?month=2026-11"});
 await transport.request({method:"POST",path:"/v1/attendance/check-in",
  json:{staffId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",jobId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",workDate:"2026-11-17"}});
 await transport.request({method:"POST",path:"/v1/attendance/backfill",json:{workDate:"2026-11-16",startedAt:"2026-11-16T08:00:00+11:00",finishedAt:"2026-11-16T16:00:00+11:00"}});
 await transport.request({method:"POST",path:"/v1/attendance/cccccccc-cccc-4ccc-8ccc-cccccccccccc/check-out",json:{}});
 await transport.request({method:"POST",path:"/v1/attendance/cccccccc-cccc-4ccc-8ccc-cccccccccccc/correct",json:{reason:"Corrected shift"}});
 assert.equal(calls.length,8);
 for(const args of [{path:"/v1/attendance"},{path:"/v1/attendance?date=2026-11-17&tenant=x"},
  {path:"/v1/attendance?date=2026-11-17%26evil=x"},
  {path:"/v1/attendance/month?month=2026-13"},
  {path:"/v1/attendance/month?month=2026-11&tenant=other"},
  {method:"GET",path:"/v1/attendance/check-in"},
  {method:"DELETE",path:"/v1/attendance/cccccccc-cccc-4ccc-8ccc-cccccccccccc/correct"},
  {method:"DELETE",path:"/v1/staff"},
  {method:"POST",path:"/v1/attendance?date=2026-11-17"}])
  await assert.rejects(transport.request(args),/unavailable/);
 assert.equal(calls.length,8);
});
test("allow only fixed weekly staff payroll routes with valid identifiers",async()=>{
 const {transport,calls}=setup();
 const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const root="/v1/payroll/"+id+"/weeks/2026-11-16";
 await transport.request({path:root});
 for(const action of ["bonus","payment","close"])
  await transport.request({method:"POST",path:root+"/"+action,json:{}});
 assert.equal(calls.length,4);
 for(const p of [root+"?tenant=other",root+"/delete",root+"/payment/1",
  "/v1/payroll/../../secret",root.replace(id,"nope")])
  await assert.rejects(transport.request({path:p}),/unavailable/);
 await assert.rejects(transport.request({method:"DELETE",path:root+"/close"}),/unavailable/);
 assert.equal(calls.length,4);
});
test("Jobs creation and work-item operations use strictly scoped API routes",async()=>{
 const {transport,calls}=setup();
 const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 await transport.request({method:"POST",path:"/v1/jobs",json:{name:"Kitchen refurbishment",code:"JOB-2"}});
 await transport.request({path:"/v1/jobs/"+job+"/tasks"});
 await transport.request({method:"POST",path:"/v1/jobs/"+job+"/tasks",json:{title:"Plasterboard"}});
 assert.equal(calls.length,3);
 for(const path of ["/v1/jobs/../tasks","/v1/jobs/abc/tasks",
  "/v1/jobs/"+job+"/tasks/../../other","/v1/jobs/"+job+"/tasks?tenant=other"]){
  await assert.rejects(transport.request({path}),/unavailable/);
 }
 await assert.rejects(transport.request({method:"DELETE",path:"/v1/jobs/"+job+"/tasks"}),/unavailable/);
 assert.equal(calls.length,3);
});
test("Financials only expose exact tenant-scoped job routes, not arbitrary cost endpoints",async()=>{
 const {transport,calls}=setup();
 const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",base="/v1/jobs/"+id+"/financials";
 await transport.request({path:base});
 await transport.request({method:"POST",path:base+"/settings",json:{contractExGst:1000,reservePercent:15}});
 await transport.request({method:"POST",path:base+"/expenses",json:{kind:"other",description:"Waste",amountExGst:50,gstAmount:5,incurredOn:"2026-11-18"}});
 await transport.request({path:base+"/forecast-inputs"});
 await transport.request({method:"POST",path:base+"/forecast-inputs",json:{contractInc:11000,approvedVariationInc:0,remainingCostsEx:500,unbookedOverheadEx:0,taxReservePercent:15,expectedUpdatedAt:null}});
 await transport.request({path:base+"/contract-receipts"});
 await transport.request({path:base+"/reconciliation"});
 await transport.request({method:"POST",path:base+"/contract-receipts",json:{requestId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",basis:"no_gst",amount:250,receivedOn:"2026-11-18",reference:"Bank paid"}});
 assert.equal(calls.length,8);
 for(const p of [base+"?company=other",base+"/other",base+"/expenses/1",base+"/forecast-inputs?tenant=other",base+"/contract-receipts?tenant=other","/v1/jobs/bad/financials",
  base.replace(id,"../../secrets")])
  await assert.rejects(transport.request({path:p}),/unavailable/);
 for(const args of [{method:"DELETE",path:base+"/expenses"},{method:"GET",path:base+"/expenses"},
  {method:"POST",path:base},{method:"DELETE",path:base+"/forecast-inputs"},{method:"PATCH",path:base+"/contract-receipts"},{method:"POST",path:base+"/reconciliation"}])
  await assert.rejects(transport.request(args),/unavailable/);
 assert.equal(calls.length,8);
});
test("forbid external routes, mutations and token storage",async()=>{
 const {transport,calls}=setup();
 const bad=[
 {path:"https://evil.com"},{path:"//other-host/v1/jobs"},
 {method:"POST",path:"/v1/bills"},{method:"DELETE",path:"/v1/bills"},
 {method:"GET",path:"/v1/bills/"+receipt+"/payment"},
 {method:"DELETE",path:"/v1/bills/"+receipt+"/mark-sent"},
 {path:"/v1/bills?tenant=other"},
 {path:"/v1/tenants"},{path:"/v1/jobs/../../secrets"},
 {path:"/v1/jobs%2Fsecret"},{method:"DELETE",path:"/v1/jobs"},
 {method:"PATCH",path:"/v1/jobs"},{method:"GET",path:"/v1/me",json:{}},
 {method:"POST",path:`/v1/jobs/${job}/receipts/${receipt}/media`},
 {method:"GET",path:`/v1/jobs/${job}/receipts/uploads`}
 ];
 for(const args of bad)await assert.rejects(transport.request(args),/unavailable/);
 assert.equal(calls.length,0);
});
test("unverified session and rejected upstream never leak token, URL or data",async()=>{
 const t=setup({fetcher:async()=>{throw Error("sensitive URL and token")}});
 await assert.rejects(t.transport.request({path:"/v1/jobs"}),e=>!e.message.includes("sensitive"));
 const b=setup({session:{accessToken:async()=>"",tenantId:async()=>tenant}});
 await assert.rejects(b.transport.request({path:"/v1/jobs"}),/unavailable/);
 assert.equal(b.calls.length,0);
});

test("allow only authenticated bulk crew route with exact URL",async()=>{
 const {transport,calls}=setup();
 await transport.request({method:"POST",path:"/v1/attendance/check-in-batch",
  json:{jobId:job,staffIds:[receipt],workDate:"2026-11-24"}});
 assert.equal(calls[0].url,apiOrigin+"/v1/attendance/check-in-batch");
 assert.equal(calls[0].options.headers["x-handyos-tenant"],tenant);
 await assert.rejects(transport.request({method:"GET",path:"/v1/attendance/check-in-batch"}),/unavailable/);
 await assert.rejects(transport.request({method:"POST",path:"/v1/attendance/check-in-batch?tenant=other",json:{}}),/unavailable/);
});

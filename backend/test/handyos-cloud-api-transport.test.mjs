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
 await transport.request({method:"POST",path:`/v1/jobs/${job}/receipts/uploads`,json:{boughtOn:"2026-11-16"}});
 await transport.request({method:"POST",path:`/v1/jobs/${job}/receipts/${receipt}/confirm`});
 assert.equal(calls.length,3);
 assert.equal(calls[0].url,apiOrigin+"/v1/jobs");
 assert.equal(calls[1].options.headers["x-handyos-tenant"],tenant);
 assert.equal(calls[1].options.headers.authorization,"Bearer "+token);
 assert.equal(calls[1].options.credentials,"omit");
 assert.equal(calls[1].options.redirect,"error");
 assert.equal(calls[1].options.cache,"no-store");
 assert.equal(calls[1].options.body,'{"boughtOn":"2026-11-16"}');
});
test("allow only validated day-scoped attendance and staff API methods",async()=>{
 const {transport,calls}=setup();
 await transport.request({path:"/v1/staff"});
 await transport.request({method:"POST",path:"/v1/staff",json:{displayName:"Sam",wageUnit:"day",defaultRate:250}});
 await transport.request({path:"/v1/attendance?date=2026-11-17"});
 await transport.request({method:"POST",path:"/v1/attendance/check-in",
  json:{staffId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",jobId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",workDate:"2026-11-17"}});
 await transport.request({method:"POST",path:"/v1/attendance/cccccccc-cccc-4ccc-8ccc-cccccccccccc/check-out",json:{}});
 assert.equal(calls.length,5);
 for(const args of [{path:"/v1/attendance"},{path:"/v1/attendance?date=2026-11-17&tenant=x"},
  {path:"/v1/attendance?date=2026-11-17%26evil=x"},
  {method:"GET",path:"/v1/attendance/check-in"},
  {method:"DELETE",path:"/v1/staff"},
  {method:"POST",path:"/v1/attendance?date=2026-11-17"}])
  await assert.rejects(transport.request(args),/unavailable/);
 assert.equal(calls.length,5);
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
test("forbid external routes, mutations and token storage",async()=>{
 const {transport,calls}=setup();
 const bad=[
 {path:"https://evil.com"},{path:"//other-host/v1/jobs"},
 {path:"/v1/tenants"},{path:"/v1/jobs/../../secrets"},
 {path:"/v1/jobs%2Fsecret"},{method:"DELETE",path:"/v1/jobs"},
 {method:"POST",path:"/v1/jobs"},{method:"GET",path:"/v1/me",json:{}},
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

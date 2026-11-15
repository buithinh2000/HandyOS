import test from "node:test";
import assert from "node:assert/strict";
import {createOwnerLedgerApi} from "../cloud/owner-api.mjs";

const ORIGIN="https://handyos.buitai.com",ISSUER="https://cognito-idp.ap-southeast-1.amazonaws.com/example";
const REV='"0123456789abcdef0123456789abcdef"',REV2='"abcdef0123456789abcdef0123456789"';
const state=()=>({jobs:[{id:"job-1",name:"Demo Job",contract:11000,stage:"active",payments:[],workerPayments:[],expenses:[],timesheets:[]}],staff:[{id:"staff-1",name:"Alex",role:"Carpenter",rate:45}],payrollSettlements:[]});
function fixture(){
 let stored=null,revision=REV,reads=0,writes=0;
 const storage={
  async read(sub){reads++;assert.equal(sub,"owner-1234567890");return stored?{data:stored,etag:revision}:null},
  async write(sub,data,condition){
   writes++;assert.equal(sub,"owner-1234567890");
   if(condition.ifNoneMatch==="*"&&stored)throw Object.assign(new Error("Exists"),{name:"PreconditionFailed"});
   if(condition.ifMatch&&(!stored||revision!==condition.ifMatch))throw Object.assign(new Error("Outdated"),{name:"PreconditionFailed"});
   stored=data;revision=REV2;return {etag:revision};
  }
 };
 const api=createOwnerLedgerApi({storage,ownerSub:"owner-1234567890",origin:ORIGIN,apiId:"abc123",issuer:ISSUER,clock:()=>Date.parse("2026-11-15T01:00:00.000Z")});
 const event=(method,body,headers={})=>({version:"2.0",headers:{origin:ORIGIN,...headers},body,requestContext:{apiId:"abc123",http:{method},authorizer:{jwt:{claims:{sub:"owner-1234567890",iss:ISSUER}}}}});
 return {api,event,storage,reads:()=>reads,writes:()=>writes,getStored:()=>stored};
}
const payload=r=>JSON.parse(r.body);

test("deny unauthenticated request even if browser origin matches; never read storage",async()=>{
 const f=fixture(),e=f.event("GET");delete e.requestContext.authorizer;
 assert.equal((await f.api(e)).statusCode,403);assert.equal(f.reads(),0);
 e.requestContext.authorizer={jwt:{claims:{sub:"different-owner",iss:ISSUER}}};
 assert.equal((await f.api(e)).statusCode,403);assert.equal(f.reads(),0);
});
test("deny spoofed direct invocation, wrong issuer and origin",async()=>{
 const f=fixture(),e=f.event("GET");e.requestContext.apiId="other";
 assert.equal((await f.api(e)).statusCode,403);
 e.requestContext.apiId="abc123";e.requestContext.authorizer.jwt.claims.iss="spoofed";
 assert.equal((await f.api(e)).statusCode,403);
 e.requestContext.authorizer.jwt.claims.iss=ISSUER;e.headers.origin="https://evil.test";
 assert.equal((await f.api(e)).statusCode,403);assert.equal(f.reads(),0);
});
test("new empty owner GET returns no ledger and first PUT requires conditional create",async()=>{
 const f=fixture();
 const empty=await f.api(f.event("GET"));
 assert.equal(empty.statusCode,200);
 assert.deepEqual(payload(empty),{state:null,revision:null});
 const noCondition=await f.api(f.event("PUT",JSON.stringify(state())));
 assert.equal(noCondition.statusCode,428);
 assert.equal(f.writes(),0);
 const created=await f.api(f.event("PUT",JSON.stringify(state()),{"if-none-match":"*"}));
 assert.equal(created.statusCode,200);
 assert.equal(payload(created).revision,REV2);
 assert.equal(f.writes(),1);
 const read=await f.api(f.event("GET"));
 assert.equal(read.statusCode,200);assert.equal(payload(read).state.staff[0].name,"Alex");
 assert.equal(payload(read).revision,REV2);
 assert.equal(read.headers["cache-control"],"no-store");
});
test("stale tab cannot overwrite newer ledger; versioned save requires matching ETag",async()=>{
 const f=fixture();await f.api(f.event("PUT",JSON.stringify(state()),{"if-none-match":"*"}));
 assert.equal((await f.api(f.event("PUT",JSON.stringify(state()),{"if-match":REV}))).statusCode,409);
 assert.equal((await f.api(f.event("PUT",JSON.stringify(state()),{"if-none-match":"*"}))).statusCode,409);
 assert.equal((await f.api(f.event("PUT",JSON.stringify(state()),{"if-match":REV2}))).statusCode,200);
});
test("reject malformed, oversized and malicious backup before storage write",async()=>{
 const f=fixture();
 for(const input of ['{','{"jobs":"wrong"}']){
  const res=await f.api(f.event("PUT",input,{"if-none-match":"*"}));
  assert.equal(res.statusCode,400);
 }
 const invalid=state();invalid.jobs[0].payments="poison";
 assert.equal((await f.api(f.event("PUT",JSON.stringify(invalid),{"if-none-match":"*"}))).statusCode,400);
 const large="x".repeat(2*1024*1024+10);
 assert.equal((await f.api(f.event("PUT",large,{"if-none-match":"*"}))).statusCode,413);
 assert.equal(f.writes(),0);
});
test("do not accept mixed, absent, or untrusted revision conditions",async()=>{
 const f=fixture(),data=JSON.stringify(state());
 const both=await f.api(f.event("PUT",data,{"If-Match":REV,"If-None-Match":"*"}));
 assert.equal(both.statusCode,428);
 const invalid=await f.api(f.event("PUT",data,{"If-Match":"not-an-etag"}));
 assert.equal(invalid.statusCode,400);
 assert.equal(f.writes(),0);
});
test("do not leak system exceptions, only generic read/write errors",async()=>{
 const storage={read:async()=>{throw Error("SECRET DB TOKEN")},write:async()=>{throw Error("SECRET AWS ERROR")}};
 const api=createOwnerLedgerApi({storage,ownerSub:"owner-1234567890",origin:ORIGIN,apiId:"abc123",issuer:ISSUER});
 const f=fixture();
 const read=await api(f.event("GET"));
 assert.equal(read.statusCode,503);assert.ok(!read.body.includes("SECRET"));
 const write=await api(f.event("PUT",JSON.stringify(state()),{"If-None-Match":"*"}));
 assert.equal(write.statusCode,503);assert.ok(!write.body.includes("SECRET"));
});
test("no OPTIONS/POST access to ledger routes",async()=>{
 const f=fixture();assert.equal((await f.api(f.event("POST"))).statusCode,405);
 assert.equal((await f.api(f.event("OPTIONS"))).statusCode,405);
});

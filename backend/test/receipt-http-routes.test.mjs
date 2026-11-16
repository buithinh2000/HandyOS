import test from "node:test";
import assert from "node:assert/strict";
import {matchReceiptRoute,dispatchReceiptRoute} from "../src/receipt-http-routes.mjs";
import {HttpError} from "../src/domain.mjs";

const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const receipt="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tenant="11111111-1111-4111-8111-111111111111";
const identity={verifiedByApi:true,actorSub:"verified-cognito-sub",tenantId:tenant,role:"owner"};
const start={boughtOn:"2026-11-16",storeReference:"Bunnings",amountGross:350.25,
 gstBasis:"inc",contentType:"image/jpeg",contentLength:1234};
function recorder(){
 const calls=[];
 const workflow={
  async beginUpload(args){calls.push({method:"begin",...args});return {receiptId:receipt,uploadUrl:"https://private.example/signed",expiresInSeconds:180}},
  async confirmUpload(args){calls.push({method:"confirm",...args});return {id:receipt,status:"draft",mediaReady:true}},
  async viewReceipt(args){calls.push({method:"media",...args});return {id:receipt,viewUrl:"https://private.example/view",expiresInSeconds:180}}
 };
 return {calls,workflow};
}
function req(kind,identity0=identity,workflow0=null,body=start){
 return dispatchReceiptRoute({route:matchReceiptRoute(kind==="media"?"GET":"POST",
  kind==="begin"?`/v1/jobs/${job}/receipts/uploads`:
  kind==="confirm"?`/v1/jobs/${job}/receipts/${receipt}/confirm`:
   `/v1/jobs/${job}/receipts/${receipt}/media`),
  identity:identity0,workflow:workflow0,readBody:async()=>body});
}
test("only exact POST/GET receipt paths match and IDs are canonical UUID",()=>{
 for(const kind of ["begin","confirm","media"])
  assert.ok(matchReceiptRoute(kind==="media"?"GET":"POST",
   kind==="begin"?`/v1/jobs/${job}/receipts/uploads`:kind==="confirm"?
   `/v1/jobs/${job}/receipts/${receipt}/confirm`:`/v1/jobs/${job}/receipts/${receipt}/media`));
 assert.equal(matchReceiptRoute("GET",`/v1/jobs/${job}/receipts/uploads`),null);
 assert.equal(matchReceiptRoute("POST",`/v1/jobs/${job}/receipts/${receipt}/media`),null);
 assert.equal(matchReceiptRoute("DELETE",`/v1/jobs/${job}/receipts/${receipt}/media`),null);
 assert.throws(()=>matchReceiptRoute("POST","/v1/jobs/not-a-uuid/receipts/uploads"),HttpError);
});
test("routes bind server-verified owner identity and preserve trusted workflow shapes",async()=>{
 const {workflow,calls}=recorder();
 await req("begin",identity,workflow);
 await req("confirm",identity,workflow);
 await req("media",identity,workflow);
 assert.deepEqual(calls.map(x=>x.method),["begin","confirm","media"]);
 for(const x of calls){
  assert.deepEqual(x.auth,{verifiedByApi:true,actorSub:identity.actorSub,tenantId:tenant});
  assert.equal(x.jobId,job);
  assert.equal("role" in x.auth,false);
 }
 assert.deepEqual(calls[0].details,start);
 assert.equal(calls[1].receiptId,receipt);
 assert.equal(calls[2].receiptId,receipt);
});
test("disabled storage returns 503 before any signing or DB mutation",async()=>{
 await assert.rejects(req("begin"),x=>x instanceof HttpError&&x.status===503);
 await assert.rejects(req("confirm"),x=>x instanceof HttpError&&x.status===503);
 await assert.rejects(req("media"),x=>x instanceof HttpError&&x.status===503);
});
test("worker/homeowner and unverifiable sessions are denied before handling files",async()=>{
 const {workflow,calls}=recorder();
 for(const role of ["worker","homeowner"])
  await assert.rejects(req("begin",{...identity,role},workflow),x=>x.status===403);
 for(const invalid of [{...identity,verifiedByApi:false},{...identity,tenantId:"evil"},null])
  await assert.rejects(req("begin",invalid,workflow),x=>x.status===401);
 assert.equal(calls.length,0);
});
test("untrusted client fields cannot invent tenant, role, S3 bucket or object key",async()=>{
 const {workflow,calls}=recorder();
 for(const field of ["role","tenantId","objectKey","bucket","verifiedByApi","receiptId","uploadUrl"]){
  await assert.rejects(req("begin",identity,workflow,{...start,[field]:"spoofed"}),x=>x.status===400);
 }
 assert.equal(calls.length,0);
});
test("internal signer/repository exceptions are redacted, no key or URL leaked",async()=>{
 const workflow={async beginUpload(){throw Error("SECRET S3 KEY & AWS signed URL")},
 async confirmUpload(){throw Error("Internal SQL details")},
 async viewReceipt(){throw Error("tenant database token")}};
 for(const kind of ["begin","confirm","media"]){
  await assert.rejects(req(kind,identity,workflow),e=>
   e.status===503&&!/SECRET|AWS signed|Internal SQL|database token/.test(e.message));
 }
});

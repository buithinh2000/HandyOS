import test from "node:test";
import assert from "node:assert/strict";
import {createReceiptWorkflow} from "../backend/src/receipt-workflow.mjs";

const tenant="11111111-1111-4111-8111-111111111111",job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ids=["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","cccccccc-cccc-4ccc-8ccc-cccccccccccc"];
const details={boughtOn:"2026-11-16",storeReference:"Bunnings",amountGross:350.25,gstBasis:"inc",
 notes:"Homeowner reimburses separately",contentType:"image/jpeg",contentLength:1024};
function setup({role="owner",headOverride=null,failSign=false}={}){
 const pending=new Map(),ready=new Map(),calls=[];
 const context={authorizedByServer:true,tenantVerified:true,jobVerified:true,tenantId:tenant,jobId:job,role};
 const repository={
  async authorizeOwnerJob(auth,jobId){calls.push("auth");if(auth!=="owner-token"||jobId!==job)throw Error("No membership");return context},
  async reserveUpload(ctx,row){calls.push("reserve");if(ctx!==context)throw Error("Untrusted context");pending.set(row.id,row)},
  async findPending(ctx,id){calls.push("pending");return pending.get(id)},
  async commitVerified(ctx,intent,verified){
   calls.push("commit");if(!verified.verified||!pending.has(intent.id))throw Error("Not verifiable");
   pending.delete(intent.id);ready.set(intent.id,{id:intent.id,jobId:job,objectKey:intent.objectKey,contentType:intent.contentType});
   return {id:intent.id,jobId:job};
  },
  async findReady(ctx,id){calls.push("ready");return ready.get(id)}
 };
 const media={
  async signPut(x){calls.push("signPut");if(failSign)throw Error("storage unavailable");return "https://private-s3.example/path?signature=synthetic"},
  async head(x){calls.push("head");return {...{key:x.objectKey,contentType:x.contentType,contentLength:x.contentLength,
   encryption:"aws:kms",kmsKeyArn:"arn:aws:kms:ap-southeast-1:000000000000:key/fake"},...(headOverride||{})}},
  async signGet(x){calls.push("signGet");return "https://private-s3.example/temporary?signature=synthetic"}
 };
 let index=0;
 const workflow=createReceiptWorkflow({repository,media,newId:()=>ids[index++]});
 return {workflow,ready,pending,calls,media,context};
}
const begin=w=>w.beginUpload({auth:"owner-token",jobId:job,details});
const confirm=(w,id=ids[0])=>w.confirmUpload({auth:"owner-token",jobId:job,receiptId:id});
test("staged upload only reserves metadata, never creates a reimbursement",async()=>{
 const {workflow,pending,ready,calls}=setup();
 const started=await begin(workflow);
 assert.equal(started.receiptId,ids[0]);
 assert.equal(started.requiredMethod,"PUT");assert.equal(started.requiredEncryption,"aws:kms");
 assert.equal(started.expiresInSeconds,180);assert.match(started.uploadUrl,/^https:/);
 assert.equal(pending.size,1);assert.equal(ready.size,0);
 assert.deepEqual(calls,["auth","reserve","signPut"]);
});
test("only verified HEAD creates bill; GET is private and reauthorizes",async()=>{
 const {workflow,pending,ready,calls}=setup();
 await begin(workflow);
 const done=await confirm(workflow);
 assert.deepEqual(done,{id:ids[0],jobId:job,status:"draft",mediaReady:true});
 assert.equal(pending.size,0);assert.equal(ready.size,1);
 const url=await workflow.viewReceipt({auth:"owner-token",jobId:job,receiptId:ids[0]});
 assert.match(url.viewUrl,/^https:/);assert.equal(url.expiresInSeconds,180);
 assert.deepEqual(calls,["auth","reserve","signPut","auth","pending","head","commit","auth","ready","signGet"]);
 await assert.rejects(confirm(workflow),/not found/);
});
test("mismatched HEAD, missing image and spoofed key do not create a bill",async()=>{
 for(const override of [{contentLength:123},{contentType:"text/html"},{encryption:"AES256"},{key:"other"}]){
  const x=setup({headOverride:override});
  await begin(x.workflow);
  await assert.rejects(confirm(x.workflow),/verification/);
  assert.equal(x.pending.size,1);assert.equal(x.ready.size,0);
  assert.equal(x.calls.includes("commit"),false);
 }
});
test("unauthorized roles and forged tokens fail before storage signing or database writes",async()=>{
 for(const role of ["homeowner","worker"]){
  const x=setup({role});
  await assert.rejects(begin(x.workflow),/denied/);
  assert.deepEqual(x.calls,["auth"]);
 }
 const x=setup();
 await assert.rejects(x.workflow.beginUpload({auth:"forged",jobId:job,details}),/No membership/);
 assert.deepEqual(x.calls,["auth"]);
});
test("invalid receipt metadata rejects before committing pending upload",async()=>{
 for(const edit of [{boughtOn:"2026-02-30"},{amountGross:-1},{gstBasis:"missing"},{contentType:"image/svg+xml"},
  {contentLength:20*1024*1024},{storeReference:"   "},{notes:"x".repeat(501)}]){
  const x=setup();await assert.rejects(x.workflow.beginUpload({auth:"owner-token",jobId:job,details:{...details,...edit}}));assert.equal(x.pending.size,0);assert.equal(x.ready.size,0);
 }
});
test("signed URL failures leave an inert pending intent, no fake receipt",async()=>{
 const x=setup({failSign:true});
 await assert.rejects(begin(x.workflow),/storage unavailable/);
 assert.equal(x.pending.size,1);assert.equal(x.ready.size,0);
});

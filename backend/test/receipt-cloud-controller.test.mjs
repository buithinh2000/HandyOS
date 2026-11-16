import test from "node:test";
import assert from "node:assert/strict";
import {createCloudBillController} from "../src/receipt-cloud-controller.mjs";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",receipt="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const kms="arn:aws:kms:ap-southeast-1:916004827349:key/11111111-1111-4111-8111-111111111111";
const header={"content-type":"image/jpeg","content-length":"4096","if-none-match":"*",
 "x-amz-server-side-encryption":"aws:kms","x-amz-server-side-encryption-aws-kms-key-id":kms};
const details={boughtOn:"2026-11-16",storeReference:" Bunnings ",amountGross:250.75,gstBasis:"inc",notes:"Customer reimbursement"};
const file={type:"image/jpeg",size:4096};
const begin={receiptId:receipt,uploadUrl:"https://handyos-receipts-staging-916004827349.s3.ap-southeast-1.amazonaws.com/r?X-Amz-Signature=fake",
 contentType:"image/jpeg",uploadHeaders:header,requiredMethod:"PUT",requiredEncryption:"aws:kms",expiresInSeconds:180};
function setup({putResponse={status:200,ok:true},confirmResponse={id:receipt,status:"draft",mediaReady:true},beginError=false}={}){
 const calls=[],states=[];
 const api={request:async request=>{calls.push({kind:"api",...request});if(request.path.endsWith("/uploads")){if(beginError)throw Error("503");return begin;}return confirmResponse}};
 const put=async(url,opts)=>{calls.push({kind:"put",url,opts});return putResponse};
 const controller=createCloudBillController({authApi:api,put,notify:x=>states.push(x.status)});
 return {controller,calls,states};
}
const save=x=>x.controller.save({jobId:job,file,details});
test("cloud bill uses job-scoped API, S3 PUT, confirmation; no fake customer payment",async()=>{
 const x=setup();
 assert.deepEqual(await save(x),{receiptId:receipt,status:"draft",mediaReady:true});
 assert.deepEqual(x.states,["preparing","uploading","confirming","saved"]);
 assert.deepEqual(x.calls.map(c=>c.kind),["api","put","api"]);
 assert.equal(x.calls[0].path,`/v1/jobs/${job}/receipts/uploads`);
 assert.deepEqual(x.calls[0].json,{...details,storeReference:"Bunnings",contentType:"image/jpeg",contentLength:4096});
 assert.equal(x.calls[1].opts.credentials,"omit");
 assert.equal(x.calls[2].path,`/v1/jobs/${job}/receipts/${receipt}/confirm`);
 assert.equal(x.controller.status,"saved");
});
test("offline, failed PUT or refused confirm remains retry-needed and never silently saved",async()=>{
 for(const opts of [{beginError:true},{putResponse:{status:412,ok:false}},{confirmResponse:{id:receipt,status:"draft",mediaReady:false}}]){
  const x=setup(opts);await assert.rejects(save(x),/not confirmed/);
  assert.equal(x.controller.status,"retry-needed");
  if(opts.beginError)assert.deepEqual(x.calls.map(c=>c.kind),["api"]);
  if(opts.putResponse)assert.deepEqual(x.calls.map(c=>c.kind),["api","put"]);
 }
});
test("reject invalid job, GST, date, size, notes and amount before network calls",async()=>{
 const examples=[
 {jobId:"other"},{details:{...details,amountGross:0}},{details:{...details,amountGross:1.001}},
 {details:{...details,gstBasis:"other"}},{details:{...details,boughtOn:"2026-02-30"}},
 {file:{type:"image/heic",size:1234}},{file:{type:"image/jpeg",size:20*1024*1024}},
 {details:{...details,notes:"a".repeat(501)}}
 ];
 for(const change of examples){
  const x=setup();await assert.rejects(x.controller.save({jobId:job,file,details,...change}));
  assert.equal(x.calls.length,0);
 }
});
test("never accept missing authenticated API wrapper",()=>{
 assert.throws(()=>createCloudBillController({put:async()=>{}}),/session required/);
});

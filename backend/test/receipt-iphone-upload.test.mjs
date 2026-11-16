import test from "node:test";
import assert from "node:assert/strict";
import {uploadReceiptFromIphone} from "../src/receipt-iphone-upload.mjs";
const id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const kms="arn:aws:kms:ap-southeast-1:916004827349:key/11111111-1111-4111-8111-111111111111";
const headers={"content-type":"image/jpeg","content-length":"2048","if-none-match":"*",
 "x-amz-server-side-encryption":"aws:kms","x-amz-server-side-encryption-aws-kms-key-id":kms};
const beginResponse={receiptId:id,uploadUrl:"https://handyos-receipts-staging-916004827349.s3.ap-southeast-1.amazonaws.com/receipt?X-Amz-Signature=synthetic",
 contentType:"image/jpeg",expiresInSeconds:180,requiredMethod:"PUT",requiredEncryption:"aws:kms",uploadHeaders:headers};
const file={size:2048,type:"image/jpeg"};
function capture(opts={}){
 let confirm=0,put=0,request;
 const run=()=>uploadReceiptFromIphone({file,beginResponse,
  put:async(url,options)=>{put++;request={url,options};return opts.putResponse??{status:200,ok:true}},
  confirmReceipt:async receiptId=>{confirm++;return opts.confirmResponse??{id:receiptId,mediaReady:true,status:"draft"}}});
 return {run,stats:()=>({confirm,put,request})};
}
test("iPhone PUT uses precisely signed headers, omits credentials and confirms only after success",async()=>{
 const x=capture();
 assert.deepEqual(await x.run(),{receiptId:id,status:"draft",mediaReady:true});
 const {put,confirm,request}=x.stats();
 assert.equal(put,1);assert.equal(confirm,1);
 assert.equal(request.options.method,"PUT");assert.equal(request.options.body,file);
 assert.equal(request.options.credentials,"omit");assert.equal(request.options.redirect,"error");
 assert.deepEqual(request.options.headers,headers);
});
test("failed or unexpected S3 HTTP response never confirms or creates a receipt",async()=>{
 for(const putResponse of [{status:403,ok:false},{status:412,ok:false},{status:301,ok:false},{status:200,ok:false},{status:206,ok:true}]){
  const x=capture({putResponse});await assert.rejects(x.run(),/unavailable/);
  assert.equal(x.stats().confirm,0);
 }
});
test("confirmation failure does not mark local receipt as successful",async()=>{
 for(const confirmResponse of [false,{id,mediaReady:false,status:"draft"},{id:"other",mediaReady:true,status:"draft"}]){
  const x=capture({confirmResponse});await assert.rejects(x.run(),/unavailable/);
 }
});
test("untrusted or stale signed payload cannot cause PUT or confirm",async()=>{
 for(const edit of [
  {uploadUrl:"https://buitai-core.s3.ap-southeast-1.amazonaws.com/receipt?X-Amz-Signature=bad"},
  {uploadUrl:"http://handyos-receipts-staging-916004827349.s3.ap-southeast-1.amazonaws.com/receipt?X-Amz-Signature=bad"},
  {expiresInSeconds:500},{uploadHeaders:{...headers,"content-length":"1024"}},
  {uploadHeaders:{...headers,"if-none-match":""}},
  {uploadHeaders:{...headers,authorization:"Bearer fake"}},
  {uploadHeaders:{...headers,"x-amz-server-side-encryption":"AES256"}},
  {contentType:"text/html"}]){
  let put=0,confirm=0;
  await assert.rejects(uploadReceiptFromIphone({
   beginResponse:{...beginResponse,...edit},file,
   put:async()=>{put++;return{status:200,ok:true}},
   confirmReceipt:async()=>{confirm++;return{id,status:"draft",mediaReady:true}}
  }),/unavailable/);
  assert.equal(put,0);assert.equal(confirm,0);
 }
});
test("network failures do not confirm or expose a signed URL",async()=>{
 let confirms=0;
 await assert.rejects(uploadReceiptFromIphone({beginResponse,file,
  put:async()=>{throw Error("sensitive signed URL")},
  confirmReceipt:async()=>{confirms++}}),e=>!e.message.includes("sensitive"));
 assert.equal(confirms,0);
});

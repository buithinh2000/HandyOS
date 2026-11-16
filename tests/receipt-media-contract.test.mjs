import test from "node:test";
import assert from "node:assert/strict";
import {prepareReceiptUpload,authorizeReceiptDownload,verifyReceiptObject} from "../backend/src/receipt-media-contract.mjs";
const tenant="11111111-1111-4111-8111-111111111111";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const receipt="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const object="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ctx={authorizedByServer:true,role:"owner",tenantVerified:true,jobVerified:true,tenantId:tenant,jobId:job};
const req=(extra={})=>({context:ctx,receiptId:receipt,objectId:object,contentType:"image/jpeg",contentLength:5000,...extra});
test("private upload contract uses fixed tenant-job-receipt key and short expiry",()=>{
 const x=prepareReceiptUpload(req());
 assert.equal(x.objectKey,`tenants/${tenant}/jobs/${job}/receipts/${receipt}/${object}.jpg`);
 assert.equal(x.requiredMethod,"PUT");assert.equal(x.privateOnly,true);
 assert.equal(x.requiredEncryption,"aws:kms");assert.ok(x.expiresInSeconds<=180);
 const y=authorizeReceiptDownload({context:ctx,receiptId:receipt,objectKey:x.objectKey,contentType:"image/jpeg"});
 assert.equal(y.requiredMethod,"GET");assert.equal(y.objectKey,x.objectKey);
});
test("unverified contexts, other-tenant, job and public role are denied",()=>{
 for(const change of [{authorizedByServer:false},{tenantVerified:false},{jobVerified:false},{role:"worker"},{role:"homeowner"}, {tenantId:"../evil"}])
  assert.throws(()=>prepareReceiptUpload(req({context:{...ctx,...change}})));
});
test("deny remote SVG and unsupported or oversized files",()=>{
 for(const type of ["image/svg+xml","text/html","application/octet-stream","IMAGE/JPEG"])
  assert.throws(()=>prepareReceiptUpload(req({contentType:type})),/Unsupported/);
 for(const contentLength of [0,-1,1.5,Number.NaN,12*1024*1024+1])
  assert.throws(()=>prepareReceiptUpload(req({contentLength})),/size/);
 const pdf=prepareReceiptUpload(req({contentType:"application/pdf",contentLength:15*1024*1024}));
 assert.ok(pdf.objectKey.endsWith(".pdf"));
});
test("owner cannot access another job or receipt object by guessing a key",()=>{
 const x=prepareReceiptUpload(req());
 const otherJob={...ctx,jobId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"};
 for(const c of [otherJob,{...ctx,tenantId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}])
  assert.throws(()=>authorizeReceiptDownload({context:c,receiptId:receipt,objectKey:x.objectKey,contentType:"image/jpeg"}));
 assert.throws(()=>authorizeReceiptDownload({context:ctx,receiptId:object,objectKey:x.objectKey,contentType:"image/jpeg"}));
 assert.throws(()=>authorizeReceiptDownload({context:ctx,receiptId:receipt,objectKey:"https://public.example/receipt.jpg",contentType:"image/jpeg"}));
 assert.throws(()=>authorizeReceiptDownload({context:ctx,receiptId:receipt,objectKey:x.objectKey+"?download=1",contentType:"image/jpeg"}));
});
test("server-side object verification requires correct size, type, KMS encryption and key",()=>{
 const expected=prepareReceiptUpload(req());
 const head={key:expected.objectKey,contentLength:5000,contentType:"image/jpeg",encryption:"aws:kms",kmsKeyArn:"arn:aws:kms:ap-southeast-1:000000000000:key/test"};
 assert.equal(verifyReceiptObject({expected,head}).verified,true);
 for(const change of [{key:"evil"},{contentLength:5001},{contentType:"text/html"},{encryption:"AES256"},{kmsKeyArn:null}])
  assert.throws(()=>verifyReceiptObject({expected,head:{...head,...change}}));
});

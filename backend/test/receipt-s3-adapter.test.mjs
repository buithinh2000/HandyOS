import test from "node:test";
import assert from "node:assert/strict";
import {createReceiptS3Adapter,validateReceiptS3Config} from "../src/receipt-s3-adapter.mjs";
const tenant="11111111-1111-4111-8111-111111111111",job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",receipt="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",object="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const key=`tenants/${tenant}/jobs/${job}/receipts/${receipt}/${object}.jpg`;
const kms="arn:aws:kms:ap-southeast-1:916004827349:key/11111111-1111-4111-8111-111111111111";
const bucket="handyos-receipts-staging-916004827349";
const endpointHost=bucket+".s3.ap-southeast-1.amazonaws.com";
const config={bucket,region:"ap-southeast-1",accountId:"916004827349",kmsKeyArn:kms,endpointHost};
const upload={objectKey:key,contentType:"image/jpeg",contentLength:5000,expiresInSeconds:180,requiredMethod:"PUT",requiredEncryption:"aws:kms",privateOnly:true};
const view={objectKey:key,expiresInSeconds:60,privateOnly:true,requiredMethod:"GET"};
class PutObjectCommand{constructor(input){this.input=input;this.kind="PUT"}}
class GetObjectCommand{constructor(input){this.input=input;this.kind="GET"}}
class HeadObjectCommand{constructor(input){this.input=input;this.kind="HEAD"}}
function make(head={}){
 const seen=[];
 const client={async send(c){seen.push(c);return {ContentType:"image/jpeg",ContentLength:5000,ServerSideEncryption:"aws:kms",SSEKMSKeyId:kms,...head}}};
 const presign=async(_client,command,opts)=>{seen.push({kind:"SIGN",command,opts});return `https://${endpointHost}/some/path?X-Amz-Signature=synthetic`};
 return {adapter:createReceiptS3Adapter({config,client,commands:{PutObjectCommand,GetObjectCommand,HeadObjectCommand},presign}),seen};
}
test("dedicated HandyOS AWS identity is mandatory and fails closed",()=>{
 assert.equal(validateReceiptS3Config(config).bucket,bucket);
 for(const x of [{bucket:"buitai-core-receipts"},{bucket:"other-handyos-receipts"},{region:"ap-southeast-2"},{accountId:"000000000000"},{kmsKeyArn:"arn:aws:kms:ap-southeast-1:000000000000:key/11111111-1111-4111-8111-111111111111"},{endpointHost:"evil.example.com"}])
  assert.throws(()=>validateReceiptS3Config({...config,...x}),/not authorized/);
 assert.throws(()=>createReceiptS3Adapter({config,client:null}),/not authorized/);
});
test("signed upload always uses fixed bucket, key, 180-second TTL, KMS, no-overwrite and MIME",async()=>{
 const {adapter,seen}=make();
 assert.match(await adapter.signPut(upload),/^https:/);
 assert.equal(seen.length,1);
 const signed=seen[0];assert.equal(signed.kind,"SIGN");
 assert.equal(signed.opts.expiresIn,180);
 assert.deepEqual(signed.command.input,{Bucket:bucket,Key:key,ContentType:"image/jpeg",ContentLength:5000,ServerSideEncryption:"aws:kms",SSEKMSKeyId:kms,IfNoneMatch:"*"});
});
test("private download signs only the saved scoped object and expires quickly",async()=>{
 const {adapter,seen}=make();await adapter.signGet(view);
 assert.equal(seen[0].opts.expiresIn,60);
 assert.deepEqual(seen[0].command.input,{Bucket:bucket,Key:key,ResponseCacheControl:"no-store"});
});
test("HEAD validates the exact KMS CMK and rejects foreign keys",async()=>{
 const {adapter,seen}=make();
 assert.deepEqual(await adapter.head(upload),{key,contentType:"image/jpeg",contentLength:5000,encryption:"aws:kms",kmsKeyArn:kms});
 assert.equal(seen[0].kind,"HEAD");assert.deepEqual(seen[0].input,{Bucket:bucket,Key:key});
 for(const head of [{SSEKMSKeyId:"arn:aws:kms:ap-southeast-1:000000000000:key/test"},{ServerSideEncryption:"AES256"}]){
  const bad=make(head);await assert.rejects(bad.adapter.head(upload),/not authorized/);
 }
});
test("invalid media types, paths, access intent and excessive expiration do not sign",async()=>{
 const {adapter,seen}=make();
 for(const e of [{...upload,objectKey:"tenants/other/foo.jpg"},{...upload,contentType:"text/html"},{...upload,contentLength:13*1024*1024},{...upload,expiresInSeconds:181},{...upload,requiredEncryption:"AES256"},{...upload,privateOnly:false}]){
  await assert.rejects(adapter.signPut(e),/not authorized/);
 }
 for(const e of [{...view,objectKey:"https://public.example.com/test.jpg"},{...view,requiredMethod:"PUT"},{...view,expiresInSeconds:181}]){
  await assert.rejects(adapter.signGet(e),/not authorized/);
 }
 assert.equal(seen.length,0);
});
test("reject unexpected signer host and missing signed URL",async()=>{
 const client={send:async()=>({})},commands={PutObjectCommand,GetObjectCommand,HeadObjectCommand};
 for(const url of ["http://"+endpointHost+"/x?X-Amz-Signature=abc","https://evil.example.com/x?X-Amz-Signature=abc","https://"+endpointHost+"/x","https://"+endpointHost+"/x#fragment?X-Amz-Signature=abc"]){
  const adapter=createReceiptS3Adapter({config,client,commands,presign:async()=>url});
  await assert.rejects(adapter.signPut(upload),/not authorized/);
 }
});

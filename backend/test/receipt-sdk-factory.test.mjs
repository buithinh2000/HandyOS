import test from "node:test";
import assert from "node:assert/strict";
import {createHandyOsReceiptSdk,s3SigningOptions} from "../src/receipt-sdk-factory.mjs";
const bucket="handyos-receipts-staging-916004827349",region="ap-southeast-1";
const kms="arn:aws:kms:ap-southeast-1:916004827349:key/11111111-1111-4111-8111-111111111111";
const config={bucket,region,accountId:"916004827349",kmsKeyArn:kms,endpointHost:bucket+".s3."+region+".amazonaws.com"};
const key="tenants/11111111-1111-4111-8111-111111111111/jobs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/receipts/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg";
class PutObjectCommand{constructor(input){this.input=input}}
class GetObjectCommand{constructor(input){this.input=input}}
class HeadObjectCommand{constructor(input){this.input=input}}
const calls=[];
class S3Client{
 constructor(options){calls.push({kind:"new",options})}
 async send(command){calls.push({kind:"send",command});return {ContentType:"image/jpeg",ContentLength:1024,ServerSideEncryption:"aws:kms",SSEKMSKeyId:kms}}
 destroy(){calls.push({kind:"destroy"})}
}
const modules={s3:{S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand},
 presigner:{getSignedUrl:async(client,command,opts)=>{
  calls.push({kind:"signed",command,opts});
  return "https://"+config.endpointHost+"/object?X-Amz-Signature=synthetic";
 }}};
const upload={objectKey:key,contentType:"image/jpeg",contentLength:1024,privateOnly:true,requiredEncryption:"aws:kms",requiredMethod:"PUT",expiresInSeconds:180};
const view={objectKey:key,expiresInSeconds:60,privateOnly:true,requiredMethod:"GET"};
test("explicit activation and isolation required before any client creation",async()=>{
 calls.length=0;
 for(const params of [{},{enabled:true},{verifiedIsolation:true},{enabled:true,verifiedIsolation:true,config:{...config,bucket:"buitai-core"}}])
  await assert.rejects(createHandyOsReceiptSdk({config,modules,...params}),/not activated|not authorized/);
 assert.equal(calls.length,0);
});
test("PUT signed with immutable authorization constraints and no network call during signing",async()=>{
 calls.length=0;
 const sdk=await createHandyOsReceiptSdk({config,modules,enabled:true,verifiedIsolation:true});
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].options,{region,forcePathStyle:false});
 assert.ok(sdk.requiredUploadHeaders.includes("if-none-match"));
 await sdk.adapter.signPut(upload);
 const signed=calls.find(x=>x.kind==="signed");
 assert.equal(signed.command.input.Bucket,bucket);
 assert.equal(signed.command.input.SSEKMSKeyId,kms);
 assert.equal(signed.command.input.IfNoneMatch,"*");
 assert.equal(signed.opts.expiresIn,180);
 assert.deepEqual([...signed.opts.signableHeaders].sort(),["content-length","content-type","if-none-match"]);
 assert.deepEqual([...signed.opts.unhoistableHeaders].sort(),
 ["x-amz-server-side-encryption","x-amz-server-side-encryption-aws-kms-key-id"]);
 assert.equal(calls.some(x=>x.kind==="send"),false);
 sdk.close();assert.equal(calls.at(-1).kind,"destroy");
});
test("GET never signs a PUT or returns long-lived URL, HEAD requires exact KMS",async()=>{
 calls.length=0;
 const sdk=await createHandyOsReceiptSdk({config,modules,enabled:true,verifiedIsolation:true});
 await sdk.adapter.signGet(view);
 assert.equal(calls.find(x=>x.kind==="signed").command instanceof GetObjectCommand,true);
 assert.deepEqual(calls.find(x=>x.kind==="signed").opts,{expiresIn:60});
 await sdk.adapter.head(upload);
 assert.equal(calls.find(x=>x.kind==="send").command instanceof HeadObjectCommand,true);
 sdk.close();
});
test("reject unsafe expiration and unknown method",()=>{
 for(const value of [-1,0,181,1.5,"180"])assert.throws(()=>s3SigningOptions(value,"PUT"));
 assert.throws(()=>s3SigningOptions(60,"DELETE"));
});

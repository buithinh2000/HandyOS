// Offline real AWS SDK signing contract. Uses synthetic credentials only.
// NEVER runs against AWS or imports any real HandyOS bucket/secret.
import test from "node:test";
import assert from "node:assert/strict";
import * as s3 from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {createHandyOsReceiptSdk} from "../src/receipt-sdk-factory.mjs";

const tenant="11111111-1111-4111-8111-111111111111";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const receipt="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const object="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const bucket="handyos-receipts-staging-916004827349";
const region="ap-southeast-1";
const kms="arn:aws:kms:ap-southeast-1:916004827349:key/11111111-1111-4111-8111-111111111111";
const config={bucket,region,accountId:"916004827349",kmsKeyArn:kms,endpointHost:bucket+".s3."+region+".amazonaws.com"};
const key=`tenants/${tenant}/jobs/${job}/receipts/${receipt}/${object}.jpg`;
const expected={objectKey:key,contentType:"image/jpeg",contentLength:2567,
 privateOnly:true,requiredMethod:"PUT",requiredEncryption:"aws:kms",expiresInSeconds:180};
class OfflineS3Client extends s3.S3Client{
 constructor(options){
  super({...options,credentials:{accessKeyId:"OFFLINEONLYKEY",secretAccessKey:"OFFLINEONLYSECRET"}});
 }
 async send(){throw Error("Offline signing must never perform an AWS request")}
}
async function setup(){
 return createHandyOsReceiptSdk({config,enabled:true,verifiedIsolation:true,
  modules:{s3:{...s3,S3Client:OfflineS3Client},presigner:{getSignedUrl}}});
}
test("actual pinned AWS SDK produces region-scoped SigV4 PUT with content and KMS constraints",async()=>{
 const sdk=await setup();
 try{
  const value=await sdk.adapter.signPut(expected);
  const url=new URL(value);
  assert.equal(url.host,config.endpointHost);
  assert.equal(url.searchParams.get("X-Amz-Expires"),"180");
  assert.equal(url.searchParams.get("X-Amz-Algorithm"),"AWS4-HMAC-SHA256");
  assert.match(url.searchParams.get("X-Amz-Credential")||"",/\/ap-southeast-1\/s3\/aws4_request$/);
  const headers=(url.searchParams.get("X-Amz-SignedHeaders")||"").split(";");
  for(const h of ["host","content-type","if-none-match","x-amz-server-side-encryption","x-amz-server-side-encryption-aws-kms-key-id"])
   assert.ok(headers.includes(h),"Required signed header missing: "+h+"; actual: "+headers.join(","));
  assert.ok(headers.includes("content-length"),"Expected upload size must be bound to signature");
  assert.equal(url.searchParams.has("X-Amz-Signature"),true);
 }finally{sdk.close()}
});
test("actual pinned SDK signs private GET without writing or reading S3",async()=>{
 const sdk=await setup();
 try{
  const url=new URL(await sdk.adapter.signGet({objectKey:key,privateOnly:true,requiredMethod:"GET",expiresInSeconds:60}));
  assert.equal(url.searchParams.get("X-Amz-Expires"),"60");
  assert.equal(url.host,config.endpointHost);
  assert.equal(url.searchParams.has("X-Amz-Signature"),true);
 }finally{sdk.close()}
});

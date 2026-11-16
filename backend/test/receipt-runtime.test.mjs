import test from "node:test";
import assert from "node:assert/strict";
import {receiptRuntimeConfig,createHandyOsReceiptRuntime} from "../src/receipt-runtime.mjs";
const env={
 HANDYOS_RECEIPTS_ENABLED:"true",HANDYOS_ISOLATED_RESOURCES_VERIFIED:"true",
 HANDYOS_AWS_ACCOUNT_ID:"111122223333",AWS_REGION:"ap-southeast-1",
 HANDYOS_RECEIPT_BUCKET:"handyos-receipts-staging-111122223333",
 HANDYOS_RECEIPT_KMS_ARN:"arn:aws:kms:ap-southeast-1:111122223333:key/11111111-1111-4111-8111-111111111111",
 DATABASE_URL:"postgresql://test.invalid/handyos_only",
 COGNITO_USER_POOL_ID:"ap-southeast-1_handyoz",COGNITO_APP_CLIENT_ID:"syntheticpublicclient"
};
test("disabled receipts neither construct SDK nor database repository",async()=>{
 let calls=0;
 const value=await createHandyOsReceiptRuntime({env:{},pool:null,
  createSdk:async()=>{calls++}});
 assert.equal(value.enabled,false);assert.equal(value.workflow,null);
 value.close();assert.equal(calls,0);
 assert.equal(receiptRuntimeConfig({}),null);
});
test("validated dedicated metadata composes S3, PostgreSQL and workflow once",async()=>{
 const calls=[];const pool={connect:async()=>{}};
 const sdk={adapter:{signPut:async()=>{}},close:()=>{calls.push("close")}};
 const repository={sentinel:"postgres-only"};
 const workflow={beginUpload(){},confirmUpload(){},viewReceipt(){}};
 const result=await createHandyOsReceiptRuntime({env,pool,
  createSdk:async opts=>{calls.push({sdk:opts});return sdk},
  createRepository:opts=>{calls.push({repo:opts});return repository},
  createWorkflow:opts=>{calls.push({workflow:opts});return workflow}
 });
 assert.equal(result.enabled,true);assert.equal(result.workflow,workflow);
 assert.equal(calls[0].sdk.config.bucket,env.HANDYOS_RECEIPT_BUCKET);
 assert.equal(calls[0].sdk.config.accountId,env.HANDYOS_AWS_ACCOUNT_ID);
 assert.equal(calls[0].sdk.config.kmsKeyArn,env.HANDYOS_RECEIPT_KMS_ARN);
 assert.deepEqual({enabled:calls[0].sdk.enabled,verifiedIsolation:calls[0].sdk.verifiedIsolation},{enabled:true,verifiedIsolation:true});
 assert.equal(calls[1].repo.pool,pool);
 assert.equal(calls[2].workflow.media,sdk.adapter);
 result.close();assert.equal(calls.at(-1),"close");
});
test("invalid account, stolen venture bucket, wrong KMS region and absent isolation are blocked before SDK startup",async()=>{
 const changes=[
 {HANDYOS_ISOLATED_RESOURCES_VERIFIED:""},
 {HANDYOS_AWS_ACCOUNT_ID:"999"},
 {HANDYOS_RECEIPT_BUCKET:"buitai-core-prod-receipts"},
 {HANDYOS_RECEIPT_BUCKET:"handyos-too-short-$$"},
 {HANDYOS_RECEIPT_KMS_ARN:"arn:aws:kms:ap-southeast-2:111122223333:key/11111111-1111-4111-8111-111111111111"},
 {HANDYOS_RECEIPT_KMS_ARN:"arn:aws:kms:ap-southeast-1:999988887777:key/11111111-1111-4111-8111-111111111111"},
 {COGNITO_USER_POOL_ID:""}
 ];
 for(const change of changes){
  let calls=0;
  await assert.rejects(createHandyOsReceiptRuntime({env:{...env,...change},pool:{connect(){}},
   createSdk:async()=>{calls++;throw Error("Never called")}}),/not activated/);
  assert.equal(calls,0);
 }
});
test("SDK startup failure fails closed without leaking upstream error",async()=>{
 const result=createHandyOsReceiptRuntime({env,pool:{connect(){}},
  createSdk:async()=>{throw Error("SECRET_TOKEN=private-and-signed-url")}});
 await assert.rejects(result,error=>{
  assert.match(error.message,/not activated/);
  assert.ok(!error.message.includes("SECRET_TOKEN"));
  return true;
 });
});
test("partial startup must close any initialized S3 SDK",async()=>{
 let closed=0;
 await assert.rejects(createHandyOsReceiptRuntime({env,pool:{connect(){}},
  createSdk:async()=>({adapter:{},close:()=>closed++}),
  createRepository:()=>{throw Error("Cannot reach dedicated database")}}),/not activated/);
 assert.equal(closed,1);
});

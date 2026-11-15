import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {checkOwnerStaging,checkedConfig,PERMITTED_COMMANDS} from "../cloud/preflight-readonly.mjs";
const env={
 HANDYOS_EXPECTED_ACCOUNT:"123456789012",
 HANDYOS_EXPECTED_REGION:"ap-southeast-1",
 HANDYOS_USER_POOL_ID:"ap-southeast-1_AbC123",
 HANDYOS_APP_CLIENT_ID:"exampleClient123",
 HANDYOS_OWNER_ORIGIN:"https://handyos.buitai.com",
 HANDYOS_ARTIFACT_BUCKET:"handyos-staging-artifact-example",
 HANDYOS_ARTIFACT_KEY:"review/lambda.zip",
 HANDYOS_ARTIFACT_VERSION:"abcDEF123+_"
};
const fixture=()=>{
 let calls=[];
 const run=args=>{
  calls.push(args);
  const op=args.slice(0,2).join(" ");
  if(op==="sts get-caller-identity")return {Account:env.HANDYOS_EXPECTED_ACCOUNT};
  if(op==="cognito-idp describe-user-pool")return {UserPool:{Id:env.HANDYOS_USER_POOL_ID,Status:"Enabled"}};
  if(op==="cognito-idp describe-user-pool-client")return {UserPoolClient:{
   ClientId:env.HANDYOS_APP_CLIENT_ID,GenerateSecret:false,
   AllowedOAuthFlowsUserPoolClient:true,AllowedOAuthFlows:["code"],
   AllowedOAuthScopes:["openid","email"],
   CallbackURLs:[env.HANDYOS_OWNER_ORIGIN+"/auth/callback"]
  }};
  if(op==="s3api get-bucket-versioning")return {Status:"Enabled"};
  if(op==="s3api head-object")return {VersionId:env.HANDYOS_ARTIFACT_VERSION,ContentLength:2345,ServerSideEncryption:"aws:kms"};
  throw Error("unexpected command");
 };
 return {calls,run};
};
test("preflight metadata checks use exactly five fixed AWS read-only commands",()=>{
 const f=fixture(),result=checkOwnerStaging({env,run:f.run});
 assert.equal(result.status,"PASS");
 assert.equal(result.checks.length,5);
 assert.equal(f.calls.length,5);
 for(const args of f.calls){
  assert.ok(PERMITTED_COMMANDS.includes(args.slice(0,2).join(" ")));
  assert.ok(args.includes("--output"));
  assert.ok(args.includes("--region"));
  assert.equal(args[args.indexOf("--region")+1],env.HANDYOS_EXPECTED_REGION);
 }
 assert.match(result.caveat,/NOT verified/);
});
test("wrong account blocks, never invents account authorization",()=>{
 const f=fixture();const result=checkOwnerStaging({env:{...env,HANDYOS_EXPECTED_ACCOUNT:"999999999999"},run:f.run});
 assert.equal(result.status,"BLOCKED");
 assert.equal(result.checks[0].status,"BLOCKED");
});
test("missing configuration blocks without running AWS or printing values",()=>{
 const f=fixture(),bad={...env,HANDYOS_ARTIFACT_BUCKET:""};
 const result=checkOwnerStaging({env:bad,run:f.run});
 assert.equal(result.status,"BLOCKED");assert.equal(f.calls.length,0);
 assert.doesNotMatch(JSON.stringify(result),/123456789012|exampleClient123|handyos-staging-artifact-example/);
});
test("Cognito client with a secret, implicit flow, no openid, or incorrect callback blocks",()=>{
 const f=fixture();
 for(const mutate of [
  c=>{c.GenerateSecret=true},
  c=>{c.AllowedOAuthFlows=["implicit"]},
  c=>{c.AllowedOAuthScopes=["email"]},
  c=>{c.CallbackURLs=["https://other.example/auth/callback"]}
 ]){
  const run=args=>{const x=f.run(args);if(args[0]==="cognito-idp"&&args[1]==="describe-user-pool-client")mutate(x.UserPoolClient);return x};
  const result=checkOwnerStaging({env,run});
  assert.equal(result.checks.find(x=>x.check==="Cognito public PKCE client").status,"BLOCKED");
 }
});
test("disabled bucket versioning or unencrypted/incorrect artifact blocks",()=>{
 for(const fail of ["versioning","artifact"]){
  const f=fixture();
  const run=args=>{
   const v=f.run(args);
   if(fail==="versioning"&&args[1]==="get-bucket-versioning")v.Status="Suspended";
   if(fail==="artifact"&&args[1]==="head-object")v.ServerSideEncryption="AES256";
   return v;
  };
  assert.equal(checkOwnerStaging({env,run}).status,"BLOCKED");
 }
});
test("read-only preflight contains no AWS mutation or secret retrieval instructions",()=>{
 const source=readFileSync(new URL("../cloud/preflight-readonly.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/["']aws["'].*["'](?:deploy|create|put|update|delete|run-task|get-secret-value)/);
 assert.deepEqual(PERMITTED_COMMANDS,[
 "sts get-caller-identity",
 "cognito-idp describe-user-pool",
 "cognito-idp describe-user-pool-client",
 "s3api get-bucket-versioning",
 "s3api head-object",
 "cloudformation validate-template"
 ]);
});

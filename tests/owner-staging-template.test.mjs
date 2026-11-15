import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const t=JSON.parse(readFileSync(new URL("../cloud/staging-stack.json",import.meta.url),"utf8"));
const type=(name,expected)=>assert.equal(t.Resources[name]?.Type,expected,name);
const p=name=>t.Resources[name].Properties;
const statements=p("OwnerLambdaRole").Policies.flatMap(x=>x.PolicyDocument.Statement);
const allStrings=value=>JSON.stringify(value);

test("isolated staging source defines required dedicated AWS resource types",()=>{
 for(const [name,kind] of Object.entries({
  LedgerBucket:"AWS::S3::Bucket",LedgerKey:"AWS::KMS::Key",
  LedgerBucketPolicy:"AWS::S3::BucketPolicy",OwnerLambdaRole:"AWS::IAM::Role",
  LedgerFunction:"AWS::Lambda::Function",OwnerApi:"AWS::ApiGatewayV2::Api",
  OwnerAuthorizer:"AWS::ApiGatewayV2::Authorizer",
  OwnerIntegration:"AWS::ApiGatewayV2::Integration",
  GetLedger:"AWS::ApiGatewayV2::Route",PutLedger:"AWS::ApiGatewayV2::Route",
  DefaultStage:"AWS::ApiGatewayV2::Stage",InvokePermission:"AWS::Lambda::Permission"
 }))type(name,kind);
 assert.equal(t.Resources.LedgerBucket.DeletionPolicy,"Retain");
 assert.equal(t.Resources.LedgerKey.DeletionPolicy,"Retain");
});
test("no public bucket; object versioning and KMS encryption are mandatory",()=>{
 const bucket=p("LedgerBucket");
 assert.deepEqual(bucket.PublicAccessBlockConfiguration,{BlockPublicAcls:true,BlockPublicPolicy:true,IgnorePublicAcls:true,RestrictPublicBuckets:true});
 assert.equal(bucket.VersioningConfiguration.Status,"Enabled");
 const rule=bucket.BucketEncryption.ServerSideEncryptionConfiguration[0];
 assert.equal(rule.ServerSideEncryptionByDefault.SSEAlgorithm,"aws:kms");
 assert.equal(rule.BucketKeyEnabled,false);
 assert.equal(p("LedgerKey").EnableKeyRotation,true);
 const deny=p("LedgerBucketPolicy").PolicyDocument.Statement.find(x=>x.Sid==="DenyNonTLS");
 assert.equal(deny.Effect,"Deny");
 assert.equal(deny.Condition.Bool["aws:SecureTransport"],"false");
});
test("Lambda role only grants one Owner object, KMS via S3 and CloudWatch stream rights",()=>{
 const allowed=statements.filter(x=>x.Effect==="Allow").flatMap(x=>x.Action);
 assert.deepEqual(allowed.sort(),["s3:GetObject","s3:PutObject","kms:Decrypt","kms:GenerateDataKey","logs:CreateLogStream","logs:PutLogEvents"].sort());
 assert.ok(!allowed.some(a=>a.includes("Delete")||a.includes("List")||a==="*"));
 const obj=statements.find(x=>x.Sid==="LedgerObjectReadWriteOnly");
 assert.match(allStrings(obj.Resource),/owners\/\$\{OwnerSub\}\/ledger\.json/);
 const kms=statements.find(x=>x.Sid==="LedgerKMSOnlyViaS3");
 assert.match(allStrings(kms.Condition),/kms:ViaService/);
 assert.match(allStrings(kms.Condition),/kms:EncryptionContext:aws:s3:arn/);
 const logs=statements.find(x=>x.Sid==="DedicatedLogStreamOnly");
 assert.match(allStrings(logs.Resource),/handyos-owner-staging/);
});
test("both routes require JWT authorization and openid access-token scope",()=>{
 for(const name of ["GetLedger","PutLedger"]){
  const route=p(name);
  assert.equal(route.AuthorizationType,"JWT");
  assert.deepEqual(route.AuthorizerId,{Ref:"OwnerAuthorizer"});
  assert.deepEqual(route.AuthorizationScopes,["openid"]);
  assert.match(route.RouteKey,/^(GET|PUT) \/owner-ledger$/);
 }
 assert.equal(p("OwnerAuthorizer").AuthorizerType,"JWT");
 assert.deepEqual(p("OwnerAuthorizer").IdentitySource,["$request.header.Authorization"]);
 assert.deepEqual(p("OwnerAuthorizer").JwtConfiguration.Audience,[{Ref:"CognitoClientId"}]);
 assert.deepEqual(p("OwnerAuthorizer").JwtConfiguration.Issuer,{Ref:"CognitoIssuer"});
 assert.equal(p("DefaultStage").StageName,"$default");
 assert.equal(p("DefaultStage").AutoDeploy,true);
});
test("API accepts CORS only from exact configured owner origin, no wildcard or generic fallback",()=>{
 const api=p("OwnerApi");
 assert.deepEqual(api.CorsConfiguration.AllowOrigins,[{Ref:"OwnerOrigin"}]);
 assert.ok(!allStrings(t.Resources).includes('"RouteKey":"$default"'));
 assert.ok(!allStrings(api.CorsConfiguration).includes('"*"'));
 assert.deepEqual(api.CorsConfiguration.AllowMethods,["GET","PUT","OPTIONS"]);
 assert.deepEqual(api.CorsConfiguration.AllowHeaders,["authorization","content-type","if-match","if-none-match"]);
});
test("dedicated Lambda uses immutable artifact version, constrained resources and matching runtime settings",()=>{
 const f=p("LedgerFunction");
 assert.equal(f.Runtime,"nodejs22.x");
 assert.equal(f.Handler,"cloud/lambda.handler");
 assert.deepEqual(f.Code.S3ObjectVersion,{Ref:"ArtifactVersion"});
 assert.equal(f.Timeout,10);
 assert.equal(f.MemorySize,128);
 assert.deepEqual(f.Environment.Variables.HANDYOS_OWNER_SUB,{Ref:"OwnerSub"});
 assert.deepEqual(f.Environment.Variables.HANDYOS_JWT_CLIENT_ID,{Ref:"CognitoClientId"});
 assert.deepEqual(f.Environment.Variables.HANDYOS_API_GATEWAY_ID,{Ref:"OwnerApi"});
 const invoke=p("InvokePermission");
 assert.equal(invoke.Principal,"apigateway.amazonaws.com");
 assert.match(allStrings(invoke.SourceArn),/\/\*\/\*\/owner-ledger/);
});

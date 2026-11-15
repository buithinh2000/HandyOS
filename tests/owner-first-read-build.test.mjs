import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const base=new URL("../",import.meta.url);
const load=p=>readFileSync(new URL(p,base),"utf8");
const t=JSON.parse(load("cloud/staging-stack.json"));
const statements=t.Resources.OwnerLambdaRole.Properties.Policies[0].PolicyDocument.Statement;
test("first GET uses S3 exact-key ListObjectsV2 probe and never treats AccessDenied as an empty ledger",()=>{
 const lambda=load("cloud/lambda.mjs");
 assert.match(lambda,/ListObjectsV2Command/);
 assert.match(lambda,/Prefix:key,MaxKeys:1/);
 assert.match(lambda,/listing\.Contents/);
 assert.match(lambda,/x=>x\.Key===key/);
 assert.match(lambda,/res=await client\.send\(new GetObjectCommand/);
 assert.doesNotMatch(lambda,/AccessDenied.*return null/);
});
test("IAM list authority confined to owner's single ledger key prefix",()=>{
 const list=statements.find(x=>x.Sid==="OwnerLedgerExactKeyListOnly");
 assert.ok(list);
 assert.deepEqual(list.Action,["s3:ListBucket"]);
 assert.deepEqual(list.Resource,[{"Fn::GetAtt":["LedgerBucket","Arn"]}]);
 assert.deepEqual(list.Condition.StringEquals["s3:prefix"],{"Fn::Sub":"owners/"+String.fromCharCode(36)+"{OwnerSub}/ledger.json"});
 assert.equal(statements.filter(x=>x.Action?.includes("s3:ListBucket")).length,1);
});
test("review artifact has pinned direct packages and zero upload permissions or AWS actions",()=>{
 const p=JSON.parse(load("cloud/build/package.json"));
 assert.match(p.dependencies["@aws-sdk/client-s3"],/^\d+\.\d+\.\d+$/);
 assert.match(p.devDependencies.esbuild,/^\d+\.\d+\.\d+$/);
 const ci=load(".github/workflows/owner-lambda-artifact.yml");
 assert.match(ci,/npm ci/);
 assert.match(ci,/esbuild cloud\/lambda\.mjs/);
 assert.match(ci,/--bundle --platform=node --target=node22 --format=cjs/);
 assert.match(ci,/sha256sum/);
 assert.match(ci,/SOURCE-COMMIT\.txt/);
 assert.match(ci,/upload-artifact@v4/);
 assert.match(ci,/NOT_UPLOADED_TO_AWS/);
 assert.doesNotMatch(ci,/configure-aws-credentials|cloudformation deploy|aws s3 cp|aws lambda update/);
});

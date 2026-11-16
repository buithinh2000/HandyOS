import test from "node:test";
import assert from "node:assert/strict";
import {createAwsCliRunner,inspectHandyOsAws,plannedReadOnlyCommands} from "../cloud/aws-readonly-inventory.mjs";
const account="111122223333",region="ap-southeast-1";
const mock={
 "sts get-caller-identity":{Account:account,Arn:"arn:aws:iam::111122223333:user/read-only"},
 "rds describe-db-instances":{DBInstances:[{DBInstanceIdentifier:"buitai-core-prod"},{DBInstanceIdentifier:"handyos-staging-db"}]},
 "cognito-idp list-user-pools --max-results 60":{UserPools:[{Name:"handyos-staging-users"},{Name:"twolives-users"}]},
 "s3api list-buckets":{Buckets:[{Name:"handyos-staging-receipts"},{Name:"other-venture-private"}]},
 "iam list-roles":{Roles:[{RoleName:"handyos-staging-api"},{RoleName:"buitai-core-runtime"}]},
 "kms list-aliases":{Aliases:[{AliasName:"alias/handyos-receipts"},{AliasName:"alias/buitai-key"}]},
 "secretsmanager list-secrets":{SecretList:[{Name:"handyos/staging/database"},{Name:"buitai/core/secret"}]}
};
function fakeRun(calls,overrides={}){
 return async(args,r)=>{
  calls.push({args,region:r});
  const k=args.join(" ");
  if(!Object.prototype.hasOwnProperty.call({...mock,...overrides},k))throw Error("Forbidden command");
  const value={...mock,...overrides}[k];
  if(value instanceof Error)throw value;
  return value;
 };
}
test("allowlist contains only identity and enumerative AWS metadata requests",()=>{
 const commands=plannedReadOnlyCommands().map(x=>x.join(" "));
 assert.equal(commands.length,7);
 assert.ok(commands.every(x=>!/get-secret-value|put|create|delete|modify|update|run-task|assume-role/.test(x)));
 assert.ok(commands.includes("sts get-caller-identity"));
});
test("read-only identity and inventory report only HandyOS names and redact all other venture names",async()=>{
 const calls=[];
 const result=await inspectHandyOsAws({expectedAccount:account,region,run:fakeRun(calls)});
 assert.equal(result.status,"INVENTORY_ONLY");
 assert.equal(result.approvedToDeploy,false);
 assert.equal(result.accountMatched,true);
 assert.equal(calls.length,7);
 assert.equal(result.handyosNames.rds[0],"handyos-staging-db");
 assert.equal(result.handyosNames.cognito[0],"handyos-staging-users");
 assert.equal(result.handyosNames.s3[0],"handyos-staging-receipts");
 assert.equal(result.handyosNames.iam[0],"handyos-staging-api");
 assert.equal(result.handyosNames.kms[0],"alias/handyos-receipts");
 assert.equal(result.handyosNames.secrets[0],"handyos/staging/database");
 assert.equal(result.resourceCounts.rds.otherRedacted,1);
 const serialized=JSON.stringify(result);
 for(const forbidden of ["buitai-core-prod","buitai-core-runtime","twolives-users","other-venture-private","buitai/core/secret"])
  assert.ok(!serialized.includes(forbidden),"Must not disclose other venture name");
});
test("foreign or malformed AWS account blocks BEFORE fetching any inventory",async()=>{
 for(const bad of [undefined,"000000000000","999988887777"]){
  const calls=[],run=fakeRun(calls);
  const result=await inspectHandyOsAws({expectedAccount:bad,region,run});
  assert.equal(result.status,"BLOCKED");
  assert.equal(result.verified,false);
  assert.ok(calls.length<=1);
 }
});
test("missing IAM read rights, failed API calls or malformed response are fail-closed",async()=>{
 const broken={
  "iam list-roles":new Error("private role ARNs in AWS stderr"),
  "rds describe-db-instances":{DBInstances:"oops"},
  "s3api list-buckets":{Buckets:[{Name:"handyos-staging-receipts"},{Name:null}]}
 };
 for(const [k,value] of Object.entries(broken)){
  const result=await inspectHandyOsAws({expectedAccount:account,region,run:fakeRun([],{[k]:value})});
  assert.equal(result.status,"BLOCKED");
  assert.equal(result.approvedToDeploy,undefined);
  assert.ok(!JSON.stringify(result).includes("private role ARNs"));
 }
});
test("AWS CLI implementation refuses credential retrieval or infrastructure mutation commands",async()=>{
 const calls=[];
 const runner=createAwsCliRunner({exec:(program,args,opts)=>{
  calls.push({program,args,opts});
  return '{"Account":"111122223333"}';
 }});
 await assert.rejects(runner(["secretsmanager","get-secret-value"],region),/not allowlisted/);
 await assert.rejects(runner(["rds","create-db-instance"],region),/not allowlisted/);
 await assert.rejects(runner(["iam","get-role"],region),/not allowlisted/);
 assert.equal(calls.length,0);
 await runner(["sts","get-caller-identity"],region);
 assert.deepEqual(calls[0].args.slice(0,2),["sts","get-caller-identity"]);
 assert.equal(calls[0].opts.stdio[2],"pipe");
 assert.equal(calls[0].opts.shell,undefined);
});
test("no CLI runs without explicit expected account and region",async()=>{
 let calls=0;
 for(const input of [{},{expectedAccount:account,region:"us-east-1"},{expectedAccount:account,region:"anything"}]){
  const r=await inspectHandyOsAws({...input,run:async()=>{calls++}});
  assert.equal(r.status,"BLOCKED");
 }
 assert.equal(calls,0);
});

import test from "node:test";
import assert from "node:assert/strict";
import {auditHandyOsAws,COMMANDS} from "../cloud/handyos-aws-inventory-readonly.mjs";
const account="916004827349",region="ap-southeast-1";
test("AWS preflight permits only metadata read operations",()=>{
 assert.deepEqual(COMMANDS,["sts get-caller-identity","ec2 describe-vpcs","rds describe-db-instances","cognito-idp list-user-pools","s3api list-buckets"]);
 assert.equal(COMMANDS.some(x=>/secret|run-task|create|delete|put|execute|update|invoke/.test(x)),false);
});
test("AWS account mismatch must stop before ANY inventory scan",()=>{
 let calls=0;const r=auditHandyOsAws({account,region,run:()=>{calls++;return{Account:"000000000000"}}});
 assert.equal(r.status,"BLOCKED");assert.equal(calls,1);assert.equal(r.checks.length,1);
});
test("correct account returns only aggregate HandyOS resource metadata and no other venture identifiers",()=>{
 const seen=[];
 const run=args=>{seen.push(args.join(" "));switch(args.slice(0,2).join(" ")){
 case "sts get-caller-identity":return{Account:account,Arn:"arn:aws:iam::fake:user/example"};
 case "ec2 describe-vpcs":return{Vpcs:[{VpcId:"vpc-1"}]};
 case "rds describe-db-instances":return{DBInstances:[{DBInstanceIdentifier:"buitai-core"},{DBInstanceIdentifier:"handyos-staging",DBInstanceStatus:"available"}]};
 case "cognito-idp list-user-pools":return{UserPools:[{Name:"HandyOS-auth"},{Name:"Other-App"}]};
 case "s3api list-buckets":return{Buckets:[{Name:"handyos-receipts"},{Name:"another-private-bucket"}]};
 default:throw Error("unknown");
 }};
 const report=auditHandyOsAws({account,region,run});
 assert.equal(report.status,"PASS");
 assert.equal(report.checks.length,5);
 assert.match(report.checks[2].info,/HandyOS candidates: 1; ready: 1/);
 assert.match(report.checks[4].info,/HandyOS bucket candidates: 1/);
 assert.doesNotMatch(JSON.stringify(report),/buitai-core|another-private-bucket|arn:aws/);
 assert.equal(seen.some(x=>x.includes("get-secret-value")),false);
});
test("unknown CLI errors fail safely without printing resource details",()=>{
 const report=auditHandyOsAws({account,region,run:args=>args[0]==="sts"?{Account:account}:(()=>{throw Error("credentials leaked on stderr")})()});
 assert.equal(report.status,"BLOCKED");
 assert.equal(report.checks.filter(x=>x.status==="BLOCKED").length,4);
 assert.doesNotMatch(JSON.stringify(report),/credentials leaked/);
});

// HandyOS AWS account infrastructure inventory: metadata-only, no mutations.
// Usage (verified AWS CloudShell): HANDYOS_EXPECTED_ACCOUNT=... HANDYOS_EXPECTED_REGION=ap-southeast-1 node cloud/handyos-aws-inventory-readonly.mjs
// Does not read secrets, database rows, Cognito users or S3 objects. Output: aggregate statuses only.
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

export const COMMANDS=Object.freeze([
 "sts get-caller-identity",
 "ec2 describe-vpcs",
 "rds describe-db-instances",
 "cognito-idp list-user-pools",
 "s3api list-buckets"
]);
const isAwsAccount=s=>typeof s==="string"&&/^\d{12}$/.test(s);
const isRegion=s=>typeof s==="string"&&/^[a-z]{2}-[a-z]+-\d$/.test(s);
const isHandy=s=>typeof s==="string"&&/(^|[-_])handyos([-_]|$)/i.test(s);
function allowed(args){
 const key=args.slice(0,2).join(" ");
 if(!COMMANDS.includes(key))throw new Error("Unsupported read-only AWS command");
 return true;
}
function cli(args){
 allowed(args);
 const raw=execFileSync("aws",[...args,"--output","json"],{encoding:"utf8",timeout:15000,maxBuffer:1024*1024,stdio:["ignore","pipe","pipe"]});
 return JSON.parse(raw);
}
export function auditHandyOsAws({account,region,run=cli}){
 const checks=[];
 const note=(name,status,extra={})=>checks.push({name,status,...extra});
 if(!isAwsAccount(account)||!isRegion(region))return {status:"BLOCKED",checks:[{name:"Expected AWS account and region",status:"BLOCKED"}]};
 const call=(name,args,process)=>{
  try{
   allowed(args);const result=process(run(args));
   note(name,result.status,result.info?{info:result.info}:{});
  }catch{note(name,"BLOCKED")}
 };
 call("AWS identity",["sts","get-caller-identity"],x=>({status:x?.Account===account?"PASS":"BLOCKED"}));
 if(checks[0].status!=="PASS")return {status:"BLOCKED",checks};
 call("VPC metadata",["ec2","describe-vpcs","--region",region],x=>({status:Array.isArray(x?.Vpcs)?"PASS":"BLOCKED",info:Array.isArray(x?.Vpcs)?"VPCs: "+x.Vpcs.length:undefined}));
 call("Dedicated HandyOS RDS",["rds","describe-db-instances","--region",region],x=>{
  if(!Array.isArray(x?.DBInstances))return{status:"BLOCKED"};
  const named=x.DBInstances.filter(db=>isHandy(db.DBInstanceIdentifier));
  return{status:"PASS",info:"HandyOS candidates: "+named.length+"; ready: "+named.filter(db=>db.DBInstanceStatus==="available").length};
 });
 call("Dedicated HandyOS Cognito",["cognito-idp","list-user-pools","--max-results","60","--region",region],x=>{
  if(!Array.isArray(x?.UserPools))return{status:"BLOCKED"};
  return{status:"PASS",info:"HandyOS pool candidates in first page: "+x.UserPools.filter(p=>isHandy(p.Name)).length};
 });
 call("Dedicated HandyOS S3",["s3api","list-buckets","--region",region],x=>{
  if(!Array.isArray(x?.Buckets))return{status:"BLOCKED"};
  return{status:"PASS",info:"HandyOS bucket candidates: "+x.Buckets.filter(b=>isHandy(b.Name)).length};
 });
 return {status:checks.every(x=>x.status==="PASS")?"PASS":"BLOCKED",checks,
  caveat:"READ-ONLY INVENTORY. Found candidates are NOT verified isolated, private, backed-up or authorized. No AWS resources created; no secrets queried."};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=auditHandyOsAws({account:process.env.HANDYOS_EXPECTED_ACCOUNT,region:process.env.HANDYOS_EXPECTED_REGION});
 for(const c of report.checks)process.stdout.write(c.name+": "+c.status+(c.info?" ("+c.info+")":"")+"\n");
 process.stdout.write("OVERALL: "+report.status+"\n"+(report.caveat||"Expected account/region missing or invalid.")+"\n");
 if(report.status!=="PASS")process.exitCode=2;
}

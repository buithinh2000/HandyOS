// HandyOS read-only AWS inventory. Explicit CLI execution only, NO auto-run.
// Does not access Secret values, database records, customer data, bills or KMS data.
// Reports only HandyOS-prefixed resource names; never prints other venture names.
// AWS CLI arguments are fixed, executed without shell; no AWS mutations.
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

const ACCOUNT=/^[0-9]{12}$/;
const REGION=/^ap-(?:southeast|northeast|south)-[1-9]$/;
const PREFIX=/^(?:handyos[-/]|alias\/handyos[-/])/i;
const QUERIES=Object.freeze([
 Object.freeze({key:"rds",args:["rds","describe-db-instances"],field:"DBInstances",name:"DBInstanceIdentifier"}),
 Object.freeze({key:"cognito",args:["cognito-idp","list-user-pools","--max-results","60"],field:"UserPools",name:"Name"}),
 Object.freeze({key:"s3",args:["s3api","list-buckets"],field:"Buckets",name:"Name"}),
 Object.freeze({key:"iam",args:["iam","list-roles"],field:"Roles",name:"RoleName"}),
 Object.freeze({key:"kms",args:["kms","list-aliases"],field:"Aliases",name:"AliasName"}),
 Object.freeze({key:"secrets",args:["secretsmanager","list-secrets"],field:"SecretList",name:"Name"})
]);
function blocked(reason){return Object.freeze({status:"BLOCKED",reason,verified:false})}
function validName(value){return typeof value==="string"&&value.length>0&&value.length<=256}
export function plannedReadOnlyCommands(){
 return Object.freeze([
  Object.freeze(["sts","get-caller-identity"]),
  ...QUERIES.map(q=>q.args)
 ]);
}
export function createAwsCliRunner({exec=execFileSync}={}){
 if(typeof exec!=="function")throw Error("AWS CLI runner required");
 return async(args,region)=>{
  // Shell=false and immutable allowlisted actions; never interpolate command input.
  if(!plannedReadOnlyCommands().some(a=>a.length===args.length&&a.every((v,i)=>v===args[i])))
   throw Error("AWS command is not allowlisted read-only");
  const raw=exec("aws",[...args,"--region",region,"--output","json","--no-cli-pager"],{
   encoding:"utf8",timeout:20000,maxBuffer:5*1024*1024,stdio:["ignore","pipe","pipe"]
  });
  return JSON.parse(raw);
 };
}
/**
 * Must be invoked with scoped, pre-authorized AWS read-only credentials.
 * Returned status INVENTORY_ONLY means API calls succeeded, NOT permission to
 * create AWS infrastructure, share existing assets, or bypass manual review.
 * Errors are intentionally sanitized (AWS stderr may include resource details).
 */
export async function inspectHandyOsAws({expectedAccount,region,run}={}){
 if(!ACCOUNT.test(expectedAccount||"")||!REGION.test(region||"")||typeof run!=="function")
  return blocked("Explicit expected AWS account, region and read-only runner required");
 let identity;
 try{identity=await run(["sts","get-caller-identity"],region)}catch{return blocked("AWS identity unavailable")}
 if(!ACCOUNT.test(identity?.Account||"")||identity.Account!==expectedAccount)
  return blocked("AWS account does not match approved expected account");
 const results={},counts={};
 for(const q of QUERIES){
  let response;
  try{response=await run(q.args,region)}catch{
   return blocked("Missing read-only access for "+q.key);
  }
  const entries=response?.[q.field];
  if(!Array.isArray(entries))return blocked("Unexpected inventory response for "+q.key);
  const names=entries.map(e=>e?.[q.name]);
  if(names.some(n=>!validName(n)))return blocked("Unexpected inventory metadata for "+q.key);
  // Cognito list-user-pools is region-scoped; other groups may be global.
  // No non-HandyOS identifiers or ARNs are sent to stdout or stored to disk.
  const handyos=names.filter(n=>PREFIX.test(n)).sort();
  if(new Set(handyos).size!==handyos.length)return blocked("Duplicate HandyOS names for "+q.key);
  results[q.key]=Object.freeze(handyos);
  counts[q.key]=Object.freeze({handyos:handyos.length,otherRedacted:names.length-handyos.length});
 }
 return Object.freeze({
  status:"INVENTORY_ONLY",verified:true,approvedToDeploy:false,
  accountMatched:true,region,
  handyosNames:Object.freeze(results),resourceCounts:Object.freeze(counts),
  note:"Read-only metadata snapshot, not RDS isolation, ownership, cost or deployment approval"
 });
}
export async function runReadOnlyInventoryCommand({args=process.argv.slice(2),run=createAwsCliRunner()}={}){
 if(args.length!==2)throw Error("Use: node cloud/aws-readonly-inventory.mjs <expected-account> <region>");
 return inspectHandyOsAws({expectedAccount:args[0],region:args[1],run});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await runReadOnlyInventoryCommand();
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
 if(result.status!=="INVENTORY_ONLY")process.exitCode=2;
}

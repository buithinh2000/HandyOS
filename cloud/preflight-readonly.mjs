// HandyOS Owner V1 AWS staging: STRICTLY READ-ONLY preflight.
// Never call AWS mutations, GetSecretValue, invoke Lambda, or inspect customer data.
// Usage: node cloud/preflight-readonly.mjs (AWS CLI v2 credentials already configured in CloudShell).
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

const schema={
  HANDYOS_EXPECTED_ACCOUNT:/^\d{12}$/,
  HANDYOS_EXPECTED_REGION:/^[a-z]{2}-[a-z]+-\d$/,
  HANDYOS_USER_POOL_ID:/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/,
  HANDYOS_APP_CLIENT_ID:/^[A-Za-z0-9_-]{5,128}$/,
  HANDYOS_OWNER_ORIGIN:/^https:\/\/[A-Za-z0-9.-]+$/,
  HANDYOS_ARTIFACT_BUCKET:/^[a-z0-9][a-z0-9.-]{2,62}$/,
  HANDYOS_ARTIFACT_KEY:/^[A-Za-z0-9][A-Za-z0-9._/-]{0,512}$/,
  HANDYOS_ARTIFACT_VERSION:/^[A-Za-z0-9._+~=-]{1,256}$/
};
export const PERMITTED_COMMANDS=Object.freeze([
  "sts get-caller-identity",
  "cognito-idp describe-user-pool",
  "cognito-idp describe-user-pool-client",
  "s3api get-bucket-versioning",
  "s3api head-object",
  "cloudformation validate-template"
]);
function invalid(reason){throw new Error(reason)}
export function checkedConfig(env){
 const out={};
 for(const [name,pattern] of Object.entries(schema)){
  const value=env[name];
  if(typeof value!=="string"||!pattern.test(value))invalid("Missing or invalid "+name);
  out[name]=value;
 }
 if(!out.HANDYOS_USER_POOL_ID.startsWith(out.HANDYOS_EXPECTED_REGION+"_"))
  invalid("Cognito pool region does not match expected region");
 return out;
}
function isPublicClient(c){
 return !c.GenerateSecret&&!c.ClientSecret&&
   c.AllowedOAuthFlowsUserPoolClient===true&&
   Array.isArray(c.AllowedOAuthFlows)&&c.AllowedOAuthFlows.includes("code")&&
   Array.isArray(c.AllowedOAuthScopes)&&c.AllowedOAuthScopes.includes("openid");
}
const query=(run,service,operation,args,region)=>run([service,operation,...args,"--region",region,"--output","json"]);
export function checkOwnerStaging({env,run}){
 const checks=[],note=(name,ok)=>checks.push({check:name,status:ok?"PASS":"BLOCKED"});
 let cfg;
 try{cfg=checkedConfig(env)}catch{note("Expected config",false);return {status:"BLOCKED",checks}};
 // Input credentials are never printed; runner only receives fixed read-only commands.
 const call=(name,service,operation,args,validate)=>{
  try{const value=query(run,service,operation,args,cfg.HANDYOS_EXPECTED_REGION);
   const ok=validate(value);note(name,ok);return ok;
  }catch{note(name,false);return false}
 };
 call("AWS account","sts","get-caller-identity",[],x=>x?.Account===cfg.HANDYOS_EXPECTED_ACCOUNT);
 call("Cognito pool","cognito-idp","describe-user-pool",
   ["--user-pool-id",cfg.HANDYOS_USER_POOL_ID],
   x=>x?.UserPool?.Id===cfg.HANDYOS_USER_POOL_ID&&
      x?.UserPool?.Status!=="Deleting");
 call("Cognito public PKCE client","cognito-idp","describe-user-pool-client",
   ["--user-pool-id",cfg.HANDYOS_USER_POOL_ID,"--client-id",cfg.HANDYOS_APP_CLIENT_ID],
   x=>{const c=x?.UserPoolClient;return c?.ClientId===cfg.HANDYOS_APP_CLIENT_ID&&
     isPublicClient(c)&&Array.isArray(c.CallbackURLs)&&
     c.CallbackURLs.some(u=>u===cfg.HANDYOS_OWNER_ORIGIN+"/auth/callback")});
 call("Artifact bucket versioning","s3api","get-bucket-versioning",
   ["--bucket",cfg.HANDYOS_ARTIFACT_BUCKET],x=>x?.Status==="Enabled");
 call("Versioned Lambda artifact","s3api","head-object",
   ["--bucket",cfg.HANDYOS_ARTIFACT_BUCKET,"--key",cfg.HANDYOS_ARTIFACT_KEY,
    "--version-id",cfg.HANDYOS_ARTIFACT_VERSION],
   x=>x?.VersionId===cfg.HANDYOS_ARTIFACT_VERSION&&
     Number(x.ContentLength)>0&&x.ServerSideEncryption==="aws:kms");
 // This does not validate artifact checksum, Cognito user sub or actual IAM policies.
 // Those gates require separate trustworthy evidence.
 return {status:checks.every(x=>x.status==="PASS")?"PASS":"BLOCKED",checks,
    caveat:"Read-only metadata only; Owner sub, bundle SHA256, IAM, cost, restore and deployment NOT verified"};
}
function awsRunner(args){
 const [service,operation]=args;
 if(!PERMITTED_COMMANDS.includes(service+" "+operation))invalid("Non-read-only operation rejected");
 const raw=execFileSync("aws",args,{encoding:"utf8",timeout:15000,maxBuffer:1024*512,stdio:["ignore","pipe","pipe"]});
 return JSON.parse(raw);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=checkOwnerStaging({env:process.env,run:awsRunner});
 for(const c of result.checks)process.stdout.write(c.check+": "+c.status+"\n");
 process.stdout.write("OVERALL: "+result.status+"\n");
 process.stdout.write("NOTE: "+result.caveat+"\n");
 process.exitCode=result.status==="PASS"?0:2;
}

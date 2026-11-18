// HandyOS AWS Lightsail preflight. STRICTLY READ ONLY. Prints only HandyOS resource names;
// other ventures are represented by counts, never names or ARNs.
// No AWS credentials/SDK/network calls on import. Explicit CloudShell invocation only.
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
const REGION="ap-southeast-1";
const ACCOUNT="916004827349";
const INSTANCE="handyos-internal-01";
const ALLOWED=Object.freeze([
 ["sts","get-caller-identity"],
 ["lightsail","get-bundles","--include-inactive"],
 ["lightsail","get-blueprints"],
 ["lightsail","get-instances"],
 ["lightsail","get-static-ips"]
]);
function blocked(reason){return {status:"BLOCKED",reason,approvedToCreate:false}}
export function createReadOnlyRunner({exec=execFileSync}={}){
 return async args=>{
  if(!ALLOWED.some(a=>a.length===args.length&&a.every((v,i)=>v===args[i])))
   throw Error("Operation not in fixed read-only allowlist");
  const out=exec("aws",[...args,"--region",REGION,"--output","json","--no-cli-pager"],{
   encoding:"utf8",timeout:25000,maxBuffer:6*1024*1024,stdio:["ignore","pipe","pipe"]
  });
  return JSON.parse(out);
 };
}
export async function lightsailPreflight({run,expectedAccount=ACCOUNT}={}){
 if(typeof run!=="function"||expectedAccount!==ACCOUNT)return blocked("Expected account or runner unavailable");
 let id;try{id=await run(ALLOWED[0])}catch{return blocked("AWS identity lookup unavailable")}
 if(id?.Account!==ACCOUNT)return blocked("AWS account mismatch");
 let bundles,blueprints,instances,ips;
 try{
  bundles=await run(ALLOWED[1]);blueprints=await run(ALLOWED[2]);
  instances=await run(ALLOWED[3]);ips=await run(ALLOWED[4]);
 }catch{return blocked("Lightsail metadata read unavailable; check scoped read permissions")}
 if(!Array.isArray(bundles?.bundles)||!Array.isArray(blueprints?.blueprints)||
  !Array.isArray(instances?.instances)||!Array.isArray(ips?.staticIps))
  return blocked("Unexpected Lightsail response");
 const selection=bundles.bundles.filter(x=>
  x?.isActive===true&&Number(x.ramSizeInGb)===2&&
  typeof x.bundleId==="string"&&Number.isFinite(x.price)&&
  x.price>0&&x.price<=30&&Array.isArray(x.supportedPlatforms)&&
  x.supportedPlatforms.includes("LINUX_UNIX")
 ).map(x=>({bundleId:x.bundleId,memoryGb:x.ramSizeInGb,
  diskGb:x.diskSizeInGb,vCpus:x.cpuCount,monthlyUsd:x.price,
  ipv6Only:x.bundleId.includes("ipv6")}));
 const ubuntu=blueprints.blueprints.filter(x=>x?.isActive===true&&
  x?.platform==="LINUX_UNIX"&&/ubuntu/i.test(x?.name||""))
 .map(x=>({blueprintId:x.blueprintId,description:"Ubuntu Linux"}));
 const matchName=instances.instances.filter(x=>x?.name===INSTANCE);
 const matchIps=ips.staticIps.filter(x=>/^handyos-/.test(x?.name||""));
 const redacted=instances.instances.filter(x=>!/^handyos-/.test(x?.name||"")).length;
 const handyosInstances=instances.instances.filter(x=>/^handyos-/.test(x?.name||""))
  .map(x=>({name:x.name,state:x.state?.name||"unknown",bundleId:x.bundleId||null}));
 if(matchName.length>0)return blocked("Proposed HandyOS instance name already exists; no automatic reuse");
 if(selection.length===0||ubuntu.length===0)return blocked("No verified 2GB Linux bundle or Ubuntu blueprint");
 return {
  status:"INVENTORY_ONLY",accountMatched:true,region:REGION,
  requestedInstance:INSTANCE,approvedToCreate:false,
  eligibleBundles:selection.sort((a,b)=>a.monthlyUsd-b.monthlyUsd),
  ubuntuBlueprints:ubuntu,handyosInstances,
  handyosStaticIpNames:matchIps.map(x=>x.name),
  otherInstanceCountRedacted:redacted,
  warning:"Preflight checks published bundle prices and names only. No capacity, networking, backups, IAM, S3, Cognito or spend approval verified."
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await lightsailPreflight({run:createReadOnlyRunner()});
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
 if(result.status!=="INVENTORY_ONLY")process.exitCode=2;
}

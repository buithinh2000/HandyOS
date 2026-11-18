import test from "node:test";
import assert from "node:assert/strict";
import {lightsailPreflight} from "../../cloud/lightsail-readonly-preflight.mjs";
const id={Account:"916004827349"};
const bundles={bundles:[
 {isActive:true,ramSizeInGb:2,bundleId:"small_3_0",price:12,diskSizeInGb:60,cpuCount:2,supportedPlatforms:["LINUX_UNIX"]},
 {isActive:true,ramSizeInGb:2,bundleId:"small_ipv6_3_0",price:10,diskSizeInGb:60,cpuCount:2,supportedPlatforms:["LINUX_UNIX"]},
 {isActive:true,ramSizeInGb:4,bundleId:"medium_3_0",price:24,diskSizeInGb:80,cpuCount:2,supportedPlatforms:["LINUX_UNIX"]}
]};
const blueprints={blueprints:[{isActive:true,name:"Ubuntu 24.04 LTS",blueprintId:"ubuntu_24_04",platform:"LINUX_UNIX"}]};
function runner({identity=id,instances=[],staticIps=[],broken=null}={}){
 const calls=[];
 const run=async args=>{
  const key=args[0]+"/"+args[1];calls.push(key);
  if(broken===key)throw Error("private error should never be printed");
  if(key==="sts/get-caller-identity")return identity;
  if(key==="lightsail/get-bundles")return bundles;
  if(key==="lightsail/get-blueprints")return blueprints;
  if(key==="lightsail/get-instances")return{instances};
  if(key==="lightsail/get-static-ips")return{staticIps};
  throw Error("Non-read-only or unexpected operation: "+key);
 };
 return {run,calls};
}
test("exact expected AWS identity, Lightsail 2GB bundle and Ubuntu are read-only candidates",async()=>{
 const mock=runner({instances:[{name:"unrelated-private-name",state:{name:"running"}}]});
 const report=await lightsailPreflight({run:mock.run});
 assert.equal(report.status,"INVENTORY_ONLY");
 assert.equal(report.approvedToCreate,false);
 assert.equal(report.region,"ap-southeast-1");
 assert.equal(report.requestedInstance,"handyos-internal-01");
 assert.equal(report.eligibleBundles.length,2);
 assert.equal(report.eligibleBundles.find(x=>x.bundleId==="small_3_0").monthlyUsd,12);
 assert.equal(report.otherInstanceCountRedacted,1);
 assert.doesNotMatch(JSON.stringify(report),/unrelated-private-name/);
 assert.deepEqual(mock.calls,[
  "sts/get-caller-identity","lightsail/get-bundles","lightsail/get-blueprints",
  "lightsail/get-instances","lightsail/get-static-ips"
 ]);
});
test("wrong AWS account aborts before any Lightsail resource inventory",async()=>{
 const mock=runner({identity:{Account:"111122223333"}});
 const report=await lightsailPreflight({run:mock.run});
 assert.equal(report.status,"BLOCKED");
 assert.deepEqual(mock.calls,["sts/get-caller-identity"]);
});
test("existing names and missing metadata fail closed; no auto reuse or creation",async()=>{
 const duplicate=await lightsailPreflight({run:runner({instances:[{name:"handyos-internal-01"}]}).run});
 assert.equal(duplicate.status,"BLOCKED");
 assert.equal(duplicate.approvedToCreate,false);
 const error=await lightsailPreflight({run:runner({broken:"lightsail/get-instances"}).run});
 assert.equal(error.status,"BLOCKED");
 assert.doesNotMatch(JSON.stringify(error),/private error/);
});

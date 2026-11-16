import test from "node:test";
import assert from "node:assert/strict";
import {evaluateHandyOsStaging,guardCanonicalTemplate} from "../cloud/handyos-staging-readiness.mjs";
const account="111122223333",region="ap-southeast-1";
function res(name,kind,extras={}){
 return {name:"handyos-"+name,id:"arn:handyos:synthetic:"+name,kind,
  accountId:account,region,evidenceRef:"read-only-inventory/handyos-"+name+"-witness",...extras};
}
function fixture(){
 return {
  environment:"staging",canonicalDataModel:"isolated-postgresql-plus-private-s3",
  aws:{accountId:account,region},ownerApprovedAccountId:account,ownerApprovedRegion:region,
  protectedVentures:{core:["arn:other:core-db","buitai-core-runtime"],other:["arn:other:twolives-db"]},
  templatePaths:["cloud/canonical/handyos-staging-postgres.json"],
  resources:{
   database:res("db","rds-postgresql",{separateInstance:true,privateNetwork:true,forceRls:true,deletionProtection:true,backupVerified:true}),
   receiptBucket:res("receipts","s3-private-receipts",{blockPublicAccess:true,versioning:true,kmsEncryption:true,noDeleteRole:true}),
   receiptKms:res("receipts-kms","kms"),
   cognitoPool:res("cognito","cognito-dedicated",{pkcePublicClient:true,inviteOnly:true}),
   apiRuntimeRole:res("api-role","iam",{leastPrivilege:true,noCrossVentureTrust:true}),
   databaseSecret:res("db-secret","secret"),
   backupTarget:res("backup","independent-backup",{restoreTested:true})
  },
  cost:{monthlyEstimateAUD:35,ownerApprovedCeilingAUD:50,sourceRef:"aws-price-calculator-2026-11",ownerApproved:true},
  tests:{tenantCrossing:true,iamNegative:true,cognitoJwt:true,s3CorsIphone:true,backupRestore:true}
 };
}
test("empty/unverified manifests are NO_GO and never authorize AWS provisioning",()=>{
 for(const m of [undefined,null,{},[],{environment:"staging"},{resources:{}}]){
  const result=evaluateHandyOsStaging(m);
  assert.equal(result.decision,"NO_GO");assert.equal(result.approvedToDeploy,false);
 }
});
test("even comprehensive self-attested evidence is only proposed for independent review",()=>{
 const result=evaluateHandyOsStaging(fixture());
 assert.equal(result.decision,"EVIDENCE_REVIEW_ONLY");
 assert.equal(result.readyForIndependentReview,true);
 assert.equal(result.approvedToDeploy,false);
 assert.deepEqual(result.blocked,[]);
});
test("reject shared resource IDs and names, especially other ventures",()=>{
 const m=fixture();m.protectedVentures.core.push(m.resources.database.id);
 let r=evaluateHandyOsStaging(m);assert.ok(r.blocked.includes("ventureSeparation"));
 const n=fixture();n.resources.database.id=n.resources.receiptBucket.id;
 r=evaluateHandyOsStaging(n);assert.ok(r.blocked.includes("uniqueResourceIds"));
 const q=fixture();q.resources.receiptBucket.name="buitai-core-receipts";
 r=evaluateHandyOsStaging(q);assert.ok(r.blocked.includes("requiredResources"));
});
test("reject legacy S3-only ledger as canonical HandyOS data store",()=>{
 for(const legacy of ["cloud/staging-stack.json","cloud/lambda.mjs","cloud/owner-api.mjs"]){
  const m=fixture();m.templatePaths=[legacy];
  assert.ok(evaluateHandyOsStaging(m).blocked.includes("noLegacyDeployment"));
  assert.throws(()=>guardCanonicalTemplate(legacy),/prohibited/);
 }
 assert.equal(guardCanonicalTemplate("cloud/canonical/handyos-postgres.json"),
  "cloud/canonical/handyos-postgres.json");
 assert.throws(()=>guardCanonicalTemplate("cloud/owner-ledger.yml"),/prohibited/);
 const m=fixture();m.canonicalDataModel="s3-json-ledger";
 assert.ok(evaluateHandyOsStaging(m).blocked.includes("environment"));
});
test("reject unapproved AWS account, region and misassigned resource owners",()=>{
 const m=fixture();m.ownerApprovedRegion="ap-southeast-2";
 assert.ok(evaluateHandyOsStaging(m).blocked.includes("account"));
 const n=fixture();n.resources.receiptKms.accountId="999988887777";
 assert.ok(evaluateHandyOsStaging(n).blocked.includes("resourceOwnership"));
});
test("reject unsecured S3, public/shared DB, weak Cognito/IAM, missing restore and unaudited costs",()=>{
 const scenarios=[
 ["database","privateNetwork","noSharedDB"],
 ["database","forceRls","noSharedDB"],
 ["receiptBucket","blockPublicAccess","receiptPrivacy"],
 ["receiptBucket","versioning","receiptPrivacy"],
 ["apiRuntimeRole","noCrossVentureTrust","identity"],
 ["cognitoPool","inviteOnly","identity"],
 ["backupTarget","restoreTested","recovery"]
 ];
 for(const [resource,prop,blocked] of scenarios){
  const m=fixture();m.resources[resource][prop]=false;
  assert.ok(evaluateHandyOsStaging(m).blocked.includes(blocked),resource+"."+prop);
 }
 const cost=fixture();cost.cost.monthlyEstimateAUD=150;
 assert.ok(evaluateHandyOsStaging(cost).blocked.includes("budget"));
 const audit=fixture();audit.tests.tenantCrossing=false;
 assert.ok(evaluateHandyOsStaging(audit).blocked.includes("securityTests"));
 const evidence=fixture();delete evidence.resources.receiptKms.evidenceRef;
 assert.ok(evaluateHandyOsStaging(evidence).blocked.includes("resourceEvidence"));
});

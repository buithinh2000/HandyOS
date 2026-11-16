import test from "node:test";
import assert from "node:assert/strict";
import {assessHandyOsAwsProduction} from "../cloud/production-activation-gate.mjs";
test("default unknown AWS state always blocks deployment",()=>{
 const r=assessHandyOsAwsProduction();
 assert.equal(r.status,"NO_GO");assert.equal(r.checks.length,16);
 assert.equal(r.blocked.length,16);
 assert.equal(r.checks[0].id,"production_storage_model");
});
test("source-only S3 JSON ledger cannot count as canonical production database",()=>{
 const approvals=Object.fromEntries(assessHandyOsAwsProduction().checks.slice(1).map(x=>[x.id,true]));
 const r=assessHandyOsAwsProduction({...approvals,storageModel:"s3-json-ledger"});
 assert.equal(r.status,"NO_GO");
 assert.deepEqual(r.blocked,["production_storage_model"]);
});
test("missing isolation or approval blocks even with correct storage model",()=>{
 const evidence=Object.fromEntries(assessHandyOsAwsProduction().checks.slice(1).map(x=>[x.id,true]));
 evidence.storageModel="rds-postgresql-and-private-s3-receipts";
 evidence.isolation_verified=false;
 evidence.owner_deployment_approval=false;
 const r=assessHandyOsAwsProduction(evidence);
 assert.deepEqual(r.blocked,["isolation_verified","owner_deployment_approval"]);
});
test("all supplied evidence still does not authorize mutation",()=>{
 const evidence=Object.fromEntries(assessHandyOsAwsProduction().checks.slice(1).map(x=>[x.id,true]));
 evidence.storageModel="rds-postgresql-and-private-s3-receipts";
 const r=assessHandyOsAwsProduction(evidence);
 assert.equal(r.status,"EVIDENCE_READY_FOR_INDEPENDENT_VERIFICATION");
 assert.deepEqual(r.blocked,[]);
 assert.match(r.note,/not AWS verification or permission to deploy/);
 assert.equal(Object.keys(r).includes("deploy"),false);
});
test("truthy strings and guessed settings are not verification",()=>{
 const r=assessHandyOsAwsProduction({storageModel:"rds-postgresql-and-private-s3-receipts",aws_identity_verified:"true",owner_deployment_approval:1});
 assert.ok(r.blocked.includes("aws_identity_verified"));
 assert.ok(r.blocked.includes("owner_deployment_approval"));
});

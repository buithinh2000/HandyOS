// HandyOS AWS activation evidence gate. Source-only. NO AWS calls, secrets, deployment or live data.
// This is intentionally a validator of independent evidence, not a deployment approval.
// Canonical production = dedicated RDS PostgreSQL + isolated private S3 receipt media.
// The historical single-JSON S3 staging ledger is NOT a production database.
const REQUIRED = Object.freeze([
 ["aws_identity_verified","AWS account and region identity"],
 ["isolation_verified","Isolation from BuiTai Core and all other ventures"],
 ["rds_private_dedicated","Dedicated private HandyOS RDS PostgreSQL"],
 ["rds_rls_verified","Dedicated DB runtime role and FORCE RLS negative tests"],
 ["rds_backup_restore_tested","RDS backup and independent restore test"],
 ["receipt_s3_private","Dedicated private encrypted receipt-media bucket"],
 ["receipt_upload_authorized","Authorized receipt upload/download and file limits"],
 ["cognito_pkce_verified","Verified Owner Cognito login and PKCE"],
 ["api_owner_auth_verified","API owner authorization and negative access tests"],
 ["conflict_e2e_verified","Multi-device conflict, revision and recovery tests"],
 ["data_migration_reviewed","Explicit reversible migration from browser demo"],
 ["staging_e2e_verified","Staging end-to-end test with synthetic data"],
 ["budget_and_cost_approved","Incremental AWS costs and budget approval"],
 ["security_change_set_reviewed","Infrastructure/IAM/backup change-set review"],
 ["owner_deployment_approval","Separate written Owner approval for cloud mutation"]
]);
export function assessHandyOsAwsProduction(evidence={}){
 const model=evidence.storageModel==="rds-postgresql-and-private-s3-receipts";
 const checks=[
  {id:"production_storage_model",description:"Production uses isolated PostgreSQL, not JSON S3 ledger",status:model?"PASS":"BLOCKED"},
  ...REQUIRED.map(([id,description])=>({
   id,description,status:evidence[id]===true?"PASS":"BLOCKED"
  }))
 ];
 const blocked=checks.filter(x=>x.status==="BLOCKED").map(x=>x.id);
 return Object.freeze({
  status:blocked.length?"NO_GO":"EVIDENCE_READY_FOR_INDEPENDENT_VERIFICATION",
  blocked,
  checks,
  note:"This source-only report is not AWS verification or permission to deploy. Never change AWS resources without separate written Owner approval."
 });
}

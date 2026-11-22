# HandyOS PostgreSQL off-host backup — preparation only

The HandyOS production database is the `db` container on its **existing** dedicated Lightsail VM. PR source provides `backup-to-s3.sh`, but **does not run it**, provision AWS, install AWS CLI, grant IAM, create a bucket, configure a timer or certify any backup.

## Required evidence before first backup

1. Confirm the **dedicated HandyOS-only** backup bucket in AWS account `916004827349`, region `ap-southeast-1`. Never reuse BuiTai Core's receipt bucket, KMS key or IAM role. Bucket must have block public access, S3 versioning, default SSE-S3 (AES256) encryption, least-privilege upload identity, and an off-host retention plan.
2. Confirm the host's restricted AWS identity and the isolated bucket policy, including read-back for object verification. Do not provide AWS keys, database passwords, or sensitive records in ChatGPT or Git.
3. Confirm AWS CLI installed and `aws sts get-caller-identity` resolves to the approved account; the script fails closed if any required proof is missing.
4. Set `HANDYOS_BACKUP_BUCKET`, `HANDYOS_BACKUP_AWS_ACCOUNT` and optional `HANDYOS_BACKUP_REGION` locally. Do not commit values. Execute only after verifying account/permission/retention boundaries.

The backup streams `pg_dump --format=custom` through AWS CLI to S3 with SSE-S3 and does not intentionally leave a dump on local disk. The script checks that the resulting object exists and has nontrivial size. This **does not prove restoreability**.

## Mandatory next gate — isolated restore rehearsal

Before enabling a recurring backup timer or production auto-deploy, select one verified backup version and restore it into a separate, disposable PostgreSQL 16 test container with a *different* database volume and private network. Check schema, table counts and sampled non-sensitive row counts. Confirm isolation from `internal-db-1`, delete temporary test data securely, and preserve only redacted PASS/FAIL evidence. Do not restore into production or modify `handyos` in place.

## Status

- Code prepared: yes.
- Dedicated S3/IAM: **not verified**.
- Actual off-host encrypted backup: **not verified**.
- Restore rehearsal: **not verified**.
- Automatic backup or release timer on Lightsail: **not enabled**.

No additional AWS resources or recurring charges are authorized by this source-only change.

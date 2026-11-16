# HandyOS canonical AWS staging: isolated PostgreSQL + private receipts

**Status: SOURCE ONLY. No AWS infrastructure has been verified, deployed, created, updated or approved here.**

## Architecture choice

The historic `cloud/staging-stack.json` provisions an S3 JSON owner-ledger/Lambda prototype. It **must never** be deployed as the canonical HandyOS database. The production candidate instead requires a dedicated HandyOS RDS PostgreSQL database/instance, with runtime role separate from the table owner, `FORCE ROW LEVEL SECURITY`, independent credential in Secrets Manager, Cognito user pool and public PKCE client, a private S3 receipt bucket protected by a separate KMS CMK, and dedicated application service/IAM/CI permissions.

The BuiTai AWS account is an approved *account-sharing approach*, not approval to share secrets, databases, credentials, DB schemas, buckets, Cognito identities, application runtime, backups, log roles or deploy identities. A region chosen for another venture cannot be assumed safe for HandyOS.

## Evidence collection sequence (STOP if any step cannot be independently proven)

1. **READ ONLY**: establish the intended AWS account, region, existing resource inventory and prices using separately authorized read-only credentials. Record metadata-only resource identifiers and evidence references. Do not retrieve secret values, open customer data, generate access keys, change IAM or AWS settings.
2. **Collision check**: compare proposed HandyOS-only names, resource IDs, ARNs, security groups and role trust with all existing BuiTai ventures. Confirm no shared privileged runtime or inherited grants. Any collision is **NO_GO**, not an opportunity to reuse an existing asset.
3. **Architecture comparison**: keep legacy S3 JSON ledger template excluded from canonical staging. Plan dedicated isolated PostgreSQL, private network, least-privilege role, dedicated Cognito and receipt S3/KMS with versioning and block-public-access.
4. **Cost approval**: itemize incremental monthly charges for RDS compute/storage/backups, Cognito, S3 request/storage, KMS, application compute/logs, and network/egress. Obtain a sourced AUD estimate and an explicit written Owner-approved ceiling. Do not treat AWS credits as zero cost; show expected use and post-credit recurring cost.
5. **Source/diff review**: inspect independent IaC change set and bootstrap/rollback plan, provision through separately authorized deployment credentials only after explicit Owner approval. Never run automatic create-stack/apply from source CI.
6. **Staging verification with synthetic data**: validate Cognito PKCE callback, real issuer/app client, JWT verification, company membership access, cross-tenant negative tests, RDS FORCE RLS, S3 signed PUT/HEAD/GET and exact CORS/SSE-KMS headers on iPhone Safari.
7. **Recovery verification**: prove isolated backup and restore of RDS, media versioning and protected restore permissions, and confirm no data or IAM access crosses venture boundaries.
8. **Owner decision**: only after authenticated staging E2E and independent security review, present actionable findings and request separate, bounded approval for production changes or real-data import. Keep local demo data isolated unless a reversible, explicitly authorized migration is ready.

## Source gate

`cloud/handyos-staging-readiness.mjs` exports `evaluateHandyOsStaging(manifest)` and `guardCanonicalTemplate(path)`.

A manifest may contain proposed account/region, owner approvals, named HandyOS-only resources, known protected venture identifiers, evidence refs, isolated backup proof, negative-test results, and approved costs. The validator returns **NO_GO** with blocked controls or **EVIDENCE_REVIEW_ONLY** when the submitted data is complete. It never returns `approvedToDeploy:true`: a developer can fabricate a manifest, so the tool cannot independently certify AWS resources.

The manifest must NOT contain DB connection strings, tokens, passwords, secret values, staff data, real bill photos, S3 presigned URLs, private keys or customer details. Do not commit read-only inventory dumps if they include restricted metadata. Any deploy/change-set from this repository remains a separate owner-gated task.

## Current blockers

There is no verified dedicated HandyOS Cognito pool, privately provisioned PostgreSQL database, S3 receipt bucket/KMS configuration, production runtime, backup restoration evidence or live staging sign-in. Existing mock CI tests, an S3 JSON owner-ledger template and the source-level PKCE/UI code do not close these gates. Report the system as **NOT LIVE**.

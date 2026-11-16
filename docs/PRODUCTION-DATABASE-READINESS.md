# HandyOS real-use database activation — prerequisites and safe rollout
Status: **SOURCE-ONLY. NOT CONNECTED. NOT PRODUCTION-READY.** Checked against main source as of 2026-11-15.

## Decision
**Owner-approved account strategy (2026-11-16): use the same AWS account as BuiTai, but create and operate dedicated, isolated HandyOS resources.** Sharing the AWS account/region or a suitable existing VPC networking boundary is allowed only after verified security review; sharing BuiTai Core database/schema/tables, application runtime, IAM roles, Cognito pool, secrets, S3 buckets/object prefixes, KMS data keys, logging roles, CI deployment identity, or backups is **not** allowed. HandyOS must have its own PostgreSQL instance or database cluster with independent credentials, own Cognito pool/app client, API service/role, private versioned S3 receipt bucket, encryption key/policy and named resource tags. No changes to BuiTai Core or other ventures. This is an architecture decision, **not** approval of paid provisioning or production data migration. Keep the stack in [ARCHITECTURE.md](../ARCHITECTURE.md). The connected Supabase project is excluded from HandyOS entirely.

## Receipt media API contract (source-only, not deployed) — 2026-11-16

Canonical design: PostgreSQL owns receipt records, job link, amount, GST basis, state transitions and audit history. **A dedicated HandyOS S3 bucket** stores the photo/PDF bytes. The database stores only `receipt_object_key`, content type and optional verified metadata; **never** base64 blobs, public URLs, presigned URLs or AWS tokens.

`backend/src/receipt-media-contract.mjs` is a pure server-side validation module prepared for the future authenticated API. It is **not** an operational uploader, signed URL service or production integration. Before creating a signed PUT or GET link, the API must independently verify Cognito identity, tenant membership, owner/manager permission, and that the job and receipt belong to the same tenant using RLS-constrained PostgreSQL queries. Client-supplied identity, roles, bucket/key and permission flags are **untrusted**. The server generates object UUIDs and stores no client-provided filename in S3 paths.

Allowed MIME types: JPEG, PNG, WebP (up to 12 MiB), and PDF (up to 15 MiB). SVG/HTML and oversized objects are rejected. Keys are scoped to `tenants/<tenant-uuid>/jobs/<job-uuid>/receipts/<receipt-uuid>/<server-uuid>.<ext>`. Signed URLs expire within 180 seconds, with private S3 Block Public Access, SSE-KMS, least privilege scoped to approved tenant/job/receipt and server-side verification of uploaded size/type/encryption before marking media ready. Validate actual file signatures, image decoding, content malware scanning as applicable, quotas and metadata consistency before real use; MIME/type claims alone are not content verification.

**No duplicate cost accounting:** a homeowner reimbursement record is a pass-through item, not a Job Expense or progress payment. Changing Draft→Sent is an internal marker only; setting Reimbursed requires evidence of actual receipt and audited status transition. Never infer customer delivery from a status change. A future customer-share workflow requires separate explicit authorization and delivery confirmation.

**Existing browser demo:** photos currently live as data URLs inside browser-local JSON and must stay untouched. The S3 JSON prototype's 2 MiB save limit makes it unsuitable for full receipt history. A deliberate import must stage/verify each media object, link it atomically to the correct metadata row, preserve original backups and permit rollback. No automatic migration or AWS spending is authorized by this contract.

## Data domains and ownership
- `jobs`: canonical job identity and company partition.
- `staff_profiles`: staff directory, day/hour wage basis and default rate; never available to homeowner or worker roles.
- `crew_sessions`: Owner on-site check-in/check-out per job and date.
- `attendance_entries`: selected checked-in staff, start/finish, unpaid break, notes, rate snapshot and paid day fraction. Same worker/day cannot be paid twice in V1.
- `weekly_wage_adjustments`: bonus or other remuneration, once per week as a separate accrued wage, *not* cash payment.
- `staff_wage_payments`: actual money paid; never added again to accrued job cost.
- `material_reimbursements`: supplies paid for on behalf of homeowner; **not** contract progress payments or automatic profit expense. Draft/sent/reimbursed. Secure private S3 key only; no image bytes or public links in DB.
- `actual_tax_payments`: amounts actually paid, separate from Tax & Reserve Fund estimates.
- `audit_events`: append-only meaningful transaction evidence; API must emit events for sensitive edits/approval.

## Production go-live gates (all required)
1. **Cloud inventory and cost sign-off**: verify correct AWS account, region, billing, existing DNS/VPC/Cognito/S3/RDS. Estimate monthly RDS PostgreSQL, backup retention, S3 storage/requests, API, outbound traffic and authentication. Do not create a paid DB until an explicit budget is approved.
2. **Dedicated secure backing resources**: private PostgreSQL with backup/PITR, deletion protection and encryption; isolated tenant data and Secrets Manager runtime role; private versioned S3 bucket with KMS and Block Public Access. No public Postgres port or public bucket.
3. **Apply migrations in staging**: `001_initial.sql`, `002_rls.sql`, `003_owner_operations.sql`; migration 003 must run once only on a verified isolated database. Never execute against BuiTai Core DB.
4. **Auth/RLS/API isolation tests**: verified Cognito access token, exact tenant membership and actor role, CORS restrictive. Worker/homeowner must not see company wages, customer receipts or tax; cross-tenant attempts denied. Run `backend/test/postgres-smoke.sql` and `backend/test/operations-rls-smoke.sql` using synthetic fixtures.
5. **S3 photo service**: authenticated Owner-only upload preparation and completion; scoped presigned PUT/GET with short expiry, image content-type/size validation, object ownership checks, no publicly reachable photo URL; allow iPhone camera upload and desktop retrieval.
6. **Connect frontend to authenticated API**: page must not rely on a browser-only copy as system of record. Include idempotent writes for check-in, crew selection, check-out, weekly bonus, tax and bill status; optimistic-concurrency checks and error recovery.
7. **Owner import with explicit confirmation**: browser demo data is untrusted. Preview counts, isolate real records from demo samples, map job/staff identities, check amount/GST/bonus/reimbursement classification, import once with rollback option, and verify reconciled totals. Do not silently upload localStorage.
8. **Recovery / release gate**: prove backup restoration, private image retrieval, phone-to-desktop synchronization, TLS, and smoke tests on real devices. Only then remove the browser-only demo warning and accept private records.

## Critical accounting rules
- Example: $250/day × 4 days = $1,000 base wage; + $100 weekly bonus = $1,100 accrued wages. The $1,100 is not 'wages paid' until entered as a wage payment.
- Purchases for a customer outside the quoted contract are pass-through receivables, not contract income. A reimbursed receipt is cash collection against the receivable; GST treatment must be reviewed per transaction (not assumed).
- Staff reimbursement for work-related purchases is different from a wage bonus/allowance; it belongs in business expense/payables with a reconciled payment, not in wage earnings.
- No automated tax assessment, payroll withholding, customer emailing, invoice creation or bank payment is part of this migration.

## Current deployment status
- The GitHub Pages Owner demo is public browser-local storage and **not suitable for actual staff payroll or private receipt photos**.
- The existing backend and infrastructure are source-only; no current real AWS database, role, API, S3 bucket, public domain deployment, or iPhone-to-desktop sync has been verified here.
- This schema PR is only preparation, not a claim of production activation.

## Read-only AWS account inventory (no deployment)
Before creating or attaching any RDS, Cognito, API or S3 resource, use `cloud/handyos-aws-inventory-readonly.mjs` in an already authenticated, trusted AWS CloudShell. This does **not** use Supabase, Render or any other provider. Do **not** copy access keys into chat or GitHub.

```bash
export HANDYOS_EXPECTED_ACCOUNT='<approved-12-digit-account>'
export HANDYOS_EXPECTED_REGION='ap-southeast-1'
node cloud/handyos-aws-inventory-readonly.mjs
```

This script runs five allowed read-only AWS CLI operations: STS caller identity, EC2 VPC listing, RDS instance metadata, Cognito pool name metadata, S3 bucket name metadata. It prints only statuses/counts for resources with `handyos` in their names, not full identifiers or secrets. A wrong account **blocks before any inventory work**. Lack of read permissions returns **BLOCKED**, never bypasses permissions.

A `PASS` means only that the preflight's metadata could be read in the expected account. It does **not** confirm dedicated isolation, backup, encryption, S3 image uploads, Cognito login, cost approval or production readiness. Next step must still be a separate reviewed change set and explicit budget/owner authorization for AWS resource creation.

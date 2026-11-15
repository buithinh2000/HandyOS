# HandyOS real-use database activation — prerequisites and safe rollout
Status: **SOURCE-ONLY. NOT CONNECTED. NOT PRODUCTION-READY.** Checked against main source as of 2026-11-15.

## Decision
Keep the existing canonical stack in [ARCHITECTURE.md](../ARCHITECTURE.md): a new HandyOS-only AWS PostgreSQL database, Cognito Owner login, scoped API, and private encrypted S3 receipt photos. **Do not reuse** BuiTai Core database, IAM, production secrets, or other ventures' infrastructure. The only connected Supabase project was a separate inactive BuiTai project; it is not a HandyOS datastore.

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

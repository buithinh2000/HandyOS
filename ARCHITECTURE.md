# HandyOS — production architecture and deployment gates

STATUS: source-only AWS foundation, NOT deployed. Existing GitHub Pages pages are public browser-local demos.

## AWS account boundary — Owner decision 2026-11-16
HandyOS shares the **same AWS account** as BuiTai to avoid unnecessary account overhead, while retaining **fully independent application and data resources**. Deploying HandyOS must never alter, adopt, reconfigure, or consume BuiTai Core or any other venture's PostgreSQL data, Cognito user pool, S3 data bucket, IAM execution roles, production secrets, KMS permissions, CI deployment role, ECS task definitions, backups or domain routes. A shared AWS account is **not** permission to share a database, a privileged runtime role or secrets.

Before provision, the HandyOS-specific account inventory must show the exact account/region. Use distinct `handyos-` resource names, least-privilege IAM scoped to those resources, resource tags (Project=HandyOS, Environment=staging/prod), separate CloudWatch groups and budgets/alarms. Existing VPC networking may be considered only with a reviewed non-overlapping network/security boundary and without modifying another project's routes/security groups. Production creation, resource mutation and paid services still require a separate review and explicit spending approval. Keep all existing workloads untouched.

## Locked stack
- Cloudflare: DNS/WAF/HTTPS and frontend hosting on Cloudflare Pages. Public login assets do not contain customer data.
- AWS Cognito: verified access tokens; email sign-in, and Google federation after OAuth provider setup.
- AWS API: private business logic, per-tenant/per-project authorization, rate limits and CloudWatch logging.
- AWS RDS PostgreSQL: dedicated HandyOS DB, private subnets, backups, separate runtime credentials, FORCE RLS.
- S3: private encrypted job media, authorized presigned URLs, versioning.
- GitHub: staging CI/CD and review gates. No unaudited infrastructure production deployment.

## Canonical renovation user workflow
1. Enquiry and site survey: photos, measurements, access, risk and consent.
2. Scope builder: renovation template categories, task customisation, measurements, notes and dependencies.
3. Estimate: material takeoff, labour, subcontractors, allowances, waste, margin and GST.
4. Quote: versioned proposal, exclusions, validity, approval and document.
5. Schedule and procurement: crew, materials, milestones and sequencing.
6. Delivery: on-site tasks, timesheets, site diary, incidents and progress photos.
7. Variations: written scope change and homeowner approval before changed work.
8. Progress claims: invoices, payment events, reconciliation and reminders.
9. Handover: defects, certificates, warranties and acceptance.

## Roles and trust
Owner: company finance, users, payroll and all company jobs.
Manager: management functions within assigned company, including operational finances.
Worker: assigned jobs/tasks and allowed timesheets; NO rates, payroll, profit or cost details.
Homeowner: ONLY assigned job and explicitly client-visible tasks/documents; NO financial internal notes.
Frontend hiding alone is NOT authorization. API validates signed Cognito access token, company membership and job assignment.
Database RLS is defense in depth. Owner/bootstrap/invite workflows require privileged audited administrative process.

## Schema and API scope
backend/migrations/001_initial.sql and 002_rls.sql: tenants, memberships, jobs, job members, categories, tasks, cost entries, quotes, quote lines, progress claims, payments, audit.
backend/src/server.mjs implements only /healthz, /v1/me, GET/POST /v1/jobs, GET/POST /v1/jobs/:id/tasks.
Database role handyos_runtime must be created out of band; it must NOT own tables or have BYPASSRLS.
Old pages use separate browser localStorage and are NOT synchronized with AWS.

## Strict deployment gates
DB0: read-only AWS account/region/VPC inventory + incremental cost estimate + owner cost approval.
DB1: private HandyOS RDS, backup/deletion-protection, dedicated IAM/secrets/runtime role.
AUTH1: Cognito invite-only email login and Google OAuth after provider configuration.
API1: deployed HTTPS API; authenticates signed token and scopes each query; RLS and tenant-crossing tests.
DATA1: single domain model and migration from demo stores; safe import and verified restore.
APP1: Cloudflare Pages replaces public GitHub Pages preview; code + PKCE login + owner bootstrap.
SEC1: rate limits, WAF, CSP/security headers, scoped S3, audit redaction, staging E2E, security review.
GO LIVE: tested owner job→estimate→quote→progress claim→payment, worker isolation, homeowner isolation.

Do NOT enter real customer/employee/financial data while these gates remain pending.

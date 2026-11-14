# HandyOS V1 Release Gate — Owner-only (2026-11-15)

**Scope LOCK:** V1 has one authenticated Owner and no employee, homeowner, or partner logins. Owner enters staff hours, manages projects, materials, quotes, costs, schedules, payments, and handover. Chat, shared tasks, customer media gallery, client approvals and partner connections are V2. See ROADMAP.md.

## Deployment state
**NOT PRODUCTION.** Public GitHub Pages serves the browser-local demo.
The AWS backend implementation was merged source-only in PR #4, commit fcba365f2c5c2436cc5495dc5462e17a8953ae8d. This merge does not deploy any AWS resources.

## Verified in CI
- Node API syntax and authorization utility unit tests: PASS.
- PostgreSQL 17 real-database schema migrations: PASS.
- Tenant RLS, membership scoping, cross-tenant job visibility, tenant-bound task inserts: PASS.
- Work category/task parent consistency enforced by composite foreign key.

## Production blockers
- No AWS management connection available to this assistant for HandyOS infrastructure deployment/inventory.
- No AWS Cognito user pool, PostgreSQL instance/database, API endpoint, Secrets Manager values, or owner user verified live.
- Cloudflare connector returned HTTP 403 / code 9109 Invalid access token on zone read; cannot safely change domain or Pages in this session.
- Google OAuth provider and email sending require validated configuration.
- No full browser OAuth2/PKCE, owner-only end-to-end flow, S3 owner media, backup/restore or deployment rollback evidence.
- Worker/homeowner accounts and collaboration are explicitly **not** V1 launch requirements.
- Existing GitHub Pages repository is public. Do not put sensitive customer, worker or financial information there.

## Required V1 launch order
1. Restore authorized read-only AWS/Cloudflare connectivity, verify target account, region, DNS, existing VPC and monthly cost ceiling.
2. Provision isolated HandyOS staging Cognito, RDS, API, IAM, CloudWatch, Secrets and private S3.
3. Configure Owner identity through Cognito verified email flow; do not store passwords in source control.
4. Deploy and run migrations using a separate migration role; runtime DB role must be limited and obey RLS.
5. Integrate frontend portal with API; import synthetic job and canonical renovation categories, then test quote, costs and progress claims.
6. Run owner-only end-to-end workflow tests, unauthenticated access denial, backups, rollback and monitoring checks. Do not create worker/homeowner login accounts for V1.
7. Migrate the domain/frontend through Cloudflare only after successful smoke tests; archive/remove public demo pathways.
8. Record deployment evidence with exact URLs and test receipts before marking V1 production.
9. After owner acceptance, begin V2: employee/customer/partner identities, shared chat/tasks, stage media updates, inspections and collaborative handover.

## Safety rules
- No unapproved spend, secrets in GitHub, IAM expansion, live financial writes or production DNS changes.
- Keep BuiTai Core and other ventures completely isolated.
- Never claim live production based solely on green GitHub checks.

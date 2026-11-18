# HandyOS internal release — ONE small host (candidate, NO AWS deployment)

**Owner use case:** private VIN T job, worker payroll, Today and reimbursable bills. This is not multi-company SaaS launch. **The infrastructure is not yet provisioned.** All commands below are for an approved dedicated HandyOS host ONLY, after credentials, costs, identity and backups have been separately verified. Never run these against the BuiTai Core host/database.

## Minimal deployment shape

- DNS: `staging.handyos.buitai.com` + `api-staging.handyos.buitai.com` on the same host for staging; later `handyos.buitai.com` + `api-handyos.buitai.com` for production.
- One HTTPS Caddy gateway, one HandyOS web/API image, one PostgreSQL 16 container on Docker `private_db` bridge; **no public PostgreSQL port**. App and database only share the host, not credentials or schema with other ventures.
- Login is still HandyOS-only Cognito PKCE; S3 remains a distinct, PRIVATE HandyOS receipt bucket. Neither Cognito nor S3 exists yet according to the Owner's read-only 18 Nov inventory.
- App runs with `HANDYOS_DB_MODE=docker-private` only when DB URL targets `handyos_runtime@db:5432/handyos`. This waives TLS solely over Docker's isolated single-host bridge. All remote database URLs still require TLS with validated certificate.
- Postgres admin password is an on-host Docker secret, application password is a **different** limited runtime role. Store runtime env outside Git; `deploy/internal/private/` and backups are .gitignored.
- **Not high availability.** Single host crash causes downtime; encrypted off-host backups and a successful restore rehearsal are a mandatory GO-LIVE gate. No assumption that a VM snapshot by itself protects app data.

## One-time preparation — only after approved server exists

Install Docker Engine + Compose on a dedicated Ubuntu Lightsail VM. Harden SSH to a nominated operator source IP, configure automatic OS security updates, restrict firewall to required HTTPS/DNS validation and SSH, and verify exact HandyOS-only DNS and host OS isolation. Do **not** install on another venture's EC2/Lightsail. On that host clone the verified release SHA (not an unreviewed floating branch), then:

1. Make `deploy/internal/private` with `chmod 700`, create `db_admin_password` as a randomly generated restricted file (`chmod 600`), plus `app.env` containing the **actual verified** `DATABASE_URL`, dedicated HandyOS `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, `AWS_REGION=ap-southeast-1`, `FRONTEND_ORIGIN`, `HANDYOS_UI_ORIGIN`, `HANDYOS_API_ORIGIN`, `HANDYOS_COGNITO_DOMAIN`, `HANDYOS_COGNITO_CLIENT_ID`. Never place these values in GitHub or a chat. Use a second randomly generated runtime DB password. Do not use the PostgreSQL admin connection in the API.
2. Create local `deploy/internal/.env` (not committed) with only `HANDYOS_UI_HOST` and `HANDYOS_API_HOST`, values verified against DNS and Cognito callback. Production and staging must have separate runtime data and credentials; do not reuse the staging database as production.
3. Run `docker compose --env-file deploy/internal/.env -f deploy/internal/compose.yaml config --quiet` before deployment. On the approved host, start **only** `db` first. Provision `handyos_runtime` as a distinct LOGIN role with NO SUPERUSER, NO BYPASSRLS, NO CREATEDB and NO CREATEROLE. Set its password interactively using psql `\\password handyos_runtime`, not inline shell arguments or source code.
4. Apply existing `backend/migrations/001_initial.sql` through `011_job_contract_receipts.sql` **in exact numeric order** using a privileged dedicated database owner on the empty `handyos` database. Apply 001 first; create role before applying 002. Verify all constraints, grants and FORCE RLS under the app runtime role, not solely as superuser.
5. Bootstrap the VIN T tenant and **verified Cognito owner sub** through an audited private administration step. Do not expose public tenant registration or blindly grant owner role to a browser-supplied ID.
6. After private S3 access, Cognito, database migration, scoped credentials and HTTPS are verified, start `app` and `gateway`. Confirm `/healthz` only demonstrates a running process; separately test real login, Today check-in/out, employee/payroll, job costs, photograph upload, private image view, bill repayment and real PostgreSQL persistence. Client receipts remain disabled until private S3/KMS identity and backup are verified.
7. Run a BACKUP **and RESTORE onto an isolated test database** before accepting real staff/customer data. Schedule encrypted off-host backup retention with an explicit restore owner. Do not store only one backup on the same Lightsail disk.
8. Record exact image SHA, staging evidence, rollback command and approved spend; then perform production activation only with separate bounded authorization.

### Important safety gates

- The Owner's AWS metadata result proved **zero HandyOS-named resources** across RDS/Cognito/S3/IAM/KMS/Secrets in `916004827349`, region `ap-southeast-1`. That result does **not** prove no unprefixed resources, available compute, budget, backups or credentials. Never adopt another project automatically.
- This package does not provision Cognito, create S3/IAM keys, perform live migrations or transfer private data. A single-host compose file cannot replace authenticated backup, scoped S3 credentials and DNS/identity proof.
- HandyOS source checks, simulated browser tests and Docker build are NOT live AWS end-to-end tests. Distinguish SOURCE DONE from LIVE VERIFIED.
- No online payments, billing API, public homeowner portal, extra managers, advanced SaaS tenant management or Finance `profitReady:true` in MVP.

## Day-to-day releases

One tested Git SHA -> one image build -> one Compose app update -> HTTPS and synthetic data smoke check -> rollback to previous image if needed. No user-managed file uploads and no separate AWS account.

**Next authorization required**: exact small Lightsail/EC2 host type and monthly maximum, DNS targets, independent Cognito and S3 resource definitions, backup destination, IAM/cost guard and explicit Owner consent for the specific AWS create/update actions. Source-only PR approval is not infrastructure approval.

# HandyOS database rollout — v0.5 (not deployed)

## Current reality
GitHub Pages serves a static HTML demonstration. The three pages currently use separate browser-local stores. Creating SQL files does not create a database or connect the website to it.

## Planned isolated infrastructure
- Dedicated **HandyOS** Supabase project, ideally Australia (Sydney) region, distinct from the existing inactive BuiTai project.
- Auth: Google/email; first account is company owner; no open self-assigning roles.
- Postgres: companies, profiles, company_members, projects, job_categories, tasks, timesheets, materials, expenses, quotes, quote_lines, invoices, payments, schedule_events, messages, attachments.
- RLS: owner-only by default; deny anonymous access. No worker/client access until per-project authorization and tests pass.
- Storage: private media buckets, project-scoped RLS, signed URLs; no public media.
- Operations: migrations, backups, audit logging, data migration/export, staging tests, and GDPR/Australian Privacy Principles review before production use.

## Required security checks before applying schema
1. Validate foreign-key company/project consistency, especially on nested tables.
2. Write automated Postgres tests for cross-company, cross-project and unauthorized role access.
3. Validate authenticated user creation/bootstrap and invitations server-side.
4. Review numeric GST handling: customer quotes, ex/in GST supplier prices, withholding, refunds, variations, and invoices. Do not infer accounting profit from mixed bases.
5. Run Supabase security advisors after deployment and fix every exposure before adding frontend credentials.
6. Verify no secrets or service_role keys are committed to GitHub Pages.
7. Set up and test backup and restore.

## Roadmap
**Gate DB-0:** Select owner-approved organization and evaluate project cost. No paid service created without approval.

**Gate DB-1:** Dedicated Postgres + RLS + basic authenticated owner CRUD, schema tested with synthetic records.

**Gate DB-2:** Rewrite current scattered localStorage MVP into one central jobs/tasks/quotes/expenses model, with import flow.

**Gate DB-3:** Employee and homeowner portal with invitations, time approvals, scheduled updates and private file attachments.

**Gate DB-4:** Payment reminders, live supplier price validation, QA and business use gate.

No BuiTai Core, CabinetOS or other venture database may be reused.

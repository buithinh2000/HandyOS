# HandyOS — Product Roadmap (Owner-approved V1 scope)

## Product goal
HandyOS is a renovation/construction operations system. **V1 is single-owner use only**, for the owner's real business workflow. The V1 user is the Owner; staff, homeowner, subcontractor and partner accounts are deliberately deferred. Do not turn V1 into a generic multi-user platform.

**Canonical architecture:** Cloudflare frontend/DNS/security + isolated AWS Cognito, API, PostgreSQL, S3 and monitoring; GitHub CI/CD. No Supabase, no shared BuiTai Core database or identity.

## V1 — OWNER OPERATIONS, production priority

The Owner uses one account (initial intended email: vinb.buitai@gmail.com) to run jobs from start to finish on phone and desktop.

1. **Secure Owner login:** Cognito verified email sign-in; no password in GitHub/client source; deny unauthenticated API calls. V1 does not require Google federation, invitations or multi-user role administration.
2. **Owner dashboard:** all jobs, stage/status, receivables, cost and margin summaries, upcoming work and overdue actions; drill down into a job.
3. **Jobs and renovation scope:** create/edit jobs, client/site reference and notes; 21 trade categories, 111 starter tasks, custom categories, subtasks, task notes, dates, status and measures.
4. **Estimation and quotes:** labour, material, subcontractor, allowances, waste, unit costs, configurable markup, correct ex-/inc-GST arithmetic, versioned printable customer quote, scope exclusions, quote status.
5. **Materials:** supplier and Bunnings public price reference, date checked, manually verified values; no PowerPass integration in V1.
6. **Costing and labour:** Owner records job costs and staff timesheets/amounts (staff do NOT log in); estimated vs actual and gross margin including explicit GST basis.
7. **Schedule and progress:** Owner sets task dates, reminders/checklists, stages, notes, progress statuses, photos/video for **owner-only records** (subject to storage readiness).
8. **Payments and handover:** Owner records progress claims/invoices, amounts paid/overdue, project defects, completion and handover checklist. No customer portal/online approval yet.
9. **Operational basics:** AWS database, backups, exports, error handling, activity audit, production monitoring, staging tests and rollbacks.

**V1 main flow:** Owner signs in → creates renovation job → selects categories and edits tasks → estimates/quotes → manages work & labour → records costs and claims → monitors profitability → closes/handover. One shared project ID and backend; no disconnected browser stores.

**V1 production acceptance:** Verified Owner sign-in on two devices with the same AWS records; unauthenticated API access denied; no data leaks; Postgres migration and backup/restore verified; automated end-to-end synthetic test through the main flow; secure HTTPS and Cloudflare deployment; no real data until gates pass.

## V2 — Multi-user and collaboration (after V1 accepted)

- Employee/manager accounts, invitations, per-role job permissions, own timesheets and assignments.
- Customer/homeowner project portal and partner/subcontractor access, with independent project-level permissions.
- **Shared chat per job**, threaded discussion linked to tasks, stages, quotes and variations, with notifications and read receipts.
- **Shared task board and progress timeline**: owner, worker and homeowner can see/act only on the tasks explicitly shared with them.
- **Photos/video by construction stage**, before/during/after, owner-upload and worker-upload with client-visible flags, metadata and controlled private S3 access.
- **Stage acceptance (nghiệm thu)**: owner marks ready, shares evidence; customer accepts or requests rework; signed and timestamped decision/audit trail. Homeowner acceptance does not replace trade/statutory inspection.
- Formal quote and variation approvals, customer messages, reminders and collaborative defect closure.
- Integrations and multi-business/partner marketplace considerations after validated customer demand.

**V2 security gate:** No worker/customer can access internal margin, supplier prices, wages, other projects, private notes or media. Test direct API and signed media URLs as well as UI.

## V3 — Expansion
- Accounting integrations, deeper supplier catalogue and purchase orders.
- Advanced scheduling/resource optimization, performance insights, AI estimating and project-risk assistance.
- Commercial multi-company onboarding, subscription billing and marketplace only after V1/V2 product quality is established.

## Current verified status (2026-11-15)
Public GitHub Pages prototype has browser-local features only. Source-only AWS backend and PostgreSQL schema/tenant isolation tests have passed CI; **no verified AWS service deployment, working Cognito login or live cloud database**. The existing static demo must not be used for real sensitive data.

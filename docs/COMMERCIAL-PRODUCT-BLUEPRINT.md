# HandyOS Commercial Product Blueprint — Product Lead / UX Architect review
Status: **PROPOSED DESIGN BASELINE**, not implemented or independently validated by a hired design agency.
Date: 2026-11-16. Source of truth: current Owner V1 `owner-v1.html`, ledger `owner-ledger-core.mjs`, backend migrations 001–003, AWS architecture rules.

## 1. Problem & target
HandyOS is a **mobile-first owner-operated Australian renovation business operations product**, not a general-purpose ERP. Owner works on-site with iPhone; reviews finances on desktop; 1–20+ crew, multiple jobs, daily labour, frequent material receipts and progress payments. The app should answer in <10 seconds: **Where is everyone today? What needs action? What's coming in/out? How much did each job earn?** It must not show unrelated input forms at first view.

Three expert lenses:
- **Product Lead:** prioritise real repeated tasks, job outcomes and a coherent MVP; stop shipping isolated features.
- **UX Architect:** create one navigation hierarchy, finite workflow statuses, entry/exit paths, and clear ownership of each data record.
- **UI Design Lead:** strong visual hierarchy, consistent layouts/components, accessible touch targets and realistic empty/loading/error states.
These are review roles, **not claims of independent external human sign-off**.

### Source audit 2026-11-16
Current `main` has 4 tabs: Overview, Jobs, Employees, Expenses; compact dashboard and material-bill prototype exist. Employee calendar already supports individual start/end/break/notes, and wage basis day/hour. The team roster check-in/out and separate weekly bonus are **NOT merged into main** (abandoned/WIP branch exists); do not portray either as live. Demo persists in browser `localStorage`, not AWS production. Frontend contains many screens in one ~69k-character HTML file; stateful click handler is tightly coupled to all sections. Receipt image is embedded in browser localStorage (not safe for production). Existing AWS PostgreSQL/Cognito/S3 schemas are source-only; no production sync was verified.

## 2. Information architecture (locked proposal)

**Primary navigation on mobile (maximum five destinations):**
1. **Today** — what to do now: crew check-in/out, today's jobs, pending material bills, one-line cash/crew summary.
2. **Jobs** — searchable grouped job directory; Job detail = Overview, Schedule & Crew, Costs & Bills, Payments, Profit & History. Never show all sub-ledgers at once.
3. **People** — staff directory; individual profile = Profile, Attendance calendar, Weekly Pay, Payments & History.
4. **Money** — Company Financial Overview; Income/Progress Payments, Expenses, Material Reimbursements, Tax Paid, Job Profit and reports; date filters.
5. **More** — settings, backups, access controls, export, audit log; no hidden primary business workflow.

Desktop: persistent left sidebar with same 5 destinations, top bar for company, search/date context and quick action. No extra tab trees in Overview. **All detail views have Back breadcrumb and never lose a dirty form silently.**

Record owners:
- Attendance is recorded **once** on a Job+Employee+Date; displayed from both Today and People, not duplicated.
- Weekly bonus/other **wage allowance** belongs to Employee pay ledger, attributed to the relevant Job if needed; never treated as hours worked.
- Employer reimbursement of a worker's material purchase is not a wage bonus.
- Customer reimbursement receipt is attached to Job and shown in Money as a receivable, never mixed with contract income.
- Customer progress payment is attached to Job and shown in Money; `draft/requested/received` are separate from reimbursement stages.
- Tax paid is only actual payment; Tax & Reserve forecast is a separate budget estimate.

## 3. Six canonical user journeys / states

### US-01 — Site start, group check-in (P0, mobile ≤ 60 seconds)
As Owner, I open Today, choose today's Job, see all **active** employees preselected, untick absent staff and press **Check in** once; select start time if manually recorded. Success screen shows each selected employee, start timestamp, Job and **Checked in** status. No money posted until time/attendance is finalized.
- Exception: employee already checked in at another Job on same day → show conflict, do not write duplicate.
- Exception: offline → show **Not saved / Retry**, never misleading "Checked in".
- No GPS surveillance by default.
- With zero active employees, disable Check in and link to People.

### US-02 — Site finish & timesheet review (P0)
On Today, open active Job session; set finish time, break, optional notes, review selected crew, press Check out, then **Review & confirm**. Each worker gets one attendance entry, with day/hour rate snapshot and computed amount. A half-day is explicitly selected, not silently inferred. Idempotent second attempt does not duplicate pay. Correct mistakes from People → employee → attendance, with who/when/why audit.
Statuses: `not_started → checked_in → checked_out → reviewed`. Note: checked-out does **not** mean paid.

### US-03 — Weekly employee wages + bonus (P0)
As Owner, open People → employee → Weekly Pay, select week Monday–Sunday: count days worked (0.5/1 days), hours tracked, base wage, explicit weekly bonus, other wage allowance, **total earned**, actual payments entered, outstanding. Example **4 days × $250 = $1,000 base + $100 bonus = $1,100 earned**. Edit bonus without corrupting attendance, and retain previous closed-week snapshots. Company Money view aggregates these same records for week/month/year/all-time. Bonus is accrued **once**, allocated to one employee/week, not automatically posted to cash paid.
- Never claim legal payroll compliance or automate Australian PAYG/super from a simplistic estimate.
- Extra costs can mean two separate things: **allowance paid as wages** versus **expense reimbursement**. Require owner to select classification.

### US-04 — Buy material for homeowner (P0, iPhone ≤ 45 seconds)
Today → Capture Bill → camera/photos → Job → verify store/date/amount/GST treatment → Save Draft. Job Bills list supports **Not sent → Sent to customer → Reimbursed**, original private image, edit metadata, share *only through approved explicit delivery* later. A receipt is stored privately in AWS S3; database stores only object key and metadata. Do not call "Sent" unless actual delivery was confirmed manually or app performed sending with a receipt. Customer reimbursement is a pass-through receivable and not contract revenue. Reconciliation warns about matching existing Job Expense to prevent double counts.
- Image failure → keep draft with retry status; never pretend saved.
- iPhone & desktop show same bill only after authenticated AWS backend is live.

### US-05 — Progress payment schedule (P0)
Job → Payments → add planned milestone (Draft/not sent), edit reference/date/amount/GST, mark Requested once actual claim sent, Received only once money arrives. Distinguish **two received, one requested, one draft** without inflating cash. Editing a Received payment asks for confirmation and records history.
- Import/missing-date legacy cases must not misstate period totals.

### US-06 — Owner morning management snapshot (P0)
Today shows **crew checked in, sites today, customer bills to send, unpaid/overdue items**. Money shows selectable week/month/year/all time, four headline measures: Cash received, Payroll paid, Expenses paid, Net cash movement (cash estimate, not profit). Detailed job forecast profit, taxes paid, outstanding wages and subledger reports live below or inside Money, not as a wall of tables on Today. Job and employee rows navigate into their respective full detail record.

## 4. Navigation / page contract

| Page | Above fold | Primary action | Secondary panels / drill-in |
|---|---|---|---|
| Today | Date + Today's crew session + today’s Jobs + urgent bills | Check in / Check out | Quick capture bill; unpaid/unsent alerts |
| Jobs | Job search, status groups, top metrics | New job | Job detail with 5 meaningful tabs; no global payroll form |
| People | Staff cards/list, active status, weekly totals | Add staff | Employee detail; calendar & weekly wage snapshots |
| Money | 4 KPI, date filter, reconciliation status | Review money | Payments, expenses, bill receivables, taxes, profit/export |
| More | Settings, backup/sync status, permissions | Backup/export | Audit, data security, company profile |

**No auto-hiding financial data without discoverability**; on mobile sections use clear cards and one primary CTA per card. No homepage raw tables longer than 5 items.

## 5. Source-of-truth state & accounting invariants
- `work_session` (site Job, start/end, crew choices) and `attendance_entry` (individual verified work/pay rate) are different entities.
- A worker's daily attendance record is uniquely identified; a second click cannot silently create a second paid day.
- `pay_basis=day`: day portion × daily rate; clock hours are metadata and never added as another wage.
- `pay_basis=hour`: (end−start−unpaid break) × hourly rate; no inferred overtime/award rules.
- Weekly bonus = explicit extra accrued wage on employee/week, independent of shift count.
- Actual wages paid reduce outstanding, **not** add another expense to job forecast profit.
- Materials bought *on behalf of homeowner* remain reimbursable receivables, tracked separately from contract turnover and quoted material costs.
- Distinguish actual tax paid vs Tax & Reserve estimate, GST-inclusive/exclusive/no GST. Data ambiguity must display "Needs review," not fabricated zero.
- No destructive overwrite of payroll settlement history; retain immutable versions and audit corrections.
- Archived/finished Job edit requires reopening and audit when permitted.
- Dates use Australian local time with stored timezone context; avoid implicit UTC day shift.
- Operations that affect money require user confirmation, server-side validation, audit event and idempotency key.

## 6. Non-functional commercial standards (release gates)
- **Security:** authenticated AWS Cognito session, tenant/job-scoped authorization and RLS; worker access never exposes company wages; no public receipt URLs.
- **Isolation:** same AWS account as BuiTai, all HandyOS runtime, PostgreSQL, Cognito, S3, IAM and secrets separate; no mutations to other ventures.
- **Data durability:** real PostgreSQL + private versioned S3, backups and verified restore, protected concurrent edits.
- **Usability:** 44×44px minimum touch target; text labels for icons; accessible keyboard focus and contrast; empty/error/loading/success states; no silent edit loss.
- **Performance acceptance proposal:** Today interactive in <3s on a representative 4G iPhone, 100 staff/100 active jobs/10k receipts; benchmark not yet achieved.
- **QA:** Playwright desktop 1280px and iPhone 390px; unit tests for pay/GST and idempotency; role/tenant-negative tests; restore and offline failure checks.
- **Commercial readiness:** real user acceptance on at least 3 representative workflows (start/end shift, weekly pay, bill reimbursement), reviewed privacy policy, Australian employment/tax verification before claiming regulatory payroll compliance.
- **Release policy:** staging → QA sign-off → Owner acceptance → production; no unreviewed credentials, no auto-paid AWS deployment.

## 7. Delivery sequence (freeze features; rebuild vertical flows, not parallel code fragments)
1. **Design Gate:** approve hierarchy, journeys, interaction specs and design tokens; check mapping against current source and user screenshots.
2. **Foundations:** shared UI components, accessible responsive navigation and design tokens; remove monolithic click-handler responsibility section by section with regression safety.
3. **Today vertical slice:** real site check-in/out to employee attendance ledger, verify no double wages, weekly bonus breakdown.
4. **Bills vertical slice:** receipt photo into *private* S3 + DB; Job and Money views; separate customer reimbursement and payment claim.
5. **Money vertical slice:** coherent company KPIs and per-job financial reconciliation; period and tax views; export.
6. **Commercial AWS:** isolated authentication, PostgreSQL/RLS, S3, audit, backup, iPhone–desktop sync, acceptance tests and final launch.

No new UI code PR should be merged merely because isolated tests pass; must also pass product interaction review against this blueprint. Existing WIP `feat/owner-roster-checkin-weekly-pay-20261116` is **not authorized for merge** pending redesign and test coverage.

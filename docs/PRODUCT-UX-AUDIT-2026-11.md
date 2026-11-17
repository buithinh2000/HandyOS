# HandyOS — Product UX Audit & Commercial Design System
**18 November 2026 · Owner workflow audit · Source-only review · Decision record v1**

## Executive diagnosis — observed from source

The authenticated cloud login shell formerly mounted `handyos-today-view`, `handyos-jobs-view`, `handyos-payroll-view`, and `handyos-cloud-bills-app` consecutively inside a single `data-bills` section. Components had independently authored inline CSS, status notifications and forms. This creates a long, cognitively expensive page with no page hierarchy and multiple unrelated actions on a phone. Job detail, employee detail and bill capture do not share navigation conventions. This finding is directly established by `backend/src/handyos-login-shell.mjs` and the four view modules on main before the navigation change.

The existing cloud product is **not live**: production Cognito, PostgreSQL, S3, backup and runtime deployment are not verified. Current frontend browser testing uses synthetic backend responses, not actual field-use research. Thus this audit is a source-based expert evaluation and proposed acceptance criteria, **not** a completed user-testing certification.

## Product positioning and user roles

Primary owner: Australian renovation/trades business operator, often on site, iPhone one-handed, intermittent attention, wants fast daily check-in/out, pay settlements, purchase bill capture and job profitability.

Secondary roles: manager (within scoped grant), worker (future own timesheet view), homeowner (future controlled bill portal). **Do not expose owner payroll/profit screens to workers or homeowners.** Current cloud authenticated company picker only permits owner and manager; employee self-access is not implemented and must not be implied.

## Canonical information architecture

One level of persistent primary navigation on iPhone:
- **Today** — daily actions, outstanding attendance, shortcuts to create a bill and find a job. No payroll history or staff administration form visible by default.
- **Jobs** — list/search/filter all projects; select job to open a dedicated Job Detail view. Secondary sections: Overview, Tasks, Financials, Costs, Bills, Team, Documents/Notes. Never mix all sections on one infinitely long job page.
- **Employees** — staff list with compact role/status/base pay, select employee for profile. Secondary: Overview, Attendance, Weekly Payroll, Bonuses & Allowances, Payments, History. Add employee is a separate focused flow, not embedded under Today.
- **Bills** — private customer's reimbursable purchase queue; primary actions Capture receipt, Drafts, Ready to send, Sent, Reimbursed. Each bill belongs to one job; never count pass-through expenses as the contract's profit or as wage reimbursements.

Other later screens: **More / Settings** for business details, GST preferences, permissions, audit and backups. Do not crowd bottom navigation with low-frequency admin features. Future reports/cost views can be reached from individual jobs or secondary More menu, not become extra crowded root tabs.

### Exact navigation rules

1. Sign in → verified company selection (automatic only if exactly one eligible company) → Today. Company context shown at shell level; switching company requires server verification and clearing all company-specific UI.
2. Today → Check in/out: date defaults to local Australian date; job and staff chooser; no pay-rate editing while checking in. Pending/confirmed state must be explicit; no duplicate posts on repeated taps.
3. Today → Add receipt shortcut → Bills capture, retaining job context **only after** tenant/role check; never use a guessed ID from query string.
4. Jobs → tap row → Job Details; Back returns to previous list/filter/scroll. Job Details uses secondary segments; one section visible at a time.
5. Employees → tap row → Profile; weekly payroll inside employee; separate bonus, allowance and other worker expenses. Do not turn the employee directory into an editable payroll ledger.
6. Bills → receipt detail → image, job, purchase date, retailer, gross amount, GST basis, delivery and reimbursement status; return to list retaining filter.
7. Session expiry must present one clear sign-in action and preserve **no** sensitive session/receipt content on the device. Do not silently lose a submitted receipt and claim success.

## Primary user stories and acceptance checks

| Priority | Actor and job | Minimum UX acceptance |
| --- | --- | --- |
| P0 | Owner opens HandyOS at work | Lands Today; only Today content and four clear nav destinations; no page-length pile of unrelated forms |
| P0 | Owner checks in a worker | Select job and worker → submit → confirmation from server → visible open entry; repeat taps do not duplicate wages |
| P0 | Owner checks out a worker | Open attendance → Check out → exact confirmed time, offline/error state, wage due recalculated on next read |
| P0 | Owner photographs Bunnings receipt | Capture via iPhone camera → choose job/store/amount → server confirms image & metadata → receipt appears in drafts; upload failures never claim saved |
| P0 | Owner finds a job | Search or filter list by status/customer → tap → dedicated overview with costs and tasks |
| P0 | Owner calculates job profit | Explicit contract amount EX GST, earned staff wages, approved bonuses/allowances/expenses, paid subcontractors/materials, other expenses, customizable combined tax/reserve allocation; show assumption, profit, reimbursement pass-through separately |
| P0 | Owner settles worker weekly | Employee list → profile → week → daily pay lines + bonus + allowance + other worker expenses → actual payments → balance → close with confirmation, audit, correction path |
| P1 | Owner pays company expense | Record supplier/date/cost/GST, invoice photo, job allocation, optional expense category and payment status; never silently mix with customer reimbursements |
| P1 | Owner sends homeowner purchase bills | Select eligible receipts → share controlled invoice/link or export → record sent/due/reimbursed dates and amount; unique idempotent send and audit |
| P1 | Owner sees accounts | Separate GST-inclusive customer receipts, EX-GST revenue, outstanding progress claims, unallocated expenses, cash received, forecast profit; no double counted deposits |
| P1 | Owner corrects an error | Audited edit/void/reversal with reason; immutable payroll settlement never modified silently |
| P1 | New manager onboarded | Invited permission-scoped identity; never gets tenant membership from client-side input |
| P2 | Worker self-service | Own attendance and pay via restricted dedicated view/link; must not expose other workers' rates or homeowner bills |

## Missing data / information review — engineering gaps, not features falsely marked done

**Job:** customer name and contact, address/site, job type, owner/lead, planned vs actual dates, stage history, contract status, GST-ex and GST-in totals, variation approvals, milestones/claims, outstanding amount, photos, progress notes, cost receipts, profitability and attachments. Existing `jobs` table stores only name/code/stage/notes; these additional business fields are proposals requiring schema/API work.

**Employee:** legal/preferred name, employment category (employee/subcontractor), role/trade, phone/email, active status, start/end dates, pay basis and rate, payroll tax/super/GST considerations when applicable, allowances and bonuses (one-off vs recurring), reimbursable expenses with proof, payment method metadata kept private, audit and history. Existing `staff_profiles` stores display name, role label, pay unit, default rate and active status only. Do not invent payroll compliance or collect TFN/bank data without an explicit privacy/security design.

**Attendance:** site/job, work date, start/finish, breaks, half/full day or hours, who recorded it, edits/corrections, approval, weekly closure, original rate snapshot, duplicate prevention and clear timezone handling. Current one-attendance-per-worker-per-day uniqueness blocks multiple jobs in the same day; product design must decide multi-job allocations before promising that scenario.

**Bills:** job, retailer, purchase date, photo/PDF, GST treatment, gross paid amount, who paid, receipt number, duplicate warning, draft/sent/reimbursed/part-paid states, customer-facing export/share, reconciliation, receipt media retrieval. Current cloud view is primarily a **new receipt form**; a production queue and customer send flow are still missing.

**Job finances:** signed contract EX GST, company expenses by category, earned wages with bonuses, payment cashflow versus costs, pass-through materials, reserve percentage, final profit. `cost_entries` exists but a full job financial screen is not yet in main. Keep actual tax paid distinct from an estimated reserve allocation.

## Design system v1 — acceptance specification

- **Mobile-first:** 375/390/430px tested; bottom nav with 4 labels and safe-area support; content does not hide behind nav; content padding ≥12px; tap targets ≥44px.
- **Desktop:** max readable width 1160px, contextual navigation near top/side; no stretched full-width forms.
- **Hierarchy:** one H1 per screen, cards for summaries, only one obvious primary action per work area; secondary actions subordinate; destructive/settlement actions require confirmation.
- **Money:** right-aligned, tabular dollars AUD, two decimals; clear EX GST vs INC GST, negative balance visibly negative; no float accumulation for pay ledger.
- **Inputs:** match keyboard to type (numeric, date, camera), labels always visible, sensible default local date, inline validation, validation errors at associated fields, disable while saving.
- **Feedback:** loading/empty/error/success/unauthorized states on each module, retry without losing context; server confirmation required to claim saved.
- **Accessibility:** semantic navigation, visible focus, minimum 4.5:1 contrast for normal text where practical, screen-reader live messages, no color-only statuses, supports zoom/text scaling.
- **Privacy:** no payroll figures in worker/homeowner UI, no access token in localStorage, confirm tenant on backend, no raw secret in static assets.
- **Consistency:** shared spacing/type/color scales, button hierarchy, status banners, cards, tables, bottom navigation, date/currency formatting. Replace repeated inline style blocks with shared styles in a later UI refactor.

## Source-derived risk register (as of 18 Nov 2026)

| Severity | Risk | Action |
| --- | --- | --- |
| P0 | Four independent full modules mounted simultaneously after login | Replace with one routed/lazy workspace shell (first implementation this PR) |
| P0 | No verified real staging/production, but marketing could imply live | Explicit status and end-to-end AWS tests before real data |
| P0 | Employee/payroll information is embedded in root rather than a scoped profile | Show only under Employees; later separate actual profile tabs |
| P0 | Check-in/out on a per-worker per-day unique row prevents multi-job shifts | Decide data model/work split, add tests before changing live logic |
| P0 | Receipt new-entry form lacks send/reimburse/list and clear retry recovery | Build Bills queue and statuses, then iPhone E2E |
| P0 | Job profit not yet integrated into dedicated job details | Finish financial model with unambiguous EX GST/cost/pass-through policy |
| P1 | No source-wide interaction design system; inline CSS duplicated | Extract common components/tokens when the information architecture stabilizes |
| P1 | No audited edit/correction after settlement and incomplete job data | Design reversal/credit records, approval flow and field validation |
| P1 | No verified session restoration after full reload / lost signal | Design secure reauthentication and submission recovery; never persist bearer token in unsafe storage |
| P1 | No ongoing field usability results | Run representative owner tests on actual iPhone after private staging is live |

## Delivery sequence and autonomous review rules

1. **Navigation foundation**: one active primary module at a time, safe mobile bottom nav, logout, no eager network calls to hidden sections. Browser 390px/1280px verified against fake Cognito and API. No AWS deploy.
2. **Today workflow**: one screen for daily work; remove staff creation clutter from Today, move to Employees; add quick actions and status summaries only after data source exists.
3. **Employee hierarchy**: directory → profile → payroll/allowances/history, review accounting rules and audit/edit permissions.
4. **Jobs hierarchy**: list/search/filter → job detail → tasks/finances/costs/bills; finish owner-requested profit formula.
5. **Bills queue**: capture → drafts → sent → reimbursed, prevent duplicated uploads and preserve receipt status.
6. **Production hardening**: independently verified existing AWS-account staging/production, private HandyOS PostgreSQL/Cognito/S3, real data backup/restore, review only the sensitive activation decisions with owner.
7. **Commercial acceptance**: field task study, UX metrics and defects; owner signs off business decisions, not every engineering PR.

VIN is responsible for finding gaps proactively, writing tests, implementing improvements and checking against this product flow before merging. Source-only CI PASS is **not** a declaration of commercial usability. No new AWS account, no separate manual installer, no shared resource with BuiTai Core.

## Jobs UX iteration — 18 November 2026

The first Jobs detail improvement introduces search by name/code and a status filter in the Jobs directory, then separates Job **Overview** from **Work items** with an explicit secondary navigation. Work-item creation stays hidden until the user chooses the Tasks tab and explicitly taps Add work item. Overview only renders confirmed fields already present in the job API (name, code, stage, notes), with a clear statement that Financials, customer and documents are pending rather than making up data. Search/filter state remains in the list when returning from details within the same mounted Jobs screen. The implementation is tested via the existing synthetic iPhone/desktop browser journey. It is not yet a real-world usability certification, and production is still not deployed.

## Job Financials implementation — 18 November 2026

Within each verified job, a dedicated **Financials** tab is loaded only when selected. It shows the owner-entered **contract EX GST**, actual **company costs EX GST** (material, manually recorded labour, subcontractors, equipment, other), completed attendance wages and payroll extras, a combined customizable **tax/contingency set-aside** from the EX-GST contract, and a provisional **estimated profit EX GST**. The allocation is a management planning figure, **not** GST/BAS calculation or a record of tax already paid. A contract not yet entered or an incomplete shift is flagged as provisional, not passed off as final profit.

**Critical exclusions:** customer-material bill reimbursements remain a separate *gross* pass-through receivable and never inflate contract revenue or general company costs; wage payments are cashflow and are not counted again when wages have already been earned. General manual labour should only be entered for expenses **not represented in employee attendance**; otherwise the operator risks double-counting. A later cost reconciliation/duplicate-detection flow is required before claiming fully audited profit.

Migrations `007_job_financial_settings.sql` create tenant-scoped contract/reserve settings and harden `cost_entries` RLS to Owner/Manager. There is a separate negative RLS smoke test for worker/homeowner and cross-tenant isolation. This is **source-only**; no production DB migration or live AWS rollout is performed by these code changes.

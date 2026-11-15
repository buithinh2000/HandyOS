# HandyOS cross-chat handoff — 2026-11-15 Australia/Melbourne

> **Verified current status (GitHub source, 2026-11-15; check again next session):**
> Repository `buithinh2000/HandyOS`; observed `main` HEAD `896053bffc23889bc27fa78d51391002e9163015` (merged PR #56).
> Merged and verified GitHub PRs: #52 `596fc32` (finished/open counts), #53 `f48900e` (simplified Owner dashboard), #54 `9301c45` (root opens Owner V1, original page saved as `legacy-dashboard.html`), #55 `ebb04e5` (Overview is the default tab), #56 `896053b` (date-valid year/month filter choices).
> **Canonical UX:** `index.html` redirects to `owner-v1.html`; initial Owner tab is **Overview**; older prototypes are tucked into a collapsed footer, with legacy records untouched. Owner V1 is a browser-local synthetic-data demonstration, with **NO confirmed public Pages rollout**, **NO secure backend**, **NO real payroll/customer data**.
> **Authority boundary:** source-only corrections and CI can be self-reviewed; no new features without the Owner's feedback, no AWS/SQL/IAM/DNS, financial formula, cloud deployment, or paid-service activation by inference.
> **Verification limit:** public `github.io` URLs could not be fetched from current execution environment. Static GitHub source and CI are evidence of repository state, NOT of the user-visible deployed page.
> **Next action:** first check actual owner screenshot and source `index.html`/`owner-v1.html` plus public deployment evidence; if user reports a specific defect, fix that exact issue with regression and CI. Do not resurrect quote-first or multiple-demos homepage.

---

## Restart order
1. Read `PROJECT-BRAIN.md` (when merged), `docs/DECISION-LEDGER.md`, this handoff, `ARCHITECTURE.md`, `cloud/SECURITY-GATE.md`.
2. Verify current main SHA, open and recently merged PRs, statuses/CI. Never reuse the SHAs below as timeless.
3. Read `owner-ledger-core.mjs`, `owner-ledger-io.mjs` and applicable tests before any accounting edits; `owner-v1.html` is public browser-local demo, not cloud-authenticated.
4. Check deployment identity and permissions independently; absent confirmed live evidence means NO-GO.
5. Apply Owner's latest explicit scope: lean Owner V1, no AI / quote wizard / multi-user as current entry.

## Historical verification as originally recorded
- GitHub repo: `buithinh2000/HandyOS`; main last observed at `6c4b2f1d11697ebb8b47a772158f3a57b212c5a1` (merged PR41). Evidence: GitHub search_commits + PR41.
- PR24: merged lean Owner V1; PR23: closed UNMERGED (expanded quote QA deferred).
- PR28: merged combined Tax & Reserve Fund based on adjusted **incl-GST contract**, not on profit.
- PR40: merged read-only staging metadata preflight implementation; AWS was NOT contacted by this source-only PR.
- PR41: MERGED to main, squash commit `6c4b2f1d11697ebb8b47a772158f3a57b212c5a1`, including Project Brain, decision ledger, handoff, PR checklist, CI continuity gate and scoped VIN self-review authority. Verify this against fresh repository evidence each new session.
- `cloud/SECURITY-GATE.md`: explicit current status NOT DEPLOYED and no real customer/staff/payroll data permitted in public demo.

## Staging blockers / gates
Owner/Cognito sub and OAuth PKCE, approved account/region/budget, proper artifact + exact version and digest, private S3/KMS IAM review, CloudFormation Change Set, negative authorization tests, restore rehearsal, browser conflict tests, E2E, owner written approval for infrastructure changes. Read-only preflight script exists but output from real AWS has not been verified here.

## Historical next action (superseded by verified current status above)
This branch reconciles `PRODUCT_DESIGN_STANDARD.md` with Owner PR24: lean business manager first, prior quote-first workspace preserved as deferred. Run the continuity gate and Workspace CI on the final branch HEAD, perform VIN diff review, then source-only merge if eligible. After merge, re-verify main SHA and record result. Cloud remains NO-GO until separate authorized read-only staging preflight and all security/cost gates pass. The Project Brain CI verifies selected invariants; it does not retrieve every past chat or prove deployed runtime readiness.

## Safety boundaries
Routine source-only PRs within existing approved scope: Owner has delegated VIN self-review and merge after CI PASS + exact HEAD checks (see PROJECT-BRAIN.md). No independently approved review is required unless GitHub branch protection itself requires it. No AWS write, SQL write, IAM/secrets/DNS changes, paid APIs, synthetic data presented as real data or unverified public login claims.

## Owner V1 confirmed-booking calendar defect — 2026-11-15
A source review found `scheduleDays()` included planning/quoted jobs when they had tentative dates, contradicting PR32's confirmed-only scheduling rule. This branch filters to normalized job groups `booked` or `active`, retaining ongoing handover jobs and excluding planning and finished entries. Added regression test; existing job start/end dates and saved records are untouched. **Pending CI and merge verification.** After merge, update main SHA in the next handoff.

## Browser-local corrupt-storage safety fix (source-only proposal, 2026-11-15)
Previously, invalid JSON under `handyos-workspace-v07` was silently converted into an empty workspace; a subsequent save risked overwriting the unreadable original. This patch fails closed: disables editing/export of fictitious empty data, allows download of the exact unreadable bytes, and permits validated JSON restore. A storage-write failure now reports failure rather than silently presenting save success. Added a real-browser regression for corruption, raw recovery download and restore. No live data, AWS, auth, finance formula or backup schema change. **Pending exact-head CI and merge validation**. Public site remains synthetic-data demo only.

## Stale browser-tab overwrite guard (source-only proposal, 2026-11-15)
Review found that two open Owner V1 tabs each hold an in-memory workspace; saving the stale tab could overwrite a newer job, wage, or payment from another tab. The small UI-only guard compares the exact browser storage bytes last loaded/saved to current localStorage before normal save and confirmed JSON restore; a mismatch cancels the stale operation and reloads newer state. Includes real-browser multi-tab regression. Does not implement multi-user sync or transaction isolation across devices; public demo remains synthetic-data only. **Pending latest-head CI and source-only merge verification.**

## Payroll invalid-date period grouping fix — source-only, 2026-11-15
Review found `weeklyStart` and `workerByPeriod` used regex/date roll-over for synthetic malformed dates such as `2026-02-30`, potentially assigning hours or payments to a false wage period. This branch uses the existing strict `isISODate` checker for weekly, monthly and yearly grouping. Existing records stay untouched; source amounts/totals aren't modified. Regression test verifies invalid rows do not appear in a made-up period while valid leap/calendar dates continue to group. **Pending latest-HEAD CI and merge verification.** No AWS/production data access.

## Browser saved-data schema gate (source-only, 2026-11-15)
A parseable JSON object could contain structurally invalid records (e.g. `staff` string or missing `jobs`) and previously be normalized into an empty roster/ledger, risking later overwrite. Owner V1 startup now uses the existing strict `parseOwnerBackup` validation before loading saved bytes; malformed saved data triggers PR44 fail-closed recovery with original bytes preserved and downloads allowed. Added browser test for schema-invalid JSON and valid legacy shapes. No AWS, finances, real data or storage-key changes. **Pending exact-head CI and merge verification.**

## Date validation at payroll entry (source-only, 2026-11-15)
The Owner V1 Add Hours and Add Wage Payment controls still accepted date-shaped strings without real-calendar validation while PR46's downstream period grouping strictly rejected them. This branch applies existing `isISODate` at both entry points so bad dates cannot be appended and silently disappear from period views. Browser QA covers rejection and successful valid date entry. No change to financial formulas, saved schema, legacy records, calendar or cloud. **Pending exact-head CI and merge check.**

## Annual payroll date consistency — source-only, 2026-11-15
`wageYearSummary` had used a simple year-prefix comparison even for impossible dates in legacy labour/payment rows. This branch applies the existing `isISODate` check when a year is selected, matching PR46's strict weekly/monthly/yearly period bucketing. The unfiltered/all-time ledger and raw rows remain untouched so no financial record disappears or gets rewritten. Regression tests cover filtered annual figures and preserved all-time balances. **Pending exact-head CI and merge verification.** No AWS/production changes.

## Owner V1 expense-date input validation (source-only, 2026-11-15)
Expense entry previously accepted any nonempty date string, although monthly/year expense filters depend on the date. This branch applies existing strict `isISODate` before adding expense rows. Added real-browser regression: blank/invalid date blocks adding an expense; valid date saves normally. No changes to stored records, amounts, GST/profit arithmetic, payroll, AWS, or live data. **Verify latest HEAD CI and merge before treating this as live main.**

## Expense date-filter accuracy (source-only proposal, 2026-11-15)
After PR #50 prevented invalid expense dates at new entry, historical malformed dates could still pass year/month string-prefix filters (e.g. `2026-02-30`). This patch applies the existing strict `isISODate` to expense rows **only when year/month filters are active**. The unfiltered Owner expense totals, Job profit math, original ledger rows and stored data remain unchanged; tests cover both views. **Pending exact-head CI and merge verification.** No AWS/SQL/cloud operations.

## Company Overview legacy-finished count (source-only, 2026-11-15)
Confirmed mismatch: Jobs V1 groups stages `closed` and legacy `finished` as finished via `jobGroup`, but company Overview `Open jobs` excluded only exact `closed`, incorrectly counting finished legacy jobs as open. Switch `companySummary.open` to the existing shared `jobGroup` classifier. Regression covers current and legacy stages and capitalization. No storage or accounting formula changes, no AWS. **Pending latest-head CI/merge.**

## Owner V1 Dashboard hierarchy refresh (Owner feedback 2026-11-15)
Owner reported Dashboard looked messy/cluttered and asked for a straightforward view, not new feature scope. Source-only UI adjustment in `owner-v1.html`: Company overview foregrounds four actionable indicators and a four-column job profit list, keeps all remaining financial metrics and full seven-column cost breakdown under an expandable details section, and lets Owner open a job directly from that list. Jobs Overview keeps its stages, their counts, and calendar but opens only booked/in-progress sections by default; planning/finished groups stay available as collapsible panels. No changes to calculations, persisted state, job booking business rules, payroll, AWS or paid APIs. Browser QA checks dashboard compactness, details expansion and direct job navigation. **Pending exact-head CI, self-review and merge validation.**

## Default home entry points to Owner V1 (Owner screenshot feedback, 2026-11-15)
Owner screenshot showed the old `index.html`: stacked links to five unrelated prototypes plus the 2026 MVP Dashboard (quotes/materials/times/tasks), NOT the actual lean Owner V1 which had just received PR53 layout polish. Root `index.html` now directs visitors to `owner-v1.html` (meta refresh and JS with accessible fallback), while the entire original root HTML and all browser-only legacy storage behavior remain intact in `legacy-dashboard.html` and older tools are accessible from a collapsed footer in Owner V1. This does not migrate data between demos or delete saved browser data. Added root-path real-browser test and CI path coverage. **Source-only: no verified deployment or production approval; test CI and merge on exact HEAD.**

## Owner V1 default Dashboard entry — source-only, 2026-11-15
PR54 switched site root to `owner-v1.html`, but `owner-v1.html` itself initially opened Jobs rather than the streamlined Overview from PR53. This patch makes Overview the default section and first nav tab; Jobs, Employees, Expenses remain unchanged and accessible. Browser QA checks the initial compact dashboard with four indicators, collapsed detail section, and unchanged multi-tab write-guard test by navigating to Jobs explicitly. No stored-data migration, finance/formula changes, cloud resources or verified public Pages deploy. **Pending latest-head CI and merge verification.**

## Owner V1 date-filter options align with validated report dates (source-only, 2026-11-15)
The prior report fixes (#46, #49, #51) correctly prevent impossible legacy dates from appearing in time-filtered payroll and expense totals, but the Owner V1 Year/Month select options were still populated from unvalidated string prefixes. This branch uses the existing strict `isISODate` to build expense month/year and wage year options from actual calendar dates. Records with invalid historic dates remain in all-time ledgers and are never mutated or deleted. Browser QA verifies filter choices, filtered/overall row counts and unchanged browser storage. No financial formulas, booked calendar, schema, AWS or deploy changes. **Pending exact-head CI/self-review/merge.**

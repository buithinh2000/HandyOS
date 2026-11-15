# HandyOS cross-chat handoff — 2026-11-15 Australia/Melbourne

## Restart order
1. Read `PROJECT-BRAIN.md` (when merged), `docs/DECISION-LEDGER.md`, this handoff, `ARCHITECTURE.md`, `cloud/SECURITY-GATE.md`.
2. Verify current main SHA, open and recently merged PRs, statuses/CI. Never reuse the SHAs below as timeless.
3. Read `owner-ledger-core.mjs`, `owner-ledger-io.mjs` and applicable tests before any accounting edits; `owner-v1.html` is public browser-local demo, not cloud-authenticated.
4. Check deployment identity and permissions independently; absent confirmed live evidence means NO-GO.
5. Apply Owner's latest explicit scope: lean Owner V1, no AI / quote wizard / multi-user as current entry.

## Verified in this handoff
- GitHub repo: `buithinh2000/HandyOS`; main last observed at `6c4b2f1d11697ebb8b47a772158f3a57b212c5a1` (merged PR41). Evidence: GitHub search_commits + PR41.
- PR24: merged lean Owner V1; PR23: closed UNMERGED (expanded quote QA deferred).
- PR28: merged combined Tax & Reserve Fund based on adjusted **incl-GST contract**, not on profit.
- PR40: merged read-only staging metadata preflight implementation; AWS was NOT contacted by this source-only PR.
- PR41: MERGED to main, squash commit `6c4b2f1d11697ebb8b47a772158f3a57b212c5a1`, including Project Brain, decision ledger, handoff, PR checklist, CI continuity gate and scoped VIN self-review authority. Verify this against fresh repository evidence each new session.
- `cloud/SECURITY-GATE.md`: explicit current status NOT DEPLOYED and no real customer/staff/payroll data permitted in public demo.

## Staging blockers / gates
Owner/Cognito sub and OAuth PKCE, approved account/region/budget, proper artifact + exact version and digest, private S3/KMS IAM review, CloudFormation Change Set, negative authorization tests, restore rehearsal, browser conflict tests, E2E, owner written approval for infrastructure changes. Read-only preflight script exists but output from real AWS has not been verified here.

## Exact next action
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

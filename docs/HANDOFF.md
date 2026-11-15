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

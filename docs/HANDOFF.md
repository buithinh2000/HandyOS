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

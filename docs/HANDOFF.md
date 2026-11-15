# HandyOS cross-chat handoff — 2026-11-15 Australia/Melbourne

## Restart order
1. Read `PROJECT-BRAIN.md` (when merged), `docs/DECISION-LEDGER.md`, this handoff, `ARCHITECTURE.md`, `cloud/SECURITY-GATE.md`.
2. Verify current main SHA, open and recently merged PRs, statuses/CI. Never reuse the SHAs below as timeless.
3. Read `owner-ledger-core.mjs`, `owner-ledger-io.mjs` and applicable tests before any accounting edits; `owner-v1.html` is public browser-local demo, not cloud-authenticated.
4. Check deployment identity and permissions independently; absent confirmed live evidence means NO-GO.
5. Apply Owner's latest explicit scope: lean Owner V1, no AI / quote wizard / multi-user as current entry.

## Verified in this handoff
- GitHub repo: `buithinh2000/HandyOS`; main last observed at `6c53f9d07173df8cf78a26e05b0a905db5ee76bc` (merged PR40). Evidence: GitHub search_commits + PR40.
- PR24: merged lean Owner V1; PR23: closed UNMERGED (expanded quote QA deferred).
- PR28: merged combined Tax & Reserve Fund based on adjusted **incl-GST contract**, not on profit.
- PR40: merged read-only staging metadata preflight implementation; AWS was NOT contacted by this source-only PR.
- PR41: proposed Project Brain docs, checklist and automated source-only continuity test workflow, DRAFT and not merged when this handoff was prepared. If merged later, re-check.
- `cloud/SECURITY-GATE.md`: explicit current status NOT DEPLOYED and no real customer/staff/payroll data permitted in public demo.

## Staging blockers / gates
Owner/Cognito sub and OAuth PKCE, approved account/region/budget, proper artifact + exact version and digest, private S3/KMS IAM review, CloudFormation Change Set, negative authorization tests, restore rehearsal, browser conflict tests, E2E, owner written approval for infrastructure changes. Read-only preflight script exists but output from real AWS has not been verified here.

## Exact next action
Keep Project Brain PR in source-only review; validate documents and check the new `.github/workflows/continuity-gate.yml` run. It executes `tests/continuity-gate.test.mjs` and existing `tests/owner-ledger.test.mjs` on every PR (plus manual dispatch). On 2026-11-15, prior PR head `77e0fc4` had both Project Brain Continuity Gate and Workspace Smoke Tests **PASS** (GitHub Actions runs `43669913951` and `43669913948`). The continuity workflow was then widened to all pull requests. **Verify CI afresh at the latest head; prior green runs are not sufficient for a new commit.** The script checks selected known invariants and file presence; it DOES NOT retrieve chats, prove production readiness, or ensure every possible future behavior is correct. For cloud go-live, perform separate authorized read-only staging preflight before considering deployment.

## Safety boundaries
No auto-merge, AWS write, SQL write, IAM/secrets/DNS changes, paid APIs, synthetic data presented as real data or unverified public login claims.

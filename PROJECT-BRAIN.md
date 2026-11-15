# HandyOS Project Brain — continuity and decision contract

Status: PROPOSED / SOURCE-ONLY. This document does not establish deployment, test pass, or Owner approval on its own.
Updated: 2026-11-15 (Australia/Melbourne).

## First files to read
- [Owner decision ledger](docs/DECISION-LEDGER.md): dated decisions, source links, superseded quote-first V1 scope and precise accounting formula.
- [Cross-chat handoff](docs/HANDOFF.md): last verified snapshot, blockers and next exact work.
- [Architecture](ARCHITECTURE.md) and [Owner cloud security gate](cloud/SECURITY-GATE.md): non-negotiable production boundaries.

## Why it exists
Across chat sessions VIN must not improvise a new HandyOS scope or claim unfinished work is done. Project state lives in reviewed GitHub source, code tests, and decisions explicitly approved by Owner. Chat history provides context, not release evidence. This document is a continuity entrypoint, not a substitute for code review.

## Sources and precedence
1. Owner's explicit latest decision, with date and change rationale, for product intent.
2. Actual main branch code + merged PRs + passing tests, for implemented behavior.
3. ARCHITECTURE.md and security/deployment gate documentation for constraints.
4. This brain document for navigation, open questions, and recorded decisions.
5. Prior chat summaries as hints only; verify against the above.
Conflicts: BLOCK implementation; describe what disagrees, select no silent default, request Owner resolution only if essential. Never rewrite prior decisions retrospectively.

## Identity and scope
HandyOS is a construction/renovation business operating system. The current Owner-approved V1 entry is a lean owner-only business manager (jobs, employees, timesheets/payroll closeout, expenses, customer payments, profitability and overview); **NO AI, material takeoff, or quote wizard in the V1 entry**. This 2026-11-15 PR24 scope cut supersedes earlier quote-first design for V1. Older quote/task pages are historical/legacy; do not delete or reintroduce them by assumption. Do not turn a deferred feature into an implemented one.

## Owner V1 decisions to preserve (re-verify against code on each change)
- Employees: high-level list first; click into each employee to edit their details and review work, earned pay, paid pay and outstanding balance. Wage closeout/settlement history must be traceable.
- Employee personal share link: deferred; never present public link exposing payroll as secure functionality.
- Payments: actual cash paid by customer is different from contract revenue and GST. Support explicit excluding-GST inputs/outputs without double counting.
- Jobs: other expense classification, remaining cost estimate and unallocated overhead are needed to calculate estimated profit.
- Tax and reserve: ONE combined configurable percentage (0–100%) set by Owner, applied to **adjusted contract INCLUDING GST** (base contract plus approved variations) and subtracted ONCE from pre-reserve profit. NOT a percentage of profit, not a tax compliance assessment, and not a separate expense to subtract twice. Verified against merged PR28/PR30 and owner-ledger-core.mjs.
- Profit: adjusted approved contract excluding GST minus qualifying ex-GST costs, estimated remaining costs and unbooked overhead, then minus combined tax/reserve amount. If required inputs invalid or unclassified, show not-ready rather than fabricate profit. Compare customer cash received to adjusted contract including approved variations, not to original contract.
- Task structure: job -> main tasks -> optional subtasks; avoid artificial bulk-generated tasks.
- Scope: Owner-first flow. Multi-user/client/worker views are future stages unless independently proven deployed.

## Verified as of PR #40 review (not runtime verification)
- PR #40 was merged to main: read-only AWS staging metadata preflight source. This does NOT mean AWS was queried or resources deployed.
- Earlier PRs #34–#39 prepare a source-only Owner cloud sync/API, staging CloudFormation, deterministic Lambda packaging and guardrails. Cloud sign-in and real-data migration remain NOT VERIFIED / NOT DEPLOYED by those PR descriptions.
- ARCHITECTURE.md explicitly states source-only AWS foundation, old public GitHub Pages browser-local demos, and strict DB0/DB1/AUTH1/API1/DATA1/APP1/SEC1 gates.
- Public browser demos are NOT a safe place to enter real staff, customer or financial data.

## Security and architecture invariants
- Do not put real personal/payroll/customer records into public demos, chat, commits or logs.
- Browser UI hiding is not authorization; enforce token validation, tenant/job scope and RLS at backend when activated.
- Never claim cloud sync works until real Cognito sign-in, HTTPS API, authorized migration, restore and E2E have been independently verified.
- Do not write AWS/IAM/Secrets/SQL, change DNS, deploy, or use paid APIs as side effects of documentation work. Obtain scoped authorization when required.
- Separate demo/localStorage from any future production dataset; no silent overwrite or auto-merge of ledger records.

## Continuity procedure — MUST follow on every new chat
1. Confirm repository and default branch; read this document and ARCHITECTURE.md.
2. Inspect most recent merged/open PRs, main HEAD, test/CI status and deployment/security gate docs; date the findings. Do not assume a PR is merged merely because a URL exists.
3. For the requested feature, inspect actual source and regression tests; compare against the decision contract above.
4. Write a short before-change impact note: modules affected, data model, money/GST implications, permissions, migrations, rollback, test cases.
5. Make the smallest source-only change on a feature branch, paired with tests and docs; no unapproved cloud modifications.
6. Verify branch/head, CI and independent review before proposing merge; report pass/blocked accurately.
7. After merge, update decision/status handoff with SHA, evidence links, remaining blockers, and exact next action. Avoid repeated owner approvals for mundane source-only work within granted policy, but do not auto-merge without established authority.
8. If context is missing, stop that specific mutation and inspect code/docs instead of guessing. No fabricated statuses, completion, or deployment URLs.

## Financial acceptance tests to keep
- Cash received (incl GST) and revenue earned (ex GST) remain separate.
- Approved variations alter adjusted contract; unapproved ones do not.
- Ex-GST expense normalization avoids double subtraction and clearly labels ambiguous records.
- Earned wages, paid wages and outstanding wages reconcile without treating a wage payout as a second cost.
- Remaining future cost and overhead included once.
- Owner-controlled combined tax/reserve percentage is applied once, and missing/invalid inputs lead to 'not ready'.
- Closed job with outstanding receivables is flagged; overpayment compares against adjusted contract.

## Handoff state
Confirmed evidence: GitHub PR #40 merged, merge commit 6c53f9d07173df8cf78a26e05b0a905db5ee76bc (2026-11-15 UTC).
Current actual main HEAD, open PRs, deploy status and full CI still require a fresh check at beginning of next execution session.
Next priority: maintain documentation + code alignment, then assess staging GO/NO-GO based on read-only checks before any real-data deployment.

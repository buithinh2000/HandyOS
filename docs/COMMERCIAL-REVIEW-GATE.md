# Commercial Product Review & Decision Gate
Date: 2026-11-16 | Status: proposed product/UX standard awaiting Owner acceptance.

## Evidence reviewed
- Actual source: owner-v1.html, owner-ledger-core.mjs and ARCHITECTURE.md.
- Owner screenshots and feedback: current overview is cluttered; Jobs, Employees and Money need coherent drill-ins; daily crew check-in is priority; weekly daily pay + bonus; iPhone bill photo; AWS-only secure sync.
- External product benchmarks (design patterns only, no copied UI):
  - Deputy Timesheets: https://help.deputy.com/hc/en-au/articles/17638531661967-Understanding-Timesheets
  - Deputy time/pay approval: https://help.deputy.com/hc/en-au/articles/6997348381327-Approving-your-team-s-timesheets
  - ServiceM8 mobile job/photo history: https://www.servicem8.com/au/pricing

## Product review scorecard — CURRENT main (not a fabricated usability survey)
Score is an internal **qualitative heuristic** on observed code, not an independent designer or real-user test:
| Criterion | Current assessment | Critical reason |
|---|---|---|
| Primary navigation | Needs redesign | 4 tabs hide daily actions in different detail views |
| Today daily task speed | Blocked | group roster/check-in/out NOT merged into main |
| People hierarchy | Partial | clickable staff + attendance exist; not unified with bonus / pay review |
| Bills / mobile upload | Prototype only | localStorage image, no secure AWS cross-device storage |
| Money readability | Partial | company dashboard exists but report semantics and cash vs profit need structured screens |
| Workflow state clarity | Needs redesign | attendance, time approval, wage close and payment status overlap in UI wording |
| Source maintainability | High risk | one large Owner HTML mixes render, state, calculations and event handlers |
| Financial correctness | Partial | ledger tests exist; reimbursement and weekly bonus invariants need complete E2E |
| Mobile UX | Partial | responsive CSS and browser checks exist, no observed field usability acceptance |
| Production readiness | Blocked | AWS schemas source-only; no verified Cognito/RDS/S3 live sync |

## P0 blockers before declaring commercial-ready
1. Agree on navigation Today/Jobs/People/Money/More and canonical record ownership.
2. Owner verifies the six acceptance journeys in the blueprint with interactive prototype or staging screenshots, especially roster and weekly bonus.
3. Implement and validate check-in/checkout idempotency and per-worker wages end-to-end.
4. Secure AWS-only production persistence and S3 photos with isolated resources in shared BuiTai account.
5. Distinguish customer-bought materials from contractor materials and reimbursement from contract income.
6. Audit every cash versus earned versus paid versus profit number, including GST/no-GST and tax paid.
7. Run actual device and assisted user acceptance; do not claim human specialist review without one.

## Workflow for every future feature request / PR
1. Product Lead: state user story ID, frequency, role, trigger, expected outcome; verify prioritisation.
2. UX Architect: identify parent record, screen entry and exit, status transition, error and edit path.
3. UI Design Lead: provide 390/768/1280 screenshots, component hierarchy, empty/error/saving/saved states.
4. Engineering: independent AWS data model + API, permissions, idempotency, no regression to existing financial data.
5. QA: unit math + browser journeys + cross-tenant denial + offline/double-click/partial-failure cases.
6. Owner: approve a coherent product demo, not a sequence of tiny PRs. Implementation does not imply commercial approval.

## Current WIP handling
The unfinished branch feat/owner-roster-checkin-weekly-pay-20261116 must remain unmerged. It is not production UI or completed functionality. Adapt its verified logic only after the canonical navigation and interaction specs pass review. In parallel, no new bill/payroll UI should be forced into the homepage without passing Today task priority checks.

## Deployment boundary
Same AWS account as BuiTai, dedicated HandyOS resources, separated RDS/Cognito/S3/IAM/secrets/CI and logs. No Supabase, Render or other projects. Approval of design baseline does not authorize provisioning paid resources. Public browser-only demo cannot store real wages/receipts safely.

## HandyOS continuity / source-of-truth gate

- [ ] I read `PROJECT-BRAIN.md`, `docs/DECISION-LEDGER.md`, `docs/HANDOFF.md`, `ARCHITECTURE.md`, and relevant security gates.
- [ ] I verified current `main` HEAD, recent merged/open PRs and the actual feature source/tests (not solely chat memory).
- [ ] I identified applicable Owner decision and its evidence (PR/link); no superseded quote-first V1 scope or undeployed features were mistaken for current V1.
- [ ] I recorded impact on Jobs, Employees, payroll, payments, GST, reserve/profit, data compatibility and access permissions (or clearly marked N/A).
- [ ] I added relevant regression tests and checked CI outcomes; I have not described unrun tests as PASS.
- [ ] I explicitly stated source-only vs staging vs production status, and what remains unverified.
- [ ] No unauthorised cloud, DB, IAM, secrets, DNS, payment or paid-API mutation; no real customer/employee/payroll data in public demos.
- [ ] I updated handoff/decision log if this PR changes product intent, financial logic, architecture, or release state.

### Change rationale
What Owner decision or verified defect motivates this work? Link evidence.

### Impact and rollback
Data/GST/profit/permissions/migrations, failure scenarios, rollback path.

### Evidence
Main SHA; PR HEAD SHA; CI links/results; browser tests where applicable; AWS status if applicable.

### Next handoff
What is confirmed, still BLOCKED, and the next exact permitted action?

> This template is a checklist, not an automated test and not permission to merge/deploy.

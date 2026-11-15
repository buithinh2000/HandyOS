# HandyOS Product Design Standard — current Owner V1 and historical quote workspace

Status: **normative for current Owner V1** as of 2026-11-15. This is a source/design contract, not evidence of secure cloud deployment or of complete prior chat retrieval.

## Authority and scope
- The Owner-approved V1 scope reset was merged in [PR #24](https://github.com/buithinh2000/HandyOS/pull/24). Expanded quote browser QA [PR #23](https://github.com/buithinh2000/HandyOS/pull/23) was **closed without merge**.
- The current V1 is a **lean Owner-only business manager**: Jobs, Employees, timesheets and wage settlements, Expenses, customer progress payments, forecast Profit, job status/calendar and Company Overview.
- **Not V1 default entry**: AI quotes, material takeoff wizard, supplier integrations, multi-user accounts, client/worker chat, employee personal share links. Existing older quote/task pages and data remain intact for legacy/backlog purposes; do not silently delete them.
- Follow `PROJECT-BRAIN.md`, `docs/DECISION-LEDGER.md`, `docs/HANDOFF.md`, `ARCHITECTURE.md` and `cloud/SECURITY-GATE.md` when implementing changes.

## Current V1 default user journey
1. **Jobs list**: show all jobs with status groups (Planning/Quoting, Booked, In Progress, Finished), actual cash received, progress against *adjusted signed contract including GST*, estimated final profit when ready, and recorded schedule. Creating a job should be simple; details live in job view.
2. **Job detail**: enter base signed contract (incl GST), approved +/- variations, record actual expenses with explicit GST basis (including **Other Expenses**), record hours and hourly costs, customer payments (incl GST / ex GST / no GST), estimated remaining costs ex GST and unbooked overhead ex GST.
3. **Profit & close**: choose one combined Owner-editable Tax & Reserve Fund % (0–100) **of adjusted contract incl GST**, deducted once after normal costs. Mark forecast NOT READY if required amounts or expense tax bases are invalid. On close, require estimated remaining costs reconciled into real expenses/labour. Flag receivables outstanding at closed jobs, rather than mislabelling them paid.
4. **Employees list -> Employee detail**: create/edit roster entries, view time worked and wages earned/paid/outstanding by job and week/month/year, record actual wage payments, save non-destructive close-period snapshots. A settlement snapshot is **not another wage payment**. No public employee payroll link in V1.
5. **Expenses view**: filter by job, year, month and category; retain payment status separately from cost. Other Expenses is already a subset of the total expense ledger.
6. **Company Overview**: separate receivables, actual customer cash, ex-GST costs, accrued wages, paid wages and outstanding wages. Do not equate receipts with revenue or wages paid with a second expense.

The initial public `owner-v1.html` is **browser-local synthetic-data demo only**. No real client, employee, bank or payroll records belong in it until actual secured infrastructure, auth, backups and restore have passed independent technical verification.

## Financial design invariants
```text
adjusted_contract_inc = base_contract_inc + approved_variation_inc
adjusted_contract_ex = round(adjusted_contract_inc / 1.10)
expense_cost_ex = sum(expenses with explicitly known GST basis)
accrued_labor = sum(timesheet hours * hourly cost)
profit_before_reserve = adjusted_contract_ex - expense_cost_ex - accrued_labor
                        - remaining_cost_estimate_ex - unbooked_overhead_ex
combined_reserve = adjusted_contract_inc * owner_selected_pct / 100
final_forecast_profit = profit_before_reserve - combined_reserve
customer_balance_inc = adjusted_contract_inc - actual_customer_cash_received_inc
```
Mirror the round-to-cents behavior of the existing `owner-ledger-core.mjs`, which is the executable implementation; do not reinterpret this text to change numbers. Customer payment input supports incl GST / ex GST / no GST; persisted `amount` is **actual cash**, never multiplied twice when reading. Approved variations change the adjusted contract; not yet approved variations are not booked. Negative/invalid remaining costs and overhead, or unknown GST basis, block forecast. Cash received is not contract profit. GST is a modelling assumption, not individual tax advice.

## UI / accessibility acceptance
- List-first, detail-on-click information architecture; avoid clutter and duplicate job navigation.
- Keep entry forms short and reveal advanced fields only when needed; labels identify dollar units and GST basis.
- Clear empty, edited, error, closed and legacy data states. Never silently overwrite previous employee, job or financial data.
- Keyboard accessible, sufficient contrast and touch targets. Test 360px/768px/1280px viewport and real mobile/desktop browser journeys before claiming visual QA.
- Calendar shows only confirmed recorded bookings. Empty days do not guarantee crew availability; tentative quoted dates are not automatically bookings.

## Engineering and release quality
- Preserve legacy localStorage data key and records until an explicitly reviewed reversible migration; no undocumented automatic conversion.
- Add regression tests for GST, reserve, adjusted contract, wages, close rules, invalid inputs and no double-counting.
- For normal source-only work, VIN performs self-review, checks PR-head CI, checks conflicts/branch protection, documents evidence and may merge within Owner's delegated authority. Do **not** represent this as independent reviewer approval.
- Infrastructure, paid APIs, real data, changes to financial formulas, IAM, DNS, SQL and production go-live are **not** authorized merely by source-only delegation.
- Production roadmap requires real Cognito PKCE, exact-Owner authorization, private encrypted storage, restore test, HTTPS, E2E and documented cost/deployment gates. Cloud adapter code does not make the public demo secure.
- Explicitly mark Source-only / Staging / Production status and limitations; validate the published site before saying a change is live.

## Deferred / historical quote-first design (not current V1 default)
Earlier [PR #19](https://github.com/buithinh2000/HandyOS/pull/19) through [PR #22](https://github.com/buithinh2000/HandyOS/pull/22) established a guided job-to-quote workspace with main tasks, optional subtasks, material identity/SKU/supplier provenance, quantity/pack/wastage calculation, quote costing, deterministic warnings and optional review. Those historical requirements **remain** for the legacy workspace / later separately approved phase; do not label them as newly activated Owner V1.

When eventually revisited, preserve these technical safeguards:
- Main trade tasks do not auto-generate a 100-item checklist; subtasks are opt-in and legacy IDs/prices are retained.
- Material products need exact brand/specification, supplier SKU if available, source/store/checked date, GST basis and verification state. Provisional prices must not be called verified live prices.
- Purchase packs are rounded up only after consistent unit conversion and explicit wastage assumptions; invalid units block estimation.
- Actual timesheet/cost transactions stay separate from preliminary quote allowances; flag possible material/labour double counting.
- Deterministic quote review is not generative AI. Supplier APIs, real stock/orders or paid models require separate authorization.

## Evidence and change history
- [PR #24](https://github.com/buithinh2000/HandyOS/pull/24): Owner V1 scope reset.
- [PR #25](https://github.com/buithinh2000/HandyOS/pull/25) through [PR #33](https://github.com/buithinh2000/HandyOS/pull/33): payroll, GST, reserve, remaining costs, variations, overview and payments.
- [PR #41](https://github.com/buithinh2000/HandyOS/pull/41): Project Brain, cross-chat handoff, continuity CI and routine VIN self-review policy.

# HandyOS Owner decision ledger — evidence-linked

Status: reconstructed from Owner conversation context and merged GitHub changes; this is not a transcript of all chats. Entries citing PRs are verified against PR descriptions and selected current code. Do not claim complete recall of every discussion.

## Evidence rules
- **Approved product intent**: Owner decision, when direct conversation evidence is available, and the PR that implements it.
- **Implemented in source**: confirmed from current code or merged PR. Source != deployed.
- **Deferred/rejected**: never quietly reintroduce without explicit new Owner decision.
- When design docs and later Owner-approved scope conflict, later scope takes priority for V1 while old docs remain historical references.

| Date (Australia/Melbourne) | Decision and reason | Evidence | Status |
|---|---|---|---|
| 2026-11-15 | V1 scope reset to lean Owner business manager: Jobs, staff, labour, expenses, progress payments, closings, estimated profit, overview. No AI, material takeoff or quote wizard in Owner V1. Reduce burden and deliver a usable core first. | [PR 24](https://github.com/buithinh2000/HandyOS/pull/24), [PR 23](https://github.com/buithinh2000/HandyOS/pull/23) | PR24 merged; PR23 closed unmerged; old quote workspace may remain but is NOT V1 entry |
| 2026-11-15 | Owner-only V1. Worker/client/partner accounts, chats, approvals and personal employee links deferred to V2; protect payroll/client data. | PR24; ARCHITECTURE.md future roles | Scope locked; cloud auth not live |
| 2026-11-15 | Employees list -> individual employee details, week/month/year earned wages, actual paid wages and outstanding balance; closings are historical snapshots not extra payments. | [PR25](https://github.com/buithinh2000/HandyOS/pull/25), [PR27](https://github.com/buithinh2000/HandyOS/pull/27); owner-ledger-core.mjs workerTotals, periodSettlement | Merged source/demo |
| 2026-11-15 | Input progress payments as inclusive GST, exclusive GST (+10%), or no GST. Keep stored amount actual cash received; do not multiply legacy inclusive amounts again. | [PR27](https://github.com/buithinh2000/HandyOS/pull/27); owner-ledger-core.mjs customerPayment/paymentBreakdown | Merged source/demo |
| 2026-11-15 | Combined Tax & Reserve Fund is one Owner-editable 0–100% per job, not a fixed 15%, not a statutory tax. **Basis is adjusted contract INCLUDING GST** after approved variations, deducted once from pre-reserve forecast profit. | [PR28](https://github.com/buithinh2000/HandyOS/pull/28), [PR30](https://github.com/buithinh2000/HandyOS/pull/30); owner-ledger-core.mjs summary | Merged; crucial arithmetic |
| 2026-11-15 | Remaining Costs are ex-GST forecast not yet incurred; reconcile to actual costs, block closing if future costs remain, no double count. | [PR29](https://github.com/buithinh2000/HandyOS/pull/29); owner-ledger-core.mjs canClose | Merged source/demo |
| 2026-11-15 | Approved variations (+/-) are included in adjusted GST-inclusive contract; unbooked overhead is ex GST; both flow through final forecast and receivables without double expense. | [PR30](https://github.com/buithinh2000/HandyOS/pull/30); owner-ledger-core.mjs summary | Merged source/demo |
| 2026-11-15 | Jobs grouped Planning/Quoting, Booked, In Progress, Finished. Tentative quote dates are not bookings. Calendar only shows recorded confirmed jobs; empty day not guaranteed availability. | [PR31](https://github.com/buithinh2000/HandyOS/pull/31), [PR32](https://github.com/buithinh2000/HandyOS/pull/32) | Merged source/demo |
| 2026-11-15 | Compare received cash to adjusted signed contract, not original; warn overpayments and closed outstanding receivables. | [PR33](https://github.com/buithinh2000/HandyOS/pull/33); owner-ledger-core.mjs summary | Merged source/demo |
| Prior to reset | Jobs -> main tasks -> opt-in subtasks, avoid auto-generating huge trade checklists; exact product/price review in legacy quote workflow. | [PR19](https://github.com/buithinh2000/HandyOS/pull/19) to [PR22](https://github.com/buithinh2000/HandyOS/pull/22); PRODUCT_DESIGN_STANDARD.md | Historical/legacy, not current V1 priority |
| 2026-11-15 | Isolated AWS+Cloudflare deployment, no shared Core data/roles; source-only cloud sync with independent security gates before real data. | [PR34](https://github.com/buithinh2000/HandyOS/pull/34)–[PR40](https://github.com/buithinh2000/HandyOS/pull/40), cloud/SECURITY-GATE.md | Source prepared; NOT DEPLOYED |

## Current mathematical decision contract (from main owner-ledger-core.mjs)
```text
adjusted_contract_inc = base_contract_inc + approved_variation_inc
adjusted_contract_ex  = adjusted_contract_inc / 1.10
actual_cost_ex = sum(known-basis expenses_ex) + accrued_labor
profit_before_reserve = adjusted_contract_ex - actual_cost_ex
                        - remaining_cost_estimate_ex - unbooked_overhead_ex
reserve = adjusted_contract_inc * owner_tax_reserve_pct / 100
final_forecast_profit = profit_before_reserve - reserve
customer_balance_inc = adjusted_contract_inc - actual_received_cash_inc
```
Currency rounds to 2 decimals at defined intermediate steps. If contract, variation, reserve rate, remaining cost, overhead or expense GST basis invalid, the final estimate must be NOT READY. Paid wages are settlement against accrued labour, not an additional wage cost. 'Other Expenses' is a subtotal of total expenses, not an extra cost.

## Documentation reconciliation
`PRODUCT_DESIGN_STANDARD.md` is being reconciled in this source-only branch so the current Owner V1 default matches PR24. Earlier quote-first standards remain explicitly preserved as historical/deferred requirements. Verify merge before describing this change as canonical on `main`.

## Unknown and not to fabricate
Complete verbatim old chat histories, Owner's reasons for every minor PR, exact live AWS account/role resource state, full test-run matrix, CI status of this new documentation branch and any live security verification are NOT fully established here. Collect evidence when needed instead of marking PASS.

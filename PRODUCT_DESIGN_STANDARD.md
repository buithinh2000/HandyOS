# HandyOS Product Design Contract — Owner V1

Status: **normative design baseline**, 2026-11-15. This document defines acceptance gates; it does not claim that current demo is production ready.

## Product and target user
HandyOS V1 serves one Australian renovation-business Owner who needs quick on-site scoping and reliable estimates, plus ongoing jobs, labour, costs and payments. V2 collaboration (workers, clients, partner chat, stage acceptance) is outside V1.

## Evidence-based user stories
- **US-01 Start a job:** As an Owner, I can create a job with only a name so I do not complete a large form at the site; reference, notes and deadline remain optional.
- **US-02 Structure work:** As an Owner, I add one primary trade/task (e.g. Bathroom) at a time. It NEVER inserts all template steps without consent. Each main task can have zero or more visible, user-selected subtasks; legacy main tasks are retained unchanged.
- **US-03 Cost materials:** I enter exact product description/specification, preferred supplier (default Bunnings), SKU/I/N where known, required quantity and unit, pack coverage, wastage and owner-checked provisional shelf price. The system rounds *purchase units* up, converts incl-GST shelf prices to ex-GST estimating cost under an explicit 10% assumption, and displays source/store/date uncertainty.
- **US-04 Build estimate:** I can distinguish priced scope tasks, material takeoff, labour allowance, other allowance, contingency, markup and tax. Actual timesheets and costs are separate from estimated allowances.
- **US-05 Review draft:** I see explainable warnings for missing exact product code, price, store, scope, and possible duplicates. A deterministic rule engine cannot claim it is a generative AI model or silently alter amounts.
- **US-06 Operate business:** I can review multiple jobs, status, deadline, payments received and expenses. Draft quote is not booked revenue, invoices or collectible debt.

## Default journey and information architecture
1. **Projects / Job switcher:** select current job or create with one field.
2. **Tasks:** add a main task; optional suggested subtasks live immediately below that task. Editable task costs are secondary details.
3. **Materials:** primary form is material identification, quantity, pack size, provisional GST-inclusive shelf price. Supplier provenance, wastage and units are progressively disclosed (defaults must remain visible in labels/help).
4. **Quote:** material + scoped work + separate allowances + contingency + markup + assumed GST; show basis explicitly.
5. **Review:** human-verifiable findings; owner decides.
6. **Business tools:** job overview, actual costs, labour, payments, deadlines and company dashboard are secondary navigation, not simultaneously presented with quote workflow.

Do NOT show duplicate navigation bars for the same job stage, a 100-item checklist on job creation, or financial dashboards above the task entry form. Long forms require progressive disclosure, not hiding critical values or defaults.

## Visual and interaction quality
- Use coherent font stack, type scale, spacing and contrast; clear one primary action per step.
- Desktop and narrow-phone layouts must not overflow horizontally; tables may scroll inside their container.
- Text inputs have visible labels, clear units, safe defaults; all destructive actions have confirmation or scoped undo.
- Default workflow must work without knowledge of building software terms, and without template selection.
- Do not conflate task completion with subtask completion.
- Preserve keyboard navigation, logical focus order, semantic labels and touch targets.
- Validate with 360px, 768px, and 1280px screenshots plus a manually run real-browser journey before claiming visual QA **PASS**. Node VM tests alone never justify this claim.

## Financial correctness & product data
- Product identity includes manufacturer/brand, size/thickness, pack coverage, unit and supplier SKU when known. Similar names are NOT verified substitutes.
- Prices must carry currency, tax basis, supplier, source URL where available, store/location, checked date and verification state. Never autofill a guessed quote as a verified supplier price.
- Ex-GST calculation is a conditional tax assumption. VAT/GST differences, zero-rated items and multi-tax invoices require explicit handling before production issue.
- The material count is ceil(required quantity * (1 + waste pct/100) / pack coverage) when units match. Unknown/invalid values must block rather than silently produce plausible totals.
- A cost cannot be included in both task unit cost and separately listed material/labour without an explicit warning.
- Never present draft quote less recorded deposits as confirmed receivables; commercial lifecycle needs accepted quote/contract, claims/invoices and payments linked.

## Technical architecture and security
- V1 is Owner only; production login uses Cognito, backend API validates JWT and enforces tenant identity. Database row-level boundaries and transactions must be tested with real PostgreSQL.
- Public GitHub Pages/localStorage workspace is **synthetic-data demo only**; no real client, payroll or financial data until deployed private backend, backups, HTTPS, authorization and recovery checks.
- AWS services and secrets isolated from BuiTai Core and other ventures. No Render, Supabase, unapproved paid APIs or accidental shared IAM credentials.
- API contract, schema migrations, validations, audit log, errors and backward-compatible import/export documented before implementation. Cloud deployment must have budget and security gates.
- Do not scrape suppliers as if it were an authorized API; API/stock/order features deferred.
- Quote review V1 is deterministic rules, not generative AI. Any future LLM must use an explicit opt-in/backend cost gate, grounded input, read-only draft suggestions and Owner confirmation.

## Definition of Done (per user-facing feature)
1. Trace feature to a user story, user journey and business rule.
2. Add design rationale and states: empty, populated, error, loading, mobile and legacy.
3. Update schema/API if necessary with migration and authorization review.
4. Pass automated tests for monetary arithmetic, storage/import, compatibility, failure cases, DOM interactions.
5. Check full workflow in an actual browser; verify screenshots at mobile/tablet/desktop; record observed issues.
6. Verify security, cost and deployment boundaries. Confirm CI and merge status. Test published website before claiming live release.
7. State what is completed, what remains demo-only, and specific limitations.

## Release gates
**Source-only:** PR review, relevant unit tests and CI PASS. **Staging:** real browser UI walkthrough, backend integration, private login and deployment receipts. **Production:** tenant isolation, recoverable backups, audit logging, monitoring, cost controls, owner acceptance, legitimate client data path, documented rollback.

## Explicit non-goals for this design pass
No paid model, supplier API, order placement, stock checking, worker/client login or unverified production launch. No change to existing localStorage key or deletion of legacy job/task data.

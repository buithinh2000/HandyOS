# HandyOS Commercial Design System v1
Status: PROPOSED, not yet implemented or signed off by an independent human designer.
Companion: COMMERCIAL-PRODUCT-BLUEPRINT.md

## Product look and feel
HandyOS is a calm, premium, mobile-first field operations workspace for an Australian renovation business. The visual experience must prioritise today's work, not an enormous spreadsheet. Dark navy text, pale grey backgrounds, white cards, one blue primary action per area, semantic status colours, no decorative badges or giant accountancy tables on the homepage.

### Information hierarchy
- iPhone bottom navigation, 5 choices maximum: Today, Jobs, People, Money, More.
- Desktop left sidebar with the same 5 destinations and a context header.
- Today: work date, job chooser, crew check-in/out, urgent bills, quick capture, exceptions.
- Jobs: search/list → one Job detail with Overview, Schedule & Crew, Costs & Bills, Payments, Profit & History.
- People: staff directory → one employee profile with Profile, Attendance, Weekly Pay, Payments & History.
- Money: period selector + cash KPI → individual receivables, wages, expenses, taxes, cash flow and job profit reports.
- More: company setup, backup, audit, sign-in and settings.
One canonical record per Job, employee, receipt or wage adjustment; no detached duplicate views.

## Proposed design tokens (require accessibility verification)
| Token | Value | Use |
|---|---|---|
| page | #F5F7FA | app background |
| card | #FFFFFF | content surface |
| ink | #162D3F | primary text |
| body | #30465A | secondary text |
| muted | #60778A | supporting text |
| border | #DEE5EC | dividers |
| primary | #155F8A | primary CTA |
| success | #17764C | confirmed saved / completed |
| warning | #A46516 | needs attention |
| danger | #B43C3C | error / destructive |
| card radius | 14px | content cards |
| control radius | 9px | form fields |
| spacing | 4 / 8 / 12 / 16 / 24 / 32px | consistent gaps |
| minimum touch target | 44×44px | accessible mobile interaction |

System sans-serif font; heading H1 24–28px, section 18–22px, body 14–16px, financial values 23–28px with tabular numerals. These are PROPOSED values; verify actual contrast ratios and touch ergonomics.

## Reusable components
| Component | Purpose and essential states |
|---|---|
| AppShell | navigation, identity, Saved to AWS / offline / expired |
| PageHeader | screen title, date, one primary action |
| KpiCard | label, value, period, source and cash/estimate distinction |
| CrewSelector | all active staff ticked, untick absence, selected count, conflict |
| ShiftEditor | start, finish, unpaid break, notes, 0.5/1 paid day |
| StaffRow | name, trade, today's state; tap to detailed staff ledger |
| WeeklyPaySheet | base, bonus, other pay, earned, paid, outstanding |
| ReceiptCard | image, Job, store, amount, not sent/sent/reimbursed |
| JobCard | Job title, stage, next action, cash received |
| MoneyLedger | searchable filterable accounting entries and drill-ins |
| FormShell | Save/Cancel, inline validation, dirty draft warning |
| Status | text with colour only when meaningful |
| SyncBanner | saved / pending / failed and recovery action |
| EmptyState | concise next step |
| ConfirmDialog | plain impact before changing money or deleting |

## Standard state and interaction rules
- Attendance: Not started → Checked in → Checked out → Reviewed. NOT equivalent to Paid.
- Weekly wages: Earned, Paid, Outstanding. Bonus and allowance must be separate from attendance and from employee purchase reimbursement.
- Contract payment schedule: Draft → Requested → Received.
- Homeowner material receipt: Not sent → Sent → Reimbursed.
- Job: Planning → Booked → In progress → Finished.
- No money or timesheet auto-save without explicit confirmation and server acknowledgment.
- All money edits require history and correctly updated summaries; no silent duplicate POST.
- Use native or accessible form controls, contextual labels, proper decimal keyboards on phones; avoid JavaScript prompt for real production work.
- Back / another day / tab change cannot silently discard hours, notes, price or status.
- Show a success banner only after the AWS API confirms saving. Offline means pending and not yet secured.
- Never store payroll or real receipt images in browser localStorage after production activation.

## Proposed 390px iPhone wireframes

### Today
HandyOS                      Profile
Today · Monday 16 November
[Choose today's job]
Crew today 5 of 6 selected
[x] Alex  [x] Lee  [x] Sam
[x] Kim   [x] Ben  [ ] Pat (away)
[Check in selected crew]  PRIMARY
--------------------------------
Attention needed
2 material bills not sent  [View]
1 customer payment pending [View]
[Capture material receipt]
Bottom nav: Today | Jobs | People | Money | More

If a crew shift is active, replace Check in with Check out & review. Never show Check in and Check out simultaneously for the same session.

### Staff profile
< People            Alex · Carpenter
Tabs: Attendance | Weekly Pay | History
Week 16–22 Nov
4 days at $250              $1,000
Weekly bonus                  $100
Other wage pay                  $0
Earned                      $1,100
Paid                          $900
Outstanding                   $200
[Review / close week]
All amounts are illustrative, not legal/payroll compliance advice.

### Material bills in Job
< Jobs             Bathroom Renovation
Tabs: Overview | Schedule | Bills | Payments | Profit
Not sent $110  Sent $220  Reimbursed $330
[Capture receipt]
[Photo thumbnail]  Paint Store   $110
Status: Not sent  [Edit] [View]

### Money
Money                        [Week filter]
Cash received       $...
Wages paid          $...
Expenses paid       $...
Net cash movement   $...
Report sections: Payments | Payroll | Expenses | Tax | Profit
Company cumulative numbers and deep forecasts live here, not on Today.

## Approval and QA checklist
1. Product owner validates story and navigation route for each critical daily task.
2. UX architecture validates every start, success, failure, cancellation and return path.
3. Visual review includes screenshots at 390px, 768px and 1280px, not just DOM counts.
4. Accessibility verifies 44px touches, contrast, keyboard focus, semantics and screen-reader labels.
5. Accounting tests reconcile company and staff wages to Job detail, bonuses once, no double counting cash expenses.
6. Security tests validate AWS tenant isolation and private S3 images.
7. Mobile tests cover photos, check-in/out, editing records and interrupted network requests.
8. No production release without AWS sync, restore, audit and user acceptance of the principal journeys.

## Design-to-code enforcement
Any HandyOS UI PR must link user story ID in COMMERCIAL-PRODUCT-BLUEPRINT.md, identify affected screens, show before/after screenshots, list changed financial invariants and provide real-browser regression and back-navigation tests. No more feature-by-feature patches to a monolithic Owner Overview unless they pass the coherent product design review.

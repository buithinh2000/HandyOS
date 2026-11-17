# Historical attendance entry — Owner workflow (source-only, 2026-11-18)

## Why
Owner may forget yesterday's check-in. The existing date picker previously displayed a past date but POST /v1/attendance/check-in stamped **current server time** on historical work_date and a subsequent checkout also stamped current time. That risks bad hourly wages. Never claim that merely selecting yesterday safely records a worked day.

## UX contract
- Today opens at the Australian device's local work date. The date picker can browse earlier days.
- Today: normal live check-in and check-out.
- Past date: hide live check-in; show **Record missed attendance** with original Job/Employee selectors plus actual start, finish, unpaid break (minutes), half/full paid-day, notes. Submit one completed row. Confirm via server and refresh selected date.
- Future date: read-only.
- Past-dated open attendance cannot be checked out with today's clock; such entries require a separately audited correction workflow.
- A worker already recorded on the selected date cannot receive a duplicate wage entry. A closed payroll week cannot be backfilled; prompt Owner to use future authorized reversal/correction process.

## Backend and data
- POST /v1/attendance/backfill requires verified Owner/Manager JWT/tenant and PostgreSQL FORCE RLS transaction. Accepts jobId, staffId, workDate, timestamp strings with explicit timezone, breakMinutes (0..600), paidDayPortion (.5 or 1), notes.
- Both start/end timestamps must resolve to the selected date **in Australia/Melbourne**, be strictly ordered, with break less than shift duration. Server clock determines whether the date is in the past; no future or today's backfill.
- Wage rate is snapshotted only from private staff record. No browser-supplied wage rate. Existing uniqueness and payroll week advisory lock/closure protect against double pay and closed-week mutations. Append audit event `backfilled`.
- Existing attendance schema supports fields; no migration necessary. It does **not** implement cross-job allocation on the same day, editing past shifts, changing a closed week or importing old localStorage data. Do not fake these features.

## Tests and safety
- Unit: historical timestamps, day portion, breaks, malformed timezone/date, duplicate, closed payroll week.
- Browser: iPhone 390px and desktop 1280px select yesterday, save via authenticated API mock, show backfill instead of live check-in, and assert no incorrect cross-date records.
- No AWS, secrets, real payroll or production writes. Production remains unverified and cannot be used until deployment/restore/auth gates pass.

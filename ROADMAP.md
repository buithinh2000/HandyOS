# HandyOS — Product Roadmap

**Vision:** A commercial renovation/construction operating system for owners, employees, subcontractors and homeowners. A renovation checklist is only one component of the end-to-end workflow.

**Locked architecture:** AWS for Cognito identity, backend APIs, PostgreSQL, S3 media and audit; Cloudflare for domain, frontend, HTTPS and edge security; GitHub for source/CI/CD. Strictly isolate HandyOS from all other BuiTai ventures.

## Phase 0 — Working foundation (highest priority)

- One central project and tenant model: customer enquiry → site inspection → scope → estimate/quote → approval → delivery → variation → payment → handover.
- Real owner login, secure database, role-based access (Owner, Manager, Worker, Homeowner), company and project isolation.
- Staging deployment, automated tests, backup/restore and baseline audit logging.
- Never treat public GitHub Pages or browser localStorage as secure production storage.
- **Exit criteria:** Owner can sign in on two devices and see the same synthetic job; unauthorised account cannot retrieve data, even by direct API calls.

## Phase 1 — Commercial owner operations

- Owner dashboard: jobs, job stages, forecast vs actual margin, receivables, labour, overdue work and alerts.
- Flexible renovation scope: restumping, subfloor, hybrid/laminate/carpet/tile floors, partitions, doors, plaster, painting, bathroom, WC, laundry, ceiling, roofing, windows, kitchen, mini bar, custom trade and nested tasks/notes.
- Materials catalogue with public Bunnings references and timestamped price checks (no PowerPass connection).
- Quote versions, inclusions/exclusions, line items, GST, allowances, subcontractors, print/share PDF and customer approvals.
- Work schedule, assignments, daily timesheets, staff approval, cost capture, progress claims, payment status and change orders.
- **Exit criteria:** One synthetic job can proceed through quote, work, cost and payment without duplicate data entry.

## Phase 2 — Client Collaboration & Shared Project Workspace (required)

Goal: Owner, workers and homeowner coordinate in **one shared project room**; no fragmented chat apps, disconnected photo galleries, or unverifiable verbal sign-offs.

### 2.1 Project conversations
- Private project-scoped chat with owner/manager, invited homeowner and individually authorised workers.
- Thread messages by stage, task, variation or inspection; notifications, read/unread and mentions.
- Attach photos/video/files and keep timestamps, sender, attachments and an audit trail.
- Internal-only threads and client-visible conversations are clearly separated; customer cannot access internal costing, staff wages, business profit or unshared notes.

### 2.2 Shared task board and progress tracking
- Owner/manager can share selected tasks with homeowners; assign responsibility and due dates as appropriate.
- Both parties can view status, comment, request clarifications and acknowledge completion.
- Distinguish **contractor-completed**, **ready for client review**, **client accepted**, and **rework requested**; a tick on a checklist is NOT formal acceptance.
- Clarify which client-facing requests are just comments, proposed variations, or approved scope changes.
- Maintain change history and who changed what, without silent overwrites.

### 2.3 Media updates by construction stage
- Owner/worker uploads site photos/video into S3; associate each with job + stage + task + timestamp, uploader and visibility.
- Timeline/gallery shows Before → During → After for demolition, restumping, framing, plaster, waterproofing, tiling, painting, fit-off and handover as applicable.
- Group updates by stage and date; client receives only approved/shared media.
- Support phone-first uploads, compression, thumbnails, retry on poor onsite connectivity, meaningful captions and private originals.
- Use private encrypted object storage, short-lived authorised media URLs, per-job access controls and clear retention/deletion policy.

### 2.4 Stage inspection and sign-off (nghiệm thu)
- Manager marks a stage **ready for inspection**, attaches checklist/evidence (photos/video, measurements, supporting certificates where required).
- Homeowner receives a review request, may approve, comment, or request rework; track decisions and dates.
- Explicitly record the approved checklist/scope version, decision, approver identity, evidence links, notes and timestamps.
- Rework opens follow-up tasks and requires another inspection; no automatic approval simply because time has passed.
- Capture formal confirmation/e-signature only when legally appropriate, with jurisdiction-specific contractual review.
- Keep statutory and trade-required inspections/certifications separate from customer acceptance: homeowner sign-off does not replace licensed inspections or compliance certificates.

### 2.5 Shared handover
- Defect/punch-list with responsible party, due dates, photo evidence and closure review.
- Handover package: as-built photos, warranties, manuals, certifications, outstanding items and payment summary appropriate for the homeowner.
- Store acceptance history, change orders and handover receipt.

**Phase 2 exit criteria (automated E2E):**
1. Owner invites homeowner to Job A; homeowner cannot discover Job B.
2. Worker can update an assigned task/upload progress without seeing supplier costs, profits or other employees' pay.
3. Owner uploads stage photo/video; homeowner sees only approved shared assets.
4. Homeowner comments on a task; owner receives notification and both see the same thread.
5. Manager requests inspection; homeowner requests rework, then approves the corrected stage; evidence and history remain intact.
6. Internal-only message/file/notes are inaccessible from homeowner's token and direct media URL.
7. Final handover pack is generated from the same project data with all accepted stages.

## Phase 3 — Commercial expansion

- Recurring servicing, maintenance and defects/warranty follow-up.
- Supplier price revisions, purchase orders, cost forecasts and scheduling automation.
- Customer-facing project updates and reminders via preferred channels (opt-in where required).
- KPI reporting and optional accounting integrations with audited reconciliation.
- AI project assistant using permission-filtered evidence for estimating, missed scope, schedule conflicts and cost anomalies; never silently accept variations or final stage sign-offs.

## Workflow rules

- All entities share stable tenant_id and project_id; no duplicative independent localStorage stores in production.
- Internal and customer-visible objects are explicit and access-tested at API and storage layers.
- Chat is not approval: formal quote, variation, inspection and payment transitions are separate audit events.
- No real client/employee/financial data until AWS Cognito, PostgreSQL, RLS/authorization, private S3 and backup gates pass.
- A production release requires synthetic end-to-end tests across Owner, Worker and Homeowner plus a negative cross-project access test.

## Current position — 2026-11-15

Public demo: renovation scope, estimate and simple cost/payment workflow using browser storage. AWS backend/auth foundation exists only on draft development PR; database, secure login, shared client collaboration, S3 uploads and inspections are NOT deployed.

-- HandyOS PostgreSQL RLS; must apply after 001 in a new isolated database.
-- Runtime login is a distinct non-table-owner role with no BYPASSRLS.
begin;
alter table tenants enable row level security;
alter table tenants force row level security;
alter table memberships enable row level security;
alter table memberships force row level security;
create policy memberships_self_read on memberships for select using (cognito_sub = nullif(current_setting('app.actor_sub',true),''));
create policy tenants_context_read on tenants for select using (id::text = nullif(current_setting('app.tenant_id',true),''));
alter table jobs enable row level security;
alter table jobs force row level security;
create policy jobs_read on jobs for select using (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
create policy jobs_insert on jobs for insert with check (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
alter table job_members enable row level security;
alter table job_members force row level security;
create policy job_members_read on job_members for select using (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
alter table work_categories enable row level security;
alter table work_categories force row level security;
create policy work_categories_read on work_categories for select using (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
create policy work_categories_insert on work_categories for insert with check (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
alter table tasks enable row level security;
alter table tasks force row level security;
create policy tasks_read on tasks for select using (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
create policy tasks_insert on tasks for insert with check (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
alter table cost_entries enable row level security;
alter table cost_entries force row level security;
create policy cost_entries_read on cost_entries for select using (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
create policy cost_entries_insert on cost_entries for insert with check (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
alter table quotes enable row level security;
alter table quotes force row level security;
create policy quotes_read on quotes for select using (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
create policy quotes_insert on quotes for insert with check (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
alter table quote_lines enable row level security;
alter table quote_lines force row level security;
create policy quote_lines_read on quote_lines for select using (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
create policy quote_lines_insert on quote_lines for insert with check (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
alter table progress_claims enable row level security;
alter table progress_claims force row level security;
create policy progress_claims_read on progress_claims for select using (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
create policy progress_claims_insert on progress_claims for insert with check (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
alter table payments enable row level security;
alter table payments force row level security;
create policy payments_read on payments for select using (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
create policy payments_insert on payments for insert with check (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
alter table audit_events enable row level security;
alter table audit_events force row level security;
create policy audit_events_read on audit_events for select using (tenant_id::text = nullif(current_setting('app.tenant_id',true),''));
create policy audit_events_insert on audit_events for insert with check (tenant_id::text = nullif(current_setting('app.tenant_id',true),'') and actor_sub = nullif(current_setting('app.actor_sub',true),''));
-- Provision a separate handyos_runtime role with credential from Secrets Manager
-- BEFORE applying this migration. Do not make the runtime role a table owner.
grant usage on schema public to handyos_runtime;
grant select on tenants,memberships,job_members to handyos_runtime;
grant select,insert on jobs,tasks,audit_events to handyos_runtime;
grant select on work_categories,cost_entries,quotes,quote_lines,progress_claims,payments to handyos_runtime;
-- No anonymous DB access and no direct browser-to-Postgres network route.
commit;

-- HandyOS job financial settings. Apply only to dedicated HandyOS PostgreSQL.
-- Contract value is excluding GST. Reserve is a planning allocation, not paid tax.
begin;
create table job_financial_settings(
 tenant_id uuid not null,
 job_id uuid not null,
 contract_ex_gst numeric(14,2) not null default 0 check(contract_ex_gst>=0),
 reserve_percent numeric(5,2) not null default 15 check(reserve_percent between 0 and 100),
 updated_at timestamptz not null default now(),
 primary key(tenant_id,job_id),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id) on delete cascade
);
alter table job_financial_settings enable row level security;
alter table job_financial_settings force row level security;
create policy job_financial_settings_owner_manager on job_financial_settings
 for all to handyos_runtime
 using(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
   and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'))
 with check(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
   and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'));
grant select,insert,update on job_financial_settings to handyos_runtime;
-- Cost entries were readable for all tenant roles in 002: close that financial exposure.
drop policy cost_entries_read on cost_entries;
drop policy cost_entries_insert on cost_entries;
create policy cost_entries_management_read on cost_entries for select to handyos_runtime
 using(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') and
 nullif(current_setting('app.actor_role',true),'') in ('owner','manager'));
create policy cost_entries_management_insert on cost_entries for insert to handyos_runtime
 with check(tenant_id::text=nullif(current_setting('app.tenant_id',true),'') and
 nullif(current_setting('app.actor_role',true),'') in ('owner','manager'));
grant insert on cost_entries to handyos_runtime;
-- Existing cost_entries are general business costs EXCLUDING customer-paid purchase reimbursements.
-- Do not import customer reimbursement receipt totals into cost_entries.
commit;

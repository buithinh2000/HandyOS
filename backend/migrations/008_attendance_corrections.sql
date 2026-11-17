-- HandyOS immutable attendance correction history. SOURCE ONLY; not applied to live data.
-- Apply only to the dedicated HandyOS DB after 007_job_financial_settings.sql.
begin;
create table attendance_corrections (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 attendance_id uuid not null,
 staff_id uuid not null,
 job_id uuid not null,
 work_date date not null,
 changed_by text not null,
 reason text not null check(length(trim(reason)) between 3 and 500),
 before_record jsonb not null,
 after_record jsonb not null,
 created_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,attendance_id) references attendance_entries(tenant_id,id),
 foreign key(tenant_id,staff_id) references staff_profiles(tenant_id,id),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id)
);
create index attendance_corrections_history
 on attendance_corrections(tenant_id,attendance_id,created_at desc,id);
alter table attendance_corrections enable row level security;
alter table attendance_corrections force row level security;
create policy attendance_corrections_owner_manager on attendance_corrections
 for all to handyos_runtime
 using(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
 and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'))
 with check(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
 and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'));
grant select,insert on attendance_corrections to handyos_runtime;
-- No runtime UPDATE or DELETE: history is append-only.
commit;

-- HandyOS secure operational data model: SOURCE ONLY, NOT APPLIED.
-- Apply after 001_initial.sql and 002_rls.sql to a dedicated private HandyOS PostgreSQL.
-- Owner/manager-only operational financial tables; API must verify Cognito JWT and set
-- app.actor_sub, app.tenant_id, app.actor_role within a single database transaction.
-- Never store receipt binary/base64, passwords or customer tokens in PostgreSQL.
begin;
create table staff_profiles (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references tenants(id) on delete cascade,
 display_name text not null check(length(trim(display_name)) between 1 and 160),
 role_label text not null default '',
 wage_unit text not null default 'day' check(wage_unit in ('day','hour')),
 default_rate numeric(12,2) not null default 0 check(default_rate>=0),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(tenant_id,id)
);
create index staff_profiles_tenant_active on staff_profiles(tenant_id,active);

create table crew_sessions (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 job_id uuid not null,
 work_date date not null,
 check_in_at timestamptz not null,
 check_out_at timestamptz,
 notes text not null default '',
 created_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id),
 check(check_out_at is null or check_out_at>check_in_at)
);
create index crew_sessions_job_day on crew_sessions(tenant_id,job_id,work_date desc);

create table attendance_entries (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 job_id uuid not null,
 staff_id uuid not null,
 crew_session_id uuid,
 work_date date not null,
 started_at timestamptz not null,
 finished_at timestamptz,
 break_minutes integer not null default 0 check(break_minutes between 0 and 600),
 paid_day_portion numeric(3,2) not null default 1 check(paid_day_portion in (0.5,1)),
 rate_unit text not null check(rate_unit in ('day','hour')),
 rate_snapshot numeric(12,2) not null check(rate_snapshot>=0),
 notes text not null default '',
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 -- V1: one worker on one job per day; must Edit existing entry instead of double wages.
 unique(tenant_id,staff_id,work_date),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id),
 foreign key(tenant_id,staff_id) references staff_profiles(tenant_id,id),
 foreign key(tenant_id,crew_session_id) references crew_sessions(tenant_id,id),
 check(finished_at is null or finished_at>started_at)
);
create index attendance_job_day on attendance_entries(tenant_id,job_id,work_date desc);

create table weekly_wage_adjustments (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 job_id uuid not null,
 staff_id uuid not null,
 week_begin date not null,
 kind text not null check(kind in ('bonus','allowance')),
 amount numeric(12,2) not null check(amount>0),
 notes text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id),
 foreign key(tenant_id,staff_id) references staff_profiles(tenant_id,id),
 check(extract(isodow from week_begin)=1)
);
create index weekly_adjustments_staff_week on weekly_wage_adjustments(tenant_id,staff_id,week_begin desc);

create table staff_wage_payments (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 job_id uuid not null,
 staff_id uuid not null,
 paid_on date not null,
 amount numeric(12,2) not null check(amount>0),
 reference text not null default '',
 created_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id),
 foreign key(tenant_id,staff_id) references staff_profiles(tenant_id,id)
);
create index wage_payments_staff_paid on staff_wage_payments(tenant_id,staff_id,paid_on desc);

create table material_reimbursements (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 job_id uuid not null,
 bought_on date not null,
 store_reference text not null check(length(trim(store_reference)) between 1 and 160),
 amount_gross numeric(12,2) not null check(amount_gross>0),
 gst_basis text not null default 'inc' check(gst_basis in ('inc','ex','no_gst')),
 customer_status text not null default 'draft' check(customer_status in ('draft','sent','reimbursed')),
 sent_on date,
 reimbursed_on date,
 -- Private S3 object key only; no binary, base64, public URL or presigned URL.
 receipt_object_key text not null check(length(receipt_object_key) between 20 and 512),
 receipt_content_type text not null check(receipt_content_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 notes text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id),
 check(reimbursed_on is null or customer_status='reimbursed')
);
create index material_reimbursements_job_status on material_reimbursements(tenant_id,job_id,customer_status,bought_on desc);

create table actual_tax_payments (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references tenants(id),
 paid_on date not null,
 kind text not null check(kind in ('gst_bas','payg','income_tax','other')),
 amount numeric(12,2) not null check(amount>0),
 notes text not null default '',
 created_at timestamptz not null default now(),
 unique(tenant_id,id)
);
create index actual_tax_payments_paid on actual_tax_payments(tenant_id,paid_on desc);

-- FORCE RLS ensures table owners are not an accidental bypass.
-- Runtime role must not own tables or possess BYPASSRLS.
do $$
declare tbl text;
begin
 foreach tbl in array array['staff_profiles','crew_sessions','attendance_entries','weekly_wage_adjustments','staff_wage_payments','material_reimbursements','actual_tax_payments']
 loop
  execute format('alter table %I enable row level security',tbl);
  execute format('alter table %I force row level security',tbl);
  execute format(
   'create policy %I on %I for all to handyos_runtime using (tenant_id::text = nullif(current_setting(''app.tenant_id'',true),'''') and nullif(current_setting(''app.actor_role'',true),'''') in (''owner'',''manager'')) with check (tenant_id::text = nullif(current_setting(''app.tenant_id'',true),'''') and nullif(current_setting(''app.actor_role'',true),'''') in (''owner'',''manager''))',
   tbl||'_owner_manager',tbl
  );
 end loop;
end $$;
grant select,insert,update on staff_profiles,crew_sessions,attendance_entries,weekly_wage_adjustments,staff_wage_payments,material_reimbursements,actual_tax_payments to handyos_runtime;
-- Intentionally NO DELETE on financial/payroll records for runtime; use audited correction flows.
commit;

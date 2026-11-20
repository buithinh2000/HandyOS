-- Future-only employee recurring bonus/allowance rules. Separate from one-time ledger.
-- Daily = per COMPLETED recorded shift (half-day at 50%).
-- Weekly = one fixed amount in each eligible payroll week.
-- Monthly = one fixed amount in the week containing calendar month's first day.
-- New rules only start on a future Monday; deactivation effective future Monday.
begin;
create table staff_recurring_pay_rules (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 staff_id uuid not null,
 job_id uuid not null,
 kind text not null check(kind in ('bonus','allowance')),
 label text not null check(length(trim(label)) between 1 and 120),
 cadence text not null check(cadence in ('day','week','month')),
 amount numeric(12,2) not null check(amount>0 and amount<=1000000),
 starts_on date not null check(extract(isodow from starts_on)=1),
 ends_on date check(ends_on is null or (ends_on>=starts_on and extract(isodow from ends_on)=1)),
 created_by text not null,
 created_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,staff_id) references staff_profiles(tenant_id,id),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id)
);
create index staff_recurring_rules_by_week
 on staff_recurring_pay_rules(tenant_id,staff_id,starts_on,ends_on);
alter table staff_recurring_pay_rules enable row level security;
alter table staff_recurring_pay_rules force row level security;
create policy staff_recurring_rules_manager on staff_recurring_pay_rules
 for all to handyos_runtime
 using (tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'))
 with check (tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'));
grant select,insert,update on staff_recurring_pay_rules to handyos_runtime;
commit;

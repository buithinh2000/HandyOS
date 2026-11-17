-- HandyOS weekly payroll allocation and audited settlement, dedicated database only.
-- Existing wage payments remain unallocated until explicitly reconciled:
-- never infer a payroll week from paid_on (which might be later than work).
begin;
alter table staff_wage_payments add column week_begin date;
alter table staff_wage_payments add constraint staff_payment_week_monday
 check(week_begin is null or extract(isodow from week_begin)=1);
create index staff_wage_payments_by_week on staff_wage_payments(tenant_id,staff_id,week_begin)
 where week_begin is not null;
create table weekly_payroll_closures(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 staff_id uuid not null,
 week_begin date not null check(extract(isodow from week_begin)=1),
 earned_total numeric(12,2) not null check(earned_total>=0),
 extras_total numeric(12,2) not null check(extras_total>=0),
 paid_total numeric(12,2) not null check(paid_total>=0),
 closed_at timestamptz not null default now(),
 closed_by text not null,
 unique(tenant_id,staff_id,week_begin),
 foreign key(tenant_id,staff_id) references staff_profiles(tenant_id,id)
);
alter table weekly_payroll_closures enable row level security;
alter table weekly_payroll_closures force row level security;
create policy weekly_payroll_closures_owner_manager on weekly_payroll_closures
 for all to handyos_runtime
 using(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
 and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'))
 with check(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
 and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'));
grant select,insert on weekly_payroll_closures to handyos_runtime;
-- Never grant DELETE/UPDATE on completed payroll settlements.
commit;

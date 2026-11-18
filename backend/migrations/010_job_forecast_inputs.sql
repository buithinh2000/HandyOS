-- HandyOS Financials Owner parity inputs, SOURCE ONLY, NOT RUN AGAINST PRODUCTION.
-- New tenant-owned record: never reinterpret legacy job_financial_settings.contract_ex_gst
-- as INC GST and never set defaults that pretend missing assumptions were confirmed.
begin;
create table job_forecast_inputs (
 tenant_id uuid not null,
 job_id uuid not null,
 contract_inc_gst numeric(14,2) check(contract_inc_gst > 0),
 approved_variation_inc_gst numeric(14,2),
 remaining_cost_ex_gst numeric(14,2) check(remaining_cost_ex_gst >= 0),
 unbooked_overhead_ex_gst numeric(14,2) check(unbooked_overhead_ex_gst >= 0),
 tax_reserve_percent numeric(5,2) check(tax_reserve_percent between 0 and 100),
 -- Distinguish explicit confirmed zero from a missing/unknown value.
 owner_confirmed_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,job_id),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id) on delete cascade,
 check(owner_confirmed_at is null or
  (contract_inc_gst is not null and approved_variation_inc_gst is not null
   and remaining_cost_ex_gst is not null and unbooked_overhead_ex_gst is not null
   and tax_reserve_percent is not null
   and contract_inc_gst+approved_variation_inc_gst>0))
);
alter table job_forecast_inputs enable row level security;
alter table job_forecast_inputs force row level security;
create policy job_forecast_inputs_owner_manager on job_forecast_inputs
 for all to handyos_runtime
 using(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'))
 with check(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'));
grant select,insert,update on job_forecast_inputs to handyos_runtime;
-- Retain existing job_financial_settings for diagnostic legacy compatibility.
-- No DROP/UPDATE/BACKFILL of historical contract EX GST values.
commit;

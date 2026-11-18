-- HandyOS contract cash receipts (source only). Independent of customer material reimbursements.
-- No automatic migration of legacy claims/payments; they need owner reconciliation.
begin;
create table job_contract_receipts (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 job_id uuid not null,
 request_id uuid not null,
 received_on date not null,
 input_basis text not null check(input_basis in ('inc_gst','ex_gst','no_gst')),
 entered_amount numeric(14,2) not null check(entered_amount>0),
 received_inc_gst numeric(14,2) not null check(received_inc_gst>0),
 gst_component numeric(14,2) not null check(gst_component>=0),
 reference text not null check(length(trim(reference)) between 3 and 250),
 actor_sub text not null,
 created_at timestamptz not null default now(),
 unique(tenant_id,id),
 unique(tenant_id,request_id),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id),
 check(received_inc_gst>=gst_component),
 check((input_basis='no_gst' and gst_component=0) or input_basis<>'no_gst')
);
create index job_contract_receipts_job_date on job_contract_receipts(tenant_id,job_id,received_on desc,id);
alter table job_contract_receipts enable row level security;
alter table job_contract_receipts force row level security;
create policy job_contract_receipts_management on job_contract_receipts
 for all to handyos_runtime
 using(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'))
 with check(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'));
grant select,insert on job_contract_receipts to handyos_runtime;
-- Append only: correcting a mistaken payment requires a separately audited reversal,
-- never UPDATE/DELETE. No linked older payment record is auto-imported.
commit;

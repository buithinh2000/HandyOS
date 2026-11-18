-- HandyOS client-bill pass-through events. SOURCE ONLY / CI DATABASE ONLY.
-- Append-only event history for homeowner send confirmation and partial repayments.
-- Keep material reimbursements separate from contract progress payments and job costs.
begin;
create table material_reimbursement_events (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null,
 tenant_id uuid not null,
 bill_id uuid not null,
 event_kind text not null check(event_kind in ('manually_sent','payment_received')),
 happened_on date not null,
 channel text,
 reference text not null check(length(trim(reference)) between 3 and 250),
 amount_received numeric(12,2),
 actor_sub text not null,
 created_at timestamptz not null default now(),
 unique(tenant_id,id),
 unique(tenant_id,request_id),
 foreign key(tenant_id,bill_id) references material_reimbursements(tenant_id,id),
 check(
  (event_kind='manually_sent' and amount_received is null and channel in ('email','message','in_person','other'))
  or (event_kind='payment_received' and amount_received>0 and channel is null)
 )
);
create index material_reimbursement_events_bill
 on material_reimbursement_events(tenant_id,bill_id,created_at,id);
alter table material_reimbursement_events enable row level security;
alter table material_reimbursement_events force row level security;
create policy material_reimbursement_events_owner_manager on material_reimbursement_events
 for all to handyos_runtime
 using(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'))
 with check(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'));
grant select,insert on material_reimbursement_events to handyos_runtime;
-- No UPDATE/DELETE; adjustments require an explicit subsequent audited reversal design.
commit;

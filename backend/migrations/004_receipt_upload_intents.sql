-- HandyOS receipt upload staging metadata. SOURCE-ONLY; apply ONLY to a dedicated HandyOS DB.
-- A private S3 upload MUST be verified before a customer-reimbursement record exists.
-- Pending records are not expenses, payments, or confirmed reimbursement receipts.
begin;
create table receipt_upload_intents (
 id uuid primary key,
 tenant_id uuid not null,
 job_id uuid not null,
 object_id uuid not null,
 object_key text not null check(length(object_key) between 40 and 512),
 content_type text not null check(content_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 content_length integer not null check(content_length between 1 and 15728640),
 bought_on date not null,
 store_reference text not null check(length(trim(store_reference)) between 1 and 160),
 amount_gross numeric(12,2) not null check(amount_gross>0),
 gst_basis text not null check(gst_basis in ('inc','ex','no_gst')),
 notes text not null default '',
 status text not null default 'pending' check(status in ('pending','committed')),
 created_at timestamptz not null default now(),
 committed_at timestamptz,
 unique(tenant_id,id),
 unique(object_key),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id),
 check(status='committed' or committed_at is null),
 check(status='pending' or committed_at is not null)
);
create index receipt_upload_intents_pending on receipt_upload_intents(tenant_id,job_id,created_at)
 where status='pending';
alter table receipt_upload_intents enable row level security;
alter table receipt_upload_intents force row level security;
create policy receipt_upload_intents_owner_manager on receipt_upload_intents
 for all to handyos_runtime
 using (tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'))
 with check (tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'));
grant select,insert,update on receipt_upload_intents to handyos_runtime;
-- Do not grant DELETE or expose this table to customer/worker roles.
-- Old pending intents require separately approved and audited retention/cleanup.
commit;

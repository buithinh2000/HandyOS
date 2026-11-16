-- Isolated synthetic PostgreSQL integration for receipt-upload intent RLS (NOT PRODUCTION).
set role handyos_runtime;
begin;
select set_config('app.actor_sub','user-aaaa-123456',true);
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
select set_config('app.actor_role','owner',true);
insert into receipt_upload_intents(id,tenant_id,job_id,object_id,object_key,content_type,content_length,bought_on,store_reference,amount_gross,gst_basis)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
'11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
'tenants/11111111-1111-4111-8111-111111111111/jobs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/receipts/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
'image/jpeg',1024,'2026-11-16','Synthetic Shop',350.25,'inc');
do $$
begin
 if (select count(*) from receipt_upload_intents where status='pending')<>1 then
  raise exception 'Owner cannot read pending receipt';end if;
 if (select count(*) from material_reimbursements where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>0 then
  raise exception 'Pending upload already counted as customer reimbursement';end if;
end $$;
select set_config('app.actor_role','worker',true);
do $$
begin
 if (select count(*) from receipt_upload_intents)<>0 then
  raise exception 'Worker can read receipt staging metadata';end if;
end $$;
select set_config('app.actor_role','homeowner',true);
do $$
begin
 if (select count(*) from receipt_upload_intents)<>0 then
  raise exception 'Homeowner can read private receipt upload intents';end if;
end $$;
select set_config('app.actor_role','owner',true);
select set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
do $$
begin
 if (select count(*) from receipt_upload_intents)<>0 then
  raise exception 'Cross-tenant receipt metadata leaked';end if;
end $$;
rollback;
reset role;

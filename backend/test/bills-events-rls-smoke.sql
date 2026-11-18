-- Synthetic PostgreSQL-only RLS proof for homeowner material repayment events.
-- All writes roll back; no AWS or customer data.
set role handyos_runtime;
begin;
select set_config('app.actor_sub','user-aaaa-123456',true);
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
select set_config('app.actor_role','owner',true);
insert into material_reimbursements(id,tenant_id,job_id,bought_on,store_reference,
 amount_gross,receipt_object_key,receipt_content_type)
values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '2026-11-17','Synthetic Hardware',250.75,
 'tenants/11111111-1111-4111-8111-111111111111/receipts/synthetic.jpg','image/jpeg');
insert into material_reimbursement_events
(tenant_id,bill_id,request_id,event_kind,happened_on,channel,reference,actor_sub)
values('11111111-1111-4111-8111-111111111111',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','manually_sent','2026-11-17',
 'message','Sent via client message','user-aaaa-123456');
insert into material_reimbursement_events
(tenant_id,bill_id,request_id,event_kind,happened_on,amount_received,reference,actor_sub)
values('11111111-1111-4111-8111-111111111111',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','payment_received','2026-11-18',
 100.00,'Bank transfer synthetic','user-aaaa-123456');
do $$ begin
 if (select count(*) from material_reimbursement_events)<>2
 then raise exception 'Owner cannot read own bill events';end if;
 if (select sum(amount_received) from material_reimbursement_events where event_kind='payment_received')<>100
 then raise exception 'Partial receipt sum incorrect';end if;
 if has_table_privilege('handyos_runtime','material_reimbursement_events','UPDATE')
 or has_table_privilege('handyos_runtime','material_reimbursement_events','DELETE')
 then raise exception 'Mutable bill audit history permissions';end if;
end $$;
select set_config('app.actor_role','worker',true);
do $$ begin
 if(select count(*) from material_reimbursement_events)<>0 then raise exception 'Worker could read private bill';end if;
end $$;
select set_config('app.actor_role','owner',true);
select set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if(select count(*) from material_reimbursement_events)<>0 then raise exception 'Foreign tenant bill visible';end if;
end $$;
rollback;
reset role;

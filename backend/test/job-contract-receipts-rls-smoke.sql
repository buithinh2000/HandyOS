-- CI only. Verify Owner/Manager contract receipts and strict tenant separation.
set role handyos_runtime;
begin;
select set_config('app.actor_sub','test-owner-123',true);
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
select set_config('app.actor_role','owner',true);
insert into job_contract_receipts
(tenant_id,job_id,request_id,received_on,input_basis,entered_amount,
 received_inc_gst,gst_component,reference,actor_sub)
values('11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '2026-11-18','inc_gst',1100,1100,100,'Synthetic test bank receipt','test-owner-123');
do $$ begin
 if(select count(*) from job_contract_receipts)<>1 then raise exception 'Owner cannot read cash receipt';end if;
 if(select sum(received_inc_gst) from job_contract_receipts)<>1100 then raise exception 'Receipt gross not preserved';end if;
 if has_table_privilege('handyos_runtime','job_contract_receipts','UPDATE') or
    has_table_privilege('handyos_runtime','job_contract_receipts','DELETE')
 then raise exception 'Mutable cash receipt history';end if;
end $$;
select set_config('app.actor_role','worker',true);
do $$ begin
 if(select count(*) from job_contract_receipts)<>0 then raise exception 'Worker saw private receipts';end if;
end $$;
select set_config('app.actor_role','homeowner',true);
do $$ begin
 if(select count(*) from job_contract_receipts)<>0 then raise exception 'Customer saw internal receipts';end if;
end $$;
select set_config('app.actor_role','owner',true);
select set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if(select count(*) from job_contract_receipts)<>0 then raise exception 'Cross tenant receipt leaked';end if;
end $$;
rollback;
reset role;

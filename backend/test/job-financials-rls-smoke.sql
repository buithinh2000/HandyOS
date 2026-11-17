-- Source-only synthetic PostgreSQL smoke. Never run against real customer records.
set role handyos_runtime;
begin;
select set_config('app.actor_sub','user-aaaa-123456',true);
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
select set_config('app.actor_role','owner',true);
insert into job_financial_settings(tenant_id,job_id,contract_ex_gst,reserve_percent)
values('11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',10000,15);
insert into cost_entries(tenant_id,job_id,kind,description,amount_ex_gst,gst_amount)
values('11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','other','Synthetic disposal',100,10);
do $$ begin
 if (select count(*) from job_financial_settings)<>1 then raise exception 'Owner missing settings';end if;
 if (select count(*) from cost_entries)<>1 then raise exception 'Owner missing cost';end if;
end $$;
select set_config('app.actor_role','worker',true);
do $$ begin
 if (select count(*) from job_financial_settings)<>0 then raise exception 'Worker saw job contract';end if;
 if (select count(*) from cost_entries)<>0 then raise exception 'Worker saw company costs';end if;
end $$;
select set_config('app.actor_role','homeowner',true);
do $$ begin
 if (select count(*) from job_financial_settings)<>0 then raise exception 'Homeowner saw contract';end if;
 if (select count(*) from cost_entries)<>0 then raise exception 'Homeowner saw internal costs';end if;
end $$;
select set_config('app.actor_role','owner',true);
select set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if (select count(*) from job_financial_settings)<>0 then raise exception 'Cross-tenant contract leak';end if;
 if (select count(*) from cost_entries)<>0 then raise exception 'Cross-tenant costs leak';end if;
end $$;
rollback;
reset role;

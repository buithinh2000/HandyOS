-- Source-only CI tenant and role isolation for explicit forecast assumptions.
set role handyos_runtime;
begin;
select set_config('app.actor_sub','user-aaaa-123456',true);
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
select set_config('app.actor_role','owner',true);
insert into job_forecast_inputs
(tenant_id,job_id,contract_inc_gst,approved_variation_inc_gst,
 remaining_cost_ex_gst,unbooked_overhead_ex_gst,tax_reserve_percent,owner_confirmed_at)
values('11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',11000,880,500,200,15,now());
do $$ begin
 if(select count(*) from job_forecast_inputs)<>1 then raise exception 'Owner forecast unavailable';end if;
 if(select contract_inc_gst from job_forecast_inputs limit 1)<>11000
 then raise exception 'Original EX-GST contract was misinterpreted';end if;
end $$;
select set_config('app.actor_role','worker',true);
do $$ begin
 if(select count(*) from job_forecast_inputs)<>0 then raise exception 'Worker saw private forecast';end if;
end $$;
select set_config('app.actor_role','homeowner',true);
do $$ begin
 if(select count(*) from job_forecast_inputs)<>0 then raise exception 'Customer saw company forecast';end if;
end $$;
select set_config('app.actor_role','owner',true);
select set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if(select count(*) from job_forecast_inputs)<>0 then raise exception 'Cross tenant forecast leaked';end if;
end $$;
rollback;
reset role;

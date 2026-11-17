-- Synthetic test: expense is isolated to owner/manager and selected tenant.
set role handyos_runtime;
begin;
select set_config('app.actor_sub','user-aaaa-123456',true);
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
select set_config('app.actor_role','owner',true);
insert into staff_profiles(id,tenant_id,display_name,wage_unit,default_rate)
values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','Employee test','day',250);
insert into weekly_wage_adjustments(tenant_id,job_id,staff_id,week_begin,kind,amount,notes)
values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-11-16','expense',50,'Travel reimbursement');
do $$
begin
 if (select coalesce(sum(amount),0) from weekly_wage_adjustments where kind='expense')<>50
 then raise exception 'Other employee expense not stored';end if;
end $$;
select set_config('app.actor_role','worker',true);
do $$ begin
 if (select count(*) from weekly_wage_adjustments)<>0 then raise exception 'Worker can see payroll extras';end if;
end $$;
select set_config('app.actor_role','owner',true);
select set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if (select count(*) from weekly_wage_adjustments)<>0 then raise exception 'Cross-company employee expense leak';end if;
end $$;
rollback;
reset role;

-- Test 005 with isolated synthetic tenants already seeded by postgres-smoke.sql.
-- Never run this test on real HandyOS data.
set role handyos_runtime;
begin;
select set_config('app.actor_sub','user-aaaa-123456',true);
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
select set_config('app.actor_role','owner',true);
insert into staff_profiles(id,tenant_id,display_name,wage_unit,default_rate)
values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
 'Synthetic Weekly Worker','day',250);
insert into weekly_payroll_closures(id,tenant_id,staff_id,week_begin,earned_total,extras_total,paid_total,closed_by)
values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-11-16',1250,100,1350,'user-aaaa-123456');
insert into staff_wage_payments(id,tenant_id,job_id,staff_id,paid_on,amount,week_begin)
values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '2026-11-20',1350,'2026-11-16');
insert into staff_wage_payments(id,tenant_id,job_id,staff_id,paid_on,amount)
values('ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '2026-11-22',50);
do $$
begin
 if (select count(*) from weekly_payroll_closures)<>1 then raise exception 'Owner weekly closure unavailable';end if;
 if (select coalesce(sum(amount),0) from staff_wage_payments where week_begin='2026-11-16')<>1350 then
  raise exception 'Unallocated historical payment was incorrectly attributed to weekly wages';end if;
 if (select count(*) from staff_wage_payments where week_begin is null)<>1 then
  raise exception 'Legacy wage payments were not preserved unallocated';end if;
end $$;
-- Worker/homeowner may not read private payroll and paid wages.
select set_config('app.actor_role','worker',true);
do $$
begin
 if (select count(*) from weekly_payroll_closures)<>0 then raise exception 'Worker saw private payroll';end if;
 if (select count(*) from staff_wage_payments)<>0 then raise exception 'Worker saw wage payments';end if;
end $$;
select set_config('app.actor_role','homeowner',true);
do $$
begin
 if (select count(*) from weekly_payroll_closures)<>0 then raise exception 'Homeowner saw payroll';end if;
end $$;
select set_config('app.actor_role','owner',true);
select set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
do $$
begin
 if (select count(*) from weekly_payroll_closures)<>0 then raise exception 'Cross-tenant closure leak';end if;
 if (select count(*) from staff_wage_payments)<>0 then raise exception 'Cross-tenant wage payment leak';end if;
end $$;
rollback;
reset role;

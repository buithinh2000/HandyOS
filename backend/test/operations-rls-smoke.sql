-- Database-only synthetic security tests; never connect to production.
set role handyos_runtime;
begin;
select set_config('app.actor_sub','user-aaaa-123456',true);
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
select set_config('app.actor_role','owner',true);
insert into staff_profiles(id,tenant_id,display_name,wage_unit,default_rate)
values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','Synthetic Day Worker','day',250);
insert into crew_sessions(id,tenant_id,job_id,work_date,check_in_at)
values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-11-12','2026-11-12T07:00:00+11');
insert into attendance_entries(tenant_id,job_id,staff_id,crew_session_id,work_date,started_at,finished_at,rate_unit,rate_snapshot)
values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 '2026-11-12','2026-11-12T07:00:00+11','2026-11-12T15:30:00+11','day',250);
insert into weekly_wage_adjustments(tenant_id,job_id,staff_id,week_begin,kind,amount)
values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-11-09','bonus',100);
insert into staff_wage_payments(tenant_id,job_id,staff_id,paid_on,amount)
values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-11-13',350);
insert into material_reimbursements(tenant_id,job_id,bought_on,store_reference,amount_gross,receipt_object_key,receipt_content_type)
values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-11-12',
 'Synthetic receipt',110,'tenants/11111111-1111-4111-8111-111111111111/receipts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/example.jpg','image/jpeg');
insert into actual_tax_payments(tenant_id,paid_on,kind,amount)values('11111111-1111-4111-8111-111111111111','2026-11-14','gst_bas',55);
do $$
begin
 if (select count(*) from staff_profiles)<>1 then raise exception 'Owner cannot read own staff';end if;
 if (select count(*) from attendance_entries)<>1 then raise exception 'Owner cannot read own timesheets';end if;
 if (select count(*) from weekly_wage_adjustments)<>1 then raise exception 'Owner cannot read own bonuses';end if;
 if (select count(*) from material_reimbursements)<>1 then raise exception 'Owner cannot read own receipt metadata';end if;
end $$;
-- Same tenant, different role: all sensitive tables must be denied at RLS.
select set_config('app.actor_role','worker',true);
do $$
begin
 if (select count(*) from staff_profiles)<>0 then raise exception 'Worker leaked staff rates';end if;
 if (select count(*) from attendance_entries)<>0 then raise exception 'Worker leaked attendance/pay';end if;
 if (select count(*) from weekly_wage_adjustments)<>0 then raise exception 'Worker leaked bonuses';end if;
 if (select count(*) from staff_wage_payments)<>0 then raise exception 'Worker leaked wage payments';end if;
 if (select count(*) from material_reimbursements)<>0 then raise exception 'Worker leaked receipts';end if;
 if (select count(*) from actual_tax_payments)<>0 then raise exception 'Worker leaked tax';end if;
end $$;
-- Owner role from another company cannot see the original tenant.
select set_config('app.actor_role','owner',true);
select set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
do $$
begin
 if (select count(*) from staff_profiles)<>0 then raise exception 'Cross-tenant staff leak';end if;
 if (select count(*) from material_reimbursements)<>0 then raise exception 'Cross-tenant bill leak';end if;
end $$;
rollback;
reset role;

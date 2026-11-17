-- Synthetic tenant/RLS test for immutable timesheet corrections. Isolated CI database only.
set role handyos_runtime;
begin;
select set_config('app.actor_sub','test-owner',true);
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
select set_config('app.actor_role','owner',true);
insert into staff_profiles(id,tenant_id,display_name,wage_unit,default_rate)
values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','Synthetic Staff','day',250);
insert into attendance_entries(id,tenant_id,job_id,staff_id,work_date,started_at,finished_at,rate_unit,rate_snapshot)
values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '2026-11-17','2026-11-17T08:00:00+11','2026-11-17T16:00:00+11','day',250);
insert into attendance_corrections
(tenant_id,attendance_id,staff_id,job_id,work_date,changed_by,reason,before_record,after_record)
values('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '2026-11-17','test-owner','Break updated','{"breakMinutes":0}','{"breakMinutes":15}');
do $$ begin
 if(select count(*) from attendance_corrections)<>1 then raise exception 'Owner cannot read correction history';end if;
end $$;
select set_config('app.actor_role','worker',true);
do $$ begin
 if(select count(*) from attendance_corrections)<>0 then raise exception 'Worker leaked corrections';end if;
end $$;
select set_config('app.actor_role','owner',true);
select set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if(select count(*) from attendance_corrections)<>0 then raise exception 'Cross-tenant correction leak';end if;
end $$;
rollback;
reset role;

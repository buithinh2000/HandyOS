-- Synthetic-only recurring wage rule RLS and owner CRUD smoke.
-- Runs after migration 013, with tenants/jobs seeded by postgres-smoke.sql.
begin;
set local role handyos_runtime;
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
select set_config('app.actor_role','owner',true);
insert into staff_profiles(id,tenant_id,display_name,wage_unit,default_rate)
 values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '11111111-1111-4111-8111-111111111111','Synthetic recurring staff','day',250);
insert into staff_recurring_pay_rules
 (id,tenant_id,staff_id,job_id,kind,label,cadence,amount,starts_on,created_by)
 values
 ('eeeeeeee-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bonus','Weekly synthetic','week',100,'2026-11-30','synthetic-owner');
do $$
begin
 if (select count(*) from staff_recurring_pay_rules where cadence='week') <> 1
  then raise exception 'Owner cannot read recurring bonus'; end if;
end $$;
select set_config('app.actor_role','worker',true);
do $$
declare changed integer;
begin
 if (select count(*) from staff_recurring_pay_rules) <> 0
  then raise exception 'Worker can read private recurring rules'; end if;
 update staff_recurring_pay_rules set amount=900
 where id='eeeeeeee-1111-4111-8111-111111111111';
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Worker can change private recurring rules'; end if;
end $$;
select set_config('app.actor_role','owner',true);
select set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',true);
do $$
declare changed integer;
begin
 if (select count(*) from staff_recurring_pay_rules) <> 0
  then raise exception 'Another tenant can read recurring bonus'; end if;
 update staff_recurring_pay_rules set amount=999
 where id='eeeeeeee-1111-4111-8111-111111111111';
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Another tenant can change recurring bonus'; end if;
end $$;
rollback;

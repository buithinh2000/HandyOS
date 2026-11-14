-- Integration smoke: dedicated runtime role + row security (synthetic IDs only).
insert into tenants(id,name) values
 ('11111111-1111-4111-8111-111111111111','Company A'),
 ('22222222-2222-4222-8222-222222222222','Company B');
insert into memberships(tenant_id,cognito_sub,role) values
 ('11111111-1111-4111-8111-111111111111','user-aaaa-123456','owner'),
 ('22222222-2222-4222-8222-222222222222','user-bbbb-123456','owner');
insert into jobs(id,tenant_id,name) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Bathroom Test'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Kitchen Test');

set role handyos_runtime;
begin;
select set_config('app.actor_sub','user-aaaa-123456',true);
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
do $$
begin
 if (select count(*) from memberships) <> 1 then raise exception 'Membership RLS isolation failed'; end if;
 if (select count(*) from jobs) <> 1 then raise exception 'Job tenant isolation failed'; end if;
 if exists(select 1 from jobs where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then raise exception 'Cross tenant data leak'; end if;
end $$;
insert into work_categories(tenant_id,job_id,name)
values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Bathroom');
insert into tasks(tenant_id,job_id,title)
values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Waterproofing');
do $$
begin
 if (select count(*) from tasks) <> 1 then raise exception 'Task INSERT failed'; end if;
end $$;
rollback;
reset role;

-- PostgreSQL asserts cross-tenant spoofing blocked by FK even if tenant variable forged.
do $$
begin
 begin
  insert into tasks(tenant_id,job_id,title) values
  ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Cross tenant');
  raise exception 'Tenant mismatch was accepted';
 exception when foreign_key_violation then null;
 end;
end $$;

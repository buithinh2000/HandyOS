-- Synthetic regression: owner update, worker deny and cross-tenant deny.
begin;
set role handyos_runtime;
select set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
select set_config('app.actor_role','owner',true);
do $$
declare n int;
begin
 update jobs set notes='Owner verified note',updated_at=now() where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Owner edit failed';end if;
 update jobs set notes='Cross-tenant unauthorized' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Cross tenant update leaked';end if;
end $$;
select set_config('app.actor_role','worker',true);
do $$
declare n int;
begin
 update jobs set notes='Worker tampering' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Worker was allowed to update jobs';end if;
end $$;
rollback;
reset role;

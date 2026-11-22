-- V1 owner-managed job edits, strictly scoped by tenant and role.
-- SOURCE ONLY: manual migration after an off-host backup + isolated restore test.
begin;
create policy jobs_manager_update on jobs for update to handyos_runtime
 using(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'))
 with check(tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
  and nullif(current_setting('app.actor_role',true),'') in ('owner','manager'));
grant update(name,code,stage,notes,updated_at) on jobs to handyos_runtime;
commit;

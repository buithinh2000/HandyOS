#!/usr/bin/env bash
# HandyOS V1 one-shot local dump+isolated restore rehearsal.
# Reads live PostgreSQL only via pg_dump; never executes SQL against production.
# The temporary backup does NOT replace an off-host backup.
set -Eeuo pipefail
umask 077
cd /home/ubuntu/HandyOS
fail(){ echo "HANDYOS_LOCAL_RESTORE_BLOCKED: $1" >&2; exit 1; }
for bin in sudo docker mktemp;do command -v "$bin" >/dev/null || fail "Required command missing: $bin";done
[[ -f deploy/internal/.env && -f deploy/internal/private/app.env ]] ||
 fail "Private HandyOS runtime config missing"
dc=(sudo -n docker compose --env-file deploy/internal/.env -f deploy/internal/compose.yaml)
"${dc[@]}" config --quiet || fail "HandyOS Compose config invalid"
dbid="$("${dc[@]}" ps -q db)"
[[ -n "$dbid" ]] || fail "Production DB is not running"
[[ "$(sudo -n docker inspect -f '{{.State.Health.Status}}' "$dbid")" == "healthy" ]] ||
 fail "Production DB is not healthy"

temp="$(mktemp -d /tmp/handyos-local-restore-XXXXXXXX)"
name="handyos-local-restore-$$"
volume="handyos-local-restore-data-$$"
started=0
vol_created=0
cleanup(){
 local code="$?"
 trap - EXIT
 if [[ "$started" == 1 ]];then
  sudo -n docker rm -f "$name" >/dev/null 2>&1 || code=1
 fi
 if [[ "$vol_created" == 1 ]];then
  sudo -n docker volume rm "$volume" >/dev/null 2>&1 || code=1
 fi
 rm -f "$temp/backup.dump" || code=1
 rmdir "$temp" || code=1
 if [[ "$code" == 0 ]];then
   echo "HANDYOS_LOCAL_BACKUP_RESTORE_PASS"
   echo "TEMPORARY_BACKUP_AND_VOLUME_REMOVED=YES"
 else
   echo "HANDYOS_LOCAL_BACKUP_RESTORE_NOT_VERIFIED" >&2
 fi
 exit "$code"
}
trap cleanup EXIT
echo "HANDYOS_LOCAL_BACKUP_START"
"${dc[@]}" exec -T db pg_dump -U handyos_admin -d handyos \
 --format=custom --no-owner --no-acl > "$temp/backup.dump" ||
 fail "pg_dump failed"
[[ "$(stat -c%s "$temp/backup.dump")" -gt 1024 ]] || fail "Incomplete dump"
echo "HANDYOS_LOCAL_BACKUP_CREATED"

# Disposable, offline PostgreSQL, never the production network or volume.
sudo -n docker image inspect postgres:16-alpine >/dev/null ||
 fail "PostgreSQL 16 image absent locally (do not pull on production)"
sudo -n docker volume create "$volume" >/dev/null || fail "Temporary volume creation failed"
vol_created=1
sudo -n docker run -d --rm --pull=never --name "$name" --network none \
 --security-opt no-new-privileges -e POSTGRES_HOST_AUTH_METHOD=trust \
 -v "$volume:/var/lib/postgresql/data" \
 -v "$temp/backup.dump:/backup.dump:ro" postgres:16-alpine >/dev/null ||
 fail "Offline restore container failed to start"
started=1
ready=0
for _ in $(seq 1 30);do
 if sudo -n docker exec "$name" pg_isready -U postgres -d postgres >/dev/null 2>&1;then ready=1;break;fi
 sleep 1
done
[[ "$ready" == 1 ]] || fail "Temporary PostgreSQL not ready"
sudo -n docker exec "$name" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
 -c "CREATE ROLE handyos_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS" >/dev/null ||
 fail "Temporary role setup failed"
echo "HANDYOS_ISOLATED_RESTORE_START"
sudo -n docker exec "$name" pg_restore --exit-on-error --no-owner --no-acl \
 -U postgres -d postgres /backup.dump >/dev/null ||
 fail "Isolated restore failed"
tables="$(sudo -n docker exec "$name" psql -X -U postgres -d postgres -At -v ON_ERROR_STOP=1 \
 -c "select count(*) from information_schema.tables where table_schema='public' and table_name in ('jobs','memberships','staff_profiles','attendance_entries','material_reimbursements')")" ||
 fail "Restored catalog query failed"
[[ "$tables" == 5 ]] || fail "Restored essential schema incomplete"
echo "RESTORED_CORE_TABLES=5"
echo "RESTORE_NETWORK=NONE"
echo "PRODUCTION_DATABASE=READ_ONLY_DUMP"

#!/usr/bin/env bash
# HandyOS-only verified S3 backup restore rehearsal.
# NEVER connects to the production database or its Docker network/volumes.
# Operator must provide exact backup key; fails closed absent AWS identity.
set -Eeuo pipefail
umask 077
fail(){ echo "HANDYOS_RESTORE_CHECK_BLOCKED: $1" >&2; exit 1; }
for binary in aws sudo docker mktemp; do
  command -v "$binary" >/dev/null 2>&1 || fail "Missing: $binary"
done
: "${HANDYOS_BACKUP_BUCKET:?Dedicated backup bucket required}"
: "${HANDYOS_BACKUP_AWS_ACCOUNT:?Approved account required}"
: "${HANDYOS_BACKUP_OBJECT_KEY:?Explicit existing postgres backup object key required}"
region="${HANDYOS_BACKUP_REGION:-ap-southeast-1}"
[[ "$region" == "ap-southeast-1" && "$HANDYOS_BACKUP_AWS_ACCOUNT" == "916004827349" ]] ||
  fail "Unexpected account/region"
[[ "$HANDYOS_BACKUP_BUCKET" == "handyos-backup-916004827349-sg" ]] ||
  fail "Only the dedicated HandyOS backup bucket is allowed"
[[ "$HANDYOS_BACKUP_OBJECT_KEY" =~ ^postgres/[0-9]{4}/[0-9]{2}/[0-9]{2}/handyos-[0-9]{8}T[0-9]{6}Z-[0-9]+-custom\.dump$ ]] ||
  fail "Unexpected backup object key"
account="$(aws sts get-caller-identity --region "$region" --query Account --output text)" ||
  fail "AWS caller identity unavailable"
[[ "$account" == "$HANDYOS_BACKUP_AWS_ACCOUNT" ]] || fail "Wrong AWS identity"
size="$(aws s3api head-object --bucket "$HANDYOS_BACKUP_BUCKET" --key "$HANDYOS_BACKUP_OBJECT_KEY" \
  --expected-bucket-owner "$HANDYOS_BACKUP_AWS_ACCOUNT" --region "$region" \
  --query ContentLength --output text)" || fail "S3 object not accessible"
[[ "$size" =~ ^[0-9]+$ && "$size" -gt 1024 ]] || fail "Backup object too small"
tmp="$(mktemp -d -t handyos-restore-XXXXXXXX)"
name="handyos-restore-check-$$"
volume="handyos-restore-check-data-$$"
container_started=0
volume_created=0
cleanup(){
  if [[ "$container_started" == 1 ]];then sudo -n docker rm -f "$name" >/dev/null 2>&1 || true;fi
  if [[ "$volume_created" == 1 ]];then sudo -n docker volume rm "$volume" >/dev/null 2>&1 || true;fi
  rm -f "$tmp/backup.dump"
  rmdir "$tmp" 2>/dev/null || true
}
trap cleanup EXIT
aws s3api get-object --bucket "$HANDYOS_BACKUP_BUCKET" --key "$HANDYOS_BACKUP_OBJECT_KEY" \
  --expected-bucket-owner "$HANDYOS_BACKUP_AWS_ACCOUNT" --region "$region" \
  "$tmp/backup.dump" >/dev/null || fail "Cannot download backup for rehearsal"
[[ "$(stat -c%s "$tmp/backup.dump")" == "$size" ]] || fail "Downloaded size mismatch"
# A fresh, separately named volume and a container with NO network, NO ports,
# NO production mounts, and a synthetic local-only database.
sudo -n docker volume create "$volume" >/dev/null || fail "Cannot allocate isolated volume"
volume_created=1
sudo -n docker run -d --rm --network none --name "$name" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$volume:/var/lib/postgresql/data" -v "$tmp/backup.dump:/restore.dump:ro" \
  --security-opt no-new-privileges postgres:16-alpine >/dev/null ||
  fail "Isolated restore container failed to start"
container_started=1
ready=0
for _ in {1..30};do
  if sudo -n docker exec "$name" pg_isready -U postgres -d postgres >/dev/null 2>&1;then ready=1;break;fi
  sleep 1
done
[[ "$ready" == 1 ]] || fail "Isolated PostgreSQL not ready"
sudo -n docker exec "$name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "CREATE ROLE handyos_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS" >/dev/null ||
  fail "Cannot create restore-only policy role"
sudo -n docker exec "$name" pg_restore --exit-on-error --no-owner --no-acl \
  -U postgres -d postgres /restore.dump >/dev/null ||
  fail "Backup failed full isolated PostgreSQL restore"
# Catalog checks only. Never print job, customer, wages, bill or other row data.
checks="$(sudo -n docker exec "$name" psql -X -v ON_ERROR_STOP=1 -U postgres \
  -d postgres -At -c "select count(*) from information_schema.tables where table_schema='public' and table_name in ('jobs','memberships','staff_profiles','attendance_entries','material_reimbursements')")" ||
  fail "Restored schema catalog unavailable"
[[ "$checks" == 5 ]] || fail "Essential HandyOS tables missing"
echo "HANDYOS_ISOLATED_RESTORE_PASS"
echo "RESTORE_TEST_NETWORK=NONE"
echo "RESTORE_TEST_PRODUCTION_VOLUME=NOT_MOUNTED"
echo "RESTORE_TEST_TABLES=5"
echo "RESTORE_TEST_TEMPORARY_DATA_REMOVED_ON_EXIT"

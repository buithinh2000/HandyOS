#!/usr/bin/env bash
# HandyOS-only PostgreSQL logical backup to dedicated, versioned, KMS-encrypted S3.
# NOT scheduled/activated by this source change. Never copy database content to Git.
set -Eeuo pipefail
umask 077
cd /home/ubuntu/HandyOS

fail(){ echo "HANDYOS_BACKUP_BLOCKED: $1" >&2; exit 1; }
for bin in aws sudo docker; do command -v "$bin" >/dev/null || fail "required tool unavailable: $bin"; done
: "${HANDYOS_BACKUP_BUCKET:?Set dedicated HandyOS backup bucket}"
: "${HANDYOS_BACKUP_KMS_KEY_ARN:?Set dedicated HandyOS KMS key ARN}"
: "${HANDYOS_BACKUP_AWS_ACCOUNT:?Set verified AWS account ID}"
: "${HANDYOS_BACKUP_REGION:=ap-southeast-1}"
[[ "$HANDYOS_BACKUP_BUCKET" =~ ^handyos-[a-z0-9.-]+$ ]] || fail "bucket must be dedicated to HandyOS"
[[ "$HANDYOS_BACKUP_AWS_ACCOUNT" =~ ^[0-9]{12}$ ]] || fail "account ID format"
[[ "$HANDYOS_BACKUP_KMS_KEY_ARN" == "arn:aws:kms:${HANDYOS_BACKUP_REGION}:${HANDYOS_BACKUP_AWS_ACCOUNT}:key/"* ]] || fail "KMS key/account/region mismatch"
[[ "$HANDYOS_BACKUP_REGION" == "ap-southeast-1" ]] || fail "region mismatch"
[[ -f deploy/internal/.env && -f deploy/internal/private/app.env ]] || fail "HandyOS runtime config missing"
identity="$(aws sts get-caller-identity --query Account --output text --region "$HANDYOS_BACKUP_REGION")"
[[ "$identity" == "$HANDYOS_BACKUP_AWS_ACCOUNT" ]] || fail "wrong AWS account"
versioning="$(aws s3api get-bucket-versioning --bucket "$HANDYOS_BACKUP_BUCKET" --query Status --output text --region "$HANDYOS_BACKUP_REGION")"
[[ "$versioning" == "Enabled" ]] || fail "bucket versioning not enabled"
block="$(aws s3api get-public-access-block --bucket "$HANDYOS_BACKUP_BUCKET" --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' --output text --region "$HANDYOS_BACKUP_REGION")"
[[ "$block" == $'True\tTrue\tTrue\tTrue' ]] || fail "bucket public access block not complete"
# Never print full AWS bucket policy or credentials.
aws kms describe-key --key-id "$HANDYOS_BACKUP_KMS_KEY_ARN" --query 'KeyMetadata.Enabled' --output text --region "$HANDYOS_BACKUP_REGION" | grep -qx True || fail "KMS not enabled"
dbid="$(sudo -n docker compose --env-file deploy/internal/.env -f deploy/internal/compose.yaml ps -q db)"
[[ -n "$dbid" ]] || fail "private database container not running"
[[ "$(sudo -n docker inspect -f '{{.State.Health.Status}}' "$dbid")" == "healthy" ]] || fail "database unhealthy"

key="postgres/$(date -u +%Y/%m/%d)/handyos-$(date -u +%Y%m%dT%H%M%SZ)-$$-custom.dump"
echo "HANDYOS_BACKUP_STARTED (streaming; no local dump)"
# pg_dump is a consistent logical snapshot. AWS CLI streams directly to the
# approved off-host bucket with SSE-KMS, avoiding a persistent local plaintext dump.
sudo -n docker compose --env-file deploy/internal/.env -f deploy/internal/compose.yaml exec -T db \
  pg_dump -U handyos_admin -d handyos --format=custom --no-owner --no-acl \
  | aws s3 cp - "s3://${HANDYOS_BACKUP_BUCKET}/${key}" \
      --region "$HANDYOS_BACKUP_REGION" --sse aws:kms \
      --sse-kms-key-id "$HANDYOS_BACKUP_KMS_KEY_ARN" --only-show-errors
size="$(aws s3api head-object --bucket "$HANDYOS_BACKUP_BUCKET" --key "$key" --query ContentLength --output text --region "$HANDYOS_BACKUP_REGION")"
[[ "$size" =~ ^[0-9]+$ && "$size" -gt 1024 ]] || fail "backup object invalid; requires investigation"
echo "HANDYOS_BACKUP_UPLOADED size_bytes=$size"
echo "RESTORE_TEST_NOT_YET_VERIFIED"

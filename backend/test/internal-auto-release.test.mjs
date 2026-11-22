import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
test("release script updates app only and has health rollback",()=>{
 const s=read("deploy/internal/release-app.sh");
 assert.match(s,/set -Eeuo pipefail/);
 assert.match(s,/flock -n/);
 assert.match(s,/git merge --ff-only/);
 assert.match(s,/docker compose/);
 assert.match(s,/build app/);
 assert.match(s,/--no-deps --no-build --force-recreate app/);
 assert.match(s,/restore_previous_app/);
 assert.doesNotMatch(s,/NO_CHANGE: current main already deployed/);
 assert.match(s,/api-handyos\.buitai\.com\/healthz/);
 assert.doesNotMatch(s,/\b(?:down|volume rm|prune|migrate|do-release-upgrade|aws lightsail)\b/);
});
test("Outbound timer gates on successful main CI and needs no inbound SSH",()=>{
 const gate=read("deploy/internal/poll-release.py");
 const service=read("deploy/internal/handyos-auto-release.service");
 const timer=read("deploy/internal/handyos-auto-release.timer");
 assert.match(gate,/api\.github\.com\/repos\/buithinh2000\/HandyOS\/actions\/runs/);
 assert.match(gate,/head_sha/);
 assert.match(gate,/conclusion/);
 assert.match(gate,/--check/);
 assert.match(gate,/--deploy/);
 assert.match(gate,/release-app\.sh/);
 assert.match(service,/User=ubuntu/);
 assert.match(service,/poll-release\.py --deploy/);
 assert.match(timer,/OnUnitInactiveSec=10min/);
 assert.doesNotMatch(gate,/SSH_PRIVATE_KEY|aws_access_key|secrets\./i);
});

test("Auto-release readiness uses metadata only and does not imply verified backup",()=>{
 const script=read("deploy/internal/auto-release-readiness.sh");
 assert.match(script,/PREFLIGHT_COMPLETE_NO_MUTATIONS/);
 assert.match(script,/BACKUP_RESTORE_EVIDENCE=/);
 assert.match(script,/UNVERIFIED_MANUAL_CHECK_REQUIRED/);
 assert.match(script,/list-timers --all/);
 assert.doesNotMatch(script,/\bpg_dump\s+-|\bpg_restore\s+|GetSecretValue|aws s3|docker compose down|systemctl enable|systemctl restart/);
});

test("HandyOS S3 backup is isolated, encrypted and not auto activated",()=>{
 const s=read("deploy/internal/backup-to-s3.sh");
 assert.match(s,/set -Eeuo pipefail/);
 assert.match(s,/pg_dump -U handyos_admin -d handyos --format=custom/);
 assert.match(s,/--sse AES256/);
 assert.match(s,/get-bucket-encryption/);
 assert.match(s,/handyos-backup/);
 assert.doesNotMatch(s,/HANDYOS_BACKUP_KMS_KEY_ARN/);
 assert.match(s,/HANDYOS_BACKUP_BUCKET/);
 assert.match(s,/get-public-access-block/);
 assert.match(s,/get-bucket-versioning/);
 assert.match(s,/get-caller-identity/);
 assert.match(s,/RESTORE_TEST_NOT_YET_VERIFIED/);
 assert.doesNotMatch(s,/docker compose down|pg_restore|CREATE DATABASE|aws s3 mb|create-bucket/);
});

test("Single-run V1 status reads only local catalog, health and service metadata",()=>{
 const s=read("deploy/internal/v1-release-gate.sh");
 assert.match(s,/MIGRATION_013_RECURRING/);
 assert.match(s,/MIGRATION_014_JOB_UPDATE_POLICY/);
 assert.match(s,/RUNNING_IMAGE_SOURCE_SHA UNVERIFIED/);
 assert.match(s,/OFF_HOST_BACKUP UNVERIFIED/);
 assert.match(s,/ISOLATED_RESTORE UNVERIFIED/);
 assert.match(s,/HANDYOS_READONLY_V1_GATE_DONE/);
 const commands=s.split("\n").filter(line=>!/^\s*#/.test(line)).join("\n");
 assert.doesNotMatch(commands,/git fetch|git merge|pg_dump|pg_restore|aws s3|aws iam|docker compose up|docker compose down|systemctl enable|systemctl restart|psql.*-(?:f|c).*insert into/i);
});

test("Isolated S3 restore uses offline disposable container and never production volumes",()=>{
 const s=read("deploy/internal/restore-check-s3.sh");
 assert.match(s,/--network none/);
 assert.match(s,/postgres:16-alpine/);
 assert.match(s,/pg_restore --exit-on-error --no-owner --no-acl/);
 assert.match(s,/--expected-bucket-owner/);
 assert.match(s,/HANDYOS_ISOLATED_RESTORE_PASS/);
 assert.match(s,/trap cleanup EXIT/);
 assert.match(s,/docker volume rm/);
 assert.match(s,/handyos-backup-916004827349-sg/);
 assert.doesNotMatch(s,/docker compose|--network host|--network container:|docker exec.*internal-db|CREATE DATABASE handyos;/);
});

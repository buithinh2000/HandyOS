#!/usr/bin/env bash
# One safe, metadata-only HandyOS V1 readiness report. NO deployment, secrets,
# database writes, git fetch, AWS mutations, Docker recreation or backup upload.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
dc=(sudo -n docker compose --env-file deploy/internal/.env -f deploy/internal/compose.yaml)
say(){ printf '%s=%s\n' "$1" "$2"; }
echo "=== HANDYOS V1 READ-ONLY RELEASE GATE ==="
say SOURCE_SHA "$(git rev-parse --short=12 HEAD 2>/dev/null || echo UNAVAILABLE)"
if [[ -z "$(git status --porcelain 2>/dev/null)" ]]; then say SOURCE_CLEAN YES;else say SOURCE_CLEAN NO;fi
if [[ -f deploy/internal/.env && -f deploy/internal/private/app.env ]];then say PRIVATE_CONFIG PRESENT;else say PRIVATE_CONFIG MISSING;fi
if command -v docker >/dev/null && command -v sudo >/dev/null && [[ -f deploy/internal/.env ]];then
  app_id="$("${dc[@]}" ps -q app 2>/dev/null || true)"
  db_id="$("${dc[@]}" ps -q db 2>/dev/null || true)"
  if [[ -n "$app_id" ]];then
    say APP_CONTAINER_RUNNING YES
    say APP_IMAGE_ID "$(sudo -n docker inspect -f '{{.Image}}' "$app_id" 2>/dev/null | cut -c1-26)"
    say APP_HEALTH "$(sudo -n docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "$app_id" 2>/dev/null || echo UNKNOWN)"
  else say APP_CONTAINER_RUNNING NO;fi
  if [[ -n "$db_id" ]];then
    say DATABASE_CONTAINER_RUNNING YES
    # Catalog only: no production rows or secrets. Migration status is a prerequisite, not evidence of data migration.
    query="select 'MIGRATION_013_RECURRING='||case when to_regclass('public.staff_recurring_pay_rules') is null then 'MISSING' else 'PRESENT' end union all select 'MIGRATION_014_JOB_UPDATE_POLICY='||case when exists(select 1 from pg_policies where schemaname='public' and tablename='jobs' and policyname='jobs_manager_update') then 'PRESENT' else 'MISSING' end;"
    status="$("${dc[@]}" exec -T db psql -X -U handyos_admin -d handyos -At -v ON_ERROR_STOP=1 -c "$query" 2>/dev/null)" || status="DATABASE_CATALOG_UNAVAILABLE"
    printf '%s\n' "$status"
  else say DATABASE_CONTAINER_RUNNING NO;fi
else say DOCKER_PREFLIGHT UNAVAILABLE;fi
if command -v curl >/dev/null;then
  api="$(curl -fsS --max-time 8 https://api-handyos.buitai.com/healthz 2>/dev/null || true)"
  if [[ "$api" == *'"ok"'* ]];then say API_HEALTH PASS;else say API_HEALTH BLOCKED;fi
  ui="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' https://handyos.buitai.com/ 2>/dev/null || true)"
  if [[ "$ui" == 200 ]];then say WEBSITE_HTTPS PASS;else say WEBSITE_HTTPS BLOCKED;fi
fi
if command -v aws >/dev/null;then say AWS_CLI PRESENT;else say AWS_CLI MISSING;fi
if systemctl is-enabled --quiet handyos-auto-release.timer 2>/dev/null;then say AUTO_RELEASE_TIMER ENABLED;else say AUTO_RELEASE_TIMER DISABLED;fi
say OFF_HOST_BACKUP UNVERIFIED
say ISOLATED_RESTORE UNVERIFIED
say RUNNING_IMAGE_SOURCE_SHA UNVERIFIED
echo "V1_NOT_RELEASE_APPROVED_UNTIL_BACKUP_RESTORE_AND_DEPLOY_PROOFS_PASS"
echo "HANDYOS_READONLY_V1_GATE_DONE"

#!/usr/bin/env bash
# HandyOS only: read-only, redacted release evidence. No secrets printed.
set -euo pipefail
cd "$(dirname "$0")/../.."
dc=(sudo docker compose --env-file deploy/internal/.env -f deploy/internal/compose.yaml)
echo "=== SOURCE ==="
git rev-parse --short HEAD
echo "=== CONTAINERS ==="
"${dc[@]}" ps
echo "=== RECURRING SCHEMA ==="
"${dc[@]}" exec -T db psql -X -U handyos_admin -d handyos -At -v ON_ERROR_STOP=1 -c "SELECT CASE WHEN to_regclass('public.staff_recurring_pay_rules') IS NULL THEN 'RECURRING_MIGRATION_ABSENT' WHEN (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.staff_recurring_pay_rules'::regclass) THEN 'RECURRING_MIGRATION_RLS_PASS' ELSE 'RECURRING_MIGRATION_RLS_BLOCKED' END;"
echo "=== API HEALTH ==="
curl -fsS --max-time 10 https://api-handyos.buitai.com/healthz
echo
echo "=== WEB HTTPS ==="
curl -sS --max-time 10 -o /dev/null -w "HTTP %{http_code}\n" https://handyos.buitai.com/
echo "HANDYOS_READONLY_RELEASE_STATUS_COMPLETE"

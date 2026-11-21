#!/usr/bin/env bash
# HandyOS-only release: fast-forward a verified main SHA, rebuild APP only,
# check live health and roll back the APP image if health checks fail.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
exec 9>/tmp/handyos-app-release.lock
flock -n 9 || { echo "BLOCKED: HandyOS release already running"; exit 1; }
dc=(sudo docker compose --env-file deploy/internal/.env -f deploy/internal/compose.yaml)
expected="${1:-}"
if [[ -n "$expected" && ! "$expected" =~ ^[0-9a-f]{40}$ ]]; then
  echo "BLOCKED: expected SHA must be a full 40-character commit"; exit 1
fi
[[ "$(git branch --show-current)" == "main" ]] || { echo "BLOCKED: main branch required"; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "BLOCKED: dirty working tree"; exit 1; }
test -f deploy/internal/.env && test -f deploy/internal/private/app.env || { echo "BLOCKED: private runtime config missing"; exit 1; }
"${dc[@]}" config --quiet
git fetch --no-tags origin main
new_sha="$(git rev-parse FETCH_HEAD)"
if [[ -n "$expected" && "$new_sha" != "$expected" ]]; then
  echo "BLOCKED: remote main SHA differs from approved CI SHA"; exit 1
fi
old_sha="$(git rev-parse HEAD)"
git merge-base --is-ancestor "$old_sha" "$new_sha" || { echo "BLOCKED: non-fast-forward"; exit 1; }
if [[ "$old_sha" == "$new_sha" ]]; then
  echo "NO_CHANGE: current main already deployed as source (check app separately)"; exit 0
fi
old_container="$("${dc[@]}" ps -q app)"
[[ -n "$old_container" ]] || { echo "BLOCKED: running app container missing"; exit 1; }
old_image="$(sudo docker inspect -f '{{.Image}}' "$old_container")"
[[ "$old_image" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "BLOCKED: old image unavailable"; exit 1; }
git merge --ff-only "$new_sha"
echo "Building HandyOS app at ${new_sha:0:12}"
"${dc[@]}" build app
restore_previous_app() {
  echo "HEALTH_CHECK_FAILED: restoring previous app image"
  sudo docker tag "$old_image" internal-app:latest
  "${dc[@]}" up -d --no-deps --no-build --force-recreate app
  for i in $(seq 1 18); do
    status="$("${dc[@]}" ps --format json app 2>/dev/null || true)"
    if echo "$status" | grep -q '"healthy"'; then
      echo "ROLLBACK_CONTAINER_HEALTHY"; return 0
    fi
    sleep 5
  done
  echo "ROLLBACK_NEEDS_OPERATOR_INSPECTION"
  return 1
}
"${dc[@]}" up -d --no-deps --no-build --force-recreate app
healthy=0
for i in $(seq 1 24); do
  cid="$("${dc[@]}" ps -q app)"
  if [[ -n "$cid" ]]; then
    state="$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid")"
    if [[ "$state" == "healthy" ]] && curl -fsS --max-time 8 https://api-handyos.buitai.com/healthz | grep -q '"ok"' && [[ "$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' https://handyos.buitai.com/)" == 200 ]]; then
      healthy=1; break
    fi
  fi
  sleep 5
done
if [[ "$healthy" != 1 ]]; then
  restore_previous_app || true
  exit 1
fi
echo "HANDYOS_APP_RELEASE_PASS ${new_sha:0:12}"

#!/usr/bin/env bash
# HandyOS-only, metadata-only readout for auto-release activation.
# Does not read/print secrets, perform backups or modify services.
set -euo pipefail
cd /home/ubuntu/HandyOS
echo '=== HANDYOS READ-ONLY AUTO-RELEASE PREFLIGHT ==='
printf 'SOURCE='
git rev-parse --short HEAD
printf 'CLEAN='
if [[ -z "$(git status --porcelain)" ]]; then echo PASS; else echo BLOCKED; fi
printf 'TIMER='
if systemctl is-enabled --quiet handyos-auto-release.timer 2>/dev/null; then
  echo ENABLED
else
  echo DISABLED
fi
printf 'SERVICE_STATE='
systemctl is-active handyos-auto-release.service 2>/dev/null || true
printf 'PRIVATE_CONFIG='
if [[ -f deploy/internal/.env && -f deploy/internal/private/app.env ]]; then
  echo PRESENT
else
  echo MISSING
fi
printf 'BACKUP_TOOLS='
found=0
for binary in pg_dump restic borg rclone aws; do
  if command -v "$binary" >/dev/null 2>&1; then
    printf '%s ' "$binary"
    found=1
  fi
done
[[ "$found" == 1 ]] || printf 'NONE_DETECTED'
printf '\n'
printf 'BACKUP_TIMERS='
# Names only, no unit bodies/config or credentials.
matches="$(systemctl list-timers --all --no-legend --no-pager 2>/dev/null | awk 'tolower($0) ~ /handyos.*backup|backup.*handyos/ {print $NF}' | sort -u | paste -sd, -)"
echo "${matches:-NONE_DETECTED}"
printf 'BACKUP_RESTORE_EVIDENCE='
echo UNVERIFIED_MANUAL_CHECK_REQUIRED
printf 'DATABASE='
if sudo -n docker compose --env-file deploy/internal/.env -f deploy/internal/compose.yaml ps --status running --services 2>/dev/null | grep -qx db; then
  echo RUNNING
else
  echo NEEDS_REVIEW
fi
echo 'PREFLIGHT_COMPLETE_NO_MUTATIONS'

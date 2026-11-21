#!/usr/bin/env bash
# ONE-TIME installation only after owner verifies off-host backup and restore.
set -euo pipefail
cd /home/ubuntu/HandyOS
[[ "$(id -un)" == "ubuntu" ]] || { echo "BLOCKED: expected dedicated ubuntu operator"; exit 1; }
[[ -f deploy/internal/private/app.env && -f deploy/internal/.env ]] || { echo "BLOCKED: HandyOS private config absent"; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo "BLOCKED: local source modifications"; exit 1; }
sudo install -m 0644 deploy/internal/handyos-auto-release.service /etc/systemd/system/handyos-auto-release.service
sudo install -m 0644 deploy/internal/handyos-auto-release.timer /etc/systemd/system/handyos-auto-release.timer
sudo systemctl daemon-reload
sudo systemctl enable --now handyos-auto-release.timer
sudo systemctl list-timers --all handyos-auto-release.timer --no-pager
echo "HANDYOS_TIMER_CONFIGURED: outbound-only; GitHub SSH secrets not required"

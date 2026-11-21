# HandyOS auto-release — outbound-only, one small VM

HandyOS remains on its existing Lightsail host with isolated private PostgreSQL and Caddy. This version **does not use GitHub SSH deployment secrets**, GitHub hosted-runner access to the VM, AWS permissions, IAM or extra paid services.

## Release process

An Ubuntu systemd timer checks every 10 minutes. The `poll-release.py` gate fetches only public GitHub main metadata and GitHub Actions results over HTTPS. Automatic deployment occurs **only** when the exact main SHA has a successful push-triggered single-package build, all other relevant push CI seen for that SHA are successful, the Git history is fast-forward, and the commit contains **no** backend migrations or infrastructure changes. Network errors, missing CI and failed CI block deployment.

The existing `release-app.sh` then checks its input SHA, rebuilds/replaces only the HandyOS app Docker container, verifies container/API/website health, and attempts to restore the old image on failure. A successful release SHA marker is recorded in `/home/ubuntu/.local/state/handyos/deployed-sha`. A failed/interrupted release leaves the marker unchanged so the next timer activation can retry. This is best-effort rollback, not zero-downtime or a verified data restore.

## One-time host activation — NOT YET DONE

Before enabling the timer, the Owner must verify encrypted off-host database backups **and** an isolated restore test, and inspect the app-only rollback constraints. Deployment scripts do **not** apply database schema migrations. Stop if a pending release includes `backend/migrations/`, `cloud/` or `deploy/internal/compose.yaml`. Manual schema changes require separate bounded authorization.

The host operator can inspect eligibility without deploying:

```bash
cd /home/ubuntu/HandyOS
python3 deploy/internal/poll-release.py --check
```

After verifying backups and approving the one-time scheduling change, install the timer on the dedicated HandyOS Lightsail host:

```bash
bash deploy/internal/auto-release-outbound-setup.sh
```

To inspect the timer and most recent run:

```bash
sudo systemctl list-timers handyos-auto-release.timer --no-pager
sudo journalctl -u handyos-auto-release.service -n 30 --no-pager
```

To stop future auto releases without stopping the website:

```bash
sudo systemctl disable --now handyos-auto-release.timer
```

**Scope:** only /home/ubuntu/HandyOS, one app container, existing fixed domain and existing postgres. No AWS account-wide changes, no Core, no automatic database migration, no direct GitHub SSH. The public GitHub Actions API must remain accessible and the HandyOS repository public; otherwise this gate fails closed. Current repo is public, but live VM network and backups remain unverified.

Production activation is **not** implied by merging a PR; the one-time host timer setup must be explicitly performed and then validated by observing an actual release log.

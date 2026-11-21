# HandyOS one-action release

This release automation affects only the existing `/home/ubuntu/HandyOS` Lightsail application container. It must **not** create AWS resources, run migrations, restart Postgres/Caddy or touch other ventures.

**How it works:** On a successful push build for `main`, the workflow checks the main SHA and any other push CI results, then securely SSHes into the dedicated HandyOS VM. The host script fetches precisely that SHA, requires clean main and fast-forward history, builds only `app`, replaces only `app`, and checks Docker app health + production API + HTTPS. If those checks fail, it attempts to restore the previous Docker app image and emits a failure for follow-up. Rollback is best-effort, not a substitute for backups or full end-to-end testing.

**One-time configuration required before automatic releases work:**
- Create a **dedicated HandyOS-only** restricted deployment SSH account/key (do not reuse BuiTai/Core credentials). It must have tightly scoped access to the HandyOS repo and Docker; on this single host Docker privileges are effectively root, so minimize access and secure the key.
- Verify the dedicated server SSH firewall allows the chosen runner source, or arrange a fixed approved runner network. Do not open unrestricted SSH just for automation.
- Configure GitHub Actions repository secrets `HANDYOS_DEPLOY_HOST`, `HANDYOS_DEPLOY_USER`, `HANDYOS_DEPLOY_SSH_KEY` and `HANDYOS_DEPLOY_KNOWN_HOSTS`. The latter must be the pre-verified host public key (not collected with unverified ssh-keyscan during each deploy).
- Require protected `main` and the relevant CI checks. No production deployment occurs without all four secrets, and no secret values should be posted to chat or stored in Git.
- Ensure existing off-host encrypted PostgreSQL backups and restore tests. This tool never modifies the database and is not a backup tool.

**Current activation:** Source-only until those secrets, firewall and backups are verified. The workflow may run and report release skipped when the setup is incomplete.

**Fallback on VM:** `bash deploy/internal/release-app.sh` performs one guarded update instead of five manual commands. Supply a full approved commit SHA to pin a release: `bash deploy/internal/release-app.sh <40-character-main-sha>`. If the source already equals the remote SHA, the script still rebuilds and checks the app. This supports safe retries if source was updated but the previous rollout was interrupted.

Monitor GitHub Actions / HandyOS app-only production release. Only count `HANDYOS_APP_RELEASE_PASS` as a completed application rollout; the workflow itself completing with missing secrets does not mean the app was updated.

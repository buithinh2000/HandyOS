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
 assert.match(s,/api-handyos\.buitai\.com\/healthz/);
 assert.doesNotMatch(s,/\b(?:down|volume rm|prune|migrate|do-release-upgrade|aws lightsail)\b/);
});
test("GitHub deploy workflow requires pinned SSH host identity and release CI",()=>{
 const w=read(".github/workflows/handyos-app-release.yml");
 assert.match(w,/workflow_run:/);
 assert.match(w,/concurrency:/);
 assert.match(w,/StrictHostKeyChecking=yes/);
 assert.match(w,/HANDYOS_DEPLOY_KNOWN_HOSTS/);
 assert.match(w,/HANDYOS_DEPLOY_SSH_KEY/);
 assert.match(w,/head_sha/);
 assert.doesNotMatch(w,/StrictHostKeyChecking=no|ssh-keyscan|aws configure/);
});

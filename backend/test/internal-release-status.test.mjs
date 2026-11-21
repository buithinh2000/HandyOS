import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const script=readFileSync(new URL("../../deploy/internal/release-status.sh",import.meta.url),"utf8");
test("HandyOS release diagnostic stays read-only and isolated",()=>{
 assert.match(script,/set -euo pipefail/);
 assert.match(script,/git rev-parse --short HEAD/);
 assert.match(script,/relrowsecurity AND relforcerowsecurity/);
 assert.match(script,/RECURRING_MIGRATION_RLS_PASS/);
 assert.match(script,/docker compose/);
 assert.doesNotMatch(script,/\b(?:create|drop|delete|update|insert|alter|migrate|restore|checkout|build|restart|stop)\s+(?:table|database|role|instance|user|app|db)\b/i);
 assert.doesNotMatch(script,/aws |pg_dump|aws_secret|DATABASE_URL|private\/app.env/);
});

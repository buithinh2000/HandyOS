import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const compose=read("deploy/internal/compose.yaml");
const config=read("deploy/internal/Caddyfile");
const server=read("backend/src/server.mjs");
test("Internal release has only one application, private PostgreSQL and HTTPS gateway",()=>{
 assert.match(compose,/^  gateway:/m);
 assert.match(compose,/^  app:/m);
 assert.match(compose,/^  db:/m);
 const app=compose.split("  app:")[1].split("  db:")[0];
 const db=compose.split("  db:")[1].split("secrets:")[0];
 assert.match(compose,/private_db:\s*\n    internal: true/);
 assert.match(app,/networks: \[front, private_db\]/);
 assert.match(db,/networks: \[private_db\]/);
 assert.doesNotMatch(app,/\n    ports:/);
 assert.doesNotMatch(db,/\n    ports:/);
 assert.match(compose,/"80:80"/);
 assert.match(compose,/"443:443"/);
 assert.match(compose,/POSTGRES_PASSWORD_FILE: \/run\/secrets\/db_admin_password/);
 assert.doesNotMatch(compose,/(?:postgresql:\/\/|AKIA[0-9A-Z]{16}|password=|secret_access_key=)/i);
 assert.match(config,/reverse_proxy app:8080/g);
 assert.doesNotMatch(config,/reverse_proxy db:5432/);
});
test("Database TLS bypass only for named Docker-private service, never public hostname",()=>{
 assert.match(server,/HANDYOS_DB_MODE==="docker-private"/);
 assert.match(server,/dbUrl.hostname==="db"/);
 assert.match(server,/dbUrl.port==="5432"/);
 assert.match(server,/dbUrl.pathname==="\/handyos"/);
 assert.match(server,/dbUrl.username==="handyos_runtime"/);
 assert.match(server,/if\(process.env.HANDYOS_DB_MODE&& !localDb\)/);
 assert.match(server,/ssl: localDb\?false:/);
});
test("Credentials, customer backups and local configuration excluded from git",()=>{
 const ignore=read(".gitignore");
 for(const item of ["deploy/internal/private/","deploy/internal/backups/","deploy/internal/.env"])
  assert.ok(ignore.includes(item));
});

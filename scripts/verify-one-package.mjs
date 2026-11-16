// Offline source-only release layout contract; no Docker daemon/AWS required.
import {readFileSync,existsSync} from "node:fs";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
const repo=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(repo,path),"utf8");
const docker=read("Dockerfile"),ignore=read(".dockerignore");
const pkg=JSON.parse(read("backend/package.json"));
const required=["backend/src/server.mjs","shared/renovation-catalog.json","backend/src/receipt-workflow.mjs","backend/src/receipt-s3-adapter.mjs","backend/src/receipt-http-routes.mjs","backend/src/frontend-assets.mjs","web/index.html","web/boot.mjs"];
for(const path of required)assert.ok(existsSync(resolve(repo,path)),"Missing API source: "+path);
assert.match(docker,/^FROM node:22-alpine/m);
assert.match(docker,/^USER node$/m);
assert.match(docker,/COPY backend\/src \.\/backend\/src/);
assert.match(docker,/COPY shared \.\/shared/);
assert.match(docker,/COPY web \.\/web/);
assert.match(docker,/CMD \["node","backend\/src\/server.mjs"\]/);
assert.ok(!/COPY \. \.|COPY cloud|COPY owner-v1\.html/.test(docker),"Must not bundle demo or infra credentials");
for(const word of ["DATABASE_URL","COGNITO_USER_POOL_ID","COGNITO_APP_CLIENT_ID","AWS_REGION"])
 assert.ok(read("backend/src/server.mjs").includes(word),"Backend must fail closed without "+word);
for(const pattern of ["**/.env","**/node_modules","**/cloud","**/tests","**/.git"])
 assert.ok(ignore.includes(pattern),"Exclude from build context: "+pattern);
for(const dep of ["pg","aws-jwt-verify","@aws-sdk/client-s3","@aws-sdk/s3-request-presigner"])
 assert.ok(pkg.dependencies[dep],"Missing runtime package: "+dep);
assert.match(read("backend/src/server.mjs"),/sendHandyOsFrontend/);
console.log("HandyOS one-package frontend + API build contract PASS (source-only; not deployed)");

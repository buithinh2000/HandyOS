import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const workflow=readFileSync(new URL("../.github/workflows/owner-lambda-artifact.yml",import.meta.url),"utf8");
const gate=readFileSync(new URL("../cloud/SECURITY-GATE.md",import.meta.url),"utf8");
test("reviewed dependency digest must be verified before npm ci or any bundle step",()=>{
 const expected="a2f22aba6b58609521c1815c2914905d1f4772dfcaa9a9f92c9bbcc3d267921f";
 const lock=readFileSync(new URL("../cloud/build/package-lock.json",import.meta.url));
 assert.equal(createHash("sha256").update(lock).digest("hex"),expected);
 const packageLock=JSON.parse(lock.toString("utf8"));
 assert.equal(packageLock.lockfileVersion,3);
 assert.equal(packageLock.packages["node_modules/@aws-sdk/client-s3"].version,"3.901.0");
 assert.ok(workflow.includes(expected+"  package-lock.json"));
 const verify=workflow.indexOf("sha256sum -c -");
 const install=workflow.indexOf("npm ci --ignore-scripts");
 const bundle=workflow.indexOf("esbuild cloud/lambda.mjs");
 assert.ok(verify>0&&verify<install&&install<bundle);
 assert.doesNotMatch(workflow,/npm install --package-lock-only/);
 assert.match(workflow,/permissions:\s*\n\s*contents: read/);
 assert.doesNotMatch(workflow,/configure-aws-credentials|aws cloudformation deploy|aws s3 cp|aws lambda update-function-code/);
});
test("preflight gate keeps staging and production blocked without identity, review and approval",()=>{
 assert.match(gate,/NO-GO/i);
 assert.match(gate,/NO-GO/i);
});

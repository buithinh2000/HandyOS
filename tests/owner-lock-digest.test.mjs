import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL("../.github/workflows/owner-lambda-artifact.yml",import.meta.url),"utf8");
const gate=readFileSync(new URL("../cloud/SECURITY-GATE.md",import.meta.url),"utf8");
test("reviewed dependency digest must be verified before npm ci or any bundle step",()=>{
 const expected="a2f22aba6b58609521c1815c2914905d1f4772dfcaa9a9f92c9bbcc3d267921f";
 assert.ok(workflow.includes(expected+"  package-lock.json"));
 const verify=workflow.indexOf("sha256sum -c -");
 const install=workflow.indexOf("npm ci --no-audit");
 const bundle=workflow.indexOf("esbuild cloud/lambda.mjs");
 assert.ok(verify>0&&verify<install&&install<bundle);
 assert.match(workflow,/permissions:\s*\n\s*contents: read/);
 assert.doesNotMatch(workflow,/configure-aws-credentials|aws cloudformation deploy|aws s3 cp|aws lambda update-function-code/);
});
test("preflight gate keeps staging and production blocked without identity, review and approval",()=>{
 assert.match(gate,/NO-GO/i);
 assert.match(gate,/not yet committed/i);
});

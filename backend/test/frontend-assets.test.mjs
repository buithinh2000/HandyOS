import test from "node:test";
import assert from "node:assert/strict";
import {frontendRoute,publicHandyOsConfig} from "../src/frontend-assets.mjs";
const env={
 HANDYOS_UI_ORIGIN:"https://staging.handyos.buitai.com",
 HANDYOS_API_ORIGIN:"https://api-staging.handyos.buitai.com",
 HANDYOS_COGNITO_DOMAIN:"https://handyos-staging.auth.ap-southeast-1.amazoncognito.com",
 HANDYOS_COGNITO_CLIENT_ID:"handyosclient12345",
 DATABASE_URL:"postgresql://admin:never-expose@db.local/mydb",
 AWS_SECRET_ACCESS_KEY:"PRIVATE_DO_NOT_LEAK",
 HANDYOS_RECEIPT_KMS_KEY:"arn:aws:kms:ap-southeast-1:111122223333:key/private"
};
test("cloud frontend and backend bundle serve fixed HTML and JS assets only",()=>{
 for(const path of ["/","/auth/callback","/assets/boot.mjs",
  "/assets/handyos-login-shell.mjs","/assets/handyos-cognito-pkce.mjs",
  "/assets/handyos-cloud-bills-app.mjs","/assets/receipt-cloud-view.mjs"]){
  const response=frontendRoute(path,"GET",env);
  assert.equal(response.status,200,path);
  assert.ok(response.body.length>40,path);
  assert.equal(response.headers["cache-control"],"no-store");
  assert.equal(response.headers["x-content-type-options"],"nosniff");
 }
 const index=frontendRoute("/","GET",env).body.toString();
 assert.match(index,/\/assets\/boot.mjs/);
 assert.ok(!index.includes("owner-v1.html"));
 const csp=frontendRoute("/","GET",env).headers["content-security-policy"];
 assert.match(csp,/script-src 'self'/);
 assert.match(csp,/frame-ancestors 'none'/);
});
test("private API routes, legacy demo, traversal, arbitrary files and methods are not served as public UI",()=>{
 for(const path of ["/v1/me","/v1/jobs","/owner-v1.html","/cloud/staging-stack.json",
  "/backend/src/server.mjs","/assets/../../.env","/assets/frontend-assets.mjs",
  "/assets/receipt-postgres-repository.mjs","/assets/unknown.mjs","/favicon.ico"]){
  assert.equal(frontendRoute(path,"GET",env),null,path);
 }
 for(const method of ["POST","DELETE","PUT","OPTIONS"]){
  assert.equal(frontendRoute("/auth/callback",method,env),null);
 }
});
test("public runtime JSON contains only validated non-secret Cognito/client and HandyOS origins",()=>{
 const c=publicHandyOsConfig(env);
 assert.deepEqual(Object.keys(c).sort(),["apiOrigin","clientId","issuerOrigin","uiOrigin"]);
 const result=frontendRoute("/config.json","GET",env);
 assert.equal(result.status,200);
 const data=JSON.parse(result.body);
 assert.equal(data.uiOrigin,env.HANDYOS_UI_ORIGIN);
 assert.equal(data.apiOrigin,env.HANDYOS_API_ORIGIN);
 assert.equal(data.issuerOrigin,env.HANDYOS_COGNITO_DOMAIN);
 assert.equal(data.clientId,env.HANDYOS_COGNITO_CLIENT_ID);
 for(const v of [env.DATABASE_URL,env.AWS_SECRET_ACCESS_KEY,env.HANDYOS_RECEIPT_KMS_KEY])
  assert.ok(!JSON.stringify(data).includes(v));
});
test("cloud UI refuses config if Cognito, API or frontend host not isolated",()=>{
 for(const delta of [
  {HANDYOS_UI_ORIGIN:"https://buitai.com"},
  {HANDYOS_API_ORIGIN:"https://api-staging.buitai.com"},
  {HANDYOS_COGNITO_DOMAIN:"https://buitai-core.auth.ap-southeast-1.amazoncognito.com"},
  {HANDYOS_COGNITO_CLIENT_ID:""},
  {HANDYOS_API_ORIGIN:"https://api-staging.handyos.buitai.com.evil.com"}
 ]){
  const result=frontendRoute("/config.json","GET",{...env,...delta});
  assert.equal(result.status,503);
  assert.equal(JSON.parse(result.body).error,"HandyOS cloud not configured");
  assert.ok(!result.body.toString().includes("postgresql"));
 }
});
test("production HTTPS login and CSP use only validated production API / dedicated Cognito",()=>{
 const production={...env,HANDYOS_UI_ORIGIN:"https://handyos.buitai.com",
  HANDYOS_API_ORIGIN:"https://api-handyos.buitai.com",
  HANDYOS_COGNITO_DOMAIN:"https://handyos-production.auth.ap-southeast-1.amazoncognito.com"};
 const runtime=publicHandyOsConfig(production);
 assert.equal(runtime.uiOrigin,"https://handyos.buitai.com");
 for(const path of ["/","/auth/callback"]){
  const response=frontendRoute(path,"GET",production);
  assert.equal(response.status,200);
  const policy=response.headers["content-security-policy"];
  assert.match(policy,/connect-src 'self' https:\/\/api-handyos\.buitai\.com /);
  assert.ok(policy.includes(production.HANDYOS_COGNITO_DOMAIN));
  assert.ok(!policy.includes("api-staging.handyos.buitai.com"));
  assert.ok(!policy.includes("handyos-staging.auth"));
 }
 const stage=frontendRoute("/","GET",env).headers["content-security-policy"];
 assert.ok(stage.includes(env.HANDYOS_API_ORIGIN));
 assert.ok(stage.includes(env.HANDYOS_COGNITO_DOMAIN));
 assert.ok(!stage.includes(production.HANDYOS_API_ORIGIN));
});
test("untrusted or incomplete runtime config never serves an active login shell",()=>{
 const invalid=[{...env,HANDYOS_COGNITO_CLIENT_ID:""},
  {...env,HANDYOS_API_ORIGIN:"https://api-buitai.buitai.com"},
  {...env,HANDYOS_UI_ORIGIN:"https://evil.com"},
  {...env,HANDYOS_COGNITO_DOMAIN:"https://buitai-core.auth.ap-southeast-1.amazoncognito.com"}];
 for(const props of invalid){
  for(const path of ["/","/auth/callback","/config.json"]){
   const route=frontendRoute(path,"GET",props);
   assert.equal(route.status,503,path);
   assert.ok(!route.body.toString().includes(env.DATABASE_URL));
   assert.ok(!route.body.toString().includes(env.AWS_SECRET_ACCESS_KEY));
  }
 }
});
test("HEAD returns same fixed bytes and cannot open API or secret routes",()=>{
 assert.equal(frontendRoute("/config.json","HEAD",env).status,200);
 assert.equal(frontendRoute("/v1/companies","HEAD",env),null);
});

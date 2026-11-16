import test from "node:test";
import assert from "node:assert/strict";
import {createHandyOsApiTransport} from "../src/handyos-cloud-api-transport.mjs";
const uiOrigin="https://staging.handyos.buitai.com",apiOrigin="https://api-staging.handyos.buitai.com";
const tenant="11111111-1111-4111-8111-111111111111";
const session={accessToken:async()=>"synthetic-access-token-long-enough",tenantId:async()=>{throw Error("No tenant selected")}};
test("company list bootstraps with verified bearer only, not guessed company",async()=>{
 const calls=[];
 const t=createHandyOsApiTransport({uiOrigin,apiOrigin,locationOrigin:uiOrigin,session,fetcher:async(url,opts)=>{
  calls.push({url,opts});return{ok:true,status:200,json:async()=>({companies:[{tenant_id:tenant,role:"owner"}]})}
 }});
 assert.deepEqual(await t.listCompanies(),[{tenant_id:tenant,role:"owner"}]);
 assert.equal(calls.length,1);assert.equal(calls[0].url,apiOrigin+"/v1/companies");
 assert.deepEqual(calls[0].opts.headers,{authorization:"Bearer synthetic-access-token-long-enough"});
 await assert.rejects(t.request({path:"/v1/jobs"}),/unavailable/);
});
test("company bootstrap rejects worker, duplicate, invalid IDs or upstream failures",async()=>{
 const scenarios=[
 [{tenant_id:tenant,role:"worker"}],
 [{tenant_id:tenant,role:"owner"},{tenant_id:tenant,role:"manager"}],
 [{tenant_id:"bogus",role:"owner"}]
 ];
 for(const companies of scenarios){
  const t=createHandyOsApiTransport({uiOrigin,apiOrigin,locationOrigin:uiOrigin,session,fetcher:async()=>({
   ok:true,status:200,json:async()=>({companies})
  })});
  await assert.rejects(t.listCompanies(),/unavailable/);
 }
 const t=createHandyOsApiTransport({uiOrigin,apiOrigin,locationOrigin:uiOrigin,session,fetcher:async()=>{throw Error("Sensitive SQL data")}});
 await assert.rejects(t.listCompanies(),e=>e.message==="HandyOS authenticated API unavailable");
});

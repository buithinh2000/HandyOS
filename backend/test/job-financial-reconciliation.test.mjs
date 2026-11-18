import test from "node:test";
import assert from "node:assert/strict";
import {dispatchJobReconciliation} from "../src/job-financial-reconciliation.mjs";
const tenant="11111111-1111-4111-8111-111111111111",job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function mock({confirmed=true,legacy=0,receipts=1,received="550.00",open=0,variation="0.00"}={}){
 const queries=[];
 const db={query:async(sql,params=[])=>{
  queries.push({sql,params});
  if(sql.includes("from jobs"))return{rowCount:1,rows:[{id:job}]};
  if(sql.includes("from job_forecast_inputs"))return{rowCount:confirmed?1:0,
   rows:confirmed?[{contract_inc_gst:"11000.00",approved_variation_inc_gst:variation,owner_confirmed_at:new Date().toISOString()}]:[]};
  if(sql.includes("from payments p"))return{rowCount:1,rows:[{cnt:legacy}]};
  if(sql.includes("from job_contract_receipts"))return{rowCount:1,rows:[{cnt:receipts,received}]};
  if(sql.includes("from attendance_entries"))return{rowCount:1,rows:[{cnt:open}]};
  throw Error("Unexpected query: "+sql);
 }};
 return {db,queries};
}
const path="/v1/jobs/"+job+"/financials/reconciliation";
async function read(db,role="owner",method="GET"){
 return dispatchJobReconciliation({db,ctx:{tenant_id:tenant,role},method,path});
}
test("reconciliation evidence NEVER exposes final profit or assumes cash completeness",async()=>{
 const {db,queries}=mock();
 const r=(await read(db)).reconciliation;
 assert.equal(r.profitReady,false);
 assert.equal(r.reconciled,false);
 assert.equal(r.adjustedContractInc,"11000.00");
 assert.equal(r.newContractReceiptsInc,"550.00");
 assert.equal(r.checks.find(x=>x.key==="contract_receipts").status,"recorded");
 assert.equal(r.checks.find(x=>x.key==="variation_evidence").status,"unverified");
 assert.equal(r.checks.find(x=>x.key==="cost_completeness").status,"unverified");
 assert.equal(queries.length,5);
 assert.ok(queries.every(x=>x.params[0]===tenant&&x.params[1]===job));
 assert.ok(queries.every(x=>/^select /i.test(x.sql)));
});
test("missing inputs, legacy payments and open shifts remain visibly blocked",async()=>{
 const {db}=mock({confirmed:false,legacy:3,receipts:0,received:"0",open:2});
 const r=(await read(db)).reconciliation;
 assert.equal(r.adjustedContractInc,null);
 assert.equal(r.checks.find(x=>x.key==="forecast_inputs").status,"missing");
 assert.equal(r.checks.find(x=>x.key==="legacy_payments").status,"blocked");
 assert.equal(r.checks.find(x=>x.key==="attendance").status,"blocked");
 assert.equal(r.checks.find(x=>x.key==="contract_receipts").status,"unverified");
 assert.equal(r.profitReady,false);
});
test("cash exceeding adjusted contract flags a blocker without classifying as profit",async()=>{
 const {db}=mock({received:"13000.00"});
 const r=(await read(db)).reconciliation;
 assert.equal(r.checks.find(x=>x.key==="cash_limit").status,"blocked");
 assert.equal(r.profitReady,false);
});
test("worker/homeowner and mutation routes are denied before database queries",async()=>{
 for(const [role,method] of [["worker","GET"],["homeowner","GET"],["owner","POST"]]){
  const {db,queries}=mock();
  await assert.rejects(read(db,role,method),x=>x.status===403||x.status===404);
  assert.equal(queries.length,0);
 }
});

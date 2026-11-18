import test from "node:test";
import assert from "node:assert/strict";
import {dispatchJobForecastInputs} from "../src/job-forecast-inputs.mjs";
const tenant="11111111-1111-4111-8111-111111111111";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ctx={tenant_id:tenant,role:"owner",actorSub:"owner-synthetic"};
const payload={contractInc:11000,approvedVariationInc:880,remainingCostsEx:500,
 unbookedOverheadEx:200,taxReservePercent:15,expectedUpdatedAt:null};
const row={contract_inc_gst:"11000.00",approved_variation_inc_gst:"880.00",
 remaining_cost_ex_gst:"500.00",unbooked_overhead_ex_gst:"200.00",
 tax_reserve_percent:"15.00",owner_confirmed_at:"2026-11-18T10:00:00.000Z",
 updated_at:"2026-11-18T10:00:00.000Z"};
function dbMock({stored=null,existingJob=true}={}){
 const calls=[];
 const db={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes("from jobs"))return{rowCount:existingJob?1:0,rows:existingJob?[{id:job}]:[]};
  if(sql.includes("from job_forecast_inputs")&&sql.includes("for update"))
   return{rowCount:stored?1:0,rows:stored?[stored]:[]};
  if(sql.includes("from job_forecast_inputs"))
   return{rowCount:stored?1:0,rows:stored?[stored]:[]};
  if(sql.includes("insert into job_forecast_inputs")||sql.includes("update job_forecast_inputs"))
   return{rowCount:1,rows:[row]};
  if(sql.includes("insert into audit_events"))return{rowCount:1,rows:[]};
  throw Error("Unexpected query: "+sql);
 }};
 return{db,calls};
}
function invoke({db,body=payload,method="POST",role="owner"}){
 return dispatchJobForecastInputs({db,ctx:{...ctx,role},method,
  path:"/v1/jobs/"+job+"/financials/forecast-inputs",readBody:async()=>body});
}
test("owner must explicitly save INC GST forecast assumptions without migrating old EX GST settings",async()=>{
 const {db,calls}=dbMock();
 const result=await invoke({db});
 assert.equal(result.forecastInputs.confirmed,true);
 assert.equal(result.forecastInputs.assumptions.contractInc,"11000.00");
 const write=calls.find(c=>c.sql.includes("insert into job_forecast_inputs"));
 assert.ok(write);
 assert.deepEqual(write.args,[tenant,job,"11000.00","880.00","500.00","200.00","15.00"]);
 assert.ok(!calls.some(c=>c.sql.includes("insert into job_financial_settings")||c.sql.includes("update job_financial_settings")));
 assert.ok(calls.some(c=>c.sql.includes("insert into audit_events")));
});
test("GET never claims confirmed inputs for missing record",async()=>{
 const {db,calls}=dbMock();
 const result=await invoke({db,method:"GET"});
 assert.deepEqual(result.forecastInputs,{jobId:job,recorded:false,confirmed:false,assumptions:null});
 assert.ok(calls.every(c=>!c.sql.includes("insert into")));
});
test("updates require original revision and preserve auditable tenant predicate",async()=>{
 const {db,calls}=dbMock({stored:row});
 const result=await invoke({db,body:{...payload,expectedUpdatedAt:row.updated_at}});
 assert.equal(result.forecastInputs.recorded,true);
 const update=calls.find(c=>c.sql.includes("update job_forecast_inputs"));
 assert.ok(update);
 assert.deepEqual(update.args.slice(0,2),[tenant,job]);
 assert.match(update.sql,/date_trunc\('milliseconds',updated_at\)=\$8::timestamptz/);
 assert.match(update.sql,/updated_at=greatest/);
});
test("stale/missing expected revision blocks write",async()=>{
 for(const version of [null,"2026-11-18T09:00:00.000Z"]){
  const {db,calls}=dbMock({stored:row});
  await assert.rejects(invoke({db,body:{...payload,expectedUpdatedAt:version}}),e=>e.status===409);
  assert.ok(!calls.some(c=>c.sql.includes("update job_forecast_inputs")));
 }
});
test("invalid contract, missing verified zero, unapproved fields and wrong roles are blocked",async()=>{
 const invalid=[
  {...payload,contractInc:-3},{...payload,contractInc:0},
  {...payload,approvedVariationInc:-12000},{...payload,taxReservePercent:101},
  {...payload,remainingCostsEx:undefined},{...payload,unbookedOverheadEx:-1},
  {...payload,contractInc:12000,tenantId:tenant},
  {...payload,approvedVariationInc:0.001}
 ];
 for(const body of invalid){
  const {db,calls}=dbMock();
  await assert.rejects(invoke({db,body}),e=>e.status===400);
  assert.ok(!calls.some(c=>c.sql.includes("insert into job_forecast_inputs")));
 }
 for(const role of ["worker","homeowner"]){
  const {db,calls}=dbMock();
  await assert.rejects(invoke({db,role}),e=>e.status===403);
  assert.equal(calls.length,0);
 }
});
test("tenant-specific missing jobs block reading or recording financial assumptions",async()=>{
 const {db,calls}=dbMock({existingJob:false});
 await assert.rejects(invoke({db}),e=>e.status===404);
 assert.equal(calls.length,1);
});

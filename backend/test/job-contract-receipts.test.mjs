import test from "node:test";
import assert from "node:assert/strict";
import {dispatchContractReceipts} from "../src/job-contract-receipts.mjs";
const tenant="11111111-1111-4111-8111-111111111111",job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const requestId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ctx={tenant_id:tenant,role:"owner",actorSub:"owner-synthetic"};
const payload={requestId,receivedOn:"2026-11-18",basis:"inc_gst",amount:1100,reference:"Customer bank transfer"};
function mock({records=[],legacy=0,previous=null}={}){
 const calls=[];
 const db={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes("from jobs")&&sql.includes("for update"))return{rowCount:1,rows:[{id:job}]};
  if(sql.includes("from job_contract_receipts")&&sql.includes("request_id=$2"))
   return{rowCount:previous?1:0,rows:previous?[previous]:[]};
  if(sql.includes("from job_contract_receipts"))
   return{rowCount:records.length,rows:records};
  if(sql.includes("count(p.id)"))return{rowCount:1,rows:[{legacy_count:legacy}]};
  if(sql.includes("from payments p")&&sql.includes("order by p.paid_on"))
   return{rowCount:legacy,rows:Array.from({length:legacy},(_,i)=>({
    id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",claim_id:job,
    paid_on:"2026-11-17",amount:"125.50",claim_reference:"Progress claim "+(i+1),
    claim_ex_gst:"100.00",claim_gst:"10.00",claim_status:"part_paid"
   }))};
  if(sql.includes("insert into job_contract_receipts"))return{rowCount:1,rows:[{id:requestId}]};
  if(sql.includes("insert into audit_events"))return{rowCount:1,rows:[]};
  throw Error("Unexpected SQL: "+sql);
 }};
 const run=(method="POST",body=payload,role="owner")=>dispatchContractReceipts({
  method,path:"/v1/jobs/"+job+"/financials/contract-receipts",ctx:{...ctx,role},
  db,readBody:async()=>body});
 return {db,calls,run};
}
test("cash receipt keeps INC GST and does not write expense or pass-through",async()=>{
 const s=mock();const res=await s.run();
 assert.equal(res.duplicate,false);
 const write=s.calls.find(x=>x.sql.includes("insert into job_contract_receipts"));
 assert.deepEqual(write.args.slice(0,5),[tenant,job,requestId,"2026-11-18","inc_gst"]);
 assert.deepEqual(write.args.slice(5,8),["1100.00","1100.00","100.00"]);
 assert.ok(s.calls.some(x=>x.sql.includes("insert into audit_events")));
 assert.ok(!s.calls.some(x=>/insert into (?:payments|material_reimbursements|cost_entries)/.test(x.sql)));
 assert.equal(res.contractReceipts.profitReady,false);
});
test("EX GST input converts to cash including GST with integer cents; NO GST stays unchanged",async()=>{
 for(const [basis,amount,gross,gst] of [["ex_gst",100,110,10],["no_gst",100,100,0],["inc_gst",110,110,10]]){
  const s=mock();await s.run("POST",{...payload,basis,amount});
  const write=s.calls.find(x=>x.sql.includes("insert into job_contract_receipts"));
  assert.equal(write.args[6],gross.toFixed(2),basis);
  assert.equal(write.args[7],gst.toFixed(2),basis);
 }
});
test("reading saved payments shows actual gross received and warns if legacy claims exist",async()=>{
 const s=mock({legacy:1,records:[{id:requestId,received_on:"2026-11-18",input_basis:"no_gst",
  entered_amount:"125.50",received_inc_gst:"125.50",gst_component:"0.00",reference:"bank transfer"}]});
 const result=(await s.run("GET")).contractReceipts;
 assert.equal(result.receivedIncGst,"125.50");
 assert.equal(result.legacyPaymentsPresent,true);
 assert.equal(result.legacyPayments.length,1);
 assert.equal(result.legacyPayments[0].enteredAmount,"125.50");
 assert.equal(result.legacyPayments[0].gstBasisVerified,false);
 assert.equal(result.receivedIncGst,"125.50",
  "Unverified legacy payments must not be silently included in new contract cash received");
 assert.match(result.note,/do not double count/i);
 assert.equal(result.profitReady,false);
 const sql=s.calls.find(x=>x.sql.includes("order by p.paid_on"));
 assert.deepEqual(sql.args,[tenant,job]);
});
test("existing legacy progress-claim payment blocks new cash capture, protecting against double count",async()=>{
 const s=mock({legacy:2});
 await assert.rejects(s.run("POST",payload),e=>e.status===409&&/Legacy claim payments/.test(e.message));
 assert.ok(!s.calls.some(x=>x.sql.includes("insert into job_contract_receipts")));
});
test("replay with same UUID and exact recorded content is idempotent",async()=>{
 const previous={job_id:job,received_on:"2026-11-18",input_basis:"inc_gst",
  entered_amount:"1100.00",received_inc_gst:"1100.00",gst_component:"100.00",
  reference:payload.reference};
 const s=mock({previous});const r=await s.run();
 assert.equal(r.duplicate,true);
 assert.ok(!s.calls.some(x=>x.sql.includes("insert into job_contract_receipts")));
 const bad=mock({previous});
 await assert.rejects(bad.run("POST",{...payload,amount:1200}),e=>e.status===409);
});
test("reject unauthorized, bad GST basis, future dates, forged tenant, invalid money without writing",async()=>{
 for(const [body,role] of [
  [payload,"worker"],[payload,"homeowner"],[{...payload,basis:"maybe"},"owner"],
  [{...payload,amount:-1},"owner"],[{...payload,amount:0.001},"owner"],
  [{...payload,receivedOn:"2026-02-30"},"owner"],
  [{...payload,receivedOn:"2099-12-01"},"owner"],
  [{...payload,tenantId:tenant},"owner"]]){
  const s=mock();await assert.rejects(s.run("POST",body,role));
  assert.ok(!s.calls.some(x=>x.sql.includes("insert into job_contract_receipts")));
 }
});

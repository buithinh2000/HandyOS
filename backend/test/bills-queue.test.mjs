import test from "node:test";
import assert from "node:assert/strict";
import {listBillsQueue} from "../src/bills-queue.mjs";
const tenant="11111111-1111-4111-8111-111111111111";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bill="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("owner can read only scoped material reimbursement metadata, never S3 keys",async()=>{
 const calls=[],db={query:async(sql,args)=>{
  calls.push({sql,args});return{rows:[{id:bill,job_id:job,job_name:"Bathroom",
   bought_on:"2026-11-16",store_reference:"Bunnings",
   amount_gross:"250.75",amount_received:"50.25",gst_basis:"inc",customer_status:"sent",
   sent_on:null,reimbursed_on:null,created_at:"2026-11-16"}]};
 }};
 const result=await listBillsQueue({db,ctx:{role:"owner",tenant_id:tenant}});
 assert.deepEqual(calls[0].args,[tenant]);
 assert.match(calls[0].sql,/where m\.tenant_id=\$1/);
 assert.match(calls[0].sql,/material_reimbursements/);
 assert.equal(result.bills.length,1);
 assert.deepEqual(result.bills[0],{
  id:bill,jobId:job,jobName:"Bathroom",boughtOn:"2026-11-16",
  storeReference:"Bunnings",amountGross:"250.75",amountReceived:"50.25",remaining:"200.50",gstBasis:"inc",status:"sent",
  sentOn:null,reimbursedOn:null
 });
 assert.equal(JSON.stringify(result).includes("receipt_object_key"),false);
 assert.match(result.note,/Not job revenue/);
});
test("Bills Queue denies workers and invalid tenants before any database query",async()=>{
 let count=0;const db={query:async()=>{count++;return{rows:[]}}};
 for(const ctx of [{role:"worker",tenant_id:tenant},{role:"homeowner",tenant_id:tenant},
  {role:"owner",tenant_id:"bad-tenant"}]){
  await assert.rejects(listBillsQueue({db,ctx}),x=>x.status===(ctx.role==="owner"?400:403));
 }
 assert.equal(count,0);
});
test("Queue does not invent statuses or show pending S3 upload intents",async()=>{
 const db={query:async()=>({rows:[]})};
 assert.deepEqual((await listBillsQueue({db,ctx:{role:"manager",tenant_id:tenant}})).bills,[]);
 const wrong={query:async()=>({rows:[{customer_status:"pending"}]})};
 await assert.rejects(listBillsQueue({db:wrong,ctx:{role:"owner",tenant_id:tenant}}),
  x=>x.status===503);
});

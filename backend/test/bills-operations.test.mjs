import test from "node:test";
import assert from "node:assert/strict";
import {dispatchBillsOperation} from "../src/bills-operations.mjs";
const tenant="11111111-1111-4111-8111-111111111111";
const bill="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requestId="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ctx={tenant_id:tenant,role:"owner",actorSub:"owner-test"};
function mock({status="draft",gross="250.75",received="0",existing=null}={}){
 const calls=[];
 const db={query:async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql.includes("from material_reimbursements")&&sql.includes("for update"))
   return {rowCount:1,rows:[{id:bill,customer_status:status,amount_gross:gross}]};
  if(sql.includes("coalesce(sum(amount_received)"))
   return {rowCount:1,rows:[{received}]};
  if(sql.includes("from material_reimbursement_events where tenant_id=$1 and request_id=$2"))
   return {rowCount:existing?1:0,rows:existing?[existing]:[]};
  return {rowCount:1,rows:[{id:bill}]};
 }};
 const request=(action,data)=>dispatchBillsOperation({method:"POST",path:"/v1/bills/"+bill+"/"+action,
  ctx,db,readBody:async()=>({requestId,date:"2026-11-18",reference:"Customer confirmed",...data})});
 return {request,calls};
}
test("manual sent confirmation is an audit event, not a claimed actual delivery",async()=>{
 const {request,calls}=mock();
 const result=await request("mark-sent",{channel:"message"});
 assert.deepEqual({status:result.status,received:result.amountReceived,remaining:result.remaining},
  {status:"sent",received:"0.00",remaining:"250.75"});
 assert.equal(calls.filter(x=>x.sql.includes("insert into material_reimbursement_events")).length,1);
 assert.ok(calls.some(x=>x.sql.includes("customer_status='sent'")));
 assert.ok(calls.some(x=>x.sql.includes("'material_reimbursement'")));
 assert.ok(calls.every(x=>!x.sql.includes("progress_claims")&&!x.sql.includes("cost_entries")));
});
test("partial repayment leaves bill sent; only full total marks reimbursed",async()=>{
 const partial=mock({status:"sent",received:"100.00"});
 const first=await partial.request("payment",{amount:50.25});
 assert.equal(first.status,"sent");
 assert.equal(first.amountReceived,"150.25");
 assert.equal(first.remaining,"100.50");
 assert.equal(partial.calls.some(x=>x.sql.includes("customer_status='reimbursed'")),false);
 const full=mock({status:"sent",received:"150.25"});
 const second=await full.request("payment",{amount:100.50});
 assert.equal(second.status,"reimbursed");
 assert.equal(second.amountReceived,"250.75");
 assert.equal(second.remaining,"0.00");
 assert.ok(full.calls.some(x=>x.sql.includes("customer_status='reimbursed'")));
});
test("overpayment and unconfirmed sent stage fail without adding ledger rows",async()=>{
 for(const [status,received,amount] of [["sent","200.00",51],["draft","0",50],["reimbursed","250.75",10]]){
  const {request,calls}=mock({status,received});
  await assert.rejects(request("payment",{amount}),e=>e.status===409);
  assert.equal(calls.some(x=>x.sql.includes("insert into material_reimbursement_events")),false);
 }
});
test("reused request UUID returns matching stored outcome without creating a second payment",async()=>{
 const {request,calls}=mock({status:"sent",received:"100.00",existing:{
  bill_id:bill,event_kind:"payment_received",happened_on:"2026-11-18",
  reference:"Customer confirmed",amount_received:"50.25",channel:null
 }});
 const duplicate=await request("payment",{amount:50.25});
 assert.equal(duplicate.duplicate,true);
 assert.equal(duplicate.amountReceived,"100.00");
 assert.equal(calls.some(x=>x.sql.includes("insert into material_reimbursement_events")),false);
});
test("deny worker, forged tenant, invalid amount, bad channel and extra client-owned fields",async()=>{
 for(const data of [
  {context:{...ctx,role:"worker"},action:"mark-sent",body:{channel:"message"}},
  {context:{...ctx,tenant_id:"invalid"},action:"mark-sent",body:{channel:"message"}},
  {context:ctx,action:"payment",body:{amount:0}},
  {context:ctx,action:"payment",body:{amount:4.001}},
  {context:ctx,action:"mark-sent",body:{channel:"unverified"}},
  {context:ctx,action:"mark-sent",body:{channel:"email",tenantId:tenant}}
 ]){
  const {calls}=mock();const db={query:async()=>{calls.push({});throw Error("Unexpected DB")}};
  await assert.rejects(dispatchBillsOperation({method:"POST",path:"/v1/bills/"+bill+"/"+data.action,
   ctx:data.context,db,readBody:async()=>({
    requestId,date:"2026-11-18",reference:"Confirmed",...data.body
   })}));
  assert.equal(calls.length,0);
 }
});

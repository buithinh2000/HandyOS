import test from "node:test";
import assert from "node:assert/strict";
import {readRecurringPayLines,dispatchRecurringPayRules} from "../src/recurring-pay-rules.mjs";
const tenant="11111111-1111-4111-8111-111111111111";
const staff="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const job="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const rule="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ctx={tenant_id:tenant,role:"owner",actorSub:"synthetic-owner"};
const week="2026-11-30";
const records=[
 {id:rule,job_id:job,kind:"allowance",label:"Site daily",cadence:"day",amount:"20.00"},
 {id:rule,job_id:job,kind:"bonus",label:"Weekly",cadence:"week",amount:"100.00"},
 {id:rule,job_id:job,kind:"bonus",label:"Monthly",cadence:"month",amount:"300.00"}
];
const shifts=[
 {job_id:job,work_date:"2026-11-30",finished_at:"2026-11-30T07:00:00Z",paid_day_portion:1},
 {job_id:job,work_date:"2026-12-01",finished_at:"2026-12-01T07:00:00Z",paid_day_portion:0.5},
 {job_id:job,work_date:"2026-12-02",finished_at:null,paid_day_portion:1},
 {job_id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",work_date:"2026-12-03",finished_at:"2026-12-03T07:00:00Z",paid_day_portion:1}
];
test("daily, weekly, and monthly rules each accrue exactly once without multiplying line items",async()=>{
 const db={query:async(sql,args)=>{assert.match(sql,/staff_recurring_pay_rules/);assert.deepEqual(args,[tenant,staff,week]);return {rows:records}}};
 const lines=await readRecurringPayLines(db,tenant,staff,week,shifts);
 assert.deepEqual(lines.map(x=>[x.cadence,x.amount,x.units]),[
  ["day","30.00",1.5],["week","100.00",1],["month","300.00",1]]);
 const again=await readRecurringPayLines(db,tenant,staff,week,shifts);
 assert.deepEqual(again,lines);
});
test("monthly bonus belongs to exactly the payroll week containing the calendar first",async()=>{
 const db={query:async()=>({rows:records})};
 const first=await readRecurringPayLines(db,tenant,staff,"2026-11-30",shifts);
 const following=await readRecurringPayLines(db,tenant,staff,"2026-12-07",[]);
 assert.equal(first.filter(x=>x.cadence==="month").length,1);
 assert.equal(following.filter(x=>x.cadence==="month").length,0);
});
test("new recurring rule can only start on next or later Monday; no backpay into closed weeks",async()=>{
 const writes=[];
 const db={query:async(sql,params)=>{
  writes.push({sql,params});
  if(sql.includes("from staff_profiles"))return {rowCount:1,rows:[{id:staff}]};
  if(sql.includes("from jobs"))return {rowCount:1,rows:[{id:job}]};
  if(sql.includes("insert into staff_recurring_pay_rules")||sql.includes("insert into audit_events"))return {rowCount:1,rows:[]};
  return {rowCount:1,rows:[]};
 }};
 const path="/v1/payroll/"+staff+"/rules";
 const call=(startsOn,role="owner")=>dispatchRecurringPayRules({method:"POST",path,ctx:{...ctx,role},db,
  now:()=>new Date("2026-11-21T00:00:00Z"),
  readBody:async()=>({jobId:job,kind:"bonus",label:"Travel",cadence:"week",amount:100,startsOn})});
 await assert.rejects(call("2026-11-16"),e=>e.status===400);
 await assert.rejects(call("2026-11-24"),e=>e.status===400);
 await assert.rejects(call("2026-11-23","worker"),e=>e.status===403);
 assert.equal(writes.filter(x=>x.sql.includes("insert into staff_recurring_pay_rules")).length,0);
 const created=await call("2026-11-23");
 assert.equal(created.rule.starts_on,"2026-11-23");
 assert.equal(writes.filter(x=>x.sql.includes("insert into staff_recurring_pay_rules")).length,1);
 assert.equal(writes.filter(x=>x.sql.includes("insert into audit_events")).length,1);
});
test("future rule can be stopped before its first effective week without deletion",async()=>{
 const seen=[];
 const db={query:async(sql,params)=>{
  seen.push({sql,params});
  if(sql.includes("from staff_profiles"))return {rowCount:1,rows:[{id:staff}]};
  if(sql.includes("update staff_recurring_pay_rules"))return {rowCount:1,rows:[{id:rule,stops_on:"2026-11-30"}]};
  return {rowCount:1,rows:[]};
 }};
 const response=await dispatchRecurringPayRules({
  method:"POST",path:"/v1/payroll/"+staff+"/rules/"+rule+"/stop",ctx,db,
  now:()=>new Date("2026-11-21T00:00:00Z"),readBody:async()=>({})
 });
 assert.equal(response.stopsOn,"2026-11-30");
 assert.match(seen.find(x=>x.sql.includes("update staff_recurring_pay_rules")).sql,/greatest\(starts_on/);
 assert.ok(seen.some(x=>x.sql.includes("insert into audit_events")));
});

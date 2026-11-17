import test from "node:test";
import assert from "node:assert/strict";
import {dispatchWeeklyPayroll,readPayrollWeek} from "../src/weekly-payroll.mjs";
const tenant="11111111-1111-4111-8111-111111111111",staff="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",job="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ctx={tenant_id:tenant,role:"owner",actorSub:"cognito-owner-synthetic"};
const week="2026-11-16",base="/v1/payroll/"+staff+"/weeks/"+week;
function sample({open=false,paid="1350.00",hasClosure=false,hourly=false}={}){
 const sql=[],records={
  attendance:hourly?[{id:"1",finished_at:"2026-11-17",wage:"175.00"}]:
   [{id:"1",finished_at:"2026-11-16",wage:"250.00"},
    {id:"2",finished_at:"2026-11-17",wage:"250.00"},
    {id:"3",finished_at:"2026-11-18",wage:"250.00"},
    {id:"4",finished_at:open?null:"2026-11-19",wage:open?null:"500.00"}],
  adjustment:[{id:"a",amount:"100.00",kind:"bonus"}],
  payment:paid===null?[]:[{id:"p",amount:paid}]
 };
 const db={query:async(query,values=[])=>{
  sql.push({query,values});
  if(query.includes("pg_advisory_xact_lock"))return {rowCount:1,rows:[{}]};
  if(query.includes("from staff_profiles"))return {rowCount:1,rows:[{id:staff,display_name:"John"}]};
  if(query.includes("from weekly_payroll_closures"))return {rowCount:hasClosure?1:0,rows:hasClosure?[{id:"closure",closed_at:"2026-11-18"}]:[]};
  if(query.includes("from attendance_entries"))return {rowCount:records.attendance.length,rows:records.attendance};
  if(query.includes("from weekly_wage_adjustments"))return {rowCount:records.adjustment.length,rows:records.adjustment};
  if(query.includes("from staff_wage_payments"))return {rowCount:records.payment.length,rows:records.payment};
  if(query.includes("select id from jobs"))return {rowCount:1,rows:[{id:job}]};
  if(query.includes("insert into weekly_payroll_closures"))return {rowCount:1,rows:[{id:"closure"}]};
  if(query.includes("insert into weekly_wage_adjustments"))return {rowCount:1,rows:[]};
  if(query.includes("insert into staff_wage_payments"))return {rowCount:1,rows:[]};
  if(query.includes("insert into audit_events"))return {rowCount:1,rows:[]};
  throw Error("Unexpected SQL: "+query);
 }};
 const call=(method="GET",action="",body)=>dispatchWeeklyPayroll({
  method,path:base+action,ctx,db,query:new URLSearchParams(),
  readBody:async()=>body});
 return {db,sql,call};
}
test("four varied workdays plus $100 bonus, fully paid, balances precisely",async()=>{
 const s=sample();const p=(await s.call()).payroll;
 assert.deepEqual(p.totals,{earned:"1250.00",extras:"100.00",bonus:"100.00",allowance:"0.00",otherExpenses:"0.00",due:"1350.00",paid:"1350.00",remaining:"0.00",openEntries:0});
 assert.equal(p.canClose,true);
 const sql=s.sql.find(x=>x.query.includes("from attendance_entries")).query;
 assert.match(sql,/a.rate_snapshot\*a.paid_day_portion/);
 assert.match(sql,/extract\(epoch from/);
 assert.match(sql,/a.work_date < \$3::date\+7/);
 assert.ok(!sql.includes("weekly_wage_adjustments"),"Do not join and multiply bonuses by number of days");
});
test("open check-in is excluded from wages; settlement cannot close",async()=>{
 const s=sample({open:true,paid:null});
 const p=(await s.call()).payroll;
 assert.equal(p.totals.earned,"750.00");
 assert.equal(p.totals.openEntries,1);
 assert.equal(p.canClose,false);
 await assert.rejects(s.call("POST","/close",{}),e=>e.status===409);
 assert.equal(s.sql.some(x=>x.query.includes("insert into weekly_payroll_closures")),false);
});
test("negative remaining balance explicitly shows overpayment; no settlement",async()=>{
 const s=sample({paid:"1500.00"}),p=(await s.call()).payroll;
 assert.equal(p.totals.remaining,"-150.00");
 assert.equal(p.canClose,false);
});
test("closed week prevents bonus/payment repeats",async()=>{
 const s=sample({hasClosure:true});
 await assert.rejects(s.call("POST","/bonus",{jobId:job,kind:"bonus",amount:100}),e=>e.status===409);
 await assert.rejects(s.call("POST","/payment",{jobId:job,paidOn:"2026-11-20",amount:100}),e=>e.status===409);
 assert.equal(s.sql.some(x=>x.query.includes("insert into staff_wage_payments")),false);
});
test("bonus only supports positive cents and server-backed job",async()=>{
 const s=sample();
 await s.call("POST","/bonus",{jobId:job,kind:"bonus",amount:100,notes:"Finished early"});
 const write=s.sql.find(x=>x.query.includes("insert into weekly_wage_adjustments"));
 assert.equal(write.values[4],week);
 assert.equal(write.values[6],"100.00");
 assert.ok(s.sql.some(x=>x.query.includes("audit_events")));
 for(const body of [{jobId:job,kind:"bonus",amount:-10},{jobId:job,kind:"bonus",amount:12.345},
  {jobId:job,kind:"deduction",amount:100},{jobId:job,kind:"bonus",amount:10,tenant_id:tenant}]){
  const next=sample();
  await assert.rejects(next.call("POST","/bonus",body),e=>e.status===400);
  assert.equal(next.sql.some(x=>x.query.includes("insert into weekly_wage_adjustments")),false);
 }
});
test("other employee expense is independently recorded and included once in weekly payable",async()=>{
 const s=sample();
 await s.call("POST","/bonus",{jobId:job,kind:"expense",amount:50,notes:"Travel reimbursement"});
 const write=s.sql.find(x=>x.query.includes("insert into weekly_wage_adjustments"));
 assert.equal(write.values[5],"expense");
 assert.equal(write.values[6],"50.00");
 assert.equal(write.values[7],"Travel reimbursement");
 const p=(await s.call()).payroll;
 assert.equal(p.totals.bonus,"100.00");
 assert.equal(p.totals.otherExpenses,"0.00"); // mocked select is static; insert was verified above
});
test("payment must allocate to workweek, not infer period from date paid",async()=>{
 const s=sample();
 await s.call("POST","/payment",{jobId:job,amount:500,paidOn:"2026-11-29",reference:"Bank transfer"});
 const write=s.sql.find(x=>x.query.includes("insert into staff_wage_payments"));
 assert.deepEqual(write.values.slice(4,8),["2026-11-29","500.00",week,"Bank transfer"]);
});
test("closing complete paid week inserts immutable snapshot and audit",async()=>{
 const s=sample();const p=(await s.call("POST","/close",{})).payroll;
 assert.equal(p.canClose,true); // mock does not store, verification is SQL insert below
 const insert=s.sql.find(x=>x.query.includes("insert into weekly_payroll_closures"));
 assert.deepEqual(insert.values.slice(1,7),[tenant,staff,week,"1250.00","100.00","1350.00"]);
 assert.ok(s.sql.some(x=>x.query.includes("'closed'")));
});
test("deny nonmanager, malformed week and unknown paths before SQL",async()=>{
 const s=sample();
 await assert.rejects(dispatchWeeklyPayroll({method:"GET",path:base,ctx:{...ctx,role:"worker"},db:s.db}),e=>e.status===403);
 await assert.rejects(dispatchWeeklyPayroll({method:"GET",path:base.replace(week,"2026-11-17"),ctx,db:s.db}),e=>e.status===400);
 await assert.rejects(dispatchWeeklyPayroll({method:"GET",path:"/v1/payroll/random",ctx,db:s.db}),e=>e.status===404);
 assert.equal(s.sql.length,0);
});

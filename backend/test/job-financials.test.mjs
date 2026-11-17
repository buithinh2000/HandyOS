import test from "node:test";
import assert from "node:assert/strict";
import {dispatchJobFinancials,readJobFinancials} from "../src/job-financials.mjs";
const tenant="11111111-1111-4111-8111-111111111111";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ctx={tenant_id:tenant,role:"owner",actorSub:"synthetic-owner"};
function setup({settings=true,open=false}={}){
 const queries=[],values={
  settings:settings?[{contract_ex_gst:"10000.00",reserve_percent:"15.00"}]:[],
  expense:[{kind:"material",amount_ex_gst:"800.00"},{kind:"other",amount_ex_gst:"150.00"}],
  attendance:[{finished_at:"2026-11-17T05:00:00Z",wage:"1250.00"},...(open?[{finished_at:null,wage:null}]:[])],
  adjustments:[{kind:"bonus",amount:"100.00"},{kind:"allowance",amount:"50.00"},{kind:"expense",amount:"20.00"}],
  reimbursements:[{customer_status:"draft",amount_gross:"550.00"},{customer_status:"reimbursed",amount_gross:"110.00"}]
 };
 const db={query:async(sql,args=[])=>{
  queries.push({sql,args});
  if(sql.includes("from jobs"))return {rowCount:1,rows:[{id:job,name:"Renovation"}]};
  if(sql.includes("from job_financial_settings"))return {rowCount:values.settings.length,rows:values.settings};
  if(sql.includes("from cost_entries"))return {rowCount:values.expense.length,rows:values.expense};
  if(sql.includes("from attendance_entries"))return {rowCount:values.attendance.length,rows:values.attendance};
  if(sql.includes("from weekly_wage_adjustments"))return {rowCount:values.adjustments.length,rows:values.adjustments};
  if(sql.includes("from material_reimbursements"))return {rowCount:values.reimbursements.length,rows:values.reimbursements};
  if(sql.includes("insert into")||sql.includes("audit_events"))return {rowCount:1,rows:[]};
  throw Error("Unexpected SQL");
 }};
 return {db,queries,values,call:(method="GET",action="",body)=>dispatchJobFinancials({
  method,path:"/v1/jobs/"+job+"/financials"+action,ctx,db,readBody:async()=>body})};
}
test("profit uses EX GST contract, recorded costs and earned wages, excluding bill reimbursements and payments",async()=>{
 const s=setup();const r=(await s.call()).financials;
 assert.equal(r.totals.contractExGst,"10000.00");
 assert.equal(r.costs.attendanceWages,"1250.00");
 assert.equal(r.costs.weeklyBonuses,"170.00");
 assert.equal(r.costs.totalExGst,"2370.00");
 assert.equal(r.totals.reserveAllocation,"1500.00");
 assert.equal(r.totals.estimatedProfitExGst,"6130.00");
 assert.deepEqual(r.passThrough,{customerReceiptsPendingGross:"550.00",customerReceiptsReimbursedGross:"110.00",includedInProfit:false});
 assert.equal(r.provisional,true);
 assert.equal(r.profitReady,false);
 assert.match(r.warnings[0],/NOT READY.*INC-GST/);
 assert.ok(s.queries.every(x=>x.args[0]===tenant&&x.args[1]===job));
 const a=s.queries.find(x=>x.sql.includes("from attendance_entries")).sql;
 assert.match(a,/finished_at is null then null/);
 assert.match(a,/a.rate_snapshot\*a.paid_day_portion/);
 assert.ok(!s.queries.some(x=>x.sql.includes("from staff_wage_payments")),"Payments are cash, not duplicate cost");
});
test("unentered contract and incomplete shift show provisional, not a falsely final profit",async()=>{
 const r=(await setup({settings:false,open:true}).call()).financials;
 assert.equal(r.provisional,true);
 assert.equal(r.totals.contractExGst,"0.00");
 assert.equal(r.costs.openAttendance,1);
 assert.equal(r.warnings.length,3);
 assert.equal(r.profitReady,false);
});
test("settings and costs are explicit validated management-only writes with audit",async()=>{
 const s=setup();
 await s.call("POST","/settings",{contractExGst:12000,reservePercent:17.5});
 const write=s.queries.find(q=>q.sql.includes("insert into job_financial_settings"));
 assert.deepEqual(write.args,[tenant,job,"12000.00","17.50"]);
 assert.ok(s.queries.some(q=>q.sql.includes("audit_events")));
 const t=setup();
 await t.call("POST","/expenses",{kind:"other",description:"Disposal fee",amountExGst:220,gstAmount:22,incurredOn:"2026-11-18"});
 const cost=t.queries.find(q=>q.sql.includes("insert into cost_entries"));
 assert.deepEqual(cost.args.slice(1,4),[tenant,job,"other"]);
 assert.deepEqual(cost.args.slice(5),["220.00","22.00","2026-11-18"]);
});
test("reject bad cost input, reserve percent, and cross-role requests without a write",async()=>{
 const data=[
  {kind:"other",description:"Something",amountExGst:-1,gstAmount:0,incurredOn:"2026-11-18"},
  {kind:"other",description:"Something",amountExGst:10,gstAmount:0,incurredOn:"2026-02-30"},
  {kind:"reimbursement",description:"Bill customer",amountExGst:10,gstAmount:1,incurredOn:"2026-11-18"},
  {kind:"other",description:"Test",amountExGst:10,gstAmount:0,incurredOn:"2026-11-18",tenant_id:tenant}
 ];
 for(const x of data){const s=setup();await assert.rejects(s.call("POST","/expenses",x),e=>e.status===400);
  assert.ok(!s.queries.some(q=>q.sql.includes("insert into cost_entries")));
 }
 for(const pct of [-1,101,0.001,"15"]){
  const s=setup();await assert.rejects(s.call("POST","/settings",{contractExGst:100,reservePercent:pct}),e=>e.status===400);
 }
 const s=setup();
 await assert.rejects(dispatchJobFinancials({method:"GET",path:"/v1/jobs/"+job+"/financials",
  ctx:{...ctx,role:"worker"},db:s.db}),e=>e.status===403);
 assert.equal(s.queries.length,0);
});

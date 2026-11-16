import test from "node:test";
import assert from "node:assert/strict";
import {normalize,recordWeeklyBonus,setAttendanceDayOff,payrollReconciliation,periodSettlement} from "../owner-ledger-core.mjs";

function fixture(){
 return normalize({jobs:[{id:"job1",name:"Sample",stage:"active",contract:11000,
  timesheets:[{id:"d1",worker:"Alex",date:"2026-11-16",days:1,rate:250,payBasis:"day"},
  {id:"d2",worker:"Alex",date:"2026-11-17",days:1,rate:250,payBasis:"day"},
  {id:"d3",worker:"Alex",date:"2026-11-18",days:1,rate:250,payBasis:"day"},
  {id:"d4",worker:"Alex",date:"2026-11-19",days:1,rate:250,payBasis:"day"}],
  expenses:[],payments:[],workerPayments:[]}]});
}
test("four paid days and weekly bonus: earned 1100, unpaid 1100, no auto payment",()=>{
 const s=fixture();recordWeeklyBonus(s.jobs[0],{id:"bonus",worker:"Alex",date:"2026-11-20",amount:100});
 const x=payrollReconciliation(s.jobs,"Alex",[]);
 assert.equal(x.earned,1100);assert.equal(x.bonusEarned,100);
 assert.equal(x.paid,0);assert.equal(x.unpaid,1100);assert.equal(x.overpaid,0);
});
test("Day off does not erase paid cash, flags overpayment and old closeout",()=>{
 const s=fixture(),j=s.jobs[0];
 const snapshot=periodSettlement(s.jobs,"Alex","week","2026-11-16");
 j.workerPayments.push({id:"p",worker:"Alex",paidOn:"2026-11-20",amount:1000});
 setAttendanceDayOff(s,{jobId:"job1",entryId:"d4",dayOff:true,changedAt:"2026-11-20T16:00"});
 const x=payrollReconciliation(s.jobs,"Alex",[{...snapshot,id:"close1"}]);
 assert.equal(x.earned,750);assert.equal(x.paid,1000);assert.equal(x.unpaid,0);
 assert.equal(x.overpaid,250);assert.equal(x.dayOffCount,1);assert.equal(x.staleSettlements,1);
 assert.equal(x.status,"overpaid_review");assert.equal(j.workerPayments.length,1);
});
test("restore existing attendance reverses reconciliation without duplicate ledger events",()=>{
 const s=fixture();setAttendanceDayOff(s,{jobId:"job1",entryId:"d1",dayOff:true,changedAt:"2026-11-20T16:00"});
 assert.equal(payrollReconciliation(s.jobs,"Alex").earned,750);
 setAttendanceDayOff(s,{jobId:"job1",entryId:"d1",dayOff:false,changedAt:"2026-11-20T16:30"});
 assert.equal(payrollReconciliation(s.jobs,"Alex").earned,1000);
 assert.equal(s.jobs[0].timesheets.length,4);
});
test("paid cash over original balance is a review, never negative unpaid",()=>{
 const s=fixture();s.jobs[0].workerPayments.push({id:"advance",worker:"Alex",paidOn:"2026-11-20",amount:1200});
 const x=payrollReconciliation(s.jobs,"Alex");
 assert.equal(x.unpaid,0);assert.equal(x.overpaid,200);
});

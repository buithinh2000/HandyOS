import test from "node:test";
import assert from "node:assert/strict";
import {normalize,recordWeeklyBonus,workerTotals,workerByPeriod,summary,financialPeriodSummary,periodSettlement,isSettlementCurrent,weeklyStart} from "../owner-ledger-core.mjs";
import {parseOwnerBackup,ownerExports} from "../owner-ledger-io.mjs";
const fixture=()=>normalize({jobs:[{id:"job",name:"Sample",stage:"active",contract:11000,taxReservePct:0,
 timesheets:[{id:"day1",worker:"Alex",date:"2026-11-16",payBasis:"day",days:1,rate:250},{id:"day2",worker:"Alex",date:"2026-11-17",payBasis:"day",days:1,rate:250},{id:"day3",worker:"Alex",date:"2026-11-18",payBasis:"day",days:1,rate:250},{id:"day4",worker:"Alex",date:"2026-11-19",payBasis:"day",days:1,rate:250}],expenses:[],payments:[],workerPayments:[]}],staff:[{id:"staff",name:"Alex",payBasis:"day",rate:250}]});
test("four days at 250 plus 100 weekly bonus accrues 1100, not paid cash",()=>{
 const s=fixture();
 const before=summary(s.jobs[0]).profit;
 recordWeeklyBonus(s.jobs[0],{id:"bonus1",worker:"Alex",date:"2026-11-20",amount:100,notes:"Good work"});
 assert.equal(workerTotals(s.jobs,"Alex").due,1100);
 assert.equal(workerTotals(s.jobs,"Alex").paid,0);
 assert.equal(workerTotals(s.jobs,"Alex").days,4);
 assert.equal(workerByPeriod(s.jobs,"Alex")[0].earned,1100);
 assert.equal(financialPeriodSummary(s,{from:"2026-11-16",to:"2026-11-22"}).earned,1100);
 assert.equal(summary(s.jobs[0]).labour,1100);
 assert.equal(summary(s.jobs[0]).profit,before-100);
 assert.equal(summary(s.jobs[0]).expensesEx,0);
 assert.equal(weeklyStart("2026-11-20"),"2026-11-16");
});
test("bonus affects saved settlement and cash only on actual payment",()=>{
 const s=fixture(),j=s.jobs[0];
 const old=periodSettlement(s.jobs,"Alex","week","2026-11-16");
 recordWeeklyBonus(j,{id:"bonus",worker:"Alex",date:"2026-11-20",amount:100});
 assert.equal(isSettlementCurrent(s.jobs,old),false);
 assert.equal(workerTotals(s.jobs,"Alex").outstanding,1100);
 j.workerPayments.push({id:"pay",worker:"Alex",paidOn:"2026-11-21",amount:1100});
 assert.equal(workerTotals(s.jobs,"Alex").paid,1100);
 assert.equal(workerTotals(s.jobs,"Alex").outstanding,0);
 assert.equal(financialPeriodSummary(s).wagePaid,1100);
});
test("bonus uses strict date, amount, worker and duplicate ID gates",()=>{
 const s=fixture(),j=s.jobs[0];
 for(const bad of [{date:"2026-02-30"},{amount:-1},{amount:0},{amount:"oops"},{worker:""},{id:""}]){
  assert.throws(()=>recordWeeklyBonus(j,{id:"b",worker:"Alex",date:"2026-11-20",amount:100,...bad}));
 }
 assert.equal(j.wageAdjustments,undefined);
 recordWeeklyBonus(j,{id:"b",worker:"Alex",date:"2026-11-20",amount:100});
 assert.throws(()=>recordWeeklyBonus(j,{id:"b",worker:"Alex",date:"2026-11-20",amount:100}),/Duplicate/);
});
test("bonus backup round-trip and separate CSV report",()=>{
 const s=fixture();recordWeeklyBonus(s.jobs[0],{id:"b",worker:"Alex",date:"2026-11-20",amount:100});
 const restored=parseOwnerBackup(JSON.stringify(s));
 assert.equal(restored.jobs[0].wageAdjustments[0].weekStart,"2026-11-16");
 const csv=ownerExports(s)["weekly-bonuses"];
 assert.match(csv,/100/);assert.match(csv,/2026-11-16/);
 restored.jobs[0].wageAdjustments[0].weekStart="2026-11-09";
 assert.throws(()=>parseOwnerBackup(JSON.stringify(restored)),/Invalid weekly/);
});

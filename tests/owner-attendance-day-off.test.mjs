import test from "node:test";
import assert from "node:assert/strict";
import {normalize,workerTotals,summary,financialPeriodSummary,periodSettlement,isSettlementCurrent,setAttendanceDayOff} from "../owner-ledger-core.mjs";
import {parseOwnerBackup} from "../owner-ledger-io.mjs";
const fixture=()=>normalize({jobs:[{id:"job1",name:"Sample",stage:"active",contract:11000,
 timesheets:[{id:"day1",worker:"Alex",date:"2026-11-16",payBasis:"day",days:1,rate:250,
 startTime:"07:00",endTime:"15:30",notes:"Framing"}],workerPayments:[],expenses:[],payments:[]}]});
const change=(s,dayOff,rest={})=>setAttendanceDayOff(s,{jobId:"job1",entryId:"day1",dayOff,changedAt:"2026-11-16T17:00",...rest});
test("Day off excludes wage and days without deleting original shift data",()=>{
 const s=fixture(),j=s.jobs[0],oldProfit=summary(j).profit;
 assert.equal(workerTotals(s.jobs,"Alex").due,250);
 assert.equal(change(s,true),true);
 assert.equal(workerTotals(s.jobs,"Alex").due,0);
 assert.equal(workerTotals(s.jobs,"Alex").days,0);
 assert.equal(financialPeriodSummary(s).earned,0);
 assert.equal(summary(j).profit,oldProfit+250);
 assert.equal(j.timesheets.length,1);
 assert.equal(j.timesheets[0].startTime,"07:00");
 assert.equal(j.timesheets[0].notes,"Framing");
 assert.equal(j.timesheets[0].statusHistory.length,1);
});
test("restoring work recovers old wage without making duplicate workdays",()=>{
 const s=fixture();change(s,true);change(s,false);
 assert.equal(workerTotals(s.jobs,"Alex").due,250);
 assert.equal(s.jobs[0].timesheets.length,1);
 assert.equal(s.jobs[0].timesheets[0].statusHistory.length,2);
 assert.equal(change(s,false),false);
 assert.equal(s.jobs[0].timesheets[0].statusHistory.length,2);
});
test("payroll payments never change; previous closeout requires review",()=>{
 const s=fixture(),j=s.jobs[0];const closeout=periodSettlement(s.jobs,"Alex","week","2026-11-16");
 j.workerPayments.push({id:"p",worker:"Alex",paidOn:"2026-11-16",amount:200});
 change(s,true);
 assert.equal(workerTotals(s.jobs,"Alex").paid,200);
 assert.equal(workerTotals(s.jobs,"Alex").outstanding,-200);
 assert.equal(isSettlementCurrent(s.jobs,closeout),false);
});
test("finished Job, invalid timestamp and missing row do not mutate wages",()=>{
 const s=fixture();assert.throws(()=>change(s,true,{changedAt:"invalid"}),/Invalid/);
 assert.equal(s.jobs[0].timesheets[0].dayOff,undefined);
 assert.throws(()=>setAttendanceDayOff(s,{jobId:"job1",entryId:"missing",dayOff:true,changedAt:"2026-11-16T17:00"}),/not found/);
 s.jobs[0].stage="closed";assert.throws(()=>change(s,true),/Reopen/);
});
test("Day off history survives restore",()=>{
 const s=fixture();change(s,true);const restored=parseOwnerBackup(JSON.stringify(s));
 assert.equal(restored.jobs[0].timesheets[0].dayOff,true);
 assert.equal(restored.jobs[0].timesheets[0].statusHistory.length,1);
});

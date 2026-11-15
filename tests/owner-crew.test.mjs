import test from "node:test";
import assert from "node:assert/strict";
import {normalize,startCrewSession,finishCrewSession,workerTotals} from "../owner-ledger-core.mjs";
import {parseOwnerBackup} from "../owner-ledger-io.mjs";
function fixture(){
 return normalize({jobs:[{id:"job1",name:"Sample renovation",stage:"active",timesheets:[],expenses:[],payments:[],workerPayments:[]}],
 staff:[{id:"a",name:"Alex",payBasis:"day",rate:250,active:true},{id:"b",name:"Bea",payBasis:"hour",rate:40,active:true}]});
}
const checkIn=(s,overrides={})=>startCrewSession(s,{id:"crew1",jobId:"job1",staffIds:["a","b"],at:"2026-11-16T07:00",...overrides});
const checkOut=(s,overrides={})=>finishCrewSession(s,{at:"2026-11-16T15:30",breakMinutes:30,dayPortion:1,ids:["rowA","rowB"],...overrides});

test("crew check-in creates no wages; checkout records two workers only once",()=>{
 const s=fixture();checkIn(s);
 assert.equal(s.jobs[0].timesheets.length,0);
 const rows=checkOut(s);
 assert.equal(rows.length,2);
 assert.equal(rows[0].days,1);assert.equal(rows[0].rate,250);
 assert.equal(rows[1].hours,8);assert.equal(rows[1].rate,40);
 assert.equal(workerTotals(s.jobs,"Alex").due,250);
 assert.equal(workerTotals(s.jobs,"Bea").due,320);
 assert.equal(s.crewSessions[0].checkOutAt,"2026-11-16T15:30");
 assert.throws(()=>checkOut(s),/No active crew/);
});
test("reject duplicate employee/day and repeated active check-ins without altering money",()=>{
 const s=fixture();checkIn(s);
 assert.throws(()=>checkIn(s,{id:"crew2"}),/active crew/);
 assert.equal(s.crewSessions.length,1);
 checkOut(s);
 assert.throws(()=>checkIn(s,{id:"crew2"}),/already has attendance/);
 assert.equal(s.crewSessions.length,1);
});
test("checkout invalid time, excess break or duplicate rows fails atomically",()=>{
 for(const options of [{at:"2026-11-17T15:30"},{at:"2026-11-16T07:00"},{breakMinutes:600},{ids:["x","x"]}]){
  const s=fixture();checkIn(s);
  assert.throws(()=>checkOut(s,options));
  assert.equal(s.jobs[0].timesheets.length,0);
  assert.equal(s.crewSessions[0].checkOutAt,null);
 }
});
test("half day daily and hourly rates stay independent",()=>{
 const s=fixture();checkIn(s);
 const rows=checkOut(s,{dayPortion:0.5});
 assert.equal(rows[0].days,0.5);
 assert.equal(workerTotals(s.jobs,"Alex").due,125);
 assert.equal(workerTotals(s.jobs,"Bea").due,320);
});
test("crew history survives backup validation without accepting duplicate active sessions",()=>{
 const s=fixture();checkIn(s);
 const restored=parseOwnerBackup(JSON.stringify(s));
 assert.equal(restored.crewSessions.length,1);
 assert.equal(restored.crewSessions[0].staffIds.length,2);
 restored.crewSessions.push({...restored.crewSessions[0],id:"crew2"});
 assert.throws(()=>parseOwnerBackup(JSON.stringify(restored)),/Multiple active/);
});

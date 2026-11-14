import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalize,expenseEx,weeklyStart,workerTotals,workerByPeriod,employeesSummary,expenseSummary,companySummary,summary,canClose,snapshot} from "../owner-ledger-core.mjs";

const j=(id,name)=>({id,name,stage:"active",contract:11000,tasks:[],categories:[],materials:[],expenses:[],timesheets:[],payments:[],workerPayments:[]});
const worker=(name,date,hours,rate)=>({id:name+date,worker:name,date,hours,rate});

test("normalizes old jobs safely without dropping prior task, expense or payment data",()=>{
 const original={jobs:[{id:"legacy",name:"Old",tasks:[{id:"t1",title:"Plaster"}],categories:["Plaster"],expenses:[{title:"Old",amount:110}],payments:[{amount:100,status:"received"}],timesheets:[worker("Lee","2026-11-10",4,30)]}]};
 const x=normalize(original);
 assert.equal(x.jobs[0].tasks.length,1);
 assert.equal(x.jobs[0].payments[0].amount,100);
 assert.deepEqual(x.jobs[0].workerPayments,[]);
 assert.deepEqual(x.jobs[0].materials,[]);
});
test("worker roster deduplicates names across jobs ignoring case and calculates all-time earned and paid separately",()=>{
 const a=j("a","Bathroom"),b=j("b","Kitchen");
 a.timesheets.push(worker("Alex","2026-11-09",8,40));
 b.timesheets.push(worker("alex","2026-11-11",6,50));
 a.workerPayments.push({id:"p1",worker:"Alex",paidOn:"2026-11-13",amount:200});
 b.workerPayments.push({id:"p2",worker:"Alex",paidOn:"2026-11-15",amount:100});
 const people=employeesSummary([a,b]);assert.equal(people.length,1);
 const r=workerTotals([a,b],"Alex");
 assert.equal(r.hours,14);assert.equal(r.due,620);assert.equal(r.paid,300);assert.equal(r.outstanding,320);
 assert.equal(workerTotals([a,b],"alex","a").due,320);
 assert.equal(workerTotals([a,b],"Alex","b").paid,100);
});
test("weekly (Mon-Sun), monthly and annual worker wage totals reflect payment dates",()=>{
 const a=j("a","Renovation");
 a.timesheets.push(worker("Alex","2026-11-08",4,50),worker("Alex","2026-11-09",8,40),worker("Alex","2027-01-03",3,60));
 a.workerPayments.push({id:"p1",worker:"Alex",paidOn:"2026-11-09",amount:150},{id:"p2",worker:"Alex",paidOn:"2027-01-04",amount:200});
 assert.equal(weeklyStart("2026-11-08"),"2026-11-02");
 assert.equal(weeklyStart("2026-11-09"),"2026-11-09");
 const weeks=workerByPeriod([a],"Alex","week");
 assert.ok(weeks.some(x=>x.period==="2026-11-09"&&x.earned===320&&x.paid===150));
 const months=workerByPeriod([a],"Alex","month");
 assert.ok(months.some(x=>x.period==="2026-11"&&x.earned===520&&x.paid===150));
 const years=workerByPeriod([a],"Alex","year");
 assert.ok(years.some(x=>x.period==="2027"&&x.earned===180&&x.paid===200));
});
test("profit uses contract ex GST minus expenses ex GST and wage EARNED, not wages paid again",()=>{
 const a=j("a","Painting");
 a.expenses.push({id:"c",amount:1100,gstBasis:"inc",kind:"material",date:"2026-11-09",paidStatus:"paid"});
 a.timesheets.push(worker("Bee","2026-11-10",10,40));
 a.workerPayments.push({id:"w",worker:"Bee",amount:250,paidOn:"2026-11-10"});
 a.payments.push({id:"a",amount:2200,status:"received"},{id:"b",amount:1500,status:"requested"});
 const x=summary(a);
 assert.equal(x.agreedEx,10000);assert.equal(x.expensesEx,1000);assert.equal(x.labour,400);
 assert.equal(x.profit,8600);assert.equal(x.wagesPaid,250);assert.equal(x.wagesOutstanding,150);
 assert.equal(x.received,2200);assert.equal(x.requested,1500);assert.equal(x.remaining,8800);
 assert.equal(expenseEx(a.expenses[0]),1000);
});
test("unknown historic GST basis blocks profit & close, never silently guesses",()=>{
 const a=j("a","Bathroom");
 a.expenses.push({id:"legacy",amount:275,kind:"material"});
 const x=summary(a);assert.equal(x.unclassified,1);assert.equal(x.profit,null);
 assert.equal(canClose(a).ok,false);
 a.expenses[0].gstBasis="inc";
 assert.equal(canClose(a).ok,true);
 const close=snapshot(a,"2026-11-15");
 assert.equal(close.closedAt,"2026-11-15");
 assert.equal(close.profitEstimate,9750);
 assert.equal(close.expenseCount,1);
});
test("expenses can filter by job, year, category and retain payment state separately",()=>{
 const a=j("a","Job A"),b=j("b","Job B");
 a.expenses.push({id:"1",date:"2026-11-01",amount:110,gstBasis:"inc",kind:"material",paidStatus:"paid"});
 a.expenses.push({id:"2",date:"2025-11-01",amount:100,gstBasis:"no_gst",kind:"equipment",paidStatus:"unpaid"});
 b.expenses.push({id:"3",date:"2026-12-01",amount:220,gstBasis:"inc",kind:"material",paidStatus:"unpaid"});
 const data=expenseSummary([a,b],{year:"2026",kind:"material"});
 assert.equal(data.entries.length,2);assert.equal(data.net,300);assert.equal(data.paid,110);
 assert.equal(expenseSummary([a,b],{jobId:"a"}).entries.length,2);
});
test("company roll-up separates labour earned, wages paid and expenses paid",()=>{
 const a=j("a","Job A"),b=j("b","Job B");
 a.timesheets.push(worker("Sam","2026-11-01",10,50));
 a.workerPayments.push({id:"p",worker:"Sam",amount:200,paidOn:"2026-11-03"});
 a.expenses.push({amount:110,gstBasis:"inc",kind:"material",paidStatus:"paid"});
 a.payments.push({amount:1000,status:"received"});
 b.stage="closed";b.timesheets.push(worker("Sam","2026-11-08",5,20));
 const totals=companySummary([a,b]);
 assert.equal(totals.jobs,2);assert.equal(totals.open,1);assert.equal(totals.labourDue,600);
 assert.equal(totals.wagesPaid,200);assert.equal(totals.wagesOutstanding,400);
 assert.equal(totals.expensesEx,100);assert.equal(totals.expensesPaid,110);assert.equal(totals.received,1000);
});
test("owner view follows list then employee detail, no public employee share link",()=>{
 const html=readFileSync(new URL("../owner-v1.html",import.meta.url),"utf8");
 for(const word of ["Jobs","Employees","Expenses","Overview","Record wages paid","Weekly","Payment date","Estimated profit"]){
   assert.ok(html.toLowerCase().includes(word.toLowerCase()),"missing "+word);
 }
 assert.match(html,/if\(!person\)/);
 assert.match(html,/data-open="worker"/);
 assert.match(html,/Employee name/);
 assert.match(html,/No secure login/);
 assert.doesNotMatch(html,/data-share-employee/);
});

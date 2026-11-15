import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalize,expenseEx,weeklyStart,workerTotals,workerByPeriod,employeesSummary,expenseSummary,companySummary,summary,canClose,snapshot,wageYearSummary,periodSettlement,isSettlementCurrent,workerNames,jobGroup,paymentProgress,scheduleEntry,scheduleDays,isISODate,customerPayment,paymentBreakdown} from "../owner-ledger-core.mjs";

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

test("employee yearly earned and paid aggregates across jobs without double-counting",()=>{
 const a=j("one","Bathroom"),b=j("two","Kitchen");
 a.timesheets.push(worker("Alex","2025-11-04",8,40));
 b.timesheets.push(worker("Alex","2026-02-02",5,60));
 a.workerPayments.push({worker:"Alex",amount:250,paidOn:"2025-12-01"});
 b.workerPayments.push({worker:"Alex",amount:200,paidOn:"2026-03-01"});
 const older=wageYearSummary([a,b],"2025");
 assert.equal(older.earned,320);assert.equal(older.paid,250);
 const current=wageYearSummary([a,b],"2026");
 assert.equal(current.earned,300);assert.equal(current.paid,200);
 assert.equal(wageYearSummary([a,b],"").earned,620);
 assert.equal(wageYearSummary([a,b],"").paid,450);
});
test("weekly/monthly payroll close receipts are snapshots, and late edits invalidate them",()=>{
 const a=j("bath","Bathroom");a.timesheets.push(worker("Alex","2026-11-09",8,50));
 a.workerPayments.push({worker:"Alex",amount:200,paidOn:"2026-11-10"});
 const week=periodSettlement([a],"Alex","week","2026-11-09");
 assert.equal(week.hours,8);assert.equal(week.earned,400);assert.equal(week.paid,200);
 assert.equal(week.balance,200);assert.equal(isSettlementCurrent([a],week),true);
 const month=periodSettlement([a],"Alex","month","2026-11");
 assert.equal(month.earned,400);assert.equal(isSettlementCurrent([a],month),true);
 a.workerPayments.push({worker:"Alex",amount:100,paidOn:"2026-11-11"});
 assert.equal(isSettlementCurrent([a],week),false);
 assert.equal(isSettlementCurrent([a],month),false);
 assert.equal(summary(a).labour,400);assert.equal(summary(a).wagesPaid,300);
 assert.throws(()=>periodSettlement([a],"Alex","year","2026"),/Only weekly/);
});
test("legacy data gains settlement collection without overwriting saved job records",()=>{
 const original={jobs:[{id:"x",name:"Old",timesheets:[],payments:[],expenses:[],tasks:[]}]};
 const normalized=normalize(original);
 assert.deepEqual(normalized.payrollSettlements,[]);
 assert.equal(normalized.jobs[0].id,"x");
 const receipt={worker:"Alex",period:"week",key:"2026-11-09",earned:100,paid:0};
 normalized.payrollSettlements.push(receipt);assert.deepEqual(normalize(normalized).payrollSettlements,[receipt]);
});
test("owner V1 exposes month, category, job and annual worker filters",()=>{
 const html=readFileSync(new URL("../owner-v1.html",import.meta.url),"utf8");
 for(const id of ["wageYearFilter","yearFilter","monthFilter","kindFilter","jobFilter","data-settle"]){assert.ok(html.includes(id),id)}
 assert.match(html,/Saved payroll settlements/);
 assert.match(html,/Closing a period records a snapshot only/);
});

test("explicit staff roster appears before any timesheets and persists through normalization",()=>{
 const db=normalize({jobs:[],staff:[{id:"worker-1",name:"Taylor",role:"Carpenter",rate:42,active:true}]});
 assert.deepEqual(workerNames(db.jobs,db.staff),["Taylor"]);
 const workers=employeesSummary(db.jobs,db.staff);
 assert.equal(workers.length,1);
 assert.equal(workers[0].name,"Taylor");
 assert.equal(workers[0].due,0);
 assert.equal(wageYearSummary(db.jobs,"2026",db.staff).rows[0].earned,0);
});
test("customer payment GST options preserve actual received cash and classify GST",()=>{
 const inc=customerPayment(110,"inc"),ex=customerPayment(100,"ex"),free=customerPayment(100,"no_gst");
 assert.deepEqual([inc.amount,inc.gstAmount,inc.netAmount],[110,10,100]);
 assert.deepEqual([ex.amount,ex.gstAmount,ex.netAmount],[110,10,100]);
 assert.deepEqual([free.amount,free.gstAmount,free.netAmount],[100,0,100]);
 const x=j("new","Bathroom");x.payments.push(
  {status:"received",...inc},{status:"received",...ex},
  {status:"received",...free},{status:"requested",...customerPayment(55,"inc")});
 const report=paymentBreakdown(x);
 assert.equal(report.cash,320);
 assert.equal(report.receivedNet,300);
 assert.equal(report.receivedGst,20);
 assert.equal(report.requested,55);
 assert.equal(summary(x).received,320);
 assert.equal(summary(x).profit,10000); // agreed contract, unaffected by cash payments
 assert.throws(()=>customerPayment(-20,"inc"));
 assert.throws(()=>customerPayment(100,"invalid"));
});
test("historical payments without tax basis continue as inclusive cash without conversion",()=>{
 const x=j("old","Legacy");
 x.payments=[{status:"received",amount:275},{status:"requested",amount:100}];
 assert.equal(summary(x).received,275);
 assert.equal(paymentBreakdown(x).receivedGst,25);
 assert.equal(paymentBreakdown(x).requested,100);
});
test("owner screen has staff form and GST payment basis options",()=>{
 const html=readFileSync(new URL("../owner-v1.html",import.meta.url),"utf8");
 for(const term of ["staffName","staffRole","staffRate","addStaff","workerName","payBasis","no_gst","customerPayment"]){assert.ok(html.includes(term),term)}
});

test("single Tax & Reserve Fund is Owner-chosen percent of TOTAL contract incl GST, deducted exactly once",()=>{
 const a=j("reserve","Bathroom");
 a.contract=11000;
 a.taxReservePct=15;
 a.expenses.push({id:"other",amount:220,gstBasis:"inc",kind:"other",date:"2026-11-15",paidStatus:"paid"});
 a.expenses.push({id:"material",amount:1100,gstBasis:"inc",kind:"material",date:"2026-11-15",paidStatus:"paid"});
 a.timesheets.push(worker("Alex","2026-11-15",10,40));
 const x=summary(a);
 assert.equal(x.agreedEx,10000);
 assert.equal(x.otherExpensesEx,200);
 assert.equal(x.expensesEx,1200);
 assert.equal(x.labour,400);
 assert.equal(x.profitBeforeReserve,8400);
 assert.equal(x.taxReservePct,15);
 assert.equal(x.taxReserveAmount,1650);
 assert.equal(x.profit,6750);
 assert.equal(canClose(a).ok,true);
 const close=snapshot(a,"2026-11-15");
 assert.equal(close.profitEstimate,6750);
 assert.equal(close.taxReserveAmount,1650);
 assert.equal(close.taxReservePct,15);
 assert.equal(close.otherExpensesEx,200);
 // Wage payments are not an additional expense.
 a.workerPayments.push({id:"paid",worker:"Alex",paidOn:"2026-11-15",amount:300});
 assert.equal(summary(a).profit,6750);
});
test("reserve percentage is optional on old jobs, zero by default, never auto 15%",()=>{
 const a=j("legacy","Legacy");
 assert.equal(summary(a).taxReservePct,0);
 assert.equal(summary(a).taxReserveAmount,0);
 assert.equal(summary(a).profit,10000);
 a.taxReservePct=0;
 assert.equal(summary(a).profit,10000);
});
test("invalid reserve percentages block final profit and close instead of misleading numbers",()=>{
 const a=j("bad","Bath");
 for(const value of [-1,101,"bad"]){
  a.taxReservePct=value;
  assert.equal(summary(a).profit,null);
  assert.equal(canClose(a).ok,false);
 }
});
test("unclassified expenses block final estimated profit even with reserve",()=>{
 const a=j("unknown","Kitchen");
 a.taxReservePct=15;
 a.expenses.push({id:"x",amount:100,kind:"other"});
 assert.equal(summary(a).profit,null);
 assert.equal(canClose(a).ok,false);
});
test("job and company views include one combined owner percentage, other expenses, and final profit",()=>{
 const html=readFileSync(new URL("../owner-v1.html",import.meta.url),"utf8");
 assert.ok(html.includes("Tax & Reserve Fund (%)"));
 assert.ok(html.includes("Other expenses (ex GST, already included below)"));
 assert.ok(html.includes("Final estimated profit after reserve"));
 assert.ok(html.includes("taxReservePct"));
});

test("remaining forecast costs are deducted once and excluded from incurred cost and cash",()=>{
 const a=j("forecast","Bathroom");a.contract=11000;a.taxReservePct=15;a.remainingCostEx=1800;
 a.expenses.push({id:"material",amount:1100,gstBasis:"inc",kind:"material"});
 a.timesheets.push(worker("Alex","2026-11-15",8,50));
 const x=summary(a);
 assert.equal(x.costEx,1400);
 assert.equal(x.remainingCostEx,1800);
 assert.equal(x.profitBeforeReserve,6800);
 assert.equal(x.taxReserveAmount,1650);
 assert.equal(x.profit,5150);
 assert.equal(x.received,0);
 assert.equal(canClose(a).ok,false);
 assert.match(canClose(a).reason,/Remaining Costs/);
 // Owner reconciles $500 of planned spend into real expenses, reducing forecast $500.
 a.expenses.push({id:"extra",amount:500,gstBasis:"ex",kind:"other"});
 a.remainingCostEx=1300;
 assert.equal(summary(a).profit,5150);
 a.remainingCostEx=0;
 assert.equal(summary(a).profit,6450);
 assert.equal(canClose(a).ok,true);
 assert.equal(snapshot(a,"2026-11-15").remainingCostEx,0);
});
test("legacy jobs with no remaining forecast remain unchanged, invalid amounts block close",()=>{
 const a=j("legacy","Legacy");assert.equal(summary(a).remainingCostEx,0);
 assert.equal(summary(a).profit,10000);
 for(const value of [-1,"wrong"]){a.remainingCostEx=value;assert.equal(summary(a).profit,null);assert.equal(canClose(a).ok,false)}
});
test("owner screens expose remaining forecast cost and clear double-counting guidance",()=>{
 const html=readFileSync(new URL("../owner-v1.html",import.meta.url),"utf8");
 assert.match(html,/Remaining Costs ex GST/);
 assert.match(html,/Reduce Remaining Costs as you enter actual/);
 assert.match(html,/Final estimated profit/);
});

test("approved contract variations adjust revenue and reserve exactly once; overhead is unbooked",()=>{
 const a=j("var","Bathroom");
 a.contract=11000; a.approvedVariationInc=2200; a.overheadAllocationEx=300; a.taxReservePct=15; a.remainingCostEx=500;
 a.expenses.push({id:"material",amount:1100,gstBasis:"inc",kind:"material"});
 a.timesheets.push(worker("Alex","2026-11-15",10,40));
 const v=summary(a);
 assert.equal(v.agreedInc,11000);assert.equal(v.approvedVariationInc,2200);
 assert.equal(v.totalContractInc,13200);assert.equal(v.totalContractEx,12000);
 assert.equal(v.expensesEx,1000);assert.equal(v.labour,400);assert.equal(v.costEx,1400);
 assert.equal(v.overheadAllocationEx,300);assert.equal(v.remainingCostEx,500);
 assert.equal(v.profitBeforeReserve,9800);assert.equal(v.taxReserveAmount,1980);
 assert.equal(v.profit,7820);assert.equal(v.remaining,13200);
 // Moving an overhead allocation into recorded actual costs must not affect total forecast
 a.expenses.push({id:"recorded",amount:100,gstBasis:"ex",kind:"other"});a.overheadAllocationEx=200;
 assert.equal(summary(a).profit,7820);
 a.remainingCostEx=0;assert.equal(canClose(a).ok,true);
 const receipt=snapshot(a,"2026-11-15");
 assert.equal(receipt.approvedVariationInc,2200);assert.equal(receipt.overheadAllocationEx,200);
 assert.equal(receipt.totalContractInc,13200);
});
test("negative approved variation lowers revenue and reserve, invalid or zero contract blocks close",()=>{
 const a=j("deduct","Kitchen");a.contract=11000;a.taxReservePct=10;a.approvedVariationInc=-1100;
 assert.equal(summary(a).totalContractInc,9900);
 assert.equal(summary(a).totalContractEx,9000);
 assert.equal(summary(a).taxReserveAmount,990);
 assert.equal(summary(a).profit,8010);
 a.approvedVariationInc=-11000;
 assert.equal(summary(a).profit,null);assert.equal(canClose(a).ok,false);
 a.approvedVariationInc="oops";
 assert.equal(summary(a).profit,null);assert.equal(canClose(a).ok,false);
 a.approvedVariationInc=0;a.overheadAllocationEx=-10;
 assert.equal(summary(a).profit,null);assert.equal(canClose(a).ok,false);
});
test("legacy jobs with no variations or overhead keep their previous profit",()=>{
 const a=j("legacy","Legacy");a.taxReservePct=15;
 assert.equal(summary(a).approvedVariationInc,0);
 assert.equal(summary(a).overheadAllocationEx,0);
 assert.equal(summary(a).totalContractInc,11000);
 assert.equal(summary(a).profit,8350);
});
test("Job V1 keeps variation and overhead optional while exposing profit breakdown",()=>{
 const html=readFileSync(new URL("../owner-v1.html",import.meta.url),"utf8");
 assert.match(html,/Optional: approved contract variations & overhead/);
 assert.match(html,/approvedVariationInc/);
 assert.match(html,/overheadAllocationEx/);
 assert.match(html,/Adjusted contract value ex GST/);
});

test("jobs group into booked, active and finished without losing legacy stages",()=>{
 const a=j("a","Preparing"),b=j("b","Building"),c=j("c","Completed");
 a.stage="scheduled";b.stage="active";c.stage="closed";
 assert.equal(jobGroup(a),"booked");assert.equal(jobGroup(b),"active");assert.equal(jobGroup(c),"finished");
 a.stage="survey";assert.equal(jobGroup(a),"planning");
 b.stage="handover";assert.equal(jobGroup(b),"active");
});
test("payment progress uses RECEIVED cash and adjusted GST-inclusive contract only",()=>{
 const a=j("a","Bathroom");a.contract=11000;a.approvedVariationInc=2200;
 a.payments.push({status:"received",amount:6600},{status:"requested",amount:4400});
 const p=paymentProgress(a);assert.equal(p.percent,50);
 assert.equal(p.received,6600);assert.equal(p.contract,13200);assert.equal(p.remaining,6600);
 assert.equal(p.overpaid,false);
 a.payments.push({status:"received",amount:8000});
 assert.equal(paymentProgress(a).overpaid,true);
 a.contract=0;assert.equal(paymentProgress(a).percent,null);
});
test("simple schedule shows only recorded bookings, excluding finished jobs",()=>{
 const a=j("a","Kitchen"),b=j("b","Bathroom"),c=j("c","Finished");
 a.stage="scheduled";a.startDate="2026-11-16";a.endDate="2026-11-18";
 b.stage="active";b.startDate="2026-11-17";b.endDate="2026-11-20";
 c.stage="closed";c.startDate="2026-11-16";c.endDate="2026-11-19";
 const days=scheduleDays([a,b,c],"2026-11-16",5);
 assert.deepEqual(days.map(d=>d.bookedCount),[1,2,2,1,1]);
 assert.equal(days[0].booked[0].name,"Kitchen");
 assert.equal(scheduleDays([a],"2026-11-21",1)[0].unrecorded,true);
 assert.equal(scheduleEntry(a).scheduled,true);
 assert.equal(isISODate("2026-02-30"),false);
 assert.equal(isISODate("2026-11-18"),true);
 b.endDate="2026-11-15";assert.equal(scheduleEntry(b).invalid,true);
});
test("Owner V1 jobs overview exposes status counts, payment progress and schedule dates",()=>{
 const html=readFileSync(new URL("../owner-v1.html",import.meta.url),"utf8");
 for(const token of ["Jobs Overview","Planning / Quoting","In Progress","Finished","Schedule · 14 days","No job booked","startDate","endDate","paymentProgress"]){assert.ok(html.includes(token),token)}
});

test("a planning or quoting job with tentative dates never marks those days booked",()=>{
 const tentative=j("quote","Not confirmed");tentative.stage="quoted";tentative.startDate="2026-12-01";tentative.endDate="2026-12-04";
 const booked=j("booked","Confirmed");booked.stage="approved";booked.startDate="2026-12-02";booked.endDate="2026-12-03";
 const days=scheduleDays([tentative,booked],"2026-12-01",5);
 assert.deepEqual(days.map(x=>x.bookedCount),[0,1,1,0,0]);
 assert.equal(days[0].unrecorded,true);
 const html=readFileSync(new URL("../owner-v1.html",import.meta.url),"utf8");
 for(const txt of ['data-calendar="-14"','data-calendar="14"','data-calendar="today"'])assert.ok(html.includes(txt));
});

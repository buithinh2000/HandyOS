import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalize,expenseEx,weeklyStart,workerTotals,workerByPeriod,employeesSummary,expenseSummary,companySummary,summary,canClose,snapshot,wageYearSummary,periodSettlement,isSettlementCurrent,workerNames,jobGroup,paymentProgress,scheduleEntry,scheduleDays,isISODate,customerPayment,paymentBreakdown,financialPeriodSummary,workedHours} from "../owner-ledger-core.mjs";

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
 for(const token of ["Jobs Overview","Planning / Quoting","In Progress","Finished","Schedule · Next 14 days","No job booked","startDate","endDate","paymentProgress"]){assert.ok(html.includes(token),token)}
});

test("approved variations control overpayment warnings and closed job receivables",()=>{
 const j={id:"variation",name:"Renovation",stage:"active",contract:11000,approvedVariationInc:2200,taxReservePct:15,remainingCostEx:0,overheadAllocationEx:0,expenses:[],timesheets:[],workerPayments:[],payments:[{id:"received",reference:"Deposit",status:"received",amount:12000}]};
 const before=summary(j);
 assert.equal(before.totalContractInc,13200);
 assert.equal(before.remaining,1200);
 assert.equal(before.profit,10020); // 13200 ex GST = 12000, reserve 1980
 assert.equal(before.risks.some(x=>x.includes("exceeds the adjusted contract")),false,"payments above base contract can be valid after approved variations");
 j.payments.push({id:"extra",reference:"Additional cash",status:"received",amount:1400});
 const after=summary(j);
 assert.equal(after.received,13400);
 assert.equal(after.remaining,-200);
 assert.ok(after.risks.some(x=>x.includes("exceeds the adjusted contract")));
 assert.equal(after.profit,10020,"cashflow does not alter contract profitability");
 j.payments.pop();
 j.stage="closed";
 const closed=summary(j);
 assert.ok(closed.risks.some(x=>x.includes("cash remains outstanding")));
});

test("tentative planning/quoted dates do not occupy confirmed bookings calendar",()=>{
 const make=(id,stage)=>({...j(id,id),stage,startDate:"2026-11-16",endDate:"2026-11-18"});
 const survey=make("survey","survey"),quoted=make("quoted","quoted"),estimate=make("estimate","estimate");
 const booked=make("booked","scheduled"),inProgress=make("active","active"),handover=make("handover","handover");
 const closed=make("closed","closed");
 const onDay=scheduleDays([survey,quoted,estimate,booked,inProgress,handover,closed],"2026-11-17",1)[0];
 assert.deepEqual(onDay.booked.map(x=>x.id),["booked","active","handover"]);
 assert.equal(onDay.bookedCount,3);
 assert.equal(scheduleDays([survey,quoted,estimate,closed],"2026-11-17",1)[0].unrecorded,true);
 assert.equal(jobGroup(quoted),"planning");
 assert.equal(scheduleEntry(quoted).scheduled,true,"tentative dates remain preserved on job");
});

test("invalid calendar dates never leak into weekly monthly or yearly wage periods",()=>{
 const job=j("bad-date","Synthetic invalid legacy dates");
 job.timesheets.push(worker("Alex","2026-02-30",8,40));
 job.workerPayments.push({worker:"Alex",paidOn:"2026-02-30",amount:100});
 assert.equal(isISODate("2026-02-30"),false);
 assert.equal(weeklyStart("2026-02-30"),"");
 for(const period of ["week","month","year"]){
  assert.deepEqual(workerByPeriod([job],"Alex",period),[]);
 }
 // Source records remain intact: the fix does not silently delete or rewrite old ledger entries.
 assert.equal(job.timesheets.length,1);
 assert.equal(job.workerPayments.length,1);
 job.timesheets[0].date="2026-02-28";
 job.workerPayments[0].paidOn="2026-02-28";
 assert.equal(weeklyStart("2026-02-28"),"2026-02-23");
 assert.equal(workerByPeriod([job],"Alex","week")[0].period,"2026-02-23");
 assert.equal(workerByPeriod([job],"Alex","month")[0].period,"2026-02");
 assert.equal(workerByPeriod([job],"Alex","year")[0].period,"2026");
});

test("year-filtered wage summary excludes impossible legacy dates without rewriting all-time ledger",()=>{
 const a=j("legacy-date","Bathroom");
 a.timesheets.push(worker("Alex","2026-02-30",8,40));
 a.workerPayments.push({id:"bad-paid",worker:"Alex",paidOn:"2026-02-30",amount:100});
 a.timesheets.push(worker("Alex","2026-02-28",2,50));
 a.workerPayments.push({id:"valid-paid",worker:"Alex",paidOn:"2026-02-28",amount:40});
 const annual=wageYearSummary([a],"2026");
 assert.equal(annual.earned,100);
 assert.equal(annual.paid,40);
 assert.equal(annual.rows[0].hours,2);
 assert.equal(annual.rows[0].difference,60);
 const allTime=wageYearSummary([a],"");
 assert.equal(allTime.earned,420);
 assert.equal(allTime.paid,140);
 assert.equal(workerTotals([a],"Alex").outstanding,280);
 assert.equal(a.timesheets.length,2);
 assert.equal(a.workerPayments.length,2);
});

test("month/year expense filters reject impossible historical dates without dropping all-time costs",()=>{
 const job=j("legacy-expense-dates","Bathroom");
 job.expenses.push(
  {id:"bad",date:"2026-02-30",amount:110,gstBasis:"inc",kind:"material",paidStatus:"paid"},
  {id:"valid",date:"2026-02-28",amount:220,gstBasis:"inc",kind:"material",paidStatus:"paid"},
  {id:"other",date:"2025-12-31",amount:55,gstBasis:"no_gst",kind:"other",paidStatus:"unpaid"}
 );
 const year=expenseSummary([job],{year:"2026"});
 assert.deepEqual(year.entries.map(x=>x.id),["valid"]);
 assert.equal(year.net,200);
 assert.equal(year.paid,220);
 const month=expenseSummary([job],{month:"2026-02"});
 assert.deepEqual(month.entries.map(x=>x.id),["valid"]);
 assert.equal(expenseSummary([job],{year:"2026",month:"2026-02"}).entries.length,1);
 const unfiltered=expenseSummary([job]);
 assert.equal(unfiltered.entries.length,3);
 assert.equal(unfiltered.net,355);
 assert.equal(unfiltered.paid,330);
 assert.equal(job.expenses[0].date,"2026-02-30");
});

test("company open-job count agrees with Jobs status groups including legacy finished stage",()=>{
 const stages=["survey","quoted","approved","scheduled","active","handover","finished","closed"];
 const jobs=stages.map((stage,i)=>({...j("status-"+i,"Job "+i),stage}));
 assert.equal(jobs.filter(x=>jobGroup(x)==="finished").length,2);
 assert.equal(companySummary(jobs).jobs,8);
 assert.equal(companySummary(jobs).open,6);
 for(const stage of ["finished","closed","FINISHED"]){
  const completed=j("done-"+stage,"Completed");
  completed.stage=stage;
  assert.equal(jobGroup(completed),"finished");
  assert.equal(companySummary([completed]).open,0);
 }
 assert.equal(companySummary(jobs.slice(0,2)).open,2);
});

test("overview paid-expense amount covers paid entries of every category, not just Other",()=>{
 const a=j("paid-mix","Bathroom");
 a.expenses.push(
  {id:"m",amount:110,gstBasis:"inc",kind:"material",paidStatus:"paid"},
  {id:"o",amount:55,gstBasis:"no_gst",kind:"other",paidStatus:"paid"},
  {id:"u",amount:330,gstBasis:"inc",kind:"equipment",paidStatus:"unpaid"}
 );
 const totals=companySummary([a]);
 assert.equal(totals.expensesPaid,165);
 assert.equal(totals.expensesEx,455);
 assert.equal(summary(a).otherExpensesEx,55);
});
test("Owner Overview labels total marked-paid expenses without confusing them with Other category",()=>{
 const html=readFileSync(new URL("../owner-v1.html",import.meta.url),"utf8");
 assert.match(html,/Expenses marked paid \(entered\)/);
 assert.doesNotMatch(html,/metric\("Other expenses paid"/);
});

test("four scheduled payments distinguish two received, one sent, and one not sent",()=>{
 const job=j("four-stages","Example");
 job.payments=[
  {id:"one",status:"received",amount:110,reference:"Deposit"},
  {id:"two",status:"received",amount:220,reference:"Progress"},
  {id:"three",status:"requested",amount:330,reference:"Invoice sent"},
  {id:"four",status:"draft",amount:440,reference:"Not sent"}
 ];
 const breakdown=paymentBreakdown(job);
 assert.equal(breakdown.entries.length,4);
 assert.equal(breakdown.cash,330);
 assert.equal(breakdown.requested,330);
 assert.equal(breakdown.draft,440);
 assert.equal(summary(job).received,330);
 assert.equal(companySummary([job]).received,330);
 assert.equal(paymentProgress(job).received,330);
});

test("attendance day rate and hourly rate contribute once each to wages and job cost",()=>{
 const job=j("mixed-wages","Bathroom");
 job.timesheets=[
  {id:"day",worker:"Alex",date:"2026-11-12",payBasis:"day",days:1,rate:280,workedHours:8,startTime:"07:00",endTime:"15:30",breakMinutes:30,notes:"Finishing"},
  {id:"half-day",worker:"Alex",date:"2026-11-13",payBasis:"day",days:0.5,rate:280,workedHours:4,startTime:"07:00",endTime:"11:00",breakMinutes:0},
  {id:"hour",worker:"Lee",date:"2026-11-13",hours:6,rate:40}
 ];
 assert.equal(workerTotals([job],"Alex").due,420);
 assert.equal(workerTotals([job],"Alex").days,1.5);
 assert.equal(workerTotals([job],"Alex").hours,12);
 assert.equal(workerTotals([job],"Lee").due,240);
 assert.equal(summary(job).labour,660);
 assert.equal(workerByPeriod([job],"Alex","week")[0].earned,420);
 assert.equal(workerByPeriod([job],"Alex","month")[0].days,1.5);
 assert.equal(wageYearSummary([job],"2026").earned,660);
 assert.equal(workerTotals([job],"Alex").paid,0);
});
test("period dashboard separates received customer cash, wage cost, paid wages, expenses and actual tax",()=>{
 const job=j("period-test","Office");
 job.payments=[
  {status:"received",date:"2026-11-02",amount:1100},
  {status:"requested",date:"2026-11-03",amount:3300},
  {status:"draft",date:"2026-11-04",amount:5500}
 ];
 job.timesheets=[{worker:"Alex",date:"2026-11-05",hours:8,rate:35}];
 job.workerPayments=[{worker:"Alex",paidOn:"2026-11-06",amount:200}];
 job.expenses=[{kind:"other",date:"2026-11-07",amount:110,gstBasis:"inc",paidStatus:"paid"}];
 const data={jobs:[job],taxPayments:[{date:"2026-11-08",amount:50,kind:"GST / BAS"}]};
 const month=financialPeriodSummary(data,{from:"2026-11-01",to:"2026-11-30"});
 assert.deepEqual({receipts:month.receipts,earned:month.earned,wagePaid:month.wagePaid,expensesPaid:month.expensesPaid,expensesEx:month.expensesEx,taxesPaid:month.taxesPaid,netCash:month.netCash},
 {receipts:1100,earned:280,wagePaid:200,expensesPaid:110,expensesEx:100,taxesPaid:50,netCash:740});
 assert.equal(financialPeriodSummary(data,{from:"2026-12-01",to:"2026-12-31"}).receipts,0);
 assert.equal(companySummary([job]).received,1100);
 assert.equal(summary(job).labour,280,"Cash wage payment must not count as another profit cost");
});
test("start/finish and break produce valid hours; reject negative, overnight and invalid clock times",()=>{
 assert.equal(workedHours("07:00","15:30",30),8);
 assert.equal(workedHours("07:00","11:00",0),4);
 for(const [start,end,rest] of [["17:00","07:00",0],["09:00","09:00",0],["07:00","15:00",480],["bad","12:00",0],["08:00","17:00",-1]])assert.equal(workedHours(start,end,rest),null);
});

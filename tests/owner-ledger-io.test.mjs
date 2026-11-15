import test from "node:test";
import assert from "node:assert/strict";
import {parseOwnerBackup,csv,ownerExports} from "../owner-ledger-io.mjs";
const fixture=()=>({jobs:[{id:"job-a",name:"Bathroom",code:"",stage:"active",contract:1100,expenses:[{id:"e1",date:"2026-11-12",kind:"material",title:"Tiles",amount:110,gstBasis:"inc",paidStatus:"paid"}],timesheets:[{id:"t1",date:"2026-11-12",worker:"Alex",hours:8,rate:40}],workerPayments:[{id:"w1",worker:"Alex",paidOn:"2026-11-13",amount:200}],payments:[{id:"p1",reference:"Progress 1",date:"2026-11-14",status:"received",amount:500}],tasks:[],categories:[],materials:[]}],payrollSettlements:[],staff:[],taxPayments:[]});
test("validated backup preserves ledger IDs, expenses and settlements",()=>{
 const data=fixture();data.payrollSettlements.push({worker:"Alex",period:"week",key:"2026-11-09",earned:320,paid:200});
 const result=parseOwnerBackup(JSON.stringify(data));
 assert.deepEqual(result,data);
 assert.equal(result.jobs[0].timesheets[0].id,"t1");
});
test("backup rejects corrupt, wrong schema, and duplicate job IDs",()=>{
 assert.throws(()=>parseOwnerBackup("{"),/valid JSON/);
 assert.throws(()=>parseOwnerBackup(JSON.stringify({anything:"else"})),/jobs array/);
 const bad=fixture();bad.jobs[0].workerPayments="not an array";
 assert.throws(()=>parseOwnerBackup(JSON.stringify(bad)),/workerPayments/);
 const repeated=fixture();repeated.jobs.push({...repeated.jobs[0]});
 assert.throws(()=>parseOwnerBackup(JSON.stringify(repeated)),/duplicate job IDs/);
});
test("CSV export has separate jobs, labour, wages, expenses and payments with consistent figures",()=>{
 const exports=ownerExports(fixture());
 assert.deepEqual(Object.keys(exports),["jobs","labour-hours","wage-payments","expenses","client-payments","staff","tax-payments"]);
 assert.match(exports.jobs,/\$?/); // files are plain numeric values, not live business data
 assert.match(exports.jobs,/"320"/);
 assert.match(exports["wage-payments"],/"200"/);
 assert.match(exports.expenses,/"100"/);
 assert.match(exports["client-payments"],/"500"/);
 assert.ok(exports.jobs.startsWith("\ufeff"));
});
test("CSV exports escape quotes, commas, newlines and spreadsheet formula injections",()=>{
 const out=csv(["Name","Value"],[['=HYPERLINK("https://evil","click")','Alice, Bob'],['  +SUM(A1:A2)','multi\nline'],['@cmd','-23']]);
 assert.match(out,/^﻿"Name","Value"/);
 assert.match(out,/"'=HYPERLINK\(""https:\/\/evil"",""click""\)"/);
 assert.match(out,/"'  \+SUM\(A1:A2\)"/);
 assert.match(out,/"'@cmd"/);
 assert.match(out,/"'-23"/);
 assert.match(out,/"Alice, Bob"/);
 assert.match(out,/"multi\nline"/);
});
test("older expenses with missing GST basis are exported as Unknown and not silently net-priced",()=>{
 const data=fixture();data.jobs[0].expenses[0].gstBasis=undefined;
 assert.match(ownerExports(data).expenses,/"Unknown"/);
});

test("staff directory backup and CSV preserves roster and validates invalid objects",()=>{
 const data=fixture();data.staff.push({id:"staff-1",name:"Alex",role:"Carpenter",rate:50,active:true});
 assert.equal(parseOwnerBackup(JSON.stringify(data)).staff[0].name,"Alex");
 assert.match(ownerExports(data).staff,/"Carpenter"/);
 const bad=fixture();bad.staff=[{name:"No ID"}];
 assert.throws(()=>parseOwnerBackup(JSON.stringify(bad)),/Invalid staff directory/);
});
test("customer progress payment CSV preserves entered tax basis, actual cash and net receipts",()=>{
 const data=fixture();data.jobs[0].payments=[{status:"received",reference:"No GST",date:"2026-11-14",gstBasis:"no_gst",enteredAmount:200,amount:200,gstAmount:0,netAmount:200}];
 const out=ownerExports(data)["client-payments"];
 assert.match(out,/"No GST"/);
 assert.match(out,/"no_gst"/);
 assert.match(out,/"Actual cash AUD"/);
 assert.match(out,/"200"/);
});

test("job CSV explicitly includes only one reserve, other expenses inside total, and final profit",()=>{
 const data=fixture(),j=data.jobs[0];j.taxReservePct=15;
 j.expenses.push({id:"other",date:"2026-11-13",kind:"other",title:"Site parking",amount:50,gstBasis:"no_gst",paidStatus:"paid"});
 const out=ownerExports(data).jobs;
 assert.match(out,/Tax & Reserve Fund %/);
 assert.match(out,/Other expenses \(within total\) ex GST/);
 assert.match(out,/Final estimated profit after reserve/);
 assert.match(out,/"15"/);
});

test("Job CSV exports adjusted contract and overhead separately from incurred expenses",()=>{
 const data=fixture(),j=data.jobs[0];j.approvedVariationInc=220;j.overheadAllocationEx=40;j.taxReservePct=10;
 const out=ownerExports(data).jobs;
 assert.match(out,/Approved variations incl GST/);
 assert.match(out,/Adjusted contract incl GST/);
 assert.match(out,/Unbooked overhead allocation ex GST/);
 assert.match(out,/"220"/);
 assert.match(out,/"40"/);
});

test("CSV recomputes missing legacy payment GST from declared basis instead of inventing GST for No GST",()=>{
 const data=fixture();
 data.jobs[0].payments=[
  {id:"p-no",reference:"Legacy no GST",date:"2026-11-01",status:"received",gstBasis:"no_gst",amount:200},
  {id:"p-inc",reference:"Legacy incl GST",date:"2026-11-02",status:"received",gstBasis:"inc",amount:110},
  {id:"p-ex",reference:"Legacy ex GST",date:"2026-11-03",status:"received",gstBasis:"ex",enteredAmount:100,amount:110}
 ];
 const out=ownerExports(data)["client-payments"];
 const rows=out.trim().split("\r\n").slice(1);
 assert.equal(rows.length,3);
 assert.equal(rows[0],'"Bathroom","2026-11-01","Legacy no GST","received","no_gst","200","0","200","200"');
 assert.equal(rows[1],'"Bathroom","2026-11-02","Legacy incl GST","received","inc","110","10","100","110"');
 assert.equal(rows[2],'"Bathroom","2026-11-03","Legacy ex GST","received","ex","100","10","100","110"');
 assert.equal(data.jobs[0].payments[0].gstAmount,undefined,"Export never mutates original payment records");
});

test("CSV respects saved GST components when present",()=>{
 const data=fixture();
 data.jobs[0].payments=[{reference:"Saved breakdown",date:"2026-11-04",status:"received",gstBasis:"no_gst",enteredAmount:200,amount:200,gstAmount:0,netAmount:200}];
 assert.match(ownerExports(data)["client-payments"],/"Saved breakdown","received","no_gst","200","0","200","200"/);
});

test("backup validates actual tax payments and exports them independently from forecast reserve",()=>{
 const data=fixture();
 data.taxPayments=[{id:"tax-1",date:"2026-11-13",kind:"GST / BAS",amount:250,notes:"Paid receipt"}];
 const restored=parseOwnerBackup(JSON.stringify(data));
 assert.equal(restored.taxPayments[0].amount,250);
 assert.match(ownerExports(restored)["tax-payments"],/"2026-11-13","GST \/ BAS","250","Paid receipt"/);
 const invalid=fixture();invalid.taxPayments=[{date:"2026-02-30",amount:250}];
 assert.throws(()=>parseOwnerBackup(JSON.stringify(invalid)),/tax payment/);
});
test("attendance CSV includes clock times, notes, and single daily-rate cost",()=>{
 const data=fixture();
 data.jobs[0].timesheets=[{id:"work",date:"2026-11-12",worker:"Alex",payBasis:"day",days:1,startTime:"07:00",endTime:"15:30",breakMinutes:30,workedHours:8,notes:"Kitchen framing",rate:280}];
 const out=ownerExports(data)["labour-hours"];
 assert.match(out,/Wage basis/);
 assert.match(out,/"day","07:00","15:30","30","Kitchen framing","280","280"/);
});

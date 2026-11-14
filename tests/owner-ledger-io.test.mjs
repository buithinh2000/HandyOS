import test from "node:test";
import assert from "node:assert/strict";
import {parseOwnerBackup,csv,ownerExports} from "../owner-ledger-io.mjs";
const fixture=()=>({jobs:[{id:"job-a",name:"Bathroom",code:"",stage:"active",contract:1100,expenses:[{id:"e1",date:"2026-11-12",kind:"material",title:"Tiles",amount:110,gstBasis:"inc",paidStatus:"paid"}],timesheets:[{id:"t1",date:"2026-11-12",worker:"Alex",hours:8,rate:40}],workerPayments:[{id:"w1",worker:"Alex",paidOn:"2026-11-13",amount:200}],payments:[{id:"p1",reference:"Progress 1",date:"2026-11-14",status:"received",amount:500}],tasks:[],categories:[],materials:[]}],payrollSettlements:[],staff:[]});
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
 assert.deepEqual(Object.keys(exports),["jobs","labour-hours","wage-payments","expenses","client-payments","staff"]);
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

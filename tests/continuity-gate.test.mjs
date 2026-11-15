// Source-only continuity regression gate. Tests cannot verify Owner intent outside reviewed documents.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summary,customerPayment,workerTotals,canClose} from "../owner-ledger-core.mjs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const job=()=>({id:"brain-test",name:"Synthetic only",stage:"active",contract:11000,approvedVariationInc:1100,
 expenses:[{amount:1100,gstBasis:"inc",kind:"other"}],
 timesheets:[{worker:"Alex",date:"2026-11-15",hours:10,rate:40}],
 workerPayments:[{worker:"Alex",paidOn:"2026-11-15",amount:200}],
 payments:[{amount:2200,status:"received"}],remainingCostEx:500,overheadAllocationEx:100,taxReservePct:15});

test("project continuity files and decision provenance exist",()=>{
 const brain=read("PROJECT-BRAIN.md"),decisions=read("docs/DECISION-LEDGER.md"),handoff=read("docs/HANDOFF.md"),architecture=read("ARCHITECTURE.md"),gate=read("cloud/SECURITY-GATE.md");
 for(const content of [brain,decisions,handoff])assert.ok(content.length>300);
 assert.match(decisions,/PR 24|PR24|pull\/24/i);
 assert.match(decisions,/quote wizard/i);
 assert.match(brain,/INCLUDING GST/);
 assert.match(handoff,/NO-GO|NOT DEPLOYED/);
 assert.match(architecture,/NOT deployed/i);
 assert.match(gate,/NOT DEPLOYED/i);
});
test("combined reserve is exactly on adjusted gross contract and no other-cost double count",()=>{
 const x=summary(job());
 assert.equal(x.totalContractInc,12100);
 assert.equal(x.totalContractEx,11000);
 assert.equal(x.expensesEx,1000);
 assert.equal(x.otherExpensesEx,1000);
 assert.equal(x.labour,400);
 assert.equal(x.taxReserveAmount,1815);
 assert.equal(x.profitBeforeReserve,9000);
 assert.equal(x.profit,7185);
});
test("wage payments are not a second labour cost",()=>{
 const a=job(),before=summary(a).profit;
 a.workerPayments.push({worker:"Alex",paidOn:"2026-11-15",amount:200});
 assert.equal(summary(a).profit,before);
 assert.equal(workerTotals([a],"Alex").outstanding,0);
});
test("customer cash and GST basis must not be confused",()=>{
 assert.equal(customerPayment(100,"ex").amount,110);
 assert.equal(customerPayment(110,"inc").amount,110);
 assert.equal(customerPayment(100,"no_gst").amount,100);
 assert.equal(summary(job()).received,2200);
});
test("invalid or ambiguous financial inputs block final profit and closing",()=>{
 const a=job(); a.expenses[0].gstBasis=undefined;
 assert.equal(summary(a).profit,null);
 assert.equal(canClose(a).ok,false);
 a.expenses[0].gstBasis="inc";a.taxReservePct=105;
 assert.equal(summary(a).profit,null);
 assert.equal(canClose(a).ok,false);
});
test("remaining estimated cost blocks job closing until reconciled",()=>{
 const a=job();assert.equal(canClose(a).ok,false);
 a.remainingCostEx=0;assert.equal(canClose(a).ok,true);
});
test("owner-only public demo does not claim operational secure login or share payroll links",()=>{
 const html=read("owner-v1.html");
 assert.match(html,/Browser-only demo/i);
 assert.match(html,/No secure login/i);
 assert.doesNotMatch(html,/data-share-employee/);
});

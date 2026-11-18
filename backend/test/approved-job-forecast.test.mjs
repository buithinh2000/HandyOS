import test from "node:test";
import assert from "node:assert/strict";
import {approvedJobForecast} from "../src/approved-job-forecast.mjs";
const base={
 contractInc:"11000.00",approvedVariationsInc:["1100.00","-220.00"],
 expensesEx:["1000.00","150.00"],accruedWagesEx:"1250.00",
 weeklyExtrasEx:"170.00",remainingCostsEx:"500.00",unbookedOverheadEx:"200.00",
 taxReservePercent:"15.00",customerReceivedInc:"4400.00"
};
test("Owner parity: adjusted INC GST contract, reserve based on gross, final EX GST profit",()=>{
 const r=approvedJobForecast(base);
 assert.equal(r.profitReady,true);
 assert.equal(r.provisional,false);
 assert.deepEqual(r.totals,{
  adjustedContractInc:"11880.00",
  adjustedContractEx:"10800.00",
  accruedCostsEx:"2570.00",
  remainingCostsEx:"500.00",
  unbookedOverheadEx:"200.00",
  reserveAllocation:"1782.00",
  profitBeforeReserveEx:"7530.00",
  finalForecastProfitEx:"5748.00",
  customerBalanceInc:"7480.00",
  customerReceivedInc:"4400.00",
  reservePercent:"15.00"
 });
 assert.equal(r.passThroughIncludedInProfit,false);
});
test("One combined reserve uses adjusted contract INCLUDING GST, not net or profit",()=>{
 const r=approvedJobForecast({...base,approvedVariationsInc:[],expensesEx:[],
  accruedWagesEx:"0",weeklyExtrasEx:"0",remainingCostsEx:"0",unbookedOverheadEx:"0",
  taxReservePercent:15,customerReceivedInc:0});
 assert.equal(r.totals.adjustedContractEx,"10000.00");
 assert.equal(r.totals.reserveAllocation,"1650.00");
 assert.equal(r.totals.finalForecastProfitEx,"8350.00");
});
test("Pass-through reimbursements do not affect forecast profit, and paid wages are not additional expenses",()=>{
 const extra={...base,passThroughBills:[{gross:"700.00",received:"300.00"}],
  staffPaymentsInc:["1800.00"],materialReimbursementsInc:["900.00"]};
 const baseline=approvedJobForecast(base),other=approvedJobForecast(extra);
 assert.equal(other.totals.finalForecastProfitEx,baseline.totals.finalForecastProfitEx);
});
test("Missing assumptions stay NOT READY instead of defaulting missing values to zero",()=>{
 for(const field of ["contractInc","approvedVariationsInc","expensesEx","accruedWagesEx",
  "weeklyExtrasEx","remainingCostsEx","unbookedOverheadEx","taxReservePercent","customerReceivedInc"]){
  const partial={...base};delete partial[field];
  const result=approvedJobForecast(partial);
  assert.equal(result.profitReady,false,field);
  assert.equal(result.totals,null);
 }
});
test("Invalid monetary inputs, GST assumptions, rates, and variations cannot produce finance-ready status",()=>{
 for(const changes of [
  {contractInc:0},{contractInc:-1},{approvedVariationsInc:["-20000.00"]},
  {approvedVariationsInc:["abc"]},{taxReservePercent:-1},{taxReservePercent:101},
  {taxReservePercent:"15.999"},{remainingCostsEx:"-5.00"},
  {expensesEx:["25.001"]},{unbookedOverheadEx:Infinity},
  {customerReceivedInc:null}
 ]){
  const result=approvedJobForecast({...base,...changes});
  assert.equal(result.profitReady,false,JSON.stringify(changes));
  assert.equal(result.provisional,true);
 }
});
test("Cents precision and negative signed variations are exact",()=>{
 const r=approvedJobForecast({contractInc:"110.01",approvedVariationsInc:["-0.01"],
  expensesEx:["0.01","0.02"],accruedWagesEx:"0",weeklyExtrasEx:"0",
  remainingCostsEx:"0",unbookedOverheadEx:"0",taxReservePercent:"0.01",
  customerReceivedInc:"110.00"});
 assert.equal(r.profitReady,true);
 assert.equal(r.totals.adjustedContractEx,"100.00");
 assert.equal(r.totals.accruedCostsEx,"0.03");
 assert.equal(r.totals.reserveAllocation,"0.01");
 assert.equal(r.totals.finalForecastProfitEx,"99.96");
});

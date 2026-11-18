// HandyOS approved Owner financial forecast — pure, source-only parity kernel.
// Does NOT read/write PostgreSQL, accept browser authority, deploy AWS or declare cloud finance ready.
// All inputs are AUD amounts; GST-inclusive signed contract is converted at standard 10% GST.
// Missing/uncertain fields fail closed. Client reimbursement pass-through is NEVER a profit item.
function cents(input,{signed=false}={}){
 const value=typeof input==="number"?String(input):input;
 if(typeof value!=="string"||!/^-?(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value))
  throw Error("Invalid AUD amount");
 const negative=value.startsWith("-");
 if(negative&&!signed)throw Error("Negative amount not permitted");
 const unsigned=negative?value.slice(1):value;
 const [whole,frac=""]=unsigned.split(".");
 const result=Number(whole)*100+Number(frac.padEnd(2,"0"));
 if(!Number.isSafeInteger(result)||result>100000000000)throw Error("Amount out of bounds");
 return negative?-result:result;
}
function money(value){return (value/100).toFixed(2)}
function percentBasisPoints(value){
 const p=typeof value==="number"?String(value):value;
 if(typeof p!=="string"||!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(p))throw Error("Invalid reserve percentage");
 const [a,b=""]=p.split(".");
 const units=Number(a)*100+Number(b.padEnd(2,"0"));
 if(!Number.isSafeInteger(units)||units>10000)throw Error("Reserve percentage out of range");
 return units;
}
function sum(values,name,{signed=false}={}){
 if(!Array.isArray(values)||values.length>10000)throw Error("Missing or invalid "+name);
 return values.reduce((acc,x)=>{
  const next=acc+cents(x,{signed});
  if(!Number.isSafeInteger(next))throw Error("Amount overflow");
  return next;
 },0);
}
/**
 * Contract: all required fields explicitly supplied; null/undefined must not
 * silently become zero. Variations are approved, signed, INC GST. Expenses/wages/
 * bonuses/remaining/overhead are EX GST. Payments are actual received INC GST.
 * No tax is calculated; reserve is an Owner planning set-aside only.
 */
export function approvedJobForecast(input){
 const failure=message=>({profitReady:false,provisional:true,reason:message,totals:null});
 try{
  if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Missing owner-approved input");
  const base=cents(input.contractInc);
  const variations=sum(input.approvedVariationsInc,"approved variations",{signed:true});
  const gross=base+variations;
  if(base<=0||gross<=0)throw Error("Adjusted signed contract must be positive");
  const rate=percentBasisPoints(input.taxReservePercent);
  const expenses=sum(input.expensesEx,"expenses EX GST");
  const wages=cents(input.accruedWagesEx);
  const extras=cents(input.weeklyExtrasEx);
  const remaining=cents(input.remainingCostsEx);
  const overhead=cents(input.unbookedOverheadEx);
  const received=cents(input.customerReceivedInc);
  // Integer cents rounding half-up at the contract GST conversion and reserve.
  const net=Math.floor((gross*10+5)/11);
  const reserve=Math.floor((gross*rate+5000)/10000);
  const costs=expenses+wages+extras;
  const before=net-costs-remaining-overhead;
  const final=before-reserve;
  return {profitReady:true,provisional:false,reason:null,totals:{
   adjustedContractInc:money(gross),adjustedContractEx:money(net),
   accruedCostsEx:money(costs),remainingCostsEx:money(remaining),
   unbookedOverheadEx:money(overhead),reserveAllocation:money(reserve),
   profitBeforeReserveEx:money(before),finalForecastProfitEx:money(final),
   customerBalanceInc:money(gross-received),customerReceivedInc:money(received),
   reservePercent:(rate/100).toFixed(2)
  },passThroughIncludedInProfit:false};
 }catch(error){return failure(error?.message||"Invalid financial inputs")}
}

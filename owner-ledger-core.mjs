// HandyOS Owner Ledger V1 - deterministic, dependency-free calculations.
// Prices and payment entries here are manually entered. No AI, invoice, or tax advice.
export const STORE_KEY = "handyos-workspace-v07";
export const GST = 0.10;
export const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
export const validMoney = v => v!=="" && v!==null && v!==undefined && Number.isFinite(Number(v)) && Number(v)>=0;
export const money = v => validMoney(v) ? round2(Number(v)) : NaN;
export const dollars = v => new Intl.NumberFormat("en-AU", {style:"currency",currency:"AUD"}).format(Number.isFinite(v)?v:0);
export function expenseEx(entry) {
 const n=money(entry.amount);
 if(!Number.isFinite(n))return NaN;
 if(entry.gstBasis==="inc")return round2(n/1.1);
 if(entry.gstBasis==="ex"||entry.gstBasis==="no_gst")return n;
 return NaN; // legacy entry without declared tax basis cannot be inferred
}
export function normalize(db) {
 const state=db&&typeof db==="object"?db:{};
 if(!Array.isArray(state.jobs))state.jobs=[];
 if(!Array.isArray(state.staff))state.staff=[];
 if(!Array.isArray(state.payrollSettlements))state.payrollSettlements=[];
 for(const job of state.jobs) {
  for(const field of ["tasks","categories","materials","timesheets","expenses","payments"])if(!Array.isArray(job[field]))job[field]=[];
  if(!Array.isArray(job.workerPayments))job.workerPayments=[];
  job.stage=job.stage||"active";
 }
 return state;
}
export function labourRows(job) {
 return (job.timesheets||[]).map(t=>({...t,hours:Number(t.hours)||0,rate:Number(t.rate)||0,total:round2((Number(t.hours)||0)*(Number(t.rate)||0))}));
}
export function weeklyStart(day) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day||"")))return "";
 const d=new Date(day+"T12:00:00Z");
 if(!Number.isFinite(d.getTime()))return "";
 const weekday=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-weekday);return d.toISOString().slice(0,10);
}
export function labourByPeriod(job,period) {
 const grouped=new Map();
 for(const t of labourRows(job)){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(t.date||"")))continue;
  const key=period==="month"?t.date.slice(0,7):weeklyStart(t.date);
  const row=grouped.get(key)||{period:key,hours:0,total:0,entries:0};
  row.hours+=t.hours;row.total=round2(row.total+t.total);row.entries++;
  grouped.set(key,row);
 }
 return [...grouped.values()].sort((a,b)=>b.period.localeCompare(a.period));
}

export const workerKey = name=>String(name||"").trim().toLowerCase();
export function workerNames(jobs,staff=[]){
 const names=new Map();
 for(const member of staff){const n=String(member.name||"").trim();if(n&&!names.has(workerKey(n)))names.set(workerKey(n),n)}
 for(const job of jobs)for(const t of [...(job.timesheets||[]),...(job.workerPayments||[])]){
   const n=String(t.worker||"").trim();if(n&&!names.has(workerKey(n)))names.set(workerKey(n),n);
 }
 return [...names.values()].sort((a,b)=>a.localeCompare(b));
}
export function workerTotals(jobs,name,jobId=""){
 const key=workerKey(name),earned=[],payments=[];
 for(const job of jobs){
  if(jobId&&job.id!==jobId)continue;
  for(const t of labourRows(job))if(workerKey(t.worker)===key)earned.push({...t,jobId:job.id,jobName:job.name});
  for(const p of job.workerPayments||[])if(workerKey(p.worker)===key&&validMoney(p.amount))payments.push({...p,amount:money(p.amount),jobId:job.id,jobName:job.name});
 }
 const due=round2(earned.reduce((a,t)=>a+t.total,0)),paid=round2(payments.reduce((a,p)=>a+p.amount,0));
 return{earned, payments, due, paid, outstanding:round2(due-paid),hours:round2(earned.reduce((a,t)=>a+t.hours,0))};
}
export function workerByPeriod(jobs,name,period="week",jobId=""){
 const data=workerTotals(jobs,name,jobId);const rows=new Map();
 const keyFor=d=>period==="month"?String(d||"").slice(0,7):period==="year"?String(d||"").slice(0,4):weeklyStart(d);
 for(const t of data.earned){const k=keyFor(t.date);if(!k)continue;const row=rows.get(k)||{period:k,hours:0,earned:0,paid:0};row.hours=round2(row.hours+t.hours);row.earned=round2(row.earned+t.total);rows.set(k,row)}
 for(const p of data.payments){const k=keyFor(p.periodStart||p.paidOn);if(!k)continue;const row=rows.get(k)||{period:k,hours:0,earned:0,paid:0};row.paid=round2(row.paid+p.amount);rows.set(k,row)}
 return [...rows.values()].sort((a,b)=>b.period.localeCompare(a.period)).map(x=>({...x,outstanding:round2(x.earned-x.paid)}));
}
export function wageYearSummary(jobs,year="",staff=[]){
 const results=employeesSummary(jobs,staff).map(worker=>{
  const wages=worker.earned.filter(x=>!year||String(x.date||"").startsWith(year));
  const payments=worker.payments.filter(x=>!year||String(x.paidOn||"").startsWith(year));
  const earned=round2(wages.reduce((s,x)=>s+x.total,0)),paid=round2(payments.reduce((s,x)=>s+x.amount,0));
  return{name:worker.name,hours:round2(wages.reduce((s,x)=>s+x.hours,0)),earned,paid,difference:round2(earned-paid)};
 });
 return{rows:results,earned:round2(results.reduce((s,x)=>s+x.earned,0)),paid:round2(results.reduce((s,x)=>s+x.paid,0))};
}
export function periodSettlement(jobs,worker,period,key,jobId=""){
 if(!["week","month"].includes(period))throw new Error("Only weekly or monthly settlements are supported.");
 if(!/^\d{4}-\d{2}(-\d{2})?$/.test(key))throw new Error("Invalid settlement period.");
 const row=workerByPeriod(jobs,worker,period,jobId).find(x=>x.period===key);
 if(!row)throw new Error("No recorded work or payments in this period.");
 return{worker,period,key,jobId,hours:row.hours,earned:row.earned,paid:row.paid,balance:row.outstanding};
}
export function isSettlementCurrent(jobs,s){
 try{const actual=periodSettlement(jobs,s.worker,s.period,s.key,s.jobId||"");return actual.hours===s.hours&&actual.earned===s.earned&&actual.paid===s.paid}catch{return false}
}
export function employeesSummary(jobs,staff=[]){
 return workerNames(jobs,staff).map(name=>({name,...workerTotals(jobs,name)}));
}
export function expenseSummary(jobs,{jobId="",kind="",year="",month=""}={}){
 const entries=[];
 for(const job of jobs){
  if(jobId&&job.id!==jobId)continue;
  for(const e of job.expenses||[]){
   if(kind&&e.kind!==kind)continue;
   if(year&&!String(e.date||"").startsWith(year))continue;
   if(month&&!String(e.date||"").startsWith(month))continue;
   entries.push({...e,jobId:job.id,jobName:job.name,net:expenseEx(e)});
  }
 }
 return{entries,entered:round2(entries.reduce((a,e)=>a+(money(e.amount)||0),0)),
 net:round2(entries.reduce((a,e)=>a+(Number.isFinite(e.net)?e.net:0),0)),
 paid:round2(entries.filter(e=>e.paidStatus==="paid").reduce((a,e)=>a+(money(e.amount)||0),0)),
 unclassified:entries.filter(e=>!Number.isFinite(e.net)).length};
}
export function companySummary(jobs){
 const expense=expenseSummary(jobs);const employees=employeesSummary(jobs);
 return{jobs:jobs.length,open:jobs.filter(j=>j.stage!=="closed").length,received:round2(jobs.reduce((a,j)=>a+summary(j).received,0)),labourDue:round2(employees.reduce((a,e)=>a+e.due,0)),wagesPaid:round2(employees.reduce((a,e)=>a+e.paid,0)),wagesOutstanding:round2(employees.reduce((a,e)=>a+e.outstanding,0)),expensesEx:expense.net,expensesPaid:expense.paid,expenseUnclassified:expense.unclassified};
}
// Payment input is the amount keyed by Owner. amount remains actual customer cash
// for compatibility with older entries that stored inclusive cash in amount.
export function customerPayment(input,basis="inc"){
 const entered=money(input);
 if(!Number.isFinite(entered)||entered<=0)throw new Error("Payment amount must be positive.");
 if(!["inc","ex","no_gst"].includes(basis))throw new Error("Invalid GST basis.");
 const amount=basis==="ex"?round2(entered*1.1):entered;
 const gstAmount=basis==="inc"?round2(entered-entered/1.1):basis==="ex"?round2(amount-entered):0;
 const netAmount=round2(amount-gstAmount);
 return {enteredAmount:entered,amount,gstBasis:basis,gstAmount,netAmount};
}
export function paymentBreakdown(job){
 const entries=(job.payments||[]).map(p=>{
  const gross=money(p.amount),basis=p.gstBasis||"inc";
  // Old entries had no tax marker and were entered as cash incl GST.
  const net=Number.isFinite(gross)?basis==="no_gst"?gross:basis==="ex"?
    // New entries always store amount as actual cash. No further multiplication.
    round2(gross/1.1):round2(gross/1.1):NaN;
  return {...p,gross,net,gst:Number.isFinite(net)?round2(gross-net):NaN,basis};
 });
 const received=entries.filter(p=>p.status==="received");
 const requested=entries.filter(p=>p.status==="requested");
 return {entries,cash:round2(received.reduce((a,p)=>a+(Number.isFinite(p.gross)?p.gross:0),0)),
 requested:round2(requested.reduce((a,p)=>a+(Number.isFinite(p.gross)?p.gross:0),0)),
 receivedNet:round2(received.reduce((a,p)=>a+(Number.isFinite(p.net)?p.net:0),0)),
 receivedGst:round2(received.reduce((a,p)=>a+(Number.isFinite(p.gst)?p.gst:0),0))};
}
export function jobGroup(job){
 const stage=String(job.stage||"").toLowerCase();
 if(stage==="closed"||stage==="finished")return "finished";
 if(["active","handover","in_progress"].includes(stage))return "active";
 if(["approved","scheduled","booked"].includes(stage))return "booked";
 // Surveys, drafts and unapproved quotes are NOT confirmed bookings.
 return "planning";
}
export function paymentProgress(job){
 const s=summary(job);
 // Actual RECEIVED cash / adjusted signed contract, both inc GST.
 const percent=s.totalContractInc&&s.totalContractInc>0
  ?Math.round((s.received/s.totalContractInc)*10000)/100:null;
 return {percent,received:s.received,contract:s.totalContractInc,remaining:s.remaining,overpaid:percent!==null&&percent>100};
}
export function isISODate(value){
 if(typeof value!=="string"||!/^\\d{4}-\\d{2}-\\d{2}$/.test(value))return false;
 const date=new Date(value+"T12:00:00Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function scheduleEntry(job){
 const start=job.startDate||"",end=job.endDate||"";
 if(!start&&!end)return {scheduled:false,start:"",end:""};
 if(!isISODate(start)||!isISODate(end)||start>end)return {scheduled:false,invalid:true,start,end};
 return {scheduled:true,start,end};
}
export function scheduleDays(jobs,from,days=14){
 if(!isISODate(from)||!Number.isInteger(days)||days<1||days>62)throw new Error("Invalid calendar range.");
 const anchor=new Date(from+"T12:00:00Z");
 const result=[];
 for(let index=0;index<days;index++){
  const d=new Date(anchor.getTime()+index*86400000),date=d.toISOString().slice(0,10);
  const booked=jobs.filter(j=>{
   if(jobGroup(j)==="finished")return false;
   const e=scheduleEntry(j);
   return e.scheduled&&e.start<=date&&date<=e.end;
  });
  result.push({date,booked,bookedCount:booked.length,unrecorded:booked.length===0});
 }
 return result;
}
export function summary(job) {
 const agreedInc=money(job.contract),hasContract=Number.isFinite(agreedInc)&&agreedInc>0;
 // Approved variations are net increases/decreases in signed, GST-inclusive contract value.
 const variationRaw=job.approvedVariationInc===undefined||job.approvedVariationInc===""?0:Number(job.approvedVariationInc);
 const variationValid=Number.isFinite(variationRaw);
 const approvedVariationInc=variationValid?round2(variationRaw):null;
 const adjustedTotal=hasContract&&variationValid?round2(agreedInc+approvedVariationInc):null;
 const adjustedContractValid=adjustedTotal!==null&&adjustedTotal>0;
 const totalContractInc=adjustedContractValid?adjustedTotal:null;
 const totalContractEx=adjustedContractValid?round2(totalContractInc/1.1):null;
 const agreedEx=hasContract?round2(agreedInc/1.1):null; // standard 10% GST assumption
 let expensesEx=0,expensesEntered=0,unclassified=0;
 for(const e of job.expenses||[]) {
  const raw=money(e.amount),net=expenseEx(e);
  if(Number.isFinite(raw))expensesEntered=round2(expensesEntered+raw);
  if(Number.isFinite(net))expensesEx=round2(expensesEx+net);else unclassified++;
 }
 const labour=round2(labourRows(job).reduce((s,x)=>s+x.total,0));
 const wagesPaid=round2((job.workerPayments||[]).reduce((a,p)=>a+(money(p.amount)||0),0));
 const payment=paymentBreakdown(job);
 const received=payment.cash;
 const requested=payment.requested;
 const costEx=round2(expensesEx+labour);
 // Owner's combined Tax & Reserve Fund is a planning allocation, NOT a tax liability.
 // Its basis is the gross agreed contract (incl GST) as requested.
 // Tax, reserve and expenses are never auto-written into the expense ledger.
 const rawRate=job.taxReservePct===undefined||job.taxReservePct===""?0:Number(job.taxReservePct);
 const taxReserveValid=Number.isFinite(rawRate)&&rawRate>=0&&rawRate<=100;
 const taxReservePct=taxReserveValid?rawRate:null;
 const taxReserveAmount=adjustedContractValid&&taxReserveValid?round2(totalContractInc*taxReservePct/100):null;
 // Owner-entered future costs are estimates only: not paid expenses or accrued wages.
 // Do not add these to expense ledger; Owner must reduce them when posting actuals.
 const remainingCostRaw=job.remainingCostEx===undefined||job.remainingCostEx===""?0:money(job.remainingCostEx);
 const remainingCostValid=Number.isFinite(remainingCostRaw);
 const remainingCostEx=remainingCostValid?remainingCostRaw:null;
 const overheadRaw=job.overheadAllocationEx===undefined||job.overheadAllocationEx===""?0:money(job.overheadAllocationEx);
 const overheadValid=Number.isFinite(overheadRaw);
 const overheadAllocationEx=overheadValid?overheadRaw:null;
 // Overhead is an unbooked owner allocation, separate from actual Expenses.
 const profitBeforeReserve=adjustedContractValid&&unclassified===0&&remainingCostValid&&overheadValid?round2(totalContractEx-costEx-remainingCostEx-overheadAllocationEx):null;
 const profit=profitBeforeReserve!==null&&taxReserveAmount!==null?round2(profitBeforeReserve-taxReserveAmount):null;
 const otherExpensesEx=round2((job.expenses||[]).filter(e=>e.kind==="other").reduce((sum,e)=>{const v=expenseEx(e);return sum+(Number.isFinite(v)?v:0)},0));

 const remaining=adjustedContractValid?round2(totalContractInc-received):null;
 const risks=[];
 if(!hasContract)risks.push("Enter the agreed contract amount incl GST before estimating profit.");
 if(!variationValid||hasContract&&!adjustedContractValid)risks.push("Approved variation must leave the adjusted contract above zero.");
 if(!overheadValid)risks.push("Overhead allocation must be a non-negative ex-GST amount.");
 if(overheadValid&&overheadAllocationEx>0)risks.push("Allocated overhead must not duplicate any expense already included in this job.");
 if(unclassified)risks.push(unclassified+" expense line(s) have unknown GST basis.");
 if(!taxReserveValid)risks.push("Tax & Reserve Fund percentage must be between 0 and 100.");
 if(!remainingCostValid)risks.push("Remaining Costs must be a valid non-negative amount ex GST.");
 if(remainingCostValid&&remainingCostEx>0)risks.push("Remaining Costs are owner estimates, NOT incurred costs. Update them as actual expenses and labour are recorded to avoid double counting.");
 if(job.stage==="closed"&&remainingCostEx>0)risks.push("Closed job still has estimated remaining costs: reconcile to actual costs.");
 if((job.expenses||[]).some(e=>e.kind==="labour")&&(job.timesheets||[]).length)risks.push("Labour expense lines and timesheets both exist: verify no duplicated wages.");
 if(hasContract&&received>agreedInc)risks.push("Recorded cash received exceeds the agreed contract amount.");
 return {approvedVariationInc,totalContractInc,totalContractEx,overheadAllocationEx,remainingCostEx,otherExpensesEx,taxReservePct,taxReserveAmount,profitBeforeReserve,paymentReceivedNet:payment.receivedNet,paymentReceivedGst:payment.receivedGst,wagesPaid,wagesOutstanding:round2(labour-wagesPaid),hasContract,agreedInc:hasContract?agreedInc:null,agreedEx,expensesEx,expensesEntered,unclassified,labour,costEx,received,requested,remaining,profit,risks};
}
export function canClose(job) {
 const s=summary(job);
 if(!s.hasContract)return {ok:false,reason:"Agreed contract amount is required to close a job."};
 if(s.totalContractInc===null)return {ok:false,reason:"Approved variations must result in a positive adjusted contract."};
 if(s.overheadAllocationEx===null)return {ok:false,reason:"Enter valid overhead allocation ex GST."};
 if(s.unclassified)return {ok:false,reason:"Classify GST basis of every expense before closing."};
 if(s.taxReservePct===null)return {ok:false,reason:"Enter a valid Tax & Reserve Fund percentage."};
 if(s.remainingCostEx===null)return {ok:false,reason:"Enter a valid Remaining Costs amount."};
 if(s.remainingCostEx>0)return {ok:false,reason:"Remaining Costs are still estimated. Reconcile them into actual expenses and labour, then set remaining costs to zero before closing."};
 return {ok:true,reason:""};
}
export function snapshot(job,closedAt) {
 const permission=canClose(job);
 if(!permission.ok)throw new Error(permission.reason);
 const s=summary(job);
 return {closedAt,contractInc:s.agreedInc,contractEx:s.agreedEx,approvedVariationInc:s.approvedVariationInc,totalContractInc:s.totalContractInc,totalContractEx:s.totalContractEx,overheadAllocationEx:s.overheadAllocationEx,expensesEx:s.expensesEx,otherExpensesEx:s.otherExpensesEx,remainingCostEx:s.remainingCostEx,labour:s.labour,taxReservePct:s.taxReservePct,taxReserveAmount:s.taxReserveAmount,profitBeforeReserve:s.profitBeforeReserve,profitEstimate:s.profit,receivedInc:s.received,remainingContractInc:s.remaining,expenseCount:job.expenses.length,paymentCount:job.payments.length,timesheetCount:job.timesheets.length,wagesPaid:s.wagesPaid,wagesOutstanding:s.wagesOutstanding};
}

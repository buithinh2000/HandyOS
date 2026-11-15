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
 if(!Array.isArray(state.taxPayments))state.taxPayments=[];
 if(!Array.isArray(state.materialBills))state.materialBills=[];
 for(const job of state.jobs) {
  for(const field of ["tasks","categories","materials","timesheets","expenses","payments"])if(!Array.isArray(job[field]))job[field]=[];
  if(!Array.isArray(job.workerPayments))job.workerPayments=[];
  job.stage=job.stage||"active";
 }
 return state;
}
// Separate weekly bonus rows accrue wages without creating fictional hours or days.
// A bonus is never a payment and must not be re-entered as a Job Expense.
export function wageBonusRows(job){
 return (job.wageAdjustments||[]).filter(a=>a.kind==="bonus"&&isISODate(a.date)&&
   weeklyStart(a.date)===a.weekStart&&validMoney(a.amount)&&Number(a.amount)>0)
  .map(a=>({id:a.id,worker:a.worker,date:a.date,weekStart:a.weekStart,
   payBasis:"bonus",hours:0,days:0,rate:0,total:money(a.amount),
   kind:"bonus",notes:a.notes||""}));
}
export function recordWeeklyBonus(job,{id,worker,date,amount,notes=""}){
 if(!job||jobGroup(job)==="finished")throw new Error("Reopen the Job before adding a bonus.");
 if(typeof id!=="string"||!id||typeof worker!=="string"||!worker.trim()||
   !isISODate(date)||!validMoney(amount)||Number(amount)<=0||typeof notes!=="string")
  throw new Error("Enter a worker, valid date and positive bonus.");
 if((job.wageAdjustments||[]).some(a=>a.id===id))throw new Error("Duplicate bonus ID.");
 const entry={id,worker:worker.trim(),date,weekStart:weeklyStart(date),amount:money(amount),kind:"bonus",notes:notes.trim().slice(0,250)};
 job.wageAdjustments??=[];job.wageAdjustments.push(entry);
 return entry;
}
export function labourRows(job) {
 const work=(job.timesheets||[]).map(t=>{
  const dayOff=t.dayOff===true,daily=t.payBasis==="day";
  const units=daily?Number(t.days)||0:Number(t.hours)||0,rate=Number(t.rate)||0;
  return {...t,payBasis:daily?"day":"hour",dayOff,
   hours:dayOff?0:daily?(Number(t.workedHours)||0):units,
   days:dayOff?0:daily?units:0,
   rate,total:dayOff?0:round2(units*rate)};
 });
 return [...work,...wageBonusRows(job)];
}
// Attendance corrections keep original time/rate and a local change history.
// A day off is unpaid by default; historical wage payments are never rewritten.
export function setAttendanceDayOff(state,{jobId,entryId,dayOff,reason="",changedAt}){
 const job=(state.jobs||[]).find(j=>j.id===jobId);
 if(!job||jobGroup(job)==="finished")throw new Error("Reopen this Job before changing attendance.");
 const t=(job.timesheets||[]).find(x=>x.id===entryId);
 if(!t)throw new Error("Attendance entry not found.");
 if(typeof dayOff!=="boolean"||typeof reason!=="string"||reason.length>250||
    typeof changedAt!=="string"||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(changedAt)||!isISODate(changedAt.slice(0,10)))
  throw new Error("Invalid attendance correction.");
 if((t.dayOff===true)===dayOff)return false;
 t.dayOff=dayOff;
 t.statusHistory??=[];
 t.statusHistory.push({at:changedAt,dayOff,reason:reason.trim()});
 return true;
}
// Clock entries are local same-day shifts. No overnight, automatic overtime or award rules.
export function workedHours(start,end,breakMinutes=0){
 const clock=x=>typeof x==="string"&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(x)?Number(x.slice(0,2))*60+Number(x.slice(3)):NaN;
 const a=clock(start),b=clock(end),rest=Number(breakMinutes);
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||!Number.isInteger(rest)||rest<0||rest>=b-a)return null;
 return Math.round((b-a-rest)/60*100)/100;
}
export function employeeTaxSummary(records,name,period="",key=""){
 const all=(records||[]).filter(x=>workerKey(x.worker)===workerKey(name)&&isISODate(x.date)&&Number.isFinite(Number(x.amount))&&Number(x.amount)>=0);
 const filtered=all.filter(x=>!period||(period==="week"?weeklyStart(x.date)===key:period==="month"?x.date.slice(0,7)===key:x.date.slice(0,4)===key));
 return Math.round(filtered.reduce((sum,x)=>sum+Number(x.amount),0)*100)/100;
}
export function weeklyStart(day) {
 if(!isISODate(day))return "";
 const d=new Date(day+"T12:00:00Z");
 if(!Number.isFinite(d.getTime()))return "";
 const weekday=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-weekday);return d.toISOString().slice(0,10);
}
export function labourByPeriod(job,period) {
 const grouped=new Map();
 for(const t of labourRows(job)){
  if(!isISODate(t.date))continue;
  const key=period==="month"?t.date.slice(0,7):weeklyStart(t.date);
  const row=grouped.get(key)||{period:key,hours:0,days:0,total:0,entries:0};
  row.hours+=t.hours;row.days=round2(row.days+t.days);row.total=round2(row.total+t.total);row.entries++;
  grouped.set(key,row);
 }
 return [...grouped.values()].sort((a,b)=>b.period.localeCompare(a.period));
}

export const workerKey = name=>String(name||"").trim().toLowerCase();
export function workerNames(jobs,staff=[]){
 const names=new Map();
 for(const member of staff){const n=String(member.name||"").trim();if(n&&!names.has(workerKey(n)))names.set(workerKey(n),n)}
 for(const job of jobs)for(const t of [...(job.timesheets||[]),...(job.workerPayments||[]),...(job.wageAdjustments||[])]){
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
 return{earned, payments, due, paid, outstanding:round2(due-paid),hours:round2(earned.reduce((a,t)=>a+t.hours,0)),days:round2(earned.reduce((a,t)=>a+t.days,0))};
}
export function workerByPeriod(jobs,name,period="week",jobId=""){
 const data=workerTotals(jobs,name,jobId);const rows=new Map();
 const keyFor=d=>!isISODate(d)?"":period==="month"?d.slice(0,7):period==="year"?d.slice(0,4):weeklyStart(d);
 for(const t of data.earned){const k=keyFor(t.date);if(!k)continue;const row=rows.get(k)||{period:k,hours:0,days:0,earned:0,paid:0};row.hours=round2(row.hours+t.hours);row.days=round2(row.days+t.days);row.earned=round2(row.earned+t.total);rows.set(k,row)}
 for(const p of data.payments){const k=keyFor(p.periodStart||p.paidOn);if(!k)continue;const row=rows.get(k)||{period:k,hours:0,days:0,earned:0,paid:0};row.paid=round2(row.paid+p.amount);rows.set(k,row)}
 return [...rows.values()].sort((a,b)=>b.period.localeCompare(a.period)).map(x=>({...x,outstanding:round2(x.earned-x.paid)}));
}
export function wageYearSummary(jobs,year="",staff=[]){
 const results=employeesSummary(jobs,staff).map(worker=>{
  // Year-filtered views must use the same strict real-date rule as wage period groups.
  // All-time totals still retain legacy records for reconciliation rather than deleting them.
  const wages=worker.earned.filter(x=>!year||(isISODate(x.date)&&x.date.startsWith(year)));
  const payments=worker.payments.filter(x=>!year||(isISODate(x.paidOn)&&x.paidOn.startsWith(year)));
  const earned=round2(wages.reduce((s,x)=>s+x.total,0)),paid=round2(payments.reduce((s,x)=>s+x.amount,0));
  return{name:worker.name,hours:round2(wages.reduce((s,x)=>s+x.hours,0)),days:round2(wages.reduce((s,x)=>s+x.days,0)),earned,paid,difference:round2(earned-paid)};
 });
 return{rows:results,earned:round2(results.reduce((s,x)=>s+x.earned,0)),paid:round2(results.reduce((s,x)=>s+x.paid,0))};
}
export function periodSettlement(jobs,worker,period,key,jobId=""){
 if(!["week","month"].includes(period))throw new Error("Only weekly or monthly settlements are supported.");
 if(!/^\d{4}-\d{2}(-\d{2})?$/.test(key))throw new Error("Invalid settlement period.");
 const row=workerByPeriod(jobs,worker,period,jobId).find(x=>x.period===key);
 if(!row)throw new Error("No recorded work or payments in this period.");
 return{worker,period,key,jobId,hours:row.hours,days:row.days,earned:row.earned,paid:row.paid,balance:row.outstanding};
}
export function isSettlementCurrent(jobs,s){
 try{const actual=periodSettlement(jobs,s.worker,s.period,s.key,s.jobId||"");return actual.hours===s.hours&&(s.days===undefined||actual.days===s.days)&&actual.earned===s.earned&&actual.paid===s.paid}catch{return false}
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
   // Filtered reports must exclude impossible legacy dates, not silently assign them to a month/year.
   // Unfiltered expense totals retain every original record for reconciliation.
   if((year||month)&&!isISODate(e.date))continue;
   if(year&&!e.date.startsWith(year))continue;
   if(month&&!e.date.startsWith(month))continue;
   entries.push({...e,jobId:job.id,jobName:job.name,net:expenseEx(e)});
  }
 }
 return{entries,entered:round2(entries.reduce((a,e)=>a+(money(e.amount)||0),0)),
 net:round2(entries.reduce((a,e)=>a+(Number.isFinite(e.net)?e.net:0),0)),
 paid:round2(entries.filter(e=>e.paidStatus==="paid").reduce((a,e)=>a+(money(e.amount)||0),0)),
 unclassified:entries.filter(e=>!Number.isFinite(e.net)).length};
}
// Date-scoped management view. Cash movements and accrued wages are distinct.
export function financialPeriodSummary(state,{from="",to=""}={}){
 const inside=d=>!from&&!to||isISODate(d)&&(!from||d>=from)&&(!to||d<=to);
 const jobs=state.jobs||[];
 const earned=round2(jobs.reduce((n,j)=>n+labourRows(j).filter(t=>inside(t.date)).reduce((a,t)=>a+t.total,0),0));
 const wagePaid=round2(jobs.reduce((n,j)=>n+(j.workerPayments||[]).filter(p=>inside(p.paidOn)).reduce((a,p)=>a+(money(p.amount)||0),0),0));
 const receipts=round2(jobs.reduce((n,j)=>n+(j.payments||[]).filter(p=>p.status==="received"&&inside(p.date)).reduce((a,p)=>a+(money(p.amount)||0),0),0));
 const expensesPaid=round2(jobs.reduce((n,j)=>n+(j.expenses||[]).filter(e=>e.paidStatus==="paid"&&inside(e.date)).reduce((a,e)=>a+(money(e.amount)||0),0),0));
 const expensesEx=round2(jobs.reduce((n,j)=>n+(j.expenses||[]).filter(e=>inside(e.date)).reduce((a,e)=>a+(Number.isFinite(expenseEx(e))?expenseEx(e):0),0),0));
 const unknownGst=jobs.reduce((n,j)=>n+(j.expenses||[]).filter(e=>inside(e.date)&&!Number.isFinite(expenseEx(e))).length,0);
 const taxesPaid=round2((state.taxPayments||[]).filter(p=>inside(p.date)).reduce((a,p)=>a+(money(p.amount)||0),0));
 // Cash-flow estimate is NOT accounting profit. Tax payments are separate from GST reserve forecasts.
 const netCash=round2(receipts-wagePaid-expensesPaid-taxesPaid);
 return{receipts,earned,wagePaid,expensesPaid,expensesEx,unknownGst,taxesPaid,netCash};
}
// Customer-paid materials are tracked as pass-through reimbursement cash, separately from contract revenue and job profit.
export function materialBillSummary(bills=[],jobId=""){
 const items=bills.filter(b=>(!jobId||b.jobId===jobId)&&Number.isFinite(Number(b.amount))&&Number(b.amount)>0);
 const subtotal=list=>Math.round(list.reduce((n,b)=>n+Number(b.amount),0)*100)/100;
 const reimbursed=items.filter(b=>b.status==="reimbursed");
 const pending=items.filter(b=>b.status!=="reimbursed");
 return {count:items.length,spent:subtotal(items),reimbursed:subtotal(reimbursed),outstanding:subtotal(pending),
  draft:subtotal(pending.filter(b=>b.status==="draft")),sent:subtotal(pending.filter(b=>b.status==="sent"))};
}
export function companySummary(jobs){
 const expense=expenseSummary(jobs);const employees=employeesSummary(jobs);
 return{jobs:jobs.length,open:jobs.filter(j=>jobGroup(j)!=="finished").length,received:round2(jobs.reduce((a,j)=>a+summary(j).received,0)),labourDue:round2(employees.reduce((a,e)=>a+e.due,0)),wagesPaid:round2(employees.reduce((a,e)=>a+e.paid,0)),wagesOutstanding:round2(employees.reduce((a,e)=>a+e.outstanding,0)),expensesEx:expense.net,expensesPaid:expense.paid,expenseUnclassified:expense.unclassified};
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
 const draft=entries.filter(p=>p.status==="draft");
 return {entries,draft:round2(draft.reduce((a,p)=>a+(Number.isFinite(p.gross)?p.gross:0),0)),cash:round2(received.reduce((a,p)=>a+(Number.isFinite(p.gross)?p.gross:0),0)),
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
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
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
   // Planning/quoting dates are tentative, not confirmed bookings.
   // Legacy active/handover stages count as ongoing work; closed jobs do not.
   if(!["booked","active"].includes(jobGroup(j)))return false;
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
 if(adjustedContractValid&&received>totalContractInc)risks.push("Recorded customer cash exceeds the adjusted contract (including approved variations). Check overpayments, variations and duplicate receipts.");
 if(adjustedContractValid&&job.stage==="closed"&&received<totalContractInc)risks.push("Job is closed but customer cash remains outstanding against the adjusted contract.");
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

/**
 * Owner-only crew clock for the browser demo. Check-in creates no wages.
 * Check-out atomically records one existing timesheet per selected worker/day.
 * One crew shares the recorded shift and unpaid break; staff rates remain individual.
 * Same-day only; no overtime/award or payroll withholding assessment.
 */
export function startCrewSession(state,{jobId,staffIds,at,id}){
 const job=state.jobs.find(x=>x.id===jobId);
 if(!job||!["booked","active"].includes(jobGroup(job)))throw new Error("Choose a booked or in-progress Job.");
 if(!Array.isArray(staffIds)||!staffIds.length||new Set(staffIds).size!==staffIds.length)throw new Error("Select at least one unique employee.");
 if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(at)||!isISODate(at.slice(0,10)))throw new Error("Invalid check-in date or time.");
 if((state.crewSessions||[]).some(x=>!x.checkOutAt))throw new Error("Finish the active crew session first.");
 const members=staffIds.map(key=>state.staff.find(x=>x.id===key&&x.active!==false));
 if(members.some(x=>!x)||new Set(members.map(x=>workerKey(x.name))).size!==members.length)throw new Error("Select valid, distinct employees.");
 const date=at.slice(0,10);
 for(const member of members){
  if(state.jobs.some(j=>(j.timesheets||[]).some(t=>t.date===date&&workerKey(t.worker)===workerKey(member.name))))
   throw new Error(member.name+" already has attendance on this date. Edit that record instead.");
  if(!["hour","day"].includes(member.payBasis)||!Number.isFinite(Number(member.rate))||Number(member.rate)<0)throw new Error("Employee has an invalid wage rate.");
 }
 const entry={id,jobId,staffIds:[...staffIds],workDate:date,checkInAt:at,checkOutAt:null};
 if(!id||typeof id!=="string"||(state.crewSessions||[]).some(x=>x.id===id))throw new Error("Invalid session ID.");
 state.crewSessions??=[];state.crewSessions.push(entry);
 return entry;
}
export function finishCrewSession(state,{at,breakMinutes=30,dayPortion=1,notes="",ids=[]}){
 const session=(state.crewSessions||[]).find(x=>!x.checkOutAt);
 if(!session)throw new Error("No active crew session.");
 const job=state.jobs.find(x=>x.id===session.jobId);
 if(!job||jobGroup(job)==="finished")throw new Error("The job is finished. Reopen it before check-out.");
 if(typeof at!=="string"||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(at)||!isISODate(at.slice(0,10))||at.slice(0,10)!==session.workDate)throw new Error("Check-out must be on the same work date.");
 if(!Number.isInteger(breakMinutes)||breakMinutes<0||breakMinutes>600)throw new Error("Invalid unpaid break.");
 if(![0.5,1].includes(dayPortion))throw new Error("Select full or half-day rate.");
 const hours=workedHours(session.checkInAt.slice(11),at.slice(11),breakMinutes);
 if(hours===null)throw new Error("Check-out must be after check-in, less the unpaid break.");
 if(!Array.isArray(ids)||ids.length!==session.staffIds.length||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=="string"||!x))throw new Error("Invalid attendance IDs.");
 const newRows=session.staffIds.map((staffId,i)=>{
  const member=state.staff.find(x=>x.id===staffId);
  if(!member||!["hour","day"].includes(member.payBasis)||!Number.isFinite(Number(member.rate))||Number(member.rate)<0)throw new Error("Invalid employee rate. Fix it before check-out.");
  if(state.jobs.some(j=>(j.timesheets||[]).some(t=>t.date===session.workDate&&workerKey(t.worker)===workerKey(member.name))))throw new Error(member.name+" already has recorded wages for this date.");
  return {id:ids[i],worker:member.name,date:session.workDate,payBasis:member.payBasis,
   startTime:session.checkInAt.slice(11),endTime:at.slice(11),breakMinutes,
   workedHours:hours,hours:member.payBasis==="hour"?hours:0,days:member.payBasis==="day"?dayPortion:0,
   rate:Number(member.rate),notes:String(notes).trim().slice(0,500),crewSessionId:session.id};
 });
 job.timesheets.push(...newRows);
 session.checkOutAt=at;session.breakMinutes=breakMinutes;session.dayPortion=dayPortion;
 return newRows;
}

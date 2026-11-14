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
export function workerNames(jobs){
 const names=new Map();
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
export function wageYearSummary(jobs,year=""){
 const results=employeesSummary(jobs).map(worker=>{
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
export function employeesSummary(jobs){
 return workerNames(jobs).map(name=>({name,...workerTotals(jobs,name)}));
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
export function summary(job) {
 const agreedInc=money(job.contract),hasContract=Number.isFinite(agreedInc)&&agreedInc>0;
 const agreedEx=hasContract?round2(agreedInc/1.1):null; // draft assumes contract is standard GST taxable
 let expensesEx=0,expensesEntered=0,unclassified=0;
 for(const e of job.expenses||[]) {
  const raw=money(e.amount),net=expenseEx(e);
  if(Number.isFinite(raw))expensesEntered=round2(expensesEntered+raw);
  if(Number.isFinite(net))expensesEx=round2(expensesEx+net);else unclassified++;
 }
 const labour=round2(labourRows(job).reduce((s,x)=>s+x.total,0));
 const wagesPaid=round2((job.workerPayments||[]).reduce((a,p)=>a+(money(p.amount)||0),0));
 const received=round2((job.payments||[]).filter(p=>p.status==="received").reduce((s,p)=>s+(money(p.amount)||0),0));
 const requested=round2((job.payments||[]).filter(p=>p.status==="requested").reduce((s,p)=>s+(money(p.amount)||0),0));
 const costEx=round2(expensesEx+labour);
 const profit=hasContract&&unclassified===0?round2(agreedEx-costEx):null;
 const remaining=hasContract?round2(agreedInc-received):null;
 const risks=[];
 if(!hasContract)risks.push("Enter the agreed contract amount incl GST before estimating profit.");
 if(unclassified)risks.push(unclassified+" expense line(s) have unknown GST basis.");
 if((job.expenses||[]).some(e=>e.kind==="labour")&&(job.timesheets||[]).length)risks.push("Labour expense lines and timesheets both exist: verify no duplicated wages.");
 if(hasContract&&received>agreedInc)risks.push("Recorded cash received exceeds the agreed contract amount.");
 return {wagesPaid,wagesOutstanding:round2(labour-wagesPaid),hasContract,agreedInc:hasContract?agreedInc:null,agreedEx,expensesEx,expensesEntered,unclassified,labour,costEx,received,requested,remaining,profit,risks};
}
export function canClose(job) {
 const s=summary(job);
 if(!s.hasContract)return {ok:false,reason:"Agreed contract amount is required to close a job."};
 if(s.unclassified)return {ok:false,reason:"Classify GST basis of every expense before closing."};
 return {ok:true,reason:""};
}
export function snapshot(job,closedAt) {
 const permission=canClose(job);
 if(!permission.ok)throw new Error(permission.reason);
 const s=summary(job);
 return {closedAt,contractInc:s.agreedInc,contractEx:s.agreedEx,expensesEx:s.expensesEx,labour:s.labour,profitEstimate:s.profit,receivedInc:s.received,remainingContractInc:s.remaining,expenseCount:job.expenses.length,paymentCount:job.payments.length,timesheetCount:job.timesheets.length,wagesPaid:s.wagesPaid,wagesOutstanding:s.wagesOutstanding};
}

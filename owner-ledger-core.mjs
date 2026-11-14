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
 for(const job of state.jobs) {
  for(const field of ["tasks","categories","materials","timesheets","expenses","payments"])if(!Array.isArray(job[field]))job[field]=[];
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
 return {hasContract,agreedInc:hasContract?agreedInc:null,agreedEx,expensesEx,expensesEntered,unclassified,labour,costEx,received,requested,remaining,profit,risks};
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
 return {closedAt,contractInc:s.agreedInc,contractEx:s.agreedEx,expensesEx:s.expensesEx,labour:s.labour,profitEstimate:s.profit,receivedInc:s.received,remainingContractInc:s.remaining,expenseCount:job.expenses.length,paymentCount:job.payments.length,timesheetCount:job.timesheets.length};
}

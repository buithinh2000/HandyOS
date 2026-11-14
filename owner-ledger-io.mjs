import {normalize,summary,expenseEx} from "./owner-ledger-core.mjs";

function record(x){return !!x&&typeof x==="object"&&!Array.isArray(x)}
function arr(x){return Array.isArray(x)&&x.every(record)}
const MAX_JOBS=5000,MAX_LINES=100000;
export function parseOwnerBackup(json){
 let input;
 try{input=JSON.parse(json)}catch{throw new Error("File is not valid JSON.")}
 if(!record(input)||!Array.isArray(input.jobs))throw new Error("Backup must contain a jobs array.");
 if(input.jobs.length>MAX_JOBS)throw new Error("Backup has too many jobs.");
 const seen=new Set();
 let count=0;
 for(const j of input.jobs){
  if(!record(j)||typeof j.id!=="string"||!j.id||typeof j.name!=="string"||!j.name.trim())
   throw new Error("Backup contains an invalid job.");
  if(seen.has(j.id))throw new Error("Backup contains duplicate job IDs.");
  seen.add(j.id);
  for(const name of ["tasks","expenses","payments","timesheets","materials","workerPayments"]){
   if(j[name]!==undefined&&!arr(j[name]))throw new Error("Invalid "+name+" entries for job "+j.name+".");
   count+=(j[name]||[]).length;
  }
  if(j.categories!==undefined&&!Array.isArray(j.categories))throw new Error("Invalid categories.");
  if(count>MAX_LINES)throw new Error("Backup has too many entries.");
 }
 if(input.payrollSettlements!==undefined&&!arr(input.payrollSettlements))throw new Error("Invalid payroll settlement records.");
 if(input.staff!==undefined&&(!arr(input.staff)||input.staff.some(x=>typeof x.id!=="string"||typeof x.name!=="string"||!x.name.trim())))throw new Error("Invalid staff directory.");
 // Do not change input records until the entire backup is validated.
 return normalize(input);
}
export function csvValue(value){
 let s=String(value??"");
 // Avoid execution of untrusted spreadsheet formulas, including whitespace and control characters.
 if(/^[\s\u0000-\u001f]*[=+\-@]/.test(s))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
export function csv(headers,rows){
 return "\ufeff"+[headers,...rows].map(row=>row.map(csvValue).join(",")).join("\r\n")+"\r\n";
}
export function ownerExports(state){
 const jobs=state.jobs||[];
 const jobRows=jobs.map(j=>{const s=summary(j);return[j.name,j.code||"",j.stage||"",s.agreedInc??"",s.received,s.expensesEx,s.otherExpensesEx,s.labour,s.remainingCostEx??"",s.profitBeforeReserve??"",s.taxReservePct??"",s.taxReserveAmount??"",s.profit??"",s.wagesPaid,s.wagesOutstanding]});
 const hours=jobs.flatMap(j=>(j.timesheets||[]).map(x=>[j.name,x.worker||"",x.date||"",x.hours??"",x.rate??"",(Number(x.hours)||0)*(Number(x.rate)||0)]));
 const wagePayments=jobs.flatMap(j=>(j.workerPayments||[]).map(x=>[j.name,x.worker||"",x.paidOn||"",x.amount??""]));
 const expenses=jobs.flatMap(j=>(j.expenses||[]).map(x=>[j.name,x.date||"",x.kind||"",x.title||"",x.amount??"",x.gstBasis||"",Number.isFinite(expenseEx(x))?expenseEx(x):"Unknown",x.paidStatus||""]));
 const clientPayments=jobs.flatMap(j=>(j.payments||[]).map(x=>[j.name,x.date||"",x.reference||"",x.status||"",x.gstBasis||"inc (legacy)",x.enteredAmount??x.amount??"",x.gstAmount??(x.amount!=null?Math.round(Number(x.amount)/11*100)/100:""),x.netAmount??(x.amount!=null?Math.round(Number(x.amount)/1.1*100)/100:""),x.amount??""]));
 const staff=(state.staff||[]).map(x=>[x.name,x.role||"",x.rate??"",x.active===false?"inactive":"active"]);
 return{
  "jobs":csv(["Job","Code","Stage","Contract incl GST","Cash received","Expenses ex GST","Other expenses (within total) ex GST","Labour earned","Remaining Costs ex GST (estimated)","Profit before reserve ex GST","Tax & Reserve Fund %","Tax & Reserve Fund AUD","Final estimated profit after reserve","Wages paid","Wages outstanding"],jobRows),
  "labour-hours":csv(["Job","Employee","Work date","Hours","Hourly cost AUD","Wages earned AUD"],hours),
  "wage-payments":csv(["Job","Employee","Paid date","Amount AUD"],wagePayments),
  "expenses":csv(["Job","Date","Category","Description","Entered amount AUD","GST basis","Cost ex GST AUD","Paid status"],expenses),
  "client-payments":csv(["Job","Date","Reference","Status","GST basis","Amount entered AUD","GST portion AUD","Net of GST AUD","Actual cash AUD"],clientPayments),
  "staff":csv(["Name","Role / trade","Default hourly cost AUD","Status"],staff)
 };
}

import {normalize,summary,expenseEx,paymentBreakdown,isISODate,labourRows} from "./owner-ledger-core.mjs";

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
 if(input.taxPayments!==undefined&&(!arr(input.taxPayments)||input.taxPayments.some(x=>!isISODate(x.date)||!Number.isFinite(Number(x.amount))||Number(x.amount)<=0)))throw new Error("Invalid actual tax payment records.");
 if(input.materialBills!==undefined&&(!arr(input.materialBills)||input.materialBills.some(b=>typeof b.id!=="string"||typeof b.jobId!=="string"||!isISODate(b.date)||typeof b.reference!=="string"||!Number.isFinite(Number(b.amount))||Number(b.amount)<=0||!["draft","sent","reimbursed"].includes(b.status)||typeof b.image!=="string"||b.image.length>260000||!/^data:image\\/(?:jpeg|png|webp);base64,/.test(b.image))))throw new Error("Invalid material bill or receipt image.");
 if(input.materialBills?.some(b=>!seen.has(b.jobId)))throw new Error("Material bill references a missing Job.");
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
 const jobRows=jobs.map(j=>{const s=summary(j);return[j.name,j.code||"",j.stage||"",s.agreedInc??"",s.approvedVariationInc??"",s.totalContractInc??"",s.totalContractEx??"",s.received,s.expensesEx,s.otherExpensesEx,s.labour,s.remainingCostEx??"",s.overheadAllocationEx??"",s.profitBeforeReserve??"",s.taxReservePct??"",s.taxReserveAmount??"",s.profit??"",s.wagesPaid,s.wagesOutstanding]});
 const hours=jobs.flatMap(j=>labourRows(j).map(x=>[j.name,x.worker||"",x.date||"",x.hours??"",x.days??"",x.payBasis||"hour",x.startTime||"",x.endTime||"",x.breakMinutes??"",x.notes||"",x.rate??"",x.total]));
 const wagePayments=jobs.flatMap(j=>(j.workerPayments||[]).map(x=>[j.name,x.worker||"",x.paidOn||"",x.amount??""]));
 const expenses=jobs.flatMap(j=>(j.expenses||[]).map(x=>[j.name,x.date||"",x.kind||"",x.title||"",x.amount??"",x.gstBasis||"",Number.isFinite(expenseEx(x))?expenseEx(x):"Unknown",x.paidStatus||""]));
 // Older payments may lack saved GST breakdowns: compute from actual cash and declared basis, never assume No GST contains GST.
 const clientPayments=jobs.flatMap(j=>paymentBreakdown(j).entries.map(x=>[j.name,x.date||"",x.reference||"",x.status||"",x.gstBasis||"inc (legacy)",x.enteredAmount??x.amount??"",x.gstAmount??(Number.isFinite(x.gst)?x.gst:""),x.netAmount??(Number.isFinite(x.net)?x.net:""),x.amount??""]));
 const staff=(state.staff||[]).map(x=>[x.name,x.role||"",x.rate??"",x.active===false?"inactive":"active"]);
 return{
  "jobs":csv(["Job","Code","Stage","Base contract incl GST","Approved variations incl GST","Adjusted contract incl GST","Adjusted contract ex GST","Cash received","Expenses ex GST","Other expenses (within total) ex GST","Labour earned","Remaining Costs ex GST (estimated)","Unbooked overhead allocation ex GST","Profit before reserve ex GST","Tax & Reserve Fund %","Tax & Reserve Fund AUD","Final estimated profit after reserve","Wages paid","Wages outstanding"],jobRows),
  "labour-hours":csv(["Job","Employee","Work date","Hours","Days","Wage basis","Start","Finish","Break minutes","Notes","Rate AUD per unit","Wages earned AUD"],hours),
  "wage-payments":csv(["Job","Employee","Paid date","Amount AUD"],wagePayments),
  "expenses":csv(["Job","Date","Category","Description","Entered amount AUD","GST basis","Cost ex GST AUD","Paid status"],expenses),
  "client-payments":csv(["Job","Date","Reference","Status","GST basis","Amount entered AUD","GST portion AUD","Net of GST AUD","Actual cash AUD"],clientPayments),
  "staff":csv(["Name","Role / trade","Default hourly cost AUD","Status"],staff),
  "material-reimbursements":csv(["Date","Job","Store / receipt","Amount AUD","Customer status","Photo attached","Notes"],(state.materialBills||[]).map(b=>[b.date,jobs.find(j=>j.id===b.jobId)?.name||"",b.reference,b.amount,b.status,b.image?"yes":"no",b.notes||""])),
  "tax-payments":csv(["Paid date","Tax type","Amount AUD","Notes"],(state.taxPayments||[]).map(x=>[x.date,x.kind||"",x.amount,x.notes||""]))
 };
}

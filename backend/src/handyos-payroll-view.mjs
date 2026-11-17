// HandyOS payroll: employee overview -> weekly details -> audited bonus/payment/close.
// All data comes from authenticated server. Never stores wages in localStorage.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function currentMonday(){
 const d=new Date(),offset=(d.getDay()+6)%7;
 d.setDate(d.getDate()-offset);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
}
function element(tag,text,parent){
 const x=document.createElement(tag);if(text!==undefined)x.textContent=text;
 if(parent)parent.append(x);return x;
}
function selectOptions(select,rows,label){
 select.replaceChildren();
 const blank=element("option","Select job",select);blank.value="";
 for(const job of rows){
  if(!UUID.test(job.id)||typeof job.name!=="string")throw Error("Invalid job record");
  const option=element("option",job.name,select);option.value=job.id;
 }
}
function money(text){
 const value=Number(text);
 return Number.isFinite(value)?"$"+value.toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2}):"Unavailable";
}
export async function mountHandyOsPayroll({root,api}={}){
 if(!root||typeof root.replaceChildren!=="function"||typeof api?.request!=="function")
  throw Error("HandyOS payroll not available");
 const panel=document.createElement("section");
 panel.className="handyos-payroll";
 panel.innerHTML=`<style>
 .handyos-payroll{border:1px solid #d9e4ee;background:white;border-radius:16px;padding:16px;margin:12px 0;display:grid;gap:12px}
 .handyos-payroll h2{margin:0;font-size:22px}.handyos-payroll h3{margin:0;font-size:17px}
 .handyos-payroll label{display:grid;gap:5px}
 .handyos-payroll input,.handyos-payroll select{width:100%;box-sizing:border-box;min-height:45px;border:1px solid #b8cddb;border-radius:9px;padding:8px;font:inherit}
 .handyos-payroll button{min-height:45px;border-radius:9px;border:1px solid #17699b;background:#17699b;color:white;padding:10px;font:inherit}
 .handyos-payroll button:disabled{opacity:.55}.handyos-payroll [hidden]{display:none!important}
 .handyos-payroll .payroll-list{display:grid;gap:8px}
 .handyos-payroll .payroll-list button{background:#f4f9fb;color:#16476b;text-align:left}
 .handyos-payroll .payroll-total{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
 .handyos-payroll .payroll-total div{background:#f2f6f9;padding:11px;border-radius:9px}
 .handyos-payroll .payroll-total strong{display:block;margin-top:4px}
 .handyos-payroll form{display:grid;gap:8px;border-top:1px solid #e2ebf1;padding-top:10px}
 </style>
 <h2>Employees · Weekly payroll</h2>
 <div class="payroll-list" data-staff-overview></div>
 <section data-staff-detail hidden>
  <button type="button" data-back>All employees</button>
  <h3 data-worker></h3>
  <label>Week starting Monday<input type="date" data-week required></label>
  <button type="button" data-refresh>View weekly payroll</button>
  <div class="payroll-total" data-totals></div>
  <div data-work-summary></div>
  <form data-bonus>
   <h3>Bonus / Allowance</h3>
   <label>Job<select name="jobId" required></select></label>
   <label>Type<select name="kind"><option value="bonus">Bonus</option><option value="allowance">Allowance</option></select></label>
   <label>Amount (AUD)<input type="number" name="amount" min="0.01" step="0.01" required></label>
   <button type="submit">Add bonus / allowance</button>
  </form>
  <form data-payment>
   <h3>Record actual wage payment</h3>
   <label>Job<select name="jobId" required></select></label>
   <label>Amount paid (AUD)<input type="number" name="amount" min="0.01" step="0.01" required></label>
   <label>Payment date<input type="date" name="paidOn" required></label>
   <label>Reference<input name="reference" maxlength="160"></label>
   <button type="submit">Save payment</button>
  </form>
  <button type="button" data-close disabled>Close fully paid week</button>
 </section>
 <p role="status" data-payroll-status aria-live="polite">Loading employees…</p>`;
 root.replaceChildren(panel);
 const list=panel.querySelector("[data-staff-overview]"),detail=panel.querySelector("[data-staff-detail]"),
  weeklyDate=panel.querySelector("[data-week]"),totals=panel.querySelector("[data-totals]"),
  work=panel.querySelector("[data-work-summary]"),title=panel.querySelector("[data-worker]"),
  status=panel.querySelector("[data-payroll-status]"),close=panel.querySelector("[data-close]"),
  bonus=panel.querySelector("[data-bonus]"),payment=panel.querySelector("[data-payment]");
 let selected=null,disposed=false,busy=false,report=null;
 const say=value=>{if(!disposed)status.textContent=value};
 weeklyDate.value=currentMonday();
 {const today=new Date();payment.elements.paidOn.value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");}
 async function load(){
  if(!selected||busy)return;
  const d=new Date(weeklyDate.value+"T00:00:00Z");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(weeklyDate.value)||Number.isNaN(d.getTime())||d.getUTCDay()!==1){
   say("Select a Monday as the start of payroll week.");return;
  }
  busy=true;close.disabled=true;say("Loading weekly payroll…");
  try{
   const data=await api.request({path:"/v1/payroll/"+selected.id+"/weeks/"+weeklyDate.value});
   if(!data?.payroll?.totals)throw Error("Invalid payroll result");
   report=data.payroll;
   totals.replaceChildren();work.replaceChildren();
   for(const [label,key] of [["Earned","earned"],["Bonus / extras","extras"],["Total due","due"],["Already paid","paid"],["Remaining","remaining"]]){
    const cell=element("div",undefined,totals);element("small",label,cell);
    element("strong",money(report.totals[key]),cell);
   }
   const count=Array.isArray(report.attendance)?report.attendance.length:0;
   element("p",count+" attendance record(s) · "+report.totals.openEntries+" still checked in",work);
   if(report.closed){
    element("strong","Week closed · no further payroll changes",work);
    bonus.hidden=true;payment.hidden=true;
   }else{
    bonus.hidden=false;payment.hidden=false;
   }
   close.disabled=!report.canClose;
   close.hidden=Boolean(report.closed);
   say("Payroll loaded from server.");
  }catch{report=null;totals.replaceChildren();work.replaceChildren();say("Cannot load payroll. Please retry.")}
  finally{busy=false}
 }
 const open=async staff=>{
  selected=staff;title.textContent=staff.display_name;
  list.hidden=true;detail.hidden=false;await load();
 };
 const onBack=()=>{selected=null;report=null;detail.hidden=true;list.hidden=false;say("Select an employee to view payroll.")};
 const onRefresh=()=>load();
 const onSave=async(evt,action)=>{
  evt.preventDefault();
  if(!selected||busy||report?.closed)return;
  const form=evt.currentTarget;
  const amount=Number(form.elements.amount.value);
  const jobId=form.elements.jobId.value;
  if(!UUID.test(jobId)||!Number.isFinite(amount)||amount<=0){say("Choose a job and valid amount.");return}
  busy=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
  say(action==="bonus"?"Saving bonus…":"Saving payment…");
  try{
   const body=action==="bonus"?
    {jobId,amount,kind:form.elements.kind.value}:
    {jobId,amount,paidOn:form.elements.paidOn.value,reference:form.elements.reference.value};
   const result=await api.request({method:"POST",path:"/v1/payroll/"+selected.id+"/weeks/"+weeklyDate.value+"/"+action,json:body});
   if(!result?.payroll)throw Error("Server did not confirm");
   form.reset();busy=false;await load();say(action==="bonus"?"Bonus saved on server.":"Payment saved on server.");
  }catch{say("Unable to save. Please check payroll is still open.")}
  finally{busy=false;button.disabled=false}
 };
 const onBonus=evt=>onSave(evt,"bonus"),onPayment=evt=>onSave(evt,"payment");
 const onClose=async()=>{
  if(!selected||busy||!report?.canClose)return;
  busy=true;close.disabled=true;say("Closing paid payroll week…");
  try{
   const result=await api.request({method:"POST",path:"/v1/payroll/"+selected.id+"/weeks/"+weeklyDate.value+"/close",json:{}});
   if(!result?.payroll?.closed)throw Error("Closure not confirmed");
   busy=false;await load();say("Payroll week closed and saved.");
  }catch{say("Payroll could not be closed. Verify payments and open attendance.")}
  finally{busy=false}
 };
 panel.querySelector("[data-back]").addEventListener("click",onBack);
 panel.querySelector("[data-refresh]").addEventListener("click",onRefresh);
 bonus.addEventListener("submit",onBonus);payment.addEventListener("submit",onPayment);
 close.addEventListener("click",onClose);
 try{
  const [staffResp,jobResp]=await Promise.all([
   api.request({path:"/v1/staff"}),api.request({path:"/v1/jobs"})
  ]);
  if(!Array.isArray(staffResp.staff)||!Array.isArray(jobResp.jobs))throw Error("Invalid lists");
  selectOptions(bonus.elements.jobId,jobResp.jobs,"Job");
  selectOptions(payment.elements.jobId,jobResp.jobs,"Job");
  if(!staffResp.staff.length)element("p","No employees yet. Add one in Today.",list);
  for(const staff of staffResp.staff){
   if(!UUID.test(staff.id)||typeof staff.display_name!=="string")throw Error("Invalid employee");
   const btn=element("button",staff.display_name+(staff.active?"":" (Inactive)"),list);
   btn.type="button";btn.addEventListener("click",()=>open(staff));
  }
  say("Select an employee to see their weekly wages.");
 }catch{say("Employee payroll is unavailable. Please refresh after signing in.")}
 return Object.freeze({destroy(){disposed=true;root.replaceChildren()}});
}

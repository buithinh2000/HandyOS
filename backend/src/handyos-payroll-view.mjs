import {melbourneToday,melbourneCurrentMonday} from "./handyos-business-date.mjs";
// HandyOS payroll: employee overview -> weekly details -> audited bonus/payment/close.
// All data comes from authenticated server. Never stores wages in localStorage.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const currentMonday=melbourneCurrentMonday;
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
 <section data-overview>
  <button type="button" data-create-employee>+ Add employee</button>
  <form data-employee-form hidden>
   <h3>New employee</h3>
   <label>Employee name<input name="displayName" maxlength="160" required></label>
   <label>Trade / role<input name="roleLabel" maxlength="100"></label>
   <label>Pay basis<select name="wageUnit"><option value="day">Daily</option><option value="hour">Hourly</option></select></label>
   <label>Base wage (AUD)<input name="defaultRate" type="number" min="0" max="100000" step="0.01" required></label>
   <button type="submit">Save employee</button>
  </form>
  <div class="payroll-list" data-staff-overview></div>
 </section>
 <section data-staff-detail hidden>
  <button type="button" data-back>All employees</button>
  <h3 data-worker></h3>
  <p data-base-pay></p>
  <label>Week starting Monday<input type="date" data-week required></label>
  <button type="button" data-refresh>View weekly payroll</button>
  <div class="payroll-total" data-totals></div>
  <div data-work-summary></div>
  <details data-rule-section>
   <summary>Recurring bonus & allowances · Manage rules</summary>
   <p>Starts from a future Monday. Daily amounts apply per completed workday for the chosen job; weekly and monthly amounts are fixed. Existing closed payroll is unchanged.</p>
   <div class="payroll-list" data-rules-list></div>
   <form data-rule-form>
    <h3>Add recurring amount</h3>
    <label>Job<select name="jobId" required></select></label>
    <label>Type<select name="kind"><option value="bonus">Bonus</option><option value="allowance">Allowance</option></select></label>
    <label>Name<input name="label" maxlength="120" required placeholder="Travel allowance, attendance bonus…"></label>
    <label>Repeat<select name="cadence"><option value="day">Per completed workday</option><option value="week">Every week</option><option value="month">Every month</option></select></label>
    <label>Amount (AUD)<input name="amount" type="number" min="0.01" step="0.01" required></label>
    <label>Start from Monday<input name="startsOn" type="date" required></label>
    <button type="submit">Save recurring rule</button>
   </form>
  </details>
  <section aria-label="Recorded bonuses and allowances"><h3>Recorded extras for this week</h3><div class="payroll-list" data-adjustment-list></div></section>
  <form data-bonus>
   <h3>Add another bonus / allowance / expense</h3>
   <label>Job<select name="jobId" required></select></label>
   <label>Type<select name="kind"><option value="bonus">Bonus</option><option value="allowance">Allowance</option><option value="expense">Other expense / reimbursement</option></select></label>
   <label>Bonus / allowance name<input name="label" maxlength="120" placeholder="Site bonus, travel, weekend work…" required></label>
   <label>Apply to<select name="period"><option value="week">This week (once)</option><option value="day">Specific day (once)</option><option value="month">This month (once)</option></select></label>
   <label data-day-field hidden>Work date<input type="date" name="effectiveDay"></label>
   <p data-period-help>This entry is added once to the selected payroll week. It does not automatically repeat.</p>
   <label>Amount (AUD)<input type="number" name="amount" min="0.01" step="0.01" required></label>
   <label>Details (optional)<input type="text" name="notes" maxlength="500" placeholder="Travel, tools, meal allowance…"></label>
   <button type="submit">Add bonus / allowance / expense</button>
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
 const overview=panel.querySelector("[data-overview]"),addEmployee=panel.querySelector("[data-create-employee]"),
  employeeForm=panel.querySelector("[data-employee-form]"),
  list=panel.querySelector("[data-staff-overview]"),detail=panel.querySelector("[data-staff-detail]"),
  weeklyDate=panel.querySelector("[data-week]"),totals=panel.querySelector("[data-totals]"),
  work=panel.querySelector("[data-work-summary]"),title=panel.querySelector("[data-worker]"),
  status=panel.querySelector("[data-payroll-status]"),close=panel.querySelector("[data-close]"),
  bonus=panel.querySelector("[data-bonus]"),payment=panel.querySelector("[data-payment]"),
  adjustmentList=panel.querySelector("[data-adjustment-list]"),
  ruleList=panel.querySelector("[data-rules-list]"),ruleForm=panel.querySelector("[data-rule-form]");
 let selected=null,disposed=false,busy=false,report=null,ruleBusy=false;
 const say=value=>{if(!disposed)status.textContent=value};
 weeklyDate.value=currentMonday();
 payment.elements.paidOn.value=melbourneToday();
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
   totals.replaceChildren();work.replaceChildren();adjustmentList.replaceChildren();
   const items=Array.isArray(report.adjustments)?report.adjustments:[];
   if(!items.length)element("p","No bonuses, allowances or expenses recorded for this week.",adjustmentList);
   for(const item of items){
    const name=typeof item.label==="string"&&item.label.trim()?item.label:item.kind;
    const when=item.period==="day"?"Day · "+String(item.effective_on||"").slice(0,10):
      item.period==="month"?"Monthly one-time":"This week";
    element("p",name+" · "+when+" · "+money(item.amount),adjustmentList);
   }
   const recurring=Array.isArray(report.recurring)?report.recurring:[];
   for(const rule of recurring)element("p","Recurring · "+rule.label+" · "+rule.cadence+" · "+money(rule.amount),adjustmentList);
   const profile=report.staff;
   panel.querySelector("[data-base-pay]").textContent=
    "Base pay: "+money(profile.defaultRate)+" / "+(profile.wageUnit==="hour"?"hour":"day")+
    (profile.roleLabel?" · "+profile.roleLabel:"");
   for(const [label,key] of [["Base wages","earned"],["Bonus","bonus"],["Allowance","allowance"],
    ["Other employee expense","otherExpenses"],["Total extras","extras"],
    ["Total due","due"],["Already paid","paid"],["Remaining","remaining"]]){
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
 async function loadRules(){
  if(!selected||ruleBusy)return;
  ruleBusy=true;ruleList.replaceChildren();
  try{
   const result=await api.request({path:"/v1/payroll/"+selected.id+"/rules"});
   if(!Array.isArray(result.rules)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(result.nextEligibleMonday))
    throw Error("Invalid rules");
   ruleForm.elements.startsOn.min=result.nextEligibleMonday;
   if(!ruleForm.elements.startsOn.value||ruleForm.elements.startsOn.value<result.nextEligibleMonday)
    ruleForm.elements.startsOn.value=result.nextEligibleMonday;
   if(!result.rules.length)element("p","No recurring rules. Add one below.",ruleList);
   for(const rule of result.rules){
    if(!UUID.test(rule.id))throw Error("Invalid rule");
    const line=element("div",undefined,ruleList);
    const ended=Boolean(rule.ends_on);
    element("span",rule.label+" · "+money(rule.amount)+" / "+rule.cadence+" · starts "+rule.starts_on+
      (ended?" · stops "+rule.ends_on:""),line);
    if(!ended){
     const stop=element("button","Stop from next week",line);stop.type="button";
     stop.addEventListener("click",async()=>{
      if(ruleBusy)return;
      ruleBusy=true;stop.disabled=true;
      try{
       await api.request({method:"POST",path:"/v1/payroll/"+selected.id+"/rules/"+rule.id+"/stop",json:{}});
       say("Rule stop scheduled. Existing and closed weeks are unchanged.");
      }catch{say("Could not stop this rule. It may not have started yet.");}
      finally{ruleBusy=false;await loadRules()}
     });
    }
   }
  }catch{element("p","Cannot load recurring rules. Please retry.",ruleList)}
  finally{ruleBusy=false}
 }
 async function onSaveRule(evt){
  evt.preventDefault();if(!selected||ruleBusy)return;
  ruleBusy=true;const submit=ruleForm.querySelector('button[type="submit"]');submit.disabled=true;
  try{
   const data={
    jobId:ruleForm.elements.jobId.value,kind:ruleForm.elements.kind.value,
    label:ruleForm.elements.label.value.trim(),cadence:ruleForm.elements.cadence.value,
    amount:Number(ruleForm.elements.amount.value),startsOn:ruleForm.elements.startsOn.value
   };
   await api.request({method:"POST",path:"/v1/payroll/"+selected.id+"/rules",json:data});
   ruleForm.reset();say("Recurring rule saved for future payroll.");
  }catch{say("Could not save. Check future Monday and rule details.");}
  finally{ruleBusy=false;submit.disabled=false;await loadRules()}
 }
 const open=async staff=>{
  selected=staff;title.textContent=staff.display_name;
  overview.hidden=true;detail.hidden=false;await Promise.all([load(),loadRules()]);
 };
 const onBack=()=>{selected=null;report=null;detail.hidden=true;overview.hidden=false;say("Select an employee to view payroll.")};
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
  let confirmed=false;
  try{
   const body=action==="bonus"?
    {jobId,amount,kind:form.elements.kind.value,
     label:form.elements.label.value.trim(),period:form.elements.period.value,
     ...(form.elements.period.value==="day"?{effectiveOn:form.elements.effectiveDay.value}:
        form.elements.period.value==="month"?{effectiveOn:weeklyDate.value.slice(0,7)+"-01"}:{}),
     notes:form.elements.notes.value}:
    {jobId,amount,paidOn:form.elements.paidOn.value,reference:form.elements.reference.value};
   const result=await api.request({method:"POST",path:"/v1/payroll/"+selected.id+"/weeks/"+weeklyDate.value+"/"+action,json:body});
   if(!result?.payroll)throw Error("Server did not confirm");
   // Once the server acknowledges a financial write, NEVER report it as a failed
   // save merely because a subsequent read/paint fails. That invites double-pay.
   confirmed=true;report=result.payroll;
   form.reset();if(action==="bonus")updateBonusPeriod();
   say(action==="bonus"?"Bonus saved on server. Refreshing payroll…":"Payment saved on server. Refreshing payroll…");
  }catch{
   say("Save not confirmed. Check the payroll record before retrying to prevent duplicate payment.");
  }finally{busy=false;button.disabled=false}
  if(!confirmed)return;
  try{
   await load();
   say(action==="bonus"?"Entry saved on server. You can add another bonus or allowance.":"Payment saved on server.");
  }catch{
   say("Entry saved on server, but payroll could not refresh. Do not enter it again; reopen employee to view.");
  }
 };
 const updateBonusPeriod=()=>{
  const period=bonus.elements.period.value;
  const dayField=bonus.querySelector("[data-day-field]");
  dayField.hidden=period!=="day";
  bonus.elements.effectiveDay.required=period==="day";
  const help=bonus.querySelector("[data-period-help]");
  help.textContent=period==="day"?"This is one adjustment for the selected date; no daily auto-repeat.":
   period==="month"?"This is one monthly bonus credited to the selected payroll week; no auto-repeat.":
   "This entry is added once to the selected payroll week. It does not automatically repeat.";
 };
 bonus.elements.period.addEventListener("change",updateBonusPeriod);
 updateBonusPeriod();
 const onBonus=evt=>onSave(evt,"bonus"),onPayment=evt=>onSave(evt,"payment");
 const onClose=async()=>{
  if(!selected||busy||!report?.canClose)return;
  busy=true;close.disabled=true;say("Closing paid payroll week…");
  let confirmed=false;
  try{
   const result=await api.request({method:"POST",path:"/v1/payroll/"+selected.id+"/weeks/"+weeklyDate.value+"/close",json:{}});
   if(!result?.payroll?.closed)throw Error("Closure not confirmed");
   confirmed=true;report=result.payroll;
   say("Payroll week closed on server.");
  }catch{say("Closure not confirmed. Check the week status before trying again.")}
  finally{busy=false}
  if(!confirmed){close.disabled=false;return}
  try{await load();say("Payroll week closed and saved.");}
  catch{say("Payroll week closed on server, but the display could not refresh. Reopen to review.")}
 };
 async function onCreateEmployee(event){
  event.preventDefault();
  if(busy)return;
  const name=employeeForm.elements.displayName.value.trim(),
   role=employeeForm.elements.roleLabel.value.trim(),
   unit=employeeForm.elements.wageUnit.value,
   rateText=employeeForm.elements.defaultRate.value,
   rate=Number(rateText);
  if(!name||!rateText||!Number.isFinite(rate)||rate<0||rate>100000||
   !["day","hour"].includes(unit)){
   say("Enter an employee name and a valid wage rate.");return;
  }
  busy=true;const button=employeeForm.querySelector('button[type="submit"]');
  button.disabled=true;say("Saving employee…");
  try{
   const response=await api.request({method:"POST",path:"/v1/staff",
    json:{displayName:name,roleLabel:role,wageUnit:unit,defaultRate:rate}});
   if(!response?.staff||!UUID.test(response.staff.id)||
    typeof response.staff.display_name!=="string")throw Error("Employee not confirmed");
   // Update only this employee directory; do not reload Today or any other screen.
   const empty=list.querySelector("p");empty?.remove();
   const employee=response.staff;
   const btn=element("button",employee.display_name,list);
   btn.type="button";btn.addEventListener("click",()=>open(employee));
   employeeForm.reset();employeeForm.hidden=true;
   say("Employee saved on server.");
  }catch{say("Could not save employee. Check details and retry.")}
  finally{busy=false;button.disabled=false}
 }
 const toggleEmployee=()=>{employeeForm.hidden=!employeeForm.hidden};
 addEmployee.addEventListener("click",toggleEmployee);
 employeeForm.addEventListener("submit",onCreateEmployee);
 panel.querySelector("[data-back]").addEventListener("click",onBack);
 panel.querySelector("[data-refresh]").addEventListener("click",onRefresh);
 bonus.addEventListener("submit",onBonus);payment.addEventListener("submit",onPayment);
 ruleForm.addEventListener("submit",onSaveRule);
 close.addEventListener("click",onClose);
 try{
  const [staffResp,jobResp]=await Promise.all([
   api.request({path:"/v1/staff"}),api.request({path:"/v1/jobs"})
  ]);
  if(!Array.isArray(staffResp.staff)||!Array.isArray(jobResp.jobs))throw Error("Invalid lists");
  selectOptions(bonus.elements.jobId,jobResp.jobs,"Job");
  selectOptions(ruleForm.elements.jobId,jobResp.jobs,"Job");
  selectOptions(payment.elements.jobId,jobResp.jobs,"Job");
  if(!staffResp.staff.length)element("p","No employees yet. Add your first employee here.",list);
  for(const staff of staffResp.staff){
   if(!UUID.test(staff.id)||typeof staff.display_name!=="string")throw Error("Invalid employee");
   const btn=element("button",staff.display_name+(staff.active?"":" (Inactive)"),list);
   btn.type="button";btn.addEventListener("click",()=>open(staff));
  }
  say("Select an employee to see their weekly wages.");
 }catch{say("Employee payroll is unavailable. Please refresh after signing in.")}
 return Object.freeze({destroy(){disposed=true;addEmployee.removeEventListener("click",toggleEmployee);
  employeeForm.removeEventListener("submit",onCreateEmployee);
  ruleForm.removeEventListener("submit",onSaveRule);root.replaceChildren()}});
}

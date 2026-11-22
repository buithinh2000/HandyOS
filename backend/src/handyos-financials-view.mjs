import {melbourneToday} from "./handyos-business-date.mjs";
// Job Financials is a dedicated on-demand screen, not another form in Overview.
// Monetary calculations always come from the authenticated server response.
const KINDS=[["material","Materials"],["labour","Manual labour"],["subcontractor","Subcontractors"],["equipment","Equipment"],["other","Other expense"]];
function money(v){const n=Number(v);return Number.isFinite(n)?"$"+n.toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2}):"Unavailable"}
const localDate=melbourneToday;
function field(parent,label,value){
 const el=document.createElement("div");const caption=document.createElement("small"),strong=document.createElement("strong");
 caption.textContent=label;strong.textContent=value;el.append(caption,strong);parent.append(el);
}
export async function mountJobFinancials({root,api,jobId}={}){
 if(typeof root?.replaceChildren!=="function"||typeof api?.request!=="function"||
 !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(jobId))throw Error("Job Financials unavailable");
 const panel=document.createElement("div");panel.className="handyos-financials";
 panel.innerHTML=`<style>
 .handyos-financials{display:grid;gap:14px}
 .handyos-financials h3{margin:10px 0 0}
 .handyos-financials .financials-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
 .handyos-financials .financials-grid>div{background:#f5f9fb;padding:11px;border-radius:10px}
 .handyos-financials .financials-grid small{display:block;color:#587185}
 .handyos-financials .financials-grid strong{font-size:18px}
 .handyos-financials form{display:grid;gap:10px;border:1px solid #d9e4ea;padding:14px;border-radius:12px}
 .handyos-financials label{display:grid;gap:4px;font-size:14px}
 .handyos-financials input,.handyos-financials select{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #bacbd7;border-radius:8px;padding:9px;font:inherit}
 .handyos-financials button{min-height:44px;border-radius:8px;padding:10px;background:#17699b;border:0;color:white}
 .handyos-financials [hidden]{display:none!important}
 @media(max-width:580px){.handyos-financials .financials-grid{grid-template-columns:1fr}}
 </style>
 <h3>Financials</h3>
 <p>Final forecast profit and tax/reserve fund are NOT READY until the adjusted INC-GST contract, variations and all costs are reconciled. Legacy EX-GST entries below are inputs only, not approved fund calculations. Customer purchases remain separate.</p>
 <div class="financials-grid" data-financial-summary></div>
 <p data-financial-warning></p>
 <button type="button" data-edit-contract>Legacy EX-GST settings (preliminary)</button>
 <form data-contract-form hidden>
  <label>Contract value — EX GST (AUD)<input name="contract" type="number" min="0" step="0.01" required></label>
  <label>Combined tax & contingency reserve (%)<input name="reserve" type="number" min="0" max="100" step="0.01" required></label>
  <button type="submit">Save financial settings</button>
 </form>
 <details data-reconciliation-review>
  <summary>Financial reconciliation checks</summary>
  <p>Review missing evidence before relying on any final profit number.</p>
  <div data-reconciliation-checks></div>
 </details>
 <h3>Approved forecast inputs</h3>
 <p>Complete these values separately from legacy EX-GST settings. Save does not activate final profit: customer payment reconciliation and audit evidence are still required.</p>
 <p data-forecast-readiness role="status">Checking saved assumptions…</p>
 <button type="button" data-forecast-toggle>Edit forecast assumptions</button>
 <form data-forecast-form hidden>
  <label>Signed contract — INCLUDING GST (AUD)<input name="contractInc" type="number" min="0.01" step="0.01" required></label>
  <label>Net approved variations — INCLUDING GST (AUD; negative allowed)<input name="variationInc" type="number" step="0.01" required></label>
  <label>Remaining estimated costs — EX GST (AUD)<input name="remainingEx" type="number" min="0" step="0.01" required></label>
  <label>Unbooked overhead — EX GST (AUD)<input name="overheadEx" type="number" min="0" step="0.01" required></label>
  <label>Combined tax & reserve (%)<input name="reservePercent" type="number" min="0" max="100" step="0.01" required></label>
  <p>Use 0 only when you have actually confirmed there is no variation, remaining cost or overhead. This form never records customer cash payments.</p>
  <button type="submit">Save confirmed forecast inputs</button>
 </form>
 <h3>Customer contract payments</h3>
 <p>Record money actually received for the job. This is not the separate customer material reimbursement ledger. Existing progress-claim payments must be reconciled first.</p>
 <div class="financials-grid" data-contract-receipt-summary></div>
 <p data-contract-receipt-status role="status">Loading contract payments…</p>
 <div data-contract-receipt-list></div>
 <details data-legacy-payment-review>
  <summary>Review older progress-claim payments</summary>
  <p>Read-only evidence. Previous payment GST basis has not been verified, so these amounts are NOT added to the new cash total. If records exist, new payment entry remains locked.</p>
  <div data-legacy-payment-list></div>
 </details>
 <button type="button" data-contract-receipt-toggle>Add received payment</button>
 <form data-contract-receipt-form hidden>
  <label>Money received on<input name="receivedOn" type="date" required></label>
  <label>Amount basis<select name="basis" required>
   <option value="inc_gst">Amount includes GST</option>
   <option value="ex_gst">Amount excludes GST (GST added for cash total)</option>
   <option value="no_gst">No GST</option>
  </select></label>
  <label>Amount (AUD)<input name="amount" type="number" min="0.01" step="0.01" required></label>
  <label>Bank or payment reference<input name="reference" maxlength="250" minlength="3" required></label>
  <button type="submit">Record actual received payment</button>
 </form>
 <h3>Company expenses</h3>
 <div class="financials-grid" data-expense-summary></div>
 <button type="button" data-add-cost>Add company expense</button>
 <form data-expense-form hidden>
  <label>Category<select name="kind"></select></label>
  <label>Description<input name="description" maxlength="200" required></label>
  <label>Amount — EX GST (AUD)<input name="amount" type="number" min="0.01" step="0.01" required></label>
  <label>GST amount (AUD)<input name="gst" type="number" min="0" step="0.01" value="0" required></label>
  <label>Expense date<input name="date" type="date" required></label>
  <button type="submit">Save company expense</button>
 </form>
 <h3>Customer purchases — separate from profit</h3>
 <div class="financials-grid" data-reimbursements></div>
 <p role="status" aria-live="polite" data-financial-status>Loading job financials…</p>`;
 root.replaceChildren(panel);
 const summary=panel.querySelector("[data-financial-summary]"),costs=panel.querySelector("[data-expense-summary]"),
  reimbursements=panel.querySelector("[data-reimbursements]"),warning=panel.querySelector("[data-financial-warning]"),
  status=panel.querySelector("[data-financial-status]"),contract=panel.querySelector("[data-contract-form]"),
  expense=panel.querySelector("[data-expense-form]"),forecast=panel.querySelector("[data-forecast-form]"),
  forecastReadiness=panel.querySelector("[data-forecast-readiness]"),
  receiptSummary=panel.querySelector("[data-contract-receipt-summary]"),
  receiptStatus=panel.querySelector("[data-contract-receipt-status]"),
  receiptList=panel.querySelector("[data-contract-receipt-list]"),
  legacyList=panel.querySelector("[data-legacy-payment-list]"),
  receiptForm=panel.querySelector("[data-contract-receipt-form]"),
  receiptToggle=panel.querySelector("[data-contract-receipt-toggle]");
 const reconciliationChecks=panel.querySelector("[data-reconciliation-checks]");
 for(const [value,label] of KINDS){const option=document.createElement("option");option.value=value;option.textContent=label;expense.elements.kind.append(option)}
 expense.elements.date.value=localDate();
 receiptForm.elements.receivedOn.value=localDate();
 let disposed=false,busy=false,forecastVersion=null,pendingReceiptId=null;
 const say=v=>{if(!disposed)status.textContent=v};
 async function refreshReconciliation(){
  try{
   const report=(await api.request({path:"/v1/jobs/"+jobId+"/financials/reconciliation"}))?.reconciliation;
   if(!report||report.jobId!==jobId||report.profitReady!==false||!Array.isArray(report.checks))
    throw Error("Invalid reconciliation report");
   if(disposed)return;
   reconciliationChecks.replaceChildren();
   for(const entry of report.checks){
    if(!["recorded","missing","blocked","clear","unverified"].includes(entry.status)||
       typeof entry.label!=="string")throw Error("Invalid reconciliation entry");
    const item=document.createElement("p");
    item.textContent=entry.status.toUpperCase()+": "+entry.label;
    reconciliationChecks.append(item);
   }
  }catch{if(!disposed)reconciliationChecks.textContent="Reconciliation evidence unavailable. Final profit NOT READY."}
 }
 async function refreshContractReceipts(){
  try{
   const response=await api.request({path:"/v1/jobs/"+jobId+"/financials/contract-receipts"});
   const r=response?.contractReceipts;
   if(!r||r.jobId!==jobId||!Array.isArray(r.receipts)||!Array.isArray(r.legacyPayments)||
      typeof r.legacyPaymentsPresent!=="boolean")throw Error("Invalid payment register");
   if(disposed)return;
   receiptSummary.replaceChildren();receiptList.replaceChildren();legacyList.replaceChildren();
   field(receiptSummary,"Recorded contract cash received (INC GST)",money(r.receivedIncGst));
   field(receiptSummary,"Final profit","NOT READY — payment reconciliation required");
   receiptStatus.textContent=r.note;
   receiptToggle.disabled=r.legacyPaymentsPresent;
   for(const item of r.receipts){
    const line=document.createElement("p");
    line.textContent=item.receivedOn+" · "+item.reference+" · "+money(item.receivedIncGst)+
     " received (basis: "+item.basis+")";
    receiptList.append(line);
   }
   if(r.legacyPaymentsPresent)receiptForm.hidden=true;
   if(r.legacyPayments.length!==0){
    const note=document.createElement("p");
    note.textContent=r.legacyPayments.length+" earlier payments need manual verification before any new cash entries.";
    legacyList.append(note);
   }else{
    const note=document.createElement("p");note.textContent="No old progress-claim payments found.";
    legacyList.append(note);
   }
   for(const old of r.legacyPayments){
    const line=document.createElement("p");
    line.textContent=old.paidOn+" · Claim "+old.claimReference+
     " · recorded "+money(old.enteredAmount)+" (GST basis unverified; not added)";
    legacyList.append(line);
   }
  }catch{if(!disposed)receiptStatus.textContent="Contract payment ledger unavailable. No payment changes made."}
 }
 async function refreshForecast(){
  try{
   const r=(await api.request({path:"/v1/jobs/"+jobId+"/financials/forecast-inputs"}))?.forecastInputs;
   if(!r||r.jobId!==jobId||typeof r.recorded!=="boolean")throw Error("Missing forecast");
   if(disposed)return;
   forecastVersion=r.recorded?r.assumptions.updatedAt:null;
   if(r.recorded){
    const a=r.assumptions;
    forecast.elements.contractInc.value=a.contractInc;
    forecast.elements.variationInc.value=a.approvedVariationInc;
    forecast.elements.remainingEx.value=a.remainingCostsEx;
    forecast.elements.overheadEx.value=a.unbookedOverheadEx;
    forecast.elements.reservePercent.value=a.taxReservePercent;
   }else forecast.reset();
   forecastReadiness.textContent=r.confirmed?"Owner forecast assumptions saved; final profit still NOT READY pending payment reconciliation.":"No confirmed forecast assumptions yet. Final profit NOT READY.";
  }catch{if(!disposed)forecastReadiness.textContent="Forecast inputs unavailable. No changes made; final profit NOT READY."}
 }
 async function refresh(){
  const result=await api.request({path:"/v1/jobs/"+jobId+"/financials"});
  const r=result?.financials;
  if(!r?.totals||!r?.costs||!r?.settings||!r?.passThrough)throw Error("Financial data unavailable");
  if(disposed)return;
  summary.replaceChildren();costs.replaceChildren();reimbursements.replaceChildren();
  field(summary,"Contract EX GST",money(r.totals.contractExGst));
  field(summary,"Tax & reserve fund (approved INC-GST basis)","NOT READY — verify adjusted contract");
  field(summary,"Final forecast profit EX GST",r.profitReady===true&&r.provisional===false?
   money(r.totals.estimatedProfitExGst):"NOT READY — reconciliation required");
  for(const [label,key] of [["Materials","materials"],["Manual labour","labourManual"],["Subcontractors","subcontractors"],
    ["Equipment","equipment"],["Other costs","other"],["Earned employee wages","attendanceWages"],
    ["Employee bonuses/allowances/expenses","weeklyBonuses"],["Total company costs EX GST","totalExGst"]])
   field(costs,label,money(r.costs[key]));
  field(reimbursements,"Customer bills pending (INC GST)",money(r.passThrough.customerReceiptsPendingGross));
  field(reimbursements,"Customer bills reimbursed (INC GST)",money(r.passThrough.customerReceiptsReimbursedGross));
  const messages=Array.isArray(r.warnings)?r.warnings:[];
  warning.textContent=messages.join(" ") || (r.profitReady===true&&r.provisional===false?"":"Final profit cannot yet be relied upon.");
  contract.elements.contract.value=r.settings.contractExGst;
  contract.elements.reserve.value=r.settings.reservePercent;
  say("Financials loaded from server.");
  await refreshForecast();
  await refreshContractReceipts();
  await refreshReconciliation();
 }
 async function submitContractReceipt(event){
  event.preventDefault();if(disposed||busy||!receiptForm.reportValidity())return;
  const button=receiptForm.querySelector('[type="submit"]');
  busy=true;button.disabled=true;say("Recording actual customer payment…");
  try{
   pendingReceiptId??=crypto.randomUUID();
   const d=receiptForm.elements;
   const response=await api.request({method:"POST",path:"/v1/jobs/"+jobId+"/financials/contract-receipts",
    json:{requestId:pendingReceiptId,receivedOn:d.receivedOn.value,basis:d.basis.value,
     amount:Number(d.amount.value),reference:d.reference.value.trim()}});
   if(!response?.contractReceipts||response.contractReceipts.jobId!==jobId)throw Error("Payment save not confirmed");
   pendingReceiptId=null;receiptForm.reset();receiptForm.elements.receivedOn.value=localDate();receiptForm.hidden=true;
   await refreshContractReceipts();
   say("Contract payment recorded. Final profit still requires reconciliation.");
  }catch{say("Could not confirm payment. Check the payment register before retrying; no double entry assumed.")}
  finally{busy=false;button.disabled=false}
 }
 async function submitForecast(event){
  event.preventDefault();if(disposed||busy||!forecast.reportValidity())return;
  const button=forecast.querySelector('[type="submit"]');busy=true;button.disabled=true;
  say("Saving confirmed forecast assumptions…");
  try{
   const data=forecast.elements;
   const response=await api.request({method:"POST",
    path:"/v1/jobs/"+jobId+"/financials/forecast-inputs",
    json:{contractInc:Number(data.contractInc.value),
     approvedVariationInc:Number(data.variationInc.value),
     remainingCostsEx:Number(data.remainingEx.value),
     unbookedOverheadEx:Number(data.overheadEx.value),
     taxReservePercent:Number(data.reservePercent.value),
     expectedUpdatedAt:forecastVersion}});
   if(!response?.forecastInputs?.confirmed||response.forecastInputs.jobId!==jobId)throw Error("Save not confirmed");
   forecast.hidden=true;
   await refreshForecast();say("Forecast assumptions saved. Final profit still awaits payment reconciliation.");
  }catch{say("Could not save forecast assumptions. Review values and reload if another device updated this job.")}
  finally{busy=false;button.disabled=false}
 }
 async function submit(event,kind){
  event.preventDefault();if(disposed||busy)return;
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
  busy=true;button.disabled=true;say("Saving to HandyOS…");
  try{
   const json=kind==="contract"?
    {contractExGst:Number(contract.elements.contract.value),reservePercent:Number(contract.elements.reserve.value)}:
    {kind:expense.elements.kind.value,description:expense.elements.description.value.trim(),
     amountExGst:Number(expense.elements.amount.value),gstAmount:Number(expense.elements.gst.value),
     incurredOn:expense.elements.date.value};
   const path="/v1/jobs/"+jobId+"/financials/"+(kind==="contract"?"settings":"expenses");
   const response=await api.request({method:"POST",path,json});
   if(!response?.financials?.totals)throw Error("Save not confirmed");
   if(disposed)return;
   if(kind==="contract")contract.hidden=true;
   else {expense.reset();expense.elements.date.value=localDate();expense.hidden=true}
   await refresh();say("Saved on server.");
  }catch{say("Could not save financials. Check the fields and retry.")}
  finally{busy=false;button.disabled=false}
 }
 const edit=()=>{contract.hidden=!contract.hidden},add=()=>{expense.hidden=!expense.hidden};
 const toggleForecast=()=>{forecast.hidden=!forecast.hidden};
 const toggleReceipt=()=>{if(!receiptToggle.disabled)receiptForm.hidden=!receiptForm.hidden};
 const onContract=e=>submit(e,"contract"),onExpense=e=>submit(e,"expense");
 panel.querySelector("[data-edit-contract]").addEventListener("click",edit);
 panel.querySelector("[data-add-cost]").addEventListener("click",add);
 panel.querySelector("[data-forecast-toggle]").addEventListener("click",toggleForecast);
 forecast.addEventListener("submit",submitForecast);
 receiptToggle.addEventListener("click",toggleReceipt);
 receiptForm.addEventListener("submit",submitContractReceipt);
 contract.addEventListener("submit",onContract);expense.addEventListener("submit",onExpense);
 try{await refresh()}catch{say("Financials are unavailable. Please retry when your company is connected.")}
 return Object.freeze({destroy(){disposed=true;root.replaceChildren()}});
}

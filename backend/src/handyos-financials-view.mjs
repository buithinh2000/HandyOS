// Job Financials is a dedicated on-demand screen, not another form in Overview.
// Monetary calculations always come from the authenticated server response.
const KINDS=[["material","Materials"],["labour","Manual labour"],["subcontractor","Subcontractors"],["equipment","Equipment"],["other","Other expense"]];
function money(v){const n=Number(v);return Number.isFinite(n)?"$"+n.toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2}):"Unavailable"}
function localDate(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
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
 <p>All contract and company cost amounts are EX GST. Customer purchase reimbursements are shown separately.</p>
 <div class="financials-grid" data-financial-summary></div>
 <p data-financial-warning></p>
 <button type="button" data-edit-contract>Edit contract & reserve</button>
 <form data-contract-form hidden>
  <label>Contract value — EX GST (AUD)<input name="contract" type="number" min="0" step="0.01" required></label>
  <label>Combined tax & contingency reserve (%)<input name="reserve" type="number" min="0" max="100" step="0.01" required></label>
  <button type="submit">Save financial settings</button>
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
  expense=panel.querySelector("[data-expense-form]");
 for(const [value,label] of KINDS){const option=document.createElement("option");option.value=value;option.textContent=label;expense.elements.kind.append(option)}
 expense.elements.date.value=localDate();
 let disposed=false,busy=false;
 const say=v=>{if(!disposed)status.textContent=v};
 async function refresh(){
  const result=await api.request({path:"/v1/jobs/"+jobId+"/financials"});
  const r=result?.financials;
  if(!r?.totals||!r?.costs||!r?.settings||!r?.passThrough)throw Error("Financial data unavailable");
  if(disposed)return;
  summary.replaceChildren();costs.replaceChildren();reimbursements.replaceChildren();
  field(summary,"Contract EX GST",money(r.totals.contractExGst));
  field(summary,"Tax & reserve — preliminary only",money(r.totals.reserveAllocation));
  // UI must not expose an incomplete projection as usable profit.
  field(summary,"Final forecast profit EX GST",r.profitReady===true&&r.provisional===false?
   money(r.totals.estimatedProfitExGst):"NOT READY — reconciliation required");
  for(const [label,key] of [["Materials","materials"],["Manual labour","labourManual"],["Subcontractors","subcontractors"],
    ["Equipment","equipment"],["Other costs","other"],["Earned employee wages","attendanceWages"],
    ["Employee bonuses/allowances/expenses","weeklyBonuses"],["Total company costs EX GST","totalExGst"]])
   field(costs,label,money(r.costs[key]));
  field(reimbursements,"Customer bills pending (INC GST)",money(r.passThrough.customerReceiptsPendingGross));
  field(reimbursements,"Customer bills reimbursed (INC GST)",money(r.passThrough.customerReceiptsReimbursedGross));
  const messages=Array.isArray(r.warnings)?r.warnings:[];
  warning.textContent=messages.join(" ") || (r.profitReady===true&&r.provisional===false?"":"Final profit is not ready for business decisions.");
  contract.elements.contract.value=r.settings.contractExGst;
  contract.elements.reserve.value=r.settings.reservePercent;
  say("Financials loaded from server.");
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
 const onContract=e=>submit(e,"contract"),onExpense=e=>submit(e,"expense");
 panel.querySelector("[data-edit-contract]").addEventListener("click",edit);
 panel.querySelector("[data-add-cost]").addEventListener("click",add);
 contract.addEventListener("submit",onContract);expense.addEventListener("submit",onExpense);
 try{await refresh()}catch{say("Financials are unavailable. Please retry when your company is connected.")}
 return Object.freeze({destroy(){disposed=true;root.replaceChildren()}});
}

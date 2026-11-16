// HandyOS authenticated Bills UI component; source-only, NOT mounted in the
// legacy browser-local owner-v1.html. Caller must supply authenticated controller
// and job IDs loaded from isolated HandyOS PostgreSQL, never the demo ledger.
// No implicit cloud activation, tokens, localStorage, or customer delivery.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function element(root,selector){
 const result=root.querySelector(selector);
 if(!result)throw Error("HandyOS bills UI incomplete");
 return result;
}
export function mountCloudBills({root,controller,jobs=[]}={}){
 if(!root||typeof root.replaceChildren!=="function"||
  typeof controller?.save!=="function"||!Array.isArray(jobs))
  throw Error("Authenticated HandyOS Bills application required");
 const valid=jobs.filter(j=>j&&UUID.test(j.id)&&typeof j.name==="string"&&j.name.trim());
 const section=document.createElement("section");
 section.className="handyos-cloud-bills";
 section.innerHTML=`<style>
 .handyos-cloud-bills{font:inherit;color:#183047;max-width:720px}
 .handyos-cloud-bills .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
 .handyos-cloud-bills label{display:grid;gap:5px;font-size:14px;font-weight:600}
 .handyos-cloud-bills input,.handyos-cloud-bills select,.handyos-cloud-bills textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #bacbd9;border-radius:9px;font:inherit;background:white;color:#183047}
 .handyos-cloud-bills .full{grid-column:1/-1}
 .handyos-cloud-bills button{min-height:44px;border:0;border-radius:9px;background:#125889;color:white;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}
 .handyos-cloud-bills button:disabled{opacity:.6;cursor:not-allowed}
 .handyos-cloud-bills [role=status]{margin:12px 0;min-height:22px}
 .handyos-cloud-bills .hint{color:#536777;font-size:13px}
 @media(max-width:620px){.handyos-cloud-bills .fields{grid-template-columns:1fr}}
 </style>
 <h2>New material bill</h2>
 <p class="hint">For purchases to be reimbursed by a homeowner. Not a contract expense or customer payment.</p>
 <form novalidate>
  <div class="fields">
   <label>Job<select name="jobId" required><option value="">Choose job</option></select></label>
   <label>Purchase date<input name="boughtOn" type="date" required></label>
   <label>Store<select name="storeSelect"><option value="Bunnings">Bunnings</option><option value="Mitre 10">Mitre 10</option><option value="Bowens">Bowens</option><option value="other">Other — enter store name</option></select></label>\n   <label data-custom-store hidden>Other store name<input name="storeReference" maxlength="160" autocomplete="off" placeholder="Enter store name"></label>
   <label>Amount paid (AUD)<input name="amountGross" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>
   <label>GST<select name="gstBasis"><option value="inc">Includes GST</option><option value="ex">Excludes GST</option><option value="no_gst">No GST</option></select></label>
   <label>Receipt photo or PDF<input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label>
   <label class="full">Notes (optional)<textarea name="notes" maxlength="500" rows="2"></textarea></label>
  </div>
  <p class="hint">Camera or Photo Library on iPhone. JPEG, PNG, WebP up to 12 MB, PDF up to 15 MB. HEIC must be converted to JPEG first.</p>
  <p role="status" aria-live="polite">Choose a job and receipt to begin.</p>
  <button type="submit">Save bill securely</button>
 </form>`;
 const select=element(section,'[name="jobId"]');
 for(const job of valid){
  const option=document.createElement("option");option.value=job.id;option.textContent=job.name;
  select.append(option);
 }
 const form=element(section,"form"),status=element(section,"[role=status]"),submit=element(section,'[type="submit"]');
 const storeSelect=element(form,'[name="storeSelect"]'),customStore=element(form,"[data-custom-store]");
 const updateStore=()=>{customStore.hidden=storeSelect.value!=="other";element(form,'[name="storeReference"]').required=!customStore.hidden};
 storeSelect.addEventListener("change",updateStore);
 updateStore();
 const message=text=>{status.textContent=text};
 const steps={
  preparing:"Checking job and preparing secure upload…",
  uploading:"Uploading bill photo…",
  confirming:"Verifying saved file…",
  saved:"Bill saved securely. Not sent to customer.",
  "retry-needed":"Could not verify the save. Check the bill list before trying again."
 };
 // Controller's notify should be bound by the parent application.
 const setStatus=state=>message(steps[state]||"Ready to save receipt");
 const onSubmit=async event=>{
  event.preventDefault();
  if(submit.disabled)return;
  const file=element(form,'[name="file"]').files?.[0],jobId=select.value;
  const amount=Number(element(form,'[name="amountGross"]').value);
  if(!file||!jobId||!Number.isFinite(amount)||amount<=0){
   message("Choose a job, amount and receipt file.");return
  }
  submit.disabled=true;
  message("Preparing secure upload…");
  try{
   const result=await controller.save({jobId,file,details:{
    boughtOn:element(form,'[name="boughtOn"]').value,
    storeReference:storeSelect.value==="other"?element(form,'[name="storeReference"]').value:storeSelect.value,
    amountGross:amount,
    gstBasis:element(form,'[name="gstBasis"]').value,
    notes:element(form,'[name="notes"]').value
   }});
   if(!result?.mediaReady||result.status!=="draft")throw Error("Not verified");
   form.reset();updateStore();message(steps.saved);
  }catch{
   message(steps["retry-needed"]);
  }finally{submit.disabled=false}
 };
 form.addEventListener("submit",onSubmit);
 root.replaceChildren(section);
 return Object.freeze({setStatus,destroy(){
  form.removeEventListener("submit",onSubmit);
  storeSelect.removeEventListener("change",updateStore);
  if(root.contains(section))root.removeChild(section);
 }});
}

import {melbourneToday} from "./handyos-business-date.mjs";
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
// Presigned GET links are sensitive bearer URLs, never customer links or durable metadata.
export function isSafeReceiptView(value,jobId,billId){
 try{
  if(typeof value!=="string"||value.length>4096||!UUID.test(jobId)||!UUID.test(billId))return false;
  const url=new URL(value);
  const suffix=".s3.ap-southeast-1.amazonaws.com";
  if(url.protocol!=="https:"||url.port||url.username||url.password||url.hash||
     !url.hostname.endsWith(suffix))return false;
  const bucket=url.hostname.slice(0,-suffix.length);
  if(!/^handyos-[a-z0-9.-]{3,62}$/.test(bucket))return false;
  const segments=url.pathname.split("/");
  if(segments.length!==8||segments[0]!==""||segments[1]!=="tenants"||!UUID.test(segments[2])||
     segments[3]!=="jobs"||segments[4].toLowerCase()!==jobId.toLowerCase()||
     segments[5]!=="receipts"||segments[6].toLowerCase()!==billId.toLowerCase()||
     !/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i.test(segments[7]))return false;
  const expires=Number(url.searchParams.get("X-Amz-Expires"));
  return url.searchParams.get("X-Amz-Algorithm")==="AWS4-HMAC-SHA256"&&
   !!url.searchParams.get("X-Amz-Signature")&&
   !!url.searchParams.get("X-Amz-Credential")&&
   Number.isInteger(expires)&&expires>0&&expires<=180;
 }catch{return false}
}
// Text-only customer message: deliberately excludes tokens, private receipt URLs and personal data.
// The Owner must attach the receipt and manually send through their chosen app.
export function customerBillMessage(b){
 if(!b||typeof b.jobName!=="string"||typeof b.storeReference!=="string"||
    typeof b.boughtOn!=="string")throw Error("Invalid bill message");
 const safe=s=>s.replace(/[\r\n\t]+/g," ").trim().slice(0,160);
 const money=v=>{
  const n=Number(v);
  if(!Number.isFinite(n)||n<0||n>1000000000)throw Error("Invalid bill amount");
  return n.toFixed(2);
 };
 const gross=money(b.amountGross),remaining=money(b.remaining??b.amountGross);
 return "Hi, regarding "+safe(b.jobName)+": I paid for materials from "+
  safe(b.storeReference)+" on "+safe(b.boughtOn)+".\n"+
  "Bill total: AUD $"+gross+".\n"+
  "Outstanding reimbursement: AUD $"+remaining+".\n"+
  "Please reimburse the outstanding amount. I will attach the original receipt separately. Thank you.";
}
export function mountCloudBills({root,controller,jobs=[],listBills,updateBill,viewReceipt,receiptUploadsEnabled=true}={}){
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
 .handyos-cloud-bills [hidden]{display:none!important}
 .handyos-cloud-bills input,.handyos-cloud-bills select,.handyos-cloud-bills textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #bacbd9;border-radius:9px;font:inherit;background:white;color:#183047}
 .handyos-cloud-bills .full{grid-column:1/-1}
 .handyos-cloud-bills button{min-height:44px;border:0;border-radius:9px;background:#125889;color:white;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}
 .handyos-cloud-bills button:disabled{opacity:.6;cursor:not-allowed}
 .handyos-cloud-bills [role=status]{margin:12px 0;min-height:22px}
 .handyos-cloud-bills .hint{color:#536777;font-size:13px}
 .handyos-cloud-bills .bill-row{border:1px solid #d9e4ee;border-radius:10px;padding:12px;display:grid;gap:4px;margin:8px 0}
 .handyos-cloud-bills .queue-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
 .handyos-cloud-bills .bill-row small{color:#536777}
 .handyos-cloud-bills .bill-queue{padding-top:12px;border-top:1px solid #d9e4ee}
 @media(max-width:620px){.handyos-cloud-bills .queue-controls{grid-template-columns:1fr}}
 @media(max-width:620px){.handyos-cloud-bills .fields{grid-template-columns:1fr}}
 </style>
 <section class="bill-queue" data-bill-queue>
  <h2>Client material bills</h2>
  <p class="hint">Bills you paid on behalf of clients. These do not count as contract income or job expenses.</p>
  <div class="queue-controls"><label>Filter by job<select data-bill-filter-job><option value="">All jobs</option></select></label>
  <label>Filter by status<select data-bill-filter-status><option value="">All statuses</option><option value="draft">Not sent</option><option value="sent">Sent to client</option><option value="reimbursed">Reimbursed</option></select></label></div>
  <p data-queue-status role="status" aria-live="polite">Loading saved bills…</p>
  <div data-bill-list></div>
  <button type="button" data-refresh-bills>Refresh bills</button>
 </section>
 <h2>Capture material bill</h2>
 <p class="hint">For purchases to be reimbursed by a homeowner. Not a contract expense or customer payment.</p>
 <form novalidate>
  <div class="fields">
   <label>Job<select name="jobId" required><option value="">Choose job</option></select></label>
   <label>Purchase date<input name="boughtOn" type="date" required></label>
   <label>Store<select name="storeSelect"><option value="Bunnings">Bunnings</option><option value="Mitre 10">Mitre 10</option><option value="Bowens">Bowens</option><option value="Reece">Reece</option><option value="other">Other — enter store name</option></select></label>
   <label data-custom-store hidden>Other store name<input name="storeReference" maxlength="160" autocomplete="off" placeholder="Enter store name"></label>
   <label>Amount paid (AUD)<input name="amountGross" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>
   <label>GST<select name="gstBasis"><option value="inc">Includes GST</option><option value="ex">Excludes GST</option><option value="no_gst">No GST</option></select></label>
   <label>Receipt photo or PDF<input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label>
   <label class="full">Notes (optional)<textarea name="notes" maxlength="500" rows="2"></textarea></label>
  </div>
  <p class="hint">Take a photo or select from your iPhone library. JPEG, PNG, WebP up to 12 MB, PDF up to 15 MB. Convert HEIC to JPEG before uploading.</p>
  <p role="status" aria-live="polite">Choose a job and receipt to begin.</p>
  <button type="submit">Save bill securely</button>
 </form>`;
 const select=element(section,'[name="jobId"]');
 for(const job of valid){
  const option=document.createElement("option");option.value=job.id;option.textContent=job.name;
  select.append(option);
 }
 const form=element(section,"form"),status=element(form,"[role=status]"),submit=element(form,'[type="submit"]');
 // Fail closed for live cloud mounts: upload controls remain disabled until
 // the authenticated server confirms a running private receipt workflow.
 if(receiptUploadsEnabled!==true){
  submit.disabled=true;
  status.textContent="Receipt photo uploads are not enabled yet. Existing bills can still be viewed and updated.";
  const filePicker=element(form,'[name="file"]');
  filePicker.disabled=true;
 }
 const storeSelect=element(form,'[name="storeSelect"]'),customStore=element(form,"[data-custom-store]");
 const dateField=element(form,'[name="boughtOn"]');
 // Local workday is the default; UTC dates can be wrong around midnight in Australia.
 const todayLocal=melbourneToday;
 dateField.value=todayLocal();
 const updateStore=()=>{customStore.hidden=storeSelect.value!=="other";element(form,'[name="storeReference"]').required=!customStore.hidden};
 storeSelect.addEventListener("change",updateStore);
 updateStore();
 const queue=element(section,"[data-bill-list]"),queueStatus=element(section,"[data-queue-status]");
 const filterJob=element(section,"[data-bill-filter-job]"),filterStatus=element(section,"[data-bill-filter-status]");
 const refreshButton=element(section,"[data-refresh-bills]");
 for(const job of valid){const o=document.createElement("option");o.value=job.id;o.textContent=job.name;filterJob.append(o)}
 let loadedBills=[],disposed=false,refreshSequence=0;
 const aud=value=>{
  const number=Number(value);
  return Number.isFinite(number)&&number>=0?new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(number):"Amount unavailable";
 };
 const stateLabel={draft:"Not sent",sent:"Sent to client",reimbursed:"Reimbursed"};
 const renderBills=()=>{
  queue.replaceChildren();
  const visible=loadedBills.filter(b=>(!filterJob.value||b.jobId===filterJob.value)&&
   (!filterStatus.value||b.status===filterStatus.value));
  if(!visible.length){const p=document.createElement("p");p.textContent="No bills match these filters.";queue.append(p);return}
  for(const b of visible){
   const card=document.createElement("article");card.className="bill-row";card.dataset.billId=b.id;
   const head=document.createElement("strong");head.textContent=b.storeReference+" · "+aud(b.amountGross);
   const details=document.createElement("small");details.textContent=b.jobName+" · "+b.boughtOn;
   const badge=document.createElement("small");badge.textContent=stateLabel[b.status];
   const balance=document.createElement("small");
   balance.textContent="Received "+aud(b.amountReceived??"0")+" · Outstanding "+aud(b.remaining??b.amountGross);
   card.append(head,details,badge,balance);
   if(typeof viewReceipt==="function"){
    const preview=document.createElement("button");
    preview.type="button";preview.textContent="View private receipt";
    preview.dataset.billPreview=b.id;
    preview.addEventListener("click",async()=>{
     if(preview.disabled)return;
     // Open a blank browser tab within the user gesture; delayed popups are blocked on iPhone.
     // Never send the Cognito token to S3, and never treat this temporary Owner URL as a customer share.
     const tab=window.open("about:blank","_blank");
     if(tab)tab.opener=null;
     preview.disabled=true;queueStatus.textContent="Checking private receipt access…";
     try{
      const response=await viewReceipt({jobId:b.jobId,billId:b.id});
      if(response?.id!==b.id||!isSafeReceiptView(response.viewUrl,b.jobId,b.id)||!Number.isInteger(response.expiresInSeconds)||
         response.expiresInSeconds<1||response.expiresInSeconds>900)
       throw Error("Unsafe or expired receipt preview");
      if(tab&&!tab.closed){
       tab.location.replace(response.viewUrl);
       queueStatus.textContent="Private receipt opened in a new tab. Do not share this temporary link.";
      }else{
       queueStatus.textContent="Your browser blocked the new tab. Enable popups for HandyOS to view this private receipt.";
      }
     }catch{
      if(tab&&!tab.closed)tab.close();
      queueStatus.textContent="Unable to open private receipt. Check your login, job access and storage configuration.";
     }finally{preview.disabled=false}
    });
    card.append(preview);
   }
   if(b.status!=="reimbursed"){
    const copy=document.createElement("button");copy.type="button";
    copy.textContent="Copy customer message";
    copy.dataset.billCopy=b.id;
    copy.addEventListener("click",async()=>{
     if(copy.disabled)return;
     copy.disabled=true;
     try{
      if(typeof navigator.clipboard?.writeText!=="function")throw Error("Clipboard unavailable");
      await navigator.clipboard.writeText(customerBillMessage(b));
      queueStatus.textContent="Bill message copied. Attach the receipt and send it yourself; status is unchanged.";
     }catch{
      queueStatus.textContent="Clipboard unavailable. No bill status changed.";
     }finally{copy.disabled=false}
    });
    card.append(copy);
   }
   if(typeof updateBill==="function"&&b.status!=="reimbursed"){
    const action=document.createElement("button");action.type="button";
    action.textContent=b.status==="draft"?"Confirm already sent":"Record repayment";
    action.dataset.billAction=b.id;
    const form=document.createElement("form");form.hidden=true;
    form.dataset.billActionForm=b.id;
    form.innerHTML=b.status==="draft"?
     `<label>Actually sent on<input name="date" type="date" required></label>
       <label>How it was sent<select name="channel"><option value="message">Message</option><option value="email">Email</option><option value="in_person">In person</option><option value="other">Other</option></select></label>
       <label>Recipient / delivery reference<input name="reference" required minlength="3" maxlength="250" placeholder="e.g. Sent to client via SMS"></label>
       <button type="submit">Confirm sent (no message will be sent)</button>`:
     `<label>Payment received on<input name="date" type="date" required></label>
       <label>Amount received (AUD)<input name="amount" type="number" min="0.01" step="0.01" required></label>
       <label>Payment reference<input name="reference" required minlength="3" maxlength="250" placeholder="e.g. Bank transfer"></label>
       <button type="submit">Record payment received</button>`;
    form.elements.date.value=melbourneToday();
    if(b.status==="sent")form.elements.amount.value=Number(b.remaining??b.amountGross).toFixed(2);
    let pendingRequestId=null;
    action.addEventListener("click",()=>{form.hidden=!form.hidden});
    form.addEventListener("submit",async event=>{
     event.preventDefault();if(!form.reportValidity())return;
     const submit=form.querySelector('[type="submit"]');submit.disabled=true;
     queueStatus.textContent="Saving verified bill status…";
     const kind=b.status==="draft"?"mark-sent":"payment";
     pendingRequestId??=crypto.randomUUID();
     const json={requestId:pendingRequestId,date:form.elements.date.value,
      reference:form.elements.reference.value.trim()};
     if(kind==="mark-sent")json.channel=form.elements.channel.value;
     else json.amount=Number(form.elements.amount.value);
     try{
      const result=await updateBill({billId:b.id,kind,json});
      if(!result||result.id!==b.id||!["sent","reimbursed"].includes(result.status))
       throw Error("Server did not confirm bill status");
      pendingRequestId=null;
      await loadBills();
      queueStatus.textContent="Bill update saved. Remaining balance: "+aud(result.remaining);
     }catch{
      queueStatus.textContent="Could not verify the update. Refresh the bill list before attempting another payment.";
      submit.disabled=false;
     }
    });
    card.append(action,form);
   }
   queue.append(card);
  }
 };
 const loadBills=async()=>{
  if(typeof listBills!=="function"){queueStatus.textContent="Bill list unavailable until secure database connection is active.";return}
  const sequence=++refreshSequence;refreshButton.disabled=true;
  queueStatus.textContent="Loading saved bills…";
  try{
   const result=await listBills();
   if(!Array.isArray(result?.bills)||result.bills.length>200)throw Error("Invalid list");
   const seen=new Set();
   const bills=result.bills.map(b=>{
    if(!b||!UUID.test(b.id)||!UUID.test(b.jobId)||typeof b.jobName!=="string"||
       typeof b.storeReference!=="string"||typeof b.boughtOn!=="string"||
       !/^\d{4}-\d{2}-\d{2}$/.test(b.boughtOn)||!Object.hasOwn(stateLabel,b.status)||
       seen.has(b.id)||!Number.isFinite(Number(b.amountGross))||Number(b.amountGross)<=0)
     throw Error("Invalid bill");
    seen.add(b.id);return b;
   });
   if(disposed||sequence!==refreshSequence)return;
   loadedBills=bills;renderBills();
   queueStatus.textContent=bills.length+" saved bills loaded."+(result.hasMore?" Showing the latest 200 only.":"");
  }catch{
   if(!disposed&&sequence===refreshSequence)queueStatus.textContent="Unable to load bills; no reimbursement status has been changed.";
  }finally{if(!disposed&&sequence===refreshSequence)refreshButton.disabled=false}
 };
 const filter=()=>renderBills();
 filterJob.addEventListener("change",filter);filterStatus.addEventListener("change",filter);
 const manualRefresh=()=>{void loadBills()};
 refreshButton.addEventListener("click",manualRefresh);
 void loadBills();
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
  if(submit.disabled||receiptUploadsEnabled!==true)return;
  const file=element(form,'[name="file"]').files?.[0],jobId=select.value;
  const amount=Number(element(form,'[name="amountGross"]').value);
  if(!form.reportValidity()||!file||!jobId||!Number.isFinite(amount)||amount<=0){
   message("Complete the job, date, store, amount and receipt before saving.");return
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
   form.reset();dateField.value=todayLocal();updateStore();message(steps.saved);
   await loadBills();
  }catch{
   message(steps["retry-needed"]);
  }finally{submit.disabled=false}
 };
 form.addEventListener("submit",onSubmit);
 root.replaceChildren(section);
 return Object.freeze({setStatus,destroy(){
  disposed=true;refreshSequence++;
  filterJob.removeEventListener("change",filter);filterStatus.removeEventListener("change",filter);
  refreshButton.removeEventListener("click",manualRefresh);
  form.removeEventListener("submit",onSubmit);
  storeSelect.removeEventListener("change",updateStore);
  if(root.contains(section))root.removeChild(section);
 }});
}

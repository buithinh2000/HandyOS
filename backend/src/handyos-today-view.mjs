// Daily-first authenticated HandyOS home screen. Uses verified API only,
// never localStorage, guessed pay rates or browser-supplied tenant privileges.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function localDay(){
 const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
}
function option(parent,label,value){
 const el=document.createElement("option");el.value=value;el.textContent=label;parent.append(el);
}
function paragraph(parent,text){
 const el=document.createElement("p");el.textContent=text;parent.append(el);return el;
}
export async function mountHandyOsToday({root,api}={}){
 if(typeof root?.replaceChildren!=="function"||typeof api?.request!=="function")
  throw Error("HandyOS Today is unavailable");
 const container=document.createElement("section");
 container.className="handyos-today";
 container.innerHTML=`<style>
 .handyos-today{border:1px solid #d9e4ee;border-radius:16px;padding:16px;margin:12px 0 22px;display:grid;gap:12px;background:white}
 .handyos-today h2{margin:0;font-size:23px}.handyos-today h3{margin:6px 0 0;font-size:17px}
 .handyos-today form{display:grid;gap:11px}
 .handyos-today label{display:grid;gap:5px;font-size:14px}
 .handyos-today input,.handyos-today select{width:100%;box-sizing:border-box;border:1px solid #b8cddb;border-radius:8px;min-height:46px;padding:9px;font-size:16px}
 .handyos-today button{min-height:46px;padding:10px;border-radius:9px;background:#17699b;color:white;border:0;font-size:15px}
 .handyos-today button:disabled{opacity:.55}
 .handyos-today [hidden]{display:none!important}
 .handyos-today .crew-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
 .handyos-today .crew-record{border:1px solid #e3ebf0;border-radius:9px;padding:12px;display:grid;gap:6px}
 .handyos-today small{color:#50677b}
 @media(max-width:600px){.handyos-today .crew-grid{grid-template-columns:1fr}}
 </style>
 <h2>Today · Crew check-in</h2>
 <p>Record work at the job site. Payroll remains private to management.</p>
 <label>Work date<input type="date" data-work-date required></label>
 <form data-check-in>
 <div class="crew-grid">
 <label>Job<select data-job required></select></label>
 <label>Employee<select data-staff required></select></label>
 </div>
 <button type="submit">Check in employee</button>
 </form>
 <h3>Today's attendance</h3>
 <div data-attendance></div>
 <button type="button" data-add-staff>Add employee</button>
 <form data-staff-form hidden>
 <label>Employee name<input data-staff-name maxlength="160" required></label>
 <label>Role (optional)<input data-staff-role maxlength="100"></label>
 <div class="crew-grid">
 <label>Wage basis<select data-wage-unit><option value="day">Daily</option><option value="hour">Hourly</option></select></label>
 <label>Default rate (AUD)<input type="number" min="0" max="100000" step="0.01" data-wage-rate required></label>
 </div>
 <button type="submit">Save employee</button>
 </form>
 <p role="status" data-status aria-live="polite">Loading today…</p>`;
 const date=container.querySelector("[data-work-date]"),jobs=container.querySelector("[data-job]"),
  staff=container.querySelector("[data-staff]"),records=container.querySelector("[data-attendance]"),
  inForm=container.querySelector("[data-check-in]"),staffForm=container.querySelector("[data-staff-form]"),
  addStaff=container.querySelector("[data-add-staff]"),status=container.querySelector("[data-status]");
 date.value=localDay();
 root.replaceChildren(container);
 let disposed=false,busy=false;
 const say=s=>{if(!disposed)status.textContent=s};
 function optionList(select,data,selectedLabel,labelField){
  const selected=select.value;select.replaceChildren();option(select,selectedLabel,"");
  for(const item of data){
   if(!item||!UUID.test(item.id)||typeof item[labelField]!=="string")throw Error("Invalid HandyOS list");
   option(select,item[labelField],item.id);
  }
  if(data.some(item=>item.id===selected))select.value=selected;
 }
 async function refresh(){
  const day=date.value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error("Invalid day");
  const result=await api.request({path:"/v1/attendance?date="+day});
  if(!Array.isArray(result.attendance))throw Error("Invalid attendance response");
  if(disposed)return;
  records.replaceChildren();
  if(!result.attendance.length)paragraph(records,"No employee checked in for this date.");
  for(const item of result.attendance){
   if(!item||!UUID.test(item.id)||typeof item.display_name!=="string")throw Error("Invalid attendance entry");
   const card=document.createElement("div");card.className="crew-record";
   const name=document.createElement("strong");name.textContent=item.display_name;
   const job=document.createElement("small");job.textContent=String(item.job_name??"");
   const detail=document.createElement("small");
   detail.textContent=item.finished_at?"Checked out":"Checked in";
   card.append(name,job,detail);
   if(!item.finished_at){
    const button=document.createElement("button");
    button.type="button";button.textContent="Check out";button.dataset.checkout=item.id;
    button.addEventListener("click",async()=>{
     if(busy)return;busy=true;button.disabled=true;say("Saving check-out…");
     try{await api.request({method:"POST",path:"/v1/attendance/"+item.id+"/check-out",json:{}});
      await refresh();say("Check-out saved on server.");
     }catch{say("Could not save check-out. Please retry.");button.disabled=false}
     finally{busy=false}
    });
    card.append(button);
   }
   records.append(card);
  }
 }
 async function prepare(){
  const [jobResult,staffResult]=await Promise.all([
   api.request({path:"/v1/jobs"}),api.request({path:"/v1/staff"})
  ]);
  if(!Array.isArray(jobResult.jobs)||!Array.isArray(staffResult.staff))throw Error("HandyOS list unavailable");
  if(disposed)return;
  optionList(jobs,jobResult.jobs,"Select job","name");
  optionList(staff,staffResult.staff.filter(x=>x.active===true),"Select employee","display_name");
  await refresh();
  say("Ready for check-in.");
 }
 async function saveCheckIn(event){
  event.preventDefault();
  if(busy||!jobs.value||!staff.value)return;
  busy=true;const button=inForm.querySelector("button");button.disabled=true;say("Saving check-in…");
  try{
   await api.request({method:"POST",path:"/v1/attendance/check-in",
    json:{jobId:jobs.value,staffId:staff.value,workDate:date.value}});
   await refresh();say("Check-in saved on server.");
  }catch{say("Could not save check-in. Check for a duplicate date or retry.")}
  finally{busy=false;button.disabled=false}
 }
 async function saveStaff(event){
  event.preventDefault();
  if(busy)return;
  busy=true;const button=staffForm.querySelector("button");button.disabled=true;say("Saving employee…");
  try{
   const name=staffForm.querySelector("[data-staff-name]").value.trim(),
    role=staffForm.querySelector("[data-staff-role]").value.trim(),
    unit=staffForm.querySelector("[data-wage-unit]").value,
    rate=Number(staffForm.querySelector("[data-wage-rate]").value);
   if(!name||!Number.isFinite(rate))throw Error("Invalid entry");
   const response=await api.request({method:"POST",path:"/v1/staff",
    json:{displayName:name,roleLabel:role,wageUnit:unit,defaultRate:rate}});
   if(!response.staff||!UUID.test(response.staff.id))throw Error("Employee not confirmed");
   option(staff,response.staff.display_name,response.staff.id);
   staff.value=response.staff.id;staffForm.hidden=true;staffForm.reset();
   say("Employee saved on server.");
  }catch{say("Could not save employee. Check the details and retry.")}
  finally{busy=false;button.disabled=false}
 }
 inForm.addEventListener("submit",saveCheckIn);
 staffForm.addEventListener("submit",saveStaff);
 const toggle=()=>{staffForm.hidden=!staffForm.hidden};
 addStaff.addEventListener("click",toggle);
 const change=async()=>{if(busy)return;try{await refresh();say("Attendance updated.")}catch{say("Unable to load this date.")}};
 date.addEventListener("change",change);
 try{await prepare()}catch{say("Today is unavailable. Try refreshing after signing in.")}
 return Object.freeze({destroy(){disposed=true;inForm.removeEventListener("submit",saveCheckIn);
  staffForm.removeEventListener("submit",saveStaff);date.removeEventListener("change",change);
  addStaff.removeEventListener("click",toggle);if(root.contains(container))root.removeChild(container)}});
}

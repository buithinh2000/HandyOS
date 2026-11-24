import {melbourneToday} from "./handyos-business-date.mjs";
// Daily-first authenticated HandyOS home screen. Uses verified API only,
// never localStorage, guessed pay rates or browser-supplied tenant privileges.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const localDay=melbourneToday;
// Explicit Melbourne wall-clock conversion; browser/phone timezone must never change payroll hours.
// Reject DST spring gaps and duplicated fall-back times rather than silently guessing an instant.
const WORK_TZ="Australia/Melbourne";
const clockParts=new Intl.DateTimeFormat("en-GB",{
 timeZone:WORK_TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
});
function melbourneWallParts(value){
 const parts=clockParts.formatToParts(value);
 const get=kind=>parts.find(part=>part.type===kind)?.value;
 return [get("year"),get("month"),get("day")].join("-")+"T"+[get("hour"),get("minute")].join(":");
}
export function melbourneDateTimeISO(workDate,time){
 if(typeof workDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(workDate)||
    typeof time!=="string"||!/^\d{2}:\d{2}$/.test(time))throw Error("Invalid shift clock");
 const [year,month,day]=workDate.split("-").map(Number),[hour,minute]=time.split(":").map(Number);
 if(month<1||month>12||hour>23||minute>59)throw Error("Invalid shift clock");
 const wall=Date.UTC(year,month-1,day,hour,minute);
 if(!Number.isFinite(wall)||new Date(wall).toISOString().slice(0,10)!==workDate)
  throw Error("Invalid work date");
 const desired=workDate+"T"+time;
 const matches=[600,660].map(offset=>new Date(wall-offset*60000))
  .filter(candidate=>melbourneWallParts(candidate)===desired);
 if(matches.length!==1)throw Error("This local time is ambiguous or does not exist in Melbourne due to daylight saving. Choose a different time.");
 return matches[0].toISOString();
}
function melbourneClock(value){
 const parts=clockParts.formatToParts(new Date(value));
 const get=kind=>parts.find(part=>part.type===kind)?.value;
 return get("hour")+":"+get("minute");
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
 .handyos-today .crew-choice{display:flex;align-items:center;gap:10px;min-height:44px;border:1px solid #d9e4ee;border-radius:9px;padding:8px 12px;font-size:15px}
 .handyos-today .crew-choice input{width:22px;min-height:22px;height:22px;flex:0 0 22px;margin:0;accent-color:#17699b}
 .handyos-today .crew-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 .handyos-today .crew-toolbar button{background:#edf4f8;color:#183047;flex:1}
 .handyos-today [data-crew-list]{display:grid;gap:7px}
 .handyos-today .crew-record{border:1px solid #e3ebf0;border-radius:9px;padding:12px;display:grid;gap:6px}
 .handyos-today .job-session{border:1px solid #d9e4ee;border-radius:12px;overflow:hidden;background:#fff}
 .handyos-today .job-session summary{cursor:pointer;list-style:none;padding:14px;min-height:52px;display:flex;justify-content:space-between;gap:8px;align-items:center;font-weight:700}
 .handyos-today .job-session summary::-webkit-details-marker{display:none}
 .handyos-today .job-session summary::after{content:"⌄";color:#17699b;font-size:20px}
 .handyos-today .job-session[open] summary::after{content:"⌃"}
 .handyos-today .job-session summary:focus-visible{outline:3px solid #ffb72b;outline-offset:-3px}
 .handyos-today .job-session-content{padding:0 12px 12px;display:grid;gap:8px}
 .handyos-today .job-session small{font-weight:400}
 .handyos-today small{color:#50677b}
 .handyos-today .calendar{border:1px solid #d9e4ee;border-radius:12px;padding:12px;display:grid;gap:10px}
 .handyos-today .calendar-toolbar{display:flex;justify-content:space-between;align-items:center;gap:8px}
 .handyos-today .calendar-toolbar button{background:#edf4f8;color:#183047;min-width:46px}
 .handyos-today .calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
 .handyos-today .calendar-weekday{text-align:center;font-size:12px;color:#50677b;padding:6px 0;font-weight:700}
 .handyos-today .calendar-grid button{min-width:0;min-height:48px;padding:4px;background:#f2f6f9;color:#183047;font-weight:600;display:grid;align-content:center;justify-items:center;gap:2px}
 .handyos-today .calendar-grid .day-count{font-size:11px;line-height:1.1;font-weight:600;color:#17764c}
 .handyos-today .calendar-grid .day-open{color:#a46516}
 .handyos-today .calendar-grid button[data-selected=true] .day-count{color:white}
 .handyos-today [data-calendar-summary]{font-size:13px;color:#50677b;margin:0}
 .handyos-today .calendar-grid button[data-selected=true]{background:#17699b;color:#fff}
 .handyos-today .calendar-grid button[data-today=true]:not([data-selected=true]){box-shadow:inset 0 0 0 2px #17699b}
 .handyos-today .calendar-grid button:focus-visible,.handyos-today .calendar-toolbar button:focus-visible{outline:3px solid #ffb72b;outline-offset:2px}
 .handyos-today .calendar-grid button:disabled{background:transparent;visibility:hidden}
 @media(max-width:600px){.handyos-today .crew-grid{grid-template-columns:1fr}}
 </style>
 <h2>Today · Crew check-in</h2>
 <p>Record work at the job site. Payroll remains private to management.</p>
 <div class="calendar" aria-label="Work attendance calendar">
  <div class="calendar-toolbar"><button type="button" data-calendar-prev aria-label="Previous month">‹</button><strong data-calendar-month></strong><button type="button" data-calendar-next aria-label="Next month">›</button></div>
  <div class="calendar-grid" data-calendar-grid role="group" aria-label="Choose workday"></div>
  <p data-calendar-summary role="status" aria-live="polite">Loading recorded attendance days…</p>
  <div class="crew-grid"><label>Selected work date<input type="date" data-work-date required></label><button type="button" data-go-today>Go to today</button></div>
 </div>
 <p data-day-context></p>
 <div class="crew-grid" data-attendance-selectors>
 <label>Job<select data-job required></select></label>
 <label data-past-employee>Employee (past workday only)<select data-staff></select></label>
 </div>
 <div data-crew-picker>
  <strong>Today's crew</strong>
  <p>All active employees selected by default. Untick anyone not working on this job today.</p>
  <div class="crew-toolbar"><button type="button" data-select-all>Select all</button><button type="button" data-select-none>Clear</button><small data-crew-count></small></div>
  <div data-crew-list role="group" aria-label="Employees to check in"></div>
 </div>
 <form data-check-in>
 <button type="submit">Check in selected crew</button>
 </form>
 <form data-backfill hidden>
  <h3>Record missed attendance</h3>
  <p>Enter actual start and finish times for this past date, not the current time.</p>
  <div class="crew-grid">
   <label>Actual start time<input type="time" data-start-time value="08:00" required></label>
   <label>Actual finish time<input type="time" data-finish-time value="16:00" required></label>
   <label>Unpaid break (minutes)<input type="number" data-break-minutes min="0" max="600" step="1" value="0" required></label>
   <label>Paid day portion<select data-day-portion><option value="1">Full day</option><option value="0.5">Half day</option></select></label>
  </div>
  <label>Notes (optional)<input data-backfill-notes maxlength="500"></label>
  <button type="submit">Save missed workday</button>
 </form>
 <h3 data-attendance-heading>Jobs · attendance for selected date</h3>
 <p>Tap a job to view its crew or check out. Check-in never opens a check-out screen automatically.</p>
 <div data-attendance></div>
 <p role="status" data-status aria-live="polite">Loading today…</p>`;
 const date=container.querySelector("[data-work-date]"),jobs=container.querySelector("[data-job]"),
  staff=container.querySelector("[data-staff]"),records=container.querySelector("[data-attendance]"),
  crewPicker=container.querySelector("[data-crew-picker]"),crewList=container.querySelector("[data-crew-list]"),
  crewCount=container.querySelector("[data-crew-count]"),pastStaff=container.querySelector("[data-past-employee]"),
  selectAll=container.querySelector("[data-select-all]"),selectNone=container.querySelector("[data-select-none]"),
  inForm=container.querySelector("[data-check-in]"),backfillForm=container.querySelector("[data-backfill]"),
  context=container.querySelector("[data-day-context]"),heading=container.querySelector("[data-attendance-heading]"),
  status=container.querySelector("[data-status]"),calendarGrid=container.querySelector("[data-calendar-grid]"),
  monthLabel=container.querySelector("[data-calendar-month]"),monthSummary=container.querySelector("[data-calendar-summary]"),
  previous=container.querySelector("[data-calendar-prev]"),next=container.querySelector("[data-calendar-next]"),goToday=container.querySelector("[data-go-today]");
 date.value=localDay();
 root.replaceChildren(container);
 let disposed=false,busy=false,activeStaff=[],attendanceForDay=[];
 const expandedJobs=new Set();
 let calendarMonth=new Date(Number(date.value.slice(0,4)),Number(date.value.slice(5,7))-1,1);
 let loadedMonth="",recordedDays=new Map(),summarySequence=0;
 const pad=n=>String(n).padStart(2,"0");
 const renderCalendar=()=>{
  calendarGrid.replaceChildren();
  monthLabel.textContent=new Intl.DateTimeFormat("en-AU",{month:"long",year:"numeric"}).format(calendarMonth);
  for(const name of ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]){const day=document.createElement("span");day.className="calendar-weekday";day.textContent=name;calendarGrid.append(day)}
  const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth(),days=new Date(year,month+1,0).getDate();
  const first=(new Date(year,month,1).getDay()+6)%7;
  for(let i=0;i<first;i++){const blank=document.createElement("span");calendarGrid.append(blank)}
  for(let n=1;n<=days;n++){
   const day=`${year}-${pad(month+1)}-${pad(n)}`;
   const button=document.createElement("button");button.type="button";
   const number=document.createElement("span");number.textContent=String(n);button.append(number);
   const recorded=loadedMonth===`${year}-${pad(month+1)}`?recordedDays.get(day):null;
   if(recorded){
    const count=document.createElement("span");count.className="day-count"+(recorded.openCount?" day-open":"");
    count.textContent=recorded.openCount?`${recorded.recordedCount} · open`:`${recorded.recordedCount} saved`;
    button.dataset.recorded=String(recorded.recordedCount);
    if(recorded.openCount)button.dataset.open=String(recorded.openCount);
    button.append(count);
   }
   button.dataset.calendarDay=day;button.dataset.selected=String(day===date.value);
   button.dataset.today=String(day===localDay());button.setAttribute("aria-label",day+(recorded?`, ${recorded.recordedCount} recorded, ${recorded.openCount} still checked in`:", no attendance recorded"));
   if(day===date.value)button.setAttribute("aria-pressed","true");
   button.addEventListener("click",()=>{if(busy)return;date.value=day;date.dispatchEvent(new Event("change",{bubbles:true}))});
   calendarGrid.append(button);
  }
 };
 const say=s=>{if(!disposed)status.textContent=s};
 const monthKey=()=>calendarMonth.getFullYear()+"-"+pad(calendarMonth.getMonth()+1);
 async function loadMonth({force=false}={}){
  const month=monthKey();
  if(!force&&loadedMonth===month)return;
  const sequence=++summarySequence;
  loadedMonth="";recordedDays=new Map();
  monthSummary.textContent="Loading recorded attendance days…";
  renderCalendar();
  try{
   const result=await api.request({path:"/v1/attendance/month?month="+month});
   if(result?.month!==month||!Array.isArray(result.days)||result.days.length>31)throw Error("Invalid month response");
   const map=new Map();
   for(const row of result.days){
    if(typeof row.date!=="string"||!row.date.startsWith(month+"-")||map.has(row.date)||
       !Number.isInteger(row.recordedCount)||row.recordedCount<1||
       !Number.isInteger(row.openCount)||row.openCount<0||row.openCount>row.recordedCount)
     throw Error("Invalid recorded attendance summary");
    map.set(row.date,{recordedCount:row.recordedCount,openCount:row.openCount});
   }
   if(disposed||sequence!==summarySequence||month!==monthKey())return;
   recordedDays=map;loadedMonth=month;
   monthSummary.textContent=map.size+" days with recorded attendance. Blank days mean no record, not confirmed absence.";
   renderCalendar();
  }catch{
   if(disposed||sequence!==summarySequence||month!==monthKey())return;
   monthSummary.textContent="Monthly attendance could not be loaded. Tap a day to check its records.";
   renderCalendar();
  }
 }
 const setMode=()=>{
  const past=date.value<localDay(),future=date.value>localDay();
  inForm.hidden=past||future;backfillForm.hidden=!past;
  crewPicker.hidden=past||future;pastStaff.hidden=!past;
  heading.textContent=`Attendance · ${date.value}`;
  context.textContent=past?"Past date — enter actual worked hours to record a completed shift.":future?"Future date — view only; no advance attendance.":"Today — use live check-in/check-out.";
 };
 const selectedIds=()=>[...crewList.querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value);
 const updateCrewCount=()=>{
  const selected=selectedIds().length;
  const eligible=crewList.querySelectorAll('input[type="checkbox"]:not(:disabled)').length;
  crewCount.textContent=`${selected} of ${eligible} available selected`;
  inForm.querySelector('button[type="submit"]').disabled=busy||selected===0||!jobs.value;
 };
 const renderCrew=()=>{
  const selected=new Set(selectedIds());
  const firstDraw=crewList.children.length===0;
  const recorded=new Set(attendanceForDay.map(item=>item.staff_id));
  crewList.replaceChildren();
  for(const employee of activeStaff){
   const line=document.createElement("label");line.className="crew-choice";
   const check=document.createElement("input");check.type="checkbox";check.value=employee.id;
   check.disabled=recorded.has(employee.id);
   check.checked=!check.disabled&&(firstDraw||selected.has(employee.id));
   check.addEventListener("change",updateCrewCount);
   const name=document.createElement("span");name.textContent=employee.display_name+(check.disabled?" · already recorded":"");
   line.append(check,name);crewList.append(line);
  }
  updateCrewCount();
 };
 const chooseAll=()=>{for(const input of crewList.querySelectorAll('input[type="checkbox"]:not(:disabled)'))input.checked=true;updateCrewCount()};
 const chooseNone=()=>{for(const input of crewList.querySelectorAll('input[type="checkbox"]'))input.checked=false;updateCrewCount()};
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
  calendarMonth=new Date(Number(day.slice(0,4)),Number(day.slice(5,7))-1,1);
  renderCalendar();setMode();
  if(loadedMonth!==monthKey())await loadMonth();
  const result=await api.request({path:"/v1/attendance?date="+day});
  if(!Array.isArray(result.attendance))throw Error("Invalid attendance response");
  if(disposed)return;
  attendanceForDay=result.attendance;
  renderCrew();
  // Keep sessions collapsed after every new check-in. Expand only by deliberate tap.
  records.replaceChildren();
  if(!result.attendance.length){
   paragraph(records,"No attendance recorded for this date.");
   return;
  }
  const grouped=new Map();
  for(const item of result.attendance){
   if(!item||!UUID.test(item.id)||!UUID.test(item.job_id)||typeof item.display_name!=="string")
    throw Error("Invalid attendance entry");
   const current=grouped.get(item.job_id)||{name:String(item.job_name??"Job"),entries:[]};
   current.entries.push(item);grouped.set(item.job_id,current);
  }
  for(const [jobId,group] of grouped){
   const openCount=group.entries.filter(x=>!x.finished_at).length;
   const details=document.createElement("details");
   details.className="job-session";details.dataset.jobSession=jobId;
   details.open=expandedJobs.has(jobId);
   details.addEventListener("toggle",()=>{
    if(details.open)expandedJobs.add(jobId);
    else expandedJobs.delete(jobId);
   });
   const summary=document.createElement("summary");
   summary.dataset.jobToggle=jobId;
   const label=document.createElement("span");label.textContent=group.name;
   const count=document.createElement("small");
   count.textContent=openCount?openCount+" checked in · "+group.entries.length+" recorded":
    group.entries.length+" checked out";
   summary.append(label,count);details.append(summary);
   const body=document.createElement("div");body.className="job-session-content";
   for(const item of group.entries){
    const card=document.createElement("div");card.className="crew-record";
    const name=document.createElement("strong");name.textContent=item.display_name;
    const detail=document.createElement("small");
    detail.textContent=item.finished_at?"Checked out":"Checked in — waiting for check-out";
    card.append(name,detail);
    if(!item.finished_at&&day===localDay()){
     const button=document.createElement("button");
     button.type="button";button.textContent="Check out";button.dataset.checkout=item.id;
     button.addEventListener("click",async()=>{
      if(busy)return;busy=true;button.disabled=true;say("Saving check-out…");
      try{
       await api.request({method:"POST",path:"/v1/attendance/"+item.id+"/check-out",json:{}});
       await refresh();await loadMonth({force:true});say("Check-out saved on server.");
      }catch{say("Could not save check-out. Please retry.");button.disabled=false}
      finally{busy=false}
     });
     card.append(button);
    }
    // Correct the existing shift in place; never create a second paid attendance row.
    if(typeof item.updated_at==="string"&&item.started_at){
     const edit=document.createElement("button");edit.type="button";
     edit.textContent="Edit shift";edit.dataset.editAttendance=item.id;
     const form=document.createElement("form");
     form.hidden=true;form.dataset.correctionForm=item.id;
     form.innerHTML=`<label>Actual start<input name="start" type="time" required></label>
      <label>Actual finish (leave blank only if still checked in)<input name="finish" type="time"></label>
      <label>Unpaid break (minutes)<input name="break" type="number" min="0" max="600" step="1" required></label>
      <label>Paid day<select name="portion"><option value="1">Full day</option><option value="0.5">Half day</option></select></label>
      <label>Notes<input name="notes" maxlength="500"></label>
      <label>Reason for change<input name="reason" maxlength="500" minlength="3" required placeholder="e.g. Actual hours corrected"></label>
      <button type="submit">Save corrected shift</button>`;
     const time=v=>melbourneClock(v);
     form.elements.start.value=time(item.started_at);
     if(item.finished_at)form.elements.finish.value=time(item.finished_at);
     form.elements.break.value=String(item.break_minutes??0);
     form.elements.portion.value=String(item.paid_day_portion??1);
     form.elements.notes.value=String(item.notes??"");
     edit.addEventListener("click",()=>{form.hidden=!form.hidden});
     form.addEventListener("submit",async e=>{
      e.preventDefault();if(busy||!form.reportValidity())return;
      const finishTime=form.elements.finish.value;
      if(item.finished_at&&!finishTime){say("A completed shift must have a finish time.");return}
      if(finishTime&&finishTime<=form.elements.start.value){
       say("Finish time must be after start time.");return;
      }
      busy=true;const submit=form.querySelector('[type="submit"]');
      submit.disabled=true;say("Saving audited shift correction…");
      try{
       await api.request({method:"POST",path:"/v1/attendance/"+item.id+"/correct",
        json:{startedAt:dateTimeISO(day,form.elements.start.value),
         finishedAt:finishTime?dateTimeISO(day,finishTime):null,
         breakMinutes:Number(form.elements.break.value),
         paidDayPortion:Number(form.elements.portion.value),
         notes:form.elements.notes.value,
         reason:form.elements.reason.value.trim(),
         expectedUpdatedAt:item.updated_at}});
       await refresh();await loadMonth({force:true});
       say("Shift corrected and saved with audit history.");
      }catch(err){say(err?.message?.includes("daylight saving")?err.message:"Correction not saved. It may be an unchanged shift, stale version or closed payroll week. Refresh and review.")}
      finally{busy=false;submit.disabled=false}
     });
     card.append(edit,form);
    }
    body.append(card);
   }
   details.append(body);records.append(details);
  }
 }
 async function prepare(){
  const [jobResult,staffResult]=await Promise.all([
   api.request({path:"/v1/jobs"}),api.request({path:"/v1/staff"})
  ]);
  if(!Array.isArray(jobResult.jobs)||!Array.isArray(staffResult.staff))throw Error("HandyOS list unavailable");
  if(disposed)return;
  optionList(jobs,jobResult.jobs,"Select job","name");
  activeStaff=staffResult.staff.filter(x=>x.active===true);
  optionList(staff,activeStaff,"Select employee","display_name");
  await refresh();
  say("Ready for check-in.");
 }
 async function saveCheckIn(event){
  event.preventDefault();
  const ids=selectedIds();
  if(busy||!jobs.value||date.value!==localDay()||!ids.length)return;
  busy=true;const button=inForm.querySelector('button');button.disabled=true;
  say("Checking in "+ids.length+" employees…");
  try{
   const saved=await api.request({method:"POST",path:"/v1/attendance/check-in-batch",
    json:{jobId:jobs.value,staffIds:ids,workDate:date.value}});
   if(saved?.checkedIn!==ids.length||!Array.isArray(saved.entries)||saved.entries.length!==ids.length)
    throw Error("Batch check-in not confirmed");
   expandedJobs.clear();
   await refresh();await loadMonth({force:true});
   say(ids.length+" employees checked in. Tap the job below to check out later.");
  }catch{say("Crew check-in not saved. Someone may already have a shift today. Refresh attendance and try again.")}
  finally{busy=false;updateCrewCount()}
 }
 function dateTimeISO(workDate,time){
  if(!/^\d{2}:\d{2}$/.test(time))throw Error("Invalid shift time");
  return melbourneDateTimeISO(workDate,time);
 }
 async function saveBackfill(event){
  event.preventDefault();
  if(busy||date.value>=localDay()||!jobs.value||!staff.value||!backfillForm.reportValidity())return;
  const start=container.querySelector("[data-start-time]").value;
  const finish=container.querySelector("[data-finish-time]").value;
  if(finish<=start){say("Finish time must be after start time.");return}
  busy=true;const button=backfillForm.querySelector('button[type="submit"]');
  button.disabled=true;say("Saving missed workday…");
  try{
   await api.request({method:"POST",path:"/v1/attendance/backfill",json:{
    jobId:jobs.value,staffId:staff.value,workDate:date.value,
    startedAt:dateTimeISO(date.value,start),finishedAt:dateTimeISO(date.value,finish),
    breakMinutes:Number(container.querySelector("[data-break-minutes]").value),
    paidDayPortion:Number(container.querySelector("[data-day-portion]").value),
    notes:container.querySelector("[data-backfill-notes]").value
   }});
   await refresh();await loadMonth({force:true});say("Past attendance saved on server. Check employee payroll for this week.");
  }catch(err){say(err?.message?.includes("daylight saving")?err.message:"Could not save missed workday. Check for an existing day or a closed payroll week.")}
  finally{busy=false;button.disabled=false}
 }
 inForm.addEventListener("submit",saveCheckIn);
 selectAll.addEventListener("click",chooseAll);selectNone.addEventListener("click",chooseNone);
 jobs.addEventListener("change",updateCrewCount);
 backfillForm.addEventListener("submit",saveBackfill);
 const change=async()=>{if(busy)return;try{await refresh();say("Attendance updated.")}catch{say("Unable to load this date.")}};
 date.addEventListener("change",change);
 const returnToToday=()=>{if(busy||disposed)return;date.value=localDay();void change()};
 goToday.addEventListener("click",returnToToday);
 const shiftMonth=offset=>{if(busy)return;calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+offset,1);void loadMonth()};
 const prev=()=>shiftMonth(-1),forward=()=>shiftMonth(1);
 previous.addEventListener("click",prev);next.addEventListener("click",forward);
 renderCalendar();
 try{await prepare()}catch{say("Today is unavailable. Try refreshing after signing in.")}
 return Object.freeze({destroy(){disposed=true;inForm.removeEventListener("submit",saveCheckIn);
  selectAll.removeEventListener("click",chooseAll);selectNone.removeEventListener("click",chooseNone);
  jobs.removeEventListener("change",updateCrewCount);date.removeEventListener("change",change);goToday.removeEventListener("click",returnToToday);backfillForm.removeEventListener("submit",saveBackfill);previous.removeEventListener("click",prev);next.removeEventListener("click",forward);if(root.contains(container))root.removeChild(container)}});
}

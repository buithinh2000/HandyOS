// HandyOS cloud Jobs: one overview, tap a job for details.
// Authenticated API only; never read or write the legacy browser demo store.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAGES=new Set(["survey","scope","estimate","quoted","approved","scheduled","active","handover","closed"]);
function txt(tag,value,parent,attrs={}){
 const e=document.createElement(tag);e.textContent=value;
 for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);
 parent.append(e);return e;
}
function validatedJobs(result){
 if(!Array.isArray(result?.jobs)||result.jobs.length>100)throw Error("Jobs unavailable");
 const seen=new Set();
 return result.jobs.map(j=>{
  if(!j||!UUID.test(j.id)||typeof j.name!=="string"||!j.name.trim()||
   j.name.length>200||typeof j.stage!=="string"||!STAGES.has(j.stage)||seen.has(j.id))
   throw Error("Invalid Job");
  seen.add(j.id);return j;
 });
}
export async function mountHandyOsJobs({root,api,onJobsChanged}={}){
 if(typeof root?.replaceChildren!=="function"||typeof api?.request!=="function")
  throw Error("HandyOS Jobs unavailable");
 const panel=document.createElement("section");panel.className="handyos-jobs";
 panel.innerHTML=`<style>
 .handyos-jobs{background:#fff;border:1px solid #d9e4ee;border-radius:16px;padding:16px;margin:14px 0;display:grid;gap:12px}
 .handyos-jobs h2{font-size:22px;margin:0}.handyos-jobs h3{margin:0;font-size:18px}
 .handyos-jobs button{font:inherit;padding:10px 12px;min-height:44px;border-radius:8px;border:1px solid #17699b;background:#17699b;color:#fff}
 .handyos-jobs button:disabled{opacity:.5}.handyos-jobs [hidden]{display:none!important}
 .handyos-jobs label{display:grid;gap:4px}
 .handyos-jobs input,.handyos-jobs select{box-sizing:border-box;width:100%;border:1px solid #b8cddb;padding:10px;min-height:44px;border-radius:8px;font:inherit}
 .handyos-jobs form{display:grid;gap:10px;padding:12px;border-radius:10px;background:#f5f9fb}
 .handyos-jobs [data-job-list]{display:grid;gap:7px}
 .handyos-jobs [data-job-list] button{background:#f5f9fb;color:#16476b;text-align:left;border-color:#c9d9e5}
 .handyos-jobs .job-task{padding:9px;border-bottom:1px solid #e2e9ee}
 .handyos-jobs .job-task small{color:#587185;display:block}
 </style>
 <h2>Jobs · Công trình</h2>
 <div data-overview>
  <button type="button" data-new-job>+ New job</button>
  <form data-create-job hidden>
   <label>Job name<input name="name" maxlength="200" required placeholder="Bathroom renovation"></label>
   <label>Job reference (optional)<input name="code" maxlength="60"></label>
   <button type="submit">Save job</button>
  </form>
  <div data-job-list></div>
 </div>
 <section data-detail hidden>
  <button type="button" data-back>All jobs</button>
  <h3 data-job-title></h3>
  <p data-job-stage></p>
  <h3>Work items</h3>
  <div data-tasks></div>
  <form data-create-task>
   <label>New task<input name="title" maxlength="200" required placeholder="Install plasterboard"></label>
   <button type="submit">Add task</button>
  </form>
 </section>
 <p data-status role="status" aria-live="polite">Loading jobs…</p>`;
 root.replaceChildren(panel);
 const overview=panel.querySelector("[data-overview]"),detail=panel.querySelector("[data-detail]"),
 list=panel.querySelector("[data-job-list]"),tasks=panel.querySelector("[data-tasks]"),
 status=panel.querySelector("[data-status]"),jobForm=panel.querySelector("[data-create-job]"),
 taskForm=panel.querySelector("[data-create-task]"),jobTitle=panel.querySelector("[data-job-title]");
 let jobs=[],selected=null,busy=false,disposed=false;
 const message=s=>{if(!disposed)status.textContent=s};
 function drawList(){
  if(disposed)return;
  list.replaceChildren();
  if(!jobs.length)txt("p","No jobs yet. Add your first project.",list);
  for(const job of jobs){
   const b=txt("button",job.name+(job.code?" · "+job.code:"")+" — "+job.stage,list);
   b.type="button";b.addEventListener("click",()=>open(job));
  }
 }
 async function refresh(){
  const result=await api.request({path:"/v1/jobs"});
  const found=validatedJobs(result);
  if(disposed)return;
  jobs=found;drawList();
  if(typeof onJobsChanged==="function")onJobsChanged(jobs.map(j=>({id:j.id,name:j.name,stage:j.stage})));
 }
 async function loadTasks(job){
  const data=await api.request({path:"/v1/jobs/"+job.id+"/tasks"});
  if(!Array.isArray(data?.tasks)||data.tasks.length>500)throw Error("Tasks unavailable");
  if(disposed||selected?.id!==job.id)return;
  tasks.replaceChildren();
  if(!data.tasks.length)txt("p","No work items yet.",tasks);
  for(const task of data.tasks){
   if(!task||!UUID.test(task.id)||typeof task.title!=="string"||
    !["todo","in_progress","blocked","done"].includes(task.status))throw Error("Invalid task");
   const row=txt("div",task.title,tasks,{class:"job-task"});
   txt("small",task.status.replaceAll("_"," "),row);
  }
 }
 async function open(job){
  if(busy||disposed)return;
  selected=job;jobTitle.textContent=job.name;
  panel.querySelector("[data-job-stage]").textContent="Stage: "+job.stage;
  overview.hidden=true;detail.hidden=false;message("Loading work items…");
  try{await loadTasks(job);message("Job details loaded.")}
  catch{tasks.replaceChildren();message("Could not load work items. Retry from All jobs.")}
 }
 const onBack=()=>{selected=null;overview.hidden=false;detail.hidden=true;message("Select a job for details.")};
 const onNew=()=>{jobForm.hidden=!jobForm.hidden};
 const onJob=async event=>{
  event.preventDefault();if(busy)return;
  const name=jobForm.elements.name.value.trim(),code=jobForm.elements.code.value.trim();
  if(!name||name.length>200||code.length>60){message("Invalid job details.");return}
  busy=true;const b=jobForm.querySelector('button[type="submit"]');b.disabled=true;message("Saving job…");
  try{
   const result=await api.request({method:"POST",path:"/v1/jobs",json:{name,code}});
   if(!result?.job||!UUID.test(result.job.id))throw Error("Job not confirmed");
   await refresh();jobForm.reset();jobForm.hidden=true;message("Job saved on server.");
  }catch{message("Could not save job. Please retry.")}
  finally{busy=false;b.disabled=false}
 };
 const onTask=async event=>{
  event.preventDefault();if(busy||!selected)return;
  const title=taskForm.elements.title.value.trim();
  if(!title||title.length>200){message("Enter a valid task name.");return}
  busy=true;const b=taskForm.querySelector('button[type="submit"]');b.disabled=true;message("Saving task…");
  try{
   const result=await api.request({method:"POST",path:"/v1/jobs/"+selected.id+"/tasks",json:{title}});
   if(!result?.task||!UUID.test(result.task.id))throw Error("Task not confirmed");
   await loadTasks(selected);taskForm.reset();message("Task saved on server.");
  }catch{message("Could not save task. Please retry.")}
  finally{busy=false;b.disabled=false}
 };
 panel.querySelector("[data-back]").addEventListener("click",onBack);
 panel.querySelector("[data-new-job]").addEventListener("click",onNew);
 jobForm.addEventListener("submit",onJob);taskForm.addEventListener("submit",onTask);
 try{await refresh();message("Select a job for details.")}
 catch{message("Could not load jobs. Please retry after sign-in.")}
 return Object.freeze({refresh,destroy(){disposed=true;root.replaceChildren()}});
}

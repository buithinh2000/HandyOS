// HandyOS commercial workspace shell: one primary screen at a time.
// UI navigation is local, session memory-only, and never a security boundary.
// Section content is loaded only on demand. No global demo data or AWS writes.
const SECTIONS=Object.freeze([
 {id:"today",label:"Today",description:"Daily crew check-in and check-out"},
 {id:"jobs",label:"Jobs",description:"Projects and work items"},
 {id:"employees",label:"Employees",description:"Staff profiles and weekly payroll"},
 {id:"bills",label:"Bills",description:"Customer material receipts"}
]);
function fail(){throw Error("HandyOS workspace unavailable")}
export async function mountHandyOsWorkspace({root,sections,onSignOut}={}){
 if(typeof root?.replaceChildren!=="function"||!sections||typeof onSignOut!=="function"||
  SECTIONS.some(s=>typeof sections[s.id]!=="function"))fail();
 const frame=document.createElement("div");frame.className="handyos-workspace";
 frame.innerHTML=`<style>
 .handyos-workspace{max-width:1160px;margin:auto;color:#163248;padding:0 14px 100px;min-width:0}
 .handyos-workspace *{box-sizing:border-box}
 .handyos-workspace .os-top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #dce7ec}
 .handyos-workspace .os-brand{font-size:21px;letter-spacing:-.4px;font-weight:750}
 .handyos-workspace .os-signout{border:1px solid #cad9e2;background:#fff;color:#27465b;border-radius:10px;min-height:44px;padding:9px 12px}
 .handyos-workspace .os-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;padding:14px 0}
 .handyos-workspace .os-nav button{border:1px solid #d7e4ea;background:#fff;border-radius:11px;padding:10px 7px;min-height:48px;color:#2c4656;font-weight:650;font:inherit;cursor:pointer}
 .handyos-workspace .os-nav button[aria-current=page]{background:#17699b;border-color:#17699b;color:#fff}
 .handyos-workspace .os-pagehead{padding:7px 0 10px}
 .handyos-workspace .os-pagehead h1{font-size:25px;margin:0 0 4px}
 .handyos-workspace .os-pagehead p{margin:0;color:#577083;font-size:14px}
 .handyos-workspace .os-viewport{min-height:170px}
 .handyos-workspace .os-error{padding:16px;border-radius:12px;border:1px solid #e1ccd0;background:#fff}
 .handyos-workspace .os-error button{min-height:44px;border:1px solid #17699b;background:#17699b;color:white;border-radius:8px;padding:10px 14px}
 .handyos-workspace [hidden]{display:none!important}
 .handyos-workspace :focus-visible{outline:3px solid #e4a22e;outline-offset:3px}
 @media(max-width:600px){
  .handyos-workspace{padding:0 12px 92px}
  .handyos-workspace .os-nav{position:fixed;bottom:0;left:0;right:0;padding:8px 10px max(10px,env(safe-area-inset-bottom));z-index:10;background:#fff;border-top:1px solid #dce7ec;box-shadow:0 -5px 18px #18304714}
  .handyos-workspace .os-nav button{min-height:52px;font-size:13px}
  .handyos-workspace .os-pagehead h1{font-size:23px}
 }
 </style>
 <header class="os-top"><strong class="os-brand">HandyOS</strong><button class="os-signout" data-workspace-logout type="button">Sign out</button></header>
 <nav class="os-nav" aria-label="Main navigation"></nav>
 <div class="os-pagehead"><h1 data-page-title></h1><p data-page-description></p></div>
 <div class="os-viewport" data-page-body></div>
 <p role="status" aria-live="polite" data-workspace-status></p>`;
 root.replaceChildren(frame);
 const nav=frame.querySelector(".os-nav"),body=frame.querySelector("[data-page-body]"),
  title=frame.querySelector("[data-page-title]"),description=frame.querySelector("[data-page-description]"),
  status=frame.querySelector("[data-workspace-status]");
 let active=null,current=null,disposed=false,epoch=0;
 const buttons=new Map();
 function mark(section){
  for(const [id,button] of buttons){
   if(id===section.id)button.setAttribute("aria-current","page");
   else button.removeAttribute("aria-current");
  }
  title.textContent=section.label;description.textContent=section.description;
 }
 async function show(id){
  if(disposed)return;
  const section=SECTIONS.find(s=>s.id===id);
  if(!section)return;
  if(active===id)return;
  const token=++epoch;
  active=id;
  current?.destroy?.();current=null;body.replaceChildren();mark(section);
  status.textContent="Opening "+section.label+"…";
  const mountPoint=document.createElement("div");
  body.append(mountPoint);
  try{
   const view=await sections[id](mountPoint);
   if(disposed||token!==epoch){
    view?.destroy?.();return;
   }
   current=view;
   status.textContent=section.label+" ready.";
  }catch{
   if(disposed||token!==epoch)return;
   body.replaceChildren();
   const error=document.createElement("div");error.className="os-error";
   const message=document.createElement("p");message.textContent="Could not load "+section.label+". Your saved data has not been changed.";
   const retry=document.createElement("button");retry.type="button";retry.textContent="Retry "+section.label;
   retry.addEventListener("click",()=>{active=null;void show(id)});
   error.append(message,retry);body.append(error);
   status.textContent=section.label+" unavailable.";
  }
 }
 for(const section of SECTIONS){
  const button=document.createElement("button");button.type="button";
  button.dataset.section=section.id;
  button.textContent=section.label;button.addEventListener("click",()=>{void show(section.id)});
  buttons.set(section.id,button);nav.append(button);
 }
 const logout=frame.querySelector("[data-workspace-logout]");
 logout.addEventListener("click",onSignOut);
 await show("today");
 return Object.freeze({
  open:show,
  get activeSection(){return active},
  destroy(){if(disposed)return;disposed=true;epoch++;current?.destroy?.();current=null;
   logout.removeEventListener("click",onSignOut);root.replaceChildren();}
 });
}

// Source-only HandyOS staging login/callback/tenant-picker shell.
// No implicit deployment, no legacy owner-v1 integration, no real AWS config.
// Requires a dedicated Cognito public client and verified isolated backend.
import {createHandyOsPkceSession} from "./handyos-cognito-pkce.mjs";
import {createHandyOsApiTransport} from "./handyos-cloud-api-transport.mjs";
import {mountAuthenticatedCloudBills} from "./handyos-cloud-bills-app.mjs";
import {mountHandyOsToday} from "./handyos-today-view.mjs";
import {mountHandyOsPayroll} from "./handyos-payroll-view.mjs";
import {mountHandyOsJobs} from "./handyos-jobs-view.mjs";
import {mountHandyOsWorkspace} from "./handyos-workspace-shell.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function denied(){throw Error("HandyOS sign-in shell unavailable")}
export async function mountHandyOsLoginShell({
 root,config,apiOrigin,sessionStorage,cryptoApi,fetcher,put,
 locationUrl,historyReplace,navigate
}={}){
 if(!root||typeof root.replaceChildren!=="function"||typeof sessionStorage?.getItem!=="function"||
  typeof historyReplace!=="function"||typeof navigate!=="function"||
  typeof locationUrl!=="string"||typeof put!=="function")denied();
 const location=new URL(locationUrl);
 if(location.origin!==config?.uiOrigin||
  !["/","/auth/callback"].includes(location.pathname)||location.hash)denied();
 const session=createHandyOsPkceSession({config,cryptoApi,fetcher,storage:sessionStorage});
 const main=document.createElement("main");
 main.className="handyos-cloud-login";
 main.innerHTML=`<style>
 .handyos-cloud-login{max-width:1160px;margin:16px auto;padding:8px;font:inherit;color:#163248;min-width:0}
 .handyos-cloud-login h1{font-size:26px}
 .handyos-cloud-login button,.handyos-cloud-login select{padding:12px;min-height:44px;border-radius:9px;font:inherit}
 .handyos-cloud-login button{background:#125889;color:white;border:0}
 .handyos-cloud-login button:disabled{opacity:.55}
 .handyos-cloud-login [hidden]{display:none!important}
 .handyos-cloud-login [role=status]{min-height:28px}
 .handyos-cloud-login section{display:grid;gap:14px}
 </style>
 <h1>HandyOS</h1>
 <p>Private company workspace · Staging</p>
 <section data-auth><button type="button" data-login>Sign in securely</button></section>
 <section data-company hidden><label>Choose your company<select data-companies></select></label><button type="button" data-continue>Open HandyOS</button></section>
 <section data-bills hidden><div data-workspace-root></div></section>
 <p role="status" aria-live="polite">Sign in to access your company.</p>`;
 const login=main.querySelector("[data-login]"),company=main.querySelector("[data-company]");
 const picker=main.querySelector("[data-companies]"),proceed=main.querySelector("[data-continue]");
 const billSection=main.querySelector("[data-bills]"),workspaceRoot=main.querySelector("[data-workspace-root]");
 const status=main.querySelector("[role=status]");
 root.replaceChildren(main);
 let mountedWorkspace=null,eligible=[],busy=false;
 const message=s=>{status.textContent=s};
 const reset=()=>{mountedWorkspace?.destroy();mountedWorkspace=null;session.logout();eligible=[];picker.replaceChildren();
  login.disabled=false;company.hidden=true;billSection.hidden=true;login.parentElement.hidden=false;
  message("Sign in to access your company.")};
 const onLogin=async()=>{
  if(busy)return;
  busy=true;login.disabled=true;message("Opening secure HandyOS sign-in…");
  try{navigate(await session.begin())}
  catch{login.disabled=false;message("Sign-in unavailable. Try again later.")}
  finally{busy=false}
 };
 const onContinue=async()=>{
  if(busy||!eligible.some(x=>x.tenant_id===picker.value))return;
  busy=true;proceed.disabled=true;message("Checking company access…");
  try{
   session.chooseTenant(picker.value);
   // Verify selected company before any business screen is mounted.
   const api=createHandyOsApiTransport({apiOrigin,uiOrigin:config.uiOrigin,
    locationOrigin:location.origin,session,fetcher});
   const me=await api.request({path:"/v1/me"});
   if(!me||me.tenant_id!==picker.value||!["owner","manager"].includes(me.role))
    throw Error("Company verification unavailable");
   mountedWorkspace=await mountHandyOsWorkspace({
    root:workspaceRoot,onSignOut:reset,
    sections:{
     today:r=>mountHandyOsToday({root:r,api}),
     jobs:r=>mountHandyOsJobs({root:r,api}),
     employees:r=>mountHandyOsPayroll({root:r,api}),
     bills:r=>mountAuthenticatedCloudBills({root:r,session,apiOrigin,
      uiOrigin:config.uiOrigin,locationOrigin:location.origin,fetcher,put})
    }
   });
   company.hidden=true;login.parentElement.hidden=true;billSection.hidden=false;
   message("Signed in to your private HandyOS workspace.");
  }catch{reset();message("Company verification failed. Sign in again.")}
  finally{busy=false;proceed.disabled=false}
 };
 login.addEventListener("click",onLogin);
 proceed.addEventListener("click",onContinue);
 if(location.pathname==="/auth/callback"){
  // Remove the one-time authorization code and state from browser history
  // before exchanging them; never store/log/copy the callback URL.
  historyReplace(config.uiOrigin+"/");
  login.disabled=true;message("Completing secure sign-in…");
  try{
   await session.complete(locationUrl);
   const api=createHandyOsApiTransport({apiOrigin,uiOrigin:config.uiOrigin,
    locationOrigin:location.origin,session,fetcher});
   eligible=await api.listCompanies();
   if(!eligible.length)throw Error("No permitted company");
   for(const member of eligible){
    if(!UUID.test(member.tenant_id))throw Error("Invalid company");
    const option=document.createElement("option");
    option.value=member.tenant_id;
    option.textContent="Company "+member.tenant_id.slice(0,8)+" · "+member.role;
    picker.append(option);
   }
   login.parentElement.hidden=true;company.hidden=false;
   message("Select a company to continue.");
   if(eligible.length===1)await onContinue();
  }catch{reset();message("Sign-in failed. Please start again.")}
 }
 return Object.freeze({logout:reset,destroy(){
  reset();login.removeEventListener("click",onLogin);
  proceed.removeEventListener("click",onContinue);
  if(root.contains(main))root.removeChild(main);
 }});
}

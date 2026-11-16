// Single-package HandyOS browser entrypoint. No demo state or AWS keys.
import {mountHandyOsLoginShell} from "./handyos-login-shell.mjs";
const root=document.getElementById("app");
async function start(){
 const res=await fetch("/config.json",{method:"GET",credentials:"omit",cache:"no-store",redirect:"error"});
 if(!res.ok||res.status!==200)throw Error("Cloud configuration unavailable");
 const config=await res.json();
 if(!config||config.uiOrigin!==location.origin||typeof config.apiOrigin!=="string"||
  typeof config.issuerOrigin!=="string"||typeof config.clientId!=="string")throw Error("Invalid cloud configuration");
 await mountHandyOsLoginShell({
  root,config:{uiOrigin:config.uiOrigin,issuerOrigin:config.issuerOrigin,clientId:config.clientId},
  apiOrigin:config.apiOrigin,sessionStorage,cryptoApi:crypto,
  fetcher:fetch.bind(globalThis),put:fetch.bind(globalThis),
  locationUrl:location.href,historyReplace:url=>history.replaceState(null,"",url),
  navigate:url=>location.assign(url)
 });
}
start().catch(()=>{
 root.replaceChildren();
 const p=document.createElement("p");
 p.textContent="HandyOS cloud is not activated. Do not enter real customer or financial information.";
 root.append(p);
});

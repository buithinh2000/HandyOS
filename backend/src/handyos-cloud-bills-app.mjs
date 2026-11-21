import {createHandyOsApiTransport} from "./handyos-cloud-api-transport.mjs";
import {createCloudBillController} from "./receipt-cloud-controller.mjs";
import {mountCloudBills} from "./receipt-cloud-view.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function deny(){throw Error("HandyOS cloud Bills not ready")}
/**
 * Composition for a future separately authenticated HandyOS staging shell.
 * The caller supplies trusted, memory-only dedicated Cognito session handlers.
 * There is intentionally NO implicit startup from owner-v1.html or index.html.
 * No AWS resources are modified and the backend receipt route stays 503
 * until a separately approved isolated S3/DB server workflow is activated.
 */
export async function mountAuthenticatedCloudBills({
 root,session,apiOrigin,uiOrigin,locationOrigin,fetcher,put
}={}){
 if(!root||typeof root.replaceChildren!=="function"||
  typeof put!=="function")deny();
 const authApi=createHandyOsApiTransport({apiOrigin,uiOrigin,locationOrigin,session,fetcher});
 // Neither jobs nor roles come from demo localStorage. Both come from the
 // verified Cognito token + tenant membership server routes.
 const me=await authApi.request({method:"GET",path:"/v1/me"});
 if(!me||!["owner","manager"].includes(me.role)||typeof me.tenant_id!=="string"||
  !UUID.test(me.tenant_id)||me.tenant_id!==await session.tenantId())deny();
 const capabilities=await authApi.request({method:"GET",path:"/v1/bills/capabilities"});
 if(typeof capabilities?.receiptUploadsEnabled!=="boolean")deny();
 const response=await authApi.request({method:"GET",path:"/v1/jobs"});
 if(!Array.isArray(response.jobs)||response.jobs.length>100)deny();
 // Prevent invalid or duplicate job IDs from materializing in the picker.
 const jobs=[],seen=new Set();
 for(const job of response.jobs){
  if(!job||!UUID.test(job.id)||typeof job.name!=="string"||
   job.name.trim().length<1||job.name.length>120||seen.has(job.id))deny();
  seen.add(job.id);
  jobs.push({id:job.id,name:job.name});
 }
 let view;
 const controller=createCloudBillController({authApi,put,notify:event=>view?.setStatus(event.status)});
 view=mountCloudBills({root,controller,jobs,receiptUploadsEnabled:capabilities.receiptUploadsEnabled,listBills:()=>authApi.request({path:"/v1/bills"}),
  updateBill:({billId,kind,json})=>authApi.request({method:"POST",path:"/v1/bills/"+billId+"/"+kind,json}),
  viewReceipt:({jobId,billId})=>authApi.request({path:"/v1/jobs/"+jobId+"/receipts/"+billId+"/media"})});
 return Object.freeze({destroy:()=>view.destroy(),get status(){return controller.status}});
}

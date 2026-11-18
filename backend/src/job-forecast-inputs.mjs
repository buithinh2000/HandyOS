// Tenant-isolated, auditable owner-entered forecast assumptions.
// Not the final profit API: customer receipts and variation approval evidence
// still need independent reconciliation before cloud profitReady can become true.
import {HttpError,ensureUuid} from "./domain.mjs";
import {approvedJobForecast} from "./approved-job-forecast.mjs";
const UUID="/v1/jobs/";
function exact(body){
 const keys=["contractInc","approvedVariationInc","remainingCostsEx","unbookedOverheadEx","taxReservePercent","expectedUpdatedAt"];
 if(!body||typeof body!=="object"||Array.isArray(body)||
    Object.keys(body).some(k=>!keys.includes(k))||
    keys.some(k=>!(k in body)))throw new HttpError(400,"All forecast assumptions and record version required");
 return body;
}
function verified(value,{signed=false}={}){
 if(typeof value!=="number"||!Number.isFinite(value)||Math.abs(value)>100000000||
    !signed&&value<0||Math.abs(Math.round(value*100)-value*100)>0.000001)
  throw new HttpError(400,"Invalid forecast amount");
 return value.toFixed(2);
}
function percent(value){
 if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>100||
    Math.abs(Math.round(value*100)-value*100)>0.000001)
  throw new HttpError(400,"Invalid tax and reserve percent");
 return value.toFixed(2);
}
function response(row,jobId){
 if(!row)return {jobId,recorded:false,confirmed:false,assumptions:null};
 return {jobId,recorded:true,confirmed:row.owner_confirmed_at!==null,
  assumptions:{
   contractInc:row.contract_inc_gst,
   approvedVariationInc:row.approved_variation_inc_gst,
   remainingCostsEx:row.remaining_cost_ex_gst,
   unbookedOverheadEx:row.unbooked_overhead_ex_gst,
   taxReservePercent:row.tax_reserve_percent,
   updatedAt:new Date(row.updated_at).toISOString()
  }};
}
export async function dispatchJobForecastInputs({method,path,ctx,db,readBody}={}){
 const route=/^\/v1\/jobs\/([0-9a-f-]{36})\/financials\/forecast-inputs$/i.exec(path||"");
 if(!route)return null;
 if(!["owner","manager"].includes(ctx?.role))throw new HttpError(403,"Forecast inputs restricted to management");
 const tenant=ensureUuid(ctx.tenant_id),jobId=ensureUuid(route[1]);
 if(!["GET","POST"].includes(method))throw new HttpError(404,"Forecast action not allowed");
 const job=await db.query("select id from jobs where tenant_id=$1 and id=$2",[tenant,jobId]);
 if(job.rowCount!==1)throw new HttpError(404,"Job not found");
 if(method==="GET"){
  const record=await db.query(`select contract_inc_gst,approved_variation_inc_gst,
   remaining_cost_ex_gst,unbooked_overhead_ex_gst,tax_reserve_percent,
   owner_confirmed_at,updated_at from job_forecast_inputs
   where tenant_id=$1 and job_id=$2`,[tenant,jobId]);
  return {forecastInputs:response(record.rows[0],jobId)};
 }
 const body=exact(await readBody());
 const contract=verified(body.contractInc),variation=verified(body.approvedVariationInc,{signed:true});
 const remaining=verified(body.remainingCostsEx),overhead=verified(body.unbookedOverheadEx),
  rate=percent(body.taxReservePercent);
 const dryRun=approvedJobForecast({contractInc:contract,approvedVariationsInc:[variation],
  expensesEx:[],accruedWagesEx:"0.00",weeklyExtrasEx:"0.00",
  remainingCostsEx:remaining,unbookedOverheadEx:overhead,
  taxReservePercent:rate,customerReceivedInc:"0.00"});
 if(!dryRun.profitReady)throw new HttpError(400,"Invalid adjusted contract or forecast assumptions");
 const expected=body.expectedUpdatedAt;
 if(expected!==null&&(typeof expected!=="string"||!Number.isFinite(Date.parse(expected))))
  throw new HttpError(400,"Invalid forecast record version");
 const current=await db.query(`select contract_inc_gst,approved_variation_inc_gst,
  remaining_cost_ex_gst,unbooked_overhead_ex_gst,tax_reserve_percent,
  owner_confirmed_at,updated_at from job_forecast_inputs
  where tenant_id=$1 and job_id=$2 for update`,[tenant,jobId]);
 const args=[tenant,jobId,contract,variation,remaining,overhead,rate];
 let saved;
 if(current.rowCount===0){
  if(expected!==null)throw new HttpError(409,"Forecast created elsewhere. Reload first");
  saved=await db.query(`insert into job_forecast_inputs
   (tenant_id,job_id,contract_inc_gst,approved_variation_inc_gst,
    remaining_cost_ex_gst,unbooked_overhead_ex_gst,tax_reserve_percent,owner_confirmed_at)
   values($1,$2,$3,$4,$5,$6,$7,now())
   on conflict(tenant_id,job_id) do nothing
   returning contract_inc_gst,approved_variation_inc_gst,remaining_cost_ex_gst,
    unbooked_overhead_ex_gst,tax_reserve_percent,owner_confirmed_at,updated_at`,args);
 }else{
  if(expected===null||new Date(expected).toISOString()!==new Date(current.rows[0].updated_at).toISOString())
   throw new HttpError(409,"Forecast updated elsewhere. Reload first");
  saved=await db.query(`update job_forecast_inputs set
    contract_inc_gst=$3,approved_variation_inc_gst=$4,remaining_cost_ex_gst=$5,
    unbooked_overhead_ex_gst=$6,tax_reserve_percent=$7,
    owner_confirmed_at=now(),
    updated_at=greatest(date_trunc('milliseconds',clock_timestamp()),
       date_trunc('milliseconds',updated_at)+interval '1 millisecond')
   where tenant_id=$1 and job_id=$2 and date_trunc('milliseconds',updated_at)=$8::timestamptz
   returning contract_inc_gst,approved_variation_inc_gst,remaining_cost_ex_gst,
    unbooked_overhead_ex_gst,tax_reserve_percent,owner_confirmed_at,updated_at`,
    [...args,new Date(expected).toISOString()]);
 }
 if(saved.rowCount!==1)throw new HttpError(409,"Forecast changed while saving");
 await db.query(`insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id)
  values($1,$2,'confirmed','job_forecast_inputs',$3)`,[tenant,ctx.actorSub,jobId]);
 return {forecastInputs:response(saved.rows[0],jobId)};
}

import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { HttpError,sanitizeText,ensureUuid,parseJSON,taskColumns } from "./domain.mjs";
import {matchReceiptRoute,dispatchReceiptRoute} from "./receipt-http-routes.mjs";
import {sendHandyOsFrontend} from "./frontend-assets.mjs";
import {createHandyOsReceiptRuntime} from "./receipt-runtime.mjs";
import {dispatchDailyCrew} from "./daily-crew.mjs";
import {dispatchWeeklyPayroll} from "./weekly-payroll.mjs";
import {dispatchJobFinancials} from "./job-financials.mjs";
import {dispatchJobForecastInputs} from "./job-forecast-inputs.mjs";
import {dispatchContractReceipts} from "./job-contract-receipts.mjs";
import {dispatchJobReconciliation} from "./job-financial-reconciliation.mjs";
import {listBillsQueue} from "./bills-queue.mjs";
import {dispatchBillsOperation} from "./bills-operations.mjs";

const { Pool } = pg;
const renovationCatalog = JSON.parse(readFileSync(new URL("../../shared/renovation-catalog.json",import.meta.url),"utf8"));
const templateByCode = new Map(renovationCatalog.categories.map(x=>[x.code,x]));
const required = ["DATABASE_URL","COGNITO_USER_POOL_ID","COGNITO_APP_CLIENT_ID","AWS_REGION"];
for (const key of required) if (!process.env[key]) throw new Error("Missing configuration: " + key);
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) throw Error("DATABASE_URL must be PostgreSQL");
// Local-only profile is permitted exclusively for the internal single-host Docker
// network. Postgres has NO host port; remote/production databases still require TLS.
const dbUrl=new URL(process.env.DATABASE_URL);
const localDb=process.env.HANDYOS_DB_MODE==="docker-private"&&
 dbUrl.hostname==="db"&&dbUrl.port==="5432"&&
 dbUrl.pathname==="/handyos"&&
 dbUrl.username==="handyos_runtime"&&
 process.env.DB_CA_PEM===undefined;
if(process.env.HANDYOS_DB_MODE&& !localDb)
 throw Error("HandyOS database mode must match isolated Docker service exactly");
const pool = new Pool({connectionString:process.env.DATABASE_URL,
 ssl: localDb?false:process.env.DB_CA_PEM?{ca:process.env.DB_CA_PEM,rejectUnauthorized:true}:{rejectUnauthorized:true},
 max:5,connectionTimeoutMillis:5000});
const verifier = CognitoJwtVerifier.create({userPoolId:process.env.COGNITO_USER_POOL_ID,clientId:process.env.COGNITO_APP_CLIENT_ID,tokenUse:"access"});
const allowedOrigin = process.env.FRONTEND_ORIGIN || "https://handyos.buitai.com";

function reply(res,status,value,origin){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":origin,"vary":"Origin","x-content-type-options":"nosniff"});res.end(JSON.stringify(value))}
async function body(req){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>100_000)throw new HttpError(413,"Request too large");chunks.push(chunk)}return parseJSON(Buffer.concat(chunks).toString("utf8"))}
async function authenticate(req){
 const match=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||"");
 if(!match)throw new HttpError(401,"Authentication required");
 try {const token=await verifier.verify(match[1]);if(!token.sub)throw Error();return token.sub}
 catch{throw new HttpError(401,"Invalid or expired access token")}
}
async function context(client,sub){
 const {rows}=await client.query("select tenant_id,role from memberships where cognito_sub=$1 and status='active' order by case role when 'owner' then 1 else 2 end,tenant_id limit 100",[sub]);
 if(!rows.length)throw new HttpError(403,"No active company membership");
 // Client MUST explicitly select tenant if the account belongs to more than one company.
 return rows;
}
function chooseTenant(req,memberships){
 const requested=req.headers["x-handyos-tenant"];
 if(requested){ensureUuid(requested);const found=memberships.find(x=>x.tenant_id===requested);if(!found)throw new HttpError(403,"Company access denied");return found}
 if(memberships.length!==1)throw new HttpError(409,"Select company using X-HandyOS-Tenant");
 return memberships[0];
}
async function canAccessJob(client,ctx,sub,jobId,write=false){
 const {rows}=await client.query(
 "select j.id from jobs j where j.id=$1 and j.tenant_id=$2 and ($3::boolean and $4::text in ('owner','manager') or exists (select 1 from job_members jm where jm.tenant_id=j.tenant_id and jm.job_id=j.id and jm.cognito_sub=$5 and jm.access_level=$4))",
 [jobId,ctx.tenant_id,!write,ctx.role,sub]);
 // owner/manager have unconditional job access; job members require matching scoped role.
 if(["owner","manager"].includes(ctx.role)){
   const found=await client.query("select id from jobs where id=$1 and tenant_id=$2",[jobId,ctx.tenant_id]);
   if(found.rowCount)return;
 }
 if(!rows.length)throw new HttpError(404,"Job not found");
}
async function transaction(work){
 const client=await pool.connect();try{await client.query("begin");const result=await work(client);await client.query("commit");return result}catch(err){await client.query("rollback");throw err}finally{client.release()}
}
async function dispatch(req,{receiptWorkflow=null}={}){
 const url=new URL(req.url||"/", "http://localhost");
 const route=matchReceiptRoute(req.method,url.pathname);
 const sub=await authenticate(req);
 if(route){
  // Resolve the selected company via server-verified Cognito membership.
  // Run the receipt workflow only after this short transaction commits.
  // Its PostgreSQL repository separately rechecks active membership and job.
  const identity=await transaction(async client=>{
   await client.query("select set_config('app.actor_sub',$1,true)",[sub]);
   const memberships=await context(client,sub),ctx=chooseTenant(req,memberships);
   return {verifiedByApi:true,actorSub:sub,tenantId:ctx.tenant_id,role:ctx.role};
  });
  return await dispatchReceiptRoute({route,identity,workflow:receiptWorkflow,readBody:()=>body(req)});
 }
 return transaction(async client=>{
  await client.query("select set_config('app.actor_sub',$1,true)",[sub]);
  const memberships=await context(client,sub);
  // Initial company picker: scoped to verified Cognito sub and active membership.
  // Never trust a browser-supplied tenant as authority.
  if(req.method==="GET"&&url.pathname==="/v1/companies")
   return {companies:memberships.filter(m=>["owner","manager"].includes(m.role))
    .map(m=>({tenant_id:m.tenant_id,role:m.role}))};
  const ctx=chooseTenant(req,memberships);
  await client.query("select set_config('app.tenant_id',$1,true)",[ctx.tenant_id]);
  // Role is obtained from verified Cognito membership, never from a browser header.
  await client.query("select set_config('app.actor_role',$1,true)",[ctx.role]);
  if(/^\/v1\/(staff|attendance)(?:\/|$)/.test(url.pathname)){
   return dispatchDailyCrew({method:req.method,path:url.pathname,query:url.searchParams,
    ctx:{...ctx,actorSub:sub},db:client,readBody:()=>body(req)});
  }
  if(/^\/v1\/payroll(?:\/|$)/.test(url.pathname)){
   return dispatchWeeklyPayroll({method:req.method,path:url.pathname,query:url.searchParams,
    ctx:{...ctx,actorSub:sub},db:client,readBody:()=>body(req)});
  }
  if(/^\/v1\/jobs\/[^/]+\/financials\/reconciliation$/.test(url.pathname)){
   return dispatchJobReconciliation({method:req.method,path:url.pathname,ctx,db:client});
  }
  if(/^\/v1\/jobs\/[^/]+\/financials\/contract-receipts$/.test(url.pathname)){
   return dispatchContractReceipts({method:req.method,path:url.pathname,
    ctx:{...ctx,actorSub:sub},db:client,readBody:()=>body(req)});
  }
  if(/^\/v1\/jobs\/[^/]+\/financials\/forecast-inputs$/.test(url.pathname)){
   return dispatchJobForecastInputs({method:req.method,path:url.pathname,
    ctx:{...ctx,actorSub:sub},db:client,readBody:()=>body(req)});
  }
  if(/^\/v1\/jobs\/[^/]+\/financials(?:\/|$)/.test(url.pathname)){
   return dispatchJobFinancials({method:req.method,path:url.pathname,
    ctx:{...ctx,actorSub:sub},db:client,readBody:()=>body(req)});
  }
  if(req.method==="GET"&&url.pathname==="/v1/bills")return listBillsQueue({db:client,ctx});
  if(/^\/v1\/bills\//.test(url.pathname))return dispatchBillsOperation({method:req.method,path:url.pathname,ctx:{...ctx,actorSub:sub},db:client,readBody:()=>body(req)});
  if(req.method==="GET"&&url.pathname==="/v1/me")return{tenant_id:ctx.tenant_id,role:ctx.role,actor_id:sub};
  if(req.method==="GET"&&url.pathname==="/v1/renovation-catalog")return renovationCatalog;
  if(req.method==="GET"&&url.pathname==="/v1/jobs"){
   if(["owner","manager"].includes(ctx.role)){
    const q=await client.query("select id,name,code,stage,notes,created_at from jobs where tenant_id=$1 order by created_at desc limit 100",[ctx.tenant_id]);return{jobs:q.rows}
   }
   const q=await client.query("select j.id,j.name,j.code,j.stage,j.created_at from jobs j join job_members jm on jm.job_id=j.id and jm.tenant_id=j.tenant_id where j.tenant_id=$1 and jm.cognito_sub=$2 and jm.access_level=$3 order by j.created_at desc limit 100",[ctx.tenant_id,sub,ctx.role]);
   return{jobs:q.rows}
  }
  if(req.method==="POST"&&url.pathname==="/v1/jobs"){
   if(!["owner","manager"].includes(ctx.role))throw new HttpError(403,"Not permitted");
   const data=await body(req);
   const name=sanitizeText(data.name),code=typeof data.code==="string"?data.code.slice(0,60):"";
   const categories=Array.isArray(data.category_codes)?data.category_codes:[];
   if(categories.length>21||categories.some(c=>typeof c!=="string"||!templateByCode.has(c)))throw new HttpError(400,"Invalid renovation categories");
   const chosen=[...new Set(categories)];
   const id=randomUUID();
   await client.query("insert into jobs(id,tenant_id,name,code) values($1,$2,$3,$4)",[id,ctx.tenant_id,name,code]);
   let taskCount=0;
   for(const [position,templateCode] of chosen.entries()){
    const template=templateByCode.get(templateCode),categoryId=randomUUID();
    await client.query("insert into work_categories(id,tenant_id,job_id,name,position) values($1,$2,$3,$4,$5)",[categoryId,ctx.tenant_id,id,template.name,position]);
    for(const [index,title] of template.tasks.entries()){
     await client.query("insert into tasks(id,tenant_id,job_id,category_id,title,position) values($1,$2,$3,$4,$5,$6)",[randomUUID(),ctx.tenant_id,id,categoryId,title,index]);
     taskCount++;
    }
   }
   await client.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'created','job',$3)",[ctx.tenant_id,sub,id]);
   return {job:{id,name,code,stage:"survey"},categories:chosen.length,tasks_created:taskCount}
  }
  const match=/^\/v1\/jobs\/([^/]+)\/tasks$/.exec(url.pathname);
  if(match){
   const jobId=ensureUuid(match[1]);
   if(req.method==="GET"){
    await canAccessJob(client,ctx,sub,jobId);
    // Homeowners must NOT see internal labour rates, unit costs, private notes, or assignments.
    const fields=taskColumns(ctx.role);
    const q=await client.query("select "+fields+" from tasks where tenant_id=$1 and job_id=$2"+(ctx.role==="homeowner"?" and client_visible=true":"")+" order by position,created_at limit 500",[ctx.tenant_id,jobId]);
    return{tasks:q.rows}
   }
   if(req.method==="POST"){
    if(!["owner","manager"].includes(ctx.role))throw new HttpError(403,"Not permitted");
    await canAccessJob(client,ctx,sub,jobId,true);
    const d=await body(req),title=sanitizeText(d.title);
    const id=randomUUID();
    await client.query("insert into tasks(id,tenant_id,job_id,title,notes,status,qty,unit,unit_cost_ex_gst) values($1,$2,$3,$4,$5,'todo',1,'item',0)",[id,ctx.tenant_id,jobId,title,typeof d.notes==="string"?d.notes.slice(0,4000):""]);
    await client.query("insert into audit_events(tenant_id,actor_sub,action,entity_type,entity_id) values($1,$2,'created','task',$3)",[ctx.tenant_id,sub,id]);
    return{task:{id,title,status:"todo"}}
   }
  }
  throw new HttpError(404,"Route not found");
 });
}
export function createHandler({receiptWorkflow=null}={}){
 return async(req,res)=>{
  // Only a fixed public UI asset allowlist may bypass Cognito.
  // Every /v1/ business route still runs through JWT and tenant RLS.
  if(sendHandyOsFrontend(req,res))return;
  const origin=req.headers.origin||"";
  const allowed=origin===allowedOrigin;
  if(req.method==="OPTIONS"){
   res.writeHead(allowed?204:403,allowed?{"access-control-allow-origin":allowedOrigin,"access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"authorization, content-type, x-handyos-tenant","vary":"Origin"}:{});res.end();return
  }
  if(origin && !allowed){reply(res,403,{error:"Origin denied"},allowedOrigin);return}
  if(req.url==="/healthz"){reply(res,200,{status:"ok"},allowedOrigin);return}
  try{const value=await dispatch(req,{receiptWorkflow});reply(res,req.method==="POST"?201:200,value,allowedOrigin)}
  catch(err){const status=err instanceof HttpError?err.status:500;if(status===500)console.error("Internal API error",err?.name||"Error");reply(res,status,{error:status===500?"Internal server error":err.message},allowedOrigin)}
 };
}
if(process.argv[1] && import.meta.url===new URL("file://"+process.argv[1]).href){
 // Runtime composition is explicit; without approved isolated resources,
 // receipt routes continue returning 503 rather than fake cloud persistence.
 createHandyOsReceiptRuntime({env:process.env,pool}).then(runtime=>{
  const server=http.createServer(createHandler({receiptWorkflow:runtime.workflow}));
  const shutdown=()=>server.close(()=>{runtime.close();pool.end().catch(()=>{});});
  process.once("SIGTERM",shutdown);process.once("SIGINT",shutdown);
  server.listen(Number(process.env.PORT)||8080,"0.0.0.0",
   ()=>console.log("HandyOS API listening; receipts:",runtime.enabled?"enabled":"disabled"));
 }).catch(()=>{console.error("HandyOS receipt runtime activation blocked");process.exitCode=1;pool.end().catch(()=>{});});
}

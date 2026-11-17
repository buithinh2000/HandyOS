import test from "node:test";
import assert from "node:assert/strict";
import {dispatchDailyCrew} from "../src/daily-crew.mjs";
const tenant="11111111-1111-4111-8111-111111111111";
const staff="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",job="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const entry="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ctx={tenant_id:tenant,role:"owner",actorSub:"synthetic-owner-cognito-sub"};
const stamp=new Date("2026-11-17T08:00:00+11:00");
function setup(response=()=>({rowCount:1,rows:[{id:entry,staff_id:staff,job_id:job,rate_unit:"day",rate_snapshot:"250.00"}]})){
 const calls=[];return {calls,db:{query:async(text,values)=>{calls.push({text,values});return response(text,values)}}};
}
async function route(db,path,method="GET",data,role="owner"){
 return dispatchDailyCrew({db,method,path,query:new URLSearchParams("date=2026-11-17"),ctx:{...ctx,role},
  readBody:async()=>data,now:()=>stamp});
}
test("Owner sees staff roster only under selected verified tenant",async()=>{
 const {db,calls}=setup(()=>({rows:[{id:staff,display_name:"Sam",default_rate:"250.00"}]}));
 const result=await route(db,"/v1/staff");
 assert.equal(result.staff[0].display_name,"Sam");
 assert.deepEqual(calls[0].values,[tenant]);
 await assert.rejects(route(db,"/v1/staff","GET",undefined,"worker"),e=>e.status===403);
});
test("create staff uses validated daily/hourly rates and writes an audit event",async()=>{
 const {db,calls}=setup();
 const result=await route(db,"/v1/staff","POST",{displayName:" Sam ",wageUnit:"day",defaultRate:250,roleLabel:"Carpenter"});
 assert.equal(result.staff.display_name,"Sam");
 assert.equal(result.staff.default_rate,250);
 assert.ok(calls[0].text.includes("insert into staff_profiles"));
 assert.equal(calls[0].values[1],tenant);
 assert.ok(calls[1].text.includes("audit_events"));
 for(const bad of [{displayName:"A",wageUnit:"day",defaultRate:-1},
  {displayName:"A",wageUnit:"month",defaultRate:200},
  {displayName:"A",wageUnit:"day",defaultRate:"200"},
  {displayName:"A",wageUnit:"day",defaultRate:10,role:"owner"}]){
  const r=setup();await assert.rejects(route(r.db,"/v1/staff","POST",bad),e=>e.status===400);
  assert.equal(r.calls.length,0);
 }
});
test("daily attendance list returns tenant-filtered entries by exact valid day",async()=>{
 const {db,calls}=setup(()=>({rows:[{id:entry,staff_id:staff,work_date:"2026-11-17"}]}));
 const result=await route(db,"/v1/attendance");
 assert.equal(result.attendance.length,1);
 assert.deepEqual(calls[0].values,[tenant,"2026-11-17"]);
 const r=setup();
 await assert.rejects(dispatchDailyCrew({db:r.db,method:"GET",path:"/v1/attendance",
  query:new URLSearchParams("date=2026-02-30"),ctx}),e=>e.status===400);
 assert.equal(r.calls.length,0);
});
test("check in creates one entry using staff wage snapshot, job existence and trusted server time",async()=>{
 const {db,calls}=setup((text)=>{
  if(text.includes("from staff_profiles"))return{rowCount:1,rows:[{id:staff,wage_unit:"day",default_rate:"250.00"}]};
  if(text.includes("from jobs"))return{rowCount:1,rows:[{id:job}]};
  if(text.includes("from attendance_entries"))return{rowCount:0,rows:[]};
  return{rowCount:1,rows:[{id:entry,rate_unit:"day",rate_snapshot:"250.00"}]};
 });
 const result=await route(db,"/v1/attendance/check-in","POST",
  {jobId:job,staffId:staff,workDate:"2026-11-17"});
 assert.equal(result.entry.rate_snapshot,"250.00");
 const insertion=calls.find(c=>c.text.includes("insert into attendance_entries"));
 assert.ok(insertion);
 assert.deepEqual(insertion.values.slice(1,5),[tenant,job,staff,"2026-11-17"]);
 assert.equal(insertion.values[5],stamp.toISOString());
 assert.equal(insertion.values[6],"day");
 assert.equal(insertion.values[7],"250.00");
 assert.ok(calls.some(c=>c.text.includes("'checked_in'")));
});
test("check in refuses duplicates, closed jobs and inactive staff without recording payroll twice",async()=>{
 const body={jobId:job,staffId:staff,workDate:"2026-11-17"};
 for(const failAt of ["staff","job","duplicate"]){
  const {db,calls}=setup((text)=>{
   if(text.includes("from staff_profiles"))return{rowCount:failAt==="staff"?0:1,rows:[{wage_unit:"day",default_rate:250}]};
   if(text.includes("from jobs"))return{rowCount:failAt==="job"?0:1,rows:[{id:job}]};
   if(text.includes("from attendance_entries"))return{rowCount:failAt==="duplicate"?1:0,rows:[{id:entry}]};
   throw Error("No financial insert allowed");
  });
  await assert.rejects(route(db,"/v1/attendance/check-in","POST",body),e=>e.status=== (failAt==="duplicate"?409:404));
  assert.ok(!calls.some(c=>c.text.includes("insert into attendance_entries")));
 }
});
test("check out only an existing unclosed entry and records audit once",async()=>{
 const {db,calls}=setup();
 const result=await route(db,"/v1/attendance/"+entry+"/check-out","POST",{});
 assert.equal(result.entry.id,entry);
 assert.equal(calls[0].values[0],stamp.toISOString());
 assert.deepEqual(calls[0].values.slice(1),[tenant,entry]);
 assert.ok(calls[0].text.includes("finished_at is null"));
 assert.ok(calls[1].text.includes("'checked_out'"));
 const failed=setup(()=>({rowCount:0,rows:[]}));
 await assert.rejects(route(failed.db,"/v1/attendance/"+entry+"/check-out","POST",{}),e=>e.status===409);
 assert.equal(failed.calls.length,1);
});
test("reject foreign tenant and malformed job/staff/body before SQL",async()=>{
 const {db,calls}=setup();
 await assert.rejects(route(db,"/v1/attendance/check-in","POST",{jobId:"x",staffId:staff,workDate:"2026-11-17"}),e=>e.status===400);
 await assert.rejects(route(db,"/v1/attendance/check-in","POST",{jobId:job,staffId:staff,workDate:"2026-11-17",rate:50000}),e=>e.status===400);
 await assert.rejects(route(db,"/v1/attendance/"+entry+"/check-out","POST",{rate:0}),e=>e.status===400);
 await assert.rejects(route(db,"/v1/staff","GET",null,"homeowner"),e=>e.status===403);
 assert.equal(calls.length,0);
});

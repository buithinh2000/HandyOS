import test from "node:test";
import assert from "node:assert/strict";
import {sanitizeText,ensureUuid,parseJSON,allowedRole,taskColumns,HttpError} from "../src/domain.mjs";

test("rejects blank and oversized job/task names",()=>{
 assert.throws(()=>sanitizeText(" "),HttpError);
 assert.throws(()=>sanitizeText("x".repeat(201)),HttpError);
 assert.equal(sanitizeText("  Shower screen  "),"Shower screen");
});
test("accepts only canonical UUID-shaped identifiers",()=>{
 assert.throws(()=>ensureUuid("';drop table jobs;--"),HttpError);
 assert.equal(ensureUuid("f14c6f73-20bf-4e7f-95ab-862067c9af68"),"f14c6f73-20bf-4e7f-95ab-862067c9af68");
});
test("rejects non-object JSON payloads",()=>{
 for(const body of ["not json","[]","null","4","true"])assert.throws(()=>parseJSON(body),HttpError);
 assert.deepEqual(parseJSON('{"name":"Restumping"}'),{name:"Restumping"});
});
test("workers and homeowner cannot write business records",()=>{
 for(const role of ["worker","homeowner"]){
  assert.equal(allowedRole(role,"write"),false);
  assert.equal(allowedRole(role,"read"),true);
  assert.doesNotMatch(taskColumns(role),/unit_cost|notes|qty|assigned_to/);
 }
 for(const role of ["owner","manager"]){
  assert.equal(allowedRole(role,"write"),true);
  assert.match(taskColumns(role),/unit_cost_ex_gst/);
 }
});

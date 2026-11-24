import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../src/handyos-payroll-view.mjs",import.meta.url),"utf8");
test("financial write acknowledgement stays distinct from display refresh",()=>{
 const start=source.indexOf(" const onSave=async(evt,action)=>{");
 const end=source.indexOf(" const updateBonusPeriod=()=>",start);
 assert.ok(start>0&&end>start);
 const handler=source.slice(start,end);
 assert.match(handler,/confirmed=true;report=result\.payroll/);
 assert.match(handler,/if\(!confirmed\)return/);
 assert.match(handler,/Save not confirmed\. Check the payroll record before retrying/);
 assert.match(handler,/Entry saved on server, but payroll could not refresh/);
 assert.ok(handler.indexOf("if(!confirmed)return")<handler.indexOf("await load()"));
 assert.ok(handler.indexOf("confirmed=true")<handler.indexOf("form.reset()"));
});
test("payroll loader reports refresh failure without claiming the save failed",()=>{
 const start=source.indexOf(" async function load(){");
 const end=source.indexOf(" async function loadRules(){",start);
 const loader=source.slice(start,end);
 assert.match(loader,/return true/);
 assert.match(loader,/return false/);
 assert.match(source,/if\(refreshed\)say/);
});
test("closed payroll week confirmation remains separate from UI refresh",()=>{
 const start=source.indexOf(" const onClose=async()=>{");
 const end=source.indexOf(" async function onCreateEmployee(",start);
 const handler=source.slice(start,end);
 assert.match(handler,/confirmed=true;report=result\.payroll/);
 assert.match(handler,/Payroll week closed on server/);
 assert.match(handler,/if\(!confirmed\)/);
 assert.match(handler,/if\(await load\(\)\)/);
});

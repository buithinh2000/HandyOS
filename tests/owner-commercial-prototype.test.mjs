import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const html=readFileSync(new URL("../design/handyos-commercial-prototype.html",import.meta.url),"utf8");
test("prototype script remains parseable and explicitly carries synthetic-only banner",()=>{
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,"missing concept script");
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.match(html,/PRODUCT DESIGN PROTOTYPE/);
 assert.match(html,/No real data/);
 assert.doesNotMatch(script,/localStorage|fetch\(|XMLHttpRequest|indexedDB|sendBeacon/);
});
test("five canonical IA destinations and key daily workflows remain available in prototype",()=>{
 for(const name of ["Today","Jobs","People","Money","More"])assert.match(html,new RegExp("\\b"+name+"\\b"));
 for(const feature of ["Check in","Check out","Capture material receipt","Weekly pay","Outstanding","Not sent","Reimbursed"])assert.ok(html.includes(feature),feature);
});
test("product design docs define story IDs and strict commercial readiness review",()=>{
 const p=readFileSync(new URL("../docs/COMMERCIAL-PRODUCT-BLUEPRINT.md",import.meta.url),"utf8");
 const d=readFileSync(new URL("../docs/COMMERCIAL-DESIGN-SYSTEM.md",import.meta.url),"utf8");
 const g=readFileSync(new URL("../docs/COMMERCIAL-REVIEW-GATE.md",import.meta.url),"utf8");
 for(const id of ["US-01","US-02","US-03","US-04","US-05","US-06"])assert.ok(p.includes(id),id);
 for(const required of ["390px","44","AWS","timesheet"])assert.match(p+"\n"+d+"\n"+g,new RegExp(required,"i"));
});

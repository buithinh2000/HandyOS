import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../workspace.html",import.meta.url),"utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test("workspace script is present",()=>assert.ok(script && script.length>10000));
test("renovation catalogue lists complete key trades",()=>{
 for(const trade of ["Restumping","Subfloor","Hybrid flooring","Laminate flooring","Carpet","Tiles","Room partition","Bathroom","Toilet","Laundry","Ceiling","Roof","Window","Kitchen","Bar / mini kitchen"]){
  assert.ok(html.includes(trade),"Missing "+trade);
 }
});
function bootstrap(){
 const elements=new Map(),stored=new Map();
 const element=id=>{
  if(!elements.has(id))elements.set(id,{id,value:"",innerHTML:"",textContent:"",onclick:null,onchange:null});
  return elements.get(id);
 };
 const context={document:{getElementById:element,addEventListener(){},createElement(){return {click(){}}}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},Intl,Math,Date,JSON,Number,String,Array,Set,Map,Error,Blob:class{},URL:{createObjectURL:()=>"",revokeObjectURL(){}},setTimeout(){},confirm:()=>true,alert:()=>{},prompt:()=>null,window:{print(){}},console};
 vm.runInNewContext(script,context);
 return {context,element,stored};
}
test("create job persists a unified record",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Sample bathroom";element("code").value="DEMO-1";element("create").onclick();
 const db=JSON.parse(stored.get("handyos-workspace-v07"));
 assert.equal(db.jobs.length,1);assert.equal(db.jobs[0].name,"Sample bathroom");
 assert.deepEqual(db.jobs[0].tasks,[]);
});
test("selecting bathroom creates task checklist with correct parent group",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Sample bathroom";element("create").onclick();
 element("categories").onclick({target:{closest:()=>({dataset:{category:"Bathroom"}})}});
 const db=JSON.parse(stored.get("handyos-workspace-v07")),j=db.jobs[0];
 assert.ok(j.tasks.some(t=>t.title==="Shower screen"));
 assert.ok(j.tasks.some(t=>t.title==="Vanity"));
 assert.ok(j.tasks.every(t=>t.group==="Bathroom"));
});
test("costs and payments are stored under same job",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Sample job";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"cost"}})}});
 element("expenseTitle").value="Tiles";element("expenseKind").value="material";element("expenseAmount").value="245.50";
 element("body").onclick({target:{closest:()=>({id:"addExpense",dataset:{}})}});
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"payment"}})}});
 element("paymentRef").value="Progress claim 1";element("paymentAmount").value="1000";element("paymentStatus").value="received";
 element("body").onclick({target:{closest:()=>({id:"addPayment",dataset:{}})}});
 const j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.expenses[0].amount,245.5);assert.equal(j.payments[0].amount,1000);
});

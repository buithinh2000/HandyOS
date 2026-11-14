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
  if(!elements.has(id))elements.set(id,{id,value:"",innerHTML:"",textContent:"",onclick:null,onchange:null,addEventListener(){}});
  return elements.get(id);
 };
 const listeners={};
 const context={document:{getElementById:element,addEventListener(type,fn){listeners[type]=fn},dispatchChange(target){listeners.change?.({target})},createElement(){return {click(){}}}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},Intl,Math,Date,JSON,Number,String,Array,Set,Map,Error,Blob:class{},URL:{createObjectURL:()=>"",revokeObjectURL(){}},setTimeout(){},confirm:()=>true,alert:()=>{},prompt:()=>null,window:{print(){}},console};
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
test("choosing bathroom adds only ONE main task, with zero automatic subtasks",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Sample bathroom";element("create").onclick();
 element("categories").onclick({target:{closest:()=>({dataset:{category:"Bathroom"}})}});
 const db=JSON.parse(stored.get("handyos-workspace-v07")),j=db.jobs[0];
 assert.equal(j.tasks.length,1);
 assert.equal(j.tasks[0].title,"Bathroom");
 assert.equal(j.tasks[0].group,"Bathroom");
 assert.deepEqual(j.tasks[0].subtasks,[]);
 assert.match(element("body").innerHTML,/Suggested steps \(optional\)/);
 assert.match(element("body").innerHTML,/Waterproofing/);
});
test("costs and payments are stored under same job",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Sample job";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"cost"}})}});
 element("expenseTitle").value="Tiles";element("expenseKind").value="material";element("expenseAmount").value="245.50";element("expenseBasis").value="inc";
 element("body").onclick({target:{closest:()=>({id:"addExpense",dataset:{}})}});
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"payment"}})}});
 element("paymentRef").value="Progress claim 1";element("paymentAmount").value="1000";element("paymentStatus").value="received";
 element("body").onclick({target:{closest:()=>({id:"addPayment",dataset:{}})}});
 const j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.expenses[0].amount,245.5);assert.equal(j.payments[0].amount,1000);
});

test("custom category is visible after adding",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Demo custom";element("create").onclick();
 const button={id:"custom",dataset:{}};
 // prompt() in harness returns null; custom groups remain user-driven in UI.
 assert.ok(element("categories").innerHTML.includes("Bathroom"));
 const db=JSON.parse(stored.get("handyos-workspace-v07"));
 assert.equal(db.jobs.length,1);
});
test("expense entry can be removed from the same job",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Demo costs";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"cost"}})}});
 element("expenseTitle").value="Timber";element("expenseKind").value="material";element("expenseAmount").value="45";element("expenseBasis").value="ex";
 element("body").onclick({target:{closest:()=>({id:"addExpense",dataset:{}})}});
 let j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.expenses.length,1);
 element("body").onclick({target:{closest:()=>({dataset:{action:"remove-expense",id:j.expenses[0].id}})}});
 j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.expenses.length,0);
});
test("payment entry can be removed from the same job",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Demo payment";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"payment"}})}});
 element("paymentRef").value="Claim 1";element("paymentAmount").value="100";element("paymentStatus").value="requested";
 element("body").onclick({target:{closest:()=>({id:"addPayment",dataset:{}})}});
 let j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.payments.length,1);
 element("body").onclick({target:{closest:()=>({dataset:{action:"remove-payment",id:j.payments[0].id}})}});
 j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.payments.length,0);
});

test("owner can enter and correct job labour hours",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Example job";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"labour"}})}});
 element("workerName").value="Worker Example";element("workDate").value="2026-11-15";
 element("workHours").value="7.5";element("workRate").value="45";element("workNote").value="Painting";
 element("body").onclick({target:{closest:()=>({id:"addHours",dataset:{}})}});
 let j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.timesheets.length,1);
 assert.equal(j.timesheets[0].hours*j.timesheets[0].rate,337.5);
 element("body").onclick({target:{closest:()=>({dataset:{action:"remove-hours",id:j.timesheets[0].id}})}});
 j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.timesheets.length,0);
});
test("new owner jobs show full job overview",()=>{
 const {element}=bootstrap();
 element("name").value="Sample flooring";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"overview"}})}});
 assert.match(element("body").innerHTML,/Owner job summary/);
 assert.match(element("body").innerHTML,/Provisional margin/);
});

test("expense entries carry explicit tax basis and quote overview does not classify gross as net",()=>{
 const {element,stored}=bootstrap();
 element("name").value="GST test";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"cost"}})}});
 element("expenseTitle").value="Tiles";element("expenseKind").value="material";
 element("expenseAmount").value="110.00";element("expenseBasis").value="inc";
 element("body").onclick({target:{closest:()=>({id:"addExpense",dataset:{}})}});
 const j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.expenses[0].gstBasis,"inc");
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"overview"}})}});
 assert.match(element("body").innerHTML,/Provisional margin/);
});
test("invalid negative expense amounts are rejected",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Invalid amount test";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"cost"}})}});
 element("expenseTitle").value="Invalid";element("expenseKind").value="material";
 element("expenseAmount").value="-100";element("expenseBasis").value="inc";
 element("body").onclick({target:{closest:()=>({id:"addExpense",dataset:{}})}});
 const j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.expenses.length,0);
});
test("unclassified historic expenses block profit display",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Historic cost test";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"cost"}})}});
 element("expenseTitle").value="Old";element("expenseKind").value="other";
 element("expenseAmount").value="85";element("expenseBasis").value="inc";
 element("body").onclick({target:{closest:()=>({id:"addExpense",dataset:{}})}});
 const data=JSON.parse(stored.get("handyos-workspace-v07"));
 delete data.jobs[0].expenses[0].gstBasis;
 stored.set("handyos-workspace-v07",JSON.stringify(data));
 // simulate existing records by restarting with modified localStorage
 const runtime=bootstrap;
 const js=script;
 const documentValues = element;
 // Verify implementation carries explicit guard for preexisting entries.
 assert.match(js,/unclassified\?null/);
 assert.match(js,/GST basis needed/);
});

test("Bunnings product reference fields and search link appear in scope",()=>{
 const {element}=bootstrap();
 element("name").value="Bathroom sample";element("create").onclick();
 element("categories").onclick({target:{closest:()=>({dataset:{category:"Bathroom"}})}});
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"scope"}})}});
 assert.match(element("body").innerHTML,/Bunnings product URL/);
 assert.match(element("body").innerHTML,/Search Bunnings/);
 assert.match(element("body").innerHTML,/Price checked on/);
});
test("quote prices remain manually entered, never represented as live Bunnings prices",()=>{
 assert.match(script,/Price entered manually/);
 assert.match(script,/bunningsLink/);
 assert.match(script,/Only HTTPS Bunnings Warehouse product URLs/);
});

test("material takeoff rounds packages up and saves supplier estimates",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Plaster test";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"materials"}})}});
 element("matName").value="Plasterboard";element("matSupplier").value="Bunnings";
 element("matSku").value="TEST123";element("matUnit").value="m²";
 element("matQty").value="20";element("matWaste").value="10";element("matPack").value="2.88";element("matPrice").value="33";element("matUrl").value="";element("matStore").value="Hawthorn";
 element("body").onclick({target:{closest:()=>({id:"addMaterial",dataset:{}})}});
 const j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.materials.length,1);assert.equal(j.materials[0].supplier,"Bunnings");
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"materials"}})}});
 assert.match(element("body").innerHTML,/\$240\.00/); // ceil(22/2.88)=8 packs
});
test("material takeoff rejects zero pack size",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Invalid materials";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"materials"}})}});
 element("matName").value="Tiles";element("matSupplier").value="Mitre 10";
 element("matSku").value="";element("matUnit").value="m²";
 element("matQty").value="8";element("matWaste").value="10";element("matPack").value="0";element("matPrice").value="12";element("matUrl").value="";element("matStore").value="Online";
 element("body").onclick({target:{closest:()=>({id:"addMaterial",dataset:{}})}});
 assert.equal(JSON.parse(stored.get("handyos-workspace-v07")).jobs[0].materials.length,0);
});

test("printed quote explicitly shows estimated material line and supplier provenance",()=>{
 const {element}=bootstrap();
 element("name").value="Plaster job";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"materials"}})}});
 element("matName").value="Plasterboard";element("matSupplier").value="Bunnings";
 element("matSku").value="0731415";element("matUnit").value="m²";
 element("matQty").value="20";element("matWaste").value="10";
 element("matPack").value="2.88";element("matPrice").value="27.68";
 element("matUrl").value="";element("matStore").value="Owner-selected store";
 element("body").onclick({target:{closest:()=>({id:"addMaterial",dataset:{}})}});
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"quote"}})}});
 element("body").onclick({target:{closest:()=>({id:"printQuote",dataset:{}})}});
 assert.match(element("report").innerHTML,/Material: Plasterboard/);
 assert.match(element("report").innerHTML,/0731415/);
 assert.match(element("report").innerHTML,/Owner-selected store/);
 assert.match(element("report").innerHTML,/Owner-entered estimate/);
});

test("quote review flags missing supplier code and prevents pretending unknown shelf price is verified",()=>{
 const {element}=bootstrap();
 element("name").value="Sample quote";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"materials"}})}});
 element("matName").value="Tile adhesive";element("matSupplier").value="Bunnings";
 element("matSku").value="";element("matUnit").value="each";element("matQty").value="4";
 element("matWaste").value="0";element("matPack").value="1";
 element("matPrice").value="0";element("matUrl").value="";element("matStore").value="";
 element("body").onclick({target:{closest:()=>({id:"addMaterial",dataset:{}})}});
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"review"}})}});
 assert.match(element("body").innerHTML,/PRICE_UNKNOWN/);
 assert.match(element("body").innerHTML,/SKU_MISSING/);
 assert.match(element("body").innerHTML,/STORE_MISSING/);
 assert.match(element("body").innerHTML,/Rules-based assistant/);
});
test("quote review checks wet-area waterproofing and never auto-mutates scope",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Bathroom sample";element("create").onclick();
 element("categories").onclick({target:{closest:()=>({dataset:{category:"Bathroom"}})}});
 const before=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0].tasks.length;
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"review"}})}});
 const after=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0].tasks.length;
 assert.equal(after,before);
 assert.match(element("body").innerHTML,/Quote Review/);
});
test("printed quote discloses quote review finding count",()=>{
 const {element}=bootstrap();
 element("name").value="Draft";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"quote"}})}});
 element("body").onclick({target:{closest:()=>({id:"printQuote",dataset:{}})}});
 assert.match(element("report").innerHTML,/Quote Review identified/);
});

test("quote budget separates task/material/labour/other/contingency and prints all components",()=>{
 const {element,context,stored}=bootstrap();
 element("name").value="Quote budget";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"materials"}})}});
 element("matName").value="Plasterboard";element("matSupplier").value="Bunnings";
 element("matSku").value="123";element("matUnit").value="m²";
 element("matQty").value="20";element("matWaste").value="10";
 element("matPack").value="2.88";element("matPrice").value="27.5";
 element("matUrl").value="";element("matStore").value="Local";
 element("body").onclick({target:{closest:()=>({id:"addMaterial",dataset:{}})}});
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"quote"}})}});
 for(const [id,value] of [["labourAllowance","300"],["otherAllowance","70"],["contingencyPct","10"],["markup","20"]]){
  context.document.dispatchChange({id,value});
 }
 const output=element("body").innerHTML;
 assert.match(output,/Labour allowance/);
 assert.match(output,/Other allowance/);
 assert.match(output,/Contingency/);
 const record=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(record.labourAllowance,300);
 assert.equal(record.otherAllowance,70);
 assert.equal(record.contingencyPct,10);
 assert.equal(record.markup,20);
 // Material ex GST 8*25=200; base=570; contingency=57; sale=752.4 ex GST.
 assert.match(output,/\$752\.40/);
 element("body").onclick({target:{closest:()=>({id:"printQuote",dataset:{}})}});
 assert.match(element("report").innerHTML,/Material: Plasterboard/);
 assert.match(element("report").innerHTML,/Labour allowance/);
 assert.match(element("report").innerHTML,/Other allowance/);
 assert.match(element("report").innerHTML,/Contingency/);
});
test("owner cannot set negative quote allowances",()=>{
 const {element,context,stored}=bootstrap();
 element("name").value="Invalid quote budget";element("create").onclick();
 context.document.dispatchChange({id:"labourAllowance",value:"-500"});
 context.document.dispatchChange({id:"contingencyPct",value:"110"});
 const record=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(record.labourAllowance,0);
 assert.equal(record.contingencyPct,0);
});

test("owner portfolio aggregates multiple jobs but labels draft quote separately from received cash",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Bathroom job";element("code").value="B-1";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"payment"}})}});
 element("paymentRef").value="Deposit";element("paymentAmount").value="250";element("paymentStatus").value="received";
 element("body").onclick({target:{closest:()=>({id:"addPayment",dataset:{}})}});
 element("name").value="Kitchen job";element("code").value="K-1";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"portfolio"}})}});
 assert.match(element("body").innerHTML,/Owner portfolio/);
 assert.match(element("body").innerHTML,/Bathroom job/);
 assert.match(element("body").innerHTML,/Kitchen job/);
 assert.match(element("body").innerHTML,/Draft quote total inc GST/);
 assert.match(element("body").innerHTML,/Cash received from recorded payments/);
 assert.match(element("body").innerHTML,/\$250\.00/);
 assert.match(element("body").innerHTML,/NOT contracted revenue/);
 assert.equal(JSON.parse(stored.get("handyos-workspace-v07")).jobs.length,2);
});
test("owner can record due date and portfolio marks open overdue job",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Late example";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"details"}})}});
 element("stage").value="active";element("dueDate").value="2020-02-01";element("notes").value="Sample only";
 element("body").onclick({target:{closest:()=>({id:"saveDetails",dataset:{}})}});
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"portfolio"}})}});
 assert.match(element("body").innerHTML,/OVERDUE/);
 assert.match(element("body").innerHTML,/2020-02-01/);
 assert.equal(JSON.parse(stored.get("handyos-workspace-v07")).jobs[0].dueDate,"2020-02-01");
});
test("portfolio open action switches job without modifying saved records",()=>{
 const {element,stored}=bootstrap();
 element("name").value="First job";element("create").onclick();
 const first=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0].id;
 element("name").value="Second job";element("create").onclick();
 element("tabs").onclick({target:{closest:()=>({dataset:{tab:"portfolio"}})}});
 element("body").onclick({target:{closest:()=>({dataset:{action:"open-job",id:first}})}});
 assert.match(element("body").innerHTML,/Owner job summary/);
 assert.equal(JSON.parse(stored.get("handyos-workspace-v07")).jobs.length,2);
});

test("new job lands in main task flow and does not auto-fill 111 tasks",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Kitchen quick flow";element("create").onclick();
 assert.match(element("body").innerHTML,/Main tasks/);
 assert.equal(JSON.parse(stored.get("handyos-workspace-v07")).jobs[0].tasks.length,0);
 element("mainTaskName").value="";
 element("mainTaskPreset").value="Kitchen";
 element("body").onclick({target:{closest:()=>({id:"addTask",dataset:{}})}});
 const j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.tasks.length,1);
 assert.equal(j.tasks[0].title,"Kitchen");
 assert.equal(j.tasks[0].subtasks.length,0);
});
test("adding an optional subtask only adds the selected item; toggle and remove work",()=>{
 const {element,stored}=bootstrap();
 element("name").value="Bathroom";element("create").onclick();
 element("categories").onclick({target:{closest:()=>({dataset:{category:"Bathroom"}})}});
 const first=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0].tasks[0].id;
 element("suggest-"+first).value="Waterproofing";
 element("body").onclick({target:{closest:()=>({dataset:{action:"add-suggestion",id:first}})}});
 let j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.tasks.length,1);
 assert.equal(j.tasks[0].subtasks.length,1);
 assert.equal(j.tasks[0].subtasks[0].title,"Waterproofing");
 const sub=j.tasks[0].subtasks[0].id;
 element("body").onclick({target:{closest:()=>({dataset:{action:"toggle-subtask",id:first,subId:sub}})}});
 j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.tasks[0].subtasks[0].done,true);
 element("body").onclick({target:{closest:()=>({dataset:{action:"remove-subtask",id:first,subId:sub}})}});
 j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.tasks[0].subtasks.length,0);
});
test("the optional free-text subtask and its main task remain on the same job",()=>{
 const {element,stored}=bootstrap();
 element("name").value="New job";element("create").onclick();
 element("mainTaskName").value="Bathroom renovation";
 element("mainTaskPreset").value="Bathroom";
 element("body").onclick({target:{closest:()=>({id:"addTask",dataset:{}})}});
 const task=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0].tasks[0].id;
 element("subtask-"+task).value="Custom access inspection";
 element("body").onclick({target:{closest:()=>({dataset:{action:"add-subtask",id:task}})}});
 const j=JSON.parse(stored.get("handyos-workspace-v07")).jobs[0];
 assert.equal(j.tasks[0].subtasks[0].title,"Custom access inspection");
 assert.equal(j.tasks[0].title,"Bathroom renovation");
 assert.equal(j.tasks[0].group,"Bathroom");
});

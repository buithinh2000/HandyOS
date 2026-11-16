// Playwright browser proof for the isolated cloud Bills form with fake API.
// No Cognito, S3, AWS credentials, real bills, or localStorage writes.
import {chromium} from "playwright";
import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const moduleSource=readFileSync("backend/src/receipt-cloud-view.mjs");
const server=createServer((req,res)=>{
 if(req.url==="/receipt-cloud-view.mjs"){res.writeHead(200,{"content-type":"text/javascript"});res.end(moduleSource);return}
 res.writeHead(200,{"content-type":"text/html"});
 res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="cloudBills"></main></body></html>');
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:820}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:"+server.address().port+"/");
  await page.evaluate(async()=>{
   const {mountCloudBills}=await import("/receipt-cloud-view.mjs");
   window.record=[];
   const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
   window.view=mountCloudBills({root:document.querySelector("#cloudBills"),
    jobs:[{id,name:"Bathroom <img src=x onerror=alert(1)>"}],
    controller:{async save(input){
     window.record.push({jobId:input.jobId,details:input.details,fileSize:input.file.size});
     return {id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",status:"draft",mediaReady:true};
    }}
   });
  });
  assert.equal(await page.locator("img").count(),0,"job names must use textContent");
  assert.equal(await page.locator('select[name="jobId"] option').count(),2);
  await page.locator('[type="submit"]').click();
  assert.match(await page.locator('[role="status"]').innerText(),/Choose a job/);
  await page.locator('select[name="jobId"]').selectOption("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  await page.locator('[name="boughtOn"]').fill("2026-11-16");
  assert.equal(await page.locator('[name="storeSelect"]').inputValue(),"Bunnings");
  assert.equal(await page.locator('[data-custom-store]').isVisible(),false);
  await page.locator('[name="storeSelect"]').selectOption("other");
  assert.equal(await page.locator('[data-custom-store]').isVisible(),true);
  await page.locator('[name="storeReference"]').fill("Local Hardware");
  await page.locator('[name="storeSelect"]').selectOption("Mitre 10");
  assert.equal(await page.locator('[data-custom-store]').isVisible(),false);
  await page.locator('[name="amountGross"]').fill("250.75");
  await page.locator('[name="file"]').setInputFiles({name:"synthetic.jpg",mimeType:"image/jpeg",buffer:Buffer.alloc(1024,1)});
  await page.locator('[type="submit"]').click();
  assert.match(await page.locator('[role="status"]').innerText(),/Bill saved securely/);
  const records=await page.evaluate(()=>window.record);
  assert.equal(records.length,1);
  assert.equal(records[0].details.amountGross,250.75);
  assert.equal(records[0].details.storeReference,"Mitre 10");
  assert.equal(records[0].fileSize,1024);
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,"mobile horizontal overflow");
  assert.deepEqual(errors,[]);
  await page.close();
 }
}finally{await browser?.close();server.close()}

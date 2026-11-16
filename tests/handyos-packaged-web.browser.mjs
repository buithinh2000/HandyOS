// Offline HTTPS-stub browser smoke for packaged HandyOS entrypoint.
// This tests the actual web/boot.mjs and static asset allowlist, no AWS calls.
import {chromium} from "playwright";
import assert from "node:assert/strict";
import {frontendRoute} from "../backend/src/frontend-assets.mjs";
const ui="https://staging.handyos.buitai.com";
const approved={
 HANDYOS_UI_ORIGIN:ui,
 HANDYOS_API_ORIGIN:"https://api-staging.handyos.buitai.com",
 HANDYOS_COGNITO_DOMAIN:"https://handyos-staging.auth.ap-southeast-1.amazoncognito.com",
 HANDYOS_COGNITO_CLIENT_ID:"handyosclient12345"
};
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,1280]){
  for(const configured of [true,false]){
   const page=await browser.newPage({viewport:{width,height:840},serviceWorkers:"block"});
   const errors=[];
   page.on("pageerror",error=>errors.push(error.message));
   await page.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==ui)return route.abort();
    const result=frontendRoute(url.pathname,route.request().method(),configured?approved:{});
    if(!result)return route.abort();
    return route.fulfill({status:result.status,headers:result.headers,body:result.body});
   });
   await page.goto(ui+"/");
   if(configured){
    await page.locator("[data-login]").waitFor();
    assert.equal(await page.locator("[data-login]").isVisible(),true);
    assert.match(await page.locator("h1").innerText(),/HandyOS/);
    assert.equal(await page.locator("[data-bills]").isVisible(),false);
   }else{
    await page.getByText(/cloud is not activated/i).waitFor();
    assert.equal(await page.locator("[data-login]").count(),0);
    assert.equal(await page.locator("[data-bills]").count(),0);
   }
   assert.equal(await page.evaluate(()=>localStorage.length),0);
   assert.equal(await page.evaluate(()=>sessionStorage.length),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }
}finally{await browser?.close()}
console.log("HandyOS packaged web entry browser PASS: 390px/1280px, configured and fail-closed");

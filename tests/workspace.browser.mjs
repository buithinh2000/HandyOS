import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";

const file = readFileSync(resolve("workspace.html"));
const server = createServer((req, res) => {
  if ((req.url || "").split("?")[0] === "/workspace.html") {
    res.writeHead(200, {"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
    res.end(file);
  } else { res.writeHead(404); res.end("Not found"); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/workspace.html`;
const results = [];
mkdirSync("artifacts/browser", {recursive:true});
let browser;
try {
  browser = await chromium.launch({headless:true});
  for(const width of [390, 768, 1280]) {
    const page = await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
    const errors=[];
    page.on("pageerror", err => errors.push(err.message));
    await page.goto(url, {waitUntil:"load"});
    await assertPageNoHorizontalOverflow(page, "empty state "+width);
    await page.locator("#name").fill("Browser QA bathroom "+width);
    await page.locator("#create").click();
    assert.equal(await page.locator("#body h2").first().textContent(), "Main tasks");
    await page.locator("#mainTaskName").fill("Bathroom refurbishment");
    await page.locator("#mainTaskPreset").selectOption("Bathroom");
    await page.locator("#addTask").click();
    assert.equal(await page.locator("#body section.task").count(),1,"Exactly one main task, no auto-generated template tasks");
    const addSubtask=page.locator("#body .subtask-editor > summary").first();
    await addSubtask.click();
    await page.locator('[id^="subtask-"]').fill("Waterproofing");
    await page.locator('[data-action="add-subtask"]').click();
    assert.match(await page.locator(".subtasks").innerText(),/Waterproofing/);
    await page.locator('#journey [data-step="materials"]').click();
    await page.locator("#matName").fill("Gyprock RE 2400 x 1200 x 10mm");
    await page.locator("#matSku").fill("0731415");
    await page.locator("#matQty").fill("20");
    await page.locator("#matPack").fill("2.88");
    await page.locator("#matPrice").fill("27.68"); // owner-supplied test fixture, not a live-price claim
    await page.locator(".optional-fields > summary").click();
    await page.locator("#matUnit").selectOption("m²");
    await page.locator("#matStore").fill("Owner-selected store");
    await page.locator("#addMaterial").click();
    assert.match(await page.locator("#body").innerText(),/Material estimate/);
    assert.match(await page.locator("#body").innerText(),/\$201\.31/);
    await assertPageNoHorizontalOverflow(page, "materials "+width);
    await page.screenshot({path:join("artifacts/browser",`materials-${width}.png`),fullPage:true});
    await page.locator('#journey [data-step="quote"]').click();
    assert.match(await page.locator("#body").innerText(),/Estimate \/ quote/);
    await assertPageNoHorizontalOverflow(page, "quote "+width);
    await page.screenshot({path:join("artifacts/browser",`quote-${width}.png`),fullPage:true});
    await page.locator('#journey [data-step="review"]').click();
    assert.match(await page.locator("#body").innerText(),/Quote Review/);
    assert.deepEqual(errors,[],"No uncaught page JS errors");
    await assertPageNoHorizontalOverflow(page, "review "+width);
    results.push({width,journey:"PASS",pageErrors:errors.length});
    await page.close();
  }
  console.log("BROWSER_QA_PASS", JSON.stringify(results));
} finally {
  if(browser)await browser.close();
  await new Promise(done=>server.close(done));
}

async function assertPageNoHorizontalOverflow(page, stage) {
 const sizes=await page.evaluate(()=>({
   doc:document.documentElement.scrollWidth,
   viewport:window.innerWidth,
   body:document.body.scrollWidth
 }));
 assert.ok(sizes.doc<=sizes.viewport+2,`Horizontal overflow at ${stage}: ${JSON.stringify(sizes)}`);
}

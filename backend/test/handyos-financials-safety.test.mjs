import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {melbourneToday} from "../src/handyos-business-date.mjs";
const ui=readFileSync(new URL("../src/handyos-financials-view.mjs",import.meta.url),"utf8");
test("Financials never labels unapproved EX-GST reserve calculation as approved fund",()=>{
 assert.match(ui,/Tax & reserve fund \(approved INC-GST basis\)/);
 assert.match(ui,/NOT READY — verify adjusted contract/);
 assert.doesNotMatch(ui,/Tax & reserve — preliminary/);
 assert.doesNotMatch(ui,/money\(r\.totals\.reserveAllocation\)/);
 assert.match(ui,/r\.profitReady===true&&r\.provisional===false/);
});
test("Financial transaction dates default to Melbourne workday",()=>{
 assert.match(ui,/import \{melbourneToday\}/);
 assert.match(ui,/const localDate=melbourneToday/);
 assert.equal(melbourneToday(new Date("2026-11-22T13:30:00Z")),"2026-11-23");
});

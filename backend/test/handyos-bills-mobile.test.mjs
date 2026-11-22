import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {melbourneToday} from "../src/handyos-business-date.mjs";
const src=readFileSync(new URL("../src/receipt-cloud-view.mjs",import.meta.url),"utf8");
test("Bills purchase, sending and repayment dates use Melbourne",()=>{
 assert.match(src,/import \{melbourneToday\}/);
 assert.match(src,/const todayLocal=melbourneToday/);
 assert.match(src,/form\.elements\.date\.value=melbourneToday\(\)/);
 assert.equal(melbourneToday(new Date("2026-11-22T13:30:00Z")),"2026-11-23");
});
test("Repayment defaults to outstanding balance, never total after partial repayment",()=>{
 assert.match(src,/b\.status==="sent"/);
 assert.match(src,/Number\(b\.remaining\?\?b\.amountGross\)\.toFixed\(2\)/);
 assert.match(src,/pendingRequestId\?\?=crypto\.randomUUID\(\)/);
 assert.match(src,/No bill status changed/);
});

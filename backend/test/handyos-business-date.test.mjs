import test from "node:test";
import assert from "node:assert/strict";
import {melbourneToday,melbourneCurrentMonday} from "../src/handyos-business-date.mjs";
test("Melbourne date does not depend on viewer timezone",()=>{
 assert.equal(melbourneToday(new Date("2026-11-22T13:30:00Z")),"2026-11-23");
 assert.equal(melbourneToday(new Date("2026-11-22T12:30:00Z")),"2026-11-22");
 assert.equal(melbourneCurrentMonday(new Date("2026-11-22T13:30:00Z")),"2026-11-23");
 assert.equal(melbourneCurrentMonday(new Date("2026-11-22T12:30:00Z")),"2026-11-16");
});
test("Melbourne spring and autumn DST business dates",()=>{
 assert.equal(melbourneToday(new Date("2026-10-03T14:30:00Z")),"2026-10-04");
 assert.equal(melbourneToday(new Date("2026-04-04T15:30:00Z")),"2026-04-05");
 assert.equal(melbourneCurrentMonday(new Date("2026-04-04T15:30:00Z")),"2026-03-30");
});

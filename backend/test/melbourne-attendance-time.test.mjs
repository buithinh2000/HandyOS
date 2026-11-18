import test from "node:test";
import assert from "node:assert/strict";
import {melbourneDateTimeISO} from "../src/handyos-today-view.mjs";
test("Melbourne work clock ignores a visitor's device timezone",()=>{
 assert.equal(melbourneDateTimeISO("2026-11-17","08:00"),"2026-11-16T21:00:00.000Z");
 assert.equal(melbourneDateTimeISO("2026-07-17","08:00"),"2026-07-16T22:00:00.000Z");
 assert.equal(melbourneDateTimeISO("2026-11-17","16:00"),"2026-11-17T05:00:00.000Z");
});
test("Daylight saving spring gap and autumn repeated hour cannot silently alter wages",()=>{
 assert.throws(()=>melbourneDateTimeISO("2026-10-04","02:30"),/daylight saving/);
 assert.throws(()=>melbourneDateTimeISO("2026-04-05","02:30"),/daylight saving/);
 assert.equal(melbourneDateTimeISO("2026-10-04","03:30"),"2026-10-03T16:30:00.000Z");
 assert.equal(melbourneDateTimeISO("2026-04-05","03:30"),"2026-04-04T17:30:00.000Z");
});
test("Reject invalid Melbourne date and time input",()=>{
 for(const [day,time] of [["2026-02-30","08:00"],["2026-13-01","08:00"],
  ["2026-11-18","25:00"],["2026-11-18","09:61"],["2026-11-18","9:00"]])
  assert.throws(()=>melbourneDateTimeISO(day,time));
});

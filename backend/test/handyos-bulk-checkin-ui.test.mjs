import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../src/handyos-today-view.mjs",import.meta.url),"utf8");
test("Today defaults available crew to selected and uses one button for all",()=>{
 assert.match(ui,/All active employees selected by default/);
 assert.match(ui,/firstDraw\|\|selected\.has\(employee\.id\)/);
 assert.match(ui,/data-select-all/);
 assert.match(ui,/data-select-none/);
 assert.match(ui,/Check in selected crew/);
 assert.match(ui,/path:"\/v1\/attendance\/check-in-batch"/);
 assert.match(ui,/staffIds:ids/);
 assert.doesNotMatch(ui,/Check in employee/);
});
test("Already-recorded employees cannot be checked in twice from default selection",()=>{
 assert.match(ui,/new Set\(attendanceForDay\.map\(item=>item\.staff_id\)\)/);
 assert.match(ui,/check\.disabled=recorded\.has\(employee\.id\)/);
 assert.match(ui,/check\.checked=!check\.disabled/);
 assert.match(ui,/ids\.length\+" employees checked in/);
});
test("Historical workday still uses one staff member to backfill precisely",()=>{
 assert.match(ui,/pastStaff\.hidden=!past/);
 assert.match(ui,/crewPicker\.hidden=past\|\|future/);
 assert.match(ui,/path:"\/v1\/attendance\/backfill"/);
});

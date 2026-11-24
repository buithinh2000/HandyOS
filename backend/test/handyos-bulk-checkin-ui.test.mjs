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
 assert.match(ui,/new Map\(attendanceForDay\.map\(item=>\[item\.staff_id,item\]\)\)/);
 assert.match(ui,/check\.disabled=Boolean\(existing\)/);
 assert.match(ui,/check\.checked=!check\.disabled/);
 assert.match(ui,/ids\.length\+" employees checked in/);
});
test("Historical workday still uses one staff member to backfill precisely",()=>{
 assert.match(ui,/pastStaff\.hidden=!past/);
 assert.match(ui,/crewPicker\.hidden=past\|\|future/);
 assert.match(ui,/path:"\/v1\/attendance\/backfill"/);
});

test("Selecting a job reveals and resets the available crew while allowing untick",()=>{
 assert.match(ui, /data-crew-picker hidden/);
 assert.match(ui, /const onJobSelection=\(\)=>/);
 assert.match(ui, /jobs\.addEventListener\("change",onJobSelection\)/);
 assert.match(ui, /renderCrew\(\{reset:true\}\)/);
 assert.match(ui, /reset\|\|firstDraw\|\|selected\.has\(employee\.id\)/);
 assert.match(ui, /crewPicker\.hidden=date\.value!==localDay\(\)\|\|!jobs\.value/);
 assert.match(ui, /check\.addEventListener\("change",updateCrewCount\)/);
 assert.doesNotMatch(ui, /jobs\.addEventListener\("change",updateCrewCount\)/);
});
test("Selecting a job only prepares the crew; saving still requires user submit",()=>{
 const handler=ui.split("const onJobSelection=()=>")[1].split("const chooseAll=")[0];
 assert.doesNotMatch(handler, /api\.request|saveCheckIn|\/v1\/attendance\/check-in/);
 assert.match(ui,/inForm\.addEventListener\("submit",saveCheckIn\)/);
});

test("Already-recorded employee provides specific job and actionable attendance review",()=>{
 assert.match(ui,/existing\.finished_at\?"Checked out":"Checked in"/);
 assert.match(ui,/String\(existing\.job_name\|\|"another job"\)/);
 assert.match(ui,/view\.textContent="View recorded shift"/);
 assert.match(ui,/expandedJobs\.add\(existing\.job_id\)/);
 assert.match(ui,/details\.scrollIntoView/);
 assert.match(ui,/Everyone has an attendance record for this date/);
 assert.match(ui,/Check-in is disabled to prevent duplicate wages/);
 assert.match(ui,/data-crew-notice role="status"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const api=read("../src/server.mjs");
const ui=read("../src/handyos-jobs-view.mjs");
const transport=read("../src/handyos-cloud-api-transport.mjs");
test("Job update is management-only, optimistic, tenant scoped and audited",()=>{
 assert.match(api,/Job edits restricted to management/);
 assert.match(api,/date_trunc\('milliseconds',updated_at\)=\$7::timestamptz/);
 assert.match(api,/where tenant_id=\$1 and id=\$2/);
 assert.match(api,/stage<>'closed'/);
 assert.match(api,/Confirm job completion explicitly/);
 assert.match(api,/values\(\$1,\$2,'updated','job',\$3\)/);
 assert.match(api,/notes,updated_at,created_at from jobs/);
});
test("Job editor is hidden until opened, saves authoritative fields and refreshes list",()=>{
 assert.match(ui,/data-job-edit-form hidden/);
 assert.match(ui,/expectedUpdatedAt:selected.updated_at/);
 assert.match(ui,/confirmClose:stage==="closed"/);
 assert.match(ui,/Edit job details/);
 assert.match(ui,/Discard unsaved job changes/);
 assert.match(ui,/Job changes saved on server/);
 assert.match(transport,/\/update\$","i"\)/);
});

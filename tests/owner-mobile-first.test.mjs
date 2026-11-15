import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../owner-v1.html",import.meta.url),"utf8");

test("mobile layout prioritizes touch targets, thumb navigation and safe-area spacing",()=>{
 assert.match(html,/position:fixed;bottom:0;left:0;right:0/);
 assert.match(html,/env\(safe-area-inset-bottom,0px\)/);
 assert.match(html,/\.nav button\{min-width:0;min-height:48px/);
 assert.match(html,/input,select,button\{min-height:44px;font-size:16px\}/);
});
test("daily shortcuts route to existing attendance and bill flows without fake check-ins",()=>{
 assert.match(html,/id="quickAttendance"/);
 assert.match(html,/if\(b\.id==="quickAttendance"\)\{/);
 assert.match(html,/id="quickBill"/);
 assert.match(html,/if\(b\.id==="quickBill"\)\{billEditorOpen=true/);
 assert.match(html,/id="billPhoto" type="file" accept="image\/\*" capture="environment"/);
 assert.match(html,/Browser-only demo/);
});

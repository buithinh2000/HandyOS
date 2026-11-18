import test from "node:test";
import assert from "node:assert/strict";
import {customerBillMessage} from "../src/receipt-cloud-view.mjs";
const bill={jobName:"Echuca Renovation",storeReference:"Bunnings",boughtOn:"2026-11-18",
 amountGross:"350.00",remaining:"250.00",status:"sent"};
test("customer message contains outstanding reimbursement but never private credentials or URLs",()=>{
 const message=customerBillMessage({...bill,receiptUrl:"https://private.example/?X-Amz-Signature=secret",
  tenantId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",token:"super-secret"});
 assert.match(message,/Echuca Renovation/);
 assert.match(message,/Bunnings/);
 assert.match(message,/AUD \$350\.00/);
 assert.match(message,/AUD \$250\.00/);
 assert.match(message,/attach the original receipt separately/);
 assert.doesNotMatch(message,/X-Amz|private\.example|super-secret|aaaaaaaa-aaaa/);
});
test("sanitize imported store/job names, reject non-finite amounts",()=>{
 const message=customerBillMessage({...bill,jobName:"Bathroom\r\nfake note",
  storeReference:"Hardware\tShop"});
 assert.match(message,/Bathroom fake note/);
 assert.match(message,/Hardware Shop/);
 assert.doesNotMatch(message,/fake note\n/);
 for(const invalid of [NaN,Infinity,-3,"unavailable"]){
  assert.throws(()=>customerBillMessage({...bill,remaining:invalid}));
 }
});

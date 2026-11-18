import test from "node:test";
import assert from "node:assert/strict";
import {isSafeReceiptView} from "../src/receipt-cloud-view.mjs";
const tenant="11111111-1111-4111-8111-111111111111";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bill="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const object="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const url="https://handyos-receipts-staging-916004827349.s3.ap-southeast-1.amazonaws.com/"+
 "tenants/"+tenant+"/jobs/"+job+"/receipts/"+bill+"/"+object+".jpg"+
 "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=test%2F20261118%2Fap-southeast-1%2Fs3%2Faws4_request"+
 "&X-Amz-Date=20261118T010000Z&X-Amz-Expires=180&X-Amz-Signature=synthetic";
test("Owner private receipt link requires correct S3 bucket, bill, job and short signature",()=>{
 assert.equal(isSafeReceiptView(url,job,bill),true);
 assert.equal(isSafeReceiptView(url,job,tenant),false);
 assert.equal(isSafeReceiptView(url,tenant,bill),false);
 assert.equal(isSafeReceiptView(url.replace(".jpg",".pdf"),job,bill),true);
});
test("Reject unsigned, expired, lookalike host, cross-job or injected private receipt URLs",()=>{
 for(const other of [
  url.replace("X-Amz-Expires=180","X-Amz-Expires=3600"),
  url.replace("X-Amz-Expires=180","X-Amz-Expires=0"),
  url.replace("&X-Amz-Signature=synthetic",""),
  url.replace("handyos-receipts-staging-916004827349","other-app-staging"),
  url.replace("amazonaws.com","amazonaws.com.evil.com"),
  url.replace("https:","http:"),
  url.replace("/jobs/"+job,"/jobs/"+tenant),
  url.replace("/receipts/"+bill,"/receipts/"+tenant),
  url.replace(".jpg",".exe"),
  url+"#secret",
  url.replace("X-Amz-Algorithm=AWS4-HMAC-SHA256","X-Amz-Algorithm=none")
 ])assert.equal(isSafeReceiptView(other,job,bill),false,other);
});

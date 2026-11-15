import test from "node:test";
import assert from "node:assert/strict";
import {createOwnerSyncClient,reconcileOwnerLedger,OwnerSyncError} from "../cloud/owner-sync-client.mjs";

const endpoint="https://api.handyos.example/owner-ledger";
const rev1='"0123456789abcdef0123456789abcdef"';
const rev2='"abcdef0123456789abcdef0123456789"';
const ledger=()=>({jobs:[{id:"job-1",name:"Demo",stage:"active",contract:11000,expenses:[],timesheets:[],payments:[],workerPayments:[]}],staff:[{id:"emp-1",name:"Alex",role:"Carpenter",rate:50}],payrollSettlements:[]});
const reply=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
const make=(fn,token="private-test-token")=>createOwnerSyncClient({endpoint,accessToken:async()=>token,fetchImpl:fn});
const expectCode=async(p,code)=>assert.rejects(p,e=>e instanceof OwnerSyncError&&e.code===code);

test("requires HTTPS exact endpoint; rejects embedded credentials and query",()=>{
 for(const url of ["http://api.handyos.example/owner-ledger","https://u:p@api.handyos.example/owner-ledger","https://api.handyos.example/owner-ledger?token=secret","https://api.handyos.example/private"]){
  assert.throws(()=>createOwnerSyncClient({endpoint:url,accessToken:()=>""}),e=>e.code==="configuration");
 }
});
test("no owner token means no network access",async()=>{
 let count=0;
 const client=make(async()=>{count++;return reply(200,{state:null,revision:null})},"");
 await expectCode(client.load(),"authentication");
 assert.equal(count,0);
});
test("cloud load requires revision and validates remote ledger before displaying",async()=>{
 const client=make(async()=>reply(200,{state:ledger(),revision:rev1}));
 const result=await client.load();
 assert.equal(result.state.jobs[0].id,"job-1");
 assert.equal(result.revision,rev1);
 await expectCode(make(async()=>reply(200,{state:ledger(),revision:"invalid"})).load(),"protocol");
 await expectCode(make(async()=>reply(200,{state:{jobs:"not array"},revision:rev1})).load(),"protocol");
 await expectCode(make(async()=>reply(200,{state:null,revision:rev1})).load(),"protocol");
 const empty=await make(async()=>reply(200,{state:null,revision:null})).load();
 assert.deepEqual(empty,{state:null,revision:null});
});
test("cloud save requires explicit Owner confirmation before any network request",async()=>{
 let calls=0;
 const client=make(async()=>{calls++;return reply(200,{saved:true,revision:rev1})});
 await expectCode(client.save(ledger(),{revision:null}),"confirmation");
 await expectCode(client.save(ledger(),{revision:undefined,confirmed:true}),"protocol");
 assert.equal(calls,0);
});
test("first-time save uses If-None-Match and no cookies or browser credentials",async()=>{
 let captured;
 const client=make(async(url,options)=>{captured={url,options};return reply(200,{saved:true,revision:rev1,savedAt:"2026-11-15T01:00:00Z"})});
 const result=await client.save(ledger(),{revision:null,confirmed:true});
 assert.equal(result.revision,rev1);
 assert.equal(captured.options.headers["if-none-match"],"*");
 assert.equal(captured.options.headers.authorization,"Bearer private-test-token");
 assert.equal(captured.options.credentials,"omit");
 assert.equal(captured.options.cache,"no-store");
 assert.equal(captured.options.redirect,"error");
 assert.equal(captured.url,endpoint);
 assert.equal(JSON.parse(captured.options.body).staff[0].name,"Alex");
});
test("next save only uses If-Match on precise revision",async()=>{
 let captured;
 const client=make(async(_url,opts)=>{captured=opts;return reply(200,{saved:true,revision:rev2})});
 assert.equal((await client.save(ledger(),{revision:rev1,confirmed:true})).revision,rev2);
 assert.equal(captured.headers["if-match"],rev1);
 assert.equal(captured.headers["if-none-match"],undefined);
});
test("stale revision 409 never retries or silently overwrites cloud data",async()=>{
 let calls=0;
 const client=make(async()=>{calls++;return reply(409,{error:"Conflict"})});
 await expectCode(client.save(ledger(),{revision:rev1,confirmed:true}),"conflict");
 assert.equal(calls,1);
});
test("auth errors, network failure, malformed responses fail closed",async()=>{
 await expectCode(make(async()=>reply(401,{error:"expired"})).load(),"authentication");
 await expectCode(make(async()=>{throw Error("SECRET")}).load(),"network");
 await expectCode(make(async()=>({status:200,ok:true,json:async()=>{throw Error("token")}})).load(),"protocol");
 await expectCode(make(async()=>reply(200,{saved:false,revision:rev1})).save(ledger(),{revision:null,confirmed:true}),"protocol");
});
test("local and remote ledgers reconcile only by explicit choice, never by silent merge",()=>{
 const x=ledger();
 assert.equal(reconcileOwnerLedger(x,null).kind,"cloud-empty");
 assert.equal(reconcileOwnerLedger(x,x).kind,"identical");
 const changed=ledger();changed.jobs[0].contract=12000;
 const result=reconcileOwnerLedger(x,changed);
 assert.equal(result.kind,"different");
 assert.equal(result.requiresConfirmation,true);
 assert.equal(result.local.jobs[0].contract,11000);
 assert.equal(result.remote.jobs[0].contract,12000);
});
test("no automatic upload when remote ledger differs from local",async()=>{
 let writes=0;
 const client=make(async(_url,o)=>{if(o.method==="PUT")writes++;return reply(200,{state:ledger(),revision:rev1})});
 const cloud=await client.load(),changed=ledger();changed.jobs[0].contract=12300;
 const state=reconcileOwnerLedger(changed,cloud.state);
 assert.equal(state.kind,"different");
 assert.equal(writes,0);
});

// Synthetic PostgreSQL integration test. Runs ONLY in GitHub CI PostgreSQL 17.
// No cloud credentials, no customer data, no AWS writes.
import assert from "node:assert/strict";
import pg from "pg";
import {createPostgresReceiptRepository} from "../src/receipt-postgres-repository.mjs";

const original=new pg.Pool({host:process.env.PGHOST||"localhost",port:Number(process.env.PGPORT||5432),
 user:process.env.PGUSER||"postgres",password:process.env.PGPASSWORD,
 database:process.env.PGDATABASE||"handyos_ci",max:2});
const tenant="11111111-1111-4111-8111-111111111111";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const objectId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const key=`tenants/${tenant}/jobs/${job}/receipts/${id}/${objectId}.jpg`;
// The repository runs under restricted handyos_runtime role inside each
// transaction even though CI's setup account owns the test schema.
const restricted={
 async connect(){
  const client=await original.connect();
  return {
   async query(sql,args){const result=await client.query(sql,args);
    if(sql==="begin")await client.query("set local role handyos_runtime");
    return result},
   release(){client.release()}
  };
 }
};
const repository=createPostgresReceiptRepository({pool:restricted});
const auth={verifiedByApi:true,actorSub:"user-aaaa-123456",tenantId:tenant};
const payload={id,tenantId:tenant,jobId:job,objectId,objectKey:key,contentType:"image/jpeg",contentLength:2000,
 boughtOn:"2026-11-16",storeReference:"Bunnings Synthetic",amountGross:350.25,gstBasis:"inc",notes:"Test-only"};

try {
 const ctx=await repository.authorizeOwnerJob(auth,job);
 assert.equal(ctx.role,"owner");
 assert.equal(ctx.tenantId,tenant);
 await assert.rejects(repository.authorizeOwnerJob({...auth,actorSub:"unknown-sub"},job),/membership/);
 await assert.rejects(repository.authorizeOwnerJob({...auth,tenantId:"22222222-2222-4222-8222-222222222222"},job),/membership/);
 await repository.reserveUpload(ctx,payload);
 const pending=await repository.findPending(ctx,id);
 assert.equal(pending.objectKey,key);
 assert.equal(Number(pending.amountGross),350.25);
 const none=await original.query("select count(*)::int as n from material_reimbursements where id=$1",[id]);
 assert.equal(none.rows[0].n,0,"an upload request is not a bill");
 await assert.rejects(repository.commitVerified(ctx,pending,{verified:true,objectKey:key,contentType:"image/jpeg",byteLength:999}),/Verified/);
 const ready=await repository.commitVerified(ctx,pending,{verified:true,objectKey:key,contentType:"image/jpeg",byteLength:2000});
 assert.deepEqual(ready,{id,jobId:job});
 assert.equal(await repository.findPending(ctx,id),null);
 const actual=await repository.findReady(ctx,id);
 assert.equal(actual.objectKey,key);
 await assert.rejects(repository.commitVerified(ctx,pending,{verified:true,objectKey:key,contentType:"image/jpeg",byteLength:2000}),/already committed/);
 const settled=await original.query("select count(*)::int as n from material_reimbursements where id=$1",[id]);
 assert.equal(settled.rows[0].n,1,"retries must not create duplicate reimbursement");
 const audits=await original.query("select count(*)::int as n from audit_events where entity_id=$1 and entity_type='material_reimbursement'",[id]);
 assert.equal(audits.rows[0].n,1,"single audit event for actual committed bill");
 // This receipt is pass-through and is not a contract progress payment or cost entry.
 const costs=await original.query("select count(*)::int as n from cost_entries where job_id=$1",[job]);
 const claims=await original.query("select count(*)::int as n from progress_claims where job_id=$1",[job]);
 assert.equal(costs.rows[0].n,0);assert.equal(claims.rows[0].n,0);
 console.log("RECEIPT_POSTGRES_ATOMIC_COMMIT_PASS");
}finally{
 // Delete CI-only synthetic rows under setup role; never run in a real DB.
 await original.query("delete from audit_events where entity_id=$1 and entity_type='material_reimbursement'",[id]);
 await original.query("delete from material_reimbursements where id=$1",[id]);
 await original.query("delete from receipt_upload_intents where id=$1",[id]);
 await original.end();
}

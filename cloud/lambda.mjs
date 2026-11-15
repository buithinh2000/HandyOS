// AWS Lambda entrypoint for a private Owner-only API Gateway HTTP API.
// Package @aws-sdk/client-s3 at build time, with no API keys in browser/source.
import {S3Client,ListObjectsV2Command,GetObjectCommand,PutObjectCommand} from "@aws-sdk/client-s3";
import {createOwnerLedgerApi} from "./owner-api.mjs";

const env=process.env;
const client=new S3Client({});
const bucket=env.HANDYOS_LEDGER_BUCKET;
if(!bucket)throw new Error("HANDYOS_LEDGER_BUCKET required");
function objectKey(sub){
 if(typeof sub!=="string"||!/^[a-zA-Z0-9_-]{10,128}$/.test(sub))
  throw new Error("Invalid owner subject");
 return "owners/"+sub+"/ledger.json";
}
const storage={
 async read(sub){
  try{
   const key=objectKey(sub);
   // Exact-key existence probe: avoids S3 GetObject returning ambiguous 403 on first use.
   // ListBucket is restricted by IAM to this one exact prefix.
   const listing=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:key,MaxKeys:1}));
   if(!(listing.Contents||[]).some(x=>x.Key===key))return null;
   const res=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
   return {data:await res.Body.transformToString("utf-8"),etag:res.ETag};
  }catch(e){if(e?.name==="NoSuchKey"||e?.$metadata?.httpStatusCode===404)return null;throw e}
 },
 async write(sub,data,condition){
  const res=await client.send(new PutObjectCommand({
   Bucket:bucket,Key:objectKey(sub),Body:data,ContentType:"application/json",
   ServerSideEncryption:"aws:kms",SSEKMSKeyId:env.HANDYOS_KMS_KEY_ARN,
   ...(condition.ifMatch?{IfMatch:condition.ifMatch}:{IfNoneMatch:"*"})
  }));
  return {etag:res.ETag};
 }
};
export const handler=createOwnerLedgerApi({
 storage,ownerSub:env.HANDYOS_OWNER_SUB,origin:env.HANDYOS_OWNER_ORIGIN,
 apiId:env.HANDYOS_API_GATEWAY_ID,issuer:env.HANDYOS_JWT_ISSUER,clientId:env.HANDYOS_JWT_CLIENT_ID
});

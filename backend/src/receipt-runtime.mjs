// HandyOS runtime receipt assembly. Separate from older single-file S3 ledger.
// In production only the independently provisioned HandyOS PostgreSQL, private
// S3 receipts bucket/KMS and dedicated task role may enable these operations.
// No network access, secret retrieval or AWS client created on import.
import {createReceiptWorkflow} from "./receipt-workflow.mjs";
import {createPostgresReceiptRepository} from "./receipt-postgres-repository.mjs";
import {createHandyOsReceiptSdk} from "./receipt-sdk-factory.mjs";

function unavailable(){throw Error("HandyOS private receipts not activated")}
export function receiptRuntimeConfig(env={}){
 if(env.HANDYOS_RECEIPTS_ENABLED!=="true")return null;
 if(env.HANDYOS_ISOLATED_RESOURCES_VERIFIED!=="true"||
   !/^\d{12}$/.test(env.HANDYOS_AWS_ACCOUNT_ID||"")||
   !/^ap-[a-z]+-\d$/.test(env.AWS_REGION||"")||
   typeof env.HANDYOS_RECEIPT_BUCKET!=="string"||
   !/^handyos-[a-z0-9.-]{3,62}$/.test(env.HANDYOS_RECEIPT_BUCKET)||
   typeof env.HANDYOS_RECEIPT_KMS_ARN!=="string"||
   !env.HANDYOS_RECEIPT_KMS_ARN.startsWith("arn:aws:kms:"+env.AWS_REGION+":"+env.HANDYOS_AWS_ACCOUNT_ID+":key/")||
   !env.DATABASE_URL?.startsWith("postgres")||
   !env.COGNITO_USER_POOL_ID||!env.COGNITO_APP_CLIENT_ID)
   unavailable();
 return Object.freeze({
  bucket:env.HANDYOS_RECEIPT_BUCKET,
  kmsKeyArn:env.HANDYOS_RECEIPT_KMS_ARN,
  accountId:env.HANDYOS_AWS_ACCOUNT_ID,
  region:env.AWS_REGION,
  endpointHost:env.HANDYOS_RECEIPT_BUCKET+".s3."+env.AWS_REGION+".amazonaws.com"
 });
}
/** Assemble once on service startup. Caller must close SDK client at shutdown. */
export async function createHandyOsReceiptRuntime({env=process.env,pool,
 createSdk=createHandyOsReceiptSdk,createRepository=createPostgresReceiptRepository,
 createWorkflow=createReceiptWorkflow}={}){
 const config=receiptRuntimeConfig(env);
 if(!config)return Object.freeze({enabled:false,workflow:null,close:()=>{}});
 if(typeof pool?.connect!=="function")unavailable();
 let sdk;
 try{
  sdk=await createSdk({config,enabled:true,verifiedIsolation:true});
  if(!sdk?.adapter||typeof sdk.close!=="function")unavailable();
  const repository=createRepository({pool});
  const workflow=createWorkflow({repository,media:sdk.adapter});
  if(!workflow||typeof workflow.beginUpload!=="function"||
   typeof workflow.confirmUpload!=="function"||typeof workflow.viewReceipt!=="function")
   unavailable();
  return Object.freeze({enabled:true,workflow,close:()=>sdk.close()});
 }catch(error){
  try{sdk?.close?.()}catch{}
  // Never expose credential details, S3 signed URLs, DB names or AWS SDK errors.
  unavailable();
 }
}

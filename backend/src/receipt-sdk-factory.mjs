// HandyOS S3 SDK v3 factory (SOURCE ONLY). No runtime activation on import.
// Requires a dedicated approved execution role; credentials use AWS default
// provider chain, NEVER browser tokens, access keys or shared venture secrets.
// Caller must supply independently verified config and explicitly opt in.
import {createReceiptS3Adapter,validateReceiptS3Config} from "./receipt-s3-adapter.mjs";

const REQUIRED_HEADERS=Object.freeze([
 "content-type",
 "content-length",
 "if-none-match",
 "x-amz-server-side-encryption",
 "x-amz-server-side-encryption-aws-kms-key-id"
]);
export function s3SigningOptions(expiresIn,method){
 if(!Number.isInteger(expiresIn)||expiresIn<1||expiresIn>180)throw Error("Invalid S3 URL expiry");
 if(method==="GET")return {expiresIn};
 if(method!=="PUT")throw Error("Invalid S3 signing method");
 // Sign exact content-type/length, never hoist security-critical KMS headers.
 return {
  expiresIn,
  signableHeaders:new Set(["content-type","content-length","if-none-match"]),
  unhoistableHeaders:new Set([
   "x-amz-server-side-encryption",
   "x-amz-server-side-encryption-aws-kms-key-id"
  ])
 };
}
// No imports from AWS libraries unless the caller explicitly invokes factory.
// The injector supports offline, fake-SDK tests without credentials or network.
export async function createHandyOsReceiptSdk({config,enabled=false,verifiedIsolation=false,
 modules,loadModules}={}){
 if(enabled!==true||verifiedIsolation!==true)throw Error("HandyOS S3 signing not activated");
 const fixed=validateReceiptS3Config(config);
 // Explicit loader allows tests to assert no SDK/network is initialized on
 // missing approval. Production module loader uses pinned SDK packages.
 const sdk=modules??await (loadModules??(async()=>({
  s3:await import("@aws-sdk/client-s3"),
  presigner:await import("@aws-sdk/s3-request-presigner")
 })))();
 const {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand}=sdk.s3||{};
 if(typeof S3Client!=="function"||typeof sdk.presigner?.getSignedUrl!=="function")
  throw Error("HandyOS SDK dependencies unavailable");
 const client=new S3Client({region:fixed.region,forcePathStyle:false,
  endpoint:"https://"+fixed.endpointHost});
 const adapter=createReceiptS3Adapter({
  config:fixed,client,
  commands:{PutObjectCommand,GetObjectCommand,HeadObjectCommand},
  presign:(c,command,options)=>sdk.presigner.getSignedUrl(c,command,
   s3SigningOptions(options.expiresIn,command instanceof PutObjectCommand?"PUT":"GET"))
 });
 return Object.freeze({adapter,requiredUploadHeaders:REQUIRED_HEADERS,
  close:()=>client.destroy()});
}

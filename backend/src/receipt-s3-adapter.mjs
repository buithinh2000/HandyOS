// HandyOS isolated S3 receipt adapter (SOURCE-ONLY; no AWS client initialized).
// Requires an independently reviewed AWS SDK v3 client/command constructors/presigner.
// Never accepts a bucket, KMS key, region or object prefix from the browser.
// Do not activate until dedicated bucket/KMS identity, IAM and staging are verified.
const BUCKET=/^[a-z0-9][a-z0-9.-]{2,62}$/;
const ARN=/^arn:aws:kms:([a-z0-9-]+):(\d{12}):key\/([0-9a-f-]{36})$/i;
const UUID="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY=new RegExp("^tenants/"+UUID+"/jobs/"+UUID+"/receipts/"+UUID+"/"+UUID+"\\.(jpg|png|webp|pdf)$","i");
const MIME=Object.freeze({jpg:"image/jpeg",png:"image/png",webp:"image/webp",pdf:"application/pdf"});
function stop(){throw Error("HandyOS private S3 receipt storage not authorized")}
function keyCheck(key){
 if(typeof key!=="string"||!KEY.test(key)||key.length>512)stop();
 return key;
}
function expiry(n){if(!Number.isInteger(n)||n<1||n>180)stop();return n}
function urlCheck(url,host){
 if(typeof url!=="string")stop();
 let u;try{u=new URL(url)}catch{stop()}
 if(u.protocol!=="https:"||u.username||u.password||u.hash||u.hostname!==host||!u.searchParams.has("X-Amz-Signature"))stop();
 return url;
}
/** Runtime config comes from independently verified server environment only. */
export function validateReceiptS3Config({bucket,kmsKeyArn,region,accountId,endpointHost}={}){
 if(typeof bucket!=="string"||!BUCKET.test(bucket)||!bucket.startsWith("handyos-")||bucket.includes("..")||
  typeof region!=="string"||!/^ap-[a-z]+-\d$/.test(region)||
  typeof accountId!=="string"||!/^\d{12}$/.test(accountId)||
  typeof endpointHost!=="string"||!/^[a-z0-9.-]+$/.test(endpointHost)||
  endpointHost!==bucket+".s3."+region+".amazonaws.com")stop();
 const m=ARN.exec(kmsKeyArn||"");
 if(!m||m[1]!==region||m[2]!==accountId)stop();
 return Object.freeze({bucket,kmsKeyArn,region,accountId,endpointHost});
}
export function createReceiptS3Adapter({config,client,commands,presign}){
 const fixed=validateReceiptS3Config(config);
 if(typeof client?.send!=="function"||typeof presign!=="function"||
  typeof commands?.PutObjectCommand!=="function"||
  typeof commands?.GetObjectCommand!=="function"||
  typeof commands?.HeadObjectCommand!=="function")stop();
 const expectedKey=e=>keyCheck(e?.objectKey);
 return Object.freeze({
  uploadHeaders(expected){
   const key=expectedKey(expected),ext=key.slice(key.lastIndexOf(".")+1);
   if(MIME[ext]!==expected.contentType||!Number.isSafeInteger(expected.contentLength)||
    expected.contentLength<1||expected.contentLength>(ext==="pdf"?15:12)*1024*1024||
    expected.privateOnly!==true||expected.requiredEncryption!=="aws:kms"||
    expected.requiredMethod!=="PUT")stop();
   return Object.freeze({
    "content-type":expected.contentType,
    "content-length":String(expected.contentLength),
    "if-none-match":"*",
    "x-amz-server-side-encryption":"aws:kms",
    "x-amz-server-side-encryption-aws-kms-key-id":fixed.kmsKeyArn
   });
  },
  async signPut(expected){
   const key=expectedKey(expected),ext=key.slice(key.lastIndexOf(".")+1);
   if(MIME[ext]!==expected.contentType||!Number.isSafeInteger(expected.contentLength)||
    expected.contentLength<1||expected.contentLength>(ext==="pdf"?15:12)*1024*1024||
    expected.privateOnly!==true||expected.requiredEncryption!=="aws:kms"||
    expected.requiredMethod!=="PUT")stop();
   const command=new commands.PutObjectCommand({
    Bucket:fixed.bucket,Key:key,ContentType:expected.contentType,
    ContentLength:expected.contentLength,ServerSideEncryption:"aws:kms",
    SSEKMSKeyId:fixed.kmsKeyArn,IfNoneMatch:"*"
   });
   return urlCheck(await presign(client,command,{expiresIn:expiry(expected.expiresInSeconds)}),fixed.endpointHost);
  },
  async head(expected){
   const key=expectedKey(expected);
   const result=await client.send(new commands.HeadObjectCommand({Bucket:fixed.bucket,Key:key}));
   if(result?.ServerSideEncryption!=="aws:kms"||result?.SSEKMSKeyId!==fixed.kmsKeyArn)stop();
   return Object.freeze({
    key,contentType:result?.ContentType,contentLength:result?.ContentLength,
    encryption:result?.ServerSideEncryption,kmsKeyArn:result?.SSEKMSKeyId
   });
  },
  async signGet(access){
   if(access?.privateOnly!==true||access.requiredMethod!=="GET")stop();
   const command=new commands.GetObjectCommand({Bucket:fixed.bucket,Key:expectedKey(access),
    ResponseCacheControl:"no-store"});
   return urlCheck(await presign(client,command,{expiresIn:expiry(access.expiresInSeconds)}),fixed.endpointHost);
  }
 });
}

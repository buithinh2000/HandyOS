// HandyOS canonical AWS staging READINESS checks, offline and SOURCE-ONLY.
// This is NOT a CloudFormation plan, deployment authorization or AWS inventory.
// Evidence from an independently approved read-only inventory must be reviewed
// separately; booleans in caller data cannot verify actual AWS resource isolation.
const ARN=/^arn:aws:(rds|kms|secretsmanager|iam|cognito-idp):([a-z0-9-]*):(\d{12}):(.+)$/;
const NAME=/^[a-z0-9][a-z0-9-]{2,127}$/;
const REQUIRED=["database","receiptBucket","receiptKms","cognitoPool","apiRuntimeRole","databaseSecret","backupTarget"];
const LEGACY=new Set(["cloud/staging-stack.json","cloud/lambda.mjs","cloud/owner-api.mjs"]);
const EMPTY=Object.freeze({decision:"NO_GO",approvedToDeploy:false,checks:[]});
function record(key,pass,explanation){return Object.freeze({key,status:pass?"PASS":"BLOCKED",explanation})}
function nonempty(v){return typeof v==="string"&&v.trim()!==""}
function resource(v){
 if(!v||typeof v!=="object"||Array.isArray(v)||!nonempty(v.name))return false;
 if(!NAME.test(v.name)||!v.name.startsWith("handyos-"))return false;
 return nonempty(v.id)&&nonempty(v.kind);
}
function refs(manifest) {
 const x=manifest?.resources;
 return x&&typeof x==="object"&&!Array.isArray(x)?x:{};
}
function unique(values){return new Set(values).size===values.length}
function flag(obj,name){return obj?.[name]===true}
function refId(r){return typeof r?.id==="string"?r.id:""}
function evidence(r){
 return nonempty(r?.evidenceRef)&&/^[A-Za-z0-9_./:#-]{8,256}$/.test(r.evidenceRef)&&
  !r.evidenceRef.includes("placeholder")&&!r.evidenceRef.includes("example");
}
/**
 * The manifest is a proposal, not authoritative proof. Account/region and
 * ownership must be independently checked with scoped read-only AWS inventory.
 * No user-provided "PASS" field can turn this into deployment permission.
 */
export function evaluateHandyOsStaging(manifest={}){
 if(!manifest||typeof manifest!=="object"||Array.isArray(manifest))return EMPTY;
 const aws=manifest.aws||{},items=refs(manifest),core=manifest.protectedVentures||{};
 const checks=[];
 const add=(k,p,msg)=>checks.push(record(k,Boolean(p),msg));
 const acct=typeof aws.accountId==="string"&&/^\d{12}$/.test(aws.accountId);
 const region=typeof aws.region==="string"&&/^ap-[a-z]+-\d$/.test(aws.region);
 add("account",acct&&region&&aws.accountId===manifest.ownerApprovedAccountId&&
  aws.region===manifest.ownerApprovedRegion,
  "Explicit owner-approved AWS account and region must match proposed environment");
 add("environment",manifest.environment==="staging"&&
  manifest.canonicalDataModel==="isolated-postgresql-plus-private-s3"&&
  manifest.legacyLedgerAsProduction!==true,
  "Only dedicated PostgreSQL and private S3 receipt media; never old S3 JSON ledger");
 const all=REQUIRED.every(name=>resource(items[name]));
 add("requiredResources",all,"All seven canonical HandyOS-only resources must be independently named");
 const ids=REQUIRED.map(name=>refId(items[name]));
 add("uniqueResourceIds",all&&unique(ids),"HandyOS resource identities cannot overlap each other");
 const assigned=REQUIRED.every(name=>items[name]?.accountId===aws.accountId&&
  items[name]?.region===aws.region);
 add("resourceOwnership",all&&assigned&&acct&&region,
  "Each resource must claim the same specifically approved account and region");
 const paths=Array.isArray(manifest.templatePaths)?manifest.templatePaths:[];
 add("noLegacyDeployment",paths.length>0&&paths.every(p=>typeof p==="string"&&!LEGACY.has(p))&&
  paths.some(p=>p.startsWith("cloud/canonical/")),
  "Production proposal cannot use legacy owner-ledger Lambda/S3 template");
 const forbidden=Object.values(core).flatMap(x=>Array.isArray(x)?x:[]);
 add("ventureSeparation",all&&unique([...ids,...forbidden])&&
  REQUIRED.every(name=>!forbidden.includes(items[name]?.name)),
  "All DB/S3/Cognito/IAM/Secret/backup identities must differ from known venture assets");
 add("resourceEvidence",all&&REQUIRED.every(name=>evidence(items[name])),
  "Read-only ARN/config inventory evidence required for every named resource");
 add("noSharedDB",items.database?.kind==="rds-postgresql"&&
  flag(items.database,"separateInstance")&&flag(items.database,"privateNetwork")&&
  flag(items.database,"forceRls")&&flag(items.database,"deletionProtection"),
  "Database must be distinct RDS Postgres, private, FORCE RLS and deletion-protected");
 add("receiptPrivacy",items.receiptBucket?.kind==="s3-private-receipts"&&
  flag(items.receiptBucket,"blockPublicAccess")&&flag(items.receiptBucket,"versioning")&&
  flag(items.receiptBucket,"kmsEncryption")&&flag(items.receiptBucket,"noDeleteRole"),
  "Dedicated private receipt bucket with versioning, KMS and no runtime delete");
 add("identity",items.cognitoPool?.kind==="cognito-dedicated"&&
  flag(items.cognitoPool,"pkcePublicClient")&&flag(items.cognitoPool,"inviteOnly")&&
  flag(items.apiRuntimeRole,"leastPrivilege")&&flag(items.apiRuntimeRole,"noCrossVentureTrust"),
  "Dedicated Cognito PKCE and least-privilege runtime role, no cross-venture trust");
 add("recovery",items.backupTarget?.kind==="independent-backup"&&
  flag(items.backupTarget,"restoreTested")&&flag(items.database,"backupVerified"),
  "Proof of isolated backups and successful restore test required");
 const cost=manifest.cost||{};
 add("budget",Number.isFinite(cost.monthlyEstimateAUD)&&cost.monthlyEstimateAUD>=0&&
  Number.isFinite(cost.ownerApprovedCeilingAUD)&&cost.ownerApprovedCeilingAUD>0&&
  cost.monthlyEstimateAUD<=cost.ownerApprovedCeilingAUD&&
  nonempty(cost.sourceRef)&&flag(cost,"ownerApproved"),
  "Current monthly cost estimate must be sourced and explicitly approved");
 add("securityTests",flag(manifest.tests,"tenantCrossing")&&
  flag(manifest.tests,"iamNegative")&&flag(manifest.tests,"cognitoJwt")&&
  flag(manifest.tests,"s3CorsIphone")&&flag(manifest.tests,"backupRestore"),
  "Negative isolation, Cognito, iPhone CORS and restore test evidence required");
 const blocked=checks.filter(x=>x.status==="BLOCKED").map(x=>x.key);
 // Even all-pass self-attested evidence is NOT AWS validation or deployment approval.
 return Object.freeze({decision:blocked.length?"NO_GO":"EVIDENCE_REVIEW_ONLY",
  approvedToDeploy:false,readyForIndependentReview:blocked.length===0,
  blocked:Object.freeze(blocked),checks:Object.freeze(checks)});
}
export function guardCanonicalTemplate(path){
 if(typeof path!=="string"||LEGACY.has(path)||!path.startsWith("cloud/canonical/")||
  !/\.(?:json|ya?ml)$/.test(path))throw Error("HandyOS legacy/staging template prohibited for canonical deployment");
 return path;
}

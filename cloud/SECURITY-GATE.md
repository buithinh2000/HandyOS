# HandyOS Owner V1 — Secure Cloud Activation Gate (SOURCE-ONLY)

Status: **NOT DEPLOYED.** This repository's public static \`owner-v1.html\` is still a **browser-local demo**. The cloud API modules are NOT connected to it. Never enter real staff, customer, banking, or financial records into the demo.

## Architecture and trust boundary

\`\`\`
Owner browser (HTTPS)
   -> Cognito hosted login / Authorization Code + PKCE (to be configured)
   -> API Gateway HTTP API (JWT authorizer on GET and PUT)
   -> Lambda (exact Owner subject + API ID + issuer checks)
   -> private S3 bucket, SSE-KMS, versioning enabled
\`\`\`

The Lambda has no user-facing publicly callable Function URL. Never put a client secret, password, access token or AWS keys into the source, web UI, repository, or Cloudflare Pages.

**Owner-only authorization:** API Gateway validates the JWT issuer, audience/client ID, signature, lifetime and route scopes. The handler independently requires the exact \`HANDYOS_OWNER_SUB\`, \`HANDYOS_JWT_ISSUER\` and \`HANDYOS_API_GATEWAY_ID\`. Both GET and PUT must require the JWT authorizer; no public fallback route or permissive default API Gateway route. For production, restrict Lambda resource-based invoke permissions to the exact API Gateway execution ARN.

## API contract

- \`GET /owner-ledger\` returns \`{"state":null,"revision":null}\` when no cloud object exists, else \`{"state":{...},"revision":"<S3 ETag>"}\`.
- \`PUT /owner-ledger\` accepts a JSON backup-format ledger object.
- On first save, the caller MUST send \`If-None-Match: *\`.
- On subsequent saves, the caller MUST send \`If-Match: "<ETag from the last GET/PUT>"\`.
- If another browser wrote a newer revision, S3 returns a precondition failure and this API returns \`409\`. The user **must choose how to resolve the conflict**; never silently overwrite. Existing \`localStorage\` data must remain unchanged.
- Maximum body: 2 MiB. HTTP OPTIONS CORS preflight must be handled by API Gateway, not by an unprotected application route.
- No unauthenticated read or write route, no bulk public export, no public share links.
- All API responses set \`Cache-Control: no-store\`. \`Access-Control-Allow-Origin\` is only the exact configured HTTPS owner origin (and only when the request Origin matches).

## Packaging and runtime

- Runtime: Node.js 22.x Lambda, packaged with \`@aws-sdk/client-s3\` v3 using a **pinned version and lockfile** in the deployment build.
- Handler path: \`cloud/lambda.handler\` (module \`cloud/lambda.mjs\`).
- Bundle \`cloud/lambda.mjs\`, \`cloud/owner-api.mjs\`, \`owner-ledger-io.mjs\`, \`owner-ledger-core.mjs\` and the SDK dependencies. Resolve the relative imports accordingly when creating the deployment artifact. The checked-in code is **not yet a finished deployable zip**.
- Required runtime environment: \`HANDYOS_LEDGER_BUCKET\`, \`HANDYOS_KMS_KEY_ARN\`, \`HANDYOS_OWNER_SUB\`, \`HANDYOS_OWNER_ORIGIN\`, \`HANDYOS_API_GATEWAY_ID\`, \`HANDYOS_JWT_ISSUER\`. Do not store secret values in GitHub.
- Supply a Cloudflare custom domain and HTTPS configuration separately. Keep CORS exact and narrow.

## Storage and backup guards

1. Create a **dedicated** private HandyOS-only S3 bucket, with Block Public Access ON, bucket ownership enforced, bucket versioning ON, SSE-KMS with a dedicated key, and TLS-only bucket policy.
2. Use a minimal Lambda execution role: \`s3:GetObject\` and \`s3:PutObject\` only for \`owners/<owner-sub>/ledger.json\`, plus \`kms:Decrypt\`, \`kms:GenerateDataKey\` for this key with S3 encryption context restrictions. No S3 DeleteObject / PutBucketPolicy, and no production admin privileges. Only s3:ListBucket conditioned on the exact Owner ledger key is permitted to support first-use existence checking.
3. Test first create, single save, stale-write 409, malformed backup, unauthorized access, and restoration of a previous S3 version **before** using real records.
4. Keep a separate Owner-authorized JSON export outside the browser for disaster recovery; S3 Versioning protects history but is **not** a full backup strategy. Document restore permissions and perform a restore test.
5. Set CloudWatch logging to metadata only: **never** log request body, response state, Authorization header, access token, payroll amounts, or client names.
6. Make isolation explicit: no reuse of BuiTai Core roles, secrets, production DB, token providers or shared ledger bucket.

## Go / no-go gates

**NO-GO unless all PASS:**

- Owner identity and allowed account verified
- Approved AWS account, environment, region, cost ceiling and separate resource identities
- Cognito PKCE login operational, correct JWT authorizer verified
- Owner-only authorization negative tests complete
- Conditional-write 409 conflict handling tested on two real browser sessions
- Private versioned encrypted storage and restoration independently proven
- UX migration from browser-only data is an explicit, reversible Owner-confirmed operation; no silent upload
- E2E tests and cost review PASS, staging before production
- Written Owner approval before applying any AWS/IAM/DNS/Secrets changes

**Current result:** source files and unit-test scaffolding only. No infrastructure created, no user authentication active, no cloud data persisted.


## Browser sync contract — prepared, NOT enabled

\`cloud/owner-sync-client.mjs\` is a source-only browser-side adapter. It is **not imported by** public \`owner-v1.html\`, and it does not provide login by itself.

- The future Cognito Authorization Code + PKCE flow must obtain a short-lived access token only after Owner sign-in, with proper issuer, audience/client and token lifetime validation enforced by API Gateway.
- Keep the bearer token in **memory**; do not store it in localStorage, sessionStorage, a URL parameter or backup JSON. Do not issue cloud requests until a valid authenticated session exists.
- The API URL must be fixed HTTPS \`/owner-ledger\` with no query parameters, embedded credentials, or fragments.
- Load remote ledger first, then explicitly compare with the browser's local ledger. A mismatch requires deliberate Owner resolution and a downloaded local backup; there is **no automatic merge or upload**.
- First creation requires a confirmed \`If-None-Match: *\` save. Updates require the last exact server ETag via \`If-Match\`. On \`409\`, stop; never retry an overwrite or silently reset revision.
- If authentication, networking or server write confirmation fails, the locally entered data remains unchanged and must be clearly shown as **NOT synced**.
- Before release, test a genuine login/logout/refresh sequence, two-tab conflict handling, backup download, a restore from S3 versions, and attempts from a non-Owner Cognito account.
- For production login, do not use the static demo's browser-local storage as a secure source of truth; expose a separate authorized Owner app shell only after authentication and security verification.

**Activation gate remains RED:** the Cognito client, API Gateway routes/authorizer, Lambda IAM, private S3/KMS bucket and real restore tests have not been deployed or verified. These modules must not be described as a working cloud login.


## Staging CloudFormation template — prepared, NOT applied

\`cloud/staging-stack.json\` is a **review-only CloudFormation source template**. It creates an isolated private S3 versioned ledger bucket with a dedicated KMS CMK (both Retain policies), a narrowly scoped Lambda execution role, dedicated CloudWatch log group, Node.js 22 Lambda, and an HTTP API with two JWT-authorized \`GET/PUT /owner-ledger\` routes. No default wildcard route is defined. The Lambda verifies exact API ID, path, route, Cognito subject, issuer, client ID, access-token type and \`openid\` scope. API Gateway also requires \`openid\` route scopes. A Cognito **ID token must NOT access financial records**.

The template does **not** create Cognito users, a login UI, the API artifact ZIP, or a custom API domain. Do not create these with unverified account settings or guessed user subjects.

### Preflight inputs — actual verified values required

- Approved AWS account, region, staging budget, dedicated stack name, authorized deploy role
- Verified **existing** Cognito issuer, app-client ID and Owner user's immutable \`sub\` (never an email address or assumed identifier)
- Confirmed \`https://handyos.buitai.com\` Owner frontend origin and authenticated Cognito PKCE callback domain
- Reviewed, checksum-pinned Lambda ZIP in an approved artifact bucket; supply its exact S3 object version ID
- Unique \`StagingSuffix\` to avoid touching existing venture or Core infrastructure
- Owner authorization for all resources, key retention, lifecycle and rollback scope

### Safe verification, in order

1. Run source tests, inspect IAM/bucket/KMS policies, and scan all template references.
2. Review AWS CloudFormation Change Set in **read-only** preview mode; do not execute it without explicit Owner approval.
3. If explicitly approved, create separate staging identities and artifact, execute the reviewed stack only, and verify all routes and access controls with synthetic data.
4. Confirm IAM negative access, a second user's forbidden access, ID-token rejection, token expiry, stale-write 409, KMS encryption and object versioning.
5. Download and independently restore an old S3 object version; prove no DELETE permission is required for normal ledger writes.
6. Implement a real Cognito PKCE Owner login UI and a separately protected Owner app session; the current \`owner-v1.html\` **remains demo-only**.
7. Only after all safety gates and an Owner decision on cost and real data may the existing browser backup be explicitly migrated.

### Cost and retention notes

The template can incur charges for a KMS key, Lambda/API requests, CloudWatch logs, S3 object versions and storage. The exact total is **not determined** until an actual region, traffic, retention and account are reviewed. Retain policies intentionally avoid deleting the bucket and key on stack removal; cleanup requires a separate approved process. Public owner demo must not be described as secured by the new template.


## First-use ledger read fix and artifact build (source review only)

**Why:** AWS S3 may return 403 AccessDenied for a missing key when the caller lacks ListBucket. The first cloud GET could fail when the Owner has not saved any data. Lambda now sends a ListObjectsV2 request with an exact-key Prefix `owners/<verified Owner sub>/ledger.json` and MaxKeys=1, and only treats an exact matching key as existing. IAM grants ListBucket conditioned on that exact prefix. This behavior still requires real AWS staging verification.

**Review-only Lambda ZIP:** `.github/workflows/owner-lambda-artifact.yml` runs for source PR changes and manual dispatch. It pins direct AWS SDK and build-tool versions, creates a dependency lock during that run, installs with npm ci, and bundles all runtime code into `cloud/lambda.js` (matching the CloudFormation handler `cloud/lambda.handler`). GitHub Actions artifact includes the review ZIP, the dependency lock, SHA256 checksums, and source commit. It never uploads to AWS.

**Dependency freeze:** the independently reviewed complete npm lock has now been committed as `cloud/build/package-lock.json`, with SHA-256 guard and `npm ci` used without re-resolution. An identical dependency graph does not itself guarantee bit-for-bit identical bundles across runner/compiler versions. Before AWS activation, verify bundle hash, object version, Cognito configuration, IAM preflight and Change Set, then explicitly approve deployment.

**No deployments or real-data writes** have been performed in this change.

## Reviewed dependency-tree digest guard — November 15, 2026

Evidence sourced from the successful GitHub Actions build run `43667413206`, artifact ID `14143100562` (review artifact). Independently verified local archive contents: exact `cloud/lambda.js` inner ZIP, SDK `@aws-sdk/client-s3` version `3.901.0`, esbuild `0.25.12`, npm lockfile v3 containing 117 package entries. SHA-256 of the full reviewed dependency lock: `a2f22aba6b58609521c1815c2914905d1f4772dfcaa9a9f92c9bbcc3d267921f`; review-only Lambda inner ZIP: `9371670a93851037976f43b7ab688ad14e98b7034341c0b48963a93165446ecc`.

The reviewed full dependency lock is committed in `cloud/build/package-lock.json`. The build checks its SHA-256 before `npm ci`, does not regenerate dependencies and rejects unnoticed changes. Re-run the integrity review and update the digest only through a separate reviewed PR. Exact bit-for-bit bundle reproducibility has not yet been demonstrated against a fixed builder environment; the staging NO-GO gate remains in place.

This does **not** authorize cloud deployment. The Cognito Owner identity, IAM/stack change set, private KMS/S3 restore rehearsal, staging cost ceiling and Owner approval remain unverified/required. Keep the public Owner V1 demo browser-local and avoid sensitive production data.

## Lockfile promotion evidence

The 69,260-byte committed npm lockfile was materialized on a temporary isolated feature branch and its SHA-256 verified against a previously reviewed GitHub Actions artifact. The temporary write-capable workflow was removed **before merging** this branch. The regular build and source tests remain `contents: read` and cannot deploy or modify AWS. Production/staging remain NO-GO until live AWS identity checks, restore rehearsal, cost approval and Owner permission.

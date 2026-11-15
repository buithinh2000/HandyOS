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
2. Use a minimal Lambda execution role: \`s3:GetObject\` and \`s3:PutObject\` only for \`owners/<owner-sub>/ledger.json\`, plus \`kms:Decrypt\`, \`kms:GenerateDataKey\` for this key with S3 encryption context restrictions. No S3 DeleteObject / ListBucket / PutBucketPolicy, and no production admin privileges.
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

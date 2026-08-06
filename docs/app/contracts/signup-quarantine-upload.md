# Signup Quarantine Upload Contract

Status: CURRENT PROVEN — LOCAL ONLY for PILOT-SIGNUP-QUARANTINE-UPLOAD-09B1. No remote apply, deploy, production, browser acceptance, evidence acceptance, promotion, or signing proof.

## Purpose And Boundary

Every required document selected in the document-first signup journey must have a current `confirmed_quarantine` revision before the customer can reach Ondertekenen. This status proves only that the server found the private object and confirmed its PDF signature, byte size, and SHA-256 against the immutable upload intent.

`confirmed_quarantine` is transport proof. It is not document approval, accepted evidence, NEa conformity, verifier acceptance, legal acceptance, a mandate, or signing evidence. Client parser observations remain derived guidance and never replace server upload confirmation.

09B1 creates no customer, identity, case, dossier, database location, database charger, legal acceptance, mandate, signing evidence, or OTP. Actual signing remains 09B2. Verified promotion and dashboard projection remain 09C. `api-app-signup-submit` is not part of this transport.

## Data Model

The lane uses only:

- `app_signup_intakes`: one pre-dossier `collecting` intake;
- `app_signup_intake_files`: immutable file revisions;
- `app_signup_intake_capabilities`: hashed capabilities;
- `app_idempotency_keys`: scoped request replay/conflict state;
- `app_intake_audit_events`: privacy-safe intake events.

A file binding is `(intake_id, client_slot_id)`. Revisions start at 1 and are unique per binding. At most one nonterminal/current revision exists. Replacement atomically sets the old row to `superseded`, preserves all old file/hash/Storage metadata, and creates a new row and path. Removal supersedes the current row without hard delete. A superseded row never satisfies journey gating.

File history has no `service_role` DELETE grant. All three intake tables retain RLS deny-all for `anon` and `authenticated`; browser table writes are forbidden. The security-definer RPCs use an empty search path, qualified relations, fixed SQL, and service-role-only execution.

## Capabilities

`intake_manage` is intake-scoped, reusable until explicit expiry, and revocable through `invalidated_at`. It authorizes resume within the same browser session, issue/replacement, and removal. The browser stores its raw value only in one central `sessionStorage` helper. It is never duplicated into React state or written to `localStorage`.

`quarantine_upload` is file-scoped, short-lived, and one-time. Confirm or reject consumes it; expiry invalidates it. Only lowercase SHA-256 values are stored in the database. Raw capability values are absent from URLs, audit metadata, logs, customer errors, and durable frontend results. Idempotent replay is one logical issuance and reconstructs the same raw capability server-side without storing it.

Production must configure a dedicated `APP_SIGNUP_CAPABILITY_SECRET`. The service-role-key derivation fallback is accepted only when `SUPABASE_URL` resolves to localhost for local proof; non-local runtime fails closed without the dedicated secret.

## Endpoints And RPCs

- `api-app-signup-intake-start` validates account type and normalized email, applies configured server TTLs, and calls `app_signup_quarantine_start_v1`.
- `api-app-signup-upload-url` validates `intake_manage`, immutable PDF metadata and a stable client slot, supports issue/replacement or remove, and calls `app_signup_quarantine_issue_v1` or `app_signup_quarantine_remove_v1`.
- `api-app-signup-upload-confirm` downloads the exact server-issued object, detects `%PDF-`, computes actual bytes and SHA-256, and calls `app_signup_quarantine_confirm_v1`.

All endpoints use shared app CORS, hashed request metadata, customer-safe errors, scoped idempotency and intake audit. Abuse boundaries are explicit configured intake/file/capability TTLs, 15 MiB maximum size, PDF-only issue/confirm, one current revision, narrow capabilities, and gateway-level rate limiting before production. 09B1 does not claim that a production rate limit is configured.

## Storage And Frontend

The existing private `app-documents` bucket is reused only below the server-owned prefix:

```text
signup-quarantine/{intake_reference}/{file_reference}/document.pdf
```

No public policy is added. The browser receives a short-lived signed upload target but never chooses a bucket, path, file ID, revision, timestamp, expiry, or status.

`DocumentUploadSlot` remains the only active signup file input. Selection order is local PDF validation, local parser/precheck, upload issue, signed upload, server confirm. The dashboard and signup adapters share `documentUploadTransport.ts` for SHA-256, JSON requests, signed uploads, and idempotency keys. Customer-visible states are only `Uploaden…`, `Bestand veilig ontvangen`, and `Upload mislukt`.

Required organization, per-location energy, and per-charger installation bindings must each have a current `confirmed_quarantine` receipt in addition to the existing fact-resolution gate. Optional informational documents do not block. Stable client slot IDs preserve account/location/charger isolation; replacing one binding cannot alter another.

## Proof And Remaining Risk

The destructive local proof marker is `signup-quarantine-runtime-09b1-proof-ok`. It covers idempotency replay/conflict, capability hashing/expiry/consumption, real private signed upload, server confirmation, mismatch and missing-object rejection, immutable replacement, concurrency, binding isolation, RLS, and no customer/identity/dossier creation.

Remaining OPEN: production TTL and rate-limit settings, retention/minimization cleanup, remote migration/deploy, production Storage configuration, interactive browser acceptance, email verification, promotion, evidence acceptance, 09B2 signing, and 09C dashboard projection.

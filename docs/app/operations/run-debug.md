# App Run And Debug Notes

Status: CURRENT operational notes for app backend debugging.

## Boundaries

- Do not print secrets, tokens, JWTs, signed URLs, upload tokens, or runtime config values.
- Label proof as local, remote, production, or browser QA.
- Do not treat local proof as production proof.
- Do not run remote deploy/apply unless explicitly requested.
- Prefer terminal-first proof for non-visible backend, SQL, recovery, and inventory checks.
- Use full browser checks only when the changed behavior is browser-visible or when a required platform fact has no safe terminal interface.

## First Checks

```bash
git branch --show-current
git log -1 --oneline
git status --short --untracked-files=all
```

## Function Call Discipline

For local Supabase Edge Functions, gateway auth may require local anon headers depending on serve mode.

Use placeholders in docs and reports:

```text
Authorization: Bearer <LOCAL_ANON_KEY>
apikey: <LOCAL_ANON_KEY>
```

Never paste real key values.

## Pre-Proof Contract Check

Before treating a proof as current app evidence, verify:

- endpoint namespace is `api-app-*`
- required app table or RPC dependency exists in the current repo
- required bucket, role, and environment assumptions are explicit
- gateway rejection and function-level rejection are separated
- write endpoints use the expected idempotency discipline
- app proof is not reading or writing legacy `dossier_*` state unless the task is explicitly a migration comparison

Legacy operational notes may help debug fallback behavior. They must not be used as current app proof without code/schema evidence.

## Gateway 401 Versus App Reject

If a request receives 401 before app CORS/error shape appears, treat it as a gateway boundary failure until proven otherwise.

If the function runtime is not reached, the function cannot write app audit events.

## Remote PostgREST Health

For remote PostgREST diagnosis, separate these facts:

- gateway reachability: a keyless or malformed request can prove the project route exists, but not PostgREST health;
- authorized request path: a current remote public key reaching a table route can prove request processing, even when the result is expected RLS/permission denial;
- expected RLS denial: HTTP `401`/`403` with request-id presence can be a healthy request-path result when the table is intentionally unavailable to browser roles;
- internal platform health: Supabase dashboard component health is a separate signal and must not be dismissed while it shows `Unhealthy`;
- dashboard evidence: if Supabase shows PostgREST `Unhealthy`, record it as platform-health evidence and keep it open until green dashboard evidence, Support guidance, or explicit owner risk acceptance exists.

For the terminal request-path probe:

- verify the project ref before the remote request;
- use only read-only `GET` or `HEAD`;
- suppress response bodies;
- do not print API keys, JWTs, tokens, request IDs, or secret-bearing headers;
- report only HTTP status, timing, content type, request-id presence, credential source class, safe key fingerprint, and classification;
- run three probes with a short gap to distinguish stable failures from intermittent results.
- do not use service-role or secret keys for public PostgREST health probes.
- root/OpenAPI probes can be misleading; table-route probes that return expected RLS/permission denial with request-id presence can prove only the functional request path.

Allowed classifications:

- `A. DASHBOARD FALSE POSITIVE / STALE HEALTH` only when terminal request routes are green, logs show no relevant PostgREST errors, and dashboard evidence later turns green;
- `B. POSTGREST DEGRADED BUT REQUEST PATH AVAILABLE` when table-route requests function but dashboard/internal health remains failing;
- `C. POSTGREST CONFIGURATION ERROR` when a reproducible schema/grant/config error explains the failure;
- `D. SUPABASE PLATFORM ISSUE — SUPPORT REQUIRED` when internal component health keeps failing and no safe customer-side fix exists;
- `E. UNKNOWN — BLOCKING` when evidence is insufficient.

Do not classify dashboard `Unhealthy` as closed from terminal route proof alone. Terminal route proof can downgrade impact, but dashboard/platform health remains open until directly resolved or explicitly accepted as a risk.

Current ENVAL remote gate result:

- managed scheduled backups are unavailable;
- PITR is unavailable;
- restore-to-new-project is unavailable;
- Daan accepted the no-Pro/no-managed-backup operational risk;
- no further browser or Support confirmation is required for this backup subscription decision;
- encrypted logical backup plus local restore dry-run is mandatory before every remote mutation.

Before running any production dump, prove a recoverable encryption recipient first. If `age` is unavailable and no GPG recipient key exists, stop before the dump. Do not create a plaintext backup while deciding how to encrypt it.

## Browsercheck Policy

Browserchecks are required for visible frontend/UI changes, customer journey changes, browser Auth/session behavior, upload/download/customer-facing flows, console/network regressions, and dashboard-only platform settings when no safe terminal interface exists.

Browserchecks are not required for documentation-only batches, read-only schema inventory, SQL proposal review, shadow apply, collision proof, migration lint, remote function inventory, PostgREST functional request-path checks when authorized terminal evidence is available, backup manifests, restore dry-runs, or non-visible backend proposal batches.

A dashboard-only fact requires at most a targeted manual confirmation. It does not require a full browser regression batch. The backup subscription decision is closed and should not be rechecked unless Daan explicitly changes the owner decision.

## Idempotency

For app write endpoints:

- send `Idempotency-Key`
- same key + same payload should replay the stored response
- same key + different payload should return conflict

Always report whether replay/conflict behavior was tested.

## Document Upload Proof Labels

Use explicit labels:

- upload URL issued
- object uploaded to local storage
- upload confirm called
- server SHA-256 matched
- document version created
- slot current version promoted

Do not call upload complete until confirm and server hash proof succeeded.

## DB/Audit Inspection

Prefer narrow app table inspection:

- `app_customers`
- `app_customer_identities`
- `app_customer_dossiers`
- `app_dossier_document_slots`
- `app_dossier_document_files`
- `app_dossier_document_versions`
- `app_audit_events`
- `app_intake_audit_events`
- `app_idempotency_keys`

Do not mix app proof with legacy `dossier_*` tables unless the task is explicitly a migration/legacy comparison.

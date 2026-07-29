# App Edge Functions Contract

Status: CURRENT contract for new `api-app-*` functions.

This document adapts useful legacy Edge discipline into the new app backend. It does not make legacy `api-dossier-*` rules current for `/app`.

## Scope

Current app endpoints:

- `api-app-signup-submit`
- `api-app-auth-bootstrap`
- `api-app-dashboard-get`
- `api-app-document-upload-url`
- `api-app-document-upload-confirm`
- `api-app-document-download-url`
- `api-app-document-withdraw-current`

Future app endpoints must be documented before implementation.

## Baseline Discipline

Business-write `api-app-*` endpoints must include:

- CORS
- META: request ID and safe request metadata
- IDEM: `Idempotency-Key` for writes
- AUD: app audit or intake audit
- AUTH: explicit app auth boundary where required
- SRV: service-role server writes only
- DEP: explicit runtime dependencies; no hidden bucket, RPC, role, secret, migration, or fallback assumptions

Frontend may assist; backend decides.

## Auth

Current customer-auth foundation:

- Supabase Auth JWT validation.
- Active `app_customer_identities` row.
- Active `app_customers` row.
- Dossier ownership through `app_customer_dossiers`.
- `api-app-auth-bootstrap` binds an existing pre-auth identity to a verified Supabase Auth user before normal customer-auth helper resolution is possible.

Do not use legacy `dossier_sessions` as app account auth.

## Current CORE Endpoints

| Endpoint | Status | Discipline | Notes |
|---|---|---|---|
| `api-app-signup-submit` | CURRENT / LOCAL PROOF | CORS / META / IDEM / AUD / SRV | Public pre-auth submit. Does not create Auth users or Auth sessions. |
| `api-app-auth-bootstrap` | CURRENT / LOCAL PROOF | CORS / META / IDEM / AUD / AUTH / SRV | Authenticated CORE endpoint. Requires verified Supabase Auth user, derives verified email server-side, binds an existing app identity, and returns accessible dossier summaries. |
| `api-app-dashboard-get` | CURRENT / LOCAL PROOF | CORS / META / AUTH / SRV | Pure authenticated read. No `Idempotency-Key`; successful reads do not create recurring audit writes. Scoped rejects may use safe fail-open audit according to current doctrine. |
| `api-app-document-upload-url` | CURRENT / LOCAL PROOF | CORS / META / IDEM / AUD / AUTH / SRV | Issues server-generated upload target. Supports current PDF policies for invoice/ownership evidence and MID evidence. |
| `api-app-document-upload-confirm` | CURRENT / LOCAL PROOF | CORS / META / IDEM / AUD / AUTH / SRV | Confirms stored object and creates immutable document version. Supports immutable replacement. |
| `api-app-document-download-url` | CURRENT / LOCAL PROOF | CORS / META / AUTH / SRV | Pure authenticated read. Resolves current document server-side and returns a short-lived signed download URL. No `Idempotency-Key`; successful reads do not write recurring audit events. |
| `api-app-document-withdraw-current` | CURRENT / LOCAL PROOF | CORS / META / IDEM / AUD / AUTH / SRV | Authenticated service-role mutation. Atomically withdraws current version, clears slot current pointers, preserves evidence, and does not hard-delete storage. |

`api-app-auth-bootstrap` uses an exceptional but proven database boundary:

- Edge Function calls a service-role-only RPC.
- RPC is `SECURITY DEFINER`.
- RPC uses an empty search path.
- RPC uses fully qualified relations.
- RPC execute is revoked from public, anon, and authenticated.
- RPC execute is granted only to service_role.

Do not generalize `SECURITY DEFINER` as the default for other functions. Use it only when a concrete, reviewed database privilege boundary requires it.

## Tables

New app endpoints must use `app_*` tables for app state:

- `app_customers`
- `app_customer_identities`
- `app_customer_dossiers`
- `app_dossier_locations`
- `app_dossier_chargers`
- `app_dossier_document_slots`
- `app_dossier_document_files`
- `app_dossier_document_versions`
- `app_dossier_legal_acceptances`
- `app_audit_events`
- `app_intake_audit_events`
- `app_idempotency_keys`

Do not write app audit/idempotency to legacy `dossier_audit_events` or `idempotency_keys`.

## Gateway Versus Function Rejects

A Supabase gateway reject can happen before function code runs.

Example:

- missing or invalid gateway auth headers
- function runtime not reached

In that case an app audit event cannot be written by the function. Reports must distinguish gateway boundary failures from application validation failures.

## Errors

Customer-facing errors must be safe:

- no SQL
- no stack traces
- no storage internals
- no raw payloads
- no secrets

## Classification

Current app classification:

- CORE: `api-app-signup-submit`, `api-app-auth-bootstrap`, `api-app-dashboard-get`, `api-app-document-upload-url`, `api-app-document-upload-confirm`, `api-app-document-download-url`, `api-app-document-withdraw-current`
- UTILITY: none currently in the app namespace

Do not claim a future endpoint is CURRENT before it exists and is proven.

Legacy endpoint inventories and uniformity checks may be used as migration source material only. They do not make `api-dossier-*`, legacy token/session contracts, or legacy table writes current for `/app`.

## WP3K Historical And WP3M Current Proposed Internal Location Callers

WP3K is historical approved TARGET input. WP3L-B later proves the empty
workforce foundation locally, but no operations caller exists.

DRAFT — WP3M AUTHORIZED OPERATIONAL LOCATION CALLERS AND WP3J EXECUTION BRIDGE — DECISION REQUIRED

WP3M exact verdict is
`READY FOR DECISION — CALLER AND EXECUTION BRIDGE PACKAGE CAN BE APPROVED`.
It approves no recommendation and authorizes no implementation.

The recommended naming family is `api-app-ops-location-*`, not
`api-app-location-*`, because the latter can be mistaken for customer
self-service. The following specific paths are proposed and unapproved:

- `api-app-ops-location-root-create`;
- `api-app-ops-location-observation-record`;
- `api-app-ops-location-version-accept`;
- `api-app-ops-location-version-correct`.

The recommended, unapproved option keeps those four operation-family
functions. Root and observation each have one fixed execute action;
acceptance and correction accept only `prepare`, `review`, `execute`. Eight
Edge Functions are rejected as unnecessary surface duplication and a generic
dispatcher is rejected as an authorization/audit risk.

Each caller satisfies CORS/META/IDEM/AUD/AUTH/SRV/DEP and maps at compile time
to one purpose-specific bridge RPC. The focused shared helper may verify
bearer, derive metadata, normalize/hash and map safe errors only. Workforce
identity/capability/scope, maker/checker and execution eligibility are
database truth. No Edge-side check-then-write or two-call authorization/WP3J
flow is allowed.

Root creation and relation creation are atomic. Observation remains
non-accepting. Acceptance/correction prepare and review call no WP3J RPC;
execute revalidates both principals and calls WP3J in the same transaction as
WP3L execution marking. No emergency override exists.

Exact paths, bridge RPCs, safe errors, audit ownership and proof matrix are in
`operations/wp3m-location-callers-execution-bridge-readiness.md`. None of
these endpoints, helper, bridge functions or proof exists or is authorized.

## WP3N Operational Location Callers

CURRENT PROVEN — LOCAL ONLY — WP3N OPERATIONAL LOCATION CALLERS AND EXECUTION BRIDGE / WORKFORCE BOOTSTRAP, POPULATION, ASSIGNMENT AUTHORITY, OPERATIONS UI, REMOTE APPLY AND CUTOVER NOT IMPLEMENTED

Exactly four operation-family Edge callers now exist:

- `api-app-ops-location-root-create`: `execute` to
  `app_ops_location_root_create_v1`;
- `api-app-ops-location-observation-record`: `execute` to
  `app_ops_location_observation_record_v1`;
- `api-app-ops-location-version-accept`: `prepare`, `review`, `execute` to
  the three matching `app_ops_location_accept_*_v1` RPCs;
- `api-app-ops-location-version-correct`: `prepare`, `review`, `execute` to
  the three matching `app_ops_location_correct_*_v1` RPCs.

The shared adapter accepts no caller-selected RPC name and performs no
Edge-side authorization join or check-then-write. It owns bearer transport,
metadata, bounded normalization, canonical hashing, safe responses and the
fixed RPC invocation only. Database functions own authorization, locking and
atomic business execution. Q01-Q64 and marker
`api-app-ops-location-callers-proof-ok` prove this bounded local source and
integration contract.

No caller deployment, remote runtime proof, browser operations UI or
production claim follows.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

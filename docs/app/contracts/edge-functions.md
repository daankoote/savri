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

Future app endpoints must be documented before implementation.

## Baseline Discipline

Business-write `api-app-*` endpoints must include:

- CORS
- META: request ID and safe request metadata
- IDEM: `Idempotency-Key` for writes
- AUD: app audit or intake audit
- AUTH: explicit app auth boundary where required
- SRV: service-role server writes only

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
| `api-app-document-upload-url` | CURRENT / LOCAL PROOF | CORS / META / IDEM / AUD / AUTH / SRV | Issues server-generated upload target. |
| `api-app-document-upload-confirm` | CURRENT / LOCAL PROOF | CORS / META / IDEM / AUD / AUTH / SRV | Confirms stored object and creates immutable document version. |

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

- CORE: `api-app-signup-submit`, `api-app-auth-bootstrap`, `api-app-dashboard-get`, `api-app-document-upload-url`, `api-app-document-upload-confirm`
- UTILITY: none currently in the app namespace

Do not claim a future endpoint is CURRENT before it exists and is proven.

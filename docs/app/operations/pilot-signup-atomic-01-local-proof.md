# PILOT-SIGNUP-ATOMIC-01 Atomic Signup Submission

CURRENT PROVEN — LOCAL ONLY — PILOT-SIGNUP-ATOMIC-01 ATOMIC RECOVERABLE SIGNUP SUBMISSION AND IMMUTABLE PARTY DECLARATION CAPTURE

Date: 2026-07-29.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Proven boundary

`app_submit_signup_v4(jsonb)` replaces the previous Edge-side multi-write
signup sequence with one service-role-only database transaction. The
transaction creates or resolves the current customer/identity boundary,
creates one dossier and its submitted locations, chargers, document slots
and legal acceptances, captures one immutable
`app_party_declaration_sources` row, writes fail-closed intake/app audit and
completes the existing `api-app-signup-submit:v3` idempotency response.

An exception at any point rolls back the idempotency reservation and every
business/audit row. Replay can therefore start safely. Same-key/same-payload
replay returns the exact stored public response; same-key/different-payload
returns `idempotency_conflict`. Fixed advisory locks serialize one logical
submit and normalized e-mail resolution.

`api-app-signup-submit` retains CORS, request metadata, shape validation,
normalization, canonical `payloadHash`, one
`app_submit_signup_v4` call and customer-safe response mapping. It contains
no direct insert/update/delete/select against business, audit or idempotency
tables. Public mode and response fields remain `write_v3`.

## Declaration-source contract

The exact table is `public.app_party_declaration_sources`. Typed columns own:

- customer/dossier, account type, declaration kind and timestamps;
- declared person first/last/full name, or declared organization
  classification/legal name/eight-digit trade-register number;
- fixed source type, request ID, payload SHA-256, declarative actor reference
  and environment.

`valid_from` equals the server-side declaration timestamp. It expresses ENVAL
declaration validity from recording time and no earlier external/legal
validity. Rows are update/delete/truncate guarded. Browser roles have no
privilege; `service_role` has only `SELECT, INSERT`.

`app_signup_intakes` remains inactive and was not reused: its quarantine,
verification and promotion lifecycle is a separate responsibility from this
current direct-signup declaration capture.

## Server validation and truth boundary

- particulier requires nonblank first and last name; full name is exactly
  those normalized values joined with one space;
- zakelijk requires `business`, nonblank legal name and exactly eight KvK
  digits;
- VvE requires `vve`, nonblank legal name and exactly eight KvK digits;
- no e-mail-prefix fallback exists;
- applicant contact and organization declaration remain separate;
- no loading location becomes person/organization address truth;
- KvK remains declared, never verified.

This batch creates no profile, party root, case-party role, representation,
mandate, EAN/aangeslotene, ownership, eligibility or evidence-acceptance
truth.

## Apply and proof

The definitive migration was applied once to local container
`supabase_db_enval`, database `postgres`, using `psql -X`,
`--single-transaction` and `ON_ERROR_STOP=1`. The RPC was not invoked against
real local customer data.

`PILOT-SIGNUP-ATOMIC-01-Q01` through
`PILOT-SIGNUP-ATOMIC-01-Q24`: PASS.

End marker:
`atomic-signup-submission-proof-ok`.

The final proof fresh-applied the definitive migration exactly once in one
disposable schema-only database. Genuine concurrent processes produced one
dossier and one declaration source. Failure injection after customer,
dossier, underlying objects, declaration, during audit and before
idempotency completion rolled back every attempt; same-key replay then
succeeded. Protected counts remained equal and zero disposable databases
remained.

## Explicit nonclaims

This proof is local database/runtime-source evidence only. It proves no
profile promotion, case participation, case role, representation authority,
mandate, address, verified identity/KvK, EAN/connection, location
acceptance, evidence acceptance, kWh, eligibility, browser runtime, remote
parity, deployment, production readiness, NEa acceptance or verifier
acceptance.

Official local TKV SHA-256:
`f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`.

## Artifact hashes

The final verified SHA-256 manifest is reported with the local proof result
and in the batch end report.

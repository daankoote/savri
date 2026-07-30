# PILOT-PROFILE-02 Declared Profile And Asserted Service Recipient

CURRENT PROVEN — LOCAL ONLY — PILOT-PROFILE-02 IMMUTABLE DECLARED PROFILE PROMOTION AND ASSERTED CASE SERVICE-RECIPIENT LINKAGE

Date: 2026-07-30.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Proven boundary

`app_bootstrap_customer_auth_v4` invokes the unchanged v3 Auth, case and
customer-party activation inside the same transaction. It then resolves all
active, non-minimized customer dossiers, their canonical cases and immutable
signup declaration sources.

No declaration sources is a backward-compatible no-op: v4 returns the exact
safe v3 browser response and creates no profile or role. Partial coverage
returns `party_declaration_incomplete`; inconsistent party kind or
authoritative profile facts return `party_declaration_conflict`. Neither
path commits partial Auth, case, party, profile, role, audit or success
idempotency state.

Complete equivalent sources select the lowest `valid_from`, then
`declared_at`, then source UUID. Different declaration timestamps are not a
fact conflict. Natural-person equality uses first, last and full name.
Organization equality additionally uses classification, legal name and
declared trade-register number.

## Temporal and truth contract

The declaration source retains its exact immutable `timestamptz`. Profile
`valid_from` remains the existing WP2A business-effective `date` and is
derived exactly as:

```sql
(canonical_source.valid_from AT TIME ZONE 'Europe/Amsterdam')::date
```

This result is independent of the PostgreSQL session timezone. The source
timestamp and profile date intentionally have different temporal
granularity. Neither establishes verified legal validity.

The profile points exactly to the canonical declaration source through
`source_type`, `source_reference_type` and `source_reference_id`. A
particulier creates or resolves one immutable person version. Zakelijk/VvE
creates or resolves one immutable organization version with respectively
`business` or `vve`. The declared trade-register number remains only in the
source and is not copied into a verified or identifier object.

Each relevant canonical case receives or resolves one terminal
`service_recipient/asserted` claim anchored to exactly that profile version.
The claim is non-operational and is never `case_confirmed`.

## Security, replay and rollback

V4 is `SECURITY DEFINER`, has empty `search_path`, and grants execute only to
`service_role`. `PUBLIC`, `anon` and `authenticated` cannot execute it.
Existing WP2A and WP2B guards remain unchanged. Two source-identity indexes,
one asserted-role lookup index and one focused insert guard add only the
declared-profile and terminal-asserted cardinality responsibilities.

Replay and genuine concurrent calls create at most one equivalent profile
and one asserted claim per case. Existing equivalent state is resolved.
Conflicting terminal profile or role truth fails closed. Injected failures
after profile creation, after role creation and during audit roll back the
complete v4 attempt.

## Proof result

`PILOT-PROFILE-02-Q01` through `PILOT-PROFILE-02-Q24`: PASS.

End marker:
`declared-profile-asserted-service-recipient-proof-ok`.

The final proof fresh-applied the definitive migration exactly once in one
disposable schema-only database. Q14 proves the exact source timestamp,
Europe/Amsterdam business date, stable UTC/Europe-Amsterdam/Asia-Makassar
session behavior, the `2026-07-30 23:30:00+00` to `2026-07-31` boundary and
absence of a new profile timestamp field. Q18-Q19 use genuine concurrent
processes. Protected counts stayed equal and zero disposable databases
remained.

The definitive migration was applied exactly once to local container
`supabase_db_enval`, database `postgres`, with `psql -X`,
`--single-transaction` and `ON_ERROR_STOP=1`. V4 was not called against real
local customer data. Real local declaration, party, relationship, profile,
case and role tables remained empty.

## Explicit nonclaims

This local proof establishes only immutable declared profile projection and
asserted case participation. It proves no verified identity or KvK, address,
case confirmation, representation authority, mandate, EAN/aangeslotene,
ownership, location or evidence acceptance, kWh, eligibility, verifier or
NEa acceptance, browser runtime, remote parity, deployment or production
readiness.

Official local TKV SHA-256:
`f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

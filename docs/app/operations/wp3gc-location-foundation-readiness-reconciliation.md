# WP3G-C Location Foundation Readiness Reconciliation

PROOF ONLY — WP3G-C LOCATION FOUNDATION READINESS RECONCILIATION

readiness verdict: READY — EMPTY BOUNDED LOCATION FOUNDATION IMPLEMENTATION MAY START

implementation status: NOT IMPLEMENTED

migration status: NOT AUTHORIZED

proof status: NOT AUTHORIZED

database-write status: NOT AUTHORIZED

## 1. Scope And Non-Authorization Boundary

WP3G-B is committed in HEAD
`98f7aa5007a458115afab1f2c3b2333862411250` with subject
`Record WP3G-B physical location schema decisions`.

This proof-only reconciliation assesses whether WP3G-B closes every internal
physical blocker from the historical WP3G readiness audit for an empty,
additive foundation containing exactly:

- `app_locations`;
- `app_location_address_observations`;
- `app_location_versions`.

The verdict means that no additional internal domain, schema, security,
temporal or foundation-proof decision is needed before a separately
authorized implementation batch can start. It does not itself authorize or
perform migration implementation, proof implementation, SQL creation,
database writes, data population, an operational write-RPC, caller cutover,
retirement, runtime, Edge Function, frontend, CSS, remote action, staging,
commit, push or deploy.

The historical WP3G audit and its proof contract remain unchanged. Their
earlier blocked status remains correct for the pre-WP3G-B state.

## 2. Execution Guard And Sources

| control | result |
|---|---|
| repository | `/Users/daankoote/dev/enval` |
| branch | `main` |
| HEAD | `98f7aa5007a458115afab1f2c3b2333862411250` |
| parent | `c021d57aacc5d8beb4aa2043bc963839fa38da07` |
| subject | `Record WP3G-B physical location schema decisions` |
| index before reconciliation | empty |
| tracked worktree before reconciliation | clean |
| untracked state | only known protected `deno.lock`, proof sources and baseline proposals |
| database action | explicit local read-only catalog transaction, ended with `ROLLBACK` |
| application rows or PII read/printed | none |
| remote action | none |

All twenty required canon, compliance, requirement, architecture,
traceability, contract, WP3 and tracker sources were read in full. The local
official TKV snapshot was used only after its SHA-256 was verified as:

`f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`

Read-only inspection covered all 22 migrations, all 25 proof sources, all six
protected baseline/rollback proposals, migration timestamps, planned object
names, immutable guards, same-root composite FKs, deferred constraints,
temporal overlap and supersession patterns, RLS deny-all and minimum grants,
SHA-256 checks, callers, frontend components, design tokens, layouts and CSS.

CSS reuse: not applicable.

## 3. Blocker Reconciliation

| reconciliation_id | original_wp3g_blocker | closing_wp3gb_decision | closure_status | remaining_decision_needed | affects_empty_foundation_ddl | affects_foundation_proof | disposition |
|---|---|---|---|---|---|---|---|
| WP3G-C-R01 | observation actor/request provenance was not physically exact | WP3G-B-01 fixes every observation column, type, nullability, recording default, actor/request field and restrictive root FK | CLOSED | NONE | YES | YES | implement and prove the exact approved catalog after separate authorization |
| WP3G-C-R02 | source-hash and freshness representation was open | WP3G-B-02 fixes both optional lowercase 64-hex hashes, kind-specific payload/retrieval requirements and timestamp ordering | CLOSED | NONE | YES | YES | derive CHECK constraints and positive/negative proof fixtures directly |
| WP3G-C-R03 | normalized postal/site descriptor columns and rules were open | WP3G-B-03 fixes the exact fields, uppercase country/postal rules, positive house number, trimming and mutually exclusive shapes | CLOSED | NONE | YES | YES | derive vocabulary/shape CHECKs and descriptor fixtures directly |
| WP3G-C-R04 | accepted version-to-observation cardinality was open | WP3G-B-04 fixes one mandatory unique same-root `accepted_from_observation_id` per version and no fourth table | CLOSED | NONE | YES | YES | derive composite FK, uniqueness and cardinality tests directly |
| WP3G-C-R05 | acceptance actor/request/decision/time provenance was open | WP3G-B-05 fixes required no-default acceptance fields, nonblank refs, unique opaque decision ref and `accepted_at <= recorded_at` | CLOSED | NONE | YES | YES | Q22's decision/reason provenance is tested through `acceptance_decision_ref`; no new column or decision is needed |
| WP3G-C-R06 | recording defaults versus explicit server-supplied times was open | WP3G-B-06 fixes `clock_timestamp()` only for root creation and immutable recording times and forbids all listed other defaults and `updated_at` | CLOSED | NONE | YES | YES | catalog-default assertions are mechanically derivable |
| WP3G-C-R07 | same-root accepted-input and supersession constraints were not physically fixed | WP3G-B-07 fixes both composite keys/FKs; existing WP3F-B rules fix one successor, cycles, correction reason, later recording and leaf overlap | CLOSED | NONE | YES | YES | reuse the established composite-FK, partial-unique and deferred-guard patterns |
| WP3G-C-R08 | readiness risked being confused with execution authority | WP3G-B-08 fixes a documentation-only boundary and requires separate migration/proof authorization | CLOSED | YES — execution authorization only; no design decision | NO | NO | readiness may be READY while implementation and proof remain unauthorized |

Reconciliation result: 8 `CLOSED`, 0 `PARTIAL`, 0 `OPEN`.

No unresolved internal domain, catalog, security, temporal or foundation-proof
choice remains for the empty three-table foundation.

## 4. Proof Contract Reconciliation

The existing WP3G proof-contract text is unchanged.

| metric | result |
|---|---|
| existing foundation cases reviewed | 42 |
| directly implementation-ready after WP3G-B | 42 |
| existing Q-cases deferred to the write-RPC/concurrency batch | 0 |
| existing Q-cases requiring a new decision | 0 |
| foundation operationele-write authorization claim | NONE |

Each existing foundation case maps to an exact catalog, source or transaction
test object:

| proof_case | readiness | exact implementation/proof target |
|---|---|---|
| WP3G-Q01 | READY | repository file-scope allowlist and protected-file hashes |
| WP3G-Q02 | READY | exact free migration/proof paths and pre-creation timestamp check |
| WP3G-Q03 | READY | pre-apply `pg_class`, `pg_proc`, trigger and index conflict query |
| WP3G-Q04 | READY | exact three-table catalog delta |
| WP3G-Q05 | READY | post-apply zero-row assertions for all three tables |
| WP3G-Q06 | READY | protected current location/charger/document aggregate counts |
| WP3G-Q07 | READY | migration source scan forbidding data mutation and backfill |
| WP3G-Q08 | READY | `app_locations` columns, defaults and closed checks |
| WP3G-Q09 | READY | forbidden root-column catalog absence |
| WP3G-Q10 | READY | `creation_basis` vocabulary and nonblank CHECK fixtures |
| WP3G-Q11 | READY | reused immutable guard and root UPDATE/DELETE negatives |
| WP3G-Q12 | READY | exact observation catalog and `ON DELETE RESTRICT` root FK |
| WP3G-Q13 | READY | seven-value `observation_kind` CHECK fixtures |
| WP3G-Q14 | READY | two-value `descriptor_kind` CHECK fixtures |
| WP3G-Q15 | READY | postal descriptor CHECK and positive/negative fixtures |
| WP3G-Q16 | READY | site-reference descriptor CHECK and positive/negative fixtures |
| WP3G-Q17 | READY | both lowercase 64-hex SHA-256 CHECKs |
| WP3G-Q18 | READY | forbidden raw/external/sensitive column absence |
| WP3G-Q19 | READY | lifecycle-column absence and no auto-version trigger/function |
| WP3G-Q20 | READY | reused immutable guard and observation UPDATE/DELETE negatives |
| WP3G-Q21 | READY | exact version catalog plus root and observation references |
| WP3G-Q22 | READY | same-root observation FK, unique accepted input, required acceptance refs/time and decision-ref uniqueness |
| WP3G-Q23 | READY | draft/pending/rejected/mutable lifecycle absence |
| WP3G-Q24 | READY | version descriptor-shape CHECK fixtures |
| WP3G-Q25 | READY | half-open validity CHECK |
| WP3G-Q26 | READY | transaction fixtures with touching validity boundaries |
| WP3G-Q27 | READY | sequential deferred transaction-end leaf-overlap test |
| WP3G-Q28 | READY | composite same-root supersession FK |
| WP3G-Q29 | READY | partial unique direct-successor index |
| WP3G-Q30 | READY | self-supersession CHECK and deferred recursive cycle guard |
| WP3G-Q31 | READY | supersession/correction-reason CHECK fixtures |
| WP3G-Q32 | READY | deferred successor-recording-order guard |
| WP3G-Q33 | READY | reused immutable guard and predecessor-history query |
| WP3G-Q34 | READY | `relrowsecurity` assertions for all three tables |
| WP3G-Q35 | READY | one exact `deny_all` policy per table |
| WP3G-Q36 | READY | `PUBLIC`/`anon`/`authenticated` privilege inventory |
| WP3G-Q37 | READY | exact `service_role SELECT, INSERT` privilege inventory |
| WP3G-Q38 | READY | forbidden service-role mutation privilege inventory |
| WP3G-Q39 | READY | focused trigger-function mode, fixed search path and execute ACL |
| WP3G-Q40 | READY | absence of RPC, write function, browser policy and projection |
| WP3G-Q41 | READY | repository diff allowlist excluding caller/runtime/frontend/CSS/config |
| WP3G-Q42 | READY | transactional rollback, final emptiness, aggregate counts and protected hashes |

The seven operational assertions already listed outside Q01–Q42 remain in the
later write-RPC/concurrency batch: RPC signature/authorization, deterministic
per-location advisory locking, idempotency, audit/error mapping, true
two-session races, execute grants/caller identity, and recovery/retry
behavior. Q27 proves only sequential deferred transaction-end behavior.

## 5. Confirmed Future Implementation Manifest

The following paths are free and fit the approved bounded package:

- migration:
  `supabase/migrations/20260728100000_app_location_foundation.sql`;
- proof:
  `scripts/proofs/app-location-foundation.proof.ts`.

Read-only checks found:

- no tracked migration timestamp or filename conflict;
- no proof-path conflict;
- no current catalog relation, function, trigger or index conflict with the
  three TARGET prefixes or focused deferred-guard shape;
- `gen_random_uuid()` available and `pgcrypto 1.3` present;
- local migration-history rows remain zero, so normal migration-tooling and
  remote parity are not proven.

A later separately authorized batch is bounded to exactly three new empty
tables, no fourth foundation table, no write-RPC, no data population, no
current-table alteration, no caller change, no `DROP`, no retirement and no
cutover.

Protected baseline proposal 002 contains an obsolete mutable
`app_locations` candidate. It remains conflicting source material, is not a
tracked migration, is not applied by this manifest and must remain unchanged.

## 6. Blocker Classification After Reconciliation

Do not block the empty foundation:

- PDOK/BAG source contract;
- physical-site matching;
- verifier acceptance;
- privacy/retention above the recorded minimum;
- 44-row mapping;
- caller cutover.

Remain blocked for later batches:

- operational write-RPC;
- advisory-lock concurrency route;
- two-transaction concurrency proof;
- data population;
- relational link tables;
- customer-safe projection;
- current-table retirement.

Migration/proof implementation still requires separate explicit
authorization. Population, write-RPC, caller cutover and retirement are not
made ready by this verdict.

## 7. TKV Guard

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

The foundation supports reconstruction and change history. It does not replace
a location visit and does not prove connection, EAN, aangeslotene, meter, MID,
kWh, eligibility or verifier acceptance. PostgreSQL object forms are internal
ENVAL controls, not literal NEa requirements.

## 8. Verdict

READY — EMPTY BOUNDED LOCATION FOUNDATION IMPLEMENTATION MAY START

This is readiness only. Implementation is not performed, migration and proof
remain unauthorized, and all later-batch blockers above remain in force.

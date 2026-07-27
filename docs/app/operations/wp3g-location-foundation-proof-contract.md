# WP3G Location Foundation Proof Contract

TARGET — WP3G BOUNDED LOCATION FOUNDATION PROOF CONTRACT — NOT IMPLEMENTED

## 1. Scope

This is the concrete future local proof contract for the empty bounded
location foundation. It creates no proof source and authorizes no migration,
SQL, databasewrite, operationele write-RPC, current-data population, caller,
runtime, projection, frontend, CSS, cutover, retirement, remote action or
deployment.

The contract becomes executable only after Daan explicitly approves an exact
column/default/constraint/index/trigger/policy/grant/comment catalog resolving
the gaps recorded in
`operations/wp3g-location-foundation-implementation-readiness.md`, and then
separately authorizes the migration/proof implementation batch.

Recommended future paths:

- migration:
  `supabase/migrations/20260728100000_app_location_foundation.sql`;
- proof: `scripts/proofs/app-location-foundation.proof.ts`.

## 2. Proof Environment And Non-Claims

- Fixed local Docker Postgres only.
- No remote connection, deployment or provider call.
- No current-data values, addresses, UUIDs or PII in output.
- Catalog and protected-table evidence uses object names and aggregate counts
  only.
- Each fixture group runs in a transaction and ends in `ROLLBACK`.
- All three target tables start and finish empty.
- No migration-history repair or manual registration.
- No proof result may be called production, remote, NEa, verifier or
  regulatory proof.
- Foundation proof makes no operationele concurrency claim.
- Advisory-lock and true two-transaction concurrency proof are deferred to a
  separately approved operationele write-RPC batch.
- Foundation proof authorizes no operational write route.

## 3. Exact Expected Foundation Inventory

The proof must fail closed unless the separately approved migration inventory
matches exactly:

- three new tables and no relation/projection table;
- no current-table alteration;
- root, observation and version columns from the approved physical catalog;
- same-root restrictive FKs;
- closed-vocabulary, descriptor, hash, provenance, temporal and supersession
  checks;
- only the approved supporting and one-successor indexes;
- direct reuse of the approved immutable guard;
- one focused location-version deferred guard;
- three immutable triggers and one deferred constraint trigger;
- RLS enabled and one `deny_all` policy per table;
- no application-role privileges and `service_role` exactly
  `SELECT, INSERT`;
- no RPC, SECURITY DEFINER write function, execute grant or browser policy;
- exact table and critical-column comments.

Any extra table, column, enum, view, materialized view, function, trigger,
index, policy, grant, RPC, caller, projection or migration-file mutation is a
proof failure.

## 4. Proof Matrix

| ID | proof requirement | required result |
|---|---|---|
| WP3G-Q01 | source scope | exactly one approved migration and one proof source; protected files unchanged |
| WP3G-Q02 | path and timestamp | migration/proof paths equal the separately approved manifest and migration timestamp was free before creation |
| WP3G-Q03 | pre-apply conflicts | no table, view, materialized view, sequence, function, trigger or index conflicts with TARGET names |
| WP3G-Q04 | table inventory | exactly `app_locations`, `app_location_address_observations`, `app_location_versions` are added |
| WP3G-Q05 | initial emptiness | all three target tables contain zero rows immediately after apply |
| WP3G-Q06 | current location protection | current location/charger/document aggregate counts are unchanged |
| WP3G-Q07 | no population | migration contains no INSERT/UPDATE/DELETE/COPY/backfill against current or target data |
| WP3G-Q08 | root catalog | exact approved root columns/types/defaults exist and forbidden domain columns are absent |
| WP3G-Q09 | root negative boundary | no address, EAN, party, case, ownership, MID, eligibility or settlement field exists on the root |
| WP3G-Q10 | creation vocabulary | exactly `customer_declaration`, `source_observation`, `manual_migration_review` accepted; other/blank values rejected |
| WP3G-Q11 | root immutability | root UPDATE and DELETE are rejected |
| WP3G-Q12 | observation catalog | exact approved observation columns/types/defaults and restrictive root FK exist |
| WP3G-Q13 | observation vocabulary | exactly seven approved `observation_kind` values accepted |
| WP3G-Q14 | descriptor vocabulary | exactly `postal_address` and `site_reference` accepted |
| WP3G-Q15 | postal descriptor | country, postal code, house number, street and city are all required for `postal_address`; site-only and incomplete shapes rejected |
| WP3G-Q16 | site descriptor | nonblank `site_reference` required for `site_reference`; postal-only and mixed shapes rejected |
| WP3G-Q17 | SHA-256 shape | optional source/payload hashes accept only 64 lowercase hexadecimal characters |
| WP3G-Q18 | raw-payload absence | no raw payload, provider ID, storage path, document content, secret, e-mail or phone column exists |
| WP3G-Q19 | observation semantics | observation has no accepted/approved/verified/current/operational/eligible state and cannot create a version automatically |
| WP3G-Q20 | observation immutability | observation UPDATE and DELETE are rejected |
| WP3G-Q21 | version catalog | exact accepted-only version columns/types/defaults and restrictive root/observation references exist |
| WP3G-Q22 | acceptance provenance | a version requires a same-root observation and complete nonblank acceptance actor/request/reason plus acceptance time |
| WP3G-Q23 | accepted-only boundary | no draft, pending, rejected or mutable lifecycle column/state exists |
| WP3G-Q24 | version descriptor | exactly one complete postal or site descriptor shape is accepted |
| WP3G-Q25 | temporal range | non-null `valid_to` must be strictly later than `valid_from` |
| WP3G-Q26 | touching periods | terminal accepted periods touching at one boundary both succeed |
| WP3G-Q27 | operational overlap | sequential overlapping non-superseded leaf periods for one root are rejected at transaction end |
| WP3G-Q28 | same-root supersession | a successor can supersede only a version from the same root |
| WP3G-Q29 | one successor | one predecessor has at most one direct successor |
| WP3G-Q30 | cycle rejection | self-reference and every constructible supersession cycle are rejected |
| WP3G-Q31 | correction reason | supersession requires nonblank `correction_reason`; non-superseding rows forbid it |
| WP3G-Q32 | recorded-time order | successor `recorded_at` must be later than predecessor `recorded_at` |
| WP3G-Q33 | version immutability | version UPDATE and DELETE are rejected; predecessor history remains queryable |
| WP3G-Q34 | RLS | RLS is enabled on all three tables |
| WP3G-Q35 | deny-all policies | exactly one `deny_all` policy exists per target table for `anon, authenticated`, with false USING/CHECK |
| WP3G-Q36 | browser/public grants | `PUBLIC`, `anon`, `authenticated` have no table privileges |
| WP3G-Q37 | service-role grants | `service_role` has exactly `SELECT, INSERT` on each table |
| WP3G-Q38 | no service mutation grants | `service_role` has no UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER privilege |
| WP3G-Q39 | function security | trigger functions have the approved mode/fixed search path and no application-role execute grant |
| WP3G-Q40 | no write route | no location write-RPC, SECURITY DEFINER operation, browser write, customer policy or projection is added |
| WP3G-Q41 | repository/runtime isolation | no caller, Edge Function, runtime, frontend, CSS, package or config source changes |
| WP3G-Q42 | cleanup and protected state | every fixture group rolled back; target tables finish empty; existing `app_*`/evidence aggregate counts and protected hashes equal the pre-proof snapshot |

Proofmatrix count: 42.

## 5. Proof Execution Order

1. Verify repository, branch, exact authorized HEAD, empty index and protected
   worktree.
2. Verify local-only Docker target and capture protected hashes.
3. Capture catalog and aggregate protected counts without printing row values.
4. Create a disposable proof database/schema.
5. Apply the controlled existing migration baseline.
6. Apply only the approved location migration.
7. Run Q01-Q07 source/catalog/additivity checks.
8. Run Q08-Q20 root/observation groups, rolling back each group.
9. Run Q21-Q33 version/temporal/supersession groups, rolling back each group.
10. Run Q34-Q41 security/isolation checks.
11. Run Q42 cleanup, emptiness, count and hash comparisons.
12. Remove only the disposable local proof database/schema.

Expected final marker for a future implemented proof:

`app-location-foundation-proof-ok`

No marker may be emitted when any required assertion is skipped, weakened or
reclassified.

## 6. Sequential Versus Concurrent Scope

The foundation proof may prove deterministic sequential behavior and deferred
transaction-end validation. It must not claim that direct concurrent
`service_role` INSERTs are serialized.

The following remain outside WP3G foundation proof:

- operationele write-RPC signature and authorization;
- deterministic `pg_advisory_xact_lock` acquisition per `location_id`;
- idempotency reservation/replay/conflict behavior;
- strict audit completion and safe error mapping;
- true two-session/two-transaction overlap and supersession races;
- execute grants and caller identity;
- operational recovery/retry behavior.

Those assertions belong to the separately approved write-RPC proof and cannot
be inferred from Q27 or any sequential insert test.

## 7. Blocked Boundaries

- exact physical catalog approval;
- migration/proof implementation authorization;
- operationele write-RPC and concurrency;
- 44-row mapping and all data population;
- physical-site matching and PDOK/BAG source semantics;
- verifier acceptance;
- relation tables and split/merge;
- customer-safe projection and caller cutover;
- current-table retirement;
- final privacy and retention.

## 8. TKV Guard

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

This proof contract can support reconstruction and change-history evidence.
It does not replace a location visit or verifier control, does not prove
connection, EAN, aangeslotene, meter, MID, kWh or eligibility, and claims no
NEa or verifier acceptance.

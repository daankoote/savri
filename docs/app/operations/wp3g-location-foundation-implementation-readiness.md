# WP3G Location Foundation Implementation Readiness

PROOF ONLY — WP3G BOUNDED LOCATION FOUNDATION IMPLEMENTATION READINESS

## 1. Scope And Authority

Dit document beoordeelt uitsluitend of de door WP3F-B goedgekeurde lege,
additive foundation voor:

- `app_locations`;
- `app_location_address_observations`;
- `app_location_versions`;

zonder aanvullende domeinbesluiten naar een exacte migration en lokaal
foundationproof kan worden vertaald.

Dit document is proof-only. Het creëert geen migration, SQL, proofbestand,
databasewrite, current-data population, operationele write-RPC, caller,
runtime, Edge Function, projectie, frontend, CSS, cutover, retirement, remote
actie of deployment. WP3F-B blijft de TARGET-autoriteit; dit document verandert
het locationfoundationcontract niet.

De zes gates blijven afzonderlijk:

| gate | readiness | reden |
|---|---|---|
| foundation migration | BLOCKED — DECISION | de drie tabellen en invarianten zijn approved, maar observation-, descriptor- en acceptancekolommen zijn niet fysiek exact |
| foundation schema proof | BLOCKED — DECISION | een stabiele proofmatrix is definieerbaar, maar kan niet tegen een nog niet goedgekeurde exacte catalogus worden uitgevoerd |
| operationele write-RPC | BLOCKED | signatures, autorisatie, audit/idempotency en executegrants vallen buiten WP3F-B |
| current-data population | BLOCKED | alle 44 current rows vereisen manual mapping en geen automatische promotion |
| caller cutover | BLOCKED | signup, dashboard, chargers en documents blijven op current IDs en contracts |
| current-table retirement | BLOCKED | replacement, mapping, parity, rollback, retention en afzonderlijke approval ontbreken |

## 2. Execution Guard

| control | observed result |
|---|---|
| repository | `/Users/daankoote/dev/enval` |
| branch | `main` |
| HEAD | `e6aac0119c5e545673a07c6a985e1921a663ba49` |
| parent | `c5a46faa26d94ad22adbd2b3748f411e1b37e51e` |
| subject | `Record WP3F-B bounded location DDL decisions` |
| index | empty |
| tracked worktree | clean before WP3G |
| untracked state | only the known protected `deno.lock`, proof sources and baseline proposals |
| database action | catalog-only queries in an explicit local `READ ONLY` transaction, ended with `ROLLBACK` |
| current-data output | none |
| remote action | none |

## 3. Sources And Inventory

All seventeen required canon, requirement, contract, WP3 and tracker documents
were read in full. The official local TKV snapshot was eligible for use only
after its SHA-256 was verified as:

`f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`

Read-only repository inventory covered:

- all 22 tracked migrations;
- all 25 proof sources in `scripts/proofs/**` and `app/**`;
- all six protected baseline/rollback proposals;
- current signup/dashboard/document callers;
- shared audit/idempotency helpers;
- frontend address lookup, mapping and dashboard read modules;
- all shared CSS token, base, layout, component, utility and global layers.

CSS reuse: not applicable. WP3G contains no UI or runtime change.

## 4. Read-Only Local Catalog Result

No application row, address, UUID or other PII was selected or printed.

| catalog question | observed local result |
|---|---|
| `app_locations` exists | NO |
| `app_location_address_observations` exists | NO |
| `app_location_versions` exists | NO |
| conflicting relation/function/trigger/index names with these prefixes | 0 |
| visible `gen_random_uuid()` | YES; one visible function |
| relevant extension | `pgcrypto 1.3` |
| other installed extensions | `pg_graphql`, `pg_net`, `pg_stat_statements`, `plpgsql`, `supabase_vault`, `uuid-ossp` |
| TARGET-name FK dependencies | 0 |
| local migration-history rows | 0 |
| current RLS convention | 24 RLS-enabled `app_*` tables and 24 `deny_all` policies |
| immutable reference-table grants | `service_role` exactly `SELECT, INSERT`; no browser-role grants |

The empty migration history is a known local provenance gap. It does not block
an isolated disposable-schema proof, but it prevents any claim of normal
migration-tooling or remote parity.

## 5. Reusable Modules And Patterns

### 5.1 Exact Reuse

| source | reusable part | bounded use |
|---|---|---|
| `20260722100000_app_party_foundation.sql` | UUID roots, composite same-root FK shape, partial one-successor indexes, half-open range predicates, deny-all RLS, revocation-first minimum grants, comments | catalog and immutable-history conventions |
| `20260724110000_app_case_party_role_foundation.sql` | recursive cycle validation, DEFERRABLE INITIALLY DEFERRED constraint trigger, terminal-leaf overlap query, `set search_path = pg_catalog, public`, focused proof inventory | version-chain and sequential transaction-end proof pattern |
| `public.app_wp2b_i_immutable_guard()` | generic table-name-aware rejection of UPDATE and DELETE | reuse directly for all three foundation tables; no duplicate immutable helper |
| `_shared/app_foundation.ts` | SHA-256, canonical payload hashing, request metadata, actor/audit row shape and safe errors | later write boundary only; no runtime change in foundation migration |
| app audit/idempotency tables and document RPCs | request-scoped idempotency, strict transactional audit, hash validation, fixed transactional boundary | later write-RPC design input only |
| `api-app-dashboard-get` and `dashboardReadClient` | server-authorized customer-safe projection and strict client response parsing | later projection/cutover boundary only |
| address lookup and signup mapper | declared/PDOK input as observation | later caller work only; never acceptance |
| document versioning | immutable artifact/version and cleanup proof discipline | proof structure only; upload is not accepted location truth |

### 5.2 Explicit Non-Reuse

- current `app_dossier_locations` identity, status, UPDATE/DELETE and cascade;
- Wave 1 proposal 002 and its mutable case-bound `app_locations`;
- current connection/location FK and claim semantics;
- browser lookup, parser output, upload or normalized-address equality as
  accepted location truth;
- old connection proofs as target-location proof;
- frontend IDs, dashboard status or CSS as schema authority.

## 6. Translation Test Against WP3F-B

### 6.1 Exact Without Interpretation

The following can be translated without a new decision:

- exactly three empty additive tables;
- root columns `id`, `created_at`, `created_by_actor_ref`,
  `created_from_request_id`, `creation_basis`;
- UUID primary keys with `gen_random_uuid()`;
- the three exact `creation_basis` values;
- the seven exact `observation_kind` values;
- the two exact `descriptor_kind` values;
- `timestamptz` business validity and separate `recorded_at`;
- `valid_to IS NULL OR valid_to > valid_from`;
- accepted-only immutable versions;
- same-root supersession, one direct successor, no cycle, later
  `recorded_at`, mandatory `correction_reason`;
- RLS enabled, one deny-all policy per table, no client privileges and
  `service_role` exactly `SELECT, INSERT`;
- no write-RPC, current-row copy, caller or projection.

### 6.2 Additional Internal Decisions Still Required

WP3F-B deliberately uses semantic bundles rather than exact physical fields
for the following. Existing patterns do not select one answer without
interpretation:

| gap | unresolved exact choice | why implementation cannot choose silently |
|---|---|---|
| observation actor/request provenance | exact column names, actor type presence, nullability and trusted timestamp/default boundary | “actor- en requestrefs” is not an exact catalog |
| source hashes | whether one or two hashes exist, what each hashes and exact names | “optionele bronhashes” and payload/source wording permit multiple shapes |
| freshness | timestamp, interval, status or source-specific metadata; requiredness | no physical representation is approved |
| postal descriptor | exact country/postcode/house-number/suffix field names, normalization and nullability | five required concepts do not define catalog names or normalization contract |
| site descriptor | exact `site_reference` namespace/shape and normalization | only required presence is approved |
| version-to-observation relation | one mandatory observation, multiple accepted inputs, or another exact bounded reference form | WP3F-B says exact accepted inputs; a single FK versus a relation is a domain choice |
| acceptance provenance | exact actor/request/decision/time/reason columns and requiredness | the accepted-only rule does not define its physical decision reference |
| recording defaults | server defaults versus explicit caller-supplied times | both conventions exist in current migrations |
| reusable immutable guard ownership | direct dependency on the package-named `app_wp2b_i_immutable_guard()` versus a separately approved neutral rename | direct reuse avoids duplication, but renaming/replacement is outside this batch |

These are internal schema decisions. They are not resolved by PDOK/BAG,
verifier or other external blockers, and they cannot be created by a
proof-only readiness document.

## 7. Recommended Future Implementation Manifest

This manifest is a concrete recommendation for the missing approval batch. It
is not DDL authority and must not be implemented unless its currently open
choices are explicitly accepted.

### 7.1 Paths And Order

Recommended first free migration path:

`supabase/migrations/20260728100000_app_location_foundation.sql`

Recommended proof path:

`scripts/proofs/app-location-foundation.proof.ts`

Migration order:

1. fail closed on any TARGET-name conflict;
2. create `app_locations`;
3. create `app_location_address_observations`;
4. create `app_location_versions`;
5. add composite keys/FKs, checks and indexes;
6. attach the reused immutable guard;
7. add the focused location-version deferred guard;
8. enable RLS and create deny-all policies;
9. revoke all grants, then grant only `SELECT, INSERT` to `service_role`;
10. revoke execute on trigger functions from all application roles;
11. add exact table and critical-column comments.

### 7.2 Recommended Column Catalog Requiring Approval

`app_locations`:

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
- `created_at timestamptz NOT NULL DEFAULT now()`;
- `created_by_actor_ref text NOT NULL`;
- `created_from_request_id text NOT NULL`;
- `creation_basis text NOT NULL`.

`app_location_address_observations`:

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
- `location_id uuid NOT NULL`;
- `observation_kind text NOT NULL`;
- `descriptor_kind text NOT NULL`;
- `observed_at timestamptz NOT NULL`;
- `recorded_at timestamptz NOT NULL`;
- `recorded_by_actor_ref text NOT NULL`;
- `recorded_from_request_id text NOT NULL`;
- `source_ref_sha256 text NULL`;
- `source_payload_sha256 text NULL`;
- `fresh_until timestamptz NULL`;
- `country_code text NULL`;
- `postal_code_normalized text NULL`;
- `house_number text NULL`;
- `house_number_suffix_normalized text NULL`;
- `street text NULL`;
- `city text NULL`;
- `site_reference text NULL`.

`app_location_versions`:

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
- `location_id uuid NOT NULL`;
- `accepted_observation_id uuid NOT NULL`;
- `descriptor_kind text NOT NULL`;
- `valid_from timestamptz NOT NULL`;
- `valid_to timestamptz NULL`;
- `recorded_at timestamptz NOT NULL`;
- `accepted_at timestamptz NOT NULL`;
- `accepted_by_actor_ref text NOT NULL`;
- `accepted_from_request_id text NOT NULL`;
- `acceptance_reason text NOT NULL`;
- `country_code text NULL`;
- `postal_code_normalized text NULL`;
- `house_number text NULL`;
- `house_number_suffix_normalized text NULL`;
- `street text NULL`;
- `city text NULL`;
- `site_reference text NULL`;
- `supersedes_id uuid NULL`;
- `correction_reason text NULL`.

The single `accepted_observation_id` choice is only a recommendation. If one
version may require multiple accepted observations, WP3F-B's exact-three-table
boundary and the required reference model must be reconciled before DDL.

### 7.3 Recommended Object Inventory Requiring Approval

Constraints:

- `app_locations_pkey`;
- `app_locations_creation_basis_chk`;
- `app_locations_provenance_not_blank_chk`;
- `app_location_address_observations_pkey`;
- `app_location_address_observations_location_id_fkey`, restrictive;
- `app_location_address_observations_location_id_id_key`, unique
  `(location_id, id)`;
- `app_location_address_observations_kind_chk`;
- `app_location_address_observations_descriptor_kind_chk`;
- `app_location_address_observations_provenance_not_blank_chk`;
- `app_location_address_observations_hashes_chk`;
- `app_location_address_observations_freshness_chk`;
- `app_location_address_observations_descriptor_shape_chk`;
- `app_location_versions_pkey`;
- `app_location_versions_location_id_fkey`, restrictive;
- `app_location_versions_location_id_id_key`, unique `(location_id, id)`;
- `app_location_versions_observation_same_root_fk`, composite
  `(location_id, accepted_observation_id)`;
- `app_location_versions_descriptor_kind_chk`;
- `app_location_versions_descriptor_shape_chk`;
- `app_location_versions_valid_range_chk`;
- `app_location_versions_acceptance_provenance_not_blank_chk`;
- `app_location_versions_no_self_supersede_chk`;
- `app_location_versions_correction_reason_chk`;
- `app_location_versions_supersession_same_root_fk`, composite
  `(location_id, supersedes_id)`.

Indexes:

- `app_location_address_observations_location_recorded_idx`;
- `app_location_versions_location_period_idx`;
- `app_location_versions_accepted_observation_idx`;
- `app_location_versions_direct_successor_uidx` as partial unique;
- constraint-owned unique indexes for both `(location_id, id)` keys.

Functions and triggers:

- reuse `public.app_wp2b_i_immutable_guard()` unchanged;
- new focused `public.app_location_versions_deferred_guard()`;
- `trg_app_locations_immutable_guard`;
- `trg_app_location_address_observations_immutable_guard`;
- `trg_app_location_versions_immutable_guard`;
- DEFERRABLE INITIALLY DEFERRED
  `trg_app_location_versions_deferred_guard`.

Policies and grants:

- one policy named `deny_all` on each table, `FOR ALL TO anon,
  authenticated USING (false) WITH CHECK (false)`;
- revoke all table privileges from `PUBLIC`, `anon`, `authenticated` and
  `service_role`;
- grant only `SELECT, INSERT` on all three tables to `service_role`;
- revoke all function execute privileges from `PUBLIC`, `anon`,
  `authenticated` and `service_role`;
- no RPC and no function execute grant.

Comments:

- table comments on `app_locations`,
  `app_location_address_observations`, and `app_location_versions`;
- column comments on `app_locations.creation_basis`,
  `app_location_address_observations.source_ref_sha256`,
  `app_location_address_observations.source_payload_sha256`,
  `app_location_address_observations.descriptor_kind`,
  `app_location_versions.accepted_observation_id`,
  `app_location_versions.descriptor_kind`,
  `app_location_versions.supersedes_id`, and
  `app_location_versions.correction_reason`;
- comments must state that observations are not accepted truth, versions prove
  no EAN/MID/eligibility and the foundation contains no raw payload.

## 8. Future Local Apply, Rollback And Proof Order

After a later explicit implementation authorization:

1. create a disposable local proof database or isolated schema from the fixed
   local Docker Postgres only;
2. capture catalog, protected file hashes and aggregate existing
   `app_*`/evidence counts;
3. apply existing migrations in their controlled order;
4. apply the single approved location migration;
5. run the proof contract groups in order;
6. roll back every fixture group;
7. prove all three new tables are empty;
8. compare protected counts and hashes;
9. drop only the disposable local proof database/schema;
10. do not register migration history manually and do not touch remote state.

Rollback is limited to disposal of the isolated local test database/schema.
There is no rollback authorization for current tables, data, callers or
migration history.

## 9. Separately Blocked Work

- operationele write-RPC;
- concurrency and authorization for operational writes;
- 44-row migration mapping;
- data population;
- physical-site matching;
- PDOK/BAG source contract;
- verifier acceptance;
- case-, allocation-point- and charge-point-location links;
- split/merge relations;
- customer-safe projection;
- caller cutover;
- current-table retirement;
- final privacy, minimization and retention.

Operational advisory-lock concurrency is not claimed by this readiness audit.
The true two-transaction concurrency proof follows only with a separately
approved operationele write-RPC.

## 10. TKV Guard

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

The proposed foundation supports reconstruction and change history. It does
not replace a location visit or verifier control, does not prove connection,
EAN, aangeslotene, meter, MID, kWh or eligibility, and claims no NEa or
verifier acceptance.

BLOCKED — BOUNDED LOCATION FOUNDATION IMPLEMENTATION NOT SAFE

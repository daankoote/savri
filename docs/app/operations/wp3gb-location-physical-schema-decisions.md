# WP3G-B Location Physical Schema Decisions

DECISION RECORD — WP3G-B EXACT PHYSICAL LOCATION SCHEMA PACKAGE APPROVED — NO IMPLEMENTATION AUTHORIZATION

approved by: Daan

approval scope: WP3G-B package 1–8

decision status: APPROVED TARGET

implementation status: NOT IMPLEMENTED

proof status: NOT PROVEN

migration status: NOT AUTHORIZED

database-write status: NOT AUTHORIZED

operational write-RPC status: BLOCKED

data population status: BLOCKED

caller cutover status: BLOCKED

retirement status: NOT AUTHORIZED

external blockers: OPEN

## 1. Decision Boundary

WP3G is committed in HEAD
`c021d57aacc5d8beb4aa2043bc963839fa38da07` with subject
`Add WP3G location foundation readiness audit`. Its historical readiness
verdict remains unchanged. This record closes the six internal physical-catalog
decision gaps identified by WP3G as APPROVED TARGET:

- exact observation actor/request columns;
- source-hash and freshness representation;
- normalized descriptor columns;
- accepted observation-to-version cardinality;
- acceptance provenance;
- timestamp defaults.

The approved physical package reconciles the earlier WP3E semantic contract
and WP3F-B bounded three-table contract. It does not authorize migration,
proof creation or execution, database writes, operational write-RPC work,
population of the 44 current rows, caller cutover, retirement, runtime, Edge
Function, frontend, CSS, remote action, staging, commit, push or deploy.

The historical WP3D, WP3E, WP3F, WP3F-B and WP3G records remain unchanged.
After this decision record, a new bounded implementation-readiness
reconciliation is required before Daan can separately authorize any migration
or proof batch.

## 2. Reconciled Three-Table Physical TARGET

The bounded foundation remains exactly:

1. `app_locations`;
2. `app_location_address_observations`;
3. `app_location_versions`.

`app_locations` has exactly:

| column | physical TARGET |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` |
| `created_at` | `timestamptz not null default clock_timestamp()` |
| `created_by_actor_ref` | `text not null` |
| `created_from_request_id` | `text not null` |
| `creation_basis` | `text not null` |

`creation_basis` remains restricted to `customer_declaration`,
`source_observation`, or `manual_migration_review`. Actor/request references
and `creation_basis` are trimmed and nonblank. The root remains statusless,
immutable, opaque, server-assigned and free of address or external identity.

`app_location_address_observations` has exactly the columns in decision
package 01 below. `app_location_versions` has exactly:

| column | physical TARGET |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` |
| `location_id` | `uuid not null` |
| `accepted_from_observation_id` | `uuid not null` |
| `descriptor_kind` | `text not null` |
| `valid_from` | `timestamptz not null` |
| `valid_to` | `timestamptz null` |
| `recorded_at` | `timestamptz not null default clock_timestamp()` |
| `accepted_at` | `timestamptz not null` |
| `accepted_by_actor_ref` | `text not null` |
| `accepted_from_request_id` | `text not null` |
| `acceptance_decision_ref` | `text not null` |
| `country_code` | `text not null` |
| `postal_code` | `text null` |
| `house_number` | `integer null` |
| `house_number_addition` | `text null` |
| `street` | `text null` |
| `city` | `text null` |
| `site_reference` | `text null` |
| `supersedes_version_id` | `uuid null` |
| `correction_reason` | `text null` |

`location_id` on observations and versions references `app_locations(id)` with
restrictive delete behavior. The earlier approved closed vocabularies,
accepted-only immutability, half-open business validity, one operational
non-superseded version per root/time, one direct successor, no cycles,
increasing recording time, correction-reason requirement, no cascade, RLS,
deny-all and minimum-grant rules remain in force.

## 3. Approved Package 1–8

### WP3G-B-01

The exact `app_location_address_observations` physical shape is:

| column | physical TARGET |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` |
| `location_id` | `uuid not null` |
| `observation_kind` | `text not null` |
| `descriptor_kind` | `text not null` |
| `observed_at` | `timestamptz not null` |
| `recorded_at` | `timestamptz not null default clock_timestamp()` |
| `recorded_by_actor_ref` | `text not null` |
| `recorded_from_request_id` | `text not null` |
| `source_ref_sha256` | `text null` |
| `source_payload_sha256` | `text null` |
| `source_retrieved_at` | `timestamptz null` |
| `fresh_until` | `timestamptz null` |
| `country_code` | `text not null` |
| `postal_code` | `text null` |
| `house_number` | `integer null` |
| `house_number_addition` | `text null` |
| `street` | `text null` |
| `city` | `text null` |
| `site_reference` | `text null` |

`location_id` has a foreign key to `app_locations(id) ON DELETE RESTRICT`. An
observation has no document, provider, case or generic-evidence foreign key.
Actor/request references are opaque, trimmed and nonblank. The earlier
approved observation and descriptor vocabularies remain closed.

### WP3G-B-02

`source_ref_sha256` and `source_payload_sha256` are either null or exactly 64
lowercase hexadecimal characters.

`document_parsed`, `pdok_observed`, `bag_observed`, and `provider_observed`
require `source_payload_sha256`. `pdok_observed`, `bag_observed`, and
`provider_observed` also require `source_retrieved_at`.

`fresh_until` is permitted only with `source_retrieved_at` and must be later
than `source_retrieved_at`. `source_retrieved_at` must not be later than
`recorded_at`.

`customer_declared`, `manual_observed`, and `migration_snapshot` prohibit
`fresh_until`. The foundation stores no raw payload or raw external/provider
identifier.

### WP3G-B-03

The normalized descriptor check applies equally to observations and versions.

`country_code` is exactly two uppercase characters and is server-normalized;
the database enforces `^[A-Z]{2}$`.

A `postal_address` requires `country_code`, `postal_code`, `house_number`,
`street`, and `city`; `house_number` is greater than zero; all text is stored
trimmed; `postal_code` is uppercase and trimmed;
`house_number_addition` is null or trimmed and nonblank; and
`site_reference` is null.

A `site_reference` requires `country_code` and a trimmed nonblank
`site_reference`. `postal_code`, `house_number`, `house_number_addition`,
`street`, and `city` are all null.

Normalization creates no physical identity, deduplication, merge, acceptance
or matching inference.

### WP3G-B-04

Every version names exactly one `accepted_from_observation_id`.

Both observations and versions expose a unique composite key on
`(location_id, id)`. The version uses a composite foreign key
`(location_id, accepted_from_observation_id)` to the observation composite
key, so the accepted input must belong to the same location root.

`accepted_from_observation_id` is unique across versions. One observation can
therefore be the primary accepted input of at most one version, and each
version has exactly one primary observation.

Additional evidence is referenced through the opaque
`acceptance_decision_ref` under a separately approved evidence/decision
contract. This package adds no fourth location-foundation table and no generic
evidence foreign key.

### WP3G-B-05

Every accepted version requires:

- `accepted_at timestamptz NOT NULL`;
- `accepted_by_actor_ref text NOT NULL`;
- `accepted_from_request_id text NOT NULL`;
- `acceptance_decision_ref text NOT NULL`.

None has a default. All three text references are trimmed and nonblank.
`acceptance_decision_ref` is unique. `accepted_at` must not be later than
`recorded_at`.

The references are opaque internal provenance. They create no verifier
acceptance, NEa acceptance, evidence-sufficiency, connection, authority,
mandate or eligibility claim. Incomplete acceptance provenance is rejected.

### WP3G-B-06

Only these recording/creation timestamps have database defaults:

- `app_locations.created_at DEFAULT clock_timestamp()`;
- `app_location_address_observations.recorded_at DEFAULT clock_timestamp()`;
- `app_location_versions.recorded_at DEFAULT clock_timestamp()`.

There is no default on `observed_at`, `source_retrieved_at`, `fresh_until`,
`valid_from`, `valid_to`, or `accepted_at`. No bounded foundation table has an
`updated_at` column. Business time, source time, acceptance time, creation time
and immutable recording time remain separate meanings.

### WP3G-B-07

Observations and versions each have `UNIQUE (location_id, id)`.

`app_location_versions` has a composite foreign key
`(location_id, accepted_from_observation_id)` to
`app_location_address_observations(location_id, id)`.

`app_location_versions` also has a composite self-foreign key
`(location_id, supersedes_version_id)` to
`app_location_versions(location_id, id)`.

Cross-root observation acceptance and cross-root correction supersession are
prohibited. The earlier approved one-direct-successor uniqueness, cycle
rejection, mandatory correction reason, later `recorded_at`, immutable
predecessors, half-open validity and leaf-overlap rules remain required.

### WP3G-B-08

This package is documentation-only approval of the exact physical TARGET
schema package 1–8.

It authorizes no migration, SQL, proof file, proof execution, local database
write, remote database action, operational write-RPC, advisory-lock operation,
two-transaction concurrency proof, mapping or population of the 44 current
rows, physical-site matching, PDOK/BAG acceptance, verifier acceptance,
relation table, customer-safe projection, caller cutover or retirement.

A new readiness reconciliation must first show that the approved package
translates completely and safely into a bounded prospective migration/proof
scope. Migration and proof implementation still require a later, separate
explicit authorization.

## 4. TKV Alignment Guard

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

The root, immutable observations and accepted versions, exact provenance,
same-root guards, RLS and grants are internal ENVAL architecture. They support
reconstruction but prove no verifier or NEa acceptance. Location acceptance
does not replace checks of connection, allocation point, metered delivery
point, meter, aangeslotene, direct line, on-site generation or an Article 10
construct.

## 5. Open Blockers

- operational write-RPC;
- advisory-lock concurrency;
- two-transaction concurrency proof;
- 44-row mapping;
- data population;
- physical-site matching;
- PDOK/BAG source contract;
- verifier acceptance;
- case-location links;
- allocation-point-location links;
- charge-point-location links;
- split/merge relations;
- customer-safe projection;
- caller cutover;
- current-table retirement;
- privacy and final retention.

These blockers do not reopen package 1–8. Their resolution does not
automatically authorize implementation, proof, database writes, population,
cutover, retirement, remote action or regulatory claims.

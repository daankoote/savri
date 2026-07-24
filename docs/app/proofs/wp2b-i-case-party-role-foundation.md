# WP2B-I Case And Case-Party-Role Foundation Proof

Status: PROOF ONLY — CURRENT PROVEN LOCAL SCHEMA

Evidence date: 2026-07-24.

Responsibility: record the bounded local schema, invariant, concurrency, security and non-mutation evidence for `app_cases` and `app_case_party_roles`. This document is evidence only. It is not a second domain contract, runtime/API approval, remote migration record, production proof, NEa acceptance or verifier acceptance.

## Evidence Basis

| evidence | value |
|---|---|
| basis commit | `1e4fe26781796c9f624eb42d186c39fb98271218` |
| migration | `supabase/migrations/20260724110000_app_case_party_role_foundation.sql` |
| migration SHA-256 | `fb3f9b5d0705d47a5f1be9f934684a25ad474000874daf2ef9e071ab3ddb56a1` |
| proof | `scripts/proofs/app-case-party-role-foundation.proof.ts` |
| proof SHA-256 | `12e4fdc5587fed04f75d3dda039c56e72fcd144cf1ecd8b943f1db7e32ef52bb` |
| Deno check | PASS |
| proof cases | Q01-Q34 PASS; zero FAIL |
| proof marker | `app-case-party-role-foundation-proof-ok` |
| source state | migration and proof are not committed |

The approved domain semantics remain in `docs/app/contracts/customer-party-representation-case.md`. This page records only what the migration, local catalog and proof establish.

## Status Boundary

| scope | status |
|---|---|
| `app_cases` | CURRENT PROVEN — LOCAL |
| `app_case_party_roles` | CURRENT PROVEN — LOCAL |
| API/runtime/customer projection | NOT IMPLEMENTED |
| remote/production | NOT PROVEN |
| NEa/verifier acceptance | NOT PROVEN |
| representation authority | NOT SCHEMA READY |
| mandates | OUTSIDE WP2B-I |
| connection/EAN | SEPARATE BOUNDED CONTEXT |
| regulatory versioning | TARGET |
| verification and settlement | SEPARATE BOUNDED CONTEXTS |

## Proven Object Inventory

Exactly two tables:

- `public.app_cases`;
- `public.app_case_party_roles`.

Exactly three focused functions:

- `public.app_wp2b_i_immutable_guard()`;
- `public.app_case_party_roles_insert_guard()`;
- `public.app_case_party_roles_deferred_guard()`.

Exactly four triggers:

- `trg_app_cases_immutable_guard`;
- `trg_app_case_party_roles_immutable_guard`;
- `trg_app_case_party_roles_insert_guard`;
- `trg_app_case_party_roles_deferred_guard`.

The catalog proof also established:

- restrictive foreign keys;
- thirteen checks;
- primary-key, global case-reference, one-root, one-direct-successor, FK/query and operational-overlap indexes;
- one deny-all RLS policy per table;
- no view, materialized view, procedure, RPC, Edge Function or customer projection.

## Proven Role And Truth Boundary

The only role values are:

- `service_recipient`;
- `case_contact`.

The only claim-status values are:

- `asserted`;
- `case_confirmed`;
- `disputed`;
- `rejected`.

Only a terminal, non-superseded `case_confirmed` version is operational case-role truth. `asserted`, `disputed` and `rejected` are not operational.

A case role proves none of:

- representation or signing authority;
- mandate or signed-mandate evidence;
- EAN ownership or `aangeslotene`;
- evidence acceptance;
- verifier approval;
- booking eligibility;
- payout entitlement.

Auth, account ownership, `app_customer_identities`, `app_customer_party_relationships`, dossier ownership and `app_dossier_legal_acceptances` cannot substitute for this case-role truth and cannot create representation authority or mandate truth.

## Proven Versioning And Profile Binding

- `id` identifies one immutable role version.
- `role_claim_id` identifies the stable claim chain.
- Exactly one person or organization profile-version reference is present.
- The focused insert guard proves that the profile version belongs to `party_id` and matches the party subtype.
- `case_contact` accepts only a natural-person party.
- A later profile version does not rewrite the pinned historical role version.
- UPDATE and DELETE are rejected on both new tables.
- Supersession is append-only through `supersedes_id`.
- Every successor preserves `role_claim_id`, `case_id`, `party_id` and `role_type`.
- `recorded_at` must increase.
- There is at most one root per claim and one direct successor per version.
- The predecessor must still be terminal.
- Self-reference and cycle construction are rejected.
- A wrong party is not substituted inside an existing chain: the old claim is ended and a new `role_claim_id` is started, which Q26 proved can happen atomically.

## Proven Temporal And Operational Invariants

- Business validity is half-open: `[valid_from, valid_to)`.
- A null `valid_to` is unbounded.
- A non-null `valid_to` must be strictly later than `valid_from`.
- `valid_from` and `valid_to` are `timestamptz`.
- Business validity is separate from `recorded_at`.
- Boundary-touching intervals do not overlap.
- At most one operational `service_recipient` exists per case at an instant.
- Multiple different `case_contact` claims may overlap.
- The same party cannot have overlapping operational claims for the same case and role.
- One natural person may simultaneously be `service_recipient` and `case_contact`.

## Proven Concurrency

`app_case_party_roles_insert_guard()` acquires `pg_advisory_xact_lock` from a deterministic hash of `case_id`. The constraint trigger runs AFTER INSERT, is DEFERRABLE and INITIALLY DEFERRED, and validates terminal-chain state at transaction end.

Q29 and Q30 ran two simultaneous transactions that attempted overlapping confirmed service-recipient writes for the same case:

- exactly one transaction committed;
- exactly one transaction was rejected by the operational-overlap invariant;
- the serialized duration and final one-row result proved that the case lock prevented write skew.

## Proven Security

For both tables:

- RLS is enabled;
- one `deny_all` policy exists;
- `PUBLIC`, `anon` and `authenticated` have no table privileges;
- `service_role` has exactly `SELECT` and `INSERT`;
- `service_role` has no UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER privilege;
- there is no browser-write or customer-read policy.

All three trigger functions:

- are invoker mode, not `SECURITY DEFINER`;
- have no direct execute grant for `anon`, `authenticated` or `service_role`.

## Protected Truth And Cleanup

Q31-Q33 established:

- all pre-existing `app_*` table counts remained unchanged;
- all protected file hashes remained unchanged;
- functional and concurrency fixtures ran in a disposable local database;
- the disposable database was removed;
- `app_cases` ended with zero rows;
- `app_case_party_roles` ended with zero rows;
- no remote action occurred.

Key protected counts remained:

| table | before | after |
|---|---:|---:|
| `app_customers` | 211 | 211 |
| `app_customer_identities` | 73 | 73 |
| `app_customer_dossiers` | 328 | 328 |
| `app_dossier_legal_acceptances` | 60 | 60 |
| `app_parties` | 0 | 0 |
| `app_party_person_versions` | 0 | 0 |
| `app_party_organization_versions` | 0 | 0 |
| `app_customer_party_relationships` | 0 | 0 |

No customer names, email addresses, tokens, secrets, Storage paths or remote identifiers were used as proof output.

## Local Migration-History Truth

The migration was applied directly to the local PostgreSQL database for proof. Version `20260724110000` is not present in `supabase_migrations.schema_migrations`.

Therefore:

- this is not a normal migration-tooling apply proof;
- this is not remote migration proof or remote parity;
- no manual migration-history registration is claimed or recommended;
- a future deployment batch must prove a controlled forward-only apply and remote parity separately.

## Contract Reconciliation

The migration preserves the approved domain semantics but replaces earlier TARGET physical details:

| earlier TARGET | proven implementation |
|---|---|
| three source fields | `source_class` and `source_ref` |
| generic case actor names | `created_by_actor_type` and `created_by_actor_ref` |
| generic role actor names | `recorded_by_actor_type` and `recorded_by_actor_ref` |
| `date` role validity | `timestamptz` role validity |
| composite party/profile FKs | direct profile FKs plus focused same-party/subtype insert guard |
| five separate decision fields including `decision_request_id` | four decision fields plus mandatory row `request_id` |
| `supersedes_role_version_id` | `supersedes_id` |
| server-recorded timestamp wording | required timestamps without schema defaults; server population remains runtime work |

These are physical and implementation-detail reconciliations only. They introduce no changed role vocabulary, operational truth, authority, mandate, connection, evidence, verifier, booking or finance semantics.

## Proof Results

| range | evidence |
|---|---|
| Q01-Q07 | exact source/object scope, columns, FKs/checks/indexes/triggers, RLS/grants, function security and Auth/account/legal boundary |
| Q08-Q15 | minimal inserts, case reference, profile/subtype, vocabularies, provenance/actors, decisions and temporal boundaries |
| Q16-Q20 | root/successor linearity, scope preservation, recording order, self/cycle rejection and immutability |
| Q21-Q28 | operational-state filtering, contact/recipient overlap rules, atomic wrong-party correction, historical profile stability and authority/mandate separation |
| Q29-Q30 | deterministic advisory-lock concurrency and write-skew prevention |
| Q31-Q34 | protected counts/hashes, full cleanup, local-only boundary and WP2A actor/provenance reuse |

Final marker:

`app-case-party-role-foundation-proof-ok`

## Non-Mutation And Non-Approval Confirmation

This evidence-registration batch changes documentation only. It makes no migration, proof-script, SQL, migration-history, code, Auth, Edge Function, frontend, CSS, configuration, database, remote, staging, commit, push or deploy change.

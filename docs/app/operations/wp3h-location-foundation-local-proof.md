# WP3H Location Foundation Local Proof

CURRENT PROVEN — LOCAL ONLY — WP3H EMPTY BOUNDED LOCATION FOUNDATION

Evidence date: 2026-07-28.

Responsibility: register the committed, empty, additive, local-only
implementation and isolated proof of the bounded location foundation. This
document is evidence, not a second domain contract, operational write
authorization, data-migration approval, caller-cutover approval, remote apply
record, production proof, verifier acceptance or NEa acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 1. Evidence Basis

| evidence | value |
|---|---|
| implementation commit | `3bb8d50cd7723ad631d75857df4e08d6ef0db311` |
| parent | `98df5993088a098c01d2dafab3f8a9c358f9374d` |
| subject | `Add WP3H location foundation` |
| migration | `supabase/migrations/20260728100000_app_location_foundation.sql` |
| migration SHA-256 | `c10c3492eda04b2c342200879be7e3b3e98f098269b19b3190d71f61c24c5aa5` |
| proof | `scripts/proofs/app-location-foundation.proof.ts` |
| proof SHA-256 | `2570ab01627ff32fed30fe589adf7d6d88af8087a4107307366ba08f5913f1d6` |
| Deno check | PASS |
| proof cases | WP3G-Q01 through WP3G-Q42 PASS; 42 of 42; zero FAIL |
| proof marker | `app-location-foundation-proof-ok` |
| committed file scope | exactly the migration and proof above |

The migration was applied directly to the local `supabase_db_enval` container,
database `postgres`, with `ON_ERROR_STOP`. It was not applied through normal
migration tooling and no migration-history record was added. No remote apply,
push or deploy occurred.

## 2. Exact CURRENT PROVEN Boundary

`CURRENT PROVEN — LOCAL ONLY` covers only:

- physical presence of the three additive tables in the local database;
- exact columns, constraints, indexes, triggers, policies and grants;
- immutable roots, observations and accepted versions;
- descriptor, provenance, temporal and supersession enforcement;
- an isolated local proof whose fixture groups roll back;
- absence of data population and caller changes.

Exactly three tables and 44 columns are locally proven:

| table | columns | final rows |
|---|---:|---:|
| `public.app_locations` | 5 | 0 |
| `public.app_location_address_observations` | 19 | 0 |
| `public.app_location_versions` | 20 | 0 |

The proof catalog inventory recorded 30 constraint records, 10 indexes, four
application triggers, one new focused deferred-guard function, reuse of the
existing immutable guard, three RLS policies and exact minimum grants.

## 3. Proven Root, Observation And Version Boundary

Locally proven root enforcement includes:

- opaque UUID identity and immutable creation provenance;
- exact closed `creation_basis` vocabulary;
- no address, EAN, party, case, ownership, MID, eligibility, settlement,
  lifecycle or update field on the root;
- rejection of UPDATE and DELETE.

Locally proven observation enforcement includes:

- exact seven-value observation vocabulary;
- exact postal-address or site-reference descriptor shape;
- normalized country, postal and optional text fields;
- positive house number when present;
- null-or-lowercase-64-hex source hashes;
- kind-specific payload, retrieval and freshness requirements;
- no raw payload, provider ID, storage path, document content, secret, e-mail
  or phone column;
- no automatic acceptance or version creation;
- rejection of UPDATE and DELETE.

Locally proven accepted-version enforcement includes:

- exactly one unique same-root primary observation per version;
- complete nonblank acceptance actor, request and opaque decision provenance;
- unique `acceptance_decision_ref`;
- acceptance time not later than recording time;
- exact postal-address or site-reference descriptor shape;
- half-open business validity with strictly increasing non-null end time;
- touching terminal periods allowed;
- overlapping final same-root leaf periods rejected at transaction end;
- same-root correction supersession;
- one direct successor, no self-reference or constructible cycle;
- nonblank correction reason exactly when superseding;
- successor recording time later than predecessor recording time;
- immutable predecessor history remaining queryable.

These controls establish internal location-foundation structure only. They do
not establish EAN, connection, aangeslotene, charge-point, meter, MID, kWh,
eligibility, physical-site match, ownership, authority, mandate, evidence
sufficiency, verifier acceptance or regulatory acceptance.

## 4. Proven Security Boundary

For all three tables:

- RLS is enabled;
- exactly one `deny_all` policy exists for `anon` and `authenticated`;
- `PUBLIC`, `anon` and `authenticated` have no table privileges;
- `service_role` has exactly `SELECT` and `INSERT`;
- `service_role` has no UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER
  privilege;
- no browser-write policy, authenticated read policy, customer projection or
  write RPC was added.

The new deferred guard is invoker mode, uses a fixed safe search path and has
no application-role execute grant. The existing immutable guard is reused
unchanged.

## 5. Proof Execution And Cleanup

The isolated local proof was executed with:

```sh
deno run --allow-env --allow-read --allow-run \
  scripts/proofs/app-location-foundation.proof.ts
```

All WP3G-Q01 through WP3G-Q42 cases passed. The final marker was:

```text
app-location-foundation-proof-ok
```

The cases prove exact file/object scope, catalog shape, initial and final
emptiness, vocabularies, descriptor shapes, hashes and freshness, provenance,
same-root cardinality, validity, supersession, transaction-end leaf overlap,
immutability, RLS, policies, grants, no write route, repository isolation,
rollback and protected-state equality.

Every fixture group ran inside a transaction and rolled back. No temporary
database or proof file remained. All three TARGET tables ended empty.

## 6. Protected Before/After State

The protected `app_*`/evidence count manifest was equal before and after the
proof:

| table | before | after |
|---|---:|---:|
| `app_audit_events` | 753 | 753 |
| `app_case_party_roles` | 0 | 0 |
| `app_cases` | 0 | 0 |
| `app_connection_ownership_periods` | 0 | 0 |
| `app_connection_periods` | 0 | 0 |
| `app_connections` | 0 | 0 |
| `app_customer_dossiers` | 328 | 328 |
| `app_customer_identities` | 73 | 73 |
| `app_customer_party_relationships` | 0 | 0 |
| `app_customers` | 211 | 211 |
| `app_dossier_chargers` | 68 | 68 |
| `app_dossier_document_files` | 286 | 286 |
| `app_dossier_document_slots` | 429 | 429 |
| `app_dossier_document_versions` | 164 | 164 |
| `app_dossier_legal_acceptances` | 60 | 60 |
| `app_dossier_locations` | 44 | 44 |
| `app_idempotency_keys` | 306 | 306 |
| `app_intake_audit_events` | 15 | 15 |
| `app_parties` | 0 | 0 |
| `app_party_organization_versions` | 0 | 0 |
| `app_party_person_versions` | 0 | 0 |
| `app_signup_intake_capabilities` | 0 | 0 |
| `app_signup_intake_files` | 0 | 0 |
| `app_signup_intakes` | 0 | 0 |

Protected file hashes were also equal before and after. The 44 current
`app_dossier_locations` rows were not copied, accepted, updated or deleted.

## 7. Explicitly Not CURRENT PROVEN

The following remain outside WP3H and are not CURRENT PROVEN:

- remote or production schema state;
- migration-history integration;
- an operational write RPC;
- advisory locking;
- idempotent operational writes;
- true two-transaction concurrency;
- mapping or population of the 44 current rows;
- physical-site matching;
- PDOK/BAG integration;
- verifier acceptance;
- EAN, connection or aangeslotene truth;
- charge-point relationships;
- case or allocation-point relationships;
- split/merge relationships;
- customer-safe projection;
- caller cutover;
- current-table retirement;
- final privacy and retention execution.

The next implementation step requires a separately approved operational
write-RPC and concurrency batch. Mapping/population, caller cutover and
retirement remain separate blocked batches.

## 8. Repository And Runtime Isolation

Commit `3bb8d50cd7723ad631d75857df4e08d6ef0db311` contains exactly the migration
and proof. It changes no canonical document, historical WP3 record, existing
migration or proof, baseline proposal, runtime, Edge Function, frontend, CSS,
package or configuration.

No runtime caller, browser route, customer projection or visible behavior was
added. CSS reuse is not applicable.

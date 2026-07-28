# WP3J Location Write RPCs Local Proof

CURRENT PROVEN — LOCAL ONLY — WP3J OPERATIONAL LOCATION WRITE RPCS AND CONCURRENCY

Evidence date: 2026-07-28.

Responsibility: register the committed local implementation, fresh-apply
rehearsal and isolated operational concurrency proof for the bounded location
write RPCs. This document is evidence, not caller authorization, data-migration
approval, remote apply evidence, production proof, verifier acceptance or NEa
acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 1. Evidence Basis

| evidence | value |
|---|---|
| implementation commit | `45d926478945fedc610ea02a0ff2b0d4f5f14be4` |
| parent | `685e85ff537c7055c9885992e098b88c8fd73025` |
| subject | `Add WP3J operational location write RPCs` |
| migration | `supabase/migrations/20260728140000_app_location_write_rpcs.sql` |
| migration SHA-256 | `171490e672a500d303ca097b8aececda8da7f98ae2411cc5e13cd1cb43a48593` |
| proof | `scripts/proofs/app-location-write-rpcs.proof.ts` |
| proof SHA-256 | `9330b086e82cff5ce40fcfa25ab0650023c1e3a92174a613a06035f8ee9d626d` |
| proof cases | `WP3J-Q01` through `WP3J-Q42` PASS; 42 of 42; zero FAIL |
| proof marker | `app-location-write-rpcs-proof-ok` |
| committed file scope | exactly the migration and proof above |

The migration was applied directly to the local `supabase_db_enval` database.
That direct local apply is not a remote apply and is not recorded in remote
migration history. No remote apply, database push or deploy occurred.

## 2. Exact RPC And Helper Manifest

Exactly four public operational RPCs are implemented:

- `public.app_create_location_root_v1`;
- `public.app_record_location_observation_v1`;
- `public.app_accept_initial_location_version_v1`;
- `public.app_correct_location_version_v1`.

Exactly three focused internal helpers support those operations:

- `public.app_location_write_idempotency_begin_v1`;
- `public.app_location_write_lock_v1`;
- `public.app_location_write_complete_v1`.

The four public RPCs are narrow operations rather than a dispatcher, generic
upsert, update API or delete API. The helpers respectively own location-write
idempotency reservation/replay/conflict handling, deterministic advisory-lock
derivation, and atomic fail-closed audit plus idempotency completion.

## 3. Proven Function Security

All four public RPCs:

- are `SECURITY DEFINER`;
- use `SET search_path = ''`;
- use schema-qualified object references;
- return bounded JSON responses with stable safe codes;
- revoke execute from `PUBLIC`, `anon` and `authenticated`;
- grant execute only to `service_role`.

The three internal helpers have no direct execute privilege for `PUBLIC`,
`anon`, `authenticated` or `service_role`. They are invoked only inside the
definer boundary.

`service_role` possession is a technical execution boundary, not domain
authorization. A future trusted server caller must still derive and enforce
actor, role, case/dossier, party/authority and use-case authorization.
Browser input is never authoritative provenance and the browser must not call
these RPCs directly.

## 4. Proven Operational Behavior

The local proof establishes:

- creation of one opaque statusless location root with explicit provenance;
- insertion of an immutable address observation under one existing root;
- no automatic acceptance of an observation;
- separate initial acceptance of one exact same-root observation;
- immutable same-root correction through one successor version;
- preservation of predecessor history;
- descriptor, provenance, source-hash, freshness, temporal, acceptance and
  supersession validation inherited from the WP3H foundation;
- bounded controlled rejects and rollback of unexpected errors;
- stable replay, idempotency conflict and concurrency-conflict semantics;
- per-operation deterministic advisory locking.

The package reuses `public.app_idempotency_keys`. It adds no idempotency table,
universal expiry duration, TTL or cleanup rule. Expiry remains supplied at the
trusted caller boundary and the existing cleanup/retention boundary is
unchanged.

The package reuses `public.app_audit_events` transactionally and fail closed
for successful writes and controlled rejects. An audit or idempotency
completion failure rolls the business transaction back. No legacy dossier
audit or fail-open critical-write path is used.

The migration creates no table and changes no WP3H foundation table. It adds
only the seven functions, their comments and their exact execute grants.

## 5. Fresh Migration Apply Proof

The proof builds a unique disposable database from the current local
schema-only shape. It imports no application, Auth or Storage data.

Before applying the definitive migration, the proof:

1. confirms the WP3H foundation tables, `app_audit_events` and
   `app_idempotency_keys` exist and are empty in the disposable database;
2. records the public-table inventory and a table-only WP3H foundation schema
   hash;
3. removes exactly the four public RPCs and three internal helpers by exact
   signature, without `CASCADE`;
4. proves all seven functions are absent.

It then applies exactly once:

```text
supabase/migrations/20260728140000_app_location_write_rpcs.sql
```

The apply uses `psql -X`, `--single-transaction` and `ON_ERROR_STOP=1` and
exits with code `0`.

After apply, the proof establishes:

- exactly seven WP3J function definitions exist;
- every normalized migration function-body SHA-256 equals the corresponding
  `pg_proc.prosrc` body SHA-256;
- the public-table inventory is unchanged;
- the WP3H foundation schema hash is unchanged;
- the five required business tables remain empty before behavior fixtures.

All four public RPCs are then actually invoked, so late-bound PL/pgSQL
reference errors cannot pass as catalog-only success.

## 6. Sequential And Concurrency Proof

The exact command was:

```sh
deno run --allow-env --allow-read --allow-run \
  scripts/proofs/app-location-write-rpcs.proof.ts
```

`WP3J-Q01` through `WP3J-Q34` prove catalog, security, grants, atomic writes,
replay/conflict, validation, immutable acceptance/correction, controlled
reject audit and rollback behavior against the fresh-applied definitions.

`WP3J-Q35` through `WP3J-Q41` use genuine separate spawned PostgreSQL
processes/connections and prove:

- concurrent identical root requests create one root and return consistent
  replay outcomes;
- concurrent different payloads under one key yield at most one success and
  one conflict;
- concurrent initial acceptance yields at most one accepted version;
- one `acceptance_decision_ref` in competing contexts yields at most one
  success;
- concurrent corrections of one predecessor yield at most one successor;
- writes on independent roots can both succeed;
- an exception/rollback releases the advisory lock and permits retry.

`WP3J-Q42` proves real local protected counts/hashes are unchanged and the
disposable database is removed. The final marker is:

```text
app-location-write-rpcs-proof-ok
```

## 7. Protected Before/After State

The real local before/after counts were equal:

| table | before | after |
|---|---:|---:|
| `app_locations` | 0 | 0 |
| `app_location_address_observations` | 0 | 0 |
| `app_location_versions` | 0 | 0 |
| `app_dossier_locations` | 44 | 44 |
| `app_audit_events` | 753 | 753 |
| `app_idempotency_keys` | 306 | 306 |

The wider protected `app_*`/evidence count and file-hash manifests were also
equal. The number of remaining `enval_wp3j_proof_%` disposable databases was
zero.

No current location row was mapped, copied, accepted, updated or deleted.

## 8. Exact CURRENT PROVEN Boundary

`CURRENT PROVEN — LOCAL ONLY` covers only:

- physical local presence of the four operational RPCs;
- the three focused internal helpers;
- the service-role-only technical execute boundary;
- safe definer functions and empty search paths;
- root creation;
- immutable observation recording;
- separate initial acceptance;
- immutable same-root correction by successor;
- transactionally serialized idempotency;
- transactionally fail-closed audit;
- controlled replay and conflict behavior;
- per-operation advisory locking;
- fresh application of the definitive migration;
- genuine local concurrency proof;
- absence of population, caller change and foundation mutation.

It does not cover:

- Edge Function or operations-caller authorization;
- end-user authorization;
- any direct browser RPC call;
- remote schema or production migration history;
- remote or production concurrency;
- 44-row mapping or data population;
- PDOK/BAG integration or physical-site matching;
- EAN, connection or aangeslotene truth;
- charger, charge-point, case or allocation-point location relationships;
- customer-safe projection or operations UI;
- caller cutover or current-table retirement;
- verifier, NEa or regulatory acceptance.

## 9. Next Bounded Step

The next readiness step is:

`WP3K — authorized operational location caller boundary`.

WP3K must decide, without adding browser-direct RPC access:

- which human and operational roles may invoke each operation;
- how a trusted server derives `actor_ref`;
- required case, dossier, party and authority context;
- which decisions require four eyes;
- which RPC each caller may use;
- stable safe error mapping and audit correlation.

Population, relation links, projection, remote apply, cutover and retirement
remain separate blocked work packages.

## 10. Repository And Runtime Isolation

Commit `45d926478945fedc610ea02a0ff2b0d4f5f14be4` contains exactly the migration
and proof. It changes no document, existing migration/proof, baseline proposal,
runtime, Edge Function, frontend, CSS, package or configuration.

The documentation registration batch changes documentation only. No visible
UI, runtime caller, Edge Function, customer projection or CSS behavior is part
of WP3J-DOC. CSS reuse is not applicable.

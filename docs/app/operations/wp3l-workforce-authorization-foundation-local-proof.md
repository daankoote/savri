# WP3L Workforce Location Authorization Foundation Local Proof

CURRENT PROVEN — LOCAL ONLY — WP3L WORKFORCE LOCATION AUTHORIZATION FOUNDATION AND CONCURRENCY

Evidence date: 2026-07-28.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 1. Evidence Identity

| field | exact value |
|---|---|
| implementation commit | `6485dad9a1cc481efc3f17095f90df72a219b315` |
| parent | `1baaef4174df7a002c8a3bebd1b526d68c7f1d1c` |
| subject | `Add WP3L workforce authorization foundation` |
| migration | `supabase/migrations/20260728180000_app_workforce_location_authorization_foundation.sql` |
| migration SHA-256 | `e29f0576be4b13cb4250f9e0e931b895e1fa02723b8d8cdac2cffa96006319ac` |
| proof | `scripts/proofs/app-workforce-location-authorization-foundation.proof.ts` |
| proof SHA-256 | `f451ab67902ebe1a2612ebc4ab23e4a8777fed95b376fa4936942e1e46d55acb` |
| commit manifest | exactly the migration and proof above |
| official TKV snapshot SHA-256 | `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` |

The implementation commit is additive. It contains no Edge Function, runtime
helper, frontend, CSS, bootstrap runbook, population, remote apply or
deployment artifact.

## 2. Exact Seven-Table Manifest

1. `public.app_workforce_identities`
2. `public.app_workforce_identity_states`
3. `public.app_workforce_capability_assignments`
4. `public.app_case_location_relations`
5. `public.app_workforce_scope_assignments`
6. `public.app_workforce_operation_requests`
7. `public.app_workforce_operation_reviews`

The locally applied tables all contain zero rows. No eighth workforce,
generic-role, permission, policy, resource, bootstrap or emergency-override
table exists. The model is not a generic RBAC engine and contains no JSONB
authorization document.

The bounded responsibilities proven locally are:

- one opaque workforce root bound structurally to one `auth.users` row,
  without population;
- append-only `active`, `suspended` and terminal `revoked` lifecycle history;
- temporal grant/revoke chains for six closed capabilities;
- explicit temporal case/location workflow-scope relations;
- temporal workforce capability scope, with the exact case-only
  `location.root.create` exception;
- immutable maker intent for initial acceptance and correction;
- one immutable distinct-checker approve/reject decision over the exact
  payload hash;
- guarded execution-eligibility revalidation and at-most-once transition.

## 3. Exact Capability Vocabulary

- `location.root.create`
- `location.observation.record`
- `location.version.accept.prepare`
- `location.version.accept.approve`
- `location.version.correct.prepare`
- `location.version.correct.approve`

Wildcard, `admin`, human title, prefix matching and arbitrary custom
capability values are rejected.

## 4. Exact New Function Inventory

### Invoker functions

These six functions are invoker functions with
`search_path = pg_catalog, public`:

1. `public.app_workforce_identity_requires_initial_state()`
2. `public.app_workforce_identity_states_insert_guard()`
3. `public.app_workforce_capability_assignments_insert_guard()`
4. `public.app_case_location_relations_insert_guard()`
5. `public.app_workforce_scope_is_authorized_v1(uuid, uuid, text, uuid, uuid, timestamptz)`
6. `public.app_workforce_scope_assignments_insert_guard()`

### SECURITY DEFINER trigger entrypoints

These three trigger entrypoints are `SECURITY DEFINER` with an exact empty
search path:

1. `public.app_workforce_operation_requests_insert_guard()`
2. `public.app_workforce_operation_reviews_insert_guard()`
3. `public.app_workforce_operation_requests_update_guard()`

The definer boundary permits table-trigger execution to call the internal
eligibility function without granting direct `service_role` execute on that
helper. All object references in these bodies are schema-qualified.

`PUBLIC`, `anon`, `authenticated` and `service_role` have no direct execute
grant on any of the nine internal functions.

## 5. Exact Trigger Inventory

| trigger | table | timing/event | function |
|---|---|---|---|
| `app_workforce_identity_initial_state_guard` | `app_workforce_identities` | deferred after insert | `app_workforce_identity_requires_initial_state()` |
| `app_workforce_identities_immutable` | `app_workforce_identities` | before update/delete | `app_wp2b_i_immutable_guard()` |
| `app_workforce_identity_states_immutable` | `app_workforce_identity_states` | before update/delete | `app_wp2b_i_immutable_guard()` |
| `app_workforce_identity_states_insert_guard` | `app_workforce_identity_states` | before insert | `app_workforce_identity_states_insert_guard()` |
| `app_workforce_capability_assignments_immutable` | `app_workforce_capability_assignments` | before update/delete | `app_wp2b_i_immutable_guard()` |
| `app_workforce_capability_assignments_insert_guard` | `app_workforce_capability_assignments` | before insert | `app_workforce_capability_assignments_insert_guard()` |
| `app_case_location_relations_immutable` | `app_case_location_relations` | before update/delete | `app_wp2b_i_immutable_guard()` |
| `app_case_location_relations_insert_guard` | `app_case_location_relations` | before insert | `app_case_location_relations_insert_guard()` |
| `app_workforce_scope_assignments_immutable` | `app_workforce_scope_assignments` | before update/delete | `app_wp2b_i_immutable_guard()` |
| `app_workforce_scope_assignments_insert_guard` | `app_workforce_scope_assignments` | before insert | `app_workforce_scope_assignments_insert_guard()` |
| `app_workforce_operation_requests_insert_guard` | `app_workforce_operation_requests` | before insert | `app_workforce_operation_requests_insert_guard()` |
| `app_workforce_operation_requests_update_guard` | `app_workforce_operation_requests` | before update/delete | `app_workforce_operation_requests_update_guard()` |
| `app_workforce_operation_reviews_immutable` | `app_workforce_operation_reviews` | before update/delete | `app_wp2b_i_immutable_guard()` |
| `app_workforce_operation_reviews_insert_guard` | `app_workforce_operation_reviews` | before insert | `app_workforce_operation_reviews_insert_guard()` |

The six immutable triggers above reuse
`public.app_wp2b_i_immutable_guard()`. New domain guards were added only where
the workforce, temporal relation, object-scope, maker/checker or execution
semantics differ from the existing immutable function.

## 6. RLS, Policies And Grants

All seven tables have RLS enabled and exactly one `deny_all` policy for
`anon` and `authenticated`.

- `PUBLIC`, `anon` and `authenticated` have no table privileges.
- `service_role` has exactly `SELECT` and `INSERT` on each table.
- `service_role` has no direct `UPDATE`, `DELETE` or `TRUNCATE`.
- Browser roles have no direct read or write route.
- Technical possession of `service_role` never proves a human principal,
  lifecycle state, capability, scope or checker decision.

The proof also performs a real `SET LOCAL ROLE service_role` request/review
trigger route. It succeeds inside the disposable database and is rolled back.

## 7. Audit And Idempotency Boundary

The migration additively extends the existing
`app_audit_events_scope_type_chk` vocabulary with exactly:

- `workforce_identity`
- `workforce_authorization`
- `location_operation_request`

No audit row was written by migration apply or proof. Request and review rows
retain bounded request/idempotency correlation without copying a raw payload,
e-mail, name, title, phone, JWT or address.

No fixed retention duration or automatic cleanup was introduced.

## 8. Fresh-Apply And Protected-State Method

The proof:

1. checks the real local catalog and protected fingerprint inside read-only
   transactions;
2. creates a unique database from `template0`;
3. imports the controlled local schema with `pg_dump --schema-only`;
4. removes only the copied WP3L tables and functions from the disposable
   database;
5. applies the definitive migration exactly once with `psql -X`,
   `--single-transaction` and `ON_ERROR_STOP=1`;
6. confirms fresh-apply exit code `0`, exact table inventory and zero target
   rows;
7. runs catalog, sequential, negative, lifecycle, scope, maker/checker,
   execution and concurrency behavior against the fresh objects;
8. removes the disposable database in `finally`;
9. proves the real local protected fingerprint unchanged, all seven local
   target tables empty and zero disposable databases remaining.

The migration source hash is checked again during the proof. No full Supabase
reset, internet, remote project, migration-history manipulation or real local
business-row mutation occurs.

## 9. Exact Q01-Q48 Result

```text
WP3L-B-Q01: PASS
WP3L-B-Q02: PASS
WP3L-B-Q03: PASS
WP3L-B-Q04: PASS
WP3L-B-Q05: PASS
WP3L-B-Q06: PASS
WP3L-B-Q07: PASS
WP3L-B-Q08: PASS
WP3L-B-Q09: PASS
WP3L-B-Q10: PASS
WP3L-B-Q11: PASS
WP3L-B-Q12: PASS
WP3L-B-Q13: PASS
WP3L-B-Q14: PASS
WP3L-B-Q15: PASS
WP3L-B-Q16: PASS
WP3L-B-Q17: PASS
WP3L-B-Q18: PASS
WP3L-B-Q19: PASS
WP3L-B-Q20: PASS
WP3L-B-Q21: PASS
WP3L-B-Q22: PASS
WP3L-B-Q23: PASS
WP3L-B-Q24: PASS
WP3L-B-Q25: PASS
WP3L-B-Q26: PASS
WP3L-B-Q27: PASS
WP3L-B-Q28: PASS
WP3L-B-Q29: PASS
WP3L-B-Q30: PASS
WP3L-B-Q31: PASS
WP3L-B-Q32: PASS
WP3L-B-Q33: PASS
WP3L-B-Q34: PASS
WP3L-B-Q35: PASS
WP3L-B-Q36: PASS
WP3L-B-Q37: PASS
WP3L-B-Q38: PASS
WP3L-B-Q39: PASS
WP3L-B-Q40: PASS
WP3L-B-Q41: PASS
WP3L-B-Q42: PASS
WP3L-B-Q43: PASS
WP3L-B-Q44: PASS
WP3L-B-Q45: PASS
WP3L-B-Q46: PASS
WP3L-B-Q47: PASS
WP3L-B-Q48: PASS
app-workforce-location-authorization-foundation-proof-ok
```

The 48 assertions cover the exact catalog/RLS/ACL/function boundary;
bootstrap and no-inference negatives; identity lifecycle; capability,
case/location and workforce-scope temporal rules; operation vocabulary;
immutable intent and review; self-approval prevention; execution-time
revalidation; rollback; protected equality and cleanup.

## 10. Real Concurrency Evidence

- Review race: two genuine separate `psql` processes/connections attempt
  competing approve/reject rows for one request. Exactly one process succeeds,
  the other is rejected, and exactly one definitive review remains.
- Execution race: two genuine separate `psql` processes/connections attempt
  the same approved request transition. Exactly one succeeds, the other is
  rejected, and exactly one execution remains.
- Suspension/revocation of maker or checker before execution blocks the old
  request.
- Capability revocation, scope revocation or case/location unlink before
  execution blocks the old request.
- No WP3J RPC is called. This package proves authorization truth and execution
  eligibility only.

## 11. Protected Before/After Counts

| protected relation | before | after |
|---|---:|---:|
| `auth.users` | 5 | 5 |
| `app_customers` | 211 | 211 |
| `app_customer_identities` | 73 | 73 |
| `app_cases` | 0 | 0 |
| `app_case_party_roles` | 0 | 0 |
| `app_locations` | 0 | 0 |
| `app_location_address_observations` | 0 | 0 |
| `app_location_versions` | 0 | 0 |
| `app_dossier_locations` | 44 | 44 |
| `app_audit_events` | 753 | 753 |
| `app_idempotency_keys` | 306 | 306 |

WP3J function fingerprints are identical before and after. All seven real
local WP3L tables contain zero rows. The direct local apply was not inserted
into migration history. Zero disposable proof databases remain.

## 12. CURRENT PROVEN Boundary

Only the following is `CURRENT PROVEN — LOCAL ONLY`:

- the exact seven-table empty foundation;
- workforce/Auth binding structure without a binding row;
- append-only active/suspended/revoked lifecycle;
- six closed capabilities and temporal assignments;
- temporal case/location workflow-scope relations;
- temporal workforce object scope;
- immutable operation requests and distinct immutable checker reviews;
- database-enforced self-approval rejection;
- execution-time authority revalidation;
- review and execution concurrency;
- RLS, policies, grants, function security and local fresh apply.

The following remains `NOT IMPLEMENTED`, `OPEN` or `BLOCKED`:

- workforce bootstrap or population;
- assignment-authority runtime or fixed bootstrap identities;
- authorized operational Edge callers or shared runtime authorization helper;
- operations UI, customer UI or customer self-service acceptance;
- system-ingestion principal;
- automatic approved-request-to-WP3J execution;
- 44-row mapping/population;
- PDOK/BAG, EAN, connection or aangeslotene truth;
- remote apply, production proof, cutover or current-object retirement;
- regulatory, NEa or verifier acceptance.

## 13. Next Readiness Gate

`WP3L-D01` through `WP3L-D18` are APPROVED TARGET and the bounded WP3L-B
foundation is locally proven. No caller implementation follows from this
proof.

The next docs/readiness batch is:

`WP3M — authorized operational location callers and WP3J execution bridge readiness`

WP3M must first decide four specific caller contracts, prepare/approve/execute
flow per operation type, atomic correlation between one approved workforce
request and the WP3J result, execution ownership, caller-to-RPC mapping, safe
errors, audit/idempotency correlation, revocation races between approval and
WP3J call, and the prohibition on browser-direct database calls.

WP3M grants no implementation authorization.

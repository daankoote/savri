# WP3N Location Callers And Execution Bridge Local Proof

CURRENT PROVEN — LOCAL ONLY — WP3N AUTHORIZED OPERATIONAL LOCATION CALLERS AND ATOMIC WP3J EXECUTION BRIDGE

Evidence date: 2026-07-29.

Responsibility: register the committed local WP3N caller, bridge, fresh-apply,
atomicity and concurrency evidence. This is not workforce bootstrap,
population, assignment-authority runtime, operations UI, remote apply,
deployment, production, cutover, verifier acceptance or regulatory acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 1. Evidence Identity And Exact Commit Manifest

| field | exact value |
|---|---|
| implementation commit | `6705fa3baf046510d70b8502da6058009b30b2f3` |
| parent | `961dd90b529e336f67322b951d58998edfb66c92` |
| subject | `Add WP3N location operation callers and bridge` |
| committed file count | exactly `7` |
| official local TKV SHA-256 | `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` |

| committed artifact | SHA-256 |
|---|---|
| `scripts/proofs/api-app-ops-location-callers.proof.ts` | `3b8a9724941c59cb00e30204b9b7e84ced074fe8b8c7c84a32711226eacb047c` |
| `supabase/functions/_shared/app_workforce_authorization.ts` | `85ce30ff3b119a7d4a09062651e8c9e30dbf6f20d9b8a990a940b9a39cfcc30a` |
| `supabase/functions/api-app-ops-location-observation-record/index.ts` | `b7cd8c8f37d00198cf73e3affefc0cdb1601837275ccf112c5488b98ceefd6d5` |
| `supabase/functions/api-app-ops-location-root-create/index.ts` | `08bf3d77e1c7a4e1c02b1579de5ef2244cec0bef0a06f7bbdd31dc8e75bfce82` |
| `supabase/functions/api-app-ops-location-version-accept/index.ts` | `4349e54d787cbfc6c6088c20a2ec6f29367ae694e70935af45ac8453c9c0b7b9` |
| `supabase/functions/api-app-ops-location-version-correct/index.ts` | `48b2c4abc25bdd587150dad633c4af37aeb4d456c101b23bad2bb7c08a87996d` |
| `supabase/migrations/20260728220000_app_workforce_location_operation_bridge_rpcs.sql` | `9b71230ed2b2a91691f763e4cd539e2d923c996c31ca9297ae445cf62807230b` |

The implementation commit contains exactly these seven files. It adds no
table, workforce row, bootstrap identity, hardcoded Auth ID, generic
dispatcher, generic RBAC engine or emergency override.

## 2. Exact Four Caller Families And Closed Action Maps

| Edge caller | closed action | fixed bridge RPC |
|---|---|---|
| `api-app-ops-location-root-create` | `execute` | `app_ops_location_root_create_v1` |
| `api-app-ops-location-observation-record` | `execute` | `app_ops_location_observation_record_v1` |
| `api-app-ops-location-version-accept` | `prepare` | `app_ops_location_accept_prepare_v1` |
| `api-app-ops-location-version-accept` | `review` | `app_ops_location_accept_review_v1` |
| `api-app-ops-location-version-accept` | `execute` | `app_ops_location_accept_execute_v1` |
| `api-app-ops-location-version-correct` | `prepare` | `app_ops_location_correct_prepare_v1` |
| `api-app-ops-location-version-correct` | `review` | `app_ops_location_correct_review_v1` |
| `api-app-ops-location-version-correct` | `execute` | `app_ops_location_correct_execute_v1` |

The shared `app_workforce_authorization.ts` adapter owns only verified bearer
transport, request metadata, bounded normalization, canonical hashing,
configured idempotency expiry, safe error mapping and one lookup in the
compile-time action map. It performs no workforce or case/location table join
and owns no authorization truth. The browser cannot choose an RPC name,
workforce identity, capability, scope assignment, checker or execution
outcome.

## 3. Exact Database Function Manifest

All eight public bridge functions have the exact signature:

```text
public.app_ops_location_root_create_v1(uuid, text, text, text, timestamptz, jsonb)
public.app_ops_location_observation_record_v1(uuid, text, text, text, timestamptz, jsonb)
public.app_ops_location_accept_prepare_v1(uuid, text, text, text, timestamptz, jsonb)
public.app_ops_location_accept_review_v1(uuid, text, text, text, timestamptz, jsonb)
public.app_ops_location_accept_execute_v1(uuid, text, text, text, timestamptz, jsonb)
public.app_ops_location_correct_prepare_v1(uuid, text, text, text, timestamptz, jsonb)
public.app_ops_location_correct_review_v1(uuid, text, text, text, timestamptz, jsonb)
public.app_ops_location_correct_execute_v1(uuid, text, text, text, timestamptz, jsonb)
```

The one private authorization resolver has the exact signature:

```text
public.app_ops_location_authorization_resolve_v1(uuid, text, uuid, uuid, timestamptz)
```

There are no additional private helpers in the migration. The bridge reuses
the existing WP3J idempotency, locking, audit-completion and business-write
functions without changing them.

## 4. Function Security And Execute Grants

All eight public bridge RPCs:

- are `SECURITY DEFINER`;
- have exact empty `search_path`;
- use schema-qualified database objects;
- have execute revoked from `PUBLIC`, `anon`, `authenticated` and initially
  `service_role`;
- grant execute back only to `service_role`.

The private resolver is an invoker function with empty `search_path`.
`PUBLIC`, `anon`, `authenticated` and `service_role` have no direct execute
privilege on it. It is reachable only from the eight definer bridge bodies.
Possession of `service_role` remains a technical execution boundary, never
human, workforce, case, representation or regulatory authority.

## 5. Database-Authoritative Authorization And Operation Semantics

The private resolver binds the verified `auth.users.id` to exactly one
workforce root and evaluates current active lifecycle, one exact closed
capability, exact temporal case/location scope and the applicable active
case/location relation. Root creation is the only case-only scope exception.
No customer identity, case-party role, representation authority, JWT claim or
Edge calculation substitutes for this database truth.

The proven operation behavior is:

- root creation calls the exact WP3J root RPC and inserts the first
  case/location relation in the same transaction; relation failure rolls back
  root, audit and idempotency;
- observation recording calls the exact WP3J observation RPC and remains
  non-accepting;
- acceptance prepare creates one immutable exact-hash maker request and calls
  no WP3J function;
- acceptance review creates one immutable exact-hash approve/reject decision
  by a distinct checker and calls no WP3J function;
- correction prepare creates one immutable predecessor-bound exact-hash maker
  request and calls no WP3J function;
- correction review creates one immutable exact-hash approve/reject decision
  by a distinct checker and calls no WP3J function;
- acceptance and correction execute are callable only by the original maker;
- execute locks and revalidates the approved request, maker, checker,
  lifecycle, capabilities, scope, relation and payload at execution time;
- execute calls the exact WP3J acceptance or correction RPC and atomically
  marks the WP3L request executed with the returned version reference;
- a WP3J reject leaves the request pending and a required-request WP3J write
  cannot commit separately from its WP3L execution marking.

Idempotent replay returns the same safe response without duplicate business,
request, review, relation, audit or execution state. Reuse of one key with a
different payload returns `idempotency_conflict`. Caller authorization audit
and WP3J business audit remain distinct, correlated, transactional and fail
closed. The closed transport vocabulary is:
`authentication_required`, `workforce_identity_missing`,
`workforce_identity_inactive`, `role_not_authorized`,
`capability_not_authorized`, `case_scope_denied`, `location_scope_denied`,
`case_location_relation_missing`, `operation_request_missing`,
`operation_request_not_pending`, `operation_review_missing`,
`operation_not_approved`, `four_eyes_required`,
`self_approval_forbidden`, `payload_hash_mismatch`,
`authorization_changed`, `idempotency_conflict`,
`concurrent_write_conflict`, `operation_already_executed`, `invalid_input`,
`location_business_rejected`, `internal_error` and `ok`. Public responses
expose no SQL, schema, constraint, JWT, raw payload, PII or out-of-scope
existence detail.

## 6. Fresh Apply, Atomicity And Real Concurrency

The proof created a unique disposable database from the controlled local
schema-only shape, removed the copied nine WP3N function definitions by exact
signature and applied the definitive WP3N migration exactly once with
`psql -X`, `--single-transaction` and `ON_ERROR_STOP=1`.

The fresh apply exited successfully. Exactly eight public bridge RPCs and one
private resolver resulted. Normalized function-body fingerprints in the
database matched the definitive migration. The WP3J and WP3L function
fingerprints remained unchanged.

The integrated proof established:

- root plus first case/location relation both-or-neither atomicity;
- non-accepting observation behavior;
- prepare/review isolation from WP3J;
- exact maker/checker and execution ownership;
- atomic WP3J write plus WP3L execution-state transition;
- genuine separate-connection review race with exactly one review;
- genuine separate-connection execution race with one WP3J write and one
  execution marking;
- genuine revocation-versus-execution race where the authorization-changing
  transaction serializes first, execute returns `authorization_changed`, the
  request remains pending and no location version is created;
- replay, payload-conflict, controlled-reject, rollback, safe-error and
  fail-closed audit behavior.

Disposable cleanup completed in `finally`. Zero `enval_wp3n_proof_%`
databases remained.

## 7. Exact Proof Result

```text
WP3N-Q01: PASS
WP3N-Q02: PASS
WP3N-Q03: PASS
WP3N-Q04: PASS
WP3N-Q05: PASS
WP3N-Q06: PASS
WP3N-Q07: PASS
WP3N-Q08: PASS
WP3N-Q09: PASS
WP3N-Q10: PASS
WP3N-Q11: PASS
WP3N-Q12: PASS
WP3N-Q13: PASS
WP3N-Q14: PASS
WP3N-Q15: PASS
WP3N-Q16: PASS
WP3N-Q17: PASS
WP3N-Q18: PASS
WP3N-Q19: PASS
WP3N-Q20: PASS
WP3N-Q21: PASS
WP3N-Q22: PASS
WP3N-Q23: PASS
WP3N-Q24: PASS
WP3N-Q25: PASS
WP3N-Q26: PASS
WP3N-Q27: PASS
WP3N-Q28: PASS
WP3N-Q29: PASS
WP3N-Q30: PASS
WP3N-Q31: PASS
WP3N-Q32: PASS
WP3N-Q33: PASS
WP3N-Q34: PASS
WP3N-Q35: PASS
WP3N-Q36: PASS
WP3N-Q37: PASS
WP3N-Q38: PASS
WP3N-Q39: PASS
WP3N-Q40: PASS
WP3N-Q41: PASS
WP3N-Q42: PASS
WP3N-Q43: PASS
WP3N-Q44: PASS
WP3N-Q45: PASS
WP3N-Q46: PASS
WP3N-Q47: PASS
WP3N-Q48: PASS
WP3N-Q49: PASS
WP3N-Q50: PASS
WP3N-Q51: PASS
WP3N-Q52: PASS
WP3N-Q53: PASS
WP3N-Q54: PASS
WP3N-Q55: PASS
WP3N-Q56: PASS
WP3N-Q57: PASS
WP3N-Q58: PASS
WP3N-Q59: PASS
WP3N-Q60: PASS
WP3N-Q61: PASS
WP3N-Q62: PASS
WP3N-Q63: PASS
WP3N-Q64: PASS
api-app-ops-location-callers-proof-ok
```

## 8. Protected Before/After Evidence

| protected table | before | after |
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

All seven real local WP3L tables were zero rows before and after. The complete
protected fingerprint, including WP3J and WP3L function fingerprints, was
equal before and after. Proof fixtures existed only in the disposable
database.

The direct local migration apply is not recorded in migration history. No
remote apply, function deploy, push, production proof or cutover occurred.

## 9. Exact CURRENT PROVEN Boundary

`CURRENT PROVEN — LOCAL ONLY` covers only:

- four operation-family Edge callers and their closed action allowlists;
- the shared Edge transport adapter without authorization truth;
- eight purpose-specific bridge RPCs and the private Auth-to-workforce
  resolver;
- database-authoritative workforce authorization;
- atomic root/relation and non-accepting observation writes;
- immutable acceptance/correction prepare and review;
- distinct maker/checker, original-maker execution and execution-time
  revalidation;
- atomic WP3J business write and WP3L execution state;
- idempotency, fail-closed audit and safe errors;
- definitive local fresh apply, body equality, rollback and genuine
  concurrency proof.

It does not cover real workforce bootstrap or population, assignment-authority
runtime, fixed bootstrap identities, operations UI, customer UI,
system-ingestion principal, 44-row population, PDOK/BAG,
EAN/aangeslotene/connection, remote apply, function deployment, production,
cutover or regulatory/verifier acceptance.

## 10. Remaining Gates And Next Readiness Batch

WP3M-D01 through WP3M-D18 are APPROVED TARGET. WP3N proves their bounded local
caller/bridge implementation only. Workforce bootstrap, workforce population,
assignment authority and operations UI remain `NOT IMPLEMENTED`. Remote apply
and cutover remain `OPEN/BLOCKED`.

The next readiness batch is:

`WP3O — controlled pilot workforce bootstrap and assignment authority readiness`

WP3O must first decide bootstrap custody; the designated executor and
independent checker; the first workforce identity lifecycle; initial
capability and case/location scope assignments; assignment and revocation
authority; dual customer/workforce-binding conflict controls; a single-use
idempotent bootstrap runbook; and audit, rollback and recovery evidence.
Browser self-enrollment is prohibited. No remote execution follows without
separate explicit approval.

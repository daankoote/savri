# WP3L Workforce Authorization Foundation Decisions

DRAFT — WP3L WORKFORCE AUTHORIZATION FOUNDATION — EXACT SCHEMA DECISION REQUIRED

Audit date: 2026-07-28.

## 1. Readiness Verdict

READY FOR DECISION — BOUNDED WORKFORCE AUTHORIZATION FOUNDATION PACKAGE CAN BE APPROVED

This verdict means that one exact bounded physical package can be decided. It
does not authorize a migration, proof, SQL write, database change, Edge
Function, runtime helper, frontend, remote apply or deployment. Every
recommendation in this document remains unapproved until Daan explicitly
decides the complete package.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2. Approved Input And Non-Reopening Rule

WP3K choices D01 through D12 are approved TARGET input:

- one specific Edge Function per operational use case;
- verified Auth is only the credential layer;
- workforce identity and capability authorization are separate foundations;
- object authorization uses explicit case/location scope;
- initial acceptance and correction require different maker and checker
  workforce identities;
- there is no emergency override;
- there is no browser-direct RPC call;
- representation authority grants no internal reviewer authority;
- `service_role` is only the technical database caller;
- actor, scope and authorization context are server-derived;
- audit/idempotency correlation and safe closed errors are mandatory;
- negative and real-concurrency proof is mandatory.

WP3L-A fixes a proposed physical schema for those approved boundaries. It does
not reopen WP3K and does not mark any physical choice approved.

## 3. Evidence And Collision Result

| evidence | result |
|---|---|
| repository / branch | `/Users/daankoote/dev/enval` / `main` |
| start HEAD | `a23f57ab18c3be7fe1c07cbc325fe9dcc4421837` |
| parent / subject | `ce7be9fea4d4efef66aa9585c7763bb3a6593296` / `Record WP3K location caller readiness` |
| current foundations | customer identity, case/case-party role, location root/observation/version, audit and idempotency exist locally |
| WP3J | four public service-role-only RPCs and three non-executable helpers exist locally |
| WP3J runtime caller | none |
| workforce identity/capability object | none |
| case/location scope object | none |
| location operation request/review object | none |
| read-only catalog | transaction reported `transaction_read_only=on` |
| TKV SHA-256 | `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` |

The only current table matching a broad `capabilit` name scan is
`app_signup_intake_capabilities`. It controls pre-auth signup intake and is
not a workforce capability object or reuse candidate.

Current identities and roles stay separated:

- `app_customer_identities` binds a customer account, not workforce;
- `app_case_party_roles` records `service_recipient` or `case_contact`, not
  an internal capability;
- representation authority remains `NOT SCHEMA READY` and is not internal
  review authority;
- `service_role` is not a human principal;
- one `auth.users` row may never inherit customer powers into workforce or
  workforce powers into customer scope automatically.

CSS reuse: not applicable.

## 4. Bounded Target And Exclusions

The package covers only:

- bind one workforce principal to one verified Auth user;
- activate, suspend and revoke the workforce principal with history;
- grant, expire and revoke six closed capabilities;
- create an explicit case/location relation;
- scope one workforce capability to one case and, except for root creation,
  one location;
- record maker intent for initial acceptance or correction;
- record one distinct checker decision over the exact maker payload hash;
- execute one approved intent at most once;
- correlate later Edge caller, authorization, idempotency, audit and WP3J
  outcomes.

It excludes Edge Functions, shared runtime helpers, all UI, customer
self-service acceptance, system-ingestion principals, emergency override,
joint signing, K-of-N, chains, subdelegation, population, current-row mapping,
EAN/charger/allocation-point links, PDOK/BAG, projection, remote, production,
cutover and retirement.

## 5. Model Comparison

| option | shape | strengths | failure/risk | result |
|---|---|---|---|---|
| A | five tables combining identity/lifecycle and case/location/scope | fewer tables | lifecycle, relation and assignment truths change independently; combined rows create ambiguous revocation/history and weak FKs | reject |
| B | seven normalized tables | exact temporal reconstruction, stable FKs, separate object scope, immutable maker/review facts, bounded capabilities | more guards and proof cases | recommend, unapproved |
| C | extend customer identity or case-party role objects | superficially small | customer, representation, case participation and workforce authority become inferable from one another | reject as high risk |

Option B is not a generic RBAC engine. It has six fixed location capabilities,
one exact case/location scope form and two material operation types.

## 6. Exact Seven-Table Manifest

| table | sole responsibility |
|---|---|
| `app_workforce_identities` | immutable workforce principal root and unique Auth binding |
| `app_workforce_identity_states` | append-only active/suspended/revoked lifecycle events |
| `app_workforce_capability_assignments` | append-only grant/revoke event chains for one closed capability |
| `app_case_location_relations` | append-only link/unlink event chains between one case and one location |
| `app_workforce_scope_assignments` | append-only grant/revoke event chains binding identity, capability and object scope |
| `app_workforce_operation_requests` | immutable maker intent plus the only guarded pending-to-executed transition |
| `app_workforce_operation_reviews` | one immutable checker approve/reject decision over one exact request hash |

No eighth table, generic role table, permission catalog, JSONB authorization
document or representation link is proposed.

## 7. Shared Physical Rules

- IDs are server-assigned `uuid` values with `gen_random_uuid()`.
- Business and lifecycle times are `timestamptz`.
- Half-open validity is `[effective_at, valid_until)`.
- Recording defaults use `clock_timestamp()`.
- All references use `ON DELETE RESTRICT`.
- Every provenance, decision, reason, request and actor reference is bounded
  nonblank text; actor references contain no e-mail, name or title.
- Payload hashes are exactly 64 lowercase hexadecimal characters.
- Core authorization relations use columns/FKs, never generic JSONB.
- `metadata jsonb` is absent from the seven tables.
- Event-chain rows are immutable and use one predecessor and at most one
  direct successor.
- Deterministic advisory locks serialize identity, capability, case/location,
  scope, review and execution contention.
- Deferred transaction-end guards prove chain linearity, no overlap and
  cross-table validity.
- All tables enable RLS and have one `deny_all` policy for `anon` and
  `authenticated`.
- `PUBLIC`, `anon` and `authenticated` receive no table privileges.
- `service_role` receives `SELECT` and `INSERT` on all seven tables, never
  `DELETE`; it receives no direct `UPDATE`.
- The sole request execution transition runs through later exact
  service-role-only `SECURITY DEFINER` execution functions with empty search
  paths. Those function bodies are implementation work, not created here.
- Trigger/constraint helpers have no `PUBLIC`, browser or direct
  service-role execute.
- No normal hard delete is allowed while retention remains undecided.

## 8. Exact Physical Tables

### 8.1 `app_workforce_identities`

| column | type | null | default / rule |
|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()`; primary key |
| `auth_user_id` | `uuid` | no | FK `auth.users(id)` |
| `workforce_ref` | `text` | no | generated stored as `app_workforce_identity:` plus `id` |
| `created_at` | `timestamptz` | no | `clock_timestamp()` |
| `created_by_actor_ref` | `text` | no | opaque bootstrap authority |
| `creation_decision_ref` | `text` | no | attributable bootstrap decision |
| `request_id` | `text` | no | request/audit correlation |

Physical rules:

- PK `id`; `UNIQUE (auth_user_id)`, `UNIQUE (workforce_ref)` and
  `UNIQUE (request_id)`.
- `workforce_ref` must equal the generated value; actor/decision/request
  references are nonblank and length-bounded to 200/200/128.
- The Auth FK is restrictive. E-mail, name, title, customer ID, party ID and
  role are absent.
- All columns are immutable; UPDATE/DELETE are rejected.
- Indexes: unique Auth, unique workforce ref and `created_at`.
- Initial active state must be inserted atomically in the state table.
- Audit relation: same transaction inserts
  `workforce_identity_bootstrapped` with `worker`/`admin`/`system` actor
  classification and the opaque references.
- Idempotency relation: the bootstrap service owns one shared
  `app_idempotency_keys` row; this table stores only `request_id`.
- Privacy: confidential internal identifier only; no direct PII beyond the
  restricted Auth UUID.
- Retention: no deletion duration is selected; revocation preserves the root
  until a separately approved workforce/audit retention schedule permits an
  action.

### 8.2 `app_workforce_identity_states`

| column | type | null | default / rule |
|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()`; PK |
| `workforce_identity_id` | `uuid` | no | FK workforce identity |
| `state` | `text` | no | `active`, `suspended`, `revoked` |
| `effective_at` | `timestamptz` | no | caller-supplied business time |
| `recorded_at` | `timestamptz` | no | `clock_timestamp()` |
| `decision_ref` | `text` | no | lifecycle authority decision |
| `reason_ref` | `text` | conditional | required for suspended/revoked |
| `recorded_by_actor_ref` | `text` | no | opaque authority actor |
| `request_id` | `text` | no | correlation |
| `supersedes_state_id` | `uuid` | conditional | self-FK; null only for initial active state |

Physical rules:

- PK `id`; unique direct successor on nonnull `supersedes_state_id`;
  `UNIQUE (workforce_identity_id, effective_at)` and `UNIQUE (request_id)`.
- Root state is `active`. Allowed transitions are active-to-suspended,
  active-to-revoked, suspended-to-active and suspended-to-revoked. Revoked is
  terminal.
- A successor preserves identity, supersedes the current leaf, has strictly
  later `effective_at` and `recorded_at`, and cannot self-reference/cycle.
- All rows are immutable; no UPDATE/DELETE.
- Indexes: identity/effective descending and leaf/supersession.
- Current state is the latest effective leaf at the authorization instant.
  A missing or ambiguous state fails closed.
- Advisory lock key: `workforce_state:v1:<workforce_identity_id>`.
- Audit events: `workforce_identity_activated`,
  `workforce_identity_suspended`, `workforce_identity_revoked`.
- Idempotency uses the shared administrative write scope plus `request_id`;
  no raw reason or identity payload is duplicated into idempotency storage.
- Privacy/retention: reason is an opaque reference, not HR text. No fixed
  retention duration is selected and rows are not deleted.

### 8.3 `app_workforce_capability_assignments`

| column | type | null | default / rule |
|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()`; PK |
| `assignment_id` | `uuid` | no | stable logical chain ID |
| `workforce_identity_id` | `uuid` | no | FK workforce identity |
| `capability_code` | `text` | no | one of the six closed codes |
| `event_type` | `text` | no | `granted` or `revoked` |
| `effective_at` | `timestamptz` | no | event business time |
| `valid_until` | `timestamptz` | conditional | optional only on grant; later than effective time |
| `recorded_at` | `timestamptz` | no | `clock_timestamp()` |
| `decision_ref` | `text` | no | assignment authority decision |
| `reason_ref` | `text` | conditional | required on revoke |
| `recorded_by_actor_ref` | `text` | no | opaque authority actor |
| `request_id` | `text` | no | correlation |
| `supersedes_assignment_event_id` | `uuid` | conditional | self-FK; null only for grant root |

Physical rules:

- PK `id`; partial unique root `assignment_id` where predecessor is null;
  unique direct successor; unique request ID; unique `(id,
  workforce_identity_id, capability_code)`.
- Root is `granted`; only one `revoked` successor is allowed and is terminal.
  A revoked event has no `valid_until`.
- New grants after expiry/revocation use a new `assignment_id`.
- A guard locks identity+capability and rejects overlapping operational grant
  chains, non-leaf revocation, changed identity/capability, cycles or time
  reversal.
- Authorization at time T requires a grant effective at T, T before its
  optional expiry, and no revocation effective at or before T.
- All rows are immutable; no UPDATE/DELETE.
- Indexes: identity/capability/effective, assignment chain and valid-until.
- Audit events: `workforce_capability_granted` or
  `workforce_capability_revoked`; no human job title is stored.
- Idempotency uses one shared administrative scope and `request_id`.
- Privacy/retention: capability/provenance are restricted security data; no
  fixed retention duration and no hard delete.

### 8.4 `app_case_location_relations`

| column | type | null | default / rule |
|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()`; PK |
| `relation_id` | `uuid` | no | stable logical chain ID |
| `case_id` | `uuid` | no | FK `app_cases(id)` |
| `location_id` | `uuid` | no | FK `app_locations(id)` |
| `event_type` | `text` | no | `linked` or `unlinked` |
| `effective_at` | `timestamptz` | no | event business time |
| `valid_until` | `timestamptz` | conditional | optional only on link |
| `recorded_at` | `timestamptz` | no | `clock_timestamp()` |
| `decision_ref` | `text` | no | relation decision |
| `reason_ref` | `text` | conditional | required on unlink |
| `recorded_by_actor_ref` | `text` | no | opaque actor |
| `request_id` | `text` | no | correlation |
| `supersedes_relation_event_id` | `uuid` | conditional | self-FK; null only for link root |

Physical rules:

- PK `id`; partial unique root `relation_id`; unique direct successor;
  unique request ID; unique `(id, case_id, location_id)`.
- Root is `linked`; one terminal `unlinked` successor is allowed.
- A deferred guard with advisory lock
  `case_location:v1:<case_id>:<location_id>` prevents overlapping active
  logical relations for the same pair.
- Many-to-many is allowed because one case may need multiple physical
  locations and one stable location may occur in separate cases; every pair
  remains explicit and time-bounded.
- The relation proves only workflow scope. It proves no ownership, EAN,
  aangeslotene, party/representation authority, physical match, evidence
  acceptance or customer projection.
- All rows are immutable; no UPDATE/DELETE.
- Indexes: case/effective, location/effective, pair/effective and chain.
- Audit events: `case_location_linked` and `case_location_unlinked`.
- Idempotency uses a shared relation-write scope and `request_id`.
- Privacy/retention: confidential workflow linkage; no dossier-location FK,
  no copied address and no selected deletion duration.

### 8.5 `app_workforce_scope_assignments`

| column | type | null | default / rule |
|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()`; PK |
| `scope_assignment_id` | `uuid` | no | stable logical chain ID |
| `workforce_identity_id` | `uuid` | no | FK workforce identity |
| `capability_assignment_id` | `uuid` | no | FK capability grant-root row |
| `capability_code` | `text` | no | copied closed code, composite-FK checked |
| `case_id` | `uuid` | no | FK `app_cases(id)` |
| `location_id` | `uuid` | conditional | null only for root-create |
| `case_location_relation_id` | `uuid` | conditional | link-root row; null only for root-create |
| `event_type` | `text` | no | `granted` or `revoked` |
| `effective_at` | `timestamptz` | no | event business time |
| `valid_until` | `timestamptz` | conditional | optional only on grant |
| `recorded_at` | `timestamptz` | no | `clock_timestamp()` |
| `decision_ref` | `text` | no | scope authority decision |
| `reason_ref` | `text` | conditional | required on revoke |
| `recorded_by_actor_ref` | `text` | no | opaque actor |
| `request_id` | `text` | no | correlation |
| `supersedes_scope_event_id` | `uuid` | conditional | self-FK; null only for grant root |

Physical rules:

- PK, partial unique logical root, unique successor/request and a composite
  unique key covering `id`, identity, capability, case and location.
- Composite FK proves capability assignment identity/code. Another composite
  FK proves relation row case/location.
- For `location.root.create`, location and relation are null and exact case
  scope is mandatory. For the other five codes both are nonnull.
- Root is granted; one terminal revoked successor is allowed. Successors
  preserve all scope facts.
- A deferred guard rejects overlap, capability/scope interval mismatch,
  non-root parent references and invalid/ended case/location relation.
- Authorization at T requires active workforce state, active capability grant,
  active scope grant and, where applicable, active relation; every component
  must identify exactly one valid chain.
- Root creation must atomically create the new location and its case/location
  link before returning success; it may not infer a location from an address.
- All rows are immutable; no UPDATE/DELETE.
- Indexes: identity/capability/case/location/effective, relation and chain.
- Audit events: `workforce_scope_granted` and `workforce_scope_revoked`.
- Idempotency uses shared administration scope and `request_id`.
- Privacy/retention: restricted authorization graph, no customer/party data,
  no arbitrary retention duration.

### 8.6 `app_workforce_operation_requests`

| column | type | null | default / rule |
|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()`; PK |
| `operation_type` | `text` | no | `initial_location_acceptance` or `location_correction` |
| `case_id` | `uuid` | no | FK case |
| `location_id` | `uuid` | no | FK location |
| `observation_id` | `uuid` | no | same-location composite FK |
| `predecessor_version_id` | `uuid` | conditional | null for initial; same-location FK for correction |
| `maker_workforce_identity_id` | `uuid` | no | FK workforce identity |
| `maker_scope_assignment_id` | `uuid` | no | composite FK to exact maker scope |
| `maker_capability_code` | `text` | no | prepare capability matching operation |
| `payload_hash` | `text` | no | 64 lowercase hex |
| `payload_contract_version` | `text` | no | `location_acceptance_v1` or `location_correction_v1` |
| `request_id` | `text` | no | unique caller/audit correlation |
| `idempotency_key` | `text` | no | bounded retry key |
| `created_at` | `timestamptz` | no | `clock_timestamp()` |
| `execution_status` | `text` | no | `pending` default or `executed` |
| `executed_at` | `timestamptz` | conditional | all execution fields null/present together |
| `execution_request_id` | `text` | conditional | unique when present |
| `wp3j_rpc_name` | `text` | conditional | exact approved WP3J RPC for operation |
| `wp3j_result_code` | `text` | conditional | bounded safe result |
| `wp3j_result_ref` | `text` | conditional | opaque result/created-version reference |

Physical rules:

- PK; unique request ID; unique `(maker_workforce_identity_id,
  operation_type, idempotency_key)`; unique nonnull execution request ID.
- Initial requests require `location.version.accept.prepare`, no predecessor
  and contract `location_acceptance_v1`. Correction requires
  `location.version.correct.prepare`, a predecessor and contract
  `location_correction_v1`.
- Request core and hash are immutable. Changed intent always creates a new
  request and new idempotency key.
- The only transition is pending-to-executed exactly once. It is permitted
  only through the matching future service-role-only execution function.
- Execution revalidates maker and checker identity, capability, scope and
  relation at execution time; an approved review alone is insufficient.
- Execution locks `location_operation:v1:<request-id>` and the WP3J location
  lock, requires one approved review over the same hash, then calls exactly
  `app_accept_initial_location_version_v1` or
  `app_correct_location_version_v1` in the same transaction.
- A WP3J controlled reject leaves the request pending and correlated; success
  atomically writes executed fields, WP3J audit and idempotency completion.
  Unexpected failure rolls back all state.
- Indexes: pending by case/location, maker, payload hash and created time.
- Audit events: `location_operation_requested`,
  `location_operation_execution_rejected` and
  `location_operation_executed`.
- Idempotency: future caller and execution use separate shared scopes; only
  the bounded key and hash are stored, never raw intent.
- Privacy/retention: security/review record with stable object IDs only.
  Deletion remains prohibited pending a category-specific schedule.

### 8.7 `app_workforce_operation_reviews`

| column | type | null | default / rule |
|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()`; PK |
| `operation_request_id` | `uuid` | no | FK request; unique |
| `outcome` | `text` | no | `approved` or `rejected` |
| `reviewed_payload_hash` | `text` | no | exact request hash |
| `checker_workforce_identity_id` | `uuid` | no | FK workforce identity |
| `checker_scope_assignment_id` | `uuid` | no | composite FK exact checker scope |
| `checker_capability_code` | `text` | no | approve capability matching operation |
| `reviewed_at` | `timestamptz` | no | caller-supplied decision time |
| `recorded_at` | `timestamptz` | no | `clock_timestamp()` |
| `decision_ref` | `text` | no | immutable approval/reject reference |
| `reason_ref` | `text` | conditional | required for rejection |
| `request_id` | `text` | no | unique correlation |
| `idempotency_key` | `text` | no | bounded reviewer retry key |

Physical rules:

- PK; `UNIQUE (operation_request_id)`, unique request ID and unique
  `(checker_workforce_identity_id, idempotency_key)`.
- Accept request requires `location.version.accept.approve`; correction
  requires `location.version.correct.approve`.
- Checker identity must differ from maker identity. Both must be active with
  valid matching capability/scope and case/location relation at their
  respective action times.
- The reviewed hash must equal the immutable request hash. One definitive
  outcome exists; there is no edit or second review.
- All rows are immutable; no UPDATE/DELETE.
- Advisory lock `location_review:v1:<operation-request-id>` plus the unique
  request FK makes concurrent reviews yield at most one final row.
- Indexes: checker/time, outcome/time and request.
- Audit events: `location_operation_review_approved` or
  `location_operation_review_rejected`.
- Idempotency uses a reviewer-specific shared scope; replay returns the same
  result and another payload conflicts.
- Privacy/retention: no names, e-mail, title, raw evidence or raw payload.
  Retention duration remains a separate legal/data decision.

## 9. Exact Capability Vocabulary

| code | exact authority | never implies |
|---|---|---|
| `location.root.create` | create a statusless root within one case scope and create its explicit case/location relation | address acceptance or dedupe/merge |
| `location.observation.record` | record one immutable non-accepting observation for one scoped location | acceptance |
| `location.version.accept.prepare` | create maker intent for an initial accepted version | checker approval or execution |
| `location.version.accept.approve` | approve/reject the exact initial-acceptance intent hash | preparation or self-approval |
| `location.version.correct.prepare` | create maker intent for a same-root correction | checker approval or execution |
| `location.version.correct.approve` | approve/reject the exact correction intent hash | preparation or self-approval |

Codes are schema CHECK values, not rows in a generic permission catalog.
Human titles and Auth/JWT claims are never authorization sources.

## 10. Fail-Closed Authorization And Execution

For every operation time T:

1. server verifies the concrete Auth user;
2. exact `auth_user_id` resolves one workforce root;
3. lifecycle state at T resolves exactly one active leaf;
4. capability event chain at T resolves one valid grant;
5. scope chain at T resolves one valid grant;
6. case/location relation at T is valid when location exists;
7. operation objects match the exact case and location;
8. maker/checker differ for acceptance/correction;
9. review hash equals request hash;
10. execution revalidates both principals and all scope, then executes once.

Missing, expired, suspended, revoked, ambiguous or cross-object state denies.
Customer identity, case-party role, representation, dossier ownership and
`app_dossier_locations` do not participate in this evaluation.

Suspension or revocation while a request is pending, or after approval but
before execution, blocks execution. Reinstatement does not revive the old
approval: a new request and new checker review are required. There is no
emergency override.

## 11. Bootstrap And Assignment Authority

| route | assessment |
|---|---|
| controlled environment-specific manual bootstrap runbook | recommended temporary pilot route, unapproved |
| future separate admin foundation | preferred long-term route, outside WP3L-A |
| migration seed with Auth user ID | prohibited |

The temporary runbook must:

- run only by an explicitly named environment administrator under a recorded
  Daan/security decision;
- resolve and verify the Auth user at execution time without storing e-mail
  or name in workforce tables;
- create the root, initial active state, exact capabilities/scopes,
  idempotency result and fail-closed audit atomically;
- require a second attributable operator to verify the bootstrap manifest;
- print only opaque IDs and counts;
- be environment-specific, single-use, replay-safe and separately proven;
- prohibit self-enrollment, browser bootstrap, JWT admin inference and a
  hardcoded general-migration user ID.

Assignment authority remains a governed administrative capability outside
the six operational capabilities. It is not silently granted to the first
workforce principal.

The same Auth user may have customer and workforce bindings only if both are
resolved independently. This is allowed for the pilot but creates no inherited
authority. A future conflict-of-interest decision may additionally block that
principal from a specific maker/checker pair; until such a rule exists,
maker/checker distinctness remains mandatory and customer scope is ignored.

## 12. Audit, Idempotency, Privacy And Retention

The future migration must extend the closed `app_audit_events.scope_type`
CHECK only with:

- `workforce_identity`;
- `workforce_authorization`;
- `location_operation_request`.

It reuses actor type `worker` for workforce action and `admin`/`system` only
for the controlled bootstrap authority. It stores opaque workforce, case,
location, request, capability, scope assignment and decision references plus
safe result codes. It stores no e-mail, name, title, raw evidence, raw payload
or JWT.

`app_idempotency_keys` remains the shared retry primitive. Administrative,
request, review and execution scopes are distinct. Canonical hashes cover
only normalized IDs, codes, times and bounded references. Table rows retain
their request/idempotency correlation, but no FK is added to idempotency
storage because expiry/cleanup retention is independently owned.

No arbitrary workforce retention term is selected. Roots, lifecycle,
authorization, requests, reviews and audit remain non-deletable until legal,
security, privacy and audit owners approve category-specific purposes,
anchors, holds, access and minimization actions. The recorded TKV minimum is
not applied indiscriminately to all workforce data.

## 13. Future Proof Contract

The later proof must cover:

1. exact seven-table/column/constraint/index/trigger manifest;
2. RLS on seven tables and one deny-all browser policy each;
3. no `PUBLIC`, `anon` or `authenticated` writes/reads;
4. service-role minimum grants and definer/helper execute boundaries;
5. customer identity gives no workforce authority;
6. case-party role gives no workforce capability;
7. representation grants no internal review power;
8. dual customer/workforce Auth binding has no inherited authority;
9. suspended/revoked identity denied;
10. expired/revoked capability denied;
11. wrong case denied;
12. wrong location denied;
13. capability without scope denied;
14. scope without capability denied;
15. ended case/location relation denied;
16. root-create case scope and atomic relation creation;
17. maker/checker same identity denied;
18. checker missing approve capability denied;
19. checker wrong scope denied;
20. review hash differs from request denied;
21. changed intent requires a new request;
22. one definitive review under a true two-connection race;
23. one execution under a true two-connection race;
24. revocation/suspension before execution blocks and does not consume;
25. no emergency override object, code or path;
26. audit and idempotency atomic on success/controlled reject;
27. unexpected failure rolls back business, review/execution and audit state;
28. WP3J result and caller/request/review correlation reconstructable;
29. no raw payload/PII in actor ref, errors, audit or idempotency;
30. all fixture groups roll back with zero foundation residue;
31. protected WP2B/WP3H/WP3J counts and hashes unchanged;
32. disposable database and process cleanup complete.

Proof layers are catalog/source, sequential behavior, authorization-negative,
real two-connection concurrency, rollback/protected equality and cleanup.
Browser proof waits until a visible caller exists.

## 14. Future Implementation Manifest

Both required paths are free:

- `supabase/migrations/20260728180000_app_workforce_location_authorization_foundation.sql`;
- `scripts/proofs/app-workforce-location-authorization-foundation.proof.ts`.

No collision was found. A future implementation may use only those paths
unless a new collision is reported and separately decided. It may include
the seven tables, exact constraints/indexes/RLS/grants, focused guard
functions/triggers and two operation-specific execution functions. It may not
include Edge Functions, shared runtime helpers, UI, projection, population,
remote apply or cutover.

## 15. Exact Decision Proposal

Every recommendation below is unapproved.

### Decision 1

- decision_id: `WP3L-D01`
- onderwerp: exact bounded table manifest.
- current evidence: no current workforce/scope/review objects exist.
- opties: compact five-table A; normalized seven-table B; customer/case extension C.
- aanbevolen keuze: option B and exactly the seven tables in section 6.
- exacte fysieke consequentie: seven additive tables; no generic roles, permission catalog or eighth table.
- auditimpact: each independently changing truth has its own attributable history.
- securityimpact: no customer/representation/workforce conflation.
- authorityimpact: capability, scope and review remain distinct.
- concurrencyimpact: each mutable business key gets a deterministic lock/guard.
- privacy/retentie-impact: no names/e-mail and no invented duration.
- proofimpact: exact seven-table manifest is a hard proof gate.
- resterend risico: implementation functions still require source review.
- approval required: Daan must approve the complete seven-table boundary.

### Decision 2

- decision_id: `WP3L-D02`
- onderwerp: workforce binding to Auth and customer separation.
- current evidence: verified Auth and customer binding exist; workforce binding does not.
- opties: reuse customer identity; JWT claim; separate workforce root.
- aanbevolen keuze: unique restrictive `auth.users(id)` binding in `app_workforce_identities`.
- exacte fysieke consequentie: unique Auth UUID, generated opaque workforce ref, no customer FK or PII.
- auditimpact: bootstrap decision and request are attributable.
- securityimpact: Auth proves credential only.
- authorityimpact: customer/workforce authority never inherits.
- concurrencyimpact: unique Auth constraint resolves simultaneous bootstrap.
- privacy/retentie-impact: Auth UUID is restricted; root retained pending policy.
- proofimpact: duplicate binding and cross-domain negative tests.
- resterend risico: Auth-account deletion/rehire policy remains operational governance.
- approval required: Daan/security must approve one stable workforce root per Auth user.

### Decision 3

- decision_id: `WP3L-D03`
- onderwerp: active, suspended and revoked lifecycle history.
- current evidence: no workforce lifecycle exists.
- opties: mutable status; append-only state events; JWT status.
- aanbevolen keuze: append-only chained state events with revoked terminal.
- exacte fysieke consequentie: `app_workforce_identity_states` and exact transitions from section 8.2.
- auditimpact: every state change remains reconstructable.
- securityimpact: missing/ambiguous/non-active state fails closed.
- authorityimpact: state gates every capability and operation.
- concurrencyimpact: per-identity advisory lock and one-successor rule.
- privacy/retentie-impact: opaque reason refs only; no duration selected.
- proofimpact: transition, race, suspension and revocation cases.
- resterend risico: long-term rehire policy is outside this package.
- approval required: Daan/security/operations must approve transition governance.

### Decision 4

- decision_id: `WP3L-D04`
- onderwerp: exact closed capability vocabulary.
- current evidence: four WP3J operations and mandatory maker/checker separation are approved.
- opties: broad operations role; human titles; six fixed capabilities.
- aanbevolen keuze: the six exact codes in section 9.
- exacte fysieke consequentie: CHECK constraints contain only those six strings; no capability table.
- auditimpact: audit records exact capability basis.
- securityimpact: least privilege and no title/claim inference.
- authorityimpact: prepare and approve are distinct.
- concurrencyimpact: grants lock identity plus capability.
- privacy/retentie-impact: capability codes contain no PII.
- proofimpact: full allow/deny capability matrix.
- resterend risico: later non-location capabilities need separate additive decisions.
- approval required: Daan/operations/security must approve all six codes.

### Decision 5

- decision_id: `WP3L-D05`
- onderwerp: capability grant, expiry, revocation and provenance.
- current evidence: immutable/supersession patterns are locally proven.
- opties: mutable row; grant/revoke event chain; JWT claims.
- aanbevolen keuze: immutable grant root and optional terminal revoke event.
- exacte fysieke consequentie: exact assignment columns/chain/validity from section 8.3.
- auditimpact: grant/revoke decision and actor correlate.
- securityimpact: expired/revoked/ambiguous chains deny.
- authorityimpact: assignment authority stays outside operational capabilities.
- concurrencyimpact: identity/capability lock prevents overlapping active grants.
- privacy/retentie-impact: no HR text; retention undecided.
- proofimpact: expiry, revoke, regrant and race cases.
- resterend risico: future admin interface is not designed.
- approval required: Daan/security/operations must approve assignment authority.

### Decision 6

- decision_id: `WP3L-D06`
- onderwerp: case/location relation cardinality and meaning.
- current evidence: cases and locations exist separately; no relation exists.
- opties: one location per case; implicit dossier link; explicit temporal many-to-many.
- aanbevolen keuze: explicit temporal many-to-many link/unlink chain.
- exacte fysieke consequentie: `app_case_location_relations` as section 8.4.
- auditimpact: relation basis and period reconstruct.
- securityimpact: no ID-only or dossier-derived scope.
- authorityimpact: relation proves workflow scope only.
- concurrencyimpact: pair lock prevents overlapping active duplicate links.
- privacy/retentie-impact: IDs only; no address copy or duration invention.
- proofimpact: cardinality, interval, wrong-pair and no-inference cases.
- resterend risico: actual population/reconciliation remains separate.
- approval required: Daan must approve many-to-many workflow semantics.

### Decision 7

- decision_id: `WP3L-D07`
- onderwerp: workforce object scope.
- current evidence: WP3K approves capability plus object-level authorization.
- opties: global capability; combined mutable scope; explicit scope event chain.
- aanbevolen keuze: explicit identity/capability/case/location scope chain.
- exacte fysieke consequentie: `app_workforce_scope_assignments`; case-only only for root creation.
- auditimpact: exact scope used for every operation is retained.
- securityimpact: capability without scope and scope without capability deny.
- authorityimpact: scope grants no customer, party or representation authority.
- concurrencyimpact: scoped assignment key lock and deferred parent validity.
- privacy/retentie-impact: restricted IDs/codes only.
- proofimpact: wrong-case/location and cross-scope matrix.
- resterend risico: root-create link creation needs later transaction implementation.
- approval required: Daan/security/operations must approve the root-create exception.

### Decision 8

- decision_id: `WP3L-D08`
- onderwerp: maker request/intent for acceptance and correction.
- current evidence: WP3J accepts decision refs but does not prove maker intent.
- opties: transient payload; generic review task; immutable bounded request.
- aanbevolen keuze: immutable operation request with exact normalized payload hash.
- exacte fysieke consequentie: request table/type/FKs/hash/idempotency from section 8.6.
- auditimpact: maker, objects, contract version and hash reconstruct.
- securityimpact: browser cannot select authoritative actor/scope.
- authorityimpact: maker preparation is not checker approval.
- concurrencyimpact: unique maker operation idempotency key.
- privacy/retentie-impact: no raw payload/PII; retention open.
- proofimpact: replay, payload conflict and changed-intent cases.
- resterend risico: exact normalized caller payload builders remain later code.
- approval required: Daan/security/operations must approve both request contracts.

### Decision 9

- decision_id: `WP3L-D09`
- onderwerp: checker review and distinct-principal enforcement.
- current evidence: four-eyes for acceptance/correction is approved.
- opties: mutable approval flag; multiple reviews; one immutable final review.
- aanbevolen keuze: exactly one immutable approve/reject review per request.
- exacte fysieke consequentie: unique request FK, hash equality and cross-table self-approval guard.
- auditimpact: checker decision and hash are attributable.
- securityimpact: self-approval and wrong scope/capability fail closed.
- authorityimpact: representation cannot act as checker authority.
- concurrencyimpact: request lock plus unique FK yields one outcome.
- privacy/retentie-impact: opaque refs only.
- proofimpact: self, duplicate, race and wrong-checker tests.
- resterend risico: conflict-of-interest rules beyond identity difference remain open.
- approval required: Daan/security/operations/legal must approve final-review semantics.

### Decision 10

- decision_id: `WP3L-D10`
- onderwerp: one-time execution and WP3J result.
- current evidence: WP3J is idempotent and concurrency-proven but caller authorization is absent.
- opties: caller directly invokes then marks; generic async state; atomic guarded execution.
- aanbevolen keuze: two operation-specific definer execution functions and one pending-to-executed transition.
- exacte fysieke consequentie: execution fields/checks in request table; exact WP3J RPC based on stored type.
- auditimpact: request/review/execution/WP3J chain correlates.
- securityimpact: no execution without current valid maker/checker authority.
- authorityimpact: approval does not itself execute.
- concurrencyimpact: request and location locks yield at most one execution.
- privacy/retentie-impact: safe result refs/codes only.
- proofimpact: genuine execution race, replay and rollback.
- resterend risico: function bodies require a later authorized implementation review.
- approval required: Daan/security must approve atomic execution ownership.

### Decision 11

- decision_id: `WP3L-D11`
- onderwerp: suspension/revocation around pending approval/execution.
- current evidence: authorization can change independently of request state.
- opties: snapshot forever; check maker only; revalidate maker/checker and all scope.
- aanbevolen keuze: revalidate all current authority at execution and require a new request after any blocking change.
- exacte fysieke consequentie: execution guard reads current lifecycle/capability/scope/relation leaves.
- auditimpact: blocked execution reason is correlated without exposing details.
- securityimpact: stale approval cannot bypass revocation.
- authorityimpact: no vested execution right follows from approval.
- concurrencyimpact: authorization locks/check snapshot occurs in the execution transaction.
- privacy/retentie-impact: safe reason code only.
- proofimpact: concurrent suspension/revocation before execution.
- resterend risico: temporary outage can require repeated human work.
- approval required: Daan/security/operations must approve fail-closed invalidation.

### Decision 12

- decision_id: `WP3L-D12`
- onderwerp: self-approval, duplicate review and concurrent checker outcomes.
- current evidence: no approval object exists; distinct identities are approved.
- opties: application-only check; database guard; eventual reconciliation.
- aanbevolen keuze: database cross-table guard plus unique request review.
- exacte fysieke consequentie: immutable unique review and advisory lock from section 8.7.
- auditimpact: losing duplicate attempt records a safe reject.
- securityimpact: self and second outcome never commit.
- authorityimpact: maker and checker are different workforce roots.
- concurrencyimpact: at most one definitive checker row.
- privacy/retentie-impact: no reviewer PII.
- proofimpact: real two-connection approve/reject and self races.
- resterend risico: broader personal-conflict policy remains undecided.
- approval required: Daan/security/operations must approve identity-level independence.

### Decision 13

- decision_id: `WP3L-D13`
- onderwerp: first workforce bootstrap and assignment authority.
- current evidence: no admin foundation exists.
- opties: controlled manual runbook; future admin foundation; migration seed.
- aanbevolen keuze: controlled dual-operator environment runbook for pilot; future admin foundation later; no migration seed.
- exacte fysieke consequentie: no hardcoded Auth UUID or bootstrap row in migration.
- auditimpact: atomic bootstrap decision/idempotency/audit pack.
- securityimpact: no self-enrollment, browser or silent admin claim.
- authorityimpact: first principal does not receive assignment authority.
- concurrencyimpact: unique Auth and idempotency prevent duplicate bootstrap.
- privacy/retentie-impact: lookup e-mail is not stored in workforce tables/output.
- proofimpact: replay, wrong environment, duplicate and rollback runbook proof.
- resterend risico: manual custody is operational until admin foundation exists.
- approval required: Daan/security must name bootstrap and verifier authorities.

### Decision 14

- decision_id: `WP3L-D14`
- onderwerp: same Auth user with customer and workforce binding.
- current evidence: one credential can technically resolve customer identity; no workforce binding exists yet.
- opties: always allow; pilot prohibit; allow with strict separation and later conflict rule.
- aanbevolen keuze: allow strict independent bindings; never inherit scope; later conflicts may prohibit a concrete maker/checker pairing.
- exacte fysieke consequentie: no FK or join between customer and workforce identities.
- auditimpact: workforce events use workforce actor ref, customer events customer actor ref.
- securityimpact: resolver requires explicit requested trust domain.
- authorityimpact: customer ownership and workforce capability remain unrelated.
- concurrencyimpact: each domain retains separate locks/idempotency.
- privacy/retentie-impact: no duplicate e-mail/name in workforce records.
- proofimpact: dual-binding no-inheritance and wrong-domain tests.
- resterend risico: pilot conflict-of-interest policy remains a governance decision.
- approval required: Daan/security/legal must approve dual-binding policy.

### Decision 15

- decision_id: `WP3L-D15`
- onderwerp: RLS, grants, definer boundary and browser access.
- current evidence: deny-all and service-role-only WP3 patterns are proven locally.
- opties: authenticated RLS writes; direct browser RPC; service-only guarded boundary.
- aanbevolen keuze: deny browser, minimum service grants, exact service-only execution functions.
- exacte fysieke consequentie: seven RLS tables/policies; no browser grants; no direct request update.
- auditimpact: all writes pass a correlated server transaction.
- securityimpact: browser cannot select actor/authority or execute WP3J.
- authorityimpact: service credential still does not confer human authority.
- concurrencyimpact: database guards remain authoritative under races.
- privacy/retentie-impact: no customer projection.
- proofimpact: exact grants, ACLs, search path and direct-access negatives.
- resterend risico: production secret custody remains unproven.
- approval required: Daan/security must approve the minimum ACL/function boundary.

### Decision 16

- decision_id: `WP3L-D16`
- onderwerp: audit, request and idempotency correlation.
- current evidence: shared audit/idempotency and WP3J transactional patterns are locally proven.
- opties: duplicate raw payloads; unrelated IDs; bounded shared correlation.
- aanbevolen keuze: section 12 scopes, three audit scope types and canonical hashes.
- exacte fysieke consequentie: extend audit scope CHECK; store bounded request/key/hash fields; no idempotency FK.
- auditimpact: bootstrap through WP3J outcome is reconstructable.
- securityimpact: no SQL/auth/role inventory or raw payload leakage.
- authorityimpact: authorization and business-write event owners stay distinct.
- concurrencyimpact: idempotency and domain locks are in one transaction per action.
- privacy/retentie-impact: minimized opaque metadata; cleanup remains separately owned.
- proofimpact: event cardinality, replay/conflict, rollback and PII scans.
- resterend risico: exact audit retention/export schedule remains open.
- approval required: Daan/security/data must approve event ownership and scope extensions.

### Decision 17

- decision_id: `WP3L-D17`
- onderwerp: workforce privacy, minimization and retention.
- current evidence: no workforce retention schedule exists; TKV minimum is category-specific.
- opties: arbitrary fixed term; apply TKV to all; retain without hard delete pending category decisions.
- aanbevolen keuze: minimal IDs/refs only and no deletion until category-specific policy is approved.
- exacte fysieke consequentie: no names/e-mail/titles/raw payload; no cascade/delete or TTL column.
- auditimpact: history stays reconstructable.
- securityimpact: restricted access to authorization graph.
- authorityimpact: deletion cannot erase past decision basis.
- concurrencyimpact: retention actions cannot race normal writes because none are authorized.
- privacy/retentie-impact: explicit unresolved schedule, purpose, hold and minimization gate.
- proofimpact: schema PII scan and no-delete checks.
- resterend risico: indefinite interim retention requires prompt legal/data follow-up.
- approval required: Daan/legal/privacy/security must later approve each schedule.

### Decision 18

- decision_id: `WP3L-D18`
- onderwerp: migration, proof, concurrency and rollback contract.
- current evidence: WP2B/WP3H/WP3J provide additive, guard and real-process proof patterns.
- opties: unit-only; schema-only; exact full contract from sections 13/14.
- aanbevolen keuze: one additive migration and one destructive-local disposable proof only after separate authorization.
- exacte fysieke consequentie: reserved free paths, seven tables, exact guards and no population/Edge/UI.
- auditimpact: proof covers end-to-end correlation without production claim.
- securityimpact: negative authorization and ACL cases are gates.
- authorityimpact: separation/no-inference and four-eyes are database-proven.
- concurrencyimpact: true two-connection review, execution and revocation races.
- privacy/retentie-impact: no PII fixtures/output; complete cleanup.
- proofimpact: all 32 proof cases, rollback, hashes, counts and disposable cleanup.
- resterend risico: remote/production topology remains separately unproven.
- approval required: Daan must approve this package first and later authorize exact implementation/proof execution.

## 16. Remaining Blockers And Next Gate

Before implementation:

- Daan decides all eighteen physical recommendations as one bounded package;
- security/operations confirm bootstrap custody and assignment authority;
- legal/privacy/data record the interim no-delete posture and own the later
  category schedules;
- implementation review fixes exact constraint/trigger/function names and
  proves no collision without changing the approved semantics;
- a separate batch authorizes only the reserved migration and proof.

Authorized caller remains `NOT IMPLEMENTED`. No workforce foundation is
CURRENT. Edge Functions, helper, UI, system ingestion, population, remote,
production, cutover and retirement remain outside this package.

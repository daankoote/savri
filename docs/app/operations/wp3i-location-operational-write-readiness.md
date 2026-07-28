# WP3I Location Operational Write Readiness

DRAFT — WP3I OPERATIONAL LOCATION WRITE READINESS — DECISION REQUIRED

## 1. Readiness Verdict

READY FOR DECISION — OPERATIONAL WRITE PACKAGE CAN BE APPROVED

This verdict means that the four bounded write operations, their reuse
boundary, transaction model, idempotency behavior, audit behavior, lock model,
error contract, security boundary and later proof contract can be decided
without another domain-model or catalog-discovery batch. It does not approve
any recommendation below and does not authorize implementation, a migration,
a proof file, SQL execution, a database write, a runtime caller, remote apply
or deployment. Every recommended choice remains unapproved until Daan
explicitly approves it.

WP3H remains `CURRENT PROVEN — LOCAL ONLY` for exactly the empty three-table
foundation. Operational writes remain `NOT IMPLEMENTED`.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2. Audit Boundary And Evidence

The start gate was satisfied on branch `main` at
`73d8865b66cb29d7f37a0905d5a9652ad7e4a005`, parent
`3bb8d50cd7723ad631d75857df4e08d6ef0db311`, subject
`Record WP3H local location foundation proof`. The index and tracked worktree
were clean. Only the fourteen previously protected untracked artifacts were
present. The WP3H migration, proof and seven WP3H-DOC files were committed.

The required canon, directive, requirements, completeness audit,
architecture, traceability, location/audit/auth/Edge/connection/party
contracts, WP3F-B through WP3H records, roadmap, TODO, changelog, WP3H
migration and WP3H proof were read. The official local TKV snapshot was used
only after SHA-256 verification as
`f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`.

Read-only source inspection covered all 23 current migration files, 29 current
proof source/evidence files, the six protected baseline/rollback proposals,
the shared runtime helpers, current callers, frontend modules and CSS/layout
inventory. Read-only local catalog inspection ran inside an explicit
`BEGIN TRANSACTION READ ONLY` / `ROLLBACK` boundary. It inspected only
metadata, grants, policies and functions; no application row or PII value was
read or printed.

The catalog confirms:

- `app_idempotency_keys` has `id`, `scope`, `key`, `payload_hash`,
  `response_status`, `response_body`, `locked_at`, `completed_at`,
  `expires_at` and `created_at`;
- `(scope, key)` is unique; `response_status` is null or 100–599; expiry and
  creation indexes exist, but no approved cleanup job or universal TTL is
  encoded in the table;
- `app_audit_events` has exact event/scope, customer/dossier, request,
  idempotency, actor, hashed request metadata, JSON event data and recording
  time columns;
- both tables have RLS enabled, a deny-all policy for `anon` and
  `authenticated`, and direct CRUD only for `service_role`;
- no proposed WP3I public RPC or focused helper name exists;
- the WP3H foundation has no operational RPC;
- the proposed migration and proof paths are free.

No database write, migration-history change or remote query was performed.

## 3. Exact Operational Use Cases

| operation | allowed business write | required result |
|---|---|---|
| `create_location_root` | insert one opaque statusless root with approved creation provenance | one new `location_id`, or deterministic replay/conflict |
| `record_location_observation` | insert one immutable observation under one existing root | one new `observation_id`, or deterministic replay/reject |
| `accept_initial_location_version` | insert the first accepted immutable version for an exact same-root observation | one new `version_id` and decision reference, or deterministic replay/reject |
| `correct_location_version` | insert one new accepted immutable version that names one same-root predecessor | one successor `version_id`, preserved predecessor, or deterministic replay/reject |

The package has no generic upsert. It contains no update or delete operation,
data migration, 44-row population, case/party/EAN/connection/charger/
allocation-point link, customer projection, browser write, provider
integration, PDOK/BAG integration, verifier or NEa acceptance, caller cutover
or current-table retirement.

## 4. Reuse And Non-Reuse

### 4.1 Exact Reuse

| responsibility | reusable source or pattern | bounded use |
|---|---|---|
| canonical payload hashing | `payloadHash()` and `stableJsonStringify()` in `supabase/functions/_shared/app_foundation.ts` | one server-side canonical SHA-256 implementation; SQL validates lowercase 64-hex and does not re-hash |
| request metadata and safe HTTP errors | `getAppRequestMeta()`, `appJsonResponse()` and `appErrorResponse()` in the same shared module | later trusted server adapter derives request metadata and maps stable RPC codes without SQL details |
| authenticated customer actor | `requireVerifiedSupabaseAuthUser()` and `requireAppCustomer()` in `supabase/functions/_shared/app_customer_auth.ts` | later customer caller derives an actor; acceptance/correction additionally require a separately authorized internal server role |
| idempotency storage | `public.app_idempotency_keys` plus the reserve, unique-conflict, `FOR UPDATE`, stored-response and completion pattern in `app_bootstrap_customer_auth_v1` | one transactionally serialized record per operation scope/key |
| controlled rejected writes | `app_reject_document_upload_v1` and `app_withdraw_current_document_v1` | return a stable rejection so reject audit and stored response commit together |
| SQL security | `SECURITY DEFINER`, `SET search_path = ''`, fully qualified relations and explicit execute revokes/grants in the Auth bootstrap and connection RPC migrations | four narrow service-role-only entry points and non-public focused helpers |
| root-scoped serialization | deterministic `pg_advisory_xact_lock` and deferred transaction-end validation in the case-party-role foundation | one fixed location lock derivation and fixed lock order |
| true race runner | `Deno.Command(...).spawn()` and `Promise.all()` orchestration in the case-party-role proof | separate PostgreSQL processes/connections with controlled release and result capture |
| cleanup and protected manifests | WP3H location proof count/hash/rollback helpers | before/after equality, no current-row change and empty disposable proof state |

CSS reuse is not applicable.

### 4.2 Rejected Direct Reuse

| source | why it is not directly reusable |
|---|---|
| `insertAppAuditFailOpen()` | critical location success and controlled reject events must fail closed in the same business transaction |
| legacy `_shared/audit.ts` and `_shared/idempotency.ts` | they are legacy dossier primitives and fail-open; they do not use the approved app actor/scope boundary |
| `app_connection_write_audit_event` and the four connection write RPCs | their dossier/account ownership model conflicts with the approved connection/location separation; actor provenance is passed through, idempotency code is repeated, generic exception handling can erase intended transactional records, and their old proof is `PROVE AGAIN` evidence only |
| document RPC `search_path = public` convention | the stronger current `search_path = ''` plus fully qualified object convention is required for new definer functions |
| frontend address, PDOK and signup helpers | browser input and provider results are observations, never authoritative root creation or acceptance provenance |
| WP3H sequential foundation proof alone | it proves transaction-end invariants but not a real competing two-connection operational race |

Three focused internal SQL helpers are necessary because no existing function
fits the exact location boundary:

- `app_location_write_idempotency_begin_v1` centralizes reserve, scope/key
  locking, payload conflict and replay;
- `app_location_write_lock_v1` centralizes the one approved advisory-lock
  derivation for existing roots;
- `app_location_write_complete_v1` centralizes minimal audit insertion and
  success/reject idempotency completion in the same transaction.

They are not public business operations, receive no browser execute grant and
may not broaden into a generic write framework.

## 5. Proposed Implementation Manifest

The proposed migration path is free and logically ordered after WP3H:

`supabase/migrations/20260728140000_app_location_write_rpcs.sql`

The proposed proof path is free:

`scripts/proofs/app-location-write-rpcs.proof.ts`

The proposed migration would contain exactly four service-role business RPCs:

- `app_create_location_root_v1`;
- `app_record_location_observation_v1`;
- `app_accept_initial_location_version_v1`;
- `app_correct_location_version_v1`.

It may also contain only the three focused private helpers named in section
4.2. It may not alter a foundation table except for separately approved,
strictly necessary comments or grants; create another business/root/history
table; add browser grants; populate data; change a caller; retire a current
object; apply remotely; or add provider, projection or relationship behavior.

This manifest is proposed, not approved, not created and not implemented.

## 6. Exact Idempotency Contract Proposal

### 6.1 Scope And Binding

| operation | exact proposed scope |
|---|---|
| root creation | `app-location-write:v1:create_location_root:actor:<actor_ref>` |
| observation | `app-location-write:v1:record_location_observation:location:<location_id>:actor:<actor_ref>` |
| initial acceptance | `app-location-write:v1:accept_initial_location_version:location:<location_id>:actor:<actor_ref>` |
| correction | `app-location-write:v1:correct_location_version:location:<location_id>:actor:<actor_ref>` |

The trusted server derives the operation, `actor_ref`, request ID and scope.
The browser may supply an idempotency key as a retry token but may not choose
the authoritative scope or actor. For root creation no root exists yet, so
the scope binds operation plus actor, the canonical payload binds the requested
root creation, and the stored success response binds the newly created
`location_id`. Different keys remain distinct root-creation intents; address
equality never causes deduplication or merge.

### 6.2 Canonical Payload Hash

The canonical JSON hash includes operation version, all normalized business
inputs, server-derived actor reference and, where applicable, `location_id`,
observation ID, predecessor ID and server-controlled decision reference.
Specifically:

- root creation includes `creation_basis`;
- observation includes the complete normalized approved observation shape and
  source-time/hash fields;
- initial acceptance includes location, accepted observation, descriptor,
  business validity, acceptance time and decision reference;
- correction includes those acceptance fields plus predecessor and the exact
  correction reason.

The idempotency key and request ID are excluded: the key is already part of
the unique lookup and a network retry may legitimately have a new request ID.
Generated result IDs and database recording timestamps are also excluded.
Undefined object members are omitted and keys are recursively sorted by the
existing shared canonicalizer. SQL accepts only a lowercase 64-hex hash.

### 6.3 Replay, Conflict And Expiry

- Same scope/key and same hash returns the stored status and semantic body;
  only an explicit `replayed: true` wrapper marker may differ. It creates no
  second business row or success audit.
- Same scope/key and another hash returns stable 409
  `idempotency_payload_conflict`, never the earlier result and never a second
  business write.
- Concurrent same-key requests serialize on the unique row plus `FOR UPDATE`.
  One performs the operation; the other replays the completed response or,
  only while the first is incomplete, receives stable
  `location_write_in_progress`.
- Different keys with one `acceptance_decision_ref` serialize on the root and
  are also protected by the existing unique foundation constraint. Exactly
  one may accept it; the loser receives and stores
  `location_acceptance_decision_conflict`.
- Terminal controlled domain rejects are stored and replayed. Unexpected SQL,
  connection or infrastructure failures roll back and are not converted into
  a stored terminal business result; retry remains possible.
- `expires_at` is required by the existing table, but no universal location
  TTL or cleanup duration is approved by current evidence. This proposal
  deliberately chooses none. A row remains binding while present, even after
  its timestamp; expiry never silently permits another payload for the same
  scope/key. Cleanup and its exact retention duration require explicit
  approval before implementation.
- Scope and payload together bind actor and, when it exists, location.

## 7. Exact Audit Contract Proposal

### 7.1 Success Events

- `location_root_created`;
- `location_observation_recorded`;
- `location_initial_version_accepted`;
- `location_version_corrected`.

### 7.2 Rejected-Attempt Events

- `location_root_create_rejected`;
- `location_observation_record_rejected`;
- `location_initial_version_accept_rejected`;
- `location_version_correction_rejected`;
- `location_write_idempotency_conflict`.

After valid server authentication/provenance and idempotency reservation, every
controlled domain reject is transactionally fail-closed: missing/wrong root,
invalid same-root reference, already accepted observation, non-leaf or wrong
predecessor, overlap, reused decision reference, constraint-classified
conflict, or invalid correction state. Its minimal reject event and stored
response commit together. If either insert/update fails, the whole operation
fails.

Pre-database request-shape/auth failures have no trustworthy location actor or
business transaction and belong to safe gateway/operations logging. Direct
browser execution is denied by grants and is not fabricated as an application
domain event.

Every committed event uses `scope_type = 'location'` and records:

- server-derived `actor_type` and `actor_ref`;
- the original server-derived `request_id`;
- the idempotency key in the dedicated audit column and the operation/scope
  name in minimal event data;
- applicable `location_id` as `scope_id`;
- applicable observation, version, predecessor, successor and opaque decision
  references;
- one stable result/reject code.

Audit metadata contains no address fields, raw source/provider payload,
provider ID, document content, e-mail, phone or other PII. For correction, the
immutable successor row holds the exact required `correction_reason`; the
audit event records only the predecessor/successor references and
`correction_reason_present = true`, not a duplicate of possibly sensitive free
text.

A controlled reject must return a stable JSON result from the transaction.
It must not raise after inserting its required reject event, because rollback
would otherwise erase that event and the stored rejection. Unexpected
exceptions intentionally roll back all business/audit/idempotency changes and
are distinguished from controlled rejects. Any future out-of-transaction
failure log would be a separately approved operational mechanism, not an
implicit substitute.

## 8. Exact Lock And Transaction Proposal

Every RPC is one database transaction. The fixed order is:

1. validate stable input shape and server context;
2. reserve/select the idempotency row and take its row lock;
3. for an existing root, acquire the deterministic location advisory lock;
4. lock/read the applicable observation or predecessor rows;
5. perform the one allowed insert;
6. force or rely on deferred foundation validation;
7. insert the minimal success/reject audit and finalize idempotency;
8. return the stable result.

Root creation has no root ID and therefore uses only the operation/actor
idempotency-row lock. Two different keys intentionally create two distinct
opaque roots; no address-based global lock is allowed.

Observation insert, initial acceptance and correction use the same per-root
lock derived only by `app_location_write_lock_v1` from a versioned namespace
and the exact UUID. Two observations on one root serialize but may both
succeed because observations are independent immutable facts. Initial
acceptance and correction then rely on the foundation unique/deferred
invariants. Different roots do not share a location lock.

## 9. Required Later Proof Contract

### 9.1 Single-Transaction Behavior

The future proof must show all four happy paths, same-key replay, different
payload conflict, exact stored success and reject responses, no duplicate
audit on replay, every controlled reject audit, immutable predecessors, exact
grants/search path, rollback cleanup and protected before/after equality. It
must also prove that no direct insert/update/delete becomes available to
`PUBLIC`, `anon` or `authenticated`.

### 9.2 Real Two-Process/Two-Connection Races

The future proof must use separate PostgreSQL processes/connections, not two
promises sharing one transaction. It must cover:

1. two concurrent root creates with the same idempotency key: one logical
   root and one replay/in-progress response;
2. the same key with different payloads: one winner and one deterministic
   payload conflict;
3. two observations on the same root: serialized, both preserved exactly
   once;
4. two initial accepts for the same observation: one accepted version and one
   deterministic reject;
5. two accepts with the same decision reference: one accepted version and one
   deterministic decision-reference conflict;
6. two concurrent corrections of the same predecessor: one successor and one
   deterministic non-leaf/conflict reject;
7. corrections on different roots: both succeed without cross-root
   serialization;
8. overlapping operational leaf periods: at most one commit;
9. touching leaf periods: both contract-valid writes can commit;
10. retry after a committed response is lost: stored response replay and no
    duplicate row/audit;
11. transaction rollback: no location, observation, version, audit or
    idempotency residue;
12. advisory-lock release after exception: a fresh connection can acquire the
    same lock and complete.

True committed races should run in a disposable local proof database so their
results can be inspected and the database removed afterward. Sequential
contract groups should roll back. The proof must reuse the existing
`Deno.Command(...).spawn()` runner pattern, record deterministic coordination
instead of relying only on timing, leave all three WP3H tables empty in the
protected local database, preserve the 44 current rows, and verify protected
counts and hashes before and after. No remote database is in scope.

## 10. Decision Proposal

Each recommended choice below is expressly unapproved.

### Decision 1

- decision_id: `WP3I-D01`
- onderwerp: one specific RPC per use case versus one generic RPC.
- current evidence: the bounded operations have different invariants, inputs,
  audit events and authorization consequences; generic connection RPC
  patterns do not fit the approved location boundary.
- opties: four narrow versioned RPCs; or one generic operation-dispatch RPC.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — four narrow versioned
  RPCs, one for each operation in section 3, with only focused private helpers.
- rationale: narrow signatures make invalid transitions, grants, audit and
  proof expectations explicit.
- auditimpact: event type and required identifiers are operation-specific.
- securityimpact: no generic write surface or caller-selected operation.
- concurrencyimpact: each RPC invokes only its required lock path.
- proofimpact: four positive matrices and explicit negative cross-operation
  cases.
- resterend risico: helpers could still become over-broad during
  implementation review.
- expliciete approval required: Daan must approve the four-RPC shape before
  any migration is created.

### Decision 2

- decision_id: `WP3I-D02`
- onderwerp: server-derived actor reference, request ID and idempotency scope.
- current evidence: the shared Auth boundary can derive verified customer
  identity; existing connection RPC input pass-through is insufficient as
  authoritative provenance.
- opties: trust caller/browser provenance; or derive it in a trusted server
  boundary and permit only service-role RPC execution.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — trusted server
  derivation; browser values are never authoritative.
- rationale: actor and scope are security facts, not business-form fields.
- auditimpact: audit actor/request values are attributable to the server
  decision boundary.
- securityimpact: prevents browser actor/scope impersonation; internal
  acceptance/correction also require a separately authorized internal role.
- concurrencyimpact: actor-bound scope prevents unintended cross-actor replay.
- proofimpact: prove caller-selected actor/scope is unavailable through
  browser roles and that trusted values bind replay.
- resterend risico: a compromised service-role caller can still lie; caller
  implementation and role authorization remain later gates.
- expliciete approval required: Daan must approve the provenance boundary and
  later caller role matrix.

### Decision 3

- decision_id: `WP3I-D03`
- onderwerp: reuse `app_idempotency_keys` versus a new location table.
- current evidence: the current table already has unique scope/key, hash,
  lock/completion, stored response and expiry fields with deny-all browser
  policy.
- opties: reuse the shared table; or create a location-specific idempotency
  table.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — reuse the shared table
  through one focused location begin helper.
- rationale: no location-specific persistence requirement justifies another
  table.
- auditimpact: one idempotency reference can correlate operational audit
  events.
- securityimpact: existing RLS/grant boundary remains intact.
- concurrencyimpact: the unique row and `FOR UPDATE` serialize same-key races.
- proofimpact: prove shared-table isolation, replay, conflict and cleanup
  boundaries.
- resterend risico: cleanup ownership and exact expiry duration are not yet
  approved.
- expliciete approval required: Daan must approve shared-table reuse; exact
  cleanup/retention must be approved before implementation.

### Decision 4

- decision_id: `WP3I-D04`
- onderwerp: canonical payload hash and replay/conflict behavior.
- current evidence: the shared canonicalizer and SHA-256 helper exist; current
  RPCs prove stored replay and conflict patterns, but no location payload
  contract exists.
- opties: hash raw request JSON; define independent hashes per caller; or use
  the exact canonical input and semantics in section 6.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — reuse the shared
  canonicalizer once server-side, validate lowercase 64-hex in SQL, replay
  same payload, conflict on another payload and store terminal results.
- rationale: deterministic normalized input prevents order/transport-dependent
  identity.
- auditimpact: replay creates no duplicate success event; conflicts receive a
  minimal attempt event.
- securityimpact: actor/location/decision bindings are hashed; raw payload is
  not stored in idempotency or audit metadata.
- concurrencyimpact: the hash comparison occurs while the unique idempotency
  row is locked.
- proofimpact: exact per-operation hash fixtures, key/payload races, stored
  success and stored error replay.
- resterend risico: no TTL is selected; canonical-input changes require a new
  operation version.
- expliciete approval required: Daan must approve exact hash inputs, replay,
  error storage and a non-arbitrary expiry/cleanup rule.

### Decision 5

- decision_id: `WP3I-D05`
- onderwerp: transactional audit registration in `app_audit_events`.
- current evidence: the table supports required location scope and metadata;
  critical current RPCs show transactional success/reject audit while the
  shared fail-open helper is unsuitable.
- opties: fail-open runtime audit; success-only audit; or fail-closed success
  and controlled-reject audit in the RPC transaction.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — section 7 event set,
  minimal metadata, and transactionally fail-closed success and controlled
  domain rejects.
- rationale: committed business outcomes and required attempted-decision
  evidence remain reconstructable.
- auditimpact: exact event set, references and reject policy become mandatory.
- securityimpact: no address, raw payload, provider value or PII is duplicated
  into event data.
- concurrencyimpact: winner and loser each have the contract-required event;
  replay has no duplicate event.
- proofimpact: event cardinality, metadata allowlist, rollback and controlled
  reject persistence tests.
- resterend risico: unexpected infrastructure failures have no committed
  application audit row and need ordinary operational logs.
- expliciete approval required: Daan must approve which rejects are required
  transactional evidence before SQL exists.

### Decision 6

- decision_id: `WP3I-D06`
- onderwerp: advisory-lock scope for root, observation, initial acceptance and
  correction.
- current evidence: WP3H enforces transaction-end invariants but has no
  operational lock; the case foundation proves deterministic advisory locking.
- opties: no advisory lock; global/address lock; or idempotency-only root
  creation plus one deterministic per-root lock for the other operations.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — the third option with
  fixed idempotency-row-then-root-lock order and one focused derivation helper.
- rationale: it serializes competing root-bound decisions without address
  identity inference or cross-root contention.
- auditimpact: race winner/loser outcomes can be recorded deterministically.
- securityimpact: caller cannot provide the numeric advisory-lock key.
- concurrencyimpact: same root serializes; different roots remain independent;
  different-key root creates remain distinct intents.
- proofimpact: all twelve race/rollback/release scenarios in section 9.
- resterend risico: incorrect lock ordering in a future caller could reintroduce
  deadlock risk.
- expliciete approval required: Daan must approve the scope and order before
  the helper or RPCs are created.

### Decision 7

- decision_id: `WP3I-D07`
- onderwerp: observation and acceptance remain separate operations.
- current evidence: WP3H has immutable non-accepting observations and
  accepted-only versions; the approved contract prohibits auto-acceptance.
- opties: observation automatically creates a version; optional combined
  operation; or always separate calls and decisions.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — always separate
  operations; no observation can accept itself.
- rationale: source facts and authorized accepted truth have different actor,
  timing, evidence and risk.
- auditimpact: observation and acceptance always have separate event and
  request provenance.
- securityimpact: customer/provider observation cannot exercise acceptance
  authority.
- concurrencyimpact: acceptance locks and validates an already committed
  same-root observation.
- proofimpact: negative tests for every observation kind and combined-write
  attempt.
- resterend risico: later UI orchestration might visually blur the two steps
  unless its caller contract remains explicit.
- expliciete approval required: Daan must approve the hard two-operation
  boundary.

### Decision 8

- decision_id: `WP3I-D08`
- onderwerp: unique, server-controlled acceptance decision reference tied to
  operational idempotency.
- current evidence: WP3H already enforces a unique nonblank opaque reference;
  no server creation/binding route exists.
- opties: browser-supplied reference; database-generated unrelated reference;
  or trusted-server-controlled reference included in payload, response, audit
  and idempotency binding.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — the third option; it
  is opaque, cannot encode PII and is never selected by a browser.
- rationale: one decision can be reconstructed across accepted version,
  idempotency and audit without making the foundation a decision engine.
- auditimpact: acceptance and correction events record the opaque reference.
- securityimpact: prevents user-chosen decision identity and information
  leakage.
- concurrencyimpact: per-root lock plus unique constraint permits exactly one
  accepted use of a reference.
- proofimpact: same-reference/different-key true race and replay binding.
- resterend risico: the later decision-authority service remains outside this
  SQL package.
- expliciete approval required: Daan must approve reference ownership and
  binding before an acceptance RPC is created.

### Decision 9

- decision_id: `WP3I-D09`
- onderwerp: correction only inserts a successor accepted version.
- current evidence: WP3H makes versions immutable and enforces same-root
  supersession, one successor, no cycle, later recording and correction reason.
- opties: mutate the old row; insert an unrelated replacement; or insert one
  accepted successor naming the predecessor.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — the third option; no
  update/delete of a prior version.
- rationale: historical reliance and correction provenance remain intact.
- auditimpact: event records predecessor/successor and a reason-present marker.
- securityimpact: the RPC exposes no generic mutation capability.
- concurrencyimpact: root and predecessor locking let one concurrent
  correction win.
- proofimpact: immutable predecessor, one-successor race, overlap/touching and
  rollback tests.
- resterend risico: physical relocation and split/merge remain outside this
  operation and must not be forced through correction.
- expliciete approval required: Daan must approve the correction-only
  successor contract.

### Decision 10

- decision_id: `WP3I-D10`
- onderwerp: stable internal error codes and safe caller mapping.
- current evidence: current app endpoints return safe code/message bodies and
  hide SQL, while raw constraint/exception text is not a stable API contract.
- opties: expose database errors; map ad hoc in every caller; or return one
  closed RPC code set and reuse the shared safe HTTP mapping.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — closed versioned codes
  for validation, authorization, not-found, idempotency, decision conflict,
  already-accepted/non-leaf, overlap/correction conflict, in-progress and
  generic internal failure; never expose constraint names or SQL text.
- rationale: callers can act deterministically without leaking internals.
- auditimpact: controlled rejects record the same stable code.
- securityimpact: safe messages disclose no object existence beyond the
  authorized operation and no schema detail.
- concurrencyimpact: race losers receive deterministic business conflict
  codes, not 500/unique violations.
- proofimpact: exact status/code matrix and forbidden-detail assertions.
- resterend risico: the final caller-specific Dutch message copy is a later
  runtime concern.
- expliciete approval required: Daan must approve the closed code categories
  before migration implementation.

### Decision 11

- decision_id: `WP3I-D11`
- onderwerp: service-role-only execute and safe definer/search-path boundary.
- current evidence: the foundation has no browser grants; current strongest
  definer functions use an empty search path and fully qualified relations.
- opties: invoker RPC with table grants; browser execute; or owner-controlled
  definer RPC with explicit revokes and only service-role execute.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — `SECURITY DEFINER`,
  `SET search_path = ''`, fully qualified objects, explicit owner, revoke from
  `PUBLIC`/`anon`/`authenticated`, grant execute only to `service_role`; the
  same no-public rule applies to focused helpers.
- rationale: immutable core writes remain behind one trusted server boundary.
- auditimpact: every successful business write passes the transactional audit
  path.
- securityimpact: no browser execute or table mutation grant is introduced;
  definition/ownership/search-path checks are mandatory.
- concurrencyimpact: all authorized entry points follow the same lock order.
- proofimpact: catalog ACL, owner, definer, search-path, body-qualification and
  browser-denial cases.
- resterend risico: service-role custody and later caller authorization remain
  operational responsibilities.
- expliciete approval required: Daan must approve the execution boundary
  before any function exists.

### Decision 12

- decision_id: `WP3I-D12`
- onderwerp: real two-transaction concurrency proof and rollback requirements.
- current evidence: WP3H proves sequential transaction behavior; the case
  proof supplies a real process/connection pattern and protected cleanup.
- opties: sequential SQL only; promise-level HTTP concurrency only; or
  deterministic separate-process PostgreSQL races plus rollback/protected
  manifests.
- aanbevolen keuze: AANBEVOLEN — NOG NIET GOEDGEKEURD — the complete section
  9 contract using a disposable local database for committed races.
- rationale: write skew, row/advisory lock release and lost-response replay
  cannot be established by sequential checks.
- auditimpact: proves exact winner/loser event cardinality and replay behavior.
- securityimpact: proves browser denial and no residual proof data.
- concurrencyimpact: directly proves same-root serialization, cross-root
  independence, overlap safety and exception release.
- proofimpact: both single-transaction and genuine two-process groups are
  mandatory; marker, count/hash equality and cleanup are release gates.
- resterend risico: local proof does not prove remote topology or production
  load behavior.
- expliciete approval required: Daan must approve the proof matrix and later
  separately authorize its implementation and execution.

## 11. Remaining Risks And Approval Gate

The package can be approved for later implementation only if Daan explicitly
approves all twelve choices, including a non-arbitrary idempotency
expiry/cleanup rule and the server-role boundary. Approval would still not
authorize population, caller/runtime changes, browser access, remote apply or
deployment.

Remaining outside this decision:

- the actual trusted caller and internal acceptance/correction role matrix;
- exact idempotency retention duration and cleanup owner;
- 44-row mapping/population;
- physical-site matching and PDOK/BAG/provider contracts;
- verifier/NEa acceptance;
- EAN/connection/aangeslotene truth and all relationship tables;
- customer-safe projection and caller cutover;
- current-table retirement;
- privacy/retention beyond already recorded regulatory minimums;
- remote and production proof.

WP3D through WP3H remain unchanged historical/current evidence. No decision in
this draft is approved merely by being recommended here.

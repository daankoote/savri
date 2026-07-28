# WP3M Authorized Operational Location Callers And WP3J Execution Bridge Readiness

DRAFT — WP3M AUTHORIZED OPERATIONAL LOCATION CALLERS AND WP3J EXECUTION BRIDGE — DECISION REQUIRED

## 1. Readiness Verdict

READY FOR DECISION — CALLER AND EXECUTION BRIDGE PACKAGE CAN BE APPROVED

This verdict means the caller, helper, bridge, transaction, idempotency,
audit, safe-error and later-proof boundaries are exact enough for one explicit
decision. It approves none of the recommendations and authorizes no Edge
Function, helper, migration, RPC, proof, SQL/database action, bootstrap,
population, remote apply, deployment or cutover.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2. Start Gate And Evidence

The docs-only audit started on branch `main` at
`0e284ca4d520eae897b94b4319562cd0e8ec7c1d`, parent
`6485dad9a1cc481efc3f17095f90df72a219b315`, subject
`Record WP3L workforce authorization local proof`. The index and tracked
worktree were clean; only the fourteen known protected untracked artifacts
were present.

The fixed implementation basis is:

- WP3J commit `45d926478945fedc610ea02a0ff2b0d4f5f14be4`, with exactly four
  public location-write RPCs and three private helpers;
- WP3L commit `6485dad9a1cc481efc3f17095f90df72a219b315`, with exactly seven
  locally empty tables and six closed capabilities;
- all seven local WP3L tables had zero rows in a read-only catalog/data-count
  transaction;
- no current `api-app-*` caller invokes WP3J or reads/writes WP3L;
- no current workforce helper or execution bridge exists under another name;
- all proposed file, RPC and focused helper names in this document were free;
- the local catalog was inspected only inside explicit read-only transactions.

The official local TKV snapshot was used only after confirming SHA-256
`f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`.

## 3. Current Patterns: Reuse And Rejection

### 3.1 Reuse

| responsibility | exact reusable source | bounded reuse |
|---|---|---|
| bearer verification | `requireVerifiedSupabaseAuthUser()` | Verify the bearer and derive `auth.users.id`; do not derive workforce authority in Edge. |
| request metadata | `getAppRequestMeta()` | Server request ID, hashed IP/user-agent input, method/path/environment and idempotency key. |
| canonical hashing | `stableJsonStringify()` and `payloadHash()` | Hash the normalized, server-enriched action envelope before the bridge call. |
| CORS and safe HTTP bodies | `appOptionsResponse()`, `appJsonResponse()`, `appErrorResponse()` | Preserve current `api-app-*` gateway discipline and hide SQL/schema details. |
| service-role client | current local `appSupabaseClient()` pattern | One non-persistent server client; the credential proves no human authority. |
| WP3J writes | `app_create_location_root_v1`, `app_record_location_observation_v1`, `app_accept_initial_location_version_v1`, `app_correct_location_version_v1` | Invoke only from the matching bridge RPC and inside that bridge transaction. |
| WP3J private mechanics | `app_location_write_idempotency_begin_v1`, `app_location_write_lock_v1`, `app_location_write_complete_v1` | Reuse exact idempotency, root lock and fail-closed audit/completion behavior where the bridge contract matches. |
| WP3L authorization | seven WP3L tables, `app_workforce_scope_is_authorized_v1()` and the request/review guards | Database truth for principal state, capability, case/location scope, maker/checker and execution eligibility. |
| concurrency patterns | WP3J/WP3L advisory locks and separate-process proof runners | Fixed lock order, real PostgreSQL connections, rollback and disposable cleanup. |

The current frontend proves customer Auth/session and customer dashboard reads
only. It contains no operations route, workforce client or WP3J write client.
Existing components, layouts, tokens and CSS require no reuse in this
docs-only/readiness batch. CSS reuse is not applicable.

### 3.2 Rejected Direct Reuse

| source | rejection rationale |
|---|---|
| `requireAppCustomer()` / `requireAppDossierAccess()` | Customer/account/dossier ownership is not workforce identity, capability, case scope or reviewer authority. |
| `insertAppAuditFailOpen()` | Material authorization, request/review and execution outcomes require fail-closed transactional audit. |
| Edge-side reads across raw WP3L tables | They create a check-then-write revocation race and move authorization truth into runtime code. |
| `service_role` possession | It is a technical database credential, never a workforce principal or approval. |
| `app_dossier_locations` and dashboard projections | Mutable dossier data is neither location TARGET truth nor workforce object scope. |
| connection/EAN RPCs and legacy dossier helpers | Their ownership/session boundary conflicts with the approved location/workforce separation. |
| a generic dispatcher or generic RBAC helper | Broad input routing mixes operation, authority and audit contracts and weakens proofability. |

## 4. Non-Negotiable Authority And Transaction Boundary

Edge code may verify a bearer, normalize input, derive request metadata,
canonicalize/hash the server-enriched payload, map safe errors and call one
narrow bridge RPC. Edge code may not authoritatively select or calculate a
workforce identity, capability, scope assignment, case/location relation,
checker distinctness or execution eligibility.

For each execute action, the following must occur in one PostgreSQL
transaction:

1. resolve the verified Auth user to one workforce identity;
2. lock and validate current identity state;
3. lock and validate the exact capability;
4. lock and validate case and location scope;
5. lock and validate the case/location relation;
6. lock request and review where required;
7. revalidate maker, checker, hash and all authority at execution time;
8. call the exact WP3J RPC;
9. validate the exact WP3J response;
10. mark the WP3L request executed only after exact WP3J success;
11. complete caller/bridge idempotency;
12. write correlated authorization and business audit.

No Edge-side check-then-write is allowed. No authorization check and WP3J
write may be split across independent RPC calls. A WP3L request may not become
executed when WP3J fails. Where a material request is required, WP3J may not
commit unless the matching request execution marking commits with it.

## 5. Edge Shape Comparison

| option | shape | assessment |
|---|---|---|
| A | Four operation-family Edge Functions. Root and observation have one fixed execute action; acceptance and correction accept only `prepare`, `review`, `execute`. | **RECOMMENDED — NOT APPROVED.** Preserves the approved four caller families while keeping action vocabularies closed and operation-specific. |
| B | Eight action-specific Edge Functions. | Technically narrow but reopens the approved four-family boundary, doubles gateway/deploy/CORS surfaces and duplicates normalization/error mapping. |
| C | One generic operations dispatcher. | Rejected as high risk: broad routing, mixed authorization inputs, weaker audit ownership, larger blast radius and poor negative-proof boundaries. |

Option A is the recommendation. Each caller compiles to one operation family
and one closed action-to-RPC map; arbitrary operation or RPC names are never
accepted from input.

## 6. Database Bridge Comparison

| model | shape | assessment |
|---|---|---|
| A | Eight purpose-specific service-role-only bridge RPCs. | **RECOMMENDED — NOT APPROVED.** Exact signatures and bodies keep authority, action, WP3J call, response validation and proof separate. |
| B | Four operation-family RPCs with an action parameter. | Not recommended: acceptance/correction signatures become wide nullable unions and dispatch authorization internally. |
| C | One generic authorization/execution dispatcher. | Rejected: generic RBAC/operation engine, caller-selected routing and unacceptable audit/security blast radius. |

Every public bridge RPC must be `SECURITY DEFINER`, use
`SET search_path = ''`, schema-qualify every object, revoke execute from
`PUBLIC`, `anon` and `authenticated`, grant execute only to `service_role`,
fail closed and support real concurrency proof.

One new private helper is justified:

`public.app_ops_location_authorization_resolve_v1`

It resolves `auth.users.id` to exactly one workforce identity, acquires the
existing state/capability/scope/relation advisory-lock namespaces in a fixed
order, resolves the one active exact scope assignment and revalidates current
authorization. It receives no direct execute grant. No separate generic
request-lock, idempotency or WP3J-response helper is recommended: request
locks and response validation remain explicit per RPC, while the existing
WP3J idempotency/lock/completion helpers are reused.

## 7. Exact Proposed Manifest

All paths and names below were free during this audit. They are proposed and
not approved; no file or function was created.

Migration:

`supabase/migrations/20260728220000_app_workforce_location_operation_bridge_rpcs.sql`

Shared Edge helper:

`supabase/functions/_shared/app_workforce_authorization.ts`

Edge callers:

- `supabase/functions/api-app-ops-location-root-create/index.ts`
- `supabase/functions/api-app-ops-location-observation-record/index.ts`
- `supabase/functions/api-app-ops-location-version-accept/index.ts`
- `supabase/functions/api-app-ops-location-version-correct/index.ts`

Public bridge RPCs:

- `public.app_ops_location_root_create_v1`
- `public.app_ops_location_observation_record_v1`
- `public.app_ops_location_accept_prepare_v1`
- `public.app_ops_location_accept_review_v1`
- `public.app_ops_location_accept_execute_v1`
- `public.app_ops_location_correct_prepare_v1`
- `public.app_ops_location_correct_review_v1`
- `public.app_ops_location_correct_execute_v1`

Private helper:

- `public.app_ops_location_authorization_resolve_v1`

Proof:

`scripts/proofs/api-app-ops-location-callers.proof.ts`

## 8. Shared Edge Helper Boundary

`supabase/functions/_shared/app_workforce_authorization.ts` may only:

- call `requireVerifiedSupabaseAuthUser()`;
- build request metadata;
- validate and normalize the closed caller/action input;
- construct the canonical server-enriched payload and hash;
- invoke the one compile-time mapped bridge RPC;
- validate the bridge response envelope and map safe HTTP errors.

It may not query raw workforce tables to calculate authority, infer a
capability, choose a scope assignment, determine checker distinctness,
evaluate execution eligibility, accept a caller-selected RPC name or own
operation truth.

## 9. WP3J Response Contract

WP3J controlled business rejects return JSON and are committed with their
fail-closed audit/idempotency result. Existing codes include
`invalid_input`, `idempotency_conflict`, `location_not_found`,
`observation_not_found`, `observation_location_mismatch`,
`observation_already_accepted`, `decision_ref_conflict`,
`version_not_found`, `version_location_mismatch`,
`version_already_superseded`, `temporal_conflict` and
`concurrent_write_conflict`. Unexpected SQL, trigger, invariant or programming
errors raise and roll back. `internal_write_failed` is reserved for safe
caller mapping and is not a committed business result today.

Exact success fields are:

| WP3J RPC | required success fields |
|---|---|
| `app_create_location_root_v1` | `ok=true`, `status=201`, `operation=create_location_root`, `location_id` |
| `app_record_location_observation_v1` | `ok=true`, `status=201`, `operation=record_location_observation`, `location_id`, `observation_id` |
| `app_accept_initial_location_version_v1` | `ok=true`, `status=201`, `operation=accept_initial_location_version`, `location_id`, `observation_id`, `version_id`, `acceptance_decision_ref` |
| `app_correct_location_version_v1` | `ok=true`, `status=201`, `operation=correct_location_version`, `location_id`, `observation_id`, `version_id`, `predecessor_version_id`, `acceptance_decision_ref` |

WP3J replay returns the stored response body; it does not currently add a
`replayed` field. The bridge therefore determines replay from its own
idempotency state and must never invent a WP3J result field.

For acceptance/correction execution, `wp3j_result_code` is the exact returned
success code `ok`, and `wp3j_result_ref` is the returned `version_id` text.
`wp3j_rpc_name` is the exact called function already constrained by WP3L.
Location/observation/predecessor/decision references already exist in the
request or WP3J response and remain correlated; they are not packed into a
made-up result object.

Any WP3J `ok=false`, response-shape mismatch or raised error prevents the WP3L
pending-to-executed transition. An unexpected error rolls back request
marking, caller/WP3J idempotency changes, relation writes and audit together.

## 10. Operation Contracts

### 10.1 Root Creation

- Requires active server-resolved workforce identity, case-only exact scope
  and `location.root.create`.
- Accepts no workforce identity, capability or scope assignment from browser
  input.
- Calls `app_create_location_root_v1`.
- Inserts the first `app_case_location_relations` `linked` event with the
  returned `location_id` in the same bridge transaction.
- Relation failure rolls back the root, both idempotency records and audit.
- The relation proves no ownership, EAN, aangeslotene, representation,
  physical-site match or acceptance.
- No operation request, checker or emergency override applies.

### 10.2 Observation Registration

- Requires active identity, `location.observation.record`, exact case/location
  scope and an active exact case/location relation.
- Calls `app_record_location_observation_v1` atomically with authorization.
- Records observed data only; parser, provider or browser output never becomes
  accepted evidence or an accepted version.
- No operation request, checker or emergency override applies.

### 10.3 Initial Acceptance

Prepare derives the maker from verified Auth, requires
`location.version.accept.prepare`, locks/revalidates exact scope/relation,
builds `location_acceptance_v1` canonical payload/hash and inserts one
immutable pending request. It calls no WP3J RPC.

Review derives the checker, requires
`location.version.accept.approve`, requires checker different from maker,
binds the exact stored hash and inserts exactly one immutable approve/reject
review. It calls no WP3J RPC.

Execute locks request and review, requires an approved exact-hash review,
requires the execute bearer to resolve to the original maker, locks/revalidates
both principals, both capabilities, both scopes and the relation, calls
exactly `app_accept_initial_location_version_v1`, validates its exact
response, and performs the one pending-to-executed transition in the same
transaction. There is no seventh execute capability and neither the checker
nor an unrelated active workforce identity owns execution. Every failure
rolls back; at most one execution exists.

### 10.4 Correction

Prepare/review follow the same separation with
`location.version.correct.prepare` and
`location.version.correct.approve`. The immutable canonical request binds
location, new observation, predecessor version and all WP3J correction input.

Execute locks and revalidates the approved request and calls exactly
`app_correct_location_version_v1`. The execute bearer must resolve to the
original maker. The predecessor and observation must match the request and
same location. Only an immutable successor is created; no prior truth is
mutated. Request marking and WP3J success are atomic and at-most-once, with no
emergency override.

## 11. Idempotency Contract

Exact proposed bridge scope prefixes are:

| action | bridge scope prefix |
|---|---|
| root create | `app-ops-location:v1:root_create` |
| observation record | `app-ops-location:v1:observation_record` |
| acceptance prepare | `app-ops-location:v1:accept_prepare` |
| acceptance review | `app-ops-location:v1:accept_review` |
| acceptance execute | `app-ops-location:v1:accept_execute` |
| correction prepare | `app-ops-location:v1:correct_prepare` |
| correction review | `app-ops-location:v1:correct_review` |
| correction execute | `app-ops-location:v1:correct_execute` |

The database extends each prefix with server-resolved workforce, case,
location and request/review identifiers as applicable. The trusted Edge
canonical hash binds contract version, caller family, action, verified Auth
UUID, requested object references and exact normalized business input; the
database scope separately binds the resolved workforce identity and validated
objects. The hash is never authorization evidence by itself. No raw payload
or PII is stored in `app_idempotency_keys`.

Same scope/key/hash replays the same safe bridge response. Same scope/key with
another hash returns `idempotency_conflict`. Replay creates no second request,
review, WP3J write, relation, execution or audit. Bridge and WP3J scopes remain
separate but use the same server key/hash/correlation inside one transaction;
neither can commit without the other on execute paths. No fixed TTL or cleanup
duration is selected.

## 12. Audit And Result Correlation

Caller-authorization audit and WP3J business audit remain distinct but share
opaque correlation. Minimum fields are:

- `request_id`;
- compile-time caller name and closed action;
- `actor_ref = app_workforce_identity:<uuid>`;
- workforce identity reference and exact capability code;
- case ID and location ID where available;
- operation request ID and review ID where applicable;
- exact WP3J operation name, result code and returned result reference;
- idempotency scope/key reference;
- authorization outcome and business outcome;
- recorded, requested, reviewed and executed timestamps as applicable.

Audit/public responses contain no e-mail, name, title, JWT, raw payload, raw
evidence, SQL detail or unrelated-object existence. Critical audit insertion
and idempotency completion are fail closed in the bridge transaction.

## 13. Safe-Error Contract

| category | exact safe codes | boundary |
|---|---|---|
| authentication | `authentication_required` | Missing/invalid bearer; HTTP 401 without JWT detail. |
| workforce authorization | `workforce_identity_missing`, `workforce_identity_inactive`, `role_not_authorized`, `capability_not_authorized`, `case_scope_denied`, `location_scope_denied`, `case_location_relation_missing` | HTTP 403; public copy stays generic and does not enumerate identities, roles or out-of-scope objects. |
| workflow | `operation_request_missing`, `operation_request_not_pending`, `operation_review_missing`, `operation_not_approved`, `four_eyes_required`, `self_approval_forbidden`, `payload_hash_mismatch`, `authorization_changed`, `operation_already_executed` | Safe 404/409 according to the authorized request context; no cross-scope existence disclosure. |
| idempotency/concurrency | `idempotency_conflict`, `concurrent_write_conflict` | HTTP 409 and deterministic replay/conflict behavior. |
| validation | `invalid_input` | HTTP 400 with no schema/constraint detail. |
| WP3J business | `location_business_rejected` | Maps a controlled WP3J reject without exposing its function, relation or constraint. |
| unexpected | `internal_error` | HTTP 500/503; full transaction rollback and operational logging only. |

No response leaks SQL, constraint/relation/function names, JWT details, other
users, role inventory, raw audit metadata or existence outside authorized
scope.

## 14. Authorization And Execution Matrix

| caller family | action | bearer | identity state | capability | case scope | location scope | case/location relation | maker | checker | distinct | request | review | execution revalidation | bridge RPC | WP3J RPC | idempotency scope | caller audit | business audit | safe rejection | current status | blocker |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| root create | execute | yes | active | `location.root.create` | exact | case-only | created atomically | n/a | n/a | n/a | no | no | full current authority | `app_ops_location_root_create_v1` | `app_create_location_root_v1` | `root_create` | required | WP3J root audit | auth/scope/business safe code | PROPOSED / NOT APPROVED | decision, bootstrap/population, implementation |
| observation | execute | yes | active | `location.observation.record` | exact | exact | active exact relation | n/a | n/a | n/a | no | no | full current authority | `app_ops_location_observation_record_v1` | `app_record_location_observation_v1` | `observation_record` | required | WP3J observation audit | auth/scope/business safe code | PROPOSED / NOT APPROVED | decision, bootstrap/population, implementation |
| acceptance | prepare | yes | active | `location.version.accept.prepare` | exact | exact | active exact relation | current actor | n/a | n/a | creates | no | authority at prepare | `app_ops_location_accept_prepare_v1` | none | `accept_prepare` | required | none | workflow/authorization code | PROPOSED / NOT APPROVED | decision and implementation |
| acceptance | review | yes | active | `location.version.accept.approve` | request case | request location | active exact relation | request maker | current actor | yes | required | creates | authority at review | `app_ops_location_accept_review_v1` | none | `accept_review` | required | none | four-eyes/workflow code | PROPOSED / NOT APPROVED | decision and implementation |
| acceptance | execute | yes, maker only | active maker | maker prepare + checker approve revalidated | request case | request location | active exact relation | caller equals request maker | revalidated | yes | pending required | approved required | full maker/checker/hash/authority | `app_ops_location_accept_execute_v1` | `app_accept_initial_location_version_v1` | `accept_execute` | required | WP3J acceptance audit | workflow/changed/business code | PROPOSED / NOT APPROVED | decision and implementation |
| correction | prepare | yes | active | `location.version.correct.prepare` | exact | exact | active exact relation | current actor | n/a | n/a | creates | no | authority at prepare | `app_ops_location_correct_prepare_v1` | none | `correct_prepare` | required | none | workflow/authorization code | PROPOSED / NOT APPROVED | decision and implementation |
| correction | review | yes | active | `location.version.correct.approve` | request case | request location | active exact relation | request maker | current actor | yes | required | creates | authority at review | `app_ops_location_correct_review_v1` | none | `correct_review` | required | none | four-eyes/workflow code | PROPOSED / NOT APPROVED | decision and implementation |
| correction | execute | yes, maker only | active maker | maker prepare + checker approve revalidated | request case | request location | active exact relation | caller equals request maker | revalidated | yes | pending required | approved required | full maker/checker/hash/authority | `app_ops_location_correct_execute_v1` | `app_correct_location_version_v1` | `correct_execute` | required | WP3J correction audit | workflow/changed/business code | PROPOSED / NOT APPROVED | decision and implementation |

## 15. Exact Decision Proposal

Every recommendation below is not approved.

### Decision 01

- decision_id: `WP3M-D01`
- onderwerp: four Edge caller families and action vocabulary.
- current evidence: four caller families are approved TARGET; no caller exists.
- current gap: exact endpoint/action shape is undecided.
- opties: four family callers; eight action callers; generic dispatcher.
- aanbevolen keuze: option A, four family callers; root/observation fixed execute and acceptance/correction closed `prepare|review|execute`.
- exacte technische consequentie: only the four paths in section 7 and compile-time action-to-RPC maps.
- auditimpact: caller family and action are immutable audit dimensions.
- securityimpact: no caller-selected operation/RPC.
- authorityimpact: preserves the approved four-family boundary.
- transaction/concurrencyimpact: every action reaches one matching bridge transaction.
- proofimpact: four endpoint contracts and eight action paths.
- resterend risico: action routing could broaden during implementation review.
- approval required: explicit Daan approval before any Edge file is created.

### Decision 02

- decision_id: `WP3M-D02`
- onderwerp: shared runtime helper boundary.
- current evidence: bearer, metadata, canonical hash, CORS and safe-error helpers exist.
- current gap: no workforce-specific adapter exists.
- opties: duplicate logic; focused adapter; generic authorization engine.
- aanbevolen keuze: one focused adapter limited to section 8.
- exacte technische consequentie: helper calls one fixed bridge RPC and owns no authorization truth.
- auditimpact: consistent request/caller metadata.
- securityimpact: no raw WP3L joins or local authority calculation.
- authorityimpact: database remains authoritative.
- transaction/concurrencyimpact: helper performs no check-then-write.
- proofimpact: unit/source proof for closed maps and forbidden behavior.
- resterend risico: future imports could bypass the helper.
- approval required: explicit Daan approval before helper creation.

### Decision 03

- decision_id: `WP3M-D03`
- onderwerp: bridge RPC granularity.
- current evidence: action signatures and invariants differ materially.
- current gap: no authorization/WP3J bridge exists.
- opties: eight purpose-specific RPCs; four action-dispatch RPCs; one generic dispatcher.
- aanbevolen keuze: model A, eight purpose-specific RPCs.
- exacte technische consequentie: exact public manifest in section 7 plus one private resolver.
- auditimpact: action-specific event and response validation.
- securityimpact: narrow service-role-only definer surfaces.
- authorityimpact: no generic RBAC or caller-selected routing.
- transaction/concurrencyimpact: each body owns its complete fixed lock/write order.
- proofimpact: separate positive/negative/catalog cases per RPC.
- resterend risico: repeated code must not drift.
- approval required: explicit Daan approval before migration creation.

### Decision 04

- decision_id: `WP3M-D04`
- onderwerp: Auth user to workforce principal resolution.
- current evidence: verified bearer resolution and unique `auth_user_id` workforce binding exist; tables are empty.
- current gap: no runtime/database resolver or population exists.
- opties: Edge lookup; caller-supplied workforce ID; private database resolver.
- aanbevolen keuze: verified Auth UUID into private `app_ops_location_authorization_resolve_v1`.
- exacte technische consequentie: database returns one active workforce/scope context or a safe failure.
- auditimpact: opaque workforce actor reference, never e-mail/JWT.
- securityimpact: blocks workforce-ID spoofing and customer-role inference.
- authorityimpact: Auth proves credential only; WP3L proves workforce authority.
- transaction/concurrencyimpact: resolution and authority locks occur inside the bridge transaction.
- proofimpact: missing, inactive, ambiguous and wrong-scope cases.
- resterend risico: real bootstrap/population remains absent.
- approval required: explicit Daan approval; no bootstrap follows automatically.

### Decision 05

- decision_id: `WP3M-D05`
- onderwerp: root creation and first case/location relation.
- current evidence: case-only root scope and WP3J root creation exist separately.
- current gap: no atomic bridge creates both.
- opties: root then relation in another call; root without relation; one atomic bridge.
- aanbevolen keuze: one atomic bridge using `location.root.create`.
- exacte technische consequentie: WP3J root success and initial linked relation commit or roll back together.
- auditimpact: authorization, root business audit and relation reference correlate.
- securityimpact: browser chooses no workforce/scope/authoritative IDs.
- authorityimpact: relation remains workflow scope only.
- transaction/concurrencyimpact: idempotency, case scope, root write and relation guard share one transaction.
- proofimpact: relation-failure rollback and no orphan root.
- resterend risico: relation decision/reference ownership needs implementation review.
- approval required: explicit Daan approval before bridge SQL.

### Decision 06

- decision_id: `WP3M-D06`
- onderwerp: observation registration.
- current evidence: WP3J immutable non-accepting observation RPC exists.
- current gap: no active workforce/case/location authorization bridge.
- opties: browser/customer write; combined observe/accept; authorized atomic observation.
- aanbevolen keuze: authorized atomic observation only.
- exacte technische consequentie: require active `location.observation.record`, exact scope/relation, then call the exact WP3J RPC.
- auditimpact: separate authorization and observation business events.
- securityimpact: parser/browser data is never authoritative.
- authorityimpact: no maker/checker because no acceptance occurs.
- transaction/concurrencyimpact: authority locks and WP3J write share one transaction.
- proofimpact: non-acceptance and cross-scope negatives.
- resterend risico: external source/evidence acceptance remains separate.
- approval required: explicit Daan approval before implementation.

### Decision 07

- decision_id: `WP3M-D07`
- onderwerp: acceptance prepare.
- current evidence: immutable WP3L request shape and prepare capability exist.
- current gap: no caller/RPC creates requests from verified principals.
- opties: direct acceptance; mutable draft; immutable canonical request.
- aanbevolen keuze: immutable `location_acceptance_v1` request; no WP3J call.
- exacte technische consequentie: server-derived maker, exact scope/relation, canonical payload/hash and pending request.
- auditimpact: prepare actor/request/hash correlation.
- securityimpact: browser cannot select maker or capability.
- authorityimpact: prepare authority is not approve authority.
- transaction/concurrencyimpact: maker authority and request insert lock atomically.
- proofimpact: wrong capability/scope/hash/replay cases.
- resterend risico: canonical field list must be frozen in implementation review.
- approval required: explicit Daan approval before RPC creation.

### Decision 08

- decision_id: `WP3M-D08`
- onderwerp: acceptance review.
- current evidence: one immutable review and self-approval guard exist.
- current gap: no verified checker caller/RPC.
- opties: maker review; mutable review; one immutable distinct-checker decision.
- aanbevolen keuze: exact-hash approve/reject by server-derived distinct checker.
- exacte technische consequentie: require `location.version.accept.approve`; insert no more than one review; no WP3J call.
- auditimpact: checker, outcome, decision ref and request correlation.
- securityimpact: no self-approval or role inference.
- authorityimpact: checker authority remains separate.
- transaction/concurrencyimpact: request/review lock permits at most one final review.
- proofimpact: self-review, wrong hash/scope/capability and race.
- resterend risico: operational assignment governance remains absent.
- approval required: explicit Daan approval before RPC creation.

### Decision 09

- decision_id: `WP3M-D09`
- onderwerp: acceptance execution bridge.
- current evidence: WP3J acceptance and WP3L execution eligibility are separately proven.
- current gap: they are not atomically connected.
- opties: Edge two-call flow; async eventual bridge; one database transaction.
- aanbevolen keuze: one purpose-specific atomic execute RPC.
- exacte technische consequentie: only the original maker may invoke execute; lock/revalidate approved request, call exact WP3J acceptance, validate response, then mark executed with returned `version_id`.
- auditimpact: authorization and WP3J result are correlated but distinct.
- securityimpact: no stale authority or fabricated success.
- authorityimpact: maker owns execution after distinct approval; no new execute capability, checker execution or third-principal execution is inferred.
- transaction/concurrencyimpact: one transaction and at most one execution.
- proofimpact: WP3J reject/error, revocation and execution races.
- resterend risico: remote topology/load remains unproven.
- approval required: explicit Daan approval before bridge SQL.

### Decision 10

- decision_id: `WP3M-D10`
- onderwerp: correction prepare.
- current evidence: correction request shape binds predecessor and observation.
- current gap: no verified maker caller/RPC.
- opties: mutate version; loose request; immutable exact correction request.
- aanbevolen keuze: immutable `location_correction_v1` request; no WP3J call.
- exacte technische consequentie: bind exact location, observation, predecessor, correction inputs and hash.
- auditimpact: maker/request/predecessor correlation without raw payload.
- securityimpact: no arbitrary prior-truth mutation.
- authorityimpact: requires only correct-prepare at this stage.
- transaction/concurrencyimpact: authority and request insert are atomic.
- proofimpact: wrong predecessor/location/capability/hash cases.
- resterend risico: relocation/split/merge must not enter correction.
- approval required: explicit Daan approval before RPC creation.

### Decision 11

- decision_id: `WP3M-D11`
- onderwerp: correction review.
- current evidence: immutable distinct-checker review guard supports correction.
- current gap: no verified checker caller/RPC.
- opties: reuse acceptance authority; maker review; exact correction approval.
- aanbevolen keuze: require `location.version.correct.approve` and exact hash.
- exacte technische consequentie: one immutable approve/reject; no WP3J call.
- auditimpact: correction-specific decision correlation.
- securityimpact: no capability substitution or self-approval.
- authorityimpact: correction approval remains separate from acceptance approval.
- transaction/concurrencyimpact: request/review lock permits one decision.
- proofimpact: wrong capability/hash/scope and true review race.
- resterend risico: assignment authority remains not implemented.
- approval required: explicit Daan approval before RPC creation.

### Decision 12

- decision_id: `WP3M-D12`
- onderwerp: correction execution bridge.
- current evidence: WP3J immutable successor and WP3L execution eligibility are separately proven.
- current gap: no atomic link.
- opties: Edge two-call; mutable predecessor; exact atomic bridge.
- aanbevolen keuze: exact atomic correction execute RPC.
- exacte technische consequentie: only the original maker may invoke execute; revalidate, call exact WP3J correction, validate same request objects, mark executed with returned `version_id`.
- auditimpact: predecessor/successor/request correlation.
- securityimpact: no overwrite or fabricated result.
- authorityimpact: maker owns execution after distinct correction approval; no new execute capability or third-principal authority is inferred.
- transaction/concurrencyimpact: one successor and one execution at most.
- proofimpact: predecessor races, WP3J reject/error and rollback.
- resterend risico: external physical correction validation remains separate.
- approval required: explicit Daan approval before bridge SQL.

### Decision 13

- decision_id: `WP3M-D13`
- onderwerp: execution-time revalidation and revocation race.
- current evidence: WP3L revalidates sequentially and uses versioned advisory namespaces.
- current gap: bridge versus concurrent revocation is not yet proven.
- opties: snapshot-only check; Edge precheck; shared-namespace authorization locks plus revalidation.
- aanbevolen keuze: private resolver acquires fixed state/capability/scope/relation locks and revalidates inside execute.
- exacte technische consequentie: revocation and execution serialize; maker/checker locks use deterministic order.
- auditimpact: final authorization outcome reflects execution-time truth.
- securityimpact: closes stale-authority race.
- authorityimpact: no approval survives suspension/revocation automatically.
- transaction/concurrencyimpact: fixed lock order and one transaction.
- proofimpact: genuine revocation-versus-execution races.
- resterend risico: lock-order drift could deadlock.
- approval required: explicit Daan approval of namespaces/order before SQL.

### Decision 14

- decision_id: `WP3M-D14`
- onderwerp: Edge/bridge/WP3J idempotency and replay.
- current evidence: shared idempotency table and WP3J helpers are proven.
- current gap: parent/child correlation across authorization and WP3J is undefined.
- opties: Edge-only key; independent uncorrelated keys; atomic correlated bridge/WP3J scopes.
- aanbevolen keuze: section 11 scopes with the same server key/hash and atomic parent/child completion.
- exacte technische consequentie: replay cannot duplicate request, review, relation, WP3J write or execution.
- auditimpact: one idempotency correlation across distinct events.
- securityimpact: scopes bind server principal and objects; no raw payload/PII.
- authorityimpact: replay never bypasses current first-execution authorization.
- transaction/concurrencyimpact: same-key serialization and rollback together.
- proofimpact: replay, payload conflict, lost response and divergence negatives.
- resterend risico: retention/cleanup duration remains undecided.
- approval required: explicit Daan approval; no TTL is inferred.

### Decision 15

- decision_id: `WP3M-D15`
- onderwerp: audit and WP3J result correlation.
- current evidence: WP3J business audit and WP3L opaque request/review/result fields exist.
- current gap: caller authorization events are not defined.
- opties: merged event; uncorrelated logs; distinct correlated events.
- aanbevolen keuze: distinct authorization/workflow and business events with section 12 identifiers.
- exacte technische consequentie: fail-closed minimal audit in the same transaction.
- auditimpact: reconstructable caller, authority, request/review and WP3J outcome.
- securityimpact: no PII/raw evidence/JWT/SQL.
- authorityimpact: authorization outcome is not business or regulatory acceptance.
- transaction/concurrencyimpact: committed outcomes and audit cannot diverge.
- proofimpact: field allowlist, cardinality, correlation and rollback.
- resterend risico: external operational log retention remains separate.
- approval required: explicit Daan approval before event vocabulary implementation.

### Decision 16

- decision_id: `WP3M-D16`
- onderwerp: safe errors and anti-enumeration.
- current evidence: current app helpers hide SQL and map stable codes.
- current gap: workforce/workflow/WP3J category mapping is absent.
- opties: raw database errors; one opaque error; closed section 13 vocabulary.
- aanbevolen keuze: closed vocabulary with generic public copy and internal category distinction.
- exacte technische consequentie: no schema/function/constraint/JWT or out-of-scope existence detail.
- auditimpact: authorized controlled rejects record stable categories.
- securityimpact: anti-enumeration and least disclosure.
- authorityimpact: errors never reveal role inventory.
- transaction/concurrencyimpact: race losers receive deterministic conflicts; unexpected errors roll back.
- proofimpact: exact code/status and forbidden-detail assertions.
- resterend risico: operational observability needs separate secured logs.
- approval required: explicit Daan approval before caller implementation.

### Decision 17

- decision_id: `WP3M-D17`
- onderwerp: implementation and proof contract.
- current evidence: WP3J/WP3L provide local fresh-apply, negative, rollback and real-race patterns.
- current gap: no integrated helper/Edge/bridge/WP3J proof exists.
- opties: unit only; sequential integration only; layered plus real multi-principal races.
- aanbevolen keuze: full section 16 matrix with disposable local foundation.
- exacte technische consequentie: helper, Edge, bridge, WP3J integration and separate-process race layers are release gates.
- auditimpact: correlation and no-PII assertions are mandatory.
- securityimpact: browser execute and cross-scope denial are mandatory.
- authorityimpact: proves no customer/service-role/representation inference.
- transaction/concurrencyimpact: review, execution and revocation races plus rollback.
- proofimpact: exact future proof path in section 7; browser proof only with later UI.
- resterend risico: local proof is not remote/production proof.
- approval required: explicit Daan approval before proof implementation or execution.

### Decision 18

- decision_id: `WP3M-D18`
- onderwerp: bootstrap, population, assignment authority, remote apply and cutover.
- current evidence: local foundations are empty and no bootstrap/caller/deploy exists.
- current gap: real principals, governance, ownership and deployment decisions are absent.
- opties: bundle with callers; seed identities; keep separate gated batches.
- aanbevolen keuze: keep all as separate, non-authorized gates.
- exacte technische consequentie: caller/bridge may use disposable proof fixtures only; no real identity/assignment creation.
- auditimpact: no fabricated production workforce events.
- securityimpact: no seeded admin, fixed Auth UUID or browser self-enrollment.
- authorityimpact: implementation approval would not grant population/deployment authority.
- transaction/concurrencyimpact: proof fixtures roll back or disposable database is removed.
- proofimpact: protected local foundation remains empty.
- resterend risico: production activation remains blocked.
- approval required: separate explicit bootstrap, ownership, remote and deployment decisions.

## 16. Required Later Proof Matrix

| case | proof layer | required outcome |
|---|---|---|
| no bearer / invalid bearer | Edge/runtime | `authentication_required`; no bridge call |
| customer without workforce binding | bridge | safe missing-authority reject |
| suspended or revoked identity | bridge | reject; no WP3J/request execution |
| missing/expired capability | bridge | reject |
| missing/expired scope | bridge | reject |
| wrong case or location | bridge | anti-enumerating reject |
| missing/unlinked case/location relation | bridge | reject |
| root outside case-only scope | bridge | reject |
| root relation insert failure | integration | root, audit and idempotency all roll back |
| observation input | integration | observation never creates accepted version/evidence |
| prepare wrong capability/scope | bridge | no request |
| self review | bridge/WP3L | `self_approval_forbidden` |
| review wrong capability/scope/hash | bridge/WP3L | no review |
| execute without review / after reject | bridge | no WP3J call |
| maker/checker/capability revocation | real concurrency | execution loses or serializes after revocation |
| scope end or relation unlink | real concurrency | execution rejected |
| WP3J controlled business reject | integration | `location_business_rejected`; request remains pending |
| WP3J unexpected error | integration | full rollback; `internal_error` |
| replay | all write layers | same safe response; no duplicate row/event |
| same key, different payload | bridge | `idempotency_conflict` |
| two-connection review race | real concurrency | at most one review |
| two-connection execution race | real concurrency | at most one WP3J write/execution |
| revocation versus execution | real concurrency | fixed serial outcome; no stale authorization |
| root plus relation | integration | atomic both-or-neither |
| audit correlation / no PII | integration | exact allowlist and linked events |
| browser execute on bridge/WP3J | catalog/runtime | denied |
| cross-case/cross-location | bridge | denied without existence leak |
| rollback/disposable cleanup | proof harness | no residue/database |
| protected foundation | proof harness | real seven WP3L tables remain empty |

Proof layers are separate: helper/unit proof, Edge/runtime proof, bridge-RPC
proof, WP3J integration proof and genuine multi-principal/process concurrency
proof. Browser proof starts only when a visible operations UI is separately
authorized and implemented.

## 17. Remaining Gates

- All eighteen recommendations require explicit approval.
- Authorized callers and the WP3J execution bridge are `NOT IMPLEMENTED`.
- Workforce bootstrap/population and assignment-authority runtime are
  `NOT IMPLEMENTED`.
- The proposed manifest is not approved.
- Operations UI, customer UI/self-service acceptance, 44-row mapping,
  PDOK/BAG, EAN/connection/aangeslotene, remote apply, production, cutover and
  regulatory/verifier acceptance remain outside this package.
- Caller design can be implemented and proven later with disposable fixture
  principals only after explicit authorization; that grants no real workforce
  population or production activation.

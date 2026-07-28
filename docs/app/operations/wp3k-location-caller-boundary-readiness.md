# WP3K Location Caller Boundary Readiness

DRAFT — WP3K AUTHORIZED OPERATIONAL LOCATION CALLER BOUNDARY — DECISION REQUIRED

Audit date: 2026-07-28.

## 1. Readiness Verdict

PARTIAL — ROLE, AUTHORITY OR SCOPE FOUNDATION INCOMPLETE

The technical database boundary is locally proven, but an authorized
operational caller is not safe to implement yet. The repository has a proven
customer-authentication and customer-dossier ownership boundary; it has no
proven workforce identity, no approved internal role vocabulary, no
workforce-role assignment or authorization resolver, and no case-to-location
scope relation. Representation authority remains `NOT SCHEMA READY` and may
not substitute for an internal reviewer role.

This audit is a decision proposal only. No recommendation is approved.
Readiness does not authorize an Edge Function, helper, migration, proof,
database write, frontend, remote apply or deployment.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2. Evidence And Repository Boundary

| evidence | result |
|---|---|
| repository | `/Users/daankoote/dev/enval` |
| branch | `main` |
| start HEAD | `ce7be9fea4d4efef66aa9585c7763bb3a6593296` |
| parent | `45d926478945fedc610ea02a0ff2b0d4f5f14be4` |
| subject | `Record WP3J local location write proof` |
| WP3J implementation commit | `45d926478945fedc610ea02a0ff2b0d4f5f14be4` |
| WP3J documentation commit | `ce7be9fea4d4efef66aa9585c7763bb3a6593296` |
| official local TKV SHA-256 | `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` |
| index and tracked start state | empty and clean |
| runtime caller of WP3J RPCs | none |
| database inspection | local catalog metadata only, read-only |

The local catalog contains the four WP3J public RPCs and three internal
helpers. The public RPCs are `SECURITY DEFINER`, use an empty search path and
grant execute only to `service_role`. The helpers have no direct
service-role execute. These facts prove only a technical database caller
boundary.

No `api-app-*` Edge Function invokes a WP3J RPC. The only current runtime
location callers still write/read the mutable dossier snapshot:

- `api-app-signup-submit` writes `app_dossier_locations`;
- `api-app-dashboard-get` reads and projects `app_dossier_locations`.

No current runtime, frontend or customer path writes `app_locations`,
`app_location_address_observations` or `app_location_versions`.

## 3. Current Identity, Role And Scope Inventory

### 3.1 Proven Customer Authentication

`requireVerifiedSupabaseAuthUser()`:

- extracts one bearer token;
- validates it with `serviceClient.auth.getUser`;
- requires a UUID Auth user ID;
- requires a normalized verified email;
- uses no JWT `app_metadata`, `user_metadata`, role, AAL or custom claim as
  workforce authorization.

`requireAppCustomer()`:

- resolves one active `app_customer_identities` row;
- resolves one active `app_customers` row;
- derives `actorRef = app_customer_identity:<identity_id>`;
- proves customer portal context only.

`requireAppDossierAccess()`:

- verifies current `app_customer_dossiers.customer_id` ownership;
- uses a non-enumerating not-found/forbidden response;
- proves customer access to a mutable dossier shell only.

These helpers do not resolve a workforce identity, internal role, case role,
representation authority, location scope, evidence-review qualification or
four-eyes relationship.

### 3.2 Current Database Foundations

| object | current evidence | does not prove |
|---|---|---|
| `app_customers` | active ENVAL customer account shell | workforce identity, legal party or internal role |
| `app_customer_identities` | Auth user to customer-account binding | employee/contractor identity or operations authority |
| `app_cases` | empty immutable customer-owned case roots, locally proven | a relation to a location or permission to write it |
| `app_case_party_roles` | empty immutable `service_recipient`/`case_contact` history, locally proven | representation authority, reviewer authority or location scope |
| representation-authority objects | absent | any authority decision |
| `app_audit_events` | app audit primitive with actor/request/scope metadata | authorization decision or reviewer qualification |
| `app_idempotency_keys` | shared scoped replay/conflict primitive | permission to execute an operation |

No current table establishes a workforce principal, employment/contract
status, internal role assignment, capability assignment, case/location
assignment, reviewer qualification, delegation, suspension or revocation.

### 3.3 Runtime And Visual Inventory

All seven current `api-app-*` endpoints are public-pre-auth or customer-auth
flows. There is no `api-app-ops-*`, `api-app-internal-*` or current app-admin
endpoint. The legacy `api-dossier-*` session model is not reusable as app
workforce identity.

Current frontend Auth uses only customer Supabase sessions and customer
bootstrap. Dashboard clients and services send the customer access token and
read a customer-safe projection. No operations shell, reviewer component or
internal-role route exists.

Existing tokens, base styles, layouts, forms, cards, status panels and
dashboard components require no change for this docs-only audit.

CSS reuse: not applicable.

## 4. Hard Conceptual Separation

| layer | exact meaning | forbidden inference |
|---|---|---|
| technical database caller | `service_role` executing a WP3J RPC | a human identity, internal role or approved decision |
| server runtime | a future specific Edge Function | permission merely because it holds a service key |
| authenticated principal | one server-verified Supabase Auth user or another separately proven server principal | customer, workforce or legal authority without a separate binding |
| workforce/operations role | an approved internal authorization for one operational capability | customer ownership, case contact or representation authority |
| business scope | exact case, location and, only where still needed during coexistence, dossier context | global access from a broad role |
| customer/party representation | authority to act for a represented party within exact scope/time | internal evidence or location-review authority |
| evidence/location decision | qualified internal authority to accept or correct observed location data | credential control, upload, parser result or representation |
| four-eyes | an independent second qualified principal for a material decision | two labels, one account or self-approval |

`service_role` is never a human identity or role. Customer representation
never creates internal evidence/location acceptance authority. A case role is
workflow context only.

## 5. Exact Use-Case Boundary

The caller package covers only:

- `create_location_root`;
- `record_location_observation`;
- `accept_initial_location_version`;
- `correct_location_version`.

It excludes browser-direct RPC calls, customer self-service acceptance,
population, 44-row mapping, EAN/charger relations, PDOK/BAG integration,
customer projection, operations UI, remote apply, production deploy, cutover
and retirement.

## 6. Authorization Matrix

Every role label below is deliberately `DECISION REQUIRED`; current evidence
does not support inventing a production role name.

| use_case | technical caller | principal type | required internal role | required object scope | required case/location relation | customer/party authority relevance | maker | checker | four-eyes required | RPC | expected audit event | denial code | evidence required | current implementation status | blocker |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `create_location_root` | proposed specific ops Edge Function using `service_role` | verified Auth user plus future active workforce identity | DECISION REQUIRED — root-create capability | creation request plus authorized case/dossier context; no address-based global dedupe | no proven case/location relation exists because the root is new | source/case context only; never internal reviewer authority | qualified operator or approved system ingestion | none by default; escalation reviewer for outliers | DECISION REQUIRED; recommendation: no for ordinary statusless root creation | `app_create_location_root_v1` | `location_root_created` or caller authorization reject | `role_not_authorized`, `case_scope_denied` | approved creation basis and attributable request context | NOT IMPLEMENTED | workforce model, capability and root-create scope rule absent |
| `record_location_observation` | proposed specific ops Edge Function using `service_role` | verified workforce principal or separately approved system principal | DECISION REQUIRED — observation-record capability | exact existing `location_id` plus authorized source/case context | explicit authorized relation required; none exists | source/case context only; observation is not acceptance | operator/system records observed data | no checker for registration; later acceptance remains separate | recommendation: no for pure immutable observation; decision still required for system ingestion | `app_record_location_observation_v1` | `location_observation_recorded` or caller authorization reject | `location_scope_denied`, `case_scope_denied` | exact source/provenance/freshness inputs and scope decision | NOT IMPLEMENTED | workforce/system principal and object-scope resolver absent |
| `accept_initial_location_version` | proposed specific ops Edge Function using `service_role` | verified Auth user plus future active qualified workforce identity | DECISION REQUIRED — acceptance-review capability | exact case, location, observation and decision context | explicit case-to-location authorization required; none exists | may be source context or upstream precondition, but never replaces reviewer authority | qualified maker prepares recommendation/evidence set | distinct qualified checker authorizes acceptance | recommendation: yes; exact critical-decision policy requires approval | `app_accept_initial_location_version_v1` | `location_initial_version_accepted` or caller authorization reject | `four_eyes_required`, `self_approval_forbidden`, scope denials | exact immutable observation/evidence refs, decision ref, maker/checker and requirement context | NOT IMPLEMENTED | reviewer roles, four-eyes record and case/location relation absent |
| `correct_location_version` | proposed specific ops Edge Function using `service_role` | verified Auth user plus future active qualified workforce identity | DECISION REQUIRED — correction-review capability | exact case, location, predecessor, new observation and correction context | explicit case-to-location authorization and predecessor scope required; none exists | may inform why a correction is requested; never reviewer authority | qualified maker prepares correction and impact | distinct qualified checker authorizes successor | recommendation: yes | `app_correct_location_version_v1` | `location_version_corrected` or caller authorization reject | `four_eyes_required`, `self_approval_forbidden`, scope denials | predecessor/successor evidence, reason, impact, maker/checker and decision ref | NOT IMPLEMENTED | reviewer roles, four-eyes record, impact policy and scope relation absent |

## 7. Four-Eyes Readiness

### Root Creation

A statusless root does not accept an address, party, connection or EAN fact.
The recommendation is one authorized maker without a mandatory checker for
the ordinary case. Duplicate/ambiguous physical-site or pilot-outlier cases
must be blocked and manually escalated; they must not be merged by address.
This recommendation remains unapproved.

### Observation Registration

Observation registration is immutable data registration, not evidence
acceptance. One authorized human or separately approved system principal may
record it. The source, retrieval time, hashes and limitations remain
provenance. A checker is not recommended merely for registration. System
ingestion, allowed sources and escalation thresholds remain decisions.

### Initial Acceptance

Initial acceptance creates operational location truth and is a material
decision. The recommendation is a qualified maker plus a distinct qualified
checker. The checker must see the exact immutable observation/evidence set,
scope, decision reference and conflicts. The WP3J RPC receives one actor
reference and does not itself prove two principals; the future caller boundary
must fail closed unless the independent approval record is proven.

### Correction

Correction creates a new operational successor while preserving the
predecessor. It is a material decision and should require a distinct checker.
New evidence first becomes a new observation. Reassessment then appends a new
decision/correction path; no prior version or decision is edited.

### Emergency And Outlier Rule

No emergency override is approved. A future emergency route, if any, needs a
separate explicit decision, expiry, qualified maker/checker, conflict rule,
mandatory later review and fail-closed audit. Until then, emergency and pilot
outliers are blocked/manual escalation.

## 8. Representation-Authority Boundary

The recorded pilot perimeter remains:

- a natural person acting only for self;
- one individually authorized natural person for an organization;
- one simple individually authorized natural person for a VvE;
- an optional one-step direct written power of attorney only after the
  existing legal/verifier validation and later approval;
- joint signing, K-of-N, chains, subdelegation and unclear authority remain
  blocked/manual escalation.

For all four internal location writes, representation context is at most
source/case context or an upstream business precondition chosen by a later
contract. It is not the internal authorization to record, accept or correct
location truth. A customer representative may submit or support an
observation; that person may not become the internal maker/checker merely
through representation.

## 9. Actor Provenance Proposal

The future caller should derive, never accept authoritatively from the
browser:

| field | proposed source/boundary |
|---|---|
| principal `user_id` | verified server-side through Supabase Auth |
| workforce identity reference | future active workforce binding; no current object exists |
| workforce role/capability reference | future server-resolved assignment; vocabulary is decision required |
| case/location scope | future object-level authorization result from stable IDs |
| authenticated context | server-recorded Auth verification time/context; exact session assurance policy is decision required |
| `request_id` | `getAppRequestMeta()` server result |
| idempotency key | retry token from request, bound to server-derived scope and payload |
| Edge Function name | compile-time constant for the specific caller |
| RPC name | compile-time constant for that caller |
| maker/checker relation | immutable approval reference resolved before material RPC call |
| `actor_ref` | proposed opaque `app_workforce_identity:<uuid>`; never email/name/role text |
| minimum audit metadata | caller, principal/workforce ref, role/capability ref, case/location refs, authz result/reason, request/idempotency correlation, maker/checker refs and RPC result code |

The proposed `actor_ref` format is not approved and depends on an approved
workforce identity object. E-mail, name, phone, free-form title, JWT payload,
raw evidence and other PII are forbidden in `actor_ref`.

## 10. Safe Caller Error Contract

| safe code | class | safe meaning |
|---|---|---|
| `authentication_required` | caller authorization reject | no verified principal |
| `workforce_identity_missing` | caller authorization reject | no active workforce binding |
| `role_not_authorized` | caller authorization reject | capability is absent |
| `location_scope_denied` | caller authorization reject | exact location is outside authorized scope or indistinguishable |
| `case_scope_denied` | caller authorization reject | exact case is outside authorized scope or indistinguishable |
| `authority_context_invalid` | caller authorization reject | required source/representation context is absent, invalid or unresolved |
| `four_eyes_required` | caller authorization reject | required independent approval is absent |
| `self_approval_forbidden` | caller authorization reject | maker and checker are the same principal or otherwise conflicted |
| `idempotency_conflict` | WP3J business reject | same key/scope with another payload |
| `concurrent_write_conflict` | WP3J business reject | deterministic competing-write outcome |
| `invalid_input` | caller validation or WP3J business reject | safe bounded input failure |
| `internal_error` | unexpected runtime/database failure | generic retry/support response with internal correlation only |

Additional WP3J business codes remain mapped through a closed allowlist to a
safe conflict/not-found/invalid response. The caller must not pass through
SQL text, constraint names, relation names, JWT details, other users,
internal role inventory or raw audit metadata. Not-found and forbidden are
coalesced where existence disclosure would enumerate objects.

Caller-authorization rejects occur before the RPC and use a dedicated
fail-closed internal authorization/audit path once a trustworthy workforce
principal exists. WP3J controlled business rejects remain transactionally
audited by the RPC. Unexpected failures roll back WP3J business state and use
ordinary restricted operational logging plus `internal_error`.

## 11. Proposed Future Implementation Manifest

Both naming families are currently free.

| family | assessment |
|---|---|
| `api-app-location-*` | ambiguous: it could imply customer-app location self-service and weakens the customer-versus-workforce boundary |
| `api-app-ops-location-*` | recommended, not approved: makes the internal operations trust domain explicit while retaining the current app namespace |

Proposed specific caller paths:

- `supabase/functions/api-app-ops-location-root-create/index.ts`;
- `supabase/functions/api-app-ops-location-observation-record/index.ts`;
- `supabase/functions/api-app-ops-location-version-accept-initial/index.ts`;
- `supabase/functions/api-app-ops-location-version-correct/index.ts`.

Proposed focused helper path:

- `supabase/functions/_shared/app_workforce_authorization.ts`.

Proposed proof path:

- `scripts/proofs/api-app-ops-location-callers.proof.ts`.

All paths are free and unapproved. No file is created by WP3K.

The new helper is justified only because `_shared/app_customer_auth.ts` owns a
customer-specific trust chain and dossier-ownership rule. Adding workforce
roles to it would merge customer and internal authorization. The future
helper should compose the existing verified Supabase bearer primitive where
safe, then resolve a separately approved workforce identity, capability and
object scope. It must not duplicate bearer parsing, request metadata, safe
responses or hashing. If implementation review finds that neutral extraction
of `requireVerifiedSupabaseAuthUser()` is cleaner, that refactor requires its
own exact manifest; no near-duplicate bearer helper is proposed.

## 12. Future Proof Contract

| proof case | expected result | proof layer |
|---|---|---|
| no bearer | `authentication_required`; runtime may distinguish gateway-not-reached | endpoint/runtime |
| invalid bearer | safe authentication reject; no auth/JWT detail | endpoint/runtime |
| valid customer without workforce identity | `workforce_identity_missing` | helper and endpoint |
| workforce identity without required role/capability | `role_not_authorized` | helper and endpoint |
| correct role, wrong case | `case_scope_denied`; no case enumeration | helper, endpoint and database fixture |
| correct role, wrong location | `location_scope_denied`; no location enumeration | helper, endpoint and database fixture |
| invalid required representation context | `authority_context_invalid`; no authority inference | helper and endpoint |
| self-approval | `self_approval_forbidden`; no RPC call | helper, endpoint and database fixture |
| valid distinct maker/checker | exactly one authorized material RPC call | endpoint/database |
| same request replay | stored semantic response; no duplicate business/audit event | endpoint and WP3J RPC |
| same key, different payload | `idempotency_conflict` | endpoint and WP3J RPC |
| concurrent authorization change | fail closed or bind one immutable authorization snapshot; never stale allow | genuine multi-principal concurrency |
| WP3J business reject | closed allowlisted safe mapping and correlated RPC audit | endpoint and database/RPC |
| unexpected database failure | `internal_error`, rollback and restricted correlation | endpoint and database/RPC |
| audit correlation | request, idempotency, caller, authorization and RPC outcome reconstructable | endpoint and database/RPC |
| direct browser RPC execute | denied for `anon` and `authenticated` | database/RPC |
| cross-customer or cross-case attempt | denied without target existence disclosure | helper, endpoint and database fixture |
| PII in error or `actor_ref` | none present | unit/helper and endpoint |

Required proof groups:

1. unit/helper proof for parsing, customer/workforce separation, capabilities,
   scope, safe codes and no PII;
2. endpoint/runtime proof for all four specific callers and no RPC call on
   authorization reject;
3. database/RPC proof for execute grants, exact argument derivation,
   idempotency/audit correlation and business-code mapping;
4. genuine multi-principal concurrency proof for authorization change,
   maker/checker races and one material decision;
5. browser proof only after a separately approved visible operations caller
   exists.

## 13. Decision Proposal

Every recommendation below is unapproved.

### Decision 1

- decision_id: `WP3K-D01`
- onderwerp: one specific Edge Function per operational use case versus one
  generic dispatcher.
- current evidence: WP3J exposes four narrow operations with different
  authorization, evidence and four-eyes consequences; current app endpoints
  are also purpose-specific.
- current gap: no operations endpoint exists.
- opties: four specific callers; or one caller-selected generic dispatcher.
- aanbevolen keuze: four specific `api-app-ops-location-*` callers from
  section 11.
- rationale: operation selection, required capability, payload and RPC name
  remain compile-time/server-owned.
- regulatory/auditimpact: each decision route has an explicit reconstructable
  event and proof matrix.
- securityimpact: no generic operation field broadens access.
- authorityimpact: each use case can require its own workforce and
  representation-context decision.
- proofimpact: four positive paths and negative cross-operation tests.
- resterend risico: shared code could drift unless composed through bounded
  helpers.
- approval required: Daan must approve the four-caller shape and names.

### Decision 2

- decision_id: `WP3K-D02`
- onderwerp: exact authenticated principal for internal operations writes.
- current evidence: verified Supabase Auth user ID/email is locally proven for
  customers; no other server principal is proven.
- current gap: no workforce binding or assurance policy exists.
- opties: reuse verified Supabase Auth as credential plus separate workforce
  binding; introduce a separate identity provider later; or trust a shared
  service secret.
- aanbevolen keuze: reuse server-verified Supabase Auth only as the credential
  layer and require a separate active workforce identity before authorization.
- rationale: avoids a second credential implementation without treating a
  customer Auth session as workforce authority.
- regulatory/auditimpact: actions remain attributable to one verified
  principal and separate internal identity.
- securityimpact: shared secrets and customer-only authorization are
  insufficient.
- authorityimpact: credential identity stays separate from role and business
  authority.
- proofimpact: customer-without-workforce and disabled-workforce negatives.
- resterend risico: workforce lifecycle and stronger session assurance remain
  undecided.
- approval required: Daan/security/operations must approve the principal and
  assurance boundary.

### Decision 3

- decision_id: `WP3K-D03`
- onderwerp: workforce identity and role model reuse versus a new focused
  foundation.
- current evidence: customer identities, party roles and case roles exist but
  explicitly prove no internal authorization.
- current gap: workforce identities, assignments, revocation and qualification
  are absent.
- opties: overload customer identities/case roles; store JWT role claims; or
  design a separate minimal workforce authorization foundation.
- aanbevolen keuze: a separate minimal foundation is necessary; exact objects
  remain undecided and require a later contract before code.
- rationale: customer, legal-party, case-participation and workforce truths
  have different owners and lifecycles.
- regulatory/auditimpact: reviewer qualification and changes can be
  reconstructed without rewriting party/customer history.
- securityimpact: prevents role inference from Auth/email/account/case status.
- authorityimpact: workforce authorization remains distinct from
  representation authority.
- proofimpact: assignment, expiry/revocation, no-inference and change-race
  tests become mandatory.
- resterend risico: exact object model and role administrator are absent.
- approval required: Daan must authorize a focused workforce contract before
  any schema/helper implementation.

### Decision 4

- decision_id: `WP3K-D04`
- onderwerp: closed minimal operational role vocabulary and separation of
  observation, acceptance and correction.
- current evidence: current sources provide actor types but no approved
  workforce roles.
- current gap: role names, assignment owner and capability composition are
  undecided.
- opties: one broad operations role; role names inferred from actor types; or
  a closed capability matrix with separately approved human role names.
- aanbevolen keuze: closed per-operation capabilities; do not approve or
  invent human role names in this audit.
- rationale: root/observation registration and material acceptance/correction
  are not equivalent powers.
- regulatory/auditimpact: the exact authorization basis for each event is
  reviewable.
- securityimpact: avoids broad admin/support access and privilege ambiguity.
- authorityimpact: role assignment never creates representation authority.
- proofimpact: every capability/use-case combination needs allow/deny tests.
- resterend risico: the package remains partial until role vocabulary and
  governance are approved.
- approval required: Daan/operations/security must approve the vocabulary,
  assignment authority and separation.

### Decision 5

- decision_id: `WP3K-D05`
- onderwerp: case/location/dossier scope and object-level authorization before
  the RPC call.
- current evidence: customer dossier ownership exists; case and location roots
  exist separately; no case-location relation exists.
- current gap: no stable authorization path relates a workforce principal,
  case and WP3H location.
- opties: global role only; trust request IDs; reuse mutable dossier location;
  or require an explicit approved case/location scope relation.
- aanbevolen keuze: fail closed on an explicit stable case/location relation;
  use dossier only as separately reconciled coexistence context.
- rationale: a role without object scope is excessive and
  `app_dossier_locations` is not target location truth.
- regulatory/auditimpact: every decision can identify the case and physical
  location context used.
- securityimpact: prevents cross-case and cross-location operations.
- authorityimpact: case scope remains workflow context, not party authority.
- proofimpact: wrong-case/location, missing relation and relationship-change
  concurrency tests.
- resterend risico: the relation contract is not designed or implemented.
- approval required: Daan must approve the relation responsibility before
  caller implementation.

### Decision 6

- decision_id: `WP3K-D06`
- onderwerp: customer/party representation versus internal operational
  decision authority.
- current evidence: WP2 documents prohibit Auth/account/case-role inference;
  representation authority remains not schema-ready.
- current gap: exact upstream representation preconditions per operation are
  unresolved.
- opties: representation grants internal role; ignore representation
  entirely; or preserve it only as explicit source/case context or an
  independently evaluated upstream precondition.
- aanbevolen keuze: the third option; representation never grants internal
  reviewer authority.
- rationale: acting for a party and accepting ENVAL location truth are
  different responsibilities.
- regulatory/auditimpact: mandate/authority and internal review remain
  independently reconstructable.
- securityimpact: customer representatives cannot self-approve evidence.
- authorityimpact: preserves the validated pilot perimeter and manual
  escalation.
- proofimpact: negative tests for every Auth/account/party/case shortcut.
- resterend risico: representation schema and external validation remain open.
- approval required: Daan/legal/operations must decide which operations need
  representation context and at what stage.

### Decision 7

- decision_id: `WP3K-D07`
- onderwerp: root-create and observation rights, including system ingestion
  versus a human operator.
- current evidence: roots are statusless and observations are non-accepting;
  WP3J keeps acceptance separate.
- current gap: approved source systems, ingestion principals and escalation
  thresholds do not exist.
- opties: human-only; system-only; or both through distinct authenticated
  principal/capability policies.
- aanbevolen keuze: allow both only after separate principal policies;
  neither path may accept data or infer physical identity.
- rationale: registration can be automated without granting decision power.
- regulatory/auditimpact: source, system/human actor and limitations remain
  explicit.
- securityimpact: provider/customer/browser input cannot choose authoritative
  actor or acceptance.
- authorityimpact: system ingestion has no representation or reviewer
  authority.
- proofimpact: human/system allowlists, provenance and no-auto-accept tests.
- resterend risico: no system-principal lifecycle is approved.
- approval required: Daan/security/operations must approve human and system
  ingestion boundaries.

### Decision 8

- decision_id: `WP3K-D08`
- onderwerp: reviewer authority and four-eyes for initial acceptance and
  correction.
- current evidence: these operations create operational accepted truth;
  WP2B-II and the pilot brief propose distinct qualified reviewers for
  material decisions.
- current gap: no reviewer qualification, approval object or maker/checker
  resolver exists.
- opties: one reviewer; four-eyes for both; or risk-based four-eyes with an
  emergency override.
- aanbevolen keuze: four-eyes for both initial acceptance and correction;
  prohibit emergency override until separately approved.
- rationale: both operations materially affect operational location truth.
- regulatory/auditimpact: maker/checker and relied-on evidence remain
  reconstructable; this is an internal control, not a claimed TKV rule.
- securityimpact: self-approval and conflicted review fail closed.
- authorityimpact: representation cannot occupy either reviewer position by
  itself.
- proofimpact: missing checker, same principal, revoked checker and competing
  approval tests.
- resterend risico: exact reviewer roles and conflict policy are undecided.
- approval required: Daan/legal/operations/security must approve the critical
  list and reviewer rules.

### Decision 9

- decision_id: `WP3K-D09`
- onderwerp: server-derived actor, request, role and authorization context.
- current evidence: request metadata and verified Auth IDs are reusable;
  WP3J accepts actor/request inputs but cannot verify workforce authorization.
- current gap: workforce and authorization references do not exist.
- opties: browser-supplied context; encode PII/role text in `actor_ref`; or
  derive opaque references and an immutable authorization result server-side.
- aanbevolen keuze: server-derived opaque context from section 9.
- rationale: provenance and authorization are security facts.
- regulatory/auditimpact: one request can reconstruct principal, scope,
  decision and RPC outcome.
- securityimpact: prevents actor/role/scope spoofing and PII leakage.
- authorityimpact: role and representation evaluations remain explicit
  references, not actor-string inference.
- proofimpact: tampering, PII scans and exact correlation tests.
- resterend risico: exact workforce object IDs and authorization-result
  persistence are undecided.
- approval required: Daan/security must approve formats and minimum metadata.

### Decision 10

- decision_id: `WP3K-D10`
- onderwerp: idempotency, audit and request correlation between Edge Function
  and WP3J RPC.
- current evidence: `getAppRequestMeta`, canonical hashing, shared
  idempotency and WP3J fail-closed audit are proven locally.
- current gap: no caller authorization audit and no immutable authorization
  snapshot exists.
- opties: independent endpoint/RPC identifiers; duplicate business audit; or
  one request/idempotency correlation with separate caller-authorization and
  WP3J business event responsibilities.
- aanbevolen keuze: the third option; never duplicate or weaken WP3J
  transactional business audit.
- rationale: gateway authorization and database outcomes are different event
  owners but must correlate.
- regulatory/auditimpact: reject, decision and write chains remain
  reconstructable.
- securityimpact: only minimal opaque IDs cross the boundary.
- authorityimpact: the authorization result is explicit before RPC execution.
- proofimpact: cardinality, replay, reject and unexpected-failure correlation.
- resterend risico: caller-reject fail-closed persistence mechanism is not
  designed.
- approval required: Daan/security/operations must approve event ownership and
  correlation fields.

### Decision 11

- decision_id: `WP3K-D11`
- onderwerp: safe error mapping, logging and anti-enumeration.
- current evidence: current app errors are safe and WP3J exposes stable
  business codes; current dossier ownership coalesces not-found/forbidden.
- current gap: no workforce/caller error contract exists.
- opties: pass through exceptions; ad-hoc endpoint maps; or one closed
  three-class map from section 10.
- aanbevolen keuze: the closed caller-authorization, WP3J-business and
  unexpected-failure mapping.
- rationale: callers receive actionable categories without internal details.
- regulatory/auditimpact: stable reject codes correlate with internal events.
- securityimpact: no SQL, JWT, user, role-inventory or object enumeration.
- authorityimpact: invalid representation context does not reveal authority
  records.
- proofimpact: exact status/code allowlist and forbidden-detail/PII scans.
- resterend risico: final operator-facing copy is outside this docs-only
  package.
- approval required: Daan/security must approve the code taxonomy.

### Decision 12

- decision_id: `WP3K-D12`
- onderwerp: later implementation and proof contract, including negative
  authorization tests.
- current evidence: existing app endpoint proofs, WP2 concurrency patterns and
  WP3J RPC proof are reusable; no caller proof exists.
- current gap: workforce, scope and four-eyes fixtures/objects are absent.
- opties: unit tests only; endpoint happy paths only; or all five proof layers
  from section 12.
- aanbevolen keuze: require the complete proof contract before any caller is
  CURRENT.
- rationale: service-role custody and positive RPC behavior do not prove
  authorization.
- regulatory/auditimpact: actor, scope, review and write evidence is tested
  end to end without claiming regulatory acceptance.
- securityimpact: negative, cross-scope, race, enumeration and PII cases are
  release gates.
- authorityimpact: customer/representation/workforce separations are tested.
- proofimpact: unit, endpoint, database/RPC and genuine multi-principal groups;
  browser only when visible behavior exists.
- resterend risico: remote/production identity topology remains separately
  unproven.
- approval required: Daan must approve a later exact implementation manifest,
  proof execution and only then any runtime batch.

## 14. Remaining Blockers And Next Gate

Before implementation can be proposed as safe:

- approve or design the workforce identity lifecycle;
- approve the closed role/capability vocabulary and assignment authority;
- approve the case-to-location object-scope relation;
- decide representation context per use case without reviewer-role inference;
- approve maker/checker, reviewer qualification and conflict rules;
- decide whether system ingestion exists and how its principal is managed;
- approve authorization audit ownership and immutable correlation;
- approve the safe error taxonomy and exact caller/helper/proof manifest;
- keep emergency override prohibited unless separately decided.

Population, 44-row mapping, relationship implementation, customer projection,
operations UI, remote apply, production, cutover and retirement remain
separate blocked packages.

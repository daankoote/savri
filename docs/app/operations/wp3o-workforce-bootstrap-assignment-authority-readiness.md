# WP3O Controlled Pilot Workforce Bootstrap And Assignment Authority Readiness

DRAFT — WP3O CONTROLLED PILOT WORKFORCE BOOTSTRAP AND ASSIGNMENT AUTHORITY — DECISION REQUIRED

## 1. Readiness Verdict

READY FOR DECISION — BOOTSTRAP AND ASSIGNMENT AUTHORITY PACKAGE CAN BE APPROVED

The package is exact enough for an explicit decision about genesis custody,
structural workforce governance, recovery, audit and later proof. The verdict
approves none of the recommendations. It authorizes no bootstrap, population,
migration, RPC, proof implementation, operator script, SQL/database action,
remote apply, deploy, operations UI or cutover.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2. Start Gate And Current Evidence

The docs-only/read-only audit started on branch `main` at
`390bea3516cca3f40cea13c12a74fea9c226ceac`, parent
`6705fa3baf046510d70b8502da6058009b30b2f3`, subject
`Record WP3N location callers bridge local proof`. The index and tracked
worktree were clean. Only the previously protected untracked artifacts were
present.

Read-only source and catalog inspection confirmed:

- WP3J location writes, the WP3L workforce foundation and the WP3N
  caller/bridge boundary remain `CURRENT PROVEN — LOCAL ONLY`;
- the seven real local WP3L tables exist and each has zero rows, so no
  workforce principal, lifecycle, capability assignment, scope assignment,
  operation request or review currently exists;
- the closed WP3L vocabulary has six location capabilities, lifecycle states
  `active`, `suspended`, `revoked`, and append-only capability/scope
  `granted`/`revoked` events;
- eight WP3N bridge RPCs, one private resolver and four operation-family
  callers exist;
- browser roles have no WP3L table privileges; `service_role` has only the
  proven technical `SELECT, INSERT` table privileges and purpose-specific RPC
  execution;
- there is no bootstrap, self-enrollment, workforce-admin,
  assignment-authority or revocation caller under another name;
- no current code derives workforce authority from JWT metadata, e-mail,
  customer binding, case-party role or representation authority;
- a customer binding never creates a workforce binding, and a future dual
  binding must not leak rights between the two domains;
- a genesis bootstrap cannot be approved by the normal workforce authority
  chain because that chain has no principal yet;
- temporary genesis custody and structural workforce administration are
  different responsibilities;
- current customer frontend Auth/session, dashboard components, layouts,
  tokens and CSS provide no workforce administration surface. CSS reuse is
  not applicable.

The local TKV snapshot was used only after verifying SHA-256
`f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`.
No identifiers, PII, JWTs or secrets were printed.

## 3. Eight Hard Separations

| responsibility | authority boundary |
|---|---|
| Genesis bootstrap | A single controlled ceremony creates the first minimal governance pair. Its temporary external custody ends after verified completion and cannot become ordinary workforce authority. |
| Structural identity administration | Later activation, suspension and revocation require active, purpose-specific workforce maker/checker authority. |
| Capability administration | Grant, expiry and revocation are separate reviewed changes; no identity title or first-principal status grants them. |
| Scope administration | Case/location scope grants and endings are separate reviewed changes and never imply an operational capability. |
| Operational maker/checker | The six existing location capabilities authorize only the exact WP3N operation flows and scopes. |
| Customer/representation authority | Customer ownership, case-party role and representation concern customer/legal action only and never workforce management. |
| Technical `service_role` | A server credential transports an approved command to a narrow RPC; it proves neither human identity, custody nor approval. |
| Deployment authority | Permission to apply a remote migration or deploy functions is a separate gate outside this package. |

These responsibilities may not be combined.

## 4. Reuse And Rejected Reuse

### 4.1 Bounded Reuse

| source | allowed reuse |
|---|---|
| `requireVerifiedSupabaseAuthUser()` | Live verified-user checks for normal governance callers; no workforce inference. |
| `app_workforce_identities` and append-only state, capability and scope tables | Store identity binding, lifecycle and assignments after purpose-specific authorization. |
| WP3L locks, immutable guards and temporal validity patterns | Fixed lock order, append-only history, active-at-time resolution and race-safe revalidation. |
| `app_idempotency_keys` | Single-use bootstrap and structural request execution correlation with a canonical hash. |
| `app_audit_events` | Transactional fail-closed success and controlled-reject evidence using bounded scopes and opaque references. |
| Existing service-role-only `SECURITY DEFINER` patterns | Empty search path, schema-qualified objects, narrow execute grants and no browser execution. |
| Existing service-client/environment patterns | Technical transport only, with required environment values and no secret output. |
| Disposable proof and separate-process race patterns | Static, database, operator, concurrency, rollback and cleanup proof in later authorized work. |

### 4.2 Rejected Reuse

| source | rationale |
|---|---|
| `app_bootstrap_customer_auth_v1` | It binds verified Auth to customer identity; broadening it would mix customer and workforce trust domains. |
| `requireAppCustomer()` and customer/case-party/representation checks | These prove no workforce capability, scope, governance or checker authority. |
| `insertAppAuditFailOpen()` | Critical genesis and governance evidence must commit fail closed with the change. |
| `app_workforce_operation_requests` and `app_workforce_operation_reviews` | Their closed operation types and payload contracts are specific to location acceptance/correction, not identity/capability/scope governance. |
| Direct service-role table inserts as normal administration | They do not database-enforce maker/checker authority, immutable intent, execution-time revalidation or reviewed execution evidence. |
| `app_dossier_locations` | Mutable dossier data is not target location truth and cannot define workforce scope. |
| JWT metadata, e-mail, title, customer binding or first-principal status | None is an authorization fact. |
| A generic RBAC or generic dispatcher | Generic roles/permissions/resources or caller-selected routing would widen authority and proof blast radius. |

## 5. Genesis Bootstrap Options

| option | assessment |
|---|---|
| A — controlled environment-specific CLI/runbook | **RECOMMENDED — NOT APPROVED.** No browser or permanent public admin endpoint. A preapproved manifest, designated executor, independent human checker and purpose-specific service-role-only RPC live-check two existing verified Auth accounts and atomically create a minimal split governance pair, active states, exact governance capabilities, empty initial operational scopes, idempotency and fail-closed audit. Remote execution needs separate approval. |
| B — internal bootstrap Edge endpoint without UI | Rejected for the pilot. It leaves a permanent attack surface and still cannot derive genesis approval from a workforce chain that does not yet exist. Hiding an endpoint from UI is not an authority boundary. |
| C — direct SQL inserts | Reserved only for a separately controlled recovery procedure. It is not the normal genesis or structural management route because custody, validation, idempotency, audit and review can be bypassed. |

Option A is the single recommended pilot route and remains unapproved.

The genesis cohort contains exactly two independently verified Auth accounts:
one principal receives only the three proposed governance prepare
capabilities; the other receives only the corresponding three approve
capabilities. Both are created active in one transaction. Neither receives a
location-operation capability or case/location scope from genesis. This
creates a usable two-person governance chain without creating an omnipotent
administrator.

## 6. Structural Assignment Authority Options

| option | assessment |
|---|---|
| A — purpose-specific governance RPCs with prepare/review/execute | **RECOMMENDED — NOT APPROVED.** An active authorized maker prepares an immutable request; a distinct active authorized checker reviews the exact hash; execute locks and revalidates both principals and current authority before appending state/assignment/scope events with correlated audit/idempotency. |
| B — reuse location operation requests/reviews | Rejected. The existing closed operation vocabulary and payload contracts belong to location acceptance/correction. Reuse would mix business decisions with workforce governance and weaken constraints and proof. |
| C — direct service-role inserts from an administration script | Rejected for structural management. A script alone cannot database-enforce maker/checker authority, target scope, review binding, execution-time revalidation and at-most-once evidence. |

Option A is the single recommended structural route and remains unapproved.

## 7. Physical Foundation Answer

Structural assignment authority can be built on the existing seven WP3L
tables for roots, lifecycle events, capability events and operational scope
events, provided the closed capability vocabulary is extended and exactly two
purpose-specific tables are added:

- `public.app_workforce_governance_requests`: immutable proposed
  identity/capability/scope change, canonical hash and pending-to-executed
  lifecycle;
- `public.app_workforce_governance_reviews`: one immutable independent review
  bound to the exact request and hash.

The two tables have independent lifecycle responsibilities. No bootstrap
table is justified: genesis uniqueness, idempotency and audit use existing
foundations. Existing operational request/review tables remain untouched.
No generic roles, permissions, policies, resources, RBAC engine or generic
dispatcher is proposed.

The proposed closed governance capabilities are:

- `workforce.identity.manage.prepare`
- `workforce.identity.manage.approve`
- `workforce.capability.manage.prepare`
- `workforce.capability.manage.approve`
- `workforce.scope.manage.prepare`
- `workforce.scope.manage.approve`

They are narrow global governance capabilities only because the existing
scope table is explicitly case/location operational scope. They grant no
global case/location operation right. The governance request binds the exact
target, action and allowed scope. Adding a broader governance-scope model is a
later separate decision, not an implicit wildcard.

## 8. Custody And Authorization Matrices

### 8.1 Custody Matrix

| action | executor/maker | checker/reviewer | database enforcement | prohibited |
|---|---|---|---|---|
| Genesis ceremony | designated environment operator with technical credential | independent human checker named by opaque approval reference | single-use purpose-specific RPC validates manifest, verified Auth accounts, pre-counts, split grants and atomic audit | self-check, browser call, permanent endpoint, raw identity/secret logging |
| Identity lifecycle | active identity-governance preparer | distinct active identity-governance approver | immutable request/review, execution revalidation and append-only state | self-grant/review, direct insert, last-authority loss |
| Capability lifecycle | active capability-governance preparer | distinct active capability-governance approver | exact allowed code/action/target, revalidation and append-only event | wildcard, `admin`, privilege escalation |
| Scope lifecycle | active scope-governance preparer | distinct active scope-governance approver | exact case/location/relation shape and append-only event | global operational scope, customer-derived scope |
| Remote activation | separately authorized deploy operator | separately required change approver | outside this package | treating genesis or workforce authority as deploy authority |

### 8.2 Required Four-Eyes Actions

| action | four-eyes | additional protection |
|---|---|---|
| Activate a new workforce identity | required | both Auth binding and target identity uniqueness revalidated |
| Suspend an identity | required | pending requests by the target cannot execute afterward |
| Revoke an identity definitively | required | append-only terminal event and last-authority protection |
| Grant a capability | required | no self-grant; checker must hold matching approve authority |
| Revoke/expire a capability | required | revocation wins under lock against assignment/execution |
| Grant a scope | required | exact bounded case/location relation; no wildcard |
| End a scope | required | termination wins under lock against execution |
| Grant or revoke governance authority itself | required | no self-escalation; preserve distinct prepare/approve principals per domain |

For each governance domain, execution must preserve at least one active
preparer and one different active approver. If all structural authority is
lost, a separately approved controlled recovery ceremony may restore the
minimal pair from protected evidence. That procedure is not an emergency
authorization override and may not bypass review, manifest, audit or separate
remote approval.

The checker must independently hold the matching approve capability and
authority over the exact proposed target/change. A broader or higher
operational scope, another governance domain, customer authority or technical
credential cannot substitute for that exact review authority.

## 9. Proposed Bootstrap Manifest

The stored/loggable manifest contains placeholders and opaque references, not
real values. Principal-specific fields repeat once for each member of the
two-person genesis cohort.

| field | bounded rule |
|---|---|
| environment/project reference | approved non-secret environment reference |
| implementation commit | exact reviewed commit |
| migration and function hashes | exact approved artifact hashes |
| verified Auth-account input | protected runtime input; only an opaque/hash reference is persisted or logged |
| customer binding present yes/no | boolean conflict input; no customer identity is logged |
| proposed opaque workforce reference | server-generated opaque reference |
| initial lifecycle state | exactly `active` |
| initial capabilities | exact split prepare or approve governance set; no location capabilities |
| initial case scopes | empty for the genesis pair |
| initial location scopes where allowed | empty for the genesis pair |
| executor reference | opaque custody reference |
| checker reference | different opaque custody reference |
| change/approval reference | immutable approved change reference |
| request ID | server-issued correlation reference |
| idempotency key | single-use protected input; log only safe reference/hash |
| canonical manifest hash | lowercase SHA-256 over the canonical approved manifest |
| expected pre-counts | exact aggregate zero-state assertions |
| expected post-counts | exact aggregate two-identity/two-state/split-grant assertions |
| rollback conditions | any mismatch, controlled reject, audit failure or unexpected error |
| execution timestamp | server/database timestamp |
| result status | controlled safe status only |

The browser cannot submit or authoritatively choose this manifest, Auth
accounts, capability values, scopes, custody actors or approval references.
No name, e-mail, JWT, secret or raw Auth-user ID appears in stored general
logs or public output.

## 10. Dual Customer/Workforce Binding

One `auth.users` account can technically have an independently established
customer binding and workforce binding. Resolution remains separate:
customer bearer context grants no workforce authority, and workforce bearer
context grants no customer ownership or representation.

For the controlled pilot, the recommended fail-closed rule is to block a
dual-bound workforce principal from making, checking or governing an action
on its own customer, case or location. Maker/checker connected-party policy
beyond the directly detectable customer binding requires a compliance and
governance decision; this document does not invent a legal conflict rule.
Until that decision, an unresolved potential connection returns only
`conflict_of_interest` and reveals no object, customer or other-principal
existence.

## 11. Genesis And Governance Audit

Genesis and structural governance use separate event families.

| family | proposed events |
|---|---|
| genesis | `workforce_genesis_completed`, `workforce_genesis_rejected`, `workforce_genesis_recovery_checked` |
| governance workflow | `workforce_governance_prepared`, `workforce_governance_reviewed`, `workforce_governance_executed`, `workforce_governance_rejected` |
| resulting facts | `workforce_identity_activated`, `workforce_identity_suspended`, `workforce_identity_revoked`, `workforce_capability_granted`, `workforce_capability_revoked`, `workforce_scope_granted`, `workforce_scope_ended` |

Every success audit is fail closed in the same transaction. Controlled rejects
are fail closed when they are safe committed outcomes. Minimum correlation is
request ID, idempotency reference, canonical manifest/request hash,
opaque executor/maker and checker references, authority basis, affected
opaque identity/capability/scope, before/after state, result and optional
rollback/recovery reference.

Audit and public responses contain no raw Auth-user ID, e-mail, name, JWT,
secret, raw payload or unrelated principal/object detail.

## 12. Safe-Error Contract

| safe code | use |
|---|---|
| `bootstrap_not_authorized` | custody/change approval or technical route is not valid |
| `bootstrap_already_completed` | genesis state already exists |
| `bootstrap_manifest_mismatch` | canonical manifest/hash/precondition mismatch |
| `bootstrap_checker_required` | independent checker evidence absent |
| `bootstrap_self_check_forbidden` | executor and checker are the same |
| `auth_user_missing` | protected live Auth lookup has no matching account |
| `auth_user_not_verified` | protected live Auth account is not verified |
| `workforce_identity_already_exists` | binding or opaque workforce identity conflicts |
| `workforce_identity_missing` | authorized-context target is unavailable |
| `workforce_identity_inactive` | actor or target state forbids the action |
| `assignment_authority_missing` | maker/checker lacks the exact governance capability |
| `assignment_scope_denied` | exact target/scope is outside allowed governance contract |
| `self_grant_forbidden` | actor would grant authority to itself |
| `self_review_forbidden` | maker and checker are the same |
| `conflict_of_interest` | pilot conflict control blocks the action |
| `capability_not_allowed` | code/action is outside the closed vocabulary |
| `scope_not_allowed` | scope shape or value is outside the bounded contract |
| `governance_request_not_pending` | request is unavailable or no longer pending |
| `governance_review_missing` | exact-hash final review is absent |
| `governance_not_approved` | final review is not approve |
| `authorization_changed` | maker/checker/target authority changed before execute |
| `last_authority_protection` | change would remove the minimum governance pair |
| `idempotency_conflict` | same key/scope has another canonical hash |
| `concurrent_write_conflict` | a concurrent terminal outcome won |
| `invalid_input` | request fails closed validation |
| `internal_error` | unexpected failure; full rollback and private operational handling |

Public mapping never exposes SQL, constraints, tables, functions, JWT detail,
identities, other principals, secrets or out-of-scope existence.

## 13. Later Proof Contract

| layer | minimum cases |
|---|---|
| Static/runbook | no self-enrollment; no browser execute; no permanent bootstrap endpoint; no hardcoded identity; exact manifest schema; no secret/PII output; artifact hashes and custody approvals required |
| Genesis database/RPC | no Auth account; unverified Auth account; customer binding without workforce binding; duplicate workforce binding; no checker; executor equals checker; changed manifest; same-hash replay; payload conflict; partial bootstrap full rollback; no global authority; exact initial split capabilities; exact empty initial scopes |
| Structural database/RPC | self-grant; self-review; maker lacks assignment authority; checker lacks review authority; wrong target scope; capability grant/revoke/expiry; scope grant/end; identity activate/suspend/revoke; revoked principal denied; suspension during pending request; privilege escalation denied; last-authority protection |
| Operator script | environment binding, approved commit/hashes, protected input handling, dry-run, aggregate pre/post assertions, safe output, non-zero controlled failure and no raw identity/secret logs |
| Real concurrency | assignment-versus-revocation race; suspension-versus-execute race; two-connection review race; two-connection execute race; at most one terminal outcome; fixed lock order |
| Domain separation | customer-only bearer denied; dual binding remains separate; own-customer/case/location conflict blocked; anti-enumeration preserved |
| Audit/idempotency/rollback | genesis/governance event separation; request/hash/maker/checker/authority correlation; fail-closed audit; deterministic idempotency; unexpected-error rollback |
| Recovery | recovery dry-run from protected evidence; independent approval; last-authority-loss scenario; no emergency override; disputed bootstrap reconciliation |
| Disposable cleanup | exact cleanup under success/failure; zero proof databases; protected real counts and fingerprints unchanged |
| Real population guard | all seven real local WP3L tables remain empty until a separate real-population authorization |
| Remote execution | only after separate approval: remote preflight, migration parity, secret custody, functions/deploy state, dry-run, execution, post-count/audit evidence and rollback readiness |

Local proof, real local population and remote execution are distinct. A green
static or disposable proof grants none of the later gates.

## 14. Future Implementation Manifest

All paths, tables and RPC names below were collision-checked and free during
this audit. They are proposed and not approved; none was created.

Paths:

- `supabase/migrations/20260729100000_app_workforce_bootstrap_assignment_authority.sql`
- `scripts/ops/app-workforce-bootstrap.ts`
- `scripts/proofs/app-workforce-bootstrap-assignment-authority.proof.ts`
- `scripts/ops/app-workforce-governance.ts`

Tables:

- `public.app_workforce_governance_requests`
- `public.app_workforce_governance_reviews`

Purpose-specific RPCs:

- `public.app_workforce_genesis_bootstrap_v1`
- `public.app_workforce_identity_governance_prepare_v1`
- `public.app_workforce_identity_governance_review_v1`
- `public.app_workforce_identity_governance_execute_v1`
- `public.app_workforce_capability_governance_prepare_v1`
- `public.app_workforce_capability_governance_review_v1`
- `public.app_workforce_capability_governance_execute_v1`
- `public.app_workforce_scope_governance_prepare_v1`
- `public.app_workforce_scope_governance_review_v1`
- `public.app_workforce_scope_governance_execute_v1`

No collision was found. The optional `scripts/ops` directory does not
currently exist; creating it is future implementation work, not evidence of a
collision or authorization.

## 15. Exact Decisions

Every recommendation below is **NOT APPROVED**.

### Decision 01

- decision_id: WP3O-D01
- onderwerp: controlled pilot genesis entrypoint.
- current evidence: no workforce principal or bootstrap caller exists; service-role-only narrow RPC patterns are proven locally.
- current gap: the first workforce authority cannot approve its own creation.
- opties: A environment CLI/runbook; B permanent internal Edge endpoint; C direct SQL recovery.
- aanbevolen keuze: A, not approved.
- exacte technische consequentie: one single-use operator command invokes only `app_workforce_genesis_bootstrap_v1`; no browser or permanent public endpoint.
- auditimpact: separate fail-closed genesis event family and manifest correlation.
- securityimpact: temporary custody is bounded to one approved environment/change.
- authorityimpact: genesis custody creates only the minimal split pair and then ends.
- privacyimpact: protected Auth input; only opaque/hash references in logs.
- transaction/concurrencyimpact: one locked transaction and one terminal genesis result.
- proofimpact: static route, duplicate/replay, manifest and full rollback cases required.
- resterend risico: operator workstation and approval-evidence compromise.
- approval required: Daan plus separate implementation and remote execution approval.

### Decision 02

- decision_id: WP3O-D02
- onderwerp: designated executor and independent human checker.
- current evidence: no current structural principal can check genesis.
- current gap: custody actors and approval evidence are not approved.
- opties: one operator; executor plus independent checker; structural workforce checker.
- aanbevolen keuze: executor plus independent external checker, not approved.
- exacte technische consequentie: distinct opaque executor/checker refs and approved change ref are mandatory manifest inputs.
- auditimpact: both custody refs and decision evidence are correlated.
- securityimpact: self-check and shared custody fail closed.
- authorityimpact: checker confirms ceremony evidence but receives no implicit workforce authority.
- privacyimpact: no names or contact data in general logs.
- transaction/concurrencyimpact: checker-bound canonical hash must match at execution.
- proofimpact: missing checker, same actor and altered approval negatives.
- resterend risico: collusion or weak out-of-band identity assurance.
- approval required: named organizational custody policy and Daan approval.

### Decision 03

- decision_id: WP3O-D03
- onderwerp: independent identity binding.
- current evidence: verified Auth helper/customer bootstrap patterns exist; customer binding is separate.
- current gap: no workforce binding exists.
- opties: hardcoded IDs; metadata/e-mail inference; live protected Auth lookup with explicit binding.
- aanbevolen keuze: live protected lookup with explicit unique binding, not approved.
- exacte technische consequentie: the RPC locks/checks existing verified, non-deleted Auth accounts and inserts explicit workforce bindings atomically.
- auditimpact: opaque workforce refs and verification outcome only.
- securityimpact: no JWT claim, e-mail or customer record becomes authority.
- authorityimpact: binding enables identification only; assignments remain separate.
- privacyimpact: raw Auth IDs are excluded from public responses/general logs.
- transaction/concurrencyimpact: unique binding conflict rolls back the complete cohort.
- proofimpact: missing, unverified, duplicate and customer-only cases required.
- resterend risico: upstream Auth account takeover remains an authentication risk.
- approval required: Auth/custody design approval.

### Decision 04

- decision_id: WP3O-D04
- onderwerp: two-person genesis cohort.
- current evidence: root and append-only state tables exist and are empty.
- current gap: no safe partially completed genesis state is defined.
- opties: one identity; sequential pair; atomic two-identity/two-state cohort.
- aanbevolen keuze: atomic split pair, not approved.
- exacte technische consequentie: exactly two roots and two initial `active` events commit together or nothing commits.
- auditimpact: one genesis correlation records aggregate before/after.
- securityimpact: no lone omnipotent or half-created administrator.
- authorityimpact: structural governance starts only when distinct prepare/approve principals exist.
- privacyimpact: cohort evidence remains opaque.
- transaction/concurrencyimpact: genesis lock plus zero pre-count and exact post-count assertions.
- proofimpact: partial-failure and concurrent-first-bootstrap tests.
- resterend risico: both principals can become unavailable after genesis.
- approval required: cohort and lifecycle policy approval.

### Decision 05

- decision_id: WP3O-D05
- onderwerp: split governance capabilities.
- current evidence: six operational location codes are closed and grant no administration.
- current gap: no governance capability vocabulary exists.
- opties: all location rights; generic admin; six narrow governance prepare/approve codes.
- aanbevolen keuze: six narrow split codes, not approved.
- exacte technische consequentie: principal A receives only three prepare codes; principal B only three approve codes; neither receives location capabilities.
- auditimpact: each exact grant is recorded with genesis correlation.
- securityimpact: no wildcard, `admin` or silent privilege inheritance.
- authorityimpact: first-principal status confers nothing beyond explicit grants.
- privacyimpact: capability codes contain no identity data.
- transaction/concurrencyimpact: exact set equality is a genesis postcondition.
- proofimpact: extra/missing/wildcard capability negatives.
- resterend risico: global narrow governance codes still have a large governance blast radius.
- approval required: capability vocabulary approval.

### Decision 06

- decision_id: WP3O-D06
- onderwerp: genesis operational scope.
- current evidence: existing scopes are exact case/location operational assignments.
- current gap: no approved pilot targets exist.
- opties: global scope; guessed pilot scope; empty genesis operational scopes.
- aanbevolen keuze: empty genesis scopes, not approved.
- exacte technische consequentie: bootstrap inserts zero case/location scope events; later exact scopes use structural governance.
- auditimpact: manifest and post-count prove empty scope sets.
- securityimpact: genesis cannot operate on any case/location.
- authorityimpact: governance capability never implies operational scope.
- privacyimpact: no case/location references in genesis logs.
- transaction/concurrencyimpact: zero-scope assertion commits with genesis.
- proofimpact: global and non-empty scope rejection.
- resterend risico: later pilot scope selection still needs operational approval.
- approval required: scope policy and later pilot-target approval.

### Decision 07

- decision_id: WP3O-D07
- onderwerp: reproducible genesis intent.
- current evidence: canonical hashing and `app_idempotency_keys` patterns exist.
- current gap: no approved genesis manifest/version/scope exists.
- opties: mutable runbook input; reusable key; versioned canonical single-use manifest.
- aanbevolen keuze: versioned canonical single-use manifest, not approved.
- exacte technische consequentie: environment, artifacts, cohort, split grants, counts, custody and approval are hash-bound; replay is safe and changed payload conflicts.
- auditimpact: manifest hash/request/idempotency refs correlate every event.
- securityimpact: prevents silent input substitution and cross-environment replay.
- authorityimpact: the manifest records intent but is never authority without custody approval.
- privacyimpact: canonical stored/loggable form excludes raw protected Auth input.
- transaction/concurrencyimpact: one scoped idempotency lock serializes genesis.
- proofimpact: exact replay, payload conflict and mismatch tests.
- resterend risico: compromise before manifest approval.
- approval required: manifest schema and storage/custody approval.

### Decision 08

- decision_id: WP3O-D08
- onderwerp: reconstructable bootstrap evidence.
- current evidence: app audit supports bounded opaque actor/scope events.
- current gap: genesis events and fail-closed policy are not implemented.
- opties: operator log only; fail-open audit; transactional fail-closed package.
- aanbevolen keuze: transactional fail-closed package, not approved.
- exacte technische consequentie: genesis success cannot commit without aggregate state/grant evidence, hash and opaque custody correlation.
- auditimpact: genesis events remain separate from structural governance events.
- securityimpact: unexpected audit failure rolls back.
- authorityimpact: audit proves execution/custody evidence, not independent legal authority.
- privacyimpact: no e-mail/name/JWT/raw Auth ID/secret/raw payload.
- transaction/concurrencyimpact: audit shares the genesis transaction.
- proofimpact: correlation, redaction and audit-failure rollback cases.
- resterend risico: quality of external approval evidence.
- approval required: audit taxonomy and retention approval.

### Decision 09

- decision_id: WP3O-D09
- onderwerp: atomic failure and controlled restoration.
- current evidence: disposable rollback and immutable correction patterns exist; no emergency override is approved.
- current gap: last-authority and disputed-genesis recovery runbook is absent.
- opties: delete/redo; emergency admin bypass; append-only controlled recovery ceremony.
- aanbevolen keuze: atomic rollback before commit and append-only controlled recovery afterward, not approved.
- exacte technische consequentie: partial execution rolls back; committed disputes are suspended/revoked/corrected through reviewed events or a separately approved recovery ceremony.
- auditimpact: recovery references the original hash and never erases history.
- securityimpact: recovery cannot bypass manifest, independent approval or narrow RPC.
- authorityimpact: recovery is not emergency authorization.
- privacyimpact: recovery evidence remains opaque and minimized.
- transaction/concurrencyimpact: recovery revalidates current state under the same lock order.
- proofimpact: failure rollback and last-authority recovery dry-run.
- resterend risico: operational outage while external recovery approval is obtained.
- approval required: recovery owner, evidence location and activation policy.

### Decision 10

- decision_id: WP3O-D10
- onderwerp: normal workforce governance workflow.
- current evidence: append-only target tables and lock patterns exist; operational workflow tables are domain-closed.
- current gap: no governance workflow or RPC exists.
- opties: purpose-specific prepare/review/execute; reuse operation workflow; direct inserts.
- aanbevolen keuze: purpose-specific prepare/review/execute, not approved.
- exacte technische consequentie: add at most two governance tables and nine purpose-specific governance RPCs.
- auditimpact: immutable request/review/execution correlation.
- securityimpact: database-enforced distinct actors and execution revalidation.
- authorityimpact: governance is explicit and separate from location operations.
- privacyimpact: payloads use opaque target refs and bounded codes.
- transaction/concurrencyimpact: execute locks request, review, actors, authority and target before append.
- proofimpact: full negative, race, rollback and at-most-once matrix.
- resterend risico: governance RPC implementation complexity.
- approval required: physical schema/RPC package approval.

### Decision 11

- decision_id: WP3O-D11
- onderwerp: closed assignment authority.
- current evidence: capability event table has a closed six-code vocabulary.
- current gap: it cannot currently express governance authority.
- opties: generic RBAC; separate governance authority tables; extend closed vocabulary with six narrow codes.
- aanbevolen keuze: extend the closed vocabulary, not approved.
- exacte technische consequentie: add only identity/capability/scope prepare/approve codes; no wildcard or generic role.
- auditimpact: authority basis is one exact current grant.
- securityimpact: closed checks prevent arbitrary permission strings.
- authorityimpact: prepare and approve remain separate.
- privacyimpact: no new personal attributes.
- transaction/concurrencyimpact: capability state is locked/revalidated at review and execute.
- proofimpact: unknown code, wrong domain and revoked-authority negatives.
- resterend risico: later need for finer governance scope.
- approval required: exact vocabulary approval.

### Decision 12

- decision_id: WP3O-D12
- onderwerp: capability lifecycle governance.
- current evidence: capability events support grant/revoke and expiry.
- current gap: no actor is authorized to append them.
- opties: direct insert; maker-only; distinct maker/checker workflow.
- aanbevolen keuze: distinct workflow, not approved.
- exacte technische consequentie: exact target/code/action/validity request, independent exact-hash review and atomic append after revalidation.
- auditimpact: before/after effective capability and request/review refs.
- securityimpact: self-grant, self-review and privilege escalation denied.
- authorityimpact: maker prepares; checker approves; neither role alone executes arbitrary grants.
- privacyimpact: target represented by opaque workforce ref.
- transaction/concurrencyimpact: revocation/expiry wins under deterministic target/code locks.
- proofimpact: grant, expiry, revoke, races and last-authority cases.
- resterend risico: checker collusion.
- approval required: capability administration policy.

### Decision 13

- decision_id: WP3O-D13
- onderwerp: operational case/location scope lifecycle.
- current evidence: scope events have exact case/location/relation shapes and append-only end semantics.
- current gap: no assignment authority exists.
- opties: global scope; direct insert; exact reviewed scope workflow.
- aanbevolen keuze: exact reviewed scope workflow, not approved.
- exacte technische consequentie: request binds exact case, optional permitted location/relation and validity; execute revalidates target/capability/relation before append.
- auditimpact: opaque exact scope before/after and governance correlation.
- securityimpact: wildcard/global and wrong-relation scope fail closed.
- authorityimpact: a scope never grants a capability or representation.
- privacyimpact: public/log output hides out-of-scope existence.
- transaction/concurrencyimpact: scope end versus operation execute is serialized and revalidated.
- proofimpact: wrong scope, grant/end and race cases.
- resterend risico: pilot scope selection and connected-party conflicts remain operational decisions.
- approval required: scope-assignment policy and pilot targets.

### Decision 14

- decision_id: WP3O-D14
- onderwerp: workforce lifecycle administration.
- current evidence: active/suspended/revoked append-only states and execution-time checks exist.
- current gap: no authorized lifecycle management workflow exists.
- opties: direct state insert; maker-only; distinct reviewed identity governance.
- aanbevolen keuze: distinct reviewed identity governance, not approved.
- exacte technische consequentie: suspend/revoke requests require identity prepare/approve authority; execution locks target and invalidates pending action eligibility.
- auditimpact: reason/reference, before/after state and request/review correlation.
- securityimpact: revoked principals cannot govern or operate.
- authorityimpact: terminal revocation is explicit; no customer/Auth deletion inference.
- privacyimpact: reasons remain bounded and contain no unnecessary PII.
- transaction/concurrencyimpact: suspension/revocation wins safely against pending execution under fixed locks.
- proofimpact: suspended/revoked actor, pending request and race tests.
- resterend risico: malicious suspension can cause outage despite four-eyes.
- approval required: lifecycle reason, appeal and restoration policy.

### Decision 15

- decision_id: WP3O-D15
- onderwerp: cross-domain separation and pilot conflicts.
- current evidence: bindings can technically coexist and current resolvers are separate.
- current gap: connected-party legal/compliance conflict policy is not decided.
- opties: allow silently; block all dual binding; independent bindings plus fail-closed own-case pilot block.
- aanbevolen keuze: independent bindings with own-customer/case/location block, not approved.
- exacte technische consequentie: workforce resolution grants no customer right and vice versa; detectable self-treatment returns generic conflict; broader relations remain blocked pending policy.
- auditimpact: conflict outcome records no customer/party details.
- securityimpact: prevents cross-domain privilege leakage and anti-enumeration failure.
- authorityimpact: neither binding dominates or implies the other.
- privacyimpact: conflict checking minimizes and hides relationship data.
- transaction/concurrencyimpact: conflict is revalidated with target authority at execute.
- proofimpact: customer-only, dual-binding separation, own-case and anti-enumeration cases.
- resterend risico: indirect connected-party conflicts cannot be decided technically yet.
- approval required: compliance/governance conflict policy.

### Decision 16

- decision_id: WP3O-D16
- onderwerp: technical execution custody.
- current evidence: service clients require environment secrets and current scripts avoid browser exposure.
- current gap: approved operator workstation, secret source and rotation evidence are absent.
- opties: local pasted secret; permanent endpoint secret; controlled environment secret injection and bounded operator command.
- aanbevolen keuze: controlled environment injection, not approved.
- exacte technische consequentie: script requires explicit environment/project/change refs, validates commit/hashes, reads secrets without echo and calls only the fixed RPC.
- auditimpact: environment/change/operator refs, never secret values.
- securityimpact: no secret in argv, manifest, output, repository or browser.
- authorityimpact: key possession remains technical transport, not approval.
- privacyimpact: protected Auth inputs and secrets are never general-logged.
- transaction/concurrencyimpact: environment mismatch fails before database mutation.
- proofimpact: missing/wrong env, redaction, dry-run and secret-scan cases.
- resterend risico: workstation/runtime secret compromise.
- approval required: security/operator custody and rotation runbook.

### Decision 17

- decision_id: WP3O-D17
- onderwerp: later evidence gate.
- current evidence: repository has disposable DB, separate-process race and protected equality patterns.
- current gap: no bootstrap/governance implementation or proof exists.
- opties: source inspection only; happy-path local test; layered proof contract.
- aanbevolen keuze: layered proof contract, not approved.
- exacte technische consequentie: one future proof covers static/runbook, RPC, operator, real races, rollback, recovery and protected cleanup with safe aggregate output.
- auditimpact: verifies exact fail-closed event correlation.
- securityimpact: proves ACL, no browser route, no inference, no secret/PII leak and revocation.
- authorityimpact: proves distinct actors, exact authority and last-authority protection.
- privacyimpact: fixtures/outputs use generated opaque refs and counts only.
- transaction/concurrencyimpact: genuine independent connections prove at-most-once and revocation/suspension ordering.
- proofimpact: every case in section 13 is mandatory.
- resterend risico: local proof cannot establish remote custody or production behavior.
- approval required: proof implementation and any destructive disposable-run approval.

### Decision 18

- decision_id: WP3O-D18
- onderwerp: execution sequencing.
- current evidence: WP3N is local-only and all real WP3L tables remain empty.
- current gap: no implementation, population, remote or operations acceptance exists.
- opties: combined rollout; proof-then-auto-populate; five separately approved gates.
- aanbevolen keuze: separate gates, not approved.
- exacte technische consequentie: implementation/static proof, disposable/local proof, real population, remote apply/deploy, operations UI/cutover each require explicit evidence and approval.
- auditimpact: each gate has its own manifest/change/correlation evidence.
- securityimpact: no local green proof silently activates remote authority.
- authorityimpact: deploy authority, genesis custody and structural workforce authority remain separate.
- privacyimpact: real population/privacy review occurs only at its own gate.
- transaction/concurrencyimpact: each environment repeats preflight and rollback/recovery checks.
- proofimpact: remote execution proof exists only after separate remote approval.
- resterend risico: operational readiness and recovery ownership remain open.
- approval required: explicit approval at every gate.

## 16. Remaining Blockers And Gate State

- The complete decision package remains unapproved.
- Workforce bootstrap remains `NOT IMPLEMENTED`.
- Workforce population remains `NOT IMPLEMENTED`.
- Assignment and revocation authority remain `NOT IMPLEMENTED`.
- The two governance tables, capability extension, ten RPCs, operator scripts
  and proof remain proposed only.
- Compliance/governance must decide connected-party conflict policy.
- Security/operations must approve operator, secret, environment, recovery
  evidence and last-authority custody.
- Real pilot identities, cases, locations and assignments are not selected or
  authorized.
- Operations UI, remote apply, deploy, production and cutover remain open and
  separately gated.
- WP3N remains `CURRENT PROVEN — LOCAL ONLY`.

No source, schema, migration, proof, RPC, Edge Function, runtime helper,
frontend, CSS, package, configuration, database, staging, commit, push,
deploy or remote state is changed by this readiness record.

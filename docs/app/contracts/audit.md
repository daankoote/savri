# App Audit Contract

Status: CURRENT audit doctrine for the new `/app` backend.

## Doctrine

Frontend may assist; backend decides.

Audit-relevant and fraud-relevant steps must be server-checkable and audit-logged when the function runtime is reached.

Customer timeline is a curated projection. Raw audit rows are internal and must not be shown directly to customers.

## Consolidated Legacy Principles

The following principles are retained from legacy material only as app doctrine. Old endpoint names, table names, session models, event names, and dossier states are not retained as current truth.

- Audit-first: every fraud-relevant or audit-relevant write must be reconstructable from server-side evidence.
- Historical truth must not be overwritten. Corrections and replacements add history, versions, or explicit transitions.
- Confirmed upload is not automatically accepted evidence.
- Derived analysis, parser output, OCR output, and customer-facing projections must not mutate core truth unless a future app contract explicitly defines a reviewed write path.
- Writes that can be retried must use scoped idempotency where current code proves it or where a new target contract requires it.
- Request and actor traceability are required for meaningful app writes.
- RLS and minimum privileges remain mandatory boundaries; service-role writes stay server-side.
- Retention and expiry rules must be policy decisions. Do not import arbitrary legacy TTLs as app truth.
- No hidden dependencies: a claim that depends on a function, RPC, storage policy, role, secret, bucket, or migration must identify that dependency or remain UNKNOWN.

## Current App Audit Tables

- `app_intake_audit_events`: pre-customer or intake-level events.
- `app_audit_events`: customer/dossier/document scoped app events.
- `app_idempotency_keys`: scoped idempotency locks and stored responses.
- `app_dossier_document_files`: server-issued file/upload-intent lifecycle.
- `app_dossier_document_versions`: immutable confirmed evidence history.

## Current Proven Event Families

Current locally proven app flows include:

- signup submit accepted/rejected audit events
- document upload URL issued/rejected events
- document upload confirm accepted/rejected events
- app idempotency replay and conflict behavior
- document file/version replacement behavior
- customer current-document withdrawal audit
- immutable file/version evidence retention after withdrawal

Exact runtime event names live in the current endpoint and RPC code. This document defines doctrine and table ownership, not a substitute for code inspection.

## Required Fields And Metadata

Audit events should preserve enough metadata to reconstruct:

- who acted
- when
- authenticated/session context
- request ID
- idempotency key when relevant
- submitted payload hash where relevant
- server-side validation decision
- evidence/hash/version used
- accepted/rejected state

Do not store raw IP or raw user agent by default. Store hashed request metadata where supported.

## Future / Draft Event Families

Future app work must define app-specific events for:

- auth bootstrap/login/recovery
- intake finalization / `Start dossier`
- legal acceptance during public intake
- verification-link consumption
- pre-auth intake promotion
- immutable initial intake/submission snapshot creation
- quarantine evidence promotion
- targeted section unlock
- targeted correction submission / `Correcties indienen`
- promotion reject/failure
- customer dashboard reads if audit-required
- customer request/response
- support messages
- kWh submission/readout
- inboeking lifecycle
- result/value realization
- fee calculation
- retention/minimization

Do not copy legacy `dossier_*` event names as CURRENT app truth without adaptation.

## Target Intake Promotion Audit Boundary

Status: TARGET / NOT IMPLEMENTED. Detailed contract: `docs/app/contracts/intake-verification-promotion.md`.

Audit-required target events include:

- `Start dossier` / intake finalization;
- accepted legal versions;
- verification-link consumption;
- atomic promotion;
- customer/dossier creation from promotion;
- initial immutable intake/submission snapshot;
- document/evidence promotion from quarantine;
- targeted unlock;
- replacement evidence;
- `Correcties indienen`;
- ENVAL lifecycle changes.

Not every browser-side action is an immutable compliance revision. These are not immutable audit revisions by default:

- local client validation attempts;
- unsubmitted public form edits;
- ordinary field edits before the customer clicks `Correcties indienen`.

The target flow must preserve enough server-side evidence to reconstruct promotion and correction decisions without exposing raw audit rows, storage paths, raw parser text, raw hashes, or internal payloads to customers.

## Document Withdrawal Boundary

Customer withdrawal of a current document is a product lifecycle action, not proof cleanup.

Current locally proven behavior:

- withdrawal is audited;
- immutable file/version rows remain;
- storage is not hard-deleted immediately;
- the current slot pointer may be cleared atomically;
- the customer-facing slot returns to expected/missing state;
- locked/finalized dossiers reject withdrawal safely.

Proof cleanup of disposable local fixtures is separate and must not be described as normal product deletion.

## WP3L-B Workforce Authorization Audit Boundary

CURRENT PROVEN — LOCAL ONLY for the bounded empty WP3L-B foundation and its
local proof; authorized callers and WP3J execution remain not implemented.

Implementation commit `6485dad9a1cc481efc3f17095f90df72a219b315`
additively extends `app_audit_events_scope_type_chk` with exactly:

- `workforce_identity`
- `workforce_authorization`
- `location_operation_request`

The seven workforce/case-location/scope/request/review tables store bounded
opaque actor, decision, request, idempotency and payload-hash correlation.
They store no raw operation payload, e-mail, name, title, phone, address or
JWT.

The migration and proof write no real local audit rows. Protected
`app_audit_events` count is `753` before and after. WP3L-B Q01-Q48, fresh
apply and real review/execution concurrency are registered in
`operations/wp3l-workforce-authorization-foundation-local-proof.md`.

This does not implement bootstrap, population, assignment authority,
operational callers, automatic WP3J execution, remote audit parity,
production export or a retention schedule.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-SIGNATURE-CORE-09A Audit Boundary

CURRENT PROVEN — LOCAL FRONTEND CONTRACT/PRESENTATION ONLY.

The 09A signing intent, evidence-envelope type, legal registry and mandate model
create no audit event or evidence. Typed name, role, intent checkbox, selected
calendar year and legal-action state are browser-local and untrusted. The
evidence envelope is validation-only: no challenge ID, verified timestamp,
channel reference, snapshot hash, legal hash or audit reference is generated.

`review_required` canonical facts remain explicit risk markers. Business/VvE
authority status is `required_not_completed`; neither parser representation
text, signer role, Auth context nor customer ownership becomes authority proof.

09B must atomically bind the server-canonical snapshot/hash, exact CURRENT legal
and mandate content hashes, server issue timestamp, typed signer input,
verified OTP challenge/channel, method and intent versions, mandate year scope,
authority-review reference where applicable, idempotency and actor/request audit
metadata. Until that exists there is no signed mandate, successful signing
event, dossier start or audit evidence.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-DOCUMENT-FIRST-REVIEW-02 Signing Record Target

The disabled signing surface is not an audit event. A future working sign
action must atomically bind an immutable final snapshot and hash to exact
legal-text and mandate-text versions, signer full name and role, verified
account/e-mail, one-time verification or reauthentication, explicit sign
action, server timestamp, request/actor/audit metadata and, for business or VvE,
authority evidence. Until that record exists, signing and successful submit
remain closed.

Frontend `confirmedAt` is interaction state only, not a trusted signed timestamp
or audit authority.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-PARTY-NAME-CROSSCHECK-03 Frontend-Only Audit Boundary

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF ONLY.

The shared expected-party resolver, deterministic comparator, labels and focus
targets create no audit row and change no audit schema, event vocabulary,
payload, RPC or Edge caller. Energy and charger/MID observations remain
browser-local and do not enter audit metadata.

The dedicated proof emits only numbered PASS lines and
`signup-party-name-crosscheck-proof-ok`; it logs no document value, full name,
address, EAN or other PII. Exact and initial-limited comparison statuses are
assistive UI output only and cannot claim identity, representation authority,
aangeslotene/ownership, accepted evidence, MID acceptance or verifier approval.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-CONNECTION-01B Customer-Confirmed Connection Audit Boundary

CURRENT PROVEN — LOCAL ONLY.

`app_submit_signup_v5` records fail-closed
`signup_connection_declaration_recorded` events in the same transaction as v4,
the immutable confirmed source and idempotency success. Deferred locations and
unconfirmed parser candidates create no source and no connection-declaration
event. Source or audit failure rolls the entire signup attempt back.

Each event contains request/idempotency correlation, opaque customer,
dossier, dossier-location and connection-source references, created/resolved
outcome, bounded capture method, customer-confirmed flag, absent
network-operator/period flags and recording time. It excludes raw EAN, address,
netbeheerder text, name, e-mail, JWT and request payload. The typed fact remains
only in the RLS-protected source table.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-PARTY-01A Authenticated Party Activation Audit

CURRENT PROVEN — LOCAL ONLY.

`app_bootstrap_customer_auth_v3` records
`authenticated_customer_party_root_activated` fail closed in the same
transaction as Auth v2, root/relationship activation and idempotency
completion. The bounded event uses customer scope and records request,
opaque customer/party references, party kind, created/resolved outcome,
idempotency correlation, environment and timestamp.

No raw payload, JWT, e-mail/name/address, profile fact, identifier, case role,
authority or mandate enters this event. Replay creates no second activation
audit. Party or audit failure rolls back the complete bootstrap attempt.
Q11, Q16 and Q18 prove replay, rollback and protected cleanup locally.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
## PILOT-PROFILE-02 Audit Boundary

CURRENT PROVEN — LOCAL ONLY.

V4 records one fail-closed
`declared_profile_asserted_service_recipient_linked` event after complete
profile and claim state. It correlates request/idempotency, opaque customer,
party, canonical declaration source and profile references, created/resolved
outcomes, claim counts, environment and time.

Audit contains no name, e-mail, KvK, raw declaration, JWT, address,
representation or mandate fact. Audit failure rolls back Auth binding, newly
activated cases/party, profile, claims and success idempotency.

The source timestamp remains exact `timestamptz`; profile `valid_from` is the
Europe/Amsterdam business date. Both are auditable without conflating their
temporal granularity or claiming legal verification.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## WP3O Proposed Genesis And Workforce Governance Audit Boundary

Status: DRAFT / DECISION REQUIRED / NOT IMPLEMENTED.

Genesis evidence and structural governance evidence remain different event
families. A proposed one-time genesis transaction correlates canonical
manifest hash, request/idempotency reference, opaque executor/checker custody,
artifact/environment references, aggregate pre/post state and controlled
result. Later governance correlates immutable request/review/execution,
opaque maker/checker, exact authority basis, affected identity/capability/scope
and before/after state.

Success audit is fail closed in the same transaction. Safe controlled rejects
are auditable without exposing existence. `insertAppAuditFailOpen()` is not
reusable. General logs/public responses contain no raw Auth-user ID, e-mail,
name, JWT, secret, raw payload or unrelated principal/object detail.
Rollback/recovery references preserve history and do not authorize an
emergency override.

The event vocabulary, migration, RPCs, scripts and proof remain proposed and
unapproved. Bootstrap, population, assignment/revocation authority, remote
apply and production audit/export remain not implemented.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## WP3M Proposed Caller And Execution Audit Correlation

Status: DRAFT / NOT IMPLEMENTED / DECISION REQUIRED.

WP3M recommends, without approval, distinct but transactionally correlated
authorization/workflow audit and WP3J business audit. Minimum opaque
correlation is request ID, compile-time caller/action, workforce actor and
identity reference, exact capability, case/location, operation request/review,
WP3J operation/result, idempotency reference, authorization/business outcome
and applicable timestamps.

Critical authorization, request/review and execution outcomes are fail closed
inside the bridge transaction. `insertAppAuditFailOpen()` is not reusable for
this material boundary. No e-mail, name, title, JWT, raw payload, raw evidence,
SQL/schema detail or out-of-scope existence enters audit or public responses.

Root/relation creation, observation writes and material WP3J execution may not
commit separately from their required authorization audit/idempotency
correlation. The existing WP3J business events remain distinct and are not
relabelled as workforce authorization or regulatory acceptance.

Evidence and the exact proposed field/error/proof contract are in
`operations/wp3m-location-callers-execution-bridge-readiness.md`. No audit
schema, row, event implementation, caller or bridge was added.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## WP3N Caller And Execution Audit Correlation

CURRENT PROVEN — LOCAL ONLY for the bounded WP3N caller/bridge transaction.
The implementation preserves distinct correlated authorization/workflow and
WP3J business audit. Successful material operations and controlled rejects
complete audit and idempotency fail closed in the same transaction as their
required root/relation, observation, request/review or WP3J/WP3L execution
state.

The proven allowlist uses compile-time caller/action, opaque workforce actor,
exact capability, case/location, operation request/review, WP3J result,
request/idempotency correlation and bounded outcomes. It excludes e-mail,
name, title, JWT, raw payload/evidence, SQL/schema detail and sensitive
existence information. `WP3N-Q57` and `WP3N-Q58` cover correlation/no-PII and
safe errors; all Q01-Q64 pass.

No real local audit row was added: protected `app_audit_events` remained
`753` before and after, and all seven real WP3L tables remained empty.
Bootstrap, population, assignment-authority audit, UI audit, remote parity and
production export remain not implemented.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
## PILOT-SIGNUP-ATOMIC-01 Atomic Signup Audit Boundary

CURRENT PROVEN — LOCAL ONLY.

`app_submit_signup_v4` writes the current customer/dossier/signup event family,
one minimized `signup_party_declaration_recorded` event and
`signup_submit_write_accepted` fail closed in the same transaction as all
business rows and idempotency completion. Audit failure rolls back the full
attempt; replay then safely starts again.

Declaration audit correlates request, opaque customer/dossier/source
references, declaration kind/account type, payload hash, environment and
recording time. Names, e-mail, KvK, address, JWT and raw request payload are
excluded. The declaration facts themselves remain only in the protected
declaration table.

Q15-Q20 prove rollback after every material transaction stage, including
audit and pre-completion failure. This is local evidence only.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-DOCUMENT-CROSSCHECK-02 Frontend-Only Audit Boundary

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF ONLY.

The address-normalization, exclusive EAN source-mode and shared energy/charger
document-check batch creates no audit row and changes no audit schema, event
vocabulary, RPC or Edge caller. Parser observations remain browser-local and do
not enter the signup payload or audit metadata. Manual confirmation keeps the
existing bounded capture method; the server-side audit contract is unchanged.

Proof output contains only PASS markers and the final marker. It emits no local
fixture path/value, raw or full EAN, name, address, parser context, technical
confidence or document content. Charger observations do not constitute accepted
MID evidence or verified charger identity, and no automatic overwrite creates a
new declared or evaluated fact.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-DOCUMENT-DECISION-03 Frontend-Only Audit Boundary

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF ONLY.

The semantic decision policy, customer confirmation and correction metadata
remain browser-local and excluded from the signup mapper. This batch creates
no audit row, vocabulary, schema, RPC, Edge call, Storage write or remote
effect. Proof output emits only generic pass/final markers and no extracted
name, address, EAN, MID, serial or document content.

`review_required` is an internal routing marker, not an acceptance outcome.
Customer intent may permit the local preparation summary to continue while the
marker persists; it does not record accepted evidence, verified identity,
authority, location, connection or charger truth. Material `blocked`, missing
and ambiguous results remain fail closed.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-GENERIC-DOCUMENT-FACTS-05 Frontend-Only Audit Boundary

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF ONLY.

The unified observation envelope, generic projector and document cache remain
browser-local observed/derived state. Upload source binding is not a document
classification or evidence decision. No compatibility result or document-type
blocker exists in active customer state. Parser-04 compatibility behavior is
historical and superseded.

This batch creates no audit event, schema, RPC, Edge call, Storage write,
backend payload or remote effect. Customer confirmations and decision state
remain separate and are not written by this batch.

The generic-facts proof emits only its exact final marker. It prints no fixture
path, document value, name, address, full EAN, MID, serial, raw PDF context or
PII. Missing facts and local review/block decisions do not constitute evidence
rejection or acceptance by an authorized decision owner.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-ORGANIZATION-DOCUMENT-FIRST-07 Frontend-Only Audit Boundary

The account-bound KvK document, generic organization observations, customer
confirmations and corrections remain browser-local. They create no audit row,
schema, vocabulary, RPC, Edge call, Storage write, backend payload or remote
effect. Account-type replacement invalidates this local state.

The Org-07 proof is privacy-safe: it emits only failure reasons or the exact
final marker and never prints fixture paths or extracted organization, address,
register, director or representation values. Its local Dutch real-fixture gate
currently fails closed, so this batch is not recorded as fully proven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-SIGNING-KISS-09A1 Audit Boundary

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF ONLY.

The summary confirmation, three projected legal actions, mandate year and
signer declaration remain browser-local intent. They create no audit row,
accepted evidence, verified identity, authority outcome, immutable snapshot,
hash, timestamp, RPC, Edge call, Storage write or remote effect.

The legal bundle preserves document type, version, language and hash status as
render metadata, while customer preview/download omits technical status. The
organization declaration does not change `required_not_completed` authority
review. The 09A1 proof emits only its exact final marker and no customer facts,
document content or local paths.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

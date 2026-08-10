# Intake Verification Promotion Contract

Status: MIXED — SIGNED INTAKE CURRENT PROVEN LOCALLY; ATOMIC CASE PROMOTION TARGET FOR 09C1 / NOT IMPLEMENTED.

This is the canonical post-signing convergence contract. It replaces the stale target in which a signed submission waited for a separate one-time email-verification link before promotion. It does not change runtime, schema, production or regulatory status by documentation alone.

## 1. Source And Scope

Source order:

1. the official 2026-07-09 NEa `Toetsingskader verificatieprotocol: Inboekverificatie elektriciteit`;
2. normalized requirements and traceability;
3. CURRENT code, migrations and green proofs;
4. approved TARGET case, party, location, connection and evidence boundaries.

In scope:

- CURRENT pre-auth collecting intake and private quarantine;
- CURRENT `typed_name_otp_v1` signing, email-control proof and immutable finalization;
- exact meaning and replacement of `pending_verification`;
- one server-only, atomic and idempotent promotion into `app_cases`-owned durable state;
- customer/party/account-type, authority, evidence, Auth/dashboard and external-verifier boundaries;
- exact 09C1 implementation and proof scope.

Out of scope:

- production legal/OTP enablement;
- external verifier work or a verification statement;
- accepted EAN/`aangeslotene`, charger/MID conformity, eligibility, booking, REV, result, fee or settlement truth;
- representation-authority schema, which remains `NOT SCHEMA READY`;
- remote migration, deployment or production acceptance.

## 2. CURRENT Signed-Intake Flow Matrix

Only current source/schema/proof establishes this matrix.

| step | frontend action | server endpoint / RPC | database truth | capability / auth | audit evidence | resulting state |
|---|---|---|---|---|---|---|
| 1. intake start | first required document upload causes the signup upload client to ensure an intake session | `api-app-signup-intake-start` / `app_signup_quarantine_start_v1` | one `app_signup_intakes` row and one hashed `intake_manage` capability | raw management capability exists only in same-tab `sessionStorage`; email is not authority | `signup_intake_collecting_started`; request/idempotency and hashed request metadata | intake `collecting` |
| 2. quarantine upload issue | customer selects a required PDF | `api-app-signup-upload-url` / `app_signup_quarantine_issue_v1` | immutable intake-file revision with server-chosen private bucket/path plus one hashed file-scoped upload capability | valid unconsumed `intake_manage`; returned upload capability is narrow and one-file scoped | `signup_quarantine_upload_issued` | file `upload_issued` |
| 3. upload confirm | browser uploads to the signed private URL and asks the server to confirm | `api-app-signup-upload-confirm` / `app_signup_quarantine_confirm_v1` | server downloads bytes, validates MIME/size/hash, consumes upload capability and records `confirmed_quarantine` or rejection | file-scoped upload capability; no dossier or evidence authority | `signup_quarantine_upload_confirmed` or `signup_quarantine_upload_rejected` | confirmed quarantine transport only; not accepted evidence |
| 4. signing challenge | customer requests the six-digit code after Step 3 readiness | `api-app-signup-signing-challenge` / `app_signup_signing_challenge_issue_v1` | one delivered, expiring `typed_name_otp_v1` challenge; older active challenge is replaced | valid `intake_manage`; server binds challenge to a hashed normalized-email channel | `signup_signing_challenge_issued` plus delivery audit | intake remains `collecting`; no signature yet |
| 5. OTP/email-control proof | customer submits the delivered OTP together with typed signer input | no independent verification endpoint; proof is evaluated inside finalize | delivered challenge, channel hash, OTP verifier, expiry and attempts are checked atomically | OTP plus the matching intake/challenge/capability proves control of the used email channel for this signing act | failed attempts stay bounded; successful proof becomes part of signature evidence | no standalone account, Auth session, authority or external-verification state |
| 6. signing finalization | customer confirms the canonical facts, legal actions, one mandate year and typed signature | `api-app-signup-signing-finalize` / `app_signup_signing_finalize_v1` | exactly one immutable signing snapshot, three legal acceptances, one mandate, one signature-evidence row; challenge and management capability consumed; `finalized_at` set | capability ownership plus delivered OTP challenge; service-role-only RPC; idempotent | exactly one `signup_signing_finalized` event | CURRENT database status `pending_verification`; all intake/file mutation routes reject the finalized intake |
| 7. finalized refresh/status | same-tab page bootstraps through the existing intake session; receipt is presentation cache only | `api-app-signup-signing-finalize` with `operation=status` / `app_signup_signing_status_v1` | server checks finalized intake, consumed challenge/capability, one snapshot, three acceptances, one mandate, one signature evidence and one audit event | existing hashed `intake_manage` proves scoped status ownership only; safe reference alone is not a credential | reads existing finalization audit; no mutation event | server returns `finalized`, `locked`, safe reference and `finalized_at`; no new intake/upload/signing call |
| 8. waiting after signing | customer sees `Je dossier is ondertekend en ingediend.` and the safe reference | no promotion endpoint exists CURRENT | signed intake remains separate from customer, identity, case and dossier records | receipt grants no rights; consumed capability cannot authorize promotion | immutable signing/audit set only | technically waiting for ENVAL internal durable promotion/review; no NEa verification has started or completed |

CURRENT proof also establishes that successful signing creates no `app_customers`, `app_customer_identities`, `app_customer_dossiers` or `app_cases` row.

## 3. Superseded Separate Email-Verification Trigger

The former target was:

```text
signing/submission -> separate one-time email-verification link -> promotion
```

That trigger is `SUPERSEDED`.

`typed_name_otp_v1` already binds a delivered one-time challenge to the normalized submitted email and consumes it atomically with the typed signing act. No hard legal, TKV, product or current technical requirement requires a second email-control ceremony before durable promotion.

The consequences are exact:

- successful `typed_name_otp_v1` finalization is sufficient email-control input for promotion;
- promotion is server-driven and never authorized by a second browser link;
- a later Supabase Auth access/verification email is an account-login step, not a promotion trigger and not a second signing/email-control proof;
- signing email control is not a Supabase Auth session and grants no dashboard access by itself.

Historical changelog evidence is retained. Active target text must not reintroduce the superseded link.

## 4. Three Verification Concepts

### 4.1 Signing / Email Control

`typed_name_otp_v1` proves the bounded combination of typed signing intent and control of the email channel used in that signing flow. It does not prove:

- material eligibility;
- legal identity beyond the recorded declaration/evidence context;
- Zakelijk/VvE representation or signing authority;
- `aangeslotene`, accepted EAN, ownership or location truth;
- evidence acceptance, MID conformity or booking readiness;
- NEa inboekverificatie.

### 4.2 ENVAL Internal Review

ENVAL internal review is an operational assessment of a promoted signed case: completeness, evidence provenance, authority follow-up, declared EAN/location, MID and other bounded controls. It may create `action_needed`, rejection or readiness for a later process phase. It is never an external verification statement and may not use customer copy that implies verifier or NEa approval.

### 4.3 External Inboekverificatie

External inboekverificatie is performed by the inboekverificateur under the approved protocol. It includes professional risk analysis, sampling, location visits, mandate checks, quantity/administration controls, findings, the verification dossier and any verification statement. Verification-related information must remain reconstructable for at least five years after the end of the verification calendar year under TKV 3.0.5. ENVAL onboarding, promotion or internal-review status never silently claims these external acts or outcomes.

## 5. `pending_verification` Meaning And Replacement

CURRENT exact meaning:

| context | CURRENT meaning |
|---|---|
| API-internal | successful signing finalization response and status-recovery discriminator |
| database lifecycle | finalized/locked intake with consumed signing challenge/capability and complete immutable signing record set |
| customer-facing | not shown as raw copy; projected as `Je dossier is ondertekend en ingediend.` |
| external/verifier | none; it does not mean external verification is pending, started or assigned |

Because the name conflicts with the formal TKV meaning of verification, 09C1 must replace it with the exact internal value `submitted_for_review`.

The rename is semantic and explicit, not silent:

- `submitted_for_review` means signed, server-finalized, mutation-locked and awaiting ENVAL's internal promotion/review path;
- customer copy remains `Ondertekend en ingediend` followed by `In behandeling` after promotion;
- external-verifier states must live only in the later verifier bounded context.

09C1 callers/schema to migrate together:

- `app_signup_intakes.status` check and transition guard in a forward migration based on `20260716100000_app_signup_intake_quarantine_schema.sql`;
- finalize/status functions and audit `next_status` derived from `20260806160000_app_signup_signing_runtime.sql`;
- `signupSigningClient.ts` response types and validators;
- `signupSubmissionReceiptStore.ts` receipt status and a new receipt schema version so stale v1 values fail closed;
- `SignupPageShell.tsx` hydration/finalization type flow;
- signing-runtime, signed-receipt and quarantine status proofs;
- active contracts, system map, roadmap and TODO references.

No compatibility layer may interpret either name as external verification. A forward migration may temporarily accept/read the old stored value only to transform it transactionally; all new writes use `submitted_for_review`.

## 6. TARGET Atomic Promotion Boundary

TARGET flow:

```text
finalized signed intake (`submitted_for_review`)
-> server-only durable-file preparation
-> one `app_promote_signed_signup_v1` database transaction
-> `app_cases`-owned durable case + internal review state
-> intake `promoted`
```

The Edge/worker entry point is `api-app-signup-promote`. It is an internal server caller only. The browser, receipt, safe reference, signing OTP and consumed management capability cannot call or authorize promotion.

Promotion sequence:

1. Resolve the intake by internal ID and take a deterministic intake advisory lock.
2. Require `submitted_for_review`, `finalized_at`, consumed challenge/capability and the exact one/three/one/one signing-record cardinalities.
3. Recompute or compare the signed snapshot, legal, mandate and confirmed-file hashes; reject any inconsistency.
4. Before the database transaction, copy confirmed quarantine objects server-side to deterministic private durable object keys and verify size/MIME/SHA-256. These prepared objects have no customer-visible metadata or authorization.
5. Call `app_promote_signed_signup_v1` with only the server-verified prepared-file manifest, stable request/idempotency data and internal intake reference.
6. In one database transaction, create or safely reuse the customer/identity/party roots, profiles, case, asserted case roles, locations/observations/relations, durable evidence file/version metadata, promotion relation, initial internal lifecycle event and audit rows.
7. Set the intake through transaction-local `promoting` to terminal `promoted` and complete idempotency in the same commit.
8. Only after commit may a separate outbox action send Supabase Auth/dashboard access. Mail failure never rolls back or duplicates the promoted case.

If durable-object preparation succeeds but the database transaction fails, the intake stays `submitted_for_review`; the inaccessible deterministic object is an orphan eligible for controlled cleanup. No partial case, party, mandate link, evidence version or customer projection is visible. Retry uses the same object keys and same intake promotion identity.

## 7. Idempotency, Matching And Rollback

Required invariants:

- exactly one terminal promotion relation per `intake_id`;
- exactly one case source mapping for `source_class=signed_signup_intake` plus intake UUID;
- same intake and same canonical payload returns the existing customer/case/evidence mapping;
- same idempotency key with different payload returns conflict;
- concurrency permits at most one committed promotion;
- no second customer, identity, party, case, mandate relation or evidence version on retry;
- all database writes and audit/idempotency completion are one transaction;
- rollback is transaction failure, never deletion of signing or historical truth.

Customer reuse uses the unique unambiguous active normalized-email identity under an advisory lock. Zero matches creates an unbound `app_customer_identity`; one safe match reuses its `app_customer`; ambiguity or conflicting bound identity fails closed. Email matching is account routing, not legal-party identity.

Party reuse is narrower:

- reuse the current unambiguous `account_owner` party already linked to that customer when its kind matches;
- never merge people by name/email or organizations by unreviewed name/parser output;
- an externally verified stable identifier may support later merge/reuse only under its own approved evidence/decision contract;
- the promotion relation is the retry authority for rows created from the same intake.

## 8. Record-By-Record Promotion Map

| responsibility | TARGET promotion action | boundary |
|---|---|---|
| signed intake | update `app_signup_intakes` from `submitted_for_review` to terminal `promoted` in the promotion transaction | submitted payload, signing rows and finalized file metadata remain immutable |
| promotion provenance | create one immutable `app_signup_promotions` row linking intake, customer, identity, primary party, case, signing snapshot, mandate, signature evidence, promoted time and request/idempotency refs | contains references/provenance, no duplicated canonical snapshot or generic domain truth |
| customer account | safely reuse or create `app_customers` | account shell, not legal identity or authority |
| login identity | safely reuse or create one active `app_customer_identities` row with normalized email and `auth_user_id=null` until Supabase Auth bootstrap | signing email control may be recorded as channel evidence; it is not an Auth session |
| party root/profile | reuse safe current customer party or create `app_parties`; create immutable declared person/organization profile version where required | profile facts are signed declarations, not verified register/identity truth |
| customer-party relationship | create/reuse current `account_owner`; add `contact` only for the actual signed contact when applicable | service/account relationship is not representation authority |
| case | create one `app_cases` root directly from `signed_signup_intake` | do not create a parallel `app_customer_dossiers` row; `app_cases` is owner |
| case participation | insert `app_case_party_roles` as `asserted` with exact profile-version pinning | promotion never writes `case_confirmed`; role is not authority or mandate |
| internal lifecycle | create initial append-only `app_case_lifecycle_events` value `submitted_for_review` | customer projection maps this to `In behandeling`; no verifier semantics |
| location | create/reuse only a safely mapped `app_locations` root; record signed address as `customer_declared` observation and link through `app_case_location_relations` | do not auto-create accepted `app_location_versions`; address/parser output is not location acceptance |
| EAN/connection | retain signed declared EAN and scope in the immutable snapshot/mandate and a case-scoped declaration source when the 09C1 schema defines it | do not write old `app_connections`/ownership tables or create accepted allocation-point/`aangeslotene` truth |
| charger/charge point/MID | retain exact signed declared/observed facts and provenance for review | target asset/MID foundation is not DDL-ready; no accepted charger, charge-point or conformity truth is created |
| mandate/signing | link existing immutable `app_signup_mandates`, snapshot, acceptances and signature evidence through promotion provenance | never copy/rewrite the canonical content; Zakelijk/VvE authority remains incomplete |
| documents | server prepares durable private bytes and creates case-owned `app_evidence_files` and immutable `app_evidence_versions` from exact confirmed quarantine revisions | no browser promotion; `confirmed_quarantine` is not `accepted`; no `app_evidence_decisions` row is created automatically |
| quarantine source | retain immutable intake-file metadata and its source-to-durable mapping | no finalized-file mutation is required; cleanup follows separate retention and successful durable mapping |
| audit/idempotency | write promotion success/failure boundary, created/reused outcomes and exact source/version refs | no raw OTP, capability, document contents or customer-facing internal payload |

The existing dossier-owned charger/document tables and `app_connection_declaration_sources` may provide predicates and proof patterns, but 09C1 must not create `app_customer_dossiers` merely to satisfy their old foreign keys. Case-owned target records or a forward-only case cutover are required; two active core owners are forbidden.

## 9. Account-Type Mapping

### Particulier

Safe automatic records:

- customer and unbound login identity;
- one natural-person party and signed declared person profile;
- `account_owner` relationship;
- one case;
- the same person as asserted `service_recipient` and, where used, asserted `case_contact`;
- signed mandate link, locations/observations, durable evidence versions and internal review state.

A natural person acting for themself does not need a fictitious representation-authority record. This does not prove `aangeslotene`, eligibility or external verification.

### Zakelijk

Safe automatic records:

- customer and unbound login identity;
- organization party plus signed declared organization profile;
- separate natural-person signed-contact party/profile where not already safely linked;
- organization as asserted `service_recipient` and signed person as asserted `case_contact`;
- case, mandate/signing links, locations/observations, durable evidence versions and internal review state.

Promotion leaves mandate `authority_review_status=required_not_completed`. It creates no representation-authority truth and no `case_confirmed` role.

### VvE

Use the Zakelijk separation with organization classification `vve`: the VvE is asserted service recipient, and the signed natural person is asserted case contact. Board/manager authority, applicable register/evidence and mandate sufficiency remain separate review. Promotion may create the case, but may not mark the signer authorized.

## 10. Authority Boundary

Signature proves a signing act; case participation records who is involved in the ENVAL case. Neither proves representation authority.

For Zakelijk/VvE:

- `signer_role` is a signed declaration only;
- `authority_review_status=required_not_completed` remains leading;
- no title, email, Auth account, customer ownership, `account_owner`, `case_contact`, parser observation, document upload or signature may set authority verified;
- promotion is allowed because it opens a reviewable case, not because authority is accepted;
- any operation that legally requires established authority remains fail-closed until the separate authority foundation is approved and implemented.

## 11. Evidence And Quarantine Boundary

- Browser upload and upload confirmation end at private quarantine.
- Promotion copies bytes only server-side and revalidates exact metadata/hash.
- Durable file/version metadata is case-owned and references the immutable quarantine source and signing snapshot.
- A durable version means preserved evidence material, not evidence acceptance or verifier sufficiency.
- Parser output remains observed/derived and never overwrites declared signup state automatically.
- `app_evidence_decisions` remains empty until an authorized review writes a separate explicit decision.
- Original signing/legal evidence is immutable and is linked, never rewritten.

## 12. Auth And Dashboard Boundary

Promotion creates durable account/case state but no Supabase Auth session.

After promotion:

1. a post-commit outbox may issue the existing Supabase Auth account/login route;
2. verified Supabase Auth later binds to the unique existing `app_customer_identity`;
3. Auth bootstrap must reuse the promoted customer, party and case and must not create a dossier or second case;
4. dashboard reads a case-owned customer-safe projection;
5. signing OTP, safe reference, receipt and management capability never authorize dashboard reads or mutations.

09C1 therefore replaces the dossier-creating v2/v3 bootstrap assumption with a case-reusing bootstrap revision and updates `api-app-dashboard-get` away from `app_customer_dossiers` as core owner. No custom login/session architecture is introduced.

## 13. Customer Journey And Copy

Target projection:

```text
Ondertekend en ingediend
-> In behandeling
-> eventueel Actie nodig
-> gerichte correctie
-> Gereed voor de volgende procesfase
```

Forbidden until externally proven:

- `NEa geverifieerd`;
- `geverifieerd door de verificateur`;
- `goedgekeurd voor inboeking`;
- any equivalent implication from signup, promotion or internal-review status.

There is no second generic full submit in the dashboard. Later corrections are targeted, server-authorized and append-only.

## 14. TKV Traceability At Promotion

| TKV/requirement boundary | promotion-preserved input | non-claim / later owner |
|---|---|---|
| mandate completeness and calendar-year validity | exact mandate, legal versions/hashes, signer input, issue time and one selected year | authority sufficiency and verifier mandate check remain later decisions |
| EAN and `aangeslotene` | exact signed declared EAN/location scope and provenance | no accepted allocation point or `aangeslotene`; later connection/evidence review |
| NEa connection-data permission | exact signed mandate permission | later lawful operational use; no query occurs during promotion |
| verifier location-control permission | exact signed mandate permission plus case/location links | visit selection, execution and conclusion remain external |
| evidence provenance | source intake file, server hash/MIME/size, durable object/version, snapshot and promotion request | acceptance/sufficiency is separate internal/external review |
| MID/conformity | signed declared/observed MID and document provenance | no conformity acceptance; later asset/evidence module |
| retention | category and verification-year anchors remain linkable to immutable records | TKV minimum applies to verification-related information; other schedules need legal/privacy decisions |
| correction history | immutable source, versions, roles and later supersession/correction events | no historical truth is deleted on rollback or correction |
| verifier pack | stable case, party/profile, mandate, location, evidence-version and snapshot references | risk, sample, visits, findings and statement remain verifier-owned |

## 15. Exact 09C1 Implementation Scope

One bounded implementation batch must include together:

1. forward status rename to `submitted_for_review`, including receipt schema revision and all named callers/proofs;
2. one immutable `app_signup_promotions` mapping and one append-only internal case-lifecycle responsibility;
3. case-owned durable evidence file/version minimum with private server-prepared object mapping and no acceptance row;
4. service-role-only `app_promote_signed_signup_v1` plus internal `api-app-signup-promote` caller;
5. direct `app_cases` creation/reuse from signed intake, never `app_customer_dossiers` creation;
6. safe customer/identity/party/profile/relationship reuse and account-type mappings above;
7. asserted case roles only, with Zakelijk/VvE authority incomplete;
8. `app_locations` customer-declared observations plus `app_case_location_relations`, without accepted location versions;
9. signed EAN/charger/MID facts retained for review without writing blocked canonical connection/asset truth;
10. revised Auth bootstrap that binds the promoted identity and reuses customer/party/case;
11. case-owned dashboard projection and post-commit Auth invitation/outbox boundary;
12. transactional audit/idempotency, concurrency, rollback and customer-safe response.

Do not split the core database creation into multiple visible transactions. Storage preparation may precede the transaction only under the inaccessible deterministic-orphan rule above.

## 16. 09C1 Proof Gates

Required focused proof:

- exact CURRENT-to-new-status migration and no external-verification semantics;
- finalized-intake cardinality/hash/file revalidation;
- browser/safe-reference/receipt/capability cannot call promotion;
- same-input replay returns the same case and all record IDs;
- payload conflict and two real concurrent promotions produce at most one commit;
- injected failure at every record family leaves no customer/identity/party/case/role/location/evidence/promotion/audit partial state;
- no `app_customer_dossiers` row is created;
- Particulier creates no authority fiction;
- Zakelijk/VvE creates only asserted participant/contact rows and leaves authority incomplete;
- declared/parser facts create no accepted EAN, location version, MID/conformity or evidence decision;
- exact server-only source-to-durable file/hash mapping and inaccessible orphan behavior;
- signing snapshot, acceptances, mandate and signature evidence remain byte/row immutable;
- Auth bootstrap binds and reuses without second customer/party/case;
- dashboard exposes only safe case reference and internal customer copy;
- external verifier tables/statuses remain untouched;
- RLS/grants remain deny-by-default and service-only;
- fresh apply, rollback, protected-count/hash and cleanup proof;
- targeted typecheck/build/browser journey only when 09C1 includes the corresponding frontend surface.

## 17. Non-Claims

This contract does not implement 09C1, approve production legal/OTP delivery, establish representation authority, accept evidence/EAN/MID, perform external verification, create a verification statement, authorize REV/booking, or grant remote/deploy permission.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

# Intake Verification Promotion Contract

Status: CURRENT PROVEN — LOCAL ONLY through 09C1C-R6 authenticated intake provenance, multi-context Auth access and fresh post-promotion dashboard handoff. Production/remote acceptance remains separate.

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
| 1. intake start | first required document upload causes the signup upload client to ensure an intake session | `api-app-signup-intake-start` / `app_signup_quarantine_start_v2` | one `app_signup_intakes` row, one hashed `intake_manage` capability and, only for verified Auth, one immutable `app_signup_authenticated_intake_provenance` row | raw management capability exists only in same-tab `sessionStorage`; verified Auth JWT is validated server-side, e-mail is derived server-side and no token is persisted | `signup_intake_collecting_started`; request/idempotency and hashed request metadata; typed Auth provenance contains subject, verified-at and e-mail hash only | intake `collecting`; no customer, identity or case |
| 2. quarantine upload issue | customer selects a required PDF | `api-app-signup-upload-url` / `app_signup_quarantine_issue_v1` | immutable intake-file revision with server-chosen private bucket/path plus one hashed file-scoped upload capability | valid unconsumed `intake_manage`; returned upload capability is narrow and one-file scoped | `signup_quarantine_upload_issued` | file `upload_issued` |
| 3. upload confirm | browser uploads to the signed private URL and asks the server to confirm | `api-app-signup-upload-confirm` / `app_signup_quarantine_confirm_v1` | server downloads bytes, validates MIME/size/hash, consumes upload capability and records `confirmed_quarantine` or rejection | file-scoped upload capability; no dossier or evidence authority | `signup_quarantine_upload_confirmed` or `signup_quarantine_upload_rejected` | confirmed quarantine transport only; not accepted evidence |
| 4. signing challenge | customer requests the six-digit code after Step 3 readiness | `api-app-signup-signing-challenge` / `app_signup_signing_challenge_issue_v1` | one delivered, expiring `typed_name_otp_v1` challenge; older active challenge is replaced | valid `intake_manage`; server binds challenge to a hashed normalized-email channel | `signup_signing_challenge_issued` plus delivery audit | intake remains `collecting`; no signature yet |
| 5. OTP/email-control proof | customer submits the delivered OTP together with typed signer input | no independent verification endpoint; proof is evaluated inside finalize | delivered challenge, channel hash, OTP verifier, expiry and attempts are checked atomically | OTP plus the matching intake/challenge/capability proves control of the used email channel for this signing act | failed attempts stay bounded; successful proof becomes part of signature evidence | no standalone account, Auth session, authority or external-verification state |
| 6. signing finalization | customer confirms the canonical facts, legal actions, one mandate year and typed signature | `api-app-signup-signing-finalize` / `app_signup_signing_finalize_v2` followed by bounded server-owned promotion | exactly one immutable signing snapshot, three legal acceptances, one mandate and one signature-evidence row; challenge and management capability consumed; `finalized_at` set | capability ownership plus delivered OTP challenge; verified Auth is a separate optional account anchor | exactly one `signup_signing_finalized` event | database status `submitted_for_review`; signing remains valid if later promotion/binding must retry |
| 7. finalized refresh/status | same-tab page bootstraps through the existing intake session; receipt is presentation cache only | `api-app-signup-signing-finalize` with `operation=status` / `app_signup_signing_status_v2` | server rechecks finalization; a verified matching bearer may append the narrowly labeled recovery provenance for an older signed intake; promotion retries are bounded and idempotent | hashed `intake_manage` proves scoped status ownership; verified Auth JWT is validated independently; wrong Auth subject fails closed | immutable Auth recovery provenance only when needed; no second intake or signing act | server returns `finalized`, `locked`, safe reference, `promotion_state` and `account_handoff` |
| 8. post-signing handoff | customer sees the confirmation while promotion is pending | server prepares durable bytes and calls `app_promote_signed_signup_v3`, which runs context-scoped v1 promotion plus Auth access synchronization in one transaction | zero-case verified Auth creates exactly one compatible customer, one bound identity and one `app_cases` root; later account types create separate contexts and explicit access without customer merge | receipt, safe reference, OTP, e-mail equality and capability grant no promotion/access rights by themselves; the browser receives no internal secret | safe Edge stages plus immutable promotion/lifecycle/Auth-access provenance | pending stays temporary with bounded retry; activation/login paths remain; `promoted` + `already_authenticated` clears current-principal dashboard/bootstrap cache before `/dashboard` |

CURRENT proof also establishes that signing itself creates no `app_customers`, `app_customer_identities`, `app_customer_dossiers` or `app_cases` row. Only the separate service-only 09C1A promotion transaction may create/reuse the first three target families, and it never creates `app_customer_dossiers`.

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

## 5. `submitted_for_review` Database Meaning And Compatibility Projection

CURRENT exact meaning:

| context | CURRENT meaning |
|---|---|
| API-internal | the unchanged 09B2 frontend temporarily receives legacy discriminator `pending_verification`; it grants no promotion authority |
| database lifecycle | `submitted_for_review`: finalized/locked intake with consumed signing challenge/capability and complete immutable signing record set |
| customer-facing | not shown as raw copy; projected as `Je dossier is ondertekend en ingediend.` |
| external/verifier | none; it does not mean external verification is pending, started or assigned |

Because the old name conflicts with the formal TKV meaning of verification, 09C1A replaced stored lifecycle truth and all new database writes with the exact internal value `submitted_for_review`.

The rename is semantic and explicit, not silent:

- `submitted_for_review` means signed, server-finalized, mutation-locked and awaiting ENVAL's internal promotion/review path;
- customer copy remains `Ondertekend en ingediend` followed by `In behandeling` after promotion;
- external-verifier states must live only in the later verifier bounded context.

09C1A migrated together:

- `app_signup_intakes.status` check and transition guard in a forward migration based on `20260716100000_app_signup_intake_quarantine_schema.sql`;
- finalize/status functions and audit `next_status` derived from `20260806160000_app_signup_signing_runtime.sql`;
- signing-runtime and quarantine schema expectations for stored database truth;
- existing finalized local rows, without changing `finalized_at`, signing evidence or safe references.

Still TARGET for a separately authorized frontend/Edge batch: `signupSigningClient.ts`, `signupSubmissionReceiptStore.ts`, `SignupPageShell.tsx`, receipt schema/copy and the public API projection. The compatibility response may not be interpreted as external verification or promotion authority.

No compatibility layer may interpret either name as external verification. The forward migration transformed old stored rows transactionally; all new database writes use `submitted_for_review`.

## 6. CURRENT 09C1A/09C1B Atomic Promotion Boundary

TARGET flow:

```text
finalized signed intake (`submitted_for_review`)
-> server-only durable-file preparation
-> one `app_promote_signed_signup_v3` database transaction
-> `app_cases`-owned durable case + internal review state
-> intake `promoted`
```

`app_promote_signed_signup_v3` preserves the v1 promotion transaction, scopes customer compatibility to the signed account type and, when immutable verified Auth provenance exists, safely binds the first compatible identity or synchronizes explicit access to a later separate context. These operations share one database transaction: a later promotion, binding or access failure rolls back newly created business truth while leaving finalized signing valid. Anonymous promotion still requires the unchanged signing and promotion lineage.

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

09C1B proves this sequence locally through the server-only `api-app-signup-promote` entrypoint. Production fails closed without `APP_SIGNUP_PROMOTION_INTERNAL_SECRET`; the existing service-role bearer alone is insufficient outside detected local runtime. The request accepts exactly one internal intake reference and never accepts source/destination Storage coordinates or evidence metadata.

If durable-object preparation succeeds but the database transaction fails, the intake stays `submitted_for_review`. The invocation best-effort removes only destinations it demonstrably created, after checking that no promotion or evidence version references them; a destination that pre-existed is never deleted. If cleanup cannot complete, the object stays private and its deterministic identity makes a later retry re-download and fully reverify it before reuse. No partial case, party, mandate link, evidence version or customer projection becomes visible.

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
| charger/charge point/MID | create one immutable case-owned `app_chargers` root per signed charger plus one `app_charger_declarations` observation preserving the signed location binding and available brand, model, serial, declared MID, explicit installation date/year, backend supplier and solar/export declaration | every value remains `confirmed_awaiting_review`; no accepted charger, charge-point, MID or conformity truth is created |
| mandate/signing | link existing immutable `app_signup_mandates`, snapshot, acceptances and signature evidence through promotion provenance | never copy/rewrite the canonical content; Zakelijk/VvE authority remains incomplete |
| documents | server prepares durable private bytes and creates case-owned `app_evidence_files` and immutable `app_evidence_versions` from exact confirmed quarantine revisions | no browser promotion; `confirmed_quarantine` is not `accepted`; no `app_evidence_decisions` row is created automatically |
| document declaration context | preserve document type plus a hashed source-slot reference and only a deterministic signed location/charger association in `app_evidence_declaration_contexts` | filename, hash, storage path and source-slot identity are not customer projection; ambiguous multi-subject scope remains unlinked rather than inferred |
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
- 09C1B reuses the private `app-documents` bucket. Source keys are exactly `signup-quarantine/{intake_id}/{file_id}/document.pdf`; durable keys are exactly `case-evidence/signed-signup/{intake_id}/{file_id}/document.pdf`. UUIDs only are used, never email, name, EAN or other PII.
- Creation uses `upsert=false`. Both source and destination are downloaded server-side and checked against confirmed server size, detected/declared PDF MIME and SHA-256. A mismatching existing destination fails closed.
- Storage and Postgres are deliberately not presented as one transaction. Creator tracking, reference checks, best-effort cleanup and deterministic private reuse form the bounded orphan strategy; no cleanup table or migration is required for this phase.

## 12. Auth And Dashboard Boundary

Promotion creates durable account/case state but no Supabase Auth session.

After promotion:

1. the signed receipt links to the existing Supabase Auth account/login route after server-owned promotion succeeds;
2. verified Supabase Auth later binds to the unique existing `app_customer_identity`;
3. Auth bootstrap must reuse the promoted customer, party and case and must not create a dossier or second case;
4. dashboard reads a case-owned customer-safe projection;
5. signing OTP, safe reference, receipt and management capability never authorize dashboard reads or mutations.

09C1C implements that case-reusing bootstrap revision and the signed-case branch of `api-app-dashboard-get`. The response retains the existing safe dashboard summary shape for renderer/cache reuse, but its compatibility selector equals the case UUID for signed cases; no dossier row exists or is created. No custom login/session architecture is introduced.

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

## 15. Exact 09C1A/09C1B Foundation And Remaining Scope

09C1A CURRENT PROVEN — LOCAL ONLY includes:

1. forward database status rename to `submitted_for_review`, with a temporary legacy frontend response discriminator;
2. one immutable `app_signup_promotions` mapping and one append-only internal case-lifecycle responsibility;
3. case-owned durable evidence file/version metadata from a server-supplied deterministic manifest, with no Storage copy and no acceptance row;
4. service-role-only `app_promote_signed_signup_v1`; no Edge caller yet;
5. direct `app_cases` creation/reuse from signed intake, never `app_customer_dossiers` creation;
6. safe customer/identity/party/profile/relationship reuse and account-type mappings above;
7. asserted case roles only, with Zakelijk/VvE authority incomplete;
8. `app_locations` customer-declared observations plus `app_case_location_relations`, without accepted location versions;
9. signed EAN/charger/MID facts retained for review without writing blocked canonical connection/asset truth;
10. transactional audit/idempotency, concurrency, rollback and minimized service response.

09C1C-R4 CURRENT PROVEN — LOCAL ONLY adds forward-only declared-data parity:

- a signed charger becomes a case-owned immutable root linked to the already
  declared location and an immutable `confirmed_awaiting_review` declaration;
- signed document classification remains source-authored, with an opaque
  source-slot hash and only deterministic declared subject context;
- the dashboard projects declared chargers and meaningful safe document
  vocabulary using existing opaque charger/evidence UUIDs as UI identity;
- MID, charger, location and evidence remain declared/review-input truth, never
  accepted or eligible truth.

09C1B CURRENT PROVEN — LOCAL ONLY adds:

1. internal-only `api-app-signup-promote` with fail-closed service-role plus internal-secret authorization and local-only detected-runtime fallback;
2. server-derived intake, signing/cardinality, consumed challenge/capability and confirmed-source validation before Storage preparation, while the 09C1A RPC remains the authoritative transactional validation/lock boundary;
3. private source download and deterministic private durable destination in the existing `app-documents` bucket, with post-copy byte/MIME/size/SHA-256 verification and no browser-supplied paths;
4. `upsert=false` creation, exact-object reuse, conflict rejection, bounded concurrent create handling, creator-only cleanup and deterministic private orphan reuse;
5. minimized internal response and safe stage logging with request ID only; the database completion event remains authoritative business audit;
6. Q01-Q30 local runtime proof for authorization, integrity, replay, concurrency, cleanup, source retention, non-claims and secret-free output.

09C1C CURRENT PROVEN — LOCAL ONLY adds the frontend/receipt `submitted_for_review` cutover, server-owned promotion attempt after finalize and on bounded status hydration, receipt/account CTA, verified Auth binding to the existing promoted identity/customer/case, and the case-owned customer-safe dashboard projection. Promotion failure never rolls back signing; safe retry is bounded and reuses the 09C1B idempotency owner. The browser never receives promotion authority or an internal secret.

Still TARGET: production Auth/redirect acceptance, production legal and OTP delivery, operations review UI, authority/evidence acceptance, EAN/aangeslotene/MID decisions, external verifier, REV/inboeking, remote apply and deploy.

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

09C1A/09C1B/09C1C implement the complete local signed-submission to verified-Auth customer-dashboard boundary. They do not approve production legal/OTP/Auth configuration; establish representation authority; accept evidence/EAN/MID; implement operations review or an external verifier; create a verification statement; authorize REV/booking; or grant remote/deploy permission. No remote function, secret or Storage policy was changed by 09C1C.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 18. 09C1C-R1 Existing-Account Convergence

Promotion may reuse exactly one compatible active customer identity after the
same e-mail channel has been controlled, including when a Supabase Auth user
already exists. It creates no Auth user and never merges cases on e-mail,
address, name or document content. A new signed intake remains a new
`app_cases` root; replay/refresh creates no second case.

Incompatible customer type, inactive/multiple identities, conflicting binding
or customer-level party/profile mismatch fail closed. Signature and OTP do not
prove representation authority. The post-finalization account handoff is safe
guidance only and is never emitted by the pre-OTP collecting response.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 19. 09C1C-R2 On-Demand Legacy Profile Convergence

CURRENT PROVEN — LOCAL ONLY.

R2 is not a backfill. It runs only while atomically promoting a new finalized
immutable signed intake. E-mail is only the routing handle inside an already
proved chain: one normalized signing channel, one active identity, one active
customer, one verified Auth binding, compatible account type, no competing
customer/identity claim, one compatible account-owner party and no conflicting
current profile truth. Missing, ambiguous or cross-user links fail closed.

Repeated presentation rows with the same trimmed signed declaration value are
one value; different values remain ambiguous. If the compatible owner party has
no current profile, promotion appends one immutable
`source_type=signed_signup_intake` person or organization version anchored to
the signing snapshot. It is declared truth only. Auth, OTP and e-mail control
do not independently verify a person, organization, representation or
authority. An exactly matching current profile is reused; a conflicting
current profile is never overwritten or superseded.

Particulier pins that natural-person version to asserted `service_recipient`
and `case_contact` on the new case and creates no representation authority.
Zakelijk/VvE preserve organization/contact separation and
`required_not_completed` authority review. All database profile,
relationship, role, promotion, evidence metadata and case writes remain inside
the existing locked/idempotent promotion transaction. Deterministic private
Storage preparation remains the separately documented inaccessible-orphan
boundary.

The existing case is not a merge candidate. It remains present, the signed
intake creates exactly one new `app_cases` root, and evidence from that intake
stays on that new case. One account may therefore expose both cases through the
unified authenticated dashboard.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

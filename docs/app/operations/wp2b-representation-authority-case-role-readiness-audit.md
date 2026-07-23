# WP2B Representation-Authority And Case-Role Readiness Audit

Status: PROOF ONLY — WP2B READINESS AUDIT

Audit date: 2026-07-23.

This document is a repository-source, contract, schema, function, helper, and proof inventory. It is not implementation permission, database proof executed in this batch, remote proof, production proof, legal acceptance, representation-authority approval, mandate approval, or verifier approval.

## 1. Auditbasis

### Repository guard

| guard | result |
|---|---|
| repository | `/Users/daankoote/dev/enval` |
| branch | `main` |
| HEAD | `11ba1a4b0f7c6e728e1fb57b557cbc2cfe5d0c4f` |
| expected HEAD | match |
| index | empty |
| tracked worktree | clean |
| target audit before batch | absent |
| remote action | none |

Pre-task status:

```text
## main...origin/main [ahead 66]
?? deno.lock
?? scripts/proofs/app-connection-write-rpcs.proof.ts
?? scripts/proofs/app-ean-connection-domain-foundation.proof.ts
?? scripts/proofs/app-signup-intake-quarantine-schema.proof.ts
?? scripts/proofs/in-place-baseline-phase0-proof.mjs
?? scripts/proofs/in-place-baseline-phase0-remote-readonly.sql
?? scripts/proofs/postgrest-authorized-health.proof.mjs
?? scripts/proofs/recovery-gate-remote-readonly.sql
?? supabase/baseline-proposals/
```

These pre-existing untracked paths were explicitly protected and were not changed. There were no unexpected tracked changes.

### Read sources

The audit read at least:

- `docs/app/00_CANON.md`;
- `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md`;
- `docs/app/06_NEA_REQUIREMENTS.md`;
- `docs/app/07_NEA_TARGET_ARCHITECTURE.md`;
- `docs/app/architecture/database-target-model.md`;
- `docs/app/08_NEA_TRACEABILITY_MATRIX.md`;
- `docs/app/09_NEA_MVP_PLAN.md`;
- `docs/app/contracts/customer-party-representation-case.md`;
- `docs/app/contracts/auth.md`;
- `docs/app/contracts/intake-verification-promotion.md`;
- `docs/app/contracts/signup-dashboard.md`;
- `docs/app/legal/fee-model-and-service-terms.md`;
- `docs/app/operations/nea-implementation-roadmap.md`;
- `docs/app/03_CHANGELOG_APPEND_ONLY.md`;
- `docs/app/04_TODO.md`.

The requested former path `docs/app/07A_DATABASE_TARGET_MODEL.md` is absent. The repository changelog records that the former 07A appendix was moved to `docs/app/architecture/database-target-model.md`; that current path was read. The appendix itself remains `DRAFT — AWAITING DAAN APPROVAL`, is not the primary architecture, and grants no implementation permission.

### Inspected implementation evidence

Migrations and schema:

- `supabase/migrations/20260707151801_app_foundation_schema.sql`;
- `supabase/migrations/20260708133000_app_document_legal_slots_schema.sql`;
- `supabase/migrations/20260712100000_app_customer_auth_bootstrap_rpc.sql`;
- `supabase/migrations/20260716100000_app_signup_intake_quarantine_schema.sql`;
- `supabase/migrations/20260720120000_app_ean_connection_domain_foundation.sql`, only for adjacent temporal/provenance patterns;
- `supabase/migrations/20260720143000_app_connection_write_rpcs.sql`, only for adjacent service-role, audit, idempotency, decision, and supersession patterns;
- `supabase/migrations/20260722100000_app_party_foundation.sql`.

Edge Functions and shared helpers:

- `supabase/functions/api-app-signup-submit/index.ts`;
- `supabase/functions/api-app-auth-bootstrap/index.ts`;
- `supabase/functions/api-app-dashboard-get/index.ts`;
- `supabase/functions/_shared/app_customer_auth.ts`;
- `supabase/functions/_shared/app_foundation.ts`;
- relevant legacy `api-dossier-*` and legacy auth/session helper references, for classification only.

Proof sources:

- `scripts/proofs/app-party-foundation.proof.ts`;
- `scripts/proofs/api-app-auth-bootstrap.proof.ts`;
- `scripts/proofs/api-app-dashboard-get.proof.ts`;
- `scripts/proofs/app-signup-intake-quarantine-schema.proof.ts`;
- `scripts/proofs/app-ean-connection-domain-foundation.proof.ts`, as adjacent pattern evidence only;
- `scripts/proofs/app-connection-write-rpcs.proof.ts`, as adjacent pattern evidence only.

No proof that performs database writes was run in this audit. The WP2A migration and proof hashes were rechecked from repository files:

- migration SHA-256: `0356a978ed20b208ca8e3a350b5e80579e0cd186b9f909a761600d1bebf6a9a4`;
- verified proof SHA-256: `f2e36b8c68178fe911547277fcd9686211dd65a8d0f6eb95c5355e182ef9c086`.

### Official source status

Repository authority records the versioned 2026-07-09 electricity TKV PDF as `OFFICIAL SOURCE SNAPSHOT`, 10 pages, 832788 bytes, SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`, with all 19 present numbered clauses mapped and no clause 3.3.5. This audit performed no remote refresh. Wet milieubeheer, Besluit energie vervoer, and Regeling energie vervoer remain legally higher; consolidated-law, deadline, retention, REV, legal, and external-verifier gaps remain open.

### Mutation boundary

This batch changed documentation only. It changed no code, SQL, migration, schema, database row, Auth configuration, RLS policy, Edge Function, frontend, CSS, inline CSS, proof, runtime, remote system, deployment, or production state. It performed no staging, commit, push, merge, or deploy.

## 2. CURRENT Truth

Status use is deliberately bounded. `CURRENT PROVEN — LOCAL` means only the exact repository object and cited local green proof, never remote, production, regulatory, legal, NEa, or verifier acceptance.

| object/module | classification | concrete evidence | boundary |
|---|---|---|---|
| `app_customers` | CURRENT PROVEN — LOCAL | `20260707151801_app_foundation_schema.sql`: customer account shell with `particulier`, `zakelijk`, `vve`, status, language, contact projection, deny-all RLS, service-role access. Current signup/auth/dashboard call it. | An account shell is not a natural person, organization, account owner in law, represented party, authority, mandate, or case role. |
| `app_customer_identities` | CURRENT PROVEN — LOCAL | Foundation migration binds `customer_id`, nullable `auth_user_id`, email verification and provider/status; active Auth user uniqueness is constrained. `app_bootstrap_customer_auth_v1` and auth proofs cover verified binding, ambiguity rejection, replay, and service-role-only execution. | Technical Auth-to-account binding only. Email or Auth user does not prove legal identity or authority. |
| `app_customer_dossiers` | PARTIAL PROVEN | Current dossier shell, ownership guard, broad status enum, dashboard/document callers and local proofs exist. | It conflates routing and broad lifecycle concepts. It is not a target case-role, authority, mandate, evidence-decision, REV, verifier, or settlement source. |
| `app_dossier_legal_acceptances` | PARTIAL PROVEN | `20260708133000_app_document_legal_slots_schema.sql` stores acceptance type, status, version, hash, request metadata, and includes `mandate_authorization`. | It has no signed artifact, signer, principal, authority source/scope, EAN, exact clauses, calendar-year validity, or authority review. It is legal/commercial acceptance, not mandate truth. |
| `app_parties` | CURRENT PROVEN — LOCAL | WP2A migration: immutable root; `party_kind` constrained to `natural_person` or `organization`; mandatory provenance and `recorded_at`; update/delete guard. WP2A Q01-Q24 is recorded green. | No Auth binding, address, case, representation authority, mandate, EAN, or external legal identity verification. |
| `app_party_person_versions` | CURRENT PROVEN — LOCAL | WP2A: immutable person versions, `valid_from`, `valid_to`, `recorded_at`, provenance, same-party supersession FK, no active overlap, subtype guard. | Only `full_name` is present. It is not government identity proof and has no authority semantics. |
| `app_party_organization_versions` | CURRENT PROVEN — LOCAL | WP2A: immutable organization versions, legal name, classification, optional legal form and trade-register number, validity, recording time, provenance, supersession, no active overlap. VvE is classification `vve`. | KvK data is declared/source-bound. It is neither externally verified nor globally unique. It does not prove board or signing authority. |
| `app_customer_party_relationships` | CURRENT PROVEN — LOCAL | WP2A: time-bound roles `account_owner`, `contact`, `service_recipient`; mandatory provenance; recording time; supersession; same-scope overlap guard; immutable history. Q14-Q18 prove multiple parties/roles and no authority/mandate columns. | Account/service relationship only; not a case role, representation authority, signing authority, or mandate. |
| WP2A RLS/grants | CURRENT PROVEN — LOCAL | Four party tables have RLS enabled, deny-all policies for `anon`/`authenticated`, and `service_role` `SELECT`/`INSERT` only; Q19-Q21 recorded green. | No authorized domain write service, RPC, Edge Function, or customer projection exists. |
| `app_signup_intakes` | PARTIAL PROVEN | Additive schema has submitted payload/hash, `client_precheck`, accepted legal versions, email, finalize/verify/promote/expiry timestamps, immutable-finalization and state guards. Quarantine proof source covers Q1-Q30. | No runtime endpoint/RPC calls this flow. Parser output is non-authoritative. Promotion still targets current dossier shape. Remote/runtime state is UNKNOWN. |
| `app_signup_intake_files` and capabilities | PARTIAL PROVEN | Private metadata, hashes, expiry, guarded file transitions, hashed one-time capability shape, deny-all RLS and service-role access are present in migration/proof. | Not accepted evidence, not authority evidence, no raw token storage, no implemented atomic promotion/consumption runtime. |
| `api-app-signup-submit` | PARTIAL PROVEN | Current write v3 validates account type/applicant/locations/chargers, matches identity by normalized email, creates current customer/dossier graph, acceptances, audit and idempotency. | Backend payload type omits `legalEntity`; email matching and applicant/contact data cannot create a party or authority. Audit helper calls are fail-open. |
| `api-app-auth-bootstrap` and `app_bootstrap_customer_auth_v1` | CURRENT PROVEN — LOCAL | Verified Auth user/email, atomic active identity binding, ambiguity/other-user rejection, idempotency, audit, service-role-only RPC, and account-neutral dossier summaries are locally proven. | It binds credential control to an ENVAL account. It cannot establish natural person, organization, representation, case role, or signing authority. |
| `_shared/app_customer_auth.ts` | CURRENT PROVEN — LOCAL | Verifies bearer through Supabase Auth, requires confirmed email, resolves one active identity/customer, and checks dossier ownership without legacy sessions. | Authentication and portal authorization only. It must not become legal-person or authority resolution. |
| `api-app-dashboard-get` | PARTIAL PROVEN | Authenticated ownership guard, customer-safe dossier projection, cross-customer isolation, redaction, and zero successful-read writes are locally proven. | No party, case-role, representation-authority, authority evidence, or mandate projection exists. |
| `_shared/app_foundation.ts` and app idempotency/audit | PARTIAL PROVEN | Request metadata, hashes, payload hash, safe errors, scoped idempotency and audit-row builders are reused by app endpoints. | Current audit scope taxonomy omits party/authority/case-role events; generic audit inserts are fail-open and therefore unsuitable for material authority decisions. |
| `app_representation_authorities`, versions and evidence links | NOT IMPLEMENTED | No active migration creates these objects; no app function or proof implements them. They exist only as TARGET responsibilities in the WP2 contract. | No representation-authority truth exists. |
| `app_cases` and `app_case_party_roles` | NOT IMPLEMENTED | No active migration, app function, or proof creates them. Current `app_customer_dossiers` is not equivalent. | No target case or case-role truth exists. |
| `app_mandates`, mandate versions/scopes | TARGET / NOT IMPLEMENTED | Requirements and target contracts define signed/versioned mandate truth. Active migrations contain only legal acceptance and document-slot patterns. | Outside this batch and outside the recommended follow-up. |
| external KvK/board/authority evidence source | UNKNOWN | No approved provider contract, access result, evidence standard, or review authority is implemented. | `BLOCKED — EXTERNAL` in the roadmap; no external uniqueness or authority claim is permitted. |
| `app_legal_entities` and `app_representatives` in the older database appendix/trace overlay | CONFLICT | `architecture/database-target-model.md` and the trace overlay name customer-bound legal-entity/representative rows; the later focused WP2 contract reserves provider-independent party roots plus `app_representation_authorities` and versions. | Do not implement either older shape. Resolve the appendix/trace naming in a separate documentation-governance batch before authority schema work. |
| legacy `dossiers`, `dossier_sessions`, `_shared/sessions.ts`, `_shared/customer_auth.ts`, and `api-dossier-*` | LEGACY | Repository callers and remote legacy/fallback responsibilities are recorded; current app auth deliberately does not depend on them. | Migration/fallback/export/retention/rollback only until separately proven safe to retire. Never use them for new party/authority/case work. |

### Classification summary

- `CURRENT PROVEN — LOCAL`: account/Auth primitives and exactly the four WP2A party tables within their cited proof boundary.
- `PARTIAL PROVEN`: current dossier/legal-acceptance/signup/quarantine/audit/dashboard mechanics; useful patterns exist but do not prove WP2 authority or case truth.
- `TARGET`: signed mandates and the focused WP2 authority/case contract.
- `NOT IMPLEMENTED`: representation-authority records, authority evidence/review, target cases, case-party roles, mandates, and authority/case projections.
- `UNKNOWN`: external KvK/board/signing evidence standard and access; remote/production parity for these foundations.
- `CONFLICT`: older `app_legal_entities`/`app_representatives` target naming versus the later focused party/authority contract.
- `LEGACY`: dossier-token/session and `api-dossier-*` architecture.

## 3. Auth/Accountgrens

- Supabase Auth proves control of an authenticated credential and, under the current helper/RPC policy, a verified email address.
- `app_customer_identities` binds that Auth user to exactly one active ENVAL customer account when the current ambiguity and status checks pass.
- This proves no natural person, legal party, representation authority, signing authority, board authority, power of attorney, or mandate.
- `app_customers` is the ENVAL account shell; it is not the legal customer, principal, representative, or service recipient by itself.
- `account_owner`, `contact`, and `service_recipient` in `app_customer_party_relationships` are account/service relationships. None proves authority.
- A portal session can authorize a safe endpoint call while the caller still lacks legal authority to represent or sign for a party.
- Email match, password reset, email change, Auth provider change, login recovery, support access, account type, display name, title, and contact role must never mutate or infer party, authority, mandate, or historical case truth.

## 4. Partygrens

### Proven locally

- `app_parties.party_kind` distinguishes exactly `natural_person` and `organization`.
- VvE is `organization_classification = 'vve'`; it is not a third party kind.
- Person and organization profiles are separate immutable version families.
- Business validity uses `valid_from` and optional exclusive `valid_to`.
- System recording time is separate in `recorded_at`.
- Mandatory provenance includes source type, source reference type/ID, request ID, actor type, and actor reference.
- Same-party supersession is explicit and one-to-one; history rows cannot be updated or deleted.
- Active profile periods and identical customer-party-role periods cannot overlap under the WP2A guards.
- `app_customer_party_relationships` can link one account to multiple parties and one party to multiple different account/service roles.
- `trade_register_number` is indexed but intentionally not globally unique. The schema asserts no external register verification and no unsupported uniqueness.

### Not proven by the party foundation

- A party root does not prove that a real natural person or legal entity has been externally verified.
- A trade-register number or organization profile does not prove current KvK status, board membership, signing authority, or representative authority.
- A customer-party relationship does not prove legal identity, authority, mandate, or case role.
- `account_owner`, `contact`, and `service_recipient` do not imply `representative`, `signer`, or `aangeslotene`.
- WP2A has no address-role truth, case truth, representation authority, evidence review, customer-safe projection, service RPC, backfill, cutover, remote, or production proof.

## 5. Representation-Authority Gap

| required capability | current state | missing target truth/control |
|---|---|---|
| self-representation | NOT IMPLEMENTED | Explicit principal and acting natural-person linkage or reviewed self-representation assertion; it must not be inferred from Auth/account ownership. |
| organization representation | NOT IMPLEMENTED | Organization principal, natural-person representative, authority source/type, allowed acts, evidence, validity and decision. |
| VvE representation | NOT IMPLEMENTED | VvE organization principal plus board/management/signing-authority evidence and VvE-specific review standard. VvE account type or KvK field is insufficient. |
| authority source/type/scope | NOT IMPLEMENTED | Provider-independent source class/reference, authority type, explicit scoped acts, limits, and affected party/case context. |
| business validity | NOT IMPLEMENTED | `valid_from`, optional `valid_to`, explicit expiry and no silent continuation. |
| recorded truth | NOT IMPLEMENTED | `recorded_at`, authorized `recorded_by`, request/correlation and separate effective time. |
| evidence/provenance | NOT IMPLEMENTED | Immutable evidence/version links, content/source hashes, declared/observed/reviewed separation, and source supersession. |
| review status | NOT IMPLEMENTED | Declared, pending review, active/accepted, rejected, withdrawn, expired, superseded, and conflict states with reason. |
| supersession | NOT IMPLEMENTED | Same-scope version chains, replacement link, immutable prior record, and no approval inheritance on broader scope. |
| conflicting claims | NOT IMPLEMENTED | Separate competing claims, overlap detection, conflict status, reviewer resolution, and no destructive merge. |
| withdrawal/termination | NOT IMPLEMENTED | Actor, reason, effective end time, future-use block, retained historical use and replacement reference. |
| four-eyes | NOT IMPLEMENTED | Qualified role model, two distinct actors for critical authority decisions, immutable approvals and fail-closed audit. |
| customer-safe projection | NOT IMPLEMENTED | Plain-language status/actions and safe dates only; no raw evidence, reviewer reasoning, hashes, provider payload, or raw audit. |

Representation authority is therefore not schema-ready for implementation in this batch. Before authority tables can be recommended, the older target-name conflict, acceptable organization/VvE authority evidence, review-role ownership, critical-decision/four-eyes list, conflict-resolution state machine, and safe projection vocabulary need explicit contract decisions.

## 6. Case-Role Gap

The target must keep these concepts separate:

| concept | required owner/boundary |
|---|---|
| submitting customer/account | The ENVAL account owning the case; not itself a party role or authority. |
| service recipient | Party receiving ENVAL's service in that case. It may differ from account owner and aangeslotene. |
| aangeslotene | Party asserted/reviewed for the relevant connection period. A case role alone never proves EAN ownership. |
| represented party | Principal party on whose behalf another party acts. |
| representative | Natural-person party acting in the case. The role alone never proves authority. |
| operational contact | Party/contact used for service communication. It grants no signing or representation authority. |
| financial beneficiary | Possible later finance role only, after a separate legal/finance contract and batch. It is not part of WP2B implementation. |

Hard boundaries:

- Case roles are not `app_customer_party_relationships`.
- Case roles are not representation authority.
- Case roles are not a mandate.
- Case ownership by a customer account is not a party role.
- One party may hold multiple roles in one case.
- One role may move between parties over time.
- Roles require `valid_from`, optional `valid_to`, recording time, actor, source/provenance, and supersession.
- An identical active case/party/role interval must not overlap.
- Competing or disputed roles must remain separate assertions pending review; they must not silently overwrite each other.
- A case-role record must bind the party profile version used for the historical case statement, or otherwise preserve an immutable role-time display snapshot. Later party-profile changes must not rewrite historical case truth.
- `representative` and `represented_party` roles may establish workflow context only. An active, reviewed authority record is still separately required before an authority-dependent act.
- `aangeslotene` role may establish case context only. WP3 owns connection/EAN truth and the reviewed period claim.

Current `app_customer_dossiers` and `app_customer_party_relationships` cannot satisfy these boundaries. `app_cases` and `app_case_party_roles` are absent.

## 7. Mandategrens

- A legal acceptance, terms checkbox, consent bundle, `mandate_authorization` acceptance label, or uploaded document slot is not automatically a signed mandate.
- A mandate needs an immutable signed artifact/version, mandating party, signer, applicable representation-authority reference where needed, exact clauses, issue date, EAN/location scope, explicit whole-calendar-year validity, provenance, withdrawal/expiry, and supersession.
- Client parser and precheck output is observed/derived data. It may warn or prefill but does not prove a signature, legal identity, representation authority, signing authority, mandate completeness, or evidence acceptance.
- Human review must be performed by an authorized actor and recorded. Human review still does not replace the external verifier's professional authority.
- Mandates, mandate clauses, EAN, calendar-year validity, kWh, booking, REV, and settlement remain outside this implementation recommendation.

## 8. Current-Versus-Targetmatrix

| subject | current object/module | proven behavior | missing behavior | risk | reusable pattern | disposition | first next proof |
|---|---|---|---|---|---|---|---|
| portal credential | Supabase Auth + `app_customer_identities` + auth helper/RPC | Verified credential/email to active account binding; ambiguity and ownership guards. | Legal identity and authority. | Credential control mistaken for signer authority. | Verified-user guard, safe errors, idempotent atomic binding. | KEEP | Negative proof that Auth/email/account role cannot create party authority or case role. |
| customer account | `app_customers` | Stable account shell and current routing/contact projection. | Party, case role, legal recipient and representative separation. | Account row becomes legal truth. | Stable ID, status, language and audit linkage. | EXTEND | Case ownership proof without legal-role inference. |
| current dossier | `app_customer_dossiers` | Customer-owned service shell and current dashboard/document scope. | Target case shell, explicit party roles and separated domain state. | Broad dossier status overwrites domain truth. | Ownership guard and safe projection logic only. | REFACTOR | Additive case/role proof beside current dossier, with no caller change. |
| party root/profile | WP2A four tables | Kind/subtype, immutable profile versions, validity, recording time, provenance, supersession, overlap guards. | Case binding, authority, address and service projections. | Overextending local party proof. | Reuse directly within proven constraints. | KEEP | Case-role FK/profile-version/history proof. |
| account-party relationship | `app_customer_party_relationships` | Time-bound account owner/contact/service recipient service relationship. | Case-specific roles and authority. | Relationship role treated as signer authority. | Temporal/provenance/supersession logic. | KEEP | Prove a case role is independent and cannot create authority/mandate. |
| organization/VvE profile | `app_party_organization_versions` | Legal name, organization classification, optional legal form/trade-register fact and history. | External verification, representation and board/signing evidence. | Unverified KvK value treated as authority; false uniqueness. | Versioned source-bound fact; no global uniqueness. | EXTEND | External evidence contract later; no provider work now. |
| representation target naming | older appendix `app_legal_entities`/`app_representatives` versus focused WP2 contract | Both are documentation-only target proposals. | One approved schema vocabulary. | Duplicate/conflicting models. | Party roots from WP2A only. | REPLACE | Documentation-governance decision before any authority migration. |
| representation authority | none | None. | Complete authority aggregate/version/evidence/review/conflict/withdrawal model. | Unauthorized acts and invalid mandates. | WP2A history plus connection decision/audit logic. | UNKNOWN | Contract proof for authority state machine, review actors and evidence standard. |
| case role | none | None. | Case-owned, time-bound, profile-version-bound multi-role truth. | Historic case truth changes with profile; role implies authority. | WP2A temporal/provenance/overlap pattern. | EXTEND | Exact two-table additive local schema/source proof recommended below. |
| legal acceptance | `app_dossier_legal_acceptances` | Version/hash/provenance and accepted/revoked/superseded status. | Signed artifact, signer, authority, clauses, EAN and calendar-year validity. | Invalid mandate reliance. | Reuse for terms only; version/hash pattern may inform later mandate design. | REUSE LOGIC ONLY | Negative proof that legal acceptance cannot satisfy mandate fields. |
| signup runtime | `api-app-signup-submit` write v3 | Current account/dossier graph, idempotency and audit mechanics. | Party/case promotion and authority-safe mapping. | Email match and applicant fields become identity/authority. | Normalization, stable client IDs, safe errors, idempotency. | REFACTOR | No caller change in the recommended schema-only batch. |
| quarantine | intake/files/capabilities schema | Immutable finalized payload, private metadata, expiry and guarded transitions. | Runtime/promotion and party/case mapper. | Parser/precheck promoted as authority or evidence. | Quarantine, hash, expiry and capability patterns. | REUSE LOGIC ONLY | Later promotion contract after party/case writes exist. |
| customer projection | `api-app-dashboard-get` | Owned, redacted, account-neutral projection; zero successful-read writes. | Party/case/authority safe projection. | Raw authority evidence or misleading status exposed. | Strict projection, non-enumeration and redaction. | EXTEND | Later response-contract proof; no endpoint in next batch. |
| audit/idempotency | app audit/idempotency + helpers | Scoped replay/conflict, request metadata and technical audit patterns. | Party/authority/case taxonomy, fail-closed material audit, four-eyes. | Missing legal decision record. | Reuse primitives and connection write patterns. | EXTEND | Schema/source proof first; authority audit remains blocked. |
| legacy auth/dossier | legacy sessions and `api-dossier-*` | Existing fallback/runtime source behavior. | Target compatibility and safe retirement. | New WP2 dependency on legacy identity. | Export/migration/rollback observations only. | LEGACY / REPLACE | Prove no new dependency; retirement remains separate. |

## 9. Bounded Implementation Recommendation

Exactly one small additive follow-up is recommended:

`WP2B-I — additive case shell and case-party-role history — LOCAL SCHEMA AND PROOF ONLY`

This is a recommendation, not authorization. Start only after Daan explicitly approves the exact batch and after the contract names/columns below are reviewed.

### Exact scope

One new forward-only migration and one local proof may add exactly:

1. `app_cases`
   - stable case root;
   - owning/submitting `customer_id`;
   - provider-independent case reference/type;
   - opened/recorded time;
   - source and actor provenance;
   - no mandate, EAN, kWh, eligibility, booking, REV, verifier, finance, beneficiary, settlement, or broad all-domain status.
2. `app_case_party_roles`
   - `case_id` and `party_id`;
   - one bounded role vocabulary: `service_recipient`, `aangeslotene`, `represented_party`, `representative`, `operational_contact`;
   - explicit reference to the applicable immutable person or organization profile version, with subtype and same-party guards;
   - `valid_from`, optional `valid_to`, `recorded_at`, actor/source provenance and same-scope supersession;
   - no overlap for the same case/party/role active history;
   - multiple different roles for one party allowed;
   - no authority, signing, mandate, EAN, beneficiary, payment, or evidence-acceptance semantics.

The batch must not modify WP2A tables. It may add restrictive foreign keys from the two new tables to current `app_customers`, `app_parties`, and profile-version tables only where the proof demonstrates that no WP2A DDL change is necessary.

### Exact security and proof boundary

- RLS enabled and deny-all for `anon` and `authenticated`.
- `service_role` receives only `SELECT` and `INSERT`; no browser table access and no direct customer writes.
- No RPC, Edge Function, Auth change, endpoint, frontend, CSS, projection, backfill, dual write/read, cutover, remote apply, or deployment.
- Immutable roots/history or explicit insert-only history; corrections use superseding rows.
- Proof uses a transaction and rollback and verifies:
  - exact two-table additive scope;
  - case account ownership without treating the account as a party;
  - every bounded role;
  - one party with multiple roles;
  - time validity and identical-role overlap rejection;
  - subtype/profile-version/same-party guards;
  - later profile supersession does not rewrite the profile version referenced by historical case role;
  - case role creates no customer-party relationship, representation authority, mandate, EAN, evidence decision, beneficiary, or finance object;
  - browser-role denial and minimal service-role grants;
  - no mutation of existing app-table counts;
  - rollback leaves zero proof rows.

### Why this batch is first

Case-role history can reuse the already proven WP2A party, temporal, provenance, supersession, overlap, RLS, and grant patterns without pretending that representation authority is ready. Authority implementation remains blocked by the target-name conflict, external evidence standard, review-role/four-eyes decisions, conflict/withdrawal state machine, and safe projection contract. Combining authority and case roles now would create an unsafe inferred-authority shortcut or an oversized batch.

## 10. Hard Exclusions

- no mandates
- no EAN
- no kWh
- no settlement
- no frontend
- no backfill
- no cutover
- no remote

Additional batch exclusions:

- no Auth change;
- no browser writes;
- no representation-authority implementation;
- no authority evidence decision;
- no financial beneficiary role;
- no code or SQL in this readiness audit;
- no staging, commit, push, merge, deploy, or production claim.

## Remaining Risks And Decisions

1. The older database appendix and trace overlay still use `app_legal_entities` and `app_representatives`; the focused WP2 contract uses party roots and representation-authority versions. This is a hard authority-schema naming/ownership conflict.
2. Acceptable KvK, board, VvE, power-of-attorney and signing-authority evidence remains UNKNOWN/BLOCKED — EXTERNAL.
3. Authorized internal review roles, critical authority decisions, four-eyes actor separation, and fail-closed audit behavior remain unimplemented.
4. Self-representation semantics and whether it needs an authority record, a reviewed assertion, or only case-role context require an explicit legal/domain decision.
5. Competing authority claims, withdrawal effective time, historical reliance, merge/split and correction policy require an approved state machine.
6. Customer-safe authority/case status vocabulary and redaction are not designed or proven.
7. Current signup write v3 still creates a dossier from normalized email before the target verification/promotion flow and ignores the frontend `legalEntity` object.
8. `app_signup_intakes` is a schema/proof foundation without runtime promotion and still points to the current dossier shape.
9. WP2A local migration registration, remote parity, production behavior, external evidence acceptance, NEa acceptance and verifier acceptance remain UNKNOWN or unproven.
10. No current object proves a signed mandate; mandate clauses, EAN and calendar-year scope remain a later separately bounded work package.

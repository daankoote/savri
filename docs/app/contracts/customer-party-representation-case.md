# Customer, Party, Representation And Case Contract

Status: TARGET — WP2 DESIGN/CONTRACT

This document is the bounded WP2 current-to-target contract. It grants no further implementation authority. `CURRENT PROVEN` below means only built behavior with the cited local green evidence; it does not mean regulatory compliance, remote presence, production readiness, or acceptance by the NEa or a verifier.

## Source Requirements

Normative order and scope:

1. `docs/app/00_CANON.md`, `05_NEA_COMPLIANCE_DIRECTIVE.md`, `06_NEA_REQUIREMENTS.md`, `06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md`, `08_NEA_TRACEABILITY_MATRIX.md`, and the official NEa source determine requirements.
2. `07_NEA_TARGET_ARCHITECTURE.md` determines the approved TARGET direction, not built truth.
3. `06B_CURRENT_IMPLEMENTATION_ASSESSMENT.md` and local proofs describe current evidence without granting implementation authority.
4. `09_NEA_MVP_PLAN.md`, `10_ARCHITECTURE_GO_NO_GO_AUDIT.md`, and the implementation roadmap determine gates and sequencing.

The official electricity verification framework at `docs/app/sources/official/nea/2026-07-09_toetsingskader-verificatieprotocol_inboekverificatie_elektriciteit.pdf`, together with `NEA-MAND-001` through `NEA-MAND-005`, requires the target to distinguish:

- a natural-person aansluitene from an enterprise/legal entity;
- for an enterprise, the legal name, establishment address, trade-register number, and authorized signer's name and signature;
- the relevant connection and EAN;
- explicit permission for the NEa to request connection data from the distribution system operator;
- explicit permission for the inboekdienstverlener's verifier to inspect the charging location against the applicable article 10 conditions;
- issue date and validity for at least one whole calendar year or successive whole calendar years;
- the signed artifact, signer, authority, provenance, change, withdrawal, expiry, and supersession history.

### Official Source Terminology And Ownership Mapping

The following mapping transcribes the subject matter of official TKV section 3.1.5 into bounded ownership. The first column is the official source requirement; the remaining columns allocate target responsibility without claiming implementation or accepted evidence.

| subject | official source requirement | WP2 party/authority linkage | owning implementation context |
|---|---|---|---|
| onderneming — identiteit | naam, vestigingsadres en **handelsregisternummer** van de onderneming | The organization is one party; legal name and handelsregisternummer belong to a versioned organization profile, while the establishment-address relationship is time-bound and provenanced. VvE remains an organization classification. | WP2 target linkage; WP2A creates no address or authority implementation. |
| onderneming — ondertekenaar | naam en handtekening van de **vertegenwoordigingsbevoegde** | The vertegenwoordigingsbevoegde is a natural-person party linked to the organization through an evidence-backed representation-authority relationship. Een functietitel, Auth-account, emailadres of `account_type` bewijst geen vertegenwoordigingsbevoegdheid. | WP2 owns party/authority linkage; the signature and signed clause set belong to future WP5 mandate truth. |
| onderneming — aansluiting | EAN van de aansluiting | Party and case roles may reference the relevant connection, but they do not own EAN or connection acceptance. | WP3 owns connection/EAN truth and period-bound aangeslotene/ownership review. |
| onderneming — NEa-toestemming | machtiging voor de NEa om gegevens over de aansluiting bij de **distributiesysteembeheerder** op te vragen | No WP2 party or authority record substitutes for this signed permission. | WP5 owns the versioned signed mandate clause; the external DSO/CAR source remains BLOCKED — EXTERNAL. |
| onderneming — locatiecontrole | machtiging aan de **inboekverificateur** om de laadlocatie te controleren | Representation authority identifies who may sign; it does not create the verifier permission or professional verifier authority. | WP5 owns the versioned signed mandate clause; verifier judgment remains external. |
| onderneming — tijd | datum van afgifte en geldigheidsduur in **kalenderjaren** | Party and authority validity remain separate from mandate validity. | WP5 owns issue date and explicit whole-calendar-year mandate scopes; kalenderjaar is not merely a free date range. |
| natuurlijke persoon — identiteit/ondertekening | naam en handtekening van de aangeslotene | The aangeslotene is a natural-person party; the signature is part of the immutable signed mandate version, not an Auth or customer-account attribute. | WP2 owns party linkage; WP3 owns aangeslotene/connection truth; WP5 owns signature evidence. |
| natuurlijke persoon — adres | adres van de aangeslotene | A person-address relationship is time-bound and provenanced; matching it to the connection address is not automatic evidence acceptance. | WP2 owns party-address linkage; WP3 owns connection/location truth and review. |
| natuurlijke persoon — aansluiting | EAN van de aansluiting | The party/case relationship may reference, but never define or verify, the EAN. | WP3 owns connection/EAN truth and validity periods. |
| natuurlijke persoon — NEa-toestemming | machtiging voor de NEa om gegevens over de aansluiting bij de **distributiesysteembeheerder** op te vragen | No account, party role, or Auth binding implies this permission. | WP5 owns the versioned signed mandate clause; the external DSO/CAR source remains BLOCKED — EXTERNAL. |
| natuurlijke persoon — locatiecontrole | machtiging aan de **inboekverificateur** om de laadlocatie te controleren | The customer or party relationship cannot grant or exercise professional verifier authority. | WP5 owns the versioned signed mandate clause; verifier judgment remains external. |
| natuurlijke persoon — tijd | datum van afgifte en geldigheidsduur in **kalenderjaren** | Party, account, case, and representation periods do not replace mandate-year scope. | WP5 owns issue date and explicit whole-calendar-year mandate scopes; kalenderjaar is not merely a free date range. |

The official source requirement is recorded by `NEA-MAND-001` through `NEA-MAND-005`. WP2 defines only the party, party-address, signer, and representation-authority linkage; WP3 owns connection, EAN, location relationship, and aangeslotene/ownership truth; WP5 will own the signed mandate version, both exact permissions, issue date, and calendar-year scope. Datum van afgifte, geldigheidsperiode, bron, bewijs, ondertekenaar en supersession moeten over die referenties heen reconstrueerbaar blijven. This mapping creates no mandate entity, table, implementation, or CURRENT evidence.

An ordinary terms acceptance or consent checkbox is not a complete mandate. The verifier's professional judgment and external-system truth remain external.

## Current Implementation Inventory

Status vocabulary in this inventory:

- `CURRENT PROVEN`: current local behavior or structure has green proof; scope is stated explicitly.
- `TARGET`: approved future contract, not built.
- `PROOF ONLY`: proposal or proof artifact; not runtime truth or implementation authority.
- `UNKNOWN`: not established from current source/proof, including remote and production state.
- `retirement candidate`: removable only after the prerequisites in this contract are met.

### Frontend

| object | current responsibility and callers | data/boundary and overlap | proven status | reusable / non-reusable | disposition |
|---|---|---|---|---|---|
| `signupTypes.ts` `AccountType` and `SignupDraft` | Shared by signup shell, sections, validation, mapper, and proofs. Captures applicant, organization labels, KvK, address, locations, chargers, files, and consent. | One draft combines UI routing, person fields, and organization fields. It does not express party, legal authority, EAN, or mandate validity. | CURRENT PROVEN for local draft/validation only. | Reuse shared draft composition and account-type configuration; do not reuse `AccountType` as legal identity or authority. | REFACTOR |
| `PersonalInfoSection.tsx` | One component renders particulier, zakelijk, and VvE variants through tabs and conditional fields. | Reuses common form/layout classes; currently treats the applicant as the named contact and has no representative/authority model. | CURRENT PROVEN for current local UI behavior only. | Reuse one composed flow and shared fields; do not create three flows. | EXTEND after a separate UI batch |
| address normalizers and lookup adapter/hook | Normalize postcode, house number, suffix, and read PDOK-derived address values; called by signup fields and mapper. | Derived lookup values are not legal address or EAN proof. Provider details already remain in an adapter boundary. | CURRENT PROVEN for local normalization/lookup behavior. | Reuse normalization and port/adapter pattern; never promote lookup output automatically. | KEEP |
| `signupSubmitMapper.ts` | Maps one draft to write-v3 applicant, optional `legalEntity`, acceptances, and locations/chargers. Called by `SignupPageShell` and mapper/contract proofs. | Correctly centralizes mapping, but `legalEntity` is ignored by the current backend and applicant is not a representative contract. | CURRENT PROVEN for frontend payload mapping only. | Reuse stable IDs, normalization, and one mapper; replace party/representation payload assumptions. | REFACTOR |
| auth provider, clients, types, route guard | Creates/signs in a Supabase Auth user, restores session, calls bootstrap, and protects dashboard. | Auth summary exposes account/customer and dossier scope, not legal identity or signing authority. | CURRENT PROVEN for the locally proven auth/session boundary. | Reuse provider, safe errors, lazy loading, and bootstrap transport; never infer legal identity from Auth. | KEEP / EXTEND |
| dashboard types, client, cache, hook, renderer | Parse and render customer-safe dossier, location, charger, document, and legal-acceptance projections. | One account-type-neutral renderer exists. Raw identity, audit, hashes, and storage are excluded. Party, organization, representation, and case-party roles are absent. | CURRENT PROVEN for the current local projection/read path. | Reuse strict parsing, scoped in-memory cache, redaction, hook, renderer, cards, and accordions. | EXTEND |
| CSS/design system | `global.css` imports tokens, base, layout, components, utilities; shared classes include page/container/grid, form fields, tabs, panels, cards, buttons, status pills, and portal layouts. | No separate styling exists per account type; no inline CSS is required for this contract. | CURRENT PROVEN as current source structure. | Reuse existing tokens and shared composition if a later UI batch is approved. | KEEP; no CSS change in WP2 design |

### Backend

| object | current responsibility and callers | data/auth/audit boundary | proven status | overlap/conflict and reusable logic | disposition |
|---|---|---|---|---|---|
| `api-app-signup-submit` | Public write-v3 endpoint called by the signup client. Matches an active identity by normalized email, creates a customer when absent, then creates dossier, locations, chargers, slots, acceptances, idempotency, and audit rows. | Anon gateway request; database writes use service role. Audit inserts are fail-open. `legalEntity` is neither declared in the backend payload type nor persisted. | CURRENT PROVEN for current local submit mechanics; compliance is not proven. | Reuse normalization, stable client IDs, safe errors, payload hashing, idempotency, and row builders. Direct pre-verification customer/dossier creation and email-only matching conflict with TARGET. | REFACTOR, then replace direct promotion path |
| `api-app-auth-bootstrap` | Called by the auth client after verified Supabase Auth. Delegates atomic binding to `app_bootstrap_customer_auth_v1`. | Verified bearer plus service-role-only RPC; safe response contains customer, identity, and dossier summaries. | CURRENT PROVEN for current local binding behavior. | Reuse verified-user guard, idempotency, ambiguity rejection, and account-type-neutral response. Auth binding is not party identity or authority. | EXTEND |
| `api-app-dashboard-get` | Called by dashboard client for one owned dossier. Reads current app tables and returns a curated projection. | `requireAppCustomer` plus `requireAppDossierAccess`; successful reads write no audit row, scoped rejects are fail-open audited. | CURRENT PROVEN for current local customer-safe read behavior. | Reuse projection/redaction and ownership guard. Extend with safe party/case views only after target objects exist. | EXTEND |
| `_shared/app_customer_auth.ts` | Used by dashboard and document endpoints to verify bearer, resolve one active app identity/customer, and enforce dossier ownership. | Service client reads deny-all tables; no legacy dossier session. | CURRENT PROVEN for current local customer/dossier access. | Reuse auth context and non-enumerating ownership checks. It must not resolve legal identity, representative role, or authority. | KEEP / EXTEND |
| `_shared/app_foundation.ts` | Shared request metadata, hashing, deterministic payload hashes, CORS, safe errors, audit/idempotency row construction. | Hashes IP/user agent; audit helpers are currently fail-open. Actor/scope enums are incomplete for party, representation, and case. | CURRENT PROVEN for shared local helpers. | Reuse primitives; extend event taxonomy and choose fail-closed policy for material legal/authority decisions. | EXTEND |
| legacy `_shared/sessions.ts`, `_shared/customer_auth.ts`, and `api-dossier-*` | Legacy dossier-token authentication and old dossier CRUD/evaluation/export flows. | `dossier_sessions` is the durable access boundary for old flows. | CURRENT PROVEN only as legacy runtime/source behavior; target compatibility is UNKNOWN. | No reuse as `/app` identity. Preserve only migration, fallback, retention, export, rollback, or proven caller needs. | RETIRE AFTER CUTOVER |

### Database

All listed active `app_*` tables enable RLS, deny `anon` and `authenticated`, revoke broad grants, and grant explicit table operations to `service_role`, unless stated otherwise. Direct customer table access is not the target read path.

| object | current responsibility, callers, data and constraints | overlap/conflict | status | reusable / non-reusable assumptions | disposition |
|---|---|---|---|---|---|
| `app_customers` | Account shell created by signup and read by auth helpers. Stores `customer_type`, display/contact fields, language, status, timestamps; type/status/language checks and optional unique customer number. | Mixes account shell, routing type, person display name, and contact data; cannot be legal person or service-recipient truth. | CURRENT PROVEN for current local account shell. | Reuse stable account ID, number, language, status, audit links. `customer_type`, display name, email, and phone are not reusable as legal truth. | EXTEND as account shell |
| `app_customer_identities` | Maps customer to nullable Supabase Auth user and email/phone handles; used by signup, bootstrap, auth helper. Active Auth user is unique; provider/status enums exist. | Technical identity is currently easy to confuse with person/legal identity. Email matching is not authority evidence. | CURRENT PROVEN for current local Auth binding. | Reuse one-active-binding checks and verified Auth link. Keep provider data out of party truth. | EXTEND |
| `app_customer_dossiers` | Current service dossier created by signup and used by auth, dashboard, documents, audit, locations, chargers, and connections. Stores account type, broad lifecycle, retention, lock and timestamps. | Combines account routing and many future domain-state implications; it is not a complete target case and must not own mandate, evidence, EAN, review, REV, verifier, or finance truth. | CURRENT PROVEN as current local dossier shell. | Reuse customer ownership, numbering, service lifecycle timestamps, retention link, and document scope through an adapter during cutover. | REPLACE by `app_cases`; RETIRE AFTER CUTOVER |
| `app_dossier_locations` | Address/location snapshot under a dossier; signup writes and dashboard reads. Unique client location per dossier; status and normalized address fields; lookup metadata. | Dossier ownership and provider metadata are embedded; address is not party residence/establishment, connection, EAN, or accepted evidence. | CURRENT PROVEN for current local location facts. | Reuse normalization, stable client ID, and address fields. WP3 decides target location migration. | REFACTOR; final disposition in WP3 |
| `app_dossier_chargers` | Charger snapshot under dossier/location; signup writes, dashboard/documents read. Unique client charger per dossier, required MID, status/year checks. | Charger, charge point, meter/MID, and evidence are collapsed. Not party/case identity truth. | CURRENT PROVEN for current local submitted facts. | Reuse stable ID and submitted asset facts only. | REFACTOR; final disposition in WP4 |
| `app_dossier_legal_acceptances` | Versioned terms/consent acceptances called by signup/dashboard; type/version/status checks and hashed request metadata. | `mandate_authorization` label can be mistaken for a signed mandate; no signer, authority, clauses, EAN, or calendar-year scope. | CURRENT PROVEN for current local acceptance records. | Reuse version/hash/provenance pattern for commercial/legal acceptance only. | KEEP for terms; REPLACE for mandate truth |
| `app_signup_intakes` | Additive pre-dossier submitted payload, hash, precheck, legal versions, verification/promotion timestamps and target dossier link. Finalized facts are trigger-immutable. No runtime endpoint currently calls it. | Intended promotion still targets current dossier and stores a broad JSON payload. `client_precheck` is non-authoritative. | PROOF ONLY for local schema/proof foundation; runtime and remote state UNKNOWN. | Reuse quarantine, hash, immutable-finalization, verification-before-promotion, expiry. Promotion mapper must target party/case contracts. | REFACTOR before runtime use |
| `app_signup_intake_files` / capabilities | Quarantine file metadata and hashed one-time capabilities with guarded transitions, expiry, and service-role-only access. No runtime caller. | Useful transport/security foundation, but not accepted evidence or authority. | PROOF ONLY; runtime and remote state UNKNOWN. | Reuse transition, hash, expiry, single-use capability patterns. | KEEP / EXTEND in later evidence batch |
| `app_audit_events` / `app_intake_audit_events` | Internal and pre-dossier audit rows used by app endpoints/RPCs; actor/scope checks, request/idempotency refs, hashed request metadata. | Scope taxonomy lacks party, representation, authority, case role, and supersession; fail-open is unsafe for material authority decisions. | CURRENT PROVEN for current local technical audit primitives. | Reuse append-oriented shape and minimized metadata. | EXTEND |
| `app_idempotency_keys` | Scoped key/payload hash/replay record used by signup, bootstrap, and connection RPCs. Unique scope/key and response-status constraints. | Generic technical primitive; cleanup/retention remains open. | CURRENT PROVEN for current local write paths. | Reuse unchanged pattern with party/case-specific scopes. | KEEP / EXTEND |
| `app_connections`, periods, ownership periods | Adjacent WP3 foundation linking customer/dossier/location/EAN with declared/observed source, decision metadata, periods, overlap/boundary/transition guards, and supersession. | Uses current customer/dossier/location FKs; an ownership claim is not party/representation or mandate authority. | CURRENT PROVEN only as local Gate-1 source/proof foundation; external/remote truth UNKNOWN. | Reuse provenance, temporal, decision, overlap, boundary, and supersession patterns. Rebind later through approved migration. | REUSE LOGIC; structural disposition in WP3 |
| inactive wave-1 baseline proposals | Propose `app_customers`, identities, `app_cases`, locations, connections, assets, and evidence objects with conflicting English enums and earlier shapes. No runtime callers. | Names overlap active objects and approved target, but proposal shapes are not authoritative and must not be applied as-is. | PROOF ONLY / proposal only. | Reuse design observations and rollback inventory, not SQL or enum assumptions. | REUSE LOGIC ONLY |
| legacy `dossiers`, `dossier_sessions`, related child tables | Old dossier/session CRUD, evaluation, document, export, and retention source for `api-dossier-*`. Exact creation DDL/remote parity is not fully present in current migrations. | Conflicts with Supabase Auth `/app` boundary and target party/case model. | Legacy source behavior CURRENT; complete schema/remote state UNKNOWN. | Use only for explicit migration/export/retention/rollback. | RETIRE AFTER CUTOVER |

### Functions, RPCs, Triggers, Grants And Proofs

| object | current contract | status / disposition |
|---|---|---|
| `app_set_updated_at()` and update triggers | Maintain `updated_at` on current customer, dossier, location, charger, and other app rows. | CURRENT PROVEN pattern; KEEP where mutable projections are allowed, not for immutable versions. |
| `app_bootstrap_customer_auth_v1` | Security-definer, empty search path, validates verified `auth.users`, binds one identity, returns dossiers, audits and finalizes idempotency; execute only for service role. | CURRENT PROVEN local behavior; EXTEND response later, never infer party/authority. |
| signup-intake transition guards | Freeze finalized payload/legal/email facts and enforce intake/file transitions. | PROOF ONLY foundation; REUSE LOGIC. |
| connection boundary/overlap/transition guards | Enforce customer/dossier/location consistency, non-overlapping periods, decision metadata, and supersession. | CURRENT PROVEN local Gate-1 pattern; REUSE LOGIC. |
| connection write RPCs | Service-role-only declare/decide/supersede ownership operations with provenance, idempotency, and audit. | CURRENT PROVEN local Gate-1 pattern; REUSE LOGIC, not party authority. |
| deny-all RLS plus explicit service-role grants | Blocks browser roles from current core tables; Edge/RPC layers project safe data. | CURRENT PROVEN local pattern; KEEP. Service-role breadth still requires endpoint/RPC authorization. |
| auth, dashboard, signup, intake, document, and connection proof files | Exercise local source/contracts, negative auth, replay/conflict, RLS, projection redaction, and transition behavior. | PROOF ONLY as evidence artifacts; they prove neither production nor legal/regulatory acceptance. |

## Current-To-Target Comparison

1. **Is `app_customers` usable as target customer/service-recipient entity?** Partly. It is usable as the ENVAL account/service shell, but not as the legal service recipient. A customer account may be linked to one or more parties and cases; the service recipient and aangeslotene are explicit party roles. Legal name, person name, KvK, address, representative, and authority must not derive from the customer row.
2. **Which person and organization data must leave one generic customer row?** Natural-person names and person-specific identifiers belong to a natural-person profile; legal name, legal form, trade-register number, establishment address, and organization status belong to an organization profile. Contact email/phone are contact points or account projection data. Signer, representative, authority, and mandate data are relationships/evidence, never customer columns.
3. **Which `app_customer_dossiers` responsibilities belong in target `case`?** Stable case ID/number, owning ENVAL customer account, service type, high-level service lifecycle, opened/submitted/closed timestamps, retention classification/reference, and links to parties, locations, evidence, and domain workflows.
4. **What leaves or splits from `app_customer_dossiers`?** `account_type` becomes routing/projection derived from party/case roles; legal identity and representation move to party/authority records; mandate, connection/EAN, asset, evidence decision, eligibility, kWh, booking/REV, verifier, correction, finance, and settlement keep separate state machines. One broad dossier status may summarize but may not overwrite those truths.
5. **How are particulier, zakelijk, and VvE modeled without three flows?** One shared intake/case flow uses a party-kind and role configuration. `particulier` selects a natural-person service recipient; `zakelijk` selects an organization plus representative; `vve` is an organization classification plus representative. Shared fields, validation, mapper, services, projection, components, CSS, and layout remain single-source; small differences use configuration, composition, and adapters.
6. **How are representatives and authorities time-bound and evidence-backed?** A representative is a natural-person party in an authority relationship with a principal organization/person, explicit scope, `valid_from`, `valid_to`, status, issue/record times, source, decision actor, and supersession link. Immutable authority versions link to evidence artifacts and reviews. No role title, email, Auth session, or KvK lookup alone proves signing authority.
7. **How does Supabase Auth remain separate?** `app_customer_identities` binds a verified Auth user to an ENVAL customer account only. Customer-party and case-party relationships grant business visibility; representation-authority records grant legal scope. Auth answers who controls a portal credential, not who the legal person is or may sign.
8. **Which frontend types and backend helpers are reusable?** Reuse account-type-neutral composition, stable client IDs, address/field normalizers, mapper pattern, strict response parsers, auth provider/guard, dashboard cache/hook/projection, shared tokens/layout/components, `requireVerifiedSupabaseAuthUser`, `requireAppCustomer`, dossier-access logic adapted to case access, request metadata, hashing, idempotency, safe errors, and audit row builders. `AccountType` remains UI/routing configuration only.
9. **What becomes a retirement candidate?** `app_customer_dossiers`, its `account_type` and over-broad status assumptions, legal/person fields on `app_customers`, mandate meaning in `app_dossier_legal_acceptances`, direct customer/dossier creation in signup write-v3, dossier-shaped auth/dashboard response names, legacy `dossiers`, `dossier_sessions`, `_shared/sessions.ts`, `_shared/customer_auth.ts`, `api-dossier-*`, and conflicting wave-1 proposal SQL. Each requires the deletion prerequisites below.
10. **What is the smallest safe first implementation batch?** `WP2A — additive party directory and customer-party binding`, defined exactly under First Implementation Batch. It creates no case, representation, mandate, Auth, endpoint, UI, backfill, cutover, remote, or deployment behavior.

## Target Bounded Contexts

| context | owns | must not own |
|---|---|---|
| customer account | ENVAL account shell, language, account status, portal scope | legal identity, authority, mandate, verifier truth |
| party directory | stable natural-person and organization identities, versioned profiles and contact/address links | Auth credentials, case lifecycle, evidence acceptance |
| identity binding | Supabase Auth-to-customer binding and login state | legal person equivalence or representation authority |
| representation | principal, representative, scope, validity, authority version, evidence links, internal review state | mandate clauses, external verifier judgment |
| case | service engagement shell, case parties/roles, high-level lifecycle and links | domain state machines, evidence acceptance, REV or verifier result |
| mandate | signed mandate/version, exact permissions, EAN/location/calendar-year scope, withdrawal/expiry/supersession | generic terms acceptance; implemented later in WP5 |
| projection | role-filtered customer-safe account/party/case summaries | raw evidence, audit, authority review notes, provider payloads |

## Entity Responsibilities

| target entity | responsibility and core invariants |
|---|---|
| customer account | Stable ENVAL account. May relate to multiple parties/cases. It is not itself a natural or legal person. |
| party | Stable provider-independent identity root with kind `natural_person` or `organization`; kind is immutable. |
| natural-person version | Versioned names and applicable person facts. It contains no organization/KvK fields and no Auth provider fields. |
| organization version | Versioned legal name, organization classification, legal form, and trade-register number. VvE is an organization classification, not a third party kind. |
| party-address role | Time-bound link from a party to an address/location version with role such as residence, establishment, correspondence, or service location; an address lookup remains observed input until reviewed. |
| customer-party relationship | Time-bound relationship between customer account and party, with role such as account owner, contact, or service recipient. |
| representative | A natural-person party acting in a case/authority relationship; not a duplicate person entity. |
| representation authority | Principal party, representative party, allowed acts/scope, validity, status, provenance, decision, and supersession. |
| case | One ENVAL service engagement, owned by a customer account, with its own lifecycle and party-role links. |
| case-party role | Time-bound case participation. Broader future contexts may later define separately approved roles, but WP2B-I permits exactly `service_recipient` and `case_contact`. No case role implies authority. |
| mandate/version | Later WP5 entity containing immutable signed clauses and signer/party/EAN/location/calendar-year scope. It references, but does not replace, representation authority. |

## Relationship Model

The cardinality contract is:

- one customer account -> many customer-party relationships -> one or more parties;
- one party -> exactly one subtype over time: natural-person versions or organization versions;
- one party -> zero or more time-bound address roles; residence and establishment are explicit roles rather than generic customer columns;
- one customer account -> many cases;
- one case -> many case-party roles; the same party may hold multiple explicit roles;
- one representation authority -> one principal party plus one natural-person representative party, one or more explicit scopes, and one or more evidence links;
- one mandate version -> one mandating party, one signer party, the signer authority reference when applicable, one or more EAN/connection and location scopes, and one or more complete calendar years;
- one case may link multiple mandates, but only a mandate version whose party, connection/EAN, location, validity year, and status all match may support that scope.

Neither organization contact, case applicant, portal user, nor `account_type` automatically means authorized signer.

## Temporal Truth

- Stable roots keep identity; profile facts are immutable versions with `valid_from`, optional `valid_to`, `recorded_at`, `recorded_by`, and `supersedes_id`.
- Business validity and system-recording time are separate. Backdated facts record both.
- Active intervals for the same party/fact kind may not overlap unless the contract explicitly permits competing claims; competing claims remain separate observed assertions pending review.
- Customer-party, case-party, representation, location/connection, ownership, and mandate relations are period-bound.
- Mandate validity consists of explicit whole-calendar-year scopes. Issue date is retained separately.
- Withdrawal ends future authority/mandate use but never erases historical signed versions or decisions.
- Customer-facing `current` values are projections over versioned truth, never destructive overwrites.

## Provenance

Every submitted, observed, reviewed, or decided party/authority fact carries, as applicable:

- source class and provider-independent source reference;
- source record/artifact reference and hash, never raw provider payload in core truth;
- actor type/reference, request ID, idempotency key, observed/declared/recorded timestamps;
- validity period and superseded record reference;
- decision status, authorized decision actor/reference, decision request/time/reason;
- evidence links and version identifiers.

External source data enters through future ports/adapters as observed input. Parser output is observed/derived data and never independently accepted evidence or core truth. An authorized human review is required before an evidence decision, and that review does not replace the external verifier boundary.

## Auth Versus Legal Identity Boundary

- Supabase Auth proves control of an authenticated credential and verified email under the current Auth policy.
- `app_customer_identities` binds that credential to one customer account. It never points directly to `natural_person` as proof of legal identity.
- Customer visibility is computed from active account-party and case-party relationships plus endpoint authorization.
- Signing and representation require a separately active, scoped, time-valid, evidence-backed authority decision.
- Password reset, email change, identity-provider change, or account recovery must not mutate party identity, representation, or mandate history.
- A customer support or admin role may facilitate review but may not self-grant legal authority.

## RLS And Service-Role Boundary

- Every new core table enables RLS and starts deny-all for `anon` and `authenticated`.
- Browser clients never write party, authority, case-role, mandate, provenance, decision, or raw audit tables directly.
- Service role remains server-only. Possessing service role does not replace endpoint/RPC actor authorization, scope checks, state checks, idempotency, audit, or four-eyes rules.
- Customer reads use narrow server projections. No arbitrary `customer_id`, `party_id`, or `case_id` filter is accepted from the browser without derived ownership checks.
- Internal authority evidence, raw provenance, audit rows, review reasoning, external references, and fraud/verifier-restricted data are never in customer projections.
- Material authority creation, decision, withdrawal, and supersession are fail-closed when the required audit record cannot be written.

## Frontend Contract

Future frontend work uses one shared model:

- `PartyDraft` discriminates `natural_person` and `organization`; subtype-specific fields live in their subtype, not optional fields on one generic row.
- `SignupRouteConfig` maps `particulier`, `zakelijk`, and `vve` to party kind, organization classification, required fields, and copy.
- `RepresentationDraft` exists only when a party acts for another party and captures scope/evidence requirements without declaring authority accepted.
- `CasePartyRoleProjection` and `CustomerPartyCaseProjection` are customer-safe response types, not database mirrors.
- Existing form sections, normalizers, strict clients, hooks, cache, shared components, tokens, layout, and modifier classes are reused.
- No separate Auth client, dashboard client, signup service, component family, or CSS layer is created per account type. No inline CSS is allowed.

## Backend Contract

Future write services must:

1. authenticate or validate the bounded pre-auth capability;
2. normalize and validate a versioned request contract;
3. derive actor and customer/case scope server-side;
4. write party roots, immutable profile versions, relationships, and audit atomically;
5. reject subtype mismatch, duplicate active periods, unauthorized scope, ambiguous identity, and conflicting idempotency;
6. return a customer-safe projection, never raw rows or provider payloads.

Future reads reuse `requireAppCustomer` and evolve `requireAppDossierAccess` into a case-access guard after dual-read/cutover proof. External KvK, DSO/CAR, e-sign, or verifier integrations implement ports/adapters and return observed records only.

## Database Contract

Reserved target relation responsibilities are:

| relation | responsibility |
|---|---|
| `app_parties` | Stable party root and immutable party kind. |
| `app_party_person_versions` | Immutable natural-person profile versions and validity. |
| `app_party_organization_versions` | Immutable organization profile versions including legal name/classification/KvK facts. |
| `app_party_address_roles` | Time-bound, provenanced links from parties to address/location versions and their legal/business role. |
| `app_customer_party_relationships` | Versioned/time-bound account-to-party roles. |
| `app_representation_authorities` | Stable principal/representative relationship root. |
| `app_representation_authority_versions` | Immutable scope, validity, status, provenance, review, and supersession. |
| `app_representation_authority_evidence` | Links authority versions to evidence versions and review decisions. |
| `app_cases` | Stable service case shell owned by a customer account. |
| `app_case_party_roles` | Time-bound party roles for a case. |
| future `app_mandates`, `app_mandate_versions`, `app_mandate_scopes` | WP5 signed mandate truth and exact party/signer/EAN/location/calendar-year permissions. |

Core relations contain no provider-specific columns. External identifiers belong in typed external-reference/observation adapters. JSON is permitted for bounded non-core metadata only, not as a substitute for party, authority, role, validity, or mandate constraints.

## Audit Events

Minimum future event families:

- `party_created`, `party_profile_version_recorded`, `party_profile_superseded`;
- `customer_party_relationship_started`, `customer_party_relationship_ended`;
- `representation_authority_declared`, `representation_authority_reviewed`, `representation_authority_activated`, `representation_authority_rejected`, `representation_authority_withdrawn`, `representation_authority_expired`, `representation_authority_superseded`;
- `case_opened`, `case_party_role_added`, `case_party_role_ended`, `case_status_changed`, `case_closed`;
- later WP5: `mandate_issued`, `mandate_signed`, `mandate_activated`, `mandate_withdrawn`, `mandate_expired`, `mandate_superseded`.

Each material event records before/after record references, actor, request/idempotency, reason, timestamps, and safe provenance. Customer timelines are curated projections, not raw audit.

## Correction And Supersede Rules

- Submitted or observed facts are not silently edited into accepted truth.
- Correctable party-profile facts create a new version and supersede the previous version; the old version remains reconstructable.
- Wrong-party merge/split requires a dedicated reviewed operation, dependency inventory, reversible mapping, and audit; email matching never merges parties.
- Authority scope or validity changes create a new authority version. A broader scope never inherits approval automatically.
- Withdrawal, rejection, expiry, and supersession are explicit terminal/transitional states with actor, reason, time, and replacement link where applicable.
- Mandate changes always create a new signed version; no silent renewal. A withdrawn or expired mandate remains historical and cannot support new decisions.
- Corrections to projections follow accepted versions; they do not rewrite evidence or external observations.

## Customer-Safe Projection

The customer projection may expose:

- account display/language and own cases;
- own party display name and organization summary needed for the service;
- own role in a case and a plain-language representation/mandate status;
- safe validity dates, requested customer actions, and downloadable customer-owned signed copies;
- correction/withdrawal request status.

It must not expose raw identity bindings, full KvK/provider payloads, evidence hashes/storage paths, internal authority reasoning, raw audit, reviewer identities beyond approved display, risk/sample/fraud data, or verifier workpapers. A safe status never asserts accepted evidence, eligibility, NEa approval, or verifier sufficiency unless the owning decision source proves it.

## Reuse Refactor Replace Retire Matrix

| current item | disposition | target use |
|---|---|---|
| `app_customers` | EXTEND | account shell only |
| `app_customer_identities` and Auth helper/provider | KEEP / EXTEND | technical login-to-account binding |
| `app_customer_dossiers` | REPLACE; RETIRE AFTER CUTOVER | migrate/adapter to `app_cases` |
| signup shared draft/component/config pattern | REFACTOR | discriminated party and representation drafts |
| signup normalization, stable IDs, mapper, idempotency | REUSE | shared intake/promotion mechanics |
| direct write-v3 customer/dossier creation | REPLACE | verified atomic promotion after a later contract |
| dashboard strict parser/cache/hook/projection | EXTEND | customer-safe party/case projection |
| `app_dossier_legal_acceptances` | KEEP for terms; REPLACE for mandate | never mandate truth |
| app audit/idempotency | EXTEND | party/authority/case event taxonomy and fail-closed material events |
| connection temporal/provenance/supersede logic | REUSE LOGIC ONLY in WP2 | pattern for party and authority history |
| signup quarantine | REFACTOR | target party/case promotion, no auto-evidence |
| wave-1 baseline proposals | REUSE LOGIC ONLY | inventory, not executable target SQL |
| legacy dossier sessions/functions | RETIRE AFTER CUTOVER | migration/fallback/export/rollback only until proven unused |
| shared CSS tokens/layout/components | KEEP | later approved UI composition; no WP2 design changes |

## Dependencies

- Canon, approved TARGET architecture, requirements and TKV clause mapping.
- Existing auth/account boundary and audit/idempotency primitives.
- WP3 location/connection/EAN target links for mandate scope.
- WP5 final mandate text, signing evidence, calendar-year and withdrawal contract.
- WP6 evidence version/decision boundary and WP7 authorized review/four-eyes roles.
- Explicit legal, retention, privacy, data-minimization, and merge/correction decisions.

## Blockers

- Accepted legal/evidentiary standard for electronic signatures and enterprise/VvE signing authority: UNKNOWN.
- KvK source/access and acceptable authority evidence: BLOCKED — EXTERNAL.
- DSO/CAR source, authoritative EAN/aangeslotene periods, and manual fallback acceptance: BLOCKED — EXTERNAL.
- Qualified verifier engagement, accepted location-control evidence, and professional judgment: BLOCKED — EXTERNAL.
- Final data retention/minimization periods and party merge/split authority: BLOCKED — DECISION.
- Remote schema/runtime parity and production state: UNKNOWN and outside this batch.

## Explicit Non-Goals

- Outside the separately proven WP2A evidence below: no code, schema, migration, SQL, Edge Function, Auth, RLS, UI, CSS, asset, proof, baseline, database, remote, commit, push, merge, or deploy change.
- No implementation GO, production claim, regulatory-compliance claim, accepted-evidence decision, or verifier decision.
- No provider selection or provider-specific core fields.
- No mandate implementation; WP2 defines its party/authority linkage only and WP5 owns signed mandate truth.
- No deletion, backfill, cutover, dual write, or legacy retirement.

## First Implementation Batch — WP2A Local Evidence

Exact bounded first implementation batch, locally proven on 2026-07-22:

`WP2A — additive party directory and customer-party binding — LOCAL SCHEMA AND PROOF ONLY`

WP2A status: CURRENT PROVEN — LOCAL

Evidence date: 2026-07-22

This status applies only to the following four tables, their constraints and guards, their deny-all RLS boundary, the stated service-role grants, and the cited local proof:

- `app_parties`
- `app_party_person_versions`
- `app_party_organization_versions`
- `app_customer_party_relationships`

Bounded evidence:

- migration: `supabase/migrations/20260722100000_app_party_foundation.sql`; SHA-256 `0356a978ed20b208ca8e3a350b5e80579e0cd186b9f909a761600d1bebf6a9a4`;
- proof: `scripts/proofs/app-party-foundation.proof.ts`; SHA-256 `f2e36b8c68178fe911547277fcd9686211dd65a8d0f6eb95c5355e182ef9c086`;
- Deno check: green;
- proof result: Q01-Q24 green, zero `FAIL`, marker `app-party-foundation-proof-ok`;
- cleanup: transactional rollback left all four WP2A party tables with zero rows; protected existing app-table counts were unchanged;
- access: all four tables have RLS enabled with a deny-all policy; `service_role` has `SELECT` and `INSERT` only; `anon` and `authenticated` have no table grants;
- migration state: applied to the local database but absent from local Supabase migration history, because that history remains empty; the migration is ignored by the repository and requires a later conscious `git add -f` before any commit;
- environment boundary: no remote or production apply, proof, parity, verifier proof, NEa acceptance, or deployment is established.

`CURRENT PROVEN — LOCAL` does not extend beyond the four WP2A tables, constraints, guards, RLS/grants, and local proof. It does not prove or implement `app_cases`, case-party roles, representation authority, authority evidence, mandates, EAN/connection linkage, Auth binding, endpoints, intake promotion, frontend, customer projection, backfill, cutover, remote behavior, production behavior, or NEa/verifier acceptance. Those responsibilities remain in their separately bounded target contexts and retain `TARGET`, `TODO`, `UNKNOWN`, or `BLOCKED — EXTERNAL` status as applicable.

In scope:

- one additive migration defining only `app_parties`, `app_party_person_versions`, `app_party_organization_versions`, and `app_customer_party_relationships`;
- immutable party kind, subtype exclusivity, period validity/non-overlap, provenance, supersession, indexes, comments, deny-all RLS, and explicit service-role grants;
- one local SQL proof covering natural person, organization, VvE-as-organization classification, one account with multiple party roles, invalid subtype/overlap rejection, supersession, provenance, browser-role denial, service-role access, and zero mutation of current tables;
- documentation/evidence update after green proof.

Explicitly out of scope for WP2A:

- `app_cases`, case roles, representation authority, mandate, address/location/EAN links, evidence decisions, intake promotion, backfill, dual write/read, Auth/RPC/Edge/frontend/UI/CSS, legacy changes, remote, and deploy.

This is the smallest safe batch because it adds provider-independent identity roots beside current behavior, proves invariants without changing callers, and leaves cutover reversible.

Proposed later modules, not created by this contract:

| module | single responsibility | motivation |
|---|---|---|
| shared `partyContract` | Discriminated party, profile-version, and relationship request/response types. | Prevent frontend/backend/account-type type drift. |
| domain `party` service | Validate subtype, periods, provenance, and supersession. | Keep party invariants out of endpoints and UI. |
| domain `representation` service | Validate principal, natural-person representative, scope, evidence, validity, and decisions. | Prevent role labels or Auth from becoming authority. |
| domain `case` service | Open/transition case shell and manage case-party roles. | Keep case lifecycle separate from mandate/evidence/REV states. |
| `PartyRepository` port | Provider-independent persistence contract. | Keep Supabase and future external sources out of core truth. |
| Supabase party adapter | Implement the repository against approved app tables. | Isolate storage details and enable contract tests. |
| customer party/case projection | Produce role-filtered safe read models. | Reuse the existing dashboard redaction pattern without exposing core rows. |

No account-type-specific duplicate module is allowed.

## WP2B Readiness Audit Result

`docs/app/operations/wp2b-representation-authority-case-role-readiness-audit.md` is the PROOF ONLY repository-readiness assessment for representation authority and case roles.

At its audit date, its bounded result was:

- WP2A remains `CURRENT PROVEN — LOCAL` only for the four existing party tables and their cited constraints, guards, RLS, grants, and proof.
- Representation authority, authority evidence/review, cases, case-party roles, mandates, Auth/case projection, backfill, cutover, remote, and production were outside WP2A and not implemented at that audit point. The later WP2B-I local proof changes only the current status of cases and case-party roles.
- The older database appendix names `app_legal_entities` and `app_representatives`; those shapes conflict with this later focused party/authority contract and must not be implemented before a separate documentation-governance decision resolves the target vocabulary.
- Exactly one next additive batch is recommended, not authorized: `WP2B-I — additive case shell and case-party-role history — LOCAL SCHEMA AND PROOF ONLY`.
- WP2B-I is limited to `app_cases` and `app_case_party_roles`, leaves WP2A unchanged, creates no representation authority or mandate, and preserves account ownership, party role, authority, mandate, EAN, beneficiary, and finance as separate truths.

Open authority risks remain the acceptable organization/VvE evidence standard, self-representation semantics, conflicting claims, withdrawal/historical reliance, qualified review roles, four-eyes, fail-closed audit, and customer-safe projection vocabulary.

## WP2B-I DDL-Ready Target Contract

DOMAIN CONTRACT — APPROVED

`app_cases`: CURRENT PROVEN — LOCAL

`app_case_party_roles`: CURRENT PROVEN — LOCAL

API/runtime/customer projection: NOT IMPLEMENTED

Remote/production: NOT PROVEN

NEa/verifier acceptance: NOT PROVEN

Decision date: 2026-07-24.

The earlier `BLOCKED — DECISION` result was correct for the then-underspecified recommendation. The decisions below closed only the `WP2B-I — additive case shell and case-party-role history — LOCAL SCHEMA AND PROOF ONLY` contract blockers. The two-table schema is now locally implemented and independently proven; this does not make representation authority schema-ready and does not implement an API, runtime write path, customer projection, remote apply or production behavior.

Implementation basis:

- basis commit: `1e4fe26781796c9f624eb42d186c39fb98271218`;
- migration: `supabase/migrations/20260724110000_app_case_party_role_foundation.sql`; SHA-256 `fb3f9b5d0705d47a5f1be9f934684a25ad474000874daf2ef9e071ab3ddb56a1`;
- proof: `scripts/proofs/app-case-party-role-foundation.proof.ts`; SHA-256 `12e4fdc5587fed04f75d3dda039c56e72fcd144cf1ecd8b943f1db7e32ef52bb`;
- proof result: Deno check green; Q01-Q34 green; marker `app-case-party-role-foundation-proof-ok`;
- evidence record: `docs/app/proofs/wp2b-i-case-party-role-foundation.md`;
- source state: migration and proof are not committed by this documentation batch.

### Regulatory And Internal-Control Basis

- TKV 3.0.4 requires a complete, ordered and reconstructable verification dossier with the relevant steps, relationships and reasoning. WP2B-I supports later reconstruction through immutable role versions, provenance, decision metadata and supersession.
- TKV 3.0.5 requires verification data/documentation and relevant supplied information to remain available for at least five years after the end of the verification calendar year. WP2B-I therefore has no normal hard-delete path and delegates eventual expiry to a future central retention module.
- TKV 3.1.3 makes changes an input to dynamic verifier risk analysis. ENVAL preserves source/requirement versions and impact decisions, but never performs or stores an ENVAL-authored professional risk conclusion as case-role truth.
- TKV 3.1.4 distinguishes the inboeker, an enterprise or natural person served by an inboekdienstverlener, location facts, and `aangeslotene` checks. A case participant is therefore not automatically `aangeslotene`, EAN owner or verified party.
- TKV 3.1.5 requires the verifier to check the enterprises and natural persons that mandated an inboekdienstverlener and separately prescribes signed mandate, authorized-representative, EAN and permission facts. A WP2B-I case role is therefore neither representation authority nor a mandate.
- The exact identifiers, history model, overlap controls, RLS, grants and modular-extension rules below are `ENVAL INTERNAL CONTROL` choices supporting `NEA-AUD-002`, `NEA-RET-001`, `NEA-RET-003` and `NEA-OPS-004`; they are not presented as literal NEa-prescribed database columns.

### `app_cases`

`app_cases` is an immutable service-engagement root owned by one customer account. One customer account may own multiple cases. A case has at most one operational service recipient at any validity instant; multiple legal service recipients require separate cases.

The table contains exactly:

| column | proven local type / rule |
|---|---|
| `id` | `uuid`, primary key, default `gen_random_uuid()` |
| `customer_id` | `uuid`, required FK to `app_customers(id)`, `ON DELETE RESTRICT` |
| `case_reference` | `text`, required and globally unique |
| `created_at` | `timestamptz`, required; caller-supplied recording time because the schema defines no default |
| `created_by_actor_type` | `text`, required; exact WP2A vocabulary: `customer`, `system`, `support`, `admin`, `edge_function`, `worker`, `provider`, `unknown` |
| `created_by_actor_ref` | `text`, required and nonblank; no PII or secret |
| `source_class` | `text`, required and nonblank; open provenance classification |
| `source_ref` | `text`, required and nonblank; open minimized source reference |
| `request_id` | `text`, required and nonblank |

`case_reference` is intended to be opaque and server-issued, is stored already trimmed, is 8–64 characters long, and contains no PII or domain semantics. The proven schema enforces global uniqueness, trimmed storage and length. Server issuance and the no-PII/no-domain-semantics write boundary remain API/runtime responsibilities and are not implemented or proven by WP2B-I.

`app_cases` has no `status`, `case_type`, `EAN`, mandate, authority, evidence-decision, kWh, settlement, generic JSON, `updated_at`, or other lifecycle/domain fields. It is append-only and has no normal UPDATE or DELETE path.

### `app_case_party_roles`

`id` identifies one immutable role version. `role_claim_id` identifies the stable claim chain across versions. No separate generic claim table is introduced.

Every role version contains exactly:

| column | proven local type / rule |
|---|---|
| `id` | `uuid`, primary key, default `gen_random_uuid()`, immutable version ID |
| `role_claim_id` | `uuid`, required stable chain ID, default `gen_random_uuid()` |
| `case_id` | `uuid`, required FK to `app_cases(id)`, `ON DELETE RESTRICT` |
| `party_id` | `uuid`, required FK to `app_parties(id)`, `ON DELETE RESTRICT` |
| `person_profile_version_id` | nullable `uuid`; restrictive FK to `app_party_person_versions(id)` |
| `organization_profile_version_id` | nullable `uuid`; restrictive FK to `app_party_organization_versions(id)` |
| `role_type` | `text`, required; exactly `service_recipient` or `case_contact` |
| `claim_status` | `text`, required; exactly `asserted`, `case_confirmed`, `disputed`, `rejected` |
| `valid_from` | `timestamptz`, required |
| `valid_to` | nullable `timestamptz`; exclusive upper bound |
| `recorded_at` | `timestamptz`, required and separate from business validity; the schema defines no default |
| `recorded_by_actor_type` | `text`, required; exact WP2A actor vocabulary |
| `recorded_by_actor_ref` | `text`, required and nonblank; no PII or secret |
| `source_class` | `text`, required and nonblank; open provenance classification |
| `source_ref` | `text`, required and nonblank; open minimized source reference |
| `request_id` | `text`, required and nonblank |
| `decision_at` | nullable `timestamptz` |
| `decided_by_actor_type` | nullable `text`; exact WP2A actor vocabulary when present |
| `decided_by_actor_ref` | nullable `text`, nonblank when required; no PII or secret |
| `decision_reason` | nullable `text`, nonblank when required |
| `supersedes_id` | nullable `uuid`, restrictive self-reference within the same claim/scope |
| `supersession_reason` | nullable `text`, required and nonblank when superseding |

Exactly one profile-version reference is present on every role version:

- `service_recipient` accepts either a natural-person profile version or an organization profile version;
- `case_contact` requires a natural-person profile version and forbids an organization profile version;
- direct restrictive profile-version FKs prove that the referenced versions exist, while the focused `app_case_party_roles_insert_guard()` proves that the selected profile version belongs to exactly `party_id` and matches its natural-person/organization subtype;
- a later party-profile version never changes the stored reference or historical case truth;
- the profile reference is a historical display/truth anchor, not identity verification, authority evidence, mandate evidence or evidence acceptance.

Business validity is half-open: `[valid_from, valid_to)`. A null `valid_to` is unbounded. A non-null `valid_to` must be strictly later than `valid_from`.

### Contract-To-Implementation Reconciliation

The approved domain semantics are unchanged. The following earlier TARGET physical details are explicitly replaced by the proven migration; this is not silent drift:

| earlier TARGET detail | proven local implementation | semantic effect |
|---|---|---|
| `source_type`, `source_reference_type`, `source_reference_id` | `source_class`, `source_ref` | Open, nonblank, minimized provenance remains required; the physical provenance shape is compressed from three fields to two. |
| case `actor_type`, `actor_ref` | `created_by_actor_type`, `created_by_actor_ref` | The exact WP2A actor vocabulary and nonblank reference rule remain unchanged; names now express case creation responsibility. |
| role `actor_type`, `actor_ref` | `recorded_by_actor_type`, `recorded_by_actor_ref` | The exact WP2A actor vocabulary and nonblank reference rule remain unchanged; names now express version recording responsibility. |
| role `valid_from`/`valid_to` as `date` | `timestamptz` | Half-open business validity is unchanged and now supports sub-day instants. |
| composite profile FK including `party_id` | direct restrictive profile-version FK plus the transaction-locking insert guard | Same-party and subtype binding remain enforced; the mechanism changed from declarative composite FK to FK plus focused trigger validation. |
| `decision_actor_type`, `decision_actor_ref`, `decision_request_id`, `decision_reason`, `decided_at` | `decision_at`, `decided_by_actor_type`, `decided_by_actor_ref`, `decision_reason`, with mandatory row `request_id` | Complete decision metadata remains required for decided states; no separate decision-request column is stored. |
| `supersedes_role_version_id` | `supersedes_id` | Append-only linear supersession semantics are unchanged. |
| server-recorded `created_at` and `recorded_at` wording | required caller-supplied `timestamptz` columns without schema defaults | Recording time remains distinct from business validity; trustworthy server population remains a future API/runtime responsibility. |

These implementation details introduce no authority, mandate, EAN/`aangeslotene`, evidence-acceptance, verifier-approval, booking-eligibility or payout-entitlement truth.

### Decision And Operational-Truth Semantics

- `asserted` is an undecided case-participation claim and carries no decision metadata.
- `case_confirmed`, `disputed`, and `rejected` require all four physical decision fields: `decision_at`, `decided_by_actor_type`, `decided_by_actor_ref`, and nonblank `decision_reason`; the mandatory row-level `request_id` remains the request provenance and no separate `decision_request_id` column exists.
- `case_confirmed` confirms only participation in this ENVAL case. It never proves representation authority, signing authority, mandate, `aangeslotene`/EAN truth, evidence acceptance, verifier approval, booking eligibility or payout entitlement.
- Only a non-superseded terminal `case_confirmed` version is operational role truth.
- Auth, `app_customer_identities`, customer ownership, `app_customer_party_relationships`, account-owner/contact/service-recipient labels, `app_dossier_legal_acceptances`, parser output and derived observations cannot create or substitute a confirmed role, representation authority or mandate.

### Supersession, Overlap And Cardinality

Supersession is append-only and must enforce:

- at most one direct successor per version;
- no self-reference and no cycle;
- the same `role_claim_id`, `case_id`, `party_id`, and `role_type`;
- `recorded_at` strictly later than the predecessor;
- required nonblank `supersession_reason`;
- the predecessor remains immutable and reconstructable.

An incorrect party is never replaced inside the same claim chain. The old chain is ended through a later `disputed` or `rejected` version and a new `role_claim_id` is started for the correct party. The later write path must perform both actions atomically.

At transaction end, among non-superseded terminal chain versions:

- at most one `case_confirmed` `service_recipient` may cover any instant in one case;
- multiple `case_confirmed` `case_contact` claims may overlap;
- the same party may not have duplicate overlapping confirmed intervals for the same case and role;
- the same natural person may simultaneously be `service_recipient` and `case_contact`;
- none of these combinations creates representation authority.

These checks depend on terminal chain state and must run at the end of the transaction. A historical unique or exclusion index alone is insufficient. The implementation requires a focused deferrable constraint trigger, or an equivalent transactionally proven pattern, covering terminal-chain overlap, service-recipient cardinality, supersession scope and cycle prevention. It must reuse the proven WP2A half-open interval, locking and append-only semantics without creating a generic authority/mandate/role engine.

### Provenance, Security And Retention

- Provenance reuses the exact WP2A actor vocabulary, open/nonblank source pattern and separation of business validity from recording time. The proven physical fields are `source_class`, `source_ref`, `request_id` and the creation/recording actor fields; no source enum is introduced.
- Implementation reuses the existing WP2A constraint, locking, immutability, RLS, grant and proof patterns; it may not add near-duplicate helper functions, trigger families, overlap engines, actor vocabularies or provenance vocabularies.
- Source and actor references contain no raw secrets and no PII.
- Both tables start with RLS enabled and deny-all policies.
- `PUBLIC`, `anon`, and `authenticated` receive no privileges.
- `service_role` receives exactly `SELECT` and `INSERT`, never UPDATE or DELETE.
- There are no browser writes, customer-read policies, SECURITY DEFINER RPCs or customer projections in WP2B-I.
- There is no normal hard delete. A future central retention module owns category, legal basis, holds, expiry review and action history.
- Retention design must support at least five years after the end of the relevant verification calendar year where the data falls within TKV 3.0.5, while allowing longer future terms through additive configuration. WP2B-I does not assign that period indiscriminately to unrelated customer data.

Locally proven implementation inventory:

- exactly two tables, three focused trigger functions and four triggers;
- restrictive foreign keys, thirteen checks and the targeted root, successor, FK/query and operational-overlap indexes;
- deterministic per-case `pg_advisory_xact_lock` in the BEFORE INSERT guard;
- a DEFERRABLE, INITIALLY DEFERRED AFTER INSERT constraint trigger for terminal-chain, linearness/cycle, service-recipient-cardinality and same-party/same-role overlap checks;
- RLS enabled with one `deny_all` policy per table;
- no `PUBLIC`, `anon` or `authenticated` table privileges;
- `service_role` has exactly `SELECT` and `INSERT`, never UPDATE or DELETE;
- all three trigger functions are invoker mode and have no direct client- or service-role execute grant.

Q29 and Q30 proved that two simultaneous overlapping service-recipient writes for one case are serialized by the deterministic advisory lock and that at most one transaction commits. Q31-Q33 proved that all existing `app_*` counts and protected hashes remained unchanged, the disposable proof database was removed, and both new local tables ended at zero rows.

The migration was applied directly to the local proof database state, but version `20260724110000` is absent from `supabase_migrations.schema_migrations`. This is not normal migration-tooling proof, remote apply proof or production parity. No manual history registration is claimed or recommended; a future deployment batch must prove a controlled forward-only apply and remote parity separately.

### Regulatory Versioning And Modular Extension Boundary

Future regulatory source handling has its own additive module with immutable source versions, content hashes, effective periods, requirement versions, clause traceability, applicability records and regulatory-impact decisions. A new NEa or legal-source version never overwrites historical requirements, cases, role claims or decisions. It triggers a source diff, impact analysis and, where required, re-review; it never automatically mutates core truth.

Future modules use stable IDs and additive bounded roots/history where needed. They do not mutate another module's core truth; derived projections remain derived. EAV and generic-JSON “future-proofing” are forbidden. Every module owns its contract, migration, RLS, tests, proof and traceability.

The following remain future modules and are neither schema-ready nor implemented by WP2B-I: representation authority, mandates, connection/EAN, location, MID/meter, evidence decisions, kWh, regulatory applicability, risk analysis, verification planning/execution, findings/CAPA, REV/batches, verification statements and settlement. Representation authority specifically remains `NOT SCHEMA READY`.

### Next Bounded Implementation Step

WP2B-I schema/proof is locally complete, while its migration and proof remain uncommitted. After a separately approved commit, the next gate is a choice and readiness analysis for the next NEa-driven bounded context. That choice does not automatically select or authorize representation authority while it remains `NOT SCHEMA READY`.

## Test And Proof Gates

The bounded WP2B-I schema gate is `CURRENT PROVEN — LOCAL` through the cited migration, Deno check and Q01-Q34 proof. Exact evidence and non-claims are recorded in `docs/app/proofs/wp2b-i-case-party-role-foundation.md`.

Before any runtime/customer projection or later WP2 implementation can be accepted:

- schema/source checks for exact tables, constraints, indexes, comments, RLS, grants, functions, and triggers;
- positive and negative subtype, role, period, overlap, correction, withdrawal, expiry, supersession, provenance, and idempotency tests;
- anon/authenticated denial and service-role/authorized-service tests;
- tests proving Auth user, email, account type, role title, parser output, and external observations cannot create legal identity or authority decisions;
- transaction rollback and no-partial-write proof;
- audit completeness and fail-closed proof for material authority decisions;
- customer projection redaction, ownership, non-enumeration, and cross-account isolation proof;
- migration/backfill/dual-read/cutover/rollback proof before changing current callers;
- browser proof only when a separately approved UI behavior exists;
- remote and deployment proof only under separate explicit authority.

## Deletion Prerequisites

Nothing in this contract authorizes deletion. A retirement candidate may be removed only after:

1. caller/import/reference inventory proves no required live dependency;
2. data classification, row counts, FK/dependency graph, retention/legal-hold, and audit/export needs are proven;
3. deterministic backfill plus reconciliation maps every retained record to target roots/versions/roles;
4. dual-read or adapter comparison is green for all account types and correction/history cases;
5. Auth, RLS, endpoint, dashboard, document, connection, retention, proof, and rollback paths are green;
6. legacy fallback/export and recovery obligations are replaced or intentionally retained;
7. rollback and restore are tested with preserved identifiers and evidence provenance;
8. Daan explicitly approves the bounded cutover and later the bounded deletion.

Specific prerequisites:

- `app_customer_dossiers` and dossier-shaped fields: all cases, party roles, child records, audit references, and customer projections reconciled to `app_cases`.
- `app_customers` legal/contact projection columns: party/profile/contact sources live and all readers migrated; account shell itself is not a retirement candidate.
- mandate semantics in legal acceptances: signed mandate/version/scope records live and customer copies reconciled; commercial terms records remain.
- signup write-v3 direct creation: verified intake promotion is atomic, idempotent, correction-safe, and proven for all party configurations.
- legacy dossier/session/functions: no required caller, active session, retained dossier, document/export, audit, reminder, retention, rollback, or recovery dependency remains.
- wave-1 proposals: replacement design and rollback ownership are recorded before archival/removal; proposal files are never treated as applied objects.

## WP3L Workforce And Case/Location Scope Overlay

WP3L-D01 through WP3L-D18 are APPROVED TARGET. WP3L-B implements and locally
proves a separate seven-table empty workforce authorization foundation in
commit `6485dad9a1cc481efc3f17095f90df72a219b315`.

The `app_case_location_relations` responsibility links one
`app_cases` root to one `app_locations` root for an explicit half-open workflow
scope. The relation is separate from workforce scope assignment and may be
many-to-many only through explicit rows. It proves none of:

- customer or party ownership;
- service-recipient/contact status;
- representation authority or mandate;
- EAN, aangeslotene or physical-site match;
- location observation/acceptance;
- evidence, eligibility, verifier or settlement truth.

`app_case_party_roles` remains exactly case participation. It cannot be reused
as a workforce capability or checker qualification. Representation authority
remains `NOT SCHEMA READY` and cannot replace maker/checker authority.

The locally proven workforce assignment uses only exact capability, case and
location scope. A customer identity and workforce identity may bind the same
Auth user only as independently resolved trust domains; no permission crosses
between them automatically.

The exact seven tables, six capabilities, temporal relation/scope guards,
immutable maker/checker records and self-approval rejection are
`CURRENT PROVEN — LOCAL ONLY`. All seven tables remain empty. Q01-Q48,
fresh apply and real review/execution concurrency are green.

No customer, party, case-role or representation row was converted into
workforce authority. Bootstrap, population, assignment authority, authorized
caller runtime, Edge Function, UI, remote and production remain not
implemented or unproven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## WP3O Dual-Binding And Workforce Governance Separation

WP3O remains decision-required and not implemented. The same Auth account can
technically have independently established customer and workforce bindings,
but customer bearer context grants no workforce authority and workforce
context grants no customer ownership, case-party role or representation.
Genesis and structural governance may not infer either binding from the
other.

The unapproved pilot recommendation blocks a dual-bound workforce principal
from making, checking or governing an action on its own customer, case or
location. Broader connected-party conflicts require an explicit
compliance/governance decision; no legal conflict policy is invented here.
Until decided, uncertain conflicts fail closed with anti-enumeration and no
party/customer/object detail in public output.

Case/location scope remains an operational authorization fact only. It proves
no customer ownership, representation, mandate, EAN/aangeslotene, evidence
acceptance or verifier authority. Bootstrap, population and
assignment/revocation authority remain not implemented.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

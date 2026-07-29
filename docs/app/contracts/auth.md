# App Backend Auth Schema Contract

Status: architecture source of truth for `/app` backend auth and endpoint boundaries. Some foundation pieces are implemented and locally proven; open items remain marked explicitly.

Scope: `/app` signup submit, document upload, and customer dashboard backend boundaries. This document does not itself implement endpoints, schema, migrations, auth, Supabase changes, or production wiring.

## 1. Executive Decision

Recommendation: use a hybrid auth model.

- Use Supabase Auth as the durable customer identity/session layer for the new `/app` dashboard.
- Use ENVAL-owned magic links as the product-facing login/recovery mechanism on top of Supabase Auth where possible.
- Keep all business writes behind ENVAL Edge Functions with service-role server writes, request metadata, idempotency, audit events, and explicit RLS policy review.
- Reuse old `dossier_sessions` only conceptually. Do not reuse it as the durable dashboard account/session table.

Why:

- A customer dashboard is not a one-time `dossier.html` wizard. Customers may return for requests, support, kWh input, year overview, fee/result status, and future dossiers.
- Supabase Auth gives a standard account/session boundary, recovery lifecycle, JWT claims, and RLS integration.
- ENVAL-owned magic links preserve low-friction customer UX without making a dossier-scoped token the account identity.
- Old `dossier_sessions` is scoped to one dossier, tied to `dossier.html`, and designed for short-lived wizard runtime access.

Deferred:

- Exact Supabase Auth UX: magic link only, email OTP, passwordless, or later password support.
- Exact RLS policy design.
- Admin/support auth and role management.
- Whether old users/dossiers get migrated, bridged, or kept legacy-only.
- Whether dashboard draft saving exists before final submit.

Resolved product role decision:

- ENVAL is now a customer-facing commercial ERE-E inboekdienstverlener service.
- ENVAL guides the customer-facing process toward inboeking within final regulatory, operational, and commercial terms.
- ENVAL is geen verificateur.
- ENVAL is geen certificeerder.
- ENVAL gives no guarantee of ERE award, acceptance, payout, revenue, timing, certification, or document approval.
- ENVAL keeps the internal audit/evidence layer separate from customer-facing statuses and customer timeline copy.
- The result-based fee model remains subject to final legal definition of "result", fee base, fee moment, partial success, reversal, and clawback.
- The former legacy documentation tree contained the old neutral-infrastructure position. It has been removed from the repo and is not current for `/app` implementation.

### Public Copy Boundary

The resolved product role and audit doctrine are internal, legal, terms, and auditor-facing guidance. They are not public homepage, signup, dashboard, pricing, or marketing copy.

Public copy must stay simple, commercial, customer-oriented, and customer-safe.

Public copy may say:

- "ENVAL helpt je met het aanmeld- en inboekproces."
- "Je betaalt alleen bij resultaat."
- "Geen garantie op resultaat."
- "Wij zorgen dat je dossier controleerbaar en compleet wordt opgebouwd."

Public copy must avoid:

- "anti-fraude-laag"
- "audit/evidence layer"
- "external-party audit reconstruction"
- "backend source-of-truth"
- "verificateur/certificeerder", except in legal, FAQ, or terms context

Legal/audit doctrine remains valid for internal docs, legal terms, service descriptions, and auditor-facing documentation.

## 2. Audit, Evidence & Anti-Fraud Doctrine

Frontend may assist; backend decides.

Doctrine:

1. Frontend can optimize, guide, prefill, precheck, compress, parse, and reduce latency/cost.
2. Frontend is never trusted as truth.
3. Backend must validate, normalize, authorize, hash, audit, and decide.
4. Every fraud-relevant or audit-relevant step must be server-checkable and audit-logged.
5. Audit/evidence layer is internal and technical.
6. Customer timeline/status is a curated projection, not raw audit.
7. ENVAL makes no compliance, certification, verification, or guaranteed-result claims.
8. Frontend prechecks are UX support only. They do not create final eligibility, evidence, fee, result, or acceptance truth.
9. Final lifecycle decisions must be backend/audit based.

An external-party audit must be able to reconstruct:

- who acted
- when
- from what authenticated/session context
- what was submitted
- what was transformed client-side
- what was verified server-side
- what was accepted or rejected
- what evidence, hash, version, and legal text were used
- what result or fee event was later based on

Fraud controls are backend concerns:

- idempotency
- rate limits and abuse controls
- document hash confirm
- immutable document/evidence versions
- legal text versioning
- fee terms versioning
- MID/year claim discipline
- support correction and revision flow
- anti-enumeration for recovery
- RLS and server-only sensitive tables
- raw audit not exposed to customers

## 3. Auth Model

### Current App Auth Foundation

Status: CURRENT / LOCAL PROOF.

CURRENT / LOCAL PROOF:

- `requireVerifiedSupabaseAuthUser` validates a Supabase Auth bearer token through `serviceClient.auth.getUser`.
- `requireVerifiedSupabaseAuthUser` returns only a verified Auth user ID and normalized verified email for backend use.
- `requireAppCustomer` resolves an already-bound active `app_customer_identities` row, active `app_customers` row, and customer actor reference.
- `requireAppDossierAccess` authorizes dossier ownership through `app_customer_dossiers`.
- `api-app-auth-bootstrap` is implemented and locally gateway-proven.
- `api-app-auth-bootstrap` binds one existing eligible pre-auth `app_customer_identity` to the verified Supabase Auth user.
- `app_bootstrap_customer_auth_v1` is the atomic binding RPC.
- The bootstrap response returns account-neutral accessible dossier summaries.
- The flow is account-type neutral across particulier, zakelijk, and VVE.
- `api-app-document-upload-url` and `api-app-document-upload-confirm` auth regressions are locally proven after bootstrap binding.
- The helper and bootstrap flow do not reuse legacy `dossier_sessions`, legacy dossier tokens, custom raw JWT decoding, or browser storage.
- Bootstrap does not create a customer, identity, dossier, or Auth session.
- Bootstrap does not automatically merge customers or identities.
- Ambiguous identity state and identities bound to another Auth user fail safely.
- `/account` is implemented for customer account creation and sign-in.
- The frontend uses one shared Supabase browser client singleton.
- Frontend session initialization, Auth state subscription, session restoration, and logout are implemented locally.
- The frontend calls `api-app-auth-bootstrap` after a verified Auth session and deduplicates bootstrap calls for the same session.
- `/dashboard` is protected by the frontend route guard.
- Auth error mapping is customer-safe for the current local flow.
- Auth code remains account-type neutral across particulier, zakelijk, and VVE.
- Auth/Supabase frontend code is lazy-loaded only for `/account` and `/dashboard`.
- Public pages do not need live Auth state and do not eagerly initialize Supabase Auth.
- The frontend does not use polling, custom refresh loops, or manual access-token/refresh-token persistence.

OPEN:

- Password recovery.
- Resend verification UX.
- Production Auth configuration and proof.
- Support flow for:
  - identity not found
  - already bound to another user
  - ambiguous identity
  - inactive customer
- Remote deployment and remote auth proof.

### Terminal Bootstrap Cleanup

Status: CURRENT / LOCAL PROOF.

Terminal ENVAL binding errors:

- `customer_identity_not_found`
- `customer_identity_already_bound`
- `customer_identity_binding_ambiguous`
- `customer_inactive`
- `customer_dossier_not_found`

Behavior:

- The current account attempt receives one safe customer-facing error.
- The unusable local Supabase Auth session is ended through the official Supabase Auth client.
- Page remount or refresh starts from a clean signed-out account form.
- Retryable service failures preserve the session and retry path.
- Explicit logout clears the in-memory dashboard cache.
- Valid linked sessions remain persistent and restore normally.

Not all Auth errors sign the user out. Only terminal ENVAL bootstrap binding failures use this cleanup path.

### Target Email Verification Promotion Boundary

Status: TARGET / NOT IMPLEMENTED. Detailed contract: `docs/app/contracts/intake-verification-promotion.md`.

Email verification in the target public intake flow:

- validates control of the submitted email identity;
- triggers server-side promotion of a finalized pre-auth intake;
- does not approve documents, evidence, eligibility, ERE result, or fees;
- does not replace backend validation, audit, idempotency, or server-side promotion checks.

Pre-auth intake and quarantine boundaries:

- public intake upload must use a separate private quarantine capability, not the authenticated `api-app-document-*` endpoints;
- email address alone must not authorize document upload, document read, dashboard access, or mutation;
- frontend hiding is never an authorization boundary;
- authenticated dashboard document upload remains separate and requires the current Supabase Auth/app customer boundary.

### Customer Identity

Target customer identity:

- `customers`: ENVAL customer record.
- `customer_identities`: links a customer to Supabase Auth user ID, verified email, phone if later used, and identity metadata.
- A customer can have multiple dossiers over time.
- A dossier belongs to one customer, with explicit future support for delegated access if needed.

Identity rules:

- Normalized email is not enough as auth truth.
- Supabase Auth user ID should be the durable login identity once backend is implemented.
- Customer records must not be created repeatedly on duplicate/retried signup submit.

### Login And Recovery

Recommended login flow:

1. Customer submits `/aanmelden`.
2. Backend creates or matches customer and creates dossier.
3. Backend sends dashboard access email.
4. Link signs the customer into Supabase Auth or exchanges through a narrow ENVAL auth bootstrap endpoint that creates a Supabase Auth session.
5. Dashboard reads through app-specific Edge Functions.

Recovery:

- Recovery starts with email.
- Responses must avoid user/dossier enumeration.
- Recovery may issue a new dashboard magic link.
- Recovery must audit attempts without storing raw secrets.

### Session Model

Target:

- Browser session is Supabase Auth session once implemented.
- Business endpoints authorize by current authenticated customer and dossier access.
- Avoid `localStorage` for custom business tokens unless an explicit security review allows it.

Legacy:

- `dossier_sessions` and `enval_session_token:<dossier_id>` are old wizard runtime auth.
- They are useful as a reference for token hashing, expiry, revoke, actor refs, and scoped idempotency.
- They are insufficient for customer dashboard identity because they are dossier-scoped, not customer-scoped, and were stored as a convenience token for `dossier.html`.

### Legacy Supabase Functions Freeze Rule

Legacy Supabase functions are frozen.

- `api-dossier-*` remains fallback/legacy only.
- `api-lead-submit` remains legacy lead/contact intake only.
- `mail-worker`, `retention-worker`, and `locked-unpaid-reminder-worker` remain legacy worker/fallback only.
- Do not add new `/app` behavior to legacy functions.
- Do not reuse legacy dossier sessions as app account auth.
- Do not write app audit/idempotency to legacy `dossier_audit_events` or `idempotency_keys`.
- New customer-facing app behavior must use `api-app-*`.
- New app writes must target app_* tables.
- Deletion or retirement requires separate proof and an explicit commit.

### Dashboard Access

Dashboard access must be computed from:

- authenticated customer identity
- dossier ownership or explicit access grant
- dossier visibility/status
- role, if support/admin/internal access is later added

Customer dashboard endpoints must never trust a client-supplied `customer_id`.

### Support/Admin Boundary

Customer and ENVAL support/admin access are separate concerns.

- Customer dashboard: customer identity, customer-owned dossiers only.
- Support/admin tooling: separate role model, likely separate internal route/app area.
- Support/admin actions must produce internal audit events and, where relevant, customer-readable timeline events.
- Do not expose internal ENVAL review controls in customer dashboard until role-based access is implemented.

## 4. New Backend Contract Boundary

All names below are conceptual. Do not create functions until contracts and schema are accepted.

| Endpoint | Purpose | Auth | Idempotency | Audit | Visibility | Old pattern reuse |
|---|---|---|---|---|---|---|
| `api-app-signup-submit` | Accept normalized `/aanmelden` payload and create/match pre-auth customer, identity, dossier, locations, chargers, document slots, and legal/fee acceptance. | Public pre-auth with abuse controls; creates pre-auth app customer/identity/dossier state. It does not create Auth users or Auth sessions. | Required. | Required for rejects and writes; pre-dossier rejects go to intake audit. | Customer-facing submit. | Adapt `api-lead-submit` idempotency, audit, mail queue; replace old payload and `/dossier.html` link. |
| `api-app-auth-bootstrap` | Authenticated CORE endpoint that validates a verified Supabase Auth user, derives verified email server-side, binds an existing pre-auth app identity, and returns accessible customer dossier summaries. It does not create customers, dossiers, or Auth sessions. | Supabase Auth customer session plus service-role RPC binding. | Required. | Required. | Customer-visible account activation/bootstrap. | New app endpoint. Does not reuse legacy dossier sessions. |
| `api-app-dashboard-get` | CURRENT / LOCAL PROOF. Pure authenticated read endpoint for customer-safe dossier summaries, selected dossier, locations, chargers, document slots/current document state, and legal acceptance summaries. | Supabase Auth customer session through `requireAppCustomer` and `requireAppDossierAccess`. | Not required for pure read. | No successful-read audit write; scoped rejects may use safe fail-open audit. | Customer-visible. | New app endpoint. Does not use legacy dossier sessions or legacy read endpoints. |
| `api-app-document-upload-url` | Issue signed upload URL for a document slot/request response. | Supabase Auth customer session and dossier access. | Required. | Required. | Customer-visible action. | Adapt `api-dossier-upload-url`; replace old doc type rules. |
| `api-app-document-upload-confirm` | Confirm uploaded file with server-side SHA-256 and create document version/file record. | Supabase Auth customer session and dossier access. | Required. | Required. | Customer-visible action. | Keep/adapt `api-dossier-upload-confirm` hash-confirm pattern. |
| `api-app-document-download-url` | Resolve the current document server-side and issue a short-lived signed download URL. | Supabase Auth customer session and dossier access. | Not required for pure read. | No successful-read audit write. | Customer-visible action. | New app endpoint. Does not expose legacy sessions or storage internals. |
| `api-app-document-withdraw-current` | Withdraw the current document before lock/finalization while preserving immutable evidence. | Supabase Auth customer session and dossier access. | Required. | Required. | Customer-visible action. | New app endpoint. No hard delete and no customer-supplied file/version/storage internals. |
| `api-app-customer-request-create` | ENVAL creates a request for missing information, correction, document, consent, or kWh. | Internal/support/admin only. | Required. | Required. | Internal action; customer sees resulting request. | Adapt audit/mail queue pattern. |
| `api-app-customer-request-respond` | Customer responds to a request with text, upload link, data correction, or kWh value. | Supabase Auth customer session and dossier access. | Required. | Required. | Customer-visible action. | Adapt session-scoped idempotency and status transition audit. |
| `api-app-support-message-create` | Create a customer/support message in a support thread. | Customer session or support/admin role depending actor. | Required for sends. | Required. | Customer-visible thread; internal metadata hidden. | Adapt outbound email notification, not old raw mail body as source of truth. |
| `api-app-kwh-submit` | Submit yearly kWh manually for a dossier/charger/period. | Supabase Auth customer session and dossier access. | Required. | Required. | Customer-visible action. | New contract; may reuse validation/audit discipline. |
| `api-app-result-event-read` | Read customer-safe result/value realization status. | Supabase Auth customer session and dossier access. | Not required for read. | Reject audit required; read audit optional. | Customer-visible. | Adapt export/read model concepts. |
| `api-app-fee-event-read` | Read customer-safe fee status and fee calculation summary. | Supabase Auth customer session and dossier access. | Not required for read. | Reject audit required; read audit optional. | Customer-visible. | New contract; must align with fee terms. |

Contract rules:

- No direct `/app` calls to old `api-dossier-*` unless a future wrapper/redesign explicitly maps old state into the new contract.
- Frontend may assist; backend decides.
- Writes require server-side validation and service-role execution.
- Writes require `Idempotency-Key`.
- Customer-facing errors must be concise and must not expose SQL, RLS, storage paths, or internal audit payloads.
- Internal-only endpoints must be impossible to call as a customer role.

## 5. Future Schema Modules

| Module | Purpose | Customer-visible | Audit relevance | Old reuse | Risks |
|---|---|---:|---|---|---|
| `customers` | Canonical ENVAL customer record. | Partly | High | Replace `dossiers.customer_*` duplication. | Duplicate matching, PII minimization. |
| `customer_identities` | Link customer to Supabase Auth user/email/phone. | No | High | Replace dossier token identity. | Auth/RLS drift. |
| `customer_sessions` or Supabase Auth mapping | Durable dashboard session/access model. | No | High | Conceptually adapt `dossier_sessions`; do not reuse directly. | Token storage, revocation, impersonation. |
| `customer_dossiers` | Customer-owned dossier lifecycle. | Yes | High | Replace/adapt `dossiers`. | Status drift and migration coexistence. |
| `dossier_assets` | Optional asset grouping across locations/chargers/dossiers. | Maybe | Medium | New. | Over-modeling too early. |
| `dossier_locations` | One or more addresses per dossier. | Yes | High | Replace single `dossiers.address_*`. | Address proof and PDOK metadata consistency. |
| `dossier_chargers` | Chargers under locations with catalog/manual fields. | Yes | High | Adapt old `dossier_chargers`. | MID/serial duplicates, location mapping. |
| `document_slots` | Required/optional evidence slots before file exists. | Yes | High | Replace implicit old doc type rules. | Wrong requirements create support load. |
| `document_files` | Uploaded file metadata and storage reference. | Yes, summarized | High | Adapt `dossier_documents`. | Storage leakage, file access scope. |
| `document_versions` | Replacement/version history per slot. | Yes, summarized | High | Extend old one-doc model. | Confusing latest vs historic evidence. |
| `customer_requests` | ENVAL asks customer for action/information. | Yes | High | New; adapt audit/mail pattern. | Email vs dashboard source of truth. |
| `request_responses` | Customer answers requests. | Yes | High | New. | Partial responses, duplicate submits. |
| `support_threads` | Conversation container. | Yes | Medium | New; mail queue only not enough. | Support messages becoming legal record unintentionally. |
| `support_messages` | Customer/support messages. | Yes | Medium | New. | Privacy and moderation. |
| `legal_text_versions` | Version/hash/language of legal and commercial text. | No, labels only | High | Replace fixed `v1.0` consent. | Legal copy drift. |
| `consent_acceptances` | Accepted processing/control/mandate/no-guarantee consent records. | Yes, summarized | High | Replace `dossier_consents`. | Withdrawal/change handling. |
| `fee_terms_acceptances` | Accepted 10% success fee terms/version. | Yes | High | New. | Fee trigger/gross-net/VAT/clawback ambiguity. |
| `review_tasks` | Internal ENVAL review work. | No | High | Adapt `dossier_checks` concept. | Internal state leaking to customers. |
| `review_findings` | Evidence/review findings. | Sometimes summarized | High | Adapt analysis/check concepts. | Automated finding mistaken for decision. |
| `kwh_periods` | Period/year requiring kWh input/readout. | Yes | High | New. | Wrong claim year. |
| `kwh_readings` | Manual or provider-sourced kWh values. | Yes | High | New. | Source trust and corrections. |
| `kwh_evidence` | Uploaded/readout evidence for kWh. | Yes, summarized | High | Adapt document slots/files. | Provider integration uncertainty. |
| `result_events` | Value/result lifecycle events. | Yes, summarized | High | Adapt export/preservation concept. | Guarantee/claim language. |
| `fee_calculation_events` | Fee calculation, fee due, settlement states. | Yes, summarized | High | New. | Commercial/legal disputes. |
| `customer_timeline_events` | Curated readable customer timeline. | Yes | Medium | Projection from audit, not raw audit. | Hiding too much or exposing too much. |
| `retention_minimization_events` | Cleanup/minimization proof and lifecycle. | No, sometimes status | High | Adapt `retention_cleanup_events`. | PII in tombstones, premature deletion. |

## 6. Signup Submit Contract

Target normalized payload from `/aanmelden`:

```ts
type AppSignupSubmitPayload = {
  accountType: "particulier" | "zakelijk" | "vve";
  applicant: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    language?: "nl" | "en";
  };
  organization: null | {
    type: "business" | "vve";
    name: string;
    kvkNumber: string;
  };
  primaryAddress: AppAddressPayload;
  locations: AppLocationPayload[];
  chargers: AppChargerPayload[];
  documentSlots: AppDocumentSlotPayload[];
  consentBundleAcceptance: {
    accepted: true;
    sourceSurface: "/aanmelden";
    visibleTextVersion: string;
    language: "nl" | "en";
  };
  feeTermsAcceptance: {
    accepted: true;
    feeModelVersion: string;
    successFeePercentage: 10;
    sourceSurface: "/aanmelden";
  };
  metadata: {
    clientSubmitId: string;
    clientGeneratedAt: string;
    appVersion?: string;
  };
};
```

Address payload:

- client address/location ID where relevant
- postcode
- house number
- suffix
- street
- city
- country
- lookup provider: currently `pdok`
- provider ID/BAG ID if available
- normalized lookup key
- lookup resolved timestamp if available

Location payload:

- stable client location ID
- address payload
- customer-facing label if provided later

Charger payload:

- stable client charger ID
- client location ID
- source: `manual` or `import`
- brand value and optional `manualBrand`
- model value and optional `manualModel`
- installation year
- MID number
- serial number
- optional backend supplier value and optional `manualBackendSupplier`
- solar panel/exportability status

Document placeholder payload:

- stable client document slot ID
- slot type
- required/optional
- scope: dossier, organization, location, charger, request, or kWh period
- linked client IDs
- customer-facing label
- no raw file bytes in submit unless a future contract explicitly adds pre-upload

Reject before dossier create:

- invalid JSON or unsupported schema version
- missing/invalid account type
- invalid email
- missing required applicant names
- missing required company/VVE data for zakelijk/VVE
- invalid KVK format where required
- impossible location/charger relationships
- no charger
- missing required charger brand/model/MID/serial/installation year
- invalid required address fields
- unsupported legal/fee text version
- missing consent bundle acceptance
- missing fee terms acceptance
- duplicate client IDs within payload
- duplicate idempotency key already bound to incompatible payload

Do not reject solely because:

- backend supplier is empty
- optional manual backend supplier is empty when no custom supplier is selected
- selected files are not uploaded yet, unless final product decides files are mandatory at submit
- PDOK was temporarily unavailable, if customer can still submit and ENVAL reviews address evidence later

Creates on successful submit:

- customer and identity mapping
- customer dossier with initial status `submitted`
- primary location and additional locations
- chargers under locations
- document slots
- legal/consent/fee acceptance records
- internal audit events
- customer timeline events
- dashboard access/bootstrap email record
- review task or queue item
- retention class

Must be idempotent:

- full submit request by `Idempotency-Key`
- customer matching by normalized identity rules
- client location IDs
- client charger IDs
- client document slot IDs
- dashboard access email issuance must not duplicate on retry

## 7. Dashboard Read Model

`/dashboard` should read a customer-safe projection, not raw database tables.

Read model should include:

- customer profile summary
- active dossiers
- dossier status and customer-facing substatus
- charger rows with location, status dots/pills, MID status, and kWh status
- location/address summaries
- document/request status summaries
- open customer requests
- support thread summary and unread/last-message state
- accepted legal/fee/consent summary
- customer-readable timeline
- history: previous periods, closed dossiers, year overviews
- settings/logout metadata
- result and fee summaries where available

Hard rule:

- Do not expose raw internal audit events directly to customers.
- `customer_timeline_events` must be curated/readable projection from internal events and review decisions.
- Customer timeline copy must stay separate from internal audit/evidence truth.
- Internal actor refs, request IDs, IP, UA, storage paths, SQL errors, and raw analysis payloads stay internal.

## 8. Audit And Lifecycle

### Internal Audit Events

Internal audit should remain richer than customer timeline.

Events should cover:

- `app_signup_submit_received`
- `app_signup_submit_rejected`
- `customer_created_or_matched`
- `customer_identity_linked`
- `customer_dossier_created`
- `dossier_location_created`
- `dossier_charger_created`
- `document_slots_created`
- `consent_acceptance_recorded`
- `fee_terms_acceptance_recorded`
- `dashboard_access_issued`
- `customer_request_created`
- `customer_request_responded`
- `support_message_created`
- `document_upload_url_issued`
- `document_upload_confirmed`
- `review_task_created`
- `review_finding_recorded`
- `human_review_decision_recorded`
- `kwh_period_opened`
- `kwh_reading_submitted`
- `result_event_recorded`
- `fee_calculation_recorded`
- `retention_minimization_started`
- `retention_minimization_completed`

### Customer Timeline Events

Examples:

- Dossier gestart
- Gegevens ontvangen
- Dashboardtoegang aangemaakt
- Adresgegevens ontvangen
- Laadpaalgegevens ontvangen
- Document gevraagd
- Document ontvangen
- ENVAL vraagt aanvullende informatie
- Reactie ontvangen
- Dossier in beoordeling
- kWh gevraagd
- Jaaroverzicht beschikbaar
- Resultaat verwerkt

### Pre-Dossier Rejects

Rejects before dossier creation must go to a pre-dossier intake audit table or equivalent privacy-conscious log.

Rules:

- Avoid raw PII where possible.
- Store reason/stage/status/request metadata.
- Do not create dead dossiers for clearly invalid/ineligible payloads.

### Post-Dossier Writes

All post-dossier writes must:

- authorize against customer identity and dossier access
- validate server-side
- write internal audit events
- update customer timeline only when customer-readable
- use idempotency for mutation

### Document Lifecycle

Document lifecycle:

1. slot created
2. upload URL issued
3. file uploaded to signed URL
4. server confirms file exists
5. server computes SHA-256
6. document file/version confirmed
7. ENVAL review accepts, rejects, or asks for replacement
8. customer download and withdrawal actions stay behind authenticated app endpoints

`issued` is not the same as `confirmed`.

Current document mutation boundary:

- Customer document upload/download/withdrawal is authenticated.
- Customer cannot provide file IDs, version IDs, storage bucket/path, or customer identity values.
- `document_changes_allowed` is derived server-side and controls document mutation availability.
- Withdrawal marks the current version withdrawn, clears current slot pointers, preserves file/version evidence, and writes audit.

### Retention / Minimization

Retain as little as possible for unfinished or abandoned dossiers.

Retention classes should include:

- unsubmitted draft if backend drafts exist later
- submitted pending review
- needs customer action/no response
- withdrawn
- rejected/paused
- successful/result dossier
- legal/fee/audit evidence

Use privacy-hard tombstones for cleanup proof. Do not store PII or raw storage paths in tombstones.

### Export / Preservation / Revision

Future final artifacts:

- audit package
- year overview
- result snapshot
- fee calculation snapshot

Post-export correction policy must be defined before production:

- immutable correction event
- superseded export/result snapshot
- clear customer timeline
- no silent mutation of prior final artifacts

### Yearly MID / Result Claim Policy

Before result/fee lifecycle:

- define claim year
- define MID uniqueness/conflict policy per year
- define correction/reversal process
- define how manual review overrides automated checks

### Fee / Result Lifecycle

Fee events must align with `docs/app/legal/fee-model-and-service-terms.md`.

Required concepts:

- value realized
- fee base
- success fee percentage: 10
- fee due
- partial success
- reversal/clawback
- settlement/payout
- customer-visible fee summary
- internal audit trail for fee-relevant changes

## 9. Migration / Coexistence Strategy

Recommendation:

- Keep old backend untouched.
- Keep root/static production untouched.
- Create new schema alongside old schema if safer.
- Bridge only after contracts and tests are stable.
- Do not destructively clean old tables or endpoints until the new backend is proven and production migration is explicitly approved.
- Do not call old `api-dossier-*` endpoints from `/app` directly.
- If an old function is reused, wrap/redesign it under an `api-app-*` contract and document the mapping.
- Existing `dossier.html` remains source material and production fallback until explicit cutover.

Coexistence phases:

1. New docs and contracts.
2. New schema design.
3. New migrations in isolated tables.
4. New `api-app-*` endpoints.
5. `/app` backend integration in local/dev only.
6. Migration/cutover plan.
7. Production switch only after approval.

## 10. Risks / Open Decisions

- Legacy wording drift has been removed from the repo; current `/app` direction resolves ENVAL as a customer-facing ERE-E inboekdienstverlener service.
- Auth production risk: Supabase Auth configuration, recovery, redirects, RLS, and support access still need production proof.
- RLS risk: service-role Edge writes are safer for writes, but customer reads still need strict access boundaries.
- Duplicate customer/dossier creation: signup retries and repeated emails need deterministic idempotency/dedupe.
- Legal versioning risk: bundled frontend acceptance may later need split consent records.
- Fee terms risk: exact success trigger, fee base, VAT/tax, partial success, reversal, and clawback are not final.
- Evidence integrity risk: slots, files, versions, replacements, and review decisions must stay linked.
- Customer-visible vs internal audit confusion: customer timeline is not raw audit.
- Support correction after export: needs immutable revision/supersede policy.
- MID/year claim/revision risk: claim year and MID conflict rules must be explicit.
- Multi-location mapping risk: zakelijk/VVE locations and chargers must preserve stable IDs and address proof.
- Backend supplier/provider risk: provider connection flow for kWh readout still needs research.
- Direct PDOK client lookup risk: production browser/CORS behavior must be tested; backend submit still validates.

## 11. Recommended Implementation Sequence

1. Wire one authenticated PDF installation-invoice document slot to the shared upload client.
2. Refresh only the selected dashboard dossier after upload confirm.
3. Add password recovery and resend-verification UX.
4. Prove production Auth URL/redirect configuration.
5. Implement support/messages/kWh/result/fee lifecycle.
6. Plan production migration/cutover separately; keep old root/static production untouched until approved.

## 12. WP3K Operations-Caller Authentication Boundary

Status: HISTORICAL WP3K READINESS; TARGET DECISIONS APPROVED, CALLERS NOT
IMPLEMENTED. Detailed readiness evidence:
`docs/app/operations/wp3k-location-caller-boundary-readiness.md`.

The current Auth foundation proves customer authentication only:

- `requireVerifiedSupabaseAuthUser` proves a server-verified Supabase Auth
  user ID and verified e-mail;
- `requireAppCustomer` binds that user to one active customer identity and
  customer account;
- `requireAppDossierAccess` proves ownership of a current customer dossier.

None proves workforce identity, internal role, reviewer qualification,
case/location scope, representation authority or four-eyes. Current code uses
no JWT role, `app_metadata`, `user_metadata`, AAL or other claim as operations
authorization.

Future internal location callers must keep these layers separate:

1. server-verified principal;
2. separately approved active workforce identity;
3. closed internal capability/role assignment;
4. exact case/location object scope;
5. separately evaluated representation context where required;
6. evidence/location decision authority;
7. independent maker/checker for material acceptance/correction.

The WP3K-recommended direction, later approved as TARGET shape, composes the
existing verified-bearer primitive with a focused future
`_shared/app_workforce_authorization.ts` helper. The customer-specific helper
must not be broadened into a mixed customer/workforce role resolver. WP3L-B
now proves the bounded database objects and closed capability vocabulary
locally; the runtime helper and authorized caller remain not implemented.

`service_role` remains a technical database credential and is never a human
identity or role. Browser input may not authoritatively select `actor_ref`,
role/capability, object scope or authorization outcome.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-PARTY-01A Auth Bootstrap V3

CURRENT PROVEN — LOCAL ONLY.

`api-app-auth-bootstrap` now invokes service-role-only
`app_bootstrap_customer_auth_v3`. V3 calls the unchanged v2 RPC in the same
transaction and then creates or resolves one canonical party root plus the
existing non-authoritative `account_owner` service relationship. V1 and v2
remain present and fingerprint-unchanged.

The response remains exactly the safe v2 shape and mode. It exposes no party
ID/kind, provenance, relationship, profile, role or authority data. Party or
audit failure rolls back new Auth binding, case activation and idempotency
from that attempt.

Auth proves account access only. This activation creates no legal identity,
profile fact, case role, representation authority or mandate. Frontend,
browser-live, remote and production remain unchanged/open.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 16. WP3O Proposed Genesis And Structural Workforce Governance Boundary

Status: DRAFT / DECISION REQUIRED / NOT IMPLEMENTED.

Genesis cannot derive approval from an empty workforce chain. The unapproved
pilot recommendation is therefore a single-use environment-specific
CLI/runbook ceremony with a designated executor and independent checker. One
narrow service-role-only RPC would live-check two existing verified Auth
accounts and atomically create an active split governance pair. Neither
principal receives location capabilities or operational scope from genesis.

After genesis, identity lifecycle, capability lifecycle and scope lifecycle
would use separate purpose-specific prepare/review/execute contracts with
active distinct workforce principals and execution-time revalidation.
Customer Auth/bootstrap, customer ownership, case-party roles,
representation, JWT metadata, e-mail and technical `service_role` never confer
workforce governance. A technically dual-bound Auth account retains two
independently resolved trust domains; no right crosses automatically.

Browser self-enrollment, a permanent bootstrap endpoint, fixed Auth IDs,
generic admin/RBAC, emergency override and direct structural service-role
inserts remain prohibited. Connected-party conflict policy and all
implementation, population, remote and deployment gates remain open.
Evidence:
`operations/wp3o-workforce-bootstrap-assignment-authority-readiness.md`.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 13. WP3L-B Workforce Authorization Foundation

CURRENT PROVEN — LOCAL ONLY — WP3L WORKFORCE AUTHORIZATION FOUNDATION / BOOTSTRAP, POPULATION, AUTHORIZED CALLERS, REMOTE APPLY AND CUTOVER NOT IMPLEMENTED

WP3L-D01 through WP3L-D18 are APPROVED TARGET. Commit
`6485dad9a1cc481efc3f17095f90df72a219b315` implements and locally proves the
exact seven-table empty workforce authorization foundation. Auth remains the
credential layer only; an Auth binding row is not populated by the migration.

The bounded model has separate immutable workforce roots, append-only
lifecycle events, closed capability assignments, explicit temporal
case/location relations, explicit workforce scope assignments, immutable
maker requests and immutable checker reviews. The exact six capabilities are:

- `location.root.create`;
- `location.observation.record`;
- `location.version.accept.prepare`;
- `location.version.accept.approve`;
- `location.version.correct.prepare`;
- `location.version.correct.approve`.

No e-mail, name, human title, customer ID, party role or JWT role claim is an
authorization key. A single Auth user may later have both customer and
workforce bindings only when both trust domains are independently resolved;
neither binding inherits the other's authority.

The local database proves active/suspended/revoked lifecycle, temporal
capability and scope truth, distinct maker/checker review, self-approval
rejection, and execution-time revalidation. Three operation trigger
entrypoints are `SECURITY DEFINER` with empty search path; six guards are
invoker functions. Browser roles have no table access and `service_role` has
only table `SELECT, INSERT`, with no direct guard execute.

`WP3L-B-Q01` through `WP3L-B-Q48` pass, including a rolled-back
`SET LOCAL ROLE service_role` trigger route and real review/execution races.

Bootstrap and population are not implemented. No fixed or hardcoded Auth user,
workforce identity, seeded capability or admin exists. Assignment-authority
runtime, authorized Edge callers, shared runtime authorization helper,
automatic WP3J execution, remote apply and cutover remain not implemented.
The next readiness batch is
`WP3M — authorized operational location callers and WP3J execution bridge readiness`.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 14. WP3M Proposed Workforce Caller Authentication Boundary

DRAFT — WP3M AUTHORIZED OPERATIONAL LOCATION CALLERS AND WP3J EXECUTION BRIDGE — DECISION REQUIRED

`requireVerifiedSupabaseAuthUser()` is reusable only to verify a bearer and
derive `auth.users.id`. The database must resolve that ID to exactly one
active workforce identity and exact active capability/scope. Edge input may
not select a workforce identity, capability, scope assignment, checker or
execution outcome.

The recommended shared helper
`supabase/functions/_shared/app_workforce_authorization.ts` is not
implemented or approved. Its bounded role is bearer resolution, request
metadata, input normalization/canonical hashing, safe error mapping and one
compile-time bridge-RPC call. It may not query raw workforce tables as a local
authorization engine. `requireAppCustomer()` and
`requireAppDossierAccess()` remain customer-only and are rejected for
workforce authorization.

The proposed database resolver and eight bridge RPCs remain unimplemented.
Bootstrap, population, assignment authority, fixed Auth identities, seeded
admin and browser self-enrollment remain prohibited/not implemented.
Readiness evidence:
`operations/wp3m-location-callers-execution-bridge-readiness.md`.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 15. WP3N Workforce Caller Authentication Boundary

CURRENT PROVEN — LOCAL ONLY — WP3N OPERATIONAL LOCATION CALLERS AND EXECUTION BRIDGE / WORKFORCE BOOTSTRAP, POPULATION, ASSIGNMENT AUTHORITY, OPERATIONS UI, REMOTE APPLY AND CUTOVER NOT IMPLEMENTED

The shared `app_workforce_authorization.ts` adapter now verifies the bearer,
derives `auth.users.id`, normalizes/hashes bounded inputs and invokes only the
compile-time mapped bridge RPC. It queries no WP3L authorization table and
owns no workforce truth.

The private
`app_ops_location_authorization_resolve_v1(uuid, text, uuid, uuid,
timestamptz)` resolver maps the verified Auth UUID to current active workforce
identity, exact capability, exact case/location scope and relation inside the
database transaction. It has no direct execute grant for `PUBLIC`, `anon`,
`authenticated` or `service_role`. The eight public bridge RPCs are
`SECURITY DEFINER`, have empty search paths and grant execute only to
`service_role`.

No customer identity, dossier access, case-party role, representation
authority, JWT metadata or browser field confers workforce authority. No
hardcoded Auth ID, bootstrap identity, seeded admin or self-enrollment exists.
The real seven-table local workforce foundation remains empty.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
## PILOT-CASE-01 Auth Bootstrap V2

CURRENT PROVEN — LOCAL ONLY.

`api-app-auth-bootstrap` now calls service-role-only
`app_bootstrap_customer_auth_v2`. V2 calls the unchanged v1 binding RPC inside
the same transaction, then creates or resolves exactly one immutable case for
each bound customer's current dossier where `minimized_at is null` and
`status <> 'expired_minimized'`. Case/audit failure rolls back the binding and
success idempotency.

Each safe dossier summary adds strict `case_id` and deterministic
`case_reference`; source and audit metadata remain internal. The client
validates both fields and constructs no fallback. The v1 function remains
present and fingerprint-unchanged.

The case proves no party identity, case role, representation, authority,
mandate or workforce authorization. Browser-live, remote and production
proof remain OPEN.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
## PILOT-SIGNUP-ATOMIC-01 Pre-Auth Transaction Boundary

CURRENT PROVEN — LOCAL ONLY.

The public signup gateway remains anonymous and uses a server-side service
credential, but now delegates all business, audit and idempotency mutation to
exactly one `SECURITY DEFINER` function:
`app_submit_signup_v4(jsonb)`. Execute is granted only to `service_role`;
`PUBLIC`, `anon` and `authenticated` have no execute.

This pre-auth flow creates the same technical customer identity handle used
by later verified Auth bootstrap. It does not verify identity, bind an Auth
user, activate a party profile, establish representation or grant authority.
The public response remains the current `write_v3` shape.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

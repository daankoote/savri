# Signup Submit And Dashboard Contract

Status: source of truth for the `/aanmelden` submit and dashboard bootstrap contract.

This document defines the intended backend contract for the moment a customer clicks `Start dossier` in the new Vite `/aanmelden` flow. Current implementation status is tracked below; this document remains the contract source of truth, not an implementation file.

## 1. Purpose

This document defines:

- the current submit contract for the `/aanmelden` frontend submit flow
- how submit creates or starts the customer dashboard/dossier lifecycle
- the records the backend should create conceptually
- the still-open dashboard bootstrap behavior after submit
- the open decisions that must be resolved before production use

The old `dossier.html` wizard and current `api-dossier-*` endpoints are source material only. They must not be wired directly into the new app without contract redesign.

Target intake quarantine, email verification, and promotion are defined separately in `docs/app/contracts/intake-verification-promotion.md` as TARGET / NOT IMPLEMENTED. That target contract supersedes any future design that would require every customer to submit the full dossier again in the dashboard.

09B1 update: the active document-first journey now uses `api-app-signup-intake-start`, `api-app-signup-upload-url`, and `api-app-signup-upload-confirm` only for a collecting pre-auth intake and private quarantine files. It does not invoke `api-app-signup-submit`, create a dossier, or bootstrap dashboard access. Actual signing remains 09B2; verified promotion and dashboard projection remain 09C.

## Implementation Status

`api-app-signup-submit` write v3 endpoint is implemented and locally proven.

Current write v3 behavior:

- creates or matches a customer by normalized email
- creates an `app_customer_identities` row when needed
- creates an `app_customer_dossiers` submitted dossier shell
- creates `app_dossier_locations` from normalized payload locations or a fallback primary/applicant address
- creates `app_dossier_chargers` from nested or top-level charger payloads
- creates expected `app_dossier_document_slots`
- creates `app_dossier_legal_acceptances` for accepted consent/fee/legal items
- writes scoped `app_idempotency_keys`
- writes `app_intake_audit_events` and `app_audit_events`
- returns `mode: "write_v3"`, `request_id`, `customer_id`, `dossier_id`, `location_count`, `charger_count`, `document_slot_count`, `legal_acceptance_count`, and `payload_hash`
- replays the same stored response for the same idempotency key and same payload
- returns `idempotency_conflict` for the same idempotency key with a different payload

Current write v3 intentionally does not create document uploads, storage objects, customer timeline, support/messages, or kWh/result/fee lifecycle rows.

Current customer Auth bootstrap sequence:

1. Signup write v3 creates the pre-auth customer, identity, dossier, location, charger, document-slot, and legal-acceptance structure.
2. The customer creates an account or signs in through `/account`.
3. The frontend gets a verified Supabase Auth session and calls `api-app-auth-bootstrap`.
4. `api-app-auth-bootstrap` derives the verified Auth user ID and verified email server-side.
5. Bootstrap binds or resolves the existing eligible `app_customer_identity`.
6. Bootstrap returns customer-visible accessible dossier summaries.
7. The protected `/dashboard` route opens after a valid Auth/bootstrap state.
8. `api-app-dashboard-get` returns the customer-safe dossier projection.
9. The dashboard frontend renders the real factual app-backed projection.
10. Unsupported domains remain unavailable rather than mocked.

Backend bootstrap is CURRENT / LOCAL PROOF.

Customer-facing Auth UI, session module, and dashboard route guard are CURRENT / LOCAL PROOF.

Dashboard read endpoint and frontend factual projection are CURRENT / LOCAL PROOF.

Frontend submit wiring is implemented for `/aanmelden`: the existing button validates locally, maps the draft, calls `api-app-signup-submit` write v3 through the frontend API client, and shows loading, success, or safe error state on the same page. It does not navigate to the dashboard yet.

Document upload backend status:

- CURRENT / LOCAL PROOF: separate `api-app-document-upload-url` and `api-app-document-upload-confirm` endpoints exist for the new `/app` backend.
- They require an authenticated app customer and server-side dossier/slot authorization.
- They create and confirm `app_dossier_document_files` and immutable `app_dossier_document_versions`.
- CURRENT / LOCAL PROOF: `api-app-document-download-url` resolves current documents server-side and returns short-lived signed download URLs.
- CURRENT / LOCAL PROOF: `api-app-document-withdraw-current` withdraws current documents without hard delete, preserves immutable evidence, and audits the action.
- CURRENT / LOCAL PROOF: dashboard document mutation uses authenticated customer context; the customer cannot provide file/version/storage internals.
- CURRENT / LOCAL PROOF: `document_changes_allowed` comes from the server dashboard projection and controls whether withdrawal is available.
- Signup submit itself still does not upload files, create storage objects, confirm document hashes, or promote document versions.
- Backend identity binding/bootstrap is CURRENT / LOCAL PROOF.
- Customer-facing Auth UI/session/bootstrap call wiring is CURRENT / LOCAL PROOF.
- Production storage bucket/policy/deploy proof remains OPEN.

Local browser-QA proof is green after the Vite env resolver fix and Vite restart:

- Local validation showed `Concept klaar`.
- Browser Network showed OPTIONS 200 and POST 200 to local `api-app-signup-submit`.
- The success panel showed `Aanmelding ontvangen` and displayed Dossier ID.
- The page stayed on `/aanmelden`; no dashboard redirect/bootstrap occurred.
- This is local proof only, not production deployment proof.
- No document upload, storage object, customer timeline, dashboard bootstrap, redirect, or kWh/result/fee lifecycle is implemented yet.
- P0 before production/deploy: treat the previously exposed runtime token/key-like value as leaked and rotate it. Do not print or preserve the value in docs, reports, commits, or chat.

Environment boundary:

- `app/.env.local` is for the isolated Vite app submit flow.
- Root `.env.local` is not the `/app` submit config.
- `assets/js/config.runtime.js` is generated legacy/static runtime config and must not be printed, committed, or used by the `/app` Vite submit flow.
- Supabase Edge Function environment variables are separate from Vite app environment variables.

Product role:

- ENVAL is now a customer-facing commercial ERE inboekservice.
- ENVAL begeleidt en dient/inboekt namens klant of via een aangewezen partij binnen de voorwaarden.
- ENVAL is geen verificateur.
- ENVAL is geen certificeerder.
- ENVAL gives no guarantee of ERE award, acceptance, payout, revenue, timing, certification, or document approval.
- The result-based fee model requires a final legal definition of "result" before production use.

Public copy boundary:

- This product role and audit doctrine is contract, legal, internal, and auditor-facing guidance. It is not public homepage, signup, dashboard, pricing, or marketing copy.
- Public copy must be simple, commercial, customer-oriented, and customer-safe.
- Public copy may say: "ENVAL helpt je met het aanmeld- en inboekproces.", "Je betaalt alleen bij resultaat.", "Geen garantie op resultaat.", and "Wij zorgen dat je dossier controleerbaar en compleet wordt opgebouwd."
- Public copy must avoid "anti-fraude-laag", "audit/evidence layer", "external-party audit reconstruction", "backend source-of-truth", and "verificateur/certificeerder" except in legal, FAQ, or terms context.
- Legal/audit doctrine remains valid for terms, internal documentation, service descriptions, and auditor-facing documentation.

## 2. Submit Principle

`Start dossier` should become one controlled submit action.

Rules:

- The client validates first.
- The backend validates again.
- The current backend creates the customer, dossier, locations, chargers, document slots, legal records, idempotency records, intake audit events, and app audit events in one controlled submit flow. Dashboard access, customer-readable timeline events, upload processing, lifecycle records, and final retention handling remain future phases.
- Submit must be idempotent.
- Submit must be audited.
- Double-clicks or retries must not create duplicate dossiers.
- Submit creates a reviewable dossier; it does not guarantee eligibility.
- Submit does not guarantee ERE award, payout, revenue, timing, certification, or document acceptance.
- Customer-facing errors must be safe and concise.
- Frontend may assist; backend decides.
- Frontend prechecks, PDOK lookup, field validation, parsing, compression, and previews are UX and cost/latency aids only.
- Backend remains source of truth for validation, normalization, authorization, document hash confirmation, audit, and lifecycle decisions.
- All final lifecycle decisions are backend/audit based.
- TARGET / NOT IMPLEMENTED: `Start dossier` is the one normal full customer submission. Email verification should trigger server-side promotion, not a second manual full-dossier confirmation.
- TARGET / NOT IMPLEMENTED: dashboard correction flow should use `Correcties indienen` only for targeted reopened sections.

## 3. Current Frontend Payload

The current `/aanmelden` flow now uses the frontend mapper and API client to submit to `api-app-signup-submit` write v3 after local validation. It still stays on the same page after submit and does not bootstrap dashboard access yet.

Current local state shape:

- `accountType`: `particulier | zakelijk | vve`
- `personalInfo`
- `personalInfo.address`
- `locations`
- `locations[].chargers`
- `documentsByChargerId`
- `kvkDocument` placeholder for Zakelijk/VVE
- consent/signature placeholders
- local validation result

Current frontend concepts:

- Particulier uses the personal address as the implicit first location.
- Zakelijk/VVE can have multiple locations.
- Chargers belong to locations.
- Chargers have stable client IDs.
- Document placeholders are linked to charger client IDs, not array index.
- Files are selected locally only; no storage upload happens yet.
- Address lookup is client-first and read-only.
- Client-side prechecks are not audit truth until submitted and accepted by backend.

Relevant draft shape:

```ts
type SignupDraft = {
  personalInfo: PersonalInfoDraft;
  locations: SignupLocationDraft[];
  documentsByChargerId: DocumentsByChargerId;
};

type PersonalInfoDraft = {
  accountType: "particulier" | "zakelijk" | "vve";
  firstName: string;
  lastName: string;
  companyName: string;
  organizationName: string;
  kvkNumber: string;
  email: string;
  phone: string;
  address: AddressDraft;
  kvkDocument: File | null;
};

type SignupLocationDraft = {
  clientId: string;
  address: AddressDraft;
  chargers: ChargerDraft[];
};
```

This shape is frontend draft state, not final database schema.

## 4. Normalized Submit Payload

The current frontend mapper normalizes local draft state into one backend-facing payload for `api-app-signup-submit` write v3.

Current contract shape:

```ts
type SignupSubmitPayload = {
  accountType: "particulier" | "zakelijk" | "vve";
  applicant: ApplicantPayload;
  legalEntity: LegalEntityPayload | null;
  primaryAddress: AddressPayload;
  locations: LocationPayload[];
  documentSlots: DocumentSlotPayload[];
  uploadIntents?: UploadIntentPayload[];
  consents: ConsentAcceptancePayload[];
  termsAcceptances: TermsAcceptancePayload[];
  feeTermsAcceptance: FeeTermsAcceptancePayload;
  metadata: SignupSubmitMetadata;
};
```

Applicant:

- first name
- last name
- email
- optional phone
- preferred language later

Legal entity, only for Zakelijk/VVE:

- type: `business | vve`
- company or VVE name
- KVK number
- optional KVK document placeholder/upload intent

Address:

- postcode
- house number
- suffix
- street
- city
- country
- lookup provider metadata where available
- BAG ID or equivalent provider ID where available

Locations:

- client location ID for idempotent mapping
- normalized address
- location label if needed later
- chargers

Chargers:

- client charger ID for idempotent mapping
- location client ID
- brand and optional manual brand
- model and optional manual model
- installation year
- MID number
- serial number
- backend supplier and optional manual supplier
- solar panel/exportability status

Document slots:

- slot type
- scope: dossier, legal entity, location, charger, or request
- linked client IDs
- required/optional status
- customer-facing label

Upload intents:

- optional future contract for preselected files
- should not be required for the first submit contract unless product decides all files are mandatory upfront
- real upload should still use a signed upload URL + confirm flow

Normalization rules:

- Particulier is normalized into one location.
- Zakelijk/VVE preserve multiple locations.
- Chargers always belong to locations.
- Document slots belong to the most specific relevant context:
  - dossier
  - legal entity
  - location
  - charger
  - account/legal context
- Document slots can be created even when files are missing.

## 5. Backend Records Created

Conceptual records created or matched by submit:

- `customer`
- `customer_identity`
- `customer_dossier`
- `dossier_locations`
- `dossier_chargers`
- `document_slots`
- `legal_text_acceptances`
- `consent_acceptances`
- `fee_terms_acceptance`
- dashboard access or login bootstrap record
- customer-readable timeline events
- internal audit events
- retention class or retention policy assignment

Current write v3 implementation creates the customer/identity/dossier shell, locations, chargers, expected document slots, legal acceptance records, idempotency record, intake audit, and app audit rows. Dashboard access/bootstrap records, customer-readable timeline events, upload processing, and lifecycle records are future write phases.

Creation should be idempotent by:

- request `Idempotency-Key`
- stable client IDs for locations and chargers
- normalized applicant email identity
- backend-owned dedupe rules for duplicate submit attempts

## 6. Legal And Consent Capture

Required acceptance types:

- privacy / data processing
- terms and conditions
- fee/success terms
- no-guarantee acknowledgement
- mandate/verifier/NEa/CAR-related permission
- communication permission for email/dashboard notifications

Current frontend consent state is:

- `termsBundleAccepted`

Current frontend UI bundles terms, privacy, and ENVAL-succesfee behind one checkbox
and shows draft legal popups. The target signing contract projects that one
customer action into three separate versioned legal intents; persistence remains
NOT IMPLEMENTED until the complete legal bundle is approved.

No fixed consent duration is a current frontend requirement. Consent duration remains an open legal/commercial decision if needed later.

For every acceptance, store:

- acceptance type
- version
- content hash
- language
- accepted_at
- customer identity
- dossier scope where relevant
- request metadata
- source surface, for example `/aanmelden`
- withdrawal/change state later

Fee terms acceptance must include:

- fee model version
- bruto verkoopopbrengst and every directe externe transactiekost used;
- netto gerealiseerde verkoopopbrengst;
- ENVAL-succesfee: 10% inclusief toepasselijke btw;
- klantaandeel: 90%;
- settlement and settlementrevision references where applicable;
- no guarantee acknowledgement
- exact approved legal-text version after later legal validation

F-01 through F-15 are approved commercial direction. Legal copy remains DRAFT;
fee/settlement runtime is NOT IMPLEMENTED.

## 7. Document Slot Creation

Slots should be generated from account type, locations, and chargers.

Particulier:

- installation invoice per charger
- monthly reimbursement overview only if `zakelijk rijden` context applies

Zakelijk:

- KVK extract at legal entity level
- installation invoice per charger

VVE:

- KVK extract at legal entity level
- installation invoice per charger

Rules:

- Missing files at submit may create open document slots instead of blocking the submit, depending final product decision.
- Additional documents should be requested later through `customer_requests`.
- Document slots must preserve stable links to dossier, location, charger, legal entity, and account context.
- Real file upload remains a separate signed upload URL + server-side hash confirm flow.
- Do not inherit the old one-document-per-charger-type rule as the final model without redesign.

## 8. Dashboard Bootstrap

After successful submit, the customer should receive:

- dashboard login/access email
- created/submitted dossier status
- dashboard landing route
- initial customer-readable timeline
- next-action summary

Customer sees immediately:

- dossier started/submitted confirmation
- current status
- which documents/details were received
- open document slots
- any immediate missing information
- accepted consent/terms summary
- concise "ENVAL gaat uw gegevens beoordelen" message

ENVAL sees internally:

- new submitted dossier
- applicant and account type
- locations and chargers
- document slots and missing files
- consent/terms acceptance records
- review queue item or review task
- internal audit trail

Current Auth/session direction:

- Supabase Auth is the current customer session layer.
- `/account` provides account creation and login.
- Frontend bootstrap calls `api-app-auth-bootstrap` after a verified session.
- Dashboard route protection is locally proven.
- The real factual dashboard projection is locally proven.
- Password recovery, resend verification, and production Auth configuration remain OPEN.
- Future `Nieuwe aanvraag` behavior must reuse the existing signup modules instead of creating a second intake implementation.

Target promotion boundary:

- A complete verified intake opens dashboard with the dossier already submitted or under review.
- A correctable promotion result opens dashboard in `needs_customer_action`.
- Valid unaffected sections remain fixed.
- Only affected sections/records become editable.
- Dashboard must not show a permanent generic `Dossier indienen` button after successful promotion.

## 9. Dossier Status After Submit

Recommended initial statuses:

- `draft`
- `submitted`
- `under_review`
- `needs_customer_action`

Triggers:

- `draft`: backend draft exists but customer has not clicked final submit, if draft saving is implemented later.
- `submitted`: customer clicked `Start dossier`, backend accepted payload, and initial dossier was created.
- `under_review`: ENVAL starts reviewing the dossier.
- `needs_customer_action`: ENVAL creates at least one customer request that blocks progress.

Rules:

- Submit should normally produce `submitted`.
- `under_review` should reflect ENVAL action, not merely customer submit.
- `needs_customer_action` should be request-driven.
- Customer statuses should remain simpler than internal statuses.

## 10. Audit And Timeline Events

Internal audit events for submit may include:

- `signup_submit_received`
- `signup_submit_rejected`
- `customer_created_or_matched`
- `dossier_created`
- `location_created`
- `charger_created`
- `document_slots_created`
- `consents_recorded`
- `fee_terms_recorded`
- `dashboard_access_issued`
- `signup_submit_completed`
- `signup_submit_failed`

Customer-readable timeline examples:

- Dossier gestart
- Gegevens ontvangen
- Dashboardtoegang aangemaakt
- ENVAL gaat uw gegevens beoordelen

Rules:

- Internal audit events can be detailed and technical.
- Customer timeline events must be concise and readable.
- Do not expose raw audit rows, actor refs, request metadata, or internal payloads in the dashboard.
- Raw audit is not shown directly to the customer.
- Customer timeline is a curated projection from internal events, review decisions, and customer-visible state.
- Audit event metadata should follow the legacy CORE function standard where relevant: request ID, idempotency key, actor reference, environment, stage/status/reason.

## 11. Idempotency And Failure Handling

Backend submit must require `Idempotency-Key`.

Repeated submit behavior:

- Same idempotency key returns the same result.
- Double-clicks must not create duplicate customers or dossiers.
- Retry after network failure should return the existing created/submitted dossier if creation completed.
- Retry after validation rejection should return the same rejection for the same idempotency key.

Partial failure strategy:

- Prefer transactional creation where practical.
- If full transaction is not practical, use staged creation with recoverable state.
- Store enough submit attempt metadata to safely resume or report failure.
- Do not leave invisible dead dossiers.
- Do not send dashboard access email before the backend has a valid dossier/access state.

Customer-safe errors:

- Invalid fields: ask customer to correct the fields.
- Temporary backend failure: ask customer to try again later.
- Duplicate/known submit: route customer to dashboard or show a safe "already started" message.
- Do not expose database, policy, storage, or internal audit details to the customer.

Invalid payload rejection:

- Backend must validate all fields again.
- Backend must reject impossible account/location/charger/document relationships.
- Backend must reject unsupported legal/terms versions.
- Backend must not trust client-only validation.

## 12. Retention/Minimization

Initial retention class should be assigned during submit or draft creation.

Retention classes:

- unsubmitted draft
- submitted pending review
- abandoned/no response
- withdrawn
- rejected/paused
- successful/result dossier
- legal/fee/audit evidence

Rules:

- Unfinished dossiers must not be kept indefinitely.
- Customers should receive reminder before cleanup where appropriate.
- Customer can continue or withdraw before cleanup.
- Minimization should preserve only necessary privacy-hard tombstone/audit proof.
- Retention policy must distinguish customer-visible status from internal cleanup state.
- Legal, fee, and audit evidence may have separate retention needs.

## 13. Security And Privacy

Rules:

- No secrets client-side.
- Server validates all fields again.
- Frontend is never trusted as truth.
- Customer Auth/bootstrap and route protection are CURRENT / LOCAL PROOF.
- Customer-safe dashboard read projection is CURRENT / LOCAL PROOF.
- Frontend dashboard projection is CURRENT / LOCAL PROOF for factual app-backed fields.
- Unsupported dashboard domains remain unavailable/open rather than fabricated.
- Shared frontend upload transport is CURRENT / LOCAL PROOF.
- Authenticated dashboard document-slot upload/download/withdrawal wiring is CURRENT / LOCAL PROOF for MID and installation/acquisition invoice PDFs.
- Public `/aanmelden` authenticated upload remains OPEN.
- Customer can only see their own dossier.
- Dashboard should not show raw audit rows.
- Uploaded evidence must use signed upload URL and server-side hash confirmation later.
- Avoid custom localStorage/sessionStorage token persistence; rely on the official Auth client session model unless a future security review changes that.
- Do not store unnecessary draft data longer than needed.
- Do not put raw email or PII into public actor references.
- Readable timeline must be privacy-safe.

## 14. Reuse Vs Replace Old Backend

Reuse conceptually:

- audit helper patterns
- idempotency rules
- signed upload URL and server-side hash confirm
- document status concepts
- retention tombstones
- outbound email queue
- analysis declared/observed/evaluated separation
- CORE endpoint discipline: CORS, metadata, idempotency, audit, auth, server-side writes

Do not directly reuse without redesign:

- old dossier token wizard
- old single address endpoint flow
- old `terms`, `privacy`, `mandaat` consent booleans
- old charger-count model
- old one-address model
- old document buckets and one-doc rules
- old export/payment assumptions
- old link to `/dossier.html`

## 15. Open Decisions

Unresolved before production:

- Password recovery and resend verification UX.
- Production Auth configuration and browser proof.
- Whether submit requires all files immediately or creates open document slots.
- Exact legal copy and versions.
- Consent duration options.
- Legal enforceability and exact customer wording for the commercially approved
  receipt/reconciliation moment, netto gerealiseerde verkoopopbrengst
  calculation, correction, reversal and bounded clawback direction.
- VAT, invoicing and other tax validation of the all-in 10% direction.
- Financial-legal, banking and payment-regulatory classification of the
  preferred own-ENVAL-account model and possible PSP/split-payment fallback.
- MID verification source.
- Energy bill/account holder evidence requirements.
- Dashboard route granularity.
- Internal review UI timing.
- Whether draft saving exists before final submit.
- How to handle duplicate customer email with multiple dossiers.
- Whether selected local files are uploaded before or after dashboard bootstrap.

## 16. Recommended Next Implementation After Current Proof

A. Intake quarantine / verification promotion contract

- Implement the TARGET / NOT IMPLEMENTED contract in `docs/app/contracts/intake-verification-promotion.md` only after schema, endpoint, and proof tasks are accepted.
- Define intake/quarantine schema, pre-auth capability, atomic email-verification promotion, immutable snapshot, and server-derived section capabilities before charger/location edit flows.
- Keep public `/aanmelden` upload wiring OPEN.
- Keep parser preview/precheck as UX support only until integrated into the authenticated card.

B. Account-specific document requirements

- Harden particulier, zakelijk, and VVE upload requirements.
- Define KVK, signing-authority, VVE mandate, and business-driving evidence details.

C. Production Auth and deployment proof

- Configure password recovery and resend-verification UX.
- Prove production Auth URL/redirect settings.

- Apply and prove remote migrations/functions/storage policies only in an
  explicit deployment task.
- Do not mark the full app live from local proof.

## PILOT-CASE-01 Dashboard Case Projection

CURRENT PROVEN — LOCAL ONLY.

After Auth bootstrap v2, every relevant safe dossier summary includes
`case_id` and `case_reference`. `api-app-dashboard-get` remains fully
write-free, derives the customer/dossier scope server-side and loads case rows
in one customer-bounded bulk query. Missing, ambiguous or conflicting case
truth fails safely; no case is created during read.

The frontend validates both fields without deriving a fallback. Existing
selected-dossier state, cache behavior and document refresh/upload journey
remain unchanged. The selected dossier overview reuses
`portal-content-stack`, `portal-card-compact`, `portal-info-rows` and
`portal-info-row` to show `Zaakreferentie`; `case_id` is not visible. No CSS
or inline style was added.

Targeted frontend proofs and the production build are green. Browser-live
protected-route proof remains OPEN; no browser-runtime, remote or production
claim is made.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Entity, formation, year and withdrawal-09B2A2 customer boundary

P-01 and T-01 are approved product/legal direction with entity details pending.
The intended core-service controller and contracting party is the future ENVAL
B.V.; that same entity receives the assignment, manages the service and performs
the agreed financial settlement. Full statutory identity and contact details
must be filled before CURRENT. Particulier is a natural person acting for their
own relevant connection; Zakelijk is a Dutch enterprise/organization acting for
its own relevant connection; VvE is a Dutch owners association acting through
the stated natural person. A Zakelijk/VvE authority declaration is not ENVAL
review or verifier acceptance. Foreign entities/registers are post-MVP.

T-02 fixes the customer-facing formation rule exactly as follows:

> De overeenkomst komt tot stand op het moment waarop ENVAL de elektronische
> ondertekening server-side succesvol heeft afgerond en de klant de
> indieningsbevestiging met een veilige referentie ontvangt.

Account/e-mail selection, intake start, document selection/upload,
`confirmed_quarantine`, parser output, fact confirmation, reaching Step 3,
clicking confirmations and OTP request/delivery are never sufficient by
themselves. Only successful atomic server finalization is decisive.

The service and mandate each cover exactly one selected calendar year, without
silent renewal or a subscription/ongoing-mandate claim. A new year requires a
new explicit customer action, legal bundle, immutable snapshot, mandate and
signature. After the selected year, only related verification, booking, sale,
settlement, correction/reversal, objection/dispute and required retention may
continue. Server finalization supplies the mandate issue date and the snapshot
pins the exact year; the current multi-year-capable frontend/model remains to be
reconciled in a later implementation batch. No retroactivity is claimed.

M-06 approves a future prospective withdrawal route through an authenticated
dashboard or reliably identity-verified written notice. It must create a new
immutable server event containing received date, actor, source and audit
context, without changing original evidence. Legal/verifier validation remains
required for exact effective date, unfinished booking, irreversibility,
notifications and retention. No such withdrawal/signing/finalization runtime is
implemented here, and all four legal documents remain DRAFT/unverified.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Signature core and generated mandate-09A customer boundary

The Step 3 canonical dossier summary remains the existing unified fact
projection. After it, the same vertical document shows exactly: generated
mandate, privacy notice, service terms, fee terms, signer input and signing
readiness. No second summary renderer or dashboard grid is introduced.

`typed_name_otp_v1` is the active MVP method. Particulier supplies typed full
name and explicit personal signing intent. Zakelijk/VvE additionally supplies
signer role and explicit intent to sign on behalf of the organization. Role or
intent is input, not authority evidence. The one-time challenge is mandatory in
the method contract but has no 09A input, call or success state.

Privacy uses read acknowledgement. Service and fee terms use separate
acceptances. Mandate uses signed status only after future server finalization.
The existing placeholder/draft sources are not CURRENT and have no verified
content hashes, so controls and readiness fail closed. The protected legacy
`termsBundleAccepted` submit mapping is not expanded or reused as mandate truth.

The generated mandate consumes canonical presentation facts without accepting
parser observations as legal truth. It includes required party/organization,
address, KvK, EAN, permission, issue-date-placeholder, calendar-year, method and
authority-review fields per account type. `review_required` facts remain in the
intent as review markers. Pending/blocked required facts, incomplete signer or
legal input, missing year/method/challenge, or non-CURRENT legal versions keep
readiness false.

09A performs no signing, submit, dossier start, persistence, promotion, audit
write, backend call or remote action. 09B owns immutable snapshot/hash, OTP and
finalization; 09C owns verified promotion/dashboard projection.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Signup fact resolution-08B customer boundary

All organization, location and charger facts use one customer resolution
contract. `pending` has no judgment text; `confirmed` shows `Bevestigd`;
`review_required` shows `ENVAL-controle nodig`; and `blocked` shows `Kan niet
worden ingediend`. The customer color model is neutral, green, orange and red
respectively. Initial absence is neutral and never labeled `Ontbreekt`.

One observed document value stays pending until the customer confirms it. A
valid correction or a valid manual value without document evidence stays
orange. Two distinct documents with the same normalized value may confirm a
fact automatically. Reusing the same document bytes in two bindings does not
count twice. Conflicting document values are red until the customer chooses a
canonical value; that explicit choice remains orange. Invalid values, clear
identity/address mismatches, unresolved document conflicts and required facts
still missing after an attempted resolution are red blockers.

All source/value observations remain separate from the chosen canonical value.
Customer confirmation is intent, not new evidence. Each displayed observation
retains source ID/type/label, upload binding, observed and normalized value,
document identity/fingerprint and stable location/charger binding. Raw parser
context and technical metadata remain absent from customer UI and submit
mapping.

Natural-person names compare using the existing bounded name helper;
organization names use organization semantics and do not treat initials as a
person match. Structured Dutch address comparison is exact on postcode and
house number, with a missing suffix treated as probable and a conflicting
suffix as a mismatch. Required confirmed and review-required rows may progress;
pending and blocked rows may not; informational rows never gate.

This is browser-local presentation and decision behavior only. It does not
prove evidence acceptance, signing, immutable snapshot, persistence, backend,
remote, deploy, production or verifier/NEa acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Unified signup presentation-08 customer boundary

Step 1, Step 2 and the Step 3 preparation share one applicability-driven fact
presentation contract. It projects existing observations, canonical values,
decision status, confirmations and corrections; it cannot create or change
fact truth. Customer judgments are limited to `Door klant bevestigd`,
`ENVAL-controle nodig` and `Ontbreekt`. A customer confirmation is not ENVAL
approval, verified evidence or a representation-authority outcome.

Not-applicable facts and missing informational facts are absent from customer
tables. Manual corrections retain `Handmatig aangepast` as source and
`ENVAL-controle nodig` as judgment. Parser-derived values use the concrete
document type as source. Account type, e-mail and stable customer bindings use
`Door gebruiker` and remain review-needed.

Step 2 groups each location and its chargers by stable client IDs. Visible
charger numbering is global only; it is not state identity. Step 3 is one
vertical read-only document ordered as Account, each location, each charger and
Documents. It contains no signing clauses, sign action, submit, dossier start,
technical parser metadata or persistence claim.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-DOCUMENT-FIRST-UI-01 Active Frontend Journey

CURRENT PROVEN — LOCAL ONLY — DOCUMENT-FIRST KISS SIGNUP UI AND GAP-DRIVEN CONFIRMATION MODEL.

The active customer composition is Account, Documenten, Controleren,
Aanvullen and Ondertekenen. One canonical frontend draft keeps account/legal
party, locations, chargers, documents, parser observations, customer
confirmations, manual corrections and acceptances separate. Review matrices and
gaps are derived by pure selectors; comparison output is not persistent state.

Documents remain location- or charger-scoped. Parser values stay observed and
never overwrite declared input. A value requiring customer confirmation becomes
declared frontend state only after explicit confirmation, correction, candidate
selection or manual fallback. The mapper adapter continues to serialize only
existing confirmed/manual target facts and preserves exclusive document/manual
EAN handling.

Document persistence, upload promotion, evidence acceptance, final mandate
copy/versioning, calendar-year scope, signer authority, signing persistence and
a successful submit remain outside this bounded proof. The final action is
fail-closed. Interactive browser, remote, deployment and production behavior
are not proven.

Evidence: `docs/app/operations/pilot-signup-document-first-ui-01-local-proof.md`
and marker `signup-document-first-ui-proof-ok`.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-PARTY-NAME-CROSSCHECK-03 Customer-Safe Name Semantics

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF ONLY.

One pure resolver supplies the dossier party used by both energy and
charger/MID document checks. A private signup uses the declared full given
name(s) plus full surname. A business or VvE uses only its declared legal name.
The bestuurder/representative remains separate authority and signing truth and
is never a contract-holder fallback. The customer field asks
`Voornaam/voornamen (voluit)` without adding or changing payload fields.

Natural-person comparison is deterministic. A complete observed name is green
only when all declared given-name and surname tokens match after bounded case,
diacritic and whitespace normalization. Recognizable observed initials may
produce only `initial_and_surname_match` when every initial matches the
corresponding declared given name and the full surname matches. That orange
status reads `Initiaal en achternaam komen overeen`; it does not prove the full
given name. Full-name differences, different initials and surname differences
are red `Controle nodig`. Missing, non-displayable, incomplete or reliably
unbounded candidates have no pill.

Organization comparison permits bounded case/whitespace and BV/B.V. or NV/N.V.
punctuation equivalence only. It does not use substring, token-set, e-mail
domain, representative or surname fallback. Mismatch actions focus the given
names, surname or legal-entity name field through the existing focus/scroll
path. Other comparison types retain their existing `probable_match` and
`Lijkt overeen` presentation where applicable.

The recorded NEa/Regeling requirement says `naam`; it does not determine
initials versus a full given name. ENVAL requests full given
names as a product control. Parser comparison is observed/derived assistance,
not identity verification, authority, aangeslotene status, evidence acceptance
or verifier acceptance. Verifier acceptance of initials remains UNKNOWN.

Evidence is local proof marker `signup-party-name-crosscheck-proof-ok`. No
browser-runtime, remote, deployment or production claim follows.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

### PILOT-SIGNUP-PARTY-RUNTIME-04 Reactive Draft Boundary

The selected energy or charger document owns only its parser observation.
Party comparison is not persisted in document state: both customer surfaces
derive it during render from the current account type, current applicant or
legal-entity fields and the current displayable observation. Editing a declared
name changes the pill without reparsing or mutating the observation.

Changing account type crosses a hard pre-submit draft boundary. Empty drafts
switch immediately. Meaningful drafts require the explicit destructive-change
confirmation and then use the existing initializers for one fresh location,
charger, document collection and consent state. No files, observations, EAN
candidates/confirmations, old active location, validation visibility or hidden
per-account-type draft history survives. A generation guard rejects parser
results started before that reset.

This is local source/proof evidence only. Customer-visible acceptance still
requires local browser proof; parser output stays observed/derived and no
accepted-evidence, identity, authority, verifier, remote or production claim is
made.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-DOCUMENT-CROSSCHECK-02 Shared Customer-Safe Crosscheck

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF AND PROOF-ONLY LOCAL PDFS.

Location address truth remains six separate fields: street, house number,
house-number addition, postcode, city and country. One formatter renders a
bounded addition as `28-1`; comparison removes case, surrounding whitespace and
the common `-`, `/` or space separators from the addition only. It never splits
an unbounded `281`. Postcode, house number and addition remain the primary match
basis; one missing addition is at most `probable_match` and unreliable observed
structure is `unavailable`.

Each location has exactly one active EAN source mode. Document mode owns the
selected energy file, observations, selected electricity candidate and customer
confirmation. Manual mode owns only an exact 18-digit manually confirmed EAN.
`EAN klopt niet` and automatic manual fallback clear the document and every
document-derived state; selecting a new document clears every manual value and
validation state. A pure mapper assertion rejects a mixed source. The public
payload shape and the existing `energy_document_customer_confirmed` and
`manual_customer_confirmed` values are unchanged.

Energy and charger documents map their own business facts into the same bounded
row presentation: label, display value, optional comparison status, optional
focus action and displayability. The active charger UI shows no parser status,
timing, field keys, confidence, raw context or limitation codes. Charger MID,
serial, brand and model comparisons are normalized but exact; location and
customer comparisons reuse the energy rules. Invoice date stays separate from
explicit installation date/year.

All parser values remain observed/derived and all form values declared.
Comparison is assistance: it does not prefill, overwrite, verify identity or
accept MID evidence. The two PDF fixtures are local proof only and are neither
copied nor committed; proof output omits document values and full EANs.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-ENERGY-DOCUMENT-CROSSCHECK-01 Customer Presentation

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF AND PROOF-ONLY REAL PDF.

The compact Uit het document gehaald card shows only displayable electricity
EAN, contractholder, delivery address, supplier and contract-start fields.
Rejected values, raw context, source metadata and rejection reasons stay out of
customer presentation. Gas EAN remains outside the normal UI.

Komt overeen, Lijkt overeen and Controle nodig are shown only when declared
input is sufficient for comparison. An incomplete applicant or location keeps
the document value visible without a pill. A missing/rejected parser candidate
hides the complete row; the generic Niet automatisch te controleren text is not
shown. EAN confirmation, EAN klopt niet and manual fallback remain intact.

Comparison is assistance, not verification. No customer field is automatically
overwritten, and parser output cannot reach the submit mapper. Only an
explicitly confirmed electricity EAN follows the existing declaration boundary.
Real-PDF evidence is local proof only and contains no logged document values,
full EANs or fixture PII.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-EAN-PREFLIGHT-02 Submit-Attempt and Real-Text-PDF Correction

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF AND PROOF-ONLY REAL PDF.

The earlier synthetic EAN fixture established bounded extraction rules but did
not establish real-text-PDF coverage. The current adapter now supports the
observed Flate-only and ToUnicode text shape, preserves page/row composition and
emits an explicit column boundary. This prevents a contract date directly
following an EAN column from invalidating the exact-18-digit candidate.

One local personal contract was used only through `ENVAL_EAN_REAL_PDF`; it is
not copied, committed or logged. Privacy-safe proof output records only two
candidate counts: one electricity and one gas. When one electricity candidate is
unique, only that candidate is confirmable. Gas stays observed. The manual route
is activated by `EAN klopt niet` or a failed/no-confirmable extraction and owns
no background document state.

Validation always computes the current field-error truth. `submitAttempted`
keeps the visible field-error map empty until an invalid CTA click. That click
reveals all current field-local errors, focuses/scrolls the first invalid
control and returns before mapper, client or network work. Corrected and
no-longer-applicable fields disappear immediately after that first attempt. The
CTA is idle-active and is disabled only while a valid request is actually
running.

No successful browser submit, persistence, accepted evidence, external EAN
verification, authority determination, signature or mandate is claimed.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-EAN-PREFLIGHT-01 Observed Candidate Confirmation

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF ONLY.

The existing energy-document `File` remains browser-local and location-scoped.
Selection now invokes the existing PDF adapter and existing text extraction.
Exact 18-digit candidates carry compact context and are classified only when the
document contains an explicit electricity or gas signal. Page remains absent
when the current extractor cannot establish it.

One clear electricity or unclassified candidate requires explicit customer
confirmation. Multiple candidates require an explicit non-gas choice. Only gas,
no candidate, parser failure or `EAN klopt niet` opens the exact-18-digit manual
fallback. Changing or removing a document resets only that location's candidate,
manual value and confirmation; stale async parser results are ignored.

Validation is computed as stable field paths and shown at each applicable input,
document slot, EAN confirmation and acceptance. The CTA is disabled and guarded
until the current frontend draft is complete. Parser output is observed;
confirmation is only declared frontend preflight. Neither is persisted evidence,
a signed mandate, external EAN verification, authority verification or
regulatory acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-JOURNEY-02 KISS Onboarding

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF ONLY.

Signup now exposes exactly Aanvrager, Locatie, Aansluiting, Laadpalen and
Ondertekenen. The expanded review and separate additional-document step are not
active. The final action is `Ondertekenen en dossier starten`.

Locatie owns postcode/house-number/suffix precheck and multi-location
add/remove. Aansluiting owns one local energy-document draft per location.
Aansluiting and Laadpalen reuse the same location-tab component and active
location ID; charger creation always binds to that active location.

The signup payload and public `write_v3` response remain compatible. Deferred
connection data is omitted as before. Current general conditions/privacy/fee
acceptance is not the definitive NEa mandate.

Authenticated dashboard work remains open for document transport, EAN
acquisition/confirmation, additional documents, kWh and the immutable scoped
mandate snapshot.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-JOURNEY-01 Five-Step Customer Journey

HISTORICAL PARTIAL — SUPERSEDED BY PILOT-SIGNUP-JOURNEY-02.

The visible signup order is Aanvrager, Aansluiting en locatie, Laadpalen,
Aanvullende documenten, and Controleren en afronden. Applicant contains
account/person/organization/contact/KVK inputs. Each location owns its address,
local energy-document selection, assisted/manual EAN state and confirmation.
Charger fields, installation/acquisition invoice and local MID-oriented preview
remain grouped per charger under their location.

Zakelijk rijden uses one dossier-wide conditional local document state and shows
no empty upload card for non-applicable account types. The existing
`SignupReviewPanel` now derives one read-only summary from the same draft.
Wijzigen actions scroll to the owning section without replacing state.

Current conditions/privacy/fee acceptances are not a definitive mandate. The UI
states that the mandate follows after the connection and mandatory facts are
complete. kWh is absent from signup and remains dashboard-only.

The submit mapper retains the existing payload shape. No backend, transport,
parser, CSS or Supabase configuration changed.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-CONNECTION-01B Assisted Location Declaration

CURRENT PROVEN — LOCAL ONLY.

Each shared signup location independently defers EAN by default. The primary
copy explains later acquisition through an energy bill or available connector
and customer review. “EAN handmatig invoeren” is a secondary action requiring
exactly 18 digits and explicit customer confirmation. Particulier uses the
applicant address; zakelijk and VvE retain independent tabbed locations.

The mapper omits deferred connection data and emits only the confirmed manual
EAN contract. Frontend validation assists, while Edge and database validate
again. Netbeheerder and standard valid-from/to fields are absent. Existing
field, checkbox, action, button and location CSS is reused with no inline style
or new CSS.

The dashboard receives no new connection projection in this batch. No
verified/green status, canonical connection, CAR, ownership, mandate validity or
accepted location is shown.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-PARTY-01A Bootstrap-Only Party Activation

CURRENT PROVEN — LOCAL ONLY.

After the existing signup-created customer reaches verified Auth bootstrap,
v3 creates or resolves one internal canonical party root and `account_owner`
service relationship. All dossiers/cases of that customer reuse the same
root; different customers receive different roots.

The safe v2 bootstrap response and dashboard contract are unchanged and
contain no party internal. No frontend component, client, route, CSS token,
layout or inline style changed. The dashboard makes no party, profile,
service-recipient, authority or mandate claim.

Q01-Q18 prove local database behavior only. Browser-live, remote and
production remain OPEN.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-PROFILE-02 Auth-Time Declared Profile Promotion

CURRENT PROVEN — LOCAL ONLY.

Signup write v3 and immutable declaration capture remain unchanged. During
later verified Auth bootstrap, v4 resolves all relevant dossier declaration
sources. No source is a backward-compatible no-op. Partial coverage or
conflicting authoritative facts fails closed. Complete equivalent coverage
creates or resolves one shared declared profile and one asserted
service-recipient claim per canonical case.

The public Auth response remains exactly the existing safe v3 shape. No
frontend or CSS changed. Source timestamp and Dutch profile business date
remain distinct; neither is verified legal validity.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-ATOMIC-01 Transactional Current Submit

CURRENT PROVEN — LOCAL ONLY.

The previous Edge-side multi-write flow is replaced by one
`app_submit_signup_v4(jsonb)` database transaction. It owns the existing
customer/identity/dossier/location/charger/document-slot/legal-acceptance
creation, immutable applicant declaration, fail-closed audit and existing
v3-scope idempotency completion.

Same-key/same-payload returns the exact stored `write_v3` response.
Same-key/different-payload returns `idempotency_conflict`. Any exception
before completion rolls back every row including the idempotency reservation;
the same request can retry safely. Concurrency yields one logical dossier and
one declaration source.

The Edge still performs server-side validation/normalization and canonical
payload hashing, then makes exactly one service-role RPC call. No direct
business, audit or idempotency table write remains in the handler. Frontend,
response validator, components and CSS are unchanged.

Declaration capture is not profile promotion, address truth, verified KvK,
representation, mandate, EAN, eligibility or evidence acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Document-first review-02 boundary

The current public signup review is a three-step browser-local preparation
surface: Account, Documenten, Ondertekenen. Step 2 may compare only displayable
observed facts, declared values and separately stored manual corrections.
`Bevestigen` creates frontend confirmation state; it does not create accepted
evidence, canonical TARGET truth, identity, authority, aangeslotene or mandate
truth.

Step 3 reads confirmed canonical facts only. Document tokens contain a safe
filename, type and local location/charger relation. Raw parser context,
confidence, source pages and rejection reasons remain internal. The unavailable
sign action is hidden and does not start a dossier.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Document decision-03 customer boundary

The browser-local review matrix presents exactly `Gegeven`,
`Energiecontract/-nota`, `Installatiefactuur`, `Actie` and `Wordt gebruikt`.
The last column stays empty until the customer confirms a supported match or
states a canonical correction/difference. Such customer intent remains
declared frontend state; it does not turn a review-required fact green and is
not accepted evidence, verified TARGET truth or a dashboard status.

Semantic roles remain distinct. Contract holder is not automatically the
invoice buyer, and an invoice address is not an installation location. EAN is
energy-document scoped; charger brand, model, MID and serial are
charger-document scoped. Only comparable material conflicts fail closed.

The signing preparation shows compact Account, Locaties, Laadpalen and
Documenten summaries. It exposes review markers but no raw parser context or
technical metadata. Because signing is not implemented, no sign button is
shown and no submit path is enabled.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Generic document facts-05 customer boundary

Both browser-local PDF upload slots call the same technical
`parseInvoicePdfInput(input)` entrypoint. Same bytes and parser version produce
the same observation envelope and generic facts. Upload slot, location,
charger, account and matrix column are not parser inputs.

An upload slot binds a parsed observation to the energy-document or
installation-invoice source column only. It does not classify, accept, reject,
hide or reinterpret facts. The active customer state has no document-type
classification or compatibility result. Internal descriptive type-candidate
scores remain non-blocking envelope metadata only.

Missing required canonical facts and real material fact conflicts determine
progression. Missing or rejected values render as `—`; a parsed document with
no supported facts renders `Geen gegevens gevonden.` at that upload card.

The document cache is browser-local and keyed by document/client ID, with the
content fingerprint and parser version stored in the entry. It is excluded from
the submit mapper. This is not accepted evidence, canonical TARGET truth,
signing, persistence or dashboard status. Parser-04 customer-facing
compatibility behavior is historical and superseded by this boundary.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Fact applicability and signing summary-06 customer boundary

Generic extraction and dossier applicability are separate. One pure selector
uses only account type and fact key to mark a matrix row required,
informational or not applicable. Parser presence or absence never determines a
legal or product requirement.

For Particulier, organization name, KvK and gas EAN show neutral `Niet nodig`.
For Zakelijk and VvE, organization name and KvK are required while a found
document party remains informational and never fills a representative,
administrator or signer. Missing informational facts show `—`, have no action
and do not block.

`Nederland` is an address-editor display default only. No declared address,
correction, confirmation or canonical value exists until the customer
explicitly saves a complete street, house number, postcode and city. That
manual declaration preserves source observations and remains marked
`Handmatig aangepast · ENVAL-controle nodig`.

The existing signing preparation groups Account, Locaties, Laadpalen,
Documenten and found additional document facts. It shows only confirmed
applicable canonical facts, safe filenames and explicit location/charger
binding, with no missing informational rows or technical parser metadata.
Signing and submit remain unavailable.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Organization document-first-07 customer boundary

The active Account step captures only account type and e-mail. For Zakelijk
and VvE, Step 2 requires exactly one account-bound `KvK-uittreksel`; Particulier
does not render that slot. Hidden legacy organization and trade-register fields
are compatibility state only and are not an alternative input route.

The unified browser-local PDF parser may observe organization name, KvK number,
registered address, legal form, trade name, director/board-member text and
representation text. Filename, upload slot and provider are not parser inputs.
Registered address remains separate from energy delivery and invoice address.

Zakelijk/VvE show `KvK-uittreksel` between `Gegeven` and the existing energy
and installation-invoice sources. Organization name, KvK number and registered
address are required. If the account document is absent, the action returns to
that upload; a manual value cannot remove the document blocker. Particulier
retains the five-column matrix.

The preparation summary binds the KvK file to Account. Representation text is
observed only under `Bevoegdheidsinformatie uit document`; it does not identify
or populate a signer and is not an authority outcome. No fact or document from
this batch enters submit or dossier persistence.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Compact signing-09A1 customer boundary

The final local signup step presents one canonical fact summary, one generated
mandate, one combined legal-bundle action and one signing declaration. Summary
confirmation is customer intent and does not turn displayed facts or parser
observations into accepted evidence.

The combined legal checkbox is presentation only: privacy reading, general
terms acceptance and fee-terms acceptance remain separately versioned intents.
Preview and download render from the registry plus mandate model in browser
memory. They create no dashboard document, persisted acceptance or signed
artifact.

For Zakelijk/VvE, naming the canonical organization in the declaration records
only what the customer declares. It does not satisfy authority review. Step
navigation preserves the local reducer draft and restores the visible flow
heading; it does not submit or promote dossier state.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Signing layout-09A2 customer boundary

The customer summary shows applicable Account facts in two columns. Each
location then groups one location panel with only chargers whose projected
`locationId` matches that group; stable IDs remain keys and global charger
numbers remain visible. Internal sources, resolution state, technical IDs and
parser metadata are not rendered by these document-mode tables.

The Documents table shows only document type plus binding and customer-safe
filename. The existing projector remains authoritative; 09A2 creates no second
fact, document or signup-state model.

Machtiging, Voorwaarden en privacy and Ondertekening form one responsive row.
Step 3 has three confirmations total: summary, legal bundle and signing
declaration. There is no mandate checkbox and no active or disabled primary
action. The 09B action will require server-side legal/OTP/finalization gates;
signing and persistence remain NOT IMPLEMENTED.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Legal consolidation-09B2A3 customer boundary

The four legal documents are now compact internally approved validation
candidates, not CURRENT customer copy. Product direction is no longer blocked
on unresolved wording choices, but entity completion, external legal/verifier
validation, canonical freeze, effective dates and hashes remain required.

The signup presentation contract is unchanged: one privacy-read intent, two
terms acceptances, a separate mandate signature and a separate
account-type-aware signer declaration. No legal candidate is written into the
existing legacy acceptance payload, and no parser observation becomes a party,
EAN, location, authority or mandate fact.

The future server action must use server-canonical party facts, enumerate every
EAN and relevant linked location, bind the approved evidence-pack fields and
block required Zakelijk/VvE downstream use until authority review is sufficient.
This documentation checkpoint adds no UI, OTP, signing, withdrawal, persistence,
submit, promotion, dashboard, remote or production behavior.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

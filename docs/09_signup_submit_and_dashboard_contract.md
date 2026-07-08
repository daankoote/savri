# Signup Submit And Dashboard Contract

Status: source of truth for the `/aanmelden` submit and dashboard bootstrap contract.

This document defines the intended backend contract for the moment a customer clicks `Start dossier` in the new Vite `/aanmelden` flow. Current implementation status is tracked below; this document remains the contract source of truth, not an implementation file.

## 1. Purpose

This document defines:

- the future submit contract for the current `/aanmelden` frontend skeleton
- how submit creates or starts the customer dashboard/dossier lifecycle
- the records the backend should create conceptually
- the dashboard bootstrap behavior after submit
- the open decisions that must be resolved before implementation

The old `dossier.html` wizard and current `api-dossier-*` endpoints are source material only. They must not be wired directly into the new app without contract redesign.

## Implementation Status

`api-app-signup-submit` write v2 endpoint is implemented and locally proven.

Current write v2 behavior:

- creates or matches a customer by normalized email
- creates an `app_customer_identities` row when needed
- creates an `app_customer_dossiers` submitted dossier shell
- creates `app_dossier_locations` from normalized payload locations or a fallback primary/applicant address
- creates `app_dossier_chargers` from nested or top-level charger payloads
- writes scoped `app_idempotency_keys`
- writes `app_intake_audit_events` and `app_audit_events`
- returns `mode: "write_v2"`, `request_id`, `customer_id`, `dossier_id`, `location_count`, `charger_count`, and `payload_hash`
- replays the same stored response for the same idempotency key and same payload
- returns `idempotency_conflict` for the same idempotency key with a different payload

Current write v2 intentionally does not create document slots, document uploads, legal version records, fee terms records beyond minimal accepted flag validation, customer timeline, support/messages, or kWh/result/fee lifecycle rows.

Frontend is still not connected.

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
- The backend creates the customer, dossier, locations, chargers, document slots, legal records, dashboard access, timeline events, audit events, and initial retention class in one controlled flow.
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

## 3. Current Frontend Payload

The current `/aanmelden` skeleton is still local-only from the browser. It is not wired to `api-app-signup-submit` yet.

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

The future submit request should normalize local draft state into one backend-facing payload.

Target shape:

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

Current write v2 implementation creates the customer/identity/dossier shell, locations, chargers, idempotency record, intake audit, and app audit rows. The remaining conceptual records are future write phases.

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

Current frontend UI bundles terms, privacy, and ENVAL fee behind one checkbox and shows draft legal popups. Final backend design may split this into separate versioned legal acceptances after legal review.

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
- success fee percentage
- current value: 10%
- no guarantee acknowledgement
- exact success trigger still pending final legal terms

Legal copy remains draft until reviewed.

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

Open auth decision:

- Supabase Auth:
  - stronger standard account/session model
  - built-in auth lifecycle
  - requires product decisions around magic links, email verification, and account UX
- Custom magic-link session:
  - closer to current legacy low-friction model
  - more control over dashboard bootstrap
  - requires careful session, revocation, expiry, and RLS design

Do not decide implementation in this document.

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
- Auth/RLS boundary must be designed before backend wiring.
- Customer can only see their own dossier.
- Dashboard should not show raw audit rows.
- Uploaded evidence must use signed upload URL and server-side hash confirmation later.
- Avoid localStorage unless the auth decision explicitly allows it.
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

Unresolved before implementation:

- Auth model: Supabase Auth or custom magic-link session.
- Whether submit requires all files immediately or creates open document slots.
- Exact legal copy and versions.
- Consent duration options.
- Fee success trigger and fee base.
- VAT/tax wording for fee.
- Partial success, reversal, audit correction, and clawback behavior.
- MID verification source.
- Energy bill/account holder evidence requirements.
- Dashboard route granularity.
- Internal review UI timing.
- Whether draft saving exists before final submit.
- How to handle duplicate customer email with multiple dossiers.
- Whether selected local files are uploaded before or after dashboard bootstrap.

## 16. Recommended Next Implementation After This Doc

A. Consent/terms content architecture document or draft placeholders

- Define legal text kinds, versioning, language, content hash, and acceptance UI placeholders.
- Keep final legal copy marked draft until reviewed.

B. Dashboard shell with mock/read-only state

- Build `/dashboard` and `/dashboard/dossiers/:dossierId` shell in `/app`.
- Use mock/read-only state only.
- No backend writes.

C. Signup submit backend contract refinement

- Turn this document into endpoint request/response contracts.
- Define validation, idempotency, audit, response, and error contracts.

D. Auth decision

- Choose Supabase Auth or custom magic-link sessions.
- Define customer identity and dashboard access scope.

E. Submit endpoint implementation later

- Implement only after the above contracts are accepted.
- Do not wire the new app to legacy endpoints as a shortcut.

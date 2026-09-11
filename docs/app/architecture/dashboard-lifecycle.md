# Dashboard Dossier Lifecycle Architecture

Status: CURRENT/TARGET Tenant Customer Portal lifecycle authority; not the
current implementation-order tracker.

Strategic status overlay (DECIDED/TARGET, 2026-09-01): this is the
reference/default tenant customer and backoffice journey. Operational requests,
review tasks, findings and audit belong to the resolved tenant and its
authorized workforce. `ENVAL` in historical/current reference copy is a
presentation label, not fixed operator, contract-party or reviewer authority.

## 1. Purpose

The platform is moving from signup intake to a tenant-operated customer
dashboard and dossier lifecycle.

The dashboard is the customer-facing post-signup surface. After signup, the customer should be able to see dossier status, requests, documents, communication, consents, and a readable timeline.

This document owns the Tenant Customer Portal lifecycle only. Tenant Operator
Console work queues/review, the ENVAL Control Console and future Verifier
Workspace are separate surfaces and authorization boundaries. Customer support
presentation resolves the tenant's approved support identity; it is not a
general ENVAL platform-ticket channel.

The old `dossier.html` wizard is source material only. It is not the target architecture for the new `/app` dashboard.

## 2. Product Direction

- Signup creates or starts a dossier.
- The customer receives dashboard access.
- The resolved tenant's authorized workforce reviews the dossier internally.
- The customer is generally done until the tenant requests more information or
  later yearly kWh/value input.
- Email notifies the customer.
- The dashboard is where the customer responds, uploads, corrects data, or views status.
- The customer sees:
  - dossier status
  - open requests
  - documents and document status
  - communication/support
  - accepted consents and terms
  - readable dossier timeline
  - later yearly kWh/value/result information

The TARGET domain direction is party -> representation/authority ->
connection/EAN -> location -> persistent charging asset(s) -> annual case/claim
period -> mandate/evidence/kWh/review/verification state. A new calendar year
creates period-specific truth, not a cloned permanent charger or connection.

## 3. Legacy Assets To Reuse Conceptually

Useful legacy concepts:

- Magic-link/session concepts for low-friction customer access.
- Audit events with request metadata, actor reference, idempotency, and state transitions.
- Signed upload URL flow.
- Server-side file hash confirmation before evidence is treated as confirmed.
- Document status and evidence-grade document handling.
- Declared/observed/evaluated separation in analysis.
- Retention/minimization tombstones for privacy-safe proof after cleanup.
- Outbound email queue and worker model.
- Immutable export/result artifacts where audit proof must survive runtime cleanup.

Boundary:

- Old wizard endpoints must not be wired directly into `/app` without contract redesign.
- The legacy flow assumes `dossier.html?d=<uuid>&t=<token>`, dossier-scoped session tokens, a one-page wizard, old consent text, and old payment/export assumptions.
- Existing Supabase code remains shared backend source material until a future backend contract task decides what to adapt, wrap, or replace.

## 4. Outdated Legacy Assumptions

Do not carry these assumptions into the target dashboard model:

- Static one-time dossier wizard as the primary customer surface.
- Dossier-scoped token as durable account identity.
- One address as the only address/location model.
- Old charger-count assumptions and old self-serve charger caps.
- Old document buckets as the final requirement model.
- One-document-per-charger-type rules as the final upload model.
- Old `terms`, `privacy`, and `mandaat` booleans as the full legal model.
- Old export/payment gate assumptions.
- Old binary positioning that either makes ENVAL Software the fixed
  customer-facing operator or removes the tenant-owned customer journey. The
  target is a generic platform with a resolved tenant-operated journey.
- Raw audit rows shown directly to customers.

## 5. Target Frontend Architecture

Current customer routes:

- `/dashboard`
- `/dashboard/aanvragen`
- `/dashboard/aanvragen/:caseReference`

`/dashboard` replace-redirects to the list. The list is projected server-side
from exact R7 customer-wide or case-scoped grants. The detail route owns the
selected application; refresh, direct navigation and browser history therefore
resolve the same case without a browser dossier dropdown.

Initial dossier page sections or tabs:

- Status
- Verzoeken
- Documenten
- Berichten/support
- Tijdlijn
- Toestemmingen
- Jaargegevens / kWh later

Implementation sequence:

- The route shell, Auth guard, backend read endpoint, and real factual frontend projection are CURRENT / LOCAL PROOF.
- Backend `api-app-dashboard-get` now exists as a locally proven customer-safe read endpoint.
- Frontend dashboard data now uses the read endpoint for factual app-backed fields.
- CUSTOMER_TIMELINE_V1 is CURRENT / LOCAL PROOF as an additive selected-case
  projection in `api-app-dashboard-get`. Its service-role-only read RPC
  revalidates Auth, identity/customer lineage and the exact R7 case/customer
  grant, then returns only opaque event IDs, four allowlisted types and UTC
  timestamps. Edge owns the fixed Dutch title/text mapping. Customer-visible
  signing is folded into `Dossier ontvangen`; `review_completed` is presented
  only as the past timeline event `Gegevens gecontroleerd`.
- One shared frontend status projection supplies the page subtitle and
  `Huidige status` block from the dossier status, curated timeline
  and active correction state. Unknown values use a fixed Dutch fallback and
  raw status enums are never rendered. The compact block contains only current
  status, ENVAL's current step and `Actie nodig? Ja/Nee`; completed timeline
  events never become a terminal dossier claim.
- The reusable document cards are CURRENT / LOCAL PROOF for authenticated MID and installation/acquisition invoice PDF upload, replacement, download, and audit-preserving withdrawal.
- Document section status is centralized:
  - red when required evidence is missing
  - orange while evidence is uploaded/in review or action is needed
  - green only after explicit accepted/approved/checked backend state
- Document changes are controlled by the server-derived `document_changes_allowed` projection.
- Withdrawal is hidden or blocked when document changes are not allowed.
- Mock-only future sections must not be sent as fabricated API values.
- Unsupported sections remain explicitly unavailable/open.
- Keep customer copy short and action-oriented.
- Do not wire backend writes until backend contracts are reviewed.
- Keep tenant-workforce review tooling out of the customer dashboard until
  roles and Auth boundaries are defined.

Optional later subroutes:

- `/dashboard/dossiers`
- `/dashboard/dossiers/:dossierId/requests`
- `/dashboard/dossiers/:dossierId/documents`
- `/dashboard/dossiers/:dossierId/messages`
- `/dashboard/dossiers/:dossierId/timeline`
- `/dashboard/dossiers/:dossierId/consents`
- `/dashboard/dossiers/:dossierId/kwh`
- `/dashboard/dossiers/:dossierId/year-overview`

Recommendation:

- Keep request, document, consent, and kWh views as sections/tabs inside the
  current `/dashboard/aanvragen/:caseReference` detail first. The current
  timeline remains a section in the existing application overview.
- Split into deeper routes only when the UI or state model needs it.

## 6. Target Backend Architecture

This is conceptual only. Do not implement until contracts are written.

Identity and access:

- `customers`
- `customer_identities`
- `customer_sessions` or Supabase Auth mapping
- `customer_login_links`
- login request and session exchange functions

Dossier lifecycle:

- `customer_dossiers`
- `dossier_locations`
- `dossier_chargers`
- `dossier_status_events`
- `dossier_review_states`
- signup submit and dashboard read functions

Documents:

- `document_slots`
- `document_files`
- `document_versions`
- `document_review_events`
- signed upload URL function
- upload confirm function
- download URL function

Requests and responses:

- `customer_requests`
- `request_responses`
- request list/read function
- request response function

Communication:

- `support_threads`
- `support_messages`
- `notification_events`
- outbound email worker integration

These future support records are tenant-local customer-service communication.
They are not ENVAL platform-support tickets. Tenant platform-support requests
require a separate workforce capability and control-plane workflow.

Legal and commercial:

- `legal_text_versions`
- `consent_acceptances`
- `customer_mandates`
- `fee_terms`
- `fee_model_versions`
- accepted terms/privacy/fee version records

Review:

- `review_tasks`
- `review_findings`
- `human_review_decisions`
- evidence observations/evaluations

Yearly kWh and result:

- `kwh_periods`
- `readings`
- `kwh_evidence`
- provider/readout connection records if needed later
- result events
- fee calculation events
- customer year overview records

Timeline and retention:

- customer-readable timeline read model
- internal audit events
- retention policies
- retention/minimization events
- privacy-hard tombstones

## 7. Dossier Status Model

Customer-readable statuses:

- `draft`
- `submitted`
- `needs_customer_action`
- `under_review`
- `eligible_ready_for_inboeking`
- `inboeking_in_progress`
- `year_kwh_required`
- `result_pending`
- `successful_value_realized`
- `fee_due`
- `paid_out_or_settled`
- `rejected_or_paused`
- `expired_minimized`

Rules:

- Customer-readable statuses should be simple.
- Internal statuses may be more granular.
- Internal statuses should map to a smaller customer status set.
- Status changes must be auditable.
- Status copy must avoid guarantees around award, payout, timing, certification, or document acceptance.

## 7A. Target Signed-Intake Promotion And Correction Model

Status: CURRENT PROVEN — LOCAL ONLY for the signed-case customer projection; later operational lifecycle remains TARGET. Detailed contract: `docs/app/contracts/intake-verification-promotion.md`.

Target rules:

- `typed_name_otp_v1` finalization is the signed public submission and proves bounded email-channel control; a separate email-verification promotion link is `SUPERSEDED`.
- Server-only atomic promotion creates/reuses durable customer/party roots and creates one `app_cases` root; it does not create a parallel `app_customer_dossiers` owner.
- The active intake/case projection is `submitted_for_review`; customer copy is `Ondertekend en ingediend` and then `In behandeling`.
- 09C1C reuses the existing dashboard renderer/cache. Signed-case reads use `app_cases`, lifecycle, case locations and evidence; the compatibility selector equals the case UUID and no `app_customer_dossiers` row is created.
- A correctable internal-review result projects `Actie nodig` and targeted edit capability.
- Valid unaffected sections remain fixed.
- Only affected sections or records become editable.
- The correction action is `Correcties indienen`.
- The dashboard must not show a permanent generic `Dossier indienen` button after successful promotion.
- Internal review state never implies external inboekverificatie, verifier approval or NEa acceptance.

Status and editability are separate server-derived concepts:

- fixed does not always mean green;
- green does not mean the browser may edit;
- uploaded evidence can remain orange while fixed and under review;
- rejected or insufficient evidence can be action-needed and targeted editable.

The frontend must use backend-derived capabilities for mutation. It must not infer lock/edit rights from stoplight labels, filenames, version numbers, titles, or hidden UI.

## 8. Customer Request/Response Model

Flow:

1. The resolved tenant creates a request through authorized workforce tooling.
2. An email notification goes out.
3. The customer opens the dashboard.
4. The customer responds in the dashboard.
5. The response can include text, upload, data correction, consent update, or kWh input.
6. The tenant's authorized workforce reviews the response.
7. The request moves to the next status.

Every request needs:

- request type
- dossier scope
- optional location scope
- optional charger scope
- optional document slot scope
- short customer-facing question
- response type
- status
- email notification event
- customer response record
- tenant review outcome
- audit trail

Example requests:

- Upload missing invoice.
- Provide energy bill.
- Confirm address/account holder.
- Correct MID or serial number.
- Provide KVK extract.
- Confirm mandate or permission.
- Enter yearly kWh.

Email should notify and link to the dashboard. Email should not become the source of truth for attachments or answers.

## 9. Consent/Terms Architecture

Signup and dashboard flows need versioned legal/commercial records for:

- permission to process personal/business/VVE data
- permission to process uploaded evidence and documents
- verifier/NEa/CAR-related permission or mandate-like consent
- consent duration: "Hoe lang wilt u toestemming geven?"
- terms and conditions
- privacy/processing information
- fee/success terms
- no-guarantee acknowledgement

No-guarantee acknowledgement should cover:

- no guarantee of ERE award or acceptance
- no guarantee of payout, revenue, timing, or certification
- no guarantee every uploaded document is accepted

Each acceptance should store:

- text kind
- version
- content hash
- language
- title or display label
- accepted_at
- customer identity
- dossier scope where relevant
- request metadata
- fee model version where commercial
- success fee percentage where commercial

Withdrawal/change handling:

- record withdrawal or replacement explicitly
- decide effect on dossier status
- create audit evidence
- trigger retention/minimization review where needed
- keep only legally necessary proof after withdrawal/minimization

Legal copy is draft until reviewed.

## 10. Tenant Review Model

Tenant review should check:

- address/person/company match
- energy bill or equivalent evidence
- MID number existence
- MID relationship to charger/person/company where evidence allows
- charger ownership or use relationship via installation invoice
- backend/supplier/manufacturer information
- consents and permission scope
- document integrity and replacement history
- later yearly kWh evidence or readout

Analysis model:

- Keep declared customer data separate from observed document data.
- Keep observed data separate from evaluated comparisons.
- Human review decisions are separate from automated analysis.
- Analysis supports tenant human review.
- Analysis must not be treated as an automatic compliance, certification, or acceptance claim.

## 11. Customer-Readable Audit/Timeline

The dashboard should show a readable timeline, not raw internal audit rows.

Timeline examples:

- Dossier gestart
- Gegevens ontvangen
- Adres gecontroleerd
- Factuur ontvangen
- Document geaccepteerd / opnieuw nodig
- {{tenant_display_name}} vraagt aanvullende informatie
- Reactie ontvangen
- Dossier in beoordeling
- Jaaroverzicht beschikbaar

Rules:

- Internal audit remains richer and more technical.
- Customer timeline events should be concise.
- Do not expose internal actor refs, raw request metadata, or low-level event payloads.
- Timeline should help the customer understand status and next action.

## 12. Retention/Minimization

Guardrails:

- Draft dossiers need expiry/minimization rules.
- Customers should receive reminders before cleanup where appropriate.
- Customer can continue, complete, or withdraw before cleanup.
- Abandoned drafts should not be kept indefinitely.
- After minimization, preserve only privacy-hard tombstone/audit proof where needed.

Separate retention classes should be defined for:

- unsubmitted draft
- submitted but abandoned/no response
- rejected or paused dossier
- successful/result dossier
- legal, fee, and audit evidence

Retention behavior must be explicit before backend implementation.

## 13. External Research Needed

Research before hard product/backend claims:

- MID number existence verification.
- Linking MID to charger/person/company.
- Supplier/manufacturer/backend provider verification routes.
- Energy bill/address/account holder verification.
- NEa/CAR permission scope.
- kWh/year evidence and readout options.
- Fee/legal success trigger, fee base, VAT/tax wording, partial success, reversal, and clawback.

## 14. Recommended Implementation Sequence

Phase 0: this document

- Lock dashboard/dossier lifecycle architecture as current source of truth.

Phase 1: backend contract design, no implementation

- Define signup submit, dashboard read, requests, uploads, consents, timeline, and retention contracts.

Phase 2: auth/customer account decision

- Decide Supabase Auth versus custom magic-link account sessions.
- Define customer identity, session, and dossier access scope.

Phase 3: dashboard frontend shell with read-only data

- Build route shell and customer dashboard layout. CURRENT / LOCAL PROOF.
- No backend writes.

Phase 4: signup submit backend MVP

- Convert frontend signup state into one controlled backend submit.
- Create customer/dossier/location/charger/document-slot/legal records through reviewed contracts.

Phase 5: dashboard read-only MVP

- Customer can log in and see factual app-backed dossier, location, charger, document-slot, and legal-acceptance data. CURRENT / LOCAL PROOF.
- Requests, support, kWh, results, fees, payouts, reports, and exports remain OPEN.

09C1C-R1 transition rule:

- Account is not case; one verified account may access multiple customer-owned cases.
- The CURRENT read model normalizes supported legacy dossiers and signed-signup cases into one collection.
- Deduplication requires explicit source lineage/foreign-key provenance; e-mail, name and address are forbidden heuristics.
- A new application creates a new case. Updating documents or correcting an existing case remains a separate intent.
- Server customer/case ownership remains authoritative; the receipt and account handoff are presentation only.

09C1C-R7 portal-authority rule:

- Verified Auth alone opens no portal. Customer/business access requires an
  explicit database-owned customer access grant and accessible case.
- The database classifies Particulier as `customer` and Zakelijk/VvE as
  `business`; the frontend presents but does not derive this decision.
- Authenticated e-mail is verified-session/server context, not a freely
  claimable application field.
- Signing and OTP remain required before promotion; only promotion may create
  or reuse the compatible customer and create one new case.
- One account may access one or multiple explicitly granted cases and contexts.
  `Nieuwe aanvraag` adds a new case; existing-case correction remains separate.
- The CURRENT application index is `app_customer_application_index_read_v1`.
  Edge supplies its actor from the validated JWT, while the RPC revalidates the
  confirmed Auth user, active identity/customer lineage and exact R7 grant.
  Labels use one unambiguous customer-safe location, otherwise an existing
  dossier number, otherwise received date and a shortened case reference. MID,
  charger cardinality and browser-supplied identity/tenant fields are not index
  or label authority.

09C1C-R6 multi-context rule:

- Auth principal is an access identity, not customer/service recipient, party,
  case, account type or representation authority.
- One principal may have explicit server-owned access to zero or more separate
  customer contexts and their cases; customer context owns account type.
- Dashboard aggregation follows only access-grant and case lineage. E-mail,
  Auth UUID, address, MID and safe reference are not merge/access heuristics.
- Zakelijk/VvE case visibility leaves authority review incomplete.
- Authenticated promotion clears the current principal's dashboard/bootstrap
  cache before navigation, so the first dashboard read returns current truth.

Phase 6: customer document module

- Authenticated dashboard upload, replacement, download, and withdrawal for current MID and invoice PDF slots are CURRENT / LOCAL PROOF.
- No hard delete is used for customer withdrawal.
- Full dossier draft/submit/lock/targeted-unlock lifecycle remains OPEN.

Phase 7: request/respond + uploads

- The resolved tenant can request information through authorized workforce.
- Customer responds and uploads through dashboard.

Phase 8: internal review workflow

- Add tenant-bound review tasks, findings, human review decisions and customer
  follow-up requests.

Phase 9: yearly kWh/result/fee lifecycle

- Add yearly kWh input/readout, result events, tenant-configured fee calculation
  and customer year overview.

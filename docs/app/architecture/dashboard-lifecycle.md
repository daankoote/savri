# Dashboard Dossier Lifecycle Architecture

Status: source of truth for the next ENVAL phase.

## 1. Purpose

ENVAL is moving from signup intake to a customer dashboard and dossier lifecycle.

The dashboard is the customer-facing post-signup surface. After signup, the customer should be able to see dossier status, requests, documents, communication, consents, and a readable timeline.

The old `dossier.html` wizard is source material only. It is not the target architecture for the new `/app` dashboard.

## 2. Product Direction

- Signup creates or starts a dossier.
- The customer receives dashboard access.
- ENVAL reviews the dossier internally.
- The customer is generally done until ENVAL requests more information or later yearly kWh/value input.
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
- Old neutral infrastructure positioning where ENVAL is not the customer-facing inboekservice.
- Raw audit rows shown directly to customers.

## 5. Target Frontend Architecture

Future customer routes:

- `/dashboard`
- `/dashboard/dossiers/:dossierId`

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
- Mock-only future sections must not be sent as fabricated API values.
- Unsupported sections remain explicitly unavailable/open.
- Keep customer copy short and action-oriented.
- Do not wire backend writes until backend contracts are reviewed.
- Keep internal ENVAL review tooling out of the customer dashboard until roles and auth boundaries are defined.

Optional later routes:

- `/dashboard/dossiers`
- `/dashboard/dossiers/:dossierId/requests`
- `/dashboard/dossiers/:dossierId/documents`
- `/dashboard/dossiers/:dossierId/messages`
- `/dashboard/dossiers/:dossierId/timeline`
- `/dashboard/dossiers/:dossierId/consents`
- `/dashboard/dossiers/:dossierId/kwh`
- `/dashboard/dossiers/:dossierId/year-overview`

Recommendation:

- Keep request, document, timeline, consent, and kWh views as sections/tabs inside `/dashboard/dossiers/:dossierId` first.
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

## 8. Customer Request/Response Model

Flow:

1. ENVAL creates a request.
2. An email notification goes out.
3. The customer opens the dashboard.
4. The customer responds in the dashboard.
5. The response can include text, upload, data correction, consent update, or kWh input.
6. ENVAL reviews the response.
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
- ENVAL review outcome
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

## 10. ENVAL Review Model

ENVAL review should check:

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
- Analysis supports ENVAL review.
- Analysis must not be treated as an automatic compliance, certification, or acceptance claim.

## 11. Customer-Readable Audit/Timeline

The dashboard should show a readable timeline, not raw internal audit rows.

Timeline examples:

- Dossier gestart
- Gegevens ontvangen
- Adres gecontroleerd
- Factuur ontvangen
- Document geaccepteerd / opnieuw nodig
- ENVAL vraagt aanvullende informatie
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
- Requests, support, timeline, kWh, results, fees, payouts, reports, and exports remain OPEN.

Phase 6: request/respond + uploads

- ENVAL can request information.
- Customer responds and uploads through dashboard.

Phase 7: internal review workflow

- Add ENVAL review tasks, findings, human review decisions, and customer follow-up requests.

Phase 8: yearly kWh/result/fee lifecycle

- Add yearly kWh input/readout, result events, fee calculation, and customer year overview.

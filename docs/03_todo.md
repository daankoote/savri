# ENVAL TODO

## Phase 0: Product Positioning And Claim Boundaries

- Lock ENVAL as a commercial ERE inboekservice, not just dossier infrastructure.
- Lock the intended 10% success fee model.
- Treat `docs/06_fee_model_and_service_terms.md` as the working commercial source of truth.
- Legal/result definition for result-based fee.
- Define the exact "success" trigger for the 10% fee.
- Define whether the 10% applies on a gross or net basis.
- Define VAT/tax wording if relevant later.
- Define partial success handling.
- Define reversal, audit correction, and clawback handling.
- Define safe public claims around eligibility, fees, documents, and ERE inboeking.
- Explicitly avoid guarantees around approval, payout, timing, or certification.
- Clarify legal and commercial responsibility before final terms go live.
- Public copy pass: translate legal/audit doctrine into customer-safe website language before production.
- Resolve legacy neutral-infrastructure wording in `docs/documenten` before production copy.

## Phase 1: Routing And Page Architecture

- Initial route/page architecture exists in `/app`.
- Keep public pages concise: Home, Aanmerking as a home section, Aanmelden, Upload, ERE info, Contact, Privacy, Voorwaarden, and NL/EN.
- Keep pricing/fee content on the homepage for now.
- Keep customer-facing pages concise; avoid roadmap/module-dashboard copy.
- Keep current Netlify root production untouched until migration is explicitly approved.
- Later define exact calculator assumptions before production use.
- Later validate calculator assumptions for both kilometer-based and kWh-based calculation.
- Later connect the calculator to a real ERE/value model if needed.
- Signup/intake architecture is documented in `docs/07_signup_intake_architecture.md`.
- Signup form skeleton is implemented frontend-only in `/app/src/features/signup`.
- Dashboard/dossier lifecycle architecture is documented in `docs/08_dashboard_dossier_lifecycle_architecture.md`.
- Signup submit and dashboard bootstrap contract is documented in `docs/09_signup_submit_and_dashboard_contract.md`.
- `api-app-signup-submit` write v3 is locally proven; it creates customer/identity/dossier shell, locations/chargers, expected document slots, and legal acceptance records from the submit payload.
- Signup payload mapper, local-only contract dry-run proof, frontend API client, and controlled `/app` submit wiring are implemented; submit stays on-page and does not redirect to dashboard yet.
- Local browser-QA for `/aanmelden` submit is green: validation reached `Concept klaar`, submit returned OPTIONS 200 and POST 200 to local `api-app-signup-submit`, the success panel showed `Aanmelding ontvangen` plus Dossier ID, and no dashboard redirect occurred.
- Next backend/app items: document upload processing, legal version detail hardening, customer timeline projection, and dashboard bootstrap later.
- PDF invoice parser adapter proof exists in `/app` for client-side text-PDF parsing only; it is not upload processing and does not call backend.
- Local PDF invoice preview is wired into `/aanmelden` invoice slots for PDF facturen; it shows parsed MID/serial/address summary, blocks non-PDF selection for that slot, and does not upload or verify documents.
- Image OCR remains worker/internal later; browser image work should stay limited to precheck, compression, and hash.
- P0 before production/deploy: treat the previously exposed runtime token/key-like value as leaked and rotate it. Do not print or preserve the value in docs, reports, commits, or chat.
- Legacy local reset is blocked by missing baseline for old dossier tables; app foundation migration was tested isolated.
- Legacy Supabase functions frozen; app backend work must use `api-app-*` and app_* tables.
- Customer dashboard shell exists as mock/read-only frontend under `/dashboard`.
- Dashboard cleanup/stabilization removed unused asset-overview components and old mock data.
- Signup skeleton now includes account-type tabs, business/VVE banners, address fields, location tabs for zakelijk/VVE, charger details, document slots, and local-only consent/terms checklist.
- Next: strengthen client-side validation and field-level error display.
- Then add import parser architecture/implementation.
- Then refine document upload UX/details.
- Then define KVK, consent, signature, and solar exportability requirements before production.
- Then source real charger model dropdown data from verified competitor inspection, manufacturer data, or internal rules.
- Address lookup is now integrated client-first in `/aanmelden` with direct PDOK lookup, local normalization, debounce, memory-only cache, and no backend save.
- Next: browser-QA direct PDOK lookup with valid, not-found, ambiguous suffix, and network/CORS failure cases.
- Browser-QA that Adres/Stad/Land remain visible after a successful lookup and no-op blur.
- Browser-QA postcode, huisnummer, suffix, email, phone, name, and KVK validation messages.
- Browser-QA single consent checkbox and legal draft popups on Start dossier.
- Browser-QA suffix edge cases, including apartment/addition values seen in real customer addresses.
- Later define future country/provider support beyond the current Dutch PDOK lookup.
- Later test production browser/CORS behavior against PDOK before relying on it publicly.
- Later add optional read-only `api-signup-address-lookup` fallback only if direct PDOK is unreliable.
- Later persist verified address data only through the final signup/backend submit contract.
- Later browser-QA address lookup loading, unavailable, success, and error states per independent address block.
- Then verify KVK requirements, including whether document age limits apply.
- Then review backend API contracts before wiring.
- Then wire backend only in a separate backend task.
- Browser-QA the dashboard sidebar at `/dashboard` on desktop and mobile.
- Browser-QA the active private charger card, document pills, consent/download placeholders, and kWh upload placeholder.
- Browser-QA charger row selection and inner accordion calm layout.
- Browser-QA that dashboard charger rows and inner sections are collapsed by default and toggle closed cleanly.
- Browser-QA that top charger rows use status pills while inner dashboard rows/cards use status dots.
- Browser-QA the calmer active private dashboard: read-only rows, evidence cards, grouped kWh, and Aanpassingen buttons.
- Later decide auth model before dashboard protection.
- Later define backend dashboard read model.
- Later wire signup submit to dashboard bootstrap only after contract review.
- Later define business/VVE dashboard detail pages.
- Later define Contact ENVAL AI bot/message flow.
- Later define regulatory handling for Verhuizing and Zakelijk rijden.
- Later define Aanpassingen flows for Verhuizing and Zakelijk rijden.
- Later implement ENVAL release/edit mode using signup form components.
- Later define report download backend for audit report and jaaroverzicht.
- Later research provider/backend connection flow for kWh readout.

## Phase 2: Public Commercial Pages

- Build the commercial homepage and core explanation pages on the shared shell.
- Define customer-facing pricing page and 10% success-fee explanation.
- Use reusable sections, cards, buttons, badges, and layout primitives.
- Avoid one-off page CSS where shared app patterns can handle the need.

## Phase 3: Eligibility Flow

- Build the eligibility module as the first low-risk interactive product flow.
- Capture answer structure and decision messaging before backend writes.
- Keep no-guarantee language visible in the flow.
- Define support-reduction requirements: clear required answers, why they matter, what blocks progress, and what remains uncertain.

## Phase 4: Signup And Document Upload Flow

- Define signup state and document requirements.
- Planned signup form sections: persoonlijke gegevens, laadpaalgegevens, documentatie uploaden.
- Current signup form supports particulier, zakelijk, and VVE intake paths.
- Support dynamic unlimited chargers; do not hardcode a maximum of 4 chargers.
- Support dynamic unlimited locations for zakelijk/VVE; do not hardcode a location maximum.
- Validate client-side first; write to backend only at final submit later.
- Manual entry and import must normalize into the same `locations[].chargers[]` state.
- Documents must attach to stable charger client IDs.
- Current skeleton has local-only file inputs; no storage or upload.
- Later define exact KVK-uittreksel age requirement if required for zakelijk/VVE.
- Later define exact consent text and signature implementation.
- Later finalize legal copy for terms, privacy, fee, no-guarantee, and control/mandate permission.
- Later decide whether control permission must be separate from the bundled checkbox.
- Later decide if and when consent duration is needed.
- Later define upload, consent, and signature implementation details before production.
- Define the exact year overview/dossier output customers receive after result.
- Design upload UX before wiring backend calls.
- Preserve audit-conscious user messaging around evidence and review.
- Define support-reduction requirements for upload: required documents, accepted formats, missing information, review status, and next action.
- Define pause/reject/request-more-information states when evidence is insufficient.

## Phase 5: Audit-Worthy Backend Contract Review

- Review Edge Function request/response contracts before wiring `/app`.
- Audit/evidence/anti-fraud backend doctrine must be enforced in schema and endpoints.
- Legacy Supabase functions are frozen: `api-dossier-*`, `api-lead-submit`, `mail-worker`, `retention-worker`, and `locked-unpaid-reminder-worker` remain fallback/legacy only; do not add new `/app` behavior there.
- Confirm customer records, eligibility answers, documents, consents, status transitions, audit events, exports, retention, privacy, and evidence versioning needs.
- Confirm fee-model fields: fee model/version, success percentage, accepted terms/privacy versions, payout/value realization event, fee calculation event, and fee-relevant audit events.
- Confirm backend alignment with `docs/06_fee_model_and_service_terms.md`.
- Do not change Supabase functions/migrations unless a backend task explicitly requires it.

## Phase 6: NL/EN Language Structure

- Define route, copy, and legal-copy version strategy for Dutch and English.
- Track where language/version awareness matters for consent, terms, privacy, and product claims.

## Phase 7: Privacy, Terms, And Contact Finalization

- Finalize privacy and terms for the commercial inboekservice model.
- Add contact and support expectations.
- Confirm legal responsibility and role boundaries before production migration.

## Phase 8: Migration And Deploy Plan

- Plan any Netlify/deploy switch as a separate approved task.
- Keep root HTML/assets unchanged until migration planning is complete.
- Run browser QA for `/app` at `http://localhost:5175/` before any deployment decision.

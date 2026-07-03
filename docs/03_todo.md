# ENVAL TODO

## Phase 0: Product Positioning And Claim Boundaries

- Lock ENVAL as a commercial ERE inboekservice, not just dossier infrastructure.
- Lock the intended 10% success fee model.
- Treat `docs/06_fee_model_and_service_terms.md` as the working commercial source of truth.
- Define the exact "success" trigger for the 10% fee.
- Define whether the 10% applies on a gross or net basis.
- Define VAT/tax wording if relevant later.
- Define partial success handling.
- Define reversal, audit correction, and clawback handling.
- Define safe public claims around eligibility, fees, documents, and ERE inboeking.
- Explicitly avoid guarantees around approval, payout, timing, or certification.
- Clarify legal and commercial responsibility before final terms go live.

## Phase 1: Routing And Page Architecture

- Next milestone: route/page architecture.
- Define public pages: Home, Geschiktheid, Prijs/Fee, Aanmelden, Upload, ERE info, Contact, Privacy, Voorwaarden, and NL/EN.
- Add routing after the landing-page shell and design system are stable.
- Keep customer-facing pages concise; avoid roadmap/module-dashboard copy.
- Keep current Netlify root production untouched until migration is explicitly approved.
- Later define exact calculator assumptions before production use.
- Later validate calculator assumptions for both kilometer-based and kWh-based calculation.
- Later connect the calculator to a real ERE/value model if needed.
- Add the eligibility flow after the calculator/page shell is approved.
- Later route the Aanmelden CTA to a real signup flow.

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
- Define the exact year overview/dossier output customers receive after result.
- Design upload UX before wiring backend calls.
- Preserve audit-conscious user messaging around evidence and review.
- Define support-reduction requirements for upload: required documents, accepted formats, missing information, review status, and next action.
- Define pause/reject/request-more-information states when evidence is insufficient.

## Phase 5: Audit-Worthy Backend Contract Review

- Review Edge Function request/response contracts before wiring `/app`.
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

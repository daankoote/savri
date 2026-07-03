# ENVAL Product Model

## Product Position

ENVAL is a commercial ERE inboekservice for eligible home-charging users.

ENVAL:

- checks whether customers may be eligible
- binds customers directly
- collects charger, address, consent, invoice, and evidence information
- builds and manages an audit-worthy customer dossier for the inboeking
- performs the ERE inboeking service within the terms

The product is no longer positioned primarily as neutral dossier infrastructure. Dossier structure and audit trail remain critical, but they support a direct commercial service.

## Commercial Model

- Intended customer-facing fee model: 10% success fee.
- The strategic goal is to compete through a lower fee and a simpler, clearer process.
- Do not state competitor percentages as fact unless they are later sourced and verified.
- The lower fee only works if the product is low-support by design and highly audit-worthy by design.
- Customer-facing flows must be explicit about required documents, current status, missing information, and claim boundaries.
- Audit readiness is critical because audit handling and support overhead are likely major cost drivers.
- Exact fee trigger and definition of "success" must be finalized in the terms.
- Future backend work must store the accepted fee model/version per customer.
- Working commercial source of truth: `docs/06_fee_model_and_service_terms.md`.

## Core Product Areas

- ENVAL service explanation
- Price / fee model
- Eligibility check
- Signup and intake
- Charger and address data
- Invoice/document upload
- Invoice analysis and consistency checks
- Consent records
- Status tracking for eligibility, missing information, evidence quality, and inboeking execution
- Audit events and evidence history
- ERE education and source-based information
- Privacy, terms, contact, and NL/EN support

## Claim Boundaries

- Do not promise that EREs will always be granted.
- Do not imply that uploaded documents are automatically accepted by all parties.
- Avoid careless guarantee language around revenue, approval, timing, or certification.
- Do not guarantee payout, value realization, certification, or acceptance of every uploaded document.
- ENVAL may pause, reject, or request more information when evidence is insufficient.
- Keep role boundaries explicit in public copy and terms.
- Legal and commercial responsibility must be clarified before final terms go live.

## Rebuild Scope

The rebuild starts by modeling the frontend cleanly in `/app`. The live static root and Supabase backend remain source material and shared assets, not immediate rewrite targets.

# ENVAL Product Model

## Product Position

ENVAL is a customer-facing commercial ERE inboekservice for eligible home-charging users.

ENVAL:

- checks whether customers may be eligible
- binds customers directly
- collects charger, address, consent, invoice, and evidence information
- builds and manages an audit-worthy customer dossier for the inboeking
- begeleidt en dient/inboekt namens klant of via een aangewezen partij binnen de voorwaarden

The product is no longer positioned primarily as neutral dossier infrastructure. Dossier structure and audit trail remain critical, but they support a direct commercial service.

Role boundaries:

- ENVAL is geen verificateur.
- ENVAL is geen certificeerder.
- ENVAL does not make compliance, certification, verification, acceptance, payout, revenue, timing, or document-approval guarantees.
- ENVAL keeps internal audit/evidence truth separate from customer-facing status and customer timeline copy.
- Frontend may assist; backend decides.
- Frontend prechecks and parsing can improve UX, latency, and support load, but backend validation, normalization, authorization, hashing, audit, and lifecycle decisions remain the source of truth.

## Commercial Model

- Intended customer-facing result-based fee model: 10% success fee.
- The strategic goal is to compete through a lower fee and a simpler, clearer process.
- Do not state competitor percentages as fact unless they are later sourced and verified.
- The lower fee only works if the product is low-support by design and highly audit-worthy by design.
- Customer-facing flows must be explicit about required documents, current status, missing information, and claim boundaries.
- Audit readiness is critical because audit handling and support overhead are likely major cost drivers.
- Exact fee trigger and definition of "success" must be finalized in the terms.
- Exact legal definition of "result" must be finalized before result-based fee production use.
- Future backend work must store the accepted fee model/version per customer.
- Working commercial source of truth: `docs/app/legal/fee-model-and-service-terms.md`.

## Audit, Evidence, And Anti-Fraud Doctrine

ENVAL expects external-party audit pressure and fraud risk. The backend must therefore be secure, backend-checked, audited, documented, and anti-fraud by design.

Rules:

- Frontend can optimize, guide, prefill, precheck, compress, parse, and reduce latency/cost.
- Frontend is never trusted as truth.
- Backend must validate, normalize, authorize, hash, audit, and decide.
- Every fraud-relevant or audit-relevant step must be server-checkable and audit-logged.
- Internal audit/evidence is technical and internal.
- Customer timeline/status is a curated projection, not raw audit.
- Raw audit is not exposed directly to customers.
- Fraud controls include idempotency, rate limits, abuse controls, document hash confirmation, immutable versions, legal text versioning, fee terms versioning, MID/year claim discipline, correction/revision flow, anti-enumeration, RLS, and server-only sensitive tables.

## Public Copy Boundary

The legal role and audit doctrine above is internal, legal, terms, and auditor-facing guidance. It is not public homepage, signup, dashboard, pricing, or marketing copy.

Public website copy must stay simple, commercial, and customer-oriented.

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

Legal/audit doctrine remains valid for internal docs, legal terms, service descriptions, and auditor-facing documentation. Before production, this doctrine must be translated into customer-safe website language.

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

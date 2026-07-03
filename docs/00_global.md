# ENVAL Global

ENVAL is a Dutch EV/home-charging ERE inboekservice for eligible home-charging users.

The product is customer-facing and commercial: ENVAL markets the service directly, binds customers directly, checks eligibility, collects documents, builds and manages an audit-worthy customer dossier, and performs the ERE inboeking service within the terms. The backend and operational process must remain highly audit-worthy by design.

## Current Operating Model

- Current production remains the static Netlify site in the repository root.
- Root HTML, root assets, and current Netlify routing are legacy/production for now.
- New frontend development happens in `/app` using Vite on port `5175`.
- Supabase remains the shared backend surface in `/supabase`.
- Existing `docs/documenten/` files are historical/source material until normalized.

## Product Position

- ENVAL is a commercial inboekservice that performs the ERE inboeking service for eligible customers.
- ENVAL is not just a technical dossier layer.
- Core flows are eligibility, intake, document collection, consent, audit trail, dossier management, and inboeking service execution.
- Audit-worthiness is a product requirement, not an internal technical detail.
- Intended customer-facing fee model: 10% success fee.
- ENVAL competes through a lower fee, clearer process, and stronger digital self-service.
- Any competitor fee comparison must be sourced/verified before it is presented as fact.
- Support reduction is a core product requirement: the flow must make requirements, status, and missing information obvious to customers.
- Audit readiness is commercially critical because support and audit handling are likely major cost drivers.
- Working commercial source of truth: `docs/06_fee_model_and_service_terms.md`.

## Fee Model Notes

- Success fee: 10%.
- Exact definition of "success" must be finalized in the terms.
- Terms must define when the fee becomes due.
- Future backend work must store the applicable fee model/version per customer.
- Pricing copy may say ENVAL is designed to be leaner, clearer, and more efficient.
- Do not make unsupported factual claims about competitor percentages until verified.
- Current working assumptions and backend implications are defined in `docs/06_fee_model_and_service_terms.md`.

## Planned Site Sections

- ENVAL info
- Price / fee info
- Eligibility
- Signup + document upload
- ERE info
- Privacy
- Terms
- Contact
- NL/EN language support

## Claim Boundaries

- No careless guarantee language.
- No promise that EREs will always be granted.
- No guarantee of payout, revenue, timing, certification, or acceptance of every uploaded document.
- ENVAL may pause, reject, or request more information when evidence is insufficient.
- Role boundaries must stay clear even though ENVAL is commercially customer-facing.
- Legal and commercial responsibility must be clarified before final terms go live.

## Controlled Rebuild Rules

- No production deploy switch without explicit approval.
- No root frontend rewrite until the new app architecture is accepted.
- No Supabase rewrite during frontend scaffolding.
- Keep changes small, reversible, and easy to inspect.

## UI Direction

- The new UI is a professional redesign, not a copy of the old static website.
- The old root site is content/reference material and production fallback only.
- The homepage must be concise, customer-facing, and commercial.
- The homepage must sell the service, not present an internal roadmap or module dashboard.
- Less text is better: use only text that reduces customer questions.
- Every visible text line must help the customer understand the offer, decide, or start.
- Detailed caveats belong in terms, privacy, ERE info, FAQ, or flow-specific screens.
- CSS must be modular, reusable, and shared across the app.
- Use a tokens, base, layout, components, utilities structure.
- Avoid page-specific styling unless there is a clear reason.
- Avoid inline styling except trivial dynamic values when unavoidable.

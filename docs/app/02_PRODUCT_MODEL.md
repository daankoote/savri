# ENVAL Product Model

## Product Position

Status: DECIDED/TARGET for the managed-SaaS/white-label product direction;
CURRENT PROVEN only where explicitly tied to current code/schema/proof.

ENVAL is one generic B2B managed-SaaS and white-label software platform for
separate ERE-E inboekdienstverleners. The current ENVAL-branded portal is the
reference/default tenant journey. It is not proof that ENVAL Software is the
regulated operator, REV account holder, ERE trader, independent verifier or
end-customer contracting party.

The platform:

- supports a tenant-owned customer journey and eligibility workflow;
- collects tenant-local charger, address, consent, invoice and evidence data;
- builds and manages an audit-worthy tenant-local customer dossier;
- supports the tenant's inbooking workflow within that tenant's approved
  regulatory, operational, legal and commercial terms; and
- keeps generic platform ownership/configuration separate from tenant business
  truth and authority.

The tenant/inboekdienstverlener carries the regulated operational
responsibility. ENVAL supplies the software layer. Tenant identity,
presentation brand, legal operator, support provider, customer contracting
party and privacy role are separate concepts.

Status split:

- CURRENT PROVEN: intake capture, app dossier foundation, app audit/idempotency, authenticated dashboard document lifecycle, immutable document versions, and customer-safe dashboard projection where current code/schema/proofs show them.
- TARGET: tenant-bound legal identity, branding, customer contracts, fee
  configuration, signing/legal bundles, audit and deny-by-default isolation,
  with the minimum tenant-ready sequence governed by the completed SaaS gap
  audit. TF01 fixed-plane execution binding is CURRENT PROVEN LOCAL; tenant
  configuration, portable provenance, tenant #2 and production isolation are
  not.
- SUPERSEDED/HISTORICAL: 30/70 or 70/30 operational partnership, IP transfer
  or shared ownership, an assumed partner as first tenant, ENVAL B.V. as the
  generic fixed operator/end-customer contracting party, and 90/10 as a
  generic ENVAL software price.
- UNKNOWN: controller/processor allocation, SaaS pricing, SLA, first tenant,
  willingness to pay, concrete providers and tenant-specific REV/listing,
  verifier, mandate and production readiness.

Role boundaries:

- ENVAL Software is geen inboekdienstverlener, REV-rekeninghouder,
  ERE-handelaar, verificateur of certificeerder by default.
- The resolved tenant must not claim NEa approval, accreditation, REV access,
  list publication, mandate volume, verifier readiness or production
  eligibility until tenant-bound evidence proves it.
- Neither the platform nor tenant journey makes compliance, certification,
  verification, acceptance, payout, revenue, timing or document-approval
  guarantees.
- ENVAL keeps internal audit/evidence truth separate from customer-facing status and customer timeline copy.
- Frontend may assist; backend decides.
- Frontend prechecks and parsing can improve UX, latency, and support load, but backend validation, normalization, authorization, hashing, audit, and lifecycle decisions remain the source of truth.

## Commercial Model

- Tenant customer fees are tenant-bound configuration and require the tenant's
  approved legal/commercial bundle.
- The former 90/10 settlement direction is historical and is not a generic
  platform price, default tenant fee or SaaS price.
- SaaS pricing, SLA and willingness to pay remain UNKNOWN pending market and
  operating evidence.
- Do not state competitor percentages as fact unless sourced and verified.
- Customer-facing flows must be explicit about required documents, current status, missing information, and claim boundaries.
- Audit readiness is critical because audit handling and support overhead are likely major cost drivers.
- Exact fee trigger, fee base and definition of result belong to each tenant's
  approved fee configuration and contract bundle.
- Future tenant runtime must pin the accepted tenant fee configuration/version
  to the applicable customer/legal snapshot.
- Historical operator-fee context remains in
  `docs/app/legal/fee-model-and-service-terms.md`; it is not SaaS pricing.

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

- tenant service explanation and approved legal identity
- tenant-bound price / fee model
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
- tenant branding, contract/signing bundle and audit configuration

## Claim Boundaries

- Do not promise that EREs will always be granted.
- Do not imply that uploaded documents are automatically accepted by all parties.
- Do not imply that confirmed upload equals accepted evidence.
- Do not imply that ENVAL Software is the regulated tenant/operator or that a
  tenant is NEa-approved, accredited, listed, REV-ready or production-ready
  until separately proven.
- Avoid careless guarantee language around revenue, approval, timing, or certification.
- Do not guarantee payout, value realization, certification, or acceptance of every uploaded document.
- ENVAL may pause, reject, or request more information when evidence is insufficient.
- Keep role boundaries explicit in public copy and terms.
- Tenant legal identity, commercial responsibility, controller/processor roles
  and platform/tenant responsibilities must be clarified before final terms go
  live.

## Strategic Delivery Order

1. Phase 0 — truth/documentation alignment.
2. Phase 1 — preserve and finish bounded existing core work without new
   ENVAL-operator hardcoding.
3. Phase 2 — read-only SaaS boundary gap audit.
4. Phase 3 — minimum tenant-ready foundation based only on gap evidence.
5. Phase 4 — evidence/provider integrations.
6. Phase 5 — design-partner pilot.
7. Phase 6 — managed-SaaS productization.
8. Phase 7 — enterprise variants only on proven demand.

Product development and design-partner/market validation proceed in parallel.
There is no full multi-tenant rewrite before Phase 2 and no billing or broad
control-plane build without market and operating evidence.

## Rebuild Scope

The rebuild starts by modeling the frontend cleanly in `/app`. The live static root and Supabase backend remain source material and shared assets, not immediate rewrite targets.

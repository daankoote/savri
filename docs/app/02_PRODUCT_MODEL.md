# ENVAL Product Model

## Product Position

Status: DECIDED/TARGET for the managed-SaaS/white-label product direction;
CURRENT PROVEN only where explicitly tied to current code/schema/proof.

ENVAL is one generic B2B managed-SaaS and white-label software platform for
separate ERE-E inboekdienstverleners. The current ENVAL-branded portal is the
reference/default tenant journey. It is not proof that ENVAL Software is the
regulated operator, REV account holder, ERE trader, independent verifier,
legal representative or end-customer contracting party.

Only organizations in the `approved tenant/license registry` (`tenant
allowlist`) with an active license may become a tenant. Admission and licensing
grant no NEa status, REV access, verifier role, dossier authority or workforce
capability. Those authorities require their own tenant-bound evidence and
server-side grants.

The platform:

- supports a tenant-owned customer journey and eligibility workflow;
- collects tenant-local charger, address, consent, invoice and evidence data;
- builds and manages an audit-worthy tenant-local customer dossier;
- supports the tenant's inbooking workflow within that tenant's approved
  regulatory, operational, legal and commercial terms; and
- keeps generic platform ownership/configuration separate from tenant business
  truth and authority.

The tenant/inboekdienstverlener owns its customer relationship, statutory and
operational responsibility, data, workforce, audit, REV/inbooking workflow and
verifier relationship. ENVAL supplies the software layer. Tenant identity,
presentation brand, legal operator, support provider, customer contracting
party and privacy role are separate concepts.

Managed SaaS, managed white-label, customer-owned cloud and contractually
agreed self-hosted/source-license deployments use the same modular core.
Deployment ownership, branding, support, license and regulated role remain
independent concerns; no commercial package creates regulatory or dossier
authority.

Status split:

- CURRENT PROVEN: intake capture, app dossier foundation, app audit/idempotency, authenticated dashboard document lifecycle, immutable document versions, and customer-safe dashboard projection where current code/schema/proofs show them.
- CURRENT PROVEN LOCAL: the strict presentation-brand configuration, current
  presentation consumers and immutable workflow-mail sender snapshot, including
  their local persistence, read and replay boundaries.
- TARGET: tenant-bound legal identity, customer contracts, fee configuration,
  signing/legal bundles, managed brand-identity administration, hosted
  configuration, tenant onboarding, broader business-consumer provenance,
  portable provenance, tenant #2, deny-by-default production isolation and
  production deployment. TF01 fixed-plane execution binding and the TF02-B
  strict versioned tenant-configuration manifest/revision-reference contract
  with safe static server-time selection remain CURRENT PROVEN LOCAL; real
  approved operational/legal/commercial configuration content remains absent.
- SUPERSEDED/HISTORICAL: 30/70 or 70/30 operational partnership, IP transfer
  or shared ownership, an assumed partner as first tenant, ENVAL B.V. as the
  generic fixed operator/end-customer contracting party, and 90/10 as a
  generic ENVAL software price.
- UNKNOWN: controller/processor allocation, SaaS pricing, SLA, first tenant,
  willingness to pay, concrete providers and tenant-specific REV/listing,
  verifier, mandate and production readiness.

Role boundaries:

- ENVAL Software is geen inboekdienstverlener, REV-rekeninghouder,
  ERE-handelaar, verificateur, certificeerder of wettelijke vertegenwoordiger
  by default.
- The resolved tenant must not claim NEa approval, accreditation, REV access,
  list publication, mandate volume, verifier readiness or production
  eligibility until tenant-bound evidence proves it.
- Neither the platform nor tenant journey makes compliance, certification,
  verification, acceptance, payout, revenue, timing or document-approval
  guarantees.
- ENVAL keeps internal audit/evidence truth separate from customer-facing status and customer timeline copy.
- Frontend may assist; backend decides.
- Frontend prechecks and parsing can improve UX, latency, and support load, but backend validation, normalization, authorization, hashing, audit, and lifecycle decisions remain the source of truth.

## Target Product Surfaces

`PAAS_PRODUCT=NO`. ENVAL is one browser-based vertical B2B managed-SaaS /
white-label product with four TARGET surfaces over shared contracts and design
primitives:

1. **ENVAL Control Console** for authorized ENVAL platform personnel: tenant
   onboarding/lifecycle, platform health, version/config visibility, incidents,
   platform audit, controlled support elevation and future usage/billing.
2. **Tenant Operator Console** for one tenant's workforce: work queues, dossier
   creation, evidence/review, customer questions, corrections, annual kWh,
   locks/finalization preparation, reporting and capability administration.
3. **Tenant Customer Portal** for particulier, onderneming, VvE and later
   extensible party types without cloned apps: intake, authority information,
   connection/EAN, locations/assets, evidence, signing, annual-period work,
   status, questions and corrections.
4. **Verifier Workspace** as a future narrowly authorized surface for evidence
   packs, samples and findings. It is not generic tenant-admin access and is not
   authorized for implementation now.

The customer portal is tenant-facing white-label. Customers primarily perceive
the tenant/inboekdienstverlener as service provider, with ENVAL identified as
platform technology only where legally and contractually appropriate.

Safe presentation configuration is limited to controlled display name, logo
reference, approved design-token/accent values, tenant customer-support identity,
customer-facing contact details and approved e-mail display identity. Arbitrary
CSS, JavaScript or HTML and per-tenant frontend clones are prohibited. The
preferred future default is `<tenant>.enval.nl` or another approved ENVAL-owned
namespace. Verified custom domains are future enterprise scope, not MVP.

Approved TARGET routing is `enval.nl` for the commercial site,
`<tenant>.enval.nl/aanmelden` for public intake,
`<tenant>.enval.nl/dashboard` for customers,
`<tenant>.enval.nl/beheer` for tenant operators, `control.enval.nl` for ENVAL
Control, and `verificatie.enval.nl` for the central verifier console. Hostname is
never authorization. One Auth foundation serves distinct server-derived
customer, workforce, platform, and verifier actor contexts.

Customer MVP navigation is `Overzicht`, `Dossiers`, `Documenten`, `Berichten`,
and `Account`; open tasks live in `Overzicht`. Operator MVP navigation is
`Overzicht`, `Dossiers`, `Klanten`, and `Organisatie`; its landing is action-first
and reporting remains later without a concrete requirement.

## Tenant, Support And Domain Boundaries

Auth principal, tenant, workforce membership, customer party, representation
authority and case authority are separate. A tenant owns its workforce, end
customers, cases, evidence, signing truth and audit inside its isolated data
plane, together with its regulated inbooking and verifier relationship.
Workforce business authority is capability-based; friendly owner/admin,
reviewer, support and operations roles may compose capabilities but never
grant authority by name alone. Tenant admission additionally requires an
active entry in the `approved tenant/license registry`; that entry never
substitutes for workforce, dossier or regulated authority.

Only tenant principals with explicit `platform_support.request` may open ENVAL
platform-support requests. Default assignment may be tenant owner/admin or a
designated support contact. General tenant workforce escalates internally. Any
future ENVAL tenant-data access must be explicitly requested and justified,
tenant/actor/purpose/resource/time-bound, least-privilege and audited. Platform
health metadata is preferred; universal or permanent data-plane access is
prohibited and break-glass remains separate future high-assurance design.

The domain direction is:

```text
Party -> Representation Authority -> Location -> Connection/EAN
      -> Charging Installation/Charging Asset(s) -> Charge Point(s)
      -> MID Meter/Metering Installation -> MID/Conformity Evidence
```

An Annual Case/Claim Period references those durable entities and the relevant
mandate, evidence, kWh, review, and verification state. Connection, installation,
asset, charge-point, MID/meter and conformity-evidence identity may persist
across years. Validity, mandate, kWh, evidence applicability, review and
verification may vary by annual case. Do not create permanent-asset or meter
copies per calendar year.

Customer dossier communication is tenant customer-to-workforce. ENVAL platform
support is a separate capability-gated system. Shared shells may show the
presentation-owned attribution `Powered by <displayName>`; attribution never
establishes legal, operator,
controller, mandate, fee, or verifier identity.

## API And CRM Readiness

API/CRM readiness is TARGET architecture, not a public-API implementation
requirement. The browser UI and future tenant CRM, ERP, BI, and charging-provider
integrations must reuse the same server-side application capabilities and
provider-neutral core through explicit contracts and adapters. UI components do
not own business decisions or database/provider truth.

Future external integrations are tenant-bound, authenticated, scoped,
least-privilege, versioned, rate-limited, auditable, revocable, and idempotent
for retryable mutations. They never receive direct database access, RLS bypass,
service-role credentials, cross-plane credentials, or other-tenant data. No
REST/GraphQL choice, external `/v1` contract, connector, webhook event catalogue,
or outbox implementation is approved now. Build those only for a concrete need
with known operations, scopes, audit implications, and responsible versioning.

Cross-tenant collision/fraud detection, if approved later, uses a dedicated
privacy-preserving seam over normalized identifiers and keyed cryptographic
transforms with minimum central metadata. Raw EAN, MID and customer truth stays
tenant-local; a collision signal exposes no other tenant's underlying data. The
legal basis, privacy/security design and final cryptographic protocol remain open.

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
- Future SaaS billing must derive from explicit immutable usage/billable events,
  preferably a meaningful annual-case lifecycle milestone. Raw draft creation,
  abandoned/spam/incomplete cases and a fixed euro, percentage or volume tier
  are not automatically billable and no price is adopted here.

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

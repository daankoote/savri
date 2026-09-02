# ENVAL App Canon

Status: CURRENT source of truth for ENVAL documentation authority, source order, and navigation.

Audit evidence status: PROOF ONLY.

Canon and target architecture approval: GO — APPROVED BY DAAN ON 2026-07-22

Blanket implementation authorization: NO

Approval applies to the ENVAL canon and target architecture direction. It is not CURRENT PROVEN implementation or built compliance, does not expand existing bounded foundations, and grants no code, schema, UI, Edge Function, remote, deployment, or general implementation authority. CURRENT PROVEN remains reserved exclusively for built behavior with green proof; `READY`, `IN PROGRESS`, `TODO`, and `BLOCKED — EXTERNAL` remain independently controlling per work package.

Decision evidence: Daan's explicit 2026-07-22 decision, recorded in `docs/app/10_ARCHITECTURE_GO_NO_GO_AUDIT.md` and the append-only changelog. The documentation baseline remains commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805`; bounded execution state is tracked only in `docs/app/operations/nea-implementation-roadmap.md`.

## Phase 0 Managed-SaaS And White-Label Decision

Status: DECIDED/TARGET — DAAN DECISION 2026-09-01; NOT CURRENT PROVEN

ENVAL is developed independently as one generic B2B managed-SaaS and
white-label software platform for separate inboekdienstverleners. Daan retains
the ENVAL software, architecture and generic IP. No 30/70 or 70/30 operational
partnership, IP transfer, shared ownership or assumed partner-as-first-tenant
remains part of the active direction.

The resolved tenant is the regulated inboekdienstverlener/operator. ENVAL
Software, as generic platform supplier, is not by default the
inboekdienstverlener, REV account holder, ERE trader, independent verifier or
contracting party of the tenant's end customer. A tenant owns its operational
regulatory responsibility and tenant-local business truth. Tenant legal
identity, branding, customer contract bundle, fee configuration, signing/legal
bundle and operational audit must be explicitly tenant-bound and must never be
inferred from the ENVAL presentation brand or platform identity.

The current ENVAL-branded portal and root data plane remain the
reference/default tenant journey and technical compatibility baseline. That
label proves neither the first commercial tenant nor an ENVAL legal/operator
role. Existing CURRENT PROVEN customer, evidence, signing, review, compliance
and control-plane foundations retain their exact local proof status.

TARGET platform boundaries are deny-by-default tenant isolation and the
minimum tenant-ready foundation justified by a read-only gap audit. A second
tenant, complete multi-tenant product, billing/control-plane productization,
live tenant onboarding and production isolation remain unproven. No full
multi-tenant rewrite precedes the gap audit, and no billing/control-plane build
is authorized without market and operating evidence.

UNKNOWN / TARGET LEGAL REVIEW:

- exact controller/processor allocation per processing purpose;
- SaaS pricing and tenant fee economics;
- SLA and support obligations;
- first tenant and willingness to pay; and
- concrete provider availability and contracts.

### Managed-SaaS Product And Governance Boundary

Status: DECIDED/TARGET — NOT CURRENT PROVEN

`PAAS_PRODUCT=NO`. ENVAL is a browser-based vertical B2B managed-SaaS /
white-label product. It supplies software, workflow and orchestration to one
inboekdienstverlener organization per tenant; it is not a generic PaaS product.

The four TARGET product surfaces are separate authorization and information-
architecture boundaries over one shared core:

1. **ENVAL Control Console** — authorized ENVAL personnel manage tenant
   onboarding/lifecycle, platform health, configuration/version visibility,
   incidents, controlled support elevation, future usage/billing and platform
   audit. It is not normal tenant operations.
2. **Tenant Operator Console** — one tenant's authorized workforce performs
   customer/case work, evidence review, corrections, annual workflows,
   finalization preparation, reporting and capability administration.
3. **Tenant Customer Portal** — a white-label tenant-facing journey for
   particulier, onderneming and VvE customers and authorized representatives.
4. **Verifier Workspace** — a future restricted evidence/verification surface;
   it is not generic tenant-admin access and is not authorized for implementation.

Auth principal, tenant, workforce membership, customer party, representation
authority and case authority remain distinct. Tenant workforce authorization is
capability-based; friendly role names may compose capabilities but never become
business authority by themselves.

Only a tenant principal with explicit `platform_support.request` capability may
open an ENVAL platform-support request. Default assignment may be owner/admin or
an explicitly designated tenant support contact. General tenant workforce
escalates internally. Any later ENVAL access to tenant data is requested,
justified, tenant/actor/purpose/resource/time-bound, least-privilege and audited.
No permanent universal ENVAL data-plane access or universal service role is
allowed; break-glass remains a separate future high-assurance mechanism.

White-label presentation may expose only controlled fields such as display name,
logo reference, approved design-token/accent values, tenant support identity,
customer-facing contact details and approved e-mail display identity. Arbitrary
tenant CSS, JavaScript, HTML and per-tenant frontend forks are prohibited. The
preferred future default is an ENVAL-owned tenant subdomain such as
`<tenant>.enval.nl`; custom domains require verified ownership and are future
enterprise capability, not MVP scope.

The TARGET domain direction is party -> representation/authority ->
connection/EAN -> location -> charging asset(s) -> annual case/claim period ->
mandate/evidence/kWh/review/verification state. Permanent connection/asset truth
must not be cloned merely because a new calendar-year case starts.

Cross-tenant duplicate/fraud signalling must not centralize raw EAN, MID or
customer truth. A future separately approved collision capability may use a
normalized identifier plus keyed cryptographic transform and minimal metadata;
it reveals no other tenant's underlying data and requires legal/privacy/security
review. No final cryptographic protocol is approved.

Future billing requires immutable explicit usage/billable events tied preferably
to a meaningful annual-case lifecycle milestone. Draft, abandoned, spam or
incomplete case creation is not automatically billable. No amount, percentage,
tier or price is canonized.

This file is the only primary navigation and status index for active app documentation. It overrides every legacy document for new app work. If a legacy file conflicts with this document, this document wins.

NEa compliance hierarchy:

- The Wet milieubeheer, Besluit energie vervoer, and Regeling energie vervoer are the higher legal authorities.
- De versioned officiële TKV-PDF is de primaire operationele verificatiearchitectuurbron voor ENVAL.
- Canonical repository path: `docs/app/sources/official/nea/2026-07-09_toetsingskader-verificatieprotocol_inboekverificatie_elektriciteit.pdf`.
- Source status: OFFICIAL SOURCE SNAPSHOT.
- `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md` is the highest internal NEa compliance directive.
- `docs/app/06_NEA_REQUIREMENTS.md` is the normalized requirement set derived from the legal and official sources.
- `docs/app/08_NEA_TRACEABILITY_MATRIX.md` connects source, requirement, component, data, test, and evidence.
- `docs/app/06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md` is mandatory proof before any NEa target architecture or MVP plan may be approved.
- Current code, schema, migrations, tests, and proof output remain the technical truth for what is actually implemented.
- `docs/app/07_NEA_TARGET_ARCHITECTURE.md` is the approved TARGET direction, not CURRENT PROVEN implementation. Every implementation work package still requires its own bounded scope; external adapters, REV, official-verifier, remote, deployment and production work remain separately blocked or unapproved. `docs/app/09_NEA_MVP_PLAN.md` remains the normative gate plan within that boundary.
- No derived ENVAL document may contradict the official PDF. A conflict or new official version is a hard stop and requires a new source diff before affected requirements, architecture, or implementation work can continue.

### Official Electricity TKV Source Snapshot

| field | value |
| --- | --- |
| title | `Toetsingskader verificatieprotocol: Inboekverificatie elektriciteit` |
| publisher | Nederlandse Emissieautoriteit |
| publication date | 2026-07-09 |
| official URL | `https://www.emissieautoriteit.nl/site/binaries/site-content/collections/documents/2026/07/09/toetsingskader-verificatieprotocol-inboekverificatie-elektriciteit/toetsingskader-verificatieprotocol-inboekverificatie-elektriciteit.pdf` |
| repository path | `docs/app/sources/official/nea/2026-07-09_toetsingskader-verificatieprotocol_inboekverificatie_elektriciteit.pdf` |
| page count | 10 |
| file size | 832788 bytes |
| SHA-256 | `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` |
| retrieval date | 2026-07-21 |
| mapping status | PASS — all 19 present numbered clauses mapped; the source contains no 3.3.5 |
| source status | OFFICIAL SOURCE SNAPSHOT; not an ENVAL-authored document and not CURRENT PROVEN implementation |

Supersede procedure: retain the current snapshot immutably, download any new official version outside the repository, verify its metadata, store it under a new versioned name, run a clause/source diff, assess impacted requirement IDs, traceability, architecture, tests and evidence, and only then designate the newer snapshot as primary. Until that review is complete, the affected path is hard-stopped.

## Product Canon

ENVAL is being built as the generic software layer for tenant-operated ERE-E
inboekdienstverlener services. The current ENVAL-branded customer journey is
the reference/default tenant journey, not proof that ENVAL Software is the
regulated operator or end-customer contracting party.

The current `/app` product scope includes:

- particulier
- zakelijk
- VVE

CURRENT PROVEN scope is customer intake, dossier construction, evidence lifecycle, audit trail, and app document handling foundations where current code, schema, and proof output show that behavior.

TARGET scope is a tenant-ready managed-SaaS/white-label platform through which
each resolved tenant operates its own ERE-E inboekdienstverlener service within
its approved legal, regulatory, operational and commercial terms.

UNKNOWN until separately proven:

- tenant REV account and operator-registration status
- NEa list publication status
- tenant-bound mandate and contract execution model
- exact inboeking execution process
- verifier interaction model
- controller/processor and final legal/commercial responsibility split
- SaaS pricing, SLA, first tenant and willingness to pay

Commercial direction:

- Tenant customer-fee configuration is TARGET and tenant-bound; no percentage
  is a generic ENVAL software price.
- The former 90/10 customer settlement proposal is SUPERSEDED as a generic
  ENVAL platform rule and retained only as historical product/legal context.
- SaaS pricing and the exact tenant commercial model remain UNKNOWN pending
  market evidence and legal/commercial decisions.
- No public competitor fee claims may be made without verified sources.

Neither ENVAL Software nor the platform is:

- a verifier
- a certifier
- a compliance authority
- a result guarantor

The platform does not guarantee:

- eligibility
- acceptance
- number or value of EREs
- payment
- timing
- verification outcome
- certification outcome
- approval of every document

## Regulatory Status Rule

Official law, NEa publications, current app code/schema/tests, and green proof output lead over every document.

The regulated role direction belongs to the resolved tenant as ERE-E
inboekdienstverlener. It does not by itself prove tenant NEa approval,
accreditation, REV account access, list publication, mandate volume, verifier
readiness or production eligibility. Those claims require current tenant-bound
regulatory and implementation evidence. ENVAL Software's platform role must
not be used as a fallback regulatory identity.

Removed legacy documentation is never regulatory source of truth. Old claims about neutral infrastructure, external inboekers, fixed export fees, private-only scope, maximum document counts, old endpoints, old session models, or old dossier states are historical unless this document or a focused app contract explicitly re-adopts the principle.

Detailed NEa requirements belong in `docs/app/06_NEA_REQUIREMENTS.md`. Traceability belongs in `docs/app/08_NEA_TRACEABILITY_MATRIX.md`. Target architecture belongs in `docs/app/07_NEA_TARGET_ARCHITECTURE.md`. They must not be scattered as implementation claims across unrelated docs.

## Canon Navigation And Status Index

Primary canon documents:

| document | responsibility | current status |
| --- | --- | --- |
| `docs/app/00_CANON.md` | navigation, status, source order, and governance | CURRENT |
| `docs/app/01_SYSTEM_MAP.md` | CURRENT PROVEN implementation and runtime context only | CURRENT / PARTIAL |
| `docs/app/02_PRODUCT_MODEL.md` | ENVAL product role, doelgroep, commercial direction, and public claim boundaries | CURRENT / PARTIAL |
| `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md` | norm hierarchy, compliance principles, stopgates | CURRENT |
| `docs/app/06_NEA_REQUIREMENTS.md` | single primary requirement set | CURRENT / PARTIAL — ELECTRICITY TKV MAPPED; OTHER LEGAL/EXTERNAL GAPS OPEN |
| `docs/app/07_NEA_TARGET_ARCHITECTURE.md` | single primary target architecture: contexts, truth ownership, module/adapter/security boundaries, requirement families, principles | TARGET — APPROVED, NOT CURRENT PROVEN / REGULATORY PARTIAL |
| `docs/app/08_NEA_TRACEABILITY_MATRIX.md` | single primary source-to-requirement-to-control traceability matrix | PROVISIONAL |
| `docs/app/09_NEA_MVP_PLAN.md` | single primary execution order and normative gates | PACKAGE-SPECIFIC GATES; NO BLANKET IMPLEMENTATION AUTHORIZATION |

Supporting documents have one responsibility each and do not compete with the primary canon:

| document family | responsibility | status |
| --- | --- | --- |
| `docs/app/00_DOCUMENT_MIGRATION_AUDIT.md` | legacy/document migration proof | PROOF ONLY / DRAFT |
| `docs/app/06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md` | official source coverage and source blockers | PROOF ONLY |
| `docs/app/06B_CURRENT_IMPLEMENTATION_ASSESSMENT.md` | current code/database/function/proof assessment | PROOF ONLY |
| `docs/app/architecture/database-target-model.md` | technical data entities, relations, history, constraints, RLS intent, object dispositions | DRAFT — AWAITING DAAN APPROVAL; APPENDIX, NOT PRIMARY ARCHITECTURE |
| `docs/app/architecture/white-label-control-plane.md` | focused separate-tenant-data-plane and minimum-control-plane boundary, subordinate to the primary target architecture | CURRENT PROVEN LOCAL foundation through TF02-C / commit `8480b8f`; remaining sections TARGET; REMOTE / PRODUCTION NOT PROVEN |
| `docs/app/contracts/platform-control-plane.md` | minimum control-plane records, field classifications, routing, platform access, deployment state, audit and tenant-readiness contract | CURRENT PROVEN LOCAL implemented subset through TF01 / commit `034691e`; remaining domain TARGET/DEFERRED; REMOTE / PRODUCTION NOT PROVEN |
| `docs/app/architecture/platform-control-plane-physical-foundation.md` | repository, project, local-targeting, schema/runtime, fixed data-plane parity and presentation-bootstrap boundary for the separate control plane | CURRENT PROVEN LOCAL foundation through TF01 / commit `034691e` plus TARGET remote/operations and LEGACY completed-plan snapshot; REMOTE PROVIDER / PRODUCTION NOT SELECTED |
| `docs/app/decisions/architecture-and-environment-decisions.md` | historical/current architecture and environment strategy decisions | DECISION RECORD — BOUNDED INTERNAL FOUNDATION GO; EXCLUDED SCOPES NO-GO |
| `docs/app/operations/remote-baseline-and-retirement.md` | legacy freeze, baseline waves, cutover, rollback, retirement conditions, execution prerequisites, abort criteria | TARGET — EXECUTION NOT APPROVED |
| `docs/app/operations/nea-implementation-roadmap.md` | compact daily sequence, progress, evidence, blockers, and internal/external work tracks; subordinate to requirements, traceability, target architecture, and MVP gates | TARGET — LIVE EXECUTION TRACKER |
| `docs/app/proofs/remote-baseline-and-recovery-gate.md` | dated remote inventory, Phase 0, recovery/PostgREST evidence, remote gate | PROOF ONLY — NO IMPLEMENTATION APPROVAL |
| `docs/app/contracts/**` | durable technical contracts | CURRENT/TARGET as stated inside each file |
| `docs/app/operations/**` | workflow, runtime freeze, debug, and execution planning without execution permission | OPERATIONS |
| `docs/app/proofs/**` | evidence only; never architecture or execution permission | PROOF ONLY |
| `docs/app/legal/**` | legal/commercial draft terms | DRAFT / LEGAL REVIEW |
| `artikelen/**/artikel.md` | publication content | NOT ARCHITECTURE CANON |

## Architecture Canon

Current implementation direction:

- `/app` is the active rebuild frontend.
- `api-app-*` is the active backend endpoint namespace.
- `app_*` tables are the active backend data model.
- Branch for active work is `main`.

Legacy/fallback surface:

- Root/static HTML, CSS, and JS remain the legacy production/fallback surface until explicit cutover.
- `api-dossier-*`, `api-lead-submit`, and legacy workers remain legacy/fallback only.
- Legacy `dossier_*` tables remain legacy/fallback only.
- New app work must not write app audit/idempotency to legacy tables.

The recent app backend has reusable proof evidence, but it is not architecture-approved merely because local proof exists.

Technical primitives that may remain valid when proof is green and interfaces stay modular:

- app audit/idempotency primitives
- app customer auth boundary helpers
- document transport primitives for upload URL, byte confirmation, version history, download URL, and withdrawal
- RLS deny-by-default and server-side service-role write boundaries

Regulatory-semantics foundations are only:

`PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON`

This applies at least to:

- `app_customers`, `app_customer_identities`, and `app_customer_dossiers`
- account types: `particulier`, `zakelijk`, `vve`
- multiple locations
- multiple chargers
- EAN/connection foundations: `app_connections`, `app_connection_periods`, `app_connection_ownership_periods`
- signup intake/quarantine: `app_signup_intakes`, `app_signup_intake_files`, `app_signup_intake_capabilities`
- legal acceptances where they are compared to signed mandates

Current local proof does not approve CAR access, REV compatibility, verifier process, AO/IB detail, CAPA detail, mandate wording, production compliance, remote deployment, or Wave 1 execution.

Delivery-year compliance runtime foundation:

- REG01 through REG03I are `CURRENT PROVEN — LOCAL ONLY` for the bounded
  delivery-year foundation: the source-resolved `Y` / `Y+1` event semantics,
  pure fail-closed REG02 reconstruction, REG03B action derivation, REG03D
  worklist projection, explicit workforce view/record authority, immutable
  source-event persistence, controlled capture and an authenticated read-only
  worklist endpoint.
- The only authoritative runtime calendar is delivery year 2026. Later years
  and calendar generation remain TARGET/PARKED.
- `app_delivery_year_compliance_source_events` owns accepted source facts and
  provenance. REG02 state is reconstructed, REG03B actions are derived
  operational attention, and the REG03D worklist is a derived presentation.
  No mutable compliance aggregate, reminder state or worklist state is core
  truth.
- No recorded source event means only that ENVAL has no accepted source fact
  for that event. It does not prove that the external event never occurred.
- The regulated actor, ENVAL recorder and workforce authorization are separate.
  A verifier REV registration remains a verifier action when ENVAL records its
  external confirmation; `compliance.delivery_year.record` grants only
  evidence-backed recording and creates no verifier, NEa or representation
  authority.
- The authenticated worklist read requires trusted tenant resolution, verified
  Auth, active workforce membership, `compliance.delivery_year.view` and
  explicit `TENANT_WIDE` scope. It uses server-owned `asOf`, replays immutable
  facts through REG02 → REG03B → REG03D and writes zero state.
- Correction/revocation, findings remediation/closure, acknowledgements,
  dismissal/snooze, persisted tasks, schedulers, mail/notifications,
  customer-facing compliance UX, remote migration/deployment and production
  acceptance remain TARGET/PARKED.

Current technical primitives retained as proven or partially proven where code/proof supports them:

- app audit/idempotency
- app customer auth foundation
- app document slots/files/versions
- `api-app-auth-bootstrap`
- `api-app-document-upload-url`
- `api-app-document-upload-confirm`
- `api-app-document-download-url`
- `api-app-document-withdraw-current`
- `api-app-dashboard-get`
- no legacy dossier dependency in app endpoints
- provider-neutral managed and static tenant resolution behind
  `TenantResolverPort` / `TenantDataPlaneLocator`
- local isolated control-plane schema, migration/target guard and versioned
  public presentation configuration
- trusted-ingress and authoritative tenant gate coverage for the inventoried
  CURRENT `api-app-*` runtime surface
- immutable server-derived `tenant_execution` context bound to the fixed
  server execution identity before tenant business data, Storage or
  service-role access
- one canonical parity authority,
  `evaluateAppTenantResolutionBinding`, shared by the 33 inventoried current
  tenant-business endpoints; presentation consumes that result and does not
  re-resolve or recompute parity
- server-owned presentation source composition, safe public bootstrap and
  React `PresentationBrandProvider` consumption

These white-label foundations are CURRENT PROVEN LOCAL through TF02-C / commit
`8480b8f`. TF01 supplies the fixed-plane execution binding. TF02-B adds the
strict versioned tenant-configuration manifest/revision-reference contract and
safe static selection authority for operational, legal, fee/commercial and
provider/integration concerns. Selection is bound to
`AppTenantExecutionContext` tenant/environment and server-owned event time;
invalid, unapproved, hash-mismatched, missing or ambiguous configuration fails
closed. The 33-of-33 endpoint inventory remains point-in-time TF01 evidence.

TF02-C adds local tenant-data-plane metadata persistence and a TF01-bound
database reader that reuses TF02-B selection. It adds no real tenant
configuration content, approval/write governance, secret binding,
business-consumer cutover, tenant #2, dynamic data-plane switching or production
isolation. The next bounded batch is **signing/legal tenant-config provenance
cutover**.

The recent app frontend Auth/session flow is retained as local proof:

- `/account` supports customer account creation and sign-in.
- Supabase Auth session restoration and logout are wired locally.
- `/dashboard` is protected by the current frontend session flow.
- Auth/Supabase frontend code is route-lazy for `/account` and `/dashboard`.
- `api-app-dashboard-get` provides an authenticated, customer-safe, account-type-neutral dashboard read projection.
- The real customer-safe dashboard frontend projection is CURRENT / LOCAL PROOF and uses `api-app-dashboard-get`.
- The reusable customer document module is CURRENT / LOCAL PROOF.
- MID evidence and installation/acquisition invoice PDF upload are supported from the authenticated dashboard.
- Current document download and audit-preserving withdrawal are supported locally.
- Unsupported future dashboard domains are not fabricated.
- Production deployment and production browser proof remain OPEN.

CUSTOMER04C external customer document workflow:

- Status: `CURRENT PROVEN — LOCAL` at commit `d613592` for the bounded signup
  and customer-correction implementation. The recorded final pre-commit
  Integration gate was `127/127 PASS`.
- Signup and customer correction are lifecycle inputs into one shared customer
  document workflow. They do not own separate fact-row or interaction
  implementations.
- `app/src/features/documents/CustomerDocumentWorkflowController.ts` owns the
  shared upload-card, source, row, interaction and projected-status model.
  `app/src/features/documents/DocumentEvidenceWorkflow.tsx` is the shared
  presentation boundary.
- The same `DocumentEvidenceUploadCard`, `DocumentFactMatrix`, canonical fact
  registry and `CustomerDocumentFactInteraction` are used by both lifecycles.
  The generic policy authority is
  `platform/runtime/customer-fact-resolution/customer_fact_resolution_policy.ts`.
- Lifecycle-specific transport and actions remain explicit inputs: signup uses
  private pre-auth quarantine and owns add/remove-charger behavior; correction
  uses correction-scoped replacement/withdraw actions. The compact signup
  charger-delete action is not PDF-upload component behavior.
- Correction locked/read-only facts are configuration of the same shared rows.
  Correction rounds, source/customer provenance and replacements remain
  immutable/versioned.
- Parser output remains `OBSERVED_DERIVED`. Customer confirmation records
  customer intent and never creates ENVAL/workforce acceptance, verifier
  judgment or canonical accepted truth by itself.
- Dependency-aware verification ownership classifies TypeScript entry graphs:
  app/React graphs use the app TypeScript configuration, while Deno-native
  graphs remain under Deno semantics. Deleted paths are not compile inputs.
- Customer lifecycle qualification, the parser qualification corpus,
  third-party verification/check execution, kWh/generation/feed-in accounting,
  verifier/audit dossier generation and periodic audit snapshots remain
  `TARGET — NOT CURRENT`; the exact target inventory is in `04_TODO.md`.

Signed-intake and promotion lifecycle:

- Collecting pre-auth quarantine, `typed_name_otp_v1`, immutable signing finalization, finalized server locks, safe receipt and server-authoritative same-tab recovery are CURRENT PROVEN locally as bounded source/runtime proofs.
- `typed_name_otp_v1` proves signing intent plus control of the used email channel; the former separate email-verification promotion trigger is `SUPERSEDED` and must not be rebuilt without a new hard requirement.
- 09C1A/09C1B/09C1C signed-intake convergence is CURRENT PROVEN — LOCAL ONLY: atomic/idempotent `app_cases` promotion, server-owned finalize/status orchestration, receipt v2 with safe presentation state, verified Supabase Auth binding to the existing promoted customer/case, and a customer-safe case-owned dashboard projection. This flow creates no `app_customer_dossiers` row.
- 09C1C-R2 adds on-demand compatibility convergence for one uniquely Auth-bound
  existing customer: a missing declared party profile is appended from the new
  immutable signed intake inside the promotion transaction. This is never an
  e-mail-only merge, never overwrites current profile truth, and never marks
  identity, organization or representation authority verified.
- 09C1C-R3 introduced browser Auth boundary
  `auth_bootstrap_browser_v1`; 09C1C-R5 supersedes that browser schema with
  `auth_bootstrap_browser_v2`. Edge still hides internal v4/v5 selection, while
  the strict browser contract now distinguishes `bound`,
  `unbound_no_cases` and real-conflict `blocked` states.
- A verified Supabase Auth account may exist without an ENVAL customer or case.
  `unbound_no_cases` opens a zero-case portal and creates no customer,
  identity binding, case, party, mandate, evidence or legal acceptance.
  `Nieuwe aanvraag` reuses canonical `/aanmelden`; authenticated e-mail is
  server-derived and signing plus `typed_name_otp_v1` remain mandatory.
- 09C1C-R5-R1 stores one immutable intake-specific verified Auth anchor at
  authenticated intake start without persisting the bearer or raw e-mail.
  The first signed zero-case application creates/binds exactly one compatible
  customer identity and one case inside the promotion transaction. A binding
  failure rolls those business writes back without invalidating signing;
  `promoted` plus `already_authenticated` routes directly to `/dashboard`.
- 09C1C-R6 keeps Auth principal, customer/service context, party, case and
  representation authority as separate roots. One verified Auth principal may
  have explicit server-owned access to multiple separate Particulier,
  Zakelijk and VvE customer contexts and their cases; account type remains
  context-scoped. Access is backed only by a bound identity or immutable
  signed-promotion lineage, never by e-mail, address, MID or safe reference.
  Zakelijk/VvE access does not complete authority review. After authenticated
  promotion, the current principal's dashboard/bootstrap cache is invalidated
  before navigation so the first dashboard read uses current server truth.
- 09C1C-R4 preserves signed customer-declared charger fields, exact signed
  charger/location linkage and document classification in immutable case-owned
  review-input records. Dashboard titles use source-authored document
  vocabulary and opaque charger/evidence references; no display label,
  filename, MID, hash or storage path is UI identity. Nothing in this parity
  layer is accepted charger, location, MID, conformity, evidence or eligibility
  truth.
- Account and case remain separate roots: one safely resolved account may own
  multiple preserved cases, and every new signed intake creates exactly one new
  `app_cases` root rather than merging an existing case.
- The single active post-signing customer status is `submitted_for_review`: finalized/locked and waiting for the resolved tenant's authorized internal review. Customer copy is `Ondertekend en ingediend` / `In behandeling`; it is not formal NEa inboekverificatie.
- Signing OTP, safe reference and receipt grant no Auth, promotion or dashboard authority. Production legal/OTP/Auth, operations review, external verifier, remote apply/deploy and regulatory booking remain outside CURRENT PROVEN.

Wave A1 qualification status:

- Status: `CURRENT PROVEN — LOCAL ONLY` through commits `5dfaed1` and
  `4f0542f`; this is not production proof, deployment proof, tenant #2 proof or
  regulatory/verifier acceptance.
- The disposable private Particulier qualification completes the current clean
  customer lifecycle from account-first signup and evidence readiness through
  `typed_name_otp_v1`, immutable signed snapshot, promoted case, exact-case
  workforce review, `REVIEW_COMPLETE`, refresh/resume and reconstructable audit
  lineage. Customer confirmation remains customer intent and is not workforce
  acceptance.
- Identical authenticated signing-finalize replay returns the persisted logical
  result with the original signing reference, hash and server timestamp. It
  creates no second signing-finalization or snapshot write and does not consume
  the OTP again. A changed canonical payload with the same idempotency key and
  an unauthorized replay both fail closed.
- The clean review contract deliberately projects 10 review subjects over 8
  unique canonical fact keys. Qualification cleanup removes the disposable
  fixture and proves the retained real pilot unchanged.
- The signing runtime regression proof is `14/14 PASS`. Its former Q04 failure
  was proof-fixture-only: one captured reference clock now makes the expired
  challenge deterministic, while production expiry semantics remain unchanged
  and the product path returns `otp_expired`.

## Source-Of-Truth Order

When sources conflict, use this order:

1. Wet milieubeheer, Besluit energie vervoer, and Regeling energie vervoer.
2. The versioned official electricity-TKV PDF for operational verification-architecture interpretation, subordinate to those legal sources.
3. `docs/app/06_NEA_REQUIREMENTS.md` as the normalized requirement set.
4. `docs/app/08_NEA_TRACEABILITY_MATRIX.md` as the source-to-component/data/test/evidence link.
5. `docs/app/07_NEA_TARGET_ARCHITECTURE.md` as the derived, approved TARGET direction that is not CURRENT PROVEN implementation.
6. `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md` for internal compliance direction consistent with items 1-5.
7. `docs/app/06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md` for source-coverage proof and remaining blockers.
8. Current code, schema, migrations, tests, and proof output for implemented behavior.
9. CURRENT PROVEN docs, explicit project decisions, and then TARGET/DRAFT docs under `docs/app/**`.

## Daan Decisions — Verification Architecture

- ENVAL follows the official electricity TKV as its primary operational verification-architecture source and implements no competing proprietary verification framework.
- Professional verifier work remains external: risk judgment, materiality judgment, official sample selection, official location control, issuance of the verification statement, official fraud reporting, and REV management of the verification result.
- The resolved tenant's authorized workforce may perform preparatory internal checks selected manually, randomly, risk-based, or at verifier request. ENVAL Software may provide the managed workflow and explicitly authorized support, but does not thereby become the regulated reviewer, customer contract party or external verifier. Those checks must be audit-worthy, historized, and may never replace official verification.
- Internal capabilities are built only in separately approved bounded work packages. External APIs and registers are researched in parallel and connected later through provider-independent ports and adapters.
- External provider data is observed/external provenance, not automatic core truth.

## Codex Execution Batch Discipline

Every execution batch must have one explicit bounded scope and must:

- verify repository, branch, and HEAD; then read the applicable official NEa source, this canon, the target architecture, and requirements;
- inspect existing frontend, backend, database, module, service, helper, component, CSS, token, and layout patterns, and compare CURRENT with TARGET before proposing change;
- maximize reuse and build modularly with one responsibility per module; resolve small differences through props, configuration, composition, tokens, and modifier classes instead of duplicate or near-duplicate logic, modules, or CSS;
- never use inline CSS;
- remove nothing without dependency, caller, data, migration, rollback, and audit evidence;
- make database, Auth, RLS, UI, runtime, remote, or deployment changes only in their own explicitly approved batches; and
- never commit, push, merge, or deploy without explicit permission.

Verification follows `AGENTS.md` Tier A/B/C orchestration. A commit is not a
release gate. Previously green expensive evidence remains reusable within one
logical batch until its code/dependency/proof/schema/configuration risk cone
changes. Architecture/docs reconciliation is required only for a material canon,
ownership, boundary, dependency, security/Auth or CURRENT/TARGET status change.

## Removed Legacy Documentation Rule

The former in-repo legacy documentation tree has been removed after external copy by Daan.

The external copy is not source of truth for new app implementation. It may not override:

- valid law and official NEa publications
- current app code
- current app schema, migrations, tests
- current proof output
- `docs/app/**`

Any old external material requires explicit adaptation into `docs/app/**` before it can influence work. Old neutral-infrastructure, external-inboeker, max-4, private-only, and fixed export-fee assumptions are historical only.

## Account-Type Rule

Shared app foundations must remain generic across:

- particulier
- zakelijk
- VVE

Account-specific requiredness belongs in explicit contracts for each account type.

Private-only MVP work may not silently become a global rule. A document, endpoint, or UI flow that is only proven for particulier must say so directly.

## Public Copy Boundary

Public copy must remain simple, commercial, and customer-oriented.

Reference/default tenant copy may say only when the resolved tenant's approved
legal and commercial bundle supports it:

- ENVAL helpt je met het aanmeld- en inboekproces.
- Je betaalt alleen bij resultaat.
- Geen garantie op resultaat.
- Wij zorgen dat je dossier controleerbaar en compleet wordt opgebouwd.

Branding never supplies the operator, controller, contract party or fee. Public
copy must resolve those values from the tenant-bound approved bundle.

Public copy must not expose internal legal/audit/anti-fraud doctrine except in legal, FAQ, or terms context.

## Active Entry Points

- Architecture go/no-go audit: `docs/app/10_ARCHITECTURE_GO_NO_GO_AUDIT.md`
- Primary target architecture: `docs/app/07_NEA_TARGET_ARCHITECTURE.md`
- Technical database appendix: `docs/app/architecture/database-target-model.md`
- Architecture/environment decisions: `docs/app/decisions/architecture-and-environment-decisions.md`
- Remote baseline/retirement operations: `docs/app/operations/remote-baseline-and-retirement.md`
- Daily NEa execution tracker: `docs/app/operations/nea-implementation-roadmap.md` — operational progress only; never overrides the official TKV source, requirements, traceability, target architecture, or MVP gates.
- Remote baseline/recovery proof: `docs/app/proofs/remote-baseline-and-recovery-gate.md`
- Preliminary execution plan: `docs/app/09_NEA_MVP_PLAN.md`
- App TODO: `docs/app/04_TODO.md`
- Signup/dashboard contract: `docs/app/contracts/signup-dashboard.md`
- Target intake verification/promotion contract: `docs/app/contracts/intake-verification-promotion.md`
- Auth contract: `docs/app/contracts/auth.md`
- Document upload contract: `docs/app/contracts/document-upload.md`
- Edge contract: `docs/app/contracts/edge-functions.md`
- Audit contract: `docs/app/contracts/audit.md`
- White-label architecture: `docs/app/architecture/white-label-control-plane.md`
- Platform control-plane contract: `docs/app/contracts/platform-control-plane.md`

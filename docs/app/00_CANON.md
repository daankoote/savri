# ENVAL App Canon

Status: CURRENT source of truth for ENVAL documentation authority, source order, and navigation.

Audit evidence status: PROOF ONLY.

Canon and target architecture approval: GO — APPROVED BY DAAN ON 2026-07-22

Blanket implementation authorization: NO

Approval applies to the ENVAL canon and target architecture direction. It is not CURRENT PROVEN implementation or built compliance, does not expand existing bounded foundations, and grants no code, schema, UI, Edge Function, remote, deployment, or general implementation authority. CURRENT PROVEN remains reserved exclusively for built behavior with green proof; `READY`, `IN PROGRESS`, `TODO`, and `BLOCKED — EXTERNAL` remain independently controlling per work package.

Decision evidence: Daan's explicit 2026-07-22 decision, recorded in `docs/app/10_ARCHITECTURE_GO_NO_GO_AUDIT.md` and the append-only changelog. The documentation baseline remains commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805`; bounded execution state is tracked only in `docs/app/operations/nea-implementation-roadmap.md`.

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

ENVAL is being built as a customer-facing commercial ERE-E inboekdienstverlener.

The current `/app` product scope includes:

- particulier
- zakelijk
- VVE

CURRENT PROVEN scope is customer intake, dossier construction, evidence lifecycle, audit trail, and app document handling foundations where current code, schema, and proof output show that behavior.

TARGET scope is the ERE-E inboekdienstverlener service within final legal, regulatory, operational, and commercial terms.

UNKNOWN until separately proven:

- REV account status
- NEa list publication status
- mandate and contract execution model
- exact inboeking execution process
- verifier interaction model
- final legal/commercial responsibility split

Commercial direction:

- Intended customer-facing model: 10% success fee.
- Exact result definition, fee trigger, fee base, partial success, reversal, audit correction, and clawback remain legal/commercial open items.
- No public competitor fee claims may be made without verified sources.

ENVAL is not:

- a verifier
- a certifier
- a compliance authority
- a result guarantor

ENVAL does not guarantee:

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

The ENVAL role direction is ERE-E inboekdienstverlener. That does not by itself prove NEa approval, accreditation, REV account access, list publication, mandate volume, verifier readiness, or production eligibility. Those claims require current regulatory and implementation evidence.

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

Signed-intake and promotion lifecycle:

- Collecting pre-auth quarantine, `typed_name_otp_v1`, immutable signing finalization, finalized server locks, safe receipt and server-authoritative same-tab recovery are CURRENT PROVEN locally as bounded source/runtime proofs.
- `typed_name_otp_v1` proves signing intent plus control of the used email channel; the former separate email-verification promotion trigger is `SUPERSEDED` and must not be rebuilt without a new hard requirement.
- Atomic durable promotion into `app_cases`-owned state remains TARGET / NOT IMPLEMENTED and is defined in `docs/app/contracts/intake-verification-promotion.md`.
- CURRENT `pending_verification` means only finalized/locked and waiting for ENVAL internal handling. 09C1 must explicitly rename it to `submitted_for_review`; neither name is formal NEa inboekverificatie.
- Current authenticated dashboard/document behavior remains dossier-shaped until the separately proven case-owned promotion/Auth/dashboard cutover is complete.

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
- ENVAL may perform preparatory internal support checks selected manually, randomly, risk-based, or at verifier request. Those checks must be audit-worthy, historized, and may never replace official verification.
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

Public copy may say:

- ENVAL helpt je met het aanmeld- en inboekproces.
- Je betaalt alleen bij resultaat.
- Geen garantie op resultaat.
- Wij zorgen dat je dossier controleerbaar en compleet wordt opgebouwd.

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

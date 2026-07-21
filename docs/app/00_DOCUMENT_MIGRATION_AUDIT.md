# ENVAL Document Migration Audit

Status: DRAFT claim-by-claim migration audit.

Post-removal status: PROOF-ONLY. Legacy consolidation and in-repo legacy documentation removal are complete. This audit remains evidence for the migration/removal process until the new NEa canon foundation is created.

NEa foundation closure status, 2026-07-19: PROOF-ONLY / CLOSED FOR ARCHITECTURE USE. The first NEa compliance foundation now lives in `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md`, `docs/app/06_NEA_REQUIREMENTS.md`, `docs/app/07_NEA_TARGET_ARCHITECTURE.md`, `docs/app/08_NEA_TRACEABILITY_MATRIX.md`, and `docs/app/09_NEA_MVP_PLAN.md`. This audit is no longer an active architecture source.

Audit date: 2026-07-19.

Repo: `/Users/daankoote/dev/enval`.

Branch observed: `main`.

HEAD observed: `f24b90263c3e22b8fdebd8c3fa016594ddfa7333`.

Scope: documentation migration audit only. This file does not define new architecture and does not change code, migrations, SQL, Edge Functions, tests, configuration, UI, routing, or document storage behavior.

## Worktree Boundary

Pre-existing worktree state observed before this rewrite:

- `deno.lock` is untracked.
- `scripts/proofs/app-signup-intake-quarantine-schema.proof.ts` is untracked.
- `supabase/migrations/20260716100000_app_signup_intake_quarantine_schema.sql` was explicitly named as possible pre-existing schema-batch state; current `git status --short` did not report it as modified or untracked.

These files are outside this batch. They were not read as migration targets, not formatted, not restored, not removed, and not edited.

Changed in the original audit batch:

- `docs/app/00_DOCUMENT_MIGRATION_AUDIT.md` only.

Deletion batch note, 2026-07-19:

- The former in-repo legacy documentation tree was externally copied by Daan before removal.
- The external copy is historical only and is not source of truth.
- The app removed app migration matrix was removed because relevant claims had already been migrated, marked already present, consciously excluded, or blocked for NEa architecture.
- No code, SQL, migrations, Edge Functions, tests, config, UI, commit, or push were part of the deletion batch.

## Document Set

Included documentation sources:

- `README.md`
- `app/README.md`
- `docs/README.md`
- `docs/app/**`
- `removed legacy documentation tree`

Excluded sources:

- `node_modules`
- `.git`
- `dist`
- `build`
- `vendor`
- package documentation
- generated files
- code comments as documentation source of truth

`artikelen/**` classification:

- public publication content only;
- not architecture canon;
- not technical source of truth;
- must be legally/source edited in a separate content batch.

Counts observed:

- Active project documentation sources reviewed: 25 (`README.md`, `app/README.md`, `docs/README.md`, and 22 existing `docs/app` docs excluding this audit file).
- Legacy documentation sources reviewed: 20 (`removed legacy documentation tree`).
- Publication content files classified outside architecture canon: 12 (`artikelen/**/artikel.md`).

## Assessment Order

Every claim below is assessed in this order:

1. Valid law and official NEa publications.
2. Current code, schema, migrations, and green proof output.
3. Explicit decision: ENVAL is an inboekdienstverlener for ERE-E.
4. Current docs with proven connection to the new app.
5. Legacy docs only as possible migration source.

Important interpretation rules:

- Code/schema only count as CURRENT where implementation and proof are explicitly documented or directly verifiable.
- Local proof is not production proof.
- Documentation-only claims without proof are not upgraded to CURRENT.
- Legacy docs are not CURRENT source of truth for `/app`, `api-app-*`, or `app_*`.
- Not proven means `UNKNOWN`.

## NEa Control Points

Official NEa sources checked on 2026-07-19:

- `https://www.emissieautoriteit.nl/regelgeving/hernieuwbare-energie-voor-vervoer-eres`
- `https://www.emissieautoriteit.nl/regelgeving/hernieuwbare-energie-voor-vervoer-eres/inboeken-hernieuwbare-energie-vervoer`
- `https://www.emissieautoriteit.nl/regelgeving/hernieuwbare-energie-voor-vervoer-eres/inboeken-hernieuwbare-energie-vervoer/inboeken-elektriciteit`
- `https://www.emissieautoriteit.nl/documenten/2026/02/02/lijst-van-inboekdienstverleners`
- `https://www.emissieautoriteit.nl/documenten/2026/02/02/inboeken-elektriciteit-particulieren`
- `https://www.emissieautoriteit.nl/registers-en-portalen/register-energie-voor-vervoer`
- `https://www.emissieautoriteit.nl/registers-en-portalen/register-energie-voor-vervoer/autorisatie-en-toegang`
- `https://www.emissieautoriteit.nl/registers-en-portalen/register-energie-voor-vervoer/autorisatie-en-toegang/gebruikersrollen`

NEa facts used as audit constraints:

- ERE and REV are the current 2026 direction for this system; HBE is legacy or transition context.
- Electricity supplied to transport may be registered in REV and can create ERE-E.
- Particulieren arrange electricity inbooking exclusively through an inboekdienstverlener.
- Inboekdienstverleners register electricity on behalf of companies or private persons.
- Inboekdienstverleners must be KvK-registered and meet either the 2 million kWh threshold or the 200 mandates threshold.
- NEa publication on the list of inboekdienstverleners is not approval, accreditation, quality assessment, or proof of a REV account.
- Electricity suppliers must be aangeslotene; the primary allocation point requirement and CAR checks are material.
- The service provider is responsible for correct registration, legal conditions, and suitable administrative organization.
- Inbooking deadlines, annual verification statements, REV account/facility requirements, rekeningbevoegde/fiatteur rules, and audit/handhaving risk belong in the compliance/operations canon.

## Claim Register

The table below is the migration audit. It is intentionally claim-based, not file-inventory-based.

| ID | source_document | section_or_anchor | concise_claim | claim_type | current_evidence | evidence_status | nea_alignment | new_enval_alignment | duplicate_or_overlap | required_action | target_document | migration_summary | deletion_precondition | risk_if_lost | risk_if_retained |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 | `docs/app/00_CANON.md` | Product Canon | ENVAL is a customer-facing commercial ERE inboeker. | STRATEGY | Current docs and app direction; NEa terminology distinguishes inboekers and inboekdienstverleners. | PARTIAL PROVEN | TO CONFIRM | PARTIAL | Product model, signup-dashboard. | REWRITE | Regulatory requirements / compliance directive. | Replace broad "inboeker" with NEa-aligned "inboekdienstverlener for ERE-E" and state REV-account/listing status separately. | Not deletable. | Core product role ambiguity. | Could imply ENVAL already has direct REV inboeker status or NEa approval. |
| C02 | `docs/app/00_CANON.md`, `docs/app/02_PRODUCT_MODEL.md` | Product Canon / Product Position | ENVAL handles intake, dossier construction, evidence lifecycle, audit trail, and inboeking service. | STRATEGY | App signup, auth, dashboard, document lifecycle are locally proven; inboeking execution is not implemented. | PARTIAL PROVEN | TO CONFIRM | ALIGNED | Backend architecture, TODO. | MIGRATE | Product/service model; target architecture. | Keep current app-proven duties separate from target inboeking execution. | Keep until split is made. | Product scope and support model. | Overstates actual implemented inboeking execution. |
| C03 | `removed-from-repo root-static/00_GLOBAL.md`, `removed-from-repo root-static/08_ENVAL_POSITIONERING.md`, `removed-from-repo root-static/PROJECT_INSTRUCTIONS_CHAT.md` | Strategic Positionering | ENVAL is not an inboeker and is only neutral dossier infrastructure. | STRATEGY | Explicitly superseded by current docs and user direction. | LEGACY | CONFLICT | CONFLICT | Current canon rejects this. | SUPERSEDE | None, except historical archive note. | Mark as historical only; do not migrate into new canon. | Safe only after legacy role claims are already documented as superseded. | Historical decision trail. | Directly conflicts with inboekdienstverlener direction. |
| C04 | `removed-from-repo root-static/00_GLOBAL.md`, `removed-from-repo root-static/08_ENVAL_POSITIONERING.md` | Scenario A / responsibilities | External inboeker owns all inbooking logic and ENVAL is only an overdrachtslaag. | STRATEGY | Legacy wrapper says superseded; current app expects ENVAL service operation. | LEGACY | CONFLICT | CONFLICT | C03. | SUPERSEDE | Product/service model, only as "old rejected premise". | Preserve only as "do not copy" warning. | After role rewrite is explicit in canon. | Explains why old docs differ. | Would block the required inboekdienstverlener architecture. |
| C05 | `removed-from-repo root-static/00_GLOBAL.md` | Strategic Positioning | No revenue share model and no money flows through ENVAL. | STRATEGY | Current 10 percent success fee is documented but final legal terms are open. | LEGACY | NOT APPLICABLE | CONFLICT | Fee terms, product model. | SUPERSEDE | Fee model and service terms. | Replace with final result-fee and payment/realized-value lifecycle once legal is done. | After final fee terms and lifecycle exist. | Historical pricing rationale. | Conflicts with intended success-fee service. |
| C06 | `docs/app/legal/fee-model-and-service-terms.md` | Commercial Model | Customer-facing success fee is intended to be 10 percent. | STRATEGY | Current docs only; legal definition remains open. | DRAFT | NOT APPLICABLE | ALIGNED | Product model, TODO. | VALIDATE FIRST | Fee model and service terms. | Keep as working assumption until legal review defines result, fee base, VAT/tax, clawback. | Not deletable until terms supersede it. | Commercial model. | Public use before legal review could create liability. |
| C07 | `docs/app/00_CANON.md`, `docs/app/02_PRODUCT_MODEL.md`, `docs/app/contracts/signup-dashboard.md` | Claim Boundaries | ENVAL gives no guarantee of ERE award, acceptance, payout, timing, certification, or document approval. | REGULATORY | Consistent across app docs and NEa control points; not a code claim. | CURRENT PROVEN | ALIGNED | ALIGNED | Terms, public copy boundary. | KEEP | Regulatory requirements / product model / public copy policy. | Retain as mandatory claim boundary. | Not deletable. | Prevents guarantee/liability drift. | Low risk if retained; must be translated into customer-safe copy. |
| C08 | Official NEa sources; missing from current canon | Inboekdienstverleners | Inboekdienstverleners must satisfy 2 million kWh or 200 mandates threshold. | REGULATORY | Official NEa publication. | CURRENT PROVEN | ALIGNED | UNKNOWN | Missing in current docs. | MIGRATE | Regulatory requirements / compliance directive. | Add as mandatory compliance fact and readiness gate. | Not applicable. | Critical NEa eligibility constraint. | If omitted, canon can suggest premature service readiness. |
| C09 | Official NEa sources; missing from current canon | List of inboekdienstverleners | NEa list publication is not approval, accreditation, quality assessment, or proof of REV account. | REGULATORY | Official NEa publication. | CURRENT PROVEN | ALIGNED | UNKNOWN | Missing in current docs. | MIGRATE | Regulatory requirements / public copy policy. | Add disclaimer to compliance and public copy source policy. | Not applicable. | Prevents misleading trust claims. | If omitted, marketing may overclaim NEa status. |
| C10 | Official NEa sources; missing from current canon | Particulieren | Particulieren arrange ERE-E inbooking exclusively through an inboekdienstverlener. | REGULATORY | Official NEa publication. | CURRENT PROVEN | ALIGNED | ALIGNED | Product model needs sharper language. | MIGRATE | Regulatory requirements / product model. | Use as core reason for ENVAL service role. | Not applicable. | Customer eligibility and role model. | If vague, customer-facing flow may imply self-service REV inbooking. |
| C11 | Official NEa sources; missing from current canon | Electricity inbooking | Aangeslotene status, primary allocation point, EAN, kWh, period, source type, and evidence are material. | REGULATORY | Official NEa inboeken-electriciteit page. | CURRENT PROVEN | ALIGNED | UNKNOWN | Signup-intake covers some charger/document data only. | MIGRATE | Regulatory requirements; account-document requirements. | Create compliance traceability from NEa field to app field/evidence. | Not applicable. | Core data model requirements. | Without it, app data model may be incomplete. |
| C12 | Official NEa sources; missing from current canon | Deadline / verification | Deadline and annual inboekverificatie requirements must drive operations. | REGULATORY | Official NEa pages. | CURRENT PROVEN | ALIGNED | UNKNOWN | TODO mentions legal/regulatory open item only. | MIGRATE | Operations/runbook; inboeking lifecycle. | Add year-close, verification statement and operational ownership requirements. | Not applicable. | Prevents missed statutory/REV deadlines. | If retained only as vague todo, MVP plan is incomplete. |
| C13 | `README.md`, `docs/README.md`, `app/README.md` | Documentation | `docs/app/` is the only current canon for `/app`, `api-app-*`, and `app_*`. | ARCHITECTURE | Consistent across readmes and current docs. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | `docs/app/00_CANON.md`. | KEEP | Project canon. | Keep as top-level navigation invariant. | Not deletable. | Prevents legacy drift. | Low risk. |
| C14 | `README.md`, `docs/app/01_SYSTEM_MAP.md`, `app/README.md` | Surfaces | Root static HTML/CSS/JS remains production/fallback; `/app` is local rebuild. | ARCHITECTURE | Current readmes and system map agree; no production deploy proof for `/app`. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | Frontend architecture. | KEEP | Current system map. | Keep until explicit production cutover. | Cutover proof exists. | Prevents accidental production routing edits. | Could confuse if not updated at cutover. |
| C15 | `removed-from-repo root-static/00_GLOBAL.md`, `PROJECT_INSTRUCTIONS_CHAT.md` | Branch context | Active branch is `removed-old-feature-branch` or `removed-old-pricing-branch`, with `main` as pilot. | OPERATIONS | Actual branch observed: `main`; current canon says active work branch is `main`. | LEGACY | NOT APPLICABLE | CONFLICT | Git workflow. | DELETE | None. | Do not migrate. | Safe after legacy branch references are not needed for history. | None beyond historical context. | Misleads future agents and release work. |
| C16 | `docs/app/contracts/edge-functions.md`, `docs/app/architecture/schema.md` | API namespace | New app behavior must use `api-app-*` and `app_*`, not legacy `api-dossier-*` or `dossier_*`. | ARCHITECTURE | Current contracts and code/migrations contain app namespace; local proofs documented. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | Canon, backend architecture. | KEEP | Current system map; edge contract. | Keep as hard boundary. | Not deletable. | Prevents coupling new app to old wizard. | Low risk. |
| C17 | `removed-from-repo root-static/01_SYSTEM_MAP.md`, `10_EDGE_FUNCTIONS_CONTRACT.md`, old TODO | Legacy architecture | Old `api-dossier-*` endpoints are active CURRENT architecture. | ARCHITECTURE | Legacy wrappers supersede; operations audit says fallback only. | LEGACY | NOT APPLICABLE | CONFLICT | C16. | ARCHIVE | Legacy function migration audit. | Keep only as production/fallback inventory until retired. | After `/app` production replacement and traffic proof. | Fallback endpoint inventory. | If treated current, app will copy old sessions and tables. |
| C18 | `docs/app/contracts/edge-functions.md` | CORE endpoints | Current app CORE endpoints are `api-app-signup-submit`, auth bootstrap, dashboard read, document upload/confirm/download/withdraw. | ARCHITECTURE | Current docs and endpoint files/proofs align. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | Canon, TODO, proofs. | KEEP | Edge contract. | Keep as endpoint inventory, update only with implemented/proven endpoints. | Not deletable. | Endpoint ownership and review surface. | Stale if future endpoint list changes without update. |
| C19 | `removed-from-repo root-static/10_EDGE_FUNCTIONS_CONTRACT.md` | CORE/UTILITY | Every Edge Function must be CORE or UTILITY, with CORS/META/IDEM/AUD/AUTH/SRV discipline. | ARCHITECTURE | App edge contract adapted discipline for `api-app-*`; uniformity for all old endpoints is legacy-specific. | PARTIAL PROVEN | NOT APPLICABLE | ALIGNED | App edge contract. | MERGE | Edge contract. | Retain discipline for app endpoints, not old endpoint list. | After app edge contract contains all useful invariants. | Strong audit/security discipline. | Old function inventory can override app truth. |
| C20 | `docs/app/contracts/auth.md`, `edge-functions.md` | Auth model | App customer auth uses Supabase Auth JWT, `app_customer_identities`, `app_customers`, and dossier ownership. | AUTH | Locally proven in auth bootstrap and dashboard/document proofs. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | Signup-dashboard, document-upload. | KEEP | Auth contract. | Keep and separate from legacy sessions. | Not deletable. | Customer account boundary. | Production proof still open if wording overclaims remote readiness. |
| C21 | `removed-from-repo root-static/00_GLOBAL.md`, `10_EDGE_FUNCTIONS_CONTRACT.md`, `XX_temp_Concrete_gestructureerde_opl.md` | Session auth | Old link-token/session-token in `dossier_sessions` is current auth contract. | AUTH | Legacy only; current app explicitly forbids using it as app account auth. | LEGACY | NOT APPLICABLE | CONFLICT | Auth contract. | ARCHIVE | Auth contract, only conceptual lessons. | Preserve anti-enumeration/session lessons only if adapted. | After support/recovery auth design validates what is reusable. | Anti-enumeration and token lifecycle lessons. | Directly conflicts with Supabase Auth app model. |
| C22 | `docs/app/contracts/signup-dashboard.md`, `docs/app/proofs/signup-submit.md` | Signup write v3 | `api-app-signup-submit` creates customer, identity, dossier shell, locations, chargers, document slots, legal acceptances, app audit, idempotency. | DATA | Local proof doc and contracts state write v3 proof. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | TODO, schema. | KEEP | Signup-dashboard contract; proof doc. | Keep as current local proof, not production proof. | Not deletable until newer proof supersedes it. | Current data foundation. | Overclaim if not labeled local-only. |
| C23 | `docs/app/contracts/signup-dashboard.md`, `intake-verification-promotion.md` | Target intake | Pre-auth quarantine, email verification, and promotion are TARGET / NOT IMPLEMENTED. | LIFECYCLE | Current docs explicitly mark target; schema batch state not assumed in this audit. | TARGET | TO CONFIRM | ALIGNED | Document upload, audit. | VALIDATE FIRST | Intake verification promotion contract. | Keep target; do not mark CURRENT until schema/endpoints/browser/proofs pass. | Not deletable. | Future customer flow direction. | Premature current labeling would be false. |
| C24 | `docs/app/contracts/document-upload.md` | Document upload current truth | Authenticated dashboard document upload/download/withdrawal for MID and invoice PDF is locally proven. | LIFECYCLE | Current docs and local proof statements. | CURRENT PROVEN | TO CONFIRM | ALIGNED | Signup-dashboard, TODO. | KEEP | Document-upload contract. | Keep as dashboard-only current proof. | Not deletable. | Evidence lifecycle. | Could imply public signup upload or production proof if wording is sloppy. |
| C25 | `docs/app/contracts/document-upload.md`, legacy upload docs | Upload confirmation | `confirmed` upload means bytes/hash confirmed, not evidence accepted by ENVAL/NEa/verifier. | AUDIT | Current document contract states no final acceptance; NEa requires later controls/verification. | CURRENT PROVEN | ALIGNED | ALIGNED | Audit contract, legacy phase2. | KEEP | Document-upload contract; compliance traceability. | Keep as hard invariant. | Not deletable. | Prevents acceptance overclaim. | Low risk. |
| C26 | `removed-from-repo root-static/PHASE_2_UPLOAD_STRATEGY.md` | Old upload scope | Client compression/final-byte hash and server confirm are sufficient audit basis. | AUDIT | Server hash confirm is current; client-only compression strategy and old scope are legacy. | PARTIAL PROVEN | TO CONFIRM | PARTIAL | Document-upload contract. | MERGE | Document-upload contract. | Keep final-byte hash/server confirm; validate compression/transform policy separately. | After current upload contract covers all useful pieces. | Hash integrity pattern. | Could normalize client-transformed-only evidence without legal review. |
| C27 | `docs/app/contracts/document-upload.md`, `docs/app/03_CHANGELOG_APPEND_ONLY.md` | Immutability | Document replacement creates immutable versions; withdrawal preserves file/version evidence and does not hard-delete storage. | AUDIT | Current local/browser proofs documented. | CURRENT PROVEN | TO CONFIRM | ALIGNED | Audit contract, schema. | KEEP | Document-upload; audit contract. | Keep as app evidence invariant. | Not deletable. | Evidence trail and dispute proof. | Needs production retention policy before final legal claim. |
| C28 | `docs/app/contracts/audit.md`, schema docs | Audit tables | App audit uses `app_intake_audit_events`, `app_audit_events`, `app_idempotency_keys`, and document file/version tables. | AUDIT | App contracts and migrations/proofs documented. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | Edge contract, signup proof. | KEEP | Audit contract. | Keep table ownership and no legacy audit writes. | Not deletable. | Audit reconstruction. | Stale if schema changes. |
| C29 | `removed-from-repo root-static/02_AUDIT_MATRIX.md` | Legacy audit events | Legacy `dossier_audit_events` event matrix is canonical current audit truth. | AUDIT | Legacy wrappers supersede; app audit contract replaced it at doctrine level. | LEGACY | NOT APPLICABLE | CONFLICT | App audit contract. | MERGE | Audit contract; compliance traceability matrix. | Migrate only event-discipline patterns, not old event names. | After useful patterns are in app audit docs. | Mature audit taxonomy and reject/fail distinctions. | Old event names/table assumptions can pollute app. |
| C30 | `removed-from-repo root-static/00_GLOBAL.md`, `11_ANALYSE_PLAN.md`, `Analysis_Test_Matrix.md` | Analysis layer | Derived analysis reads declared/observed/evaluated data and must not mutate core dossier truth. | DATA | Current app has frontend PDF preview and no final app analysis contract; principle is valuable but not fully app-proven. | PARTIAL PROVEN | TO CONFIRM | ALIGNED | Signup-intake, document-upload. | VALIDATE FIRST | Future document-analysis contract. | Preserve principle as target invariant; prove before current labeling. | Keep legacy until future analysis contract exists. | Important separation of user input and derived observations. | If retained as current, overstates app analysis runtime. |
| C31 | `removed-from-repo root-static/11_ANALYSE_PLAN.md` | Parser/OCR | PDF browser parser and local image OCR worker are current active lanes. | DATA | Legacy-only for old dossier; current app has frontend PDF preview/proof, image OCR remains future/internal. | LEGACY | TO CONFIRM | PARTIAL | App document-upload open parser/precheck item. | VALIDATE FIRST | Future document-analysis contract. | Do not copy runtime lane without fresh app proof. | After parser/OCR app strategy is proved. | Hard-earned OCR lesson. | Could reintroduce old worker assumptions into app. |
| C32 | `docs/app/architecture/signup-intake.md` | Signup draft | Signup draft supports particulier, zakelijk, VVE, multiple locations, unlimited chargers; no old max-4 cap. | UI | Frontend architecture and proofs document this. | CURRENT PROVEN | TO CONFIRM | ALIGNED | Canon account-type rule. | KEEP | Signup-intake architecture. | Keep as UI/domain rule; connect to NEa account requirements later. | Not deletable. | Prevents old max-4/private-only regression. | May imply all account-specific compliance is complete; it is not. |
| C33 | `removed-from-repo root-static/PHASE_2_UPLOAD_STRATEGY.md`, old TODO | Old scope | Private-only doelgroep and max four documents/chargers are current global rules. | UI | Explicitly superseded by app account-type/unlimited charger direction. | LEGACY | TO CONFIRM | CONFLICT | C32. | DELETE | None. | Do not migrate. | Safe after legacy warnings captured. | None except historical context. | Would block business/VVE and scale model. |
| C34 | `docs/app/architecture/frontend.md` | Frontend routes | `/app` routes include home, aanmelden, account, dashboard, ere, upload, contact, privacy, voorwaarden; public routes avoid eager Auth. | UI | Current app docs and local proof statements. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | App README. | KEEP | Frontend architecture. | Keep as current frontend map, not production route contract. | Not deletable. | UX and auth-load boundary. | Stale if routes change. |
| C35 | `README.md`, `app/README.md`, `docs/app/architecture/frontend.md` | Stack | Current target frontend stack is isolated Vite app; root static remains fallback. | ARCHITECTURE | Current docs agree. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | C14. | KEEP | Current system map. | Keep until cutover. | Production cutover proof. | Prevents accidental root-static edits. | If retained after cutover, stale. |
| C36 | `removed-from-repo root-static/00_GLOBAL.md`, root-static system map | Stack | Static HTML/JS/CSS is the current application stack for future work. | ARCHITECTURE | Legacy only; current target stack is `/app` Vite. | LEGACY | NOT APPLICABLE | CONFLICT | C35. | ARCHIVE | Legacy retirement plan. | Keep only as fallback inventory. | After static production retirement. | Fallback behavior and content inventory. | New development may happen in old surface. |
| C37 | `docs/app/architecture/schema.md`, `docs/app/contracts/edge-functions.md` | RLS/service-role | Business writes go through Edge Functions with service-role server writes; sensitive tables RLS deny/default. | AUTH | App schema/edge contracts and local proof for app foundation. | PARTIAL PROVEN | NOT APPLICABLE | ALIGNED | Auth, audit. | KEEP | Target architecture; security contract. | Keep as security invariant, label production RLS proof open. | Not deletable. | Security boundary. | Overclaims if all future tables marked proven. |
| C38 | `removed-from-repo root-static/00_GLOBAL.md`, `04_TODO.md` | RLS hardening | Legacy anon/auth DB reads are locked down; service-role Edge is required. | AUTH | Legacy local proof context; app has separate app auth/RLS proof. | LEGACY | NOT APPLICABLE | PARTIAL | C37. | VALIDATE FIRST | Security contract. | Migrate only principle after checking current app schema. | After app RLS proof covers it. | Useful defense-in-depth lesson. | Old table grants may be mistaken for app grants. |
| C39 | `docs/app/contracts/signup-dashboard.md`, `auth.md` | Dashboard projection | Customer-safe dashboard read uses `api-app-dashboard-get`, not raw app tables or raw audit. | AUTH | Local proof documented. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | Audit contract, frontend architecture. | KEEP | Auth/dashboard contract. | Keep as current customer read invariant. | Not deletable. | Prevents raw data exposure. | Needs production proof before external claims. |
| C40 | `docs/app/contracts/intake-verification-promotion.md` | Correction flow | `Start dossier` is one normal submission; corrections are targeted through capabilities and `Correcties indienen`. | LIFECYCLE | Target contract only; no current implementation proof in this audit. | TARGET | TO CONFIRM | ALIGNED | Signup-dashboard. | VALIDATE FIRST | Intake verification promotion; target architecture. | Keep target but do not current-label. | After implementation/proofs exist. | Future UX and audit consistency. | Overclaims current customer flow. |
| C41 | `removed-from-repo root-static/04_TODO.md`, `00_GLOBAL.md` | Legacy dossier states | Old statuses like `in_review`, locked/unpaid, export-preserved drive lifecycle. | LIFECYCLE | Legacy only; app has different dashboard/document state and future result lifecycle open. | LEGACY | TO CONFIRM | CONFLICT | Dashboard-lifecycle, schema. | MERGE | Inboeking lifecycle; retention policy. | Salvage retention/export concepts, not old state machine. | After app lifecycle is defined. | State-machine lessons and edge cases. | Old lifecycle can constrain new service model. |
| C42 | `docs/app/contracts/audit.md`, legacy retention docs | Retention | Retention/minimization must preserve privacy-hard proof and separate product withdrawal from proof cleanup. | LIFECYCLE | Current app audit contract plus legacy retention lessons; exact app retention not implemented. | PARTIAL PROVEN | TO CONFIRM | ALIGNED | Signup-dashboard, schema. | VALIDATE FIRST | Operations/runbook; retention policy. | Keep as target invariant; define app retention policy before production. | Keep until policy exists. | Privacy and evidence survival. | Premature cleanup rules could cause data loss. |
| C43 | `removed-from-repo root-static/00_GLOBAL.md`, `02_AUDIT_MATRIX.md` | Retention rules | Draft 7 days, locked/unpaid 14 days, preserved runtime cleanup 3 days are current retention rules. | OPERATIONS | Legacy runtime/proof only; not app canon. | LEGACY | TO CONFIRM | UNKNOWN | C42. | VALIDATE FIRST | Retention policy. | Do not migrate durations without legal/operational validation. | After app retention periods are legally approved. | Historical cleanup proof. | Wrong retention periods may violate obligations. |
| C44 | `docs/app/operations/run-debug.md`, `legacy-function-migration-audit.md` | Operations | Gateway rejects must be distinguished from function/application rejects. | OPERATIONS | Proven in signup proof and app edge docs. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | Legacy ops book. | KEEP | Operations/runbook. | Keep as operational invariant. | Not deletable. | Prevents false audit expectations. | Low risk. |
| C45 | `removed-from-repo root-static/06_OPS_RUN_DEBUG_BOOK.md` | Operations | Old ops/debug steps are current runbook for all functions. | OPERATIONS | Legacy only; app run-debug adapts selected patterns. | LEGACY | NOT APPLICABLE | PARTIAL | App run-debug. | MERGE | Operations/runbook. | Migrate gateway/request-id/debug discipline only. | After app runbook includes all useful items. | Practical incident handling. | Old commands may target wrong functions/envs. |
| C46 | `removed-from-repo tooling/Cheatsheet_SUPABASE_SQL_legacy.md` | Tooling | Legacy SQL cheat sheet is safe current tooling. | TOOLING | Marked legacy and unsafe. | LEGACY | NOT APPLICABLE | UNKNOWN | Run-debug. | DELETE | None unless rewritten. | Do not migrate destructive SQL snippets. | Safe after no unique safe commands remain. | Maybe a few command reminders. | High risk of destructive manual SQL. |
| C47 | `removed-from-repo tooling/Cheatsheet_GIT_legacy.md` | Tooling | Old Git cheat sheet is current workflow. | TOOLING | Replaced by app git workflow. | LEGACY | NOT APPLICABLE | UNKNOWN | Git workflow. | DELETE | None. | Do not migrate except basic non-destructive concepts already known. | Safe after git workflow covers branch/commit rules. | Minimal. | Branch/status confusion. |
| C48 | `removed-from-repo root-static/09_ARTIKEL_STANDAARD.md`, `artikelen/**` | Content | Article topics and campaigns are publication content, not technical canon. | CONTENT | User boundary and current docs. | DRAFT | TO CONFIRM | PARTIAL | Future content policy. | MIGRATE | Content/source policy. | Classify as content; source-check and legal edit separately. | After content policy and migrated source list exist. | Public education topics. | If retained as canon, marketing claims can drive architecture. |
| C49 | `docs/app/04_TODO.md` | MVP backlog | P0 includes legal/regulatory requirements, exact fee contract, production proof, account-specific documents, inboeking boundary. | OPERATIONS | Current TODO; many items open. | TARGET | TO CONFIRM | ALIGNED | Missing-info section. | MIGRATE | MVP plan / TODO. | Keep as active backlog but map each item to regulatory/architecture target. | Not deletable. | MVP sequencing. | Vague P0 can hide compliance blockers. |
| C50 | `docs/app/03_CHANGELOG_APPEND_ONLY.md`, legacy changelog | Changelog | Current app changelog is append-only; legacy changelog is historical only. | OPERATIONS | Current docs clearly separate app and legacy changelogs. | CURRENT PROVEN | NOT APPLICABLE | ALIGNED | Duplicate map. | KEEP | Append-only changelog. | Keep both, but only app changelog drives new app history. | Legacy can be archived after migration, not rewritten. | Proof chronology. | If merged carelessly, old "CURRENT" claims re-enter canon. |

## Active-Doc Assessment

| Document | Proven current | Contains legacy or drift | Missing for NEa architecture | Final action |
|---|---|---|---|---|
| `README.md` | Repo boundary, main branch rule, root/static fallback, `/app` rebuild. | No major drift. | No NEa detail needed here. | KEEP |
| `app/README.md` | Vite app boundary, port 5175, not production connected. | No major drift. | No NEa detail needed here. | KEEP |
| `docs/README.md` | Index of current app docs and legacy docs. | Will need update if final docset changes. | No NEa detail needed here. | UPDATE |
| `docs/app/00_CANON.md` | Source-of-truth order, app namespace, legacy rule, account-type rule. | Uses broad "ERE inboeker" language. | Inboekdienstverlener role, NEa list disclaimer, REV/facility/account status. | REWRITE |
| `docs/app/01_SYSTEM_MAP.md` | Surfaces, auth flow, document lifecycle path, target intake path. | No legacy-as-current, but role is generic. | NEa-facing operations and external compliance source references. | UPDATE |
| `docs/app/02_PRODUCT_MODEL.md` | Service positioning, no-guarantee claims, audit doctrine. | "Inboekservice" needs legal/regulatory sharpening. | Inboekdienstverlener responsibilities, mandate model, threshold model. | REWRITE |
| `docs/app/03_CHANGELOG_APPEND_ONLY.md` | App generation history. | Append-only historical entries include older status states by design. | None; do not use for regulatory truth. | KEEP |
| `docs/app/04_TODO.md` | Active app-only backlog and proof boundaries. | Regulatory items are too high-level. | NEa compliance blockers, mandate/REV/deadline/account-specific docs. | UPDATE |
| removed app migration matrix | Clear legacy reuse decisions. | Needs claim-level migration outcomes from this audit. | None beyond role conflict notes. | UPDATE |
| `docs/app/architecture/frontend.md` | Vite structure, routes, dashboard/signup UI boundaries. | No major legacy drift. | Content/source rules for `/ere` and public pages. | UPDATE |
| `docs/app/architecture/backend.md` | Supabase location, app backend capabilities, source-of-truth discipline. | Some target capabilities are generic. | REV/inboeking lifecycle, mandates, EAN/CAR, verification statement, fee/result events. | REWRITE |
| `docs/app/architecture/schema.md` | `app_` schema direction and local proof boundaries. | Large design doc mixes implemented and conceptual table families; mostly labeled. | NEa traceability fields and lifecycle entities. | REWRITE |
| `docs/app/architecture/signup-intake.md` | Signup draft, mapper, validation, old flow inventory, target page structure. | Old `api-dossier-*` references are inventory, not current. | Account-specific NEa document requirements and mandate fields. | UPDATE |
| `docs/app/architecture/dashboard-lifecycle.md` | Target dashboard lifecycle and open external research. | Target-heavy; not current implementation. | NEa/CAR permission scope, inboek execution statuses, correction/verification handoff. | UPDATE |
| `docs/app/contracts/auth.md` | App auth foundation, Supabase Auth, bootstrap, dashboard access. | Some future tables/flows are conceptual. | Customer authority/mandate relationship to inboekdienstverlener. | UPDATE |
| `docs/app/contracts/signup-dashboard.md` | Write v3, Auth bootstrap, dashboard read, document lifecycle local proof. | Product role wording says "via aangewezen partij" and needs final role decision. | Mandate, inboekdienstverlener contract, NEa fields. | UPDATE |
| `docs/app/contracts/document-upload.md` | Upload URL, confirm, versions, download, withdrawal, local proof. | None as current app document lifecycle; parser/precheck remains open. | NEa evidence taxonomy beyond MID/invoice PDFs. | UPDATE |
| `docs/app/contracts/edge-functions.md` | App endpoint list, CORE discipline, service-role boundary. | None; future endpoints not listed until documented. | Future inboeking/result endpoints once designed. | KEEP |
| `docs/app/contracts/audit.md` | App audit doctrine and current app event families. | Future events are draft. | Compliance traceability events for mandates, REV, verification, correction, result/fee. | UPDATE |
| `docs/app/contracts/intake-verification-promotion.md` | Target quarantine, verification, promotion, correction. | Target only; no current runtime claim. | NEa mandate, 1-year contract constraints for particulieren, verification statement, expiry. | UPDATE |
| `docs/app/legal/fee-model-and-service-terms.md` | Working 10 percent success-fee assumptions and no-guarantee claims. | Not final legal text. | Exact result, fee base, VAT/tax, reversal, clawback, NEa/verifier responsibility. | VALIDATE FIRST |
| `docs/app/proofs/signup-submit.md` | Local smoke/proof details for `api-app-signup-submit`. | Historical proof sections are retained, current mode is write v3. | No NEa detail needed. | KEEP |
| `docs/app/operations/git-workflow.md` | Branch/status/edit/migration/commit/push discipline. | No major drift observed. | No NEa detail needed. | KEEP |
| `docs/app/operations/run-debug.md` | App backend debugging notes. | Selected legacy debug patterns already adapted. | Future inboeking/REV ops checks. | UPDATE |
| `docs/app/operations/legacy-function-migration-audit.md` | Read-only legacy function audit and freeze rule. | No code deletion implied. | No direct NEa detail needed. | KEEP |

## Legacy Claim Migration Matrix

| Legacy document | Unique useful claims | Already in active docs? | Current proof exists? | Target | Safe deletion condition |
|---|---|---|---|---|---|
| `removed-from-repo README.md` | Legacy boundary and current canon pointer. | Yes. | Yes as documentation boundary. | `docs/README.md`, `removed app migration matrix`. | Keep while any legacy docs remain. |
| `removed-from-repo root-static/README.md` | Root/static legacy wrapper and warning about old assumptions. | Yes. | Yes as documentation boundary. | `removed app migration matrix`. | Keep while root-static legacy docs remain. |
| `removed-from-repo root-static/00_GLOBAL.md` | Old role, old branch, audit-first, derived analysis, session, retention, CSS, SEO, export. | Partly. | Proof only for old stack. | Audit contract, operations, document-analysis, retention. | After all useful principles are migrated and old role claims are superseded. |
| `removed-from-repo root-static/01_SYSTEM_MAP.md` | Detailed old root/static inventory, scripts, old API flow, analysis flow. | Partly. | Proof only for old stack. | Legacy retirement plan, document-analysis contract. | After static fallback is retired or fully inventoried elsewhere. |
| `removed-from-repo root-static/02_AUDIT_MATRIX.md` | Mature reject/success event taxonomy and audit coverage. | Partly. | Old runtime proof only. | App audit contract, compliance traceability matrix. | After app audit matrix covers all retained event patterns. |
| `removed-from-repo root-static/03_CHANGELOG_APPEND_ONLY.md` | Historical proof chronology. | No, intentionally separate. | Historical. | Archive only. | Do not delete unless external archive exists and project accepts loss of local history. |
| `removed-from-repo root-static/04_TODO.md` | Old open risks around retention, parser, cleanup, export, session. | Partly. | Mixed old proof. | App TODO only after filtering. | After each retained risk has an app target or is explicitly rejected. |
| `removed-from-repo root-static/05_START_CHAT_TEMPLATE.md` | No secrets, current truth, audit-first collaboration. | Mostly. | Not runtime proof. | Git workflow/run-debug if needed. | After no-secrets/current-truth rules are duplicated in active ops docs. |
| `removed-from-repo root-static/06_OPS_RUN_DEBUG_BOOK.md` | Gateway vs function debugging, request IDs, edge debug habits. | Partly. | Old operations only. | Operations/runbook. | After app runbook includes useful operational checks. |
| `removed-from-repo root-static/07_MVP_PLANNING_1_maand.md` | Old MVP sequencing. | Mostly obsolete. | Old stack only. | None, except rare risk references. | After old MVP tasks are declared superseded. |
| `removed-from-repo root-static/08_ENVAL_POSITIONERING.md` | Historical rejected/accepted strategy from neutral-infrastructure era. | Current docs already supersede it. | No current proof. | Archive only as decision history. | After product canon explicitly records superseded role. |
| `removed-from-repo root-static/09_ARTIKEL_STANDAARD.md` | Content process and old article topics/assets. | No. | Content only. | Future content/source policy. | After content policy and article source list exist. |
| `removed-from-repo root-static/10_EDGE_FUNCTIONS_CONTRACT.md` | CORE/UTILITY discipline, CORS/META/IDEM/AUD/AUTH/SRV, old session model. | Partly. | Current app proof only for adapted subset. | App edge contract. | After all app-relevant discipline is in app edge contract. |
| `removed-from-repo root-static/11_ANALYSE_PLAN.md` | Declared/observed/evaluated separation, parser/OCR lessons. | Partly. | App proof partial only. | Future document-analysis contract. | Keep until app analysis strategy is validated. |
| `removed-from-repo root-static/Analysis_Test_Matrix.md` | Invoice/parser test cases. | No. | Old proof/fixtures. | Future document-analysis proof matrix. | Keep until scenarios are migrated or rejected. |
| `removed-from-repo root-static/PHASE_2_UPLOAD_STRATEGY.md` | Final-byte hash, server confirm, client transform metadata, old scope. | Partly. | Server confirm current; transform strategy not fully app-proven. | Document-upload contract. | After upload strategy retains only current app-safe principles. |
| `removed-from-repo root-static/PROJECT_INSTRUCTIONS_CHAT.md` | Scope/no-secrets rules plus obsolete "not inboeker" and branch claims. | Partly. | Not runtime proof. | Git workflow/run-debug if needed. | After obsolete role/branch claims are explicitly superseded. |
| `removed-from-repo root-static/XX_temp_Concrete_gestructureerde_opl.md` | Old recovery/session thinking. | Partly conceptual. | Old stack only. | Auth contract only if validated. | After auth/recovery decisions are current and proven. |
| `removed-from-repo tooling/Cheatsheet_GIT_legacy.md` | Basic Git commands. | Yes. | Not needed. | None. | After current git workflow is accepted. |
| `removed-from-repo tooling/Cheatsheet_SUPABASE_SQL_legacy.md` | SQL snippets and Supabase notes. | No. | Unsafe/not current. | None unless rewritten safely. | After confirming no unique safe operational knowledge remains. |

## Duplicate Map

Duplicate canon:

- `README.md`, `docs/README.md`, `app/README.md`, and `docs/app/00_CANON.md` all point to the active canon. This is acceptable if the readmes stay short and `00_CANON.md` remains authoritative.

Duplicate system maps:

- Active: `docs/app/01_SYSTEM_MAP.md`, `docs/app/architecture/frontend.md`, `docs/app/architecture/backend.md`, `docs/app/architecture/schema.md`.
- Legacy: `removed-from-repo root-static/01_SYSTEM_MAP.md`, `removed-from-repo root-static/00_GLOBAL.md`.
- Migration decision: keep one current system map plus focused frontend/backend/schema docs; archive legacy system maps until static fallback retirement.

Duplicate changelogs/TODOs:

- Active app changelog: `docs/app/03_CHANGELOG_APPEND_ONLY.md`.
- Legacy changelog: `removed-from-repo root-static/03_CHANGELOG_APPEND_ONLY.md`.
- Active app TODO: `docs/app/04_TODO.md`.
- Legacy TODO: `removed-from-repo root-static/04_TODO.md`.
- Migration decision: keep active app changelog/TODO; legacy changelog is archive-only; legacy TODO must be filtered claim-by-claim before deletion.

Overlapping contracts:

- Auth, signup-dashboard, intake-verification-promotion, document-upload, audit, edge-functions, schema, and dashboard-lifecycle overlap around customer, document, and lifecycle state.
- Migration decision: keep focused contracts, but add a compliance traceability matrix so NEa claims do not get duplicated across every document.

Operational duplication:

- Active: `docs/app/operations/run-debug.md`, `docs/app/operations/git-workflow.md`, `docs/app/operations/legacy-function-migration-audit.md`.
- Legacy: `removed-from-repo root-static/06_OPS_RUN_DEBUG_BOOK.md`, legacy tooling cheatsheets.
- Migration decision: keep active ops docs; migrate only gateway/debug and no-secrets discipline from legacy.

Tooling outside canon:

- Legacy SQL and Git cheatsheets should not be app canon. Git basics are covered by the current workflow; SQL snippets need explicit safety review before any reuse.

## Missing Information

Only blockers needed for NEa compliance, app architecture, audit, operations, or MVP planning are listed.

NEa compliance:

- Exact ENVAL status: REV account holder, listed inboekdienstverlener, interim partner, or another lawful route.
- Inboekdienstverlener threshold strategy: 2 million kWh or 200 mandates.
- Contract/mandate model for particulieren, including one inboekdienstverlener at a time and calendar-year constraints.
- Aangeslotene, primary allocation point, EAN, CAR check, delivery location, period, source type, GvO/no-subsidy requirements.
- Inbooking deadline and annual inboekverificatie statement ownership.
- REV roles: rekeningbevoegde, optional fiatteur, four-eyes model, account/facility operations.

New app architecture:

- Compliance traceability from NEa field to app field, evidence, validation, audit event, and customer-visible status.
- Account-specific document requirements for particulier, zakelijk, and VVE.
- Inboeking/result/fee lifecycle, including submitted, accepted, corrected, rejected, realized value, payout, fee, reversal, and clawback.
- Admin/review tooling boundary and who may change lifecycle states.

Audit:

- App-specific audit event matrix for mandate, verification, REV submission, correction, result, fee, and retention.
- Document-analysis contract separating declared, observed, evaluated, accepted, rejected, and NEa/verifier outcomes.
- Retention/minimization policy for app data and quarantine data.

Operations:

- Production Auth/storage/function/migration proof checklist.
- REV/year-close operating runbook.
- Incident handling for wrong inbooking, duplicate inbooking, customer withdrawal, audit correction, and NEa handhaving.

MVP planning:

- Minimal lawful MVP definition for acting as inboekdienstverlener.
- Explicit non-go criteria: no public launch if NEa role, mandates, documents, production proof, and terms are not validated.

## Minimal Future Documentation Set

| Proposed document | Purpose | Merge from | Why separate | What not to include |
|---|---|---|---|---|
| Project canon | One highest-level truth for role, source order, surfaces, and hard boundaries. | `00_CANON.md`, readmes, `removed app migration matrix`. | Prevents legacy drift. | Detailed schema, endpoint payloads, legal clauses. |
| Regulatory requirements / compliance directive | NEa/EU/legal operating constraints for ENVAL as ERE-E inboekdienstverlener. | NEa sources, TODO regulatory items, product model. | Regulatory truth must not be scattered through UX/contracts. | UI copy, implementation details, unverified legal advice. |
| Current system map | Current proven repo/app/backend state. | `01_SYSTEM_MAP.md`, frontend/backend architecture. | Separates "what exists" from target architecture. | Future-only diagrams unless clearly marked target. |
| Target architecture | Future app/service architecture after compliance validation. | schema, dashboard-lifecycle, intake-verification-promotion. | Keeps target from polluting current state. | Claims of current behavior. |
| Product/service model | Customer proposition, service boundaries, no-guarantee language, fee model summary. | Product model, fee terms summary. | Product decisions need separate ownership. | Raw audit internals and endpoint specs. |
| Compliance traceability matrix | Map NEa requirement to data field, evidence, validation, audit, status, owner. | New required doc, audit contract, schema. | Prevents duplicated compliance claims across docs. | General product copy. |
| MVP plan / TODO | Ordered blockers and proof requirements. | `04_TODO.md`, filtered legacy TODO risks. | Keeps execution queue separate from canon. | Historical completed details better suited to changelog. |
| Operations/runbook | Local/prod proof, debug, REV deadlines, incident response. | run-debug, git-workflow, legacy ops book. | Operational commands and checklists change often. | Product strategy or public claims. |
| Append-only changelog | Historical app changes and proof milestones. | `03_CHANGELOG_APPEND_ONLY.md`. | History should not rewrite current specs. | Future plans except as historical notes. |
| Technical contracts | Focused endpoint/auth/document/audit contracts. | Existing contracts. | Payload/security details are too detailed for canon. | Regulatory interpretation unless referenced from compliance directive. |

Information better derived from code/schema/tests:

- Exact TypeScript function signatures.
- Current SQL column lists once migrations are authoritative.
- Exact endpoint response schema when covered by tests/proofs.
- UI component structure and CSS details.

## Removal Plan

No files are deleted in this batch.

### Safe To Delete After Migration

Only after all unique relevant claims have a target or explicit rejection:

- `removed-from-repo root-static/05_START_CHAT_TEMPLATE.md`
- `removed-from-repo root-static/07_MVP_PLANNING_1_maand.md`
- `removed-from-repo root-static/08_ENVAL_POSITIONERING.md`
- `removed-from-repo root-static/PROJECT_INSTRUCTIONS_CHAT.md`
- `removed-from-repo tooling/Cheatsheet_GIT_legacy.md`
- `removed-from-repo tooling/Cheatsheet_SUPABASE_SQL_legacy.md`

### Archive Only

Keep for historical or legal/proof context:

- `removed-from-repo root-static/03_CHANGELOG_APPEND_ONLY.md`
- `removed-from-repo root-static/00_GLOBAL.md`
- `removed-from-repo root-static/01_SYSTEM_MAP.md`
- `removed-from-repo README.md`
- `removed-from-repo root-static/README.md`

### Keep Until Validated

These may contain useful technical information without current app proof:

- `removed-from-repo root-static/02_AUDIT_MATRIX.md`
- `removed-from-repo root-static/04_TODO.md`
- `removed-from-repo root-static/06_OPS_RUN_DEBUG_BOOK.md`
- `removed-from-repo root-static/09_ARTIKEL_STANDAARD.md`
- `removed-from-repo root-static/10_EDGE_FUNCTIONS_CONTRACT.md`
- `removed-from-repo root-static/11_ANALYSE_PLAN.md`
- `removed-from-repo root-static/Analysis_Test_Matrix.md`
- `removed-from-repo root-static/PHASE_2_UPLOAD_STRATEGY.md`
- `removed-from-repo root-static/XX_temp_Concrete_gestructureerde_opl.md`

## Executive Verdict

Active docs assessed: 25.

Legacy docs assessed: 20.

Publication content classified outside architecture canon: 12.

Unique claims assessed: 50.

Required action counts:

- KEEP: 18
- MIGRATE: 8
- MERGE: 5
- REWRITE: 1
- SUPERSEDE: 3
- ARCHIVE: 3
- DELETE: 4
- VALIDATE FIRST: 8

Largest conflicts:

- Legacy "ENVAL is not an inboeker / neutral infrastructure only" conflicts with the explicit inboekdienstverlener direction.
- Legacy "no money flows / no revenue share" conflicts with the intended 10 percent success-fee model.
- Legacy `removed-old-feature-branch` and `removed-old-pricing-branch` branch claims conflict with observed/current `main`.
- Legacy `api-dossier-*`, `dossier_sessions`, and old dossier state machines conflict with the app namespace and Supabase Auth model.
- Private-only/max-4 assumptions conflict with current particulier/zakelijk/VVE and unlimited-charger app direction.
- Old parser/OCR and retention claims contain useful lessons but are not current app truth without validation.

Information that must not be lost:

- No-guarantee and no-certification/no-verification claim boundaries.
- Frontend may assist; backend decides.
- Confirmed upload is not accepted evidence.
- Immutable evidence/version history and audit trail.
- Idempotency and request metadata discipline.
- Gateway rejects are not function/application rejects.
- Customer-safe projection is not raw audit.
- Derived analysis must not mutate core truth.
- Retention/minimization must preserve necessary proof without leaking PII.

Information that must not enter the new canon:

- ENVAL is not an inboekdienstverlener.
- ENVAL is only neutral infrastructure.
- External inboekers own all inbooking logic.
- No money flows or no revenue model as a current rule.
- Fixed old export/price models.
- Private-only or max-4 as global product limits.
- `removed-old-feature-branch` or `removed-old-pricing-branch` as current branch truth.
- Static root HTML/JS/CSS as the future app stack.
- Legacy `api-dossier-*`, `dossier_sessions`, old token contracts, old dossier states, or `dossier_audit_events` as app architecture.
- NEa list presence as approval, accreditation, quality assessment, or REV account proof.

Recommended exact next migration batch:

1. Create or update the project canon to replace broad "inboeker" language with "ENVAL as ERE-E inboekdienstverlener", while keeping REV account/listing status explicitly UNKNOWN until validated.
2. Use `docs/app/06_NEA_REQUIREMENTS.md` as the primary NEa-sourced requirements document.
3. Create a compliance traceability matrix mapping NEa requirements to app data/evidence/audit/status.
4. Update product model, signup/dashboard, document-upload, audit, and TODO docs to point to that regulatory document rather than duplicating NEa claims.
5. Only after that, run a legacy cleanup batch that deletes safe-to-delete docs and archives the rest.

## Remaining UNKNOWNs

- Whether ENVAL currently has or will have its own REV account.
- Whether ENVAL is or will be listed by NEa as an inboekdienstverlener.
- Whether ENVAL will use an interim partner for inbooking.
- Which threshold path applies: 2 million kWh or 200 mandates.
- Exact mandate/contract wording and minimum term for each customer type.
- Exact account-specific evidence requirements for particulier, zakelijk, and VVE.
- Exact app schema fields for EAN, allocation point, CAR evidence, kWh period, source type, GvO/no-subsidy, verification statement, REV submission, result, and fee.
- Production Auth/storage/function/migration proof status.
- Final legal result/fee/VAT/clawback terms.
- Final retention periods and minimization rules for app and quarantine data.

## Legacy Consolidation Batch - 2026-07-19

Scope: controlled consolidation based on this audit. Legacy documents remain in place. No code, SQL, migrations, Edge Functions, tests, config, UI, commit, or push are part of this batch.

Pre-task context:

- Repo: `/Users/daankoote/dev/enval`
- Branch: `main`
- HEAD: `f24b90263c3e22b8fdebd8c3fa016594ddfa7333`
- Pre-existing worktree state at task start: `deno.lock`, `docs/app/00_DOCUMENT_MIGRATION_AUDIT.md`, and `scripts/proofs/app-signup-intake-quarantine-schema.proof.ts` were untracked. The schema-batch files named by the operator remain out of scope and untouched.

Evidence rules applied:

- CURRENT PROVEN requires current code, schema, migration, or proof evidence.
- TARGET is used only for an explicit decided direction that is not yet proven as runtime behavior.
- UNKNOWN is used where current proof is missing.
- LEGACY is historical context only and never current source of truth.
- Official NEa publications reviewed on 2026-07-19 remain leading regulatory source material. They are not copied into a full compliance directive in this batch.

Official NEa source anchors used for status boundaries:

- `https://www.emissieautoriteit.nl/documenten/2026/02/02/inboeken-elektriciteit-particulieren`
- `https://www.emissieautoriteit.nl/documenten/2026/02/02/lijst-van-inboekdienstverleners`
- `https://www.emissieautoriteit.nl/regelgeving/hernieuwbare-energie-voor-vervoer-eres/inboeken-hernieuwbare-energie-vervoer/inboeken-elektriciteit`
- `https://www.emissieautoriteit.nl/regelgeving/hernieuwbare-energie-voor-vervoer-eres`

### Consolidation Result

| claim_id | source | migration_status | migrated_to | target_anchor | evidence_used | wording_excluded | deletion_ready | result |
|---|---|---|---|---|---|---|---|---|
| C01 | `docs/app/00_CANON.md` | MIGRATED | `docs/app/00_CANON.md` | `Product Canon`; `Regulatory Status Rule` | Current canon plus explicit ENVAL inboekdienstverlener decision; NEa source boundaries | Broad "ERE inboeker" as fully proven implementation | YES | Reworded as ERE-E inboekdienstverlener direction with CURRENT PROVEN/TARGET/UNKNOWN split. |
| C02 | `docs/app/00_CANON.md`; `docs/app/02_PRODUCT_MODEL.md` | MIGRATED | `docs/app/02_PRODUCT_MODEL.md`; `docs/app/00_CANON.md` | `Product Position`; `Product Canon` | Current app docs and proof-backed app scope | Claim that final inboeking execution is already proven | YES | Split current app foundations from target inboekdienstverlener service. |
| C03 | Legacy position docs | NOT MIGRATED | None | None | New ENVAL direction | "ENVAL is not an inboekdienstverlener" | YES | Kept only as conflict history. |
| C04 | Legacy root/global docs | NOT MIGRATED | None | None | New ENVAL direction; active product model | "Neutral dossier infrastructure only" | YES | Excluded from active canon. |
| C05 | Legacy outsourcing assumptions | NOT MIGRATED | None | None | No current proof for external-inboeker operating model | "External inboeker owns all logic" | NO | Not migrated; remains blocked by target architecture and legal operating model. |
| C06 | Legacy pricing/export claims; active fee docs | VALIDATION BLOCKED | `docs/app/04_TODO.md` | `P0` | Active commercial TODO | Old export fee/pricing formulas | NO | Result-fee definition remains open legal/commercial work. |
| C07 | Active canon/product claims | ALREADY PRESENT | `docs/app/00_CANON.md`; `docs/app/02_PRODUCT_MODEL.md` | `Product Canon`; `Claim Boundaries` | Active docs | Guarantee language | YES | No-guarantee boundaries already current and retained. |
| C08 | NEa public guidance | MIGRATED | `docs/app/00_CANON.md`; `docs/app/04_TODO.md` | `Regulatory Status Rule`; `P0` | Official NEa pages reviewed 2026-07-19 | NEa approval/accreditation/listing as assumed fact | NO | Regulatory source-of-truth and missing compliance directive made explicit. |
| C09 | NEa list/publication guidance | MIGRATED | `docs/app/00_CANON.md`; `docs/app/02_PRODUCT_MODEL.md` | `Regulatory Status Rule`; `Claim Boundaries` | Official NEa list disclaimer | List presence as approval, quality assessment, accreditation, or REV proof | YES | Active docs now forbid unsupported NEa approval/listing claims. |
| C10 | NEa particulier guidance | MIGRATED | `docs/app/02_PRODUCT_MODEL.md`; `docs/app/04_TODO.md` | `Product Position`; `P0` | Official NEa particulier page | Assuming mandate/contract/execution details are already implemented | NO | Customer-facing role retained; exact mandate and contract work remains open. |
| C11 | NEa electricity registration guidance | VALIDATION BLOCKED | `docs/app/04_TODO.md` | `P0` | Official NEa inboeken elektriciteit page | Detailed data fields as current app schema | NO | EAN/CAR/allocation/kWh/deadline details deferred to compliance directive and schema planning. |
| C12 | NEa deadlines/verifier guidance | VALIDATION BLOCKED | `docs/app/04_TODO.md` | `P0` | Official NEa inboeken elektriciteit page | Production verifier/deadline readiness | NO | Deadlines and verification statement needs remain blocked by NEa architecture. |
| C13 | Active docset | ALREADY PRESENT | `docs/app/00_CANON.md` | `Source-Of-Truth Order`; `Legacy Rule` | Active docs | Legacy as current source | YES | App canon remains source of truth. |
| C14 | Current branch check | ALREADY PRESENT | `docs/app/00_CANON.md`; `docs/app/operations/git-workflow.md` | `Architecture Canon`; branch docs | `git branch --show-current` | `removed-old-feature-branch` as current branch | YES | Current branch remains `main`; old branch claims excluded. |
| C15 | Legacy branch docs | NOT MIGRATED | None | None | Current branch check | `removed-old-pricing-branch` or `removed-old-feature-branch` as current | YES | Not migrated. |
| C16 | Active app architecture docs | ALREADY PRESENT | `docs/app/01_SYSTEM_MAP.md`; `docs/app/architecture/frontend.md` | Existing app sections | Current repo docs and app structure | Static root as future stack | YES | `/app` Vite direction already current. |
| C17 | Legacy root/static system map | NOT MIGRATED | `docs/app/operations/legacy-function-migration-audit.md` | Existing fallback inventory | Active legacy audit doc | Legacy endpoint inventory as app architecture | NO | Archive/fallback only; no current app migration. |
| C18 | Active Edge contract | ALREADY PRESENT | `docs/app/contracts/edge-functions.md` | `Scope`; `Current CORE Endpoints` | Current app endpoint docs/proofs | Old endpoint names | YES | Current `api-app-*` endpoint list retained. |
| C19 | Legacy Edge discipline | MIGRATED | `docs/app/contracts/edge-functions.md`; `docs/app/operations/run-debug.md` | `Baseline Discipline`; `Classification`; `Pre-Proof Contract Check` | Active Edge contract and current proof discipline | Old CORE/UTILITY inventory as current truth | YES | Added explicit dependency discipline and legacy inventory boundary. |
| C20 | Active auth contract | ALREADY PRESENT | `docs/app/contracts/auth.md`; `docs/app/contracts/edge-functions.md` | Existing Supabase Auth boundaries | Current app auth docs/proofs | Legacy `dossier_sessions` | YES | Supabase Auth app boundary remains current. |
| C21 | Legacy token/session docs | NOT MIGRATED | None | None | Current auth contract | Old token/session auth contracts | NO | Historical only unless later validated for a different flow. |
| C22 | Signup write v3 docs | ALREADY PRESENT | `docs/app/contracts/signup-dashboard.md`; `docs/app/architecture/signup-intake.md` | Existing signup sections | Active docs/proofs | None | YES | Current signup write v3 remains documented. |
| C23 | Pre-auth quarantine target | VALIDATION BLOCKED | `docs/app/04_TODO.md` | `P1` | Active target contract; pre-existing schema-batch state left untouched | Runtime proof or schema claim from unreviewed worktree state | NO | Remains TARGET/NOT IMPLEMENTED until a separate proof batch lands. |
| C24 | Dashboard document lifecycle | ALREADY PRESENT | `docs/app/contracts/document-upload.md`; `docs/app/architecture/dashboard-lifecycle.md` | Existing current sections | Current docs/proofs | None | YES | Authenticated dashboard upload/download/withdrawal remains current. |
| C25 | Evidence decision boundary | MIGRATED | `docs/app/contracts/audit.md`; `docs/app/contracts/document-upload.md`; `docs/app/02_PRODUCT_MODEL.md` | `Consolidated Legacy Principles`; `Current Truth`; `Claim Boundaries` | Current upload contract and legacy audit principle | Confirmed upload equals accepted evidence | YES | Confirmed/uploaded/accepted states explicitly separated. |
| C26 | Upload hash and token lessons | MIGRATED | `docs/app/contracts/document-upload.md` | `Current Truth`; `Backend Flow`; `Frontend Shared Upload Transport And Card` | Current upload proof and contract | Client compression/hash as sufficient proof; raw capability persistence | YES | Server hash and raw capability boundaries strengthened. |
| C27 | Immutability/current withdrawal | ALREADY PRESENT | `docs/app/contracts/audit.md`; `docs/app/contracts/document-upload.md` | `Document Withdrawal Boundary`; version sections | Current proof docs | Hard-delete as normal product behavior | YES | Immutable evidence history remains current. |
| C28 | App audit tables | ALREADY PRESENT | `docs/app/contracts/audit.md` | `Current App Audit Tables` | Current schema/proof docs | Legacy audit tables as app target | YES | App audit table ownership retained. |
| C29 | Legacy audit doctrine | MIGRATED | `docs/app/contracts/audit.md` | `Consolidated Legacy Principles` | Legacy audit matrix plus current app doctrine | Old event names, tables, states | YES | Audit-first, actor/request traceability, idempotency, immutability retained as doctrine. |
| C30 | Derived analysis boundary | MIGRATED | `docs/app/contracts/audit.md`; `docs/app/contracts/document-upload.md` | `Consolidated Legacy Principles`; `Browser Preflight` | Active upload/parser-preview contract; legacy analysis docs | Parser/OCR output mutating core truth | NO | Retained as TARGET invariant; actual analysis write path remains unproven. |
| C31 | Legacy parser/OCR strategy | VALIDATION BLOCKED | `docs/app/04_TODO.md` | `P2` | Current local PDF preview only | Old OCR lanes and parser architecture | NO | Not migrated as architecture; future analysis lane remains open. |
| C32 | Account/chargetype scope | ALREADY PRESENT | `docs/app/00_CANON.md`; `docs/app/02_PRODUCT_MODEL.md` | `Account-Type Rule`; `Core Product Areas` | Active docs/proofs | Private-only and max-4 | YES | Particulier/zakelijk/VVE and multiple chargers remain current direction. |
| C33 | Legacy private-only/max-4 | NOT MIGRATED | None | None | Current app scope | Private-only or max-4 as global rule | YES | Excluded. |
| C34 | Frontend Vite/app direction | ALREADY PRESENT | `docs/app/architecture/frontend.md`; `docs/app/00_CANON.md` | Existing frontend sections | Current repo docs | Static HTML/JS/CSS as app stack | YES | Current frontend direction retained. |
| C35 | App route/session frontend proof | ALREADY PRESENT | `docs/app/00_CANON.md`; `docs/app/architecture/frontend.md` | Existing auth/dashboard sections | Current docs/proofs | None | YES | Frontend auth/session proof remains current. |
| C36 | Static root fallback | NOT MIGRATED | None | None | Active canon fallback boundary | Static root as target app architecture | YES | Fallback only. |
| C37 | RLS/service-role boundary | MIGRATED | `docs/app/contracts/audit.md`; `docs/app/contracts/edge-functions.md`; `docs/app/operations/run-debug.md` | `Consolidated Legacy Principles`; `Baseline Discipline`; `Pre-Proof Contract Check` | Active Edge/auth docs and current app proof summaries | Broad service-role or public table access claims | NO | Principle retained; production proof and new schema-batch proof remain separate. |
| C38 | Legacy DB hardening | VALIDATION BLOCKED | None | None | No current app proof for all old hardening claims | Old SQL hardening as current app schema | NO | Keep temporarily until validated against actual app schema. |
| C39 | Customer-safe projection | ALREADY PRESENT | `docs/app/contracts/audit.md`; `docs/app/architecture/dashboard-lifecycle.md` | Doctrine and dashboard sections | Current dashboard docs/proofs | Raw audit to customers | YES | Projection boundary retained. |
| C40 | Correction lifecycle | VALIDATION BLOCKED | `docs/app/contracts/intake-verification-promotion.md`; `docs/app/04_TODO.md` | Existing target contract; `P1` | Active target docs | Old status machine | NO | Correcties indienen remains TARGET/NOT IMPLEMENTED. |
| C41 | Retention/export concepts | VALIDATION BLOCKED | `docs/app/contracts/audit.md`; `docs/app/04_TODO.md` | `Consolidated Legacy Principles`; `P0/P1` | Legacy docs as source only | Old fixed retention/export state machine | NO | Retention as policy invariant retained; specific periods blocked. |
| C42 | Retention/minimization | MIGRATED | `docs/app/contracts/audit.md` | `Consolidated Legacy Principles` | Legacy docs plus audit doctrine | Arbitrary legacy TTLs | NO | Policy boundary retained; durations remain UNKNOWN. |
| C43 | Legacy duration claims | VALIDATION BLOCKED | None | None | No current policy proof | Old hardcoded TTLs | NO | Not migrated. |
| C44 | Gateway/app reject distinction | MIGRATED | `docs/app/operations/run-debug.md`; `docs/app/contracts/edge-functions.md` | `Gateway 401 Versus App Reject`; `Gateway Versus Function Rejects` | Active run-debug and Edge docs | Treating gateway reject as app audit event | YES | Already present and reinforced through pre-proof checklist. |
| C45 | Legacy ops/debug lessons | MIGRATED | `docs/app/operations/run-debug.md` | `Pre-Proof Contract Check`; `DB/Audit Inspection` | Active run-debug doc; legacy ops docs | Legacy commands as current app proof | YES | Useful proof hygiene migrated without old operational surface. |
| C46 | Legacy Git cheatsheet | NOT MIGRATED | None | None | Active git workflow docs | Legacy branch/workflow instructions | YES | Safe to delete after review. |
| C47 | Legacy SQL cheatsheet | NOT MIGRATED | None | None | Active schema/proof docs | Ad hoc SQL instructions as canon | YES | Safe to delete after review. |
| C48 | Article/content classification | ALREADY PRESENT | `docs/app/04_TODO.md`; this audit | `P2`; publication classification | Audit classification | Public articles as technical source of truth | YES | Public content remains outside architecture canon. |
| C49 | Open validation backlog | MIGRATED | `docs/app/04_TODO.md` | `P0`; `P2` | Active TODO and audit UNKNOWNs | Treating legacy TODO as current work queue | NO | Regulatory and deletion follow-ups clarified. |
| C50 | Append-only decision log | ALREADY PRESENT | `docs/app/03_CHANGELOG_APPEND_ONLY.md` | `2026-07-19` | Changelog updated in this batch | Rewriting history | YES | Batch recorded append-only. |

Migration status counts:

- MIGRATED: 15
- ALREADY PRESENT: 16
- VALIDATION BLOCKED: 9
- NOT MIGRATED: 10

### Active-Doc Minimalisation After Consolidation

No new active document was created in this batch.

Active docs that remain necessary:

- `docs/app/00_CANON.md`: project role, source-of-truth order, regulatory status rule, and hard governance only.
- `docs/app/01_SYSTEM_MAP.md`: proven current system map only.
- `docs/app/02_PRODUCT_MODEL.md`: service role, commercial basis, customer-facing boundaries, and product scope.
- `docs/app/contracts/audit.md`: audit/evidence doctrine and traceability principles.
- `docs/app/contracts/document-upload.md`: upload, confirmation, evidence, and version contract.
- `docs/app/contracts/edge-functions.md`: app Edge discipline and current endpoint classification.
- `docs/app/operations/run-debug.md`: operational proof/debug rules.
- `docs/app/03_CHANGELOG_APPEND_ONLY.md`: append-only decision log.
- `docs/app/04_TODO.md`: live open work only.

Active docs that may later be merged:

- None are deletion-ready in this batch.
- Product-role wording must remain primary in `docs/app/02_PRODUCT_MODEL.md`; `docs/app/00_CANON.md` should only keep the governing summary.
- Regulatory detail must not be duplicated across active docs after the NEa compliance directive exists.

Active docs that are overbodig after this batch:

- None proven. Avoid deleting or merging active docs before the NEa foundation and legacy deletion batch.

### Safe To Delete Next Batch

Legacy files whose relevant claims are migrated, already present, or consciously excluded:

- `removed-from-repo root-static/05_START_CHAT_TEMPLATE.md`
- `removed-from-repo root-static/07_MVP_PLANNING_1_maand.md`
- `removed-from-repo root-static/08_ENVAL_POSITIONERING.md`
- `removed-from-repo root-static/PROJECT_INSTRUCTIONS_CHAT.md`
- `removed-from-repo tooling/Cheatsheet_GIT_legacy.md`
- `removed-from-repo tooling/Cheatsheet_SUPABASE_SQL_legacy.md`

Deletion precondition for every file above: perform a deletion-only batch, verify no active doc references break, then run `git diff --check`.

### Keep Temporarily

Legacy files with unique or partially useful technical/operational information that still requires validation against current app code/schema/proofs:

- `removed-from-repo root-static/02_AUDIT_MATRIX.md`
- `removed-from-repo root-static/04_TODO.md`
- `removed-from-repo root-static/06_OPS_RUN_DEBUG_BOOK.md`
- `removed-from-repo root-static/09_ARTIKEL_STANDAARD.md`
- `removed-from-repo root-static/10_EDGE_FUNCTIONS_CONTRACT.md`
- `removed-from-repo root-static/11_ANALYSE_PLAN.md`
- `removed-from-repo root-static/Analysis_Test_Matrix.md`
- `removed-from-repo root-static/PHASE_2_UPLOAD_STRATEGY.md`
- `removed-from-repo root-static/XX_temp_Concrete_gestructureerde_opl.md`

### Archive For History

Legacy files with historical, fallback, or decision-context value:

- `removed-from-repo README.md`
- `removed-from-repo root-static/README.md`
- `removed-from-repo root-static/00_GLOBAL.md`
- `removed-from-repo root-static/01_SYSTEM_MAP.md`
- `removed-from-repo root-static/03_CHANGELOG_APPEND_ONLY.md`

### Blocked By NEa Architecture

Claims that must wait for a dedicated compliance directive, regulatory requirements document, target architecture, compliance matrix, or MVP plan:

- REV account and list-publication status.
- Whether ENVAL needs a REV account directly or works through another operational setup.
- Mandate and customer contract model, including minimum term and exclusivity where applicable.
- 2M kWh or 200 mandate threshold path and applicability.
- Exact inboekdienstverlener data obligations: EAN, allocation point, CAR, kWh period, source type, GvO/no-subsidy, evidence retention, and request-response handling.
- Deadline model, verifier statement model, and REV submission workflow.
- Final inboeking execution, correction, reversal, audit correction, and clawback lifecycle.
- Retention/minimization periods for app evidence and quarantine data.
- Fee trigger, result definition, VAT/tax treatment, partial success, reversal, and clawback terms.

### Consolidation Verdict

Active docs changed by consolidation:

- `docs/app/00_CANON.md`
- `docs/app/02_PRODUCT_MODEL.md`
- `docs/app/contracts/audit.md`
- `docs/app/contracts/document-upload.md`
- `docs/app/contracts/edge-functions.md`
- `docs/app/operations/run-debug.md`
- `docs/app/03_CHANGELOG_APPEND_ONLY.md`
- `docs/app/04_TODO.md`
- `docs/app/00_DOCUMENT_MIGRATION_AUDIT.md`

New docs: none.

Legacy docs deleted: none.

Information that absolutely must not be lost:

- ERE-E inboekdienstverlener direction with proof/status split.
- NEa is regulatory source of truth; NEa list publication is not approval/accreditation/quality proof by itself.
- Audit-first, immutable history, request/actor traceability, idempotency, RLS/minimum privilege, and service-role server-only boundaries.
- Confirmed upload is not accepted evidence.
- Derived analysis does not mutate core truth without a future reviewed app write path.
- Gateway rejects are separate from app/function rejects.

Information that absolutely must not enter the new canon:

- ENVAL is not an inboekdienstverlener.
- ENVAL is only neutral dossier infrastructure.
- External inboekers own all inboeking logic as current rule.
- No-money-flow or fixed export-fee claims as current commercial truth.
- Private-only or max-4 scope as global app truth.
- `removed-old-feature-branch`, `removed-old-pricing-branch`, root static HTML/JS/CSS, `api-dossier-*`, legacy token/session contracts, old dossier states, or old parser/OCR strategy as current architecture.

Recommended exact next migration batch:

1. NEa canon foundation: create the focused compliance directive/regulatory requirements document and traceability matrix from official NEa sources only.
2. Target architecture batch that maps the NEa foundation to app data, evidence, audit, operations, MVP, and retention decisions.

## Legacy Documentation Removal - 2026-07-19

Status: COMPLETE.

Removal basis:

- Daan copied the former in-repo legacy documentation outside the repo before deletion.
- All relevant claims were previously migrated, already present, consciously excluded, or marked blocked by NEa architecture in this audit.
- The external historical copy is not source of truth.
- This audit remains PROOF-ONLY until the new NEa canon foundation exists.

Removed from repo:

| removed_file | removal_status |
|---|---|
| `README.md` from the removed tree | REMOVED FROM REPO |
| `root-static/README.md` | REMOVED FROM REPO |
| `root-static/00_GLOBAL.md` | REMOVED FROM REPO |
| `root-static/01_SYSTEM_MAP.md` | REMOVED FROM REPO |
| `root-static/02_AUDIT_MATRIX.md` | REMOVED FROM REPO |
| `root-static/03_CHANGELOG_APPEND_ONLY.md` | REMOVED FROM REPO |
| `root-static/04_TODO.md` | REMOVED FROM REPO |
| `root-static/05_START_CHAT_TEMPLATE.md` | REMOVED FROM REPO |
| `root-static/06_OPS_RUN_DEBUG_BOOK.md` | REMOVED FROM REPO |
| `root-static/07_MVP_PLANNING_1_maand.md` | REMOVED FROM REPO |
| `root-static/08_ENVAL_POSITIONERING.md` | REMOVED FROM REPO |
| `root-static/09_ARTIKEL_STANDAARD.md` | REMOVED FROM REPO |
| `root-static/10_EDGE_FUNCTIONS_CONTRACT.md` | REMOVED FROM REPO |
| `root-static/11_ANALYSE_PLAN.md` | REMOVED FROM REPO |
| `root-static/Analysis_Test_Matrix.md` | REMOVED FROM REPO |
| `root-static/PHASE_2_UPLOAD_STRATEGY.md` | REMOVED FROM REPO |
| `root-static/PROJECT_INSTRUCTIONS_CHAT.md` | REMOVED FROM REPO |
| `root-static/XX_temp_Concrete_gestructureerde_opl.md` | REMOVED FROM REPO |
| `tooling/Cheatsheet_GIT_legacy.md` | REMOVED FROM REPO |
| `tooling/Cheatsheet_SUPABASE_SQL_legacy.md` | REMOVED FROM REPO |
| removed app migration matrix | REMOVED FROM REPO |

Active documentation cleanup result:

- Current source order is now law/official NEa, current code/schema/tests/proofs, CURRENT PROVEN docs, explicit decisions, then TARGET/DRAFT docs.
- Broken links to the removed in-repo legacy documentation tree were removed.
- Old root/static production and `api-dossier-*` references remain only where they describe current fallback/runtime code or explicitly forbid reuse for new app architecture.
- Legacy documentation removal is done; legacy runtime/code retirement remains a separate future task.

## End-of-Batch Proof Notes

The intended changed files for this consolidation batch are documentation files under `docs/app/**` only.

No code was changed.

No SQL or migration was changed.

No Edge Function was changed.

No tests, configuration, generated files, package files, or UI files were changed.

No document was deleted.

No commit was made.

No push was made.

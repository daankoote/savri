# Architecture Go/No-Go Audit

Status: PROOF ONLY - DECISION AUDIT.

Audit evidence status: PROOF ONLY

Proposed canon and architecture status: APPROVED BY DAAN FOR BOUNDED INTERNAL FOUNDATION IMPLEMENTATION; BROADER TARGET SCOPE REMAINS DRAFT

Audit date: 2026-07-20; source-governance, documentation-baseline, and bounded-GO update: 2026-07-21.

Repository: `/Users/daankoote/dev/enval`.

Branch at audit start: `main`.

HEAD at audit start: `f24b90263c3e22b8fdebd8c3fa016594ddfa7333`.

Worktree note: this audit was performed in an already dirty worktree. Existing documentation edits, legacy document deletions, untracked proof scripts, untracked baseline proposals, untracked `deno.lock`, and ignored local migrations are treated as pre-existing state unless this document says otherwise.

The original go/no-go audit batch created this document only. This consolidation repair batch updated active documentation status, navigation, and audit terminology only. Neither batch approved runtime work, target architecture, MVP execution, remote mutation, SQL application, deployment, commit, or push.

The 2026-07-21 consolidation batch physically consolidated the former top-level 07A-07I supporting documents into architecture, decisions, operations, and proofs ownership paths. It did not approve the proposed architecture as implementation basis.

## Control Rule

The decision order is:

1. Prove legacy documentation is absent.
2. Prove ENVAL is treated as inboekdienstverlener.
3. Prove applicable official law, NEa guidance, and the current toetsingskader are processed.
4. Compare against current code, database, migrations, Edge Functions, and proofs.
5. Only then approve target architecture and MVP plan.

Current gate result after the 2026-07-21 baseline and decision batches: steps 1 through 4 have a committed documentation/evidence baseline. Daan approved only the bounded internal foundation scope below. Remaining consolidated-law, deadline, retention, REV, legal and external-verifier gaps keep regulatory conformance PARTIAL, and every excluded scope remains NO-GO.

## Bounded Internal Foundation Decision Update

DAAN DECISION: GO — BOUNDED INTERNAL FOUNDATION PHASE

Baseline evidence: commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805` (`Establish NEa documentation baseline`). This proof-only audit records Daan's decision; the document does not expand that decision.

Architecture implementation scope:

- customer/person/organization;
- representation foundation;
- case foundation;
- locations;
- connections and EAN structure;
- chargers;
- charge points;
- meters and MID evidence structure;
- documents and evidence;
- parser inventory and modular parser adapters;
- internal reviews;
- support controls;
- corrections and supersede history;
- raw and normalized kWh foundations;
- audit and provenance;
- provider-independent external ports.

Not approved:

- remote schema apply;
- remote migration;
- deployment;
- production;
- push;
- CAR adapter;
- EAN/register adapter;
- KvK adapter;
- MID-registeradapter;
- CPO/provideradapter;
- energieleverancieradapter;
- REV-integratie;
- betaalprovider;
- officiële verifierbeslissingen;
- definitieve retentionuitvoering;
- definitieve legal/mandate-tekst;
- booking- of settlementuitvoering.

## Count Definitions

The document counts in this repository are only meaningful when the counting scope is explicit.

| count name | definition | reproducible command | current count | includes | excludes |
| --- | --- | --- | ---: | --- | --- |
| all repository Markdown | Markdown files physically present in the current worktree, excluding dependency/generated/build folders | `rg --files -g '*.md' -g '!node_modules/**' -g '!dist/**' -g '!build/**' -g '!vendor/**'` | 51 | README files, active docs, publication content, cheatsheet, this audit | deleted tracked files, dependency docs |
| active project documentation | root/app/docs README plus `docs/app/**/*.md` plus `docs/cheatsheets/**/*.md` | `{ printf 'README.md\\napp/README.md\\ndocs/README.md\\n'; rg --files docs/app docs/cheatsheets -g '*.md'; } \| sort -u` | 39 | active technical, compliance, operations, proof, and support docs | `artikelen/**`, dependency docs, deleted legacy docs |
| docs/app documentation | physical Markdown under `docs/app` | `rg --files docs/app -g '*.md'` | 35 | primary canon, architecture appendix, decisions, operations, proofs, contracts, and legal docs | README outside `docs/app`, cheatsheet, articles |
| canon documentation | the eight primary canon documents named in `00_CANON.md` | explicit list: `00`, `01`, `02`, `05`, `06`, `07`, `08`, `09` | 8 | navigation/system/product/compliance/requirements/architecture/traceability/MVP | proof-only, decision records, operations, contracts |
| proof-only documentation | active docs with a proof-only `Status:` line | `rg -l '^Status: .*PROOF ONLY\|^Status: PROOF ONLY' docs/app -g '*.md'` | 4 | regulatory audit, current implementation assessment, consolidated remote proof/gate evidence, this audit | canon docs that merely mention proof-only evidence |
| publication content | public article Markdown under `artikelen/**` | `rg --files artikelen -g '*.md'` | 12 | articles only | architecture canon and proof docs |
| cheatsheets | Markdown under `docs/cheatsheets` | `rg --files docs/cheatsheets -g '*.md'` | 1 | terminal command support | canon and proofs |
| dependency documentation | Markdown under dependency/generated/build folders | `rg --files node_modules vendor dist build -g '*.md' 2>/dev/null` | 21 in local dependency/build folders; excluded from repository audit counts | package/dependency docs if present locally | project/canon docs |

The earlier difference between 54, 43, and 38 is explained as follows:

| number | meaning | explanation |
| ---: | --- | --- |
| 54 | previous all active worktree Markdown before this audit document existed | included 38 `docs/app` docs, 12 publication articles, and 4 support docs |
| 43 | active project documentation after this audit document exists | 39 `docs/app` docs plus `README.md`, `app/README.md`, `docs/README.md`, and 1 cheatsheet |
| 38 | previous `docs/app` documentation count before `10_ARCHITECTURE_GO_NO_GO_AUDIT.md` was created | the new audit brings `docs/app` to 39 |

Deleted tracked legacy files still appear in `git status`, but they are not physical active Markdown files and are not counted as active documentation.

## A. Legacy Absence And Old Assumption Scan

Legacy directory check:

| check | evidence | result |
| --- | --- | --- |
| `docs/legacy` exists | `test -d docs/legacy` returned absent | PASS |
| active docs still mention `docs/legacy`, `legacy/root-static`, or `legacy/tooling` | repo grep found 5 references, all in absence/provenance audit context | PARTIAL |
| active docs treat old root-static docs as source of truth | no current-source claim found; root/static remains production/fallback surface only | PASS |
| old `api-dossier-*` architecture appears | 134 active-doc references found, but mainly as fallback/runtime freeze, retirement, or anti-coupling evidence | PARTIAL |
| old branch/static/session/parser/pricing assumptions as new app truth | no current approval found; several docs still contain historical warnings | PASS |

Old assumption disposition:

| old assumption | current audit result | action |
| --- | --- | --- |
| ENVAL is not an inboekdienstverlener | not accepted; directive states ENVAL is inboekdienstverlener for ERE-E | REMOVE FROM CANON |
| ENVAL is only dossier infrastructure | not accepted; old dossier remains fallback/runtime only | REMOVE FROM CANON |
| external inboeker does all logic | not accepted; ENVAL is the IDV decision/administration owner unless later contracted controls prove otherwise | REMOVE FROM CANON |
| no ERE calculations | not accepted as policy; calculation model is TARGET/UNKNOWN until source-complete architecture | VALIDATE FIRST |
| no money flows | not accepted as policy; financial administration requirements are PARTIAL and commercial/payment design is not approved | VALIDATE FIRST |
| neutral transfer layer | conflicts with IDV role when used as product position | REMOVE FROM CANON |
| maximum four documents | not accepted; evidence taxonomy is NEa/TKV dependent | VALIDATE FIRST |
| private-only doelgroep | not accepted; docs include private, business, and VvE but role/detail remain PARTIAL | VALIDATE FIRST |
| old pricing/export fee models | not source-of-truth; publication/content wording needs legal review | REMOVE FROM CANON |
| `feature/dev` as current branch | not current; audit branch is `main` | REMOVE FROM CANON |
| static HTML/JS/CSS as current app stack | only current production/fallback, not `/app` target | KEEP AS RUNTIME FACT |
| `api-dossier-*` as current app architecture | explicit conflict with app namespace | KEEP ONLY AS FROZEN LEGACY RUNTIME INVENTORY |
| old token/session auth | explicit conflict with Supabase Auth app boundary | KEEP ONLY AS ANTI-PATTERN/RETIREMENT CONTEXT |
| old dossier states | not final NEa lifecycle | VALIDATE FIRST |
| old parser/OCR strategy | reuse logic only, not accepted evidence | REUSE LOGIC ONLY |
| derived analysis mutates core truth | forbidden principle remains valid | KEEP AS TARGET INVARIANT |
| confirmed upload equals accepted evidence | forbidden; current docs separate transport from evidence decision | KEEP AS TARGET INVARIANT |
| immutable audit trail | valid internal control, but not a direct law claim by itself | KEEP AS ENVAL INTERNAL CONTROL |
| RLS/service-role boundary | locally proven for app tables/functions only | KEEP AS-IS for technical primitive only; regulatory semantics remain provisional |

Legacy absence verdict: PASS for directory absence, PARTIAL for residual historical/runtime references that must stay clearly non-canonical.

## B. Active Markdown Inventory And Structure Audit

Inventory counts:

| scope | count | audit treatment |
| --- | ---: | --- |
| all active Markdown files found | 51 | assessed for structure after consolidation and roadmap addition |
| `docs/app/**/*.md` | 35 | primary app documentation scope after consolidation and roadmap addition |
| `artikelen/**/artikel.md` | 12 | publication content, not architecture canon |
| other Markdown (`README`, app/docs README, cheatsheet) | 4 | support/onboarding |

Matrix:

| path | title | status | primary responsibility | source-of-truth level | audience | overlaps | duplicated_content | conflicting_content | unique_content | keep | merge_into | split | rewrite | remove | reason | information_loss_risk | final_canonical_path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `README.md` | ENVAL | active root overview | repo/product entry | support | dev/product | docs README, system map | stack/routing summary | possible root/static ambiguity | production/fallback overview | yes | none | no | yes | no | keep concise root entry | low | `README.md` |
| `app/README.md` | ENVAL Vite App | active app overview | Vite app entry | support | dev | frontend architecture | local app commands | none material | app-specific run notes | yes | docs app frontend/run debug | no | yes | no | avoid duplicate architecture | low | `app/README.md` |
| `docs/README.md` | ENVAL Documentation | active docs index | documentation navigation | canon index support | dev/product/legal | 00 canon | active doc map | legacy wording risk | doc tree orientation | yes | 00 canon for canon rules | no | yes | no | keep as navigation only | low | `docs/README.md` |
| `docs/cheatsheets/Cheatsheet_ TERMINAL.md` | terminal cheatsheet | support | local command snippets | tooling support | dev | run-debug | old curl examples | legacy endpoint examples if read as current | practical shell commands | yes | operations/run-debug | maybe | yes | no | not canon; mark tooling only | medium | `docs/app/operations/run-debug.md` or cheatsheet |
| `docs/app/00_CANON.md` | ENVAL App Canon | CURRENT | project canon/governance | primary canon | all | requirements, system map | role/source order repeated | none material | governance and source hierarchy | yes | none | no | yes | no | must stay compact | high | `docs/app/00_CANON.md` |
| `docs/app/00_DOCUMENT_MIGRATION_AUDIT.md` | Document Migration Audit | DRAFT proof | migration proof | proof-only | dev/legal | changelog, this audit | legacy migration status | may look current if overused | claim migration evidence | yes | none | no | yes | no | keep as proof appendix until replaced by git history | medium | `docs/app/00_DOCUMENT_MIGRATION_AUDIT.md` |
| `docs/app/01_SYSTEM_MAP.md` | Architectuur | CURRENT/PARTIAL | current system map | current proof | dev/product | 07 target, 06B | frontend/backend inventory | root static wording risk | current fallback/app split | yes | none | no | yes | no | separate current map needed | high | `docs/app/01_SYSTEM_MAP.md` |
| `docs/app/02_PRODUCT_MODEL.md` | Product Model | split | service/commercial model | product canon | product/legal | legal fee terms, MVP | doelgroep/fee copy | no final NEa approval | service role framing | yes | legal terms for fee details | no | yes | no | product model remains separate | high | `docs/app/02_PRODUCT_MODEL.md` |
| `docs/app/03_CHANGELOG_APPEND_ONLY.md` | Change Log | CURRENT | append-only decisions | support/proof | dev/product | TODO, audits | batch summaries | PASS drift risk if proof failed | chronological decision record | yes | none | no | no | no | append-only, do not merge | high | `docs/app/03_CHANGELOG_APPEND_ONLY.md` |
| `docs/app/04_TODO.md` | TODO | CURRENT | next work queue | planning support | dev/product | MVP plan | next gate repeated | execution order may conflict with blockers | current queue | yes | 09 MVP for milestones | no | yes | no | keep operationally small | medium | `docs/app/04_TODO.md` |
| `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md` | NEa Compliance Directive | CURRENT | compliance doctrine | regulatory canon | legal/product/dev | requirements, 06A | source order | none material | IDV role rule | yes | none | no | yes | no | primary compliance directive | high | `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md` |
| `docs/app/06_NEA_REQUIREMENTS.md` | NEa Requirements | CURRENT/PARTIAL | requirement catalog | regulatory canon | legal/dev | 06A, 08 | requirement repeats | TKV mapped; other legal/external gaps | requirement IDs/classes | yes | none | no | yes | no | keep with explicit remaining gaps | high | `docs/app/06_NEA_REQUIREMENTS.md` |
| `docs/app/06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md` | Regulatory Completeness Audit | PROOF ONLY | source coverage proof | proof-only | legal/dev | 06, 08 | source summaries | cannot claim complete | source access blockers | yes | none | no | yes | no | proof appendix, not architecture | high | `docs/app/06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md` |
| `docs/app/06B_CURRENT_IMPLEMENTATION_ASSESSMENT.md` | Current Implementation Assessment | PROOF ONLY | current implementation comparison | proof-only | dev/product | 01, 07, 08 | dispositions repeated | local proofs may be overread | implementation inventory | yes | 01 for stable map | no | yes | no | needed before architecture approval | high | `docs/app/06B_CURRENT_IMPLEMENTATION_ASSESSMENT.md` |
| `docs/app/07_NEA_TARGET_ARCHITECTURE.md` | Target Architecture | PRELIMINARY DRAFT | target architecture | draft | dev/product/legal | 07A, contracts, schema | many domain tables repeated | must not be approved | provisional domain model | yes | final target arch later | maybe | yes | no | keep draft blocked | high | `docs/app/07_NEA_TARGET_ARCHITECTURE.md` |
| `docs/app/architecture/database-target-model.md` | Database Target Model | DRAFT | technical target data model appendix | supporting architecture | dev/data | 07 and current schema notes | entity names summarized in 07 | must not be read as implementation permission | detailed target table matrix and boundaries | yes | none | no | no | no | single technical appendix under 07 | high | `docs/app/architecture/database-target-model.md` |
| `docs/app/decisions/architecture-and-environment-decisions.md` | Architecture And Environment Decisions | DECISION RECORD | architecture/environment strategy history | decision record | product/dev/ops | 07 strategy and operations prerequisites | no execution checklist retained | strategy selection must not imply execution permission | alternatives, context decisions, project classification | yes | none | no | no | no | one decision owner | high | `docs/app/decisions/architecture-and-environment-decisions.md` |
| `docs/app/operations/remote-baseline-and-retirement.md` | Remote Baseline And Retirement Plan | TARGET — EXECUTION NOT APPROVED | baseline, cutover, rollback, retirement, abort planning | operations | dev/ops | proof gate outcomes by reference | proof data not copied as architecture | execution remains explicitly blocked | waves, protected objects, prerequisites, gates | yes | none | no | no | no | one operational owner | high | `docs/app/operations/remote-baseline-and-retirement.md` |
| `docs/app/operations/nea-implementation-roadmap.md` | NEa Implementation Roadmap | TARGET — LIVE EXECUTION TRACKER | compact daily sequence, progress, evidence, and blockers | operational tracker | dev/product/ops | TODO and MVP plan by reference | no normative gate content copied | may not override source, requirements, architecture, traceability, or MVP gates | current/next package dashboard and internal/external tracks | yes | none | no | no | no | one subordinate daily progress owner | low | `docs/app/operations/nea-implementation-roadmap.md` |
| `docs/app/proofs/remote-baseline-and-recovery-gate.md` | Remote Baseline And Recovery Gate Proof | PROOF ONLY | dated inventory, Phase 0, recovery, PostgREST and gate evidence | proof-only | dev/ops/audit | operations refers to outcomes only | remote inventory exists once | evidence cannot become CURRENT architecture | dated counts, hashes, restore and gate evidence | yes | none | no | no | no | one proof owner with dated chapters | high | `docs/app/proofs/remote-baseline-and-recovery-gate.md` |
| `docs/app/08_NEA_TRACEABILITY_MATRIX.md` | Traceability Matrix | PROVISIONAL | source-to-control traceability | regulatory/proof | legal/dev | 06, 06A, 06B | requirement coverage repeated | TKV mapped; local proof overread risk remains | requirement-to-evidence rows | yes | none | no | yes | no | required final control artifact | high | `docs/app/08_NEA_TRACEABILITY_MATRIX.md` |
| `docs/app/09_NEA_MVP_PLAN.md` | MVP Plan | PRELIMINARY DRAFT | MVP planning | draft | product/dev | TODO, 07 | phase order repeated | must not drive execution | MVP scope framing | yes | none | no | yes | no | keep blocked until approvals | high | `docs/app/09_NEA_MVP_PLAN.md` |
| `docs/app/architecture/backend.md` | Backend Architecture | active | backend structure | current/target mixed | dev | edge contract, 07 | Supabase patterns | may duplicate contracts | backend notes | yes | 01/07/contracts | maybe | yes | no | should become concise current map | medium | `docs/app/architecture/backend.md` |
| `docs/app/architecture/frontend.md` | Frontend Architecture | CURRENT/PARTIAL | frontend structure | current proof | dev | app README | Vite details | none material | app frontend surface map | yes | app README for commands only | no | yes | no | keep current frontend map | medium | `docs/app/architecture/frontend.md` |
| `docs/app/architecture/schema.md` | Schema Migration Design | design/reference | schema doctrine | mixed proof/design | dev/data | 07A, contracts | large table/contract duplication | may over-approve old schema | detailed implemented schema notes | yes | 07A/contracts | maybe | yes | no | too large for canon; keep as technical appendix | high | `docs/app/architecture/schema.md` |
| `docs/app/architecture/signup-intake.md` | Signup Intake Architecture | current/draft | intake design | mixed proof/design | dev/product | intake contract, signup-dashboard | long legacy inventory | old api references if misread | signup flow facts | yes | contracts/intake | maybe | yes | no | split current/provisional later | high | `docs/app/architecture/signup-intake.md` |
| `docs/app/architecture/dashboard-lifecycle.md` | Dashboard Lifecycle | source of truth claim | dashboard lifecycle | draft/current mixed | product/dev | signup-dashboard, 09 | status/lifecycle repeated | source-of-truth claim too strong before final arch | dashboard state concepts | yes | 07/09 after approval | maybe | yes | no | mark provisional | high | `docs/app/architecture/dashboard-lifecycle.md` |
| `docs/app/contracts/auth.md` | Auth Contract | architecture source | auth boundary | current/target | dev/security | 07 auth | Supabase Auth repeated | none material | auth invariants | yes | none | no | yes | no | key contract | high | `docs/app/contracts/auth.md` |
| `docs/app/contracts/audit.md` | Audit Contract | CURRENT | audit doctrine | current/target | dev/legal | 05, 07, 08 | audit-first repeated | internal controls could look like law | audit invariants | yes | none | no | yes | no | key contract | high | `docs/app/contracts/audit.md` |
| `docs/app/contracts/document-upload.md` | Document Upload Contract | source-of-truth | upload/evidence transport | current/target | dev/product | schema, 07 | document states repeated | accepted-evidence boundary needs constant warning | upload/version rules | yes | none | no | yes | no | key contract | high | `docs/app/contracts/document-upload.md` |
| `docs/app/contracts/edge-functions.md` | Edge Functions Contract | CURRENT | Edge/API discipline | current | dev/security | backend, 06B | CORS/meta/audit repeated | none material | endpoint discipline | yes | none | no | yes | no | key contract | high | `docs/app/contracts/edge-functions.md` |
| `docs/app/contracts/intake-verification-promotion.md` | Intake Verification Promotion | TARGET | future intake promotion | target | dev/product | signup-intake, signup-dashboard | promotion lifecycle repeated | not implemented | quarantine flow | yes | 07 final/09 later | maybe | yes | no | useful target contract | high | `docs/app/contracts/intake-verification-promotion.md` |
| `docs/app/contracts/signup-dashboard.md` | Signup Dashboard Contract | source of truth | signup-dashboard link | current/target | dev/product | auth, dashboard lifecycle | bootstrapping repeated | none material | dashboard contract | yes | none | no | yes | no | useful cross-contract | medium | `docs/app/contracts/signup-dashboard.md` |
| `docs/app/legal/fee-model-and-service-terms.md` | Fee Model | working | commercial/legal terms | draft/product | legal/product | product model | fee text repeated | legal approval required | service terms detail | yes | none | no | yes | no | legal draft must stay separate | high | `docs/app/legal/fee-model-and-service-terms.md` |
| `docs/app/operations/git-workflow.md` | Git Workflow | CURRENT | git process | operational | dev | run-debug | branch rules | none material | repo workflow | yes | none | no | no | no | operational doc, not canon | low | `docs/app/operations/git-workflow.md` |
| `docs/app/operations/run-debug.md` | Run/debug | CURRENT | local debug | operational | dev | cheatsheet | commands repeated | secrets/status caveats | local proof commands | yes | cheatsheet | maybe | yes | no | keep but slim | medium | `docs/app/operations/run-debug.md` |
| `docs/app/operations/legacy-function-migration-audit.md` | Functions Cleanup Audit | read-only audit | legacy runtime inventory | proof/ops | dev/ops | 07B/07E | endpoint inventory repeated | if read as current app model | legacy freeze list | yes | 07B/07E later | maybe | yes | no | necessary while runtime exists | high | `docs/app/operations/legacy-function-migration-audit.md` |
| `docs/app/proofs/signup-submit.md` | Signup Submit Smoke Test | proof | manual proof contract | proof-only | dev | 06B | endpoint proof repeated | stale proof risk | smoke instructions | yes | proof appendix | no | yes | no | proof helper docs | medium | `docs/app/proofs/signup-submit.md` |
| `artikelen/eneco-ere-campagnes/artikel.md` | publication article | publication | public content | non-canon | public | product copy | market claims | needs legal review | article copy | yes | publication process | no | yes | no | not architecture | medium | publication content |
| `artikelen/eres-a-tot-z/artikel.md` | publication article | publication | public content | non-canon | public | product/regulatory copy | terms repeated | needs legal review | ERE explainer | yes | publication process | no | yes | no | not architecture | medium | publication content |
| `artikelen/eu-red-iii-90-seconden/artikel.md` | publication article | publication | public content | non-canon | public | regulatory explainer | RED III summary | needs legal review | RED III public copy | yes | publication process | no | yes | no | not architecture | medium | publication content |
| `artikelen/ev-rijders-laten-waarde-liggen/artikel.md` | publication article | publication | public content | non-canon | public | product copy | value wording | price/guarantee risk | EV driver copy | yes | publication process | no | yes | no | not architecture | medium | publication content |
| `artikelen/mid-meter-bij-thuisladen/artikel.md` | publication article | publication | public content | non-canon | public | MID requirements | MID wording | MID overclaim risk | MID explainer | yes | publication process | no | yes | no | not architecture | medium | publication content |
| `artikelen/nea-inboeken-elektriciteit-particulieren/artikel.md` | publication article | publication | public content | non-canon | public | NEa pages | NEa paraphrase | legal/source freshness risk | public NEa explanation | yes | publication process | no | yes | no | not architecture | medium | publication content |
| `artikelen/nea-inboeken-elektriciteit-red3/artikel.md` | publication article | publication | public content | non-canon | public | NEa pages | RED3 paraphrase | legal/source freshness risk | public RED3 explanation | yes | publication process | no | yes | no | not architecture | medium | publication content |
| `artikelen/overstap-hbe-naar-ere/artikel.md` | publication article | publication | public content | non-canon | public | terminology docs | HBE/ERE language | legacy terminology risk | transition explainer | yes | publication process | no | yes | no | not architecture | medium | publication content |
| `artikelen/techniek-en-metingen-voor-eres/artikel.md` | publication article | publication | public content | non-canon | public | evidence docs | proof language | measurement overclaim risk | measurement explainer | yes | publication process | no | yes | no | not architecture | medium | publication content |
| `artikelen/tibber-ere-campagnes/artikel.md` | publication article | publication | public content | non-canon | public | market copy | campaign references | market-source risk | market observation | yes | publication process | no | yes | no | not architecture | medium | publication content |
| `artikelen/vattenfall-thuisladen-cashback/artikel.md` | publication article | publication | public content | non-canon | public | market copy | cashback references | guarantee risk | market observation | yes | publication process | no | yes | no | not architecture | medium | publication content |
| `artikelen/waarde-en-verhandelbaarheid-eres/artikel.md` | publication article | publication | public content | non-canon | public | finance copy | value text | price guarantee risk | value explainer | yes | publication process | no | yes | no | not architecture | medium | publication content |

Documentation structure findings:

| finding | count | severity | action |
| --- | ---: | --- | --- |
| primary canon index candidates | 1 | low | keep `00_CANON.md` as primary |
| primary requirements catalogs | 1 | low | keep `06_NEA_REQUIREMENTS.md`; source gaps remain |
| primary traceability matrix | 1 | medium | keep `08_NEA_TRACEABILITY_MATRIX.md` provisional |
| target architecture drafts | 1 primary + 1 database appendix | high | keep blocked; do not approve |
| MVP plans | 1 | high | keep preliminary |
| consolidated remote/recovery proof owners | 1 | low | keep proof-only and outside architecture canon |
| competing execution/retirement owners | 0 | low | one operations owner established |
| publication files that are not canon | 12 | medium | legal/content review outside architecture canon |

Recommended compact future documentation count:

| scope | current | recommended after consolidation |
| --- | ---: | ---: |
| docs/app Markdown documents | 35 | 35 after completed 07 support consolidation and addition of one subordinate live execution tracker |
| publication Markdown | 12 | 12, outside architecture canon |
| support Markdown | 4 | 3-4 |

## Documentation Consolidation Matrix

The 2026-07-21 batch physically executed the 07A-07I consolidation after full content inspection. The former paths below are retained only as migration provenance in this matrix; they are not active document links.

| source_document | current_responsibility | unique_content | duplicated_content | destination_document | destination_anchor | target_status | references_to_update | information_loss_risk | deletion_allowed | decision_reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| former `docs/app/` + `07A_DATABASE_TARGET_MODEL.md` | database target appendix | 45-table matrix, constraints, history, provenance, RLS intent, object dispositions, Gate 1 boundaries | target entities summarized in 07 | `docs/app/architecture/database-target-model.md` | `Target Table Matrix`; `Model Boundaries` | DRAFT — AWAITING DAAN APPROVAL | canon, 07, changelog, TODO, traceability, audit, MVP | GREEN; full matrix and boundaries moved | YES | technical detail remains separate from the single architecture canon |
| former `docs/app/` + `07B_DATABASE_AND_RUNTIME_RETIREMENT_PLAN.md` | retirement owner | status vocabulary, protected local objects, runtime candidates, migration scenarios | baseline/retirement gates also appeared in 07D/07G | `docs/app/operations/remote-baseline-and-retirement.md` | `Evidence Chronology And Status Vocabulary`; `Local Phase 1A Inventory`; `Migration History Scenarios` | TARGET — EXECUTION NOT APPROVED | canon, changelog, TODO, audit, MVP | GREEN; unique inventories and dispositions retained | YES | one operations owner prevents competing retirement plans |
| former `docs/app/` + `07C_REBUILD_MIGRATION_DECISION.md` | architecture/migration decision | bounded-context choices, protected reuse, removal direction | same-project rationale repeated in 07F/07G | `docs/app/decisions/architecture-and-environment-decisions.md` | `Context Decisions`; `Protected Reuse`; `Removal Direction` | DECISION RECORD — STRATEGY SELECTED, EXECUTION NOT APPROVED | canon, changelog, TODO, traceability, audit | GREEN; decision rationale retained | YES | decisions are separated from architecture and execution |
| former `docs/app/` + `07D_DATABASE_RETIREMENT_PHASE_1_EXECUTION_SPEC.md` | Phase 1A execution specification | dated local inventory, legacy absence, migration metadata, blocked candidates | detailed local tables and scenarios overlapped 07B | `docs/app/operations/remote-baseline-and-retirement.md` | `Local Phase 1A Inventory`; `Repository Runtime Retirement Candidates`; `Migration History Scenarios` | TARGET — EXECUTION NOT APPROVED | changelog, TODO, audit | GREEN; unique counts, lists, and preconditions retained | YES | execution checklist belongs with the retirement plan |
| former `docs/app/` + `07E_REMOTE_SCHEMA_AND_DEPLOYMENT_INVENTORY.md` | dated remote inventory | migrations, schema, counts, functions, cron, Storage, Edge inventory, caller and retirement matrices | project identity repeated in 07H/07I | `docs/app/proofs/remote-baseline-and-recovery-gate.md` | `2026-07-19 Remote Inventory — Scope And Safety`; inventory subsections | PROOF ONLY — NO IMPLEMENTATION APPROVAL | canon, changelog, TODO, audit, operations | GREEN; detailed dated inventory retained once | YES | remote facts are evidence, not architecture or operations canon |
| former `docs/app/` + `07F_REMOTE_ENVIRONMENT_AND_APP_BASELINE_DECISION.md` | environment/baseline decision | project classification, options A/B/C, quota decision, remaining conditions | app migration/Edge/Storage/Auth/cron planning overlapped 07G | `docs/app/decisions/architecture-and-environment-decisions.md` | `Decision Timeline And Project Identity`; `Environment Alternatives Considered`; `Remaining Conditions And Decisions` | DECISION RECORD — STRATEGY SELECTED, EXECUTION NOT APPROVED | canon, changelog, TODO, audit | GREEN; alternatives and selected strategy retained | YES | historical and current decisions have one owner without execution implication |
| former `docs/app/` + `07G_IN_PLACE_APP_BASELINE_EXECUTION_PLAN.md` | baseline execution plan | namespace isolation, waves, cutover, rollback, retirement and hard stops | proof outcomes duplicated 07H/07I | `docs/app/operations/remote-baseline-and-retirement.md` | `Planned App Baseline Boundary`; `Baseline Wave Plan`; `Cutover Gates`; `Retirement Gates`; `Hard Stops` | TARGET — EXECUTION NOT APPROVED | canon, changelog, TODO, audit, MVP | GREEN; execution controls retained, proof details linked | YES | one operational checklist prevents competing execution plans |
| former `docs/app/` + `07H_IN_PLACE_BASELINE_PHASE_0_PROOF.md` | Phase 0 proof | collision matrix, migration analysis, shadow method/results, proposal inventory, static metrics | project identity/recovery blockers repeated 07E/07I | `docs/app/proofs/remote-baseline-and-recovery-gate.md` | `2026-07-19 Phase 0 Shadow Proof` | PROOF ONLY — NO IMPLEMENTATION APPROVAL | canon, changelog, TODO, audit, operations | GREEN; dated metrics and provenance retained | YES | proof stays evidence-only and no longer resembles execution canon |
| former `docs/app/` + `07I_RECOVERY_AND_REMOTE_EXECUTION_GATE.md` | recovery and remote gate | encrypted artifact hashes, manifests, restore proof, PostgREST diagnosis, rollback/abort gate | inventory and Phase 0 results repeated 07E/07H | `docs/app/proofs/remote-baseline-and-recovery-gate.md` | `2026-07-19/20 Recovery, Backup And PostgREST Gate` | PROOF ONLY — NO IMPLEMENTATION APPROVAL | canon, changelog, TODO, audit, operations | GREEN; dates, HEAD, hashes, counts, blockers, and provenance retained | YES | one dated proof/gate owner avoids duplicate remote truth |

Executed structure:

- primary architecture retained: `docs/app/07_NEA_TARGET_ARCHITECTURE.md`;
- supporting architecture appendix created: `docs/app/architecture/database-target-model.md`;
- decision record created: `docs/app/decisions/architecture-and-environment-decisions.md`;
- operations plan created: `docs/app/operations/remote-baseline-and-retirement.md`;
- proof/gate document created: `docs/app/proofs/remote-baseline-and-recovery-gate.md`;
- former top-level 07A-07I documents removed after migration and reference checks.

Reference result: zero active links or ownership references target a removed path. Former source names are split from the `docs/app/` prefix in this executed migration matrix so automated concrete-path validation remains unambiguous.

## Documentation Validation Check Robustness

Validation checks must not overwrite the shell `PATH`. The earlier terminalcheck failure with `DIFF_CHECK_EXIT=127` is treated as a check-script/environment failure, not as proof that `git diff --check` failed.

Robust terminalchecks must resolve tool binaries explicitly:

```sh
GIT_BIN="$(command -v git)"
RG_BIN="$(command -v rg)"
GREP_BIN="$(command -v grep)"

if [ -z "$GIT_BIN" ]; then
  echo "git_not_found"
  exit 127
fi
```

Rules:

- Do not use a variable named `PATH` for document paths, file lists, or temporary path values.
- Stop immediately when `git` is not found.
- Use `RG_BIN` and `GREP_BIN` only after checking they are non-empty when those tools are required.
- Keep document-reference checks read-only.

## C. Official NEa/Law Conformance Matrix

Source inventory:

| source_id | official_title | url/ref | dates | source_access_status | last_verified_at |
| --- | --- | --- | --- | --- | --- |
| SRC-WM-97 | Wet milieubeheer, title 9.7 hernieuwbare energie vervoer | `https://wetten.overheid.nl/BWBR0003245` | consolidated source; exact current section partly accessible | PARTIAL | 2026-07-20 |
| SRC-BEV | Besluit energie vervoer | `https://wetten.overheid.nl/BWBR0040922` | version context 2026-01-01 / RED III changes | PARTIAL | 2026-07-20 |
| SRC-REV | Regeling energie vervoer | `https://wetten.overheid.nl/BWBR0041050`; Staatscourant 2026, 15748 | RED III change context | PARTIAL | 2026-07-20 |
| SRC-STB-2026-137 | Staatsblad 2026, 137 | `https://zoek.officielebekendmakingen.nl/stb-2026-137.html` | published 2026-06-10; RED III law/decision effective 2026-06-20 retroactive to 2026-01-01 | ALIGNED | 2026-07-20 |
| SRC-NEA-ELEC | NEa Inboeken elektriciteit | `https://www.emissieautoriteit.nl/.../inboeken-elektriciteit` | current page fetched | PARTIAL | 2026-07-20 |
| SRC-NEA-IDV | NEa Inboekdienstverleners | `https://www.emissieautoriteit.nl/.../inboekdienstverleners` | current page fetched | PARTIAL | 2026-07-20 |
| SRC-NEA-PART | NEa Inboeken elektriciteit particulieren | `https://www.emissieautoriteit.nl/.../inboeken-elektriciteit-particulieren` | current page fetched | PARTIAL | 2026-07-20 |
| SRC-NEA-VER | NEa Informatie voor verificateurs | `https://www.emissieautoriteit.nl/.../informatie-voor-verificateurs` | current page fetched | PARTIAL | 2026-07-20 |
| SRC-NEA-TKV | Toetsingskader verificatieprotocol inboekverificatie elektriciteit | `https://www.emissieautoriteit.nl/documenten/2026/07/09/toetsingskader-verificatieprotocol-inboekverificatie-elektriciteit` | 2026-07-09; 10 pages; 832788 bytes; SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` | FULLY READ / 19 PRESENT CLAUSES MAPPED | 2026-07-21 |
| SRC-NEA-REV | NEa REV/register/year-end information | NEa REV/inboeken pages | current pages partly fetched | PARTIAL | 2026-07-20 |

Coverage matrix:

| source_id | official_title | url/ref | dates | section/anchor | source_text_summary | requirement_id | requirement_class | current_doc | component | alignment_status | conflict | missing_detail | correction_required | source_access_status | last_verified_at |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SRC-WM-97 | Wet milieubeheer | wetten.nl BWBR0003245 | current consolidated partly accessible | title 9.7 / inboeken | statutory inbooking and verifier-result deadlines exist | NEA-OPS-001 | DIRECT LAW | 06, 06A, 08 | operations/year close | PARTIAL | no | exact consolidated article mapping | yes | PARTIAL | 2026-07-20 |
| SRC-WM-97 | Wet milieubeheer | wetten.nl BWBR0003245 | current consolidated partly accessible | title 9.7 / correction | NEa can correct invalid bookings | NEA-COR-001 | DIRECT LAW | 06, 06A, 08 | corrections/audit | PARTIAL | no | exact correction article and retention relation | yes | PARTIAL | 2026-07-20 |
| SRC-BEV | Besluit energie vervoer | wetten.nl BWBR0040922 | 2026 context | electricity delivery/inbooking | rules for delivery and eligible electricity apply | NEA-ELIG-001 | DIRECT LAW | 06 | eligibility | PARTIAL | no | exact current articles | yes | PARTIAL | 2026-07-20 |
| SRC-BEV | Besluit energie vervoer | wetten.nl BWBR0040922 | 2026 context | role/IDV | IDV role must not erase customer-side requirements | NEA-ORG-006 | DIRECT LAW | 05, 06 | governance | PARTIAL | no | exact article references | yes | PARTIAL | 2026-07-20 |
| SRC-REV | Regeling energie vervoer | wetten.nl BWBR0041050 | 2026 change context | electricity data/bijlage | REV/input data for electricity includes customer/EAN/mandate/quantity details | NEA-BOOK-005 | DIRECT LAW | 06, 08 | REV data | PARTIAL | no | exact bijlage/table after full reading | yes | PARTIAL | 2026-07-20 |
| SRC-REV | Regeling energie vervoer | wetten.nl BWBR0041050 | 2026 change context | verification annexes | TKV electricity controls are mapped; full consolidated Regeling reconfirmation remains open | NEA-OPS-004; NEA-VER-003-017 | VERIFICATION FRAMEWORK | 06, 06A, 08 | verifier | PARTIAL | no | exact current consolidated cross-article anchors | yes | PARTIAL | 2026-07-21 |
| SRC-STB-2026-137 | Staatsblad 2026, 137 | officielebekendmakingen | 2026-06-10 / 2026-06-20 | RED III implementation | RED III law/decision effective 2026-06-20 and retroactive to 2026-01-01 | NEA-SRC-001 | DIRECT LAW | 05, 06A | source governance | ALIGNED | no | none for source-date note | no | ALIGNED | 2026-07-20 |
| SRC-NEA-ELEC | Inboeken elektriciteit | NEa | current | who may register | electricity can be booked by qualified inbooker or IDV depending threshold/mandates | NEA-ORG-002 | DIRECT NEA | 06 | IDV eligibility | ALIGNED | no | NEa assessment evidence | no | PARTIAL | 2026-07-20 |
| SRC-NEA-ELEC | Inboeken elektriciteit | NEa | current | threshold | IDV threshold: 2 million kWh or 200 mandates | NEA-ORG-002 | DIRECT NEA | 06 | threshold control | ALIGNED | no | proof format | no | PARTIAL | 2026-07-20 |
| SRC-NEA-ELEC | Inboeken elektriciteit | NEa | current | CAR/EAN/aangeslotene | customer/aangeslotene and CAR/EAN relationship matter | NEA-EAN-001 | DIRECT NEA | 06, 08 | EAN/connection | PARTIAL | no | CAR/source access implementation | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-ELEC | Inboeken elektriciteit | NEa | current | laadlocatie/laadpunt | location and charge-point construct must be evidenced | NEA-CHG-001 | DIRECT NEA | 06, 08 | charger/location | PARTIAL | no | final charge-point/evidence taxonomy | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-ELEC | Inboeken elektriciteit | NEa | current | MID/meters | meter and conformity evidence requirements apply depending construct | NEA-MID-001 | DIRECT NEA | 06, 08 | metering | PARTIAL | no | exact MID evidence set | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-ELEC | Inboeken elektriciteit | NEa | current | renewable share | grid renewable share and full-renewable cases require distinct evidence | NEA-KWH-003 | DIRECT NEA | 06, 08 | kWh/calculation | MISSING | no | calculation model, GvO/subsidy checks, source data | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-ELEC | Inboeken elektriciteit | NEa | current | deadlines | inbooking/year-end/deadline details exist | NEA-OPS-001 | DIRECT NEA | 06, 06A, 08 | operations | PARTIAL | no | exact 2026/2027 dates and REV transition mapping | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-PART | Inboeken elektriciteit particulieren | NEa | current | IDV contract | private customer appoints IDV; IDV collects/administers and remains responsible | NEA-MAND-001 | DIRECT NEA | 06 | mandate | PARTIAL | no | signed mandate model | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-PART | Inboeken elektriciteit particulieren | NEa | current | exclusivity | one IDV per customer/year; no switching within year | NEA-EAN-004 | DIRECT NEA | 06, 08 | mandate/EAN | MISSING | no | duplicate detection source | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-PART | Inboeken elektriciteit particulieren | NEa | current | NEa oversight | NEa may supervise and visit locations; IDVs are not approved/accredited by NEa | NEA-ORG-005 | DIRECT NEA | 06 | public claims/control | ALIGNED | no | claim linting not implemented | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-IDV | Inboekdienstverleners | NEa | current | IDV responsibility | IDV responsible for registration, legal conditions, AO/IB/admin | NEA-ORG-004 | DIRECT NEA | 05, 06 | AO/IB | PARTIAL | no | AO/IB package absent | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-IDV | Inboekdienstverleners | NEa | current | list/accreditation | list is not account, quality assessment, approval, or accreditation | NEA-ORG-005 | DIRECT NEA | 06 | public copy | ALIGNED | no | final copy review | no | PARTIAL | 2026-07-20 |
| SRC-NEA-VER | Informatie voor verificateurs | NEa | current | annual verification | independent external verifier checks bookings yearly | NEA-VER-001 | VERIFICATION FRAMEWORK | 06, 08 | verification | PARTIAL | no | external verifier engagement model | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-VER | Informatie voor verificateurs | NEa | current | protocol approval | each verification type requires a protocol assessed against the applicable framework | NEA-VER-006 | VERIFICATION FRAMEWORK | 06A, 08 | verification protocol | PARTIAL | no | actual verifier/protocol/designation availability and approvals | yes | PARTIAL | 2026-07-21 |
| SRC-NEA-TKV | Toetsingskader elektriciteit | NEa official page/PDF | 2026-07-09 | pages 1-10; clauses 3.0.1-3.3.6 | all ten pages and all nineteen present clauses mapped; source contains no 3.3.5 and says it adds no new legal requirements | NEA-VER-003-017; NEA-RET-003; NEA-OPS-004 | VERIFICATION FRAMEWORK | 05, 06, 06A, 06B, 07, database target model, 08, 09, 10 | verification/compliance | ALIGNED | no | implementation and external professional dependencies only | no | FULLY READ | 2026-07-21 |
| SRC-NEA-REV | REV/year-end | NEa | current partial | REV access | REV/account access and inbooking preparation required | NEA-BOOK-004 | DIRECT NEA | 06, 08 | REV | PARTIAL | no | account/access state and API/import path | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-REV | REV/year-end | NEa | current partial | corrections/double count | corrections and duplicate prevention must be controlled | NEA-COR-001 | DIRECT NEA | 06, 08 | corrections | MISSING | no | REV correction workflow and duplicate detection | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-REV | REV/year-end | NEa | current partial | data availability | data must be available for NEa/verifier checks | NEA-AUD-001 | ENVAL INTERNAL CONTROL | 05, 06, 08 | audit/export | PARTIAL | no | export pack and evidence retention details | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-VER | Informatie voor verificateurs | NEa | current | verifier independence | ENVAL cannot be independent verifier for itself | NEA-VER-001 | VERIFICATION FRAMEWORK | 05, 06 | governance | ALIGNED | no | verifier contract/register | no | PARTIAL | 2026-07-20 |
| SRC-NEA-ELEC | Inboeken elektriciteit | NEa | current | eligible constructs | MLOEA/secondary allocation needs explicit eligibility review | NEA-EAN-003 | DIRECT NEA | 08 | EAN/connection | PARTIAL | no | final construct rules and CAR evidence | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-ELEC | Inboeken elektriciteit | NEa | current | kWh source | kWh source/import and period must be controlled | NEA-KWH-001 | DIRECT NEA | 06, 08 | kWh import | MISSING | no | provider/API/manual import design | yes | PARTIAL | 2026-07-20 |
| SRC-NEA-IDV | Inboekdienstverleners | NEa | current | financial administration | financial administration may be verifier/NEa relevant insofar tied to IDV service | NEA-FIN-001 | DIRECT NEA | 06 | finance | PARTIAL | no | payment/ledger/clawback model | yes | PARTIAL | 2026-07-20 |

Coverage counts:

| result | count |
| --- | ---: |
| ALIGNED | 6 |
| PARTIAL | 20 |
| MISSING | 4 |
| CONFLICT | 0 |
| NOT APPLICABLE | 0 |
| SOURCE ACCESS BLOCKED | 0 |

Requirement classification counts:

| class | count |
| --- | ---: |
| DIRECT LAW | 6 |
| DIRECT NEA | 17 |
| VERIFICATION FRAMEWORK | 5 |
| ENVAL INTERNAL CONTROL | 1 |
| INTERPRETATION - REVIEW REQUIRED | 0 |
| PRODUCT DECISION | 0 |
| UNKNOWN - SOURCE REQUIRED | 0 |

Regulatory blockers:

| blocker | effect |
| --- | --- |
| electricity TKV source access/coverage | closed on 2026-07-21; mapping PASS does not approve architecture or implementation |
| consolidated Wm/Besluit/Regeling article-level reading incomplete in this batch | requirements remain PARTIAL for exact legal anchors |
| REV/year-end implementation details partly source-blocked | no final REV data model or operations calendar |

Electricity toetsingskader correction:

- The intended source is exactly: `Toetsingskader verificatieprotocol inboekverificatie elektriciteit`, Nederlandse Emissieautoriteit, 2026-07-09.
- The intended source URL remains: `https://www.emissieautoriteit.nl/documenten/2026/07/09/toetsingskader-verificatieprotocol-inboekverificatie-elektriciteit`.
- The official PDF was freshly retrieved outside the repository, verified, and then stored as the single immutable repository snapshot at `docs/app/sources/official/nea/2026-07-09_toetsingskader-verificatieprotocol_inboekverificatie_elektriciteit.pdf`; all ten pages were read and all nineteen present numbered clauses were mapped.
- A search result for a toetsingskader for gasvormige biobrandstof may not be used as electricity source.
- No TKV-dependent architecture may be marked CURRENT PROVEN or APPROVED.
- Verifier, sampling, AO/IB, plan, visit, evidence-pack, CAPA, statement, retention and fraud-notification requirements are mapped; implementation and professional/external decisions remain open.
- The PDF proceeds from 3.3.4 to 3.3.6. No 3.3.5 is present or invented.

Internal controls that are not direct legal requirements by themselves:

| control | allowed status |
| --- | --- |
| four-eyes | ENVAL INTERNAL CONTROL unless exact source/TKV requires it |
| CAPA | ENVAL response workflow is an internal control; verifier finding/request/sufficiency/outcome is VERIFICATION FRAMEWORK |
| raw/normalized data separation | ENVAL INTERNAL CONTROL |
| immutable audit | ENVAL INTERNAL CONTROL used to evidence direct requirements |
| service-role-only writes | ENVAL INTERNAL CONTROL/security architecture |
| RLS deny-by-default | ENVAL INTERNAL CONTROL/security architecture |
| specific historization choices | ENVAL INTERNAL CONTROL until source/model approval |

## C1. Official Electricity TKV Completion Control

### Reproducible Source Record

| field | value |
|---|---|
| official page title | Toetsingskader verificatieprotocol inboekverificatie elektriciteit |
| PDF title | Toetsingskader verificatieprotocol: Inboekverificatie elektriciteit |
| publisher | Nederlandse Emissieautoriteit |
| publication date | 2026-07-09 |
| official document page | `https://www.emissieautoriteit.nl/documenten/2026/07/09/toetsingskader-verificatieprotocol-inboekverificatie-elektriciteit` |
| official PDF | `https://www.emissieautoriteit.nl/site/binaries/site-content/collections/documents/2026/07/09/toetsingskader-verificatieprotocol-inboekverificatie-elektriciteit/toetsingskader-verificatieprotocol-inboekverificatie-elektriciteit.pdf` |
| official displayed size | 813.27 KB |
| retrieved bytes | 832788 |
| page count | 10 |
| SHA-256 | `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` |
| retrieval timestamp | `2026-07-21T10:06:18+08:00` |
| repository binary | `docs/app/sources/official/nea/2026-07-09_toetsingskader-verificatieprotocol_inboekverificatie_elektriciteit.pdf` — one immutable official source snapshot |
| content status | all ten pages read; all nineteen present numbered clauses mapped |
| supersede control | retain this snapshot; verify any new official version outside the repo; store under a new versioned name; run clause/source, requirements, traceability, architecture, test and evidence impact diffs; hard-stop affected work until explicit supersede review |

### Coverage And Change Counts

| control | result |
|---|---:|
| present numbered clauses | 19 |
| mapped clauses | 19 |
| missing mappings | 0 |
| invented 3.3.5 | 0 |
| requirements reused in clause mappings | 27 |
| requirements added | 11 (`NEA-VER-008`-`017`, `NEA-RET-003`) |
| existing requirements materially changed | 12 (`NEA-MAND-001`-`005`, `NEA-VER-003`-`007`, `NEA-RET-001`, `NEA-OPS-004`) |
| traceability rows added | 11 |
| existing traceability rows changed | 12 |
| total traceability rows added/changed | 23 |
| active TKV source blockers | 0 |
| TKV-introduced conflicts | 0 |
| broader active conflicts | 1 (`REG-CONFLICT-001`) |
| implementation disposition delta rows | 15 |

Actor mapping counts, counting multi-actor clauses for every assigned actor: VERIFICATEUR `19`, INBOEKER `10`, INBOEKDIENSTVERLENER `10`, ONDERNEMING/NATUURLIJKE PERSOON `3`, NEa `3`, RvA `1`, MINISTER `1`.

### Obligation Boundary Summary

Verifier-only or other external/professional obligations:

- accreditation/temporary designation eligibility, protocol operation and professional assurance;
- risk assessment and dynamic risk reassessment;
- materiality judgment, including qualitative judgment;
- sample method, size and selection;
- visit necessity/frequency, physical work and conclusions;
- evidence sufficiency/suitability and verification-dossier professional reasoning;
- finding classification, additional work, closure and statement consequence;
- official statement issuance/no-issuance, unique code, judgment and REV management;
- fraud-suspicion assessment and notification to NEa;
- RvA schema evaluation, NEa advice and ministerial protocol approval.

ENVAL/inboekdienstverlener support obligations:

- complete scoped population, administration, location, meter, kWh, renewable, GvO, subsidy, backfeed, in-/sales and financial books, AO/IB and staff-access evidence;
- complete enterprise/natural-person signed mandates with EAN, DSO and verifier permissions, date and calendar-year validity;
- risk-input inventory, change detection, scheduling, visit permission/status and versioned request/response handling;
- immutable evidence packs, external-result provenance, finding/CAPA response history, corrections and safe customer/operations/auditor projections;
- verification-specific retention metadata and preservation while maintaining category-specific privacy/retention boundaries.

ENVAL internal controls, not professional verifier decisions:

- evidence-pack completeness and provenance checks;
- change detection and version integrity;
- actor/access/redaction controls;
- immutable external-result storage and correction history;
- no-self-verification and no-self-issued-statement gates;
- explicit prohibition on using 2% as automatic dossier/eligibility/evidence/booking acceptance;
- category-specific retention calculation, hold, export and minimization controls.

Interpretation/review items remaining after TKV completion:

1. `REG-CONFLICT-001`: statement possession before 1 April versus REV result registration before 1 May.
2. Legal basis, controller/processor roles, verifier copies and non-verification category retention periods.
3. Final Dutch mandate wording, electronic-signature evidence and VvE/representation proof.
4. Exact current consolidated Wm/Besluit/Regeling anchors, REV interface/account operations and actual verifier/protocol/designation availability.

`TKV-DOC-CONFLICT-001` is closed on 2026-07-21. Active wording in `docs/app/00_CANON.md`, `docs/app/04_TODO.md`, and `docs/app/decisions/architecture-and-environment-decisions.md` now records electricity-TKV source access and mapping as PASS. Historical changelog/proof wording remains valid only where it is explicitly dated or marked historical. Other consolidated-law, deadline, retention, REV, legal and external-verifier gaps remain separately PARTIAL/UNKNOWN.

TKV-specific implementation mappings are documented but not implemented: engagement, scope, risk, plan, visit, sample, evidence pack, findings/CAPA, external statement and fraud-notification records. Current code, CSS, Supabase schema/functions, migrations and proofs were not changed.

## C2. Source Governance, Terminology And Daan Decision Closure

Source hierarchy:

1. Wet milieubeheer, Besluit energie vervoer, and Regeling energie vervoer are legally higher.
2. The versioned official repository TKV PDF is ENVAL's primary operational verification-architecture source.
3. `docs/app/06_NEA_REQUIREMENTS.md` is the normalized requirement set.
4. `docs/app/08_NEA_TRACEABILITY_MATRIX.md` connects source, component, data, test, and evidence.
5. `docs/app/07_NEA_TARGET_ARCHITECTURE.md` is the derived, unapproved target architecture.

No derived ENVAL document may contradict the PDF. A conflict or new official version is a hard stop requiring a fresh source diff, impacted-requirement and trace review, architecture/test/evidence impact review, and explicit supersede decision.

Official terminology markers:

| marker | recorded boundary |
|---|---|
| risks `hoog`, `midden`, `laag` | external verifier classification and professional judgment |
| `locatiebezoek` | official visit is verifier-owned; ENVAL may only support it and may separately perform an internal support control |
| meter `nauwkeurigheid en betrouwbaarheid` | factual evidence/observations may be supplied; verifier owns official evaluation/conclusion |
| unieke code voor iedere inboekverificatieverklaring | external statement identifier; ENVAL records but does not issue it |
| 2% quantitative verification materiality | verifier context only; never automatic eligibility/evidence/dossier/booking acceptance |
| qualitative breach of law/regulation is material | separate from the 2% threshold; other qualitative materiality remains verifier judgment |
| redelijke mate van zekerheid | external verifier conclusion, not ENVAL software output |
| at least five years | verification data and relevant supplied evidence within the TKV scope; not a blanket period for unrelated data |
| source numbering | 19 present clauses; no 3.3.5 exists or is invented |

Daan decisions recorded:

- ENVAL follows the official TKV and builds no competing proprietary verification framework.
- Professional risk/materiality judgment, official sample selection, official location control, statement issuance, official fraud reporting, and REV result management remain external.
- ENVAL may perform audit-worthy, historized internal support controls selected `manual`, `random`, `risk_based`, or `verifier_request`; they never replace official verification.
- Internal capabilities are built only after explicit GO. External APIs/registers are researched in parallel and attached later through provider-independent ports/adapters.
- External provider data remains observed/external provenance and never automatic core truth.

Support-control boundary:

| INTERNAL SUPPORT CONTROL | EXTERNAL VERIFIER LOCATION VISIT |
|---|---|
| ENVAL preparation/support activity; factual observations, evidence, internal result, follow-up, correction and history | independent professional activity selected and concluded by the verifier |
| result limited to `approved`, `rejected`, `follow_up_required`, `inconclusive` for the internal check scope | verifier controls risk, frequency, sample, work, materiality, evidence sufficiency and statement consequence |
| may never create `officially_verified`, `verification_statement_issued`, `materiality_accepted`, or a registered REV verification result | authoritative only through authenticated external verifier/REV provenance |

The target registration includes `control_id`, case/dossier, location, selection method/reason, planning/performance actors and times, person present, scope, EAN/charger/MID/document/kWh observations, evidence references, result/reason/follow-up, correction, supersede history, audit event, and verifier-relevance flag.

## D. Architecture Harmonization Checks

| check | result | reason | decision |
| --- | --- | --- | --- |
| ENVAL role | PASS | directive states ENVAL is inboekdienstverlener for ERE-E | keep |
| final target architecture decision | FAIL | TKV boundaries are mapped, but `07_NEA_TARGET_ARCHITECTURE.md` still awaits Daan and other regulatory/external decisions | do not implement |
| final MVP plan decision | FAIL | `09_NEA_MVP_PLAN.md` is preliminary and lacks source-complete Daan approval | do not execute |
| app namespace separation | PARTIAL | local app objects use `app_*`/`api-app-*`; old runtime still exists | keep boundary |
| legacy runtime freeze | PARTIAL | docs say freeze, but retirement not complete and legacy functions remain | freeze only |
| accepted evidence model | PARTIAL | upload/version proof exists, acceptance/review/verifier decision model missing | extend after source complete |
| EAN/connection foundation | PARTIAL | local Gate 1 app tables/functions/proofs exist; CAR/REV/read projection/ops decisions open | no final approval |
| kWh/renewability model | MISSING | no final import/calculation/period/batch architecture | design later |
| mandate model | PARTIAL | legal acceptances and draft target exist; signed mandate model incomplete | design later |
| verifier/AO/IB model | PARTIAL TARGET | TKV content mapped; detailed target modules exist but no implementation, verifier or approved architecture | do not implement |
| finance/settlement model | PARTIAL | service terms draft, no ledger/clawback/payment approval | decision required |
| recovery/remote gate | PARTIAL | docs indicate recovery gate work; Wave 1 remains execution-not-started | explicit approval required |

Major harmonization risks:

| risk | detail | mitigation |
| --- | --- | --- |
| document volume hides authority | proof docs, target drafts, and contracts repeat facts | use 00/05/06/08 as primary canon; proof docs support only |
| local proof overclaim | local foundations can be mistaken for final architecture | label as PARTIAL PROVEN / local only |
| legacy runtime overclaim | `api-dossier-*` references can be misread as app architecture | keep frozen-runtime language |
| regulatory incompleteness | TKV complete; consolidated law/deadline/retention/REV/external dependencies remain | no GO until remaining decisions and explicit approval |

## E. Read-Only Implementation Inventory And Disposition

Read-only local metadata:

| inventory item | result |
| --- | ---: |
| `app/src` TypeScript/TSX files | 85 |
| app CSS files | 6 |
| root/static CSS files | 1 |
| local `api-app-*` Edge Functions | 7 |
| local `api-dossier-*` Edge Functions | 18 |
| local worker functions | 3 |
| proof scripts | 12 |
| baseline proposal files | 6 |
| migration files | 20 |
| local app tables in `supabase_db_enval` | 18 |
| local app functions/RPCs/triggers helpers | 22 |
| local app policies | 18 |
| local app triggers | 27 |
| local app tables with RLS enabled | 18 |
| inline style refs in app product code | 0 |
| PRODUCTCODE DIRECT BUSINESS WRITES | 0 |
| PROOF-ONLY DATABASE WRITES | 79 |
| NON-DATABASE DELETE OPERATIONS | 6 |

Write-scan interpretation:

| label | count | scan boundary | interpretation |
| --- | ---: | --- | --- |
| PRODUCTCODE DIRECT BUSINESS WRITES | 0 | `app/src` TypeScript/TSX excluding `*.proof.ts`, searching Supabase `.from(...).insert/update/delete/upsert` and `.rpc(` | no direct frontend database businesswrite found in active productcode |
| PROOF-ONLY DATABASE WRITES | 79 | `app/src/**/*.proof.ts` plus `scripts/proofs/**`, searching the same Supabase write/RPC pattern | proof/test setup, assertions, cleanup, and local proof RPC calls only |
| NON-DATABASE DELETE OPERATIONS | 6 | `app/src` TypeScript/TSX excluding `*.proof.ts`, searching `.delete(` | all hits are cache/Map cleanup such as `inMemoryDashboardCache.delete`, `pendingDashboardReads.delete`, or `pendingLookups.delete`; these are not database businesswrites |

Implementation disposition matrix:

| area | current evidence | disposition | reason | approval risk |
| --- | --- | --- | --- | --- |
| `app/src` marketing/home/signup pages | Vite app code present | KEEP AND EXTEND | useful surface, not source-complete | public claims need legal review |
| `app/src` dashboard | dashboard projection client/code present | KEEP AND EXTEND | useful customer-safe read pattern | no ops/verifier view |
| frontend auth modules | Supabase Auth browser client + bootstrap | KEEP AND EXTEND | aligns with no legacy sessions | production auth policy still open |
| frontend upload/document modules | upload/download/withdraw clients/proofs | KEEP AND EXTEND | good transport pattern | accepted evidence not implemented |
| frontend invoice parser adapter | local parser/precheck proof | REUSE LOGIC ONLY | parser cannot approve evidence | overclaim risk |
| frontend calculator/value copy | public estimator | REFACTOR | no guaranteed value must be enforced | finance/legal risk |
| app CSS/tokens/components | 6 CSS files, no inline styles | KEEP AS-IS | no CSS scope in this batch | design consistency later |
| root/static assets/CSS/JS | legacy production/fallback surface | REMOVE AFTER REPLACEMENT | active legacy until cutover | do not touch before traffic proof |
| `api-app-signup-submit` | local partial proof | REFACTOR | direct dossier shell creation precedes final intake/promotion model | must not become final IDV flow |
| `api-app-auth-bootstrap` | local partial proof | KEEP AND EXTEND | verified Supabase Auth boundary | mandate/identity authority incomplete |
| `api-app-dashboard-get` | local partial proof | KEEP AND EXTEND | customer-safe projection useful | no final status taxonomy |
| `api-app-document-upload-url` | local partial proof | KEEP AND EXTEND | server-issued upload + idempotency useful | storage policy/retention open |
| `api-app-document-upload-confirm` | local partial proof | KEEP AND EXTEND | confirms transport/version/hash | does not accept evidence |
| `api-app-document-download-url` | local partial proof | KEEP AND EXTEND | signed customer download useful | auditor/export path missing |
| `api-app-document-withdraw-current` | local partial proof | KEEP AND EXTEND | preserves history | only document correction covered |
| `_shared/app_foundation.ts` | metadata, errors, hash, audit | KEEP AND EXTEND | core helper avoids duplication | audit strictness policy to decide |
| `_shared/app_customer_auth.ts` | verified customer auth guard | KEEP AND EXTEND | key app auth helper | ops/verifier roles absent |
| legacy `_shared/customer_auth.ts` and sessions | old dossier token model | REPLACE | not app auth | keep only for legacy runtime |
| legacy `_shared/analysis*`, `pdf_text.ts`, `image_text.ts` | parser/analysis helpers | REUSE LOGIC ONLY | useful extraction lessons | no final evidence decision |
| `app_customer_dossiers` | broad current app shell | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | too broad for final NEa domains | do not freeze as target model |
| `app_dossier_locations` | current address/location table | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | useful local/location pattern | EAN/CAR period incomplete |
| `app_dossier_chargers` | charger snapshot table | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | useful asset fields | charge-point history incomplete |
| `app_dossier_document_slots` | document slots | KEEP AND EXTEND | useful evidence intake pattern | final taxonomy TKV dependent |
| `app_dossier_document_files` | physical upload metadata | KEEP AND EXTEND | hash/storage/status pattern | retention/storage policies open |
| `app_dossier_document_versions` | immutable version model | KEEP AND EXTEND | strong historical truth pattern | acceptance decision missing |
| `app_dossier_legal_acceptances` | legal terms acceptance | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | not a full signed mandate model | mandate invalidity risk |
| `app_audit_events` | app audit stream | KEEP AND EXTEND | essential internal control | taxonomy/export not complete |
| `app_idempotency_keys` | scoped replay/conflict | KEEP AND EXTEND | essential write control | cleanup policy open |
| `app_signup_intakes` / files / capabilities | quarantine local proof | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | useful pre-auth quarantine | endpoint/promotion incomplete |
| `app_connections` | Gate 1 local foundation | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | EAN identity foundation useful | CAR/REV/ops not complete |
| `app_connection_periods` | Gate 1 local foundation | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | period history useful | read/review projection missing |
| `app_connection_ownership_periods` | Gate 1 local foundation | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | aangsloten ownership history useful | duplicate/source verification open |
| Gate 1 write RPCs | local service-side proof docs | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | scoped audit/idempotency and service-role-only pattern | no Edge endpoint/customer projection |
| Wave 1 baseline proposals | local proposal files | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | proposal only, not active migrations | Daan approval required |
| existing migrations | local/remote history mixed | KEEP AS-IS | do not rewrite in audit | no SQL apply here |
| `api-dossier-*` functions | 18 local legacy functions | REMOVE AFTER REPLACEMENT | legacy production/fallback | no deletion before cutover |
| workers | 3 legacy workers | REMOVE AFTER REPLACEMENT | runtime/cron may exist | require retirement proof |
| proof scripts | 12 | KEEP AND EXTEND | proof evidence | keep local-only/remote-read-only boundaries |

Disposition counts:

| disposition | count |
| --- | ---: |
| KEEP AS-IS | 2 |
| KEEP AND EXTEND | 13 |
| REFACTOR | 2 |
| REUSE LOGIC ONLY | 2 |
| REPLACE | 1 |
| REMOVE AFTER REPLACEMENT | 3 |
| REMOVE NOW | 0 |
| UNKNOWN - DECISION REQUIRED | 0 |
| PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | 11 |

## F. Modularity And Duplication Findings

| finding type | count | finding | disposition |
| --- | ---: | --- | --- |
| inline style/CSS in TSX | 0 | no `style=` or `.style.` in app product code | no CSS action |
| CSS surfaces | 7 | 6 app CSS files plus 1 root/static CSS file | keep split until root/static retirement |
| component duplication | 6 themes | signup cards, document upload cards, dashboard cards, review panels, button modes, status pills overlap | consolidate through shared app components after architecture GO |
| helper duplication | 5 themes | Supabase clients, SHA-256, idempotency, audit metadata, safe errors appear in app and legacy helper families | keep app helpers; do not reuse legacy session helpers |
| direct UI business writes | 0 | app product code had no direct Supabase table write hits | keep Edge/API write boundary |
| proof writes | 79 | proof-only local setup/cleanup/RPC writes in `*.proof.ts` and `scripts/proofs/**` | allowed only as local proof data |
| legacy/runtime endpoint references in docs | 134 | mostly fallback/retirement inventory | keep clearly non-canonical |

Module map:

| module | current owner | dependency direction | target audit note |
| --- | --- | --- | --- |
| frontend route/surface | `app/src/pages`, `app/src/features` | UI -> clients -> `api-app-*` | keep no direct business writes |
| auth | frontend auth client + `api-app-auth-bootstrap` + `_shared/app_customer_auth.ts` | Supabase Auth -> app identity | extend role model later |
| document transport | document clients + upload/download/withdraw functions + RPCs | UI -> Edge -> storage/app tables | transport only, not evidence acceptance |
| audit/idempotency | `_shared/app_foundation.ts`, app tables, RPCs | all writes -> audit/idem | extend taxonomy |
| EAN/connection | app tables/RPCs local Gate 1 | service-side writes only | partial foundation, no final approval |
| legacy runtime | `assets/**`, `api-dossier-*`, workers | legacy fallback only | freeze and retire later |
| proofs | `scripts/proofs`, `app/src/**/*.proof.ts` | local/remote-read-only proof boundaries | keep safety opt-ins |

## Internal Capability Roadmap

Allowed capability classifications:

- INTERNAL — BUILD AFTER GO
- INTERNAL — DECISION FIRST
- HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER
- EXTERNAL — API ACCESS TO INVESTIGATE
- EXTERNAL — REGISTER/CONTRACT ACCESS TO INVESTIGATE
- EXTERNAL — MANUAL FALLBACK REQUIRED
- BLOCKED — REGULATORY DECISION
- BLOCKED — PRODUCT DECISION

Target capability matrix; every item below is design-only and buildable only after explicit GO:

| internal capability | target boundary |
|---|---|
| customer/person/organization | stable party and account truth |
| representation | time-bound authority and evidence |
| locations | physical location truth, separate from connection and visit records |
| connections | provider-independent EAN/connection and period model |
| chargers | historized charger assets |
| charge points | measured/delivery-point facts separate from charger shell |
| meters/MID | meter identity, validity and conformity evidence without official verifier conclusion |
| documents/evidence | immutable transport/version and separate decision records |
| mandates | signed, versioned, calendar-year authorization |
| kWh raw/normalized | immutable raw imports and replayable normalization |
| internal reviews | task, decision and four-eyes support |
| support controls | internal `manual`/`random`/`risk_based`/`verifier_request` controls, never official verification |
| corrections | append/supersede history, no overwrite |
| audit/provenance | actor/request/source/time/evidence/decision lineage |
| evidence packs | versioned ENVAL support manifests; verifier decides sufficiency |
| verifier request/response records | exchange/provenance only; no professional decision authority |

Internal capabilities that may be built after GO:

| capability | classification | current status | GO precondition |
| --- | --- | --- | --- |
| location and address domain | INTERNAL — BUILD AFTER GO | current location patterns exist, EAN/CAR semantics open | regulatory canon and target architecture approval |
| document transport and immutable versions | INTERNAL — BUILD AFTER GO | local upload/confirm/version/withdraw primitives exist | accepted-evidence boundary preserved |
| PDF/image parsing as precheck | INTERNAL — BUILD AFTER GO | parser/precheck exists as reusable logic only | never treated as final evidence decision |
| declared/observed/evaluated separation | INTERNAL — BUILD AFTER GO | legacy/app concepts exist | formal review/decision model approved |
| EAN syntax and time periods | INTERNAL — BUILD AFTER GO | Gate 1 local proof partial | CAR/REV/source mapping known |
| internal evidence review | INTERNAL — DECISION FIRST | missing final workflow | Daan decides review ownership and state model |
| raw import and normalization framework | INTERNAL — DECISION FIRST | target only | source taxonomy and retention policy approved |
| audit, idempotency, RLS, provenance | INTERNAL — BUILD AFTER GO | technical primitives partially proven | final event taxonomy and strictness policy approved |
| provider-independent ports | INTERNAL — BUILD AFTER GO | target principle only | ports/adapters boundaries approved |
| manual review adapters | INTERNAL — DECISION FIRST | target/manual fallback only | operations owner and SLA approved |

Detailed internal roadmap rows: 10. Target internal capability matrix items: 16.

## External Dependency Roadmap

External dependencies to investigate:

| external capability | target connection rule |
|---|---|
| CAR | provider-independent port; adapters researched; manual fallback where allowed |
| EAN/aangeslotene | external observation/reference reviewed before core decision |
| distributiesysteembeheerder | source/validity/provenance contract required |
| KvK | legal-entity/representation source through adapter or controlled manual evidence |
| MID/certificate source | evidence/reference only; no automatic conformity decision |
| charger provider/CPO/backoffice | raw session/import provenance before normalization |
| energy supplier | source/GvO/period evidence through provider-independent port |
| kWh API/export | immutable raw import, hash and replayable mapping |
| REV | external submission/result reference and reconciliation; no core provider fields |
| verifier | request/response/result provenance; professional authority remains external |
| payment provider where relevant | adapter around append-only internal finance truth |

| dependency | classification | current status | required output |
| --- | --- | --- | --- |
| EAN/aangeslotene source | EXTERNAL — API ACCESS TO INVESTIGATE | missing | source contract or manual evidence standard |
| CAR | EXTERNAL — REGISTER/CONTRACT ACCESS TO INVESTIGATE | missing | access route, legal basis, fields |
| netbeheerderdata | EXTERNAL — API ACCESS TO INVESTIGATE | missing | provider/API/manual export options |
| KvK/vertegenwoordiging | EXTERNAL — REGISTER/CONTRACT ACCESS TO INVESTIGATE | missing | legal entity and representative proof |
| merk/modelcatalogus | EXTERNAL — API ACCESS TO INVESTIGATE | missing | catalog/source maintenance decision |
| MID/conformiteitsregister or evidence standard | EXTERNAL — REGISTER/CONTRACT ACCESS TO INVESTIGATE | missing | accepted proof standard |
| laadpaalprovider/CPO/backoffice | EXTERNAL — API ACCESS TO INVESTIGATE | missing | kWh/session/source export interface |
| energieleverancier | EXTERNAL — API ACCESS TO INVESTIGATE | missing | grid/GvO/source data availability |
| kWh API/export | EXTERNAL — API ACCESS TO INVESTIGATE | missing | export format and cadence |
| REV | EXTERNAL — REGISTER/CONTRACT ACCESS TO INVESTIGATE | missing | account and submission route |
| verificateur | EXTERNAL — REGISTER/CONTRACT ACCESS TO INVESTIGATE | missing | verifier engagement and protocol expectations |
| betaalprovider when relevant | EXTERNAL — API ACCESS TO INVESTIGATE | missing | payout/reconciliation/clawback options |

Detailed external research rows: 12. Required external capability matrix items: 11.

## Hybrid Adapter Roadmap

Architecture rules:

- Core modules know no specific provider.
- External systems are connected through adapters.
- External data becomes provenance, not automatic core truth.
- No external response may automatically become a final evidence decision.
- Every external capability has a provider-independent port, zero or more adapters, and a manual fallback where allowed.
- Every persisted external exchange carries raw response/evidence reference, source system, external reference, retrieval time, valid-from/valid-to, payload/content hash, transformation provenance, internal review status, decision reference, and failure/retry state.
- External references/observations/imports are immutable or superseded with history; provider responses never directly mutate core truth.
- Core tables contain no provider-specific response fields. A new provider normally adds an adapter, mapping and contract tests, not a destructive core migration.

| adapter area | classification | internal core | external adapter research | manual fallback |
| --- | --- | --- | --- | --- |
| EAN/CAR | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | connection periods and ownership claims | CAR/netbeheerder source | manual source review |
| KvK/representatives | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | legal entity and authority records | KvK/register data | uploaded extract + ops review |
| charger/MID | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | charger, charge point, conformity evidence | catalog/MID source | certificate/photo/manual review |
| kWh provider import | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | raw imports and normalized facts | provider/CPO/API exports | uploaded CSV/PDF/manual entry |
| REV submission | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | REV batch candidate/export model | REV UI/API/import | manual REV entry checklist |
| verifier pack | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | evidence pack/export | verifier protocol needs | manually assembled pack |

Hybrid capability count: 6.

## Manual Fallback Roadmap

Every external dependency needs a manual fallback unless regulatorily impossible.

| fallback | classification | purpose | hard limit |
| --- | --- | --- | --- |
| manual EAN/CAR review | EXTERNAL — MANUAL FALLBACK REQUIRED | continue when register/API access is absent | cannot override official disqualification |
| manual KvK/authority review | EXTERNAL — MANUAL FALLBACK REQUIRED | handle missing register automation | must preserve signed proof |
| manual MID/conformity review | EXTERNAL — MANUAL FALLBACK REQUIRED | verify uploaded certificate/photo evidence | cannot create conformity |
| manual kWh import review | EXTERNAL — MANUAL FALLBACK REQUIRED | inspect provider/export files | cannot invent missing kWh |
| manual REV submission checklist | EXTERNAL — MANUAL FALLBACK REQUIRED | bridge missing REV API | must match official REV fields |
| manual verifier evidence pack | EXTERNAL — MANUAL FALLBACK REQUIRED | support verifier before automated export | cannot replace the external verifier's protocol work, evidence-sufficiency judgment or official result |

Manual fallback count: 6.

## External Research Questions

Research question count: 58.

| area | questions |
| --- | --- |
| NEa electricity toetsingskader | monitor for a newer official electricity-TKV version; if found, hard-stop affected work, verify/store it under a new versioned name, run a source/clause/requirement/traceability/architecture diff, and record an explicit supersede decision; protocol templates and actual approved verifier protocol remain external research |
| EAN register/CAR | access route; legal basis; field list; update cadence; historical ownership; duplicate/inboekdienstverlener detection |
| DSOs/netbeheerders | API availability; manual export; EAN-period data; MLOEA/secondary allocation data; support escalation |
| KvK | company identity source; extract cadence; representative authority; VvE handling; retention |
| charger catalog | brand/model source; MID association; charge-point count; firmware/version; deprecated assets |
| MID/conformity | accepted certificate formats; conformity numbers; installer evidence; photo requirements; expiration/revocation |
| providers/CPO/backoffice | kWh export formats; API auth; timestamps/timezones; correction feeds; customer consent |
| energy suppliers | grid renewable percentage source; GvO data; subsidy statement; supply period data; export rights |
| kWh import/API | raw file/API formats; immutable raw imports; normalized views; duplicate checks; missing data policy |
| REV | account requirements; UI/API/import format; field list; submission deadlines; correction process |
| NEa | IDV account route; threshold proof; public claims; year-end process; supervision expectations |
| verifier | protocol approval; sample design; location visit; findings format; evidence pack expectations |
| payment provider | payout timing; clawback/refund; customer identity matching; PSP reconciliation; fee invoice flow |
| manual fallback | manual evidence intake; manual source verification; operator approval; audit trail; exception expiration |

Electricity-TKV source-blocked count: 0. Remaining PARTIAL items concern consolidated-law anchoring, deadline interpretation, retention legal analysis, REV details, implementation and external professional capability.

| capability | category | current disposition | decision needed |
| --- | --- | --- | --- |
| ENVAL IDV role governance | INTERNAL — DECISION FIRST | directive exists | legal/entity approval |
| KvK/legal entity evidence | EXTERNAL — REGISTER/CONTRACT ACCESS TO INVESTIGATE | not implemented | KvK source/API/manual pack |
| EAN validation syntax | INTERNAL — BUILD AFTER GO | local Gate 1 partial | source-complete field rules |
| EAN/aangeslotene proof | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | local ownership period partial | CAR/DSO/manual evidence |
| CAR access | EXTERNAL — API ACCESS TO INVESTIGATE | missing | access route and constraints |
| DSO/netbeheerder data | EXTERNAL — API ACCESS TO INVESTIGATE | missing | provider access and legal basis |
| address lookup | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | frontend PDOK/client pattern | official source fallback |
| charger catalog | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | local static catalog | source/maintenance model |
| MID/conformity validation | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | fields/document slots partial | evidence standard |
| provider/CPO/backoffice imports | EXTERNAL — API ACCESS TO INVESTIGATE | missing | contracts/API formats |
| energy supplier export | EXTERNAL — API ACCESS TO INVESTIGATE | missing | data rights/import |
| kWh import/normalization | INTERNAL — DECISION FIRST | missing | source taxonomy |
| renewable share calculation | BLOCKED — REGULATORY DECISION | partial source | final formula/evidence |
| mandate signing/withdrawal | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | legal acceptance partial | e-sign/manual evidence |
| REV account/access | EXTERNAL — REGISTER/CONTRACT ACCESS TO INVESTIGATE | missing | NEa account route |
| REV data submission | BLOCKED — REGULATORY DECISION | missing | REV interface/source details |
| verifier engagement | EXTERNAL — REGISTER/CONTRACT ACCESS TO INVESTIGATE | missing | independent verifier process |
| verifier protocol/TKV controls | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | TKV mapped; internal support only, professional decisions external | approve target boundaries; engage qualified verifier/protocol path |
| AO/IB control pack | INTERNAL — DECISION FIRST | missing | compliance owner |
| four-eyes approval | INTERNAL — DECISION FIRST | target/internal | define as control, not law unless sourced |
| CAPA/findings | HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | target response workflow only; verifier outcome external | architecture approval, verifier exchange and operating model |
| payment provider | EXTERNAL — API ACCESS TO INVESTIGATE | missing | commercial/legal model |
| payout/settlement ledger | INTERNAL — DECISION FIRST | missing | finance approval |
| manual fallback for missing external APIs | EXTERNAL — MANUAL FALLBACK REQUIRED | missing | operational SOP |

Capability counts:

| category | count |
| --- | ---: |
| INTERNAL — BUILD AFTER GO | 1 |
| INTERNAL — DECISION FIRST | 5 |
| HYBRID — BUILD INTERNAL CORE, RESEARCH EXTERNAL ADAPTER | 7 |
| EXTERNAL — API ACCESS TO INVESTIGATE | 5 |
| EXTERNAL — REGISTER/CONTRACT ACCESS TO INVESTIGATE | 4 |
| EXTERNAL — MANUAL FALLBACK REQUIRED | 1 |
| BLOCKED — REGULATORY DECISION | 2 |
| BLOCKED — PRODUCT DECISION | 0 |

## Decisions Required From Daan

| decision | why required | blocker if absent |
| --- | --- | --- |
| approve final requirement classification after remaining legal review | internal controls must not be mislabeled as law and TKV clauses are verification framework | compliance ambiguity |
| approve architecture outside the bounded internal foundation scope | the bounded scope is approved; broader target and external/professional domains remain open | broader implementation remains NO-GO |
| approve final disposition of local Gate 1 foundations after each bounded proof batch | local proof is not implementation-complete status | no completion or remote claim allowed |
| approve concrete external providers/contracts and manual-fallback operations | the provider-independent strategy is recorded, while CAR/DSO/KvK/REV/verifier/provider/payment choices remain open | adapters cannot be implemented |
| approve Wave 1 baseline execution separately | same-project legacy production risk | no remote mutation allowed |

## I. Compact Final Canon Structure

Executed compact active structure. Documentation placement is complete; target architecture and implementation decisions remain open.

| proposed path | responsibility | brings together | why separate | what does not belong |
| --- | --- | --- | --- | --- |
| `docs/app/00_CANON.md` | source order, roles, doc authority | current governance | one primary index | proof details, target tables |
| `docs/app/01_SYSTEM_MAP.md` | current implementation map | current frontend/backend/runtime facts | distinguishes current vs target | execution plans |
| `docs/app/02_PRODUCT_MODEL.md` | IDV product/service model | doelgroep, fee stance, service boundaries | product/legal surface | table design |
| `docs/app/03_CHANGELOG_APPEND_ONLY.md` | decisions | append-only batch records | audit trail | TODO lists |
| `docs/app/04_TODO.md` | next gates | current open tasks | operational queue | architecture prose |
| `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md` | compliance doctrine | IDV role, source order | highest compliance rule | requirement matrix |
| `docs/app/06_NEA_REQUIREMENTS.md` | requirements | official source requirements | stable IDs | implementation inventory |
| `docs/app/06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md` | source coverage proof | official source reading | proof-only | target design |
| `docs/app/06B_CURRENT_IMPLEMENTATION_ASSESSMENT.md` | code/database comparison | current evidence | proof-only | future plan |
| `docs/app/07_NEA_TARGET_ARCHITECTURE.md` | only primary proposed target architecture | contexts, truth ownership, module/adapter/security boundaries, principles | separates architectural intent from technical appendix and execution | proof details, execution checklists |
| `docs/app/architecture/database-target-model.md` | technical database-target appendix | entities, relations, history, constraints, RLS intent, dispositions | detailed data design is subordinate to 07 | execution and remote proof |
| `docs/app/decisions/architecture-and-environment-decisions.md` | architecture/environment decision record | strategy history, alternatives, selected constraints | preserves decisions without creating execution permission | operational checklists and proof data |
| `docs/app/operations/remote-baseline-and-retirement.md` | remote baseline and retirement operations | freeze, namespaces, waves, cutover, rollback, retirement, aborts | one execution-plan owner | architecture canon and copied proof inventories |
| `docs/app/operations/nea-implementation-roadmap.md` | compact daily execution tracking | current/next package, evidence, blockers, internal/external tracks | subordinate tracker; `09` remains the normative gate plan | requirements, architecture decisions, normative gates, copied proof inventories |
| `docs/app/proofs/remote-baseline-and-recovery-gate.md` | dated remote/recovery proof | inventory, Phase 0, backup/restore, PostgREST, gate evidence | evidence remains proof-only | architecture or execution decisions |
| `docs/app/08_NEA_TRACEABILITY_MATRIX.md` | traceability | source->requirement->control->data->test->evidence | compliance proof | narrative architecture |
| `docs/app/09_NEA_MVP_PLAN.md` | normative MVP gate sequence | bounded internal foundation GO with all other scopes explicitly excluded | product execution ordering | source coverage |
| `docs/app/10_ARCHITECTURE_GO_NO_GO_AUDIT.md` | decision audit | this go/no-go evidence | one-shot decision package | ongoing canon |
| `docs/app/contracts/*.md` | durable technical contracts | auth, audit, document, Edge, signup/dashboard | engineering contracts | regulatory source inventories |
| `docs/app/operations/*.md` | run/debug/retirement | workflow, runtime freeze, and plans without execution permission | operational ownership | product strategy and proof data |
| `docs/app/proofs/*.md` | proof-only evidence | dated proof and reproducible evidence | no architecture/decision authority | implementation permission |
| `docs/app/decisions/*.md` | decision records | strategy history and decision rationale | no operational checklist authority | execution permission |

Final physical counts after consolidation and roadmap addition: 35 Markdown documents under `docs/app`, including 8 primary canon documents, 4 focused 07-support documents, and 1 subordinate live execution tracker. The former 9 top-level 07A-07I documents are replaced by those 4 support documents; `07_NEA_TARGET_ARCHITECTURE.md` remains the sole primary target architecture.

## 07A-07I Consolidation Status

Actual situation: the requested consolidation is physically executed. Architecture, appendix, decision, operations, and proof responsibilities are separated. Supporting documents link to each other instead of copying remote proof into architecture or duplicating execution checklists.

Structure acceptance checks:

| check | result |
|---|---|
| one primary target architecture | PASS |
| database appendix is subordinate and non-canonical | PASS |
| one architecture/environment decision record | PASS |
| one remote baseline/retirement operations owner | PASS |
| one dated remote/recovery proof owner | PASS |
| active references to removed paths | 0 |
| missing concrete `docs/app/*.md` references | 0 |
| forbidden implementation-GO formulations | 0 |
| information-loss matrix | GREEN |

The structure verdict concerns documentation ownership only. It does not change regulatory completeness, target architecture readiness, implementation permission, or the remote execution gate.

## J. Implementation-GO Preconditions

Implementation-GO is possible only when all of the following are true:

| criterion | current result |
|---|---|
| official TKV PDF is present in the repository and hash-checked | PASS |
| all 19 present clauses are substantively mapped | PASS |
| no active TKV blocker claim remains | PASS |
| old documentation is absent | PASS |
| current code, CSS, schema, migrations, Functions, Auth, Storage and tests/proofs have been assessed against the TKV boundary | PASS — assessment evidence only; not implementation proof |
| keep/extend/refactor/replace/remove dispositions are clear | PASS |
| internal and external capabilities are separated | PASS |
| internal support control and external verifier boundary are clear | PASS |
| modular provider-independent port/adapter design is clear | PASS |
| Daan gives explicit implementation GO | PASS — BOUNDED INTERNAL FOUNDATION ONLY |

The first nine documentation/readiness controls do not themselves grant implementation permission. Daan's separate explicit decision grants only the bounded internal foundation scope and leaves every listed excluded scope no-go.

## K. Final Decision Package

Go/no-go findings:

| decision area | finding | verdict |
| --- | --- | --- |
| legacy absence | `docs/legacy` absent, but residual historical references remain in active docs | PASS/PARTIAL |
| ENVAL role | directive says ENVAL is inboekdienstverlener for ERE-E | PASS |
| official source completeness | electricity TKV access and 19-clause coverage PASS; full consolidated legal anchoring and other external source details remain partial | PARTIAL |
| requirement coverage | electricity TKV has 19/19 present clauses mapped and 0 missing mappings; broader matrix remains 6 aligned, 20 partial, 4 implementation/source-detail missing, 0 source-blocked | PARTIAL |
| documentation canon | 07 support consolidation executed; architecture, appendix, decisions, operations, proofs and official source snapshot have distinct owners | PASS |
| current implementation | local app foundations useful but incomplete; bounded GO creates no implementation-complete claim and broader target scope is not approved | PARTIAL |
| architecture | source governance, TKV alignment, support-control and provider-independent port boundaries are approved only for the bounded internal foundation scope | APPROVED BY DAAN FOR BOUNDED INTERNAL FOUNDATION IMPLEMENTATION |
| implementation | internal foundation work may start under package contracts and proof gates; excluded scopes remain prohibited | GO — BOUNDED INTERNAL FOUNDATION ONLY |

Unresolved Daan decisions:

| decision | blocker |
| --- | --- |
| accept or request correction of official TKV source package | mapping is complete; acceptance does not grant implementation GO |
| approve final requirement classes and internal-control labels | TKV classification mapped; remaining consolidated-law/legal review open |
| approve architecture beyond the bounded internal foundation | regulatory, external, professional-verifier, booking, settlement and production decisions remain open |
| approve Wave 1 baseline execution | architecture approval and explicit remote approval absent |
| approve external capability strategy | CAR/DSO/REV/verifier/payment research open |
| approve commercial/payment model | legal/finance model incomplete |

Information that must not be lost:

| information | reason |
| --- | --- |
| ENVAL is inboekdienstverlener for ERE-E | role basis for all requirements |
| source access blockers | prevents false compliance claim |
| upload confirmation is not evidence acceptance | audit/evidence integrity |
| immutable version/audit/idempotency principles | core internal controls |
| RLS/service-role boundary proof | security foundation |
| legacy runtime freeze/retirement inventory | avoids production fallback breakage |
| Gate 1 EAN/connection partial proof | useful local foundation, not final approval |

Information that must not enter new canon as current truth:

| information | reason |
| --- | --- |
| old `api-dossier-*` architecture as app model | conflicts with app namespace |
| old `dossier_sessions` auth | conflicts with Supabase Auth app model |
| old static site as `/app` target stack | fallback only |
| old parser/OCR as acceptance decision | evidence decision requires review/verifier logic |
| fixed price/export fee guarantees | legal/finance risk |
| local app tables as final target beyond the bounded approved scope | broader architecture is not approved |

Recommended exact next documentation/decision batch:

`Resolve Consolidated Law Anchors, Deadline Interpretation, Retention Legal Basis, REV Details, And External Verifier Readiness`

The completed TKV mapping and baseline support the bounded internal foundation decision. They do not authorize any excluded scope or create an implementation-complete claim.

LEGACY DOCUMENTATION VERDICT: PASS

DOCUMENTATION COMPLETENESS VERDICT: PARTIAL

OFFICIAL ELECTRICITY TKV SOURCE-IN-REPOSITORY VERDICT: PASS

OFFICIAL ELECTRICITY TKV ACCESS VERDICT: PASS

OFFICIAL ELECTRICITY TKV CLAUSE COVERAGE VERDICT: PASS

DOCS + ARCHITECTURE TKV ALIGNMENT VERDICT: PASS

DOCUMENTATION STRUCTURE VERDICT: PASS

REGULATORY CONFORMANCE VERDICT: PARTIAL — ELECTRICITY TKV COMPLETE; CONSOLIDATED LAW, DEADLINE, RETENTION, REV, LEGAL, AND EXTERNAL-VERIFIER GAPS REMAIN

ARCHITECTURE VERDICT: APPROVED BY DAAN FOR BOUNDED INTERNAL FOUNDATION IMPLEMENTATION

IMPLEMENTATION VERDICT: GO — BOUNDED INTERNAL FOUNDATION ONLY; REMOTE, DEPLOYMENT, EXTERNAL ADAPTERS, REV, OFFICIAL VERIFICATION AND PRODUCTION REMAIN NO-GO

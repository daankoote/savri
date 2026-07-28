# NEa Implementation Roadmap

Status: TARGET — LIVE EXECUTION TRACKER

Authority: operational tracker only; it does not override the official TKV source, requirements, traceability matrix, target architecture, or MVP gates.

Architecture decision: TARGET — approved by Daan on 2026-07-22; not CURRENT PROVEN.

Next bounded gates: WP3H is committed in `3bb8d50cd7723ad631d75857df4e08d6ef0db311` and proves the exact empty three-table location foundation locally only. All 42 WP3G-Q cases are green. Operationele write-RPC/advisory-lock/two-transaction concurrency is the next separate implementation step. All 44-row mapping/population, caller cutover and retirement remain separately blocked. Connection DDL remains dependent on later operationally usable and accepted location truth; WP3H alone proves no EAN, connection or aangeslotene fact.

Baseline commit: `e2943d746d9bc9f1aa0992b16a83b51dcd10d805`.

This is the compact daily view of sequence, progress, evidence, and blockers. `docs/app/09_NEA_MVP_PLAN.md` remains the normative gate plan; this roadmap does not create implementation, remote, deploy, or provider authority. TARGET approval leaves `READY`, `IN PROGRESS`, `TODO`, and `BLOCKED — EXTERNAL` independently controlling.

## Source Hierarchy

1. Wet milieubeheer, Besluit energie vervoer en Regeling energie vervoer zijn juridisch leidend.
2. De versioned officiële TKV-PDF is de primaire operationele verificatiearchitectuurbron.
3. Requirements en architectuur bepalen wat gebouwd mag worden.
4. De roadmap toont alleen volgorde en voortgang.
5. Bij conflict wint de hogere bron en wordt de roadmap gecorrigeerd.
6. Een nieuwe officiële bronversie veroorzaakt een hard stop en impactanalyse.

## Status Vocabulary

Only these status values may be used in this tracker:

- `TARGET`: approved contract or direction; not built and not `CURRENT PROVEN`.
- `CURRENT PROVEN — LOCAL`: only the explicitly bounded local build plus cited green local proof; no remote, production, regulatory, NEa, or verifier claim.
- `COMPLETE — CURRENT PROVEN`: built behavior plus green proof exists.
- `COMPLETE — UNCOMMITTED`: only the current green-validated documentation or source work that is not committed yet.
- `READY`: dependencies and decisions are sufficient to start.
- `IN PROGRESS`: work has started but the complete gate is not green.
- `TODO`: the work is known but not ready to start.
- `BLOCKED — EXTERNAL`: an API, register, verifier, REV, provider, or other external access is required.
- `BLOCKED — DECISION`: an explicit product, legal, or Daan decision is required.
- `DEFERRED`: deliberately postponed outside the current execution horizon.
- `NOT APPLICABLE`: the item does not apply to the scoped work package.

The tracker never removes a blocker itself. A status changes only when the applicable authority and evidence support the change.

## Dashboard

| field | value |
|---|---|
| Current phase | Approved TARGET direction; bounded work-package authorization only |
| Current work package | WP3H-DOC — register committed local-only location-foundation proof — DOCS ONLY |
| Last completed work package | WP3H — empty bounded location foundation — CURRENT PROVEN LOCAL ONLY — commit `3bb8d50cd7723ad631d75857df4e08d6ef0db311` |
| Next executable work package | Separately authorize an operational location write-RPC/idempotency/advisory-lock/two-transaction concurrency batch |
| Current blockers | Population, operational write-RPC, advisory-lock/two-transaction concurrency, relation links, projection, caller cutover and retirement remain blocked. External source/matching/verifier/privacy and 44-row mapping remain open. Remote/production is not proven. |
| External research running in parallel | CAR, EAN/aangeslotene, DSO, KvK, MID/certificate sources, CPO/backoffice, energy supplier, kWh exchange, REV, verifier, and payment provider where relevant |
| Last updated | 2026-07-28 |
| Evidence reference | WP2B-I commit `5a5265adc516e8198cc25757654920d4aa3316bd`; WP3A commit `f3b39aafb2e6817e64401ccb2c47eed285552869`; WP3B commit `ee3f6b59c937f0c39a67ba09936e9ef688bcea59`; WP3C commit `da961fa84da73ecc320b55b2cb83881a12d658f3`; WP3D commit `88e8c0b754c7d44e769f89037676d9732e6fe63c`; WP3E commit `e04f4a695d983c71a52f48d0c3c26ca605bb4402`; WP3F commit `c5a46faa26d94ad22adbd2b3748f411e1b37e51e`; WP3F-B commit `e6aac0119c5e545673a07c6a985e1921a663ba49`; WP3G commit `c021d57aacc5d8beb4aa2043bc963839fa38da07`; WP3G-B commit `98f7aa5007a458115afab1f2c3b2333862411250`; WP3H commit `3bb8d50cd7723ad631d75857df4e08d6ef0db311`; `operations/wp3h-location-foundation-local-proof.md` |

## Target Approval And Bounded Work-Package Rule

Approved TARGET architecture domains:

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

TARGET approval authorizes none of these domains for blanket implementation. Each work package requires its own bounded scope and decision; existing bounded foundations are not automatically expanded. External professional and external system capabilities remain external and, where tracked, `BLOCKED — EXTERNAL`.

## Initial Validated Baseline

| item | status | evidence reference |
|---|---|---|
| Official TKV source and 19/19 present-clause mapping | COMPLETE — CURRENT PROVEN | Baseline commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805`; official PDF SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`; `06A` |
| Legacy documentation removed | COMPLETE — CURRENT PROVEN | Baseline commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805`; `00_DOCUMENT_MIGRATION_AUDIT` and `10` |
| Documentation structure and target architecture review package | COMPLETE — CURRENT PROVEN | Baseline commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805`; `07`, database target appendix, decisions, operations, proofs, and `10` |
| Current implementation assessment | COMPLETE — CURRENT PROVEN | Baseline commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805`; `06B` and traceability overlay in `08` |
| Documentation baseline commit | COMPLETE — CURRENT PROVEN | Commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805` with message `Establish NEa documentation baseline` |

## Chronological Roadmap

| sequence | work_package | purpose | status | NEa/TKV_requirements | architecture_boundary | internal_or_external | dependencies | expected_modules | database_impact | test_and_proof_gate | last_evidence | next_action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Canon, official source and architecture baseline | Lock source hierarchy, 19-clause mapping, review package, and documentation baseline. | COMPLETE — CURRENT PROVEN | NEA-OPS-002/004; all mapped requirement families | Documentation and source governance only. | Internal documentation plus official source | Green validation; baseline commit | Canon, source registry, audits, architecture package | None | Source hash/pages/clauses, reference checks, `git diff --check` | Baseline commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805` | Maintain source-change and supersede hard stops. |
| 1 | Current implementation to target reconciliation | Inventory current frontend, functions, database, proofs, and dispositions against target requirements. | COMPLETE — CURRENT PROVEN | All 73 requirement rows | Proof-only assessment; no implementation-complete claim by inventory alone. | Internal documentation/proof | Work package 0 source and architecture inputs | Current implementation assessment; traceability overlay | None | Complete inventory and disposition evidence | Baseline commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805`; `06B` and `08` | Preserve assessment as baseline evidence; update only when implementation proof changes. |
| 2 | Customer, person, organization, representation and case foundation | Establish provider-independent party, authority, identity, and case contracts. | IN PROGRESS | NEA-ORG; NEA-MAND-003; NEA-SEC | Internal core truth; case participation never creates legal authority. | Internal | Commit `5a5265adc516e8198cc25757654920d4aa3316bd`; TARGET architecture approval; bounded WP2 subpackages | WP2A party/customer binding plus WP2B-I case/case-role schema locally; authority remains not schema-ready | WP2A four-table and WP2B-I two-table local foundations; migration-history, API/runtime, remote and production remain open | WP2A Q01-Q24 and WP2B-I Q01-Q34 are green locally; WP2B-II is PROOF ONLY readiness evidence; pilot brief is a validation draft only | `proofs/wp2b-i-case-party-role-foundation.md`; `operations/wp2b-ii-representation-authority-readiness-audit.md`; `legal/representation-authority-pilot-validation-brief.md`; no remote, production, NEa or verifier evidence | Obtain attributable written legal/verifier answers for the proposed simple cases, then seek Daan's bounded contract decision; do not start schema automatically. |
| 3 | Location, connection/EAN and validity periods | Complete location/connection truth, temporal facts, aangeslotene claims, and safe review/read boundaries. | IN PROGRESS | NEA-EAN; NEA-AUD-002; NEA-SEC-001/002 | Legal-party connection truth is separate from account, case role, authority, mandate, location, charger/MID and kWh; TKV-aligned internal controls do not establish regulatory acceptance. | Hybrid | WP3H commit `3bb8d50cd7723ad631d75857df4e08d6ef0db311`; WP2 party/case patterns | Exact empty three-table location foundation is CURRENT PROVEN locally; operational writes, EAN/connection truth and external relations remain separate | Three empty local tables and exact schema/security invariants proven; no migration-history record, runtime caller, population, cutover, remote or production proof | WP3G-Q01-Q42 are green with marker `app-location-foundation-proof-ok`; operational advisory-lock/two-transaction concurrency remains outside the foundation proof | `operations/wp3h-location-foundation-local-proof.md`; commit and hashes recorded there; TKV guard | Separately authorize operational write-RPC/concurrency. Population, EAN/connection work, cutover and retirement remain separate. |
| 4 | Charger, charge point, meter/MID and asset relationships | Split assets, measured points, meter identity, conformity evidence, and validity. | TODO | NEA-CHG; NEA-MID | Internal asset truth; conformity conclusion and external evidence stay separate. | Hybrid | Work package 3; evidence and external source contracts | Chargers, charge points, meters/MID, evidence links | Target entity split and historization | Asset/location/EAN/period linkage, conformity boundary, history, and negative proofs | Current charger snapshot and document-slot primitives inventoried in `06B` | Define asset model and accepted-evidence review contract. |
| 5 | Mandates, permissions and representation evidence | Build signed versioned mandates with exact actors, clauses, EANs, dates, validity, withdrawal, and renewal. | TODO | NEA-MAND-001-005 | Legal acceptance is not a complete mandate; legal/verifier acceptance remains external. | Hybrid | Work packages 2-4; final wording/e-sign evidence decision | Mandates, mandate versions, signing, authority evidence | Dedicated target mandate/version entities | Exact-field, signer, authority, permission, calendar-year, withdrawal, and supersede proofs | Requirement and TKV clause mapping in `06`, `06A`, and `08` | Resolve final Dutch wording and evidence standard before build. |
| 6 | Document and evidence ingestion | Preserve bytes, hashes, versions, provenance, and separate evidence review decisions. | IN PROGRESS | NEA-MAND; NEA-CHG; NEA-MID; NEA-AUD; NEA-RET | Transport/versioning never equals evidence acceptance or verifier sufficiency. | Internal | Work packages 2-5; retention and decision contracts | Evidence slots/files/versions/decisions, upload/download/withdraw | Extend proven transport/version primitives; add separate decisions later | Hash, immutability, supersede, access, retention, and no-auto-accept proofs | Current upload/confirm/download/withdraw primitives and proofs inventoried in `06B` | Define target evidence decision and retention contracts before extending behavior. |
| 6A | Existing PDF parser inventory, optimization and modular reuse | Inventory the previous ENVAL PDF parser before deciding safe modular reuse. | TODO | NEA-AUD; NEA-MID; NEA-CHG; NEA-RET | Parser output is observed/derived data only. | Internal | Work package 6 evidence-version boundary | Existing PDF parser, extraction adapter, observation model | Observation records only; no direct core mutation | Inventory, safety, malformed/inconclusive, provenance, performance, and no-auto-accept proofs | Existing parser/precheck classified reuse-logic-only in `06B` and `10` | Inventory current and legacy parser modules; choose modular optimization or replacement. |
| 6B | Image parser design and implementation | Add image extraction as a separate adapter/capability. | TODO | NEA-AUD; NEA-MID; NEA-CHG | Separate adapter; no evidence or professional decision authority. | Internal | Work package 6A boundary and work package 6 evidence model | Image parser adapter, observation model, review queue | Observation records only | Format, provenance, degraded/inconclusive, security, and no-auto-accept proofs | Legacy image extraction is inventory evidence only. | Design the adapter contract after the PDF-parser reuse decision. |
| 6C | Declared, observed, normalized, evaluated and decision boundaries | Enforce non-mutating data layers and authorized decisions. | TODO | NEA-KWH-004; NEA-AUD; NEA-COR; NEA-VER | Derived output never mutates declared/core truth; verifier judgment stays external. | Internal plus external-authority boundary | Work packages 6, 6A, and 6B | Observation, normalization, evaluation, decision, provenance, correction | Separate immutable/versioned layers | Layer-isolation, provenance, supersede, authorization, and no-self-verification proofs | Target layers and invariants are defined in `07` and the database appendix. | Finalize contracts before any parser output is connected to review. |
| 7 | Internal review, support controls, corrections and four-eyes | Build internal tasks, decisions, historized support checks, approvals, and corrections. | TODO | NEA-AUD; NEA-COR; NEA-VER-004/005 | Internal support control never replaces official verifier visit or judgment. | Internal with external-authority boundary | Work packages 2-6C; roles and decision taxonomy | Review tasks, approvals, support controls, corrections, safe projection | Dedicated history and approval entities | Distinct actors, no-official-state-transition, correction history, redaction, and audit proofs | Target boundary is documented in `07`, database appendix, `08`, and `09`. | Define roles, critical-decision list, states, and customer-safe projection. |
| 8 | Raw and normalized kWh, deduplication and provenance | Build immutable source imports, replayable normalization, exclusions, and period controls. | TODO | NEA-KWH-001-006 | Provider data is raw/observed input; eligibility and booking decisions remain separate. | Hybrid | Work packages 3-7; source contracts and retention policy | kWh sources, raw imports, transformations, readings, exclusions | New target kWh entities | Raw immutability, replay, period, dedupe, backfeed, provenance, and correction proofs | Requirements and target model exist; implementation is absent. | Define provider-independent import and manual-fallback contracts. |
| 9 | Evidence packs, audit export and verifier readiness | Produce reconstructable, versioned support packs without claiming verifier sufficiency. | TODO | NEA-VER-003/010/011/013; NEA-AUD; NEA-RET | ENVAL prepares packs; verifier owns scope, sample, sufficiency, and professional reasoning. | Hybrid | Work packages 5-8; verifier exchange and retention rules | Evidence pack, manifest, export, audit reconstruction | Pack/index links and retention metadata | Manifest hash, completeness, reconstruction, access/redaction, and actor-boundary proofs | TKV pack requirements are mapped in `06A`, `07`, and `08`. | Define pack and export contract with external provenance. |
| 10 | External ports, adapters and manual fallbacks | Connect external capabilities without provider-specific core architecture. | TODO | NEA-SEC-003 plus applicable domain requirements | Provider-independent port; adapters and controlled manual fallback; external data is not automatic core truth. | Hybrid | Stable core contracts from work packages 2-9; external access | Capability ports, adapters, external references, retries, manual intake | External references/imports only; no provider fields in core | Contract, mapping, provenance, retry/failure, supersede, and provider-substitution proofs | Port/adapter invariants are defined in `07`, database appendix, and `10`. | Prioritize port contracts; keep provider adapters blocked until access exists. |
| 11 | Verifier support, location visits, sampling, findings and CAPA | Support the external verifier lifecycle while preserving professional authority. | BLOCKED — EXTERNAL | NEA-VER-001-017; NEA-COR; NEA-RET | Risk, materiality, sample, official visit, sufficiency, findings closure, statement, and fraud reporting remain external. | External professional plus internal support | Work packages 7-10; verifier/protocol/RvA/NEa/minister access and decisions | Engagement, scope, plan, visits, samples, findings, CAPA, external results | Dedicated external-provenance records | Actor boundary, immutability, no-self-verification, safe projection, pack reconstruction, and retention proofs | All 19 present TKV clauses are mapped; implementation and verifier access remain open. | Research qualified verifier/protocol path while keeping internal records provider-independent. |
| 12 | Booking batches, ERE calculation and REV readiness | Produce reproducible candidate batches, calculations, REV inputs, results, and reconciliation. | BLOCKED — EXTERNAL | NEA-BOOK; NEA-KWH; NEA-OPS; NEA-VER-002/007/015 | Internal batch/calculation truth is separate from REV and external verification outcomes. | Hybrid | Work packages 5-11; formula, deadlines, REV account/interface | Batches, items, calculations, REV submissions/responses | New booking/calculation/REV entities | Replay, formula/version, blockers, role, input completeness, reconciliation, and deadline proofs | Requirements and target entities exist; REV details and deadline interpretation remain open. | Resolve REV access/interface and `REG-CONFLICT-001`; design internal batch contract. |
| 13 | Finance, settlement, payouts, retention, legal and production hardening | Implement finance late: first a controlled ledger/statements/manual-payout/manual-reconciliation pilot, later bank/PSP/export/import adapters. | BLOCKED — DECISION | NEA-FIN; NEA-AUD; NEA-RET; NEA-SEC; NEA-COR; NEA-OPS | ERE sale/proceeds, legal-party allocation and entitlement, settlement, payout execution, reconciliation, corrections, legal decisions, privacy, external providers, and production authority remain distinct. | Hybrid | Work packages 2-12; proven party/case, EAN/kWh, booking/calculation, recorded ERE sale/proceeds; legal, fiscal, finance, retention, provider, remote, and deploy approvals | Settlement core, ledger, legal-party entitlement, statements, payout port, manual fallback, reconciliation, retention actions, incidents; later bank/PSP adapters | Finance/retention/operations entities only after a separately approved batch | Append-only ledger, formula/version, four-eyes, instruction/import idempotency, manual reconciliation, reversal/clawback, privacy/retention and later adapter-contract gates | `contracts/settlement-and-payouts.md` is TARGET only; bank, PSP, legal money flow, tax and safeguarding remain UNKNOWN. | Complete legal/fiscal/banking decisions and design a separately bounded manual-pilot batch; do not approve implementation or provider adapters here. |

## Parser Position And Boundaries

- The existing PDF parser from the previous ENVAL version is inventoried first.
- Reuse is allowed only after optimization and safety assessment.
- Do not build a second PDF parser when modular improvement is possible.
- An image parser is a separate adapter/capability.
- Parser output is observed/derived data.
- Parser output is never independently accepted as evidence and never becomes core truth.

Parser output requires human review before any evidence decision.

- The human reviewer must be authorized.
- Human review does not replace the verifier boundary; official verifier judgment remains external.

## Internal And External Tracks

External research may run in parallel, but it may not introduce provider-specific fields or behavior into core architecture.

| track | capability | status | boundary / required output |
|---|---|---|---|
| Internal after GO | identity/customer/organization | TODO | Provider-independent party, identity, legal-entity, and case contract. |
| Internal after GO | representation | TODO | Time-bound authority and evidence; no inferred signing authority. |
| Internal after GO | locations | CURRENT PROVEN — LOCAL | WP3H commit `3bb8d50cd7723ad631d75857df4e08d6ef0db311` proves the exact empty three-table foundation locally with WP3G-Q01-Q42 green. No operational write route, population, caller cutover, migration-history integration, remote or production proof exists. |
| Internal after GO | connections | IN PROGRESS | WP3C approves internal A–E TARGET semantics only; old local objects conflict, proofs remain `PROVE AGAIN`, and DDL/external truth remain open. |
| Internal after GO | chargers/charge points/meters | IN PROGRESS | Existing charger/MID fields are partial inputs, not accepted asset/conformity truth. |
| Internal after GO | documents/evidence | IN PROGRESS | Transport/version primitives exist; evidence decision remains separate. |
| Internal after GO | mandates | TODO | Dedicated signed, versioned mandate and exact permissions. |
| Internal after GO | parsing/prechecks | IN PROGRESS | Existing parser logic is inventory/reuse input only; apply the 6A-6C rules. |
| Internal after GO | internal reviews | TODO | Authorized tasks, decisions, role boundary, and safe projection. |
| Internal after GO | support controls | TODO | Historized internal support only; never official verifier visit or result. |
| Internal after GO | corrections | IN PROGRESS | Document withdrawal/version history exists; domain-wide correction remains open. |
| Internal after GO | kWh raw/normalized | TODO | Immutable import, replayable transform, exclusions, and provenance. |
| Internal after GO | audit/provenance | IN PROGRESS | Existing technical primitives require a complete domain/event taxonomy. |
| Internal after GO | evidence packs | TODO | Versioned support manifest; verifier decides sufficiency. |
| External research | CAR | BLOCKED — EXTERNAL | Access route, legal basis, fields, periods, and manual fallback. |
| External research | EAN/aangeslotene | BLOCKED — EXTERNAL | Authoritative source/reference and accepted review evidence. |
| External research | distributiesysteembeheerder | BLOCKED — EXTERNAL | Provider/API/manual-export contract and provenance. |
| External research | KvK | BLOCKED — EXTERNAL | Legal entity and representation source/evidence contract. |
| External research | MID/certificaatbron | BLOCKED — EXTERNAL | Certificate/conformity source or accepted evidence standard. |
| External research | CPO/backoffice | BLOCKED — EXTERNAL | Session/kWh export, authorization, correction, and provenance contract. |
| External research | energieleverancier | BLOCKED — EXTERNAL | Period, renewable-source/GvO, authorization, and export evidence. |
| External research | kWh API/export | BLOCKED — EXTERNAL | Raw format, cadence, hash, retry, corrections, and replay contract. |
| External research | REV | BLOCKED — EXTERNAL | Account, roles, interface/fields, submission, response, and reconciliation. |
| External research | verificateur | BLOCKED — EXTERNAL | Engagement, protocol, requests, plan, visits, findings, result, and access boundaries. |
| External research | bank/PSP/payment provider | DEFERRED | Route and provider remain UNKNOWN. A controlled manual pilot may precede automation; later adapters require separate approval. |

## Detailed Tracking — Current Work Package 2

WP2 remains `IN PROGRESS`. WP2A party directory/customer-party binding and WP2B-I case/case-role schema are `CURRENT PROVEN — LOCAL` only within their cited table, invariant, security and proof boundaries. The historical WP2B readiness audit remains `PROOF ONLY`; its earlier blocked outcome was correct. Representation authority remains `NOT SCHEMA READY`, and every API/runtime, customer projection, remote, production, NEa/verifier and deployment concern remains outside the local proof.

| checklist item | status | evidence / gate |
|---|---|---|
| design/contract | TARGET + RECONCILED | `docs/app/contracts/customer-party-representation-case.md#wp2b-i-ddl-ready-target-contract` preserves the approved domain semantics and reconciles its physical columns/types to the proven migration. The historical audit remains PROOF ONLY. Representation authority remains NOT SCHEMA READY. |
| existing module inventory | COMPLETE — CURRENT PROVEN | Baseline commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805`; `06B` inventories current customer/auth/case modules and dispositions. |
| existing CSS inventory indien UI relevant | COMPLETE — CURRENT PROVEN | Baseline commit records the existing UI/CSS inventory; no styling implementation is authorized by this status. |
| database | CURRENT PROVEN — LOCAL | WP2A's four tables plus WP2B-I `app_cases` and `app_case_party_roles` are locally implemented/proven. WP2B-I has two tables, three focused functions, four triggers, restrictive FKs, checks/indexes, deterministic case locking, deferred transaction-end invariants, deny-all RLS and minimal grants. Version `20260724110000` is absent from local migration history. |
| Edge Function/service | NOT IMPLEMENTED | No API/runtime write or read contract, RPC or Edge Function is implemented by WP2B-I. |
| frontend/UI | NOT IMPLEMENTED | No customer projection or browser path exists; CSS is not applicable. |
| tests | CURRENT PROVEN — LOCAL | WP2A Q01-Q24 and WP2B-I Q01-Q34 are green with zero `FAIL`; WP2B-I marker is `app-case-party-role-foundation-proof-ok`. |
| SQL proof | CURRENT PROVEN — LOCAL | WP2B-I concurrency Q29-Q30 allows at most one overlapping service-recipient commit. Q31-Q33 preserves all existing `app_*` counts/hashes, removes proofdata and leaves both new tables at zero rows. No normal migration-tooling, remote, production, NEa, or verifier proof. |
| browser proof | TODO | Required when approved customer-visible behavior is implemented. |
| documentation update | COMPLETE — CURRENT PROVEN | Commit `5a5265adc516e8198cc25757654920d4aa3316bd` contains the reconciled contract, architecture, traceability, roadmap, TODO, changelog and WP2B-I evidence page without changing the historical audit. |
| accepted by Daan | CURRENT PROVEN — LOCAL | The two-table schema/proof evidence is green; this is not runtime, remote, production, NEa or verifier acceptance. |
| commit | COMPLETE — CURRENT PROVEN | Migration, proof and WP2B-I governance evidence are committed in `5a5265adc516e8198cc25757654920d4aa3316bd`; this does not prove migration-tooling apply, remote parity, runtime, or production. |
| remote/deploy separately approved | BLOCKED — DECISION | No remote apply, parity, deployment, production or push authority exists. |

## Next Bounded Step

WP2B-I SCHEMA/PROOF: CURRENT PROVEN — LOCAL

API/RUNTIME/CUSTOMER PROJECTION: NOT IMPLEMENTED

REMOTE/PRODUCTION AND NEa/VERIFIER ACCEPTANCE: NOT PROVEN

The migration and proof are committed in `5a5265adc516e8198cc25757654920d4aa3316bd`. WP2B-II records the representation-authority readiness result as `BLOCKED — SOURCE OR LEGAL DECISION REQUIRED`. Daan's product direction proposes common simple cases for the MVP, keeps complex outliers for later bounded modules and treats the approximately-10%-or-less estimate as unproven. The draft legal/verifier validation brief is the next bounded step; written answers and Daan's later approval are required before a contract, and representation authority remains `NOT SCHEMA READY`. Mandates, connection/EAN, regulatory versioning, verification and settlement retain their separate statuses and gates.

## Detailed Tracking — Directly Following Work Package 3

Work package 3 is `IN PROGRESS`. WP3A is committed proof-only connection
current-truth evidence, WP3B is committed reconciliation/source disposition,
WP3C records Daan's approved connection/EAN internal TARGET, WP3D is committed
current-truth evidence, WP3E records the approved location domain, and WP3F is
committed in HEAD `c5a46faa26d94ad22adbd2b3748f411e1b37e51e`.
WP3F remains historical proof that DDL was unsafe before the physical
decisions and that 44/44 aliases require manual review with automatic
promotion `NO`.

WP3F-B approves TARGET package 1–18: the bounded foundation is exactly
`app_locations`, `app_location_address_observations`, and
`app_location_versions`, with immutable accepted-only/observation, temporal,
supersession, RLS/minimum-grant, future lock/deferred-validation and audit/
idempotency invariants. TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT
REGULATORY ACCEPTANCE. Implementation is `NOT IMPLEMENTED`, proof `NOT
PROVEN`, migration/data population/retirement `NOT AUTHORIZED`, and caller
cutover `BLOCKED`. Connection DDL still depends on a proven
locationfoundation. Authority validation continues externally and
independently.

WP3G inspected all migrations, proofs and baseline proposals plus the local
catalog read-only. The three TARGET names are free, `gen_random_uuid()` and
the proven immutable/RLS/grant/deferred patterns are available, and no
external blocker touches an empty foundation. Readiness is nevertheless
`BLOCKED — BOUNDED LOCATION FOUNDATION IMPLEMENTATION NOT SAFE`: WP3F-B does
not physically fix observation actor/request fields, hash/freshness shape,
normalized descriptor columns, accepted-input cardinality, acceptance
provenance or timestamp defaults. The 42-row proof contract is TARGET / NOT
IMPLEMENTED and explicitly defers advisory-lock/two-transaction proof to a
later operationele write-RPC.

WP3G is committed in HEAD
`c021d57aacc5d8beb4aa2043bc963839fa38da07`. WP3G-B now approves exact
physical schema package 1–8: observation actor/request fields,
hash/freshness rules, normalized descriptor columns, one unique same-root
primary observation per version, exact acceptance provenance, exact timestamp
defaults and same-root composite keys. These decisions close the six internal
catalog gaps as TARGET only. They do not revise the historical WP3G verdict,
implement or prove the schema, or authorize a migration, proof or database
write. WP3G-C performs the required readiness reconciliation below.

WP3G-B is committed in HEAD
`98f7aa5007a458115afab1f2c3b2333862411250`. WP3G-C confirms that all eight
physical blocker groups are closed and all 42 existing foundation-proof cases
map to exact implementation/proof objects without a new decision. Verdict:
`READY — EMPTY BOUNDED LOCATION FOUNDATION IMPLEMENTATION MAY START`.
Historical WP3G remains unchanged. READY is not implementation authorization:
no migration, proof or database write exists or is authorized.

WP3H subsequently received separate bounded implementation authorization and
is committed in `3bb8d50cd7723ad631d75857df4e08d6ef0db311`. It creates and
locally proves exactly the empty three-table foundation. All 42 WP3G-Q cases
pass with marker `app-location-foundation-proof-ok`; the tables end empty and
the protected before/after manifest is equal. This changes only the bounded
local foundation status. Operational writes, migration-history integration,
population, caller cutover, remote and production remain outside the proof.

| checklist item | status | evidence / gate |
|---|---|---|
| design/contract | CURRENT PROVEN — LOCAL | WP3H implements the exact WP3G-B/WP3G-C empty-foundation contract locally; no additional foundation decision remains. |
| existing module inventory | COMPLETE — CURRENT PROVEN | WP3G inspected all 22 migrations, 25 proof sources, six proposals, shared audit/idempotency, callers, frontend and CSS. Reuse WP2A/WP2B-I constraints, the existing immutable guard, deferred guard pattern, RLS/grants and proof cleanup. |
| existing CSS inventory indien UI relevant | NOT APPLICABLE | Read-only inspection found existing shared address/form/read-only overview styles and no runtime or visual change required for this documentation batch. |
| database | CURRENT PROVEN — LOCAL | Exactly `app_locations`, `app_location_address_observations` and `app_location_versions` are locally present and empty with 44 exact columns, constraints, indexes, triggers, RLS, policies and minimum grants. The direct local apply added no migration-history record. |
| Edge Function/service | NOT APPLICABLE | No runtime module is needed or authorized for this docs-only decision batch. Existing callers remain unchanged. |
| frontend/UI | NOT APPLICABLE | No UI module or CSS change is needed or authorized. Existing callers remain unchanged; PDOK input is only an observation. |
| tests | CURRENT PROVEN — LOCAL | WP3G-Q01 through WP3G-Q42 are green with marker `app-location-foundation-proof-ok`; all fixture groups roll back and all three tables end empty. Advisory-lock/two-transaction concurrency follows with a separately approved write-RPC. |
| SQL proof | CURRENT PROVEN — LOCAL | WP3H proves the exact local foundation, protected count/hash equality and 44 unchanged `app_dossier_locations` rows. No remote or production proof. |
| browser proof | TODO | Required only when approved customer-visible behavior is implemented. |
| documentation update | COMPLETE — UNCOMMITTED | WP3H-DOC registers the committed implementation evidence in one new proof record and six bounded canonical documents. Historical WP3 records, migration, proof and runtime remain unchanged. |
| accepted by Daan | CURRENT PROVEN — LOCAL | The separately authorized WP3H implementation/proof boundary is green; this is not operational, remote, production, NEa or verifier acceptance. |
| commit | COMPLETE — CURRENT PROVEN | Migration and proof are committed in `3bb8d50cd7723ad631d75857df4e08d6ef0db311`; this docs-only registration remains uncommitted. |
| remote/deploy separately approved | BLOCKED — DECISION | Internal GO grants no remote mutation, deployment, or production authority. |

## Update Contract

- After every accepted batch, update this roadmap.
- Change status only from received evidence and the applicable decision authority.
- Every `COMPLETE — CURRENT PROVEN` or `COMPLETE — UNCOMMITTED` entry must cite the relevant HEAD, commit, and/or green proof.
- `docs/app/03_CHANGELOG_APPEND_ONLY.md` remains append-only historical evidence.
- `docs/app/04_TODO.md` remains the complete backlog.
- This roadmap remains the compact daily overview.
- `docs/app/09_NEA_MVP_PLAN.md` remains the normative gate plan.
- Every execution batch follows `docs/app/00_CANON.md#codex-execution-batch-discipline`; this tracker does not duplicate that governance.
- Remote action and deploy always require separate explicit approval.

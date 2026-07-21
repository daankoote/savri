# Architecture And Environment Decisions

Status: DECISION RECORD — STRATEGY SELECTED, EXECUTION NOT APPROVED

This record consolidates architecture, rebuild, environment, and app-baseline strategy decisions. It records selected strategy and historical alternatives; it does not authorize implementation, deployment, SQL, migration apply, retirement, Auth/Storage/cron changes, commit, or push.

Regulatory status: PARTIAL — ELECTRICITY TKV ACCESS AND CLAUSE MAPPING PASS; OTHER LEGAL, DEADLINE, RETENTION, REV, AND EXTERNAL-VERIFIER GAPS REMAIN

Verification detail is mapped from the official electricity TKV. Target architecture remains `DRAFT — AWAITING DAAN APPROVAL`; implementation remains `NO-GO`.

Overall recommendation: HYBRID PARALLEL REBUILD.

Reason: existing app primitives for auth, customer-safe projections, evidence transport, audit, idempotency, and immutable document versions are worth reusing. Existing `app_*` domain coverage is still too narrow to become the final NEa/IDV model without parallel rebuilding core domains. Legacy `dossier_*` and `api-dossier-*` are migration/fallback/export sources only and should be removed after caller, data, storage, and remote conditions are satisfied.

## Decision Timeline And Project Identity

| date | decision | current interpretation |
|---|---|---|
| 2026-07-19 | HYBRID PARALLEL REBUILD selected at architecture level | reuse technical primitives; rebuild missing IDV domains in parallel |
| 2026-07-19 | clean separate app project recommended | architecturally cleanest option, later superseded for the current quota constraint |
| 2026-07-19 | Daan rejected a separate Supabase app project for now because of project quota | strategy selected: in-place parallel rebuild in the existing project; no execution permission |
| 2026-07-20 | local recovery control passed | does not change the remote execution no-go while PostgREST platform health remains unresolved |
| 2026-07-21 | Daan designated the verified official electricity TKV snapshot as ENVAL's primary operational verification-architecture source | no competing ENVAL verification framework; professional verifier authority stays external; internal support capabilities may be designed only as subordinate target modules after GO |

| field | value |
|---|---|
| Supabase project name | `enval` |
| project ref | `yzngrurkpfuqgexbhzgl` |
| region | `eu-west-2` |
| environment classification | LEGACY PRODUCTION; public traffic proof remains required before retirement |
| former dashboard name | `Savri`; same project, not another environment |
| selected strategy | `IN-PLACE PARALLEL REBUILD` |

The selected strategy requires isolated `app_*`, `api-app-*`, `app-documents`, and app identity/cohort boundaries. Current legacy schema, functions, Storage, cron, Auth users, and registered migrations remain protected until replacement and retirement gates pass.

## Context Decisions

| bounded_context | choice | rationale | current assets | target assets | data migration | runtime migration | test requirement | deletion precondition | operational impact | risk |
|---|---|---|---|---|---|---|---|---|---|---|
| public/content | EXTEND CURRENT | Copy already avoids some guarantee risks but needs source-driven claim control. | public pages, calculator copy | claim library, approved fee/service copy | none | public copy changes later | copy/legal checks | none | low | misleading copy if not governed |
| signup quarantine | PARALLEL REBUILD | Current submit creates dossier shell too early for target verification/promotion. | signup frontend, mapper, `api-app-signup-submit`, quarantine schema proof | quarantine submit, upload capability, promotion RPC | migrate active direct-submit rows if any | refactor submit to quarantine | idempotency, anti-abuse, promotion proofs | direct-create endpoint behavior replaced | medium | onboarding interruption |
| identity and representation | PARALLEL REBUILD | Supabase Auth binding is useful; legal representation is absent. | auth provider, auth bootstrap, identities | identities, legal entities, representatives | preserve identity links | add ops/legal role endpoints | auth/role proofs | no legacy sessions in app | medium | wrong legal actor |
| customer/account | EXTEND CURRENT | Customer shell and dashboard projection are useful but not enough for IDV. | customers, dashboard | customers, cases, projections | preserve customers | extend projection endpoints | customer-safe projection proof | none | low | overclaiming status |
| mandate | FULL REBUILD | Legal acceptance is not a signed calendar-year mandate. | legal acceptances | mandates, mandate versions | map accepted text only if legally valid | new mandate/signing endpoints | mandate field/period/signature proofs | generic mandate acceptance retired | high | invalid inboeking |
| connection/EAN | FULL REBUILD | Address/location is not EAN/aangeslotene proof. | address lookup, locations | connections, ownership periods | map addresses as locations | new EAN/CAR/manual review | ownership/duplicate proofs | no EAN required callers left | high | invalid customer electricity |
| location | EXTEND CURRENT | Location model is useful if separated from connection/EAN. | app locations | app locations + connection links | preserve locations | add review/projection | location history proof | none | medium | address treated as proof |
| charger/charge point | PARALLEL REBUILD | Current charger snapshot lacks charge-point/history semantics. | app chargers, form components | chargers, charge points | migrate customer-submitted fields | add asset/version endpoints | asset history proof | old charger table migrated | medium | period mismatch |
| MID/conformity | FULL REBUILD | MID number and upload slots are not conformity decisions. | MID field, document uploads | MID meters, evidence decisions | migrate MID number as declared data | review decision endpoints | confirmed upload not accepted evidence proof | old MID status retired | high | invalid measurement |
| evidence/document lifecycle | EXTEND CURRENT | Strongest current foundation; needs acceptance decisions. | document slots/files/versions/RPCs/functions | evidence slots/files/versions/decisions | preserve files/versions | adapt endpoints and RPC names/domain | upload/confirm/withdraw/accept proofs | no broken current files | medium | evidence loss |
| kWh source/import | FULL REBUILD | No kWh source or readings exist. | none | sources, raw imports | none | new importer/manual endpoint | raw immutability/provenance proofs | none | high | cannot book ERE-E |
| normalization/provenance | FULL REBUILD | No transformation pipeline exists. | hash/idempotency helpers | transform runs, normalized readings | none | new worker/service | replay/dedupe proofs | none | high | unreproducible kWh |
| eligibility | FULL REBUILD | No eligibility decisioning exists. | public precheck copy only | eligibility decisions, exclusions | none | ops review endpoints | eligibility/four-eyes proofs | none | high | ineligible batches |
| operations review | FULL REBUILD | No ops dashboard or role model exists. | audit primitives | review tasks, approvals | none | ops endpoints/UI later | role/four-eyes tests | none | high | unreviewed decisions |
| internal support control | FULL REBUILD AFTER GO | ENVAL needs audit-worthy preparatory checks without impersonating the verifier's official location visit. | location, evidence, correction and audit patterns only | historized support controls with manual/random/risk-based/verifier-request selection and safe result states | none | new provider-independent support-control port/service only after explicit GO | history, provenance, no-official-state-transition and actor-boundary tests | explicit Daan implementation GO | medium | internal result misrepresented as official verification |
| correction/revision | PARALLEL REBUILD | Document withdrawal pattern is useful, but business corrections are absent. | withdraw RPC | corrections/revisions | preserve doc history | add domain correction APIs | append-only correction proof | no overwrite callers | medium | lost correction trail |
| booking batch | FULL REBUILD | No batch or calculation model exists. | none | batches, items, calculation runs | none | batch endpoints/workers | replay/calculation proofs | none | high | no inboeking capability |
| REV submission/reconciliation | FULL REBUILD | REV access and workflow unknown. | none | REV submissions/responses | none | manual/API boundary later | REV pack/reconciliation proof | none | high | operational blocker |
| verification | FULL REBUILD AFTER GO — TKV MAPPED | Official TKV boundaries are known; professional risk, materiality, sample, official visit, statement, fraud notification and REV result management remain external. | none | verifier engagements, request/response records, packs and immutable external-result references | none | provider-independent verifier exchange only after explicit GO | TKV actor/provenance/no-self-verification tests | explicit Daan GO plus external verifier/REV dependencies | high | compliance incompleteness or self-verification |
| findings/CAPA | FULL REBUILD AFTER GO — TKV MAPPED | ENVAL may manage its response and corrections, but the verifier owns finding classification, sufficiency, closure and statement consequence. | none | findings, CAPA, corrections and external closure provenance | none | response workflow only after explicit GO | CAPA history/no-self-close proofs | explicit Daan GO and verifier exchange contract | medium | weak finding response or false closure |
| finance/settlement | FULL REBUILD | No settlement ledger exists; public estimates are not finance truth. | no-guarantee copy | settlement ledger, entitlements | none | finance endpoints/workers | ledger/reversal proofs | none | high | payout/clawback errors |
| audit | EXTEND CURRENT | Event primitives exist but taxonomy is incomplete. | app audit/intake audit | extended audit taxonomy | preserve audit rows | consolidate helpers | audit sampling/export proof | none | medium | incomplete reconstruction |
| retention | PARALLEL REBUILD | Legacy retention concept is useful but tied to old runtime. | retention worker/RPC/events | app retention actions | export legacy logs if needed | rebuild worker | dry-run/apply/storage proofs | legacy data/storage handled | high | data loss/privacy failure |
| incident/operations | FULL REBUILD | No compliance incident model exists. | run-debug docs, safe errors | incident records | none | ops endpoints later | incident impact proof | none | medium | hidden operational defects |

## Environment Alternatives Considered

The comparison covered law/NEa separation, auditability, correctness, Auth/security, migrations, rollback, Storage, cron, deployment complexity, data integrity, retirement, maintenance, and extensibility.

| option | strengths | risks/constraints | decision |
|---|---|---|---|
| A. Separate Supabase project | cleanest app migration, Auth, Storage, cron, rollback, audit, and data boundary; legacy production remains isolated | extra project/config/secrets/deploy path and unavailable under the current project quota | SUPERSEDED FOR NOW BY QUOTA DECISION |
| B. Staging followed by production | strong proof-before-production and promotion discipline | highest environment overhead; requires isolated data, redirects, secrets, buckets, and promotion controls | SUPERSEDED FOR NOW; remains a useful future pattern |
| C. App beside legacy in the same project | feasible under current quota and avoids immediate project creation | largest shared-project blast radius; mixed history, Auth, Storage, cron, functions, and rollback risk | SELECTED ONLY WITH STRICT ISOLATION AND GATES |

The option-C selection does not permit migration execution, deployment, cutover, legacy rename, or deletion. Operational sequencing and gates are owned by `docs/app/operations/remote-baseline-and-retirement.md`; remote facts and recovery evidence are owned by `docs/app/proofs/remote-baseline-and-recovery-gate.md`.

## Protected Reuse

Use these as target building blocks, not as final domain proof:

- Supabase Auth customer boundary and server-side identity binding.
- Service-role-only app write pattern.
- Deny-by-default sensitive table RLS.
- Request metadata, stable payload hash, idempotency replay/conflict.
- Server-side upload confirmation with SHA-256.
- Immutable document version history with supersede/withdraw.
- Customer-safe dashboard projection.
- PDF/image/parser logic as precheck/extraction only.
- Retention dry-run/storage sequencing concept.

## Daan Verification And Adapter Decisions

1. ENVAL follows the official electricity TKV as the primary operational verification-architecture source and implements no competing verification framework.
2. Professional verifier work stays external: risk and materiality judgment, sample selection, official location control, verification-statement issuance, official fraud reporting, and REV management of the verification result.
3. ENVAL may perform preparatory internal support checks. They may be selected manually, randomly, risk-based, or at verifier request, must be audit-worthy and historized, and never replace official verification.
4. Internal capabilities are built only after explicit GO.
5. External APIs/registers are researched in parallel and later connected through provider-independent ports with zero or more adapters and a manual fallback where allowed.
6. External provider data is observed/external provenance and never automatic core truth.

Every external port/adapter contract must preserve: raw response or evidence reference, source system, external reference, retrieval time, valid-from/valid-to, payload/content hash, transformation provenance, internal review status, decision reference, and failure/retry state. Core domain models must not contain provider-specific response fields.

## Removal Direction

The following are not target architecture:

- legacy `dossier_sessions`;
- legacy `dossier_*` state machine;
- legacy `api-dossier-*` endpoint contracts;
- legacy lead/contact/mail bootstrap;
- legacy derived analysis as core truth;
- public calculator as ERE-E calculation;
- confirmed upload as accepted evidence;
- existing broad `app_customer_dossiers.status` as a universal status model.

## Remaining Conditions And Decisions

- The official electricity TKV repository snapshot and all 19 present clauses are verified and mapped; future official versions require a hard-stop source diff and supersede review.
- Daan's source, verifier-boundary, support-control, internal/external capability, and ports/adapters decisions above are recorded. They do not constitute implementation GO.
- Remote Wave 1 remains blocked until PostgREST platform health is closed or Daan explicitly accepts a separately documented support-risk gate.
- Any remote mutation requires a separately authorized exact batch, fresh collision check, recovery evidence, reviewer, owner, abort criteria, and rollback plan.
- Decide whether any legacy data is imported into the app baseline or retained externally until retirement.
- Decide quarantine Storage boundaries and app Auth redirect/cohort settings.
- Recover or document source provenance for remote-only legacy functions before retirement planning.
- Change Netlify/root routing only after app proof and a documented rollback path.
- Retire legacy objects only after caller, data/export, Storage, retention, replacement, and candidate-specific rollback evidence is green.

## Confirmation

This decision record grants no execution permission. No implementation-GO is recorded.

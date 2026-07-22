# NEa Target Architecture

Architecture status: TARGET — APPROVED, NOT CURRENT PROVEN

Regulatory status: PARTIAL — ELECTRICITY TKV CLAUSES MAPPED; CONSOLIDATED LAW, DEADLINE, RETENTION, REV, AND EXTERNAL-VERIFIER GAPS REMAIN

This is the only primary target architecture. It defines bounded contexts, truth ownership, module and adapter boundaries, security boundaries, requirement families, and architecture principles. Daan approved this TARGET direction on 2026-07-22; the approval is not built compliance or permission to implement any work package.

The ten-page `Toetsingskader verificatieprotocol inboekverificatie elektriciteit` of 2026-07-09 was fully read and mapped on 2026-07-21. Its nineteen present numbered clauses define the target verification boundaries below. This closes the source-access blocker only; it does not prove implementation or regulatory compliance.

Supporting documents have non-competing responsibilities:

- `docs/app/architecture/database-target-model.md`: technical data-model appendix;
- `docs/app/decisions/architecture-and-environment-decisions.md`: architecture and environment decision record;
- `docs/app/operations/remote-baseline-and-retirement.md`: execution planning without execution permission;
- `docs/app/proofs/remote-baseline-and-recovery-gate.md`: dated proof only, not architecture canon.

Architecture source order:

1. Wet milieubeheer, Besluit energie vervoer, and Regeling energie vervoer;
2. the versioned official electricity-TKV PDF in `docs/app/sources/official/nea/` as the primary operational verification-architecture source, subordinate to those legal sources;
3. `docs/app/06_NEA_REQUIREMENTS.md` as the normalized requirement set;
4. `docs/app/08_NEA_TRACEABILITY_MATRIX.md` as the source-to-component/data/test/evidence link;
5. this document as the derived and approved TARGET direction, not CURRENT PROVEN implementation;
6. `docs/app/06B_CURRENT_IMPLEMENTATION_ASSESSMENT.md` and factual code, migrations, Edge Functions, proofs, and Supabase config for current implementation truth;
7. Daan's explicit project decisions.

No derived ENVAL document may contradict the official PDF. A conflict or a new official version is a hard stop requiring a source diff, impacted-requirement/trace review, architecture impact review, and explicit supersede decision.

This document defines the approved TARGET direction for ENVAL as inboekdienstverlener for ERE-E. It does not drop database objects, rewrite runtime code, approve production use, or claim compliance completeness.

Local app foundations that depend on regulatory semantics are not automatically approved for reuse or implementation. Their disposition remains:

`PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON`

## A. Architecture Principles

| principle | target rule | current evidence | status |
|---|---|---|---|
| law/NEa first | Requirements and controls follow official law/NEa sources before code or legacy convenience. | `05`, `06`, `06A`, `06B`. | TARGET |
| time-bound truth | Identity, mandate, connection, charger, MID, kWh, decision, and REV data must carry explicit periods where relevant. | Current app timestamps exist; NEa periods mostly absent. | TARGET |
| append-only material history | Material facts and decisions are not overwritten; corrections supersede or append. | App document versions and withdrawal RPC partially prove this. | PARTIAL PROVEN |
| raw/normalized/decision separation | Raw submitted or imported data, normalized facts, and decisions are distinct layers. | Current document file/version split helps; kWh layer absent. | TARGET |
| derived data mutates no core truth | Calculations and projections are reproducible outputs, not sources of truth. | Dashboard projection pattern supports this. | PARTIAL PROVEN |
| server-side writes | Business writes go through Edge/RPC/server-side service-role paths. | Current `api-app-*` endpoints and service-role-only grants partially prove this. | PARTIAL PROVEN |
| explicit provenance | Every material row points to source, actor/request, evidence, or transform. | Request metadata, hashes, audit primitives exist. | PARTIAL PROVEN |
| four-eyes for critical decisions | Eligibility, evidence acceptance, batch approval, correction, REV, verifier finding, and settlement require distinct actors where critical. | Not implemented. | TARGET |
| customer-safe projections | Customers see status and next actions, not raw audit, raw storage paths, internal findings, or verifier workpapers. | `api-app-dashboard-get` partially proves customer-safe projection. | PARTIAL PROVEN |
| manual fallback where integrations are unavailable | CAR/EAN, provider kWh, REV, verifier, and finance can start as controlled manual workflows with provenance. | No integration contracts proven. | TARGET |
| no blind legacy compatibility | Old `dossier_*`, `dossier_sessions`, and `api-dossier-*` are not preserved unless needed for migration, fallback, export, retention, or rollback. | Legacy docs removed; runtime still exists. | TARGET |

## B. Bounded Contexts

Target bounded-context count: 24.

| bounded_context | purpose | primary target data | current assets reused | decision |
|---|---|---|---|---|
| public/content | Explain ENVAL's IDV service without guarantee or NEa-approval claims. | claim library, fee copy, source review evidence | public pages, calculator copy guard | EXTEND CURRENT |
| signup quarantine | Capture pre-auth submitted truth before promotion. | quarantine intake, file, capability records | `app_signup_intakes`, files, capabilities proof | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON |
| identity and representation | Bind Supabase Auth identity, legal entity, representative authority, and customer actor. | identities, legal entities, representatives | `app_customer_identities`, auth helper | PARALLEL REBUILD |
| customer/account | Maintain customer account shell and customer-safe portal scope. | customers, customer cases, projections | `app_customers`, dashboard projection | EXTEND CURRENT |
| mandate | Store signed mandate, version, period, clauses, withdrawal, and renewal. | mandates and mandate versions | legal acceptance pattern only | FULL REBUILD |
| connection/EAN | Prove EAN, aangeslotene, distributor, address, and ownership period. | connections, ownership periods | address normalizers/location rows | FULL REBUILD |
| location | Keep physical charging locations distinct from EAN and ownership. | locations | `app_dossier_locations` pattern | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON |
| charger/charge point | Model charger asset and individual charge points with history. | chargers, charge points | `app_dossier_chargers` fields | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON |
| MID/conformity | Decide MID applicability and evidence validity for concrete assets. | MID meters, conformity evidence via evidence tables | MID field, document slots | FULL REBUILD |
| evidence/document lifecycle | Issue uploads, confirm bytes, version evidence, and separate acceptance decisions. | evidence slots/files/versions/decisions | document upload/confirm/download/withdraw primitives | EXTEND CURRENT |
| kWh source/import | Capture provider/manual source contracts and raw imported readings. | kWh sources, raw imports | none; parser only as precheck | FULL REBUILD |
| normalization/provenance | Transform raw readings into normalized readings with replayable transforms. | normalized readings, transform runs | `payloadHash`, request metadata | FULL REBUILD |
| eligibility | Decide eligible transport use, renewable basis, exclusions, and hard blockers. | eligibility decisions | no current implementation | FULL REBUILD |
| operations review | Route internal review tasks, owners, due dates, and escalations. | review tasks and approvals | safe errors/audit primitives | FULL REBUILD |
| internal support control | Perform preparatory, audit-worthy ENVAL checks selected manually, randomly, risk-based, or at verifier request, while remaining distinct from the external verifier's official location visit. | internal support controls, evidence references, corrections and audit events | location/evidence/correction/audit patterns only | FULL REBUILD AFTER GO — NO OFFICIAL VERIFICATION AUTHORITY |
| correction/revision | Preserve corrections, supersedes, revised data, and impacted batches. | correction records | document withdrawal pattern | PARALLEL REBUILD |
| booking batch | Build reproducible ERE-E candidate batches. | batches, batch items, calculation runs | none | FULL REBUILD |
| REV submission/reconciliation | Track REV account, role gates, submission, response, and reconciliation. | REV submissions/responses | no current implementation | FULL REBUILD |
| verification | Support external verifier engagement, scope, risk-input exchange, plans, visits, samples, packs, results and timing without replacing professional judgment. | engagements, scopes, risk assessments, plans, visits, samples, packs, statements | no current implementation | FULL REBUILD — REQUIREMENTS MAPPED, IMPLEMENTATION NOT APPROVED |
| findings/CAPA | Track externally issued findings, ENVAL responses, corrections/CAPA, closure, statement blockers and re-verification provenance. | findings, CAPA actions, corrections | no current implementation | FULL REBUILD — REQUIREMENTS MAPPED, IMPLEMENTATION NOT APPROVED |
| finance/settlement | Reconcile ERE sale, customer entitlement, fee, corrections, reversals, clawbacks. | settlement ledger, entitlements | no current implementation; public no-guarantee copy | FULL REBUILD |
| audit | Immutable event stream with actor, request, source, evidence, decision, time, and correlation. | audit events | `app_audit_events`, `app_intake_audit_events` | EXTEND CURRENT |
| retention | Apply policy-driven preservation, export, minimization, and deletion proof. | retention actions | `retention-worker` concept, app minimized markers | PARALLEL REBUILD |
| incident/operations | Log incidents affecting evidence, kWh, REV, verifier, settlement, or deadlines. | incidents | run-debug doctrine, safe errors | FULL REBUILD |

## C. Core-Truth Entities

Target entity count: 53. Table-level details are in `docs/app/architecture/database-target-model.md`.

| entity | purpose | owner | identifiers | valid-from/valid-to | mutable/immutable | source/provenance | evidence relation | audit relation | correction model | RLS/access | requirements | customer_visible | TKV dependency |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| customer | ENVAL customer/account owner. | Product/Ops | customer_id, customer_number | status over time | mutable profile, immutable audit | signup/auth/ops | mandate/evidence/cases | app audit | profile change events | customer projection + internal | ORG, SEC | yes | no |
| customer identity | Supabase Auth and contact binding. | Engineering | identity_id, auth_user_id, email | active/revoked period | mutable status | Auth provider | identity evidence where needed | auth events | revoke/supersede | customer + server | SEC | yes | no |
| legal entity | Company/VvE legal person. | Legal/Ops | KvK, legal name | period-valid | versioned | KvK/customer evidence | representation evidence | legal review | supersede | internal summary | MAND, ORG | limited | no |
| representative | Natural person or role authorized to sign. | Legal/Ops | representative_id, identity refs | authority period | versioned | mandate/KvK/board proof | authority documents | representation review | supersede | internal/customer own | MAND, SEC | limited | no |
| case/dossier | Operational container for one onboarding/booking relationship. | Ops | case_id, case_number | lifecycle period | mutable state only | promotion | all domain rows | lifecycle audit | correction/revision | customer projection | AUD, RET | yes | yes |
| location | Physical charging location. | Product/Ops | location_id, normalized address | occupancy/evidence period | versioned facts | customer/address lookup/manual review | address evidence | location review | supersede | customer-safe summary | EAN, CHG | yes | yes |
| connection/EAN | Electricity connection and distributor data. | Ops/Compliance | EAN, distributor, address | required | versioned | CAR/netbeheerder/customer proof | connection evidence | EAN review | supersede | internal + customer summary | EAN | limited | yes |
| connection ownership period | Aangeslotene proof for a period. | Ops/Compliance | connection_id + period | required | immutable decision version | CAR/invoice/manual proof | evidence decision | ownership review | supersede | internal | EAN, MAND | status only | yes |
| mandate | Customer authorization for ENVAL IDV activity. | Legal/Ops | mandate_id, customer_id | calendar-year validity | current pointer mutable, versions immutable | e-sign/manual signed artifact | mandate evidence | mandate events | revoke/supersede | internal + customer copy | MAND | yes | yes |
| mandate version | Immutable signed mandate clause set. | Legal/Ops | mandate_version_id | issue/validity period | immutable | signed artifact/hash | mandate file/version | mandate captured/revoked | supersede | internal/customer copy | MAND, RET | yes | yes |
| charger | Customer charger asset. | Ops | charger_id, serial/model/provider | asset period | versioned | customer/provider/evidence | charger evidence | charger review | supersede | customer summary | CHG | yes | yes |
| charge point | Measured delivery point under a charger. | Ops/Data | charge_point_id, connector/meter ids | period | versioned | provider/manual | MID/kWh evidence | asset review | supersede | customer summary | CHG, MID, KWH | yes | yes |
| MID meter | Meter tied to charge point and validity. | Ops/Compliance | meter_id, MID number, certificate ref | validity required | versioned decision | conformity proof | evidence decision | MID review | supersede | status only | MID | limited | yes |
| evidence slot | Expected evidence requirement for a case/entity. | Ops/Product | slot_id, entity ref, document_type | requirement period | mutable state, immutable audit | requirement engine | files/versions/decisions | evidence events | supersede slot if wrong | customer-safe | MAND, CHG, MID, RET | yes | yes |
| evidence file | Physical upload intent and storage metadata. | Engineering/Ops | file_id, storage key, hash | upload/expiry period | immutable after terminal | customer/storage/server hash | versions | upload audit | reject/abandon | internal, signed URL only | AUD, RET, SEC | no raw | no |
| evidence version | Immutable confirmed evidence version. | Engineering/Ops | version_id, version_number | created time | immutable with status transitions | file hash/RPC | slot/current pointer | version events | supersede/withdraw | internal + customer projection | AUD, COR, RET | yes summary | no |
| extracted observation | Parser/provider observation from evidence. | Data/Ops | observation_id, extractor version | source period | immutable | parser/provider run | evidence version | extraction event | new run | internal | AUD, MID, CHG | no | yes |
| evidence decision | Human/system decision about evidence acceptance. | Ops/Compliance | decision_id, version refs | decision time | immutable, supersedable | reviewer/control | evidence version | decision audit | supersede/correct | internal + status projection | AUD, CHG, MID | status only | yes |
| kWh source | Provider/manual data source authorization. | Data/Ops | source_id, provider/account/authorization | contract period | versioned | customer/provider/manual | mandate/authorization evidence | integration events | revoke/supersede | internal | KWH, SEC | limited | yes |
| raw kWh import | Immutable raw kWh import batch. | Data | import_id, source ref, hash | delivery period | immutable | provider/manual upload/API | source evidence | import audit | corrected by exclusion/new import | internal | KWH, RET | no | yes |
| normalized reading | Canonical kWh row linked to raw source. | Data | reading_id, charge point, period | required | immutable per transform | raw import + transform | source import | normalization event | supersede by transform | internal/projection aggregate | KWH | aggregate only | yes |
| transformation run | Replayable normalization/calculation transform. | Data | run_id, version, input hash | run time | immutable | code/version/source refs | input refs | transform audit | new run | internal | KWH, BOOK | no | yes |
| exclusion | Backfeed, duplicate, non-eligible, or overlap exclusion. | Data/Ops | exclusion_id, reading/item ref | affected period | immutable decision | rules/reviewer | evidence/reading | exclusion decision | supersede/correct | internal + summary | KWH, ELIG | status only | yes |
| eligibility decision | Case/item eligibility decision. | Ops/Compliance | decision_id, entity/item ref | decision time | immutable | requirement/evidence inputs | supporting evidence | four-eyes audit | supersede/correct | internal + status | ELIG | status only | yes |
| review task | Internal queue item. | Ops | task_id, scope, owner | task period | mutable workflow | system/manual | target refs | task events | close/reopen | ops roles | AUD, OPS | no | yes |
| internal support control | Preparatory ENVAL control distinct from an official verifier visit. | Ops/Compliance | control_id, case/location, selection method | planned/visited time | append-only performance/result history | manual/random/risk-based/verifier-request selection plus observations/evidence refs | evidence versions and external refs | support-control audit event | superseding record and correction reference | restricted; safe status projection only | VER, AUD, COR | safe status only | supports TKV but never creates official result |
| approval | Four-eyes approval record. | Ops/Compliance | approval_id, actor refs | decision time | immutable | review task/decision | supporting evidence | approval audit | supersede only by correction | restricted | AUD, SEC | no | yes |
| correction/revision | Business correction preserving previous truth. | Ops/Compliance | correction_id, scope, reason | effective period | immutable once closed | request/finding/ops | affected evidence | correction audit | linked supersede | restricted | COR, RET | status only | yes |
| booking batch | Candidate/approved inboeking batch. | Ops/Data | batch_id, year, status | calendar year | state mutable, manifest immutable | eligible items/calculation | batch pack | batch audit | correction batch | restricted | BOOK, OPS | limited | yes |
| booking batch item | Per customer/EAN/quantity item. | Ops/Data | item_id, batch_id, customer/EAN | delivery period | immutable after approval | normalized readings/decisions | source refs | item audit | correction item | restricted | BOOK, KWH | limited | yes |
| calculation run | ERE-E calculation version and result. | Data/Ops | calculation_id, version, batch/item | run time | immutable | factor/source version | inputs | calculation audit | new run | restricted | BOOK, KWH | summary maybe | yes |
| REV submission | REV input/submission attempt. | Ops | submission_id, REV ref | submission time | immutable attempt | batch/account/manual/API | REV input pack | REV audit | supersede/revise | restricted | BOOK, OPS | no | yes |
| REV response | REV response/result/reconciliation. | Ops | response_id, submission_id, REV ref | response time | immutable | REV/manual record | response evidence | reconciliation audit | linked correction | restricted | BOOK, OPS, VER | status only | yes |
| verifier engagement | External verifier, applicable accreditation/designation and protocol scope/year/status. | Compliance | engagement_id, verifier, year | engagement period | versioned | contract/accreditation/designation/protocol | verifier evidence | engagement audit | supersede | restricted | VER | no | TKV mapped; external eligibility |
| verification scope | Versioned verification population and requested scope. | Compliance/Ops | scope_id, engagement/year | scope period | immutable version | verifier request plus ENVAL population manifest | evidence pack | scope audit | new version | restricted | VER | no | TKV mapped; verifier determines sufficiency |
| verification risk assessment | Verifier-authored dynamic high/middle/low risk result linked to ENVAL input snapshot. | External verifier/Compliance | assessment_id, scope/version | assessment time | immutable external version | verifier result and input-manifest hash | risk evidence refs | risk exchange audit | new assessment | highly restricted | VER | no | professional judgment; never ENVAL-generated |
| verification plan | External plan, programme, assurance/materiality objectives, visits, interviews and schedule. | External verifier/Compliance | plan_id, scope/version | plan period | immutable version | verifier plan/reference | planned evidence/visits/samples | plan exchange audit | new justified version | restricted | VER | status only | verifier owns plan |
| verification location visit | Verifier-requested visit and factual scheduling/evidence status. | External verifier/Ops | visit_id, plan/location | planned/actual period | factual events append-only | verifier request and location refs | visit evidence | visit audit | corrected event/new visit | restricted; safe customer projection | VER, EAN, MID | safe status only | verifier selects visit/frequency |
| verification sample | External sample request/selection linked to immutable population version. | External verifier/Data | sample_id, scope/population version | selection time | immutable external selection | verifier request/reference | sampled evidence/quantity refs | sample exchange audit | new sample/version | highly restricted | VER, KWH | no | verifier selects method/size/items |
| verification evidence pack | Versioned ENVAL support pack and evidence index supplied to verifier. | Compliance/Ops | pack_id, scope/version, manifest hash | pack period | immutable version | ENVAL sources/transforms and request refs | evidence/version links | pack audit | superseding pack | restricted export | VER, AUD, RET | no | ENVAL support; verifier judges sufficiency |
| verification statement | External statement metadata/outcome, unique code, kWh/year scope and provenance. | External verifier/Compliance | statement_id, unique external code | statement/year period | immutable external result | verifier identity/report/REV ref | support pack | result audit | correction/new external result | highly restricted; safe outcome projection | VER, BOOK | safe outcome only | ENVAL does not issue or self-mark verified |
| fraud suspicion notification | Restricted verifier-origin NEa notification reference and lawful support provenance. | External verifier/NEa | notification_ref, engagement/scope | notification time | immutable reference | verifier-origin source | restricted evidence refs | access audit | correction reference only | highest restriction; never customer-visible | VER, SEC | no | suspicion/reporting remains verifier/NEa-only |
| verifier finding | External finding, material/non-material classification, ENVAL response and statement-block relation. | External verifier/Compliance/Ops | finding_id, engagement/scope | finding period | immutable finding with append-only responses | verifier report refs | workpaper/evidence refs | finding audit | CAPA/correction | restricted | VER, COR | status only | verifier decides finding/materiality/sufficiency |
| CAPA action | ENVAL corrective/preventive response linked to finding/incident/correction. | Compliance/Ops | capa_id, finding/correction | due/closure period | mutable workflow with history | finding/internal incident | closure evidence | CAPA audit | reopen/new CAPA | restricted | COR, AUD | status only | verifier decides requested/sufficient follow-up where applicable |
| settlement ledger entry | Money/entitlement/fee/correction entry. | Finance | ledger_id, customer/batch/ref | accounting period | append-only | sale/fee/contract/correction | finance evidence | finance audit | reversing entry | finance role | FIN | summary only | yes |
| customer entitlement | Customer-safe result/settlement entitlement. | Finance/Product | entitlement_id, customer/case/year | period | derived/projection | ledger/batch | supporting evidence | projection event | recalculated from ledger | customer-safe | FIN | yes | yes |
| audit event | Material event stream. | Engineering/Compliance | event_id, correlation/request/idempotency | event time | append-only | callers/RPCs/workers | entity refs | self | compensating event | internal; projected safely | AUD, SEC, RET | no raw | yes |
| idempotency key | Replay/conflict control for writes. | Engineering | scope/key | expiry period | immutable payload hash, mutable response | request | target action | idempotency audit | expire/cleanup | server-only | AUD, SEC | no | no |
| incident | Compliance/ops incident. | Ops/Engineering | incident_id, severity, scope | incident period | mutable workflow with event history | system/manual | affected refs | incident audit | CAPA/correction | restricted | OPS, AUD | limited | yes |
| retention action | Preservation/minimization/deletion/export proof. | Compliance/Data | action_id, target ref | action time | append-only | retention policy | export refs | retention audit | compensating action | restricted | RET | no | yes |
| signup intake | Pre-auth submitted payload snapshot. | Product/Ops | intake_id, request hash | expiry/promotion period | immutable after finalization | anonymous submit | intake files | intake audit | reject/expire/promote | service-only | MAND, SEC | no | yes |
| signup intake file | Quarantine file metadata. | Product/Ops | file_id, storage key/hash | expiry/promotion period | immutable after terminal | capability/storage/server hash | promoted evidence | intake audit | reject/expire/promote | service-only | AUD, RET, SEC | no | yes |
| signup intake capability | Hashed private capability token. | Engineering | capability_id, token hash | expiry/consume period | immutable token hash/status | server-issued token | intake/file refs | capability audit | expire/consume | service-only | SEC | no | no |

## D. Data Layers

| layer | definition | may mutate core truth? | examples | primary controls |
|---|---|---|---|---|
| submitted/declared truth | Customer-submitted values and signed assertions. | no; corrected by new version | signup intake payload, mandate data, declared charger info | hash, actor, timestamp, version |
| observed/extracted data | Parser/provider observations from files or external systems. | no | invoice parser output, provider metadata | source run, method version, confidence |
| normalized data | Canonical data derived from raw/imported data. | no; superseded by new transform | normalized kWh reading, normalized address | transform version, input hash |
| evaluated facts | Reviewable facts prepared from evidence and normalized data. | no | EAN ownership candidate, MID applicability candidate | reviewer queue, evidence links |
| decisions | Human/system decisions that determine eligibility, acceptance, batch inclusion, or correction. | no; supersede/correction only | evidence accepted, eligible, backfeed excluded | four-eyes where critical |
| booking outputs | Reproducible batch manifests, calculations, REV input/output. | no; revised by linked correction | booking batch, calculation run, REV response | batch approval, reconciliation |
| customer projections | Customer-safe status and summaries derived from internal truth. | no | dashboard status, requested action, entitlement summary | redaction, no raw audit/storage paths |
| audit trail | Append-only material events across all layers. | append only | actor/request/source/decision events | immutable event taxonomy |

## E. Lifecycle / State Machines

No target status may combine different meanings. Each lifecycle below is provisional and must be encoded as a separate state machine or explicit decision field.

| lifecycle | provisional states | forbidden conflation |
|---|---|---|
| intake | draft_client_only -> submitted_quarantine -> email_or_identity_pending -> verification_ready -> rejected -> expired -> promoted | submitted is not verified; promoted is not accepted evidence |
| promotion | queued -> validated -> blocked -> promoted_to_case -> failed_retryable -> failed_terminal | promotion does not approve NEa eligibility |
| dossier/case | opened -> intake_review -> evidence_collection -> ops_review -> booking_candidate -> booked -> verification_pending -> settled -> closed -> paused/rejected | case status is not mandate, evidence, kWh, REV, or settlement status |
| mandate | drafted -> signed -> active_for_calendar_year -> expiring -> withdrawn -> superseded -> expired | consent checkbox is not signed mandate |
| evidence | slot_expected -> upload_issued -> file_confirmed -> review_needed -> accepted -> rejected -> withdrawn -> superseded | confirmed upload is not accepted evidence |
| EAN verification | missing -> submitted -> CAR/manual_check_needed -> accepted -> rejected -> expired/superseded | address match is not aangeslotene proof |
| MID decision | missing -> applicability_pending -> conformity_pending -> accepted -> rejected -> expired/superseded | MID number is not conformity proof |
| kWh import | source_configured -> import_received -> raw_locked -> normalized -> reconciled -> excluded/corrected | normalized is not eligible |
| review | task_open -> in_review -> approved -> rejected -> escalated -> reopened | reviewer action is not four-eyes unless distinct approval exists |
| internal support control | selected -> planned -> performed -> result_recorded -> follow_up_required/closed -> superseded | an internal result is never an official verifier visit, materiality decision, statement, verified state, or REV result |
| correction | requested -> impact_assessed -> approved -> applied_by_new_version -> reconciled -> closed | correction never overwrites previous material truth |
| batch | draft -> candidate -> blocker_check -> approved -> submitted_to_REV -> response_received -> reconciled -> revised | batch approval is not REV acceptance |
| REV | account_pending -> access_ready -> input_prepared -> submitted/manual_registered -> response_logged -> reconciled | REV readiness is not NEa approval |
| verification support | engagement_needed -> eligibility_evidenced -> scope_received -> inputs_shared -> plan_received -> evidence_requested -> evidence_pack_shared -> external_result_received -> external_result_registered_or_blocked | only externally sourced verifier outcomes may advance result states; ENVAL cannot self-verify |
| verification plan | received -> acknowledged -> active -> change_requested -> superseded -> completed | risk/materiality/sample/visit choices remain verifier-owned and every plan change keeps reason/provenance |
| verifier finding/CAPA | external_finding_received -> response_due -> correction_or_capa_in_progress -> submitted_for_external_review -> externally_closed_or_statement_blocked | ENVAL may manage response/CAPA; only verifier closes professional finding/outcome |
| CAPA | finding_open -> action_planned -> owner_assigned -> due -> evidence_uploaded -> reviewed -> closed -> overdue/reopened | CAPA is not a correction unless linked |
| settlement | entitlement_pending -> sale_recorded -> fee_calculated -> payable -> paid_or_settled -> reversed/clawed_back -> closed | public estimate is not entitlement |

## F. Security Architecture

| security boundary | target rule | current reusable asset | status |
|---|---|---|---|
| Supabase Auth boundary | Customer portal identity uses verified Supabase Auth; no legacy `dossier_sessions` for `/app`. | `app_customer_auth.ts`, `api-app-auth-bootstrap`. | PARTIAL PROVEN |
| customer identity binding | Auth user is bound server-side to an active customer identity and customer/case scope. | `app_bootstrap_customer_auth_v1`. | PARTIAL PROVEN |
| operations roles | Ops, compliance, finance, support, engineering/admin roles must be explicit and least-privilege. | none. | TARGET |
| compliance role | Compliance can approve requirements, source reviews, verifier records, CAPA policy, and final blockers. | none. | TARGET |
| finance role | Finance can read settlement ledgers and create append-only/reversing entries, not mutate evidence truth. | none. | TARGET |
| service_role | Service-role remains server-side only; no browser direct writes to sensitive tables. | app Edge service clients and grants. | PARTIAL PROVEN |
| customer-safe read models | Customers read projections through Edge/API, not raw tables or raw audit. | `api-app-dashboard-get`. | PARTIAL PROVEN |
| deny-by-default internal tables | All sensitive tables use RLS deny/default and service-role or role-scoped server access. | app migrations. | PARTIAL PROVEN |
| Edge Function writes | Business writes use CORS/META/AUTH/IDEM/AUD/SRV as applicable. | `contracts/edge-functions.md`, app functions. | PARTIAL PROVEN |
| RPC ownership | RPCs are used only for reviewed atomic database transitions. | document confirm/reject/withdraw and auth bootstrap RPCs. | PARTIAL PROVEN |
| four-eyes actor separation | Critical approvals require two distinct qualified actors and audit proof. | none. | TARGET |
| secrets/server-only integrations | Provider, REV, storage, email, and payment secrets stay in server env and are logged only by reference. | Supabase env pattern only. | TARGET |

## G. Audit Architecture

| audit element | target requirement | current reusable asset | status |
|---|---|---|---|
| material event taxonomy | Events grouped by intake, auth, customer, mandate, EAN, asset, evidence, kWh, eligibility, review, correction, batch, REV, verification, CAPA, finance, retention, incident. | `app_audit_events.scope_type` needs extension. | TARGET |
| actor | Every event records actor type and actor reference; customer, ops, compliance, finance, system, provider, verifier, and worker actors are distinct. | app actor refs, legacy session refs as anti-pattern. | PARTIAL PROVEN |
| request | Request ID, idempotency key, correlation ID, and environment must be tracked for writes and critical reads/rejects. | `app_foundation.ts` metadata. | PARTIAL PROVEN |
| source | Events identify source system/function/RPC/integration/manual action. | app function names in event data. | PARTIAL PROVEN |
| evidence | Decisions link to evidence versions, raw imports, or official/manual source proof. | document versions. | PARTIAL PROVEN |
| before/after reference | Mutable state changes must reference old and new state or a superseded row. | document version supersede/withdraw. | PARTIAL PROVEN |
| decision | Decision events include decision, result, reviewer, basis, and blocker state. | not implemented beyond document transport. | TARGET |
| reason | Rejections, corrections, exclusions, CAPA, and overrides require reason codes. | some safe error/rejection reasons. | PARTIAL PROVEN |
| time | Event time, source period, validity period, and effective period are separated. | `created_at`, some validity gaps. | TARGET |
| idempotency | Write actions reserve, conflict-check, replay, and finalize idempotency. | app idempotency keys and RPCs. | PARTIAL PROVEN |
| correlation | Cross-object workflows carry correlation IDs across Edge/RPC/workers. | request IDs partially. | TARGET |
| exportability | Verifier/admin packs can be reconstructed from source, normalized data, decisions, and audit. | legacy export concept only. | TARGET |
| customer projection versus raw audit | Customer projections are derived and redacted; raw audit remains internal. | dashboard proof partial. | PARTIAL PROVEN |

## H. TKV Verification Architecture Boundaries

| module | ENVAL builds after explicit GO | external/professional authority | principal target records |
|---|---|---|---|
| verifier engagement | contract, identity, accreditation/designation/protocol evidence and validity status | accreditation, RvA evaluation, NEa advice and ministerial protocol approval | `app_verifier_engagements` |
| verification scope | immutable population manifest and request/response exchange | scope sufficiency and final scope | `app_verification_scopes` |
| risk assessment | risk-input inventory, change detection, external result/version provenance | risk factors, high/middle/low rating, dynamic reassessment | `app_verification_risk_assessments` |
| verification plan | receive/version/acknowledge plan and disclose relevant changes | plan, programme, assurance, materiality, work, interviews and visits | `app_verification_plans` |
| location visit | location/change history, permission, planning, factual status and evidence | necessity, frequency, selection, physical work and conclusions | `app_verification_location_visits` |
| internal support control | ENVAL may schedule and perform a preparatory support check, record factual observations, evidence, result, follow-up, correction and history | it is not the official verifier location visit; professional risk/materiality, official visit selection/conclusion and statement effect remain external | `app_internal_support_controls` |
| sample selection | immutable population and fulfillment of verifier requests | method, size, selection and evaluation | `app_verification_samples` |
| verification evidence pack | versioned evidence index, exports, request/response and retention metadata | sufficiency/suitability and professional reasoning | `app_verification_evidence_packs` |
| finding/corrective action | receive finding, route response, correction/CAPA history and safe status | materiality, additional work, sufficiency, closure and statement consequence | `app_verifier_findings`, `app_capa_actions`, `app_corrections` |
| verification statement | prepare support fields and record immutable external code/outcome/provenance | issuance, no-issuance, content judgment and REV management | `app_verification_statements` |
| fraud suspicion | restricted external reference, lawful supporting provenance and access audit | suspicion assessment and notification to NEa | `app_fraud_suspicion_notifications` |

Architecture invariants:

- The 2% threshold is stored only as verifier materiality context/result; it is not eligibility, evidence acceptance, booking, or dossier automation.
- ENVAL never generates an official verification statement and never marks an inboeking verified without an authenticated external verifier result.
- Risk assessment, sample selection, visit scope/frequency, materiality, evidence sufficiency and statement judgment are external professional decisions.
- External results are immutable, provenance-bound and correction-aware; every replacement preserves the prior record.
- Customer projections expose only safe request/status/outcome information. Raw workpapers, samples, risk reasoning and fraud suspicions are excluded.
- Verification retention uses category/purpose/period metadata; the TKV five-year minimum is not copied blindly to unrelated customer data.

## I. Internal Support Control Target Module

`INTERNAL SUPPORT CONTROL` and `EXTERNAL VERIFIER LOCATION VISIT` are separate modules, actors, records, state machines and authorities. The internal module exists only to prepare ENVAL's administration and evidence; the external visit is selected and professionally performed/concluded by the verifier.

Een INTERNAL SUPPORT CONTROL does not replace an EXTERNAL VERIFIER LOCATION VISIT.

Een interne supportcontrole vervangt geen officiële locatiecontrole of professionele oordeelsvorming door de externe verificateur.

The conceptual support-control registration contains at least:

- `control_id`;
- case/dossier reference;
- location reference;
- `selection_method`: `manual`, `random`, `risk_based`, or `verifier_request`;
- `selection_reason`;
- `planned_at`, `visited_at`, `performed_by`, and `person_present`;
- `check_scope`;
- connection/EAN, charger, meter/MID, document, and kWh/source observations;
- evidence references;
- `result`: `approved`, `rejected`, `follow_up_required`, or `inconclusive`;
- reason and follow-up;
- correction reference;
- superseded-record/history link;
- audit-event reference;
- verifier-relevance flag.

An internal support control may never automatically create or advance `officially_verified`, `verification_statement_issued`, `materiality_accepted`, or `REV verification result registered`. Its `approved` result means only that the scoped internal support check passed; it is not evidence sufficiency, reasonable assurance, professional materiality, or an official verification outcome.

## J. Internal/External Capability And Adapter Contract

| boundary | capabilities | architecture rule |
|---|---|---|
| INTERNAL — BUILDABLE ONLY IN AN EXPLICITLY APPROVED BOUNDED PACKAGE | customer/person/organization; representation; locations; connections; chargers; charge points; meters/MID; documents/evidence; mandates; kWh raw/normalized; internal reviews; support controls; corrections; audit/provenance; evidence packs; verifier request/response records | ENVAL owns modular domain truth and support workflows, but no module may perform professional verifier decisions. |
| EXTERNAL — RESEARCH AND CONNECT LATER | CAR; EAN/aangeslotene; distribution-system operator; KvK; MID/certificate source; charger provider/CPO/backoffice; energy supplier; kWh API/export; REV; verifier; payment provider where relevant | Each capability is reached through a provider-independent port, zero or more adapters, and a manual fallback where allowed. |

Every external capability contract carries: raw response/evidence reference, source system, external reference, retrieval time, valid-from/valid-to, payload/content hash, transformation provenance, internal review status, decision reference, and failure/retry state.

External data is an immutable observation/import/reference with provenance. It does not directly mutate core truth and does not become a decision without the appropriate internal or external authority. Provider-specific response fields are forbidden in core domain entities. A new provider normally adds an adapter, mapping and contract tests; it must not require a destructive core migration.

## K. Daan Verification Architecture Decisions

- The official electricity TKV is ENVAL's primary operational verification-architecture source; ENVAL implements no competing verification framework.
- External professionals retain risk judgment, materiality judgment, official sample selection, official location control, verification-statement issuance, official fraud reporting, and REV management of the verification result.
- Preparatory internal support checks are allowed under the module and hard boundaries above, may be manual/random/risk-based/verifier-request selected, and must be audit-worthy and historized.
- Internal capabilities are built only in separately approved bounded work packages; external APIs/registers are researched in parallel and later connected through ports/adapters.
- External provider data remains observed/external provenance and not automatic core truth.

Execution batches follow the canonical discipline in `docs/app/00_CANON.md`; target approval itself authorizes no code, schema, UI, Edge Function, remote, deployment, commit, or push action.

## Overall Architecture Verdict

Recommendation: HYBRID PARALLEL REBUILD.

Rationale:

- Current app primitives for customer/auth/document/audit/idempotency are valuable but not complete enough to approve as final target data model.
- Core IDV domains are absent or only partially represented: signed mandates, EAN/CAR ownership periods, kWh provenance, eligibility, booking, REV, verification, CAPA, finance, and year-end controls.
- Existing `app_customer_dossiers` mixes lifecycle meanings and should not become the final state source for all NEa domains.
- Legacy `dossier_*`, `dossier_sessions`, `api-dossier-*`, lead/contact/mail, legacy analysis, and legacy retention should be treated as migration/fallback/export source material only.
- Electricity TKV verification detail is mapped into modular boundaries. The architecture direction is approved as TARGET, while implementation, regulatory completeness, and external/legal dependencies remain separately gated.

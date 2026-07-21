# NEa MVP Plan

Status: PRELIMINARY DRAFT — AWAITING DAAN APPROVAL

This document is a PRELIMINARY DRAFT and must not be used as implementation permission or a final implementation order.

Regulatory status remains: PARTIAL — ELECTRICITY TKV ACCESS AND CLAUSE COVERAGE PASS; CONSOLIDATED LAW, DEADLINE, RETENTION, REV, LEGAL, AND EXTERNAL-VERIFIER GAPS REMAIN.

This plan now sequences architecture and implementation as controlled batches. It does not drop database objects, edit SQL, change runtime code, create Edge Functions, approve production use, or claim compliance completeness.

## Operational Tracker Relationship

`docs/app/operations/nea-implementation-roadmap.md` is the compact daily sequence, progress, evidence, and blocker tracker. It is subordinate to this normative gate plan and cannot change requirements, architecture boundaries, MVP gates, or implementation/remote/deploy authority.

## Execution Batches

| batch | goal | primary docs | deletion/retirement gate | proof requirement | blocked by |
|---|---|---|---|---|---|
| 1. target foundation | Review or amend the proposed target contexts, table model, and rebuild recommendation. | `07_NEA_TARGET_ARCHITECTURE`, `architecture/database-target-model`, `decisions/architecture-and-environment-decisions`, `operations/remote-baseline-and-retirement`, `08_NEA_TRACEABILITY_MATRIX` | no drops; disposition only | explicit Daan architecture decision | explicit Daan approval; remaining legal/external decisions |
| 2. schema foundation | Create target schema for customer/case/audit/idempotency/role foundations only after approval. | schema docs and future migration plan | old app tables remain until migration proof | local reset, RLS, grants, schema proof | approved schema design |
| 3. migration/retirement | Remove locally safe dependency-free legacy objects and obsolete migrations in controlled phases. | `operations/remote-baseline-and-retirement` | data/export, caller, Storage, remote, reset gates | reset proof, diff proof, remote confirmation where needed | unknown remote/data presence |
| 4. identity/EAN/mandate | Build identity, legal entity, representative, EAN, ownership period, and signed mandate foundation. | requirements, target model | legacy sessions not removed until app auth + traffic proof | auth, role, mandate, EAN proofs | legal mandate wording, CAR/manual source |
| 5. evidence/MID | Extend evidence transport with acceptance decisions and concrete MID/conformity review. | document-upload, audit, target model | old document tables remain until evidence migration/export proof | confirmed upload not accepted evidence; immutable versions; decision audit | evidence acceptance standard |
| 6. kWh/provenance | Build raw import, source, normalized readings, transform, duplicate/backfeed exclusion. | target model, future metering contract | no booking until raw->normalized->decision proof passes | raw immutability, replay, dedupe, exclusion proof | provider/API/manual source contracts |
| 7. review/support-control/correction | After explicit GO, build operations review, four-eyes approvals, customer-safe status, historized internal support controls, and corrections/revisions. Keep internal support controls separate from external verifier location visits. | audit, dashboard lifecycle, target architecture, database target model | broad status models retired only after state split proof | distinct actor approval, support-control provenance/history, no-official-state-transition, correction preservation | explicit Daan GO; ops role model |
| 8. booking/REV | Build reproducible batch, ERE-E calculation runs, REV input/submission/response reconciliation. | target architecture, requirements | no REV runtime deletion until batch/reconciliation replacement exists | batch replay, calculation version, REV evidence proof | REV access/workflow |
| 9. verifier | After explicit GO, build engagement eligibility, scope, risk-input exchange, plan, visits, samples, evidence packs, findings/CAPA responses, external statement/result intake and restricted fraud-notification references. | requirements, regulatory audit, target architecture/model | no professional verifier judgment may be implemented as ENVAL logic | actor-boundary, provenance, immutability, no-self-verification, pack reconstruction, safe projection and retention proofs | explicit Daan GO; verifier/RvA/NEa/minister/REV dependencies; legal access/retention decisions |
| 10. finance | Build settlement ledger, customer entitlement, fee, reversal, clawback, payout controls. | product model, legal terms, target model | old reminder/payment assumptions retired after ledger proof | append-only ledger/reversal proof | fee/tax/payment provider decision |
| 11. year-end | Build year-end runbook, deadline monitoring, source review cadence, incidents, and category-specific retention drills. | operations docs, regulatory audit | no compliance-complete claim until remaining legal/external blockers are resolved | year-end drill, verification-retention/export replay, minimization boundary, incident drill | `REG-CONFLICT-001`; retention legal analysis; REV and verifier operations |

## Deletion / Retirement Gates

No database or runtime object may be dropped unless all applicable gates are green:

- target replacement exists and is locally proven;
- current callers are removed or redirected;
- local reset no longer recreates the retired object unintentionally;
- remote presence and remote migration status are confirmed;
- data presence is checked;
- export/retention/legal hold requirements are satisfied;
- Storage bucket/object dependencies are reconciled;
- tests/proofs no longer depend on the object;
- rollback/export strategy is documented;
- Daan explicitly authorizes the execution batch.

## MVP Definition

The MVP is not the old dossier wizard with new labels. The MVP is the smallest inboekdienstverlener workflow that can prove:

- ENVAL role and public claims are controlled;
- customer identity, representation, mandate, EAN, charger, MID, and evidence decisions are traceable;
- kWh source, raw data, normalized data, exclusions, and calculation inputs are reconstructable;
- internal eligibility/review/four-eyes decisions exist before booking;
- preparatory internal support controls may be manual, random, risk-based, or verifier-request selected, remain fully historized, and never replace the verifier's official location visit or professional decision;
- booking batch and REV input can be reproduced;
- verifier support and CAPA-response workflows preserve the external professional boundary and are proven before use;
- finance entries are append-only and reversible;
- customer projections are safe and do not expose raw audit or internal workpapers.

## Non-MVP Until Proven

- Keeping `dossier_*` or `api-dossier-*` for convenience.
- Treating `app_customer_dossiers.status` as universal lifecycle truth.
- Treating a confirmed upload as accepted evidence.
- Treating parser/precheck output as final verification.
- Treating public calculator output as ERE-E calculation or customer entitlement.
- Claiming verifier readiness merely because TKV source mapping is complete.
- Implementing the 2% verification-materiality threshold as automatic eligibility, evidence acceptance, dossier acceptance or booking logic.
- Letting ENVAL select the official sample, decide verifier risk/materiality, issue the official statement, self-mark an inboeking verified, or report a verifier fraud suspicion as if ENVAL were the verifier.
- Letting an internal support-control result automatically create `officially_verified`, `verification_statement_issued`, `materiality_accepted`, or a registered REV verification result.

## Local Gate 1 Proof

Gate 1 Local EAN And Connection Domain Foundation is locally proven on 2026-07-20 by `scripts/proofs/app-ean-connection-domain-foundation.proof.ts`.

The proof covers only the local schema foundation for `app_connections`, `app_connection_periods`, and `app_connection_ownership_periods`. It proves synthetic EAN syntax, customer/dossier/location boundary guards, temporal overlap guards, primary versus secondary allocation point distinction, declared/observed/verified claim lifecycle, history/supersede behavior, RLS deny-by-default, and no browser grants.

Gate 1 Connection Service Contract And Local Server-Side Write RPC is locally proven on 2026-07-20 by `scripts/proofs/app-connection-write-rpcs.proof.ts`.

The write proof covers service-role-only RPCs for connection declaration, ownership claim declaration, ownership claim decisions, and supersede-history corrections. It proves security-definer functions, safe `search_path`, service-role-only execution, scoped idempotency, minimized audit events, scope validation, allowed state transitions, history preservation, and cleanup.

It does not prove CAR access, REV field compatibility, legal mandate wording, customer-facing endpoints, operations review projection, eligibility decisions, remote deployment, or production compliance.

## Current Next Batch

Next local execution batch:

Gate 1 Connection Read Projection And Operations Review Contract.

Daan approved the internal phase on 2026-07-21 and permitted the documentation baseline commit. The baseline commit is the next executable action and is not performed in this documentation batch. After that baseline, this local/internal Gate 1 batch remains the next implementation candidate under the accepted package contract and proof gates. It must stay local until separately widened and does not authorize remote deployment, CAR integration, REV submission, verifier automation, or Wave 1 execution.

# ENVAL App TODO

Status: CURRENT app-only TODO.

This queue is only for the new `/app`, `api-app-*`, and `app_*` implementation. Removed legacy documentation and external historical copies do not drive new app implementation.

## Current / Locally Proven

- `/app` Vite rebuild foundation exists.
- Signup/intake frontend supports particulier, zakelijk, and VVE draft flows.
- Signup payload mapper supports particulier, zakelijk, and VVE.
- `api-app-signup-submit` write v3 is locally proven.
- App foundation schema is locally proven.
- Locations/chargers schema is locally proven.
- Document/legal slot schema is locally proven.
- App customer auth helper is locally proven.
- `api-app-auth-bootstrap` backend identity binding is locally proven.
- Document file/version schema is locally proven.
- `api-app-document-upload-url` is locally proven.
- `api-app-document-upload-confirm` is locally proven.
- Atomic confirm/reject RPCs are locally proven.
- PDF invoice parser adapter and local PDF preview exist for frontend-only preview.
- Modular frontend Auth/session layer is locally proven.
- `/account` supports account creation and login locally.
- Frontend session restoration and logout are locally proven.
- Frontend bootstrap API wiring to `api-app-auth-bootstrap` is locally proven.
- Dashboard route guard is locally proven.
- Auth/Supabase frontend code is lazy-loaded for `/account` and `/dashboard`.
- `api-app-dashboard-get` is locally proven.
- Dashboard read is account-neutral and supports multiple dossiers, locations, and chargers.
- Dashboard read returns customer-safe dossier, document-slot/current-document, and legal-acceptance projections.
- Successful dashboard reads perform zero database writes.
- Real dashboard frontend projection is locally proven.
- Selected dossier support is locally proven.
- Scoped memory cache and shared request deduplication are locally proven.
- First dashboard request race/abort behavior is fixed locally.
- Terminal bootstrap cleanup is locally proven.
- Portal navigation split is locally proven.
- Shared button pointer/disabled/pressed interaction is locally proven.
- Shared frontend document-upload transport is locally proven.
- Document upload hash-once issue/upload/confirm flow is locally proven.
- Explicit upload-url and upload-confirm idempotency attempt keys are locally proven.
- Official signed upload through Supabase Storage is locally proven in the frontend proof.
- Reusable `DocumentUploadCard` is locally and browser-proven.
- MID PDF upload is locally and browser-proven.
- Installation/acquisition invoice PDF upload and replacement are locally and browser-proven.
- Current-document download is locally and browser-proven.
- Audit-preserving current-document withdrawal is locally and browser-proven.
- Document aggregate status semantics are locally and browser-proven.
- Browser-reachable local download origin correction is locally and browser-proven.
- Shared dashboard document card UI is locally and browser-proven.
- Target intake verification/promotion contract is documented as TARGET / NOT IMPLEMENTED.
- Gate 1 EAN and electricity connection domain schema is locally proven:
  - `app_connections`
  - `app_connection_periods`
  - `app_connection_ownership_periods`
  - proof marker: `app-ean-connection-domain-foundation-proof-ok`.
- Gate 1 connection write RPC boundary is locally proven:
  - `app_declare_connection_v1`
  - `app_declare_connection_ownership_v1`
  - `app_decide_connection_ownership_v1`
  - `app_supersede_connection_ownership_v1`
  - proof marker: `app-connection-write-rpcs-proof-ok`.

Local proof is not production proof. Remote migration/function deploy, production bucket/policy proof, and production browser QA remain open.

## P0

- Current code/database/Edge Function assessment against validated NEa requirements:
  - DONE on 2026-07-19 as PROOF ONLY in `docs/app/06B_CURRENT_IMPLEMENTATION_ASSESSMENT.md`.
  - Treat `docs/app/07_NEA_TARGET_ARCHITECTURE.md` and `docs/app/09_NEA_MVP_PLAN.md` as PRELIMINARY DRAFT / NOT APPROVED after this assessment.
  - `SRC-NEA-TKV` access and clause mapping are DONE: the verified official repository snapshot contains 10 pages, 832788 bytes, SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`, and all 19 present clauses are mapped; there is no 3.3.5.
  - Remaining PARTIAL status concerns separate consolidated-law, deadline, retention, REV, legal, architecture-approval, and external-verifier gaps.
- Target architecture and rebuild/migration decision:
  - DONE on 2026-07-19 and consolidated on 2026-07-21 into `docs/app/07_NEA_TARGET_ARCHITECTURE.md`, `docs/app/architecture/database-target-model.md`, `docs/app/decisions/architecture-and-environment-decisions.md`, and `docs/app/operations/remote-baseline-and-retirement.md`.
  - Overall recommendation: HYBRID PARALLEL REBUILD.
  - Electricity-TKV verifier detail is mapped and no longer source-blocked. The architecture remains DRAFT — AWAITING DAAN APPROVAL and implementation remains NO-GO.
  - Target-only internal support controls are separated from external verifier location visits; neither is implementation permission.
- Database Retirement Phase 1A - Evidence Completion:
  - DONE on 2026-07-19; unique operational content is consolidated in `docs/app/operations/remote-baseline-and-retirement.md`.
  - Local DB contains 15 `app_*` public tables, zero local legacy tables, substantial app data, and 7 `app-documents` Storage objects.
  - Local migration history is incomplete: `supabase_migrations.schema_migrations` exists but has zero rows.
  - Legacy runtime/repository objects remain present and remote status remains UNKNOWN.
- Remote Schema and Deployment Inventory:
  - DONE on 2026-07-19; dated evidence is consolidated as PROOF ONLY in `docs/app/proofs/remote-baseline-and-recovery-gate.md`.
  - Linked remote `yzngrurkpfuqgexbhzgl` contains legacy schema, legacy Storage, active cron jobs, and deployed legacy/fallback Edge Functions.
  - Linked remote does not contain the local app schema, `app-documents` bucket, app SQL RPCs, or deployed `api-app-*` functions.
  - No deletion candidate is safe from this batch.
- Environment / Deployment Baseline Decision:
  - Strategy selected on 2026-07-19 and recorded in `docs/app/decisions/architecture-and-environment-decisions.md`; execution remains not permitted.
  - Daan selected in-place parallel rebuild in the existing `enval` project because a separate Supabase app project is not feasible under the current project quota.
  - `docs/app/operations/remote-baseline-and-retirement.md` records the same-project baseline execution plan without execution permission.
  - Phase 0 proof DONE on 2026-07-19 and consolidated in `docs/app/proofs/remote-baseline-and-recovery-gate.md`.
  - Remote app collision count is 0; clean and legacy-shape shadow apply proofs are green.
  - Recovery gate DONE on 2026-07-19 and consolidated in `docs/app/proofs/remote-baseline-and-recovery-gate.md`.
  - Wave 1 proposals are reviewed and approved as migration candidates after minor grant revision, but remote execution is not approved.
  - Terminal-first blocker follow-up DONE on 2026-07-20: CLI backup metadata shows `backups=[]` and `pitr_enabled=false`; Daan accepted no Pro upgrade, no managed scheduled backups, no PITR, and no restore-to-new-project as an operational risk.
  - PostgREST functional request path is PARTIAL PROVEN: current remote public keys reach table routes and receive expected access denial or app-table route-not-found.
  - PostgREST dashboard/platform health remains UNHEALTHY / UNRESOLVED from current dashboard evidence; classification is `B. POSTGREST DEGRADED BUT REQUEST PATH AVAILABLE`.
  - Phase 0 regression rerun is green after local Docker availability was restored.
  - Encrypted backup and restoreproof DONE on 2026-07-20:
    - age recipient and identity are configured outside the repo;
    - encrypted public logical DB backup exists outside the repo;
    - Storage/Auth/Edge Function/cron recovery manifests exist outside the repo;
    - isolated local restore dry-run passed;
    - plaintext temp files and restore database were cleaned up.
  - Remote Wave 1 remains blocked on PostgREST dashboard/platform health.
  - Gate 1 Local EAN And Connection Domain Foundation DONE locally on 2026-07-20.
  - Gate 1 Connection Service Contract And Local Server-Side Write RPC DONE locally on 2026-07-20.
  - NEXT: Gate 1 Connection Read Projection And Operations Review Contract.
  - Do not start deployment, database drops, migration squash/baseline, runtime removals, function deletion, cron changes, Storage cleanup, Auth mutation, or remote SQL until recovery readiness is proven and Daan approves the exact mutation batch.
- Exact 10% result/fee contract:
  - result definition
  - fee trigger
  - gross/net basis
  - VAT/tax wording
  - partial success
  - reversal, audit correction, and clawback
- Password recovery UX.
- Resend verification UX.
- Production secrets, storage, function, and migration deployment proof.
- Production Auth configuration and remote auth proof.
- Account-specific document contracts:
  - particulier
  - zakelijk
  - VVE
- KVK and signing-authority evidence.
- VVE mandate and board-authority evidence.
- Verifier/inboeking integration boundary.
- Rotate any previously exposed token/key-like value before production or deploy use.

## P1

- Define intake/quarantine schema and expiry boundary.
- Define pre-auth capability and anti-abuse contract.
- Define atomic email-verification promotion RPC/endpoint.
- Define initial intake/submission snapshot schema.
- Define server-derived section capabilities.
- Build public Start dossier quarantine flow.
- Build verification-link promotion flow.
- Build targeted charger/location correction forms using shared signup form modules.
- Reuse parser/precheck for authenticated document corrections.
- Build Correcties indienen revision flow.
- Define review email notification contract.
- Define kWh periodic lifecycle.
- Define consent renewal/version-expiry lifecycle.
- Zakelijke/VvE document requirements.
- Business and VVE upload slots.
- Business and VVE dashboard detail pages.
- Password recovery and resend verification.
- Unsupported dashboard domains.
- Result/inboeking lifecycle.
- Fee/payout lifecycle.
- Customer-readable timeline projection.
- Browser QA for signup submit, upload, dashboard, auth, and document state.
- Legal text version/hash/language hardening.
- Customer request/response model for missing information.
- Yearly kWh input/readout contract.

## P2

- Content/article migration into the new app content model.
- NL/EN language structure.
- Legacy documentation removal: DONE on 2026-07-19 after external copy by Daan.
- Legacy function retirement plan after `/app` production replacement is proven.
- Internal ENVAL review/admin tooling.
- Image OCR worker/internal analysis lane.

## Boundaries

- Do not mark the complete inboekservice live or finished.
- Do not use legacy `api-dossier-*` for new app behavior.
- Do not use legacy `dossier_sessions` as app auth.
- Do not treat a particulier-only mock as a global account-type rule.
- Do not expose raw audit rows directly to customers.

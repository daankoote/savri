# ENVAL App Change Log

Status: CURRENT append-only changelog for the new `/app`, `api-app-*`, and `app_*` product generation.

Rule: append only for new decisions. The former legacy documentation changelog was externally copied by Daan before the in-repo legacy documentation tree was removed.

## 2026-07-04 — Start isolated ENVAL Vite rebuild

Commit: `4d98c00 Start isolated ENVAL Vite rebuild`

- Created the isolated `/app` Vite rebuild surface.
- Kept root/static Netlify production untouched.
- Established `/app` as the new frontend development surface.
- Established port `5175` as the standard local Vite dev port.

## 2026-07-06 — Build signup intake skeleton

Commit: `7de83d1 Build ENVAL signup intake skeleton`

- Added `/aanmelden` frontend intake skeleton.
- Modeled particulier, zakelijk, and VVE draft paths.
- Added multiple locations for zakelijk/VVE.
- Added unlimited chargers through stable client IDs.
- Kept the flow frontend-only at this stage.

## 2026-07-06 — Add client-first signup address lookup and validation

Commit: `3f29fcb Add client-first signup address lookup and validation`

- Added client-first address lookup and field validation.
- Kept address lookup frontend-first and read-only.
- Kept backend source-of-truth doctrine intact.

## 2026-07-06 — Add mock customer dashboard shell

Commit: `7c81b56 Add mock customer dashboard shell`

- Added mock/read-only dashboard shell.
- Kept dashboard frontend-only with no auth, backend calls, storage, or persistence.
- Business and VVE dashboard details remained deferred.

## 2026-07-07 — Add app foundation schema migration

Commit: `05aab6b Add app foundation schema migration`

- Added app customer, identity, dossier, audit, intake-audit, and idempotency foundations.
- Account type foundation includes `particulier`, `zakelijk`, and `vve`.
- Local isolated apply proof exists; full local reset remains blocked by legacy non-baseline migrations.

## 2026-07-08 — Add app signup submit write v3

Commit: `2c6de76 Add app signup submit write v3`

- `api-app-signup-submit` write v3 creates customer/identity/dossier shell.
- Writes locations, chargers, expected document slots, and legal acceptances.
- Uses app audit and app idempotency.
- Locally proven with idempotency replay/conflict behavior.
- Does not upload documents, create storage objects, bootstrap dashboard auth, or create result/fee lifecycle rows.

## 2026-07-09 — Fix app signup submit env resolution

Commit: `beffb34 Fix app signup submit env resolution`

- Fixed Vite env resolution for local `/aanmelden` submit.
- Local browser QA later proved `/aanmelden` submit stayed on-page and showed a dossier ID.
- No dashboard redirect or upload flow was implemented.

## 2026-07-09 — Document app signup browser QA proof

Commit: `9a35cc4 Document app signup browser QA proof`

- Recorded local browser QA for `/aanmelden` submit.
- Proof was local-only, not production deployment proof.

## 2026-07-10 — Add app PDF invoice parser adapter proof

Commit: `997723d Add app PDF invoice parser adapter proof`

- Added `/app` PDF invoice parser adapter proof for text-based PDFs.
- Kept parsing frontend/client-side and preview-only.
- No upload processing or backend verification was claimed.

## 2026-07-10 — Add local PDF invoice preview

Commit: `bb17391 Add local PDF invoice preview`

- Wired local PDF preview into signup invoice slots.
- Preview shows safe summary only.
- No upload, backend mutation, or document acceptance was implemented.

## 2026-07-11 — Add app document file version schema

Commit: `b9359c9 Add app document file version schema`

- Added `app_dossier_document_files`.
- Added `app_dossier_document_versions`.
- Added current-version fields to document slots.
- Preserved immutable/versioned evidence model.

## 2026-07-11 — Add app customer auth foundation

Commit: `aa13736 Add app customer auth foundation`

- Added app customer auth helper.
- Uses Supabase Auth JWT validation.
- Resolves active app customer identity, customer, and dossier ownership.
- Does not reuse legacy `dossier_sessions`.

## 2026-07-11 — Add app document upload URL endpoint

Commit: `a17dfa6 Add app document upload URL endpoint`

- Added `api-app-document-upload-url`.
- Issues server-generated private upload targets.
- Creates `app_dossier_document_files` rows with `issued` status.
- Uses app auth, dossier/slot authorization, app idempotency, and app audit.
- Local proof only; no production deploy proof.

## 2026-07-12 — Document app upload backend proof

Commit: `adedd8f Document app upload backend proof`

- Documented locally proven app upload backend.
- Covers upload-url, upload-confirm, atomic confirm/reject RPCs, replacement, idempotency, audit, and local gateway proof.
- Boundaries remain open: frontend upload wiring, customer auth bootstrap/login, production bucket/policy/deploy proof, browser QA.

## 2026-07-12 — Separate app canon from legacy ENVAL docs

Commit: this documentation migration commit.

- Establishes `docs/app/` as the sole CURRENT product and implementation canon.
- Moved root/static docs into the former in-repo legacy documentation tree.
- Moved unsafe/outdated tooling notes into the former in-repo legacy documentation tree.
- Adapts high-value legacy Edge, audit, and ops lessons into app-specific docs.
- Keeps old neutral-infrastructure, external-inboeker, max-4, and fixed export-fee assumptions as historical only.

## 2026-07-12 — Normalize current app implementation status

Commit: this documentation-only status normalization commit.

- Normalizes current implementation-status statements inside `docs/app/**` after the canon migration.
- Confirms current local proof boundaries for signup submit write v3, frontend submit wiring, app auth helper, document upload URL, and document upload confirm.
- Keeps open boundaries explicit: customer Auth/bootstrap, dashboard read projection, frontend upload wiring, production storage/policy/deploy proof, and full inboeking/result/fee lifecycle.
- No runtime changes.
- No new proof.
- Legacy docs remained untouched.

## 2026-07-13 — App customer Auth bootstrap locally proven and committed

Commit: `5926759 Add app customer auth bootstrap`

- Added verified Supabase Auth helper support for app customer bootstrap.
- Added `api-app-auth-bootstrap`.
- Added atomic identity binding RPC for existing pre-auth app customer identities.
- Bootstrap returns account-neutral accessible dossier summaries for particulier, zakelijk, and VVE.
- Idempotency replay/conflict and same-key/different-key concurrency were locally proven.
- Existing upload-url and upload-confirm Auth regressions were locally proven after binding.
- Proof is local-only; no production deploy or remote migration apply is claimed.
- Frontend Auth/session/dashboard route guard and dashboard read wiring remain OPEN.

## 2026-07-13 — Lean frontend Auth/session flow locally proven and committed

Commit: `e500835 Add lean frontend auth session flow`

- Added local `/account` account creation and login flow.
- Wired frontend bootstrap to `api-app-auth-bootstrap`.
- Locally proved session restoration, logout, dashboard guard, and safe Auth error behavior.
- Kept Auth account-type neutral for particulier, zakelijk, and VVE.
- Lazy-loaded Auth/Supabase code for authenticated routes; public pages do not eagerly load it.
- Browser proof is local-only; no production deploy proof is claimed.
- Dashboard data remains mock/read-only; real dashboard read projection remains OPEN.

## 2026-07-13 — Remaining frontend Auth documentation drift closed

Commit: this documentation-only drift correction commit.

- Corrected stale schema and contract wording around frontend Auth/session proof.
- No runtime changes.
- Next step remains `api-app-dashboard-get`.

## 2026-07-13 — Customer-safe dashboard read locally proven and committed

Commit: `5cce922 Add customer-safe app dashboard read`

- Added `api-app-dashboard-get` as the locally proven authenticated dashboard read endpoint.
- Enforces customer auth and independent dossier ownership checks.
- Supports particulier, zakelijk, VVE, multiple dossiers, and multiple locations.
- Uses bounded no-N+1 reads.
- Performs zero successful-read database writes.
- Returns a customer-safe projection and excludes sensitive data, storage data, hashes, raw audit, and idempotency rows.
- Frontend dashboard data remains mock/read-only until a frontend client wires the endpoint.
- Proof is local-only; no production deploy proof is claimed.

## 2026-07-14 — Real customer dashboard projection and Auth cleanup locally proven

Commit: `8ea8086 Wire real customer dashboard projection`

- Wired the real endpoint-backed dashboard frontend projection.
- Removed hardcoded mock charger rows from the active dashboard path.
- Added terminal Auth session cleanup for unusable ENVAL binding failures.
- Fixed the first dashboard request abort behavior.
- Kept dashboard cache memory-only and scoped by Auth user, customer, and dossier.
- Clears dashboard cache on explicit logout.
- Split public and portal navigation: public entry is `Inloggen`, portal includes `Naar website`.
- Added shared global button pointer, disabled, and pressed-state interaction.
- Proof is local-only; no production deploy proof is claimed.
- Next step is the shared document upload client.

## 2026-07-14 — Shared document upload client locally proven and committed

Commit: `97dc1a8 Add shared document upload client`

- Added shared account-neutral frontend document upload transport.
- Uses one hash per logical run.
- Implements upload-url -> signed upload -> confirm.
- Uses explicit logical-attempt idempotency keys for issue and confirm.
- Returns safe stage-specific errors.
- Does not automatically retry, persist upload state, or wire UI.
- Next step is the authenticated PDF installation-invoice slot.

## 2026-07-16 — Customer document lifecycle and reusable cards locally proven

Backend commit: `5f824e8 Add customer document lifecycle endpoints`
Frontend commit: `2ea1f7c Add reusable customer document cards`

- Added the current customer document lifecycle endpoints for download and audit-preserving withdrawal.
- Proved MID and installation/acquisition invoice PDF upload through the authenticated dashboard module.
- Proved immutable replacement: a new current version supersedes the prior version without deleting evidence.
- Proved current-document download with short-lived signed URLs and browser-reachable local origin handling.
- Proved withdrawal: current version becomes withdrawn, slot pointers clear, immutable file/version evidence remains, and locked dossiers reject safely.
- Replaced inline dashboard document cards with a reusable account-neutral document card.
- Centralized document status aggregation so uploaded/in-review evidence stays orange and all required evidence must be explicitly accepted before aggregate green.
- Browser QA was green for card layout, auto-upload, aggregate status, download, withdrawal, duplicate heading removal, and divider removal.
- Proof remains local-only; no production deploy, remote migration apply, or production storage proof is claimed.
- Next step is the customer dossier draft -> submit -> lock -> targeted unlock contract.

## 2026-07-16 — Pre-auth quarantine and verification-promotion target defined

Commit: this documentation-only contract commit.

- Defined `Start dossier` as the one normal full customer submission.
- Documented that documents may be client-parsed before verification.
- Documented that client parser/precheck may warn, block locally, and prefill, but may not approve evidence.
- Defined a target private pre-auth quarantine lane separate from authenticated `api-app-document-*` endpoints.
- Documented email verification as identity/email control plus server-side promotion, not a second full customer confirmation.
- Defined complete-intake promotion to submitted/under-review dashboard state.
- Defined customer-action promotion with only targeted sections editable and `Correcties indienen` as the correction action.
- Clarified that valid sections remain fixed and status lights are separate from mutation capability.
- Status: TARGET / NOT IMPLEMENTED; no runtime, schema, migration, or production behavior is claimed.

## 2026-07-19 - Consolidate selected legacy claims into active docs

- Consolidated the product role wording toward ERE-E inboekdienstverlener while keeping REV/listing/inboeking execution as UNKNOWN or TARGET until proven.
- Migrated only app-relevant legacy principles: audit-first, immutable history, confirmed upload is not accepted evidence, derived data does not mutate core truth, request/actor traceability, idempotency, minimum privileges, service-role server boundary, explicit dependencies, and gateway-versus-function reject separation.
- Excluded old strategic assumptions, old pricing/export-fee models, old branch claims, old static-site architecture, old `api-dossier-*` architecture as current truth, old token/session contracts, old status models, and old parser/OCR direction.
- No legacy documents were deleted.
- No full NEa Compliance Directive or new target architecture was written.
- No implementation claim was added from legacy text alone.
- Next step: legacy deletion batch plus NEa canon foundation.

## 2026-07-19 - Remove legacy documentation tree

- Removed the full in-repo legacy documentation tree after Daan copied it outside the repo.
- Removed the app legacy migration matrix because all relevant claims had already been migrated, marked already present, or consciously excluded in the migration audit.
- The external historical copy is not source of truth.
- No code, schema, migrations, Edge Functions, tests, config, UI, or runtime behavior changed.
- Next step: NEa compliance foundation.

## 2026-07-19 - Create NEa compliance foundation

- Added the first NEa compliance foundation for ENVAL as ERE-E inboekdienstverlener:
  - `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md`
  - `docs/app/06_NEA_REQUIREMENTS.md`
  - `docs/app/07_NEA_TARGET_ARCHITECTURE.md`
  - `docs/app/08_NEA_TRACEABILITY_MATRIX.md`
  - `docs/app/09_NEA_MVP_PLAN.md`
- Established official law and NEa publications as higher than internal docs.
- Added stable NEA requirement IDs and a traceability matrix.
- Kept target architecture and MVP plan as TARGET, not implementation proof.
- No code, schema, migrations, Edge Functions, tests, config, UI, or runtime behavior changed.
- Next step: Gate 0 implementation batch for source review, public-claim controls, AO/IB outline, and requirement/traceability consistency checks.

## 2026-07-19 - Correct NEa foundation and run regulatory completeness audit

- Corrected the NEa foundation order: legacy absence, ENVAL as inboekdienstverlener, official regulatory completeness, then current implementation assessment, then architecture/plan approval.
- Added `docs/app/06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md` as PROOF ONLY.
- Added explicit role wording: ENVAL is a inboekdienstverlener for ERE-E.
- Marked the target architecture and MVP plan as PRELIMINARY DRAFT / NOT APPROVED.
- Marked traceability implementation columns as provisional until direct code/database/Edge Function/test assessment.
- Added and reclassified requirements based on official source coverage; internal controls remain internal controls, not direct statutory claims.
- Recorded the 2026-07-09 electricity toetsingskader as a source-access blocker.
- No code, database, schema, migrations, Edge Functions, tests, config, UI, or runtime behavior changed.
- Next step: Current code/database/Edge Function assessment against validated NEa requirements.

## 2026-07-19 - Run current implementation assessment against NEa requirements

- Added `docs/app/06B_CURRENT_IMPLEMENTATION_ASSESSMENT.md` as PROOF ONLY.
- Assessed current frontend, app Edge Functions, legacy/runtime functions, database migrations, shared helpers, tests, and proofs against `docs/app/06_NEA_REQUIREMENTS.md`.
- Kept regulatory completeness status as `PARTIAL — SOURCE ACCESS BLOCKED`.
- Kept target architecture and MVP plan unapproved.
- Identified `REG-CONFLICT-001`: NEa electricity guidance references a 1 April verification statement/year-end deadline while NEa verifier guidance references REV result registration before 1 May.
- Updated `NEA-VER-002` to keep both deadline concepts visible until confirmed.
- No code, database, schema, migrations, Edge Functions, tests, config, UI, Storage, commit, or push changed.
- Next step: target architecture and rebuild/migration decision after TKV access and this assessment are reviewed.

## 2026-07-19 - Target architecture and retirement decision batch

- Herwerkte `docs/app/07_NEA_TARGET_ARCHITECTURE.md` as PRELIMINARY DRAFT / NOT APPROVED.
- Added the provisional target table model, now consolidated at `docs/app/architecture/database-target-model.md`.
- Added database/runtime retirement planning, now consolidated at `docs/app/operations/remote-baseline-and-retirement.md`.
- Added the HYBRID PARALLEL REBUILD decision, now consolidated at `docs/app/decisions/architecture-and-environment-decisions.md`.
- Updated the traceability matrix with provisional target component/table mappings.
- Rewrote the MVP plan as architecture batches with explicit deletion/retirement gates.
- Recorded Daan's retirement authorization principle: objects without a necessary target role may be removed in later execution batches after caller, data, Storage, local reset, remote, proof, and rollback gates are satisfied.
- No runtime implementation, database drop, SQL migration change, Edge Function change, Storage change, test/proof change, commit, or push was performed.
- Regulatory blocker remains: the 2026-07-09 electricity verification toetsingskader is still not fully mapped.
- Next step: Database Retirement Phase 1 - locally safe, dependency-free legacy objects and obsolete migrations.

## 2026-07-19 - Database Retirement Phase 1A evidence completion

- Rechecked Docker/Supabase locally in read-only mode.
- Confirmed local Supabase is reachable; stopped services were `supabase_imgproxy_enval`, `supabase_edge_runtime_enval`, and `supabase_pooler_enval`.
- Confirmed the local `public` schema contains only 15 `app_*` tables and no local legacy `dossier_*` or related legacy tables.
- Confirmed the current app tables contain substantial local data and the three quarantine tables exist locally but are empty.
- Confirmed local `app-documents` Storage contains 7 objects and is protected.
- Completed read-only FK, view, function, pg_cron, Storage, and migration-history checks.
- Confirmed `supabase_migrations.schema_migrations` exists locally but contains zero rows; migration-history proof is therefore incomplete.
- Corrected the retirement plan so local DB absence, repository/runtime presence, and remote unknown status are separated.
- Added Phase 1A execution evidence, now consolidated at `docs/app/operations/remote-baseline-and-retirement.md`.
- No runtime, schema, migration, database data, Storage, Edge Function, proof/test, config, package, commit, or push mutation was performed.
- Next step: Remote Schema and Deployment Inventory.

## 2026-07-19 - Remote schema and deployment inventory

- Ran a read-only remote inventory against linked Supabase project `enval` (`yzngrurkpfuqgexbhzgl`).
- Confirmed remote migration history contains the first 10 legacy migrations and none of the local app migrations.
- Confirmed remote `public` contains legacy tables, legacy RPCs, active cron jobs, and legacy Storage, while app tables/RPCs and `app-documents` are not present.
- Confirmed remote Edge Functions contain deployed legacy/fallback functions and workers, with zero deployed `api-app-*` functions.
- Confirmed no first deletion batch is safe yet because remote legacy runtime/data/callers remain active or externally unknown.
- No remote mutation, deploy, migration repair, migration apply, db push, db pull, Storage mutation, function delete, code/schema/runtime change, commit, or push was performed.
- Next step: Remote Environment Classification And App Deployment Baseline Decision.

## 2026-07-19 - Remote environment and app baseline decision

- Normalized the Supabase project name from the former dashboard name `Savri` to `enval`.
- Confirmed projectref `yzngrurkpfuqgexbhzgl` stayed unchanged.
- Classified the current linked remote as legacy production runtime with public traffic proof still required before any retirement action.
- Added the remote environment/baseline decision, now consolidated at `docs/app/decisions/architecture-and-environment-decisions.md`.
- Compared deployment options A/B/C and recommended a staging-first clean app project path instead of deploying app migrations into the current legacy production project by default.
- Classified all eight local app migrations and all seven `api-app-*` functions for baseline readiness.
- No runtime, database, SQL, migration, Edge Function, Auth, Storage, cron, project setting, deployment, commit, or push change was performed.
- Next step: Daan decision on the Environment / Deployment Baseline Decision.

## 2026-07-19 - In-place app baseline preparation

- Recorded Daan's decision that a separate Supabase app project is not feasible now because of project quota.
- Approved `IN-PLACE PARALLEL REBUILD` in the existing `enval` project (`yzngrurkpfuqgexbhzgl`) as TARGET, execution not started.
- Added the in-place baseline plan, now consolidated at `docs/app/operations/remote-baseline-and-retirement.md`.
- Updated the remote environment decision and retirement plan so current remote legacy production remains active and untouched.
- Recorded that no technical legacy rename or legacy delete happens before app cutover.
- Classified existing app migrations for controlled same-project baseline handling; none are approved for verbatim remote execution in this batch.
- No remote mutation, deploy, migration apply, migration repair, database push, SQL execution, Auth mutation, Storage mutation, cron change, project setting change, code change, existing migration edit, commit, or push was performed.
- Next step: In-Place Baseline Phase 0 - Backup, Collision And Migration Dry-Run Proof.

## 2026-07-19 - In-place baseline Phase 0 proof

- Ran Phase 0 proof for the approved same-project parallel rebuild.
- Added Phase 0 proof, now consolidated at `docs/app/proofs/remote-baseline-and-recovery-gate.md`.
- Added Wave 1 proposal SQL under `supabase/baseline-proposals/wave-1/`; these files are not active migrations.
- Added non-mutating Phase 0 proof tooling under `scripts/proofs/`.
- Remote collision result: zero `app_*` objects, zero `api-app-*` functions, and no `app-documents` bucket.
- Backup/recovery result: project health, database size, Storage objectcount, Auth usercount, functions, cron, and migrations are proven; Supabase plan, automatic backup status, PITR status, latest backup date, and restore procedure remain dashboard/approval blocked.
- Clean shadow apply and legacy-shape shadow apply both passed locally; temporary shadow databases were cleaned up.
- No remote mutation, deploy, migration apply, migration repair, database push, SQL mutation, Auth mutation, Storage mutation, cron change, legacy rename, legacy delete, commit, or push was performed.
- Next step: Review And Approve Wave 1 App Core Baseline.

## 2026-07-19 - Recovery and remote execution gate

- Ran the no-mutation recovery gate for the same-project app baseline.
- Added the recovery/remote execution gate, now consolidated at `docs/app/proofs/remote-baseline-and-recovery-gate.md`.
- Added read-only recovery health SQL tooling in `scripts/proofs/recovery-gate-remote-readonly.sql`.
- Recorded manual dashboard evidence: Last backup `No backups`; PostgREST `Unhealthy`; Database/Auth/Realtime/Storage/Edge Functions `Healthy`.
- Keyless REST probe returned HTTP 401 with missing API key, proving gateway/project reachability only.
- Database read-only health check passed with 14/60 connections and 0 waiting locks.
- Reviewed all five Wave 1 proposal files and narrowed service_role table grants from select/insert/update/delete to select/insert/update where appropriate.
- Added an emergency-only rollback proposal under `supabase/baseline-proposals/wave-1-rollback/`; it was not executed.
- Reran static proof, clean shadow apply, and legacy-shape shadow apply successfully after the proposal revision.
- Gate verdict: PARTIAL — MANUAL DASHBOARD/SUPPORT PROOF REQUIRED.
- No remote mutation, deploy, migration apply, migration repair, database push, Auth mutation, Storage mutation, cron change, backup restore, production export, legacy rename, legacy delete, commit, or push was performed.
- Next step: Resolve Supabase Backup/PostgREST Blocker.

## 2026-07-19 - Terminal-first PostgREST and recovery blocker resolution

- Added `scripts/proofs/postgrest-authorized-health.proof.mjs` for safe read-only PostgREST root probes with no key/body logging.
- Ran terminal-first authorized PostgREST health proof against project `yzngrurkpfuqgexbhzgl`.
- Result: HTTP `401` / `401` / `401` with request-id presence; verdict `POSTGREST AUTH CONFIG ERROR — BLOCKING`.
- Ran official CLI backup metadata check: `backups=[]`, `pitr_enabled=false`, `region=eu-west-2`, `walg_enabled=true`.
- Preserved dashboard evidence that latest backup is `No backups`.
- Recorded logical-backup fallback as blocked until PostgREST is green and encrypted backup/manifest plus local restore dry-run is executed.
- Added browsercheck policy: browser QA is required for visible/customer-facing/browser-session work, not for terminal-proven non-visible backend inventory/proposal batches.
- Gate verdict updated to `NO-GO — POSTGREST UNHEALTHY`.
- No remote mutation, deploy, migration apply, migration repair, database push, Auth mutation, Storage mutation, cron change, backup restore, production export, plan change, legacy rename, legacy delete, commit, or push was performed.
- Next step: Resolve PostgREST Service Incident.

## 2026-07-20 - Resolve PostgREST auth blocker and record no-Pro recovery decision

Correction status: HISTORICAL / SUPERSEDED IN PART by the later `2026-07-20 - Recovery encryption recipient and PostgREST diagnostic closure correction` entry. The terminal request-path evidence remains useful, but the broad `POSTGREST HEALTHY` platform-health conclusion is no longer current while the dashboard still reports PostgREST `Unhealthy`.

- Recorded Daan's owner decision: no Supabase Pro upgrade, no managed scheduled backups, no PITR, and no restore-to-new-project for project `yzngrurkpfuqgexbhzgl`.
- Recorded that this is an accepted operational risk and requires no further dashboard or Support confirmation.
- Kept the recovery control strict: encrypted logical backup, manifests, hashes, and isolated local restore dry-run are mandatory before every future remote mutation.
- Expanded `scripts/proofs/postgrest-authorized-health.proof.mjs` to inventory key sources, redact key values, fingerprint keys, skip service/secret keys for public probes, and run separate safe request variants.
- PostgREST root cause: `EXPECTED RLS/PERMISSION DENIAL — SERVICE HEALTHY`.
- PostgREST final verdict: `POSTGREST HEALTHY — EXPECTED ACCESS DENIAL PROVEN`.
- Noted stale/unknown local app publishable key fingerprint as local config evidence; no tracked runtime config was changed.
- Re-ran Phase 0 regression locally after Docker was available: static PASS, clean shadow PASS, legacy-shape shadow PASS, cleanup PASS, temporary databases 0, collision count 0, legacy reference count 0, destructive statement count 0.
- Gate verdict updated to `GO FOR ENCRYPTED PRE-MUTATION BACKUP AND RESTORE DRY-RUN`.
- No remote mutation, deploy, migration apply, migration repair, database push, Auth mutation, Storage mutation, cron change, backup restore, production export, plan upgrade, legacy rename, legacy delete, commit, or push was performed.
- Next step: Execute Encrypted Pre-Mutation Backup, Manifest And Local Restore Dry-Run.

## 2026-07-20 - Encrypted backup attempt blocked before dump

Correction status: HISTORICAL / NEXT STEP SUPERSEDED by the later recipient-diagnostic correction entry. The current exact next batch is `Install Or Configure Recoverable Encryption Recipient`.

- Started the encrypted pre-mutation backup gate in recovery/read-only mode.
- Confirmed repo, branch, HEAD, linked projectref, Docker/local Supabase health, tool availability, ignore rules, and existing proof tooling.
- Confirmed `pg_dump`, `pg_restore`, `psql`, `supabase`, `gpg`, `openssl`, `sha256sum`, and `shasum` are available; `age` is not installed.
- Checked the local GPG keyring and found no usable existing recipient key.
- Stopped before any database dump because there was no safe recoverable encryption recipient.
- Created no backup directory, no plaintext dump, no encrypted artifact, no Storage copy, no manifests with production metadata, and no restore database.
- No remote mutation, deploy, migration apply, migration repair, database push, Auth mutation, Storage mutation, cron change, backup restore, production export, plan upgrade, legacy rename, legacy delete, commit, or push was performed.
- Next step: Prepare Recovery Encryption Key And Re-run Encrypted Pre-Mutation Backup.

## 2026-07-20 - Recovery encryption recipient and PostgREST diagnostic closure correction

- Rechecked the recovery encryption boundary without creating a backup, dump, manifest, encrypted artifact, or restore database.
- Confirmed `age` and `age-keygen` are unavailable locally.
- Confirmed GPG is installed, but no existing public or secret recipient key is available; no private key material or passphrase was printed or stored.
- Did not run an encrypt/decrypt recovery test because no recoverable recipient exists.
- Reran the existing terminal-first PostgREST proof: current remote public keys reach table routes and return expected app-table route-not-found or RLS/permission denial with request-id presence.
- Corrected the diagnostic status: functional request path is `PARTIAL PROVEN`, but dashboard/platform PostgREST health remains `UNHEALTHY / UNRESOLVED`.
- Set the classification to `B. POSTGREST DEGRADED BUT REQUEST PATH AVAILABLE`.
- Kept Wave 1 as `NO-GO`; the request-path proof does not supersede current dashboard platform-health evidence.
- No remote SQL mutation, deploy, migration apply, migration repair, database push, Auth mutation, Storage mutation, cron change, project setting mutation, backup restore, production export, plan upgrade, support ticket, legacy rename, legacy delete, commit, or push was performed.
- Next step: Install Or Configure Recoverable Encryption Recipient.

## 2026-07-20 - Encrypted pre-mutation backup and isolated local restore proof

- Installed local `age` v1.3.1 with Homebrew for recovery encryption.
- Created a recoverable age identity/recipient outside the repo under `/Users/daankoote/.config/enval-recovery`; private key material was not copied into docs.
- Ran a non-sensitive age encrypt/decrypt roundtrip test successfully.
- Created recovery root outside the repo: `/Users/daankoote/ENVAL_RECOVERY/20260720T040011Z_yzngrurkpfuqgexbhzgl_f24b902`.
- Created encrypted public DB artifacts:
  - `remote_schema.age`
  - `remote_data.age`
  - `remote_roles.age`
- Captured safe recovery manifests for row counts, object counts, Storage metadata, Auth counts/provider categories, Edge Function metadata, cron schedules/command hashes, and migration history.
- Kept Auth user rows/details, Storage object bytes, Edge Function secrets/source, cron command bodies, and platform-owned schemas outside the portable DB backup.
- Restored the encrypted public schema/data backup into isolated local database `enval_recovery_restore_20260720_040426`.
- Restore result: PASS; schema/data restore exitcodes 0; row-count comparison PASS; object-count comparison PASS; restored public objects were 21 tables, 12 functions, 15 triggers, 15 policies, 72 constraints, and 0 `app_*` objects.
- Cleaned up plaintext temp files and removed the temporary restore database.
- PostgREST classification remains `B. POSTGREST DEGRADED BUT REQUEST PATH AVAILABLE`; dashboard/platform health remains unresolved and remote Wave 1 remains blocked.
- No remote SQL mutation, deploy, migration apply, migration repair, database push, Auth mutation, Storage mutation, cron mutation, project setting mutation, remote restart, plan upgrade, Wave 1 execution, legacy rename, legacy delete, commit, or push was performed.
- Next local batch: Gate 1 Local EAN And Connection Domain Foundation.

## 2026-07-20 - Gate 1 local EAN and connection domain foundation

- Added local forward-only migration proposal in active migrations: `supabase/migrations/20260720120000_app_ean_connection_domain_foundation.sql`.
- Created local proof: `scripts/proofs/app-ean-connection-domain-foundation.proof.ts`.
- Applied only the new migration to the existing local Supabase Postgres container; no reset was performed.
- Created and proved local schema foundation for:
  - `app_connections`
  - `app_connection_periods`
  - `app_connection_ownership_periods`
- Proof result: Q1-Q34 PASS with marker `app-ean-connection-domain-foundation-proof-ok`.
- Proven locally: EAN syntax is exactly 18 numeric digits; customer/dossier/location boundary guards; temporal overlap guards; primary versus secondary allocation point distinction; declared/observed/verified ownership claim boundary; terminal/history/supersede behavior; RLS deny-by-default; no browser role grants; no service_role DELETE grant on new Gate 1 tables.
- Not proven: CAR source access, REV field compatibility, legal mandate wording, customer-facing writes, operations review, eligibility decisioning, remote deployment, or production compliance.
- Existing app row counts and legacy object inventory were unchanged after proof cleanup.
- No remote SQL mutation, deploy, migration apply, migration repair, database push, Auth mutation, Storage mutation, cron mutation, project setting mutation, Wave 1 execution, legacy rename, legacy delete, commit, or push was performed.
- Next local batch: Gate 1 Connection Service Contract And Local Server-Side Write RPC.

## 2026-07-20 - Gate 1 connection write RPC boundary

- Added local forward-only migration: `supabase/migrations/20260720143000_app_connection_write_rpcs.sql`.
- Added local proof: `scripts/proofs/app-connection-write-rpcs.proof.ts`.
- Applied only the new migration to the existing local Supabase Postgres container; no reset was performed.
- Added service-role-only RPCs:
  - `app_declare_connection_v1`
  - `app_declare_connection_ownership_v1`
  - `app_decide_connection_ownership_v1`
  - `app_supersede_connection_ownership_v1`
- Added one narrow SQL audit helper: `app_connection_write_audit_event`.
- Security boundary proven locally: RPCs are `security definer`, use safe `search_path=""`, have service_role execute grants, and have no `PUBLIC`, `anon`, or `authenticated` execute grants.
- Idempotency proven locally through scoped `app_idempotency_keys` entries for connection declaration, ownership declaration, ownership decision, and supersede correction scopes.
- Audit proven locally through minimized `app_audit_events` with actor, request, source, decision, status, reason, idempotency, and timestamp metadata.
- Proof result: Q1-Q36 PASS with marker `app-connection-write-rpcs-proof-ok`.
- Cleanup proved no remaining proof business rows, audit rows, idempotency rows, customer/dossier/location fixtures, document rows, Auth rows, or legacy objects were created or left behind.
- Not proven: CAR access, REV field compatibility, legal mandate wording, customer-facing endpoint behavior, operations review projection, eligibility decisions, remote deployment, or production compliance.
- No remote SQL mutation, deploy, migration apply, migration repair, database push, Auth mutation, Storage mutation, cron mutation, project setting mutation, Wave 1 execution, legacy rename, legacy delete, commit, or push was performed.
- Next local batch: Gate 1 Connection Read Projection And Operations Review Contract.

## 2026-07-21 - Consolidate 07 architecture support documents

- Kept `docs/app/07_NEA_TARGET_ARCHITECTURE.md` as the only primary proposed target architecture.
- Moved the technical target table model to `docs/app/architecture/database-target-model.md`.
- Consolidated architecture/environment strategy into `docs/app/decisions/architecture-and-environment-decisions.md`.
- Consolidated baseline, cutover, rollback, and retirement planning into `docs/app/operations/remote-baseline-and-retirement.md`.
- Consolidated dated remote inventory, Phase 0, recovery, and PostgREST gate evidence into `docs/app/proofs/remote-baseline-and-recovery-gate.md`.
- Removed the superseded top-level 07A-07I files after reference and information-loss checks.
- Recorded no implementation permission; regulatory, architecture, and implementation verdicts remain blocked/partial as stated in the go/no-go audit.
- No runtime, SQL, migration, Function, Auth, Storage, cron, package/config, database, remote, commit, push, or deploy action was performed.

## 2026-07-21 - Close electricity TKV source governance and architecture decision drift

- Added the freshly downloaded and independently reverified official 2026-07-09 electricity-TKV PDF as one immutable repository source snapshot under `docs/app/sources/official/nea/`.
- Recorded the legal/source hierarchy, source metadata, supersede/source-diff hard stop, and the normalized requirements/traceability/architecture derivation order.
- Closed active claims that electricity-TKV access, reading, clause mapping, or verifier detail was still source-blocked; dated historical entries remain historical.
- Recorded Daan's decision that ENVAL follows the official TKV, implements no competing verification framework, and leaves professional risk, materiality, sampling, official location control, statement, fraud notification, and REV result management external.
- Added target-only internal support-control, internal/external capability, provider-independent port/adapter, provenance, and database-extensibility rules.
- Architecture remains DRAFT and implementation remains NO-GO pending explicit Daan approval.
- No runtime, SQL, migration, Function, Auth, Storage, cron, package/config, database, remote, commit, push, or deploy action was performed.

## 2026-07-21 - Record bounded internal foundation implementation GO

- DAAN DECISION: GO — BOUNDED INTERNAL FOUNDATION PHASE
- Established the documentation, official-source, and architecture baseline in commit `e2943d746d9bc9f1aa0992b16a83b51dcd10d805` with message `Establish NEa documentation baseline`.
- Approved architecture implementation scope: customer/person/organization; representation foundation; case foundation; locations; connections and EAN structure; chargers; charge points; meters and MID evidence structure; documents and evidence; parser inventory and modular parser adapters; internal reviews; support controls; corrections and supersede history; raw and normalized kWh foundations; audit and provenance; provider-independent external ports.
- Explicitly not approved: remote schema apply; remote migration; deployment; production; push; CAR adapter; EAN/register adapter; KvK adapter; MID-registeradapter; CPO/provideradapter; energieleverancieradapter; REV-integratie; betaalprovider; officiële verifierbeslissingen; definitieve retentionuitvoering; definitieve legal/mandate-tekst; booking- of settlementuitvoering.
- The GO records permission to begin bounded internal foundation work under package-specific local contracts, tests, and proof gates; it records no implementation-complete status.
- No runtime, SQL, migration, Function, Auth, Storage, cron, package/config, database, remote, deploy, or push action was performed in this decision-recording batch.

## 2026-07-22 - Approve canon and target architecture direction

- Recorded Daan's approval of the ENVAL canon and target architecture as TARGET, not CURRENT PROVEN implementation or built compliance.
- Recorded that there is no blanket implementation authorization; `READY`, `IN PROGRESS`, `TODO`, and `BLOCKED — EXTERNAL` remain independently controlling and every work package requires its own bounded scope.
- Kept existing bounded foundations unchanged and kept external professional and external system authority external.
- Set WP2 as the next bounded work package for customer, person, organization, representation and case foundation, limited to current-to-target contract design and exact reuse/rebuild disposition.
- Explicitly excluded WP2 implementation and all code, schema, database, Auth, RLS, UI, Edge Function, service, runtime, remote, deployment, commit, push, and merge actions from this decision batch.
- Registered the reusable Codex execution-batch discipline once in `docs/app/00_CANON.md`; other documents reference that canonical rule instead of duplicating it.

## 2026-07-22 - Prove bounded WP2A party foundation locally

- Recorded `WP2A — additive party directory and customer-party binding — LOCAL SCHEMA AND PROOF ONLY` as `CURRENT PROVEN — LOCAL` for exactly `app_parties`, `app_party_person_versions`, `app_party_organization_versions`, and `app_customer_party_relationships`.
- Built immutable/versioned natural-person and organization profiles locally, kept VvE as an organization classification, and added temporal customer-party relationships.
- Proved subtype, period-overlap, supersession, and immutability guards within the bounded four-table foundation.
- Recorded migration `supabase/migrations/20260722100000_app_party_foundation.sql` at SHA-256 `0356a978ed20b208ca8e3a350b5e80579e0cd186b9f909a761600d1bebf6a9a4` and proof `scripts/proofs/app-party-foundation.proof.ts` at SHA-256 `f2e36b8c68178fe911547277fcd9686211dd65a8d0f6eb95c5355e182ef9c086`.
- Deno check and Q01-Q24 were green with zero `FAIL` and marker `app-party-foundation-proof-ok`; transactional rollback left all four party tables with zero rows and protected existing app-table counts unchanged.
- Proved deny-all RLS on all four tables, `service_role` `SELECT`/`INSERT` only, and no `anon` or `authenticated` table grants.
- Recorded that the migration was applied locally but is absent from the empty local Supabase migration history, is repository-ignored, and requires a later conscious `git add -f` before any commit.
- This is local proof only. No remote, production, endpoint, Auth, UI, regulatory, NEa, or verifier acceptance is claimed; full WP2 implementation is not claimed.
- Set the next bounded step to `WP2B — representation-authority and case-role contract-to-schema readiness audit.` This is research/design only and authorizes no tables, migration, or implementation.

## 2026-07-23 - Define Settlement and Payouts TARGET contract

- Added `docs/app/contracts/settlement-and-payouts.md` as the single provider-independent TARGET contract for settlement and payouts; no implementation was authorized.
- Kept ERE sale, sale proceeds, allocation, legal-party gross entitlement, 10% ENVAL TARGET fee, net entitlement, settlement, payout instruction, payment execution, reconciliation, correction, reversal, and clawback as separate concepts.
- Reused the existing party/case, finance, audit, retention, security, correction, projection, port/adapter, and manual-fallback boundaries and the `NEA-FIN`, `NEA-AUD`, `NEA-RET`, `NEA-SEC`, and `NEA-COR` families.
- Recorded a late pilot option with append-only ledger, monthly statements, manual payout, and manual reconciliation; bank/PSP adapters remain a later separately approved variant.
- Classified the 90/10 split as an ENVAL TARGET commercial assumption, not an official requirement.
- Kept legal money flow, tax/VAT/withholding, bank/PSP route, beneficiary verification, account structure, safeguarding, licensing, retention, and payment-data privacy `UNKNOWN` or separately decision-blocked.
- Made no code, SQL, migration, database, Auth, Storage, Edge Function, frontend, CSS, provider, remote, commit, push, merge, or deploy change.

## 2026-07-23 - Complete WP2B representation-authority and case-role readiness audit

- Added `docs/app/operations/wp2b-representation-authority-case-role-readiness-audit.md` with exact status `PROOF ONLY — WP2B READINESS AUDIT`.
- Confirmed WP2A remains `CURRENT PROVEN — LOCAL` only for `app_parties`, `app_party_person_versions`, `app_party_organization_versions`, and `app_customer_party_relationships` within the cited local proof boundary.
- Confirmed representation authority, authority evidence/review, `app_cases`, `app_case_party_roles`, mandates, and party/authority/case customer projections are not implemented.
- Recorded that Supabase Auth and `app_customer_identities` prove credential/verified-email control and account binding only, never natural-person identity, legal-party identity, representation authority, signing authority, or mandate.
- Recorded the older appendix names `app_legal_entities` and `app_representatives` as a target-design conflict with the later focused WP2 party/authority contract; no conflicting schema shape was approved.
- Recommended exactly one next additive batch without authorizing it: `WP2B-I — additive case shell and case-party-role history — LOCAL SCHEMA AND PROOF ONLY`, limited to `app_cases`, `app_case_party_roles`, and one transactional local proof.
- Kept representation authority outside WP2B-I until the authority evidence, review/four-eyes, conflict/withdrawal, safe projection, and target-vocabulary decisions are resolved.
- Made no code, SQL, migration, schema, database, Auth, RLS, Edge Function, frontend, CSS, inline CSS, proof, runtime, provider, remote, staging, commit, push, merge, or deploy change.

## 2026-07-24 — Finalize WP2B-I DDL-ready target contract

- Recorded that the earlier WP2B `BLOCKED — DECISION` result was correct and resolved its case/case-role precision blockers through explicit decisions.
- Marked WP2B-I `TARGET — APPROVED / DDL READY` and `SCHEMA — NOT IMPLEMENTED`.
- Finalized the existing WP2 contract for immutable `app_cases` and versioned `app_case_party_roles`, including exact columns, two-role vocabulary, typed profile-version references, claim states, half-open validity, decision metadata, supersession, transaction-end cardinality, WP2A provenance reuse, RLS/grants, retention and regulatory versioning.
- Mapped the target to TKV 3.0.4, 3.0.5 and 3.1.3–3.1.5 while classifying the concrete database safeguards as ENVAL internal controls.
- Kept representation authority `NOT SCHEMA READY` and kept mandates, EAN, kWh, verification, settlement and all other future modules outside WP2B-I.
- Left the historical `operations/wp2b-representation-authority-case-role-readiness-audit.md` unchanged as PROOF ONLY evidence.
- Created no new contract file and changed no code, SQL, migration, schema, proof, frontend, CSS, staging, commit, push, deploy or remote state.

## 2026-07-24 — Register WP2B-I CURRENT PROVEN LOCAL proof and reconcile contract drift

- Registered `app_cases` and `app_case_party_roles` as `CURRENT PROVEN — LOCAL` for schema/proof only; API/runtime/customer projection remains `NOT IMPLEMENTED`, and remote/production plus NEa/verifier acceptance remain `NOT PROVEN`.
- Recorded basis commit `1e4fe26781796c9f624eb42d186c39fb98271218`, migration `supabase/migrations/20260724110000_app_case_party_role_foundation.sql` at SHA-256 `fb3f9b5d0705d47a5f1be9f934684a25ad474000874daf2ef9e071ab3ddb56a1`, and proof `scripts/proofs/app-case-party-role-foundation.proof.ts` at SHA-256 `12e4fdc5587fed04f75d3dda039c56e72fcd144cf1ecd8b943f1db7e32ef52bb`.
- Recorded Deno check and Q01-Q34 as green with marker `app-case-party-role-foundation-proof-ok`.
- Recorded exactly two tables, three focused functions, four triggers, restrictive FKs, checks/indexes, deny-all RLS, no client table privileges, and `service_role` `SELECT`/`INSERT` only.
- Recorded immutable profile-pinned claim chains, append-only linear supersession, half-open `timestamptz` validity and terminal non-superseded `case_confirmed` operational truth.
- Recorded Q29-Q30 concurrency evidence: deterministic per-case advisory locking plus deferred transaction-end checks allowed at most one simultaneous overlapping service-recipient commit.
- Recorded Q31-Q33 protected-truth evidence: existing `app_*` counts and protected hashes stayed unchanged, proofdata was removed, and both new tables ended at zero rows.
- Reconciled the approved contract to the proven physical migration without changing domain semantics: provenance and actor field names, `timestamptz` validity, direct profile FKs plus focused same-party guard, four-field decision metadata plus row request ID, `supersedes_id`, and required timestamps without schema defaults replace the earlier TARGET physical details.
- Added `docs/app/proofs/wp2b-i-case-party-role-foundation.md` as the single bounded evidence record; no second contract was created and the historical WP2B readiness audit remained unchanged.
- Recorded that version `20260724110000` is directly applied locally but absent from `supabase_migrations.schema_migrations`; this is no normal migration-tooling or remote-parity proof, and no manual history registration is claimed or advised.
- Kept representation authority `NOT SCHEMA READY`; mandates, connection/EAN, regulatory versioning, verification and settlement remain separate.
- Recorded migration and proof as uncommitted. After a separately approved commit, the next gate is a choice/readiness analysis for the next NEa-driven bounded context, without automatically implementing representation authority.
- This governance batch changed documentation only: no migration, proof, SQL, migration history, code, Auth, Edge Function, frontend, CSS, configuration, database, remote, staging, commit, push or deploy action occurred.

## 2026-07-24 — Complete WP2B-II representation-authority readiness audit

- Recorded that WP2B-I migration, proof, and governance evidence are committed in `5a5265adc516e8198cc25757654920d4aa3316bd` and remain `CURRENT PROVEN — LOCAL` only; their local migration-history version remains absent.
- Added `docs/app/operations/wp2b-ii-representation-authority-readiness-audit.md` with exact status `PROOF ONLY — WP2B-II REPRESENTATION AUTHORITY READINESS AUDIT`.
- Kept representation authority `NOT SCHEMA READY` and recorded verdict `BLOCKED — SOURCE OR LEGAL DECISION REQUIRED`.
- Identified the exact unresolved decisions for authority bases and evidence, natural-person/organization/VvE representation, acting-person chains, self-action, scope, joint authority, temporal/revocation reliance, separate status categories, maker-checker/four-eyes, conflict, stable references, privacy, and future context links.
- Recorded that Auth, verified email, customer/account ownership, customer-party relationships, service recipient, case contact, legal acceptance, upload, parser/signature detection, case role, and mandate evidence cannot create representation authority.
- Kept authority, mandate, case role, connection/EAN, evidence acceptance, verifier workflow, findings/CAPA, and settlement as separate bounded contexts.
- Named only four unapproved future candidate responsibilities and approved no table, column, constraint, vocabulary, contract, DDL, or proof.
- Set the next step to an explicit bounded contract/legal decision, not automatic schema work.
- This docs-only batch changed no contract, historical WP2B audit, WP2B-I proof page, migration, proof script, SQL, database, migration history, code, Auth, RPC, Edge Function, frontend, UI, CSS, configuration, remote state, staging, commit, push, merge, or deploy state.

## 2026-07-24 — Draft simple-majority MVP authority validation brief

- Recorded Daan's product direction to support common simple representation-authority cases in the MVP and add complex exceptions later through bounded modules.
- Recorded that the approximately-10%-or-less outlier estimate is an unproven product assumption, not measured evidence or a release criterion.
- Added `docs/app/legal/representation-authority-pilot-validation-brief.md` with exact status `DRAFT — PENDING LEGAL AND VERIFIER VALIDATION`.
- Proposed only natural-person self-action, one directly and individually authorized natural person for an organization, one simple direct individual VvE route, and an optional one-step direct power-of-attorney candidate without subdelegation for external validation.
- Kept joint signing, K-of-N, representative organizations, authority chains, subdelegation, unclear VvE authority, retroactivity, emergency paths, conflicting evidence and every unclear case outside the pilot as blocked/manual escalation.
- Added a fillable 20-question validation record for a Dutch corporate-law lawyer, external inbooking verifier and, where required, a KVK/register specialist.
- Preserved the hard Auth/account/party/case-role/authority/mandate/evidence/decision boundaries and made no assumption that a KVK extract or signature proves authority.
- Kept representation authority `NOT SCHEMA READY`; written external answers and Daan's later explicit bounded contract approval remain required before contract or DDL work.
- This docs-only batch changed no readiness audit, central contract, WP2B-I proof, requirement, traceability matrix, migration, proof script, SQL, schema, database, code, Auth, RPC, Edge Function, frontend, UI, CSS, configuration, remote state, staging, commit, push, merge or deploy state.

## 2026-07-24 — Audit WP3A connection/EAN current truth and readiness

- Added `docs/app/operations/wp3a-connection-ean-current-truth-readiness-audit.md` with exact status `PROOF ONLY — WP3A CONNECTION/EAN CURRENT-TRUTH READINESS AUDIT`.
- Read-only local catalog inspection found three empty connection tables, eight connection guard functions, nine triggers, fifteen indexes, three deny-all policies, one audit helper and four service-role-only write RPCs.
- Recorded that both connection migrations are ignored/untracked, both proof sources are untracked, `supabase_migrations.schema_migrations` has zero rows, no committed connection evidence page or raw proof output exists, and no current Edge/app/runtime caller exists.
- Preserved the historical Q1-Q34 and Q1-Q36 PASS reports as narrative evidence only; no proof was run and no connection object was promoted to `CURRENT PROVEN — LOCAL`.
- Recorded the exact conflicts with the approved canon: direct account/dossier ownership instead of legal-party/profile truth, no case linkage, no historical profile pinning, incomplete evidence/freshness/conflict decisions, ambiguous supersession, mutable pre-terminal rows, unproven direct-write concurrency and status-based rather than calendar-year EAN exclusivity.
- Set verdict `BLOCKED — CURRENT OBJECTS CONFLICT WITH CANON`.
- Set the smallest next bounded batch to `WP3B — connection/EAN domain contract reconciliation and object disposition — DOCS ONLY`.
- Recorded that existing connection proofs cannot be reused unchanged; only their local safety, isolation, negative-test, protected-count and cleanup patterns deserve reuse.
- Authority validation continues externally and representation authority remains `NOT SCHEMA READY`.
- This audit changed no contract, requirement, traceability matrix, MVP plan, proof, migration, SQL, schema, database, migration history, runtime, Edge Function, frontend, CSS, configuration, staging, commit, push, deploy or remote state.

## 2026-07-24 — Reconcile WP3B connection/EAN contract and object disposition

- Recorded that the WP3A readiness audit is committed in `f3b39aafb2e6817e64401ccb2c47eed285552869` and retains verdict `BLOCKED — CURRENT OBJECTS CONFLICT WITH CANON`.
- Added `docs/app/contracts/connection-ean-and-aangeslotene.md` with exact status `DRAFT — WP3B DOMAIN RECONCILIATION — NOT APPROVED / NOT DDL READY`.
- Proposed, without approval, separate bounded responsibilities for physical connection, EAN-dragend allocation point, immutable allocation metadata, party/profile-pinned aangesloteneclaims and case links; evidence acceptance and calendar-year controls remain separate future modules.
- Recorded exact 18-digit EAN syntax without checksumclaim, declared/observed/external/accepted separation, proposed accepted-EAN immutability, new-root correction and preserved source conflicts/historical reliance.
- Recorded proposed immutable claimversions with `asserted`, `connection_confirmed`, `disputed` and `rejected`, half-open validity, linear supersession, deterministic point locking and deferred end-of-transaction checks; only terminal non-superseded `connection_confirmed` may be operational.
- Kept connection, location, case role, authority, mandate, evidence, charger/MID, kWh, booking, verifier and settlement truths separate.
- Added a seventeen-row Daan decision matrix and verdict `PARTIAL — DOMAIN OR EXTERNAL DECISIONS REQUIRED`; DDL remains blocked pending explicit approval and applicable location/external decisions.
- Added `docs/app/operations/wp3b-connection-ean-object-disposition.md` with exact status `PROOF ONLY — WP3B CURRENT OBJECT DISPOSITION`.
- Dispositioned the three current tables, eight guards, audithelper, four RPCs and nine triggers as `REPLACE`, both connection proofs as `PROVE AGAIN`, and both ignored migrations as `RETIRE AFTER REPLACEMENT PROOF`; only named predicates, audit/idempotency forms and proof discipline are reusable.
- Recorded that empty tables do not authorize a drop, local migration history remains absent, remote presence remains UNKNOWN, and forward-only replacement and cleanup require separate later design and approval.
- Did not rerun either old proof and did not change or remove any existing connection object, migration, proof or protected untracked artifact.
- Authority validation continues independently and representation authority remains `NOT SCHEMA READY`.
- This docs-only batch changed no WP3A audit, central party/case contract, requirement, traceability matrix, MVP plan, target architecture, migration, proof script, SQL, schema, database, migration history, code, Auth, RPC, Edge Function, runtime, frontend, UI, CSS, configuration, staging, commit, push, merge, deploy or remote state.

## 2026-07-24 — Approve WP3C internal connection/EAN domain package

- Added `docs/app/operations/wp3c-connection-ean-internal-domain-decisions.md` with exact status `DECISION RECORD — WP3C INTERNAL DOMAIN PACKAGE APPROVED — NO DDL AUTHORIZATION`.
- Recorded Daan's explicit approval of internal TARGET packages A–E: separate connection/allocation/EAN identity and observations; immutable accepted EAN; stable location root/versions; party/profile-pinned claim history; administrative case, evidence and calendar-year-control boundaries; immutable security, transaction-end concurrency and forward replacement.
- Updated the connection/EAN contract to exact status `TARGET — WP3C INTERNAL DOMAIN DECISIONS APPROVED — EXTERNAL BLOCKERS OPEN / NOT DDL READY`.
- Preserved hard separation between Auth, account, party, case role, connection claim, representation authority, mandate, evidence acceptance, year exclusivity, charger/MID, kWh, booking, settlement and verifier truth.
- Approved `REPLACE` only as the future TARGET direction. Retirement execution, cleanup, DDL, migration and proof changes remain unauthorized; all existing database objects and source files remain intact, both old proofs remain `PROVE AGAIN` and both old migrations remain conflicting source material.
- Kept open: location implementation; CAR/DSO/register semantics; evidence categories, acceptance, freshness and conflicts; secondary/MLOEA; year duplicate source/fallback; verifier acceptance; representation authority; mandate validation; and booking eligibility.
- Set locationfoundation readiness as the first next bounded context. A limited connection-root/claim DDL-readiness assessment may follow only after separate location approval and proof, and still does not automatically authorize implementation.
- Representation-authority legal/verifier validation continues independently and representation authority remains `NOT SCHEMA READY`.
- This docs-only batch changed no WP3A audit, party/case contract, directive, requirements, completeness audit, MVP plan, migration, proof script, SQL, database, RPC, Edge Function, runtime, frontend, UI, CSS, configuration, staging, commit, push, deploy or remote state.

## 2026-07-25 — Audit WP3D location current truth and draft bounded contract

- Recorded WP3C as committed in `da961fa84da73ecc320b55b2cb83881a12d658f3`; its stable-root/version/observation direction remains TARGET only and authorizes no location schema.
- Added `docs/app/operations/wp3d-location-current-truth-readiness-audit.md` with exact status `PROOF ONLY — WP3D LOCATION CURRENT-TRUTH READINESS AUDIT`.
- Used repository/source inspection and explicit read-only local PostgreSQL transactions only; selected catalog metadata and aggregates, no address or other PII row values.
- Recorded 44 mutable `app_dossier_locations` rows, 68/68 linked chargers, 73/429 location-linked document slots, zero connection rows, empty migration history, RLS deny-all, `service_role` CRUD, the update trigger, four inbound FKs and three location-dependent old connection functions.
- Inventoried the live signup writer, dashboard reader/projection, Auth/dossier access boundary, charger and document dependencies, signup/dashboard frontend, direct PDOK observation, missing configured fallback implementation, legacy address source material and existing proofs.
- Set the audit verdict to `BLOCKED — CURRENT LOCATION OBJECTS CONFLICT WITH TARGET`: the current object is a populated mutable dossier snapshot without stable root, immutable versions, business validity, recorded-time separation, observations, decision provenance or supersession.
- Added `docs/app/contracts/location-foundation.md` with exact status `DRAFT — WP3D LOCATION FOUNDATION — NOT APPROVED / NOT DDL READY`.
- Named only the unapproved candidate responsibilities `app_locations`, `app_location_versions`, `app_location_address_observations`, `app_case_locations`, `app_allocation_point_locations` and `app_charge_point_locations`; no columns, constraints or schema were approved.
- Proposed conservative root/version/observation/relationship/security/concurrency/proof boundaries and a twenty-row Daan decision matrix without turning any proposal into CURRENT truth.
- Kept PDOK/BAG semantics/freshness, verifier location evidence, DSO/CAR location meaning, secondary/MLOEA, physical-visit evidence, acceptance categories, retention and privacy/minimization externally blocked.
- Dispositioned the current mutable location object, update model and old connection dependencies `REPLACE`; safe projection/RLS patterns are bounded reuse input, existing proofs are `PROVE AGAIN`, data/cutover remain `BLOCKED`, and no retirement is approved.
- Confirmed connection/EAN remains location-dependent and representation-authority validation remains independent.
- This docs-only batch changed no prior audit/contract, directive, requirement, completeness audit, target architecture, traceability matrix, MVP plan, migration, proof script, SQL, database data, migration history, Auth, RPC, Edge Function, runtime, frontend, UI, CSS, configuration, staging, commit, push, deploy or remote state.

## 2026-07-25 — Register WP3E approved internal location domain decisions

- Recorded WP3D as committed in HEAD `88e8c0b754c7d44e769f89037676d9732e6fe63c`; its CURRENT audit verdict and 44-row inventory remain unchanged evidence.
- Added `docs/app/operations/wp3e-location-internal-domain-decisions.md` with exact status `DECISION RECORD — WP3E INTERNAL LOCATION DOMAIN PACKAGE APPROVED — NO DDL AUTHORIZATION`.
- Recorded Daan's explicit approval of internal TARGET decisions `WP3E-LOC-01` through `WP3E-LOC-16`: opaque server-assigned statusless root; immutable accepted versions and non-accepting observations; separate business validity/recording time; half-open intervals; one operational version per root/time; same-site correction versus relocation; explicit split/merge history; linear supersession; separate case/allocation-point/future charge-point links; no generic party-role engine; hard no-inference boundaries; internal deny-all/immutable-core controls; and additive forward-only replacement.
- Updated the location contract to exact status `TARGET — WP3E INTERNAL LOCATION DOMAIN DECISIONS APPROVED — EXTERNAL BLOCKERS OPEN / NOT DDL READY`; candidate physical table and column names remain unapproved.
- Added exact marker `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`: stable roots, immutable versions, RLS and grants are internal ENVAL controls supporting reconstruction, not literal NEa database requirements or TKV/verifier acceptance.
- Preserved the TKV 3.0.4–3.0.5, 3.1.3–3.1.5 and 3.3.2–3.3.4 boundary, including the explicit minimum five-year verification-data retention period after the verification calendar year while keeping exact ENVAL retention and privacy minimization separately blocked.
- Kept OPEN: PDOK/BAG source contract/freshness; reliable physical-site matching; verifier acceptance of location evidence; DSO/CAR semantics; primary/secondary/MLOEA; location-visit procedure/evidence; evidence categories/acceptance; privacy/minimization; retention beyond the explicit TKV minimum; mapping of all 44 current rows; and remote catalog/caller truth.
- Recorded future proof scenarios for root immutability, no observation auto-acceptance, correction/relocation/split-merge history, operational-version cardinality, interval boundaries/overlap, linear supersession/cycles, concurrent creation/correction, browser denial, no ownership/mandate/eligibility inference, and 44-row mapping/protected history.
- Kept connection DDL dependent on a proven locationfoundation and kept location implementation `NOT IMPLEMENTED`, proof `NOT PROVEN`, and DDL, data migration and retirement `NOT AUTHORIZED`.
- This docs-only decision batch changed no WP3D audit, WP3C decision record, connection/EAN contract, party/case contract, directive, requirements, completeness audit, MVP plan, migration, proof, baseline proposal, SQL, database, Edge Function, helper/service, frontend, CSS, inline CSS, configuration, remote state, staging, commit, push or deploy state.

## 2026-07-25 — Audit WP3F location DDL readiness and classify 44 rows

- Recorded WP3E as committed in HEAD `e04f4a695d983c71a52f48d0c3c26ca605bb4402`.
- Added `docs/app/operations/wp3f-location-ddl-readiness-audit.md` with exact status `PROOF ONLY — WP3F LOCATION DDL-READINESS AND 44-ROW CLASSIFICATION AUDIT`.
- Added `docs/app/operations/wp3f-location-44-row-classification.md` with exact status `PROOF ONLY — PRIVACY-SAFE LOCAL LOCATION ROW CLASSIFICATION`.
- Used repository/source inspection and explicit read-only local PostgreSQL transactions only; every SQL transaction rolled back and no raw ID, address, provider ID, other PII or alias-to-ID mapping was printed or retained.
- Assigned ephemeral aliases `LOC-001` through `LOC-044` by `ORDER BY created_at, id`; all 44 are `POSSIBLE_DUPLICATE`, 7 have `CONFLICTING` and 37 `DECLARED_ONLY` evidence, all require manual review, and automatic promotion is `NO` for every row.
- Reconfirmed 44 current location rows, 68 charger references, 73 document-slot references and zero connection, connection-period or ownership-claim references.
- Audited ten candidate DDL responsibilities; none is safe for an empty additive migration, population or cutover while exact physical contracts, accepted-version representation, observation privacy/retention/provenance, deterministic concurrency, policies/grants/RPCs and proof matrix remain undecided.
- Dispositioned current and planned callers without changing them: current mutable location and dependent connection objects remain replacement targets; signup, dashboard, document linkage and PDOK handling require repair; existing proofs remain reuse input or `PROVE AGAIN`; no retirement is authorized.
- Recorded exact marker `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`.
- Set the verdict to `BLOCKED — LOCATION DDL DESIGN NOT SAFE`; the next bounded step is a separate docs-only exact physical replacement-contract decision.
- This proof-only batch changed no contract, prior WP3 record, directive, requirement, completeness audit, architecture, traceability, MVP plan, migration, proof, baseline proposal, SQL, database data, migration history, RPC, Edge Function, runtime, frontend, CSS, inline CSS, configuration, remote state, staging, commit, push, deploy or retirement state.

## 2026-07-27 — Approve WP3F-B bounded location DDL decisions

- Recorded WP3F as committed in HEAD `c5a46faa26d94ad22adbd2b3748f411e1b37e51e`; its historical verdict `BLOCKED — LOCATION DDL DESIGN NOT SAFE` and privacy-safe 44-row classification remain unchanged proof of the pre-decision state.
- Added `docs/app/operations/wp3fb-location-bounded-ddl-decisions.md` with exact status `DECISION RECORD — WP3F-B BOUNDED LOCATION DDL PACKAGE APPROVED — NO IMPLEMENTATION AUTHORIZATION`.
- Recorded Daan's approval of `WP3F-B-01` through `WP3F-B-18` as APPROVED TARGET for exactly `app_locations`, `app_location_address_observations`, and `app_location_versions`.
- Updated the location contract to exact status `TARGET — WP3F-B BOUNDED LOCATION DDL DECISIONS APPROVED — DATA MIGRATION AND CALLER CUTOVER BLOCKED / NOT IMPLEMENTED`.
- Approved an opaque server-assigned statusless immutable root, immutable non-accepting observations, immutable accepted-only versions, `timestamptz` half-open business validity, at most one operational non-superseded version per root/time, and same-root correction supersession with one successor, no cycles, later recorded time, required correction reason, and preserved history.
- Approved the closed creation, observation, and descriptor vocabularies; required complete postal-address or site-reference descriptors; prohibited raw payload, provider IDs, storage paths, document contents, secrets, e-mail and phone; and limited source/payload references to lowercase SHA-256 hashes.
- Approved future CHECK/composite-FK/partial-unique/immutable-guard/deferrable-constraint-trigger enforcement and future per-location advisory locking, deferred validation, idempotency, audit and real concurrency proof, without adding or authorizing a write-RPC.
- Approved RLS enabled and deny-all for all three tables, no `PUBLIC`, `anon`, or `authenticated` privileges, and only `SELECT`/`INSERT` for `service_role`; UPDATE and DELETE remain forbidden.
- Recorded exact marker `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`: the internal architecture supports reconstruction but proves no verifier or NEa acceptance.
- Kept implementation `NOT IMPLEMENTED`, proof `NOT PROVEN`, migration/data population/retirement `NOT AUTHORIZED`, caller cutover `BLOCKED`, and external blockers `OPEN`.
- Kept the first future migration empty and additive but not authorized; none of the 44 current rows may be copied, accepted or changed.
- Kept open 44-row migrationmapping, physical-site matching, PDOK/BAG source contract, verifier acceptance, case/allocation-point/charge-point links, split/merge relations, customer-safe projection, write-RPC, caller cutover, current-table retirement, privacy and final retention.
- This docs-only decision batch changed no WP3D audit, WP3E decision record, WP3F audit/classification, connection/EAN contract, party/case contract, directive, requirements, completeness audit, migration, proof, baseline proposal, SQL, database, runtime, Edge Function, frontend, CSS, remote state, staging, commit, push or deploy state.

## 2026-07-27 — Audit WP3G location foundation implementation readiness

- Recorded WP3F-B as committed in HEAD `e6aac0119c5e545673a07c6a985e1921a663ba49`.
- Added `docs/app/operations/wp3g-location-foundation-implementation-readiness.md` with exact status `PROOF ONLY — WP3G BOUNDED LOCATION FOUNDATION IMPLEMENTATION READINESS`.
- Added `docs/app/operations/wp3g-location-foundation-proof-contract.md` with exact status `TARGET — WP3G BOUNDED LOCATION FOUNDATION PROOF CONTRACT — NOT IMPLEMENTED`.
- Read all seventeen required canon, requirement, contract, WP3 and tracker documents; verified the official local TKV SHA-256 as `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`.
- Inspected all 22 tracked migrations, 25 proof sources and six protected baseline/rollback proposals plus immutable, temporal, supersession, deferred-trigger, advisory-lock, RLS/grant, audit/idempotency, function-security, caller, frontend and CSS patterns.
- Used only an explicit local read-only catalog transaction and printed no application row, address, UUID or PII; found no TARGET-name object/FK conflict, visible `gen_random_uuid()`, `pgcrypto 1.3`, 24 RLS-enabled `app_*` tables with 24 `deny_all` policies, and zero local migration-history rows.
- Found that WP3F-B fixes the three responsibilities, root fields, vocabularies, temporal/supersession invariants and security boundary, but does not physically fix observation actor/request fields, hash/freshness representation, normalized descriptor columns, version-to-observation cardinality, acceptance provenance or recording defaults.
- Set verdict `BLOCKED — BOUNDED LOCATION FOUNDATION IMPLEMENTATION NOT SAFE`; no external blocker prevents an empty foundation, but these internal catalog decisions and later implementation authorization remain required.
- Recorded non-authoritative recommended future paths `supabase/migrations/20260728100000_app_location_foundation.sql` and `scripts/proofs/app-location-foundation.proof.ts`; neither file was created.
- Defined proof contract Q01-Q42 for exact catalog/additivity/emptiness, immutable roots/observations/versions, vocabularies/descriptors/hashes, sequential temporal/supersession validation, RLS/grants, isolation, rollback and protected counts/hashes.
- Explicitly deferred advisory-lock and true two-transaction operationele concurrency proof to a separately approved write-RPC batch.
- Kept operationele write-RPC, all 44-row mapping/population, physical-site matching, PDOK/BAG, verifier acceptance, relation tables, projection, caller cutover, retirement, privacy and final retention blocked.
- CSS reuse is not applicable.
- This docs-only proof batch changed no location contract, WP3D/WP3E/WP3F/WP3F-B record, target architecture, traceability matrix, requirement, connection/EAN contract, party/case contract, migration, proof, baseline proposal, SQL, database data, runtime, Edge Function, frontend, CSS, package/config, remote state, staging, commit, push or deploy state.

## 2026-07-27 — Approve WP3G-B exact physical location schema decisions

- Recorded WP3G as committed in HEAD `c021d57aacc5d8beb4aa2043bc963839fa38da07`; its historical verdict `BLOCKED — BOUNDED LOCATION FOUNDATION IMPLEMENTATION NOT SAFE` and TARGET / NOT IMPLEMENTED proof contract remain unchanged.
- Added `docs/app/operations/wp3gb-location-physical-schema-decisions.md` with exact status `DECISION RECORD — WP3G-B EXACT PHYSICAL LOCATION SCHEMA PACKAGE APPROVED — NO IMPLEMENTATION AUTHORIZATION`.
- Recorded Daan's approval of exact physical schema package 1–8 for the bounded `app_locations`, `app_location_address_observations`, and `app_location_versions` TARGET.
- Updated the location contract to exact status `TARGET — WP3G-B EXACT PHYSICAL LOCATION SCHEMA APPROVED — MIGRATION AND PROOF NOT AUTHORIZED / DATA MIGRATION AND CALLER CUTOVER BLOCKED`.
- Closed the six internal WP3G catalog-decision gaps as TARGET: exact observation actor/request columns; null-or-64-lowercase-hex hashes and kind-specific retrieval/freshness; normalized exclusive descriptor columns; exactly one unique same-root primary observation per version; exact unique opaque acceptance provenance; and exact `clock_timestamp()` recording defaults.
- Approved same-root `UNIQUE (location_id, id)`, composite accepted-observation and supersession FKs, while preserving one-successor, no-cycle, correction-reason, later-recording, half-open-validity and one-operational-leaf rules.
- Kept additional evidence behind the opaque acceptance-decision reference; added no fourth foundation table and no document, provider, case or generic-evidence FK.
- Recorded exact marker `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`.
- Kept implementation `NOT IMPLEMENTED`, proof `NOT PROVEN`, migration/database writes `NOT AUTHORIZED`, operational write-RPC/data population/caller cutover `BLOCKED`, retirement `NOT AUTHORIZED`, and external blockers `OPEN`.
- Kept blocked/open: operational write-RPC; advisory-lock and true two-transaction concurrency proof; 44-row mapping/population; physical-site matching; PDOK/BAG; verifier acceptance; case/allocation-point/charge-point links; split/merge; projection; cutover; retirement; privacy and final retention.
- Required a new bounded readiness reconciliation before any separately authorized migration/proof batch; no implementation authorization follows from package 1–8.
- This docs-only decision batch changed no WP3D/WP3E/WP3F/WP3F-B/WP3G historical record, requirement, completeness audit, connection/EAN contract, party/case contract, migration, proof, proposal, SQL, database data, runtime, Edge Function, frontend, CSS, package/config, remote state, staging, commit, push or deploy state.

## 2026-07-27 — Reconcile WP3G-C location foundation readiness

- Recorded WP3G-B as committed in HEAD `98f7aa5007a458115afab1f2c3b2333862411250`.
- Added `docs/app/operations/wp3gc-location-foundation-readiness-reconciliation.md` with exact status `PROOF ONLY — WP3G-C LOCATION FOUNDATION READINESS RECONCILIATION`.
- Reconciled all eight physical blocker groups against WP3G-B and set exact verdict `READY — EMPTY BOUNDED LOCATION FOUNDATION IMPLEMENTATION MAY START`.
- Confirmed all 42 unchanged WP3G foundation-proof cases are directly implementation-ready; zero are deferred within Q01-Q42 and zero require a new decision. The seven operational write-RPC/concurrency assertions remain outside the foundation matrix.
- Confirmed free future paths `supabase/migrations/20260728100000_app_location_foundation.sql` and `scripts/proofs/app-location-foundation.proof.ts`, exactly three empty tables, no fourth foundation table, no write-RPC, no population, no current-table/caller change, no DROP, retirement or cutover.
- Reconfirmed exact marker `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`.
- Kept implementation `NOT IMPLEMENTED` and migration/proof/database writes `NOT AUTHORIZED`; READY creates no implementation authorization.
- Kept blocked for later batches: operationele write-RPC, advisory-lock/two-transaction concurrency proof, data population, relation tables, customer-safe projection, caller cutover and current-table retirement.
- Kept PDOK/BAG, physical-site matching, verifier acceptance, privacy/retention above the recorded minimum, 44-row mapping and caller cutover open without treating them as blockers for the empty foundation.
- CSS reuse is not applicable.
- This docs-only reconciliation changed no contract, target architecture, traceability matrix, WP3D/WP3E/WP3F/WP3F-B/WP3G/WP3G-B historical record, requirement, completeness audit, connection/EAN contract, party/case contract, migration, proof, proposal, SQL, database data, runtime, Edge Function, frontend, CSS, package/config, remote state, staging, commit, push or deploy state.

## 2026-07-28 — Register WP3H empty bounded location foundation local proof

- Recorded implementation commit `3bb8d50cd7723ad631d75857df4e08d6ef0db311`, parent `98df5993088a098c01d2dafab3f8a9c358f9374d`, subject `Add WP3H location foundation`.
- Registered exact status `CURRENT PROVEN — LOCAL ONLY — WP3H EMPTY BOUNDED LOCATION FOUNDATION` in `docs/app/operations/wp3h-location-foundation-local-proof.md`.
- Registered migration `supabase/migrations/20260728100000_app_location_foundation.sql` with SHA-256 `c10c3492eda04b2c342200879be7e3b3e98f098269b19b3190d71f61c24c5aa5` and proof `scripts/proofs/app-location-foundation.proof.ts` with SHA-256 `2570ab01627ff32fed30fe589adf7d6d88af8087a4107307366ba08f5913f1d6`.
- Recorded exactly three empty additive tables and 44 columns, immutable roots/observations/accepted versions, descriptor/provenance/temporal/supersession enforcement, RLS on all three tables, three `deny_all` policies, no browser grants and `service_role` only `SELECT`/`INSERT`.
- Recorded 42 of 42 green WP3G-Q cases and marker `app-location-foundation-proof-ok`; every fixture group rolled back and all three TARGET tables ended empty.
- Recorded equal protected before/after counts and hashes and unchanged `app_dossier_locations=44`; no current row was populated, copied, accepted or changed.
- Recorded that the migration was applied directly locally without a migration-history record; no remote apply, push or deploy occurred.
- Set the location contract to exact status `CURRENT PROVEN — LOCAL ONLY — WP3H EMPTY BOUNDED LOCATION FOUNDATION / OPERATIONAL WRITES, DATA MIGRATION AND CALLER CUTOVER NOT IMPLEMENTED`.
- Preserved exact marker `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE` and made no full NEA-EAN or NEA-CHG CURRENT PROVEN claim.
- Kept operational write-RPC, advisory locking, idempotent writes, true two-transaction concurrency, 44-row mapping/population, physical-site matching, PDOK/BAG, verifier acceptance, EAN/connection/aangeslotene truth, relations, customer-safe projection, caller cutover, retirement, remote and production outside CURRENT PROVEN.
- This docs-only registration changed no WP3D/WP3E/WP3F/WP3F-B/WP3G/WP3G-B/WP3G-C record, requirement, completeness audit, connection/EAN contract, party/case contract, migration, proof, existing migration/proof, proposal, SQL, database, runtime, Edge Function, frontend, CSS, package/config, staging, commit, push, deploy or remote state.

## 2026-07-28 — Audit WP3I operational location-write readiness

- Added `docs/app/operations/wp3i-location-operational-write-readiness.md` with exact status `DRAFT — WP3I OPERATIONAL LOCATION WRITE READINESS — DECISION REQUIRED`.
- Inspected all current migrations, proof sources/evidence, baseline proposals, shared actor/request/hash helpers, idempotency and audit tables/RPC patterns, security-definer/search-path conventions, advisory locks, stable errors, real concurrency runners, current catalog grants/policies/functions, frontend and CSS read-only.
- Reused the bounded patterns for canonical hashing, server provenance, shared idempotency, transactional success/reject audit, deterministic per-root locking, service-role-only functions, safe error mapping and true process-level concurrency proof; rejected fail-open/legacy and conflicting connection patterns as direct implementation dependencies.
- Set exact verdict `READY FOR DECISION — OPERATIONAL WRITE PACKAGE CAN BE APPROVED`; this is not implementation authorization.
- Recorded twelve explicit, still-unapproved decisions for four narrow operations and proposed free paths `supabase/migrations/20260728140000_app_location_write_rpcs.sql` and `scripts/proofs/app-location-write-rpcs.proof.ts`.
- Kept WP3H `CURRENT PROVEN — LOCAL ONLY` and operational writes `NOT IMPLEMENTED`; population, links, projection, caller cutover, retirement, remote and production remain blocked or unproven.
- Preserved `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`; CSS reuse is not applicable.
- This docs-only/read-only batch created no migration, proof, SQL write, database change, RPC, helper, runtime, Edge Function, frontend, CSS, package/config change, staging, commit, push, deploy or remote action.

## 2026-07-28 — Register WP3J operational location write RPC local proof

- Recorded implementation commit `45d926478945fedc610ea02a0ff2b0d4f5f14be4`, parent `685e85ff537c7055c9885992e098b88c8fd73025`, subject `Add WP3J operational location write RPCs`.
- Added `docs/app/operations/wp3j-location-write-rpcs-local-proof.md` with exact status `CURRENT PROVEN — LOCAL ONLY — WP3J OPERATIONAL LOCATION WRITE RPCS AND CONCURRENCY`.
- Registered migration `supabase/migrations/20260728140000_app_location_write_rpcs.sql` with SHA-256 `171490e672a500d303ca097b8aececda8da7f98ae2411cc5e13cd1cb43a48593` and proof `scripts/proofs/app-location-write-rpcs.proof.ts` with SHA-256 `9330b086e82cff5ce40fcfa25ab0650023c1e3a92174a613a06035f8ee9d626d`.
- Registered exactly four public RPCs: `app_create_location_root_v1`, `app_record_location_observation_v1`, `app_accept_initial_location_version_v1`, and `app_correct_location_version_v1`.
- Registered exactly three focused helpers: `app_location_write_idempotency_begin_v1`, `app_location_write_lock_v1`, and `app_location_write_complete_v1`.
- Recorded `SECURITY DEFINER`, empty search paths, execute only for `service_role` on the public RPCs, no execute for `PUBLIC`/`anon`/`authenticated`, and no direct service-role execute on helpers.
- Recorded reuse of `app_idempotency_keys` and transactionally fail-closed `app_audit_events`, with no new table, foundation mutation, TTL or cleanup rule.
- Recorded definitive migration fresh apply with exitcode `0` from a seven-function-free WP3H-compatible disposable schema, exactly seven resulting functions, and equality between migration-body and `pg_proc.prosrc` hashes.
- Recorded 42 of 42 green `WP3J-Q` cases and marker `app-location-write-rpcs-proof-ok`; Q35-Q41 use genuine separate PostgreSQL processes/connections.
- Recorded unchanged real local counts: three empty foundation tables, `app_dossier_locations=44`, `app_audit_events=753`, and `app_idempotency_keys=306`; no disposable database remained.
- Set the location contract to exact status `CURRENT PROVEN — LOCAL ONLY — WP3J OPERATIONAL LOCATION WRITE RPCS / CALLER AUTHORIZATION, DATA MIGRATION, REMOTE APPLY AND CUTOVER NOT IMPLEMENTED`.
- Kept technical service-role execute separate from human/operations authorization; no Edge Function/runtimecaller or browser-direct RPC access was added.
- Set `WP3K — authorized operational location caller boundary` as the next readiness step.
- Preserved `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE` and made no complete NEA-EAN, NEA-CHG, NEA-AUD, NEA-COR or NEA-SEC CURRENT PROVEN claim.
- Kept caller authorization, population/44-row mapping, relation links, projection, remote apply, production, cutover and retirement blocked or unproven.
- This docs-only batch changed no WP3D-WP3I historical record, requirement, completeness audit, connection/EAN contract, party/case contract, migration, proof, SQL, database, runtime, Edge Function, frontend, CSS, package/config, staging, commit, push, deploy or remote state.

## 2026-07-28 — Audit WP3K authorized operational location caller readiness

- Recorded WP3J documentation commit `ce7be9fea4d4efef66aa9585c7763bb3a6593296`, parent `45d926478945fedc610ea02a0ff2b0d4f5f14be4`, subject `Record WP3J local location write proof`.
- Added `docs/app/operations/wp3k-location-caller-boundary-readiness.md` with exact status `DRAFT — WP3K AUTHORIZED OPERATIONAL LOCATION CALLER BOUNDARY — DECISION REQUIRED`.
- Inspected the current customer Auth/session/dossier boundary, case and case-party-role foundation, representation-authority readiness, all seven `api-app-*` callers, shared request/idempotency/audit helpers, WP3J RPC security, current frontend session use, CSS organization and the read-only local function/table/grant catalog.
- Set exact verdict `PARTIAL — ROLE, AUTHORITY OR SCOPE FOUNDATION INCOMPLETE`: no current workforce identity model, governed internal role assignment, reviewer qualification, case-to-location authorization relation or authorized WP3J runtime caller exists.
- Kept customer identity, dossier ownership, customer contact, case service-recipient/contact roles and representation authority separate from internal operational location-review authority; representation authority remains `NOT SCHEMA READY` and its pilot/manual-escalation boundaries remain unchanged.
- Proposed four specific, still-unapproved `api-app-ops-location-*` callers, focused shared helper `supabase/functions/_shared/app_workforce_authorization.ts`, server-derived non-PII actor provenance and proof path `scripts/proofs/api-app-ops-location-callers.proof.ts`.
- Recorded twelve unapproved decisions covering caller shape, verified principal, workforce foundation, capability governance, object scope, representation separation, ingestion, maker/checker controls, actor provenance, audit/idempotency correlation, safe errors and proof.
- Recommended root creation and observation registration as non-accepting operations without a default second checker; recommended distinct qualified maker/checker authorization for initial acceptance and same-root correction; no emergency override was approved.
- Recorded safe separation between unauthenticated, authenticated-but-unauthorized and conflict/idempotency failures without disclosing sensitive existence or authorization detail.
- Verified official local TKV SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` and preserved exact marker `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`.
- CSS reuse is not applicable because no UI or CSS change is proposed.
- This docs-only/read-only batch created no Edge Function, helper, migration, proof implementation, SQL write, database change, RPC change, runtime caller, frontend, CSS, package/config change, staging, commit, push, deploy or remote action.

## 2026-07-28 — Propose WP3L-A exact workforce authorization foundation

- Recorded WP3K documentation commit `a23f57ab18c3be7fe1c07cbc325fe9dcc4421837`, parent `ce7be9fea4d4efef66aa9585c7763bb3a6593296`, subject `Record WP3K location caller readiness`.
- Recorded Daan's explicit approval of WP3K-D01 through WP3K-D12 as TARGET input without authorizing an Edge Function, helper, workforce schema or runtime caller.
- Added `docs/app/operations/wp3l-workforce-authorization-foundation-decisions.md` with exact status `DRAFT — WP3L WORKFORCE AUTHORIZATION FOUNDATION — EXACT SCHEMA DECISION REQUIRED`.
- Compared the compact five-table, normalized seven-table and customer/case-extension models; recommended normalized option B because lifecycle, capability, case/location relation, object scope and maker/checker facts change independently.
- Set exact verdict `READY FOR DECISION — BOUNDED WORKFORCE AUTHORIZATION FOUNDATION PACKAGE CAN BE APPROVED`; readiness is not migration/proof authorization.
- Proposed exactly seven additive tables for workforce roots, lifecycle events, six closed capability assignment events, case/location relation events, workforce scope events, material operation requests and immutable checker reviews.
- Proposed exact capabilities `location.root.create`, `location.observation.record`, `location.version.accept.prepare`, `location.version.accept.approve`, `location.version.correct.prepare` and `location.version.correct.approve`; no human title or JWT/customer/case-party/representation role becomes authorization.
- Required distinct active maker/checker identities, exact payload-hash review, execution-time revalidation, at-most-once execution and no emergency override.
- Proposed a controlled environment-specific dual-operator pilot bootstrap runbook; prohibited self-enrollment, browser bootstrap, silent admin claims and hardcoded Auth-user migration seeds.
- Recorded eighteen exact, still-unapproved physical decisions and a 32-case later proof contract including ACL, no-inference, revocation, wrong-scope, self-approval, real two-connection review/execution races, rollback, protected equality and cleanup.
- Verified free future paths `supabase/migrations/20260728180000_app_workforce_location_authorization_foundation.sql` and `scripts/proofs/app-workforce-location-authorization-foundation.proof.ts`; neither file was created.
- Verified the official local TKV SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` and preserved `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`.
- CSS reuse is not applicable.
- This docs-only/read-only batch created no migration, proof implementation, SQL write, database change, function, Edge Function, helper, runtime caller, frontend, CSS, package/config change, staging, commit, push, deploy or remote action.

## 2026-07-28 — Register WP3L-B workforce authorization foundation local proof

- Recorded implementation commit `6485dad9a1cc481efc3f17095f90df72a219b315`, parent `1baaef4174df7a002c8a3bebd1b526d68c7f1d1c`, subject `Add WP3L workforce authorization foundation`.
- Recorded migration SHA-256 `e29f0576be4b13cb4250f9e0e931b895e1fa02723b8d8cdac2cffa96006319ac` and proof SHA-256 `f451ab67902ebe1a2612ebc4ab23e4a8777fed95b376fa4936942e1e46d55acb`; the implementation commit contains exactly those two files.
- Added `docs/app/operations/wp3l-workforce-authorization-foundation-local-proof.md` with exact status `CURRENT PROVEN — LOCAL ONLY — WP3L WORKFORCE LOCATION AUTHORIZATION FOUNDATION AND CONCURRENCY`.
- Registered the exact seven empty workforce/case-location/scope/request/review tables and six closed location capability codes; no generic RBAC engine, bootstrap identity, population or emergency override exists.
- Registered nine exact new functions and fourteen triggers, including three `SECURITY DEFINER` operation trigger entrypoints with empty search path, six invoker guards, and reuse of `public.app_wp2b_i_immutable_guard()`.
- Recorded deny-all RLS on all seven tables, no browser privileges, only `SELECT, INSERT` for `service_role`, and no direct execute grant on internal guards.
- Recorded the additive audit-scope values `workforce_identity`, `workforce_authorization` and `location_operation_request`; no audit row was written.
- Registered 48/48 green `WP3L-B-Q` cases and marker `app-workforce-location-authorization-foundation-proof-ok`.
- Recorded definitive fresh apply exit code `0`, true separate-process review/execution races with at most one result, and a green rolled-back `SET LOCAL ROLE service_role` trigger route.
- Preserved protected before/after counts and WP3J fingerprints; all seven real local target tables remain empty, direct local apply is absent from migration history and zero disposable databases remain.
- Kept bootstrap, population, assignment-authority runtime, authorized callers, automatic WP3J execution, 44-row mapping, remote, production and cutover outside CURRENT PROVEN.
- Set the next readiness batch to `WP3M — authorized operational location callers and WP3J execution bridge readiness`; no implementation authorization follows.
- Verified the official local TKV SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` and preserved `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`.
- CSS reuse is not applicable.
- This docs-only batch changed no migration, proof, SQL/database state, runtime, Edge Function, helper, frontend, CSS, package/config, staging, commit, push, deploy or remote state.

## 2026-07-28 — Audit WP3M caller and execution-bridge readiness

- Added `docs/app/operations/wp3m-location-callers-execution-bridge-readiness.md` with exact status `DRAFT — WP3M AUTHORIZED OPERATIONAL LOCATION CALLERS AND WP3J EXECUTION BRIDGE — DECISION REQUIRED`.
- Set exact verdict `READY FOR DECISION — CALLER AND EXECUTION BRIDGE PACKAGE CAN BE APPROVED`; readiness is not implementation authorization.
- Inspected all current `api-app-*` callers, shared customer-Auth/foundation helpers, frontend Auth/session/dashboard modules, CSS/layout inventory, all WP3J RPC/helpers, all WP3L tables/functions/triggers/policies/grants, idempotency/audit and current `SECURITY DEFINER` patterns.
- Confirmed no current runtime caller, workforce helper or execution bridge exists; all proposed Edge, shared-helper, migration, RPC, private-helper and proof names are free.
- Recommended, without approval, four operation-family Edge callers with closed actions above eight purpose-specific database bridge RPCs; rejected eight Edge endpoints and generic Edge/database dispatchers.
- Required workforce resolution, authority locks/revalidation, request/review locking, WP3J write, WP3L execution marking, idempotency and correlated audit to commit in one database transaction.
- Recorded `WP3M-D01` through `WP3M-D18` as not approved, the full authorization/execution matrix, exact safe-error contract and layered negative/concurrency/rollback proof contract.
- Kept WP3J and WP3L `CURRENT PROVEN — LOCAL ONLY`; authorized callers, bridge, bootstrap, population, assignment authority, operations UI, remote apply and cutover remain not implemented/open.
- Verified the official local TKV SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` and preserved `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`.
- CSS reuse is not applicable.
- This docs-only/read-only batch changed no migration, proof, SQL/database state, function, Edge Function, runtime helper, frontend, CSS, package/config, staging, commit, push, deploy or remote state.

## 2026-07-29 — Register WP3N authorized location callers and atomic bridge local proof

- Recorded implementation commit `6705fa3baf046510d70b8502da6058009b30b2f3`, parent `961dd90b529e336f67322b951d58998edfb66c92`, subject `Add WP3N location operation callers and bridge`.
- Recorded exactly seven committed artifacts and SHA-256 values: proof `3b8a9724941c59cb00e30204b9b7e84ced074fe8b8c7c84a32711226eacb047c`; shared adapter `85ce30ff3b119a7d4a09062651e8c9e30dbf6f20d9b8a990a940b9a39cfcc30a`; observation caller `b7cd8c8f37d00198cf73e3affefc0cdb1601837275ccf112c5488b98ceefd6d5`; root caller `08bf3d77e1c7a4e1c02b1579de5ef2244cec0bef0a06f7bbdd31dc8e75bfce82`; acceptance caller `4349e54d787cbfc6c6088c20a2ec6f29367ae694e70935af45ac8453c9c0b7b9`; correction caller `48b2c4abc25bdd587150dad633c4af37aeb4d456c101b23bad2bb7c08a87996d`; migration `9b71230ed2b2a91691f763e4cd539e2d923c996c31ca9297ae445cf62807230b`.
- Added `operations/wp3n-location-callers-execution-bridge-local-proof.md` with exact status `CURRENT PROVEN — LOCAL ONLY — WP3N AUTHORIZED OPERATIONAL LOCATION CALLERS AND ATOMIC WP3J EXECUTION BRIDGE`.
- Marked WP3M-D01 through WP3M-D18 APPROVED TARGET and registered exactly four operation-family callers, closed action maps, one shared transport adapter without authorization truth, eight public service-role-only bridge RPCs and one private Auth-to-workforce resolver; no additional private helper exists.
- Recorded atomic root/first-relation creation, non-accepting observations, no WP3J call during acceptance/correction prepare or review, original-maker execution after distinct-checker review, execution-time revalidation and atomic WP3J write plus WP3L execution marking.
- Recorded replay/payload-conflict handling, fail-closed caller/business audit, safe errors, no browser-selected RPC, no Edge-side authorization join, no new table, no generic dispatcher/RBAC engine, no emergency override, no bootstrap/population or hardcoded Auth ID.
- Registered `WP3N-Q01` through `WP3N-Q64` PASS and marker `api-app-ops-location-callers-proof-ok`.
- Recorded definitive fresh disposable apply exactly once, migration/function-body equality, unchanged WP3J/WP3L fingerprints, genuine review/execution/revocation-versus-execution races, complete cleanup and zero remaining proof databases.
- Recorded unchanged protected counts: `auth.users=5`, `app_customers=211`, `app_customer_identities=73`, `app_cases=0`, `app_case_party_roles=0`, three location tables `0`, `app_dossier_locations=44`, `app_audit_events=753`, `app_idempotency_keys=306`; all seven real local WP3L tables remained empty.
- Kept workforce bootstrap, population, assignment authority, operations UI, system-ingestion principal, 44-row population, PDOK/BAG, EAN/connection/aangeslotene, remote apply, function deploy, production, cutover and regulatory/verifier acceptance outside CURRENT PROVEN.
- Set next readiness batch `WP3O — controlled pilot workforce bootstrap and assignment authority readiness`; it grants no bootstrap or remote implementation authorization.
- Verified official local TKV SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` and preserved `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`.
- This docs-only batch changed no migration, proof, SQL/database state, function, Edge Function, runtime helper, frontend, CSS, package/config, staging, commit, push, deploy or remote state.

## 2026-07-29 — Audit WP3O controlled workforce bootstrap and assignment authority readiness

- Added `docs/app/operations/wp3o-workforce-bootstrap-assignment-authority-readiness.md` as a docs-only/read-only decision proposal.
- Set exact verdict `READY FOR DECISION — BOOTSTRAP AND ASSIGNMENT AUTHORITY PACKAGE CAN BE APPROVED`; readiness grants no implementation or execution authority.
- Separated temporary genesis custody from structural identity, capability and scope governance, operational maker/checker, customer/representation authority, technical `service_role` and deployment authority.
- Recommended, without approval, a single-use environment-specific CLI/runbook ceremony that creates an exact minimal split governance pair, followed by purpose-specific prepare/review/execute governance RPCs.
- Proposed at most two governance tables, six closed governance capabilities, bounded operator/proof paths, safe errors, audit/idempotency, recovery and layered proof contracts; all proposed names were free and no file outside documentation was created.
- Recorded decisions 01 through 18 as not approved and kept connected-party conflict policy, custody/recovery ownership, real pilot targets and every later execution gate open.
- WP3N remains `CURRENT PROVEN — LOCAL ONLY`; bootstrap, population, assignment/revocation authority and operations UI remain `NOT IMPLEMENTED`; remote apply, deploy and cutover remain open.
- This batch changed no schema, migration, RPC, proof, operator script, SQL/database state, workforce population, Edge Function, runtime helper, frontend, CSS, package/config, staging, commit, push, deploy or remote state.

## 2026-07-29 — Prove PILOT-CASE-01 authenticated dossier case activation

- Added `app_bootstrap_customer_auth_v2`, reusing v1 atomically, plus the unique `app_customer_dossier` source invariant and deterministic full-UUID `CASE-...` reference.
- Wired strict safe case fields through Auth bootstrap, one bounded write-free dashboard bulkread, frontend clients/types and the existing `Zaakreferentie` info row; no CSS, fallback case or visible case ID was added.
- Recorded migration/proof hashes `66f0a8a494426f70e3673134c2f29664155ff83344385749779aa6d6d26adc30` and `875c5bae5c72257e9a2f92ac0aa681c68f5d6cad50bbf7b4e3be22d1963cae70`; v1 fingerprint remains `690b68a752ac64b988bb69442dc8d20e`.
- `PILOT-CASE-01-Q01` through Q32 and marker `authenticated-dossier-case-activation-proof-ok` are green, including one fresh disposable apply, true process concurrency, rollback and cleanup.
- The fixed local migration was already present; its earlier apply count is UNKNOWN and not evidence. Real local `app_cases` and `app_case_party_roles` remained 0.
- Frontend build and targeted frontend proofs are green. Browser-live proof remains OPEN; no remote, production, party, authority, EAN, location, evidence, kWh, workforce or regulatory claim is made.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-04 — PILOT-SIGNUP-FACT-APPLICABILITY-SUMMARY-06

- Separated generic document extraction from one pure account-type fact
  applicability selector. Parser results no longer imply whether a dossier
  fact is required.
- Made Particulier organization name, KvK and gas EAN not applicable; missing
  informational facts now have no action and do not block. Zakelijk and VvE
  require organization name and KvK without requiring document `partyName` as
  a second organization fact.
- Prevented the UI-only default country `Nederland` from creating declared
  address state. Only an explicitly saved complete manual address creates a
  separate correction and persistent ENVAL-review marker.
- Extended the existing compact signing summary with applicable confirmed
  account facts, canonical location/EAN facts, explicit document bindings and
  found informational document facts. Missing informational facts stay hidden.
- Added real-fixture proof marker
  `signup-fact-applicability-summary-06-proof-ok`. Parser files, backend,
  payload, signing, submit, browser acceptance, remote and production remain
  unchanged or unproven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-03 — PILOT-SIGNUP-DOCUMENT-CROSSCHECK-02 parity correction

- Kept street, house number, house-number addition, postcode, city and country
  structurally separate. The single customer-facing formatter renders additions
  canonically as `28-1`; separators and surrounding whitespace are ignored only
  for comparison, and an unbounded `281` is never heuristically split.
- Formalized one active EAN source per location: `document` or `manual`.
  `EAN klopt niet` clears the selected energy document, observations,
  candidates and document confirmation; selecting a new document clears manual
  input and confirmation. A pure mapper assertion rejects mixed sources.
- Reused the existing PDF adapter and customer-safe card/status/field/button
  CSS. Energy and charger documents now map bounded rows into one shared
  `Uit het document gehaald` presentation contract.
- Charger invoice observations remain observed/derived and are compared with
  declared MID, serial, brand, model, location, applicant and explicit
  installation year without prefilling or overwriting. An invoice date is not
  treated as an installation year, and no charger/MID identity or evidence is
  accepted or verified.
- Added local-only parity proof with the existing local energy and charger PDF
  fixtures. No fixture values or full EANs are emitted, and no database, SQL,
  RPC, Edge, Storage, OCR, persistence, package, submit, remote, deployment or
  production action is included.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-03 — PILOT-SIGNUP-EAN-PREFLIGHT-02 real-text-PDF and submit-attempt correction

- Corrected the previous preflight evidence boundary: its synthetic parser
  fixture did not prove the current real text-PDF shape, and field-local error
  placement did not prove that required errors were initially hidden.
- Extended the existing client parser for Flate-only streams, ToUnicode font
  mappings, page boundaries and coordinate-aware text-item composition. A column
  separator now prevents an 18-digit EAN and following contract date from
  becoming one numeric sequence.
- Proved privacy-safe against one local proof-only contract: exactly two
  observed candidates, classified as one electricity and one gas, without
  logging or committing document text, personal values or candidate values.
- Made the unique electricity candidate the only normal confirmation route; gas
  remains observed parser output. Manual fallback stays hidden until extraction
  cannot provide a unique route or the customer selects `EAN klopt
  niet`.
- Added one central `submitAttempted` visibility gate. Validation still computes
  every current error, while the UI shows none before the first submit attempt.
  An invalid click shows all field-local errors, focuses the first field and
  returns before mapping, client code or network access.
- The CTA remains visually active while idle and is disabled only during a
  genuine valid request. No successful browser submit was performed.
- No package, migration, SQL, RPC, Edge, Storage, OCR, intake/quarantine,
  document-promotion, mandate, CAR, remote or production behavior changed.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-03 — PILOT-SIGNUP-EAN-PREFLIGHT-01 local EAN preflight

- Connected the location-owned energy bill/contract `File` to the existing
  client-side PDF parser and text extractor. No second parser, OCR, server call,
  upload transport or business write was added.
- Added exact 18-digit EAN candidate extraction with electricity, gas and
  unclassified document-context labels. Candidate output remains observed; only
  explicit customer confirmation produces the existing declared signup payload
  field.
- Added location-scoped parser/reset state, stale-result protection, conditional
  manual fallback and exact 18-digit manual confirmation.
- Replaced the CTA's first-error message with stable field paths, field-local
  accessible errors and one shared signing-readiness gate. The obsolete
  dashboard-mandate sentence was removed without adding a signing claim.
- Persistence, signed mandate evidence, intake/quarantine runtime, Storage,
  e-mail verification, calendar-year scope, authority verification, CAR, kWh,
  migrations, SQL and Edge behavior remain outside this batch.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-07-29 — Prove PILOT-PARTY-01A authenticated customer party activation

- Added service-role-only `app_bootstrap_customer_auth_v3`, which reuses v2
  atomically and creates or resolves one canonical `app_parties` root plus the
  existing non-authoritative `account_owner` relationship per current
  customer.
- Preserved v1/v2 migrations and local function fingerprints exactly; the
  Auth Edge caller changed only from v2 to v3 and the safe v2 response contract
  remains unchanged.
- Recorded migration/proof/Edge hashes
  `3cecb481c0e8182d21454fea47030fb9bb5d3bb100511636d5d22dc4ec8b023d`,
  `9ef631f545df82f0d07b21d0f0c6cd2035a9ca4e0babaa0c232a70d72baed5fa`
  and `d59e52b1c41b7d9940756a1c70df07f8e22d7803024096e33ed23914c3f1ba7b`.
- `PILOT-PARTY-01A-Q01` through Q18 and marker
  `authenticated-customer-party-activation-proof-ok` are green, including
  exact fresh apply, real concurrency, resolve/conflict, rollback and cleanup.
- Real local party, relationship, profile, case and case-role tables remained
  empty. No frontend/CSS, profile, identifier, case role, legal identity,
  authority, mandate, remote, production or regulatory claim was added.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-07-29 — PILOT-SIGNUP-ATOMIC-01 atomic recoverable signup

- Replaced the current direct signup Edge multi-write sequence with one
  service-role-only `app_submit_signup_v4(jsonb)` transaction while retaining
  the existing safe `write_v3` public response.
- Added immutable `app_party_declaration_sources` for applicant-declared
  person or organization facts with request/payload provenance. Declaration
  is not verified identity, KvK, address, representation, mandate, EAN,
  eligibility, evidence acceptance or regulatory acceptance.
- Recorded local-only Q01-Q24 proof for replay, payload conflict, real
  concurrency, fail-closed audit, six rollback points, fresh apply, protected
  equality and disposable cleanup.
- No frontend/CSS, profile, case role, authority, mandate, EAN, remote,
  deployment or production work was included.

## 2026-07-30 — PILOT-PROFILE-02 declared profile and asserted case linkage

- Added service-role-only Auth bootstrap v4 over unchanged v1/v2/v3.
- Complete equivalent signup declaration coverage now creates or resolves one
  immutable declared WP2A profile and one asserted service-recipient claim per
  canonical case; no-source remains backward-compatible.
- The exact source timestamp remains `timestamptz`; profile `valid_from` is
  the deterministic Europe/Amsterdam business date. Q01-Q24 prove timezone
  independence, replay, concurrency, conflicts, rollback and cleanup locally.
- No verified identity/KvK, address, representation, mandate, EAN,
  case-confirmed, frontend, remote, deploy or production claim was added.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-07-30 — PILOT-CONNECTION-01B assisted connection correction

- Added a forward-only correction over the unchanged original migration: initial
  signup may defer EAN and then creates no declaration source.
- Moved exact 18-digit manual EAN behind a secondary action with explicit
  customer confirmation; removed required netbeheerder and connection-period
  input without adding CSS or another upload system.
- Bounded capture methods to confirmed energy-document or manual acquisition.
  Parser output remains observed/derived until confirmation.
- Q01-Q24 prove deferred/manual/parser boundaries, optional operator/period,
  unchanged v4, replay, conflict, concurrency, rollback and cleanup.
- The source is declaration only: no canonical connection/location, CAR,
  aangeslotene/ownership, party address, case-confirmed role, mandate,
  eligibility, verifier or regulatory acceptance is created.
- No commit, push, deploy or remote action is part of this batch.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-07-30 — PILOT-SIGNUP-JOURNEY-01 scoped frontend journey

- Reorganized the visible signup into exactly Aanvrager, Aansluiting en locatie,
  Laadpalen, Aanvullende documenten, and Controleren en afronden.
- Moved assisted EAN and one local energy-document selection into independent
  per-location state. Charger/MID invoice selection and its existing local
  preview remain per charger; the existing zakelijk-rijden document is now one
  dossier-wide conditional state.
- Reused the existing address, charger, upload, parser-preview, consent, review,
  layout, token and CSS modules. Added one location-scoped composition and one
  dossier-document composition; no upload/parser/summary/CSS system was
  duplicated.
- Current general conditions/privacy/fee acceptances remain general acceptances,
  not a definitive mandate. That scoped mandate follows after authenticated
  completion of the required connection facts.
- kWh remains dashboard-only and is absent from signup. Migrations, v4/v5,
  signup Edge, database contracts and Supabase configuration are unchanged.
- No staging, commit, push, deploy or remote action is part of this batch.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-03 — Recover bounded energy-document crosscheck

- Reused the existing PDF decoder, page/row/column reconstruction, EAN
  classifier, signup draft and shared card/status/field/layout CSS.
- Replaced global invoice-name/address promotion with semantic customer,
  delivery-address and supplier blocks plus explicit candidate metadata,
  validation, displayability and internal rejection reasons.
- Rejected combined Naam columns, post-/supplier addresses, multiple
  addresses/postcodes and label-only supplier values.
- Hid rejected/missing rows and removed the unavailable status pill; incomplete
  applicant/location input now keeps a displayable document value without a
  comparison claim.
- Preserved electricity/gas classification, contract-start detection, EAN
  confirmation, EAN klopt niet, manual fallback and the rule that only a
  confirmed electricity EAN reaches declared state.
- Proved Q01-Q37 on synthetic negative fixtures and the existing local real PDF
  without logging document values, full EANs or fixture PII. Parser,
  EAN-preflight, journey, mapper, contractfixture and client proofs are green.
- Parser output remains observed/derived; comparison is assistance, no customer
  input is overwritten and no database, SQL, RPC, Edge, package, OCR, remote,
  deployment, production or acceptance work was performed.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-07-31 — PILOT-SIGNUP-JOURNEY-02 compact five-step onboarding

- Superseded the uncommitted Journey-01 frontend composition with exactly
  Aanvrager, Locatie, Aansluiting, Laadpalen and Ondertekenen.
- Split address/precheck from location-scoped energy-document selection and
  reused one shared location-tab component for Aansluiting and Laadpalen.
- Removed manual EAN controls, the additional-document step and the expanded
  review from the active signup UI. The unchanged backend still accepts optional
  confirmed connection data, but signup no longer exposes that path.
- Kept charger invoices and their existing local preview per charger. EAN
  acquisition/confirmation, additional documents, kWh and the definitive scoped
  mandate remain authenticated dashboard tasks.
- Reused existing state, address, charger, upload, consent, tabs, tokens and
  CSS. Added one signup-scoped compact modifier; no inline styling or second
  upload, parser, location, charger or consent system was added.
- No migration, RPC, Edge, parser, upload transport, staging, commit, push,
  deploy or remote action is part of this batch.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-03 — PILOT-SIGNUP-PARTY-NAME-CROSSCHECK-03

- Added one pure accounttype-aware resolver for the expected document party:
  `firstName + lastName` for a private customer and the declared legal-entity
  name for a business or VvE. Administrator, representative, signer, contact,
  e-mail and display-name fallbacks are excluded.
- Replaced prefix, substring and broad fuzzy name behavior with deterministic
  `exact_full_match`, `initial_and_surname_match`, `mismatch` and
  `unavailable` outcomes. Organization comparison permits only bounded case,
  whitespace, diacritic and BV/NV punctuation normalization.
- Changed the private customer label to `Voornaam/voornamen (voluit)` and made
  mismatch actions focus the given names, surname or legal-entity name field.
- Kept initial-only comparison explicitly limited: an initial and complete
  surname do not prove the declared full given name. The NEa/Regeling source
  uses `naam` without resolving initials versus full given names; verifier
  acceptance therefore remains UNKNOWN.
- Energy and charger/MID documents reuse the same resolver and comparator.
  Parser observations remain derived assistance and create no identity,
  authority, aangeslotene, accepted-evidence, MID or ownership claim.
- Added local source/proof coverage with marker
  `signup-party-name-crosscheck-proof-ok`. No payload shape, backend, migration,
  RPC, Edge, database, package, remote, deploy or production action changed.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-03 — PILOT-SIGNUP-PARTY-RUNTIME-04

- Kept selected-document observations as location- or charger-scoped observed
  facts and derived both energy and charger party comparisons during render
  from the current account type, applicant/legal entity and displayable
  observation. Applicant changes therefore require no PDF reparse.
- Made account type a hard pre-submit draft boundary. An empty draft switches
  directly; a meaningful draft requires confirmation and then receives one
  completely fresh factory-built draft, without files, observations, EAN state,
  chargers, consent, validation visibility or hidden per-account-type history.
- Added one draft-generation guard so parser work started before a confirmed
  account-type reset cannot write into the fresh draft.
- Added integrated local runtime proof with marker
  `signup-party-runtime-04-proof-ok`. Local browser proof remains required; no
  accepted-evidence, identity, authority, verifier or production claim follows.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-04 — PILOT-SIGNUP-DOCUMENT-FIRST-UI-01

- Replaced the active form-first composition with exactly Account, Documenten,
  Controleren, Aanvullen and Ondertekenen, using one linear navigation model.
- Added one canonical document-first frontend draft and pure selectors for
  account requirements, review facts, open gaps, step completeness, mapper
  compatibility and fail-closed signing readiness.
- Kept parser observations separate from customer confirmations and manual
  corrections; document and manual EAN sources remain exclusive.
- Reused the upload slot, parser, observation and candidate models, crosschecks,
  address model, location tabs, EAN confirmation control, consent surface and
  existing CSS tokens. Added only one flow and one matrix CSS modifier.
- Added local proof marker `signup-document-first-ui-proof-ok` and updated only
  superseded focused journey assertions. Document persistence, mandate/signing
  persistence, successful submit, interactive browser, remote, deploy and
  production remain unproven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-04 — PILOT-SIGNUP-DOCUMENT-FIRST-REVIEW-02

- Collapsed the active signup into exactly Account, Documenten and
  Ondertekenen. Upload, parsing, cross-document review, missing values,
  ambiguity, correction and confirmation now share step 2.
- Added one common document-fact registry and one generic five-column row
  presentation for declared, energy-document and charger-invoice values.
- Kept parser observations separate from customer action. Manual corrections
  require a subsequent explicit confirmation and never become accepted evidence.
- Added dependency-scoped invalidation: replacing one document clears only
  confirmations and corrections that cite that document.
- Added a confirmed-only signing summary and signing record target. The sign
  action remains disabled; no legal copy, signature or successful submit was
  invented.
- Added real-fixture proof marker
  `signup-document-first-review-02-proof-ok`; simultaneous name and address
  differences block without logging document values or full EANs.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-04 — PILOT-SIGNUP-DOCUMENT-DECISION-03

- Made step-2 uploads a compact responsive card grid while retaining the one
  existing upload control and local parser path. Each card shows one title,
  its charger number where applicable, the input, safe filename and removal.
- Replaced generic cross-document equality with one pure semantic decision
  policy. It distinguishes clean, bounded-normalized, review-required,
  blocked, missing, ambiguous and not-applicable results.
- Kept contract holder versus buyer and delivery address versus invoice address
  as role differences requiring ENVAL review. A customer can state canonical
  intent without turning that review marker into accepted or verified truth.
- Restricted hard blocks to comparable material conflicts such as EAN, MID,
  serial, same-role parties and explicit delivery/install address conflicts.
- Changed the matrix to the canonical five columns ending in `Wordt gebruikt`,
  with real existing button classes and an initially blank canonical column.
- Kept Account, Locaties and Documenten in the compact signing summary, added
  one semantic charger table, and hid the unavailable sign action completely.
- Added local real-fixture proof marker
  `signup-document-decision-policy-03-proof-ok`. No payload, backend, schema,
  RPC, Edge, Storage, remote, deployment or evidence-acceptance boundary moved.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-04 — PILOT-SIGNUP-UNIFIED-DOCUMENT-PARSER-04

- Made `parseInvoicePdfInput(input)` the only active technical PDF entrypoint
  for both energy and charger uploads. Its input has no upload-slot, expected
  family, location, charger, account or matrix context.
- Added one generic observation envelope with parser version, SHA-256 content
  fingerprint, page count, document-type candidates, generic fact candidates,
  warnings and internally rejected candidates.
- Added separate pure content classification, semantic projection and upload
  slot compatibility layers. A slot expresses only an expectation after
  extraction; it cannot change classification or extracted facts.
- Cached observations by document/client ID together with fingerprint and
  parser version. Replacing or removing that document clears its cache and
  dependent local confirmations/corrections only.
- Added fail-closed document-level handling for wrong, ambiguous and unknown
  types. Wrong-type facts are not shown as valid matrix sources and do not
  produce a cascade of missing-field messages.
- Added real-fixture proof marker
  `signup-unified-document-parser-04-proof-ok`. Signing, submit, backend,
  persistence, browser acceptance, remote and production remain unproven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-04 — PILOT-SIGNUP-GENERIC-DOCUMENT-FACTS-05

- Corrected Parser-04 product behavior: document classification and upload-slot
  compatibility no longer participate in the active customer journey.
- Kept `parseInvoicePdfInput(input)` as the single technical PDF pipeline and
  retained same-bytes/same-version deterministic observation envelopes.
- Projected every supported generic fact into either matrix source column
  without changing value, confidence, extraction method, displayability or
  semantic-role metadata based on the upload slot.
- Reduced upload slots to source binding only. Missing required canonical facts
  and real material fact conflicts determine progression; document type does
  not.
- Replaced per-cell `Niet gevonden` text with `—` and added the bounded upload
  state `Geen gegevens gevonden.` when a parsed PDF has no supported facts.
- Removed the obsolete slot-compatibility module and customer copy for wrong or
  unrecognized document types. Internal descriptive type-candidate scores stay
  envelope metadata only and have no signup caller.
- Added real-fixture and no-fact proof marker
  `signup-generic-document-facts-05-proof-ok`. Signing, submit, backend,
  persistence, browser acceptance, remote and production remain unproven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-04 — PILOT-SIGNUP-ORGANIZATION-DOCUMENT-FIRST-07

- Reduced active Account step input for every account type to account type and
  e-mail. Legacy organization/KvK fields remain in compatibility and backend
  shapes but are no longer active customer inputs.
- Added one account-bound `KvK-uittreksel` PDF upload for Zakelijk/VvE through
  the existing `parseInvoicePdfInput(input)` path. Particulier has no such
  upload or matrix source column.
- Added organization name, KvK number, registered address, legal form, trade
  name, director/board-member and representation-text candidates. Extraction
  is content/layout based and retains raw values only inside the observation
  envelope.
- Made organization name, KvK number and registered address required for
  Zakelijk/VvE. Manual corrections cannot replace the selected account
  document. Legal form and the remaining organization facts are informational.
- Added account document binding to the preparation summary and isolated
  observed representation text under `Bevoegdheidsinformatie uit document`.
  It fills no signer and makes no authority decision.
- Improved the existing PDF decoder for inherited resource dictionaries and
  embedded ToUnicode font mappings; no second parser was introduced.
- Added proof marker contract
  `signup-organization-document-first-07-proof-ok`. Source/type/UI proofs pass,
  but the marker is not currently earned: no local Dutch standalone extract
  with the three required core facts was found. The real English extract does
  pass. This checkpoint therefore remains local fixture-blocked.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-05 — PILOT-SIGNUP-UNIFIED-PRESENTATION-08

- Replaced the three separate organization, document-check and signing-summary
  row renderers with one React-free fact presentation projector, one shared
  `FactTable` in `review` and `document` mode and one `FactReviewControls`.
- Kept applicability, observations, decisions, confirmations and manual
  corrections as the existing authorities. The presentation layer only maps
  those values to customer-safe rows, sources and judgments.
- Reused one configurable `DocumentUploadSlot` for the account extract, energy
  document and installation invoice. Upload scope and binding are props; parser
  orchestration and document-bound invalidation are unchanged.
- Grouped Step 2 by stable location and charger IDs with globally increasing
  visible charger numbers. Rebuilt Step 3 as one vertical, read-only document
  in Account, locations, chargers and Documents order.
- Kept signing copy, signing/persistence, submit, parser semantics, mapper,
  backend, database, remote and production outside this local frontend batch.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-05 — PILOT-SIGNUP-FACT-RESOLUTION-08B

- Centralized every customer fact in the React-free `pending`, `confirmed`,
  `review_required` and `blocked` resolution model, with exact neutral/green/
  orange/red judgments and one shared progression gate.
- Preserved every document observation and stable binding as a separate source;
  same document bytes in two bindings no longer count as two corroborating
  documents. Customer confirmation remains intent rather than evidence.
- Added explicit handling for one-document confirmation, distinct-document
  agreement, unresolved and customer-resolved conflicts, valid manual values,
  invalid values, bounded name matching and structured Dutch address matching.
- Rebuilt the shared review surface as the exact five-column table with a
  separate compact editor. Address correction exposes postcode, house number
  and suffix with the existing lookup preview. Location and charger tables are
  direct sibling sections.
- Added local proof marker `signup-fact-resolution-08b-proof-ok`. The English
  KvK real-fixture regression remains `ENGLISH_KVK_FIXTURE=BLOCKED`; no parser
  assumption or parser change was made. The available Dutch PDF also still
  misses exact `organizationName` in the Org-07 real-fixture proof.
- Signing, evidence acceptance, persistence, submit mapping, backend, database,
  remote, deploy, production and verifier/NEa acceptance remain outside scope.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-06 — PILOT-SIGNUP-SIGNATURE-CORE-09A

- Added a provider-independent signing core with a stable method port,
  method registry and one composition root. The only active method is
  `typed_name_otp_v1`; three future identifiers remain reserved and
  unimplemented.
- Added separate React-free canonical fact, signing-intent, signing-evidence,
  legal-document and generated mandate models. No evidence, hash, OTP or signed
  state is fabricated client-side.
- Registered privacy notice, service terms, fee terms and mandate separately.
  Existing incomplete legal sources are `UNKNOWN`/`DRAFT`, unverified and
  therefore keep readiness false.
- Extended the existing vertical Step 3 document after its canonical summary
  with mandate, privacy, service, fee, signer and readiness sections. There is
  no sign/submit action, canvas, print/scan route, fake OTP or success state.
- Added proof marker `signup-signature-core-09a-proof-ok`. Parser, semantic
  projector, submit mapper, migrations and backend remain hash-protected and
  unchanged by this batch.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-06 — PILOT-SIGNUP-SIGNING-KISS-09A1

- Reduced Step 3 to four customer sections: summary, mandate, one combined
  legal-bundle action and signing declaration. Removed customer-facing legal
  status pills, readiness reasons, method/version/hash language and placeholder
  legal routes.
- Kept summary confirmation separate from evidence and projected the single
  legal checkbox to three versioned actions without relaxing internal legal
  readiness.
- Added one canonical bundle render model plus a browser-only HTML preview and
  download adapter with new-context isolation and object-URL revocation.
- Changed mandate validity choices to current year plus two, added the exact
  customer permission/declaration wording and kept organization authority
  review unresolved.
- Centralized all tab, next and back transitions so the flow top is restored
  and the visible step heading receives focus without smooth scrolling or
  draft replacement.
- Added proof marker `signup-signing-kiss-09a1-proof-ok`. No parser, semantic
  projector, signup payload, backend, database, signing, OTP, persistence,
  remote or production behavior changed.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 2026-08-06 — PILOT-SIGNUP-SIGNING-LAYOUT-09A2

- Kept `DocumentFirstSigningSummary` as the single renderer and reduced its
  customer tables to `Gegeven`/`Waarde` and
  `Documentsoort`/`Bestandsnaam`.
- Grouped every location with its stable-ID-linked chargers in one bounded
  horizontal rail while retaining the projector's global charger numbering.
- Added only `SigningEntityGroup` as a presentation component; it composes
  sibling document-mode `FactTable`s and owns no fact or state logic.
- Placed Machtiging, Voorwaarden en privacy and Ondertekening in one responsive
  three-column composition. The mandate links to the existing full bundle and
  adds no fourth confirmation.
- Reused `normalizeName` on signer-name blur and reserved an empty 09B primary
  action boundary without rendering a signing button.
- Added marker `signup-signing-layout-09a2-proof-ok`. Signing, OTP, submit,
  persistence, parser, backend, database, remote and production remain
  unchanged or not implemented.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

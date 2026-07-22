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

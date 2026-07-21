# Remote Baseline And Retirement Plan

Status: TARGET — EXECUTION NOT APPROVED

Responsibility: legacy freeze, namespace isolation, baseline waves, cutover, rollback, retirement conditions, execution prerequisites, and abort criteria.

This is an execution plan only. Strategy selection is recorded separately in `docs/app/decisions/architecture-and-environment-decisions.md`. Nothing in this document grants permission to execute, deploy, apply migrations, repair migration history, run remote SQL, mutate Auth or Storage, change cron or project settings, edit runtime code or existing migrations, commit, or push.

Inspection date: 2026-07-19.

Branch at preparation batch: `main`.

HEAD at preparation batch: `f24b90263c3e22b8fdebd8c3fa016594ddfa7333`.

## Same-Project Decision

Selected strategy: `IN-PLACE PARALLEL REBUILD`.

| item | decision |
|---|---|
| Supabase project name | `enval` |
| project ref | `yzngrurkpfuqgexbhzgl` |
| region | `eu-west-2` |
| separate app project | Not feasible now because of Supabase project quota. |
| current remote legacy runtime | Remains active and untouched until replacement and retirement gates pass. |
| legacy technical rename | Not performed before cutover. |
| app namespace | New app must stay under `app_*`, `api-app-*`, and `app-documents`. |
| Auth users | Existing project Auth users remain; app access is isolated through app identity/cohort controls. |
| eventual legacy action | Controlled delete after replacement is preferred; preservation/export exceptions are determined by retention and legal proof. |

This decision accepts the shared-project risk only under strict namespace, Auth cohort, Storage, migration, deployment, cutover, rollback, and retirement isolation.

## Evidence Base

| source | evidence used |
|---|---|
| `docs/app/proofs/remote-baseline-and-recovery-gate.md` | Remote inventory, Phase 0, recovery, and PostgREST gate evidence. |
| `docs/app/decisions/architecture-and-environment-decisions.md` | Remote environment classification and selected same-project parallel-rebuild strategy. |
| this document | Legacy retirement remains blocked until app replacement, caller proof, data/export decisions, rollback proof, and an explicitly authorized deletion batch exist. |
| local migration inventory | Eight local app migrations exist; none are approved for remote execution in this batch. |
| local Edge Function inventory | Seven `api-app-*` functions exist locally; none are deployed remote today. |

## Evidence Chronology And Status Vocabulary

The operation plan consolidates the former retirement plan, Phase 1A execution specification, and in-place baseline plan. Evidence itself remains in `docs/app/proofs/remote-baseline-and-recovery-gate.md`.

| evidence date | responsibility | result used by this plan |
|---|---|---|
| 2026-07-19 | local Phase 1A inventory | local database had 15 `app_*` tables, no local legacy public tables, 9 public app functions, 23 FKs, and 7 local `app-documents` objects |
| 2026-07-19 | remote inventory | remote had 21 legacy tables, 12 legacy SQL functions/RPCs, 26 legacy/fallback Edge Functions, 5 active cron jobs, legacy Storage, and no remote app baseline |
| 2026-07-19/20 | Phase 0 and recovery gate | namespace collision/shadow proof and local recovery control passed; remote Wave 1 remains blocked by unresolved PostgREST platform health |

Required operational vocabulary:

| status | meaning |
|---|---|
| LOCAL DB ABSENT | Object was not found in the inspected local `public` schema. |
| REPOSITORY PRESENT | SQL, Edge Function, helper, script, or documentation source exists in the repo. |
| RUNTIME CALLER PRESENT | A repository caller/config/tool/test still refers to the candidate. |
| PROTECTED APP OBJECT | Local app object supports current proof or data and is not a retirement candidate. |
| DATA/STORAGE PROTECTED | Rows or Storage objects exist and require export/seed/retention decisions before reset, squash, or removal. |
| HISTORICAL MIGRATION - DO NOT DELETE YET | Migration history must remain until a separately authorized baseline strategy exists. |
| BLOCKED BY DEPLOYMENT PROOF | Removal is blocked until deployment, caller, and remote status are proven. |
| BLOCKED BY REMOTE DATA | Remote rows, Storage, FKs, cron dependencies, or unknown callers block removal. |
| KEEP - ACTIVE REMOTE | Deployed or scheduled runtime remains protected. |
| KEEP - EXTERNAL CALLER UNKNOWN | Source provenance or external callers are incomplete. |

## Local Phase 1A Inventory - 2026-07-19

Branch/HEAD at evidence run: `main` / `f24b90263c3e22b8fdebd8c3fa016594ddfa7333`.

| evidence area | result |
|---|---|
| local Supabase | reachable |
| stopped services | `supabase_imgproxy_enval`, `supabase_edge_runtime_enval`, `supabase_pooler_enval` |
| public/app/legacy table count | 15 / 15 / 0 |
| public functions/views/materialized views | 9 / 0 / 0 |
| public foreign keys | 23 |
| pg_cron | absent |
| migration metadata | `supabase_migrations.schema_migrations` exists with 0 rows |
| local Storage | private `app-documents`, 7 objects |

Protected local app objects:

| object | rows/objects | disposition |
|---|---:|---|
| `app_audit_events` | 753 | EXTEND; DATA/STORAGE PROTECTED |
| `app_customer_dossiers` | 328 | REPLACE LATER; DO NOT DROP NOW |
| `app_customer_identities` | 73 | EXTEND; DATA/STORAGE PROTECTED |
| `app_customers` | 211 | EXTEND; DATA/STORAGE PROTECTED |
| `app_dossier_chargers` | 68 | MIGRATE LATER; DO NOT DROP NOW |
| `app_dossier_document_files` | 286 | EXTEND; DATA/STORAGE PROTECTED |
| `app_dossier_document_slots` | 429 | EXTEND; DATA/STORAGE PROTECTED |
| `app_dossier_document_versions` | 164 | EXTEND; DATA/STORAGE PROTECTED |
| `app_dossier_legal_acceptances` | 60 | MIGRATE LATER; DO NOT DROP NOW |
| `app_dossier_locations` | 44 | EXTEND; DATA/STORAGE PROTECTED |
| `app_idempotency_keys` | 306 | EXTEND; DATA/STORAGE PROTECTED |
| `app_intake_audit_events` | 15 | EXTEND; DATA/STORAGE PROTECTED |
| `app_signup_intake_capabilities` | 0 | EXTEND; quarantine empty |
| `app_signup_intake_files` | 0 | EXTEND; quarantine empty |
| `app_signup_intakes` | 0 | EXTEND; quarantine empty |
| Storage bucket `app-documents` | 7 objects | EXTEND; DATA/STORAGE PROTECTED |

All 23 local FKs point to active app tables or `auth.users`. The document slots/files/versions form an interdependent evidence graph; quarantine links intakes/files/capabilities; customer identity binds to `auth.users`.

Protected local public functions were `app_bootstrap_customer_auth_v1`, `app_confirm_document_upload_v1`, `app_dossier_document_files_transition_guard`, `app_dossier_document_versions_transition_guard`, `app_reject_document_upload_v1`, `app_set_updated_at`, `app_signup_intake_files_transition_guard`, `app_signup_intakes_transition_guard`, and `app_withdraw_current_document_v1`.

Legacy public objects were locally absent, including `dossiers`, `dossier_sessions`, dossier charger/document/consent/check/audit/export and analysis families, `leads`, `contact_messages`, `outbound_emails`, legacy `idempotency_keys`, `retention_cleanup_events`, and `locked_unpaid_reminder_events`. Local absence is not permission to remove repository or remote objects.

## Repository Runtime Retirement Candidates

| candidate | caller/dependency evidence | disposition |
|---|---|---|
| `api-dossier-dev-unlock` | called by `assets/js/pages/dossier.js`; listed by edge inventory tooling | KEEP - CALLER PRESENT |
| `api-lead-submit` | called by `assets/js/script.js`; writes `contact_messages`; invokes `mail-worker` | KEEP - ACTIVE REMOTE |
| `mail-worker` | invoked by lead/login flows and active cron | KEEP - ACTIVE REMOTE |
| `locked-unpaid-reminder-worker` | calls reminder RPC and has active cron | KEEP - ACTIVE REMOTE |
| `retention-worker` | calls retention RPCs and has active cron | KEEP - ACTIVE REMOTE |
| `_shared/idempotency.ts` | no direct import found, but references legacy idempotency and remote rows exist | KEEP - EXTERNAL CALLER UNKNOWN |

No code-retirement execution is authorized. `_shared/idempotency.ts`, `api-dossier-dev-unlock`, and the locked-unpaid reminder set may only be investigated after source/deployment/caller and replacement proof.

## Protected Legacy Runtime

The current remote legacy runtime is production-adjacent and protected:

| protected area | remote evidence | rule |
|---|---|---|
| public legacy tables | 21 legacy tables, zero `app_*` tables | Do not drop, rename, rewrite, or backfill in an app baseline batch. |
| legacy SQL functions/RPCs | 12 legacy public functions/RPCs | Do not replace with app RPCs by name or shared behavior. |
| legacy Edge Functions/workers | 26 deployed legacy/fallback functions, zero `api-app-*` | Do not delete, rename, redeploy, or route over them before cutover gates. |
| legacy Storage | private `enval-dossiers`, 2 objects under `dossiers` | Do not reuse as app evidence bucket. |
| cron | 5 active legacy jobs | Do not pause or edit before owner/caller/retention proof. |
| Auth users | existing project Auth | Preserve users; isolate app access by explicit app binding/cohort. |
| migration history | 10 registered legacy migrations | Do not repair, reset, squash, or rewrite history. |

Legacy remains runtime-current but architecturally frozen for new ENVAL app work. New features must not be added to `dossier_*`, legacy `api-dossier-*`, legacy `dossier_sessions`, or legacy Storage.

## Planned App Baseline Boundary

| app area | planned namespace | isolation rule |
|---|---|---|
| database tables | `app_*` | No FK to legacy public tables and no legacy table writes. |
| SQL RPCs/functions | `app_*` | Security definer functions must use explicit `search_path` and app-only references. |
| Edge Functions | `api-app-*` | No calls to legacy `_shared` helpers that write legacy `idempotency_keys` or `dossier_audit_events`. |
| Storage | private `app-documents` bucket | No reuse of `enval-dossiers`; server-derived paths only. |
| Auth binding | `app_customer_identities` or successor app identity table | Existing Auth users are allowed only through explicit active app binding/cohort. |
| audit/idempotency | `app_audit_events`, `app_idempotency_keys`, or approved successor | App writes remain auditable and idempotent without mutating legacy truth. |
| frontend routing | app-specific route/config | No production route change before remote app proof and rollback plan. |

Direct name collision count against the planned app namespaces in the current remote inventory: `0`.

This zero count covers exact planned app families: remote has zero `app_*` tables, zero app SQL RPCs, zero deployed `api-app-*` functions, and no `app-documents` bucket. It does not remove the shared-project blast radius; migration dry-run and collision proof remain mandatory before any remote mutation.

## App Edge Function Baseline Classification

| function | primary dependencies | boundary | classification |
|---|---|---|---|
| `api-app-signup-submit` | app foundation, locations/chargers, slots, legal acceptances, app audit/idempotency | public pre-auth; no Storage | REFACTOR BEFORE DEPLOY |
| `api-app-auth-bootstrap` | Auth bootstrap RPC and app identity/customer access | verified Auth; no Storage | DEPLOY ONLY AFTER AUTH CONFIG AND EXPLICIT EXECUTION PERMISSION |
| `api-app-dashboard-get` | app customer auth and projection tables | verified Auth; read projection | DEPLOY ONLY AFTER SCHEMA AND EXPLICIT EXECUTION PERMISSION |
| `api-app-document-upload-url` | slots/files, audit/idempotency, private `app-documents` | signed upload URL | DEPLOY ONLY AFTER STORAGE GATE AND EXPLICIT EXECUTION PERMISSION |
| `api-app-document-upload-confirm` | files/versions/slots, confirm/reject RPCs, Storage byte/hash validation | confirmed bytes are not accepted evidence | DEPLOY ONLY AFTER STORAGE GATE AND EXPLICIT EXECUTION PERMISSION |
| `api-app-document-download-url` | app auth, slots/files/versions | signed download URL | DEPLOY ONLY AFTER STORAGE GATE AND EXPLICIT EXECUTION PERMISSION |
| `api-app-document-withdraw-current` | app auth, slots, idempotency, withdrawal RPC | no Storage delete; history preserved | DEPLOY ONLY AFTER SCHEMA AND EXPLICIT EXECUTION PERMISSION |

All seven functions were local-source/local-proof only at the recorded inventory date. None was deployed remotely.

## Migration Classification

No existing app migration is approved for verbatim remote execution in this batch. Every migration must be converted into a controlled baseline wave after Phase 0 proof.

| migration | classification | baseline handling |
|---|---|---|
| `20260707151801_app_foundation_schema.sql` | SPLIT INTO NEW BASELINE | Keep customer, identity, audit, and idempotency principles; split broad dossier shell toward target case/service concepts before production baseline. |
| `20260708120000_app_locations_chargers_schema.sql` | REUSED WITH CONTROLLED COPY | Reuse location/charger primitives only after EAN, connection, charge point, and history boundaries are reviewed. |
| `20260708133000_app_document_legal_slots_schema.sql` | SPLIT INTO NEW BASELINE | Split evidence slots from legal/mandate authority. Do not treat legal acceptance rows as final mandate model. |
| `20260711100000_app_document_files_versions_schema.sql` | REUSED WITH CONTROLLED COPY | Preserve immutable file/version graph after naming and evidence-decision boundaries are validated. |
| `20260711130000_app_document_upload_confirm_rpc.sql` | REUSED WITH CONTROLLED COPY | Preserve atomic confirm/reject pattern; confirmed upload remains byte/version proof, not accepted evidence. |
| `20260712100000_app_customer_auth_bootstrap_rpc.sql` | REUSED WITH CONTROLLED COPY | Deploy only after Auth redirect, verified-email, app cohort, and customer identity binding proof. |
| `20260715100000_app_document_withdraw_current_rpc.sql` | REUSED WITH CONTROLLED COPY | Preserve audit-first withdrawal without deleting Storage objects. |
| `20260716100000_app_signup_intake_quarantine_schema.sql` | DEFERRED | Hold until pre-auth quarantine Storage, expiry, abuse, capability, and promotion contracts are approved. |

No existing legacy migration is reused for the app baseline.

## Migration History Scenarios

All historical migration files remain protected. The inspected local migration metadata contained zero rows, while remote history contained 10 registered legacy migrations.

### Existing remote database

- Use forward-only migrations only.
- Do not edit, delete, squash, reorder, or repair registered history as a retirement mechanism.
- Any removal requires dependency, data/export, Storage, caller, legal-retention, rollback, and verification proof.

### New clean installation

- Decide separately whether historical replay is acceptable.
- If replay would recreate unwanted legacy objects, prepare a separately reviewed baseline/squash plan.
- Preserve app proof data through an explicit export/seed/fixture decision before reset.

### Local development

- Local app data and `app-documents` objects remain protected.
- Local legacy database removal is irrelevant because those objects were absent.
- Reset is unsafe by default while local app data, Storage linkage, and migration-history explanation remain unresolved.

## Baseline Wave Plan

| wave | purpose | allowed contents | required proof before wave | hard stop |
|---|---|---|---|---|
| 0 | Backup, collision, and migration dry-run proof | Read-only inventory, local/generated SQL lint, dry-run plan, backup/recovery evidence | project ref match, backup/recovery owner, collision proof, no mutation | Any unknown recovery path or app/legacy collision. |
| 0R | Recovery and remote execution gate | PostgREST diagnosis, backup/PITR/restore evidence, logical backup protocol, rollback/abort contract, Wave 1 review | Wave 0 collision/shadow proof; no remote mutation | PostgREST unhealthy/unknown, no backup path, no rollback owner, or unresolved restore blocker. |
| 1 | App core schema baseline | App-only core identity, customer/case shell, audit, idempotency, minimum grants, RLS deny-by-default | Wave 0R green, encrypted logical backup plus local restore dry-run complete, and Daan approves the exact mutation batch | Any `DROP`, legacy FK, legacy write, unqualified destructive SQL, or shared table name. |
| 2 | Auth/bootstrap and dashboard read | App Auth binding RPC, dashboard read functions for a test cohort only | Wave 1 green; Auth redirects and verified-email behavior proven | Any path exposing all existing Auth users to the app. |
| 3 | Evidence Storage and document functions | Private `app-documents`, signed upload/download, confirm/reject/withdraw functions | Storage policy proof, object path proof, SHA-256 confirm proof | Any reuse of `enval-dossiers` or accepted-evidence claim from upload confirmation. |
| 4 | Pre-auth intake/quarantine | Signup intake, quarantine files, capability tokens, expiry, promotion target | Abuse controls, expiry policy, capability storage proof, promotion rollback | Raw capability token storage or public write without quarantine controls. |
| 5 | Controlled public app cutover | Frontend route/config switch for approved app surface | Remote app proofs, smoke tests, rollback window, monitoring | Legacy traffic/caller uncertainty or missing rollback decision. |

Wave 0 is the exact next execution batch. It must not mutate the remote project.

## Auth Isolation

Existing Supabase Auth users stay in the project. App access must be isolated by explicit app binding and cohort controls:

- require verified Supabase Auth email for app customer access;
- resolve app access through `app_customer_identities` or its approved successor;
- expose only users with an active app binding/cohort, never all existing Auth users by default;
- avoid user enumeration through bootstrap and dashboard errors;
- keep legacy `dossier_sessions` outside the app auth model;
- prove redirect URLs, recovery URLs, email confirmation behavior, and JWT assumptions before deploying Auth-dependent app functions;
- use test cohorts before public access;
- keep service-role use server-side only.

## Storage Isolation

The app must use a separate private Storage boundary:

- planned bucket: `app-documents`;
- legacy bucket `enval-dossiers` remains untouched;
- paths are server-derived and app-scoped;
- recommended prefix families: `quarantine/`, `evidence/`, and `exports/`;
- signed URLs are short-lived and generated server-side;
- upload confirmation validates size, MIME, and SHA-256 before creating evidence version records;
- confirmed upload is not accepted evidence;
- quarantine expiry and cleanup are policy-driven, not arbitrary hardcoded TTLs;
- retention/legal hold must be resolved before object deletion.

## Backup And Recovery Prerequisites

Before the first remote mutation, the accepted recovery gate must prove and record:

- project ref and region match `yzngrurkpfuqgexbhzgl` / `eu-west-2`;
- owner decision: no Supabase Pro upgrade, no managed scheduled backups, no PITR, and no restore-to-new-project;
- database schema backup/export procedure;
- encrypted logical schema export outside the repo;
- encrypted logical data export procedure for protected legacy tables outside the repo;
- local restore dry-run to an isolated database;
- legacy Storage inventory for `enval-dossiers`;
- Auth user preservation expectation and recovery limitations;
- deployed Edge Function inventory;
- cron inventory and owner;
- secret inventory by names only, without printing secret values;
- restore owner, maximum acceptable downtime, and abort criteria;
- forward-only rollback pattern for app baseline migrations;
- no dependency on destructive `db reset`, migration repair, or `DROP CASCADE`.

Managed platform backups are not a prerequisite because they are unavailable under the accepted no-Pro decision. Logical backup is not equivalent to PITR, but it is the owner-accepted mandatory recovery control before any remote mutation.

No backup download, production export, or restore rehearsal is performed in this document.

### Logical Recovery Protocol Before Any Future Remote Mutation

1. Create an encrypted schema-only public export outside the repository.
2. Create an encrypted data-only export for protected legacy tables under an explicitly authorized data-handling scope.
3. Capture pre-export row counts and public object inventory.
4. Capture remote migration history without repair or apply.
5. Capture Auth user counts without user details unless separately authorized.
6. Capture Storage metadata without signed URLs; object bytes require separate authorization.
7. Capture Edge Function names/versions and source provenance without secrets.
8. Capture cron names/schedules and safe command fingerprints, not secret-bearing command bodies.
9. Inventory secret names only; never export values to documentation or logs.
10. Capture Netlify/DNS routing metadata without environment-secret values.
11. Hash encrypted artifacts and safe manifests.
12. Record encryption/recovery owner and retention/destruction owner.
13. Restore into an isolated local database and compare row/object counts.
14. Remove plaintext temporary artifacts and the restore database after proof.
15. Record rollback owner, expected restore time, maximum downtime, and abort criteria.

## Cutover Gates

Public app cutover is blocked until all gates below are green:

1. Remote app schema exists under approved `app_*` baseline only.
2. `api-app-*` functions are deployed and smoke-tested against app-only objects.
3. Auth cohort proof shows only intended app users can enter.
4. `app-documents` Storage proof is complete.
5. No app function writes legacy tables or legacy audit/idempotency tables.
6. Frontend route/config rollback path is documented.
7. Legacy public traffic and external callers are mapped.
8. Cron behavior is either unchanged legacy or explicitly replaced by app-owned cron.
9. Evidence, audit, and idempotency proofs are retained.
10. Daan approves the cutover batch.

## Retirement Gates

Legacy deletion is downstream of app replacement and requires a separate batch. Preferred order:

1. disable legacy frontend callers after app cutover proof;
2. pause legacy cron only after owner and data-impact proof;
3. disable destructive legacy workers before deleting their tables;
4. delete or disable legacy public functions after external caller proof;
5. delete internal legacy functions after public functions and cron no longer depend on them;
6. export legacy data where retention, audit, or customer evidence requires it;
7. preserve or isolate any legally retained legacy data;
8. drop remaining legacy tables through forward-only migrations;
9. delete legacy Storage only after retention/legal gate;
10. never rewrite old registered migrations as the retirement mechanism.

## Hard Stops

Stop the batch immediately if any of the following is true:

- project ref differs from `yzngrurkpfuqgexbhzgl`;
- encrypted logical backup owner, restore owner, or abort owner is unknown before mutation;
- planned app object collides with an existing remote object;
- baseline SQL touches a legacy object;
- baseline SQL contains unreviewed `DROP`, `DROP CASCADE`, migration repair, reset, or unqualified destructive statements;
- app SQL creates FK dependencies to legacy public tables;
- app Edge Function writes legacy tables or legacy idempotency/audit tables;
- Auth path exposes all existing project users as app customers;
- Storage bucket or policy is not isolated from `enval-dossiers`;
- cron command or owner is unknown for any affected worker;
- secrets are printed in docs or logs;
- verifier/REV/kWh functionality is treated as complete while TKV-dependent requirements remain blocked.

## Exact Next Batch

Next batch:

`Gate 1 Local EAN And Connection Domain Foundation`

Scope for that batch:

- local-only domain foundation for EAN, aansluiting, laadlocatie, laadpunt, meetconstructie, and evidence boundaries;
- no remote SQL apply;
- no `db push`;
- no migration repair;
- no deploy;
- no Auth/Storage/cron mutation;
- no legacy retirement;
- preserve the unresolved PostgREST dashboard/platform health as a remote Wave 1 no-go unless explicitly closed or handled by a later support-risk decision.

Already completed recovery prerequisites:

- recoverable age recipient exists outside the repo;
- encrypted public logical DB backup exists outside the repo;
- Storage/Auth/Edge Function/cron manifests exist outside the repo;
- isolated local restore dry-run passed;
- temp plaintext and restore database were cleaned up.

## Phase 0 Result - 2026-07-19

Phase 0 proof document: `docs/app/proofs/remote-baseline-and-recovery-gate.md`.

Result:

- remote app namespace collision count: `0`;
- remote `app-documents` bucket collision count: `0`;
- remote `api-app-*` function collision count: `0`;
- clean shadow app baseline apply: PASS;
- legacy-shape plus app baseline apply: PASS;
- static safety proof: PASS;
- temporary shadow cleanup: PASS;
- backup/PITR/latest backup/restore readiness at Phase 0 time: managed backups unavailable and owner risk accepted; encrypted logical backup plus restore dry-run still required then and later completed on 2026-07-20.

Historical conclusion: `PARTIAL — BLOCKED` for remote mutation because the encrypted logical backup and restore dry-run had not yet been executed. This recovery blocker is now superseded by the 2026-07-20 PASS; the remaining remote blocker is PostgREST platform health.

Wave 1 proposal location: `supabase/baseline-proposals/wave-1/`.

No Wave 1 remote execution is approved by this result.

## Recovery Gate Result - 2026-07-19

Recovery gate document: `docs/app/proofs/remote-baseline-and-recovery-gate.md`.

Result:

- project metadata: `ACTIVE_HEALTHY`;
- database read-only health: PASS;
- keyless REST probe: HTTP `401` with missing API key, proving gateway/project reachability only;
- manual dashboard PostgREST: `Unhealthy`;
- manual dashboard last backup: `No backups`;
- managed PITR/restore-to-new-project unavailable and owner risk accepted; logical backup/restore dry-run was still not executed at that historical gate;
- Wave 1 proposal review: all five proposal files approved as migration candidates after minor grant revision;
- static/clean/legacy-shape proofs after revision: PASS.

Terminal-first blocker follow-up:

- official CLI backup metadata: `backups=[]`, `pitr_enabled=false`;
- owner decision: no Pro upgrade, no managed scheduled backups, no PITR, no restore-to-new-project, accepted operational risk;
- authorized PostgREST proof: current remote public keys reach table routes and receive expected access denial or app-table route-not-found;
- functional PostgREST request path: `PARTIAL PROVEN`;
- dashboard/platform PostgREST health: `UNHEALTHY / UNRESOLVED`;
- PostgREST classification: `B. POSTGREST DEGRADED BUT REQUEST PATH AVAILABLE`;
- logical backup plus local restore dry-run was mandatory and is now completed as a local recovery control.

Historical conclusion: `NO-GO — RECOVERY RECIPIENT MISSING; POSTGREST PLATFORM HEALTH UNRESOLVED`. The recipient and restore blockers are superseded by the 2026-07-20 recovery PASS; PostgREST platform health remains unresolved.

No Wave 1 remote execution is approved until PostgREST platform health is closed or Daan explicitly approves a later support-risk execution gate.

## Encrypted Backup Attempt - 2026-07-20

Historical attempt: the backup/restore gate stopped before any dump because no safe recoverable encryption recipient existed:

- `age` is not installed;
- GPG is installed but the local keyring has no usable existing recipient key;
- no passphrase was entered interactively;
- no backup directory, plaintext dump, encrypted artifact, or restore database was created.

This attempt is superseded by the recovery execution PASS below. Wave 1 remains execution-not-started because PostgREST platform health remains unresolved.

## Recovery Recipient And Platform Health - 2026-07-20

Current status:

- recovery recipient: PASS;
- `age` and `age-keygen` v1.3.1 are installed locally;
- age identity/recipient exists outside the repo and roundtrip test passed;
- encrypted public logical DB backup exists outside the repo;
- restore dry-run passed in isolated local database `enval_recovery_restore_20260720_040426`;
- restore database and plaintext temp files were removed after proof;
- PostgREST functional request path is `PARTIAL PROVEN`;
- dashboard/platform PostgREST health remains `UNHEALTHY / UNRESOLVED`;
- Wave 1 remains execution-not-started.

## Browsercheck Policy For Baseline Work

Browserchecks are not default requirements for documentation-only batches, read-only schema inventory, SQL proposal review, shadow apply, collision proof, migration lint, remote function inventory, backup manifests, restore dry-runs, or non-visible backend proposal batches.

Browserchecks remain required for visible UI changes, customer journeys, browser Auth/session behavior, upload/download/customer-facing flows, console/network regressions, and dashboard-only platform settings when no safe terminal interface exists.

Dashboard-only facts require at most a short targeted manual confirmation, not a full browser QA batch. The backup subscription decision is closed and must not be rechecked in future batches unless Daan changes the owner decision.

## Confirmation

The original preparation batch created a document plan only. The later Phase 0 proof added proposal SQL and non-mutating proof tooling, but still did not create active migrations, deploy functions, alter Auth, alter Storage, alter cron, mutate the remote project, change runtime code, edit existing active SQL migrations, commit, or push.

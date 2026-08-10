# Remote Baseline And Recovery Gate Proof

Status: PROOF ONLY — NO IMPLEMENTATION APPROVAL

SAFE RETIREMENT NOT PROVEN.

Responsibility: dated remote inventory, Phase 0 shadow proof, recovery/backup proof, PostgREST status, remote execution gate, and remaining blockers.

This document records evidence only. It is not architecture canon, an execution plan, or permission to mutate a remote environment. No remote database object, Storage object, Edge Function, migration history, secret, deployment, code file, SQL file, config file, commit, or push was changed by the source proof batches.

Inspection date: 2026-07-19.

Branch at inventory: `main`.

HEAD at inventory: `f24b90263c3e22b8fdebd8c3fa016594ddfa7333`.

## 2026-07-19 Remote Inventory — Scope And Safety

Absolute prohibitions observed:

- no commit;
- no push;
- no deploy;
- no function delete;
- no migration apply;
- no migration repair;
- no `db push`;
- no `db pull` that creates tracked schema changes;
- no `db reset`;
- no SQL mutation;
- no Storage mutation;
- no secrets printed.

Read-only sources used:

- `supabase/.temp/project-ref` for the linked project reference;
- `supabase projects list`;
- `supabase migration list --linked`;
- `supabase functions list --project-ref yzngrurkpfuqgexbhzgl`;
- `supabase db query --linked` with metadata and aggregate-only `SELECT` statements;
- repo grep over functions, scripts, config, docs, and callers.

Direct `psql` via `supabase/.temp/pooler-url` was attempted once and failed because no password was supplied. It was not used as evidence and did not print a password.

## Project Identity

| field | value |
|---|---|
| linked project ref | `yzngrurkpfuqgexbhzgl` |
| linked Supabase project name | `enval` |
| linked organization id/slug | `bwoxbyumiahshccecfwr` |
| region | `eu-west-2` |
| project status | `ACTIVE_HEALTHY` |
| remote database host | `db.yzngrurkpfuqgexbhzgl.supabase.co` |
| remote database version from projects list | `17.6.1.054` |
| remote database version from SQL | `17.6` |
| Supabase CLI version | `2.109.1` |
| repository remote URL | `https://github.com/daankoote/savri.git` |
| environment classification | `LEGACY PRODUCTION` with public traffic proof still to confirm before retirement |

Environment classification rationale: the linked remote is active and contains legacy runtime, cron jobs, Storage, and deployed Edge Functions. The repository root/static site is documented as the current production surface, `netlify.toml` publishes that root surface, and legacy functions allow `enval.nl` origins. Public traffic, DNS, Netlify environment variables, and external callers still require proof before any retirement action.

Project-name normalization note: `Savri` was an earlier Supabase dashboard name for this same project. It is not a separate project, environment, or application. The technical project identifier remains `yzngrurkpfuqgexbhzgl`.

## Command Results

| evidence_area | command_family | exit_code | result |
|---|---:|---:|---|
| CLI version | `supabase --version` | 0 | Success. |
| project list | `supabase projects list` | 0 | Success; one linked project found. |
| migration list | `supabase migration list --linked` | 0 | Success. |
| function list | `supabase functions list --project-ref ...` | 0 | Success. |
| remote identity SQL | `supabase db query --linked` | 0 | Success. |
| public tables/RLS | `supabase db query --linked` | 0 | Success. |
| information_schema views | `supabase db query --linked` | 130 | Canceled after hanging; not used as evidence. |
| pg_class views/materialized views | `supabase db query --linked` | 0 | Success; replacement evidence used. |
| public functions/RPCs | `supabase db query --linked` | 0 | Success. |
| triggers | `supabase db query --linked` | 0 | Success. |
| foreign keys | `supabase db query --linked` | 0 | Success. |
| RLS policies | `supabase db query --linked` | 0 | Success. |
| exact aggregate counts | `supabase db query --linked` | 0 | Success; aggregate counts only. |
| expected app table presence | `supabase db query --linked` | 0 | Success. |
| extensions | `supabase db query --linked` | 0 | Success. |
| cron relation metadata | `supabase db query --linked` | 0 | Success. |
| `to_regclass('cron.job')` | `supabase db query --linked` | 130 | Canceled after hanging; not used as evidence. |
| cron count/metadata | `supabase db query --linked` | 0 | Success; no cron command bodies printed. |
| Storage buckets | `supabase db query --linked` | 0 | Success. |
| Storage object counts | `supabase db query --linked` | 0 | Success; aggregate only. |
| Storage top-level prefixes | `supabase db query --linked` | 0 | Success; top-level prefix only. |

## Remote Migration History

Remote registered migration count: 10.

Local migration file count: 18.

| version | local_file | remote_status | classification |
|---|---|---|---|
| `20260305` | `20260305_0001_rls_dossier_sessions.sql` | registered as `0001_rls_dossier_sessions` | LOCAL AND REMOTE MATCH |
| `20260309` | `20260309_rename_meter_id_to_mid_number.sql` | registered as `rename_meter_id_to_mid_number` | LOCAL AND REMOTE MATCH |
| `20260317` | `20260317_01_analysis_runs_refactor.sql` | registered as `01_analysis_runs_refactor` | LOCAL AND REMOTE MATCH |
| `20260324` | `20260324_drop_serial_unique_indexes_dossier_chargers.sql` | registered as `drop_serial_unique_indexes_dossier_chargers` | LOCAL AND REMOTE MATCH |
| `20260511` | `20260511_parametrize_retention_cleanup_config.sql` | registered as `parametrize_retention_cleanup_config` | LOCAL AND REMOTE MATCH |
| `20260513` | `20260513_retention_cleanup_events.sql` | registered as `retention_cleanup_events` | LOCAL AND REMOTE MATCH |
| `20260514` | `20260514_locked_unpaid_reminders.sql` | registered as `locked_unpaid_reminders` | LOCAL AND REMOTE MATCH |
| `20260515` | `20260515_locked_unpaid_reminders_conflict_fix.sql` | registered as `locked_unpaid_reminders_conflict_fix` | LOCAL AND REMOTE MATCH |
| `20260516` | `20260516_locked_unpaid_reminders_identity_fix.sql` | registered as `locked_unpaid_reminders_identity_fix` | LOCAL AND REMOTE MATCH |
| `20260518` | `20260518_revoke_audit_final_table_client_grants.sql` | registered as `revoke_audit_final_table_client_grants` | LOCAL AND REMOTE MATCH |
| `20260707151801` | `20260707151801_app_foundation_schema.sql` | not registered remote | LOCAL ONLY |
| `20260708120000` | `20260708120000_app_locations_chargers_schema.sql` | not registered remote | LOCAL ONLY |
| `20260708133000` | `20260708133000_app_document_legal_slots_schema.sql` | not registered remote | LOCAL ONLY |
| `20260711100000` | `20260711100000_app_document_files_versions_schema.sql` | not registered remote | LOCAL ONLY |
| `20260711130000` | `20260711130000_app_document_upload_confirm_rpc.sql` | not registered remote | LOCAL ONLY |
| `20260712100000` | `20260712100000_app_customer_auth_bootstrap_rpc.sql` | not registered remote | LOCAL ONLY |
| `20260715100000` | `20260715100000_app_document_withdraw_current_rpc.sql` | not registered remote | LOCAL ONLY |
| `20260716100000` | `20260716100000_app_signup_intake_quarantine_schema.sql` | not registered remote | LOCAL ONLY |

Quarantine migration status: `20260716100000_app_signup_intake_quarantine_schema.sql` is LOCAL ONLY. It is not registered in the linked remote migration history and its three expected remote tables are not present.

Ignored migration files: none found in the scoped migration directory.

Migration repair was not used.

## Remote Database Inventory

Remote public table count: 21.

Remote app table count: 0.

Remote legacy table count: 21.

Remote public view count: 0.

Remote public materialized view count: 0.

Remote public function/RPC count: 12.

Remote public FK count: 24.

Remote public trigger event rows: 15.

Remote public policy count: 15.

Remote `pg_cron`: present.

Remote cron jobs: 5 active jobs.

### Remote Public Tables

Exact row counts below are aggregate counts only. No row contents were selected.

| table | exact_rows | rls | classification |
|---|---:|---|---|
| `contact_messages` | 0 | enabled | legacy |
| `dossier_analysis_charger` | 0 | enabled | legacy |
| `dossier_analysis_document` | 0 | enabled | legacy |
| `dossier_analysis_runs` | 0 | enabled | legacy |
| `dossier_analysis_summary` | 0 | enabled | legacy |
| `dossier_audit_events` | 0 | enabled | legacy |
| `dossier_chargers` | 0 | enabled | legacy |
| `dossier_checks` | 0 | enabled | legacy |
| `dossier_consents` | 0 | enabled | legacy |
| `dossier_document_observed_sources` | 0 | enabled | legacy |
| `dossier_documents` | 0 | enabled | legacy |
| `dossier_exports` | 3 | enabled | legacy data present |
| `dossier_sessions` | 0 | enabled | legacy |
| `dossiers` | 0 | enabled | legacy |
| `idempotency_keys` | 15 | enabled | legacy data present |
| `installers` | 0 | enabled | legacy |
| `intake_audit_events` | 0 | enabled | legacy |
| `leads` | 1 | enabled | legacy data present |
| `locked_unpaid_reminder_events` | 0 | enabled | legacy |
| `outbound_emails` | 1 | enabled | legacy data present |
| `retention_cleanup_events` | 1 | enabled | legacy data present |

### Expected App Tables

All expected app tables from the local app foundation were absent from remote during this inventory:

- `app_audit_events`;
- `app_customer_dossiers`;
- `app_customer_identities`;
- `app_customers`;
- `app_dossier_chargers`;
- `app_dossier_document_files`;
- `app_dossier_document_slots`;
- `app_dossier_document_versions`;
- `app_dossier_legal_acceptances`;
- `app_dossier_locations`;
- `app_idempotency_keys`;
- `app_intake_audit_events`;
- `app_signup_intake_capabilities`;
- `app_signup_intake_files`;
- `app_signup_intakes`.

### Remote Public Functions And RPCs

| function | kind | security_definer | retirement relevance |
|---|---|---:|---|
| `_enval_block_update_delete` | trigger | false | legacy immutability guard |
| `_enval_enforce_document_lifecycle` | trigger | true | legacy document lifecycle guard |
| `enval_dev_reset` | RPC | false | legacy/dev reset risk |
| `enval_queue_locked_unpaid_reminders` | RPC | true | active legacy reminder worker dependency |
| `enval_retention_cleanup` | RPC | true | active legacy retention worker dependency |
| `enval_retention_cleanup_apply_after_storage` | RPC | true | active legacy retention worker dependency |
| `rls_auto_enable` | event trigger | true | legacy/global RLS helper |
| `set_annual_kwh_estimate` | trigger | false | legacy lead helper |
| `set_locked_unpaid_reminder_events_updated_at` | trigger | false | legacy reminder helper |
| `set_retention_cleanup_events_updated_at` | trigger | false | legacy retention helper |
| `set_updated_at` | trigger | false | legacy timestamp helper |
| `validate_installer_ref` | RPC | true | legacy installer helper |

No remote public `app_*` SQL functions/RPCs were found.

### Triggers, FKs, RLS And Policies

Remote legacy tables have active RLS. The policy inventory showed `deny_all` policies for anon/authenticated on 15 public tables:

- `contact_messages`;
- `dossier_audit_events`;
- `dossier_chargers`;
- `dossier_checks`;
- `dossier_consents`;
- `dossier_documents`;
- `dossier_sessions`;
- `dossiers`;
- `idempotency_keys`;
- `installers`;
- `intake_audit_events`;
- `leads`;
- `locked_unpaid_reminder_events`;
- `outbound_emails`;
- `retention_cleanup_events`.

Remote FKs connect legacy analysis, documents, sessions, chargers, checks, consents, exports, leads, installers, and outbound email around `dossiers`. This means legacy object deletion is not dependency-free even where row counts are zero.

Remote trigger evidence includes:

- immutable/update-delete guards on `dossier_audit_events` and `dossier_exports`;
- document lifecycle guard on `dossier_documents`;
- update timestamp triggers on legacy tables;
- lead kWh estimate trigger;
- retention and locked-unpaid reminder update triggers.

## Remote Cron Inventory

`pg_cron` is installed. The `cron.job` relation exists. Five active jobs were found. Cron command bodies were intentionally not printed.

| jobid | jobname | schedule | active | classification |
|---:|---|---|---:|---|
| 8 | `enval-mail-worker-every-2-min` | `*/2 * * * *` | true | SCHEDULED CALLER |
| 18 | `enval-retention-worker-dry-run-daily` | `0 6 * * *` | true | SCHEDULED CALLER |
| 19 | `enval-retention-worker-apply-daily` | `10 6 * * *` | true | SCHEDULED CALLER |
| 20 | `enval-locked-unpaid-reminder-worker-dry-run-daily` | `15 6 * * *` | true | SCHEDULED CALLER |
| 21 | `enval-locked-unpaid-reminder-worker-apply-daily` | `20 6 * * *` | true | SCHEDULED CALLER |

## Remote Storage Inventory

| bucket | public | object_count | top_level_prefix_count | status |
|---|---:|---:|---:|---|
| `enval-dossiers` | false | 2 | 1 | legacy Storage present |

Top-level prefix aggregate:

| bucket | top_level_prefix | object_count |
|---|---|---:|
| `enval-dossiers` | `dossiers` | 2 |

The local app bucket `app-documents` was not present in the linked remote Storage metadata.

No Storage object names under the first prefix level were printed.

## Remote Edge Function Inventory

Remote deployed Edge Function count: 26.

Remote deployed `api-app-*` function count: 0.

Remote deployed legacy/fallback function count: 26.

| function | remote_status | version | verify_jwt | local_source | caller_classification | retirement_status |
|---|---:|---:|---:|---|---|---|
| `mail-worker` | DEPLOYED REMOTE | 40 | false | yes | SCHEDULED CALLER; INTERNAL RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-lead-submit` | DEPLOYED REMOTE | 80 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-get` | DEPLOYED REMOTE | 42 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-upload-url` | DEPLOYED REMOTE | 52 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-email-verify-start` | DEPLOYED REMOTE | 19 | true | no | EXTERNAL CALLER UNKNOWN | KEEP - EXTERNAL CALLER UNKNOWN |
| `api-dossier-email-verify-complete` | DEPLOYED REMOTE | 19 | true | no | EXTERNAL CALLER UNKNOWN | KEEP - EXTERNAL CALLER UNKNOWN |
| `api-dossier-charger-save` | DEPLOYED REMOTE | 61 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-address-save` | DEPLOYED REMOTE | 46 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-consents-save` | DEPLOYED REMOTE | 40 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-address-verify` | DEPLOYED REMOTE | 27 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-evaluate` | DEPLOYED REMOTE | 58 | true | yes | CUSTOMER RUNTIME CALLER; TEST CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-charger-delete` | DEPLOYED REMOTE | 43 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-address-preview` | DEPLOYED REMOTE | 20 | false | no | EXTERNAL CALLER UNKNOWN | KEEP - EXTERNAL CALLER UNKNOWN |
| `api-dossier-doc-download-url` | DEPLOYED REMOTE | 21 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-doc-delete` | DEPLOYED REMOTE | 45 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-submit-review` | DEPLOYED REMOTE | 21 | false | no | EXTERNAL CALLER UNKNOWN | KEEP - EXTERNAL CALLER UNKNOWN |
| `api-dossier-access-save` | DEPLOYED REMOTE | 27 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-access-update` | DEPLOYED REMOTE | 24 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-upload-confirm` | DEPLOYED REMOTE | 36 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-export` | DEPLOYED REMOTE | 39 | true | yes | CUSTOMER RUNTIME CALLER; TEST CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-login-request` | DEPLOYED REMOTE | 5 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-verify` | DEPLOYED REMOTE | 50 | true | yes | CUSTOMER RUNTIME CALLER; TEST CALLER | KEEP - ACTIVE REMOTE |
| `api-dossier-dev-unlock` | DEPLOYED REMOTE | 5 | true | yes | CUSTOMER RUNTIME CALLER in static fallback; dev helper risk | KEEP - CALLER PRESENT |
| `api-dossier-observed-source-upsert` | DEPLOYED REMOTE | 4 | true | yes | CUSTOMER RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `retention-worker` | DEPLOYED REMOTE | 5 | true | yes | SCHEDULED CALLER; INTERNAL RUNTIME CALLER | KEEP - ACTIVE REMOTE |
| `locked-unpaid-reminder-worker` | DEPLOYED REMOTE | 1 | true | yes | SCHEDULED CALLER; INTERNAL RUNTIME CALLER | KEEP - ACTIVE REMOTE |

Local source-only app functions:

- `api-app-auth-bootstrap`;
- `api-app-dashboard-get`;
- `api-app-document-download-url`;
- `api-app-document-upload-confirm`;
- `api-app-document-upload-url`;
- `api-app-document-withdraw-current`;
- `api-app-signup-submit`.

Classification: LOCAL SOURCE ONLY / NOT LISTED REMOTE. This classification is allowed because the remote function list succeeded for the linked project.

Remote-only deployed functions without local source in `supabase/functions`:

- `api-dossier-email-verify-start`;
- `api-dossier-email-verify-complete`;
- `api-dossier-address-preview`;
- `api-dossier-submit-review`.

Classification: DEPLOYED REMOTE / EXTERNAL CALLER UNKNOWN. Do not delete until source provenance, external callers, and replacement are proven.

## Caller And Operations Inventory

| candidate | repository evidence | classification |
|---|---|---|
| `api-dossier-*` old wizard endpoints | `assets/js/pages/dossier.js`, legacy scripts, shell tests, tools | CUSTOMER RUNTIME CALLER / TEST CALLER |
| `api-dossier-dev-unlock` | `assets/js/pages/dossier.js`, `scripts/tools/edge-uniformity.sh` | CUSTOMER RUNTIME CALLER / TOOLING CALLER |
| `api-lead-submit` | `assets/js/script.js`, shell tests, old contact/intake flow | CUSTOMER RUNTIME CALLER |
| `mail-worker` | remote cron job and `api-lead-submit` / `api-dossier-login-request` source references | SCHEDULED CALLER / INTERNAL RUNTIME CALLER |
| `retention-worker` | remote cron jobs, source calls `enval_retention_cleanup*`, `scripts/tools/retention-storage-cleanup.mjs` | SCHEDULED CALLER / INTERNAL RUNTIME CALLER |
| `locked-unpaid-reminder-worker` | remote cron jobs, source calls `enval_queue_locked_unpaid_reminders` | SCHEDULED CALLER / INTERNAL RUNTIME CALLER |
| `api-app-*` functions | app frontend/proof source references | LOCAL SOURCE ONLY; NOT LISTED REMOTE |
| GitHub Actions | `.github` directory absent | NO CALLER FOUND |
| Netlify/root static deploy | `netlify.toml`, `README.md` boundary, root static assets | CUSTOMER RUNTIME / PUBLIC WEBSITE CONTEXT |
| docs references | active docs warn not to use legacy endpoints for new app architecture | DOCS ONLY |

External callers remain UNKNOWN for deployed remote-only functions and for any public URL or scheduled system not represented in this repository.

## Local Versus Remote Difference

| area | local evidence from 07D | remote evidence from this inventory | conclusion |
|---|---|---|---|
| public tables | 15 `app_*`; 0 legacy | 21 legacy; 0 `app_*` | local and remote are different databases/states |
| app migrations | present locally | not registered remote | app migration deployment not proven |
| quarantine schema | present locally, empty | not present remote | quarantine is LOCAL ONLY |
| public functions/RPCs | 9 app functions | 12 legacy functions/RPCs | app RPCs not remote |
| Storage | `app-documents`, 7 objects | `enval-dossiers`, 2 objects | Storage stacks differ |
| Edge Functions | source has app and legacy | remote has legacy only, 0 app | app function deployment not proven |
| pg_cron | absent locally | present remote, 5 active jobs | remote has active scheduled legacy runtime |
| migration history | local table exists, 0 rows | 10 legacy migrations registered | remote has historical legacy baseline |

## Retirement Matrix

No candidate receives `SAFE TO DELETE` in this batch.

| candidate | local_db | remote_db | local_source | remote_deployment | repo_caller | external_caller | data_storage_dependency | replacement | rollback | retirement_status |
|---|---|---|---|---|---|---|---|---|---|---|
| legacy `dossier_*` tables | absent locally | present remote | migrations/functions present | n/a | yes | unknown | remote FKs; `dossier_exports` rows; Storage prefix | app replacement not remote | not defined | BLOCKED BY REMOTE DATA |
| `leads` / `contact_messages` / `outbound_emails` | absent locally | present remote | yes | via `api-lead-submit`/`mail-worker` | yes | unknown | `leads` and `outbound_emails` rows | not remote | not defined | KEEP - ACTIVE REMOTE |
| legacy `idempotency_keys` | absent locally | present remote with 15 rows | helper/source present | n/a | indirect | unknown | rows present | app idempotency not remote | not defined | BLOCKED BY REMOTE DATA |
| `retention_cleanup_events` and retention RPCs | absent locally | present remote with row + RPCs | yes | `retention-worker` deployed | scheduled caller | unknown | cron jobs + Storage deletion semantics | no app retention remote | not defined | KEEP - ACTIVE REMOTE |
| `locked_unpaid_reminder_events` and reminder RPC | absent locally | present remote | yes | worker deployed | scheduled caller | unknown | cron jobs | no replacement | not defined | KEEP - ACTIVE REMOTE |
| all deployed `api-dossier-*` source-backed functions | local source present | legacy DB dependencies remote | yes | deployed | static/tests/tools | unknown | old Storage/DB | app endpoints not remote | not defined | KEEP - ACTIVE REMOTE |
| remote-only dossier functions | no local source | remote unknown internals | no | deployed | no repo caller found | unknown | unknown | no replacement | not defined | KEEP - EXTERNAL CALLER UNKNOWN |
| `api-app-*` functions | app DB local only | app DB absent remote | yes | not listed remote | app local/proof caller | no production proof | app Storage absent remote | local only | not applicable | BLOCKED BY DEPLOYMENT PROOF |
| `_shared/idempotency.ts` | no local DB legacy object | remote legacy idempotency table exists | yes | shared source not separately deployed | no direct import found | unknown | remote legacy table rows | app helper exists separately | not defined | KEEP - EXTERNAL CALLER UNKNOWN |

## Blockers

- The linked remote contains legacy schema, data, Storage, cron jobs, and deployed legacy Edge Functions.
- The linked remote does not contain the local app schema, app Storage bucket, app SQL functions/RPCs, or deployed `api-app-*` functions.
- Remote migration history contains only the first 10 legacy migrations; all app migrations are LOCAL ONLY.
- Five active cron jobs call legacy mail, retention, and locked-unpaid reminder workers.
- Remote-only deployed functions exist without local source.
- External callers are not proven absent.
- Rollback/export/restoration strategy is not defined.
- Public traffic, DNS, Netlify environment variables, and external callers are not fully proven.

## First Limited Runtime-Retirement Readiness

A first runtime-retirement execution batch is not safe yet.

A first retirement-preparation batch can be prepared only as proof work, not deletion. It should:

1. classify the linked remote environment with Daan;
2. decide whether `enval` / `yzngrurkpfuqgexbhzgl` is still serving production or fallback traffic;
3. inventory external callers for remote-only and public functions;
4. recover or document source provenance for remote-only functions;
5. decide app deployment/baseline strategy before touching remote legacy objects;
6. design a rollback/export path for legacy rows and `enval-dossiers` Storage;
7. produce a candidate-specific no-caller proof before any function deletion.

## Recommended Next Batch

Historical next batch at that evidence date: environment/deployment strategy selection, now recorded in `docs/app/decisions/architecture-and-environment-decisions.md`.

Scope:

- no mutation;
- confirm whether linked project is production/fallback/staging/dev;
- map public website/function callers outside the repo;
- decide whether app migrations should be deployed forward-only to this remote or to a new project;
- decide how remote-only functions are sourced, frozen, or retired later;
- produce a candidate list for a future deletion batch, still without deleting anything.

## 2026-07-19 Phase 0 Shadow Proof

Source provenance:

| item | value |
|---|---|
| branch / HEAD | `main` / `f24b90263c3e22b8fdebd8c3fa016594ddfa7333` |
| strategy context | in-place parallel rebuild; strategy selected, execution not permitted |
| remote write boundary | read-only metadata and collision queries only |
| proof runner | `scripts/proofs/in-place-baseline-phase0-proof.mjs` |
| remote read-only query | `scripts/proofs/in-place-baseline-phase0-remote-readonly.sql` |
| proposal source | `supabase/baseline-proposals/wave-1/` |

Pre-task evidence recorded a dirty worktree, Supabase CLI `2.109.1`, 18 local migrations including 8 local-only app migrations, 7 local `api-app-*` functions, 10 registered remote legacy migrations, and 26 deployed remote legacy/fallback functions. Pre-existing `deno.lock`, proof scripts, and baseline proposals remained outside the documentation proof delta.

### Backup And Recovery Readiness At Phase 0

| recovery item | Phase 0 evidence |
|---|---|
| project health / region | `ACTIVE_HEALTHY` / `eu-west-2` |
| database size | 245 MB |
| Storage objects | `enval-dossiers`: 2 |
| Auth users | 2 total; no user details read |
| Edge Functions / cron / migrations | 26 / 5 / 10 |
| managed backups | unavailable: `backups=[]` |
| PITR | unavailable: `pitr_enabled=false` |
| initial restore status | no managed restore target; encrypted logical backup and isolated local restore were still required |

The initial recipient attempt stopped before any dump because no recoverable encryption recipient existed. No backup directory, plaintext dump, encrypted artifact, Storage copy, manifest, or restore database was created by that blocked attempt. This state was superseded by the 2026-07-20 recovery execution below.

### Remote Collision Matrix

| checked family | count | classification |
|---|---:|---|
| `app_%` relations | 0 | NO COLLISION |
| `app_%` functions/RPCs | 0 | NO COLLISION |
| `app_%` constraints | 0 | NO COLLISION |
| `app_%` triggers | 0 | NO COLLISION |
| `app_%` policies | 0 | NO COLLISION |
| `app_%` types/enums | 0 | NO COLLISION |
| `app-documents` Storage bucket | 0 | NO COLLISION |
| `api-app-*` deployed functions | 0 | NO COLLISION |
| browser write grants on remote app tables | 0 | NO COLLISION |
| realtime app publications | 0 | NO COLLISION |

Expected shared dependencies were `auth.users`, the `public` schema, roles `anon`/`authenticated`/`service_role`, `pgcrypto`, `plpgsql`, and platform extensions. Projectwide risks remained 7 event triggers, shared schema grants, 5 legacy cron jobs, and protected legacy Storage.

### Migration Source Analysis

| migration | Phase 0 classification |
|---|---|
| `20260707151801_app_foundation_schema.sql` | SPLIT INTO NEW BASELINE |
| `20260708120000_app_locations_chargers_schema.sql` | REUSED WITH CONTROLLED COPY |
| `20260708133000_app_document_legal_slots_schema.sql` | SPLIT INTO NEW BASELINE |
| `20260711100000_app_document_files_versions_schema.sql` | REUSED WITH CONTROLLED COPY |
| `20260711130000_app_document_upload_confirm_rpc.sql` | REUSED WITH CONTROLLED COPY |
| `20260712100000_app_customer_auth_bootstrap_rpc.sql` | DEFERRED |
| `20260715100000_app_document_withdraw_current_rpc.sql` | REUSED WITH CONTROLLED COPY |
| `20260716100000_app_signup_intake_quarantine_schema.sql` | DEFERRED |

No app migration was treated as a verbatim execution candidate and no legacy migration was reused for the app baseline.

### Shadow Method And Results

Temporary databases inside local container `supabase_db_enval` were created from `template0` with `pgcrypto` and a minimal `auth.users` compatibility shape. Generated names used `enval_phase0_clean_<timestamp>` and `enval_phase0_legacy_<timestamp>`. They used no remote writes, production credentials, or current local app data.

| scenario | result |
|---|---|
| clean app baseline | PASS |
| legacy-shape plus app baseline | PASS |
| legacy snapshot unchanged | PASS |
| app FK to non-app business tables | 0 |
| app writes to legacy tables | 0 by static proof |
| temporary shadow databases after cleanup | 0 |

Wave 1 proposal inventory:

| file | purpose |
|---|---|
| `001_app_identity_audit_idempotency.sql` | app customer, identity/cohort, case, audit, and idempotency foundation |
| `002_app_case_location_foundation.sql` | app locations, connections, chargers, and charge points |
| `003_app_evidence_slots.sql` | evidence slots and current-version pointer |
| `004_app_document_files_versions.sql` | evidence files, versions, and immutability guards |
| `005_app_document_confirm_withdraw_rpcs.sql` | service-role-only confirm/reject/withdraw transition RPCs |

Excluded from Wave 1: quarantine/capabilities, Auth bootstrap, Storage bucket/policies, remote assumptions, legacy references, `DROP CASCADE`, and browser-role business writes.

Final Phase 0 regression on 2026-07-20:

| metric | result |
|---|---:|
| proposal files / tables / functions / policies | 5 / 12 / 6 / 12 |
| static / post-apply triggers | 11 / 13 |
| table grant inventory rows | 120 |
| remote collisions / legacy references / destructive statements | 0 / 0 / 0 |
| forbidden Storage/Auth/cron mutation count | 0 |
| browser-role business write grants | 0 |
| static, clean shadow, legacy-shape shadow, cleanup | PASS / PASS / PASS / PASS |

Phase 0 verdict: `PARTIAL — COLLISION AND SHADOW PROOF GREEN; EXECUTION GATES STILL OPEN`. This is proof, not remote execution permission.

## 2026-07-19/20 Recovery, Backup And PostgREST Gate

Gate timestamps retained from source evidence:

- initial gate: `2026-07-19T05:57:08Z`;
- terminal-first blocker: `2026-07-19T06:56:16Z`;
- request-path resolution: `2026-07-19T23:46:36Z`;
- blocked encryption attempt: `2026-07-20T02:01:36Z`;
- successful local recovery-control evidence: `2026-07-20T04:26:49Z`.

Current verdict: `LOCAL RECOVERY CONTROL PASS — REMOTE WAVE 1 BLOCKED BY POSTGREST PLATFORM HEALTH`.

| item | current status |
|---|---|
| functional PostgREST request path | PROVEN for controlled read-only requests |
| dashboard/platform PostgREST health | UNHEALTHY / UNRESOLVED |
| classification | `PGR-B — FUNCTIONAL BUT PLATFORM HEALTHCHECK UNRESOLVED` |
| remote mutation effect | NO-GO |
| recovery recipient | PASS |
| public DB backup/restore | PASS for user-created public DB objects |
| Storage/Auth/functions/cron recovery | manifests only; not full portable backups |

### Encrypted Recovery Execution

Recovery root outside the Git worktree:

`/Users/daankoote/ENVAL_RECOVERY/20260720T040011Z_yzngrurkpfuqgexbhzgl_f24b902`

The private age identity remains outside the repository at `/Users/daankoote/.config/enval-recovery/age-identity.txt` with mode 600. The public recipient was `age1c2gzvq4a32jn9467hpxgzgcql6jluxpykqn2q236qsqyhkj7qpmsp6taxl`; non-sensitive roundtrip verification passed.

| artifact | coverage | bytes | SHA-256 |
|---|---|---:|---|
| `remote_schema.age` | public schema-only SQL | 83804 | `39c6f466fb9a4633208bd3bd7586d8c8d5ef41d6cdade86e9a90ed5e5015945b` |
| `remote_data.age` | public data-only SQL | 361139 | `f7475cf3e787815a22a5ce5f1cbf5fe1f050d85eda2e64b0a95a5948bf2a39a5` |
| `remote_roles.age` | role metadata SQL | 497 | `193303c5d6f6d17326fe3dd3bf4c7f0f148a52515b76e4a46215b841c4380ef1` |

Manifest evidence:

| manifest | result |
|---|---|
| row counts | 21 public tables |
| public objects | 21 tables, 12 functions, 15 triggers, 15 policies, 72 constraints, 0 app objects |
| Storage | private `enval-dossiers`, 2 objects, 1671 bytes where metadata available, 1 first-level prefix |
| Auth | 2 users, email provider count 2; no identities, emails, tokens, or hashes |
| Edge Functions | 26 metadata records; no secrets |
| cron | 5 active jobs; schedules and command hashes only |
| manifest SHA-256 | `428201eb93cfbc3610ed57eebd9658a62d7bda56d90ee54dbba4568b707d3766` |

Isolated restore database `enval_recovery_restore_20260720_040426` passed schema/data restore, row-count comparison, and object-count comparison. It restored 21 public tables, 12 functions, 15 triggers, 15 policies, 72 constraints, and 0 app objects. The restore database and plaintext temporary files were removed; encrypted artifacts and safe manifests remained outside the repo.

Excluded from portable DB coverage: Auth user details, Storage bytes, Edge Function runtime secrets, cron command bodies, platform schemas, managed backup/PITR state, and restore-to-new-project capability.

### PostgREST Evidence

Manual dashboard evidence showed PostgREST `Unhealthy`, while Database/Auth/Realtime/Storage/Edge Functions were healthy and latest backup was `No backups`.

The original root probes returned repeated 401 responses and were initially overclassified as an auth configuration error. The 2026-07-20 table-route probes superseded that narrow interpretation:

| key family | route | repeated result | interpretation |
|---|---|---|---|
| legacy anon JWT | root/OpenAPI | 401 / 401 / 401 | root is not a reliable health proxy |
| legacy anon JWT | absent `app_customers` | 404 / 404 / 404 | request reaches PostgREST; app table absent |
| legacy anon JWT | zero-row legacy read | 401 / 401 / 401 | request processed and denied by access boundary |
| publishable | root/OpenAPI | 401 / 401 / 401 | root is not a reliable health proxy |
| publishable | absent `app_customers` | 404 / 404 / 404 | request reaches PostgREST; app table absent |
| publishable | zero-row legacy read | 401 / 401 / 401 | request processed and denied by access boundary |

Keys, JWTs, response bodies, request-id values, secrets, and connection strings were not logged. Functional request-path evidence does not supersede the unresolved dashboard/platform health signal.

#### Supabase Support Evidence — 2026-08-10

Classification: `PGR-B — FUNCTIONAL BUT PLATFORM HEALTHCHECK UNRESOLVED`.

| evidence | safe support summary |
|---|---|
| project / region | `yzngrurkpfuqgexbhzgl` / `eu-west-2` |
| dashboard window | circa 16:00–16:27 CEST on 2026-08-10 |
| component health | overall `Unhealthy`; PostgREST `Unhealthy`; Database, Auth, Realtime, Storage, and Edge Functions `Healthy` |
| dashboard resources | CPU circa 5%; disk circa 11%; RAM circa 64%; connection indicator circa 8/60; last backup `No backups` |
| controlled HTTP proof | 24 read-only GET requests, 33–290 ms, with request IDs/metadata present; observed statuses were expected 401 and 404 responses; zero timeout/network failures and zero 5xx/54x responses |
| route behavior | existing `dossiers` route: expected 401 / database SQLSTATE `42501`; absent `app_customers` route: 404; `/rest/v1/`: 401 gateway behavior |
| database aggregate | 15/60 connections during SQL proof; no waiting locks, blocked backends, active queries over 60 seconds, transactions over 5 minutes, idle-in-transaction sessions, deadlocks, or conflicts; cache hit 99.98%; database size circa 284 MB |
| correlated log window | exactly 12 visible Postgres `ERROR` events from 15:16:43 through 15:18:11 CEST; all SQLSTATE `42501`, generic `permission denied for table dossiers`, `application_name=postgrest`, database user `authenticator`; API Gateway showed matching 401/404 requests and no 5xx; the PostgREST log source returned no relevant events |
| mutation effect | none; the probes and consolidation were read-only and made no remote mutation |

The twelve SQLSTATE `42501` events are `PROOF ONLY — EXPECTED SECURITY DENIALS`: they correlate with the controlled PGR1 requests and demonstrate that PostgREST table requests reached Postgres and were rejected by the intended permission boundary. They must not be classified or cited as the cause of the PostgREST `Unhealthy` component state.

No ENVAL-side permission, RLS, gateway, authentication, or configuration weakening is justified by this evidence. Supabase Support/platform inspection is required to identify the internal component-healthcheck failure.

Question for Supabase Support: why does the internal PostgREST component health remain `Unhealthy` while real PostgREST table requests reach Postgres normally and no resource or service failure is observable?

### Managed Backup Decision And Coverage

```text
region=eu-west-2
walg_enabled=true
pitr_enabled=false
backups_count=0
physical_backup_data_empty=true
```

Daan selected no Pro upgrade. Managed scheduled backups, PITR, and restore-to-new-project are unavailable; this operational risk was accepted. Logical backup is not equivalent to PITR, but the encrypted backup and isolated restore are the mandatory recovery control before any future remote mutation.

### Wave 1 Review And Gate

All five proposal files were reviewed as migration candidates after unnecessary service-role `DELETE` grants were removed from proposals 001-004. Classification: `REVIEWED CANDIDATE — NO EXECUTION PERMISSION`.

The emergency rollback proposal `supabase/baseline-proposals/wave-1-rollback/001_emergency_drop_wave1_app_objects.sql` remains proposal-only, names only Wave 1 app objects, is dependency ordered, uses no `CASCADE`, and was not executed.

Prechecks require current recovery artifacts, collision count 0, reviewed proposal/rollback hashes, owner/reviewer, maintenance window, and resolved PostgREST platform health. Abort triggers include collisions, legacy diffs, platform degradation, DB errors/timeouts/locks, RLS/grant or object-count deviations, legacy row-count changes, REST regressions, migration-history mismatch, stale backup evidence, or missing rollback owner.

Rollback must remain forward-only and app-scoped: no blind `DROP CASCADE`, no history rewrite, no legacy data mutation, and no dependency on Storage/Auth/functions outside the exact wave.

### Remaining Blockers

- Dashboard/platform PostgREST health is `UNHEALTHY / UNRESOLVED`.
- Storage/Auth/functions/cron have manifest-only recovery coverage.
- Auth rows/details, Storage bytes, runtime secrets, cron bodies, and platform-owned components are outside portable DB recovery.
- Remote Wave 1 requires platform-health closure or an explicit separately documented support-risk gate from Daan.
- No proof in this document changes the regulatory blocker or target architecture status.

## Consolidated Non-Mutation Confirmation

The source proof batches made no remote mutation, deployment, migration repair/apply, database push, Storage/Auth/cron mutation, function deletion, legacy rename/deletion, commit, or push. This consolidated proof document adds no implementation permission.

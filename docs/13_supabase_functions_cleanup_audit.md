# Supabase Functions Cleanup Audit

Status: read-only architecture/process audit. No functions were deleted, changed, moved, or renamed.

## 1. Executive Summary

ENVAL now has two backend generations in the same Supabase functions tree:

- New app direction: `api-app-*` endpoints, currently only `api-app-signup-submit` as a skeleton/smoke contract.
- Legacy production/fallback direction: `api-dossier-*`, `api-lead-submit`, and workers built around the old static `dossier.html` wizard.

The old `api-dossier-*` surface must remain production/fallback until explicitly retired after the `/app` backend is proven. The immediate optimization is not deletion. It is to freeze legacy behavior, avoid extending old wizard assumptions, and build new app endpoints on a deliberate app foundation.

Key findings:

- `supabase/functions/_shared/app_foundation.ts` is the right starting point for future `api-app-*` endpoints.
- Legacy helpers `_shared/audit.ts`, `_shared/idempotency.ts`, `_shared/reqmeta.ts`, `_shared/customer_auth.ts`, and `_shared/sessions.ts` remain tightly coupled to `dossier_*` tables and old session semantics.
- App audit/idempotency must target `app_*` tables, not legacy `dossier_audit_events` or `idempotency_keys`.
- Customer timeline must remain a curated read model, not raw audit exposure.
- Gateway auth must be treated separately from application-level validation, as proven in the `api-app-signup-submit` smoke test.
- Full local reset remains blocked by legacy non-baseline migrations; app foundation schema was proven by isolated apply.

## Legacy Supabase Functions Freeze Rule

Legacy Supabase functions are frozen.

Meaning:

- `api-dossier-*` remains fallback/legacy only.
- `api-lead-submit` remains legacy lead/contact intake only.
- `mail-worker`, `retention-worker`, and `locked-unpaid-reminder-worker` remain legacy worker/fallback only.
- Do not add new `/app` behavior to legacy functions.
- Do not reuse legacy dossier sessions as app account auth.
- Do not write app audit/idempotency to legacy `dossier_audit_events` or `idempotency_keys`.
- New customer-facing app behavior must use `api-app-*`.
- New app writes must target app_* tables.
- Deletion or retirement requires separate proof and an explicit commit.

## 2. Function Inventory

| Function | Category | Current likely role | Tables touched / likely touched | Endpoint contract risk | Recommendation | Notes |
|---|---|---|---|---|---|---|
| `api-app-signup-submit` | app-new | Smoke skeleton for future `/app` signup submit contract. | None in skeleton. Future app tables. | Low now; high once writes are enabled. | keep/adapt | Uses `app_foundation.ts`; no frontend wiring and no DB writes yet. |
| `api-lead-submit` | legacy-lead/contact | Public lead/contact intake and old dossier bootstrap. | `intake_audit_events`, `idempotency_keys`, `leads`, `dossiers`, `outbound_emails`, `contact_messages`. | High: bridges old lead and dossier creation assumptions. | freeze legacy; adapt pattern | Useful concepts: public intake idempotency, fail-open audit, mail queue. Do not copy payload directly. |
| `api-dossier-login-request` | legacy-dossier-wizard | Magic-link/session login request for old dossier wizard. | `dossiers`, `outbound_emails`, `dossier_audit_events`. | High: dossier-scoped token identity and anti-enumeration behavior. | keep/freeze | Conceptually reusable for notification/bootstrap, not as app account auth. |
| `api-dossier-get` | legacy-dossier-wizard | Reads old dossier wizard state and can create dossier session. | `dossiers`, `dossier_sessions`, `dossier_documents`, `dossier_consents`, `dossier_audit_events`, `dossier_chargers`, `dossier_checks`. | High: old wizard read model and session semantics. | keep/freeze | Do not wire `/app` dashboard to this directly. |
| `api-dossier-address-verify` | legacy-dossier-wizard | PDOK address verification with old dossier session and audit. | PDOK plus `dossier_audit_events`; requires `dossier_sessions`. | Medium/high: verify is coupled to old session/audit. | adapt pattern; freeze endpoint | PDOK lookup concept is useful; app signup already uses client-first direct PDOK. |
| `api-dossier-address-save` | legacy-dossier-wizard | Saves old dossier address fields. | `dossiers`, `dossier_audit_events`, `idempotency_keys`. | High: old one-address dossier assumption. | freeze legacy | App needs location-based schema and separate customer timeline. |
| `api-dossier-access-save` | legacy-dossier-wizard | Saves old access/authority information. | `dossiers`, `dossier_chargers`, `dossier_audit_events`, `idempotency_keys`. | High: old domain model and wizard step contract. | freeze legacy | Uses `sessions.ts` directly rather than `customer_auth.ts`. |
| `api-dossier-access-update` | legacy-dossier-wizard | Updates old access/authority information. | `dossiers`, `dossier_chargers`, `dossier_audit_events`, `idempotency_keys`. | High: old domain model and wizard step contract. | freeze legacy | Keep untouched while fallback exists. |
| `api-dossier-charger-save` | legacy-dossier-wizard | Saves old charger records. | `dossiers`, `dossier_chargers`, `dossier_audit_events`, `idempotency_keys`. | High: old charger shape and document coupling. | freeze legacy | App signup supports multiple account/location structures and unlimited chargers. |
| `api-dossier-charger-delete` | legacy-dossier-wizard | Deletes old charger and related documents/storage. | `dossiers`, `dossier_chargers`, `dossier_documents`, storage, audit/idempotency. | High: destructive and coupled to old storage paths. | keep/freeze | Never delete until replacement and retention behavior are proven. |
| `api-dossier-consents-save` | legacy-dossier-wizard | Saves old consent set. | `dossiers`, `dossier_consents`, `dossier_audit_events`, `idempotency_keys`. | High: old legal bundle only. | freeze legacy | New app consent/version model must be redesigned around accepted versions and fee terms. |
| `api-dossier-upload-url` | legacy-dossier-wizard | Issues old upload URLs/document slots. | `dossiers`, `dossier_chargers`, `dossier_documents`, storage, audit/idempotency. | High: upload contract is evidence-critical. | adapt pattern; freeze endpoint | Reuse concept: server-issued upload slot, not old bucket rules blindly. |
| `api-dossier-upload-confirm` | legacy-dossier-wizard | Confirms uploaded file and server-side hash. | `dossiers`, `dossier_documents`, storage download/hash, audit/idempotency. | High: evidence integrity critical. | adapt pattern; freeze endpoint | Strong concept for app: document hash confirm and immutable versions. |
| `api-dossier-doc-download-url` | legacy-dossier-wizard | Creates signed download URLs for confirmed documents. | `dossiers`, `dossier_documents`, storage, audit/idempotency. | Medium/high: old authorization model. | freeze legacy; adapt pattern | App dashboard needs customer-safe document reads, not raw old contract. |
| `api-dossier-doc-delete` | legacy-dossier-wizard | Deletes/replaces old dossier documents. | `dossiers`, `dossier_documents`, storage, audit/idempotency. | High: destructive evidence action. | keep/freeze | Future app should use versioning/replacement rather than silent deletion. |
| `api-dossier-observed-source-upsert` | analysis/evidence | Upserts observed invoice/source fields for a confirmed old document. | `dossiers`, `dossier_documents`, `dossier_document_observed_sources`, audit/idempotency. | High: analysis/evidence semantics and old table shape. | adapt concept; freeze endpoint | Keep analysis declared/observed/evaluated separation concept. |
| `api-dossier-verify` | analysis/evidence | Runs old document/dossier analysis verification. | `dossiers`, `dossier_chargers`, `dossier_documents`, `dossier_document_observed_sources`, analysis tables, audit/idempotency. | High: old checks may be mistaken for final compliance decision. | freeze legacy; adapt concept | Analysis must support human review, not automatic result claims. |
| `api-dossier-evaluate` | analysis/evidence | Evaluates old dossier completeness/check state. | `dossiers`, `dossier_consents`, `dossier_chargers`, `dossier_documents`, `dossier_checks`, analysis run tables, audit/idempotency. | High: old lifecycle and lock assumptions. | freeze legacy | Do not extend with app lifecycle statuses. |
| `api-dossier-export` | analysis/evidence | Exports/preserves old locked dossier package. | `dossiers`, `dossier_chargers`, `dossier_documents`, `dossier_checks`, `dossier_consents`, `dossier_audit_events`, analysis tables, `dossier_exports`. | High: final evidence/export semantics. | keep untouched; adapt concept | Useful concept: readable evidence export, but app needs new customer/auditor projection. |
| `api-dossier-dev-unlock` | dev-only | Unlocks old dossier for development/testing. | `dossiers`, audit/idempotency. | High if exposed beyond dev. | retire-candidate later | Delete only after confirming it is not deployed/needed and old fallback is replaced. |
| `mail-worker` | worker | Sends queued outbound email. | `outbound_emails`, `dossier_audit_events`. | Medium: secrets/provider behavior and legacy audit target. | keep/freeze; adapt later | Future app may reuse mail queue pattern with app audit/timeline events. |
| `retention-worker` | worker | Applies old retention/minimization cleanup. | `retention_cleanup_events`, RPC `enval_retention_cleanup`, RPC `enval_retention_cleanup_apply_after_storage`, storage, audit. | High: destructive cleanup path. | keep untouched; adapt concept | Retention/minimization is critical; do not modify casually. |
| `locked-unpaid-reminder-worker` | worker | Queues reminders for old locked/unpaid dossiers. | RPC `enval_queue_locked_unpaid_reminders`, likely outbound/audit via SQL. | Medium/high: old payment/export gate assumptions. | freeze legacy; retire-candidate later | New 10% result-fee lifecycle will need different events. |

## 3. Shared Helper Inventory

| Helper | Used by grep evidence | Overlaps | Future role | Recommendation | Notes |
|---|---|---|---|---|---|
| `_shared/app_foundation.ts` | `api-app-signup-submit`. | Request metadata, CORS, safe errors, idempotency types/hash, app audit types overlap with legacy `reqmeta.ts`, `audit.ts`, `idempotency.ts`. | Canonical app helper for new `api-app-*`. | keep/adapt | Targets `app_audit_events` and `app_intake_audit_events`; includes "Frontend may assist; backend decides." |
| `_shared/reqmeta.ts` | Most legacy dossier functions and workers. | Request metadata overlaps with `app_foundation.ts`, but legacy shape includes raw-ish `ip`/`ua` fields. | Legacy helper only unless deliberately merged. | keep for legacy | Do not change broadly; helper merge could break legacy endpoints. |
| `_shared/audit.ts` | Most legacy dossier functions, `api-lead-submit`, `retention-worker`. | Contains legacy audit plus legacy idempotency response helpers. | Legacy helper; pattern source only for app. | keep; merge-candidate later | Writes `dossier_audit_events` and `idempotency_keys`; not suitable as app source of truth. |
| `_shared/idempotency.ts` | No direct function import found in current grep; standalone legacy helper. | Overlaps idempotency helpers inside `audit.ts` and app idempotency types/hash in `app_foundation.ts`. | Possible future cleanup after import proof. | retire-candidate later | Do not delete until deployed code/imports are checked outside simple grep. |
| `_shared/customer_auth.ts` | Most `api-dossier-*` endpoints. | Wraps `sessions.ts`; overlaps future app auth/customer identity only conceptually. | Legacy dossier session guard. | keep/freeze | Do not reuse for `/app` account/dashboard auth. |
| `_shared/sessions.ts` | `api-dossier-get`, login/access endpoints, through `customer_auth.ts`. | Old magic-link/session token model overlaps future auth/bootstrap only conceptually. | Legacy only. | keep/freeze | Tied to `dossier_sessions`; app must avoid treating dossier token as account identity. |
| `_shared/analysis.ts` | `api-dossier-verify`, `api-dossier-evaluate`, `api-dossier-observed-source-upsert`. | Domain evidence helpers; overlaps future review/evidence model conceptually. | Pattern source for evidence separation. | adapt concept | Keep declared/observed/evaluated separation, but not old final decision semantics. |
| `_shared/analysis_runs.ts` | `api-dossier-verify`, `api-dossier-evaluate`, `api-dossier-export`. | Analysis run lifecycle overlaps future review job/run tracking. | Pattern source only. | adapt concept; freeze old usage | Writes `dossier_analysis_runs`. App needs app-specific review/run tables. |
| `_shared/pdf_text.ts` | Indirect analysis helper usage should be verified when changing analysis. | Document text extraction overlaps future evidence parsing. | Pattern source. | keep/adapt | Do not alter during cleanup. |
| `_shared/image_text.ts` | Indirect analysis helper usage should be verified when changing analysis. | Image/OCR extraction overlaps future evidence parsing. | Pattern source. | keep/adapt | Current notes mention local OCR unavailable in Edge runtime. |

## 4. Process / Lifecycle Map

- Legacy lead submit: `api-lead-submit` accepts public lead/contact data, uses legacy idempotency, may create old dossier records and queue email.
- Legacy dossier magic-link login: `api-dossier-login-request` and `api-dossier-get` use old dossier/session tokens, not app customer accounts.
- Legacy dossier wizard read/write: `api-dossier-get`, address/access/charger/consent save/update endpoints write old `dossier_*` state.
- Legacy address flow: `api-dossier-address-verify` performs PDOK lookup through old session/auth/audit; `api-dossier-address-save` persists to `dossiers`.
- Legacy charger flow: charger save/delete endpoints update `dossier_chargers` and may affect document/storage state.
- Legacy upload flow: upload URL, upload confirm, download URL, and delete endpoints manage old `dossier_documents` plus storage. Upload confirm includes the valuable server-side hash confirmation pattern.
- Legacy consent save: `api-dossier-consents-save` stores old `dossier_consents`, not the new app legal/fee acceptance model.
- Legacy evaluate/verify/export: `api-dossier-verify`, `api-dossier-evaluate`, `api-dossier-export`, observed-source upsert, and analysis helpers support old analysis/evidence flow.
- Workers: `mail-worker`, `retention-worker`, and `locked-unpaid-reminder-worker` operate on legacy queues, cleanup, and reminder assumptions.
- New app signup skeleton: `api-app-signup-submit` proves CORS, gateway auth boundary, idempotency key requirement, payload hash, and minimal contract validation without DB writes.

## 5. Cleanup Candidates Ranked

### P0 Keep Untouched

| File/function | Reason | Risk if deleted too early | Proof before deletion | Suggested future commit step |
|---|---|---|---|---|
| All `api-dossier-*` production/fallback endpoints | They may still serve the live/static fallback flow. | Breaks production/fallback dossier behavior. | `/app` backend and deployment fully proven; production traffic confirmed off old flow. | Add docs freeze first; remove only in controlled retirement batch. |
| `retention-worker` | Destructive privacy/minimization behavior must remain stable. | Retention failure or unintended data retention/deletion. | New app retention model proven with test data and rollback plan. | Adapt app retention separately before touching old worker. |
| Upload confirm/download/delete endpoints | Evidence integrity and storage behavior. | Broken document evidence or orphaned storage. | New app document slot/version/upload flow proven end-to-end. | Build new `api-app-document-*` first. |

### P1 Freeze Legacy But Do Not Extend

| File/function | Reason | Risk if deleted too early | Proof before deletion | Suggested future commit step |
|---|---|---|---|---|
| `api-lead-submit` | Old public intake/contact plus old dossier bridge. | Lead/contact breakage. | New app/signup/contact submit replacements proven. | Mark legacy frozen in docs, then wrap if needed. |
| `api-dossier-login-request`, `api-dossier-get` | Old magic-link/session dashboard substitute. | Old customer access breaks. | New auth/dashboard bootstrap proven. | Freeze legacy session assumptions. |
| Address/access/charger/consent save endpoints | Old wizard step writes. | Old wizard breakage. | New app submit/dashboard writes proven and old flow retired. | Do not add new product rules here. |
| `mail-worker`, `locked-unpaid-reminder-worker` | Legacy mail/reminder jobs. | Missed emails/reminders. | New app notification/event model proven. | Keep, but do not expand old payment assumptions. |

### P2 Adapt Pattern Into App Layer

| Pattern source | Useful concept | Risk if copied directly | Proof before app use | Suggested future commit step |
|---|---|---|---|---|
| `api-dossier-upload-confirm` | Server-side file hash confirm. | Old document table/bucket assumptions. | App document slots/versions contract tests. | Build app upload helpers against `app_*` tables. |
| `api-dossier-export` | Readable evidence export. | Raw audit leakage or old lock gate. | Customer/auditor projection defined. | Build customer timeline/export read model. |
| `api-dossier-address-verify` | PDOK lookup behavior. | Old session/audit coupling. | Browser/client-first plus optional read-only fallback tested. | If needed, add `api-app-address-lookup`. |
| `api-lead-submit` | Public idempotent intake and mail queue. | Old dossier creation semantics. | App signup write contract tests. | Implement `api-app-signup-submit` writes. |

### P3 Merge Helper Candidate

| Helper | Reason | Risk if merged too early | Proof before merge | Suggested future commit step |
|---|---|---|---|---|
| `reqmeta.ts` with `app_foundation.ts` | Both extract request metadata. | Legacy endpoints may change audit payload shape. | Dedicated tests around old endpoints or no legacy traffic. | Keep separate until app endpoints stabilize. |
| `audit.ts` idempotency helpers with `idempotency.ts` | Overlapping legacy idempotency helpers. | Legacy replay behavior changes. | Grep plus runtime/deploy import proof. | Merge only in a legacy-cleanup branch. |
| `audit.ts` vs `app_foundation.ts` app audit helpers | Similar fail-open audit concept. | App could accidentally write old `dossier_audit_events`. | App tables applied/tested; app audit contract locked. | Keep app helper separate. |

### P4 Retire Later After Replacement Proven

| File/function | Reason | Risk if deleted too early | Proof before deletion | Suggested future commit step |
|---|---|---|---|---|
| `api-dossier-dev-unlock` | Dev-only legacy helper. | Dev fallback/testing inconvenience or hidden deployed dependency. | Confirm not deployed/used; old flow retired. | Remove in explicit dev-helper retirement commit. |
| `_shared/idempotency.ts` | No current direct import found. | Hidden import/deploy mismatch if grep misses compiled/manual use. | Full repo/deploy config proof. | Delete only after documented unused proof. |
| `locked-unpaid-reminder-worker` | Old locked/unpaid reminder model may not match result-fee lifecycle. | Legacy reminder breakage. | New fee/result notification lifecycle proven. | Retire after old payment/export gate removed. |

## 6. App Direction Recommendation

- New `api-app-*` endpoints must not copy legacy wizard session assumptions.
- Future app endpoints should use `app_foundation.ts` or a deliberately merged successor helper.
- App audit/idempotency must target `app_*` tables, not `dossier_audit_events` or legacy `idempotency_keys`.
- Frontend may assist; backend decides.
- Customer timeline is a curated projection from backend/audit facts, not raw audit rows.
- Old functions stay as fallback until `/app` submit, dashboard, uploads, review, and retention flows are proven.
- Do not interpret gateway auth failures as application validation failures.

## 7. Concrete Next Cleanup Sequence

1. Mark legacy functions as frozen in docs: "freeze legacy, do not extend unless production fallback requires it."
2. Keep this function map as the reference for future cleanup tickets.
3. Consolidate shared helper usage only for new app endpoints first.
4. Do not touch old `api-dossier-*` until a production replacement exists and is browser/backend proven.
5. Later retire dev-only helpers if deployment/import proof shows they are unused.
6. Later split/remove legacy endpoints after `/app` production migration and fallback retirement.

## 8. Risks

- Deleting fallback too early can break the current static production/dossier path.
- Helper merge can break legacy endpoints because `audit.ts`, `reqmeta.ts`, and `sessions.ts` encode old payload/session assumptions.
- Idempotency/audit table mismatch can write app events to legacy tables or vice versa.
- Gateway auth can be mistaken for an app failure during smoke tests.
- Full local reset is blocked by legacy non-baseline migrations, so schema proof must distinguish isolated app migration proof from full reset proof.
- Supabase status output can include secrets; do not paste secrets into reports.
- `app_foundation.ts` overlaps with existing helpers by design, but should remain app-specific until new endpoint contracts mature.

## 9. No-op Proof

Commands used for this audit were read-only except creating this report:

- `git status --short`
- `find supabase/functions -maxdepth 1 -mindepth 1 -type d -exec basename {} \;`
- `find supabase/functions/_shared -maxdepth 1 -type f -name '*.ts' -exec basename {} \;`
- `rg` import/usage scans for `_shared`, `app_foundation`, `audit`, `idempotency`, `reqmeta`, `customer_auth`, `sessions`, `analysis_runs`, `pdf_text`, and `image_text`
- `sed` previews of selected docs/functions/helpers

No functions were deleted. No code, migration, frontend, root/static, asset, or Supabase function files were changed by this audit.

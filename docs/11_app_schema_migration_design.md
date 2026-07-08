# App Schema Migration Design

Status: design-only source document before migration implementation.

Scope: future database schema for the new `/app` customer-facing commercial ERE inboekservice backend.

This document does not create migrations, SQL, Edge Functions, Supabase behavior, auth behavior, storage buckets, RLS policies, or production wiring.

## 1. Executive Summary

The new `/app` backend should use a new application schema model alongside the current legacy dossier schema until the new contracts are proven.

Current legacy tables and `api-dossier-*` functions remain untouched. They are source material for useful patterns, not direct targets for `/app` coupling.

Proof note:

- Full local reset is currently blocked by legacy non-baseline migrations for old dossier tables.
- The app foundation migration has isolated apply proof against local Postgres.
- All six app foundation tables were present after isolated apply, with RLS enabled.

Recommended direction:

- Add a new `app_` table family in the `public` schema for Supabase/RLS simplicity.
- Keep old `dossiers`, `dossier_chargers`, `dossier_documents`, `dossier_sessions`, `dossier_audit_events`, analysis tables, export tables, and retention tables unchanged.
- Build the new schema around customer identity, dashboard dossiers, locations, chargers, document slots/files/versions, requests, support, legal acceptances, kWh periods, result/fee events, customer-safe timeline, and internal audit.
- Keep customer-readable timeline separate from raw internal audit.
- Require future writes to go through Edge Functions with service-role writes, idempotency, backend validation, audit, and explicit RLS review.

## 2. Design Principles

- Auditworthiness first.
- Frontend may assist; backend decides.
- Frontend prechecks, parsing, compression, PDOK lookup, and UI validation are UX/cost tools, not truth.
- Service-role writes only through Edge Functions.
- Customer-readable timeline is not raw audit.
- PII minimization is required in table design, audit payloads, tombstones, and exports.
- Evidence versions are immutable once confirmed.
- Business writes are idempotent.
- Sensitive/internal tables should be RLS deny-by-default and service-role/admin-only.
- Customer reads should use customer-safe projections or narrowly scoped read tables.
- No direct old `api-dossier-*` coupling from `/app`.
- No public copy should expose internal audit/evidence/anti-fraud doctrine.
- ENVAL does not claim verification, certification, compliance approval, ERE acceptance, payout, revenue, timing, or document approval guarantees.

## 3. Proposed Schemas / Namespaces

Recommended: keep tables in `public` with strict `app_` prefix.

Why:

- Supabase tooling, generated types, SQL editor workflows, migrations, and RLS examples are simpler in `public`.
- Existing project tables already live in `public`.
- A strict `app_` prefix gives clear separation from legacy `dossier_*` tables without cross-schema friction.
- RLS can be table-specific and deny-by-default for sensitive tables.
- Future views or RPCs can still expose customer-safe projections without introducing schema complexity too early.

Rejected for now:

- `app_private` / `app_public` split: clearer conceptually, but adds migration, search path, function, type-generation, and RLS complexity before contracts are proven.
- Reusing old table names: too much risk of coupling the new dashboard/account model to legacy wizard assumptions.

## Legacy Supabase Functions Freeze Rule

Legacy Supabase functions are frozen.

- `api-dossier-*` remains fallback/legacy only.
- `api-lead-submit` remains legacy lead/contact intake only.
- `mail-worker`, `retention-worker`, and `locked-unpaid-reminder-worker` remain legacy worker/fallback only.
- Do not add new `/app` behavior to legacy functions.
- Do not reuse legacy dossier sessions as app account auth.
- Do not write app audit/idempotency to legacy `dossier_audit_events` or `idempotency_keys`.
- New customer-facing app behavior must use `api-app-*`.
- New app writes must target app_* tables.
- Deletion or retirement requires separate proof and an explicit commit.

Naming rule:

- New `/app` tables use `app_` prefix.
- Old tables are not renamed.
- New Edge Functions should use `api-app-*` names, not `api-dossier-*`.

## 4. Table Design

Column lists are conceptual. Final migration SQL must choose exact types, defaults, constraints, indexes, comments, and RLS policies.

### `app_customers`

Purpose: canonical ENVAL customer record.

Important columns:

- `id uuid`
- `customer_number text`
- `customer_type text` (`particulier`, `zakelijk`, `vve`)
- `display_name text`
- `preferred_language text`
- `primary_email_normalized text`
- `primary_phone_normalized text`
- `status text`
- `created_at timestamptz`
- `updated_at timestamptz`
- `minimized_at timestamptz`

Primary key: `id`.

Foreign keys: none.

Uniqueness:

- unique `customer_number`
- possible partial uniqueness on active normalized email later, but avoid unsafe duplicate matching until auth design is final

Customer-visible: partly, through dashboard read model only.

RLS stance: customer-readable through own identity mapping or read endpoint; service-role writes only.

Audit/fraud relevance: high. Customer matching and duplication are fraud-relevant.

Old schema relationship: replace duplicated customer fields in `dossiers`.

### `app_customer_identities`

Purpose: map ENVAL customers to Supabase Auth users and verified identity handles.

Important columns:

- `id uuid`
- `customer_id uuid`
- `auth_user_id uuid`
- `email_normalized text`
- `email_verified_at timestamptz`
- `phone_normalized text`
- `phone_verified_at timestamptz`
- `identity_provider text`
- `status text`
- `created_at timestamptz`
- `last_login_at timestamptz`

Primary key: `id`.

Foreign keys:

- `customer_id -> app_customers.id`
- `auth_user_id -> auth.users.id` when Supabase Auth mapping is final

Uniqueness:

- unique active `auth_user_id`
- unique active `(customer_id, auth_user_id)`
- optional unique active email only after duplicate/customer matching policy is accepted

Customer-visible: no.

RLS stance: internal/service-role-only; customers should not query arbitrary identity rows.

Audit/fraud relevance: high. Auth binding, recovery, and anti-enumeration depend on it.

Old schema relationship: replace conceptual role of `dossier_sessions` as durable identity. Do not reuse `dossier_sessions`.

### `app_customer_dossiers`

Purpose: customer-owned dossier lifecycle for the commercial inboekservice.

Important columns:

- `id uuid`
- `customer_id uuid`
- `dossier_number text`
- `account_type text`
- `status text`
- `retention_class text`
- `submitted_at timestamptz`
- `locked_at timestamptz`
- `paused_at timestamptz`
- `rejected_at timestamptz`
- `minimized_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Primary key: `id`.

Foreign keys:

- `customer_id -> app_customers.id`

Uniqueness:

- unique `dossier_number`
- unique idempotency-derived submit identity should be enforced through `app_idempotency_keys`, not only this table

Customer-visible: yes, through dashboard read model.

RLS stance: customer may read own dossier projection; service-role writes only.

Audit/fraud relevance: high. Lifecycle status affects evidence, requests, result, and fee.

Old schema relationship: replace/adapt `dossiers`.

### `app_dossier_locations`

Purpose: one or more address/location records under a dossier.

Important columns:

- `id uuid`
- `dossier_id uuid`
- `client_location_id text`
- `label text`
- `status text`
- `postcode_normalized text`
- `house_number integer`
- `suffix_normalized text`
- `street text`
- `city text`
- `country text`
- `lookup_provider text`
- `lookup_provider_id text`
- `lookup_metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Primary key: `id`.

Foreign keys:

- `dossier_id -> app_customer_dossiers.id`

Uniqueness:

- unique `(dossier_id, client_location_id)`
- optional unique normalized location tuple per dossier when accepted

Customer-visible: yes.

RLS stance: customer may read own location projection; service-role writes only.

Audit/fraud relevance: high. Address/person/company matching depends on it.

Old schema relationship: replace single-address assumptions in `dossiers`.

### `app_dossier_chargers`

Purpose: charger records linked to locations and dossiers.

Important columns:

- `id uuid`
- `dossier_id uuid`
- `location_id uuid`
- `client_charger_id text`
- `status text`
- `brand_id text`
- `brand_label text`
- `manual_brand text`
- `model_id text`
- `model_label text`
- `manual_model text`
- `serial_number text`
- `mid_number text`
- `mid_status text`
- `backend_supplier_id text`
- `backend_supplier_label text`
- `manual_backend_supplier text`
- `installation_year integer`
- `solar_export_status text`
- `created_at timestamptz`
- `updated_at timestamptz`

Primary key: `id`.

Foreign keys:

- `dossier_id -> app_customer_dossiers.id`
- `location_id -> app_dossier_locations.id`

Uniqueness:

- unique `(dossier_id, client_charger_id)`
- no global unique serial or MID at first; use risk checks instead because real-world correction/replacement is likely
- optional active duplicate-risk indexes later for MID/year discipline

Customer-visible: yes.

RLS stance: customer may read own charger projection; service-role writes only.

Audit/fraud relevance: high. MID, serial, model, supplier, and location relation are core evidence targets.

Old schema relationship: adapt from `dossier_chargers`; replace old charger count and serial uniqueness assumptions.

### `app_document_slots`

Purpose: expected document/evidence requirements before files exist.

Important columns:

- `id uuid`
- `dossier_id uuid`
- `scope_type text` (`dossier`, `legal_entity`, `location`, `charger`, `request`, `kwh_period`)
- `scope_id uuid`
- `slot_type text`
- `customer_label text`
- `requiredness text`
- `status text`
- `current_version_id uuid`
- `created_by_event_id uuid`
- `created_at timestamptz`
- `updated_at timestamptz`

Primary key: `id`.

Foreign keys:

- `dossier_id -> app_customer_dossiers.id`
- `current_version_id -> app_document_versions.id` after circular FK design is resolved

Uniqueness:

- unique active `(dossier_id, scope_type, scope_id, slot_type)`

Customer-visible: yes.

RLS stance: customer may read own slots; writes through service-role only.

Audit/fraud relevance: high. Slots define what evidence is missing or accepted.

Old schema relationship: replace old implicit `doc_type` buckets and one-doc rules.

### `app_document_files`

Purpose: physical uploaded file metadata and storage pointer.

Important columns:

- `id uuid`
- `dossier_id uuid`
- `uploaded_by_customer_id uuid`
- `storage_bucket text`
- `storage_path text`
- `original_filename text`
- `content_type text`
- `size_bytes bigint`
- `sha256_hex text`
- `upload_status text`
- `server_confirmed_at timestamptz`
- `created_at timestamptz`

Primary key: `id`.

Foreign keys:

- `dossier_id -> app_customer_dossiers.id`
- `uploaded_by_customer_id -> app_customers.id`

Uniqueness:

- unique `(storage_bucket, storage_path)`
- optional unique `(dossier_id, sha256_hex)` for duplicate detection, not automatic rejection

Customer-visible: summarized only, not raw storage path.

RLS stance: internal/service-role-only; customers access files through signed URLs issued by Edge Functions.

Audit/fraud relevance: high. Hash, MIME, size, and storage path are evidence-critical.

Old schema relationship: adapt `dossier_documents` upload-confirm/hash pattern.

### `app_document_versions`

Purpose: immutable version history for each slot.

Important columns:

- `id uuid`
- `document_slot_id uuid`
- `document_file_id uuid`
- `version_number integer`
- `status text`
- `status_reason text`
- `replaced_by_version_id uuid`
- `created_from_request_id uuid`
- `created_at timestamptz`
- `reviewed_at timestamptz`

Primary key: `id`.

Foreign keys:

- `document_slot_id -> app_document_slots.id`
- `document_file_id -> app_document_files.id`
- `replaced_by_version_id -> app_document_versions.id`
- `created_from_request_id -> app_customer_requests.id`

Uniqueness:

- unique `(document_slot_id, version_number)`

Customer-visible: yes, summarized as current and history.

RLS stance: customer may read own summarized versions; service-role writes only.

Audit/fraud relevance: high. Replacement/correction history must be reconstructable.

Old schema relationship: extend old one-document-per-type model into immutable versions.

### `app_legal_text_versions`

Purpose: versioned legal/commercial text metadata.

Important columns:

- `id uuid`
- `text_key text`
- `version text`
- `language text`
- `title text`
- `content_hash text`
- `effective_from timestamptz`
- `effective_to timestamptz`
- `status text`
- `created_at timestamptz`

Primary key: `id`.

Foreign keys: none.

Uniqueness:

- unique `(text_key, version, language)`

Customer-visible: labels and rendered copies, not necessarily raw backend metadata.

RLS stance: readable through controlled endpoint or public read if approved; writes admin/service-role-only.

Audit/fraud relevance: high. Consent and fee disputes depend on exact version/hash/language.

Old schema relationship: replace fixed consent version assumptions.

### `app_consent_acceptances`

Purpose: accepted processing/control/mandate/no-guarantee consents.

Important columns:

- `id uuid`
- `customer_id uuid`
- `dossier_id uuid`
- `legal_text_version_id uuid`
- `consent_type text`
- `accepted boolean`
- `accepted_at timestamptz`
- `duration_choice text`
- `withdrawn_at timestamptz`
- `request_metadata jsonb`
- `actor_ref text`

Primary key: `id`.

Foreign keys:

- `customer_id -> app_customers.id`
- `dossier_id -> app_customer_dossiers.id`
- `legal_text_version_id -> app_legal_text_versions.id`

Uniqueness:

- unique active `(dossier_id, consent_type, legal_text_version_id)`

Customer-visible: yes, summarized.

RLS stance: customer may read own acceptances; service-role writes only.

Audit/fraud relevance: high. Consent scope, duration, and withdrawal are legal/audit evidence.

Old schema relationship: replace/adapt `dossier_consents`.

### `app_fee_terms_acceptances`

Purpose: accepted result-based fee terms/version.

Important columns:

- `id uuid`
- `customer_id uuid`
- `dossier_id uuid`
- `legal_text_version_id uuid`
- `fee_model_version text`
- `success_fee_percentage numeric`
- `accepted_at timestamptz`
- `request_metadata jsonb`
- `actor_ref text`

Primary key: `id`.

Foreign keys:

- `customer_id -> app_customers.id`
- `dossier_id -> app_customer_dossiers.id`
- `legal_text_version_id -> app_legal_text_versions.id`

Uniqueness:

- unique active `(dossier_id, fee_model_version)`

Customer-visible: yes, summarized.

RLS stance: customer may read own acceptance summary; service-role writes only.

Audit/fraud relevance: high. No fee calculation should run without accepted fee terms version.

Old schema relationship: new.

### `app_customer_requests`

Purpose: ENVAL requests information, correction, upload, consent, or kWh from a customer.

Important columns:

- `id uuid`
- `dossier_id uuid`
- `request_type text`
- `status text`
- `title text`
- `customer_message text`
- `scope_type text`
- `scope_id uuid`
- `due_at timestamptz`
- `created_by_actor_ref text`
- `created_at timestamptz`
- `closed_at timestamptz`

Primary key: `id`.

Foreign keys:

- `dossier_id -> app_customer_dossiers.id`

Uniqueness:

- optional active uniqueness for same `(dossier_id, request_type, scope_type, scope_id)` depending workflow

Customer-visible: yes.

RLS stance: customer may read and respond to own requests through endpoint; service-role writes.

Audit/fraud relevance: high. Requests drive corrections and evidence additions.

Old schema relationship: new; adapt mail/audit patterns.

### `app_request_responses`

Purpose: customer response to a request.

Important columns:

- `id uuid`
- `request_id uuid`
- `dossier_id uuid`
- `response_type text`
- `response_text text`
- `document_version_id uuid`
- `data_patch_summary jsonb`
- `submitted_by_customer_id uuid`
- `status text`
- `created_at timestamptz`

Primary key: `id`.

Foreign keys:

- `request_id -> app_customer_requests.id`
- `dossier_id -> app_customer_dossiers.id`
- `document_version_id -> app_document_versions.id`
- `submitted_by_customer_id -> app_customers.id`

Uniqueness:

- idempotency-controlled; no broad uniqueness beyond PK at first

Customer-visible: yes.

RLS stance: customer may read own responses; writes through Edge Function only.

Audit/fraud relevance: high. Corrections must be tied to actor, request, and evidence.

Old schema relationship: new.

### `app_support_threads`

Purpose: customer/support conversation container.

Important columns:

- `id uuid`
- `customer_id uuid`
- `dossier_id uuid`
- `subject text`
- `status text`
- `created_at timestamptz`
- `updated_at timestamptz`

Primary key: `id`.

Foreign keys:

- `customer_id -> app_customers.id`
- `dossier_id -> app_customer_dossiers.id`

Uniqueness:

- none initially

Customer-visible: yes.

RLS stance: customer may read own thread projection; writes through endpoint.

Audit/fraud relevance: medium. Support can become evidence if used for corrections.

Old schema relationship: new; outbound email queue remains conceptually useful.

### `app_support_messages`

Purpose: individual support/customer messages.

Important columns:

- `id uuid`
- `thread_id uuid`
- `dossier_id uuid`
- `sender_type text`
- `sender_ref text`
- `body text`
- `status text`
- `created_at timestamptz`

Primary key: `id`.

Foreign keys:

- `thread_id -> app_support_threads.id`
- `dossier_id -> app_customer_dossiers.id`

Uniqueness:

- idempotency-controlled for sends

Customer-visible: yes, with internal metadata hidden.

RLS stance: customer may read own message projection; service-role writes.

Audit/fraud relevance: medium.

Old schema relationship: new; do not treat outbound email as source of truth.

### `app_kwh_periods`

Purpose: yearly/periodic kWh claim windows.

Important columns:

- `id uuid`
- `dossier_id uuid`
- `charger_id uuid`
- `period_year integer`
- `period_start date`
- `period_end date`
- `status text`
- `required_by timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Primary key: `id`.

Foreign keys:

- `dossier_id -> app_customer_dossiers.id`
- `charger_id -> app_dossier_chargers.id`

Uniqueness:

- unique `(charger_id, period_year)`

Customer-visible: yes.

RLS stance: customer may read own periods; writes through Edge Functions.

Audit/fraud relevance: high. MID/year duplication and claim period discipline depend on it.

Old schema relationship: new.

### `app_kwh_readings`

Purpose: manual or provider-sourced kWh values.

Important columns:

- `id uuid`
- `kwh_period_id uuid`
- `charger_id uuid`
- `source_type text`
- `value_kwh numeric`
- `reading_status text`
- `entered_by_actor_ref text`
- `provider_ref text`
- `created_at timestamptz`
- `superseded_at timestamptz`

Primary key: `id`.

Foreign keys:

- `kwh_period_id -> app_kwh_periods.id`
- `charger_id -> app_dossier_chargers.id`

Uniqueness:

- one active accepted reading per `kwh_period_id`

Customer-visible: yes.

RLS stance: customer may read own current reading summary; writes through Edge Functions.

Audit/fraud relevance: high. kWh values can drive result/fee events.

Old schema relationship: new.

### `app_kwh_evidence`

Purpose: evidence files or provider payload references for kWh readings.

Important columns:

- `id uuid`
- `kwh_period_id uuid`
- `kwh_reading_id uuid`
- `document_version_id uuid`
- `provider_payload_hash text`
- `status text`
- `created_at timestamptz`

Primary key: `id`.

Foreign keys:

- `kwh_period_id -> app_kwh_periods.id`
- `kwh_reading_id -> app_kwh_readings.id`
- `document_version_id -> app_document_versions.id`

Uniqueness:

- none initially

Customer-visible: summarized.

RLS stance: customer may read own summary; service-role writes.

Audit/fraud relevance: high.

Old schema relationship: new; adapt document version model.

### `app_result_events`

Purpose: value/result lifecycle records.

Important columns:

- `id uuid`
- `dossier_id uuid`
- `event_type text`
- `status text`
- `realized_value_amount numeric`
- `currency text`
- `result_basis text`
- `source_ref text`
- `occurred_at timestamptz`
- `created_at timestamptz`

Primary key: `id`.

Foreign keys:

- `dossier_id -> app_customer_dossiers.id`

Uniqueness:

- idempotency-controlled; possible unique external `source_ref`

Customer-visible: summarized.

RLS stance: customer may read own result summary; service-role writes.

Audit/fraud relevance: high. Fee events depend on result events.

Old schema relationship: adapt export/result preservation concept; new commercial meaning.

### `app_fee_calculation_events`

Purpose: fee calculation, fee due, settlement, reversal, or clawback events.

Important columns:

- `id uuid`
- `dossier_id uuid`
- `result_event_id uuid`
- `fee_terms_acceptance_id uuid`
- `fee_status text`
- `fee_model_version text`
- `success_fee_percentage numeric`
- `basis_amount numeric`
- `fee_amount numeric`
- `currency text`
- `calculation_payload jsonb`
- `created_at timestamptz`

Primary key: `id`.

Foreign keys:

- `dossier_id -> app_customer_dossiers.id`
- `result_event_id -> app_result_events.id`
- `fee_terms_acceptance_id -> app_fee_terms_acceptances.id`

Uniqueness:

- one active fee calculation per result event unless reversal/recalculation model allows more

Customer-visible: summarized.

RLS stance: customer may read own fee summary; service-role writes.

Audit/fraud relevance: high. Commercial disputes depend on this.

Old schema relationship: new.

### `app_customer_timeline_events`

Purpose: curated readable customer timeline.

Important columns:

- `id uuid`
- `customer_id uuid`
- `dossier_id uuid`
- `event_type text`
- `title text`
- `description text`
- `visible_at timestamptz`
- `related_scope_type text`
- `related_scope_id uuid`
- `source_audit_event_id uuid`
- `created_at timestamptz`

Primary key: `id`.

Foreign keys:

- `customer_id -> app_customers.id`
- `dossier_id -> app_customer_dossiers.id`
- `source_audit_event_id -> app_audit_events.id`

Uniqueness:

- optional unique `(source_audit_event_id, event_type)` when event is audit-derived

Customer-visible: yes.

RLS stance: customer may read own timeline; writes service-role/internal projection only.

Audit/fraud relevance: medium. It is not raw audit and must not be used as sole evidence.

Old schema relationship: new projection from audit; do not expose raw `dossier_audit_events`.

### `app_audit_events`

Purpose: internal raw audit trail after customer/dossier scope exists.

Important columns:

- `id uuid`
- `created_at timestamptz`
- `customer_id uuid`
- `dossier_id uuid`
- `actor_type text`
- `actor_ref text`
- `event_type text`
- `event_scope text`
- `event_data jsonb`
- `request_id text`
- `idempotency_key text`
- `ip_hash text`
- `user_agent_hash text`
- `environment text`

Primary key: `id`.

Foreign keys:

- `customer_id -> app_customers.id`
- `dossier_id -> app_customer_dossiers.id`

Uniqueness:

- none by default; idempotency handled separately

Customer-visible: no raw access.

RLS stance: internal/service-role-only.

Audit/fraud relevance: highest. This is the internal reconstruction layer.

Old schema relationship: adapt `dossier_audit_events` meta/event_data pattern.

### `app_intake_audit_events`

Purpose: internal audit for pre-customer or pre-dossier rejects and attempts.

Important columns:

- `id uuid`
- `created_at timestamptz`
- `event_type text`
- `stage text`
- `status text`
- `reason text`
- `request_id text`
- `idempotency_key text`
- `ip_hash text`
- `user_agent_hash text`
- `email_hash text`
- `event_data jsonb`
- `environment text`

Primary key: `id`.

Foreign keys: none.

Uniqueness:

- none initially

Customer-visible: no.

RLS stance: internal/service-role-only.

Audit/fraud relevance: high. Failed/abused intake must be traceable without over-retaining PII.

Old schema relationship: adapt `intake_audit_events`.

### `app_idempotency_keys`

Purpose: scoped idempotency and response replay.

Important columns:

- `scope text`
- `key text`
- `payload_hash text`
- `response_status integer`
- `response_body jsonb`
- `status text`
- `created_at timestamptz`
- `expires_at timestamptz`
- `locked_until timestamptz`

Primary key: `(scope, key)`.

Foreign keys: none.

Uniqueness:

- primary key `(scope, key)`

Customer-visible: no.

RLS stance: internal/service-role-only.

Audit/fraud relevance: high. Prevents duplicate dossiers, uploads, requests, messages, kWh submissions, result events, and fee events.

Old schema relationship: adapt `idempotency_keys` shared helper concept; include scope and payload hash.

### `app_retention_minimization_events`

Purpose: privacy-hard lifecycle proof for expiry, minimization, withdrawal, and cleanup.

Important columns:

- `id uuid`
- `customer_id uuid`
- `dossier_id uuid`
- `retention_class text`
- `event_type text`
- `status text`
- `reason text`
- `counts_summary jsonb`
- `storage_summary jsonb`
- `tombstone_ref text`
- `created_at timestamptz`
- `actor_ref text`

Primary key: `id`.

Foreign keys:

- nullable `customer_id -> app_customers.id`
- nullable `dossier_id -> app_customer_dossiers.id`

Uniqueness:

- optional unique `tombstone_ref`

Customer-visible: sometimes as high-level status only.

RLS stance: internal/service-role-only.

Audit/fraud relevance: high. Must prove minimization without retaining raw PII unnecessarily.

Old schema relationship: adapt `retention_cleanup_events` and cleanup/tombstone discipline.

## 5. Status Enums / Lifecycle

Use database enum types only after the lifecycle is stable. Initial migrations may prefer text with check constraints for easier early iteration.

### Dossier status

- `draft`
- `submitted`
- `needs_customer_action`
- `under_review`
- `eligible_ready_for_inboeking`
- `inboeking_in_progress`
- `year_kwh_required`
- `result_pending`
- `successful_value_realized`
- `fee_due`
- `paid_out_or_settled`
- `rejected_or_paused`
- `expired_minimized`

Customer-safe labels must avoid claiming verification, certification, or guaranteed acceptance.

### Location status

- `received`
- `lookup_confirmed`
- `evidence_needed`
- `in_review`
- `accepted_for_dossier`
- `rejected_or_needs_correction`

### Charger status

- `received`
- `details_needed`
- `mid_needed`
- `mid_review_needed`
- `in_review`
- `accepted_for_dossier`
- `rejected_or_paused`

### Document slot status

- `not_requested`
- `required`
- `optional`
- `missing`
- `uploaded`
- `in_review`
- `accepted_for_dossier`
- `rejected_needs_replacement`
- `not_applicable`

### Document file/version status

- `upload_issued`
- `uploaded_unconfirmed`
- `confirmed`
- `in_review`
- `accepted_for_dossier`
- `rejected`
- `superseded`
- `minimized`

### Request status

- `open`
- `email_sent`
- `viewed`
- `responded`
- `in_review`
- `resolved`
- `cancelled`
- `expired`

### kWh period status

- `not_required_yet`
- `required`
- `manual_value_submitted`
- `provider_value_received`
- `evidence_needed`
- `in_review`
- `accepted_for_result`
- `rejected_needs_correction`

### Result status

- `not_started`
- `pending`
- `value_realized`
- `partially_realized`
- `reversed`
- `clawback_pending`
- `closed_no_value`

### Fee status

- `not_applicable_yet`
- `pending_result`
- `calculable`
- `calculated`
- `due`
- `settled`
- `reversed`
- `disputed`

### Customer timeline event types

- `dossier_started`
- `details_received`
- `address_checked`
- `document_received`
- `document_accepted`
- `document_replacement_needed`
- `customer_action_requested`
- `customer_response_received`
- `dossier_under_review`
- `inboeking_started`
- `year_kwh_requested`
- `year_overview_available`
- `result_recorded`
- `fee_status_updated`
- `dossier_minimized`

### Internal audit event types

Initial groups:

- `signup_submit_received`
- `signup_submit_rejected`
- `customer_created`
- `customer_matched`
- `identity_linked`
- `dossier_created`
- `location_created`
- `charger_created`
- `document_slot_created`
- `upload_url_issued`
- `upload_confirmed`
- `document_version_created`
- `document_status_changed`
- `consent_recorded`
- `fee_terms_recorded`
- `request_created`
- `request_email_queued`
- `request_response_received`
- `support_message_created`
- `kwh_period_created`
- `kwh_reading_submitted`
- `result_event_recorded`
- `fee_calculation_recorded`
- `retention_minimization_applied`
- `backend_validation_rejected`
- `auth_rejected`
- `rate_limit_rejected`
- `idempotency_conflict`

## 6. RLS Model

Principles:

- Enable RLS on every new `app_` table.
- Sensitive/internal tables default to no customer policies.
- Business writes happen through Edge Functions using service-role.
- Customer reads should go through either:
  - narrow RLS policies based on Supabase Auth user -> `app_customer_identities`, or
  - app-specific read Edge Functions returning customer-safe projections.
- Do not allow customer queries by arbitrary `customer_id`.
- Customer dashboard endpoints derive customer access from authenticated Supabase Auth user and `app_customer_identities`.
- Admin/support access is deferred and must not be mixed into customer RLS.

Customer-readable/projection candidates:

- `app_customers` limited profile summary
- `app_customer_dossiers`
- `app_dossier_locations`
- `app_dossier_chargers`
- `app_document_slots`
- `app_document_versions` summarized
- `app_customer_requests`
- `app_request_responses`
- `app_support_threads`
- `app_support_messages`
- `app_kwh_periods`
- `app_kwh_readings` summarized
- `app_result_events` summarized
- `app_fee_calculation_events` summarized
- `app_customer_timeline_events`

Internal-only:

- `app_customer_identities`
- `app_document_files`
- `app_legal_text_versions` write side
- `app_audit_events`
- `app_intake_audit_events`
- `app_idempotency_keys`
- `app_retention_minimization_events`
- raw storage paths and provider payload metadata

## 7. Idempotency Model

Use `app_idempotency_keys` for every write endpoint.

Required fields:

- `scope`: endpoint + business actor scope, for example `signup_submit:<email_hash>` or `dossier:<id>:request_response`
- `key`: client/server idempotency key
- `payload_hash`: canonical hash of normalized request payload
- `status`: `started`, `completed`, `failed`, `conflict`
- `response_status`
- `response_body`
- `expires_at`

Rules:

- Same `(scope, key)` and same `payload_hash`: replay stored response if complete.
- Same `(scope, key)` and different `payload_hash`: reject as conflict and audit.
- Started but not complete: return retry-safe pending/conflict behavior.
- Never use unscoped keys globally across all endpoints.
- Do not store raw secrets or full PII-heavy payloads in idempotency rows.

Required endpoints:

- signup submit
- auth bootstrap/recovery link issue
- document upload URL issue
- document upload confirm
- customer request respond
- support message create
- kWh submit
- result event create
- fee calculation create
- retention/minimization apply

## 8. Audit Event Model

### `app_audit_events`

Shape:

- stable ID and timestamp
- customer/dossier scope when known
- actor type and actor reference
- event type
- event scope
- request metadata
- idempotency key reference
- safe event payload
- environment

Actor types:

- `customer`
- `system`
- `support`
- `admin`
- `edge_function`
- `worker`
- `provider`
- `unknown`

Event scopes:

- `intake`
- `auth`
- `customer`
- `dossier`
- `location`
- `charger`
- `document`
- `request`
- `support`
- `consent`
- `kwh`
- `result`
- `fee`
- `retention`

PII rules:

- Store references, hashes, normalized summaries, and IDs where enough.
- Avoid raw IP and raw user agent; prefer hash plus request metadata where useful.
- Avoid storing full document text or OCR payload in audit rows.
- Do not store raw storage paths in customer-visible events.

Fail-open vs fail-closed:

- For legacy functions, audit has often been fail-open to avoid blocking user flow.
- For new `/app` high-risk writes, decide per endpoint:
  - fail-closed when audit is required for legal/fraud reconstruction, such as submit, upload confirm, consent, fee terms, result, fee, retention
  - fail-open only for low-risk read/report events

Relationship to customer timeline:

- `app_audit_events` is internal raw truth.
- `app_customer_timeline_events` is curated customer communication.
- A timeline event may reference an audit event, but timeline content must not expose raw audit payloads.

### `app_intake_audit_events`

Use when customer/dossier scope is not yet created:

- eligibility reject
- malformed signup submit
- abuse/rate limit reject
- auth bootstrap/recovery reject
- duplicate/conflict before customer match

Intake audit should minimize PII and use hashes for email/IP where possible.

## 9. Evidence / Document Model

Core split:

- `app_document_slots`: what evidence is expected
- `app_document_files`: the physical file metadata and storage pointer
- `app_document_versions`: immutable history linking files to slots

Upload flow:

1. Customer requests an upload URL for a slot/request.
2. Backend authorizes customer/dossier/slot access.
3. Backend creates an upload intent or audit event.
4. Backend issues signed upload URL.
5. Browser uploads directly to private storage path.
6. Customer calls confirm endpoint.
7. Backend downloads/reads object metadata server-side, computes SHA-256, validates MIME/extension/size, creates `app_document_files`, and creates a new `app_document_versions` row.
8. Slot current version updates only after confirm succeeds.

Rules:

- Issued upload URL is not evidence.
- Confirmed server-side hash is evidence.
- Replacement creates a new version; it does not mutate or delete old versions.
- Rejected files remain as historical evidence unless retention/minimization policy removes them.
- Storage path rules should include customer/dossier/slot/version IDs but not leak direct public access.
- No direct public bucket access.
- Downloads use short-lived signed URLs and customer/dossier authorization.

## 10. Legal / Fee Model

Tables:

- `app_legal_text_versions`
- `app_consent_acceptances`
- `app_fee_terms_acceptances`
- `app_result_events`
- `app_fee_calculation_events`

Required legal records:

- processing permission
- control/mandate-like permission for needed checks
- terms acceptance
- privacy acknowledgement
- fee/success terms acceptance
- no-guarantee acknowledgement
- consent duration choice if legally required

Rules:

- Store legal text version, hash, language, accepted timestamp, customer identity context, request metadata, and actor reference.
- No result-based fee calculation without accepted fee terms version.
- Exact "result" definition is still legal-open.
- Exact fee base, VAT/tax wording, partial success, reversal, audit correction, and clawback remain open.
- Customer-facing copy may say no guarantee; internal/legal text must be precise.
- ENVAL should not claim verifier/certifier/compliance status in public or legal copy unless a future legal decision changes that.

## 11. kWh / MID / Year Model

Tables:

- `app_kwh_periods`
- `app_kwh_readings`
- `app_kwh_evidence`
- charger MID fields in `app_dossier_chargers`

Rules:

- Model kWh by charger and period/year.
- One active accepted reading per charger/year period.
- Support manual customer reading first.
- Support document evidence linked through document slots/versions.
- Future provider/backend readout should create provider-sourced readings with payload hash/reference.
- MID number remains charger-level and must be used in duplicate/risk checks.
- MID/year duplicate discipline belongs in backend checks, not frontend truth.
- Corrections after result/export must create new events/versions and may create reversal/clawback/fee recalculation events.
- Do not overwrite old readings; supersede them.

Open provider concerns:

- exact backend supplier connection model
- provider authorization flow
- provider payload integrity
- mapping provider charger IDs to ENVAL charger/MID records

## 12. Migration Sequence

A. Docs accepted

- Review this document.
- Confirm table family, RLS posture, and first endpoint dependencies.

B. Create migration SQL

- Add `app_` tables alongside legacy tables.
- Add comments, indexes, check constraints, RLS enabled, and deny-by-default policies.
- Do not wire frontend yet.

C. Add read-only schema smoke tests

- Verify tables exist.
- Verify RLS is enabled.
- Verify anon/authenticated cannot read internal tables.
- Verify service-role can write where expected in local/test context.

D. Implement signup submit endpoint

- `api-app-signup-submit`
- Creates/matches customer, identity bootstrap state, dossier, locations, chargers, document slots, consent/fee records, timeline, and audit.
- Uses idempotency and backend validation.

E. Implement auth bootstrap

- Decide exact Supabase Auth/magic-link UX.
- Create dashboard access without reusing old `dossier_sessions` as durable identity.

F. Implement dashboard read endpoint

- Return customer-safe read model.
- Do not expose raw audit or internal review state.

G. Implement document upload issue/confirm

- Signed URL issue.
- Server-side SHA-256 confirm.
- Slot/version updates.

H. Implement customer requests

- ENVAL creates requests.
- Email notification goes out.
- Customer responds in dashboard.
- Response is audited and reviewed.

I. Implement kWh/result/fee lifecycle

- kWh periods/readings/evidence.
- result events.
- fee calculation events.
- reversal/clawback model after legal review.

J. Connect frontend submit/dashboard to real backend

- Only after contracts, migrations, RLS, endpoints, and browser QA are accepted.
- Do not connect `/app` to old `api-dossier-*` endpoints.

## 13. Open Decisions

- Exact legal definition of "result" for the result-based fee.
- Exact fee base: gross/net, VAT/tax, partial success, reversal, correction, clawback.
- Exact legal text, privacy text, mandate/control permission, and version hashes.
- Whether consent duration is required and how withdrawal works.
- Supabase Auth UX: magic link, email OTP, passwordless, password later, or hybrid.
- Auth bootstrap implementation details.
- Admin/support role model and route/app boundary.
- Storage bucket separation and path convention.
- Whether document uploads are required at signup or can be requested later.
- Old dossier migration/bridge policy.
- Legacy `docs/documenten` neutral-infrastructure wording cleanup.
- Public copy/legal copy finalization.
- Provider/backend supplier connection flow for kWh readout.
- MID existence and charger/person/company verification sources.
- Energy bill/address/account holder verification process.
- Customer-safe export/year overview format.

## 14. Explicit Non-Goals

- No migration creation in this step.
- No SQL implementation in this step.
- No Edge Function changes in this step.
- No app code changes in this step.
- No Supabase behavior changes in this step.
- No old backend deletion.
- No old schema mutation.
- No direct `/app` coupling to old `api-dossier-*` endpoints.
- No durable customer dashboard identity based on old `dossier_sessions`.
- No customer-visible raw audit.
- No public marketing copy based on internal legal/audit/anti-fraud doctrine.

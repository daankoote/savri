-- ENVAL /app pre-dossier signup intake and quarantine schema
-- Date: 2026-07-16
--
-- Purpose:
-- - Add the lean schema foundation for future public pre-auth intake finalization,
--   private quarantine file metadata, and hashed one-time capabilities.
-- - Keep this separate from the current api-app-signup-submit write v3 flow.
-- - Do not create customers, identities, dossiers, locations, chargers, document
--   versions, storage buckets, storage policies, or Edge Functions in this migration.
--
-- Boundaries:
-- - No legacy table changes.
-- - No Edge Function changes.
-- - No frontend changes.
-- - No storage bucket or storage policy changes.
-- - Browser access remains Edge-only; no anon/authenticated table access.
-- - Exact TTL and minimization intervals are still an operational decision.

create table public.app_signup_intakes (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'collecting',
  submitted_payload jsonb not null,
  submitted_payload_sha256 text not null,
  client_precheck jsonb null,
  accepted_legal_versions jsonb not null,
  email_normalized text not null,
  request_id text null,
  created_at timestamptz not null default now(),
  finalized_at timestamptz null,
  verification_sent_at timestamptz null,
  verified_at timestamptz null,
  promotion_started_at timestamptz null,
  promoted_at timestamptz null,
  promotion_dossier_id uuid null,
  expires_at timestamptz not null,
  expired_at timestamptz null,
  minimized_at timestamptz null,

  constraint app_signup_intakes_status_chk
    check (status in ('collecting', 'pending_verification', 'promoting', 'promoted', 'rejected', 'expired')),

  constraint app_signup_intakes_submitted_payload_object_chk
    check (jsonb_typeof(submitted_payload) = 'object'),

  constraint app_signup_intakes_accepted_legal_versions_shape_chk
    check (
      jsonb_typeof(accepted_legal_versions) = 'object'
      and accepted_legal_versions ? 'items'
      and jsonb_typeof(accepted_legal_versions -> 'items') = 'array'
    ),

  constraint app_signup_intakes_submitted_payload_sha256_chk
    check (submitted_payload_sha256 ~ '^[0-9a-f]{64}$'),

  constraint app_signup_intakes_email_normalized_not_blank_chk
    check (btrim(email_normalized) <> ''),

  constraint app_signup_intakes_request_id_not_blank_chk
    check (request_id is null or btrim(request_id) <> ''),

  constraint app_signup_intakes_expires_after_created_chk
    check (expires_at > created_at),

  constraint app_signup_intakes_finalized_state_chk
    check (
      status = 'collecting'
      or finalized_at is not null
    ),

  constraint app_signup_intakes_verified_before_promoting_chk
    check (
      status not in ('promoting', 'promoted')
      or verified_at is not null
    ),

  constraint app_signup_intakes_promoted_pair_chk
    check (
      (promoted_at is null and promotion_dossier_id is null)
      or (promoted_at is not null and promotion_dossier_id is not null)
    ),

  constraint app_signup_intakes_promoted_state_chk
    check (
      status <> 'promoted'
      or (promoted_at is not null and promotion_dossier_id is not null)
    ),

  constraint app_signup_intakes_expired_state_chk
    check (
      status <> 'expired'
      or expired_at is not null
    )
);

create index if not exists app_signup_intakes_status_expires_at_idx
  on public.app_signup_intakes (status, expires_at);

create index if not exists app_signup_intakes_email_normalized_idx
  on public.app_signup_intakes (email_normalized);

create index if not exists app_signup_intakes_promotion_dossier_id_idx
  on public.app_signup_intakes (promotion_dossier_id)
  where promotion_dossier_id is not null;

create table public.app_signup_intake_files (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.app_signup_intakes (id) on delete cascade,
  client_slot_id text not null,
  document_type text not null,
  original_filename text not null,
  declared_mime_type text not null,
  detected_mime_type text null,
  size_bytes bigint not null,
  sha256 text not null,
  storage_bucket text not null,
  storage_path text not null,
  status text not null default 'expected',
  issued_at timestamptz null,
  uploaded_at timestamptz null,
  confirmed_at timestamptz null,
  promoted_at timestamptz null,
  promoted_document_file_id uuid null,
  rejected_at timestamptz null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint app_signup_intake_files_intake_client_slot_key
    unique (intake_id, client_slot_id),

  constraint app_signup_intake_files_status_chk
    check (
      status in (
        'expected',
        'upload_issued',
        'uploaded_pending_confirm',
        'confirmed_quarantine',
        'promoted',
        'rejected',
        'expired'
      )
    ),

  constraint app_signup_intake_files_size_bytes_chk
    check (size_bytes > 0),

  constraint app_signup_intake_files_sha256_chk
    check (sha256 ~ '^[0-9a-f]{64}$'),

  constraint app_signup_intake_files_expires_after_created_chk
    check (expires_at > created_at),

  constraint app_signup_intake_files_confirmed_state_chk
    check (
      status not in ('confirmed_quarantine', 'promoted')
      or confirmed_at is not null
    ),

  constraint app_signup_intake_files_promoted_pair_chk
    check (
      (promoted_at is null and promoted_document_file_id is null)
      or (promoted_at is not null and promoted_document_file_id is not null)
    ),

  constraint app_signup_intake_files_promoted_state_chk
    check (
      status <> 'promoted'
      or (confirmed_at is not null and promoted_at is not null and promoted_document_file_id is not null)
    ),

  constraint app_signup_intake_files_rejected_state_chk
    check (
      status <> 'rejected'
      or rejected_at is not null
    ),

  constraint app_signup_intake_files_client_slot_id_not_blank_chk
    check (btrim(client_slot_id) <> ''),

  constraint app_signup_intake_files_document_type_not_blank_chk
    check (btrim(document_type) <> ''),

  constraint app_signup_intake_files_original_filename_not_blank_chk
    check (btrim(original_filename) <> ''),

  constraint app_signup_intake_files_declared_mime_type_not_blank_chk
    check (btrim(declared_mime_type) <> ''),

  constraint app_signup_intake_files_detected_mime_type_not_blank_chk
    check (detected_mime_type is null or btrim(detected_mime_type) <> ''),

  constraint app_signup_intake_files_storage_bucket_not_blank_chk
    check (btrim(storage_bucket) <> ''),

  constraint app_signup_intake_files_storage_path_not_blank_chk
    check (btrim(storage_path) <> '')
);

create index if not exists app_signup_intake_files_intake_id_idx
  on public.app_signup_intake_files (intake_id);

create index if not exists app_signup_intake_files_status_expires_at_idx
  on public.app_signup_intake_files (status, expires_at);

create index if not exists app_signup_intake_files_promoted_document_file_id_idx
  on public.app_signup_intake_files (promoted_document_file_id)
  where promoted_document_file_id is not null;

create table public.app_signup_intake_capabilities (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.app_signup_intakes (id) on delete cascade,
  intake_file_id uuid null references public.app_signup_intake_files (id) on delete cascade,
  capability_type text not null,
  token_sha256 text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  invalidated_at timestamptz null,
  created_at timestamptz not null default now(),

  constraint app_signup_intake_capabilities_token_sha256_key
    unique (token_sha256),

  constraint app_signup_intake_capabilities_capability_type_chk
    check (capability_type in ('quarantine_upload', 'email_verification')),

  constraint app_signup_intake_capabilities_token_sha256_chk
    check (token_sha256 ~ '^[0-9a-f]{64}$'),

  constraint app_signup_intake_capabilities_expires_after_issued_chk
    check (expires_at > issued_at),

  constraint app_signup_intake_capabilities_consumed_before_expiry_chk
    check (consumed_at is null or consumed_at <= expires_at),

  constraint app_signup_intake_capabilities_single_terminal_marker_chk
    check (not (consumed_at is not null and invalidated_at is not null)),

  constraint app_signup_intake_capabilities_type_file_scope_chk
    check (
      (capability_type = 'quarantine_upload' and intake_file_id is not null)
      or (capability_type = 'email_verification' and intake_file_id is null)
    )
);

create index if not exists app_signup_intake_capabilities_intake_id_idx
  on public.app_signup_intake_capabilities (intake_id);

create index if not exists app_signup_intake_capabilities_expires_at_idx
  on public.app_signup_intake_capabilities (expires_at);

create or replace function public.app_signup_intakes_transition_guard()
returns trigger
language plpgsql
as $$
begin
  if old.finalized_at is not null then
    if new.submitted_payload is distinct from old.submitted_payload
       or new.submitted_payload_sha256 is distinct from old.submitted_payload_sha256
       or new.accepted_legal_versions is distinct from old.accepted_legal_versions
       or new.email_normalized is distinct from old.email_normalized
       or new.finalized_at is distinct from old.finalized_at then
      raise exception 'finalized app_signup_intakes submitted facts cannot be changed';
    end if;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'immutable app_signup_intakes identity fields cannot be changed';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'collecting' and new.status = 'pending_verification' then
      return new;
    end if;

    if old.status = 'pending_verification' and new.status in ('promoting', 'expired', 'rejected') then
      return new;
    end if;

    if old.status = 'promoting' and new.status in ('promoted', 'rejected') then
      return new;
    end if;

    raise exception 'invalid app_signup_intakes status transition from % to %', old.status, new.status;
  end if;

  if old.status in ('promoted', 'expired') then
    raise exception 'terminal app_signup_intakes rows cannot be updated';
  end if;

  return new;
end;
$$;

create or replace function public.app_signup_intake_files_transition_guard()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.intake_id is distinct from old.intake_id
     or new.client_slot_id is distinct from old.client_slot_id
     or new.document_type is distinct from old.document_type
     or new.original_filename is distinct from old.original_filename
     or new.declared_mime_type is distinct from old.declared_mime_type
     or new.size_bytes is distinct from old.size_bytes
     or new.sha256 is distinct from old.sha256
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable app_signup_intake_files identity fields cannot be changed';
  end if;

  if old.confirmed_at is not null then
    if new.detected_mime_type is distinct from old.detected_mime_type
       or new.uploaded_at is distinct from old.uploaded_at
       or new.confirmed_at is distinct from old.confirmed_at then
      raise exception 'confirmed app_signup_intake_files metadata cannot be changed';
    end if;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'expected' and new.status in ('upload_issued', 'rejected', 'expired') then
      return new;
    end if;

    if old.status = 'upload_issued' and new.status in ('uploaded_pending_confirm', 'confirmed_quarantine', 'rejected', 'expired') then
      return new;
    end if;

    if old.status = 'uploaded_pending_confirm' and new.status in ('confirmed_quarantine', 'rejected', 'expired') then
      return new;
    end if;

    if old.status = 'confirmed_quarantine' and new.status in ('promoted', 'rejected', 'expired') then
      return new;
    end if;

    raise exception 'invalid app_signup_intake_files status transition from % to %', old.status, new.status;
  end if;

  if old.status in ('promoted', 'rejected', 'expired') then
    raise exception 'terminal app_signup_intake_files rows cannot be updated';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_app_signup_intakes_transition_guard
  on public.app_signup_intakes;

create trigger trg_app_signup_intakes_transition_guard
before update on public.app_signup_intakes
for each row
execute function public.app_signup_intakes_transition_guard();

drop trigger if exists trg_app_signup_intake_files_transition_guard
  on public.app_signup_intake_files;

create trigger trg_app_signup_intake_files_transition_guard
before update on public.app_signup_intake_files
for each row
execute function public.app_signup_intake_files_transition_guard();

alter table public.app_signup_intakes enable row level security;
alter table public.app_signup_intake_files enable row level security;
alter table public.app_signup_intake_capabilities enable row level security;

drop policy if exists deny_all on public.app_signup_intakes;
drop policy if exists deny_all on public.app_signup_intake_files;
drop policy if exists deny_all on public.app_signup_intake_capabilities;

create policy deny_all
on public.app_signup_intakes
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_signup_intake_files
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_signup_intake_capabilities
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_signup_intakes from public;
revoke all on table public.app_signup_intakes from anon;
revoke all on table public.app_signup_intakes from authenticated;
revoke all on table public.app_signup_intakes from service_role;

revoke all on table public.app_signup_intake_files from public;
revoke all on table public.app_signup_intake_files from anon;
revoke all on table public.app_signup_intake_files from authenticated;
revoke all on table public.app_signup_intake_files from service_role;

revoke all on table public.app_signup_intake_capabilities from public;
revoke all on table public.app_signup_intake_capabilities from anon;
revoke all on table public.app_signup_intake_capabilities from authenticated;
revoke all on table public.app_signup_intake_capabilities from service_role;

grant select, insert, update, delete on table public.app_signup_intakes to service_role;
grant select, insert, update, delete on table public.app_signup_intake_files to service_role;
grant select, insert, update, delete on table public.app_signup_intake_capabilities to service_role;

revoke all on function public.app_signup_intakes_transition_guard() from public;
revoke all on function public.app_signup_intakes_transition_guard() from anon;
revoke all on function public.app_signup_intakes_transition_guard() from authenticated;
grant execute on function public.app_signup_intakes_transition_guard() to service_role;

revoke all on function public.app_signup_intake_files_transition_guard() from public;
revoke all on function public.app_signup_intake_files_transition_guard() from anon;
revoke all on function public.app_signup_intake_files_transition_guard() from authenticated;
grant execute on function public.app_signup_intake_files_transition_guard() to service_role;

comment on table public.app_signup_intakes is
'Pre-dossier public signup intake finalized before verified promotion. Service-role only; target flow is not operational until future endpoints/RPCs are implemented.';

comment on column public.app_signup_intakes.status is
'Pre-dossier intake lifecycle. needs_customer_action is intentionally not an intake status; it belongs to a future promoted dossier outcome.';

comment on column public.app_signup_intakes.submitted_payload is
'Exact submitted public intake payload. Immutable after finalized_at is set. Do not expose directly to customers.';

comment on column public.app_signup_intakes.submitted_payload_sha256 is
'Lowercase SHA-256 digest of the canonical submitted payload. Raw payload remains in submitted_payload for controlled server-side promotion only.';

comment on column public.app_signup_intakes.client_precheck is
'Optional browser parser/precheck summary. Non-authoritative; backend validation and promotion decide.';

comment on column public.app_signup_intakes.accepted_legal_versions is
'Deterministic JSON object with an items array describing accepted legal/commercial versions at Start dossier.';

comment on column public.app_signup_intakes.email_normalized is
'Normalized submitted email used by future verification/promotion logic. Email alone is not an authorization capability.';

comment on column public.app_signup_intakes.expires_at is
'Explicit caller-provided intake expiry. Exact TTL and minimization intervals remain an operational decision; no schema default is hardcoded.';

comment on column public.app_signup_intakes.minimized_at is
'Future retention/minimization marker. Exact cleanup interval remains OPEN and must be configured outside this schema.';

comment on table public.app_signup_intake_files is
'Private quarantine file metadata for pre-auth signup intake. Stores no bytes. Later promotion may copy confirmed evidence into immutable app document files/versions.';

comment on column public.app_signup_intake_files.client_slot_id is
'Stable public-intake slot reference scoped to one intake. Unique per intake.';

comment on column public.app_signup_intake_files.storage_bucket is
'Internal quarantine bucket reference. Must not be customer-readable through table access.';

comment on column public.app_signup_intake_files.storage_path is
'Internal quarantine storage path. Must not be customer-readable through table access.';

comment on column public.app_signup_intake_files.sha256 is
'Lowercase SHA-256 digest for the quarantine object metadata. Server-side promotion must revalidate before evidence promotion.';

comment on column public.app_signup_intake_files.expires_at is
'Explicit caller-provided file/quarantine expiry. Exact TTL and cleanup interval remain an operational decision.';

comment on table public.app_signup_intake_capabilities is
'Hashed opaque pre-auth intake capabilities. Raw capability tokens are never stored; atomic one-time consumption belongs to a later RPC.';

comment on column public.app_signup_intake_capabilities.capability_type is
'quarantine_upload is scoped to one intake file; email_verification is scoped to the intake and has no file.';

comment on column public.app_signup_intake_capabilities.token_sha256 is
'Unique lowercase SHA-256 digest of the opaque capability token. Raw token values must never be stored.';

comment on column public.app_signup_intake_capabilities.expires_at is
'Explicit caller-provided capability expiry. Exact TTL and minimization interval remain an operational decision.';

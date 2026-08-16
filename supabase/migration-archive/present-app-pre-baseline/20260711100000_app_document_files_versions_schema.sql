-- ENVAL /app document files and versions schema
-- Date: 2026-07-11
--
-- Purpose:
-- - Add audit-correct upload/file/version primitives before app document upload endpoints.
-- - Keep expected evidence slots separate from physical upload targets and immutable confirmed versions.
--
-- Boundaries:
-- - No legacy table changes.
-- - No Edge Function changes.
-- - No frontend changes.
-- - No storage bucket or storage policy changes.
-- - No customer read policies yet; reads will be exposed through app endpoints/projections later.

alter table public.app_dossier_document_slots
  add column if not exists current_version_id uuid null,
  add column if not exists current_version_number integer null;

alter table public.app_dossier_document_slots
  drop constraint if exists app_dossier_document_slots_current_version_number_chk,
  add constraint app_dossier_document_slots_current_version_number_chk
    check (current_version_number is null or current_version_number > 0);

alter table public.app_dossier_document_slots
  drop constraint if exists app_dossier_document_slots_current_version_pair_chk,
  add constraint app_dossier_document_slots_current_version_pair_chk
    check (
      (current_version_id is null and current_version_number is null)
      or (current_version_id is not null and current_version_number is not null)
    );

alter table public.app_dossier_document_slots
  drop constraint if exists app_dossier_document_slots_id_dossier_key,
  add constraint app_dossier_document_slots_id_dossier_key
    unique (id, dossier_id);

create table public.app_dossier_document_files (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  document_slot_id uuid not null,
  issued_request_id text not null,
  issued_idempotency_key text not null,
  status text not null default 'issued',
  storage_bucket text not null,
  storage_path text not null,
  original_file_name text not null,
  normalized_file_name text not null,
  declared_mime_type text not null,
  declared_size_bytes bigint not null,
  client_sha256 text null,
  detected_mime_type text null,
  stored_size_bytes bigint null,
  server_sha256 text null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  upload_observed_at timestamptz null,
  confirmed_at timestamptz null,
  rejected_at timestamptz null,
  rejection_reason text null,
  expired_at timestamptz null,
  abandoned_at timestamptz null,
  terminal_reason text null,
  confirmed_request_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_dossier_document_files_dossier_fk
    foreign key (dossier_id)
    references public.app_customer_dossiers (id)
    on delete restrict,

  constraint app_dossier_document_files_slot_fk
    foreign key (document_slot_id, dossier_id)
    references public.app_dossier_document_slots (id, dossier_id)
    on delete restrict,

  constraint app_dossier_document_files_status_chk
    check (status in ('issued', 'uploaded', 'confirmed', 'rejected', 'expired', 'abandoned')),

  constraint app_dossier_document_files_declared_size_chk
    check (declared_size_bytes >= 0),

  constraint app_dossier_document_files_stored_size_chk
    check (stored_size_bytes is null or stored_size_bytes >= 0),

  constraint app_dossier_document_files_client_sha256_chk
    check (client_sha256 is null or client_sha256 ~ '^[0-9A-Fa-f]{64}$'),

  constraint app_dossier_document_files_server_sha256_chk
    check (server_sha256 is null or server_sha256 ~ '^[0-9A-Fa-f]{64}$'),

  constraint app_dossier_document_files_expires_after_issued_chk
    check (expires_at > issued_at),

  constraint app_dossier_document_files_confirmed_state_chk
    check (
      status <> 'confirmed'
      or (
        confirmed_at is not null
        and confirmed_request_id is not null
        and detected_mime_type is not null
        and stored_size_bytes is not null
        and server_sha256 is not null
        and upload_observed_at is not null
      )
    ),

  constraint app_dossier_document_files_uploaded_state_chk
    check (
      status not in ('uploaded', 'confirmed')
      or upload_observed_at is not null
    ),

  constraint app_dossier_document_files_rejected_state_chk
    check (
      status <> 'rejected'
      or (rejected_at is not null and rejection_reason is not null)
    ),

  constraint app_dossier_document_files_expired_state_chk
    check (
      status <> 'expired'
      or (expired_at is not null and terminal_reason is not null)
    ),

  constraint app_dossier_document_files_abandoned_state_chk
    check (
      status <> 'abandoned'
      or (abandoned_at is not null and terminal_reason is not null)
    ),

  constraint app_dossier_document_files_storage_bucket_not_blank_chk
    check (btrim(storage_bucket) <> ''),

  constraint app_dossier_document_files_storage_path_not_blank_chk
    check (btrim(storage_path) <> ''),

  constraint app_dossier_document_files_original_file_name_not_blank_chk
    check (btrim(original_file_name) <> ''),

  constraint app_dossier_document_files_normalized_file_name_not_blank_chk
    check (btrim(normalized_file_name) <> ''),

  constraint app_dossier_document_files_declared_mime_type_not_blank_chk
    check (btrim(declared_mime_type) <> ''),

  constraint app_dossier_document_files_detected_mime_type_not_blank_chk
    check (detected_mime_type is null or btrim(detected_mime_type) <> ''),

  constraint app_dossier_document_files_confirmed_request_id_not_blank_chk
    check (confirmed_request_id is null or btrim(confirmed_request_id) <> ''),

  constraint app_dossier_document_files_terminal_reason_not_blank_chk
    check (terminal_reason is null or btrim(terminal_reason) <> ''),

  constraint app_dossier_document_files_storage_object_key
    unique (storage_bucket, storage_path),

  constraint app_dossier_document_files_slot_idem_key
    unique (document_slot_id, issued_idempotency_key),

  constraint app_dossier_document_files_id_slot_dossier_key
    unique (id, document_slot_id, dossier_id)
);

create index if not exists app_dossier_document_files_dossier_id_idx
  on public.app_dossier_document_files (dossier_id);

create index if not exists app_dossier_document_files_document_slot_id_idx
  on public.app_dossier_document_files (document_slot_id);

create index if not exists app_dossier_document_files_status_idx
  on public.app_dossier_document_files (status);

create index if not exists app_dossier_document_files_expires_at_idx
  on public.app_dossier_document_files (expires_at);

create index if not exists app_dossier_document_files_server_sha256_idx
  on public.app_dossier_document_files (server_sha256)
  where server_sha256 is not null;

create index if not exists app_dossier_document_files_issued_request_id_idx
  on public.app_dossier_document_files (issued_request_id);

create index if not exists app_dossier_document_files_confirmed_request_id_idx
  on public.app_dossier_document_files (confirmed_request_id)
  where confirmed_request_id is not null;

create table public.app_dossier_document_versions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  document_slot_id uuid not null,
  document_file_id uuid not null,
  version_number integer not null,
  status text not null default 'current',
  replaced_by_version_id uuid null references public.app_dossier_document_versions (id) on delete restrict,
  created_request_id text not null,
  created_idempotency_key text not null,
  confirmed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint app_dossier_document_versions_dossier_fk
    foreign key (dossier_id)
    references public.app_customer_dossiers (id)
    on delete restrict,

  constraint app_dossier_document_versions_slot_fk
    foreign key (document_slot_id, dossier_id)
    references public.app_dossier_document_slots (id, dossier_id)
    on delete restrict,

  constraint app_dossier_document_versions_file_fk
    foreign key (document_file_id, document_slot_id, dossier_id)
    references public.app_dossier_document_files (id, document_slot_id, dossier_id)
    on delete restrict,

  constraint app_dossier_document_versions_status_chk
    check (status in ('confirmed_pending_current', 'current', 'superseded', 'rejected_after_review', 'withdrawn')),

  constraint app_dossier_document_versions_version_number_chk
    check (version_number > 0),

  constraint app_dossier_document_versions_superseded_replacement_chk
    check (
      (status = 'superseded' and replaced_by_version_id is not null)
      or (status <> 'superseded' and replaced_by_version_id is null)
    ),

  constraint app_dossier_document_versions_no_self_replace_chk
    check (replaced_by_version_id is null or replaced_by_version_id <> id),

  constraint app_dossier_document_versions_slot_version_key
    unique (document_slot_id, version_number),

  constraint app_dossier_document_versions_file_key
    unique (document_file_id),

  constraint app_dossier_document_versions_slot_idem_key
    unique (document_slot_id, created_idempotency_key),

  constraint app_dossier_document_versions_id_slot_dossier_key
    unique (id, document_slot_id, dossier_id),

  constraint app_dossier_document_versions_id_number_slot_dossier_key
    unique (id, version_number, document_slot_id, dossier_id)
);

create index if not exists app_dossier_document_versions_dossier_id_idx
  on public.app_dossier_document_versions (dossier_id);

create index if not exists app_dossier_document_versions_document_slot_id_idx
  on public.app_dossier_document_versions (document_slot_id);

create index if not exists app_dossier_document_versions_status_idx
  on public.app_dossier_document_versions (status);

create index if not exists app_dossier_document_versions_replaced_by_version_id_idx
  on public.app_dossier_document_versions (replaced_by_version_id);

create index if not exists app_dossier_document_versions_confirmed_at_idx
  on public.app_dossier_document_versions (confirmed_at desc);

create unique index if not exists app_dossier_document_versions_current_slot_uidx
  on public.app_dossier_document_versions (document_slot_id)
  where status = 'current';

alter table public.app_dossier_document_slots
  drop constraint if exists app_dossier_document_slots_current_version_fk,
  add constraint app_dossier_document_slots_current_version_fk
    foreign key (current_version_id, current_version_number, id, dossier_id)
    references public.app_dossier_document_versions (id, version_number, document_slot_id, dossier_id)
    on delete restrict;

create index if not exists app_dossier_document_slots_current_version_id_idx
  on public.app_dossier_document_slots (current_version_id);

create or replace function public.app_dossier_document_versions_transition_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'app_dossier_document_versions rows are immutable and cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'current'
       and new.status = 'superseded'
       and old.replaced_by_version_id is null
       and new.replaced_by_version_id is not null
       and new.replaced_by_version_id <> old.id
       and new.id is not distinct from old.id
       and new.dossier_id is not distinct from old.dossier_id
       and new.document_slot_id is not distinct from old.document_slot_id
       and new.document_file_id is not distinct from old.document_file_id
       and new.version_number is not distinct from old.version_number
       and new.created_request_id is not distinct from old.created_request_id
       and new.created_idempotency_key is not distinct from old.created_idempotency_key
       and new.confirmed_at is not distinct from old.confirmed_at
       and new.metadata is not distinct from old.metadata
       and new.created_at is not distinct from old.created_at then
      return new;
    end if;

    if old.status = 'confirmed_pending_current'
       and new.status = 'current'
       and new.id is not distinct from old.id
       and new.dossier_id is not distinct from old.dossier_id
       and new.document_slot_id is not distinct from old.document_slot_id
       and new.document_file_id is not distinct from old.document_file_id
       and new.version_number is not distinct from old.version_number
       and new.replaced_by_version_id is not distinct from old.replaced_by_version_id
       and new.created_request_id is not distinct from old.created_request_id
       and new.created_idempotency_key is not distinct from old.created_idempotency_key
       and new.confirmed_at is not distinct from old.confirmed_at
       and new.metadata is not distinct from old.metadata
       and new.created_at is not distinct from old.created_at then
      return new;
    end if;

    raise exception 'app_dossier_document_versions rows are immutable except current-to-superseded replacement transition';
  end if;

  return new;
end;
$$;

create or replace function public.app_dossier_document_files_transition_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'app_dossier_document_files rows cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('confirmed', 'rejected', 'expired', 'abandoned') then
      raise exception 'terminal app_dossier_document_files rows cannot be updated';
    end if;

    if old.status = 'issued'
       and new.status not in ('uploaded', 'confirmed', 'rejected', 'expired', 'abandoned') then
      raise exception 'invalid app_dossier_document_files status transition from issued to %', new.status;
    end if;

    if old.status = 'uploaded'
       and new.status not in ('confirmed', 'rejected', 'expired', 'abandoned') then
      raise exception 'invalid app_dossier_document_files status transition from uploaded to %', new.status;
    end if;

    if new.dossier_id is distinct from old.dossier_id
       or new.document_slot_id is distinct from old.document_slot_id
       or new.issued_request_id is distinct from old.issued_request_id
       or new.issued_idempotency_key is distinct from old.issued_idempotency_key
       or new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.original_file_name is distinct from old.original_file_name
       or new.normalized_file_name is distinct from old.normalized_file_name
       or new.declared_mime_type is distinct from old.declared_mime_type
       or new.declared_size_bytes is distinct from old.declared_size_bytes
       or new.client_sha256 is distinct from old.client_sha256
       or new.issued_at is distinct from old.issued_at
       or new.expires_at is distinct from old.expires_at
       or new.metadata is distinct from old.metadata
       or new.created_at is distinct from old.created_at then
      raise exception 'immutable app_dossier_document_files fields cannot be changed';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_app_dossier_document_versions_transition_guard
  on public.app_dossier_document_versions;

create trigger trg_app_dossier_document_versions_transition_guard
before update or delete on public.app_dossier_document_versions
for each row
execute function public.app_dossier_document_versions_transition_guard();

drop trigger if exists trg_app_dossier_document_files_transition_guard
  on public.app_dossier_document_files;

create trigger trg_app_dossier_document_files_transition_guard
before update or delete on public.app_dossier_document_files
for each row
execute function public.app_dossier_document_files_transition_guard();

drop trigger if exists trg_app_dossier_document_files_updated_at
  on public.app_dossier_document_files;

create trigger trg_app_dossier_document_files_updated_at
before update on public.app_dossier_document_files
for each row
execute function public.app_set_updated_at();

alter table public.app_dossier_document_files enable row level security;
alter table public.app_dossier_document_versions enable row level security;

drop policy if exists deny_all on public.app_dossier_document_files;
drop policy if exists deny_all on public.app_dossier_document_versions;

create policy deny_all
on public.app_dossier_document_files
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_dossier_document_versions
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_dossier_document_files from public;
revoke all on table public.app_dossier_document_files from anon;
revoke all on table public.app_dossier_document_files from authenticated;
revoke all on table public.app_dossier_document_files from service_role;

revoke all on table public.app_dossier_document_versions from public;
revoke all on table public.app_dossier_document_versions from anon;
revoke all on table public.app_dossier_document_versions from authenticated;
revoke all on table public.app_dossier_document_versions from service_role;

grant select, insert, update on table public.app_dossier_document_files to service_role;
grant select, insert, update on table public.app_dossier_document_versions to service_role;

revoke all on function public.app_dossier_document_versions_transition_guard() from public;
revoke all on function public.app_dossier_document_versions_transition_guard() from anon;
revoke all on function public.app_dossier_document_versions_transition_guard() from authenticated;
grant execute on function public.app_dossier_document_versions_transition_guard() to service_role;

revoke all on function public.app_dossier_document_files_transition_guard() from public;
revoke all on function public.app_dossier_document_files_transition_guard() from anon;
revoke all on function public.app_dossier_document_files_transition_guard() from authenticated;
grant execute on function public.app_dossier_document_files_transition_guard() to service_role;

grant execute on function public.app_set_updated_at() to service_role;

comment on column public.app_dossier_document_slots.current_version_id is
'Pointer to the current confirmed immutable document version. Updated only after successful server-side upload confirmation.';

comment on column public.app_dossier_document_slots.current_version_number is
'Customer-safe current version number summary. Replacement creates a new version instead of mutating historical evidence.';

comment on table public.app_dossier_document_files is
'Physical server-issued document upload target and storage-object metadata for ENVAL /app evidence. This table binds upload-url issuance to upload-confirm.';

comment on constraint app_dossier_document_files_dossier_fk
on public.app_dossier_document_files is
'Parent dossier deletion is blocked while file/upload history exists. Evidence retention/deletion requires a separate explicit lifecycle contract.';

comment on constraint app_dossier_document_files_slot_fk
on public.app_dossier_document_files is
'Parent slot deletion is blocked while file/upload history exists. Evidence retention/deletion requires a separate explicit lifecycle contract.';

comment on column public.app_dossier_document_files.storage_bucket is
'Internal storage bucket reference. Must not be exposed directly to customers.';

comment on column public.app_dossier_document_files.storage_path is
'Internal server-generated storage object path. Must not include PII and must not be customer-exposed directly.';

comment on column public.app_dossier_document_files.client_sha256 is
'Client-provided SHA-256 hint for upload confirmation. Not trusted as truth until server-side hash verification succeeds.';

comment on column public.app_dossier_document_files.server_sha256 is
'Server-computed SHA-256 over stored bytes. This is the upload confirmation truth.';

comment on column public.app_dossier_document_files.status is
'Upload/file lifecycle status. Confirmed, rejected, expired, and abandoned are terminal states.';

comment on table public.app_dossier_document_versions is
'Immutable confirmed evidence version history for ENVAL /app document slots. Replacement creates a new version and supersedes the previous current version.';

comment on constraint app_dossier_document_versions_dossier_fk
on public.app_dossier_document_versions is
'Parent dossier deletion is blocked while confirmed version history exists. Evidence retention/deletion requires a separate explicit lifecycle contract.';

comment on constraint app_dossier_document_versions_slot_fk
on public.app_dossier_document_versions is
'Parent slot deletion is blocked while confirmed version history exists. Evidence retention/deletion requires a separate explicit lifecycle contract.';

comment on column public.app_dossier_document_versions.document_file_id is
'Confirmed physical file row used by this immutable evidence version.';

comment on column public.app_dossier_document_versions.version_number is
'Positive per-slot version number. Old versions remain reconstructable.';

comment on column public.app_dossier_document_versions.replaced_by_version_id is
'Version that superseded this row. Only the current-to-superseded transition may fill this field.';

comment on column public.app_dossier_document_versions.metadata is
'Safe structured metadata only. Do not store raw PDF text, OCR payloads, secrets, JWTs, or storage credentials.';

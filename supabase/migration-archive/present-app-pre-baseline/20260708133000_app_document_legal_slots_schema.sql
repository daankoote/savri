-- ENVAL /app document slots and legal acceptances schema
-- Date: 2026-07-08
--
-- Purpose:
-- - Add expected document slot records for api-app-signup-submit write v3.
-- - Add legal acceptance records for signup consent, terms, fee, privacy, and mandate evidence.
-- - Keep these records alongside the app foundation and locations/chargers schemas.
--
-- Boundaries:
-- - No legacy table changes.
-- - No Edge Function changes.
-- - No frontend changes.
-- - No storage bucket or storage policy changes.
-- - No customer read policies yet; reads will be exposed through app endpoints/projections later.

create table public.app_dossier_document_slots (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.app_customer_dossiers (id) on delete cascade,
  location_id uuid null references public.app_dossier_locations (id) on delete set null,
  charger_id uuid null references public.app_dossier_chargers (id) on delete set null,
  client_slot_id text not null,
  document_type text not null,
  status text not null default 'expected',
  required boolean not null default true,
  title text not null,
  description text null,
  source_hint text null,
  file_object_path text null,
  file_name text null,
  file_mime_type text null,
  file_size_bytes bigint null,
  file_sha256 text null,
  uploaded_at timestamptz null,
  verified_at timestamptz null,
  rejected_at timestamptz null,
  rejection_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_dossier_document_slots_dossier_client_slot_key
    unique (dossier_id, client_slot_id),

  constraint app_dossier_document_slots_status_chk
    check (
      status in (
        'expected',
        'uploaded',
        'processing',
        'needs_review',
        'accepted',
        'rejected',
        'not_required'
      )
    ),

  constraint app_dossier_document_slots_file_size_chk
    check (file_size_bytes is null or file_size_bytes >= 0),

  constraint app_dossier_document_slots_file_sha256_chk
    check (file_sha256 is null or char_length(file_sha256) = 64)
);

create index if not exists app_dossier_document_slots_dossier_id_idx
  on public.app_dossier_document_slots (dossier_id);

create index if not exists app_dossier_document_slots_location_id_idx
  on public.app_dossier_document_slots (location_id);

create index if not exists app_dossier_document_slots_charger_id_idx
  on public.app_dossier_document_slots (charger_id);

create index if not exists app_dossier_document_slots_status_idx
  on public.app_dossier_document_slots (status);

create index if not exists app_dossier_document_slots_document_type_idx
  on public.app_dossier_document_slots (document_type);

create table public.app_dossier_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.app_customer_dossiers (id) on delete cascade,
  customer_id uuid not null references public.app_customers (id) on delete cascade,
  acceptance_type text not null,
  status text not null default 'accepted',
  version_ref text not null,
  version_hash text null,
  accepted_at timestamptz not null default now(),
  actor_type text not null default 'customer',
  actor_ref text null,
  ip_hash text null,
  user_agent_hash text null,
  evidence_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_dossier_legal_acceptances_dossier_type_version_key
    unique (dossier_id, acceptance_type, version_ref),

  constraint app_dossier_legal_acceptances_status_chk
    check (status in ('accepted', 'revoked', 'superseded')),

  constraint app_dossier_legal_acceptances_acceptance_type_chk
    check (
      acceptance_type in (
        'consent_bundle',
        'fee_terms',
        'privacy_terms',
        'service_terms',
        'mandate_authorization'
      )
    ),

  constraint app_dossier_legal_acceptances_version_hash_chk
    check (version_hash is null or char_length(version_hash) = 64)
);

create index if not exists app_dossier_legal_acceptances_dossier_id_idx
  on public.app_dossier_legal_acceptances (dossier_id);

create index if not exists app_dossier_legal_acceptances_customer_id_idx
  on public.app_dossier_legal_acceptances (customer_id);

create index if not exists app_dossier_legal_acceptances_acceptance_type_idx
  on public.app_dossier_legal_acceptances (acceptance_type);

create index if not exists app_dossier_legal_acceptances_status_idx
  on public.app_dossier_legal_acceptances (status);

drop trigger if exists trg_app_dossier_document_slots_updated_at on public.app_dossier_document_slots;

create trigger trg_app_dossier_document_slots_updated_at
before update on public.app_dossier_document_slots
for each row
execute function public.app_set_updated_at();

drop trigger if exists trg_app_dossier_legal_acceptances_updated_at on public.app_dossier_legal_acceptances;

create trigger trg_app_dossier_legal_acceptances_updated_at
before update on public.app_dossier_legal_acceptances
for each row
execute function public.app_set_updated_at();

alter table public.app_dossier_document_slots enable row level security;
alter table public.app_dossier_legal_acceptances enable row level security;

drop policy if exists deny_all on public.app_dossier_document_slots;
drop policy if exists deny_all on public.app_dossier_legal_acceptances;

create policy deny_all
on public.app_dossier_document_slots
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_dossier_legal_acceptances
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_dossier_document_slots from public;
revoke all on table public.app_dossier_document_slots from anon;
revoke all on table public.app_dossier_document_slots from authenticated;
revoke all on table public.app_dossier_document_slots from service_role;

revoke all on table public.app_dossier_legal_acceptances from public;
revoke all on table public.app_dossier_legal_acceptances from anon;
revoke all on table public.app_dossier_legal_acceptances from authenticated;
revoke all on table public.app_dossier_legal_acceptances from service_role;

grant select, insert, update, delete on table public.app_dossier_document_slots to service_role;
grant select, insert, update, delete on table public.app_dossier_legal_acceptances to service_role;

comment on table public.app_dossier_document_slots is
'Expected document/evidence slots for an ENVAL /app dossier. This table defines required evidence and review/upload state; it is not storage bucket policy.';

comment on column public.app_dossier_document_slots.client_slot_id is
'Stable client/backend slot reference for idempotent mapping and later upload flows.';

comment on column public.app_dossier_document_slots.document_type is
'Document/evidence type. Intentionally not constrained yet so future evidence types do not require a schema migration.';

comment on column public.app_dossier_document_slots.file_object_path is
'Optional future storage object path after upload. Not required while slots are expected but files are missing.';

comment on column public.app_dossier_document_slots.file_sha256 is
'Optional server-confirmed SHA-256 hex digest after upload confirmation.';

comment on table public.app_dossier_legal_acceptances is
'Legal/commercial acceptance evidence for an ENVAL /app dossier. Stores version references and hashed request metadata, not raw IP or user agent.';

comment on column public.app_dossier_legal_acceptances.acceptance_type is
'Accepted legal/commercial item, such as consent bundle, fee terms, privacy terms, service terms, or mandate authorization.';

comment on column public.app_dossier_legal_acceptances.version_ref is
'Version reference for the accepted legal/commercial text or bundle.';

comment on column public.app_dossier_legal_acceptances.version_hash is
'Optional SHA-256 hex digest of the accepted legal/commercial text or bundle.';

comment on column public.app_dossier_legal_acceptances.ip_hash is
'Hashed request IP input when available. Raw IP must not be stored here.';

comment on column public.app_dossier_legal_acceptances.user_agent_hash is
'Hashed request user agent input when available. Raw user agent must not be stored here.';

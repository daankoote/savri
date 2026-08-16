-- ENVAL retention cleanup tombstones
-- Purpose:
-- - Preserve minimal, privacy-hard proof that runtime cleanup was attempted/applied.
-- - Survive deletion of runtime dossier rows.
-- - Avoid PII and avoid FK dependency on public.dossiers.
--
-- Privacy model:
-- - No email/name/address/ip/ua.
-- - No raw storage paths.
-- - dossier_id is retained as historical reference only.
-- - No foreign key to dossiers, because the runtime dossier may be deleted.

create table if not exists public.retention_cleanup_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  request_id text not null,
  environment text not null default 'unknown',
  actor_ref text not null default 'system:retention-worker',

  dossier_id uuid not null,
  retention_class text not null,
  cleanup_reason text not null,
  status text not null,

  apply boolean not null default true,
  preserved boolean not null default false,
  export_id uuid null,

  runtime_documents_count integer not null default 0,
  runtime_chargers_count integer not null default 0,
  runtime_audit_events_count integer not null default 0,
  runtime_sessions_count integer not null default 0,
  runtime_analysis_runs_count integer not null default 0,
  runtime_observed_sources_count integer not null default 0,

  runtime_storage_path_count integer not null default 0,
  preserved_storage_path_count integer not null default 0,
  deletable_storage_path_count integer not null default 0,
  deleted_storage_object_count integer not null default 0,

  db_cleanup_applied boolean not null default false,
  deleted_runtime_dossier boolean not null default false,

  error_stage text null,
  error_message text null,

  event_data jsonb not null default '{}'::jsonb,

  constraint retention_cleanup_events_status_chk
    check (status in ('started', 'success', 'failed')),

  constraint retention_cleanup_events_counts_nonnegative_chk
    check (
      runtime_documents_count >= 0
      and runtime_chargers_count >= 0
      and runtime_audit_events_count >= 0
      and runtime_sessions_count >= 0
      and runtime_analysis_runs_count >= 0
      and runtime_observed_sources_count >= 0
      and runtime_storage_path_count >= 0
      and preserved_storage_path_count >= 0
      and deletable_storage_path_count >= 0
      and deleted_storage_object_count >= 0
    )
);

create index if not exists retention_cleanup_events_dossier_id_idx
  on public.retention_cleanup_events (dossier_id);

create index if not exists retention_cleanup_events_created_at_idx
  on public.retention_cleanup_events (created_at desc);

create index if not exists retention_cleanup_events_status_idx
  on public.retention_cleanup_events (status, created_at desc);

create or replace function public.set_retention_cleanup_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_retention_cleanup_events_updated_at on public.retention_cleanup_events;

create trigger trg_retention_cleanup_events_updated_at
before update on public.retention_cleanup_events
for each row
execute function public.set_retention_cleanup_events_updated_at();

alter table public.retention_cleanup_events enable row level security;

drop policy if exists deny_all on public.retention_cleanup_events;

create policy deny_all
on public.retention_cleanup_events
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.retention_cleanup_events from public;
revoke all on table public.retention_cleanup_events from anon;
revoke all on table public.retention_cleanup_events from authenticated;

grant select, insert, update on table public.retention_cleanup_events to service_role;

comment on table public.retention_cleanup_events is
'Privacy-hard retention cleanup tombstone table. No FK to dossiers and no PII. Used to prove cleanup attempts/results after runtime dossier data is deleted.';

comment on column public.retention_cleanup_events.dossier_id is
'Historical dossier UUID reference only. No FK because runtime dossier may be deleted.';

comment on column public.retention_cleanup_events.event_data is
'Non-PII structured cleanup metadata only. No raw storage paths, email, address, IP or UA.';

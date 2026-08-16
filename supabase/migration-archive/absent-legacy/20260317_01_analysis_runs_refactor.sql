-- 20260317_01_analysis_runs_refactor.sql

begin;

-- =====================================================
-- 1) NEW TABLE: dossier_analysis_runs
-- =====================================================

create table if not exists public.dossier_analysis_runs (
  id uuid not null default gen_random_uuid(),
  dossier_id uuid not null,
  trigger_type text not null,
  requested_by_actor_type text not null,
  requested_by_actor_ref text null,
  request_source text not null,
  mode text not null default 'refresh',
  status text not null,
  method_code text not null,
  method_version text not null,
  worker_runtime text null,
  worker_version text null,
  trigger_reason text null,
  document_count integer not null default 0,
  supported_document_count integer not null default 0,
  started_at timestamp with time zone null,
  finished_at timestamp with time zone null,
  error_code text null,
  error_message text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint dossier_analysis_runs_pkey
    primary key (id),

  constraint dossier_analysis_runs_dossier_id_fkey
    foreign key (dossier_id)
    references public.dossiers (id)
    on delete cascade,

  constraint dossier_analysis_runs_status_check
    check (
      status = any (
        array[
          'queued'::text,
          'running'::text,
          'completed'::text,
          'failed'::text,
          'cancelled'::text
        ]
      )
    ),

  constraint dossier_analysis_runs_mode_check
    check (
      mode = any (
        array[
          'refresh'::text
        ]
      )
    ),

  constraint dossier_analysis_runs_trigger_type_check
    check (
      trigger_type = any (
        array[
          'auto_on_lock'::text,
          'manual_rerun'::text,
          'admin_rerun'::text,
          'system_rerun'::text
        ]
      )
    ),

  constraint dossier_analysis_runs_requested_by_actor_type_check
    check (
      requested_by_actor_type = any (
        array[
          'customer'::text,
          'admin'::text,
          'system'::text
        ]
      )
    )
) tablespace pg_default;

create index if not exists idx_analysis_runs_dossier_created
  on public.dossier_analysis_runs using btree (dossier_id, created_at desc)
  tablespace pg_default;

create index if not exists idx_analysis_runs_status_created
  on public.dossier_analysis_runs using btree (status, created_at asc)
  tablespace pg_default;

create index if not exists idx_analysis_runs_dossier_status_created
  on public.dossier_analysis_runs using btree (dossier_id, status, created_at desc)
  tablespace pg_default;

-- maximaal 1 actieve run per dossier (queued/running)
create unique index if not exists uq_analysis_runs_one_active_per_dossier
  on public.dossier_analysis_runs (dossier_id)
  where status in ('queued', 'running');


-- =====================================================
-- 2) ADD run_id columns
-- =====================================================

alter table public.dossier_analysis_document
  add column if not exists run_id uuid null;

alter table public.dossier_analysis_charger
  add column if not exists run_id uuid null;

alter table public.dossier_analysis_summary
  add column if not exists run_id uuid null;


-- =====================================================
-- 3) ADD FKs for run_id
-- =====================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dossier_analysis_document_run_id_fkey'
  ) then
    alter table public.dossier_analysis_document
      add constraint dossier_analysis_document_run_id_fkey
      foreign key (run_id)
      references public.dossier_analysis_runs (id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dossier_analysis_charger_run_id_fkey'
  ) then
    alter table public.dossier_analysis_charger
      add constraint dossier_analysis_charger_run_id_fkey
      foreign key (run_id)
      references public.dossier_analysis_runs (id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dossier_analysis_summary_run_id_fkey'
  ) then
    alter table public.dossier_analysis_summary
      add constraint dossier_analysis_summary_run_id_fkey
      foreign key (run_id)
      references public.dossier_analysis_runs (id)
      on delete cascade;
  end if;
end $$;


-- =====================================================
-- 4) CLEAN OLD DATA (YOU SAID THIS MAY BE WIPED)
-- =====================================================

delete from public.dossier_analysis_summary;
delete from public.dossier_analysis_charger;
delete from public.dossier_analysis_document;


-- =====================================================
-- 5) DROP OLD UNIQUE CONSTRAINTS / INDEXES
-- =====================================================

-- dossier_analysis_document old unique
alter table public.dossier_analysis_document
  drop constraint if exists dossier_analysis_document_document_id_analysis_kind_method__key;

drop index if exists public.dossier_analysis_document_document_id_analysis_kind_method__key;

-- dossier_analysis_charger old unique
alter table public.dossier_analysis_charger
  drop constraint if exists dossier_analysis_charger_charger_id_analysis_code_method_ve_key;

drop index if exists public.dossier_analysis_charger_charger_id_analysis_code_method_ve_key;

-- dossier_analysis_summary old unique
alter table public.dossier_analysis_summary
  drop constraint if exists dossier_analysis_summary_dossier_id_method_code_method_vers_key;

drop index if exists public.dossier_analysis_summary_dossier_id_method_code_method_vers_key;


-- =====================================================
-- 6) SET run_id NOT NULL
--    (safe now because old rows are deleted)
-- =====================================================

alter table public.dossier_analysis_document
  alter column run_id set not null;

alter table public.dossier_analysis_charger
  alter column run_id set not null;

alter table public.dossier_analysis_summary
  alter column run_id set not null;


-- =====================================================
-- 7) NEW RUN-BASED UNIQUES
-- =====================================================

create unique index if not exists uq_analysis_document_run_document_kind
  on public.dossier_analysis_document (run_id, document_id, analysis_kind)
  tablespace pg_default;

create unique index if not exists uq_analysis_charger_run_code_source
  on public.dossier_analysis_charger (run_id, charger_id, analysis_code, source_document_id)
  tablespace pg_default;

create unique index if not exists uq_analysis_summary_run
  on public.dossier_analysis_summary (run_id)
  tablespace pg_default;


-- =====================================================
-- 8) SUPPORTING INDEXES
-- =====================================================

create index if not exists idx_analysis_document_run
  on public.dossier_analysis_document using btree (run_id)
  tablespace pg_default;

create index if not exists idx_analysis_document_dossier_run
  on public.dossier_analysis_document using btree (dossier_id, run_id)
  tablespace pg_default;

create index if not exists idx_analysis_document_document
  on public.dossier_analysis_document using btree (document_id)
  tablespace pg_default;

create index if not exists idx_analysis_charger_run
  on public.dossier_analysis_charger using btree (run_id)
  tablespace pg_default;

create index if not exists idx_analysis_charger_dossier_run
  on public.dossier_analysis_charger using btree (dossier_id, run_id)
  tablespace pg_default;

create index if not exists idx_analysis_charger_charger
  on public.dossier_analysis_charger using btree (charger_id)
  tablespace pg_default;

create index if not exists idx_analysis_summary_dossier_run
  on public.dossier_analysis_summary using btree (dossier_id, run_id)
  tablespace pg_default;


-- =====================================================
-- 9) OPTIONAL DEFAULT STATUS SNAPSHOT SAFETY
-- =====================================================
-- Geen triggers nu. Keep it simple.

commit;
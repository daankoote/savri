-- ENVAL retention cleanup configurable retention windows
-- Date: 2026-05-11
--
-- Contract:
-- - Retention worker config must be passed into DB cleanup helpers.
-- - Avoid split-brain between worker constants and SQL retention windows.
-- - public.dossier_exports remains immutable final audit truth.
-- - Storage cleanup remains separate and must happen through Supabase Storage API.

drop function if exists public.enval_retention_cleanup(boolean, timestamptz, uuid, integer);
drop function if exists public.enval_retention_cleanup(boolean, timestamptz, uuid, integer, integer, integer, integer);

create or replace function public.enval_retention_cleanup(
  p_apply boolean default false,
  p_now timestamptz default now(),
  p_target_dossier_id uuid default null,
  p_limit integer default 50,
  p_preserved_grace_days integer default 3,
  p_draft_retention_days integer default 7,
  p_locked_unpaid_retention_days integer default 14
)
returns table (
  dossier_id uuid,
  retention_class text,
  apply boolean,
  preserved boolean,
  cutoff_at timestamptz,
  dossier_status text,
  locked_at timestamptz,
  updated_at timestamptz,
  export_id uuid,
  export_created_at timestamptz,
  runtime_documents integer,
  runtime_chargers integer,
  runtime_audit_events integer,
  runtime_sessions integer,
  runtime_analysis_runs integer,
  runtime_observed_sources integer,
  runtime_storage_paths jsonb,
  preserved_storage_paths jsonb,
  deletable_storage_paths jsonb,
  deleted_runtime_dossier boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_runtime_storage_paths jsonb;
  v_preserved_storage_paths jsonb;
  v_deletable_storage_paths jsonb;
  v_runtime_documents integer;
  v_runtime_chargers integer;
  v_runtime_audit_events integer;
  v_runtime_sessions integer;
  v_runtime_analysis_runs integer;
  v_runtime_observed_sources integer;
  v_deleted boolean;
begin
  if p_apply and p_target_dossier_id is null then
    raise exception 'RETENTION_CLEANUP_REFUSED: p_apply=true requires p_target_dossier_id';
  end if;

  if coalesce(p_preserved_grace_days, 0) < 1
    or coalesce(p_draft_retention_days, 0) < 1
    or coalesce(p_locked_unpaid_retention_days, 0) < 1
  then
    raise exception 'RETENTION_CONFIG_INVALID: retention day values must be >= 1';
  end if;

  for r in
    with export_latest as (
      select distinct on (de.dossier_id)
        de.id as export_id,
        de.dossier_id,
        de.created_at as export_created_at,
        de.export_json
      from public.dossier_exports de
      where coalesce(de.export_status, '') <> 'voided'
      order by de.dossier_id, de.created_at desc
    ),
    candidates as (
      select
        d.id as candidate_dossier_id,
        d.status::text as candidate_dossier_status,
        d.locked_at as candidate_locked_at,
        d.updated_at as candidate_updated_at,
        el.export_id as candidate_export_id,
        el.export_created_at as candidate_export_created_at,
        el.export_json as candidate_export_json,
        case
          when el.export_id is not null
            and el.export_created_at <= p_now - make_interval(days => p_preserved_grace_days)
            then 'preserved_runtime_cleanup'
          when el.export_id is null
            and d.locked_at is null
            and coalesce(d.status::text, '') not in ('in_review', 'ready_for_booking')
            and d.updated_at <= p_now - make_interval(days => p_draft_retention_days)
            then 'draft_expired'
          when el.export_id is null
            and (
              d.locked_at is not null
              or coalesce(d.status::text, '') in ('in_review', 'ready_for_booking')
            )
            and coalesce(d.locked_at, d.updated_at) <= p_now - make_interval(days => p_locked_unpaid_retention_days)
            then 'locked_unpaid_expired'
          else null
        end as candidate_retention_class,
        case
          when el.export_id is not null
            then el.export_created_at + make_interval(days => p_preserved_grace_days)
          when d.locked_at is null
            and coalesce(d.status::text, '') not in ('in_review', 'ready_for_booking')
            then d.updated_at + make_interval(days => p_draft_retention_days)
          else coalesce(d.locked_at, d.updated_at) + make_interval(days => p_locked_unpaid_retention_days)
        end as candidate_cutoff_at
      from public.dossiers d
      left join export_latest el on el.dossier_id = d.id
      where p_target_dossier_id is null
         or d.id = p_target_dossier_id
    )
    select
      c.candidate_dossier_id,
      c.candidate_dossier_status,
      c.candidate_locked_at,
      c.candidate_updated_at,
      c.candidate_export_id,
      c.candidate_export_created_at,
      c.candidate_export_json,
      c.candidate_retention_class,
      c.candidate_cutoff_at
    from candidates c
    where c.candidate_retention_class is not null
    order by c.candidate_cutoff_at asc, c.candidate_dossier_id asc
    limit greatest(0, coalesce(p_limit, 50))
  loop
    select count(*) into v_runtime_documents
    from public.dossier_documents dd
    where dd.dossier_id = r.candidate_dossier_id;

    select count(*) into v_runtime_chargers
    from public.dossier_chargers dc
    where dc.dossier_id = r.candidate_dossier_id;

    select count(*) into v_runtime_audit_events
    from public.dossier_audit_events dae
    where dae.dossier_id = r.candidate_dossier_id;

    select count(*) into v_runtime_sessions
    from public.dossier_sessions ds
    where ds.dossier_id = r.candidate_dossier_id;

    select count(*) into v_runtime_analysis_runs
    from public.dossier_analysis_runs dar
    where dar.dossier_id = r.candidate_dossier_id;

    select count(*) into v_runtime_observed_sources
    from public.dossier_document_observed_sources dos
    where dos.dossier_id = r.candidate_dossier_id;

    select coalesce(jsonb_agg(distinct jsonb_build_object(
      'bucket', dd.storage_bucket,
      'path', dd.storage_path
    )), '[]'::jsonb)
    into v_runtime_storage_paths
    from public.dossier_documents dd
    where dd.dossier_id = r.candidate_dossier_id
      and dd.storage_bucket is not null
      and dd.storage_path is not null;

    select coalesce(jsonb_agg(distinct jsonb_build_object(
      'bucket', x.storage_bucket,
      'path', x.storage_path
    )), '[]'::jsonb)
    into v_preserved_storage_paths
    from (
      select
        doc->>'storage_bucket' as storage_bucket,
        doc->>'storage_path' as storage_path
      from public.dossier_exports de
      cross join lateral jsonb_array_elements(
        coalesce(de.export_json->'documents_confirmed', '[]'::jsonb)
      ) doc
      where de.dossier_id = r.candidate_dossier_id
        and coalesce(de.export_status, '') <> 'voided'
    ) x
    where x.storage_bucket is not null
      and x.storage_path is not null;

    select coalesce(jsonb_agg(item), '[]'::jsonb)
    into v_deletable_storage_paths
    from jsonb_array_elements(v_runtime_storage_paths) item
    where not exists (
      select 1
      from jsonb_array_elements(v_preserved_storage_paths) protected
      where protected->>'bucket' = item->>'bucket'
        and protected->>'path' = item->>'path'
    );

    v_deleted := false;

    if p_apply then
      if jsonb_array_length(v_deletable_storage_paths) > 0 then
        raise exception 'STORAGE_CLEANUP_REQUIRED_BEFORE_DB_DELETE: dossier_id=% deletable_storage_paths=%',
          r.candidate_dossier_id,
          v_deletable_storage_paths;
      end if;

      perform set_config('enval.dev_reset', 'YES', true);

      delete from public.dossiers d
      where d.id = r.candidate_dossier_id;

      v_deleted := true;
    end if;

    dossier_id := r.candidate_dossier_id;
    retention_class := r.candidate_retention_class;
    apply := p_apply;
    preserved := r.candidate_export_id is not null;
    cutoff_at := r.candidate_cutoff_at;
    dossier_status := r.candidate_dossier_status;
    locked_at := r.candidate_locked_at;
    updated_at := r.candidate_updated_at;
    export_id := r.candidate_export_id;
    export_created_at := r.candidate_export_created_at;
    runtime_documents := v_runtime_documents;
    runtime_chargers := v_runtime_chargers;
    runtime_audit_events := v_runtime_audit_events;
    runtime_sessions := v_runtime_sessions;
    runtime_analysis_runs := v_runtime_analysis_runs;
    runtime_observed_sources := v_runtime_observed_sources;
    runtime_storage_paths := v_runtime_storage_paths;
    preserved_storage_paths := v_preserved_storage_paths;
    deletable_storage_paths := v_deletable_storage_paths;
    deleted_runtime_dossier := v_deleted;

    return next;
  end loop;
end;
$$;

comment on function public.enval_retention_cleanup(boolean, timestamptz, uuid, integer, integer, integer, integer)
is 'Dry-run/apply retention cleanup for runtime dossier data. Retention windows are explicit parameters. Preserved exports remain immutable in public.dossier_exports. DB cleanup only; storage cleanup is separate.';

revoke all on function public.enval_retention_cleanup(boolean, timestamptz, uuid, integer, integer, integer, integer) from public;
revoke all on function public.enval_retention_cleanup(boolean, timestamptz, uuid, integer, integer, integer, integer) from anon;
revoke all on function public.enval_retention_cleanup(boolean, timestamptz, uuid, integer, integer, integer, integer) from authenticated;
grant execute on function public.enval_retention_cleanup(boolean, timestamptz, uuid, integer, integer, integer, integer) to service_role;


drop function if exists public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb);
drop function if exists public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb, integer, integer, integer);

create or replace function public.enval_retention_cleanup_apply_after_storage(
  p_target_dossier_id uuid,
  p_now timestamptz default now(),
  p_confirmed_deleted_storage_paths jsonb default '[]'::jsonb,
  p_preserved_grace_days integer default 3,
  p_draft_retention_days integer default 7,
  p_locked_unpaid_retention_days integer default 14
)
returns table (
  dossier_id uuid,
  retention_class text,
  apply boolean,
  preserved boolean,
  cutoff_at timestamptz,
  dossier_status text,
  locked_at timestamptz,
  updated_at timestamptz,
  export_id uuid,
  export_created_at timestamptz,
  runtime_documents integer,
  runtime_chargers integer,
  runtime_audit_events integer,
  runtime_sessions integer,
  runtime_analysis_runs integer,
  runtime_observed_sources integer,
  runtime_storage_paths jsonb,
  preserved_storage_paths jsonb,
  deletable_storage_paths jsonb,
  deleted_runtime_dossier boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_expected jsonb;
  v_confirmed jsonb;
begin
  if p_target_dossier_id is null then
    raise exception 'RETENTION_CLEANUP_REFUSED: p_target_dossier_id required';
  end if;

  if coalesce(p_preserved_grace_days, 0) < 1
    or coalesce(p_draft_retention_days, 0) < 1
    or coalesce(p_locked_unpaid_retention_days, 0) < 1
  then
    raise exception 'RETENTION_CONFIG_INVALID: retention day values must be >= 1';
  end if;

  select *
    into r
  from public.enval_retention_cleanup(
    false,
    p_now,
    p_target_dossier_id,
    1,
    p_preserved_grace_days,
    p_draft_retention_days,
    p_locked_unpaid_retention_days
  )
  limit 1;

  if r.dossier_id is null then
    raise exception 'RETENTION_CLEANUP_NO_CANDIDATE: dossier_id=%', p_target_dossier_id;
  end if;

  select coalesce(jsonb_agg(item order by item->>'bucket', item->>'path'), '[]'::jsonb)
    into v_expected
  from jsonb_array_elements(coalesce(r.deletable_storage_paths, '[]'::jsonb)) item;

  select coalesce(jsonb_agg(item order by item->>'bucket', item->>'path'), '[]'::jsonb)
    into v_confirmed
  from jsonb_array_elements(coalesce(p_confirmed_deleted_storage_paths, '[]'::jsonb)) item;

  if jsonb_array_length(v_expected) > 0 and v_expected <> v_confirmed then
    raise exception 'RETENTION_CLEANUP_STORAGE_CONFIRMATION_MISMATCH: dossier_id=% expected=% confirmed=%',
      p_target_dossier_id,
      v_expected,
      v_confirmed;
  end if;

  perform set_config('enval.dev_reset', 'YES', true);

  delete from public.dossiers d
  where d.id = p_target_dossier_id;

  dossier_id := r.dossier_id;
  retention_class := r.retention_class;
  apply := true;
  preserved := r.preserved;
  cutoff_at := r.cutoff_at;
  dossier_status := r.dossier_status;
  locked_at := r.locked_at;
  updated_at := r.updated_at;
  export_id := r.export_id;
  export_created_at := r.export_created_at;
  runtime_documents := r.runtime_documents;
  runtime_chargers := r.runtime_chargers;
  runtime_audit_events := r.runtime_audit_events;
  runtime_sessions := r.runtime_sessions;
  runtime_analysis_runs := r.runtime_analysis_runs;
  runtime_observed_sources := r.runtime_observed_sources;
  runtime_storage_paths := r.runtime_storage_paths;
  preserved_storage_paths := r.preserved_storage_paths;
  deletable_storage_paths := r.deletable_storage_paths;
  deleted_runtime_dossier := true;

  return next;
end;
$$;

comment on function public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb, integer, integer, integer)
is 'Applies runtime DB cleanup after storage cleanup has been explicitly confirmed. Retention windows are explicit parameters. Used by retention storage cleanup tooling.';

revoke all on function public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb, integer, integer, integer) from public;
revoke all on function public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb, integer, integer, integer) from anon;
revoke all on function public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb, integer, integer, integer) from authenticated;
grant execute on function public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb, integer, integer, integer) to service_role;

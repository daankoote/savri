-- ENVAL retention cleanup runtime after export
-- Date: 2026-05-11
--
-- Contract:
-- - public.dossier_exports is immutable final audit truth.
-- - Runtime dossier tables are temporary work material.
-- - Preserved/exported dossiers may have runtime rows removed after preservation grace.
-- - Non-preserved dossiers with storage are not DB-deleted until storage cleanup has run.
-- - Storage cleanup is separate from this SQL function.
-- - p_apply=true is intentionally restricted to one explicit dossier_id.

-- ---------------------------------------------------------------------
-- 1) Document lifecycle trigger: allow explicit DB-owner cleanup bypass
-- ---------------------------------------------------------------------

create or replace function public._enval_enforce_document_lifecycle()
returns trigger
language plpgsql
security definer
as $function$
declare
  v_locked_at timestamptz;
  v_status text;
  v_dossier_id uuid;
begin
  -- BYPASS:
  -- Only DB owner session, and only when explicitly enabled.
  -- Required for retention cleanup after export preservation has been proven.
  if current_user = 'postgres' and current_setting('enval.dev_reset', true) = 'YES' then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;

  -- Determine dossier_id for this row.
  v_dossier_id := coalesce(new.dossier_id, old.dossier_id);

  select d.locked_at, d.status
    into v_locked_at, v_status
  from public.dossiers d
  where d.id = v_dossier_id;

  -- If dossier missing, fail closed.
  if v_status is null then
    raise exception 'dossier not found for dossier_documents change (dossier_id=%)', v_dossier_id;
  end if;

  -- Hard lock: once locked or in_review/ready_for_booking, no changes allowed.
  if v_locked_at is not null or v_status in ('in_review', 'ready_for_booking') then
    raise exception 'immutable_row: dossier locked or in review (status=%)', v_status;
  end if;

  -- PRE-REVIEW RULE: allow delete so user can replace wrong uploads.
  if tg_op = 'DELETE' then
    return old;
  end if;

  -- INSERT rules.
  if tg_op = 'INSERT' then
    if new.status is distinct from 'issued' then
      raise exception 'invalid_status_on_insert: status must be issued';
    end if;

    return new;
  end if;

  -- UPDATE rules.
  if tg_op = 'UPDATE' then
    -- Disallow confirmed -> issued rollback.
    if old.status = 'confirmed' and new.status = 'issued' then
      raise exception 'immutable_row: confirmed documents cannot be reverted to issued';
    end if;

    -- Allow issued -> confirmed, but require confirmed_at + file_sha256.
    if old.status = 'issued' and new.status = 'confirmed' then
      if new.confirmed_at is null then
        raise exception 'invalid_confirm: confirmed_at required';
      end if;

      if new.file_sha256 is null then
        raise exception 'invalid_confirm: file_sha256 required';
      end if;

      return new;
    end if;

    -- All other updates allowed pre-review.
    return new;
  end if;

  return coalesce(new, old);
end;
$function$;

comment on function public._enval_enforce_document_lifecycle()
is 'Enforces dossier document lifecycle immutability, with explicit DB-owner retention cleanup bypass via enval.dev_reset=YES.';


-- ---------------------------------------------------------------------
-- 2) Retention cleanup scanner/apply function
-- ---------------------------------------------------------------------

drop function if exists public.enval_retention_cleanup(boolean, timestamptz);
drop function if exists public.enval_retention_cleanup(boolean, timestamptz, uuid, integer);

create or replace function public.enval_retention_cleanup(
  p_apply boolean default false,
  p_now timestamptz default now(),
  p_target_dossier_id uuid default null,
  p_limit integer default 50
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
            and el.export_created_at <= p_now - interval '3 days'
            then 'preserved_runtime_cleanup'
          when el.export_id is null
            and d.locked_at is null
            and coalesce(d.status::text, '') not in ('in_review', 'ready_for_booking')
            and d.updated_at <= p_now - interval '7 days'
            then 'draft_expired'
          when el.export_id is null
            and (
              d.locked_at is not null
              or coalesce(d.status::text, '') in ('in_review', 'ready_for_booking')
            )
            and coalesce(d.locked_at, d.updated_at) <= p_now - interval '14 days'
            then 'locked_unpaid_expired'
          else null
        end as candidate_retention_class,
        case
          when el.export_id is not null
            then el.export_created_at + interval '3 days'
          when d.locked_at is null
            and coalesce(d.status::text, '') not in ('in_review', 'ready_for_booking')
            then d.updated_at + interval '7 days'
          else coalesce(d.locked_at, d.updated_at) + interval '14 days'
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

      -- Existing immutable-trigger bypass name is legacy, but currently canonical.
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

comment on function public.enval_retention_cleanup(boolean, timestamptz, uuid, integer)
is 'Dry-run/apply retention cleanup for runtime dossier data. Preserved exports remain immutable in public.dossier_exports. DB cleanup only; storage cleanup is separate.';


-- ---------------------------------------------------------------------
-- 3) Permissions
-- ---------------------------------------------------------------------

revoke all on function public.enval_retention_cleanup(boolean, timestamptz, uuid, integer) from public;
revoke all on function public.enval_retention_cleanup(boolean, timestamptz, uuid, integer) from anon;
revoke all on function public.enval_retention_cleanup(boolean, timestamptz, uuid, integer) from authenticated;
grant execute on function public.enval_retention_cleanup(boolean, timestamptz, uuid, integer) to service_role;
-- ENVAL retention cleanup apply after storage cleanup
-- Date: 2026-05-11
--
-- Contract:
-- - Storage cleanup happens through Supabase Storage API, not SQL.
-- - This helper applies runtime DB cleanup after exact deletable storage paths are confirmed.
-- - public.dossier_exports remains immutable final audit truth.

create or replace function public.enval_retention_cleanup_apply_after_storage(
  p_target_dossier_id uuid,
  p_now timestamptz default now(),
  p_confirmed_deleted_storage_paths jsonb default '[]'::jsonb
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

  select *
    into r
  from public.enval_retention_cleanup(false, p_now, p_target_dossier_id, 1)
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

comment on function public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb)
is 'Applies runtime DB cleanup after storage cleanup has been explicitly confirmed. Used by retention storage cleanup tooling.';

revoke all on function public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb) from public;
revoke all on function public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb) from anon;
revoke all on function public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb) from authenticated;
grant execute on function public.enval_retention_cleanup_apply_after_storage(uuid, timestamptz, jsonb) to service_role;

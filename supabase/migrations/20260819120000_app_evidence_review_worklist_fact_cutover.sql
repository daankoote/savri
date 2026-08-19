begin;

-- REVIEW17 replaces legacy evidence-version decision authority for the internal
-- worklist with the current fact manifest and its exact immutable review round.
-- The v1 RPC and all legacy decision rows remain intact as historical truth.

create function public.app_evidence_review_worklist_source_read_v2(
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_auth jsonb;
  v_candidate record;
  v_case record;
  v_probe_case_id uuid;
  v_saw_case_scope boolean := false;
  v_authorized_case_ids uuid[] := array[]::uuid[];
  v_manifest jsonb;
  v_round public.app_evidence_review_rounds%rowtype;
  v_queue_state text;
  v_unresolved_fact_count integer;
  v_attention_reasons jsonb;
  v_latest_activity_at timestamptz;
  v_queue_rows jsonb := '[]'::jsonb;
begin
  if p_auth_user_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  for v_candidate in
    select distinct scope_event.case_id
    from public.app_workforce_identities identity_row
    join public.app_workforce_scope_assignments scope_event
      on scope_event.workforce_identity_id = identity_row.id
    where identity_row.auth_user_id = p_auth_user_id
      and scope_event.capability_code = 'evidence.review.view'
      and scope_event.location_id is null
    order by scope_event.case_id
  loop
    v_saw_case_scope := true;
    v_auth := public.app_workforce_authorize_v1(
      p_auth_user_id,
      'evidence.review.view',
      v_candidate.case_id,
      null,
      v_now
    );
    if v_auth->>'ok' = 'true' then
      v_authorized_case_ids := pg_catalog.array_append(
        v_authorized_case_ids,
        v_candidate.case_id
      );
    elsif v_auth->>'code' <> 'case_scope_denied' then
      return v_auth;
    end if;
  end loop;

  if not v_saw_case_scope then
    select case_row.id into v_probe_case_id
    from public.app_cases case_row
    order by case_row.id
    limit 1;
    v_probe_case_id := coalesce(
      v_probe_case_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    );
    v_auth := public.app_workforce_authorize_v1(
      p_auth_user_id,
      'evidence.review.view',
      v_probe_case_id,
      null,
      v_now
    );
    if v_auth->>'ok' = 'true' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 500, 'code', 'authorization_changed'
      );
    end if;
    if v_auth->>'code' <> 'case_scope_denied' then return v_auth; end if;
  end if;

  for v_case in
    select
      case_row.id,
      case_row.case_reference,
      lifecycle.lifecycle_state,
      lifecycle.event_at as lifecycle_event_at
    from public.app_cases case_row
    join lateral (
      select lifecycle_event.lifecycle_state, lifecycle_event.event_at
      from public.app_case_lifecycle_events lifecycle_event
      where lifecycle_event.case_id = case_row.id
        and lifecycle_event.event_at <= v_now
      order by lifecycle_event.event_at desc, lifecycle_event.id desc
      limit 1
    ) lifecycle on lifecycle.lifecycle_state = 'submitted_for_review'
    where case_row.id = any(v_authorized_case_ids)
    order by case_row.case_reference, case_row.id
  loop
    v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
    v_round := null;

    select pg_catalog.greatest(
      v_case.lifecycle_event_at,
      max(evidence_version.created_at)
    ) into v_latest_activity_at
    from public.app_evidence_files evidence_file
    join public.app_evidence_versions evidence_version
      on evidence_version.evidence_file_id = evidence_file.id
    where evidence_file.case_id = v_case.id;

    if v_manifest->>'ok' <> 'true'
       or v_manifest->>'manifest_version' <> 'fact-review-manifest-v1'
       or not pg_catalog.jsonb_typeof(v_manifest->'subjects') = 'array'
       or pg_catalog.jsonb_array_length(v_manifest->'subjects') < 1 then
      v_queue_state := 'REVIEW_MODEL_UNAVAILABLE';
      v_unresolved_fact_count := 0;
      v_attention_reasons := pg_catalog.jsonb_build_array(
        'REVIEW_MODEL_UNAVAILABLE'
      );
    else
      v_unresolved_fact_count := pg_catalog.jsonb_array_length(
        v_manifest->'subjects'
      );
      select round_row.* into v_round
      from public.app_evidence_review_rounds round_row
      where round_row.case_id = v_case.id
        and round_row.manifest_version = v_manifest->>'manifest_version'
        and round_row.manifest_hash = v_manifest->>'manifest_hash';

      if not found then
        v_queue_state := 'ACTIVE_REVIEW';
        v_attention_reasons := pg_catalog.jsonb_build_array(
          'FACT_REVIEW_REQUIRED'
        );
      elsif v_round.outcome = 'CORRECTIONS_REQUIRED' then
        v_queue_state := 'WAITING_CUSTOMER';
        v_unresolved_fact_count := 0;
        v_attention_reasons := '[]'::jsonb;
        v_latest_activity_at := pg_catalog.greatest(
          v_latest_activity_at, v_round.finalized_at
        );
      elsif v_round.outcome = 'ALL_FACTS_ACCEPTED' then
        v_queue_state := 'REVIEW_COMPLETE';
        v_unresolved_fact_count := 0;
        v_attention_reasons := '[]'::jsonb;
        v_latest_activity_at := pg_catalog.greatest(
          v_latest_activity_at, v_round.finalized_at
        );
      else
        v_queue_state := 'REVIEW_MODEL_UNAVAILABLE';
        v_unresolved_fact_count := 0;
        v_attention_reasons := pg_catalog.jsonb_build_array(
          'REVIEW_MODEL_UNAVAILABLE'
        );
      end if;
    end if;

    v_queue_rows := v_queue_rows || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'case_ref', v_case.case_reference,
        'lifecycle_state', v_case.lifecycle_state,
        'queue_state', v_queue_state,
        'unresolved_fact_count', v_unresolved_fact_count,
        'review_attention_reasons', v_attention_reasons,
        'latest_review_activity_at', pg_catalog.to_char(
          v_latest_activity_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 200,
    'code', 'ok',
    'queue_rows', v_queue_rows
  );
end;
$$;

revoke all on function public.app_evidence_review_worklist_source_read_v2(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.app_evidence_review_worklist_source_read_v2(uuid)
  to service_role;

comment on function public.app_evidence_review_worklist_source_read_v2(uuid) is
  'Service-role-only fact-manifest worklist read. It authorizes evidence.review.view per exact active case scope, derives ACTIVE_REVIEW, WAITING_CUSTOMER, REVIEW_COMPLETE or explicit REVIEW_MODEL_UNAVAILABLE from the current fact manifest and its exact immutable round, and writes no state.';

commit;

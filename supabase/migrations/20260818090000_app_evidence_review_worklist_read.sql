begin;

-- REVIEW04 adds one private, read-only source boundary for the derived evidence
-- review worklist. Exact case authority remains with the existing central
-- workforce evaluator; this function creates no task, assignment or audit row.

create function public.app_evidence_review_worklist_source_read_v1(
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
  v_probe_case_id uuid;
  v_saw_case_scope boolean := false;
  v_authorized_case_ids uuid[] := array[]::uuid[];
  v_source_rows jsonb;
begin
  if p_auth_user_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  -- Scope rows only enumerate possible case candidates. Every candidate is
  -- independently authorized by the central evaluator below.
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

  -- The case-scoped evaluator also establishes verified Auth, active workforce,
  -- policy seniority and capability. A principal with no scope is valid but has
  -- an empty worklist; all earlier evaluator failures remain denials.
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

  with latest_lifecycle as (
    select distinct on (lifecycle.case_id)
      lifecycle.case_id,
      lifecycle.lifecycle_state
    from public.app_case_lifecycle_events lifecycle
    where lifecycle.event_at <= v_now
    order by
      lifecycle.case_id,
      lifecycle.event_at desc,
      lifecycle.id desc
  ),
  latest_evidence_version as (
    select distinct on (evidence_file.id)
      evidence_file.id as evidence_file_id,
      evidence_file.case_id,
      evidence_version.id as evidence_version_id,
      evidence_version.version_number,
      evidence_version.created_at as evidence_created_at
    from public.app_evidence_files evidence_file
    join public.app_evidence_versions evidence_version
      on evidence_version.evidence_file_id = evidence_file.id
    where evidence_file.case_id = any(v_authorized_case_ids)
    order by
      evidence_file.id,
      evidence_version.version_number desc,
      evidence_version.created_at desc,
      evidence_version.id desc
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'case_ref', case_row.case_reference,
        'lifecycle_state', latest_lifecycle.lifecycle_state,
        'evidence_version_ref', latest_version.evidence_version_id,
        'version_number', latest_version.version_number,
        'evidence_created_at', pg_catalog.to_char(
          latest_version.evidence_created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'current_decision', current_decision.decision,
        'current_decided_at', case
          when current_decision.decided_at is null then null
          else pg_catalog.to_char(
            current_decision.decided_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        end,
        'has_earlier_decision', exists (
          select 1
          from public.app_evidence_versions earlier_version
          join public.app_evidence_review_decisions earlier_decision
            on earlier_decision.evidence_version_id = earlier_version.id
          where earlier_version.evidence_file_id =
                latest_version.evidence_file_id
            and earlier_version.version_number < latest_version.version_number
        )
      ) order by
        latest_version.evidence_created_at desc,
        case_row.case_reference,
        latest_version.evidence_version_id
    ),
    '[]'::jsonb
  ) into v_source_rows
  from latest_evidence_version latest_version
  join latest_lifecycle
    on latest_lifecycle.case_id = latest_version.case_id
   and latest_lifecycle.lifecycle_state = 'submitted_for_review'
  join public.app_cases case_row
    on case_row.id = latest_version.case_id
  left join public.app_evidence_review_decisions current_decision
    on current_decision.evidence_version_id = latest_version.evidence_version_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 200,
    'code', 'ok',
    'source_rows', v_source_rows
  );
end;
$$;

revoke all on function public.app_evidence_review_worklist_source_read_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.app_evidence_review_worklist_source_read_v1(uuid)
  to service_role;

comment on function public.app_evidence_review_worklist_source_read_v1(uuid) is
  'Service-role-only read boundary for current submitted-for-review evidence. It hard-binds evidence.review.view and exact active case scope through the central evaluator, returns no storage/customer/credential data, and writes no audit, idempotency, task, assignment or review state.';

commit;

begin;

-- REG03I is a private read boundary only. It delegates all workforce policy,
-- seniority, state, capability and TENANT_WIDE decisions to the existing
-- central evaluator and returns immutable REG03G facts for one delivery year.

create function public.app_compliance_worklist_source_events_read_v1(
  p_auth_user_id uuid,
  p_delivery_year integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth jsonb;
  v_source_events jsonb;
begin
  if p_auth_user_id is null or p_delivery_year is null
     or p_delivery_year < 2000 or p_delivery_year > 9999 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id,
    'compliance.delivery_year.view',
    'CURRENT_TENANT_DATA_PLANE',
    null,
    null,
    pg_catalog.clock_timestamp()
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'source_contract_version', source_event.source_contract_version,
        'event_schema_version', source_event.event_schema_version,
        'event_id', source_event.event_id,
        'delivery_year', source_event.delivery_year,
        'event_kind', source_event.event_kind,
        'occurred_at', pg_catalog.to_char(
          source_event.occurred_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'regulated_actor_kind', source_event.regulated_actor_kind,
        'recorded_at', pg_catalog.to_char(
          source_event.recorded_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'recorder_kind', source_event.recorder_kind,
        'recorder_reference', source_event.recorder_reference,
        'provenance_kind', source_event.provenance_kind,
        'evidence_reference', source_event.evidence_reference,
        'evidence_sha256', source_event.evidence_sha256,
        'evidence_version_id', source_event.evidence_version_id,
        'verification_result_reference',
          source_event.verification_result_reference,
        'statement_reference', source_event.statement_reference,
        'findings_report_reference', source_event.findings_report_reference
      ) order by source_event.occurred_at, source_event.event_id
    ),
    '[]'::jsonb
  ) into v_source_events
  from public.app_delivery_year_compliance_source_events source_event
  where source_event.delivery_year = p_delivery_year;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 200,
    'code', 'ok',
    'delivery_year', p_delivery_year,
    'source_events', v_source_events
  );
end;
$$;

revoke all on function public.app_compliance_worklist_source_events_read_v1(
  uuid, integer
) from public, anon, authenticated, service_role;
grant execute on function public.app_compliance_worklist_source_events_read_v1(
  uuid, integer
) to service_role;

comment on function public.app_compliance_worklist_source_events_read_v1(
  uuid, integer
) is
  'Service-role-only read boundary for one verified Auth principal and delivery year. It hard-binds compliance.delivery_year.view plus CURRENT_TENANT_DATA_PLANE through the central evaluator and writes no audit, idempotency, workforce, policy, compliance or customer state.';

commit;

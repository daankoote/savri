begin;

-- CUSTOMER04C3C9E follow-up: parenthesize jsonb scalar extraction before text
-- concatenation in the authenticated withdrawal idempotency scope.

create or replace function public.app_customer_correction_replacement_withdraw_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_replacement_target_ref text,
  p_candidate_ref text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_authority jsonb;
  v_resolution jsonb;
  v_target jsonb;
  v_candidate public.app_customer_correction_replacement_candidates%rowtype;
  v_scope text;
  v_begin jsonb;
  v_response jsonb;
begin
  if p_candidate_ref !~ '^CRC-[A-F0-9]{32}$'
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_environment not in ('local', 'test', 'staging', 'production') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_authority := public.app_customer_correction_replacement_authority_v1(
    p_auth_user_id, p_case_ref, p_replacement_target_ref
  );
  if v_authority->>'ok' <> 'true' then return v_authority; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (v_authority->>'handoff_id') || '|' || p_replacement_target_ref,
    0
  ));
  v_scope := 'customer_correction_replacement_withdraw:v1:handoff:' ||
    (v_authority->>'handoff_id') || ':target:' || p_replacement_target_ref;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'customer', (v_authority->>'actor_ref'),
    p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  v_resolution := public.app_customer_correction_replacement_resolution_v2(
    p_auth_user_id, p_case_ref
  );
  if v_resolution->>'ok' <> 'true' then return v_resolution; end if;
  select target.value into v_target
  from pg_catalog.jsonb_array_elements(v_resolution->'targets') target(value)
  where target.value->>'replacement_target_ref' =
    p_replacement_target_ref;
  if not found then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'replacement_target_not_available'
    );
  elsif v_target->>'candidate_ref' is null then
    v_response := pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'already_withdrawn',
      'replacement_target_ref', p_replacement_target_ref,
      'candidate_ref', p_candidate_ref
    );
  elsif v_target->>'candidate_ref' <> p_candidate_ref then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'replacement_candidate_not_current'
    );
  else
    select candidate.* into strict v_candidate
    from public.app_customer_correction_replacement_candidates candidate
    where candidate.handoff_id = (v_authority->>'handoff_id')::uuid
      and candidate.replacement_target_ref = p_replacement_target_ref
      and candidate.candidate_reference = p_candidate_ref;
    insert into public.app_customer_correction_replacement_candidate_events (
      id, handoff_id, replacement_target_ref, candidate_id, event_type,
      case_id, customer_id, acted_by_auth_user_id,
      acted_by_customer_identity_id, actor_ref, request_id, idempotency_key,
      payload_sha256, environment, occurred_at, recorded_at
    ) values (
      gen_random_uuid(), v_candidate.handoff_id,
      v_candidate.replacement_target_ref, v_candidate.id, 'WITHDRAWN',
      v_candidate.case_id, v_candidate.customer_id, p_auth_user_id,
      (v_authority->>'customer_identity_id')::uuid,
      (v_authority->>'actor_ref'), p_request_id, p_idempotency_key,
      p_payload_sha256, p_environment, v_now, v_now
    );
    insert into public.app_audit_events (
      event_type, scope_type, scope_id, customer_id, request_id,
      idempotency_key, actor_type, actor_ref, event_data, created_at
    ) values (
      'customer_correction_replacement_candidate_withdrawn',
      'case', v_candidate.case_id, v_candidate.customer_id, p_request_id,
      p_idempotency_key, 'customer', (v_authority->>'actor_ref'),
      pg_catalog.jsonb_build_object(
        'handoff_id', v_candidate.handoff_id,
        'replacement_target_ref', v_candidate.replacement_target_ref,
        'candidate_ref', v_candidate.candidate_reference
      ), v_now
    );
    v_response := pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'withdrawn',
      'replacement_target_ref', p_replacement_target_ref,
      'candidate_ref', p_candidate_ref
    );
  end if;
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
  );
end;
$$;

revoke all on function
  public.app_customer_correction_replacement_withdraw_v1(
    uuid, text, text, text, text, text, text, timestamptz, text
  ) from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_replacement_withdraw_v1(
    uuid, text, text, text, text, text, text, timestamptz, text
  ) to service_role;

commit;

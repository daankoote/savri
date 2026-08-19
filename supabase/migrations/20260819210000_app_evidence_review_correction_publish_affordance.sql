begin;

-- REVIEW20 exposes one server-derived exact-case publish affordance through
-- the existing workforce detail read. The REVIEW19 publish RPC remains the
-- authoritative write-time authorization and eligibility boundary.

create function public.app_evidence_review_case_detail_read_v7(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_response jsonb;
  v_case_id uuid;
  v_publish_authorization jsonb;
  v_can_publish_correction boolean := false;
begin
  v_response := public.app_evidence_review_case_detail_read_v6(
    p_auth_user_id, p_case_ref
  );
  if v_response->>'ok' <> 'true' then return v_response; end if;

  select case_row.id into v_case_id
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if v_case_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'internal_error'
    );
  end if;

  v_publish_authorization := public.app_workforce_authorize_v1(
    p_auth_user_id,
    'evidence.review.correction.publish',
    v_case_id,
    null,
    v_now
  );
  v_can_publish_correction := v_publish_authorization->>'ok' = 'true';

  return pg_catalog.jsonb_set(
    v_response,
    '{case_context,can_publish_correction}',
    pg_catalog.to_jsonb(v_can_publish_correction),
    true
  );
end;
$$;

revoke all on function public.app_evidence_review_case_detail_read_v6(uuid, text)
  from service_role;
revoke all on function public.app_evidence_review_case_detail_read_v7(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.app_evidence_review_case_detail_read_v7(uuid, text)
  to service_role;

comment on function public.app_evidence_review_case_detail_read_v7(uuid, text) is
  'Service-role-only REVIEW20 exact-case detail projection. It preserves REVIEW18B view and status authority and adds only can_publish_correction, derived by the central evaluator for the fixed evidence.review.correction.publish capability and exact case. REVIEW19 reauthorizes publication.';

commit;

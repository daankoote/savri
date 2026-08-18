begin;

-- REVIEW13 projects one fixed, database-authoritative mutation affordance into
-- the existing exact-case detail response. The generic evaluator remains
-- private and the REVIEW11/12 write path re-authorizes every mutation.

create function public.app_evidence_review_case_detail_read_v3(
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
  v_decide_authorization jsonb;
  v_can_decide boolean := false;
begin
  v_response := public.app_evidence_review_case_detail_read_v2(
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

  v_decide_authorization := public.app_workforce_authorize_v1(
    p_auth_user_id,
    'evidence.review.decide',
    v_case_id,
    null,
    v_now
  );
  v_can_decide := v_decide_authorization->>'ok' = 'true';

  return pg_catalog.jsonb_set(
    v_response,
    '{case_context,can_decide}',
    pg_catalog.to_jsonb(v_can_decide),
    true
  );
end;
$$;

revoke all on function public.app_evidence_review_case_detail_read_v2(uuid, text)
  from service_role;
revoke all on function public.app_evidence_review_case_detail_read_v3(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.app_evidence_review_case_detail_read_v3(uuid, text)
  to service_role;

comment on function public.app_evidence_review_case_detail_read_v3(uuid, text) is
  'Service-role-only REVIEW13 exact-case detail projection. It preserves REVIEW07 view authorization and adds only a boolean affordance derived by the central evaluator for the server-fixed evidence.review.decide capability and exact case. REVIEW11/12 remains mutation authority.';

commit;

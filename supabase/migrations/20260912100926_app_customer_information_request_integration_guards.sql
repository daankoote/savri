create or replace function public.app_customer_information_request_correction_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer_case_action:v1:' || new.case_id::text, 0
  ));
  if exists (
    select 1
    from public.app_customer_information_requests information_request
    where information_request.case_id = new.case_id
      and information_request.terminal_action is null
  ) then
    raise exception 'customer_information_request_active'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

alter table public.app_evidence_review_round_subject_decisions
  add constraint app_evidence_review_subject_required_missing_disposition_chk
  check (
    not (required and value_status = 'REQUIRED_MISSING')
    or disposition = 'CORRECTION_REQUIRED'
  ) not valid;

comment on constraint app_evidence_review_subject_required_missing_disposition_chk
  on public.app_evidence_review_round_subject_decisions is
  'Authoritative required missing facts cannot be accepted by a workforce review.';

alter function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) rename to app_evidence_review_correction_publish_guarded_inner_v1;

revoke all on function public.app_evidence_review_correction_publish_guarded_inner_v1(
  uuid, text, uuid, text, text, text, timestamptz
) from public, anon, authenticated, service_role;

create function public.app_evidence_review_correction_publish_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_round_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_case_id uuid;
  v_auth jsonb;
begin
  select case_row.id into v_case_id
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;

  if v_case_id is not null then
    v_auth := public.app_workforce_authorize_v1(
      p_auth_user_id, 'evidence.review.correction.publish',
      v_case_id, null, v_now
    );
    if v_auth->>'ok' <> 'true' then return v_auth; end if;

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'customer_case_action:v1:' || v_case_id::text, 0
    ));
    if exists (
      select 1
      from public.app_customer_information_requests information_request
      where information_request.case_id = v_case_id
        and information_request.terminal_action is null
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'information_request_active'
      );
    end if;
  end if;

  return public.app_evidence_review_correction_publish_guarded_inner_v1(
    p_auth_user_id, p_case_ref, p_round_id, p_request_id,
    p_idempotency_key, p_payload_sha256, p_idempotency_expires_at
  );
end;
$$;

revoke all on function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) to service_role;

comment on function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) is
  'Service-only correction publication wrapper. Existing publication authority remains controlling; the shared case lock returns a stable conflict while a customer information request is active.';

begin;

create function public.app_customer_information_request_history_projection_v1(
  p_case_id uuid,
  p_customer_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'request_ref', history.request_reference,
        'outcome', history.terminal_action,
        'question', history.question_text,
        'answer', history.response_text,
        'asked_at', history.created_at,
        'answered_at', history.responded_at
      )
      order by history.created_at desc, history.request_reference desc
    ),
    '[]'::jsonb
  )
  from (
    select
      information_request.request_reference,
      information_request.terminal_action,
      information_request.question_text,
      information_request.created_at,
      response.response_text,
      response.responded_at
    from public.app_customer_information_requests information_request
    left join public.app_customer_information_responses response
      on response.information_request_id = information_request.id
    where p_case_id is not null
      and p_customer_id is not null
      and information_request.case_id = p_case_id
      and information_request.target_customer_id = p_customer_id
      and (
        (
          information_request.terminal_action = 'RESOLVED'
          and response.id is not null
          and information_request.terminal_at >= response.responded_at
        )
        or (
          information_request.terminal_action = 'WITHDRAWN'
          and response.id is null
        )
      )
    order by information_request.created_at desc,
      information_request.request_reference desc
    limit 50
  ) history;
$$;

create or replace function public.app_customer_information_request_customer_read_v1(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_case public.app_cases%rowtype;
  v_identity_id uuid;
  v_request_id uuid;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  if not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_auth_user_id
      and auth_user.deleted_at is null
      and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at)
        is not null
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 401, 'code', 'authentication_required'
    );
  end if;
  select case_row.* into v_case
  from public.app_cases case_row
  join public.app_customers customer_row
    on customer_row.id = case_row.customer_id
   and customer_row.status = 'active'
  where case_row.case_reference = p_case_ref;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404,
      'code', 'customer_case_access_denied'
    );
  end if;
  v_identity_id := public.app_customer_information_request_customer_authorize_v1(
    p_auth_user_id, v_case.id
  );
  if v_identity_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404,
      'code', 'customer_case_access_denied'
    );
  end if;

  select information_request.id into v_request_id
  from public.app_customer_information_requests information_request
  where information_request.case_id = v_case.id
    and information_request.target_customer_id = v_case.customer_id
    and information_request.terminal_action is null;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'request', case when v_request_id is null then null
      else public.app_customer_information_request_projection_v1(v_request_id)
    end,
    'history', public.app_customer_information_request_history_projection_v1(
      v_case.id, v_case.customer_id
    )
  );
end;
$$;

create or replace function public.app_customer_information_request_workforce_read_v1(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_case public.app_cases%rowtype;
  v_view jsonb;
  v_manage jsonb;
  v_request_id uuid;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  select case_row.* into v_case
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if not found or not public.app_customer_information_request_case_supported_v1(
    v_case.id
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'case_missing'
    );
  end if;
  v_view := public.app_workforce_authorize_v1(
    p_auth_user_id, 'evidence.review.view', v_case.id, null,
    pg_catalog.clock_timestamp()
  );
  if v_view->>'ok' <> 'true' then return v_view; end if;
  v_manage := public.app_customer_information_request_authorize_v1(
    p_auth_user_id, v_case.id, pg_catalog.clock_timestamp()
  );

  select information_request.id into v_request_id
  from public.app_customer_information_requests information_request
  where information_request.case_id = v_case.id
    and information_request.target_customer_id = v_case.customer_id
    and information_request.terminal_action is null;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'can_manage', v_manage->>'ok' = 'true',
    'request', case when v_request_id is null then null
      else public.app_customer_information_request_projection_v1(v_request_id)
    end,
    'history', public.app_customer_information_request_history_projection_v1(
      v_case.id, v_case.customer_id
    )
  );
end;
$$;

revoke execute on function
  public.app_customer_information_request_history_projection_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function
  public.app_customer_information_request_customer_read_v1(uuid, text)
  from public, anon, authenticated;
revoke execute on function
  public.app_customer_information_request_workforce_read_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.app_customer_information_request_customer_read_v1(uuid, text)
  to service_role;
grant execute on function
  public.app_customer_information_request_workforce_read_v1(uuid, text)
  to service_role;

comment on function
  public.app_customer_information_request_history_projection_v1(uuid, uuid)
is
  'Internal customer-safe closed information-request history projection, deterministically limited to 50 entries.';
comment on function
  public.app_customer_information_request_customer_read_v1(uuid, text)
is
  'Service-role-only customer read for the active request and closed customer-safe history after exact R7 case authorization.';
comment on function
  public.app_customer_information_request_workforce_read_v1(uuid, text)
is
  'Service-role-only workforce read for the active request and closed customer-safe history after exact case-view authorization.';

commit;

begin;

create or replace function public.app_customer_information_request_projection_v1(
  p_information_request_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'request_ref', information_request.request_reference,
    'state', case when response.id is null then 'OPEN' else 'ANSWERED' end,
    'question', information_request.question_text,
    'answer', response.response_text,
    'asked_at', information_request.created_at,
    'answered_at', response.responded_at,
    'terminal_at', information_request.terminal_at
  )
  from public.app_customer_information_requests information_request
  left join public.app_customer_information_responses response
    on response.information_request_id = information_request.id
  where information_request.id = p_information_request_id;
$$;

create or replace function public.app_customer_information_request_history_projection_v1(
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
        'answered_at', history.responded_at,
        'terminal_at', history.terminal_at
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
      information_request.terminal_at,
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

revoke execute on function
  public.app_customer_information_request_projection_v1(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function
  public.app_customer_information_request_history_projection_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function
  public.app_customer_information_request_projection_v1(uuid)
is
  'Internal customer-safe active information-request projection with null terminal time.';
comment on function
  public.app_customer_information_request_history_projection_v1(uuid, uuid)
is
  'Internal customer-safe closed information-request history with authoritative terminal time, deterministically limited to 50 entries.';

commit;

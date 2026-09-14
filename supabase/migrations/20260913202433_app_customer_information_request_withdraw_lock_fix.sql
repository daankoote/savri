-- Lock original deliveries before deciding cancel versus withdrawal notice.
create or replace function public.app_customer_information_request_email_notify_v1(
  p_action text,
  p_auth_user_id uuid,
  p_case_ref text,
  p_request_ref text,
  p_email_context jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_template_key text;
  v_recipient_kind text;
  v_case public.app_cases%rowtype;
  v_request public.app_customer_information_requests%rowtype;
  v_context_valid boolean := false;
  v_organization_name text;
  v_portal_origin text;
  v_application_label text;
  v_application_index jsonb;
  v_candidate_count integer := 0;
  v_enqueued_count integer := 0;
  v_cancelled_count integer := 0;
  v_outcome text;
  v_reason_code text;
  v_existing public.app_workflow_email_dispatches%rowtype;
  v_recipient record;
begin
  if p_action not in ('CREATE', 'ANSWER', 'WITHDRAW')
    or p_auth_user_id is null
    or p_case_ref is null
    or p_case_ref !~ '^CASE-([0-9A-Fa-f]{12}|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$'
    or p_request_ref is null
    or p_request_ref !~ '^IRQ-[0-9A-F]{16}$'
  then
    raise exception 'information_request_email_contract_invalid';
  end if;

  v_event_type := case p_action
    when 'CREATE' then 'information_request_created_customer'
    when 'ANSWER' then 'information_request_answered_workforce'
    else 'information_request_withdrawn_customer'
  end;
  v_template_key := case p_action
    when 'CREATE' then 'information-request-created-customer-nl-v2'
    when 'ANSWER' then 'information-request-answered-workforce-nl-v1'
    else 'information-request-withdrawn-customer-nl-v1'
  end;
  v_recipient_kind := case p_action
    when 'ANSWER' then 'workforce' else 'customer' end;

  select * into v_existing
  from public.app_workflow_email_dispatches
  where event_type = v_event_type
    and business_event_ref = p_request_ref;
  if found then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'dispatch_id', v_existing.id,
      'outcome', v_existing.outcome
    );
  end if;

  select case_row.* into strict v_case
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  select information_request.* into strict v_request
  from public.app_customer_information_requests information_request
  where information_request.request_reference = p_request_ref
    and information_request.case_id = v_case.id
    and information_request.target_customer_id = v_case.customer_id;

  if p_email_context is not null
    and pg_catalog.jsonb_typeof(p_email_context) = 'object'
    and (select pg_catalog.array_agg(key order by key)
         from pg_catalog.jsonb_object_keys(p_email_context) key)
      is not distinct from array['organization_name','portal_origin']::text[]
    and pg_catalog.jsonb_typeof(
      p_email_context->'organization_name'
    ) = 'string'
    and pg_catalog.jsonb_typeof(p_email_context->'portal_origin') = 'string'
  then
    v_organization_name := pg_catalog.btrim(
      p_email_context->>'organization_name'
    );
    v_portal_origin := pg_catalog.btrim(p_email_context->>'portal_origin');
    v_context_valid := length(v_organization_name) between 1 and 120
      and v_organization_name !~ '[[:cntrl:]]'
      and v_portal_origin ~ '^(https://[A-Za-z0-9.-]+(:[0-9]{1,5})?|http://(127\.0\.0\.1|localhost):(5174|5175))$';
  end if;

  if p_action = 'CREATE' then
    for v_recipient in
      select distinct
        access_grant.auth_user_id,
        pg_catalog.lower(pg_catalog.btrim(auth_user.email)) as email
      from public.app_customer_access_grants access_grant
      join auth.users auth_user on auth_user.id = access_grant.auth_user_id
      where access_grant.customer_id = v_case.customer_id
        and (
          access_grant.granted_case_id is null
          or access_grant.granted_case_id = v_case.id
        )
        and public.app_customer_information_request_customer_authorize_v1(
          access_grant.auth_user_id, v_case.id
        ) is not null
      order by access_grant.auth_user_id
    loop
      v_candidate_count := v_candidate_count + 1;
      if v_context_valid
        and v_recipient.email is not null
        and length(v_recipient.email) between 3 and 320
        and v_recipient.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      then
        v_application_index := public.app_customer_application_index_read_v1(
          v_recipient.auth_user_id
        );
        select application->>'application_label'
        into v_application_label
        from pg_catalog.jsonb_array_elements(
          coalesce(v_application_index->'applications', '[]'::jsonb)
        ) application
        where application->>'case_reference' = p_case_ref;
        if v_application_label is not null then
          perform public.app_workflow_email_enqueue_v1(
            v_event_type,
            v_template_key,
            p_request_ref,
            v_recipient_kind,
            v_recipient.auth_user_id,
            v_recipient.email,
            pg_catalog.jsonb_build_object(
              'organization_name', v_organization_name,
              'application_label', v_application_label,
              'case_reference', v_case.case_reference,
              'action_url', v_portal_origin ||
                '/dashboard/aanvragen/' || v_case.case_reference
            ),
            'information-request:' || pg_catalog.lower(p_request_ref) ||
              ':created:customer:' || v_recipient.auth_user_id::text
          );
          v_enqueued_count := v_enqueued_count + 1;
        end if;
      end if;
    end loop;
  elsif p_action = 'ANSWER' then
    select
      workforce_identity.auth_user_id,
      pg_catalog.lower(pg_catalog.btrim(auth_user.email)) as email
    into v_recipient
    from public.app_workforce_identities workforce_identity
    join auth.users auth_user
      on auth_user.id = workforce_identity.auth_user_id
     and auth_user.deleted_at is null
     and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at)
       is not null
    where workforce_identity.id = v_request.created_by_workforce_identity_id
      and (
        public.app_customer_information_request_authorize_v1(
          workforce_identity.auth_user_id,
          v_case.id,
          pg_catalog.clock_timestamp()
        )->>'ok'
      ) = 'true';
    if found then
      v_candidate_count := 1;
      if v_context_valid
        and v_recipient.email is not null
        and length(v_recipient.email) between 3 and 320
        and v_recipient.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      then
        v_application_index := public.app_customer_application_index_read_v1(
          p_auth_user_id
        );
        select application->>'application_label'
        into v_application_label
        from pg_catalog.jsonb_array_elements(
          coalesce(v_application_index->'applications', '[]'::jsonb)
        ) application
        where application->>'case_reference' = p_case_ref;
        if v_application_label is not null then
          perform public.app_workflow_email_enqueue_v1(
            v_event_type,
            v_template_key,
            p_request_ref,
            v_recipient_kind,
            v_recipient.auth_user_id,
            v_recipient.email,
            pg_catalog.jsonb_build_object(
              'organization_name', v_organization_name,
              'application_label', v_application_label,
              'case_reference', v_case.case_reference,
              'action_url', v_portal_origin ||
                '/beheer/dossiers/' || v_case.case_reference
            ),
            'information-request:' || pg_catalog.lower(p_request_ref) ||
              ':answered:workforce:' || v_recipient.auth_user_id::text
          );
          v_enqueued_count := 1;
        end if;
      end if;
    end if;
  else
    for v_recipient in
      select
        intent.recipient_ref as auth_user_id,
        intent.dedupe_key,
        intent.template_variables->>'application_label' as application_label,
        delivery.status,
        delivery.safe_error_class,
        pg_catalog.lower(pg_catalog.btrim(auth_user.email)) as email,
        public.app_customer_information_request_customer_authorize_v1(
          intent.recipient_ref, v_case.id
        ) as current_customer_identity_id
      from public.app_workflow_email_intents intent
      join public.app_workflow_email_deliveries delivery
        on delivery.intent_id = intent.id
      left join auth.users auth_user
        on auth_user.id = intent.recipient_ref
       and auth_user.deleted_at is null
       and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at)
         is not null
      where intent.event_type = 'information_request_created_customer'
        and intent.business_event_ref = p_request_ref
      order by intent.recipient_ref
      for update of delivery
    loop
      v_candidate_count := v_candidate_count + 1;
      if v_recipient.status in ('queued', 'retryable_failure')
        or (
          v_recipient.status = 'permanent_failure'
          and coalesce(v_recipient.safe_error_class, '') not in (
            'provider_ambiguous', 'lease_expired'
          )
        )
      then
        perform public.app_workflow_email_cancel_v1(v_recipient.dedupe_key);
        v_cancelled_count := v_cancelled_count + 1;
      elsif v_recipient.status in (
          'processing', 'provider_accepted', 'ambiguous_failure'
        )
        or (
          v_recipient.status = 'permanent_failure'
          and v_recipient.safe_error_class in (
            'provider_ambiguous', 'lease_expired'
          )
        )
      then
        if v_context_valid
          and v_recipient.current_customer_identity_id is not null
          and v_recipient.email is not null
          and length(v_recipient.email) between 3 and 320
          and v_recipient.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
          and v_recipient.application_label is not null
        then
          perform public.app_workflow_email_enqueue_v1(
            v_event_type,
            v_template_key,
            p_request_ref,
            v_recipient_kind,
            v_recipient.auth_user_id,
            v_recipient.email,
            pg_catalog.jsonb_build_object(
              'organization_name', v_organization_name,
              'application_label', v_recipient.application_label,
              'case_reference', v_case.case_reference,
              'action_url', v_portal_origin ||
                '/dashboard/aanvragen/' || v_case.case_reference
            ),
            'information-request:' || pg_catalog.lower(p_request_ref) ||
              ':withdrawn:customer:' || v_recipient.auth_user_id::text
          );
          v_enqueued_count := v_enqueued_count + 1;
        end if;
      end if;
    end loop;
  end if;

  if v_enqueued_count > 0 and v_cancelled_count > 0 then
    v_outcome := 'mixed';
  elsif v_enqueued_count > 0
    and v_enqueued_count = v_candidate_count then
    v_outcome := 'enqueued';
  elsif v_enqueued_count > 0 then
    v_outcome := 'partial';
  elsif v_cancelled_count > 0
    and v_cancelled_count = v_candidate_count then
    v_outcome := 'cancelled_before_delivery';
  elsif v_cancelled_count > 0 then
    v_outcome := 'partial';
  else
    v_outcome := 'no_delivery';
  end if;

  if not v_context_valid
    and v_enqueued_count = 0
    and v_cancelled_count < v_candidate_count then
    v_reason_code := 'notification_context_unavailable';
  elsif v_enqueued_count + v_cancelled_count < v_candidate_count
    or v_candidate_count = 0 then
    v_reason_code := 'recipient_unavailable';
  end if;

  return public.app_workflow_email_dispatch_record_v1(
    v_event_type,
    p_request_ref,
    v_outcome,
    v_candidate_count,
    v_enqueued_count,
    v_cancelled_count,
    v_reason_code
  );
end;
$$;

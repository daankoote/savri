begin;

create table public.app_workflow_email_dispatches (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  business_event_ref text not null,
  outcome text not null,
  candidate_count integer not null,
  enqueued_count integer not null,
  cancelled_count integer not null,
  reason_code text,
  created_at timestamptz not null default statement_timestamp(),
  constraint app_workflow_email_dispatches_event_chk check (
    event_type in (
      'information_request_created_customer',
      'information_request_answered_workforce',
      'information_request_withdrawn_customer'
    )
  ),
  constraint app_workflow_email_dispatches_business_ref_chk check (
    business_event_ref ~ '^IRQ-[0-9A-F]{16}$'
  ),
  constraint app_workflow_email_dispatches_outcome_chk check (
    outcome in (
      'enqueued',
      'partial',
      'cancelled_before_delivery',
      'mixed',
      'no_delivery'
    )
  ),
  constraint app_workflow_email_dispatches_count_chk check (
    candidate_count >= 0
    and enqueued_count >= 0
    and cancelled_count >= 0
    and enqueued_count <= candidate_count
    and cancelled_count <= candidate_count
    and enqueued_count + cancelled_count <= candidate_count
  ),
  constraint app_workflow_email_dispatches_reason_chk check (
    reason_code is null
    or reason_code in (
      'recipient_unavailable',
      'notification_context_unavailable'
    )
  ),
  constraint app_workflow_email_dispatches_event_uniq unique (
    event_type,
    business_event_ref
  )
);

create trigger app_workflow_email_dispatches_immutable
before update or delete on public.app_workflow_email_dispatches
for each row execute function public.app_workflow_email_block_mutation_v1();

alter table public.app_workflow_email_dispatches enable row level security;
alter table public.app_workflow_email_dispatches force row level security;
create policy deny_all on public.app_workflow_email_dispatches
  for all to anon, authenticated using (false) with check (false);
revoke all privileges on table public.app_workflow_email_dispatches
  from public, anon, authenticated, service_role;

alter table public.app_workflow_email_intents
  drop constraint app_workflow_email_intents_event_chk,
  drop constraint app_workflow_email_intents_template_chk,
  drop constraint app_workflow_email_intents_recipient_kind_chk,
  drop constraint app_workflow_email_intents_subject_chk;

alter table public.app_workflow_email_intents
  add constraint app_workflow_email_intents_event_chk check (
    event_type in (
      'information_request_created_customer',
      'information_request_answered_workforce',
      'information_request_withdrawn_customer'
    )
  ),
  add constraint app_workflow_email_intents_template_chk check (
    (event_type = 'information_request_created_customer'
      and template_key in (
        'information-request-created-customer-nl-v1',
        'information-request-created-customer-nl-v2'
      ))
    or
    (event_type = 'information_request_answered_workforce'
      and template_key = 'information-request-answered-workforce-nl-v1')
    or
    (event_type = 'information_request_withdrawn_customer'
      and template_key = 'information-request-withdrawn-customer-nl-v1')
  ),
  add constraint app_workflow_email_intents_recipient_kind_chk check (
    (event_type in (
      'information_request_created_customer',
      'information_request_withdrawn_customer'
    ) and recipient_kind = 'customer')
    or
    (event_type = 'information_request_answered_workforce'
      and recipient_kind = 'workforce')
  ),
  add constraint app_workflow_email_intents_subject_chk check (
    (event_type = 'information_request_created_customer'
      and template_key = 'information-request-created-customer-nl-v1'
      and frozen_subject = 'Er staat een vraag voor u klaar')
    or
    (event_type = 'information_request_created_customer'
      and template_key = 'information-request-created-customer-nl-v2'
      and frozen_subject = 'Er staat een vraag voor u klaar')
    or
    (event_type = 'information_request_answered_workforce'
      and frozen_subject = 'Uw vraag is beantwoord')
    or
    (event_type = 'information_request_withdrawn_customer'
      and frozen_subject = 'De vraag is ingetrokken')
  );

create or replace function public.app_workflow_email_enqueue_v1(
  p_event_type text,
  p_template_key text,
  p_business_event_ref text,
  p_recipient_kind text,
  p_recipient_ref uuid,
  p_recipient_email text,
  p_template_variables jsonb,
  p_dedupe_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_organization_name text;
  v_application_label text;
  v_case_reference text;
  v_action_url text;
  v_subject text;
  v_body text;
  v_payload_sha256 text;
  v_intent public.app_workflow_email_intents%rowtype;
begin
  if not (
      (p_event_type = 'information_request_created_customer'
        and p_template_key in (
          'information-request-created-customer-nl-v1',
          'information-request-created-customer-nl-v2'
        )
        and p_recipient_kind = 'customer')
      or
      (p_event_type = 'information_request_answered_workforce'
        and p_template_key = 'information-request-answered-workforce-nl-v1'
        and p_recipient_kind = 'workforce')
      or
      (p_event_type = 'information_request_withdrawn_customer'
        and p_template_key = 'information-request-withdrawn-customer-nl-v1'
        and p_recipient_kind = 'customer')
    )
    or p_recipient_ref is null
    or p_business_event_ref is null
    or p_business_event_ref !~ '^IRQ-[0-9A-F]{16}$'
    or p_dedupe_key is null
    or length(p_dedupe_key) not between 1 and 200
    or p_dedupe_key !~ '^[a-z0-9][a-z0-9:._/-]*$'
  then
    raise exception 'workflow_email_contract_invalid';
  end if;

  if p_template_variables is null
    or pg_catalog.jsonb_typeof(p_template_variables) <> 'object'
    or (
      p_template_key = 'information-request-created-customer-nl-v1'
      and (select pg_catalog.array_agg(key order by key)
           from pg_catalog.jsonb_object_keys(p_template_variables) key)
        is distinct from array[
          'action_url','application_label','organization_name'
        ]::text[]
    )
    or (
      p_template_key <> 'information-request-created-customer-nl-v1'
      and (select pg_catalog.array_agg(key order by key)
           from pg_catalog.jsonb_object_keys(p_template_variables) key)
        is distinct from array[
          'action_url','application_label','case_reference',
          'organization_name'
        ]::text[]
    )
    or pg_catalog.jsonb_typeof(
      p_template_variables->'organization_name'
    ) <> 'string'
    or pg_catalog.jsonb_typeof(
      p_template_variables->'application_label'
    ) <> 'string'
    or (
      p_template_key <> 'information-request-created-customer-nl-v1'
      and pg_catalog.jsonb_typeof(
        p_template_variables->'case_reference'
      ) <> 'string'
    )
    or pg_catalog.jsonb_typeof(p_template_variables->'action_url') <> 'string'
  then
    raise exception 'workflow_email_template_variables_invalid';
  end if;

  v_email := pg_catalog.lower(pg_catalog.btrim(p_recipient_email));
  v_organization_name := pg_catalog.btrim(
    p_template_variables->>'organization_name'
  );
  v_application_label := pg_catalog.btrim(
    p_template_variables->>'application_label'
  );
  v_case_reference := pg_catalog.btrim(
    p_template_variables->>'case_reference'
  );
  v_action_url := pg_catalog.btrim(p_template_variables->>'action_url');

  if v_email is null
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(v_email) not between 3 and 320
    or v_organization_name is null
    or length(v_organization_name) not between 1 and 120
    or v_organization_name ~ '[[:cntrl:]]'
    or v_application_label is null
    or length(v_application_label) not between 1 and 160
    or v_application_label ~ '[[:cntrl:]]'
    or (
      p_template_key <> 'information-request-created-customer-nl-v1'
      and (
        v_case_reference is null
        or v_case_reference !~ '^CASE-([0-9A-Fa-f]{12}|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$'
      )
    )
    or v_action_url is null
    or length(v_action_url) not between 1 and 500
    or (
      p_recipient_kind = 'customer'
      and v_action_url !~ '^(https://[A-Za-z0-9.-]+(:[0-9]{1,5})?|http://(127\.0\.0\.1|localhost):(5174|5175))/dashboard/aanvragen/CASE-([0-9A-Fa-f]{12}|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$'
    )
    or (
      p_recipient_kind = 'workforce'
      and v_action_url !~ '^(https://[A-Za-z0-9.-]+(:[0-9]{1,5})?|http://(127\.0\.0\.1|localhost):(5174|5175))/beheer/dossiers/CASE-([0-9A-Fa-f]{12}|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$'
    )
    or (
      p_template_key <> 'information-request-created-customer-nl-v1'
      and p_recipient_kind = 'customer'
      and pg_catalog.right(
        v_action_url,
        length('/dashboard/aanvragen/' || v_case_reference)
      ) <> '/dashboard/aanvragen/' || v_case_reference
    )
    or (
      p_template_key <> 'information-request-created-customer-nl-v1'
      and p_recipient_kind = 'workforce'
      and pg_catalog.right(
        v_action_url,
        length('/beheer/dossiers/' || v_case_reference)
      ) <> '/beheer/dossiers/' || v_case_reference
    )
  then
    raise exception 'workflow_email_template_variables_invalid';
  end if;

  if p_template_key = 'information-request-created-customer-nl-v1' then
    v_subject := 'Er staat een vraag voor u klaar';
    v_body := pg_catalog.format(
      E'Beste klant,\n\n%s heeft een vraag over %s.\n\nBekijk en beantwoord de vraag in uw klantportaal:\n%s\n\nMet vriendelijke groet,\n%s',
      v_organization_name,
      v_application_label,
      v_action_url,
      v_organization_name
    );
  elsif p_event_type = 'information_request_created_customer' then
    v_subject := 'Er staat een vraag voor u klaar';
    v_body := pg_catalog.format(
      E'Beste klant,\n\n%s heeft een vraag over uw aanvraag.\n\nAanvraag: %s\nDossiernummer: %s\n\nBekijk en beantwoord de vraag in uw klantportaal:\n%s\n\nMet vriendelijke groet,\n%s',
      v_organization_name,
      v_application_label,
      v_case_reference,
      v_action_url,
      v_organization_name
    );
  elsif p_event_type = 'information_request_answered_workforce' then
    v_subject := 'Uw vraag is beantwoord';
    v_body := pg_catalog.format(
      E'Beste medewerker,\n\nDe klant heeft uw vraag over deze aanvraag beantwoord.\n\nAanvraag: %s\nDossiernummer: %s\n\nBekijk het antwoord in Dossierbeheer:\n%s\n\nDit is een automatische melding van %s.',
      v_application_label,
      v_case_reference,
      v_action_url,
      v_organization_name
    );
  else
    v_subject := 'De vraag is ingetrokken';
    v_body := pg_catalog.format(
      E'Beste klant,\n\n%s heeft de vraag over uw aanvraag ingetrokken. U hoeft hierop niet meer te reageren.\n\nAanvraag: %s\nDossiernummer: %s\n\nBekijk de actuele status in uw klantportaal:\n%s\n\nMet vriendelijke groet,\n%s',
      v_organization_name,
      v_application_label,
      v_case_reference,
      v_action_url,
      v_organization_name
    );
  end if;

  v_payload_sha256 := pg_catalog.encode(extensions.digest(
    pg_catalog.concat_ws(E'\n',
      p_event_type,
      p_template_key,
      p_business_event_ref,
      p_recipient_kind,
      p_recipient_ref::text,
      v_email,
      p_template_variables::text,
      v_subject,
      v_body
    ),
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_dedupe_key, 0)
  );

  select * into v_intent
  from public.app_workflow_email_intents
  where dedupe_key = p_dedupe_key;

  if found then
    if v_intent.payload_sha256 <> v_payload_sha256 then
      raise exception 'workflow_email_dedupe_conflict';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'created', false,
      'intent_id', v_intent.id,
      'status', (
        select status from public.app_workflow_email_deliveries
        where intent_id = v_intent.id
      )
    );
  end if;

  insert into public.app_workflow_email_intents (
    event_type,
    template_key,
    business_event_ref,
    recipient_kind,
    recipient_ref,
    recipient_email,
    template_variables,
    frozen_subject,
    frozen_body,
    payload_sha256,
    provider_idempotency_key,
    dedupe_key
  ) values (
    p_event_type,
    p_template_key,
    p_business_event_ref,
    p_recipient_kind,
    p_recipient_ref,
    v_email,
    p_template_variables,
    v_subject,
    v_body,
    v_payload_sha256,
    'workflow-email-v1:' || pg_catalog.encode(
      extensions.digest(p_dedupe_key, 'sha256'), 'hex'
    ),
    p_dedupe_key
  ) returning * into v_intent;

  insert into public.app_workflow_email_deliveries (intent_id)
  values (v_intent.id);

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'created', true,
    'intent_id', v_intent.id,
    'status', 'queued'
  );
end;
$$;

create function public.app_workflow_email_dispatch_record_v1(
  p_event_type text,
  p_business_event_ref text,
  p_outcome text,
  p_candidate_count integer,
  p_enqueued_count integer,
  p_cancelled_count integer,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch public.app_workflow_email_dispatches%rowtype;
begin
  insert into public.app_workflow_email_dispatches (
    event_type,
    business_event_ref,
    outcome,
    candidate_count,
    enqueued_count,
    cancelled_count,
    reason_code
  ) values (
    p_event_type,
    p_business_event_ref,
    p_outcome,
    p_candidate_count,
    p_enqueued_count,
    p_cancelled_count,
    p_reason_code
  )
  on conflict (event_type, business_event_ref) do nothing;

  select * into strict v_dispatch
  from public.app_workflow_email_dispatches
  where event_type = p_event_type
    and business_event_ref = p_business_event_ref;

  if v_dispatch.outcome <> p_outcome
    or v_dispatch.candidate_count <> p_candidate_count
    or v_dispatch.enqueued_count <> p_enqueued_count
    or v_dispatch.cancelled_count <> p_cancelled_count
    or v_dispatch.reason_code is distinct from p_reason_code
  then
    raise exception 'workflow_email_dispatch_conflict';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'dispatch_id', v_dispatch.id,
    'outcome', v_dispatch.outcome
  );
end;
$$;

create function public.app_customer_information_request_email_notify_v1(
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

alter function public.app_customer_information_request_create_v1(
  uuid, text, text, text, text, text, timestamptz
) rename to app_customer_information_request_create_business_v1;
alter function public.app_customer_information_request_respond_v1(
  uuid, text, text, text, text, text, text, timestamptz
) rename to app_customer_information_request_respond_business_v1;
alter function public.app_customer_information_request_transition_v1(
  uuid, text, text, text, text, text, text, timestamptz
) rename to app_customer_information_request_transition_business_v1;

revoke all on function public.app_customer_information_request_create_business_v1(
  uuid, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_information_request_respond_business_v1(
  uuid, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_information_request_transition_business_v1(
  uuid, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;

create function public.app_customer_information_request_create_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_question text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_email_context jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response jsonb;
  v_request_ref text;
begin
  v_response := public.app_customer_information_request_create_business_v1(
    p_auth_user_id, p_case_ref, p_question, p_request_id,
    p_idempotency_key, p_payload_sha256, p_idempotency_expires_at
  );
  if v_response->>'ok' = 'true' and v_response->>'code' = 'created' then
    v_request_ref := v_response #>> '{request,request_ref}';
    perform public.app_customer_information_request_email_notify_v1(
      'CREATE', p_auth_user_id, p_case_ref, v_request_ref, p_email_context
    );
  end if;
  return v_response;
end;
$$;

create function public.app_customer_information_request_respond_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_request_ref text,
  p_response text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_email_context jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response jsonb;
begin
  v_response := public.app_customer_information_request_respond_business_v1(
    p_auth_user_id, p_case_ref, p_request_ref, p_response, p_request_id,
    p_idempotency_key, p_payload_sha256, p_idempotency_expires_at
  );
  if v_response->>'ok' = 'true' and v_response->>'code' = 'answered' then
    perform public.app_customer_information_request_email_notify_v1(
      'ANSWER', p_auth_user_id, p_case_ref, p_request_ref, p_email_context
    );
  end if;
  return v_response;
end;
$$;

create function public.app_customer_information_request_transition_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_request_ref text,
  p_action text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_email_context jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response jsonb;
begin
  v_response := public.app_customer_information_request_transition_business_v1(
    p_auth_user_id, p_case_ref, p_request_ref, p_action, p_request_id,
    p_idempotency_key, p_payload_sha256, p_idempotency_expires_at
  );
  if v_response->>'ok' = 'true'
    and v_response->>'code' = 'withdrawn' then
    perform public.app_customer_information_request_email_notify_v1(
      'WITHDRAW', p_auth_user_id, p_case_ref, p_request_ref, p_email_context
    );
  end if;
  return v_response;
end;
$$;

revoke all on function public.app_workflow_email_dispatch_record_v1(
  text, text, text, integer, integer, integer, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_information_request_email_notify_v1(
  text, uuid, text, text, jsonb
) from public, anon, authenticated, service_role;

revoke all on function public.app_customer_information_request_create_v1(
  uuid, text, text, text, text, text, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.app_customer_information_request_respond_v1(
  uuid, text, text, text, text, text, text, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.app_customer_information_request_transition_v1(
  uuid, text, text, text, text, text, text, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.app_customer_information_request_create_v1(
  uuid, text, text, text, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.app_customer_information_request_respond_v1(
  uuid, text, text, text, text, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.app_customer_information_request_transition_v1(
  uuid, text, text, text, text, text, text, timestamptz, jsonb
) to service_role;

comment on table public.app_workflow_email_dispatches is
  'Immutable privacy-safe outcome of transactionally resolving one workflow e-mail business event; stores no address, body, actor or policy provenance.';
comment on function public.app_customer_information_request_email_notify_v1(
  text, uuid, text, text, jsonb
) is
  'Owner-only information-request recipient resolver and transactional workflow-email integration; browser and service_role cannot select recipients or templates.';
comment on function public.app_customer_information_request_create_v1(
  uuid, text, text, text, text, text, timestamptz, jsonb
) is
  'Service-role information-request create boundary; atomically records the question and one deduplicated customer notification intent per current exact R7 actor.';
comment on function public.app_customer_information_request_respond_v1(
  uuid, text, text, text, text, text, text, timestamptz, jsonb
) is
  'Service-role information-request answer boundary; atomically records the answer and notifies only the still-authorized original creator.';
comment on function public.app_customer_information_request_transition_v1(
  uuid, text, text, text, text, text, text, timestamptz, jsonb
) is
  'Service-role withdraw/resolve boundary; withdraw cancels certainly-unsent original deliveries or enqueues a withdrawal notice after possible delivery, while resolve sends no mail.';

commit;

alter table public.app_workflow_email_intents
  add constraint app_workflow_email_intents_sender_snapshot_chk check (
    (
      not (template_variables ? 'sender_display_name')
      and not (template_variables ? 'sender_address')
      and not (template_variables ? 'presentation_config_version')
    )
    or
    (
      pg_catalog.jsonb_typeof(template_variables->'sender_display_name') = 'string'
      and template_variables->>'sender_display_name' = pg_catalog.btrim(
        template_variables->>'sender_display_name'
      )
      and length(pg_catalog.btrim(template_variables->>'sender_display_name')) between 1 and 120
      and pg_catalog.btrim(template_variables->>'sender_display_name') !~ '[[:cntrl:]]'
      and pg_catalog.jsonb_typeof(template_variables->'sender_address') = 'string'
      and template_variables->>'sender_address' = pg_catalog.btrim(
        template_variables->>'sender_address'
      )
      and length(pg_catalog.btrim(template_variables->>'sender_address')) between 3 and 254
      and length(pg_catalog.split_part(pg_catalog.btrim(template_variables->>'sender_address'), '@', 1)) between 1 and 64
      and pg_catalog.btrim(template_variables->>'sender_address') ~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$'
      and pg_catalog.btrim(template_variables->>'sender_address') !~ '^\.'
      and pg_catalog.btrim(template_variables->>'sender_address') !~ '\.@'
      and pg_catalog.btrim(template_variables->>'sender_address') !~ '\.\.'
      and pg_catalog.jsonb_typeof(template_variables->'presentation_config_version') = 'string'
      and template_variables->>'presentation_config_version' = pg_catalog.btrim(
        template_variables->>'presentation_config_version'
      )
      and pg_catalog.btrim(template_variables->>'presentation_config_version') ~ '^[a-z][a-z0-9._-]{2,63}$'
    )
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
  v_sender_display_name text;
  v_sender_address text;
  v_presentation_config_version text;
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
          'action_url','application_label','organization_name',
          'presentation_config_version','sender_address','sender_display_name'
        ]::text[]
    )
    or (
      p_template_key <> 'information-request-created-customer-nl-v1'
      and (select pg_catalog.array_agg(key order by key)
           from pg_catalog.jsonb_object_keys(p_template_variables) key)
        is distinct from array[
          'action_url','application_label','case_reference',
          'organization_name','presentation_config_version',
          'sender_address','sender_display_name'
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
    or pg_catalog.jsonb_typeof(
      p_template_variables->'sender_display_name'
    ) <> 'string'
    or pg_catalog.jsonb_typeof(
      p_template_variables->'sender_address'
    ) <> 'string'
    or pg_catalog.jsonb_typeof(
      p_template_variables->'presentation_config_version'
    ) <> 'string'
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
  v_sender_display_name := pg_catalog.btrim(
    p_template_variables->>'sender_display_name'
  );
  v_sender_address := pg_catalog.btrim(
    p_template_variables->>'sender_address'
  );
  v_presentation_config_version := pg_catalog.btrim(
    p_template_variables->>'presentation_config_version'
  );

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
    or v_sender_display_name is null
    or p_template_variables->>'sender_display_name'
      is distinct from v_sender_display_name
    or length(v_sender_display_name) not between 1 and 120
    or v_sender_display_name ~ '[[:cntrl:]]'
    or v_sender_address is null
    or p_template_variables->>'sender_address' is distinct from v_sender_address
    or length(v_sender_address) not between 3 and 254
    or length(pg_catalog.split_part(v_sender_address, '@', 1)) not between 1 and 64
    or v_sender_address !~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$'
    or v_sender_address ~ '^\.'
    or v_sender_address ~ '\.@'
    or v_sender_address ~ '\.\.'
    or v_presentation_config_version is null
    or p_template_variables->>'presentation_config_version'
      is distinct from v_presentation_config_version
    or v_presentation_config_version !~ '^[a-z][a-z0-9._-]{2,63}$'
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
      extensions.digest(p_dedupe_key || ':' || v_payload_sha256, 'sha256'), 'hex'
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

create or replace function public.app_workflow_email_claim_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_delivery public.app_workflow_email_deliveries%rowtype;
  v_intent public.app_workflow_email_intents%rowtype;
  v_lease_token uuid;
  v_expired record;
begin
  for v_expired in
    select d.*
    from public.app_workflow_email_deliveries d
    join public.app_workflow_email_intents i on i.id = d.intent_id
    where d.status = 'processing'
      and d.leased_until <= v_now
      and pg_catalog.jsonb_typeof(i.template_variables) = 'object'
      and pg_catalog.jsonb_typeof(
        i.template_variables->'sender_display_name'
      ) = 'string'
      and length(pg_catalog.btrim(
        i.template_variables->>'sender_display_name'
      )) between 1 and 120
      and pg_catalog.btrim(
        i.template_variables->>'sender_display_name'
      ) !~ '[[:cntrl:]]'
      and pg_catalog.jsonb_typeof(
        i.template_variables->'sender_address'
      ) = 'string'
      and length(pg_catalog.btrim(
        i.template_variables->>'sender_address'
      )) between 3 and 254
      and length(pg_catalog.split_part(pg_catalog.btrim(
        i.template_variables->>'sender_address'
      ), '@', 1)) between 1 and 64
      and pg_catalog.btrim(i.template_variables->>'sender_address')
        ~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$'
      and pg_catalog.btrim(i.template_variables->>'sender_address') !~ '^\.'
      and pg_catalog.btrim(i.template_variables->>'sender_address') !~ '\.@'
      and pg_catalog.btrim(i.template_variables->>'sender_address') !~ '\.\.'
      and pg_catalog.jsonb_typeof(
        i.template_variables->'presentation_config_version'
      ) = 'string'
      and pg_catalog.btrim(
        i.template_variables->>'presentation_config_version'
      ) ~ '^[a-z][a-z0-9._-]{2,63}$'
    order by d.leased_until, d.id
    limit 5
    for update of d skip locked
  loop
    insert into public.app_workflow_email_delivery_attempts (
      delivery_id,
      attempt_number,
      outcome,
      transport_id,
      safe_error_class,
      started_at,
      finished_at
    ) values (
      v_expired.id,
      v_expired.attempt_count,
      case when v_expired.attempt_count >= 5
        then 'permanent_failure' else 'ambiguous_failure' end,
      'local_mailpit_v1',
      'lease_expired',
      v_expired.leased_at,
      v_now
    ) on conflict (delivery_id, attempt_number) do nothing;

    update public.app_workflow_email_deliveries
    set status = case when attempt_count >= 5
          then 'permanent_failure' else 'ambiguous_failure' end,
        next_attempt_at = case when attempt_count >= 5 then next_attempt_at
          else v_now + pg_catalog.make_interval(
            secs => least(
              1800,
              30 * pg_catalog.power(2, attempt_count - 1)::integer
            )
          ) end,
        lease_token = null,
        leased_at = null,
        leased_until = null,
        safe_error_class = 'lease_expired',
        updated_at = v_now
    where id = v_expired.id;
  end loop;

  select d.* into v_delivery
  from public.app_workflow_email_deliveries d
  join public.app_workflow_email_intents i on i.id = d.intent_id
  where d.status in ('queued', 'retryable_failure', 'ambiguous_failure')
    and d.attempt_count < 5
    and d.next_attempt_at <= v_now
    and pg_catalog.jsonb_typeof(i.template_variables) = 'object'
    and pg_catalog.jsonb_typeof(
      i.template_variables->'sender_display_name'
    ) = 'string'
    and length(pg_catalog.btrim(
      i.template_variables->>'sender_display_name'
    )) between 1 and 120
    and pg_catalog.btrim(
      i.template_variables->>'sender_display_name'
    ) !~ '[[:cntrl:]]'
    and pg_catalog.jsonb_typeof(
      i.template_variables->'sender_address'
    ) = 'string'
    and length(pg_catalog.btrim(
      i.template_variables->>'sender_address'
    )) between 3 and 254
    and length(pg_catalog.split_part(pg_catalog.btrim(
      i.template_variables->>'sender_address'
    ), '@', 1)) between 1 and 64
    and pg_catalog.btrim(i.template_variables->>'sender_address')
      ~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$'
    and pg_catalog.btrim(i.template_variables->>'sender_address') !~ '^\.'
    and pg_catalog.btrim(i.template_variables->>'sender_address') !~ '\.@'
    and pg_catalog.btrim(i.template_variables->>'sender_address') !~ '\.\.'
    and pg_catalog.jsonb_typeof(
      i.template_variables->'presentation_config_version'
    ) = 'string'
    and pg_catalog.btrim(
      i.template_variables->>'presentation_config_version'
    ) ~ '^[a-z][a-z0-9._-]{2,63}$'
  order by d.next_attempt_at, d.id
  for update of d skip locked
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object('ok', true, 'delivery', null);
  end if;

  v_lease_token := extensions.gen_random_uuid();
  update public.app_workflow_email_deliveries
  set status = 'processing',
      attempt_count = attempt_count + 1,
      lease_token = v_lease_token,
      leased_at = v_now,
      leased_until = v_now + interval '5 minutes',
      safe_error_class = null,
      updated_at = v_now
  where id = v_delivery.id
  returning * into v_delivery;

  select * into strict v_intent
  from public.app_workflow_email_intents
  where id = v_delivery.intent_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'delivery', pg_catalog.jsonb_build_object(
      'delivery_id', v_delivery.id,
      'lease_token', v_lease_token,
      'attempt_number', v_delivery.attempt_count,
      'recipient_email', v_intent.recipient_email,
      'subject', v_intent.frozen_subject,
      'body', v_intent.frozen_body,
      'sender_display_name',
        v_intent.template_variables->>'sender_display_name',
      'sender_address', v_intent.template_variables->>'sender_address',
      'presentation_config_version',
        v_intent.template_variables->>'presentation_config_version',
      'provider_idempotency_key', v_intent.provider_idempotency_key,
      'template_key', v_intent.template_key
    )
  );
end;
$$;

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
  v_sender_display_name text;
  v_sender_address text;
  v_presentation_config_version text;
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
      is not distinct from array[
        'organization_name','portal_origin','presentation_config_version',
        'sender_address','sender_display_name'
      ]::text[]
    and pg_catalog.jsonb_typeof(
      p_email_context->'organization_name'
    ) = 'string'
    and pg_catalog.jsonb_typeof(p_email_context->'portal_origin') = 'string'
    and pg_catalog.jsonb_typeof(
      p_email_context->'sender_display_name'
    ) = 'string'
    and pg_catalog.jsonb_typeof(p_email_context->'sender_address') = 'string'
    and pg_catalog.jsonb_typeof(
      p_email_context->'presentation_config_version'
    ) = 'string'
  then
    v_organization_name := pg_catalog.btrim(
      p_email_context->>'organization_name'
    );
    v_portal_origin := pg_catalog.btrim(p_email_context->>'portal_origin');
    v_sender_display_name := pg_catalog.btrim(
      p_email_context->>'sender_display_name'
    );
    v_sender_address := pg_catalog.btrim(p_email_context->>'sender_address');
    v_presentation_config_version := pg_catalog.btrim(
      p_email_context->>'presentation_config_version'
    );
    v_context_valid := length(v_organization_name) between 1 and 120
      and v_organization_name !~ '[[:cntrl:]]'
      and v_portal_origin ~ '^(https://[A-Za-z0-9.-]+(:[0-9]{1,5})?|http://(127\.0\.0\.1|localhost):(5174|5175))$'
      and length(v_sender_display_name) between 1 and 120
      and v_sender_display_name !~ '[[:cntrl:]]'
      and length(v_sender_address) between 3 and 254
      and length(pg_catalog.split_part(v_sender_address, '@', 1)) between 1 and 64
      and v_sender_address ~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$'
      and v_sender_address !~ '^\.'
      and v_sender_address !~ '\.@'
      and v_sender_address !~ '\.\.'
      and v_presentation_config_version ~ '^[a-z][a-z0-9._-]{2,63}$';
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
                '/dashboard/aanvragen/' || v_case.case_reference,
              'sender_display_name', v_sender_display_name,
              'sender_address', v_sender_address,
              'presentation_config_version', v_presentation_config_version
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
                '/beheer/dossiers/' || v_case.case_reference,
              'sender_display_name', v_sender_display_name,
              'sender_address', v_sender_address,
              'presentation_config_version', v_presentation_config_version
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
                '/dashboard/aanvragen/' || v_case.case_reference,
              'sender_display_name', v_sender_display_name,
              'sender_address', v_sender_address,
              'presentation_config_version', v_presentation_config_version
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

revoke all on function public.app_workflow_email_enqueue_v1(
  text, text, text, text, uuid, text, jsonb, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_information_request_email_notify_v1(
  text, uuid, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_workflow_email_claim_v1()
  from public, anon, authenticated;
grant execute on function public.app_workflow_email_claim_v1()
  to service_role;

comment on constraint app_workflow_email_intents_sender_snapshot_chk
  on public.app_workflow_email_intents is
  'Legacy intents may omit sender snapshots. New enqueue contracts require one complete immutable sender snapshot.';
comment on function public.app_workflow_email_enqueue_v1(
  text, text, text, text, uuid, text, jsonb, text
) is
  'Creates immutable workflow-email intents whose payload and provider idempotency key bind the validated sender snapshot.';
comment on function public.app_workflow_email_claim_v1() is
  'Service-only lease claim. Legacy intents without complete sender snapshots remain unclaimed and unchanged.';

create table public.app_workflow_email_intents (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  template_key text not null,
  business_event_ref text not null,
  recipient_kind text not null,
  recipient_ref uuid not null,
  recipient_email text not null,
  template_variables jsonb not null,
  frozen_subject text not null,
  frozen_body text not null,
  payload_sha256 text not null,
  provider_idempotency_key text not null,
  dedupe_key text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint app_workflow_email_intents_event_chk check (
    event_type = 'information_request_created_customer'
  ),
  constraint app_workflow_email_intents_template_chk check (
    template_key = 'information-request-created-customer-nl-v1'
  ),
  constraint app_workflow_email_intents_recipient_kind_chk check (
    recipient_kind = 'customer'
  ),
  constraint app_workflow_email_intents_email_chk check (
    recipient_email = lower(btrim(recipient_email))
    and length(recipient_email) between 3 and 320
    and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint app_workflow_email_intents_hash_chk check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_workflow_email_intents_provider_key_chk check (
    provider_idempotency_key ~ '^workflow-email-v1:[0-9a-f]{64}$'
  ),
  constraint app_workflow_email_intents_dedupe_chk check (
    length(dedupe_key) between 1 and 200
    and dedupe_key ~ '^[a-z0-9][a-z0-9:._/-]*$'
  ),
  constraint app_workflow_email_intents_business_ref_chk check (
    length(business_event_ref) between 1 and 200
    and business_event_ref !~ '[[:cntrl:]]'
  ),
  constraint app_workflow_email_intents_subject_chk check (
    frozen_subject = 'Er staat een vraag voor u klaar'
  ),
  constraint app_workflow_email_intents_body_chk check (
    length(frozen_body) between 1 and 4000
  ),
  constraint app_workflow_email_intents_dedupe_uniq unique (dedupe_key),
  constraint app_workflow_email_intents_event_recipient_uniq unique (
    event_type,
    business_event_ref,
    recipient_ref,
    template_key
  ),
  constraint app_workflow_email_intents_provider_key_uniq unique (
    provider_idempotency_key
  )
);

create table public.app_workflow_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null unique references public.app_workflow_email_intents(id),
  status text not null default 'queued',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default statement_timestamp(),
  lease_token uuid,
  leased_at timestamptz,
  leased_until timestamptz,
  provider_reference text,
  provider_accepted_at timestamptz,
  safe_error_class text,
  cancelled_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint app_workflow_email_deliveries_status_chk check (
    status in (
      'queued',
      'processing',
      'provider_accepted',
      'retryable_failure',
      'permanent_failure',
      'ambiguous_failure',
      'cancelled'
    )
  ),
  constraint app_workflow_email_deliveries_attempt_chk check (
    attempt_count between 0 and 5
  ),
  constraint app_workflow_email_deliveries_lease_chk check (
    (status = 'processing'
      and lease_token is not null
      and leased_at is not null
      and leased_until is not null
      and leased_until > leased_at)
    or
    (status <> 'processing'
      and lease_token is null
      and leased_at is null
      and leased_until is null)
  ),
  constraint app_workflow_email_deliveries_provider_chk check (
    (status = 'provider_accepted'
      and provider_accepted_at is not null
      and provider_reference is not null
      and safe_error_class is null)
    or
    (status <> 'provider_accepted'
      and provider_accepted_at is null)
  ),
  constraint app_workflow_email_deliveries_cancelled_chk check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  ),
  constraint app_workflow_email_deliveries_error_chk check (
    safe_error_class is null
    or safe_error_class in (
      'transport_unavailable',
      'delivery_failed',
      'configuration_invalid',
      'lease_expired',
      'provider_ambiguous'
    )
  ),
  constraint app_workflow_email_deliveries_provider_ref_chk check (
    provider_reference is null
    or (
      length(provider_reference) between 1 and 200
      and provider_reference ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]*$'
    )
  )
);

create table public.app_workflow_email_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.app_workflow_email_deliveries(id),
  attempt_number integer not null,
  outcome text not null,
  transport_id text not null,
  provider_reference text,
  safe_error_class text,
  started_at timestamptz not null,
  finished_at timestamptz not null default statement_timestamp(),
  constraint app_workflow_email_attempts_number_chk check (
    attempt_number between 1 and 5
  ),
  constraint app_workflow_email_attempts_outcome_chk check (
    outcome in (
      'provider_accepted',
      'retryable_failure',
      'permanent_failure',
      'ambiguous_failure'
    )
  ),
  constraint app_workflow_email_attempts_transport_chk check (
    transport_id = 'local_mailpit_v1'
  ),
  constraint app_workflow_email_attempts_error_chk check (
    safe_error_class is null
    or safe_error_class in (
      'transport_unavailable',
      'delivery_failed',
      'configuration_invalid',
      'lease_expired',
      'provider_ambiguous'
    )
  ),
  constraint app_workflow_email_attempts_provider_ref_chk check (
    provider_reference is null
    or (
      length(provider_reference) between 1 and 200
      and provider_reference ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]*$'
    )
  ),
  constraint app_workflow_email_attempts_time_chk check (
    finished_at >= started_at
  ),
  constraint app_workflow_email_attempts_delivery_number_uniq unique (
    delivery_id,
    attempt_number
  )
);

create index app_workflow_email_deliveries_claim_idx
  on public.app_workflow_email_deliveries (next_attempt_at, id)
  where status in ('queued', 'retryable_failure', 'ambiguous_failure');

create index app_workflow_email_deliveries_expired_lease_idx
  on public.app_workflow_email_deliveries (leased_until, id)
  where status = 'processing';

create function public.app_workflow_email_block_mutation_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'workflow_email_record_immutable';
end;
$$;

create trigger app_workflow_email_intents_immutable
before update or delete on public.app_workflow_email_intents
for each row execute function public.app_workflow_email_block_mutation_v1();

create trigger app_workflow_email_attempts_immutable
before update or delete on public.app_workflow_email_delivery_attempts
for each row execute function public.app_workflow_email_block_mutation_v1();

create function public.app_workflow_email_enqueue_v1(
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
  v_action_url text;
  v_subject constant text := 'Er staat een vraag voor u klaar';
  v_body text;
  v_payload_sha256 text;
  v_intent public.app_workflow_email_intents%rowtype;
begin
  if p_event_type is distinct from 'information_request_created_customer'
    or p_template_key is distinct from 'information-request-created-customer-nl-v1'
    or p_recipient_kind is distinct from 'customer'
    or p_recipient_ref is null
    or p_business_event_ref is null
    or length(p_business_event_ref) not between 1 and 200
    or p_business_event_ref ~ '[[:cntrl:]]'
    or p_dedupe_key is null
    or length(p_dedupe_key) not between 1 and 200
    or p_dedupe_key !~ '^[a-z0-9][a-z0-9:._/-]*$'
  then
    raise exception 'workflow_email_contract_invalid';
  end if;

  if p_template_variables is null
    or pg_catalog.jsonb_typeof(p_template_variables) <> 'object'
    or (select pg_catalog.array_agg(key order by key)
        from pg_catalog.jsonb_object_keys(p_template_variables) key)
      is distinct from array['action_url','application_label','organization_name']::text[]
    or pg_catalog.jsonb_typeof(p_template_variables->'organization_name') <> 'string'
    or pg_catalog.jsonb_typeof(p_template_variables->'application_label') <> 'string'
    or pg_catalog.jsonb_typeof(p_template_variables->'action_url') <> 'string'
  then
    raise exception 'workflow_email_template_variables_invalid';
  end if;

  v_email := pg_catalog.lower(pg_catalog.btrim(p_recipient_email));
  v_organization_name := pg_catalog.btrim(p_template_variables->>'organization_name');
  v_application_label := pg_catalog.btrim(p_template_variables->>'application_label');
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
    or v_action_url is null
    or length(v_action_url) not between 1 and 500
    or v_action_url !~ '^(https://[A-Za-z0-9.-]+(:[0-9]{1,5})?|http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?)/dashboard/aanvragen/CASE-([0-9A-Fa-f]{12}|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$'
  then
    raise exception 'workflow_email_template_variables_invalid';
  end if;

  v_body := pg_catalog.format(
    E'Beste klant,\n\n%s heeft een vraag over %s.\n\nBekijk en beantwoord de vraag in uw klantportaal:\n%s\n\nMet vriendelijke groet,\n%s',
    v_organization_name,
    v_application_label,
    v_action_url,
    v_organization_name
  );

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

create function public.app_workflow_email_claim_v1()
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
    where d.status = 'processing'
      and d.leased_until <= v_now
    order by d.leased_until, d.id
    limit 5
    for update skip locked
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
            secs => least(1800, 30 * pg_catalog.power(2, attempt_count - 1)::integer)
          ) end,
        lease_token = null,
        leased_at = null,
        leased_until = null,
        safe_error_class = 'lease_expired',
        updated_at = v_now
    where id = v_expired.id;
  end loop;

  select * into v_delivery
  from public.app_workflow_email_deliveries
  where status in ('queued', 'retryable_failure', 'ambiguous_failure')
    and attempt_count < 5
    and next_attempt_at <= v_now
  order by next_attempt_at, id
  for update skip locked
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
      'provider_idempotency_key', v_intent.provider_idempotency_key,
      'template_key', v_intent.template_key
    )
  );
end;
$$;

create function public.app_workflow_email_complete_v1(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_provider_reference text default null,
  p_safe_error_class text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_delivery public.app_workflow_email_deliveries%rowtype;
  v_final_status text;
begin
  if p_delivery_id is null or p_lease_token is null
    or p_outcome not in (
      'provider_accepted',
      'retryable_failure',
      'permanent_failure',
      'ambiguous_failure'
    )
    or (p_outcome = 'provider_accepted' and (
      p_provider_reference is null
      or p_safe_error_class is not null
    ))
    or (p_outcome <> 'provider_accepted' and (
      p_provider_reference is not null
      or p_safe_error_class not in (
        'transport_unavailable',
        'delivery_failed',
        'configuration_invalid',
        'provider_ambiguous'
      )
    ))
    or (p_provider_reference is not null and (
      length(p_provider_reference) not between 1 and 200
      or p_provider_reference !~ '^[A-Za-z0-9][A-Za-z0-9:._/-]*$'
    ))
  then
    raise exception 'workflow_email_completion_invalid';
  end if;

  select * into v_delivery
  from public.app_workflow_email_deliveries
  where id = p_delivery_id
  for update;

  if not found
    or v_delivery.status <> 'processing'
    or v_delivery.lease_token <> p_lease_token
    or v_delivery.leased_until <= v_now
  then
    raise exception 'workflow_email_lease_invalid';
  end if;

  v_final_status := case
    when p_outcome in ('retryable_failure', 'ambiguous_failure')
      and v_delivery.attempt_count >= 5 then 'permanent_failure'
    else p_outcome
  end;

  insert into public.app_workflow_email_delivery_attempts (
    delivery_id,
    attempt_number,
    outcome,
    transport_id,
    provider_reference,
    safe_error_class,
    started_at,
    finished_at
  ) values (
    v_delivery.id,
    v_delivery.attempt_count,
    v_final_status,
    'local_mailpit_v1',
    p_provider_reference,
    p_safe_error_class,
    v_delivery.leased_at,
    v_now
  );

  update public.app_workflow_email_deliveries
  set status = v_final_status,
      next_attempt_at = case
        when v_final_status in ('retryable_failure', 'ambiguous_failure')
          then v_now + pg_catalog.make_interval(
            secs => least(1800, 30 * pg_catalog.power(2, attempt_count - 1)::integer)
          )
        else next_attempt_at
      end,
      lease_token = null,
      leased_at = null,
      leased_until = null,
      provider_reference = p_provider_reference,
      provider_accepted_at = case when v_final_status = 'provider_accepted'
        then v_now else null end,
      safe_error_class = p_safe_error_class,
      updated_at = v_now
  where id = v_delivery.id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', v_final_status,
    'attempt_count', v_delivery.attempt_count
  );
end;
$$;

create function public.app_workflow_email_cancel_v1(p_dedupe_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.app_workflow_email_deliveries%rowtype;
begin
  select d.* into v_delivery
  from public.app_workflow_email_deliveries d
  join public.app_workflow_email_intents i on i.id = d.intent_id
  where i.dedupe_key = p_dedupe_key
  for update of d;

  if not found then
    raise exception 'workflow_email_intent_not_found';
  end if;
  if v_delivery.status = 'provider_accepted' then
    raise exception 'workflow_email_already_accepted';
  end if;
  if v_delivery.status = 'processing' then
    raise exception 'workflow_email_delivery_in_progress';
  end if;
  if v_delivery.status = 'cancelled' then
    return pg_catalog.jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;

  update public.app_workflow_email_deliveries
  set status = 'cancelled',
      cancelled_at = statement_timestamp(),
      safe_error_class = null,
      updated_at = statement_timestamp()
  where id = v_delivery.id;

  return pg_catalog.jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

alter table public.app_workflow_email_intents enable row level security;
alter table public.app_workflow_email_intents force row level security;
alter table public.app_workflow_email_deliveries enable row level security;
alter table public.app_workflow_email_deliveries force row level security;
alter table public.app_workflow_email_delivery_attempts enable row level security;
alter table public.app_workflow_email_delivery_attempts force row level security;

create policy deny_all on public.app_workflow_email_intents
  for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_workflow_email_deliveries
  for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_workflow_email_delivery_attempts
  for all to anon, authenticated using (false) with check (false);

revoke all privileges on table public.app_workflow_email_intents
  from public, anon, authenticated, service_role;
revoke all privileges on table public.app_workflow_email_deliveries
  from public, anon, authenticated, service_role;
revoke all privileges on table public.app_workflow_email_delivery_attempts
  from public, anon, authenticated, service_role;

revoke all on function public.app_workflow_email_block_mutation_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_workflow_email_enqueue_v1(
  text, text, text, text, uuid, text, jsonb, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_workflow_email_cancel_v1(text)
  from public, anon, authenticated, service_role;

revoke all on function public.app_workflow_email_claim_v1()
  from public, anon, authenticated;
grant execute on function public.app_workflow_email_claim_v1()
  to service_role;

revoke all on function public.app_workflow_email_complete_v1(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_workflow_email_complete_v1(
  uuid, uuid, text, text, text
) to service_role;

comment on table public.app_workflow_email_intents is
  'App-owned immutable workflow e-mail intent with code-versioned frozen plain-text content; not a browser API.';
comment on table public.app_workflow_email_deliveries is
  'Mutable operational delivery state for App-owned workflow e-mail intents.';
comment on table public.app_workflow_email_delivery_attempts is
  'Immutable, privacy-minimized workflow e-mail delivery attempt ledger.';
comment on function public.app_workflow_email_enqueue_v1(
  text, text, text, text, uuid, text, jsonb, text
) is
  'Owner-only closed-template enqueue helper for later transactional calls from authoritative domain RPCs.';
comment on function public.app_workflow_email_claim_v1() is
  'Service-role-only bounded lease claim; returns one frozen delivery or null.';
comment on function public.app_workflow_email_complete_v1(
  uuid, uuid, text, text, text
) is
  'Service-role-only lease completion using allowlisted operational outcomes and safe error classes.';

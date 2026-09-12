begin;

-- CUSTOMER_INFORMATION_REQUEST_V1 adds one case-scoped, text-only customer
-- question. It is deliberately separate from signed correction handoffs.

alter table public.app_workforce_capability_catalog
  drop constraint app_workforce_capability_shape_chk;
alter table public.app_workforce_capability_catalog
  add constraint app_workforce_capability_shape_chk check (
    (
      capability_code in (
        'location.root.create',
        'evidence.review.view',
        'evidence.review.decide'
      )
      and scope_kind = 'case'
      and (
        capability_code not in (
          'evidence.review.view', 'evidence.review.decide'
        )
        or (
          floor_seniority = 'member'
          and default_seniority = case capability_code
            when 'evidence.review.view' then 'member'
            else 'reviewer'
          end
        )
      )
    )
    or (
      capability_code in (
        'evidence.review.correction.publish',
        'customer.information_request.manage'
      )
      and scope_kind = 'case'
      and floor_seniority = 'reviewer'
      and default_seniority = 'reviewer'
    )
    or (
      capability_code = 'evidence.review.correction.supersede'
      and scope_kind = 'case'
      and floor_seniority = 'admin'
      and default_seniority = 'admin'
    )
    or (
      capability_code in (
        'location.observation.record',
        'location.version.accept.prepare',
        'location.version.accept.approve',
        'location.version.correct.prepare',
        'location.version.correct.approve'
      )
      and scope_kind = 'case_location'
    )
    or (
      capability_code in (
        'workforce.member.manage',
        'workforce.policy.manage',
        'case.assignment.manage'
      )
      and scope_kind = 'global'
      and floor_seniority = 'admin'
      and default_seniority = 'admin'
    )
    or (
      capability_code in (
        'compliance.delivery_year.view',
        'compliance.delivery_year.record'
      )
      and scope_kind = 'tenant_wide'
      and floor_seniority = 'member'
      and default_seniority = 'reviewer'
    )
  );

insert into public.app_workforce_capability_catalog (
  capability_code, catalogue_version, floor_seniority,
  default_seniority, scope_kind
) values (
  'customer.information_request.manage', 'pilot_v1',
  'reviewer', 'reviewer', 'case'
);

alter table public.app_workforce_capability_assignments
  drop constraint app_workforce_capability_assignments_capability_chk;
alter table public.app_workforce_capability_assignments
  add constraint app_workforce_capability_assignments_capability_chk check (
    capability_code in (
      'location.root.create',
      'location.observation.record',
      'location.version.accept.prepare',
      'location.version.accept.approve',
      'location.version.correct.prepare',
      'location.version.correct.approve',
      'workforce.member.manage',
      'workforce.policy.manage',
      'case.assignment.manage',
      'compliance.delivery_year.view',
      'compliance.delivery_year.record',
      'evidence.review.view',
      'evidence.review.decide',
      'evidence.review.correction.publish',
      'evidence.review.correction.supersede',
      'customer.information_request.manage'
    )
  );

alter table public.app_workforce_scope_assignments
  drop constraint app_workforce_scope_assignments_capability_chk;
alter table public.app_workforce_scope_assignments
  add constraint app_workforce_scope_assignments_capability_chk check (
    capability_code in (
      'location.root.create',
      'location.observation.record',
      'location.version.accept.prepare',
      'location.version.accept.approve',
      'location.version.correct.prepare',
      'location.version.correct.approve',
      'evidence.review.view',
      'evidence.review.decide',
      'evidence.review.correction.publish',
      'evidence.review.correction.supersede'
    )
  );
alter table public.app_workforce_scope_assignments
  drop constraint app_workforce_scope_assignments_shape_chk;
alter table public.app_workforce_scope_assignments
  add constraint app_workforce_scope_assignments_shape_chk check (
    (
      capability_code in (
        'location.root.create',
        'evidence.review.view',
        'evidence.review.decide',
        'evidence.review.correction.publish',
        'evidence.review.correction.supersede'
      )
      and location_id is null
      and case_location_relation_id is null
    )
    or (
      capability_code in (
        'location.observation.record',
        'location.version.accept.prepare',
        'location.version.accept.approve',
        'location.version.correct.prepare',
        'location.version.correct.approve'
      )
      and location_id is not null
      and case_location_relation_id is not null
    )
  );

insert into public.app_workforce_policy_versions (
  id, policy_ref, catalogue_version, require_distinct_maker_checker,
  canonical_sha256, created_by_workforce_identity_id,
  created_by_actor_ref, decision_ref, request_id
) values (
  '00000000-0000-4000-8000-000000003601',
  'enval_default_v7', 'pilot_v1', true,
  pg_catalog.encode(extensions.digest(
    'customer_information_request_v1|enval_default_v7|customer.information_request.manage=reviewer',
    'sha256'
  ), 'hex'),
  null, 'system:customer_information_request_v1_migration',
  'customer_information_request_v1_default_policy',
  'customer-information-request-v1-default-policy-v7'
);

insert into public.app_workforce_policy_requirements (
  policy_version_id, capability_code, minimum_seniority
)
select
  '00000000-0000-4000-8000-000000003601'::uuid,
  catalog.capability_code,
  catalog.default_seniority
from public.app_workforce_capability_catalog catalog;

do $$
declare
  v_effective_at timestamptz := pg_catalog.clock_timestamp();
  identity_row record;
begin
  insert into public.app_workforce_policy_activations (
    id, policy_version_id, effective_at, recorded_at,
    activated_by_workforce_identity_id, activated_by_actor_ref,
    decision_ref, request_id
  ) values (
    '00000000-0000-4000-8000-000000003602',
    '00000000-0000-4000-8000-000000003601',
    v_effective_at, v_effective_at, null,
    'system:customer_information_request_v1_migration',
    'customer_information_request_v1_default_policy',
    'customer-information-request-v1-default-policy-activation-v7'
  );

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, actor_type, actor_ref,
    event_data, authorization_policy_version_id, created_at
  ) values
    (
      'workforce_policy_version_created', 'workforce_policy',
      '00000000-0000-4000-8000-000000003601',
      'customer-information-request-v1-default-policy-v7', 'system',
      'system:customer_information_request_v1_migration',
      '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v7"}',
      '00000000-0000-4000-8000-000000003601', v_effective_at
    ),
    (
      'workforce_policy_activated', 'workforce_policy',
      '00000000-0000-4000-8000-000000003601',
      'customer-information-request-v1-default-policy-activation-v7',
      'system', 'system:customer_information_request_v1_migration',
      '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v7"}',
      '00000000-0000-4000-8000-000000003601', v_effective_at
    );

  for identity_row in
    select id from public.app_workforce_identities order by id
  loop
    perform public.app_workforce_reconcile_capabilities_v1(
      identity_row.id, v_effective_at,
      'system:customer_information_request_v1_migration',
      'customer_information_request_v1_default_policy',
      'customer-information-request-v1-reconcile-' ||
        pg_catalog.md5(identity_row.id::text)
    );
  end loop;
end;
$$;

create function public.app_customer_information_request_authorize_v1(
  p_auth_user_id uuid,
  p_case_id uuid,
  p_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope_authority jsonb;
begin
  v_scope_authority := public.app_workforce_authorize_v1(
    p_auth_user_id, 'evidence.review.correction.publish', p_case_id, null, p_at
  );
  if v_scope_authority->>'ok' <> 'true' then return v_scope_authority; end if;
  if not exists (
    select 1
    from public.app_workforce_capability_assignments capability
    where capability.workforce_identity_id =
        (v_scope_authority->>'workforce_identity_id')::uuid
      and capability.capability_code = 'customer.information_request.manage'
      and capability.event_type = 'granted'
      and capability.supersedes_assignment_event_id is null
      and capability.effective_at <= p_at
      and (capability.valid_until is null or p_at < capability.valid_until)
      and not exists (
        select 1
        from public.app_workforce_capability_assignments revoked
        where revoked.assignment_id = capability.assignment_id
          and revoked.event_type = 'revoked'
          and revoked.effective_at <= p_at
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'capability_not_authorized'
    );
  end if;
  return v_scope_authority || pg_catalog.jsonb_build_object(
    'authorized_capability', 'customer.information_request.manage',
    'scope_basis_capability', 'evidence.review.correction.publish'
  );
end;
$$;

create function public.app_customer_information_request_idempotency_replay_v1(
  p_scope text,
  p_idempotency_key text,
  p_payload_sha256 text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_idempotency public.app_idempotency_keys%rowtype;
begin
  select idempotency.* into v_idempotency
  from public.app_idempotency_keys idempotency
  where idempotency.scope = p_scope
    and idempotency.key = p_idempotency_key;
  if not found then return null; end if;
  if v_idempotency.payload_hash <> p_payload_sha256 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'idempotency_conflict'
    );
  end if;
  if v_idempotency.response_status is not null
     and v_idempotency.response_body is not null then
    return v_idempotency.response_body;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
  );
end;
$$;

create table public.app_customer_information_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique,
  case_id uuid not null references public.app_cases(id) on delete restrict,
  target_customer_id uuid not null
    references public.app_customers(id) on delete restrict,
  question_text text not null,
  created_by_workforce_identity_id uuid not null
    references public.app_workforce_identities(id) on delete restrict,
  created_by_scope_assignment_id uuid not null
    references public.app_workforce_scope_assignments(id) on delete restrict,
  capability_code text not null,
  authorization_policy_version_id uuid not null
    references public.app_workforce_policy_versions(id) on delete restrict,
  payload_sha256 text not null,
  request_id text not null unique,
  idempotency_key text not null,
  created_at timestamptz not null,
  terminal_action text,
  terminal_at timestamptz,
  terminal_by_workforce_identity_id uuid
    references public.app_workforce_identities(id) on delete restrict,
  terminal_scope_assignment_id uuid
    references public.app_workforce_scope_assignments(id) on delete restrict,
  terminal_policy_version_id uuid
    references public.app_workforce_policy_versions(id) on delete restrict,
  terminal_payload_sha256 text,
  terminal_request_id text unique,
  terminal_idempotency_key text,
  constraint app_customer_information_requests_reference_chk check (
    request_reference ~ '^IRQ-[0-9A-F]{16}$'
  ),
  constraint app_customer_information_requests_question_chk check (
    question_text = pg_catalog.btrim(question_text)
    and pg_catalog.char_length(question_text) between 1 and 1000
    and question_text !~ '[[:cntrl:]]'
  ),
  constraint app_customer_information_requests_capability_chk check (
    capability_code = 'customer.information_request.manage'
  ),
  constraint app_customer_information_requests_request_chk check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
    and request_id = pg_catalog.btrim(request_id)
    and pg_catalog.char_length(request_id) between 1 and 128
    and idempotency_key = pg_catalog.btrim(idempotency_key)
    and pg_catalog.char_length(idempotency_key) between 1 and 200
  ),
  constraint app_customer_information_requests_terminal_chk check (
    (
      terminal_action is null
      and terminal_at is null
      and terminal_by_workforce_identity_id is null
      and terminal_scope_assignment_id is null
      and terminal_policy_version_id is null
      and terminal_payload_sha256 is null
      and terminal_request_id is null
      and terminal_idempotency_key is null
    )
    or (
      terminal_action in ('WITHDRAWN', 'RESOLVED')
      and terminal_at is not null
      and terminal_at >= created_at
      and terminal_by_workforce_identity_id is not null
      and terminal_scope_assignment_id is not null
      and terminal_policy_version_id is not null
      and terminal_payload_sha256 ~ '^[0-9a-f]{64}$'
      and terminal_request_id = pg_catalog.btrim(terminal_request_id)
      and pg_catalog.char_length(terminal_request_id) between 1 and 128
      and terminal_idempotency_key = pg_catalog.btrim(terminal_idempotency_key)
      and pg_catalog.char_length(terminal_idempotency_key) between 1 and 200
    )
  )
);

create unique index app_customer_information_requests_active_case_uidx
  on public.app_customer_information_requests(case_id)
  where terminal_action is null;

create table public.app_customer_information_responses (
  id uuid primary key default gen_random_uuid(),
  information_request_id uuid not null unique
    references public.app_customer_information_requests(id) on delete restrict,
  case_id uuid not null references public.app_cases(id) on delete restrict,
  customer_id uuid not null references public.app_customers(id) on delete restrict,
  auth_user_id uuid not null,
  customer_identity_id uuid not null
    references public.app_customer_identities(id) on delete restrict,
  response_text text not null,
  payload_sha256 text not null,
  request_id text not null unique,
  idempotency_key text not null,
  responded_at timestamptz not null,
  constraint app_customer_information_responses_text_chk check (
    response_text = pg_catalog.btrim(response_text)
    and pg_catalog.char_length(response_text) between 1 and 1000
    and response_text !~ '[[:cntrl:]]'
  ),
  constraint app_customer_information_responses_request_chk check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
    and request_id = pg_catalog.btrim(request_id)
    and pg_catalog.char_length(request_id) between 1 and 128
    and idempotency_key = pg_catalog.btrim(idempotency_key)
    and pg_catalog.char_length(idempotency_key) between 1 and 200
  )
);

alter table public.app_customer_information_requests enable row level security;
alter table public.app_customer_information_responses enable row level security;
revoke all on table public.app_customer_information_requests from public;
revoke all on table public.app_customer_information_requests from anon;
revoke all on table public.app_customer_information_requests from authenticated;
revoke all on table public.app_customer_information_responses from public;
revoke all on table public.app_customer_information_responses from anon;
revoke all on table public.app_customer_information_responses from authenticated;

create function public.app_customer_information_request_mutation_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'customer information requests are not deletable'
      using errcode = '23514';
  end if;
  if old.terminal_action is not null
     or new.terminal_action is null
     or (
       pg_catalog.to_jsonb(new) - array[
         'terminal_action', 'terminal_at',
         'terminal_by_workforce_identity_id',
         'terminal_scope_assignment_id', 'terminal_policy_version_id',
         'terminal_payload_sha256', 'terminal_request_id',
         'terminal_idempotency_key'
       ]::text[]
     ) <> (
       pg_catalog.to_jsonb(old) - array[
         'terminal_action', 'terminal_at',
         'terminal_by_workforce_identity_id',
         'terminal_scope_assignment_id', 'terminal_policy_version_id',
         'terminal_payload_sha256', 'terminal_request_id',
         'terminal_idempotency_key'
       ]::text[]
     ) then
    raise exception 'customer information request mutation rejected'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_app_customer_information_requests_mutation
before update or delete on public.app_customer_information_requests
for each row execute function
  public.app_customer_information_request_mutation_guard_v1();

create function public.app_customer_information_response_immutable_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'customer information responses are immutable'
    using errcode = '23514';
end;
$$;

create trigger trg_app_customer_information_responses_immutable
before update or delete on public.app_customer_information_responses
for each row execute function
  public.app_customer_information_response_immutable_guard_v1();

create function public.app_customer_information_request_correction_guard_v1()
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
    raise exception 'customer information request active'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_app_customer_information_request_correction_guard
before insert on public.app_evidence_review_correction_handoffs
for each row execute function
  public.app_customer_information_request_correction_guard_v1();

create function public.app_customer_information_request_projection_v1(
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
    'answered_at', response.responded_at
  )
  from public.app_customer_information_requests information_request
  left join public.app_customer_information_responses response
    on response.information_request_id = information_request.id
  where information_request.id = p_information_request_id;
$$;

create function public.app_customer_information_request_case_supported_v1(
  p_case_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_cases case_row
    join public.app_customers customer_row
      on customer_row.id = case_row.customer_id
     and customer_row.status = 'active'
    where p_case_id is not null
      and case_row.id = p_case_id
      and (
        (
          case_row.source_class = 'signed_signup_intake'
          and exists (
            select 1
            from public.app_signup_promotions promotion
            where promotion.case_id = case_row.id
              and promotion.customer_id = case_row.customer_id
              and promotion.intake_id::text = case_row.source_ref
              and promotion.account_type = customer_row.customer_type
              and exists (
                select 1
                from public.app_case_lifecycle_events lifecycle
                where lifecycle.case_id = case_row.id
              )
          )
        )
        or (
          case_row.source_class = 'app_customer_dossier'
          and exists (
            select 1
            from public.app_customer_dossiers dossier
            where dossier.id::text = case_row.source_ref
              and dossier.customer_id = case_row.customer_id
              and dossier.account_type = customer_row.customer_type
              and dossier.minimized_at is null
              and dossier.status <> 'expired_minimized'
          )
        )
      )
  );
$$;

create function public.app_customer_information_request_customer_authorize_v1(
  p_auth_user_id uuid,
  p_case_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select identity_row.id
  from public.app_customer_identities identity_row
  where p_auth_user_id is not null
    and p_case_id is not null
    and identity_row.auth_user_id = p_auth_user_id
    and identity_row.status = 'active'
    and exists (
      select 1
      from auth.users auth_user
      where auth_user.id = p_auth_user_id
        and auth_user.deleted_at is null
        and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at)
          is not null
    )
    and 1 = (
      select pg_catalog.count(*)
      from public.app_customer_identities active_identity
      where active_identity.auth_user_id = p_auth_user_id
        and active_identity.status = 'active'
    )
    and not exists (
      select 1
      from public.app_customer_access_grants granted_context
      left join public.app_customers granted_customer
        on granted_customer.id = granted_context.customer_id
       and granted_customer.status = 'active'
      where granted_context.auth_user_id = p_auth_user_id
        and granted_customer.id is null
    )
    and exists (
      select 1
      from public.app_customer_access_grants identity_grant
      join public.app_customers identity_customer
        on identity_customer.id = identity_row.customer_id
       and identity_customer.status = 'active'
      where identity_grant.auth_user_id = p_auth_user_id
        and identity_grant.customer_id = identity_row.customer_id
    )
    and exists (
      select 1
      from public.app_cases case_row
      join public.app_customers target_customer
        on target_customer.id = case_row.customer_id
       and target_customer.status = 'active'
      join public.app_customer_access_grants target_grant
        on target_grant.auth_user_id = p_auth_user_id
       and target_grant.customer_id = case_row.customer_id
       and (
         target_grant.granted_case_id is null
         or target_grant.granted_case_id = case_row.id
       )
      where case_row.id = p_case_id
        and public.app_customer_information_request_case_supported_v1(
          case_row.id
        )
    );
$$;

create function public.app_customer_information_request_customer_read_v1(
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
    end
  );
end;
$$;

create function public.app_customer_information_request_workforce_read_v1(
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
    end
  );
end;
$$;

create function public.app_customer_information_request_create_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_question text,
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
  v_case public.app_cases%rowtype;
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_replay jsonb;
  v_request_id uuid := gen_random_uuid();
  v_request_ref text;
  v_response jsonb;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or p_question is null or p_question <> pg_catalog.btrim(p_question)
     or pg_catalog.char_length(p_question) not between 1 and 1000
     or p_question ~ '[[:cntrl:]]'
     or p_request_id is null or p_request_id <> pg_catalog.btrim(p_request_id)
     or pg_catalog.char_length(p_request_id) not between 1 and 128
     or p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_expires_at is null
     or p_idempotency_expires_at <= v_now then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  select case_row.* into v_case
  from public.app_cases case_row
  join public.app_customers customer_row
    on customer_row.id = case_row.customer_id
   and customer_row.status = 'active'
  where case_row.case_reference = p_case_ref;
  if not found or not public.app_customer_information_request_case_supported_v1(
    v_case.id
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'case_missing'
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer_case_action:v1:' || v_case.id::text, 0
  ));
  v_auth := public.app_customer_information_request_authorize_v1(
    p_auth_user_id, v_case.id, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  v_scope := 'customer_information_request_create:v1:case:' || v_case.id::text;
  v_replay := public.app_customer_information_request_idempotency_replay_v1(
    v_scope, p_idempotency_key, p_payload_sha256
  );
  if v_replay is not null then return v_replay; end if;

  if exists (
    select 1 from public.app_customer_information_requests existing
    where existing.case_id = v_case.id and existing.terminal_action is null
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'information_request_already_active'
    );
    return v_response;
  end if;
  if exists (
    select 1
    from public.app_evidence_review_correction_handoffs handoff
    where handoff.case_id = v_case.id
      and not exists (
        select 1
        from public.app_evidence_review_customer_submissions submission
        where submission.handoff_id = handoff.id
      )
      and not exists (
        select 1
        from public.app_evidence_review_correction_handoffs successor
        where successor.supersedes_handoff_id = handoff.id
      )
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'correction_handoff_active'
    );
    return v_response;
  end if;
  if not exists (
    select 1
    from public.app_customer_access_grants access_grant
    where access_grant.customer_id = v_case.customer_id
      and (
        access_grant.granted_case_id is null
        or access_grant.granted_case_id = v_case.id
      )
      and public.app_customer_information_request_customer_authorize_v1(
        access_grant.auth_user_id, v_case.id
      ) is not null
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'customer_context_unavailable'
    );
    return v_response;
  end if;

  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  select 'IRQ-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
    extensions.digest(
      'customer-information-request-v1|' || v_request_id::text || '|' ||
      v_case.id::text || '|' || v_case.customer_id::text,
      'sha256'
    ), 'hex'
  ), 1, 16)) into v_request_ref;

  insert into public.app_customer_information_requests (
    id, request_reference, case_id, target_customer_id, question_text,
    created_by_workforce_identity_id, created_by_scope_assignment_id,
    capability_code, authorization_policy_version_id, payload_sha256,
    request_id, idempotency_key, created_at
  ) values (
    v_request_id, v_request_ref, v_case.id, v_case.customer_id, p_question,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'customer.information_request.manage',
    (v_auth->>'policy_version_id')::uuid, p_payload_sha256,
    p_request_id, p_idempotency_key, v_now
  );

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, customer_id,
    request_id, idempotency_key, actor_type, actor_ref,
    event_data, authorization_policy_version_id, created_at
  ) values (
    'customer_information_request_created', 'case', v_case.id,
    v_case.customer_id, p_request_id, p_idempotency_key,
    'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object('request_ref', v_request_ref),
    (v_auth->>'policy_version_id')::uuid, v_now
  );

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'created',
    'request', public.app_customer_information_request_projection_v1(
      v_request_id
    )
  );
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
  );
exception
  when unique_violation or check_violation or foreign_key_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'information_request_conflict'
    );
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
  p_idempotency_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_case public.app_cases%rowtype;
  v_information_request public.app_customer_information_requests%rowtype;
  v_identity_id uuid;
  v_scope text;
  v_begin jsonb;
  v_replay jsonb;
  v_response jsonb;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or p_request_ref !~ '^IRQ-[0-9A-F]{16}$'
     or p_response is null or p_response <> pg_catalog.btrim(p_response)
     or pg_catalog.char_length(p_response) not between 1 and 1000
     or p_response ~ '[[:cntrl:]]'
     or p_request_id is null or p_request_id <> pg_catalog.btrim(p_request_id)
     or pg_catalog.char_length(p_request_id) not between 1 and 128
     or p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_expires_at is null
     or p_idempotency_expires_at <= v_now then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  if not exists (
    select 1 from auth.users auth_user
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
      'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer_case_action:v1:' || v_case.id::text, 0
  ));
  v_identity_id := public.app_customer_information_request_customer_authorize_v1(
    p_auth_user_id, v_case.id
  );
  if v_identity_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
    );
  end if;

  select information_request.* into v_information_request
  from public.app_customer_information_requests information_request
  where information_request.request_reference = p_request_ref
    and information_request.case_id = v_case.id
    and information_request.target_customer_id = v_case.customer_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
    );
  end if;

  v_scope := 'customer_information_request_respond:v1:' ||
    v_information_request.id::text;
  v_replay := public.app_customer_information_request_idempotency_replay_v1(
    v_scope, p_idempotency_key, p_payload_sha256
  );
  if v_replay is not null then return v_replay; end if;
  if v_information_request.terminal_action is not null
     or exists (
       select 1 from public.app_customer_information_responses existing
       where existing.information_request_id = v_information_request.id
     ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'information_request_not_answerable'
    );
    return v_response;
  end if;

  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'customer',
    'app_customer_identity:' || v_identity_id::text, p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  insert into public.app_customer_information_responses (
    information_request_id, case_id, customer_id, auth_user_id,
    customer_identity_id, response_text, payload_sha256,
    request_id, idempotency_key, responded_at
  ) values (
    v_information_request.id, v_case.id, v_case.customer_id, p_auth_user_id,
    v_identity_id, p_response, p_payload_sha256,
    p_request_id, p_idempotency_key, v_now
  );

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, customer_id,
    request_id, idempotency_key, actor_type, actor_ref,
    event_data, created_at
  ) values (
    'customer_information_request_answered', 'case', v_case.id,
    v_case.customer_id, p_request_id, p_idempotency_key,
    'customer', 'app_customer_identity:' || v_identity_id::text,
    pg_catalog.jsonb_build_object(
      'request_ref', v_information_request.request_reference
    ),
    v_now
  );

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'answered',
    'request', public.app_customer_information_request_projection_v1(
      v_information_request.id
    )
  );
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
  );
exception
  when unique_violation or check_violation or foreign_key_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'information_request_not_answerable'
    );
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
  p_idempotency_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_case public.app_cases%rowtype;
  v_information_request public.app_customer_information_requests%rowtype;
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_replay jsonb;
  v_response jsonb;
  v_has_response boolean;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or p_request_ref !~ '^IRQ-[0-9A-F]{16}$'
     or p_action not in ('WITHDRAW', 'RESOLVE')
     or p_request_id is null or p_request_id <> pg_catalog.btrim(p_request_id)
     or pg_catalog.char_length(p_request_id) not between 1 and 128
     or p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_expires_at is null
     or p_idempotency_expires_at <= v_now then
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer_case_action:v1:' || v_case.id::text, 0
  ));
  v_auth := public.app_customer_information_request_authorize_v1(
    p_auth_user_id, v_case.id, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  select information_request.* into v_information_request
  from public.app_customer_information_requests information_request
  where information_request.request_reference = p_request_ref
    and information_request.case_id = v_case.id
    and information_request.target_customer_id = v_case.customer_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404,
      'code', 'information_request_not_found_or_forbidden'
    );
  end if;

  v_scope := 'customer_information_request_transition:v1:' ||
    v_information_request.id::text || ':' || p_action;
  v_replay := public.app_customer_information_request_idempotency_replay_v1(
    v_scope, p_idempotency_key, p_payload_sha256
  );
  if v_replay is not null then return v_replay; end if;
  if v_information_request.terminal_action is not null then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'information_request_not_active'
    );
    return v_response;
  end if;
  select exists (
    select 1 from public.app_customer_information_responses response
    where response.information_request_id = v_information_request.id
  ) into v_has_response;
  if (p_action = 'WITHDRAW' and v_has_response)
     or (p_action = 'RESOLVE' and not v_has_response) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'information_request_transition_invalid'
    );
    return v_response;
  end if;

  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  update public.app_customer_information_requests
  set terminal_action = case p_action
        when 'WITHDRAW' then 'WITHDRAWN' else 'RESOLVED' end,
      terminal_at = v_now,
      terminal_by_workforce_identity_id =
        (v_auth->>'workforce_identity_id')::uuid,
      terminal_scope_assignment_id = (v_auth->>'scope_assignment_id')::uuid,
      terminal_policy_version_id = (v_auth->>'policy_version_id')::uuid,
      terminal_payload_sha256 = p_payload_sha256,
      terminal_request_id = p_request_id,
      terminal_idempotency_key = p_idempotency_key
  where id = v_information_request.id;

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, customer_id,
    request_id, idempotency_key, actor_type, actor_ref,
    event_data, authorization_policy_version_id, created_at
  ) values (
    case p_action when 'WITHDRAW'
      then 'customer_information_request_withdrawn'
      else 'customer_information_request_resolved' end,
    'case', v_case.id, v_case.customer_id,
    p_request_id, p_idempotency_key, 'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'request_ref', v_information_request.request_reference
    ),
    (v_auth->>'policy_version_id')::uuid, v_now
  );

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200,
    'code', case p_action when 'WITHDRAW' then 'withdrawn' else 'resolved' end,
    'request_ref', v_information_request.request_reference
  );
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
  );
exception
  when unique_violation or check_violation or foreign_key_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'information_request_transition_invalid'
    );
end;
$$;

revoke all on function public.app_customer_information_request_mutation_guard_v1()
  from public;
revoke all on function public.app_customer_information_response_immutable_guard_v1()
  from public;
revoke all on function public.app_customer_information_request_correction_guard_v1()
  from public;
revoke all on function public.app_customer_information_request_projection_v1(uuid)
  from public;
revoke all on function public.app_customer_information_request_case_supported_v1(uuid)
  from public;
revoke all on function public.app_customer_information_request_customer_authorize_v1(uuid, uuid)
  from public;
revoke all on function public.app_customer_information_request_authorize_v1(uuid, uuid, timestamptz)
  from public;
revoke all on function public.app_customer_information_request_idempotency_replay_v1(text, text, text)
  from public;

revoke execute on function public.app_customer_information_request_customer_read_v1(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.app_customer_information_request_workforce_read_v1(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.app_customer_information_request_create_v1(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.app_customer_information_request_respond_v1(uuid, text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.app_customer_information_request_transition_v1(uuid, text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.app_customer_information_request_customer_read_v1(uuid, text)
  to service_role;
grant execute on function public.app_customer_information_request_workforce_read_v1(uuid, text)
  to service_role;
grant execute on function public.app_customer_information_request_create_v1(uuid, text, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.app_customer_information_request_respond_v1(uuid, text, text, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.app_customer_information_request_transition_v1(uuid, text, text, text, text, text, text, timestamptz)
  to service_role;

comment on table public.app_customer_information_requests is
  'Case-scoped customer-visible text questions. Question and provenance are immutable; only one guarded withdraw-or-resolve transition is allowed.';
comment on table public.app_customer_information_responses is
  'One immutable customer text answer for an information request; no chat, attachment or evidence mutation semantics.';
comment on function public.app_customer_information_request_create_v1(uuid, text, text, text, text, text, timestamptz) is
  'Service-role-only idempotent workforce create boundary with exact case capability, customer reachability, and correction-handoff mutual exclusion.';
comment on function public.app_customer_information_request_respond_v1(uuid, text, text, text, text, text, text, timestamptz) is
  'Service-role-only idempotent one-answer customer boundary using confirmed Auth identity and exact R7 customer-wide or case-scoped access.';
comment on function public.app_customer_information_request_transition_v1(uuid, text, text, text, text, text, text, timestamptz) is
  'Service-role-only workforce withdraw-before-answer or resolve-after-answer boundary; it never changes case lifecycle or review truth.';
comment on function public.app_customer_information_request_authorize_v1(uuid, uuid, timestamptz) is
  'Internal authority predicate: the named information-request capability is usable only through the exact active evidence.review.correction.publish case scope.';
comment on function public.app_customer_information_request_customer_authorize_v1(uuid, uuid) is
  'Internal R7 predicate: confirmed Auth and one active identity lineage, all granted customer contexts active, a valid base identity grant, and an exact customer-wide or case-scoped target grant.';
comment on function public.app_customer_information_request_case_supported_v1(uuid) is
  'Internal application-index lineage predicate: exact active legacy dossier or exact signing-v3 promotion linkage only.';

commit;

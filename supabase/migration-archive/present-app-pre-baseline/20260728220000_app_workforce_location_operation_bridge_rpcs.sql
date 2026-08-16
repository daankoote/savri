-- ENVAL /app WP3N authorized workforce location callers.
--
-- TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
--
-- Exactly eight service-role-only bridge RPCs connect the empty WP3L
-- workforce authorization foundation to the four WP3J location writes.
-- No workforce bootstrap, population, assignment authority, browser grant,
-- generic dispatcher, new table, customer authority, or emergency override
-- is created here.

create function public.app_ops_location_authorization_resolve_v1(
  p_auth_user_id uuid,
  p_capability_code text,
  p_case_id uuid,
  p_location_id uuid,
  p_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_identity public.app_workforce_identities%rowtype;
  v_state text;
  v_capability public.app_workforce_capability_assignments%rowtype;
  v_scope public.app_workforce_scope_assignments%rowtype;
  v_relation public.app_case_location_relations%rowtype;
begin
  if p_auth_user_id is null
     or p_capability_code not in (
       'location.root.create',
       'location.observation.record',
       'location.version.accept.prepare',
       'location.version.accept.approve',
       'location.version.correct.prepare',
       'location.version.correct.approve'
     )
     or p_case_id is null
     or p_at is null
     or (
       p_capability_code = 'location.root.create'
       and p_location_id is not null
     )
     or (
       p_capability_code <> 'location.root.create'
       and p_location_id is null
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  select *
  into v_identity
  from public.app_workforce_identities
  where auth_user_id = p_auth_user_id;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'workforce_identity_missing'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_state:v1:' || v_identity.id::text,
      0
    )
  );

  select state_event.state
  into v_state
  from public.app_workforce_identity_states state_event
  where state_event.workforce_identity_id = v_identity.id
    and state_event.effective_at <= p_at
  order by state_event.effective_at desc, state_event.recorded_at desc
  limit 1;

  if v_state is distinct from 'active' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'workforce_identity_inactive'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_capability:v1:' ||
      v_identity.id::text || ':' || p_capability_code,
      0
    )
  );

  select capability_grant.*
  into v_capability
  from public.app_workforce_capability_assignments capability_grant
  where capability_grant.workforce_identity_id = v_identity.id
    and capability_grant.capability_code = p_capability_code
    and capability_grant.supersedes_assignment_event_id is null
    and capability_grant.event_type = 'granted'
    and capability_grant.effective_at <= p_at
    and (
      capability_grant.valid_until is null
      or p_at < capability_grant.valid_until
    )
    and not exists (
      select 1
      from public.app_workforce_capability_assignments capability_revoke
      where capability_revoke.assignment_id =
            capability_grant.assignment_id
        and capability_revoke.event_type = 'revoked'
        and capability_revoke.effective_at <= p_at
    )
  order by capability_grant.effective_at desc
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'capability_not_authorized'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_scope:v1:' ||
      v_identity.id::text || ':' || p_capability_code || ':' ||
      p_case_id::text || ':' ||
      coalesce(p_location_id::text, 'case'),
      0
    )
  );

  select scope_grant.*
  into v_scope
  from public.app_workforce_scope_assignments scope_grant
  where scope_grant.workforce_identity_id = v_identity.id
    and scope_grant.capability_assignment_id = v_capability.id
    and scope_grant.capability_code = p_capability_code
    and scope_grant.case_id = p_case_id
    and scope_grant.location_id is not distinct from p_location_id
    and scope_grant.supersedes_scope_event_id is null
    and scope_grant.event_type = 'granted'
    and scope_grant.effective_at <= p_at
    and (
      scope_grant.valid_until is null
      or p_at < scope_grant.valid_until
    )
    and not exists (
      select 1
      from public.app_workforce_scope_assignments scope_revoke
      where scope_revoke.scope_assignment_id =
            scope_grant.scope_assignment_id
        and scope_revoke.event_type = 'revoked'
        and scope_revoke.effective_at <= p_at
    )
  order by scope_grant.effective_at desc
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 403,
      'code', case
        when p_location_id is null then 'case_scope_denied'
        else 'location_scope_denied'
      end
    );
  end if;

  if p_location_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'case_location:v1:' ||
        p_case_id::text || ':' || p_location_id::text,
        0
      )
    );

    select relation_link.*
    into v_relation
    from public.app_case_location_relations relation_link
    where relation_link.id = v_scope.case_location_relation_id
      and relation_link.case_id = p_case_id
      and relation_link.location_id = p_location_id
      and relation_link.supersedes_relation_event_id is null
      and relation_link.event_type = 'linked'
      and relation_link.effective_at <= p_at
      and (
        relation_link.valid_until is null
        or p_at < relation_link.valid_until
      )
      and not exists (
        select 1
        from public.app_case_location_relations relation_unlink
        where relation_unlink.relation_id = relation_link.relation_id
          and relation_unlink.event_type = 'unlinked'
          and relation_unlink.effective_at <= p_at
      );

    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 403,
        'code', 'case_location_relation_missing'
      );
    end if;
  end if;

  if not public.app_workforce_scope_is_authorized_v1(
    v_identity.id,
    v_scope.id,
    p_capability_code,
    p_case_id,
    p_location_id,
    p_at
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'authorization_changed'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'workforce_identity_id', v_identity.id,
    'actor_ref', v_identity.workforce_ref,
    'capability_assignment_id', v_capability.id,
    'scope_assignment_id', v_scope.id,
    'case_location_relation_id', v_scope.case_location_relation_id
  );
end;
$$;

create function public.app_ops_location_root_create_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_case_id uuid;
  v_creation_basis text;
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_wp3j jsonb;
  v_location_id uuid;
  v_relation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or p_payload - array['case_id', 'creation_basis'] <> '{}'::jsonb
     or p_request_id is null
     or pg_catalog.char_length(p_request_id) not between 1 and 96 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  v_case_id := (p_payload->>'case_id')::uuid;
  v_creation_basis := p_payload->>'creation_basis';
  v_auth := public.app_ops_location_authorization_resolve_v1(
    p_auth_user_id, 'location.root.create', v_case_id, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  v_scope := 'ops_location_root_create:workforce:' ||
    (v_auth->>'workforce_identity_id') || ':case:' || v_case_id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_hash, p_idempotency_expires_at,
    'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  v_wp3j := public.app_create_location_root_v1(
    v_creation_basis, 'worker', v_auth->>'actor_ref', p_request_id,
    p_idempotency_key, p_payload_hash, p_idempotency_expires_at
  );

  if v_wp3j->>'ok' <> 'true' then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', case
        when v_wp3j->>'code' in (
          'idempotency_conflict', 'concurrent_write_conflict'
        ) then 409 else 422
      end,
      'code', case
        when v_wp3j->>'code' in (
          'idempotency_conflict', 'concurrent_write_conflict'
        ) then v_wp3j->>'code' else 'location_business_rejected'
      end
    );
    return public.app_location_write_complete_v1(
      v_scope, p_idempotency_key, 'ops_location_root_create_rejected',
      null, p_request_id, 'worker', v_auth->>'actor_ref',
      pg_catalog.jsonb_build_object(
        'caller', 'api-app-ops-location-root-create',
        'action', 'execute',
        'capability', 'location.root.create',
        'case_id', v_case_id,
        'authorization_outcome', 'authorized',
        'business_outcome', 'rejected'
      ),
      v_response
    );
  end if;

  if v_wp3j->>'operation' <> 'create_location_root'
     or (v_wp3j->>'status')::integer <> 201
     or v_wp3j->>'location_id' is null then
    raise exception 'invalid bounded WP3J root response';
  end if;
  v_location_id := (v_wp3j->>'location_id')::uuid;

  insert into public.app_case_location_relations (
    id, relation_id, case_id, location_id, event_type, effective_at,
    recorded_at, decision_ref, reason_ref, recorded_by_actor_ref,
    request_id, supersedes_relation_event_id
  ) values (
    gen_random_uuid(), v_relation_id, v_case_id, v_location_id, 'linked',
    v_now, v_now, p_request_id, null, v_auth->>'actor_ref',
    p_request_id || ':relation', null
  );

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'operation', 'root_create', 'case_id', v_case_id,
    'location_id', v_location_id, 'relation_id', v_relation_id
  );
  return public.app_location_write_complete_v1(
    v_scope, p_idempotency_key, 'ops_location_root_created',
    v_location_id, p_request_id, 'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'caller', 'api-app-ops-location-root-create',
      'action', 'execute',
      'capability', 'location.root.create',
      'case_id', v_case_id,
      'location_id', v_location_id,
      'case_location_relation_id', v_relation_id,
      'authorization_outcome', 'authorized',
      'business_outcome', 'ok'
    ),
    v_response
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

create function public.app_ops_location_observation_record_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_case_id uuid;
  v_location_id uuid;
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_wp3j jsonb;
  v_response jsonb;
begin
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or p_payload - array[
       'case_id', 'location_id', 'observation_kind', 'descriptor_kind',
       'observed_at', 'source_ref_sha256', 'source_payload_sha256',
       'source_retrieved_at', 'fresh_until', 'country_code', 'postal_code',
       'house_number', 'house_number_addition', 'street', 'city',
       'site_reference'
     ] <> '{}'::jsonb then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_case_id := (p_payload->>'case_id')::uuid;
  v_location_id := (p_payload->>'location_id')::uuid;
  v_auth := public.app_ops_location_authorization_resolve_v1(
    p_auth_user_id, 'location.observation.record',
    v_case_id, v_location_id, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  v_scope := 'ops_location_observation_record:workforce:' ||
    (v_auth->>'workforce_identity_id') || ':case:' || v_case_id::text ||
    ':location:' || v_location_id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_hash, p_idempotency_expires_at,
    'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  v_wp3j := public.app_record_location_observation_v1(
    v_location_id,
    p_payload->>'observation_kind',
    p_payload->>'descriptor_kind',
    (p_payload->>'observed_at')::timestamptz,
    nullif(p_payload->>'source_ref_sha256', ''),
    nullif(p_payload->>'source_payload_sha256', ''),
    nullif(p_payload->>'source_retrieved_at', '')::timestamptz,
    nullif(p_payload->>'fresh_until', '')::timestamptz,
    p_payload->>'country_code',
    nullif(p_payload->>'postal_code', ''),
    nullif(p_payload->>'house_number', '')::integer,
    nullif(p_payload->>'house_number_addition', ''),
    nullif(p_payload->>'street', ''),
    nullif(p_payload->>'city', ''),
    nullif(p_payload->>'site_reference', ''),
    'worker', v_auth->>'actor_ref', p_request_id,
    p_idempotency_key, p_payload_hash, p_idempotency_expires_at
  );

  if v_wp3j->>'ok' <> 'true' then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', case
        when v_wp3j->>'code' in (
          'idempotency_conflict', 'concurrent_write_conflict'
        ) then 409 else 422
      end,
      'code', case
        when v_wp3j->>'code' in (
          'idempotency_conflict', 'concurrent_write_conflict'
        ) then v_wp3j->>'code' else 'location_business_rejected'
      end
    );
    return public.app_location_write_complete_v1(
      v_scope, p_idempotency_key, 'ops_location_observation_rejected',
      v_location_id, p_request_id, 'worker', v_auth->>'actor_ref',
      pg_catalog.jsonb_build_object(
        'caller', 'api-app-ops-location-observation-record',
        'action', 'execute',
        'capability', 'location.observation.record',
        'case_id', v_case_id,
        'location_id', v_location_id,
        'authorization_outcome', 'authorized',
        'business_outcome', 'rejected'
      ),
      v_response
    );
  end if;

  if v_wp3j->>'operation' <> 'record_location_observation'
     or (v_wp3j->>'status')::integer <> 201
     or v_wp3j->>'location_id' <> v_location_id::text
     or v_wp3j->>'observation_id' is null then
    raise exception 'invalid bounded WP3J observation response';
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'operation', 'observation_record',
    'case_id', v_case_id, 'location_id', v_location_id,
    'observation_id', v_wp3j->>'observation_id'
  );
  return public.app_location_write_complete_v1(
    v_scope, p_idempotency_key, 'ops_location_observation_recorded',
    v_location_id, p_request_id, 'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'caller', 'api-app-ops-location-observation-record',
      'action', 'execute',
      'capability', 'location.observation.record',
      'case_id', v_case_id,
      'location_id', v_location_id,
      'observation_id', v_wp3j->>'observation_id',
      'authorization_outcome', 'authorized',
      'business_outcome', 'ok'
    ),
    v_response
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

create function public.app_ops_location_accept_prepare_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_case_id uuid := (p_payload->>'case_id')::uuid;
  v_location_id uuid := (p_payload->>'location_id')::uuid;
  v_observation_id uuid := (p_payload->>'observation_id')::uuid;
  v_operation_hash text := p_payload->>'operation_payload_hash';
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_operation_request_id uuid;
  v_response jsonb;
begin
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or v_operation_hash !~ '^[0-9a-f]{64}$'
     or not exists (
       select 1 from public.app_location_address_observations
       where id = v_observation_id and location_id = v_location_id
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_auth := public.app_ops_location_authorization_resolve_v1(
    p_auth_user_id, 'location.version.accept.prepare',
    v_case_id, v_location_id, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  v_scope := 'ops_location_accept_prepare:workforce:' ||
    (v_auth->>'workforce_identity_id') || ':case:' || v_case_id::text ||
    ':location:' || v_location_id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_hash, p_idempotency_expires_at,
    'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  insert into public.app_workforce_operation_requests (
    operation_type, case_id, location_id, observation_id,
    predecessor_version_id, maker_workforce_identity_id,
    maker_scope_assignment_id, maker_capability_code, payload_hash,
    payload_contract_version, request_id, idempotency_key
  ) values (
    'initial_location_acceptance', v_case_id, v_location_id,
    v_observation_id, null,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'location.version.accept.prepare', v_operation_hash,
    'location_acceptance_v1', p_request_id, p_idempotency_key
  ) returning id into v_operation_request_id;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'operation', 'accept_prepare',
    'operation_request_id', v_operation_request_id,
    'payload_hash', v_operation_hash
  );
  return public.app_location_write_complete_v1(
    v_scope, p_idempotency_key, 'ops_location_accept_prepared',
    v_location_id, p_request_id, 'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'caller', 'api-app-ops-location-version-accept',
      'action', 'prepare',
      'capability', 'location.version.accept.prepare',
      'case_id', v_case_id, 'location_id', v_location_id,
      'operation_request_id', v_operation_request_id,
      'authorization_outcome', 'authorized',
      'business_outcome', 'pending'
    ),
    v_response
  );
exception when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'idempotency_conflict'
  );
when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

create function public.app_ops_location_accept_review_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_operation_request_id uuid := (p_payload->>'operation_request_id')::uuid;
  v_request public.app_workforce_operation_requests%rowtype;
  v_outcome text := p_payload->>'outcome';
  v_reviewed_hash text := p_payload->>'reviewed_payload_hash';
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_review_id uuid;
  v_response jsonb;
begin
  select * into v_request
  from public.app_workforce_operation_requests
  where id = v_operation_request_id
    and operation_type = 'initial_location_acceptance'
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'operation_request_missing'
    );
  end if;
  if v_request.execution_status <> 'pending' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'operation_request_not_pending'
    );
  end if;

  v_auth := public.app_ops_location_authorization_resolve_v1(
    p_auth_user_id, 'location.version.accept.approve',
    v_request.case_id, v_request.location_id, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  if (v_auth->>'workforce_identity_id')::uuid =
       v_request.maker_workforce_identity_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'self_approval_forbidden'
    );
  end if;
  if v_reviewed_hash is distinct from v_request.payload_hash then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'payload_hash_mismatch'
    );
  end if;
  if v_outcome not in ('approved', 'rejected') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  v_scope := 'ops_location_accept_review:workforce:' ||
    (v_auth->>'workforce_identity_id') || ':request:' ||
    v_operation_request_id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_hash, p_idempotency_expires_at,
    'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  insert into public.app_workforce_operation_reviews (
    operation_request_id, outcome, reviewed_payload_hash,
    checker_workforce_identity_id, checker_scope_assignment_id,
    checker_capability_code, reviewed_at, decision_ref, reason_ref,
    request_id, idempotency_key
  ) values (
    v_operation_request_id, v_outcome, v_reviewed_hash,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'location.version.accept.approve', v_now,
    p_payload->>'decision_ref',
    case when v_outcome = 'rejected' then p_payload->>'reason_ref' else null end,
    p_request_id, p_idempotency_key
  ) returning id into v_review_id;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'operation', 'accept_review',
    'operation_request_id', v_operation_request_id,
    'review_id', v_review_id, 'outcome', v_outcome
  );
  return public.app_location_write_complete_v1(
    v_scope, p_idempotency_key, 'ops_location_accept_reviewed',
    v_request.location_id, p_request_id, 'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'caller', 'api-app-ops-location-version-accept',
      'action', 'review',
      'capability', 'location.version.accept.approve',
      'case_id', v_request.case_id,
      'location_id', v_request.location_id,
      'operation_request_id', v_operation_request_id,
      'review_id', v_review_id,
      'authorization_outcome', 'authorized',
      'business_outcome', v_outcome
    ),
    v_response
  );
exception when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
  );
when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

create function public.app_ops_location_accept_execute_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_operation_request_id uuid := (p_payload->>'operation_request_id')::uuid;
  v_request public.app_workforce_operation_requests%rowtype;
  v_review public.app_workforce_operation_reviews%rowtype;
  v_maker_auth_user_id uuid;
  v_maker_actor_ref text;
  v_checker_auth_user_id uuid;
  v_maker jsonb;
  v_checker jsonb;
  v_scope text;
  v_begin jsonb;
  v_wp3j jsonb;
  v_response jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'location_operation:v1:' || v_operation_request_id::text, 0
    )
  );
  select * into v_request
  from public.app_workforce_operation_requests
  where id = v_operation_request_id
    and operation_type = 'initial_location_acceptance'
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'operation_request_missing'
    );
  end if;

  select auth_user_id, workforce_ref
  into v_maker_auth_user_id, v_maker_actor_ref
  from public.app_workforce_identities
  where id = v_request.maker_workforce_identity_id;
  if p_auth_user_id is distinct from v_maker_auth_user_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'four_eyes_required'
    );
  end if;
  v_scope := 'ops_location_accept_execute:workforce:' ||
    v_request.maker_workforce_identity_id::text || ':request:' ||
    v_operation_request_id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_hash, p_idempotency_expires_at,
    'worker', v_maker_actor_ref, p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  if v_request.execution_status = 'executed' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'operation_already_executed'
    );
  end if;
  if p_payload->>'operation_payload_hash' is distinct from
       v_request.payload_hash then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'payload_hash_mismatch'
    );
  end if;

  select * into v_review
  from public.app_workforce_operation_reviews
  where operation_request_id = v_operation_request_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'operation_review_missing'
    );
  end if;
  if v_review.outcome <> 'approved' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'operation_not_approved'
    );
  end if;
  if v_review.reviewed_payload_hash <> v_request.payload_hash then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'payload_hash_mismatch'
    );
  end if;

  select auth_user_id into v_checker_auth_user_id
  from public.app_workforce_identities
  where id = v_review.checker_workforce_identity_id;

  if v_request.maker_workforce_identity_id::text <
       v_review.checker_workforce_identity_id::text then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'workforce_state:v1:' ||
        v_request.maker_workforce_identity_id::text, 0
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'workforce_state:v1:' ||
        v_review.checker_workforce_identity_id::text, 0
      )
    );
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'workforce_state:v1:' ||
        v_review.checker_workforce_identity_id::text, 0
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'workforce_state:v1:' ||
        v_request.maker_workforce_identity_id::text, 0
      )
    );
  end if;

  v_maker := public.app_ops_location_authorization_resolve_v1(
    v_maker_auth_user_id, 'location.version.accept.prepare',
    v_request.case_id, v_request.location_id, v_now
  );
  v_checker := public.app_ops_location_authorization_resolve_v1(
    v_checker_auth_user_id, 'location.version.accept.approve',
    v_request.case_id, v_request.location_id, v_now
  );
  if v_maker->>'ok' <> 'true' or v_checker->>'ok' <> 'true' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'authorization_changed'
    );
  end if;
  if (v_maker->>'scope_assignment_id')::uuid <>
       v_request.maker_scope_assignment_id
     or (v_checker->>'scope_assignment_id')::uuid <>
       v_review.checker_scope_assignment_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'authorization_changed'
    );
  end if;

  v_wp3j := public.app_accept_initial_location_version_v1(
    v_request.location_id, v_request.observation_id,
    (p_payload->>'valid_from')::timestamptz,
    nullif(p_payload->>'valid_to', '')::timestamptz,
    (p_payload->>'accepted_at')::timestamptz,
    p_payload->>'acceptance_decision_ref',
    'worker', v_maker->>'actor_ref', p_request_id,
    p_idempotency_key, p_payload_hash, p_idempotency_expires_at
  );
  if v_wp3j->>'ok' <> 'true' then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', case
        when v_wp3j->>'code' in (
          'idempotency_conflict', 'concurrent_write_conflict'
        ) then 409 else 422
      end,
      'code', case
        when v_wp3j->>'code' in (
          'idempotency_conflict', 'concurrent_write_conflict'
        ) then v_wp3j->>'code' else 'location_business_rejected'
      end
    );
    return public.app_location_write_complete_v1(
      v_scope, p_idempotency_key, 'ops_location_accept_rejected',
      v_request.location_id, p_request_id, 'worker',
      v_maker->>'actor_ref',
      pg_catalog.jsonb_build_object(
        'caller', 'api-app-ops-location-version-accept',
        'action', 'execute',
        'capability', 'location.version.accept.prepare',
        'case_id', v_request.case_id,
        'location_id', v_request.location_id,
        'operation_request_id', v_operation_request_id,
        'review_id', v_review.id,
        'authorization_outcome', 'authorized',
        'business_outcome', 'rejected'
      ),
      v_response
    );
  end if;

  if v_wp3j->>'operation' <> 'accept_initial_location_version'
     or (v_wp3j->>'status')::integer <> 201
     or v_wp3j->>'location_id' <> v_request.location_id::text
     or v_wp3j->>'observation_id' <> v_request.observation_id::text
     or v_wp3j->>'version_id' is null
     or v_wp3j->>'acceptance_decision_ref' <>
          p_payload->>'acceptance_decision_ref' then
    raise exception 'invalid bounded WP3J acceptance response';
  end if;

  update public.app_workforce_operation_requests
  set execution_status = 'executed',
      executed_at = v_now,
      execution_request_id = p_request_id,
      wp3j_rpc_name = 'app_accept_initial_location_version_v1',
      wp3j_result_code = 'ok',
      wp3j_result_ref = v_wp3j->>'version_id'
  where id = v_operation_request_id
    and execution_status = 'pending';
  if not found then
    raise exception 'acceptance execution transition failed';
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'operation', 'accept_execute',
    'operation_request_id', v_operation_request_id,
    'version_id', v_wp3j->>'version_id'
  );
  return public.app_location_write_complete_v1(
    v_scope, p_idempotency_key, 'ops_location_accept_executed',
    v_request.location_id, p_request_id, 'worker',
    v_maker->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'caller', 'api-app-ops-location-version-accept',
      'action', 'execute',
      'capability', 'location.version.accept.prepare',
      'case_id', v_request.case_id,
      'location_id', v_request.location_id,
      'operation_request_id', v_operation_request_id,
      'review_id', v_review.id,
      'wp3j_result_ref', v_wp3j->>'version_id',
      'authorization_outcome', 'authorized',
      'business_outcome', 'ok'
    ),
    v_response
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

create function public.app_ops_location_correct_prepare_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_case_id uuid := (p_payload->>'case_id')::uuid;
  v_location_id uuid := (p_payload->>'location_id')::uuid;
  v_observation_id uuid := (p_payload->>'observation_id')::uuid;
  v_predecessor_id uuid := (p_payload->>'predecessor_version_id')::uuid;
  v_operation_hash text := p_payload->>'operation_payload_hash';
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_operation_request_id uuid;
  v_response jsonb;
begin
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or v_operation_hash !~ '^[0-9a-f]{64}$'
     or not exists (
       select 1 from public.app_location_address_observations
       where id = v_observation_id and location_id = v_location_id
     )
     or not exists (
       select 1 from public.app_location_versions
       where id = v_predecessor_id and location_id = v_location_id
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_auth := public.app_ops_location_authorization_resolve_v1(
    p_auth_user_id, 'location.version.correct.prepare',
    v_case_id, v_location_id, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  v_scope := 'ops_location_correct_prepare:workforce:' ||
    (v_auth->>'workforce_identity_id') || ':case:' || v_case_id::text ||
    ':location:' || v_location_id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_hash, p_idempotency_expires_at,
    'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  insert into public.app_workforce_operation_requests (
    operation_type, case_id, location_id, observation_id,
    predecessor_version_id, maker_workforce_identity_id,
    maker_scope_assignment_id, maker_capability_code, payload_hash,
    payload_contract_version, request_id, idempotency_key
  ) values (
    'location_correction', v_case_id, v_location_id,
    v_observation_id, v_predecessor_id,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'location.version.correct.prepare', v_operation_hash,
    'location_correction_v1', p_request_id, p_idempotency_key
  ) returning id into v_operation_request_id;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'operation', 'correct_prepare',
    'operation_request_id', v_operation_request_id,
    'payload_hash', v_operation_hash
  );
  return public.app_location_write_complete_v1(
    v_scope, p_idempotency_key, 'ops_location_correct_prepared',
    v_location_id, p_request_id, 'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'caller', 'api-app-ops-location-version-correct',
      'action', 'prepare',
      'capability', 'location.version.correct.prepare',
      'case_id', v_case_id, 'location_id', v_location_id,
      'operation_request_id', v_operation_request_id,
      'authorization_outcome', 'authorized',
      'business_outcome', 'pending'
    ),
    v_response
  );
exception when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'idempotency_conflict'
  );
when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

create function public.app_ops_location_correct_review_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_operation_request_id uuid := (p_payload->>'operation_request_id')::uuid;
  v_request public.app_workforce_operation_requests%rowtype;
  v_outcome text := p_payload->>'outcome';
  v_reviewed_hash text := p_payload->>'reviewed_payload_hash';
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_review_id uuid;
  v_response jsonb;
begin
  select * into v_request
  from public.app_workforce_operation_requests
  where id = v_operation_request_id
    and operation_type = 'location_correction'
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'operation_request_missing'
    );
  end if;
  if v_request.execution_status <> 'pending' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'operation_request_not_pending'
    );
  end if;

  v_auth := public.app_ops_location_authorization_resolve_v1(
    p_auth_user_id, 'location.version.correct.approve',
    v_request.case_id, v_request.location_id, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  if (v_auth->>'workforce_identity_id')::uuid =
       v_request.maker_workforce_identity_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'self_approval_forbidden'
    );
  end if;
  if v_reviewed_hash is distinct from v_request.payload_hash then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'payload_hash_mismatch'
    );
  end if;
  if v_outcome not in ('approved', 'rejected') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  v_scope := 'ops_location_correct_review:workforce:' ||
    (v_auth->>'workforce_identity_id') || ':request:' ||
    v_operation_request_id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_hash, p_idempotency_expires_at,
    'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  insert into public.app_workforce_operation_reviews (
    operation_request_id, outcome, reviewed_payload_hash,
    checker_workforce_identity_id, checker_scope_assignment_id,
    checker_capability_code, reviewed_at, decision_ref, reason_ref,
    request_id, idempotency_key
  ) values (
    v_operation_request_id, v_outcome, v_reviewed_hash,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'location.version.correct.approve', v_now,
    p_payload->>'decision_ref',
    case when v_outcome = 'rejected' then p_payload->>'reason_ref' else null end,
    p_request_id, p_idempotency_key
  ) returning id into v_review_id;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'operation', 'correct_review',
    'operation_request_id', v_operation_request_id,
    'review_id', v_review_id, 'outcome', v_outcome
  );
  return public.app_location_write_complete_v1(
    v_scope, p_idempotency_key, 'ops_location_correct_reviewed',
    v_request.location_id, p_request_id, 'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'caller', 'api-app-ops-location-version-correct',
      'action', 'review',
      'capability', 'location.version.correct.approve',
      'case_id', v_request.case_id,
      'location_id', v_request.location_id,
      'operation_request_id', v_operation_request_id,
      'review_id', v_review_id,
      'authorization_outcome', 'authorized',
      'business_outcome', v_outcome
    ),
    v_response
  );
exception when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
  );
when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

create function public.app_ops_location_correct_execute_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_operation_request_id uuid := (p_payload->>'operation_request_id')::uuid;
  v_request public.app_workforce_operation_requests%rowtype;
  v_review public.app_workforce_operation_reviews%rowtype;
  v_maker_auth_user_id uuid;
  v_maker_actor_ref text;
  v_checker_auth_user_id uuid;
  v_maker jsonb;
  v_checker jsonb;
  v_scope text;
  v_begin jsonb;
  v_wp3j jsonb;
  v_response jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'location_operation:v1:' || v_operation_request_id::text, 0
    )
  );
  select * into v_request
  from public.app_workforce_operation_requests
  where id = v_operation_request_id
    and operation_type = 'location_correction'
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'operation_request_missing'
    );
  end if;

  select auth_user_id, workforce_ref
  into v_maker_auth_user_id, v_maker_actor_ref
  from public.app_workforce_identities
  where id = v_request.maker_workforce_identity_id;
  if p_auth_user_id is distinct from v_maker_auth_user_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'four_eyes_required'
    );
  end if;
  v_scope := 'ops_location_correct_execute:workforce:' ||
    v_request.maker_workforce_identity_id::text || ':request:' ||
    v_operation_request_id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_hash, p_idempotency_expires_at,
    'worker', v_maker_actor_ref, p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  if v_request.execution_status = 'executed' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'operation_already_executed'
    );
  end if;
  if p_payload->>'operation_payload_hash' is distinct from
       v_request.payload_hash then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'payload_hash_mismatch'
    );
  end if;

  select * into v_review
  from public.app_workforce_operation_reviews
  where operation_request_id = v_operation_request_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'operation_review_missing'
    );
  end if;
  if v_review.outcome <> 'approved' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'operation_not_approved'
    );
  end if;

  select auth_user_id into v_checker_auth_user_id
  from public.app_workforce_identities
  where id = v_review.checker_workforce_identity_id;
  if v_request.maker_workforce_identity_id::text <
       v_review.checker_workforce_identity_id::text then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'workforce_state:v1:' ||
        v_request.maker_workforce_identity_id::text, 0
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'workforce_state:v1:' ||
        v_review.checker_workforce_identity_id::text, 0
      )
    );
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'workforce_state:v1:' ||
        v_review.checker_workforce_identity_id::text, 0
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'workforce_state:v1:' ||
        v_request.maker_workforce_identity_id::text, 0
      )
    );
  end if;

  v_maker := public.app_ops_location_authorization_resolve_v1(
    v_maker_auth_user_id, 'location.version.correct.prepare',
    v_request.case_id, v_request.location_id, v_now
  );
  v_checker := public.app_ops_location_authorization_resolve_v1(
    v_checker_auth_user_id, 'location.version.correct.approve',
    v_request.case_id, v_request.location_id, v_now
  );
  if v_maker->>'ok' <> 'true' or v_checker->>'ok' <> 'true' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'authorization_changed'
    );
  end if;
  if (v_maker->>'scope_assignment_id')::uuid <>
       v_request.maker_scope_assignment_id
     or (v_checker->>'scope_assignment_id')::uuid <>
       v_review.checker_scope_assignment_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'authorization_changed'
    );
  end if;

  v_wp3j := public.app_correct_location_version_v1(
    v_request.location_id, v_request.observation_id,
    v_request.predecessor_version_id,
    (p_payload->>'valid_from')::timestamptz,
    nullif(p_payload->>'valid_to', '')::timestamptz,
    (p_payload->>'accepted_at')::timestamptz,
    p_payload->>'acceptance_decision_ref',
    p_payload->>'correction_reason',
    'worker', v_maker->>'actor_ref', p_request_id,
    p_idempotency_key, p_payload_hash, p_idempotency_expires_at
  );
  if v_wp3j->>'ok' <> 'true' then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', case
        when v_wp3j->>'code' in (
          'idempotency_conflict', 'concurrent_write_conflict'
        ) then 409 else 422
      end,
      'code', case
        when v_wp3j->>'code' in (
          'idempotency_conflict', 'concurrent_write_conflict'
        ) then v_wp3j->>'code' else 'location_business_rejected'
      end
    );
    return public.app_location_write_complete_v1(
      v_scope, p_idempotency_key, 'ops_location_correct_rejected',
      v_request.location_id, p_request_id, 'worker',
      v_maker->>'actor_ref',
      pg_catalog.jsonb_build_object(
        'caller', 'api-app-ops-location-version-correct',
        'action', 'execute',
        'capability', 'location.version.correct.prepare',
        'case_id', v_request.case_id,
        'location_id', v_request.location_id,
        'operation_request_id', v_operation_request_id,
        'review_id', v_review.id,
        'authorization_outcome', 'authorized',
        'business_outcome', 'rejected'
      ),
      v_response
    );
  end if;

  if v_wp3j->>'operation' <> 'correct_location_version'
     or (v_wp3j->>'status')::integer <> 201
     or v_wp3j->>'location_id' <> v_request.location_id::text
     or v_wp3j->>'observation_id' <> v_request.observation_id::text
     or v_wp3j->>'predecessor_version_id' <>
          v_request.predecessor_version_id::text
     or v_wp3j->>'version_id' is null
     or v_wp3j->>'acceptance_decision_ref' <>
          p_payload->>'acceptance_decision_ref' then
    raise exception 'invalid bounded WP3J correction response';
  end if;

  update public.app_workforce_operation_requests
  set execution_status = 'executed',
      executed_at = v_now,
      execution_request_id = p_request_id,
      wp3j_rpc_name = 'app_correct_location_version_v1',
      wp3j_result_code = 'ok',
      wp3j_result_ref = v_wp3j->>'version_id'
  where id = v_operation_request_id
    and execution_status = 'pending';
  if not found then
    raise exception 'correction execution transition failed';
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'operation', 'correct_execute',
    'operation_request_id', v_operation_request_id,
    'version_id', v_wp3j->>'version_id'
  );
  return public.app_location_write_complete_v1(
    v_scope, p_idempotency_key, 'ops_location_correct_executed',
    v_request.location_id, p_request_id, 'worker',
    v_maker->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'caller', 'api-app-ops-location-version-correct',
      'action', 'execute',
      'capability', 'location.version.correct.prepare',
      'case_id', v_request.case_id,
      'location_id', v_request.location_id,
      'operation_request_id', v_operation_request_id,
      'review_id', v_review.id,
      'wp3j_result_ref', v_wp3j->>'version_id',
      'authorization_outcome', 'authorized',
      'business_outcome', 'ok'
    ),
    v_response
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

comment on function public.app_ops_location_authorization_resolve_v1(
  uuid, text, uuid, uuid, timestamptz
) is
  'Private Auth-to-workforce resolver. Database-authoritative active identity, exact capability, exact case/location scope and relation only.';

comment on function public.app_ops_location_root_create_v1(
  uuid, text, text, text, timestamptz, jsonb
) is 'Authorized atomic location root and first case/location relation.';
comment on function public.app_ops_location_observation_record_v1(
  uuid, text, text, text, timestamptz, jsonb
) is 'Authorized immutable non-accepting location observation.';
comment on function public.app_ops_location_accept_prepare_v1(
  uuid, text, text, text, timestamptz, jsonb
) is 'Authorized immutable initial-acceptance maker request; no WP3J call.';
comment on function public.app_ops_location_accept_review_v1(
  uuid, text, text, text, timestamptz, jsonb
) is 'Authorized distinct-checker initial-acceptance review; no WP3J call.';
comment on function public.app_ops_location_accept_execute_v1(
  uuid, text, text, text, timestamptz, jsonb
) is 'Atomic approved initial-acceptance execution and WP3L result marking.';
comment on function public.app_ops_location_correct_prepare_v1(
  uuid, text, text, text, timestamptz, jsonb
) is 'Authorized immutable correction maker request; no WP3J call.';
comment on function public.app_ops_location_correct_review_v1(
  uuid, text, text, text, timestamptz, jsonb
) is 'Authorized distinct-checker correction review; no WP3J call.';
comment on function public.app_ops_location_correct_execute_v1(
  uuid, text, text, text, timestamptz, jsonb
) is 'Atomic approved immutable correction execution and WP3L result marking.';

revoke all on function public.app_ops_location_authorization_resolve_v1(
  uuid, text, uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.app_ops_location_root_create_v1(
  uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_ops_location_observation_record_v1(
  uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_ops_location_accept_prepare_v1(
  uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_ops_location_accept_review_v1(
  uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_ops_location_accept_execute_v1(
  uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_ops_location_correct_prepare_v1(
  uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_ops_location_correct_review_v1(
  uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_ops_location_correct_execute_v1(
  uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.app_ops_location_root_create_v1(
  uuid, text, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.app_ops_location_observation_record_v1(
  uuid, text, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.app_ops_location_accept_prepare_v1(
  uuid, text, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.app_ops_location_accept_review_v1(
  uuid, text, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.app_ops_location_accept_execute_v1(
  uuid, text, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.app_ops_location_correct_prepare_v1(
  uuid, text, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.app_ops_location_correct_review_v1(
  uuid, text, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.app_ops_location_correct_execute_v1(
  uuid, text, text, text, timestamptz, jsonb
) to service_role;

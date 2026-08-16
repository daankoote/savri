-- ENVAL /app WP3J bounded operational location writes.
--
-- TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
--
-- This migration adds a service_role-only operational write boundary for:
-- - one immutable location root;
-- - one immutable, non-accepting observation;
-- - one separately accepted initial version;
-- - one immutable same-root correction successor.
--
-- Observed data is not accepted truth. Acceptance requires a separate,
-- authorized server action. Internal acceptance is not NEa or verifier
-- acceptance, and this migration does not prove caller authorization.
-- Population, projection, caller cutover, and retirement are not implemented.
-- The existing app_idempotency_keys expiry and cleanup boundary is unchanged:
-- callers provide expires_at, this migration chooses no TTL and adds no cleanup.
--
-- Stable caller-safe codes are:
-- invalid_input, idempotency_conflict, location_not_found,
-- observation_not_found, observation_location_mismatch,
-- observation_already_accepted, decision_ref_conflict, version_not_found,
-- version_location_mismatch, version_already_superseded, temporal_conflict,
-- concurrent_write_conflict, and internal_write_failed.
-- internal_write_failed is reserved for later safe caller mapping. Unexpected
-- SQL, invariant, trigger, or programming errors raise and roll back here.

create function public.app_location_write_idempotency_begin_v1(
  p_scope text,
  p_key text,
  p_payload_hash text,
  p_expires_at timestamptz,
  p_actor_type text,
  p_actor_ref text,
  p_request_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_inserted_count integer := 0;
  v_idempotency public.app_idempotency_keys%rowtype;
  v_response jsonb;
begin
  if p_scope is null
     or p_scope <> pg_catalog.btrim(p_scope)
     or p_scope = ''
     or p_key is null
     or p_key <> pg_catalog.btrim(p_key)
     or p_key = ''
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null
     or p_expires_at <= v_now
     or p_actor_type is null
     or p_actor_type not in (
       'customer',
       'system',
       'support',
       'admin',
       'edge_function',
       'worker',
       'provider',
       'unknown'
     )
     or p_actor_ref is null
     or p_actor_ref <> pg_catalog.btrim(p_actor_ref)
     or p_actor_ref = ''
     or p_request_id is null
     or p_request_id <> pg_catalog.btrim(p_request_id)
     or p_request_id = '' then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_input'
    );
    return pg_catalog.jsonb_build_object(
      'state', 'return',
      'response', v_response
    );
  end if;

  insert into public.app_idempotency_keys (
    scope,
    key,
    payload_hash,
    locked_at,
    expires_at
  )
  values (
    p_scope,
    p_key,
    p_payload_hash,
    v_now,
    p_expires_at
  )
  on conflict (scope, key) do nothing;

  get diagnostics v_inserted_count = row_count;

  select *
    into v_idempotency
  from public.app_idempotency_keys
  where scope = p_scope
    and key = p_key
  for update;

  if not found then
    raise exception 'location write idempotency row unavailable';
  end if;

  if v_idempotency.payload_hash <> p_payload_hash then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'idempotency_conflict'
    );
    return pg_catalog.jsonb_build_object(
      'state', 'return',
      'response', v_response
    );
  end if;

  if (v_idempotency.response_status is null)
       <> (v_idempotency.response_body is null) then
    raise exception 'location write idempotency response state invalid';
  end if;

  if v_idempotency.response_status is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'return',
      'response', v_idempotency.response_body
    );
  end if;

  if v_inserted_count = 0 then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'concurrent_write_conflict'
    );
    return pg_catalog.jsonb_build_object(
      'state', 'return',
      'response', v_response
    );
  end if;

  return pg_catalog.jsonb_build_object('state', 'new');
end;
$$;

create function public.app_location_write_lock_v1(p_lock_scope text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_lock_scope is null
     or p_lock_scope <> pg_catalog.btrim(p_lock_scope)
     or p_lock_scope = '' then
    raise exception 'location write lock scope invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'app_location_write:v1:' || p_lock_scope,
      0
    )
  );
end;
$$;

create function public.app_location_write_complete_v1(
  p_scope text,
  p_key text,
  p_event_type text,
  p_scope_id uuid,
  p_request_id text,
  p_actor_type text,
  p_actor_ref text,
  p_event_data jsonb,
  p_response jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status integer;
begin
  if p_response is null
     or pg_catalog.jsonb_typeof(p_response) <> 'object'
     or not (p_response ? 'status')
     or (p_response->>'status') !~ '^[0-9]{3}$' then
    raise exception 'location write completion response invalid';
  end if;

  v_status := (p_response->>'status')::integer;
  if v_status < 100 or v_status > 599 then
    raise exception 'location write completion status invalid';
  end if;

  insert into public.app_audit_events (
    event_type,
    scope_type,
    scope_id,
    customer_id,
    dossier_id,
    request_id,
    idempotency_key,
    actor_type,
    actor_ref,
    ip_hash,
    user_agent_hash,
    event_data
  )
  values (
    p_event_type,
    'location',
    p_scope_id,
    null,
    null,
    p_request_id,
    p_key,
    p_actor_type,
    p_actor_ref,
    null,
    null,
    pg_catalog.jsonb_strip_nulls(p_event_data)
  );

  update public.app_idempotency_keys
  set response_status = v_status,
      response_body = p_response,
      completed_at = pg_catalog.clock_timestamp()
  where scope = p_scope
    and key = p_key
    and response_status is null
    and response_body is null;

  if not found then
    raise exception 'location write idempotency completion failed';
  end if;

  return p_response;
end;
$$;

create function public.app_create_location_root_v1(
  p_creation_basis text,
  p_actor_type text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text :=
    'app-location-write:v1:create_location_root:actor:' ||
    coalesce(p_actor_ref, '');
  v_begin jsonb;
  v_location_id uuid;
  v_response jsonb;
begin
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope,
    p_idempotency_key,
    p_payload_hash,
    p_idempotency_expires_at,
    p_actor_type,
    p_actor_ref,
    p_request_id
  );

  if v_begin->>'state' = 'return' then
    return v_begin->'response';
  end if;

  perform public.app_location_write_lock_v1(
    'root:' || v_scope || ':key:' || p_idempotency_key
  );

  if p_creation_basis is null
     or p_creation_basis not in (
       'customer_declaration',
       'source_observation',
       'manual_migration_review'
     ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_input',
      'operation', 'create_location_root'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_root_create_rejected',
      null,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'create_location_root',
        'result_code', 'invalid_input'
      ),
      v_response
    );
  end if;

  insert into public.app_locations (
    created_by_actor_ref,
    created_from_request_id,
    creation_basis
  )
  values (
    p_actor_ref,
    p_request_id,
    p_creation_basis
  )
  returning id into v_location_id;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 201,
    'operation', 'create_location_root',
    'location_id', v_location_id
  );

  return public.app_location_write_complete_v1(
    v_scope,
    p_idempotency_key,
    'location_root_created',
    v_location_id,
    p_request_id,
    p_actor_type,
    p_actor_ref,
    pg_catalog.jsonb_build_object(
      'operation', 'create_location_root',
      'result_code', 'ok',
      'location_id', v_location_id
    ),
    v_response
  );
end;
$$;

create function public.app_record_location_observation_v1(
  p_location_id uuid,
  p_observation_kind text,
  p_descriptor_kind text,
  p_observed_at timestamptz,
  p_source_ref_sha256 text,
  p_source_payload_sha256 text,
  p_source_retrieved_at timestamptz,
  p_fresh_until timestamptz,
  p_country_code text,
  p_postal_code text,
  p_house_number integer,
  p_house_number_addition text,
  p_street text,
  p_city text,
  p_site_reference text,
  p_actor_type text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text :=
    'app-location-write:v1:record_location_observation:location:' ||
    coalesce(p_location_id::text, 'missing') ||
    ':actor:' || coalesce(p_actor_ref, '');
  v_begin jsonb;
  v_now timestamptz;
  v_observation_id uuid;
  v_response jsonb;
  v_valid boolean;
begin
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope,
    p_idempotency_key,
    p_payload_hash,
    p_idempotency_expires_at,
    p_actor_type,
    p_actor_ref,
    p_request_id
  );

  if v_begin->>'state' = 'return' then
    return v_begin->'response';
  end if;

  if p_location_id is null then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_input',
      'operation', 'record_location_observation'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_observation_record_rejected',
      null,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'record_location_observation',
        'result_code', 'invalid_input'
      ),
      v_response
    );
  end if;

  perform public.app_location_write_lock_v1(
    'location:' || p_location_id::text
  );

  if not exists (
    select 1
    from public.app_locations
    where id = p_location_id
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 404,
      'code', 'location_not_found',
      'operation', 'record_location_observation'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_observation_record_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'record_location_observation',
        'result_code', 'location_not_found',
        'location_id', p_location_id
      ),
      v_response
    );
  end if;

  v_now := pg_catalog.clock_timestamp();
  v_valid :=
    p_observation_kind is not null
    and p_observation_kind in (
      'customer_declared',
      'document_parsed',
      'pdok_observed',
      'bag_observed',
      'provider_observed',
      'manual_observed',
      'migration_snapshot'
    )
    and p_descriptor_kind is not null
    and p_descriptor_kind in ('postal_address', 'site_reference')
    and p_observed_at is not null
    and (
      p_source_ref_sha256 is null
      or p_source_ref_sha256 ~ '^[0-9a-f]{64}$'
    )
    and (
      p_source_payload_sha256 is null
      or p_source_payload_sha256 ~ '^[0-9a-f]{64}$'
    )
    and (
      p_observation_kind not in (
        'document_parsed',
        'pdok_observed',
        'bag_observed',
        'provider_observed'
      )
      or p_source_payload_sha256 is not null
    )
    and (
      p_source_retrieved_at is null
      or p_source_retrieved_at <= v_now
    )
    and (
      p_fresh_until is null
      or (
        p_source_retrieved_at is not null
        and p_fresh_until > p_source_retrieved_at
      )
    )
    and (
      p_observation_kind not in (
        'pdok_observed',
        'bag_observed',
        'provider_observed'
      )
      or p_source_retrieved_at is not null
    )
    and (
      p_observation_kind not in (
        'customer_declared',
        'manual_observed',
        'migration_snapshot'
      )
      or p_fresh_until is null
    )
    and p_country_code is not null
    and p_country_code ~ '^[A-Z]{2}$'
    and (
      p_postal_code is null
      or (
        p_postal_code = pg_catalog.btrim(p_postal_code)
        and p_postal_code = pg_catalog.upper(p_postal_code)
        and p_postal_code <> ''
      )
    )
    and (
      p_house_number_addition is null
      or (
        p_house_number_addition = pg_catalog.btrim(p_house_number_addition)
        and p_house_number_addition <> ''
      )
    )
    and (
      p_street is null
      or (
        p_street = pg_catalog.btrim(p_street)
        and p_street <> ''
      )
    )
    and (
      p_city is null
      or (
        p_city = pg_catalog.btrim(p_city)
        and p_city <> ''
      )
    )
    and (
      p_site_reference is null
      or (
        p_site_reference = pg_catalog.btrim(p_site_reference)
        and p_site_reference <> ''
      )
    )
    and (p_house_number is null or p_house_number > 0)
    and (
      (
        p_descriptor_kind = 'postal_address'
        and p_postal_code is not null
        and p_house_number is not null
        and p_street is not null
        and p_city is not null
        and p_site_reference is null
      )
      or (
        p_descriptor_kind = 'site_reference'
        and p_site_reference is not null
        and p_postal_code is null
        and p_house_number is null
        and p_house_number_addition is null
        and p_street is null
        and p_city is null
      )
    );

  if not v_valid then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_input',
      'operation', 'record_location_observation'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_observation_record_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'record_location_observation',
        'result_code', 'invalid_input',
        'location_id', p_location_id
      ),
      v_response
    );
  end if;

  insert into public.app_location_address_observations (
    location_id,
    observation_kind,
    descriptor_kind,
    observed_at,
    recorded_at,
    recorded_by_actor_ref,
    recorded_from_request_id,
    source_ref_sha256,
    source_payload_sha256,
    source_retrieved_at,
    fresh_until,
    country_code,
    postal_code,
    house_number,
    house_number_addition,
    street,
    city,
    site_reference
  )
  values (
    p_location_id,
    p_observation_kind,
    p_descriptor_kind,
    p_observed_at,
    v_now,
    p_actor_ref,
    p_request_id,
    p_source_ref_sha256,
    p_source_payload_sha256,
    p_source_retrieved_at,
    p_fresh_until,
    p_country_code,
    p_postal_code,
    p_house_number,
    p_house_number_addition,
    p_street,
    p_city,
    p_site_reference
  )
  returning id into v_observation_id;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 201,
    'operation', 'record_location_observation',
    'location_id', p_location_id,
    'observation_id', v_observation_id
  );

  return public.app_location_write_complete_v1(
    v_scope,
    p_idempotency_key,
    'location_observation_recorded',
    p_location_id,
    p_request_id,
    p_actor_type,
    p_actor_ref,
    pg_catalog.jsonb_build_object(
      'operation', 'record_location_observation',
      'result_code', 'ok',
      'location_id', p_location_id,
      'observation_id', v_observation_id
    ),
    v_response
  );
end;
$$;

create function public.app_accept_initial_location_version_v1(
  p_location_id uuid,
  p_observation_id uuid,
  p_valid_from timestamptz,
  p_valid_to timestamptz,
  p_accepted_at timestamptz,
  p_acceptance_decision_ref text,
  p_actor_type text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text :=
    'app-location-write:v1:accept_initial_location_version:location:' ||
    coalesce(p_location_id::text, 'missing') ||
    ':actor:' || coalesce(p_actor_ref, '');
  v_begin jsonb;
  v_observation public.app_location_address_observations%rowtype;
  v_now timestamptz;
  v_version_id uuid;
  v_response jsonb;
  v_constraint_name text;
  v_reject_code text;
begin
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope,
    p_idempotency_key,
    p_payload_hash,
    p_idempotency_expires_at,
    p_actor_type,
    p_actor_ref,
    p_request_id
  );

  if v_begin->>'state' = 'return' then
    return v_begin->'response';
  end if;

  if p_location_id is null or p_observation_id is null then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_input',
      'operation', 'accept_initial_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_initial_version_accept_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'accept_initial_location_version',
        'result_code', 'invalid_input',
        'location_id', p_location_id,
        'observation_id', p_observation_id
      ),
      v_response
    );
  end if;

  perform public.app_location_write_lock_v1(
    'location:' || p_location_id::text
  );

  if not exists (
    select 1 from public.app_locations where id = p_location_id
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 404,
      'code', 'location_not_found',
      'operation', 'accept_initial_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_initial_version_accept_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'accept_initial_location_version',
        'result_code', 'location_not_found',
        'location_id', p_location_id,
        'observation_id', p_observation_id
      ),
      v_response
    );
  end if;

  select *
    into v_observation
  from public.app_location_address_observations
  where id = p_observation_id
  for key share;

  if not found then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 404,
      'code', 'observation_not_found',
      'operation', 'accept_initial_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_initial_version_accept_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'accept_initial_location_version',
        'result_code', 'observation_not_found',
        'location_id', p_location_id,
        'observation_id', p_observation_id
      ),
      v_response
    );
  end if;

  if v_observation.location_id <> p_location_id then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'observation_location_mismatch',
      'operation', 'accept_initial_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_initial_version_accept_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'accept_initial_location_version',
        'result_code', 'observation_location_mismatch',
        'location_id', p_location_id,
        'observation_id', p_observation_id
      ),
      v_response
    );
  end if;

  v_now := pg_catalog.clock_timestamp();
  if p_valid_from is null
     or (p_valid_to is not null and p_valid_to <= p_valid_from)
     or p_accepted_at is null
     or p_accepted_at > v_now then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'temporal_conflict',
      'operation', 'accept_initial_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_initial_version_accept_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'accept_initial_location_version',
        'result_code', 'temporal_conflict',
        'location_id', p_location_id,
        'observation_id', p_observation_id
      ),
      v_response
    );
  end if;

  if p_acceptance_decision_ref is null
     or p_acceptance_decision_ref <> pg_catalog.btrim(p_acceptance_decision_ref)
     or p_acceptance_decision_ref = '' then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_input',
      'operation', 'accept_initial_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_initial_version_accept_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'accept_initial_location_version',
        'result_code', 'invalid_input',
        'location_id', p_location_id,
        'observation_id', p_observation_id
      ),
      v_response
    );
  end if;

  if exists (
    select 1
    from public.app_location_versions
    where accepted_from_observation_id = p_observation_id
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'observation_already_accepted',
      'operation', 'accept_initial_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_initial_version_accept_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'accept_initial_location_version',
        'result_code', 'observation_already_accepted',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'acceptance_decision_ref', p_acceptance_decision_ref
      ),
      v_response
    );
  end if;

  if exists (
    select 1
    from public.app_location_versions
    where location_id = p_location_id
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'concurrent_write_conflict',
      'operation', 'accept_initial_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_initial_version_accept_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'accept_initial_location_version',
        'result_code', 'concurrent_write_conflict',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'acceptance_decision_ref', p_acceptance_decision_ref
      ),
      v_response
    );
  end if;

  if exists (
    select 1
    from public.app_location_versions
    where acceptance_decision_ref = p_acceptance_decision_ref
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'decision_ref_conflict',
      'operation', 'accept_initial_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_initial_version_accept_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'accept_initial_location_version',
        'result_code', 'decision_ref_conflict',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'acceptance_decision_ref', p_acceptance_decision_ref
      ),
      v_response
    );
  end if;

  begin
    insert into public.app_location_versions (
      location_id,
      accepted_from_observation_id,
      valid_from,
      valid_to,
      recorded_at,
      accepted_at,
      accepted_by_actor_ref,
      accepted_from_request_id,
      acceptance_decision_ref,
      descriptor_kind,
      country_code,
      postal_code,
      house_number,
      house_number_addition,
      street,
      city,
      site_reference,
      supersedes_version_id,
      correction_reason
    )
    values (
      p_location_id,
      p_observation_id,
      p_valid_from,
      p_valid_to,
      v_now,
      p_accepted_at,
      p_actor_ref,
      p_request_id,
      p_acceptance_decision_ref,
      v_observation.descriptor_kind,
      v_observation.country_code,
      v_observation.postal_code,
      v_observation.house_number,
      v_observation.house_number_addition,
      v_observation.street,
      v_observation.city,
      v_observation.site_reference,
      null,
      null
    )
    returning id into v_version_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name =
          'app_location_versions_acceptance_decision_ref_key' then
        v_reject_code := 'decision_ref_conflict';
      elsif v_constraint_name =
          'app_location_versions_accepted_observation_id_key' then
        v_reject_code := 'observation_already_accepted';
      else
        raise;
      end if;
  end;

  if v_reject_code is not null then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', v_reject_code,
      'operation', 'accept_initial_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_initial_version_accept_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'accept_initial_location_version',
        'result_code', v_reject_code,
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'acceptance_decision_ref', p_acceptance_decision_ref
      ),
      v_response
    );
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 201,
    'operation', 'accept_initial_location_version',
    'location_id', p_location_id,
    'observation_id', p_observation_id,
    'version_id', v_version_id,
    'acceptance_decision_ref', p_acceptance_decision_ref
  );

  return public.app_location_write_complete_v1(
    v_scope,
    p_idempotency_key,
    'location_initial_version_accepted',
    p_location_id,
    p_request_id,
    p_actor_type,
    p_actor_ref,
    pg_catalog.jsonb_build_object(
      'operation', 'accept_initial_location_version',
      'result_code', 'ok',
      'location_id', p_location_id,
      'observation_id', p_observation_id,
      'version_id', v_version_id,
      'acceptance_decision_ref', p_acceptance_decision_ref
    ),
    v_response
  );
end;
$$;

create function public.app_correct_location_version_v1(
  p_location_id uuid,
  p_observation_id uuid,
  p_predecessor_version_id uuid,
  p_valid_from timestamptz,
  p_valid_to timestamptz,
  p_accepted_at timestamptz,
  p_acceptance_decision_ref text,
  p_correction_reason text,
  p_actor_type text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text :=
    'app-location-write:v1:correct_location_version:location:' ||
    coalesce(p_location_id::text, 'missing') ||
    ':actor:' || coalesce(p_actor_ref, '');
  v_begin jsonb;
  v_observation public.app_location_address_observations%rowtype;
  v_predecessor public.app_location_versions%rowtype;
  v_now timestamptz;
  v_version_id uuid;
  v_response jsonb;
  v_constraint_name text;
  v_reject_code text;
begin
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope,
    p_idempotency_key,
    p_payload_hash,
    p_idempotency_expires_at,
    p_actor_type,
    p_actor_ref,
    p_request_id
  );

  if v_begin->>'state' = 'return' then
    return v_begin->'response';
  end if;

  if p_location_id is null
     or p_observation_id is null
     or p_predecessor_version_id is null then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_input',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'invalid_input',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id
      ),
      v_response
    );
  end if;

  perform public.app_location_write_lock_v1(
    'location:' || p_location_id::text
  );

  if not exists (
    select 1 from public.app_locations where id = p_location_id
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 404,
      'code', 'location_not_found',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'location_not_found',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id
      ),
      v_response
    );
  end if;

  select *
    into v_predecessor
  from public.app_location_versions
  where id = p_predecessor_version_id
  for key share;

  if not found then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 404,
      'code', 'version_not_found',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'version_not_found',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id
      ),
      v_response
    );
  end if;

  if v_predecessor.location_id <> p_location_id then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'version_location_mismatch',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'version_location_mismatch',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id
      ),
      v_response
    );
  end if;

  select *
    into v_observation
  from public.app_location_address_observations
  where id = p_observation_id
  for key share;

  if not found then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 404,
      'code', 'observation_not_found',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'observation_not_found',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id
      ),
      v_response
    );
  end if;

  if v_observation.location_id <> p_location_id then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'observation_location_mismatch',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'observation_location_mismatch',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id
      ),
      v_response
    );
  end if;

  v_now := pg_catalog.clock_timestamp();
  if p_valid_from is null
     or (p_valid_to is not null and p_valid_to <= p_valid_from)
     or p_accepted_at is null
     or p_accepted_at > v_now then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'temporal_conflict',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'temporal_conflict',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id
      ),
      v_response
    );
  end if;

  if p_acceptance_decision_ref is null
     or p_acceptance_decision_ref <> pg_catalog.btrim(p_acceptance_decision_ref)
     or p_acceptance_decision_ref = ''
     or p_correction_reason is null
     or p_correction_reason <> pg_catalog.btrim(p_correction_reason)
     or p_correction_reason = '' then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_input',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'invalid_input',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id
      ),
      v_response
    );
  end if;

  if exists (
    select 1
    from public.app_location_versions
    where supersedes_version_id = p_predecessor_version_id
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'version_already_superseded',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'version_already_superseded',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id
      ),
      v_response
    );
  end if;

  if exists (
    select 1
    from public.app_location_versions
    where accepted_from_observation_id = p_observation_id
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'observation_already_accepted',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'observation_already_accepted',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id
      ),
      v_response
    );
  end if;

  if exists (
    select 1
    from public.app_location_versions
    where acceptance_decision_ref = p_acceptance_decision_ref
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'decision_ref_conflict',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'decision_ref_conflict',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id,
        'acceptance_decision_ref', p_acceptance_decision_ref
      ),
      v_response
    );
  end if;

  if v_now <= v_predecessor.recorded_at
     or exists (
       select 1
       from public.app_location_versions other_leaf
       where other_leaf.location_id = p_location_id
         and other_leaf.id <> p_predecessor_version_id
         and not exists (
           select 1
           from public.app_location_versions other_successor
           where other_successor.supersedes_version_id = other_leaf.id
         )
         and p_valid_from
               < coalesce(
                   other_leaf.valid_to,
                   'infinity'::timestamptz
                 )
         and other_leaf.valid_from
               < coalesce(p_valid_to, 'infinity'::timestamptz)
     ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'temporal_conflict',
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', 'temporal_conflict',
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id
      ),
      v_response
    );
  end if;

  begin
    insert into public.app_location_versions (
      location_id,
      accepted_from_observation_id,
      valid_from,
      valid_to,
      recorded_at,
      accepted_at,
      accepted_by_actor_ref,
      accepted_from_request_id,
      acceptance_decision_ref,
      descriptor_kind,
      country_code,
      postal_code,
      house_number,
      house_number_addition,
      street,
      city,
      site_reference,
      supersedes_version_id,
      correction_reason
    )
    values (
      p_location_id,
      p_observation_id,
      p_valid_from,
      p_valid_to,
      v_now,
      p_accepted_at,
      p_actor_ref,
      p_request_id,
      p_acceptance_decision_ref,
      v_observation.descriptor_kind,
      v_observation.country_code,
      v_observation.postal_code,
      v_observation.house_number,
      v_observation.house_number_addition,
      v_observation.street,
      v_observation.city,
      v_observation.site_reference,
      p_predecessor_version_id,
      p_correction_reason
    )
    returning id into v_version_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name =
          'app_location_versions_acceptance_decision_ref_key' then
        v_reject_code := 'decision_ref_conflict';
      elsif v_constraint_name =
          'app_location_versions_accepted_observation_id_key' then
        v_reject_code := 'observation_already_accepted';
      elsif v_constraint_name =
          'app_location_versions_direct_successor_uidx' then
        v_reject_code := 'version_already_superseded';
      else
        raise;
      end if;
  end;

  if v_reject_code is not null then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', v_reject_code,
      'operation', 'correct_location_version'
    );
    return public.app_location_write_complete_v1(
      v_scope,
      p_idempotency_key,
      'location_version_correction_rejected',
      p_location_id,
      p_request_id,
      p_actor_type,
      p_actor_ref,
      pg_catalog.jsonb_build_object(
        'operation', 'correct_location_version',
        'result_code', v_reject_code,
        'location_id', p_location_id,
        'observation_id', p_observation_id,
        'predecessor_version_id', p_predecessor_version_id,
        'acceptance_decision_ref', p_acceptance_decision_ref
      ),
      v_response
    );
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 201,
    'operation', 'correct_location_version',
    'location_id', p_location_id,
    'observation_id', p_observation_id,
    'version_id', v_version_id,
    'predecessor_version_id', p_predecessor_version_id,
    'acceptance_decision_ref', p_acceptance_decision_ref
  );

  return public.app_location_write_complete_v1(
    v_scope,
    p_idempotency_key,
    'location_version_corrected',
    p_location_id,
    p_request_id,
    p_actor_type,
    p_actor_ref,
    pg_catalog.jsonb_build_object(
      'operation', 'correct_location_version',
      'result_code', 'ok',
      'location_id', p_location_id,
      'observation_id', p_observation_id,
      'version_id', v_version_id,
      'predecessor_version_id', p_predecessor_version_id,
      'successor_version_id', v_version_id,
      'acceptance_decision_ref', p_acceptance_decision_ref,
      'correction_classification', 'same_root_correction'
    ),
    v_response
  );
end;
$$;

comment on function public.app_location_write_idempotency_begin_v1(
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text
) is
  'Internal location-write idempotency reservation, replay, and conflict boundary. Uses caller-provided expiry and adds no TTL or cleanup.';

comment on function public.app_location_write_lock_v1(text) is
  'Internal transaction-level advisory-lock derivation for bounded location writes.';

comment on function public.app_location_write_complete_v1(
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb
) is
  'Internal atomic fail-closed audit insertion and idempotency-response completion for bounded location writes.';

comment on function public.app_create_location_root_v1(
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) is
  'Service-role-only immutable location-root creation. No address, acceptance, population, projection, caller cutover, NEa, or verifier claim.';

comment on function public.app_record_location_observation_v1(
  uuid,
  text,
  text,
  timestamptz,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) is
  'Service-role-only immutable location observation. Observed data never auto-accepts or creates a version.';

comment on function public.app_accept_initial_location_version_v1(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) is
  'Service-role-only separate internal initial acceptance. Internal acceptance is not NEa or verifier acceptance.';

comment on function public.app_correct_location_version_v1(
  uuid,
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) is
  'Service-role-only immutable same-root correction successor. The predecessor is never mutated.';

revoke all on function public.app_location_write_idempotency_begin_v1(
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text
) from public, anon, authenticated, service_role;

revoke all on function public.app_location_write_lock_v1(text)
  from public, anon, authenticated, service_role;

revoke all on function public.app_location_write_complete_v1(
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb
) from public, anon, authenticated, service_role;

revoke all on function public.app_create_location_root_v1(
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.app_record_location_observation_v1(
  uuid,
  text,
  text,
  timestamptz,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.app_accept_initial_location_version_v1(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.app_correct_location_version_v1(
  uuid,
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.app_create_location_root_v1(
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

grant execute on function public.app_record_location_observation_v1(
  uuid,
  text,
  text,
  timestamptz,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

grant execute on function public.app_accept_initial_location_version_v1(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

grant execute on function public.app_correct_location_version_v1(
  uuid,
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

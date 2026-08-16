-- ENVAL /app connection write RPCs
-- Date: 2026-07-20
--
-- Purpose:
-- - Add the local Gate 1 server-side write boundary for EAN connections,
--   connection periods, and ownership claims.
-- - Reuse app_audit_events and app_idempotency_keys.
--
-- Boundaries:
-- - Local schema/proof foundation only.
-- - No remote mutation.
-- - No Edge Function, Storage, Auth, cron, UI, package, or legacy changes.
-- - No CAR integration and no raw external payload storage.

create or replace function public.app_connection_write_audit_event(
  p_event_type text,
  p_scope_id uuid,
  p_customer_id uuid,
  p_dossier_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_actor_type text,
  p_actor_ref text,
  p_event_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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
    event_data
  )
  values (
    p_event_type,
    'dossier',
    p_scope_id,
    p_customer_id,
    p_dossier_id,
    p_request_id,
    p_idempotency_key,
    p_actor_type,
    p_actor_ref,
    coalesce(p_event_data, '{}'::jsonb) || jsonb_build_object('audit_recorded_at', now())
  );
end;
$$;

create or replace function public.app_declare_connection_v1(
  p_customer_id uuid,
  p_dossier_id uuid,
  p_location_id uuid,
  p_ean_normalized text,
  p_connection_type text,
  p_declared_network_operator text,
  p_period_valid_from date,
  p_period_valid_to date,
  p_period_network_operator text,
  p_period_configuration_type text,
  p_source_type text,
  p_source_reference_type text,
  p_source_reference_id text,
  p_actor_type text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_dossier record;
  v_location record;
  v_idem record;
  v_scope text := 'connection_declare:' || p_customer_id::text || ':' || p_dossier_id::text;
  v_connection_id uuid := gen_random_uuid();
  v_period_id uuid := null;
  v_response jsonb;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or p_request_id is null or btrim(p_request_id) = ''
     or p_actor_type is null or btrim(p_actor_type) = ''
     or p_actor_ref is null or btrim(p_actor_ref) = '' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request', 'request_id', p_request_id);
  end if;

  if p_source_type is null or btrim(p_source_type) = ''
     or p_source_reference_type is null or btrim(p_source_reference_type) = ''
     or p_source_reference_id is null or btrim(p_source_reference_id) = '' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'source_provenance_required', 'request_id', p_request_id);
  end if;

  if p_ean_normalized !~ '^[0-9]{18}$'
     or p_connection_type not in ('primary', 'secondary_allocation_point', 'direct_line') then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request', 'request_id', p_request_id);
  end if;

  select id, customer_id, status
    into v_dossier
  from public.app_customer_dossiers
  where id = p_dossier_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'dossier_scope_mismatch', 'request_id', p_request_id);
  end if;

  if v_dossier.customer_id <> p_customer_id then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'customer_scope_mismatch', 'request_id', p_request_id);
  end if;

  select id, dossier_id
    into v_location
  from public.app_dossier_locations
  where id = p_location_id
  for update;

  if not found or v_location.dossier_id <> p_dossier_id then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'location_scope_mismatch', 'request_id', p_request_id);
  end if;

  if p_period_valid_from is not null
     and p_period_valid_to is not null
     and p_period_valid_to <= p_period_valid_from then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request', 'request_id', p_request_id);
  end if;

  insert into public.app_idempotency_keys (
    scope,
    key,
    payload_hash,
    locked_at,
    expires_at
  )
  values (
    v_scope,
    p_idempotency_key,
    p_payload_hash,
    v_now,
    v_now + interval '24 hours'
  )
  on conflict (scope, key) do nothing;

  select *
    into v_idem
  from public.app_idempotency_keys
  where scope = v_scope
    and key = p_idempotency_key
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 500, 'code', 'internal_error', 'request_id', p_request_id);
  end if;

  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'request_id', p_request_id);
  end if;

  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body;
  end if;

  if v_idem.locked_at is not null and v_idem.created_at <> v_now and v_idem.response_body is null then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'request_id', p_request_id);
  end if;

  insert into public.app_connections (
    id,
    customer_id,
    dossier_id,
    location_id,
    ean_normalized,
    connection_type,
    declared_network_operator,
    status,
    source_type,
    source_reference_type,
    source_reference_id,
    observed_at,
    request_id,
    actor_type,
    actor_ref
  )
  values (
    v_connection_id,
    p_customer_id,
    p_dossier_id,
    p_location_id,
    p_ean_normalized,
    p_connection_type,
    nullif(btrim(coalesce(p_declared_network_operator, '')), ''),
    'declared',
    p_source_type,
    p_source_reference_type,
    p_source_reference_id,
    v_now,
    p_request_id,
    p_actor_type,
    p_actor_ref
  );

  if p_period_valid_from is not null then
    v_period_id := gen_random_uuid();

    insert into public.app_connection_periods (
      id,
      connection_id,
      location_id,
      valid_from,
      valid_to,
      network_operator,
      configuration_type,
      status,
      source_type,
      source_reference_type,
      source_reference_id,
      observed_at,
      request_id,
      actor_type,
      actor_ref
    )
    values (
      v_period_id,
      v_connection_id,
      p_location_id,
      p_period_valid_from,
      p_period_valid_to,
      nullif(btrim(coalesce(p_period_network_operator, '')), ''),
      coalesce(nullif(btrim(coalesce(p_period_configuration_type, '')), ''), 'unknown'),
      'declared',
      p_source_type,
      p_source_reference_type,
      p_source_reference_id,
      v_now,
      p_request_id,
      p_actor_type,
      p_actor_ref
    );
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'status', 200,
    'mode', 'connection_declare_v1',
    'request_id', p_request_id,
    'idempotency_scope', v_scope,
    'connection_id', v_connection_id,
    'connection_period_id', v_period_id,
    'customer_id', p_customer_id,
    'dossier_id', p_dossier_id,
    'location_id', p_location_id,
    'connection_status', 'declared',
    'connection_type', p_connection_type,
    'payload_hash', p_payload_hash
  );

  perform public.app_connection_write_audit_event(
    'app_connection_declared',
    p_dossier_id,
    p_customer_id,
    p_dossier_id,
    p_request_id,
    p_idempotency_key,
    p_actor_type,
    p_actor_ref,
    jsonb_build_object(
      'connection_id', v_connection_id,
      'connection_period_id', v_period_id,
      'source_type', p_source_type,
      'previous_status', null,
      'new_status', 'declared',
      'decision', null,
      'reason', null,
      'idempotency_scope', v_scope,
      'idempotency_key', p_idempotency_key,
      'payload_hash', p_payload_hash
    )
  );

  update public.app_idempotency_keys
  set response_status = 200,
      response_body = v_response,
      completed_at = v_now
  where scope = v_scope
    and key = p_idempotency_key;

  return v_response;
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'overlap_conflict', 'request_id', p_request_id);
  when check_violation then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request', 'request_id', p_request_id);
  when others then
    return jsonb_build_object('ok', false, 'status', 500, 'code', 'internal_error', 'request_id', p_request_id);
end;
$$;

create or replace function public.app_declare_connection_ownership_v1(
  p_connection_id uuid,
  p_customer_id uuid,
  p_dossier_id uuid,
  p_valid_from date,
  p_valid_to date,
  p_claim_source_type text,
  p_source_reference_type text,
  p_source_reference_id text,
  p_initial_status text,
  p_actor_type text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_connection record;
  v_idem record;
  v_scope text := 'connection_ownership_declare:' || p_connection_id::text;
  v_claim_id uuid := gen_random_uuid();
  v_status text := coalesce(nullif(btrim(coalesce(p_initial_status, '')), ''), 'declared');
  v_response jsonb;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or p_request_id is null or btrim(p_request_id) = ''
     or p_actor_type is null or btrim(p_actor_type) = ''
     or p_actor_ref is null or btrim(p_actor_ref) = '' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request', 'request_id', p_request_id);
  end if;

  if p_claim_source_type is null or btrim(p_claim_source_type) = ''
     or p_source_reference_type is null or btrim(p_source_reference_type) = ''
     or p_source_reference_id is null or btrim(p_source_reference_id) = '' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'source_provenance_required', 'request_id', p_request_id);
  end if;

  if v_status not in ('declared', 'under_review') then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'invalid_transition', 'request_id', p_request_id);
  end if;

  if p_valid_from is null
     or (p_valid_to is not null and p_valid_to <= p_valid_from) then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request', 'request_id', p_request_id);
  end if;

  select id, customer_id, dossier_id, status
    into v_connection
  from public.app_connections
  where id = p_connection_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'code', 'connection_not_found', 'request_id', p_request_id);
  end if;

  if v_connection.customer_id <> p_customer_id then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'customer_scope_mismatch', 'request_id', p_request_id);
  end if;

  if v_connection.dossier_id <> p_dossier_id then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'dossier_scope_mismatch', 'request_id', p_request_id);
  end if;

  if exists (
    select 1
    from public.app_connection_ownership_periods existing
    where existing.connection_id = p_connection_id
      and existing.claim_status not in ('rejected', 'superseded')
      and (existing.valid_to is null or p_valid_from < existing.valid_to)
      and (p_valid_to is null or existing.valid_from < p_valid_to)
  ) then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'overlap_conflict', 'request_id', p_request_id);
  end if;

  insert into public.app_idempotency_keys (
    scope,
    key,
    payload_hash,
    locked_at,
    expires_at
  )
  values (
    v_scope,
    p_idempotency_key,
    p_payload_hash,
    v_now,
    v_now + interval '24 hours'
  )
  on conflict (scope, key) do nothing;

  select *
    into v_idem
  from public.app_idempotency_keys
  where scope = v_scope
    and key = p_idempotency_key
  for update;

  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'request_id', p_request_id);
  end if;

  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body;
  end if;

  insert into public.app_connection_ownership_periods (
    id,
    connection_id,
    customer_id,
    dossier_id,
    valid_from,
    valid_to,
    claim_source_type,
    source_reference_type,
    source_reference_id,
    claim_status,
    observed_at,
    request_id,
    actor_type,
    actor_ref
  )
  values (
    v_claim_id,
    p_connection_id,
    p_customer_id,
    p_dossier_id,
    p_valid_from,
    p_valid_to,
    p_claim_source_type,
    p_source_reference_type,
    p_source_reference_id,
    v_status,
    v_now,
    p_request_id,
    p_actor_type,
    p_actor_ref
  );

  v_response := jsonb_build_object(
    'ok', true,
    'status', 200,
    'mode', 'connection_ownership_declare_v1',
    'request_id', p_request_id,
    'idempotency_scope', v_scope,
    'connection_id', p_connection_id,
    'ownership_claim_id', v_claim_id,
    'customer_id', p_customer_id,
    'dossier_id', p_dossier_id,
    'claim_status', v_status,
    'payload_hash', p_payload_hash
  );

  perform public.app_connection_write_audit_event(
    'app_connection_ownership_declared',
    p_dossier_id,
    p_customer_id,
    p_dossier_id,
    p_request_id,
    p_idempotency_key,
    p_actor_type,
    p_actor_ref,
    jsonb_build_object(
      'connection_id', p_connection_id,
      'ownership_claim_id', v_claim_id,
      'source_type', p_claim_source_type,
      'previous_status', null,
      'new_status', v_status,
      'decision', null,
      'reason', null,
      'idempotency_scope', v_scope,
      'idempotency_key', p_idempotency_key,
      'payload_hash', p_payload_hash
    )
  );

  update public.app_idempotency_keys
  set response_status = 200,
      response_body = v_response,
      completed_at = v_now
  where scope = v_scope
    and key = p_idempotency_key;

  return v_response;
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request', 'request_id', p_request_id);
  when others then
    return jsonb_build_object('ok', false, 'status', 500, 'code', 'internal_error', 'request_id', p_request_id);
end;
$$;

create or replace function public.app_decide_connection_ownership_v1(
  p_ownership_claim_id uuid,
  p_customer_id uuid,
  p_dossier_id uuid,
  p_decision text,
  p_decision_reason text,
  p_decision_actor_type text,
  p_decision_actor_ref text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_claim record;
  v_idem record;
  v_scope text := 'connection_ownership_decide:' || p_ownership_claim_id::text;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_response jsonb;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or p_request_id is null or btrim(p_request_id) = '' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request', 'request_id', p_request_id);
  end if;

  if v_decision not in ('verified', 'rejected') then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'invalid_transition', 'request_id', p_request_id);
  end if;

  if p_decision_actor_type is null or btrim(p_decision_actor_type) = ''
     or p_decision_actor_ref is null or btrim(p_decision_actor_ref) = '' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'decision_metadata_required', 'request_id', p_request_id);
  end if;

  if v_decision = 'rejected'
     and (p_decision_reason is null or btrim(p_decision_reason) = '') then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'decision_metadata_required', 'request_id', p_request_id);
  end if;

  select *
    into v_claim
  from public.app_connection_ownership_periods
  where id = p_ownership_claim_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'code', 'ownership_claim_not_found', 'request_id', p_request_id);
  end if;

  if v_claim.customer_id <> p_customer_id then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'customer_scope_mismatch', 'request_id', p_request_id);
  end if;

  if v_claim.dossier_id <> p_dossier_id then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'dossier_scope_mismatch', 'request_id', p_request_id);
  end if;

  if v_claim.claim_status not in ('declared', 'under_review') then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'invalid_transition', 'request_id', p_request_id);
  end if;

  insert into public.app_idempotency_keys (
    scope,
    key,
    payload_hash,
    locked_at,
    expires_at
  )
  values (
    v_scope,
    p_idempotency_key,
    p_payload_hash,
    v_now,
    v_now + interval '24 hours'
  )
  on conflict (scope, key) do nothing;

  select *
    into v_idem
  from public.app_idempotency_keys
  where scope = v_scope
    and key = p_idempotency_key
  for update;

  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'request_id', p_request_id);
  end if;

  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body;
  end if;

  update public.app_connection_ownership_periods
  set claim_status = v_decision,
      verified_at = case when v_decision = 'verified' then v_now else verified_at end,
      decision_actor_type = p_decision_actor_type,
      decision_actor_ref = p_decision_actor_ref,
      decision_request_id = p_request_id,
      decision_reason = nullif(btrim(coalesce(p_decision_reason, '')), ''),
      decided_at = v_now
  where id = p_ownership_claim_id
    and customer_id = p_customer_id
    and dossier_id = p_dossier_id
    and claim_status in ('declared', 'under_review');

  if not found then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'invalid_transition', 'request_id', p_request_id);
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'status', 200,
    'mode', 'connection_ownership_decide_v1',
    'request_id', p_request_id,
    'idempotency_scope', v_scope,
    'connection_id', v_claim.connection_id,
    'ownership_claim_id', p_ownership_claim_id,
    'customer_id', p_customer_id,
    'dossier_id', p_dossier_id,
    'previous_status', v_claim.claim_status,
    'claim_status', v_decision,
    'decision', v_decision,
    'payload_hash', p_payload_hash
  );

  perform public.app_connection_write_audit_event(
    'app_connection_ownership_decided',
    p_dossier_id,
    p_customer_id,
    p_dossier_id,
    p_request_id,
    p_idempotency_key,
    p_decision_actor_type,
    p_decision_actor_ref,
    jsonb_build_object(
      'connection_id', v_claim.connection_id,
      'ownership_claim_id', p_ownership_claim_id,
      'source_type', v_claim.claim_source_type,
      'previous_status', v_claim.claim_status,
      'new_status', v_decision,
      'decision', v_decision,
      'reason', nullif(btrim(coalesce(p_decision_reason, '')), ''),
      'idempotency_scope', v_scope,
      'idempotency_key', p_idempotency_key,
      'payload_hash', p_payload_hash
    )
  );

  update public.app_idempotency_keys
  set response_status = 200,
      response_body = v_response,
      completed_at = v_now
  where scope = v_scope
    and key = p_idempotency_key;

  return v_response;
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'decision_metadata_required', 'request_id', p_request_id);
  when others then
    return jsonb_build_object('ok', false, 'status', 500, 'code', 'internal_error', 'request_id', p_request_id);
end;
$$;

create or replace function public.app_supersede_connection_ownership_v1(
  p_ownership_claim_id uuid,
  p_customer_id uuid,
  p_dossier_id uuid,
  p_valid_from date,
  p_valid_to date,
  p_claim_source_type text,
  p_source_reference_type text,
  p_source_reference_id text,
  p_reason text,
  p_actor_type text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_old_claim record;
  v_idem record;
  v_scope text := 'connection_ownership_supersede:' || p_ownership_claim_id::text;
  v_new_claim_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or p_request_id is null or btrim(p_request_id) = ''
     or p_actor_type is null or btrim(p_actor_type) = ''
     or p_actor_ref is null or btrim(p_actor_ref) = '' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request', 'request_id', p_request_id);
  end if;

  if p_claim_source_type is null or btrim(p_claim_source_type) = ''
     or p_source_reference_type is null or btrim(p_source_reference_type) = ''
     or p_source_reference_id is null or btrim(p_source_reference_id) = '' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'source_provenance_required', 'request_id', p_request_id);
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'supersede_invalid', 'request_id', p_request_id);
  end if;

  if p_valid_from is null
     or (p_valid_to is not null and p_valid_to <= p_valid_from) then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'invalid_request', 'request_id', p_request_id);
  end if;

  select *
    into v_old_claim
  from public.app_connection_ownership_periods
  where id = p_ownership_claim_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'code', 'ownership_claim_not_found', 'request_id', p_request_id);
  end if;

  if v_old_claim.customer_id <> p_customer_id then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'customer_scope_mismatch', 'request_id', p_request_id);
  end if;

  if v_old_claim.dossier_id <> p_dossier_id then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'dossier_scope_mismatch', 'request_id', p_request_id);
  end if;

  if v_old_claim.claim_status = 'superseded'
     or v_old_claim.supersedes_ownership_period_id is not null then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'supersede_invalid', 'request_id', p_request_id);
  end if;

  insert into public.app_idempotency_keys (
    scope,
    key,
    payload_hash,
    locked_at,
    expires_at
  )
  values (
    v_scope,
    p_idempotency_key,
    p_payload_hash,
    v_now,
    v_now + interval '24 hours'
  )
  on conflict (scope, key) do nothing;

  select *
    into v_idem
  from public.app_idempotency_keys
  where scope = v_scope
    and key = p_idempotency_key
  for update;

  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'request_id', p_request_id);
  end if;

  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body;
  end if;

  insert into public.app_connection_ownership_periods (
    id,
    connection_id,
    customer_id,
    dossier_id,
    valid_from,
    valid_to,
    claim_source_type,
    source_reference_type,
    source_reference_id,
    claim_status,
    observed_at,
    request_id,
    actor_type,
    actor_ref,
    decision_actor_type,
    decision_actor_ref,
    decision_request_id,
    decision_reason,
    decided_at,
    supersedes_ownership_period_id
  )
  values (
    v_new_claim_id,
    v_old_claim.connection_id,
    p_customer_id,
    p_dossier_id,
    p_valid_from,
    p_valid_to,
    p_claim_source_type,
    p_source_reference_type,
    p_source_reference_id,
    'superseded',
    v_now,
    p_request_id,
    p_actor_type,
    p_actor_ref,
    p_actor_type,
    p_actor_ref,
    p_request_id,
    p_reason,
    v_now,
    p_ownership_claim_id
  );

  v_response := jsonb_build_object(
    'ok', true,
    'status', 200,
    'mode', 'connection_ownership_supersede_v1',
    'request_id', p_request_id,
    'idempotency_scope', v_scope,
    'connection_id', v_old_claim.connection_id,
    'previous_ownership_claim_id', p_ownership_claim_id,
    'ownership_claim_id', v_new_claim_id,
    'customer_id', p_customer_id,
    'dossier_id', p_dossier_id,
    'previous_status', v_old_claim.claim_status,
    'claim_status', 'superseded',
    'decision', 'superseded',
    'payload_hash', p_payload_hash
  );

  perform public.app_connection_write_audit_event(
    'app_connection_ownership_superseded',
    p_dossier_id,
    p_customer_id,
    p_dossier_id,
    p_request_id,
    p_idempotency_key,
    p_actor_type,
    p_actor_ref,
    jsonb_build_object(
      'connection_id', v_old_claim.connection_id,
      'ownership_claim_id', v_new_claim_id,
      'previous_ownership_claim_id', p_ownership_claim_id,
      'source_type', p_claim_source_type,
      'previous_status', v_old_claim.claim_status,
      'new_status', 'superseded',
      'decision', 'superseded',
      'reason', p_reason,
      'idempotency_scope', v_scope,
      'idempotency_key', p_idempotency_key,
      'payload_hash', p_payload_hash
    )
  );

  update public.app_idempotency_keys
  set response_status = 200,
      response_body = v_response,
      completed_at = v_now
  where scope = v_scope
    and key = p_idempotency_key;

  return v_response;
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'supersede_invalid', 'request_id', p_request_id);
  when others then
    return jsonb_build_object('ok', false, 'status', 500, 'code', 'internal_error', 'request_id', p_request_id);
end;
$$;

revoke all on function public.app_connection_write_audit_event(
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

revoke all on function public.app_declare_connection_v1(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

revoke all on function public.app_declare_connection_ownership_v1(
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

revoke all on function public.app_decide_connection_ownership_v1(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

revoke all on function public.app_supersede_connection_ownership_v1(
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.app_connection_write_audit_event(
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

grant execute on function public.app_declare_connection_v1(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;

grant execute on function public.app_declare_connection_ownership_v1(
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;

grant execute on function public.app_decide_connection_ownership_v1(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;

grant execute on function public.app_supersede_connection_ownership_v1(
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;

comment on function public.app_declare_connection_v1(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
'Gate 1 local service-role-only RPC. Declares an EAN connection and optional initial connection period with scoped idempotency and audit. No CAR lookup or ownership verification.';

comment on function public.app_declare_connection_ownership_v1(
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
'Gate 1 local service-role-only RPC. Declares an ownership/aangeslotene claim with provenance, idempotency, and audit. Claims do not start verified.';

comment on function public.app_decide_connection_ownership_v1(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
'Gate 1 local service-role-only RPC. Records verified/rejected ownership decisions with reviewer metadata, idempotency, and audit.';

comment on function public.app_supersede_connection_ownership_v1(
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
'Gate 1 local service-role-only RPC. Adds a supersede-history row for ownership corrections without mutating old core truth.';

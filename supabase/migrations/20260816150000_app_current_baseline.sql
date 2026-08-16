-- ENVAL CURRENT app baseline for TENANT_ENVAL.
-- Version: 20260816150000
-- Generated from the exact MIG02 present-app cohort plus the two archived
-- connection sources, with historical row transformations intentionally omitted.
-- Contains schema and deterministic pre-workforce configuration only.
-- Contains no customer, case, evidence, signing, Auth, workforce, audit or secret data.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--


--
-- Name: app_accept_initial_location_version_v1(uuid, uuid, timestamp with time zone, timestamp with time zone, timestamp with time zone, text, text, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_accept_initial_location_version_v1(p_location_id uuid, p_observation_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION app_accept_initial_location_version_v1(p_location_id uuid, p_observation_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_accept_initial_location_version_v1(p_location_id uuid, p_observation_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) IS 'Service-role-only separate internal initial acceptance. Internal acceptance is not NEa or verifier acceptance.';


--
-- Name: app_asserted_service_recipient_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_asserted_service_recipient_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if new.role_type <> 'service_recipient'
     or new.claim_status <> 'asserted' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.case_id::text, 0)
  );

  if exists (
    select 1
    from public.app_case_party_roles existing
    where existing.case_id = new.case_id
      and existing.role_type = 'service_recipient'
      and existing.claim_status = 'asserted'
      and existing.id is distinct from new.supersedes_id
      and not exists (
        select 1
        from public.app_case_party_roles successor
        where successor.supersedes_id = existing.id
      )
  ) then
    raise exception
      'at most one terminal asserted service_recipient is allowed per case';
  end if;

  return new;
end;
$$;


--
-- Name: FUNCTION app_asserted_service_recipient_guard(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_asserted_service_recipient_guard() IS 'Focused insert guard for at most one terminal asserted service_recipient per case. It grants no operational, representation, mandate or authority truth.';


--
-- Name: app_bootstrap_customer_auth_v1(uuid, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_bootstrap_customer_auth_v1(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := now();
  v_auth_user record;
  v_idem record;
  v_inserted_count integer := 0;
  v_active_identity_count integer := 0;
  v_any_identity_count integer := 0;
  v_identity record;
  v_customer record;
  v_dossiers jsonb := '[]'::jsonb;
  v_dossier_count integer := 0;
  v_response jsonb;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload hash';
  end if;

  if p_email_normalized is null or btrim(p_email_normalized) = '' then
    raise exception 'verified email required';
  end if;

  if p_actor_ref <> ('supabase_auth_user:' || p_auth_user_id::text) then
    raise exception 'actor reference mismatch';
  end if;

  select
    id,
    lower(email) as email_normalized,
    coalesce(email_confirmed_at, confirmed_at) as verified_at
    into v_auth_user
  from auth.users
  where id = p_auth_user_id;

  if not found then
    raise exception 'auth user not found';
  end if;

  if v_auth_user.email_normalized is distinct from lower(btrim(p_email_normalized)) then
    raise exception 'auth email mismatch';
  end if;

  if v_auth_user.verified_at is null then
    raise exception 'auth email not verified';
  end if;

  insert into public.app_idempotency_keys (
    scope,
    key,
    payload_hash,
    locked_at,
    expires_at
  )
  values (
    p_idempotency_scope,
    p_idempotency_key,
    p_payload_hash,
    v_now,
    v_now + interval '24 hours'
  )
  on conflict (scope, key) do nothing;

  get diagnostics v_inserted_count = row_count;

  select *
    into v_idem
  from public.app_idempotency_keys
  where scope = p_idempotency_scope
    and key = p_idempotency_key
  for update;

  if not found then
    raise exception 'idempotency row unavailable';
  end if;

  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'idempotency_conflict',
      'error', 'Aanvraag is al gebruikt met andere inhoud.'
    );
  end if;

  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;

  if v_inserted_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'request_in_progress',
      'error', 'Aanvraag wordt al verwerkt.'
    );
  end if;

  select count(*)
    into v_any_identity_count
  from public.app_customer_identities
  where email_normalized = lower(btrim(p_email_normalized));

  select count(*)
    into v_active_identity_count
  from public.app_customer_identities
  where email_normalized = lower(btrim(p_email_normalized))
    and status = 'active';

  if v_active_identity_count = 0 then
    v_response := jsonb_build_object(
      'ok', false,
      'status', 404,
      'code', 'customer_identity_not_found',
      'error', 'Klantidentiteit niet gevonden.'
    );

    update public.app_idempotency_keys
    set response_status = 404,
        response_body = v_response,
        completed_at = v_now
    where scope = p_idempotency_scope
      and key = p_idempotency_key;

    return v_response;
  end if;

  if v_any_identity_count <> v_active_identity_count or v_active_identity_count > 1 then
    v_response := jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'customer_identity_binding_ambiguous',
      'error', 'Klantidentiteit kan niet automatisch worden gekoppeld.'
    );

    update public.app_idempotency_keys
    set response_status = 409,
        response_body = v_response,
        completed_at = v_now
    where scope = p_idempotency_scope
      and key = p_idempotency_key;

    return v_response;
  end if;

  select *
    into v_identity
  from public.app_customer_identities
  where email_normalized = lower(btrim(p_email_normalized))
    and status = 'active'
  for update;

  if v_identity.auth_user_id is not null and v_identity.auth_user_id <> p_auth_user_id then
    v_response := jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'customer_identity_already_bound',
      'error', 'Klantidentiteit is al gekoppeld.'
    );

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
      'customer_identity_binding_rejected',
      'auth',
      v_identity.id,
      v_identity.customer_id,
      null,
      p_request_id,
      p_idempotency_key,
      'customer',
      p_actor_ref,
      p_ip_hash,
      p_user_agent_hash,
      jsonb_build_object(
        'environment', p_environment,
        'request_id', p_request_id,
        'reason', 'customer_identity_already_bound',
        'identity_id', v_identity.id,
        'customer_id', v_identity.customer_id,
        'payload_hash', p_payload_hash
      )
    );

    update public.app_idempotency_keys
    set response_status = 409,
        response_body = v_response,
        completed_at = v_now
    where scope = p_idempotency_scope
      and key = p_idempotency_key;

    return v_response;
  end if;

  select *
    into v_customer
  from public.app_customers
  where id = v_identity.customer_id
  for update;

  if not found or v_customer.status <> 'active' then
    v_response := jsonb_build_object(
      'ok', false,
      'status', 403,
      'code', 'customer_inactive',
      'error', 'Klantaccount is niet actief.'
    );

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
      'customer_identity_binding_rejected',
      'auth',
      v_identity.id,
      v_identity.customer_id,
      null,
      p_request_id,
      p_idempotency_key,
      'customer',
      p_actor_ref,
      p_ip_hash,
      p_user_agent_hash,
      jsonb_build_object(
        'environment', p_environment,
        'request_id', p_request_id,
        'reason', 'customer_inactive',
        'identity_id', v_identity.id,
        'customer_id', v_identity.customer_id,
        'payload_hash', p_payload_hash
      )
    );

    update public.app_idempotency_keys
    set response_status = 403,
        response_body = v_response,
        completed_at = v_now
    where scope = p_idempotency_scope
      and key = p_idempotency_key;

    return v_response;
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'dossier_id', id,
          'dossier_number', coalesce(dossier_number, 'D-' || left(id::text, 8)),
          'account_type', account_type,
          'status', status
        )
        order by created_at asc, id asc
      ),
      '[]'::jsonb
    ),
    count(*)
    into v_dossiers, v_dossier_count
  from public.app_customer_dossiers
  where customer_id = v_customer.id
    and minimized_at is null
    and status <> 'expired_minimized';

  if v_dossier_count < 1 then
    v_response := jsonb_build_object(
      'ok', false,
      'status', 404,
      'code', 'customer_dossier_not_found',
      'error', 'Dossier niet gevonden.'
    );

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
      'customer_identity_binding_rejected',
      'auth',
      v_identity.id,
      v_customer.id,
      null,
      p_request_id,
      p_idempotency_key,
      'customer',
      p_actor_ref,
      p_ip_hash,
      p_user_agent_hash,
      jsonb_build_object(
        'environment', p_environment,
        'request_id', p_request_id,
        'reason', 'customer_dossier_not_found',
        'identity_id', v_identity.id,
        'customer_id', v_customer.id,
        'payload_hash', p_payload_hash
      )
    );

    update public.app_idempotency_keys
    set response_status = 404,
        response_body = v_response,
        completed_at = v_now
    where scope = p_idempotency_scope
      and key = p_idempotency_key;

    return v_response;
  end if;

  if v_identity.auth_user_id is null then
    update public.app_customer_identities
    set auth_user_id = p_auth_user_id,
        email_verified_at = coalesce(email_verified_at, v_auth_user.verified_at, v_now),
        identity_provider = 'supabase',
        last_login_at = v_now
    where id = v_identity.id
      and auth_user_id is null
      and status = 'active';

    if not found then
      raise exception 'identity binding race lost';
    end if;
  else
    update public.app_customer_identities
    set email_verified_at = coalesce(email_verified_at, v_auth_user.verified_at, v_now),
        identity_provider = 'supabase',
        last_login_at = v_now
    where id = v_identity.id
      and auth_user_id = p_auth_user_id
      and status = 'active';

    if not found then
      raise exception 'identity same-user refresh failed';
    end if;
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'mode', 'auth_bootstrap_v1',
    'request_id', p_request_id,
    'customer_id', v_customer.id,
    'identity_id', v_identity.id,
    'identity_status', 'active',
    'binding_status', 'bound',
    'dossiers', v_dossiers,
    'payload_hash', p_payload_hash,
    'replayed', false
  );

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
    'customer_identity_bound',
    'auth',
    v_identity.id,
    v_customer.id,
    null,
    p_request_id,
    p_idempotency_key,
    'customer',
    'app_customer_identity:' || v_identity.id::text,
    p_ip_hash,
    p_user_agent_hash,
    jsonb_build_object(
      'environment', p_environment,
      'request_id', p_request_id,
      'identity_id', v_identity.id,
      'customer_id', v_customer.id,
      'auth_actor_ref', p_actor_ref,
      'dossier_count', v_dossier_count,
      'payload_hash', p_payload_hash,
      'binding_status', 'bound'
    )
  );

  update public.app_idempotency_keys
  set response_status = 200,
      response_body = v_response,
      completed_at = v_now
  where scope = p_idempotency_scope
    and key = p_idempotency_key;

  if not found then
    raise exception 'idempotency finalize failed';
  end if;

  return v_response;
end;
$_$;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v1(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_bootstrap_customer_auth_v1(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) IS 'Atomic service-role-only auth bootstrap for ENVAL /app: binds a verified Supabase Auth user to one existing active app_customer_identity, returns customer dossier summary, writes app audit, and finalizes app idempotency.';


--
-- Name: app_bootstrap_customer_auth_v2(uuid, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_bootstrap_customer_auth_v2(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_now timestamptz := now();
  v_v1_response jsonb;
  v_response jsonb;
  v_customer_id uuid;
  v_dossier record;
  v_existing_case record;
  v_reference_collision record;
  v_case_id uuid;
  v_case_reference text;
  v_case_created boolean;
  v_case_count integer;
  v_dossiers jsonb := '[]'::jsonb;
  v_dossier_count integer := 0;
begin
  v_v1_response := public.app_bootstrap_customer_auth_v1(
    p_auth_user_id,
    p_email_normalized,
    p_actor_ref,
    p_request_id,
    p_idempotency_scope,
    p_idempotency_key,
    p_payload_hash,
    p_ip_hash,
    p_user_agent_hash,
    p_environment
  );

  if coalesce((v_v1_response ->> 'ok')::boolean, false) is not true then
    return v_v1_response;
  end if;

  if v_v1_response ->> 'mode' = 'auth_bootstrap_v2' then
    return v_v1_response;
  end if;

  if v_v1_response ->> 'mode' <> 'auth_bootstrap_v1' then
    raise exception 'unexpected v1 bootstrap response';
  end if;

  begin
    v_customer_id := (v_v1_response ->> 'customer_id')::uuid;
  exception
    when others then
      raise exception 'invalid v1 customer response';
  end;

  for v_dossier in
    select
      d.id,
      d.dossier_number,
      d.account_type,
      d.status,
      d.created_at
    from public.app_customer_dossiers d
    where d.customer_id = v_customer_id
      and d.minimized_at is null
      and d.status <> 'expired_minimized'
    order by d.created_at asc, d.id asc
  loop
    v_dossier_count := v_dossier_count + 1;
    v_case_reference := 'CASE-' || v_dossier.id::text;
    v_case_created := false;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'app_customer_dossier:' || v_dossier.id::text,
        0
      )
    );

    select count(*)
      into v_case_count
    from public.app_cases c
    where c.source_class = 'app_customer_dossier'
      and c.source_ref = v_dossier.id::text;

    if v_case_count > 1 then
      raise exception 'ambiguous dossier case source';
    end if;

    select
      c.id,
      c.customer_id,
      c.case_reference,
      c.source_class,
      c.source_ref
      into v_existing_case
    from public.app_cases c
    where c.source_class = 'app_customer_dossier'
      and c.source_ref = v_dossier.id::text;

    if found then
      if v_existing_case.customer_id <> v_customer_id
        or v_existing_case.case_reference <> v_case_reference
        or v_existing_case.source_class <> 'app_customer_dossier'
        or v_existing_case.source_ref <> v_dossier.id::text
      then
        raise exception 'conflicting dossier case source';
      end if;

      v_case_id := v_existing_case.id;
    else
      select
        c.id,
        c.customer_id,
        c.source_class,
        c.source_ref
        into v_reference_collision
      from public.app_cases c
      where c.case_reference = v_case_reference;

      if found then
        raise exception 'conflicting dossier case reference';
      end if;

      insert into public.app_cases (
        customer_id,
        case_reference,
        created_at,
        created_by_actor_type,
        created_by_actor_ref,
        source_class,
        source_ref,
        request_id
      )
      values (
        v_customer_id,
        v_case_reference,
        v_now,
        'customer',
        p_actor_ref,
        'app_customer_dossier',
        v_dossier.id::text,
        p_request_id
      )
      returning id into v_case_id;

      v_case_created := true;
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
      event_data,
      created_at
    )
    values (
      'authenticated_dossier_case_activated',
      'dossier',
      v_dossier.id,
      v_customer_id,
      v_dossier.id,
      p_request_id,
      p_idempotency_key,
      'customer',
      p_actor_ref,
      p_ip_hash,
      p_user_agent_hash,
      jsonb_build_object(
        'environment', p_environment,
        'request_id', p_request_id,
        'customer_id', v_customer_id,
        'dossier_source_class', 'app_customer_dossier',
        'dossier_source_ref', v_dossier.id::text,
        'case_reference', v_case_reference,
        'case_activation_outcome',
          case when v_case_created then 'created' else 'resolved' end
      ),
      v_now
    );

    v_dossiers := v_dossiers || jsonb_build_array(
      jsonb_build_object(
        'dossier_id', v_dossier.id,
        'dossier_number',
          coalesce(v_dossier.dossier_number, 'D-' || left(v_dossier.id::text, 8)),
        'account_type', v_dossier.account_type,
        'status', v_dossier.status,
        'case_id', v_case_id,
        'case_reference', v_case_reference
      )
    );
  end loop;

  if v_dossier_count < 1
    or v_dossier_count <> jsonb_array_length(v_v1_response -> 'dossiers')
  then
    raise exception 'eligible dossier set changed during bootstrap';
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'mode', 'auth_bootstrap_v2',
    'request_id', p_request_id,
    'customer_id', v_customer_id,
    'identity_id', v_v1_response ->> 'identity_id',
    'identity_status', 'active',
    'binding_status', 'bound',
    'dossiers', v_dossiers,
    'payload_hash', p_payload_hash,
    'replayed', false
  );

  update public.app_idempotency_keys
  set response_status = 200,
      response_body = v_response,
      completed_at = v_now
  where scope = p_idempotency_scope
    and key = p_idempotency_key
    and payload_hash = p_payload_hash;

  if not found then
    raise exception 'v2 idempotency finalize failed';
  end if;

  return v_response;
end;
$$;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v2(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_bootstrap_customer_auth_v2(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) IS 'Atomic service-role-only auth bootstrap v2: reuses v1 identity binding and activates or resolves exactly one immutable canonical case per current eligible customer dossier.';


--
-- Name: app_bootstrap_customer_auth_v3(uuid, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_bootstrap_customer_auth_v3(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_now timestamptz := now();
  v_today date := current_date;
  v_v2_response jsonb;
  v_customer_id uuid;
  v_customer_type text;
  v_party_kind text;
  v_dossier_kind_count integer;
  v_dossier_kind_mismatch_count integer;
  v_current_relationship_count integer;
  v_other_terminal_relationship_count integer;
  v_source_party_count integer;
  v_cross_customer_relationship_count integer;
  v_activation_audit_count integer;
  v_party_id uuid;
  v_existing_party_kind text;
  v_party_created boolean := false;
begin
  v_v2_response := public.app_bootstrap_customer_auth_v2(
    p_auth_user_id,
    p_email_normalized,
    p_actor_ref,
    p_request_id,
    p_idempotency_scope,
    p_idempotency_key,
    p_payload_hash,
    p_ip_hash,
    p_user_agent_hash,
    p_environment
  );

  if coalesce((v_v2_response ->> 'ok')::boolean, false) is not true then
    return v_v2_response;
  end if;

  if v_v2_response ->> 'mode' <> 'auth_bootstrap_v2' then
    raise exception 'unexpected v2 bootstrap response';
  end if;

  begin
    v_customer_id := (v_v2_response ->> 'customer_id')::uuid;
  exception
    when others then
      raise exception 'invalid v2 customer response';
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'authenticated_customer_party_root:' || v_customer_id::text,
      0
    )
  );

  select c.customer_type
    into v_customer_type
  from public.app_customers c
  where c.id = v_customer_id
    and c.status = 'active'
  for update;

  if not found then
    raise exception 'active customer unavailable for party activation';
  end if;

  v_party_kind := case v_customer_type
    when 'particulier' then 'natural_person'
    when 'zakelijk' then 'organization'
    when 'vve' then 'organization'
    else null
  end;

  if v_party_kind is null then
    raise exception 'unsupported customer type for party activation';
  end if;

  select
    count(distinct case d.account_type
      when 'particulier' then 'natural_person'
      when 'zakelijk' then 'organization'
      when 'vve' then 'organization'
      else null
    end),
    count(*) filter (
      where case d.account_type
        when 'particulier' then 'natural_person'
        when 'zakelijk' then 'organization'
        when 'vve' then 'organization'
        else null
      end is distinct from v_party_kind
    )
    into v_dossier_kind_count, v_dossier_kind_mismatch_count
  from public.app_customer_dossiers d
  where d.customer_id = v_customer_id
    and d.minimized_at is null
    and d.status <> 'expired_minimized';

  if v_dossier_kind_count <> 1 or v_dossier_kind_mismatch_count <> 0 then
    raise exception 'conflicting customer dossier party kind';
  end if;

  select count(*)
    into v_current_relationship_count
  from public.app_customer_party_relationships r
  where r.customer_id = v_customer_id
    and r.relationship_role = 'account_owner'
    and r.valid_from <= v_today
    and (r.valid_to is null or v_today < r.valid_to)
    and not exists (
      select 1
      from public.app_customer_party_relationships successor
      where successor.supersedes_relationship_id = r.id
    );

  if v_current_relationship_count > 1 then
    raise exception 'ambiguous current customer party binding';
  end if;

  if v_current_relationship_count = 1 then
    select r.party_id
      into v_party_id
    from public.app_customer_party_relationships r
    where r.customer_id = v_customer_id
      and r.relationship_role = 'account_owner'
      and r.valid_from <= v_today
      and (r.valid_to is null or v_today < r.valid_to)
      and not exists (
        select 1
        from public.app_customer_party_relationships successor
        where successor.supersedes_relationship_id = r.id
      );
  else
    select count(*)
      into v_other_terminal_relationship_count
    from public.app_customer_party_relationships r
    where r.customer_id = v_customer_id
      and r.relationship_role = 'account_owner'
      and not exists (
        select 1
        from public.app_customer_party_relationships successor
        where successor.supersedes_relationship_id = r.id
      );

    if v_other_terminal_relationship_count > 0 then
      raise exception 'non-current customer party binding requires review';
    end if;

    select count(*)
      into v_source_party_count
    from public.app_parties p
    where p.source_type = 'authenticated_customer_party_root'
      and p.source_reference_type = 'app_customer'
      and p.source_reference_id = v_customer_id::text;

    if v_source_party_count > 1 then
      raise exception 'ambiguous authenticated customer party source';
    end if;

    if v_source_party_count = 1 then
      select p.id
        into v_party_id
      from public.app_parties p
      where p.source_type = 'authenticated_customer_party_root'
        and p.source_reference_type = 'app_customer'
        and p.source_reference_id = v_customer_id::text;
    else
      insert into public.app_parties (
        party_kind,
        source_type,
        source_reference_type,
        source_reference_id,
        request_id,
        actor_type,
        actor_ref,
        recorded_at,
        created_at
      )
      values (
        v_party_kind,
        'authenticated_customer_party_root',
        'app_customer',
        v_customer_id::text,
        p_request_id,
        'customer',
        p_actor_ref,
        v_now,
        v_now
      )
      returning id into v_party_id;

      v_party_created := true;
    end if;

    select count(*)
      into v_cross_customer_relationship_count
    from public.app_customer_party_relationships r
    where r.party_id = v_party_id
      and r.customer_id <> v_customer_id
      and r.relationship_role = 'account_owner'
      and r.valid_from <= v_today
      and (r.valid_to is null or v_today < r.valid_to)
      and not exists (
        select 1
        from public.app_customer_party_relationships successor
        where successor.supersedes_relationship_id = r.id
      );

    if v_cross_customer_relationship_count > 0 then
      raise exception 'party root already bound to another customer';
    end if;

    insert into public.app_customer_party_relationships (
      customer_id,
      party_id,
      relationship_role,
      valid_from,
      valid_to,
      source_type,
      source_reference_type,
      source_reference_id,
      request_id,
      actor_type,
      actor_ref,
      recorded_at,
      supersedes_relationship_id
    )
    values (
      v_customer_id,
      v_party_id,
      'account_owner',
      v_today,
      null,
      'authenticated_customer_party_root',
      'app_customer',
      v_customer_id::text,
      p_request_id,
      'customer',
      p_actor_ref,
      v_now,
      null
    );
  end if;

  select p.party_kind
    into v_existing_party_kind
  from public.app_parties p
  where p.id = v_party_id;

  if not found or v_existing_party_kind is distinct from v_party_kind then
    raise exception 'conflicting customer party kind';
  end if;

  select count(*)
    into v_activation_audit_count
  from public.app_audit_events a
  where a.event_type = 'authenticated_customer_party_root_activated'
    and a.customer_id = v_customer_id
    and a.idempotency_key = p_idempotency_key;

  if v_activation_audit_count > 1 then
    raise exception 'ambiguous customer party activation audit';
  end if;

  if coalesce((v_v2_response ->> 'replayed')::boolean, false) is true
    and v_activation_audit_count = 1
  then
    return v_v2_response;
  end if;

  if v_activation_audit_count <> 0 then
    raise exception 'conflicting customer party activation audit';
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
    event_data,
    created_at
  )
  values (
    'authenticated_customer_party_root_activated',
    'customer',
    v_customer_id,
    v_customer_id,
    null,
    p_request_id,
    p_idempotency_key,
    'customer',
    p_actor_ref,
    p_ip_hash,
    p_user_agent_hash,
    jsonb_build_object(
      'request_id', p_request_id,
      'customer_reference', v_customer_id,
      'party_reference', v_party_id,
      'party_kind', v_party_kind,
      'party_activation_outcome',
        case when v_party_created then 'created' else 'resolved' end,
      'idempotency_scope', p_idempotency_scope,
      'idempotency_key', p_idempotency_key,
      'environment', p_environment,
      'recorded_at', v_now
    ),
    v_now
  );

  update public.app_idempotency_keys
  set response_status = 200,
      response_body = v_v2_response,
      completed_at = v_now
  where scope = p_idempotency_scope
    and key = p_idempotency_key
    and payload_hash = p_payload_hash;

  if not found then
    raise exception 'v3 idempotency finalize failed';
  end if;

  return v_v2_response;
end;
$$;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v3(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_bootstrap_customer_auth_v3(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) IS 'Atomic service-role-only auth bootstrap v3: reuses v2 and creates or resolves one non-authoritative canonical party root and account_owner service relationship per current app_customer without creating profiles, case roles, representation authority or mandate truth.';


--
-- Name: app_bootstrap_customer_auth_v4(uuid, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_bootstrap_customer_auth_v4(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_today date := current_date;
  v_failure_stage text :=
    pg_catalog.current_setting('enval.proof_failure_stage', true);
  v_v3_response jsonb;
  v_customer_id uuid;
  v_party_id uuid;
  v_party_kind text;
  v_relationship_count integer;
  v_dossier_count integer;
  v_source_count integer;
  v_source_customer_mismatch_count integer;
  v_source_shape_mismatch_count integer;
  v_fact_variant_count integer;
  v_case_count integer;
  v_profile_id uuid;
  v_profile_count integer;
  v_wrong_profile_kind_count integer;
  v_profile_created boolean := false;
  v_profile_date date;
  v_role_created_count integer := 0;
  v_role_resolved_count integer := 0;
  v_audit_count integer;
  v_current_role_count integer;
  v_matching_role_count integer;
  v_case record;
  v_source public.app_party_declaration_sources%rowtype;
begin
  begin
    v_v3_response := public.app_bootstrap_customer_auth_v3(
      p_auth_user_id,
      p_email_normalized,
      p_actor_ref,
      p_request_id,
      p_idempotency_scope,
      p_idempotency_key,
      p_payload_hash,
      p_ip_hash,
      p_user_agent_hash,
      p_environment
    );

    if coalesce((v_v3_response ->> 'ok')::boolean, false)
         is not true then
      return v_v3_response;
    end if;

    if v_v3_response ->> 'mode' <> 'auth_bootstrap_v2' then
      raise exception 'unexpected v3 bootstrap response';
    end if;

    begin
      v_customer_id := (v_v3_response ->> 'customer_id')::uuid;
    exception
      when others then
        raise exception 'invalid v3 customer response';
    end;

    select
      pg_catalog.count(*),
      pg_catalog.min(r.party_id::text)::uuid
      into v_relationship_count, v_party_id
    from public.app_customer_party_relationships r
    where r.customer_id = v_customer_id
      and r.relationship_role = 'account_owner'
      and r.valid_from <= v_today
      and (r.valid_to is null or v_today < r.valid_to)
      and not exists (
        select 1
        from public.app_customer_party_relationships successor
        where successor.supersedes_relationship_id = r.id
      );

    if v_relationship_count <> 1 then
      raise exception 'current customer party binding unavailable';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'declared_profile:' || v_party_id::text,
        0
      )
    );

    select p.party_kind
      into v_party_kind
    from public.app_parties p
    where p.id = v_party_id
    for update;

    if not found then
      raise exception 'customer party unavailable for profile promotion';
    end if;

    select pg_catalog.count(*)
      into v_dossier_count
    from public.app_customer_dossiers d
    where d.customer_id = v_customer_id
      and d.minimized_at is null
      and d.status <> 'expired_minimized';

    select
      pg_catalog.count(s.id),
      pg_catalog.count(*) filter (
        where s.id is not null
          and s.customer_id <> v_customer_id
      ),
      pg_catalog.count(*) filter (
        where s.id is not null
          and (
            s.account_type <> d.account_type
            or case s.account_type
              when 'particulier' then 'natural_person'
              when 'zakelijk' then 'organization'
              when 'vve' then 'organization'
              else null
            end is distinct from v_party_kind
            or case s.account_type
              when 'particulier' then 'natural_person'
              else 'organization'
            end is distinct from s.declaration_kind
            or (
              s.account_type = 'zakelijk'
              and s.organization_classification is distinct from 'business'
            )
            or (
              s.account_type = 'vve'
              and s.organization_classification is distinct from 'vve'
            )
          )
      )
      into
        v_source_count,
        v_source_customer_mismatch_count,
        v_source_shape_mismatch_count
    from public.app_customer_dossiers d
    left join public.app_party_declaration_sources s
      on s.dossier_id = d.id
    where d.customer_id = v_customer_id
      and d.minimized_at is null
      and d.status <> 'expired_minimized';

    if v_source_count = 0 then
      return v_v3_response;
    end if;

    if v_source_count <> v_dossier_count then
      raise exception using
        errcode = 'P2001',
        message = 'party_declaration_incomplete';
    end if;

    if v_source_customer_mismatch_count <> 0
       or v_source_shape_mismatch_count <> 0 then
      raise exception using
        errcode = 'P2002',
        message = 'party_declaration_conflict';
    end if;

    if v_party_kind = 'natural_person' then
      select pg_catalog.count(distinct pg_catalog.jsonb_build_array(
        s.person_first_name,
        s.person_last_name,
        s.person_full_name
      ))
        into v_fact_variant_count
      from public.app_customer_dossiers d
      join public.app_party_declaration_sources s
        on s.dossier_id = d.id
      where d.customer_id = v_customer_id
        and d.minimized_at is null
        and d.status <> 'expired_minimized';
    else
      select pg_catalog.count(distinct pg_catalog.jsonb_build_array(
        s.organization_classification,
        s.organization_legal_name,
        s.trade_register_number
      ))
        into v_fact_variant_count
      from public.app_customer_dossiers d
      join public.app_party_declaration_sources s
        on s.dossier_id = d.id
      where d.customer_id = v_customer_id
        and d.minimized_at is null
        and d.status <> 'expired_minimized';
    end if;

    if v_fact_variant_count <> 1 then
      raise exception using
        errcode = 'P2002',
        message = 'party_declaration_conflict';
    end if;

    select s.*
      into v_source
    from public.app_customer_dossiers d
    join public.app_party_declaration_sources s
      on s.dossier_id = d.id
    where d.customer_id = v_customer_id
      and d.minimized_at is null
      and d.status <> 'expired_minimized'
    order by s.valid_from, s.declared_at, s.id
    limit 1;

    v_profile_date :=
      (v_source.valid_from at time zone 'Europe/Amsterdam')::date;

    if v_party_kind = 'natural_person' then
      select pg_catalog.count(*), pg_catalog.min(pv.id::text)::uuid
        into v_profile_count, v_profile_id
      from public.app_party_person_versions pv
      where pv.party_id = v_party_id
        and not exists (
          select 1
          from public.app_party_person_versions successor
          where successor.supersedes_person_version_id = pv.id
        );

      select pg_catalog.count(*)
        into v_wrong_profile_kind_count
      from public.app_party_organization_versions ov
      where ov.party_id = v_party_id
        and not exists (
          select 1
          from public.app_party_organization_versions successor
          where successor.supersedes_organization_version_id = ov.id
        );

      if v_wrong_profile_kind_count <> 0 or v_profile_count > 1 then
        raise exception using
          errcode = 'P2003',
          message = 'party_profile_conflict';
      end if;

      if v_profile_count = 1 then
        if not exists (
          select 1
          from public.app_party_person_versions pv
          where pv.id = v_profile_id
            and pv.party_id = v_party_id
            and pv.full_name = v_source.person_full_name
            and pv.valid_from = v_profile_date
            and pv.valid_to is null
            and pv.source_type = 'signup_applicant_declaration'
            and pv.source_reference_type =
              'app_party_declaration_sources'
            and pv.source_reference_id = v_source.id::text
        ) then
          raise exception using
            errcode = 'P2003',
            message = 'party_profile_conflict';
        end if;
      else
        insert into public.app_party_person_versions (
          party_id,
          full_name,
          valid_from,
          valid_to,
          source_type,
          source_reference_type,
          source_reference_id,
          request_id,
          actor_type,
          actor_ref,
          recorded_at,
          supersedes_person_version_id
        )
        values (
          v_party_id,
          v_source.person_full_name,
          v_profile_date,
          null,
          'signup_applicant_declaration',
          'app_party_declaration_sources',
          v_source.id::text,
          v_source.source_request_id,
          'customer',
          p_actor_ref,
          v_now,
          null
        )
        returning id into v_profile_id;

        v_profile_created := true;
      end if;
    else
      select pg_catalog.count(*), pg_catalog.min(ov.id::text)::uuid
        into v_profile_count, v_profile_id
      from public.app_party_organization_versions ov
      where ov.party_id = v_party_id
        and not exists (
          select 1
          from public.app_party_organization_versions successor
          where successor.supersedes_organization_version_id = ov.id
        );

      select pg_catalog.count(*)
        into v_wrong_profile_kind_count
      from public.app_party_person_versions pv
      where pv.party_id = v_party_id
        and not exists (
          select 1
          from public.app_party_person_versions successor
          where successor.supersedes_person_version_id = pv.id
        );

      if v_wrong_profile_kind_count <> 0 or v_profile_count > 1 then
        raise exception using
          errcode = 'P2003',
          message = 'party_profile_conflict';
      end if;

      if v_profile_count = 1 then
        if not exists (
          select 1
          from public.app_party_organization_versions ov
          where ov.id = v_profile_id
            and ov.party_id = v_party_id
            and ov.legal_name = v_source.organization_legal_name
            and ov.organization_classification =
              v_source.organization_classification
            and ov.legal_form is null
            and ov.trade_register_number is null
            and ov.valid_from = v_profile_date
            and ov.valid_to is null
            and ov.source_type = 'signup_applicant_declaration'
            and ov.source_reference_type =
              'app_party_declaration_sources'
            and ov.source_reference_id = v_source.id::text
        ) then
          raise exception using
            errcode = 'P2003',
            message = 'party_profile_conflict';
        end if;
      else
        insert into public.app_party_organization_versions (
          party_id,
          legal_name,
          organization_classification,
          legal_form,
          trade_register_number,
          valid_from,
          valid_to,
          source_type,
          source_reference_type,
          source_reference_id,
          request_id,
          actor_type,
          actor_ref,
          recorded_at,
          supersedes_organization_version_id
        )
        values (
          v_party_id,
          v_source.organization_legal_name,
          v_source.organization_classification,
          null,
          null,
          v_profile_date,
          null,
          'signup_applicant_declaration',
          'app_party_declaration_sources',
          v_source.id::text,
          v_source.source_request_id,
          'customer',
          p_actor_ref,
          v_now,
          null
        )
        returning id into v_profile_id;

        v_profile_created := true;
      end if;
    end if;

    if v_failure_stage = 'after_profile' then
      raise exception 'proof_failure_after_profile';
    end if;

    select pg_catalog.count(*)
      into v_case_count
    from public.app_customer_dossiers d
    join public.app_cases c
      on c.customer_id = d.customer_id
     and c.source_class = 'app_customer_dossier'
     and c.source_ref = d.id::text
    where d.customer_id = v_customer_id
      and d.minimized_at is null
      and d.status <> 'expired_minimized';

    if v_case_count <> v_dossier_count then
      raise exception 'canonical customer case coverage unavailable';
    end if;

    for v_case in
      select c.id
      from public.app_customer_dossiers d
      join public.app_cases c
        on c.customer_id = d.customer_id
       and c.source_class = 'app_customer_dossier'
       and c.source_ref = d.id::text
      where d.customer_id = v_customer_id
        and d.minimized_at is null
        and d.status <> 'expired_minimized'
      order by c.id
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_case.id::text, 0)
      );

      select
        pg_catalog.count(*),
        pg_catalog.count(*) filter (
          where r.party_id = v_party_id
            and r.claim_status = 'asserted'
            and (
              (
                v_party_kind = 'natural_person'
                and r.person_profile_version_id = v_profile_id
                and r.organization_profile_version_id is null
              )
              or
              (
                v_party_kind = 'organization'
                and r.organization_profile_version_id = v_profile_id
                and r.person_profile_version_id is null
              )
            )
        )
        into v_current_role_count, v_matching_role_count
      from public.app_case_party_roles r
      where r.case_id = v_case.id
        and r.role_type = 'service_recipient'
        and not exists (
          select 1
          from public.app_case_party_roles successor
          where successor.supersedes_id = r.id
        );

      if v_current_role_count > 1
         or (
           v_current_role_count = 1
           and v_matching_role_count <> 1
         ) then
        raise exception using
          errcode = 'P2004',
          message = 'party_role_conflict';
      end if;

      if v_current_role_count = 1 then
        v_role_resolved_count := v_role_resolved_count + 1;
      else
        insert into public.app_case_party_roles (
          case_id,
          party_id,
          person_profile_version_id,
          organization_profile_version_id,
          role_type,
          claim_status,
          valid_from,
          valid_to,
          recorded_at,
          recorded_by_actor_type,
          recorded_by_actor_ref,
          source_class,
          source_ref,
          request_id,
          decision_at,
          decided_by_actor_type,
          decided_by_actor_ref,
          decision_reason,
          supersedes_id,
          supersession_reason
        )
        values (
          v_case.id,
          v_party_id,
          case
            when v_party_kind = 'natural_person' then v_profile_id
            else null
          end,
          case
            when v_party_kind = 'organization' then v_profile_id
            else null
          end,
          'service_recipient',
          'asserted',
          v_now,
          null,
          v_now,
          'customer',
          p_actor_ref,
          'signup_applicant_declaration',
          v_source.id::text,
          p_request_id,
          null,
          null,
          null,
          null,
          null,
          null
        );

        v_role_created_count := v_role_created_count + 1;
      end if;
    end loop;

    if v_failure_stage = 'after_roles' then
      raise exception 'proof_failure_after_roles';
    end if;

    select pg_catalog.count(*)
      into v_audit_count
    from public.app_audit_events a
    where a.event_type =
        'declared_profile_asserted_service_recipient_linked'
      and a.customer_id = v_customer_id
      and a.idempotency_key = p_idempotency_key;

    if v_audit_count > 1 then
      raise exception 'ambiguous declared profile activation audit';
    end if;

    if not (
      coalesce(
        (v_v3_response ->> 'replayed')::boolean,
        false
      )
      and v_audit_count = 1
    ) then
      if v_audit_count <> 0 then
        raise exception 'conflicting declared profile activation audit';
      end if;

      if v_failure_stage = 'during_audit' then
        raise exception 'proof_failure_during_audit';
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
        event_data,
        created_at
      )
      values (
        'declared_profile_asserted_service_recipient_linked',
        'customer',
        v_customer_id,
        v_customer_id,
        null,
        p_request_id,
        p_idempotency_key,
        'customer',
        p_actor_ref,
        p_ip_hash,
        p_user_agent_hash,
        pg_catalog.jsonb_build_object(
          'request_id', p_request_id,
          'customer_reference', v_customer_id,
          'party_reference', v_party_id,
          'canonical_declaration_source_reference', v_source.id,
          'profile_reference', v_profile_id,
          'profile_outcome',
            case when v_profile_created then 'created' else 'resolved' end,
          'asserted_case_claim_created_count', v_role_created_count,
          'asserted_case_claim_resolved_count', v_role_resolved_count,
          'idempotency_scope', p_idempotency_scope,
          'idempotency_key', p_idempotency_key,
          'environment', p_environment,
          'recorded_at', v_now
        ),
        v_now
      );
    end if;

    update public.app_idempotency_keys
    set response_status = 200,
        response_body = v_v3_response,
        completed_at = v_now
    where scope = p_idempotency_scope
      and key = p_idempotency_key
      and payload_hash = p_payload_hash;

    if not found then
      raise exception 'v4 idempotency finalize failed';
    end if;

    return v_v3_response;
  exception
    when sqlstate 'P2001' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'party_declaration_incomplete',
        'error', 'Profielgegevens zijn nog niet volledig beschikbaar.'
      );
    when sqlstate 'P2002' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'party_declaration_conflict',
        'error', 'Profielgegevens vereisen handmatige controle.'
      );
    when sqlstate 'P2003' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'party_profile_conflict',
        'error', 'Profielgegevens vereisen handmatige controle.'
      );
    when sqlstate 'P2004' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'party_role_conflict',
        'error', 'Dossierrollen vereisen handmatige controle.'
      );
  end;
end;
$$;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v4(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_bootstrap_customer_auth_v4(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) IS 'Atomic service-role-only auth bootstrap v4. It reuses v3, promotes complete equivalent immutable signup declarations to one declared WP2A profile using Europe/Amsterdam business-date mapping, and creates or resolves one non-operational asserted service_recipient claim per canonical case. No verified identity, KvK, address, authority, mandate, EAN, eligibility or evidence truth.';


--
-- Name: app_bootstrap_customer_auth_v5(uuid, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_bootstrap_customer_auth_v5(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := now();
  v_auth_user record;
  v_identity public.app_customer_identities%rowtype;
  v_customer public.app_customers%rowtype;
  v_idem public.app_idempotency_keys%rowtype;
  v_any_identity_count integer;
  v_active_identity_count integer;
  v_signed_case_count integer;
  v_case_count integer;
  v_incompatible_count integer;
  v_inserted integer;
  v_cases jsonb;
  v_legacy_bootstrap jsonb;
  v_response jsonb;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_email_normalized is null or btrim(p_email_normalized) = ''
     or p_actor_ref <> 'supabase_auth_user:' || p_auth_user_id::text then
    raise exception 'invalid auth bootstrap input';
  end if;

  select id, lower(email) as email_normalized,
         coalesce(email_confirmed_at, confirmed_at) as verified_at
    into v_auth_user
  from auth.users
  where id = p_auth_user_id;
  if not found or v_auth_user.verified_at is null
     or v_auth_user.email_normalized is distinct from lower(btrim(p_email_normalized)) then
    raise exception 'verified auth user mismatch';
  end if;

  select count(*) into v_any_identity_count
  from public.app_customer_identities
  where email_normalized = lower(btrim(p_email_normalized));
  select count(*) into v_active_identity_count
  from public.app_customer_identities
  where email_normalized = lower(btrim(p_email_normalized))
    and status = 'active';

  if v_active_identity_count = 0 then
    return jsonb_build_object(
      'ok', false, 'status', 404,
      'code', 'customer_identity_not_found',
      'error', 'Klantidentiteit niet gevonden.'
    );
  end if;
  if v_any_identity_count <> v_active_identity_count
     or v_active_identity_count <> 1 then
    return jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'customer_identity_binding_ambiguous',
      'error', 'Klantidentiteit kan niet automatisch worden gekoppeld.'
    );
  end if;

  select * into strict v_identity
  from public.app_customer_identities
  where email_normalized = lower(btrim(p_email_normalized))
    and status = 'active'
  for update;

  select count(*) into v_signed_case_count
  from public.app_signup_promotions promotion
  join public.app_cases app_case on app_case.id = promotion.case_id
  where promotion.customer_id = v_identity.customer_id
    and app_case.customer_id = v_identity.customer_id
    and app_case.source_class = 'signed_signup_intake';

  if v_signed_case_count = 0 then
    return public.app_bootstrap_customer_auth_v4(
      p_auth_user_id, p_email_normalized, p_actor_ref, p_request_id,
      p_idempotency_scope, p_idempotency_key, p_payload_hash,
      p_ip_hash, p_user_agent_hash, p_environment
    );
  end if;

  if exists (
    select 1
    from public.app_customer_dossiers dossier
    where dossier.customer_id = v_identity.customer_id
      and dossier.minimized_at is null
      and dossier.status <> 'expired_minimized'
      and not exists (
        select 1
        from public.app_cases app_case
        where app_case.customer_id = dossier.customer_id
          and app_case.source_class = 'app_customer_dossier'
          and app_case.source_ref = dossier.id::text
      )
  ) then
    v_legacy_bootstrap := public.app_bootstrap_customer_auth_v4(
      p_auth_user_id, p_email_normalized, p_actor_ref, p_request_id,
      p_idempotency_scope || ':legacy_activation',
      p_idempotency_key || ':legacy_activation', p_payload_hash,
      p_ip_hash, p_user_agent_hash, p_environment
    );
    if coalesce((v_legacy_bootstrap ->> 'ok')::boolean, false) is not true then
      return v_legacy_bootstrap;
    end if;
    select * into strict v_identity
    from public.app_customer_identities
    where email_normalized = lower(btrim(p_email_normalized))
      and status = 'active'
    for update;
  end if;

  if v_identity.auth_user_id is not null
     and v_identity.auth_user_id <> p_auth_user_id then
    return jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'customer_identity_already_bound',
      'error', 'Klantidentiteit is al gekoppeld.'
    );
  end if;

  select * into v_customer
  from public.app_customers
  where id = v_identity.customer_id
  for update;
  if not found or v_customer.status <> 'active' then
    return jsonb_build_object(
      'ok', false, 'status', 403,
      'code', 'customer_inactive',
      'error', 'Klantaccount is niet actief.'
    );
  end if;

  select count(*) into v_incompatible_count
  from (
    select dossier.id
    from public.app_customer_dossiers dossier
    left join public.app_cases app_case
      on app_case.customer_id = dossier.customer_id
     and app_case.source_class = 'app_customer_dossier'
     and app_case.source_ref = dossier.id::text
    where dossier.customer_id = v_customer.id
      and dossier.minimized_at is null
      and dossier.status <> 'expired_minimized'
    group by dossier.id
    having count(app_case.id) <> 1

    union all

    select promotion.id
    from public.app_signup_promotions promotion
    left join public.app_cases app_case on app_case.id = promotion.case_id
    where promotion.customer_id = v_customer.id
      and (
        app_case.id is null
        or app_case.customer_id <> v_customer.id
        or app_case.source_class <> 'signed_signup_intake'
        or app_case.source_ref <> promotion.intake_id::text
        or promotion.account_type <> v_customer.customer_type
      )
  ) incompatible;
  if v_incompatible_count <> 0 then
    return jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'customer_identity_binding_ambiguous',
      'error', 'Klantidentiteit kan niet automatisch worden gekoppeld.'
    );
  end if;

  insert into public.app_idempotency_keys (
    scope, key, payload_hash, locked_at, expires_at
  ) values (
    p_idempotency_scope, p_idempotency_key, p_payload_hash,
    v_now, v_now + interval '24 hours'
  ) on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem
  from public.app_idempotency_keys
  where scope = p_idempotency_scope and key = p_idempotency_key
  for update;
  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'idempotency_conflict',
      'error', 'Aanvraag is al gebruikt met andere inhoud.'
    );
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'request_in_progress',
      'error', 'Aanvraag wordt al verwerkt.'
    );
  end if;

  if v_identity.auth_user_id is null then
    update public.app_customer_identities
    set auth_user_id = p_auth_user_id,
        email_verified_at = coalesce(
          email_verified_at,
          v_auth_user.verified_at,
          v_now
        ),
        identity_provider = 'supabase',
        last_login_at = v_now
    where id = v_identity.id and auth_user_id is null and status = 'active';
    if not found then raise exception 'identity binding race lost'; end if;
  else
    update public.app_customer_identities
    set email_verified_at = coalesce(
          email_verified_at,
          v_auth_user.verified_at,
          v_now
        ),
        identity_provider = 'supabase',
        last_login_at = v_now
    where id = v_identity.id and auth_user_id = p_auth_user_id
      and status = 'active';
    if not found then raise exception 'identity same-user refresh failed'; end if;
  end if;

  with normalized_cases as (
    select
      dossier.id as dossier_id,
      dossier.dossier_number,
      dossier.account_type,
      dossier.status,
      app_case.id as case_id,
      app_case.case_reference,
      dossier.created_at,
      0 as source_order
    from public.app_customer_dossiers dossier
    join public.app_cases app_case
      on app_case.customer_id = dossier.customer_id
     and app_case.source_class = 'app_customer_dossier'
     and app_case.source_ref = dossier.id::text
    where dossier.customer_id = v_customer.id
      and dossier.minimized_at is null
      and dossier.status <> 'expired_minimized'

    union all

    select
      app_case.id as dossier_id,
      app_case.case_reference as dossier_number,
      promotion.account_type,
      lifecycle.lifecycle_state as status,
      app_case.id as case_id,
      app_case.case_reference,
      app_case.created_at,
      1 as source_order
    from public.app_signup_promotions promotion
    join public.app_cases app_case on app_case.id = promotion.case_id
    join lateral (
      select event.lifecycle_state
      from public.app_case_lifecycle_events event
      where event.case_id = app_case.id
      order by event.event_at desc, event.id desc
      limit 1
    ) lifecycle on true
    where promotion.customer_id = v_customer.id
      and app_case.customer_id = v_customer.id
      and app_case.source_class = 'signed_signup_intake'
      and app_case.source_ref = promotion.intake_id::text
  )
  select jsonb_agg(
    jsonb_build_object(
      'dossier_id', normalized.dossier_id,
      'dossier_number', normalized.dossier_number,
      'account_type', normalized.account_type,
      'status', normalized.status,
      'case_id', normalized.case_id,
      'case_reference', normalized.case_reference
    ) order by normalized.created_at, normalized.source_order, normalized.case_id
  ) into v_cases
  from normalized_cases normalized;

  v_case_count := jsonb_array_length(coalesce(v_cases, '[]'::jsonb));
  if v_case_count = 0 then
    return jsonb_build_object(
      'ok', false, 'status', 404,
      'code', 'customer_dossier_not_found',
      'error', 'Geen dossier gevonden.'
    );
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'mode', 'auth_bootstrap_v2',
    'request_id', p_request_id,
    'customer_id', v_customer.id,
    'identity_id', v_identity.id,
    'identity_status', 'active',
    'binding_status', 'bound',
    'dossiers', v_cases,
    'payload_hash', p_payload_hash,
    'replayed', false
  );

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, customer_id, dossier_id,
    request_id, idempotency_key, actor_type, actor_ref,
    ip_hash, user_agent_hash, event_data
  ) values (
    'customer_auth_bootstrap_completed', 'auth', v_identity.id,
    v_customer.id, null, p_request_id, p_idempotency_key, 'customer',
    p_actor_ref, p_ip_hash, p_user_agent_hash,
    jsonb_build_object(
      'environment', p_environment,
      'binding_status', 'bound',
      'case_count', v_case_count,
      'case_source', 'normalized_customer_cases'
    )
  );

  update public.app_idempotency_keys
  set response_status = 200, response_body = v_response, completed_at = v_now
  where scope = p_idempotency_scope and key = p_idempotency_key;
  return v_response;
end;
$_$;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v5(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_bootstrap_customer_auth_v5(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) IS 'Binds verified Supabase Auth to one exact active identity and returns the normalized lineage-backed union of accessible legacy dossiers and signed-signup cases. Creates no customer, case or dossier.';


--
-- Name: app_bootstrap_customer_auth_v6(uuid, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_bootstrap_customer_auth_v6(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_auth_user record;
  v_identity public.app_customer_identities%rowtype;
  v_access_count integer;
  v_case_count integer;
  v_cases jsonb;
  v_legacy jsonb;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_email_normalized is null
     or btrim(p_email_normalized) = ''
     or p_actor_ref <> 'supabase_auth_user:' || p_auth_user_id::text then
    raise exception 'invalid auth bootstrap input';
  end if;

  select id, lower(email) as email_normalized,
         coalesce(email_confirmed_at, confirmed_at) as verified_at
  into v_auth_user
  from auth.users
  where id = p_auth_user_id
    and deleted_at is null;
  if not found
     or v_auth_user.verified_at is null
     or v_auth_user.email_normalized is distinct from
        lower(btrim(p_email_normalized)) then
    raise exception 'verified auth user mismatch';
  end if;

  v_access_count := public.app_sync_auth_customer_access_v1(
    p_auth_user_id,
    p_request_id
  );

  if v_access_count = 0 then
    v_legacy := public.app_bootstrap_customer_auth_v5(
      p_auth_user_id, p_email_normalized, p_actor_ref, p_request_id,
      p_idempotency_scope, p_idempotency_key, p_payload_hash,
      p_ip_hash, p_user_agent_hash, p_environment
    );
    if coalesce((v_legacy ->> 'ok')::boolean, false) is not true then
      return v_legacy;
    end if;
    perform public.app_sync_auth_customer_access_v1(
      p_auth_user_id,
      p_request_id
    );
    return v_legacy;
  end if;

  select * into v_identity
  from public.app_customer_identities identity_row
  where identity_row.auth_user_id = p_auth_user_id
    and identity_row.status = 'active'
  order by identity_row.created_at, identity_row.id
  limit 1;

  if not found then
    select identity_row.* into v_identity
    from public.app_customer_access_grants access_grant
    join public.app_customer_identities identity_row
      on identity_row.customer_id = access_grant.customer_id
     and identity_row.status = 'active'
     and identity_row.auth_user_id is null
     and identity_row.email_normalized = v_auth_user.email_normalized
    where access_grant.auth_user_id = p_auth_user_id
    order by access_grant.created_at, access_grant.id,
             identity_row.created_at, identity_row.id
    limit 1
    for update of identity_row;
    if not found then
      return jsonb_build_object(
        'ok', false, 'status', 409,
        'code', 'customer_identity_binding_ambiguous',
        'error', 'Klantidentiteit kan niet automatisch worden gekoppeld.'
      );
    end if;
    update public.app_customer_identities
    set auth_user_id = p_auth_user_id,
        email_verified_at = coalesce(email_verified_at, v_auth_user.verified_at),
        identity_provider = 'supabase',
        last_login_at = now()
    where id = v_identity.id
      and auth_user_id is null
      and status = 'active';
    if not found then raise exception 'primary identity binding race lost'; end if;
  else
    update public.app_customer_identities
    set email_verified_at = coalesce(email_verified_at, v_auth_user.verified_at),
        identity_provider = 'supabase',
        last_login_at = now()
    where id = v_identity.id
      and auth_user_id = p_auth_user_id
      and status = 'active';
  end if;

  with accessible_customers as (
    select access_grant.customer_id
    from public.app_customer_access_grants access_grant
    join public.app_customers customer_row
      on customer_row.id = access_grant.customer_id
     and customer_row.status = 'active'
    where access_grant.auth_user_id = p_auth_user_id
  ), normalized_cases as (
    select
      dossier.id as dossier_id,
      dossier.dossier_number,
      dossier.account_type,
      dossier.status,
      app_case.id as case_id,
      app_case.case_reference,
      dossier.created_at,
      0 as source_order
    from accessible_customers access_customer
    join public.app_customer_dossiers dossier
      on dossier.customer_id = access_customer.customer_id
     and dossier.minimized_at is null
     and dossier.status <> 'expired_minimized'
    join public.app_cases app_case
      on app_case.customer_id = dossier.customer_id
     and app_case.source_class = 'app_customer_dossier'
     and app_case.source_ref = dossier.id::text

    union all

    select
      app_case.id,
      app_case.case_reference,
      promotion.account_type,
      lifecycle.lifecycle_state,
      app_case.id,
      app_case.case_reference,
      app_case.created_at,
      1
    from accessible_customers access_customer
    join public.app_signup_promotions promotion
      on promotion.customer_id = access_customer.customer_id
    join public.app_cases app_case
      on app_case.id = promotion.case_id
     and app_case.customer_id = promotion.customer_id
     and app_case.source_class = 'signed_signup_intake'
     and app_case.source_ref = promotion.intake_id::text
    join lateral (
      select event.lifecycle_state
      from public.app_case_lifecycle_events event
      where event.case_id = app_case.id
      order by event.event_at desc, event.id desc
      limit 1
    ) lifecycle on true
  )
  select jsonb_agg(
    jsonb_build_object(
      'dossier_id', normalized.dossier_id,
      'dossier_number', normalized.dossier_number,
      'account_type', normalized.account_type,
      'status', normalized.status,
      'case_id', normalized.case_id,
      'case_reference', normalized.case_reference
    ) order by normalized.created_at, normalized.source_order,
               normalized.case_id
  ) into v_cases
  from normalized_cases normalized;

  v_case_count := jsonb_array_length(coalesce(v_cases, '[]'::jsonb));
  if v_case_count = 0 then
    return jsonb_build_object(
      'ok', false, 'status', 404,
      'code', 'customer_dossier_not_found',
      'error', 'Geen dossier gevonden.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'mode', 'auth_bootstrap_v3',
    'request_id', p_request_id,
    'customer_id', v_identity.customer_id,
    'identity_id', v_identity.id,
    'identity_status', 'active',
    'binding_status', 'bound',
    'dossiers', v_cases,
    'payload_hash', p_payload_hash,
    'replayed', false
  );
end;
$_$;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v6(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_bootstrap_customer_auth_v6(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) IS 'Returns the lineage-backed union of all customer contexts explicitly accessible to one verified Auth principal.';


--
-- Name: app_case_location_relations_insert_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_case_location_relations_insert_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  predecessor public.app_case_location_relations%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'case_location:v1:' ||
      new.case_id::text || ':' || new.location_id::text,
      0
    )
  );

  if new.supersedes_relation_event_id is null then
    if new.event_type <> 'linked' then
      raise exception 'case location relation root must be linked'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.app_case_location_relations link_event
      where link_event.case_id = new.case_id
        and link_event.location_id = new.location_id
        and link_event.event_type = 'linked'
        and link_event.effective_at
          < coalesce(new.valid_until, 'infinity'::timestamptz)
        and new.effective_at < least(
          coalesce(link_event.valid_until, 'infinity'::timestamptz),
          coalesce(
            (
              select unlink_event.effective_at
              from public.app_case_location_relations unlink_event
              where unlink_event.relation_id = link_event.relation_id
                and unlink_event.event_type = 'unlinked'
              order by unlink_event.effective_at
              limit 1
            ),
            'infinity'::timestamptz
          )
        )
    ) then
      raise exception 'overlapping case location relations are not allowed'
        using errcode = '23514';
    end if;
  else
    select *
    into predecessor
    from public.app_case_location_relations
    where id = new.supersedes_relation_event_id
    for update;

    if not found
       or predecessor.event_type <> 'linked'
       or new.event_type <> 'unlinked'
       or new.relation_id <> predecessor.relation_id
       or new.case_id <> predecessor.case_id
       or new.location_id <> predecessor.location_id
       or new.effective_at <= predecessor.effective_at
       or new.recorded_at <= predecessor.recorded_at
       or (
         predecessor.valid_until is not null
         and new.effective_at > predecessor.valid_until
       )
       or exists (
         select 1
         from public.app_case_location_relations successor
         where successor.supersedes_relation_event_id = predecessor.id
       ) then
      raise exception 'invalid case location unlink'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: app_case_party_roles_deferred_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_case_party_roles_deferred_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if exists (
    select 1
    from public.app_case_party_roles role_version
    where role_version.case_id = new.case_id
    group by role_version.role_claim_id
    having count(*) filter (where role_version.supersedes_id is null) <> 1
  ) then
    raise exception 'app_case_party_roles claim chains require exactly one root';
  end if;

  if exists (
    with recursive supersession_walk as (
      select
        role_version.id as start_id,
        role_version.id as current_id,
        role_version.supersedes_id,
        array[role_version.id]::uuid[] as visited,
        false as cycle_found
      from public.app_case_party_roles role_version
      where role_version.case_id = new.case_id

      union all

      select
        walk.start_id,
        predecessor.id,
        predecessor.supersedes_id,
        walk.visited || predecessor.id,
        predecessor.id = any(walk.visited)
      from supersession_walk walk
      join public.app_case_party_roles predecessor
        on predecessor.id = walk.supersedes_id
      where walk.supersedes_id is not null
        and not walk.cycle_found
    )
    select 1
    from supersession_walk
    where cycle_found
  ) then
    raise exception 'app_case_party_roles supersession cycles are not allowed';
  end if;

  if exists (
    select 1
    from public.app_case_party_roles successor
    join public.app_case_party_roles predecessor
      on predecessor.id = successor.supersedes_id
    where successor.case_id = new.case_id
      and (
        successor.role_claim_id <> predecessor.role_claim_id
        or successor.case_id <> predecessor.case_id
        or successor.party_id <> predecessor.party_id
        or successor.role_type <> predecessor.role_type
        or successor.recorded_at <= predecessor.recorded_at
      )
  ) then
    raise exception 'app_case_party_roles supersession chain is not linear';
  end if;

  if exists (
    with terminal_operational as (
      select role_version.*
      from public.app_case_party_roles role_version
      where role_version.case_id = new.case_id
        and role_version.claim_status = 'case_confirmed'
        and not exists (
          select 1
          from public.app_case_party_roles successor
          where successor.supersedes_id = role_version.id
        )
    )
    select 1
    from terminal_operational left_role
    join terminal_operational right_role
      on left_role.id < right_role.id
     and left_role.case_id = right_role.case_id
     and left_role.role_type = 'service_recipient'
     and right_role.role_type = 'service_recipient'
     and (
       left_role.valid_to is null
       or right_role.valid_from < left_role.valid_to
     )
     and (
       right_role.valid_to is null
       or left_role.valid_from < right_role.valid_to
     )
  ) then
    raise exception 'overlapping operational service_recipients are not allowed per case';
  end if;

  if exists (
    with terminal_operational as (
      select role_version.*
      from public.app_case_party_roles role_version
      where role_version.case_id = new.case_id
        and role_version.claim_status = 'case_confirmed'
        and not exists (
          select 1
          from public.app_case_party_roles successor
          where successor.supersedes_id = role_version.id
        )
    )
    select 1
    from terminal_operational left_role
    join terminal_operational right_role
      on left_role.id < right_role.id
     and left_role.case_id = right_role.case_id
     and left_role.party_id = right_role.party_id
     and left_role.role_type = right_role.role_type
     and (
       left_role.valid_to is null
       or right_role.valid_from < left_role.valid_to
     )
     and (
       right_role.valid_to is null
       or left_role.valid_from < right_role.valid_to
     )
  ) then
    raise exception 'overlapping operational case roles are not allowed for the same party and role';
  end if;

  return null;
end;
$$;


--
-- Name: app_case_party_roles_insert_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_case_party_roles_insert_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_actor_types constant text[] := array[
    'customer',
    'system',
    'support',
    'admin',
    'edge_function',
    'worker',
    'provider',
    'unknown'
  ];
  v_party_kind text;
  v_profile_party_id uuid;
  v_predecessor public.app_case_party_roles%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.case_id::text, 0)
  );

  if not exists (
    select 1
    from public.app_cases
    where id = new.case_id
  ) then
    raise exception 'app_case_party_roles require an existing case';
  end if;

  if new.recorded_by_actor_type <> all(v_actor_types) then
    raise exception 'invalid recorded_by_actor_type for app_case_party_roles';
  end if;

  if new.decided_by_actor_type is not null
     and new.decided_by_actor_type <> all(v_actor_types) then
    raise exception 'invalid decided_by_actor_type for app_case_party_roles';
  end if;

  if btrim(new.recorded_by_actor_ref) = ''
     or btrim(new.source_class) = ''
     or btrim(new.source_ref) = ''
     or btrim(new.request_id) = '' then
    raise exception 'app_case_party_roles provenance references must be nonblank';
  end if;

  if new.claim_status = 'asserted' then
    if new.decision_at is not null
       or new.decided_by_actor_type is not null
       or new.decided_by_actor_ref is not null
       or new.decision_reason is not null then
      raise exception 'asserted app_case_party_roles require null decision metadata';
    end if;
  elsif new.decision_at is null
     or new.decided_by_actor_type is null
     or new.decided_by_actor_ref is null
     or btrim(new.decided_by_actor_ref) = ''
     or new.decision_reason is null
     or btrim(new.decision_reason) = '' then
    raise exception 'decided app_case_party_roles require complete decision metadata';
  end if;

  select party_kind
  into v_party_kind
  from public.app_parties
  where id = new.party_id;

  if not found then
    raise exception 'app_case_party_roles require an existing party';
  end if;

  if new.person_profile_version_id is not null then
    select party_id
    into v_profile_party_id
    from public.app_party_person_versions
    where id = new.person_profile_version_id;

    if not found or v_profile_party_id <> new.party_id then
      raise exception 'person profile version must belong to the role party';
    end if;

    if v_party_kind <> 'natural_person'
       or new.organization_profile_version_id is not null then
      raise exception 'natural_person roles require only a person profile version';
    end if;
  elsif new.organization_profile_version_id is not null then
    select party_id
    into v_profile_party_id
    from public.app_party_organization_versions
    where id = new.organization_profile_version_id;

    if not found or v_profile_party_id <> new.party_id then
      raise exception 'organization profile version must belong to the role party';
    end if;

    if v_party_kind <> 'organization'
       or new.person_profile_version_id is not null then
      raise exception 'organization roles require only an organization profile version';
    end if;
  else
    raise exception 'app_case_party_roles require exactly one profile version';
  end if;

  if new.role_type = 'case_contact'
     and v_party_kind <> 'natural_person' then
    raise exception 'case_contact requires a natural_person party';
  end if;

  if new.supersedes_id is not null then
    select *
    into v_predecessor
    from public.app_case_party_roles
    where id = new.supersedes_id
    for update;

    if not found then
      raise exception 'app_case_party_roles predecessor does not exist';
    end if;

    if exists (
      select 1
      from public.app_case_party_roles successor
      where successor.supersedes_id = v_predecessor.id
    ) then
      raise exception 'app_case_party_roles predecessor must be terminal';
    end if;

    if new.role_claim_id <> v_predecessor.role_claim_id
       or new.case_id <> v_predecessor.case_id
       or new.party_id <> v_predecessor.party_id
       or new.role_type <> v_predecessor.role_type then
      raise exception 'app_case_party_roles successor must preserve chain, case, party, and role';
    end if;

    if new.recorded_at <= v_predecessor.recorded_at then
      raise exception 'app_case_party_roles successor recorded_at must increase';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: app_confirm_document_upload_v1(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_confirm_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_detected_mime_type text, p_stored_size_bytes bigint, p_server_sha256 text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
declare
  v_identity record;
  v_dossier record;
  v_slot record;
  v_file record;
  v_idem record;
  v_current_version record;
  v_new_version_id uuid := gen_random_uuid();
  v_next_version_number integer;
  v_confirmed_at timestamptz := now();
  v_response jsonb;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload hash';
  end if;

  if p_server_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid server sha256';
  end if;

  if p_actor_ref <> ('app_customer_identity:' || p_identity_id::text) then
    raise exception 'actor reference mismatch';
  end if;

  select id, customer_id, status
    into v_identity
  from public.app_customer_identities
  where id = p_identity_id
    and customer_id = p_customer_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'identity not found or inactive';
  end if;

  select id, customer_id, status
    into v_dossier
  from public.app_customer_dossiers
  where id = p_dossier_id
    and customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'dossier not found or forbidden';
  end if;

  select *
    into v_slot
  from public.app_dossier_document_slots
  where id = p_document_slot_id
    and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'document slot not found';
  end if;

  select *
    into v_file
  from public.app_dossier_document_files
  where id = p_document_file_id
    and document_slot_id = p_document_slot_id
    and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'document file not found';
  end if;

  if v_file.status not in ('issued', 'uploaded') then
    raise exception 'document file is not confirmable';
  end if;

  if v_file.expires_at <= now() then
    raise exception 'document file expired';
  end if;

  select *
    into v_idem
  from public.app_idempotency_keys
  where scope = p_idempotency_scope
    and key = p_idempotency_key
  for update;

  if not found then
    raise exception 'idempotency row missing';
  end if;

  if v_idem.payload_hash <> p_payload_hash then
    raise exception 'idempotency payload conflict';
  end if;

  if v_idem.response_status is not null or v_idem.response_body is not null then
    raise exception 'idempotency already completed';
  end if;

  if exists (
    select 1
    from public.app_dossier_document_versions
    where document_file_id = p_document_file_id
  ) then
    raise exception 'document file already has a version';
  end if;

  if v_slot.current_version_id is not null then
    select *
      into v_current_version
    from public.app_dossier_document_versions
    where id = v_slot.current_version_id
      and document_slot_id = p_document_slot_id
      and dossier_id = p_dossier_id
    for update;

    if not found or v_current_version.status <> 'current' then
      raise exception 'current document version pointer is invalid';
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1
    into v_next_version_number
  from public.app_dossier_document_versions
  where document_slot_id = p_document_slot_id;

  update public.app_dossier_document_files
  set
    status = 'confirmed',
    detected_mime_type = p_detected_mime_type,
    stored_size_bytes = p_stored_size_bytes,
    server_sha256 = p_server_sha256,
    upload_observed_at = v_confirmed_at,
    confirmed_at = v_confirmed_at,
    confirmed_request_id = p_request_id
  where id = p_document_file_id
    and document_slot_id = p_document_slot_id
    and dossier_id = p_dossier_id
    and status in ('issued', 'uploaded');

  if not found then
    raise exception 'document file confirm transition failed';
  end if;

  insert into public.app_dossier_document_versions (
    id,
    dossier_id,
    document_slot_id,
    document_file_id,
    version_number,
    status,
    created_request_id,
    created_idempotency_key,
    confirmed_at,
    metadata
  )
  values (
    v_new_version_id,
    p_dossier_id,
    p_document_slot_id,
    p_document_file_id,
    v_next_version_number,
    'confirmed_pending_current',
    p_request_id,
    p_idempotency_key,
    v_confirmed_at,
    jsonb_build_object(
      'source', 'api-app-document-upload-confirm',
      'mode', 'upload_confirm_v1',
      'payload_hash', p_payload_hash,
      'verified_server_side', true,
      'detected_mime_type', p_detected_mime_type,
      'stored_size_bytes', p_stored_size_bytes,
      'server_sha256', p_server_sha256
    )
  );

  if v_slot.current_version_id is not null then
    update public.app_dossier_document_versions
    set
      status = 'superseded',
      replaced_by_version_id = v_new_version_id
    where id = v_slot.current_version_id
      and document_slot_id = p_document_slot_id
      and dossier_id = p_dossier_id
      and status = 'current';

    if not found then
      raise exception 'supersede current document version failed';
    end if;
  end if;

  update public.app_dossier_document_versions
  set status = 'current'
  where id = v_new_version_id
    and document_slot_id = p_document_slot_id
    and dossier_id = p_dossier_id
    and status = 'confirmed_pending_current';

  if not found then
    raise exception 'promote document version failed';
  end if;

  update public.app_dossier_document_slots
  set
    status = 'uploaded',
    current_version_id = v_new_version_id,
    current_version_number = v_next_version_number,
    file_object_path = v_file.storage_path,
    file_name = v_file.normalized_file_name,
    file_mime_type = p_detected_mime_type,
    file_size_bytes = p_stored_size_bytes,
    file_sha256 = p_server_sha256,
    uploaded_at = v_confirmed_at,
    verified_at = v_confirmed_at
  where id = p_document_slot_id
    and dossier_id = p_dossier_id;

  if not found then
    raise exception 'document slot current pointer update failed';
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'mode', 'upload_confirm_v1',
    'request_id', p_request_id,
    'document_file_id', p_document_file_id,
    'document_slot_id', p_document_slot_id,
    'document_version_id', v_new_version_id,
    'version_number', v_next_version_number,
    'status', 'confirmed',
    'file_sha256', p_server_sha256,
    'confirmed_at', v_confirmed_at,
    'payload_hash', p_payload_hash,
    'replayed', false
  );

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
    'document_upload_confirmed',
    'document',
    p_document_slot_id,
    p_customer_id,
    p_dossier_id,
    p_request_id,
    p_idempotency_key,
    'customer',
    p_actor_ref,
    p_ip_hash,
    p_user_agent_hash,
    jsonb_build_object(
      'environment', p_environment,
      'request_id', p_request_id,
      'idempotency_key', p_idempotency_key,
      'actor_ref', p_actor_ref,
      'customer_id', p_customer_id,
      'identity_id', p_identity_id,
      'dossier_id', p_dossier_id,
      'document_slot_id', p_document_slot_id,
      'document_file_id', p_document_file_id,
      'document_version_id', v_new_version_id,
      'version_number', v_next_version_number,
      'stage', 'confirmed',
      'status', 200,
      'declared_mime_type', v_file.declared_mime_type,
      'detected_mime_type', p_detected_mime_type,
      'declared_size_bytes', v_file.declared_size_bytes,
      'stored_size_bytes', p_stored_size_bytes,
      'client_sha256', v_file.client_sha256,
      'server_sha256', p_server_sha256,
      'verified_server_side', true,
      'confirmed_at', v_confirmed_at,
      'storage_bucket', v_file.storage_bucket,
      'storage_path_present', true
    )
  );

  update public.app_idempotency_keys
  set
    response_status = 200,
    response_body = v_response,
    completed_at = v_confirmed_at
  where scope = p_idempotency_scope
    and key = p_idempotency_key;

  if not found then
    raise exception 'idempotency finalize failed';
  end if;

  return v_response;
end;
$_$;


--
-- Name: FUNCTION app_confirm_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_detected_mime_type text, p_stored_size_bytes bigint, p_server_sha256 text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_confirm_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_detected_mime_type text, p_stored_size_bytes bigint, p_server_sha256 text) IS 'Atomic service-role-only transition for ENVAL /app upload confirm: file confirmed, immutable version created/promoted, slot current pointer updated, audit written, and idempotency finalized.';


--
-- Name: app_connection_declaration_sources_boundary_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_connection_declaration_sources_boundary_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_dossier_customer_id uuid;
  v_location_dossier_id uuid;
  v_location_client_id text;
begin
  select d.customer_id
    into v_dossier_customer_id
  from public.app_customer_dossiers d
  where d.id = new.dossier_id;

  select l.dossier_id, l.client_location_id
    into v_location_dossier_id, v_location_client_id
  from public.app_dossier_locations l
  where l.id = new.dossier_location_id;

  if v_dossier_customer_id is null
     or v_location_dossier_id is null
     or v_dossier_customer_id <> new.customer_id
     or v_location_dossier_id <> new.dossier_id
     or v_location_client_id is distinct from new.client_location_id
  then
    raise exception
      'app_connection_declaration_sources customer/dossier/location boundary mismatch';
  end if;

  return new;
end;
$$;


--
-- Name: app_connection_declaration_sources_immutable_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_connection_declaration_sources_immutable_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception
    'app_connection_declaration_sources rows are immutable and cannot be changed';
end;
$$;


--
-- Name: app_connection_ownership_periods_boundary_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_connection_ownership_periods_boundary_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  connection_customer_id uuid;
  connection_dossier_id uuid;
  dossier_customer_id uuid;
begin
  select customer_id, dossier_id into connection_customer_id, connection_dossier_id
  from public.app_connections
  where id = new.connection_id;

  select customer_id into dossier_customer_id
  from public.app_customer_dossiers
  where id = new.dossier_id;

  if connection_customer_id is null
     or connection_dossier_id is null
     or dossier_customer_id is null
     or connection_customer_id <> new.customer_id
     or connection_dossier_id <> new.dossier_id
     or dossier_customer_id <> new.customer_id then
    raise exception 'app_connection_ownership_periods customer/dossier/connection boundary mismatch';
  end if;

  return new;
end;
$$;


--
-- Name: app_connection_ownership_periods_overlap_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_connection_ownership_periods_overlap_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if new.claim_status in ('rejected', 'superseded') then
    return new;
  end if;

  if exists (
    select 1
    from public.app_connection_ownership_periods existing
    where existing.connection_id = new.connection_id
      and existing.id <> new.id
      and existing.claim_status not in ('rejected', 'superseded')
      and (existing.valid_to is null or new.valid_from < existing.valid_to)
      and (new.valid_to is null or existing.valid_from < new.valid_to)
  ) then
    raise exception 'overlapping app_connection_ownership_periods are not allowed for the same connection';
  end if;

  return new;
end;
$$;


--
-- Name: app_connection_ownership_periods_transition_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_connection_ownership_periods_transition_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if new.id is distinct from old.id
     or new.connection_id is distinct from old.connection_id
     or new.customer_id is distinct from old.customer_id
     or new.dossier_id is distinct from old.dossier_id
     or new.valid_from is distinct from old.valid_from
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable app_connection_ownership_periods core fields cannot be changed';
  end if;

  if old.claim_status in ('verified', 'rejected', 'superseded') then
    raise exception 'terminal app_connection_ownership_periods rows cannot be updated';
  end if;

  if new.claim_status is distinct from old.claim_status then
    if old.claim_status = 'declared' and new.claim_status in ('under_review', 'verified', 'rejected', 'superseded') then
      return new;
    end if;
    if old.claim_status = 'under_review' and new.claim_status in ('verified', 'rejected', 'superseded') then
      return new;
    end if;
    raise exception 'invalid app_connection_ownership_periods status transition from % to %', old.claim_status, new.claim_status;
  end if;

  return new;
end;
$$;


--
-- Name: app_connection_periods_boundary_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_connection_periods_boundary_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  connection_dossier_id uuid;
  location_dossier_id uuid;
begin
  select dossier_id into connection_dossier_id
  from public.app_connections
  where id = new.connection_id;

  select dossier_id into location_dossier_id
  from public.app_dossier_locations
  where id = new.location_id;

  if connection_dossier_id is null or location_dossier_id is null or connection_dossier_id <> location_dossier_id then
    raise exception 'app_connection_periods connection/location boundary mismatch';
  end if;

  return new;
end;
$$;


--
-- Name: app_connection_periods_overlap_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_connection_periods_overlap_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if new.status in ('rejected', 'superseded') then
    return new;
  end if;

  if exists (
    select 1
    from public.app_connection_periods existing
    where existing.connection_id = new.connection_id
      and existing.id <> new.id
      and existing.status not in ('rejected', 'superseded')
      and (existing.valid_to is null or new.valid_from < existing.valid_to)
      and (new.valid_to is null or existing.valid_from < new.valid_to)
  ) then
    raise exception 'overlapping app_connection_periods are not allowed for the same connection';
  end if;

  return new;
end;
$$;


--
-- Name: app_connection_periods_transition_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_connection_periods_transition_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if new.id is distinct from old.id
     or new.connection_id is distinct from old.connection_id
     or new.valid_from is distinct from old.valid_from
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable app_connection_periods core fields cannot be changed';
  end if;

  if old.status in ('verified', 'rejected', 'superseded') then
    raise exception 'terminal app_connection_periods rows cannot be updated';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'declared' and new.status in ('under_review', 'verified', 'rejected', 'superseded') then
      return new;
    end if;
    if old.status = 'under_review' and new.status in ('verified', 'rejected', 'superseded') then
      return new;
    end if;
    raise exception 'invalid app_connection_periods status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;


--
-- Name: app_connection_write_audit_event(text, uuid, uuid, uuid, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_connection_write_audit_event(p_event_type text, p_scope_id uuid, p_customer_id uuid, p_dossier_id uuid, p_request_id text, p_idempotency_key text, p_actor_type text, p_actor_ref text, p_event_data jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: app_connections_boundary_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_connections_boundary_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  dossier_customer_id uuid;
  location_dossier_id uuid;
begin
  select customer_id into dossier_customer_id
  from public.app_customer_dossiers
  where id = new.dossier_id;

  if dossier_customer_id is null or dossier_customer_id <> new.customer_id then
    raise exception 'app_connections customer/dossier boundary mismatch';
  end if;

  select dossier_id into location_dossier_id
  from public.app_dossier_locations
  where id = new.location_id;

  if location_dossier_id is null or location_dossier_id <> new.dossier_id then
    raise exception 'app_connections dossier/location boundary mismatch';
  end if;

  return new;
end;
$$;


--
-- Name: app_connections_transition_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_connections_transition_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if new.id is distinct from old.id
     or new.customer_id is distinct from old.customer_id
     or new.dossier_id is distinct from old.dossier_id
     or new.location_id is distinct from old.location_id
     or new.ean_normalized is distinct from old.ean_normalized
     or new.connection_type is distinct from old.connection_type
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable app_connections core fields cannot be changed';
  end if;

  if old.status in ('verified', 'rejected', 'superseded') then
    raise exception 'terminal app_connections rows cannot be updated';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'declared' and new.status in ('under_review', 'verified', 'rejected', 'superseded') then
      return new;
    end if;
    if old.status = 'under_review' and new.status in ('verified', 'rejected', 'superseded') then
      return new;
    end if;
    raise exception 'invalid app_connections status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;


--
-- Name: app_correct_location_version_v1(uuid, uuid, uuid, timestamp with time zone, timestamp with time zone, timestamp with time zone, text, text, text, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_correct_location_version_v1(p_location_id uuid, p_observation_id uuid, p_predecessor_version_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_correction_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION app_correct_location_version_v1(p_location_id uuid, p_observation_id uuid, p_predecessor_version_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_correction_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_correct_location_version_v1(p_location_id uuid, p_observation_id uuid, p_predecessor_version_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_correction_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) IS 'Service-role-only immutable same-root correction successor. The predecessor is never mutated.';


--
-- Name: app_create_location_root_v1(text, text, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_create_location_root_v1(p_creation_basis text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION app_create_location_root_v1(p_creation_basis text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_create_location_root_v1(p_creation_basis text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) IS 'Service-role-only immutable location-root creation. No address, acceptance, population, projection, caller cutover, NEa, or verifier claim.';


--
-- Name: app_customer_access_grants_immutable_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_customer_access_grants_immutable_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'customer access grant is immutable';
end;
$$;


--
-- Name: app_customer_party_relationships_overlap_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_customer_party_relationships_overlap_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  perform 1
  from public.app_parties
  where id = new.party_id
  for update;

  if exists (
    select 1
    from public.app_customer_party_relationships existing
    where existing.customer_id = new.customer_id
      and existing.party_id = new.party_id
      and existing.relationship_role = new.relationship_role
      and existing.id <> new.id
      and existing.id is distinct from new.supersedes_relationship_id
      and not exists (
        select 1
        from public.app_customer_party_relationships successor
        where successor.supersedes_relationship_id = existing.id
      )
      and (existing.valid_to is null or new.valid_from < existing.valid_to)
      and (new.valid_to is null or existing.valid_from < new.valid_to)
  ) then
    raise exception 'overlapping active app_customer_party_relationships are not allowed for the same customer, party, and role';
  end if;

  return new;
end;
$$;


--
-- Name: app_decide_connection_ownership_v1(uuid, uuid, uuid, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_decide_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_decision text, p_decision_reason text, p_decision_actor_type text, p_decision_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: FUNCTION app_decide_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_decision text, p_decision_reason text, p_decision_actor_type text, p_decision_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_decide_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_decision text, p_decision_reason text, p_decision_actor_type text, p_decision_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) IS 'Gate 1 local service-role-only RPC. Records verified/rejected ownership decisions with reviewer metadata, idempotency, and audit.';


--
-- Name: app_declare_connection_ownership_v1(uuid, uuid, uuid, date, date, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_declare_connection_ownership_v1(p_connection_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_initial_status text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: FUNCTION app_declare_connection_ownership_v1(p_connection_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_initial_status text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_declare_connection_ownership_v1(p_connection_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_initial_status text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) IS 'Gate 1 local service-role-only RPC. Declares an ownership/aangeslotene claim with provenance, idempotency, and audit. Claims do not start verified.';


--
-- Name: app_declare_connection_v1(uuid, uuid, uuid, text, text, text, date, date, text, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_declare_connection_v1(p_customer_id uuid, p_dossier_id uuid, p_location_id uuid, p_ean_normalized text, p_connection_type text, p_declared_network_operator text, p_period_valid_from date, p_period_valid_to date, p_period_network_operator text, p_period_configuration_type text, p_source_type text, p_source_reference_type text, p_source_reference_id text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: FUNCTION app_declare_connection_v1(p_customer_id uuid, p_dossier_id uuid, p_location_id uuid, p_ean_normalized text, p_connection_type text, p_declared_network_operator text, p_period_valid_from date, p_period_valid_to date, p_period_network_operator text, p_period_configuration_type text, p_source_type text, p_source_reference_type text, p_source_reference_id text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_declare_connection_v1(p_customer_id uuid, p_dossier_id uuid, p_location_id uuid, p_ean_normalized text, p_connection_type text, p_declared_network_operator text, p_period_valid_from date, p_period_valid_to date, p_period_network_operator text, p_period_configuration_type text, p_source_type text, p_source_reference_type text, p_source_reference_id text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) IS 'Gate 1 local service-role-only RPC. Declares an EAN connection and optional initial connection period with scoped idempotency and audit. No CAR lookup or ownership verification.';


--
-- Name: app_dossier_document_files_transition_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_dossier_document_files_transition_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'DELETE' then
    raise exception 'app_dossier_document_files rows cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('confirmed', 'rejected', 'expired', 'abandoned') then
      raise exception 'terminal app_dossier_document_files rows cannot be updated';
    end if;

    if old.status = 'issued'
       and new.status not in ('uploaded', 'confirmed', 'rejected', 'expired', 'abandoned') then
      raise exception 'invalid app_dossier_document_files status transition from issued to %', new.status;
    end if;

    if old.status = 'uploaded'
       and new.status not in ('confirmed', 'rejected', 'expired', 'abandoned') then
      raise exception 'invalid app_dossier_document_files status transition from uploaded to %', new.status;
    end if;

    if new.dossier_id is distinct from old.dossier_id
       or new.document_slot_id is distinct from old.document_slot_id
       or new.issued_request_id is distinct from old.issued_request_id
       or new.issued_idempotency_key is distinct from old.issued_idempotency_key
       or new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.original_file_name is distinct from old.original_file_name
       or new.normalized_file_name is distinct from old.normalized_file_name
       or new.declared_mime_type is distinct from old.declared_mime_type
       or new.declared_size_bytes is distinct from old.declared_size_bytes
       or new.client_sha256 is distinct from old.client_sha256
       or new.issued_at is distinct from old.issued_at
       or new.expires_at is distinct from old.expires_at
       or new.metadata is distinct from old.metadata
       or new.created_at is distinct from old.created_at then
      raise exception 'immutable app_dossier_document_files fields cannot be changed';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: app_dossier_document_versions_transition_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_dossier_document_versions_transition_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'DELETE' then
    raise exception 'app_dossier_document_versions rows are immutable and cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'current'
       and new.status = 'superseded'
       and old.replaced_by_version_id is null
       and new.replaced_by_version_id is not null
       and new.replaced_by_version_id <> old.id
       and new.id is not distinct from old.id
       and new.dossier_id is not distinct from old.dossier_id
       and new.document_slot_id is not distinct from old.document_slot_id
       and new.document_file_id is not distinct from old.document_file_id
       and new.version_number is not distinct from old.version_number
       and new.created_request_id is not distinct from old.created_request_id
       and new.created_idempotency_key is not distinct from old.created_idempotency_key
       and new.confirmed_at is not distinct from old.confirmed_at
       and new.metadata is not distinct from old.metadata
       and new.created_at is not distinct from old.created_at then
      return new;
    end if;

    if old.status = 'current'
       and new.status = 'withdrawn'
       and new.id is not distinct from old.id
       and new.dossier_id is not distinct from old.dossier_id
       and new.document_slot_id is not distinct from old.document_slot_id
       and new.document_file_id is not distinct from old.document_file_id
       and new.version_number is not distinct from old.version_number
       and new.replaced_by_version_id is not distinct from old.replaced_by_version_id
       and new.created_request_id is not distinct from old.created_request_id
       and new.created_idempotency_key is not distinct from old.created_idempotency_key
       and new.confirmed_at is not distinct from old.confirmed_at
       and new.metadata is not distinct from old.metadata
       and new.created_at is not distinct from old.created_at then
      return new;
    end if;

    if old.status = 'confirmed_pending_current'
       and new.status = 'current'
       and new.id is not distinct from old.id
       and new.dossier_id is not distinct from old.dossier_id
       and new.document_slot_id is not distinct from old.document_slot_id
       and new.document_file_id is not distinct from old.document_file_id
       and new.version_number is not distinct from old.version_number
       and new.replaced_by_version_id is not distinct from old.replaced_by_version_id
       and new.created_request_id is not distinct from old.created_request_id
       and new.created_idempotency_key is not distinct from old.created_idempotency_key
       and new.confirmed_at is not distinct from old.confirmed_at
       and new.metadata is not distinct from old.metadata
       and new.created_at is not distinct from old.created_at then
      return new;
    end if;

    raise exception 'app_dossier_document_versions rows are immutable except allowed status transitions';
  end if;

  return new;
end;
$$;


--
-- Name: app_location_versions_deferred_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_location_versions_deferred_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if exists (
    with recursive lineage as (
      select
        v.id as start_id,
        v.id,
        v.supersedes_version_id,
        array[v.id] as visited,
        false as cycle_found
      from public.app_location_versions v
      where v.location_id = new.location_id

      union all

      select
        lineage.start_id,
        predecessor.id,
        predecessor.supersedes_version_id,
        lineage.visited || predecessor.id,
        predecessor.id = any(lineage.visited)
      from lineage
      join public.app_location_versions predecessor
        on predecessor.location_id = new.location_id
       and predecessor.id = lineage.supersedes_version_id
      where lineage.supersedes_version_id is not null
        and not lineage.cycle_found
    )
    select 1
    from lineage
    where cycle_found
  ) then
    raise exception
      'app_location_versions lineage cycle for location root'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.app_location_versions successor
    join public.app_location_versions predecessor
      on predecessor.location_id = successor.location_id
     and predecessor.id = successor.supersedes_version_id
    where successor.location_id = new.location_id
      and successor.recorded_at <= predecessor.recorded_at
  ) then
    raise exception
      'app_location_versions successor must be recorded later than predecessor'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.app_location_versions left_leaf
    join public.app_location_versions right_leaf
      on right_leaf.location_id = left_leaf.location_id
     and right_leaf.id > left_leaf.id
    where left_leaf.location_id = new.location_id
      and not exists (
        select 1
        from public.app_location_versions left_successor
        where left_successor.supersedes_version_id = left_leaf.id
      )
      and not exists (
        select 1
        from public.app_location_versions right_successor
        where right_successor.supersedes_version_id = right_leaf.id
      )
      and left_leaf.valid_from
            < coalesce(right_leaf.valid_to, 'infinity'::timestamptz)
      and right_leaf.valid_from
            < coalesce(left_leaf.valid_to, 'infinity'::timestamptz)
  ) then
    raise exception
      'app_location_versions leaf validity periods overlap for location root'
      using errcode = '23514';
  end if;

  return null;
end;
$$;


--
-- Name: FUNCTION app_location_versions_deferred_guard(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_location_versions_deferred_guard() IS 'Transaction-end guard for same-root lineage cycles, successor recorded order, and overlap among final leaf versions. No operational write RPC or concurrency route is implemented.';


--
-- Name: app_location_write_complete_v1(text, text, text, uuid, text, text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_location_write_complete_v1(p_scope text, p_key text, p_event_type text, p_scope_id uuid, p_request_id text, p_actor_type text, p_actor_ref text, p_event_data jsonb, p_response jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: FUNCTION app_location_write_complete_v1(p_scope text, p_key text, p_event_type text, p_scope_id uuid, p_request_id text, p_actor_type text, p_actor_ref text, p_event_data jsonb, p_response jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_location_write_complete_v1(p_scope text, p_key text, p_event_type text, p_scope_id uuid, p_request_id text, p_actor_type text, p_actor_ref text, p_event_data jsonb, p_response jsonb) IS 'Internal atomic fail-closed audit insertion and idempotency-response completion for bounded location writes.';


--
-- Name: app_location_write_idempotency_begin_v1(text, text, text, timestamp with time zone, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_location_write_idempotency_begin_v1(p_scope text, p_key text, p_payload_hash text, p_expires_at timestamp with time zone, p_actor_type text, p_actor_ref text, p_request_id text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: FUNCTION app_location_write_idempotency_begin_v1(p_scope text, p_key text, p_payload_hash text, p_expires_at timestamp with time zone, p_actor_type text, p_actor_ref text, p_request_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_location_write_idempotency_begin_v1(p_scope text, p_key text, p_payload_hash text, p_expires_at timestamp with time zone, p_actor_type text, p_actor_ref text, p_request_id text) IS 'Internal location-write idempotency reservation, replay, and conflict boundary. Uses caller-provided expiry and adds no TTL or cleanup.';


--
-- Name: app_location_write_lock_v1(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_location_write_lock_v1(p_lock_scope text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION app_location_write_lock_v1(p_lock_scope text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_location_write_lock_v1(p_lock_scope text) IS 'Internal transaction-level advisory-lock derivation for bounded location writes.';


--
-- Name: app_materialize_signed_signup_declared_data_v1(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_materialize_signed_signup_declared_data_v1(p_intake_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_promotion public.app_signup_promotions%rowtype;
  v_snapshot public.app_signup_signing_snapshots%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_charger_ref text;
  v_location_ref text;
  v_location_id uuid;
  v_charger_id uuid;
  v_brand text;
  v_model text;
  v_serial_number text;
  v_mid_identifier text;
  v_installation_date_text text;
  v_installation_year integer;
  v_backend_supplier text;
  v_solar_export_declaration text;
  v_distinct_count integer;
  v_source_location_count integer;
  v_durable_location_count integer;
  v_source_charger_count integer;
  v_evidence public.app_evidence_files%rowtype;
  v_source_file public.app_signup_intake_files%rowtype;
  v_context_location_id uuid;
  v_context_charger_id uuid;
  v_association_basis text;
  v_existing_declaration public.app_charger_declarations%rowtype;
  v_existing_context public.app_evidence_declaration_contexts%rowtype;
begin
  select * into strict v_promotion
  from public.app_signup_promotions
  where intake_id = p_intake_id;

  select * into strict v_snapshot
  from public.app_signup_signing_snapshots
  where id = v_promotion.signing_snapshot_id
    and intake_id = p_intake_id;

  select * into strict v_intake
  from public.app_signup_intakes
  where id = p_intake_id
    and status = 'promoted'
    and promotion_case_id = v_promotion.case_id;

  select count(distinct scope_item ->> 'location_id')
  into v_source_location_count
  from jsonb_array_elements(
    coalesce(
      (select mandate_content -> 'connection_scope'
       from public.app_signup_mandates
       where id = v_promotion.mandate_id),
      '[]'::jsonb
    )
  ) scope_item
  where btrim(coalesce(scope_item ->> 'location_id', '')) <> '';

  select count(*) into v_durable_location_count
  from (
    select distinct on (relation.relation_id)
      relation.event_type
    from public.app_case_location_relations relation
    where relation.case_id = v_promotion.case_id
    order by relation.relation_id, relation.recorded_at desc
  ) current_relation
  where current_relation.event_type = 'linked';
  if v_durable_location_count <> v_source_location_count then
    raise exception 'durable location count does not match signed source';
  end if;

  select count(distinct fact ->> 'charger_id')
  into v_source_charger_count
  from jsonb_array_elements(
    coalesce(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)
  ) fact
  where btrim(coalesce(fact ->> 'charger_id', '')) <> '';

  for v_charger_ref in
    select distinct fact ->> 'charger_id'
    from jsonb_array_elements(
      coalesce(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)
    ) fact
    where btrim(coalesce(fact ->> 'charger_id', '')) <> ''
    order by fact ->> 'charger_id'
  loop
    select count(distinct fact ->> 'location_id'), min(fact ->> 'location_id')
    into v_distinct_count, v_location_ref
    from jsonb_array_elements(
      coalesce(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)
    ) fact
    where fact ->> 'charger_id' = v_charger_ref
      and btrim(coalesce(fact ->> 'location_id', '')) <> '';
    if v_distinct_count <> 1 then
      raise exception 'signed charger/location declaration is ambiguous';
    end if;

    select relation.location_id into strict v_location_id
    from public.app_case_location_relations relation
    where relation.case_id = v_promotion.case_id
      and relation.event_type = 'linked'
      and relation.request_id = v_promotion.request_id || ':case-location:' || v_location_ref;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_brand
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'chargerBrand'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger brand declaration is ambiguous'; end if;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_model
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'chargerModel'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger model declaration is ambiguous'; end if;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_serial_number
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'serialNumber'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger serial declaration is ambiguous'; end if;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_mid_identifier
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'midNumber'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger MID declaration is ambiguous'; end if;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_installation_date_text
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' in ('explicitInstallationDate', 'installationYear')
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger installation declaration is ambiguous'; end if;
    v_installation_year := case
      when v_installation_date_text ~ '^[0-9]{4}$'
        then v_installation_date_text::integer
      when v_installation_date_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then left(v_installation_date_text, 4)::integer
      else null
    end;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_backend_supplier
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'backendSupplier'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger backend declaration is ambiguous'; end if;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_solar_export_declaration
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'solarExportStatus'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger solar/export declaration is ambiguous'; end if;

    insert into public.app_chargers (
      promotion_id, case_id, location_id, source_ref_sha256,
      created_at, created_by_actor_ref, created_from_request_id
    ) values (
      v_promotion.id, v_promotion.case_id, v_location_id,
      encode(extensions.digest(v_charger_ref, 'sha256'), 'hex'),
      v_promotion.promoted_at, v_promotion.actor_ref,
      v_promotion.request_id || ':declared-charger'
    )
    on conflict (promotion_id, source_ref_sha256) do nothing;

    select id into strict v_charger_id
    from public.app_chargers
    where promotion_id = v_promotion.id
      and source_ref_sha256 = encode(extensions.digest(v_charger_ref, 'sha256'), 'hex')
      and case_id = v_promotion.case_id
      and location_id = v_location_id;

    insert into public.app_charger_declarations (
      charger_id, signing_snapshot_id, source_payload_sha256,
      brand, model, serial_number, mid_identifier,
      installation_date_text, installation_year, backend_supplier,
      solar_export_declaration, declaration_status, declared_at,
      created_at, created_by_actor_ref, created_from_request_id
    ) values (
      v_charger_id, v_snapshot.id, v_snapshot.canonical_snapshot_sha256,
      v_brand, v_model, v_serial_number, v_mid_identifier,
      v_installation_date_text, v_installation_year, v_backend_supplier,
      v_solar_export_declaration, 'confirmed_awaiting_review',
      v_intake.finalized_at, v_promotion.promoted_at, v_promotion.actor_ref,
      v_promotion.request_id || ':declared-charger'
    )
    on conflict (charger_id) do nothing;

    select * into strict v_existing_declaration
    from public.app_charger_declarations
    where charger_id = v_charger_id;
    if row(
      v_existing_declaration.signing_snapshot_id,
      v_existing_declaration.source_payload_sha256,
      v_existing_declaration.brand,
      v_existing_declaration.model,
      v_existing_declaration.serial_number,
      v_existing_declaration.mid_identifier,
      v_existing_declaration.installation_date_text,
      v_existing_declaration.installation_year,
      v_existing_declaration.backend_supplier,
      v_existing_declaration.solar_export_declaration,
      v_existing_declaration.declaration_status
    ) is distinct from row(
      v_snapshot.id,
      v_snapshot.canonical_snapshot_sha256,
      v_brand,
      v_model,
      v_serial_number,
      v_mid_identifier,
      v_installation_date_text,
      v_installation_year,
      v_backend_supplier,
      v_solar_export_declaration,
      'confirmed_awaiting_review'::text
    ) then
      raise exception 'durable charger declaration conflicts with signed source';
    end if;
  end loop;

  if (select count(*) from public.app_chargers where promotion_id = v_promotion.id)
       <> v_source_charger_count then
    raise exception 'durable charger count does not match signed source';
  end if;

  for v_evidence in
    select * from public.app_evidence_files
    where promotion_id = v_promotion.id
    order by id
  loop
    select * into strict v_source_file
    from public.app_signup_intake_files
    where id = v_evidence.source_ref::uuid
      and intake_id = p_intake_id
      and promoted_evidence_file_id = v_evidence.id;

    v_context_location_id := null;
    v_context_charger_id := null;
    v_association_basis := 'unscoped';

    if v_source_file.document_type = 'energy_bill_or_contract' then
      if v_source_location_count = 1 then
        select relation.location_id into strict v_context_location_id
        from public.app_case_location_relations relation
        where relation.case_id = v_promotion.case_id
          and relation.event_type = 'linked';
        v_association_basis := 'single_declared_location';
      else
        v_association_basis := 'ambiguous_source_scope';
      end if;
    elsif v_source_file.document_type = 'installation_invoice' then
      if v_source_charger_count = 1 then
        select charger.id, charger.location_id
        into strict v_context_charger_id, v_context_location_id
        from public.app_chargers charger
        where charger.promotion_id = v_promotion.id;
        v_association_basis := 'single_declared_charger';
      else
        v_association_basis := 'ambiguous_source_scope';
      end if;
    end if;

    insert into public.app_evidence_declaration_contexts (
      evidence_file_id, promotion_id, source_slot_ref_sha256,
      location_id, charger_id, association_basis,
      created_at, created_by_actor_ref, created_from_request_id
    ) values (
      v_evidence.id, v_promotion.id,
      encode(extensions.digest(v_source_file.client_slot_id, 'sha256'), 'hex'),
      v_context_location_id, v_context_charger_id, v_association_basis,
      v_promotion.promoted_at, v_promotion.actor_ref,
      v_promotion.request_id || ':evidence-context'
    )
    on conflict (evidence_file_id) do nothing;

    select * into strict v_existing_context
    from public.app_evidence_declaration_contexts
    where evidence_file_id = v_evidence.id;
    if row(
      v_existing_context.promotion_id,
      v_existing_context.source_slot_ref_sha256,
      v_existing_context.location_id,
      v_existing_context.charger_id,
      v_existing_context.association_basis
    ) is distinct from row(
      v_promotion.id,
      encode(extensions.digest(v_source_file.client_slot_id, 'sha256'), 'hex'),
      v_context_location_id,
      v_context_charger_id,
      v_association_basis
    ) then
      raise exception 'durable evidence context conflicts with signed source';
    end if;
  end loop;

  if (
    select count(*)
    from public.app_evidence_declaration_contexts context
    where context.promotion_id = v_promotion.id
  ) <> (
    select count(*)
    from public.app_evidence_files evidence
    where evidence.promotion_id = v_promotion.id
  ) then
    raise exception 'durable evidence context count does not match evidence';
  end if;
end;
$_$;


--
-- Name: app_ops_location_accept_execute_v1(uuid, text, text, text, timestamp with time zone, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_ops_location_accept_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION app_ops_location_accept_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_ops_location_accept_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) IS 'Atomic approved initial-acceptance execution and WP3L result marking.';


--
-- Name: app_ops_location_accept_prepare_v1(uuid, text, text, text, timestamp with time zone, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_ops_location_accept_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: FUNCTION app_ops_location_accept_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_ops_location_accept_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) IS 'Authorized immutable initial-acceptance maker request; no WP3J call.';


--
-- Name: app_ops_location_accept_review_v1(uuid, text, text, text, timestamp with time zone, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_ops_location_accept_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION app_ops_location_accept_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_ops_location_accept_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) IS 'Authorized distinct-checker initial-acceptance review; no WP3J call.';


--
-- Name: app_ops_location_authorization_resolve_v1(uuid, text, uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_ops_location_authorization_resolve_v1(p_auth_user_id uuid, p_capability_code text, p_case_id uuid, p_location_id uuid, p_at timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION app_ops_location_authorization_resolve_v1(p_auth_user_id uuid, p_capability_code text, p_case_id uuid, p_location_id uuid, p_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_ops_location_authorization_resolve_v1(p_auth_user_id uuid, p_capability_code text, p_case_id uuid, p_location_id uuid, p_at timestamp with time zone) IS 'Private Auth-to-workforce resolver. Database-authoritative active identity, exact capability, exact case/location scope and relation only.';


--
-- Name: app_ops_location_correct_execute_v1(uuid, text, text, text, timestamp with time zone, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_ops_location_correct_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION app_ops_location_correct_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_ops_location_correct_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) IS 'Atomic approved immutable correction execution and WP3L result marking.';


--
-- Name: app_ops_location_correct_prepare_v1(uuid, text, text, text, timestamp with time zone, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_ops_location_correct_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: FUNCTION app_ops_location_correct_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_ops_location_correct_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) IS 'Authorized immutable correction maker request; no WP3J call.';


--
-- Name: app_ops_location_correct_review_v1(uuid, text, text, text, timestamp with time zone, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_ops_location_correct_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION app_ops_location_correct_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_ops_location_correct_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) IS 'Authorized distinct-checker correction review; no WP3J call.';


--
-- Name: app_ops_location_observation_record_v1(uuid, text, text, text, timestamp with time zone, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_ops_location_observation_record_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION app_ops_location_observation_record_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_ops_location_observation_record_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) IS 'Authorized immutable non-accepting location observation.';


--
-- Name: app_ops_location_root_create_v1(uuid, text, text, text, timestamp with time zone, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_ops_location_root_create_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION app_ops_location_root_create_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_ops_location_root_create_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) IS 'Authorized atomic location root and first case/location relation.';


--
-- Name: app_parties_immutable_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_parties_immutable_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  raise exception 'app_parties roots are immutable and cannot be updated or deleted';
end;
$$;


--
-- Name: app_party_declaration_sources_immutable_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_party_declaration_sources_immutable_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception
    'app_party_declaration_sources rows are immutable and cannot be changed';
end;
$$;


--
-- Name: app_party_history_immutable_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_party_history_immutable_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  raise exception 'app party history rows are immutable and cannot be updated or deleted';
end;
$$;


--
-- Name: app_party_organization_versions_boundary_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_party_organization_versions_boundary_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_party_kind text;
begin
  select party_kind into v_party_kind
  from public.app_parties
  where id = new.party_id;

  if v_party_kind is distinct from 'organization' then
    raise exception 'app_party_organization_versions require an organization party';
  end if;

  return new;
end;
$$;


--
-- Name: app_party_organization_versions_overlap_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_party_organization_versions_overlap_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  perform 1
  from public.app_parties
  where id = new.party_id
  for update;

  if exists (
    select 1
    from public.app_party_organization_versions existing
    where existing.party_id = new.party_id
      and existing.id <> new.id
      and existing.id is distinct from new.supersedes_organization_version_id
      and not exists (
        select 1
        from public.app_party_organization_versions successor
        where successor.supersedes_organization_version_id = existing.id
      )
      and (existing.valid_to is null or new.valid_from < existing.valid_to)
      and (new.valid_to is null or existing.valid_from < new.valid_to)
  ) then
    raise exception 'overlapping active app_party_organization_versions are not allowed for the same party';
  end if;

  return new;
end;
$$;


--
-- Name: app_party_person_versions_boundary_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_party_person_versions_boundary_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_party_kind text;
begin
  select party_kind into v_party_kind
  from public.app_parties
  where id = new.party_id;

  if v_party_kind is distinct from 'natural_person' then
    raise exception 'app_party_person_versions require a natural_person party';
  end if;

  return new;
end;
$$;


--
-- Name: app_party_person_versions_overlap_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_party_person_versions_overlap_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  perform 1
  from public.app_parties
  where id = new.party_id
  for update;

  if exists (
    select 1
    from public.app_party_person_versions existing
    where existing.party_id = new.party_id
      and existing.id <> new.id
      and existing.id is distinct from new.supersedes_person_version_id
      and not exists (
        select 1
        from public.app_party_person_versions successor
        where successor.supersedes_person_version_id = existing.id
      )
      and (existing.valid_to is null or new.valid_from < existing.valid_to)
      and (new.valid_to is null or existing.valid_from < new.valid_to)
  ) then
    raise exception 'overlapping active app_party_person_versions are not allowed for the same party';
  end if;

  return new;
end;
$$;


--
-- Name: app_promote_signed_signup_v1(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_promote_signed_signup_v1(p_request jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := now();
  v_intake_id uuid;
  v_request_id text;
  v_idempotency_key text;
  v_request_payload_sha256 text;
  v_actor_ref text;
  v_environment text;
  v_manifest jsonb;
  v_normalized_manifest jsonb;
  v_promotion_payload_sha256 text;
  v_scope text;
  v_intake public.app_signup_intakes%rowtype;
  v_snapshot public.app_signup_signing_snapshots%rowtype;
  v_mandate public.app_signup_mandates%rowtype;
  v_signature public.app_signup_signature_evidence%rowtype;
  v_challenge public.app_signup_signing_challenges%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_existing_promotion public.app_signup_promotions%rowtype;
  v_identity public.app_customer_identities%rowtype;
  v_customer public.app_customers%rowtype;
  v_idempotency public.app_idempotency_keys%rowtype;
  v_account_type text;
  v_service_name text;
  v_contact_name text;
  v_trade_register_number text;
  v_expected_party_kind text;
  v_organization_classification text;
  v_service_party_id uuid;
  v_contact_party_id uuid;
  v_service_person_profile_id uuid;
  v_service_organization_profile_id uuid;
  v_contact_person_profile_id uuid;
  v_case_id uuid := gen_random_uuid();
  v_case_reference text;
  v_promotion_id uuid := gen_random_uuid();
  v_location_id uuid;
  v_evidence_file_id uuid;
  v_source_file public.app_signup_intake_files%rowtype;
  v_required_file_ids uuid[];
  v_manifest_file_ids uuid[];
  v_source_signing_sha256 text;
  v_legal_hashes text;
  v_response jsonb;
  v_count integer;
  v_distinct_count integer;
  v_inserted integer;
  v_item jsonb;
  v_scope_item jsonb;
  v_address_text text;
  v_relation_id uuid;
  v_profile_ids uuid[];
  v_party_ids uuid[];
  v_text_values text[];
  v_legacy_auth_bound_convergence boolean := false;
  v_total_identity_count integer;
  v_auth_email_user_count integer;
  v_auth_binding_count integer;
  v_customer_auth_binding_count integer;
  v_other_customer_claim_count integer;
  v_person_profile_count integer;
  v_organization_profile_count integer;
begin
  if jsonb_typeof(p_request) <> 'object'
     or coalesce(p_request ->> 'intake_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_request ->> 'request_id', '') = ''
     or coalesce(p_request ->> 'idempotency_key', '') = ''
     or coalesce(p_request ->> 'request_payload_sha256', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(p_request ->> 'actor_ref', '') = ''
     or coalesce(p_request ->> 'environment', '') = ''
     or jsonb_typeof(p_request -> 'durable_files') <> 'array'
     or jsonb_array_length(p_request -> 'durable_files') = 0
     or jsonb_array_length(p_request -> 'durable_files') > 100 then
    raise exception 'invalid signed signup promotion input';
  end if;

  v_intake_id := (p_request ->> 'intake_id')::uuid;
  v_request_id := btrim(p_request ->> 'request_id');
  v_idempotency_key := btrim(p_request ->> 'idempotency_key');
  v_request_payload_sha256 := p_request ->> 'request_payload_sha256';
  v_actor_ref := btrim(p_request ->> 'actor_ref');
  v_environment := btrim(p_request ->> 'environment');
  v_manifest := p_request -> 'durable_files';
  v_scope := 'app_promote_signed_signup_v1:' || v_intake_id::text;

  if exists (
    select 1
    from jsonb_array_elements(v_manifest) item
    where jsonb_typeof(item) <> 'object'
      or coalesce(item ->> 'source_intake_file_id', '')
        !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or item ->> 'storage_bucket' <> 'app-documents'
      or coalesce(item ->> 'storage_path', '') = ''
      or item ->> 'storage_path' not like
        'case-evidence/signed-signup/' || v_intake_id::text || '/%'
      or item ->> 'storage_path' like '%..%'
      or coalesce(item ->> 'detected_mime_type', '') = ''
      or coalesce(item ->> 'size_bytes', '') !~ '^[1-9][0-9]*$'
      or coalesce(item ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'invalid durable evidence manifest';
  end if;

  select count(*),
         count(distinct item ->> 'source_intake_file_id'),
         count(distinct (item ->> 'storage_bucket') || '/' || (item ->> 'storage_path'))
  into v_count, v_distinct_count, v_inserted
  from jsonb_array_elements(v_manifest) item;
  if v_count <> v_distinct_count or v_count <> v_inserted then
    raise exception 'durable evidence manifest contains duplicates';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'source_intake_file_id', item ->> 'source_intake_file_id',
      'storage_bucket', item ->> 'storage_bucket',
      'storage_path', item ->> 'storage_path',
      'detected_mime_type', item ->> 'detected_mime_type',
      'size_bytes', (item ->> 'size_bytes')::bigint,
      'sha256', item ->> 'sha256'
    )
    order by item ->> 'source_intake_file_id'
  )
  into v_normalized_manifest
  from jsonb_array_elements(v_manifest) item;

  v_promotion_payload_sha256 := encode(
    extensions.digest(v_normalized_manifest::text, 'sha256'),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('signed_signup_promotion:' || v_intake_id::text, 0)
  );

  select * into v_intake
  from public.app_signup_intakes
  where id = v_intake_id
  for update;
  if not found then
    raise exception 'signed signup intake unavailable';
  end if;

  select * into v_existing_promotion
  from public.app_signup_promotions
  where intake_id = v_intake_id;
  if found then
    if v_existing_promotion.promotion_payload_sha256 <> v_promotion_payload_sha256
       or (
         v_existing_promotion.idempotency_key = v_idempotency_key
         and v_existing_promotion.request_payload_sha256
           <> v_request_payload_sha256
       ) then
      return jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'promotion_conflict'
      );
    end if;
    return jsonb_build_object(
      'ok', true,
      'status', 200,
      'mode', 'app_promote_signed_signup_v1',
      'promotion_reference', v_existing_promotion.id,
      'customer_reference', v_existing_promotion.customer_id,
      'case_reference', v_existing_promotion.case_id,
      'intake_status', 'promoted',
      'replayed', true
    );
  end if;

  if v_intake.status <> 'submitted_for_review'
     or v_intake.finalized_at is null
     or v_intake.promotion_case_id is not null
     or v_intake.promoted_at is not null then
    raise exception 'signed signup intake is not promotable';
  end if;

  insert into public.app_idempotency_keys (
    scope, key, payload_hash, locked_at, expires_at
  ) values (
    v_scope, v_idempotency_key, v_request_payload_sha256,
    v_now, v_now + interval '24 hours'
  )
  on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idempotency
  from public.app_idempotency_keys
  where scope = v_scope and key = v_idempotency_key
  for update;
  if v_idempotency.payload_hash <> v_request_payload_sha256 then
    return jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'idempotency_conflict'
    );
  end if;
  if v_idempotency.response_status is not null
     and v_idempotency.response_body is not null then
    return v_idempotency.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'promotion_in_progress'
    );
  end if;

  select count(*) into v_count
  from public.app_signup_signing_snapshots
  where intake_id = v_intake_id;
  if v_count <> 1 then
    raise exception 'invalid signing snapshot cardinality';
  end if;
  select * into strict v_snapshot
  from public.app_signup_signing_snapshots
  where intake_id = v_intake_id;

  select count(*) into v_count
  from public.app_signup_mandates
  where intake_id = v_intake_id;
  if v_count <> 1 then
    raise exception 'invalid mandate cardinality';
  end if;
  select * into strict v_mandate
  from public.app_signup_mandates
  where intake_id = v_intake_id;

  select count(*) into v_count
  from public.app_signup_signature_evidence
  where intake_id = v_intake_id;
  if v_count <> 1 then
    raise exception 'invalid signature evidence cardinality';
  end if;
  select * into strict v_signature
  from public.app_signup_signature_evidence
  where intake_id = v_intake_id;

  select count(*), count(distinct action_type)
  into v_count, v_distinct_count
  from public.app_signup_legal_acceptances
  where intake_id = v_intake_id;
  if v_count <> 3 or v_distinct_count <> 3 or exists (
    select 1
    from public.app_signup_legal_acceptances acceptance
    where acceptance.intake_id = v_intake_id
      and (
        acceptance.snapshot_id <> v_snapshot.id
        or acceptance.action_type not in (
          'privacy_notice_read',
          'service_terms_accepted',
          'fee_terms_accepted'
        )
        or acceptance.content_sha256 !~ '^[0-9a-f]{64}$'
      )
  ) then
    raise exception 'invalid legal acceptance cardinality';
  end if;

  select * into v_challenge
  from public.app_signup_signing_challenges
  where id = v_signature.challenge_id
    and intake_id = v_intake_id;
  if not found
     or v_challenge.delivery_status <> 'delivered'
     or v_challenge.consumed_at is null
     or v_challenge.replaced_at is not null then
    raise exception 'signing challenge is not consumed and valid';
  end if;

  select count(*) into v_count
  from public.app_signup_intake_capabilities
  where intake_id = v_intake_id
    and intake_file_id is null
    and capability_type = 'intake_manage';
  if v_count <> 1 then
    raise exception 'invalid management capability cardinality';
  end if;
  select * into strict v_manage
  from public.app_signup_intake_capabilities
  where intake_id = v_intake_id
    and intake_file_id is null
    and capability_type = 'intake_manage';
  if v_manage.consumed_at is null or v_manage.invalidated_at is not null then
    raise exception 'management capability is not consumed';
  end if;

  select count(*) into v_count
  from public.app_intake_audit_events event
  where event.event_type = 'signup_signing_finalized'
    and event.event_data ->> 'intake_reference' = v_intake_id::text;
  if v_count <> 1 then
    raise exception 'invalid signing finalization audit cardinality';
  end if;

  v_account_type := v_mandate.account_type;
  if v_account_type not in ('particulier', 'zakelijk', 'vve')
     or v_snapshot.canonical_snapshot ->> 'account_type' <> v_account_type
     or v_intake.submitted_payload ->> 'account_type' <> v_account_type
     or v_mandate.snapshot_id <> v_snapshot.id
     or v_signature.snapshot_id <> v_snapshot.id
     or v_signature.mandate_id <> v_mandate.id
     or v_signature.method_id <> 'typed_name_otp_v1'
     or v_signature.channel_reference_sha256
       <> v_challenge.channel_reference_sha256
     or v_signature.evidence_envelope ->> 'snapshot_sha256'
       <> v_snapshot.canonical_snapshot_sha256
     or v_snapshot.canonical_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     or v_signature.finalized_at <> v_intake.finalized_at
     or v_mandate.mandate_content -> 'validity' -> 'calendar_years'
       <> jsonb_build_array(v_mandate.calendar_year)
     or not (v_mandate.mandate_content -> 'permissions'
       @> '["nea_dso_connection_data_request","verifier_location_inspection"]'::jsonb)
     or (
       v_account_type = 'particulier'
       and v_mandate.authority_review_status <> 'not_applicable'
     )
     or (
       v_account_type in ('zakelijk', 'vve')
       and v_mandate.authority_review_status <> 'required_not_completed'
     ) then
    raise exception 'inconsistent signed signup source';
  end if;

  if jsonb_typeof(v_snapshot.canonical_snapshot -> 'required_file_references')
       <> 'array'
     or jsonb_array_length(
       v_snapshot.canonical_snapshot -> 'required_file_references'
     ) = 0 then
    raise exception 'signed required-file scope unavailable';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(
      v_snapshot.canonical_snapshot -> 'required_file_references'
    ) file_ref
    where file_ref
      !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'invalid signed required-file reference';
  end if;

  select array_agg(file_ref::uuid order by file_ref::text)
  into v_required_file_ids
  from jsonb_array_elements_text(
    v_snapshot.canonical_snapshot -> 'required_file_references'
  ) file_ref;

  select array_agg((item ->> 'source_intake_file_id')::uuid order by item ->> 'source_intake_file_id')
  into v_manifest_file_ids
  from jsonb_array_elements(v_normalized_manifest) item;

  if v_required_file_ids is distinct from v_manifest_file_ids then
    raise exception 'durable manifest does not match signed required-file scope';
  end if;

  foreach v_evidence_file_id in array v_required_file_ids loop
    select * into v_source_file
    from public.app_signup_intake_files
    where id = v_evidence_file_id
      and intake_id = v_intake_id;
    if not found
       or v_source_file.status <> 'confirmed_quarantine'
       or v_source_file.confirmed_at is null
       or v_source_file.superseded_at is not null
       or v_source_file.superseded_by_intake_file_id is not null
       or v_source_file.server_sha256 !~ '^[0-9a-f]{64}$'
       or v_source_file.server_size_bytes is null
       or v_source_file.detected_mime_type is null then
      raise exception 'signed quarantine file is not confirmed';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(v_normalized_manifest) item
    join public.app_signup_intake_files source_file
      on source_file.id = (item ->> 'source_intake_file_id')::uuid
    where source_file.intake_id <> v_intake_id
       or source_file.status <> 'confirmed_quarantine'
       or source_file.server_sha256 <> item ->> 'sha256'
       or source_file.server_size_bytes <> (item ->> 'size_bytes')::bigint
       or source_file.detected_mime_type <> item ->> 'detected_mime_type'
  ) then
    raise exception 'durable manifest does not match server-confirmed source';
  end if;

  select string_agg(content_sha256, '' order by action_type)
  into v_legal_hashes
  from public.app_signup_legal_acceptances
  where intake_id = v_intake_id;
  v_source_signing_sha256 := encode(
    extensions.digest(
      v_snapshot.canonical_snapshot_sha256 || ':' ||
      v_mandate.id::text || ':' || v_signature.id::text || ':' ||
      v_legal_hashes || ':' ||
      (
        select string_agg(source_file.server_sha256, '' order by source_file.id)
        from public.app_signup_intake_files source_file
        where source_file.id = any(v_required_file_ids)
      ),
      'sha256'
    ),
    'hex'
  );

  select array_agg(distinct btrim(fact ->> 'value') order by btrim(fact ->> 'value'))
  into v_text_values
  from jsonb_array_elements(
    coalesce(
      v_snapshot.canonical_snapshot #> '{canonical_facts,facts}',
      '[]'::jsonb
    )
  ) fact
  where fact ->> 'fact_key' = case
    when v_account_type = 'particulier' then 'partyName'
    else 'organizationName'
  end
    and btrim(coalesce(fact ->> 'value', '')) <> '';
  if coalesce(array_length(v_text_values, 1), 0) <> 1 then
    raise exception 'signed service-recipient declaration is ambiguous';
  end if;
  v_service_name := btrim(v_text_values[1]);

  v_contact_name := btrim(v_signature.typed_full_name);
  if v_contact_name = '' then
    raise exception 'signed contact declaration unavailable';
  end if;

  select array_agg(distinct btrim(fact ->> 'value') order by btrim(fact ->> 'value'))
  into v_text_values
  from jsonb_array_elements(
    coalesce(
      v_snapshot.canonical_snapshot #> '{canonical_facts,facts}',
      '[]'::jsonb
    )
  ) fact
  where fact ->> 'fact_key' = 'kvkNumber'
    and btrim(coalesce(fact ->> 'value', '')) <> '';
  if coalesce(array_length(v_text_values, 1), 0) > 1 then
    raise exception 'signed trade-register declaration is ambiguous';
  end if;
  v_trade_register_number := case
    when coalesce(array_length(v_text_values, 1), 0) = 1
      then btrim(v_text_values[1])
    else null
  end;

  v_expected_party_kind := case
    when v_account_type = 'particulier' then 'natural_person'
    else 'organization'
  end;
  v_organization_classification := case
    when v_account_type = 'vve' then 'vve'
    when v_account_type = 'zakelijk' then 'business'
    else null
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'signed_signup_identity:' || lower(v_intake.email_normalized),
      0
    )
  );

  select array_agg(identity_row.id order by identity_row.id)
  into v_party_ids
  from public.app_customer_identities identity_row
  join public.app_customers identity_customer
    on identity_customer.id = identity_row.customer_id
   and identity_customer.status = 'active'
   and identity_customer.customer_type = v_account_type
  where identity_row.email_normalized = v_intake.email_normalized
    and identity_row.status = 'active';
  if coalesce(array_length(v_party_ids, 1), 0) > 1 then
    raise exception 'ambiguous active customer identity';
  end if;

  if coalesce(array_length(v_party_ids, 1), 0) = 1 then
    select * into strict v_identity
    from public.app_customer_identities
    where id = v_party_ids[1];
    select * into strict v_customer
    from public.app_customers
    where id = v_identity.customer_id
    for update;
    if v_customer.status <> 'active'
       or v_customer.customer_type <> v_account_type
       or (
         v_customer.primary_email_normalized is not null
         and v_customer.primary_email_normalized <> v_intake.email_normalized
       ) then
      raise exception 'conflicting active customer identity';
    end if;

    if v_identity.auth_user_id is not null then
      select count(*) into v_total_identity_count
      from public.app_customer_identities identity_row
      join public.app_customers identity_customer
        on identity_customer.id = identity_row.customer_id
       and identity_customer.customer_type = v_account_type
      where identity_row.email_normalized = v_intake.email_normalized;

      select count(*) into v_auth_email_user_count
      from auth.users auth_user
      where lower(auth_user.email) = v_intake.email_normalized
        and auth_user.deleted_at is null;

      select count(*) into v_auth_binding_count
      from auth.users auth_user
      where auth_user.id = v_identity.auth_user_id
        and lower(auth_user.email) = v_intake.email_normalized
        and auth_user.deleted_at is null
        and coalesce(
          auth_user.email_confirmed_at,
          auth_user.confirmed_at
        ) is not null;

      select count(*) into v_customer_auth_binding_count
      from public.app_customer_identities identity_row
      where identity_row.customer_id = v_customer.id
        and identity_row.status = 'active'
        and identity_row.auth_user_id is not null;

      select count(*) into v_other_customer_claim_count
      from public.app_customers customer_row
      where customer_row.id <> v_customer.id
        and customer_row.status = 'active'
        and customer_row.primary_email_normalized = v_intake.email_normalized
        and customer_row.customer_type = v_account_type;

      if v_total_identity_count <> 1
         or v_auth_email_user_count <> 1
         or v_auth_binding_count <> 1
         or v_customer_auth_binding_count <> 1
         or v_other_customer_claim_count <> 0 then
        raise exception 'legacy auth-bound customer convergence conflict';
      end if;

      v_legacy_auth_bound_convergence := true;
    end if;
  else
    select count(*) into v_other_customer_claim_count
    from public.app_customers customer_row
    where customer_row.status = 'active'
      and customer_row.primary_email_normalized = v_intake.email_normalized
        and customer_row.customer_type = v_account_type;
    if v_other_customer_claim_count <> 0 then
      raise exception 'email-only customer convergence is not allowed';
    end if;

    insert into public.app_customers (
      customer_type, display_name, preferred_language,
      primary_email_normalized, status
    ) values (
      v_account_type, v_service_name, 'nl', v_intake.email_normalized, 'active'
    ) returning * into v_customer;

    insert into public.app_customer_identities (
      customer_id, auth_user_id, email_normalized, email_verified_at,
      identity_provider, status
    ) values (
      v_customer.id, null, v_intake.email_normalized, null, 'supabase', 'active'
    ) returning * into v_identity;
  end if;

  select array_agg(relationship.party_id order by relationship.party_id)
  into v_party_ids
  from public.app_customer_party_relationships relationship
  where relationship.customer_id = v_customer.id
    and relationship.relationship_role = 'account_owner'
    and relationship.valid_to is null;
  if coalesce(array_length(v_party_ids, 1), 0) > 1 then
    raise exception 'ambiguous active account-owner party';
  end if;

  if coalesce(array_length(v_party_ids, 1), 0) = 1 then
    v_service_party_id := v_party_ids[1];
    if not exists (
      select 1 from public.app_parties party
      where party.id = v_service_party_id
        and party.party_kind = v_expected_party_kind
    ) then
      raise exception 'account-owner party kind conflicts with signed account type';
    end if;

    select count(*) into v_person_profile_count
    from public.app_party_person_versions profile
    where profile.party_id = v_service_party_id
      and profile.valid_to is null;

    select count(*) into v_organization_profile_count
    from public.app_party_organization_versions profile
    where profile.party_id = v_service_party_id
      and profile.valid_to is null;

    if v_account_type = 'particulier' then
      if v_organization_profile_count <> 0
         or v_person_profile_count > 1 then
        raise exception 'account-owner person profile conflicts with signed declaration';
      end if;

      if v_person_profile_count = 1 then
        select profile.id into strict v_service_person_profile_id
        from public.app_party_person_versions profile
        where profile.party_id = v_service_party_id
          and profile.valid_to is null
          and profile.full_name = v_service_name;
      elsif v_legacy_auth_bound_convergence then
        insert into public.app_party_person_versions (
          party_id, full_name, valid_from, source_type,
          source_reference_type, source_reference_id,
          request_id, actor_type, actor_ref
        ) values (
          v_service_party_id, v_service_name, v_intake.finalized_at::date,
          'signed_signup_intake', 'app_signup_signing_snapshots',
          v_snapshot.id::text, v_request_id, 'system', v_actor_ref
        ) returning id into v_service_person_profile_id;
      else
        raise exception 'account-owner person profile conflicts with signed declaration';
      end if;
    else
      if v_person_profile_count <> 0
         or v_organization_profile_count > 1 then
        raise exception 'account-owner organization profile conflicts with signed declaration';
      end if;

      if v_organization_profile_count = 1 then
        select profile.id into strict v_service_organization_profile_id
        from public.app_party_organization_versions profile
        where profile.party_id = v_service_party_id
          and profile.valid_to is null
          and profile.legal_name = v_service_name
          and profile.organization_classification = v_organization_classification
          and profile.trade_register_number is not distinct from
            v_trade_register_number;
      elsif v_legacy_auth_bound_convergence then
        insert into public.app_party_organization_versions (
          party_id, legal_name, organization_classification,
          trade_register_number, valid_from, source_type,
          source_reference_type, source_reference_id,
          request_id, actor_type, actor_ref
        ) values (
          v_service_party_id, v_service_name, v_organization_classification,
          v_trade_register_number, v_intake.finalized_at::date,
          'signed_signup_intake', 'app_signup_signing_snapshots',
          v_snapshot.id::text, v_request_id, 'system', v_actor_ref
        ) returning id into v_service_organization_profile_id;
      else
        raise exception 'account-owner organization profile conflicts with signed declaration';
      end if;
    end if;
  else
    insert into public.app_parties (
      party_kind, source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref
    ) values (
      v_expected_party_kind, 'signed_signup_intake',
      'app_signup_signing_snapshots', v_snapshot.id::text,
      v_request_id, 'system', v_actor_ref
    ) returning id into v_service_party_id;

    if v_account_type = 'particulier' then
      insert into public.app_party_person_versions (
        party_id, full_name, valid_from, source_type,
        source_reference_type, source_reference_id,
        request_id, actor_type, actor_ref
      ) values (
        v_service_party_id, v_service_name, v_intake.finalized_at::date,
        'signed_signup_intake', 'app_signup_signing_snapshots',
        v_snapshot.id::text, v_request_id, 'system', v_actor_ref
      ) returning id into v_service_person_profile_id;
    else
      insert into public.app_party_organization_versions (
        party_id, legal_name, organization_classification,
        trade_register_number, valid_from, source_type,
        source_reference_type, source_reference_id,
        request_id, actor_type, actor_ref
      ) values (
        v_service_party_id, v_service_name, v_organization_classification,
        v_trade_register_number, v_intake.finalized_at::date,
        'signed_signup_intake', 'app_signup_signing_snapshots',
        v_snapshot.id::text, v_request_id, 'system', v_actor_ref
      ) returning id into v_service_organization_profile_id;
    end if;

    insert into public.app_customer_party_relationships (
      customer_id, party_id, relationship_role, valid_from,
      source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref
    ) values (
      v_customer.id, v_service_party_id, 'account_owner',
      v_intake.finalized_at::date, 'signed_signup_intake',
      'app_signup_signing_snapshots', v_snapshot.id::text,
      v_request_id, 'system', v_actor_ref
    );
  end if;

  if not exists (
    select 1
    from public.app_customer_party_relationships relationship
    where relationship.customer_id = v_customer.id
      and relationship.party_id = v_service_party_id
      and relationship.relationship_role = 'service_recipient'
      and relationship.valid_to is null
  ) then
    insert into public.app_customer_party_relationships (
      customer_id, party_id, relationship_role, valid_from,
      source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref
    ) values (
      v_customer.id, v_service_party_id, 'service_recipient',
      v_intake.finalized_at::date, 'signed_signup_intake',
      'app_signup_signing_snapshots', v_snapshot.id::text,
      v_request_id, 'system', v_actor_ref
    );
  end if;

  if v_account_type = 'particulier' then
    if v_contact_name <> v_service_name
       and not v_legacy_auth_bound_convergence then
      raise exception 'particulier signer must match declared service recipient';
    end if;
    v_contact_party_id := v_service_party_id;
    v_contact_person_profile_id := v_service_person_profile_id;
  else
    select array_agg(relationship.party_id order by relationship.party_id)
    into v_party_ids
    from public.app_customer_party_relationships relationship
    join public.app_party_person_versions profile
      on profile.party_id = relationship.party_id
     and profile.valid_to is null
     and profile.full_name = v_contact_name
    where relationship.customer_id = v_customer.id
      and relationship.relationship_role = 'contact'
      and relationship.valid_to is null;
    if coalesce(array_length(v_party_ids, 1), 0) > 1 then
      raise exception 'ambiguous signed contact party';
    end if;

    if coalesce(array_length(v_party_ids, 1), 0) = 1 then
      v_contact_party_id := v_party_ids[1];
      select id into strict v_contact_person_profile_id
      from public.app_party_person_versions
      where party_id = v_contact_party_id
        and valid_to is null
        and full_name = v_contact_name;
    else
      insert into public.app_parties (
        party_kind, source_type, source_reference_type, source_reference_id,
        request_id, actor_type, actor_ref
      ) values (
        'natural_person', 'signed_signup_intake',
        'app_signup_signature_evidence', v_signature.id::text,
        v_request_id, 'system', v_actor_ref
      ) returning id into v_contact_party_id;

      insert into public.app_party_person_versions (
        party_id, full_name, valid_from, source_type,
        source_reference_type, source_reference_id,
        request_id, actor_type, actor_ref
      ) values (
        v_contact_party_id, v_contact_name, v_intake.finalized_at::date,
        'signed_signup_intake', 'app_signup_signature_evidence',
        v_signature.id::text, v_request_id, 'system', v_actor_ref
      ) returning id into v_contact_person_profile_id;

      insert into public.app_customer_party_relationships (
        customer_id, party_id, relationship_role, valid_from,
        source_type, source_reference_type, source_reference_id,
        request_id, actor_type, actor_ref
      ) values (
        v_customer.id, v_contact_party_id, 'contact',
        v_intake.finalized_at::date, 'signed_signup_intake',
        'app_signup_signature_evidence', v_signature.id::text,
        v_request_id, 'system', v_actor_ref
      );
    end if;
  end if;

  if v_account_type = 'particulier' and not exists (
    select 1
    from public.app_customer_party_relationships relationship
    where relationship.customer_id = v_customer.id
      and relationship.party_id = v_contact_party_id
      and relationship.relationship_role = 'contact'
      and relationship.valid_to is null
  ) then
    insert into public.app_customer_party_relationships (
      customer_id, party_id, relationship_role, valid_from,
      source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref
    ) values (
      v_customer.id, v_contact_party_id, 'contact',
      v_intake.finalized_at::date, 'signed_signup_intake',
      'app_signup_signature_evidence', v_signature.id::text,
      v_request_id, 'system', v_actor_ref
    );
  end if;

  v_case_reference := 'CASE-' || upper(substr(encode(
    extensions.digest(v_intake_id::text, 'sha256'), 'hex'
  ), 1, 12));

  insert into public.app_cases (
    id, customer_id, case_reference, created_at,
    created_by_actor_type, created_by_actor_ref,
    source_class, source_ref, request_id
  ) values (
    v_case_id, v_customer.id, v_case_reference, v_now,
    'system', v_actor_ref, 'signed_signup_intake',
    v_intake_id::text, v_request_id
  );

  insert into public.app_case_party_roles (
    case_id, party_id, person_profile_version_id,
    organization_profile_version_id, role_type, claim_status,
    valid_from, recorded_at, recorded_by_actor_type,
    recorded_by_actor_ref, source_class, source_ref, request_id
  ) values (
    v_case_id, v_service_party_id, v_service_person_profile_id,
    v_service_organization_profile_id, 'service_recipient', 'asserted',
    v_intake.finalized_at, v_now, 'system', v_actor_ref,
    'signed_signup_intake', v_intake_id::text, v_request_id
  );

  insert into public.app_case_party_roles (
    case_id, party_id, person_profile_version_id,
    organization_profile_version_id, role_type, claim_status,
    valid_from, recorded_at, recorded_by_actor_type,
    recorded_by_actor_ref, source_class, source_ref, request_id
  ) values (
    v_case_id, v_contact_party_id, v_contact_person_profile_id,
    null, 'case_contact', 'asserted',
    v_intake.finalized_at, v_now, 'system', v_actor_ref,
    'signed_signup_intake', v_intake_id::text, v_request_id
  );

  insert into public.app_signup_promotions (
    id, intake_id, customer_id, identity_id,
    service_recipient_party_id, contact_party_id, case_id,
    signing_snapshot_id, mandate_id, signature_evidence_id,
    account_type, source_signing_sha256, promotion_payload_sha256,
    request_payload_sha256, request_id, idempotency_key,
    actor_type, actor_ref, environment, promoted_at
  ) values (
    v_promotion_id, v_intake_id, v_customer.id, v_identity.id,
    v_service_party_id, v_contact_party_id, v_case_id,
    v_snapshot.id, v_mandate.id, v_signature.id,
    v_account_type, v_source_signing_sha256, v_promotion_payload_sha256,
    v_request_payload_sha256, v_request_id, v_idempotency_key,
    'system', v_actor_ref, v_environment, v_now
  );

  insert into public.app_case_lifecycle_events (
    case_id, promotion_id, lifecycle_state, event_at,
    actor_type, actor_ref, source_class, source_ref,
    request_id, event_data
  ) values (
    v_case_id, v_promotion_id, 'submitted_for_review', v_now,
    'system', v_actor_ref, 'signed_signup_intake', v_intake_id::text,
    v_request_id,
    jsonb_build_object(
      'account_type', v_account_type,
      'authority_review_status', v_mandate.authority_review_status
    )
  );

  if jsonb_typeof(v_mandate.mandate_content -> 'connection_scope') <> 'array'
     or jsonb_array_length(v_mandate.mandate_content -> 'connection_scope') = 0
     or jsonb_array_length(v_mandate.mandate_content -> 'connection_scope') > 100
     or exists (
       select 1
       from jsonb_array_elements(v_mandate.mandate_content -> 'connection_scope') scope_item
       where btrim(coalesce(scope_item ->> 'location_id', '')) = ''
         or jsonb_typeof(scope_item -> 'addresses') <> 'array'
         or jsonb_array_length(scope_item -> 'addresses') = 0
         or jsonb_typeof(scope_item -> 'eans') <> 'array'
         or jsonb_array_length(scope_item -> 'eans') = 0
         or exists (
           select 1 from jsonb_array_elements_text(scope_item -> 'addresses') address
           where btrim(address) = '' or char_length(address) > 500
         )
         or exists (
           select 1 from jsonb_array_elements_text(scope_item -> 'eans') ean
           where ean !~ '^[0-9]{18}$'
         )
     )
     or (
       select count(*) from jsonb_array_elements(
         v_mandate.mandate_content -> 'connection_scope'
       )
     ) <> (
       select count(distinct scope_item ->> 'location_id')
       from jsonb_array_elements(
         v_mandate.mandate_content -> 'connection_scope'
       ) scope_item
     ) then
    raise exception 'signed location/EAN declaration scope is invalid';
  end if;

  for v_scope_item in
    select scope_item
    from jsonb_array_elements(
      v_mandate.mandate_content -> 'connection_scope'
    ) scope_item
    order by scope_item ->> 'location_id'
  loop
    v_location_id := gen_random_uuid();
    insert into public.app_locations (
      id, created_at, created_by_actor_ref,
      created_from_request_id, creation_basis
    ) values (
      v_location_id, v_now, v_actor_ref,
      v_request_id || ':location:' || (v_scope_item ->> 'location_id'),
      'customer_declaration'
    );

    for v_address_text in
      select address
      from jsonb_array_elements_text(v_scope_item -> 'addresses') address
      order by address
    loop
      insert into public.app_location_address_observations (
        location_id, observation_kind, descriptor_kind,
        observed_at, recorded_at, recorded_by_actor_ref,
        recorded_from_request_id, source_ref_sha256,
        country_code, declared_address_text
      ) values (
        v_location_id, 'customer_declared',
        'unstructured_postal_address', v_intake.finalized_at, v_now,
        v_actor_ref,
        v_request_id || ':address:' || (v_scope_item ->> 'location_id'),
        encode(extensions.digest(v_snapshot.id::text, 'sha256'), 'hex'),
        'NL', btrim(v_address_text)
      );
    end loop;

    v_relation_id := gen_random_uuid();
    insert into public.app_case_location_relations (
      relation_id, case_id, location_id, event_type,
      effective_at, recorded_at, decision_ref, reason_ref,
      recorded_by_actor_ref, request_id
    ) values (
      v_relation_id, v_case_id, v_location_id, 'linked',
      v_intake.finalized_at, v_now, 'signed_signup_intake',
      null, v_actor_ref,
      v_request_id || ':case-location:' || (v_scope_item ->> 'location_id')
    );
  end loop;

  for v_item in
    select item
    from jsonb_array_elements(v_normalized_manifest) item
    order by item ->> 'source_intake_file_id'
  loop
    select * into strict v_source_file
    from public.app_signup_intake_files
    where id = (v_item ->> 'source_intake_file_id')::uuid
      and intake_id = v_intake_id;

    v_evidence_file_id := gen_random_uuid();
    insert into public.app_evidence_files (
      id, case_id, promotion_id, document_type,
      source_class, source_ref, created_at,
      created_by_actor_ref, request_id
    ) values (
      v_evidence_file_id, v_case_id, v_promotion_id,
      v_source_file.document_type, 'signup_quarantine_file',
      v_source_file.id::text, v_now, v_actor_ref, v_request_id
    );

    insert into public.app_evidence_versions (
      evidence_file_id, version_number, source_intake_file_id,
      storage_bucket, storage_path, detected_mime_type,
      size_bytes, sha256, status, source_confirmed_at,
      created_at, request_id, idempotency_key
    ) values (
      v_evidence_file_id, 1, v_source_file.id,
      v_item ->> 'storage_bucket', v_item ->> 'storage_path',
      v_item ->> 'detected_mime_type',
      (v_item ->> 'size_bytes')::bigint, v_item ->> 'sha256',
      'confirmed_awaiting_review', v_source_file.confirmed_at,
      v_now, v_request_id, v_idempotency_key
    );
  end loop;

  update public.app_signup_intakes
  set status = 'promoting', promotion_started_at = v_now
  where id = v_intake_id;

  for v_item in
    select item
    from jsonb_array_elements(v_normalized_manifest) item
  loop
    select evidence_file.id into strict v_evidence_file_id
    from public.app_evidence_files evidence_file
    where evidence_file.promotion_id = v_promotion_id
      and evidence_file.source_ref = v_item ->> 'source_intake_file_id';

    update public.app_signup_intake_files
    set status = 'promoted',
        promoted_at = v_now,
        promoted_evidence_file_id = v_evidence_file_id
    where id = (v_item ->> 'source_intake_file_id')::uuid
      and intake_id = v_intake_id;
  end loop;

  update public.app_signup_intakes
  set status = 'promoted',
      promoted_at = v_now,
      promotion_case_id = v_case_id
  where id = v_intake_id;

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, customer_id,
    request_id, idempotency_key, actor_type, actor_ref,
    event_data
  ) values (
    'signup_promotion_completed', 'case', v_case_id, v_customer.id,
    v_request_id, v_idempotency_key, 'system', v_actor_ref,
    jsonb_build_object(
      'intake_reference', v_intake_id,
      'promotion_reference', v_promotion_id,
      'case_reference', v_case_id,
      'account_type', v_account_type,
      'lifecycle_state', 'submitted_for_review',
      'source_signing_sha256', v_source_signing_sha256,
      'evidence_version_count', jsonb_array_length(v_normalized_manifest)
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'status', 201,
    'mode', 'app_promote_signed_signup_v1',
    'promotion_reference', v_promotion_id,
    'customer_reference', v_customer.id,
    'case_reference', v_case_id,
    'intake_status', 'promoted',
    'replayed', false
  );

  update public.app_idempotency_keys
  set response_status = 201,
      response_body = v_response,
      completed_at = v_now
  where scope = v_scope and key = v_idempotency_key;

  return v_response;
end;
$_$;


--
-- Name: FUNCTION app_promote_signed_signup_v1(p_request jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_promote_signed_signup_v1(p_request jsonb) IS 'Atomically promotes one finalized signed intake. R2 permits on-demand append-only declared-profile convergence only for one uniquely Auth-bound compatible legacy customer; it never performs email-only merge, profile verification, accepted-profile overwrite or authority acceptance.';


--
-- Name: app_promote_signed_signup_v2(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_promote_signed_signup_v2(p_request jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_intake_id uuid;
  v_intake public.app_signup_intakes%rowtype;
  v_provenance public.app_signup_authenticated_intake_provenance%rowtype;
  v_auth_user auth.users%rowtype;
  v_auth_verified_at timestamptz;
  v_snapshot public.app_signup_signing_snapshots%rowtype;
  v_result jsonb;
  v_promotion public.app_signup_promotions%rowtype;
  v_identity public.app_customer_identities%rowtype;
  v_customer public.app_customers%rowtype;
  v_account_type text;
  v_service_name text;
  v_text_values text[];
  v_count integer;
  v_updated integer;
begin
  if jsonb_typeof(p_request) <> 'object'
     or coalesce(p_request ->> 'intake_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid signed signup promotion input';
  end if;
  v_intake_id := (p_request ->> 'intake_id')::uuid;

  select * into v_intake
  from public.app_signup_intakes
  where id = v_intake_id;
  if not found then
    raise exception 'signed signup intake unavailable';
  end if;

  select * into v_provenance
  from public.app_signup_authenticated_intake_provenance
  where intake_id = v_intake_id;
  if found then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'authenticated_intake_binding:' || v_provenance.auth_user_id::text,
        0
      )
    );
    select * into v_auth_user
    from auth.users
    where id = v_provenance.auth_user_id
      and deleted_at is null;
    v_auth_verified_at := coalesce(
      v_auth_user.email_confirmed_at,
      v_auth_user.confirmed_at
    );
    if not found
       or v_auth_verified_at is null
       or lower(v_auth_user.email) is distinct from v_intake.email_normalized
       or encode(
         extensions.digest(lower(v_auth_user.email), 'sha256'),
         'hex'
       ) <> v_provenance.auth_email_sha256 then
      raise exception 'authenticated intake provenance is no longer valid';
    end if;

    select count(*) into v_count
    from auth.users auth_user
    where lower(auth_user.email) = v_intake.email_normalized
      and auth_user.deleted_at is null;
    if v_count <> 1 then
      raise exception 'authenticated promotion Auth identity is ambiguous';
    end if;

    select count(*) into v_count
    from public.app_customer_identities identity_row
    where identity_row.auth_user_id = v_provenance.auth_user_id
      and identity_row.status = 'active';
    if v_count > 1 then
      raise exception 'authenticated user owns conflicting customer identities';
    end if;

    select count(*) into v_count
    from public.app_customer_identities identity_row
    where identity_row.email_normalized = v_intake.email_normalized
      and identity_row.status = 'active';
    if v_count > 1 then
      raise exception 'authenticated promotion identity is ambiguous';
    elsif v_count = 1 then
      select * into strict v_identity
      from public.app_customer_identities identity_row
      where identity_row.email_normalized = v_intake.email_normalized
        and identity_row.status = 'active'
      for update;
      select * into strict v_customer
      from public.app_customers
      where id = v_identity.customer_id
      for update;
      if v_customer.status <> 'active'
         or v_customer.customer_type <>
           v_intake.submitted_payload ->> 'account_type'
         or v_identity.auth_user_id is not null
            and v_identity.auth_user_id <> v_provenance.auth_user_id then
        raise exception 'authenticated promotion identity conflicts';
      end if;
      update public.app_customer_identities
      set auth_user_id = v_provenance.auth_user_id,
          email_verified_at = coalesce(email_verified_at, v_auth_verified_at)
      where id = v_identity.id
        and status = 'active'
        and (auth_user_id is null or auth_user_id = v_provenance.auth_user_id);
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'authenticated promotion pre-binding failed';
      end if;
    else
      select count(*) into v_count
      from public.app_customers customer_row
      where customer_row.status = 'active'
        and customer_row.primary_email_normalized = v_intake.email_normalized;
      if v_count <> 0 then
        raise exception 'email-only customer convergence is not allowed';
      end if;

      select * into strict v_snapshot
      from public.app_signup_signing_snapshots
      where intake_id = v_intake_id;
      v_account_type := v_intake.submitted_payload ->> 'account_type';
      if v_account_type not in ('particulier', 'zakelijk', 'vve') then
        raise exception 'authenticated promotion account type is invalid';
      end if;
      select array_agg(
        distinct btrim(fact ->> 'value')
        order by btrim(fact ->> 'value')
      )
      into v_text_values
      from jsonb_array_elements(
        coalesce(
          v_snapshot.canonical_snapshot #> '{canonical_facts,facts}',
          '[]'::jsonb
        )
      ) fact
      where fact ->> 'fact_key' = case
        when v_account_type = 'particulier' then 'partyName'
        else 'organizationName'
      end
        and btrim(coalesce(fact ->> 'value', '')) <> '';
      if coalesce(array_length(v_text_values, 1), 0) <> 1 then
        raise exception 'authenticated service-recipient declaration is ambiguous';
      end if;
      v_service_name := btrim(v_text_values[1]);

      insert into public.app_customers (
        customer_type,
        display_name,
        preferred_language,
        primary_email_normalized,
        status
      ) values (
        v_account_type,
        v_service_name,
        'nl',
        v_intake.email_normalized,
        'active'
      ) returning * into v_customer;

      insert into public.app_customer_identities (
        customer_id,
        auth_user_id,
        email_normalized,
        email_verified_at,
        identity_provider,
        status
      ) values (
        v_customer.id,
        v_provenance.auth_user_id,
        v_intake.email_normalized,
        v_auth_verified_at,
        'supabase',
        'active'
      ) returning * into v_identity;
    end if;
  end if;

  v_result := public.app_promote_signed_signup_v1(p_request);
  if v_provenance.id is not null and v_result ->> 'ok' <> 'true' then
    raise exception 'authenticated signed promotion did not commit';
  end if;
  if v_result ->> 'ok' <> 'true' or v_provenance.id is null then
    return v_result;
  end if;

  select * into strict v_promotion
  from public.app_signup_promotions
  where intake_id = v_intake_id;
  select * into strict v_identity
  from public.app_customer_identities
  where id = v_promotion.identity_id
  for update;
  select * into strict v_customer
  from public.app_customers
  where id = v_promotion.customer_id
  for update;

  if v_identity.status <> 'active'
     or v_identity.customer_id <> v_customer.id
     or v_identity.email_normalized <> v_intake.email_normalized
     or v_customer.status <> 'active'
     or v_customer.customer_type <> v_promotion.account_type
     or v_identity.auth_user_id is not null
        and v_identity.auth_user_id <> v_provenance.auth_user_id then
    raise exception 'authenticated promotion identity conflicts';
  end if;

  select count(*) into v_count
  from public.app_customer_identities identity_row
  where identity_row.email_normalized = v_intake.email_normalized
    and identity_row.status = 'active';
  if v_count <> 1 then
    raise exception 'authenticated promotion identity is ambiguous';
  end if;

  select count(*) into v_count
  from auth.users auth_user
  where lower(auth_user.email) = v_intake.email_normalized
    and auth_user.deleted_at is null;
  if v_count <> 1 then
    raise exception 'authenticated promotion Auth identity is ambiguous';
  end if;

  select count(*) into v_count
  from public.app_customer_identities identity_row
  where identity_row.auth_user_id = v_provenance.auth_user_id
    and identity_row.status = 'active'
    and identity_row.id <> v_identity.id;
  if v_count <> 0 then
    raise exception 'authenticated user already owns another customer identity';
  end if;

  update public.app_customer_identities
  set auth_user_id = v_provenance.auth_user_id,
      email_verified_at = coalesce(email_verified_at, v_auth_verified_at)
  where id = v_identity.id
    and status = 'active'
    and (auth_user_id is null or auth_user_id = v_provenance.auth_user_id);
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'authenticated promotion binding failed';
  end if;

  return v_result;
end;
$_$;


--
-- Name: FUNCTION app_promote_signed_signup_v2(p_request jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_promote_signed_signup_v2(p_request jsonb) IS 'Runs signed promotion and verified Auth identity binding in one transaction.';


--
-- Name: app_promote_signed_signup_v3(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_promote_signed_signup_v3(p_request jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_intake_id uuid;
  v_intake public.app_signup_intakes%rowtype;
  v_provenance public.app_signup_authenticated_intake_provenance%rowtype;
  v_auth_user auth.users%rowtype;
  v_auth_verified_at timestamptz;
  v_result jsonb;
  v_promotion public.app_signup_promotions%rowtype;
  v_identity public.app_customer_identities%rowtype;
  v_customer public.app_customers%rowtype;
  v_auth_user_count integer;
  v_bound_identity_count integer;
  v_access_count integer;
begin
  if jsonb_typeof(p_request) <> 'object'
     or coalesce(p_request ->> 'intake_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid signed signup promotion input';
  end if;
  v_intake_id := (p_request ->> 'intake_id')::uuid;

  select * into v_intake
  from public.app_signup_intakes
  where id = v_intake_id;
  if not found then raise exception 'signed signup intake unavailable'; end if;

  select * into v_provenance
  from public.app_signup_authenticated_intake_provenance
  where intake_id = v_intake_id;
  if found then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'auth_customer_access:' || v_provenance.auth_user_id::text,
        0
      )
    );
    select * into v_auth_user
    from auth.users
    where id = v_provenance.auth_user_id
      and deleted_at is null;
    v_auth_verified_at := coalesce(
      v_auth_user.email_confirmed_at,
      v_auth_user.confirmed_at
    );
    if not found
       or v_auth_verified_at is null
       or lower(v_auth_user.email) is distinct from v_intake.email_normalized
       or encode(
         extensions.digest(lower(v_auth_user.email), 'sha256'),
         'hex'
       ) <> v_provenance.auth_email_sha256 then
      raise exception 'authenticated intake provenance is no longer valid';
    end if;
    select count(*) into v_auth_user_count
    from auth.users auth_user
    where lower(auth_user.email) = v_intake.email_normalized
      and auth_user.deleted_at is null;
    if v_auth_user_count <> 1 then
      raise exception 'authenticated promotion Auth identity is ambiguous';
    end if;
  end if;

  v_result := public.app_promote_signed_signup_v1(p_request);
  if v_result ->> 'ok' <> 'true' or v_provenance.id is null then
    return v_result;
  end if;

  select * into strict v_promotion
  from public.app_signup_promotions
  where intake_id = v_intake_id;
  select * into strict v_identity
  from public.app_customer_identities
  where id = v_promotion.identity_id
  for update;
  select * into strict v_customer
  from public.app_customers
  where id = v_promotion.customer_id
  for update;

  if v_identity.status <> 'active'
     or v_identity.customer_id <> v_customer.id
     or v_identity.email_normalized <> v_intake.email_normalized
     or v_customer.status <> 'active'
     or v_customer.customer_type <> v_promotion.account_type
     or (
       v_identity.auth_user_id is not null
       and v_identity.auth_user_id <> v_provenance.auth_user_id
     ) then
    raise exception 'authenticated promotion context conflicts';
  end if;

  select count(*) into v_bound_identity_count
  from public.app_customer_identities identity_row
  where identity_row.auth_user_id = v_provenance.auth_user_id
    and identity_row.status = 'active';
  if v_bound_identity_count > 1 then
    raise exception 'authenticated principal identity is ambiguous';
  end if;

  if v_bound_identity_count = 0 then
    update public.app_customer_identities
    set auth_user_id = v_provenance.auth_user_id,
        email_verified_at = coalesce(email_verified_at, v_auth_verified_at),
        identity_provider = 'supabase'
    where id = v_identity.id
      and status = 'active'
      and auth_user_id is null;
    if not found then
      raise exception 'authenticated promotion primary identity binding failed';
    end if;
  elsif v_identity.auth_user_id = v_provenance.auth_user_id then
    update public.app_customer_identities
    set email_verified_at = coalesce(email_verified_at, v_auth_verified_at),
        identity_provider = 'supabase'
    where id = v_identity.id
      and status = 'active'
      and auth_user_id = v_provenance.auth_user_id;
  end if;

  v_access_count := public.app_sync_auth_customer_access_v1(
    v_provenance.auth_user_id,
    coalesce(nullif(btrim(p_request ->> 'request_id'), ''), 'promotion-access')
  );
  if v_access_count = 0 or not exists (
    select 1
    from public.app_customer_access_grants access_grant
    where access_grant.auth_user_id = v_provenance.auth_user_id
      and access_grant.customer_id = v_promotion.customer_id
  ) then
    raise exception 'authenticated promotion access grant failed';
  end if;

  return v_result;
end;
$_$;


--
-- Name: FUNCTION app_promote_signed_signup_v3(p_request jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_promote_signed_signup_v3(p_request jsonb) IS 'Promotes a signed intake into its own account-type-compatible customer context and grants verified Auth access without cross-context customer merge.';


--
-- Name: app_record_location_observation_v1(uuid, text, text, timestamp with time zone, text, text, timestamp with time zone, timestamp with time zone, text, text, integer, text, text, text, text, text, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_record_location_observation_v1(p_location_id uuid, p_observation_kind text, p_descriptor_kind text, p_observed_at timestamp with time zone, p_source_ref_sha256 text, p_source_payload_sha256 text, p_source_retrieved_at timestamp with time zone, p_fresh_until timestamp with time zone, p_country_code text, p_postal_code text, p_house_number integer, p_house_number_addition text, p_street text, p_city text, p_site_reference text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: FUNCTION app_record_location_observation_v1(p_location_id uuid, p_observation_kind text, p_descriptor_kind text, p_observed_at timestamp with time zone, p_source_ref_sha256 text, p_source_payload_sha256 text, p_source_retrieved_at timestamp with time zone, p_fresh_until timestamp with time zone, p_country_code text, p_postal_code text, p_house_number integer, p_house_number_addition text, p_street text, p_city text, p_site_reference text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_record_location_observation_v1(p_location_id uuid, p_observation_kind text, p_descriptor_kind text, p_observed_at timestamp with time zone, p_source_ref_sha256 text, p_source_payload_sha256 text, p_source_retrieved_at timestamp with time zone, p_fresh_until timestamp with time zone, p_country_code text, p_postal_code text, p_house_number integer, p_house_number_addition text, p_street text, p_city text, p_site_reference text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) IS 'Service-role-only immutable location observation. Observed data never auto-accepts or creates a version.';


--
-- Name: app_reject_document_upload_v1(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, integer, text, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_reject_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_response_status integer, p_error_code text, p_error_message text, p_stage text, p_reject_policy text, p_rejection_reason text, p_event_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
declare
  v_identity record;
  v_dossier record;
  v_slot record;
  v_file record;
  v_idem record;
  v_rejected_at timestamptz := now();
  v_response jsonb;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload hash';
  end if;

  if p_response_status < 100 or p_response_status > 599 then
    raise exception 'invalid response status';
  end if;

  if p_reject_policy not in ('nonterminal', 'terminal') then
    raise exception 'invalid reject policy';
  end if;

  if p_actor_ref <> ('app_customer_identity:' || p_identity_id::text) then
    raise exception 'actor reference mismatch';
  end if;

  select id, customer_id, status
    into v_identity
  from public.app_customer_identities
  where id = p_identity_id
    and customer_id = p_customer_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'identity not found or inactive';
  end if;

  select id, customer_id, status
    into v_dossier
  from public.app_customer_dossiers
  where id = p_dossier_id
    and customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'dossier not found or forbidden';
  end if;

  select *
    into v_slot
  from public.app_dossier_document_slots
  where id = p_document_slot_id
    and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'document slot not found';
  end if;

  select *
    into v_file
  from public.app_dossier_document_files
  where id = p_document_file_id
    and document_slot_id = p_document_slot_id
    and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'document file not found';
  end if;

  select *
    into v_idem
  from public.app_idempotency_keys
  where scope = p_idempotency_scope
    and key = p_idempotency_key
  for update;

  if not found then
    raise exception 'idempotency row missing';
  end if;

  if v_idem.payload_hash <> p_payload_hash then
    raise exception 'idempotency payload conflict';
  end if;

  if v_idem.response_status is not null or v_idem.response_body is not null then
    raise exception 'idempotency already completed';
  end if;

  v_response := jsonb_build_object(
    'ok', false,
    'error', p_error_message,
    'code', p_error_code
  );

  if p_reject_policy = 'terminal' then
    update public.app_dossier_document_files
    set
      status = 'rejected',
      rejected_at = v_rejected_at,
      rejection_reason = p_rejection_reason,
      terminal_reason = p_rejection_reason
    where id = p_document_file_id
      and document_slot_id = p_document_slot_id
      and dossier_id = p_dossier_id
      and status in ('issued', 'uploaded');

    if not found then
      raise exception 'document file reject transition failed';
    end if;
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
    'document_upload_confirm_rejected',
    'document',
    p_document_slot_id,
    p_customer_id,
    p_dossier_id,
    p_request_id,
    p_idempotency_key,
    'customer',
    p_actor_ref,
    p_ip_hash,
    p_user_agent_hash,
    jsonb_strip_nulls(jsonb_build_object(
      'environment', p_environment,
      'request_id', p_request_id,
      'idempotency_key', p_idempotency_key,
      'actor_ref', p_actor_ref,
      'customer_id', p_customer_id,
      'identity_id', p_identity_id,
      'dossier_id', p_dossier_id,
      'document_slot_id', p_document_slot_id,
      'document_file_id', p_document_file_id,
      'stage', p_stage,
      'status', p_response_status,
      'reason', p_error_code,
      'reject_policy', p_reject_policy,
      'terminal_transition', p_reject_policy = 'terminal',
      'rejection_reason', p_rejection_reason,
      'rejected_at', case when p_reject_policy = 'terminal' then v_rejected_at else null end
    )) || coalesce(p_event_data, '{}'::jsonb)
  );

  update public.app_idempotency_keys
  set
    response_status = p_response_status,
    response_body = v_response,
    completed_at = v_rejected_at
  where scope = p_idempotency_scope
    and key = p_idempotency_key;

  if not found then
    raise exception 'idempotency finalize failed';
  end if;

  return v_response;
end;
$_$;


--
-- Name: FUNCTION app_reject_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_response_status integer, p_error_code text, p_error_message text, p_stage text, p_reject_policy text, p_rejection_reason text, p_event_data jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_reject_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_response_status integer, p_error_code text, p_error_message text, p_stage text, p_reject_policy text, p_rejection_reason text, p_event_data jsonb) IS 'Atomic service-role-only rejection for ENVAL /app upload confirm: optional terminal file rejection, reject audit, and idempotency finalization in one transaction.';


--
-- Name: app_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: app_signed_signup_declared_data_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signed_signup_declared_data_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.status = 'promoted' and old.status is distinct from new.status then
    perform public.app_materialize_signed_signup_declared_data_v1(new.id);
  end if;
  return null;
end;
$$;


--
-- Name: app_signup_account_handoff_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_account_handoff_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_intake public.app_signup_intakes%rowtype;
  v_snapshot public.app_signup_signing_snapshots%rowtype;
  v_mandate public.app_signup_mandates%rowtype;
  v_identity public.app_customer_identities%rowtype;
  v_customer public.app_customers%rowtype;
  v_authenticated_user record;
  v_account_owner_party_id uuid;
  v_service_name text;
  v_any_identity_count integer;
  v_active_identity_count integer;
  v_auth_user_count integer;
  v_account_owner_count integer;
  v_profile_match_count integer;
begin
  select * into v_intake
  from public.app_signup_intakes
  where id = p_intake_id;
  if not found
     or v_intake.finalized_at is null
     or v_intake.status not in ('submitted_for_review', 'promoted') then
    raise exception 'account handoff unavailable before verified finalization';
  end if;

  select * into strict v_snapshot
  from public.app_signup_signing_snapshots
  where intake_id = p_intake_id;
  select * into strict v_mandate
  from public.app_signup_mandates
  where intake_id = p_intake_id;
  if not exists (
    select 1
    from public.app_signup_signature_evidence evidence
    join public.app_signup_signing_challenges challenge
      on challenge.id = evidence.challenge_id
     and challenge.intake_id = evidence.intake_id
    where evidence.intake_id = p_intake_id
      and evidence.finalized_at = v_intake.finalized_at
      and challenge.delivery_status = 'delivered'
      and challenge.consumed_at is not null
      and challenge.replaced_at is null
  ) then
    raise exception 'account handoff unavailable before verified finalization';
  end if;

  select count(*), count(*) filter (where status = 'active')
  into v_any_identity_count, v_active_identity_count
  from public.app_customer_identities
  where email_normalized = v_intake.email_normalized;
  if v_any_identity_count <> v_active_identity_count
     or v_active_identity_count > 1 then
    return jsonb_build_object('account_handoff', 'blocked');
  end if;

  select count(*) into v_auth_user_count
  from auth.users
  where lower(email) = v_intake.email_normalized
    and deleted_at is null;
  if v_auth_user_count > 1 then
    return jsonb_build_object('account_handoff', 'blocked');
  end if;

  if v_active_identity_count = 1 then
    select * into strict v_identity
    from public.app_customer_identities
    where email_normalized = v_intake.email_normalized
      and status = 'active';
    select * into v_customer
    from public.app_customers
    where id = v_identity.customer_id;
    if not found
       or v_customer.status <> 'active'
       or v_customer.customer_type <> v_mandate.account_type then
      return jsonb_build_object('account_handoff', 'blocked');
    end if;

    select fact ->> 'value' into v_service_name
    from jsonb_array_elements(
      coalesce(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)
    ) fact
    where fact ->> 'fact_key' = case
      when v_mandate.account_type = 'particulier' then 'partyName'
      else 'organizationName'
    end
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_service_name is null then
      return jsonb_build_object('account_handoff', 'blocked');
    end if;

    select count(*), (array_agg(relationship.party_id order by relationship.party_id))[1]
    into v_account_owner_count, v_account_owner_party_id
    from public.app_customer_party_relationships relationship
    where relationship.customer_id = v_customer.id
      and relationship.relationship_role = 'account_owner'
      and relationship.valid_to is null;
    if v_account_owner_count <> 1 then
      return jsonb_build_object('account_handoff', 'blocked');
    end if;

    if v_mandate.account_type = 'particulier' then
      select count(*) into v_profile_match_count
      from public.app_party_person_versions profile
      where profile.party_id = v_account_owner_party_id
        and profile.valid_to is null
        and profile.full_name = v_service_name;
    else
      select count(*) into v_profile_match_count
      from public.app_party_organization_versions profile
      where profile.party_id = v_account_owner_party_id
        and profile.valid_to is null
        and profile.legal_name = v_service_name
        and profile.organization_classification = case
          when v_mandate.account_type = 'vve' then 'vve'
          else 'business'
        end;
    end if;
    if v_profile_match_count <> 1 then
      return jsonb_build_object('account_handoff', 'blocked');
    end if;
  end if;

  if p_authenticated_auth_user_id is not null then
    select id, lower(email) as email_normalized,
           coalesce(email_confirmed_at, confirmed_at) as verified_at
    into v_authenticated_user
    from auth.users
    where id = p_authenticated_auth_user_id
      and deleted_at is null;
    if not found
       or v_authenticated_user.verified_at is null
       or v_authenticated_user.email_normalized is distinct from v_intake.email_normalized
       or (
         v_active_identity_count = 1
         and v_identity.auth_user_id is not null
         and v_identity.auth_user_id <> p_authenticated_auth_user_id
       ) then
      return jsonb_build_object('account_handoff', 'blocked');
    end if;
    return jsonb_build_object('account_handoff', 'already_authenticated');
  end if;

  if v_auth_user_count = 1 then
    return jsonb_build_object(
      'account_handoff', 'existing_account_login_required'
    );
  end if;
  return jsonb_build_object('account_handoff', 'account_activation_available');
end;
$$;


--
-- Name: FUNCTION app_signup_account_handoff_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_signup_account_handoff_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid) IS 'Service-role-only post-verification account guidance. It reveals no account state before finalized email control, grants no ownership, and fails closed on incompatible or ambiguous customer identity context.';


--
-- Name: app_signup_account_handoff_v2(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_account_handoff_v2(p_intake_id uuid, p_authenticated_auth_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_intake public.app_signup_intakes%rowtype;
  v_auth_user record;
  v_auth_user_count integer;
begin
  select * into v_intake
  from public.app_signup_intakes
  where id = p_intake_id;
  if not found
     or v_intake.finalized_at is null
     or v_intake.status not in ('submitted_for_review', 'promoted')
     or not exists (
       select 1
       from public.app_signup_signature_evidence evidence
       join public.app_signup_signing_challenges challenge
         on challenge.id = evidence.challenge_id
        and challenge.intake_id = evidence.intake_id
       where evidence.intake_id = p_intake_id
         and evidence.finalized_at = v_intake.finalized_at
         and challenge.delivery_status = 'delivered'
         and challenge.consumed_at is not null
         and challenge.replaced_at is null
     ) then
    raise exception 'account handoff unavailable before verified finalization';
  end if;

  select count(*) into v_auth_user_count
  from auth.users
  where lower(email) = v_intake.email_normalized
    and deleted_at is null;
  if v_auth_user_count > 1 then
    return jsonb_build_object('account_handoff', 'blocked');
  end if;

  if exists (
    select 1
    from public.app_customer_identities identity_row
    where identity_row.email_normalized = v_intake.email_normalized
      and identity_row.status = 'active'
      and identity_row.auth_user_id is not null
      and not exists (
        select 1
        from auth.users auth_user
        where auth_user.id = identity_row.auth_user_id
          and lower(auth_user.email) = v_intake.email_normalized
          and auth_user.deleted_at is null
          and coalesce(
            auth_user.email_confirmed_at,
            auth_user.confirmed_at
          ) is not null
      )
  ) then
    return jsonb_build_object('account_handoff', 'blocked');
  end if;

  if p_authenticated_auth_user_id is not null then
    select id, lower(email) as email_normalized,
           coalesce(email_confirmed_at, confirmed_at) as verified_at
    into v_auth_user
    from auth.users
    where id = p_authenticated_auth_user_id
      and deleted_at is null;
    if not found
       or v_auth_user.verified_at is null
       or v_auth_user.email_normalized is distinct from v_intake.email_normalized
       or v_auth_user_count <> 1 then
      return jsonb_build_object('account_handoff', 'blocked');
    end if;
    return jsonb_build_object('account_handoff', 'already_authenticated');
  end if;

  if v_auth_user_count = 1 then
    return jsonb_build_object(
      'account_handoff', 'existing_account_login_required'
    );
  end if;
  return jsonb_build_object('account_handoff', 'account_activation_available');
end;
$$;


--
-- Name: FUNCTION app_signup_account_handoff_v2(p_intake_id uuid, p_authenticated_auth_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_signup_account_handoff_v2(p_intake_id uuid, p_authenticated_auth_user_id uuid) IS 'Projects account handoff from finalized signing and unique verified Auth context without treating account type as principal-scoped.';


--
-- Name: app_signup_authenticated_intake_claim_v1(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_authenticated_intake_claim_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid, p_request_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_intake public.app_signup_intakes%rowtype;
  v_auth_user auth.users%rowtype;
  v_verified_at timestamptz;
  v_email_sha256 text;
  v_existing public.app_signup_authenticated_intake_provenance%rowtype;
begin
  if p_intake_id is null
     or p_authenticated_auth_user_id is null
     or coalesce(btrim(p_request_id), '') = '' then
    raise exception 'invalid authenticated intake claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'authenticated_intake_provenance:' || p_intake_id::text,
      0
    )
  );

  select * into v_intake
  from public.app_signup_intakes
  where id = p_intake_id
  for update;
  if not found
     or v_intake.status not in ('submitted_for_review', 'promoted')
     or v_intake.finalized_at is null
     or not exists (
       select 1
       from public.app_signup_signature_evidence evidence
       join public.app_signup_signing_challenges challenge
         on challenge.id = evidence.challenge_id
       where evidence.intake_id = v_intake.id
         and evidence.finalized_at = v_intake.finalized_at
         and challenge.intake_id = v_intake.id
         and challenge.delivery_status = 'delivered'
         and challenge.consumed_at is not null
         and challenge.replaced_at is null
     ) then
    raise exception 'signed intake is not eligible for Auth recovery';
  end if;

  select * into v_auth_user
  from auth.users
  where id = p_authenticated_auth_user_id
    and deleted_at is null;
  v_verified_at := coalesce(
    v_auth_user.email_confirmed_at,
    v_auth_user.confirmed_at
  );
  if not found
     or v_verified_at is null
     or lower(v_auth_user.email) is distinct from v_intake.email_normalized then
    raise exception 'verified Auth context does not match signed intake';
  end if;
  v_email_sha256 := encode(
    extensions.digest(lower(v_auth_user.email), 'sha256'),
    'hex'
  );

  insert into public.app_signup_authenticated_intake_provenance (
    intake_id,
    auth_user_id,
    auth_email_sha256,
    auth_email_verified_at,
    linkage_type,
    request_id
  ) values (
    v_intake.id,
    p_authenticated_auth_user_id,
    v_email_sha256,
    v_verified_at,
    'verified_auth_recovery_after_signing',
    p_request_id
  ) on conflict (intake_id) do nothing;

  select * into strict v_existing
  from public.app_signup_authenticated_intake_provenance
  where intake_id = v_intake.id;
  if v_existing.auth_user_id <> p_authenticated_auth_user_id
     or v_existing.auth_email_sha256 <> v_email_sha256 then
    raise exception 'authenticated intake provenance conflicts';
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 200,
    'mode', 'app_signup_authenticated_intake_claim_v1',
    'replayed', v_existing.created_at < now()
  );
end;
$$;


--
-- Name: FUNCTION app_signup_authenticated_intake_claim_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid, p_request_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_signup_authenticated_intake_claim_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid, p_request_id text) IS 'Append-only verified Auth recovery anchor for a previously finalized signed intake.';


--
-- Name: app_signup_authenticated_intake_provenance_immutable_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_authenticated_intake_provenance_immutable_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'authenticated intake provenance is immutable';
end;
$$;


--
-- Name: app_signup_immutable_signing_record_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_immutable_signing_record_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception 'immutable signup signing record cannot be changed';
end;
$$;


--
-- Name: app_signup_intake_capabilities_transition_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_intake_capabilities_transition_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.id is distinct from old.id
     or new.intake_id is distinct from old.intake_id
     or new.intake_file_id is distinct from old.intake_file_id
     or new.capability_type is distinct from old.capability_type
     or new.token_sha256 is distinct from old.token_sha256
     or new.issued_at is distinct from old.issued_at
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable app_signup_intake_capabilities fields cannot be changed';
  end if;

  if old.consumed_at is not null or old.invalidated_at is not null then
    raise exception 'terminal app_signup_intake_capabilities rows cannot be updated';
  end if;

  return new;
end;
$$;


--
-- Name: app_signup_intake_files_finalized_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_intake_files_finalized_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_intake_id uuid;
  v_intake_status text;
begin
  v_intake_id := case when tg_op = 'INSERT' then new.intake_id else old.intake_id end;
  select status into v_intake_status
  from public.app_signup_intakes
  where id = v_intake_id;

  if v_intake_status = 'collecting' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and v_intake_status = 'promoting'
     and old.status = 'confirmed_quarantine'
     and new.status = 'promoted'
     and new.promoted_at is not null
     and new.promoted_evidence_file_id is not null
     and new.promoted_document_file_id is null
     and (to_jsonb(new) - 'status' - 'promoted_at' - 'promoted_evidence_file_id')
       = (to_jsonb(old) - 'status' - 'promoted_at' - 'promoted_evidence_file_id') then
    return new;
  end if;

  raise exception 'finalized signup intake files are immutable';
end;
$$;


--
-- Name: app_signup_intake_files_transition_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_intake_files_transition_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.id is distinct from old.id
     or new.intake_id is distinct from old.intake_id
     or new.client_slot_id is distinct from old.client_slot_id
     or new.document_type is distinct from old.document_type
     or new.original_filename is distinct from old.original_filename
     or new.declared_mime_type is distinct from old.declared_mime_type
     or new.size_bytes is distinct from old.size_bytes
     or new.sha256 is distinct from old.sha256
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or new.revision_number is distinct from old.revision_number
     or new.supersedes_intake_file_id is distinct from old.supersedes_intake_file_id then
    raise exception 'immutable app_signup_intake_files identity fields cannot be changed';
  end if;

  if old.detected_mime_type is not null
     and new.detected_mime_type is distinct from old.detected_mime_type then
    raise exception 'observed app_signup_intake_files mime cannot be changed';
  end if;

  if old.server_size_bytes is not null
     and new.server_size_bytes is distinct from old.server_size_bytes then
    raise exception 'observed app_signup_intake_files size cannot be changed';
  end if;

  if old.server_sha256 is not null
     and new.server_sha256 is distinct from old.server_sha256 then
    raise exception 'observed app_signup_intake_files hash cannot be changed';
  end if;

  if old.confirmed_at is not null then
    if new.uploaded_at is distinct from old.uploaded_at
       or new.confirmed_at is distinct from old.confirmed_at then
      raise exception 'confirmed app_signup_intake_files metadata cannot be changed';
    end if;
  end if;

  if old.superseded_at is not null then
    if new.superseded_at is distinct from old.superseded_at
       or new.superseded_by_intake_file_id is distinct from old.superseded_by_intake_file_id then
      raise exception 'supersession metadata cannot be changed';
    end if;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'expected' and new.status in ('upload_issued', 'rejected', 'expired', 'superseded') then
      return new;
    end if;
    if old.status = 'upload_issued' and new.status in ('uploaded_pending_confirm', 'confirmed_quarantine', 'rejected', 'expired', 'superseded') then
      return new;
    end if;
    if old.status = 'uploaded_pending_confirm' and new.status in ('confirmed_quarantine', 'rejected', 'expired', 'superseded') then
      return new;
    end if;
    if old.status = 'confirmed_quarantine' and new.status in ('promoted', 'rejected', 'expired', 'superseded') then
      return new;
    end if;
    raise exception 'invalid app_signup_intake_files status transition from % to %', old.status, new.status;
  end if;

  if old.status in ('superseded', 'promoted', 'rejected', 'expired') then
    raise exception 'terminal app_signup_intake_files rows cannot be updated';
  end if;

  return new;
end;
$$;


--
-- Name: app_signup_intakes_transition_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_intakes_transition_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if old.finalized_at is not null then
    if new.submitted_payload is distinct from old.submitted_payload
       or new.submitted_payload_sha256 is distinct from old.submitted_payload_sha256
       or new.accepted_legal_versions is distinct from old.accepted_legal_versions
       or new.email_normalized is distinct from old.email_normalized
       or new.finalized_at is distinct from old.finalized_at then
      raise exception 'finalized app_signup_intakes submitted facts cannot be changed';
    end if;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'immutable app_signup_intakes identity fields cannot be changed';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'collecting' and new.status = 'submitted_for_review' then
      return new;
    end if;
    if old.status = 'submitted_for_review'
       and new.status in ('promoting', 'expired', 'rejected') then
      return new;
    end if;
    if old.status = 'promoting' and new.status in ('promoted', 'rejected') then
      return new;
    end if;
    raise exception 'invalid app_signup_intakes status transition from % to %',
      old.status, new.status;
  end if;

  if old.status in ('promoted', 'expired') then
    raise exception 'terminal app_signup_intakes rows cannot be updated';
  end if;

  return new;
end;
$$;


--
-- Name: app_signup_promotion_immutable_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_promotion_immutable_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception '% rows are immutable and cannot be updated or deleted',
    tg_table_name;
end;
$$;


--
-- Name: app_signup_quarantine_confirm_v1(uuid, uuid, text, bigint, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_quarantine_confirm_v1(p_intake_id uuid, p_file_id uuid, p_upload_token_sha256 text, p_actual_size_bytes bigint, p_detected_mime_type text, p_server_sha256 text, p_failure_code text, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-upload-confirm:v1:' || p_intake_id::text || ':' || p_file_id::text;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_file public.app_signup_intake_files%rowtype;
  v_capability public.app_signup_intake_capabilities%rowtype;
  v_reason text := null;
  v_response jsonb;
begin
  if p_upload_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or (p_server_sha256 is not null and p_server_sha256 !~ '^[0-9a-f]{64}$')
     or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid signup upload confirm input';
  end if;

  insert into public.app_idempotency_keys (
    scope, key, payload_hash, locked_at, expires_at
  ) values (
    v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours'
  ) on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key for update;
  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraag is al gebruikt met andere inhoud.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Upload wordt al bevestigd.');
  end if;

  select * into v_intake from public.app_signup_intakes
  where id = p_intake_id for update;
  select * into v_file from public.app_signup_intake_files
  where id = p_file_id and intake_id = p_intake_id for update;
  select * into v_capability from public.app_signup_intake_capabilities
  where intake_id = p_intake_id and intake_file_id = p_file_id
    and capability_type = 'quarantine_upload'
    and token_sha256 = p_upload_token_sha256 for update;

  if v_intake.id is null or v_file.id is null or v_capability.id is null then
    raise exception 'signup upload capability scope mismatch';
  end if;
  if v_intake.status <> 'collecting' or v_intake.expires_at <= v_now
     or v_file.status not in ('upload_issued', 'uploaded_pending_confirm')
     or v_file.superseded_at is not null
     or v_capability.consumed_at is not null
     or v_capability.invalidated_at is not null then
    raise exception 'signup upload is not confirmable';
  end if;

  if v_capability.expires_at <= v_now or v_file.expires_at <= v_now then
    update public.app_signup_intake_capabilities
    set invalidated_at = v_now where id = v_capability.id;
    update public.app_signup_intake_files
    set status = 'expired' where id = v_file.id;
    v_response := jsonb_build_object('ok', false, 'status', 410, 'code', 'upload_expired', 'error', 'Upload is verlopen.');
  else
    if p_failure_code is not null then
      v_reason := p_failure_code;
    elsif p_actual_size_bytes is null or p_server_sha256 is null or p_detected_mime_type is null then
      v_reason := 'object_missing';
    elsif p_actual_size_bytes <> v_file.size_bytes then
      v_reason := 'size_mismatch';
    elsif lower(p_server_sha256) <> v_file.sha256 then
      v_reason := 'hash_mismatch';
    elsif lower(p_detected_mime_type) <> 'application/pdf' then
      v_reason := 'unsupported_file_type';
    end if;

    update public.app_signup_intake_capabilities
    set consumed_at = v_now where id = v_capability.id;

    if v_reason is null then
      update public.app_signup_intake_files
      set status = 'confirmed_quarantine',
          uploaded_at = v_now,
          confirmed_at = v_now,
          detected_mime_type = 'application/pdf',
          server_size_bytes = p_actual_size_bytes,
          server_sha256 = lower(p_server_sha256)
      where id = v_file.id;
      v_response := jsonb_build_object(
        'ok', true, 'status', 200, 'mode', 'signup_upload_confirm_v1',
        'request_id', p_request_id, 'intake_reference', p_intake_id,
        'file_reference', p_file_id, 'client_slot_id', v_file.client_slot_id,
        'revision_number', v_file.revision_number,
        'file_status', 'confirmed_quarantine', 'replayed', false
      );
    else
      update public.app_signup_intake_files
      set status = 'rejected',
          uploaded_at = case when p_actual_size_bytes is null then null else v_now end,
          rejected_at = v_now,
          detected_mime_type = nullif(lower(coalesce(p_detected_mime_type, '')), ''),
          server_size_bytes = p_actual_size_bytes,
          server_sha256 = lower(p_server_sha256)
      where id = v_file.id;
      v_response := jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'upload_rejected',
        'error', 'Upload kon niet worden bevestigd.'
      );
    end if;
  end if;

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash,
    user_agent_hash, event_data
  ) values (
    case when (v_response ->> 'ok')::boolean then
      'signup_quarantine_upload_confirmed'
    else 'signup_quarantine_upload_rejected' end,
    p_request_id, p_idempotency_key, 'anonymous', p_ip_hash,
    p_user_agent_hash,
    jsonb_build_object(
      'environment', coalesce(p_environment, 'unknown'),
      'intake_reference', p_intake_id,
      'file_reference', p_file_id,
      'client_slot_id', v_file.client_slot_id,
      'revision_number', v_file.revision_number,
      'result', case when (v_response ->> 'ok')::boolean then 'confirmed_quarantine' else coalesce(v_reason, 'expired') end
    )
  );

  update public.app_idempotency_keys
  set response_status = (v_response ->> 'status')::integer,
      response_body = v_response,
      completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;
  return v_response;
end;
$_$;


--
-- Name: app_signup_quarantine_issue_v1(uuid, text, text, text, text, text, bigint, text, text, text, timestamp with time zone, timestamp with time zone, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_quarantine_issue_v1(p_intake_id uuid, p_manage_token_sha256 text, p_client_slot_id text, p_document_type text, p_original_filename text, p_declared_mime_type text, p_size_bytes bigint, p_client_sha256 text, p_payload_hash text, p_upload_token_sha256 text, p_file_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-upload-url:v1:' || p_intake_id::text || ':' || p_client_slot_id;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_current public.app_signup_intake_files%rowtype;
  v_file_id uuid := gen_random_uuid();
  v_revision integer;
  v_storage_path text;
  v_response jsonb;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_upload_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_client_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_client_slot_id is null or btrim(p_client_slot_id) = '' or length(p_client_slot_id) > 200
     or p_document_type not in ('organization_extract', 'energy_bill_or_contract', 'installation_invoice')
     or p_original_filename is null or btrim(p_original_filename) = '' or length(p_original_filename) > 180
     or p_original_filename ~ '[/\\]'
     or p_original_filename like '%..%'
     or lower(btrim(p_declared_mime_type)) <> 'application/pdf'
     or p_size_bytes <= 0 or p_size_bytes > 15728640
     or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid signup upload issue input';
  end if;

  if p_file_expires_at <= v_now + interval '5 minutes'
     or p_file_expires_at > v_now + interval '24 hours'
     or p_capability_expires_at <= v_now + interval '5 minutes'
     or p_capability_expires_at > p_file_expires_at then
    raise exception 'invalid signup upload expiry';
  end if;

  insert into public.app_idempotency_keys (
    scope, key, payload_hash, locked_at, expires_at
  ) values (
    v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours'
  ) on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem
  from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key
  for update;

  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraag is al gebruikt met andere inhoud.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Upload wordt al voorbereid.');
  end if;

  select * into v_intake
  from public.app_signup_intakes
  where id = p_intake_id
  for update;

  if not found or v_intake.status <> 'collecting' or v_intake.expires_at <= v_now then
    raise exception 'signup intake unavailable';
  end if;

  select * into v_manage
  from public.app_signup_intake_capabilities
  where intake_id = p_intake_id
    and intake_file_id is null
    and capability_type = 'intake_manage'
    and token_sha256 = p_manage_token_sha256
  for update;

  if not found or v_manage.consumed_at is not null
     or v_manage.invalidated_at is not null or v_manage.expires_at <= v_now then
    raise exception 'signup intake capability unavailable';
  end if;

  select * into v_current
  from public.app_signup_intake_files
  where intake_id = p_intake_id
    and client_slot_id = p_client_slot_id
    and status not in ('superseded', 'promoted', 'rejected', 'expired')
  for update;

  select coalesce(max(revision_number), 0) + 1 into v_revision
  from public.app_signup_intake_files
  where intake_id = p_intake_id and client_slot_id = p_client_slot_id;

  if v_current.id is not null then
    update public.app_signup_intake_files
    set status = 'superseded',
        superseded_at = v_now,
        superseded_by_intake_file_id = v_file_id
    where id = v_current.id;

    update public.app_signup_intake_capabilities
    set invalidated_at = v_now
    where intake_file_id = v_current.id
      and capability_type = 'quarantine_upload'
      and consumed_at is null
      and invalidated_at is null;
  end if;

  v_storage_path := 'signup-quarantine/' || p_intake_id::text || '/' || v_file_id::text || '/document.pdf';

  insert into public.app_signup_intake_files (
    id, intake_id, client_slot_id, document_type, original_filename,
    declared_mime_type, size_bytes, sha256, storage_bucket, storage_path,
    status, issued_at, expires_at, revision_number,
    supersedes_intake_file_id
  ) values (
    v_file_id, p_intake_id, p_client_slot_id, p_document_type,
    btrim(p_original_filename), 'application/pdf', p_size_bytes,
    lower(p_client_sha256), 'app-documents', v_storage_path,
    'upload_issued', v_now, p_file_expires_at, v_revision, v_current.id
  );

  insert into public.app_signup_intake_capabilities (
    intake_id, intake_file_id, capability_type, token_sha256,
    issued_at, expires_at
  ) values (
    p_intake_id, v_file_id, 'quarantine_upload', p_upload_token_sha256,
    v_now, p_capability_expires_at
  );

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash,
    user_agent_hash, event_data
  ) values (
    'signup_quarantine_upload_issued', p_request_id, p_idempotency_key,
    'anonymous', p_ip_hash, p_user_agent_hash,
    jsonb_build_object(
      'environment', coalesce(p_environment, 'unknown'),
      'intake_reference', p_intake_id,
      'file_reference', v_file_id,
      'client_slot_id', p_client_slot_id,
      'document_type', p_document_type,
      'revision_number', v_revision,
      'replacement', v_current.id is not null
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'status', 201,
    'mode', 'signup_upload_url_v1',
    'request_id', p_request_id,
    'intake_reference', p_intake_id,
    'file_reference', v_file_id,
    'client_slot_id', p_client_slot_id,
    'revision_number', v_revision,
    'storage_bucket', 'app-documents',
    'storage_path', v_storage_path,
    'expires_at', p_file_expires_at,
    'replayed', false
  );

  update public.app_idempotency_keys
  set response_status = 201, response_body = v_response, completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;

  return v_response;
end;
$_$;


--
-- Name: app_signup_quarantine_remove_v1(uuid, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_quarantine_remove_v1(p_intake_id uuid, p_manage_token_sha256 text, p_client_slot_id text, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-upload-remove:v1:' || p_intake_id::text || ':' || p_client_slot_id;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_current public.app_signup_intake_files%rowtype;
  v_response jsonb;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_client_slot_id is null or btrim(p_client_slot_id) = '' or length(p_client_slot_id) > 200
     or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid signup upload remove input';
  end if;

  insert into public.app_idempotency_keys (
    scope, key, payload_hash, locked_at, expires_at
  ) values (
    v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours'
  ) on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key for update;
  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraag is al gebruikt met andere inhoud.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Wijziging wordt al verwerkt.');
  end if;

  select * into v_intake from public.app_signup_intakes
  where id = p_intake_id for update;
  if not found or v_intake.status <> 'collecting' or v_intake.expires_at <= v_now then
    raise exception 'signup intake unavailable';
  end if;

  select * into v_manage from public.app_signup_intake_capabilities
  where intake_id = p_intake_id and intake_file_id is null
    and capability_type = 'intake_manage'
    and token_sha256 = p_manage_token_sha256 for update;
  if not found or v_manage.consumed_at is not null
     or v_manage.invalidated_at is not null or v_manage.expires_at <= v_now then
    raise exception 'signup intake capability unavailable';
  end if;

  select * into v_current from public.app_signup_intake_files
  where intake_id = p_intake_id and client_slot_id = p_client_slot_id
    and status not in ('superseded', 'promoted', 'rejected', 'expired')
  for update;

  if v_current.id is not null then
    update public.app_signup_intake_files
    set status = 'superseded', superseded_at = v_now
    where id = v_current.id;
    update public.app_signup_intake_capabilities
    set invalidated_at = v_now
    where intake_file_id = v_current.id and capability_type = 'quarantine_upload'
      and consumed_at is null and invalidated_at is null;
  end if;

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash,
    user_agent_hash, event_data
  ) values (
    'signup_quarantine_upload_removed', p_request_id, p_idempotency_key,
    'anonymous', p_ip_hash, p_user_agent_hash,
    jsonb_build_object(
      'environment', coalesce(p_environment, 'unknown'),
      'intake_reference', p_intake_id,
      'client_slot_id', p_client_slot_id,
      'removed', v_current.id is not null
    )
  );

  v_response := jsonb_build_object(
    'ok', true, 'status', 200, 'mode', 'signup_upload_remove_v1',
    'request_id', p_request_id, 'intake_reference', p_intake_id,
    'client_slot_id', p_client_slot_id, 'removed', v_current.id is not null,
    'replayed', false
  );
  update public.app_idempotency_keys
  set response_status = 200, response_body = v_response, completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;
  return v_response;
end;
$_$;


--
-- Name: app_signup_quarantine_start_v1(text, text, text, text, timestamp with time zone, timestamp with time zone, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_quarantine_start_v1(p_account_type text, p_email_normalized text, p_payload_hash text, p_manage_token_sha256 text, p_intake_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-intake-start:v1';
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if p_account_type not in ('particulier', 'zakelijk', 'vve')
     or p_email_normalized is null
     or p_email_normalized <> lower(btrim(p_email_normalized))
     or p_email_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null
     or btrim(p_idempotency_key) = '' then
    raise exception 'invalid signup intake start input';
  end if;

  if p_intake_expires_at <= v_now + interval '5 minutes'
     or p_intake_expires_at > v_now + interval '7 days'
     or p_capability_expires_at <= v_now + interval '5 minutes'
     or p_capability_expires_at > p_intake_expires_at then
    raise exception 'invalid signup intake expiry';
  end if;

  insert into public.app_idempotency_keys (
    scope, key, payload_hash, locked_at, expires_at
  ) values (
    v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours'
  ) on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem
  from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key
  for update;

  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraag is al gebruikt met andere inhoud.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Aanvraag wordt al verwerkt.');
  end if;

  insert into public.app_signup_intakes (
    id, status, submitted_payload, submitted_payload_sha256,
    accepted_legal_versions, email_normalized, request_id, expires_at
  ) values (
    v_intake_id, 'collecting', jsonb_build_object(
      'account_type', p_account_type,
      'email', p_email_normalized
    ),
    p_payload_hash, jsonb_build_object('items', jsonb_build_array()),
    p_email_normalized, p_request_id, p_intake_expires_at
  );

  insert into public.app_signup_intake_capabilities (
    intake_id, intake_file_id, capability_type, token_sha256,
    issued_at, expires_at
  ) values (
    v_intake_id, null, 'intake_manage', p_manage_token_sha256,
    v_now, p_capability_expires_at
  );

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash,
    user_agent_hash, event_data
  ) values (
    'signup_intake_collecting_started', p_request_id, p_idempotency_key,
    'anonymous', p_ip_hash, p_user_agent_hash,
    jsonb_build_object(
      'environment', coalesce(p_environment, 'unknown'),
      'intake_reference', v_intake_id,
      'status', 'collecting'
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'status', 201,
    'mode', 'signup_intake_start_v1',
    'request_id', p_request_id,
    'intake_reference', v_intake_id,
    'intake_expires_at', p_intake_expires_at,
    'capability_expires_at', p_capability_expires_at,
    'replayed', false
  );

  update public.app_idempotency_keys
  set response_status = 201, response_body = v_response, completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;

  return v_response;
end;
$_$;


--
-- Name: app_signup_quarantine_start_v2(text, text, text, text, timestamp with time zone, timestamp with time zone, text, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_quarantine_start_v2(p_account_type text, p_email_normalized text, p_payload_hash text, p_manage_token_sha256 text, p_intake_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_authenticated_auth_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_response jsonb;
  v_intake_id uuid;
  v_auth_user auth.users%rowtype;
  v_verified_at timestamptz;
  v_email_sha256 text;
  v_existing public.app_signup_authenticated_intake_provenance%rowtype;
begin
  if p_authenticated_auth_user_id is not null then
    select * into v_auth_user
    from auth.users
    where id = p_authenticated_auth_user_id
      and deleted_at is null;

    v_verified_at := coalesce(
      v_auth_user.email_confirmed_at,
      v_auth_user.confirmed_at
    );
    if not found
       or v_verified_at is null
       or lower(v_auth_user.email) is distinct from p_email_normalized then
      raise exception 'verified Auth context does not match intake e-mail';
    end if;
    v_email_sha256 := encode(
      extensions.digest(lower(v_auth_user.email), 'sha256'),
      'hex'
    );
  end if;

  v_response := public.app_signup_quarantine_start_v1(
    p_account_type,
    p_email_normalized,
    p_payload_hash,
    p_manage_token_sha256,
    p_intake_expires_at,
    p_capability_expires_at,
    p_request_id,
    p_idempotency_key,
    p_ip_hash,
    p_user_agent_hash,
    p_environment
  );

  if p_authenticated_auth_user_id is null or v_response ->> 'ok' <> 'true' then
    return v_response;
  end if;

  v_intake_id := (v_response ->> 'intake_reference')::uuid;
  insert into public.app_signup_authenticated_intake_provenance (
    intake_id,
    auth_user_id,
    auth_email_sha256,
    auth_email_verified_at,
    linkage_type,
    request_id
  ) values (
    v_intake_id,
    p_authenticated_auth_user_id,
    v_email_sha256,
    v_verified_at,
    'verified_auth_at_intake_start',
    p_request_id
  ) on conflict (intake_id) do nothing;

  select * into strict v_existing
  from public.app_signup_authenticated_intake_provenance
  where intake_id = v_intake_id;
  if v_existing.auth_user_id <> p_authenticated_auth_user_id
     or v_existing.auth_email_sha256 <> v_email_sha256 then
    raise exception 'authenticated intake provenance conflicts';
  end if;

  return v_response;
end;
$$;


--
-- Name: FUNCTION app_signup_quarantine_start_v2(p_account_type text, p_email_normalized text, p_payload_hash text, p_manage_token_sha256 text, p_intake_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_authenticated_auth_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_signup_quarantine_start_v2(p_account_type text, p_email_normalized text, p_payload_hash text, p_manage_token_sha256 text, p_intake_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_authenticated_auth_user_id uuid) IS 'Atomically starts an anonymous or server-verified authenticated intake.';


--
-- Name: app_signup_signing_challenge_issue_v1(uuid, text, text, text, timestamp with time zone, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_signing_challenge_issue_v1(p_intake_id uuid, p_manage_token_sha256 text, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_expires_at timestamp with time zone, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-signing-challenge:v1:' || p_intake_id::text;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_challenge_id uuid := gen_random_uuid();
  v_response jsonb;
  v_recent integer;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_channel_reference_sha256 !~ '^[0-9a-f]{64}$'
     or p_otp_verifier_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or p_expires_at <= v_now or p_expires_at > v_now + interval '10 minutes' then
    raise exception 'invalid signing challenge input';
  end if;

  select * into v_intake from public.app_signup_intakes where id = p_intake_id for update;
  if not found or v_intake.status <> 'collecting' or v_intake.expires_at <= v_now then
    raise exception 'signup intake unavailable';
  end if;
  select * into v_manage from public.app_signup_intake_capabilities
  where intake_id = p_intake_id and intake_file_id is null
    and capability_type = 'intake_manage' and token_sha256 = p_manage_token_sha256
  for update;
  if not found or v_manage.consumed_at is not null or v_manage.invalidated_at is not null
     or v_manage.expires_at <= v_now then
    raise exception 'signup intake capability unavailable';
  end if;

  insert into public.app_idempotency_keys (scope, key, payload_hash, locked_at, expires_at)
  values (v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours')
  on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key for update;
  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraagcode is al gebruikt.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Code wordt al aangevraagd.');
  end if;

  select count(*) into v_recent from public.app_signup_signing_challenges
  where (intake_id = p_intake_id or channel_reference_sha256 = p_channel_reference_sha256)
    and created_at > v_now - interval '10 minutes';
  if v_recent >= 3 then
    v_response := jsonb_build_object('ok', false, 'status', 429, 'code', 'rate_limited', 'error', 'Wacht voordat je een nieuwe code aanvraagt.');
    update public.app_idempotency_keys set response_status = 429, response_body = v_response, completed_at = v_now
    where scope = v_scope and key = p_idempotency_key;
    return v_response;
  end if;

  update public.app_signup_signing_challenges set replaced_at = v_now
  where intake_id = p_intake_id and consumed_at is null and replaced_at is null
    and delivery_status in ('pending', 'delivered');

  insert into public.app_signup_signing_challenges (
    id, intake_id, method_id, method_version, channel_reference_sha256,
    otp_verifier_sha256, expires_at
  ) values (
    v_challenge_id, p_intake_id, 'typed_name_otp_v1', '1',
    p_channel_reference_sha256, p_otp_verifier_sha256, p_expires_at
  );

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash, user_agent_hash, event_data
  ) values (
    'signup_signing_challenge_issued', p_request_id, p_idempotency_key,
    'anonymous', p_ip_hash, p_user_agent_hash,
    jsonb_build_object('environment', coalesce(p_environment, 'unknown'),
      'intake_reference', p_intake_id, 'challenge_reference', v_challenge_id,
      'method_id', 'typed_name_otp_v1', 'expiry_seconds', 600)
  );

  v_response := jsonb_build_object('ok', true, 'status', 201,
    'mode', 'signup_signing_challenge_v1', 'challenge_reference', v_challenge_id,
    'expires_at', p_expires_at, 'attempts_remaining', 5, 'replayed', false);
  update public.app_idempotency_keys set response_status = 201, response_body = v_response, completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;
  return v_response;
end;
$_$;


--
-- Name: app_signup_signing_finalize_v1(uuid, text, uuid, text, text, text, jsonb, text, jsonb, uuid[], text, integer, timestamp with time zone, jsonb, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_signing_finalize_v1(p_intake_id uuid, p_manage_token_sha256 text, p_challenge_id uuid, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_payload_hash text, p_canonical_snapshot jsonb, p_snapshot_sha256 text, p_legal_documents jsonb, p_required_file_ids uuid[], p_account_type text, p_mandate_year integer, p_issued_at timestamp with time zone, p_mandate_content jsonb, p_typed_full_name text, p_signer_role text, p_method_version text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-signing-finalize:v1:' || p_intake_id::text;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_challenge public.app_signup_signing_challenges%rowtype;
  v_snapshot_id uuid := gen_random_uuid();
  v_mandate_id uuid := gen_random_uuid();
  v_evidence_id uuid := gen_random_uuid();
  v_response jsonb;
  v_file_count integer;
  v_distinct_file_count integer;
  v_bad_fact boolean;
  v_safe_reference text;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_channel_reference_sha256 !~ '^[0-9a-f]{64}$'
     or p_otp_verifier_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     or p_account_type not in ('particulier', 'zakelijk', 'vve')
     or p_mandate_year not between 2020 and 2100
     or p_issued_at is null
     or p_issued_at < v_now - interval '1 minute' or p_issued_at > v_now + interval '1 minute'
     or p_method_version <> '1'
     or p_typed_full_name is null or btrim(p_typed_full_name) = ''
     or (p_account_type <> 'particulier' and (p_signer_role is null or btrim(p_signer_role) = ''))
     or p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or jsonb_typeof(p_canonical_snapshot) <> 'object'
     or jsonb_typeof(p_mandate_content) <> 'object'
     or jsonb_typeof(p_legal_documents) <> 'array'
     or coalesce(array_length(p_required_file_ids, 1), 0) = 0 then
    raise exception 'invalid signing finalization input';
  end if;

  insert into public.app_idempotency_keys (scope, key, payload_hash, locked_at, expires_at)
  values (v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours')
  on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_idem from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key for update;
  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraagcode is al gebruikt.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Ondertekening wordt al verwerkt.');
  end if;

  select * into v_intake from public.app_signup_intakes where id = p_intake_id for update;
  if not found then raise exception 'signup intake unavailable'; end if;
  if v_intake.status <> 'collecting' then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'intake_locked', 'error', 'Deze aanmelding kan niet meer worden gewijzigd.');
  end if;
  if v_intake.expires_at <= v_now then raise exception 'signup intake unavailable'; end if;

  select * into v_manage from public.app_signup_intake_capabilities
  where intake_id = p_intake_id and intake_file_id is null
    and capability_type = 'intake_manage' and token_sha256 = p_manage_token_sha256
  for update;
  if not found or v_manage.consumed_at is not null or v_manage.invalidated_at is not null
     or v_manage.expires_at <= v_now then
    raise exception 'signup intake capability unavailable';
  end if;

  select * into v_challenge from public.app_signup_signing_challenges
  where id = p_challenge_id and intake_id = p_intake_id for update;
  if not found or v_challenge.delivery_status <> 'delivered'
     or v_challenge.replaced_at is not null or v_challenge.consumed_at is not null then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'challenge_unavailable', 'error', 'Vraag een nieuwe code aan.');
  end if;
  if v_challenge.channel_reference_sha256 <> p_channel_reference_sha256 then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'channel_mismatch', 'error', 'Vraag een nieuwe code aan.');
  end if;
  if v_challenge.expires_at <= v_now then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'otp_expired', 'error', 'De code is verlopen. Vraag een nieuwe code aan.');
  end if;
  if v_challenge.attempts_remaining <= 0 then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'attempts_exhausted', 'error', 'Vraag een nieuwe code aan.');
  end if;
  if v_challenge.otp_verifier_sha256 <> p_otp_verifier_sha256 then
    update public.app_signup_signing_challenges
    set attempts_remaining = greatest(attempts_remaining - 1, 0)
    where id = p_challenge_id;
    v_response := jsonb_build_object('ok', false, 'status', 422, 'code', 'otp_invalid',
      'error', 'De code klopt niet.', 'attempts_remaining', greatest(v_challenge.attempts_remaining - 1, 0));
    update public.app_idempotency_keys set response_status = 422, response_body = v_response, completed_at = v_now
    where scope = v_scope and key = p_idempotency_key;
    return v_response;
  end if;

  select count(*), count(distinct candidate) into v_file_count, v_distinct_file_count
  from unnest(p_required_file_ids) candidate;
  if v_file_count <> v_distinct_file_count then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'file_scope_invalid', 'error', 'Controleer de documenten.');
  end if;
  select count(*) into v_file_count from public.app_signup_intake_files
  where intake_id = p_intake_id and id = any(p_required_file_ids)
    and status = 'confirmed_quarantine' and superseded_at is null
    and superseded_by_intake_file_id is null;
  if v_file_count <> array_length(p_required_file_ids, 1) then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'required_files_unavailable', 'error', 'Controleer de documenten.');
  end if;

  select exists (
    select 1 from jsonb_array_elements(coalesce(p_canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)) fact
    where coalesce((fact ->> 'required')::boolean, false)
      and (coalesce(fact ->> 'value', '') = '' or fact ->> 'resolution_state' in ('pending', 'blocked'))
  ) into v_bad_fact;
  if v_bad_fact or jsonb_array_length(coalesce(p_canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)) = 0 then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'facts_not_ready', 'error', 'Controleer de verplichte gegevens.');
  end if;
  if jsonb_array_length(p_legal_documents) <> 4
     or (select count(distinct item ->> 'document_type') from jsonb_array_elements(p_legal_documents) item) <> 4
     or exists (select 1 from jsonb_array_elements(p_legal_documents) item
       where item ->> 'document_type' not in ('privacy_notice', 'service_terms', 'fee_terms', 'mandate')
         or item ->> 'content_sha256' !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'legal_bundle_invalid', 'error', 'Juridische documenten zijn niet beschikbaar.');
  end if;
  if (p_mandate_content -> 'validity' -> 'calendar_years') <> jsonb_build_array(p_mandate_year) then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'mandate_year_invalid', 'error', 'Kies één kalenderjaar.');
  end if;

  insert into public.app_signup_signing_snapshots (
    id, intake_id, schema_version, canonical_snapshot, canonical_snapshot_sha256
  ) values (v_snapshot_id, p_intake_id, 'signup-signing-runtime-snapshot-v1', p_canonical_snapshot, p_snapshot_sha256);

  insert into public.app_signup_legal_acceptances (
    intake_id, snapshot_id, action_type, document_type, document_version,
    language, content_sha256, accepted_at
  )
  select p_intake_id, v_snapshot_id,
    case item ->> 'document_type'
      when 'privacy_notice' then 'privacy_notice_read'
      when 'service_terms' then 'service_terms_accepted'
      when 'fee_terms' then 'fee_terms_accepted'
    end,
    item ->> 'document_type', item ->> 'version', item ->> 'language',
    item ->> 'content_sha256', v_now
  from jsonb_array_elements(p_legal_documents) item
  where item ->> 'document_type' <> 'mandate';

  insert into public.app_signup_mandates (
    id, intake_id, snapshot_id, account_type, calendar_year, issued_at,
    mandate_content, authority_review_status
  ) values (
    v_mandate_id, p_intake_id, v_snapshot_id, p_account_type, p_mandate_year,
    p_issued_at, p_mandate_content,
    case when p_account_type = 'particulier' then 'not_applicable' else 'required_not_completed' end
  );

  insert into public.app_signup_signature_evidence (
    id, intake_id, snapshot_id, mandate_id, challenge_id, method_id,
    method_version, typed_full_name, signer_role, channel_reference_sha256,
    evidence_envelope, finalized_at
  ) values (
    v_evidence_id, p_intake_id, v_snapshot_id, v_mandate_id, p_challenge_id,
    'typed_name_otp_v1', p_method_version, btrim(p_typed_full_name),
    coalesce(btrim(p_signer_role), ''), v_challenge.channel_reference_sha256,
    jsonb_build_object(
      'evidence_version', 'signing-evidence-v1',
      'method_id', 'typed_name_otp_v1', 'method_version', p_method_version,
      'challenge_reference', p_challenge_id,
      'verified_channel_reference', v_challenge.channel_reference_sha256,
      'verified_at', v_now, 'snapshot_sha256', p_snapshot_sha256,
      'legal_documents', p_legal_documents,
      'request_reference', p_request_id
    ), v_now
  );

  update public.app_signup_signing_challenges set consumed_at = v_now where id = p_challenge_id;
  update public.app_signup_intake_capabilities set consumed_at = v_now
  where id = v_manage.id;
  update public.app_signup_intakes
  set status = 'submitted_for_review', finalized_at = v_now,
      accepted_legal_versions = jsonb_build_object('items', p_legal_documents)
  where id = p_intake_id;

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash, user_agent_hash, event_data
  ) values (
    'signup_signing_finalized', p_request_id, p_idempotency_key, 'anonymous',
    p_ip_hash, p_user_agent_hash,
    jsonb_build_object('environment', coalesce(p_environment, 'unknown'),
      'intake_reference', p_intake_id, 'snapshot_reference', v_snapshot_id,
      'mandate_reference', v_mandate_id, 'evidence_reference', v_evidence_id,
      'method_id', 'typed_name_otp_v1', 'calendar_year', p_mandate_year,
      'next_status', 'submitted_for_review')
  );

  v_safe_reference := 'SIG-' || upper(substr(p_snapshot_sha256, 1, 12));
  v_response := jsonb_build_object('ok', true, 'status', 201,
    'mode', 'signup_signing_finalize_v1', 'safe_reference', v_safe_reference,
    'intake_status', 'pending_verification', 'replayed', false);
  update public.app_idempotency_keys set response_status = 201, response_body = v_response, completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;
  return v_response;
end;
$_$;


--
-- Name: app_signup_signing_finalize_v2(uuid, text, uuid, text, text, text, jsonb, text, jsonb, uuid[], text, integer, timestamp with time zone, jsonb, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_signing_finalize_v2(p_intake_id uuid, p_manage_token_sha256 text, p_challenge_id uuid, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_payload_hash text, p_canonical_snapshot jsonb, p_snapshot_sha256 text, p_legal_documents jsonb, p_required_file_ids uuid[], p_account_type text, p_mandate_year integer, p_issued_at timestamp with time zone, p_mandate_content jsonb, p_typed_full_name text, p_signer_role text, p_method_version text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_response jsonb;
begin
  v_response := public.app_signup_signing_finalize_v1(
    p_intake_id, p_manage_token_sha256, p_challenge_id,
    p_channel_reference_sha256, p_otp_verifier_sha256, p_payload_hash,
    p_canonical_snapshot, p_snapshot_sha256, p_legal_documents,
    p_required_file_ids, p_account_type, p_mandate_year, p_issued_at,
    p_mandate_content, p_typed_full_name, p_signer_role, p_method_version,
    p_request_id, p_idempotency_key, p_ip_hash, p_user_agent_hash,
    p_environment
  );

  if coalesce((v_response ->> 'ok')::boolean, false) then
    v_response := jsonb_set(
      v_response,
      '{intake_status}',
      '"submitted_for_review"'::jsonb,
      true
    );
  end if;
  return v_response;
end;
$$;


--
-- Name: app_signup_signing_status_v1(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_signing_status_v1(p_intake_id uuid, p_manage_token_sha256 text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := now();
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_snapshot public.app_signup_signing_snapshots%rowtype;
  v_mandate public.app_signup_mandates%rowtype;
  v_evidence public.app_signup_signature_evidence%rowtype;
  v_challenge public.app_signup_signing_challenges%rowtype;
  v_snapshot_count integer;
  v_acceptance_count integer;
  v_mandate_count integer;
  v_evidence_count integer;
  v_audit_count integer;
  v_safe_reference text;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid signing status input';
  end if;

  select * into v_intake
  from public.app_signup_intakes
  where id = p_intake_id;
  if not found then
    raise exception 'signup intake unavailable';
  end if;

  select * into v_manage
  from public.app_signup_intake_capabilities
  where intake_id = p_intake_id
    and intake_file_id is null
    and capability_type = 'intake_manage'
    and token_sha256 = p_manage_token_sha256;
  if not found or v_manage.invalidated_at is not null
     or v_manage.expires_at <= v_now then
    raise exception 'signup intake capability unavailable';
  end if;

  select count(*) into v_snapshot_count
  from public.app_signup_signing_snapshots where intake_id = p_intake_id;
  select count(*) into v_acceptance_count
  from public.app_signup_legal_acceptances where intake_id = p_intake_id;
  select count(*) into v_mandate_count
  from public.app_signup_mandates where intake_id = p_intake_id;
  select count(*) into v_evidence_count
  from public.app_signup_signature_evidence where intake_id = p_intake_id;

  if v_intake.status = 'collecting' then
    if v_manage.consumed_at is not null
       or v_snapshot_count <> 0 or v_acceptance_count <> 0
       or v_mandate_count <> 0 or v_evidence_count <> 0 then
      raise exception 'inconsistent collecting signup intake';
    end if;
    return jsonb_build_object(
      'ok', true,
      'status', 200,
      'mode', 'signup_signing_status_v1',
      'signing_state', 'collecting',
      'locked', false,
      'intake_status', 'collecting'
    );
  end if;

  if v_intake.status <> 'submitted_for_review'
     or v_intake.finalized_at is null
     or v_manage.consumed_at is null
     or v_snapshot_count <> 1
     or v_acceptance_count <> 3
     or v_mandate_count <> 1
     or v_evidence_count <> 1 then
    raise exception 'signup signing status unavailable';
  end if;

  select * into strict v_snapshot
  from public.app_signup_signing_snapshots where intake_id = p_intake_id;
  select * into strict v_mandate
  from public.app_signup_mandates where intake_id = p_intake_id;
  select * into strict v_evidence
  from public.app_signup_signature_evidence where intake_id = p_intake_id;
  select * into strict v_challenge
  from public.app_signup_signing_challenges where id = v_evidence.challenge_id;

  if v_snapshot.canonical_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     or v_mandate.snapshot_id <> v_snapshot.id
     or v_evidence.snapshot_id <> v_snapshot.id
     or v_evidence.mandate_id <> v_mandate.id
     or v_evidence.intake_id <> p_intake_id
     or v_evidence.method_id <> 'typed_name_otp_v1'
     or v_evidence.finalized_at is null
     or v_challenge.intake_id <> p_intake_id
     or v_challenge.delivery_status <> 'delivered'
     or v_challenge.consumed_at is null
     or exists (
       select 1 from public.app_signup_legal_acceptances acceptance
       where acceptance.intake_id = p_intake_id
         and (
           acceptance.snapshot_id <> v_snapshot.id
           or acceptance.content_sha256 !~ '^[0-9a-f]{64}$'
         )
     )
     or (
       select count(distinct acceptance.action_type)
       from public.app_signup_legal_acceptances acceptance
       where acceptance.intake_id = p_intake_id
     ) <> 3
     or jsonb_array_length(
       coalesce(v_snapshot.canonical_snapshot -> 'legal_documents', '[]'::jsonb)
     ) <> 4
     or exists (
       select 1
       from jsonb_array_elements(
         coalesce(v_snapshot.canonical_snapshot -> 'legal_documents', '[]'::jsonb)
       ) document
       where document ->> 'content_sha256' !~ '^[0-9a-f]{64}$'
     ) then
    raise exception 'inconsistent finalized signup intake';
  end if;

  select count(*) into v_audit_count
  from public.app_intake_audit_events event
  where event.event_type = 'signup_signing_finalized'
    and event.event_data ->> 'intake_reference' = p_intake_id::text;
  if v_audit_count <> 1 then
    raise exception 'inconsistent signup signing audit';
  end if;

  v_safe_reference := 'SIG-' || upper(substr(v_snapshot.canonical_snapshot_sha256, 1, 12));
  return jsonb_build_object(
    'ok', true,
    'status', 200,
    'mode', 'signup_signing_status_v1',
    'signing_state', 'finalized',
    'locked', true,
    'safe_reference', v_safe_reference,
    'intake_status', 'pending_verification',
    'finalized_at', v_intake.finalized_at
  );
end;
$_$;


--
-- Name: app_signup_signing_status_v2(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_signup_signing_status_v2(p_intake_id uuid, p_manage_token_sha256 text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := now();
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_snapshot public.app_signup_signing_snapshots%rowtype;
  v_mandate public.app_signup_mandates%rowtype;
  v_evidence public.app_signup_signature_evidence%rowtype;
  v_challenge public.app_signup_signing_challenges%rowtype;
  v_response jsonb;
  v_snapshot_count integer;
  v_acceptance_count integer;
  v_mandate_count integer;
  v_evidence_count integer;
  v_audit_count integer;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid signing status input';
  end if;

  select * into v_intake
  from public.app_signup_intakes
  where id = p_intake_id;
  if not found then raise exception 'signup intake unavailable'; end if;

  if v_intake.status in ('collecting', 'submitted_for_review') then
    v_response := public.app_signup_signing_status_v1(
      p_intake_id,
      p_manage_token_sha256
    );
    if v_response ->> 'signing_state' = 'finalized' then
      v_response := jsonb_set(
        v_response,
        '{intake_status}',
        '"submitted_for_review"'::jsonb,
        true
      );
    end if;
    return v_response;
  end if;

  if v_intake.status <> 'promoted' or v_intake.finalized_at is null
     or v_intake.promotion_case_id is null or v_intake.promoted_at is null then
    raise exception 'signup signing status unavailable';
  end if;

  select * into v_manage
  from public.app_signup_intake_capabilities
  where intake_id = p_intake_id
    and intake_file_id is null
    and capability_type = 'intake_manage'
    and token_sha256 = p_manage_token_sha256;
  if not found or v_manage.invalidated_at is not null
     or v_manage.expires_at <= v_now or v_manage.consumed_at is null then
    raise exception 'signup intake capability unavailable';
  end if;

  select count(*) into v_snapshot_count
  from public.app_signup_signing_snapshots where intake_id = p_intake_id;
  select count(*) into v_acceptance_count
  from public.app_signup_legal_acceptances where intake_id = p_intake_id;
  select count(*) into v_mandate_count
  from public.app_signup_mandates where intake_id = p_intake_id;
  select count(*) into v_evidence_count
  from public.app_signup_signature_evidence where intake_id = p_intake_id;
  select count(*) into v_audit_count
  from public.app_intake_audit_events
  where event_type = 'signup_signing_finalized'
    and event_data ->> 'intake_reference' = p_intake_id::text;

  if v_snapshot_count <> 1 or v_acceptance_count <> 3
     or v_mandate_count <> 1 or v_evidence_count <> 1
     or v_audit_count <> 1 then
    raise exception 'inconsistent finalized signup intake';
  end if;

  select * into strict v_snapshot
  from public.app_signup_signing_snapshots where intake_id = p_intake_id;
  select * into strict v_mandate
  from public.app_signup_mandates where intake_id = p_intake_id;
  select * into strict v_evidence
  from public.app_signup_signature_evidence where intake_id = p_intake_id;
  select * into strict v_challenge
  from public.app_signup_signing_challenges where id = v_evidence.challenge_id;

  if v_snapshot.canonical_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     or v_mandate.snapshot_id <> v_snapshot.id
     or v_evidence.snapshot_id <> v_snapshot.id
     or v_evidence.mandate_id <> v_mandate.id
     or v_evidence.method_id <> 'typed_name_otp_v1'
     or v_challenge.intake_id <> p_intake_id
     or v_challenge.delivery_status <> 'delivered'
     or v_challenge.consumed_at is null then
    raise exception 'inconsistent finalized signup intake';
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 200,
    'mode', 'signup_signing_status_v2',
    'signing_state', 'finalized',
    'locked', true,
    'safe_reference', 'SIG-' || upper(substr(
      v_snapshot.canonical_snapshot_sha256,
      1,
      12
    )),
    'intake_status', 'submitted_for_review',
    'finalized_at', v_intake.finalized_at
  );
end;
$_$;


--
-- Name: app_submit_signup_v4(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_submit_signup_v4(p_request jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_scope text;
  v_key text;
  v_payload_hash text;
  v_request_id text;
  v_environment text;
  v_actor_ref text;
  v_ip_hash text;
  v_user_agent_hash text;
  v_email text;
  v_account_type text;
  v_display_name text;
  v_declaration jsonb;
  v_declaration_kind text;
  v_person_first_name text;
  v_person_last_name text;
  v_person_full_name text;
  v_organization_classification text;
  v_organization_legal_name text;
  v_trade_register_number text;
  v_expires_at timestamptz;
  v_idempotency public.app_idempotency_keys%rowtype;
  v_customer_id uuid;
  v_dossier_id uuid;
  v_source_id uuid;
  v_customer_event_type text := 'customer_matched';
  v_location jsonb;
  v_charger jsonb;
  v_acceptance jsonb;
  v_location_id uuid;
  v_charger_id uuid;
  v_location_count integer := 0;
  v_charger_count integer := 0;
  v_document_slot_count integer := 0;
  v_legal_acceptance_count integer := 0;
  v_client_location_ids text[] := array[]::text[];
  v_client_charger_ids text[] := array[]::text[];
  v_document_types text[] := array[]::text[];
  v_acceptance_types text[] := array[]::text[];
  v_response_body jsonb;
  v_failure_stage text :=
    pg_catalog.current_setting('enval.proof_failure_stage', true);
begin
  if p_request is null
     or pg_catalog.jsonb_typeof(p_request) <> 'object' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_signup_contract',
      'message', 'Controleer de aanvraag.'
    );
  end if;

  v_scope := pg_catalog.btrim(p_request ->> 'idempotency_scope');
  v_key := pg_catalog.btrim(p_request ->> 'idempotency_key');
  v_payload_hash := pg_catalog.lower(
    pg_catalog.btrim(p_request ->> 'payload_hash')
  );
  v_request_id := pg_catalog.btrim(p_request ->> 'request_id');
  v_environment := pg_catalog.btrim(p_request ->> 'environment');
  v_actor_ref := pg_catalog.btrim(p_request ->> 'actor_ref');
  v_ip_hash := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_request ->> 'ip_hash')),
    ''
  );
  v_user_agent_hash := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_request ->> 'user_agent_hash')),
    ''
  );
  v_email := pg_catalog.lower(pg_catalog.btrim(p_request ->> 'email_normalized'));
  v_account_type := pg_catalog.btrim(p_request ->> 'account_type');
  v_display_name := pg_catalog.btrim(p_request ->> 'display_name');
  v_declaration := p_request -> 'declaration';

  begin
    v_expires_at := (p_request ->> 'idempotency_expires_at')::timestamptz;
  exception
    when others then
      v_expires_at := null;
  end;

  if v_scope <> 'api-app-signup-submit:v3'
     or v_key is null
     or v_key = ''
     or v_payload_hash !~ '^[0-9a-f]{64}$'
     or v_request_id is null
     or v_request_id = ''
     or v_environment is null
     or v_environment = ''
     or v_actor_ref <> 'api-app-signup-submit'
     or v_email is null
     or v_email = ''
     or pg_catalog.strpos(v_email, '@') <= 1
     or v_account_type not in ('particulier', 'zakelijk', 'vve')
     or v_display_name is null
     or v_display_name = ''
     or v_expires_at is null
     or v_expires_at <= v_now
     or (
       v_ip_hash is not null
       and v_ip_hash !~ '^[0-9a-f]{64}$'
     )
     or (
       v_user_agent_hash is not null
       and v_user_agent_hash !~ '^[0-9a-f]{64}$'
     )
     or v_declaration is null
     or pg_catalog.jsonb_typeof(v_declaration) <> 'object'
     or pg_catalog.jsonb_typeof(p_request -> 'locations') <> 'array'
     or pg_catalog.jsonb_array_length(p_request -> 'locations') < 1
     or pg_catalog.jsonb_typeof(p_request -> 'legal_acceptances') <> 'array'
  then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_signup_contract',
      'message', 'Controleer de aanvraag.'
    );
  end if;

  v_declaration_kind :=
    pg_catalog.btrim(v_declaration ->> 'declaration_kind');
  v_person_first_name := nullif(
    pg_catalog.btrim(v_declaration ->> 'person_first_name'),
    ''
  );
  v_person_last_name := nullif(
    pg_catalog.btrim(v_declaration ->> 'person_last_name'),
    ''
  );
  v_person_full_name := nullif(
    pg_catalog.btrim(v_declaration ->> 'person_full_name'),
    ''
  );
  v_organization_classification := nullif(
    pg_catalog.btrim(v_declaration ->> 'organization_classification'),
    ''
  );
  v_organization_legal_name := nullif(
    pg_catalog.btrim(v_declaration ->> 'organization_legal_name'),
    ''
  );
  v_trade_register_number := nullif(
    pg_catalog.btrim(v_declaration ->> 'trade_register_number'),
    ''
  );

  if (
    v_account_type = 'particulier'
    and (
      v_declaration_kind <> 'natural_person'
      or v_person_first_name is null
      or v_person_last_name is null
      or v_person_full_name is distinct from
        v_person_first_name || ' ' || v_person_last_name
      or v_display_name is distinct from v_person_full_name
      or v_organization_classification is not null
      or v_organization_legal_name is not null
      or v_trade_register_number is not null
    )
  ) or (
    v_account_type in ('zakelijk', 'vve')
    and (
      v_declaration_kind <> 'organization'
      or v_person_first_name is not null
      or v_person_last_name is not null
      or v_person_full_name is not null
      or v_organization_classification is distinct from
        case v_account_type
          when 'zakelijk' then 'business'
          else 'vve'
        end
      or v_organization_legal_name is null
      or v_trade_register_number !~ '^[0-9]{8}$'
      or v_display_name is distinct from v_organization_legal_name
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_signup_contract',
      'message', 'Controleer de aanvrager- of organisatiegegevens.'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'app_submit_signup_v4:idempotency:' || v_scope || ':' || v_key,
      0
    )
  );

  select i.*
    into v_idempotency
  from public.app_idempotency_keys i
  where i.scope = v_scope
    and i.key = v_key
  for update;

  if found then
    if v_idempotency.payload_hash <> v_payload_hash then
      insert into public.app_intake_audit_events (
        event_type,
        request_id,
        idempotency_key,
        actor_type,
        actor_ref,
        ip_hash,
        user_agent_hash,
        event_data,
        created_at
      )
      values (
        'signup_submit_idempotency_conflict',
        v_request_id,
        v_key,
        'edge_function',
        v_actor_ref,
        v_ip_hash,
        v_user_agent_hash,
        pg_catalog.jsonb_build_object(
          'reason', 'idempotency_conflict',
          'scope', v_scope,
          'environment', v_environment
        ),
        v_now
      );

      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'idempotency_conflict',
        'message', 'Deze aanvraag hoort bij een andere payload.'
      );
    end if;

    if (v_idempotency.response_status is null)
         <> (v_idempotency.response_body is null) then
      raise exception 'signup idempotency response state invalid';
    end if;

    if v_idempotency.response_status is not null then
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'status', v_idempotency.response_status,
        'replayed', true,
        'body', v_idempotency.response_body
      );
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'request_in_progress',
      'message', 'Aanmelding wordt al verwerkt.'
    );
  end if;

  insert into public.app_idempotency_keys (
    scope,
    key,
    payload_hash,
    locked_at,
    expires_at,
    created_at
  )
  values (
    v_scope,
    v_key,
    v_payload_hash,
    v_now,
    v_expires_at,
    v_now
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'app_submit_signup_v4:email:' || v_email,
      0
    )
  );

  select i.customer_id
    into v_customer_id
  from public.app_customer_identities i
  where i.email_normalized = v_email
    and i.status = 'active'
  order by i.created_at, i.id
  limit 1
  for update;

  if not found then
    insert into public.app_customers (
      customer_type,
      display_name,
      preferred_language,
      primary_email_normalized,
      status,
      created_at,
      updated_at
    )
    values (
      v_account_type,
      v_display_name,
      'nl',
      v_email,
      'active',
      v_now,
      v_now
    )
    returning id into v_customer_id;

    v_customer_event_type := 'customer_created';

    if v_failure_stage = 'after_customer' then
      raise exception 'proof_failure_after_customer';
    end if;

    insert into public.app_customer_identities (
      customer_id,
      email_normalized,
      identity_provider,
      status,
      created_at
    )
    values (
      v_customer_id,
      v_email,
      'supabase',
      'active',
      v_now
    );
  elsif v_failure_stage = 'after_customer' then
    raise exception 'proof_failure_after_customer';
  end if;

  insert into public.app_customer_dossiers (
    customer_id,
    account_type,
    status,
    retention_class,
    submitted_at,
    created_at,
    updated_at
  )
  values (
    v_customer_id,
    v_account_type,
    'submitted',
    'standard',
    v_now,
    v_now,
    v_now
  )
  returning id into v_dossier_id;

  if v_failure_stage = 'after_dossier' then
    raise exception 'proof_failure_after_dossier';
  end if;

  for v_location in
    select value
    from pg_catalog.jsonb_array_elements(p_request -> 'locations')
  loop
    if pg_catalog.jsonb_typeof(v_location) <> 'object'
       or pg_catalog.btrim(v_location ->> 'client_location_id') = ''
       or pg_catalog.btrim(v_location ->> 'postcode_normalized') = ''
       or pg_catalog.btrim(v_location ->> 'house_number') = ''
       or pg_catalog.jsonb_typeof(v_location -> 'chargers') <> 'array'
       or pg_catalog.jsonb_array_length(v_location -> 'chargers') < 1
       or pg_catalog.btrim(v_location ->> 'client_location_id') =
         any(v_client_location_ids)
    then
      raise exception 'invalid normalized signup location';
    end if;

    v_client_location_ids := pg_catalog.array_append(
      v_client_location_ids,
      pg_catalog.btrim(v_location ->> 'client_location_id')
    );

    insert into public.app_dossier_locations (
      dossier_id,
      client_location_id,
      label,
      status,
      postcode_normalized,
      house_number,
      suffix_normalized,
      street,
      city,
      country,
      lookup_provider,
      lookup_provider_id,
      lookup_metadata,
      created_at,
      updated_at
    )
    values (
      v_dossier_id,
      pg_catalog.btrim(v_location ->> 'client_location_id'),
      nullif(pg_catalog.btrim(v_location ->> 'label'), ''),
      'submitted',
      pg_catalog.btrim(v_location ->> 'postcode_normalized'),
      pg_catalog.btrim(v_location ->> 'house_number'),
      nullif(pg_catalog.btrim(v_location ->> 'suffix_normalized'), ''),
      nullif(pg_catalog.btrim(v_location ->> 'street'), ''),
      nullif(pg_catalog.btrim(v_location ->> 'city'), ''),
      coalesce(
        nullif(pg_catalog.btrim(v_location ->> 'country'), ''),
        'Nederland'
      ),
      nullif(pg_catalog.btrim(v_location ->> 'lookup_provider'), ''),
      nullif(pg_catalog.btrim(v_location ->> 'lookup_provider_id'), ''),
      coalesce(v_location -> 'lookup_metadata', '{}'::jsonb),
      v_now,
      v_now
    )
    returning id into v_location_id;

    v_location_count := v_location_count + 1;

    for v_charger in
      select value
      from pg_catalog.jsonb_array_elements(v_location -> 'chargers')
    loop
      if pg_catalog.jsonb_typeof(v_charger) <> 'object'
         or pg_catalog.btrim(v_charger ->> 'client_charger_id') = ''
         or pg_catalog.btrim(v_charger ->> 'mid_number') = ''
         or pg_catalog.btrim(v_charger ->> 'client_charger_id') =
           any(v_client_charger_ids)
         or (
           v_charger ->> 'installation_year' is not null
           and (
             (v_charger ->> 'installation_year') !~ '^[0-9]{4}$'
             or (v_charger ->> 'installation_year')::integer
               not between 1990 and 2050
           )
         )
      then
        raise exception 'invalid normalized signup charger';
      end if;

      v_client_charger_ids := pg_catalog.array_append(
        v_client_charger_ids,
        pg_catalog.btrim(v_charger ->> 'client_charger_id')
      );

      insert into public.app_dossier_chargers (
        dossier_id,
        location_id,
        client_charger_id,
        status,
        brand_id,
        brand_label,
        manual_brand,
        model_id,
        model_label,
        manual_model,
        serial_number,
        mid_number,
        mid_status,
        backend_supplier_id,
        backend_supplier_label,
        manual_backend_supplier,
        installation_year,
        solar_export_status,
        created_at,
        updated_at
      )
      values (
        v_dossier_id,
        v_location_id,
        pg_catalog.btrim(v_charger ->> 'client_charger_id'),
        'submitted',
        nullif(pg_catalog.btrim(v_charger ->> 'brand_id'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'brand_label'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'manual_brand'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'model_id'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'model_label'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'manual_model'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'serial_number'), ''),
        pg_catalog.btrim(v_charger ->> 'mid_number'),
        'submitted',
        nullif(pg_catalog.btrim(v_charger ->> 'backend_supplier_id'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'backend_supplier_label'), ''),
        nullif(
          pg_catalog.btrim(v_charger ->> 'manual_backend_supplier'),
          ''
        ),
        nullif(v_charger ->> 'installation_year', '')::integer,
        nullif(pg_catalog.btrim(v_charger ->> 'solar_export_status'), ''),
        v_now,
        v_now
      )
      returning id into v_charger_id;

      v_charger_count := v_charger_count + 1;

      insert into public.app_dossier_document_slots (
        dossier_id,
        location_id,
        charger_id,
        client_slot_id,
        document_type,
        status,
        required,
        title,
        metadata,
        created_at,
        updated_at
      )
      values
      (
        v_dossier_id,
        v_location_id,
        v_charger_id,
        'charger-' ||
          pg_catalog.btrim(v_charger ->> 'client_charger_id') ||
          '-mid-evidence',
        'mid_meter_evidence',
        'expected',
        true,
        'MID bewijs laadpaal',
        pg_catalog.jsonb_build_object(
          'source', 'signup_submit',
          'client_location_id',
            pg_catalog.btrim(v_location ->> 'client_location_id'),
          'client_charger_id',
            pg_catalog.btrim(v_charger ->> 'client_charger_id')
        ),
        v_now,
        v_now
      ),
      (
        v_dossier_id,
        v_location_id,
        v_charger_id,
        'charger-' ||
          pg_catalog.btrim(v_charger ->> 'client_charger_id') ||
          '-invoice-or-ownership',
        'invoice_or_ownership_evidence',
        'expected',
        true,
        'Factuur of eigendomsbewijs laadpaal',
        pg_catalog.jsonb_build_object(
          'source', 'signup_submit',
          'client_location_id',
            pg_catalog.btrim(v_location ->> 'client_location_id'),
          'client_charger_id',
            pg_catalog.btrim(v_charger ->> 'client_charger_id')
        ),
        v_now,
        v_now
      );

      v_document_slot_count := v_document_slot_count + 2;
    end loop;
  end loop;

  insert into public.app_dossier_document_slots (
    dossier_id,
    location_id,
    charger_id,
    client_slot_id,
    document_type,
    status,
    required,
    title,
    metadata,
    created_at,
    updated_at
  )
  values (
    v_dossier_id,
    null,
    null,
    'dossier-contract-or-mandate',
    'mandate_or_authorization',
    'expected',
    true,
    'Machtiging of akkoord voor verwerking',
    pg_catalog.jsonb_build_object('source', 'signup_submit'),
    v_now,
    v_now
  );

  v_document_slot_count := v_document_slot_count + 1;
  v_document_types := array[
    'invoice_or_ownership_evidence',
    'mandate_or_authorization',
    'mid_meter_evidence'
  ];

  for v_acceptance in
    select value
    from pg_catalog.jsonb_array_elements(p_request -> 'legal_acceptances')
  loop
    if pg_catalog.jsonb_typeof(v_acceptance) <> 'object'
       or pg_catalog.btrim(v_acceptance ->> 'acceptance_type') not in (
         'consent_bundle',
         'fee_terms',
         'privacy_terms',
         'service_terms',
         'mandate_authorization'
       )
       or pg_catalog.btrim(v_acceptance ->> 'version_ref') = ''
       or (
         nullif(pg_catalog.btrim(v_acceptance ->> 'version_hash'), '')
           is not null
         and pg_catalog.lower(
           pg_catalog.btrim(v_acceptance ->> 'version_hash')
         ) !~ '^[0-9a-f]{64}$'
       )
       or (
         pg_catalog.btrim(v_acceptance ->> 'acceptance_type') || '|' ||
         pg_catalog.btrim(v_acceptance ->> 'version_ref')
       ) = any(v_acceptance_types)
    then
      raise exception 'invalid normalized signup legal acceptance';
    end if;

    v_acceptance_types := pg_catalog.array_append(
      v_acceptance_types,
      pg_catalog.btrim(v_acceptance ->> 'acceptance_type') || '|' ||
        pg_catalog.btrim(v_acceptance ->> 'version_ref')
    );

    insert into public.app_dossier_legal_acceptances (
      dossier_id,
      customer_id,
      acceptance_type,
      status,
      version_ref,
      version_hash,
      accepted_at,
      actor_type,
      actor_ref,
      ip_hash,
      user_agent_hash,
      evidence_data,
      created_at,
      updated_at
    )
    values (
      v_dossier_id,
      v_customer_id,
      pg_catalog.btrim(v_acceptance ->> 'acceptance_type'),
      'accepted',
      pg_catalog.btrim(v_acceptance ->> 'version_ref'),
      nullif(
        pg_catalog.lower(
          pg_catalog.btrim(v_acceptance ->> 'version_hash')
        ),
        ''
      ),
      v_now,
      'customer',
      v_customer_id::text,
      v_ip_hash,
      v_user_agent_hash,
      pg_catalog.jsonb_build_object(
        'source', 'signup_submit',
        'accepted', true
      ),
      v_now,
      v_now
    );

    v_legal_acceptance_count := v_legal_acceptance_count + 1;
  end loop;

  if not exists (
    select 1
    from pg_catalog.unnest(v_acceptance_types) value
    where value like 'consent_bundle|%'
  ) or not exists (
    select 1
    from pg_catalog.unnest(v_acceptance_types) value
    where value like 'fee_terms|%'
  ) then
    raise exception 'required legal acceptance missing';
  end if;

  if v_failure_stage = 'after_underlying_objects' then
    raise exception 'proof_failure_after_underlying_objects';
  end if;

  insert into public.app_party_declaration_sources (
    customer_id,
    dossier_id,
    account_type,
    declaration_kind,
    declared_at,
    valid_from,
    created_at,
    person_first_name,
    person_last_name,
    person_full_name,
    organization_classification,
    organization_legal_name,
    trade_register_number,
    source_type,
    source_request_id,
    source_payload_sha256,
    declarative_actor_ref,
    environment
  )
  values (
    v_customer_id,
    v_dossier_id,
    v_account_type,
    v_declaration_kind,
    v_now,
    v_now,
    v_now,
    v_person_first_name,
    v_person_last_name,
    v_person_full_name,
    v_organization_classification,
    v_organization_legal_name,
    v_trade_register_number,
    'signup_applicant_declaration',
    v_request_id,
    v_payload_hash,
    'anonymous_signup_applicant',
    v_environment
  )
  returning id into v_source_id;

  if v_failure_stage = 'after_declaration_source' then
    raise exception 'proof_failure_after_declaration_source';
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
    event_data,
    created_at
  )
  values
  (
    v_customer_event_type,
    'customer',
    v_customer_id,
    v_customer_id,
    null,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'account_type', v_account_type,
      'matched_by',
        case
          when v_customer_event_type = 'customer_matched'
          then 'email_normalized'
          else null
        end,
      'environment', v_environment
    )),
    v_now
  ),
  (
    'dossier_created',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'account_type', v_account_type,
      'status', 'submitted',
      'retention_class', 'standard',
      'environment', v_environment
    ),
    v_now
  ),
  (
    'locations_created',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'count', v_location_count,
      'client_location_ids', pg_catalog.to_jsonb(v_client_location_ids),
      'environment', v_environment
    ),
    v_now
  ),
  (
    'chargers_created',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'count', v_charger_count,
      'client_charger_ids', pg_catalog.to_jsonb(v_client_charger_ids),
      'environment', v_environment
    ),
    v_now
  ),
  (
    'document_slots_created',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'count', v_document_slot_count,
      'document_types', pg_catalog.to_jsonb(v_document_types),
      'environment', v_environment
    ),
    v_now
  ),
  (
    'legal_acceptances_created',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'count', v_legal_acceptance_count,
      'acceptance_types',
        pg_catalog.to_jsonb(
          array(
            select pg_catalog.split_part(value, '|', 1)
            from pg_catalog.unnest(v_acceptance_types) value
            order by value
          )
        ),
      'environment', v_environment
    ),
    v_now
  ),
  (
    'signup_party_declaration_recorded',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'request_id', v_request_id,
      'customer_reference', v_customer_id,
      'dossier_reference', v_dossier_id,
      'declaration_kind', v_declaration_kind,
      'account_type', v_account_type,
      'source_reference', v_source_id,
      'outcome', 'created',
      'payload_hash', v_payload_hash,
      'environment', v_environment,
      'recorded_at', v_now
    ),
    v_now
  );

  insert into public.app_intake_audit_events (
    event_type,
    request_id,
    idempotency_key,
    actor_type,
    actor_ref,
    ip_hash,
    user_agent_hash,
    event_data,
    created_at
  )
  values (
    'signup_submit_write_accepted',
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'account_type', v_account_type,
      'customer_id', v_customer_id,
      'dossier_id', v_dossier_id,
      'declaration_source_id', v_source_id,
      'scope', v_scope,
      'mode', 'write_v3',
      'location_count', v_location_count,
      'charger_count', v_charger_count,
      'document_slot_count', v_document_slot_count,
      'legal_acceptance_count', v_legal_acceptance_count,
      'payload_hash', v_payload_hash,
      'environment', v_environment
    ),
    v_now
  );

  v_response_body := pg_catalog.jsonb_build_object(
    'ok', true,
    'mode', 'write_v3',
    'request_id', v_request_id,
    'customer_id', v_customer_id,
    'dossier_id', v_dossier_id,
    'location_count', v_location_count,
    'charger_count', v_charger_count,
    'document_slot_count', v_document_slot_count,
    'legal_acceptance_count', v_legal_acceptance_count,
    'payload_hash', v_payload_hash,
    'message',
      'Foundation submit geaccepteerd; dossier shell, locaties, laadpalen, document-slots en juridische acceptaties zijn aangemaakt. Uploadverwerking is nog niet geimplementeerd.'
  );

  if v_failure_stage = 'before_idempotency_completion' then
    raise exception 'proof_failure_before_idempotency_completion';
  end if;

  update public.app_idempotency_keys
  set response_status = 200,
      response_body = v_response_body,
      completed_at = v_now
  where scope = v_scope
    and key = v_key
    and payload_hash = v_payload_hash
    and response_status is null
    and response_body is null;

  if not found then
    raise exception 'signup idempotency completion failed';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 200,
    'replayed', false,
    'body', v_response_body
  );
end;
$_$;


--
-- Name: FUNCTION app_submit_signup_v4(p_request jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_submit_signup_v4(p_request jsonb) IS 'Service-role-only atomic current direct signup. All business, declaration, audit and idempotency writes succeed or roll back together; public response mode remains write_v3.';


--
-- Name: app_submit_signup_v5(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_submit_signup_v5(p_request jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_v4_result jsonb;
  v_response_body jsonb;
  v_customer_id uuid;
  v_dossier_id uuid;
  v_request_id text;
  v_idempotency_key text;
  v_payload_hash text;
  v_environment text;
  v_actor_ref text;
  v_ip_hash text;
  v_user_agent_hash text;
  v_failure_stage text :=
    pg_catalog.current_setting('enval.proof_failure_stage', true);
  v_location jsonb;
  v_connection_declaration jsonb;
  v_client_location_id text;
  v_ean text;
  v_capture_method text;
  v_customer_confirmed boolean;
  v_dossier_location_id uuid;
  v_source_id uuid;
  v_existing public.app_connection_declaration_sources%rowtype;
  v_outcome text;
  v_now timestamptz;
  v_source_count integer := 0;
  v_expected_source_count integer := 0;
begin
  if p_request is null
     or pg_catalog.jsonb_typeof(p_request) <> 'object'
     or pg_catalog.jsonb_typeof(p_request -> 'locations') <> 'array'
     or pg_catalog.jsonb_array_length(p_request -> 'locations') < 1
  then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_signup_contract',
      'message', 'Controleer de aansluitgegevens van iedere locatie.'
    );
  end if;

  v_request_id := pg_catalog.btrim(p_request ->> 'request_id');
  v_idempotency_key :=
    pg_catalog.btrim(p_request ->> 'idempotency_key');
  v_payload_hash := pg_catalog.lower(
    pg_catalog.btrim(p_request ->> 'payload_hash')
  );
  v_environment := pg_catalog.btrim(p_request ->> 'environment');
  v_actor_ref := pg_catalog.btrim(p_request ->> 'actor_ref');
  v_ip_hash := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_request ->> 'ip_hash')),
    ''
  );
  v_user_agent_hash := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_request ->> 'user_agent_hash')),
    ''
  );

  for v_location in
    select value
    from pg_catalog.jsonb_array_elements(p_request -> 'locations')
  loop
    if pg_catalog.jsonb_typeof(v_location) <> 'object' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 400,
        'code', 'invalid_signup_contract',
        'message', 'Controleer de aansluitgegevens van iedere locatie.'
      );
    end if;

    v_client_location_id :=
      pg_catalog.btrim(v_location ->> 'client_location_id');
    v_connection_declaration := v_location -> 'connection_declaration';

    if v_client_location_id is null or v_client_location_id = '' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 400,
        'code', 'invalid_signup_contract',
        'message', 'Controleer de aansluitgegevens van iedere locatie.'
      );
    end if;

    if v_connection_declaration is null
       or v_connection_declaration = 'null'::jsonb
    then
      continue;
    end if;

    if pg_catalog.jsonb_typeof(v_connection_declaration) <> 'object' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 400,
        'code', 'invalid_signup_contract',
        'message', 'Controleer de bevestigde EAN van iedere locatie.'
      );
    end if;

    v_ean :=
      pg_catalog.btrim(v_connection_declaration ->> 'ean_normalized');
    v_capture_method :=
      pg_catalog.btrim(v_connection_declaration ->> 'capture_method');
    begin
      v_customer_confirmed :=
        coalesce(
          (v_connection_declaration ->> 'customer_confirmed')::boolean,
          false
        );
    exception
      when others then
        v_customer_confirmed := false;
    end;

    if v_ean is null
       or v_ean !~ '^[0-9]{18}$'
       or v_capture_method is null
       or v_capture_method not in (
         'energy_document_customer_confirmed',
         'manual_customer_confirmed'
       )
       or v_customer_confirmed is not true
    then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 400,
        'code', 'invalid_signup_contract',
        'message', 'Controleer en bevestig de EAN van iedere locatie.'
      );
    end if;

    v_expected_source_count := v_expected_source_count + 1;
  end loop;

  v_v4_result := public.app_submit_signup_v4(p_request);

  if coalesce((v_v4_result ->> 'ok')::boolean, false)
     is not true
  then
    return v_v4_result;
  end if;

  v_response_body := v_v4_result -> 'body';
  if pg_catalog.jsonb_typeof(v_response_body) <> 'object' then
    raise exception 'app_submit_signup_v5 v4 response body missing';
  end if;

  begin
    v_customer_id := (v_response_body ->> 'customer_id')::uuid;
    v_dossier_id := (v_response_body ->> 'dossier_id')::uuid;
  exception
    when others then
      raise exception 'app_submit_signup_v5 v4 references invalid';
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'app_submit_signup_v5:dossier:' || v_dossier_id::text,
      0
    )
  );

  for v_location in
    select value
    from pg_catalog.jsonb_array_elements(p_request -> 'locations')
  loop
    v_connection_declaration := v_location -> 'connection_declaration';
    if v_connection_declaration is null
       or v_connection_declaration = 'null'::jsonb
    then
      continue;
    end if;

    v_client_location_id :=
      pg_catalog.btrim(v_location ->> 'client_location_id');
    v_ean :=
      pg_catalog.btrim(v_connection_declaration ->> 'ean_normalized');
    v_capture_method :=
      pg_catalog.btrim(v_connection_declaration ->> 'capture_method');

    select l.id
      into v_dossier_location_id
    from public.app_dossier_locations l
    where l.dossier_id = v_dossier_id
      and l.client_location_id = v_client_location_id
    for update;

    if v_dossier_location_id is null then
      raise exception
        'app_submit_signup_v5 dossier location resolution failed';
    end if;

    select s.*
      into v_existing
    from public.app_connection_declaration_sources s
    where s.dossier_location_id = v_dossier_location_id
    for update;

    if found then
      if v_existing.customer_id <> v_customer_id
         or v_existing.dossier_id <> v_dossier_id
         or v_existing.client_location_id <> v_client_location_id
         or v_existing.ean_normalized <> v_ean
         or v_existing.network_operator_declared is not null
         or v_existing.claimed_valid_from is not null
         or v_existing.claimed_valid_to is not null
         or v_existing.address_role <> 'connection_service_location'
         or v_existing.capture_method <> v_capture_method
         or v_existing.source_type <> 'signup_connection_declaration'
         or v_existing.source_payload_sha256 <> v_payload_hash
      then
        raise exception
          'app_submit_signup_v5 existing connection source mismatch';
      end if;

      v_source_id := v_existing.id;
      v_outcome := 'resolved';
    else
      v_now := pg_catalog.clock_timestamp();

      insert into public.app_connection_declaration_sources (
        customer_id,
        dossier_id,
        dossier_location_id,
        client_location_id,
        ean_normalized,
        network_operator_declared,
        claimed_valid_from,
        claimed_valid_to,
        address_role,
        capture_method,
        customer_confirmed_at,
        declared_at,
        valid_from,
        source_type,
        source_request_id,
        source_payload_sha256,
        declarative_actor_ref,
        environment,
        created_at
      )
      values (
        v_customer_id,
        v_dossier_id,
        v_dossier_location_id,
        v_client_location_id,
        v_ean,
        null,
        null,
        null,
        'connection_service_location',
        v_capture_method,
        v_now,
        v_now,
        v_now,
        'signup_connection_declaration',
        v_request_id,
        v_payload_hash,
        'anonymous_signup_applicant',
        v_environment,
        v_now
      )
      returning id into v_source_id;

      v_outcome := 'created';
    end if;

    v_source_count := v_source_count + 1;

    if v_failure_stage = 'after_connection_sources' then
      raise exception 'proof_failure_after_connection_sources';
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
      event_data,
      created_at
    )
    values (
      'signup_connection_declaration_recorded',
      'location',
      v_dossier_location_id,
      v_customer_id,
      v_dossier_id,
      v_request_id,
      v_idempotency_key,
      'edge_function',
      v_actor_ref,
      v_ip_hash,
      v_user_agent_hash,
      pg_catalog.jsonb_build_object(
        'request_id', v_request_id,
        'customer_reference', v_customer_id,
        'dossier_reference', v_dossier_id,
        'location_reference', v_dossier_location_id,
        'connection_source_reference', v_source_id,
        'outcome', v_outcome,
        'capture_method', v_capture_method,
        'customer_confirmed', true,
        'network_operator_present', false,
        'claimed_period_present', false,
        'idempotency_correlation', v_idempotency_key,
        'recorded_at', pg_catalog.clock_timestamp()
      ),
      pg_catalog.clock_timestamp()
    );

    if v_failure_stage = 'during_connection_audit' then
      raise exception 'proof_failure_during_connection_audit';
    end if;
  end loop;

  if v_source_count <> v_expected_source_count then
    raise exception 'app_submit_signup_v5 connection source count mismatch';
  end if;

  return v_v4_result;
end;
$_$;


--
-- Name: FUNCTION app_submit_signup_v5(p_request jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_submit_signup_v5(p_request jsonb) IS 'Service-role-only atomic signup wrapper. Calls app_submit_signup_v4; a missing confirmed EAN is a safe deferred state, while an explicitly customer-confirmed EAN records or resolves exactly one immutable declared source in the same transaction. Parser candidates alone create no source and the public write_v3 response remains unchanged.';


--
-- Name: app_supersede_connection_ownership_v1(uuid, uuid, uuid, date, date, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_supersede_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: FUNCTION app_supersede_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_supersede_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) IS 'Gate 1 local service-role-only RPC. Adds a supersede-history row for ownership corrections without mutating old core truth.';


--
-- Name: app_sync_auth_customer_access_v1(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_sync_auth_customer_access_v1(p_auth_user_id uuid, p_request_id text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_auth_user record;
  v_auth_user_count integer;
  v_candidate record;
  v_access_count integer;
begin
  if p_auth_user_id is null or coalesce(btrim(p_request_id), '') = '' then
    raise exception 'invalid customer access sync input';
  end if;

  select id, lower(email) as email_normalized,
         coalesce(email_confirmed_at, confirmed_at) as verified_at
  into v_auth_user
  from auth.users
  where id = p_auth_user_id
    and deleted_at is null;
  if not found or v_auth_user.verified_at is null then
    raise exception 'verified Auth principal unavailable';
  end if;

  select count(*) into v_auth_user_count
  from auth.users
  where lower(email) = v_auth_user.email_normalized
    and deleted_at is null;
  if v_auth_user_count <> 1 then
    raise exception 'verified Auth principal is ambiguous';
  end if;

  insert into public.app_customer_access_grants (
    auth_user_id, customer_id, granted_case_id, access_basis,
    source_class, source_ref, request_id
  )
  select
    p_auth_user_id, identity_row.customer_id, null,
    'bound_customer_identity', 'app_customer_identity',
    identity_row.id::text, p_request_id
  from public.app_customer_identities identity_row
  join public.app_customers customer_row
    on customer_row.id = identity_row.customer_id
   and customer_row.status = 'active'
  where identity_row.auth_user_id = p_auth_user_id
    and identity_row.status = 'active'
  on conflict (auth_user_id, customer_id) do nothing;

  for v_candidate in
    select distinct intake.id as intake_id
    from public.app_signup_intakes intake
    join public.app_signup_promotions promotion
      on promotion.intake_id = intake.id
    join public.app_signup_signature_evidence evidence
      on evidence.id = promotion.signature_evidence_id
     and evidence.intake_id = intake.id
     and evidence.finalized_at = intake.finalized_at
    join public.app_signup_signing_challenges challenge
      on challenge.id = evidence.challenge_id
     and challenge.intake_id = intake.id
     and challenge.delivery_status = 'delivered'
     and challenge.consumed_at is not null
     and challenge.replaced_at is null
    left join public.app_signup_authenticated_intake_provenance provenance
      on provenance.intake_id = intake.id
    where intake.status = 'promoted'
      and lower(intake.email_normalized) = v_auth_user.email_normalized
      and (provenance.id is null or provenance.auth_user_id = p_auth_user_id)
      and not exists (
        select 1
        from public.app_customer_identities conflicting_identity
        where conflicting_identity.id = promotion.identity_id
          and conflicting_identity.status = 'active'
          and conflicting_identity.auth_user_id is not null
          and conflicting_identity.auth_user_id <> p_auth_user_id
      )
  loop
    perform public.app_signup_authenticated_intake_claim_v1(
      v_candidate.intake_id,
      p_auth_user_id,
      p_request_id
    );
  end loop;

  insert into public.app_customer_access_grants (
    auth_user_id, customer_id, granted_case_id, access_basis,
    source_class, source_ref, request_id
  )
  select distinct
    p_auth_user_id,
    promotion.customer_id,
    promotion.case_id,
    case
      when promotion.account_type = 'particulier'
        then 'signed_service_recipient'
      else 'signed_case_contact'
    end,
    'app_signup_promotion',
    promotion.id::text,
    p_request_id
  from public.app_signup_authenticated_intake_provenance provenance
  join public.app_signup_promotions promotion
    on promotion.intake_id = provenance.intake_id
  join public.app_signup_intakes intake
    on intake.id = provenance.intake_id
   and intake.status = 'promoted'
  join public.app_customers customer_row
    on customer_row.id = promotion.customer_id
   and customer_row.status = 'active'
   and customer_row.customer_type = promotion.account_type
  join public.app_cases app_case
    on app_case.id = promotion.case_id
   and app_case.customer_id = promotion.customer_id
   and app_case.source_class = 'signed_signup_intake'
   and app_case.source_ref = promotion.intake_id::text
  join public.app_signup_mandates mandate
    on mandate.id = promotion.mandate_id
   and mandate.intake_id = promotion.intake_id
  join public.app_case_party_roles access_role
    on access_role.case_id = promotion.case_id
   and access_role.claim_status = 'asserted'
   and access_role.valid_to is null
   and access_role.role_type = case
     when promotion.account_type = 'particulier'
       then 'service_recipient'
     else 'case_contact'
   end
  join public.app_customer_party_relationships access_relationship
    on access_relationship.customer_id = promotion.customer_id
   and access_relationship.party_id = access_role.party_id
   and access_relationship.valid_to is null
   and access_relationship.relationship_role = case
     when promotion.account_type = 'particulier'
       then 'service_recipient'
     else 'contact'
   end
  where provenance.auth_user_id = p_auth_user_id
    and lower(intake.email_normalized) = v_auth_user.email_normalized
    and (
      (promotion.account_type = 'particulier'
       and mandate.authority_review_status = 'not_applicable')
      or
      (promotion.account_type in ('zakelijk', 'vve')
       and mandate.authority_review_status = 'required_not_completed')
    )
    and not exists (
      select 1
      from public.app_customer_identities conflicting_identity
      where conflicting_identity.id = promotion.identity_id
        and conflicting_identity.status = 'active'
        and conflicting_identity.auth_user_id is not null
        and conflicting_identity.auth_user_id <> p_auth_user_id
    )
  on conflict (auth_user_id, customer_id) do nothing;

  select count(*) into v_access_count
  from public.app_customer_access_grants access_grant
  join public.app_customers customer_row
    on customer_row.id = access_grant.customer_id
   and customer_row.status = 'active'
  where access_grant.auth_user_id = p_auth_user_id;

  return v_access_count;
end;
$$;


--
-- Name: FUNCTION app_sync_auth_customer_access_v1(p_auth_user_id uuid, p_request_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_sync_auth_customer_access_v1(p_auth_user_id uuid, p_request_id text) IS 'Idempotently materializes explicit customer-context access from bound identity or verified signed-promotion lineage; never from e-mail alone.';


--
-- Name: app_withdraw_current_document_v1(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_withdraw_current_document_v1(p_dossier_id uuid, p_document_slot_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
declare
  v_identity record;
  v_dossier record;
  v_slot record;
  v_version record;
  v_idem record;
  v_now timestamptz := now();
  v_status integer := 200;
  v_response jsonb;
  v_event_type text := 'document_current_withdrawn';
  v_reason text := null;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload hash';
  end if;

  if p_actor_ref <> ('app_customer_identity:' || p_identity_id::text) then
    raise exception 'actor reference mismatch';
  end if;

  select *
    into v_idem
  from public.app_idempotency_keys
  where scope = p_idempotency_scope
    and key = p_idempotency_key
  for update;

  if not found then
    raise exception 'idempotency row missing';
  end if;

  if v_idem.payload_hash <> p_payload_hash then
    raise exception 'idempotency payload conflict';
  end if;

  if v_idem.response_status is not null or v_idem.response_body is not null then
    raise exception 'idempotency already completed';
  end if;

  select id, customer_id, status
    into v_identity
  from public.app_customer_identities
  where id = p_identity_id
    and customer_id = p_customer_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'identity not found or inactive';
  end if;

  select id, customer_id, status, locked_at
    into v_dossier
  from public.app_customer_dossiers
  where id = p_dossier_id
    and customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'dossier not found or forbidden';
  end if;

  select *
    into v_slot
  from public.app_dossier_document_slots
  where id = p_document_slot_id
    and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'document slot not found';
  end if;

  if v_dossier.locked_at is not null
     or v_dossier.status not in ('draft', 'submitted', 'needs_customer_action') then
    v_status := 409;
    v_reason := 'document_changes_locked';
    v_event_type := 'document_current_withdraw_rejected';
    v_response := jsonb_build_object(
      'ok', false,
      'mode', 'document_withdraw_current_v1',
      'request_id', p_request_id,
      'code', v_reason,
      'error', 'Document kan niet meer worden aangepast.',
      'slot_status', v_slot.status,
      'has_current_document', v_slot.current_version_id is not null,
      'replayed', false
    );
  elsif v_slot.current_version_id is null or v_slot.current_version_number is null then
    v_status := 409;
    v_reason := 'document_current_missing';
    v_event_type := 'document_current_withdraw_rejected';
    v_response := jsonb_build_object(
      'ok', false,
      'mode', 'document_withdraw_current_v1',
      'request_id', p_request_id,
      'code', v_reason,
      'error', 'Er is geen huidig document om te verwijderen.',
      'slot_status', v_slot.status,
      'has_current_document', false,
      'replayed', false
    );
  else
    select *
      into v_version
    from public.app_dossier_document_versions
    where id = v_slot.current_version_id
      and document_slot_id = p_document_slot_id
      and dossier_id = p_dossier_id
    for update;

    if not found or v_version.status <> 'current' then
      raise exception 'current version pointer invalid';
    end if;

    update public.app_dossier_document_versions
    set status = 'withdrawn'
    where id = v_slot.current_version_id
      and document_slot_id = p_document_slot_id
      and dossier_id = p_dossier_id
      and status = 'current';

    if not found then
      raise exception 'current version withdraw transition failed';
    end if;

    update public.app_dossier_document_slots
    set
      status = 'expected',
      current_version_id = null,
      current_version_number = null,
      file_object_path = null,
      file_name = null,
      file_mime_type = null,
      file_size_bytes = null,
      file_sha256 = null,
      uploaded_at = null,
      verified_at = null,
      rejected_at = null,
      rejection_reason = null
    where id = p_document_slot_id
      and dossier_id = p_dossier_id;

    if not found then
      raise exception 'document slot withdraw transition failed';
    end if;

    v_response := jsonb_build_object(
      'ok', true,
      'mode', 'document_withdraw_current_v1',
      'request_id', p_request_id,
      'slot_status', 'expected',
      'has_current_document', false,
      'payload_hash', p_payload_hash,
      'replayed', false
    );
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
    v_event_type,
    'document',
    p_document_slot_id,
    p_customer_id,
    p_dossier_id,
    p_request_id,
    p_idempotency_key,
    'customer',
    p_actor_ref,
    p_ip_hash,
    p_user_agent_hash,
    jsonb_strip_nulls(jsonb_build_object(
      'environment', p_environment,
      'request_id', p_request_id,
      'idempotency_key', p_idempotency_key,
      'actor_ref', p_actor_ref,
      'customer_id', p_customer_id,
      'identity_id', p_identity_id,
      'dossier_id', p_dossier_id,
      'document_slot_id', p_document_slot_id,
      'status', v_status,
      'reason', v_reason,
      'slot_status_after', case when v_status = 200 then 'expected' else v_slot.status end,
      'has_current_document_after', case when v_status = 200 then false else v_slot.current_version_id is not null end
    ))
  );

  update public.app_idempotency_keys
  set
    response_status = v_status,
    response_body = v_response,
    completed_at = v_now
  where scope = p_idempotency_scope
    and key = p_idempotency_key;

  if not found then
    raise exception 'idempotency finalize failed';
  end if;

  return v_response;
end;
$_$;


--
-- Name: FUNCTION app_withdraw_current_document_v1(p_dossier_id uuid, p_document_slot_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_withdraw_current_document_v1(p_dossier_id uuid, p_document_slot_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) IS 'Atomic service-role-only withdrawal of the current ENVAL /app document pointer. Preserves file/version rows, clears slot current pointer, writes audit, and finalizes idempotency.';


--
-- Name: app_workforce_capability_assignments_insert_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_workforce_capability_assignments_insert_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  predecessor public.app_workforce_capability_assignments%rowtype;
  identity_state text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_capability:v1:' ||
      new.workforce_identity_id::text || ':' || new.capability_code,
      0
    )
  );

  if new.supersedes_assignment_event_id is null then
    if new.event_type <> 'granted' then
      raise exception 'capability assignment root must be granted'
        using errcode = '23514';
    end if;

    select state_event.state
    into identity_state
    from public.app_workforce_identity_states state_event
    where state_event.workforce_identity_id = new.workforce_identity_id
      and state_event.effective_at <= new.effective_at
    order by state_event.effective_at desc, state_event.recorded_at desc
    limit 1;

    if identity_state is distinct from 'active' then
      raise exception 'capability grant requires active workforce identity'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.app_workforce_capability_assignments grant_event
      where grant_event.workforce_identity_id = new.workforce_identity_id
        and grant_event.capability_code = new.capability_code
        and grant_event.event_type = 'granted'
        and grant_event.effective_at
          < coalesce(new.valid_until, 'infinity'::timestamptz)
        and new.effective_at < least(
          coalesce(grant_event.valid_until, 'infinity'::timestamptz),
          coalesce(
            (
              select revoke_event.effective_at
              from public.app_workforce_capability_assignments revoke_event
              where revoke_event.assignment_id = grant_event.assignment_id
                and revoke_event.event_type = 'revoked'
              order by revoke_event.effective_at
              limit 1
            ),
            'infinity'::timestamptz
          )
        )
    ) then
      raise exception 'overlapping workforce capability grants are not allowed'
        using errcode = '23514';
    end if;
  else
    select *
    into predecessor
    from public.app_workforce_capability_assignments
    where id = new.supersedes_assignment_event_id
    for update;

    if not found
       or predecessor.event_type <> 'granted'
       or new.event_type <> 'revoked'
       or new.assignment_id <> predecessor.assignment_id
       or new.workforce_identity_id <> predecessor.workforce_identity_id
       or new.capability_code <> predecessor.capability_code
       or new.effective_at <= predecessor.effective_at
       or new.recorded_at <= predecessor.recorded_at
       or (
         predecessor.valid_until is not null
         and new.effective_at > predecessor.valid_until
       )
       or exists (
         select 1
         from public.app_workforce_capability_assignments successor
         where successor.supersedes_assignment_event_id = predecessor.id
       ) then
      raise exception 'invalid workforce capability revocation'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: app_workforce_identity_requires_initial_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_workforce_identity_requires_initial_state() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if (
    select count(*)
    from public.app_workforce_identity_states state_event
    where state_event.workforce_identity_id = new.id
      and state_event.supersedes_state_id is null
      and state_event.state = 'active'
  ) <> 1 then
    raise exception
      'workforce identity requires exactly one atomic initial active state'
      using errcode = '23514';
  end if;

  return null;
end;
$$;


--
-- Name: app_workforce_identity_states_insert_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_workforce_identity_states_insert_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  predecessor public.app_workforce_identity_states%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_state:v1:' || new.workforce_identity_id::text,
      0
    )
  );

  if new.supersedes_state_id is null then
    if new.state <> 'active'
       or exists (
         select 1
         from public.app_workforce_identity_states existing
         where existing.workforce_identity_id = new.workforce_identity_id
       ) then
      raise exception 'workforce state root must be the sole initial active state'
        using errcode = '23514';
    end if;
  else
    select *
    into predecessor
    from public.app_workforce_identity_states
    where id = new.supersedes_state_id
    for update;

    if not found
       or predecessor.workforce_identity_id <> new.workforce_identity_id
       or exists (
         select 1
         from public.app_workforce_identity_states successor
         where successor.supersedes_state_id = predecessor.id
       )
       or new.effective_at <= predecessor.effective_at
       or new.recorded_at <= predecessor.recorded_at
       or predecessor.state = 'revoked'
       or (
         predecessor.state = 'active'
         and new.state not in ('suspended', 'revoked')
       )
       or (
         predecessor.state = 'suspended'
         and new.state not in ('active', 'revoked')
       ) then
      raise exception 'invalid workforce identity state transition'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: app_workforce_operation_requests_insert_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_workforce_operation_requests_insert_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'location_operation_intent:v1:' ||
      new.maker_workforce_identity_id::text || ':' ||
      new.operation_type || ':' || new.idempotency_key,
      0
    )
  );

  if not public.app_workforce_scope_is_authorized_v1(
    new.maker_workforce_identity_id,
    new.maker_scope_assignment_id,
    new.maker_capability_code,
    new.case_id,
    new.location_id,
    new.created_at
  ) then
    raise exception 'maker is not authorized for location operation request'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


--
-- Name: app_workforce_operation_requests_update_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_workforce_operation_requests_update_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  review public.app_workforce_operation_reviews%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'workforce operation requests cannot be deleted'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'location_operation:v1:' || old.id::text,
      0
    )
  );

  if old.execution_status <> 'pending'
     or new.execution_status <> 'executed'
     or new.id <> old.id
     or new.operation_type <> old.operation_type
     or new.case_id <> old.case_id
     or new.location_id <> old.location_id
     or new.observation_id <> old.observation_id
     or new.predecessor_version_id is distinct from old.predecessor_version_id
     or new.maker_workforce_identity_id <>
          old.maker_workforce_identity_id
     or new.maker_scope_assignment_id <> old.maker_scope_assignment_id
     or new.maker_capability_code <> old.maker_capability_code
     or new.payload_hash <> old.payload_hash
     or new.payload_contract_version <> old.payload_contract_version
     or new.request_id <> old.request_id
     or new.idempotency_key <> old.idempotency_key
     or new.created_at <> old.created_at
     or new.executed_at < old.created_at then
    raise exception 'only the exact pending to executed transition is allowed'
      using errcode = '23514';
  end if;

  select *
  into review
  from public.app_workforce_operation_reviews
  where operation_request_id = old.id;

  if not found
     or review.outcome <> 'approved'
     or review.reviewed_payload_hash <> old.payload_hash
     or review.checker_workforce_identity_id =
          old.maker_workforce_identity_id
     or not public.app_workforce_scope_is_authorized_v1(
       old.maker_workforce_identity_id,
       old.maker_scope_assignment_id,
       old.maker_capability_code,
       old.case_id,
       old.location_id,
       new.executed_at
     )
     or not public.app_workforce_scope_is_authorized_v1(
       review.checker_workforce_identity_id,
       review.checker_scope_assignment_id,
       review.checker_capability_code,
       old.case_id,
       old.location_id,
       new.executed_at
     )
     or exists (
       select 1
       from public.app_workforce_identity_states blocker
       where blocker.workforce_identity_id =
             old.maker_workforce_identity_id
         and blocker.effective_at > old.created_at
         and blocker.effective_at <= new.executed_at
         and blocker.state <> 'active'
     )
     or exists (
       select 1
       from public.app_workforce_identity_states blocker
       where blocker.workforce_identity_id =
             review.checker_workforce_identity_id
         and blocker.effective_at > review.reviewed_at
         and blocker.effective_at <= new.executed_at
         and blocker.state <> 'active'
     ) then
    raise exception 'approved request is not execution eligible'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


--
-- Name: app_workforce_operation_reviews_insert_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_workforce_operation_reviews_insert_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  operation_request public.app_workforce_operation_requests%rowtype;
  expected_capability text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'location_review:v1:' || new.operation_request_id::text,
      0
    )
  );

  select *
  into operation_request
  from public.app_workforce_operation_requests
  where id = new.operation_request_id
  for update;

  expected_capability := case operation_request.operation_type
    when 'initial_location_acceptance'
      then 'location.version.accept.approve'
    when 'location_correction'
      then 'location.version.correct.approve'
    else null
  end;

  if not found
     or operation_request.execution_status <> 'pending'
     or new.reviewed_at < operation_request.created_at
     or new.reviewed_payload_hash <> operation_request.payload_hash
     or new.checker_workforce_identity_id =
          operation_request.maker_workforce_identity_id
     or new.checker_capability_code is distinct from expected_capability
     or not public.app_workforce_scope_is_authorized_v1(
       new.checker_workforce_identity_id,
       new.checker_scope_assignment_id,
       new.checker_capability_code,
       operation_request.case_id,
       operation_request.location_id,
       new.reviewed_at
     ) then
    raise exception 'invalid or unauthorized location operation review'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


--
-- Name: app_workforce_scope_assignments_insert_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_workforce_scope_assignments_insert_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  predecessor public.app_workforce_scope_assignments%rowtype;
  capability_grant public.app_workforce_capability_assignments%rowtype;
  relation_link public.app_case_location_relations%rowtype;
  identity_state text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_scope:v1:' ||
      new.workforce_identity_id::text || ':' || new.capability_code || ':' ||
      new.case_id::text || ':' || coalesce(new.location_id::text, 'case'),
      0
    )
  );

  if new.supersedes_scope_event_id is null then
    if new.event_type <> 'granted' then
      raise exception 'workforce scope root must be granted'
        using errcode = '23514';
    end if;

    select state_event.state
    into identity_state
    from public.app_workforce_identity_states state_event
    where state_event.workforce_identity_id = new.workforce_identity_id
      and state_event.effective_at <= new.effective_at
    order by state_event.effective_at desc, state_event.recorded_at desc
    limit 1;

    select *
    into capability_grant
    from public.app_workforce_capability_assignments
    where id = new.capability_assignment_id;

    if identity_state is distinct from 'active'
       or not found
       or capability_grant.supersedes_assignment_event_id is not null
       or capability_grant.event_type <> 'granted'
       or capability_grant.effective_at > new.effective_at
       or (
         capability_grant.valid_until is not null
         and (
           new.effective_at >= capability_grant.valid_until
           or new.valid_until is null
           or new.valid_until > capability_grant.valid_until
         )
       )
       or exists (
         select 1
         from public.app_workforce_capability_assignments capability_revoke
         where capability_revoke.assignment_id =
               capability_grant.assignment_id
           and capability_revoke.event_type = 'revoked'
           and capability_revoke.effective_at <= new.effective_at
       ) then
      raise exception 'scope grant requires active identity and capability'
        using errcode = '23514';
    end if;

    if new.capability_code <> 'location.root.create' then
      select *
      into relation_link
      from public.app_case_location_relations
      where id = new.case_location_relation_id;

      if not found
         or relation_link.supersedes_relation_event_id is not null
         or relation_link.event_type <> 'linked'
         or relation_link.effective_at > new.effective_at
         or (
           relation_link.valid_until is not null
           and (
             new.effective_at >= relation_link.valid_until
             or new.valid_until is null
             or new.valid_until > relation_link.valid_until
           )
         )
         or exists (
           select 1
           from public.app_case_location_relations relation_unlink
           where relation_unlink.relation_id = relation_link.relation_id
             and relation_unlink.event_type = 'unlinked'
             and relation_unlink.effective_at <= new.effective_at
         ) then
        raise exception 'location scope requires an active case location relation'
          using errcode = '23514';
      end if;
    end if;

    if exists (
      select 1
      from public.app_workforce_scope_assignments scope_grant
      where scope_grant.workforce_identity_id = new.workforce_identity_id
        and scope_grant.capability_code = new.capability_code
        and scope_grant.case_id = new.case_id
        and scope_grant.location_id is not distinct from new.location_id
        and scope_grant.event_type = 'granted'
        and scope_grant.effective_at
          < coalesce(new.valid_until, 'infinity'::timestamptz)
        and new.effective_at < least(
          coalesce(scope_grant.valid_until, 'infinity'::timestamptz),
          coalesce(
            (
              select scope_revoke.effective_at
              from public.app_workforce_scope_assignments scope_revoke
              where scope_revoke.scope_assignment_id =
                    scope_grant.scope_assignment_id
                and scope_revoke.event_type = 'revoked'
              order by scope_revoke.effective_at
              limit 1
            ),
            'infinity'::timestamptz
          )
        )
    ) then
      raise exception 'overlapping workforce scope grants are not allowed'
        using errcode = '23514';
    end if;
  else
    select *
    into predecessor
    from public.app_workforce_scope_assignments
    where id = new.supersedes_scope_event_id
    for update;

    if not found
       or predecessor.event_type <> 'granted'
       or new.event_type <> 'revoked'
       or new.scope_assignment_id <> predecessor.scope_assignment_id
       or new.workforce_identity_id <> predecessor.workforce_identity_id
       or new.capability_assignment_id <> predecessor.capability_assignment_id
       or new.capability_code <> predecessor.capability_code
       or new.case_id <> predecessor.case_id
       or new.location_id is distinct from predecessor.location_id
       or new.case_location_relation_id is distinct from
            predecessor.case_location_relation_id
       or new.effective_at <= predecessor.effective_at
       or new.recorded_at <= predecessor.recorded_at
       or (
         predecessor.valid_until is not null
         and new.effective_at > predecessor.valid_until
       )
       or exists (
         select 1
         from public.app_workforce_scope_assignments successor
         where successor.supersedes_scope_event_id = predecessor.id
       ) then
      raise exception 'invalid workforce scope revocation'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: app_workforce_scope_is_authorized_v1(uuid, uuid, text, uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_workforce_scope_is_authorized_v1(p_workforce_identity_id uuid, p_scope_assignment_id uuid, p_capability_code text, p_case_id uuid, p_location_id uuid, p_at timestamp with time zone) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select
    coalesce(
      (
        select state_event.state = 'active'
        from public.app_workforce_identity_states state_event
        where state_event.workforce_identity_id = p_workforce_identity_id
          and state_event.effective_at <= p_at
        order by state_event.effective_at desc, state_event.recorded_at desc
        limit 1
      ),
      false
    )
    and exists (
      select 1
      from public.app_workforce_scope_assignments scope_grant
      join public.app_workforce_capability_assignments capability_grant
        on capability_grant.id = scope_grant.capability_assignment_id
       and capability_grant.workforce_identity_id =
             scope_grant.workforce_identity_id
       and capability_grant.capability_code = scope_grant.capability_code
      where scope_grant.id = p_scope_assignment_id
        and scope_grant.supersedes_scope_event_id is null
        and scope_grant.event_type = 'granted'
        and scope_grant.workforce_identity_id = p_workforce_identity_id
        and scope_grant.capability_code = p_capability_code
        and scope_grant.case_id = p_case_id
        and scope_grant.location_id is not distinct from p_location_id
        and scope_grant.effective_at <= p_at
        and (
          scope_grant.valid_until is null
          or p_at < scope_grant.valid_until
        )
        and capability_grant.supersedes_assignment_event_id is null
        and capability_grant.event_type = 'granted'
        and capability_grant.effective_at <= p_at
        and (
          capability_grant.valid_until is null
          or p_at < capability_grant.valid_until
        )
        and not exists (
          select 1
          from public.app_workforce_scope_assignments scope_revoke
          where scope_revoke.scope_assignment_id =
                scope_grant.scope_assignment_id
            and scope_revoke.event_type = 'revoked'
            and scope_revoke.effective_at <= p_at
        )
        and not exists (
          select 1
          from public.app_workforce_capability_assignments capability_revoke
          where capability_revoke.assignment_id =
                capability_grant.assignment_id
            and capability_revoke.event_type = 'revoked'
            and capability_revoke.effective_at <= p_at
        )
        and (
          p_capability_code = 'location.root.create'
          or exists (
            select 1
            from public.app_case_location_relations relation_link
            where relation_link.id = scope_grant.case_location_relation_id
              and relation_link.supersedes_relation_event_id is null
              and relation_link.event_type = 'linked'
              and relation_link.case_id = p_case_id
              and relation_link.location_id = p_location_id
              and relation_link.effective_at <= p_at
              and (
                relation_link.valid_until is null
                or p_at < relation_link.valid_until
              )
              and not exists (
                select 1
                from public.app_case_location_relations relation_unlink
                where relation_unlink.relation_id =
                      relation_link.relation_id
                  and relation_unlink.event_type = 'unlinked'
                  and relation_unlink.effective_at <= p_at
              )
          )
        )
    );
$$;


--
-- Name: app_wp2b_i_immutable_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_wp2b_i_immutable_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  raise exception '% rows are immutable and cannot be updated or deleted',
    tg_table_name;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    scope_type text NOT NULL,
    scope_id uuid,
    customer_id uuid,
    dossier_id uuid,
    request_id text,
    idempotency_key text,
    actor_type text NOT NULL,
    actor_ref text,
    ip_hash text,
    user_agent_hash text,
    event_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_audit_events_actor_type_chk CHECK ((actor_type = ANY (ARRAY['customer'::text, 'system'::text, 'support'::text, 'admin'::text, 'edge_function'::text, 'worker'::text, 'provider'::text, 'unknown'::text]))),
    CONSTRAINT app_audit_events_scope_type_chk CHECK ((scope_type = ANY (ARRAY['intake'::text, 'auth'::text, 'customer'::text, 'dossier'::text, 'case'::text, 'promotion'::text, 'location'::text, 'charger'::text, 'document'::text, 'evidence'::text, 'request'::text, 'support'::text, 'consent'::text, 'kwh'::text, 'result'::text, 'fee'::text, 'retention'::text])))
);


--
-- Name: TABLE app_audit_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_audit_events IS 'Internal raw audit truth for /app customer, dossier, evidence, consent, result, fee, and retention actions. Not customer-visible directly.';


--
-- Name: COLUMN app_audit_events.event_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_audit_events.event_data IS 'Structured internal audit metadata. Keep PII minimized and do not expose directly to customers.';


--
-- Name: app_case_lifecycle_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_case_lifecycle_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    promotion_id uuid,
    lifecycle_state text NOT NULL,
    event_at timestamp with time zone NOT NULL,
    actor_type text NOT NULL,
    actor_ref text NOT NULL,
    source_class text NOT NULL,
    source_ref text NOT NULL,
    request_id text NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT app_case_lifecycle_events_actor_type_chk CHECK ((actor_type = ANY (ARRAY['system'::text, 'support'::text, 'admin'::text, 'worker'::text]))),
    CONSTRAINT app_case_lifecycle_events_provenance_chk CHECK (((btrim(actor_ref) <> ''::text) AND (btrim(source_class) <> ''::text) AND (btrim(source_ref) <> ''::text) AND (btrim(request_id) <> ''::text) AND (jsonb_typeof(event_data) = 'object'::text))),
    CONSTRAINT app_case_lifecycle_events_state_chk CHECK ((lifecycle_state = ANY (ARRAY['submitted_for_review'::text, 'action_needed'::text, 'ready_for_next_phase'::text, 'rejected'::text])))
);


--
-- Name: TABLE app_case_lifecycle_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_case_lifecycle_events IS 'Append-only ENVAL internal case lifecycle. submitted_for_review has no external-verifier or NEa approval meaning.';


--
-- Name: app_case_location_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_case_location_relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    relation_id uuid NOT NULL,
    case_id uuid NOT NULL,
    location_id uuid NOT NULL,
    event_type text NOT NULL,
    effective_at timestamp with time zone NOT NULL,
    valid_until timestamp with time zone,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    decision_ref text NOT NULL,
    reason_ref text,
    recorded_by_actor_ref text NOT NULL,
    request_id text NOT NULL,
    supersedes_relation_event_id uuid,
    CONSTRAINT app_case_location_relations_event_chk CHECK ((event_type = ANY (ARRAY['linked'::text, 'unlinked'::text]))),
    CONSTRAINT app_case_location_relations_not_self_chk CHECK (((supersedes_relation_event_id IS NULL) OR (supersedes_relation_event_id <> id))),
    CONSTRAINT app_case_location_relations_period_chk CHECK ((((event_type = 'linked'::text) AND ((valid_until IS NULL) OR (valid_until > effective_at))) OR ((event_type = 'unlinked'::text) AND (valid_until IS NULL)))),
    CONSTRAINT app_case_location_relations_reason_chk CHECK ((((event_type = 'linked'::text) AND (reason_ref IS NULL)) OR ((event_type = 'unlinked'::text) AND (reason_ref = btrim(reason_ref)) AND ((char_length(reason_ref) >= 1) AND (char_length(reason_ref) <= 200))))),
    CONSTRAINT app_case_location_relations_refs_chk CHECK (((decision_ref = btrim(decision_ref)) AND ((char_length(decision_ref) >= 1) AND (char_length(decision_ref) <= 200)) AND (recorded_by_actor_ref = btrim(recorded_by_actor_ref)) AND ((char_length(recorded_by_actor_ref) >= 1) AND (char_length(recorded_by_actor_ref) <= 200)) AND (request_id = btrim(request_id)) AND ((char_length(request_id) >= 1) AND (char_length(request_id) <= 128))))
);


--
-- Name: TABLE app_case_location_relations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_case_location_relations IS 'Explicit temporal workflow scope only. It proves no ownership, EAN, aangeslotene, representation, physical match, acceptance or dossier-location truth.';


--
-- Name: app_case_party_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_case_party_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_claim_id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    party_id uuid NOT NULL,
    person_profile_version_id uuid,
    organization_profile_version_id uuid,
    role_type text NOT NULL,
    claim_status text NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    valid_to timestamp with time zone,
    recorded_at timestamp with time zone NOT NULL,
    recorded_by_actor_type text NOT NULL,
    recorded_by_actor_ref text NOT NULL,
    source_class text NOT NULL,
    source_ref text NOT NULL,
    request_id text NOT NULL,
    decision_at timestamp with time zone,
    decided_by_actor_type text,
    decided_by_actor_ref text,
    decision_reason text,
    supersedes_id uuid,
    supersession_reason text,
    CONSTRAINT app_case_party_roles_claim_status_chk CHECK ((claim_status = ANY (ARRAY['asserted'::text, 'case_confirmed'::text, 'disputed'::text, 'rejected'::text]))),
    CONSTRAINT app_case_party_roles_decided_actor_type_chk CHECK (((decided_by_actor_type IS NULL) OR (decided_by_actor_type = ANY (ARRAY['customer'::text, 'system'::text, 'support'::text, 'admin'::text, 'edge_function'::text, 'worker'::text, 'provider'::text, 'unknown'::text])))),
    CONSTRAINT app_case_party_roles_decision_metadata_chk CHECK ((((claim_status = 'asserted'::text) AND (decision_at IS NULL) AND (decided_by_actor_type IS NULL) AND (decided_by_actor_ref IS NULL) AND (decision_reason IS NULL)) OR ((claim_status = ANY (ARRAY['case_confirmed'::text, 'disputed'::text, 'rejected'::text])) AND (decision_at IS NOT NULL) AND (decided_by_actor_type IS NOT NULL) AND (decided_by_actor_ref IS NOT NULL) AND (btrim(decided_by_actor_ref) <> ''::text) AND (decision_reason IS NOT NULL) AND (btrim(decision_reason) <> ''::text)))),
    CONSTRAINT app_case_party_roles_no_self_supersede_chk CHECK (((supersedes_id IS NULL) OR (supersedes_id <> id))),
    CONSTRAINT app_case_party_roles_profile_xor_chk CHECK ((num_nonnulls(person_profile_version_id, organization_profile_version_id) = 1)),
    CONSTRAINT app_case_party_roles_provenance_not_blank_chk CHECK (((btrim(recorded_by_actor_ref) <> ''::text) AND (btrim(source_class) <> ''::text) AND (btrim(source_ref) <> ''::text) AND (btrim(request_id) <> ''::text))),
    CONSTRAINT app_case_party_roles_recorded_actor_type_chk CHECK ((recorded_by_actor_type = ANY (ARRAY['customer'::text, 'system'::text, 'support'::text, 'admin'::text, 'edge_function'::text, 'worker'::text, 'provider'::text, 'unknown'::text]))),
    CONSTRAINT app_case_party_roles_role_type_chk CHECK ((role_type = ANY (ARRAY['service_recipient'::text, 'case_contact'::text]))),
    CONSTRAINT app_case_party_roles_supersession_reason_chk CHECK ((((supersedes_id IS NULL) AND (supersession_reason IS NULL)) OR ((supersedes_id IS NOT NULL) AND (supersession_reason IS NOT NULL) AND (btrim(supersession_reason) <> ''::text)))),
    CONSTRAINT app_case_party_roles_valid_range_chk CHECK (((valid_to IS NULL) OR (valid_to > valid_from)))
);


--
-- Name: TABLE app_case_party_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_case_party_roles IS 'Immutable case-participation claim versions. Only terminal case_confirmed rows are operational roles; case roles are never representation authority or mandates.';


--
-- Name: COLUMN app_case_party_roles.person_profile_version_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_case_party_roles.person_profile_version_id IS 'Historical natural-person profile anchor; later profile versions do not rewrite this role version.';


--
-- Name: COLUMN app_case_party_roles.organization_profile_version_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_case_party_roles.organization_profile_version_id IS 'Historical organization profile anchor; later profile versions do not rewrite this role version.';


--
-- Name: app_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    case_reference text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    created_by_actor_type text NOT NULL,
    created_by_actor_ref text NOT NULL,
    source_class text NOT NULL,
    source_ref text NOT NULL,
    request_id text NOT NULL,
    CONSTRAINT app_cases_case_reference_chk CHECK (((case_reference = btrim(case_reference)) AND ((char_length(case_reference) >= 8) AND (char_length(case_reference) <= 64)))),
    CONSTRAINT app_cases_created_by_actor_type_chk CHECK ((created_by_actor_type = ANY (ARRAY['customer'::text, 'system'::text, 'support'::text, 'admin'::text, 'edge_function'::text, 'worker'::text, 'provider'::text, 'unknown'::text]))),
    CONSTRAINT app_cases_provenance_not_blank_chk CHECK (((btrim(created_by_actor_ref) <> ''::text) AND (btrim(source_class) <> ''::text) AND (btrim(source_ref) <> ''::text) AND (btrim(request_id) <> ''::text)))
);


--
-- Name: TABLE app_cases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_cases IS 'Immutable customer-owned case roots. A case does not prove party identity, representation authority, mandate, EAN, evidence acceptance, eligibility, or settlement truth.';


--
-- Name: app_charger_declarations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_charger_declarations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    charger_id uuid NOT NULL,
    signing_snapshot_id uuid NOT NULL,
    source_payload_sha256 text NOT NULL,
    brand text,
    model text,
    serial_number text,
    mid_identifier text,
    installation_date_text text,
    installation_year integer,
    backend_supplier text,
    solar_export_declaration text,
    declaration_status text DEFAULT 'confirmed_awaiting_review'::text NOT NULL,
    declared_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    created_by_actor_ref text NOT NULL,
    created_from_request_id text NOT NULL,
    CONSTRAINT app_charger_declarations_hash_chk CHECK ((source_payload_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_charger_declarations_provenance_chk CHECK (((btrim(created_by_actor_ref) <> ''::text) AND (btrim(created_from_request_id) <> ''::text))),
    CONSTRAINT app_charger_declarations_status_chk CHECK ((declaration_status = 'confirmed_awaiting_review'::text)),
    CONSTRAINT app_charger_declarations_values_chk CHECK ((((brand IS NULL) OR ((brand = btrim(brand)) AND (brand <> ''::text) AND (char_length(brand) <= 200))) AND ((model IS NULL) OR ((model = btrim(model)) AND (model <> ''::text) AND (char_length(model) <= 200))) AND ((serial_number IS NULL) OR ((serial_number = btrim(serial_number)) AND (serial_number <> ''::text) AND (char_length(serial_number) <= 200))) AND ((mid_identifier IS NULL) OR ((mid_identifier = btrim(mid_identifier)) AND (mid_identifier <> ''::text) AND (char_length(mid_identifier) <= 200))) AND ((installation_date_text IS NULL) OR ((installation_date_text = btrim(installation_date_text)) AND (installation_date_text <> ''::text) AND (char_length(installation_date_text) <= 100))) AND ((backend_supplier IS NULL) OR ((backend_supplier = btrim(backend_supplier)) AND (backend_supplier <> ''::text) AND (char_length(backend_supplier) <= 200))) AND ((solar_export_declaration IS NULL) OR ((solar_export_declaration = btrim(solar_export_declaration)) AND (solar_export_declaration <> ''::text) AND (char_length(solar_export_declaration) <= 100))) AND ((installation_year IS NULL) OR ((installation_year >= 1990) AND (installation_year <= 2050)))))
);


--
-- Name: TABLE app_charger_declarations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_charger_declarations IS 'Immutable signed charger declaration observations awaiting review. MID remains declared input and never accepted truth.';


--
-- Name: app_chargers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_chargers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_id uuid NOT NULL,
    case_id uuid NOT NULL,
    location_id uuid NOT NULL,
    source_ref_sha256 text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    created_by_actor_ref text NOT NULL,
    created_from_request_id text NOT NULL,
    CONSTRAINT app_chargers_provenance_chk CHECK (((btrim(created_by_actor_ref) <> ''::text) AND (btrim(created_from_request_id) <> ''::text))),
    CONSTRAINT app_chargers_source_ref_sha256_chk CHECK ((source_ref_sha256 ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: TABLE app_chargers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_chargers IS 'Immutable case-owned charger roots materialized from signed customer declarations. A row is not charger, MID, conformity or eligibility acceptance.';


--
-- Name: app_connection_declaration_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_connection_declaration_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    dossier_id uuid NOT NULL,
    dossier_location_id uuid NOT NULL,
    client_location_id text NOT NULL,
    ean_normalized text NOT NULL,
    network_operator_declared text,
    claimed_valid_from date,
    claimed_valid_to date,
    address_role text NOT NULL,
    declared_at timestamp with time zone NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    source_type text NOT NULL,
    source_request_id text NOT NULL,
    source_payload_sha256 text NOT NULL,
    declarative_actor_ref text NOT NULL,
    environment text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    capture_method text NOT NULL,
    customer_confirmed_at timestamp with time zone NOT NULL,
    CONSTRAINT app_connection_declaration_sources_address_role_chk CHECK ((address_role = 'connection_service_location'::text)),
    CONSTRAINT app_connection_declaration_sources_capture_method_chk CHECK ((capture_method = ANY (ARRAY['energy_document_customer_confirmed'::text, 'manual_customer_confirmed'::text]))),
    CONSTRAINT app_connection_declaration_sources_claimed_period_chk CHECK ((((claimed_valid_from IS NULL) AND (claimed_valid_to IS NULL)) OR ((claimed_valid_from IS NOT NULL) AND ((claimed_valid_to IS NULL) OR (claimed_valid_to >= claimed_valid_from))))),
    CONSTRAINT app_connection_declaration_sources_confirmation_chk CHECK (((customer_confirmed_at = declared_at) AND (customer_confirmed_at = valid_from) AND (customer_confirmed_at = created_at))),
    CONSTRAINT app_connection_declaration_sources_ean_chk CHECK ((ean_normalized ~ '^[0-9]{18}$'::text)),
    CONSTRAINT app_connection_declaration_sources_network_operator_chk CHECK (((network_operator_declared IS NULL) OR ((network_operator_declared <> ''::text) AND (network_operator_declared = regexp_replace(btrim(network_operator_declared), '[[:space:]]+'::text, ' '::text, 'g'::text))))),
    CONSTRAINT app_connection_declaration_sources_payload_sha256_chk CHECK ((source_payload_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_connection_declaration_sources_provenance_chk CHECK (((btrim(client_location_id) <> ''::text) AND (btrim(source_request_id) <> ''::text) AND (btrim(declarative_actor_ref) <> ''::text) AND (btrim(environment) <> ''::text))),
    CONSTRAINT app_connection_declaration_sources_source_type_chk CHECK ((source_type = 'signup_connection_declaration'::text)),
    CONSTRAINT app_connection_declaration_sources_validity_chk CHECK (((valid_from = declared_at) AND (created_at = declared_at)))
);


--
-- Name: TABLE app_connection_declaration_sources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_connection_declaration_sources IS 'Immutable customer-confirmed declared EAN source per signup dossier location. The optional network-operator and claimed-period columns are not required signup input. This source is not parser-observed truth, an accepted canonical connection or location, CAR result, aangeslotene/ownership decision, mandate, role or eligibility truth.';


--
-- Name: COLUMN app_connection_declaration_sources.ean_normalized; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connection_declaration_sources.ean_normalized IS 'Customer-declared EAN with the CURRENT connection-foundation syntax of exactly 18 numeric digits. No checksum, registry, CAR or acceptance claim.';


--
-- Name: COLUMN app_connection_declaration_sources.network_operator_declared; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connection_declaration_sources.network_operator_declared IS 'Optional normalized customer-declared network-operator text. Signup does not require it and no derivation or verification is claimed.';


--
-- Name: COLUMN app_connection_declaration_sources.claimed_valid_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connection_declaration_sources.claimed_valid_from IS 'Optional exceptional customer claim about a connection-period start. It is not a mandate start and signup does not require it.';


--
-- Name: COLUMN app_connection_declaration_sources.claimed_valid_to; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connection_declaration_sources.claimed_valid_to IS 'Optional exceptional customer claim about a connection-period end. It is not mandate or calendar-year validity and signup does not require it.';


--
-- Name: COLUMN app_connection_declaration_sources.valid_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connection_declaration_sources.valid_from IS 'Source validity begins at the exact server-side declaration timestamp and is separate from the customer-claimed connection period.';


--
-- Name: COLUMN app_connection_declaration_sources.capture_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connection_declaration_sources.capture_method IS 'Bounded acquisition method: energy_document_customer_confirmed or manual_customer_confirmed. No API, registry or verified claim.';


--
-- Name: COLUMN app_connection_declaration_sources.customer_confirmed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connection_declaration_sources.customer_confirmed_at IS 'Server-recorded declared-boundary timestamp after explicit customer confirmation. Parser candidates before confirmation remain observed/derived and create no row.';


--
-- Name: app_connection_ownership_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_connection_ownership_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    dossier_id uuid NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    claim_source_type text NOT NULL,
    source_reference_type text NOT NULL,
    source_reference_id text NOT NULL,
    claim_status text DEFAULT 'declared'::text NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    verified_at timestamp with time zone,
    request_id text NOT NULL,
    actor_type text NOT NULL,
    actor_ref text NOT NULL,
    decision_actor_type text,
    decision_actor_ref text,
    decision_request_id text,
    decision_reason text,
    decided_at timestamp with time zone,
    supersedes_ownership_period_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_connection_ownership_periods_claim_source_type_chk CHECK ((claim_source_type = ANY (ARRAY['customer_declared'::text, 'invoice_observed'::text, 'car_observed'::text, 'network_operator_observed'::text, 'manual_review'::text]))),
    CONSTRAINT app_connection_ownership_periods_claim_status_chk CHECK ((claim_status = ANY (ARRAY['declared'::text, 'under_review'::text, 'verified'::text, 'rejected'::text, 'superseded'::text]))),
    CONSTRAINT app_connection_ownership_periods_decision_metadata_chk CHECK (((claim_status <> ALL (ARRAY['verified'::text, 'rejected'::text, 'superseded'::text])) OR ((decided_at IS NOT NULL) AND (decision_actor_type IS NOT NULL) AND (btrim(decision_actor_type) <> ''::text) AND (decision_actor_ref IS NOT NULL) AND (btrim(decision_actor_ref) <> ''::text) AND (decision_request_id IS NOT NULL) AND (btrim(decision_request_id) <> ''::text)))),
    CONSTRAINT app_connection_ownership_periods_no_self_supersede_chk CHECK (((supersedes_ownership_period_id IS NULL) OR (supersedes_ownership_period_id <> id))),
    CONSTRAINT app_connection_ownership_periods_not_blank_chk CHECK (((btrim(source_reference_type) <> ''::text) AND (btrim(source_reference_id) <> ''::text) AND (btrim(request_id) <> ''::text) AND (btrim(actor_type) <> ''::text) AND (btrim(actor_ref) <> ''::text))),
    CONSTRAINT app_connection_ownership_periods_rejected_reason_chk CHECK (((claim_status <> 'rejected'::text) OR ((decision_reason IS NOT NULL) AND (btrim(decision_reason) <> ''::text)))),
    CONSTRAINT app_connection_ownership_periods_superseded_link_chk CHECK (((claim_status <> 'superseded'::text) OR (supersedes_ownership_period_id IS NOT NULL))),
    CONSTRAINT app_connection_ownership_periods_valid_range_chk CHECK (((valid_to IS NULL) OR (valid_to > valid_from))),
    CONSTRAINT app_connection_ownership_periods_verified_metadata_chk CHECK (((claim_status <> 'verified'::text) OR (verified_at IS NOT NULL)))
);


--
-- Name: TABLE app_connection_ownership_periods; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_connection_ownership_periods IS 'Aangeslotene/ownership claim per connection and period. Rows are claims with declared, observed, reviewed, verified, rejected, or superseded status; CAR or invoice observations do not automatically mutate customer or connection truth.';


--
-- Name: COLUMN app_connection_ownership_periods.claim_source_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connection_ownership_periods.claim_source_type IS 'Source class for the claim. Raw CAR responses or unrestricted provider payloads are intentionally not stored in this table.';


--
-- Name: COLUMN app_connection_ownership_periods.claim_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connection_ownership_periods.claim_status IS 'Claim lifecycle. New claims default to declared and are not automatically verified.';


--
-- Name: app_connection_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_connection_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    location_id uuid NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    network_operator text,
    configuration_type text DEFAULT 'unknown'::text NOT NULL,
    status text DEFAULT 'declared'::text NOT NULL,
    source_type text NOT NULL,
    source_reference_type text NOT NULL,
    source_reference_id text NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    request_id text NOT NULL,
    actor_type text NOT NULL,
    actor_ref text NOT NULL,
    decision_actor_type text,
    decision_actor_ref text,
    decision_request_id text,
    decision_reason text,
    decided_at timestamp with time zone,
    supersedes_period_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_connection_periods_configuration_type_chk CHECK ((configuration_type = ANY (ARRAY['unknown'::text, 'exclusive_transport_connection'::text, 'shared_connection'::text, 'secondary_allocation_point'::text, 'direct_line'::text]))),
    CONSTRAINT app_connection_periods_decision_metadata_chk CHECK (((status <> ALL (ARRAY['verified'::text, 'rejected'::text, 'superseded'::text])) OR ((decided_at IS NOT NULL) AND (decision_actor_type IS NOT NULL) AND (btrim(decision_actor_type) <> ''::text) AND (decision_actor_ref IS NOT NULL) AND (btrim(decision_actor_ref) <> ''::text) AND (decision_request_id IS NOT NULL) AND (btrim(decision_request_id) <> ''::text)))),
    CONSTRAINT app_connection_periods_no_self_supersede_chk CHECK (((supersedes_period_id IS NULL) OR (supersedes_period_id <> id))),
    CONSTRAINT app_connection_periods_not_blank_chk CHECK (((btrim(source_reference_type) <> ''::text) AND (btrim(source_reference_id) <> ''::text) AND (btrim(request_id) <> ''::text) AND (btrim(actor_type) <> ''::text) AND (btrim(actor_ref) <> ''::text))),
    CONSTRAINT app_connection_periods_rejected_reason_chk CHECK (((status <> 'rejected'::text) OR ((decision_reason IS NOT NULL) AND (btrim(decision_reason) <> ''::text)))),
    CONSTRAINT app_connection_periods_source_type_chk CHECK ((source_type = ANY (ARRAY['customer_declared'::text, 'invoice_observed'::text, 'car_observed'::text, 'network_operator_observed'::text, 'manual_review'::text]))),
    CONSTRAINT app_connection_periods_status_chk CHECK ((status = ANY (ARRAY['declared'::text, 'under_review'::text, 'verified'::text, 'rejected'::text, 'superseded'::text]))),
    CONSTRAINT app_connection_periods_superseded_link_chk CHECK (((status <> 'superseded'::text) OR (supersedes_period_id IS NOT NULL))),
    CONSTRAINT app_connection_periods_valid_range_chk CHECK (((valid_to IS NULL) OR (valid_to > valid_from)))
);


--
-- Name: TABLE app_connection_periods; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_connection_periods IS 'Time-bound connection facts for address/location, network operator, and configuration. History is added or superseded; derived observations do not overwrite core truth.';


--
-- Name: COLUMN app_connection_periods.configuration_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connection_periods.configuration_type IS 'Declared or reviewed connection configuration for the period. It enables later eligibility review but does not decide eligibility.';


--
-- Name: app_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    dossier_id uuid NOT NULL,
    location_id uuid NOT NULL,
    ean_normalized text NOT NULL,
    connection_type text NOT NULL,
    declared_network_operator text,
    status text DEFAULT 'declared'::text NOT NULL,
    source_type text NOT NULL,
    source_reference_type text NOT NULL,
    source_reference_id text NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    request_id text NOT NULL,
    actor_type text NOT NULL,
    actor_ref text NOT NULL,
    decision_actor_type text,
    decision_actor_ref text,
    decision_request_id text,
    decision_reason text,
    decided_at timestamp with time zone,
    supersedes_connection_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_connections_connection_type_chk CHECK ((connection_type = ANY (ARRAY['primary'::text, 'secondary_allocation_point'::text, 'direct_line'::text]))),
    CONSTRAINT app_connections_decision_metadata_chk CHECK (((status <> ALL (ARRAY['verified'::text, 'rejected'::text, 'superseded'::text])) OR ((decided_at IS NOT NULL) AND (decision_actor_type IS NOT NULL) AND (btrim(decision_actor_type) <> ''::text) AND (decision_actor_ref IS NOT NULL) AND (btrim(decision_actor_ref) <> ''::text) AND (decision_request_id IS NOT NULL) AND (btrim(decision_request_id) <> ''::text)))),
    CONSTRAINT app_connections_ean_normalized_chk CHECK ((ean_normalized ~ '^[0-9]{18}$'::text)),
    CONSTRAINT app_connections_no_self_supersede_chk CHECK (((supersedes_connection_id IS NULL) OR (supersedes_connection_id <> id))),
    CONSTRAINT app_connections_not_blank_chk CHECK (((btrim(source_reference_type) <> ''::text) AND (btrim(source_reference_id) <> ''::text) AND (btrim(request_id) <> ''::text) AND (btrim(actor_type) <> ''::text) AND (btrim(actor_ref) <> ''::text))),
    CONSTRAINT app_connections_rejected_reason_chk CHECK (((status <> 'rejected'::text) OR ((decision_reason IS NOT NULL) AND (btrim(decision_reason) <> ''::text)))),
    CONSTRAINT app_connections_source_type_chk CHECK ((source_type = ANY (ARRAY['customer_declared'::text, 'invoice_observed'::text, 'car_observed'::text, 'network_operator_observed'::text, 'manual_review'::text]))),
    CONSTRAINT app_connections_status_chk CHECK ((status = ANY (ARRAY['declared'::text, 'under_review'::text, 'verified'::text, 'rejected'::text, 'superseded'::text]))),
    CONSTRAINT app_connections_superseded_link_chk CHECK (((status <> 'superseded'::text) OR (supersedes_connection_id IS NOT NULL)))
);


--
-- Name: TABLE app_connections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_connections IS 'Gate 1 EAN/electricity connection record for ENVAL /app. Stores normalized 18-digit EAN and declared connection type without asserting eligibility, CAR availability, or ownership truth.';


--
-- Name: COLUMN app_connections.ean_normalized; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connections.ean_normalized IS 'Normalized EAN core identifier. Local proven syntax is exactly 18 numeric digits; no checksum, registry, CAR, or ownership assertion is made by this column.';


--
-- Name: COLUMN app_connections.connection_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_connections.connection_type IS 'Declared construct: primary, secondary allocation point, or direct line. Secondary allocation point is not automatically eligible or approved.';


--
-- Name: app_customer_access_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_customer_access_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    granted_case_id uuid,
    access_basis text NOT NULL,
    source_class text NOT NULL,
    source_ref text NOT NULL,
    request_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_customer_access_grants_access_basis_check CHECK ((access_basis = ANY (ARRAY['bound_customer_identity'::text, 'signed_service_recipient'::text, 'signed_case_contact'::text]))),
    CONSTRAINT app_customer_access_grants_check CHECK ((((source_class = 'app_customer_identity'::text) AND (access_basis = 'bound_customer_identity'::text) AND (granted_case_id IS NULL)) OR ((source_class = 'app_signup_promotion'::text) AND (access_basis = ANY (ARRAY['signed_service_recipient'::text, 'signed_case_contact'::text])) AND (granted_case_id IS NOT NULL)))),
    CONSTRAINT app_customer_access_grants_request_id_check CHECK ((btrim(request_id) <> ''::text)),
    CONSTRAINT app_customer_access_grants_source_class_check CHECK ((source_class = ANY (ARRAY['app_customer_identity'::text, 'app_signup_promotion'::text]))),
    CONSTRAINT app_customer_access_grants_source_ref_check CHECK ((btrim(source_ref) <> ''::text))
);


--
-- Name: TABLE app_customer_access_grants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_customer_access_grants IS 'Immutable server-owned Auth-principal access to a distinct customer context; access is not customer identity, party identity, case ownership or representation authority.';


--
-- Name: app_customer_dossiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_customer_dossiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    dossier_number text,
    account_type text NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    submitted_at timestamp with time zone,
    locked_at timestamp with time zone,
    paused_at timestamp with time zone,
    rejected_at timestamp with time zone,
    minimized_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_customer_dossiers_account_type_chk CHECK ((account_type = ANY (ARRAY['particulier'::text, 'zakelijk'::text, 'vve'::text]))),
    CONSTRAINT app_customer_dossiers_retention_class_chk CHECK ((retention_class = ANY (ARRAY['standard'::text, 'draft'::text, 'submitted'::text, 'successful'::text, 'rejected'::text, 'legal_hold'::text, 'minimized'::text]))),
    CONSTRAINT app_customer_dossiers_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'needs_customer_action'::text, 'under_review'::text, 'eligible_ready_for_inboeking'::text, 'inboeking_in_progress'::text, 'year_kwh_required'::text, 'result_pending'::text, 'successful_value_realized'::text, 'fee_due'::text, 'paid_out_or_settled'::text, 'rejected_or_paused'::text, 'expired_minimized'::text])))
);


--
-- Name: TABLE app_customer_dossiers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_customer_dossiers IS 'Customer-owned /app dossier lifecycle for the commercial ENVAL inboekservice. Replaces legacy wizard dossier assumptions for new app flows.';


--
-- Name: COLUMN app_customer_dossiers.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_customer_dossiers.status IS 'Customer-safe lifecycle status. Internal review states may be more granular in future tables.';


--
-- Name: app_customer_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_customer_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    auth_user_id uuid,
    email_normalized text NOT NULL,
    email_verified_at timestamp with time zone,
    phone_normalized text,
    phone_verified_at timestamp with time zone,
    identity_provider text DEFAULT 'supabase'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    CONSTRAINT app_customer_identities_identity_provider_chk CHECK ((identity_provider = ANY (ARRAY['supabase'::text, 'enval_magic_link'::text]))),
    CONSTRAINT app_customer_identities_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'revoked'::text])))
);


--
-- Name: TABLE app_customer_identities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_customer_identities IS 'Maps ENVAL customers to Supabase Auth users or future ENVAL-owned magic-link identities. Internal table; no direct customer access.';


--
-- Name: COLUMN app_customer_identities.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_customer_identities.auth_user_id IS 'Nullable until Supabase Auth bootstrap is implemented. References auth.users when present.';


--
-- Name: COLUMN app_customer_identities.email_normalized; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_customer_identities.email_normalized IS 'Normalized identity email. Indexed but not unique to avoid premature duplicate matching assumptions.';


--
-- Name: app_customer_party_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_customer_party_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    party_id uuid NOT NULL,
    relationship_role text NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    source_type text NOT NULL,
    source_reference_type text NOT NULL,
    source_reference_id text NOT NULL,
    request_id text NOT NULL,
    actor_type text NOT NULL,
    actor_ref text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    supersedes_relationship_id uuid,
    CONSTRAINT app_customer_party_relationships_actor_type_chk CHECK ((actor_type = ANY (ARRAY['customer'::text, 'system'::text, 'support'::text, 'admin'::text, 'edge_function'::text, 'worker'::text, 'provider'::text, 'unknown'::text]))),
    CONSTRAINT app_customer_party_relationships_no_self_supersede_chk CHECK (((supersedes_relationship_id IS NULL) OR (supersedes_relationship_id <> id))),
    CONSTRAINT app_customer_party_relationships_provenance_not_blank_chk CHECK (((btrim(source_type) <> ''::text) AND (btrim(source_reference_type) <> ''::text) AND (btrim(source_reference_id) <> ''::text) AND (btrim(request_id) <> ''::text) AND (btrim(actor_ref) <> ''::text))),
    CONSTRAINT app_customer_party_relationships_role_chk CHECK ((relationship_role = ANY (ARRAY['account_owner'::text, 'contact'::text, 'service_recipient'::text]))),
    CONSTRAINT app_customer_party_relationships_valid_range_chk CHECK (((valid_to IS NULL) OR (valid_to > valid_from)))
);


--
-- Name: TABLE app_customer_party_relationships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_customer_party_relationships IS 'Time-bound customer-account to party service/account roles. This relationship does not prove legal identity, grant representation authority, or constitute a mandate.';


--
-- Name: COLUMN app_customer_party_relationships.relationship_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_customer_party_relationships.relationship_role IS 'Bounded account/service role: account_owner, contact, or service_recipient. It is not a case role, legal authority, or mandate scope.';


--
-- Name: app_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_number text,
    customer_type text NOT NULL,
    display_name text,
    preferred_language text DEFAULT 'nl'::text NOT NULL,
    primary_email_normalized text,
    primary_phone_normalized text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    minimized_at timestamp with time zone,
    CONSTRAINT app_customers_customer_type_chk CHECK ((customer_type = ANY (ARRAY['particulier'::text, 'zakelijk'::text, 'vve'::text]))),
    CONSTRAINT app_customers_preferred_language_chk CHECK ((preferred_language = ANY (ARRAY['nl'::text, 'en'::text]))),
    CONSTRAINT app_customers_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'minimized'::text])))
);


--
-- Name: TABLE app_customers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_customers IS 'Canonical ENVAL /app customer record. Service-role writes only; customer reads will be exposed through app endpoints/projections later.';


--
-- Name: COLUMN app_customers.customer_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_customers.customer_number IS 'Optional future customer number. Generation is intentionally deferred.';


--
-- Name: COLUMN app_customers.primary_email_normalized; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_customers.primary_email_normalized IS 'Normalized email used for matching/search. Not globally unique until duplicate/customer matching policy is finalized.';


--
-- Name: app_dossier_chargers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_dossier_chargers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dossier_id uuid NOT NULL,
    location_id uuid NOT NULL,
    client_charger_id text NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    brand_id text,
    brand_label text,
    manual_brand text,
    model_id text,
    model_label text,
    manual_model text,
    serial_number text,
    mid_number text NOT NULL,
    mid_status text DEFAULT 'submitted'::text NOT NULL,
    backend_supplier_id text,
    backend_supplier_label text,
    manual_backend_supplier text,
    installation_year integer,
    solar_export_status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_dossier_chargers_installation_year_chk CHECK (((installation_year IS NULL) OR ((installation_year >= 1990) AND (installation_year <= 2050)))),
    CONSTRAINT app_dossier_chargers_mid_status_chk CHECK ((mid_status = ANY (ARRAY['submitted'::text, 'needs_review'::text, 'accepted_for_processing'::text, 'duplicate_risk'::text, 'rejected_or_paused'::text]))),
    CONSTRAINT app_dossier_chargers_status_chk CHECK ((status = ANY (ARRAY['submitted'::text, 'needs_review'::text, 'accepted_for_processing'::text, 'needs_customer_action'::text, 'rejected_or_paused'::text])))
);


--
-- Name: TABLE app_dossier_chargers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_dossier_chargers IS 'Charger records linked to ENVAL /app dossier locations. Service-role writes only; customer reads will use app endpoints/projections later.';


--
-- Name: COLUMN app_dossier_chargers.client_charger_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_chargers.client_charger_id IS 'Stable client-generated charger ID from the signup payload for idempotent mapping.';


--
-- Name: COLUMN app_dossier_chargers.mid_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_chargers.mid_number IS 'Customer-provided MID number. Not globally unique at schema level yet; duplicate risk checks are handled by later backend review logic.';


--
-- Name: COLUMN app_dossier_chargers.backend_supplier_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_chargers.backend_supplier_id IS 'Optional backend supplier catalog ID. Backend supplier is intentionally optional in signup.';


--
-- Name: COLUMN app_dossier_chargers.manual_backend_supplier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_chargers.manual_backend_supplier IS 'Optional manual backend supplier label when the customer selects an uncatalogued supplier.';


--
-- Name: app_dossier_document_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_dossier_document_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dossier_id uuid NOT NULL,
    document_slot_id uuid NOT NULL,
    issued_request_id text NOT NULL,
    issued_idempotency_key text NOT NULL,
    status text DEFAULT 'issued'::text NOT NULL,
    storage_bucket text NOT NULL,
    storage_path text NOT NULL,
    original_file_name text NOT NULL,
    normalized_file_name text NOT NULL,
    declared_mime_type text NOT NULL,
    declared_size_bytes bigint NOT NULL,
    client_sha256 text,
    detected_mime_type text,
    stored_size_bytes bigint,
    server_sha256 text,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    upload_observed_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    rejected_at timestamp with time zone,
    rejection_reason text,
    expired_at timestamp with time zone,
    abandoned_at timestamp with time zone,
    terminal_reason text,
    confirmed_request_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_dossier_document_files_abandoned_state_chk CHECK (((status <> 'abandoned'::text) OR ((abandoned_at IS NOT NULL) AND (terminal_reason IS NOT NULL)))),
    CONSTRAINT app_dossier_document_files_client_sha256_chk CHECK (((client_sha256 IS NULL) OR (client_sha256 ~ '^[0-9A-Fa-f]{64}$'::text))),
    CONSTRAINT app_dossier_document_files_confirmed_request_id_not_blank_chk CHECK (((confirmed_request_id IS NULL) OR (btrim(confirmed_request_id) <> ''::text))),
    CONSTRAINT app_dossier_document_files_confirmed_state_chk CHECK (((status <> 'confirmed'::text) OR ((confirmed_at IS NOT NULL) AND (confirmed_request_id IS NOT NULL) AND (detected_mime_type IS NOT NULL) AND (stored_size_bytes IS NOT NULL) AND (server_sha256 IS NOT NULL) AND (upload_observed_at IS NOT NULL)))),
    CONSTRAINT app_dossier_document_files_declared_mime_type_not_blank_chk CHECK ((btrim(declared_mime_type) <> ''::text)),
    CONSTRAINT app_dossier_document_files_declared_size_chk CHECK ((declared_size_bytes >= 0)),
    CONSTRAINT app_dossier_document_files_detected_mime_type_not_blank_chk CHECK (((detected_mime_type IS NULL) OR (btrim(detected_mime_type) <> ''::text))),
    CONSTRAINT app_dossier_document_files_expired_state_chk CHECK (((status <> 'expired'::text) OR ((expired_at IS NOT NULL) AND (terminal_reason IS NOT NULL)))),
    CONSTRAINT app_dossier_document_files_expires_after_issued_chk CHECK ((expires_at > issued_at)),
    CONSTRAINT app_dossier_document_files_normalized_file_name_not_blank_chk CHECK ((btrim(normalized_file_name) <> ''::text)),
    CONSTRAINT app_dossier_document_files_original_file_name_not_blank_chk CHECK ((btrim(original_file_name) <> ''::text)),
    CONSTRAINT app_dossier_document_files_rejected_state_chk CHECK (((status <> 'rejected'::text) OR ((rejected_at IS NOT NULL) AND (rejection_reason IS NOT NULL)))),
    CONSTRAINT app_dossier_document_files_server_sha256_chk CHECK (((server_sha256 IS NULL) OR (server_sha256 ~ '^[0-9A-Fa-f]{64}$'::text))),
    CONSTRAINT app_dossier_document_files_status_chk CHECK ((status = ANY (ARRAY['issued'::text, 'uploaded'::text, 'confirmed'::text, 'rejected'::text, 'expired'::text, 'abandoned'::text]))),
    CONSTRAINT app_dossier_document_files_storage_bucket_not_blank_chk CHECK ((btrim(storage_bucket) <> ''::text)),
    CONSTRAINT app_dossier_document_files_storage_path_not_blank_chk CHECK ((btrim(storage_path) <> ''::text)),
    CONSTRAINT app_dossier_document_files_stored_size_chk CHECK (((stored_size_bytes IS NULL) OR (stored_size_bytes >= 0))),
    CONSTRAINT app_dossier_document_files_terminal_reason_not_blank_chk CHECK (((terminal_reason IS NULL) OR (btrim(terminal_reason) <> ''::text))),
    CONSTRAINT app_dossier_document_files_uploaded_state_chk CHECK (((status <> ALL (ARRAY['uploaded'::text, 'confirmed'::text])) OR (upload_observed_at IS NOT NULL)))
);


--
-- Name: TABLE app_dossier_document_files; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_dossier_document_files IS 'Physical server-issued document upload target and storage-object metadata for ENVAL /app evidence. This table binds upload-url issuance to upload-confirm.';


--
-- Name: COLUMN app_dossier_document_files.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_files.status IS 'Upload/file lifecycle status. Confirmed, rejected, expired, and abandoned are terminal states.';


--
-- Name: COLUMN app_dossier_document_files.storage_bucket; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_files.storage_bucket IS 'Internal storage bucket reference. Must not be exposed directly to customers.';


--
-- Name: COLUMN app_dossier_document_files.storage_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_files.storage_path IS 'Internal server-generated storage object path. Must not include PII and must not be customer-exposed directly.';


--
-- Name: COLUMN app_dossier_document_files.client_sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_files.client_sha256 IS 'Client-provided SHA-256 hint for upload confirmation. Not trusted as truth until server-side hash verification succeeds.';


--
-- Name: COLUMN app_dossier_document_files.server_sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_files.server_sha256 IS 'Server-computed SHA-256 over stored bytes. This is the upload confirmation truth.';


--
-- Name: app_dossier_document_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_dossier_document_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dossier_id uuid NOT NULL,
    location_id uuid,
    charger_id uuid,
    client_slot_id text NOT NULL,
    document_type text NOT NULL,
    status text DEFAULT 'expected'::text NOT NULL,
    required boolean DEFAULT true NOT NULL,
    title text NOT NULL,
    description text,
    source_hint text,
    file_object_path text,
    file_name text,
    file_mime_type text,
    file_size_bytes bigint,
    file_sha256 text,
    uploaded_at timestamp with time zone,
    verified_at timestamp with time zone,
    rejected_at timestamp with time zone,
    rejection_reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    current_version_id uuid,
    current_version_number integer,
    CONSTRAINT app_dossier_document_slots_current_version_number_chk CHECK (((current_version_number IS NULL) OR (current_version_number > 0))),
    CONSTRAINT app_dossier_document_slots_current_version_pair_chk CHECK ((((current_version_id IS NULL) AND (current_version_number IS NULL)) OR ((current_version_id IS NOT NULL) AND (current_version_number IS NOT NULL)))),
    CONSTRAINT app_dossier_document_slots_file_sha256_chk CHECK (((file_sha256 IS NULL) OR (char_length(file_sha256) = 64))),
    CONSTRAINT app_dossier_document_slots_file_size_chk CHECK (((file_size_bytes IS NULL) OR (file_size_bytes >= 0))),
    CONSTRAINT app_dossier_document_slots_status_chk CHECK ((status = ANY (ARRAY['expected'::text, 'uploaded'::text, 'processing'::text, 'needs_review'::text, 'accepted'::text, 'rejected'::text, 'not_required'::text])))
);


--
-- Name: TABLE app_dossier_document_slots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_dossier_document_slots IS 'Expected document/evidence slots for an ENVAL /app dossier. This table defines required evidence and review/upload state; it is not storage bucket policy.';


--
-- Name: COLUMN app_dossier_document_slots.client_slot_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_slots.client_slot_id IS 'Stable client/backend slot reference for idempotent mapping and later upload flows.';


--
-- Name: COLUMN app_dossier_document_slots.document_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_slots.document_type IS 'Document/evidence type. Intentionally not constrained yet so future evidence types do not require a schema migration.';


--
-- Name: COLUMN app_dossier_document_slots.file_object_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_slots.file_object_path IS 'Optional future storage object path after upload. Not required while slots are expected but files are missing.';


--
-- Name: COLUMN app_dossier_document_slots.file_sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_slots.file_sha256 IS 'Optional server-confirmed SHA-256 hex digest after upload confirmation.';


--
-- Name: COLUMN app_dossier_document_slots.current_version_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_slots.current_version_id IS 'Pointer to the current confirmed immutable document version. Updated only after successful server-side upload confirmation.';


--
-- Name: COLUMN app_dossier_document_slots.current_version_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_slots.current_version_number IS 'Customer-safe current version number summary. Replacement creates a new version instead of mutating historical evidence.';


--
-- Name: app_dossier_document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_dossier_document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dossier_id uuid NOT NULL,
    document_slot_id uuid NOT NULL,
    document_file_id uuid NOT NULL,
    version_number integer NOT NULL,
    status text DEFAULT 'current'::text NOT NULL,
    replaced_by_version_id uuid,
    created_request_id text NOT NULL,
    created_idempotency_key text NOT NULL,
    confirmed_at timestamp with time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_dossier_document_versions_no_self_replace_chk CHECK (((replaced_by_version_id IS NULL) OR (replaced_by_version_id <> id))),
    CONSTRAINT app_dossier_document_versions_status_chk CHECK ((status = ANY (ARRAY['confirmed_pending_current'::text, 'current'::text, 'superseded'::text, 'rejected_after_review'::text, 'withdrawn'::text]))),
    CONSTRAINT app_dossier_document_versions_superseded_replacement_chk CHECK ((((status = 'superseded'::text) AND (replaced_by_version_id IS NOT NULL)) OR ((status <> 'superseded'::text) AND (replaced_by_version_id IS NULL)))),
    CONSTRAINT app_dossier_document_versions_version_number_chk CHECK ((version_number > 0))
);


--
-- Name: TABLE app_dossier_document_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_dossier_document_versions IS 'Immutable confirmed evidence version history for ENVAL /app document slots. Replacement creates a new version and supersedes the previous current version.';


--
-- Name: COLUMN app_dossier_document_versions.document_file_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_versions.document_file_id IS 'Confirmed physical file row used by this immutable evidence version.';


--
-- Name: COLUMN app_dossier_document_versions.version_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_versions.version_number IS 'Positive per-slot version number. Old versions remain reconstructable.';


--
-- Name: COLUMN app_dossier_document_versions.replaced_by_version_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_versions.replaced_by_version_id IS 'Version that superseded this row. Only the current-to-superseded transition may fill this field.';


--
-- Name: COLUMN app_dossier_document_versions.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_document_versions.metadata IS 'Safe structured metadata only. Do not store raw PDF text, OCR payloads, secrets, JWTs, or storage credentials.';


--
-- Name: app_dossier_legal_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_dossier_legal_acceptances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dossier_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    acceptance_type text NOT NULL,
    status text DEFAULT 'accepted'::text NOT NULL,
    version_ref text NOT NULL,
    version_hash text,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_type text DEFAULT 'customer'::text NOT NULL,
    actor_ref text,
    ip_hash text,
    user_agent_hash text,
    evidence_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_dossier_legal_acceptances_acceptance_type_chk CHECK ((acceptance_type = ANY (ARRAY['consent_bundle'::text, 'fee_terms'::text, 'privacy_terms'::text, 'service_terms'::text, 'mandate_authorization'::text]))),
    CONSTRAINT app_dossier_legal_acceptances_status_chk CHECK ((status = ANY (ARRAY['accepted'::text, 'revoked'::text, 'superseded'::text]))),
    CONSTRAINT app_dossier_legal_acceptances_version_hash_chk CHECK (((version_hash IS NULL) OR (char_length(version_hash) = 64)))
);


--
-- Name: TABLE app_dossier_legal_acceptances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_dossier_legal_acceptances IS 'Legal/commercial acceptance evidence for an ENVAL /app dossier. Stores version references and hashed request metadata, not raw IP or user agent.';


--
-- Name: COLUMN app_dossier_legal_acceptances.acceptance_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_legal_acceptances.acceptance_type IS 'Accepted legal/commercial item, such as consent bundle, fee terms, privacy terms, service terms, or mandate authorization.';


--
-- Name: COLUMN app_dossier_legal_acceptances.version_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_legal_acceptances.version_ref IS 'Version reference for the accepted legal/commercial text or bundle.';


--
-- Name: COLUMN app_dossier_legal_acceptances.version_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_legal_acceptances.version_hash IS 'Optional SHA-256 hex digest of the accepted legal/commercial text or bundle.';


--
-- Name: COLUMN app_dossier_legal_acceptances.ip_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_legal_acceptances.ip_hash IS 'Hashed request IP input when available. Raw IP must not be stored here.';


--
-- Name: COLUMN app_dossier_legal_acceptances.user_agent_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_legal_acceptances.user_agent_hash IS 'Hashed request user agent input when available. Raw user agent must not be stored here.';


--
-- Name: app_dossier_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_dossier_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dossier_id uuid NOT NULL,
    client_location_id text NOT NULL,
    label text,
    status text DEFAULT 'submitted'::text NOT NULL,
    postcode_normalized text NOT NULL,
    house_number text NOT NULL,
    suffix_normalized text,
    street text,
    city text,
    country text DEFAULT 'Nederland'::text NOT NULL,
    lookup_provider text,
    lookup_provider_id text,
    lookup_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_dossier_locations_status_chk CHECK ((status = ANY (ARRAY['submitted'::text, 'needs_review'::text, 'accepted_for_processing'::text, 'needs_customer_action'::text, 'rejected_or_paused'::text])))
);


--
-- Name: TABLE app_dossier_locations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_dossier_locations IS 'Address/location records under an ENVAL /app customer dossier. Service-role writes only; customer reads will use app endpoints/projections later.';


--
-- Name: COLUMN app_dossier_locations.client_location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_locations.client_location_id IS 'Stable client-generated location ID from the signup payload for idempotent mapping.';


--
-- Name: COLUMN app_dossier_locations.postcode_normalized; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_locations.postcode_normalized IS 'Normalized postcode from the frontend/backend validation flow. Street and city may remain null until review if lookup was unavailable.';


--
-- Name: COLUMN app_dossier_locations.lookup_metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_dossier_locations.lookup_metadata IS 'Provider metadata for address lookup, such as normalized lookup key or non-sensitive provider details.';


--
-- Name: app_evidence_declaration_contexts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_evidence_declaration_contexts (
    evidence_file_id uuid NOT NULL,
    promotion_id uuid NOT NULL,
    source_slot_ref_sha256 text NOT NULL,
    location_id uuid,
    charger_id uuid,
    association_basis text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    created_by_actor_ref text NOT NULL,
    created_from_request_id text NOT NULL,
    CONSTRAINT app_evidence_declaration_contexts_basis_chk CHECK ((association_basis = ANY (ARRAY['unscoped'::text, 'single_declared_location'::text, 'single_declared_charger'::text, 'ambiguous_source_scope'::text]))),
    CONSTRAINT app_evidence_declaration_contexts_hash_chk CHECK ((source_slot_ref_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_evidence_declaration_contexts_provenance_chk CHECK (((btrim(created_by_actor_ref) <> ''::text) AND (btrim(created_from_request_id) <> ''::text))),
    CONSTRAINT app_evidence_declaration_contexts_shape_chk CHECK ((((association_basis = 'unscoped'::text) AND (location_id IS NULL) AND (charger_id IS NULL)) OR ((association_basis = 'single_declared_location'::text) AND (location_id IS NOT NULL) AND (charger_id IS NULL)) OR ((association_basis = 'single_declared_charger'::text) AND (location_id IS NOT NULL) AND (charger_id IS NOT NULL)) OR ((association_basis = 'ambiguous_source_scope'::text) AND (location_id IS NULL) AND (charger_id IS NULL))))
);


--
-- Name: TABLE app_evidence_declaration_contexts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_evidence_declaration_contexts IS 'Immutable source-slot identity and only deterministic declared subject context for promoted signup evidence; no evidence acceptance.';


--
-- Name: app_evidence_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_evidence_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    promotion_id uuid NOT NULL,
    document_type text NOT NULL,
    source_class text NOT NULL,
    source_ref text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    created_by_actor_ref text NOT NULL,
    request_id text NOT NULL,
    CONSTRAINT app_evidence_files_provenance_chk CHECK (((btrim(document_type) <> ''::text) AND (source_class = 'signup_quarantine_file'::text) AND (btrim(source_ref) <> ''::text) AND (btrim(created_by_actor_ref) <> ''::text) AND (btrim(request_id) <> ''::text)))
);


--
-- Name: TABLE app_evidence_files; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_evidence_files IS 'Case-owned durable evidence-file root created only from a server-confirmed signup quarantine source. It is not evidence acceptance.';


--
-- Name: app_evidence_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_evidence_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    evidence_file_id uuid NOT NULL,
    version_number integer NOT NULL,
    source_intake_file_id uuid NOT NULL,
    storage_bucket text NOT NULL,
    storage_path text NOT NULL,
    detected_mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    status text NOT NULL,
    source_confirmed_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    request_id text NOT NULL,
    idempotency_key text NOT NULL,
    CONSTRAINT app_evidence_versions_number_chk CHECK ((version_number > 0)),
    CONSTRAINT app_evidence_versions_provenance_chk CHECK (((btrim(storage_bucket) <> ''::text) AND (btrim(storage_path) <> ''::text) AND (btrim(detected_mime_type) <> ''::text) AND (btrim(request_id) <> ''::text) AND (btrim(idempotency_key) <> ''::text))),
    CONSTRAINT app_evidence_versions_sha256_chk CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_evidence_versions_size_chk CHECK ((size_bytes > 0)),
    CONSTRAINT app_evidence_versions_status_chk CHECK ((status = 'confirmed_awaiting_review'::text))
);


--
-- Name: TABLE app_evidence_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_evidence_versions IS 'Immutable private durable-object metadata awaiting internal review. No Storage copy is performed by this migration or RPC.';


--
-- Name: app_idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_idempotency_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text NOT NULL,
    key text NOT NULL,
    payload_hash text NOT NULL,
    response_status integer,
    response_body jsonb,
    locked_at timestamp with time zone,
    completed_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_idempotency_keys_response_status_chk CHECK (((response_status IS NULL) OR ((response_status >= 100) AND (response_status <= 599))))
);


--
-- Name: TABLE app_idempotency_keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_idempotency_keys IS 'Scoped idempotency table for /app business writes. Stores payload hashes and replayable responses, not raw secrets or PII-heavy payloads.';


--
-- Name: COLUMN app_idempotency_keys.scope; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_idempotency_keys.scope IS 'Endpoint plus business actor scope. Idempotency keys must not be global across unrelated operations.';


--
-- Name: COLUMN app_idempotency_keys.key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_idempotency_keys.key IS 'Client/server idempotency key unique only within scope.';


--
-- Name: COLUMN app_idempotency_keys.payload_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_idempotency_keys.payload_hash IS 'Hash of canonical normalized request payload. Do not store the raw payload here.';


--
-- Name: app_intake_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_intake_audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    request_id text,
    idempotency_key text,
    actor_type text DEFAULT 'anonymous'::text NOT NULL,
    actor_ref text,
    ip_hash text,
    user_agent_hash text,
    event_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_intake_audit_events_actor_type_chk CHECK ((actor_type = ANY (ARRAY['anonymous'::text, 'customer'::text, 'system'::text, 'edge_function'::text, 'unknown'::text])))
);


--
-- Name: TABLE app_intake_audit_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_intake_audit_events IS 'Pre-customer/pre-dossier audit events for public signup attempts, rejects, rate limits, and malformed submits. Event data must be minimized.';


--
-- Name: COLUMN app_intake_audit_events.event_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_intake_audit_events.event_data IS 'Minimized structured metadata only. Do not store raw documents, secrets, full payloads, or unnecessary PII.';


--
-- Name: app_location_address_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_location_address_observations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    observation_kind text NOT NULL,
    descriptor_kind text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    recorded_by_actor_ref text NOT NULL,
    recorded_from_request_id text NOT NULL,
    source_ref_sha256 text,
    source_payload_sha256 text,
    source_retrieved_at timestamp with time zone,
    fresh_until timestamp with time zone,
    country_code text NOT NULL,
    postal_code text,
    house_number integer,
    house_number_addition text,
    street text,
    city text,
    site_reference text,
    declared_address_text text,
    CONSTRAINT app_location_address_observations_descriptor_kind_chk CHECK ((descriptor_kind = ANY (ARRAY['postal_address'::text, 'site_reference'::text, 'unstructured_postal_address'::text]))),
    CONSTRAINT app_location_address_observations_descriptor_shape_chk CHECK ((((descriptor_kind = 'postal_address'::text) AND (postal_code IS NOT NULL) AND (house_number IS NOT NULL) AND (street IS NOT NULL) AND (city IS NOT NULL) AND (site_reference IS NULL) AND (declared_address_text IS NULL)) OR ((descriptor_kind = 'site_reference'::text) AND (site_reference IS NOT NULL) AND (postal_code IS NULL) AND (house_number IS NULL) AND (house_number_addition IS NULL) AND (street IS NULL) AND (city IS NULL) AND (declared_address_text IS NULL)) OR ((descriptor_kind = 'unstructured_postal_address'::text) AND (declared_address_text IS NOT NULL) AND (btrim(declared_address_text) <> ''::text) AND (char_length(declared_address_text) <= 500) AND (postal_code IS NULL) AND (house_number IS NULL) AND (house_number_addition IS NULL) AND (street IS NULL) AND (city IS NULL) AND (site_reference IS NULL)))),
    CONSTRAINT app_location_address_observations_descriptor_values_chk CHECK (((country_code ~ '^[A-Z]{2}$'::text) AND ((postal_code IS NULL) OR ((postal_code = btrim(postal_code)) AND (postal_code = upper(postal_code)) AND (postal_code <> ''::text))) AND ((house_number_addition IS NULL) OR ((house_number_addition = btrim(house_number_addition)) AND (house_number_addition <> ''::text))) AND ((street IS NULL) OR ((street = btrim(street)) AND (street <> ''::text))) AND ((city IS NULL) OR ((city = btrim(city)) AND (city <> ''::text))) AND ((site_reference IS NULL) OR ((site_reference = btrim(site_reference)) AND (site_reference <> ''::text))) AND ((house_number IS NULL) OR (house_number > 0)))),
    CONSTRAINT app_location_address_observations_freshness_chk CHECK ((((source_retrieved_at IS NULL) OR (source_retrieved_at <= recorded_at)) AND ((fresh_until IS NULL) OR ((source_retrieved_at IS NOT NULL) AND (fresh_until > source_retrieved_at))) AND ((observation_kind <> ALL (ARRAY['pdok_observed'::text, 'bag_observed'::text, 'provider_observed'::text])) OR (source_retrieved_at IS NOT NULL)) AND ((observation_kind <> ALL (ARRAY['customer_declared'::text, 'manual_observed'::text, 'migration_snapshot'::text])) OR (fresh_until IS NULL)))),
    CONSTRAINT app_location_address_observations_hashes_chk CHECK ((((source_ref_sha256 IS NULL) OR (source_ref_sha256 ~ '^[0-9a-f]{64}$'::text)) AND ((source_payload_sha256 IS NULL) OR (source_payload_sha256 ~ '^[0-9a-f]{64}$'::text)) AND ((observation_kind <> ALL (ARRAY['document_parsed'::text, 'pdok_observed'::text, 'bag_observed'::text, 'provider_observed'::text])) OR (source_payload_sha256 IS NOT NULL)))),
    CONSTRAINT app_location_address_observations_kind_chk CHECK ((observation_kind = ANY (ARRAY['customer_declared'::text, 'document_parsed'::text, 'pdok_observed'::text, 'bag_observed'::text, 'provider_observed'::text, 'manual_observed'::text, 'migration_snapshot'::text]))),
    CONSTRAINT app_location_address_observations_provenance_chk CHECK (((recorded_by_actor_ref = btrim(recorded_by_actor_ref)) AND (recorded_by_actor_ref <> ''::text) AND (recorded_from_request_id = btrim(recorded_from_request_id)) AND (recorded_from_request_id <> ''::text)))
);


--
-- Name: TABLE app_location_address_observations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_location_address_observations IS 'TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE. Immutable source observations; never accepted current location truth by themselves.';


--
-- Name: COLUMN app_location_address_observations.source_ref_sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_location_address_observations.source_ref_sha256 IS 'Optional lowercase SHA-256 reference identity; never raw source content.';


--
-- Name: COLUMN app_location_address_observations.source_payload_sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_location_address_observations.source_payload_sha256 IS 'Optional or source-kind-required lowercase SHA-256 payload identity; never raw source content.';


--
-- Name: COLUMN app_location_address_observations.declared_address_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_location_address_observations.declared_address_text IS 'Immutable unstructured customer-declared address observation from a signed source. It is not an accepted or normalized location version.';


--
-- Name: app_location_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_location_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    accepted_from_observation_id uuid NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    valid_to timestamp with time zone,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    accepted_at timestamp with time zone NOT NULL,
    accepted_by_actor_ref text NOT NULL,
    accepted_from_request_id text NOT NULL,
    acceptance_decision_ref text NOT NULL,
    descriptor_kind text NOT NULL,
    country_code text NOT NULL,
    postal_code text,
    house_number integer,
    house_number_addition text,
    street text,
    city text,
    site_reference text,
    supersedes_version_id uuid,
    correction_reason text,
    CONSTRAINT app_location_versions_acceptance_provenance_chk CHECK (((accepted_by_actor_ref = btrim(accepted_by_actor_ref)) AND (accepted_by_actor_ref <> ''::text) AND (accepted_from_request_id = btrim(accepted_from_request_id)) AND (accepted_from_request_id <> ''::text) AND (acceptance_decision_ref = btrim(acceptance_decision_ref)) AND (acceptance_decision_ref <> ''::text))),
    CONSTRAINT app_location_versions_acceptance_time_chk CHECK ((accepted_at <= recorded_at)),
    CONSTRAINT app_location_versions_correction_reason_chk CHECK ((((supersedes_version_id IS NULL) AND (correction_reason IS NULL)) OR ((supersedes_version_id IS NOT NULL) AND (correction_reason IS NOT NULL) AND (correction_reason = btrim(correction_reason)) AND (correction_reason <> ''::text)))),
    CONSTRAINT app_location_versions_descriptor_kind_chk CHECK ((descriptor_kind = ANY (ARRAY['postal_address'::text, 'site_reference'::text]))),
    CONSTRAINT app_location_versions_descriptor_shape_chk CHECK ((((descriptor_kind = 'postal_address'::text) AND (postal_code IS NOT NULL) AND (house_number IS NOT NULL) AND (street IS NOT NULL) AND (city IS NOT NULL) AND (site_reference IS NULL)) OR ((descriptor_kind = 'site_reference'::text) AND (site_reference IS NOT NULL) AND (postal_code IS NULL) AND (house_number IS NULL) AND (house_number_addition IS NULL) AND (street IS NULL) AND (city IS NULL)))),
    CONSTRAINT app_location_versions_descriptor_values_chk CHECK (((country_code ~ '^[A-Z]{2}$'::text) AND ((postal_code IS NULL) OR ((postal_code = btrim(postal_code)) AND (postal_code = upper(postal_code)) AND (postal_code <> ''::text))) AND ((house_number_addition IS NULL) OR ((house_number_addition = btrim(house_number_addition)) AND (house_number_addition <> ''::text))) AND ((street IS NULL) OR ((street = btrim(street)) AND (street <> ''::text))) AND ((city IS NULL) OR ((city = btrim(city)) AND (city <> ''::text))) AND ((site_reference IS NULL) OR ((site_reference = btrim(site_reference)) AND (site_reference <> ''::text))) AND ((house_number IS NULL) OR (house_number > 0)))),
    CONSTRAINT app_location_versions_not_self_superseding_chk CHECK (((supersedes_version_id IS NULL) OR (supersedes_version_id <> id))),
    CONSTRAINT app_location_versions_valid_range_chk CHECK (((valid_to IS NULL) OR (valid_to > valid_from)))
);


--
-- Name: TABLE app_location_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_location_versions IS 'TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE. Immutable accepted internal versions require authorized human acceptance provenance; they are not provider, fiscal, settlement, verifier, NEa, or regulatory acceptance.';


--
-- Name: COLUMN app_location_versions.acceptance_decision_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_location_versions.acceptance_decision_ref IS 'Unique internal decision reference; not a provider or regulatory decision.';


--
-- Name: COLUMN app_location_versions.descriptor_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_location_versions.descriptor_kind IS 'Internal accepted descriptor only. This foundation proves no EAN, connection, connected party, meter, MID, kWh, eligibility, settlement, or physical-site match.';


--
-- Name: COLUMN app_location_versions.supersedes_version_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_location_versions.supersedes_version_id IS 'Optional same-root predecessor. A successor is an immutable correction, not an in-place mutation.';


--
-- Name: app_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by_actor_ref text NOT NULL,
    created_from_request_id text NOT NULL,
    creation_basis text NOT NULL,
    CONSTRAINT app_locations_created_by_actor_ref_chk CHECK (((created_by_actor_ref = btrim(created_by_actor_ref)) AND (created_by_actor_ref <> ''::text))),
    CONSTRAINT app_locations_created_from_request_id_chk CHECK (((created_from_request_id = btrim(created_from_request_id)) AND (created_from_request_id <> ''::text))),
    CONSTRAINT app_locations_creation_basis_chk CHECK ((creation_basis = ANY (ARRAY['customer_declaration'::text, 'source_observation'::text, 'manual_migration_review'::text])))
);


--
-- Name: TABLE app_locations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_locations IS 'TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE. Immutable root identity only; no location identity or address is automatically accepted.';


--
-- Name: COLUMN app_locations.creation_basis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_locations.creation_basis IS 'Controlled internal provenance basis; not a verification or acceptance status.';


--
-- Name: app_parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_parties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    party_kind text NOT NULL,
    source_type text NOT NULL,
    source_reference_type text NOT NULL,
    source_reference_id text NOT NULL,
    request_id text NOT NULL,
    actor_type text NOT NULL,
    actor_ref text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_parties_actor_type_chk CHECK ((actor_type = ANY (ARRAY['customer'::text, 'system'::text, 'support'::text, 'admin'::text, 'edge_function'::text, 'worker'::text, 'provider'::text, 'unknown'::text]))),
    CONSTRAINT app_parties_party_kind_chk CHECK ((party_kind = ANY (ARRAY['natural_person'::text, 'organization'::text]))),
    CONSTRAINT app_parties_provenance_not_blank_chk CHECK (((btrim(source_type) <> ''::text) AND (btrim(source_reference_type) <> ''::text) AND (btrim(source_reference_id) <> ''::text) AND (btrim(request_id) <> ''::text) AND (btrim(actor_ref) <> ''::text)))
);


--
-- Name: TABLE app_parties; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_parties IS 'Stable provider-independent party roots. A party is not an Auth user, customer account, case, representation, authority, or mandate; roots are immutable and have no normal hard-delete path.';


--
-- Name: app_party_declaration_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_party_declaration_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    dossier_id uuid NOT NULL,
    account_type text NOT NULL,
    declaration_kind text NOT NULL,
    declared_at timestamp with time zone NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    person_first_name text,
    person_last_name text,
    person_full_name text,
    organization_classification text,
    organization_legal_name text,
    trade_register_number text,
    source_type text NOT NULL,
    source_request_id text NOT NULL,
    source_payload_sha256 text NOT NULL,
    declarative_actor_ref text NOT NULL,
    environment text NOT NULL,
    CONSTRAINT app_party_declaration_sources_account_type_chk CHECK ((account_type = ANY (ARRAY['particulier'::text, 'zakelijk'::text, 'vve'::text]))),
    CONSTRAINT app_party_declaration_sources_actor_not_blank_chk CHECK ((btrim(declarative_actor_ref) <> ''::text)),
    CONSTRAINT app_party_declaration_sources_environment_not_blank_chk CHECK ((btrim(environment) <> ''::text)),
    CONSTRAINT app_party_declaration_sources_kind_chk CHECK ((declaration_kind = ANY (ARRAY['natural_person'::text, 'organization'::text]))),
    CONSTRAINT app_party_declaration_sources_payload_sha256_chk CHECK ((source_payload_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_party_declaration_sources_request_not_blank_chk CHECK ((btrim(source_request_id) <> ''::text)),
    CONSTRAINT app_party_declaration_sources_shape_chk CHECK ((((account_type = 'particulier'::text) AND (declaration_kind = 'natural_person'::text) AND (person_first_name IS NOT NULL) AND (btrim(person_first_name) <> ''::text) AND (person_last_name IS NOT NULL) AND (btrim(person_last_name) <> ''::text) AND (person_full_name = ((btrim(person_first_name) || ' '::text) || btrim(person_last_name))) AND (organization_classification IS NULL) AND (organization_legal_name IS NULL) AND (trade_register_number IS NULL)) OR ((account_type = ANY (ARRAY['zakelijk'::text, 'vve'::text])) AND (declaration_kind = 'organization'::text) AND (person_first_name IS NULL) AND (person_last_name IS NULL) AND (person_full_name IS NULL) AND (organization_classification =
CASE account_type
    WHEN 'zakelijk'::text THEN 'business'::text
    ELSE 'vve'::text
END) AND (organization_legal_name IS NOT NULL) AND (btrim(organization_legal_name) <> ''::text) AND (trade_register_number ~ '^[0-9]{8}$'::text)))),
    CONSTRAINT app_party_declaration_sources_source_type_chk CHECK ((source_type = 'signup_applicant_declaration'::text)),
    CONSTRAINT app_party_declaration_sources_validity_chk CHECK ((valid_from = declared_at))
);


--
-- Name: TABLE app_party_declaration_sources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_party_declaration_sources IS 'Immutable applicant-declared party facts captured by the current direct signup transaction. Declaration is not verification, representation, mandate, address, EAN/aangeslotene, ownership, eligibility, evidence acceptance, verifier acceptance or NEa acceptance.';


--
-- Name: COLUMN app_party_declaration_sources.valid_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_party_declaration_sources.valid_from IS 'ENVAL declaration validity starts at the server-side recording timestamp. This does not prove any earlier external or legal validity.';


--
-- Name: COLUMN app_party_declaration_sources.trade_register_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_party_declaration_sources.trade_register_number IS 'Exactly eight applicant-declared digits. This is not a verified KvK or register fact.';


--
-- Name: app_party_organization_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_party_organization_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    party_id uuid NOT NULL,
    legal_name text NOT NULL,
    organization_classification text NOT NULL,
    legal_form text,
    trade_register_number text,
    valid_from date NOT NULL,
    valid_to date,
    source_type text NOT NULL,
    source_reference_type text NOT NULL,
    source_reference_id text NOT NULL,
    request_id text NOT NULL,
    actor_type text NOT NULL,
    actor_ref text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    supersedes_organization_version_id uuid,
    CONSTRAINT app_party_organization_versions_actor_type_chk CHECK ((actor_type = ANY (ARRAY['customer'::text, 'system'::text, 'support'::text, 'admin'::text, 'edge_function'::text, 'worker'::text, 'provider'::text, 'unknown'::text]))),
    CONSTRAINT app_party_organization_versions_classification_chk CHECK ((organization_classification = ANY (ARRAY['business'::text, 'vve'::text, 'other_organization'::text]))),
    CONSTRAINT app_party_organization_versions_legal_name_not_blank_chk CHECK ((btrim(legal_name) <> ''::text)),
    CONSTRAINT app_party_organization_versions_no_self_supersede_chk CHECK (((supersedes_organization_version_id IS NULL) OR (supersedes_organization_version_id <> id))),
    CONSTRAINT app_party_organization_versions_optional_facts_not_blank_chk CHECK ((((legal_form IS NULL) OR (btrim(legal_form) <> ''::text)) AND ((trade_register_number IS NULL) OR (btrim(trade_register_number) <> ''::text)))),
    CONSTRAINT app_party_organization_versions_provenance_not_blank_chk CHECK (((btrim(source_type) <> ''::text) AND (btrim(source_reference_type) <> ''::text) AND (btrim(source_reference_id) <> ''::text) AND (btrim(request_id) <> ''::text) AND (btrim(actor_ref) <> ''::text))),
    CONSTRAINT app_party_organization_versions_valid_range_chk CHECK (((valid_to IS NULL) OR (valid_to > valid_from)))
);


--
-- Name: TABLE app_party_organization_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_party_organization_versions IS 'Immutable organization profile history. VvE is organization_classification vve, not a third party_kind. Trade-register facts are source-bound and intentionally not globally unique.';


--
-- Name: COLUMN app_party_organization_versions.trade_register_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_party_organization_versions.trade_register_number IS 'Versioned handelsregisternummer fact. Optional when the source does not establish one; no global uniqueness or external-register verification is asserted.';


--
-- Name: app_party_person_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_party_person_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    party_id uuid NOT NULL,
    full_name text NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    source_type text NOT NULL,
    source_reference_type text NOT NULL,
    source_reference_id text NOT NULL,
    request_id text NOT NULL,
    actor_type text NOT NULL,
    actor_ref text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    supersedes_person_version_id uuid,
    CONSTRAINT app_party_person_versions_actor_type_chk CHECK ((actor_type = ANY (ARRAY['customer'::text, 'system'::text, 'support'::text, 'admin'::text, 'edge_function'::text, 'worker'::text, 'provider'::text, 'unknown'::text]))),
    CONSTRAINT app_party_person_versions_full_name_not_blank_chk CHECK ((btrim(full_name) <> ''::text)),
    CONSTRAINT app_party_person_versions_no_self_supersede_chk CHECK (((supersedes_person_version_id IS NULL) OR (supersedes_person_version_id <> id))),
    CONSTRAINT app_party_person_versions_provenance_not_blank_chk CHECK (((btrim(source_type) <> ''::text) AND (btrim(source_reference_type) <> ''::text) AND (btrim(source_reference_id) <> ''::text) AND (btrim(request_id) <> ''::text) AND (btrim(actor_ref) <> ''::text))),
    CONSTRAINT app_party_person_versions_valid_range_chk CHECK (((valid_to IS NULL) OR (valid_to > valid_from)))
);


--
-- Name: TABLE app_party_person_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_party_person_versions IS 'Immutable natural-person profile history. Business validity is separate from recorded_at; an active version is a row not superseded by a later version.';


--
-- Name: app_signup_authenticated_intake_provenance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_signup_authenticated_intake_provenance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    intake_id uuid NOT NULL,
    auth_user_id uuid NOT NULL,
    auth_email_sha256 text NOT NULL,
    auth_email_verified_at timestamp with time zone NOT NULL,
    linkage_type text NOT NULL,
    request_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_signup_authenticated_intake_provena_auth_email_sha256_check CHECK ((auth_email_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_signup_authenticated_intake_provenance_linkage_type_check CHECK ((linkage_type = ANY (ARRAY['verified_auth_at_intake_start'::text, 'verified_auth_recovery_after_signing'::text]))),
    CONSTRAINT app_signup_authenticated_intake_provenance_request_id_check CHECK ((btrim(request_id) <> ''::text))
);


--
-- Name: TABLE app_signup_authenticated_intake_provenance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_signup_authenticated_intake_provenance IS 'Immutable intake-specific verified Supabase Auth provenance; no token or raw e-mail.';


--
-- Name: app_signup_intake_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_signup_intake_capabilities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    intake_id uuid NOT NULL,
    intake_file_id uuid,
    capability_type text NOT NULL,
    token_sha256 text NOT NULL,
    issued_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    invalidated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_signup_intake_capabilities_capability_type_chk CHECK ((capability_type = ANY (ARRAY['intake_manage'::text, 'quarantine_upload'::text, 'email_verification'::text]))),
    CONSTRAINT app_signup_intake_capabilities_consumed_before_expiry_chk CHECK (((consumed_at IS NULL) OR (consumed_at <= expires_at))),
    CONSTRAINT app_signup_intake_capabilities_expires_after_issued_chk CHECK ((expires_at > issued_at)),
    CONSTRAINT app_signup_intake_capabilities_single_terminal_marker_chk CHECK ((NOT ((consumed_at IS NOT NULL) AND (invalidated_at IS NOT NULL)))),
    CONSTRAINT app_signup_intake_capabilities_token_sha256_chk CHECK ((token_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_signup_intake_capabilities_type_file_scope_chk CHECK ((((capability_type = 'quarantine_upload'::text) AND (intake_file_id IS NOT NULL)) OR ((capability_type = ANY (ARRAY['intake_manage'::text, 'email_verification'::text])) AND (intake_file_id IS NULL))))
);


--
-- Name: TABLE app_signup_intake_capabilities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_signup_intake_capabilities IS 'Hashed opaque pre-auth intake capabilities. Raw capability tokens are never stored; atomic one-time consumption belongs to a later RPC.';


--
-- Name: COLUMN app_signup_intake_capabilities.capability_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intake_capabilities.capability_type IS 'intake_manage is reusable and intake-scoped; quarantine_upload is one-time and file-scoped; raw tokens are never stored.';


--
-- Name: COLUMN app_signup_intake_capabilities.token_sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intake_capabilities.token_sha256 IS 'Unique lowercase SHA-256 digest of the opaque capability token. Raw token values must never be stored.';


--
-- Name: COLUMN app_signup_intake_capabilities.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intake_capabilities.expires_at IS 'Explicit caller-provided capability expiry. Exact TTL and minimization interval remain an operational decision.';


--
-- Name: app_signup_intake_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_signup_intake_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    intake_id uuid NOT NULL,
    client_slot_id text NOT NULL,
    document_type text NOT NULL,
    original_filename text NOT NULL,
    declared_mime_type text NOT NULL,
    detected_mime_type text,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    storage_bucket text NOT NULL,
    storage_path text NOT NULL,
    status text DEFAULT 'expected'::text NOT NULL,
    issued_at timestamp with time zone,
    uploaded_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    promoted_at timestamp with time zone,
    promoted_document_file_id uuid,
    rejected_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revision_number integer DEFAULT 1 NOT NULL,
    supersedes_intake_file_id uuid,
    superseded_at timestamp with time zone,
    superseded_by_intake_file_id uuid,
    server_size_bytes bigint,
    server_sha256 text,
    promoted_evidence_file_id uuid,
    CONSTRAINT app_signup_intake_files_client_slot_id_not_blank_chk CHECK ((btrim(client_slot_id) <> ''::text)),
    CONSTRAINT app_signup_intake_files_confirmed_state_chk CHECK (((status <> ALL (ARRAY['confirmed_quarantine'::text, 'promoted'::text])) OR (confirmed_at IS NOT NULL))),
    CONSTRAINT app_signup_intake_files_declared_mime_type_not_blank_chk CHECK ((btrim(declared_mime_type) <> ''::text)),
    CONSTRAINT app_signup_intake_files_detected_mime_type_not_blank_chk CHECK (((detected_mime_type IS NULL) OR (btrim(detected_mime_type) <> ''::text))),
    CONSTRAINT app_signup_intake_files_document_type_not_blank_chk CHECK ((btrim(document_type) <> ''::text)),
    CONSTRAINT app_signup_intake_files_expires_after_created_chk CHECK ((expires_at > created_at)),
    CONSTRAINT app_signup_intake_files_no_self_superseded_by_chk CHECK (((superseded_by_intake_file_id IS NULL) OR (superseded_by_intake_file_id <> id))),
    CONSTRAINT app_signup_intake_files_no_self_supersession_chk CHECK (((supersedes_intake_file_id IS NULL) OR (supersedes_intake_file_id <> id))),
    CONSTRAINT app_signup_intake_files_original_filename_not_blank_chk CHECK ((btrim(original_filename) <> ''::text)),
    CONSTRAINT app_signup_intake_files_promoted_pair_chk CHECK ((((promoted_at IS NULL) AND (promoted_document_file_id IS NULL) AND (promoted_evidence_file_id IS NULL)) OR ((promoted_at IS NOT NULL) AND (num_nonnulls(promoted_document_file_id, promoted_evidence_file_id) = 1)))),
    CONSTRAINT app_signup_intake_files_promoted_state_chk CHECK (((status <> 'promoted'::text) OR ((confirmed_at IS NOT NULL) AND (promoted_at IS NOT NULL) AND (num_nonnulls(promoted_document_file_id, promoted_evidence_file_id) = 1)))),
    CONSTRAINT app_signup_intake_files_rejected_state_chk CHECK (((status <> 'rejected'::text) OR (rejected_at IS NOT NULL))),
    CONSTRAINT app_signup_intake_files_revision_positive_chk CHECK ((revision_number > 0)),
    CONSTRAINT app_signup_intake_files_server_sha256_chk CHECK (((server_sha256 IS NULL) OR (server_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT app_signup_intake_files_server_size_bytes_chk CHECK (((server_size_bytes IS NULL) OR (server_size_bytes > 0))),
    CONSTRAINT app_signup_intake_files_sha256_chk CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_signup_intake_files_size_bytes_chk CHECK ((size_bytes > 0)),
    CONSTRAINT app_signup_intake_files_status_chk CHECK ((status = ANY (ARRAY['expected'::text, 'upload_issued'::text, 'uploaded_pending_confirm'::text, 'confirmed_quarantine'::text, 'superseded'::text, 'promoted'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT app_signup_intake_files_storage_bucket_not_blank_chk CHECK ((btrim(storage_bucket) <> ''::text)),
    CONSTRAINT app_signup_intake_files_storage_path_not_blank_chk CHECK ((btrim(storage_path) <> ''::text)),
    CONSTRAINT app_signup_intake_files_superseded_state_chk CHECK (((status <> 'superseded'::text) OR (superseded_at IS NOT NULL)))
);


--
-- Name: TABLE app_signup_intake_files; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_signup_intake_files IS 'Private quarantine file metadata for pre-auth signup intake. Stores no bytes. Later promotion may copy confirmed evidence into immutable app document files/versions.';


--
-- Name: COLUMN app_signup_intake_files.client_slot_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intake_files.client_slot_id IS 'Stable public-intake slot reference scoped to one intake. Unique per intake.';


--
-- Name: COLUMN app_signup_intake_files.sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intake_files.sha256 IS 'Lowercase SHA-256 digest for the quarantine object metadata. Server-side promotion must revalidate before evidence promotion.';


--
-- Name: COLUMN app_signup_intake_files.storage_bucket; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intake_files.storage_bucket IS 'Internal quarantine bucket reference. Must not be customer-readable through table access.';


--
-- Name: COLUMN app_signup_intake_files.storage_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intake_files.storage_path IS 'Internal quarantine storage path. Must not be customer-readable through table access.';


--
-- Name: COLUMN app_signup_intake_files.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intake_files.expires_at IS 'Explicit caller-provided file/quarantine expiry. Exact TTL and cleanup interval remain an operational decision.';


--
-- Name: COLUMN app_signup_intake_files.revision_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intake_files.revision_number IS 'Immutable revision number, starting at 1, scoped to one intake and client slot.';


--
-- Name: COLUMN app_signup_intake_files.superseded_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intake_files.superseded_at IS 'Terminal withdrawal/replacement marker. Superseded files never satisfy signup journey gating.';


--
-- Name: COLUMN app_signup_intake_files.server_sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intake_files.server_sha256 IS 'Server-computed digest recorded during confirmation or rejection; never supplied by the browser to SQL.';


--
-- Name: app_signup_intakes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_signup_intakes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'collecting'::text NOT NULL,
    submitted_payload jsonb NOT NULL,
    submitted_payload_sha256 text NOT NULL,
    client_precheck jsonb,
    accepted_legal_versions jsonb NOT NULL,
    email_normalized text NOT NULL,
    request_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finalized_at timestamp with time zone,
    verification_sent_at timestamp with time zone,
    verified_at timestamp with time zone,
    promotion_started_at timestamp with time zone,
    promoted_at timestamp with time zone,
    promotion_dossier_id uuid,
    expires_at timestamp with time zone NOT NULL,
    expired_at timestamp with time zone,
    minimized_at timestamp with time zone,
    promotion_case_id uuid,
    CONSTRAINT app_signup_intakes_accepted_legal_versions_shape_chk CHECK (((jsonb_typeof(accepted_legal_versions) = 'object'::text) AND (accepted_legal_versions ? 'items'::text) AND (jsonb_typeof((accepted_legal_versions -> 'items'::text)) = 'array'::text))),
    CONSTRAINT app_signup_intakes_email_normalized_not_blank_chk CHECK ((btrim(email_normalized) <> ''::text)),
    CONSTRAINT app_signup_intakes_expired_state_chk CHECK (((status <> 'expired'::text) OR (expired_at IS NOT NULL))),
    CONSTRAINT app_signup_intakes_expires_after_created_chk CHECK ((expires_at > created_at)),
    CONSTRAINT app_signup_intakes_finalized_state_chk CHECK (((status = 'collecting'::text) OR (finalized_at IS NOT NULL))),
    CONSTRAINT app_signup_intakes_promoted_pair_chk CHECK ((((promoted_at IS NULL) AND (promotion_case_id IS NULL) AND (promotion_dossier_id IS NULL)) OR ((promoted_at IS NOT NULL) AND (num_nonnulls(promotion_case_id, promotion_dossier_id) = 1)))),
    CONSTRAINT app_signup_intakes_promoted_state_chk CHECK (((status <> 'promoted'::text) OR ((promoted_at IS NOT NULL) AND (num_nonnulls(promotion_case_id, promotion_dossier_id) = 1)))),
    CONSTRAINT app_signup_intakes_ready_before_promoting_chk CHECK (((status <> ALL (ARRAY['promoting'::text, 'promoted'::text])) OR (finalized_at IS NOT NULL))),
    CONSTRAINT app_signup_intakes_request_id_not_blank_chk CHECK (((request_id IS NULL) OR (btrim(request_id) <> ''::text))),
    CONSTRAINT app_signup_intakes_status_chk CHECK ((status = ANY (ARRAY['collecting'::text, 'submitted_for_review'::text, 'promoting'::text, 'promoted'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT app_signup_intakes_submitted_payload_object_chk CHECK ((jsonb_typeof(submitted_payload) = 'object'::text)),
    CONSTRAINT app_signup_intakes_submitted_payload_sha256_chk CHECK ((submitted_payload_sha256 ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: TABLE app_signup_intakes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_signup_intakes IS 'Pre-dossier public signup intake finalized before verified promotion. Service-role only; target flow is not operational until future endpoints/RPCs are implemented.';


--
-- Name: COLUMN app_signup_intakes.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intakes.status IS 'Signup intake lifecycle. submitted_for_review means signed, finalized and mutation-locked for ENVAL internal review/promotion; it has no external-verifier meaning.';


--
-- Name: COLUMN app_signup_intakes.submitted_payload; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intakes.submitted_payload IS 'Exact submitted public intake payload. Immutable after finalized_at is set. Do not expose directly to customers.';


--
-- Name: COLUMN app_signup_intakes.submitted_payload_sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intakes.submitted_payload_sha256 IS 'Lowercase SHA-256 digest of the canonical submitted payload. Raw payload remains in submitted_payload for controlled server-side promotion only.';


--
-- Name: COLUMN app_signup_intakes.client_precheck; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intakes.client_precheck IS 'Optional browser parser/precheck summary. Non-authoritative; backend validation and promotion decide.';


--
-- Name: COLUMN app_signup_intakes.accepted_legal_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intakes.accepted_legal_versions IS 'Deterministic JSON object with an items array describing accepted legal/commercial versions at Start dossier.';


--
-- Name: COLUMN app_signup_intakes.email_normalized; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intakes.email_normalized IS 'Normalized submitted email used by future verification/promotion logic. Email alone is not an authorization capability.';


--
-- Name: COLUMN app_signup_intakes.promotion_dossier_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intakes.promotion_dossier_id IS 'Historical pre-09C1 dossier promotion target only. New signed-signup promotion must leave this null and use promotion_case_id.';


--
-- Name: COLUMN app_signup_intakes.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intakes.expires_at IS 'Explicit caller-provided intake expiry. Exact TTL and minimization intervals remain an operational decision; no schema default is hardcoded.';


--
-- Name: COLUMN app_signup_intakes.minimized_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intakes.minimized_at IS 'Future retention/minimization marker. Exact cleanup interval remains OPEN and must be configured outside this schema.';


--
-- Name: COLUMN app_signup_intakes.promotion_case_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_signup_intakes.promotion_case_id IS 'Terminal app_cases target created by the service-only signed-signup promotion transaction. Never an app_customer_dossiers identifier.';


--
-- Name: app_signup_legal_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_signup_legal_acceptances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    intake_id uuid NOT NULL,
    snapshot_id uuid NOT NULL,
    action_type text NOT NULL,
    document_type text NOT NULL,
    document_version text NOT NULL,
    language text NOT NULL,
    content_sha256 text NOT NULL,
    accepted_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_signup_legal_acceptances_action_chk CHECK ((action_type = ANY (ARRAY['privacy_notice_read'::text, 'service_terms_accepted'::text, 'fee_terms_accepted'::text]))),
    CONSTRAINT app_signup_legal_acceptances_document_chk CHECK ((document_type = ANY (ARRAY['privacy_notice'::text, 'service_terms'::text, 'fee_terms'::text]))),
    CONSTRAINT app_signup_legal_acceptances_hash_chk CHECK ((content_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_signup_legal_acceptances_language_chk CHECK ((language = 'nl'::text)),
    CONSTRAINT app_signup_legal_acceptances_pair_chk CHECK ((((action_type = 'privacy_notice_read'::text) AND (document_type = 'privacy_notice'::text)) OR ((action_type = 'service_terms_accepted'::text) AND (document_type = 'service_terms'::text)) OR ((action_type = 'fee_terms_accepted'::text) AND (document_type = 'fee_terms'::text))))
);


--
-- Name: app_signup_mandates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_signup_mandates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    intake_id uuid NOT NULL,
    snapshot_id uuid NOT NULL,
    account_type text NOT NULL,
    calendar_year integer NOT NULL,
    issued_at timestamp with time zone NOT NULL,
    mandate_content jsonb NOT NULL,
    authority_review_status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_signup_mandates_account_type_chk CHECK ((account_type = ANY (ARRAY['particulier'::text, 'zakelijk'::text, 'vve'::text]))),
    CONSTRAINT app_signup_mandates_authority_chk CHECK ((authority_review_status = ANY (ARRAY['not_applicable'::text, 'required_not_completed'::text]))),
    CONSTRAINT app_signup_mandates_content_chk CHECK ((jsonb_typeof(mandate_content) = 'object'::text)),
    CONSTRAINT app_signup_mandates_year_chk CHECK (((calendar_year >= 2020) AND (calendar_year <= 2100)))
);


--
-- Name: app_signup_promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_signup_promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    intake_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    identity_id uuid NOT NULL,
    service_recipient_party_id uuid NOT NULL,
    contact_party_id uuid,
    case_id uuid NOT NULL,
    signing_snapshot_id uuid NOT NULL,
    mandate_id uuid NOT NULL,
    signature_evidence_id uuid NOT NULL,
    account_type text NOT NULL,
    source_signing_sha256 text NOT NULL,
    promotion_payload_sha256 text NOT NULL,
    request_payload_sha256 text NOT NULL,
    request_id text NOT NULL,
    idempotency_key text NOT NULL,
    actor_type text DEFAULT 'system'::text NOT NULL,
    actor_ref text NOT NULL,
    environment text NOT NULL,
    promoted_at timestamp with time zone NOT NULL,
    CONSTRAINT app_signup_promotions_account_type_chk CHECK ((account_type = ANY (ARRAY['particulier'::text, 'zakelijk'::text, 'vve'::text]))),
    CONSTRAINT app_signup_promotions_actor_type_chk CHECK ((actor_type = 'system'::text)),
    CONSTRAINT app_signup_promotions_hashes_chk CHECK (((source_signing_sha256 ~ '^[0-9a-f]{64}$'::text) AND (promotion_payload_sha256 ~ '^[0-9a-f]{64}$'::text) AND (request_payload_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT app_signup_promotions_provenance_chk CHECK (((btrim(request_id) <> ''::text) AND (btrim(idempotency_key) <> ''::text) AND (btrim(actor_ref) <> ''::text) AND (btrim(environment) <> ''::text)))
);


--
-- Name: TABLE app_signup_promotions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_signup_promotions IS 'Immutable one-per-intake provenance owner for service-only atomic promotion into app_cases. Stores hashes and references, never OTP or raw capabilities.';


--
-- Name: app_signup_signature_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_signup_signature_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    intake_id uuid NOT NULL,
    snapshot_id uuid NOT NULL,
    mandate_id uuid NOT NULL,
    challenge_id uuid NOT NULL,
    method_id text NOT NULL,
    method_version text NOT NULL,
    typed_full_name text NOT NULL,
    signer_role text DEFAULT ''::text NOT NULL,
    channel_reference_sha256 text NOT NULL,
    evidence_envelope jsonb NOT NULL,
    finalized_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_signup_signature_evidence_channel_hash_chk CHECK ((channel_reference_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_signup_signature_evidence_envelope_chk CHECK ((jsonb_typeof(evidence_envelope) = 'object'::text)),
    CONSTRAINT app_signup_signature_evidence_method_chk CHECK (((method_id = 'typed_name_otp_v1'::text) AND (method_version = '1'::text))),
    CONSTRAINT app_signup_signature_evidence_name_chk CHECK ((btrim(typed_full_name) <> ''::text))
);


--
-- Name: app_signup_signing_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_signup_signing_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    intake_id uuid NOT NULL,
    method_id text NOT NULL,
    method_version text NOT NULL,
    channel_reference_sha256 text NOT NULL,
    otp_verifier_sha256 text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts_remaining smallint DEFAULT 5 NOT NULL,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    transport_id text,
    provider_delivery_reference text,
    delivered_at timestamp with time zone,
    delivery_failed_at timestamp with time zone,
    replaced_at timestamp with time zone,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_signup_signing_challenges_attempts_chk CHECK (((attempts_remaining >= 0) AND (attempts_remaining <= 5))),
    CONSTRAINT app_signup_signing_challenges_channel_hash_chk CHECK ((channel_reference_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_signup_signing_challenges_delivery_markers_chk CHECK ((((delivery_status = 'pending'::text) AND (delivered_at IS NULL) AND (delivery_failed_at IS NULL)) OR ((delivery_status = 'delivered'::text) AND (delivered_at IS NOT NULL) AND (delivery_failed_at IS NULL)) OR ((delivery_status = 'failed'::text) AND (delivered_at IS NULL) AND (delivery_failed_at IS NOT NULL)))),
    CONSTRAINT app_signup_signing_challenges_delivery_status_chk CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'delivered'::text, 'failed'::text]))),
    CONSTRAINT app_signup_signing_challenges_expiry_chk CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '00:10:00'::interval)))),
    CONSTRAINT app_signup_signing_challenges_method_chk CHECK (((method_id = 'typed_name_otp_v1'::text) AND (method_version = '1'::text))),
    CONSTRAINT app_signup_signing_challenges_verifier_hash_chk CHECK ((otp_verifier_sha256 ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: app_signup_signing_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_signup_signing_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    intake_id uuid NOT NULL,
    schema_version text NOT NULL,
    canonical_snapshot jsonb NOT NULL,
    canonical_snapshot_sha256 text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_signup_signing_snapshots_hash_chk CHECK ((canonical_snapshot_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_signup_signing_snapshots_object_chk CHECK ((jsonb_typeof(canonical_snapshot) = 'object'::text)),
    CONSTRAINT app_signup_signing_snapshots_schema_chk CHECK ((schema_version = 'signup-signing-runtime-snapshot-v1'::text))
);


--
-- Name: app_workforce_capability_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_workforce_capability_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    workforce_identity_id uuid NOT NULL,
    capability_code text NOT NULL,
    event_type text NOT NULL,
    effective_at timestamp with time zone NOT NULL,
    valid_until timestamp with time zone,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    decision_ref text NOT NULL,
    reason_ref text,
    recorded_by_actor_ref text NOT NULL,
    request_id text NOT NULL,
    supersedes_assignment_event_id uuid,
    CONSTRAINT app_workforce_capability_assignments_capability_chk CHECK ((capability_code = ANY (ARRAY['location.root.create'::text, 'location.observation.record'::text, 'location.version.accept.prepare'::text, 'location.version.accept.approve'::text, 'location.version.correct.prepare'::text, 'location.version.correct.approve'::text]))),
    CONSTRAINT app_workforce_capability_assignments_event_chk CHECK ((event_type = ANY (ARRAY['granted'::text, 'revoked'::text]))),
    CONSTRAINT app_workforce_capability_assignments_not_self_chk CHECK (((supersedes_assignment_event_id IS NULL) OR (supersedes_assignment_event_id <> id))),
    CONSTRAINT app_workforce_capability_assignments_period_chk CHECK ((((event_type = 'granted'::text) AND ((valid_until IS NULL) OR (valid_until > effective_at))) OR ((event_type = 'revoked'::text) AND (valid_until IS NULL)))),
    CONSTRAINT app_workforce_capability_assignments_reason_chk CHECK ((((event_type = 'granted'::text) AND (reason_ref IS NULL)) OR ((event_type = 'revoked'::text) AND (reason_ref = btrim(reason_ref)) AND ((char_length(reason_ref) >= 1) AND (char_length(reason_ref) <= 200))))),
    CONSTRAINT app_workforce_capability_assignments_refs_chk CHECK (((decision_ref = btrim(decision_ref)) AND ((char_length(decision_ref) >= 1) AND (char_length(decision_ref) <= 200)) AND (recorded_by_actor_ref = btrim(recorded_by_actor_ref)) AND ((char_length(recorded_by_actor_ref) >= 1) AND (char_length(recorded_by_actor_ref) <= 200)) AND (request_id = btrim(request_id)) AND ((char_length(request_id) >= 1) AND (char_length(request_id) <= 128))))
);


--
-- Name: TABLE app_workforce_capability_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_workforce_capability_assignments IS 'Immutable grant/revoke chains for exactly six location capabilities. No wildcard, title, JWT claim or generic RBAC semantics.';


--
-- Name: app_workforce_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_workforce_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid NOT NULL,
    workforce_ref text GENERATED ALWAYS AS (('app_workforce_identity:'::text || (id)::text)) STORED,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by_actor_ref text NOT NULL,
    creation_decision_ref text NOT NULL,
    request_id text NOT NULL,
    CONSTRAINT app_workforce_identities_refs_chk CHECK (((created_by_actor_ref = btrim(created_by_actor_ref)) AND ((char_length(created_by_actor_ref) >= 1) AND (char_length(created_by_actor_ref) <= 200)) AND (creation_decision_ref = btrim(creation_decision_ref)) AND ((char_length(creation_decision_ref) >= 1) AND (char_length(creation_decision_ref) <= 200)) AND (request_id = btrim(request_id)) AND ((char_length(request_id) >= 1) AND (char_length(request_id) <= 128))))
);


--
-- Name: TABLE app_workforce_identities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_workforce_identities IS 'Opaque workforce principals bound to Auth credentials. Customer identity, case participation, representation and service_role never confer workforce authority. No self-enrollment or migration bootstrap exists.';


--
-- Name: app_workforce_identity_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_workforce_identity_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workforce_identity_id uuid NOT NULL,
    state text NOT NULL,
    effective_at timestamp with time zone NOT NULL,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    decision_ref text NOT NULL,
    reason_ref text,
    recorded_by_actor_ref text NOT NULL,
    request_id text NOT NULL,
    supersedes_state_id uuid,
    CONSTRAINT app_workforce_identity_states_not_self_chk CHECK (((supersedes_state_id IS NULL) OR (supersedes_state_id <> id))),
    CONSTRAINT app_workforce_identity_states_reason_chk CHECK ((((state = 'active'::text) AND ((reason_ref IS NULL) OR ((reason_ref = btrim(reason_ref)) AND ((char_length(reason_ref) >= 1) AND (char_length(reason_ref) <= 200))))) OR ((state = ANY (ARRAY['suspended'::text, 'revoked'::text])) AND (reason_ref = btrim(reason_ref)) AND ((char_length(reason_ref) >= 1) AND (char_length(reason_ref) <= 200))))),
    CONSTRAINT app_workforce_identity_states_refs_chk CHECK (((decision_ref = btrim(decision_ref)) AND ((char_length(decision_ref) >= 1) AND (char_length(decision_ref) <= 200)) AND (recorded_by_actor_ref = btrim(recorded_by_actor_ref)) AND ((char_length(recorded_by_actor_ref) >= 1) AND (char_length(recorded_by_actor_ref) <= 200)) AND (request_id = btrim(request_id)) AND ((char_length(request_id) >= 1) AND (char_length(request_id) <= 128)))),
    CONSTRAINT app_workforce_identity_states_state_chk CHECK ((state = ANY (ARRAY['active'::text, 'suspended'::text, 'revoked'::text])))
);


--
-- Name: TABLE app_workforce_identity_states; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_workforce_identity_states IS 'Immutable active, suspended and terminal revoked lifecycle history. Opaque reason references only; retention remains undecided.';


--
-- Name: app_workforce_operation_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_workforce_operation_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation_type text NOT NULL,
    case_id uuid NOT NULL,
    location_id uuid NOT NULL,
    observation_id uuid NOT NULL,
    predecessor_version_id uuid,
    maker_workforce_identity_id uuid NOT NULL,
    maker_scope_assignment_id uuid NOT NULL,
    maker_capability_code text NOT NULL,
    payload_hash text NOT NULL,
    payload_contract_version text NOT NULL,
    request_id text NOT NULL,
    idempotency_key text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    execution_status text DEFAULT 'pending'::text NOT NULL,
    executed_at timestamp with time zone,
    execution_request_id text,
    wp3j_rpc_name text,
    wp3j_result_code text,
    wp3j_result_ref text,
    CONSTRAINT app_workforce_operation_requests_execution_chk CHECK ((((execution_status = 'pending'::text) AND (executed_at IS NULL) AND (execution_request_id IS NULL) AND (wp3j_rpc_name IS NULL) AND (wp3j_result_code IS NULL) AND (wp3j_result_ref IS NULL)) OR ((execution_status = 'executed'::text) AND (executed_at IS NOT NULL) AND (execution_request_id IS NOT NULL) AND (wp3j_rpc_name IS NOT NULL) AND (wp3j_result_code IS NOT NULL) AND (wp3j_result_ref IS NOT NULL)))),
    CONSTRAINT app_workforce_operation_requests_hash_chk CHECK ((payload_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_workforce_operation_requests_refs_chk CHECK (((request_id = btrim(request_id)) AND ((char_length(request_id) >= 1) AND (char_length(request_id) <= 128)) AND (idempotency_key = btrim(idempotency_key)) AND ((char_length(idempotency_key) >= 1) AND (char_length(idempotency_key) <= 200)) AND ((execution_request_id IS NULL) OR ((execution_request_id = btrim(execution_request_id)) AND ((char_length(execution_request_id) >= 1) AND (char_length(execution_request_id) <= 128)))) AND ((wp3j_result_code IS NULL) OR ((wp3j_result_code = btrim(wp3j_result_code)) AND ((char_length(wp3j_result_code) >= 1) AND (char_length(wp3j_result_code) <= 100)))) AND ((wp3j_result_ref IS NULL) OR ((wp3j_result_ref = btrim(wp3j_result_ref)) AND ((char_length(wp3j_result_ref) >= 1) AND (char_length(wp3j_result_ref) <= 200)))))),
    CONSTRAINT app_workforce_operation_requests_rpc_chk CHECK (((wp3j_rpc_name IS NULL) OR ((operation_type = 'initial_location_acceptance'::text) AND (wp3j_rpc_name = 'app_accept_initial_location_version_v1'::text)) OR ((operation_type = 'location_correction'::text) AND (wp3j_rpc_name = 'app_correct_location_version_v1'::text)))),
    CONSTRAINT app_workforce_operation_requests_type_chk CHECK ((((operation_type = 'initial_location_acceptance'::text) AND (maker_capability_code = 'location.version.accept.prepare'::text) AND (predecessor_version_id IS NULL) AND (payload_contract_version = 'location_acceptance_v1'::text)) OR ((operation_type = 'location_correction'::text) AND (maker_capability_code = 'location.version.correct.prepare'::text) AND (predecessor_version_id IS NOT NULL) AND (payload_contract_version = 'location_correction_v1'::text))))
);


--
-- Name: TABLE app_workforce_operation_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_workforce_operation_requests IS 'Immutable maker intent with one guarded eligibility-only pending-to-executed transition. This foundation performs no WP3J call or business execution.';


--
-- Name: app_workforce_operation_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_workforce_operation_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation_request_id uuid NOT NULL,
    outcome text NOT NULL,
    reviewed_payload_hash text NOT NULL,
    checker_workforce_identity_id uuid NOT NULL,
    checker_scope_assignment_id uuid NOT NULL,
    checker_capability_code text NOT NULL,
    reviewed_at timestamp with time zone NOT NULL,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    decision_ref text NOT NULL,
    reason_ref text,
    request_id text NOT NULL,
    idempotency_key text NOT NULL,
    CONSTRAINT app_workforce_operation_reviews_hash_chk CHECK ((reviewed_payload_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT app_workforce_operation_reviews_outcome_chk CHECK ((outcome = ANY (ARRAY['approved'::text, 'rejected'::text]))),
    CONSTRAINT app_workforce_operation_reviews_reason_chk CHECK ((((outcome = 'approved'::text) AND (reason_ref IS NULL)) OR ((outcome = 'rejected'::text) AND (reason_ref = btrim(reason_ref)) AND ((char_length(reason_ref) >= 1) AND (char_length(reason_ref) <= 200))))),
    CONSTRAINT app_workforce_operation_reviews_refs_chk CHECK (((decision_ref = btrim(decision_ref)) AND ((char_length(decision_ref) >= 1) AND (char_length(decision_ref) <= 200)) AND (request_id = btrim(request_id)) AND ((char_length(request_id) >= 1) AND (char_length(request_id) <= 128)) AND (idempotency_key = btrim(idempotency_key)) AND ((char_length(idempotency_key) >= 1) AND (char_length(idempotency_key) <= 200))))
);


--
-- Name: TABLE app_workforce_operation_reviews; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_workforce_operation_reviews IS 'One immutable approve/reject decision over the exact maker payload hash by a distinct authorized checker. No emergency override.';


--
-- Name: app_workforce_scope_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_workforce_scope_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_assignment_id uuid NOT NULL,
    workforce_identity_id uuid NOT NULL,
    capability_assignment_id uuid NOT NULL,
    capability_code text NOT NULL,
    case_id uuid NOT NULL,
    location_id uuid,
    case_location_relation_id uuid,
    event_type text NOT NULL,
    effective_at timestamp with time zone NOT NULL,
    valid_until timestamp with time zone,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    decision_ref text NOT NULL,
    reason_ref text,
    recorded_by_actor_ref text NOT NULL,
    request_id text NOT NULL,
    supersedes_scope_event_id uuid,
    CONSTRAINT app_workforce_scope_assignments_capability_chk CHECK ((capability_code = ANY (ARRAY['location.root.create'::text, 'location.observation.record'::text, 'location.version.accept.prepare'::text, 'location.version.accept.approve'::text, 'location.version.correct.prepare'::text, 'location.version.correct.approve'::text]))),
    CONSTRAINT app_workforce_scope_assignments_event_chk CHECK ((event_type = ANY (ARRAY['granted'::text, 'revoked'::text]))),
    CONSTRAINT app_workforce_scope_assignments_not_self_chk CHECK (((supersedes_scope_event_id IS NULL) OR (supersedes_scope_event_id <> id))),
    CONSTRAINT app_workforce_scope_assignments_period_chk CHECK ((((event_type = 'granted'::text) AND ((valid_until IS NULL) OR (valid_until > effective_at))) OR ((event_type = 'revoked'::text) AND (valid_until IS NULL)))),
    CONSTRAINT app_workforce_scope_assignments_reason_chk CHECK ((((event_type = 'granted'::text) AND (reason_ref IS NULL)) OR ((event_type = 'revoked'::text) AND (reason_ref = btrim(reason_ref)) AND ((char_length(reason_ref) >= 1) AND (char_length(reason_ref) <= 200))))),
    CONSTRAINT app_workforce_scope_assignments_refs_chk CHECK (((decision_ref = btrim(decision_ref)) AND ((char_length(decision_ref) >= 1) AND (char_length(decision_ref) <= 200)) AND (recorded_by_actor_ref = btrim(recorded_by_actor_ref)) AND ((char_length(recorded_by_actor_ref) >= 1) AND (char_length(recorded_by_actor_ref) <= 200)) AND (request_id = btrim(request_id)) AND ((char_length(request_id) >= 1) AND (char_length(request_id) <= 128)))),
    CONSTRAINT app_workforce_scope_assignments_shape_chk CHECK ((((capability_code = 'location.root.create'::text) AND (location_id IS NULL) AND (case_location_relation_id IS NULL)) OR ((capability_code <> 'location.root.create'::text) AND (location_id IS NOT NULL) AND (case_location_relation_id IS NOT NULL))))
);


--
-- Name: TABLE app_workforce_scope_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_workforce_scope_assignments IS 'Immutable workforce capability scope. Case-only scope exists solely for location.root.create; other capabilities require an explicit case/location relation.';


--
-- Name: app_audit_events app_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_audit_events
    ADD CONSTRAINT app_audit_events_pkey PRIMARY KEY (id);


--
-- Name: app_case_lifecycle_events app_case_lifecycle_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_lifecycle_events
    ADD CONSTRAINT app_case_lifecycle_events_pkey PRIMARY KEY (id);


--
-- Name: app_case_location_relations app_case_location_relations_case_location_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_location_relations
    ADD CONSTRAINT app_case_location_relations_case_location_key UNIQUE (id, case_id, location_id);


--
-- Name: app_case_location_relations app_case_location_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_location_relations
    ADD CONSTRAINT app_case_location_relations_pkey PRIMARY KEY (id);


--
-- Name: app_case_location_relations app_case_location_relations_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_location_relations
    ADD CONSTRAINT app_case_location_relations_request_id_key UNIQUE (request_id);


--
-- Name: app_case_party_roles app_case_party_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_party_roles
    ADD CONSTRAINT app_case_party_roles_pkey PRIMARY KEY (id);


--
-- Name: app_cases app_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_cases
    ADD CONSTRAINT app_cases_pkey PRIMARY KEY (id);


--
-- Name: app_charger_declarations app_charger_declarations_charger_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_charger_declarations
    ADD CONSTRAINT app_charger_declarations_charger_id_key UNIQUE (charger_id);


--
-- Name: app_charger_declarations app_charger_declarations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_charger_declarations
    ADD CONSTRAINT app_charger_declarations_pkey PRIMARY KEY (id);


--
-- Name: app_chargers app_chargers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_chargers
    ADD CONSTRAINT app_chargers_pkey PRIMARY KEY (id);


--
-- Name: app_chargers app_chargers_promotion_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_chargers
    ADD CONSTRAINT app_chargers_promotion_id_id_key UNIQUE (promotion_id, id);


--
-- Name: app_chargers app_chargers_promotion_source_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_chargers
    ADD CONSTRAINT app_chargers_promotion_source_key UNIQUE (promotion_id, source_ref_sha256);


--
-- Name: app_connection_declaration_sources app_connection_declaration_sources_dossier_client_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_declaration_sources
    ADD CONSTRAINT app_connection_declaration_sources_dossier_client_key UNIQUE (dossier_id, client_location_id);


--
-- Name: app_connection_declaration_sources app_connection_declaration_sources_location_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_declaration_sources
    ADD CONSTRAINT app_connection_declaration_sources_location_key UNIQUE (dossier_location_id);


--
-- Name: app_connection_declaration_sources app_connection_declaration_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_declaration_sources
    ADD CONSTRAINT app_connection_declaration_sources_pkey PRIMARY KEY (id);


--
-- Name: app_connection_declaration_sources app_connection_declaration_sources_request_location_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_declaration_sources
    ADD CONSTRAINT app_connection_declaration_sources_request_location_key UNIQUE (source_type, source_request_id, client_location_id);


--
-- Name: app_connection_ownership_periods app_connection_ownership_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_ownership_periods
    ADD CONSTRAINT app_connection_ownership_periods_pkey PRIMARY KEY (id);


--
-- Name: app_connection_periods app_connection_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_periods
    ADD CONSTRAINT app_connection_periods_pkey PRIMARY KEY (id);


--
-- Name: app_connections app_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connections
    ADD CONSTRAINT app_connections_pkey PRIMARY KEY (id);


--
-- Name: app_customer_access_grants app_customer_access_grants_auth_user_id_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_access_grants
    ADD CONSTRAINT app_customer_access_grants_auth_user_id_customer_id_key UNIQUE (auth_user_id, customer_id);


--
-- Name: app_customer_access_grants app_customer_access_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_access_grants
    ADD CONSTRAINT app_customer_access_grants_pkey PRIMARY KEY (id);


--
-- Name: app_customer_dossiers app_customer_dossiers_dossier_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_dossiers
    ADD CONSTRAINT app_customer_dossiers_dossier_number_key UNIQUE (dossier_number);


--
-- Name: app_customer_dossiers app_customer_dossiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_dossiers
    ADD CONSTRAINT app_customer_dossiers_pkey PRIMARY KEY (id);


--
-- Name: app_customer_identities app_customer_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_identities
    ADD CONSTRAINT app_customer_identities_pkey PRIMARY KEY (id);


--
-- Name: app_customer_party_relationships app_customer_party_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_party_relationships
    ADD CONSTRAINT app_customer_party_relationships_pkey PRIMARY KEY (id);


--
-- Name: app_customer_party_relationships app_customer_party_relationships_scope_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_party_relationships
    ADD CONSTRAINT app_customer_party_relationships_scope_id_key UNIQUE (customer_id, party_id, relationship_role, id);


--
-- Name: app_customers app_customers_customer_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customers
    ADD CONSTRAINT app_customers_customer_number_key UNIQUE (customer_number);


--
-- Name: app_customers app_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customers
    ADD CONSTRAINT app_customers_pkey PRIMARY KEY (id);


--
-- Name: app_dossier_chargers app_dossier_chargers_dossier_client_charger_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_chargers
    ADD CONSTRAINT app_dossier_chargers_dossier_client_charger_key UNIQUE (dossier_id, client_charger_id);


--
-- Name: app_dossier_chargers app_dossier_chargers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_chargers
    ADD CONSTRAINT app_dossier_chargers_pkey PRIMARY KEY (id);


--
-- Name: app_dossier_document_files app_dossier_document_files_id_slot_dossier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_files
    ADD CONSTRAINT app_dossier_document_files_id_slot_dossier_key UNIQUE (id, document_slot_id, dossier_id);


--
-- Name: app_dossier_document_files app_dossier_document_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_files
    ADD CONSTRAINT app_dossier_document_files_pkey PRIMARY KEY (id);


--
-- Name: app_dossier_document_files app_dossier_document_files_slot_idem_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_files
    ADD CONSTRAINT app_dossier_document_files_slot_idem_key UNIQUE (document_slot_id, issued_idempotency_key);


--
-- Name: app_dossier_document_files app_dossier_document_files_storage_object_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_files
    ADD CONSTRAINT app_dossier_document_files_storage_object_key UNIQUE (storage_bucket, storage_path);


--
-- Name: app_dossier_document_slots app_dossier_document_slots_dossier_client_slot_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_slots
    ADD CONSTRAINT app_dossier_document_slots_dossier_client_slot_key UNIQUE (dossier_id, client_slot_id);


--
-- Name: app_dossier_document_slots app_dossier_document_slots_id_dossier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_slots
    ADD CONSTRAINT app_dossier_document_slots_id_dossier_key UNIQUE (id, dossier_id);


--
-- Name: app_dossier_document_slots app_dossier_document_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_slots
    ADD CONSTRAINT app_dossier_document_slots_pkey PRIMARY KEY (id);


--
-- Name: app_dossier_document_versions app_dossier_document_versions_file_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_versions
    ADD CONSTRAINT app_dossier_document_versions_file_key UNIQUE (document_file_id);


--
-- Name: app_dossier_document_versions app_dossier_document_versions_id_number_slot_dossier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_versions
    ADD CONSTRAINT app_dossier_document_versions_id_number_slot_dossier_key UNIQUE (id, version_number, document_slot_id, dossier_id);


--
-- Name: app_dossier_document_versions app_dossier_document_versions_id_slot_dossier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_versions
    ADD CONSTRAINT app_dossier_document_versions_id_slot_dossier_key UNIQUE (id, document_slot_id, dossier_id);


--
-- Name: app_dossier_document_versions app_dossier_document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_versions
    ADD CONSTRAINT app_dossier_document_versions_pkey PRIMARY KEY (id);


--
-- Name: app_dossier_document_versions app_dossier_document_versions_slot_idem_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_versions
    ADD CONSTRAINT app_dossier_document_versions_slot_idem_key UNIQUE (document_slot_id, created_idempotency_key);


--
-- Name: app_dossier_document_versions app_dossier_document_versions_slot_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_versions
    ADD CONSTRAINT app_dossier_document_versions_slot_version_key UNIQUE (document_slot_id, version_number);


--
-- Name: app_dossier_legal_acceptances app_dossier_legal_acceptances_dossier_type_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_legal_acceptances
    ADD CONSTRAINT app_dossier_legal_acceptances_dossier_type_version_key UNIQUE (dossier_id, acceptance_type, version_ref);


--
-- Name: app_dossier_legal_acceptances app_dossier_legal_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_legal_acceptances
    ADD CONSTRAINT app_dossier_legal_acceptances_pkey PRIMARY KEY (id);


--
-- Name: app_dossier_locations app_dossier_locations_dossier_client_location_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_locations
    ADD CONSTRAINT app_dossier_locations_dossier_client_location_key UNIQUE (dossier_id, client_location_id);


--
-- Name: app_dossier_locations app_dossier_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_locations
    ADD CONSTRAINT app_dossier_locations_pkey PRIMARY KEY (id);


--
-- Name: app_evidence_declaration_contexts app_evidence_declaration_contexts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_declaration_contexts
    ADD CONSTRAINT app_evidence_declaration_contexts_pkey PRIMARY KEY (evidence_file_id);


--
-- Name: app_evidence_files app_evidence_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_files
    ADD CONSTRAINT app_evidence_files_pkey PRIMARY KEY (id);


--
-- Name: app_evidence_files app_evidence_files_promotion_source_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_files
    ADD CONSTRAINT app_evidence_files_promotion_source_key UNIQUE (promotion_id, source_ref);


--
-- Name: app_evidence_versions app_evidence_versions_file_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_versions
    ADD CONSTRAINT app_evidence_versions_file_version_key UNIQUE (evidence_file_id, version_number);


--
-- Name: app_evidence_versions app_evidence_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_versions
    ADD CONSTRAINT app_evidence_versions_pkey PRIMARY KEY (id);


--
-- Name: app_evidence_versions app_evidence_versions_source_intake_file_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_versions
    ADD CONSTRAINT app_evidence_versions_source_intake_file_id_key UNIQUE (source_intake_file_id);


--
-- Name: app_evidence_versions app_evidence_versions_storage_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_versions
    ADD CONSTRAINT app_evidence_versions_storage_key UNIQUE (storage_bucket, storage_path);


--
-- Name: app_idempotency_keys app_idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_idempotency_keys
    ADD CONSTRAINT app_idempotency_keys_pkey PRIMARY KEY (id);


--
-- Name: app_idempotency_keys app_idempotency_keys_scope_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_idempotency_keys
    ADD CONSTRAINT app_idempotency_keys_scope_key_key UNIQUE (scope, key);


--
-- Name: app_intake_audit_events app_intake_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_intake_audit_events
    ADD CONSTRAINT app_intake_audit_events_pkey PRIMARY KEY (id);


--
-- Name: app_location_address_observations app_location_address_observations_location_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_location_address_observations
    ADD CONSTRAINT app_location_address_observations_location_id_id_key UNIQUE (location_id, id);


--
-- Name: app_location_address_observations app_location_address_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_location_address_observations
    ADD CONSTRAINT app_location_address_observations_pkey PRIMARY KEY (id);


--
-- Name: app_location_versions app_location_versions_acceptance_decision_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_location_versions
    ADD CONSTRAINT app_location_versions_acceptance_decision_ref_key UNIQUE (acceptance_decision_ref);


--
-- Name: app_location_versions app_location_versions_accepted_observation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_location_versions
    ADD CONSTRAINT app_location_versions_accepted_observation_id_key UNIQUE (accepted_from_observation_id);


--
-- Name: app_location_versions app_location_versions_location_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_location_versions
    ADD CONSTRAINT app_location_versions_location_id_id_key UNIQUE (location_id, id);


--
-- Name: app_location_versions app_location_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_location_versions
    ADD CONSTRAINT app_location_versions_pkey PRIMARY KEY (id);


--
-- Name: app_locations app_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_locations
    ADD CONSTRAINT app_locations_pkey PRIMARY KEY (id);


--
-- Name: app_parties app_parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_parties
    ADD CONSTRAINT app_parties_pkey PRIMARY KEY (id);


--
-- Name: app_party_declaration_sources app_party_declaration_sources_dossier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_declaration_sources
    ADD CONSTRAINT app_party_declaration_sources_dossier_key UNIQUE (dossier_id);


--
-- Name: app_party_declaration_sources app_party_declaration_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_declaration_sources
    ADD CONSTRAINT app_party_declaration_sources_pkey PRIMARY KEY (id);


--
-- Name: app_party_declaration_sources app_party_declaration_sources_source_request_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_declaration_sources
    ADD CONSTRAINT app_party_declaration_sources_source_request_key UNIQUE (source_type, source_request_id);


--
-- Name: app_party_organization_versions app_party_organization_versions_party_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_organization_versions
    ADD CONSTRAINT app_party_organization_versions_party_id_id_key UNIQUE (party_id, id);


--
-- Name: app_party_organization_versions app_party_organization_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_organization_versions
    ADD CONSTRAINT app_party_organization_versions_pkey PRIMARY KEY (id);


--
-- Name: app_party_person_versions app_party_person_versions_party_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_person_versions
    ADD CONSTRAINT app_party_person_versions_party_id_id_key UNIQUE (party_id, id);


--
-- Name: app_party_person_versions app_party_person_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_person_versions
    ADD CONSTRAINT app_party_person_versions_pkey PRIMARY KEY (id);


--
-- Name: app_signup_authenticated_intake_provenance app_signup_authenticated_intake_provenance_intake_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_authenticated_intake_provenance
    ADD CONSTRAINT app_signup_authenticated_intake_provenance_intake_id_key UNIQUE (intake_id);


--
-- Name: app_signup_authenticated_intake_provenance app_signup_authenticated_intake_provenance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_authenticated_intake_provenance
    ADD CONSTRAINT app_signup_authenticated_intake_provenance_pkey PRIMARY KEY (id);


--
-- Name: app_signup_intake_capabilities app_signup_intake_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intake_capabilities
    ADD CONSTRAINT app_signup_intake_capabilities_pkey PRIMARY KEY (id);


--
-- Name: app_signup_intake_capabilities app_signup_intake_capabilities_token_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intake_capabilities
    ADD CONSTRAINT app_signup_intake_capabilities_token_sha256_key UNIQUE (token_sha256);


--
-- Name: app_signup_intake_files app_signup_intake_files_intake_slot_revision_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intake_files
    ADD CONSTRAINT app_signup_intake_files_intake_slot_revision_key UNIQUE (intake_id, client_slot_id, revision_number);


--
-- Name: app_signup_intake_files app_signup_intake_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intake_files
    ADD CONSTRAINT app_signup_intake_files_pkey PRIMARY KEY (id);


--
-- Name: app_signup_intakes app_signup_intakes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intakes
    ADD CONSTRAINT app_signup_intakes_pkey PRIMARY KEY (id);


--
-- Name: app_signup_legal_acceptances app_signup_legal_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_legal_acceptances
    ADD CONSTRAINT app_signup_legal_acceptances_pkey PRIMARY KEY (id);


--
-- Name: app_signup_legal_acceptances app_signup_legal_acceptances_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_legal_acceptances
    ADD CONSTRAINT app_signup_legal_acceptances_unique UNIQUE (intake_id, action_type);


--
-- Name: app_signup_mandates app_signup_mandates_intake_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_mandates
    ADD CONSTRAINT app_signup_mandates_intake_id_key UNIQUE (intake_id);


--
-- Name: app_signup_mandates app_signup_mandates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_mandates
    ADD CONSTRAINT app_signup_mandates_pkey PRIMARY KEY (id);


--
-- Name: app_signup_mandates app_signup_mandates_snapshot_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_mandates
    ADD CONSTRAINT app_signup_mandates_snapshot_id_key UNIQUE (snapshot_id);


--
-- Name: app_signup_promotions app_signup_promotions_case_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_case_id_key UNIQUE (case_id);


--
-- Name: app_signup_promotions app_signup_promotions_intake_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_intake_id_key UNIQUE (intake_id);


--
-- Name: app_signup_promotions app_signup_promotions_mandate_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_mandate_id_key UNIQUE (mandate_id);


--
-- Name: app_signup_promotions app_signup_promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_pkey PRIMARY KEY (id);


--
-- Name: app_signup_promotions app_signup_promotions_signature_evidence_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_signature_evidence_id_key UNIQUE (signature_evidence_id);


--
-- Name: app_signup_promotions app_signup_promotions_signing_snapshot_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_signing_snapshot_id_key UNIQUE (signing_snapshot_id);


--
-- Name: app_signup_signature_evidence app_signup_signature_evidence_challenge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signature_evidence
    ADD CONSTRAINT app_signup_signature_evidence_challenge_id_key UNIQUE (challenge_id);


--
-- Name: app_signup_signature_evidence app_signup_signature_evidence_intake_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signature_evidence
    ADD CONSTRAINT app_signup_signature_evidence_intake_id_key UNIQUE (intake_id);


--
-- Name: app_signup_signature_evidence app_signup_signature_evidence_mandate_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signature_evidence
    ADD CONSTRAINT app_signup_signature_evidence_mandate_id_key UNIQUE (mandate_id);


--
-- Name: app_signup_signature_evidence app_signup_signature_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signature_evidence
    ADD CONSTRAINT app_signup_signature_evidence_pkey PRIMARY KEY (id);


--
-- Name: app_signup_signature_evidence app_signup_signature_evidence_snapshot_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signature_evidence
    ADD CONSTRAINT app_signup_signature_evidence_snapshot_id_key UNIQUE (snapshot_id);


--
-- Name: app_signup_signing_challenges app_signup_signing_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signing_challenges
    ADD CONSTRAINT app_signup_signing_challenges_pkey PRIMARY KEY (id);


--
-- Name: app_signup_signing_snapshots app_signup_signing_snapshots_canonical_snapshot_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signing_snapshots
    ADD CONSTRAINT app_signup_signing_snapshots_canonical_snapshot_sha256_key UNIQUE (canonical_snapshot_sha256);


--
-- Name: app_signup_signing_snapshots app_signup_signing_snapshots_intake_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signing_snapshots
    ADD CONSTRAINT app_signup_signing_snapshots_intake_id_key UNIQUE (intake_id);


--
-- Name: app_signup_signing_snapshots app_signup_signing_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signing_snapshots
    ADD CONSTRAINT app_signup_signing_snapshots_pkey PRIMARY KEY (id);


--
-- Name: app_workforce_capability_assignments app_workforce_capability_assignments_identity_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_capability_assignments
    ADD CONSTRAINT app_workforce_capability_assignments_identity_code_key UNIQUE (id, workforce_identity_id, capability_code);


--
-- Name: app_workforce_capability_assignments app_workforce_capability_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_capability_assignments
    ADD CONSTRAINT app_workforce_capability_assignments_pkey PRIMARY KEY (id);


--
-- Name: app_workforce_capability_assignments app_workforce_capability_assignments_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_capability_assignments
    ADD CONSTRAINT app_workforce_capability_assignments_request_id_key UNIQUE (request_id);


--
-- Name: app_workforce_identities app_workforce_identities_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_identities
    ADD CONSTRAINT app_workforce_identities_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: app_workforce_identities app_workforce_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_identities
    ADD CONSTRAINT app_workforce_identities_pkey PRIMARY KEY (id);


--
-- Name: app_workforce_identities app_workforce_identities_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_identities
    ADD CONSTRAINT app_workforce_identities_request_id_key UNIQUE (request_id);


--
-- Name: app_workforce_identities app_workforce_identities_workforce_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_identities
    ADD CONSTRAINT app_workforce_identities_workforce_ref_key UNIQUE (workforce_ref);


--
-- Name: app_workforce_identity_states app_workforce_identity_states_identity_effective_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_identity_states
    ADD CONSTRAINT app_workforce_identity_states_identity_effective_key UNIQUE (workforce_identity_id, effective_at);


--
-- Name: app_workforce_identity_states app_workforce_identity_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_identity_states
    ADD CONSTRAINT app_workforce_identity_states_pkey PRIMARY KEY (id);


--
-- Name: app_workforce_identity_states app_workforce_identity_states_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_identity_states
    ADD CONSTRAINT app_workforce_identity_states_request_id_key UNIQUE (request_id);


--
-- Name: app_workforce_operation_requests app_workforce_operation_requests_execution_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_requests
    ADD CONSTRAINT app_workforce_operation_requests_execution_request_id_key UNIQUE (execution_request_id);


--
-- Name: app_workforce_operation_requests app_workforce_operation_requests_maker_idempotency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_requests
    ADD CONSTRAINT app_workforce_operation_requests_maker_idempotency_key UNIQUE (maker_workforce_identity_id, operation_type, idempotency_key);


--
-- Name: app_workforce_operation_requests app_workforce_operation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_requests
    ADD CONSTRAINT app_workforce_operation_requests_pkey PRIMARY KEY (id);


--
-- Name: app_workforce_operation_requests app_workforce_operation_requests_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_requests
    ADD CONSTRAINT app_workforce_operation_requests_request_id_key UNIQUE (request_id);


--
-- Name: app_workforce_operation_reviews app_workforce_operation_reviews_checker_idempotency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_reviews
    ADD CONSTRAINT app_workforce_operation_reviews_checker_idempotency_key UNIQUE (checker_workforce_identity_id, idempotency_key);


--
-- Name: app_workforce_operation_reviews app_workforce_operation_reviews_operation_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_reviews
    ADD CONSTRAINT app_workforce_operation_reviews_operation_request_id_key UNIQUE (operation_request_id);


--
-- Name: app_workforce_operation_reviews app_workforce_operation_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_reviews
    ADD CONSTRAINT app_workforce_operation_reviews_pkey PRIMARY KEY (id);


--
-- Name: app_workforce_operation_reviews app_workforce_operation_reviews_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_reviews
    ADD CONSTRAINT app_workforce_operation_reviews_request_id_key UNIQUE (request_id);


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_exact_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_scope_assignments
    ADD CONSTRAINT app_workforce_scope_assignments_exact_key UNIQUE (id, workforce_identity_id, capability_code, case_id, location_id);


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_identity_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_scope_assignments
    ADD CONSTRAINT app_workforce_scope_assignments_identity_code_key UNIQUE (id, workforce_identity_id, capability_code);


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_scope_assignments
    ADD CONSTRAINT app_workforce_scope_assignments_pkey PRIMARY KEY (id);


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_scope_assignments
    ADD CONSTRAINT app_workforce_scope_assignments_request_id_key UNIQUE (request_id);


--
-- Name: app_audit_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_audit_events_created_at_idx ON public.app_audit_events USING btree (created_at DESC);


--
-- Name: app_audit_events_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_audit_events_customer_id_idx ON public.app_audit_events USING btree (customer_id);


--
-- Name: app_audit_events_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_audit_events_dossier_id_idx ON public.app_audit_events USING btree (dossier_id);


--
-- Name: app_audit_events_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_audit_events_event_type_idx ON public.app_audit_events USING btree (event_type);


--
-- Name: app_audit_events_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_audit_events_request_id_idx ON public.app_audit_events USING btree (request_id) WHERE (request_id IS NOT NULL);


--
-- Name: app_case_lifecycle_events_case_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_lifecycle_events_case_event_idx ON public.app_case_lifecycle_events USING btree (case_id, event_at);


--
-- Name: app_case_lifecycle_events_initial_promotion_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_case_lifecycle_events_initial_promotion_uidx ON public.app_case_lifecycle_events USING btree (promotion_id) WHERE (promotion_id IS NOT NULL);


--
-- Name: app_case_location_relations_case_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_location_relations_case_effective_idx ON public.app_case_location_relations USING btree (case_id, effective_at);


--
-- Name: app_case_location_relations_chain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_location_relations_chain_idx ON public.app_case_location_relations USING btree (relation_id, effective_at);


--
-- Name: app_case_location_relations_location_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_location_relations_location_effective_idx ON public.app_case_location_relations USING btree (location_id, effective_at);


--
-- Name: app_case_location_relations_pair_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_location_relations_pair_effective_idx ON public.app_case_location_relations USING btree (case_id, location_id, effective_at);


--
-- Name: app_case_location_relations_root_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_case_location_relations_root_uidx ON public.app_case_location_relations USING btree (relation_id) WHERE (supersedes_relation_event_id IS NULL);


--
-- Name: app_case_location_relations_successor_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_case_location_relations_successor_uidx ON public.app_case_location_relations USING btree (supersedes_relation_event_id) WHERE (supersedes_relation_event_id IS NOT NULL);


--
-- Name: app_case_party_roles_asserted_service_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_party_roles_asserted_service_recipient_idx ON public.app_case_party_roles USING btree (case_id, party_id, person_profile_version_id, organization_profile_version_id) WHERE ((role_type = 'service_recipient'::text) AND (claim_status = 'asserted'::text));


--
-- Name: app_case_party_roles_case_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_party_roles_case_id_idx ON public.app_case_party_roles USING btree (case_id);


--
-- Name: app_case_party_roles_direct_successor_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_case_party_roles_direct_successor_uidx ON public.app_case_party_roles USING btree (supersedes_id) WHERE (supersedes_id IS NOT NULL);


--
-- Name: app_case_party_roles_operational_overlap_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_party_roles_operational_overlap_idx ON public.app_case_party_roles USING btree (case_id, role_type, party_id, valid_from, valid_to) WHERE (claim_status = 'case_confirmed'::text);


--
-- Name: app_case_party_roles_organization_profile_version_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_party_roles_organization_profile_version_id_idx ON public.app_case_party_roles USING btree (organization_profile_version_id) WHERE (organization_profile_version_id IS NOT NULL);


--
-- Name: app_case_party_roles_party_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_party_roles_party_id_idx ON public.app_case_party_roles USING btree (party_id);


--
-- Name: app_case_party_roles_person_profile_version_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_party_roles_person_profile_version_id_idx ON public.app_case_party_roles USING btree (person_profile_version_id) WHERE (person_profile_version_id IS NOT NULL);


--
-- Name: app_case_party_roles_role_claim_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_case_party_roles_role_claim_id_idx ON public.app_case_party_roles USING btree (role_claim_id);


--
-- Name: app_case_party_roles_root_claim_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_case_party_roles_root_claim_uidx ON public.app_case_party_roles USING btree (role_claim_id) WHERE (supersedes_id IS NULL);


--
-- Name: app_cases_app_customer_dossier_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_cases_app_customer_dossier_source_uidx ON public.app_cases USING btree (source_class, source_ref) WHERE (source_class = 'app_customer_dossier'::text);


--
-- Name: app_cases_case_reference_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_cases_case_reference_uidx ON public.app_cases USING btree (case_reference);


--
-- Name: app_cases_signed_signup_intake_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_cases_signed_signup_intake_source_uidx ON public.app_cases USING btree (source_class, source_ref) WHERE (source_class = 'signed_signup_intake'::text);


--
-- Name: app_chargers_case_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_chargers_case_id_idx ON public.app_chargers USING btree (case_id);


--
-- Name: app_chargers_location_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_chargers_location_id_idx ON public.app_chargers USING btree (location_id);


--
-- Name: app_connection_declaration_sources_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connection_declaration_sources_customer_id_idx ON public.app_connection_declaration_sources USING btree (customer_id);


--
-- Name: app_connection_declaration_sources_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connection_declaration_sources_dossier_id_idx ON public.app_connection_declaration_sources USING btree (dossier_id);


--
-- Name: app_connection_declaration_sources_ean_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connection_declaration_sources_ean_idx ON public.app_connection_declaration_sources USING btree (ean_normalized);


--
-- Name: app_connection_ownership_periods_connection_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connection_ownership_periods_connection_period_idx ON public.app_connection_ownership_periods USING btree (connection_id, valid_from, valid_to);


--
-- Name: app_connection_ownership_periods_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connection_ownership_periods_customer_id_idx ON public.app_connection_ownership_periods USING btree (customer_id);


--
-- Name: app_connection_ownership_periods_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connection_ownership_periods_dossier_id_idx ON public.app_connection_ownership_periods USING btree (dossier_id);


--
-- Name: app_connection_ownership_periods_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connection_ownership_periods_status_idx ON public.app_connection_ownership_periods USING btree (claim_status);


--
-- Name: app_connection_periods_connection_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connection_periods_connection_period_idx ON public.app_connection_periods USING btree (connection_id, valid_from, valid_to);


--
-- Name: app_connection_periods_location_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connection_periods_location_id_idx ON public.app_connection_periods USING btree (location_id);


--
-- Name: app_connection_periods_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connection_periods_status_idx ON public.app_connection_periods USING btree (status);


--
-- Name: app_connections_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connections_customer_id_idx ON public.app_connections USING btree (customer_id);


--
-- Name: app_connections_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connections_dossier_id_idx ON public.app_connections USING btree (dossier_id);


--
-- Name: app_connections_ean_active_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_connections_ean_active_uidx ON public.app_connections USING btree (ean_normalized) WHERE (status <> ALL (ARRAY['rejected'::text, 'superseded'::text]));


--
-- Name: app_connections_location_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connections_location_id_idx ON public.app_connections USING btree (location_id);


--
-- Name: app_connections_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_connections_type_status_idx ON public.app_connections USING btree (connection_type, status);


--
-- Name: app_customer_access_grants_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customer_access_grants_case_idx ON public.app_customer_access_grants USING btree (granted_case_id) WHERE (granted_case_id IS NOT NULL);


--
-- Name: app_customer_access_grants_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customer_access_grants_customer_idx ON public.app_customer_access_grants USING btree (customer_id, auth_user_id);


--
-- Name: app_customer_dossiers_account_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customer_dossiers_account_type_idx ON public.app_customer_dossiers USING btree (account_type);


--
-- Name: app_customer_dossiers_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customer_dossiers_customer_id_idx ON public.app_customer_dossiers USING btree (customer_id);


--
-- Name: app_customer_dossiers_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customer_dossiers_status_idx ON public.app_customer_dossiers USING btree (status);


--
-- Name: app_customer_identities_active_auth_user_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_customer_identities_active_auth_user_id_uidx ON public.app_customer_identities USING btree (auth_user_id) WHERE ((auth_user_id IS NOT NULL) AND (status = 'active'::text));


--
-- Name: app_customer_identities_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customer_identities_customer_id_idx ON public.app_customer_identities USING btree (customer_id);


--
-- Name: app_customer_identities_email_normalized_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customer_identities_email_normalized_idx ON public.app_customer_identities USING btree (email_normalized);


--
-- Name: app_customer_party_relationships_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customer_party_relationships_customer_id_idx ON public.app_customer_party_relationships USING btree (customer_id);


--
-- Name: app_customer_party_relationships_party_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customer_party_relationships_party_id_idx ON public.app_customer_party_relationships USING btree (party_id);


--
-- Name: app_customer_party_relationships_scope_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customer_party_relationships_scope_period_idx ON public.app_customer_party_relationships USING btree (customer_id, party_id, relationship_role, valid_from, valid_to);


--
-- Name: app_customer_party_relationships_supersedes_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_customer_party_relationships_supersedes_uidx ON public.app_customer_party_relationships USING btree (supersedes_relationship_id) WHERE (supersedes_relationship_id IS NOT NULL);


--
-- Name: app_customers_primary_email_normalized_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customers_primary_email_normalized_idx ON public.app_customers USING btree (primary_email_normalized) WHERE (primary_email_normalized IS NOT NULL);


--
-- Name: app_customers_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_customers_status_idx ON public.app_customers USING btree (status);


--
-- Name: app_dossier_chargers_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_chargers_dossier_id_idx ON public.app_dossier_chargers USING btree (dossier_id);


--
-- Name: app_dossier_chargers_location_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_chargers_location_id_idx ON public.app_dossier_chargers USING btree (location_id);


--
-- Name: app_dossier_chargers_mid_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_chargers_mid_number_idx ON public.app_dossier_chargers USING btree (mid_number) WHERE (mid_number IS NOT NULL);


--
-- Name: app_dossier_chargers_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_chargers_status_idx ON public.app_dossier_chargers USING btree (status);


--
-- Name: app_dossier_document_files_confirmed_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_files_confirmed_request_id_idx ON public.app_dossier_document_files USING btree (confirmed_request_id) WHERE (confirmed_request_id IS NOT NULL);


--
-- Name: app_dossier_document_files_document_slot_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_files_document_slot_id_idx ON public.app_dossier_document_files USING btree (document_slot_id);


--
-- Name: app_dossier_document_files_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_files_dossier_id_idx ON public.app_dossier_document_files USING btree (dossier_id);


--
-- Name: app_dossier_document_files_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_files_expires_at_idx ON public.app_dossier_document_files USING btree (expires_at);


--
-- Name: app_dossier_document_files_issued_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_files_issued_request_id_idx ON public.app_dossier_document_files USING btree (issued_request_id);


--
-- Name: app_dossier_document_files_server_sha256_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_files_server_sha256_idx ON public.app_dossier_document_files USING btree (server_sha256) WHERE (server_sha256 IS NOT NULL);


--
-- Name: app_dossier_document_files_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_files_status_idx ON public.app_dossier_document_files USING btree (status);


--
-- Name: app_dossier_document_slots_charger_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_slots_charger_id_idx ON public.app_dossier_document_slots USING btree (charger_id);


--
-- Name: app_dossier_document_slots_current_version_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_slots_current_version_id_idx ON public.app_dossier_document_slots USING btree (current_version_id);


--
-- Name: app_dossier_document_slots_document_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_slots_document_type_idx ON public.app_dossier_document_slots USING btree (document_type);


--
-- Name: app_dossier_document_slots_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_slots_dossier_id_idx ON public.app_dossier_document_slots USING btree (dossier_id);


--
-- Name: app_dossier_document_slots_location_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_slots_location_id_idx ON public.app_dossier_document_slots USING btree (location_id);


--
-- Name: app_dossier_document_slots_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_slots_status_idx ON public.app_dossier_document_slots USING btree (status);


--
-- Name: app_dossier_document_versions_confirmed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_versions_confirmed_at_idx ON public.app_dossier_document_versions USING btree (confirmed_at DESC);


--
-- Name: app_dossier_document_versions_current_slot_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_dossier_document_versions_current_slot_uidx ON public.app_dossier_document_versions USING btree (document_slot_id) WHERE (status = 'current'::text);


--
-- Name: app_dossier_document_versions_document_slot_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_versions_document_slot_id_idx ON public.app_dossier_document_versions USING btree (document_slot_id);


--
-- Name: app_dossier_document_versions_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_versions_dossier_id_idx ON public.app_dossier_document_versions USING btree (dossier_id);


--
-- Name: app_dossier_document_versions_replaced_by_version_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_versions_replaced_by_version_id_idx ON public.app_dossier_document_versions USING btree (replaced_by_version_id);


--
-- Name: app_dossier_document_versions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_document_versions_status_idx ON public.app_dossier_document_versions USING btree (status);


--
-- Name: app_dossier_legal_acceptances_acceptance_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_legal_acceptances_acceptance_type_idx ON public.app_dossier_legal_acceptances USING btree (acceptance_type);


--
-- Name: app_dossier_legal_acceptances_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_legal_acceptances_customer_id_idx ON public.app_dossier_legal_acceptances USING btree (customer_id);


--
-- Name: app_dossier_legal_acceptances_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_legal_acceptances_dossier_id_idx ON public.app_dossier_legal_acceptances USING btree (dossier_id);


--
-- Name: app_dossier_legal_acceptances_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_legal_acceptances_status_idx ON public.app_dossier_legal_acceptances USING btree (status);


--
-- Name: app_dossier_locations_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_locations_dossier_id_idx ON public.app_dossier_locations USING btree (dossier_id);


--
-- Name: app_dossier_locations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_dossier_locations_status_idx ON public.app_dossier_locations USING btree (status);


--
-- Name: app_evidence_files_case_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_evidence_files_case_id_idx ON public.app_evidence_files USING btree (case_id);


--
-- Name: app_evidence_versions_file_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_evidence_versions_file_id_idx ON public.app_evidence_versions USING btree (evidence_file_id);


--
-- Name: app_idempotency_keys_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_idempotency_keys_created_at_idx ON public.app_idempotency_keys USING btree (created_at DESC);


--
-- Name: app_idempotency_keys_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_idempotency_keys_expires_at_idx ON public.app_idempotency_keys USING btree (expires_at);


--
-- Name: app_intake_audit_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_intake_audit_events_created_at_idx ON public.app_intake_audit_events USING btree (created_at DESC);


--
-- Name: app_intake_audit_events_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_intake_audit_events_event_type_idx ON public.app_intake_audit_events USING btree (event_type);


--
-- Name: app_intake_audit_events_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_intake_audit_events_request_id_idx ON public.app_intake_audit_events USING btree (request_id) WHERE (request_id IS NOT NULL);


--
-- Name: app_location_address_observations_location_recorded_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_location_address_observations_location_recorded_idx ON public.app_location_address_observations USING btree (location_id, recorded_at);


--
-- Name: app_location_versions_direct_successor_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_location_versions_direct_successor_uidx ON public.app_location_versions USING btree (supersedes_version_id) WHERE (supersedes_version_id IS NOT NULL);


--
-- Name: app_location_versions_location_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_location_versions_location_period_idx ON public.app_location_versions USING btree (location_id, valid_from, valid_to);


--
-- Name: app_parties_authenticated_customer_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_parties_authenticated_customer_source_uidx ON public.app_parties USING btree (source_reference_id) WHERE ((source_type = 'authenticated_customer_party_root'::text) AND (source_reference_type = 'app_customer'::text));


--
-- Name: app_parties_party_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_parties_party_kind_idx ON public.app_parties USING btree (party_kind);


--
-- Name: app_party_declaration_sources_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_party_declaration_sources_customer_id_idx ON public.app_party_declaration_sources USING btree (customer_id);


--
-- Name: app_party_declaration_sources_declared_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_party_declaration_sources_declared_at_idx ON public.app_party_declaration_sources USING btree (declared_at);


--
-- Name: app_party_organization_versions_classification_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_party_organization_versions_classification_idx ON public.app_party_organization_versions USING btree (organization_classification);


--
-- Name: app_party_organization_versions_declared_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_party_organization_versions_declared_source_uidx ON public.app_party_organization_versions USING btree (source_reference_id) WHERE ((source_type = 'signup_applicant_declaration'::text) AND (source_reference_type = 'app_party_declaration_sources'::text));


--
-- Name: app_party_organization_versions_party_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_party_organization_versions_party_period_idx ON public.app_party_organization_versions USING btree (party_id, valid_from, valid_to);


--
-- Name: app_party_organization_versions_supersedes_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_party_organization_versions_supersedes_uidx ON public.app_party_organization_versions USING btree (supersedes_organization_version_id) WHERE (supersedes_organization_version_id IS NOT NULL);


--
-- Name: app_party_organization_versions_trade_register_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_party_organization_versions_trade_register_number_idx ON public.app_party_organization_versions USING btree (trade_register_number) WHERE (trade_register_number IS NOT NULL);


--
-- Name: app_party_person_versions_declared_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_party_person_versions_declared_source_uidx ON public.app_party_person_versions USING btree (source_reference_id) WHERE ((source_type = 'signup_applicant_declaration'::text) AND (source_reference_type = 'app_party_declaration_sources'::text));


--
-- Name: app_party_person_versions_party_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_party_person_versions_party_period_idx ON public.app_party_person_versions USING btree (party_id, valid_from, valid_to);


--
-- Name: app_party_person_versions_supersedes_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_party_person_versions_supersedes_uidx ON public.app_party_person_versions USING btree (supersedes_person_version_id) WHERE (supersedes_person_version_id IS NOT NULL);


--
-- Name: app_signup_authenticated_intake_provenance_auth_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_authenticated_intake_provenance_auth_user_idx ON public.app_signup_authenticated_intake_provenance USING btree (auth_user_id, created_at);


--
-- Name: app_signup_intake_capabilities_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_intake_capabilities_expires_at_idx ON public.app_signup_intake_capabilities USING btree (expires_at);


--
-- Name: app_signup_intake_capabilities_intake_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_intake_capabilities_intake_id_idx ON public.app_signup_intake_capabilities USING btree (intake_id);


--
-- Name: app_signup_intake_capabilities_one_manage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_signup_intake_capabilities_one_manage_idx ON public.app_signup_intake_capabilities USING btree (intake_id) WHERE (capability_type = 'intake_manage'::text);


--
-- Name: app_signup_intake_files_intake_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_intake_files_intake_id_idx ON public.app_signup_intake_files USING btree (intake_id);


--
-- Name: app_signup_intake_files_one_current_revision_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_signup_intake_files_one_current_revision_idx ON public.app_signup_intake_files USING btree (intake_id, client_slot_id) WHERE (status <> ALL (ARRAY['superseded'::text, 'promoted'::text, 'rejected'::text, 'expired'::text]));


--
-- Name: app_signup_intake_files_promoted_document_file_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_intake_files_promoted_document_file_id_idx ON public.app_signup_intake_files USING btree (promoted_document_file_id) WHERE (promoted_document_file_id IS NOT NULL);


--
-- Name: app_signup_intake_files_status_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_intake_files_status_expires_at_idx ON public.app_signup_intake_files USING btree (status, expires_at);


--
-- Name: app_signup_intake_files_supersedes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_intake_files_supersedes_idx ON public.app_signup_intake_files USING btree (supersedes_intake_file_id) WHERE (supersedes_intake_file_id IS NOT NULL);


--
-- Name: app_signup_intakes_email_normalized_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_intakes_email_normalized_idx ON public.app_signup_intakes USING btree (email_normalized);


--
-- Name: app_signup_intakes_promotion_case_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_intakes_promotion_case_id_idx ON public.app_signup_intakes USING btree (promotion_case_id) WHERE (promotion_case_id IS NOT NULL);


--
-- Name: app_signup_intakes_promotion_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_intakes_promotion_dossier_id_idx ON public.app_signup_intakes USING btree (promotion_dossier_id) WHERE (promotion_dossier_id IS NOT NULL);


--
-- Name: app_signup_intakes_status_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_intakes_status_expires_at_idx ON public.app_signup_intakes USING btree (status, expires_at);


--
-- Name: app_signup_promotions_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_promotions_customer_id_idx ON public.app_signup_promotions USING btree (customer_id);


--
-- Name: app_signup_promotions_service_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_promotions_service_recipient_idx ON public.app_signup_promotions USING btree (service_recipient_party_id);


--
-- Name: app_signup_signing_challenges_channel_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_signing_challenges_channel_created_idx ON public.app_signup_signing_challenges USING btree (channel_reference_sha256, created_at DESC);


--
-- Name: app_signup_signing_challenges_intake_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_signup_signing_challenges_intake_created_idx ON public.app_signup_signing_challenges USING btree (intake_id, created_at DESC);


--
-- Name: app_signup_signing_challenges_one_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_signup_signing_challenges_one_active_idx ON public.app_signup_signing_challenges USING btree (intake_id) WHERE ((consumed_at IS NULL) AND (replaced_at IS NULL) AND (delivery_status = ANY (ARRAY['pending'::text, 'delivered'::text])));


--
-- Name: app_workforce_capability_assignments_chain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_capability_assignments_chain_idx ON public.app_workforce_capability_assignments USING btree (assignment_id, effective_at);


--
-- Name: app_workforce_capability_assignments_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_capability_assignments_expiry_idx ON public.app_workforce_capability_assignments USING btree (valid_until) WHERE (valid_until IS NOT NULL);


--
-- Name: app_workforce_capability_assignments_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_capability_assignments_lookup_idx ON public.app_workforce_capability_assignments USING btree (workforce_identity_id, capability_code, effective_at);


--
-- Name: app_workforce_capability_assignments_root_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_workforce_capability_assignments_root_uidx ON public.app_workforce_capability_assignments USING btree (assignment_id) WHERE (supersedes_assignment_event_id IS NULL);


--
-- Name: app_workforce_capability_assignments_successor_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_workforce_capability_assignments_successor_uidx ON public.app_workforce_capability_assignments USING btree (supersedes_assignment_event_id) WHERE (supersedes_assignment_event_id IS NOT NULL);


--
-- Name: app_workforce_identities_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_identities_created_at_idx ON public.app_workforce_identities USING btree (created_at);


--
-- Name: app_workforce_identity_states_identity_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_identity_states_identity_effective_idx ON public.app_workforce_identity_states USING btree (workforce_identity_id, effective_at DESC);


--
-- Name: app_workforce_identity_states_successor_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_workforce_identity_states_successor_uidx ON public.app_workforce_identity_states USING btree (supersedes_state_id) WHERE (supersedes_state_id IS NOT NULL);


--
-- Name: app_workforce_operation_requests_maker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_operation_requests_maker_idx ON public.app_workforce_operation_requests USING btree (maker_workforce_identity_id, created_at);


--
-- Name: app_workforce_operation_requests_payload_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_operation_requests_payload_idx ON public.app_workforce_operation_requests USING btree (payload_hash);


--
-- Name: app_workforce_operation_requests_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_operation_requests_pending_idx ON public.app_workforce_operation_requests USING btree (case_id, location_id, created_at) WHERE (execution_status = 'pending'::text);


--
-- Name: app_workforce_operation_reviews_checker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_operation_reviews_checker_idx ON public.app_workforce_operation_reviews USING btree (checker_workforce_identity_id, reviewed_at);


--
-- Name: app_workforce_operation_reviews_outcome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_operation_reviews_outcome_idx ON public.app_workforce_operation_reviews USING btree (outcome, reviewed_at);


--
-- Name: app_workforce_scope_assignments_chain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_scope_assignments_chain_idx ON public.app_workforce_scope_assignments USING btree (scope_assignment_id, effective_at);


--
-- Name: app_workforce_scope_assignments_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_scope_assignments_lookup_idx ON public.app_workforce_scope_assignments USING btree (workforce_identity_id, capability_code, case_id, location_id, effective_at);


--
-- Name: app_workforce_scope_assignments_relation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_workforce_scope_assignments_relation_idx ON public.app_workforce_scope_assignments USING btree (case_location_relation_id) WHERE (case_location_relation_id IS NOT NULL);


--
-- Name: app_workforce_scope_assignments_root_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_workforce_scope_assignments_root_uidx ON public.app_workforce_scope_assignments USING btree (scope_assignment_id) WHERE (supersedes_scope_event_id IS NULL);


--
-- Name: app_workforce_scope_assignments_successor_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_workforce_scope_assignments_successor_uidx ON public.app_workforce_scope_assignments USING btree (supersedes_scope_event_id) WHERE (supersedes_scope_event_id IS NOT NULL);


--
-- Name: app_case_location_relations app_case_location_relations_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_case_location_relations_immutable BEFORE DELETE OR UPDATE ON public.app_case_location_relations FOR EACH ROW EXECUTE FUNCTION public.app_wp2b_i_immutable_guard();


--
-- Name: app_case_location_relations app_case_location_relations_insert_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_case_location_relations_insert_guard BEFORE INSERT ON public.app_case_location_relations FOR EACH ROW EXECUTE FUNCTION public.app_case_location_relations_insert_guard();


--
-- Name: app_location_address_observations app_location_address_observations_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_location_address_observations_immutable BEFORE DELETE OR UPDATE ON public.app_location_address_observations FOR EACH ROW EXECUTE FUNCTION public.app_wp2b_i_immutable_guard();


--
-- Name: app_location_versions app_location_versions_deferred_guard_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER app_location_versions_deferred_guard_trigger AFTER INSERT ON public.app_location_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.app_location_versions_deferred_guard();


--
-- Name: app_location_versions app_location_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_location_versions_immutable BEFORE DELETE OR UPDATE ON public.app_location_versions FOR EACH ROW EXECUTE FUNCTION public.app_wp2b_i_immutable_guard();


--
-- Name: app_locations app_locations_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_locations_immutable BEFORE DELETE OR UPDATE ON public.app_locations FOR EACH ROW EXECUTE FUNCTION public.app_wp2b_i_immutable_guard();


--
-- Name: app_workforce_capability_assignments app_workforce_capability_assignments_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_workforce_capability_assignments_immutable BEFORE DELETE OR UPDATE ON public.app_workforce_capability_assignments FOR EACH ROW EXECUTE FUNCTION public.app_wp2b_i_immutable_guard();


--
-- Name: app_workforce_capability_assignments app_workforce_capability_assignments_insert_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_workforce_capability_assignments_insert_guard BEFORE INSERT ON public.app_workforce_capability_assignments FOR EACH ROW EXECUTE FUNCTION public.app_workforce_capability_assignments_insert_guard();


--
-- Name: app_workforce_identities app_workforce_identities_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_workforce_identities_immutable BEFORE DELETE OR UPDATE ON public.app_workforce_identities FOR EACH ROW EXECUTE FUNCTION public.app_wp2b_i_immutable_guard();


--
-- Name: app_workforce_identities app_workforce_identity_initial_state_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER app_workforce_identity_initial_state_guard AFTER INSERT ON public.app_workforce_identities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.app_workforce_identity_requires_initial_state();


--
-- Name: app_workforce_identity_states app_workforce_identity_states_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_workforce_identity_states_immutable BEFORE DELETE OR UPDATE ON public.app_workforce_identity_states FOR EACH ROW EXECUTE FUNCTION public.app_wp2b_i_immutable_guard();


--
-- Name: app_workforce_identity_states app_workforce_identity_states_insert_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_workforce_identity_states_insert_guard BEFORE INSERT ON public.app_workforce_identity_states FOR EACH ROW EXECUTE FUNCTION public.app_workforce_identity_states_insert_guard();


--
-- Name: app_workforce_operation_requests app_workforce_operation_requests_insert_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_workforce_operation_requests_insert_guard BEFORE INSERT ON public.app_workforce_operation_requests FOR EACH ROW EXECUTE FUNCTION public.app_workforce_operation_requests_insert_guard();


--
-- Name: app_workforce_operation_requests app_workforce_operation_requests_update_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_workforce_operation_requests_update_guard BEFORE DELETE OR UPDATE ON public.app_workforce_operation_requests FOR EACH ROW EXECUTE FUNCTION public.app_workforce_operation_requests_update_guard();


--
-- Name: app_workforce_operation_reviews app_workforce_operation_reviews_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_workforce_operation_reviews_immutable BEFORE DELETE OR UPDATE ON public.app_workforce_operation_reviews FOR EACH ROW EXECUTE FUNCTION public.app_wp2b_i_immutable_guard();


--
-- Name: app_workforce_operation_reviews app_workforce_operation_reviews_insert_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_workforce_operation_reviews_insert_guard BEFORE INSERT ON public.app_workforce_operation_reviews FOR EACH ROW EXECUTE FUNCTION public.app_workforce_operation_reviews_insert_guard();


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_workforce_scope_assignments_immutable BEFORE DELETE OR UPDATE ON public.app_workforce_scope_assignments FOR EACH ROW EXECUTE FUNCTION public.app_wp2b_i_immutable_guard();


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_insert_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_workforce_scope_assignments_insert_guard BEFORE INSERT ON public.app_workforce_scope_assignments FOR EACH ROW EXECUTE FUNCTION public.app_workforce_scope_assignments_insert_guard();


--
-- Name: app_case_party_roles trg_app_asserted_service_recipient_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_asserted_service_recipient_guard BEFORE INSERT ON public.app_case_party_roles FOR EACH ROW EXECUTE FUNCTION public.app_asserted_service_recipient_guard();


--
-- Name: app_case_lifecycle_events trg_app_case_lifecycle_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_case_lifecycle_events_immutable BEFORE DELETE OR UPDATE ON public.app_case_lifecycle_events FOR EACH ROW EXECUTE FUNCTION public.app_signup_promotion_immutable_guard();


--
-- Name: app_case_party_roles trg_app_case_party_roles_deferred_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_app_case_party_roles_deferred_guard AFTER INSERT ON public.app_case_party_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.app_case_party_roles_deferred_guard();


--
-- Name: app_case_party_roles trg_app_case_party_roles_immutable_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_case_party_roles_immutable_guard BEFORE DELETE OR UPDATE ON public.app_case_party_roles FOR EACH ROW EXECUTE FUNCTION public.app_wp2b_i_immutable_guard();


--
-- Name: app_case_party_roles trg_app_case_party_roles_insert_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_case_party_roles_insert_guard BEFORE INSERT ON public.app_case_party_roles FOR EACH ROW EXECUTE FUNCTION public.app_case_party_roles_insert_guard();


--
-- Name: app_cases trg_app_cases_immutable_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_cases_immutable_guard BEFORE DELETE OR UPDATE ON public.app_cases FOR EACH ROW EXECUTE FUNCTION public.app_wp2b_i_immutable_guard();


--
-- Name: app_charger_declarations trg_app_charger_declarations_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_charger_declarations_immutable BEFORE DELETE OR UPDATE ON public.app_charger_declarations FOR EACH ROW EXECUTE FUNCTION public.app_signup_promotion_immutable_guard();


--
-- Name: app_chargers trg_app_chargers_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_chargers_immutable BEFORE DELETE OR UPDATE ON public.app_chargers FOR EACH ROW EXECUTE FUNCTION public.app_signup_promotion_immutable_guard();


--
-- Name: app_connection_declaration_sources trg_app_connection_declaration_sources_boundary_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connection_declaration_sources_boundary_guard BEFORE INSERT ON public.app_connection_declaration_sources FOR EACH ROW EXECUTE FUNCTION public.app_connection_declaration_sources_boundary_guard();


--
-- Name: app_connection_declaration_sources trg_app_connection_declaration_sources_immutable_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connection_declaration_sources_immutable_guard BEFORE DELETE OR UPDATE ON public.app_connection_declaration_sources FOR EACH ROW EXECUTE FUNCTION public.app_connection_declaration_sources_immutable_guard();


--
-- Name: app_connection_declaration_sources trg_app_connection_declaration_sources_truncate_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connection_declaration_sources_truncate_guard BEFORE TRUNCATE ON public.app_connection_declaration_sources FOR EACH STATEMENT EXECUTE FUNCTION public.app_connection_declaration_sources_immutable_guard();


--
-- Name: app_connection_ownership_periods trg_app_connection_ownership_periods_boundary_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connection_ownership_periods_boundary_guard BEFORE INSERT OR UPDATE ON public.app_connection_ownership_periods FOR EACH ROW EXECUTE FUNCTION public.app_connection_ownership_periods_boundary_guard();


--
-- Name: app_connection_ownership_periods trg_app_connection_ownership_periods_overlap_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connection_ownership_periods_overlap_guard BEFORE INSERT OR UPDATE ON public.app_connection_ownership_periods FOR EACH ROW EXECUTE FUNCTION public.app_connection_ownership_periods_overlap_guard();


--
-- Name: app_connection_ownership_periods trg_app_connection_ownership_periods_transition_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connection_ownership_periods_transition_guard BEFORE UPDATE ON public.app_connection_ownership_periods FOR EACH ROW EXECUTE FUNCTION public.app_connection_ownership_periods_transition_guard();


--
-- Name: app_connection_periods trg_app_connection_periods_boundary_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connection_periods_boundary_guard BEFORE INSERT OR UPDATE ON public.app_connection_periods FOR EACH ROW EXECUTE FUNCTION public.app_connection_periods_boundary_guard();


--
-- Name: app_connection_periods trg_app_connection_periods_overlap_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connection_periods_overlap_guard BEFORE INSERT OR UPDATE ON public.app_connection_periods FOR EACH ROW EXECUTE FUNCTION public.app_connection_periods_overlap_guard();


--
-- Name: app_connection_periods trg_app_connection_periods_transition_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connection_periods_transition_guard BEFORE UPDATE ON public.app_connection_periods FOR EACH ROW EXECUTE FUNCTION public.app_connection_periods_transition_guard();


--
-- Name: app_connections trg_app_connections_boundary_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connections_boundary_guard BEFORE INSERT OR UPDATE ON public.app_connections FOR EACH ROW EXECUTE FUNCTION public.app_connections_boundary_guard();


--
-- Name: app_connections trg_app_connections_transition_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connections_transition_guard BEFORE UPDATE ON public.app_connections FOR EACH ROW EXECUTE FUNCTION public.app_connections_transition_guard();


--
-- Name: app_connections trg_app_connections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_connections_updated_at BEFORE UPDATE ON public.app_connections FOR EACH ROW EXECUTE FUNCTION public.app_set_updated_at();


--
-- Name: app_customer_access_grants trg_app_customer_access_grants_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_customer_access_grants_immutable BEFORE DELETE OR UPDATE ON public.app_customer_access_grants FOR EACH ROW EXECUTE FUNCTION public.app_customer_access_grants_immutable_guard();


--
-- Name: app_customer_dossiers trg_app_customer_dossiers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_customer_dossiers_updated_at BEFORE UPDATE ON public.app_customer_dossiers FOR EACH ROW EXECUTE FUNCTION public.app_set_updated_at();


--
-- Name: app_customer_party_relationships trg_app_customer_party_relationships_immutable_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_customer_party_relationships_immutable_guard BEFORE DELETE OR UPDATE ON public.app_customer_party_relationships FOR EACH ROW EXECUTE FUNCTION public.app_party_history_immutable_guard();


--
-- Name: app_customer_party_relationships trg_app_customer_party_relationships_overlap_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_customer_party_relationships_overlap_guard BEFORE INSERT ON public.app_customer_party_relationships FOR EACH ROW EXECUTE FUNCTION public.app_customer_party_relationships_overlap_guard();


--
-- Name: app_customers trg_app_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_customers_updated_at BEFORE UPDATE ON public.app_customers FOR EACH ROW EXECUTE FUNCTION public.app_set_updated_at();


--
-- Name: app_dossier_chargers trg_app_dossier_chargers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_dossier_chargers_updated_at BEFORE UPDATE ON public.app_dossier_chargers FOR EACH ROW EXECUTE FUNCTION public.app_set_updated_at();


--
-- Name: app_dossier_document_files trg_app_dossier_document_files_transition_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_dossier_document_files_transition_guard BEFORE DELETE OR UPDATE ON public.app_dossier_document_files FOR EACH ROW EXECUTE FUNCTION public.app_dossier_document_files_transition_guard();


--
-- Name: app_dossier_document_files trg_app_dossier_document_files_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_dossier_document_files_updated_at BEFORE UPDATE ON public.app_dossier_document_files FOR EACH ROW EXECUTE FUNCTION public.app_set_updated_at();


--
-- Name: app_dossier_document_slots trg_app_dossier_document_slots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_dossier_document_slots_updated_at BEFORE UPDATE ON public.app_dossier_document_slots FOR EACH ROW EXECUTE FUNCTION public.app_set_updated_at();


--
-- Name: app_dossier_document_versions trg_app_dossier_document_versions_transition_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_dossier_document_versions_transition_guard BEFORE DELETE OR UPDATE ON public.app_dossier_document_versions FOR EACH ROW EXECUTE FUNCTION public.app_dossier_document_versions_transition_guard();


--
-- Name: app_dossier_legal_acceptances trg_app_dossier_legal_acceptances_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_dossier_legal_acceptances_updated_at BEFORE UPDATE ON public.app_dossier_legal_acceptances FOR EACH ROW EXECUTE FUNCTION public.app_set_updated_at();


--
-- Name: app_dossier_locations trg_app_dossier_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_dossier_locations_updated_at BEFORE UPDATE ON public.app_dossier_locations FOR EACH ROW EXECUTE FUNCTION public.app_set_updated_at();


--
-- Name: app_evidence_declaration_contexts trg_app_evidence_declaration_contexts_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_evidence_declaration_contexts_immutable BEFORE DELETE OR UPDATE ON public.app_evidence_declaration_contexts FOR EACH ROW EXECUTE FUNCTION public.app_signup_promotion_immutable_guard();


--
-- Name: app_evidence_files trg_app_evidence_files_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_evidence_files_immutable BEFORE DELETE OR UPDATE ON public.app_evidence_files FOR EACH ROW EXECUTE FUNCTION public.app_signup_promotion_immutable_guard();


--
-- Name: app_evidence_versions trg_app_evidence_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_evidence_versions_immutable BEFORE DELETE OR UPDATE ON public.app_evidence_versions FOR EACH ROW EXECUTE FUNCTION public.app_signup_promotion_immutable_guard();


--
-- Name: app_parties trg_app_parties_immutable_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_parties_immutable_guard BEFORE DELETE OR UPDATE ON public.app_parties FOR EACH ROW EXECUTE FUNCTION public.app_parties_immutable_guard();


--
-- Name: app_party_declaration_sources trg_app_party_declaration_sources_immutable_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_party_declaration_sources_immutable_guard BEFORE DELETE OR UPDATE ON public.app_party_declaration_sources FOR EACH ROW EXECUTE FUNCTION public.app_party_declaration_sources_immutable_guard();


--
-- Name: app_party_declaration_sources trg_app_party_declaration_sources_truncate_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_party_declaration_sources_truncate_guard BEFORE TRUNCATE ON public.app_party_declaration_sources FOR EACH STATEMENT EXECUTE FUNCTION public.app_party_declaration_sources_immutable_guard();


--
-- Name: app_party_organization_versions trg_app_party_organization_versions_boundary_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_party_organization_versions_boundary_guard BEFORE INSERT ON public.app_party_organization_versions FOR EACH ROW EXECUTE FUNCTION public.app_party_organization_versions_boundary_guard();


--
-- Name: app_party_organization_versions trg_app_party_organization_versions_immutable_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_party_organization_versions_immutable_guard BEFORE DELETE OR UPDATE ON public.app_party_organization_versions FOR EACH ROW EXECUTE FUNCTION public.app_party_history_immutable_guard();


--
-- Name: app_party_organization_versions trg_app_party_organization_versions_overlap_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_party_organization_versions_overlap_guard BEFORE INSERT ON public.app_party_organization_versions FOR EACH ROW EXECUTE FUNCTION public.app_party_organization_versions_overlap_guard();


--
-- Name: app_party_person_versions trg_app_party_person_versions_boundary_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_party_person_versions_boundary_guard BEFORE INSERT ON public.app_party_person_versions FOR EACH ROW EXECUTE FUNCTION public.app_party_person_versions_boundary_guard();


--
-- Name: app_party_person_versions trg_app_party_person_versions_immutable_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_party_person_versions_immutable_guard BEFORE DELETE OR UPDATE ON public.app_party_person_versions FOR EACH ROW EXECUTE FUNCTION public.app_party_history_immutable_guard();


--
-- Name: app_party_person_versions trg_app_party_person_versions_overlap_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_party_person_versions_overlap_guard BEFORE INSERT ON public.app_party_person_versions FOR EACH ROW EXECUTE FUNCTION public.app_party_person_versions_overlap_guard();


--
-- Name: app_signup_intakes trg_app_signed_signup_declared_data; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_signed_signup_declared_data AFTER UPDATE OF status ON public.app_signup_intakes FOR EACH ROW EXECUTE FUNCTION public.app_signed_signup_declared_data_trigger();


--
-- Name: app_signup_authenticated_intake_provenance trg_app_signup_authenticated_intake_provenance_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_signup_authenticated_intake_provenance_immutable BEFORE DELETE OR UPDATE ON public.app_signup_authenticated_intake_provenance FOR EACH ROW EXECUTE FUNCTION public.app_signup_authenticated_intake_provenance_immutable_guard();


--
-- Name: app_signup_intake_capabilities trg_app_signup_intake_capabilities_transition_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_signup_intake_capabilities_transition_guard BEFORE UPDATE ON public.app_signup_intake_capabilities FOR EACH ROW EXECUTE FUNCTION public.app_signup_intake_capabilities_transition_guard();


--
-- Name: app_signup_intake_files trg_app_signup_intake_files_finalized_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_signup_intake_files_finalized_guard BEFORE INSERT OR DELETE OR UPDATE ON public.app_signup_intake_files FOR EACH ROW EXECUTE FUNCTION public.app_signup_intake_files_finalized_guard();


--
-- Name: app_signup_intake_files trg_app_signup_intake_files_transition_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_signup_intake_files_transition_guard BEFORE UPDATE ON public.app_signup_intake_files FOR EACH ROW EXECUTE FUNCTION public.app_signup_intake_files_transition_guard();


--
-- Name: app_signup_intakes trg_app_signup_intakes_transition_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_signup_intakes_transition_guard BEFORE UPDATE ON public.app_signup_intakes FOR EACH ROW EXECUTE FUNCTION public.app_signup_intakes_transition_guard();


--
-- Name: app_signup_legal_acceptances trg_app_signup_legal_acceptances_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_signup_legal_acceptances_immutable BEFORE DELETE OR UPDATE ON public.app_signup_legal_acceptances FOR EACH ROW EXECUTE FUNCTION public.app_signup_immutable_signing_record_guard();


--
-- Name: app_signup_mandates trg_app_signup_mandates_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_signup_mandates_immutable BEFORE DELETE OR UPDATE ON public.app_signup_mandates FOR EACH ROW EXECUTE FUNCTION public.app_signup_immutable_signing_record_guard();


--
-- Name: app_signup_promotions trg_app_signup_promotions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_signup_promotions_immutable BEFORE DELETE OR UPDATE ON public.app_signup_promotions FOR EACH ROW EXECUTE FUNCTION public.app_signup_promotion_immutable_guard();


--
-- Name: app_signup_signature_evidence trg_app_signup_signature_evidence_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_signup_signature_evidence_immutable BEFORE DELETE OR UPDATE ON public.app_signup_signature_evidence FOR EACH ROW EXECUTE FUNCTION public.app_signup_immutable_signing_record_guard();


--
-- Name: app_signup_signing_snapshots trg_app_signup_signing_snapshots_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_signup_signing_snapshots_immutable BEFORE DELETE OR UPDATE ON public.app_signup_signing_snapshots FOR EACH ROW EXECUTE FUNCTION public.app_signup_immutable_signing_record_guard();


--
-- Name: app_audit_events app_audit_events_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_audit_events
    ADD CONSTRAINT app_audit_events_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE SET NULL;


--
-- Name: app_audit_events app_audit_events_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_audit_events
    ADD CONSTRAINT app_audit_events_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.app_customer_dossiers(id) ON DELETE SET NULL;


--
-- Name: app_case_lifecycle_events app_case_lifecycle_events_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_lifecycle_events
    ADD CONSTRAINT app_case_lifecycle_events_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.app_cases(id) ON DELETE RESTRICT;


--
-- Name: app_case_lifecycle_events app_case_lifecycle_events_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_lifecycle_events
    ADD CONSTRAINT app_case_lifecycle_events_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.app_signup_promotions(id) ON DELETE RESTRICT;


--
-- Name: app_case_location_relations app_case_location_relations_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_location_relations
    ADD CONSTRAINT app_case_location_relations_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.app_cases(id) ON DELETE RESTRICT;


--
-- Name: app_case_location_relations app_case_location_relations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_location_relations
    ADD CONSTRAINT app_case_location_relations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.app_locations(id) ON DELETE RESTRICT;


--
-- Name: app_case_location_relations app_case_location_relations_supersedes_relation_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_location_relations
    ADD CONSTRAINT app_case_location_relations_supersedes_relation_event_id_fkey FOREIGN KEY (supersedes_relation_event_id) REFERENCES public.app_case_location_relations(id) ON DELETE RESTRICT;


--
-- Name: app_case_party_roles app_case_party_roles_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_party_roles
    ADD CONSTRAINT app_case_party_roles_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.app_cases(id) ON DELETE RESTRICT;


--
-- Name: app_case_party_roles app_case_party_roles_organization_profile_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_party_roles
    ADD CONSTRAINT app_case_party_roles_organization_profile_version_id_fkey FOREIGN KEY (organization_profile_version_id) REFERENCES public.app_party_organization_versions(id) ON DELETE RESTRICT;


--
-- Name: app_case_party_roles app_case_party_roles_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_party_roles
    ADD CONSTRAINT app_case_party_roles_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.app_parties(id) ON DELETE RESTRICT;


--
-- Name: app_case_party_roles app_case_party_roles_person_profile_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_party_roles
    ADD CONSTRAINT app_case_party_roles_person_profile_version_id_fkey FOREIGN KEY (person_profile_version_id) REFERENCES public.app_party_person_versions(id) ON DELETE RESTRICT;


--
-- Name: app_case_party_roles app_case_party_roles_supersedes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_case_party_roles
    ADD CONSTRAINT app_case_party_roles_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES public.app_case_party_roles(id) ON DELETE RESTRICT;


--
-- Name: app_cases app_cases_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_cases
    ADD CONSTRAINT app_cases_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE RESTRICT;


--
-- Name: app_charger_declarations app_charger_declarations_charger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_charger_declarations
    ADD CONSTRAINT app_charger_declarations_charger_id_fkey FOREIGN KEY (charger_id) REFERENCES public.app_chargers(id) ON DELETE RESTRICT;


--
-- Name: app_charger_declarations app_charger_declarations_signing_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_charger_declarations
    ADD CONSTRAINT app_charger_declarations_signing_snapshot_id_fkey FOREIGN KEY (signing_snapshot_id) REFERENCES public.app_signup_signing_snapshots(id) ON DELETE RESTRICT;


--
-- Name: app_chargers app_chargers_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_chargers
    ADD CONSTRAINT app_chargers_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.app_cases(id) ON DELETE RESTRICT;


--
-- Name: app_chargers app_chargers_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_chargers
    ADD CONSTRAINT app_chargers_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.app_locations(id) ON DELETE RESTRICT;


--
-- Name: app_chargers app_chargers_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_chargers
    ADD CONSTRAINT app_chargers_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.app_signup_promotions(id) ON DELETE RESTRICT;


--
-- Name: app_connection_declaration_sources app_connection_declaration_sources_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_declaration_sources
    ADD CONSTRAINT app_connection_declaration_sources_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE RESTRICT;


--
-- Name: app_connection_declaration_sources app_connection_declaration_sources_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_declaration_sources
    ADD CONSTRAINT app_connection_declaration_sources_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.app_customer_dossiers(id) ON DELETE RESTRICT;


--
-- Name: app_connection_declaration_sources app_connection_declaration_sources_dossier_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_declaration_sources
    ADD CONSTRAINT app_connection_declaration_sources_dossier_location_id_fkey FOREIGN KEY (dossier_location_id) REFERENCES public.app_dossier_locations(id) ON DELETE RESTRICT;


--
-- Name: app_connection_ownership_periods app_connection_ownership_peri_supersedes_ownership_period__fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_ownership_periods
    ADD CONSTRAINT app_connection_ownership_peri_supersedes_ownership_period__fkey FOREIGN KEY (supersedes_ownership_period_id) REFERENCES public.app_connection_ownership_periods(id) ON DELETE RESTRICT;


--
-- Name: app_connection_ownership_periods app_connection_ownership_periods_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_ownership_periods
    ADD CONSTRAINT app_connection_ownership_periods_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.app_connections(id) ON DELETE RESTRICT;


--
-- Name: app_connection_ownership_periods app_connection_ownership_periods_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_ownership_periods
    ADD CONSTRAINT app_connection_ownership_periods_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE RESTRICT;


--
-- Name: app_connection_ownership_periods app_connection_ownership_periods_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_ownership_periods
    ADD CONSTRAINT app_connection_ownership_periods_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.app_customer_dossiers(id) ON DELETE RESTRICT;


--
-- Name: app_connection_periods app_connection_periods_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_periods
    ADD CONSTRAINT app_connection_periods_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.app_connections(id) ON DELETE RESTRICT;


--
-- Name: app_connection_periods app_connection_periods_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_periods
    ADD CONSTRAINT app_connection_periods_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.app_dossier_locations(id) ON DELETE RESTRICT;


--
-- Name: app_connection_periods app_connection_periods_supersedes_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connection_periods
    ADD CONSTRAINT app_connection_periods_supersedes_period_id_fkey FOREIGN KEY (supersedes_period_id) REFERENCES public.app_connection_periods(id) ON DELETE RESTRICT;


--
-- Name: app_connections app_connections_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connections
    ADD CONSTRAINT app_connections_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE RESTRICT;


--
-- Name: app_connections app_connections_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connections
    ADD CONSTRAINT app_connections_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.app_customer_dossiers(id) ON DELETE RESTRICT;


--
-- Name: app_connections app_connections_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connections
    ADD CONSTRAINT app_connections_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.app_dossier_locations(id) ON DELETE RESTRICT;


--
-- Name: app_connections app_connections_supersedes_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_connections
    ADD CONSTRAINT app_connections_supersedes_connection_id_fkey FOREIGN KEY (supersedes_connection_id) REFERENCES public.app_connections(id) ON DELETE RESTRICT;


--
-- Name: app_customer_access_grants app_customer_access_grants_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_access_grants
    ADD CONSTRAINT app_customer_access_grants_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: app_customer_access_grants app_customer_access_grants_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_access_grants
    ADD CONSTRAINT app_customer_access_grants_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE RESTRICT;


--
-- Name: app_customer_access_grants app_customer_access_grants_granted_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_access_grants
    ADD CONSTRAINT app_customer_access_grants_granted_case_id_fkey FOREIGN KEY (granted_case_id) REFERENCES public.app_cases(id) ON DELETE RESTRICT;


--
-- Name: app_customer_dossiers app_customer_dossiers_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_dossiers
    ADD CONSTRAINT app_customer_dossiers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE RESTRICT;


--
-- Name: app_customer_identities app_customer_identities_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_identities
    ADD CONSTRAINT app_customer_identities_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: app_customer_identities app_customer_identities_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_identities
    ADD CONSTRAINT app_customer_identities_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE CASCADE;


--
-- Name: app_customer_party_relationships app_customer_party_relationships_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_party_relationships
    ADD CONSTRAINT app_customer_party_relationships_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE RESTRICT;


--
-- Name: app_customer_party_relationships app_customer_party_relationships_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_party_relationships
    ADD CONSTRAINT app_customer_party_relationships_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.app_parties(id) ON DELETE RESTRICT;


--
-- Name: app_customer_party_relationships app_customer_party_relationships_supersession_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_customer_party_relationships
    ADD CONSTRAINT app_customer_party_relationships_supersession_fk FOREIGN KEY (customer_id, party_id, relationship_role, supersedes_relationship_id) REFERENCES public.app_customer_party_relationships(customer_id, party_id, relationship_role, id) ON DELETE RESTRICT;


--
-- Name: app_dossier_chargers app_dossier_chargers_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_chargers
    ADD CONSTRAINT app_dossier_chargers_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.app_customer_dossiers(id) ON DELETE CASCADE;


--
-- Name: app_dossier_chargers app_dossier_chargers_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_chargers
    ADD CONSTRAINT app_dossier_chargers_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.app_dossier_locations(id) ON DELETE CASCADE;


--
-- Name: app_dossier_document_files app_dossier_document_files_dossier_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_files
    ADD CONSTRAINT app_dossier_document_files_dossier_fk FOREIGN KEY (dossier_id) REFERENCES public.app_customer_dossiers(id) ON DELETE RESTRICT;


--
-- Name: CONSTRAINT app_dossier_document_files_dossier_fk ON app_dossier_document_files; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT app_dossier_document_files_dossier_fk ON public.app_dossier_document_files IS 'Parent dossier deletion is blocked while file/upload history exists. Evidence retention/deletion requires a separate explicit lifecycle contract.';


--
-- Name: app_dossier_document_files app_dossier_document_files_slot_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_files
    ADD CONSTRAINT app_dossier_document_files_slot_fk FOREIGN KEY (document_slot_id, dossier_id) REFERENCES public.app_dossier_document_slots(id, dossier_id) ON DELETE RESTRICT;


--
-- Name: CONSTRAINT app_dossier_document_files_slot_fk ON app_dossier_document_files; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT app_dossier_document_files_slot_fk ON public.app_dossier_document_files IS 'Parent slot deletion is blocked while file/upload history exists. Evidence retention/deletion requires a separate explicit lifecycle contract.';


--
-- Name: app_dossier_document_slots app_dossier_document_slots_charger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_slots
    ADD CONSTRAINT app_dossier_document_slots_charger_id_fkey FOREIGN KEY (charger_id) REFERENCES public.app_dossier_chargers(id) ON DELETE SET NULL;


--
-- Name: app_dossier_document_slots app_dossier_document_slots_current_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_slots
    ADD CONSTRAINT app_dossier_document_slots_current_version_fk FOREIGN KEY (current_version_id, current_version_number, id, dossier_id) REFERENCES public.app_dossier_document_versions(id, version_number, document_slot_id, dossier_id) ON DELETE RESTRICT;


--
-- Name: app_dossier_document_slots app_dossier_document_slots_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_slots
    ADD CONSTRAINT app_dossier_document_slots_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.app_customer_dossiers(id) ON DELETE CASCADE;


--
-- Name: app_dossier_document_slots app_dossier_document_slots_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_slots
    ADD CONSTRAINT app_dossier_document_slots_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.app_dossier_locations(id) ON DELETE SET NULL;


--
-- Name: app_dossier_document_versions app_dossier_document_versions_dossier_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_versions
    ADD CONSTRAINT app_dossier_document_versions_dossier_fk FOREIGN KEY (dossier_id) REFERENCES public.app_customer_dossiers(id) ON DELETE RESTRICT;


--
-- Name: CONSTRAINT app_dossier_document_versions_dossier_fk ON app_dossier_document_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT app_dossier_document_versions_dossier_fk ON public.app_dossier_document_versions IS 'Parent dossier deletion is blocked while confirmed version history exists. Evidence retention/deletion requires a separate explicit lifecycle contract.';


--
-- Name: app_dossier_document_versions app_dossier_document_versions_file_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_versions
    ADD CONSTRAINT app_dossier_document_versions_file_fk FOREIGN KEY (document_file_id, document_slot_id, dossier_id) REFERENCES public.app_dossier_document_files(id, document_slot_id, dossier_id) ON DELETE RESTRICT;


--
-- Name: app_dossier_document_versions app_dossier_document_versions_replaced_by_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_versions
    ADD CONSTRAINT app_dossier_document_versions_replaced_by_version_id_fkey FOREIGN KEY (replaced_by_version_id) REFERENCES public.app_dossier_document_versions(id) ON DELETE RESTRICT;


--
-- Name: app_dossier_document_versions app_dossier_document_versions_slot_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_document_versions
    ADD CONSTRAINT app_dossier_document_versions_slot_fk FOREIGN KEY (document_slot_id, dossier_id) REFERENCES public.app_dossier_document_slots(id, dossier_id) ON DELETE RESTRICT;


--
-- Name: CONSTRAINT app_dossier_document_versions_slot_fk ON app_dossier_document_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT app_dossier_document_versions_slot_fk ON public.app_dossier_document_versions IS 'Parent slot deletion is blocked while confirmed version history exists. Evidence retention/deletion requires a separate explicit lifecycle contract.';


--
-- Name: app_dossier_legal_acceptances app_dossier_legal_acceptances_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_legal_acceptances
    ADD CONSTRAINT app_dossier_legal_acceptances_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE CASCADE;


--
-- Name: app_dossier_legal_acceptances app_dossier_legal_acceptances_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_legal_acceptances
    ADD CONSTRAINT app_dossier_legal_acceptances_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.app_customer_dossiers(id) ON DELETE CASCADE;


--
-- Name: app_dossier_locations app_dossier_locations_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_dossier_locations
    ADD CONSTRAINT app_dossier_locations_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.app_customer_dossiers(id) ON DELETE CASCADE;


--
-- Name: app_evidence_declaration_contexts app_evidence_declaration_contexts_charger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_declaration_contexts
    ADD CONSTRAINT app_evidence_declaration_contexts_charger_id_fkey FOREIGN KEY (charger_id) REFERENCES public.app_chargers(id) ON DELETE RESTRICT;


--
-- Name: app_evidence_declaration_contexts app_evidence_declaration_contexts_evidence_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_declaration_contexts
    ADD CONSTRAINT app_evidence_declaration_contexts_evidence_file_id_fkey FOREIGN KEY (evidence_file_id) REFERENCES public.app_evidence_files(id) ON DELETE RESTRICT;


--
-- Name: app_evidence_declaration_contexts app_evidence_declaration_contexts_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_declaration_contexts
    ADD CONSTRAINT app_evidence_declaration_contexts_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.app_locations(id) ON DELETE RESTRICT;


--
-- Name: app_evidence_declaration_contexts app_evidence_declaration_contexts_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_declaration_contexts
    ADD CONSTRAINT app_evidence_declaration_contexts_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.app_signup_promotions(id) ON DELETE RESTRICT;


--
-- Name: app_evidence_files app_evidence_files_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_files
    ADD CONSTRAINT app_evidence_files_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.app_cases(id) ON DELETE RESTRICT;


--
-- Name: app_evidence_files app_evidence_files_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_files
    ADD CONSTRAINT app_evidence_files_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.app_signup_promotions(id) ON DELETE RESTRICT;


--
-- Name: app_evidence_versions app_evidence_versions_evidence_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_versions
    ADD CONSTRAINT app_evidence_versions_evidence_file_id_fkey FOREIGN KEY (evidence_file_id) REFERENCES public.app_evidence_files(id) ON DELETE RESTRICT;


--
-- Name: app_evidence_versions app_evidence_versions_source_intake_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_evidence_versions
    ADD CONSTRAINT app_evidence_versions_source_intake_file_id_fkey FOREIGN KEY (source_intake_file_id) REFERENCES public.app_signup_intake_files(id) ON DELETE RESTRICT;


--
-- Name: app_location_address_observations app_location_address_observations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_location_address_observations
    ADD CONSTRAINT app_location_address_observations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.app_locations(id) ON DELETE RESTRICT;


--
-- Name: app_location_versions app_location_versions_accepted_observation_same_root_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_location_versions
    ADD CONSTRAINT app_location_versions_accepted_observation_same_root_fkey FOREIGN KEY (location_id, accepted_from_observation_id) REFERENCES public.app_location_address_observations(location_id, id) ON DELETE RESTRICT;


--
-- Name: app_location_versions app_location_versions_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_location_versions
    ADD CONSTRAINT app_location_versions_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.app_locations(id) ON DELETE RESTRICT;


--
-- Name: app_location_versions app_location_versions_supersedes_same_root_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_location_versions
    ADD CONSTRAINT app_location_versions_supersedes_same_root_fkey FOREIGN KEY (location_id, supersedes_version_id) REFERENCES public.app_location_versions(location_id, id) ON DELETE RESTRICT;


--
-- Name: app_party_declaration_sources app_party_declaration_sources_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_declaration_sources
    ADD CONSTRAINT app_party_declaration_sources_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE RESTRICT;


--
-- Name: app_party_declaration_sources app_party_declaration_sources_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_declaration_sources
    ADD CONSTRAINT app_party_declaration_sources_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.app_customer_dossiers(id) ON DELETE RESTRICT;


--
-- Name: app_party_organization_versions app_party_organization_versions_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_organization_versions
    ADD CONSTRAINT app_party_organization_versions_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.app_parties(id) ON DELETE RESTRICT;


--
-- Name: app_party_organization_versions app_party_organization_versions_supersession_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_organization_versions
    ADD CONSTRAINT app_party_organization_versions_supersession_fk FOREIGN KEY (party_id, supersedes_organization_version_id) REFERENCES public.app_party_organization_versions(party_id, id) ON DELETE RESTRICT;


--
-- Name: app_party_person_versions app_party_person_versions_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_person_versions
    ADD CONSTRAINT app_party_person_versions_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.app_parties(id) ON DELETE RESTRICT;


--
-- Name: app_party_person_versions app_party_person_versions_supersession_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_party_person_versions
    ADD CONSTRAINT app_party_person_versions_supersession_fk FOREIGN KEY (party_id, supersedes_person_version_id) REFERENCES public.app_party_person_versions(party_id, id) ON DELETE RESTRICT;


--
-- Name: app_signup_authenticated_intake_provenance app_signup_authenticated_intake_provenance_intake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_authenticated_intake_provenance
    ADD CONSTRAINT app_signup_authenticated_intake_provenance_intake_id_fkey FOREIGN KEY (intake_id) REFERENCES public.app_signup_intakes(id) ON DELETE RESTRICT;


--
-- Name: app_signup_intake_capabilities app_signup_intake_capabilities_intake_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intake_capabilities
    ADD CONSTRAINT app_signup_intake_capabilities_intake_file_id_fkey FOREIGN KEY (intake_file_id) REFERENCES public.app_signup_intake_files(id) ON DELETE CASCADE;


--
-- Name: app_signup_intake_capabilities app_signup_intake_capabilities_intake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intake_capabilities
    ADD CONSTRAINT app_signup_intake_capabilities_intake_id_fkey FOREIGN KEY (intake_id) REFERENCES public.app_signup_intakes(id) ON DELETE CASCADE;


--
-- Name: app_signup_intake_files app_signup_intake_files_intake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intake_files
    ADD CONSTRAINT app_signup_intake_files_intake_id_fkey FOREIGN KEY (intake_id) REFERENCES public.app_signup_intakes(id) ON DELETE CASCADE;


--
-- Name: app_signup_intake_files app_signup_intake_files_promoted_evidence_file_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intake_files
    ADD CONSTRAINT app_signup_intake_files_promoted_evidence_file_fkey FOREIGN KEY (promoted_evidence_file_id) REFERENCES public.app_evidence_files(id) ON DELETE RESTRICT;


--
-- Name: app_signup_intake_files app_signup_intake_files_superseded_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intake_files
    ADD CONSTRAINT app_signup_intake_files_superseded_by_fk FOREIGN KEY (superseded_by_intake_file_id) REFERENCES public.app_signup_intake_files(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: app_signup_intake_files app_signup_intake_files_supersedes_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intake_files
    ADD CONSTRAINT app_signup_intake_files_supersedes_fk FOREIGN KEY (supersedes_intake_file_id) REFERENCES public.app_signup_intake_files(id);


--
-- Name: app_signup_intakes app_signup_intakes_promotion_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_intakes
    ADD CONSTRAINT app_signup_intakes_promotion_case_id_fkey FOREIGN KEY (promotion_case_id) REFERENCES public.app_cases(id) ON DELETE RESTRICT;


--
-- Name: app_signup_legal_acceptances app_signup_legal_acceptances_intake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_legal_acceptances
    ADD CONSTRAINT app_signup_legal_acceptances_intake_id_fkey FOREIGN KEY (intake_id) REFERENCES public.app_signup_intakes(id) ON DELETE RESTRICT;


--
-- Name: app_signup_legal_acceptances app_signup_legal_acceptances_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_legal_acceptances
    ADD CONSTRAINT app_signup_legal_acceptances_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.app_signup_signing_snapshots(id) ON DELETE RESTRICT;


--
-- Name: app_signup_mandates app_signup_mandates_intake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_mandates
    ADD CONSTRAINT app_signup_mandates_intake_id_fkey FOREIGN KEY (intake_id) REFERENCES public.app_signup_intakes(id) ON DELETE RESTRICT;


--
-- Name: app_signup_mandates app_signup_mandates_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_mandates
    ADD CONSTRAINT app_signup_mandates_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.app_signup_signing_snapshots(id) ON DELETE RESTRICT;


--
-- Name: app_signup_promotions app_signup_promotions_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.app_cases(id) ON DELETE RESTRICT;


--
-- Name: app_signup_promotions app_signup_promotions_contact_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_contact_party_id_fkey FOREIGN KEY (contact_party_id) REFERENCES public.app_parties(id) ON DELETE RESTRICT;


--
-- Name: app_signup_promotions app_signup_promotions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_customers(id) ON DELETE RESTRICT;


--
-- Name: app_signup_promotions app_signup_promotions_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.app_customer_identities(id) ON DELETE RESTRICT;


--
-- Name: app_signup_promotions app_signup_promotions_intake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_intake_id_fkey FOREIGN KEY (intake_id) REFERENCES public.app_signup_intakes(id) ON DELETE RESTRICT;


--
-- Name: app_signup_promotions app_signup_promotions_mandate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_mandate_id_fkey FOREIGN KEY (mandate_id) REFERENCES public.app_signup_mandates(id) ON DELETE RESTRICT;


--
-- Name: app_signup_promotions app_signup_promotions_service_recipient_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_service_recipient_party_id_fkey FOREIGN KEY (service_recipient_party_id) REFERENCES public.app_parties(id) ON DELETE RESTRICT;


--
-- Name: app_signup_promotions app_signup_promotions_signature_evidence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_signature_evidence_id_fkey FOREIGN KEY (signature_evidence_id) REFERENCES public.app_signup_signature_evidence(id) ON DELETE RESTRICT;


--
-- Name: app_signup_promotions app_signup_promotions_signing_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_promotions
    ADD CONSTRAINT app_signup_promotions_signing_snapshot_id_fkey FOREIGN KEY (signing_snapshot_id) REFERENCES public.app_signup_signing_snapshots(id) ON DELETE RESTRICT;


--
-- Name: app_signup_signature_evidence app_signup_signature_evidence_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signature_evidence
    ADD CONSTRAINT app_signup_signature_evidence_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.app_signup_signing_challenges(id) ON DELETE RESTRICT;


--
-- Name: app_signup_signature_evidence app_signup_signature_evidence_intake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signature_evidence
    ADD CONSTRAINT app_signup_signature_evidence_intake_id_fkey FOREIGN KEY (intake_id) REFERENCES public.app_signup_intakes(id) ON DELETE RESTRICT;


--
-- Name: app_signup_signature_evidence app_signup_signature_evidence_mandate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signature_evidence
    ADD CONSTRAINT app_signup_signature_evidence_mandate_id_fkey FOREIGN KEY (mandate_id) REFERENCES public.app_signup_mandates(id) ON DELETE RESTRICT;


--
-- Name: app_signup_signature_evidence app_signup_signature_evidence_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signature_evidence
    ADD CONSTRAINT app_signup_signature_evidence_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.app_signup_signing_snapshots(id) ON DELETE RESTRICT;


--
-- Name: app_signup_signing_challenges app_signup_signing_challenges_intake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signing_challenges
    ADD CONSTRAINT app_signup_signing_challenges_intake_id_fkey FOREIGN KEY (intake_id) REFERENCES public.app_signup_intakes(id) ON DELETE RESTRICT;


--
-- Name: app_signup_signing_snapshots app_signup_signing_snapshots_intake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_signup_signing_snapshots
    ADD CONSTRAINT app_signup_signing_snapshots_intake_id_fkey FOREIGN KEY (intake_id) REFERENCES public.app_signup_intakes(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_capability_assignments app_workforce_capability_assi_supersedes_assignment_event__fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_capability_assignments
    ADD CONSTRAINT app_workforce_capability_assi_supersedes_assignment_event__fkey FOREIGN KEY (supersedes_assignment_event_id) REFERENCES public.app_workforce_capability_assignments(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_capability_assignments app_workforce_capability_assignments_workforce_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_capability_assignments
    ADD CONSTRAINT app_workforce_capability_assignments_workforce_identity_id_fkey FOREIGN KEY (workforce_identity_id) REFERENCES public.app_workforce_identities(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_identities app_workforce_identities_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_identities
    ADD CONSTRAINT app_workforce_identities_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_identity_states app_workforce_identity_states_supersedes_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_identity_states
    ADD CONSTRAINT app_workforce_identity_states_supersedes_state_id_fkey FOREIGN KEY (supersedes_state_id) REFERENCES public.app_workforce_identity_states(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_identity_states app_workforce_identity_states_workforce_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_identity_states
    ADD CONSTRAINT app_workforce_identity_states_workforce_identity_id_fkey FOREIGN KEY (workforce_identity_id) REFERENCES public.app_workforce_identities(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_operation_requests app_workforce_operation_reques_maker_workforce_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_requests
    ADD CONSTRAINT app_workforce_operation_reques_maker_workforce_identity_id_fkey FOREIGN KEY (maker_workforce_identity_id) REFERENCES public.app_workforce_identities(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_operation_requests app_workforce_operation_requests_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_requests
    ADD CONSTRAINT app_workforce_operation_requests_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.app_cases(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_operation_requests app_workforce_operation_requests_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_requests
    ADD CONSTRAINT app_workforce_operation_requests_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.app_locations(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_operation_requests app_workforce_operation_requests_maker_scope_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_requests
    ADD CONSTRAINT app_workforce_operation_requests_maker_scope_fkey FOREIGN KEY (maker_scope_assignment_id, maker_workforce_identity_id, maker_capability_code, case_id, location_id) REFERENCES public.app_workforce_scope_assignments(id, workforce_identity_id, capability_code, case_id, location_id) ON DELETE RESTRICT;


--
-- Name: app_workforce_operation_requests app_workforce_operation_requests_observation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_requests
    ADD CONSTRAINT app_workforce_operation_requests_observation_fkey FOREIGN KEY (location_id, observation_id) REFERENCES public.app_location_address_observations(location_id, id) ON DELETE RESTRICT;


--
-- Name: app_workforce_operation_requests app_workforce_operation_requests_predecessor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_requests
    ADD CONSTRAINT app_workforce_operation_requests_predecessor_fkey FOREIGN KEY (location_id, predecessor_version_id) REFERENCES public.app_location_versions(location_id, id) ON DELETE RESTRICT;


--
-- Name: app_workforce_operation_reviews app_workforce_operation_revie_checker_workforce_identity_i_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_reviews
    ADD CONSTRAINT app_workforce_operation_revie_checker_workforce_identity_i_fkey FOREIGN KEY (checker_workforce_identity_id) REFERENCES public.app_workforce_identities(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_operation_reviews app_workforce_operation_reviews_checker_scope_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_reviews
    ADD CONSTRAINT app_workforce_operation_reviews_checker_scope_fkey FOREIGN KEY (checker_scope_assignment_id, checker_workforce_identity_id, checker_capability_code) REFERENCES public.app_workforce_scope_assignments(id, workforce_identity_id, capability_code) ON DELETE RESTRICT;


--
-- Name: app_workforce_operation_reviews app_workforce_operation_reviews_operation_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_operation_reviews
    ADD CONSTRAINT app_workforce_operation_reviews_operation_request_id_fkey FOREIGN KEY (operation_request_id) REFERENCES public.app_workforce_operation_requests(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_capability_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_scope_assignments
    ADD CONSTRAINT app_workforce_scope_assignments_capability_fkey FOREIGN KEY (capability_assignment_id, workforce_identity_id, capability_code) REFERENCES public.app_workforce_capability_assignments(id, workforce_identity_id, capability_code) ON DELETE RESTRICT;


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_scope_assignments
    ADD CONSTRAINT app_workforce_scope_assignments_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.app_cases(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_scope_assignments
    ADD CONSTRAINT app_workforce_scope_assignments_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.app_locations(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_relation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_scope_assignments
    ADD CONSTRAINT app_workforce_scope_assignments_relation_fkey FOREIGN KEY (case_location_relation_id, case_id, location_id) REFERENCES public.app_case_location_relations(id, case_id, location_id) ON DELETE RESTRICT;


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_supersedes_scope_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_scope_assignments
    ADD CONSTRAINT app_workforce_scope_assignments_supersedes_scope_event_id_fkey FOREIGN KEY (supersedes_scope_event_id) REFERENCES public.app_workforce_scope_assignments(id) ON DELETE RESTRICT;


--
-- Name: app_workforce_scope_assignments app_workforce_scope_assignments_workforce_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_workforce_scope_assignments
    ADD CONSTRAINT app_workforce_scope_assignments_workforce_identity_id_fkey FOREIGN KEY (workforce_identity_id) REFERENCES public.app_workforce_identities(id) ON DELETE RESTRICT;


--
-- Name: app_audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: app_case_lifecycle_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_case_lifecycle_events ENABLE ROW LEVEL SECURITY;

--
-- Name: app_case_location_relations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_case_location_relations ENABLE ROW LEVEL SECURITY;

--
-- Name: app_case_party_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_case_party_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: app_cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_cases ENABLE ROW LEVEL SECURITY;

--
-- Name: app_charger_declarations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_charger_declarations ENABLE ROW LEVEL SECURITY;

--
-- Name: app_chargers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_chargers ENABLE ROW LEVEL SECURITY;

--
-- Name: app_connection_declaration_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_connection_declaration_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: app_connection_ownership_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_connection_ownership_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: app_connection_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_connection_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: app_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: app_customer_access_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_customer_access_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: app_customer_dossiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_customer_dossiers ENABLE ROW LEVEL SECURITY;

--
-- Name: app_customer_identities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_customer_identities ENABLE ROW LEVEL SECURITY;

--
-- Name: app_customer_party_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_customer_party_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: app_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_customers ENABLE ROW LEVEL SECURITY;

--
-- Name: app_dossier_chargers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_dossier_chargers ENABLE ROW LEVEL SECURITY;

--
-- Name: app_dossier_document_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_dossier_document_files ENABLE ROW LEVEL SECURITY;

--
-- Name: app_dossier_document_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_dossier_document_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: app_dossier_document_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_dossier_document_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: app_dossier_legal_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_dossier_legal_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: app_dossier_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_dossier_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: app_evidence_declaration_contexts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_evidence_declaration_contexts ENABLE ROW LEVEL SECURITY;

--
-- Name: app_evidence_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_evidence_files ENABLE ROW LEVEL SECURITY;

--
-- Name: app_evidence_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_evidence_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: app_idempotency_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_idempotency_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: app_intake_audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_intake_audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: app_location_address_observations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_location_address_observations ENABLE ROW LEVEL SECURITY;

--
-- Name: app_location_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_location_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: app_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: app_parties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_parties ENABLE ROW LEVEL SECURITY;

--
-- Name: app_party_declaration_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_party_declaration_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: app_party_organization_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_party_organization_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: app_party_person_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_party_person_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: app_signup_authenticated_intake_provenance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_signup_authenticated_intake_provenance ENABLE ROW LEVEL SECURITY;

--
-- Name: app_signup_intake_capabilities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_signup_intake_capabilities ENABLE ROW LEVEL SECURITY;

--
-- Name: app_signup_intake_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_signup_intake_files ENABLE ROW LEVEL SECURITY;

--
-- Name: app_signup_intakes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_signup_intakes ENABLE ROW LEVEL SECURITY;

--
-- Name: app_signup_legal_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_signup_legal_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: app_signup_mandates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_signup_mandates ENABLE ROW LEVEL SECURITY;

--
-- Name: app_signup_promotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_signup_promotions ENABLE ROW LEVEL SECURITY;

--
-- Name: app_signup_signature_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_signup_signature_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: app_signup_signing_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_signup_signing_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: app_signup_signing_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_signup_signing_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: app_workforce_capability_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_workforce_capability_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: app_workforce_identities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_workforce_identities ENABLE ROW LEVEL SECURITY;

--
-- Name: app_workforce_identity_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_workforce_identity_states ENABLE ROW LEVEL SECURITY;

--
-- Name: app_workforce_operation_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_workforce_operation_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: app_workforce_operation_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_workforce_operation_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: app_workforce_scope_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_workforce_scope_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: app_audit_events deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_audit_events TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_case_lifecycle_events deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_case_lifecycle_events TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_case_location_relations deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_case_location_relations TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_case_party_roles deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_case_party_roles TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_cases deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_cases TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_charger_declarations deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_charger_declarations USING (false) WITH CHECK (false);


--
-- Name: app_chargers deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_chargers USING (false) WITH CHECK (false);


--
-- Name: app_connection_declaration_sources deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_connection_declaration_sources TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_connection_ownership_periods deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_connection_ownership_periods TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_connection_periods deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_connection_periods TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_connections deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_connections TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_customer_access_grants deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_customer_access_grants TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_customer_dossiers deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_customer_dossiers TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_customer_identities deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_customer_identities TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_customer_party_relationships deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_customer_party_relationships TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_customers deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_customers TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_dossier_chargers deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_dossier_chargers TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_dossier_document_files deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_dossier_document_files TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_dossier_document_slots deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_dossier_document_slots TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_dossier_document_versions deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_dossier_document_versions TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_dossier_legal_acceptances deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_dossier_legal_acceptances TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_dossier_locations deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_dossier_locations TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_evidence_declaration_contexts deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_evidence_declaration_contexts USING (false) WITH CHECK (false);


--
-- Name: app_evidence_files deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_evidence_files TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_evidence_versions deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_evidence_versions TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_idempotency_keys deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_idempotency_keys TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_intake_audit_events deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_intake_audit_events TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_location_address_observations deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_location_address_observations TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_location_versions deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_location_versions TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_locations deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_locations TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_parties deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_parties TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_party_declaration_sources deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_party_declaration_sources TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_party_organization_versions deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_party_organization_versions TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_party_person_versions deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_party_person_versions TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_signup_authenticated_intake_provenance deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_signup_authenticated_intake_provenance TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_signup_intake_capabilities deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_signup_intake_capabilities TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_signup_intake_files deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_signup_intake_files TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_signup_intakes deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_signup_intakes TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_signup_legal_acceptances deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_signup_legal_acceptances TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_signup_mandates deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_signup_mandates TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_signup_promotions deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_signup_promotions TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_signup_signature_evidence deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_signup_signature_evidence TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_signup_signing_challenges deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_signup_signing_challenges TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_signup_signing_snapshots deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_signup_signing_snapshots TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_workforce_capability_assignments deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_workforce_capability_assignments TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_workforce_identities deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_workforce_identities TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_workforce_identity_states deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_workforce_identity_states TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_workforce_operation_requests deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_workforce_operation_requests TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_workforce_operation_reviews deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_workforce_operation_reviews TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: app_workforce_scope_assignments deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all ON public.app_workforce_scope_assignments TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: FUNCTION app_accept_initial_location_version_v1(p_location_id uuid, p_observation_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_accept_initial_location_version_v1(p_location_id uuid, p_observation_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_accept_initial_location_version_v1(p_location_id uuid, p_observation_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION app_asserted_service_recipient_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_asserted_service_recipient_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v1(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_bootstrap_customer_auth_v1(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_bootstrap_customer_auth_v1(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v2(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_bootstrap_customer_auth_v2(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_bootstrap_customer_auth_v2(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v3(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_bootstrap_customer_auth_v3(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_bootstrap_customer_auth_v3(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v4(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_bootstrap_customer_auth_v4(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_bootstrap_customer_auth_v4(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v5(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_bootstrap_customer_auth_v5(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_bootstrap_customer_auth_v5(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_bootstrap_customer_auth_v6(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_bootstrap_customer_auth_v6(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_bootstrap_customer_auth_v6(p_auth_user_id uuid, p_email_normalized text, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_case_location_relations_insert_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_case_location_relations_insert_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_case_party_roles_deferred_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_case_party_roles_deferred_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_case_party_roles_insert_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_case_party_roles_insert_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_confirm_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_detected_mime_type text, p_stored_size_bytes bigint, p_server_sha256 text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_confirm_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_detected_mime_type text, p_stored_size_bytes bigint, p_server_sha256 text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_confirm_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_detected_mime_type text, p_stored_size_bytes bigint, p_server_sha256 text) TO service_role;


--
-- Name: FUNCTION app_connection_declaration_sources_boundary_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_connection_declaration_sources_boundary_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_connection_declaration_sources_immutable_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_connection_declaration_sources_immutable_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_connection_ownership_periods_boundary_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_connection_ownership_periods_boundary_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_connection_ownership_periods_boundary_guard() TO service_role;


--
-- Name: FUNCTION app_connection_ownership_periods_overlap_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_connection_ownership_periods_overlap_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_connection_ownership_periods_overlap_guard() TO service_role;


--
-- Name: FUNCTION app_connection_ownership_periods_transition_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_connection_ownership_periods_transition_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_connection_ownership_periods_transition_guard() TO service_role;


--
-- Name: FUNCTION app_connection_periods_boundary_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_connection_periods_boundary_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_connection_periods_boundary_guard() TO service_role;


--
-- Name: FUNCTION app_connection_periods_overlap_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_connection_periods_overlap_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_connection_periods_overlap_guard() TO service_role;


--
-- Name: FUNCTION app_connection_periods_transition_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_connection_periods_transition_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_connection_periods_transition_guard() TO service_role;


--
-- Name: FUNCTION app_connection_write_audit_event(p_event_type text, p_scope_id uuid, p_customer_id uuid, p_dossier_id uuid, p_request_id text, p_idempotency_key text, p_actor_type text, p_actor_ref text, p_event_data jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_connection_write_audit_event(p_event_type text, p_scope_id uuid, p_customer_id uuid, p_dossier_id uuid, p_request_id text, p_idempotency_key text, p_actor_type text, p_actor_ref text, p_event_data jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_connection_write_audit_event(p_event_type text, p_scope_id uuid, p_customer_id uuid, p_dossier_id uuid, p_request_id text, p_idempotency_key text, p_actor_type text, p_actor_ref text, p_event_data jsonb) TO service_role;


--
-- Name: FUNCTION app_connections_boundary_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_connections_boundary_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_connections_boundary_guard() TO service_role;


--
-- Name: FUNCTION app_connections_transition_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_connections_transition_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_connections_transition_guard() TO service_role;


--
-- Name: FUNCTION app_correct_location_version_v1(p_location_id uuid, p_observation_id uuid, p_predecessor_version_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_correction_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_correct_location_version_v1(p_location_id uuid, p_observation_id uuid, p_predecessor_version_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_correction_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_correct_location_version_v1(p_location_id uuid, p_observation_id uuid, p_predecessor_version_id uuid, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_accepted_at timestamp with time zone, p_acceptance_decision_ref text, p_correction_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION app_create_location_root_v1(p_creation_basis text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_create_location_root_v1(p_creation_basis text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_create_location_root_v1(p_creation_basis text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION app_customer_access_grants_immutable_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_customer_access_grants_immutable_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_customer_party_relationships_overlap_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_customer_party_relationships_overlap_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_decide_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_decision text, p_decision_reason text, p_decision_actor_type text, p_decision_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_decide_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_decision text, p_decision_reason text, p_decision_actor_type text, p_decision_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_decide_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_decision text, p_decision_reason text, p_decision_actor_type text, p_decision_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) TO service_role;


--
-- Name: FUNCTION app_declare_connection_ownership_v1(p_connection_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_initial_status text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_declare_connection_ownership_v1(p_connection_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_initial_status text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_declare_connection_ownership_v1(p_connection_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_initial_status text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) TO service_role;


--
-- Name: FUNCTION app_declare_connection_v1(p_customer_id uuid, p_dossier_id uuid, p_location_id uuid, p_ean_normalized text, p_connection_type text, p_declared_network_operator text, p_period_valid_from date, p_period_valid_to date, p_period_network_operator text, p_period_configuration_type text, p_source_type text, p_source_reference_type text, p_source_reference_id text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_declare_connection_v1(p_customer_id uuid, p_dossier_id uuid, p_location_id uuid, p_ean_normalized text, p_connection_type text, p_declared_network_operator text, p_period_valid_from date, p_period_valid_to date, p_period_network_operator text, p_period_configuration_type text, p_source_type text, p_source_reference_type text, p_source_reference_id text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_declare_connection_v1(p_customer_id uuid, p_dossier_id uuid, p_location_id uuid, p_ean_normalized text, p_connection_type text, p_declared_network_operator text, p_period_valid_from date, p_period_valid_to date, p_period_network_operator text, p_period_configuration_type text, p_source_type text, p_source_reference_type text, p_source_reference_id text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) TO service_role;


--
-- Name: FUNCTION app_dossier_document_files_transition_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_dossier_document_files_transition_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_dossier_document_files_transition_guard() TO service_role;


--
-- Name: FUNCTION app_dossier_document_versions_transition_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_dossier_document_versions_transition_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_dossier_document_versions_transition_guard() TO service_role;


--
-- Name: FUNCTION app_location_versions_deferred_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_location_versions_deferred_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_location_write_complete_v1(p_scope text, p_key text, p_event_type text, p_scope_id uuid, p_request_id text, p_actor_type text, p_actor_ref text, p_event_data jsonb, p_response jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_location_write_complete_v1(p_scope text, p_key text, p_event_type text, p_scope_id uuid, p_request_id text, p_actor_type text, p_actor_ref text, p_event_data jsonb, p_response jsonb) FROM PUBLIC;


--
-- Name: FUNCTION app_location_write_idempotency_begin_v1(p_scope text, p_key text, p_payload_hash text, p_expires_at timestamp with time zone, p_actor_type text, p_actor_ref text, p_request_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_location_write_idempotency_begin_v1(p_scope text, p_key text, p_payload_hash text, p_expires_at timestamp with time zone, p_actor_type text, p_actor_ref text, p_request_id text) FROM PUBLIC;


--
-- Name: FUNCTION app_location_write_lock_v1(p_lock_scope text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_location_write_lock_v1(p_lock_scope text) FROM PUBLIC;


--
-- Name: FUNCTION app_materialize_signed_signup_declared_data_v1(p_intake_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_materialize_signed_signup_declared_data_v1(p_intake_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION app_ops_location_accept_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_ops_location_accept_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_ops_location_accept_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION app_ops_location_accept_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_ops_location_accept_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_ops_location_accept_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION app_ops_location_accept_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_ops_location_accept_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_ops_location_accept_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION app_ops_location_authorization_resolve_v1(p_auth_user_id uuid, p_capability_code text, p_case_id uuid, p_location_id uuid, p_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_ops_location_authorization_resolve_v1(p_auth_user_id uuid, p_capability_code text, p_case_id uuid, p_location_id uuid, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION app_ops_location_correct_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_ops_location_correct_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_ops_location_correct_execute_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION app_ops_location_correct_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_ops_location_correct_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_ops_location_correct_prepare_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION app_ops_location_correct_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_ops_location_correct_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_ops_location_correct_review_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION app_ops_location_observation_record_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_ops_location_observation_record_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_ops_location_observation_record_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION app_ops_location_root_create_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_ops_location_root_create_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_ops_location_root_create_v1(p_auth_user_id uuid, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION app_parties_immutable_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_parties_immutable_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_party_declaration_sources_immutable_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_party_declaration_sources_immutable_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_party_history_immutable_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_party_history_immutable_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_party_organization_versions_boundary_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_party_organization_versions_boundary_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_party_organization_versions_overlap_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_party_organization_versions_overlap_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_party_person_versions_boundary_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_party_person_versions_boundary_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_party_person_versions_overlap_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_party_person_versions_overlap_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_promote_signed_signup_v1(p_request jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_promote_signed_signup_v1(p_request jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_promote_signed_signup_v1(p_request jsonb) TO service_role;


--
-- Name: FUNCTION app_promote_signed_signup_v2(p_request jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_promote_signed_signup_v2(p_request jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_promote_signed_signup_v2(p_request jsonb) TO service_role;


--
-- Name: FUNCTION app_promote_signed_signup_v3(p_request jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_promote_signed_signup_v3(p_request jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_promote_signed_signup_v3(p_request jsonb) TO service_role;


--
-- Name: FUNCTION app_record_location_observation_v1(p_location_id uuid, p_observation_kind text, p_descriptor_kind text, p_observed_at timestamp with time zone, p_source_ref_sha256 text, p_source_payload_sha256 text, p_source_retrieved_at timestamp with time zone, p_fresh_until timestamp with time zone, p_country_code text, p_postal_code text, p_house_number integer, p_house_number_addition text, p_street text, p_city text, p_site_reference text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_record_location_observation_v1(p_location_id uuid, p_observation_kind text, p_descriptor_kind text, p_observed_at timestamp with time zone, p_source_ref_sha256 text, p_source_payload_sha256 text, p_source_retrieved_at timestamp with time zone, p_fresh_until timestamp with time zone, p_country_code text, p_postal_code text, p_house_number integer, p_house_number_addition text, p_street text, p_city text, p_site_reference text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_record_location_observation_v1(p_location_id uuid, p_observation_kind text, p_descriptor_kind text, p_observed_at timestamp with time zone, p_source_ref_sha256 text, p_source_payload_sha256 text, p_source_retrieved_at timestamp with time zone, p_fresh_until timestamp with time zone, p_country_code text, p_postal_code text, p_house_number integer, p_house_number_addition text, p_street text, p_city text, p_site_reference text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text, p_idempotency_expires_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION app_reject_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_response_status integer, p_error_code text, p_error_message text, p_stage text, p_reject_policy text, p_rejection_reason text, p_event_data jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_reject_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_response_status integer, p_error_code text, p_error_message text, p_stage text, p_reject_policy text, p_rejection_reason text, p_event_data jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_reject_document_upload_v1(p_dossier_id uuid, p_document_slot_id uuid, p_document_file_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_response_status integer, p_error_code text, p_error_message text, p_stage text, p_reject_policy text, p_rejection_reason text, p_event_data jsonb) TO service_role;


--
-- Name: FUNCTION app_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_set_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_set_updated_at() TO service_role;


--
-- Name: FUNCTION app_signed_signup_declared_data_trigger(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signed_signup_declared_data_trigger() FROM PUBLIC;


--
-- Name: FUNCTION app_signup_account_handoff_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_account_handoff_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_account_handoff_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid) TO service_role;


--
-- Name: FUNCTION app_signup_account_handoff_v2(p_intake_id uuid, p_authenticated_auth_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_account_handoff_v2(p_intake_id uuid, p_authenticated_auth_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_account_handoff_v2(p_intake_id uuid, p_authenticated_auth_user_id uuid) TO service_role;


--
-- Name: FUNCTION app_signup_authenticated_intake_claim_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid, p_request_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_authenticated_intake_claim_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid, p_request_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_authenticated_intake_claim_v1(p_intake_id uuid, p_authenticated_auth_user_id uuid, p_request_id text) TO service_role;


--
-- Name: FUNCTION app_signup_authenticated_intake_provenance_immutable_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_authenticated_intake_provenance_immutable_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_signup_immutable_signing_record_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_immutable_signing_record_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_immutable_signing_record_guard() TO service_role;


--
-- Name: FUNCTION app_signup_intake_capabilities_transition_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_intake_capabilities_transition_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_intake_capabilities_transition_guard() TO service_role;


--
-- Name: FUNCTION app_signup_intake_files_finalized_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_intake_files_finalized_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_intake_files_finalized_guard() TO service_role;


--
-- Name: FUNCTION app_signup_intake_files_transition_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_intake_files_transition_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_intake_files_transition_guard() TO service_role;


--
-- Name: FUNCTION app_signup_intakes_transition_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_intakes_transition_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_intakes_transition_guard() TO service_role;


--
-- Name: FUNCTION app_signup_promotion_immutable_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_promotion_immutable_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_signup_promotion_immutable_guard() TO service_role;


--
-- Name: FUNCTION app_signup_quarantine_confirm_v1(p_intake_id uuid, p_file_id uuid, p_upload_token_sha256 text, p_actual_size_bytes bigint, p_detected_mime_type text, p_server_sha256 text, p_failure_code text, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_quarantine_confirm_v1(p_intake_id uuid, p_file_id uuid, p_upload_token_sha256 text, p_actual_size_bytes bigint, p_detected_mime_type text, p_server_sha256 text, p_failure_code text, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_quarantine_confirm_v1(p_intake_id uuid, p_file_id uuid, p_upload_token_sha256 text, p_actual_size_bytes bigint, p_detected_mime_type text, p_server_sha256 text, p_failure_code text, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_signup_quarantine_issue_v1(p_intake_id uuid, p_manage_token_sha256 text, p_client_slot_id text, p_document_type text, p_original_filename text, p_declared_mime_type text, p_size_bytes bigint, p_client_sha256 text, p_payload_hash text, p_upload_token_sha256 text, p_file_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_quarantine_issue_v1(p_intake_id uuid, p_manage_token_sha256 text, p_client_slot_id text, p_document_type text, p_original_filename text, p_declared_mime_type text, p_size_bytes bigint, p_client_sha256 text, p_payload_hash text, p_upload_token_sha256 text, p_file_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_quarantine_issue_v1(p_intake_id uuid, p_manage_token_sha256 text, p_client_slot_id text, p_document_type text, p_original_filename text, p_declared_mime_type text, p_size_bytes bigint, p_client_sha256 text, p_payload_hash text, p_upload_token_sha256 text, p_file_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_signup_quarantine_remove_v1(p_intake_id uuid, p_manage_token_sha256 text, p_client_slot_id text, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_quarantine_remove_v1(p_intake_id uuid, p_manage_token_sha256 text, p_client_slot_id text, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_quarantine_remove_v1(p_intake_id uuid, p_manage_token_sha256 text, p_client_slot_id text, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_signup_quarantine_start_v1(p_account_type text, p_email_normalized text, p_payload_hash text, p_manage_token_sha256 text, p_intake_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_quarantine_start_v1(p_account_type text, p_email_normalized text, p_payload_hash text, p_manage_token_sha256 text, p_intake_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_quarantine_start_v1(p_account_type text, p_email_normalized text, p_payload_hash text, p_manage_token_sha256 text, p_intake_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_signup_quarantine_start_v2(p_account_type text, p_email_normalized text, p_payload_hash text, p_manage_token_sha256 text, p_intake_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_authenticated_auth_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_quarantine_start_v2(p_account_type text, p_email_normalized text, p_payload_hash text, p_manage_token_sha256 text, p_intake_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_authenticated_auth_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_quarantine_start_v2(p_account_type text, p_email_normalized text, p_payload_hash text, p_manage_token_sha256 text, p_intake_expires_at timestamp with time zone, p_capability_expires_at timestamp with time zone, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text, p_authenticated_auth_user_id uuid) TO service_role;


--
-- Name: FUNCTION app_signup_signing_challenge_issue_v1(p_intake_id uuid, p_manage_token_sha256 text, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_expires_at timestamp with time zone, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_signing_challenge_issue_v1(p_intake_id uuid, p_manage_token_sha256 text, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_expires_at timestamp with time zone, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_signing_challenge_issue_v1(p_intake_id uuid, p_manage_token_sha256 text, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_expires_at timestamp with time zone, p_payload_hash text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_signup_signing_finalize_v1(p_intake_id uuid, p_manage_token_sha256 text, p_challenge_id uuid, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_payload_hash text, p_canonical_snapshot jsonb, p_snapshot_sha256 text, p_legal_documents jsonb, p_required_file_ids uuid[], p_account_type text, p_mandate_year integer, p_issued_at timestamp with time zone, p_mandate_content jsonb, p_typed_full_name text, p_signer_role text, p_method_version text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_signing_finalize_v1(p_intake_id uuid, p_manage_token_sha256 text, p_challenge_id uuid, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_payload_hash text, p_canonical_snapshot jsonb, p_snapshot_sha256 text, p_legal_documents jsonb, p_required_file_ids uuid[], p_account_type text, p_mandate_year integer, p_issued_at timestamp with time zone, p_mandate_content jsonb, p_typed_full_name text, p_signer_role text, p_method_version text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_signing_finalize_v1(p_intake_id uuid, p_manage_token_sha256 text, p_challenge_id uuid, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_payload_hash text, p_canonical_snapshot jsonb, p_snapshot_sha256 text, p_legal_documents jsonb, p_required_file_ids uuid[], p_account_type text, p_mandate_year integer, p_issued_at timestamp with time zone, p_mandate_content jsonb, p_typed_full_name text, p_signer_role text, p_method_version text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_signup_signing_finalize_v2(p_intake_id uuid, p_manage_token_sha256 text, p_challenge_id uuid, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_payload_hash text, p_canonical_snapshot jsonb, p_snapshot_sha256 text, p_legal_documents jsonb, p_required_file_ids uuid[], p_account_type text, p_mandate_year integer, p_issued_at timestamp with time zone, p_mandate_content jsonb, p_typed_full_name text, p_signer_role text, p_method_version text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_signing_finalize_v2(p_intake_id uuid, p_manage_token_sha256 text, p_challenge_id uuid, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_payload_hash text, p_canonical_snapshot jsonb, p_snapshot_sha256 text, p_legal_documents jsonb, p_required_file_ids uuid[], p_account_type text, p_mandate_year integer, p_issued_at timestamp with time zone, p_mandate_content jsonb, p_typed_full_name text, p_signer_role text, p_method_version text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_signing_finalize_v2(p_intake_id uuid, p_manage_token_sha256 text, p_challenge_id uuid, p_channel_reference_sha256 text, p_otp_verifier_sha256 text, p_payload_hash text, p_canonical_snapshot jsonb, p_snapshot_sha256 text, p_legal_documents jsonb, p_required_file_ids uuid[], p_account_type text, p_mandate_year integer, p_issued_at timestamp with time zone, p_mandate_content jsonb, p_typed_full_name text, p_signer_role text, p_method_version text, p_request_id text, p_idempotency_key text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_signup_signing_status_v1(p_intake_id uuid, p_manage_token_sha256 text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_signing_status_v1(p_intake_id uuid, p_manage_token_sha256 text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_signing_status_v1(p_intake_id uuid, p_manage_token_sha256 text) TO service_role;


--
-- Name: FUNCTION app_signup_signing_status_v2(p_intake_id uuid, p_manage_token_sha256 text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_signup_signing_status_v2(p_intake_id uuid, p_manage_token_sha256 text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_signup_signing_status_v2(p_intake_id uuid, p_manage_token_sha256 text) TO service_role;


--
-- Name: FUNCTION app_submit_signup_v4(p_request jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_submit_signup_v4(p_request jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_submit_signup_v4(p_request jsonb) TO service_role;


--
-- Name: FUNCTION app_submit_signup_v5(p_request jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_submit_signup_v5(p_request jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_submit_signup_v5(p_request jsonb) TO service_role;


--
-- Name: FUNCTION app_supersede_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_supersede_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_supersede_connection_ownership_v1(p_ownership_claim_id uuid, p_customer_id uuid, p_dossier_id uuid, p_valid_from date, p_valid_to date, p_claim_source_type text, p_source_reference_type text, p_source_reference_id text, p_reason text, p_actor_type text, p_actor_ref text, p_request_id text, p_idempotency_key text, p_payload_hash text) TO service_role;


--
-- Name: FUNCTION app_sync_auth_customer_access_v1(p_auth_user_id uuid, p_request_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_sync_auth_customer_access_v1(p_auth_user_id uuid, p_request_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_sync_auth_customer_access_v1(p_auth_user_id uuid, p_request_id text) TO service_role;


--
-- Name: FUNCTION app_withdraw_current_document_v1(p_dossier_id uuid, p_document_slot_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_withdraw_current_document_v1(p_dossier_id uuid, p_document_slot_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_withdraw_current_document_v1(p_dossier_id uuid, p_document_slot_id uuid, p_customer_id uuid, p_identity_id uuid, p_actor_ref text, p_request_id text, p_idempotency_scope text, p_idempotency_key text, p_payload_hash text, p_ip_hash text, p_user_agent_hash text, p_environment text) TO service_role;


--
-- Name: FUNCTION app_workforce_capability_assignments_insert_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_workforce_capability_assignments_insert_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_workforce_identity_requires_initial_state(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_workforce_identity_requires_initial_state() FROM PUBLIC;


--
-- Name: FUNCTION app_workforce_identity_states_insert_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_workforce_identity_states_insert_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_workforce_operation_requests_insert_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_workforce_operation_requests_insert_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_workforce_operation_requests_update_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_workforce_operation_requests_update_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_workforce_operation_reviews_insert_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_workforce_operation_reviews_insert_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_workforce_scope_assignments_insert_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_workforce_scope_assignments_insert_guard() FROM PUBLIC;


--
-- Name: FUNCTION app_workforce_scope_is_authorized_v1(p_workforce_identity_id uuid, p_scope_assignment_id uuid, p_capability_code text, p_case_id uuid, p_location_id uuid, p_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_workforce_scope_is_authorized_v1(p_workforce_identity_id uuid, p_scope_assignment_id uuid, p_capability_code text, p_case_id uuid, p_location_id uuid, p_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION app_wp2b_i_immutable_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.app_wp2b_i_immutable_guard() FROM PUBLIC;


--
-- Name: TABLE app_audit_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_audit_events TO service_role;


--
-- Name: TABLE app_case_lifecycle_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_case_lifecycle_events TO service_role;


--
-- Name: TABLE app_case_location_relations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_case_location_relations TO service_role;


--
-- Name: TABLE app_case_party_roles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_case_party_roles TO service_role;


--
-- Name: TABLE app_cases; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_cases TO service_role;


--
-- Name: TABLE app_charger_declarations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_charger_declarations TO service_role;


--
-- Name: TABLE app_chargers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_chargers TO service_role;


--
-- Name: TABLE app_connection_declaration_sources; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_connection_declaration_sources TO service_role;


--
-- Name: TABLE app_connection_ownership_periods; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.app_connection_ownership_periods TO service_role;


--
-- Name: TABLE app_connection_periods; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.app_connection_periods TO service_role;


--
-- Name: TABLE app_connections; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.app_connections TO service_role;


--
-- Name: TABLE app_customer_access_grants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_customer_access_grants TO service_role;


--
-- Name: TABLE app_customer_dossiers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_customer_dossiers TO service_role;


--
-- Name: TABLE app_customer_identities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_customer_identities TO service_role;


--
-- Name: TABLE app_customer_party_relationships; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_customer_party_relationships TO service_role;


--
-- Name: TABLE app_customers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_customers TO service_role;


--
-- Name: TABLE app_dossier_chargers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_dossier_chargers TO service_role;


--
-- Name: TABLE app_dossier_document_files; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.app_dossier_document_files TO service_role;


--
-- Name: TABLE app_dossier_document_slots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_dossier_document_slots TO service_role;


--
-- Name: TABLE app_dossier_document_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.app_dossier_document_versions TO service_role;


--
-- Name: TABLE app_dossier_legal_acceptances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_dossier_legal_acceptances TO service_role;


--
-- Name: TABLE app_dossier_locations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_dossier_locations TO service_role;


--
-- Name: TABLE app_evidence_declaration_contexts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_evidence_declaration_contexts TO service_role;


--
-- Name: TABLE app_evidence_files; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_evidence_files TO service_role;


--
-- Name: TABLE app_evidence_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_evidence_versions TO service_role;


--
-- Name: TABLE app_idempotency_keys; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_idempotency_keys TO service_role;


--
-- Name: TABLE app_intake_audit_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_intake_audit_events TO service_role;


--
-- Name: TABLE app_location_address_observations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_location_address_observations TO service_role;


--
-- Name: TABLE app_location_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_location_versions TO service_role;


--
-- Name: TABLE app_locations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_locations TO service_role;


--
-- Name: TABLE app_parties; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_parties TO service_role;


--
-- Name: TABLE app_party_declaration_sources; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_party_declaration_sources TO service_role;


--
-- Name: TABLE app_party_organization_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_party_organization_versions TO service_role;


--
-- Name: TABLE app_party_person_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_party_person_versions TO service_role;


--
-- Name: TABLE app_signup_authenticated_intake_provenance; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_signup_authenticated_intake_provenance TO service_role;


--
-- Name: TABLE app_signup_intake_capabilities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_signup_intake_capabilities TO service_role;


--
-- Name: TABLE app_signup_intake_files; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.app_signup_intake_files TO service_role;


--
-- Name: TABLE app_signup_intakes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.app_signup_intakes TO service_role;


--
-- Name: TABLE app_signup_legal_acceptances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_signup_legal_acceptances TO service_role;


--
-- Name: TABLE app_signup_mandates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_signup_mandates TO service_role;


--
-- Name: TABLE app_signup_promotions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_signup_promotions TO service_role;


--
-- Name: TABLE app_signup_signature_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_signup_signature_evidence TO service_role;


--
-- Name: TABLE app_signup_signing_challenges; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.app_signup_signing_challenges TO service_role;


--
-- Name: TABLE app_signup_signing_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_signup_signing_snapshots TO service_role;


--
-- Name: TABLE app_workforce_capability_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_workforce_capability_assignments TO service_role;


--
-- Name: TABLE app_workforce_identities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_workforce_identities TO service_role;


--
-- Name: TABLE app_workforce_identity_states; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_workforce_identity_states TO service_role;


--
-- Name: TABLE app_workforce_operation_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_workforce_operation_requests TO service_role;


--
-- Name: TABLE app_workforce_operation_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_workforce_operation_reviews TO service_role;


--
-- Name: TABLE app_workforce_scope_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.app_workforce_scope_assignments TO service_role;


--
-- PostgreSQL database dump complete
--

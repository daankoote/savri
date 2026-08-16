-- ENVAL /app customer auth bootstrap RPC
-- Date: 2026-07-12
--
-- Purpose:
-- - Atomically bind a verified Supabase Auth user to an existing ENVAL
--   app_customer_identity created by api-app-signup-submit.
-- - Keep identity binding account-type neutral across particulier, zakelijk,
--   and VVE dossiers.
--
-- Boundaries:
-- - No legacy table changes.
-- - No frontend changes.
-- - No storage changes.
-- - Service-role execution only.

create or replace function public.app_bootstrap_customer_auth_v1(
  p_auth_user_id uuid,
  p_email_normalized text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_scope text,
  p_idempotency_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.app_bootstrap_customer_auth_v1(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public;

revoke all on function public.app_bootstrap_customer_auth_v1(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from anon;

revoke all on function public.app_bootstrap_customer_auth_v1(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from authenticated;

grant execute on function public.app_bootstrap_customer_auth_v1(
  uuid,
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

comment on function public.app_bootstrap_customer_auth_v1(
  uuid,
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
'Atomic service-role-only auth bootstrap for ENVAL /app: binds a verified Supabase Auth user to one existing active app_customer_identity, returns customer dossier summary, writes app audit, and finalizes app idempotency.';

-- ENVAL PILOT-CASE-01 authenticated dossier-to-case activation.
-- Date: 2026-07-29
--
-- This migration keeps app_bootstrap_customer_auth_v1 unchanged. V2 invokes
-- that proven binding boundary in the same transaction, then creates or
-- resolves one immutable app_cases root for every current eligible dossier.
--
-- A case root proves only the canonical relationship with a current customer
-- dossier. It proves no party identity, role, representation authority,
-- mandate, location, EAN, evidence, kWh, eligibility or regulatory acceptance.

create unique index app_cases_app_customer_dossier_source_uidx
  on public.app_cases (source_class, source_ref)
  where source_class = 'app_customer_dossier';

create or replace function public.app_bootstrap_customer_auth_v2(
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

revoke all on function public.app_bootstrap_customer_auth_v2(
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

revoke all on function public.app_bootstrap_customer_auth_v2(
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

revoke all on function public.app_bootstrap_customer_auth_v2(
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

grant execute on function public.app_bootstrap_customer_auth_v2(
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

comment on function public.app_bootstrap_customer_auth_v2(
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
'Atomic service-role-only auth bootstrap v2: reuses v1 identity binding and activates or resolves exactly one immutable canonical case per current eligible customer dossier.';

-- ENVAL PILOT-PARTY-01A authenticated customer-to-party root activation.
-- Date: 2026-07-29
--
-- This migration keeps app_bootstrap_customer_auth_v1 and v2 unchanged. V3
-- invokes v2 in the same transaction and then creates or resolves exactly one
-- canonical app_parties root for the current app_customer.
--
-- The account_owner relationship is an internal account/service link only. It
-- proves no legal identity, profile fact, case role, representation authority,
-- mandate, identifier, evidence decision, eligibility or regulatory acceptance.

create unique index app_parties_authenticated_customer_source_uidx
  on public.app_parties (source_reference_id)
  where source_type = 'authenticated_customer_party_root'
    and source_reference_type = 'app_customer';

create or replace function public.app_bootstrap_customer_auth_v3(
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

revoke all on function public.app_bootstrap_customer_auth_v3(
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

revoke all on function public.app_bootstrap_customer_auth_v3(
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

revoke all on function public.app_bootstrap_customer_auth_v3(
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

grant execute on function public.app_bootstrap_customer_auth_v3(
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

comment on function public.app_bootstrap_customer_auth_v3(
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
'Atomic service-role-only auth bootstrap v3: reuses v2 and creates or resolves one non-authoritative canonical party root and account_owner service relationship per current app_customer without creating profiles, case roles, representation authority or mandate truth.';

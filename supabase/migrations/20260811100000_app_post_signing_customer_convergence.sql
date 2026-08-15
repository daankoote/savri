-- ENVAL 09C1C post-signing customer convergence.
--
-- Forward-only local contract changes:
-- - expose submitted_for_review through the active signing v2 RPCs;
-- - keep finalized signing readable after the intake is promoted;
-- - bind verified Supabase Auth to an existing signed-signup customer/case;
-- - create no customer, case, dossier, Auth user or evidence row.

create or replace function public.app_signup_signing_finalize_v2(
  p_intake_id uuid,
  p_manage_token_sha256 text,
  p_challenge_id uuid,
  p_channel_reference_sha256 text,
  p_otp_verifier_sha256 text,
  p_payload_hash text,
  p_canonical_snapshot jsonb,
  p_snapshot_sha256 text,
  p_legal_documents jsonb,
  p_required_file_ids uuid[],
  p_account_type text,
  p_mandate_year integer,
  p_issued_at timestamptz,
  p_mandate_content jsonb,
  p_typed_full_name text,
  p_signer_role text,
  p_method_version text,
  p_request_id text,
  p_idempotency_key text,
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

create or replace function public.app_signup_signing_status_v2(
  p_intake_id uuid,
  p_manage_token_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.app_bootstrap_customer_auth_v5(
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
$$;

create or replace function public.app_signup_account_handoff_v1(
  p_intake_id uuid,
  p_authenticated_auth_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.app_signup_signing_finalize_v2(
  uuid, text, uuid, text, text, text, jsonb, text, jsonb, uuid[], text,
  integer, timestamptz, jsonb, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_signup_signing_finalize_v2(
  uuid, text, uuid, text, text, text, jsonb, text, jsonb, uuid[], text,
  integer, timestamptz, jsonb, text, text, text, text, text, text, text, text
) to service_role;

revoke all on function public.app_signup_signing_status_v2(uuid, text)
from public, anon, authenticated;
grant execute on function public.app_signup_signing_status_v2(uuid, text)
to service_role;

revoke all on function public.app_bootstrap_customer_auth_v5(
  uuid, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_bootstrap_customer_auth_v5(
  uuid, text, text, text, text, text, text, text, text, text
) to service_role;

revoke all on function public.app_signup_account_handoff_v1(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.app_signup_account_handoff_v1(uuid, uuid)
to service_role;

comment on function public.app_bootstrap_customer_auth_v5(
  uuid, text, text, text, text, text, text, text, text, text
) is
'Binds verified Supabase Auth to one exact active identity and returns the normalized lineage-backed union of accessible legacy dossiers and signed-signup cases. Creates no customer, case or dossier.';

comment on function public.app_signup_account_handoff_v1(uuid, uuid) is
'Service-role-only post-verification account guidance. It reveals no account state before finalized email control, grants no ownership, and fails closed on incompatible or ambiguous customer identity context.';

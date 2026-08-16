-- ENVAL 09C1C-R6 multi-context Auth access.
--
-- Auth identity, customer/service context, party, case and authority remain
-- separate roots. A verified Auth principal receives only explicit,
-- server-owned customer-context access backed by an active bound identity or
-- immutable signed-signup promotion lineage.

create table public.app_customer_access_grants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  customer_id uuid not null references public.app_customers(id) on delete restrict,
  granted_case_id uuid references public.app_cases(id) on delete restrict,
  access_basis text not null check (access_basis in (
    'bound_customer_identity',
    'signed_service_recipient',
    'signed_case_contact'
  )),
  source_class text not null check (source_class in (
    'app_customer_identity',
    'app_signup_promotion'
  )),
  source_ref text not null check (btrim(source_ref) <> ''),
  request_id text not null check (btrim(request_id) <> ''),
  created_at timestamptz not null default now(),
  unique (auth_user_id, customer_id),
  check (
    (
      source_class = 'app_customer_identity'
      and access_basis = 'bound_customer_identity'
      and granted_case_id is null
    )
    or (
      source_class = 'app_signup_promotion'
      and access_basis in ('signed_service_recipient', 'signed_case_contact')
      and granted_case_id is not null
    )
  )
);

create index app_customer_access_grants_customer_idx
on public.app_customer_access_grants(customer_id, auth_user_id);

create index app_customer_access_grants_case_idx
on public.app_customer_access_grants(granted_case_id)
where granted_case_id is not null;

create or replace function public.app_customer_access_grants_immutable_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'customer access grant is immutable';
end;
$$;

create trigger trg_app_customer_access_grants_immutable
before update or delete on public.app_customer_access_grants
for each row
execute function public.app_customer_access_grants_immutable_guard();

alter table public.app_customer_access_grants enable row level security;

create policy deny_all
on public.app_customer_access_grants
for all to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_customer_access_grants
  from public, anon, authenticated, service_role;
grant select on table public.app_customer_access_grants to service_role;

revoke all on function public.app_customer_access_grants_immutable_guard()
  from public, anon, authenticated, service_role;

insert into public.app_customer_access_grants (
  auth_user_id,
  customer_id,
  granted_case_id,
  access_basis,
  source_class,
  source_ref,
  request_id
)
select
  identity_row.auth_user_id,
  identity_row.customer_id,
  null,
  'bound_customer_identity',
  'app_customer_identity',
  identity_row.id::text,
  'r6-bound-identity-backfill:' || identity_row.id::text
from public.app_customer_identities identity_row
join public.app_customers customer_row
  on customer_row.id = identity_row.customer_id
 and customer_row.status = 'active'
where identity_row.auth_user_id is not null
  and identity_row.status = 'active'
on conflict (auth_user_id, customer_id) do nothing;

-- The v1 promotion implementation remains the canonical materializer. Scope
-- only its identity/customer convergence guards to the signed account type so
-- a different account type creates a separate context instead of merging or
-- blocking on the same mailbox. The exact prior definition is asserted before
-- replacement, keeping this forward patch deterministic.
do $r6_patch$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_occurrences integer;
begin
  select pg_get_functiondef(
    'public.app_promote_signed_signup_v1(jsonb)'::regprocedure
  ) into v_definition;

  v_old := $old$
select array_agg(identity_row.id order by identity_row.id)
  into v_party_ids
  from public.app_customer_identities identity_row
  where identity_row.email_normalized = v_intake.email_normalized
    and identity_row.status = 'active';$old$;
  v_new := $new$
select array_agg(identity_row.id order by identity_row.id)
  into v_party_ids
  from public.app_customer_identities identity_row
  join public.app_customers identity_customer
    on identity_customer.id = identity_row.customer_id
   and identity_customer.status = 'active'
   and identity_customer.customer_type = v_account_type
  where identity_row.email_normalized = v_intake.email_normalized
    and identity_row.status = 'active';$new$;
  v_old := ltrim(v_old, E'\n');
  v_new := ltrim(v_new, E'\n');
  if position(v_old in v_definition) = 0 then
    raise exception 'R6 promotion identity-scope patch source mismatch';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$
select count(*) into v_total_identity_count
      from public.app_customer_identities identity_row
      where identity_row.email_normalized = v_intake.email_normalized;$old$;
  v_new := $new$
select count(*) into v_total_identity_count
      from public.app_customer_identities identity_row
      join public.app_customers identity_customer
        on identity_customer.id = identity_row.customer_id
       and identity_customer.customer_type = v_account_type
      where identity_row.email_normalized = v_intake.email_normalized;$new$;
  v_old := ltrim(v_old, E'\n');
  v_new := ltrim(v_new, E'\n');
  if position(v_old in v_definition) = 0 then
    raise exception 'R6 promotion identity-count patch source mismatch';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'and customer_row.primary_email_normalized = v_intake.email_normalized;';
  v_new := 'and customer_row.primary_email_normalized = v_intake.email_normalized'
    || E'\n        and customer_row.customer_type = v_account_type;';
  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old, ''))
  ) / length(v_old);
  if v_occurrences <> 2 then
    raise exception 'R6 promotion customer-scope patch source mismatch';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  execute v_definition;
end;
$r6_patch$;

create or replace function public.app_sync_auth_customer_access_v1(
  p_auth_user_id uuid,
  p_request_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.app_promote_signed_signup_v3(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.app_signup_account_handoff_v2(
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

create or replace function public.app_bootstrap_customer_auth_v6(
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
$$;

revoke all on function public.app_sync_auth_customer_access_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.app_sync_auth_customer_access_v1(uuid, text)
  to service_role;

revoke all on function public.app_promote_signed_signup_v3(jsonb)
  from public, anon, authenticated;
grant execute on function public.app_promote_signed_signup_v3(jsonb)
  to service_role;

revoke all on function public.app_signup_account_handoff_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.app_signup_account_handoff_v2(uuid, uuid)
  to service_role;

revoke all on function public.app_bootstrap_customer_auth_v6(
  uuid, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_bootstrap_customer_auth_v6(
  uuid, text, text, text, text, text, text, text, text, text
) to service_role;

comment on table public.app_customer_access_grants is
'Immutable server-owned Auth-principal access to a distinct customer context; access is not customer identity, party identity, case ownership or representation authority.';
comment on function public.app_sync_auth_customer_access_v1(uuid, text) is
'Idempotently materializes explicit customer-context access from bound identity or verified signed-promotion lineage; never from e-mail alone.';
comment on function public.app_promote_signed_signup_v3(jsonb) is
'Promotes a signed intake into its own account-type-compatible customer context and grants verified Auth access without cross-context customer merge.';
comment on function public.app_signup_account_handoff_v2(uuid, uuid) is
'Projects account handoff from finalized signing and unique verified Auth context without treating account type as principal-scoped.';
comment on function public.app_bootstrap_customer_auth_v6(
  uuid, text, text, text, text, text, text, text, text, text
) is
'Returns the lineage-backed union of all customer contexts explicitly accessible to one verified Auth principal.';

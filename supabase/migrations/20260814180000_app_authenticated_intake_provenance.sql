-- ENVAL 09C1C-R5-R1 authenticated intake ownership provenance.
--
-- Forward-only foundation. Existing R1/R2/R4 migrations remain unchanged.
-- The browser never supplies the Auth subject to these functions. The Edge
-- boundary validates Supabase Auth and passes the verified server context.
-- No bearer token or raw e-mail is persisted in this linkage table.

create table if not exists public.app_signup_authenticated_intake_provenance (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null unique
    references public.app_signup_intakes(id) on delete restrict,
  auth_user_id uuid not null,
  auth_email_sha256 text not null
    check (auth_email_sha256 ~ '^[0-9a-f]{64}$'),
  auth_email_verified_at timestamptz not null,
  linkage_type text not null
    check (linkage_type in (
      'verified_auth_at_intake_start',
      'verified_auth_recovery_after_signing'
    )),
  request_id text not null check (btrim(request_id) <> ''),
  created_at timestamptz not null default now()
);

create index if not exists
  app_signup_authenticated_intake_provenance_auth_user_idx
on public.app_signup_authenticated_intake_provenance(auth_user_id, created_at);

create or replace function public.app_signup_authenticated_intake_provenance_immutable_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'authenticated intake provenance is immutable';
end;
$$;

drop trigger if exists trg_app_signup_authenticated_intake_provenance_immutable
  on public.app_signup_authenticated_intake_provenance;

create trigger trg_app_signup_authenticated_intake_provenance_immutable
before update or delete on public.app_signup_authenticated_intake_provenance
for each row
execute function public.app_signup_authenticated_intake_provenance_immutable_guard();

create or replace function public.app_signup_quarantine_start_v2(
  p_account_type text,
  p_email_normalized text,
  p_payload_hash text,
  p_manage_token_sha256 text,
  p_intake_expires_at timestamptz,
  p_capability_expires_at timestamptz,
  p_request_id text,
  p_idempotency_key text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_environment text,
  p_authenticated_auth_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.app_signup_authenticated_intake_claim_v1(
  p_intake_id uuid,
  p_authenticated_auth_user_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.app_promote_signed_signup_v2(p_request jsonb)
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
$$;

revoke all on table public.app_signup_authenticated_intake_provenance
  from public, anon, authenticated;
grant select, insert on table public.app_signup_authenticated_intake_provenance
  to service_role;

revoke all on function public.app_signup_quarantine_start_v2(
  text, text, text, text, timestamptz, timestamptz,
  text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.app_signup_quarantine_start_v2(
  text, text, text, text, timestamptz, timestamptz,
  text, text, text, text, text, uuid
) to service_role;

revoke all on function public.app_signup_authenticated_intake_claim_v1(
  uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.app_signup_authenticated_intake_claim_v1(
  uuid, uuid, text
) to service_role;

revoke all on function public.app_promote_signed_signup_v2(jsonb)
  from public, anon, authenticated;
grant execute on function public.app_promote_signed_signup_v2(jsonb)
  to service_role;

comment on table public.app_signup_authenticated_intake_provenance is
  'Immutable intake-specific verified Supabase Auth provenance; no token or raw e-mail.';
comment on function public.app_signup_quarantine_start_v2(
  text, text, text, text, timestamptz, timestamptz,
  text, text, text, text, text, uuid
) is
  'Atomically starts an anonymous or server-verified authenticated intake.';
comment on function public.app_signup_authenticated_intake_claim_v1(
  uuid, uuid, text
) is
  'Append-only verified Auth recovery anchor for a previously finalized signed intake.';
comment on function public.app_promote_signed_signup_v2(jsonb) is
  'Runs signed promotion and verified Auth identity binding in one transaction.';

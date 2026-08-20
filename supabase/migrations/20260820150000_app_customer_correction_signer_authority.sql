begin;

-- CUSTOMER04C1 closes correction-signing name authority for the existing
-- Particulier party lineage. Zakelijk/VvE remain fail-closed until their
-- separately governed representation-authority source exists.

create function public.app_customer_correction_signer_name_normalize_v1(
  p_name text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select nullif(
    pg_catalog.btrim(pg_catalog.regexp_replace(
      p_name,
      '[[:space:]]+',
      ' ',
      'g'
    )),
    ''
  );
$$;

create function public.app_customer_correction_signer_context_v1(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_today date := (
    pg_catalog.timezone('Europe/Amsterdam', pg_catalog.statement_timestamp())
  )::date;
  v_case public.app_cases%rowtype;
  v_customer public.app_customers%rowtype;
  v_relationship public.app_customer_party_relationships%rowtype;
  v_party public.app_parties%rowtype;
  v_profile public.app_party_person_versions%rowtype;
  v_relationship_count integer;
  v_profile_count integer;
  v_expected_name text;
  v_authority_ref text;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  if not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_auth_user_id
      and auth_user.deleted_at is null
      and coalesce(
        auth_user.email_confirmed_at,
        auth_user.confirmed_at
      ) is not null
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 401, 'code', 'authentication_required'
    );
  end if;

  select case_row.*
    into v_case
  from public.app_cases case_row
  join public.app_customers customer_row
    on customer_row.id = case_row.customer_id
   and customer_row.status = 'active'
  where case_row.case_reference = p_case_ref;
  if not found or not exists (
    select 1
    from public.app_customer_access_grants access_grant
    where access_grant.auth_user_id = p_auth_user_id
      and access_grant.customer_id = v_case.customer_id
      and (
        access_grant.granted_case_id is null
        or access_grant.granted_case_id = v_case.id
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
    );
  end if;

  select customer_row.*
    into strict v_customer
  from public.app_customers customer_row
  where customer_row.id = v_case.customer_id
    and customer_row.status = 'active';

  if v_customer.customer_type in ('zakelijk', 'vve') then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'signer_authority_unavailable'
    );
  end if;
  if v_customer.customer_type <> 'particulier' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'signer_authority_unavailable'
    );
  end if;

  select pg_catalog.count(*)
    into v_relationship_count
  from public.app_customer_party_relationships relationship
  where relationship.customer_id = v_case.customer_id
    and relationship.relationship_role = 'account_owner'
    and relationship.valid_from <= v_today
    and (relationship.valid_to is null or v_today < relationship.valid_to)
    and not exists (
      select 1
      from public.app_customer_party_relationships successor
      where successor.supersedes_relationship_id = relationship.id
    );
  if v_relationship_count <> 1 then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', case when v_relationship_count = 0
        then 'signer_authority_missing'
        else 'signer_authority_ambiguous'
      end
    );
  end if;
  select relationship.*
    into strict v_relationship
  from public.app_customer_party_relationships relationship
  where relationship.customer_id = v_case.customer_id
    and relationship.relationship_role = 'account_owner'
    and relationship.valid_from <= v_today
    and (relationship.valid_to is null or v_today < relationship.valid_to)
    and not exists (
      select 1
      from public.app_customer_party_relationships successor
      where successor.supersedes_relationship_id = relationship.id
    );

  select party.*
    into v_party
  from public.app_parties party
  where party.id = v_relationship.party_id
    and party.party_kind = 'natural_person';
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'signer_authority_missing'
    );
  end if;

  select pg_catalog.count(*)
    into v_profile_count
  from public.app_party_person_versions profile
  where profile.party_id = v_party.id
    and profile.valid_from <= v_today
    and (profile.valid_to is null or v_today < profile.valid_to)
    and not exists (
      select 1
      from public.app_party_person_versions successor
      where successor.supersedes_person_version_id = profile.id
    );
  if v_profile_count <> 1 then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', case when v_profile_count = 0
        then 'signer_authority_missing'
        else 'signer_authority_ambiguous'
      end
    );
  end if;
  select profile.*
    into strict v_profile
  from public.app_party_person_versions profile
  where profile.party_id = v_party.id
    and profile.valid_from <= v_today
    and (profile.valid_to is null or v_today < profile.valid_to)
    and not exists (
      select 1
      from public.app_party_person_versions successor
      where successor.supersedes_person_version_id = profile.id
    );

  v_expected_name := public.app_customer_correction_signer_name_normalize_v1(
    v_profile.full_name
  );
  if v_expected_name is null
     or pg_catalog.char_length(v_expected_name) > 200 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'signer_authority_missing'
    );
  end if;
  select 'CSA-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
    extensions.digest(pg_catalog.concat_ws(
      '|',
      'customer-correction-signer-authority-v1',
      v_case.customer_id::text,
      v_relationship.id::text,
      v_party.id::text,
      v_profile.id::text
    ), 'sha256'),
    'hex'
  ), 1, 32))
    into v_authority_ref;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 200,
    'code', 'ok',
    'case_id', v_case.id,
    'customer_id', v_case.customer_id,
    'account_type', v_customer.customer_type,
    'expected_signer_display_name', v_expected_name,
    'expected_signer_name_normalized', v_expected_name,
    'expected_signer_authority_ref', v_authority_ref,
    'authority_model', 'current_account_owner_person_v1'
  );
end;
$$;

create table public.app_customer_correction_signer_challenge_bindings (
  challenge_id uuid primary key
    references public.app_signup_signing_challenges(id) on delete restrict,
  correction_handoff_id uuid not null
    references public.app_evidence_review_correction_handoffs(id)
    on delete restrict,
  case_id uuid not null references public.app_cases(id) on delete restrict,
  customer_id uuid not null
    references public.app_customers(id) on delete restrict,
  account_type text not null,
  authority_model text not null,
  expected_signer_display_name text not null,
  expected_signer_name_normalized text not null,
  expected_signer_authority_ref text not null,
  typed_signer_name_normalized text not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint app_customer_correction_signer_challenge_account_chk check (
    account_type in ('particulier', 'zakelijk', 'vve')
  ),
  constraint app_customer_correction_signer_challenge_model_chk check (
    authority_model in (
      'current_account_owner_person_v1',
      'current_authorized_representative_v1'
    )
  ),
  constraint app_customer_correction_signer_challenge_name_chk check (
    expected_signer_display_name = pg_catalog.btrim(
      expected_signer_display_name
    )
    and pg_catalog.char_length(expected_signer_display_name) between 1 and 200
    and expected_signer_name_normalized =
      public.app_customer_correction_signer_name_normalize_v1(
        expected_signer_display_name
      )
    and typed_signer_name_normalized = expected_signer_name_normalized
  ),
  constraint app_customer_correction_signer_challenge_ref_chk check (
    expected_signer_authority_ref ~ '^CSA-[A-F0-9]{32}$'
  )
);

create table public.app_customer_correction_signer_evidence_bindings (
  submission_id uuid primary key
    references public.app_evidence_review_customer_submissions(id)
    on delete restrict,
  signature_evidence_id uuid not null unique
    references public.app_signup_signature_evidence(id) on delete restrict,
  challenge_id uuid not null unique
    references public.app_customer_correction_signer_challenge_bindings(
      challenge_id
    ) on delete restrict,
  correction_handoff_id uuid not null
    references public.app_evidence_review_correction_handoffs(id)
    on delete restrict,
  case_id uuid not null references public.app_cases(id) on delete restrict,
  customer_id uuid not null
    references public.app_customers(id) on delete restrict,
  account_type text not null,
  authority_model text not null,
  expected_signer_display_name text not null,
  expected_signer_name_normalized text not null,
  expected_signer_authority_ref text not null,
  typed_signer_name_normalized text not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint app_customer_correction_signer_evidence_account_chk check (
    account_type in ('particulier', 'zakelijk', 'vve')
  ),
  constraint app_customer_correction_signer_evidence_model_chk check (
    authority_model in (
      'current_account_owner_person_v1',
      'current_authorized_representative_v1'
    )
  ),
  constraint app_customer_correction_signer_evidence_name_chk check (
    expected_signer_display_name = pg_catalog.btrim(
      expected_signer_display_name
    )
    and pg_catalog.char_length(expected_signer_display_name) between 1 and 200
    and expected_signer_name_normalized =
      public.app_customer_correction_signer_name_normalize_v1(
        expected_signer_display_name
      )
    and typed_signer_name_normalized = expected_signer_name_normalized
  ),
  constraint app_customer_correction_signer_evidence_ref_chk check (
    expected_signer_authority_ref ~ '^CSA-[A-F0-9]{32}$'
  )
);

create trigger trg_app_customer_correction_signer_challenge_bindings_immutable
before update or delete
on public.app_customer_correction_signer_challenge_bindings
for each row execute function
  public.app_customer_correction_immutable_guard_v1();

create trigger trg_app_customer_correction_signer_evidence_bindings_immutable
before update or delete
on public.app_customer_correction_signer_evidence_bindings
for each row execute function
  public.app_customer_correction_immutable_guard_v1();

create function public.app_customer_correction_handoff_read_v3(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_read jsonb;
  v_signer jsonb;
begin
  v_read := public.app_customer_correction_handoff_read_v2(
    p_auth_user_id,
    p_case_ref
  );
  if v_read->>'ok' <> 'true' or v_read->'handoff' is null then
    return v_read;
  end if;
  v_signer := public.app_customer_correction_signer_context_v1(
    p_auth_user_id,
    p_case_ref
  );
  if v_signer->>'ok' = 'true' then
    return pg_catalog.jsonb_set(
      v_read,
      '{handoff,signer_authority}',
      pg_catalog.jsonb_build_object(
        'status', 'available',
        'expected_signer_display_name',
          v_signer->>'expected_signer_display_name'
      ),
      true
    );
  end if;
  if v_signer->>'code' in (
    'signer_authority_missing',
    'signer_authority_ambiguous',
    'signer_authority_unavailable'
  ) then
    return pg_catalog.jsonb_set(
      v_read,
      '{handoff,signer_authority}',
      '{"status":"unavailable"}'::jsonb,
      true
    );
  end if;
  return v_signer;
end;
$$;

create function public.app_customer_correction_challenge_issue_v3(
  p_auth_user_id uuid,
  p_case_ref text,
  p_responses jsonb,
  p_typed_full_name text,
  p_channel_reference_sha256 text,
  p_otp_verifier_sha256 text,
  p_expires_at timestamptz,
  p_payload_sha256 text,
  p_legal_bundle_version text,
  p_legal_bundle_sha256 text,
  p_request_id text,
  p_idempotency_key text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signer jsonb;
  v_typed_name text;
  v_result jsonb;
  v_challenge public.app_signup_signing_challenges%rowtype;
  v_binding public.app_customer_correction_signer_challenge_bindings%rowtype;
begin
  v_typed_name := public.app_customer_correction_signer_name_normalize_v1(
    p_typed_full_name
  );
  if v_typed_name is null or pg_catalog.char_length(v_typed_name) > 200 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_signer := public.app_customer_correction_signer_context_v1(
    p_auth_user_id,
    p_case_ref
  );
  if v_signer->>'ok' <> 'true' then return v_signer; end if;
  if v_typed_name <> v_signer->>'expected_signer_name_normalized' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'signer_name_mismatch'
    );
  end if;

  v_result := public.app_customer_correction_challenge_issue_v2(
    p_auth_user_id,
    p_case_ref,
    p_responses,
    p_channel_reference_sha256,
    p_otp_verifier_sha256,
    p_expires_at,
    p_payload_sha256,
    p_legal_bundle_version,
    p_legal_bundle_sha256,
    p_request_id,
    p_idempotency_key,
    p_environment
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;

  select challenge.*
    into v_challenge
  from public.app_signup_signing_challenges challenge
  where challenge.id = (v_result->>'challenge_reference')::uuid
    and challenge.subject_type = 'CUSTOMER_CORRECTION';
  if not found then
    raise exception 'customer correction challenge unavailable after issue';
  end if;
  select binding.*
    into v_binding
  from public.app_customer_correction_signer_challenge_bindings binding
  where binding.challenge_id = v_challenge.id;
  if found then
    if v_binding.correction_handoff_id <> v_challenge.correction_handoff_id
       or v_binding.case_id <> (v_signer->>'case_id')::uuid
       or v_binding.customer_id <> (v_signer->>'customer_id')::uuid
       or v_binding.account_type <> v_signer->>'account_type'
       or v_binding.authority_model <> v_signer->>'authority_model'
       or v_binding.expected_signer_display_name <>
         v_signer->>'expected_signer_display_name'
       or v_binding.expected_signer_name_normalized <>
         v_signer->>'expected_signer_name_normalized'
       or v_binding.expected_signer_authority_ref <>
         v_signer->>'expected_signer_authority_ref'
       or v_binding.typed_signer_name_normalized <> v_typed_name then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'signer_authority_changed'
      );
    end if;
    return v_result;
  end if;

  insert into public.app_customer_correction_signer_challenge_bindings (
    challenge_id,
    correction_handoff_id,
    case_id,
    customer_id,
    account_type,
    authority_model,
    expected_signer_display_name,
    expected_signer_name_normalized,
    expected_signer_authority_ref,
    typed_signer_name_normalized
  ) values (
    v_challenge.id,
    v_challenge.correction_handoff_id,
    (v_signer->>'case_id')::uuid,
    (v_signer->>'customer_id')::uuid,
    v_signer->>'account_type',
    v_signer->>'authority_model',
    v_signer->>'expected_signer_display_name',
    v_signer->>'expected_signer_name_normalized',
    v_signer->>'expected_signer_authority_ref',
    v_typed_name
  );
  return v_result;
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
    );
  when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'internal_error'
    );
end;
$$;

create function public.app_customer_correction_finalize_v2(
  p_auth_user_id uuid,
  p_case_ref text,
  p_challenge_id uuid,
  p_otp_verifier_sha256 text,
  p_typed_full_name text,
  p_legal_bundle_version text,
  p_legal_bundle_sha256 text,
  p_request_id text,
  p_idempotency_key text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signer jsonb;
  v_typed_name text;
  v_challenge public.app_signup_signing_challenges%rowtype;
  v_binding public.app_customer_correction_signer_challenge_bindings%rowtype;
  v_result jsonb;
  v_submission public.app_evidence_review_customer_submissions%rowtype;
  v_signature public.app_signup_signature_evidence%rowtype;
  v_evidence_binding
    public.app_customer_correction_signer_evidence_bindings%rowtype;
begin
  v_typed_name := public.app_customer_correction_signer_name_normalize_v1(
    p_typed_full_name
  );
  if v_typed_name is null or pg_catalog.char_length(v_typed_name) > 200 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  select challenge.*
    into v_challenge
  from public.app_signup_signing_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.subject_type = 'CUSTOMER_CORRECTION';
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'challenge_unavailable'
    );
  end if;
  select binding.*
    into v_binding
  from public.app_customer_correction_signer_challenge_bindings binding
  where binding.challenge_id = v_challenge.id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'signer_authority_binding_missing'
    );
  end if;

  v_signer := public.app_customer_correction_signer_context_v1(
    p_auth_user_id,
    p_case_ref
  );
  if v_signer->>'ok' <> 'true' then return v_signer; end if;
  if v_typed_name <> v_signer->>'expected_signer_name_normalized' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'signer_name_mismatch'
    );
  end if;
  if v_binding.correction_handoff_id <> v_challenge.correction_handoff_id
     or v_binding.case_id <> (v_signer->>'case_id')::uuid
     or v_binding.customer_id <> (v_signer->>'customer_id')::uuid
     or v_binding.account_type <> v_signer->>'account_type'
     or v_binding.authority_model <> v_signer->>'authority_model'
     or v_binding.expected_signer_display_name <>
       v_signer->>'expected_signer_display_name'
     or v_binding.expected_signer_name_normalized <>
       v_signer->>'expected_signer_name_normalized'
     or v_binding.expected_signer_authority_ref <>
       v_signer->>'expected_signer_authority_ref'
     or v_binding.typed_signer_name_normalized <> v_typed_name then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'signer_authority_changed'
    );
  end if;

  v_result := public.app_customer_correction_finalize_v1(
    p_auth_user_id,
    p_case_ref,
    p_challenge_id,
    p_otp_verifier_sha256,
    v_typed_name,
    p_legal_bundle_version,
    p_legal_bundle_sha256,
    v_challenge.correction_payload_sha256,
    p_request_id,
    p_idempotency_key,
    p_environment
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;

  select submission.*
    into v_submission
  from public.app_evidence_review_customer_submissions submission
  where submission.handoff_id = v_binding.correction_handoff_id;
  if not found then
    raise exception 'customer correction submission missing after finalize';
  end if;
  select signature.*
    into v_signature
  from public.app_signup_signature_evidence signature
  where signature.id = v_submission.signature_evidence_id
    and signature.challenge_id = v_challenge.id
    and signature.subject_type = 'CUSTOMER_CORRECTION';
  if not found
     or public.app_customer_correction_signer_name_normalize_v1(
       v_signature.typed_full_name
     ) <> v_typed_name then
    raise exception 'customer correction signature authority mismatch';
  end if;

  select evidence_binding.*
    into v_evidence_binding
  from public.app_customer_correction_signer_evidence_bindings evidence_binding
  where evidence_binding.submission_id = v_submission.id;
  if found then
    if v_evidence_binding.signature_evidence_id <> v_signature.id
       or v_evidence_binding.challenge_id <> v_challenge.id
       or v_evidence_binding.expected_signer_authority_ref <>
         v_binding.expected_signer_authority_ref
       or v_evidence_binding.typed_signer_name_normalized <> v_typed_name then
      raise exception 'customer correction signer evidence binding conflict';
    end if;
    return v_result;
  end if;

  insert into public.app_customer_correction_signer_evidence_bindings (
    submission_id,
    signature_evidence_id,
    challenge_id,
    correction_handoff_id,
    case_id,
    customer_id,
    account_type,
    authority_model,
    expected_signer_display_name,
    expected_signer_name_normalized,
    expected_signer_authority_ref,
    typed_signer_name_normalized
  ) values (
    v_submission.id,
    v_signature.id,
    v_challenge.id,
    v_binding.correction_handoff_id,
    v_binding.case_id,
    v_binding.customer_id,
    v_binding.account_type,
    v_binding.authority_model,
    v_binding.expected_signer_display_name,
    v_binding.expected_signer_name_normalized,
    v_binding.expected_signer_authority_ref,
    v_typed_name
  );
  return v_result;
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
    );
  when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'internal_error'
    );
end;
$$;

alter table public.app_customer_correction_signer_challenge_bindings
  enable row level security;
alter table public.app_customer_correction_signer_evidence_bindings
  enable row level security;
create policy deny_all
  on public.app_customer_correction_signer_challenge_bindings
  for all using (false) with check (false);
create policy deny_all
  on public.app_customer_correction_signer_evidence_bindings
  for all using (false) with check (false);

revoke all on table
  public.app_customer_correction_signer_challenge_bindings
  from public, anon, authenticated, service_role;
revoke all on table
  public.app_customer_correction_signer_evidence_bindings
  from public, anon, authenticated, service_role;

revoke all on function
  public.app_customer_correction_signer_name_normalize_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function
  public.app_customer_correction_signer_context_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_signer_context_v1(uuid, text)
  to service_role;
revoke all on function
  public.app_customer_correction_handoff_read_v3(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_handoff_read_v3(uuid, text)
  to service_role;
revoke all on function public.app_customer_correction_challenge_issue_v2(
  uuid, text, jsonb, text, text, timestamptz,
  text, text, text, text, text, text
) from service_role;
revoke all on function public.app_customer_correction_challenge_issue_v3(
  uuid, text, jsonb, text, text, text, timestamptz,
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_challenge_issue_v3(
  uuid, text, jsonb, text, text, text, timestamptz,
  text, text, text, text, text, text
) to service_role;
revoke all on function public.app_customer_correction_finalize_v1(
  uuid, text, uuid, text, text, text, text, text, text, text, text
) from service_role;
revoke all on function public.app_customer_correction_finalize_v2(
  uuid, text, uuid, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_finalize_v2(
  uuid, text, uuid, text, text, text, text, text, text, text
) to service_role;

comment on function
  public.app_customer_correction_signer_context_v1(uuid, text) is
  'Private exact-customer correction signer projection. Particulier resolves one current account-owner natural-person profile; Zakelijk/VvE fail closed until explicit representation authority exists.';
comment on table
  public.app_customer_correction_signer_challenge_bindings is
  'Immutable server-owned expected-signer authority and typed-name binding for one customer-correction challenge.';
comment on table
  public.app_customer_correction_signer_evidence_bindings is
  'Immutable independently revalidated expected-signer authority binding for finalized customer-correction signature evidence.';
comment on function
  public.app_customer_correction_handoff_read_v3(uuid, text) is
  'Authenticated correction handoff v3 with customer-safe expected signer display projection and fail-closed unavailable status.';
comment on function public.app_customer_correction_challenge_issue_v3(
  uuid, text, jsonb, text, text, text, timestamptz,
  text, text, text, text, text, text
) is
  'Service-role-only correction challenge issue that validates and immutably binds the current server-authoritative signer before challenge creation.';
comment on function public.app_customer_correction_finalize_v2(
  uuid, text, uuid, text, text, text, text, text, text, text
) is
  'Service-role-only correction finalize wrapper that independently revalidates signer authority and atomically binds it to immutable signature evidence.';

commit;

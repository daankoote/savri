-- CUSTOMER04B1: customer-safe action/item projection over immutable handoff truth.

create function public.app_customer_correction_item_ref_v1(
  p_handoff_id uuid,
  p_case_id uuid,
  p_customer_id uuid,
  p_subject_ref text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'CCI-' || pg_catalog.upper(pg_catalog.substr(
    pg_catalog.encode(extensions.digest(
      'customer-correction-item-v1|' || p_handoff_id::text || '|' ||
      p_case_id::text || '|' || p_customer_id::text || '|' || p_subject_ref,
      'sha256'
    ), 'hex'),
    1,
    32
  ));
$$;

create function public.app_customer_correction_handoff_read_v2(
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
  v_case public.app_cases%rowtype;
  v_manifest jsonb;
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_items jsonb;
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
      and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at)
        is not null
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
      and (access_grant.granted_case_id is null
        or access_grant.granted_case_id = v_case.id)
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
    );
  end if;

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'not_available',
      'case_ref', v_case.case_reference, 'handoff', null
    );
  end if;
  select handoff.*
    into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.case_id = v_case.id
    and handoff.target_customer_id = v_case.customer_id
    and handoff.manifest_version = v_manifest->>'manifest_version'
    and handoff.manifest_hash = v_manifest->>'manifest_hash'
    and not exists (
      select 1
      from public.app_evidence_review_customer_submissions submission
      where submission.handoff_id = handoff.id
    );
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'not_available',
      'case_ref', v_case.case_reference, 'handoff', null
    );
  end if;
  if v_handoff.bundle_sha256 <> pg_catalog.encode(
    extensions.digest(v_handoff.correction_bundle::text, 'sha256'), 'hex'
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'item_ref', public.app_customer_correction_item_ref_v1(
        v_handoff.id,
        v_case.id,
        v_case.customer_id,
        bundle.item->>'subject_ref'
      ),
      'document_label', bundle.item->'customer_safe'->>'document_label',
      'fact_label', bundle.item->'customer_safe'->>'fact_label',
      'current_value', bundle.item->'customer_safe'->'current_value',
      'correction_reason',
        bundle.item->'customer_safe'->>'correction_reason',
      'correction_reason_label',
        bundle.item->'customer_safe'->>'correction_reason_label',
      'correction_instruction',
        bundle.item->'customer_safe'->>'correction_instruction',
      'response_requirement',
        public.app_customer_correction_action_requirement_v1(
          bundle.item,
          subject.item->>'value_status'
        )
    )
  ) order by bundle.ordinality), '[]'::jsonb)
    into v_items
  from pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
    with ordinality bundle(item, ordinality)
  join pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    on subject.item->>'subject_ref' = bundle.item->>'subject_ref';

  if pg_catalog.jsonb_array_length(v_items) <>
       pg_catalog.jsonb_array_length(v_handoff.correction_bundle->'items')
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_items) item(value)
       where item.value->>'item_ref' !~ '^CCI-[A-F0-9]{32}$'
          or item.value->>'response_requirement' not in (
            'VALUE_CORRECTION',
            'MISSING_VALUE',
            'DOCUMENT_REPLACEMENT',
            'VALUE_PLUS_DOCUMENT_REPLACEMENT'
          )
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 200,
    'code', 'ok',
    'case_ref', v_case.case_reference,
    'handoff', pg_catalog.jsonb_build_object(
      'handoff_ref', v_handoff.handoff_reference,
      'published_at', v_handoff.published_at,
      'items', v_items
    )
  );
end;
$$;

create function public.app_customer_correction_prepare_v2(
  p_auth_user_id uuid,
  p_case_ref text,
  p_responses jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_read jsonb;
  v_translated jsonb;
  v_prepare jsonb;
begin
  if pg_catalog.jsonb_typeof(p_responses) <> 'array'
     or pg_catalog.jsonb_array_length(p_responses) not between 1 and 100
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(p_responses) response(item)
       where pg_catalog.jsonb_typeof(response.item) <> 'object'
          or (select pg_catalog.count(*)
              from pg_catalog.jsonb_object_keys(response.item)) <> 2
          or not (response.item ? 'itemRef')
          or not (response.item ? 'correctedValue')
          or response.item->>'itemRef' !~ '^CCI-[A-F0-9]{32}$'
          or pg_catalog.jsonb_typeof(response.item->'correctedValue') <>
            'string'
     )
     or (select pg_catalog.count(distinct response.item->>'itemRef')
         from pg_catalog.jsonb_array_elements(p_responses) response(item)) <>
        pg_catalog.jsonb_array_length(p_responses) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'response_set_mismatch'
    );
  end if;

  v_read := public.app_customer_correction_handoff_read_v2(
    p_auth_user_id,
    p_case_ref
  );
  if v_read->>'ok' <> 'true' then return v_read; end if;
  if v_read->'handoff' is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'current_unanswered_handoff_missing'
    );
  end if;
  if pg_catalog.jsonb_array_length(p_responses) <>
       pg_catalog.jsonb_array_length(v_read#>'{handoff,items}') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'response_set_mismatch'
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'itemIndex', server_item.ordinality - 1,
    'correctedValue', response.item->>'correctedValue'
  ) order by server_item.ordinality), '[]'::jsonb)
    into v_translated
  from pg_catalog.jsonb_array_elements(v_read#>'{handoff,items}')
    with ordinality server_item(item, ordinality)
  join pg_catalog.jsonb_array_elements(p_responses) response(item)
    on response.item->>'itemRef' = server_item.item->>'item_ref';
  if pg_catalog.jsonb_array_length(v_translated) <>
       pg_catalog.jsonb_array_length(p_responses) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'response_set_mismatch'
    );
  end if;

  v_prepare := public.app_customer_correction_prepare_v1(
    p_auth_user_id,
    p_case_ref,
    v_translated
  );
  if v_prepare->>'ok' <> 'true' then return v_prepare; end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_prepare->'items') prepared(item)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_responses) response(item)
      where response.item->>'itemRef' =
        public.app_customer_correction_item_ref_v1(
          (v_prepare->>'handoff_id')::uuid,
          (v_prepare->>'case_id')::uuid,
          (v_prepare->>'customer_id')::uuid,
          prepared.item->>'handoff_subject_ref'
        )
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'stale_correction_context'
    );
  end if;
  return v_prepare;
end;
$$;

create function public.app_customer_correction_challenge_issue_v2(
  p_auth_user_id uuid,
  p_case_ref text,
  p_responses jsonb,
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
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_prepare jsonb;
  v_existing public.app_signup_signing_challenges%rowtype;
  v_id uuid;
begin
  if p_channel_reference_sha256 !~ '^[0-9a-f]{64}$'
     or p_otp_verifier_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_legal_bundle_version <>
       'customer-correction-confirmation-nl-v1'
     or p_legal_bundle_sha256 !~ '^[0-9a-f]{64}$'
     or p_expires_at <= v_now
     or p_expires_at > v_now + interval '10 minutes'
     or p_request_id is null
     or p_request_id <> pg_catalog.btrim(p_request_id)
     or pg_catalog.char_length(p_request_id) not between 1 and 128
     or p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
     or p_environment not in ('local', 'staging', 'production') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_prepare := public.app_customer_correction_prepare_v2(
    p_auth_user_id,
    p_case_ref,
    p_responses
  );
  if v_prepare->>'ok' <> 'true' then return v_prepare; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-correction-challenge-v1:' || (v_prepare->>'handoff_id'),
    0
  ));
  select challenge.*
    into v_existing
  from public.app_signup_signing_challenges challenge
  where challenge.subject_type = 'CUSTOMER_CORRECTION'
    and challenge.correction_handoff_id = (v_prepare->>'handoff_id')::uuid
    and challenge.correction_idempotency_key = p_idempotency_key;
  if found then
    if v_existing.correction_payload_sha256 = p_payload_sha256
       and v_existing.correction_legal_bundle_version = p_legal_bundle_version
       and v_existing.correction_legal_bundle_sha256 = p_legal_bundle_sha256
       and v_existing.delivery_status = 'delivered'
       and v_existing.replaced_at is null
       and v_existing.consumed_at is null
       and v_existing.expires_at > v_now then
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'status', 200,
        'code', 'replayed',
        'replayed', true,
        'challenge_reference', v_existing.id,
        'expires_at', v_existing.expires_at,
        'item_count',
          pg_catalog.jsonb_array_length(v_existing.correction_payload->'items')
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'idempotency_conflict'
    );
  end if;

  update public.app_signup_signing_challenges
  set replaced_at = v_now
  where subject_type = 'CUSTOMER_CORRECTION'
    and correction_handoff_id = (v_prepare->>'handoff_id')::uuid
    and consumed_at is null
    and replaced_at is null;
  v_id := gen_random_uuid();
  insert into public.app_signup_signing_challenges (
    id,
    intake_id,
    method_id,
    method_version,
    channel_reference_sha256,
    otp_verifier_sha256,
    expires_at,
    subject_type,
    correction_handoff_id,
    correction_payload,
    correction_payload_sha256,
    correction_legal_bundle_version,
    correction_legal_bundle_sha256,
    correction_request_id,
    correction_idempotency_key,
    correction_environment
  ) values (
    v_id,
    null,
    'typed_name_otp_v1',
    '1',
    p_channel_reference_sha256,
    p_otp_verifier_sha256,
    p_expires_at,
    'CUSTOMER_CORRECTION',
    (v_prepare->>'handoff_id')::uuid,
    v_prepare,
    p_payload_sha256,
    p_legal_bundle_version,
    p_legal_bundle_sha256,
    p_request_id,
    p_idempotency_key,
    p_environment
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 201,
    'code', 'issued',
    'replayed', false,
    'challenge_reference', v_id,
    'expires_at', p_expires_at,
    'item_count', pg_catalog.jsonb_array_length(v_prepare->'items')
  );
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

revoke all on function public.app_customer_correction_item_ref_v1(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_handoff_read_v2(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_handoff_read_v2(
  uuid, text
) to service_role;
revoke all on function public.app_customer_correction_prepare_v2(
  uuid, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_challenge_issue_v2(
  uuid, text, jsonb, text, text, timestamptz,
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_challenge_issue_v2(
  uuid, text, jsonb, text, text, timestamptz,
  text, text, text, text, text, text
) to service_role;

comment on function public.app_customer_correction_item_ref_v1(
  uuid, uuid, uuid, text
) is
  'Private deterministic opaque customer item reference bound to one immutable handoff, case, customer and internal review subject.';
comment on function public.app_customer_correction_handoff_read_v2(
  uuid, text
) is
  'Authenticated customer-safe current correction handoff read with opaque item references and server-owned closed response requirements.';
comment on function public.app_customer_correction_prepare_v2(
  uuid, text, jsonb
) is
  'Private itemRef input adapter that resolves exact immutable handoff items and delegates canonical validation and snapshot preparation to CUSTOMER04A prepare v1.';
comment on function public.app_customer_correction_challenge_issue_v2(
  uuid, text, jsonb, text, text, timestamptz,
  text, text, text, text, text, text
) is
  'Service-role-only CUSTOMER04B1 challenge issue accepting opaque customer item references while preserving CUSTOMER04A immutable prepared payload and finalize v1 compatibility.';

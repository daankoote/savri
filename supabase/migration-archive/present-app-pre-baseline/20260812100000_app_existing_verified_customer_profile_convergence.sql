-- ENVAL 09C1C-R2 existing verified customer profile convergence.
--
-- Forward-only replacement only. The already applied
-- 20260811100000_app_post_signing_customer_convergence.sql remains unchanged.
--
-- This keeps the existing atomic promotion transaction, intake/identity locks,
-- idempotency and provenance. It adds no table or column and performs no
-- backfill. Convergence is on demand from one newly finalized immutable signed
-- intake, only for one uniquely Auth-bound compatible legacy customer.
--
-- Identical signed party facts from the account and document presentation are
-- one declaration value, not an ambiguity. Different values still fail closed.
-- A missing current profile is appended as signed_signup_intake DECLARED truth;
-- no accepted/current profile is updated or superseded, and no profile is
-- independently identity-verified by OTP, Auth or email control.
--
-- For the eligible existing particular account, the stable account-owner party
-- remains service recipient and case contact. The typed signer stays immutable
-- signing evidence and is not promoted into identity or representation truth.
-- New/unbound particular accounts retain the existing signer/service equality
-- rule. Zakelijk/VvE retain required_not_completed authority review.

create or replace function public.app_promote_signed_signup_v1(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
        and customer_row.primary_email_normalized = v_intake.email_normalized;

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
      and customer_row.primary_email_normalized = v_intake.email_normalized;
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
$$;

revoke all on function public.app_promote_signed_signup_v1(jsonb)
from public, anon, authenticated;
grant execute on function public.app_promote_signed_signup_v1(jsonb)
to service_role;

comment on function public.app_promote_signed_signup_v1(jsonb) is
'Atomically promotes one finalized signed intake. R2 permits on-demand append-only declared-profile convergence only for one uniquely Auth-bound compatible legacy customer; it never performs email-only merge, profile verification, accepted-profile overwrite or authority acceptance.';

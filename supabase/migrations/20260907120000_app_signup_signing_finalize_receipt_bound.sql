begin;

alter table public.app_signup_signing_presentation_receipts
  add column privacy_notice_effective_from timestamptz null,
  add column service_terms_effective_from timestamptz null,
  add column fee_terms_effective_from timestamptz null,
  add column mandate_effective_from timestamptz null;

alter table public.app_signup_signing_presentation_receipts
  drop constraint app_signup_signing_presentation_receipt_schema_valid,
  add constraint app_signup_signing_presentation_receipt_schema_valid check (
    receipt_schema_version in (
      'signup-signing-presentation-receipt-v1',
      'signup-signing-presentation-receipt-v2'
    )
  ),
  add constraint app_signup_signing_presentation_receipt_effective_dates check (
    (receipt_schema_version = 'signup-signing-presentation-receipt-v1'
      and privacy_notice_effective_from is null
      and service_terms_effective_from is null
      and fee_terms_effective_from is null
      and mandate_effective_from is null)
    or
    (receipt_schema_version = 'signup-signing-presentation-receipt-v2'
      and privacy_notice_effective_from is not null
      and service_terms_effective_from is not null
      and fee_terms_effective_from is not null
      and mandate_effective_from is not null
      and privacy_notice_effective_from <= presented_at
      and service_terms_effective_from <= presented_at
      and fee_terms_effective_from <= presented_at
      and mandate_effective_from <= presented_at)
  );

alter table public.app_signup_signing_snapshots
  drop constraint app_signup_signing_snapshots_schema_chk,
  add column presentation_receipt_id uuid null references
    public.app_signup_signing_presentation_receipts(id) on delete restrict,
  add column presentation_receipt_reference text null,
  add column presentation_receipt_sha256 text null,
  add column presentation_acceptance_id uuid null references
    public.app_signup_signing_presentation_acceptances(id) on delete restrict,
  add column presentation_acceptance_sha256 text null,
  add column authenticated_auth_user_id uuid null,
  add column tenant_id uuid null,
  add column environment text null,
  add column finalization_fingerprint_sha256 text null,
  add constraint app_signup_signing_snapshots_schema_chk check (
    schema_version in (
      'signup-signing-runtime-snapshot-v1',
      'signup-signing-runtime-snapshot-v2'
    )
  ),
  add constraint app_signup_signing_snapshots_presentation_complete check (
    (schema_version = 'signup-signing-runtime-snapshot-v1'
      and presentation_receipt_id is null
      and presentation_receipt_reference is null
      and presentation_receipt_sha256 is null
      and presentation_acceptance_id is null
      and presentation_acceptance_sha256 is null
      and authenticated_auth_user_id is null
      and tenant_id is null
      and environment is null
      and finalization_fingerprint_sha256 is null)
    or
    (schema_version = 'signup-signing-runtime-snapshot-v2'
      and presentation_receipt_id is not null
      and presentation_receipt_reference ~
        '^SPR-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and presentation_receipt_sha256 ~ '^[0-9a-f]{64}$'
      and presentation_acceptance_id is not null
      and presentation_acceptance_sha256 ~ '^[0-9a-f]{64}$'
      and authenticated_auth_user_id is not null
      and tenant_id is not null
      and environment ~ '^[a-z][a-z0-9_-]{1,63}$'
      and finalization_fingerprint_sha256 ~ '^[0-9a-f]{64}$')
  );

create unique index app_signup_signing_snapshots_receipt_unique
  on public.app_signup_signing_snapshots(presentation_receipt_id)
  where presentation_receipt_id is not null;

alter table public.app_signup_legal_acceptances
  add column presentation_receipt_id uuid null references
    public.app_signup_signing_presentation_receipts(id) on delete restrict,
  add column presentation_acceptance_id uuid null references
    public.app_signup_signing_presentation_acceptances(id) on delete restrict,
  add constraint app_signup_legal_acceptances_presentation_complete check (
    (presentation_receipt_id is null and presentation_acceptance_id is null)
    or
    (presentation_receipt_id is not null and presentation_acceptance_id is not null)
  );

alter table public.app_signup_signature_evidence
  add column presentation_receipt_id uuid null references
    public.app_signup_signing_presentation_receipts(id) on delete restrict,
  add column presentation_acceptance_id uuid null references
    public.app_signup_signing_presentation_acceptances(id) on delete restrict,
  add constraint app_signup_signature_evidence_presentation_complete check (
    (presentation_receipt_id is null and presentation_acceptance_id is null)
    or
    (presentation_receipt_id is not null and presentation_acceptance_id is not null)
  );

create function public.app_signup_signing_finalize_v3(
  p_intake_id uuid,
  p_manage_token_sha256 text,
  p_authenticated_auth_user_id uuid,
  p_tenant_id uuid,
  p_challenge_id uuid,
  p_channel_reference_sha256 text,
  p_otp_verifier_sha256 text,
  p_payload_hash text,
  p_canonical_snapshot jsonb,
  p_snapshot_sha256 text,
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
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-signing-finalize:v3:' || p_intake_id::text;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_challenge public.app_signup_signing_challenges%rowtype;
  v_receipt public.app_signup_signing_presentation_receipts%rowtype;
  v_acceptance public.app_signup_signing_presentation_acceptances%rowtype;
  v_existing_snapshot public.app_signup_signing_snapshots%rowtype;
  v_snapshot_id uuid := gen_random_uuid();
  v_mandate_id uuid := gen_random_uuid();
  v_evidence_id uuid := gen_random_uuid();
  v_response jsonb;
  v_file_count integer;
  v_distinct_file_count integer;
  v_legal_match_count integer;
  v_bad_fact boolean;
  v_safe_reference text;
  v_legal_documents jsonb;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_channel_reference_sha256 !~ '^[0-9a-f]{64}$'
     or p_otp_verifier_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     or p_account_type not in ('particulier', 'zakelijk', 'vve')
     or p_mandate_year not between 2020 and 2100
     or p_issued_at is null
     or p_issued_at < v_now - interval '1 minute'
     or p_issued_at > v_now + interval '1 minute'
     or p_method_version <> '1'
     or p_typed_full_name is null or btrim(p_typed_full_name) = ''
     or (p_account_type <> 'particulier'
       and (p_signer_role is null or btrim(p_signer_role) = ''))
     or p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or p_request_id is null or btrim(p_request_id) = ''
     or p_environment !~ '^[a-z][a-z0-9_-]{1,63}$'
     or jsonb_typeof(p_canonical_snapshot) <> 'object'
     or p_canonical_snapshot ->> 'schema_version' <>
       'signup-signing-runtime-snapshot-v2'
     or jsonb_typeof(p_mandate_content) <> 'object'
     or coalesce(array_length(p_required_file_ids, 1), 0) = 0
  then
    raise exception 'invalid receipt-bound signing finalization input';
  end if;

  insert into public.app_idempotency_keys (
    scope, key, payload_hash, locked_at, expires_at
  ) values (
    v_scope, p_idempotency_key, p_payload_hash, v_now,
    v_now + interval '24 hours'
  ) on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_idem from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key for update;
  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'idempotency_conflict',
      'error', 'Aanvraagcode is al gebruikt.'
    );
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'request_in_progress',
      'error', 'Ondertekening wordt al verwerkt.'
    );
  end if;

  select * into v_manage from public.app_signup_intake_capabilities
  where intake_id = p_intake_id and intake_file_id is null
    and capability_type = 'intake_manage'
    and token_sha256 = p_manage_token_sha256 for update;
  if not found or v_manage.invalidated_at is not null
     or v_manage.expires_at <= v_now then
    raise exception 'signup intake capability unavailable';
  end if;

  select * into v_intake from public.app_signup_intakes
  where id = p_intake_id for update;
  if not found or v_intake.expires_at <= v_now then
    raise exception 'signup intake unavailable';
  end if;
  if v_intake.status <> 'collecting' then
    select * into v_existing_snapshot
    from public.app_signup_signing_snapshots
    where intake_id = p_intake_id;
    if found
       and v_existing_snapshot.schema_version =
         'signup-signing-runtime-snapshot-v2'
       and v_existing_snapshot.finalization_fingerprint_sha256 = p_payload_hash
    then
      v_safe_reference := 'SIG-' || upper(substr(
        v_existing_snapshot.canonical_snapshot_sha256, 1, 12
      ));
      v_response := jsonb_build_object(
        'ok', true, 'status', 200,
        'mode', 'signup_signing_finalize_v3',
        'safe_reference', v_safe_reference,
        'intake_status', 'submitted_for_review', 'replayed', true
      );
      update public.app_idempotency_keys
      set response_status = 200, response_body = v_response,
        completed_at = v_now
      where scope = v_scope and key = p_idempotency_key;
      return v_response;
    end if;
    return jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'intake_locked',
      'error', 'Deze aanmelding kan niet meer worden gewijzigd.'
    );
  end if;
  if v_manage.consumed_at is not null then
    raise exception 'signup intake capability unavailable';
  end if;

  select * into v_challenge from public.app_signup_signing_challenges
  where id = p_challenge_id and intake_id = p_intake_id for update;
  if not found or v_challenge.delivery_status <> 'delivered'
     or v_challenge.replaced_at is not null
     or v_challenge.consumed_at is not null
  then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'challenge_unavailable',
      'error', 'Vraag een nieuwe code aan.'
    );
  end if;
  if v_challenge.presentation_receipt_id is null
     or v_challenge.presentation_acceptance_id is null
  then
    return jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'signing_presentation_required',
      'error', 'Vraag de documenten en een nieuwe code aan.'
    );
  end if;
  if v_challenge.channel_reference_sha256 <> p_channel_reference_sha256 then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'channel_mismatch',
      'error', 'Vraag een nieuwe code aan.'
    );
  end if;
  if v_challenge.expires_at <= v_now then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'otp_expired',
      'error', 'De code is verlopen. Vraag een nieuwe code aan.'
    );
  end if;
  if v_challenge.attempts_remaining <= 0 then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'attempts_exhausted',
      'error', 'Vraag een nieuwe code aan.'
    );
  end if;

  select * into v_receipt
  from public.app_signup_signing_presentation_receipts
  where id = v_challenge.presentation_receipt_id for update;
  if not found
     or v_receipt.receipt_schema_version <>
       'signup-signing-presentation-receipt-v2'
     or v_receipt.intake_id <> p_intake_id
     or v_receipt.authenticated_auth_user_id <> p_authenticated_auth_user_id
     or v_receipt.tenant_id <> p_tenant_id
     or v_receipt.environment <> p_environment
     or v_receipt.receipt_reference <>
       v_challenge.presentation_receipt_reference
     or v_receipt.receipt_sha256 <> v_challenge.presentation_receipt_sha256
  then
    return jsonb_build_object(
      'ok', false, 'status', 403,
      'code', 'presentation_receipt_unavailable',
      'error', 'Vraag de documenten opnieuw op.'
    );
  end if;
  if v_receipt.expires_at <= v_now then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'presentation_receipt_expired',
      'error', 'Vraag de documenten opnieuw op.'
    );
  end if;
  if exists (
    select 1 from public.app_tenant_signing_configuration_invalidations invalidation
    where invalidation.tenant_id = v_receipt.tenant_id
      and invalidation.environment = v_receipt.environment
      and invalidation.effective_at <= v_now
      and invalidation.subject_reference in (
        v_receipt.manifest_revision_id,
        v_receipt.operational_component_revision_id,
        v_receipt.legal_component_revision_id,
        v_receipt.fee_component_revision_id,
        v_receipt.operational_signing_material_revision_id,
        v_receipt.legal_signing_material_revision_id,
        v_receipt.fee_signing_material_revision_id
      )
  ) then
    return jsonb_build_object(
      'ok', false, 'status', 422,
      'code', 'signing_configuration_invalidated',
      'error', 'Vraag de documenten opnieuw op.'
    );
  end if;

  select * into v_acceptance
  from public.app_signup_signing_presentation_acceptances
  where id = v_challenge.presentation_acceptance_id for update;
  if not found
     or v_acceptance.presentation_receipt_id <> v_receipt.id
     or v_acceptance.intake_id <> p_intake_id
     or v_acceptance.authenticated_actor_user_id <>
       p_authenticated_auth_user_id
     or v_acceptance.acceptance_sha256 <>
       v_challenge.presentation_acceptance_sha256
     or not v_acceptance.privacy_notice_read
     or not v_acceptance.service_terms_accepted
     or not v_acceptance.fee_terms_accepted
     or not v_acceptance.mandate_signed
  then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'legal_acceptance_mismatch',
      'error', 'Vraag de documenten en een nieuwe code aan.'
    );
  end if;

  if v_challenge.otp_verifier_sha256 <> p_otp_verifier_sha256 then
    update public.app_signup_signing_challenges
    set attempts_remaining = greatest(attempts_remaining - 1, 0)
    where id = p_challenge_id;
    v_response := jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'otp_invalid',
      'error', 'De code klopt niet.',
      'attempts_remaining', greatest(v_challenge.attempts_remaining - 1, 0)
    );
    update public.app_idempotency_keys
    set response_status = 422, response_body = v_response,
      completed_at = v_now
    where scope = v_scope and key = p_idempotency_key;
    return v_response;
  end if;

  select count(*), count(distinct candidate)
  into v_file_count, v_distinct_file_count
  from unnest(p_required_file_ids) candidate;
  if v_file_count <> v_distinct_file_count then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'file_scope_invalid',
      'error', 'Controleer de documenten.'
    );
  end if;
  select count(*) into v_file_count
  from public.app_signup_intake_files
  where intake_id = p_intake_id and id = any(p_required_file_ids)
    and status = 'confirmed_quarantine' and superseded_at is null
    and superseded_by_intake_file_id is null;
  if v_file_count <> array_length(p_required_file_ids, 1) then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'required_files_unavailable',
      'error', 'Controleer de documenten.'
    );
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(
      p_canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb
    )) fact
    where coalesce((fact ->> 'required')::boolean, false)
      and (coalesce(fact ->> 'value', '') = ''
        or fact ->> 'resolution_state' in ('pending', 'blocked'))
  ) into v_bad_fact;
  if v_bad_fact or jsonb_array_length(coalesce(
    p_canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb
  )) = 0 then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'facts_not_ready',
      'error', 'Controleer de verplichte gegevens.'
    );
  end if;

  v_legal_documents := p_canonical_snapshot -> 'legal_documents';
  if jsonb_typeof(v_legal_documents) <> 'array'
     or jsonb_array_length(v_legal_documents) <> 4
     or (select count(distinct item ->> 'document_type')
       from jsonb_array_elements(v_legal_documents) item) <> 4
     or exists (
       select 1 from jsonb_array_elements(v_legal_documents) item,
         lateral jsonb_object_keys(item) key
       where key not in (
         'document_type', 'version', 'language', 'status',
         'effective_from', 'content_sha256'
       )
     )
  then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'legal_bundle_invalid',
      'error', 'Juridische documenten zijn niet beschikbaar.'
    );
  end if;

  select count(*) into v_legal_match_count
  from jsonb_to_recordset(v_legal_documents) as item(
    document_type text, version text, language text, status text,
    effective_from timestamptz, content_sha256 text
  )
  where item.status = 'effective'
    and case item.document_type
      when 'privacy_notice' then
        item.version = v_receipt.privacy_notice_version
        and item.language = v_receipt.privacy_notice_language
        and item.effective_from = v_receipt.privacy_notice_effective_from
        and item.content_sha256 = v_receipt.privacy_notice_content_sha256
      when 'service_terms' then
        item.version = v_receipt.service_terms_version
        and item.language = v_receipt.service_terms_language
        and item.effective_from = v_receipt.service_terms_effective_from
        and item.content_sha256 = v_receipt.service_terms_content_sha256
      when 'fee_terms' then
        item.version = v_receipt.fee_terms_version
        and item.language = v_receipt.fee_terms_language
        and item.effective_from = v_receipt.fee_terms_effective_from
        and item.content_sha256 = v_receipt.fee_terms_content_sha256
      when 'mandate' then
        item.version = v_receipt.mandate_version
        and item.language = v_receipt.mandate_language
        and item.effective_from = v_receipt.mandate_effective_from
        and item.content_sha256 = v_receipt.mandate_content_sha256
      else false
    end;
  if v_legal_match_count <> 4 then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'legal_bundle_mismatch',
      'error', 'Vraag de documenten opnieuw op.'
    );
  end if;

  if p_canonical_snapshot ->> 'intake_reference' <> p_intake_id::text
     or p_canonical_snapshot ->> 'account_type' <> p_account_type
     or p_canonical_snapshot #>> '{presentation,receipt_reference}' <>
       v_receipt.receipt_reference
     or p_canonical_snapshot #>> '{presentation,receipt_sha256}' <>
       v_receipt.receipt_sha256
     or p_canonical_snapshot #>> '{presentation,acceptance_reference}' <>
       v_acceptance.id::text
     or p_canonical_snapshot #>> '{presentation,acceptance_sha256}' <>
       v_acceptance.acceptance_sha256
     or p_canonical_snapshot #>> '{presentation,tenant_id}' <>
       p_tenant_id::text
     or p_canonical_snapshot #>> '{presentation,environment}' <> p_environment
     or p_canonical_snapshot #>> '{presentation,data_plane_locator_id}' <>
       v_receipt.data_plane_locator_id
     or p_canonical_snapshot #>>
       '{presentation,resolved_data_plane_reference}' <>
       v_receipt.resolved_data_plane_reference
     or p_canonical_snapshot #>> '{presentation,manifest_revision_id}' <>
       v_receipt.manifest_revision_id::text
     or p_canonical_snapshot #>>
       '{presentation,manifest_canonical_sha256}' <>
       v_receipt.manifest_canonical_sha256
     or p_canonical_snapshot #>>
       '{presentation,operational_component_revision_id}' <>
       v_receipt.operational_component_revision_id::text
     or p_canonical_snapshot #>>
       '{presentation,legal_component_revision_id}' <>
       v_receipt.legal_component_revision_id::text
     or p_canonical_snapshot #>> '{presentation,fee_component_revision_id}' <>
       v_receipt.fee_component_revision_id::text
     or p_canonical_snapshot #>>
       '{presentation,operational_signing_material_revision_id}' <>
       v_receipt.operational_signing_material_revision_id::text
     or p_canonical_snapshot #>>
       '{presentation,operational_signing_material_sha256}' <>
       v_receipt.operational_signing_material_sha256
     or p_canonical_snapshot #>>
       '{presentation,legal_signing_material_revision_id}' <>
       v_receipt.legal_signing_material_revision_id::text
     or p_canonical_snapshot #>>
       '{presentation,legal_signing_material_sha256}' <>
       v_receipt.legal_signing_material_sha256
     or p_canonical_snapshot #>>
       '{presentation,fee_signing_material_revision_id}' <>
       v_receipt.fee_signing_material_revision_id::text
     or p_canonical_snapshot #>>
       '{presentation,fee_signing_material_sha256}' <>
       v_receipt.fee_signing_material_sha256
     or p_canonical_snapshot #>> '{presentation,legal_bundle_revision}' <>
       v_receipt.legal_bundle_revision
     or p_canonical_snapshot #>> '{presentation,legal_bundle_sha256}' <>
       v_receipt.legal_bundle_sha256
     or (p_canonical_snapshot #>> '{presentation,presented_at}')::timestamptz <>
       v_receipt.presented_at
     or (p_canonical_snapshot #>> '{presentation,expires_at}')::timestamptz <>
       v_receipt.expires_at
     or p_canonical_snapshot #>> '{signature_method,method_id}' <>
       'typed_name_otp_v1'
     or p_canonical_snapshot #>> '{signature_method,method_version}' <>
       p_method_version
     or p_canonical_snapshot #>> '{signer,typed_full_name}' <>
       p_typed_full_name
     or coalesce(p_canonical_snapshot #>> '{signer,signer_role}', '') <>
       coalesce(p_signer_role, '')
     or p_canonical_snapshot -> 'mandate' <> p_mandate_content
     or (p_canonical_snapshot ->> 'server_issue_date')::timestamptz <>
       p_issued_at
     or coalesce((
       select array_agg(value order by value)
       from jsonb_array_elements_text(
         p_canonical_snapshot -> 'required_file_references'
       ) value
     ), array[]::text[]) <> (
       select array_agg(candidate::text order by candidate::text)
       from unnest(p_required_file_ids) candidate
     )
     or p_canonical_snapshot -> 'legal_actions' <>
       jsonb_build_object(
         'privacy_notice_read', true,
         'service_terms_accepted', true,
         'fee_terms_accepted', true,
         'mandate_signed', true
       )
     or (p_mandate_content -> 'validity' -> 'calendar_years') <>
       jsonb_build_array(p_mandate_year)
  then
    return jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'signing_snapshot_mismatch',
      'error', 'Controleer de ondertekening.'
    );
  end if;

  insert into public.app_signup_signing_snapshots (
    id, intake_id, schema_version, canonical_snapshot,
    canonical_snapshot_sha256, presentation_receipt_id,
    presentation_receipt_reference, presentation_receipt_sha256,
    presentation_acceptance_id, presentation_acceptance_sha256,
    authenticated_auth_user_id, tenant_id, environment,
    finalization_fingerprint_sha256
  ) values (
    v_snapshot_id, p_intake_id, 'signup-signing-runtime-snapshot-v2',
    p_canonical_snapshot, p_snapshot_sha256, v_receipt.id,
    v_receipt.receipt_reference, v_receipt.receipt_sha256, v_acceptance.id,
    v_acceptance.acceptance_sha256, p_authenticated_auth_user_id,
    p_tenant_id, p_environment, p_payload_hash
  );

  insert into public.app_signup_legal_acceptances (
    intake_id, snapshot_id, action_type, document_type, document_version,
    language, content_sha256, accepted_at, presentation_receipt_id,
    presentation_acceptance_id
  )
  select p_intake_id, v_snapshot_id,
    case item ->> 'document_type'
      when 'privacy_notice' then 'privacy_notice_read'
      when 'service_terms' then 'service_terms_accepted'
      when 'fee_terms' then 'fee_terms_accepted'
    end,
    item ->> 'document_type', item ->> 'version', item ->> 'language',
    item ->> 'content_sha256', v_acceptance.accepted_at, v_receipt.id,
    v_acceptance.id
  from jsonb_array_elements(v_legal_documents) item
  where item ->> 'document_type' <> 'mandate';

  insert into public.app_signup_mandates (
    id, intake_id, snapshot_id, account_type, calendar_year, issued_at,
    mandate_content, authority_review_status
  ) values (
    v_mandate_id, p_intake_id, v_snapshot_id, p_account_type,
    p_mandate_year, p_issued_at, p_mandate_content,
    case when p_account_type = 'particulier'
      then 'not_applicable' else 'required_not_completed' end
  );

  insert into public.app_signup_signature_evidence (
    id, intake_id, snapshot_id, mandate_id, challenge_id, method_id,
    method_version, typed_full_name, signer_role,
    channel_reference_sha256, evidence_envelope, finalized_at,
    presentation_receipt_id, presentation_acceptance_id
  ) values (
    v_evidence_id, p_intake_id, v_snapshot_id, v_mandate_id,
    p_challenge_id, 'typed_name_otp_v1', p_method_version,
    btrim(p_typed_full_name), coalesce(btrim(p_signer_role), ''),
    v_challenge.channel_reference_sha256,
    jsonb_build_object(
      'evidence_version', 'signing-evidence-v2',
      'method_id', 'typed_name_otp_v1',
      'method_version', p_method_version,
      'challenge_reference', p_challenge_id,
      'verified_channel_reference', v_challenge.channel_reference_sha256,
      'verified_at', v_now,
      'snapshot_sha256', p_snapshot_sha256,
      'presentation_receipt_reference', v_receipt.receipt_reference,
      'presentation_receipt_sha256', v_receipt.receipt_sha256,
      'presentation_acceptance_reference', v_acceptance.id,
      'presentation_acceptance_sha256', v_acceptance.acceptance_sha256,
      'legal_documents', v_legal_documents,
      'request_reference', p_request_id
    ), v_now, v_receipt.id, v_acceptance.id
  );

  update public.app_signup_signing_challenges
  set consumed_at = v_now where id = p_challenge_id;
  update public.app_signup_intake_capabilities
  set consumed_at = v_now where id = v_manage.id;
  update public.app_signup_intakes
  set status = 'submitted_for_review', finalized_at = v_now,
    accepted_legal_versions = jsonb_build_object(
      'receipt_reference', v_receipt.receipt_reference,
      'receipt_sha256', v_receipt.receipt_sha256,
      'items', v_legal_documents
    )
  where id = p_intake_id;

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, actor_ref,
    ip_hash, user_agent_hash, event_data
  ) values (
    'signup_signing_finalized', p_request_id, p_idempotency_key,
    'customer', 'auth_user:' || p_authenticated_auth_user_id::text,
    p_ip_hash, p_user_agent_hash,
    jsonb_build_object(
      'environment', p_environment,
      'tenant_id', p_tenant_id,
      'intake_reference', p_intake_id,
      'presentation_receipt_reference', v_receipt.receipt_reference,
      'presentation_acceptance_reference', v_acceptance.id,
      'snapshot_reference', v_snapshot_id,
      'mandate_reference', v_mandate_id,
      'evidence_reference', v_evidence_id,
      'method_id', 'typed_name_otp_v1',
      'calendar_year', p_mandate_year,
      'next_status', 'submitted_for_review'
    )
  );

  v_safe_reference := 'SIG-' || upper(substr(p_snapshot_sha256, 1, 12));
  v_response := jsonb_build_object(
    'ok', true, 'status', 201,
    'mode', 'signup_signing_finalize_v3',
    'safe_reference', v_safe_reference,
    'intake_status', 'submitted_for_review', 'replayed', false
  );
  update public.app_idempotency_keys
  set response_status = 201, response_body = v_response,
    completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;
  return v_response;
end;
$$;

revoke all on function public.app_signup_signing_finalize_v3(
  uuid, text, uuid, uuid, uuid, text, text, text, jsonb, text, uuid[],
  text, integer, timestamptz, jsonb, text, text, text, text, text, text,
  text, text
) from public, anon, authenticated;
grant execute on function public.app_signup_signing_finalize_v3(
  uuid, text, uuid, uuid, uuid, text, text, text, jsonb, text, uuid[],
  text, integer, timestamptz, jsonb, text, text, text, text, text, text,
  text, text
) to service_role;

commit;

begin;

-- CUSTOMER04A extends the existing typed_name_otp_v1 storage with a closed
-- customer-correction subject. Existing signup rows and RPCs retain their
-- original defaults and behavior.
alter table public.app_signup_signing_challenges
  alter column intake_id drop not null,
  add column subject_type text not null default 'SIGNUP_INTAKE',
  add column correction_handoff_id uuid
    references public.app_evidence_review_correction_handoffs(id)
    on delete restrict,
  add column correction_payload jsonb,
  add column correction_payload_sha256 text,
  add column correction_legal_bundle_version text,
  add column correction_legal_bundle_sha256 text,
  add column correction_request_id text,
  add column correction_idempotency_key text,
  add column correction_environment text,
  add constraint app_signup_signing_challenges_subject_chk check (
    (
      subject_type = 'SIGNUP_INTAKE'
      and intake_id is not null
      and correction_handoff_id is null
      and correction_payload is null
      and correction_payload_sha256 is null
      and correction_legal_bundle_version is null
      and correction_legal_bundle_sha256 is null
      and correction_request_id is null
      and correction_idempotency_key is null
      and correction_environment is null
    ) or (
      subject_type = 'CUSTOMER_CORRECTION'
      and intake_id is null
      and correction_handoff_id is not null
      and pg_catalog.jsonb_typeof(correction_payload) = 'object'
      and correction_payload_sha256 ~ '^[0-9a-f]{64}$'
      and correction_legal_bundle_version =
        'customer-correction-confirmation-nl-v1'
      and correction_legal_bundle_sha256 ~ '^[0-9a-f]{64}$'
      and correction_request_id = pg_catalog.btrim(correction_request_id)
      and pg_catalog.char_length(correction_request_id) between 1 and 128
      and correction_idempotency_key =
        pg_catalog.btrim(correction_idempotency_key)
      and pg_catalog.char_length(correction_idempotency_key) between 1 and 200
      and correction_environment in ('local', 'staging', 'production')
    )
  );

create unique index app_signup_signing_challenges_correction_idempotency_idx
  on public.app_signup_signing_challenges(
    correction_handoff_id, correction_idempotency_key
  ) where subject_type = 'CUSTOMER_CORRECTION';
create unique index app_signup_signing_challenges_one_active_correction_idx
  on public.app_signup_signing_challenges(correction_handoff_id)
  where subject_type = 'CUSTOMER_CORRECTION'
    and consumed_at is null and replaced_at is null
    and delivery_status in ('pending', 'delivered');

alter table public.app_signup_signing_snapshots
  alter column intake_id drop not null,
  add column subject_type text not null default 'SIGNUP_INTAKE',
  add column subject_ref uuid,
  add column parent_snapshot_id uuid
    references public.app_signup_signing_snapshots(id) on delete restrict,
  add constraint app_signup_signing_snapshots_subject_chk check (
    (
      subject_type = 'SIGNUP_INTAKE'
      and intake_id is not null
      and subject_ref is null
      and parent_snapshot_id is null
    ) or (
      subject_type = 'CUSTOMER_CORRECTION'
      and intake_id is null
      and subject_ref is not null
      and parent_snapshot_id is not null
    )
  );
create unique index app_signup_signing_snapshots_subject_idx
  on public.app_signup_signing_snapshots(subject_type, subject_ref)
  where subject_ref is not null;

alter table public.app_signup_signature_evidence
  alter column intake_id drop not null,
  alter column mandate_id drop not null,
  add column subject_type text not null default 'SIGNUP_INTAKE',
  add column subject_ref uuid,
  add constraint app_signup_signature_evidence_subject_chk check (
    (
      subject_type = 'SIGNUP_INTAKE'
      and intake_id is not null
      and mandate_id is not null
      and subject_ref is null
    ) or (
      subject_type = 'CUSTOMER_CORRECTION'
      and intake_id is null
      and mandate_id is null
      and subject_ref is not null
    )
  );
create unique index app_signup_signature_evidence_subject_idx
  on public.app_signup_signature_evidence(subject_type, subject_ref)
  where subject_ref is not null;

create table public.app_evidence_review_customer_submissions (
  id uuid primary key,
  submission_reference text not null unique,
  handoff_id uuid not null unique
    references public.app_evidence_review_correction_handoffs(id)
    on delete restrict,
  case_id uuid not null references public.app_cases(id) on delete restrict,
  customer_id uuid not null
    references public.app_customers(id) on delete restrict,
  correction_generation integer not null,
  parent_snapshot_id uuid not null
    references public.app_signup_signing_snapshots(id) on delete restrict,
  parent_snapshot_sha256 text not null,
  resulting_snapshot_id uuid not null unique
    references public.app_signup_signing_snapshots(id) on delete restrict,
  resulting_snapshot_sha256 text not null,
  signature_evidence_id uuid not null unique
    references public.app_signup_signature_evidence(id) on delete restrict,
  signing_method_id text not null,
  signing_method_version text not null,
  correction_legal_bundle_version text not null,
  correction_legal_bundle_sha256 text not null,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  customer_identity_id uuid not null
    references public.app_customer_identities(id) on delete restrict,
  actor_ref text not null,
  normalized_payload_sha256 text not null,
  request_id text not null unique,
  idempotency_key text not null,
  environment text not null,
  finalized_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint app_evidence_review_customer_submissions_ref_chk check (
    submission_reference ~ '^CRS-[0-9A-F]{16}$'
    and actor_ref ~ '^app_customer_identity:[0-9a-f-]{36}$'
    and request_id = pg_catalog.btrim(request_id)
    and pg_catalog.char_length(request_id) between 1 and 128
    and idempotency_key = pg_catalog.btrim(idempotency_key)
    and pg_catalog.char_length(idempotency_key) between 1 and 200
  ),
  constraint app_evidence_review_customer_submissions_generation_chk check (
    correction_generation >= 1
  ),
  constraint app_evidence_review_customer_submissions_hash_chk check (
    parent_snapshot_sha256 ~ '^[0-9a-f]{64}$'
    and resulting_snapshot_sha256 ~ '^[0-9a-f]{64}$'
    and correction_legal_bundle_sha256 ~ '^[0-9a-f]{64}$'
    and normalized_payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_evidence_review_customer_submissions_signing_chk check (
    signing_method_id = 'typed_name_otp_v1'
    and signing_method_version = '1'
    and correction_legal_bundle_version =
      'customer-correction-confirmation-nl-v1'
  ),
  constraint app_evidence_review_customer_submissions_environment_chk check (
    environment in ('local', 'staging', 'production')
  ),
  constraint app_evidence_review_customer_submissions_time_chk check (
    finalized_at <= recorded_at
  ),
  constraint app_evidence_review_customer_submissions_idempotency_key
    unique (handoff_id, idempotency_key)
);

create table public.app_evidence_review_customer_submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.app_evidence_review_customer_submissions(id)
    on delete restrict,
  item_index integer not null,
  handoff_subject_ref text not null,
  resulting_subject_ref text not null,
  fact_id text not null,
  fact_key text not null,
  scope_ref text not null,
  evidence_file_id uuid not null
    references public.app_evidence_files(id) on delete restrict,
  evidence_version_id uuid not null
    references public.app_evidence_versions(id) on delete restrict,
  evidence_sha256 text not null,
  action_requirement text not null,
  prior_canonical_value text,
  prior_value_sha256 text not null,
  submitted_value text not null,
  resulting_canonical_value text not null,
  resulting_value_sha256 text not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint app_evidence_review_customer_submission_items_key
    unique (submission_id, item_index),
  constraint app_evidence_review_customer_submission_items_subject_key
    unique (submission_id, handoff_subject_ref),
  constraint app_evidence_review_customer_submission_items_refs_chk check (
    handoff_subject_ref ~ '^FRS-[0-9a-f]{64}$'
    and resulting_subject_ref ~ '^FRS-[0-9a-f]{64}$'
    and scope_ref ~ '^FRSCOPE-[0-9a-f]{64}$'
    and pg_catalog.btrim(fact_id) <> ''
    and pg_catalog.btrim(fact_key) <> ''
  ),
  constraint app_evidence_review_customer_submission_items_hash_chk check (
    evidence_sha256 ~ '^[0-9a-f]{64}$'
    and prior_value_sha256 ~ '^[0-9a-f]{64}$'
    and resulting_value_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_evidence_review_customer_submission_items_action_chk check (
    action_requirement in ('VALUE_CORRECTION', 'MISSING_VALUE')
  ),
  constraint app_evidence_review_customer_submission_items_value_chk check (
    submitted_value = pg_catalog.btrim(submitted_value)
    and resulting_canonical_value = submitted_value
    and pg_catalog.char_length(submitted_value) between 1 and 2000
  )
);

create table public.app_evidence_review_decision_carry_forwards (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.app_evidence_review_customer_submissions(id)
    on delete restrict,
  prior_decision_id uuid not null
    references public.app_evidence_review_round_subject_decisions(id)
    on delete restrict,
  prior_subject_ref text not null,
  resulting_subject_ref text not null,
  fact_key text not null,
  scope_ref text not null,
  previous_evidence_version_id uuid not null
    references public.app_evidence_versions(id) on delete restrict,
  current_evidence_version_id uuid not null
    references public.app_evidence_versions(id) on delete restrict,
  previous_evidence_sha256 text not null,
  current_evidence_sha256 text not null,
  previous_value_sha256 text not null,
  current_value_sha256 text not null,
  equivalence_proof_version text not null,
  equivalence_proof_sha256 text not null,
  origin text not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint app_evidence_review_decision_carry_forwards_subject_key
    unique (submission_id, resulting_subject_ref),
  constraint app_evidence_review_decision_carry_forwards_refs_chk check (
    prior_subject_ref ~ '^FRS-[0-9a-f]{64}$'
    and resulting_subject_ref ~ '^FRS-[0-9a-f]{64}$'
    and scope_ref ~ '^FRSCOPE-[0-9a-f]{64}$'
  ),
  constraint app_evidence_review_decision_carry_forwards_hash_chk check (
    previous_evidence_sha256 ~ '^[0-9a-f]{64}$'
    and current_evidence_sha256 ~ '^[0-9a-f]{64}$'
    and previous_value_sha256 ~ '^[0-9a-f]{64}$'
    and current_value_sha256 ~ '^[0-9a-f]{64}$'
    and equivalence_proof_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_evidence_review_decision_carry_forwards_equivalence_chk check (
    previous_evidence_version_id = current_evidence_version_id
    and previous_evidence_sha256 = current_evidence_sha256
    and previous_value_sha256 = current_value_sha256
    and equivalence_proof_version = 'customer-correction-carry-v1'
    and origin = 'CARRIED_FORWARD_ACCEPTED'
  )
);

create function public.app_customer_correction_immutable_guard_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'customer correction history is immutable';
end;
$$;
create trigger trg_app_evidence_review_customer_submissions_immutable
before update or delete on public.app_evidence_review_customer_submissions
for each row execute function public.app_customer_correction_immutable_guard_v1();
create trigger trg_app_evidence_review_customer_submission_items_immutable
before update or delete on public.app_evidence_review_customer_submission_items
for each row execute function public.app_customer_correction_immutable_guard_v1();
create trigger trg_app_evidence_review_decision_carry_forwards_immutable
before update or delete on public.app_evidence_review_decision_carry_forwards
for each row execute function public.app_customer_correction_immutable_guard_v1();

create function public.app_customer_correction_action_requirement_v1(
  p_handoff_item jsonb,
  p_value_status text
)
returns text language plpgsql immutable set search_path = '' as $$
declare v_explicit text;
begin
  v_explicit := p_handoff_item->>'action_requirement';
  if v_explicit in (
    'VALUE_CORRECTION', 'MISSING_VALUE', 'DOCUMENT_REPLACEMENT',
    'VALUE_PLUS_DOCUMENT_REPLACEMENT'
  ) then return v_explicit; end if;
  if v_explicit is not null then return null; end if;
  if p_value_status = 'REQUIRED_MISSING' then return 'MISSING_VALUE'; end if;
  if p_value_status = 'PRESENT' then return 'VALUE_CORRECTION'; end if;
  return null;
end;
$$;

create function public.app_customer_correction_normalize_value_v1(
  p_fact_key text,
  p_value text
)
returns text language plpgsql immutable set search_path = '' as $$
declare v_value text;
begin
  v_value := pg_catalog.btrim(pg_catalog.regexp_replace(
    coalesce(p_value, ''), '[[:space:]]+', ' ', 'g'
  ));
  if v_value = '' then return null; end if;
  if p_fact_key = 'electricityEan' then
    if v_value !~ '^[0-9]{18}$' then return null; end if;
  elsif p_fact_key = 'energySupplier' then
    if pg_catalog.char_length(v_value) > 100 then return null; end if;
  elsif p_fact_key in ('partyName', 'chargerBrand', 'chargerModel',
    'midNumber', 'serialNumber') then
    if pg_catalog.char_length(v_value) > 200 then return null; end if;
  elsif p_fact_key = 'structuredAddress' then
    if pg_catalog.char_length(v_value) > 500 then return null; end if;
  else return null;
  end if;
  return v_value;
end;
$$;

create function public.app_customer_correction_prepare_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_responses jsonb
)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare
  v_case public.app_cases%rowtype;
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_manifest jsonb;
  v_parent public.app_signup_signing_snapshots%rowtype;
  v_items jsonb;
  v_snapshot jsonb;
  v_facts jsonb;
  v_item record;
  v_fact_found boolean;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or pg_catalog.jsonb_typeof(p_responses) <> 'array'
     or pg_catalog.jsonb_array_length(p_responses) not between 1 and 100 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  if not exists (
    select 1 from auth.users auth_user
    where auth_user.id = p_auth_user_id
      and auth_user.deleted_at is null
      and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at)
        is not null
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 401, 'code', 'authentication_required'
  ); end if;
  select case_row.* into v_case
  from public.app_cases case_row
  join public.app_customers customer_row
    on customer_row.id = case_row.customer_id
   and customer_row.status = 'active'
  where case_row.case_reference = p_case_ref;
  if not found or not exists (
    select 1 from public.app_customer_access_grants access_grant
    where access_grant.auth_user_id = p_auth_user_id
      and access_grant.customer_id = v_case.customer_id
      and (access_grant.granted_case_id is null
        or access_grant.granted_case_id = v_case.id)
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
  ); end if;

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'current_manifest_unavailable'
  ); end if;
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.case_id = v_case.id
    and handoff.target_customer_id = v_case.customer_id
    and handoff.manifest_version = v_manifest->>'manifest_version'
    and handoff.manifest_hash = v_manifest->>'manifest_hash'
    and not exists (
      select 1 from public.app_evidence_review_customer_submissions submission
      where submission.handoff_id = handoff.id
    );
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'current_unanswered_handoff_missing'
  ); end if;
  if v_handoff.bundle_sha256 <> pg_catalog.encode(
    extensions.digest(v_handoff.correction_bundle::text, 'sha256'), 'hex'
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
  ); end if;
  if pg_catalog.jsonb_array_length(p_responses) <>
       pg_catalog.jsonb_array_length(v_handoff.correction_bundle->'items')
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(p_responses) response(item)
       where pg_catalog.jsonb_typeof(response.item) <> 'object'
          or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(response.item)) <> 2
          or not (response.item ? 'itemIndex')
          or not (response.item ? 'correctedValue')
          or pg_catalog.jsonb_typeof(response.item->'itemIndex') <> 'number'
          or pg_catalog.jsonb_typeof(response.item->'correctedValue') <> 'string'
     )
     or (select pg_catalog.count(distinct (item->>'itemIndex')::integer)
         from pg_catalog.jsonb_array_elements(p_responses) response(item)) <>
        pg_catalog.jsonb_array_length(p_responses) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'response_set_mismatch'
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'item_index', bundle.ordinality - 1,
    'handoff_subject_ref', bundle.item->>'subject_ref',
    'fact_id', subject.item->>'fact_id',
    'fact_key', subject.item->>'fact_key',
    'scope_ref', subject.item->>'scope_ref',
    'evidence_file_id', subject.item->>'evidence_file_id',
    'evidence_version_id', subject.item->>'evidence_version_id',
    'evidence_sha256', evidence_version.sha256,
    'action_requirement', public.app_customer_correction_action_requirement_v1(
      bundle.item, subject.item->>'value_status'
    ),
    'prior_value', subject.item->'value',
    'prior_value_sha256', subject.item->>'value_sha256',
    'corrected_value', public.app_customer_correction_normalize_value_v1(
      subject.item->>'fact_key', response.item->>'correctedValue'
    )
  ) order by bundle.ordinality), '[]'::jsonb) into v_items
  from pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
    with ordinality bundle(item, ordinality)
  join pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    on subject.item->>'subject_ref' = bundle.item->>'subject_ref'
  join public.app_evidence_versions evidence_version
    on evidence_version.id = (subject.item->>'evidence_version_id')::uuid
  left join pg_catalog.jsonb_array_elements(p_responses) response(item)
    on (response.item->>'itemIndex')::integer = bundle.ordinality - 1;

  if pg_catalog.jsonb_array_length(v_items) <>
       pg_catalog.jsonb_array_length(p_responses)
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(v_items) item(value)
       where item.value->>'action_requirement' not in (
         'VALUE_CORRECTION', 'MISSING_VALUE'
       ) or item.value->>'corrected_value' is null
     ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'unsupported_or_invalid_correction'
  ); end if;

  select snapshot.* into v_parent
  from public.app_signup_signing_snapshots snapshot
  where snapshot.id = (
    select (subject.item->>'signing_snapshot_id')::uuid
    from pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    limit 1
  );
  if not found or exists (
    select 1 from pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    where subject.item->>'signing_snapshot_id' <> v_parent.id::text
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'parent_snapshot_ambiguous'
  ); end if;

  v_snapshot := v_parent.canonical_snapshot;
  v_facts := coalesce(v_snapshot #> '{canonical_facts,facts}', '[]'::jsonb);
  for v_item in select item.value
    from pg_catalog.jsonb_array_elements(v_items) item(value)
    order by (item.value->>'item_index')::integer
  loop
    select exists (
      select 1 from pg_catalog.jsonb_array_elements(v_facts) fact(value)
      where fact.value->>'fact_id' = v_item.value->>'fact_id'
    ) into v_fact_found;
    select coalesce(pg_catalog.jsonb_agg(
      case when fact.value->>'fact_id' = v_item.value->>'fact_id'
        then pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(fact.value, '{value}',
            pg_catalog.to_jsonb(v_item.value->>'corrected_value')),
          '{resolution_state}', '"review_required"'::jsonb
        )
        else fact.value end order by fact.ordinality
    ), '[]'::jsonb) into v_facts
    from pg_catalog.jsonb_array_elements(v_facts)
      with ordinality fact(value, ordinality);
    if not v_fact_found then
      v_facts := v_facts || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'fact_id', v_item.value->>'fact_id',
          'fact_key', v_item.value->>'fact_key',
          'value', v_item.value->>'corrected_value',
          'resolution_state', 'review_required',
          'required', true
        )
      );
    end if;
  end loop;
  v_snapshot := pg_catalog.jsonb_set(
    v_snapshot, '{canonical_facts,facts}', v_facts
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'prepared',
    'case_id', v_case.id, 'customer_id', v_case.customer_id,
    'handoff_id', v_handoff.id,
    'handoff_ref', v_handoff.handoff_reference,
    'handoff_bundle_sha256', v_handoff.bundle_sha256,
    'source_round_id', v_handoff.round_id,
    'source_manifest_version', v_handoff.manifest_version,
    'source_manifest_hash', v_handoff.manifest_hash,
    'parent_snapshot_id', v_parent.id,
    'parent_snapshot_sha256', v_parent.canonical_snapshot_sha256,
    'snapshot_draft', v_snapshot,
    'items', v_items,
    'responses', p_responses
  );
end;
$$;

create function public.app_customer_correction_challenge_issue_v1(
  p_auth_user_id uuid, p_case_ref text, p_responses jsonb,
  p_channel_reference_sha256 text, p_otp_verifier_sha256 text,
  p_expires_at timestamptz, p_payload_sha256 text,
  p_legal_bundle_version text, p_legal_bundle_sha256 text,
  p_request_id text, p_idempotency_key text, p_environment text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
     or p_request_id is null or p_request_id <> pg_catalog.btrim(p_request_id)
     or pg_catalog.char_length(p_request_id) not between 1 and 128
     or p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
     or p_environment not in ('local', 'staging', 'production') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_prepare := public.app_customer_correction_prepare_v1(
    p_auth_user_id, p_case_ref, p_responses
  );
  if v_prepare->>'ok' <> 'true' then return v_prepare; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-correction-challenge-v1:' || (v_prepare->>'handoff_id'), 0
  ));
  select challenge.* into v_existing
  from public.app_signup_signing_challenges challenge
  where challenge.subject_type = 'CUSTOMER_CORRECTION'
    and challenge.correction_handoff_id =
      (v_prepare->>'handoff_id')::uuid
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
        'ok', true, 'status', 200, 'code', 'replayed', 'replayed', true,
        'challenge_reference', v_existing.id,
        'expires_at', v_existing.expires_at,
        'item_count', pg_catalog.jsonb_array_length(v_existing.correction_payload->'items')
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
    and consumed_at is null and replaced_at is null;
  v_id := gen_random_uuid();
  insert into public.app_signup_signing_challenges (
    id, intake_id, method_id, method_version,
    channel_reference_sha256, otp_verifier_sha256, expires_at,
    subject_type, correction_handoff_id, correction_payload,
    correction_payload_sha256, correction_legal_bundle_version,
    correction_legal_bundle_sha256, correction_request_id,
    correction_idempotency_key, correction_environment
  ) values (
    v_id, null, 'typed_name_otp_v1', '1',
    p_channel_reference_sha256, p_otp_verifier_sha256, p_expires_at,
    'CUSTOMER_CORRECTION', (v_prepare->>'handoff_id')::uuid, v_prepare,
    p_payload_sha256, p_legal_bundle_version, p_legal_bundle_sha256,
    p_request_id, p_idempotency_key, p_environment
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'issued', 'replayed', false,
    'challenge_reference', v_id, 'expires_at', p_expires_at,
    'item_count', pg_catalog.jsonb_array_length(v_prepare->'items')
  );
exception when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
  );
when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

-- Preserve the REVIEW15 implementation as the original-source projection,
-- then wrap it so every subject is rebound to the newest immutable correction
-- snapshot without changing the canonical snapshot schema.
alter function public.app_evidence_fact_review_manifest_v1(uuid)
  rename to app_evidence_fact_review_manifest_source_v1;

create function public.app_evidence_fact_review_manifest_v1(p_case_id uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare
  v_base jsonb;
  v_submission public.app_evidence_review_customer_submissions%rowtype;
  v_snapshot public.app_signup_signing_snapshots%rowtype;
  v_subjects jsonb;
  v_hash text;
begin
  v_base := public.app_evidence_fact_review_manifest_source_v1(p_case_id);
  if v_base->>'ok' <> 'true' then return v_base; end if;
  select submission.* into v_submission
  from public.app_evidence_review_customer_submissions submission
  where submission.case_id = p_case_id
  order by submission.correction_generation desc, submission.finalized_at desc
  limit 1;
  if not found then return v_base; end if;
  select snapshot.* into v_snapshot
  from public.app_signup_signing_snapshots snapshot
  where snapshot.id = v_submission.resulting_snapshot_id
    and snapshot.subject_type = 'CUSTOMER_CORRECTION'
    and snapshot.subject_ref = v_submission.id;
  if not found or v_snapshot.canonical_snapshot_sha256 <>
      v_submission.resulting_snapshot_sha256 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'correction_snapshot_integrity_failed'
    );
  end if;
  with rebound as (
    select subject.ordinality,
      subject.item,
      coalesce(fact.value->>'value', '') as current_value,
      case when pg_catalog.btrim(coalesce(fact.value->>'value', '')) = ''
        then 'REQUIRED_MISSING' else 'PRESENT' end as current_value_status,
      evidence_version.sha256 as evidence_sha256
    from pg_catalog.jsonb_array_elements(v_base->'subjects')
      with ordinality subject(item, ordinality)
    join public.app_evidence_versions evidence_version
      on evidence_version.id = (subject.item->>'evidence_version_id')::uuid
    left join lateral (
      select candidate.value
      from pg_catalog.jsonb_array_elements(coalesce(
        v_snapshot.canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb
      )) candidate(value)
      where candidate.value->>'fact_id' = subject.item->>'fact_id'
      limit 1
    ) fact on true
  ), refs as (
    select rebound.*,
      pg_catalog.encode(extensions.digest(rebound.current_value, 'sha256'), 'hex')
        as current_value_sha256,
      'FRS-' || pg_catalog.encode(extensions.digest(
        pg_catalog.concat_ws('|',
          'fact-review-subject-v1', p_case_id::text,
          rebound.item->>'evidence_version_id', rebound.evidence_sha256,
          v_snapshot.id::text, rebound.item->>'fact_id',
          rebound.item->>'fact_key', rebound.item->>'scope_ref',
          pg_catalog.encode(extensions.digest(rebound.current_value, 'sha256'), 'hex'),
          rebound.item->>'required', rebound.current_value_status
        ), 'sha256'
      ), 'hex') as current_subject_ref
    from rebound
  )
  select pg_catalog.jsonb_agg(
    refs.item || pg_catalog.jsonb_build_object(
      'subject_ref', refs.current_subject_ref,
      'signing_snapshot_id', v_snapshot.id,
      'value', case when refs.current_value_status = 'PRESENT'
        then pg_catalog.to_jsonb(refs.current_value) else 'null'::jsonb end,
      'value_sha256', refs.current_value_sha256,
      'value_status', refs.current_value_status,
      'truth_class', case when submission_item.id is not null
        then 'REVIEW_REQUIRED' when carry.id is not null
          and refs.current_value_status = 'PRESENT'
        then 'CUSTOMER_CONFIRMED' else refs.item->>'truth_class' end,
      'review_reason', case when submission_item.id is not null
        then 'USER_OVERRIDE' when carry.id is not null
          and refs.current_value_status = 'PRESENT'
        then null else refs.item->>'review_reason' end,
      'review_reason_authority', case when submission_item.id is not null
        then 'CUSTOMER_SIGNED_RESOLUTION' when carry.id is not null
          and refs.current_value_status = 'PRESENT'
        then null else refs.item->>'review_reason_authority' end,
      'reviewer_suggestion', case when carry.id is not null
          and refs.current_value_status = 'PRESENT'
        then 'ACCEPT' else 'NONE' end,
      'decision_origin', case when carry.id is not null
        then 'CARRIED_FORWARD_ACCEPTED' else null end
    ) order by refs.ordinality
  ) into v_subjects
  from refs
  left join public.app_evidence_review_customer_submission_items submission_item
    on submission_item.submission_id = v_submission.id
   and submission_item.resulting_subject_ref = refs.current_subject_ref
  left join public.app_evidence_review_decision_carry_forwards carry
    on carry.submission_id = v_submission.id
   and carry.resulting_subject_ref = refs.current_subject_ref;
  select pg_catalog.encode(extensions.digest(
    'fact-review-manifest-v1|submitted_for_review|' ||
    pg_catalog.jsonb_array_length(v_subjects)::text || '|' ||
    coalesce(pg_catalog.string_agg(subject.item->>'subject_ref', '|'
      order by subject.ordinality), ''), 'sha256'
  ), 'hex') into v_hash
  from pg_catalog.jsonb_array_elements(v_subjects)
    with ordinality subject(item, ordinality);
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'manifest_version', 'fact-review-manifest-v1',
    'manifest_hash', v_hash, 'subjects', v_subjects
  );
end;
$$;

create function public.app_customer_correction_finalize_v1(
  p_auth_user_id uuid, p_case_ref text, p_challenge_id uuid,
  p_otp_verifier_sha256 text, p_typed_full_name text,
  p_legal_bundle_version text, p_legal_bundle_sha256 text,
  p_payload_sha256 text, p_request_id text, p_idempotency_key text,
  p_environment text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_challenge public.app_signup_signing_challenges%rowtype;
  v_prepare jsonb;
  v_fresh jsonb;
  v_existing public.app_evidence_review_customer_submissions%rowtype;
  v_identity public.app_customer_identities%rowtype;
  v_submission_id uuid := gen_random_uuid();
  v_snapshot_id uuid := gen_random_uuid();
  v_signature_id uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_snapshot_sha text;
  v_submission_ref text;
  v_envelope jsonb;
  v_generation integer;
  v_new_manifest jsonb;
  v_item record;
  v_subject jsonb;
  v_resulting_subject_ref text;
  v_carry_count integer := 0;
  v_item_count integer := 0;
begin
  if p_auth_user_id is null or p_case_ref is null or p_challenge_id is null
     or p_otp_verifier_sha256 !~ '^[0-9a-f]{64}$'
     or p_typed_full_name is null
     or p_typed_full_name <> pg_catalog.btrim(p_typed_full_name)
     or pg_catalog.char_length(p_typed_full_name) not between 1 and 200
     or p_legal_bundle_version <>
       'customer-correction-confirmation-nl-v1'
     or p_legal_bundle_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_request_id is null or p_request_id <> pg_catalog.btrim(p_request_id)
     or pg_catalog.char_length(p_request_id) not between 1 and 128
     or p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
     or p_environment not in ('local', 'staging', 'production') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  select challenge.* into v_challenge
  from public.app_signup_signing_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.subject_type = 'CUSTOMER_CORRECTION';
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'challenge_unavailable'
  ); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-correction-finalize-v1:' || v_challenge.correction_handoff_id::text, 0
  ));
  select submission.* into v_existing
  from public.app_evidence_review_customer_submissions submission
  where submission.handoff_id = v_challenge.correction_handoff_id;
  if found then
    if v_existing.idempotency_key = p_idempotency_key
       and v_existing.normalized_payload_sha256 = p_payload_sha256
       and v_existing.auth_user_id = p_auth_user_id then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'status', 200, 'code', 'already_finalized',
        'submission_ref', v_existing.submission_reference,
        'snapshot_ref', v_existing.resulting_snapshot_id,
        'snapshot_sha256', v_existing.resulting_snapshot_sha256
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'handoff_already_answered'
    );
  end if;
  if v_challenge.correction_legal_bundle_version <> p_legal_bundle_version
     or v_challenge.correction_legal_bundle_sha256 <> p_legal_bundle_sha256
     or v_challenge.correction_environment <> p_environment
     or v_challenge.delivery_status <> 'delivered'
     or v_challenge.replaced_at is not null
     or v_challenge.consumed_at is not null
     or v_challenge.expires_at <= v_now
     or v_challenge.attempts_remaining < 1 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'challenge_unavailable'
    );
  end if;
  if v_challenge.otp_verifier_sha256 <> p_otp_verifier_sha256 then
    update public.app_signup_signing_challenges
    set attempts_remaining = attempts_remaining - 1,
        replaced_at = case when attempts_remaining - 1 = 0
          then v_now else replaced_at end
    where id = v_challenge.id;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_signing_code'
    );
  end if;
  v_prepare := v_challenge.correction_payload;
  v_fresh := public.app_customer_correction_prepare_v1(
    p_auth_user_id, p_case_ref, v_prepare->'responses'
  );
  if v_fresh->>'ok' <> 'true' then return v_fresh; end if;
  if v_fresh <> v_prepare then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'stale_correction_context'
  ); end if;
  select identity_row.* into v_identity
  from public.app_customer_identities identity_row
  join public.app_customer_access_grants access_grant
    on access_grant.auth_user_id = identity_row.auth_user_id
   and access_grant.customer_id = identity_row.customer_id
  where identity_row.auth_user_id = p_auth_user_id
    and identity_row.customer_id = (v_prepare->>'customer_id')::uuid
    and identity_row.status = 'active'
    and (access_grant.granted_case_id is null
      or access_grant.granted_case_id = (v_prepare->>'case_id')::uuid)
  order by identity_row.created_at
  limit 1;
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
  ); end if;
  select coalesce(max(submission.correction_generation), 0) + 1
    into v_generation
  from public.app_evidence_review_customer_submissions submission
  where submission.case_id = (v_prepare->>'case_id')::uuid;
  v_snapshot := v_prepare->'snapshot_draft';
  v_snapshot := pg_catalog.jsonb_set(
    v_snapshot, '{signer,typed_full_name}', pg_catalog.to_jsonb(p_typed_full_name), true
  );
  v_snapshot := pg_catalog.jsonb_set(
    v_snapshot, '{signature_method}',
    '{"method_id":"typed_name_otp_v1","method_version":"1"}'::jsonb, true
  );
  v_snapshot := pg_catalog.jsonb_set(
    v_snapshot, '{server_issue_date}', pg_catalog.to_jsonb(v_now), true
  );
  select pg_catalog.encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex')
    into v_snapshot_sha;
  select 'CRS-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
    extensions.digest('customer-correction-submission-v1|' ||
      v_challenge.correction_handoff_id::text || '|' || v_snapshot_sha,
      'sha256'), 'hex'), 1, 16)) into v_submission_ref;
  v_envelope := pg_catalog.jsonb_build_object(
    'schema_version', 'customer-correction-signature-envelope-v1',
    'submission_id', v_submission_id,
    'handoff_id', v_challenge.correction_handoff_id,
    'parent_snapshot_id', v_prepare->>'parent_snapshot_id',
    'parent_snapshot_sha256', v_prepare->>'parent_snapshot_sha256',
    'resulting_snapshot_id', v_snapshot_id,
    'resulting_snapshot_sha256', v_snapshot_sha,
    'correction_legal_bundle_version', p_legal_bundle_version,
    'correction_legal_bundle_sha256', p_legal_bundle_sha256,
    'method_id', 'typed_name_otp_v1', 'method_version', '1',
    'challenge_id', v_challenge.id, 'intent', 'CONFIRM_CORRECTED_DOSSIER',
    'finalized_at', v_now
  );
  insert into public.app_signup_signing_snapshots (
    id, intake_id, schema_version, canonical_snapshot,
    canonical_snapshot_sha256, subject_type, subject_ref, parent_snapshot_id
  ) values (
    v_snapshot_id, null, 'signup-signing-runtime-snapshot-v1', v_snapshot,
    v_snapshot_sha, 'CUSTOMER_CORRECTION', v_submission_id,
    (v_prepare->>'parent_snapshot_id')::uuid
  );
  insert into public.app_signup_signature_evidence (
    id, intake_id, snapshot_id, mandate_id, challenge_id,
    method_id, method_version, typed_full_name, signer_role,
    channel_reference_sha256, evidence_envelope, finalized_at,
    subject_type, subject_ref
  ) values (
    v_signature_id, null, v_snapshot_id, null, v_challenge.id,
    'typed_name_otp_v1', '1', p_typed_full_name, 'customer',
    v_challenge.channel_reference_sha256, v_envelope, v_now,
    'CUSTOMER_CORRECTION', v_submission_id
  );
  insert into public.app_evidence_review_customer_submissions (
    id, submission_reference, handoff_id, case_id, customer_id,
    correction_generation, parent_snapshot_id, parent_snapshot_sha256,
    resulting_snapshot_id, resulting_snapshot_sha256, signature_evidence_id,
    signing_method_id, signing_method_version,
    correction_legal_bundle_version, correction_legal_bundle_sha256,
    auth_user_id, customer_identity_id, actor_ref,
    normalized_payload_sha256, request_id, idempotency_key, environment,
    finalized_at
  ) values (
    v_submission_id, v_submission_ref, v_challenge.correction_handoff_id,
    (v_prepare->>'case_id')::uuid, (v_prepare->>'customer_id')::uuid,
    v_generation, (v_prepare->>'parent_snapshot_id')::uuid,
    v_prepare->>'parent_snapshot_sha256', v_snapshot_id, v_snapshot_sha,
    v_signature_id, 'typed_name_otp_v1', '1', p_legal_bundle_version,
    p_legal_bundle_sha256, p_auth_user_id, v_identity.id,
    'app_customer_identity:' || v_identity.id::text,
    p_payload_sha256, p_request_id, p_idempotency_key, p_environment, v_now
  );
  for v_item in select item.value
    from pg_catalog.jsonb_array_elements(v_prepare->'items') item(value)
    order by (item.value->>'item_index')::integer
  loop
    select subject.item into v_subject
    from pg_catalog.jsonb_array_elements(
      public.app_evidence_fact_review_manifest_source_v1(
        (v_prepare->>'case_id')::uuid
      )->'subjects'
    ) subject(item)
    where subject.item->>'subject_ref' = v_item.value->>'handoff_subject_ref';
    select 'FRS-' || pg_catalog.encode(extensions.digest(
      pg_catalog.concat_ws('|', 'fact-review-subject-v1',
        v_prepare->>'case_id', v_item.value->>'evidence_version_id',
        v_item.value->>'evidence_sha256', v_snapshot_id::text,
        v_item.value->>'fact_id', v_item.value->>'fact_key',
        v_item.value->>'scope_ref',
        pg_catalog.encode(extensions.digest(
          v_item.value->>'corrected_value', 'sha256'), 'hex'),
        v_subject->>'required', 'PRESENT'
      ), 'sha256'), 'hex') into v_resulting_subject_ref;
    insert into public.app_evidence_review_customer_submission_items (
      submission_id, item_index, handoff_subject_ref, resulting_subject_ref,
      fact_id, fact_key, scope_ref, evidence_file_id, evidence_version_id,
      evidence_sha256, action_requirement, prior_canonical_value,
      prior_value_sha256, submitted_value, resulting_canonical_value,
      resulting_value_sha256
    ) values (
      v_submission_id, (v_item.value->>'item_index')::integer,
      v_item.value->>'handoff_subject_ref', v_resulting_subject_ref,
      v_item.value->>'fact_id', v_item.value->>'fact_key',
      v_item.value->>'scope_ref', (v_item.value->>'evidence_file_id')::uuid,
      (v_item.value->>'evidence_version_id')::uuid,
      v_item.value->>'evidence_sha256', v_item.value->>'action_requirement',
      v_item.value->>'prior_value', v_item.value->>'prior_value_sha256',
      v_item.value->>'corrected_value', v_item.value->>'corrected_value',
      pg_catalog.encode(extensions.digest(
        v_item.value->>'corrected_value', 'sha256'), 'hex')
    );
    v_item_count := v_item_count + 1;
  end loop;
  v_new_manifest := public.app_evidence_fact_review_manifest_v1(
    (v_prepare->>'case_id')::uuid
  );
  if v_new_manifest->>'ok' <> 'true'
     or v_new_manifest->>'manifest_hash' = v_prepare->>'source_manifest_hash' then
    raise exception 'customer correction manifest did not advance';
  end if;
  insert into public.app_evidence_review_decision_carry_forwards (
    submission_id, prior_decision_id, prior_subject_ref,
    resulting_subject_ref, fact_key, scope_ref,
    previous_evidence_version_id, current_evidence_version_id,
    previous_evidence_sha256, current_evidence_sha256,
    previous_value_sha256, current_value_sha256,
    equivalence_proof_version, equivalence_proof_sha256, origin
  )
  select v_submission_id, decision.id, decision.subject_ref,
    current_subject.item->>'subject_ref', decision.fact_key, decision.scope_ref,
    decision.evidence_version_id, decision.evidence_version_id,
    evidence_version.sha256, evidence_version.sha256,
    decision.value_sha256, current_subject.item->>'value_sha256',
    'customer-correction-carry-v1',
    pg_catalog.encode(extensions.digest(pg_catalog.concat_ws('|',
      'customer-correction-carry-v1', decision.id::text,
      current_subject.item->>'subject_ref', evidence_version.id::text,
      evidence_version.sha256, decision.value_sha256,
      current_subject.item->>'value_sha256', 'LOCKED_BY_HANDOFF_SCOPE'
    ), 'sha256'), 'hex'), 'CARRIED_FORWARD_ACCEPTED'
  from public.app_evidence_review_round_subject_decisions decision
  join public.app_evidence_versions evidence_version
    on evidence_version.id = decision.evidence_version_id
  join pg_catalog.jsonb_array_elements(v_new_manifest->'subjects')
    current_subject(item)
    on current_subject.item->>'fact_key' = decision.fact_key
   and current_subject.item->>'scope_ref' = decision.scope_ref
   and current_subject.item->>'evidence_version_id' =
     decision.evidence_version_id::text
   and current_subject.item->>'value_sha256' = decision.value_sha256
  where decision.round_id = (v_prepare->>'source_round_id')::uuid
    and decision.disposition = 'ACCEPTED'
    and not exists (
      select 1 from public.app_evidence_review_customer_submission_items item
      where item.submission_id = v_submission_id
        and item.fact_key = decision.fact_key
        and item.scope_ref = decision.scope_ref
    );
  get diagnostics v_carry_count = row_count;
  update public.app_signup_signing_challenges
  set consumed_at = v_now where id = v_challenge.id;
  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, idempotency_key,
    actor_type, actor_ref, event_data, created_at
  ) values (
    'customer_correction_submission_finalized', 'case',
    (v_prepare->>'case_id')::uuid, p_request_id, p_idempotency_key, 'customer',
    'app_customer_identity:' || v_identity.id::text,
    pg_catalog.jsonb_build_object(
      'submission_ref', v_submission_ref,
      'handoff_ref', v_prepare->>'handoff_ref',
      'parent_snapshot_ref', v_prepare->>'parent_snapshot_id',
      'resulting_snapshot_ref', v_snapshot_id,
      'resulting_snapshot_sha256', v_snapshot_sha,
      'new_manifest_hash', v_new_manifest->>'manifest_hash',
      'correction_item_count', v_item_count,
      'carried_acceptance_count', v_carry_count,
      'signing_method', 'typed_name_otp_v1'
    ), v_now
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'finalized',
    'submission_ref', v_submission_ref, 'snapshot_ref', v_snapshot_id,
    'snapshot_sha256', v_snapshot_sha,
    'manifest_hash', v_new_manifest->>'manifest_hash',
    'correction_item_count', v_item_count,
    'carried_acceptance_count', v_carry_count,
    'overall_review_status', 'TO_REVIEW'
  );
exception when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
  );
when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

-- An answered handoff is derived from its immutable linked submission.
create or replace function public.app_customer_correction_handoff_read_v1(
  p_auth_user_id uuid, p_case_ref text
)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
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
  if not exists (select 1 from auth.users auth_user
    where auth_user.id = p_auth_user_id and auth_user.deleted_at is null
      and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at) is not null)
  then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 401, 'code', 'authentication_required'
  ); end if;
  select case_row.* into v_case from public.app_cases case_row
  join public.app_customers customer_row on customer_row.id = case_row.customer_id
    and customer_row.status = 'active'
  where case_row.case_reference = p_case_ref;
  if not found or not exists (select 1 from public.app_customer_access_grants grant_row
    where grant_row.auth_user_id = p_auth_user_id
      and grant_row.customer_id = v_case.customer_id
      and (grant_row.granted_case_id is null or grant_row.granted_case_id = v_case.id))
  then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
  ); end if;
  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'not_available',
    'case_ref', v_case.case_reference, 'handoff', null
  ); end if;
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.case_id = v_case.id and handoff.target_customer_id = v_case.customer_id
    and handoff.manifest_version = v_manifest->>'manifest_version'
    and handoff.manifest_hash = v_manifest->>'manifest_hash'
    and not exists (select 1 from public.app_evidence_review_customer_submissions submission
      where submission.handoff_id = handoff.id);
  if not found then return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'not_available',
    'case_ref', v_case.case_reference, 'handoff', null
  ); end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'document_label', item.value->'customer_safe'->>'document_label',
      'fact_label', item.value->'customer_safe'->>'fact_label',
      'current_value', item.value->'customer_safe'->'current_value',
      'correction_reason', item.value->'customer_safe'->>'correction_reason',
      'correction_reason_label', item.value->'customer_safe'->>'correction_reason_label',
      'correction_instruction', item.value->'customer_safe'->>'correction_instruction'
    )) order by item.ordinality), '[]'::jsonb) into v_items
  from pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
    with ordinality item(value, ordinality);
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok', 'case_ref', v_case.case_reference,
    'handoff', pg_catalog.jsonb_build_object(
      'handoff_ref', v_handoff.handoff_reference,
      'published_at', v_handoff.published_at, 'items', v_items
    )
  );
end;
$$;

create or replace function public.app_evidence_review_overall_status_v1(
  p_case_id uuid, p_manifest_version text, p_manifest_hash text
)
returns text language plpgsql stable set search_path = '' as $$
declare v_round public.app_evidence_review_rounds%rowtype;
begin
  if p_case_id is null or p_manifest_version <> 'fact-review-manifest-v1'
     or p_manifest_hash !~ '^[0-9a-f]{64}$' then return 'REVIEW_MODEL_UNAVAILABLE'; end if;
  select round_row.* into v_round from public.app_evidence_review_rounds round_row
  where round_row.case_id = p_case_id and round_row.manifest_version = p_manifest_version
    and round_row.manifest_hash = p_manifest_hash;
  if not found then return 'TO_REVIEW'; end if;
  if v_round.outcome = 'CORRECTIONS_REQUIRED' then
    if exists (select 1 from public.app_evidence_review_correction_handoffs handoff
      where handoff.round_id = v_round.id and handoff.case_id = p_case_id
        and not exists (select 1 from public.app_evidence_review_customer_submissions submission
          where submission.handoff_id = handoff.id)) then return 'WAITING_CUSTOMER'; end if;
    return 'CORRECTION_REQUIRED';
  end if;
  if v_round.outcome = 'ALL_FACTS_ACCEPTED' then return 'REVIEW_COMPLETE'; end if;
  return 'REVIEW_MODEL_UNAVAILABLE';
end;
$$;

create function public.app_evidence_review_worklist_source_read_v4(
  p_auth_user_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_base jsonb;
  v_rows jsonb;
begin
  v_base := public.app_evidence_review_worklist_source_read_v3(p_auth_user_id);
  if v_base->>'ok' <> 'true' then return v_base; end if;
  select coalesce(pg_catalog.jsonb_agg(
    case when row.item->>'overall_review_status' = 'TO_REVIEW'
      and submission.id is not null then
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          row.item, '{unresolved_fact_count}',
          pg_catalog.to_jsonb(greatest(
            pg_catalog.jsonb_array_length(manifest.value->'subjects') -
              coalesce(carry.count, 0), 0
          ))
        ),
        '{latest_review_activity_at}',
        pg_catalog.to_jsonb(pg_catalog.to_char(
          greatest(
            (row.item->>'latest_review_activity_at')::timestamptz,
            submission.finalized_at
          ) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ))
      )
      else row.item end
    order by row.ordinality
  ), '[]'::jsonb) into v_rows
  from pg_catalog.jsonb_array_elements(v_base->'queue_rows')
    with ordinality row(item, ordinality)
  left join public.app_cases case_row
    on case_row.case_reference = row.item->>'case_ref'
  left join lateral (
    select candidate.*
    from public.app_evidence_review_customer_submissions candidate
    where candidate.case_id = case_row.id
    order by candidate.correction_generation desc, candidate.finalized_at desc
    limit 1
  ) submission on true
  left join lateral (
    select public.app_evidence_fact_review_manifest_v1(case_row.id) value
  ) manifest on submission.id is not null
  left join lateral (
    select pg_catalog.count(*)::integer count
    from public.app_evidence_review_decision_carry_forwards provenance
    where provenance.submission_id = submission.id
  ) carry on submission.id is not null;
  return v_base || pg_catalog.jsonb_build_object('queue_rows', v_rows);
end;
$$;

alter table public.app_evidence_review_customer_submissions enable row level security;
alter table public.app_evidence_review_customer_submission_items enable row level security;
alter table public.app_evidence_review_decision_carry_forwards enable row level security;
create policy deny_all on public.app_evidence_review_customer_submissions
  for all using (false) with check (false);
create policy deny_all on public.app_evidence_review_customer_submission_items
  for all using (false) with check (false);
create policy deny_all on public.app_evidence_review_decision_carry_forwards
  for all using (false) with check (false);
revoke all on table public.app_evidence_review_customer_submissions
  from public, anon, authenticated, service_role;
revoke all on table public.app_evidence_review_customer_submission_items
  from public, anon, authenticated, service_role;
revoke all on table public.app_evidence_review_decision_carry_forwards
  from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_immutable_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_action_requirement_v1(jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_normalize_value_v1(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_prepare_v1(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_challenge_issue_v1(
  uuid, text, jsonb, text, text, timestamptz, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_challenge_issue_v1(
  uuid, text, jsonb, text, text, timestamptz, text, text, text, text, text, text
) to service_role;
revoke all on function public.app_customer_correction_finalize_v1(
  uuid, text, uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_finalize_v1(
  uuid, text, uuid, text, text, text, text, text, text, text, text
) to service_role;
revoke all on function public.app_evidence_fact_review_manifest_source_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_fact_review_manifest_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_worklist_source_read_v4(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_worklist_source_read_v3(uuid)
  from service_role;
grant execute on function public.app_evidence_review_worklist_source_read_v4(uuid)
  to service_role;

comment on table public.app_evidence_review_customer_submissions is
  'Immutable one-per-handoff signed customer correction submission. Completion is derived from this causal row; the published handoff is never updated.';
comment on table public.app_evidence_review_customer_submission_items is
  'Immutable exact server-resolved item responses. The browser supplies only a bounded ordinal and value; subject, action, fact and evidence lineage are server-owned.';
comment on table public.app_evidence_review_decision_carry_forwards is
  'Immutable selective acceptance lineage. It never creates HUMAN_ACCEPTED and exists only for server-proven locked fact/evidence/value equivalence.';

commit;

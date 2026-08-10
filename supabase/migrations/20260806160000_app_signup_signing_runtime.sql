-- ENVAL 09B2B local signing runtime foundation.
-- Candidate legal content is local-gated by the Edge boundary; non-local use
-- remains fail-closed until the canonical records are CURRENT.

create table public.app_signup_signing_challenges (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.app_signup_intakes (id) on delete restrict,
  method_id text not null,
  method_version text not null,
  channel_reference_sha256 text not null,
  otp_verifier_sha256 text not null,
  expires_at timestamptz not null,
  attempts_remaining smallint not null default 5,
  delivery_status text not null default 'pending',
  transport_id text null,
  provider_delivery_reference text null,
  delivered_at timestamptz null,
  delivery_failed_at timestamptz null,
  replaced_at timestamptz null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint app_signup_signing_challenges_method_chk
    check (method_id = 'typed_name_otp_v1' and method_version = '1'),
  constraint app_signup_signing_challenges_channel_hash_chk
    check (channel_reference_sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_signup_signing_challenges_verifier_hash_chk
    check (otp_verifier_sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_signup_signing_challenges_expiry_chk
    check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  constraint app_signup_signing_challenges_attempts_chk
    check (attempts_remaining between 0 and 5),
  constraint app_signup_signing_challenges_delivery_status_chk
    check (delivery_status in ('pending', 'delivered', 'failed')),
  constraint app_signup_signing_challenges_delivery_markers_chk
    check (
      (delivery_status = 'pending' and delivered_at is null and delivery_failed_at is null)
      or (delivery_status = 'delivered' and delivered_at is not null and delivery_failed_at is null)
      or (delivery_status = 'failed' and delivered_at is null and delivery_failed_at is not null)
    )
);

create index app_signup_signing_challenges_intake_created_idx
  on public.app_signup_signing_challenges (intake_id, created_at desc);
create index app_signup_signing_challenges_channel_created_idx
  on public.app_signup_signing_challenges (channel_reference_sha256, created_at desc);
create unique index app_signup_signing_challenges_one_active_idx
  on public.app_signup_signing_challenges (intake_id)
  where consumed_at is null and replaced_at is null and delivery_status in ('pending', 'delivered');

create table public.app_signup_signing_snapshots (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null unique references public.app_signup_intakes (id) on delete restrict,
  schema_version text not null,
  canonical_snapshot jsonb not null,
  canonical_snapshot_sha256 text not null unique,
  created_at timestamptz not null default now(),
  constraint app_signup_signing_snapshots_schema_chk
    check (schema_version = 'signup-signing-runtime-snapshot-v1'),
  constraint app_signup_signing_snapshots_object_chk
    check (jsonb_typeof(canonical_snapshot) = 'object'),
  constraint app_signup_signing_snapshots_hash_chk
    check (canonical_snapshot_sha256 ~ '^[0-9a-f]{64}$')
);

create table public.app_signup_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.app_signup_intakes (id) on delete restrict,
  snapshot_id uuid not null references public.app_signup_signing_snapshots (id) on delete restrict,
  action_type text not null,
  document_type text not null,
  document_version text not null,
  language text not null,
  content_sha256 text not null,
  accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint app_signup_legal_acceptances_action_chk
    check (action_type in ('privacy_notice_read', 'service_terms_accepted', 'fee_terms_accepted')),
  constraint app_signup_legal_acceptances_document_chk
    check (document_type in ('privacy_notice', 'service_terms', 'fee_terms')),
  constraint app_signup_legal_acceptances_pair_chk
    check (
      (action_type = 'privacy_notice_read' and document_type = 'privacy_notice')
      or (action_type = 'service_terms_accepted' and document_type = 'service_terms')
      or (action_type = 'fee_terms_accepted' and document_type = 'fee_terms')
    ),
  constraint app_signup_legal_acceptances_language_chk check (language = 'nl'),
  constraint app_signup_legal_acceptances_hash_chk check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_signup_legal_acceptances_unique unique (intake_id, action_type)
);

create table public.app_signup_mandates (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null unique references public.app_signup_intakes (id) on delete restrict,
  snapshot_id uuid not null unique references public.app_signup_signing_snapshots (id) on delete restrict,
  account_type text not null,
  calendar_year integer not null,
  issued_at timestamptz not null,
  mandate_content jsonb not null,
  authority_review_status text not null,
  created_at timestamptz not null default now(),
  constraint app_signup_mandates_account_type_chk check (account_type in ('particulier', 'zakelijk', 'vve')),
  constraint app_signup_mandates_year_chk check (calendar_year between 2020 and 2100),
  constraint app_signup_mandates_content_chk check (jsonb_typeof(mandate_content) = 'object'),
  constraint app_signup_mandates_authority_chk
    check (authority_review_status in ('not_applicable', 'required_not_completed'))
);

create table public.app_signup_signature_evidence (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null unique references public.app_signup_intakes (id) on delete restrict,
  snapshot_id uuid not null unique references public.app_signup_signing_snapshots (id) on delete restrict,
  mandate_id uuid not null unique references public.app_signup_mandates (id) on delete restrict,
  challenge_id uuid not null unique references public.app_signup_signing_challenges (id) on delete restrict,
  method_id text not null,
  method_version text not null,
  typed_full_name text not null,
  signer_role text not null default '',
  channel_reference_sha256 text not null,
  evidence_envelope jsonb not null,
  finalized_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint app_signup_signature_evidence_method_chk
    check (method_id = 'typed_name_otp_v1' and method_version = '1'),
  constraint app_signup_signature_evidence_name_chk check (btrim(typed_full_name) <> ''),
  constraint app_signup_signature_evidence_channel_hash_chk
    check (channel_reference_sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_signup_signature_evidence_envelope_chk check (jsonb_typeof(evidence_envelope) = 'object')
);

create or replace function public.app_signup_immutable_signing_record_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'immutable signup signing record cannot be changed';
end;
$$;

create trigger trg_app_signup_signing_snapshots_immutable
before update or delete on public.app_signup_signing_snapshots
for each row execute function public.app_signup_immutable_signing_record_guard();
create trigger trg_app_signup_legal_acceptances_immutable
before update or delete on public.app_signup_legal_acceptances
for each row execute function public.app_signup_immutable_signing_record_guard();
create trigger trg_app_signup_mandates_immutable
before update or delete on public.app_signup_mandates
for each row execute function public.app_signup_immutable_signing_record_guard();
create trigger trg_app_signup_signature_evidence_immutable
before update or delete on public.app_signup_signature_evidence
for each row execute function public.app_signup_immutable_signing_record_guard();

create or replace function public.app_signup_intake_files_finalized_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_intake_id uuid;
  v_intake_status text;
begin
  v_intake_id := case when tg_op = 'INSERT' then new.intake_id else old.intake_id end;
  select status into v_intake_status
  from public.app_signup_intakes
  where id = v_intake_id;
  if not found or v_intake_status <> 'collecting' then
    raise exception 'finalized signup intake files are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_app_signup_intake_files_finalized_guard
before insert or update or delete on public.app_signup_intake_files
for each row execute function public.app_signup_intake_files_finalized_guard();

create or replace function public.app_signup_signing_challenge_issue_v1(
  p_intake_id uuid,
  p_manage_token_sha256 text,
  p_channel_reference_sha256 text,
  p_otp_verifier_sha256 text,
  p_expires_at timestamptz,
  p_payload_hash text,
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
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-signing-challenge:v1:' || p_intake_id::text;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_challenge_id uuid := gen_random_uuid();
  v_response jsonb;
  v_recent integer;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_channel_reference_sha256 !~ '^[0-9a-f]{64}$'
     or p_otp_verifier_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or p_expires_at <= v_now or p_expires_at > v_now + interval '10 minutes' then
    raise exception 'invalid signing challenge input';
  end if;

  insert into public.app_idempotency_keys (scope, key, payload_hash, locked_at, expires_at)
  values (v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours')
  on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key for update;
  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraagcode is al gebruikt.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Code wordt al aangevraagd.');
  end if;

  select * into v_intake from public.app_signup_intakes where id = p_intake_id for update;
  if not found or v_intake.status <> 'collecting' or v_intake.expires_at <= v_now then
    raise exception 'signup intake unavailable';
  end if;
  select * into v_manage from public.app_signup_intake_capabilities
  where intake_id = p_intake_id and intake_file_id is null
    and capability_type = 'intake_manage' and token_sha256 = p_manage_token_sha256
  for update;
  if not found or v_manage.consumed_at is not null or v_manage.invalidated_at is not null
     or v_manage.expires_at <= v_now then
    raise exception 'signup intake capability unavailable';
  end if;

  select count(*) into v_recent from public.app_signup_signing_challenges
  where (intake_id = p_intake_id or channel_reference_sha256 = p_channel_reference_sha256)
    and created_at > v_now - interval '10 minutes';
  if v_recent >= 3 then
    v_response := jsonb_build_object('ok', false, 'status', 429, 'code', 'rate_limited', 'error', 'Wacht voordat je een nieuwe code aanvraagt.');
    update public.app_idempotency_keys set response_status = 429, response_body = v_response, completed_at = v_now
    where scope = v_scope and key = p_idempotency_key;
    return v_response;
  end if;

  update public.app_signup_signing_challenges set replaced_at = v_now
  where intake_id = p_intake_id and consumed_at is null and replaced_at is null
    and delivery_status in ('pending', 'delivered');

  insert into public.app_signup_signing_challenges (
    id, intake_id, method_id, method_version, channel_reference_sha256,
    otp_verifier_sha256, expires_at
  ) values (
    v_challenge_id, p_intake_id, 'typed_name_otp_v1', '1',
    p_channel_reference_sha256, p_otp_verifier_sha256, p_expires_at
  );

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash, user_agent_hash, event_data
  ) values (
    'signup_signing_challenge_issued', p_request_id, p_idempotency_key,
    'anonymous', p_ip_hash, p_user_agent_hash,
    jsonb_build_object('environment', coalesce(p_environment, 'unknown'),
      'intake_reference', p_intake_id, 'challenge_reference', v_challenge_id,
      'method_id', 'typed_name_otp_v1', 'expiry_seconds', 600)
  );

  v_response := jsonb_build_object('ok', true, 'status', 201,
    'mode', 'signup_signing_challenge_v1', 'challenge_reference', v_challenge_id,
    'expires_at', p_expires_at, 'attempts_remaining', 5, 'replayed', false);
  update public.app_idempotency_keys set response_status = 201, response_body = v_response, completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.app_signup_signing_finalize_v1(
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
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-signing-finalize:v1:' || p_intake_id::text;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_challenge public.app_signup_signing_challenges%rowtype;
  v_snapshot_id uuid := gen_random_uuid();
  v_mandate_id uuid := gen_random_uuid();
  v_evidence_id uuid := gen_random_uuid();
  v_response jsonb;
  v_file_count integer;
  v_distinct_file_count integer;
  v_bad_fact boolean;
  v_safe_reference text;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_channel_reference_sha256 !~ '^[0-9a-f]{64}$'
     or p_otp_verifier_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     or p_account_type not in ('particulier', 'zakelijk', 'vve')
     or p_mandate_year not between 2020 and 2100
     or p_issued_at is null
     or p_issued_at < v_now - interval '1 minute' or p_issued_at > v_now + interval '1 minute'
     or p_method_version <> '1'
     or p_typed_full_name is null or btrim(p_typed_full_name) = ''
     or (p_account_type <> 'particulier' and (p_signer_role is null or btrim(p_signer_role) = ''))
     or p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or jsonb_typeof(p_canonical_snapshot) <> 'object'
     or jsonb_typeof(p_mandate_content) <> 'object'
     or jsonb_typeof(p_legal_documents) <> 'array'
     or coalesce(array_length(p_required_file_ids, 1), 0) = 0 then
    raise exception 'invalid signing finalization input';
  end if;

  insert into public.app_idempotency_keys (scope, key, payload_hash, locked_at, expires_at)
  values (v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours')
  on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_idem from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key for update;
  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraagcode is al gebruikt.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Ondertekening wordt al verwerkt.');
  end if;

  select * into v_intake from public.app_signup_intakes where id = p_intake_id for update;
  if not found then raise exception 'signup intake unavailable'; end if;
  if v_intake.status <> 'collecting' then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'intake_locked', 'error', 'Deze aanmelding kan niet meer worden gewijzigd.');
  end if;
  if v_intake.expires_at <= v_now then raise exception 'signup intake unavailable'; end if;

  select * into v_manage from public.app_signup_intake_capabilities
  where intake_id = p_intake_id and intake_file_id is null
    and capability_type = 'intake_manage' and token_sha256 = p_manage_token_sha256
  for update;
  if not found or v_manage.consumed_at is not null or v_manage.invalidated_at is not null
     or v_manage.expires_at <= v_now then
    raise exception 'signup intake capability unavailable';
  end if;

  select * into v_challenge from public.app_signup_signing_challenges
  where id = p_challenge_id and intake_id = p_intake_id for update;
  if not found or v_challenge.delivery_status <> 'delivered'
     or v_challenge.replaced_at is not null or v_challenge.consumed_at is not null then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'challenge_unavailable', 'error', 'Vraag een nieuwe code aan.');
  end if;
  if v_challenge.channel_reference_sha256 <> p_channel_reference_sha256 then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'channel_mismatch', 'error', 'Vraag een nieuwe code aan.');
  end if;
  if v_challenge.expires_at <= v_now then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'otp_expired', 'error', 'De code is verlopen. Vraag een nieuwe code aan.');
  end if;
  if v_challenge.attempts_remaining <= 0 then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'attempts_exhausted', 'error', 'Vraag een nieuwe code aan.');
  end if;
  if v_challenge.otp_verifier_sha256 <> p_otp_verifier_sha256 then
    update public.app_signup_signing_challenges
    set attempts_remaining = greatest(attempts_remaining - 1, 0)
    where id = p_challenge_id;
    v_response := jsonb_build_object('ok', false, 'status', 422, 'code', 'otp_invalid',
      'error', 'De code klopt niet.', 'attempts_remaining', greatest(v_challenge.attempts_remaining - 1, 0));
    update public.app_idempotency_keys set response_status = 422, response_body = v_response, completed_at = v_now
    where scope = v_scope and key = p_idempotency_key;
    return v_response;
  end if;

  select count(*), count(distinct candidate) into v_file_count, v_distinct_file_count
  from unnest(p_required_file_ids) candidate;
  if v_file_count <> v_distinct_file_count then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'file_scope_invalid', 'error', 'Controleer de documenten.');
  end if;
  select count(*) into v_file_count from public.app_signup_intake_files
  where intake_id = p_intake_id and id = any(p_required_file_ids)
    and status = 'confirmed_quarantine' and superseded_at is null
    and superseded_by_intake_file_id is null;
  if v_file_count <> array_length(p_required_file_ids, 1) then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'required_files_unavailable', 'error', 'Controleer de documenten.');
  end if;

  select exists (
    select 1 from jsonb_array_elements(coalesce(p_canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)) fact
    where coalesce((fact ->> 'required')::boolean, false)
      and (coalesce(fact ->> 'value', '') = '' or fact ->> 'resolution_state' in ('pending', 'blocked'))
  ) into v_bad_fact;
  if v_bad_fact or jsonb_array_length(coalesce(p_canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)) = 0 then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'facts_not_ready', 'error', 'Controleer de verplichte gegevens.');
  end if;
  if jsonb_array_length(p_legal_documents) <> 4
     or (select count(distinct item ->> 'document_type') from jsonb_array_elements(p_legal_documents) item) <> 4
     or exists (select 1 from jsonb_array_elements(p_legal_documents) item
       where item ->> 'document_type' not in ('privacy_notice', 'service_terms', 'fee_terms', 'mandate')
         or item ->> 'content_sha256' !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'legal_bundle_invalid', 'error', 'Juridische documenten zijn niet beschikbaar.');
  end if;
  if (p_mandate_content -> 'validity' -> 'calendar_years') <> jsonb_build_array(p_mandate_year) then
    return jsonb_build_object('ok', false, 'status', 422, 'code', 'mandate_year_invalid', 'error', 'Kies één kalenderjaar.');
  end if;

  insert into public.app_signup_signing_snapshots (
    id, intake_id, schema_version, canonical_snapshot, canonical_snapshot_sha256
  ) values (v_snapshot_id, p_intake_id, 'signup-signing-runtime-snapshot-v1', p_canonical_snapshot, p_snapshot_sha256);

  insert into public.app_signup_legal_acceptances (
    intake_id, snapshot_id, action_type, document_type, document_version,
    language, content_sha256, accepted_at
  )
  select p_intake_id, v_snapshot_id,
    case item ->> 'document_type'
      when 'privacy_notice' then 'privacy_notice_read'
      when 'service_terms' then 'service_terms_accepted'
      when 'fee_terms' then 'fee_terms_accepted'
    end,
    item ->> 'document_type', item ->> 'version', item ->> 'language',
    item ->> 'content_sha256', v_now
  from jsonb_array_elements(p_legal_documents) item
  where item ->> 'document_type' <> 'mandate';

  insert into public.app_signup_mandates (
    id, intake_id, snapshot_id, account_type, calendar_year, issued_at,
    mandate_content, authority_review_status
  ) values (
    v_mandate_id, p_intake_id, v_snapshot_id, p_account_type, p_mandate_year,
    p_issued_at, p_mandate_content,
    case when p_account_type = 'particulier' then 'not_applicable' else 'required_not_completed' end
  );

  insert into public.app_signup_signature_evidence (
    id, intake_id, snapshot_id, mandate_id, challenge_id, method_id,
    method_version, typed_full_name, signer_role, channel_reference_sha256,
    evidence_envelope, finalized_at
  ) values (
    v_evidence_id, p_intake_id, v_snapshot_id, v_mandate_id, p_challenge_id,
    'typed_name_otp_v1', p_method_version, btrim(p_typed_full_name),
    coalesce(btrim(p_signer_role), ''), v_challenge.channel_reference_sha256,
    jsonb_build_object(
      'evidence_version', 'signing-evidence-v1',
      'method_id', 'typed_name_otp_v1', 'method_version', p_method_version,
      'challenge_reference', p_challenge_id,
      'verified_channel_reference', v_challenge.channel_reference_sha256,
      'verified_at', v_now, 'snapshot_sha256', p_snapshot_sha256,
      'legal_documents', p_legal_documents,
      'request_reference', p_request_id
    ), v_now
  );

  update public.app_signup_signing_challenges set consumed_at = v_now where id = p_challenge_id;
  update public.app_signup_intake_capabilities set consumed_at = v_now
  where id = v_manage.id;
  update public.app_signup_intakes
  set status = 'pending_verification', finalized_at = v_now,
      accepted_legal_versions = jsonb_build_object('items', p_legal_documents)
  where id = p_intake_id;

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash, user_agent_hash, event_data
  ) values (
    'signup_signing_finalized', p_request_id, p_idempotency_key, 'anonymous',
    p_ip_hash, p_user_agent_hash,
    jsonb_build_object('environment', coalesce(p_environment, 'unknown'),
      'intake_reference', p_intake_id, 'snapshot_reference', v_snapshot_id,
      'mandate_reference', v_mandate_id, 'evidence_reference', v_evidence_id,
      'method_id', 'typed_name_otp_v1', 'calendar_year', p_mandate_year,
      'next_status', 'pending_verification')
  );

  v_safe_reference := 'SIG-' || upper(substr(p_snapshot_sha256, 1, 12));
  v_response := jsonb_build_object('ok', true, 'status', 201,
    'mode', 'signup_signing_finalize_v1', 'safe_reference', v_safe_reference,
    'intake_status', 'pending_verification', 'replayed', false);
  update public.app_idempotency_keys set response_status = 201, response_body = v_response, completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.app_signup_signing_status_v1(
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
  v_snapshot_count integer;
  v_acceptance_count integer;
  v_mandate_count integer;
  v_evidence_count integer;
  v_audit_count integer;
  v_safe_reference text;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid signing status input';
  end if;

  select * into v_intake
  from public.app_signup_intakes
  where id = p_intake_id;
  if not found then
    raise exception 'signup intake unavailable';
  end if;

  select * into v_manage
  from public.app_signup_intake_capabilities
  where intake_id = p_intake_id
    and intake_file_id is null
    and capability_type = 'intake_manage'
    and token_sha256 = p_manage_token_sha256;
  if not found or v_manage.invalidated_at is not null
     or v_manage.expires_at <= v_now then
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

  if v_intake.status = 'collecting' then
    if v_manage.consumed_at is not null
       or v_snapshot_count <> 0 or v_acceptance_count <> 0
       or v_mandate_count <> 0 or v_evidence_count <> 0 then
      raise exception 'inconsistent collecting signup intake';
    end if;
    return jsonb_build_object(
      'ok', true,
      'status', 200,
      'mode', 'signup_signing_status_v1',
      'signing_state', 'collecting',
      'locked', false,
      'intake_status', 'collecting'
    );
  end if;

  if v_intake.status <> 'pending_verification'
     or v_intake.finalized_at is null
     or v_manage.consumed_at is null
     or v_snapshot_count <> 1
     or v_acceptance_count <> 3
     or v_mandate_count <> 1
     or v_evidence_count <> 1 then
    raise exception 'signup signing status unavailable';
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
     or v_evidence.intake_id <> p_intake_id
     or v_evidence.method_id <> 'typed_name_otp_v1'
     or v_evidence.finalized_at is null
     or v_challenge.intake_id <> p_intake_id
     or v_challenge.delivery_status <> 'delivered'
     or v_challenge.consumed_at is null
     or exists (
       select 1 from public.app_signup_legal_acceptances acceptance
       where acceptance.intake_id = p_intake_id
         and (
           acceptance.snapshot_id <> v_snapshot.id
           or acceptance.content_sha256 !~ '^[0-9a-f]{64}$'
         )
     )
     or (
       select count(distinct acceptance.action_type)
       from public.app_signup_legal_acceptances acceptance
       where acceptance.intake_id = p_intake_id
     ) <> 3
     or jsonb_array_length(
       coalesce(v_snapshot.canonical_snapshot -> 'legal_documents', '[]'::jsonb)
     ) <> 4
     or exists (
       select 1
       from jsonb_array_elements(
         coalesce(v_snapshot.canonical_snapshot -> 'legal_documents', '[]'::jsonb)
       ) document
       where document ->> 'content_sha256' !~ '^[0-9a-f]{64}$'
     ) then
    raise exception 'inconsistent finalized signup intake';
  end if;

  select count(*) into v_audit_count
  from public.app_intake_audit_events event
  where event.event_type = 'signup_signing_finalized'
    and event.event_data ->> 'intake_reference' = p_intake_id::text;
  if v_audit_count <> 1 then
    raise exception 'inconsistent signup signing audit';
  end if;

  v_safe_reference := 'SIG-' || upper(substr(v_snapshot.canonical_snapshot_sha256, 1, 12));
  return jsonb_build_object(
    'ok', true,
    'status', 200,
    'mode', 'signup_signing_status_v1',
    'signing_state', 'finalized',
    'locked', true,
    'safe_reference', v_safe_reference,
    'intake_status', 'pending_verification',
    'finalized_at', v_intake.finalized_at
  );
end;
$$;

alter table public.app_signup_signing_challenges enable row level security;
alter table public.app_signup_signing_snapshots enable row level security;
alter table public.app_signup_legal_acceptances enable row level security;
alter table public.app_signup_mandates enable row level security;
alter table public.app_signup_signature_evidence enable row level security;

create policy deny_all on public.app_signup_signing_challenges for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_signup_signing_snapshots for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_signup_legal_acceptances for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_signup_mandates for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_signup_signature_evidence for all to anon, authenticated using (false) with check (false);

revoke all on table public.app_signup_signing_challenges from public, anon, authenticated, service_role;
revoke all on table public.app_signup_signing_snapshots from public, anon, authenticated, service_role;
revoke all on table public.app_signup_legal_acceptances from public, anon, authenticated, service_role;
revoke all on table public.app_signup_mandates from public, anon, authenticated, service_role;
revoke all on table public.app_signup_signature_evidence from public, anon, authenticated, service_role;
grant select, insert, update on table public.app_signup_signing_challenges to service_role;
grant select, insert on table public.app_signup_signing_snapshots to service_role;
grant select, insert on table public.app_signup_legal_acceptances to service_role;
grant select, insert on table public.app_signup_mandates to service_role;
grant select, insert on table public.app_signup_signature_evidence to service_role;

revoke all on function public.app_signup_immutable_signing_record_guard() from public, anon, authenticated;
grant execute on function public.app_signup_immutable_signing_record_guard() to service_role;
revoke all on function public.app_signup_intake_files_finalized_guard() from public, anon, authenticated;
grant execute on function public.app_signup_intake_files_finalized_guard() to service_role;
revoke all on function public.app_signup_signing_challenge_issue_v1(uuid, text, text, text, timestamptz, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_signup_signing_challenge_issue_v1(uuid, text, text, text, timestamptz, text, text, text, text, text, text) to service_role;
revoke all on function public.app_signup_signing_finalize_v1(uuid, text, uuid, text, text, text, jsonb, text, jsonb, uuid[], text, integer, timestamptz, jsonb, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_signup_signing_finalize_v1(uuid, text, uuid, text, text, text, jsonb, text, jsonb, uuid[], text, integer, timestamptz, jsonb, text, text, text, text, text, text, text, text) to service_role;
revoke all on function public.app_signup_signing_status_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.app_signup_signing_status_v1(uuid, text) to service_role;

revoke delete on table public.app_signup_signing_challenges from service_role;
revoke delete on table public.app_signup_signing_snapshots from service_role;
revoke delete on table public.app_signup_legal_acceptances from service_role;
revoke delete on table public.app_signup_mandates from service_role;
revoke delete on table public.app_signup_signature_evidence from service_role;

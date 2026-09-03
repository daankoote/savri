begin;

create table public.app_signup_signing_presentation_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_reference text not null unique,
  receipt_sha256 text not null,
  receipt_schema_version text not null,
  intake_id uuid not null references public.app_signup_intakes(id)
    on delete restrict,
  authenticated_auth_user_id uuid not null,
  tenant_id uuid not null,
  environment text not null,
  data_plane_locator_id text not null,
  resolved_data_plane_reference text not null,
  manifest_revision_id uuid not null references
    public.app_tenant_configuration_manifests(id) on delete restrict,
  manifest_canonical_sha256 text not null,
  operational_component_revision_id uuid not null references
    public.app_tenant_configuration_component_revisions(id) on delete restrict,
  legal_component_revision_id uuid not null references
    public.app_tenant_configuration_component_revisions(id) on delete restrict,
  fee_component_revision_id uuid not null references
    public.app_tenant_configuration_component_revisions(id) on delete restrict,
  operational_signing_material_revision_id uuid not null references
    public.app_tenant_signing_material_revisions(id) on delete restrict,
  operational_signing_material_sha256 text not null,
  legal_signing_material_revision_id uuid not null references
    public.app_tenant_signing_material_revisions(id) on delete restrict,
  legal_signing_material_sha256 text not null,
  fee_signing_material_revision_id uuid not null references
    public.app_tenant_signing_material_revisions(id) on delete restrict,
  fee_signing_material_sha256 text not null,
  legal_bundle_revision text not null,
  legal_bundle_sha256 text not null,
  privacy_notice_document_reference text not null,
  privacy_notice_version text not null,
  privacy_notice_language text not null,
  privacy_notice_content_sha256 text not null,
  service_terms_document_reference text not null,
  service_terms_version text not null,
  service_terms_language text not null,
  service_terms_content_sha256 text not null,
  fee_terms_document_reference text not null,
  fee_terms_version text not null,
  fee_terms_language text not null,
  fee_terms_content_sha256 text not null,
  mandate_document_reference text not null,
  mandate_version text not null,
  mandate_language text not null,
  mandate_content_sha256 text not null,
  presented_at timestamptz not null,
  expires_at timestamptz not null,
  request_id text not null,
  created_at timestamptz not null default now(),
  constraint app_signup_signing_presentation_receipt_request_unique
    unique (intake_id, authenticated_auth_user_id, request_id),
  constraint app_signup_signing_presentation_receipt_reference_valid check (
    receipt_reference ~
      '^SPR-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint app_signup_signing_presentation_receipt_hashes_valid check (
    receipt_sha256 ~ '^[0-9a-f]{64}$'
    and manifest_canonical_sha256 ~ '^[0-9a-f]{64}$'
    and operational_signing_material_sha256 ~ '^[0-9a-f]{64}$'
    and legal_signing_material_sha256 ~ '^[0-9a-f]{64}$'
    and fee_signing_material_sha256 ~ '^[0-9a-f]{64}$'
    and legal_bundle_sha256 ~ '^[0-9a-f]{64}$'
    and privacy_notice_content_sha256 ~ '^[0-9a-f]{64}$'
    and service_terms_content_sha256 ~ '^[0-9a-f]{64}$'
    and fee_terms_content_sha256 ~ '^[0-9a-f]{64}$'
    and mandate_content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_signup_signing_presentation_receipt_schema_valid check (
    receipt_schema_version = 'signup-signing-presentation-receipt-v1'
  ),
  constraint app_signup_signing_presentation_receipt_environment_valid check (
    environment ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint app_signup_signing_presentation_receipt_languages_valid check (
    privacy_notice_language = 'nl'
    and service_terms_language = 'nl'
    and fee_terms_language = 'nl'
    and mandate_language = 'nl'
  ),
  constraint app_signup_signing_presentation_receipt_window_valid check (
    expires_at = presented_at + interval '60 minutes'
  ),
  constraint app_signup_signing_presentation_receipt_request_valid check (
    btrim(request_id) <> ''
  )
);

create table public.app_signup_signing_presentation_acceptances (
  id uuid primary key default gen_random_uuid(),
  presentation_receipt_id uuid not null unique references
    public.app_signup_signing_presentation_receipts(id) on delete restrict,
  intake_id uuid not null references public.app_signup_intakes(id)
    on delete restrict,
  authenticated_actor_user_id uuid not null,
  privacy_notice_read boolean not null,
  service_terms_accepted boolean not null,
  fee_terms_accepted boolean not null,
  mandate_signed boolean not null,
  accepted_at timestamptz not null,
  acceptance_sha256 text not null unique,
  request_id text not null,
  created_at timestamptz not null default now(),
  constraint app_signup_signing_presentation_acceptance_actions_true check (
    privacy_notice_read and service_terms_accepted
    and fee_terms_accepted and mandate_signed
  ),
  constraint app_signup_signing_presentation_acceptance_hash_valid check (
    acceptance_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_signup_signing_presentation_acceptance_request_valid check (
    btrim(request_id) <> ''
  )
);

alter table public.app_signup_signing_challenges
  add column presentation_receipt_id uuid null references
    public.app_signup_signing_presentation_receipts(id) on delete restrict,
  add column presentation_receipt_reference text null,
  add column presentation_receipt_sha256 text null,
  add column presentation_acceptance_id uuid null references
    public.app_signup_signing_presentation_acceptances(id) on delete restrict,
  add column presentation_acceptance_sha256 text null,
  add constraint app_signup_signing_challenge_presentation_binding_complete
    check (
      (presentation_receipt_id is null
       and presentation_receipt_reference is null
       and presentation_receipt_sha256 is null
       and presentation_acceptance_id is null
       and presentation_acceptance_sha256 is null)
      or
      (presentation_receipt_id is not null
       and presentation_receipt_reference is not null
       and presentation_receipt_sha256 ~ '^[0-9a-f]{64}$'
       and presentation_acceptance_id is not null
       and presentation_acceptance_sha256 ~ '^[0-9a-f]{64}$')
    );

create function public.app_signup_signing_presentation_receipt_integrity_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.presented_at < now() - interval '1 minute'
     or new.presented_at > now() + interval '1 minute'
     or not exists (
       select 1
       from public.app_signup_authenticated_intake_provenance provenance
       where provenance.intake_id = new.intake_id
         and provenance.auth_user_id = new.authenticated_auth_user_id
     )
     or not exists (
       select 1
       from public.app_tenant_configuration_manifests manifest
       where manifest.id = new.manifest_revision_id
         and manifest.tenant_id = new.tenant_id
         and manifest.environment = new.environment
         and manifest.canonical_sha256 = new.manifest_canonical_sha256
         and manifest.operational_component_revision_id =
           new.operational_component_revision_id
         and manifest.legal_component_revision_id =
           new.legal_component_revision_id
         and manifest.fee_commercial_component_revision_id =
           new.fee_component_revision_id
     )
     or not exists (
       select 1
       from public.app_tenant_signing_material_revisions material
       join public.app_tenant_signing_operational_material operational
         on operational.signing_material_revision_id = material.id
       where material.id = new.operational_signing_material_revision_id
         and material.tenant_id = new.tenant_id
         and material.environment = new.environment
         and material.material_kind = 'operational'
         and material.component_revision_id =
           new.operational_component_revision_id
         and material.canonical_content_sha256 =
           new.operational_signing_material_sha256
     )
     or not exists (
       select 1
       from public.app_tenant_signing_material_revisions material
       join public.app_tenant_signing_legal_material legal
         on legal.signing_material_revision_id = material.id
       where material.id = new.legal_signing_material_revision_id
         and material.tenant_id = new.tenant_id
         and material.environment = new.environment
         and material.material_kind = 'legal'
         and material.component_revision_id = new.legal_component_revision_id
         and material.canonical_content_sha256 =
           new.legal_signing_material_sha256
         and legal.bundle_revision = new.legal_bundle_revision
         and legal.bundle_canonical_sha256 = new.legal_bundle_sha256
         and legal.privacy_notice_document_reference =
           new.privacy_notice_document_reference
         and legal.privacy_notice_version = new.privacy_notice_version
         and legal.privacy_notice_language = new.privacy_notice_language
         and legal.privacy_notice_content_sha256 =
           new.privacy_notice_content_sha256
         and legal.service_terms_document_reference =
           new.service_terms_document_reference
         and legal.service_terms_version = new.service_terms_version
         and legal.service_terms_language = new.service_terms_language
         and legal.service_terms_content_sha256 =
           new.service_terms_content_sha256
         and legal.fee_terms_document_reference =
           new.fee_terms_document_reference
         and legal.fee_terms_version = new.fee_terms_version
         and legal.fee_terms_language = new.fee_terms_language
         and legal.fee_terms_content_sha256 = new.fee_terms_content_sha256
         and legal.mandate_document_reference =
           new.mandate_document_reference
         and legal.mandate_version = new.mandate_version
         and legal.mandate_language = new.mandate_language
         and legal.mandate_content_sha256 = new.mandate_content_sha256
     )
     or not exists (
       select 1
       from public.app_tenant_signing_material_revisions material
       join public.app_tenant_signing_fee_material fee
         on fee.signing_material_revision_id = material.id
       where material.id = new.fee_signing_material_revision_id
         and material.tenant_id = new.tenant_id
         and material.environment = new.environment
         and material.material_kind = 'fee_commercial'
         and material.component_revision_id = new.fee_component_revision_id
         and material.canonical_content_sha256 =
           new.fee_signing_material_sha256
         and fee.document_type = 'fee_terms'
         and fee.document_reference = new.fee_terms_document_reference
         and fee.version = new.fee_terms_version
         and fee.language = new.fee_terms_language
         and fee.content_sha256 = new.fee_terms_content_sha256
     )
  then
    raise exception 'signing presentation receipt provenance invalid'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.app_signup_signing_challenge_binding_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.presentation_receipt_id is distinct from old.presentation_receipt_id
    or new.presentation_receipt_reference is distinct from
      old.presentation_receipt_reference
    or new.presentation_receipt_sha256 is distinct from
      old.presentation_receipt_sha256
    or new.presentation_acceptance_id is distinct from
      old.presentation_acceptance_id
    or new.presentation_acceptance_sha256 is distinct from
      old.presentation_acceptance_sha256
  then
    raise exception 'signing challenge presentation binding is immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create function public.app_signup_signing_challenge_presentation_integrity_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.presentation_receipt_id is not null and not exists (
    select 1
    from public.app_signup_signing_presentation_receipts receipt
    join public.app_signup_signing_presentation_acceptances acceptance
      on acceptance.presentation_receipt_id = receipt.id
    where receipt.id = new.presentation_receipt_id
      and receipt.intake_id = new.intake_id
      and receipt.receipt_reference = new.presentation_receipt_reference
      and receipt.receipt_sha256 = new.presentation_receipt_sha256
      and acceptance.id = new.presentation_acceptance_id
      and acceptance.intake_id = new.intake_id
      and acceptance.acceptance_sha256 =
        new.presentation_acceptance_sha256
  ) then
    raise exception 'signing challenge presentation binding invalid'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_app_signup_signing_presentation_receipt_immutable
before update or delete on public.app_signup_signing_presentation_receipts
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_signup_signing_presentation_receipt_integrity
before insert on public.app_signup_signing_presentation_receipts
for each row execute function
  public.app_signup_signing_presentation_receipt_integrity_v1();
create trigger trg_app_signup_signing_presentation_acceptance_immutable
before update or delete on public.app_signup_signing_presentation_acceptances
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_signup_signing_presentation_receipt_truncate_guard
before truncate on public.app_signup_signing_presentation_receipts
for each statement execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_signup_signing_presentation_acceptance_truncate_guard
before truncate on public.app_signup_signing_presentation_acceptances
for each statement execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_signup_signing_challenge_binding_immutable
before update on public.app_signup_signing_challenges
for each row execute function
  public.app_signup_signing_challenge_binding_immutable_v1();
create trigger trg_app_signup_signing_challenge_presentation_integrity
before insert on public.app_signup_signing_challenges
for each row execute function
  public.app_signup_signing_challenge_presentation_integrity_v1();

create function public.app_signup_signing_challenge_issue_v2(
  p_intake_id uuid,
  p_manage_token_sha256 text,
  p_authenticated_auth_user_id uuid,
  p_tenant_id uuid,
  p_environment text,
  p_receipt_reference text,
  p_receipt_sha256 text,
  p_current_manifest_revision_id uuid,
  p_current_manifest_sha256 text,
  p_privacy_notice_read boolean,
  p_service_terms_accepted boolean,
  p_fee_terms_accepted boolean,
  p_mandate_signed boolean,
  p_accepted_at timestamptz,
  p_acceptance_sha256 text,
  p_channel_reference_sha256 text,
  p_otp_verifier_sha256 text,
  p_expires_at timestamptz,
  p_payload_hash text,
  p_request_id text,
  p_idempotency_key text,
  p_ip_hash text,
  p_user_agent_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_scope text;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_receipt public.app_signup_signing_presentation_receipts%rowtype;
  v_acceptance public.app_signup_signing_presentation_acceptances%rowtype;
  v_challenge_id uuid := gen_random_uuid();
  v_response jsonb;
  v_recent integer;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_receipt_reference !~
       '^SPR-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_receipt_sha256 !~ '^[0-9a-f]{64}$'
     or p_acceptance_sha256 !~ '^[0-9a-f]{64}$'
     or p_channel_reference_sha256 !~ '^[0-9a-f]{64}$'
     or p_otp_verifier_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or p_request_id is null or btrim(p_request_id) = ''
     or p_environment !~ '^[a-z][a-z0-9_-]{1,63}$'
     or p_accepted_at < v_now - interval '1 minute'
     or p_accepted_at > v_now + interval '1 minute'
     or p_expires_at <= v_now
     or p_expires_at > v_now + interval '10 minutes'
     or not p_privacy_notice_read
     or not p_service_terms_accepted
     or not p_fee_terms_accepted
     or not p_mandate_signed
  then
    raise exception 'invalid signing presentation challenge input';
  end if;

  select * into v_intake from public.app_signup_intakes
  where id = p_intake_id for update;
  if not found or v_intake.status <> 'collecting'
     or v_intake.expires_at <= v_now then
    raise exception 'signup intake unavailable';
  end if;
  select * into v_manage from public.app_signup_intake_capabilities
  where intake_id = p_intake_id and intake_file_id is null
    and capability_type = 'intake_manage'
    and token_sha256 = p_manage_token_sha256 for update;
  if not found or v_manage.consumed_at is not null
     or v_manage.invalidated_at is not null or v_manage.expires_at <= v_now then
    raise exception 'signup intake capability unavailable';
  end if;

  select * into v_receipt
  from public.app_signup_signing_presentation_receipts receipt
  where receipt.receipt_reference = p_receipt_reference
    and receipt.intake_id = p_intake_id
    and receipt.authenticated_auth_user_id = p_authenticated_auth_user_id
    and receipt.tenant_id = p_tenant_id
    and receipt.environment = p_environment
  for update;
  if not found or v_receipt.receipt_sha256 <> p_receipt_sha256 then
    return jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'presentation_receipt_unavailable',
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
    select 1
    from public.app_tenant_signing_configuration_invalidations invalidation
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
      'ok', false, 'status', 422, 'code', 'signing_configuration_invalidated',
      'error', 'Vraag de documenten opnieuw op.'
    );
  end if;

  select * into v_acceptance
  from public.app_signup_signing_presentation_acceptances acceptance
  where acceptance.presentation_receipt_id = v_receipt.id for update;
  if not found then
    if p_current_manifest_revision_id is null
       or p_current_manifest_sha256 is null
       or p_current_manifest_revision_id <> v_receipt.manifest_revision_id
       or p_current_manifest_sha256 <> v_receipt.manifest_canonical_sha256
    then
      return jsonb_build_object(
        'ok', false, 'status', 409,
        'code', 'presentation_configuration_superseded',
        'error', 'Vraag de actuele documenten opnieuw op.'
      );
    end if;
    insert into public.app_signup_signing_presentation_acceptances (
      presentation_receipt_id, intake_id, authenticated_actor_user_id,
      privacy_notice_read, service_terms_accepted, fee_terms_accepted,
      mandate_signed, accepted_at, acceptance_sha256, request_id
    ) values (
      v_receipt.id, p_intake_id, p_authenticated_auth_user_id,
      p_privacy_notice_read, p_service_terms_accepted,
      p_fee_terms_accepted, p_mandate_signed, p_accepted_at,
      p_acceptance_sha256, p_request_id
    ) returning * into v_acceptance;
  elsif v_acceptance.intake_id <> p_intake_id
     or v_acceptance.authenticated_actor_user_id <>
       p_authenticated_auth_user_id
     or not v_acceptance.privacy_notice_read
     or not v_acceptance.service_terms_accepted
     or not v_acceptance.fee_terms_accepted
     or not v_acceptance.mandate_signed then
    raise exception 'signing presentation acceptance binding invalid';
  end if;

  v_scope := 'api-app-signup-signing-challenge:v2:' ||
    p_intake_id::text || ':' || v_receipt.id::text;
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
      'error', 'Code wordt al aangevraagd.'
    );
  end if;

  select count(*) into v_recent
  from public.app_signup_signing_challenges challenge
  where (challenge.intake_id = p_intake_id
      or challenge.channel_reference_sha256 = p_channel_reference_sha256)
    and challenge.created_at > v_now - interval '10 minutes';
  if v_recent >= 3 then
    v_response := jsonb_build_object(
      'ok', false, 'status', 429, 'code', 'rate_limited',
      'error', 'Wacht voordat je een nieuwe code aanvraagt.'
    );
    update public.app_idempotency_keys
    set response_status = 429, response_body = v_response,
      completed_at = v_now
    where scope = v_scope and key = p_idempotency_key;
    return v_response;
  end if;

  update public.app_signup_signing_challenges
  set replaced_at = v_now
  where intake_id = p_intake_id and consumed_at is null
    and replaced_at is null and delivery_status in ('pending', 'delivered');
  insert into public.app_signup_signing_challenges (
    id, intake_id, method_id, method_version, channel_reference_sha256,
    otp_verifier_sha256, expires_at, presentation_receipt_id,
    presentation_receipt_reference, presentation_receipt_sha256,
    presentation_acceptance_id, presentation_acceptance_sha256
  ) values (
    v_challenge_id, p_intake_id, 'typed_name_otp_v1', '1',
    p_channel_reference_sha256, p_otp_verifier_sha256, p_expires_at,
    v_receipt.id, v_receipt.receipt_reference, v_receipt.receipt_sha256,
    v_acceptance.id, v_acceptance.acceptance_sha256
  );
  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, actor_ref,
    ip_hash, user_agent_hash, event_data
  ) values (
    'signup_signing_presentation_accepted_and_challenge_issued',
    p_request_id, p_idempotency_key, 'customer',
    'auth_user:' || p_authenticated_auth_user_id::text,
    p_ip_hash, p_user_agent_hash,
    jsonb_build_object(
      'environment', p_environment,
      'intake_reference', p_intake_id,
      'presentation_receipt_reference', v_receipt.receipt_reference,
      'presentation_acceptance_reference', v_acceptance.id,
      'challenge_reference', v_challenge_id,
      'method_id', 'typed_name_otp_v1', 'expiry_seconds', 600
    )
  );
  v_response := jsonb_build_object(
    'ok', true, 'status', 201,
    'mode', 'signup_signing_challenge_v2',
    'challenge_reference', v_challenge_id,
    'expires_at', p_expires_at, 'attempts_remaining', 5,
    'presentation_receipt_reference', v_receipt.receipt_reference,
    'replayed', false
  );
  update public.app_idempotency_keys
  set response_status = 201, response_body = v_response,
    completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;
  return v_response;
end;
$$;

create index app_signup_signing_presentation_receipt_context_idx
  on public.app_signup_signing_presentation_receipts (
    tenant_id, environment, intake_id, presented_at desc
  );
create index app_signup_signing_presentation_acceptance_intake_idx
  on public.app_signup_signing_presentation_acceptances (
    intake_id, accepted_at desc
  );
create index app_signup_signing_challenge_presentation_idx
  on public.app_signup_signing_challenges(presentation_receipt_id)
  where presentation_receipt_id is not null;

alter table public.app_signup_signing_presentation_receipts
  enable row level security;
alter table public.app_signup_signing_presentation_acceptances
  enable row level security;
create policy deny_all on public.app_signup_signing_presentation_receipts
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_signup_signing_presentation_acceptances
for all to anon, authenticated using (false) with check (false);

revoke all on table public.app_signup_signing_presentation_receipts
  from public, anon, authenticated, service_role;
revoke all on table public.app_signup_signing_presentation_acceptances
  from public, anon, authenticated, service_role;
grant select, insert on table public.app_signup_signing_presentation_receipts
  to service_role;
grant select on table public.app_signup_signing_presentation_acceptances
  to service_role;
revoke all on function
  public.app_signup_signing_presentation_receipt_integrity_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.app_signup_signing_challenge_binding_immutable_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.app_signup_signing_challenge_presentation_integrity_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_signup_signing_challenge_issue_v2(
  uuid, text, uuid, uuid, text, text, text, uuid, text,
  boolean, boolean, boolean, boolean, timestamptz, text, text, text,
  timestamptz, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_signup_signing_challenge_issue_v2(
  uuid, text, uuid, uuid, text, text, text, uuid, text,
  boolean, boolean, boolean, boolean, timestamptz, text, text, text,
  timestamptz, text, text, text, text, text
) to service_role;

comment on table public.app_signup_signing_presentation_receipts is
  'Immutable server-issued SL01-C legal-presentation receipt. Stores exact tenant/config/material/document provenance but no duplicate legal text.';
comment on table public.app_signup_signing_presentation_acceptances is
  'Immutable explicit customer legal-action acceptance of exactly one presentation receipt; page rendering is not acceptance.';
comment on function public.app_signup_signing_challenge_issue_v2(
  uuid, text, uuid, uuid, text, text, text, uuid, text,
  boolean, boolean, boolean, boolean, timestamptz, text, text, text,
  timestamptz, text, text, text, text, text
) is
  'Atomically persists first explicit receipt acceptance and issues an existing-semantics OTP challenge bound to that receipt and acceptance.';

commit;

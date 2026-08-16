-- ENVAL 09C1A signed-signup promotion database foundation.
--
-- Boundaries:
-- - local forward-only database/RPC foundation;
-- - no Edge Function, frontend, Storage copy, Auth invitation, dashboard cutover,
--   remote apply, external verification, evidence acceptance, EAN acceptance,
--   representation-authority decision, eligibility, booking, REV or settlement;
-- - the service-only caller supplies a manifest for private durable objects that
--   it has already prepared and verified. This migration never accesses Storage.

-- Converge only the signup-intake lifecycle. Historical audit rows remain
-- historical evidence; no other domain status is renamed.
alter table public.app_signup_intakes
  disable trigger trg_app_signup_intakes_transition_guard;

alter table public.app_signup_intakes
  drop constraint app_signup_intakes_status_chk,
  drop constraint app_signup_intakes_verified_before_promoting_chk,
  drop constraint app_signup_intakes_promoted_pair_chk,
  drop constraint app_signup_intakes_promoted_state_chk;

alter table public.app_signup_intakes
  add column promotion_case_id uuid null;

update public.app_signup_intakes
set status = 'submitted_for_review'
where status = 'pending_verification';

alter table public.app_signup_intakes
  add constraint app_signup_intakes_status_chk
    check (
      status in (
        'collecting',
        'submitted_for_review',
        'promoting',
        'promoted',
        'rejected',
        'expired'
      )
    ),
  add constraint app_signup_intakes_ready_before_promoting_chk
    check (
      status not in ('promoting', 'promoted')
      or finalized_at is not null
    ),
  add constraint app_signup_intakes_promoted_pair_chk
    check (
      (
        promoted_at is null
        and promotion_case_id is null
        and promotion_dossier_id is null
      )
      or (
        promoted_at is not null
        and num_nonnulls(promotion_case_id, promotion_dossier_id) = 1
      )
    ),
  add constraint app_signup_intakes_promoted_state_chk
    check (
      status <> 'promoted'
      or (
        promoted_at is not null
        and num_nonnulls(promotion_case_id, promotion_dossier_id) = 1
      )
    ),
  add constraint app_signup_intakes_promotion_case_id_fkey
    foreign key (promotion_case_id)
    references public.app_cases (id)
    on delete restrict;

create index app_signup_intakes_promotion_case_id_idx
  on public.app_signup_intakes (promotion_case_id)
  where promotion_case_id is not null;

create or replace function public.app_signup_intakes_transition_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.finalized_at is not null then
    if new.submitted_payload is distinct from old.submitted_payload
       or new.submitted_payload_sha256 is distinct from old.submitted_payload_sha256
       or new.accepted_legal_versions is distinct from old.accepted_legal_versions
       or new.email_normalized is distinct from old.email_normalized
       or new.finalized_at is distinct from old.finalized_at then
      raise exception 'finalized app_signup_intakes submitted facts cannot be changed';
    end if;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'immutable app_signup_intakes identity fields cannot be changed';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'collecting' and new.status = 'submitted_for_review' then
      return new;
    end if;
    if old.status = 'submitted_for_review'
       and new.status in ('promoting', 'expired', 'rejected') then
      return new;
    end if;
    if old.status = 'promoting' and new.status in ('promoted', 'rejected') then
      return new;
    end if;
    raise exception 'invalid app_signup_intakes status transition from % to %',
      old.status, new.status;
  end if;

  if old.status in ('promoted', 'expired') then
    raise exception 'terminal app_signup_intakes rows cannot be updated';
  end if;

  return new;
end;
$$;

alter table public.app_signup_intakes
  enable trigger trg_app_signup_intakes_transition_guard;

comment on column public.app_signup_intakes.status is
'Signup intake lifecycle. submitted_for_review means signed, finalized and mutation-locked for ENVAL internal review/promotion; it has no external-verifier meaning.';

comment on column public.app_signup_intakes.promotion_case_id is
'Terminal app_cases target created by the service-only signed-signup promotion transaction. Never an app_customer_dossiers identifier.';

comment on column public.app_signup_intakes.promotion_dossier_id is
'Historical pre-09C1 dossier promotion target only. New signed-signup promotion must leave this null and use promotion_case_id.';

-- The signed runtime currently carries a formatted declared address. Preserve
-- it in the existing observation layer without parsing it into accepted fields.
alter table public.app_location_address_observations
  add column declared_address_text text null;

alter table public.app_location_address_observations
  drop constraint app_location_address_observations_descriptor_kind_chk,
  drop constraint app_location_address_observations_descriptor_shape_chk;

alter table public.app_location_address_observations
  add constraint app_location_address_observations_descriptor_kind_chk
    check (
      descriptor_kind in (
        'postal_address',
        'site_reference',
        'unstructured_postal_address'
      )
    ),
  add constraint app_location_address_observations_descriptor_shape_chk
    check (
      (
        descriptor_kind = 'postal_address'
        and postal_code is not null
        and house_number is not null
        and street is not null
        and city is not null
        and site_reference is null
        and declared_address_text is null
      )
      or (
        descriptor_kind = 'site_reference'
        and site_reference is not null
        and postal_code is null
        and house_number is null
        and house_number_addition is null
        and street is null
        and city is null
        and declared_address_text is null
      )
      or (
        descriptor_kind = 'unstructured_postal_address'
        and declared_address_text is not null
        and btrim(declared_address_text) <> ''
        and char_length(declared_address_text) <= 500
        and postal_code is null
        and house_number is null
        and house_number_addition is null
        and street is null
        and city is null
        and site_reference is null
      )
    );

comment on column public.app_location_address_observations.declared_address_text is
'Immutable unstructured customer-declared address observation from a signed source. It is not an accepted or normalized location version.';

create unique index app_cases_signed_signup_intake_source_uidx
  on public.app_cases (source_class, source_ref)
  where source_class = 'signed_signup_intake';

create table public.app_signup_promotions (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null unique
    references public.app_signup_intakes (id) on delete restrict,
  customer_id uuid not null
    references public.app_customers (id) on delete restrict,
  identity_id uuid not null
    references public.app_customer_identities (id) on delete restrict,
  service_recipient_party_id uuid not null
    references public.app_parties (id) on delete restrict,
  contact_party_id uuid null
    references public.app_parties (id) on delete restrict,
  case_id uuid not null unique
    references public.app_cases (id) on delete restrict,
  signing_snapshot_id uuid not null unique
    references public.app_signup_signing_snapshots (id) on delete restrict,
  mandate_id uuid not null unique
    references public.app_signup_mandates (id) on delete restrict,
  signature_evidence_id uuid not null unique
    references public.app_signup_signature_evidence (id) on delete restrict,
  account_type text not null,
  source_signing_sha256 text not null,
  promotion_payload_sha256 text not null,
  request_payload_sha256 text not null,
  request_id text not null,
  idempotency_key text not null,
  actor_type text not null default 'system',
  actor_ref text not null,
  environment text not null,
  promoted_at timestamptz not null,

  constraint app_signup_promotions_account_type_chk
    check (account_type in ('particulier', 'zakelijk', 'vve')),
  constraint app_signup_promotions_hashes_chk
    check (
      source_signing_sha256 ~ '^[0-9a-f]{64}$'
      and promotion_payload_sha256 ~ '^[0-9a-f]{64}$'
      and request_payload_sha256 ~ '^[0-9a-f]{64}$'
    ),
  constraint app_signup_promotions_actor_type_chk
    check (actor_type = 'system'),
  constraint app_signup_promotions_provenance_chk
    check (
      btrim(request_id) <> ''
      and btrim(idempotency_key) <> ''
      and btrim(actor_ref) <> ''
      and btrim(environment) <> ''
    )
);

create index app_signup_promotions_customer_id_idx
  on public.app_signup_promotions (customer_id);
create index app_signup_promotions_service_recipient_idx
  on public.app_signup_promotions (service_recipient_party_id);

create table public.app_case_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null
    references public.app_cases (id) on delete restrict,
  promotion_id uuid null
    references public.app_signup_promotions (id) on delete restrict,
  lifecycle_state text not null,
  event_at timestamptz not null,
  actor_type text not null,
  actor_ref text not null,
  source_class text not null,
  source_ref text not null,
  request_id text not null,
  event_data jsonb not null default '{}'::jsonb,

  constraint app_case_lifecycle_events_state_chk
    check (
      lifecycle_state in (
        'submitted_for_review',
        'action_needed',
        'ready_for_next_phase',
        'rejected'
      )
    ),
  constraint app_case_lifecycle_events_actor_type_chk
    check (actor_type in ('system', 'support', 'admin', 'worker')),
  constraint app_case_lifecycle_events_provenance_chk
    check (
      btrim(actor_ref) <> ''
      and btrim(source_class) <> ''
      and btrim(source_ref) <> ''
      and btrim(request_id) <> ''
      and jsonb_typeof(event_data) = 'object'
    )
);

create unique index app_case_lifecycle_events_initial_promotion_uidx
  on public.app_case_lifecycle_events (promotion_id)
  where promotion_id is not null;
create index app_case_lifecycle_events_case_event_idx
  on public.app_case_lifecycle_events (case_id, event_at);

create table public.app_evidence_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null
    references public.app_cases (id) on delete restrict,
  promotion_id uuid not null
    references public.app_signup_promotions (id) on delete restrict,
  document_type text not null,
  source_class text not null,
  source_ref text not null,
  created_at timestamptz not null,
  created_by_actor_ref text not null,
  request_id text not null,

  constraint app_evidence_files_provenance_chk
    check (
      btrim(document_type) <> ''
      and source_class = 'signup_quarantine_file'
      and btrim(source_ref) <> ''
      and btrim(created_by_actor_ref) <> ''
      and btrim(request_id) <> ''
    ),
  constraint app_evidence_files_promotion_source_key
    unique (promotion_id, source_ref)
);

create index app_evidence_files_case_id_idx
  on public.app_evidence_files (case_id);

create table public.app_evidence_versions (
  id uuid primary key default gen_random_uuid(),
  evidence_file_id uuid not null
    references public.app_evidence_files (id) on delete restrict,
  version_number integer not null,
  source_intake_file_id uuid not null unique
    references public.app_signup_intake_files (id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  detected_mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  status text not null,
  source_confirmed_at timestamptz not null,
  created_at timestamptz not null,
  request_id text not null,
  idempotency_key text not null,

  constraint app_evidence_versions_number_chk check (version_number > 0),
  constraint app_evidence_versions_storage_key unique (storage_bucket, storage_path),
  constraint app_evidence_versions_file_version_key unique (evidence_file_id, version_number),
  constraint app_evidence_versions_size_chk check (size_bytes > 0),
  constraint app_evidence_versions_sha256_chk check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_evidence_versions_status_chk
    check (status = 'confirmed_awaiting_review'),
  constraint app_evidence_versions_provenance_chk
    check (
      btrim(storage_bucket) <> ''
      and btrim(storage_path) <> ''
      and btrim(detected_mime_type) <> ''
      and btrim(request_id) <> ''
      and btrim(idempotency_key) <> ''
    )
);

create index app_evidence_versions_file_id_idx
  on public.app_evidence_versions (evidence_file_id);

alter table public.app_signup_intake_files
  add column promoted_evidence_file_id uuid null;

alter table public.app_signup_intake_files
  drop constraint app_signup_intake_files_promoted_pair_chk,
  drop constraint app_signup_intake_files_promoted_state_chk;

alter table public.app_signup_intake_files
  add constraint app_signup_intake_files_promoted_pair_chk
    check (
      (
        promoted_at is null
        and promoted_document_file_id is null
        and promoted_evidence_file_id is null
      )
      or (
        promoted_at is not null
        and num_nonnulls(
          promoted_document_file_id,
          promoted_evidence_file_id
        ) = 1
      )
    ),
  add constraint app_signup_intake_files_promoted_state_chk
    check (
      status <> 'promoted'
      or (
        confirmed_at is not null
        and promoted_at is not null
        and num_nonnulls(
          promoted_document_file_id,
          promoted_evidence_file_id
        ) = 1
      )
    );

alter table public.app_signup_intake_files
  add constraint app_signup_intake_files_promoted_evidence_file_fkey
  foreign key (promoted_evidence_file_id)
  references public.app_evidence_files (id)
  on delete restrict;

create or replace function public.app_signup_promotion_immutable_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are immutable and cannot be updated or deleted',
    tg_table_name;
end;
$$;

create trigger trg_app_signup_promotions_immutable
before update or delete on public.app_signup_promotions
for each row execute function public.app_signup_promotion_immutable_guard();

create trigger trg_app_case_lifecycle_events_immutable
before update or delete on public.app_case_lifecycle_events
for each row execute function public.app_signup_promotion_immutable_guard();

create trigger trg_app_evidence_files_immutable
before update or delete on public.app_evidence_files
for each row execute function public.app_signup_promotion_immutable_guard();

create trigger trg_app_evidence_versions_immutable
before update or delete on public.app_evidence_versions
for each row execute function public.app_signup_promotion_immutable_guard();

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

  if v_intake_status = 'collecting' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and v_intake_status = 'promoting'
     and old.status = 'confirmed_quarantine'
     and new.status = 'promoted'
     and new.promoted_at is not null
     and new.promoted_evidence_file_id is not null
     and new.promoted_document_file_id is null
     and (to_jsonb(new) - 'status' - 'promoted_at' - 'promoted_evidence_file_id')
       = (to_jsonb(old) - 'status' - 'promoted_at' - 'promoted_evidence_file_id') then
    return new;
  end if;

  raise exception 'finalized signup intake files are immutable';
end;
$$;

alter table public.app_audit_events
  drop constraint app_audit_events_scope_type_chk;

alter table public.app_audit_events
  add constraint app_audit_events_scope_type_chk
    check (
      scope_type in (
        'intake', 'auth', 'customer', 'dossier', 'case', 'promotion',
        'location', 'charger', 'document', 'evidence', 'request', 'support',
        'consent', 'kwh', 'result', 'fee', 'retention'
      )
    );

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

  select array_agg(fact ->> 'value')
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

  select array_agg(fact ->> 'value')
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
  else
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

    if v_account_type = 'particulier' then
      select array_agg(profile.id order by profile.id)
      into v_profile_ids
      from public.app_party_person_versions profile
      where profile.party_id = v_service_party_id
        and profile.valid_to is null
        and profile.full_name = v_service_name;
      if coalesce(array_length(v_profile_ids, 1), 0) <> 1 then
        raise exception 'account-owner person profile conflicts with signed declaration';
      end if;
      v_service_person_profile_id := v_profile_ids[1];
    else
      select array_agg(profile.id order by profile.id)
      into v_profile_ids
      from public.app_party_organization_versions profile
      where profile.party_id = v_service_party_id
        and profile.valid_to is null
        and profile.legal_name = v_service_name
        and profile.organization_classification = v_organization_classification;
      if coalesce(array_length(v_profile_ids, 1), 0) <> 1 then
        raise exception 'account-owner organization profile conflicts with signed declaration';
      end if;
      v_service_organization_profile_id := v_profile_ids[1];
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
    if v_contact_name <> v_service_name then
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

-- Keep the already deployed browser receipt/status projection compatible in
-- 09C1A while converging database truth and new audit writes. 09C1B owns the
-- frontend receipt schema/copy cutover.
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
  set status = 'submitted_for_review', finalized_at = v_now,
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
      'next_status', 'submitted_for_review')
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

  if v_intake.status <> 'submitted_for_review'
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

alter table public.app_signup_promotions enable row level security;
alter table public.app_case_lifecycle_events enable row level security;
alter table public.app_evidence_files enable row level security;
alter table public.app_evidence_versions enable row level security;

create policy deny_all on public.app_signup_promotions
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_case_lifecycle_events
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_evidence_files
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_evidence_versions
for all to anon, authenticated using (false) with check (false);

revoke all on table public.app_signup_promotions
  from public, anon, authenticated, service_role;
revoke all on table public.app_case_lifecycle_events
  from public, anon, authenticated, service_role;
revoke all on table public.app_evidence_files
  from public, anon, authenticated, service_role;
revoke all on table public.app_evidence_versions
  from public, anon, authenticated, service_role;

grant select on table public.app_signup_promotions to service_role;
grant select on table public.app_case_lifecycle_events to service_role;
grant select on table public.app_evidence_files to service_role;
grant select on table public.app_evidence_versions to service_role;

revoke all on function public.app_signup_promotion_immutable_guard()
  from public, anon, authenticated;
revoke all on function public.app_promote_signed_signup_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.app_promote_signed_signup_v1(jsonb)
  to service_role;

comment on table public.app_signup_promotions is
'Immutable one-per-intake provenance owner for service-only atomic promotion into app_cases. Stores hashes and references, never OTP or raw capabilities.';
comment on table public.app_case_lifecycle_events is
'Append-only ENVAL internal case lifecycle. submitted_for_review has no external-verifier or NEa approval meaning.';
comment on table public.app_evidence_files is
'Case-owned durable evidence-file root created only from a server-confirmed signup quarantine source. It is not evidence acceptance.';
comment on table public.app_evidence_versions is
'Immutable private durable-object metadata awaiting internal review. No Storage copy is performed by this migration or RPC.';
comment on function public.app_promote_signed_signup_v1(jsonb) is
'Service-role-only atomic/idempotent signed-signup promotion. The request contains internal intake provenance and a server-prepared durable-file manifest; browser receipts, safe references, OTP and capabilities are not inputs.';

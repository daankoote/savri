begin;

-- CUSTOMER04C3B1: private replacement evidence is staged outside committed
-- app_evidence_versions until a later signed finalizer promotes it.

create table public.app_customer_correction_replacement_uploads (
  id uuid primary key,
  upload_reference text not null unique,
  handoff_id uuid not null
    references public.app_evidence_review_correction_handoffs(id)
    on delete restrict,
  replacement_target_ref text not null,
  case_id uuid not null references public.app_cases(id) on delete restrict,
  customer_id uuid not null
    references public.app_customers(id) on delete restrict,
  predecessor_evidence_file_id uuid not null
    references public.app_evidence_files(id) on delete restrict,
  predecessor_evidence_version_id uuid not null
    references public.app_evidence_versions(id) on delete restrict,
  parser_profile text not null,
  item_refs jsonb not null,
  fact_keys jsonb not null,
  storage_bucket text not null,
  storage_path text not null unique,
  original_filename text not null,
  declared_mime_type text not null,
  declared_size_bytes bigint not null,
  issued_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  issued_by_customer_identity_id uuid not null
    references public.app_customer_identities(id) on delete restrict,
  actor_ref text not null,
  payload_sha256 text not null,
  request_id text not null,
  idempotency_key text not null,
  environment text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  constraint app_customer_correction_replacement_upload_ref_chk check (
    upload_reference ~ '^CRU-[A-F0-9]{32}$'
    and replacement_target_ref ~ '^CRT-[A-F0-9]{32}$'
  ),
  constraint app_customer_correction_replacement_upload_profile_chk check (
    parser_profile in ('energy_document_v1', 'installation_invoice_v1')
  ),
  constraint app_customer_correction_replacement_upload_items_chk check (
    pg_catalog.jsonb_typeof(item_refs) = 'array'
    and pg_catalog.jsonb_array_length(item_refs) > 0
    and pg_catalog.jsonb_typeof(fact_keys) = 'array'
    and pg_catalog.jsonb_array_length(fact_keys) > 0
  ),
  constraint app_customer_correction_replacement_upload_storage_chk check (
    storage_bucket = 'app-documents'
    and storage_path like 'customer-corrections/%'
    and storage_path not like '%..%'
  ),
  constraint app_customer_correction_replacement_upload_file_chk check (
    pg_catalog.btrim(original_filename) <> ''
    and original_filename = pg_catalog.btrim(original_filename)
    and pg_catalog.char_length(original_filename) <= 180
    and declared_mime_type = 'application/pdf'
    and declared_size_bytes between 1 and 15728640
  ),
  constraint app_customer_correction_replacement_upload_meta_chk check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
    and pg_catalog.btrim(request_id) <> ''
    and pg_catalog.btrim(idempotency_key) <> ''
    and pg_catalog.btrim(actor_ref) <> ''
    and environment in ('local', 'test', 'staging', 'production')
    and issued_at < expires_at
  )
);

create table public.app_customer_correction_replacement_candidates (
  id uuid primary key,
  candidate_reference text not null unique,
  upload_id uuid not null unique
    references public.app_customer_correction_replacement_uploads(id)
    on delete restrict,
  handoff_id uuid not null
    references public.app_evidence_review_correction_handoffs(id)
    on delete restrict,
  replacement_target_ref text not null,
  case_id uuid not null references public.app_cases(id) on delete restrict,
  customer_id uuid not null
    references public.app_customers(id) on delete restrict,
  predecessor_evidence_file_id uuid not null
    references public.app_evidence_files(id) on delete restrict,
  predecessor_evidence_version_id uuid not null
    references public.app_evidence_versions(id) on delete restrict,
  parser_profile text not null,
  item_refs jsonb not null,
  fact_keys jsonb not null,
  storage_bucket text not null,
  storage_path text not null,
  detected_mime_type text not null,
  size_bytes bigint not null,
  server_sha256 text not null,
  confirmed_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  confirmed_by_customer_identity_id uuid not null
    references public.app_customer_identities(id) on delete restrict,
  actor_ref text not null,
  payload_sha256 text not null,
  request_id text not null,
  idempotency_key text not null,
  environment text not null,
  confirmed_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint app_customer_correction_replacement_candidate_ref_chk check (
    candidate_reference ~ '^CRC-[A-F0-9]{32}$'
    and replacement_target_ref ~ '^CRT-[A-F0-9]{32}$'
  ),
  constraint app_customer_correction_replacement_candidate_profile_chk check (
    parser_profile in ('energy_document_v1', 'installation_invoice_v1')
  ),
  constraint app_customer_correction_replacement_candidate_items_chk check (
    pg_catalog.jsonb_typeof(item_refs) = 'array'
    and pg_catalog.jsonb_array_length(item_refs) > 0
    and pg_catalog.jsonb_typeof(fact_keys) = 'array'
    and pg_catalog.jsonb_array_length(fact_keys) > 0
  ),
  constraint app_customer_correction_replacement_candidate_file_chk check (
    storage_bucket = 'app-documents'
    and storage_path like 'customer-corrections/%'
    and detected_mime_type = 'application/pdf'
    and size_bytes between 1 and 15728640
    and server_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_customer_correction_replacement_candidate_meta_chk check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
    and pg_catalog.btrim(request_id) <> ''
    and pg_catalog.btrim(idempotency_key) <> ''
    and pg_catalog.btrim(actor_ref) <> ''
    and environment in ('local', 'test', 'staging', 'production')
    and confirmed_at <= recorded_at
  )
);

comment on table public.app_customer_correction_replacement_uploads is
  'Immutable server-issued private upload intents for exact current correction handoff replacement targets. They are not evidence versions, canonical truth, review decisions or customer submissions.';
comment on table public.app_customer_correction_replacement_candidates is
  'Immutable server-confirmed replacement byte candidates. They remain staged and non-current until a later signed finalizer creates committed evidence lineage.';

create index app_customer_correction_replacement_uploads_handoff_idx
  on public.app_customer_correction_replacement_uploads(
    handoff_id, replacement_target_ref, issued_at desc
  );
create index app_customer_correction_replacement_candidates_handoff_idx
  on public.app_customer_correction_replacement_candidates(
    handoff_id, replacement_target_ref, confirmed_at desc
  );

create trigger trg_app_customer_correction_replacement_uploads_immutable
before update or delete
on public.app_customer_correction_replacement_uploads
for each row execute function public.app_customer_correction_immutable_guard_v1();

create trigger trg_app_customer_correction_replacement_candidates_immutable
before update or delete
on public.app_customer_correction_replacement_candidates
for each row execute function public.app_customer_correction_immutable_guard_v1();

alter table public.app_customer_correction_replacement_uploads
  enable row level security;
alter table public.app_customer_correction_replacement_candidates
  enable row level security;
create policy deny_all on public.app_customer_correction_replacement_uploads
  for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_customer_correction_replacement_candidates
  for all to anon, authenticated using (false) with check (false);

-- C2 provenance is extended with one candidate source; existing source shapes
-- and hashes are untouched.
alter table public.app_parser_observation_envelopes
  drop constraint app_parser_observation_source_kind_chk,
  drop constraint app_parser_observation_source_ref_chk,
  add column correction_replacement_candidate_id uuid
    references public.app_customer_correction_replacement_candidates(id)
    on delete restrict;

alter table public.app_parser_observation_envelopes
  add constraint app_parser_observation_source_kind_chk check (
    source_kind in (
      'signup_intake_file',
      'evidence_version',
      'correction_replacement_candidate'
    )
  ),
  add constraint app_parser_observation_source_ref_chk check (
    (
      source_kind = 'signup_intake_file'
      and signup_intake_file_id is not null
      and evidence_version_id is null
      and correction_replacement_candidate_id is null
    ) or (
      source_kind = 'evidence_version'
      and signup_intake_file_id is null
      and evidence_version_id is not null
      and correction_replacement_candidate_id is null
    ) or (
      source_kind = 'correction_replacement_candidate'
      and signup_intake_file_id is null
      and evidence_version_id is null
      and correction_replacement_candidate_id is not null
    )
  );

create index app_parser_observation_replacement_candidate_idx
  on public.app_parser_observation_envelopes(
    correction_replacement_candidate_id, observed_at
  ) where correction_replacement_candidate_id is not null;

create function public.app_customer_correction_replacement_targets_v1(
  p_handoff_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_targets jsonb;
begin
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = p_handoff_id;
  if not found or v_handoff.bundle_sha256 <> pg_catalog.encode(
    extensions.digest(v_handoff.correction_bundle::text, 'sha256'), 'hex'
  ) then
    return '[]'::jsonb;
  end if;

  with document_items as (
    select
      item.value,
      item.value->>'evidence_file_ref' as evidence_file_ref,
      item.value->>'evidence_version_ref' as evidence_version_ref,
      item.value->>'evidence_kind' as evidence_kind,
      item.value->>'subject_ref' as subject_ref,
      item.value->>'fact_key' as fact_key,
      public.app_customer_correction_item_ref_v1(
        v_handoff.id,
        v_handoff.case_id,
        v_handoff.target_customer_id,
        item.value->>'subject_ref'
      ) as item_ref
    from pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
      item(value)
    where item.value->>'response_requirement' in (
      'DOCUMENT_REPLACEMENT',
      'VALUE_PLUS_DOCUMENT_REPLACEMENT'
    )
  ), grouped as (
    select
      document.evidence_file_ref,
      document.evidence_version_ref,
      document.evidence_kind,
      pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(document.item_ref)
        order by document.subject_ref
      ) as item_refs,
      pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(document.fact_key)
        order by document.subject_ref
      ) as fact_keys
    from document_items document
    group by document.evidence_file_ref,
      document.evidence_version_ref,
      document.evidence_kind
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'replacement_target_ref',
        'CRT-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
          extensions.digest(pg_catalog.concat_ws(
            '|', 'customer-correction-replacement-target-v1',
            v_handoff.id::text, grouped.evidence_file_ref,
            grouped.evidence_version_ref, grouped.evidence_kind
          ), 'sha256'), 'hex'
        ), 1, 32)),
      'document_label', case grouped.evidence_kind
        when 'energy_bill_or_contract' then 'Energiedocument'
        when 'installation_invoice' then 'Installatiefactuur'
        else null
      end,
      'accepted_mime_types', pg_catalog.jsonb_build_array('application/pdf'),
      'maximum_file_size', 15728640,
      'parser_profile', case grouped.evidence_kind
        when 'energy_bill_or_contract' then 'energy_document_v1'
        when 'installation_invoice' then 'installation_invoice_v1'
        else null
      end,
      'evidence_kind', grouped.evidence_kind,
      'predecessor_evidence_file_id', grouped.evidence_file_ref,
      'predecessor_evidence_version_id', grouped.evidence_version_ref,
      'item_refs', grouped.item_refs,
      'fact_keys', grouped.fact_keys
    ) order by grouped.evidence_file_ref, grouped.evidence_version_ref
  ), '[]'::jsonb) into v_targets
  from grouped
  where grouped.evidence_kind in (
    'energy_bill_or_contract', 'installation_invoice'
  );
  return v_targets;
end;
$$;

create function public.app_customer_correction_replacement_authority_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_replacement_target_ref text
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
  v_target jsonb;
  v_identity_id uuid;
  v_identity_count integer;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or p_replacement_target_ref !~ '^CRT-[A-F0-9]{32}$' then
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
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 401, 'code', 'authentication_required'
    );
  end if;
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
      and (
        access_grant.granted_case_id is null
        or access_grant.granted_case_id = v_case.id
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
    );
  end if;
  select pg_catalog.count(*)
    into v_identity_count
  from public.app_customer_identities identity_row
  where identity_row.auth_user_id = p_auth_user_id
    and identity_row.customer_id = v_case.customer_id
    and identity_row.status = 'active';
  if v_identity_count <> 1 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'customer_context_unavailable'
    );
  end if;
  select identity_row.id into strict v_identity_id
  from public.app_customer_identities identity_row
  where identity_row.auth_user_id = p_auth_user_id
    and identity_row.customer_id = v_case.customer_id
    and identity_row.status = 'active';

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_not_current'
    );
  end if;
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = public.app_evidence_review_current_correction_handoff_v1(
    v_case.id,
    v_manifest->>'manifest_version',
    v_manifest->>'manifest_hash'
  ) and handoff.target_customer_id = v_case.customer_id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_not_current'
    );
  end if;
  select target.value into v_target
  from pg_catalog.jsonb_array_elements(
    public.app_customer_correction_replacement_targets_v1(v_handoff.id)
  ) target(value)
  where target.value->>'replacement_target_ref' = p_replacement_target_ref;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'replacement_target_not_available'
    );
  end if;
  if not exists (
    select 1
    from public.app_evidence_versions evidence_version
    join public.app_evidence_files evidence_file
      on evidence_file.id = evidence_version.evidence_file_id
    where evidence_file.id =
        (v_target->>'predecessor_evidence_file_id')::uuid
      and evidence_file.case_id = v_case.id
      and evidence_version.id =
        (v_target->>'predecessor_evidence_version_id')::uuid
      and evidence_version.status = 'confirmed_awaiting_review'
      and not exists (
        select 1 from public.app_evidence_versions newer
        where newer.evidence_file_id = evidence_version.evidence_file_id
          and newer.status = 'confirmed_awaiting_review'
          and (
            newer.version_number > evidence_version.version_number
            or (
              newer.version_number = evidence_version.version_number
              and newer.created_at > evidence_version.created_at
            )
          )
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'predecessor_evidence_not_current'
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'case_id', v_case.id,
    'customer_id', v_case.customer_id,
    'customer_identity_id', v_identity_id,
    'actor_ref', 'app_customer_identity:' || v_identity_id::text,
    'handoff_id', v_handoff.id,
    'handoff_ref', v_handoff.handoff_reference,
    'target', v_target
  );
end;
$$;

create or replace function public.app_customer_correction_handoff_read_v2(
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
  v_targets jsonb;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64 then
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
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 401, 'code', 'authentication_required'
    );
  end if;
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
      and (
        access_grant.granted_case_id is null
        or access_grant.granted_case_id = v_case.id
      )
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
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = public.app_evidence_review_current_correction_handoff_v1(
    v_case.id,
    v_manifest->>'manifest_version',
    v_manifest->>'manifest_hash'
  ) and handoff.target_customer_id = v_case.customer_id;
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
  v_targets := public.app_customer_correction_replacement_targets_v1(
    v_handoff.id
  );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'item_ref', public.app_customer_correction_item_ref_v1(
        v_handoff.id, v_case.id, v_case.customer_id,
        bundle.item->>'subject_ref'
      ),
      'document_label',
        bundle.item->'customer_safe'->>'document_label',
      'fact_label', bundle.item->'customer_safe'->>'fact_label',
      'current_value', bundle.item->'customer_safe'->'current_value',
      'correction_reason',
        bundle.item->'customer_safe'->>'correction_reason',
      'correction_reason_label',
        bundle.item->'customer_safe'->>'correction_reason_label',
      'correction_instruction',
        bundle.item->'customer_safe'->>'correction_instruction',
      'response_requirement', coalesce(
        bundle.item->>'response_requirement',
        public.app_customer_correction_action_requirement_v1(
          bundle.item, subject.item->>'value_status'
        )
      ),
      'replacement_target', case when
        bundle.item->>'response_requirement' in (
          'DOCUMENT_REPLACEMENT',
          'VALUE_PLUS_DOCUMENT_REPLACEMENT'
        ) then pg_catalog.jsonb_build_object(
          'replacement_target_ref',
            replacement_target.value->>'replacement_target_ref',
          'document_label', replacement_target.value->>'document_label',
          'accepted_mime_types',
            replacement_target.value->'accepted_mime_types',
          'maximum_file_size',
            (replacement_target.value->>'maximum_file_size')::integer
        ) else null end
    )
  ) order by bundle.ordinality), '[]'::jsonb) into v_items
  from pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
    with ordinality bundle(item, ordinality)
  join pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    on subject.item->>'subject_ref' = bundle.item->>'subject_ref'
  left join lateral (
    select target.value
    from pg_catalog.jsonb_array_elements(v_targets) target(value)
    where target.value->>'predecessor_evidence_file_id' =
        bundle.item->>'evidence_file_ref'
      and target.value->>'predecessor_evidence_version_id' =
        bundle.item->>'evidence_version_ref'
    limit 1
  ) replacement_target on true;

  if pg_catalog.jsonb_array_length(v_items) <>
       pg_catalog.jsonb_array_length(v_handoff.correction_bundle->'items')
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(v_items) item(value)
       where item.value->>'item_ref' !~ '^CCI-[A-F0-9]{32}$'
          or item.value->>'response_requirement' not in (
            'VALUE_CORRECTION', 'MISSING_VALUE',
            'DOCUMENT_REPLACEMENT',
            'VALUE_PLUS_DOCUMENT_REPLACEMENT'
          )
          or (
            item.value->>'response_requirement' in (
              'DOCUMENT_REPLACEMENT',
              'VALUE_PLUS_DOCUMENT_REPLACEMENT'
            ) and item.value->'replacement_target' is null
          )
          or (
            item.value->>'response_requirement' in (
              'VALUE_CORRECTION', 'MISSING_VALUE'
            ) and item.value ? 'replacement_target'
          )
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'case_ref', v_case.case_reference,
    'handoff', pg_catalog.jsonb_build_object(
      'handoff_ref', v_handoff.handoff_reference,
      'published_at', v_handoff.published_at,
      'items', v_items
    )
  );
end;
$$;

create function public.app_customer_correction_replacement_upload_issue_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_replacement_target_ref text,
  p_original_filename text,
  p_declared_mime_type text,
  p_declared_size_bytes bigint,
  p_upload_expires_at timestamptz,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_authority jsonb;
  v_target jsonb;
  v_scope text;
  v_begin jsonb;
  v_upload_id uuid := gen_random_uuid();
  v_upload_ref text;
  v_storage_path text;
  v_response jsonb;
begin
  if p_original_filename is null
     or p_original_filename <> pg_catalog.btrim(p_original_filename)
     or pg_catalog.char_length(p_original_filename) not between 1 and 180
     or p_original_filename like '%/%'
     or p_original_filename like '%\\%'
     or p_original_filename like '%..%'
     or pg_catalog.lower(p_original_filename) not like '%.pdf'
     or p_declared_mime_type <> 'application/pdf'
     or p_declared_size_bytes not between 1 and 15728640
     or p_upload_expires_at <= v_now
     or p_upload_expires_at > v_now + interval '2 hours'
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_environment not in ('local', 'test', 'staging', 'production') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_authority := public.app_customer_correction_replacement_authority_v1(
    p_auth_user_id, p_case_ref, p_replacement_target_ref
  );
  if v_authority->>'ok' <> 'true' then return v_authority; end if;
  v_target := v_authority->'target';
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer_correction_replacement_issue:v1:' ||
      (v_authority->>'handoff_id') || ':' || p_replacement_target_ref,
    0
  ));
  v_scope := 'customer_correction_replacement_issue:v1:case:' ||
    (v_authority->>'case_id') || ':handoff:' ||
    (v_authority->>'handoff_id') || ':target:' || p_replacement_target_ref;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'customer',
    v_authority->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;
  select 'CRU-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
    extensions.digest(
      'customer-correction-replacement-upload-v1|' || v_upload_id::text ||
      '|' || (v_authority->>'handoff_id') || '|' ||
      p_replacement_target_ref,
      'sha256'
    ), 'hex'
  ), 1, 32)) into v_upload_ref;
  v_storage_path := 'customer-corrections/' ||
    (v_authority->>'case_id') || '/' ||
    (v_authority->>'handoff_id') || '/' ||
    pg_catalog.lower(pg_catalog.substr(p_replacement_target_ref, 5)) || '/' ||
    v_upload_id::text || '.pdf';

  insert into public.app_customer_correction_replacement_uploads (
    id, upload_reference, handoff_id, replacement_target_ref,
    case_id, customer_id, predecessor_evidence_file_id,
    predecessor_evidence_version_id, parser_profile, item_refs, fact_keys,
    storage_bucket, storage_path, original_filename, declared_mime_type,
    declared_size_bytes, issued_by_auth_user_id,
    issued_by_customer_identity_id, actor_ref, payload_sha256, request_id,
    idempotency_key, environment, issued_at, expires_at
  ) values (
    v_upload_id, v_upload_ref, (v_authority->>'handoff_id')::uuid,
    p_replacement_target_ref, (v_authority->>'case_id')::uuid,
    (v_authority->>'customer_id')::uuid,
    (v_target->>'predecessor_evidence_file_id')::uuid,
    (v_target->>'predecessor_evidence_version_id')::uuid,
    v_target->>'parser_profile', v_target->'item_refs', v_target->'fact_keys',
    'app-documents', v_storage_path, p_original_filename,
    p_declared_mime_type, p_declared_size_bytes, p_auth_user_id,
    (v_authority->>'customer_identity_id')::uuid,
    v_authority->>'actor_ref', p_payload_sha256, p_request_id,
    p_idempotency_key, p_environment, v_now, p_upload_expires_at
  );
  insert into public.app_audit_events (
    event_type, scope_type, scope_id, customer_id, request_id,
    idempotency_key, actor_type, actor_ref, event_data, created_at
  ) values (
    'customer_correction_replacement_upload_issued',
    'case', (v_authority->>'case_id')::uuid,
    (v_authority->>'customer_id')::uuid, p_request_id,
    p_idempotency_key, 'customer', v_authority->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'handoff_ref', v_authority->>'handoff_ref',
      'replacement_target_ref', p_replacement_target_ref,
      'upload_ref', v_upload_ref,
      'predecessor_evidence_file_id',
        v_target->>'predecessor_evidence_file_id',
      'predecessor_evidence_version_id',
        v_target->>'predecessor_evidence_version_id',
      'declared_mime_type', p_declared_mime_type,
      'declared_size_bytes', p_declared_size_bytes,
      'expires_at', p_upload_expires_at
    ), v_now
  );
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'upload_issued',
    'upload_ref', v_upload_ref,
    'replacement_target_ref', p_replacement_target_ref,
    'storage_bucket', 'app-documents',
    'storage_path', v_storage_path,
    'expires_at', p_upload_expires_at
  );
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
    );
end;
$$;

create function public.app_customer_correction_replacement_upload_resolve_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_upload_ref text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_upload public.app_customer_correction_replacement_uploads%rowtype;
  v_authority jsonb;
begin
  if p_upload_ref !~ '^CRU-[A-F0-9]{32}$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  select upload.* into v_upload
  from public.app_customer_correction_replacement_uploads upload
  join public.app_cases case_row on case_row.id = upload.case_id
  where upload.upload_reference = p_upload_ref
    and case_row.case_reference = p_case_ref;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'upload_not_found'
    );
  end if;
  v_authority := public.app_customer_correction_replacement_authority_v1(
    p_auth_user_id, p_case_ref, v_upload.replacement_target_ref
  );
  if v_authority->>'ok' <> 'true' then return v_authority; end if;
  if v_upload.handoff_id <> (v_authority->>'handoff_id')::uuid
     or v_upload.customer_id <> (v_authority->>'customer_id')::uuid
     or v_upload.expires_at <= pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'upload_not_current'
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'upload_id', v_upload.id,
    'upload_ref', v_upload.upload_reference,
    'replacement_target_ref', v_upload.replacement_target_ref,
    'storage_bucket', v_upload.storage_bucket,
    'storage_path', v_upload.storage_path,
    'declared_mime_type', v_upload.declared_mime_type,
    'declared_size_bytes', v_upload.declared_size_bytes,
    'parser_profile', v_upload.parser_profile,
    'item_refs', v_upload.item_refs,
    'fact_keys', v_upload.fact_keys
  );
end;
$$;

create function public.app_customer_correction_replacement_upload_confirm_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_upload_ref text,
  p_actual_size_bytes bigint,
  p_detected_mime_type text,
  p_server_sha256 text,
  p_failure_code text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_resolved jsonb;
  v_upload public.app_customer_correction_replacement_uploads%rowtype;
  v_existing public.app_customer_correction_replacement_candidates%rowtype;
  v_scope text;
  v_begin jsonb;
  v_candidate_id uuid := gen_random_uuid();
  v_candidate_ref text;
  v_response jsonb;
begin
  if p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_environment not in ('local', 'test', 'staging', 'production') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_resolved := public.app_customer_correction_replacement_upload_resolve_v1(
    p_auth_user_id, p_case_ref, p_upload_ref
  );
  if v_resolved->>'ok' <> 'true' then return v_resolved; end if;
  select upload.* into strict v_upload
  from public.app_customer_correction_replacement_uploads upload
  where upload.id = (v_resolved->>'upload_id')::uuid
  for update;
  v_scope := 'customer_correction_replacement_confirm:v1:upload:' ||
    v_upload.id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'customer', v_upload.actor_ref, p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  select candidate.* into v_existing
  from public.app_customer_correction_replacement_candidates candidate
  where candidate.upload_id = v_upload.id;
  if found then
    if p_failure_code is null
       and v_existing.size_bytes = p_actual_size_bytes
       and v_existing.detected_mime_type = p_detected_mime_type
       and v_existing.server_sha256 = p_server_sha256 then
      v_response := pg_catalog.jsonb_build_object(
        'ok', true, 'status', 200, 'code', 'already_confirmed',
        'candidate_id', v_existing.id,
        'candidate_ref', v_existing.candidate_reference,
        'replacement_target_ref', v_existing.replacement_target_ref,
        'parser_profile', v_existing.parser_profile,
        'item_refs', v_existing.item_refs,
        'fact_keys', v_existing.fact_keys
      );
    else
      v_response := pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'confirmed_bytes_changed'
      );
    end if;
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;
  if p_failure_code is not null then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'upload_object_unavailable'
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;
  if p_actual_size_bytes is distinct from v_upload.declared_size_bytes
     or p_actual_size_bytes not between 1 and 15728640 then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 413, 'code', 'stored_size_invalid'
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;
  if p_detected_mime_type <> 'application/pdf'
     or p_server_sha256 !~ '^[0-9a-f]{64}$' then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 415, 'code', 'stored_pdf_invalid'
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;
  select 'CRC-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
    extensions.digest(
      'customer-correction-replacement-candidate-v1|' ||
      v_candidate_id::text || '|' || v_upload.id::text || '|' ||
      p_server_sha256,
      'sha256'
    ), 'hex'
  ), 1, 32)) into v_candidate_ref;
  insert into public.app_customer_correction_replacement_candidates (
    id, candidate_reference, upload_id, handoff_id,
    replacement_target_ref, case_id, customer_id,
    predecessor_evidence_file_id, predecessor_evidence_version_id,
    parser_profile, item_refs, fact_keys, storage_bucket, storage_path,
    detected_mime_type, size_bytes, server_sha256,
    confirmed_by_auth_user_id, confirmed_by_customer_identity_id,
    actor_ref, payload_sha256, request_id, idempotency_key, environment,
    confirmed_at, recorded_at
  ) values (
    v_candidate_id, v_candidate_ref, v_upload.id, v_upload.handoff_id,
    v_upload.replacement_target_ref, v_upload.case_id, v_upload.customer_id,
    v_upload.predecessor_evidence_file_id,
    v_upload.predecessor_evidence_version_id,
    v_upload.parser_profile, v_upload.item_refs, v_upload.fact_keys,
    v_upload.storage_bucket, v_upload.storage_path, p_detected_mime_type,
    p_actual_size_bytes, p_server_sha256, p_auth_user_id,
    v_upload.issued_by_customer_identity_id, v_upload.actor_ref,
    p_payload_sha256, p_request_id, p_idempotency_key, p_environment,
    v_now, v_now
  );
  insert into public.app_audit_events (
    event_type, scope_type, scope_id, customer_id, request_id,
    idempotency_key, actor_type, actor_ref, event_data, created_at
  ) values (
    'customer_correction_replacement_candidate_confirmed',
    'case', v_upload.case_id, v_upload.customer_id, p_request_id,
    p_idempotency_key, 'customer', v_upload.actor_ref,
    pg_catalog.jsonb_build_object(
      'handoff_id', v_upload.handoff_id,
      'replacement_target_ref', v_upload.replacement_target_ref,
      'upload_ref', v_upload.upload_reference,
      'candidate_ref', v_candidate_ref,
      'predecessor_evidence_file_id', v_upload.predecessor_evidence_file_id,
      'predecessor_evidence_version_id',
        v_upload.predecessor_evidence_version_id,
      'detected_mime_type', p_detected_mime_type,
      'size_bytes', p_actual_size_bytes,
      'server_sha256', p_server_sha256
    ), v_now
  );
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'confirmed_staged',
    'candidate_id', v_candidate_id,
    'candidate_ref', v_candidate_ref,
    'replacement_target_ref', v_upload.replacement_target_ref,
    'parser_profile', v_upload.parser_profile,
    'item_refs', v_upload.item_refs,
    'fact_keys', v_upload.fact_keys
  );
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
  );
end;
$$;

create function public.app_customer_correction_replacement_resolution_v1(
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
  v_targets jsonb;
  v_resolved jsonb;
begin
  select case_row.* into v_case
  from public.app_cases case_row
  join public.app_customer_access_grants access_grant
    on access_grant.customer_id = case_row.customer_id
   and access_grant.auth_user_id = p_auth_user_id
   and (
     access_grant.granted_case_id is null
     or access_grant.granted_case_id = case_row.id
   )
  where case_row.case_reference = p_case_ref;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
    );
  end if;
  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_not_current'
    );
  end if;
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = public.app_evidence_review_current_correction_handoff_v1(
    v_case.id,
    v_manifest->>'manifest_version',
    v_manifest->>'manifest_hash'
  );
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_not_current'
    );
  end if;
  v_targets := public.app_customer_correction_replacement_targets_v1(
    v_handoff.id
  );
  select coalesce(pg_catalog.jsonb_agg(
    target.value || pg_catalog.jsonb_build_object(
      'candidate_ref', candidate.candidate_reference,
      'parser_observation', observation.envelope
    ) order by target.value->>'replacement_target_ref'
  ), '[]'::jsonb) into v_resolved
  from pg_catalog.jsonb_array_elements(v_targets) target(value)
  left join lateral (
    select candidate_row.*
    from public.app_customer_correction_replacement_candidates candidate_row
    where candidate_row.handoff_id = v_handoff.id
      and candidate_row.replacement_target_ref =
        target.value->>'replacement_target_ref'
    order by candidate_row.confirmed_at desc, candidate_row.id desc
    limit 1
  ) candidate on true
  left join lateral (
    select observation_row.envelope
    from public.app_parser_observation_envelopes observation_row
    where observation_row.correction_replacement_candidate_id = candidate.id
    order by observation_row.observed_at desc, observation_row.id desc
    limit 1
  ) observation on true;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'handoff_ref', v_handoff.handoff_reference,
    'targets', v_resolved,
    'all_required_candidates_confirmed', not exists (
      select 1 from pg_catalog.jsonb_array_elements(v_resolved) resolved(value)
      where resolved.value->>'candidate_ref' is null
    )
  );
end;
$$;

revoke all on table public.app_customer_correction_replacement_uploads
  from public, anon, authenticated, service_role;
revoke all on table public.app_customer_correction_replacement_candidates
  from public, anon, authenticated, service_role;
grant select on table public.app_customer_correction_replacement_candidates
  to service_role;

revoke all on function public.app_customer_correction_replacement_targets_v1(
  uuid
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_replacement_authority_v1(
  uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function
  public.app_customer_correction_replacement_upload_issue_v1(
    uuid, text, text, text, text, bigint, timestamptz,
    text, text, text, timestamptz, text
  ) from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_replacement_upload_issue_v1(
    uuid, text, text, text, text, bigint, timestamptz,
    text, text, text, timestamptz, text
  ) to service_role;
revoke all on function
  public.app_customer_correction_replacement_upload_resolve_v1(
    uuid, text, text
  ) from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_replacement_upload_resolve_v1(
    uuid, text, text
  ) to service_role;
revoke all on function
  public.app_customer_correction_replacement_upload_confirm_v1(
    uuid, text, text, bigint, text, text, text,
    text, text, text, timestamptz, text
  ) from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_replacement_upload_confirm_v1(
    uuid, text, text, bigint, text, text, text,
    text, text, text, timestamptz, text
  ) to service_role;
revoke all on function
  public.app_customer_correction_replacement_resolution_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_replacement_resolution_v1(uuid, text)
  to service_role;

comment on function public.app_customer_correction_replacement_targets_v1(
  uuid
) is
  'Private deterministic grouping of exact document-action handoff items by authoritative predecessor evidence file/version. The opaque target ref is not authority.';
comment on function
  public.app_customer_correction_replacement_resolution_v1(uuid, text) is
  'Server-only C3B2 readiness contract resolving the current handoff, required targets, latest immutable staged candidates and persisted parser observations without browser storage authority.';

commit;

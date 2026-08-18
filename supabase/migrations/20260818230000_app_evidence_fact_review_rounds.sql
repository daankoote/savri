begin;

-- REVIEW15 adds the immutable FACT-review round foundation. Existing
-- evidence-version decisions remain unchanged and continue to serve the
-- pre-cutover UI/worklist until a later explicit cutover.

create table public.app_evidence_review_rounds (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.app_cases(id) on delete restrict,
  manifest_version text not null,
  manifest_hash text not null,
  outcome text not null,
  reviewer_workforce_identity_id uuid not null
    references public.app_workforce_identities(id) on delete restrict,
  reviewer_scope_assignment_id uuid not null
    references public.app_workforce_scope_assignments(id) on delete restrict,
  capability_code text not null,
  authorization_policy_version_id uuid not null
    references public.app_workforce_policy_versions(id) on delete restrict,
  payload_sha256 text not null,
  request_id text not null unique,
  idempotency_key text not null,
  finalized_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),

  constraint app_evidence_review_rounds_manifest_version_chk check (
    manifest_version = 'fact-review-manifest-v1'
  ),
  constraint app_evidence_review_rounds_hashes_chk check (
    manifest_hash ~ '^[0-9a-f]{64}$'
    and payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_evidence_review_rounds_outcome_chk check (
    outcome in ('ALL_FACTS_ACCEPTED', 'CORRECTIONS_REQUIRED')
  ),
  constraint app_evidence_review_rounds_capability_chk check (
    capability_code = 'evidence.review.decide'
  ),
  constraint app_evidence_review_rounds_refs_chk check (
    request_id = pg_catalog.btrim(request_id)
    and pg_catalog.char_length(request_id) between 1 and 128
    and idempotency_key = pg_catalog.btrim(idempotency_key)
    and pg_catalog.char_length(idempotency_key) between 1 and 200
  ),
  constraint app_evidence_review_rounds_time_chk check (
    finalized_at <= recorded_at
  ),
  constraint app_evidence_review_rounds_case_manifest_key
    unique (case_id, manifest_version, manifest_hash)
);

comment on table public.app_evidence_review_rounds is
  'One immutable finalized internal workforce FACT-review round for one exact case and server-derived current manifest. No browser draft, case lifecycle mutation, verifier conclusion, document-authenticity conclusion or customer delivery state is stored here.';

create index app_evidence_review_rounds_case_time_idx
  on public.app_evidence_review_rounds(case_id, finalized_at desc, id desc);

create table public.app_evidence_review_round_subject_decisions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null
    references public.app_evidence_review_rounds(id) on delete restrict,
  subject_ref text not null,
  subject_kind text not null,
  evidence_file_id uuid not null
    references public.app_evidence_files(id) on delete restrict,
  evidence_version_id uuid not null
    references public.app_evidence_versions(id) on delete restrict,
  signing_snapshot_id uuid not null
    references public.app_signup_signing_snapshots(id) on delete restrict,
  evidence_kind text not null,
  fact_id text not null,
  fact_key text not null,
  fact_category text not null,
  fact_label text not null,
  scope_ref text not null,
  value_sha256 text not null,
  value_status text not null,
  required boolean not null,
  truth_class text not null,
  disposition text not null,
  correction_reason text,
  correction_instruction text,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),

  constraint app_evidence_review_round_subjects_round_subject_key
    unique (round_id, subject_ref),
  constraint app_evidence_review_round_subjects_ref_chk check (
    subject_ref ~ '^FRS-[0-9a-f]{64}$'
    and scope_ref ~ '^FRSCOPE-[0-9a-f]{64}$'
  ),
  constraint app_evidence_review_round_subjects_kind_chk check (
    subject_kind in ('FACT', 'DOCUMENT')
  ),
  constraint app_evidence_review_round_subjects_current_kind_chk check (
    subject_kind = 'FACT'
  ),
  constraint app_evidence_review_round_subjects_hash_chk check (
    value_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_evidence_review_round_subjects_value_status_chk check (
    value_status in ('PRESENT', 'REQUIRED_MISSING')
  ),
  constraint app_evidence_review_round_subjects_truth_chk check (
    truth_class in ('CUSTOMER_CONFIRMED', 'REVIEW_REQUIRED')
  ),
  constraint app_evidence_review_round_subjects_disposition_chk check (
    disposition in ('ACCEPTED', 'CORRECTION_REQUIRED')
  ),
  constraint app_evidence_review_round_subjects_correction_chk check (
    (
      disposition = 'ACCEPTED'
      and correction_reason is null
      and correction_instruction is null
    ) or (
      disposition = 'CORRECTION_REQUIRED'
      and correction_reason in (
        'MISSING_INFORMATION',
        'INCORRECT_INFORMATION',
        'INCONSISTENT_INFORMATION',
        'OTHER'
      )
      and correction_instruction is not null
      and correction_instruction = pg_catalog.btrim(correction_instruction)
      and pg_catalog.char_length(correction_instruction) between 1 and 1000
      and correction_instruction ~ '[[:alnum:]]'
    )
  ),
  constraint app_evidence_review_round_subjects_binding_chk check (
    pg_catalog.btrim(evidence_kind) <> ''
    and pg_catalog.btrim(fact_id) <> ''
    and pg_catalog.btrim(fact_key) <> ''
    and pg_catalog.btrim(fact_category) <> ''
    and pg_catalog.btrim(fact_label) <> ''
  )
);

comment on table public.app_evidence_review_round_subject_decisions is
  'Immutable per-subject decisions belonging to one finalized FACT-review round. Current rows are FACT only; the closed subject-kind column reserves DOCUMENT without implementing document-integrity, authenticity or fraud review.';

create index app_evidence_review_round_subjects_evidence_idx
  on public.app_evidence_review_round_subject_decisions(
    evidence_version_id, recorded_at desc, id desc
  );

create function public.app_evidence_fact_review_immutable_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'evidence fact review history is immutable';
end;
$$;

create trigger trg_app_evidence_review_rounds_immutable
before update or delete on public.app_evidence_review_rounds
for each row execute function public.app_evidence_fact_review_immutable_guard_v1();

create trigger trg_app_evidence_review_round_subjects_immutable
before update or delete on public.app_evidence_review_round_subject_decisions
for each row execute function public.app_evidence_fact_review_immutable_guard_v1();

create function public.app_evidence_fact_review_manifest_v1(
  p_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle text;
  v_subjects jsonb;
  v_manifest_hash text;
begin
  if p_case_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  select lifecycle.lifecycle_state into v_lifecycle
  from public.app_case_lifecycle_events lifecycle
  where lifecycle.case_id = p_case_id
  order by lifecycle.event_at desc, lifecycle.id desc
  limit 1;

  if v_lifecycle is distinct from 'submitted_for_review' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'case_not_reviewable'
    );
  end if;

  with latest_evidence as (
    select distinct on (evidence_file.id)
      evidence_file.id as evidence_file_id,
      evidence_file.document_type as evidence_kind,
      evidence_file.promotion_id,
      evidence_version.id as evidence_version_id,
      evidence_version.version_number,
      evidence_version.sha256 as evidence_sha256,
      promotion.signing_snapshot_id,
      promotion.request_id as promotion_request_id,
      snapshot.canonical_snapshot,
      context.location_id,
      context.charger_id,
      context.association_basis,
      location.created_from_request_id as location_request_id,
      charger.source_ref_sha256 as charger_source_ref_sha256
    from public.app_evidence_files evidence_file
    join public.app_evidence_versions evidence_version
      on evidence_version.evidence_file_id = evidence_file.id
     and evidence_version.status = 'confirmed_awaiting_review'
    join public.app_signup_promotions promotion
      on promotion.id = evidence_file.promotion_id
     and promotion.case_id = p_case_id
    join public.app_signup_signing_snapshots snapshot
      on snapshot.id = promotion.signing_snapshot_id
    join public.app_evidence_declaration_contexts context
      on context.evidence_file_id = evidence_file.id
     and context.promotion_id = promotion.id
    left join public.app_locations location on location.id = context.location_id
    left join public.app_chargers charger on charger.id = context.charger_id
    where evidence_file.case_id = p_case_id
      and evidence_file.document_type in (
        'energy_bill_or_contract', 'installation_invoice'
      )
      and context.association_basis in (
        'single_declared_location', 'single_declared_charger'
      )
    order by evidence_file.id, evidence_version.version_number desc,
      evidence_version.created_at desc, evidence_version.id desc
  ), expected_slots as (
    select
      latest.*,
      slot.slot_order,
      slot.slot_key,
      slot.fact_key,
      slot.fact_category,
      slot.fact_label,
      slot.required,
      slot.scope_kind
    from latest_evidence latest
    cross join lateral (
      values
        (1, 'energy.party_name', 'partyName', 'PARTY_NAME',
          'Naam contracthouder', true, 'ENERGY_PARTY'),
        (2, 'energy.address', 'structuredAddress', 'ADDRESS',
          'Adres', true, 'LOCATION'),
        (3, 'energy.ean', 'electricityEan', 'EAN',
          'EAN', true, 'LOCATION'),
        (4, 'energy.supplier', 'energySupplier', 'ENERGY_SUPPLIER',
          'Energieleverancier', false, 'LOCATION'),
        (5, 'installation.party_name', 'partyName', 'PARTY_NAME',
          'Naam op installatiefactuur', false, 'INSTALLATION_PARTY'),
        (6, 'installation.address', 'structuredAddress', 'ADDRESS',
          'Adres', true, 'LOCATION'),
        (7, 'installation.brand', 'chargerBrand', 'CHARGER_BRAND',
          'Merk', true, 'CHARGER'),
        (8, 'installation.model', 'chargerModel', 'CHARGER_MODEL',
          'Model', true, 'CHARGER'),
        (9, 'installation.mid', 'midNumber', 'MID',
          'MID-nummer', true, 'CHARGER'),
        (10, 'installation.serial', 'serialNumber', 'SERIAL',
          'Serienummer', true, 'CHARGER')
    ) slot(
      slot_order, slot_key, fact_key, fact_category,
      fact_label, required, scope_kind
    )
    where
      (latest.evidence_kind = 'energy_bill_or_contract'
        and slot.slot_key like 'energy.%')
      or
      (latest.evidence_kind = 'installation_invoice'
        and slot.slot_key like 'installation.%')
  ), resolved_slots as (
    select
      expected.*,
      'FRSCOPE-' || pg_catalog.encode(extensions.digest(
        pg_catalog.concat_ws('|',
          'fact-review-scope-v1', p_case_id::text,
          expected.evidence_file_id::text, expected.slot_key,
          coalesce(expected.location_id::text, ''),
          coalesce(expected.charger_id::text, '')
        ), 'sha256'
      ), 'hex') as scope_ref,
      candidate.fact
    from expected_slots expected
    left join lateral (
      select fact.value as fact
      from pg_catalog.jsonb_array_elements(
        coalesce(
          expected.canonical_snapshot #> '{canonical_facts,facts}',
          '[]'::jsonb
        )
      ) fact(value)
      where pg_catalog.jsonb_typeof(fact.value) = 'object'
        and fact.value ->> 'fact_key' = expected.fact_key
        and fact.value ->> 'resolution_state' in (
          'confirmed', 'review_required'
        )
        and (
          expected.scope_kind = 'ENERGY_PARTY'
            and (
              fact.value ->> 'charger_id' is null
              and (
                fact.value ->> 'location_id' is null
                or expected.location_request_id =
                  expected.promotion_request_id || ':location:' ||
                    (fact.value ->> 'location_id')
              )
            )
          or expected.scope_kind = 'INSTALLATION_PARTY'
            and (
              fact.value ->> 'charger_id' is null
              or expected.charger_source_ref_sha256 = pg_catalog.encode(
                extensions.digest(fact.value ->> 'charger_id', 'sha256'), 'hex'
              )
            )
          or expected.scope_kind = 'LOCATION'
            and expected.location_request_id =
              expected.promotion_request_id || ':location:' ||
                (fact.value ->> 'location_id')
          or expected.scope_kind = 'CHARGER'
            and expected.charger_source_ref_sha256 = pg_catalog.encode(
              extensions.digest(fact.value ->> 'charger_id', 'sha256'), 'hex'
            )
        )
      order by
        case
          when expected.scope_kind = 'INSTALLATION_PARTY'
            and fact.value ->> 'charger_id' is not null then 0
          when expected.scope_kind = 'ENERGY_PARTY'
            and fact.value ->> 'location_id' is not null then 0
          else 1
        end,
        fact.value ->> 'fact_id'
      limit 1
    ) candidate on true
  ), subject_bindings as (
    select
      resolved.*,
      coalesce(
        nullif(resolved.fact ->> 'fact_id', ''),
        'required-slot:' || resolved.slot_key || ':' || resolved.scope_ref
      ) as bound_fact_id,
      pg_catalog.btrim(coalesce(resolved.fact ->> 'value', ''))
        as fact_value,
      case
        when pg_catalog.btrim(
          coalesce(resolved.fact ->> 'value', '')
        ) = '' then 'REQUIRED_MISSING'
        else 'PRESENT'
      end as value_status,
      case
        when pg_catalog.btrim(
          coalesce(resolved.fact ->> 'value', '')
        ) = '' then 'REVIEW_REQUIRED'
        when resolved.fact ->> 'resolution_state' = 'confirmed'
          then 'CUSTOMER_CONFIRMED'
        else 'REVIEW_REQUIRED'
      end as truth_class,
      case
        when pg_catalog.btrim(
          coalesce(resolved.fact ->> 'value', '')
        ) = '' then 'REQUIRED_INFORMATION_MISSING'
        when resolved.fact ->> 'resolution_state' = 'confirmed' then null
        when resolved.canonical_snapshot #>> '{canonical_facts,schema_version}' =
          'canonical-signing-facts-v1' then 'GENERIC_REVIEW_REQUIRED'
        else resolved.fact #>> '{resolution_provenance,review_reason}'
      end as review_reason,
      case
        when pg_catalog.btrim(
          coalesce(resolved.fact ->> 'value', '')
        ) = '' then 'SERVER_REQUIRED_SLOT'
        when resolved.fact ->> 'resolution_state' = 'confirmed' then null
        when resolved.canonical_snapshot #>> '{canonical_facts,schema_version}' =
          'canonical-signing-facts-v1' then null
        else 'CUSTOMER_SIGNED_RESOLUTION'
      end as review_reason_authority
    from resolved_slots resolved
    where resolved.fact is not null or resolved.required
  ), subject_rows as (
    select
      binding.*,
      pg_catalog.encode(extensions.digest(binding.fact_value, 'sha256'), 'hex')
        as value_sha256,
      'FRS-' || pg_catalog.encode(extensions.digest(
        pg_catalog.concat_ws('|',
          'fact-review-subject-v1', p_case_id::text,
          binding.evidence_version_id::text,
          binding.evidence_sha256,
          binding.signing_snapshot_id::text,
          binding.bound_fact_id,
          binding.fact_key,
          binding.scope_ref,
          pg_catalog.encode(
            extensions.digest(binding.fact_value, 'sha256'), 'hex'
          ),
          binding.required::text,
          binding.value_status
        ), 'sha256'
      ), 'hex') as subject_ref
    from subject_bindings binding
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'subject_ref', subject.subject_ref,
      'subject_kind', 'FACT',
      'evidence_file_id', subject.evidence_file_id,
      'evidence_version_id', subject.evidence_version_id,
      'evidence_kind', subject.evidence_kind,
      'signing_snapshot_id', subject.signing_snapshot_id,
      'fact_id', subject.bound_fact_id,
      'fact_key', subject.fact_key,
      'fact_category', subject.fact_category,
      'fact_label', subject.fact_label,
      'scope_ref', subject.scope_ref,
      'value', case when subject.value_status = 'PRESENT'
        then subject.fact_value else null end,
      'value_sha256', subject.value_sha256,
      'value_status', subject.value_status,
      'required', subject.required,
      'truth_class', subject.truth_class,
      'review_reason', subject.review_reason,
      'review_reason_authority', subject.review_reason_authority,
      'reviewer_suggestion', case
        when subject.truth_class = 'CUSTOMER_CONFIRMED' then 'ACCEPT'
        else 'NONE'
      end
    ) order by subject.evidence_kind, subject.evidence_file_id,
      subject.evidence_version_id, subject.slot_order, subject.subject_ref
  ), '[]'::jsonb) into v_subjects
  from subject_rows subject;

  if pg_catalog.jsonb_array_length(v_subjects) = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'review_manifest_unavailable'
    );
  end if;

  select pg_catalog.encode(extensions.digest(
    'fact-review-manifest-v1|' || v_lifecycle || '|' ||
    pg_catalog.jsonb_array_length(v_subjects)::text || '|' ||
    coalesce(pg_catalog.string_agg(
      subject.item ->> 'subject_ref', '|'
      order by subject.ordinality
    ), ''),
    'sha256'
  ), 'hex') into v_manifest_hash
  from pg_catalog.jsonb_array_elements(v_subjects)
    with ordinality as subject(item, ordinality);

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 200,
    'code', 'ok',
    'manifest_version', 'fact-review-manifest-v1',
    'manifest_hash', v_manifest_hash,
    'subjects', v_subjects
  );
end;
$$;

create function public.app_evidence_review_case_detail_read_v4(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response jsonb;
  v_case_id uuid;
  v_manifest jsonb;
  v_public_subjects jsonb;
begin
  v_response := public.app_evidence_review_case_detail_read_v3(
    p_auth_user_id, p_case_ref
  );
  if v_response ->> 'ok' <> 'true' then return v_response; end if;

  select case_row.id into v_case_id
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if v_case_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'internal_error'
    );
  end if;

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case_id);
  if v_manifest ->> 'ok' <> 'true' then return v_manifest; end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'subject_ref', subject.item ->> 'subject_ref',
      'subject_kind', subject.item ->> 'subject_kind',
      'evidence_version_ref', subject.item ->> 'evidence_version_id',
      'evidence_kind', subject.item ->> 'evidence_kind',
      'fact_key', subject.item ->> 'fact_key',
      'fact_category', subject.item ->> 'fact_category',
      'fact_label', subject.item ->> 'fact_label',
      'scope_ref', subject.item ->> 'scope_ref',
      'value', subject.item -> 'value',
      'value_status', subject.item ->> 'value_status',
      'required', (subject.item ->> 'required')::boolean,
      'truth_class', subject.item ->> 'truth_class',
      'review_reason', subject.item -> 'review_reason',
      'review_reason_authority', subject.item -> 'review_reason_authority',
      'reviewer_suggestion', subject.item ->> 'reviewer_suggestion'
    ) order by subject.ordinality
  ), '[]'::jsonb) into v_public_subjects
  from pg_catalog.jsonb_array_elements(v_manifest -> 'subjects')
    with ordinality as subject(item, ordinality);

  return v_response || pg_catalog.jsonb_build_object(
    'review_manifest_version', v_manifest ->> 'manifest_version',
    'review_manifest_hash', v_manifest ->> 'manifest_hash',
    'review_subjects', v_public_subjects
  );
end;
$$;

create function public.app_evidence_review_round_finalize_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_manifest_version text,
  p_manifest_hash text,
  p_decisions jsonb,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_case_id uuid;
  v_auth jsonb;
  v_manifest jsonb;
  v_subjects jsonb;
  v_scope text;
  v_begin jsonb;
  v_existing public.app_evidence_review_rounds%rowtype;
  v_round_id uuid;
  v_outcome text;
  v_response jsonb;
  v_decision_count integer;
  v_distinct_decision_count integer;
begin
  if p_auth_user_id is null
     or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or p_manifest_version <> 'fact-review-manifest-v1'
     or p_manifest_hash !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(p_decisions) <> 'array'
     or pg_catalog.jsonb_array_length(p_decisions) not between 1 and 100
     or p_request_id is null
     or p_request_id <> pg_catalog.btrim(p_request_id)
     or pg_catalog.char_length(p_request_id) not between 1 and 128
     or p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_expires_at is null
     or p_idempotency_expires_at <= v_now then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_decisions) decision(item)
    where pg_catalog.jsonb_typeof(decision.item) <> 'object'
      or decision.item ->> 'subjectRef' is null
      or decision.item ->> 'subjectRef' !~ '^FRS-[0-9a-f]{64}$'
      or decision.item ->> 'disposition' is null
      or decision.item ->> 'disposition' not in (
        'ACCEPTED', 'CORRECTION_REQUIRED'
      )
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(decision.item) key
        where key not in (
          'subjectRef', 'disposition',
          'correctionReason', 'correctionInstruction'
        )
      )
      or (
        decision.item ->> 'disposition' = 'ACCEPTED'
        and (
          decision.item ? 'correctionReason'
          or decision.item ? 'correctionInstruction'
        )
      )
      or (
        decision.item ->> 'disposition' = 'CORRECTION_REQUIRED'
        and (
          decision.item ->> 'correctionReason' not in (
            'MISSING_INFORMATION',
            'INCORRECT_INFORMATION',
            'INCONSISTENT_INFORMATION',
            'OTHER'
          )
          or decision.item ->> 'correctionInstruction' is null
          or decision.item ->> 'correctionInstruction' <>
            pg_catalog.btrim(decision.item ->> 'correctionInstruction')
          or pg_catalog.char_length(
            decision.item ->> 'correctionInstruction'
          ) not between 1 and 1000
          or decision.item ->> 'correctionInstruction' !~ '[[:alnum:]]'
        )
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_decisions'
    );
  end if;

  select pg_catalog.count(*), pg_catalog.count(distinct item ->> 'subjectRef')
    into v_decision_count, v_distinct_decision_count
  from pg_catalog.jsonb_array_elements(p_decisions) decision(item);
  if v_decision_count <> v_distinct_decision_count then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'duplicate_subject'
    );
  end if;

  select case_row.id into v_case_id
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if v_case_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'case_missing'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'evidence_fact_review_round:v1:' || v_case_id::text, 0
  ));

  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'evidence.review.decide', v_case_id, null, v_now
  );
  if v_auth ->> 'ok' <> 'true' then return v_auth; end if;

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case_id);
  if v_manifest ->> 'ok' <> 'true' then return v_manifest; end if;
  if v_manifest ->> 'manifest_version' <> p_manifest_version
     or v_manifest ->> 'manifest_hash' <> p_manifest_hash then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'stale_review_manifest'
    );
  end if;
  v_subjects := v_manifest -> 'subjects';

  if pg_catalog.jsonb_array_length(v_subjects) <> v_decision_count
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_subjects) subject(item)
       where not exists (
         select 1
         from pg_catalog.jsonb_array_elements(p_decisions) decision(item)
         where decision.item ->> 'subjectRef' =
           subject.item ->> 'subject_ref'
       )
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(p_decisions) decision(item)
       where not exists (
         select 1
         from pg_catalog.jsonb_array_elements(v_subjects) subject(item)
         where subject.item ->> 'subject_ref' =
           decision.item ->> 'subjectRef'
       )
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'manifest_subjects_mismatch'
    );
  end if;

  v_scope := 'evidence_fact_review_finalize:v1:case:' || v_case_id::text ||
    ':manifest:' || p_manifest_hash;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'worker', v_auth ->> 'actor_ref', p_request_id
  );
  if v_begin ->> 'state' = 'return' then return v_begin -> 'response'; end if;

  select * into v_existing
  from public.app_evidence_review_rounds round_row
  where round_row.case_id = v_case_id
    and round_row.manifest_version = p_manifest_version
    and round_row.manifest_hash = p_manifest_hash;
  if found then
    v_response := case
      when v_existing.payload_sha256 = p_payload_sha256 then
        pg_catalog.jsonb_build_object(
          'ok', true, 'status', 200, 'code', 'already_finalized',
          'round_id', v_existing.id,
          'manifest_version', v_existing.manifest_version,
          'manifest_hash', v_existing.manifest_hash,
          'outcome', v_existing.outcome,
          'finalized_at', v_existing.finalized_at
        )
      else pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'review_round_conflict'
      )
    end;
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;

  select case when pg_catalog.bool_and(
    decision.item ->> 'disposition' = 'ACCEPTED'
  ) then 'ALL_FACTS_ACCEPTED' else 'CORRECTIONS_REQUIRED' end
  into v_outcome
  from pg_catalog.jsonb_array_elements(p_decisions) decision(item);

  insert into public.app_evidence_review_rounds (
    case_id, manifest_version, manifest_hash, outcome,
    reviewer_workforce_identity_id, reviewer_scope_assignment_id,
    capability_code, authorization_policy_version_id, payload_sha256,
    request_id, idempotency_key, finalized_at
  ) values (
    v_case_id, p_manifest_version, p_manifest_hash, v_outcome,
    (v_auth ->> 'workforce_identity_id')::uuid,
    (v_auth ->> 'scope_assignment_id')::uuid,
    'evidence.review.decide', (v_auth ->> 'policy_version_id')::uuid,
    p_payload_sha256, p_request_id, p_idempotency_key, v_now
  ) returning id into v_round_id;

  insert into public.app_evidence_review_round_subject_decisions (
    round_id, subject_ref, subject_kind,
    evidence_file_id, evidence_version_id, signing_snapshot_id,
    evidence_kind, fact_id, fact_key, fact_category, fact_label,
    scope_ref, value_sha256, value_status, required, truth_class,
    disposition, correction_reason, correction_instruction, recorded_at
  )
  select
    v_round_id,
    subject.item ->> 'subject_ref',
    'FACT',
    (subject.item ->> 'evidence_file_id')::uuid,
    (subject.item ->> 'evidence_version_id')::uuid,
    (subject.item ->> 'signing_snapshot_id')::uuid,
    subject.item ->> 'evidence_kind',
    subject.item ->> 'fact_id',
    subject.item ->> 'fact_key',
    subject.item ->> 'fact_category',
    subject.item ->> 'fact_label',
    subject.item ->> 'scope_ref',
    subject.item ->> 'value_sha256',
    subject.item ->> 'value_status',
    (subject.item ->> 'required')::boolean,
    subject.item ->> 'truth_class',
    decision.item ->> 'disposition',
    decision.item ->> 'correctionReason',
    decision.item ->> 'correctionInstruction',
    v_now
  from pg_catalog.jsonb_array_elements(v_subjects) subject(item)
  join pg_catalog.jsonb_array_elements(p_decisions) decision(item)
    on decision.item ->> 'subjectRef' = subject.item ->> 'subject_ref';

  if not found then
    raise exception 'evidence fact review subject insertion failed';
  end if;

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, idempotency_key,
    actor_type, actor_ref, event_data,
    authorization_policy_version_id, created_at
  ) values (
    'evidence_fact_review_round_finalized', 'case', v_case_id,
    p_request_id, p_idempotency_key, 'worker', v_auth ->> 'actor_ref',
    pg_catalog.jsonb_build_object(
      'round_ref', v_round_id,
      'manifest_version', p_manifest_version,
      'manifest_hash', p_manifest_hash,
      'outcome', v_outcome,
      'subject_count', v_decision_count
    ),
    (v_auth ->> 'policy_version_id')::uuid, v_now
  );

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'finalized',
    'round_id', v_round_id,
    'manifest_version', p_manifest_version,
    'manifest_hash', p_manifest_hash,
    'outcome', v_outcome,
    'finalized_at', v_now
  );
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
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

alter table public.app_evidence_review_rounds enable row level security;
alter table public.app_evidence_review_round_subject_decisions
  enable row level security;

create policy deny_all on public.app_evidence_review_rounds
  for all using (false) with check (false);
create policy deny_all on public.app_evidence_review_round_subject_decisions
  for all using (false) with check (false);

revoke all on table public.app_evidence_review_rounds
  from public, anon, authenticated, service_role;
revoke all on table public.app_evidence_review_round_subject_decisions
  from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_fact_review_immutable_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_fact_review_manifest_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_case_detail_read_v3(uuid, text)
  from service_role;
revoke all on function public.app_evidence_review_case_detail_read_v4(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.app_evidence_review_case_detail_read_v4(uuid, text)
  to service_role;
revoke all on function public.app_evidence_review_round_finalize_v1(
  uuid, text, text, text, jsonb, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.app_evidence_review_round_finalize_v1(
  uuid, text, text, text, jsonb, text, text, text, timestamptz
) to service_role;

comment on function public.app_evidence_fact_review_manifest_v1(uuid) is
  'Private deterministic server-derived FACT subject manifest for one exact reviewable case. Missing required slots remain subjects; browser input creates no subject identity or workforce truth.';
comment on function public.app_evidence_review_case_detail_read_v4(uuid, text) is
  'Service-role-only REVIEW15 exact-case detail projection. It reuses REVIEW07/13 authorization and adds one deterministic FACT manifest without an extra client call.';
comment on function public.app_evidence_review_round_finalize_v1(
  uuid, text, text, text, jsonb, text, text, text, timestamptz
) is
  'Service-role-only REVIEW15 atomic FACT-round finalizer. It locks the exact case, reuses the central evidence.review.decide evaluator, recomputes the current manifest, rejects stale/incomplete/unknown subjects and writes one immutable round with all subject decisions, audit and idempotency completion.';

commit;

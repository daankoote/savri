begin;

-- CUSTOMER04C3B2 extends the one existing correction-signing transaction with
-- immutable replacement-evidence promotion. Confirmed candidate objects stay
-- in private Storage; finalization records a new evidence-version reference to
-- those exact bytes and never reruns the parser.

alter table public.app_evidence_versions
  alter column source_intake_file_id drop not null,
  add column correction_replacement_candidate_id uuid
    references public.app_customer_correction_replacement_candidates(id)
    on delete restrict,
  add constraint app_evidence_versions_source_xor_chk check (
    pg_catalog.num_nonnulls(
      source_intake_file_id,
      correction_replacement_candidate_id
    ) = 1
  ),
  add constraint app_evidence_versions_candidate_key
    unique (correction_replacement_candidate_id);

create table public.app_evidence_review_customer_submission_replacements (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.app_evidence_review_customer_submissions(id)
    on delete restrict,
  replacement_target_ref text not null,
  document_type text not null,
  predecessor_evidence_file_id uuid not null
    references public.app_evidence_files(id) on delete restrict,
  predecessor_evidence_version_id uuid not null
    references public.app_evidence_versions(id) on delete restrict,
  replacement_candidate_id uuid not null unique
    references public.app_customer_correction_replacement_candidates(id)
    on delete restrict,
  parser_observation_id uuid not null
    references public.app_parser_observation_envelopes(id)
    on delete restrict,
  resulting_evidence_version_id uuid not null unique
    references public.app_evidence_versions(id) on delete restrict,
  content_sha256 text not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint app_customer_submission_replacement_target_key
    unique (submission_id, replacement_target_ref),
  constraint app_customer_submission_replacement_ref_chk check (
    replacement_target_ref ~ '^CRT-[A-F0-9]{32}$'
  ),
  constraint app_customer_submission_replacement_document_chk check (
    document_type in ('energy_bill_or_contract', 'installation_invoice')
  ),
  constraint app_customer_submission_replacement_sha_chk check (
    content_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create trigger trg_app_customer_submission_replacements_immutable
before update or delete
on public.app_evidence_review_customer_submission_replacements
for each row execute function public.app_customer_correction_immutable_guard_v1();

alter table public.app_evidence_review_customer_submission_replacements
  enable row level security;
create policy deny_all
  on public.app_evidence_review_customer_submission_replacements
  for all to anon, authenticated using (false) with check (false);
revoke all on table
  public.app_evidence_review_customer_submission_replacements
  from public, anon, authenticated, service_role;

alter table public.app_evidence_review_customer_submission_items
  alter column submitted_value drop not null,
  drop constraint app_evidence_review_customer_submission_items_action_chk,
  drop constraint app_evidence_review_customer_submission_items_value_chk,
  add constraint app_evidence_review_customer_submission_items_action_chk check (
    action_requirement in (
      'VALUE_CORRECTION',
      'MISSING_VALUE',
      'DOCUMENT_REPLACEMENT',
      'VALUE_PLUS_DOCUMENT_REPLACEMENT'
    )
  ),
  add constraint app_evidence_review_customer_submission_items_value_chk check (
    resulting_canonical_value = pg_catalog.btrim(resulting_canonical_value)
    and pg_catalog.char_length(resulting_canonical_value) between 1 and 2000
    and (
      action_requirement in ('VALUE_CORRECTION', 'MISSING_VALUE')
      and submitted_value is not null
      and submitted_value = pg_catalog.btrim(submitted_value)
      and resulting_canonical_value = submitted_value
      or action_requirement = 'DOCUMENT_REPLACEMENT'
      and submitted_value is null
      and prior_canonical_value is not null
      and resulting_canonical_value = prior_canonical_value
      or action_requirement = 'VALUE_PLUS_DOCUMENT_REPLACEMENT'
      and submitted_value is not null
      and submitted_value = pg_catalog.btrim(submitted_value)
      and resulting_canonical_value = submitted_value
    )
  );

alter table public.app_customer_correction_signer_challenge_bindings
  add column prepared_payload_sha256 text,
  add column replacement_set_sha256 text,
  add column snapshot_draft_sha256 text,
  add constraint app_customer_correction_signer_challenge_payload_hash_chk
    check (
      pg_catalog.num_nonnulls(
        prepared_payload_sha256,
        replacement_set_sha256,
        snapshot_draft_sha256
      ) in (0, 3)
      and (prepared_payload_sha256 is null or
        prepared_payload_sha256 ~ '^[0-9a-f]{64}$')
      and (replacement_set_sha256 is null or
        replacement_set_sha256 ~ '^[0-9a-f]{64}$')
      and (snapshot_draft_sha256 is null or
        snapshot_draft_sha256 ~ '^[0-9a-f]{64}$')
    );

alter table public.app_customer_correction_signer_evidence_bindings
  add column prepared_payload_sha256 text,
  add column replacement_set_sha256 text,
  add column snapshot_draft_sha256 text,
  add constraint app_customer_correction_signer_evidence_payload_hash_chk
    check (
      pg_catalog.num_nonnulls(
        prepared_payload_sha256,
        replacement_set_sha256,
        snapshot_draft_sha256
      ) in (0, 3)
      and (prepared_payload_sha256 is null or
        prepared_payload_sha256 ~ '^[0-9a-f]{64}$')
      and (replacement_set_sha256 is null or
        replacement_set_sha256 ~ '^[0-9a-f]{64}$')
      and (snapshot_draft_sha256 is null or
        snapshot_draft_sha256 ~ '^[0-9a-f]{64}$')
    );

create or replace function public.app_customer_correction_prepare_v2(
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
  v_case public.app_cases%rowtype;
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_manifest jsonb;
  v_parent public.app_signup_signing_snapshots%rowtype;
  v_read jsonb;
  v_translated jsonb;
  v_prepare jsonb;
  v_resolution jsonb;
  v_items jsonb;
  v_replacements jsonb;
  v_snapshot jsonb;
  v_snapshot_bindings jsonb;
  v_facts jsonb;
  v_item record;
  v_fact_found boolean;
  v_has_document boolean;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or pg_catalog.jsonb_typeof(p_responses) <> 'array'
     or pg_catalog.jsonb_array_length(p_responses) not between 1 and 100
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(p_responses) response(item)
       where pg_catalog.jsonb_typeof(response.item) <> 'object'
          or response.item->>'itemRef' !~ '^CCI-[A-F0-9]{32}$'
     )
     or (select pg_catalog.count(distinct response.item->>'itemRef')
         from pg_catalog.jsonb_array_elements(p_responses) response(item)) <>
        pg_catalog.jsonb_array_length(p_responses) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'response_set_mismatch'
    );
  end if;

  v_read := public.app_customer_correction_handoff_read_v3(
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
       pg_catalog.jsonb_array_length(v_read#>'{handoff,items}')
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_read#>'{handoff,items}')
         server_item(item)
       left join pg_catalog.jsonb_array_elements(p_responses) response(item)
         on response.item->>'itemRef' = server_item.item->>'item_ref'
       where response.item is null
          or case server_item.item->>'response_requirement'
            when 'VALUE_CORRECTION' then not (
              (select pg_catalog.count(*)
               from pg_catalog.jsonb_object_keys(response.item)) = 2
              and response.item ? 'correctedValue'
              and pg_catalog.jsonb_typeof(response.item->'correctedValue') =
                'string'
            )
            when 'MISSING_VALUE' then not (
              (select pg_catalog.count(*)
               from pg_catalog.jsonb_object_keys(response.item)) = 2
              and response.item ? 'correctedValue'
              and pg_catalog.jsonb_typeof(response.item->'correctedValue') =
                'string'
            )
            when 'DOCUMENT_REPLACEMENT' then not (
              (select pg_catalog.count(*)
               from pg_catalog.jsonb_object_keys(response.item)) = 2
              and response.item ? 'replacementCandidateRef'
              and response.item->>'replacementCandidateRef' ~
                '^CRC-[A-F0-9]{32}$'
            )
            when 'VALUE_PLUS_DOCUMENT_REPLACEMENT' then not (
              (select pg_catalog.count(*)
               from pg_catalog.jsonb_object_keys(response.item)) = 3
              and response.item ? 'correctedValue'
              and pg_catalog.jsonb_typeof(response.item->'correctedValue') =
                'string'
              and response.item ? 'replacementCandidateRef'
              and response.item->>'replacementCandidateRef' ~
                '^CRC-[A-F0-9]{32}$'
            )
            else true
          end
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'response_set_mismatch'
    );
  end if;

  select exists (
    select 1 from pg_catalog.jsonb_array_elements(v_read#>'{handoff,items}')
      item(value)
    where item.value->>'response_requirement' in (
      'DOCUMENT_REPLACEMENT', 'VALUE_PLUS_DOCUMENT_REPLACEMENT'
    )
  ) into v_has_document;

  if not v_has_document then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'itemIndex', server_item.ordinality - 1,
      'correctedValue', response.item->>'correctedValue'
    ) order by server_item.ordinality), '[]'::jsonb)
      into v_translated
    from pg_catalog.jsonb_array_elements(v_read#>'{handoff,items}')
      with ordinality server_item(item, ordinality)
    join pg_catalog.jsonb_array_elements(p_responses) response(item)
      on response.item->>'itemRef' = server_item.item->>'item_ref';
    v_prepare := public.app_customer_correction_prepare_v1(
      p_auth_user_id,
      p_case_ref,
      v_translated
    );
    if v_prepare->>'ok' <> 'true' then return v_prepare; end if;
    return v_prepare || pg_catalog.jsonb_build_object(
      'responses', p_responses,
      'replacements', '[]'::jsonb
    );
  end if;

  select case_row.* into v_case
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
  ); end if;
  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'current_manifest_unavailable'
  ); end if;
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = public.app_evidence_review_current_correction_handoff_v1(
    v_case.id,
    v_manifest->>'manifest_version',
    v_manifest->>'manifest_hash'
  ) and handoff.target_customer_id = v_case.customer_id;
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'current_unanswered_handoff_missing'
  ); end if;
  if v_handoff.bundle_sha256 <> pg_catalog.encode(
    extensions.digest(v_handoff.correction_bundle::text, 'sha256'), 'hex'
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
  ); end if;

  v_resolution := public.app_customer_correction_replacement_resolution_v1(
    p_auth_user_id,
    p_case_ref
  );
  if v_resolution->>'ok' <> 'true' then return v_resolution; end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'item_index', bundle.ordinality - 1,
    'item_ref', public.app_customer_correction_item_ref_v1(
      v_handoff.id, v_case.id, v_case.customer_id,
      bundle.item->>'subject_ref'
    ),
    'handoff_subject_ref', bundle.item->>'subject_ref',
    'fact_id', subject.item->>'fact_id',
    'fact_key', subject.item->>'fact_key',
    'scope_ref', subject.item->>'scope_ref',
    'evidence_file_id', subject.item->>'evidence_file_id',
    'evidence_version_id', subject.item->>'evidence_version_id',
    'evidence_sha256', predecessor.sha256,
    'action_requirement', bundle.item->>'response_requirement',
    'prior_value', subject.item->'value',
    'prior_value_sha256', subject.item->>'value_sha256',
    'corrected_value', case when response.item ? 'correctedValue'
      then public.app_customer_correction_normalize_value_v1(
        subject.item->>'fact_key', response.item->>'correctedValue'
      ) else null end,
    'replacement_target_ref', target.value->>'replacement_target_ref',
    'replacement_candidate_id', candidate.id,
    'replacement_candidate_ref', candidate.candidate_reference,
    'replacement_content_sha256', candidate.server_sha256,
    'replacement_storage_bucket', candidate.storage_bucket,
    'replacement_storage_path', candidate.storage_path,
    'replacement_detected_mime_type', candidate.detected_mime_type,
    'replacement_size_bytes', candidate.size_bytes,
    'replacement_confirmed_at', candidate.confirmed_at,
    'replacement_parser_profile', candidate.parser_profile,
    'parser_observation_id', observation.id,
    'parser_execution_identity_sha256',
      observation.execution_identity_sha256,
    'parser_envelope_hash', observation.envelope_hash,
    'resulting_evidence_version_id', case when candidate.id is null
      then null else candidate.id end,
    'resulting_version_number', case when candidate.id is null
      then null else predecessor.version_number + 1 end
  ) order by bundle.ordinality), '[]'::jsonb) into v_items
  from pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
    with ordinality bundle(item, ordinality)
  join pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    on subject.item->>'subject_ref' = bundle.item->>'subject_ref'
  join public.app_evidence_versions predecessor
    on predecessor.id = (subject.item->>'evidence_version_id')::uuid
  join pg_catalog.jsonb_array_elements(p_responses) response(item)
    on response.item->>'itemRef' =
      public.app_customer_correction_item_ref_v1(
        v_handoff.id, v_case.id, v_case.customer_id,
        bundle.item->>'subject_ref'
      )
  left join lateral (
    select resolved.value
    from pg_catalog.jsonb_array_elements(v_resolution->'targets')
      resolved(value)
    where resolved.value->'item_refs' ? (response.item->>'itemRef')
    limit 1
  ) target on bundle.item->>'response_requirement' in (
    'DOCUMENT_REPLACEMENT', 'VALUE_PLUS_DOCUMENT_REPLACEMENT'
  )
  left join public.app_customer_correction_replacement_candidates candidate
    on candidate.handoff_id = v_handoff.id
   and candidate.replacement_target_ref =
     target.value->>'replacement_target_ref'
   and candidate.candidate_reference =
     response.item->>'replacementCandidateRef'
   and candidate.candidate_reference = target.value->>'candidate_ref'
  left join lateral (
    select parser.*
    from public.app_parser_observation_envelopes parser
    where parser.correction_replacement_candidate_id = candidate.id
    order by parser.observed_at desc, parser.id desc
    limit 1
  ) observation on true;

  if pg_catalog.jsonb_array_length(v_items) <>
       pg_catalog.jsonb_array_length(p_responses) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_item_binding_invalid'
    );
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_items) item(value)
    where item.value->>'action_requirement' not in (
      'VALUE_CORRECTION', 'MISSING_VALUE', 'DOCUMENT_REPLACEMENT',
      'VALUE_PLUS_DOCUMENT_REPLACEMENT'
    )
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'unsupported_correction_action'
  ); end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_items) item(value)
    where item.value->>'action_requirement' in (
      'VALUE_CORRECTION', 'MISSING_VALUE',
      'VALUE_PLUS_DOCUMENT_REPLACEMENT'
    ) and item.value->>'corrected_value' is null
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'corrected_value_invalid'
  ); end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_items) item(value)
    where item.value->>'action_requirement' = 'DOCUMENT_REPLACEMENT'
      and item.value->>'prior_value' is null
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'locked_prior_value_missing'
  ); end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_items) item(value)
    where item.value->>'action_requirement' in (
      'DOCUMENT_REPLACEMENT', 'VALUE_PLUS_DOCUMENT_REPLACEMENT'
    ) and item.value->>'replacement_candidate_id' is null
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'replacement_candidate_unavailable'
  ); end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_items) item(value)
    where item.value->>'action_requirement' in (
      'DOCUMENT_REPLACEMENT', 'VALUE_PLUS_DOCUMENT_REPLACEMENT'
    ) and (
      item.value->>'parser_observation_id' is null
      or item.value->>'replacement_content_sha256' !~ '^[0-9a-f]{64}$'
      or item.value->>'replacement_detected_mime_type' <> 'application/pdf'
      or item.value->>'replacement_parser_profile' not in (
        'energy_document_v1', 'installation_invoice_v1'
      )
    )
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'replacement_lineage_invalid'
  ); end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_items) item(value)
    where item.value->>'replacement_candidate_id' is not null
      and not exists (
        select 1 from public.app_parser_observation_envelopes parser
        where parser.id = (item.value->>'parser_observation_id')::uuid
          and parser.correction_replacement_candidate_id =
            (item.value->>'replacement_candidate_id')::uuid
          and parser.byte_sha256 =
            item.value->>'replacement_content_sha256'
          and parser.parser_profile =
            item.value->>'replacement_parser_profile'
          and parser.envelope->'evidenceSource'->>'replacementCandidateId' =
            item.value->>'replacement_candidate_id'
          and parser.envelope->'evidenceSource'->>'replacementCandidateRef' =
            item.value->>'replacement_candidate_ref'
      )
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'parser_observation_not_bound'
  ); end if;

  select coalesce(pg_catalog.jsonb_agg(replacement.value
    order by replacement.value->>'replacement_target_ref'), '[]'::jsonb)
    into v_replacements
  from (
    select distinct on (item.value->>'replacement_target_ref')
      pg_catalog.jsonb_build_object(
        'replacement_target_ref', item.value->>'replacement_target_ref',
        'document_type', case item.value->>'replacement_parser_profile'
          when 'energy_document_v1' then 'energy_bill_or_contract'
          when 'installation_invoice_v1' then 'installation_invoice'
        end,
        'predecessor_evidence_file_id', item.value->>'evidence_file_id',
        'predecessor_evidence_version_id', item.value->>'evidence_version_id',
        'predecessor_evidence_sha256', item.value->>'evidence_sha256',
        'replacement_candidate_id', item.value->>'replacement_candidate_id',
        'replacement_candidate_ref', item.value->>'replacement_candidate_ref',
        'content_sha256', item.value->>'replacement_content_sha256',
        'storage_bucket', item.value->>'replacement_storage_bucket',
        'storage_path', item.value->>'replacement_storage_path',
        'detected_mime_type', item.value->>'replacement_detected_mime_type',
        'size_bytes', (item.value->>'replacement_size_bytes')::bigint,
        'confirmed_at', item.value->>'replacement_confirmed_at',
        'parser_profile', item.value->>'replacement_parser_profile',
        'parser_observation_id', item.value->>'parser_observation_id',
        'parser_execution_identity_sha256',
          item.value->>'parser_execution_identity_sha256',
        'parser_envelope_hash', item.value->>'parser_envelope_hash',
        'resulting_evidence_version_id',
          item.value->>'resulting_evidence_version_id',
        'resulting_version_number',
          (item.value->>'resulting_version_number')::integer
      ) value
    from pg_catalog.jsonb_array_elements(v_items) item(value)
    where item.value->>'replacement_candidate_id' is not null
    order by item.value->>'replacement_target_ref',
      (item.value->>'item_index')::integer
  ) replacement;

  if pg_catalog.jsonb_array_length(v_replacements) = 0
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(v_replacements) r(value)
       where exists (
         select 1 from public.app_evidence_versions promoted
         where promoted.correction_replacement_candidate_id =
           (r.value->>'replacement_candidate_id')::uuid
       )
     ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'replacement_candidate_unavailable'
  ); end if;

  select snapshot.* into v_parent
  from public.app_signup_signing_snapshots snapshot
  where snapshot.id = (
    select (subject.item->>'signing_snapshot_id')::uuid
    from pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    limit 1
  );
  if not found or exists (
    select 1 from pg_catalog.jsonb_array_elements(v_manifest->'subjects')
      subject(item)
    where subject.item->>'signing_snapshot_id' <> v_parent.id::text
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'parent_snapshot_ambiguous'
  ); end if;

  v_snapshot := v_parent.canonical_snapshot;
  v_facts := coalesce(v_snapshot#>'{canonical_facts,facts}', '[]'::jsonb);
  for v_item in
    select item.value from pg_catalog.jsonb_array_elements(v_items) item(value)
    where item.value->>'action_requirement' in (
      'VALUE_CORRECTION', 'MISSING_VALUE',
      'VALUE_PLUS_DOCUMENT_REPLACEMENT'
    )
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
        ) else fact.value end order by fact.ordinality
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
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'replacement_target_ref', r.value->>'replacement_target_ref',
    'document_type', r.value->>'document_type',
    'predecessor_evidence_version_id',
      r.value->>'predecessor_evidence_version_id',
    'replacement_candidate_ref', r.value->>'replacement_candidate_ref',
    'resulting_evidence_version_id',
      r.value->>'resulting_evidence_version_id',
    'content_sha256', r.value->>'content_sha256'
  ) order by r.value->>'replacement_target_ref'), '[]'::jsonb)
    into v_snapshot_bindings
  from pg_catalog.jsonb_array_elements(v_replacements) r(value);
  v_snapshot := pg_catalog.jsonb_set(
    v_snapshot,
    '{correction_evidence_bindings}',
    v_snapshot_bindings,
    true
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
    'replacements', v_replacements,
    'responses', p_responses
  );
end;
$$;

create or replace function public.app_customer_correction_finalize_v1(
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
  v_replacement record;
  v_subject jsonb;
  v_resulting_subject_ref text;
  v_result_value text;
  v_result_evidence_version_id uuid;
  v_result_evidence_sha256 text;
  v_carry_count integer := 0;
  v_item_count integer := 0;
  v_replacement_count integer := 0;
  v_failure_stage text := pg_catalog.current_setting(
    'enval.proof_failure_stage', true
  );
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
    'customer-correction-finalize-v1:' ||
      v_challenge.correction_handoff_id::text, 0
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
     or v_challenge.correction_payload_sha256 <> p_payload_sha256
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
  v_fresh := public.app_customer_correction_prepare_v2(
    p_auth_user_id, p_case_ref, v_prepare->'responses'
  );
  if v_fresh->>'ok' <> 'true' then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'stale_correction_context'
  ); end if;
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

  for v_replacement in
    select replacement.value
    from pg_catalog.jsonb_array_elements(v_prepare->'replacements')
      replacement(value)
    order by replacement.value->>'replacement_target_ref'
  loop
    insert into public.app_evidence_versions (
      id, evidence_file_id, version_number, source_intake_file_id,
      correction_replacement_candidate_id, storage_bucket, storage_path,
      detected_mime_type, size_bytes, sha256, status,
      source_confirmed_at, created_at, request_id, idempotency_key
    ) values (
      (v_replacement.value->>'resulting_evidence_version_id')::uuid,
      (v_replacement.value->>'predecessor_evidence_file_id')::uuid,
      (v_replacement.value->>'resulting_version_number')::integer,
      null,
      (v_replacement.value->>'replacement_candidate_id')::uuid,
      v_replacement.value->>'storage_bucket',
      v_replacement.value->>'storage_path',
      v_replacement.value->>'detected_mime_type',
      (v_replacement.value->>'size_bytes')::bigint,
      v_replacement.value->>'content_sha256',
      'confirmed_awaiting_review',
      (v_replacement.value->>'confirmed_at')::timestamptz,
      v_now,
      p_request_id || ':evidence:' ||
        (v_replacement.value->>'replacement_target_ref'),
      p_idempotency_key || ':evidence:' ||
        (v_replacement.value->>'replacement_target_ref')
    );
    v_replacement_count := v_replacement_count + 1;
    if v_replacement_count = 1 and
       v_failure_stage = 'CUSTOMER04C3B2_AFTER_FIRST_PROMOTION' then
      raise exception 'CUSTOMER04C3B2 injected after first promotion';
    end if;
  end loop;

  v_snapshot := v_prepare->'snapshot_draft';
  v_snapshot := pg_catalog.jsonb_set(
    v_snapshot, '{correction_submission_id}',
    pg_catalog.to_jsonb(v_submission_id), true
  );
  v_snapshot := pg_catalog.jsonb_set(
    v_snapshot, '{parent_snapshot_id}',
    pg_catalog.to_jsonb(v_prepare->>'parent_snapshot_id'), true
  );
  v_snapshot := pg_catalog.jsonb_set(
    v_snapshot, '{signer,typed_full_name}',
    pg_catalog.to_jsonb(p_typed_full_name), true
  );
  v_snapshot := pg_catalog.jsonb_set(
    v_snapshot, '{signature_method}',
    '{"method_id":"typed_name_otp_v1","method_version":"1"}'::jsonb,
    true
  );
  v_snapshot := pg_catalog.jsonb_set(
    v_snapshot, '{server_issue_date}', pg_catalog.to_jsonb(v_now), true
  );
  select pg_catalog.encode(
    extensions.digest(v_snapshot::text, 'sha256'), 'hex'
  ) into v_snapshot_sha;
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
    'replacement_evidence_bindings', v_prepare->'replacements',
    'prepared_payload_sha256', pg_catalog.encode(extensions.digest(
      v_prepare::text, 'sha256'), 'hex'),
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
  if v_failure_stage = 'CUSTOMER04C3B2_AFTER_SNAPSHOT' then
    raise exception 'CUSTOMER04C3B2 injected after snapshot';
  end if;
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
  if v_failure_stage = 'CUSTOMER04C3B2_AFTER_SUBMISSION_HEADER' then
    raise exception 'CUSTOMER04C3B2 injected after submission header';
  end if;

  insert into public.app_evidence_review_customer_submission_replacements (
    submission_id, replacement_target_ref, document_type,
    predecessor_evidence_file_id, predecessor_evidence_version_id,
    replacement_candidate_id, parser_observation_id,
    resulting_evidence_version_id, content_sha256, recorded_at
  ) select
    v_submission_id,
    replacement.value->>'replacement_target_ref',
    replacement.value->>'document_type',
    (replacement.value->>'predecessor_evidence_file_id')::uuid,
    (replacement.value->>'predecessor_evidence_version_id')::uuid,
    (replacement.value->>'replacement_candidate_id')::uuid,
    (replacement.value->>'parser_observation_id')::uuid,
    (replacement.value->>'resulting_evidence_version_id')::uuid,
    replacement.value->>'content_sha256',
    v_now
  from pg_catalog.jsonb_array_elements(v_prepare->'replacements')
    replacement(value);

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
    v_result_value := case
      when v_item.value->>'action_requirement' = 'DOCUMENT_REPLACEMENT'
        then v_item.value->>'prior_value'
      else v_item.value->>'corrected_value'
    end;
    v_result_evidence_version_id := coalesce(
      (v_item.value->>'resulting_evidence_version_id')::uuid,
      (v_item.value->>'evidence_version_id')::uuid
    );
    v_result_evidence_sha256 := coalesce(
      v_item.value->>'replacement_content_sha256',
      v_item.value->>'evidence_sha256'
    );
    select 'FRS-' || pg_catalog.encode(extensions.digest(
      pg_catalog.concat_ws('|', 'fact-review-subject-v1',
        v_prepare->>'case_id', v_result_evidence_version_id::text,
        v_result_evidence_sha256, v_snapshot_id::text,
        v_item.value->>'fact_id', v_item.value->>'fact_key',
        v_item.value->>'scope_ref',
        pg_catalog.encode(extensions.digest(v_result_value, 'sha256'), 'hex'),
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
      v_result_evidence_version_id, v_result_evidence_sha256,
      v_item.value->>'action_requirement', v_item.value->>'prior_value',
      v_item.value->>'prior_value_sha256',
      case when v_item.value->>'action_requirement' = 'DOCUMENT_REPLACEMENT'
        then null else v_item.value->>'corrected_value' end,
      v_result_value,
      pg_catalog.encode(extensions.digest(v_result_value, 'sha256'), 'hex')
    );
    v_item_count := v_item_count + 1;
  end loop;
  if v_failure_stage = 'CUSTOMER04C3B2_BEFORE_MANIFEST' then
    raise exception 'CUSTOMER04C3B2 injected before manifest';
  end if;
  v_new_manifest := public.app_evidence_fact_review_manifest_v1(
    (v_prepare->>'case_id')::uuid
  );
  if v_new_manifest->>'ok' <> 'true'
     or v_new_manifest->>'manifest_hash' = v_prepare->>'source_manifest_hash'
  then raise exception 'customer correction manifest did not advance';
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
      'replacement_evidence_count', v_replacement_count,
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
    'replacement_evidence_count', v_replacement_count,
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

create or replace function public.app_customer_correction_challenge_issue_v3(
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
  v_prepared_sha text;
  v_replacements_sha text;
  v_snapshot_draft_sha text;
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
    p_auth_user_id, p_case_ref
  );
  if v_signer->>'ok' <> 'true' then return v_signer; end if;
  if v_typed_name <> v_signer->>'expected_signer_name_normalized' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'signer_name_mismatch'
    );
  end if;
  v_result := public.app_customer_correction_challenge_issue_v2(
    p_auth_user_id, p_case_ref, p_responses,
    p_channel_reference_sha256, p_otp_verifier_sha256, p_expires_at,
    p_payload_sha256, p_legal_bundle_version, p_legal_bundle_sha256,
    p_request_id, p_idempotency_key, p_environment
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  select challenge.* into v_challenge
  from public.app_signup_signing_challenges challenge
  where challenge.id = (v_result->>'challenge_reference')::uuid
    and challenge.subject_type = 'CUSTOMER_CORRECTION';
  if not found then
    raise exception 'customer correction challenge unavailable after issue';
  end if;
  select
    pg_catalog.encode(extensions.digest(
      v_challenge.correction_payload::text, 'sha256'), 'hex'),
    pg_catalog.encode(extensions.digest(
      coalesce(v_challenge.correction_payload->'replacements', '[]'::jsonb)::text,
      'sha256'), 'hex'),
    pg_catalog.encode(extensions.digest(
      (v_challenge.correction_payload->'snapshot_draft')::text,
      'sha256'), 'hex')
  into v_prepared_sha, v_replacements_sha, v_snapshot_draft_sha;
  select binding.* into v_binding
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
       or v_binding.typed_signer_name_normalized <> v_typed_name
       or v_binding.prepared_payload_sha256 is distinct from v_prepared_sha
       or v_binding.replacement_set_sha256 is distinct from v_replacements_sha
       or v_binding.snapshot_draft_sha256 is distinct from v_snapshot_draft_sha
    then return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'signer_authority_changed'
    ); end if;
    return v_result;
  end if;
  insert into public.app_customer_correction_signer_challenge_bindings (
    challenge_id, correction_handoff_id, case_id, customer_id,
    account_type, authority_model, expected_signer_display_name,
    expected_signer_name_normalized, expected_signer_authority_ref,
    typed_signer_name_normalized, prepared_payload_sha256,
    replacement_set_sha256, snapshot_draft_sha256
  ) values (
    v_challenge.id, v_challenge.correction_handoff_id,
    (v_signer->>'case_id')::uuid, (v_signer->>'customer_id')::uuid,
    v_signer->>'account_type', v_signer->>'authority_model',
    v_signer->>'expected_signer_display_name',
    v_signer->>'expected_signer_name_normalized',
    v_signer->>'expected_signer_authority_ref', v_typed_name,
    v_prepared_sha, v_replacements_sha, v_snapshot_draft_sha
  );
  return v_result;
exception
  when unique_violation then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
  );
  when others then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

create or replace function public.app_customer_correction_finalize_v2(
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
  v_prepared_sha text;
  v_replacements_sha text;
  v_snapshot_draft_sha text;
begin
  v_typed_name := public.app_customer_correction_signer_name_normalize_v1(
    p_typed_full_name
  );
  if v_typed_name is null or pg_catalog.char_length(v_typed_name) > 200 then
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
  select binding.* into v_binding
  from public.app_customer_correction_signer_challenge_bindings binding
  where binding.challenge_id = v_challenge.id;
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'signer_authority_binding_missing'
  ); end if;
  select
    pg_catalog.encode(extensions.digest(
      v_challenge.correction_payload::text, 'sha256'), 'hex'),
    pg_catalog.encode(extensions.digest(
      coalesce(v_challenge.correction_payload->'replacements', '[]'::jsonb)::text,
      'sha256'), 'hex'),
    pg_catalog.encode(extensions.digest(
      (v_challenge.correction_payload->'snapshot_draft')::text,
      'sha256'), 'hex')
  into v_prepared_sha, v_replacements_sha, v_snapshot_draft_sha;
  if v_binding.prepared_payload_sha256 is distinct from v_prepared_sha
     or v_binding.replacement_set_sha256 is distinct from v_replacements_sha
     or v_binding.snapshot_draft_sha256 is distinct from v_snapshot_draft_sha
  then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'stale_correction_context'
  ); end if;
  v_signer := public.app_customer_correction_signer_context_v1(
    p_auth_user_id, p_case_ref
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
     or v_binding.typed_signer_name_normalized <> v_typed_name
  then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'signer_authority_changed'
  ); end if;
  v_result := public.app_customer_correction_finalize_v1(
    p_auth_user_id, p_case_ref, p_challenge_id, p_otp_verifier_sha256,
    v_typed_name, p_legal_bundle_version, p_legal_bundle_sha256,
    v_challenge.correction_payload_sha256, p_request_id,
    p_idempotency_key, p_environment
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  select submission.* into v_submission
  from public.app_evidence_review_customer_submissions submission
  where submission.handoff_id = v_binding.correction_handoff_id;
  if not found then
    raise exception 'customer correction submission missing after finalize';
  end if;
  select signature.* into v_signature
  from public.app_signup_signature_evidence signature
  where signature.id = v_submission.signature_evidence_id
    and signature.challenge_id = v_challenge.id
    and signature.subject_type = 'CUSTOMER_CORRECTION';
  if not found or public.app_customer_correction_signer_name_normalize_v1(
       v_signature.typed_full_name
     ) <> v_typed_name then
    raise exception 'customer correction signature authority mismatch';
  end if;
  select evidence_binding.* into v_evidence_binding
  from public.app_customer_correction_signer_evidence_bindings evidence_binding
  where evidence_binding.submission_id = v_submission.id;
  if found then
    if v_evidence_binding.signature_evidence_id <> v_signature.id
       or v_evidence_binding.challenge_id <> v_challenge.id
       or v_evidence_binding.expected_signer_authority_ref <>
         v_binding.expected_signer_authority_ref
       or v_evidence_binding.typed_signer_name_normalized <> v_typed_name
       or v_evidence_binding.prepared_payload_sha256 is distinct from
         v_prepared_sha
       or v_evidence_binding.replacement_set_sha256 is distinct from
         v_replacements_sha
       or v_evidence_binding.snapshot_draft_sha256 is distinct from
         v_snapshot_draft_sha
    then raise exception
      'customer correction signer evidence binding conflict';
    end if;
    return v_result;
  end if;
  insert into public.app_customer_correction_signer_evidence_bindings (
    submission_id, signature_evidence_id, challenge_id,
    correction_handoff_id, case_id, customer_id, account_type,
    authority_model, expected_signer_display_name,
    expected_signer_name_normalized, expected_signer_authority_ref,
    typed_signer_name_normalized, prepared_payload_sha256,
    replacement_set_sha256, snapshot_draft_sha256
  ) values (
    v_submission.id, v_signature.id, v_challenge.id,
    v_binding.correction_handoff_id, v_binding.case_id,
    v_binding.customer_id, v_binding.account_type, v_binding.authority_model,
    v_binding.expected_signer_display_name,
    v_binding.expected_signer_name_normalized,
    v_binding.expected_signer_authority_ref, v_typed_name,
    v_prepared_sha, v_replacements_sha, v_snapshot_draft_sha
  );
  return v_result;
exception
  when unique_violation then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
  );
  when others then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

revoke all on function public.app_customer_correction_prepare_v2(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_finalize_v1(
  uuid, text, uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_challenge_issue_v3(
  uuid, text, jsonb, text, text, text, timestamptz,
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_challenge_issue_v3(
  uuid, text, jsonb, text, text, text, timestamptz,
  text, text, text, text, text, text
) to service_role;
revoke all on function public.app_customer_correction_finalize_v2(
  uuid, text, uuid, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_finalize_v2(
  uuid, text, uuid, text, text, text, text, text, text, text
) to service_role;

comment on table public.app_evidence_review_customer_submission_replacements is
  'Immutable one-row-per-target correction replacement lineage from signed submission through confirmed candidate and parser observation to new evidence version.';
comment on column public.app_evidence_versions.correction_replacement_candidate_id is
  'Confirmed immutable private correction candidate whose exact bytes this signed evidence version references; mutually exclusive with signup intake source.';
comment on function public.app_customer_correction_prepare_v2(uuid, text, jsonb) is
  'Server-authoritative correction preparation for all four closed action requirements. Resolves confirmed candidate and immutable parser lineage without parser execution.';

commit;

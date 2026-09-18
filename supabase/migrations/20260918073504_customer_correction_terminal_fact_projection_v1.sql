begin;

create function public.app_customer_correction_safe_projection_v2(
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
  v_read jsonb;
  v_case_id uuid;
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_submission public.app_evidence_review_customer_submissions%rowtype;
  v_manifest jsonb;
  v_facts jsonb := '[]'::jsonb;
begin
  v_read := public.app_customer_correction_safe_projection_v1(
    p_auth_user_id, p_case_ref
  );
  if pg_catalog.jsonb_typeof(v_read) <> 'object'
     or v_read->'ok' is distinct from 'true'::jsonb then
    return v_read;
  end if;

  if v_read->>'code' = 'ok'
     and v_read->'status' = '200'::jsonb
     and pg_catalog.jsonb_typeof(v_read->'handoff') = 'object'
     and pg_catalog.jsonb_typeof(v_read #> '{handoff,fact_projections}') =
       'array' then
    return v_read || pg_catalog.jsonb_build_object(
      'fact_projections', v_read #> '{handoff,fact_projections}'
    );
  end if;

  if v_read->>'code' <> 'not_available'
     or v_read->'status' <> '200'::jsonb
     or v_read->>'case_ref' <> p_case_ref
     or pg_catalog.jsonb_typeof(v_read->'handoff') <> 'null' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  select case_row.id into v_case_id
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  select submission.* into v_submission
  from public.app_evidence_review_customer_submissions submission
  where submission.case_id = v_case_id
  order by submission.correction_generation desc,
    submission.finalized_at desc, submission.id desc
  limit 1;

  if not found then
    return v_read || pg_catalog.jsonb_build_object(
      'fact_projections', '[]'::jsonb
    );
  end if;

  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = v_submission.handoff_id
    and handoff.case_id = v_submission.case_id
    and handoff.customer_id = v_submission.customer_id;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  if v_handoff.correction_bundle->>'schema_version' <>
       'evidence-review-correction-handoff-bundle-v4' then
    return v_read || pg_catalog.jsonb_build_object(
      'fact_projections', '[]'::jsonb
    );
  end if;

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case_id);
  if v_manifest->>'ok' <> 'true'
     or v_manifest->>'manifest_version' <> 'fact-review-manifest-v1'
     or pg_catalog.jsonb_typeof(v_manifest->'subjects') <> 'array' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  with subjects as (
    select subject.item,
      public.app_customer_correction_primary_document_v1(
        subject.item->>'fact_key'
      ) primary_document
    from pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    where subject.item->>'fact_key' in (
      'partyName', 'structuredAddress', 'electricityEan', 'energySupplier',
      'chargerBrand', 'chargerModel', 'midNumber', 'serialNumber'
    )
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'fact_ref', 'CFR-' || pg_catalog.upper(pg_catalog.substr(
        pg_catalog.encode(extensions.digest(pg_catalog.concat_ws(
          '|', 'customer-correction-fact-v1', subject.item->>'subject_ref'
        ), 'sha256'), 'hex'), 1, 32
      )),
      'source_ref', 'CES-' || pg_catalog.upper(pg_catalog.substr(
        pg_catalog.encode(extensions.digest(pg_catalog.concat_ws(
          '|', 'customer-evidence-safe-source-v1',
          subject.item->>'evidence_version_id', subject.item->>'fact_key'
        ), 'sha256'), 'hex'), 1, 32
      )),
      'replacement_target_ref', 'CRT-' || pg_catalog.upper(pg_catalog.substr(
        pg_catalog.encode(extensions.digest(pg_catalog.concat_ws(
          '|', 'customer-correction-replacement-target-v1',
          v_handoff.id::text, subject.item->>'evidence_file_id',
          subject.item->>'evidence_version_id', subject.item->>'evidence_kind'
        ), 'sha256'), 'hex'), 1, 32
      )),
      'fact_key', subject.item->>'fact_key',
      'fact_label', subject.item->>'fact_label',
      'value', subject.item->'value',
      'enval_status', case
        when subject.item->>'value_status' = 'PRESENT'
          and public.app_customer_correction_normalize_value_v1(
            subject.item->>'fact_key', subject.item->>'value'
          ) is not null
          and subject.item->>'signing_snapshot_id' =
            v_submission.resulting_snapshot_id::text
          and evidence_valid.valid
          and source_valid.valid
          and accepted.accepted then 'Akkoord'
        else 'Nog te beoordelen'
      end,
      'sources', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'source_ref', 'CES-' || pg_catalog.upper(pg_catalog.substr(
          pg_catalog.encode(extensions.digest(pg_catalog.concat_ws(
            '|', 'customer-evidence-safe-source-v1',
            subject.item->>'evidence_version_id', subject.item->>'fact_key'
          ), 'sha256'), 'hex'), 1, 32
        )),
        'document_label', subject.primary_document->>'document_label',
        'value', subject.item->'value',
        'relationship', case
          when source_valid.valid then 'direct'
          else 'supporting'
        end
      ))
    ) order by case subject.item->>'fact_key'
      when 'partyName' then 1
      when 'structuredAddress' then 2
      when 'electricityEan' then 3
      when 'energySupplier' then 4
      when 'chargerBrand' then 5
      when 'chargerModel' then 6
      when 'midNumber' then 7
      when 'serialNumber' then 8
      else 99 end, subject.item->>'subject_ref'
  ), '[]'::jsonb) into v_facts
  from subjects subject
  left join lateral (
    select exists (
      select 1
      from public.app_evidence_versions evidence_version
      join public.app_evidence_files evidence_file
        on evidence_file.id = evidence_version.evidence_file_id
       and evidence_file.case_id = v_case_id
       and evidence_file.document_type =
         subject.primary_document->>'document_type'
      where evidence_version.id =
          (subject.item->>'evidence_version_id')::uuid
        and evidence_version.evidence_file_id =
          (subject.item->>'evidence_file_id')::uuid
        and evidence_version.status = 'confirmed_awaiting_review'
    ) valid
  ) evidence_valid on true
  left join lateral (
    select (
      select pg_catalog.count(*) = 1
        and pg_catalog.bool_and(pg_catalog.lower(
          public.app_customer_correction_normalize_value_v1(
            subject.item->>'fact_key', fact.value->>'observedValue'
          )
        ) = pg_catalog.lower(
          public.app_customer_correction_normalize_value_v1(
            subject.item->>'fact_key', subject.item->>'value'
          )
        ))
      from public.app_parser_observation_envelopes observation
      join public.app_evidence_versions evidence_version
        on evidence_version.id =
          (subject.item->>'evidence_version_id')::uuid
       and evidence_version.evidence_file_id =
          (subject.item->>'evidence_file_id')::uuid
       and evidence_version.sha256 = observation.byte_sha256
      cross join lateral pg_catalog.jsonb_array_elements(
        observation.envelope->'observedFacts'
      ) fact(value)
      where observation.evidence_version_id = evidence_version.id
        and observation.parser_profile =
          subject.primary_document->>'parser_profile'
        and fact.value->>'factKey' = subject.item->>'fact_key'
        and fact.value->>'status' = 'observed'
        and public.app_customer_correction_source_relationship_v2(
          subject.item->>'fact_key', observation.parser_profile,
          fact.value #>> '{sourceLocator,extractionMethod}'
        ) = 'direct'
    ) or exists (
      select 1
      from public.app_evidence_review_customer_submission_items item
      join public.app_evidence_versions evidence_version
        on evidence_version.id = item.evidence_version_id
       and evidence_version.evidence_file_id = item.evidence_file_id
       and evidence_version.sha256 = item.evidence_sha256
      where item.submission_id = v_submission.id
        and item.resulting_subject_ref = subject.item->>'subject_ref'
        and item.evidence_file_id =
          (subject.item->>'evidence_file_id')::uuid
        and item.evidence_version_id =
          (subject.item->>'evidence_version_id')::uuid
        and item.fact_id = subject.item->>'fact_id'
        and item.fact_key = subject.item->>'fact_key'
        and item.resulting_value_sha256 = subject.item->>'value_sha256'
        and item.resulting_canonical_value = subject.item->>'value'
    ) valid
  ) source_valid on true
  left join lateral (
    select exists (
      select 1
      from public.app_evidence_review_rounds round_row
      join public.app_evidence_review_round_subject_decisions decision
        on decision.round_id = round_row.id
      where round_row.case_id = v_case_id
        and round_row.manifest_version = v_manifest->>'manifest_version'
        and round_row.manifest_hash = v_manifest->>'manifest_hash'
        and round_row.outcome = 'ALL_FACTS_ACCEPTED'
        and decision.subject_ref = subject.item->>'subject_ref'
        and decision.disposition = 'ACCEPTED'
        and decision.evidence_file_id =
          (subject.item->>'evidence_file_id')::uuid
        and decision.evidence_version_id =
          (subject.item->>'evidence_version_id')::uuid
        and decision.value_sha256 = subject.item->>'value_sha256'
        and decision.value_status = 'PRESENT'
    ) accepted
  ) accepted on true
  where subject.primary_document is not null
    and subject.item->>'evidence_kind' =
      subject.primary_document->>'document_type';

  return v_read || pg_catalog.jsonb_build_object(
    'fact_projections', v_facts
  );
end;
$$;

create function public.app_customer_correction_handoff_read_v8(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select public.app_customer_correction_safe_projection_v2(
    p_auth_user_id, p_case_ref
  )
$$;

revoke all on function public.app_customer_correction_safe_projection_v2(
  uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_handoff_read_v8(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_handoff_read_v8(
  uuid, text
) to service_role;

comment on function public.app_customer_correction_safe_projection_v2(uuid, text)
is
  'Private R7-preserving customer-safe correction projector. It retains the terminal handoff=null contract and adds only current primary fact values plus server-owned review status; supporting subjects and internal provenance remain private.';

comment on function public.app_customer_correction_handoff_read_v8(uuid, text)
is
  'Service-role wrapper for the versioned customer-safe correction projection with terminal primary-fact status. Direct public, anon and authenticated execution remains denied.';

commit;

begin;

create or replace function public.app_customer_correction_safe_projection_v1(
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
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_manifest jsonb;
  v_resolution jsonb;
  v_candidates jsonb;
  v_facts jsonb;
begin
  v_read := public.app_customer_correction_handoff_read_v6(
    p_auth_user_id, p_case_ref
  );
  if pg_catalog.jsonb_typeof(v_read) <> 'object' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;
  if v_read->'ok' is distinct from 'true'::jsonb then
    if v_read->'ok' = 'false'::jsonb then
      return v_read;
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;
  if v_read->>'code' = 'not_available'
     and v_read->'status' = '200'::jsonb
     and v_read->>'case_ref' = p_case_ref
     and pg_catalog.jsonb_typeof(v_read->'handoff') = 'null'
     and v_read ?& array['ok', 'status', 'code', 'case_ref', 'handoff']
     and (v_read - 'ok' - 'status' - 'code' - 'case_ref' - 'handoff') =
       '{}'::jsonb then
    return v_read;
  end if;
  if v_read->>'code' <> 'ok'
     or v_read->'status' <> '200'::jsonb
     or v_read->>'case_ref' <> p_case_ref
     or pg_catalog.jsonb_typeof(v_read->'handoff') <> 'object'
     or not (v_read ?& array[
       'ok', 'status', 'code', 'case_ref', 'handoff'
     ])
     or (v_read - 'ok' - 'status' - 'code' - 'case_ref' - 'handoff') <>
       '{}'::jsonb then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.handoff_reference = v_read #>> '{handoff,handoff_ref}';
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;
  v_read := pg_catalog.jsonb_set(
    v_read, '{handoff,bundle_version}',
    pg_catalog.to_jsonb(v_handoff.correction_bundle->>'schema_version'), true
  );
  if v_handoff.correction_bundle->>'schema_version' <>
       'evidence-review-correction-handoff-bundle-v4' then
    -- Legacy handoffs remain readable through v6, but only v4 receives the
    -- document-first projection.
    return pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        v_read, '{handoff,current_replacement_candidates}', '[]'::jsonb, true
      ),
      '{handoff,fact_projections}', '[]'::jsonb, true
    );
  end if;
  v_manifest := public.app_evidence_fact_review_manifest_v1(v_handoff.case_id);
  if v_manifest->>'ok' <> 'true'
     or v_manifest->>'manifest_version' <> v_handoff.manifest_version
     or v_manifest->>'manifest_hash' <> v_handoff.manifest_hash then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'stale_correction_context'
    );
  end if;
  v_resolution := public.app_customer_correction_replacement_resolution_v2(
    p_auth_user_id, p_case_ref
  );
  if v_resolution->>'ok' <> 'true' then return v_resolution; end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'replacement_target_ref', target.value->>'replacement_target_ref',
      'candidate_ref', target.value->>'candidate_ref',
      'file_name', target.value->>'original_filename',
      'source_facts', (
        select coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'fact_key', fact_key.value,
            'document_label', target.value->>'document_label',
            'observed_value', case when matched.direct_count = 1
              then matched.observed_value else null end,
            'relationship', case when matched.direct_count = 1
              then 'direct' else null end,
            'source_ref', 'CRS-' || pg_catalog.upper(pg_catalog.substr(
              pg_catalog.encode(extensions.digest(pg_catalog.concat_ws(
                '|', 'customer-correction-safe-source-v1',
                target.value->>'candidate_ref', fact_key.value
              ), 'sha256'), 'hex'), 1, 32
            )),
            'transcription_allowed', matched.direct_count <> 1
          ) order by fact_key.ordinality
        ), '[]'::jsonb)
        from pg_catalog.jsonb_array_elements_text(target.value->'fact_keys')
          with ordinality fact_key(value, ordinality)
        left join lateral (
          select pg_catalog.count(*)::integer as direct_count,
            pg_catalog.min(observation.value->>'observedValue') as
              observed_value
          from pg_catalog.jsonb_array_elements(
            coalesce(target.value #> '{parser_observation,observedFacts}',
              '[]'::jsonb)
          ) observation(value)
          where observation.value->>'factKey' = fact_key.value
            and observation.value->>'status' = 'observed'
            and public.app_customer_correction_normalize_value_v1(
              fact_key.value, observation.value->>'observedValue'
            ) is not null
            and public.app_customer_correction_source_relationship_v2(
              fact_key.value,
              target.value #>> '{parser_observation,parserProfile}',
              observation.value #>> '{sourceLocator,extractionMethod}'
            ) = 'direct'
        ) matched on true
      )
    ) order by target.value->>'replacement_target_ref'
  ), '[]'::jsonb) into v_candidates
  from pg_catalog.jsonb_array_elements(v_resolution->'targets') target(value)
  where target.value->>'candidate_ref' is not null;

  with subjects as (
    select subject.item,
      public.app_customer_correction_primary_document_v1(
        subject.item->>'fact_key'
      ) primary_document,
      exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
          bundle(value)
        where bundle.value->>'subject_ref' = subject.item->>'subject_ref'
      ) correction_requested
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
          '|', 'customer-correction-fact-v1',
          subject.item->>'subject_ref'
        ), 'sha256'), 'hex'), 1, 32
      )),
      'source_ref', 'CES-' || pg_catalog.upper(pg_catalog.substr(
        pg_catalog.encode(extensions.digest(pg_catalog.concat_ws(
          '|', 'customer-evidence-safe-source-v1',
          subject.item->>'evidence_version_id',
          subject.item->>'fact_key'
        ), 'sha256'), 'hex'), 1, 32
      )),
      'replacement_target_ref',
        'CRT-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
          extensions.digest(pg_catalog.concat_ws(
            '|', 'customer-correction-replacement-target-v1',
            v_handoff.id::text,
            subject.item->>'evidence_file_id',
            subject.item->>'evidence_version_id',
            subject.item->>'evidence_kind'
          ), 'sha256'), 'hex'
        ), 1, 32)),
      'fact_key', subject.item->>'fact_key',
      'fact_label', subject.item->>'fact_label',
      'value', subject.item->'value',
      'enval_status', case
        when subject.correction_requested then 'Wacht op klant'
        when subject.item->>'value_status' <> 'PRESENT'
          or public.app_customer_correction_normalize_value_v1(
            subject.item->>'fact_key', subject.item->>'value'
          ) is null then 'Nog te beoordelen'
        when subject.item->>'evidence_kind' <>
          subject.primary_document->>'document_type' then 'Nog te beoordelen'
        when accepted.accepted and source_valid.valid then 'Akkoord'
        when correction.correction_required then 'Correctie nodig'
        else 'Nog te beoordelen'
      end,
      'sources', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'source_ref', 'CES-' || pg_catalog.upper(pg_catalog.substr(
          pg_catalog.encode(extensions.digest(pg_catalog.concat_ws(
            '|', 'customer-evidence-safe-source-v1',
            subject.item->>'evidence_version_id',
            subject.item->>'fact_key'
          ), 'sha256'), 'hex'), 1, 32
        )),
        'document_label', subject.primary_document->>'document_label',
        'value', subject.item->'value',
        'relationship', case when subject.item->>'evidence_kind' =
          subject.primary_document->>'document_type'
          then 'direct' else 'supporting' end
      ))
    ) order by subject.item->>'subject_ref'
  ), '[]'::jsonb) into v_facts
  from subjects subject
  left join lateral (
    select exists (
      select 1
      from public.app_evidence_review_round_subject_decisions decision
      where decision.round_id = v_handoff.round_id
        and decision.subject_ref = subject.item->>'subject_ref'
        and decision.disposition = 'ACCEPTED'
        and decision.evidence_version_id =
          (subject.item->>'evidence_version_id')::uuid
        and decision.value_sha256 = subject.item->>'value_sha256'
    ) or exists (
      select 1
      from public.app_evidence_review_decision_carry_forwards carry
      where carry.resulting_subject_ref = subject.item->>'subject_ref'
        and carry.current_evidence_version_id =
          (subject.item->>'evidence_version_id')::uuid
        and carry.current_value_sha256 = subject.item->>'value_sha256'
    ) accepted
  ) accepted on true
  left join lateral (
    select exists (
      select 1
      from public.app_parser_observation_envelopes observation
      join public.app_evidence_versions version_row
        on version_row.id = (subject.item->>'evidence_version_id')::uuid
       and version_row.sha256 = observation.byte_sha256
      cross join lateral pg_catalog.jsonb_array_elements(
        observation.envelope->'observedFacts'
      ) fact(value)
      where observation.evidence_version_id = version_row.id
        and observation.parser_profile =
          subject.primary_document->>'parser_profile'
        and fact.value->>'factKey' = subject.item->>'fact_key'
        and fact.value->>'status' = 'observed'
        and public.app_customer_correction_source_relationship_v2(
          subject.item->>'fact_key', observation.parser_profile,
          fact.value #>> '{sourceLocator,extractionMethod}'
        ) = 'direct'
      group by observation.id
      having pg_catalog.count(*) = 1
        and pg_catalog.bool_and(pg_catalog.lower(
          public.app_customer_correction_normalize_value_v1(
            subject.item->>'fact_key', fact.value->>'observedValue'
          )
        ) = pg_catalog.lower(
          public.app_customer_correction_normalize_value_v1(
            subject.item->>'fact_key', subject.item->>'value'
          )
        ))
    ) valid
  ) source_valid on true
  left join lateral (
    select exists (
      select 1
      from public.app_evidence_review_round_subject_decisions decision
      where decision.round_id = v_handoff.round_id
        and decision.subject_ref = subject.item->>'subject_ref'
        and decision.disposition = 'CORRECTION_REQUIRED'
    ) correction_required
  ) correction on true;

  return pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      v_read,
      '{handoff,current_replacement_candidates}', v_candidates, true
    ),
    '{handoff,fact_projections}', v_facts, true
  );
end;
$$;


revoke all on function public.app_customer_correction_safe_projection_v1(
  uuid, text
) from public, anon, authenticated, service_role;

comment on function public.app_customer_correction_safe_projection_v1(uuid, text)
is
  'Private R7-preserving document-first projector. It passes through only the exact authorized terminal not_available JSON-null shape, rejects malformed successful base reads, and preserves the existing active-handoff projection.';

commit;

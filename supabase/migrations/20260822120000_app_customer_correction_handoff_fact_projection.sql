-- CUSTOMER04C3C2B: customer-safe fact identity on the existing immutable handoff.

create or replace function public.app_customer_correction_handoff_read_v4(
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
  v_case public.app_cases%rowtype;
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_manifest jsonb;
  v_items jsonb;
  v_resolution jsonb;
  v_current_candidates jsonb;
begin
  v_read := public.app_customer_correction_handoff_read_v3(
    p_auth_user_id,
    p_case_ref
  );
  if v_read->>'ok' <> 'true' or v_read->'handoff' is null then
    return v_read;
  end if;

  select case_row.* into v_case
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.handoff_reference = v_read #>> '{handoff,handoff_ref}'
    and handoff.case_id = v_case.id
    and handoff.target_customer_id = v_case.customer_id;
  if not found or v_handoff.bundle_sha256 <> pg_catalog.encode(
    extensions.digest(v_handoff.correction_bundle::text, 'sha256'), 'hex'
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true'
     or v_manifest->>'manifest_version' <> v_handoff.manifest_version
     or v_manifest->>'manifest_hash' <> v_handoff.manifest_hash then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    read_item.item || pg_catalog.jsonb_build_object(
      'fact_key', subject.item->>'fact_key'
    ) order by read_item.ordinality
  ), '[]'::jsonb) into v_items
  from pg_catalog.jsonb_array_elements(v_read #> '{handoff,items}')
    with ordinality read_item(item, ordinality)
  join pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
    bundle(item)
    on public.app_customer_correction_item_ref_v1(
      v_handoff.id,
      v_case.id,
      v_case.customer_id,
      bundle.item->>'subject_ref'
    ) = read_item.item->>'item_ref'
  join pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    on subject.item->>'subject_ref' = bundle.item->>'subject_ref';

  if pg_catalog.jsonb_array_length(v_items) < 1
     or pg_catalog.jsonb_array_length(v_items) <>
       pg_catalog.jsonb_array_length(v_read #> '{handoff,items}')
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_items) item(value)
       where item.value->>'item_ref' !~ '^CCI-[A-F0-9]{32}$'
          or pg_catalog.btrim(coalesce(item.value->>'fact_key', '')) = ''
     )
     or (
       select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(v_items) item(value)
     ) <> (
       select pg_catalog.count(distinct item.value->>'item_ref')
       from pg_catalog.jsonb_array_elements(v_items) item(value)
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  v_resolution := public.app_customer_correction_replacement_resolution_v1(
    p_auth_user_id,
    p_case_ref
  );
  if v_resolution->>'ok' <> 'true'
     or v_resolution->>'handoff_ref' <>
       v_read #>> '{handoff,handoff_ref}'
     or pg_catalog.jsonb_array_length(v_resolution->'targets') <> (
       select pg_catalog.count(distinct
         item.value #>> '{replacement_target,replacement_target_ref}')
       from pg_catalog.jsonb_array_elements(v_items) item(value)
       where item.value ? 'replacement_target'
     )
     or (
       select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(v_resolution->'targets') target(value)
     ) <> (
       select pg_catalog.count(distinct target.value->>'replacement_target_ref')
       from pg_catalog.jsonb_array_elements(v_resolution->'targets') target(value)
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_resolution->'targets') target(value)
       where target.value->>'replacement_target_ref' !~ '^CRT-[A-F0-9]{32}$'
          or pg_catalog.jsonb_typeof(target.value->'item_refs') <> 'array'
          or pg_catalog.jsonb_typeof(target.value->'fact_keys') <> 'array'
          or (
            target.value->>'candidate_ref' is not null
            and target.value->>'candidate_ref' !~ '^CRC-[A-F0-9]{32}$'
          )
          or (
            target.value->'parser_observation' is not null
            and (
              target.value->>'candidate_ref' is null
              or target.value #>> '{parser_observation,envelopeVersion}' <>
                'parser_observation_envelope_v1'
              or pg_catalog.jsonb_typeof(
                target.value #> '{parser_observation,observedFacts}'
              ) <> 'array'
            )
          )
          or pg_catalog.jsonb_array_length(target.value->'item_refs') <> (
            select pg_catalog.count(*)
            from pg_catalog.jsonb_array_elements(v_items) item(value)
            where item.value #>>
              '{replacement_target,replacement_target_ref}' =
                target.value->>'replacement_target_ref'
              and pg_catalog.jsonb_exists(
                target.value->'item_refs',
                item.value->>'item_ref'
              )
          )
          or pg_catalog.jsonb_array_length(target.value->'fact_keys') <> (
            select pg_catalog.count(*)
            from pg_catalog.jsonb_array_elements(v_items) item(value)
            where item.value #>>
              '{replacement_target,replacement_target_ref}' =
                target.value->>'replacement_target_ref'
              and pg_catalog.jsonb_exists(
                target.value->'fact_keys',
                item.value->>'fact_key'
              )
          )
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'replacement_target_ref', target.value->>'replacement_target_ref',
      'candidate_ref', target.value->>'candidate_ref',
      'parser_observation', case
        when target.value->'parser_observation' is null then null
        else pg_catalog.jsonb_build_object(
          'schema_version',
            'customer-correction-replacement-observation-v1',
          'parser_profile',
            target.value #>> '{parser_observation,parserProfile}',
          'outcome', target.value #>> '{parser_observation,outcome}',
          'observed_facts', (
            select coalesce(pg_catalog.jsonb_agg(
              case when matched.match_count = 1 then
                pg_catalog.jsonb_build_object(
                  'fact_key', fact_key.value,
                  'status', matched.item->>'status',
                  'observed_value', matched.item->'observedValue'
                )
              else pg_catalog.jsonb_build_object(
                'fact_key', fact_key.value,
                'status', 'not_observed',
                'observed_value', null
              ) end
              order by fact_key.ordinality
            ), '[]'::jsonb)
            from pg_catalog.jsonb_array_elements_text(
              target.value->'fact_keys'
            ) with ordinality fact_key(value, ordinality)
            left join lateral (
              select pg_catalog.count(*) match_count,
                (pg_catalog.jsonb_agg(
                  observation.value order by observation.ordinality
                )->0) item
              from pg_catalog.jsonb_array_elements(
                target.value #> '{parser_observation,observedFacts}'
              ) with ordinality observation(value, ordinality)
              where observation.value->>'factKey' = fact_key.value
            ) matched on true
          )
        )
      end
    ) order by target.value->>'replacement_target_ref'
  ), '[]'::jsonb) into v_current_candidates
  from pg_catalog.jsonb_array_elements(v_resolution->'targets') target(value)
  where target.value->>'candidate_ref' is not null;

  v_read := pg_catalog.jsonb_set(
    v_read,
    '{handoff,items}',
    v_items,
    false
  );
  return pg_catalog.jsonb_set(
    v_read,
    '{handoff,current_replacement_candidates}',
    v_current_candidates,
    true
  );
end;
$$;

revoke all on function public.app_customer_correction_handoff_read_v4(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_handoff_read_v4(
  uuid, text
) to service_role;

comment on function public.app_customer_correction_handoff_read_v4(
  uuid, text
) is
  'Authenticated customer-safe correction handoff read with canonical fact identity derived by opaque item reference from the exact immutable handoff and matching fact-review manifest.';

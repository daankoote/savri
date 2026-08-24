begin;

create or replace function public.app_customer_correction_handoff_read_v5(
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
  v_resolution jsonb;
  v_candidates jsonb;
begin
  v_read := public.app_customer_correction_handoff_read_v4(
    p_auth_user_id,
    p_case_ref
  );
  if v_read->>'ok' <> 'true'
     or pg_catalog.jsonb_typeof(v_read->'handoff') <> 'object' then
    return v_read;
  end if;
  v_resolution := public.app_customer_correction_replacement_resolution_v2(
    p_auth_user_id,
    p_case_ref
  );
  if v_resolution->>'ok' <> 'true'
     or v_resolution->>'handoff_ref' <>
       v_read #>> '{handoff,handoff_ref}' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'replacement_target_ref', target.value->>'replacement_target_ref',
      'candidate_ref', target.value->>'candidate_ref',
      'file_name', target.value->>'original_filename',
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
                  'observed_value', matched.item->'observedValue',
                  'extraction_method',
                    matched.item #>> '{sourceLocator,extractionMethod}'
                )
              else pg_catalog.jsonb_build_object(
                'fact_key', fact_key.value,
                'status', 'not_observed',
                'observed_value', null,
                'extraction_method', null
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
  ), '[]'::jsonb) into v_candidates
  from pg_catalog.jsonb_array_elements(v_resolution->'targets') target(value)
  where target.value->>'candidate_ref' is not null;
  return pg_catalog.jsonb_set(
    v_read,
    '{handoff,current_replacement_candidates}',
    v_candidates,
    true
  );
end;
$$;

revoke all on function
  public.app_customer_correction_handoff_read_v5(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_handoff_read_v5(uuid, text)
  to service_role;

comment on function public.app_customer_correction_handoff_read_v5(uuid, text)
is
  'Customer-safe correction handoff read with event-derived current candidates; answered handoffs remain a successful null projection.';

commit;

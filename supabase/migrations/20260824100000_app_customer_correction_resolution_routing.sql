begin;

-- CUSTOMER04C3C10 keeps customer resolution intent separate from review truth.
-- The signed client manifest identifies the customer route and relevant current
-- candidate roots; the server resolves parser values and byte SHA authority,
-- derives strength, and never turns source agreement into review acceptance.

create table public.app_customer_correction_fact_resolution_challenge_bindings (
  challenge_id uuid primary key
    references public.app_signup_signing_challenges(id) on delete restrict,
  correction_handoff_id uuid not null
    references public.app_evidence_review_correction_handoffs(id)
    on delete restrict,
  submitted_fact_resolutions jsonb not null,
  submitted_fact_resolutions_sha256 text not null,
  resolution_manifest jsonb not null,
  resolution_manifest_sha256 text not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint app_customer_correction_fact_resolution_binding_manifest_chk
    check (
      pg_catalog.jsonb_typeof(submitted_fact_resolutions) = 'array'
      and pg_catalog.jsonb_array_length(submitted_fact_resolutions) <= 100
      and submitted_fact_resolutions_sha256 ~ '^[0-9a-f]{64}$'
      and pg_catalog.jsonb_typeof(resolution_manifest) = 'array'
      and pg_catalog.jsonb_array_length(resolution_manifest) <= 100
      and resolution_manifest_sha256 ~ '^[0-9a-f]{64}$'
    )
);

create table public.app_evidence_review_customer_submission_fact_resolutions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.app_evidence_review_customer_submissions(id)
    on delete restrict,
  fact_key text not null,
  scope_ref text not null,
  handoff_subject_refs jsonb not null,
  customer_resolution_type text not null,
  evidence_strength text not null,
  independent_source_count integer not null,
  distinct_normalized_value_count integer not null,
  requires_enval_attention boolean not null,
  downstream_verification_bypass_allowed boolean not null default false,
  resolution_manifest_sha256 text not null,
  submitted_fact_resolutions_sha256 text not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint app_customer_submission_fact_resolution_key
    unique (submission_id, fact_key, scope_ref),
  constraint app_customer_submission_fact_resolution_refs_chk check (
    pg_catalog.btrim(fact_key) <> ''
    and scope_ref ~ '^FRSCOPE-[0-9a-f]{64}$'
    and pg_catalog.jsonb_typeof(handoff_subject_refs) = 'array'
    and pg_catalog.jsonb_array_length(handoff_subject_refs) >= 1
    and resolution_manifest_sha256 ~ '^[0-9a-f]{64}$'
    and submitted_fact_resolutions_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_customer_submission_fact_resolution_type_chk check (
    customer_resolution_type in (
      'SOURCE_CONFIRMED', 'SOURCE_CONFLICT_SELECTED', 'MANUAL'
    )
    and evidence_strength in (
      'NO_SOURCE', 'SINGLE_SOURCE', 'MULTI_SOURCE_MATCH', 'SOURCE_CONFLICT'
    )
  ),
  constraint app_customer_submission_fact_resolution_strength_chk check (
    independent_source_count >= 0
    and distinct_normalized_value_count >= 0
    and (
      evidence_strength = 'NO_SOURCE'
      and independent_source_count = 0
      and distinct_normalized_value_count = 0
      or evidence_strength = 'SINGLE_SOURCE'
      and independent_source_count = 1
      and distinct_normalized_value_count = 1
      or evidence_strength = 'MULTI_SOURCE_MATCH'
      and independent_source_count >= 2
      and distinct_normalized_value_count = 1
      or evidence_strength = 'SOURCE_CONFLICT'
      and independent_source_count >= 2
      and distinct_normalized_value_count >= 2
    )
  ),
  constraint app_customer_submission_fact_resolution_route_chk check (
    requires_enval_attention = (
      customer_resolution_type in ('SOURCE_CONFLICT_SELECTED', 'MANUAL')
    )
    and (
      customer_resolution_type = 'SOURCE_CONFIRMED'
      and evidence_strength in ('SINGLE_SOURCE', 'MULTI_SOURCE_MATCH')
      or customer_resolution_type = 'SOURCE_CONFLICT_SELECTED'
      and evidence_strength = 'SOURCE_CONFLICT'
      or customer_resolution_type = 'MANUAL'
    )
    and downstream_verification_bypass_allowed = false
  )
);

create table public.app_evidence_review_customer_submission_fact_resolution_sources (
  id uuid primary key default gen_random_uuid(),
  fact_resolution_id uuid not null
    references public.app_evidence_review_customer_submission_fact_resolutions(id)
    on delete restrict,
  replacement_candidate_id uuid not null
    references public.app_customer_correction_replacement_candidates(id)
    on delete restrict,
  parser_observation_id uuid not null
    references public.app_parser_observation_envelopes(id)
    on delete restrict,
  candidate_reference text not null,
  content_sha256 text not null,
  evidence_relationship text not null,
  normalized_observed_value text not null,
  selected_by_customer boolean not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint app_customer_submission_fact_resolution_source_key
    unique (fact_resolution_id, replacement_candidate_id),
  constraint app_customer_submission_fact_resolution_source_refs_chk check (
    candidate_reference ~ '^CRC-[A-F0-9]{32}$'
    and content_sha256 ~ '^[0-9a-f]{64}$'
    and evidence_relationship in ('direct', 'supporting')
    and pg_catalog.btrim(normalized_observed_value) <> ''
  )
);

create trigger trg_app_customer_correction_fact_resolution_bindings_immutable
before update or delete
on public.app_customer_correction_fact_resolution_challenge_bindings
for each row execute function public.app_customer_correction_immutable_guard_v1();

create trigger trg_app_customer_submission_fact_resolutions_immutable
before update or delete
on public.app_evidence_review_customer_submission_fact_resolutions
for each row execute function public.app_customer_correction_immutable_guard_v1();

create trigger trg_app_customer_submission_fact_resolution_sources_immutable
before update or delete
on public.app_evidence_review_customer_submission_fact_resolution_sources
for each row execute function public.app_customer_correction_immutable_guard_v1();

alter table public.app_customer_correction_fact_resolution_challenge_bindings
  enable row level security;
alter table public.app_evidence_review_customer_submission_fact_resolutions
  enable row level security;
alter table public.app_evidence_review_customer_submission_fact_resolution_sources
  enable row level security;

create policy deny_all
  on public.app_customer_correction_fact_resolution_challenge_bindings
  for all to anon, authenticated using (false) with check (false);
create policy deny_all
  on public.app_evidence_review_customer_submission_fact_resolutions
  for all to anon, authenticated using (false) with check (false);
create policy deny_all
  on public.app_evidence_review_customer_submission_fact_resolution_sources
  for all to anon, authenticated using (false) with check (false);

create function public.app_customer_correction_source_relationship_v1(
  p_fact_key text,
  p_parser_profile text,
  p_extraction_method text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_fact_key = 'partyName'
      and p_extraction_method = 'semantic_contract_holder_block'
      then 'direct'
    when p_fact_key = 'partyName'
      and p_parser_profile = 'installation_invoice_v1'
      and p_extraction_method = 'invoice_customer_block'
      then 'supporting'
    when p_fact_key = 'structuredAddress'
      and p_parser_profile = 'energy_document_v1'
      and p_extraction_method in (
        'semantic_delivery_address_block', 'explicit_delivery_address_block'
      ) then 'direct'
    when p_fact_key = 'structuredAddress'
      and p_parser_profile = 'installation_invoice_v1'
      and p_extraction_method = 'explicit_installation_address_block'
      then 'direct'
    when p_fact_key = 'structuredAddress'
      and p_parser_profile = 'installation_invoice_v1'
      and p_extraction_method = 'invoice_address_block'
      then 'supporting'
    when p_fact_key in (
      'electricityEan', 'energySupplier', 'chargerBrand', 'chargerModel',
      'midNumber', 'serialNumber'
    ) and p_parser_profile in (
      'energy_document_v1', 'installation_invoice_v1'
    ) then 'direct'
    else 'provenance_only'
  end
$$;

create function public.app_customer_correction_fact_resolution_prepare_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_responses jsonb,
  p_fact_resolutions jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_prepare jsonb;
  v_handoff_read jsonb;
  v_items jsonb;
  v_current_candidates jsonb;
  v_resolution record;
  v_source record;
  v_candidate public.app_customer_correction_replacement_candidates%rowtype;
  v_observation public.app_parser_observation_envelopes%rowtype;
  v_target jsonb;
  v_client_source jsonb;
  v_observed_fact jsonb;
  v_sources jsonb;
  v_manifest jsonb := '[]'::jsonb;
  v_fact_key text;
  v_scope_ref text;
  v_scope_kind text;
  v_scope_entity_id uuid;
  v_scope_entity_count integer;
  v_scope_null_count integer;
  v_submitted_value text;
  v_relationship text;
  v_normalized_value text;
  v_evidence_strength text;
  v_independent_count integer;
  v_distinct_value_count integer;
  v_selected_count integer;
  v_source_count integer;
  v_item_count integer;
begin
  if pg_catalog.jsonb_typeof(p_fact_resolutions) <> 'array'
     or pg_catalog.jsonb_array_length(p_fact_resolutions) > 100 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'fact_resolution_set_invalid'
    );
  end if;
  v_prepare := public.app_customer_correction_prepare_v2(
    p_auth_user_id, p_case_ref, p_responses
  );
  if v_prepare->>'ok' <> 'true' then return v_prepare; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_prepare->'items') item(value)
    where item.value->>'item_ref' is null
  ) then
    v_handoff_read := public.app_customer_correction_handoff_read_v5(
      p_auth_user_id, p_case_ref
    );
    if v_handoff_read->>'ok' <> 'true'
       or v_handoff_read->'handoff' is null
       or pg_catalog.jsonb_array_length(v_handoff_read#>'{handoff,items}') <>
         pg_catalog.jsonb_array_length(v_prepare->'items') then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'fact_resolution_set_invalid'
      );
    end if;
    select pg_catalog.jsonb_agg(
      item.value || pg_catalog.jsonb_build_object(
        'item_ref', read_item.value->>'item_ref'
      ) order by (item.value->>'item_index')::integer
    ) into v_items
    from pg_catalog.jsonb_array_elements(v_prepare->'items') item(value)
    join pg_catalog.jsonb_array_elements(v_handoff_read#>'{handoff,items}')
      with ordinality read_item(value, ordinality)
      on read_item.ordinality - 1 = (item.value->>'item_index')::integer;
    v_prepare := pg_catalog.jsonb_set(v_prepare, '{items}', v_items, false);
  end if;
  v_current_candidates :=
    public.app_customer_correction_replacement_resolution_v2(
      p_auth_user_id, p_case_ref
    );
  if v_current_candidates->>'ok' <> 'true' then
    return v_current_candidates;
  end if;

  for v_resolution in
    select resolution.value
    from pg_catalog.jsonb_array_elements(p_fact_resolutions) resolution(value)
  loop
    if pg_catalog.jsonb_typeof(v_resolution.value) <> 'object' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 400, 'code', 'fact_resolution_set_invalid'
      );
    end if;
    if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(
         v_resolution.value
       )) <> 3
       or not (v_resolution.value ?& array[
         'itemRefs', 'resolutionType', 'sources'
       ])
       or pg_catalog.jsonb_typeof(v_resolution.value->'itemRefs') <> 'array'
       or pg_catalog.jsonb_array_length(v_resolution.value->'itemRefs') < 1
       or pg_catalog.jsonb_typeof(v_resolution.value->'sources') <> 'array'
       or pg_catalog.jsonb_array_length(v_resolution.value->'sources') > 100
       or v_resolution.value->>'resolutionType' not in (
         'SOURCE_CONFIRMED', 'SOURCE_CONFLICT_SELECTED', 'MANUAL'
       ) then return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 400, 'code', 'fact_resolution_set_invalid'
      );
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_resolution.value->'itemRefs')
        item_ref(value)
      where pg_catalog.jsonb_typeof(item_ref.value) <> 'string'
        or (item_ref.value #>> '{}') !~ '^CCI-[A-F0-9]{32}$'
    ) then return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'fact_resolution_set_invalid'
    ); end if;
    for v_source in
      select source.value
      from pg_catalog.jsonb_array_elements(v_resolution.value->'sources')
        source(value)
    loop
      if pg_catalog.jsonb_typeof(v_source.value) <> 'object' then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'status', 400, 'code', 'fact_resolution_source_invalid'
        );
      end if;
      if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(
           v_source.value
         )) <> 3
         or not (v_source.value ?& array[
           'candidateRef', 'relationship', 'selected'
         ])
         or v_source.value->>'candidateRef' !~ '^CRC-[A-F0-9]{32}$'
         or v_source.value->>'relationship' not in ('direct', 'supporting')
         or pg_catalog.jsonb_typeof(v_source.value->'selected') <> 'boolean'
      then return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 400, 'code', 'fact_resolution_source_invalid'
      ); end if;
    end loop;
  end loop;

  select pg_catalog.count(*)::integer into v_item_count
  from pg_catalog.jsonb_array_elements(v_prepare->'items') item(value)
  where item.value->>'corrected_value' is not null;
  if v_item_count <> (
       select pg_catalog.count(*)::integer
       from pg_catalog.jsonb_array_elements(p_fact_resolutions) resolution(value)
       cross join lateral pg_catalog.jsonb_array_elements_text(
         resolution.value->'itemRefs'
       ) item_ref(value)
     )
     or v_item_count <> (
       select pg_catalog.count(distinct item_ref.value)::integer
       from pg_catalog.jsonb_array_elements(p_fact_resolutions) resolution(value)
       cross join lateral pg_catalog.jsonb_array_elements_text(
         resolution.value->'itemRefs'
       ) item_ref(value)
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'fact_resolution_set_invalid'
    );
  end if;

  for v_resolution in
    select resolution.value
    from pg_catalog.jsonb_array_elements(p_fact_resolutions) resolution(value)
  loop
    if pg_catalog.jsonb_typeof(v_resolution.value) <> 'object'
       or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(
         v_resolution.value
       )) <> 3
       or not (v_resolution.value ?& array[
         'itemRefs', 'resolutionType', 'sources'
       ])
       or pg_catalog.jsonb_typeof(v_resolution.value->'itemRefs') <> 'array'
       or pg_catalog.jsonb_array_length(v_resolution.value->'itemRefs') < 1
       or pg_catalog.jsonb_typeof(v_resolution.value->'sources') <> 'array'
       or pg_catalog.jsonb_array_length(v_resolution.value->'sources') > 100
       or v_resolution.value->>'resolutionType' not in (
         'SOURCE_CONFIRMED', 'SOURCE_CONFLICT_SELECTED', 'MANUAL'
       ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 400, 'code', 'fact_resolution_set_invalid'
      );
    end if;

    select
      pg_catalog.min(item.value->>'fact_key'),
      pg_catalog.min(item.value->>'corrected_value'),
      pg_catalog.count(*)::integer
    into v_fact_key, v_submitted_value, v_source_count
    from pg_catalog.jsonb_array_elements(v_prepare->'items') item(value)
    join pg_catalog.jsonb_array_elements_text(
      v_resolution.value->'itemRefs'
    ) item_ref(value) on item_ref.value = item.value->>'item_ref'
    where item.value->>'corrected_value' is not null;
    if v_source_count < 1
       or v_source_count <>
         pg_catalog.jsonb_array_length(v_resolution.value->'itemRefs')
       or (select pg_catalog.count(distinct item.value->>'fact_key')
           from pg_catalog.jsonb_array_elements(v_prepare->'items') item(value)
           join pg_catalog.jsonb_array_elements_text(
             v_resolution.value->'itemRefs'
           ) item_ref(value) on item_ref.value = item.value->>'item_ref') <> 1
       or (select pg_catalog.count(distinct item.value->>'corrected_value')
           from pg_catalog.jsonb_array_elements(v_prepare->'items') item(value)
           join pg_catalog.jsonb_array_elements_text(
             v_resolution.value->'itemRefs'
           ) item_ref(value) on item_ref.value = item.value->>'item_ref') <> 1
    then return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'fact_resolution_set_invalid'
    ); end if;
    v_scope_kind := case
      when v_fact_key in (
        'partyName', 'structuredAddress', 'electricityEan', 'energySupplier'
      ) then 'LOCATION'
      when v_fact_key in (
        'chargerBrand', 'chargerModel', 'midNumber', 'serialNumber'
      ) then 'CHARGER'
      else null
    end;
    if v_scope_kind is null then return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'fact_resolution_set_invalid'
    ); end if;
    if v_scope_kind = 'LOCATION' then
      select
        pg_catalog.min(context.location_id::text)::uuid,
        pg_catalog.count(distinct context.location_id)::integer,
        pg_catalog.count(*) filter (where context.location_id is null)::integer
      into v_scope_entity_id, v_scope_entity_count, v_scope_null_count
      from pg_catalog.jsonb_array_elements(v_prepare->'items') item(value)
      join pg_catalog.jsonb_array_elements_text(
        v_resolution.value->'itemRefs'
      ) item_ref(value) on item_ref.value = item.value->>'item_ref'
      join public.app_evidence_files file
        on file.id = (item.value->>'evidence_file_id')::uuid
      join public.app_evidence_declaration_contexts context
        on context.evidence_file_id = file.id;
    else
      select
        pg_catalog.min(context.charger_id::text)::uuid,
        pg_catalog.count(distinct context.charger_id)::integer,
        pg_catalog.count(*) filter (where context.charger_id is null)::integer
      into v_scope_entity_id, v_scope_entity_count, v_scope_null_count
      from pg_catalog.jsonb_array_elements(v_prepare->'items') item(value)
      join pg_catalog.jsonb_array_elements_text(
        v_resolution.value->'itemRefs'
      ) item_ref(value) on item_ref.value = item.value->>'item_ref'
      join public.app_evidence_files file
        on file.id = (item.value->>'evidence_file_id')::uuid
      join public.app_evidence_declaration_contexts context
        on context.evidence_file_id = file.id;
    end if;
    if v_scope_entity_count <> 1 or v_scope_null_count <> 0 then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 400, 'code', 'fact_resolution_set_invalid'
      );
    end if;
    v_scope_ref := 'FRSCOPE-' || pg_catalog.encode(extensions.digest(
      pg_catalog.concat_ws(
        '|', 'customer-correction-resolution-scope-v1',
        v_prepare->>'case_id', v_scope_kind, v_scope_entity_id::text,
        v_fact_key
      ), 'sha256'
    ), 'hex');
    v_submitted_value := pg_catalog.lower(v_submitted_value);

    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_resolution.value->'sources')
        source(value)
      where pg_catalog.jsonb_typeof(source.value) <> 'object'
         or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(
           source.value
         )) <> 3
         or not (source.value ?& array[
           'candidateRef', 'relationship', 'selected'
         ])
         or source.value->>'candidateRef' !~ '^CRC-[A-F0-9]{32}$'
         or source.value->>'relationship' not in ('direct', 'supporting')
         or pg_catalog.jsonb_typeof(source.value->'selected') <> 'boolean'
    ) or (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(v_resolution.value->'sources')
        source(value)
    ) <> (
      select pg_catalog.count(distinct source.value->>'candidateRef')
      from pg_catalog.jsonb_array_elements(v_resolution.value->'sources')
        source(value)
    ) then return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 400, 'code', 'fact_resolution_source_invalid'
    ); end if;

    v_sources := '[]'::jsonb;
    for v_source in
      select target.value
      from pg_catalog.jsonb_array_elements(
        v_current_candidates->'targets'
      ) target(value)
      where target.value->>'candidate_ref' is not null
        and target.value->'fact_keys' ? v_fact_key
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(v_prepare->'items') item(value)
          where item.value->>'fact_key' = v_fact_key
            and exists (
              select 1
              from pg_catalog.jsonb_array_elements_text(
                v_resolution.value->'itemRefs'
              ) item_ref(value)
              where item_ref.value = item.value->>'item_ref'
            )
            and target.value->'item_refs' ? (item.value->>'item_ref')
        )
      order by target.value->>'replacement_target_ref'
    loop
      v_target := v_source.value;
      select candidate.* into v_candidate
      from public.app_customer_correction_replacement_candidates candidate
      where candidate.handoff_id = (v_prepare->>'handoff_id')::uuid
        and candidate.replacement_target_ref =
          v_target->>'replacement_target_ref'
        and candidate.candidate_reference =
          v_target->>'candidate_ref';
      if not found then return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'fact_resolution_source_stale'
      ); end if;
      select observation.* into v_observation
      from public.app_parser_observation_envelopes observation
      where observation.correction_replacement_candidate_id = v_candidate.id
        and observation.byte_sha256 = v_candidate.server_sha256
      order by observation.observed_at desc, observation.id desc
      limit 1;
      if not found then return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'fact_resolution_source_stale'
      ); end if;
      select fact.value into v_observed_fact
      from pg_catalog.jsonb_array_elements(
        v_observation.envelope->'observedFacts'
      ) fact(value)
      where fact.value->>'factKey' = v_fact_key
        and fact.value->>'status' = 'observed'
        and pg_catalog.btrim(coalesce(fact.value->>'observedValue', '')) <> '';
      if not found then
        continue;
      end if;
      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(
          v_observation.envelope->'observedFacts'
        ) fact(value)
        where fact.value->>'factKey' = v_fact_key
          and fact.value->>'status' = 'observed'
          and pg_catalog.btrim(coalesce(fact.value->>'observedValue', '')) <> ''
      ) <> 1 then return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'fact_resolution_source_invalid'
      ); end if;
      v_relationship := public.app_customer_correction_source_relationship_v1(
        v_fact_key,
        v_observation.parser_profile,
        v_observed_fact #>> '{sourceLocator,extractionMethod}'
      );
      if v_relationship not in ('direct', 'supporting') then
        continue;
      end if;
      select source.value into v_client_source
      from pg_catalog.jsonb_array_elements(v_resolution.value->'sources')
        source(value)
      where source.value->>'candidateRef' = v_candidate.candidate_reference;
      if found and v_client_source->>'relationship' <> v_relationship then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'status', 409, 'code', 'fact_resolution_source_invalid'
        );
      end if;
      v_normalized_value := pg_catalog.lower(
        public.app_customer_correction_normalize_value_v1(
          v_fact_key, v_observed_fact->>'observedValue'
        )
      );
      if v_normalized_value is null then return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'fact_resolution_source_invalid'
      ); end if;
      v_sources := v_sources || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'replacement_candidate_id', v_candidate.id,
          'candidate_reference', v_candidate.candidate_reference,
          'parser_observation_id', v_observation.id,
          'parser_observation_hash', v_observation.envelope_hash,
          'content_sha256', v_candidate.server_sha256,
          'evidence_relationship', v_relationship,
          'normalized_observed_value', v_normalized_value,
          'selected_by_customer', coalesce(
            (v_client_source->>'selected')::boolean, false
          )
        )
      );
    end loop;

    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_resolution.value->'sources')
        source(value)
      where not exists (
        select 1 from pg_catalog.jsonb_array_elements(v_sources) current(value)
        where current.value->>'candidate_reference' =
          source.value->>'candidateRef'
      )
    ) then return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'fact_resolution_source_stale'
    ); end if;

    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_sources) left_source(value)
      join pg_catalog.jsonb_array_elements(v_sources) right_source(value)
        on left_source.value->>'content_sha256' =
          right_source.value->>'content_sha256'
       and left_source.value->>'normalized_observed_value' <>
          right_source.value->>'normalized_observed_value'
    ) then return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'fact_resolution_source_invalid'
    ); end if;
    select
      pg_catalog.count(distinct source.value->>'content_sha256')::integer,
      pg_catalog.count(distinct source.value->>'normalized_observed_value')::integer,
      pg_catalog.count(*) filter (
        where (source.value->>'selected_by_customer')::boolean
      )::integer
    into v_independent_count, v_distinct_value_count, v_selected_count
    from pg_catalog.jsonb_array_elements(v_sources) source(value);
    v_evidence_strength := case
      when v_independent_count = 0 then 'NO_SOURCE'
      when v_independent_count = 1 then 'SINGLE_SOURCE'
      when v_distinct_value_count = 1 then 'MULTI_SOURCE_MATCH'
      else 'SOURCE_CONFLICT'
    end;
    if (
      v_resolution.value->>'resolutionType' = 'SOURCE_CONFIRMED'
      and (
        v_evidence_strength not in ('SINGLE_SOURCE', 'MULTI_SOURCE_MATCH')
        or v_selected_count <> 0
        or exists (
          select 1 from pg_catalog.jsonb_array_elements(v_sources) source(value)
          where source.value->>'normalized_observed_value' <>
            v_submitted_value
        )
      )
    ) or (
      v_resolution.value->>'resolutionType' = 'SOURCE_CONFLICT_SELECTED'
      and (
        v_evidence_strength <> 'SOURCE_CONFLICT'
        or v_selected_count <> 1
        or not exists (
          select 1 from pg_catalog.jsonb_array_elements(v_sources) source(value)
          where (source.value->>'selected_by_customer')::boolean
            and source.value->>'normalized_observed_value' = v_submitted_value
        )
      )
    ) or (
      v_resolution.value->>'resolutionType' = 'MANUAL'
      and v_selected_count <> 0
    ) then return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'fact_resolution_route_invalid'
    ); end if;

    v_manifest := v_manifest || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'fact_key', v_fact_key,
        'scope_ref', v_scope_ref,
        'handoff_subject_refs', (
          select pg_catalog.jsonb_agg(
            item.value->>'handoff_subject_ref'
            order by (item.value->>'item_index')::integer
          )
          from pg_catalog.jsonb_array_elements(v_prepare->'items') item(value)
          join pg_catalog.jsonb_array_elements_text(
            v_resolution.value->'itemRefs'
          ) item_ref(value) on item_ref.value = item.value->>'item_ref'
        ),
        'customer_resolution_type', v_resolution.value->>'resolutionType',
        'evidence_strength', v_evidence_strength,
        'independent_source_count', v_independent_count,
        'distinct_normalized_value_count', v_distinct_value_count,
        'requires_enval_attention',
          v_resolution.value->>'resolutionType' <>
            'SOURCE_CONFIRMED',
        'downstream_verification_bypass_allowed', false,
        'sources', v_sources
      )
    );
  end loop;
  if pg_catalog.jsonb_array_length(v_manifest) <> (
    select pg_catalog.count(distinct pg_catalog.concat_ws(
      '|', resolution.value->>'fact_key', resolution.value->>'scope_ref'
    ))
    from pg_catalog.jsonb_array_elements(v_manifest) resolution(value)
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 400, 'code', 'fact_resolution_set_invalid'
  ); end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'prepared',
    'handoff_id', v_prepare->>'handoff_id',
    'resolution_manifest', v_manifest
  );
end;
$$;

create function public.app_customer_correction_challenge_issue_v4(
  p_auth_user_id uuid,
  p_case_ref text,
  p_responses jsonb,
  p_fact_resolutions jsonb,
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
  v_prepared jsonb;
  v_result jsonb;
  v_challenge public.app_signup_signing_challenges%rowtype;
  v_binding
    public.app_customer_correction_fact_resolution_challenge_bindings%rowtype;
  v_manifest_sha text;
  v_submitted_resolution_sha text;
begin
  v_prepared := public.app_customer_correction_fact_resolution_prepare_v1(
    p_auth_user_id, p_case_ref, p_responses, p_fact_resolutions
  );
  if v_prepared->>'ok' <> 'true' then return v_prepared; end if;
  v_result := public.app_customer_correction_challenge_issue_v3(
    p_auth_user_id, p_case_ref, p_responses, p_typed_full_name,
    p_channel_reference_sha256, p_otp_verifier_sha256, p_expires_at,
    p_payload_sha256, p_legal_bundle_version, p_legal_bundle_sha256,
    p_request_id, p_idempotency_key, p_environment
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  select challenge.* into strict v_challenge
  from public.app_signup_signing_challenges challenge
  where challenge.id = (v_result->>'challenge_reference')::uuid
    and challenge.subject_type = 'CUSTOMER_CORRECTION'
    and challenge.correction_handoff_id =
      (v_prepared->>'handoff_id')::uuid;
  select pg_catalog.encode(extensions.digest(
    (v_prepared->'resolution_manifest')::text, 'sha256'
  ), 'hex') into v_manifest_sha;
  select pg_catalog.encode(extensions.digest(
    p_fact_resolutions::text, 'sha256'
  ), 'hex') into v_submitted_resolution_sha;
  select binding.* into v_binding
  from public.app_customer_correction_fact_resolution_challenge_bindings binding
  where binding.challenge_id = v_challenge.id;
  if found then
    if v_binding.correction_handoff_id <> v_challenge.correction_handoff_id
       or v_binding.resolution_manifest <>
         v_prepared->'resolution_manifest'
       or v_binding.resolution_manifest_sha256 <> v_manifest_sha
       or v_binding.submitted_fact_resolutions <> p_fact_resolutions
       or v_binding.submitted_fact_resolutions_sha256 <>
         v_submitted_resolution_sha then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'idempotency_conflict'
      );
    end if;
    return v_result;
  end if;
  insert into public.app_customer_correction_fact_resolution_challenge_bindings (
    challenge_id, correction_handoff_id, submitted_fact_resolutions,
    submitted_fact_resolutions_sha256, resolution_manifest,
    resolution_manifest_sha256
  ) values (
    v_challenge.id, v_challenge.correction_handoff_id,
    p_fact_resolutions, v_submitted_resolution_sha,
    v_prepared->'resolution_manifest', v_manifest_sha
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

create function public.app_customer_correction_finalize_v3(
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
  v_binding
    public.app_customer_correction_fact_resolution_challenge_bindings%rowtype;
  v_result jsonb;
  v_submission public.app_evidence_review_customer_submissions%rowtype;
  v_resolution record;
  v_source record;
  v_resolution_id uuid;
  v_existing_count integer;
  v_attention_count integer := 0;
begin
  select binding.* into v_binding
  from public.app_customer_correction_fact_resolution_challenge_bindings binding
  where binding.challenge_id = p_challenge_id;
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'fact_resolution_binding_missing'
  ); end if;
  v_result := public.app_customer_correction_finalize_v2(
    p_auth_user_id, p_case_ref, p_challenge_id, p_otp_verifier_sha256,
    p_typed_full_name, p_legal_bundle_version, p_legal_bundle_sha256,
    p_request_id, p_idempotency_key, p_environment
  );
  if v_result->>'ok' <> 'true' then return v_result; end if;
  select submission.* into strict v_submission
  from public.app_evidence_review_customer_submissions submission
  where submission.handoff_id = v_binding.correction_handoff_id;
  select pg_catalog.count(*)::integer into v_existing_count
  from public.app_evidence_review_customer_submission_fact_resolutions resolution
  where resolution.submission_id = v_submission.id;
  if v_existing_count > 0 then
    if v_existing_count <>
         pg_catalog.jsonb_array_length(v_binding.resolution_manifest)
       or exists (
         select 1
         from public.app_evidence_review_customer_submission_fact_resolutions
           resolution
         where resolution.submission_id = v_submission.id
           and resolution.resolution_manifest_sha256 <>
             v_binding.resolution_manifest_sha256
       ) then raise exception
        'customer correction fact resolution replay mismatch';
    end if;
    return v_result || pg_catalog.jsonb_build_object(
      'fact_resolution_count', v_existing_count,
      'enval_attention_count', (
        select pg_catalog.count(*)
        from public.app_evidence_review_customer_submission_fact_resolutions
          resolution
        where resolution.submission_id = v_submission.id
          and resolution.requires_enval_attention
      )
    );
  end if;

  for v_resolution in
    select resolution.value
    from pg_catalog.jsonb_array_elements(v_binding.resolution_manifest)
      resolution(value)
  loop
    insert into public.app_evidence_review_customer_submission_fact_resolutions (
      submission_id, fact_key, scope_ref, handoff_subject_refs,
      customer_resolution_type, evidence_strength,
      independent_source_count, distinct_normalized_value_count,
      requires_enval_attention, downstream_verification_bypass_allowed,
      resolution_manifest_sha256, submitted_fact_resolutions_sha256
    ) values (
      v_submission.id, v_resolution.value->>'fact_key',
      v_resolution.value->>'scope_ref',
      v_resolution.value->'handoff_subject_refs',
      v_resolution.value->>'customer_resolution_type',
      v_resolution.value->>'evidence_strength',
      (v_resolution.value->>'independent_source_count')::integer,
      (v_resolution.value->>'distinct_normalized_value_count')::integer,
      (v_resolution.value->>'requires_enval_attention')::boolean,
      false, v_binding.resolution_manifest_sha256,
      v_binding.submitted_fact_resolutions_sha256
    ) returning id into v_resolution_id;
    if (v_resolution.value->>'requires_enval_attention')::boolean then
      v_attention_count := v_attention_count + 1;
    end if;
    for v_source in
      select source.value
      from pg_catalog.jsonb_array_elements(v_resolution.value->'sources')
        source(value)
    loop
      insert into public.app_evidence_review_customer_submission_fact_resolution_sources (
        fact_resolution_id, replacement_candidate_id, parser_observation_id,
        candidate_reference, content_sha256, evidence_relationship,
        normalized_observed_value, selected_by_customer
      ) values (
        v_resolution_id,
        (v_source.value->>'replacement_candidate_id')::uuid,
        (v_source.value->>'parser_observation_id')::uuid,
        v_source.value->>'candidate_reference',
        v_source.value->>'content_sha256',
        v_source.value->>'evidence_relationship',
        v_source.value->>'normalized_observed_value',
        (v_source.value->>'selected_by_customer')::boolean
      );
    end loop;
  end loop;
  return v_result || pg_catalog.jsonb_build_object(
    'fact_resolution_count',
      pg_catalog.jsonb_array_length(v_binding.resolution_manifest),
    'enval_attention_count', v_attention_count
  );
exception
  when unique_violation then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
  );
  when others then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

revoke all on table
  public.app_customer_correction_fact_resolution_challenge_bindings,
  public.app_evidence_review_customer_submission_fact_resolutions,
  public.app_evidence_review_customer_submission_fact_resolution_sources
  from public, anon, authenticated, service_role;
grant select on table
  public.app_evidence_review_customer_submission_fact_resolutions,
  public.app_evidence_review_customer_submission_fact_resolution_sources
  to service_role;

revoke all on function public.app_customer_correction_source_relationship_v1(
  text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_fact_resolution_prepare_v1(
  uuid, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_challenge_issue_v3(
  uuid, text, jsonb, text, text, text, timestamptz,
  text, text, text, text, text, text
) from service_role;
revoke all on function public.app_customer_correction_finalize_v2(
  uuid, text, uuid, text, text, text, text, text, text, text
) from service_role;
revoke all on function public.app_customer_correction_challenge_issue_v4(
  uuid, text, jsonb, jsonb, text, text, text, timestamptz,
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_challenge_issue_v4(
  uuid, text, jsonb, jsonb, text, text, text, timestamptz,
  text, text, text, text, text, text
) to service_role;
revoke all on function public.app_customer_correction_finalize_v3(
  uuid, text, uuid, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_finalize_v3(
  uuid, text, uuid, text, text, text, text, text, text, text
) to service_role;

comment on table
  public.app_evidence_review_customer_submission_fact_resolutions is
  'Immutable server-derived customer resolution route and evidence strength per submitted canonical value; never an internal or external review decision.';
comment on column
  public.app_evidence_review_customer_submission_fact_resolutions.downstream_verification_bypass_allowed is
  'Fail-closed seam: source agreement never bypasses any required downstream or third-party verification.';

commit;

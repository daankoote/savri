begin;

-- REVIEW07 adds one private, exact-case, read-only source boundary for a later
-- internal evidence-review detail page. The existing central workforce
-- evaluator remains the only authorization authority. No view event, task,
-- parser execution, preview token or review decision is written here.

create function public.app_evidence_review_case_detail_read_v1(
  p_auth_user_id uuid,
  p_case_ref text
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
  v_case_context jsonb;
  v_evidence jsonb;
begin
  if p_auth_user_id is null
     or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or p_case_ref !~* '^CASE-([0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  select case_row.id into v_case_id
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if not found then
    -- Do not expose case existence to an unscoped caller.
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'case_scope_denied'
    );
  end if;

  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id,
    'evidence.review.view',
    v_case_id,
    null,
    v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  with latest_lifecycle as (
    select lifecycle.lifecycle_state
    from public.app_case_lifecycle_events lifecycle
    where lifecycle.case_id = v_case_id
      and lifecycle.event_at <= v_now
    order by lifecycle.event_at desc, lifecycle.id desc
    limit 1
  ), current_service_recipient as (
    select coalesce(person_profile.full_name, organization_profile.legal_name)
      as display_name
    from public.app_case_party_roles role_version
    left join public.app_party_person_versions person_profile
      on person_profile.id = role_version.person_profile_version_id
    left join public.app_party_organization_versions organization_profile
      on organization_profile.id = role_version.organization_profile_version_id
    where role_version.case_id = v_case_id
      and role_version.role_type = 'service_recipient'
      and role_version.claim_status in ('asserted', 'case_confirmed')
      and role_version.valid_from <= v_now
      and (role_version.valid_to is null or v_now < role_version.valid_to)
      and not exists (
        select 1
        from public.app_case_party_roles successor
        where successor.supersedes_id = role_version.id
      )
  ), safe_service_recipient as (
    select case when count(*) = 1 then min(display_name) end as display_name
    from current_service_recipient
    where pg_catalog.btrim(coalesce(display_name, '')) <> ''
  ), current_case_locations as (
    select relation.location_id
    from public.app_case_location_relations relation
    where relation.case_id = v_case_id
      and relation.event_type = 'linked'
      and relation.effective_at <= v_now
      and (relation.valid_until is null or v_now < relation.valid_until)
      and not exists (
        select 1
        from public.app_case_location_relations successor
        where successor.supersedes_relation_event_id = relation.id
      )
      and not exists (
        select 1
        from public.app_case_location_relations unlink_event
        where unlink_event.relation_id = relation.relation_id
          and unlink_event.event_type = 'unlinked'
          and unlink_event.effective_at <= v_now
      )
  ), single_case_location as (
    select case when count(*) = 1 then min(location_id::text)::uuid end as location_id
    from current_case_locations
  ), declared_address_candidates as (
    select distinct case observation.descriptor_kind
      when 'unstructured_postal_address' then observation.declared_address_text
      when 'postal_address' then pg_catalog.concat_ws(
        ', ',
        pg_catalog.concat_ws(
          ' ',
          observation.street,
          observation.house_number::text ||
            coalesce(observation.house_number_addition, '')
        ),
        pg_catalog.concat_ws(' ', observation.postal_code, observation.city),
        observation.country_code
      )
      else null
    end as display_value
    from single_case_location single_location
    join public.app_location_address_observations observation
      on observation.location_id = single_location.location_id
     and observation.observation_kind = 'customer_declared'
     and observation.observed_at <= v_now
  ), safe_declared_address as (
    select case when count(*) = 1 then min(display_value) end as display_value
    from declared_address_candidates
    where pg_catalog.btrim(coalesce(display_value, '')) <> ''
  )
  select pg_catalog.jsonb_build_object(
    'case_ref', case_row.case_reference,
    'lifecycle_state', latest_lifecycle.lifecycle_state,
    'party_display_name', safe_party.display_name,
    'party_truth_class', case when safe_party.display_name is not null
      then 'DECLARED' else null end,
    'delivery_address', safe_address.display_value,
    'delivery_address_truth_class', case when safe_address.display_value is not null
      then 'DECLARED' else null end
  ) into v_case_context
  from public.app_cases case_row
  cross join latest_lifecycle
  cross join safe_service_recipient safe_party
  cross join safe_declared_address safe_address
  where case_row.id = v_case_id;

  if v_case_context is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'case_projection_unavailable'
    );
  end if;

  with latest_evidence_version as (
    select distinct on (evidence_file.id)
      evidence_file.id as evidence_file_id,
      evidence_file.document_type,
      evidence_file.promotion_id,
      evidence_version.id as evidence_version_id,
      evidence_version.version_number,
      evidence_version.detected_mime_type,
      evidence_version.source_confirmed_at,
      evidence_version.created_at,
      evidence_version.sha256
    from public.app_evidence_files evidence_file
    join public.app_evidence_versions evidence_version
      on evidence_version.evidence_file_id = evidence_file.id
    where evidence_file.case_id = v_case_id
    order by evidence_file.id, evidence_version.version_number desc,
      evidence_version.created_at desc, evidence_version.id desc
  ), signed_fact_candidates as (
    select distinct
      latest.evidence_file_id,
      case fact.value ->> 'fact_key'
        when 'partyName' then 'PARTY_NAME'
        when 'organizationName' then 'PARTY_NAME'
        when 'structuredAddress' then 'ADDRESS'
        when 'electricityEan' then 'EAN'
        when 'energySupplier' then 'ENERGY_SUPPLIER'
        when 'chargerBrand' then 'CHARGER_BRAND'
        when 'chargerModel' then 'CHARGER_MODEL'
        when 'midNumber' then 'MID'
        when 'serialNumber' then 'SERIAL'
      end as category,
      pg_catalog.btrim(fact.value ->> 'value') as fact_value,
      case fact.value ->> 'resolution_state'
        when 'confirmed' then 'CUSTOMER_CONFIRMED'
        when 'review_required' then 'REVIEW_REQUIRED'
      end as truth_class
    from latest_evidence_version latest
    join public.app_signup_promotions promotion
      on promotion.id = latest.promotion_id
     and promotion.case_id = v_case_id
    join public.app_signup_signing_snapshots snapshot
      on snapshot.id = promotion.signing_snapshot_id
    join public.app_evidence_declaration_contexts evidence_context
      on evidence_context.evidence_file_id = latest.evidence_file_id
     and evidence_context.promotion_id = latest.promotion_id
    left join public.app_locations context_location
      on context_location.id = evidence_context.location_id
    left join public.app_chargers context_charger
      on context_charger.id = evidence_context.charger_id
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(snapshot.canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)
    ) fact(value)
    where pg_catalog.jsonb_typeof(fact.value) = 'object'
      and pg_catalog.btrim(coalesce(fact.value ->> 'value', '')) <> ''
      and fact.value ->> 'resolution_state' in ('confirmed', 'review_required')
      and (
        fact.value ->> 'fact_key' in ('partyName', 'organizationName')
        or (
          latest.document_type = 'energy_bill_or_contract'
          and fact.value ->> 'fact_key' in (
            'structuredAddress', 'electricityEan', 'energySupplier'
          )
          and context_location.id is not null
          and context_location.created_from_request_id =
            promotion.request_id || ':location:' || (fact.value ->> 'location_id')
        )
        or (
          latest.document_type = 'installation_invoice'
          and fact.value ->> 'fact_key' = 'structuredAddress'
          and context_location.id is not null
          and context_location.created_from_request_id =
            promotion.request_id || ':location:' || (fact.value ->> 'location_id')
        )
        or (
          latest.document_type = 'installation_invoice'
          and fact.value ->> 'fact_key' in (
            'chargerBrand', 'chargerModel', 'midNumber', 'serialNumber'
          )
          and context_charger.id is not null
          and context_charger.source_ref_sha256 = pg_catalog.encode(
            extensions.digest(fact.value ->> 'charger_id', 'sha256'), 'hex'
          )
        )
      )
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'evidence_file_ref', latest.evidence_file_id,
        'evidence_version_ref', latest.evidence_version_id,
        'kind', latest.document_type,
        'mime_type', latest.detected_mime_type,
        'uploaded_at', pg_catalog.to_char(
          latest.source_confirmed_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'sha256_present', latest.sha256 ~ '^[0-9a-f]{64}$',
        'review_status', coalesce(current_decision.decision, 'PENDING'),
        'decided_at', case when current_decision.decided_at is null then null
          else pg_catalog.to_char(
            current_decision.decided_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ) end,
        'canonical_facts', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'category', fact.category,
              'value', fact.fact_value,
              'truth_class', fact.truth_class
            ) order by fact.category, fact.fact_value, fact.truth_class
          )
          from signed_fact_candidates fact
          where fact.evidence_file_id = latest.evidence_file_id
            and fact.category is not null
            and fact.truth_class is not null
        ), '[]'::jsonb)
      ) order by latest.created_at, latest.evidence_file_id
    ),
    '[]'::jsonb
  ) into v_evidence
  from latest_evidence_version latest
  left join public.app_evidence_review_decisions current_decision
    on current_decision.evidence_version_id = latest.evidence_version_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 200,
    'code', 'ok',
    'as_of', pg_catalog.to_char(
      v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'case_context', v_case_context,
    'evidence', v_evidence
  );
end;
$$;

revoke all on function public.app_evidence_review_case_detail_read_v1(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.app_evidence_review_case_detail_read_v1(uuid, text)
  to service_role;

comment on function public.app_evidence_review_case_detail_read_v1(uuid, text) is
  'Service-role-only exact-case read boundary for evidence-review detail. It hard-binds evidence.review.view and exact active case scope through the central evaluator, projects only declared case context, current evidence metadata, signed canonical fact states and REVIEW02 status, and exposes no storage path, credential, reviewer identity, parser lineage or preview URL.';

commit;

begin;

create function public.app_customer_correction_bundle_v4_valid_v1(
  p_bundle jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_bundle->'items') item(value)
    where pg_catalog.jsonb_typeof(item.value) <> 'object'
       or item.value->>'fact_key' not in (
         'partyName', 'structuredAddress', 'electricityEan',
         'energySupplier', 'chargerBrand', 'chargerModel',
         'midNumber', 'serialNumber'
       )
       or item.value->>'response_requirement' not in (
         'DOCUMENT_REPLACEMENT', 'VALUE_PLUS_DOCUMENT_REPLACEMENT'
       )
       or pg_catalog.jsonb_typeof(item.value->'document_requirement') <>
         'object'
       or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(
         item.value->'document_requirement'
       )) <> 4
       or not ((item.value->'document_requirement') ?& array[
         'document_type', 'parser_profile', 'relationship',
         'response_requirement'
       ])
       or item.value #>> '{document_requirement,relationship}' <> 'direct'
       or item.value #>> '{document_requirement,response_requirement}' <>
         item.value->>'response_requirement'
       or case when item.value->>'fact_key' in (
         'partyName', 'structuredAddress', 'electricityEan', 'energySupplier'
       ) then
         item.value #>> '{document_requirement,document_type}' <>
           'energy_bill_or_contract'
         or item.value #>> '{document_requirement,parser_profile}' <>
           'energy_document_v1'
         or item.value->>'evidence_kind' <> 'energy_bill_or_contract'
       else
         item.value #>> '{document_requirement,document_type}' <>
           'installation_invoice'
         or item.value #>> '{document_requirement,parser_profile}' <>
           'installation_invoice_v1'
         or item.value->>'evidence_kind' <> 'installation_invoice'
       end
  )
$$;

-- DOCUMENT_DRIVEN_CUSTOMER_CORRECTION_V1 keeps legacy bundle versions
-- readable, while every new write uses bundle v4 with an explicit immutable
-- document-first requirement per correction item.
alter table public.app_evidence_review_correction_handoffs
  drop constraint app_evidence_review_correction_handoffs_bundle_chk;
alter table public.app_evidence_review_correction_handoffs
  add constraint app_evidence_review_correction_handoffs_bundle_chk check (
    pg_catalog.jsonb_typeof(correction_bundle) is not distinct from 'object'
    and pg_catalog.jsonb_typeof(correction_bundle->'schema_version')
      is not distinct from 'string'
    and correction_bundle->>'schema_version' in (
      'evidence-review-correction-handoff-bundle-v1',
      'evidence-review-correction-handoff-bundle-v2',
      'evidence-review-correction-handoff-bundle-v3',
      'evidence-review-correction-handoff-bundle-v4'
    )
    and pg_catalog.jsonb_typeof(correction_bundle->'items')
      is not distinct from 'array'
    and pg_catalog.jsonb_array_length(correction_bundle->'items') > 0
    and case
      when correction_bundle->>'schema_version' in (
        'evidence-review-correction-handoff-bundle-v3',
        'evidence-review-correction-handoff-bundle-v4'
      ) then
        pg_catalog.jsonb_typeof(
          correction_bundle->'customer_publication'
        ) is not distinct from 'object'
        and pg_catalog.jsonb_typeof(
          correction_bundle->'customer_publication'->'schema_version'
        ) is not distinct from 'string'
        and pg_catalog.jsonb_typeof(
          correction_bundle->'customer_publication'->'cover_message'
        ) is not distinct from 'string'
        and (
          (correction_bundle->'customer_publication')
            - 'schema_version'::text - 'cover_message'::text
        ) = '{}'::jsonb
        and (correction_bundle #>>
          '{customer_publication,schema_version}') =
            'correction-customer-publication-v1'
        and (correction_bundle #>> '{customer_publication,cover_message}') =
          pg_catalog.btrim(
            correction_bundle #>> '{customer_publication,cover_message}'
          )
        and (correction_bundle #>> '{customer_publication,cover_message}')
          !~ '^[[:space:]]|[[:space:]]$'
        and pg_catalog.char_length(
          correction_bundle #>> '{customer_publication,cover_message}'
        ) between 1 and 1000
        and (correction_bundle #>> '{customer_publication,cover_message}')
          ~ '[[:alnum:]]'
        and pg_catalog.strpos(
          correction_bundle #>> '{customer_publication,cover_message}',
          chr(13)
        ) = 0
        and pg_catalog.regexp_replace(
          correction_bundle #>> '{customer_publication,cover_message}',
          chr(10), '', 'g'
        ) !~ '[[:cntrl:]]'
      else not (correction_bundle ? 'customer_publication')
    end
    and case when correction_bundle->>'schema_version' =
      'evidence-review-correction-handoff-bundle-v4' then
      public.app_customer_correction_bundle_v4_valid_v1(correction_bundle)
    else true end
  );

create or replace function
  public.app_evidence_review_correction_handoff_lineage_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_predecessor public.app_evidence_review_correction_handoffs%rowtype;
begin
  if new.supersedes_handoff_id is null then
    if new.capability_code <> 'evidence.review.correction.publish'
       or (new.correction_bundle->>'schema_version') is distinct from
         'evidence-review-correction-handoff-bundle-v4' then
      raise exception 'correction handoff root shape invalid'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select predecessor.* into v_predecessor
  from public.app_evidence_review_correction_handoffs predecessor
  where predecessor.id = new.supersedes_handoff_id
  for key share;
  if not found
     or new.capability_code <> 'evidence.review.correction.supersede'
     or (new.correction_bundle->>'schema_version') is distinct from
       'evidence-review-correction-handoff-bundle-v4'
     or new.case_id <> v_predecessor.case_id
     or new.round_id <> v_predecessor.round_id
     or new.manifest_version <> v_predecessor.manifest_version
     or new.manifest_hash <> v_predecessor.manifest_hash
     or new.target_customer_id <> v_predecessor.target_customer_id
     or new.published_at < v_predecessor.published_at
     or exists (
       select 1
       from public.app_evidence_review_customer_submissions submission
       where submission.handoff_id = v_predecessor.id
     )
     or exists (
       select 1
       from public.app_evidence_review_correction_handoffs successor
       where successor.supersedes_handoff_id = v_predecessor.id
     )
     or pg_catalog.jsonb_array_length(new.correction_bundle->'items') <>
       pg_catalog.jsonb_array_length(v_predecessor.correction_bundle->'items')
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(
         v_predecessor.correction_bundle->'items'
       ) with ordinality predecessor_item(value, ordinality)
       full join pg_catalog.jsonb_array_elements(new.correction_bundle->'items')
         with ordinality successor_item(value, ordinality)
         using (ordinality)
       where predecessor_item.value is null
          or successor_item.value is null
          or predecessor_item.value - 'response_requirement' -
               'document_requirement' <>
             successor_item.value - 'response_requirement' -
               'document_requirement'
          or successor_item.value->>'response_requirement' not in (
            'DOCUMENT_REPLACEMENT',
            'VALUE_PLUS_DOCUMENT_REPLACEMENT'
          )
     ) then
    raise exception 'correction handoff successor shape invalid'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.app_evidence_review_correction_supersede_v3(
  p_auth_user_id uuid,
  p_case_ref text,
  p_predecessor_handoff_ref text,
  p_item_requirements jsonb,
  p_reason text,
  p_explanation text,
  p_cover_message text,
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
  v_case public.app_cases%rowtype;
  v_predecessor public.app_evidence_review_correction_handoffs%rowtype;
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_items jsonb;
  v_bundle jsonb;
  v_bundle_sha256 text;
  v_successor_id uuid := gen_random_uuid();
  v_successor_reference text;
  v_response jsonb;
begin
  if p_auth_user_id is null
     or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or p_predecessor_handoff_ref !~ '^CRH-[0-9A-F]{16}$'
     or pg_catalog.jsonb_typeof(p_item_requirements) <> 'array'
     or pg_catalog.jsonb_array_length(p_item_requirements) not between 1 and 100
     or p_reason not in (
       'NEW_EVIDENCE_REQUIRED', 'REQUIREMENT_CORRECTION',
       'PROCESS_CORRECTION', 'OTHER'
     )
     or (p_reason = 'OTHER' and (
       p_explanation is null
       or p_explanation <> pg_catalog.btrim(p_explanation)
       or pg_catalog.char_length(p_explanation) not between 1 and 500
     ))
     or (p_reason <> 'OTHER' and p_explanation is not null)
     or p_cover_message is null
     or p_cover_message <> pg_catalog.btrim(p_cover_message)
     or p_cover_message ~ '^[[:space:]]|[[:space:]]$'
     or pg_catalog.char_length(p_cover_message) not between 1 and 1000
     or p_cover_message !~ '[[:alnum:]]'
     or pg_catalog.strpos(p_cover_message, chr(13)) > 0
     or pg_catalog.regexp_replace(p_cover_message, chr(10), '', 'g')
       ~ '[[:cntrl:]]'
     or p_request_id is null
     or p_request_id <> pg_catalog.btrim(p_request_id)
     or pg_catalog.char_length(p_request_id) not between 1 and 128
     or p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_expires_at is null
     or p_idempotency_expires_at <= v_now
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(p_item_requirements) item(value)
       where pg_catalog.jsonb_typeof(item.value) <> 'object'
          or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(
            item.value
          )) <> 2
          or not (item.value ?& array['item_ref', 'response_requirement'])
          or item.value->>'item_ref' !~ '^CCI-[A-F0-9]{32}$'
          or item.value->>'response_requirement' not in (
            'DOCUMENT_REPLACEMENT', 'VALUE_PLUS_DOCUMENT_REPLACEMENT'
          )
     )
     or (
       select pg_catalog.count(distinct item.value->>'item_ref')
       from pg_catalog.jsonb_array_elements(p_item_requirements) item(value)
     ) <> pg_catalog.jsonb_array_length(p_item_requirements) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  select case_row.* into v_case from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 404, 'code', 'case_missing'
  ); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'evidence_review_correction_supersede:v3:' || v_case.id::text, 0
  ));
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'evidence.review.correction.supersede',
    v_case.id, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  select predecessor.* into v_predecessor
  from public.app_evidence_review_correction_handoffs predecessor
  where predecessor.handoff_reference = p_predecessor_handoff_ref
    and predecessor.case_id = v_case.id;
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 404, 'code', 'correction_handoff_missing'
  ); end if;
  if v_predecessor.correction_bundle->>'schema_version' <>
       'evidence-review-correction-handoff-bundle-v4'
     or v_predecessor.bundle_sha256 <> pg_catalog.encode(
       extensions.digest(v_predecessor.correction_bundle::text, 'sha256'),
       'hex'
     ) then return pg_catalog.jsonb_build_object(
       'ok', false, 'status', 409,
       'code', 'correction_handoff_integrity_failed'
     );
  end if;
  v_scope := 'evidence_review_correction_supersede:v3:case:' ||
    v_case.id::text || ':predecessor:' || v_predecessor.id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;
  if exists (
    select 1 from public.app_evidence_review_customer_submissions submission
    where submission.handoff_id = v_predecessor.id
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_answered'
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;
  if v_predecessor.id is distinct from
       public.app_evidence_review_current_correction_handoff_v1(
         v_case.id, v_predecessor.manifest_version,
         v_predecessor.manifest_hash
       ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_not_current'
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_set(
      (predecessor_item.value - 'response_requirement' -
        'document_requirement'),
      '{document_requirement}',
      (predecessor_item.value->'document_requirement') ||
        pg_catalog.jsonb_build_object(
          'response_requirement',
          requirement.value->>'response_requirement'
        )
    ) || pg_catalog.jsonb_build_object(
      'response_requirement', requirement.value->>'response_requirement'
    )
    order by predecessor_item.ordinality
  ), '[]'::jsonb) into v_items
  from pg_catalog.jsonb_array_elements(v_predecessor.correction_bundle->'items')
    with ordinality predecessor_item(value, ordinality)
  join pg_catalog.jsonb_array_elements(p_item_requirements) requirement(value)
    on requirement.value->>'item_ref' =
      public.app_customer_correction_item_ref_v1(
        v_predecessor.id, v_predecessor.case_id,
        v_predecessor.target_customer_id,
        predecessor_item.value->>'subject_ref'
      )
  where not (
    requirement.value->>'response_requirement' = 'DOCUMENT_REPLACEMENT'
    and public.app_customer_correction_normalize_value_v1(
      predecessor_item.value->>'fact_key',
      predecessor_item.value #>> '{customer_safe,current_value}'
    ) is null
  );
  if pg_catalog.jsonb_array_length(v_items) <>
       pg_catalog.jsonb_array_length(v_predecessor.correction_bundle->'items')
     or pg_catalog.jsonb_array_length(v_items) <>
       pg_catalog.jsonb_array_length(p_item_requirements) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_item_set_mismatch'
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;
  v_bundle := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      v_predecessor.correction_bundle,
      '{items}', v_items
    ),
    '{customer_publication}',
    pg_catalog.jsonb_build_object(
      'schema_version', 'correction-customer-publication-v1',
      'cover_message', p_cover_message
    )
  );
  select pg_catalog.encode(extensions.digest(v_bundle::text, 'sha256'), 'hex')
    into v_bundle_sha256;
  select 'CRH-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
    extensions.digest(
      'correction-handoff-supersession-v3|' || v_predecessor.id::text || '|' ||
      v_bundle_sha256 || '|' || p_reason || '|' || coalesce(p_explanation, ''),
      'sha256'
    ), 'hex'
  ), 1, 16)) into v_successor_reference;
  insert into public.app_evidence_review_correction_handoffs (
    id, handoff_reference, case_id, round_id,
    manifest_version, manifest_hash, target_customer_id,
    correction_bundle, bundle_sha256,
    publisher_workforce_identity_id, publisher_scope_assignment_id,
    capability_code, authorization_policy_version_id,
    payload_sha256, request_id, idempotency_key, published_at,
    supersedes_handoff_id, supersession_reason, supersession_explanation
  ) values (
    v_successor_id, v_successor_reference, v_predecessor.case_id,
    v_predecessor.round_id, v_predecessor.manifest_version,
    v_predecessor.manifest_hash, v_predecessor.target_customer_id,
    v_bundle, v_bundle_sha256,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'evidence.review.correction.supersede',
    (v_auth->>'policy_version_id')::uuid,
    p_payload_sha256, p_request_id, p_idempotency_key, v_now,
    v_predecessor.id, p_reason, p_explanation
  );
  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, idempotency_key,
    actor_type, actor_ref, event_data,
    authorization_policy_version_id, created_at
  ) values (
    'evidence_review_correction_handoff_superseded',
    'case', v_case.id, p_request_id, p_idempotency_key,
    'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'predecessor_handoff_ref', v_predecessor.handoff_reference,
      'successor_handoff_ref', v_successor_reference,
      'source_round_ref', v_predecessor.round_id,
      'reason', p_reason,
      'explanation', p_explanation,
      'successor_bundle_sha256', v_bundle_sha256,
      'item_count', pg_catalog.jsonb_array_length(v_items),
      'contract_version', 'document-driven-customer-correction-v1'
    )),
    (v_auth->>'policy_version_id')::uuid, v_now
  );
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'superseded',
    'predecessor_handoff_id', v_predecessor.id,
    'predecessor_handoff_ref', v_predecessor.handoff_reference,
    'successor_handoff_id', v_successor_id,
    'successor_handoff_ref', v_successor_reference,
    'round_id', v_predecessor.round_id,
    'bundle_sha256', v_bundle_sha256,
    'published_at', v_now
  );
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
  );
exception
  when unique_violation then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
  );
  when check_violation or foreign_key_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_item_set_mismatch'
    );
  when others then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;


create function public.app_customer_correction_primary_document_v1(
  p_fact_key text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_fact_key in (
      'partyName', 'structuredAddress', 'electricityEan', 'energySupplier'
    ) then pg_catalog.jsonb_build_object(
      'document_type', 'energy_bill_or_contract',
      'document_label', 'Energiedocument',
      'parser_profile', 'energy_document_v1'
    )
    when p_fact_key in (
      'chargerBrand', 'chargerModel', 'midNumber', 'serialNumber'
    ) then pg_catalog.jsonb_build_object(
      'document_type', 'installation_invoice',
      'document_label', 'Installatiefactuur',
      'parser_profile', 'installation_invoice_v1'
    )
    else null
  end
$$;

create function public.app_customer_correction_source_relationship_v2(
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
      and p_parser_profile = 'energy_document_v1'
      and p_extraction_method = 'semantic_contract_holder_block'
      then 'direct'
    when p_fact_key = 'structuredAddress'
      and p_parser_profile = 'energy_document_v1'
      and p_extraction_method in (
        'semantic_delivery_address_block', 'explicit_delivery_address_block'
      ) then 'direct'
    when p_fact_key in ('electricityEan', 'energySupplier')
      and p_parser_profile = 'energy_document_v1' then 'direct'
    when p_fact_key in (
      'chargerBrand', 'chargerModel', 'midNumber', 'serialNumber'
    ) and p_parser_profile = 'installation_invoice_v1' then 'direct'
    when p_fact_key in (
      'partyName', 'structuredAddress', 'electricityEan', 'energySupplier',
      'chargerBrand', 'chargerModel', 'midNumber', 'serialNumber'
    ) and p_parser_profile in (
      'energy_document_v1', 'installation_invoice_v1'
    ) then 'supporting'
    else 'provenance_only'
  end
$$;

create function public.app_evidence_review_correction_publish_v3(
  p_auth_user_id uuid,
  p_case_ref text,
  p_round_id uuid,
  p_item_requirements jsonb,
  p_cover_message text,
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
  v_case public.app_cases%rowtype;
  v_round public.app_evidence_review_rounds%rowtype;
  v_existing public.app_evidence_review_correction_handoffs%rowtype;
  v_auth jsonb;
  v_manifest jsonb;
  v_scope text;
  v_begin jsonb;
  v_bundle jsonb;
  v_bundle_sha256 text;
  v_handoff_id uuid;
  v_handoff_reference text;
  v_response jsonb;
begin
  if p_auth_user_id is null
     or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or p_round_id is null
     or pg_catalog.jsonb_typeof(p_item_requirements) <> 'array'
     or pg_catalog.jsonb_array_length(p_item_requirements) not between 1 and 100
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(p_item_requirements) item(value)
       where pg_catalog.jsonb_typeof(item.value) <> 'object'
          or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(
            item.value
          )) <> 2
          or not (item.value ?& array['subject_ref', 'response_requirement'])
          or item.value->>'subject_ref' !~ '^FRS-[0-9a-f]{64}$'
          or item.value->>'response_requirement' not in (
            'DOCUMENT_REPLACEMENT',
            'VALUE_PLUS_DOCUMENT_REPLACEMENT'
          )
     )
     or (
       select pg_catalog.count(distinct item.value->>'subject_ref')
       from pg_catalog.jsonb_array_elements(p_item_requirements) item(value)
     ) <> pg_catalog.jsonb_array_length(p_item_requirements)
     or p_cover_message is null
     or p_cover_message <> pg_catalog.btrim(p_cover_message)
     or p_cover_message ~ '^[[:space:]]|[[:space:]]$'
     or pg_catalog.char_length(p_cover_message) not between 1 and 1000
     or p_cover_message !~ '[[:alnum:]]'
     or pg_catalog.strpos(p_cover_message, chr(13)) > 0
     or pg_catalog.regexp_replace(p_cover_message, chr(10), '', 'g')
       ~ '[[:cntrl:]]'
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

  select case_row.* into v_case
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 404, 'code', 'case_missing'
  ); end if;
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'evidence.review.correction.publish',
    v_case.id, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer_case_action:v1:' || v_case.id::text, 0
  ));
  if exists (
    select 1 from public.app_customer_information_requests request_row
    where request_row.case_id = v_case.id
      and request_row.terminal_action is null
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'information_request_active'
  ); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'evidence_review_correction_handoff:v3:' || v_case.id::text || ':' ||
    p_round_id::text, 0
  ));

  select round_row.* into v_round
  from public.app_evidence_review_rounds round_row
  where round_row.id = p_round_id and round_row.case_id = v_case.id;
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 404, 'code', 'review_round_missing'
  ); end if;
  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then return v_manifest; end if;
  if v_round.manifest_version <> v_manifest->>'manifest_version'
     or v_round.manifest_hash <> v_manifest->>'manifest_hash' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'stale_review_round'
    );
  end if;
  if v_round.outcome <> 'CORRECTIONS_REQUIRED' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_not_eligible'
    );
  end if;
  if not exists (
    select 1 from public.app_customers customer_row
    where customer_row.id = v_case.customer_id
      and customer_row.status = 'active'
  ) or exists (
    select 1 from public.app_customer_access_grants access_grant
    where access_grant.granted_case_id = v_case.id
      and access_grant.customer_id <> v_case.customer_id
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'customer_context_unavailable'
  ); end if;

  with correction_subjects as (
    select decision.*, subject.item as manifest_subject,
      requirement.value->>'response_requirement' as response_requirement,
      source_context.location_id as source_location_id,
      source_context.charger_id as source_charger_id,
      public.app_customer_correction_primary_document_v1(
        decision.fact_key
      ) as primary_document
    from public.app_evidence_review_round_subject_decisions decision
    join pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
      on subject.item->>'subject_ref' = decision.subject_ref
    join pg_catalog.jsonb_array_elements(p_item_requirements)
      requirement(value)
      on requirement.value->>'subject_ref' = decision.subject_ref
    join public.app_evidence_declaration_contexts source_context
      on source_context.evidence_file_id = decision.evidence_file_id
    where decision.round_id = v_round.id
      and decision.disposition = 'CORRECTION_REQUIRED'
      and decision.correction_reason in (
        'MISSING_INFORMATION', 'INCORRECT_INFORMATION',
        'INCONSISTENT_INFORMATION', 'OTHER'
      )
      and decision.correction_instruction is not null
  ), primary_bindings as (
    select correction.*,
      primary_file.id as primary_evidence_file_id,
      primary_version.id as primary_evidence_version_id,
      primary_file.document_type as primary_evidence_kind,
      primary_version.sha256 as primary_content_sha256,
      pg_catalog.count(*) over (
        partition by correction.subject_ref
      ) as primary_binding_count
    from correction_subjects correction
    join public.app_evidence_files primary_file
      on primary_file.case_id = v_case.id
     and primary_file.document_type =
       correction.primary_document->>'document_type'
    join public.app_evidence_declaration_contexts primary_context
      on primary_context.evidence_file_id = primary_file.id
     and case when correction.fact_key in (
       'partyName', 'structuredAddress', 'electricityEan', 'energySupplier'
     ) then primary_context.location_id = correction.source_location_id
       else primary_context.charger_id = correction.source_charger_id end
    join lateral (
      select version_row.*
      from public.app_evidence_versions version_row
      where version_row.evidence_file_id = primary_file.id
      order by version_row.version_number desc, version_row.id desc
      limit 1
    ) primary_version on true
    where primary_file.id = correction.evidence_file_id
      and primary_version.id = correction.evidence_version_id
  )
  select pg_catalog.jsonb_build_object(
    'schema_version', 'evidence-review-correction-handoff-bundle-v4',
    'case_ref', v_case.case_reference,
    'source_round_ref', v_round.id,
    'manifest_version', v_round.manifest_version,
    'manifest_hash', v_round.manifest_hash,
    'target_customer_ref', v_case.customer_id,
    'customer_publication', pg_catalog.jsonb_build_object(
      'schema_version', 'correction-customer-publication-v1',
      'cover_message', p_cover_message
    ),
    'items', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'subject_ref', binding.subject_ref,
        'evidence_file_ref', binding.primary_evidence_file_id,
        'evidence_version_ref', binding.primary_evidence_version_id,
        'evidence_kind', binding.primary_evidence_kind,
        'fact_key', binding.fact_key,
        'scope_ref', binding.scope_ref,
        'source_round_ref', v_round.id,
        'response_requirement', binding.response_requirement,
        'document_requirement', pg_catalog.jsonb_build_object(
          'document_type', binding.primary_document->>'document_type',
          'parser_profile', binding.primary_document->>'parser_profile',
          'relationship', 'direct',
          'response_requirement', binding.response_requirement
        ),
        'customer_safe', pg_catalog.jsonb_strip_nulls(
          pg_catalog.jsonb_build_object(
            'document_label', binding.primary_document->>'document_label',
            'fact_label', binding.fact_label,
            'current_value', binding.manifest_subject->'value',
            'correction_reason', binding.correction_reason,
            'correction_reason_label', case binding.correction_reason
              when 'MISSING_INFORMATION' then 'Gegeven ontbreekt'
              when 'INCORRECT_INFORMATION' then 'Gegeven onjuist'
              when 'INCONSISTENT_INFORMATION' then 'Gegevens inconsistent'
              when 'OTHER' then 'Aanpassing nodig'
              else null
            end,
            'correction_instruction', binding.correction_instruction
          )
        )
      ) order by binding.subject_ref
    ), '[]'::jsonb)
  ) into v_bundle
  from primary_bindings binding
  where binding.primary_binding_count = 1
    and binding.primary_content_sha256 ~ '^[0-9a-f]{64}$'
    and not (
      binding.response_requirement = 'DOCUMENT_REPLACEMENT'
      and (
        binding.manifest_subject->>'value_status' <> 'PRESENT'
        or public.app_customer_correction_normalize_value_v1(
          binding.fact_key, binding.manifest_subject->>'value'
        ) is null
      )
    );

  if pg_catalog.jsonb_array_length(v_bundle->'items') < 1
     or pg_catalog.jsonb_array_length(v_bundle->'items') <>
       pg_catalog.jsonb_array_length(p_item_requirements)
     or pg_catalog.jsonb_array_length(v_bundle->'items') <> (
       select pg_catalog.count(*)
       from public.app_evidence_review_round_subject_decisions decision
       where decision.round_id = v_round.id
         and decision.disposition = 'CORRECTION_REQUIRED'
     ) then return pg_catalog.jsonb_build_object(
       'ok', false, 'status', 409, 'code', 'correction_bundle_unavailable'
     );
  end if;

  select pg_catalog.encode(extensions.digest(v_bundle::text, 'sha256'), 'hex')
    into v_bundle_sha256;
  v_scope := 'evidence_review_correction_publish:v3:case:' ||
    v_case.id::text || ':round:' || v_round.id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  select * into v_existing
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.round_id = v_round.id;
  if found then
    v_response := case when
      v_existing.case_id = v_case.id
      and v_existing.target_customer_id = v_case.customer_id
      and v_existing.manifest_version = v_round.manifest_version
      and v_existing.manifest_hash = v_round.manifest_hash
      and v_existing.bundle_sha256 = v_bundle_sha256
      and v_existing.correction_bundle = v_bundle
    then pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'already_published',
      'handoff_id', v_existing.id,
      'handoff_ref', v_existing.handoff_reference,
      'round_id', v_existing.round_id,
      'bundle_sha256', v_existing.bundle_sha256,
      'published_at', v_existing.published_at
    ) else pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_conflict'
    ) end;
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;

  v_handoff_id := gen_random_uuid();
  select 'CRH-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
    extensions.digest(
      'correction-handoff-v3|' || v_round.id::text || '|' ||
      v_case.customer_id::text || '|' || v_bundle_sha256,
      'sha256'
    ), 'hex'
  ), 1, 16)) into v_handoff_reference;
  insert into public.app_evidence_review_correction_handoffs (
    id, handoff_reference, case_id, round_id,
    manifest_version, manifest_hash, target_customer_id,
    correction_bundle, bundle_sha256,
    publisher_workforce_identity_id, publisher_scope_assignment_id,
    capability_code, authorization_policy_version_id,
    payload_sha256, request_id, idempotency_key, published_at
  ) values (
    v_handoff_id, v_handoff_reference, v_case.id, v_round.id,
    v_round.manifest_version, v_round.manifest_hash, v_case.customer_id,
    v_bundle, v_bundle_sha256,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'evidence.review.correction.publish',
    (v_auth->>'policy_version_id')::uuid,
    p_payload_sha256, p_request_id, p_idempotency_key, v_now
  );
  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, idempotency_key,
    actor_type, actor_ref, event_data,
    authorization_policy_version_id, created_at
  ) values (
    'evidence_review_correction_handoff_published',
    'case', v_case.id, p_request_id, p_idempotency_key,
    'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'handoff_ref', v_handoff_reference,
      'round_ref', v_round.id,
      'manifest_version', v_round.manifest_version,
      'manifest_hash', v_round.manifest_hash,
      'bundle_sha256', v_bundle_sha256,
      'correction_count', pg_catalog.jsonb_array_length(v_bundle->'items'),
      'contract_version', 'document-driven-customer-correction-v1'
    ),
    (v_auth->>'policy_version_id')::uuid, v_now
  );
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'published',
    'handoff_id', v_handoff_id,
    'handoff_ref', v_handoff_reference,
    'round_id', v_round.id,
    'bundle_sha256', v_bundle_sha256,
    'published_at', v_now
  );
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
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

alter table public.app_evidence_review_customer_submission_fact_resolutions
  add column transcription_candidate_id uuid
    references public.app_customer_correction_replacement_candidates(id)
    on delete restrict,
  add column transcription_parser_observation_id uuid
    references public.app_parser_observation_envelopes(id)
    on delete restrict,
  add column transcription_content_sha256 text,
  add column transcription_value_sha256 text;

alter table public.app_evidence_review_customer_submission_fact_resolutions
  drop constraint app_customer_submission_fact_resolution_type_chk,
  drop constraint app_customer_submission_fact_resolution_strength_chk,
  drop constraint app_customer_submission_fact_resolution_route_chk;

alter table public.app_evidence_review_customer_submission_fact_resolutions
  add constraint app_customer_submission_fact_resolution_type_chk check (
    customer_resolution_type in (
      'SOURCE_CONFIRMED', 'SOURCE_CONFLICT_SELECTED', 'MANUAL',
      'DOCUMENT_TRANSCRIPTION'
    )
    and evidence_strength in (
      'NO_SOURCE', 'SINGLE_SOURCE', 'MULTI_SOURCE_MATCH', 'SOURCE_CONFLICT',
      'DOCUMENT_BOUND_ASSERTION'
    )
  ),
  add constraint app_customer_submission_fact_resolution_strength_chk check (
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
      or evidence_strength = 'DOCUMENT_BOUND_ASSERTION'
        and independent_source_count = 0
        and distinct_normalized_value_count = 0
    )
  ),
  add constraint app_customer_submission_fact_resolution_route_chk check (
    requires_enval_attention = customer_resolution_type in (
      'SOURCE_CONFLICT_SELECTED', 'MANUAL', 'DOCUMENT_TRANSCRIPTION'
    )
    and (
      customer_resolution_type = 'SOURCE_CONFIRMED'
        and evidence_strength in ('SINGLE_SOURCE', 'MULTI_SOURCE_MATCH')
      or customer_resolution_type = 'SOURCE_CONFLICT_SELECTED'
        and evidence_strength = 'SOURCE_CONFLICT'
      or customer_resolution_type = 'MANUAL'
      or customer_resolution_type = 'DOCUMENT_TRANSCRIPTION'
        and evidence_strength = 'DOCUMENT_BOUND_ASSERTION'
    )
    and downstream_verification_bypass_allowed = false
  ),
  add constraint app_customer_submission_fact_resolution_transcription_chk
    check (
      case when customer_resolution_type = 'DOCUMENT_TRANSCRIPTION' then
        transcription_candidate_id is not null
        and transcription_parser_observation_id is not null
        and transcription_content_sha256 ~ '^[0-9a-f]{64}$'
        and transcription_value_sha256 ~ '^[0-9a-f]{64}$'
      else
        transcription_candidate_id is null
        and transcription_parser_observation_id is null
        and transcription_content_sha256 is null
        and transcription_value_sha256 is null
      end
    );

create function public.app_customer_correction_fact_resolution_prepare_v2(
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
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_legacy_resolutions jsonb;
  v_prepared jsonb;
  v_manifest jsonb;
  v_resolution record;
  v_manifest_entry jsonb;
  v_item jsonb;
  v_bundle_item jsonb;
  v_response jsonb;
  v_candidate public.app_customer_correction_replacement_candidates%rowtype;
  v_observation public.app_parser_observation_envelopes%rowtype;
  v_observed_fact jsonb;
  v_direct_count integer;
  v_normalized text;
  v_prior_normalized text;
  v_transcription_value text;
begin
  if pg_catalog.jsonb_typeof(p_fact_resolutions) <> 'array'
     or pg_catalog.jsonb_array_length(p_fact_resolutions) > 100
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(p_fact_resolutions) resolution(value)
       where pg_catalog.jsonb_typeof(resolution.value) <> 'object'
          or resolution.value->>'resolutionType' not in (
            'SOURCE_CONFIRMED', 'DOCUMENT_TRANSCRIPTION'
          )
          or pg_catalog.jsonb_typeof(resolution.value->'itemRefs') <> 'array'
          or pg_catalog.jsonb_array_length(resolution.value->'itemRefs') < 1
          or case when resolution.value->>'resolutionType' =
               'DOCUMENT_TRANSCRIPTION' then
               (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(
                 resolution.value
               )) <> 4
               or not (resolution.value ? 'transcriptionCandidateRef')
               or resolution.value->>'transcriptionCandidateRef'
                 !~ '^CRC-[A-F0-9]{32}$'
               or resolution.value->'sources' <> '[]'::jsonb
             else
               (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(
                 resolution.value
               )) <> 3
               or pg_catalog.jsonb_typeof(resolution.value->'sources') <>
                 'array'
             end
     ) then return pg_catalog.jsonb_build_object(
       'ok', false, 'status', 400, 'code', 'fact_resolution_set_invalid'
     );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    case when resolution.value->>'resolutionType' = 'DOCUMENT_TRANSCRIPTION'
      then pg_catalog.jsonb_build_object(
        'itemRefs', resolution.value->'itemRefs',
        'resolutionType', 'MANUAL',
        'sources', '[]'::jsonb
      ) else resolution.value end
    order by resolution.ordinality
  ), '[]'::jsonb) into v_legacy_resolutions
  from pg_catalog.jsonb_array_elements(p_fact_resolutions)
    with ordinality resolution(value, ordinality);

  v_prepared := public.app_customer_correction_fact_resolution_prepare_v1(
    p_auth_user_id, p_case_ref, p_responses, v_legacy_resolutions
  );
  if v_prepared->>'ok' <> 'true' then return v_prepared; end if;
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = (v_prepared->>'handoff_id')::uuid;
  if not found
     or v_handoff.correction_bundle->>'schema_version' <>
       'evidence-review-correction-handoff-bundle-v4'
     or v_handoff.bundle_sha256 <> pg_catalog.encode(
       extensions.digest(v_handoff.correction_bundle::text, 'sha256'), 'hex'
     ) then return pg_catalog.jsonb_build_object(
       'ok', false, 'status', 409, 'code', 'document_first_handoff_required'
     );
  end if;
  v_manifest := v_prepared->'resolution_manifest';

  for v_item in
    select item.value
    from pg_catalog.jsonb_array_elements(
      public.app_customer_correction_prepare_v2(
        p_auth_user_id, p_case_ref, p_responses
      )->'items'
    ) item(value)
  loop
    select bundle.value into v_bundle_item
    from pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
      with ordinality bundle(value, ordinality)
    where bundle.ordinality - 1 = (v_item->>'item_index')::integer;
    select response.value into v_response
    from pg_catalog.jsonb_array_elements(p_responses) response(value)
    where response.value->>'itemRef' = v_item->>'item_ref';
    if v_bundle_item is null or v_response is null
       or v_bundle_item->>'response_requirement' not in (
         'DOCUMENT_REPLACEMENT', 'VALUE_PLUS_DOCUMENT_REPLACEMENT'
       )
       or v_item->>'replacement_candidate_id' is null
       or v_item->>'replacement_parser_profile' <>
         v_bundle_item #>> '{document_requirement,parser_profile}' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'document_first_binding_invalid'
      );
    end if;
    select candidate.* into v_candidate
    from public.app_customer_correction_replacement_candidates candidate
    where candidate.id = (v_item->>'replacement_candidate_id')::uuid
      and candidate.handoff_id = v_handoff.id
      and candidate.candidate_reference =
        v_response->>'replacementCandidateRef'
      and candidate.server_sha256 = v_item->>'replacement_content_sha256'
      and candidate.parser_profile =
        v_bundle_item #>> '{document_requirement,parser_profile}';
    if not found then return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'replacement_lineage_invalid'
    ); end if;
    select observation.* into v_observation
    from public.app_parser_observation_envelopes observation
    where observation.id = (v_item->>'parser_observation_id')::uuid
      and observation.correction_replacement_candidate_id = v_candidate.id
      and observation.byte_sha256 = v_candidate.server_sha256
      and observation.parser_profile = v_candidate.parser_profile;
    if not found then return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'parser_observation_not_bound'
    ); end if;
    select pg_catalog.count(*)::integer,
      (pg_catalog.jsonb_agg(fact.value order by fact.ordinality)->0)
      into v_direct_count, v_observed_fact
    from pg_catalog.jsonb_array_elements(v_observation.envelope->'observedFacts')
      with ordinality fact(value, ordinality)
    where fact.value->>'factKey' = v_item->>'fact_key'
      and fact.value->>'status' = 'observed'
      and public.app_customer_correction_normalize_value_v1(
        v_item->>'fact_key', fact.value->>'observedValue'
      ) is not null
      and public.app_customer_correction_source_relationship_v2(
        v_item->>'fact_key', v_observation.parser_profile,
        fact.value #>> '{sourceLocator,extractionMethod}'
      ) = 'direct';
    v_normalized := case when v_direct_count = 1 then
      pg_catalog.lower(public.app_customer_correction_normalize_value_v1(
        v_item->>'fact_key', v_observed_fact->>'observedValue'
      )) else null end;
    v_prior_normalized := pg_catalog.lower(
      public.app_customer_correction_normalize_value_v1(
        v_item->>'fact_key', v_item->>'prior_value'
      )
    );
    if v_bundle_item->>'response_requirement' = 'DOCUMENT_REPLACEMENT' then
      if v_direct_count <> 1 or v_normalized is distinct from v_prior_normalized
         or v_response ? 'correctedValue' then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'status', 409,
          'code', 'document_only_value_mismatch'
        );
      end if;
    else
      if not (v_response ? 'correctedValue')
         or pg_catalog.lower(v_item->>'corrected_value') = v_prior_normalized
      then return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'value_change_required'
      ); end if;
      select resolution.value into v_resolution
      from pg_catalog.jsonb_array_elements(p_fact_resolutions) resolution(value)
      where resolution.value->'itemRefs' ? (v_item->>'item_ref');
      if not found then return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'fact_resolution_set_invalid'
      ); end if;
      if v_resolution.value->>'resolutionType' = 'SOURCE_CONFIRMED' then
        if v_direct_count <> 1
           or v_normalized <> pg_catalog.lower(v_item->>'corrected_value')
        then return pg_catalog.jsonb_build_object(
          'ok', false, 'status', 409, 'code', 'primary_source_value_mismatch'
        ); end if;
        if not exists (
          select 1
          from pg_catalog.jsonb_array_elements(v_manifest) entry(value)
          cross join lateral pg_catalog.jsonb_array_elements(
            entry.value->'sources'
          ) source(value)
          where entry.value->'handoff_subject_refs' ?
              (v_bundle_item->>'subject_ref')
            and source.value->>'replacement_candidate_id' =
              v_candidate.id::text
            and source.value->>'evidence_relationship' = 'direct'
            and source.value->>'normalized_observed_value' = v_normalized
        ) then return pg_catalog.jsonb_build_object(
          'ok', false, 'status', 409, 'code', 'primary_source_required'
        ); end if;
      else
        v_transcription_value := v_item->>'corrected_value';
        if v_direct_count = 1
           or v_resolution.value->>'transcriptionCandidateRef' <>
             v_candidate.candidate_reference then
          return pg_catalog.jsonb_build_object(
            'ok', false, 'status', 409,
            'code', 'document_transcription_not_available'
          );
        end if;
        select entry.value into v_manifest_entry
        from pg_catalog.jsonb_array_elements(v_manifest)
          with ordinality entry(value, ordinality)
        where entry.value->'handoff_subject_refs' ?
          (v_bundle_item->>'subject_ref');
        if not found then return pg_catalog.jsonb_build_object(
          'ok', false, 'status', 409, 'code', 'fact_resolution_set_invalid'
        ); end if;
        v_manifest_entry := v_manifest_entry || pg_catalog.jsonb_build_object(
          'customer_resolution_type', 'DOCUMENT_TRANSCRIPTION',
          'evidence_strength', 'DOCUMENT_BOUND_ASSERTION',
          'requires_enval_attention', true,
          'transcription_candidate_id', v_candidate.id,
          'transcription_parser_observation_id', v_observation.id,
          'transcription_content_sha256', v_candidate.server_sha256,
          'transcription_value_sha256', pg_catalog.encode(
            extensions.digest(v_transcription_value, 'sha256'), 'hex'
          )
        );
        select pg_catalog.jsonb_agg(
          case when current.value->'handoff_subject_refs' ?
            (v_bundle_item->>'subject_ref') then v_manifest_entry
          else current.value end order by current.ordinality
        ) into v_manifest
        from pg_catalog.jsonb_array_elements(v_manifest)
          with ordinality current(value, ordinality);
      end if;
    end if;
  end loop;
  return v_prepared || pg_catalog.jsonb_build_object(
    'resolution_manifest', v_manifest
  );
end;
$$;

create function public.app_customer_correction_challenge_issue_v5(
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
  v_prepared := public.app_customer_correction_fact_resolution_prepare_v2(
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

create function public.app_customer_correction_finalize_v4(
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
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_binding.resolution_manifest)
      resolution(value)
    where resolution.value->>'customer_resolution_type' not in (
      'SOURCE_CONFIRMED', 'DOCUMENT_TRANSCRIPTION'
    )
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'document_first_binding_invalid'
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
      resolution_manifest_sha256, submitted_fact_resolutions_sha256,
      transcription_candidate_id, transcription_parser_observation_id,
      transcription_content_sha256, transcription_value_sha256
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
      v_binding.submitted_fact_resolutions_sha256,
      (v_resolution.value->>'transcription_candidate_id')::uuid,
      (v_resolution.value->>'transcription_parser_observation_id')::uuid,
      v_resolution.value->>'transcription_content_sha256',
      v_resolution.value->>'transcription_value_sha256'
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

-- Replacement evidence is promoted before submission items are recorded.
-- Bind each item to the exact server-derived post-replacement manifest subject.
create function public.app_customer_correction_submission_subject_ref_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_submission public.app_evidence_review_customer_submissions%rowtype;
begin
  select submission.* into strict v_submission
  from public.app_evidence_review_customer_submissions submission
  where submission.id = new.submission_id;

  select subject.item->>'subject_ref' into strict new.resulting_subject_ref
  from pg_catalog.jsonb_array_elements(
    public.app_evidence_fact_review_manifest_v1(v_submission.case_id)->'subjects'
  ) subject(item)
  where subject.item->>'signing_snapshot_id' =
      v_submission.resulting_snapshot_id::text
    and subject.item->>'evidence_file_id' = new.evidence_file_id::text
    and subject.item->>'evidence_version_id' = new.evidence_version_id::text
    and subject.item->>'evidence_sha256' = new.evidence_sha256
    and subject.item->>'fact_id' = new.fact_id
    and subject.item->>'fact_key' = new.fact_key
    and subject.item->>'scope_ref' = new.scope_ref
    and subject.item->>'value_sha256' = new.resulting_value_sha256
    and subject.item->>'value_status' = 'PRESENT';
  return new;
exception
  when no_data_found or too_many_rows then
    raise exception 'customer correction resulting subject authority unavailable';
end;
$$;

create trigger trg_app_customer_submission_item_subject_ref
before insert on public.app_evidence_review_customer_submission_items
for each row execute function
  public.app_customer_correction_submission_subject_ref_v1();

create or replace function public.app_correction_customer_publication_snapshot_v1(
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
  v_snapshot jsonb;
begin
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = p_handoff_id;
  if not found or v_handoff.bundle_sha256 <> pg_catalog.encode(
    extensions.digest(v_handoff.correction_bundle::text, 'sha256'), 'hex'
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
  ); end if;
  if v_handoff.correction_bundle->>'schema_version' in (
    'evidence-review-correction-handoff-bundle-v1',
    'evidence-review-correction-handoff-bundle-v2'
  ) then return pg_catalog.jsonb_build_object(
    'ok', true, 'snapshot', null, 'snapshot_sha256', null
  ); end if;
  if v_handoff.correction_bundle->>'schema_version' not in (
    'evidence-review-correction-handoff-bundle-v3',
    'evidence-review-correction-handoff-bundle-v4'
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
  ); end if;
  v_snapshot := v_handoff.correction_bundle->'customer_publication';
  if pg_catalog.jsonb_typeof(v_snapshot) <> 'object'
     or pg_catalog.jsonb_typeof(v_snapshot->'schema_version') <> 'string'
     or pg_catalog.jsonb_typeof(v_snapshot->'cover_message') <> 'string'
     or (v_snapshot - 'schema_version' - 'cover_message') <> '{}'::jsonb
     or v_snapshot->>'schema_version' <>
       'correction-customer-publication-v1'
     or v_snapshot->>'cover_message' <> pg_catalog.btrim(
       v_snapshot->>'cover_message'
     )
     or pg_catalog.char_length(v_snapshot->>'cover_message')
       not between 1 and 1000
     or v_snapshot->>'cover_message' !~ '[[:alnum:]]'
     or pg_catalog.strpos(v_snapshot->>'cover_message', chr(13)) > 0
     or pg_catalog.regexp_replace(
       v_snapshot->>'cover_message', chr(10), '', 'g'
     ) ~ '[[:cntrl:]]' then return pg_catalog.jsonb_build_object(
       'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
     );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'snapshot', v_snapshot,
    'snapshot_sha256', pg_catalog.encode(
      extensions.digest(v_snapshot::text, 'sha256'), 'hex'
    )
  );
end;
$$;

create function public.app_customer_correction_safe_projection_v1(
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
  if v_read->>'ok' <> 'true' or v_read->'handoff' is null then return v_read;
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

create function public.app_customer_correction_handoff_read_v7(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select public.app_customer_correction_safe_projection_v1(
    p_auth_user_id, p_case_ref
  )
$$;

create function public.app_customer_correction_document_handoff_guard_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_replacement_target_ref text default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_read jsonb;
  v_target jsonb;
begin
  v_read := public.app_customer_correction_safe_projection_v1(
    p_auth_user_id, p_case_ref
  );
  if v_read->>'ok' <> 'true' then return v_read; end if;
  if v_read #>> '{handoff,bundle_version}' <>
       'evidence-review-correction-handoff-bundle-v4' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'document_handoff_required'
    );
  end if;
  if p_replacement_target_ref is not null then
    select item.value->'replacement_target' into v_target
    from pg_catalog.jsonb_array_elements(
      v_read #> '{handoff,items}'
    ) item(value)
    where item.value #>> '{replacement_target,replacement_target_ref}' =
      p_replacement_target_ref
    limit 1;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 404,
        'code', 'replacement_target_not_available'
      );
    end if;
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'status', 200);
end;
$$;

create function public.app_customer_correction_replacement_upload_issue_v2(
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
  v_guard jsonb;
begin
  v_guard := public.app_customer_correction_document_handoff_guard_v1(
    p_auth_user_id, p_case_ref, p_replacement_target_ref
  );
  if v_guard->>'ok' <> 'true' then return v_guard; end if;
  return public.app_customer_correction_replacement_upload_issue_v1(
    p_auth_user_id, p_case_ref, p_replacement_target_ref,
    p_original_filename, p_declared_mime_type, p_declared_size_bytes,
    p_upload_expires_at, p_request_id, p_idempotency_key,
    p_payload_sha256, p_idempotency_expires_at, p_environment
  );
end;
$$;

create function public.app_customer_correction_replacement_upload_resolve_v2(
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
  v_guard jsonb;
begin
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
  v_guard := public.app_customer_correction_document_handoff_guard_v1(
    p_auth_user_id, p_case_ref, v_upload.replacement_target_ref
  );
  if v_guard->>'ok' <> 'true' then return v_guard; end if;
  return public.app_customer_correction_replacement_upload_resolve_v1(
    p_auth_user_id, p_case_ref, p_upload_ref
  );
end;
$$;

create function public.app_customer_correction_replacement_upload_confirm_v2(
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
  v_resolved jsonb;
begin
  v_resolved := public.app_customer_correction_replacement_upload_resolve_v2(
    p_auth_user_id, p_case_ref, p_upload_ref
  );
  if v_resolved->>'ok' <> 'true' then return v_resolved; end if;
  return public.app_customer_correction_replacement_upload_confirm_v1(
    p_auth_user_id, p_case_ref, p_upload_ref, p_actual_size_bytes,
    p_detected_mime_type, p_server_sha256, p_failure_code, p_request_id,
    p_idempotency_key, p_payload_sha256, p_idempotency_expires_at,
    p_environment
  );
end;
$$;

create function public.app_customer_correction_replacement_withdraw_v2(
  p_auth_user_id uuid,
  p_case_ref text,
  p_replacement_target_ref text,
  p_candidate_ref text,
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
  v_guard jsonb;
begin
  v_guard := public.app_customer_correction_document_handoff_guard_v1(
    p_auth_user_id, p_case_ref, p_replacement_target_ref
  );
  if v_guard->>'ok' <> 'true' then return v_guard; end if;
  return public.app_customer_correction_replacement_withdraw_v1(
    p_auth_user_id, p_case_ref, p_replacement_target_ref, p_candidate_ref,
    p_request_id, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, p_environment
  );
end;
$$;

revoke all on function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) from service_role;
revoke all on function public.app_evidence_review_correction_publish_v2(
  uuid, text, uuid, text, text, text, text, timestamptz
) from service_role;
revoke all on function public.app_evidence_review_correction_supersede_v1(
  uuid, text, text, jsonb, text, text, text, text, text, timestamptz
) from service_role;
revoke all on function public.app_evidence_review_correction_supersede_v2(
  uuid, text, text, jsonb, text, text, text, text, text, text, timestamptz
) from service_role;
revoke all on function public.app_customer_correction_challenge_issue_v1(
  uuid, text, jsonb, text, text, timestamptz, text, text, text, text, text,
  text
) from service_role;
revoke all on function public.app_customer_correction_challenge_issue_v2(
  uuid, text, jsonb, text, text, timestamptz, text, text, text, text, text,
  text
) from service_role;
revoke all on function public.app_customer_correction_challenge_issue_v3(
  uuid, text, jsonb, text, text, text, timestamptz, text, text, text, text,
  text, text
) from service_role;
revoke all on function public.app_customer_correction_challenge_issue_v4(
  uuid, text, jsonb, jsonb, text, text, text, timestamptz, text, text, text,
  text, text, text
) from service_role;
revoke all on function public.app_customer_correction_finalize_v1(
  uuid, text, uuid, text, text, text, text, text, text, text, text
) from service_role;
revoke all on function public.app_customer_correction_finalize_v2(
  uuid, text, uuid, text, text, text, text, text, text, text
) from service_role;
revoke all on function public.app_customer_correction_finalize_v3(
  uuid, text, uuid, text, text, text, text, text, text, text
) from service_role;
revoke all on function public.app_customer_correction_replacement_upload_issue_v1(
  uuid, text, text, text, text, bigint, timestamptz, text, text, text,
  timestamptz, text
) from service_role;
revoke all on function public.app_customer_correction_replacement_upload_resolve_v1(
  uuid, text, text
) from service_role;
revoke all on function public.app_customer_correction_replacement_upload_confirm_v1(
  uuid, text, text, bigint, text, text, text, text, text, text,
  timestamptz, text
) from service_role;
revoke all on function public.app_customer_correction_replacement_withdraw_v1(
  uuid, text, text, text, text, text, text, timestamptz, text
) from service_role;

revoke all on function public.app_customer_correction_primary_document_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_bundle_v4_valid_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_source_relationship_v2(
  text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_fact_resolution_prepare_v2(
  uuid, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_safe_projection_v1(
  uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_document_handoff_guard_v1(
  uuid, text, text
) from public, anon, authenticated, service_role;

revoke all on function public.app_evidence_review_correction_publish_v3(
  uuid, text, uuid, jsonb, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.app_evidence_review_correction_publish_v3(
  uuid, text, uuid, jsonb, text, text, text, text, timestamptz
) to service_role;
revoke all on function public.app_evidence_review_correction_supersede_v3(
  uuid, text, text, jsonb, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.app_evidence_review_correction_supersede_v3(
  uuid, text, text, jsonb, text, text, text, text, text, text, timestamptz
) to service_role;
revoke all on function public.app_customer_correction_challenge_issue_v5(
  uuid, text, jsonb, jsonb, text, text, text, timestamptz, text, text, text,
  text, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_challenge_issue_v5(
  uuid, text, jsonb, jsonb, text, text, text, timestamptz, text, text, text,
  text, text, text
) to service_role;
revoke all on function public.app_customer_correction_finalize_v4(
  uuid, text, uuid, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_finalize_v4(
  uuid, text, uuid, text, text, text, text, text, text, text
) to service_role;
revoke all on function
  public.app_customer_correction_submission_subject_ref_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_handoff_read_v7(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_handoff_read_v7(
  uuid, text
) to service_role;
revoke all on function public.app_customer_correction_replacement_upload_issue_v2(
  uuid, text, text, text, text, bigint, timestamptz, text, text, text,
  timestamptz, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_replacement_upload_issue_v2(
  uuid, text, text, text, text, bigint, timestamptz, text, text, text,
  timestamptz, text
) to service_role;
revoke all on function public.app_customer_correction_replacement_upload_resolve_v2(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_replacement_upload_resolve_v2(
  uuid, text, text
) to service_role;
revoke all on function public.app_customer_correction_replacement_upload_confirm_v2(
  uuid, text, text, bigint, text, text, text, text, text, text,
  timestamptz, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_replacement_upload_confirm_v2(
  uuid, text, text, bigint, text, text, text, text, text, text,
  timestamptz, text
) to service_role;
revoke all on function public.app_customer_correction_replacement_withdraw_v2(
  uuid, text, text, text, text, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_replacement_withdraw_v2(
  uuid, text, text, text, text, text, text, timestamptz, text
) to service_role;

comment on function public.app_customer_correction_handoff_read_v7(uuid, text)
  is 'R7 customer-safe correction read with document-first v4 projections.';

commit;
